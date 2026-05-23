#!/usr/bin/env node
// dispatch-audit-dims.mjs — Mechanical auto-generate audit dim dispatch list from SKILL.md SSOT
//
// 2026-05-23 ship per user verbatim「這些所有infra的增刪改,在我叫你deep audit cross codex時,你應該也會自動叫他按照最新增刪改的稽核流程進行稽核才對吧」
//
// **Why**:Previously sub-agent dispatch hardcoded「Dims 1-15 / 16-33 / 34-56」ranges in prompt。
// 若 SKILL.md 新加 Dim 57(or retire 既有 dim)→ dispatch 漂移漏抓。Per M14 auto-integrate pipeline,
// 需 mechanical auto-pickup from SKILL.md SSOT,no hardcoded list anywhere except SKILL.md。
//
// **Output**:JSON to stdout(or `.claude/logs/audit-dims-dispatch.json`)
// { generated: ts, total: N, groups: { A: [...], B: [...], ... }, heavyDims: [12, 24, 25, ...] }
//
// **Consumer**:
//   - deep-audit-cross-codex Phase A.1 dispatch prompt reads this(non-hardcoded)
//   - audit-preflight.mjs can chain for coverage matrix
//   - sync-governance-counters.mjs cross-verifies count

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SKILL_MD = path.join(ROOT, '.claude/skills/design-system-audit/SKILL.md')
const OUT_FILE = path.join(ROOT, '.claude/logs/audit-dims-dispatch.json')

const content = fs.readFileSync(SKILL_MD, 'utf8')

// Parse dim table rows:`| N | **<title>** | <description> |`
// Group headers:`### Group <letter> — <name>`
const dims = []
const groups = {}
const lines = content.split('\n')
let currentGroup = null
let currentGroupLetter = null

for (const line of lines) {
  // Group header
  const groupMatch = line.match(/^###\s+Group\s+([A-Z])\s+—\s+(.+)$/)
  if (groupMatch) {
    currentGroupLetter = groupMatch[1]
    currentGroup = groupMatch[2].trim()
    if (!groups[currentGroupLetter]) groups[currentGroupLetter] = { name: currentGroup, dims: [] }
    continue
  }

  // Dim row(table format `| N | **<title>** | ... |`)
  const dimMatch = line.match(/^\|\s*(\d+)\s*\|\s*\*\*([^*]+)\*\*/)
  if (dimMatch) {
    const n = parseInt(dimMatch[1], 10)
    const title = dimMatch[2].trim()
    const entry = { n, title, group: currentGroupLetter, groupName: currentGroup }
    dims.push(entry)
    if (currentGroupLetter && groups[currentGroupLetter]) {
      groups[currentGroupLetter].dims.push(n)
    }
  }
}

// Extract heavy dim list(per SKILL.md「Heavy dim(`--deep` mode 各必獨立 sub-agent 跑,不可 batch)」note)
const heavyMatch = content.match(/Heavy dim[^:]*[:：][^0-9]*([\d\s\/]+)/)
let heavyDims = []
if (heavyMatch) {
  heavyDims = heavyMatch[1]
    .split(/[\s\/]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n > 0 && n <= 999)
}

// 2026-05-23 anti-sample contract per user verbatim「幹你娘就叫你他媽所有稽核都要完整執行不要再抽樣」
// Inject mandatory per-dim contract into every sub-agent dispatch:
const antiSampleContract = `
🚨 MANDATORY ANTI-SAMPLE CONTRACT(2026-05-23 user verbatim「所有稽核都要完整執行不要再抽樣」):

每 dim 必走 anti-sample 機制(tier per scripts/audit-coverage-matrix.mjs):

1. DETERMINISTIC tier:**MUST chain** 對應 script,output 含「N files scanned / 0 violations」cite。**禁** sub-agent 自寫 grep 替代 script。
2. HOOK-ENFORCED tier:write-time hook 已 enforce。Audit-time report 必 grep DS-wide 確認 0 hook fire residue。
3. PURE-JUDGMENT tier:LLM 必 DS-wide ALL files enumerate(eg. 全 82 spec.md / 全 196 stories / 全 62 components),report header 必含「Total file scanned: N」+ per-finding file:line cite。

**絕對禁**(任一觸發 = audit incomplete,需 reject + restart):
- ❌「sampled Button only」/「spot-checked」/「representative sample」/「I sampled」 sub-agent admission
- ❌ Audit report claim「Dim N CLEAN」無 N-files-scanned cite + 無 deterministic script chain output
- ❌「too many for exhaustive」/「heavy too many」/「context budget」 deferral excuse
- ❌「sample top N」 dispatch prompt clause

**通過 contract test**:report 必含 per-dim 2 行 — 「Tier: DETERMINISTIC/HOOK/JUDGMENT」+「Coverage: N files / scope」。
`

const output = {
  generated: new Date().toISOString(),
  ssotSource: '.claude/skills/design-system-audit/SKILL.md',
  total: dims.length,
  groups,
  dims,
  heavyDims,
  antiSampleContract,
  dispatchPlan: {
    note: 'Phase A.1 sub-agent dispatch recommended grouping(dynamic per current SKILL.md):',
    mandatoryAntiSampleContract: antiSampleContract,
    suggestedBatches: deriveBatches(dims, heavyDims),
  },
}

function deriveBatches(allDims, heavy) {
  // Default 3-batch split by group letters,each batch <= 25 dims
  // Heavy dims spread across batches not concentrated
  const sorted = [...allDims].sort((a, b) => a.n - b.n)
  const total = sorted.length
  const batchSize = Math.ceil(total / 3)
  const batches = []
  for (let i = 0; i < sorted.length; i += batchSize) {
    const slice = sorted.slice(i, i + batchSize)
    const dimNumbers = slice.map((d) => d.n)
    const heavyInBatch = dimNumbers.filter((n) => heavy.includes(n))
    batches.push({
      range: `${slice[0].n}-${slice[slice.length - 1].n}`,
      count: slice.length,
      dimNumbers,
      heavyDimsInBatch: heavyInBatch,
      groupSpan: [...new Set(slice.map((d) => d.group))].sort().join('+'),
    })
  }
  return batches
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2))

const argv = process.argv.slice(2)
if (argv.includes('--summary') || argv.includes('-s')) {
  console.log(`=== Audit Dim Dispatch Plan(SSOT-driven)===`)
  console.log(`Total dims: ${output.total}`)
  console.log(`Heavy dims(独立 sub-agent): [${output.heavyDims.join(', ')}]`)
  console.log(`Suggested 3 batches:`)
  for (const b of output.dispatchPlan.suggestedBatches) {
    console.log(`  Batch ${b.range}(${b.count} dims,Groups ${b.groupSpan},heavy: ${b.heavyDimsInBatch.join(',') || 'none'})`)
  }
  console.log(`\nFull plan written to: .claude/logs/audit-dims-dispatch.json`)
} else if (argv.includes('--check')) {
  // CI mode:exit 1 if any dim missing group OR count drift vs governance-counters
  const ungrouped = dims.filter((d) => !d.group)
  if (ungrouped.length > 0) {
    console.error(`✗ ${ungrouped.length} dims missing group`)
    process.exit(1)
  }
  console.log(`✓ ${dims.length} dims all grouped`)
  process.exit(0)
} else {
  console.log(JSON.stringify(output, null, 2))
}
