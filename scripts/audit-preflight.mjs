#!/usr/bin/env node
/**
 * audit-preflight.mjs — DS audit 全面盤查 preflight(2026-05-15 user directive)
 *
 * Mandate(memory/feedback_audit_preflight_全盤查.md SSOT):
 * - `/design-system-audit --deep` Phase 1 前必先跑本 script,確認 baseline
 * - 輸出 3 件:檔案 enumeration / 設計原則 enumeration / coverage matrix(gap 標記)
 * - 結果存 provider-neutral runtime evidence 供 Phase 1 sub-agent 引用
 *
 * Exit:
 *  0 = preflight 完成 + 無 gap
 *  1 = 有 gap(新原則無 dim cover) — Phase 1 dispatch 前必先補 dim or 撤原則
 *  2 = script fail
 *
 * Usage:
 *   node scripts/audit-preflight.mjs        # 預設輸出 JSON
 *   node scripts/audit-preflight.mjs --verbose
 *   node scripts/audit-preflight.mjs --check # 只 exit code,不 dump JSON
 *   node scripts/audit-preflight.mjs --check --json # 唯讀 machine report(stdout)
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { prepareRuntimeEvidenceFile } from './lib/governance-runtime-evidence.mjs'

const ROOT = process.cwd()
const VERBOSE = process.argv.includes('--verbose')
const CHECK_ONLY = process.argv.includes('--check')
const JSON_OUT = process.argv.includes('--json')
const valueOf = (name) => {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return process.argv[index + 1]
}
const EXPLICIT_EVIDENCE_ROOT = valueOf('--evidence-root') || process.env.GOVERNANCE_EVIDENCE_ROOT || null

// ── 1. 檔案 enumeration ─────────────────────────────────────────────
const dsFiles = globSync('packages/design-system/src/**/*.{tsx,ts,css,md}', { cwd: ROOT })
const fileBuckets = {
  tsx: dsFiles.filter(f => f.endsWith('.tsx') && !f.includes('.stories.') && !f.includes('.anatomy.') && !f.includes('.principles.')),
  storiesShowcase: dsFiles.filter(f => /\.stories\.tsx$/.test(f) && !/(anatomy|principles)\.stories\.tsx$/.test(f)),
  storiesAnatomy: dsFiles.filter(f => /\.anatomy\.stories\.tsx$/.test(f)),
  storiesPrinciples: dsFiles.filter(f => /\.principles\.stories\.tsx$/.test(f)),
  specMd: dsFiles.filter(f => f.endsWith('.spec.md')),
  tokens: dsFiles.filter(f => /\/tokens\//.test(f) && !f.endsWith('.spec.md')),
}

// ── 2. 設計原則 enumeration ─────────────────────────────────────────
// 2.1 M-rules from meta-patterns.md
// 2026-05-18 fix(per codex Phase B audit P0-2):支援兩種 M-rule 表達式 —
//   (a) table-row: `| **M<N>** | ...`(原 pattern,大宗 M1-M33)
//   (b) heading:   `## M<N> ...`(M34 升 heading 型 codify per user gap finding)
// 任一 match 都 abstract 成 `M<N>`,避免 abstract drift hide audit gap。
const CANONICAL = path.join(ROOT, 'packages/design-system/ds-canonical')
const metaPatternsPath = path.join(CANONICAL, 'rules/meta-patterns.md')
const metaContent = fs.existsSync(metaPatternsPath) ? fs.readFileSync(metaPatternsPath, 'utf-8') : ''
const mRulesSet = new Set()
for (const m of metaContent.matchAll(/\|\s*\*\*M(\d+)\*\*\s*\|/g)) mRulesSet.add(`M${m[1]}`)
for (const m of metaContent.matchAll(/^##\s+M(\d+)\b/gm)) mRulesSet.add(`M${m[1]}`)
const mRules = [...mRulesSet].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))

// 2.2 Spec.md traits enumeration
const traitsSet = new Set()
for (const specFile of fileBuckets.specMd) {
  const c = fs.readFileSync(path.join(ROOT, specFile), 'utf-8')
  const match = c.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) continue
  const traitsMatch = match[1].match(/traits:\s*\n((?:\s+-\s+\w+\s*\n)+)/)
  if (!traitsMatch) continue
  const traits = [...traitsMatch[1].matchAll(/-\s+(\w+)/g)].map(m => m[1])
  traits.forEach(t => traitsSet.add(t))
}

// 2.3 Hook invariants
const hookFiles = globSync('packages/design-system/ds-canonical/hooks/check_*.sh', { cwd: ROOT })
const hookInvariants = hookFiles.map(f => path.basename(f, '.sh').replace('check_', ''))

// 2.4 Rules
const ruleFiles = globSync('packages/design-system/ds-canonical/rules/*.md', { cwd: ROOT })

// ── 3. Audit dim coverage matrix ─────────────────────────────────────
const auditSkillPath = path.join(CANONICAL, 'skills/design-system-audit/SKILL.md')
const auditSkillContent = fs.existsSync(auditSkillPath) ? fs.readFileSync(auditSkillPath, 'utf-8') : ''
const dimRows = [...auditSkillContent.matchAll(/^\|\s*(\d+)\s*\|\s*\*\*([^*]+)\*\*/gm)].map(m => ({
  num: parseInt(m[1]),
  title: m[2].trim(),
}))

// 2026-05-15 Fix 1(per sub-agent a9e6d53c audit + user mission「全面涵蓋」):
// 原 heuristic `d.title.toLowerCase().includes(p.name.toLowerCase())` 對 M-rule
// 失效(M1/M2 substring 永遠不在 dim title)→ 86% false-positive gap。
// 改 explicit map SSOT:`packages/design-system/ds-canonical/references/principle-dim-map.json`。
const MAP_PATH = path.join(CANONICAL, 'references/principle-dim-map.json')
const principleDimMap = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8')) : {}

const coverageMap = {}
const gaps = []
const realGapsByType = { 'meta-pattern': [], 'spec-trait': [], 'hook': [] }

const lookup = (source, name) => {
  if (source === 'meta-pattern') return principleDimMap.mRules?.[name]?.dims || null
  if (source === 'spec-trait') return principleDimMap.traits?.[name]?.dims || null
  if (source === 'hook') return principleDimMap.hooks?.[name]?.dims || null
  return null
}

const allPrinciples = [
  ...mRules.map(m => ({ source: 'meta-pattern', name: m })),
  ...[...traitsSet].map(t => ({ source: 'spec-trait', name: t })),
  ...hookInvariants.map(h => ({ source: 'hook', name: h })),
]

for (const p of allPrinciples) {
  const dims = lookup(p.source, p.name)
  if (dims === null) {
    // Not in map — 新原則 unmapped(real gap,需 user 補 entry)
    coverageMap[`${p.source}:${p.name}`] = 'UNMAPPED'
    gaps.push(`${p.source}:${p.name} (unmapped — 必補 principle-dim-map.json entry)`)
    realGapsByType[p.source].push(p.name)
  } else if (dims.length === 0) {
    // Mapped to []  — explicit "governance-only / runtime discipline / 考慮加 dim"
    // 不算 real gap(map 已 ack);但列 to-be-added candidate
    coverageMap[`${p.source}:${p.name}`] = []
  } else {
    coverageMap[`${p.source}:${p.name}`] = dims.map(d => `Dim ${d}`)
  }
}

// ── Output ───────────────────────────────────────────────────────────
const report = {
  schemaVersion: 1,
  evidenceKind: 'audit-preflight',
  ts: new Date().toISOString(),
  filesCount: {
    total: dsFiles.length,
    componentTsx: fileBuckets.tsx.length,
    storiesShowcase: fileBuckets.storiesShowcase.length,
    storiesAnatomy: fileBuckets.storiesAnatomy.length,
    storiesPrinciples: fileBuckets.storiesPrinciples.length,
    specMd: fileBuckets.specMd.length,
    tokens: fileBuckets.tokens.length,
  },
  principles: {
    mRules: mRules.length,
    specTraits: traitsSet.size,
    hookInvariants: hookInvariants.length,
    rules: ruleFiles.length,
    total: allPrinciples.length,
  },
  auditDims: dimRows.length,
  coverageGaps: gaps.length,
  gaps,
  coverageMap: VERBOSE ? coverageMap : undefined,
}

// `--check` is byte-for-byte read-only. Machine consumers request the report from this exact run
// with `--json`; they never read a dated stale report from a prior run.
const date = new Date().toISOString().slice(0, 10)
if (!CHECK_ONLY) {
  const logPath = prepareRuntimeEvidenceFile({
    repoRoot: ROOT,
    explicitRoot: EXPLICIT_EVIDENCE_ROOT,
    relativePath: `audit/preflight/audit-preflight-${date}.json`,
  })
  const logsDir = path.dirname(logPath)
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const temporary = `${logPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, logPath)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }

  if (!JSON_OUT) {
    console.log('=== Audit Preflight Report ===')
    console.log(`Files total: ${report.filesCount.total}`)
    console.log(`  - component tsx: ${report.filesCount.componentTsx}`)
    console.log(`  - showcase stories: ${report.filesCount.storiesShowcase}`)
    console.log(`  - anatomy stories: ${report.filesCount.storiesAnatomy}`)
    console.log(`  - principles stories: ${report.filesCount.storiesPrinciples}`)
    console.log(`  - spec.md: ${report.filesCount.specMd}`)
    console.log('')
    console.log(`Principles: M-rules ${report.principles.mRules} / traits ${report.principles.specTraits} / hooks ${report.principles.hookInvariants}`)
    console.log(`Audit dims: ${report.auditDims}`)
    console.log(`Coverage gaps: ${gaps.length}`)
    if (gaps.length) {
      console.log('')
      console.log('⚠️  Gaps(原則無對應 audit dim):')
      gaps.slice(0, 20).forEach(g => console.log(`  - ${g}`))
      if (gaps.length > 20) console.log(`  ... ${gaps.length - 20} more`)
    }
    console.log('')
    console.log(`Log: ${logPath}`)
  }
}

if (JSON_OUT) process.stdout.write(`${JSON.stringify(report)}\n`)

process.exit(gaps.length > 0 ? 1 : 0)
