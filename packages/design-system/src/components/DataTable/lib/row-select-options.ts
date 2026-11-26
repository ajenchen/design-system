/**
 * row-select-options — select 欄**編輯器**這一列的選單內容(純函式;2026-11-26,user 第五輪決策卡 C4 選「B:只列可選的」)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `editing-rows.ts` / `column-meta.ts`:lib/ 資料夾 = internal helper,
 * 不進 root barrel)。對外的 API 是欄的 `meta.getRowOptions`(`column-types.ts`);規則 → data-table.spec.md「七、Column Type」的「依列可選項」段。
 *
 * 規則:
 *   - 欄沒給 `getRowOptions`(rowOptions 為 undefined)→ 整欄 `meta.options`(現況不變)。
 *   - 有給 → 這一列回傳的清單,順序照回傳的;回傳項目帶 `disabled` 就照 Select 既有的停用呈現(不可點、鍵盤跳過)。
 *   - 目前的值不在這一列的清單裡、但在整欄清單裡 → 從整欄清單把那一項補回,插在整欄順序裡它該在的位置
 *     (照 Select 既有規則「value 不在 options 也要顯示原值、不沉默丟失」select.tsx `selectedLabel`;
 *     編輯器是新掛的 Select 實例,沒看過整欄清單,不補回觸發欄位只剩原始值、選單裡也沒有打勾的那一項)。
 *     選它 = 值不變。【AI 推導 2026-11-26】
 *   - 整欄清單也沒有目前的值 → 不補(交給 Select 既有的原值顯示)。
 * 判定表與突變對照組:`scripts/data-table-invariants.mjs` I40。
 */
import type { SelectOption } from '../../Select/select'

export function rowSelectOptions(
  columnOptions: readonly SelectOption[],
  rowOptions: readonly SelectOption[] | undefined,
  value: unknown,
): SelectOption[] {
  if (rowOptions === undefined) return [...columnOptions]
  if (value === null || value === undefined || value === '' || rowOptions.some((o) => o.value === value)) return [...rowOptions]
  const current = columnOptions.find((o) => o.value === value)
  if (current === undefined) return [...rowOptions]
  // 整欄順序:不在整欄清單裡的列選項排在最後(與「不在選項裡的值排在所有選項之後」同一個方向,lib/column-sorting.ts)
  const rank = (v: string) => {
    const i = columnOptions.findIndex((o) => o.value === v)
    return i < 0 ? Number.POSITIVE_INFINITY : i
  }
  const currentRank = rank(current.value)
  const at = rowOptions.findIndex((o) => rank(o.value) > currentRank)
  return at < 0 ? [...rowOptions, current] : [...rowOptions.slice(0, at), current, ...rowOptions.slice(at)]
}
