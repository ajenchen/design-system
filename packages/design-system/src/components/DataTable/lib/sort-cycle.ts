/**
 * sort-cycle — 表頭排序的唯一判定(純函式;2026-11-03,user 2026-10-30 15:26 / 17:08 / 17:09(台灣時間)在對話裡給的規格)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `column-meta.ts`:lib/ 資料夾 = internal helper,
 * 不進 root barrel)。表頭點擊、表頭鍵盤、表頭 ⌄ 選單、順位數字、讀屏宣告都從這裡取,不各寫一份(M17)。
 *
 * 為什麼不用 TanStack 內建的 `getToggleSortingHandler`(修前用它;v8.21.3 `RowSorting.ts` toggleSorting):
 *   - 一般點擊「多重排序裡的最後一欄」走它的 `toggle` 分支 → **只改這一欄、其他欄留著**(實測 108a736f:
 *     標題↑ 狀態↑ 優先級↑ → 點優先級 → 三欄都還在、優先級變↓),違反 user 規格「一般點擊 = 清掉其他欄」。
 *   - 一般點擊「多重排序裡不是最後、目前是降冪」的欄走 `replace` 分支 → 變成**升冪**(它的 nextDesc 在下一步是「清除」時取 false),
 *     違反「從目前方向切下一個(降冪 → 清除)」。
 *   - 第一下的方向看**第一列的值是不是字串**(`getAutoSortDir`,v8.21.3 `RowSorting.ts:335-345`:字串 → 升冪,其他一律降冪):
 *     數字 / 金額 / 勾選 / 人員 / 多人 / 多選欄、值是 Date 物件的欄,以及第一列剛好是空值的欄(連字串欄也算)第一下都是**降冪**,
 *     同一欄的方向會跟著資料變(實測 108a736f:進度% / 負責人第一下 ↓)。這條從沒寫進任何 DS 文件;DS 文件一直寫的是 asc → desc → none
 *     (`../data-table.anatomy.stories.tsx` 說明頁 2026-04-18 起「點擊 header 切換 asc / desc / none 三態」、2026-04-29 f8cec708
 *     「Tri-state 保留(asc → desc → none)」、`../data-table.tsx` 表頭註解「click → toggle sort 三態(asc → desc → none)」),
 *     也就是 user 給的循環「加入並升冪 → 降冪 → 清除」。世界級在這點不一致 —— AG Grid v33 `sortService.ts:13`
 *     `DEFAULT_SORTING_ORDER = ['asc', 'desc', null]`、MUI X v7 `dataGridPropsDefaultValues.ts:60` `sortingOrder: ['asc', 'desc', null]`、
 *     Polaris v13 DataTable `defaultSortDirection = 'ascending'`(`DataTable.tsx:978`)升冪先;Polaris v13 IndexTable 預設
 *     `defaultSortDirection = 'descending'`(`IndexTable.tsx:149`);TanStack 依型別 —— 所以依據是 DS 文件與 user 的循環,不是世界級:
 *     第一下一律升冪、不分欄型(spec「Multi-sort header」列)。
 *
 * 規格(user 2026-10-30 在對話裡給的規格與 4 點回覆;下列引號內是原話逐字;規範與主要原話住
 * `../data-table.spec.md`「Multi-sort header」列):
 *   - 循環 = 升冪 → 降冪 → 清除(「1. 就用ds的字眼就好」)
 *   - Shift+點擊:這一欄不在排序裡 → 加到最後、升冪;在排序裡 → 照循環走下一步,順位不動;下一步是清除 → 拿掉,後面的順位往前補(「3. 對」)
 *   - 一般點擊:清掉其他欄,這一欄從目前方向切下一個(「然後不加shift的click則按照目前的邏輯,只要直接點了就會清空所有排序並以目前所點擊的column作為排序依據」
 *     —— 「目前的邏輯」接著講的是清掉其他欄,沒有講方向;「2. a」= AI 10-30 選項 (a)「從它目前的方向切到下一個…AG Grid 是這樣」)
 *   - 只有一欄排序時不顯示數字;第 10 個以後一律「9+」、不限欄數(「4. 不要限制欄數,超過一律9+」)
 * Shift+點擊在排序中的欄**順位不動**是 AI 推導(user 規格沒寫;世界級不一致:AG Grid 會把它移到最後、MUI X 原地替換,見 spec 該列的對照):
 * 理由 = 與排序面板(`../data-table-sort-manager.tsx` `updateAt`:改方向原地替換)同一個動作同一個結果。
 * ⌄ 選單的「取消排序」在多重排序時**不顯示**(同修前):按了要拿掉這一欄還是清掉全部,規格沒寫、DS 前例與世界級相反,要 user 決定
 * (`columnMenuShowsCancelSort`)。
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
 *   升冪排序 / 降冪排序 = 一般點擊的同一種動作(不按 Shift):清掉其他欄、只用這一欄這個方向(AG Grid v33 選單 `setSortForColumn(column, 'asc', false)`、
 *   MUI X v7 選單 `sortColumn(field, 'asc')` 同樣清掉其他欄)。
 *   取消排序(`null`)= 拿掉這一欄;選單只在 `columnMenuShowsCancelSort` 為真(只有這一欄在排序)時出這一項,所以實際結果恆為「沒有排序」。
 * 修前「升冪 / 降冪」走 TanStack `toggleSorting(desc, false)`,這一欄剛好是多重排序的最後一欄時只改它、其他欄留著,
 * 不是最後一欄時清掉其他欄 —— 同一個選單項,結果看順位而定。
 */
export function sortingFromColumnMenu(sorting: SortingState, columnId: string, direction: SortDirection | null): SortingState {
  if (direction === null) return sorting.filter((s) => s.id !== columnId)
  return [{ id: columnId, desc: direction === 'desc' }]
}

/**
 * ⌄ 選單要不要出「取消排序」:這一欄在排序裡,而且**只有這一欄**在排序。
 * 多重排序時不出(同 2026-05-04 K7 起的行為):K7 藏它的理由(沒有順位數字的箭頭是片段資訊)已經消失,但按了要「只拿掉這一欄」
 * (DS 排序面板的刪除鈕、Shift+點擊的清除)還是「清掉全部」(AG Grid v33 選單 `sortUnSort` → `setSortForColumn(column, null, false)`;
 * MUI X v7 選單 Unsort → `sortColumn(field, null)` → `sortModel = []`)規格沒寫、DS 前例與世界級相反 → 要 user 決定,決定前維持修前
 * (data-table.spec.md「Multi-sort header」列)。
 */
export function columnMenuShowsCancelSort(sorting: SortingState, columnId: string): boolean {
  return sorting.length === 1 && sorting[0].id === columnId
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
