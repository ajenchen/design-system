/**
 * DataTable 各欄型的排序比較 —— data-table.spec.md「七、Column Type」:「指定 type 自動獲得對齊 / 渲染 / **排序** / 篩選行為」。
 *
 * **為什麼要自己給(2026-11-05,3f「各欄型沒有 sortingFn」)**:`column-types.ts` 的 `// L3: sortingFn` 從沒實作,所有型別都退回
 * TanStack v8.21.3 的自動判斷 `getAutoSortingFn`(RowSorting.ts#L308-L334):
 *   - 它取 `flatRows.slice(10)` —— **跳過**前 10 列、看第 11 列以後(不是「前 10 列」),所以 ≤ 10 列的表一律落到 `basic`,
 *     > 10 列才看得到字串 → 同一欄的比法隨列數變(字串欄 ≤ 10 列分大小寫、> 10 列不分);
 *   - 值是物件 / 陣列就落到 `basic`(`a === b ? 0 : a > b ? 1 : -1`):兩個不同的人員物件恆回 -1,人員 / 多人欄排出來是亂的。
 * 本檔讓每個有 `meta.type` 的欄都有明確的比法,不再經過自動判斷;consumer 自己寫了 `sortingFn` 的欄照 consumer 的(data-table.tsx 前處理)。
 *
 * **各型照什麼排**(規範句住 data-table.spec.md「七、Column Type」排序表;判定表 `scripts/test-data-table-column-sorting.mjs`):
 *   - string / url / time:TanStack 內建 `alphanumeric`(不分大小寫、數字段照數值比:「第 2 版」< 「第 10 版」、9:30 < 10:00)——
 *     這就是自動判斷「看得到字串」時本來會選的那支,只是不再隨列數變。
 *   - number / currency / boolean:非空值照 `basic`(= 修前自動判斷給的那支);`null` / 空字串先當最小(`compareScalar`,
 *     2026-11-05 審查 D3:修前直接用 `basic`,空值夾在負數與正數之間且隨原始順序變,與下方空值句不符)。
 *   - date:換成時間戳比(Date / ISO 字串 / 毫秒數都認);空值與解析不了的當最小(與文字欄空字串最小一致)。
 *   - person:照**名字**排,比法同文字欄。PersonValue 只有名字可當識別(`string | { name, avatarUrl?, description? }`),
 *     格上顯示的也是名字;一手依據:Airtable「Single user fields can be used as a sort field. In this case, the user's name will be used to sort.」
 *     (https://support.airtable.com/docs/airtable-automation-action-sort-list)、AG Grid v33 物件型欄照**顯示文字**比
 *     (https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/columns/dataTypeService.ts#L499-L512)。
 *   - multiPerson:照格上由左到右的順序逐人比名字,前面都一樣時人少的在前;空陣列最小。**AI 推導**(單人規則的延伸 + AG Grid 照顯示內容比),
 *     推導寫在 spec 該列。
 *   - select / multiSelect:**照什麼排待 user 決定**(選項順序 / 畫面上的字 / 原始值,世界級不一致,見 needs-user sort-focus-1);
 *     決定前同修前 —— select 照原始值(`alphanumeric`,即自動判斷看得到字串時的那支),multiSelect 照原始值逐項接起來的字串(修前 `basic` 對陣列就是這樣比)。
 *
 * 空值:`undefined` 由 TanStack 的 `sortUndefined`(預設 1 = 升冪排最後)先處理,本檔碰不到;`null` / 空字串 / 空陣列在本檔當最小
 * (與修前文字欄 `toString(null) === ''` 排最前一致)。兩者不一致是 TanStack 預設,本輪不改(記在 sort-focus 研究筆記)。
 *
 * 純函式:無 DOM、無時鐘、無隨機;判定表直接 import 本檔。
 */
import { sortingFns, type Row, type RowData, type SortingFn } from '@tanstack/react-table'
import type { ColumnType } from '../column-types'

/** 把一個值包成 TanStack SortingFn 吃的 row(內建比較只呼叫 `getValue`) */
const valueRow = (value: unknown) => ({ getValue: () => value }) as unknown as Row<RowData>

/** TanStack 內建 alphanumeric:`toString` → 轉小寫 → 數字段照數值、其餘照字元比 */
function compareAlphanumeric(a: unknown, b: unknown): number {
  return sortingFns.alphanumeric(valueRow(a), valueRow(b), '')
}

/** TanStack 內建 basic:`a === b ? 0 : a > b ? 1 : -1` */
function compareBasic(a: unknown, b: unknown): number {
  return sortingFns.basic(valueRow(a), valueRow(b), '')
}

/**
 * 數字 / 金額 / 布林:`null` / 空字串先當最小,其餘照 `basic`。
 * 不能直接用 `basic`:它對 `null` 與數字互比恆回 -1(`null > 0`、`0 > null` 都是 false),比較不對稱 ——
 * 空值會夾在負數與正數之間,而且結果隨原始順序變(`[null,0,5]` → 0,null,5;`[0,null,5]` → null,0,5)。
 */
function compareScalar(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? -1 : 1
  return compareBasic(a, b)
}

/** 人員值的排序鍵 = 名字(與 PeoplePicker `resolvePerson` 同一個規則:字串就是名字、物件取 `name`);空值 = '' */
export function personSortKey(value: unknown): string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
    return (value as { name: string }).name
  }
  return ''
}

/** 多人值的排序鍵 = 依格上順序的名字陣列;不是陣列 = 空 */
export function multiPersonSortKey(value: unknown): string[] {
  return Array.isArray(value) ? value.map(personSortKey) : []
}

/** 名字陣列逐項比(比法同文字欄);前面都相同時短的在前 */
function compareNameLists(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const c = compareAlphanumeric(a[i], b[i])
    if (c !== 0) return c
  }
  return a.length - b.length
}

/** 日期值 → 毫秒;空值 / 解析不了 = NaN */
export function dateSortKey(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') return new Date(value).getTime()
  return Number.NaN
}

function compareDates(a: unknown, b: unknown): number {
  const ta = dateSortKey(a)
  const tb = dateSortKey(b)
  const aEmpty = Number.isNaN(ta)
  const bEmpty = Number.isNaN(tb)
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? -1 : 1
  return ta === tb ? 0 : ta > tb ? 1 : -1
}

/** multiSelect 決定前同修前:原始值陣列接成字串(`String(['a','b']) === 'a,b'`)再照 basic 比 */
function compareRawList(a: unknown, b: unknown): number {
  const sa = Array.isArray(a) ? String(a) : ''
  const sb = Array.isArray(b) ? String(b) : ''
  return compareBasic(sa, sb)
}

/** 某欄型兩個儲存格值的比較(升冪方向;降冪由 TanStack 反轉)。回負數 = a 在前。 */
export function compareColumnValues(type: ColumnType, a: unknown, b: unknown): number {
  switch (type) {
    case 'string':
    case 'url':
    case 'time':
    case 'select':
      return compareAlphanumeric(a, b)
    case 'number':
    case 'currency':
    case 'boolean':
      return compareScalar(a, b)
    case 'date':
      return compareDates(a, b)
    case 'person':
      return compareAlphanumeric(personSortKey(a), personSortKey(b))
    case 'multiPerson':
      return compareNameLists(multiPersonSortKey(a), multiPersonSortKey(b))
    case 'multiSelect':
      return compareRawList(a, b)
  }
}

/** 給 data-table.tsx 前處理用:某欄型的 TanStack `sortingFn` */
export function sortingFnForColumnType<TData extends RowData>(type: ColumnType): SortingFn<TData> {
  return (rowA: Row<TData>, rowB: Row<TData>, columnId: string) =>
    compareColumnValues(type, rowA.getValue(columnId), rowB.getValue(columnId))
}
