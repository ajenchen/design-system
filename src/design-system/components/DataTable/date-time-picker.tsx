/**
 * DateTimePicker / DateTimeRangePicker — Ant-style datetime picker.
 *
 * Layout:single calendar(left)+ TimeColumns(right side panel)+ Now/OK footer。
 * Range:同上 layout,calendar 顯示 range highlight,TimeColumns 套 active end(start | end 切換)。
 *
 * 對標:Ant Design DatePicker showTime / RangePicker showTime(verified 2026-05 web research)
 * + React Aria a11y(ARIA grid + listbox)。
 *
 * 詳:./datetime-picker.draft.md
 */

import * as React from 'react'
import { Calendar as CalendarIcon, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles } from '@/design-system/components/Field/field-wrapper'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { DateGrid } from '@/design-system/components/DateGrid/date-grid'
import { Button } from '@/design-system/components/Button/button'
import { Separator } from '@/design-system/components/Separator/separator'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  type TimeParts,
  type TimeStep,
} from '@/design-system/components/TimePicker/time-columns'

// ── Helpers ─────────────────────────────────────────────────────────────

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return isNaN(d.getTime()) ? undefined : d
}

function combineDateAndTime(date: Date, time: TimeParts): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(time.hours).padStart(2, '0')
  const mi = String(time.minutes).padStart(2, '0')
  const ss = String(time.seconds).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`
}

function formatDateTime(iso: string | null | undefined, showSeconds: boolean): string {
  if (!iso) return ''
  const d = isoToDate(iso)
  if (!d) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const time = isoToTimeParts(iso) ?? { hours: 0, minutes: 0, seconds: 0 }
  return `${yyyy}-${mm}-${dd} ${timePartsToString(time, showSeconds)}`
}

function nowIso(): string {
  const d = new Date()
  return combineDateAndTime(d, {
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
  })
}

// ── DateTimePicker(single)───────────────────────────────────────────

export interface DateTimePickerProps {
  mode?: FieldMode
  size?: 'sm' | 'md' | 'lg'
  /** ISO 8601 datetime,e.g. '2021-11-15T10:30:00' */
  value?: string | null
  onChange?: (value: string | null) => void
  placeholder?: string
  /** default true — datetime 預設需 OK 才提交(對齊 Ant) */
  needConfirm?: boolean
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  clearable?: boolean
  error?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function DateTimePicker({
  mode = 'edit',
  size = 'md',
  value,
  onChange,
  placeholder = '選擇日期時間',
  needConfirm = true,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  clearable = false,
  error = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  // 暫存 — needConfirm=true 時,user 編輯先暫存,按 OK 才 commit
  const [draft, setDraft] = React.useState<string | null>(value ?? null)

  // value 變化時 sync draft
  React.useEffect(() => {
    setDraft(value ?? null)
  }, [value, open])

  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const iconSize = size === 'lg' ? 20 : 16
  const display = formatDateTime(value, showSeconds)
  const showClear = clearable && value && isEditable

  const draftDate = isoToDate(draft)
  const draftTime = isoToTimeParts(draft) ?? { hours: 0, minutes: 0, seconds: 0 }

  const commit = (next: string | null) => {
    if (needConfirm) {
      setDraft(next)
    } else {
      onChange?.(next)
    }
  }

  const handleConfirm = () => {
    onChange?.(draft)
    setOpen(false)
  }

  const handleNow = () => {
    const now = nowIso()
    if (needConfirm) {
      setDraft(now)
    } else {
      onChange?.(now)
    }
  }

  const handleClearSingle = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(null)
  }

  if (!isEditable) {
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
        data-field-mode={resolvedMode}
      >
        <span className={cn('flex-1 min-w-0 truncate', !value && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {display || placeholder}
        </span>
        <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* a11y: trigger 用 <div role='combobox'> 而非 <button> — 對齊 TimePicker /
            Select / Combobox 同 pattern,避免 ItemInlineActionButton 構成 nested-interactive。
            Radix Popover 在 trigger asChild 下會自動 inject keyboard handler(Enter/Space 開啟)。 */}
        <div
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-error={error || undefined}
          className={cn(
            fieldWrapperStyles({ mode: 'edit', size }),
            'cursor-pointer focus-visible:outline-none',
            className,
          )}
        >
          <span className={cn('flex-1 min-w-0 truncate text-left', !display && 'text-fg-muted')}>
            {display || placeholder}
          </span>
          {showClear && (
            <ItemInlineActionButton
              icon={X}
              size={size === 'sm' ? 'sm' : 'md'}
              aria-label="清除"
              onClick={handleClearSingle}
            />
          )}
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-row" role="dialog" aria-label={ariaLabel ?? placeholder}>
          <div className="p-2">
            <DateGrid
              mode="single"
              selected={draftDate}
              defaultMonth={draftDate}
              onSelect={(d) => {
                if (!d) return
                commit(combineDateAndTime(d, draftTime))
              }}
            />
          </div>
          <TimeColumns
            leadingDivider
            value={draftTime}
            onChange={(time) => {
              if (!draftDate) {
                // 日期未選 → 也允許先選 time(以今天為日期)
                const today = new Date()
                commit(combineDateAndTime(today, time))
              } else {
                commit(combineDateAndTime(draftDate, time))
              }
            }}
            showSeconds={showSeconds}
            minuteStep={minuteStep}
            secondStep={secondStep}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between p-2">
          <Button variant="tertiary" size="sm" onClick={handleNow}>此刻</Button>
          {needConfirm ? (
            <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!draft}>確定</Button>
          ) : (
            <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

DateTimePicker.displayName = 'DateTimePicker'

// ── DateTimeRangePicker ────────────────────────────────────────────────

export interface DateTimeRangePickerProps {
  mode?: FieldMode
  size?: 'sm' | 'md' | 'lg'
  /** 區間 [start ISO, end ISO];任一 null = 尚未選 */
  value?: [string | null, string | null] | null
  onChange?: (value: [string | null, string | null]) => void
  placeholder?: [string, string]
  needConfirm?: boolean
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  clearable?: boolean
  error?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function DateTimeRangePicker({
  mode = 'edit',
  size = 'md',
  value,
  onChange,
  placeholder = ['開始', '結束'],
  needConfirm = true,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  clearable = false,
  error = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: DateTimeRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<[string | null, string | null]>(value ?? [null, null])
  const [activeEnd, setActiveEnd] = React.useState<'start' | 'end'>('start')

  React.useEffect(() => {
    setDraft(value ?? [null, null])
  }, [value, open])

  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const iconSize = size === 'lg' ? 20 : 16
  const startDisplay = formatDateTime(draft[0], showSeconds) || placeholder[0]
  const endDisplay = formatDateTime(draft[1], showSeconds) || placeholder[1]
  const valueDisplay = formatDateTime(value?.[0], showSeconds) || placeholder[0]
  const valueEndDisplay = formatDateTime(value?.[1], showSeconds) || placeholder[1]
  const hasValue = !!(value?.[0] || value?.[1])
  const showClear = clearable && hasValue && isEditable

  const activeIso = activeEnd === 'start' ? draft[0] : draft[1]
  const activeDate = isoToDate(activeIso)
  const activeTime = isoToTimeParts(activeIso) ?? { hours: 0, minutes: 0, seconds: 0 }

  const setActiveValue = (iso: string | null) => {
    const next: [string | null, string | null] = activeEnd === 'start' ? [iso, draft[1]] : [draft[0], iso]
    if (needConfirm) {
      setDraft(next)
    } else {
      onChange?.(next)
      setDraft(next)
    }
  }

  const handleConfirm = () => {
    onChange?.(draft)
    setOpen(false)
  }
  const handleNow = () => {
    const now = nowIso()
    setActiveValue(now)
  }
  const handleClearRange = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.([null, null])
  }

  const rangeFrom = isoToDate(draft[0])
  const rangeTo = isoToDate(draft[1])

  if (!isEditable) {
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
        data-field-mode={resolvedMode}
      >
        <span className={cn('flex-1 min-w-0 truncate', !value?.[0] && 'text-fg-muted')}>{valueDisplay}</span>
        <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
        <span className={cn('flex-1 min-w-0 truncate', !value?.[1] && 'text-fg-muted')}>{valueEndDisplay}</span>
        <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* a11y:role=combobox(避 nested-interactive — 同 single 元件 fix)*/}
        <div
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-label={ariaLabel ?? '選擇日期時間區間'}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-error={error || undefined}
          className={cn(
            fieldWrapperStyles({ mode: 'edit', size }),
            'cursor-pointer focus-visible:outline-none',
            className,
          )}
        >
          <span className={cn('flex-1 min-w-0 truncate text-left', !value?.[0] && 'text-fg-muted')}>{valueDisplay}</span>
          <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
          <span className={cn('flex-1 min-w-0 truncate text-left', !value?.[1] && 'text-fg-muted')}>{valueEndDisplay}</span>
          {showClear && (
            <ItemInlineActionButton
              icon={X}
              size={size === 'sm' ? 'sm' : 'md'}
              aria-label="清除"
              onClick={handleClearRange}
            />
          )}
          <CalendarIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-row" role="dialog" aria-label={ariaLabel ?? '選擇日期時間區間'}>
          <div className="p-2">
            <DateGrid
              mode="range"
              selected={{ from: rangeFrom, to: rangeTo }}
              defaultMonth={rangeFrom ?? rangeTo ?? undefined}
              onSelect={(range) => {
                if (!range) return
                const target = activeEnd === 'start' ? range.from : range.to
                if (!target) return
                setActiveValue(combineDateAndTime(target, activeTime))
              }}
            />
          </div>
          <TimeColumns
            leadingDivider
            value={activeTime}
            onChange={(time) => {
              if (!activeDate) {
                const today = new Date()
                setActiveValue(combineDateAndTime(today, time))
              } else {
                setActiveValue(combineDateAndTime(activeDate, time))
              }
            }}
            showSeconds={showSeconds}
            minuteStep={minuteStep}
            secondStep={secondStep}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between p-2 gap-2">
          {/* Editing indicator — start | end 切換 */}
          <div role="radiogroup" aria-label="編輯端" className="flex gap-1 text-caption text-fg-muted">
            <button
              type="button"
              role="radio"
              aria-checked={activeEnd === 'start'}
              onClick={() => setActiveEnd('start')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                activeEnd === 'start' ? 'bg-neutral-selected text-foreground' : 'hover:bg-neutral-hover'
              )}
            >
              {startDisplay}
            </button>
            <ArrowRight size={12} className="text-fg-muted self-center" aria-hidden />
            <button
              type="button"
              role="radio"
              aria-checked={activeEnd === 'end'}
              onClick={() => setActiveEnd('end')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                activeEnd === 'end' ? 'bg-neutral-selected text-foreground' : 'hover:bg-neutral-hover'
              )}
            >
              {endDisplay}
            </button>
          </div>
          <div className="flex gap-2">
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
        </div>
      </PopoverContent>
    </Popover>
  )
}

DateTimeRangePicker.displayName = 'DateTimeRangePicker'
