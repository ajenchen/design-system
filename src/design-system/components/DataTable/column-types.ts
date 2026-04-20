import type { RowData } from '@tanstack/react-table'

// ── Column Types ─────────────────────────────────────────────────────────────

// ── Column Types ─────────────────────────────────────────────────────────────
//
// 命名原則:描述**資料型別**本身,不是視覺變體。命名要避開撞 Button `variant` 值。
// `string` / `url` 是世界級 DS(Atlassian / Notion / Ant Table)的資料型別用語,
// 跟 Button 的視覺變體 `text` / `link` 在 consumer 心智不會混淆。
export const columnTypes = [
  'string',      // 前身為 'text',因撞 Button variant="text"(文字樣式按鈕)改名
  'number',
  'currency',
  'date',
  'select',
  'multiSelect',
  'person',
  'multiPerson',
  'boolean',
  'url',         // 前身為 'link',因撞 Button variant="link"(連結樣式按鈕)改名
] as const

export type ColumnType = (typeof columnTypes)[number]

// ── Column Type Config ───────────────────────────────────────────────────────

export interface ColumnTypeConfig {
  /** Default horizontal alignment */
  align: 'left' | 'right' | 'center'
  // L3: sortingFn
  // L4: filterVariant, filterFn
  // L5: cellRenderer, cellEditor
}

/** Default config per column type */
export const columnTypeDefaults: Record<ColumnType, ColumnTypeConfig> = {
  string:      { align: 'left' },
  number:      { align: 'right' },
  currency:    { align: 'right' },
  date:        { align: 'left' },
  select:      { align: 'left' },
  multiSelect: { align: 'left' },
  person:      { align: 'left' },
  multiPerson: { align: 'left' },
  boolean:     { align: 'left' },
  url:         { align: 'left' },
}

// ── Extend TanStack Table ColumnMeta ─────────────────────────────────────────

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Column data type — determines default alignment, rendering, sorting, filtering */
    type?: ColumnType
    /** Override default alignment from column type */
    align?: 'left' | 'right' | 'center'
    /** Allow text wrapping (only effective when autoRowHeight is true) */
    wrap?: boolean
    /** Number/currency formatting options */
    prefix?: string
    suffix?: string
    precision?: number
    locale?: string
    /** Select/multiSelect options — maps value to display label */
    options?: Array<{ value: string; label: string }>
    /** Date: Intl.DateTimeFormat options */
    formatOptions?: Intl.DateTimeFormatOptions
    /** Link: 自訂顯示文字（不設則自動從 URL 提取 hostname） */
    linkLabel?: string
  }
}
