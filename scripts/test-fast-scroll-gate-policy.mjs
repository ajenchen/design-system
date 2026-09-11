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
import { gateVerdict } from './lib/fast-scroll-gate-policy.mjs'

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

let fail = 0
for (const [name, vals, want] of CASES) {
  const got = gateVerdict(vals, LIMIT)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${name} | ${vals.join(' / ')}ms → ${got}(期望 ${want})`)
}
console.log(fail ? `\n✗ ${fail} 項判定不符` : '\n✓ 判定政策對照組全過:該紅的紅、該綠的綠')
process.exit(fail ? 1 : 0)
