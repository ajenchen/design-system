#!/usr/bin/env node
// Compute Claude Code infra best-practice score(0-100)across 8 dimensions.
// Output: JSON line for tracking over time + human readable score.
//
// Used by stop_meta_self_audit.sh to detect regression auto-inject self-improve prompt.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function safeWc(file) {
  try { return parseInt(execSync(`wc -l < "${file}"`).toString().trim()); }
  catch { return 0; }
}

function listFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => pattern.test(f));
}

const dimensions = [];

// === D1: CLAUDE.md size(Anthropic target ≤ 200,本 commit 對齊外部 benchmark)===
// Anthropic best-practices: "target under 200 lines" + warns "Bloated CLAUDE.md
// causes Claude to ignore actual instructions". Updated formula:
//   ≤ 200 → 100,201-400 → 70,401-600 → 40,> 600 → 10
{
  const lines = safeWc('CLAUDE.md');
  const score = lines <= 200 ? 100 : lines <= 400 ? 70 : lines <= 600 ? 40 : 10;
  dimensions.push({ dim: 'D1 CLAUDE.md size(Anthropic target ≤ 200)', value: `${lines} lines`, score, max: 100 });
}

// === D2: Skill SKILL.md size discipline ===
// Per CLAUDE.md `# 資訊治理 canonical`:
//   - Target ≤ 250(ideal)
//   - Transition cap 400(acceptable in transition)
//   - Over 400 = real violation
// Score = average per-skill where ≤250→100 / 250-400→90(transition) / >400→30
{
  const skillDirs = readdirSync('.claude/skills').filter(d => statSync(join('.claude/skills', d)).isDirectory());
  let totalSkills = 0, sumScore = 0, overBudget = 0, overCap = 0;
  for (const s of skillDirs) {
    const f = join('.claude/skills', s, 'SKILL.md');
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
  const memDir = '/Users/chenqiren/.claude/projects/-Users-chenqiren-Library-CloudStorage-GoogleDrive-qijenchen-gmail-com--------my-project/memory';
  const entries = existsSync(memDir) ? readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length : 0;
  const score = entries <= 15 ? 100 : entries <= 20 ? 80 : entries <= 30 ? 50 : 20;
  dimensions.push({ dim: 'D3 Memory entries', value: `${entries}/20`, score, max: 100 });
}

// === D4: Hook test coverage ===
{
  const hooks = listFiles('.claude/hooks', /\.sh$/).filter(f => f !== '_log-fire.sh');
  const tests = listFiles('.claude/hooks/tests', /^test_.*\.sh$/);
  const ratio = hooks.length === 0 ? 0 : tests.length / hooks.length;
  const score = Math.round(ratio * 100);
  dimensions.push({ dim: 'D4 Hook test coverage', value: `${tests.length}/${hooks.length}`, score, max: 100 });
}

// === D5: CI workflow presence ===
{
  const ciExists = existsSync('.github/workflows/ci.yml');
  const score = ciExists ? 100 : 0;
  dimensions.push({ dim: 'D5 CI workflow', value: ciExists ? 'present' : 'missing', score, max: 100 });
}

// === D6: Self-audit hook presence(stop_self_audit + audit-content-quality)===
{
  const selfAudit = existsSync('.claude/hooks/stop_self_audit.sh');
  const contentAudit = existsSync('scripts/audit-content-quality.mjs');
  const score = (selfAudit ? 50 : 0) + (contentAudit ? 50 : 0);
  dimensions.push({ dim: 'D6 Self-audit mechanisms', value: `${selfAudit ? 'self_audit ✓' : ''} ${contentAudit ? 'content_audit ✓' : ''}`.trim(), score, max: 100 });
}

// === D7: Codify-principle generator skill presence ===
{
  const exists = existsSync('.claude/skills/codify-principle/SKILL.md');
  const score = exists ? 100 : 0;
  dimensions.push({ dim: 'D7 Principle generator skill', value: exists ? 'present' : 'missing', score, max: 100 });
}

// === D8a: Hook count discipline(Anthropic / community benchmark)===
// claude-code-hooks-mastery 13 hooks(comprehensive lifecycle reference)
// Anthropic plugins 0-1 hooks each. Industry typical < 15。
//   ≤ 15 → 100,16-25 → 70,26-35 → 40,> 35 → 10
{
  const hooks = listFiles('.claude/hooks', /\.sh$/).filter(f => f !== '_log-fire.sh');
  const count = hooks.length;
  const score = count <= 15 ? 100 : count <= 25 ? 70 : count <= 35 ? 40 : 10;
  dimensions.push({ dim: 'D8a Hook count(target ≤ 15)', value: `${count} hooks`, score, max: 100 });
}

// === D8b: Subagent presence(Anthropic best-practices: "one of the most powerful tools")===
{
  const agentDir = '.claude/agents';
  const agents = existsSync(agentDir) ? readdirSync(agentDir).filter(f => f.endsWith('.md') && f !== 'README.md') : [];
  const score = agents.length === 0 ? 0 : agents.length <= 5 ? 100 : 80;
  dimensions.push({ dim: 'D8b Subagent presence', value: `${agents.length} agents`, score, max: 100 });
}

// === D8c: Path-scoped rules(2026 Anthropic recommended primitive)===
{
  const rulesDir = '.claude/rules';
  const rules = existsSync(rulesDir) ? readdirSync(rulesDir).filter(f => f.endsWith('.md')) : [];
  const score = rules.length === 0 ? 0 : rules.length >= 3 ? 100 : 60;
  dimensions.push({ dim: 'D8c Path-scoped rules', value: `${rules.length} rules`, score, max: 100 });
}

// === D9: tsc + storybook build state ===
{
  let tscPass = false;
  try {
    const out = execSync('npx tsc -b 2>&1 | grep -c "error TS" || true').toString().trim();
    tscPass = out === '0';
  } catch {}
  // Don't run storybook build (slow) — just check storybook-static existence as proxy
  const sbStatic = existsSync('storybook-static');
  const score = (tscPass ? 70 : 0) + (sbStatic ? 30 : 0);
  dimensions.push({ dim: 'D9 Build state', value: `tsc ${tscPass ? '✓' : '✗'} / storybook-static ${sbStatic ? '✓' : '✗'}`, score, max: 100 });
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

// Output JSON for tracking
const logPath = '.claude/logs/infra-best-practice-score.jsonl';
try {
  writeFileSync(logPath, JSON.stringify(result) + '\n', { flag: 'a' });
} catch {}

// Human readable output
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\n=== Infra Best-Practice Score: ${finalScore}/100 ===\n`);
  for (const d of dimensions) {
    const bar = '█'.repeat(Math.floor(d.score / 10)) + '░'.repeat(10 - Math.floor(d.score / 10));
    console.log(`  ${bar} ${d.score.toString().padStart(3)}/100 — ${d.dim} (${d.value})`);
  }
  console.log('');
}

// Exit code: 0 if ≥ 80, 1 if regressed
process.exit(finalScore >= 80 ? 0 : 1);
