// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { CAT_EVENT, CAT_ACCENT, type CategoricalHue } from '@/design-system/tokens/categorical-color'
import { Button } from '@/design-system/components/Button/button'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'

/**
 * Calendar — 事件檢視 canvas(月 view MVP)
 *
 * 定位:看事件的 page-level canvas,對齊 Notion Calendar / Google Calendar。
 * 完整 spec 見 `calendar.spec.md`。
 *
 * ── Layout Family ──
 * 非 4-Family,屬 page-composite(多區塊 Toolbar + Grid + EventTile)。
 *
 * ── MVP scope(本次 session)──
 * - 月 view 完整(toolbar / grid / event tile / today highlight / outside days)
 * - 週 / 日 view 是 tech debt
 * - 拖拉增刪 event 是 tech debt
 *
 * ── 與 DatePicker 的區分 ──
 * DatePicker 是「選日期」form control;Calendar 是「看事件」page canvas。
 * 名字相近但職責完全不同,spec 頂段明示分界。
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  /** ISO 字串 "YYYY-MM-DD"(all-day)或 "YYYY-MM-DDTHH:mm"(timed) */
  start: string | Date
  end: string | Date
  allDay?: boolean
  /**
   * 事件類別色(categorical 色相,1:1 對 `--color-{hue}-*`)。**消費 categorical-color SSOT**,
   * 與 Tag / Avatar 共用同一組 12 色相。2026-06-04 修:原 `orange` 與 `red` 都誤接 deep-orange;
   * 改消費 SSOT 後 orange→`--color-orange-*`、red→`--color-red-*`(品牌紅 hue 25),各自獨立。
   */
  color?: CategoricalHue
  metadata?: Record<string, unknown>
}

export type CalendarView = 'month' | 'week' | 'day'

export interface CalendarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** 當前 view(MVP 只 'month',其餘 view tech debt) */
  view?: CalendarView
  defaultView?: CalendarView
  onViewChange?: (view: CalendarView) => void

  /** 聚焦日期(月 view 的那個月) */
  referenceDate?: Date
  defaultReferenceDate?: Date
  onReferenceDateChange?: (date: Date) => void

  /** 事件資料 */
  events?: CalendarEvent[]

  /** 點 event tile 回調 */
  onEventClick?: (event: CalendarEvent) => void
  /** 點月 cell 回調(用於新增) */
  onDateClick?: (date: Date) => void
  /** 點新事件 CTA 回調 */
  onCreateEvent?: () => void

  /** 0 = Sunday, 1 = Monday。預設 0(對齊 Google Calendar 美系預設) */
  weekStartsOn?: 0 | 1

  /** 自訂 event tile 渲染 */
  renderEventTile?: (event: CalendarEvent) => React.ReactNode

  /** size(MVP 只 md;lg 為 tech debt) */
  size?: 'md' | 'lg'
  className?: string

  /** locale(預設 'en-US') */
  locale?: string

  /** ARIA labels for chrome controls. Override for i18n. */
  prevAriaLabel?: string
  nextAriaLabel?: string
  /** 月份導覽 <nav> landmark 的 aria-label。Override for i18n. */
  navAriaLabel?: string
  viewToggleAriaLabel?: string
  todayLabel?: string
}

// ── Event tile color tokens ─────────────────────────────────────────────────
// **消費 categorical-color SSOT**(CAT_EVENT = subtle 底 + hover step-2;CAT_ACCENT = 左側 step-6
// 實心條),與 Tag / Avatar 共用 12 色相,key X 一律對 `--color-X-*`(1:1)。
// 2026-06-01 allDay:全天事件 = 淡底 tile + 左側實心 accent 條 + medium,視覺區分「全天長條」vs
// 有時間事件;用 accent border 而非 solid fill 保文字對比安全。對齊 Google Calendar / Outlook 慣例。
const EVENT_COLOR_CLASSES = CAT_EVENT
const EVENT_ALLDAY_ACCENT = CAT_ACCENT

// ── Helpers ────────────────────────────────────────────────────────────────

function coerceDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function eventsOnDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((e) => {
    const start = coerceDate(e.start)
    const end = coerceDate(e.end)
    // 日期落在 [start, end] 範圍內(日精度)
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
    const eEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
    return d >= s && d <= eEnd
  })
}

// ── Component ──────────────────────────────────────────────────────────────

const MAX_TILES_PER_CELL = 3

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(function Calendar({
  view: viewProp,
  defaultView = 'month',
  onViewChange,
  referenceDate: referenceDateProp,
  defaultReferenceDate,
  onReferenceDateChange,
  events = [],
  onEventClick,
  onDateClick,
  onCreateEvent,
  weekStartsOn = 0,
  renderEventTile,
  size = 'md',
  className,
  locale = 'en-US',
  prevAriaLabel = '上個月', // i18n-allow: DS default; consumer override via prevAriaLabel prop
  nextAriaLabel = '下個月', // i18n-allow: DS default; consumer override via nextAriaLabel prop
  navAriaLabel = '行事曆月份導覽', // i18n-allow: DS default; consumer override via navAriaLabel prop
  viewToggleAriaLabel = '檢視切換', // i18n-allow: DS default; consumer override via viewToggleAriaLabel prop
  todayLabel = '今天', // i18n-allow: DS default; consumer override via todayLabel prop
  ...props
}, ref) {
  // Controlled / uncontrolled refDate
  const [internalRef, setInternalRef] = React.useState<Date>(
    defaultReferenceDate ?? new Date(),
  )
  const refDate = referenceDateProp ?? internalRef
  const setRefDate = React.useCallback(
    (next: Date) => {
      if (referenceDateProp === undefined) setInternalRef(next)
      onReferenceDateChange?.(next)
    },
    [referenceDateProp, onReferenceDateChange],
  )

  // View state(MVP 只用 month,其他 tech debt)
  const [internalView, setInternalView] = React.useState<CalendarView>(defaultView)
  const currentView = viewProp ?? internalView
  const setView = React.useCallback(
    (next: CalendarView) => {
      if (viewProp === undefined) setInternalView(next)
      onViewChange?.(next)
    },
    [viewProp, onViewChange],
  )

  // Build month grid
  const days = React.useMemo(() => {
    const monthStart = startOfMonth(refDate)
    const monthEnd = endOfMonth(refDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [refDate, weekStartsOn])

  const monthTitle = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  }).format(refDate)

  const today = new Date()

  const weekdayNames = React.useMemo(() => {
    // 取 `days[0..6]` 的名字(gridStart 開始 7 天,正好一週)
    return days.slice(0, 7).map((d) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d),
    )
  }, [days, locale])

  const handleToday = () => setRefDate(new Date())
  const handlePrev = () => setRefDate(subMonths(refDate, 1))
  const handleNext = () => setRefDate(addMonths(refDate, 1))

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col w-full h-full bg-surface rounded-md border border-divider overflow-hidden',
        className,
      )}
      data-view={currentView}
      data-size={size}
      {...props}
    >
      {/* Toolbar:[◀] [今天] [▶]  title  [view tabs]  [+ new] */}
      <div
        className={cn(
          'flex items-center gap-2 shrink-0 border-b border-divider',
          'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
        )}
      >
        {/* 月份導覽 landmark:prev / 今天 / next 包成 <nav> 給 SR landmark 導航(per calendar.spec.md a11y 段) */}
        <nav className="flex items-center gap-2" aria-label={navAriaLabel}>
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={ChevronLeft}
            aria-label={prevAriaLabel}
            onClick={handlePrev}
          />
          <Button variant="tertiary" size="sm" onClick={handleToday}>
            {todayLabel}
          </Button>
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={ChevronRight}
            aria-label={nextAriaLabel}
            onClick={handleNext}
          />
        </nav>

        <h2 className="text-body-lg font-medium text-foreground flex-1 min-w-0 truncate ml-2">
          {monthTitle}
        </h2>

        {/* View switcher:用 SegmentedControl(互斥多選一 canonical)——
            對齊 CLAUDE.md「互斥分類選擇走 SegmentedControl,非 checked Button group」原則。
            Button 的 pressed 是「toggle 持續狀態」語意,不適合「單選 view 切換」 */}
        <SegmentedControl
          size="sm"
          value={currentView}
          onValueChange={(v) => setView(v as CalendarView)}
          aria-label={viewToggleAriaLabel}
        >
          <SegmentedControlItem value="day" disabled>日</SegmentedControlItem>
          <SegmentedControlItem value="week" disabled>週</SegmentedControlItem>
          <SegmentedControlItem value="month">月</SegmentedControlItem>
        </SegmentedControl>

        {onCreateEvent && (
          <Button variant="primary" size="sm" startIcon={Plus} onClick={onCreateEvent}>
            新事件
          </Button>
        )}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-divider bg-muted">
        {weekdayNames.map((name, i) => (
          <div
            key={i}
            className="px-2 py-1.5 text-caption text-fg-muted font-normal text-center"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Month grid:7 cols, ~5-6 rows。a11y(2026-04-25):WAI-ARIA grid 要求 row > gridcell
          階層,chunk days 7 一組,wrap 成 role='row'(display:contents 保 CSS grid 佈局)。 */}
      <div
        className="grid grid-cols-7 flex-1 min-h-0"
        role="grid"
        aria-label={`月行事曆,${monthTitle}`}
      >
        {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
          <div key={rowIdx} role="row" style={{ display: 'contents' }}>
            {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((date) => {
              const inMonth = isSameMonth(date, refDate)
              const isToday = isSameDay(date, today)
              // 2026-06-01 allDay:全天事件排 cell 頂端(對齊 Google Calendar 全天列在上)
              const dayEvents = eventsOnDate(events, date).slice().sort((a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false))
              const visibleEvents = dayEvents.slice(0, MAX_TILES_PER_CELL)
              const overflowCount = dayEvents.length - visibleEvents.length

              return (
                // 2026-06-11 a11y(user 拍板 2c 修 code):cell 從 <button role="gridcell"> 改非互動容器 —
                // W3C button 語義禁止互動後代,cell 內含 role="button" 事件 tile = nested-interactive 違規。
                // 對齊 Google Calendar:gridcell = 容器,日期數字按鈕 = 日期級 keyboard 入口,tile 各自為 button。
                // div onClick 保留滑鼠「點 cell 空白處等同點日期」便利(keyboard 走日期數字按鈕,功能等價)。
                <div
                  key={date.toISOString()}
                  role="gridcell"
                  onClick={() => onDateClick?.(date)}
              className={cn(
                'flex flex-col gap-1 min-h-28 p-1.5 text-left',
                'border-r border-b border-divider last:border-r-0',
                '[&:nth-child(7n)]:border-r-0',
                'hover:bg-neutral-hover transition-colors',
                !inMonth && 'bg-muted',
              )}
            >
              {/* Date number = keyboard 入口;今天/平日統一 24px 圓形 hit-area(WCAG 2.5.8 ≥24,
                  今天 pill 本就 24px,平日跟齊 → 跨 cell 數字光學對齊) */}
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  aria-label={`${format(date, 'yyyy-MM-dd')},${dayEvents.length} 個事件`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDateClick?.(date)
                  }}
                  className={cn(
                    'inline-flex items-center justify-center min-w-6 h-6 rounded-full text-body font-medium',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isToday && 'px-2 bg-info text-on-emphasis',
                    !isToday && !inMonth && 'text-fg-disabled',
                  )}
                >
                  {format(date, 'd')}
                </button>
              </div>

              {/* Event tiles */}
              <div className="flex flex-col gap-0.5 min-h-0">
                {visibleEvents.map((event) => {
                  const ec = event.color ?? 'blue'
                  // 2026-06-01 allDay:淡底 + 左 accent 條 + medium = 「全天長條」視覺(區分有時間事件)
                  const colorClass = event.allDay
                    ? cn(EVENT_COLOR_CLASSES[ec], EVENT_ALLDAY_ACCENT[ec], 'font-medium')
                    : EVENT_COLOR_CLASSES[ec]
                  if (renderEventTile) {
                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(event)
                        }}
                      >
                        {renderEventTile(event)}
                      </div>
                    )
                  }
                  return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick?.(event)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onEventClick?.(event)
                        }
                      }}
                      aria-label={`事件:${event.title}`}
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-caption truncate cursor-pointer transition-colors',
                        // 2026-05-31 #22:事件 tile 是 focusable(tabIndex=0 role=button)但原無 focus ring
                        // → WCAG 2.4.7 不合規。補 focus-visible ring 對齊日期格按鈕。
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        colorClass,
                      )}
                    >
                      {event.title}
                    </div>
                  )
                })}
                {overflowCount > 0 && (
                  <div className="text-caption text-fg-muted px-1.5">
                    +{overflowCount} more
                  </div>
                )}
              </div>
            </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
})
Calendar.displayName = "Calendar"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const calendarMeta = {
  component: 'Calendar',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-neutral-hover', 'bg-info', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: ['ring-ring'],
  },
} as const

export { Calendar }
