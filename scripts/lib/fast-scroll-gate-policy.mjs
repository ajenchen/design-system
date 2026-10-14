/**
 * 快速捲動閘的「效能門檻判定政策」(2026-09-11 從 data-table-fast-scroll.mjs 抽出成純函式,
 * 好讓 scripts/test-fast-scroll-gate-policy.mjs 拿真實 CI 數字當判定表驗它)。
 *
 * 政策:效能門檻判**同一 build 的中位數**,不判單趟最大值;另留一道「單趟天花板 = 門檻 × ceiling」
 * 擋單趟災難級停頓。理由與證據見 data-table-fast-scroll.mjs 斷言段的註解。
 */
export const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

/**
 * 每個指標的「單趟天花板」倍數。
 *
 * 空白 / 補齊是從幾十幀算出來的量,單趟異常確實代表那一趟很糟 → ×2。
 * **長工最長、幀距最大這兩個本身就已經是 max**,再套一層 max 判定會對共享 runner 的雜訊過度敏感:
 * 2026-09-11 的 68f5c9af 在 CI 量到 111 / 115 / **664**ms(中位 115,跟已發布的 eb5b42fc 的 124/136 同一檔),
 * 同一份建置在本機 4× 節流跑 5 趟是 141 / 164ms、跟修前的 135 / 148 沒有差別 —— 那 664 是 runner 被搶走,不是回歸。
 * 真回歸會把**中位數**帶上去(把主執行緒最長任務從 66 推到 661ms 的那一版,中位就是 661),中位數判得到,
 * 所以這兩個指標的天花板放寬到 ×3,偵測力交給中位數。
 */
export const CEILING_FACTOR = { blank: 2, fill: 2, longTask: 3, frameGap: 3 }

/** 回傳 'pass' | 'median'(中位數超標)| 'ceiling'(中位數過但有一趟超過門檻×ceiling)。 */
export const gateVerdict = (vals, limit, ceiling = 2) => {
  if (!vals.length) return 'pass'
  const mid = median(vals)
  const worst = Math.max(...vals)
  return mid > limit ? 'median' : worst > limit * ceiling ? 'ceiling' : 'pass'
}

/**
 * 長工門檻要**相對於這台機器自己的能力**(2026-09-11)。
 *
 * 為什麼:`--assert-max-long-task-ms=300` 是當年 CI runner 基線 64–66ms 時訂的絕對值。
 * 現在**同一份元件邏輯**(git diff 去掉註解後零差異)在 CI 上量到長工中位 101 / 110 / 343 / 352ms,
 * 而同一跑之內第 3 趟是 116ms —— 分布雙峰,是 runner 間歇被搶,不是程式碼變了。
 * 絕對門檻在漂動的基線上只會一直誤紅。
 *
 * 尺度取什麼:捲動中最長的那個任務,主體就是「一次 commit 畫一批列」。那批列的規模上限約兩個視窗
 * (追趕時會多畫),所以用元件自己量的「畫一個視窗要多久」(`viewportDrawMs`)× 2 當下限,
 * 與原本的絕對門檻取較大者。快機器 `viewportDrawMs` 小 → 仍然吃 300ms 的絕對門檻;
 * 慢 runner → 門檻跟著它的能力放大,但**不是無限放大**:它跟著的是「畫一個視窗要多久」,
 * 而那個值本身若因回歸而變大,空白與補齊兩條**絕對**斷言會先紅(那兩條是使用者真的看得到的東西)。
 *
 * 驗證用的歷史數字:661ms 的把手回歸發生在 `viewportDrawMs ≈ 174ms` 的 runner 上 → 門檻 348ms → 仍然紅。
 */
export const longTaskLimit = (absoluteLimit, viewportDrawMs) =>
  Number.isFinite(viewportDrawMs) && viewportDrawMs > 0
    ? Math.max(absoluteLimit, viewportDrawMs * 2)
    : absoluteLimit

/**
 * **跟同一個 job 裡的參考建置比,而不是跟絕對值比**(2026-09-11)。
 *
 * 問題:空白門檻 400ms 是絕對值,但 CI runner 自己會漂。**同一份元件邏輯**(git diff 去掉註解後與 4ea6a462 零差異)
 * 在 CI 上量到空白中位 162 / 325 / 485 / 471 / 687ms —— 4 倍散佈,絕對門檻只是在量那台機器。
 *
 * **試過並撤回:用「每個 scroll 事件忙等 120ms」的固定工作量對照當正規化基準。**
 * 它不行,因為**會飽和** —— 它的空白被注入的 120ms 主導,對機器慢度相對不敏感:
 * 同一段期間對照只從 737 走到 1198ms(1.6×),被判定的那一跑卻從 162 走到 687ms(4.2×);
 * 而且同一個 job 內它自己就量到 825 與 1198(1.45× 差)。拿它當分母只會把真實差距壓掉。
 *
 * **正確的參考點必須有同樣的工作量與同樣的敏感度** —— 也就是同一支 story 的另一個建置(main)。
 * 同 job、交錯量測,機器狀態一致,比值才有意義。這也正是 user 一直要的「把 main 當低標」。
 *
 * 比值上限 1.25:允許 25% 的跑間雜訊,但擋得住任何有意義的退步。
 * 歷史校驗(同一支閘的真實數字):`119e279f` 的骨架門檻回歸是 438 / 476ms,而同期 main 量到 801 / 884ms ——
 * 那一版對 main 的比值是 0.55,**不會誤紅**;而把主執行緒最長任務從 66 推到 661ms 的那一版,
 * 對應的空白會遠超過 main 的 1.25 倍。
 */
export const BLANK_RATIO_LIMIT = 1.25

/** 回傳 'pass' | 'fail';ref 缺席時回 'skip'(呼叫端要印出來,不可靜默)。 */
export const refRatioVerdict = (buildMedian, refMedian, limit = BLANK_RATIO_LIMIT) => {
  if (!Number.isFinite(refMedian) || refMedian <= 0) return 'skip'
  return buildMedian <= refMedian * limit ? 'pass' : 'fail'
}

/**
 * **比值超過 1.25 ≠ 已證明變慢**(2026-10-14,PR #169 `R1a`)。
 *
 * 舊判準只看「兩邊各 3 趟中位數相除 > 1.25」。共享 runner 上同一份建置每趟就差 20–30%,
 * 3 對 3 的中位數比值本身就會晃過 1.25 —— 1ef86547 相對前一跑 f0dbaf5a **零個執行期檔案改動**,
 * 釘選區幀距 0.94 → 1.38 判紅。但也不能為了穩定把真回歸放掉(調查版補丁的「分布重疊就綠」沒有倍數上限,
 * 3 倍回歸只要有一趟偏快就會放行 —— 覆核當場用判定式算出 3.10× p = 0.067 判綠)。所以分三段:
 *
 *   1. 中位數比值 ≤ `BLANK_RATIO_LIMIT`(1.25)→ 'pass'。與舊判準**逐位元相同**(同一個 `refRatioVerdict`),一趟都不多跑。
 *   2. 中位數比值 > `RATIO_HARD_CAP`(1.5)→ 'fail-cap'。**不看 p**:差到這個程度,分布重不重疊都是回歸。
 *   3. 中間的灰區 → 單側精確 Mann–Whitney(分支比參考慢)p ≤ `RATIO_ALPHA` → 'fail-separated';
 *      否則還能加量(`canAddMore`)→ 'needs-more'(呼叫端延續 ABBA 交錯再量一輪,有上限);
 *      不能再加 → 'within-noise':差距落在跑間雜訊內,照實印出比值、p 與每趟數字,不指控。
 *
 * 校準(只用修改前、與本案無關的 CI 跑;**排除 676a298e 本身與 297b22be 儀器作廢那跑**):
 * 2026-09-27 → 10-13 共 42 跑、208 項比值判定(舊指標:全部呈現幀),舊判準紅 9 項;新判準 cap 紅 4 項(b5757ee6 兩項、
 * 0464ba54 長工一項 —— 前一輪調查報告記為該期樣式重算確實出過問題;a6d2ee1d 一項,真假未查)、灰區分得開紅 2 項
 * (8e9a370f、0080776a 的 mouse 長工,3 對 3 完全分開)、灰區要加量 3 項(含零改動的 1ef86547 兩項)。
 * 判定表在 `scripts/test-fast-scroll-gate-policy.mjs`(CI 真實數字,逐列註明 commit)。
 */
export const RATIO_HARD_CAP = 1.5
export const RATIO_ALPHA = 0.05
/**
 * 灰區加量的上限(2026-10-14 覆核後改):每種跑法最多再交錯量 `MAX_EXTRA_ROUNDS` 輪(每輪每個 build 一趟);
 * 而且**整個 job** 的加量合計不超過 `EXTRA_ROUNDS_JOB_BUDGET_MS` —— 三種跑法是同一個 job 裡的三次呼叫,
 * 預算由它們共用(帳本在 `$RUNNER_TEMP`,見閘的 EXTRA_LEDGER),不是每次呼叫各算一份。
 * 每一輪(含第一輪)開跑前都先估、先檢查(`nextExtraRound`),這種跑法已經有任何一項判紅就不再加量。
 *
 * 為什麼是 60 秒、為什麼一輪用「最慢那趟」估(CI 實測,DataTable 像素 job 74 份 log 的時間戳):
 *   · 這個 job 成功時 33 次:中位數 15.3 分、p90 18.6 分、最長 23.6 分(e6c88132),上限 25 分。
 *     最慢那次只剩 84 秒 —— 加量預算必須放得進這 84 秒,不能只用 p90 論證(被砍 = cancelled,沒失敗 ≠ 過了,M37)。
 *   · 一趟的牆鐘是**雙峰、隨機混在同一種跑法裡**:三種跑法都跑到的 29 個 job 共 431 趟,202 趟 5–11 秒、229 趟 35–41 秒
 *     (後者在等遠端頭像請求結束),例如 daae06da gesture 依序 37 / 7 / 7 / 36 / 7 秒。用中位數估一輪,會把「下一輪兩趟都慢」
 *     (82 秒)估成 14 秒 —— 模擬這 29 個 job「三種跑法全落灰區、加量趟全是慢的」,中位數估法把 e6c88132 推到 25.0 分;
 *     用最慢那趟 × build 數估,歷史最壞仍是 23.6 分(e6c88132 每種跑法都有慢趟,一輪預估 72–78 秒 > 60 秒,一輪都不開)。
 *   · 代價照實說:以目前 25 分上限,只有「這種跑法每一趟都快」時加量才放得進預算(那 29 個 job × 3 種跑法 = 87 組裡 4 組);
 *     其餘灰區直接以現有趟數終判:分得開照樣紅,分不開不指控,並印出比值、p 與每趟數字。
 *   · 估不準的上界:估完才出現慢趟(全快的跑法下一輪兩趟都慢),那一輪最多多花約 82 秒,之後預估值跟著變大、不再開;
 *     歷史上會走到這裡的只有那 4 組所在的 job,最壞 18.2 分。74 份 log 裡「這一趟儀器沒跑起來,重試」出現 0 次。
 */
export const MAX_EXTRA_ROUNDS = 2
export const EXTRA_ROUNDS_JOB_BUDGET_MS = 60_000

/** 一輪加量的牆鐘估計 = 這種跑法目前最慢那一趟 × build 數(理由見上);沒有任何一趟的時間 → NaN(呼叫端不得開輪)。 */
export function estimateRoundMs(tripMs, buildCount) {
  const t = (tripMs ?? []).filter((v) => Number.isFinite(v) && v >= 0)
  if (!t.length || !(buildCount > 0)) return NaN
  return Math.max(...t) * buildCount
}

/**
 * 要不要再量一輪(灰區加量的迴圈只問這一支;2026-10-14 覆核:原本迴圈寫在閘裡、第一輪不看預算、預算每次呼叫各算一份,
 * 而且整段拿掉測試照樣全綠)。依序:沒有待決 → 停;這種跑法已經有一項判紅 → 停(再量也翻不回來,只是拖時間);
 * 輪數到頂 → 停;估不出一輪要多久 → 停(**不知道會不會超時 = 不開**);`spentMs + estRoundMs > budgetMs` → 停。
 * `spentMs` 是**整個 job** 已花掉的加量時間(帳本讀不到 → NaN → 停,不當 0)。
 *
 * @returns {{ go: boolean, why: 'go'|'none-pending'|'already-failing'|'max-rounds'|'no-estimate'|'budget' }}
 */
export function nextExtraRound({ extra, pendingCount, anyFail, spentMs, estRoundMs, maxRounds = MAX_EXTRA_ROUNDS, budgetMs = EXTRA_ROUNDS_JOB_BUDGET_MS }) {
  if (!(pendingCount > 0)) return { go: false, why: 'none-pending' }
  if (anyFail) return { go: false, why: 'already-failing' }
  if (!(extra >= 1 && extra <= maxRounds)) return { go: false, why: 'max-rounds' }
  if (!(Number.isFinite(estRoundMs) && estRoundMs > 0)) return { go: false, why: 'no-estimate' }
  if (!(Number.isFinite(spentMs) && spentMs >= 0) || spentMs + estRoundMs > budgetMs) return { go: false, why: 'budget' }
  return { go: true, why: 'go' }
}

/**
 * 整個 job 共用的加量帳本(閘只做檔案讀寫,解讀在這裡,好讓判定表驗得到)。`text` = 帳本檔內容,檔案不存在給 null。
 * 不存在 → 已用 0;別的 job 留下的(key 不同)→ 已用 0;**讀得到卻解不開 / 已用不是數字 → NaN**(不知道還剩多少 = 不開,
 * `nextExtraRound` 會停)。NaN 寫回去是 null,下一次讀仍是 NaN —— 壞掉的帳本一路擋到 job 結束,不會被下一次呼叫重設成 0。
 */
export function readExtraLedger(text, key) {
  const empty = { key, spentMs: 0, rounds: [] }
  if (text == null) return empty
  try {
    const j = JSON.parse(text)
    if (!j || typeof j !== 'object' || j.key !== key) return empty
    return { key, spentMs: typeof j.spentMs === 'number' ? j.spentMs : NaN, rounds: Array.isArray(j.rounds) ? j.rounds : [] }
  } catch { return { key, spentMs: NaN, rounds: [] } }
}
export const chargeExtraLedger = (ledger, mode, ms) => ({ key: ledger.key, spentMs: ledger.spentMs + ms, rounds: [...ledger.rounds, { mode, ms }] })

/**
 * 單側精確 Mann–Whitney:`mine` 比 `ref` 隨機地大(= 分支比較慢)的 p 值。
 * 全排列(合併樣本裡「選 |mine| 個當分支」的每一種分法),同值算半個 —— 小樣本、有同值都精確。
 * 3 對 3 完全分開 = 1/C(6,3) = 0.05;5 對 5 完全分開 = 1/252。
 */
export function mannWhitneyGreaterP(mine, ref) {
  const a = mine.filter(Number.isFinite)
  const b = ref.filter(Number.isFinite)
  if (!a.length || !b.length) return NaN
  if (a.length + b.length > 24) throw new RangeError('mannWhitneyGreaterP:樣本太多(> 24)')
  const pooled = [...a, ...b]
  const n = pooled.length
  const k = a.length
  const uOf = (inA) => {
    let u = 0
    for (let i = 0; i < n; i++) if (inA[i]) for (let j = 0; j < n; j++) if (!inA[j]) u += pooled[i] > pooled[j] ? 1 : pooled[i] === pooled[j] ? 0.5 : 0
    return u
  }
  const observed = uOf(pooled.map((_, i) => i < k))
  let atLeast = 0
  let total = 0
  const pick = new Array(n).fill(false)
  const walk = (start, left) => {
    if (left === 0) { total++; if (uOf(pick) >= observed - 1e-9) atLeast++; return }
    for (let i = start; i <= n - left; i++) { pick[i] = true; walk(i + 1, left - 1); pick[i] = false }
  }
  walk(0, k)
  return atLeast / total
}

/**
 * 比值判定(見上方長註解)。回傳 `{ verdict, ratio, p, n, mineMedian, refMedian }`,
 * verdict ∈ 'skip' | 'pass' | 'fail-cap' | 'fail-separated' | 'needs-more' | 'within-noise'。
 * 灰區的 p 每一次都算(3 對 3 完全分開 = 0.05 → 當場紅);分不開才看要不要加量。
 */
export function refRatioDecision(mineVals, refVals, { limit = BLANK_RATIO_LIMIT, cap = RATIO_HARD_CAP, alpha = RATIO_ALPHA, canAddMore = false } = {}) {
  const mine = mineVals.filter(Number.isFinite)
  const ref = refVals.filter(Number.isFinite)
  const refMedian = ref.length ? median(ref) : NaN
  const mineMedian = mine.length ? median(mine) : NaN
  const n = { mine: mine.length, ref: ref.length }
  const base = { ratio: NaN, p: NaN, n, mineMedian, refMedian }
  if (!mine.length) return { verdict: 'skip', ...base }
  const magnitude = refRatioVerdict(mineMedian, refMedian, limit)
  if (magnitude === 'skip') return { verdict: 'skip', ...base }
  const ratio = mineMedian / refMedian
  if (magnitude === 'pass') return { verdict: 'pass', ...base, ratio }
  if (mineMedian > refMedian * cap) return { verdict: 'fail-cap', ...base, ratio, p: mannWhitneyGreaterP(mine, ref) }
  const p = mannWhitneyGreaterP(mine, ref)
  if (p <= alpha) return { verdict: 'fail-separated', ...base, ratio, p }
  return { verdict: canAddMore ? 'needs-more' : 'within-noise', ...base, ratio, p }
}

/**
 * **「畫面推進的幀」才算捲動的一格 —— 不是「合成器送出的每一幀」**(2026-10-14,PR #169 `R1a`)。
 *
 * 舊的幀距指標數 screencast 收到的**所有**呈現幀,於是「捲動之後主執行緒又補畫一格、但捲動位置沒變」的幀也被算成一格順暢度。
 * 6b5d8b61 以前的 Tag 列就是這樣:判斷在 passive effect、「+N」的數字等 React 下一個工作才畫(Q1 修掉的那個中間錯誤畫面)——
 * 每個捲動長工後面固定多一張「只有『+N』出現」的呈現幀。被當成「捲動順暢度」的那個值,其實是「呈現幀數」(M37)。
 *   · 釘選區(pinned)與 wheel 是主執行緒捲動,共享 runner 上主執行緒滿載、一個長工 ≈ 一次捲動更新,補畫幀直接讓呈現幀數翻倍。
 *     CI 證據(DataTable 像素 job,釘選區每跑「呈現幀合計 ÷ 長工數合計」):676a298e 之前 25 跑(排除 297b22be 儀器作廢那跑)
 *     main 中位數 2.04、分支 2.06(兩側合併 p10–p90 1.87–2.13);之後分支 1.13 / 1.16 / 1.15、main 2.02 / 1.89 / 2.08。
 *     同一跑兩側的長工合計相同(分支 ÷ main 1.01 / 0.98 / 1.06,主執行緒佔滿 2.5 秒窗的 85–98%);長工數 a893fa72 兩側都是
 *     12 / 12 / 13,676a298e 分支 26 / 23 / 18 對 main 19 / 22 / 18 —— 分支長工不比 main 少,呈現幀卻少將近一半。
 *   · gesture / mouse 由合成器捲動,**幾乎每張呈現幀都推進,新指標在這兩種跑法 ≈ 舊指標**:CI gesture「呈現幀 ÷ 長工數」
 *     分支 ÷ main 在 676a298e 之後 1.05 / 1.05 / 0.92 / 0.95 / 0.95,之前中位數 1.00;本機不推進的幀數兩側相同
 *     (mouse G7 main 3 / 6 / 8 對分支 6 / 6 / 8、G10 6 / 6 / 6 對 7 / 8 / 4)。這兩種跑法一起換,只為三種跑法用同一個定義,
 *     **不是**因為它們也有補畫幀。676a298e 之後 gesture / mouse 幀距略高(9 個比值裡 4 個超過修改前的 p90:gesture 1.19、1.29,
 *     mouse 1.19、1.29)**不是補畫幀造成,原因不明,本次不宣稱修好**;daae06da 的 mouse 幀距(163.5 / 182.1 / 190.4 對
 *     127.5 / 157.8 / 141.2 = 1.29×,3 對 3 完全分開)換了指標照樣紅。
 *
 * 判準:只算**捲動欄像素有變**的呈現幀 —— 捲動欄 = 中央捲動區最左邊 120px 的直條(roadmap story 的「標題」欄,
 * 每列文字不同);「+N」補畫(標籤欄)、頭像解碼(負責人 / 審核欄)、截圖串流重送同一張都碰不到它。`scrollSig` 由閘的
 * ANALYZE_FRAMES 對每張呈現幀算 FNV-1a(選這一條、不選整個中央區或釘選面板的實測理由寫在那裡)。
 * 定義與舊指標對齊:以第一張呈現幀為起點,平均 = (最後一張推進幀 − 第一張) ÷ 推進幀數 —— **每一張都推進時與
 * `presentedGapMean` 逐位元相同**。一張推進幀都沒有(捲了卻沒畫出來 = 畫面凍住)→ 整個觀測窗當一格(不是 NaN:
 * 「沒看到推進」不得被讀成「不適用」而放行);閘另外檢查「DOM 捲了、捲動欄卻沒變」並以偵測器失效的名義紅。
 *
 * @returns {{ advanced: number, advanceGapMean: number, advanceGapMax: number }}(沒有 scrollSig 時全 NaN)
 */
export function advanceGapStats(shots, windowEndTs = null) {
  if (!shots.length || shots.some((s) => s.scrollSig == null)) return { advanced: NaN, advanceGapMean: NaN, advanceGapMax: NaN }
  const t0 = shots[0].ts
  let last = t0
  let advanced = 0
  let gapMax = 0
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].scrollSig === shots[i - 1].scrollSig) continue
    gapMax = Math.max(gapMax, (shots[i].ts - last) * 1000)
    last = shots[i].ts
    advanced++
  }
  if (!advanced) {
    const whole = windowEndTs != null ? Math.max(0, (windowEndTs - t0) * 1000) : NaN
    return { advanced: 0, advanceGapMean: whole, advanceGapMax: whole }
  }
  return { advanced, advanceGapMean: ((last - t0) * 1000) / advanced, advanceGapMax: gapMax }
}

/**
 * 一趟量測「能不能當證據」。**量不到 ≠ 量到壞東西** —— 兩者的修法完全相反。
 *
 * 2026-09-21 CI 實證:共享 runner 的 CDP screencast 會間歇停擺,某一趟只送出 9 張呈現幀。
 * 閘印的那句「screencast 沒在工作,不能當證據」完全正確,但它跟 `pageerror` 記在同一個
 * 失敗桶子裡,於是**基礎設施抖動直接變成「這個 build 有問題」**。今天 12 輪 CI 有 4 輪
 * 因此紅,散在三支不同的閘,而被指控的程式碼一行都沒改。
 *
 * 政策:儀器失效的那一趟**作廢、不進判定**;產品失效照舊立刻紅;
 * 某個 build/mode 一趟可用的都不剩 → 以**儀器失效**的名義紅(絕不默默放行)。
 * 這跟 `data-table-scroll-perception.mjs` 既有的 MAX_ATTEMPTS 是同一套處理。
 *
 * @returns {{usable:boolean, why:string}}
 */
export const MIN_PRESENTED_FRAMES = 10
export const MIN_SCROLL_COVERAGE = 0.8

export function classifyRun({ g, frames = [], scrolled = 0, gesturePx = 0 } = {}) {
  if (!g) return { usable: true, why: '' } // 沒有截圖幾何的模式(wheel)由其他指標判,不在此作廢
  if (!(g.presented >= MIN_PRESENTED_FRAMES)) {
    return { usable: false, why: `只收到 ${g.presented} 張呈現幀,screencast 沒在工作` }
  }
  if (!g.bandsPerFrame || !frames.length) {
    return { usable: false, why: `缺資料(每幀帶數 ${g.bandsPerFrame}、DOM 取樣 ${frames.length})` }
  }
  if (scrolled < gesturePx * MIN_SCROLL_COVERAGE) {
    return { usable: false, why: `只捲了 ${scrolled}px(手勢 ${gesturePx}px),覆蓋不足` }
  }
  return { usable: true, why: '' }
}
