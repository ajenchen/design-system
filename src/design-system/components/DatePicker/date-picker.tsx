import * as React from 'react'
import { X, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { DateGrid } from '@/design-system/components/DateGrid/date-grid'
import { useFieldContext } from '@/design-system/components/Field/field-context'

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

// ── ISO <-> Date conversion ─────────────────────────────────────────────────
// Value 用 ISO date string (YYYY-MM-DD),local-time 語意(不帶時區)

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function dateToIso(date: Date | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用。DataTable 透過 column type 查到這個元件。

export interface DatePickerDisplayProps extends DateFormatOptions {
  value?: string | number | Date | null
}

function DatePickerDisplay({ value, ...formatOptions }: DatePickerDisplayProps) {
  if (value == null) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{formatDate(value, formatOptions)}</>
}
DatePickerDisplay.displayName = 'DatePickerDisplay'

// ── Component ───────────────────────────────────────────────────────────────

export interface DatePickerProps
  extends DateFormatOptions,
    Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      'value' | 'onChange' | 'placeholder' | 'disabled'
    > {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** ISO date string（YYYY-MM-DD） */
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 允許清空已選值 */
  clearable?: boolean
}

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size = 'md',
      value,
      onChange,
      placeholder = 'YYYY-MM-DD',
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const showClear = clearable && value && isEditable
    const [open, setOpen] = React.useState(false)
    const selected = React.useMemo(() => isoToDate(value), [value])

    // readonly / disabled
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          <span className={cn('flex-1 min-w-0', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {value
              ? formatDate(value, { formatOptions, locale })
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      )
    }

    const displayText = value
      ? formatDate(value, { formatOptions, locale })
      : <span className="text-fg-muted">{placeholder}</span>

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            type="button"
            disabled={disabled}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', size }),
              'text-left cursor-pointer',
              'focus-visible:outline-none',
              error && [
                'border-error hover:border-error-hover',
                'focus-within:border-error focus-within:hover:border-error',
              ],
              className,
            )}
            {...props}
          >
            <span className={cn(bareInputStyles, 'truncate', !value && 'text-fg-muted')}>
              {displayText}
            </span>
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除日期', // i18n-allow: DS default inline-action label
                  onClick: (e) => {
                    e?.stopPropagation()
                    onChange?.('')
                  },
                }}
              />
            )}
            <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DateGrid
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange?.(dateToIso(date))
              if (date) setOpen(false)
            }}
            defaultMonth={selected}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  }
)
DatePicker.displayName = 'DatePicker'

// ── DatePickerRange ─────────────────────────────────────────────────────────
// Ant-style range picker:single wrapper containing [start input] → [end input] [📅]
// Click anywhere → opens Popover with Calendar mode="range" showing two months side-by-side.

export interface DatePickerRangeProps
  extends DateFormatOptions,
    Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
      'value' | 'onChange' | 'placeholder' | 'disabled'
    > {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** 區間值:[start ISO, end ISO]。任一 null 代表尚未選。 */
  value?: [string | null, string | null] | null
  onChange?: (value: [string | null, string | null]) => void
  /** Placeholder:[start placeholder, end placeholder] */
  placeholder?: [string, string]
  className?: string
  disabled?: boolean
  clearable?: boolean
}

const DatePickerRange = React.forwardRef<HTMLButtonElement, DatePickerRangeProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size = 'md',
      value,
      onChange,
      placeholder = ['Start date', 'End date'],
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref,
  ) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const [open, setOpen] = React.useState(false)

    const startIso = value?.[0] ?? null
    const endIso = value?.[1] ?? null
    const startDate = React.useMemo(() => isoToDate(startIso), [startIso])
    const endDate = React.useMemo(() => isoToDate(endIso), [endIso])
    const hasValue = !!(startIso || endIso)
    const showClear = clearable && hasValue && isEditable

    const startText = startIso
      ? formatDate(startIso, { formatOptions, locale })
      : placeholder[0]
    const endText = endIso
      ? formatDate(endIso, { formatOptions, locale })
      : placeholder[1]

    // readonly / disabled view — plain wrapper,no popover
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          <span className={cn('flex-1 min-w-0 truncate', !startIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {startIso ? formatDate(startIso, { formatOptions, locale }) : placeholder[0]}
          </span>
          <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
          <span className={cn('flex-1 min-w-0 truncate', !endIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {endIso ? formatDate(endIso, { formatOptions, locale }) : placeholder[1]}
          </span>
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      )
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            type="button"
            disabled={disabled}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', size }),
              'text-left cursor-pointer',
              'focus-visible:outline-none',
              error && [
                'border-error hover:border-error-hover',
                'focus-within:border-error focus-within:hover:border-error',
              ],
              className,
            )}
            {...props}
          >
            <span className={cn(bareInputStyles, 'truncate', !startIso && 'text-fg-muted')}>
              {startText}
            </span>
            <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
            <span className={cn(bareInputStyles, 'truncate', !endIso && 'text-fg-muted')}>
              {endText}
            </span>
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除日期區間', // i18n-allow: DS default inline-action label
                  onClick: (e) => {
                    e?.stopPropagation()
                    onChange?.([null, null])
                  },
                }}
              />
            )}
            <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DateGrid
            mode="range"
            numberOfMonths={2}
            selected={
              startDate || endDate
                ? { from: startDate, to: endDate }
                : undefined
            }
            onSelect={(range) => {
              const next: [string | null, string | null] = [
                range?.from ? dateToIso(range.from) : null,
                range?.to ? dateToIso(range.to) : null,
              ]
              onChange?.(next)
              // 只在兩個端點都選好時才關閉
              if (range?.from && range?.to) setOpen(false)
            }}
            defaultMonth={startDate}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  },
)
DatePickerRange.displayName = 'DatePickerRange'

// Attach Range as namespace:consumer 用 <DatePicker.Range ...>(Ant-style)
// 走 Object.assign 確保 TS 型別帶上 Range 屬性,而非只做 runtime 附掛
const DatePickerWithRange = Object.assign(DatePicker, { Range: DatePickerRange })

export {
  DatePickerWithRange as DatePicker,
  DatePickerDisplay,
  DatePickerRange,
  formatDate,
}
