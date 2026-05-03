/**
 * TimeColumns — H/M/S scroll selector primitive(M17 Rule-of-3 SSOT)。
 *
 * 共用消費者:
 * - `TimePicker`(本元件家)
 * - `DatePicker showTime`(date + time)
 * - `DatePickerRange showTime`(range with time)
 *
 * 抽出原因:三個 picker 共用 H/M/S column scroll-pick 行為,公式重覆 = M17 違反。
 * 抽到 TimePicker/(time scroll selector 的 canonical 家)。
 *
 * ── 設計 ──
 * - Value:`TimeParts { hours, minutes, seconds }`(對齊 date-fns / Date getHours()...)
 * - Step:每欄獨立 `minuteStep` / `secondStep`(會議常用 15)
 * - Disabled:`disabledHours / disabledMinutes / disabledSeconds`(動態根據已選其他欄位)
 * - Visual:對齊 ref/timepicker.png — 多欄並排 + border-r 分隔
 */

import * as React from 'react'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────────────────────

export interface TimeParts {
  hours: number
  minutes: number
  seconds: number
}

export type TimeStep = 1 | 5 | 10 | 15 | 30

export interface TimeColumnsDisabled {
  hours?: number[]
  minutes?: number[]
  seconds?: number[]
}

// ── ISO time parsing ────────────────────────────────────────────────────

/** Parse "HH:MM:SS" / "HH:MM" / full ISO datetime — returns time parts only */
export function isoToTimeParts(iso: string | null | undefined): TimeParts | undefined {
  if (!iso) return undefined
  const timeMatch = iso.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (!timeMatch) return undefined
  const h = Number(timeMatch[1])
  const m = Number(timeMatch[2])
  const s = timeMatch[3] !== undefined ? Number(timeMatch[3]) : 0
  if (
    Number.isNaN(h) || h < 0 || h > 23 ||
    Number.isNaN(m) || m < 0 || m > 59 ||
    Number.isNaN(s) || s < 0 || s > 59
  ) return undefined
  return { hours: h, minutes: m, seconds: s }
}

/** Format time parts → "HH:MM" or "HH:MM:SS" depending on showSeconds */
export function timePartsToString(parts: TimeParts, showSeconds = false): string {
  const hh = String(parts.hours).padStart(2, '0')
  const mm = String(parts.minutes).padStart(2, '0')
  if (!showSeconds) return `${hh}:${mm}`
  const ss = String(parts.seconds).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ── Range builder ───────────────────────────────────────────────────────

function buildRange(max: number, step: number): number[] {
  const arr: number[] = []
  for (let v = 0; v < max; v += step) arr.push(v)
  return arr
}

// ── Single column ───────────────────────────────────────────────────────

interface TimeColumnProps {
  values: number[]
  selected: number
  /** disabled value set(動態根據其他欄位推) */
  disabledSet?: Set<number>
  label: string
  onSelect: (value: number) => void
  /** 右側分隔線(對齊 ref 多欄樣式) */
  withDivider?: boolean
}

function TimeColumn({ values, selected, disabledSet, label, onSelect, withDivider }: TimeColumnProps) {
  const listRef = React.useRef<HTMLDivElement>(null)

  // 開啟時滾到 selected 位置(在 ScrollArea viewport 中置中)。
  // 用 scrollIntoView({ block: 'center' }) 自動找最近的 scrollable ancestor —
  // 比 manual scrollTop + parentElement 強健(Radix ScrollArea 結構為 Viewport > inner-div > content,
  // listRef.parentElement 不是真正 scrollable 元素)。
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const idx = values.indexOf(selected)
    if (idx < 0) return
    const item = list.children[idx] as HTMLElement | undefined
    if (!item) return
    item.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [values, selected])

  // WAI-ARIA listbox keyboard pattern:ArrowUp/Down 切 option / Home / End 跳邊界。
  // 對標 Ant TimePicker / Material TimePicker。Tab 跳離 listbox(走預設行為,不 stopPropagation)。
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = values.indexOf(selected)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = values.find((_, i) => i > idx && !disabledSet?.has(values[i])) ?? values[idx]
      onSelect(next)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // 反向找第一個 enabled
      let i = idx - 1
      while (i >= 0 && disabledSet?.has(values[i])) i--
      if (i >= 0) onSelect(values[i])
    } else if (e.key === 'Home') {
      e.preventDefault()
      const first = values.find((v) => !disabledSet?.has(v))
      if (first !== undefined) onSelect(first)
    } else if (e.key === 'End') {
      e.preventDefault()
      for (let i = values.length - 1; i >= 0; i--) {
        if (!disabledSet?.has(values[i])) {
          onSelect(values[i])
          break
        }
      }
    }
  }

  // WAI-ARIA listbox pattern:role=listbox 直接包 role=option(button),不另用 li 包
  // (li role=option + 內含 button 會被 axe 抓 nested-interactive)
  // 高度策略:本 primitive 不鎖死 height(對齊 ScrollArea / Combobox 同 idiom)。
  // ScrollArea 用 h-full,parent flex container 控高 — 讓 consumer:
  //   - TimePicker:wrap in h-[216px] container(預設 ~7 items)
  //   - DatePicker showTime / Range:flex-row items-stretch + calendar 一起決定高度(自動同高)
  return (
    <ScrollArea className={cn('flex-1 h-full', withDivider && 'border-r border-divider')}>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex flex-col py-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
      >
        {values.map((v) => {
          const isSelected = v === selected
          const isDisabled = disabledSet?.has(v) ?? false
          return (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={isDisabled}
              // tabIndex=-1:listbox 自身 tabbable + 用 ArrowUp/Down 切 option(WAI-ARIA roving),
              // 不讓每個 option 都進 Tab order(會 Tab 84 次過完 hours+minutes)
              tabIndex={-1}
              onClick={() => onSelect(v)}
              className={cn(
                'w-full h-field-sm text-body tabular-nums',
                'flex items-center justify-center',
                'cursor-pointer transition-colors',
                'hover:bg-neutral-hover',
                isSelected && 'bg-neutral-selected text-foreground hover:bg-neutral-selected',
                isDisabled && 'text-fg-disabled cursor-not-allowed hover:bg-transparent',
              )}
            >
              {String(v).padStart(2, '0')}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// ── Composite — H/M/S columns ──────────────────────────────────────────

export interface TimeColumnsProps {
  value?: TimeParts
  onChange: (next: TimeParts) => void
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  /** 動態 disabled 各欄位 value 子集 */
  disabled?: TimeColumnsDisabled
  className?: string
  /** 是否在最左側加 border-l(配 DatePicker showTime / Range date+time 拼接時用) */
  leadingDivider?: boolean
}

export function TimeColumns({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  disabled,
  className,
  leadingDivider = false,
}: TimeColumnsProps) {
  const safeValue: TimeParts = value ?? { hours: 0, minutes: 0, seconds: 0 }
  const hourValues = React.useMemo(() => buildRange(24, 1), [])
  const minuteValues = React.useMemo(() => buildRange(60, minuteStep), [minuteStep])
  const secondValues = React.useMemo(() => buildRange(60, secondStep), [secondStep])

  const disabledSets = React.useMemo(() => ({
    hours:   disabled?.hours   ? new Set(disabled.hours)   : undefined,
    minutes: disabled?.minutes ? new Set(disabled.minutes) : undefined,
    seconds: disabled?.seconds ? new Set(disabled.seconds) : undefined,
  }), [disabled?.hours, disabled?.minutes, disabled?.seconds])

  const widthClass = showSeconds ? 'w-60' : 'w-40'

  return (
    <div
      className={cn(
        'flex flex-row',
        widthClass,
        leadingDivider && 'border-l border-divider',
        className,
      )}
    >
      <TimeColumn
        values={hourValues}
        selected={safeValue.hours}
        disabledSet={disabledSets.hours}
        label="hours"
        onSelect={(h) => onChange({ ...safeValue, hours: h })}
        withDivider
      />
      <TimeColumn
        values={minuteValues}
        selected={safeValue.minutes}
        disabledSet={disabledSets.minutes}
        label="minutes"
        onSelect={(m) => onChange({ ...safeValue, minutes: m })}
        withDivider={showSeconds}
      />
      {showSeconds && (
        <TimeColumn
          values={secondValues}
          selected={safeValue.seconds}
          disabledSet={disabledSets.seconds}
          label="seconds"
          onSelect={(s) => onChange({ ...safeValue, seconds: s })}
        />
      )}
    </div>
  )
}
