#!/usr/bin/env node
// meta-test for category-classification-invariant — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// gate 檢查三訊號一致(folder / storybook title / frontmatter isInternal)。
// 注入手法:把 components/Alert story title 的 category 段從 Components 改成 Patterns
//   → fromTitle=pattern 但 resolveCategory=component(folder=components + 無 isInternal)
//   → Invariant 1「title 反映 category 必 === resolveCategory」被打破 → gate exit 1。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/category-classification-invariant.mjs'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(gate exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
const target = 'packages/design-system/src/components/Alert/alert.stories.tsx'
const orig = readFileSync(target, 'utf8')
const NEEDLE = 'Design System/Components/Alert/'
const MUTATED = 'Design System/Patterns/Alert/'
if (!orig.includes(NEEDLE)) { console.error(`✗ 目標檔找不到 title 段 [${NEEDLE}] — 注入基礎失效`); process.exit(1) }
try {
  writeFileSync(target, orig.replace(NEEDLE, MUTATED))
  const code = run()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) public component 的 main story 移除 Autodocs → 必 FAIL → 還原
const AUTODOCS = "  tags: ['autodocs'],\n"
if (!orig.includes(AUTODOCS)) { console.error('✗ 目標檔缺 Autodocs anchor — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(target, orig.replace(AUTODOCS, ''))
  const code = run()
  if (code === 0) { console.error('✗ 移除 Autodocs 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ Autodocs policy drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 4) shared Storybook sidebar 順序背離 matrix → 必 FAIL → 還原
const previewTarget = 'packages/storybook-config/preview.tsx'
const previewOrig = readFileSync(previewTarget, 'utf8')
const ORDER_ANCHOR = "          'Patterns',\n          'Internal',"
if (!previewOrig.includes(ORDER_ANCHOR)) { console.error('✗ storySort anchor 漂移 — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(previewTarget, previewOrig.replace(ORDER_ANCHOR, "          'Internal',\n          'Patterns',"))
  const code = run()
  if (code === 0) { console.error('✗ storySort 順序漂移後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ storySort matrix drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(previewTarget, previewOrig)
}

// 5) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS(gate exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
