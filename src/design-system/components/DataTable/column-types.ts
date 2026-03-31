import type { RowData } from '@tanstack/react-table'

// ── Column Types ─────────────────────────────────────────────────────────────

export const columnTypes = [
  'text',
  'number',
  'currency',
  'date',
  'select',
  'multiSelect',
  'person',
  'boolean',
  'link',
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
  text:        { align: 'left' },
  number:      { align: 'right' },
  currency:    { align: 'right' },
  date:        { align: 'left' },
  select:      { align: 'left' },
  multiSelect: { align: 'left' },
  person:      { align: 'left' },
  boolean:     { align: 'left' },
  link:        { align: 'left' },
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
  }
}
