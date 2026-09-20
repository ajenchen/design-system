#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 列 hover 閘分得出「產品沒變色」與「儀器看不到」—— 前者必紅,後者不得指控產品
 *   紅: 有幀可看卻沒變色 → lost;可用樣本太少 → starved;中位數/單次超標 → median/max
 *   綠: 串流全盲吃掉幾個樣本、但其餘樣本都快 → pass(2026-09-20 main 就是被這格誤紅)
 *
 * 判定表的數字**全部來自真實 CI job log**,逐筆註明 commit —— 已知該紅的必須紅、該綠的必須綠。
 * 作法對齊既有的 scripts/test-fast-scroll-gate-policy.mjs。
 *
 *   node scripts/test-hover-latency-policy.mjs
 */
import { hoverVerdict, MIN_USABLE_SAMPLES } from './lib/hover-latency-policy.mjs'

const MED = 60
const MAX = 600
const nan = Number.NaN
// [名稱, 逐次樣本, 逐次是否「串流全盲」, 期望判定]
const CASES = [
  ['717e405b main 捲動後 hover(送幀間隔最大 1461ms;本次誤紅的那格)',
    [29, 20, 25, nan, 17, 21, nan, 16, 20, nan], [0,0,0,1,0,0,1,0,0,1], 'pass'],
  ['717e405b main 靜止 hover(含一個 437ms 離群,仍在天花板內)',
    [19, 19, 17, 23, 17, 28, 41, 35, 20, 437], [0,0,0,0,0,0,0,0,0,0], 'pass'],
  ['b4a61c40 分支 捲動後 hover(同一份內容,CI 綠)',
    [17, 18, 25, 27, 20, 15, 26, 17], [0,0,0,0,0,0,0,0], 'pass'],
  ['2026-09-12 真 bug:有幀可看卻整整 1.5s 沒變色(必須仍然紅)',
    [19, 20, nan, 18, nan, 21, nan, 17, 19, 20], [0,0,0,0,0,0,0,0,0,0], 'lost'],
  ['混合:一格真沒變色 + 兩格全盲 → 真訊號優先',
    [19, nan, 20, nan, 18, 21, 17, 19], [0,1,0,0,0,0,0,0], 'lost'],
  ['串流幾乎全盲:可用樣本不足 → 儀器失效,不得默默放行',
    [19, nan, nan, nan, nan, nan, nan, 20], [0,1,1,1,1,1,1,0], 'starved'],
  ['中位數越線 1ms(必須紅)',
    [61, 61, 61, 61, 61, 61], [0,0,0,0,0,0], 'median'],
  ['中位數剛好等於門檻(不得紅)',
    [60, 60, 60, 60, 60, 60], [0,0,0,0,0,0], 'pass'],
  ['單次天花板超過 1ms(必須紅)',
    [19, 20, 18, 21, 17, 601], [0,0,0,0,0,0], 'max'],
  ['單次剛好等於天花板(不得紅)',
    [19, 20, 18, 21, 17, 600], [0,0,0,0,0,0], 'pass'],
]

let fail = 0
for (const [name, samples, blindFlags, want] of CASES) {
  const r = hoverVerdict({ samples, blindness: blindFlags.map(Boolean), assertMedian: MED, assertMax: MAX })
  const ok = r.verdict === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${want.padEnd(8)} 實得 ${r.verdict.padEnd(8)} (可用 ${r.usable} / 沒變色 ${r.lost} / 全盲 ${r.blind}) ${name}`)
}

// 對照:把「全盲」的資訊拿掉(等於退回舊判定)→ 第一格必須變成誤紅。
// 不會紅的對照組是零證據。
const regressed = hoverVerdict({
  samples: CASES[0][1], blindness: CASES[0][1].map(() => false), assertMedian: MED, assertMax: MAX,
})
const proves = regressed.verdict === 'lost'
console.log(`${proves ? '✓' : '✗'} 對照組:拿掉「全盲」資訊 → 第一格回到舊判定的誤紅(得 ${regressed.verdict})`)
if (!proves) fail++

console.log(`\nMIN_USABLE_SAMPLES = ${MIN_USABLE_SAMPLES}`)
console.log(fail ? `✗ ${fail} 項不符` : '✅ hover 判定政策 PASS(真實 CI 數字判定表 + 對照組)')
process.exit(fail ? 1 : 0)
