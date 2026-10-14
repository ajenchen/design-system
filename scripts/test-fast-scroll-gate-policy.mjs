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
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countCallSites } from './lib/gate-reachability.mjs'
import { attributeLongFrames, chunkKey, compareAttribution, cpuInLongFrames, invokerKey, licenseHint, longTaskCoverage } from './lib/long-frame-attribution.mjs'
import { classifyRun, gateVerdict, CEILING_FACTOR, longTaskLimit, refRatioVerdict, refRatioDecision, ratioZoneText, mannWhitneyGreaterP, logWelchGreater, studentTUpperP, advanceGapStats, median, BLANK_RATIO_LIMIT, RATIO_HARD_CAP, RATIO_ALPHA, MAX_EXTRA_ROUNDS, EXTRA_ROUNDS_JOB_BUDGET_MS, nextExtraRound, estimateRoundMs, readExtraLedger, chargeExtraLedger, MIN_PRESENTED_FRAMES } from './lib/fast-scroll-gate-policy.mjs'

const gateSrc0 = readFileSync(new URL('./data-table-fast-scroll.mjs', import.meta.url), 'utf8')
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
  // 2026-09-19:幀距比值改比「平均」而非「單趟最大」的理由,用同一組真實數字兩邊各驗一次。
  // 來源 = b87d5db3 那跑的 gesture。該 commit 相對 583a8199 只改版本字串、零個執行期檔案,
  // 兩側建置的 runtime 程式碼完全相同 → 那一跑的任何紅燈都是量具而不是回歸。
  ['幀距|同一份程式碼取單趟最大 → 會誤紅(branch 311 vs main 237)', [311, 237], 'fail'],
  ['幀距|同一份程式碼取平均 → 不誤紅(branch 33.7 vs main 29.3)', [33.7, 29.3], 'pass'],
  // 偵測力沒掉:同一跑的正對照(強制隱藏列內容)只呈現 14 幀、正常 51-56 幀,同樣手勢長度下
  // 平均幀距由 ~33ms 漲到 ~120ms → 3.6×,遠超 1.25×。真回歸不會被平均蓋掉。
  ['幀距|正對照的壞建置取平均仍然紅(120 vs 33)', [120, 33], 'fail'],
]
for (const [name, [mine, ref], want] of REF_CASES) {
  const got = refRatioVerdict(mine, ref)
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 參考比值|${name} | → ${got}(期望 ${want})`)
}
// ── 比值超過 1.25 ≠ 已證明變慢(2026-10-14,PR #169 R1a;lib refRatioDecision)──────────────────────────
// 精確單側 Mann–Whitney 先對:3 對 3 完全分開 = 1/C(6,3);5 對 5 完全分開 = 1/C(10,5);全部同值 = 1。
const MW_CASES = [
  ['3 對 3 完全分開', [4, 5, 6], [1, 2, 3], 1 / 20],
  ['5 對 5 完全分開', [6, 7, 8, 9, 10], [1, 2, 3, 4, 5], 1 / 252],
  ['全部同值(同值算半個)', [1, 1, 1], [1, 1, 1], 1],
  ['反方向完全分開(分支比較快)', [1, 2, 3], [4, 5, 6], 1],
  ['1ef86547 CI 釘選區幀距(9 組裡 8 組分支較慢)', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], 2 / 20],
]
for (const [name, mine, ref, want] of MW_CASES) {
  const got = mannWhitneyGreaterP(mine, ref)
  const ok = Math.abs(got - want) < 1e-12
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} Mann–Whitney|${name} | p = ${got.toFixed(4)}(期望 ${want.toFixed(4)})`)
}
// Student t 上尾機率對臨界值表(單側 α = 0.05,df 1–22;3 對 3 的 Welch 自由度落在 2–4,5 對 5 落在 4–8)與兩個雙側常見值
{
  const T05 = [[1, 6.314], [2, 2.920], [3, 2.353], [4, 2.132], [5, 2.015], [6, 1.943], [7, 1.895], [8, 1.860], [10, 1.812], [12, 1.782], [16, 1.746], [22, 1.717]]
  const bad = T05.filter(([df, t]) => Math.abs(studentTUpperP(t, df) - 0.05) > 5e-4)
  const extra = Math.abs(studentTUpperP(2.776, 4) - 0.025) < 5e-4 && Math.abs(studentTUpperP(0, 3) - 0.5) < 1e-12 && Math.abs(studentTUpperP(-2.132, 4) - 0.95) < 5e-4 && Number.isNaN(studentTUpperP(1, 0))
  const ok = !bad.length && extra
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} Student t|上尾機率對臨界值表 ${T05.length} 格(單側 0.05)${bad.length ? `,不符 df ${bad.map(([d]) => d).join(' / ')}` : ''};t = 2.776、df 4 → 0.025;t = 0 → 0.5;負 t → 1 − 上尾;df 0 → NaN`)
}
// 判定表:每一列都是真實量到的每趟數字(CI = DataTable 像素 job,逐列註明 commit / job)。
// 676a298e / a893fa72 / c6c192a1 這三列是**舊指標**(全部呈現幀)的值 —— 判準照樣判它們紅;它們之所以出現,
// 是指標把 main 的補畫幀算成順暢度(見下方「畫面推進的幀」那一段與 lib advanceGapStats),不是判準該放過它們。
// 表裡沒標的列都是長工合計 / 幀距(閘的 RATIO_CHECKS 設 `capNeedsNoiseSupport: true`);標 BLANK 的列是中央區最長連續空白(false)。
const BLANK = { capNeedsNoiseSupport: false }
const DECISION_CASES = [
  // [名稱, 分支每趟, 參考每趟, canAddMore, 期望, 選項(省略 = 長工合計 / 幀距)]
  ['676a298e CI 釘選區幀距 1.36×(job 115415034689,3 對 3 完全分開)→ 紅', [110.4, 108.2, 177.4], [84.0, 68.9, 81.0], true, 'fail-separated'],
  ['a893fa72 CI 釘選區幀距 1.69×(job 115469075452)→ 紅,超過硬上限', [231.8, 232.7, 223.0], [146.5, 131.0, 137.4], true, 'fail-cap'],
  // 1 對 1 沒有任何跑間差異可估:不拿「不知道雜訊多大」當放行理由,照倍數判(lib noiseUnknown)
  ['c6c192a1 CI 釘選區幀距 1.84×(job 115497110821 被取消前只量到 1 對 1)→ 紅,超過硬上限、沒有雜訊可估', [215.9], [117.2], true, 'fail-cap'],
  // 1ef86547 相對前一跑 f0dbaf5a **零個執行期檔案改動**(job 115112475329):舊判準 1.38× 紅 = 誤紅
  ['1ef86547 CI(零執行期改動)釘選區幀距 1.38× → 不紅,先加量', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], true, 'needs-more'],
  ['1ef86547 同一組、已不能再加量 → 不紅,差距在雜訊內', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], false, 'within-noise'],
  ['1ef86547 CI 釘選區長工合計 1.38× → 不紅,先加量', [1890, 1236, 1986], [1534, 1073, 1370], true, 'needs-more'],
  // 覆核反例:調查版補丁「分布重疊就綠」沒有倍數上限,3 倍回歸只要一趟偏快就放行(秩檢定 p = 0.067)。
  // 10-14 R1d 起硬上限要「雜訊撐得住」才紅 —— 這一格靠對數 Welch t(p = 0.012)照樣紅:四趟緊、一趟偏快,差距遠大於兩邊各自的跑間差異。
  ['3 倍回歸、5 趟裡有一趟偏快 → 紅(對數 t p = 0.012)', [300, 310, 320, 330, 90], [100, 105, 110, 95, 100], false, 'fail-cap'],
  // ── 10-14 R1d:超過硬上限但兩邊重疊、而且同一份程式碼在同一個 job 裡自己就差到這個倍數 → 不指控(能加量就加量)──
  // 下面三列是讓 PR #169 紅的兩跑。**同一份執行期程式碼**(43becf28 之後 38346602 / 21e25346 / 289bce76 零個執行期檔案改動)
  // 在 21e25346 是長工合計 gesture 1.01×、mouse 1.05×、幀距 0.99×(下方「零改動對照」三列)。
  ['38346602 CI gesture 長工合計 5.96×(job 115634915361;867 / 697 / 157 對 272 / 117 / 101,重疊,對數 t p = 0.080)→ 不紅,先加量', [867, 697, 157], [272, 117, 101], true, 'needs-more'],
  ['38346602 同一組、預算放不下加量(那跑 gesture 第一、二趟各等頭像 37 秒)→ 不指控', [867, 697, 157], [272, 117, 101], false, 'within-noise'],
  ['38346602 CI gesture 幀距 1.53×(105.3 / 86.7 / 57.4 對 62.9 / 56.7 / 56.4,對數 t p = 0.107)→ 不指控', [105.3, 86.7, 57.4], [62.9, 56.7, 56.4], false, 'within-noise'],
  ['289bce76 CI mouse 長工合計 1.70×(job 115665117158;1720 / 1991 / 1515 對 687 / 1014 / 1694,對數 t p = 0.096)→ 不指控', [1720, 1991, 1515], [687, 1014, 1694], false, 'within-noise'],
  ['零改動對照|21e25346 CI gesture 長工合計 1.01×(job 115654065688,與上兩跑同一份執行期程式碼)→ 過', [985, 1055, 1036], [948, 1056, 1029], false, 'pass'],
  ['零改動對照|21e25346 CI mouse 長工合計 1.05× → 過', [1128, 1534, 1136], [1083, 1063, 1097], false, 'pass'],
  ['零改動對照|21e25346 CI gesture 幀距 0.99× → 過', [98, 119, 144], [106, 121, 120], false, 'pass'],
  // 676a298e 之前就有同一種紅(快 runner 上長工合計是門檻統計量:每個任務在 50ms 上下,CPU 多 10% 就有一半任務跨線)
  ['b5757ee6 CI gesture 長工合計 4.01×(job 112588080713;1019 / 887 / 58 對 292 / 153 / 221)→ 不指控', [1019, 887, 58], [292, 153, 221], false, 'within-noise'],
  ['b5757ee6 CI gesture 幀距 1.71×(112.2 / 112.4 / 57.3 對 67.2 / 63.3 / 65.5)→ 不指控', [112.2, 112.4, 57.3], [67.2, 63.3, 65.5], false, 'within-noise'],
  ['0464ba54 CI gesture 長工合計 1.72×(job 112677818623;875 / 811 / 388 對 515 / 245 / 471)→ 不指控', [875, 811, 388], [515, 245, 471], false, 'within-noise'],
  ['零改動對照|a3045925 CI gesture 長工合計 1.14×(job 112689825434,與 0464ba54 同一份執行期程式碼)→ 過', [1061, 1115, 1057], [920, 973, 934], false, 'pass'],
  // 偵測力:本機合成回歸(每次 Tag render 多忙等 10ms,CI 參數 mouse 3 對 3)—— 長工合計重疊但對數 t 撐得住、幀距完全分開,兩條都紅
  ['合成回歸 C10 mouse 長工合計 1.64×(1728 / 2848 / 2222 對 1357 / 1859 / 1153,重疊,對數 t p = 0.047)→ 紅', [1728, 2848, 2222], [1357, 1859, 1153], false, 'fail-cap'],
  ['合成回歸 C10 mouse 幀距 1.53×(127 / 120 / 121 對 112 / 77 / 79,完全分開)→ 紅', [127, 120, 121], [112, 77, 79], false, 'fail-cap'],
  // 代價照實列:參考自己就有一趟 4 倍(雜訊跟差距一樣大),3 對 3 分不出 3 倍回歸 → 不指控(能加量才分得出)
  ['代價|參考自己就有一趟 4 倍(300 / 310 / 320 對 100 / 105 / 400,對數 t p = 0.144)→ 不指控', [300, 310, 320], [100, 105, 400], false, 'within-noise'],
  // 最新兩跑(gesture / mouse 幾乎每張呈現幀都推進,新指標 ≈ 舊指標,所以這兩列的判定不受換指標影響):
  ['daae06da CI mouse 幀距 1.29×(job 115504156149,3 對 3 完全分開)→ 紅', [163.5, 182.1, 190.4], [127.5, 157.8, 141.2], true, 'fail-separated'],
  ['daae06da CI mouse 長工合計 1.29×(同一跑,3 對 3 完全分開)→ 紅', [1786, 1932, 1761], [1262, 1682, 1389], true, 'fail-separated'],
  ['a91dfe7c CI gesture 幀距 1.29×(job 115557775928,p = 0.10)→ 灰區,先看能不能加量', [145.4, 184.1, 177.3], [157.0, 125.8, 137.4], true, 'needs-more'],
  ['a91dfe7c 同一組、預算放不下加量 → 不指控', [145.4, 184.1, 177.3], [157.0, 125.8, 137.4], false, 'within-noise'],
  ['6b5d8b61 CI 釘選區幀距 1.11×(job 115346699083,676a298e 前一跑)→ 過,一趟都不多跑', [127.7, 121.6, 133.2], [132.5, 114.8, 103.3], true, 'pass'],
  ['0beddf62 CI 釘選區幀距 0.98×(job 109685212745)→ 過', [107.5, 117.5, 119.2], [116.7, 119.4, 121.3], true, 'pass'],
  ['f0dbaf5a CI 釘選區幀距 0.94×(job 115107569519)→ 過', [103.4, 90.7, 99.1], [105.2, 108.1, 101.4], true, 'pass'],
  ['剛好 1.25× → 過(與舊判準同一條)', [125], [100], true, 'pass'],
  ['剛好 1.5×、3 對 3 完全分開 → 灰區看 p → 紅', [150, 149, 151], [100, 99, 101], true, 'fail-separated'],
  ['1.51×、兩邊各自沒有跑間差異 → 超過硬上限,紅', [151, 151, 151], [100, 100, 100], true, 'fail-cap'],
  // 676a298e 那三趟再補兩趟落在參考範圍內的(70 / 79、92 / 75 為構造值,用來覆蓋 within-noise 分支)
  ['灰區 1.34×、5 對 5 分布重疊、不能再加量 → 不紅', [110.4, 108.2, 177.4, 70, 79], [84.0, 68.9, 81.0, 92, 75], false, 'within-noise'],
  ['參考沒有可當分母的值(兩邊空白都是 0)→ skip', [0, 0, 0], [0, 0, 0], true, 'skip', BLANK],
  // ── 10-14 覆核:空白**不放寬**。放寬的證據(長工門檻統計量、置換重抽、CI 逐趟數字)都只在長工合計 / 幀距上;CI 上空白比值
  // 2026-09-29 → 10-14 共 110 次全是「參考為 0、退回絕對門檻」,沒有任何一次真的比過。同一組重疊的數字,空白照舊直接紅。
  ['空白|超過上限、兩邊重疊(38346602 長工合計那三趟的形狀,5.96×)→ 照舊直接紅,不加量', [867, 697, 157], [272, 117, 101], true, 'fail-cap', BLANK],
  ['空白|同一組、不能再加量 → 照舊直接紅', [867, 697, 157], [272, 117, 101], false, 'fail-cap', BLANK],
  ['空白|289bce76 那三趟的形狀(1.70×,重疊)→ 照舊直接紅', [1720, 1991, 1515], [687, 1014, 1694], false, 'fail-cap', BLANK],
  ['空白|灰區 1.38×、分不開 → 跟長工合計 / 幀距同一條路(灰區規則不分指標)', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], true, 'needs-more', BLANK],
  ['空白|≤ 1.25× → 過', [105, 110, 100], [100, 98, 101], true, 'pass', BLANK],
]
for (const [name, mine, ref, canAddMore, want, opt] of DECISION_CASES) {
  const d = refRatioDecision(mine, ref, { canAddMore, capNeedsNoiseSupport: true, ...opt })
  const ok = d.verdict === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 比值判定|${name} | ${Number.isFinite(d.ratio) ? d.ratio.toFixed(2) + '×' : '-'}${Number.isFinite(d.p) ? ` p=${d.p.toFixed(3)}` : ''} → ${d.verdict}(期望 ${want})`)
}
{
  // ≤ 1.25× 那一段與舊判準逐位元相同:固定種子掃 3000 組(1–5 趟、數值 1–400),「新判準 pass」⇔「舊判準 pass」
  let seed = 20261014
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let mismatch = 0
  for (let k = 0; k < 3000; k++) {
    const mk = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => +(1 + rnd() * 399).toFixed(1))
    const mine = mk(); const ref = mk()
    const oldPass = refRatioVerdict(median(mine), median(ref)) === 'pass'
    for (const capNeedsNoiseSupport of [true, false]) if (oldPass !== (refRatioDecision(mine, ref, { canAddMore: true, capNeedsNoiseSupport }).verdict === 'pass')) mismatch++
  }
  const ok = mismatch === 0
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 比值判定|≤ ${BLANK_RATIO_LIMIT}× 與舊判準逐位元相同(3000 組隨機 × 兩種 capNeedsNoiseSupport,不一致 ${mismatch} 組)`)
  // 對照組:舊判準(只比中位數)對零改動的 1ef86547 判紅;新判準不紅 —— 證明新判準真的在起作用
  const old = refRatioVerdict(median([62.7, 47.5, 63.0]), median([48.6, 45.2, 45.5]))
  const proves = old === 'fail' && !refRatioDecision([62.7, 47.5, 63.0], [48.6, 45.2, 45.5], { canAddMore: true, capNeedsNoiseSupport: true }).verdict.startsWith('fail')
  if (!proves) fail++
  console.log(`${proves ? '✓' : '✗'} 對照組:舊判準對零改動的 1ef86547 判 ${old};新判準不在 3 對 3 指控`)
  // 10-14 R1d:新判準判紅的 ⊆ 舊判準(「超過 1.5× 不看分布」)判紅的 —— 只會少紅、不會多紅;而且只有「超過上限、兩邊重疊、
  // 對數 t 也分不開」那一種情況會不同。固定種子 3000 組(1–5 趟,數值 1–400)。
  // 10-14 覆核:放寬只給長工合計 / 幀距(`capNeedsNoiseSupport: true`);空白(false)要與舊判準**逐項相同**,一組都不能不同。
  {
    const oldVerdict = (mine, ref) => {
      const d = refRatioDecision(mine, ref, { canAddMore: false, capNeedsNoiseSupport: false })
      return d.verdict === 'pass' || d.verdict === 'skip' ? d.verdict : d.ratio > RATIO_HARD_CAP ? 'fail-cap' : d.verdict
    }
    let extraRed = 0, otherDiff = 0, softened = 0, blankDiff = 0
    for (let k = 0; k < 3000; k++) {
      const mk = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => +(1 + rnd() * 399).toFixed(1))
      const mine = mk(); const ref = mk()
      const nv = refRatioDecision(mine, ref, { canAddMore: false, capNeedsNoiseSupport: true })
      const ov = oldVerdict(mine, ref)
      if (nv.verdict.startsWith('fail') && !ov.startsWith('fail')) extraRed++
      if (nv.verdict !== ov) { if (nv.overCapButNoisy && ov === 'fail-cap') softened++; else otherDiff++ }
      if (refRatioDecision(mine, ref, { canAddMore: false, capNeedsNoiseSupport: false }).verdict !== ov) blankDiff++
    }
    const ok2 = extraRed === 0 && otherDiff === 0 && softened > 0
    if (!ok2) fail++
    console.log(`${ok2 ? '✓' : '✗'} 比值判定|長工合計 / 幀距:新判準只會少紅不會多紅(3000 組:新紅舊不紅 ${extraRed} 組、其他不同 ${otherDiff} 組;超過上限但雜訊撐不住而改判不指控 ${softened} 組)`)
    const ok3 = blankDiff === 0 && softened > 0
    if (!ok3) fail++
    console.log(`${ok3 ? '✓' : '✗'} 比值判定|空白不放寬:同樣 3000 組與舊判準不同 ${blankDiff} 組(長工合計 / 幀距在同一批裡改判 ${softened} 組,證明這批資料踩得到放寬那一段)`)
    // 對照組:舊判準把 38346602 / 289bce76 兩跑判紅;拿掉雜訊條件(上限一律紅)這兩列必須翻紅 —— 證明這一條真的在起作用
    const reds = [[[867, 697, 157], [272, 117, 101]], [[1720, 1991, 1515], [687, 1014, 1694]]]
    const proves2 = reds.every(([a, b]) => oldVerdict(a, b) === 'fail-cap' && refRatioDecision(a, b, { canAddMore: false, capNeedsNoiseSupport: true }).verdict === 'within-noise')
    if (!proves2) fail++
    console.log(`${proves2 ? '✓' : '✗'} 對照組:舊判準(超過 1.5× 不看分布)對 38346602 gesture 長工合計、289bce76 mouse 長工合計判 fail-cap;新判準兩跑都不指控`)
    // capNeedsNoiseSupport 必填:漏寫不得默默套上放寬,也不得默默不套(放寬要逐項拿證據)
    const throwsWithout = [undefined, 'true', 1].every((v) => { try { refRatioDecision([867, 697, 157], [272, 117, 101], { capNeedsNoiseSupport: v }); return false } catch (e) { return e instanceof TypeError } })
    let throwsEmpty = false
    try { refRatioDecision([867, 697, 157], [272, 117, 101]) } catch (e) { throwsEmpty = e instanceof TypeError }
    const okReq = throwsWithout && throwsEmpty
    if (!okReq) fail++
    console.log(`${okReq ? '✓' : '✗'} 比值判定|capNeedsNoiseSupport 沒給 / 不是 true、false → TypeError(沒給選項 ${throwsEmpty}、undefined / 'true' / 1 ${throwsWithout})`)
    // 紅的理由由 lib 給(閘只照印):秩檢定分得開 / 對數 t / 1 對 1 / 空白不放寬
    const basis = [
      [[231.8, 232.7, 223.0], [146.5, 131.0, 137.4], true, 'rank'],
      [[300, 310, 320, 330, 90], [100, 105, 110, 95, 100], true, 'log-t'],
      [[215.9], [117.2], true, 'noise-unknown'],
      [[867, 697, 157], [272, 117, 101], false, 'no-noise-allowance'],
    ].map(([a, b, c, want]) => [want, refRatioDecision(a, b, { capNeedsNoiseSupport: c }).capBasis])
    const okB = basis.every(([w, g]) => w === g)
    if (!okB) fail++
    console.log(`${okB ? '✓' : '✗'} 比值判定|硬上限紅的依據(capBasis):${basis.map(([w, g]) => `${w}${w === g ? '' : `(得 ${g})`}`).join(' / ')}`)
    // 加量迴圈印的那一段名稱(10-14 覆核:5.96× 的項目原本被印成「1.25–1.5× 灰區」)
    const zOver = ratioZoneText(refRatioDecision([867, 697, 157], [272, 117, 101], { canAddMore: true, capNeedsNoiseSupport: true }))
    const zGray = ratioZoneText(refRatioDecision([62.7, 47.5, 63.0], [48.6, 45.2, 45.5], { canAddMore: true, capNeedsNoiseSupport: true }))
    const okZ = zOver === `超過 ${RATIO_HARD_CAP}× 但兩邊重疊` && zGray === `灰區 ${BLANK_RATIO_LIMIT}–${RATIO_HARD_CAP}×` && countCallSites(gateSrc0, 'ratioZoneText') >= 1
    if (!okZ) fail++
    console.log(`${okZ ? '✓' : '✗'} 加量訊息|5.96× 重疊 → 「${zOver}」;1.38× → 「${zGray}」;閘的呼叫點 ${countCallSites(gateSrc0, 'ratioZoneText')} 個`)
    // 對數 Welch t 自己的邊界:兩邊都只有 1 趟 → df 0、p NaN(不得被讀成「分不開」);一邊 1 趟 → 合併自由度;全部同值且分支較大 → p 0
    const w11 = logWelchGreater([200], [100]); const w13 = logWelchGreater([200], [100, 110, 90]); const wc = logWelchGreater([151, 151], [100, 100])
    const okw = w11.df === 0 && Number.isNaN(w11.p) && w13.df === 2 && w13.p < 0.05 && wc.t === Infinity && wc.p === 0
    if (!okw) fail++
    console.log(`${okw ? '✓' : '✗'} 對數 Welch t|1 對 1 → df ${w11.df}、p ${w11.p};1 對 3 → df ${w13.df}、p ${w13.p.toFixed(3)};兩邊各自同值 → t ${wc.t}、p ${wc.p}`)
    // 兩邊變異不同時的參考值(10-14 覆核:原本沒有任何一組釘住 Welch–Satterthwaite 自由度 —— 換成合併自由度「總趟數 − 2」測試照樣全綠)。
    // 參考值**不是**用這支 JS 算的:Python 依定義獨立算 ln(1 + v)、樣本變異、Welch–Satterthwaite 自由度,上尾機率對 t 分布密度做
    // 數值積分(40 萬格中點法)。覆核另用同一方法算出 t 1.822 / df 3.19 / p 0.0803 與 t 1.808 / df 2.36 / p 0.0963,一致。
    // 換成合併自由度(4)時 p 會是 0.0713 / 0.0724,差距遠大於容差。
    const WELCH_REF = [
      ['38346602 gesture 長工合計', [867, 697, 157], [272, 117, 101], { t: 1.821855, df: 3.186023, p: 0.080309 }],
      ['289bce76 mouse 長工合計', [1720, 1991, 1515], [687, 1014, 1694], { t: 1.808074, df: 2.362170, p: 0.096287 }],
    ]
    for (const [name, a, b, want] of WELCH_REF) {
      const got = logWelchGreater(a, b)
      const okr = ['t', 'df', 'p'].every((k) => Math.abs(got[k] - want[k]) <= 1e-3)
      if (!okr) fail++
      console.log(`${okr ? '✓' : '✗'} 對數 Welch t|${name}:t ${got.t.toFixed(4)}(參考 ${want.t})、df ${got.df.toFixed(4)}(參考 ${want.df})、p ${got.p.toFixed(4)}(參考 ${want.p}),容差 1e-3`)
    }
  }
  // 常數之間的關係與加量預算。預算是**整個 job** 共用的(三種跑法三次呼叫一起扣),要放得進「最慢的成功 job」離上限剩下的時間 ——
  // 上限直接讀 ci.yml 裡呼叫這支閘的那個 job(有人調低上限,這條就紅)。23.6 分 = e6c88132(job 115285931534),
  // DataTable 像素 job 74 份 log 的時間戳、成功 33 次裡最長(中位數 15.3、p90 18.6)。
  const SLOWEST_SUCCESS_MS = 23.6 * 60_000
  const ciYml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const jobBlock = ciYml.split(/\n {2}(?=[a-z0-9-]+:\n)/).find((b) => b.startsWith('verify-browser-datatable:\n')) ?? ''
  const timeoutMin = Number(/\n {4}timeout-minutes: (\d+)/.exec(jobBlock)?.[1])
  const callsGate = /data-table-fast-scroll\.mjs --mode=pinned --runs=3/.test(jobBlock)
  const consts = RATIO_HARD_CAP > BLANK_RATIO_LIMIT && RATIO_ALPHA <= 0.05 && MAX_EXTRA_ROUNDS >= 1 && EXTRA_ROUNDS_JOB_BUDGET_MS > 0
    && callsGate && Number.isFinite(timeoutMin) && SLOWEST_SUCCESS_MS + EXTRA_ROUNDS_JOB_BUDGET_MS <= timeoutMin * 60_000
  if (!consts) fail++
  console.log(`${consts ? '✓' : '✗'} 常數:${BLANK_RATIO_LIMIT} < 硬上限 ${RATIO_HARD_CAP}、α = ${RATIO_ALPHA}、加量 ≤ ${MAX_EXTRA_ROUNDS} 輪;整個 job 加量預算 ${EXTRA_ROUNDS_JOB_BUDGET_MS / 1000} 秒 + 最慢的成功 job 23.6 分 ≤ ci.yml verify-browser-datatable 上限 ${timeoutMin} 分(該 job ${callsGate ? '有' : '沒有'}呼叫這支閘)`)
}
// ── 灰區加量:要不要再量一輪(2026-10-14 覆核;lib nextExtraRound / estimateRoundMs / 帳本)─────────────────────
// 覆核抓到:原本這段迴圈寫在閘裡,第一輪不看預算、預算每次呼叫各算一份,而且把整段拿掉這支測試照樣全綠(M32)。
// 每趟牆鐘取自真實 CI log(相鄰兩趟結束的時間差,秒):一趟 5–11 秒或 35–41 秒,隨機混在同一種跑法裡。
const TRIPS_S = {
  a91dfe7cGesture: [36.5, 6.7, 6.5, 36.7, 39.5], // job 115557775928(gesture 幀距 1.29×、p = 0.10 那跑)
  b6b5d8b61Pinned: [8.1, 8.0, 7.7, 7.9, 7.7], // job 115346699083(每趟都快)
  a3045925Gesture: [7.1, 6.1, 6.1, 6.1, 6.1], // job 112689825434
  a3a9d1efcMouse: [5.1, 5.0, 5.1, 5.0, 4.8], // job 109409671448
}
const ms = (arr) => arr.map((v) => v * 1000)
const EST_CASES = [
  ['a91dfe7c gesture:最慢那趟 39.5 秒 × 2 個 build', [ms(TRIPS_S.a91dfe7cGesture), 2], 79_000],
  ['6b5d8b61 釘選區:最慢 8.1 秒 × 2', [ms(TRIPS_S.b6b5d8b61Pinned), 2], 16_200],
  ['有一趟量不到時間(NaN)→ 只看量得到的', [[NaN, 8000], 2], 16_000],
  ['沒有任何一趟 → NaN(呼叫端不得開輪)', [[], 2], NaN],
  ['沒有 build → NaN', [[8000], 0], NaN],
]
for (const [name, [trips, builds], want] of EST_CASES) {
  const got = estimateRoundMs(trips, builds)
  const ok = Number.isNaN(want) ? Number.isNaN(got) : Math.abs(got - want) < 1e-6
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 加量估計|${name} → ${got}(期望 ${want})`)
}
const go = (o) => nextExtraRound({ extra: 1, pendingCount: 1, anyFail: false, spentMs: 0, ...o })
const NEXT_CASES = [
  ['a91dfe7c gesture 1.29× 落灰區,第一輪也要估:79 秒 > 預算 60 秒 → 不開(舊版第一輪不看預算,會直接跑)', go({ estRoundMs: estimateRoundMs(ms(TRIPS_S.a91dfe7cGesture), 2) }), 'budget'],
  ['6b5d8b61 釘選區每趟都快:一輪 16.2 秒 → 開', go({ estRoundMs: 16_200 }), 'go'],
  ['同上,但這個 job 前面的呼叫已用掉 50 秒 → 不開(預算整個 job 共用)', go({ estRoundMs: 16_200, spentMs: 50_000 }), 'budget'],
  ['剛好用滿(43.8 + 16.2 = 60 秒)→ 開', go({ estRoundMs: 16_200, spentMs: 43_800 }), 'go'],
  ['這種跑法已經有一項判紅 → 不加(再量也翻不回來)', go({ estRoundMs: 16_200, anyFail: true }), 'already-failing'],
  ['沒有待決 → 不加', go({ estRoundMs: 16_200, pendingCount: 0 }), 'none-pending'],
  [`第 ${MAX_EXTRA_ROUNDS + 1} 輪 → 輪數到頂`, go({ estRoundMs: 16_200, extra: MAX_EXTRA_ROUNDS + 1 }), 'max-rounds'],
  ['估不出一輪要多久 → 不開(不知道會不會超時 = 不開)', go({ estRoundMs: NaN }), 'no-estimate'],
  ['帳本壞掉(已用 NaN)→ 不開,不當 0', go({ estRoundMs: 16_200, spentMs: NaN }), 'budget'],
]
for (const [name, got, want] of NEXT_CASES) {
  const ok = got.why === want && got.go === (want === 'go')
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 加量判斷|${name} → ${got.why}(期望 ${want})`)
}
{
  // 帳本解讀:不存在 / 別的 job → 0;解不開 → NaN,而且 NaN 寫回去再讀仍是 NaN(壞帳本不會被下一次呼叫重設成 0)
  const K = '42/1/verify-browser-datatable'
  const broken = readExtraLedger('{壞掉', K)
  const reread = readExtraLedger(JSON.stringify(chargeExtraLedger(broken, 'mouse', 10_000)), K)
  const cases = [
    ['檔案不存在 → 0', readExtraLedger(null, K).spentMs === 0],
    ['別的 job 留下的 → 0', readExtraLedger(JSON.stringify({ key: '41/1/verify-browser-datatable', spentMs: 50_000, rounds: [] }), K).spentMs === 0],
    ['同一個 job 已用 30 秒 → 30 秒', readExtraLedger(JSON.stringify({ key: K, spentMs: 30_000, rounds: [{ mode: 'gesture', ms: 30_000 }] }), K).spentMs === 30_000],
    ['解不開 → NaN', Number.isNaN(broken.spentMs)],
    ['NaN 記帳寫回再讀 → 仍是 NaN', Number.isNaN(reread.spentMs) && reread.rounds.length === 1],
  ]
  for (const [name, ok] of cases) { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 加量帳本|${name}`) }
}
{
  // 序列(M37:測序列,不只測靜態幾格):CI 上 gesture → mouse → pinned 三次呼叫,三種跑法都落灰區、每趟都快、灰區永遠分不開。
  // 共用帳本:gesture 兩輪 14.2 秒、mouse 兩輪 10.2 秒(累計 48.8)→ pinned 一輪 16.2 秒放不進 → 不開。
  // 對照組:帳本每次呼叫各算一份(覆核前的行為)→ pinned 照開,整個 job 加量 81.2 秒 > 60 秒。
  const K = '42/1/verify-browser-datatable'
  const job = [['gesture', ms(TRIPS_S.a3045925Gesture)], ['mouse', ms(TRIPS_S.a3a9d1efcMouse)], ['pinned', ms(TRIPS_S.b6b5d8b61Pinned)]]
  const simulate = (shared) => {
    let text = null; let total = 0; const steps = []
    for (const [mode, trips] of job) {
      if (!shared) text = null
      for (let extra = 1; ; extra++) {
        const ledger = readExtraLedger(text, K)
        const est = estimateRoundMs(trips, 2)
        const nx = nextExtraRound({ extra, pendingCount: 1, anyFail: false, spentMs: ledger.spentMs, estRoundMs: est })
        if (!nx.go) { steps.push(`${mode} 停(${nx.why})`); break }
        text = JSON.stringify(chargeExtraLedger(ledger, mode, est)); total += est
        steps.push(`${mode} +${(est / 1000).toFixed(1)}`)
      }
    }
    return { total, steps }
  }
  const sh = simulate(true); const per = simulate(false)
  const ok = Math.abs(sh.total - 48_800) < 1e-6 && sh.total <= EXTRA_ROUNDS_JOB_BUDGET_MS && sh.steps.at(-1) === 'pinned 停(budget)'
    && per.total > EXTRA_ROUNDS_JOB_BUDGET_MS
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 加量序列|共用帳本:${sh.steps.join(' → ')}(合計 ${(sh.total / 1000).toFixed(1)} 秒);`
    + `對照組每次各算:${per.steps.join(' → ')}(合計 ${(per.total / 1000).toFixed(1)} 秒,超過預算)`)
}
// ── 「畫面推進的幀」(2026-10-14,lib advanceGapStats)──────────────────────────────────────────────
// 真實逐幀序列:本機 roadmap 釘選區、CI 參數(--tick-ms=64)、頭像先藏起來(本機沙箱連不到頭像主機,壞圖會在捲動後
// 另補一張幀,把差別蓋掉;CI 頭像載得到、同一幀畫完),同一跑的 main(6b5d8b61)#1 與 branch(a91dfe7c)#1。
// [相對毫秒, 捲動欄有沒有變]。main 每個捲動幀後面跟一張只補畫「+N」的幀;branch 沒有。
const SEQ_MAIN = [[0, 1], [276, 1], [283, 0], [364, 1], [372, 0], [456, 1], [472, 0], [605, 1], [623, 0], [771, 1], [777, 0], [947, 1], [971, 0], [1134, 1], [1301, 1], [1325, 0], [1478, 1], [1507, 0], [1676, 1], [1667, 0], [1836, 1], [1852, 0], [1943, 1], [1956, 0], [2106, 1], [2130, 0], [2290, 1], [2314, 0], [2439, 1], [2459, 0], [2598, 1], [2620, 0], [2735, 1], [2744, 0], [2900, 1], [2925, 0], [2967, 0], [3018, 0]]
const SEQ_BRANCH = [[0, 1], [297, 1], [381, 1], [469, 1], [569, 1], [692, 1], [712, 0], [864, 1], [1065, 1], [1225, 1], [1398, 1], [1553, 1], [1736, 1], [1953, 1], [2164, 1], [2368, 1], [2552, 1], [2732, 1], [2895, 1], [2930, 0], [3018, 0]]
const toShots = (seq) => { let sig = 0; return seq.map(([ms, changed]) => ({ ts: ms / 1000, scrollSig: changed ? ++sig : sig })) }
const presentedMean = (seq) => (seq[seq.length - 1][0] - seq[0][0]) / (seq.length - 1)
{
  const m = advanceGapStats(toShots(SEQ_MAIN)); const b = advanceGapStats(toShots(SEQ_BRANCH))
  const oldRatio = presentedMean(SEQ_BRANCH) / presentedMean(SEQ_MAIN)
  const newRatio = b.advanceGapMean / m.advanceGapMean
  const ok = oldRatio > RATIO_HARD_CAP && newRatio <= BLANK_RATIO_LIMIT && m.advanced === 18 && b.advanced === 17
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 畫面推進|同一跑真實序列:全部呈現幀 main ${SEQ_MAIN.length} / branch ${SEQ_BRANCH.length} 張 → 幀距比 ${oldRatio.toFixed(2)}×(舊指標,把 main 的補畫幀當順暢度);`
    + `畫面推進 main ${m.advanced} / branch ${b.advanced} 張 → ${newRatio.toFixed(2)}×`)
  // 每一張都推進時與舊指標(presentedGapMean)相同 —— 換指標不是換尺度
  const every = advanceGapStats(toShots(SEQ_BRANCH.map(([ms]) => [ms, 1])))
  const same = Math.abs(every.advanceGapMean - presentedMean(SEQ_BRANCH)) < 1e-9
  if (!same) fail++
  console.log(`${same ? '✓' : '✗'} 畫面推進|每一張都推進 → ${every.advanceGapMean.toFixed(3)}ms = 全部呈現幀平均 ${presentedMean(SEQ_BRANCH).toFixed(3)}ms`)
  // 捲了卻一張都沒推進(畫面凍住)→ 整個觀測窗,不是 NaN(「沒看到推進」不得讀成「不適用」)
  const frozen = advanceGapStats([{ ts: 0, scrollSig: 1 }, { ts: 0.5, scrollSig: 1 }], 3)
  const noSig = advanceGapStats([{ ts: 0 }, { ts: 0.1 }])
  const edge = frozen.advanced === 0 && frozen.advanceGapMean === 3000 && Number.isNaN(noSig.advanceGapMean)
  if (!edge) fail++
  console.log(`${edge ? '✓' : '✗'} 畫面推進|凍住 → ${frozen.advanceGapMean}ms(整窗);沒有簽章 → ${noSig.advanceGapMean}(呼叫端必須明說,不可當 0)`)
}
// ── 長工歸因(2026-10-14 R1d;lib/long-frame-attribution.mjs)──────────────────────────────────────────
// 閘每次跑都印「長工裡的時間花在哪個檔的哪個進入點」。這裡驗:檔名 key 在兩份建置之間對得起來、一個影格拆成的各格
// 加總 = 影格長度(不重算、不漏算)、量測樁不混進產品程式碼、並排表取中位數、CPU 取樣只算落在長影格裡的樣本。
{
  const ATTR = []
  const chk = (name, ok, got = '') => { ATTR.push([name, ok, got]) }
  // 檔名:具名 chunk 去雜湊(兩份建置內容不同 → 雜湊不同);泛用 chunk 保留雜湊(內容相同時兩份建置同名)
  chk('具名 chunk 去雜湊:data-table-C-lUcAPl.js 與 data-table-C3xpkEa0.js 同一格', chunkKey('http://127.0.0.1:1/assets/data-table-C-lUcAPl.js') === 'data-table.js' && chunkKey('http://127.0.0.1:2/assets/data-table-C3xpkEa0.js') === 'data-table.js')
  chk('雜湊裡有「-」也認得(overflow-indicator.stories--t8-old6.js)', chunkKey('http://h/assets/overflow-indicator.stories--t8-old6.js') === 'overflow-indicator.stories.js')
  chk('泛用 chunk 保留雜湊(index-BLHw34Di.js 兩份建置同名,不併成一格「index」)', chunkKey('http://h/assets/index-BLHw34Di.js') === 'index-BLHw34Di.js' && chunkKey('http://h/assets/chunk-XP5HYGXS-BHXC9YeQ.js') === 'chunk-XP5HYGXS-BHXC9YeQ.js')
  chk('沒有來源檔 = 量測樁 / eval', chunkKey('') === '(量測樁 / 無來源檔)')
  chk('事件監聽只留「元素.事件」', invokerKey('event-listener', 'DIV#storybook-root.onmouseout') === 'DIV.onmouseout' && invokerKey('event-listener', 'DIV.onscroll') === 'DIV.onscroll')
  chk('其他進入點照瀏覽器給的字串', invokerKey('user-callback', 'Window.requestAnimationFrame') === 'Window.requestAnimationFrame' && invokerKey('classic-script', 'http://h/a.js') === 'classic-script')
  // 一個影格:本機 roadmap story mouse 捲動實得的形狀(lib 檔頭的欄位),數字取整
  const frame = { s: 1900, d: 232, b: 178, r: 2108, l: 2120,
    sc: [{ t: 'event-listener', i: 'DIV#storybook-root.onmouseout', u: 'http://h/assets/index-BLHw34Di.js', s: 1902, d: 5, fl: 3 },
      { t: 'event-listener', i: 'DIV.onscroll', u: 'http://h/assets/index-CsNa_3u9.js', s: 1910, d: 205, fl: 58 },
      { t: 'user-callback', i: 'ResizeObserver', u: 'http://h/assets/use-truncated-DZOSez9q.js', s: 2125, d: 6, fl: 0 },
      { t: 'user-callback', i: 'FrameRequestCallback', u: '', s: 2109, d: 2, fl: 0 }] }
  const a = attributeLongFrames([frame])
  const sum = Object.values(a.buckets).reduce((x, v) => x + v.ms, 0)
  const at = (kind, key) => a.buckets[`${kind}|${key}`]?.ms ?? 0
  chk('各格加總 = 影格長度(不重算、不漏算)', Math.abs(sum - 232) < 1e-9, `${sum}`)
  chk('JS 扣掉它逼出的樣式 / 版面', at('script', 'index-CsNa_3u9.js ← DIV.onscroll') === 147 && at('forced', 'index-CsNa_3u9.js') === 58)
  chk('渲染階段 = styleAndLayoutStart → 影格結束,扣掉該階段裡的 JS(ResizeObserver 6ms)', at('render', '樣式 / 版面 / 繪製(瀏覽器,非 JS)') === 232 + 1900 - 2120 - 6, `${at('render', '樣式 / 版面 / 繪製(瀏覽器,非 JS)')}`)
  chk('量測樁單獨一格,不混進產品程式碼', at('script', '(量測樁 / 無來源檔)') === 2)
  chk('視窗之前結束的影格不算', attributeLongFrames([frame], { windowStart: 2200 }).frames === 0 && attributeLongFrames([frame], { windowStart: 2100 }).frames === 1)
  // 並排表:各趟中位數,沒出現的趟算 0
  const trip = (ms) => attributeLongFrames([{ s: 0, d: ms, b: 0, r: 0, l: 0, sc: [{ t: 'event-listener', i: 'DIV.onscroll', u: 'http://h/assets/data-table-AAAAAAAA.js', s: 0, d: ms, fl: 0 }] }])
  const cmp = compareAttribution({ main: [trip(100), trip(120), trip(110)], branch: [trip(300), attributeLongFrames([]), trip(320)] })
  const row = cmp.rows.find((r) => r.key === 'data-table.js ← DIV.onscroll')
  chk('並排表取各趟中位數(沒出現的趟算 0)', row && row.ms.main === 110 && row.ms.branch === 300 && cmp.head.branch.frames === 1, row ? JSON.stringify(row.ms) : '-')
  // 授權標頭線索:只說檔裡有什麼(React 的 scheduler / react-dom;TanStack 的 table-core 寫在 @license MIT 上方)
  const lic = licenseHint('/**\n * @license React\n * scheduler.production.min.js\n */x;/**\n * @license React\n * react-dom.production.min.js\n */y;/**\n   * table-core\n   *\n   * @license MIT\n   */z;/**\n * @license lucide-react v0.577.0 - ISC\n */')
  chk('授權標頭線索', lic.join('/') === 'scheduler/react-dom/table-core/lucide-react', lic.join('/'))
  // CPU 取樣:只算落在長影格 [100, 300] 裡的樣本;對齊點 anchorMs = 100 → profile 時間 0 對到頁面 100ms
  const prof = { startTime: 0, nodes: [{ id: 1, callFrame: { functionName: '(program)', url: '' } }, { id: 2, callFrame: { functionName: 'U', url: 'http://h/assets/tag-Lz46-SIN.js' } }, { id: 3, callFrame: { functionName: 'getBoundingClientRect', url: '' } }],
    samples: [2, 2, 3, 1, 2], timeDeltas: [50_000, 50_000, 50_000, 50_000, 150_000] }
  const c = cpuInLongFrames(prof, 100, [{ s: 100, d: 200 }])
  chk('CPU 取樣:影格外的樣本不算、檔名同一套 key、原生 / V8 分開', c.inFramesMs === 200 && c.byFile['tag.js'] === 100 && c.byFile['(原生 / 內建) getBoundingClientRect'] === 50 && c.byFile['(V8 (program))'] === 50 && c.sampledMs === 350, JSON.stringify(c))
  // 涵蓋率:本機 mouse 關掉截圖串流的真實時間軸(CPU×2;long task 12 個,長影格只蓋到前 6 個)→ 照實算出不到一半
  const LT_REAL = [[4030, 223], [4302, 56], [4396, 277], [4764, 623], [5391, 62], [5533, 367], [5939, 588], [6556, 53], [6610, 662], [7352, 576], [7966, 595], [8565, 57]].map(([start, dur]) => ({ start, dur }))
  const LOAF_REAL = [[4016, 216], [4253, 111], [4379, 273], [4674, 685], [5388, 488], [5901, 590]].map(([s, d]) => ({ s, d }))
  const cov = longTaskCoverage(LT_REAL, LOAF_REAL)
  chk('涵蓋率:長影格沒蓋到的 long task 不算進去(真實時間軸 4139ms 只蓋到約一半)', cov.longMs === 4139 && cov.coveredMs > 1800 && cov.coveredMs < 2300 && longTaskCoverage([{ start: 0, dur: 100 }], [{ s: -10, d: 200 }]).coveredMs === 100, `${cov.coveredMs.toFixed(0)} / ${cov.longMs}`)
  // 長影格重疊(重送 / 重複)不得把同一段算兩次:兩個 long task、只有第一個被蓋(而且被蓋兩次)→ 50%,不是 100%
  const dup = longTaskCoverage([{ start: 0, dur: 100 }, { start: 200, dur: 100 }], [{ s: 0, d: 100 }, { s: 0, d: 100 }])
  const part = longTaskCoverage([{ start: 0, dur: 100 }], [{ s: 0, d: 60 }, { s: 40, d: 60 }])
  chk('涵蓋率:長影格先取聯集(重複的不重算;部分重疊的取聯集)', dup.coveredMs === 100 && dup.longMs === 200 && part.coveredMs === 100, `${dup.coveredMs} / ${dup.longMs};${part.coveredMs}`)
  // 閘真的掛觀測器、真的在每次非 selftest 執行印並排表(預設開,`--attribution=off` 只給對照組)
  // 觀測器要真的被「預設開」的旗標開起來:頁內 INIT 只認 `loaf` 參數,它由 ATTRIBUTION(= 模式不是 off)傳進去(10-14 覆核:
  // 把 `if (loaf)` 改成 `if (false)` 原本整套照樣全綠 —— 頁內程式只在瀏覽器裡跑,這裡只能驗它接在哪條線上)
  const observes = /observe\(\{ type: 'long-animation-frame', buffered: true \}\)/.test(gateSrc0) &&
    /\n {2}if \(loaf\) \{\n {4}try \{\n {6}new PerformanceObserver\(/.test(gateSrc0) &&
    /const ATTRIBUTION = ATTRIBUTION_MODE !== 'off'\n/.test(gateSrc0) && /addInitScript\(INIT, \{ loaf: ATTRIBUTION \}\)/.test(gateSrc0)
  const defaultOn = /const ATTRIBUTION_MODE = arg\('attribution', 'on'\)/.test(gateSrc0)
  const returns = /loafs: S\.loafs\.filter\(\(l\) => l\.s \+ l\.d >= S\.t0\)/.test(gateSrc0)
  const sites = ['attributeLongFrames', 'compareAttribution', 'cpuInLongFrames', 'licenseHint', 'longTaskCoverage'].map((n) => [n, countCallSites(gateSrc0, n)])
  // 印表函式要真的被呼叫(countCallSites 會把 `function printAttribution(` 那一行也算進去,所以直接認呼叫那一行)
  const printed = /^\s+printAttribution\(\)$/m.test(gateSrc0)
  chk(`可達性:掛 long-animation-frame 觀測器 ${observes}、預設開 ${defaultOn}、取樣視窗內的影格帶回 ${returns}、印表有被呼叫 ${printed};${sites.map(([n, k]) => `${n} ${k} 個呼叫點`).join('、')}`, observes && defaultOn && returns && printed && sites.every(([, k]) => k >= 1))
  for (const [name, ok, got] of ATTR) { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 長工歸因|${name}${!ok && got ? `(得 ${got})` : ''}`) }
}

// ── 「量不到」與「量到壞東西」的分流(2026-09-21 CI 實證)──────────────────
// 數字取自真實 CI:f5b43e91 那輪某一趟只送出 9 張呈現幀,閘因此把整個 build 判紅,
// 而被指控的程式碼一行都沒改。分流之後那一趟作廢、不進判定;產品面照舊立刻紅。
const RUN_CASES = [
  ['f5b43e91 CI 實例:只收到 9 張呈現幀(screencast 停擺)', { g: { presented: 9, bandsPerFrame: 17 }, frames: [{}], scrolled: 6000, gesturePx: 6000 }, false],
  ['剛好 10 張(邊界,不得作廢)', { g: { presented: 10, bandsPerFrame: 17 }, frames: [{}], scrolled: 6000, gesturePx: 6000 }, true],
  ['正常一趟(63 張)', { g: { presented: 63, bandsPerFrame: 17 }, frames: [{}], scrolled: 6000, gesturePx: 6000 }, true],
  ['每幀帶數 0 = 缺資料', { g: { presented: 63, bandsPerFrame: 0 }, frames: [{}], scrolled: 6000, gesturePx: 6000 }, false],
  ['DOM 取樣 0 = 缺資料', { g: { presented: 63, bandsPerFrame: 17 }, frames: [], scrolled: 6000, gesturePx: 6000 }, false],
  ['只捲了 70%(覆蓋不足)', { g: { presented: 63, bandsPerFrame: 17 }, frames: [{}], scrolled: 4200, gesturePx: 6000 }, false],
  ['剛好 80%(邊界,不得作廢)', { g: { presented: 63, bandsPerFrame: 17 }, frames: [{}], scrolled: 4800, gesturePx: 6000 }, true],
  ['wheel 模式沒有截圖幾何 → 不在此作廢(由其他指標判)', { g: null, frames: [], scrolled: 0, gesturePx: 6000 }, true],
]
for (const [name, input, wantUsable] of RUN_CASES) {
  const r = classifyRun(input)
  const ok = r.usable === wantUsable
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${wantUsable ? '可用  ' : '作廢  '} 實得 ${r.usable ? '可用  ' : '作廢  '} ${name}${r.why ? ` — ${r.why}` : ''}`)
}
// 對照:把門檻拿掉(等於退回「只要沒量到就算產品壞」)→ 第一格必須不再作廢
const regressed = { ...RUN_CASES[0][1], g: { ...RUN_CASES[0][1].g, presented: MIN_PRESENTED_FRAMES } }
const proves = classifyRun(regressed).usable === true
console.log(`${proves ? '✓' : '✗'} 對照組:把呈現幀數補到門檻(${MIN_PRESENTED_FRAMES})→ 同一趟不再作廢(得 ${classifyRun(regressed).usable ? '可用' : '作廢'})`)
if (!proves) fail++

// 閘必須真的消費它,否則測得再漂亮也沒用
// 可達性要看**呼叫點**,不是看 import 那一行 —— `classifyRun(` 在 import 裡也會命中,
// 第一版就是這樣寫的,把呼叫點拿掉照樣綠(2026-09-21 當場被對照組抓到)。
const gateSrc = readFileSync(new URL('./data-table-fast-scroll.mjs', import.meta.url), 'utf8')
const callSites = countCallSites(gateSrc, 'classifyRun')
if (callSites < 1) { console.log('✗ 可達性:data-table-fast-scroll.mjs 的 import 之外沒有任何 classifyRun 呼叫點'); fail++ }
else console.log(`✓ 可達性:閘真的消費 classifyRun(${callSites} 個呼叫點,不含 import)`)
{
  // 比值判定與畫面推進同理:終判與灰區加量的初判都經 refRatioDecision(同一份判定式),加量迴圈真的呼叫 ratioDecisions,
  // 幀距那條真的取 advanceGapMean(不是 presentedGapMean)
  const decisionSites = countCallSites(gateSrc, 'refRatioDecision')
  const confirmSites = countCallSites(gateSrc, 'ratioDecisions')
  const advanceSites = countCallSites(gateSrc, 'advanceGapStats')
  const picksAdvance = /pick: \(r\) => r\.g\?\.advanceGapMean \?\? NaN/.test(gateSrc)
  const ok = decisionSites >= 1 && confirmSites >= 1 && advanceSites >= 1 && picksAdvance
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 可達性:refRatioDecision ${decisionSites} 個、ratioDecisions ${confirmSites} 個、advanceGapStats ${advanceSites} 個呼叫點;幀距取畫面推進 ${picksAdvance ? '是' : '否'}`)
  // 灰區加量:閘真的問 nextExtraRound、真的用 estimateRoundMs 估、真的讀寫共用帳本(覆核:整段拿掉原本照樣全綠)
  const extraSites = Object.fromEntries(['nextExtraRound', 'estimateRoundMs', 'readExtraLedger', 'chargeExtraLedger'].map((n) => [n, countCallSites(gateSrc, n)]))
  // 帳本在 CI 上真的是整個 job 共用的那一份:預設路徑取 $RUNNER_TEMP(拿掉就退回每次呼叫各算一份,上面的序列對照組就是那個後果)
  const jobWide = /const EXTRA_LEDGER = arg\('extra-budget-file', process\.env\.RUNNER_TEMP \? join\(process\.env\.RUNNER_TEMP, /.test(gateSrc)
  const extraOk = Object.values(extraSites).every((c) => c >= 1) && jobWide
  if (!extraOk) fail++
  console.log(`${extraOk ? '✓' : '✗'} 可達性:灰區加量 ${Object.entries(extraSites).map(([n, c]) => `${n} ${c} 個`).join('、')}呼叫點;帳本預設在 $RUNNER_TEMP ${jobWide ? '是' : '否'}`)
}

// ── 呼叫端的**行為**(2026-09-21)────────────────────────────────────────────
// 純函式對了不代表用它的人用對了。2026-09-21 我把「產品炸了」的檢查從 results 縮到
// usableResults,所有測試照樣全綠 —— 因為那時只驗了純函式與可達性。
// `--inject-runs` 直接餵合成的 run 進判定段(不開瀏覽器),把三種局面的**退出碼與訊息**鎖住。
{
  const tmp = mkdtempSync(join(tmpdir(), 'fast-scroll-inject-'))
  const GESTURE_PX = 6000 // 閘的預設手勢距離;覆蓋率門檻是它的 MIN_SCROLL_COVERAGE 倍
  // 字面路徑 + cwd:治理 harness 的來源審查只接受**字面字串**的 script 運算元
  // (非字面的一律判成 unreviewable,會擋掉整個 runner —— 2026-09-21 我自己剛踩過一次)。
  const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
  const usableFrames = Array.from({ length: 12 }, () => ({ missing: 0, empty: 0 }))
  const usableG = { presented: 20, bandsPerFrame: 24, blankFrames: 0, blankMs: 0, fillMs: 10, longTaskMs: 40, frameGapMs: 20, shellFrames: 0 }
  // 幀數不足 = 儀器失效(classifyRun 會判作廢)
  const starvedG = { ...usableG, presented: 3 }

  const runGate = (runs, args = []) => {
    const file = join(tmp, `runs-${Math.abs(JSON.stringify(runs).length)}-${args.join('')}.json`)
    writeFileSync(file, JSON.stringify(runs))
    const r = spawnSync(
      process.execPath,
      ['--', 'scripts/data-table-fast-scroll.mjs', `--inject-runs=${file}`, ...args],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }
  const LIMITS = ['--assert-max-long-task-ms=200']

  const cases = [
    ['乾淨的可用趟 → 綠',
      [{ build: 'b', mode: 'gesture', g: usableG, frames: usableFrames, scrolled: GESTURE_PX, errors: [] }],
      (r) => r.status === 0, '沒有任何失敗訊號時不得紅'],
    ['全部趟都量不到 → 以「儀器失效」紅,而且要明說不是產品變慢',
      [{ build: 'b', mode: 'gesture', g: starvedG, frames: usableFrames, scrolled: GESTURE_PX, errors: [] }],
      (r) => r.status === 1 && /儀器失效/.test(r.out) && /不是這個 build 變慢/.test(r.out), '訊息要指向儀器,不是指控 build'],
    ['作廢的那一趟頁面炸了 → 仍然必須報 pageerror(2026-09-21 我寫壞過的那條)',
      [{ build: 'b', mode: 'gesture', g: starvedG, frames: usableFrames, scrolled: GESTURE_PX, errors: ['TypeError: x is not a function'] }],
      (r) => r.status === 1 && /pageerror/.test(r.out), '儀器失效只該讓效能那半作廢,不該讓「產品炸了」一起消音'],
    ['可用的趟靜止後仍缺列 → 紅',
      [{ build: 'b', mode: 'gesture', g: usableG, frames: [...usableFrames.slice(0, 11), { missing: 4, empty: 0 }], scrolled: GESTURE_PX, errors: [] }],
      (r) => r.status === 1 && /靜止後 DOM 仍缺列/.test(r.out), '真正的產品失效必須紅'],
  ]
  for (const [name, runs, want, why] of cases) {
    const r = runGate(runs, LIMITS)
    if (want(r)) console.log(`✓ 行為:${name}`)
    else { console.log(`✗ 行為:${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-6).map((l) => '   ' + l).join('\n')}`); fail++ }
  }
  // ── 對參考的比值判定:呼叫端的行為(2026-10-14)────────────────────────────────────
  // 用「中央區最長連續空白」那一條(不受「零執行期差異就跳過」影響,判定結果與 git 狀態無關)。注入模式不能加量,灰區直接終判。
  const blankRun = (build, ms) => ({ build, mode: 'mouse', g: { ...usableG, blankLongestMs: ms, blankFrames: 1, blankMaxBands: 1 }, frames: usableFrames, scrolled: GESTURE_PX, errors: [] })
  const ratioRuns = (branch, main) => [...branch.map((ms) => blankRun('branch', ms)), ...main.map((ms) => blankRun('main', ms))]
  const RATIO_ARGS = ['--ref=main', '--assert-max-blank-ms=600']
  const ratioCases = [
    ['1.08×(3 對 3)→ 綠,訊息與舊判準相同', ratioRuns([110, 115, 105], [100, 104, 98]),
      (r) => r.status === 0 && /✓ branch\/mouse:中央區最長連續空白中位數 110ms ≤ 參考「main\/mouse」的 100ms × 1\.25\(= 125ms\)/.test(r.out), '≤ 1.25× 不得改變'],
    ['1.36×、3 對 3 完全分開 → 紅,指名分支確實比較慢', ratioRuns([110, 108, 177], [84, 69, 81]),
      (r) => r.status === 1 && /分支確實比較慢/.test(r.out), '灰區分得開必須紅'],
    ['1.38×、3 對 3 分不開、不能再加量 → 綠,並明說差距在雜訊內', ratioRuns([63, 48, 63], [49, 45, 46]),
      (r) => r.status === 0 && /跑間雜訊內/.test(r.out), '分不開時不指控,而且要印出來'],
    // 10-14 覆核:空白不放寬 —— 超過上限、兩邊重疊照樣紅,而且訊息講的是「空白不看分布」,不是「差距大於跑間差異」
    ['空白 3.1×、5 趟裡一趟偏快 → 紅,超過硬上限(空白不看分布)', ratioRuns([300, 310, 320, 330, 90], [100, 105, 110, 95, 100]),
      (r) => r.status === 1 && /超過硬上限,而且這一項是使用者看得到的空白/.test(r.out), '空白超過上限必須直接紅'],
    ['空白 5.96×、兩邊重疊(38346602 長工合計那三趟的形狀)→ 照舊紅,不因重疊放行', ratioRuns([867, 697, 157], [272, 117, 101]),
      (r) => r.status === 1 && /超過硬上限,而且這一項是使用者看得到的空白/.test(r.out) && !/分不出來,不指控/.test(r.out), '放寬的證據只在長工合計 / 幀距上,空白沒有'],
  ]
  for (const [name, runs, want, why] of ratioCases) {
    const r = runGate(runs, RATIO_ARGS)
    if (want(r)) console.log(`✓ 行為:${name}`)
    else { console.log(`✗ 行為:${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-6).map((l) => '   ' + l).join('\n')}`); fail++ }
  }
  // 長工合計 / 幀距那半(capNeedsNoiseSupport: true)。這兩條在「兩邊零個執行期檔案差異」時會被跳過,判定結果會跟著 git 狀態變 ——
  // 所以參考建置故意取一個**不可能是 git ref 的名字**(含空白):閘的 runtimeSourceDiffers 照它檔頭寫的「ref 不存在 → 保守照跑」,
  // 判定與這份 checkout 的 git 狀態無關。每一格都先確認沒有印「跳過」,免得保守分支哪天改掉後這幾格變成空測。
  const NOGIT_REF = 'main 對照(不是 git ref)'
  const gapRun = (build, ms) => ({ build, mode: 'mouse', g: { ...usableG, advanceGapMean: ms }, frames: usableFrames, scrolled: GESTURE_PX, errors: [] })
  const gapRuns = (branch, main) => [...branch.map((ms) => gapRun('branch', ms)), ...main.map((ms) => gapRun(NOGIT_REF, ms))]
  const GAP_ARGS = [`--ref=${NOGIT_REF}`, '--assert-max-frame-gap-ms=100000']
  const ran = (r) => /branch\/mouse:畫面推進的幀距平均中位數/.test(r.out) && !/跳過「對/.test(r.out)
  const gapCases = [
    ['幀距 3.1×、5 趟裡一趟偏快 → 紅,超過硬上限而且雜訊撐得住(對數 t)', gapRuns([300, 310, 320, 330, 90], [100, 105, 110, 95, 100]),
      (r) => ran(r) && r.status === 1 && /超過硬上限,而且差距大於兩邊各自的跑間差異/.test(r.out), '大回歸不得因一趟偏快放行'],
    ['幀距 5.96×、重疊、同一份程式碼自己就差這麼多(38346602 長工合計那三趟)→ 綠,而且明說分不出來、指向長工歸因', gapRuns([867, 697, 157], [272, 117, 101]),
      (r) => ran(r) && r.status === 0 && /但兩邊分布重疊/.test(r.out) && /分不出來,不指控/.test(r.out) && /長工歸因/.test(r.out), '超過上限但雜訊撐不住時不指控,也不得默默放行'],
    ['幀距 1.69×、秩檢定分得開(a893fa72 那三趟)→ 紅,理由寫「秩檢定分得開」不寫「完全分開」', gapRuns([231.8, 232.7, 223.0], [146.5, 131.0, 137.4]),
      (r) => ran(r) && r.status === 1 && /超過硬上限,而且秩檢定分得開/.test(r.out) && !/兩邊完全分開/.test(r.out), '5 對 5 時 p ≤ 0.05 不代表完全分開'],
  ]
  for (const [name, runs, want, why] of gapCases) {
    const r = runGate(runs, GAP_ARGS)
    if (want(r)) console.log(`✓ 行為:${name}`)
    else { console.log(`✗ 行為:${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-6).map((l) => '   ' + l).join('\n')}`); fail++ }
  }
  {
    // 畫面推進偵測器自己瞎了(或畫面凍住):DOM 捲了 3 次、捲動欄 0 次 → 紅,不當不適用放行(M37)
    const movingFrames = [0, 300, 700, 1200].map((st) => ({ st, missing: 0, empty: 0 }))
    const blind = [{ build: 'b', mode: 'gesture', g: { ...usableG, advanced: 0, advanceGapMean: 3000, advanceGapMax: 3000 }, frames: movingFrames, scrolled: GESTURE_PX, errors: [] }]
    const seen = [{ build: 'b', mode: 'gesture', g: { ...usableG, advanced: 3, advanceGapMean: 100, advanceGapMax: 120 }, frames: movingFrames, scrolled: GESTURE_PX, errors: [] }]
    const rb = runGate(blind, LIMITS); const rs = runGate(seen, LIMITS)
    const ok = rb.status === 1 && /畫面推進偵測看不到捲動/.test(rb.out) && rs.status === 0
    if (!ok) fail++
    console.log(`${ok ? '✓' : '✗'} 行為:捲動欄看不到捲動 → 紅(exit ${rb.status});看得到 → 綠(exit ${rs.status})`)
  }
  rmSync(tmp, { recursive: true, force: true })
}

console.log(fail ? `\n✗ ${fail} 項判定不符` : '\n✓ 判定政策對照組全過:該紅的紅、該綠的綠(含呼叫端行為)')
process.exit(fail ? 1 : 0)
