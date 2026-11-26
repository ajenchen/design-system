/**
 * @internal — Calendar 月檢視的事件版面:資料語意、長條判定、車道、切段、「+N」計數、格內排序的唯一實作(純函式)。
 *
 * 不進任何出口(元件資料夾的 index 只轉出口 .tsx;root barrel 不收元件資料夾的 .ts),只給 Calendar 自己讀。
 * 格陣、「+N」清單、詳情都消費這一份,不得各算一份(meta-patterns M37:同一個 k、同一個排序、同一份旗標)。
 *
 * ── 消費的 SSOT ──
 * - spec refs: calendar.spec.md「資料語意」「跨日長條」「格內排序」「每格筆數與「+N」」、Cell 規則「隱藏週末」、「禁止事項」(不重造 date math)
 * - date math: date-fns(addHours / isBefore / startOfDay / subMilliseconds / differenceInCalendarDays)—— 逐日一律日曆日,不寫固定毫秒
 * - i18n: Intl.Collator(標題排序,依 locale memo)
 * - 慣例: 開發期警告寫法同 select-menu.tsx(`process.env.NODE_ENV !== 'production'` + `console.warn('[元件名] …')`)
 *
 * ── 輸入用結構型別 ──
 * 只讀 `CalendarLayoutEvent` 那四個欄位,不 import calendar.tsx(免循環 import);Calendar 的 `CalendarEvent` 天生符合,
 * 泛型 `E` 把原物件原樣帶回去(畫事件列、開詳情要用整筆)。
 *
 * ── 時區 ──
 * 一律以瀏覽器本地時間分日。第一段不開 `timeZone`【AI 推導】:只改時間字、不改分格會出現「時間寫 7/14 晚上、畫在 7/15 那格」,
 * 依 calendar.spec.md「四種檢視」那條「未實作的能力不預佔 API」等第二段一起定;本檔也不預留轉換參數。
 *
 * ── 判定表 ──
 * scripts/test-calendar-layout.mjs(每條規則一格以上的判定表 + `--selftest` 每條規則一個突變,各自必紅)。
 */
import { addHours, differenceInCalendarDays, isBefore, startOfDay, subMilliseconds } from 'date-fns'

// ── 型別 ─────────────────────────────────────────────────────────────────────────────

/** 版面只讀這四個欄位。`end` 一律不含(calendar.spec.md「資料語意」;RFC 5545 §3.6.1 DTEND non-inclusive)。 */
export interface CalendarLayoutEvent {
  readonly title: string
  readonly start: string | Date
  readonly end: string | Date
  readonly allDay?: boolean
}

/** 'bar' = 長條(全天,或有時段且滿 24 小時,可橫跨多格);'timed' = 只畫在開始那天(有時段、未滿 24 小時,含過夜)。 */
export type CalendarEventKind = 'bar' | 'timed'

/**
 * 正規化後的一筆事件:每筆只解析一次,格陣、「+N」清單、詳情共用(`normalizeEvents` 產生)。
 * 時間戳(`*Ms`)只拿來比大小(calendar.spec.md「禁止事項」允許 hot path 用原生 timestamp 比較);天數一律 `differenceInCalendarDays`。
 */
export interface NormalizedCalendarEvent<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  /** 原物件(原樣帶回) */
  readonly event: E
  /** 開始那一刻 */
  readonly start: Date
  /** 結束那一刻(不含)。`start` 晚於 `end` 的異常資料已正規化成 `end = start`(零長度)。 */
  readonly end: Date
  /** 推斷後的全天:有寫 `allDay` 照寫的;沒寫時兩端都是「只有日期」的字串才算全天,Date 物件不推斷 */
  readonly allDay: boolean
  readonly kind: CalendarEventKind
  /** 畫在哪一天起(本地午夜) */
  readonly firstDay: Date
  /** 畫到哪一天(含,本地午夜)。'timed' = firstDay;零長度 = firstDay */
  readonly lastDay: Date
  readonly firstDayMs: number
  readonly lastDayMs: number
  /** firstDay 到 lastDay 的日曆天數(≥ 1)—— 格內排序「長的在上」量的就是它 */
  readonly dayCount: number
}

/**
 * 一段事件(格陣裡畫出來的一塊,或「+N」清單裡的一列)的延續資訊;`renderEventTile` 的第二個參數(calendar.spec.md「第一段實作範圍」)。
 * 五個欄位的定義【AI 推導】(規格只列了名字):
 *
 * | 欄位 | 為真的意思 | 給誰用 |
 * |---|---|---|
 * | `isStart` | 這一段含事件**真正的第一天** | 開頭那端圓角;為假 = 斷開端,一律直角(Q3(定)) |
 * | `isEnd` | 這一段含事件**真正的最後一天** | 結尾那端圓角;為假 = 斷開端,一律直角 |
 * | `continuesBefore` | 事件在**可見範圍之前**就開始了(格陣 = 看得見的第一天之前;清單 = 這一天之前) | 畫「延續自畫面外」(calendar.spec.md「跨日長條」換週切段那條) |
 * | `continuesAfter` | 事件在**可見範圍之後**才結束 | 畫「延續到畫面外」 |
 * | `isSegmentRepeat` | 這不是事件在畫面上畫出來的第一段(閱讀順序:週由上而下、同週由左而右) → 標題是重複的 | 標題照畫(「第二段起重複標題」);自訂內容要分辨時用 |
 *
 * 關係:`continuesBefore` 為真時 `isStart` 必為假(`continuesAfter` / `isEnd` 同理);反過來不成立 ——
 * `isStart` 為假而 `continuesBefore` 為假 = 真起點在畫面上別處:上一週列、同一列被「+N」切掉的那幾格、或被藏起來的日子。
 * 斷開端(直角)看的是 `isStart` / `isEnd`,不看 `continuesBefore` / `continuesAfter`(後者只是斷開的一種)。
 * 被「+N」切開後剩下的片段一樣畫標題、`isSegmentRepeat` 為真【AI 推導:只剩色塊沒有標題的片段讀不出是哪件事】;
 * 「+N」清單裡每筆只出現一次,`isSegmentRepeat` 恆為假。
 */
export interface CalendarEventSegment {
  readonly isStart: boolean
  readonly isEnd: boolean
  readonly continuesBefore: boolean
  readonly continuesAfter: boolean
  readonly isSegmentRepeat: boolean
}

/** 格陣裡畫出來的一塊。DOM 放在 `startCol` 那一格,寬度橫跨 `span` 個看得見的日子(calendar.spec.md「跨日長條」實作備註)。 */
export interface CalendarLayoutPiece<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  readonly entry: NormalizedCalendarEvent<E>
  /** 第幾條車道(0 起)= 事件區第幾列;同一事件在同一週的每一塊車道相同 */
  readonly lane: number
  /** 從這一週第幾個看得見的日子開始(0 起) */
  readonly startCol: number
  /** 橫跨幾個看得見的日子(≥ 1) */
  readonly span: number
  readonly segment: CalendarEventSegment
}

export interface CalendarLayoutCell<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  readonly day: Date
  /** m = 這一格最高佔用的車道 + 1(沒有事件 = 0)。看車道、不看筆數(總帳更正 #7) */
  readonly rowsNeeded: number
  /** N:大於 0 時第 `maxRows` 列(車道 maxRows − 1)換成「+N」;0 = 不出現「+N」(含剛好放滿) */
  readonly moreCount: number
  /** 畫在這一格上的塊(含從左邊橫跨過來的長條),依車道由上而下 —— 格內鍵盤順序與「指標底下那一格」用 */
  readonly pieces: readonly CalendarLayoutPiece<E>[]
}

export interface CalendarWeekLayout<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  /** 這一週看得見的日子(本地午夜,輸入原樣的順序) */
  readonly days: readonly Date[]
  /** 這一週畫出來的塊,依 startCol、再依車道 */
  readonly pieces: readonly CalendarLayoutPiece<E>[]
  readonly cells: readonly CalendarLayoutCell<E>[]
}

export interface CalendarMonthLayout<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  readonly weeks: readonly CalendarWeekLayout<E>[]
  /** 實際用的 k(≥ 1;`Infinity` = 不限) */
  readonly maxRows: number
}

/** 「+N」清單的一列:這一天的一筆事件,與以「這一天」為範圍算的延續資訊 */
export interface CalendarDayListEntry<E extends CalendarLayoutEvent = CalendarLayoutEvent> {
  readonly entry: NormalizedCalendarEvent<E>
  readonly segment: CalendarEventSegment
}

// ── 解析(calendar.spec.md「資料語意」時區那條:三種字串格式分開解析)──────────────────────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

/** 「只有日期」的字串("YYYY-MM-DD")。Date 物件一律不是(它本身就是某一刻,看不出寫的人有沒有寫時刻)。 */
export function isDateOnlyString(value: string | Date): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value)
}

/**
 * 事件的 start / end → Date。
 * - "YYYY-MM-DD"(只有日期)= 不帶時區的那一天 → 本地午夜(不走 `new Date(str)`:原生把它當 UTC 午夜,西半球會掉到前一天)
 * - "YYYY-MM-DDTHH:mm[:ss[.SSS]]"(不帶 offset)= 本地時間 → 用本地欄位建構(不交給各家引擎猜)
 * - 其他(帶 offset 或 `Z` 的絕對時間)→ `new Date(str)`;解析不了 = Invalid Date(`normalizeEvents` 會跳過並警告)
 * - Date 物件 → 複製一份(不讓版面改到 consumer 的物件)
 */
export function parseEventDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getTime())
  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  const local = LOCAL_DATE_TIME.exec(value)
  if (local) {
    const [, y, mo, d, h, mi, s, ms] = local
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0), Number((ms ?? '0').padEnd(3, '0')))
  }
  return new Date(value)
}

// ── 長條判定(Q7(定))──────────────────────────────────────────────────────────────────

/**
 * 標全天(一天或多天)→ 長條;有時段且**滿 24 小時** → 長條;未滿 24 小時(含過夜、午夜結束)→ 只畫在開始那天【Q7(定)】。
 * 「滿 24 小時」量實際經過的時間(`addHours` 加的是 24 個真實小時):日光節約那天的 00:00 → 隔天 00:00 只有 23 小時,不算長條;
 * 不可改成「加一個日曆日」(那是 24 ± 1 小時)。
 */
export function classifyEvent(start: Date, end: Date, allDay: boolean): CalendarEventKind {
  if (allDay) return 'bar'
  return !isBefore(end, addHours(start, 24)) ? 'bar' : 'timed'
}

// ── 正規化 ─────────────────────────────────────────────────────────────────────────────

/**
 * 每筆事件解析一次;異常資料照 calendar.spec.md「資料語意」處理並在開發期警告:
 * - `start` 晚於 `end` → 當成開始那一刻的零長度事件,畫在開始那天
 * - 全天事件 `end` 與 `start` 是同一刻(多半還在用「含」的資料)→ 警告;當零長度、畫在開始那天【AI 推導:比照上一條】
 * - start / end 解析不了 → 這筆不畫【AI 推導:沒有日子可放】
 *
 * 涵蓋的日子 = 與 [start, end) 有交集的每一天(end 不含,所以 22:00 → 隔天 00:00 只碰到開始那天);零長度 = 開始那天。
 * 'timed' 不論涵蓋幾天都只畫在開始那天。回傳順序 = 輸入順序(排序交給 `createEventComparator`)。
 */
export function normalizeEvents<E extends CalendarLayoutEvent>(events: readonly E[]): NormalizedCalendarEvent<E>[] {
  const out: NormalizedCalendarEvent<E>[] = []
  for (const event of events) {
    const start = parseEventDate(event.start)
    let end = parseEventDate(event.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Calendar] 事件「${event.title}」的 start / end 解析不了(收 "YYYY-MM-DD"、"YYYY-MM-DDTHH:mm"、帶 offset 或 Z 的時間、Date),這一筆不畫。`)
      }
      continue
    }
    const allDay = event.allDay ?? (isDateOnlyString(event.start) && isDateOnlyString(event.end))
    if (isBefore(end, start)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Calendar] 事件「${event.title}」的 start 晚於 end,先當成開始那一刻的零長度事件、畫在開始那天。`)
      }
      end = start
    } else if (allDay && end.getTime() === start.getTime()) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Calendar] 全天事件「${event.title}」的 end 與 start 相同:end 一律不含(RFC 5545),一天的全天事件 end 要寫隔天(例 start "2026-07-20"、end "2026-07-21")。先當成零長度、畫在開始那天。`)
      }
    }
    const kind = classifyEvent(start, end, allDay)
    const firstDay = startOfDay(start)
    const lastDay = kind === 'timed' || end.getTime() === start.getTime() ? firstDay : startOfDay(subMilliseconds(end, 1))
    out.push({
      event, start, end, allDay, kind, firstDay, lastDay,
      firstDayMs: firstDay.getTime(),
      lastDayMs: lastDay.getTime(),
      dayCount: differenceInCalendarDays(lastDay, firstDay) + 1,
    })
  }
  return out
}

// ── 格內排序(calendar.spec.md「格內排序」)──────────────────────────────────────────────────

const collators = new Map<string, Intl.Collator>()

/** 標題排序用的 Collator,依 locale 只建一次(建構子貴,排序時每次比較都會用到)。 */
export function getTitleCollator(locale: string): Intl.Collator {
  let collator = collators.get(locale)
  if (collator === undefined) {
    collator = new Intl.Collator(locale)
    collators.set(locale, collator)
  }
  return collator
}

/**
 * 同一天由上而下:(1) 開始日期早的在上;(2) 同一天開始的,長的在上(跨日長條因此在上);(3) 全天在有時段之前;
 * (4) 依開始時間;(5) 最後依標題(`locale` 的 Collator)。都一樣時維持輸入順序(Array#sort 穩定)。
 * 車道分配與「+N」清單用同一支【AI 推導】。
 */
export function createEventComparator(locale: string) {
  const collator = getTitleCollator(locale)
  return (a: NormalizedCalendarEvent, b: NormalizedCalendarEvent): number =>
    a.firstDayMs - b.firstDayMs ||
    b.dayCount - a.dayCount ||
    Number(b.allDay) - Number(a.allDay) ||
    a.start.getTime() - b.start.getTime() ||
    collator.compare(a.event.title, b.event.title)
}

// ── 月格版面 ───────────────────────────────────────────────────────────────────────────

interface Placement<E extends CalendarLayoutEvent> {
  readonly entry: NormalizedCalendarEvent<E>
  readonly lane: number
  /** 這一週涵蓋的第一個 / 最後一個看得見的欄(含) */
  readonly from: number
  readonly to: number
}

/** 最低的空車道:這條車道在 from…to 每一欄都還空著(calendar.spec.md「跨日長條」車道分配那條) */
function lowestFreeLane(occupied: boolean[][], from: number, to: number): number {
  for (let lane = 0; ; lane++) {
    const row = occupied[lane]
    if (row === undefined) return lane
    let free = true
    for (let col = from; col <= to; col++) {
      if (row[col]) {
        free = false
        break
      }
    }
    if (free) return lane
  }
}

/**
 * 一週的車道分配:依格內排序逐筆放進「它涵蓋的每一天都還空著」的最低車道,同一事件在這一週只有一條車道。
 * 只看得見的日子算數:只落在被藏日子(隱藏週末)的事件不佔車道、不畫(calendar.spec.md Cell 規則「隱藏週末」)。
 */
function placeWeek<E extends CalendarLayoutEvent>(dayMs: readonly number[], sorted: readonly NormalizedCalendarEvent<E>[]): Placement<E>[] {
  const occupied: boolean[][] = []
  const placements: Placement<E>[] = []
  const weekFirst = dayMs[0]
  const weekLast = dayMs[dayMs.length - 1]
  for (const entry of sorted) {
    if (entry.lastDayMs < weekFirst || entry.firstDayMs > weekLast) continue
    let from = 0
    while (from < dayMs.length && dayMs[from] < entry.firstDayMs) from++
    let to = dayMs.length - 1
    while (to >= 0 && dayMs[to] > entry.lastDayMs) to--
    if (from > to) continue
    const lane = lowestFreeLane(occupied, from, to)
    const row = (occupied[lane] ??= [])
    for (let col = from; col <= to; col++) row[col] = true
    placements.push({ entry, lane, from, to })
  }
  return placements
}

/**
 * 月格版面。
 * - `weeks`:每一週列**看得見的日子**(隱藏週末時已濾掉),依日期排序 —— 與格陣畫的同一份清單,不在這裡另判一次哪天被藏。
 *   相鄰兩欄差超過一天 = 中間有被藏的日子:長條在那裡切段(週五收、週一起,兩端直角)。
 * - `maxRows`:k = 一格放得下幾列(calendar.spec.md「每格筆數與「+N」」的算式由 Calendar 量格高後算好傳進來,本檔不量格高);
 *   小於 1 或 NaN 一律當 1,`Infinity` = 不限(全部畫)。
 * - `events`:`normalizeEvents` 的結果(格陣與「+N」清單共用同一份)。
 *
 * 每一格 m = 最高佔用車道 + 1:m ≤ k 全畫;m > k → 車道 0…k−2 照畫、第 k 列換「+N」、N = 這一格車道 ≥ k−1 的筆數
 *(那一列在這一格本來空著時 N = 1,有事件時 N ≥ 2)。同一條長條在放得下的格照畫、在溢出那格被「+N」取代(逐格切),
 * 被切開的那一端是斷開端。
 */
export function layoutMonth<E extends CalendarLayoutEvent>(options: {
  weeks: readonly (readonly Date[])[]
  events: readonly NormalizedCalendarEvent<E>[]
  maxRows: number
  locale: string
}): CalendarMonthLayout<E> {
  const k = Number.isNaN(options.maxRows) ? 1 : Math.max(1, Math.floor(options.maxRows))
  const sorted = [...options.events].sort(createEventComparator(options.locale))
  // 可見範圍 = 第一個看得見的日子 … 最後一個看得見的日子(continuesBefore / continuesAfter 的界線)
  const visible = options.weeks.flat()
  const rangeFirstMs = visible.length > 0 ? startOfDay(visible[0]).getTime() : 0
  const rangeLastMs = visible.length > 0 ? startOfDay(visible[visible.length - 1]).getTime() : 0
  const drawnBefore = new Set<NormalizedCalendarEvent<E>>()

  // 輸出的週與輸入一一對應(空的週照樣回一筆空版面,索引不錯位)
  const layouts = options.weeks.map((week): CalendarWeekLayout<E> => {
    if (week.length === 0) return { days: [], pieces: [], cells: [] }
    const days = week.map((day) => startOfDay(day))
    const dayMs = days.map((day) => day.getTime())
    // 與左邊那一欄是不是相連的日子(中間沒有被藏的日子)
    const joinsPrevious = days.map((day, col) => col > 0 && differenceInCalendarDays(day, days[col - 1]) === 1)
    const placements = placeWeek(dayMs, sorted)

    const rowsNeeded = days.map(() => 0)
    for (const p of placements) {
      for (let col = p.from; col <= p.to; col++) rowsNeeded[col] = Math.max(rowsNeeded[col], p.lane + 1)
    }
    const isDrawn = (col: number, lane: number) => rowsNeeded[col] <= k || lane <= k - 2

    const pieces: CalendarLayoutPiece<E>[] = []
    const emit = (p: Placement<E>, a: number, b: number) => {
      const isSegmentRepeat = drawnBefore.has(p.entry)
      drawnBefore.add(p.entry)
      pieces.push({
        entry: p.entry,
        lane: p.lane,
        startCol: a,
        span: b - a + 1,
        segment: {
          isStart: dayMs[a] === p.entry.firstDayMs,
          isEnd: dayMs[b] === p.entry.lastDayMs,
          continuesBefore: p.entry.firstDayMs < rangeFirstMs,
          continuesAfter: p.entry.lastDayMs > rangeLastMs,
          isSegmentRepeat,
        },
      })
    }
    for (const p of placements) {
      let runStart = -1
      for (let col = p.from; col <= p.to; col++) {
        if (!isDrawn(col, p.lane)) {
          if (runStart !== -1) emit(p, runStart, col - 1)
          runStart = -1
          continue
        }
        if (runStart !== -1 && !joinsPrevious[col]) {
          emit(p, runStart, col - 1)
          runStart = -1
        }
        if (runStart === -1) runStart = col
      }
      if (runStart !== -1) emit(p, runStart, p.to)
    }
    pieces.sort((x, y) => x.startCol - y.startCol || x.lane - y.lane)

    const cells = days.map((day, col): CalendarLayoutCell<E> => ({
      day,
      rowsNeeded: rowsNeeded[col],
      moreCount: rowsNeeded[col] > k ? placements.filter((p) => p.from <= col && col <= p.to && p.lane >= k - 1).length : 0,
      pieces: pieces.filter((piece) => piece.startCol <= col && col < piece.startCol + piece.span).sort((x, y) => x.lane - y.lane),
    }))
    return { days, pieces, cells }
  })
  return { weeks: layouts, maxRows: k }
}

// ── 「+N」清單(一天)────────────────────────────────────────────────────────────────────

/**
 * 這一天的全部事件(含格內已畫出來的),順序同格內排序;延續資訊以「這一天」為範圍算兩端
 *(這一天之前 / 之後還有 = 斷開端,一律直角;calendar.spec.md「「+N」清單浮層」內容那段)。
 */
export function layoutDay<E extends CalendarLayoutEvent>(options: {
  day: Date
  events: readonly NormalizedCalendarEvent<E>[]
  locale: string
}): CalendarDayListEntry<E>[] {
  const dayMs = startOfDay(options.day).getTime()
  return options.events
    .filter((entry) => entry.firstDayMs <= dayMs && dayMs <= entry.lastDayMs)
    .sort(createEventComparator(options.locale))
    .map((entry) => ({
      entry,
      segment: {
        isStart: entry.firstDayMs === dayMs,
        isEnd: entry.lastDayMs === dayMs,
        continuesBefore: entry.firstDayMs < dayMs,
        continuesAfter: entry.lastDayMs > dayMs,
        isSegmentRepeat: false,
      },
    }))
}
