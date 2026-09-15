#!/usr/bin/env node
/**
 * 快速捲動閘「判定政策」的對照組(2026-09-11)
 *
 * 為什麼需要它:2026-09-11 把效能門檻從「每趟都要過」改成「中位數要過 + 單趟天花板」。
 * 這種改動最容易出的錯是為了穩定性把偵測力一起放掉,所以用**真實跑過的 CI 數字**當判定表:
 * 已知會紅的必須紅、已知該綠的必須綠。數字來源是 GitHub Actions 的 job log,逐筆註明 commit。
 *
 *   node scripts/test-fast-scroll-gate-policy.mjs
 */
import { gateVerdict, CEILING_FACTOR, longTaskLimit, refRatioVerdict, BLANK_RATIO_LIMIT } from './lib/fast-scroll-gate-policy.mjs'

const LIMIT = 400 // CI 的 --assert-max-blank-ms
const CASES = [
  // [名稱, 每趟的最長連續空白 ms, 期望判定]
  ['eb5b42fc 已發布版(CI 綠)', [276, 282], 'pass'],
  ['c34e035c 量測快取(CI 兩趟差很大,分布沒變)', [153, 415], 'pass'],
  ['119e279f 骨架門檻收緊(真回歸,兩趟都壞)', [438, 476], 'median'],
  ['單趟災難級(中位數在門檻內,一趟爆掉)', [120, 130, 900], 'ceiling'],
  ['剛好等於門檻(不得紅)', [400, 400], 'pass'],
  ['中位數剛好越線 1ms(必須紅)', [401, 401], 'median'],
  ['天花板剛好等於 2×(不得紅;中位數必須先在門檻內,所以取 3 趟)', [100, 110, 800], 'pass'],
  ['天花板超過 1ms(必須紅)', [100, 110, 801], 'ceiling'],
  ['修前 main 的量級(684–1055ms)', [684, 1055], 'median'],
]

// 長工最長 / 幀距最大本身已經是 max,天花板放寬到 ×3(理由見 lib)。門檻 300ms。
const LONG_TASK_LIMIT = 300
const LONG_TASK_CASES = [
  ['68f5c9af CI:一趟被 runner 搶走(本機 5 趟 141/164,修前 135/148,分布沒變)', [111, 115, 664], 'pass'],
  ['eb5b42fc 已發布版', [124, 136], 'pass'],
  ['把最長任務從 66 推到 661ms 的那一版(真回歸,中位就爆)', [661, 658, 670], 'median'],
  ['×3 天花板剛好(不得紅)', [100, 110, 900], 'pass'],
  ['×3 天花板超過 1ms(必須紅)', [100, 110, 901], 'ceiling'],
]

let fail = 0
for (const [name, vals, want] of CASES) {
  const got = gateVerdict(vals, LIMIT, CEILING_FACTOR.blank)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${name} | ${vals.join(' / ')}ms → ${got}(期望 ${want})`)
}
for (const [name, vals, want] of LONG_TASK_CASES) {
  const got = gateVerdict(vals, LONG_TASK_LIMIT, CEILING_FACTOR.longTask)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 長工|${name} | ${vals.join(' / ')}ms → ${got}(期望 ${want})`)
}
// 長工門檻的相對化:快機器仍吃絕對值、慢 runner 跟著放大、661ms 的真回歸在當時的 runner 上仍然紅
const LIMIT_CASES = [
  ['快機器(畫一個視窗 60ms)→ 仍吃絕對門檻 300', [300, 60], 300],
  ['CI 基線(畫一個視窗 174ms)→ 348', [300, 174], 348],
  ['慢 runner(畫一個視窗 350ms)→ 700', [300, 350], 700],
  ['讀不到能力值 → 退回絕對門檻', [300, null], 300],
]
for (const [name, [abs, cost], want] of LIMIT_CASES) {
  const got = longTaskLimit(abs, cost)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 長工門檻|${name} | → ${got}(期望 ${want})`)
}
{
  // 661ms 的把手回歸發生在 viewportDrawMs ≈ 174ms 的 runner 上:門檻 348 → 必須紅
  const got = gateVerdict([661, 658, 670], longTaskLimit(300, 174), CEILING_FACTOR.longTask)
  const ok = got === 'median'
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 長工門檻|661ms 真回歸在相對門檻下仍然紅 | → ${got}(期望 median)`)
}
// 對參考建置(main)的比值:唯一不受 runner 漂移影響的形式。數字全部取自真實量測。
const REF_CASES = [
  ['分支 162 vs main 801(4ea6a462 那一跑)→ 過', [162, 801], 'pass'],
  ['分支 687 vs main 同 job 也慢到 900 → 過(機器慢是兩邊一起慢)', [687, 900], 'pass'],
  ['分支 687 vs main 仍是 300(真退步)→ 紅', [687, 300], 'fail'],
  ['剛好等於 1.25 倍 → 過', [375, 300], 'pass'],
  ['超過 1.25 倍 1ms → 紅', [376, 300], 'fail'],
  ['119e279f 的骨架回歸 438 vs 同期 main 801 → 過(那一版對 main 是 0.55,不該誤紅)', [438, 801], 'pass'],
  ['沒有參考資料 → skip(呼叫端必須印出來,不可靜默放行)', [500, NaN], 'skip'],
]
for (const [name, [mine, ref], want] of REF_CASES) {
  const got = refRatioVerdict(mine, ref)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 參考比值|${name} | → ${got}(期望 ${want})`)
}
console.log(fail ? `\n✗ ${fail} 項判定不符` : '\n✓ 判定政策對照組全過:該紅的紅、該綠的綠')
process.exit(fail ? 1 : 0)
