/**
 * editing-rows — 編輯狀態的格鍵(`cellEditId`)與它的**反函式**:「哪幾列正在編輯」(純函式;2026-11-16 A25 覆核 SF10 抽出)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `column-meta.ts` / `sort-cycle.ts`:lib/ 資料夾 = internal helper,
 * 不進 root barrel)。格鍵的格式與它的反函式住在同一個檔裡,改一邊就看得到另一邊(M17)。
 *
 * 為什麼要反函式精確比(M37):編輯中的那一列永遠要留在虛擬範圍裡(data-table.tsx `shellRangeExtractor`;捲出範圍會被卸載,
 * 一般 inlineEdit 打到一半的草稿就丟了)。找「哪一列在編輯」若只比前綴 `${rowId}__`,那是「同一列」的代理 ——
 * 列 id 本身含 `__`、又剛好是另一列 id 的前綴時會配錯(列 `a` 與列 `a__b` 都配得上 `a__b__c`)。
 * 這裡要求前綴之後剩下的**正好是一個存在的欄 id**。格鍵格式本身有歧義時(列 `a` + 欄 `b__c` 與列 `a__b` + 欄 `c` 都組成 `a__b__c`),
 * 兩列都會被 data-table.tsx 的 `isEditingThisCell` 當成編輯中,這裡也兩列都回 —— 與畫面上「誰在編輯」同一個答案,多掛一列無害。
 * 判定表與兩面對照(前綴代理那一版必須紅):`scripts/test-data-table-editing-rows.mjs`。
 */

/** 編輯狀態的格鍵(`${rowId}__${colId}`)。 */
export const cellEditId = (rowId: string, colId: string): string => `${rowId}__${colId}`

/**
 * 正在編輯的那一格(`editingCellId`,由 `cellEditId` 組成)落在哪幾列。沒有在編輯 → 空陣列。
 * @param rowIds 依列序排好的列 id(回傳的是這個陣列的索引)
 * @param colIds 表格全部葉欄的 id
 */
export function editingRowIndexesOf(editingCellId: string | null | undefined, rowIds: readonly string[], colIds: Iterable<string>): number[] {
  if (editingCellId == null) return []
  const cols = colIds instanceof Set ? (colIds as Set<string>) : new Set(colIds)
  const hits: number[] = []
  rowIds.forEach((rowId, i) => {
    const prefix = cellEditId(rowId, '')
    if (editingCellId.startsWith(prefix) && cols.has(editingCellId.slice(prefix.length))) hits.push(i)
  })
  return hits
}
