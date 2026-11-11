/**
 * sort-cycle — 表頭排序的唯一判定(純函式;2026-11-03 立,2026-11-11 依 user R16 定案改寫)。
 *
 * **Scope:Internal-only — DataTable 自用,非 public API**(同 `column-meta.ts`:lib/ 資料夾 = internal helper,
 * 不進 root barrel)。表頭點擊、表頭 Enter / Space(含 Shift)、表頭 ⌄ 選單三項、順位數字、讀屏描述、播報都從這裡取,
 * 不各寫一份(M17)。排序怎麼變只有 `nextSorting` 一支 —— 呼叫端把「使用者做了什麼」(`SortAction`)交給它,不自己判斷。
 *
 * 規則(user 2026-11-11 定案;原話逐字住 `../data-table.spec.md`「Multi-sort header」列,這裡只寫規則):
 *   - 循環兩態:點已排序的欄只在升冪 ↔ 降冪之間切,點表頭永遠不會變成「沒排序」;第一下一律升冪、不分欄型。
 *   - 已排序的欄:一般點擊 = Shift+點擊 = 只翻這一欄的方向,其他欄與順位不動(Shift 只是「加進多重排序」的捷徑)。
 *   - 沒排序的欄:一般點擊 = 取代全部(只剩這一欄、升冪);Shift+點擊 = 加到多重排序最後、升冪。
 *   - ⌄ 選單「取消排序」:只拿掉這一欄,後面的順位往前補(多重排序也出)。
 *   - ⌄ 選單升冪 / 降冪:已排序的欄只列相反方向那一項,點了只翻這一欄;沒排序的欄兩項都列,點了取代全部(同一般點擊)。
 *   - 取消排序只能走明確的 UI(⌄ 選單「取消排序」、排序面板),不在點擊循環裡。
 * 修前(2026-11-03 → 11-11):循環三態(升冪 → 降冪 → 清除)、一般點擊清掉其他欄、⌄「取消排序」清掉全部。
 * 為什麼不用 TanStack 內建的 `getToggleSortingHandler`(2026-11-03 前用它;v8.21.3 `RowSorting.ts` toggleSorting):
 *   它的一般點擊看「這一欄是不是多重排序的最後一欄」決定清不清其他欄,第一下方向看第一列的值是不是字串(`getAutoSortDir`,
 *   數字 / 人員 / 日期物件欄第一下降冪),兩者都不是本 DS 的規則;判定表的對照組保留那段修前行為(`scripts/test-data-table-sort-cycle.mjs`)。
 */
import type { SortingState } from '@tanstack/react-table'

export type SortDirection = 'asc' | 'desc'

/**
 * 使用者對一欄做的排序動作 —— 表頭與選單的每一個入口都換算成其中一種,交給 `nextSorting`:
 *   - `activate`:點表頭排序區 / 在排序區按 Enter 或 Space;`additive` = 有按 Shift **且**這張表、這一欄允許多重排序
 *   - `set`:⌄ 選單「升冪排序」/「降冪排序」
 *   - `remove`:⌄ 選單「取消排序」
 */
export type SortAction =
  | { kind: 'activate'; additive: boolean }
  | { kind: 'set'; direction: SortDirection }
  | { kind: 'remove' }

/**
 * 排序變化的唯一判定。只看「這一欄在不在排序裡」與動作,不看它排第幾、不看其他欄:
 *   在排序裡 → `activate` 翻方向、`set` 換成指定方向、`remove` 拿掉(後面往前補),都**原地**改,其他欄與順位不動;
 *   不在排序裡 → `activate` 加 Shift 接到最後、其餘(一般點擊、選單升 / 降冪)取代全部;第一下一律升冪;`remove` 不變。
 */
export function nextSorting(sorting: SortingState, columnId: string, action: SortAction): SortingState {
  const index = sorting.findIndex((s) => s.id === columnId)
  if (action.kind === 'remove') return index < 0 ? sorting : sorting.filter((_, i) => i !== index)
  if (index >= 0) {
    const desc = action.kind === 'set' ? action.direction === 'desc' : !sorting[index].desc
    return sorting.map((s, i) => (i === index ? { ...s, desc } : s))
  }
  const entry = { id: columnId, desc: action.kind === 'set' && action.direction === 'desc' }
  return action.kind === 'activate' && action.additive ? [...sorting, entry] : [entry]
}

const directionOf = (sorting: SortingState, columnId: string): SortDirection | false => {
  const entry = sorting.find((s) => s.id === columnId)
  return entry ? (entry.desc ? 'desc' : 'asc') : false
}

/** ⌄ 選單要不要出「取消排序」:這一欄在排序裡就出(多重排序也出)。按了只拿掉這一欄(`nextSorting` 的 `remove`)。 */
export function columnMenuShowsCancelSort(sorting: SortingState, columnId: string): boolean {
  return sorting.some((s) => s.id === columnId)
}

/**
 * ⌄ 選單要不要出「升冪排序」(`'asc'`)/「降冪排序」(`'desc'`):這一欄**目前就是**這個方向 → 不出(選了沒有任何變化),其餘都出。
 * 看的是**這一欄自己**的方向,不看它在多重排序裡排第幾、也不看其他欄。已排序的欄因此只剩「相反方向」一項。
 * 來源:user 2026-11-10 PR #172 決策頁留言(問句,逐字)「應該要把當前的排序的選項拿掉吧？因為選了沒意義啊」;AI 查證世界級一致後照做:
 * AG Grid 欄位選單 `if (!(isAscending && isDefaultSort)) result.push('sortAscending')`、`if (!(isDescending && isDefaultSort)) result.push('sortDescending')`
 * (https://github.com/ag-grid/ag-grid/blob/latest/packages/ag-grid-enterprise/src/menu/columnMenuFactory.ts#L137-L160)、
 * MUI X `sortDirection !== 'asc'` / `sortDirection !== 'desc'` 才渲染該項
 * (https://github.com/mui/mui-x/blob/master/packages/x-data-grid/src/components/menu/columnMenu/menuItems/GridColumnMenuSortItem.tsx#L56-L73)。
 */
export function columnMenuShowsSortDirection(sorting: SortingState, columnId: string, direction: SortDirection): boolean {
  return directionOf(sorting, columnId) !== direction
}

/**
 * 排序相關的介面字串(選單項、讀屏描述、播報句)集中在這裡,同 `../data-table-filter-labels.ts` 的 labels 形狀
 * (介面 + 預設值;要帶參數的句子寫成函式)。DataTable 目前沒有 `labels` prop,先由元件直接用預設值 —— 要開放覆寫時接這一份,
 * 不在各處另寫字串。字眼只用 DS 既有的「排序 / 升冪 / 降冪 / 取消排序」(user 2026-10-30「1. 就用ds的字眼就好」)。
 */
export interface DataTableSortLabels {
  /** ⌄ 選單項 */
  sortAscending: string
  sortDescending: string
  cancelSort: string
  /** 方向的名字(播報句用) */
  ascending: string
  descending: string
  /** 排序區的 `aria-describedby`:「排序順位 N」 */
  priorityDescription: (priority: number) => string
  /** 播報:這一欄現在的方向(「已依 截止日 降冪排序」) */
  announceSorted: (column: string, direction: string) => string
  /** 播報:拿掉了這一欄(「已取消 狀態 的排序」) */
  announceRemoved: (column: string) => string
  /** 播報:一般點擊沒排序的欄、把其他欄換掉時補的一句 */
  announceOthersCleared: string
  /** 播報:結果還剩幾欄時的整串(「共 3 欄排序:1 標題 升冪,2 截止日 降冪,3 狀態 升冪」) */
  announceSummary: (count: number, entries: string) => string
  announceSummaryEntry: (priority: number, column: string, direction: string) => string
  /** 播報:拿掉之後只剩一欄 / 一欄都沒有 */
  announceRemaining: (column: string, direction: string) => string
  announceNone: string
}

export const DATA_TABLE_SORT_DEFAULT_LABELS: DataTableSortLabels = {
  sortAscending: '升冪排序',
  sortDescending: '降冪排序',
  cancelSort: '取消排序',
  ascending: '升冪',
  descending: '降冪',
  priorityDescription: (priority) => `排序順位 ${priority}`,
  announceSorted: (column, direction) => `已依 ${column} ${direction}排序`,
  announceRemoved: (column) => `已取消 ${column} 的排序`,
  announceOthersCleared: '其他欄的排序已清除',
  announceSummary: (count, entries) => `共 ${count} 欄排序:${entries}`,
  announceSummaryEntry: (priority, column, direction) => `${priority} ${column} ${direction}`,
  announceRemaining: (column, direction) => `目前依 ${column} ${direction}排序`,
  announceNone: '目前沒有排序',
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
export function sortPriorityDescription(sorting: SortingState, columnId: string, labels: DataTableSortLabels = DATA_TABLE_SORT_DEFAULT_LABELS): string | null {
  const priority = sortPriority(sorting, columnId)
  return priority === null ? null : labels.priorityDescription(priority)
}

/**
 * 從表頭 / ⌄ 選單改排序後播報的一句話(polite;焦點留在排序區或回到 ⌄ 上,`aria-sort` 掛在外層欄頭,讀屏不會自己唸出變化)。
 * 句子 = 「這一欄發生了什麼」+「結果」:
 *   - 這一欄被拿掉 → 「已取消 X 的排序」,接著說剩下的(兩欄以上照順位全唸 / 一欄 / 沒有排序);
 *   - 這一欄在結果裡 → 「已依 X 升冪 / 降冪排序」;結果兩欄以上再照順位全唸;一般點擊沒排序的欄把其他欄換掉時補「其他欄的排序已清除」。
 * 多重排序時照順位全唸,讓使用者聽得到其他欄還在、排第幾(Adrian Roselli 的多欄排序實驗同一個做法,見 spec「Multi-sort header」列)。
 * `previous` 由呼叫端傳「這次動作之前」的排序(與交給 `nextSorting` 的是同一個值),不在這裡另外推。
 */
export function sortChangeAnnouncement(
  previous: SortingState,
  next: SortingState,
  columnId: string,
  labelOf: (columnId: string) => string,
  labels: DataTableSortLabels = DATA_TABLE_SORT_DEFAULT_LABELS,
): string {
  const dir = (s: SortingState[number]) => (s.desc ? labels.descending : labels.ascending)
  const summary = () => labels.announceSummary(next.length, next.map((s, i) => labels.announceSummaryEntry(i + 1, labelOf(s.id), dir(s))).join(','))
  const entry = next.find((s) => s.id === columnId)
  if (!entry) {
    const removed = labels.announceRemoved(labelOf(columnId))
    if (next.length === 0) return `${removed},${labels.announceNone}`
    if (next.length === 1) return `${removed},${labels.announceRemaining(labelOf(next[0].id), dir(next[0]))}`
    return `${removed},${summary()}`
  }
  const sorted = labels.announceSorted(labelOf(columnId), dir(entry))
  if (next.length >= 2) return `${sorted},${summary()}`
  const othersCleared = previous.some((s) => s.id !== columnId)
  return othersCleared ? `${sorted},${labels.announceOthersCleared}` : sorted
}
