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
    /**
     * Column data type — determines default alignment, rendering, sorting, filtering.
     *
     * **Filterable column 必須設此 prop**(filter UI 只列有 `type` 的 column,
     * 對齊 Notion / Airtable / Linear:每 property 強制有 type)。
     */
    type?: ColumnType
    /** Override default alignment from column type */
    align?: 'left' | 'right' | 'center'
    /** Allow text wrapping (only effective when autoRowHeight is true) */
    wrap?: boolean
    /**
     * Explicit opt-out from filter UI(預設 accessor column 有 type 即 filterable)。
     *
     * 用於:有 `type` 但不想在 filter UI 出現的 accessor column
     * (例如:internal sorting key、composite display 用的 hidden column)。
     */
    filterable?: boolean
    /** Number/currency formatting options */
    prefix?: string
    suffix?: string
    precision?: number
    locale?: string
    /** Select/multiSelect options — maps value to display label */
    options?: Array<{ value: string; label: string }>
    /** Date: Intl.DateTimeFormat options */
    formatOptions?: Intl.DateTimeFormatOptions
    /**
     * Date: 是否含時間部分(datetime mode)。對齊 Notion idiom — 不另設 datetime column type。
     *
     * - `false`(default):cell 顯示與 filter 比對僅日期(day-level 精度)
     * - `true`:cell 渲 date+time;filter 比對走 ms 精度(避開 Airtable 著名地雷)
     *
     * 在 advanced filter 中,`date` columnType 配 `includeTime=true` 時,
     * `date_*` ValueShape 自動 promote 到 `datetime_*`,渲 `<DatePicker showTime>` /
     * `<DatePickerRange showTime>`(詳 `filter-operators.ts` `getValueShape`)。
     */
    includeTime?: boolean
    /** Link: 自訂顯示文字（不設則自動從 URL 提取 hostname） */
    linkLabel?: string
  }
}
