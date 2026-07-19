#!/usr/bin/env node
// meta-test for layout-space-story-coherence — 注入 story-vs-CSS drift → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate(node scripts/layout-space-story-coherence.mjs,無 --check)比對 layoutSpace.stories.tsx 的
// <SpaceRow utility mdValue lgValue> 顯示值 vs layoutSpace.css 真實 token 值(tight/loose/bottom × md/lg)。
// 本 meta-test 把 tight 的 mdValue 由 12px 改成 8px(CSS :root 仍 12px)→ story 顯示 ≠ CSS 真值 → gate exit 1。
// 這正是 gate 2026-06-15 誕生要抓的 anchor(story 顯示 8/12 但 CSS 真值 12/16)。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/layout-space-story-coherence.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真實 story-vs-CSS drift)'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入 drift → 必 FAIL → 還原
//    target = layoutSpace.stories.tsx;把 tight 的 mdValue 12px 改 8px(唯一鎖 utility="--layout-space-tight" 前綴避免誤傷 loose/bottom)
const target = 'packages/design-system/src/tokens/layoutSpace/layoutSpace.stories.tsx'
const orig = readFileSync(target, 'utf8')
const NEEDLE = 'utility="--layout-space-tight" mdValue="12px"'
const MUTATED = 'utility="--layout-space-tight" mdValue="8px"'
if (!orig.includes(NEEDLE)) {
  console.error(`✗ 找不到注入錨點(${NEEDLE})— story 結構已變,請更新 meta-test`)
  process.exit(1)
}
try {
  writeFileSync(target, orig.replace(NEEDLE, MUTATED))
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 story-vs-CSS drift 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入 story-vs-CSS drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
