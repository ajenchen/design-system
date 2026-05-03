/**
 * column-meta — TanStack ColumnDef typed accessor helpers.
 *
 * 為什麼存在:`ColumnDef<T, V>` 是 discriminated union(AccessorKey / AccessorFn /
 * Display / Group),每個 variant 有不同欄位,直接 `col.id` 在型別上不安全。
 * 既有 consumer 用 `(col as any).id` cast,3+ 處 hard-code = M17 違反。
 * 抽成 typed helper 統一型別 narrowing,消除 `any` cast。
 *
 * Why not annotate each `as any`:DRY + single SSOT for column field access。
 * 任一 helper 行為變更(e.g. 加 fallback 邏輯)只需改一處。
 *
 * 對齊 mindset #2 「優先消費既有」+ M17「同 hard-code 在 3+ consumer 必抽」。
 */

import type { ColumnDef, ColumnMeta, RowData } from '@tanstack/react-table'

/**
 * 取 column 的 stable identifier。
 *
 * 解析順序對齊 TanStack 內部行為:
 * 1. `col.id`(顯式設定優先)
 * 2. `col.accessorKey`(string version,fallback for accessor columns)
 *
 * 都無 → return undefined(display column 無 accessorKey 且未設 id)。
 */
export function getColumnId<T extends RowData>(
  col: ColumnDef<T, unknown>,
): string | undefined {
  if ('id' in col && typeof col.id === 'string' && col.id) return col.id
  if (
    'accessorKey' in col &&
    (typeof col.accessorKey === 'string' || typeof col.accessorKey === 'number')
  ) {
    return String(col.accessorKey)
  }
  return undefined
}

/**
 * 取 column 的 header 定義(可為 string / React node / function — TanStack 規約)。
 *
 * 注意:本 helper 不執行 header function。consumer 若需 rendered string,
 * 自行 narrow + call,或用 TanStack `flexRender` API。
 */
export function getColumnHeader<T extends RowData>(
  col: ColumnDef<T, unknown>,
): ColumnDef<T, unknown>['header'] {
  return 'header' in col ? col.header : undefined
}

/**
 * 取 column 的 meta(本 DS 的 ColumnMeta 已 extend 加上 type / align / wrap 等)。
 */
export function getColumnMeta<T extends RowData>(
  col: ColumnDef<T, unknown>,
): ColumnMeta<T, unknown> | undefined {
  return col.meta
}

/**
 * 從 header 定義抽 plain string label(filter / sort UI 顯示用)。
 *
 * 處理 3 種 header 形式:
 * - string → 直接 return
 * - function → 不執行(避過 React render context),fallback id
 * - undefined / 其他 → fallback id
 */
export function getColumnLabel<T extends RowData>(
  col: ColumnDef<T, unknown>,
  fallbackId?: string,
): string {
  const header = getColumnHeader(col)
  if (typeof header === 'string') return header
  return fallbackId ?? getColumnId(col) ?? ''
}
