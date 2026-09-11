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
