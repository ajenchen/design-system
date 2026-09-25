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
  addDays,
  addMonths,
  subMonths,
  startOfDay,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { CAT_EVENT, CAT_ACCENT, type CategoricalHue } from '@/design-system/tokens/categorical-color'
import { Button } from '@/design-system/components/Button/button'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { useTruncated } from '@/design-system/hooks/use-truncated'

/**
 * Calendar — 月事件檢視 canvas
 *
 * 定位:看事件的 page-level canvas,對齊 Notion Calendar / Google Calendar。
 * 完整 spec 見 `calendar.spec.md`。
 *
 * ── Layout Family ──
 * 非 4-Family,屬 page-composite(多區塊 Toolbar + Grid + EventTile)。
 *
 * ── Implemented scope ──
 * 月 view(toolbar / grid / event tile / today highlight / outside days)。未實作的
 * week/day/size/drag 能力不預佔公開 prop 或 disabled control。
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

export interface CalendarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** 聚焦日期(月 view 的那個月) */
  referenceDate?: Date
  defaultReferenceDate?: Date
  onReferenceDateChange?: (date: Date) => void
  /**
   * 「今天」的時間來源。預設為呼叫端當下時間；傳入可讓 SSR、測試與視覺快照完全
   * deterministic。此值同時擁有 today highlight、Today button target，以及未提供
   * referenceDate/defaultReferenceDate 時的初始月份。
   */
  today?: Date

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

  className?: string

  /** locale(預設 'en-US') */
  locale?: string

  /** ARIA labels for chrome controls. Override for i18n. */
  prevAriaLabel?: string
  nextAriaLabel?: string
  /** 月份導覽 <nav> landmark 的 aria-label。Override for i18n. */
  navAriaLabel?: string
  todayLabel?: string
  /** 「新事件」CTA 文字。Override for i18n。CTA 僅在傳 `onCreateEvent` 時渲染(spec Toolbar 段)。 */
  createLabel?: string
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
  if (value instanceof Date) return value
  // date-only ISO("YYYY-MM-DD")用本地午夜建構,不走 new Date(str)。
  // 原因:`new Date('2026-06-15')` 按 UTC 午夜解析,而 eventsByDate 分桶以本地
  // getFullYear/Month/Date 讀取 → 負 UTC 時區(西半球)的 all-day 事件被移到前一天
  // (真實 timezone bug)。手動 split 建本地 Date,與分桶的本地讀取一致。
  // 含時間的字串(YYYY-MM-DDTHH:mm,無 offset)ES 規範本就以本地解析,走原生 new Date()。
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value)
  if (dateOnly) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

// eventsOnDate(per-cell 全 events 掃描)已由 eventsByDate bucketing memo 取代並移除
// (2026-07-06 D3 perf;留著會觸發 noUnusedLocals TS6133)。

// ── Component ──────────────────────────────────────────────────────────────

const MAX_TILES_PER_CELL = 3

// 「同一天」的唯一鍵。eventsByDate 分桶與 grid 焦點都用它,兩邊不得各寫一式。
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

// 預設事件 tile 抽出 component:截斷 tooltip 需 useTruncated(hook 不能在 map callback 內)。
// 截斷 → tooltip 顯完整標題(tooltip.spec.md:32,僅實際截斷時);tile 是 interactive host
// (role=button,hover 直達)→ trigger = tile 本體、量測內層文字 span — useTruncated 自組
// pattern(truncated-text.spec.md「trigger 需自控」指定解;範本 inline-edit.tsx:251 + tag.tsx)。
function MonthEventTile({
  event,
  colorClass,
  onEventClick,
}: {
  event: CalendarEvent
  colorClass: string
  onEventClick?: (event: CalendarEvent) => void
}) {
  const { ref: truncationRef, isTruncated } = useTruncated<HTMLSpanElement>({ deps: [event.title] })
  return (
    // 恆 wrap、未截斷 open={false} 靜默(truncated-text.spec.md always-wrap:條件 wrap 會 remount 丟 RO 訂閱)
    <Tooltip open={isTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        <div
          role="button"
          // 2026-09-24:tile 從 tabIndex=0 改 -1。role="grid" 要求整個格陣只有一個 Tab 停靠點
          //(W3C APG Grid Pattern「only one element in the entire grid is included in the tab sequence」),
          // 原本一個月 35 格 × (1 日期鈕 + 3 tile) 是幾十個停靠點 = 與 grid 語意相反。
          // tile 改由格內導覽抵達(日期鈕按 F2 進格、Escape 出格),詳 calendar.spec.md「A11y 預設」。
          tabIndex={-1}
          data-calendar-tile=""
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
            colorClass,
          )}
        >
          <span ref={truncationRef} className="block truncate">{event.title}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{event.title}</TooltipContent>
    </Tooltip>
  )
}

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(function Calendar({
  referenceDate: referenceDateProp,
  defaultReferenceDate,
  onReferenceDateChange,
  today: todayProp,
  events = [],
  onEventClick,
  onDateClick,
  onCreateEvent,
  weekStartsOn = 0,
  renderEventTile,
  className,
  locale = 'en-US',
  prevAriaLabel = '上個月', // i18n-allow: DS default; consumer override via prevAriaLabel prop
  nextAriaLabel = '下個月', // i18n-allow: DS default; consumer override via nextAriaLabel prop
  navAriaLabel = '行事曆月份導覽', // i18n-allow: DS default; consumer override via navAriaLabel prop
  todayLabel = '今天', // i18n-allow: DS default; consumer override via todayLabel prop
  createLabel = '新事件', // i18n-allow: DS default; consumer override via createLabel prop
  ...props
}, ref) {
  const resolvedToday = todayProp ?? new Date()
  // Controlled / uncontrolled refDate
  const [internalRef, setInternalRef] = React.useState<Date>(
    () => new Date((defaultReferenceDate ?? resolvedToday).getTime()),
  )
  const refDate = referenceDateProp ?? internalRef
  const setRefDate = React.useCallback(
    (next: Date) => {
      if (referenceDateProp === undefined) setInternalRef(next)
      onReferenceDateChange?.(next)
    },
    [referenceDateProp, onReferenceDateChange],
  )

  // Build month grid
  const days = React.useMemo(() => {
    const monthStart = startOfMonth(refDate)
    const monthEnd = endOfMonth(refDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [refDate, weekStartsOn])

  // 2026-07-06 D3 perf:formatter 依 locale memo(對齊 weekdayNames 既有做法),避免每 render 重建
  // Intl.DateTimeFormat(已知貴的 constructor);.format(refDate) 每 render 仍執行(cheap)。
  const monthTitleFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }),
    [locale],
  )
  const monthTitle = monthTitleFormatter.format(refDate)

  const weekdayNames = React.useMemo(() => {
    // 取 `days[0..6]` 的名字(gridStart 開始 7 天,正好一週)
    return days.slice(0, 7).map((d) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d),
    )
  }, [days, locale])

  // 2026-07-06 D3 perf:原每 render 對 42 cells 各跑 eventsOnDate 全 events filter = O(42×N) +
  // 每比較配 ~5 個 Date;數百-上千 events(行事曆真實規模)單次 render 數十 ms,且父層任何 re-render
  // 全額重付。改 useMemo 單趟 bucket:每 event 只 parse 一次,展開 [start..end](clamp 到可見 grid,
  // 避免長跨度 event 展開爆量)寫入 date→events Map,順便完成 allDay 排序。cell 內改 O(1) map.get。行為 Δ=0。
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (days.length === 0) return map
    const first = days[0]
    const last = days[days.length - 1]
    const gridStart = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime()
    const gridEnd = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime()
    for (const e of events) {
      const start = coerceDate(e.start)
      const end = coerceDate(e.end)
      const eEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
      let sMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
      if (eEnd < gridStart || sMs > gridEnd) continue // 可見窗外對 42 cells 無貢獻
      if (sMs < gridStart) sMs = gridStart
      const lastMs = Math.min(eEnd, gridEnd)
      const cursor = new Date(sMs)
      while (cursor.getTime() <= lastMs) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`
        const bucket = map.get(key)
        if (bucket) bucket.push(e)
        else map.set(key, [e])
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    // allDay 排前(對齊 Google Calendar 全天列在上;V8 stable sort 保 events 原序 → 與舊 per-cell 一致)
    for (const bucket of map.values()) {
      bucket.sort((a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false))
    }
    return map
  }, [events, days])

  // ── Grid 鍵盤(APG Data Grid;2026-09-24 補實作)───────────────────────────
  // 本元件宣告 role="grid" 就必須真的實作那套鍵盤 —— 只寫角色不接方向鍵 = 對輔助科技的空頭承諾
  //(SSOT:`ds-canonical/references/keyboard-model-canonical.md`「鐵律」)。按鍵表的逐字出處與
  // 每一條的取捨理由寫在 `calendar.spec.md`「A11y 預設」,此處不重述第二份。
  //
  // 模型 = roving tabindex(不是 aria-activedescendant):格內那顆日期 <button> 是真焦點,
  // SR 因此會報「按鈕」。APG 逐字:「A cell contains one widget whose operation does not require
  // arrow keys and grid navigation keys set focus on that widget. Examples of such widgets include
  // link, button, ...」;參考實作 APG Date Picker Dialog 的 setFocusDay() 也是 dayNode.tabIndex = -1 /
  // 命中日 = 0。
  const gridRef = React.useRef<HTMLDivElement | null>(null)
  const pendingFocusIso = React.useRef<string | null>(null)
  const [focusedDateState, setFocusedDateState] = React.useState<Date | null>(null)

  // Tab 進來時停在哪一天:今天在這個月就是今天,否則這個月 1 號
  //(APG Date Picker Dialog 範例:「If no date has been selected, places focus on the current date.」)。
  const anchorDate = React.useMemo(
    () => (isSameMonth(resolvedToday, refDate) ? startOfDay(resolvedToday) : startOfMonth(refDate)),
    [resolvedToday, refDate],
  )
  // 已畫出來的日期範圍(含上/下月 outside day —— 本元件的 outside day 是有事件、可點的真格,
  // 與 APG 範例把 outside day 清空 disable 的做法不同,所以「跨月」的界線是格陣邊界而非月份邊界)。
  const gridFirstMs = days.length > 0 ? startOfDay(days[0]).getTime() : 0
  const gridLastMs = days.length > 0 ? startOfDay(days[days.length - 1]).getTime() : 0
  const isRendered = React.useCallback(
    (date: Date) => {
      const ms = startOfDay(date).getTime()
      return ms >= gridFirstMs && ms <= gridLastMs
    },
    [gridFirstMs, gridLastMs],
  )
  // 停靠點恆為「畫得出來的那一天」:換月後掉出格陣的舊值自動回落 anchor,
  // 保證任何一刻**剛好一顆**日期鈕 tabIndex=0(不會 0 顆,也不會 2 顆)。
  const focusedDate = focusedDateState !== null && isRendered(focusedDateState) ? focusedDateState : anchorDate

  // 換月那一步的目標鈕是下一次 render 才存在,所以焦點在 render 後、paint 前補上。
  React.useLayoutEffect(() => {
    const iso = pendingFocusIso.current
    if (iso === null) return
    pendingFocusIso.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-calendar-day="${iso}"]`)?.focus()
  })

  const moveFocusToDay = React.useCallback(
    (next: Date) => {
      const target = startOfDay(next)
      setFocusedDateState(target)
      // 落在已畫出來的格(含 outside day)→ 月份不動;掉出格陣才換月,
      // 換完月它必定被畫出來 → 「跨月移動時焦點落到正確的那一天」恆成立。
      if (!isRendered(target)) setRefDate(target)
      pendingFocusIso.current = format(target, 'yyyy-MM-dd')
    },
    [isRendered, setRefDate],
  )

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const cell = target?.closest<HTMLElement>('[role="gridcell"]')
    if (!target || !cell) return
    const tile = target.closest<HTMLElement>('[data-calendar-tile]')

    // ── 格內模式:grid navigation 已停用,方向鍵改在格內的 widget 之間走 ──
    // APG「Editing and Navigating Inside a Cell」逐字:「Right Arrow or Down Arrow: If the cell
    // contains multiple widgets, moves focus to the next widget inside the cell」/「Escape: restores
    // grid navigation.」
    if (tile) {
      const tiles = Array.from(cell.querySelectorAll<HTMLElement>('[data-calendar-tile]'))
      const index = tiles.indexOf(tile)
      let nextNode: HTMLElement | null | undefined
      switch (event.key) {
        case 'Escape':
        case 'F2':
          nextNode = cell.querySelector<HTMLElement>('[data-calendar-day]')
          break
        case 'ArrowDown':
        case 'ArrowRight':
          nextNode = tiles[Math.min(index + 1, tiles.length - 1)]
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          nextNode = tiles[Math.max(index - 1, 0)]
          break
        default:
          return
      }
      event.preventDefault()
      event.stopPropagation()
      nextNode?.focus()
      return
    }

    const dayValue = target.getAttribute('data-calendar-day')
    if (dayValue === null) return

    // F2 = 進格(APG:「F2: ... If the cell contains one or more widgets, places focus on the first
    // widget.」)。不用 Enter 當進格鍵,因為在月曆格陣裡 Enter 已經是「啟用這一天」——
    // APG Date Picker Dialog 的 Date Grid 把 Space/Enter 指派給選日期。兩者都是 APG 明文列的
    // 慣例,這裡取不會互相蓋掉的那一組。
    if (event.key === 'F2') {
      const firstTile = cell.querySelector<HTMLElement>('[data-calendar-tile]')
      if (firstTile === null) return
      event.preventDefault()
      event.stopPropagation()
      firstTile.focus()
      return
    }

    const current = coerceDate(dayValue)
    let next: Date
    switch (event.key) {
      case 'ArrowRight':
        next = addDays(current, 1)
        break
      case 'ArrowLeft':
        next = addDays(current, -1)
        break
      case 'ArrowDown':
        next = addDays(current, 7)
        break
      case 'ArrowUp':
        next = addDays(current, -7)
        break
      case 'Home':
        next = startOfWeek(current, { weekStartsOn })
        break
      case 'End':
        next = endOfWeek(current, { weekStartsOn })
        break
      case 'PageUp':
        // date-fns addMonths 溢位自動夾到當月最後一天,正好等於 APG 的
        //「If that day does not exist, moves focus to the last day of the month.」
        next = addMonths(current, event.shiftKey ? -12 : -1)
        break
      case 'PageDown':
        next = addMonths(current, event.shiftKey ? 12 : 1)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    moveFocusToDay(next)
  }

  const handleToday = () => setRefDate(new Date(resolvedToday.getTime()))
  const handlePrev = () => setRefDate(subMonths(refDate, 1))
  const handleNext = () => setRefDate(addMonths(refDate, 1))

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col w-full h-full bg-surface rounded-md border border-divider overflow-hidden',
        className,
      )}
      {...props}
    >
      {/* Toolbar:[◀] [今天] [▶]  title  [+ new] */}
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
          {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md「截斷 → tooltip,僅實際截斷時顯示」)——
              窄 toolbar 下標題被裁掉沒有補救路徑。display="block":h2 是 block container。 */}
          <TruncatedText display="block">{monthTitle}</TruncatedText>
        </h2>

        {onCreateEvent && (
          <Button variant="primary" size="sm" startIcon={Plus} onClick={onCreateEvent}>
            {createLabel}
          </Button>
        )}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-divider bg-muted">
        {weekdayNames.map((name, i) => (
          <div
            key={i}
            // 2026-09-07 修(user 抓「為何星期標題要用那麼淺的顏色?」):
            // 原本是 `text-caption text-fg-muted font-normal`(12px / 45% 灰 / 細體)。
            // **DS 早就有 canonical 而且方向相反** —— `date-grid.spec.md:151`「Weekday header canonical」
            //(2026-05-03 user audit):`text-foreground text-body font-medium`,理由是
            // 「weekday 列標跟 caption 同視覺權重,都屬 calendar header 區,**不弱化**」,
            // 而且明文「**撤銷 v3 用 `fg-secondary font-normal` 的 mistake(M23)**」。
            // Calendar 這版比那個已被撤銷的版本**還弱**,是漂移不是設計選擇
            //(calendar.spec.md 沒有另訂星期排版,所以那條是唯一 canonical)。
            // 在本元件內也是孤例:月份標題 `text-body-lg font-medium`、日期數字 `text-body font-medium`,
            // 只有星期標題是 12px 細灰。
            className="px-2 py-1.5 text-body text-foreground font-medium text-center"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Month grid:7 cols, ~5-6 rows。a11y(2026-04-25):WAI-ARIA grid 要求 row > gridcell
          階層,chunk days 7 一組,wrap 成 role='row'(display:contents 保 CSS grid 佈局)。 */}
      <div
        ref={gridRef}
        className="grid grid-cols-7 flex-1 min-h-0"
        role="grid"
        aria-label={`月行事曆,${monthTitle}`}
        // grid navigation 掛在格陣上(事件委派):日期鈕與事件方塊都在這棵子樹裡,
        // 焦點在哪一層由 handler 自己判,不必每顆鈕各掛一份 handler。
        onKeyDown={handleGridKeyDown}
      >
        {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
          <div key={rowIdx} role="row" style={{ display: 'contents' }}>
            {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((date) => {
              const inMonth = isSameMonth(date, refDate)
              const isToday = isSameDay(date, resolvedToday)
              // 2026-06-01 allDay:全天事件排 cell 頂端(對齊 Google Calendar 全天列在上)——
              // 排序已在 eventsByDate bucketing memo 內完成(D3 perf),cell 內 O(1) 查表
              const dayEvents = eventsByDate.get(dayKey(date)) ?? []
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
                // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
                // 非當月格**不加底色**(2026-09-25 user 選「可以，拿掉底色」):它跟當月格一樣可點(onDateClick = 在這天新增),
                // 底色一律透明,所以滑過與當月格同一個滑過色。先前的 `bg-muted` 是「不可操作」的 token,放在可點的格上
                // 讓滑過反而變淺(淺 #F5F5F5 → #FAFAFA)。非當月只靠日期數字的淡字區分,見下方日期鈕與 spec「Outside day cell」。
                'hover:bg-neutral-hover',
              )}
            >
              {/* Date number = keyboard 入口。24px 圓盒的來源是**今天 pill 本身就是 24 高**,平日跟齊
                  → 跨 cell 數字落在同一條光學基線。**不是**因為某條最小點擊尺寸 —— 先前這裡寫的
                  「WCAG 2.5.8 ≥24」已於 2026-09-24 撤回:本 DS 以滑鼠精度為前提,不拿觸控尺寸建議當依據
                  (owner = `ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)。
                  命中與懸停的相等關係成立在 **cell** 這一層:懸停回饋是整格的 `hover:bg-neutral-hover`
                  (上方 gridcell 的 className),而整格 div 的 onClick 就是同一個 onDateClick → 懸停形狀 ≡ 命中區。
                  這顆鈕本身沒有任何 hover 樣式(實測掃全部 stylesheet:0 條 :hover 規則命中它),
                  平日底色恆為透明,所以它不是另一個獨立目標,而是同一個目標的鍵盤入口 + 焦點框幾何;
                  它完全落在宿主格內、動作與宿主相同,不會生出隱形帶也搶不走別人的點擊。
                  實測(1280×900,md,團隊行事曆 story):平日鈕盒 24.00×24.00、背景 rgba(0,0,0,0)、
                  數字字面 6.58×17;今天鈕 31.30×24.00(px-2)、bg-info;格 178×155.80,
                  hover 前後格底色 rgba(0,0,0,0) → oklch(0 0 0 / 0.02),鈕底色兩次都是透明。
                  規格 → `calendar.spec.md`「Cell 規則」的「命中區」條 */}
              <div className="flex items-start justify-end">
                <button
                  type="button"
                  aria-label={`${format(date, 'yyyy-MM-dd')},${dayEvents.length} 個事件`}
                  // roving tabindex:整個格陣只有這一顆(= 目前焦點日)進 Tab 序列,其餘 -1。
                  // APG Date Picker Dialog 逐字:「only one button in the calendar grid is in the Tab sequence」。
                  data-calendar-day={format(date, 'yyyy-MM-dd')}
                  tabIndex={isSameDay(date, focusedDate) ? 0 : -1}
                  // 焦點用任何方式落到某一天(Tab 進來 / 滑鼠點 / 程式化)都把停靠點同步過去,
                  // 免得下次 Tab 回來停在別天。
                  onFocus={() => setFocusedDateState(date)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDateClick?.(date)
                  }}
                  className={cn(
                    // 焦點框往外(= 不寫)。2026-09-10 重量:日期數字鈕(24×24)在格子裡是**置中**的,不是撐滿 ——
                    // 上 6 / 下 4(下方是同格的事件容器)/ 左 128 / 右 7,最小 4.00 = canonical「算放得下」。
                    // 2026-09-07 那句「往外會壓到隔壁格」量的是**格子**邊界不是鈕的鄰居;真正貼邊的是事件方塊
                    //(彼此 gap-0.5 = 2px),那一處仍然往內(見下方 :435)。
                    'inline-flex items-center justify-center min-w-6 h-6 rounded-full text-body font-medium',
                    isToday && 'px-2 bg-info text-on-emphasis',
                    // 非當月 = 淡字 `fg-muted`,**不是** `fg-disabled`:這天照樣可點,只是不在焦點月份
                    //(同 DateGrid「鄰月日子」的淡字,date-grid.spec.md outside 列;disabled 字色留給真的不可操作)。
                    !isToday && !inMonth && 'text-fg-muted',
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
                        role="button"
                        // 與內建 tile 同一條:grid 單一 Tab 停靠點,自訂 tile 也不得自己是停靠點
                        tabIndex={-1}
                        data-calendar-tile=""
                        aria-label={`事件:${event.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(event)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            onEventClick?.(event)
                          }
                        }}
                        // 內描邊:事件方塊之間 gap-0.5(2px),往外 +2px 會壓到上下相鄰的方塊
                        className="rounded-md focus-visible:focus-ring-inset"
                      >
                        {renderEventTile(event)}
                      </div>
                    )
                  }
                  return (
                    <MonthEventTile
                      key={event.id}
                      event={event}
                      colorClass={colorClass}
                      onEventClick={onEventClick}
                    />
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
  // 'active' 移除 — 日期格按壓視覺屬 DateGrid(其 meta 已 −active);nav 按壓屬內嵌 Button(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-neutral-hover', 'bg-info', 'bg-surface'],
    fg: ['text-fg-muted', 'text-foreground'],
    ring: ['focus-ring-inset', '--ring'],
  },
} as const

export { Calendar }
