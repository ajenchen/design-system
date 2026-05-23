#!/usr/bin/env node
/**
 * sync-governance-counters.mjs — Dynamic counter source for governance metrics
 *
 * 2026-05-18 D6 codify(per autonomous batch sub-agent 3 finding + codex P0-3):
 * Hardcoded counters across CLAUDE.md / SKILL.md / hook caps / audit prompts drift.
 * This script counts actual artifacts + outputs a JSON source-of-truth for both
 * audits & docs to reference instead of hardcoded N values.
 *
 * Counts:
 *   - hooks:     `.claude/hooks/{*.sh,*.py}` excluding retired/tests/_internal
 *   - mRules:    `.claude/rules/meta-patterns.md` table rows + `## M<N>` headings
 *   - auditDims: `.claude/skills/design-system-audit/SKILL.md` numbered table rows
 *   - traits:    `*.spec.md` frontmatter `traits:` enumeration
 *
 * Output: `.claude/logs/governance-counters.json`
 *
 * Usage:
 *   node scripts/sync-governance-counters.mjs            # write log + console
 *   node scripts/sync-governance-counters.mjs --check    # exit 1 if hardcoded drift detected
 *   node scripts/sync-governance-counters.mjs --quiet    # silent unless drift
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const QUIET = process.argv.includes('--quiet')

// ── Counts ───────────────────────────────────────────────────────────

// 1) Hooks(對齊 session_start_governance_check.sh:168-170 邏輯)
const hookFiles = globSync('.claude/hooks/**/*.{sh,py}', { cwd: ROOT })
  .filter(f => !f.includes('/retired/'))
  .filter(f => !f.includes('/tests/'))
  .filter(f => !path.basename(f).startsWith('_'))
const hookCount = hookFiles.length

// 2) M-rules(支援 table-row + heading 兩種,對齊 audit-preflight.mjs P0-2 fix)
const metaPath = path.join(ROOT, '.claude/rules/meta-patterns.md')
const metaContent = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf-8') : ''
const mRuleSet = new Set()
for (const m of metaContent.matchAll(/\|\s*\*\*M(\d+)\*\*\s*\|/g)) mRuleSet.add(parseInt(m[1]))
for (const m of metaContent.matchAll(/^##\s+M(\d+)\b/gm)) mRuleSet.add(parseInt(m[1]))
const mRules = [...mRuleSet].sort((a, b) => a - b)
const mRuleCount = mRules.length

// 3) Audit dims(讀 SKILL.md `## The N audit dimensions` table,grep numbered rows)
const skillPath = path.join(ROOT, '.claude/skills/design-system-audit/SKILL.md')
const skillContent = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf-8') : ''
const dimRows = [...skillContent.matchAll(/^\|\s*(\d+)\s*\|\s*\*\*([^*]+)\*\*/gm)]
const dimNums = dimRows.map(m => parseInt(m[1]))
const dimCount = dimNums.length
const dimMin = dimNums.length ? Math.min(...dimNums) : 0
const dimMax = dimNums.length ? Math.max(...dimNums) : 0

// 4) Spec traits(frontmatter traits enumeration)
const specFiles = globSync('packages/design-system/src/**/*.spec.md', { cwd: ROOT })
const traitSet = new Set()
for (const f of specFiles) {
  const c = fs.readFileSync(path.join(ROOT, f), 'utf-8')
  const fm = c.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) continue
  const tr = fm[1].match(/traits:\s*\n((?:\s+-\s+\w+\s*\n)+)/)
  if (!tr) continue
  for (const m of tr[1].matchAll(/-\s+(\w+)/g)) traitSet.add(m[1])
}
const traitCount = traitSet.size

// ── Drift detection (against well-known hardcoded SSOT lines) ─────────
// SSOT canonical reference points(每加新 SSOT-pointer-hardcode 必加 entry):
const drifts = []

// session_start_governance_check.sh:173 hard cap
const sessStartPath = path.join(ROOT, '.claude/hooks/session_start_governance_check.sh')
if (fs.existsSync(sessStartPath)) {
  const c = fs.readFileSync(sessStartPath, 'utf-8')
  const m = c.match(/HOOK_COUNT"\s*-gt\s*(\d+)/)
  if (m) {
    const cap = parseInt(m[1])
    if (hookCount > cap) drifts.push(`session_start_governance_check.sh hard cap ${cap} < actual ${hookCount}`)
  }
}

// CLAUDE.md hooks-text (loose: extract "Hooks **N soft / M hard**")
const claudeMdPath = path.join(ROOT, 'CLAUDE.md')
if (fs.existsSync(claudeMdPath)) {
  const c = fs.readFileSync(claudeMdPath, 'utf-8')
  const m = c.match(/Hooks\s+\*\*(\d+)\s+soft\s+\/\s+(\d+)\s+hard\*\*/)
  if (m) {
    const claudeHard = parseInt(m[2])
    if (hookCount > claudeHard) drifts.push(`CLAUDE.md hard cap ${claudeHard} < actual ${hookCount}`)
  }
}

// SKILL.md "The N audit dimensions" header
const skillDimHeaderMatch = skillContent.match(/^##\s+The\s+(\d+)\s+audit\s+dimensions/m)
if (skillDimHeaderMatch) {
  const declared = parseInt(skillDimHeaderMatch[1])
  if (declared !== dimCount) drifts.push(`SKILL.md "The ${declared} audit dimensions" != actual table rows ${dimCount}`)
}

// 2026-05-23 codex 抓 detector 漏 title pattern `# Design System Audit (N dimensions, ...)`:
// 廣 capture 任何 SKILL.md / hook / spec.md 含「N dimensions」/「N audit dims」/「N M-rules」 hardcoded stale
const titlePattern = /^#\s+Design System Audit\s*\((\d+)\s+dimensions/m
const titleMatch = skillContent.match(titlePattern)
if (titleMatch) {
  const declared = parseInt(titleMatch[1])
  if (declared !== dimCount) drifts.push(`SKILL.md title "${declared} dimensions" != actual ${dimCount}`)
}

// Hook session_start text drift(per codex finding 2026-05-23):
const sessStartContent = fs.existsSync(sessStartPath) ? fs.readFileSync(sessStartPath, 'utf-8') : ''
for (const m of sessStartContent.matchAll(/(\d+)\s+audit\s+dims/g)) {
  const declared = parseInt(m[1])
  if (declared !== dimCount) drifts.push(`session_start_governance_check.sh text "${m[0]}" != actual ${dimCount}`)
}
for (const m of sessStartContent.matchAll(/(\d+)\s+active\s+M-rules/g)) {
  const declared = parseInt(m[1])
  if (declared !== mRuleCount) drifts.push(`session_start_governance_check.sh text "${m[0]}" != actual ${mRuleCount}`)
}

// 2026-05-23 升級:M-rule count text drift 跨多 file
// SSOT pattern:`N active M-rules` 或 `N M-rules`(loose match,排 historical / planning / scratch / tmp)
const mRuleTextFiles = [
  'CLAUDE.md',
  '.claude/rules/README.md',
  '.claude/rules/meta-patterns.md',
  '.claude/skills/codex-collab/references/brief-template.md',
  '.claude/skills/deep-audit-cross-codex/references/phase-a-workflow.md',
  '.claude/skills/deep-audit-cross-codex/references/phase-b-codex-brief.md',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
]
for (const rel of mRuleTextFiles) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) continue
  const c = fs.readFileSync(p, 'utf-8')
  const matches = [...c.matchAll(/(\d+)\s+(?:active\s+)?M-rules?/g)]
  for (const m of matches) {
    const declared = parseInt(m[1])
    if (declared !== mRuleCount) {
      drifts.push(`${rel} states "${m[0]}" but actual = ${mRuleCount}`)
    }
  }
}

// 2026-05-23:npm scope leftover detection(qijenchen SSOT — your-org 應 0 references)
const scopeCheckRoots = ['packages', 'template', '.claude', '.claude-plugin', '.github', 'scripts']
const scopeLeftovers = []
for (const root of scopeCheckRoots) {
  if (!fs.existsSync(path.join(ROOT, root))) continue
  const files = globSync(`${root}/**/*.{json,md,ts,tsx,mjs,yml,yaml}`, { cwd: ROOT })
  for (const f of files) {
    if (f.includes('node_modules/') || f.includes('storybook-static/') || f.includes('/dist/') || f.includes('.claude/planning/') || f.includes('.claude/scratch/') || f.includes('.claude/tmp/')) continue
    if (f === 'scripts/sync-governance-counters.mjs') continue // self-skip drift detector references
    if (f.includes('.claude/logs/')) continue // self-skip log output (contains drift report text)
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8')
    if (/@your-org\//.test(c) || /your-org\b/.test(c)) {
      scopeLeftovers.push(f)
    }
  }
}
if (scopeLeftovers.length) {
  drifts.push(`@qijenchen scope drift — your-org leftover in ${scopeLeftovers.length} file(s):\n  ${scopeLeftovers.join('\n  ')}`)
}

// 2026-05-23:Plugin manifest consistency (.claude-plugin/plugin.json + marketplace.json)
const pluginJsonPath = path.join(ROOT, '.claude-plugin/plugin.json')
const marketplaceJsonPath = path.join(ROOT, '.claude-plugin/marketplace.json')
if (fs.existsSync(pluginJsonPath) && fs.existsSync(marketplaceJsonPath)) {
  try {
    const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'))
    const market = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf-8'))
    const marketPlugin = market.plugins?.find(p => p.name === plugin.name)
    if (!marketPlugin) {
      drifts.push(`marketplace.json plugins[] missing entry for "${plugin.name}"`)
    } else if (marketPlugin.version !== plugin.version) {
      drifts.push(`plugin.json version "${plugin.version}" != marketplace.json plugins[].version "${marketPlugin.version}"`)
    }
  } catch (e) {
    drifts.push(`Plugin manifest JSON parse error: ${e.message}`)
  }
}

// 2026-05-23:npm workspace package version consistency vs root changeset
const rootPkgPath = path.join(ROOT, 'package.json')
const dsPkgPath = path.join(ROOT, 'packages/design-system/package.json')
const sbPkgPath = path.join(ROOT, 'packages/storybook-config/package.json')
if (fs.existsSync(dsPkgPath) && fs.existsSync(sbPkgPath)) {
  try {
    const dsPkg = JSON.parse(fs.readFileSync(dsPkgPath, 'utf-8'))
    const sbPkg = JSON.parse(fs.readFileSync(sbPkgPath, 'utf-8'))
    if (dsPkg.name !== '@qijenchen/design-system') {
      drifts.push(`packages/design-system/package.json name="${dsPkg.name}" != "@qijenchen/design-system"`)
    }
    if (sbPkg.name !== '@qijenchen/storybook-config') {
      drifts.push(`packages/storybook-config/package.json name="${sbPkg.name}" != "@qijenchen/storybook-config"`)
    }
  } catch (e) {
    drifts.push(`Package JSON parse error: ${e.message}`)
  }
}

// ── Output ───────────────────────────────────────────────────────────

const report = {
  ts: new Date().toISOString(),
  counts: {
    hooks: hookCount,
    mRules: mRuleCount,
    auditDims: dimCount,
    auditDimMin: dimMin,
    auditDimMax: dimMax,
    specTraits: traitCount,
  },
  mRulesList: mRules.map(n => `M${n}`),
  hookFiles: hookFiles.sort(),
  drifts,
}

const logsDir = path.join(ROOT, '.claude/logs')
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
const outPath = path.join(logsDir, 'governance-counters.json')
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

if (!QUIET || drifts.length) {
  console.log('=== Governance Counters ===')
  console.log(`Hooks:       ${hookCount}`)
  console.log(`M-rules:     ${mRuleCount}(${report.mRulesList.join(', ')})`)
  console.log(`Audit dims:  ${dimCount}(range ${dimMin}-${dimMax})`)
  console.log(`Spec traits: ${traitCount}`)
  console.log('')
  if (drifts.length) {
    console.log('⚠️  Hardcoded drift detected:')
    drifts.forEach(d => console.log(`  - ${d}`))
  } else {
    console.log('OK no hardcoded drift detected.')
  }
  console.log('')
  console.log(`Log: ${outPath}`)
}

if (CHECK && drifts.length) process.exit(1)
process.exit(0)
