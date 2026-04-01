import { EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'

// ── Format ──────────────────────────────────────────────────────────────────

export interface DateFormatOptions {
  /** Intl.DateTimeFormat options（預設 { year: 'numeric', month: '2-digit', day: '2-digit' }） */
  formatOptions?: Intl.DateTimeFormatOptions
  /** locale（預設 'en-US'） */
  locale?: string
}

function formatDate(
  value: string | number | Date,
  options: DateFormatOptions = {},
): string {
  const {
    formatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' },
    locale = 'en-US',
  } = options
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale, formatOptions).format(date)
}

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用。DataTable 透過 column type 查到這個元件。

export interface DateFieldDisplayProps extends DateFormatOptions {
  value?: string | number | Date | null
}

function DateFieldDisplay({ value, ...formatOptions }: DateFieldDisplayProps) {
  if (value == null) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{formatDate(value, formatOptions)}</>
}
DateFieldDisplay.displayName = 'DateFieldDisplay'

export { DateFieldDisplay, formatDate }
