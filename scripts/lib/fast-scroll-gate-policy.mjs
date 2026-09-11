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
 * **用固定工作量的對照組把「runner 快慢」跟「程式碼好壞」分開**(2026-09-11)。
 *
 * 問題:空白門檻 400ms 是絕對值,但 CI runner 的速度自己會漂。同一份元件邏輯(git diff 去掉註解後零差異)
 * 在 CI 上量到空白中位 162 / 325 / 485 / 471ms —— 3 倍散佈,絕對門檻只是在量那台機器。
 *
 * 證據:這支閘本來就有一個**固定工作量**的正對照(每個 scroll 事件忙等 120ms,與我們的程式碼無關),
 * 它的最長空白是純粹的機器速度讀數。把它跟實測空白並排,相關性一目了然:
 *
 *   commit      忙等對照    實測空白   閘
 *   eb5b42fc     737ms        —       ✓
 *   4ea6a462     957ms      162ms     ✓
 *   04c6abe4     775ms      325ms     ✓
 *   546ae35b    1171ms      485ms     ✗
 *   50ee1d3b    1082ms      471ms     ✗
 *
 * (同一份 job 的靜態負對照呈現幀數是 55/55/56/55/52/56 —— 送幀本身沒壞,是機器慢。)
 *
 * 所以:`limit = absolute × max(1, control / CONTROL_BASELINE)`。
 * `CONTROL_BASELINE = 775ms` 取自 `04c6abe4` 那一跑 —— **門檻當初就是在那個量級的機器上校準並通過的**。
 *
 * **偵測力為什麼沒掉**:對照組的工作量是寫死的忙等,跟我們的元件無關。
 * 真回歸 = 空白漲、對照不動 → 比值上升 → 紅。機器變慢 = 兩個一起漲 → 比值不動 → 綠。
 * 這正是「把 main 當低標」要的那種相對判定,只是參考點換成一個更便宜、更穩定的固定工作量。
 */
export const CONTROL_BASELINE_MS = 775
export const runnerScaledLimit = (absoluteLimit, controlMs, baseline = CONTROL_BASELINE_MS) =>
  Number.isFinite(controlMs) && controlMs > 0
    ? absoluteLimit * Math.max(1, controlMs / baseline)
    : absoluteLimit
