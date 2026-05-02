import * as React from 'react'
import { X, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/design-system/components/Popover/popover'
import { DateGrid } from '@/design-system/components/DateGrid/date-grid'
import { Button } from '@/design-system/components/Button/button'
import { Separator } from '@/design-system/components/Separator/separator'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  type TimeParts,
  type TimeStep,
} from '@/design-system/components/TimePicker/time-columns'

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

/** 顯示用:date 或 datetime,根據 showTime / showSeconds 切換 */
function formatDateOrDateTime(
  iso: string | null | undefined,
  showTime: boolean,
  showSeconds: boolean,
  options: DateFormatOptions = {},
): string {
  if (!iso) return ''
  const dateText = formatDate(iso, options)
  if (!showTime) return dateText
  const time = isoToTimeParts(iso)
  if (!time) return dateText
  return `${dateText} ${timePartsToString(time, showSeconds)}`
}

// ── ISO <-> Date conversion ─────────────────────────────────────────────────
// date-only:'YYYY-MM-DD'(local-time 語意,不帶時區)
// datetime  :'YYYY-MM-DDTHH:MM:SS'(同 local-time 語意)

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  const time = isoToTimeParts(iso)
  if (time) {
    date.setHours(time.hours, time.minutes, time.seconds)
  }
  return date
}

function dateToIso(date: Date | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function combineDateAndTime(date: Date, time: TimeParts): string {
  const datePart = dateToIso(date)
  const hh = String(time.hours).padStart(2, '0')
  const mi = String(time.minutes).padStart(2, '0')
  const ss = String(time.seconds).padStart(2, '0')
  return `${datePart}T${hh}:${mi}:${ss}`
}

function nowIsoDateTime(): string {
  const d = new Date()
  return combineDateAndTime(d, {
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
  })
}

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用。DataTable 透過 column type 查到這個元件。

export interface DatePickerDisplayProps extends DateFormatOptions {
  value?: string | number | Date | null
  /** 顯示時間部分(配合 showTime DatePicker 的 readonly view) */
  showTime?: boolean
  showSeconds?: boolean
}

function DatePickerDisplay({ value, showTime = false, showSeconds = false, ...formatOptions }: DatePickerDisplayProps) {
  if (value == null) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  if (showTime && typeof value === 'string') {
    return <>{formatDateOrDateTime(value, true, showSeconds, formatOptions)}</>
  }
  return <>{formatDate(value, formatOptions)}</>
}
DatePickerDisplay.displayName = 'DatePickerDisplay'

// ── DatePicker(single)──────────────────────────────────────────────────

export interface DatePickerProps
  extends DateFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'value' | 'onChange' | 'placeholder' | 'defaultValue'
    > {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** ISO date(YYYY-MM-DD)或 ISO datetime(YYYY-MM-DDTHH:MM:SS,當 showTime=true) */
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 允許清空已選值 */
  clearable?: boolean
  /** 啟用時間欄位(時 / 分 [/ 秒]),Ant idiom — value 變 ISO datetime */
  showTime?: boolean
  /** showTime 時是否顯示秒 */
  showSeconds?: boolean
  /** showTime 分鐘步進(會議常用 15) */
  minuteStep?: TimeStep
  /** showTime 秒鐘步進 */
  secondStep?: TimeStep
  /**
   * 是否需 OK 確認才提交,預設 showTime=true 時為 true(對齊 Ant DatePicker showTime)
   * — datetime picker user 習慣編完才 commit,避免 calendar 點到就關。
   */
  needConfirm?: boolean
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
//
// Trigger uses `<div role="combobox" tabIndex={...}>` instead of `<button>` —
// 對齊 Combobox / Select / TimePicker 同 pattern,避免 ItemInlineAction(內部 button)
// 構成 nested-interactive(axe serious)。Radix Popover asChild 仍處理 Enter/Space 鍵盤觸發。
const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size = 'md',
      value,
      onChange,
      placeholder,
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      showTime = false,
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      needConfirm: needConfirmProp,
      id: idProp,
      'aria-label': ariaLabelProp,
      'aria-labelledby': ariaLabelledByProp,
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
    const needConfirm = needConfirmProp ?? showTime  // datetime 預設需確認
    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState<string | null>(value ?? null)
    const resolvedPlaceholder = placeholder ?? (showTime ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD')
    // a11y:role="combobox" 必須有 accessible name(aria-label / labelledby / fieldCtx label)
    const accessibleName = ariaLabelProp ?? (ariaLabelledByProp ? undefined : (fieldCtx?.id ? undefined : resolvedPlaceholder))

    // Sync draft on value / open change
    React.useEffect(() => { setDraft(value ?? null) }, [value, open])

    const selected = React.useMemo(() => isoToDate(value), [value])
    const draftDate = React.useMemo(() => isoToDate(draft), [draft])
    const draftTime = isoToTimeParts(draft) ?? { hours: 0, minutes: 0, seconds: 0 }

    const displayCommitted = formatDateOrDateTime(value, showTime, showSeconds, { formatOptions, locale })

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
              ? displayCommitted
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      )
    }

    const triggerText = value
      ? displayCommitted
      : <span className="text-fg-muted">{resolvedPlaceholder}</span>

    const commitDraft = (next: string | null) => {
      if (needConfirm) setDraft(next)
      else onChange?.(next ?? '')
    }
    const handleConfirm = () => { onChange?.(draft ?? ''); setOpen(false) }
    const handleNow = () => {
      const now = showTime ? nowIsoDateTime() : dateToIso(new Date())
      commitDraft(now)
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={accessibleName}
            aria-labelledby={ariaLabelledByProp ?? fieldCtx?.labelId}
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
              {triggerText}
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
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-row" role="dialog">
            <DateGrid
              mode="single"
              selected={needConfirm ? draftDate : selected}
              onSelect={(date) => {
                if (!date) return
                if (showTime) {
                  commitDraft(combineDateAndTime(date, draftTime))
                } else {
                  commitDraft(dateToIso(date))
                  if (!needConfirm) setOpen(false)
                }
              }}
              defaultMonth={(needConfirm ? draftDate : selected) ?? undefined}
              autoFocus
            />
            {showTime && (
              <TimeColumns
                leadingDivider
                value={draftTime}
                onChange={(time) => {
                  const target = draftDate ?? new Date()
                  commitDraft(combineDateAndTime(target, time))
                }}
                showSeconds={showSeconds}
                minuteStep={minuteStep}
                secondStep={secondStep}
              />
            )}
          </div>
          {showTime && (
            <>
              <Separator />
              <div className="flex items-center justify-between p-2">
                <Button variant="tertiary" size="sm" onClick={handleNow}>此刻</Button>
                {needConfirm ? (
                  <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!draft}>確定</Button>
                ) : (
                  <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    )
  }
)
DatePicker.displayName = 'DatePicker'

// ── DatePickerRange ─────────────────────────────────────────────────────────
//
// Active-end mechanism(canonical 2026-05-02,對齊 Ant Design RangePicker):
//   - Trigger 是兩個獨立 <button> 輸入(start + end),點擊 input 設定 activeEnd。
//   - 任一 input 點擊 → 開 popover,activeEnd 跟著切換(同一浮層內維持狀態)。
//   - DateGrid range mode 的 onSelect 只更新 activeEnd 對應端點。
//   - Auto-advance:選 start 完成 → 自動切 activeEnd='end'(配合 user 預期流向);
//     end 也填好且 needConfirm=false → close popover。
//   - showTime=true 時 TimeColumns 套 active end 的 time(Ant idiom);footer 顯示確定按鈕。
//
// 跟 footer toggle / radio button 切換的對照(都不採):
//   - footer toggle 違反 Ant / Material / Carbon 既有慣例,user 還要分心找按鈕
//   - input-click 視覺上 active end input 高亮(ring-primary),認知最自然

export interface DatePickerRangeProps
  extends DateFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'value' | 'onChange' | 'placeholder' | 'defaultValue'
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
  /** 啟用時間欄位 — value 兩端皆變 ISO datetime */
  showTime?: boolean
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  needConfirm?: boolean
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DatePickerRange = React.forwardRef<HTMLDivElement, DatePickerRangeProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size = 'md',
      value,
      onChange,
      placeholder,
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      showTime = false,
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      needConfirm: needConfirmProp,
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
    const needConfirm = needConfirmProp ?? showTime
    const resolvedPlaceholder: [string, string] = placeholder ?? (
      showTime ? ['Start date time', 'End date time'] : ['Start date', 'End date']
    )

    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState<[string | null, string | null]>(value ?? [null, null])
    const [activeEnd, setActiveEnd] = React.useState<'start' | 'end'>('start')

    React.useEffect(() => {
      setDraft(value ?? [null, null])
    }, [value, open])

    const startIso = (needConfirm ? draft[0] : value?.[0]) ?? null
    const endIso = (needConfirm ? draft[1] : value?.[1]) ?? null
    const startDate = React.useMemo(() => isoToDate(startIso), [startIso])
    const endDate = React.useMemo(() => isoToDate(endIso), [endIso])
    const hasValue = !!(value?.[0] || value?.[1])
    const showClear = clearable && hasValue && isEditable

    const startText = startIso
      ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale })
      : resolvedPlaceholder[0]
    const endText = endIso
      ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale })
      : resolvedPlaceholder[1]

    const activeIso = activeEnd === 'start' ? startIso : endIso
    const activeTime = isoToTimeParts(activeIso) ?? { hours: 0, minutes: 0, seconds: 0 }

    const commitRange = (next: [string | null, string | null]) => {
      if (needConfirm) setDraft(next)
      else { onChange?.(next); setDraft(next) }
    }
    const setActive = (iso: string | null) => {
      const nextDraft = activeEnd === 'start'
        ? ([iso, draft[1]] as [string | null, string | null])
        : ([draft[0], iso] as [string | null, string | null])
      commitRange(nextDraft)
    }
    const handleConfirm = () => { onChange?.(draft); setOpen(false) }
    const handleNow = () => {
      setActive(showTime ? nowIsoDateTime() : dateToIso(new Date()))
    }
    const handleClearRange = (e?: React.MouseEvent) => {
      e?.stopPropagation()
      onChange?.([null, null])
    }
    const openWithActive = (which: 'start' | 'end') => {
      setActiveEnd(which)
      setOpen(true)
    }

    // readonly / disabled view — plain wrapper,no popover
    if (!isEditable) {
      return (
        <div
          ref={ref}
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
          {...props}
        >
          <span className={cn('flex-1 min-w-0 truncate', !startIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {startIso ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[0]}
          </span>
          <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
          <span className={cn('flex-1 min-w-0 truncate', !endIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {endIso ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[1]}
          </span>
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      )
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            data-state={open ? 'open' : 'closed'}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', size }),
              'cursor-text',
              error && [
                'border-error hover:border-error-hover',
                'focus-within:border-error focus-within:hover:border-error',
              ],
              className,
            )}
            {...props}
          >
            <button
              type="button"
              onClick={() => openWithActive('start')}
              data-active-end={open && activeEnd === 'start' ? 'true' : undefined}
              aria-label={resolvedPlaceholder[0]}
              aria-haspopup="dialog"
              aria-expanded={open && activeEnd === 'start'}
              className={cn(
                bareInputStyles,
                'truncate text-left cursor-pointer focus-visible:outline-none',
                'data-[active-end=true]:underline decoration-primary underline-offset-4 decoration-2',
                !startIso && 'text-fg-muted',
              )}
            >
              {startText}
            </button>
            <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
            <button
              type="button"
              onClick={() => openWithActive('end')}
              data-active-end={open && activeEnd === 'end' ? 'true' : undefined}
              aria-label={resolvedPlaceholder[1]}
              aria-haspopup="dialog"
              aria-expanded={open && activeEnd === 'end'}
              className={cn(
                bareInputStyles,
                'truncate text-left cursor-pointer focus-visible:outline-none',
                'data-[active-end=true]:underline decoration-primary underline-offset-4 decoration-2',
                !endIso && 'text-fg-muted',
              )}
            >
              {endText}
            </button>
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除日期區間', // i18n-allow: DS default inline-action label
                  onClick: handleClearRange,
                }}
              />
            )}
            <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-row" role="dialog" aria-label="日期區間選擇">
            <DateGrid
              mode="range"
              numberOfMonths={2}
              selected={
                startDate || endDate
                  ? { from: startDate, to: endDate }
                  : undefined
              }
              onSelect={(range) => {
                if (!range) return
                // 取出 activeEnd 對應端點的 target date(react-day-picker 會自動推 from/to,
                // 我們只看自己關心的那個欄位):
                //   activeEnd='start' → 用 range.from
                //   activeEnd='end'   → 用 range.to(若 from < to 還沒成立則 fallback range.from)
                const targetDate = activeEnd === 'start' ? range.from : (range.to ?? range.from)
                if (!targetDate) return
                const preservedTime = isoToTimeParts(activeEnd === 'start' ? draft[0] : draft[1]) ?? activeTime
                const nextIso = showTime
                  ? combineDateAndTime(targetDate, preservedTime)
                  : dateToIso(targetDate)
                const nextDraft: [string | null, string | null] = activeEnd === 'start'
                  ? [nextIso, draft[1]]
                  : [draft[0], nextIso]
                commitRange(nextDraft)
                // Auto-advance:選 start → 切到 end 等待選 end(Ant idiom)
                if (activeEnd === 'start') {
                  setActiveEnd('end')
                } else if (!showTime && !needConfirm && nextDraft[0] && nextDraft[1]) {
                  // date-only 兩端皆填 + 不需確認 → 自動關閉
                  setOpen(false)
                }
              }}
              defaultMonth={startDate ?? endDate ?? undefined}
              autoFocus
            />
            {showTime && (
              <TimeColumns
                leadingDivider
                value={activeTime}
                onChange={(time) => {
                  const target = (activeEnd === 'start' ? startDate : endDate) ?? new Date()
                  setActive(combineDateAndTime(target, time))
                }}
                showSeconds={showSeconds}
                minuteStep={minuteStep}
                secondStep={secondStep}
              />
            )}
          </div>
          {(showTime || needConfirm) && (
            <>
              <Separator />
              <div className="flex items-center justify-end p-2 gap-2">
                <Button variant="tertiary" size="sm" onClick={handleNow}>此刻</Button>
                {needConfirm ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConfirm}
                    disabled={!draft[0] || !draft[1]}
                  >
                    確定
                  </Button>
                ) : (
                  <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    )
  },
)
DatePickerRange.displayName = 'DatePickerRange'

// Attach Range as namespace:consumer 用 <DatePicker.Range ...>(Ant-style)
// 走 Object.assign 確保 TS 型別帶上 Range 屬性,而非只做 runtime 附掛
const DatePickerWithRange = Object.assign(DatePicker, { Range: DatePickerRange })

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const datePickerMeta = {
  component: 'DatePicker',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export {
  DatePickerWithRange as DatePicker,
  DatePickerDisplay,
  DatePickerRange,
  formatDate,
}
