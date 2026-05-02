/**
 * TimeColumns — H/M/S scroll selector primitive.
 *
 * 抽象自 TimePicker 內部 TimeColumn 邏輯,給 DateTimePicker / DateTimeRangePicker 共用
 * (M17 Rule-of-3 滿足:TimePicker / DateTimePicker / DateTimeRangePicker 三個 consumer)。
 *
 * **TODO**:之後把 TimePicker 也改用本 primitive(避免 2 處 maintain)。
 * 現階段 TimePicker 仍有內部版本,先以本 primitive 服務 datetime 元件。
 */

import * as React from 'react'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { cn } from '@/lib/utils'

// ── ISO time parsing ────────────────────────────────────────────────────

export interface TimeParts {
  hours: number
  minutes: number
  seconds: number
}

/** Parse "HH:MM:SS" or "HH:MM" or full ISO datetime — returns time parts only */
export function isoToTimeParts(iso: string | null | undefined): TimeParts | undefined {
  if (!iso) return undefined
  // Accept ISO datetime "2021-11-15T10:30:45" or just "10:30:45" / "10:30"
  const timeMatch = iso.match(/(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!timeMatch) return undefined
  return {
    hours: Number(timeMatch[1]) || 0,
    minutes: Number(timeMatch[2]) || 0,
    seconds: Number(timeMatch[3] ?? 0),
  }
}

/** Format time parts into "HH:MM" or "HH:MM:SS" depending on showSeconds */
export function timePartsToString(parts: TimeParts, showSeconds = false): string {
  const hh = String(parts.hours).padStart(2, '0')
  const mm = String(parts.minutes).padStart(2, '0')
  if (!showSeconds) return `${hh}:${mm}`
  const ss = String(parts.seconds).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ── Range builder ──────────────────────────────────────────────────────

function buildRange(max: number, step: number): number[] {
  const arr: number[] = []
  for (let v = 0; v < max; v += step) arr.push(v)
  return arr
}

// ── Single column ──────────────────────────────────────────────────────

interface TimeColumnProps {
  values: number[]
  selected: number
  label: string
  onSelect: (value: number) => void
  withDivider?: boolean
}

function TimeColumn({ values, selected, label, onSelect, withDivider }: TimeColumnProps) {
  const listRef = React.useRef<HTMLUListElement>(null)

  // Scroll to selected on mount / value change
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const viewport = list.parentElement
    if (!viewport) return
    const idx = values.indexOf(selected)
    if (idx < 0) return
    const item = list.children[idx] as HTMLElement | undefined
    if (!item) return
    viewport.scrollTop = item.offsetTop - viewport.clientHeight / 2 + item.clientHeight / 2
  }, [values, selected])

  return (
    <ScrollArea className={cn('flex-1 h-[216px]', withDivider && 'border-r border-divider')}>
      <ul
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="flex flex-col py-2"
      >
        {values.map((v) => {
          const isSelected = v === selected
          return (
            <li key={v} role="option" aria-selected={isSelected}>
              <button
                type="button"
                onClick={() => onSelect(v)}
                className={cn(
                  'w-full h-field-sm text-body tabular-nums',
                  'flex items-center justify-center',
                  'cursor-pointer transition-colors',
                  'hover:bg-neutral-hover',
                  isSelected && 'bg-neutral-selected text-foreground hover:bg-neutral-selected',
                )}
              >
                {String(v).padStart(2, '0')}
              </button>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}

// ── Composite — HH/MM/SS columns ───────────────────────────────────────

export interface TimeColumnsProps {
  /** Current time parts(undefined = 顯示但未選任何值) */
  value?: TimeParts
  /** Update callback — fires on every cell click */
  onChange: (next: TimeParts) => void
  /** 是否顯示秒欄位(default false) */
  showSeconds?: boolean
  /** 分鐘步進(default 1) */
  minuteStep?: number
  /** 秒步進(default 1) */
  secondStep?: number
  className?: string
}

/**
 * H/M/S column scroll selector(對齊 Ant DatePicker showTime)。
 *
 * 配 DatePicker 使用 → DateTimePicker;配 DateGrid range mode 使用 → DateTimeRangePicker。
 */
export function TimeColumns({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  className,
}: TimeColumnsProps) {
  const safeValue: TimeParts = value ?? { hours: 0, minutes: 0, seconds: 0 }
  const hours = buildRange(24, 1)
  const minutes = buildRange(60, minuteStep)
  const seconds = buildRange(60, secondStep)

  return (
    <div className={cn('flex flex-row w-[180px] border-l border-divider', className)}>
      <TimeColumn
        values={hours}
        selected={safeValue.hours}
        label="小時"
        onSelect={(h) => onChange({ ...safeValue, hours: h })}
        withDivider
      />
      <TimeColumn
        values={minutes}
        selected={safeValue.minutes}
        label="分鐘"
        onSelect={(m) => onChange({ ...safeValue, minutes: m })}
        withDivider={showSeconds}
      />
      {showSeconds && (
        <TimeColumn
          values={seconds}
          selected={safeValue.seconds}
          label="秒"
          onSelect={(s) => onChange({ ...safeValue, seconds: s })}
        />
      )}
    </div>
  )
}
