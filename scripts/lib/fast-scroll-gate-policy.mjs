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

/** 回傳 'pass' | 'median'(中位數超標)| 'ceiling'(中位數過但有一趟超過門檻×ceiling)。 */
export const gateVerdict = (vals, limit, ceiling = 2) => {
  if (!vals.length) return 'pass'
  const mid = median(vals)
  const worst = Math.max(...vals)
  return mid > limit ? 'median' : worst > limit * ceiling ? 'ceiling' : 'pass'
}
