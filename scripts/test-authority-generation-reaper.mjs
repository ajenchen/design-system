#!/usr/bin/env node
/**
 * authority generation 殘留鎖回收的判斷(2026-09-08)
 *
 * 由來:reaper 原本只認兩態 —— `kill(pid,0)` 不是 ESRCH 就當「還活著」。
 * 於是 EPERM(pid 被回收給別人,或沙箱擋跨界訊號)會讓這把鎖**永遠**清不掉:
 * 同一天兩次提交被 pid 68298 / 69257 擋住,而建立它們的執行早就結束了。
 *
 * 修法是三態 + 視窗:證不出死活時,改用「馬克有多舊」判斷。
 * 判斷抽成純函式才測得動 —— 要在測試裡造一個「存在但送不了訊號」的 pid 沒有可攜做法。
 */
import assert from 'node:assert/strict'
import { authorityGenerationOwnerVerdict, ABANDONED_UNPROVABLE_OWNER_MS as W } from './lib/canonical-sync-transaction.mjs'

const cases = [
  ['擁有者確定活著 → 不准收', 'alive', 0, 'active'],
  ['擁有者確定活著,就算馬克很舊也不准收', 'alive', W * 10, 'active'],
  ['擁有者確定已結束 → 立刻可收', 'gone', 0, 'reap'],
  ['送不了訊號但馬克很新 → 先等(可能真的在跑)', 'unprovable', 1000, 'wait'],
  ['送不了訊號且剛好在視窗邊界內 → 仍然等', 'unprovable', W, 'wait'],
  ['送不了訊號且超過視窗 → 視為遺棄,可收', 'unprovable', W + 1, 'reap'],
]

let fail = 0
for (const [name, liveness, ageMs, want] of cases) {
  const got = authorityGenerationOwnerVerdict(liveness, ageMs)
  if (got === want) { console.log(`  ✓ ${name}`); continue }
  console.log(`  ✗ ${name} —— 預期 ${want} 實得 ${got}`); fail++
}

// 對照組:把視窗改成 0,原本該「等」的那筆就必須變成可收 —— 證明視窗真的有在起作用,
// 不是靠 liveness 一個變數就決定了結果。
const withoutWindow = authorityGenerationOwnerVerdict('unprovable', 1, 0)
if (withoutWindow === 'reap') console.log('  ✓ 對照組:視窗設 0 時,證不出死活的馬克立刻可收(視窗確實在起作用)')
else { console.log(`  ✗ 對照組:視窗設 0 卻仍回 ${withoutWindow}`); fail++ }

assert.equal(fail, 0, `${fail} 個案例未通過`)
console.log(`\n✓ ${cases.length + 1}/${cases.length + 1} 通過(視窗 ${W / 60000} 分鐘)`)
