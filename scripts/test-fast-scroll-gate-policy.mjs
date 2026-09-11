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
import { gateVerdict, CEILING_FACTOR, longTaskLimit, runnerScaledLimit } from './lib/fast-scroll-gate-policy.mjs'

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
// 用固定工作量對照組把 runner 快慢與程式碼好壞分開(數字全部取自真實 CI job)
const SCALE_CASES = [
  ['04c6abe4 校準點(對照 775)→ 門檻不變', [400, 775], 400],
  ['4ea6a462(對照 957)→ 494', [400, 957], 494],
  ['50ee1d3b(對照 1082)→ 558;實測空白 471 → 過', [400, 1082], 558],
  ['546ae35b(對照 1171)→ 604;實測空白 485 → 過', [400, 1171], 604],
  ['比校準點更快的機器 → 門檻不縮(仍 400)', [400, 500], 400],
  ['讀不到對照 → 退回絕對門檻', [400, null], 400],
]
for (const [name, [abs, ctrl], want] of SCALE_CASES) {
  const got = Math.round(runnerScaledLimit(abs, ctrl))
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 機器校正|${name} | → ${got}(期望 ${want})`)
}
{
  // 真回歸:空白漲到修前 main 的量級(684/1055),而對照組停在校準點 → 必須紅
  const got = gateVerdict([684, 1055], runnerScaledLimit(400, 775), CEILING_FACTOR.blank)
  const ok = got === 'median'
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 機器校正|對照不動而空白漲(真回歸)仍然紅 | → ${got}(期望 median)`)
}
{
  // 即使在最慢的 runner 上(對照 1171 → 門檻 604),修前 main 的量級照樣紅
  const got = gateVerdict([684, 1055], runnerScaledLimit(400, 1171), CEILING_FACTOR.blank)
  const ok = got === 'median'
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 機器校正|最慢 runner 上真回歸仍然紅 | → ${got}(期望 median)`)
}
console.log(fail ? `\n✗ ${fail} 項判定不符` : '\n✓ 判定政策對照組全過:該紅的紅、該綠的綠')
process.exit(fail ? 1 : 0)
