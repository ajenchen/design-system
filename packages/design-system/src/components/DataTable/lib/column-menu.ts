/**
 * column-menu — 表頭 ⌄ 欄位選單「有哪些項目、分幾組」的唯一判定(純函式、零依賴;2026-11-27 立,workspace H42)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `sort-cycle.ts`:lib/ 資料夾 = internal helper,不進 root barrel)。
 * 表頭的 ⌄ 觸發鈕畫不畫、選單裡畫哪幾項、分隔線畫在哪,都讀這一份 —— 不在 `../data-table.tsx` 觸發鈕與選單各寫一次條件。
 * 修前(0.1.0-beta.151)觸發鈕一律畫、選單每一項各自判斷:項目全不成立時(例:`tableOptions.enableHiding: false` 的不可排序欄)
 * 點開是一個只有上下內距、沒有項目的空選單;分隔線固定畫在排序項後面,後面沒有項目時底部多一條。
 *
 * 規則(`../data-table.spec.md`「九之二」表頭選單那一列):
 *   - 兩組,依序:排序(升冪 / 降冪 / 取消排序 —— 出不出由 `sort-cycle.ts` `columnMenuSortItems` 算好交進來)、
 *     這一欄的其他動作(依此欄篩選… / 隱藏欄位 / 自動調整寬度)。
 *   - 沒有項目的組不列;分隔線只畫在兩組之間 = 兩組都有項目才畫(`../../DropdownMenu/dropdown-menu.spec.md`「Item 類型」:
 *     Separator「視覺分隔，劃分邏輯群組」)。
 *   - 一組都沒有 → 回空陣列,呼叫端不畫 ⌄(連外層與展開時的 8px 都不畫)。
 *   - 整張表 `enableColumnMenu={false}`(workspace 2026-11-27 追加:產品表頭一律不要 ⌄)→ 恆回空陣列;排序區照常可點,不經本檔。
 * 項目 id = 該項在 `DataTableLabels` 裡的字的鍵名,呼叫端直接拿 id 取字,不另寫對照。
 * 零依賴(只有型別 import):判定表 `scripts/test-data-table-sort-cycle.mjs` 直接用 node 載入本檔。
 */
import type { SortMenuItem } from './sort-cycle'

export type ColumnMenuItem = SortMenuItem | 'filterByColumn' | 'hideColumn' | 'autoFitColumnWidth'

/** 這一欄做得到哪些「其他動作」—— 由呼叫端從 TanStack / DataTable 參數讀出來交進來(本檔不碰 TanStack 的 column 物件) */
export interface ColumnMenuActions {
  /** DataTable 的 `enableColumnMenu`(預設 true);false = 整張表關掉欄位選單 → 恆回空陣列,每一欄都不畫 ⌄ */
  enabled: boolean
  /** DataTable 有傳 `onColumnFilterTrigger` */
  canFilter: boolean
  /** `column.getCanHide()`(表層 `tableOptions.enableHiding` 與欄層 `enableHiding` 都由 TanStack 算進來) */
  canHide: boolean
  /** `enableColumnResize` 而且不是系統欄 */
  canAutoFit: boolean
}

/**
 * ⌄ 選單的項目,依組排好;回傳的每一組都至少一項,組與組之間畫分隔線。空陣列 = 這一欄沒有選單、不畫 ⌄。
 * `sortItems` = 排序那一組(不能排序的欄傳空陣列;能排序的欄傳 `columnMenuSortItems(...)` 的結果)。
 */
export function columnMenuGroups(sortItems: readonly SortMenuItem[], can: ColumnMenuActions): ColumnMenuItem[][] {
  if (!can.enabled) return []
  const actions: ColumnMenuItem[] = []
  if (can.canFilter) actions.push('filterByColumn')
  if (can.canHide) actions.push('hideColumn')
  if (can.canAutoFit) actions.push('autoFitColumnWidth')
  return [[...sortItems], actions].filter((group) => group.length > 0)
}
