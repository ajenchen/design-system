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
import { classifyRun, gateVerdict, CEILING_FACTOR, longTaskLimit, refRatioVerdict, refRatioDecision, mannWhitneyGreaterP, advanceGapStats, median, BLANK_RATIO_LIMIT, RATIO_HARD_CAP, RATIO_ALPHA, MAX_EXTRA_ROUNDS, EXTRA_ROUNDS_JOB_BUDGET_MS, nextExtraRound, estimateRoundMs, readExtraLedger, chargeExtraLedger, MIN_PRESENTED_FRAMES } from './lib/fast-scroll-gate-policy.mjs'

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
// 判定表:每一列都是真實量到的每趟數字(CI = DataTable 像素 job,逐列註明 commit / job)。
// 676a298e / a893fa72 / c6c192a1 這三列是**舊指標**(全部呈現幀)的值 —— 判準照樣判它們紅;它們之所以出現,
// 是指標把 main 的補畫幀算成順暢度(見下方「畫面推進的幀」那一段與 lib advanceGapStats),不是判準該放過它們。
const DECISION_CASES = [
  // [名稱, 分支每趟, 參考每趟, canAddMore, 期望]
  ['676a298e CI 釘選區幀距 1.36×(job 115415034689,3 對 3 完全分開)→ 紅', [110.4, 108.2, 177.4], [84.0, 68.9, 81.0], true, 'fail-separated'],
  ['a893fa72 CI 釘選區幀距 1.69×(job 115469075452)→ 紅,超過硬上限', [231.8, 232.7, 223.0], [146.5, 131.0, 137.4], true, 'fail-cap'],
  ['c6c192a1 CI 釘選區幀距 1.84×(job 115497110821 被取消前只量到 1 對 1)→ 紅,超過硬上限', [215.9], [117.2], true, 'fail-cap'],
  // 1ef86547 相對前一跑 f0dbaf5a **零個執行期檔案改動**(job 115112475329):舊判準 1.38× 紅 = 誤紅
  ['1ef86547 CI(零執行期改動)釘選區幀距 1.38× → 不紅,先加量', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], true, 'needs-more'],
  ['1ef86547 同一組、已不能再加量 → 不紅,差距在雜訊內', [62.7, 47.5, 63.0], [48.6, 45.2, 45.5], false, 'within-noise'],
  ['1ef86547 CI 釘選區長工合計 1.38× → 不紅,先加量', [1890, 1236, 1986], [1534, 1073, 1370], true, 'needs-more'],
  // 覆核反例:調查版補丁「分布重疊就綠」沒有倍數上限,3 倍回歸只要一趟偏快就放行(p = 0.067)
  ['3 倍回歸、5 趟裡有一趟偏快 → 紅,不看 p', [300, 310, 320, 330, 90], [100, 105, 110, 95, 100], false, 'fail-cap'],
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
  ['1.51× → 超過硬上限,紅', [151, 151, 151], [100, 100, 100], true, 'fail-cap'],
  // 676a298e 那三趟再補兩趟落在參考範圍內的(70 / 79、92 / 75 為構造值,用來覆蓋 within-noise 分支)
  ['灰區 1.34×、5 對 5 分布重疊、不能再加量 → 不紅', [110.4, 108.2, 177.4, 70, 79], [84.0, 68.9, 81.0, 92, 75], false, 'within-noise'],
  ['參考沒有可當分母的值(兩邊空白都是 0)→ skip', [0, 0, 0], [0, 0, 0], true, 'skip'],
]
for (const [name, mine, ref, canAddMore, want] of DECISION_CASES) {
  const d = refRatioDecision(mine, ref, { canAddMore })
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
    const newPass = refRatioDecision(mine, ref, { canAddMore: true }).verdict === 'pass'
    if (oldPass !== newPass) mismatch++
  }
  const ok = mismatch === 0
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 比值判定|≤ ${BLANK_RATIO_LIMIT}× 與舊判準逐位元相同(3000 組隨機,不一致 ${mismatch} 組)`)
  // 對照組:舊判準(只比中位數)對零改動的 1ef86547 判紅;新判準不紅 —— 證明新判準真的在起作用
  const old = refRatioVerdict(median([62.7, 47.5, 63.0]), median([48.6, 45.2, 45.5]))
  const proves = old === 'fail' && !refRatioDecision([62.7, 47.5, 63.0], [48.6, 45.2, 45.5], { canAddMore: true }).verdict.startsWith('fail')
  if (!proves) fail++
  console.log(`${proves ? '✓' : '✗'} 對照組:舊判準對零改動的 1ef86547 判 ${old};新判準不在 3 對 3 指控`)
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
    ['3.1×、5 趟裡一趟偏快 → 紅,超過硬上限', ratioRuns([300, 310, 320, 330, 90], [100, 105, 110, 95, 100]),
      (r) => r.status === 1 && /超過硬上限/.test(r.out), '大回歸不看分布'],
  ]
  for (const [name, runs, want, why] of ratioCases) {
    const r = runGate(runs, RATIO_ARGS)
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
