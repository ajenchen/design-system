/**
 * sort-cycle — 表頭排序的唯一判定(純函式;2026-11-03,user 2026-10-30 第十五〜十七輪規格)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `column-meta.ts`:lib/ 資料夾 = internal helper,
 * 不進 root barrel)。表頭點擊、表頭鍵盤、表頭 ⌄ 選單、順位數字、讀屏宣告都從這裡取,不各寫一份(M17)。
 *
 * 為什麼不用 TanStack 內建的 `getToggleSortingHandler`(修前用它;v8.21.3 `RowSorting.ts` toggleSorting):
 *   - 一般點擊「多重排序裡的最後一欄」走它的 `toggle` 分支 → **只改這一欄、其他欄留著**(實測 108a736f:
 *     標題↑ 狀態↑ 優先級↑ → 點優先級 → 三欄都還在、優先級變↓),違反 user 規格「一般點擊 = 清掉其他欄」。
 *   - 一般點擊「多重排序裡不是最後、目前是降冪」的欄走 `replace` 分支 → 變成**升冪**(它的 nextDesc 在下一步是「清除」時取 false),
 *     違反「從目前方向切下一個(降冪 → 清除)」。
 *   - 第一下的方向看第一列的值是不是字串(`getAutoSortDir`):數字欄、人員欄第一下是**降冪**(實測 108a736f:進度% / 負責人第一下 ↓),
 *     與 user 的循環「升冪 → 降冪 → 清除」和本元件 anatomy 文件「點擊 header 切換 asc / desc / none 三態」都不符。
 *
 * 規格(user 2026-10-30 原話逐字在 tmp/wip-2026-10-13/ssot-consolidated/user-answers-2026-10-27.md 第十五〜十七輪;規範住
 * `../data-table.spec.md`「Multi-sort header」列):
 *   - 循環 = 升冪 → 降冪 → 清除(「1. 就用ds的字眼就好」)
 *   - Shift+點擊:這一欄不在排序裡 → 加到最後、升冪;在排序裡 → 照循環走下一步,順位不動;下一步是清除 → 拿掉,後面的順位往前補(「3. 對」)
 *   - 一般點擊:清掉其他欄,這一欄從目前方向切下一個(「2. a」= AI 10-30 選項 (a)「從它目前的方向切到下一個…AG Grid 是這樣」)
 *   - 只有一欄排序時不顯示數字;第 10 個以後一律「9+」、不限欄數(「4. 不要限制欄數,超過一律9+」)
 * Shift+點擊在排序中的欄**順位不動**是 AI 推導(user 規格沒寫;AG Grid 會把它移到最後,見 spec 該列的對照):
 * 理由 = 與排序面板(`../data-table-sort-manager.tsx` `updateAt`:改方向原地替換)同一個動作同一個結果。
 */
import type { SortingState } from '@tanstack/react-table'

export type SortDirection = 'asc' | 'desc'

/** 循環的下一步(升冪 → 降冪 → 清除 → 升冪)。`false` = 沒排序。 */
export function nextSortDirection(current: SortDirection | false): SortDirection | false {
  if (current === false) return 'asc'
  if (current === 'asc') return 'desc'
  return false
}

const directionOf = (sorting: SortingState, columnId: string): SortDirection | false => {
  const entry = sorting.find((s) => s.id === columnId)
  return entry ? (entry.desc ? 'desc' : 'asc') : false
}

/**
 * 點表頭(或在表頭的排序區按 Enter / Space)之後的排序。
 * @param additive Shift+點擊 / Shift+Enter / Shift+Space(且這張表允許多重排序)
 */
export function sortingAfterHeaderActivate(sorting: SortingState, columnId: string, additive: boolean): SortingState {
  const next = nextSortDirection(directionOf(sorting, columnId))
  if (!additive) return next === false ? [] : [{ id: columnId, desc: next === 'desc' }]
  const index = sorting.findIndex((s) => s.id === columnId)
  if (index < 0) return [...sorting, { id: columnId, desc: false }]
  if (next === false) return sorting.filter((_, i) => i !== index)
  return sorting.map((s, i) => (i === index ? { ...s, desc: next === 'desc' } : s))
}

/**
 * 表頭 ⌄ 欄位選單的三個排序項。
 *   升冪排序 / 降冪排序 = 一般點擊的同一種動作(不按 Shift):清掉其他欄、只用這一欄這個方向。
 *   取消排序(`null`)= 只拿掉這一欄,後面的順位往前補(同 Shift+點擊的清除、同排序面板的刪除鈕)。
 * 修前「升冪 / 降冪」走 TanStack `toggleSorting(desc, false)`,這一欄剛好是多重排序的最後一欄時只改它、其他欄留著,
 * 不是最後一欄時清掉其他欄 —— 同一個選單項,結果看順位而定。
 */
export function sortingFromColumnMenu(sorting: SortingState, columnId: string, direction: SortDirection | null): SortingState {
  if (direction === null) return sorting.filter((s) => s.id !== columnId)
  return [{ id: columnId, desc: direction === 'desc' }]
}

/** 數字最多顯示到 9,第 10 個以後一律「9+」(Badge `max` 的「max+」寫法,`../../Badge/badge.tsx`)。 */
export const SORT_PRIORITY_DISPLAY_MAX = 9

/** 這一欄在多重排序裡的順位(1 起算);沒排序或只有一欄排序 → `null`(不顯示數字)。 */
export function sortPriority(sorting: SortingState, columnId: string): number | null {
  if (sorting.length < 2) return null
  const index = sorting.findIndex((s) => s.id === columnId)
  return index < 0 ? null : index + 1
}

/** 表頭上畫出來的順位字:`null` = 不畫;1–9 照寫;10 以上 = 「9+」。 */
export function sortPriorityLabel(sorting: SortingState, columnId: string): string | null {
  const priority = sortPriority(sorting, columnId)
  if (priority === null) return null
  return priority > SORT_PRIORITY_DISPLAY_MAX ? `${SORT_PRIORITY_DISPLAY_MAX}+` : String(priority)
}

/** 讀屏的順位描述(掛在排序區的 `aria-describedby`):畫面上是「9+」時這裡照實說第幾 —— 讀屏沒有寬度限制。 */
export function sortPriorityDescription(sorting: SortingState, columnId: string): string | null {
  const priority = sortPriority(sorting, columnId)
  return priority === null ? null : `排序順位 ${priority}`
}

/**
 * 從表頭改排序後播報的一句話(polite;焦點留在排序區上,`aria-sort` 掛在外層欄頭,讀屏不會自己唸出變化)。
 * 句型只用 DS 既有字眼(排序 / 升冪 / 降冪 / 取消排序);多重排序時照順位全部唸 ——
 * 加進第 N 欄時,使用者聽得到前面幾欄還在(Adrian Roselli 的多欄排序實驗同一個做法,見 spec「Multi-sort header」列)。
 */
export function sortChangeAnnouncement(sorting: SortingState, labelOf: (columnId: string) => string): string {
  if (sorting.length === 0) return '已取消排序'
  const dir = (s: SortingState[number]) => (s.desc ? '降冪' : '升冪')
  if (sorting.length === 1) return `已依 ${labelOf(sorting[0].id)} ${dir(sorting[0])}排序`
  return `排序:${sorting.map((s, i) => `${i + 1} ${labelOf(s.id)} ${dir(s)}`).join(',')}`
}
