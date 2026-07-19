#!/usr/bin/env node
// meta-test for item-content-leading-coherence — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 偵測邏輯(scripts/item-content-leading-coherence.mjs):消費 <ItemContent> 的元件
// 若在 className 套了 `leading-compact`(scanning 行高)卻沒對 ItemContent 傳 mode="scanning"
// → reading gap token + scanning 行高 off-grid 偏移(同 Notice 2026-06-15 修正前),gate exit 1。
// Gate 掃 packages/design-system/src/**/*.tsx(排除 .stories.tsx),無 --check flag。
//
// 注入標的 = ProfileCard(乾淨 target:有 <ItemContent>、無 leading-compact、無 mode="scanning"),
// 在一個真 className 加 `leading-compact` → 觸發 gate ACTUAL detection(ItemContent + leading-compact
// + 無 mode="scanning" = violation)。還原後必回 PASS。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/item-content-leading-coherence.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真違規,請先修 ItemContent leading-coherence)'); process.exit(1) }
console.log('✓ baseline PASS')

// 2) 注入違規 → 必 FAIL → 還原
//    ProfileCard 消費 <ItemContent>(reading 預設),原無 leading-compact/無 mode="scanning"。
//    往真 className 塞 leading-compact,即成 gate 設計要抓的 reading-gap + scanning-行高 off-grid。
const target = 'packages/design-system/src/components/ProfileCard/profile-card.tsx'
const orig = readFileSync(target, 'utf8')
const anchor = 'flex items-start gap-3 px-4 py-3'
if (!orig.includes(anchor)) { console.error('✗ 注入 anchor 不存在,test 需更新 anchor:' + anchor); process.exit(1) }
try {
  writeFileSync(target, orig.replace(anchor, anchor + ' leading-compact'))
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
