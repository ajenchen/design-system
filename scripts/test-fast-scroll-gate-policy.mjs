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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countCallSites } from './lib/gate-reachability.mjs'
import { attributeLongFrames, chunkKey, compareAttribution, cpuInLongFrames, invokerKey, licenseHint, longTaskCoverage } from './lib/long-frame-attribution.mjs'
import { classifyRun, gateVerdict, CEILING_FACTOR, longTaskLimit, refRatioVerdict, refRatioDecision, ratioZoneText, mannWhitneyGreaterP, logWelchGreater, studentTUpperP, advanceGapStats, median, BLANK_RATIO_LIMIT, RATIO_HARD_CAP, RATIO_ALPHA, MAX_EXTRA_ROUNDS, EXTRA_ROUNDS_JOB_BUDGET_MS, nextExtraRound, estimateRoundMs, readExtraLedger, chargeExtraLedger, MIN_PRESENTED_FRAMES, aaNoise, combineWithAA, roundOrderOf, pinnedMechanismPlan, pinnedComparable, AA_NOISE_SHARE, extraRoundPlan, blankDecision, longestBlankRun, ZERO_REF_BLANK_FRAMES, aaMechanismCheck, gpPointerLabels, checkerboardDecision, CHECKERBOARD_FLOOR } from './lib/fast-scroll-gate-policy.mjs'

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
  // 常數之間的關係與加量預算。預算是**整個 job** 共用的(同一個 job 裡的幾次呼叫一起扣),要放得進「那個 job 最慢的情況」離上限剩下的時間 ——
  // 上限直接讀 ci.yml 裡呼叫這支閘(帶 --ref 的比值步驟)的那幾個 job(有人調低上限,這條就紅)。
  //   · verify-browser-datatable(gesture / mouse):23.6 分 = e6c88132(job 115285931534),DataTable 像素 job 74 份 log 的時間戳、成功 33 次裡最長
  //     (中位數 15.3、p90 18.6)。那是 A/A 之前、pinned 與兩支 selftest 都還在這個 job 的時候 —— 拆出 pinned 之後只會更短,保守沿用。
  //   · verify-browser-datatable-pinned(2026-11-16 拆出,覆核二 SF-R3):還沒有 CI 實測,用 2026-11-15 兩份像素 job log 的時間戳估的最壞值
  //     (2026-11-16 A25 覆核二修補,追蹤改計分 2 → 9 趟:準備 156 秒 + 量測 9 + 追蹤 9 + 開跑前判定 3 全落慢峰 37.3 秒 + 追蹤開銷 9 × 10 秒
  //     ≈ 17.2 分;改前 11.5 分;ci.yml 該 job 檔頭)。推送後換成實測。
  const SLOWEST_MS = { 'verify-browser-datatable': 23.6 * 60_000, 'verify-browser-datatable-pinned': 17.2 * 60_000 }
  const ciYml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const jobBlockOf = (id) => ciYml.split(/\n {2}(?=[a-z0-9-]+:\n)/).find((b) => b.startsWith(`${id}:\n`)) ?? ''
  const budgetRows = Object.entries(SLOWEST_MS).map(([id, slowest]) => {
    const block = jobBlockOf(id)
    const timeoutMin = Number(/\n {4}timeout-minutes: (\d+)/.exec(block)?.[1])
    const callsGate = /data-table-fast-scroll\.mjs --mode=(?:gesture|mouse|pinned) --runs=3[^\n]*\\\n\s+--ref=main/.test(block)
    return { id, slowest, timeoutMin, callsGate, ok: callsGate && Number.isFinite(timeoutMin) && slowest + EXTRA_ROUNDS_JOB_BUDGET_MS <= timeoutMin * 60_000 }
  })
  // 反過來:ci.yml 裡每一個呼叫比值步驟的 job 都要在上面那張表裡(新拆的 job 漏了估算就紅)
  const callers = ciYml.split(/\n {2}(?=[a-z0-9-]+:\n)/).filter((b) => /data-table-fast-scroll\.mjs --mode=(?:gesture|mouse|pinned) --runs=3[^\n]*\\\n\s+--ref=main/.test(b)).map((b) => b.split(':\n')[0])
  const consts = RATIO_HARD_CAP > BLANK_RATIO_LIMIT && RATIO_ALPHA <= 0.05 && MAX_EXTRA_ROUNDS >= 1 && EXTRA_ROUNDS_JOB_BUDGET_MS > 0
    && budgetRows.every((r) => r.ok) && callers.length === budgetRows.length && callers.every((c) => c in SLOWEST_MS)
  if (!consts) fail++
  console.log(`${consts ? '✓' : '✗'} 常數:${BLANK_RATIO_LIMIT} < 硬上限 ${RATIO_HARD_CAP}、α = ${RATIO_ALPHA}、加量 ≤ ${MAX_EXTRA_ROUNDS} 輪;每個 job 加量預算 ${EXTRA_ROUNDS_JOB_BUDGET_MS / 1000} 秒 + 該 job 最慢 ≤ 上限:${budgetRows.map((r) => `${r.id} ${(r.slowest / 60_000).toFixed(1)} 分 + ${EXTRA_ROUNDS_JOB_BUDGET_MS / 1000} 秒 ≤ ${r.timeoutMin} 分(${r.callsGate ? '有' : '沒有'}呼叫比值步驟)`).join(';')};ci.yml 呼叫比值步驟的 job:${callers.join('、') || '無'}`)
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
  // 灰區加量:閘真的問 nextExtraRound、真的用 extraRoundPlan 估與挑份數、真的讀寫共用帳本(覆核:整段拿掉原本照樣全綠)
  const extraSites = Object.fromEntries(['nextExtraRound', 'extraRoundPlan', 'readExtraLedger', 'chargeExtraLedger'].map((n) => [n, countCallSites(gateSrc, n)]))
  // 帳本在 CI 上真的是整個 job 共用的那一份:預設路徑取 $RUNNER_TEMP(拿掉就退回每次呼叫各算一份,上面的序列對照組就是那個後果)
  const jobWide = /const EXTRA_LEDGER = arg\('extra-budget-file', process\.env\.RUNNER_TEMP \? join\(process\.env\.RUNNER_TEMP, /.test(gateSrc)
  // 加量輪真的只量 extraRoundPlan 挑的那幾份(覆核 MF4:原本 `roundOrder(i)` 三份都重跑),而且加量只看 R1d 自己的 needs-more
  const runsPlan = /for \(const s of roundOrderOf\(served\.filter\(\(x\) => plan\.run\.includes\(x\.build\.label\)\), i\)\) await measureOne/.test(gateSrc)
  const pendingR1d = /const pending = decisions\.filter\(\(x\) => x\.decision\.verdict === 'needs-more'\)/.test(gateSrc)
  const extraOk = Object.values(extraSites).every((c) => c >= 1) && jobWide && runsPlan && pendingR1d
  if (!extraOk) fail++
  console.log(`${extraOk ? '✓' : '✗'} 可達性:灰區加量 ${Object.entries(extraSites).map(([n, c]) => `${n} ${c} 個`).join('、')}呼叫點;帳本預設在 $RUNNER_TEMP ${jobWide ? '是' : '否'};加量輪只量 plan.run ${runsPlan ? '是' : '否'};待決只認 needs-more ${pendingR1d ? '是' : '否'}`)
}

// 持續空白(checkerboard 次數)的實測資料:本機 pinned、CI 同參數(--runs=3 --tick-ms=64 --trace),2026-11-16 A25 覆核二修補報告的校準跑(`--json` 的 traceTrips)。
// 判定表、同碼置換與呼叫端行為格共用這一份(下方「持續空白」兩段)。
const CB = {
  // [名稱, 分支, 參考, A/A 那份, 期望]
  q2b: [
    ['最終(Q2b)建置對 1ac039c9,pinned 3 對 3(G-P:參考與 A/A 在中央欄原生;同一跑白幀張數地板判過)', [41, 44, 39], [10, 21, 14], [16, 12, 18], 'fail-cap'],
    ['歷來單趟追蹤(A25 實作報告:main 19 → 分支 47)', [47], [19], null, 'fail-cap'],
  ],
  // 同碼置換裡比值規則判紅、而且超出量最大的那一種分法(地板 15 必須擋下)
  same: [
    ['推 1 建置對 1ac039c9 第二跑(兩容器、轉發;超出 3)', [19, 20, 18], [15, 17, 15], [17, 16, 12]],
    ['最終建置自比第二跑(單一捲動盒、原生;超出 10 = 5 跑裡最大)', [45, 37, 52], [31, 35, 36], [29, 35, 38]],
    ['最終那一跑 main / main~aa(中央欄原生,6 趟沒有 A/A;超出 6)', [21, 16, 18], [10, 14, 12], null],
  ],
  // 每一跑的同碼追蹤趟(置換用)
  pools: [
    ['推 1 對 1ac039c9 第一跑', [14, 18, 14, 15, 8, 15, 16, 13, 15]],
    ['推 1 對 1ac039c9 第二跑', [15, 19, 20, 18, 17, 15, 17, 16, 12]],
    ['最終建置自比第一跑', [47, 40, 33, 41, 56, 45, 45, 43, 42]],
    ['最終建置自比第二跑', [45, 31, 37, 52, 35, 29, 36, 35, 38]],
    ['最終那一跑 main / main~aa', [10, 21, 14, 16, 12, 18]],
  ],
  // 呼叫端行為格的同碼那一格:[名稱, 分支, 參考, A/A 那份]
  behaviorSame: ['推 1 建置對 1ac039c9 第一跑', [16, 13, 15], [14, 18, 14], [15, 8, 15]],
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
  // 白幀序列(lib longestBlankRun 讀它算「最長連續白幀張數」):前後各墊 2 張沒有空白的幀,中間連續 `run` 張有空白
  const seriesOf = (run) => [0, 0, ...Array.from({ length: run }, () => 0.5), 0, 0]
  // 這幾格驗的是**比值那條路**的訊息:白幀張數取「毫秒 ÷ 10」(合成),讓有意義的倍數差也有 ≥ 3 張的張數差,不被白幀張數地板擋下;
  // 地板自己的格在下方「參考為 0 / 白幀張數地板」那一段(覆核二 MF-R1)。
  const blankRun = (build, ms) => ({ build, mode: 'mouse', g: { ...usableG, blankLongestMs: ms, blankFrames: 1, blankMaxBands: 1, blankSeries: seriesOf(Math.round(ms / 10)) }, frames: usableFrames, scrolled: GESTURE_PX, errors: [] })
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
  // ── A/A 修正子:呼叫端的行為(2026-11-16,A28)────────────────────────────────────────────
  // 同一份參考建置量兩次(`main~aa`)。用空白那一條(不受「零執行期差異就跳過」影響)。三格:A/A 乾淨 → 照紅;A/A 不乾淨而且分支超出量
  // 沒大過它 → 不指控、而且要印出來;A/A 那份一趟可用的都沒有 → 照原判定紅、印「A/A 量不到」(沒量到不得當乾淨也不得當放行理由)。
  {
    const aaRuns = (branch, main, aa, aaG = null) => [...ratioRuns(branch, main), ...aa.map((ms) => ({ ...blankRun('main~aa', ms), ...(aaG ? { g: { ...aaG, blankLongestMs: ms, blankSeries: seriesOf(Math.round(ms / 10)) } } : {}) }))]
    const AA_ARGS = ['--ref=main', '--assert-max-blank-ms=600', '--mode=mouse']
    const aaCases = [
      ['1.36× 分得開 + A/A 乾淨(0.99×)→ 紅,訊息附 A/A 欄', aaRuns([110, 108, 177], [84, 69, 81], [83, 70, 80]),
        (r) => r.status === 1 && /分支確實比較慢/.test(r.out) && /A\/A\(main~aa ÷ main\)0\.99×、乾淨/.test(r.out) && /A\/A 欄/.test(r.out), 'A/A 乾淨時 branch 判定不變'],
      ['1.36× 分得開 + A/A 不乾淨(同一份參考自己就差 1.36×)→ 綠,明說不指控與兩個比值', aaRuns([110, 108, 177], [84, 69, 81], [110, 108, 177]),
        (r) => r.status === 0 && /這一跑 A\/A 不乾淨/.test(r.out) && /\*\*不指控\*\*/.test(r.out) && /對 main 判 fail-separated/.test(r.out) && /對 main~aa 判 pass/.test(r.out), 'A/A 不乾淨且分支沒比其中一份參考確實慢時不得指控,也不得沒印就放行'],
      ['1.36× 分得開 + A/A 那份全部作廢 → 照紅,印「A/A 量不到」', aaRuns([110, 108, 177], [84, 69, 81], [83, 70, 80], starvedG),
        (r) => r.status === 1 && /分支確實比較慢/.test(r.out) && /A\/A 量不到/.test(r.out), '沒量到 ≠ 乾淨,也 ≠ 放行'],
      // 覆核 MF1(/tmp/claude-501/rv/aa-dir.mjs 第一組):分支比兩份參考都慢而且完全分開,A/A 不乾淨(0.80×)也照紅,訊息講「兩份參考都判紅」
      ['MF1|分支 128/130/132、main 98/100/102、main~aa 78/80/82(A/A 0.80× 不乾淨)→ 紅,分支對兩份參考都判紅', aaRuns([128, 130, 132], [98, 100, 102], [78, 80, 82]),
        (r) => r.status === 1 && /分支對兩份參考都判紅/.test(r.out) && !/\*\*不指控\*\*/.test(r.out), 'A/A 不乾淨不得讓「比兩份參考都慢」的分支過'],
      // 覆核 MF2(/tmp/claude-501/rv/aa-blank.mjs 第一組):空白超過硬上限不看分布 —— A/A 不乾淨也照紅。數字 × 10(320 ms 對 200ms):
      // 原樣 32 / 21ms 在本機 60 幀/秒下只差 1 張白幀,現在由白幀張數地板判綠(覆核二 MF-R1);這一格要驗的是「超過地板之後,A/A 不放寬」
      ['MF2|空白 1.57×(分支 320/330/340、main 200/210/220,白幀多 6 張以上)+ A/A 1.29× 不乾淨 → 紅,理由是使用者看得到的空白', aaRuns([320, 330, 340], [200, 210, 220], [260, 270, 280]),
        (r) => r.status === 1 && /超過硬上限,而且這一項是使用者看得到的空白/.test(r.out) && !/\*\*不指控\*\*/.test(r.out), '空白不放寬:A/A 也不得放寬'],
    ]
    for (const [name, runs, want, why] of aaCases) {
      const r = runGate(runs, AA_ARGS)
      if (want(r)) console.log(`✓ 行為:A/A|${name}`)
      else { console.log(`✗ 行為:A/A|${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-8).map((l) => '   ' + l).join('\n')}`); fail++ }
    }
  }
  // ── 規則 G-P:pinned 只比同一種捲動機制(2026-11-16)── 呼叫端行為。幀距那條(需要「有執行期差異」→ 用不是 git ref 的參考名)。
  {
    const pinRun = (build, ms, native, pointer = 'pinned') => ({ build, mode: 'pinned', g: { ...usableG, advanceGapMean: ms }, frames: usableFrames, scrolled: GESTURE_PX, errors: [], setup: { pinnedInScroller: native }, pinnedPointer: pointer })
    const GP_ARGS = [`--ref=${NOGIT_REF}`, '--assert-max-frame-gap-ms=100000', '--mode=pinned', '--aa=off']
    const gpCases = [
      // 覆核 SF1:參考轉發、受測原生正是 G-P 該把參考指標移到中央欄的情況;量到的仍是轉發 = 同機制那條路沒量到 → 以「儀器失效」紅,
      // 不指控分支(11-06 那種「原生 vs 轉發」比較不再發生),也不默默印 ↷ 放行
      ['參考轉發(指標在釘選欄)、受測原生,1.6× 完全分開 → G-P 沒套上 = 儀器失效,紅;不指控分支',
        [...[290, 300, 310].map((v) => pinRun('branch', v, true)), ...[180, 186, 190].map((v) => pinRun(NOGIT_REF, v, false))],
        (r) => r.status === 1 && /\*\*儀器失效\*\*:參考「main 對照\(不是 git ref\)」的釘選欄滾輪實際是元件轉發/.test(r.out) && /規則 G-P 應該把參考的指標移到中央欄/.test(r.out) && !/分支確實比較慢/.test(r.out) && !/秩檢定分得開/.test(r.out)],
      ['參考原生、受測轉發(退回 Q2b 的 PR)→ 這一側沒有同機制路徑,印 mechanism-differs、綠',
        [...[290, 300, 310].map((v) => pinRun('branch', v, false)), ...[180, 186, 190].map((v) => pinRun(NOGIT_REF, v, true))],
        (r) => r.status === 0 && /機制不同不比\(規則 G-P:參考原生、受測轉發/.test(r.out) && !/儀器失效/.test(r.out)],
      ['機制讀不到(setup 缺)→ 儀器失效,紅',
        [...[290, 300, 310].map((v) => ({ ...pinRun('branch', v, true), setup: null })), ...[180, 186, 190].map((v) => pinRun(NOGIT_REF, v, false, 'center'))],
        (r) => r.status === 1 && /\*\*儀器失效\*\*/.test(r.out) && /機制讀不到 \/ 同一份建置各趟不一致/.test(r.out)],
      ['G-P 已把參考指標移到中央欄(兩邊都原生),1.6× 完全分開 → 紅(換分母不是放寬)',
        [...[290, 300, 310].map((v) => pinRun('branch', v, true)), ...[180, 186, 190].map((v) => pinRun(NOGIT_REF, v, false, 'center'))],
        (r) => r.status === 1 && /branch\/pinned:畫面推進的幀距平均中位數/.test(r.out) && /秩檢定分得開/.test(r.out)],
      ['G-P 下同機制 1.26× 完全分開(a72ee7bf 那三趟)→ 紅',
        [...[229, 221, 229].map((v) => pinRun('branch', v, true)), ...[186, 182, 166].map((v) => pinRun(NOGIT_REF, v, false, 'center'))],
        (r) => r.status === 1 && /分支確實比較慢/.test(r.out)],
    ]
    for (const [name, runs, want] of gpCases) {
      const r = runGate(runs, GP_ARGS)
      if (want(r)) console.log(`✓ 行為:G-P|${name}`)
      else { console.log(`✗ 行為:G-P|${name}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-8).map((l) => '   ' + l).join('\n')}`); fail++ }
    }
    // 覆核 SF2:G-P 只移了參考、A/A 那份還在釘選欄(轉發)→ A/A 比的是「原生 vs 轉發」。A/A 那份的數字故意與分支相同(若被當成 A/A,
    // 會「不乾淨」而把 1.6× 的分支判成不指控);機制不同必須判「A/A 量不到」,分支照紅
    {
      const AA = `${NOGIT_REF}~aa`
      const runs = [...[290, 300, 310].map((v) => pinRun('branch', v, true)), ...[180, 186, 190].map((v) => pinRun(NOGIT_REF, v, false, 'center')), ...[290, 300, 310].map((v) => pinRun(AA, v, false, 'pinned'))]
      const r = runGate(runs, GP_ARGS.filter((a) => a !== '--aa=off'))
      const ok = r.status === 1 && /A\/A 量不到\(兩份參考的捲動機制不同/.test(r.out) && /秩檢定分得開/.test(r.out) && !/\*\*不指控\*\*/.test(r.out)
      if (!ok) { fail++; console.log(`✗ 行為:G-P|A/A 那份機制與參考不同 → A/A 量不到、分支照紅\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-8).map((l) => '   ' + l).join('\n')}`) }
      else console.log('✓ 行為:G-P|A/A 那份機制與參考不同(參考中央原生、A/A 釘選轉發)→ A/A 量不到、分支照紅(覆核 SF2)')
    }
  }
  // ── 參考的空白是 0 / 白幀張數地板(覆核 MF3 → 覆核二 MF-R1 / SF-R2;lib blankDecision)── 呼叫端行為。
  // 修前(MF3 之前)參考 0 這條路只印「退回絕對門檻」就 continue:參考 0、分支 4000–6000ms 也 exit 0(/tmp/claude-501/rv/inj-mouse.log)。
  // 覆核二:參考是不是 0 走同一條式子 —— 比值判紅 **且** 分支比參考(A/A 那份有量到時取兩份較多的)多出 > 2 張連續白幀才紅。
  {
    const zr = (build, ms, run, gap = 16.7) => ({ build, mode: 'mouse', g: { ...usableG, blankLongestMs: ms, blankFrames: ms ? Math.max(1, run ?? 1) : 0, blankMaxBands: ms ? 8 : 0, presentedGapMean: gap, ...(run == null ? {} : { blankSeries: seriesOf(run) }) }, frames: usableFrames, scrolled: GESTURE_PX, errors: [] })
    const zrRuns = (branch, main, aa = []) => [...branch.map(([ms, run, gap]) => zr('branch', ms, run, gap)), ...main.map(([ms, run, gap]) => zr('main', ms, run, gap)), ...aa.map(([ms, run, gap]) => zr('main~aa', ms, run, gap))]
    const Z0 = [[0, 0], [0, 0], [0, 0]]
    const ZR_ARGS = ['--ref=main', '--assert-max-blank-ms=600', '--mode=mouse', '--aa=off']
    const ZR_AA_ARGS = ['--ref=main', '--assert-max-blank-ms=600', '--mode=mouse']
    const zrCases = [
      ['參考 0 / 分支 150–170ms、最長連續白幀 3 張 → 紅,講「這一跑是 0」與多出的張數', zrRuns([[150, 3], [160, 3], [170, 3]], Z0), ZR_ARGS,
        (r) => r.status === 1 && /參考「main\/mouse」這一跑是 0 —— 最長連續白幀中位 分支 3 張、參考 0 張,多 3 張 > 2 張/.test(r.out)],
      ['參考 0 / 分支 0 → 綠,講「兩邊都沒有空白」,絕對門檻照判', zrRuns(Z0, Z0), ZR_ARGS,
        (r) => r.status === 0 && /兩邊都沒有空白/.test(r.out) && /改判絕對門檻 600ms/.test(r.out)],
      ['參考 0 / 分支 2 張白幀(40ms)→ 綠(多 2 張,沒超過)', zrRuns([[40, 2], [40, 2], [40, 2]], Z0), ZR_ARGS,
        (r) => r.status === 0 && /多 2 張,沒超過 2 張/.test(r.out)],
      // 覆核二 SF-R2:2026-11-15 CI 96b63b68 gesture main#1 / branch#1 / main#3 的單一呈現幀距 237 / 248 / 226ms(該趟平均 88.3 / 84.7 / 84.0)——
      // 一張白幀剛好停在那一格,修前的「毫秒 > 2 × 平均幀距」判紅;張數 = 1 → 綠
      ['覆核二 SF-R2|參考 0 / 分支一張白幀停在最長那一格(237 / 248 / 226ms,平均幀距 88 / 85 / 84)→ 綠', zrRuns([[237, 1, 88.3], [248, 1, 84.7], [226, 1, 84.0]], Z0), ZR_ARGS,
        (r) => r.status === 0 && /分支 1 張、參考 0 張,多 1 張,沒超過 2 張/.test(r.out)],
      ['參考 0 / 分支有空白卻沒有白幀序列 → 以儀器失效紅(不當通過)', zrRuns([[150, null], [160, null], [170, null]], Z0), ZR_ARGS,
        (r) => r.status === 1 && /\*\*儀器失效\*\*\(判不了/.test(r.out)],
      ['參考 0 / 分支 4000–6000ms、每趟只有 1 張白幀(畫面停在白幀上)→ 地板過,絕對門檻 600ms 紅', zrRuns([[4000, 1], [5000, 1], [6000, 1]], Z0), ZR_ARGS,
        (r) => r.status === 1 && /沒超過 2 張/.test(r.out) && /中央區最長連續空白\(絕對門檻\)中位數 5000ms > 600ms/.test(r.out)],
      ['參考 0 / 分支 4000–6000ms、30 張白幀(審查 inj-mouse 那組)→ 紅,地板與絕對門檻 600ms 都紅', zrRuns([[4000, 30], [5000, 30], [6000, 30]], Z0), ZR_ARGS,
        (r) => r.status === 1 && /多 30 張 > 2 張/.test(r.out) && /中央區最長連續空白\(絕對門檻\)中位數 5000ms > 600ms/.test(r.out)],
      // 地板以兩份參考較多的為準(MF1「兩份都紅才紅」用在地板上):參考 0、A/A 那份 1 張、分支 3 張 → 只多 2 張 → 綠;拿掉 A/A 那份同一組 → 紅(上面第一格)
      ['參考 0、A/A 那份 1 張、分支 3 張 → 綠(地板以兩份參考較多的那份為準)', zrRuns([[150, 3], [160, 3], [170, 3]], Z0, [[20, 1], [20, 1], [20, 1]]), ZR_AA_ARGS,
        (r) => r.status === 0 && /取兩份較多的 1\),多 2 張,沒超過 2 張/.test(r.out)],
      ['參考 1 張(150ms)/ 分支 4 張(600ms)→ 紅:比值 4× 超過上限,而且多 3 張', zrRuns([[600, 4], [600, 4], [600, 4]], [[150, 1], [150, 1], [150, 1]]), ZR_ARGS,
        (r) => r.status === 1 && /超過硬上限,而且這一項是使用者看得到的空白/.test(r.out) && /多 3 張 > 2 張\(白幀張數地板\)/.test(r.out)],
      ['參考 1 張(150ms)/ 分支 3 張(450ms)→ 綠:比值 3× 判紅,但只多 2 張(與參考 0 / 分支 2 張同一條線)', zrRuns([[450, 3], [450, 3], [450, 3]], [[150, 1], [150, 1], [150, 1]]), ZR_ARGS,
        (r) => r.status === 0 && /判 fail-cap\(3\.00×\),但最長連續白幀中位 分支 3 張、參考 1 張,多 2 張,沒超過 2 張 —— 在截圖量化的抖動範圍內,不指控/.test(r.out)],
      ['沒有 --ref:--assert-max-blank-ms=600、分支 700–900ms → 紅(修前沒有參考的那條路一行都沒判)', zrRuns([[700, 5], [800, 5], [900, 5]], []), ['--assert-max-blank-ms=600', '--mode=mouse'],
        (r) => r.status === 1 && /branch\/mouse:中央區最長連續空白中位數 800ms > 600ms/.test(r.out)],
      ['沒有 --ref:分支 100–130ms → 綠', zrRuns([[100, 2], [120, 2], [130, 2]], []), ['--assert-max-blank-ms=600', '--mode=mouse'],
        (r) => r.status === 0 && /branch\/mouse:中央區最長連續空白中位數 120ms ≤ 600ms/.test(r.out)],
    ]
    for (const [name, runs, args, want] of zrCases) {
      const r = runGate(runs, args)
      if (want(r)) console.log(`✓ 行為:空白地板|${name}`)
      else { console.log(`✗ 行為:空白地板|${name}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-8).map((l) => '   ' + l).join('\n')}`); fail++ }
    }
  }
  // ── 持續空白(追蹤 checkerboard 次數;2026-11-16 A25 覆核二修補;lib checkerboardDecision)── 呼叫端行為。
  // 注入物件 { results, traceTrips }(與 --json 同形)。量測趟的空白取「已知盲點」那一列的形狀(白幀張數地板判過),追蹤趟次數取本機實測(出處見 CB)。
  {
    const pinBlank = (build, ms, run, native, pointer = 'pinned') => ({ build, mode: 'pinned', g: { ...usableG, blankLongestMs: ms, blankFrames: run, blankMaxBands: 8, blankSeries: seriesOf(run) }, frames: usableFrames, scrolled: GESTURE_PX, errors: [], setup: { pinnedInScroller: native }, pinnedPointer: pointer })
    const tr = (build, counts, native, pointer = 'pinned', extra = {}) => counts.map((c, k) => ({ build, mode: 'pinned', i: k + 1, checkerboard: c, drawFrame: 80, scrolled: 18000, pinnedPointer: pointer, setup: { pinnedInScroller: native }, error: null, ...extra }))
    // Q2b 形狀:分支原生(釘選面板在共用捲動盒裡),參考與 A/A 那份由 G-P 移到中央欄(原生)
    const q2bResults = [
      ...[[127, 2], [205, 2], [267, 3]].map(([ms, run]) => pinBlank('branch', ms, run, true)),
      ...[[22, 1], [33, 2], [22, 1]].map(([ms, run]) => pinBlank('main', ms, run, false, 'center')),
      ...[[32, 2], [37, 2], [17, 1]].map(([ms, run]) => pinBlank('main~aa', ms, run, false, 'center')),
    ]
    const [, q2bMine, q2bRef, q2bAA] = CB.q2b[0]
    const q2bTrace = [...tr('branch', q2bMine, true), ...tr('main', q2bRef, false, 'center'), ...tr('main~aa', q2bAA, false, 'center')]
    // 推 1 同碼形狀:三份都是兩容器(轉發),指標都在釘選欄
    const [, sameMine, sameRef, sameAA] = CB.behaviorSame
    const sameResults = [
      ...[[23, 1], [31, 2], [20, 1]].map(([ms, run]) => pinBlank('branch', ms, run, false)),
      ...[[34, 2], [28, 1], [36, 2]].map(([ms, run]) => pinBlank('main', ms, run, false)),
      ...[[30, 2], [25, 1], [33, 2]].map(([ms, run]) => pinBlank('main~aa', ms, run, false)),
    ]
    const sameTrace = [...tr('branch', sameMine, false), ...tr('main', sameRef, false), ...tr('main~aa', sameAA, false)]
    // --trace 的值在注入模式只當「這一步判持續空白」的開關(不建目錄;不含斜線,因為 runGate 拿參數拼檔名)
    const TR_ARGS = ['--ref=main', '--assert-max-blank-ms=600', '--mode=pinned', '--trace=unused-in-inject-mode']
    const cbLine = /branch\/pinned:持續空白\(追蹤 checkerboard 次數\)/
    const cbCases = [
      [`同碼(${CB.behaviorSame[0]})→ 綠`, { results: sameResults, traceTrips: sameTrace }, TR_ARGS,
        (r) => r.status === 0 && new RegExp(`✓ ${cbLine.source}`).test(r.out)],
      [`Q2b 量級(${CB.q2b[0][0]})→ 紅;同一跑的白幀張數地板判過(它的已知盲點),紅的是這一項`, { results: q2bResults, traceTrips: q2bTrace }, TR_ARGS,
        (r) => r.status === 1 && new RegExp(`✗ ${cbLine.source}`).test(r.out) && /checkerboard 次數地板/.test(r.out) && /✓ branch\/pinned:中央區最長連續空白中位數 205ms,比值規則對參考「main\/pinned」的 22ms 判 fail-cap/.test(r.out)],
      // 對照組(這一項拿掉 = 不帶 --trace):同一組資料只剩白幀張數地板,判綠 —— 證明擋住 Q2b 量級的是這一項,不是別的
      ['對照組|同一組 Q2b 資料不帶 --trace(這一項不判)→ 綠:只靠白幀張數擋不住', { results: q2bResults, traceTrips: q2bTrace }, TR_ARGS.filter((a) => !a.startsWith('--trace=')),
        (r) => r.status === 0 && !cbLine.test(r.out)],
      ['帶 --trace 但沒有任何追蹤資料 → 儀器失效,紅(沒量到不當 0)', { results: q2bResults }, TR_ARGS,
        (r) => r.status === 1 && /✗ main\/pinned:持續空白\(追蹤 checkerboard 次數\)——\*\*儀器失效\*\*:參考「main」0 趟追蹤一趟可用的都沒有\(這一跑沒有任何追蹤資料/.test(r.out)],
      ['受測那份的追蹤全部沒量到(追蹤摘要拿不到)→ 儀器失效,紅', { results: q2bResults, traceTrips: [...tr('branch', [NaN, NaN, NaN], true, 'pinned', { error: '儀器拿不到:trace 是空的' }), ...tr('main', q2bRef, false, 'center'), ...tr('main~aa', q2bAA, false, 'center')] }, TR_ARGS,
        (r) => r.status === 1 && /✗ branch\/pinned:持續空白\(追蹤 checkerboard 次數\)——\*\*儀器失效\*\*:受測「branch」3 趟追蹤一趟可用的都沒有/.test(r.out) && /追蹤 #1 沒量到\(儀器拿不到:trace 是空的\)/.test(r.out)],
      ['追蹤趟的機制與 G-P 不符(參考那份還在釘選欄轉發、受測原生)→ 儀器失效,紅', { results: q2bResults, traceTrips: [...tr('branch', q2bMine, true), ...tr('main', q2bRef, false, 'pinned'), ...tr('main~aa', q2bAA, false, 'center')] }, TR_ARGS,
        (r) => r.status === 1 && /✗ branch\/pinned:持續空白\(追蹤 checkerboard 次數\)——\*\*儀器失效\*\*:追蹤趟的釘選欄滾輪/.test(r.out)],
    ]
    for (const [name, payload, args, want] of cbCases) {
      const r = runGate(payload, args)
      if (want(r)) console.log(`✓ 行為:持續空白|${name}`)
      else { console.log(`✗ 行為:持續空白|${name}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(-8).map((l) => '   ' + l).join('\n')}`); fail++ }
    }
  }
  rmSync(tmp, { recursive: true, force: true })
}

// ── 規則 G-P 的判定表(2026-11-16,lib pinnedMechanismPlan / pinnedComparable)──
{
  const plans = [
    ['參考轉發、受測原生(Q2b 分支對還沒合 Q2b 的 main)→ 參考指標改中央欄', pinnedMechanismPlan(false, true).refPointer, 'center'],
    ['兩邊轉發(現在的 HEAD)→ 照舊', pinnedMechanismPlan(false, false).refPointer, 'pinned'],
    ['兩邊原生(main 合入 Q2b 之後)→ 照舊,規則自動失效', pinnedMechanismPlan(true, true).refPointer, 'pinned'],
    ['參考原生、受測轉發(退回 Q2b 的 PR)→ 指標不動', pinnedMechanismPlan(true, false).why, 'ref-native-mine-forwarding'],
    ['讀不到 → 指標不動(不猜)', pinnedMechanismPlan(null, true).why, 'unknown'],
  ]
  const cmp = [
    ['同機制(兩邊原生)→ 幀距比', pinnedComparable('frameGap', [true], [true]).compare, true],
    ['G-P 生效後(參考中央 = 原生)→ 空白比', pinnedComparable('blank', [true], [true]).compare, true],
    ['參考原生、受測轉發 → 幀距不比', pinnedComparable('frameGap', [true], [false]).compare, false],
    ['參考原生、受測轉發 → 空白不比', pinnedComparable('blank', [true], [false]).compare, false],
    ['參考原生、受測轉發 → 長工照比', pinnedComparable('longSum', [true], [false]).compare, true],
    ['同一份建置各趟機制不一致 → 幀距不比(讀不清楚不比)', pinnedComparable('frameGap', [true, false], [true]).compare, false],
    ['機制讀不到(null)→ 幀距不比', pinnedComparable('frameGap', [null], [true]).compare, false],
    // 覆核 SF1:不比的理由要分清楚 —— 只有「參考原生、受測轉發」是這一側本來沒有同機制路徑;其餘是該量的沒量到(呼叫端以儀器失效紅)
    ['參考原生、受測轉發 → why = ref-native-mine-forwarding(照印、不判)', pinnedComparable('frameGap', [true], [false]).why, 'ref-native-mine-forwarding'],
    ['參考轉發、受測原生(G-P 該移指標卻量到轉發)→ why = gp-missed', pinnedComparable('blank', [false], [true]).why, 'gp-missed'],
    ['機制讀不到 → why = unreadable', pinnedComparable('frameGap', [null], [true]).why, 'unreadable'],
    ['各趟不一致 → why = unreadable', pinnedComparable('frameGap', [true, false], [true]).why, 'unreadable'],
    ['同機制 → why = same', pinnedComparable('frameGap', [false], [false]).why, 'same'],
    // 覆核 SF2:G-P 移指標要參考與 A/A 那份一起移;A/A 兩份機制不同 → A/A 量不到
    ['G-P 生效 → 參考與 A/A 那份一起移到中央欄', gpPointerLabels({ refPointer: 'center' }, { ref: 'main', aa: 'main~aa' }).join(','), 'main,main~aa'],
    ['G-P 生效、沒有 A/A(--aa=off)→ 只移參考', gpPointerLabels({ refPointer: 'center' }, { ref: 'main', aa: '' }).join(','), 'main'],
    ['G-P 沒生效 → 誰都不移', gpPointerLabels({ refPointer: 'pinned' }, { ref: 'main', aa: 'main~aa' }).join(','), ''],
    ['A/A 兩份同機制(都原生)→ 同', aaMechanismCheck([true], [true]).same, true],
    ['A/A 參考原生、A/A 那份轉發 → 不同', aaMechanismCheck([true], [false]).same, false],
    ['A/A 那份機制讀不到 → 不同(不當同)', aaMechanismCheck([true], [null]).same, false],
  ]
  for (const [name, got, want] of [...plans, ...cmp]) { const ok = got === want; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} G-P|${name} → ${got}(期望 ${want})`) }
  // 門檻 / 統計不動:G-P 只決定比不比,能比的那幾項判定式與沒有 G-P 時同一個 refRatioDecision(1.26× 完全分開 → 照紅)
  const d = refRatioDecision([229, 221, 229], [186, 182, 166], { capNeedsNoiseSupport: true })
  const gpSites = Object.fromEntries(['pinnedComparable', 'pinnedMechanismPlan', 'gpPointerLabels', 'aaMechanismCheck'].map((n) => [n, countCallSites(gateSrc0, n)]))
  const ok = d.verdict === 'fail-separated' && Object.values(gpSites).every((c) => c >= 1)
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} G-P|同機制 1.26× 完全分開仍判 ${d.verdict};閘呼叫點 ${Object.entries(gpSites).map(([n, c]) => `${n} ${c}`).join('、')}`)
}

// ── 中央區最長連續空白:比值 + 白幀張數地板(覆核 MF3 → 覆核二 MF-R1 / SF-R2;lib blankDecision;【AI 推導 2026-11-16】)──────────────
// 每趟 { ms: 最長連續空白毫秒, run: 最長連續白幀張數, gap: 平均呈現幀距 }。紅 ⇔ 比值規則判紅(參考 0 = 比值無限大)且 分支中位張數 − 參考張數 > 2
// (參考張數:A/A 那份有量到時取兩份較多的)。`blankDecisionOld` = 本次修補前的式子(參考 > 0 只看比值、參考 0 → 毫秒 > 2 × 平均幀距),
// 只當對照組:下面的判定表與性質在它身上必須抓得到覆核二指出的那幾種錯(M32「儀器要先有對照組」),突變「改回舊式子」用的也是它的原始碼。
function blankDecisionOld({ mine, ref, aa = null, aaBlockedWhy = null, canAddMore = false, frames = ZERO_REF_BLANK_FRAMES } = {}) {
  const mineMs = (mine ?? []).map((t) => t.ms), refMs = (ref ?? []).map((t) => t.ms).filter(Number.isFinite)
  if (!mineMs.length || !mineMs.every(Number.isFinite)) return { verdict: 'na' }
  if (!refMs.length) return { verdict: 'no-ref' }
  const refMedian = median(refMs), mineMedian = median(mineMs)
  if (refMedian > 0) {
    const aaRes = aa == null ? null : aaBlockedWhy ? { available: false } : aaNoise(refMs, aa.map((t) => t.ms), { capNeedsNoiseSupport: false })
    return combineWithAA(refRatioDecision(mineMs, refMs, { canAddMore, capNeedsNoiseSupport: false }), aaRes, { mineVals: mineMs, capNeedsNoiseSupport: false })
  }
  if (mineMedian === 0) return { verdict: 'pass' }
  const gaps = (mine ?? []).map((t) => t.gap).filter((v) => Number.isFinite(v) && v > 0)
  if (!gaps.length) return { verdict: 'no-scale' }
  return { verdict: mineMedian > frames * median(gaps) ? 'fail-zero-ref' : 'within-floor' }
}
const T = (ms, run, gap = 150) => ({ ms, run, gap })
const Q = (runs, gap = 150) => runs.map((r) => T(r * gap, r, gap)) // 量化資料:毫秒 = 張數 × 幀距
// [名稱, 分支, 參考, A/A 那份(null = 沒有), 期望, 其他參數]
const BLANK_TABLE = [
  // 覆核二 MF-R1 反例(覆核二報告實測):同一份資料,標籤互換不得翻轉;參考變差不得由綠變紅(CI 幀距 150ms)
  ['MF-R1|分支 150/300/300、ref 0/0/150、ref~aa 0/150/150 → 綠(多 1 張)', Q([1, 2, 2]), Q([0, 0, 1]), Q([0, 1, 1]), 'within-floor'],
  ['MF-R1|同一組標籤互換(ref 0/150/150、ref~aa 0/0/150)→ 綠(修前 fail-cap 2.00×)', Q([1, 2, 2]), Q([0, 1, 1]), Q([0, 0, 1]), 'within-floor'],
  ['MF-R1 單調鏈|參考 0/0/0 → 綠', Q([1, 2, 2]), Q([0, 0, 0]), null, 'within-floor'],
  ['MF-R1 單調鏈|參考 0/0/150 → 綠', Q([1, 2, 2]), Q([0, 0, 1]), null, 'within-floor'],
  ['MF-R1 單調鏈|參考 0/150/150 → 綠(修前參考變差反而 fail-cap)', Q([1, 2, 2]), Q([0, 1, 1]), null, 'within-floor'],
  ['MF-R1 單調鏈|參考 150/150/150 → 綠', Q([1, 2, 2]), Q([1, 1, 1]), null, 'within-floor'],
  ['MF-R1 單調鏈|參考 150/150/300 → 綠', Q([1, 2, 2]), Q([1, 1, 2]), null, 'within-floor'],
  ['MF-R1 本機量級|分支 17/33/33、參考 0/17/17(幀距 16.7)→ 綠(修前 fail-cap 1.94×)', Q([1, 2, 2], 16.7), Q([0, 1, 1], 16.7), null, 'within-floor'],
  // 覆核二 SF-R2:一張白幀落在最長那一格 → 1 張 → 過(CI 96b63b68 的單一呈現幀距 237 / 248 / 226ms,該趟平均 88.3 / 84.7 / 84.0)
  ['SF-R2|參考 0 / 分支一張白幀停在 237 / 248 / 226ms 那一格(平均幀距 88 / 85 / 84)→ 綠(修前 > 2 × 平均 → 紅)', [T(237, 1, 88.3), T(248, 1, 84.7), T(226, 1, 84.0)], Q([0, 0, 0]), null, 'within-floor'],
  // 邊界兩面(參考 0 時就是修前「> 2 張」那一條)
  ['參考 0 / 分支 0 → 綠(兩邊都沒有空白)', Q([0, 0, 0]), Q([0, 0, 0]), null, 'pass'],
  ['參考 0 / 分支 2 張 → 綠(剛好 2 張,超過才紅)', Q([2, 2, 2]), Q([0, 0, 0]), null, 'within-floor'],
  ['參考 0 / 分支 3 張 → 紅', Q([3, 3, 3]), Q([0, 0, 0]), null, 'fail-zero-ref'],
  ['參考 1 張 / 分支 3 張(3×)→ 綠(只多 2 張,與參考 0 / 分支 2 張同一條線)', Q([3, 3, 3]), Q([1, 1, 1]), null, 'within-floor'],
  ['參考 1 張 / 分支 4 張(4×)→ 紅(超過上限且多 3 張)', Q([4, 4, 4]), Q([1, 1, 1]), null, 'fail-cap'],
  ['參考 2 張 / 分支 10 張(本機 33 → 167ms)→ 紅', Q([10, 10, 10], 16.7), Q([2, 2, 2], 16.7), null, 'fail-cap'],
  // 灰區:比值 1.25–1.5 分得開才紅,地板照樣要過
  ['灰區|參考 10 張 / 分支 14 張(1.4×,3 對 3 完全分開,多 4 張)→ 紅', Q([14, 14, 14], 16.7), Q([10, 10, 10], 16.7), null, 'fail-separated'],
  ['灰區|參考 6 張 / 分支 8 張(1.33×,完全分開,只多 2 張)→ 綠', Q([8, 8, 8], 16.7), Q([6, 6, 6], 16.7), null, 'within-floor'],
  // 地板以兩份參考較多的為準(MF1「兩份都紅才紅」用在地板上);A/A 量不到 / 機制不同 → 只看 ref
  ['A/A 地板|參考 0、A/A 那份 1 張、分支 3 張 → 綠(多 2 張)', Q([3, 3, 3]), Q([0, 0, 0]), Q([1, 1, 1]), 'within-floor'],
  ['A/A 地板|同一組沒有 A/A 那份 → 紅', Q([3, 3, 3]), Q([0, 0, 0]), null, 'fail-zero-ref'],
  ['A/A 地板|A/A 那份機制與參考不同(量不到)→ 只看 ref → 紅', Q([3, 3, 3]), Q([0, 0, 0]), Q([1, 1, 1]), 'fail-zero-ref', { aaBlockedWhy: '兩份參考的捲動機制不同' }],
  ['A/A 地板|A/A 那份一趟可用的都沒有 → 只看 ref → 紅', Q([3, 3, 3]), Q([0, 0, 0]), [], 'fail-zero-ref'],
  // 沒量到不當過
  ['參考 0 / 分支有空白卻沒有白幀序列 → no-scale(呼叫端以儀器失效紅)', [T(450, NaN), T(450, NaN), T(450, NaN)], Q([0, 0, 0]), null, 'no-scale'],
  ['參考 1 張但參考沒有白幀序列、比值 4× → no-scale', Q([4, 4, 4]), [T(150, NaN), T(150, NaN), T(150, NaN)], null, 'no-scale'],
  ['比值過(1.08×)→ 不需要張數(沒有序列也過)', [T(110, NaN), T(115, NaN), T(105, NaN)], [T(100, NaN), T(104, NaN), T(98, NaN)], null, 'pass'],
  ['參考沒有資料 → no-ref(呼叫端改判絕對門檻)', Q([3, 3, 3]), [], null, 'no-ref'],
  // 張數不看每張停多久:畫面停在一張白幀上 4–6 秒 → 地板過(由絕對門檻 600ms 擋,呼叫端格驗)
  ['參考 0 / 分支每趟 1 張白幀但停 4000–6000ms → 地板過(絕對門檻另判)', [T(4000, 1), T(5000, 1), T(6000, 1)], Q([0, 0, 0]), null, 'within-floor'],
  // 本項的已知盲點,照實鎖住現況(覆核二修補時本機最終建置 pinned 實測形狀):參考不是 0、分支單一張白幀停 127 / 205ms → 白幀張數地板過。
  // 「一張白幀落在最長那一格 → 過」的直接代價;持續空白由下方「持續空白(checkerboard 次數)」那一項擋(同一個 Q2b 形狀在那裡判紅,
  // 呼叫端行為格「Q2b 量級」同時鎖住兩件事:本項判過、那一項判紅)。要改判準時這一列跟著改,不准默默變綠變紅(規格「中央區最長連續空白」節)
  ['已知盲點|參考 22 / 33 / 22ms(最長連續 1 / 2 / 1 張)、分支 127 / 205 / 267ms(最長連續 2 / 2 / 3 張;127 與 205 是另一段單一張白幀停那麼久)、A/A 2 / 2 / 1 張 → 過(9.29× 但只多 0 張)', [T(127, 2, 42.5), T(205, 2, 54.3), T(267, 3, 49.1)], [T(22, 1, 34.5), T(33, 2, 39.7), T(22, 1, 42.1)], [T(32, 2, 37.3), T(37, 2, 40.3), T(17, 1, 36.1)], 'within-floor'],
]
const bfFinal = ([, mine, ref, aa, , opt], decide = blankDecision) => decide({ mine, ref, aa, ...(opt ?? {}) }).verdict
for (const row of BLANK_TABLE) { const got = bfFinal(row); const ok = got === row[4]; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 空白地板|${row[0]} → ${got}(期望 ${row[4]})`) }
// 最長連續白幀張數(lib longestBlankRun):[名稱, blankSeries, 期望]
const RUN_TABLE = [
  ['4 張白幀但各自分開 → 最長連續 1 張(不是總數 4)', [0, 0.2, 0, 0.3, 0, 0.1, 0, 0.4], 1],
  ['連續 3 張 → 3', [0, 0.2, 0.3, 0.1, 0], 3],
  ['結尾連續 2 張 → 2', [0, 0, 1, 1], 2],
  ['沒有白幀 → 0', [0, 0, 0], 0],
  ['沒有序列 → NaN(沒量到,不當 0)', null, NaN],
]
for (const [name, series, want] of RUN_TABLE) { const got = longestBlankRun(series); const ok = Object.is(got, want); if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 白幀張數|${name} → ${got}(期望 ${want})`) }
{
  // 性質(覆核二 MF-R1):量化資料(毫秒 = 張數 × 150ms)、參考與 A/A 那份每趟 0–5 張、分支每趟 0–8 張,窮舉每一組(各取 3 趟的多重集合):
  //   (1)參考單調:參考任一趟多 1 張(毫秒跟著多)不得由綠變紅;(2)ref / ref~aa 標籤互換紅不紅不翻轉。
  // 參考中位 ≥ 6 張時比值會落進灰區,`combineWithAA` 的對稱只在 A/A 不乾淨時成立 —— 那一段不在保證內(規格照實列為邊界),所以窮舉到 5。
  // 對照組:同一個窮舉在修補前的式子(blankDecisionOld)上必須抓到違反,否則這個量具是空的。
  const props = (decide, { G = 150, K = 5, KM = 8 } = {}) => {
    const sets = (k) => { const o = []; for (let a = 0; a <= k; a++) for (let b = a; b <= k; b++) for (let c = b; c <= k; c++) o.push([a, b, c]); return o }
    const S = sets(K), SM = sets(KM), at = new Map(S.map((x, i) => [x.join(','), i]))
    const trip = (run) => ({ ms: run * G, run, gap: G })
    let n = 0, swap = 0, mono = 0, exSwap = null, exMono = null
    for (const m of SM) {
      const mt = m.map(trip)
      const R = S.map((r) => S.map((a) => decide({ mine: mt, ref: r.map(trip), aa: a.map(trip) }).verdict.startsWith('fail')))
      for (let i = 0; i < S.length; i++) for (let j = 0; j < S.length; j++) {
        n++
        if (R[i][j] !== R[j][i]) { swap++; exSwap ??= `分支 ${m} / ref ${S[i]} / ref~aa ${S[j]}` }
        if (!R[i][j]) for (let t = 0; t < 3; t++) {
          if (S[i][t] >= K) continue
          const worse = [...S[i]]; worse[t]++; worse.sort((x, y) => x - y)
          if (R[at.get(worse.join(','))][j]) { mono++; exMono ??= `分支 ${m} / ref ${S[i]} → ${worse} / ref~aa ${S[j]}` }
        }
      }
    }
    return { n, swap, mono, exSwap, exMono }
  }
  const pn = props(blankDecision), po = props(blankDecisionOld)
  const ok = pn.swap === 0 && pn.mono === 0 && pn.n > 500_000 && po.swap > 0 && po.mono > 0
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 空白地板|窮舉 ${pn.n} 組量化資料:標籤互換翻轉 ${pn.swap}${pn.exSwap ? `(例 ${pn.exSwap})` : ''}、參考變差由綠變紅 ${pn.mono}${pn.exMono ? `(例 ${pn.exMono})` : ''}(都必須 0);對照組(修補前的式子)翻轉 ${po.swap}(例 ${po.exSwap})、由綠變紅 ${po.mono}(例 ${po.exMono})(都必須 > 0)`)
  // 參考單調,非量化資料:每張停多久各自不同(0.5–3 倍幀距),參考任一趟多 1–3 張、毫秒跟著多 —— 3000 組不得由綠變紅
  let seed = 20261118
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let monoJ = 0
  for (let k = 0; k < 3000; k++) {
    const jt = (run) => ({ run, ms: run * 150 * (0.5 + rnd() * 2.5), gap: 150 })
    const mk = (hi) => Array.from({ length: 3 }, () => jt(Math.floor(rnd() * (hi + 1))))
    const mine = mk(12), ref = mk(8), aa = k % 3 ? mk(8) : null
    const i = Math.floor(rnd() * 3), add = 1 + Math.floor(rnd() * 3)
    const worse = ref.map((t, x) => (x === i ? { run: t.run + add, ms: t.ms + add * 150 * (0.5 + rnd() * 2.5), gap: 150 } : t))
    if (!blankDecision({ mine, ref, aa }).verdict.startsWith('fail') && blankDecision({ mine, ref: worse, aa }).verdict.startsWith('fail')) monoJ++
  }
  const okJ = monoJ === 0
  if (!okJ) fail++
  console.log(`${okJ ? '✓' : '✗'} 空白地板|非量化資料 3000 組:參考變差由綠變紅 ${monoJ} 組(必須 0)`)
  // 同碼置換(覆核二報告的同碼置換那一套,加上白幀張數):推 1 拆分驗證那一跑(推 1 建置 + 45d5543d 兩份,本機)每種跑法 9 趟 [毫秒, 張數, 平均幀距],
  // 分成 分支 3 / 參考 3 / A/A 3 的 1680 種分法(數字取自那一跑的 --json)。修補前的式子 mouse 判紅 83 / 1680(覆核二實測)。
  const SAME = {
    mouse: [[33.8, 2, 57.7], [215.7, 3, 57.4], [33.4, 2, 44.4], [34.9, 2, 40.5], [40.1, 2, 60.1], [53.8, 3, 44.5], [50.4, 3, 46.6], [49.9, 3, 48.3], [18.3, 1, 42.5]],
    pinned: [[70.6, 1, 38.5], [31.4, 2, 45.8], [22.6, 1, 42.2], [35.6, 2, 38.9], [44.1, 2, 41.9], [33.5, 1, 44.4], [32.9, 2, 38.3], [33.1, 1, 37.0], [17.2, 1, 46.3]],
  }
  const combos = (arr, k, start = 0, acc = [], out = []) => { if (acc.length === k) { out.push([...acc]); return out } for (let i = start; i < arr.length; i++) { acc.push(i); combos(arr, k, i + 1, acc, out); acc.pop() } return out }
  const sameRed = (rows, decide, withAA) => {
    const tr = rows.map(([ms, run, gap]) => ({ ms, run, gap })), idx = tr.map((_, i) => i)
    let red = 0, n = 0
    for (const b of combos(idx, 3)) { const rest = idx.filter((i) => !b.includes(i)); for (const r of combos(rest, 3)) {
      const a = rest.filter((i) => !r.includes(i)); n++
      if (decide({ mine: b.map((i) => tr[i]), ref: r.map((i) => tr[i]), aa: withAA ? a.map((i) => tr[i]) : null }).verdict.startsWith('fail')) red++
    } }
    return { red, n }
  }
  const sm = Object.fromEntries(Object.entries(SAME).map(([mode, rows]) => [mode, { neu: sameRed(rows, blankDecision, false), neuAA: sameRed(rows, blankDecision, true), old: sameRed(rows, blankDecisionOld, false) }]))
  const okS = Object.values(sm).every((x) => x.neu.red === 0 && x.neuAA.red === 0 && x.neu.n === 1680) && sm.mouse.old.red > 0
  if (!okS) fail++
  console.log(`${okS ? '✓' : '✗'} 空白地板|同碼置換 1680 種分法:${Object.entries(sm).map(([mode, x]) => `${mode} 新式子 ${x.neu.red}(含 A/A ${x.neuAA.red})、修補前 ${x.old.red}`).join(';')}(新式子必須 0;修補前 mouse 必須 > 0 = 量具看得到誤紅)`)
}
{
  // 可達性:閘的空白真的走 blankDecision、每趟張數真的由 blankSeries 算;比值判不了時真的退回絕對門檻;參考為 0 時另判絕對門檻;沒有參考時真的判空白絕對門檻
  const bSites = countCallSites(gateSrc0, 'blankDecision')
  const fromSeries = /run: longestBlankRun\(r\.g\?\.blankSeries\)/.test(gateSrc0)
  const fallback = /const fb = ABSOLUTE_FALLBACK\[check\.key\]\?\.\(\)/.test(gateSrc0) && /gateGroup\(k, rs, fb\.limitRaw, fb\.name, fb\.ceiling, fb\.pick\)/.test(gateSrc0)
  const zeroAbs = (gateSrc0.match(/absoluteFallback\('0ms', true\)/g) ?? []).length >= 2
  const noRefBlank = /else gate\(ASSERT_BLANK_MS, '中央區最長連續空白', CEILING_FACTOR\.blank,/.test(gateSrc0)
  const ok = bSites >= 1 && fromSeries && fallback && zeroAbs && noRefBlank && ZERO_REF_BLANK_FRAMES >= 1
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 可達性:blankDecision ${bSites} 個呼叫點;張數由 blankSeries 算 ${fromSeries ? '是' : '否'};比值判不了時退回絕對門檻 ${fallback ? '是' : '否'};參考為 0 時另判絕對門檻 ${zeroAbs ? '是' : '否'};沒有 --ref 時判空白絕對門檻 ${noRefBlank ? '是' : '否'}`)
  // ci.yml 的 pinned 步驟要真的給空白的絕對門檻(覆核 MF3:修前沒給,log 印「(未設)」)
  const ciYml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const pinnedStep = /node scripts\/data-table-fast-scroll\.mjs --mode=pinned --runs=3[^\n]*\\\n(?:[^\n]*\\\n)*[^\n]*/.exec(ciYml)?.[0] ?? ''
  const okCi = /--assert-max-blank-ms=\d+/.test(pinnedStep)
  if (!okCi) fail++
  console.log(`${okCi ? '✓' : '✗'} ci.yml|pinned 步驟有 --assert-max-blank-ms(${okCi ? '有' : '沒有'})`)
  // 覆核二 SF-R3:pinned 步驟在自己的 job(verify-browser-datatable-pinned),--trace 只留在它身上(gesture / mouse 的追蹤只是診斷)——
  // job 時間的估算以這兩件事為前提,哪一件被改回去,時間估算就不再成立
  const pinnedJob = ciYml.slice(ciYml.indexOf('\n  verify-browser-datatable-pinned:\n'), ciYml.indexOf('\n  verify-browser-datatable-perception:\n'))
  const traces = ciYml.match(/--trace=\S+/g) ?? []
  const okSplit = pinnedJob.length > 100 && pinnedJob.includes(pinnedStep) && traces.length === 1 && pinnedStep.includes(traces[0])
  if (!okSplit) fail++
  console.log(`${okSplit ? '✓' : '✗'} ci.yml|pinned 比值步驟在 verify-browser-datatable-pinned ${pinnedJob.includes(pinnedStep) && pinnedStep ? '是' : '否'};--trace 只出現 ${traces.length} 次而且在 pinned 步驟(覆核二 SF-R3)`)
}

// ── 持續空白:追蹤 checkerboard 次數(2026-11-16 A25 覆核二修補;lib checkerboardDecision;【AI 推導 2026-11-16】)──────────────
// 白幀張數(上一段)數不到「整片白而且不變」—— 截圖串流不重送,持續的白只算 1 張(上面「已知盲點」那一列)。這一項改數 CDP 追蹤裡合成器畫到
// 還沒光柵好的圖塊的次數(不靠截圖節奏)。式子與空白同一支(blankDecision 原樣重用,次數當比值值也當地板單位):
//   紅 ⇔ 比值規則判紅 且 分支中位 − max(ref 中位, ref~aa 中位) > CHECKERBOARD_FLOOR。
// 每趟次數取自本機 pinned 實測(`--json` 的 traceTrips;本機 headless 軟體光柵、CI 同參數 --runs=3 --tick-ms=64,出處見各列)。
// [名稱, 分支, 參考, A/A 那份(null = 沒有), 期望, 其他參數]
const F = CHECKERBOARD_FLOOR
const CB_TABLE = [
  ...CB.q2b.map(([tag, mine, ref, aa, want]) => [`Q2b 量級|${tag}`, mine, ref, aa, want]),
  ...CB.same.map(([tag, mine, ref, aa]) => [`同碼|${tag}(置換裡超出量最大的那一種分法)→ 過`, mine, ref, aa, 'within-floor']),
  // 邊界兩面(地板判準是「超過 F 次才紅」)
  [`參考 0 / 分支 ${F} 次 → 過(剛好 ${F} 次,超過才紅)`, [F, F, F], [0, 0, 0], null, 'within-floor'],
  [`參考 0 / 分支 ${F + 1} 次 → 紅`, [F + 1, F + 1, F + 1], [0, 0, 0], null, 'fail-zero-ref'],
  [`參考 ${2 * F} / 分支 ${3 * F} 次(1.5× 剛好不超過上限、完全分開,多 ${F})→ 過`, [3 * F, 3 * F, 3 * F], [2 * F, 2 * F, 2 * F], null, 'within-floor'],
  [`參考 ${F} / 分支 ${2 * F + 1} 次(超過上限、多 ${F + 1})→ 紅`, [2 * F + 1, 2 * F + 1, 2 * F + 1], [F, F, F], null, 'fail-cap'],
  ['兩邊相同 → 過(比值 1.00×)', [12, 15, 18], [12, 15, 18], null, 'pass'],
  // 地板以兩份參考較多的為準;A/A 量不到 / 機制不同 → 只看 ref
  [`A/A 地板|參考 ${F}、A/A 那份 ${2 * F}、分支 ${3 * F} → 過(對 ref 多 ${2 * F},對較多那份只多 ${F})`, [3 * F, 3 * F, 3 * F], [F, F, F], [2 * F, 2 * F, 2 * F], 'within-floor'],
  [`A/A 地板|同一組 A/A 那份機制與參考不同(量不到)→ 只看 ref → 紅`, [3 * F, 3 * F, 3 * F], [F, F, F], [2 * F, 2 * F, 2 * F], 'fail-cap', { aaBlockedWhy: '兩份參考的捲動機制不同' }],
  [`A/A 地板|同一組沒有 A/A 那份 → 紅`, [3 * F, 3 * F, 3 * F], [F, F, F], null, 'fail-cap'],
  ['參考沒有資料 → no-ref(呼叫端以儀器失效紅)', [40, 40, 40], [], null, 'no-ref'],
]
const cbFinal = ([, mine, ref, aa, , opt], decide = checkerboardDecision) => decide({ mine, ref, aa, ...(opt ?? {}) }).verdict
for (const row of CB_TABLE) { const got = cbFinal(row); const ok = got === row[4]; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 持續空白|${row[0]} → ${got}(期望 ${row[4]})`) }
{
  // 同碼置換(地板的由來,重算給人看):每一跑的同碼追蹤趟,分成 分支 3 / 參考 3 / A/A 3 的 1,680 種分法(只有 6 趟時 分支 3 / 參考 3 的 20 種、沒有 A/A)。
  // 地板 F 時必須 0 種紅;地板拿掉(-∞)時比值規則判紅的分法照實印出 —— 量具看得到誤紅(對照組),地板才有意義。
  const combos = (n, k, s = 0, acc = [], out = []) => { if (acc.length === k) { out.push([...acc]); return out } for (let i = s; i < n; i++) { acc.push(i); combos(n, k, i + 1, acc, out); acc.pop() } return out }
  const perm = (v, floor) => {
    let n = 0, red = 0, worst = -Infinity
    const idx = v.map((_, i) => i)
    const splits = v.length >= 9
      ? combos(9, 3).flatMap((b) => { const rest = idx.slice(0, 9).filter((i) => !b.includes(i)); return combos(6, 3).map((c) => { const r = c.map((x) => rest[x]); return [b, r, rest.filter((i) => !r.includes(i))] }) })
      : combos(v.length, 3).map((b) => [b, idx.filter((i) => !b.includes(i)), null])
    for (const [b, r, a] of splits) {
      n++
      const d = checkerboardDecision({ mine: b.map((i) => v[i]), ref: r.map((i) => v[i]), aa: a ? a.map((i) => v[i]) : null, floor })
      if (d.verdict.startsWith('fail')) { red++; worst = Math.max(worst, d.floor.excess) }
    }
    return { n, red, worst }
  }
  const rows = CB.pools.map(([tag, v]) => ({ tag, v, at: perm(v, F), none: perm(v, -Infinity) }))
  const okP = rows.every((x) => x.at.red === 0) && rows.some((x) => x.none.red > 0) && Math.max(...rows.map((x) => x.none.worst)) <= F
  if (!okP) fail++
  console.log(`${okP ? '✓' : '✗'} 持續空白|同碼置換(地板 ${F}):${rows.map((x) => `${x.tag} ${x.v.length} 趟 ${x.at.red}/${x.at.n} 紅(拿掉地板 ${x.none.red} 紅${x.none.red ? `、超出量最大 ${x.none.worst}` : ''})`).join(';')}(地板時必須全 0;拿掉地板時至少一跑 > 0 = 量具看得到誤紅;超出量最大值不得超過地板)`)
  // 性質(與白幀張數地板同一套,次數版):參考單調、ref / ref~aa 標籤互換不翻轉。保證範圍:兩份參考中位 ≤ 2F —— 地板一過,分支 ≥ 較多那份 + F + 1
  // ⇒ 對兩份的比值都 > 1.5,fail-cap 不看 A/A,兩種標法都紅;參考中位 > 2F 時比值可能落進 1.25–1.5 灰區,A/A 修正子的對稱只在 A/A 不乾淨時成立
  // (與空白「中位 ≥ 6 張」同一個邊界;Q2b 合進 main 之後兩邊都在 40 次上下 —— 那一段照實列為邊界,推送後用 CI 的 A/A 資料再核)。
  // 對照組:「地板只看 ref」的版本在同一批資料上必須抓得到翻轉。
  let seed = 20261116
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const refOnlyFloor = (p) => checkerboardDecision({ ...p, aa: null }) // 對照組:不看 A/A 那份(只看 ref)
  let swap = 0, mono = 0, swapCtl = 0, n = 0
  for (let k = 0; k < 20000; k++) {
    const mk = (lo, hi) => Array.from({ length: 3 }, () => lo + Math.floor(rnd() * (hi - lo + 1)))
    const ref = mk(0, 2 * F), aa = mk(0, 2 * F)
    if (median(ref) > 2 * F || median(aa) > 2 * F) continue
    const mine = mk(0, 5 * F); n++
    const red = (r, a, decide = checkerboardDecision) => decide({ mine, ref: r, aa: a }).verdict.startsWith('fail')
    if (red(ref, aa) !== red(aa, ref)) swap++
    if (red(ref, aa, refOnlyFloor) !== red(aa, ref, refOnlyFloor)) swapCtl++
    const i = Math.floor(rnd() * 3), worse = [...ref]; worse[i] += 1 + Math.floor(rnd() * 3)
    if (!red(ref, aa) && red(worse, aa)) mono++
  }
  const okQ = swap === 0 && mono === 0 && swapCtl > 0 && n > 10_000
  if (!okQ) fail++
  console.log(`${okQ ? '✓' : '✗'} 持續空白|隨機 ${n} 組(兩份參考中位 ≤ ${2 * F}):標籤互換翻轉 ${swap}、參考變差由綠變紅 ${mono}(都必須 0);對照組「地板只看 ref」翻轉 ${swapCtl}(必須 > 0)`)
}
{
  // 可達性:閘的持續空白真的走 checkerboardDecision(經 ratioDecision)、真的呼叫 traceGate、計分追蹤趟真的寫進 traceTrips;ci.yml 的 pinned 步驟要帶 --trace
  //(這一項只在帶 --trace 的步驟判 —— 拿掉 --trace = 這一項整個不判,所以 ci.yml 那一行是這一項的開關)
  const sites = countCallSites(gateSrc0, 'checkerboardDecision')
  const called = /\n {2}if \(REF_LABEL\) traceGate\(\)\n/.test(gateSrc0)
  const pushes = /traceTrips\.push\(\{ build: build\.label, mode, i, checkerboard:/.test(gateSrc0)
  const ciYml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const pinnedStep = /node scripts\/data-table-fast-scroll\.mjs --mode=pinned --runs=3[^\n]*\\\n(?:[^\n]*\\\n)*[^\n]*/.exec(ciYml)?.[0] ?? ''
  const okCi = /--trace=\S+/.test(pinnedStep) && /--ref=main/.test(pinnedStep)
  const ok = sites >= 1 && called && pushes && okCi && F >= 1
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 可達性:checkerboardDecision ${sites} 個呼叫點;traceGate 有呼叫 ${called ? '是' : '否'};計分追蹤趟寫進 traceTrips ${pushes ? '是' : '否'};ci.yml pinned 步驟帶 --trace 與 --ref ${okCi ? '是' : '否'}`)
}

// ── 灰區加量要量哪幾份(覆核 MF4;lib extraRoundPlan)── 有沒有 A/A,加量輪數與一輪的預估都一樣 ──
{
  const isAA = (l) => l === 'main~aa'
  const noAA = (l) => l === '(沒有 A/A)'
  const trips = [{ label: 'main', ms: 8100 }, { label: 'branch', ms: 7900 }, { label: 'main~aa', ms: 39_500 }] // A/A 那份剛好有一趟等頭像 39.5 秒
  const withAA = extraRoundPlan({ labels: ['main', 'branch', 'main~aa'], isAA, trips })
  const without = extraRoundPlan({ labels: ['main', 'branch'], isAA: noAA, trips: trips.filter((t) => t.label !== 'main~aa') })
  const XR = [
    ['有 A/A:加量輪只量 main、branch', withAA.run.join(','), 'main,branch'],
    ['有 A/A:一輪預估 = 最慢那趟(只看要量的兩份)8.1 秒 × 2 = 16.2 秒(A/A 那趟 39.5 秒不算)', withAA.estRoundMs, 16_200],
    ['沒有 A/A:同樣 16.2 秒', without.estRoundMs, 16_200],
    ['只有 A/A 那份有趟 → 估不出(NaN,不開輪)', Number.isNaN(extraRoundPlan({ labels: ['main', 'branch', 'main~aa'], isAA, trips: [{ label: 'main~aa', ms: 5000 }] }).estRoundMs), true],
  ]
  for (const [name, got, want] of XR) { const ok = got === want; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 加量份數|${name} → ${got}(期望 ${want})`) }
  // 序列:同一個 job、三種跑法都落灰區(R1d 自己的 needs-more)、共用帳本 —— 有 A/A 與沒有 A/A 加量的輪數逐輪相同
  const simulate = (plan) => {
    let text = null; const steps = []
    for (const mode of ['gesture', 'mouse', 'pinned']) {
      for (let extra = 1; ; extra++) {
        const ledger = readExtraLedger(text, 'K')
        const nx = nextExtraRound({ extra, pendingCount: 1, anyFail: false, spentMs: ledger.spentMs, estRoundMs: plan.estRoundMs })
        if (!nx.go) { steps.push(`${mode} 停(${nx.why})`); break }
        text = JSON.stringify(chargeExtraLedger(ledger, mode, plan.estRoundMs)); steps.push(`${mode} +${plan.run.length} 份`)
      }
    }
    return steps.join(' → ')
  }
  const sWith = simulate(withAA), sWithout = simulate(without)
  // 對照組:修前的做法(三份都重跑、估一輪用 3 份與 A/A 那趟)→ 輪數變少
  const sOld = simulate({ run: ['main', 'branch', 'main~aa'], estRoundMs: estimateRoundMs(trips.map((t) => t.ms), 3) })
  const ok = sWith === sWithout && sOld !== sWith
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 加量份數|有 A/A:${sWith};沒有 A/A:${sWithout}(必須相同);修前做法:${sOld}(必須不同)`)
  // A/A 修正子不產生 needs-more:3000 組隨機,最終判定是 needs-more ⇔ R1d 自己判 needs-more
  let seed = 20261117
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let mismatch = 0, nm = 0
  for (let k = 0; k < 3000; k++) {
    const mk = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => +(1 + rnd() * 399).toFixed(1))
    const mine = mk(); const ref = mk(); const aa = mk()
    for (const cap of [true, false]) {
      const d = refRatioDecision(mine, ref, { canAddMore: true, capNeedsNoiseSupport: cap })
      const f = combineWithAA(d, aaNoise(ref, aa, { capNeedsNoiseSupport: cap }), { mineVals: mine, capNeedsNoiseSupport: cap })
      if (d.verdict === 'needs-more') nm++
      if ((f.verdict === 'needs-more') !== (d.verdict === 'needs-more')) mismatch++
    }
  }
  const ok2 = mismatch === 0 && nm > 100
  if (!ok2) fail++
  console.log(`${ok2 ? '✓' : '✗'} 加量份數|A/A 修正子不產生、也不吃掉 needs-more(3000 組 × 兩種 capNeedsNoiseSupport,不一致 ${mismatch} 組;R1d 待決 ${nm} 組)`)
}

// ── A/A 修正子的判定表(2026-11-16,A28;lib aaNoise / combineWithAA)──────────────────────────────────────
// 前三列是真實 CI 數字(逐列註明 commit);**A/A 欄是構造的**(當時閘還沒有 A/A):74ac03eb 相對 4f692d17 零個執行期檔案改動
// (52ec0b6a commit message),分支三趟本來就是同一份程式碼的另一份樣本,拿來當 `main~aa`;8dc9faa7 是 Q2b 退回後那一跑
// (分支與 main 差在與捲動無關的排序 / 規格 commit),同樣拿分支三趟當同碼樣本。daae06da 的乾淨 A/A 是合成的(main 三趟 ±7%)。
// 其餘是合成列,各自守一個突變(見下方 MUTANTS)。覆核 MF1 / MF2 的反例(`/tmp/claude-501/rv/aa-dir.mjs`、`aa-blank.mjs`)原樣列進來,
// 並補對稱列(同一組數字把 main 與 main~aa 對調,判定不得翻轉)。[名稱, branch, ref, ref~aa, capNeedsNoiseSupport, canAddMore, 期望最終判定]
const AA_TABLE = [
  ['74ac03eb mouse 長工合計 1.32× 完全分開;同碼 A/A 1.32× → 分支對 main~aa 1.00× 過 → 不指控', [1747, 1466, 1206], [1060, 1111, 1181], [1747, 1466, 1206], true, false, 'aa-noisy'],
  ['8dc9faa7 gesture 幀距 1.80×(對數 t p = 0.050);同碼 A/A 1.80× → 分支對 main~aa 1.00× 過 → 不指控', [188, 148, 117], [82, 129, 74], [188, 148, 117], true, false, 'aa-noisy'],
  ['daae06da mouse 幀距 1.29× 完全分開 + 乾淨 A/A(0.98×)→ 照紅', [163.5, 182.1, 190.4], [127.5, 157.8, 141.2], [131.9, 150.6, 139.0], true, false, 'fail-separated'],
  ['合成 2× 回歸 + A/A 1.15(不乾淨)→ 分支對 main~aa 也 1.74× 分得開,兩份都紅 → 照紅', [200, 210, 195], [100, 104, 98], [115, 118, 112], true, false, 'fail-cap'],
  // 覆核 MF1:第一版把這一列寫成「A/A 方向相反也算不乾淨 → 1.32× 不指控」—— 分支對 main~aa 是 1466 / 890 = 1.65×、三趟完全分開,
  // 分支比兩份參考都慢。公式取 |ln A/A| 之後「這一跑參考偏慢」反而讓分支更容易過。改成「兩份都紅才紅」後照紅。
  ['A/A 方向相反(main~aa 比 main 快 0.80×)→ 不乾淨;但分支對 main~aa 1.65× 完全分開,兩份都紅 → 照紅', [1747, 1466, 1206], [1060, 1111, 1181], [850, 890, 900], true, false, 'fail-separated'],
  ['對稱列:同一組數字把 main 與 main~aa 對調(main 850 / 890 / 900、main~aa 1060 / 1111 / 1181)→ 照紅(標籤互換不翻轉)', [1747, 1466, 1206], [850, 890, 900], [1060, 1111, 1181], true, false, 'fail-cap'],
  ['main~aa 比 main 慢(1.26×)而分支沒慢過 main~aa(1.09×)→ 不指控', [1747, 1466, 1206], [1060, 1111, 1181], [1300, 1350, 1400], true, false, 'aa-noisy'],
  ['main~aa 比 main 快(0.84×)但有一趟離群 140,分支對 main~aa 分不開 → 不指控(偏差取絕對值:快也是量不準)', [130, 131, 132], [100, 101, 102], [80, 85, 140], true, false, 'aa-noisy'],
  ['審查反例 aa-dir 1:分支 128 / 130 / 132、main 98 / 100 / 102、main~aa 78 / 80 / 82(A/A 0.80×)→ 對 main 1.30× 分得開、對 main~aa 1.63× → 照紅', [128, 130, 132], [98, 100, 102], [78, 80, 82], true, false, 'fail-separated'],
  ['審查反例 aa-dir 2(aa-dir 1 的標籤互換)→ 照紅', [128, 130, 132], [78, 80, 82], [98, 100, 102], true, false, 'fail-cap'],
  ['審查反例 aa-dir 3:長工形狀 分支 180、main 124、main~aa 100(1.45× / 1.80×)→ 照紅', [178, 180, 182], [122, 124, 126], [98, 100, 102], true, false, 'fail-separated'],
  ['A/A 中位數 1.01×(一趟離群 2400)→ 乾淨,1.32× 照紅(A/A 取中位數,不取平均)', [1747, 1466, 1206], [1060, 1111, 1181], [1050, 1120, 2400], true, false, 'fail-separated'],
  ['A/A 1.15×(用掉門檻一半以上)→ 不乾淨;分支對 main~aa 1.15× 過 → 不指控', [1747, 1466, 1206], [1060, 1111, 1181], [1220, 1278, 1300], true, false, 'aa-noisy'],
  ['分支 1.08× → 過,A/A 不乾淨也不改變', [110, 115, 105], [100, 104, 98], [150, 160, 155], true, false, 'pass'],
  ['A/A 那份沒有可用的趟 → 照 R1d 紅(沒量到不當乾淨也不當放行)', [1747, 1466, 1206], [1060, 1111, 1181], [], true, false, 'fail-separated'],
  // 覆核 MF4:第一版這一列期望 needs-more(A/A 不乾淨也能加量)—— 加量只由 R1d 自己的 needs-more 觸發,aa-noisy 是終判
  ['不乾淨 A/A + 還能加量 → 仍是 aa-noisy(加量只由 R1d 自己的 needs-more 觸發,A/A 不吃加量預算)', [1747, 1466, 1206], [1060, 1111, 1181], [1747, 1466, 1206], true, true, 'aa-noisy'],
  ['空白(不放寬那一項)3.1× + A/A 1.15 → 照紅', [300, 310, 320], [100, 105, 110], [115, 121, 126], false, false, 'fail-cap'],
  // 覆核 MF2(/tmp/claude-501/rv/aa-blank.mjs):空白超過上限不看分布,A/A 也不得放寬(1.5–2× 這一段第一版沒人守)
  ['審查反例 aa-blank 1:空白 main 20 / 21 / 22、分支 32 / 33 / 34(1.57×,不放寬)+ A/A 1.29× 不乾淨 → 照紅', [32, 33, 34], [20, 21, 22], [26, 27, 28], false, false, 'fail-cap'],
  ['審查反例 aa-blank 2:空白分支 40 / 41 / 42(1.95×)+ A/A 1.57× 不乾淨 → 照紅', [40, 41, 42], [20, 21, 22], [32, 33, 34], false, false, 'fail-cap'],
  ['對照:同一組數字換成長工合計(放寬那一類)→ 分支對 main~aa 1.22× 過 → 不指控(只有空白不放寬)', [32, 33, 34], [20, 21, 22], [26, 27, 28], true, false, 'aa-noisy'],
]
const aaFinal = ([, mine, ref, aa, cap, canAddMore]) => combineWithAA(refRatioDecision(mine, ref, { canAddMore, capNeedsNoiseSupport: cap }), aaNoise(ref, aa, { capNeedsNoiseSupport: cap }), { mineVals: mine, capNeedsNoiseSupport: cap }).verdict
for (const row of AA_TABLE) {
  const got = aaFinal(row)
  const ok = got === row[6]
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} A/A 判定|${row[0]} → ${got}(期望 ${row[6]})`)
}
{
  // branch 對 ref 的判定逐位元不變:A/A 乾淨(或量不到)時,最終判定 = R1d 判定。固定種子 3000 組。
  let seed = 20261116
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let changed = 0, cleanSeen = 0
  for (let k = 0; k < 3000; k++) {
    const mk = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => +(1 + rnd() * 399).toFixed(1))
    const mine = mk(); const ref = mk()
    const aa = ref.map((v) => +(v * (0.97 + rnd() * 0.06)).toFixed(1)) // 乾淨:每趟 ±3%
    for (const cap of [true, false]) {
      const d = refRatioDecision(mine, ref, { canAddMore: false, capNeedsNoiseSupport: cap })
      const n = aaNoise(ref, aa, { capNeedsNoiseSupport: cap })
      if (n.clean) cleanSeen++
      if (n.clean && combineWithAA(d, n, { mineVals: mine, capNeedsNoiseSupport: cap }).verdict !== d.verdict) changed++
      if (combineWithAA(d, null, { mineVals: mine, capNeedsNoiseSupport: cap }).verdict !== d.verdict) changed++
    }
  }
  const ok = changed === 0 && cleanSeen > 1000
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} A/A 判定|A/A 乾淨或量不到時與 R1d 逐位元相同(3000 組 × 兩種 capNeedsNoiseSupport,不同 ${changed} 組;乾淨 A/A ${cleanSeen} 組)`)
  // A/A 只會讓紅變不紅(不會讓不紅變紅);而且標籤互換對稱:同一組 (branch, x, y),「ref = x、ref~aa = y」與「ref = y、ref~aa = x」
  // 在 A/A 不乾淨時最終是不是紅必須相同(覆核 MF1:第一版同一份證據只因標籤互換就翻轉)。對稱只檢查 A/A 會當修正子的那一類
  // (capNeedsNoiseSupport: true);空白超過上限不看分布(覆核 MF2),那一條以 ref 為準、A/A 不參與,本來就不對稱,不在此列。
  let extraRed = 0, swapFlip = 0, unclean = 0
  for (let k = 0; k < 3000; k++) {
    const mk = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => +(1 + rnd() * 399).toFixed(1))
    const mine = mk(); const ref = mk(); const aa = mk()
    const cap = k % 2 === 0
    const final = (r, a) => combineWithAA(refRatioDecision(mine, r, { canAddMore: false, capNeedsNoiseSupport: cap }), aaNoise(r, a, { capNeedsNoiseSupport: cap }), { mineVals: mine, capNeedsNoiseSupport: cap }).verdict
    const d = refRatioDecision(mine, ref, { canAddMore: false, capNeedsNoiseSupport: cap })
    const f1 = final(ref, aa), f2 = final(aa, ref)
    if (!d.verdict.startsWith('fail') && f1.startsWith('fail')) extraRed++
    const n = aaNoise(ref, aa, { capNeedsNoiseSupport: cap })
    if (cap && n.available && !n.clean) { unclean++; if (f1.startsWith('fail') !== f2.startsWith('fail')) swapFlip++ }
  }
  const ok2 = extraRed === 0 && swapFlip === 0 && unclean > 500
  if (!ok2) fail++
  console.log(`${ok2 ? '✓' : '✗'} A/A 判定|A/A 不會讓原本不紅的變紅(3000 組隨機 A/A,多紅 ${extraRed} 組);A/A 不乾淨時 main 與 main~aa 標籤互換、紅不紅不翻轉(長工合計 / 幀距那一類不乾淨 ${unclean} 組,翻轉 ${swapFlip} 組)`)
  // 拉丁方輪轉:三份時每一份在每個位置各出現一次;兩份時與舊的 ABBA 逐位元相同
  const L = ['main', 'branch', 'main~aa']
  const pos = L.map((b) => [1, 2, 3].map((i) => roundOrderOf(L, i).indexOf(b)).sort().join(''))
  const abba = [1, 2, 3, 4].map((i) => roundOrderOf(['a', 'b'], i).join('')).join(',')
  const okL = pos.every((p) => p === '012') && abba === 'ab,ba,ab,ba'
  if (!okL) fail++
  console.log(`${okL ? '✓' : '✗'} A/A 輪轉|三份三輪每份在每個位置各一次(${pos.join(' / ')});兩份 ${abba}`)
}
// ── 突變測試(M32「弄壞會紅」):把 lib 的 A/A、參考為 0、G-P、加量份數那幾行各改壞一處,對應的判定表必須至少一列不符 ──
// 突變版寫到固定路徑(node_modules/.cache,與 test-gen-design-system-barrel 同一個做法:被啟動的檔路徑必須能被 harness 來源清單靜態審查),
// 檔尾附一段讀判定表、印每張表結果的程式;未突變的原樣也跑一次,證明這個量具本身量得到「全部相符」。
{
  const libSrc = readFileSync(new URL('./lib/fast-scroll-gate-policy.mjs', import.meta.url), 'utf8')
  const MUTANT_FILE = join(import.meta.dirname, '..', 'node_modules', '.cache', 'fast-scroll-aa-mutant.mjs')
  // G-P / A/A 機制 / 加量份數的小表:[種類, 引數, 期望](輸出一律轉成字串比)
  const GP_MUT = [
    ['cmp', ['blank', [false], [true]], 'false/gp-missed'],
    ['cmp', ['frameGap', [true], [false]], 'false/ref-native-mine-forwarding'],
    ['cmp', ['frameGap', [null], [true]], 'false/unreadable'],
    ['cmp', ['frameGap', [true], [true]], 'true/same'],
    ['ptr', [{ refPointer: 'center' }, { ref: 'main', aa: 'main~aa' }], 'main,main~aa'],
    ['aam', [[true], [false]], 'false'],
    ['aam', [[true], [true]], 'true'],
  ]
  const XR_MUT = [
    [['main', 'branch', 'main~aa'], 'main~aa', [{ label: 'main', ms: 8100 }, { label: 'branch', ms: 7900 }, { label: 'main~aa', ms: 39_500 }], 'main,branch|16200'],
  ]
  const FOOTER = `\nimport { readFileSync as __mutRead } from 'node:fs'\n{\n  const t = JSON.parse(__mutRead(process.argv[2], 'utf8'))\n  const out = {\n    aa: t.aa.map(([, mine, ref, aa, cap, canAddMore]) => combineWithAA(refRatioDecision(mine, ref, { canAddMore, capNeedsNoiseSupport: cap }), aaNoise(ref, aa, { capNeedsNoiseSupport: cap }), { mineVals: mine, capNeedsNoiseSupport: cap, canAddMore }).verdict),\n    bf: t.bf.map(([, mine, ref, aa, , opt]) => blankDecision({ mine, ref, aa, ...(opt ?? {}) }).verdict),\n    lr: t.lr.map(([, series]) => String(longestBlankRun(series))),\n    gp: t.gp.map(([kind, a]) => kind === 'cmp' ? (({ compare, why }) => compare + '/' + why)(pinnedComparable(...a)) : kind === 'ptr' ? gpPointerLabels(...a).join(',') : String(aaMechanismCheck(...a).same)),\n    xr: t.xr.map(([labels, aaLabel, trips]) => (({ run, estRoundMs }) => run.join(',') + '|' + estRoundMs)(extraRoundPlan({ labels, isAA: (l) => l === aaLabel, trips }))),\n    cb: t.cb.map(([, mine, ref, aa, , opt]) => checkerboardDecision({ mine, ref, aa, ...(opt ?? {}) }).verdict),\n  }\n  process.stdout.write(JSON.stringify(out))\n}\n`
  // JSON 沒有 NaN:白幀張數「沒量到」的 NaN 寫成 null,突變版讀回來是 null —— 對 blankDecision 等價(都不是有限數)
  const tables = { aa: AA_TABLE, bf: BLANK_TABLE, lr: RUN_TABLE, gp: GP_MUT, xr: XR_MUT, cb: CB_TABLE }
  const want = { aa: AA_TABLE.map((r) => r[6]), bf: BLANK_TABLE.map((r) => r[4]), lr: RUN_TABLE.map((r) => String(r[2])), gp: GP_MUT.map((r) => r[2]), xr: XR_MUT.map((r) => r[3]), cb: CB_TABLE.map((r) => r[4]) }
  const label = { aa: AA_TABLE.map((r) => r[0]), bf: BLANK_TABLE.map((r) => r[0]), lr: RUN_TABLE.map((r) => r[0]), gp: GP_MUT.map((r) => `${r[0]} ${JSON.stringify(r[1])}`), xr: XR_MUT.map(() => '加量份數'), cb: CB_TABLE.map((r) => r[0]) }
  const MUTANTS = [
    // [名稱, 突變, 必須紅的那張表(null = 原樣、全部都必須相符)]
    ['原樣(量具對照:必須全部相符)', (s) => s, null],
    ['A/A|拿掉 A/A(不乾淨也照紅)', (s) => s.replace('  if (!aa || !aa.available || aa.clean) return out\n', '  return out\n'), 'aa'],
    ['A/A|偏差改帶號(不取絕對值)', (s) => s.replace('const a = Math.abs(Math.log(ratio))', 'const a = Math.log(ratio)'), 'aa'],
    ['A/A|不取中位數(改平均)', (s) => s.replace('const mr = ref.length ? median(ref) : NaN, ma = aa.length ? median(aa) : NaN', 'const mr = ref.length ? ref.reduce((x, y) => x + y, 0) / ref.length : NaN, ma = aa.length ? aa.reduce((x, y) => x + y, 0) / aa.length : NaN'), 'aa'],
    // 突變值用 join 拼(不寫成「常數 = 值」的字面,named-constant-drift 才不會把突變當成第二份常數)
    ['A/A|½ 改成 1(A/A 用掉整個門檻才算不乾淨)', (s) => s.replace(`export const AA_NOISE_SHARE = ${AA_NOISE_SHARE}`, ['export', 'const', 'AA_NOISE_SHARE', '=', 2 * AA_NOISE_SHARE].join(' ')), 'aa'],
    ['MF1|只對 ref 比(改回第一版 e − |ln A/A| > ln 1.25)', (s) => s.replace("  const vsAA = refRatioDecision(mineVals, aa.aaVals, { limit, canAddMore: false, capNeedsNoiseSupport })\n  if (vsAA.verdict.startsWith('fail')) return { ...out, beyondAA: true, vsAA }", '  const vsAA = null\n  if (Math.log(d.mineMedian / d.refMedian) - aa.a > Math.log(limit)) return { ...out, beyondAA: true, vsAA }'), 'aa'],
    ['MF2|不放寬的那一項也讓 A/A 放寬(拿掉 capBasis 檢查)', (s) => s.replace("  if (d.capBasis === 'no-noise-allowance') return out\n", ''), 'aa'],
    ['MF4|aa-noisy 能加量時改回 needs-more', (s) => s.replace('export function combineWithAA(d, aa, { mineVals, capNeedsNoiseSupport, limit = BLANK_RATIO_LIMIT } = {}) {', 'export function combineWithAA(d, aa, { mineVals, capNeedsNoiseSupport, limit = BLANK_RATIO_LIMIT, canAddMore = false } = {}) {').replace("  return { ...out, verdict: 'aa-noisy', aaNoisy: true, vsAA }", "  return { ...out, verdict: canAddMore ? 'needs-more' : 'aa-noisy', aaNoisy: true, vsAA }"), 'aa'],
    ['MF4|加量輪三份都重跑(A/A 那份也進加量)', (s) => s.replace('  const run = labels.filter((l) => !isAA(l))', '  const run = labels'), 'xr'],
    // 覆核二 MF-R1 / SF-R2(白幀張數地板):改回舊式子(參考 > 0 只看比值、參考 0 → 毫秒 > 2 × 平均幀距)= 上方 blankDecisionOld 的原始碼原樣換進去
    ['MF-R1|改回舊式子(修補前那一版)', (s) => s.replace(/export function blankDecision\([\s\S]*?\n\}\n/, `export ${blankDecisionOld.toString().replace('function blankDecisionOld(', 'function blankDecision(')}\n`), 'bf'],
    ['MF-R1|拿掉地板(比值判紅就紅)', (s) => s.replace('  if (floor.excess > frames) return out\n', '  return out\n'), 'bf'],
    ['MF-R1|地板只看 ref(不看 A/A 那份)', (s) => s.replace('  floor.baseRun = Number.isFinite(floor.aaRun) ? Math.max(floor.refRun, floor.aaRun) : floor.refRun', '  floor.baseRun = floor.refRun'), 'bf'],
    ['MF-R1|地板 2 張改成 3 張', (s) => s.replace(`export const ZERO_REF_BLANK_FRAMES = ${ZERO_REF_BLANK_FRAMES}`, ['export', 'const', 'ZERO_REF_BLANK_FRAMES', '=', ZERO_REF_BLANK_FRAMES + 1].join(' ')), 'bf'],
    ['MF-R1|沒有白幀序列當成過(沒量到 → 放行)', (s) => s.replace("  if (!Number.isFinite(floor.excess)) return { ...out, verdict: 'no-scale', ratioVerdict: d.verdict }", "  if (!Number.isFinite(floor.excess)) return { ...out, verdict: 'within-floor', ratioVerdict: d.verdict }"), 'bf'],
    ['SF-R2|最長連續改成總白幀數', (s) => s.replace('  for (const v of series) { if (v > 0) { run++; if (run > best) best = run } else run = 0 }', '  for (const v of series) { if (v > 0) { run++; if (run > best) best = run } }'), 'lr'],
    ['SF1|G-P 沒套上當成「這一側沒有同機制路徑」', (s) => s.replace("ref === false && mine === true ? 'gp-missed'", "ref === false && mine === true ? 'ref-native-mine-forwarding'"), 'gp'],
    ['SF2|G-P 只移參考、A/A 那份不移', (s) => s.replace('[ref, aa].filter(Boolean)', '[ref].filter(Boolean)'), 'gp'],
    ['SF2|A/A 兩份機制不比', (s) => s.replace('  return { same: ref !== null && ref === aa, ref, aa }', '  return { same: true, ref, aa }'), 'gp'],
    // 持續空白(checkerboard 次數,A25 覆核二修補):地板放大到擋不住 Q2b、次數不進地板、A/A 那份不傳 —— 各讓 cb 表紅
    ['持續空白|地板放大 10 倍', (s) => s.replace(`export const CHECKERBOARD_FLOOR = ${CHECKERBOARD_FLOOR}`, ['export', 'const', 'CHECKERBOARD_FLOOR', '=', CHECKERBOARD_FLOOR * 10].join(' ')), 'cb'],
    ['持續空白|次數不進地板(地板單位恆 0)', (s) => s.replace('xs.map((c) => ({ ms: c, run: c }))', 'xs.map((c) => ({ ms: c, run: 0 }))'), 'cb'],
    ['持續空白|A/A 那份不傳(地板只看 ref)', (s) => s.replace('aa: trips(aa), aaBlockedWhy', 'aa: null, aaBlockedWhy'), 'cb'],
  ]
  const rowsFile = join(mkdtempSync(join(tmpdir(), 'fast-scroll-aa-table-')), 'rows.json')
  writeFileSync(rowsFile, JSON.stringify(tables))
  mkdirSync(dirname(MUTANT_FILE), { recursive: true })
  for (const [name, mutate, mustBreak] of MUTANTS) {
    const src = mutate(libSrc)
    if (mustBreak && src === libSrc) { console.log(`✗ 突變|${name}:突變沒套上(找不到要改的那一行)—— 這個突變測試是空的`); fail++; continue }
    writeFileSync(MUTANT_FILE, src + FOOTER)
    const r = spawnSync(process.execPath, ['--', MUTANT_FILE, rowsFile], { encoding: 'utf8' })
    let got = null
    try { got = JSON.parse(r.stdout) } catch { /* 下面判 */ }
    if (!got || typeof got !== 'object') { console.log(`✗ 突變|${name}:突變版跑不起來(exit ${r.status})${(r.stderr || '').split('\n')[0]}`); fail++; continue }
    const wrongOf = (k) => want[k].map((w, i) => [label[k][i], w, got[k]?.[i]]).filter(([, w, g]) => w !== g)
    const wrong = mustBreak ? wrongOf(mustBreak) : Object.keys(want).flatMap(wrongOf)
    const ok = mustBreak ? wrong.length > 0 : wrong.length === 0
    if (!ok) fail++
    console.log(`${ok ? '✓' : '✗'} 突變|${name} → ${mustBreak ? `${mustBreak} 表` : '全部表'} ${wrong.length} 列不符${wrong.length ? `(例:${wrong[0][0]} 期望 ${wrong[0][1]} 得 ${wrong[0][2]})` : ''}${mustBreak ? '(必須 ≥ 1)' : '(必須 0)'}`)
  }
  rmSync(MUTANT_FILE, { force: true })
}
{
  // 可達性:閘真的用 lib 的 A/A(呼叫點不含 import)
  const sites = Object.fromEntries(['aaNoise', 'combineWithAA', 'roundOrderOf'].map((n) => [n, countCallSites(gateSrc0, n)]))
  const addsAA = /BUILDS\.push\(\{ label: AA_LABEL, dir: refBuild\.dir, aa: true \}\)/.test(gateSrc0)
  const ok = Object.values(sites).every((c) => c >= 1) && addsAA
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 可達性:A/A ${Object.entries(sites).map(([n, c]) => `${n} ${c} 個`).join('、')}呼叫點;有 --ref 時自動加 A/A 那份建置 ${addsAA ? '是' : '否'}`)
}

console.log(fail ? `\n✗ ${fail} 項判定不符` : '\n✓ 判定政策對照組全過:該紅的紅、該綠的綠(含呼叫端行為)')
process.exit(fail ? 1 : 0)
