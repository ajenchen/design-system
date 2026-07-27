#!/usr/bin/env node
// Compute provider-neutral governance infra best-practice score (0-100).
// This command is a pure observer: callers own any opt-in runtime history.
//
// Used by stop_meta_self_audit.sh to detect regression auto-inject self-improve prompt.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const ROOT = resolve(argument('--root') || process.cwd());
const REGISTRY_PATH = resolve(ROOT, 'packages/governance/canonical/providers.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

function repositoryPath(candidate, label) {
  const absolute = resolve(ROOT, candidate)
  const rel = relative(ROOT, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes repository root`)
  }
  return absolute
}

const canonicalRoots = Object.fromEntries(
  Object.entries(registry.canonical.roots).map(([key, value]) => [key, repositoryPath(value, `canonical root ${key}`)]),
)
const registrations = JSON.parse(readFileSync(repositoryPath(registry.canonical.hookRegistrations, 'hook registrations'), 'utf8'))
const registeredHookNames = [...new Set(
  Object.values(registrations.hooks || {}).flatMap((groups) =>
    groups.flatMap((group) => (group.hooks || []).map((item) => item.hook).filter(Boolean))),
)].sort()

function safeWc(file) {
  try {
    const value = readFileSync(resolve(ROOT, file), 'utf8')
    return value ? value.split('\n').length - (value.endsWith('\n') ? 1 : 0) : 0
  }
  catch { return 0; }
}

function listFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => pattern.test(f));
}

const dimensions = [];

// === D1: provider instruction bootstrap size ===
// The registry owns every instruction entry; a new provider changes data, not this scorer.
//   ≤ 200 → 100,201-400 → 70(transition acceptable),401-800 → 40(approaching hard cap),> 800 → 10
{
  const entries = [...new Set(registry.canonical.reservedDiscovery.instructionNames)]
  const lines = entries.reduce((sum, entry) => sum + safeWc(entry), 0)
  const score = lines <= 250 ? 100 : lines <= 400 ? 70 : lines <= 800 ? 40 : 10;
  dimensions.push({ dim: 'D1 registry instruction bootstrap size(target ≤250 / hard cap 800)', value: `${lines} lines across ${entries.length} entries`, score, max: 100 });
}

// === D2: Skill SKILL.md size discipline ===
// Per CLAUDE.md `# 資訊治理 canonical`:
//   - Target ≤ 250(ideal)
//   - Transition cap 400(acceptable in transition)
//   - Over 400 = real violation
// Score = average per-skill where ≤250→100 / 250-400→90(transition) / >400→30
{
  const skillRoot = canonicalRoots.skills
  const skillDirs = existsSync(skillRoot) ? readdirSync(skillRoot).filter(d => statSync(join(skillRoot, d)).isDirectory()) : [];
  let totalSkills = 0, sumScore = 0, overBudget = 0, overCap = 0;
  for (const s of skillDirs) {
    const f = join(skillRoot, s, 'SKILL.md');
    if (existsSync(f)) {
      const l = safeWc(f);
      totalSkills++;
      if (l > 400) { sumScore += 30; overCap++; }
      else if (l > 250) { sumScore += 90; overBudget++; }
      else sumScore += 100;
    }
  }
  const score = totalSkills === 0 ? 0 : Math.round(sumScore / totalSkills);
  dimensions.push({ dim: 'D2 Skill SKILL.md sizes', value: `${overBudget} in transition (250-400) / ${overCap} over cap (>400)`, score, max: 100 });
}

// === D3: Memory entries(target ≤ 20)===
{
  // Repository-owned, provider-neutral memory is authoritative. Claude/Codex
  // discovery caches are disposable projections and must never affect score.
  const memDir = join(ROOT, 'governance', 'memory');
  const entries = existsSync(memDir) ? readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length : 0;
  const score = entries <= 15 ? 100 : entries <= 20 ? 80 : entries <= 30 ? 50 : 20;
  dimensions.push({ dim: 'D3 Memory entries', value: `${entries}/20`, score, max: 100 });
}

// === D4: Hook test coverage ===
{
  const tests = new Set(listFiles(join(canonicalRoots.hooks, 'tests'), /^test_.*\.sh$/));
  const covered = registeredHookNames.filter((hook) => tests.has(`test_${hook.replace(/\.(?:sh|py)$/, '')}.sh`)).length
  const ratio = registeredHookNames.length === 0 ? 0 : covered / registeredHookNames.length;
  const score = Math.round(ratio * 100);
  dimensions.push({ dim: 'D4 Registered-hook direct test coverage', value: `${covered}/${registeredHookNames.length}`, score, max: 100 });
}

// === D5: CI workflow presence ===
{
  const ciExists = existsSync('.github/workflows/ci.yml');
  const score = ciExists ? 100 : 0;
  dimensions.push({ dim: 'D5 CI workflow', value: ciExists ? 'present' : 'missing', score, max: 100 });
}

// === D6: Self-audit hook presence(stop_self_audit + audit-content-quality)===
{
  const selfAudit = existsSync(join(canonicalRoots.hooks, 'stop_self_audit.sh'));
  const contentAudit = existsSync(join(ROOT, 'scripts/audit-content-quality.mjs'));
  const score = (selfAudit ? 50 : 0) + (contentAudit ? 50 : 0);
  dimensions.push({ dim: 'D6 Self-audit mechanisms', value: `${selfAudit ? 'self_audit ✓' : ''} ${contentAudit ? 'content_audit ✓' : ''}`.trim(), score, max: 100 });
}

// === D7: Codify-principle generator skill presence ===
{
  const exists = existsSync(join(canonicalRoots.skills, 'codify-principle/SKILL.md'));
  const score = exists ? 100 : 0;
  dimensions.push({ dim: 'D7 Principle generator skill', value: exists ? 'present' : 'missing', score, max: 100 });
}

// === D8a: Hook count discipline ===
// Bench:claude-code-hooks-mastery 13 / Anthropic plugins 0-1 each
// DS-specific governance project 需更多 enforcement hooks(每 hook = 1 個 real
// bug class 的 mechanical 防線),~30 是 codified governance density 的健康值
// (per provider-neutral bootstrap M14 hard cap 30 + canonical rules/meta-patterns.md M-rule 密度)。
// 2026-05-08 re-calibration(was 26-40 → 50,跟「30 hard cap」M14 一致性 align):
//   ≤ 15 → 100(industry ideal,non-DS-governance projects)
//   16-30 → 85(DS-specific governance acceptable — 每 hook codified per M-rule)
//   31-40 → 65(warning zone — 可能該 prune / consolidate)
//   > 40 → 30(likely bloat — 必跑 /knowledge-prune)
// .sh + .py 都計(`block_prototype_imports.py` 之前漏算 = bug)。
{
  const count = registeredHookNames.length;
  const score = count <= 15 ? 100 : count <= 30 ? 85 : count <= 40 ? 65 : 30;
  dimensions.push({ dim: 'D8a Hook count', value: `${count} hooks`, score, max: 100 });
}

// === D8b: Subagent presence(Anthropic best-practices: "one of the most powerful tools")===
{
  const agentDir = canonicalRoots.contextForkAgents;
  const agents = existsSync(agentDir) ? readdirSync(agentDir).filter(f => f.endsWith('.md') && f !== 'README.md') : [];
  const score = agents.length === 0 ? 0 : agents.length <= 5 ? 100 : 80;
  dimensions.push({ dim: 'D8b Subagent presence', value: `${agents.length} agents`, score, max: 100 });
}

// === D8c: Path-scoped rules(2026 Anthropic recommended primitive)===
{
  const rulesDir = canonicalRoots.rules;
  const rules = existsSync(rulesDir) ? readdirSync(rulesDir).filter(f => f.endsWith('.md')) : [];
  const score = rules.length === 0 ? 0 : rules.length >= 3 ? 100 : 60;
  dimensions.push({ dim: 'D8c Path-scoped rules', value: `${rules.length} rules`, score, max: 100 });
}

// === D9: side-effect-free build readiness ===
{
  const tsc = resolve(ROOT, 'node_modules/.bin/tsc')
  const tscDryRun = existsSync(tsc)
    ? spawnSync(tsc, ['--build', '--dry', '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' }).status === 0
    : false
  const storybookConfig = existsSync(resolve(ROOT, '.storybook/main.ts')) || existsSync(resolve(ROOT, '.storybook/main.js'))
  const score = (tscDryRun ? 70 : 0) + (storybookConfig ? 30 : 0);
  dimensions.push({ dim: 'D9 Side-effect-free build readiness', value: `tsc --build --dry ${tscDryRun ? '✓' : '✗'} / Storybook config ${storybookConfig ? '✓' : '✗'}`, score, max: 100 });
}

// === Aggregate ===
const total = dimensions.reduce((s, d) => s + d.score, 0);
const max = dimensions.reduce((s, d) => s + d.max, 0);
const finalScore = Math.round((total / max) * 100);

const result = {
  ts: new Date().toISOString(),
  finalScore,
  dimensions,
};

// Human readable output
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\n=== Infra Best-Practice Score: ${finalScore}/100 ===\n`);
  for (const d of dimensions) {
    const filled = Math.max(0, Math.min(10, Math.floor(d.score / 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    console.log(`  ${bar} ${d.score.toString().padStart(3)}/100 — ${d.dim} (${d.value})`);
  }
  console.log('');
}

// Exit code: 0 if ≥ 80, 1 if regressed
process.exit(finalScore >= 80 ? 0 : 1);
