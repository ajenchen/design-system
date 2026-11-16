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
 *   2. 中位數比值 > `RATIO_HARD_CAP`(1.5)→ 'fail-cap'。**要不要「雜訊撐得住」才紅,依指標而定**(呼叫端必須明講 `capNeedsNoiseSupport`,
 *      lib 不給預設值 —— 放寬要逐項拿證據,不能因為漏寫就套上去或就沒套到):
 *      · `capNeedsNoiseSupport: true`(長工合計、幀距;2026-10-14 R1d 改,原本「不看 p」):秩檢定分得開(單側 Mann–Whitney p ≤ α;
 *        3 對 3 時等於完全分開,5 對 5 時不必完全分開)、或對數 Welch t 檢定 p ≤ α(差距大於兩邊各自的跑間差異;一趟偏快的 3 倍回歸
 *        靠這條紅)、或兩邊都只有 1 趟沒有雜訊可估,三者任一成立才紅。都不成立 = 分布重疊而且同一份程式碼在同一個 job 裡自己就差到
 *        這個倍數 → 走第 3 段同一條路(能加量就加、不能就不指控)。
 *      · `capNeedsNoiseSupport: false`(中央區最長連續空白):照舊**不看 p**,超過上限直接紅。空白是使用者看得到的東西,而放寬的
 *        證據一條都不適用於它:「門檻統計量」只是長工合計的性質;置換重抽只做了長工合計與幀距;CI 上空白比值 2026-09-29 → 10-14
 *        共 110 次全是「參考為 0、退回絕對門檻」(42 份 job log),沒有任何一次真的比過,拿不出它的跑間雜訊有多大。
 *      為什麼長工合計 / 幀距要改:「差到 1.5 倍以上不會是雜訊」這個前提在**快 runner 上的長工合計**不成立 —— 每個任務落在 50ms 上下,
 *      CPU 多 10% 就有一半任務跨過長工門檻,合計可以差 5 倍以上(同一份 main 在 00b767bc 三趟是 375 / 829 / 0ms)。CI 證據(DataTable
 *      像素 job 2026-09-29 → 10-14 共 72 個 job、44 個有逐趟數字、共 677 趟):38346602 gesture 長工合計 5.96×、幀距 1.53×,289bce76
 *      mouse 長工合計 1.70× 被舊規則判紅,同一份執行期程式碼在 21e25346 是 1.01× / 0.99× / 1.05×;676a298e 之前 b5757ee6 長工合計 4.01×、
 *      幀距 1.71×,0464ba54 長工合計 1.72× 也是,後者與零改動的 a3045925 是 1.14×。
 *      用真實逐趟數字置換重抽(676a298e 之前 31 / 28 / 26 個 job,每個 job 6 趟的 20 種 3 對 3 分法;只做了長工合計與幀距):虛無下判紅率
 *      gesture 長工合計 3.7% → 1.9%(快 runner 14.3% → 6.4%)、幀距 1.8% → 1.3%,mouse / pinned 不變或更低;慢 runner 上合成 2 / 3 倍回歸的偵測率
 *      不變(100%)、1.5 倍最多少 1.4 個百分點(mouse 長工合計 88.0% → 86.6%),快 runner 上長工合計的 2 倍回歸由 86% 降到 59% —— 那是這個量在那種機器上 3 趟本來就分不出來的部分,照實列為代價。
 *   3. 中間的灰區 → 單側精確 Mann–Whitney(分支比參考慢)p ≤ `RATIO_ALPHA` → 'fail-separated';
 *      否則還能加量(`canAddMore`)→ 'needs-more'(呼叫端延續 ABBA 交錯再量一輪,有上限);
 *      不能再加 → 'within-noise':差距落在跑間雜訊內,照實印出比值、p 與每趟數字,不指控。
 *
 * 校準(**這是 R1a 時期的數字**,當時超過上限一律紅;只用修改前、與本案無關的 CI 跑;**排除 676a298e 本身與 297b22be 儀器作廢那跑**):
 * 2026-09-27 → 10-13 共 42 跑、208 項比值判定(舊指標:全部呈現幀),舊判準紅 9 項;R1a 判準 cap 紅 4 項(b5757ee6 兩項、
 * 0464ba54 長工一項 —— 前一輪調查報告記為該期樣式重算確實出過問題;a6d2ee1d 一項,真假未查)、灰區分得開紅 2 項
 * (8e9a370f、0080776a 的 mouse 長工,3 對 3 完全分開)、灰區要加量 3 項(含零改動的 1ef86547 兩項)。
 * **R1d 起**這 4 項 cap 紅都是兩邊重疊、對數 t 也分不開,改判不指控:b5757ee6 兩項、0464ba54 一項見判定表那三列(0464ba54 與零改動的
 * a3045925 是 1.14×);a6d2ee1d 那項是 gesture 長工合計 233 / 110 / 331 對 212 / 153 / 109(job 108516432763,1.52×,秩檢定 p = 0.20、
 * 對數 t p = 0.25),不在 R1d 重判的 72 個 job 裡(早於 09-29),這裡另外算過。
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
 * **2026-11-16 依新的 job 長度重估**(覆核二 SF-R3;上面那段的 84 秒是 A/A 之前的 job):A/A 第三份建置(每種跑法 +3 趟)、`--trace` 追蹤趟
 * (只留 pinned,+2 趟)、規則 G-P 的開跑前判定(pinned,3 次開頁)都**不記帳**,但吃同一份 25 分。2026-11-15 兩份像素 job log 的時間戳:
 * 30 個比值趟仍是雙峰(14 趟 5.4–7.8 秒、16 趟 35.2–37.3 秒;96b63b68 那一跑 17.5 分)。不拆時期望 ≈ 19.7 分、加的 14 趟全落慢峰 ≈ 24.2 分,
 * 超過計畫的 22 分拆 job 線 → pinned 那一步拆成自己的 job `verify-browser-datatable-pinned`(帳本 key 含 GITHUB_JOB,兩個 job 各自一份 60 秒)。
 * 拆完:像素 job(gesture / mouse 共用帳本)期望 ≈ 14.3 分,閘的趟全落慢峰再用滿 60 秒 ≈ 19.4 分;pinned job 期望 ≈ 7.9 分、最壞 ≈ 12.5 分。
 * 60 秒不變:兩個 job 的最壞情況都在 22 分線以下;一輪加量(最慢那趟 × 2 份)在慢峰時約 72–75 秒 > 60 秒 —— 仍然只有全快的跑法開得了輪,
 * 上面「代價照實說」那一條照舊成立(A/A 不進加量,見 `extraRoundPlan`)。
 * **同日 A25 覆核二修補**:pinned 的追蹤改成計分(持續空白,`checkerboardDecision`),2 趟 → 9 趟(三份 × 3 輪,不記帳、不加量)。pinned job 重估:
 * 期望 ≈ 11.8 分、最壞(全落慢峰、追蹤開銷每趟 10 秒)≈ 17.2 分 + 60 秒 ≈ 18.2 分,仍在 22 分線以下(ci.yml 該 job 檔頭)。
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
 * 灰區加量那一輪**量哪幾份建置、估多久**(2026-11-16 A28 覆核 MF4;【AI 推導 2026-11-16】)。
 * A/A 那份(`isAA(label)` 為真)只用首輪(`--runs` 那幾輪),**不進加量**:加量是為了分開 branch 對 ref 的灰區,
 * 多量 A/A 不會讓那個判定分得更開,只會把一輪從 2 份變 3 份、讓同一份 60 秒預算少開一輪(一趟 11 秒時 22 → 33 秒,2 輪變 1 輪)——
 * 那等於 A/A 改了 branch 對 ref 的終判(分不開 → 不指控的比例變高)。估一輪也只看要量的那幾份的趟(A/A 那份某一趟剛好慢,
 * 不得讓加量少開)。有沒有 A/A,這裡回的 `run` 與 `estRoundMs` 都一樣 —— 判定表「有 A/A 時加量輪數與沒有時相同」守這一條。
 * @param {{ labels: string[], isAA: (label:string)=>boolean, trips: {label:string, ms:number}[] }} p
 * @returns {{ run: string[], estRoundMs: number }}
 */
export function extraRoundPlan({ labels, isAA, trips }) {
  const run = labels.filter((l) => !isAA(l))
  const ms = (trips ?? []).filter((t) => run.includes(t.label)).map((t) => t.ms)
  return { run, estRoundMs: estimateRoundMs(ms, run.length) }
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
 * Student t 分布的上尾機率 P(T ≥ t)(df 可為非整數;Welch 的自由度通常不是整數)。
 * 以正則化不完全 Beta 函數算:P(T ≥ t) = ½·I_{df/(df+t²)}(df/2, ½)(t ≥ 0),t < 0 取 1 − 上式。
 * 連分式照 Numerical Recipes `betacf`(Lentz 法);判定表用 t 分布臨界值表對過(df 1–22,α = 0.05)。
 */
export function studentTUpperP(t, df) {
  if (!Number.isFinite(df) || df <= 0 || Number.isNaN(t)) return NaN
  if (t === Infinity) return 0
  if (t === -Infinity) return 1
  const x = df / (df + t * t)
  const tail = 0.5 * regIncBeta(x, df / 2, 0.5)
  return t >= 0 ? tail : 1 - tail
}
function logGamma(z) {
  // Lanczos(g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let a = c[0]
  const t = z + 7.5
  for (let i = 1; i < 9; i++) a += c[i] / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}
function betacf(x, a, b) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}
function regIncBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(x, a, b)) / a : 1 - (bt * betacf(1 - x, b, a)) / b
}

/**
 * 對數尺度的單側 Welch t 檢定:分支的幾何平均是否大於參考(= 分支比較慢)。值先取 ln(1 + v)(長工合計可能是 0)。
 * 兩邊都 ≥ 2 趟 → Welch(不假設兩邊變異相同);有一邊只有 1 趟 → 用另一邊的變異(合併自由度 = 總趟數 − 2);
 * 兩邊都只有 1 趟 → 沒有任何雜訊估計,回 df = 0、p = NaN(呼叫端自己決定怎麼辦,不得當成「分不開」或「分得開」)。
 * @returns {{ t: number, df: number, p: number, logRatio: number }}
 */
export function logWelchGreater(mine, ref) {
  const a = mine.filter(Number.isFinite).map((v) => Math.log1p(Math.max(0, v)))
  const b = ref.filter(Number.isFinite).map((v) => Math.log1p(Math.max(0, v)))
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length
  const ss = (x, m) => x.reduce((s, v) => s + (v - m) ** 2, 0)
  if (!a.length || !b.length) return { t: NaN, df: 0, p: NaN, logRatio: NaN }
  const ma = mean(a), mb = mean(b), diff = ma - mb
  let se, df
  if (a.length >= 2 && b.length >= 2) {
    const va = ss(a, ma) / (a.length - 1), vb = ss(b, mb) / (b.length - 1)
    const qa = va / a.length, qb = vb / b.length
    se = Math.sqrt(qa + qb)
    df = qa + qb > 0 ? (qa + qb) ** 2 / ((qa ** 2) / (a.length - 1) + (qb ** 2) / (b.length - 1)) : a.length + b.length - 2
  } else {
    df = a.length + b.length - 2
    if (df < 1) return { t: NaN, df: 0, p: NaN, logRatio: diff }
    const pooled = (ss(a, ma) + ss(b, mb)) / df
    se = Math.sqrt(pooled * (1 / a.length + 1 / b.length))
  }
  const t = se > 0 ? diff / se : diff > 0 ? Infinity : diff < 0 ? -Infinity : 0
  return { t, df, p: studentTUpperP(t, df), logRatio: diff }
}

/**
 * 比值判定(見上方長註解)。回傳 `{ verdict, ratio, p, n, mineMedian, refMedian }`,
 * verdict ∈ 'skip' | 'pass' | 'fail-cap' | 'fail-separated' | 'needs-more' | 'within-noise'。
 * 灰區的 p 每一次都算(3 對 3 完全分開 = 0.05 → 當場紅);分不開才看要不要加量。
 * 'fail-cap' 另帶 `capBasis`(呼叫端印紅的理由只看它,不自己重推):
 *   'rank'(秩檢定分得開)| 'log-t'(對數 Welch t 分得開)| 'noise-unknown'(兩邊都只有 1 趟)| 'no-noise-allowance'(這項指標不放寬)。
 * `capNeedsNoiseSupport` 必填(boolean),理由見上方第 2 段。
 */
export function refRatioDecision(mineVals, refVals, { limit = BLANK_RATIO_LIMIT, cap = RATIO_HARD_CAP, alpha = RATIO_ALPHA, canAddMore = false, capNeedsNoiseSupport } = {}) {
  if (typeof capNeedsNoiseSupport !== 'boolean') throw new TypeError('refRatioDecision:capNeedsNoiseSupport 必須明講 true / false(放寬要逐項拿證據,見 RATIO_HARD_CAP 的註解)')
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
  const p = mannWhitneyGreaterP(mine, ref)
  if (mineMedian > refMedian * cap) {
    // 這項指標不放寬(中央區最長連續空白):照舊不看分布,超過上限直接紅(理由見上方第 2 段)
    if (!capNeedsNoiseSupport) return { verdict: 'fail-cap', ...base, ratio, p, capBasis: 'no-noise-allowance' }
    // 長工合計 / 幀距(2026-10-14 R1d 改):超過上限**而且**下列任一成立才紅 ——
    //   (a) 秩檢定分得開(單側 Mann–Whitney p ≤ α;3 對 3 時等於完全分開,5 對 5 時不必完全分開);
    //   (b) 對數 Welch t 檢定 p ≤ α:差距大於這個 job 裡**兩邊各自跑間差異**撐得出來的範圍(1 趟偏快的大回歸靠這條紅);
    //   (c) 兩邊都只有 1 趟,沒有任何雜訊估計 → 照舊以倍數判紅(不知道雜訊多大,不拿「不知道」當放行理由)。
    // 都不成立 = 兩邊分布重疊、而且同一份程式碼在這個 job 裡自己就差到這個倍數 → 跟灰區分不開同一條路:能加量就加量,不能就不指控。
    // 為什麼:38346602 gesture 長工合計 867 / 697 / 157 對 101–272(5.96×)與 289bce76 mouse 1720 / 1991 / 1515 對 687–1694(1.70×),
    // 同一份執行期程式碼在 21e25346 是 1.01× / 1.05×;0464ba54 1.72× 與零改動的 a3045925 1.14×。舊規則「超過 1.5× 不看分布」把它們全判紅。
    const lt = logWelchGreater(mine, ref)
    const noiseUnknown = !(lt.df >= 1)
    const capBasis = p <= alpha ? 'rank' : noiseUnknown ? 'noise-unknown' : lt.p <= alpha ? 'log-t' : null
    if (capBasis) return { verdict: 'fail-cap', ...base, ratio, p, logT: lt, noiseUnknown, capBasis }
    return { verdict: canAddMore ? 'needs-more' : 'within-noise', ...base, ratio, p, logT: lt, overCapButNoisy: true }
  }
  if (p <= alpha) return { verdict: 'fail-separated', ...base, ratio, p }
  return { verdict: canAddMore ? 'needs-more' : 'within-noise', ...base, ratio, p }
}

/**
 * 待決(還分不開)那一項落在哪一段 —— 閘在加量迴圈裡印這句(2026-10-14 覆核:原本一律印「灰區 1.25–1.5×」,
 * 5.96× 的項目也被印成 1.25–1.5× 灰區)。只看 lib 的判定結果,不在閘裡另推一次。
 */
export const ratioZoneText = (d) => (d.overCapButNoisy ? `超過 ${RATIO_HARD_CAP}× 但兩邊重疊` : `灰區 ${BLANK_RATIO_LIMIT}–${RATIO_HARD_CAP}×`)

/**
 * **中央區最長連續空白:比值 + 白幀張數地板,參考是不是 0 都走同一條式子**
 * (2026-11-16 A25 覆核 MF3 → 覆核二 MF-R1 / SF-R2;門檻與式子【AI 推導 2026-11-16】)。
 *
 * 修前兩條路(覆核二 MF-R1):參考中位數 0 → 「分支 > 2 個呈現幀距才紅」;參考 > 0 → 比值(超過 1.5× 不看分布直接紅)。合起來看,
 * 分支的紅線是參考中位數 r 的函數:T(0) = 2 個幀距、T(r) = 1.5r —— r 不到 4/3 個幀距時 T(r) < T(0),**參考多一張白幀,同一個分支反而紅**;
 * 同一份資料 ref = 0/0/150、ref~aa = 0/150/150、分支 150/300/300(CI 幀距 150ms)判綠,兩份標籤互換就判紅,而兩份是同一份程式碼。
 * 尺度又用「平均」幀距,一張白幀停留的卻是**那一格**的幀距(覆核二 SF-R2:2026-11-15 兩份 CI job log 30 趟裡 6 趟單一呈現幀距 > 2 × 該趟平均,
 * 例 237 / 88.3ms)—— CI 上一張白幀就可能越線。
 *
 * 現在每一趟另取「最長連續白幀張數」(`longestBlankRun(r.g.blankSeries)`:連續幾張呈現幀有空白帶,不管每張停多久),
 *   紅 ⇔ (a) 比值規則判紅 —— 參考中位數 > 0:同一個 `refRatioDecision` + `combineWithAA`(空白不放寬);參考中位數 = 0:比值無限大,分支有空白即算;
 *       **且** (b) 分支中位張數 − 參考張數 > `ZERO_REF_BLANK_FRAMES`。
 *   參考張數 = 參考那幾趟的中位張數;A/A 那份(`<ref>~aa`)有量到時取兩份中**較多**的那份 —— MF1「兩份都紅才紅」用在地板上:兩份是同一份程式碼,
 *   分支沒有比其中一份多出 N 張以上,就分不出是分支還是這一跑的量化抽籤(只看 ref 的地板在 ref 0/0/0、ref~aa 0/1/1、分支 0/3/3 時照樣被標籤互換翻轉)。
 *   A/A 那份量不到、或兩份參考的捲動機制不同 → 只看 ref(照原判定)。參考中位數 0、A/A 那份也 0 → (b) 就是「分支中位張數 > 2」=
 *   修前參考為 0 的判準,單位由「毫秒 ÷ 平均幀距」換成張數。
 * 性質(判定表守):(1)參考變差(任一趟毫秒與張數都不減)不得由綠變紅;(2)量化資料(毫秒 = 張數 × 固定幀距)、兩份參考中位張數 ≤ 5 時,
 *   ref / ref~aa 標籤互換不翻轉 —— 地板成立 ⇒ 分支 ≥ 較多那份 + 3 張 ⇒ 對兩份的比值都 > 1.5,空白 fail-cap 不看 A/A,兩種標法都紅;
 *   中位 ≥ 6 張時比值可能落在灰區,`combineWithAA` 的對稱只在 A/A 不乾淨時成立(那是 CI 900ms 以上的長白,照實列為邊界,不在本條保證內);
 *   (3)一張白幀落在最長那一格(停 237ms)→ 1 張 → 過。
 * N = 2:修前參考為 0 那一支已經用的「2 張白幀以內是 CI 截圖(約 6 幀/秒)的量化抖動」,延伸到參考很小的那一段;沒有 CI 分支逐趟資料校準過,
 *   推送後由 `--json` 的逐趟數字回頭驗。代價照實:本機 60 幀/秒下 ≤ 2 張(≤ 33ms)的差一律不紅;參考 1 張時分支 3 張(3×)也不紅;
 *   **已知盲點(本項照實保留):張數不看每張停多久 —— 一張白幀停很久只算 1 張,所以這一項防不住持續空白**。整片白而且畫面不變時截圖串流
 *   不重送相同的幀,持續的白在這裡就是「1 張停很久」,跟 CI 截圖慢的「1 張停在長格上」分不開(「一張白幀落在最長那一格 → 過」這個要求的直接代價)。
 *   改成「停留時間 ÷ 同一趟正常畫面的間隔」也分不開(2026-11-16 試算,【AI 推導 2026-11-16】):一張白幀落在最長那一格,單位結構上 ≥ 1
 *   (CI 30 趟上界 1.77–3.79、本機同碼 mouse / pinned 1.21–2.78),而最終(Q2b)建置本機 pinned 分支 127 / 205 / 267ms 的單位中位只比兩份參考多 0.997
 *   (最長那格多半是開跑前的靜止段;正常畫面本來就會停 125–436ms)。
 *   **持續空白改由另一個與截圖節奏無關的量具判**:pinned 步驟(帶 `--trace`)的 CDP 追蹤 checkerboard 次數(`checkerboardDecision`,下方)。
 *   參考為 0 時另有絕對門檻(`--assert-max-blank-ms`)。
 * 比值判紅、但分支或參考沒有白幀序列 → 'no-scale'(判不了幾張;呼叫端以「儀器失效」紅,不當過)。
 *
 * `mine` / `ref` / `aa` = 各趟 `{ ms: 最長連續空白毫秒, run: 最長連續白幀張數, gap?: 平均呈現幀距(只供訊息) }`;`aa` = null 表示沒有 A/A 那份;
 * `aaBlockedWhy` = A/A 兩份機制不同等量不到的理由。回傳 `refRatioDecision` / `combineWithAA` 的欄位,加 `floor`(各中位張數、較多那份、超出幾張),
 * verdict 另有 'fail-zero-ref'(參考 0 且超出地板)、'within-floor'(比值判紅但沒超出地板 → 過,帶 `ratioVerdict`)、'no-scale'、'no-ref'(參考沒資料)、'na'。
 */
export const ZERO_REF_BLANK_FRAMES = 2
/** 一趟的最長連續白幀張數:`blankSeries`(每張呈現幀的空白帶比例)裡連續 > 0 的最長段;不是陣列 → NaN(沒量到,不當 0)。 */
export function longestBlankRun(series) {
  if (!Array.isArray(series)) return NaN
  let run = 0, best = 0
  for (const v of series) { if (v > 0) { run++; if (run > best) best = run } else run = 0 }
  return best
}
export function blankDecision({ mine, ref, aa = null, aaBlockedWhy = null, canAddMore = false, frames = ZERO_REF_BLANK_FRAMES } = {}) {
  const msOf = (xs) => (xs ?? []).map((t) => t.ms)
  const runOf = (xs) => { const r = (xs ?? []).map((t) => t.run); return r.length && r.every(Number.isFinite) ? median(r) : NaN }
  const mineMs = msOf(mine), refMs = msOf(ref).filter(Number.isFinite)
  if (!mineMs.length || !mineMs.every(Number.isFinite)) return { verdict: 'na' }
  if (!refMs.length) return { verdict: 'no-ref', refMedian: NaN, refVals: refMs, mineVals: mineMs }
  const aaUsable = Array.isArray(aa) && aa.length > 0 && !aaBlockedWhy
  const aaRes = aa == null ? null
    : aaBlockedWhy ? { available: false, ratio: NaN, a: NaN, clean: null, forward: null, reverse: null, n: { ref: refMs.length, aa: aa.length }, why: aaBlockedWhy }
      : aaNoise(refMs, msOf(aa), { capNeedsNoiseSupport: false })
  const refMedian = median(refMs), mineMedian = median(mineMs)
  const d = refMedian > 0
    ? combineWithAA(refRatioDecision(mineMs, refMs, { canAddMore, capNeedsNoiseSupport: false }), aaRes, { mineVals: mineMs, capNeedsNoiseSupport: false })
    : { verdict: mineMedian > 0 ? 'fail-zero-ref' : 'pass', ratio: mineMedian > 0 ? Infinity : NaN, p: NaN, n: { mine: mineMs.length, ref: refMs.length }, mineMedian, refMedian, aa: aaRes, r1dVerdict: null }
  const runsOf = (xs) => (xs ?? []).map((t) => t.run)
  const floor = { frames, mineRun: runOf(mine), refRun: runOf(ref), aaRun: aaUsable ? runOf(aa) : NaN, mineRuns: runsOf(mine), refRuns: runsOf(ref), aaRuns: aaUsable ? runsOf(aa) : [] }
  floor.baseRun = Number.isFinite(floor.aaRun) ? Math.max(floor.refRun, floor.aaRun) : floor.refRun
  floor.excess = floor.mineRun - floor.baseRun
  const out = { ...d, mineVals: mineMs, refVals: refMs, floor }
  if (!(d.verdict.startsWith('fail') || d.verdict === 'needs-more')) return out
  if (!Number.isFinite(floor.excess)) return { ...out, verdict: 'no-scale', ratioVerdict: d.verdict }
  if (floor.excess > frames) return out
  return { ...out, verdict: 'within-floor', ratioVerdict: d.verdict }
}

/**
 * **持續空白:CDP 追蹤的 checkerboard 次數**(2026-11-16 A25 覆核二修補;量具選擇、門檻與式子【AI 推導 2026-11-16】)。
 *
 * 為什麼要另一個量具:上面的白幀張數只數「連續幾張」,整片白而且不變時截圖串流不重送,持續的白只算 1 張(本項的已知盲點,見 `blankDecision`)。
 * checkerboard = 合成器畫到還沒光柵好的圖塊時,cc 記的 `TileBasedLayerImpl::AppendQuads checkerboard`(每張合成幀、每個缺圖塊的層記一次;
 * lib/cdp-trace-summary.mjs `counts.checkerboard`)。它記的是合成器實際畫出的每一幀,**不靠截圖串流的節奏**:白得久、白得多層,次數就多。
 *
 * 式子與空白同一條(`blankDecision` 原樣重用 —— 每趟的比值值與地板單位都是那一趟的次數,兩條路不會各自漂):
 *   紅 ⇔ 比值規則判紅(同一個 `refRatioDecision` + `combineWithAA`;使用者看得到的白,不放寬:`capNeedsNoiseSupport: false`;參考中位 0 = 比值無限大)
 *       **且** 分支中位次數 − max(ref 中位, ref~aa 中位) > `CHECKERBOARD_FLOOR`(A/A 那份量不到 / 機制不同 → 只看 ref)。
 *   單調、標籤互換不翻轉、參考 0 與參考很小走同一條式子 —— 性質與白幀張數地板相同(同一支函式),判定表另以次數重驗。
 * 量具:只在 pinned 步驟、帶 `--trace` 與 `--ref` 時判(閘 `traceJudged`);三份建置(含 A/A 那份)各量 `--runs` 趟**另跑的**追蹤趟(Tracing 有開銷,
 *   不與量空白 / 長工 / 幀距的那幾趟混在一起)。追蹤資料缺(某一份一趟可用的都沒有)→ 呼叫端以「儀器失效」紅,不當 0。
 * 為什麼數「次數」不數「次數 ÷ 合成幀」:持續 T 毫秒的白在 60 幀/秒下就是 T / 16.7 次(與截圖節奏無關),次數直接是「白了多久、幾層」;
 *   除以合成幀會把「這一份少畫了幾幀」混進來(Q2b 本機 66–68 幀對參考 76–88 幀,除了之後 Q2b 的比值反而被放大),那是幀距那一項的事。
 *   同碼資料上兩者的分離度相近(Q2b 超出量 ÷ 同碼最大超出量:次數 25 / 10 = 2.5、比例 0.439 / 0.160 = 2.7),比值規則在同碼上誤判紅的分法
 *   次數合計 29 種、比例 51 種(下方 5 跑)。
 *
 * **`CHECKERBOARD_FLOOR = 15` 的資料與選法**(【AI 推導 2026-11-16】;本機 headless 軟體光柵、CI 同參數 `--runs=3 --tick-ms=64`,A25 覆核二修補報告):
 *   同碼置換 —— 每一跑的同碼追蹤趟分成 分支 3 / 參考 3 / A/A 3(1,680 種分法;只有 6 趟時 分支 3 / 參考 3 的 20 種、沒有 A/A),地板拿掉時
 *   比值規則判紅的分法裡「分支中位 − max(參考, A/A)」的最大值 = 不誤紅的最小地板:
 *     推 1 建置對 1ac039c9(兩容器、轉發)兩跑:紅 0 / 1,680、6 / 1,680,最大超出 – / 3;
 *     最終(Q2b)建置自比(單一捲動盒、原生)兩跑:紅 0 / 1,680、22 / 1,680,最大超出 – / **10**(次數 29–56);
 *     最終那一跑的 main / main~aa(中央欄原生)6 趟:紅 1 / 20,最大超出 6。
 *   → 最小地板 10;邊際 +5(觀測最大值的一半:10 只出現在 5 跑裡的 1 跑,其餘 2–6,5 跑的最大值低估母體)→ 15。另一側:最終(Q2b)建置對 1ac039c9
 *   本機 3 對 3 超出 25(分支 41 / 44 / 39,main 10 / 21 / 14,main~aa 16 / 12 / 18),歷來單趟追蹤 19 → 47、17 → 37、13 → 38、12 → 37(超出 20–28),
 *   15 離兩邊各 5 / 10。**同碼資料不夠**:本機 5 跑 42 趟、CI 0 趟;CI 的軟體光柵更慢,次數與散布的量級都可能不同 ——
 *   推 1 上 CI 後用 `--json` 的 traceTrips(每跑三份各 3 趟)重算同一套置換再核,地板跟著資料改,不准為了讓某一個 PR 綠而調。
 *
 * `mine` / `ref` / `aa` = 各趟次數(數字陣列);`aa` = null 表示沒有 A/A 那份。回傳與 `blankDecision` 同形(`floor.mineRun` 等欄位是次數的中位數)。
 */
export function checkerboardDecision({ mine, ref, aa = null, aaBlockedWhy = null, floor = CHECKERBOARD_FLOOR } = {}) {
  const trips = (xs) => (xs == null ? null : xs.map((c) => ({ ms: c, run: c })))
  return blankDecision({ mine: trips(mine), ref: trips(ref), aa: trips(aa), aaBlockedWhy, canAddMore: false, frames: floor })
}
export const CHECKERBOARD_FLOOR = 15

/**
 * **A/A 對照:同一份參考建置量兩次,量出這一跑比值自己的散布**(2026-11-16,A28;【AI 推導 2026-11-16】)。
 *
 * 為什麼:比值門檻 1.25 底下的雜訊從來沒有在同一個 job 裡量過 —— 歷來「零執行期改動也紅」的實例(74ac03eb mouse 長工 1.32×、
 * 8dc9faa7 gesture 幀距 1.80×、1ef86547 釘選區 1.38×)都是事後才知道是雜訊。閘有 `--ref` 時自動多量一份 `<ref>~aa`
 * (同一個目錄、獨立的靜態伺服器與凍結快照、三份輪轉),每一項比值同時算 A/A。
 *
 * **R1d 的判定式不動**(同一個 `refRatioDecision`、同一份門檻、同樣的趟數、同樣的加量輪數);A/A 只當修正子(`combineWithAA`),但**最終判定不是零代價**
 * (2026-11-16 覆核二 SF-R4):A/A 不乾淨時要兩份參考都紅才紅,換到的是另一個工作點 —— 同碼誤紅少、真回歸漏抓也多(對數常態模擬,長工 / 幀距
 * 雜訊 sd(ln) 0.2 時 1.5× 回歸偵測率 62.1% → 51.2%、同碼誤紅 2.9% → 1.1%),代價表在 data-table-scroll-performance.spec.md「比值閘的 A/A 修正子」節。
 *   · A/A 乾淨 ⇔ `|ln(m(ref~aa) / m(ref))| < AA_NOISE_SHARE · ln(1.25)`(= 0.1116,A/A 比值 0.894–1.118)**且** `refRatioDecision`
 *     對 A/A 兩個方向(ref~aa 對 ref、ref 對 ref~aa)都不是 fail。取絕對值:參考自己快或慢都代表這一跑量不準。
 *   · branch 判 fail 而 A/A 乾淨 → 照紅。
 *   · A/A 不乾淨 → 分支對 `ref~aa` 也跑一次**同一個** `refRatioDecision`:**兩份參考都判 fail 才紅**,有一份沒判 fail → `aa-noisy`
 *     (不指控、照印兩個比值 / p / 每趟數字 / A/A 值)。兩份是同一份程式碼,分支只要沒有比其中一份確實慢,就分不出是分支還是這一跑量不準。
 *     (2026-11-16 覆核 MF1 改:第一版寫成 `ln(m(branch)/m(ref)) − |ln A/A| > ln 1.25` —— 取絕對值之後,「這一跑 ref 偏慢、ref~aa 偏快」時
 *     分支比兩份都慢而且完全分開仍判 `aa-noisy`,把同一組數字的 ref 與 ref~aa 標籤互換卻判紅;同一份證據只因標籤互換就翻轉。
 *     「兩份都 fail」對標籤互換對稱。)
 *   · **不放寬的那一項,A/A 也不放寬**(覆核 MF2):`capBasis === 'no-noise-allowance'`(中央區最長連續空白超過硬上限 —— 那一項的規則是
 *     「超過上限不看分布」)原樣照紅。A/A 是分布的量測,不看分布的規則就不看它。(白幀張數地板另以兩份參考裡較多的那份為準,
 *     只管「多出 ≤ N 張」那段量化範圍,超過地板之後照這一條;見 `blankDecision`,覆核二 MF-R1。)
 *   · branch 判 pass / within-noise / needs-more → 照原判定(A/A 照印)。A/A 量不到(那份建置一趟可用的都沒有、或兩份參考的捲動機制不同)
 *     → 照原判定,並印「A/A 量不到」—— 沒量到不得當成乾淨,也不得當成不乾淨而放行(M37 第八種形狀)。
 *   · **`aa-noisy` 是終判,不加量**(覆核 MF4):加量只由 R1d 自己的 `needs-more` 觸發,而且加量輪只量 branch 與 ref(`extraRoundPlan`)。
 *     第一版讓 `aa-noisy` 也回 `needs-more`、加量輪三份都重跑 —— 等於 A/A 改了 branch 對 ref 的加量次數,還會先吃掉整個 job 共用的預算。
 * `AA_NOISE_SHARE = 0.5` 沿用 2026-10-07 g9 草稿的值(A/A 用掉門檻一半以上 = 這一跑分不出 1.25×)。
 * 為什麼 `aa-noisy` 不紅:與 `within-noise` 同一條路(差距落在跑間雜訊內,照實印出,不指控);而這裡的雜訊是**同一跑實際量到**的。
 */
export const AA_SUFFIX = '~aa'
export const AA_NOISE_SHARE = 0.5
export const AA_CLEAN_LOG = AA_NOISE_SHARE * Math.log(BLANK_RATIO_LIMIT)

/**
 * A/A 這一對的偏差與乾淨判定。`refVals` / `aaVals` = 同一份建置兩個獨立伺服器的各趟值。
 * @returns {{ available: boolean, ratio: number, a: number, clean: boolean|null, forward: string|null, reverse: string|null, n: {ref:number, aa:number}, why: string }}
 */
export function aaNoise(refVals, aaVals, { capNeedsNoiseSupport, limit = BLANK_RATIO_LIMIT } = {}) {
  if (typeof capNeedsNoiseSupport !== 'boolean') throw new TypeError('aaNoise:capNeedsNoiseSupport 必須明講 true / false(與 refRatioDecision 同一個判定式)')
  const ref = refVals.filter(Number.isFinite), aa = aaVals.filter(Number.isFinite)
  const n = { ref: ref.length, aa: aa.length }
  const mr = ref.length ? median(ref) : NaN, ma = aa.length ? median(aa) : NaN
  if (!ref.length || !aa.length || !(mr > 0) || !(ma > 0)) {
    return { available: false, ratio: NaN, a: NaN, clean: null, forward: null, reverse: null, n, why: !ref.length || !aa.length ? '有一邊沒有可用的趟' : '中位數為 0,沒有比值' }
  }
  const ratio = ma / mr
  const a = Math.abs(Math.log(ratio))
  const forward = refRatioDecision(aa, ref, { limit, canAddMore: false, capNeedsNoiseSupport }).verdict
  const reverse = refRatioDecision(ref, aa, { limit, canAddMore: false, capNeedsNoiseSupport }).verdict
  const sizeOk = a < AA_NOISE_SHARE * Math.log(limit)
  const clean = sizeOk && !forward.startsWith('fail') && !reverse.startsWith('fail')
  const why = clean ? '乾淨' : !sizeOk ? `|ln A/A| = ${a.toFixed(3)} ≥ ${(AA_NOISE_SHARE * Math.log(limit)).toFixed(4)}(A/A 用掉門檻一半以上)` : `同一份建置自己比就判 ${forward.startsWith('fail') ? forward : reverse}`
  return { available: true, ratio, a, clean, forward, reverse, n, why, refVals: ref, aaVals: aa }
}

/**
 * branch 的 R1d 判定 + A/A 修正子 → 最終判定(見上方長註解)。`d` = `refRatioDecision` 的回傳;`aa` = `aaNoise` 的回傳(可為 null)。
 * `mineVals` / `capNeedsNoiseSupport` = 算 `d` 時的同一組(A/A 不乾淨時拿去跟 `ref~aa` 再判一次;缺了就丟 TypeError,不默默照舊公式)。
 * 回傳 `d` 的拷貝,多帶 `aa` 與 `r1dVerdict`;A/A 不乾淨時另帶 `vsAA`(分支對 ref~aa 的判定)。改判時 verdict 變 'aa-noisy'(帶 `aaNoisy: true`);
 * 兩份都判紅時照原 verdict 並帶 `beyondAA: true`。**不回 'needs-more'**(加量只由 R1d 自己觸發,見上方 MF4)。
 */
export function combineWithAA(d, aa, { mineVals, capNeedsNoiseSupport, limit = BLANK_RATIO_LIMIT } = {}) {
  const out = { ...d, aa: aa ?? null, r1dVerdict: d.verdict }
  if (!d.verdict.startsWith('fail')) return out
  if (d.capBasis === 'no-noise-allowance') return out
  if (!aa || !aa.available || aa.clean) return out
  if (!Array.isArray(mineVals) || typeof capNeedsNoiseSupport !== 'boolean') throw new TypeError('combineWithAA:A/A 不乾淨時要拿分支各趟(mineVals)與同一個 capNeedsNoiseSupport 對 ref~aa 再判一次,兩者必須給')
  const vsAA = refRatioDecision(mineVals, aa.aaVals, { limit, canAddMore: false, capNeedsNoiseSupport })
  if (vsAA.verdict.startsWith('fail')) return { ...out, beyondAA: true, vsAA }
  return { ...out, verdict: 'aa-noisy', aaNoisy: true, vsAA }
}

/**
 * A/A 兩份(ref 與 ref~aa)這一跑的實際捲動機制必須相同,A/A 才量得到「同一件事量兩次」的散布(2026-11-16 覆核 SF2)。
 * 規則 G-P 會把參考的指標移到中央欄;若只移了 ref、ref~aa 還在釘選欄(或反過來),A/A 比的是「原生 vs 轉發」,幾乎必定不乾淨,
 * 然後 `aa-noisy` 就會蓋掉真退步。`refSet` / `aaSet` = 兩份各趟的機制集合(true 原生 / false 轉發 / null 讀不到)。
 * @returns {{ same: boolean, ref: boolean|null, aa: boolean|null }}
 */
export function aaMechanismCheck(refSet, aaSet) {
  const one = (xs) => (xs.length === 1 && typeof xs[0] === 'boolean' ? xs[0] : null)
  const ref = one(refSet), aa = one(aaSet)
  return { same: ref !== null && ref === aa, ref, aa }
}

/**
 * **規則 G-P:釘選欄步驟只比同一種捲動機制**(2026-11-16,A25;【AI 推導 2026-11-16】)。
 *
 * 為什麼:2026-11-05 Q2b 版的閘把 pinned 模式改成 CDP 真滾輪、指標停在左釘選欄;參考(兩容器的 main)在這條路上是**元件轉發**
 * (`makeBindPinnedPanel` 在主執行緒寫 scrollTop),受測(Q2b)是**瀏覽器原生捲動**。閘只對空白那項印「機制不同不比」,卻照比幀距與長工 ——
 * 11-06 擋下 Q2b 的「pinned 幀距 1.26×」比的就是「原生 vs 轉發」(本機 Tracing:原生捲動讓合成器多畫 2.67 倍的幀,在 2 vCPU runner 上
 * 截圖搶不到 CPU)。這一條讓分子分母走同一種機制;門檻 1.25、灰區、1.5 上限、統計、加量規則一個都不動,比的仍是同一個使用者動作
 * (滾輪)在兩份建置裡的結果。main 合入 Q2b 之後兩邊都是原生,規則自動不再改任何東西。
 *
 * `pinnedMechanismPlan(refNative, mineNative)`:開跑前依兩邊的結構(釘選面板在不在共用捲動盒裡)決定參考的指標停在哪。
 *   參考轉發、受測原生 → 參考(含 A/A 那份)指標改到中央欄量原生捲動(同一段滾輪序列與刻度),三項都比;
 *   參考原生、受測轉發 → 長工照比,空白與幀距不比(這一側沒有可對的同機制路徑);兩邊相同 → 照舊;讀不到 → 指標不動,由 `pinnedComparable` 逐趟判。
 * `gpPointerLabels(plan, { ref, aa })`:G-P 要把指標移到中央欄的那幾份 —— 參考**與** A/A 那份一起移(覆核 SF2:只移參考時 A/A 比的是
 *   「原生 vs 轉發」,`aaMechanismCheck` 會判 A/A 量不到;這支把「一起移」變成判定表守得到的一行)。
 * `pinnedComparable(checkKey, refSet, mineSet)`:兩邊各趟實際機制的集合(true = 原生、false = 轉發、null = 讀不到)。
 *   兩邊都只有一個值而且相同 → 比(`why: 'same'`);否則長工合計照比,空白、幀距與 checkerboard 次數不比,`why` 說為什麼:
 *     'ref-native-mine-forwarding' = 參考原生、受測轉發(例:退回 Q2b 的 PR)—— 這一側本來就沒有同機制路徑,印 `mechanism-differs`,不當通過也不當失敗;
 *     'gp-missed' = 參考轉發、受測原生 —— 這正是 G-P 該把參考指標移到中央欄的情況,卻還是量到轉發(開跑前判定讀不到 / 沒套上)。
 *       同機制那條路沒量到 → 呼叫端以「儀器失效」紅(覆核 SF1:原本默默印 ↷,空白與幀距兩項整個沒比,M37 第八種形狀);
 *     'unreadable' = 讀不到 / 同一份建置各趟不一致 —— 同樣是沒量到,同樣以「儀器失效」紅。
 */
export function pinnedMechanismPlan(refNative, mineNative) {
  if (typeof refNative !== 'boolean' || typeof mineNative !== 'boolean') return { refPointer: 'pinned', why: 'unknown' }
  if (!refNative && mineNative) return { refPointer: 'center', why: 'ref-forwarding-mine-native' }
  if (refNative && !mineNative) return { refPointer: 'pinned', why: 'ref-native-mine-forwarding' }
  return { refPointer: 'pinned', why: 'same' }
}
export const gpPointerLabels = (plan, { ref, aa }) => (plan?.refPointer === 'center' ? [ref, aa].filter(Boolean) : [])
export function pinnedComparable(checkKey, refSet, mineSet) {
  const one = (xs) => (xs.length === 1 && typeof xs[0] === 'boolean' ? xs[0] : null)
  const ref = one(refSet), mine = one(mineSet)
  if (ref !== null && ref === mine) return { compare: true, ref, mine, why: 'same' }
  const why = ref === true && mine === false ? 'ref-native-mine-forwarding' : ref === false && mine === true ? 'gp-missed' : 'unreadable'
  return { compare: checkKey === 'longSum', ref, mine, why }
}

/**
 * 三份以上建置的輪轉順序(拉丁方):第 i 輪從第 i mod n 份開始。兩份時維持舊的 ABBA(奇數輪照順序、偶數輪反過來),
 * 與 A/A 之前逐位元相同。
 */
export function roundOrderOf(list, i) {
  if (list.length <= 2) return i % 2 === 1 ? list : [...list].reverse()
  const k = ((i % list.length) + list.length) % list.length
  return [...list.slice(k), ...list.slice(0, k)]
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
