// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { X, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/design-system/components/Popover/popover'
import { DateGrid } from '@/design-system/components/DateGrid/date-grid'
import { Button } from '@/design-system/components/Button/button'
import { SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
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
// DatePicker showTime / Range showTime 共用的右側時間 panel(canonical 2026-05-03 v8)。
//
// ── Caption row alignment canonical(永遠跟 calendar 年月對齊)──
// 結構必須符合 DateGrid month_caption 同樣的 pt-3 + h-field-xs + mb-3 規格,讓 title
// 跟 calendar 「April 2026」字 baseline 在同一 Y 座標(垂直對齊)。
// Y 座標推導:
//   - panel root pt-3 = 12px top 對齊 DateGrid p-3 top
//   - h-field-xs = 24px header,title 純 flex items-center justify-center → 真正水平+垂直置中
//   - mb-3 = 12px gap 對齊 DateGrid month_caption mb-3
//   → title text center Y = 12 + 12 = 24px(from CalendarTimeContainer top)
//   → calendar caption text center Y = 12(p-3 top)+ 12(caption row half)= 24px ✓ 同一 Y
// ⚠️ 若改 DateGrid p-3(例如 p-2)→ 必同步改 TimePicker pt-3,否則 caption 行錯位。
// 兩處共識在 spec.md「Spacing canonical」段 + 本 comment 雙鎖。
//
// ── Header divider canonical(無 border-b)──
// Header 下方無 divider,對齊 DateGrid month_caption(無 border-b,只 mb-3 gap)。
// DS internal canonical(M23)優先於 Ant time-picker header divider 慣例 — 兩 panel
// 同層級 caption 視覺對稱,引入 divider 會破對稱。
//
// ── Bottom padding canonical(0)──
// Root 用 pt-3 而非 py-3:bottom = 0,讓 columns 連續延伸到 SurfaceFooter border-t。
// Ant / Material time picker idiom — time list 視覺感「continuous scroll」延伸到 footer
// divider,bottom padding 12px 反而讓 list 看起來「截斷」。
// 此處與 DateGrid p-3(bottom 12)有意 asymmetric:Calendar cells 不該撞 footer divider
// (cells 是離散 grid),time list 是 scroll list 撞 divider 反而合理。

interface TimePickerSidePanelProps {
  value?: TimeParts
  onChange: (next: TimeParts) => void
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
}

function TimePickerSidePanel({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  className,
}: TimePickerSidePanelProps & { className?: string }) {
  // Dynamic header text — 顯示當前選擇的 HH:MM(對齊 user Q4 + Ant idiom)
  const headerText = value
    ? timePartsToString(value, showSeconds)
    : (showSeconds ? '--:--:--' : '--:--')

  return (
    <div className={cn('flex flex-col h-full pt-3', className)}>
      {/* Header 純結構:h-field-xs (24px) + flex 水平+垂直置中 + mb-3 (12px gap) */}
      <div className="h-field-xs flex items-center justify-center mb-3">
        <span className="text-body font-medium tabular-nums">{headerText}</span>
      </div>
      {/* Columns:flex-1 填滿剩餘 height,無 horizontal padding(填滿容器寬度) */}
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
                  // Clear = 立刻 commit + 同步 draft(對齊 user 體感 / Ant trigger X 慣例)
                  // 不走 needConfirm「等確定」語義 — X 在 trigger 上是 standard clear affordance,
                  // 應立刻清空。dual-state 必同步:value('') + draft(null),否則 popover 開
                  // 著時 displayValue=draft 仍顯示舊值(see line 318: displayValue = needConfirm ? draft : value)。
                  onClick: (e) => {
                    e?.stopPropagation()
                    onChange?.('')
                    setDraft(null)
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
              // Footer:消費 SurfaceFooter SSOT(border-t + canonical px-loose py-tight padding,
              // 不再 hand-coded p-2 / Separator / ml-auto wrapper 三層垃圾)。
              // 「此刻」加 mr-auto 把後面 button 推右(對齊 Ant `marginInlineStart: auto` on OK)。
              <SurfaceFooter>
                <Button variant="tertiary" size="sm" onClick={handleNow} className="mr-auto">此刻</Button>
                {needConfirm ? (
                  <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!draft}>確定</Button>
                ) : (
                  <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
                )}
              </SurfaceFooter>
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
// Canonical 2026-05-02 v4 — 全對齊 Ant Design RangePicker(WebFetch 實證):
//
// **showTime Range**(rc-picker `multiplePanel = false` 證實):
//   - **1 calendar + 1 time panel**(等同 single DateTimePicker layout)
//   - 沒 range track 視覺(計算上跟 single 一樣)
//   - footer **無「此刻」按鈕**(rc-picker `showNow={multiple ? false : showNow}` 證實)
//   - Click flow:click input → open popup for activeEnd → 編 → 點「確定」commit activeEnd
//     → if start: switch activeEnd='end' + popup 維持 open;if end: close popup
//   - Cell disable(rc-picker useRangeDisabledDate 證實):
//     activeEnd='end' + start 已選 → date < start disabled
//     activeEnd='start' + end 已選 → date > end disabled
//
// **date-only Range**(rc-picker `multiplePanel = true`):
//   - **2 calendars 並列**(showTime=false 時)
//   - Full range track 視覺(start / middle / end)
//   - 走原 RDP mode='range' 配對 click 邏輯 + auto-swap
//
// **Trigger**:2 input button,active end blue underline 標示

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
    /**
     * Click「確定」canonical(2026-05-02 v4,對齊 Ant Design 序列流程):
     *   showTime Range:
     *     - activeEnd='start' → commit start to draft + switch activeEnd='end' + popup 維持 open
     *     - activeEnd='end'   → commit final draft to value + close popup
     *   date-only Range(沒有 footer,不會走這 path):— N/A
     */
    const handleConfirm = () => {
      if (showTime && activeEnd === 'start' && draft[0]) {
        // Start 已填 → switch to end,popup 維持 open
        setActiveEnd('end')
      } else {
        // End 也填好(or non-showTime needConfirm)→ final commit + close
        onChange?.(draft)
        setOpen(false)
      }
    }
    const handleNow = () => {
      setActive(showTime ? nowIsoDateTime() : dateToIso(new Date()))
    }
    const handleClearRange = (e?: React.MouseEvent) => {
      e?.stopPropagation()
      // Clear = 立刻 commit + 同步 draft(對齊 single mode + user 體感)
      // dual-state 同步,否則 popover 開著時 displayValue=draft 仍顯示舊 [start, end]
      onChange?.([null, null])
      setDraft([null, null])
    }
    const openWithActive = (which: 'start' | 'end') => {
      setActiveEnd(which)
      setOpen(true)
    }
    /**
     * Cell disable(對齊 Ant rc-picker `useRangeDisabledDate`):
     *   activeEnd='end' + start 已選 → date < start 被 disable(同日 OK)
     *   activeEnd='start' + end 已選 → date > end 被 disable(同日 OK)
     * 防 user 點下違反順序的日期(start > end / end < start)。
     */
    const isOutOfRangeOrder = React.useCallback((date: Date): boolean => {
      // ⚠️ 必先 clone(new Date(...)),否則 setHours 會 mutate useMemo'd date 物件
      if (activeEnd === 'end' && startDate) {
        const startMidnight = new Date(startDate.getTime())
        startMidnight.setHours(0, 0, 0, 0)
        return date.getTime() < startMidnight.getTime()
      }
      if (activeEnd === 'start' && endDate) {
        const endEndOfDay = new Date(endDate.getTime())
        endEndOfDay.setHours(23, 59, 59, 999)
        return date.getTime() > endEndOfDay.getTime()
      }
      return false
    }, [activeEnd, startDate, endDate])

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
                  // showTime Range:rangeModifiers 為空(不顯示 range track,對齊 Ant)
                  mode="single"
                  selected={activeDate}
                  onSelect={(date) => {
                    if (!date) return
                    if (isOutOfRangeOrder(date)) return  // 防護:disable 邏輯內 click 已被 RDP 擋,但雙保險
                    const preservedTime = isoToTimeParts(activeEnd === 'start' ? draft[0] : draft[1]) ?? activeTime
                    const nextIso = showTime
                      ? combineDateAndTime(date, preservedTime)
                      : dateToIso(date)
                    const nextDraft: [string | null, string | null] = activeEnd === 'start'
                      ? [nextIso, draft[1]]
                      : [draft[0], nextIso]
                    commitRange(nextDraft)
                    // Auto-advance / close logic:
                    if (!showTime) {
                      // date-only Range:選完 start 自動切 end;兩端皆填 + 不需確認 → 關閉
                      if (activeEnd === 'start') {
                        setActiveEnd('end')
                        if (!needConfirm && nextDraft[0] && nextDraft[1]) setOpen(false)
                      } else if (!needConfirm && nextDraft[0] && nextDraft[1]) {
                        setOpen(false)
                      }
                    }
                    // showTime Range:不 auto-advance,讓 user 編 time 後手動按確定 commit
                    // (對齊 Ant 序列流程 — 確定 button 切 activeEnd)
                  }}
                  // showTime Range:不渲 range visualization(對齊 Ant — 整個 popup 等同 single
                  // DateTimePicker,沒 range 視覺概念);date-only Range 才顯示
                  modifiers={showTime ? {} : rangeModifiers}
                  modifiersClassNames={{
                    // ── Range visual canonical(2026-05-03 v8 stadium pattern)──
                    // v5 修「白色破圖」用 pseudo 蓋全 cell 矩形,但新副作用:button 圓比矩形小,
                    // 4 corner triangle 區域 grey 凸出圓外(user 2026-05-03 抓到「凸出去」)。
                    // v8 對齊 Ant `cell-range-start::before { border-radius: 9999px 0 0 9999px }`:
                    // rangeStart pseudo 加 `rounded-l-full` → pseudo 變「左半圓 + 右矩形」stadium
                    // 左半圓 EXACTLY OVERLAY button 圓的左半弧(同 center 同 radius 14)→ 無縫
                    // 右側矩形 bridge 2px to middle → 跟 middle pseudo 連續
                    // Cell 的 top-left + bottom-left corner triangle:pseudo 不蓋 + button 不蓋 →
                    // popover white 顯露(乾淨 breathing)
                    rangeStart: cn(
                      '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      "before:content-[''] before:absolute before:inset-y-0",
                      'before:left-0 before:-right-[2px]',
                      'before:bg-neutral-selected before:pointer-events-none',
                      'before:rounded-l-full',  // ← stadium 左半圓 matches button 圓的左半弧
                    ),
                    rangeEnd: cn(
                      '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      "before:content-[''] before:absolute before:inset-y-0",
                      'before:-left-[2px] before:right-0',
                      'before:bg-neutral-selected before:pointer-events-none',
                      'before:rounded-r-full',  // ← 鏡像
                    ),
                    rangeMiddle: cn(
                      "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
                      'before:bg-neutral-selected before:pointer-events-none',
                      '[&>button]:!bg-transparent [&>button]:!text-foreground',
                    ),
                  }}
                  // Cell disable:防 user 點下違反順序的日期(對齊 Ant useRangeDisabledDate)
                  disabled={isOutOfRangeOrder}
                  // showTime → 1 cal(對齊 Ant `multiplePanel=false`);date-only → 2 cal(`multiplePanel=true`)
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
            // Footer 消費 SurfaceFooter SSOT(border-t + canonical px-loose py-tight)。
            // showTime Range 無「此刻」(對齊 Ant `showNow={multiple ? false : showNow}`)→ 只有 確定 走 justify-end。
            // date-only Range needConfirm:左 此刻(mr-auto)+ 右 確定。
            <SurfaceFooter>
              {!showTime && (
                <Button variant="tertiary" size="sm" onClick={handleNow} className="mr-auto">此刻</Button>
              )}
              {needConfirm ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  // showTime Range serial flow:start mode 只需 start filled;end mode 兩端皆 filled
                  disabled={
                    showTime
                      ? (activeEnd === 'start' ? !draft[0] : !draft[0] || !draft[1])
                      : !draft[0] || !draft[1]
                  }
                >
                  確定
                </Button>
              ) : (
                <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
              )}
            </SurfaceFooter>
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
