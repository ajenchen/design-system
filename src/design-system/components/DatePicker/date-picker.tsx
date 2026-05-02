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

/**
 * Default format:**YYYY/MM/DD**(對齊 Ant Design 順序,year-first ISO-like)。
 * 棄 `en-US` `MM/DD/YYYY`(month-first 美式)— 美式順序在 international DS 反直覺
 * (跟 ISO date 視覺對不上,跟 sort 順序也對不上)。Ant / Material X / Apple HIG
 * 一致 year-first。Consumer 想自訂可傳 `formatOptions` + `locale`。
 */
function formatDate(
  value: string | number | Date,
  options: DateFormatOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  // 若 consumer 顯式傳 formatOptions / locale → 走 Intl.DateTimeFormat
  if (options.formatOptions || options.locale) {
    return new Intl.DateTimeFormat(options.locale ?? 'en-US', options.formatOptions ?? { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }
  // 預設:YYYY/MM/DD(直接組,locale-independent + 視覺穩定)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
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

function addDays(date: Date, n: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

// ── TimePickerSidePanel ────────────────────────────────────────────────
//
// DatePicker showTime / Range showTime 內共用的右側時間 panel。
// 結構對齊 reference image + Ant Design:
//   - p-3 padding(對齊左側 DateGrid 的 p-3)
//   - Header(h-field-xs 24px + mb-3 12px)裝 "Time" title 水平+垂直置中
//     → 12px (top pad) + 24px (header) + 12px (mb-3) = 跟 DateGrid 的 caption row
//        水平對齊(DateGrid 的 caption row 也是同樣結構)
//   - 下方裝 TimeColumns,flex-1 撐滿剩餘高度

interface TimePickerSidePanelProps {
  value?: TimeParts
  onChange: (next: TimeParts) => void
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
}

/**
 * 用 absolute positioning(`absolute top-0 right-0 bottom-0`)讓 TimePicker
 * **不影響 popover row 高度** — DateGrid 主導 height,TimePicker 撐滿那個高度。
 * 否則 TimeColumns 自然高 ~800px > DateGrid ~300px → flex row 跟著撐高,
 * 造成 user 看到的 layout bug。Sibling 的 spacer div 佔 layout 寬度。
 */
function TimePickerSidePanel({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  className,
}: TimePickerSidePanelProps & { className?: string }) {
  return (
    <div className={cn('flex flex-col p-3 h-full', className)}>
      {/* Header: 對齊 DateGrid 的 month_caption(h-field-xs + mb-3),title 水平+垂直置中 */}
      <div className="h-field-xs flex items-center justify-center mb-3">
        <span className="text-body font-medium">Time</span>
      </div>
      {/* TimeColumns flex-1 撐滿剩餘高度;內部 ScrollArea h-full(parent absolute 給定高度) */}
      <div className="flex-1 min-h-0 flex">
        <TimeColumns
          value={value}
          onChange={onChange}
          showSeconds={showSeconds}
          minuteStep={minuteStep}
          secondStep={secondStep}
        />
      </div>
    </div>
  )
}

/**
 * showTime panel container — 包 DateGrid + TimePicker side panel,DateGrid 主導 row 高度,
 * TimePicker absolute 撐滿同高,不影響 layout。Spacer div 留 layout 寬度給 absolute panel。
 */
const TIME_PANEL_WIDTH = (showSeconds: boolean) => showSeconds ? 'w-60' : 'w-40'

interface CalendarTimeContainerProps {
  showTime: boolean
  showSeconds: boolean
  calendar: React.ReactNode
  timePanel?: React.ReactNode
}

function CalendarTimeContainer({ showTime, showSeconds, calendar, timePanel }: CalendarTimeContainerProps) {
  if (!showTime) return <>{calendar}</>
  return (
    <div className="relative">
      <div className="flex flex-row">
        {calendar}
        {/* Spacer 佔 layout 寬度給 absolute TimePicker;border-l 在這層,不在 absolute 層
            (避免 stacking + border 雙繪) */}
        <div className={cn('shrink-0 border-l border-divider', TIME_PANEL_WIDTH(showSeconds))} />
      </div>
      {/* TimePicker absolute 撐滿 DateGrid 高度(top-0 bottom-0),right-0 對齊 spacer */}
      <div className={cn('absolute top-0 right-0 bottom-0', TIME_PANEL_WIDTH(showSeconds))}>
        {timePanel}
      </div>
    </div>
  )
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
    const needConfirm = needConfirmProp ?? showTime  // datetime 預設需確認
    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState<string | null>(value ?? null)
    const resolvedPlaceholder = placeholder ?? (showTime ? 'YYYY/MM/DD HH:MM' : 'YYYY/MM/DD')
    // a11y:role="combobox" 必須有 accessible name(aria-label / labelledby / fieldCtx label)
    const accessibleName = ariaLabelProp ?? (ariaLabelledByProp ? undefined : (fieldCtx?.id ? undefined : resolvedPlaceholder))

    // Sync draft from value ONLY on open false→true(避免 popover 開啟期間 value 改變
    // clobber user 的編輯。Popover 關閉後下次再開時自動同步最新 value。)
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!lastOpenRef.current && open) setDraft(value ?? null)
      lastOpenRef.current = open
    }, [open, value])

    // Display value canonical(2026-05-02 fix):
    //   needConfirm=true(showTime 預設)→ trigger 讀 draft,user 點 calendar 看到 input 即時更新
    //   needConfirm=false → trigger 讀 value(committed,符合非確認流程)
    const displayValue = needConfirm ? draft : (value ?? null)
    const displayDate = React.useMemo(() => isoToDate(displayValue), [displayValue])
    const draftDate = React.useMemo(() => isoToDate(draft), [draft])
    const draftTime = isoToTimeParts(draft) ?? { hours: 0, minutes: 0, seconds: 0 }
    const showClear = clearable && (needConfirm ? draft : value) && isEditable

    const displayCommitted = formatDateOrDateTime(value, showTime, showSeconds, { formatOptions, locale })
    const displayLive = formatDateOrDateTime(displayValue, showTime, showSeconds, { formatOptions, locale })

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

    const triggerText = displayValue
      ? displayLive
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
            <span className={cn(bareInputStyles, 'truncate', !displayValue && 'text-fg-muted')}>
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
          <div role="dialog">
            <CalendarTimeContainer
              showTime={showTime}
              showSeconds={showSeconds}
              calendar={
                <DateGrid
                  mode="single"
                  selected={displayDate}
                  onSelect={(date) => {
                    if (!date) return
                    if (showTime) {
                      commitDraft(combineDateAndTime(date, draftTime))
                    } else {
                      commitDraft(dateToIso(date))
                      if (!needConfirm) setOpen(false)
                    }
                  }}
                  defaultMonth={displayDate ?? undefined}
                  autoFocus
                />
              }
              timePanel={
                <TimePickerSidePanel
                  value={draftTime}
                  onChange={(time) => {
                    const target = draftDate ?? new Date()
                    commitDraft(combineDateAndTime(target, time))
                  }}
                  showSeconds={showSeconds}
                  minuteStep={minuteStep}
                  secondStep={secondStep}
                />
              }
            />
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
          </div>
        </PopoverContent>
      </Popover>
    )
  }
)
DatePicker.displayName = 'DatePicker'

// ── DatePickerRange ─────────────────────────────────────────────────────────
//
// Active-end mechanism(canonical 2026-05-02 v3,對齊 Ant Design RangePicker):
//   - Trigger 是兩個獨立 <button> 輸入(start + end),點擊 input 設定 activeEnd。
//   - 任一 input 點擊 → 開 popover,activeEnd 跟著切換(同一浮層內維持狀態)。
//   - DateGrid 用 `mode="single"` + manual `modifiers`(rangeStart / rangeMiddle /
//     rangeEnd)— 不用 RDP 內建 `mode="range"` 因為它的 click 配對邏輯會跟我們的
//     activeEnd 衝突(造成「點一次沒反應 / 要點兩次」bug,canonical 2026-05-02 v3 修)。
//   - Auto-advance(date-only Range):選 start 完成 → 自動切 activeEnd='end'。
//   - showTime Range:numberOfMonths=1(只渲 active end 的月份)+ TimePickerSidePanel
//     編 active end 的時間;footer「確定」commit。對齊 Ant 「showTime range 一次 edit
//     一端」共識,**不**像 date-only Range 顯示 2 個月。

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

    // Sync draft from value ONLY on open false→true(canonical 2026-05-02 v3):
    // 之前用 `[value, open]` 雙 dep,popover 開啟期間 value 任何 reference 變更 → useEffect
    // 觸發 → 直接 clobber user 的 draft 編輯。改成只在 open 從 false→true 同步。
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!lastOpenRef.current && open) setDraft(value ?? [null, null])
      lastOpenRef.current = open
    }, [open, value])

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
    const activeDate = activeEnd === 'start' ? startDate : endDate
    const activeTime = isoToTimeParts(activeIso) ?? { hours: 0, minutes: 0, seconds: 0 }

    // Range visual modifiers(自管,不靠 RDP mode='range'):
    //   rangeStart:start 那天 → 圓底白字
    //   rangeEnd:end 那天 → 圓底白字
    //   rangeMiddle:start+1 ~ end-1 之間的所有天 → 灰底矩形 track
    const rangeModifiers = React.useMemo(() => {
      const mods: Record<string, Date | { from: Date; to: Date } | undefined> = {}
      if (startDate) mods.rangeStart = startDate
      if (endDate) mods.rangeEnd = endDate
      if (startDate && endDate) {
        const middleStart = addDays(startDate, 1)
        const middleEnd = addDays(endDate, -1)
        if (middleEnd >= middleStart) {
          mods.rangeMiddle = { from: middleStart, to: middleEnd }
        }
      }
      return mods
    }, [startDate, endDate])

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
          <div role="dialog" aria-label="日期區間選擇">
            <CalendarTimeContainer
              showTime={showTime}
              showSeconds={showSeconds}
              calendar={
                <DateGrid
                  // mode='single' + manual modifiers(canonical 2026-05-02 v3):
                  // 不用 RDP 內建 mode='range'(它的 click 配對邏輯跟我們的 activeEnd 衝突,
                  // 造成「點一次沒反應 / 要點兩次」bug)。改自管 modifiers 控視覺。
                  mode="single"
                  selected={activeDate}
                  onSelect={(date) => {
                    if (!date) return
                    const preservedTime = isoToTimeParts(activeEnd === 'start' ? draft[0] : draft[1]) ?? activeTime
                    const nextIso = showTime
                      ? combineDateAndTime(date, preservedTime)
                      : dateToIso(date)
                    const nextDraft: [string | null, string | null] = activeEnd === 'start'
                      ? [nextIso, draft[1]]
                      : [draft[0], nextIso]
                    commitRange(nextDraft)
                    // Auto-advance(date-only Range only):選 start → 切到 end。
                    // showTime Range 不 auto-advance(讓 user 編 time 後再手動切換或按確定)。
                    if (!showTime && activeEnd === 'start') {
                      setActiveEnd('end')
                      if (!needConfirm && nextDraft[0] && nextDraft[1]) {
                        setOpen(false)
                      }
                    } else if (!showTime && !needConfirm && nextDraft[0] && nextDraft[1]) {
                      setOpen(false)
                    }
                  }}
                  modifiers={rangeModifiers}
                  modifiersClassNames={{
                    rangeStart: '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                    rangeEnd: '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                    rangeMiddle: cn(
                      "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
                      'before:bg-[var(--color-neutral-3)] before:pointer-events-none',
                      '[&>button]:!bg-transparent [&>button]:!text-foreground',
                    ),
                  }}
                  numberOfMonths={showTime ? 1 : 2}
                  defaultMonth={activeDate ?? startDate ?? endDate ?? undefined}
                  autoFocus
                />
              }
              timePanel={
                <TimePickerSidePanel
                  value={activeTime}
                  onChange={(time) => {
                    const target = activeDate ?? new Date()
                    setActive(combineDateAndTime(target, time))
                  }}
                  showSeconds={showSeconds}
                  minuteStep={minuteStep}
                  secondStep={secondStep}
                />
              }
            />
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
