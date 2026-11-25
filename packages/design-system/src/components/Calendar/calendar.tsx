// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { escapeLayerProps, isEscapeForControl } from '@/design-system/lib/overlay-escape'
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
  getWeek,
  isSameWeek,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { CAT_EVENT, CAT_SUBTLE, CAT_ACCENT, CAT_EVENT_NEUTRAL, type CategoricalColor } from '@/design-system/tokens/categorical-color'
import { Button } from '@/design-system/components/Button/button'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { useTruncated } from '@/design-system/hooks/use-truncated'
import {
  DEFAULT_DATE_LOCALE,
  resolveFirstWeekMinDays,
  resolveWeekend,
  resolveWeekStartsOn,
  type WeekStartsOn,
} from '@/design-system/lib/date-locale'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { Skeleton } from '@/design-system/components/Skeleton/skeleton'
import { CALENDAR_GEOMETRY_STYLE, CALENDAR_NARROW_COLUMN_MAX_PX, calendarPieceWidth, calendarRowsThatFit } from './calendar-geometry'
import { layoutMonth, normalizeEvents, parseEventDate, type CalendarEventSegment, type CalendarLayoutPiece } from './calendar-layout'

/**
 * Calendar — 月事件檢視 canvas
 *
 * 定位:看事件的 page-level canvas,對齊 Notion Calendar / Google Calendar。
 * 完整 spec 見 `calendar.spec.md`。
 *
 * ── Layout Family ──
 * 非 4-Family,屬 page-composite(多區塊 Toolbar + Grid + EventTile)。
 *
 * ── 消費的 SSOT ──
 * - components: [Button, ScrollArea(格陣捲動區), Tooltip, Tag(列高,經 calendar-geometry.ts), Skeleton(載入中每格一條,skeleton.spec.md:64、:86-87)]
 * - patterns: [header-canonical(工具列 = ChromeHeader), element-anatomy/truncated-text]
 * - tokens: [--chrome-header-height, --tag-height-md(h-tag-md / min-w-tag-md), --divider, --muted, --info, --neutral-hover,
 *   --fg-secondary / --foreground(有時段事件的時間 / 標題【TIMECOLOR(定)】), --font-body-size(色條高 = 字高【BAR(定)】), --radius-sm(色條圓頭,radius.css 短邊 ≤ 10px),
 *   categorical-color.ts(長條 CAT_EVENT / 唯讀 CAT_SUBTLE / 色條 CAT_ACCENT;neutral CAT_EVENT_NEUTRAL)]
 * - 幾何常數: ./calendar-geometry.ts(格內所有空隙、文字內距、色條寬、格最小高、週數欄寬、窄寬度門檻、每格列數 k 的算式、跨日長條的寬;元件內變數 --calendar-*)
 * - 時間字: Intl.DateTimeFormat(locale, eventTimeFormat ?? { hour: 'numeric', minute: '2-digit' })(calendar.spec.md「資料語意」時間顯示;zh-TW「上午10:00」)
 * - 事件版面: ./calendar-layout.ts(資料語意、長條判定、車道、切段、「+N」計數、格內排序、CalendarEventSegment 的唯一實作;本檔不另算)
 * - spec refs: calendar.spec.md「工具列」「Cell 規則」(隱藏週末 / 週數欄)「間距」「焦點框」「狀態與邊界案例」(載入中)「窄寬度」「A11y 預設」;
 *   header-canonical.spec.md:26 / :68 / :73;tag.spec.md「尺寸」;focus-canonical.md「問題二」;
 *   lib/date-locale.ts(週起始日 resolveWeekStartsOn、週末 resolveWeekend、第一週天數 resolveFirstWeekMinDays);週數 = date-fns getWeek
 * - 讀屏字串: `labels`(CalendarLabels,下方「讀屏字串」段;寫法同 BulkActionBar / AgentDecisionCard 的 `labels`);
 *   日期停靠點名稱 = Intl `dateStyle: 'full'` + 筆數(calendar.spec.md「A11y 預設」),今天加 aria-current="date" 與前綴(同 DateGrid「今天,」)
 * - 滑過與命中: color.spec.md「Hover 換色配對總則」「巢狀滑過」、hit-area-canonical.md「一、可以操作的東西」第 1 條(滑過有樣式變化的位置,按下去必須觸發它)、
 *   motion.spec.md「hover 回饋不做過渡」;
 *   格子滑過 = 屬性 data-hovered(同 DataTable 列滑過 / DateGrid 的「用屬性而不是 React state」),指標底下那一格才亮(「格子的滑過」段)
 * - 格內鍵盤: keyboard-model-canonical.md「焦點放在格上還是格裡的控件上,以及進格用什麼鍵」Calendar 列、「焦點所在的控件自己那一層也算一層」(lib/overlay-escape.ts)
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
  /**
   * 開始:"YYYY-MM-DD"(只有日期 = 那一天)、"YYYY-MM-DDTHH:mm"(不帶 offset = 本地時間)、帶 offset / `Z` 的絕對時間,或 Date
   *(calendar.spec.md「資料語意」;解析的唯一實作 calendar-layout.ts `parseEventDate`)。
   */
  start: string | Date
  /**
   * 結束,**一律不含**(同 iCalendar DTEND,calendar.spec.md「資料語意」):7/20–7/22 三天的全天事件寫 start '2026-07-20'、end '2026-07-23';
   * 10:00–11:00 寫 end '…T11:00'。2026-11-25 前全天事件的 end 是「含」(寫 '2026-07-22'),舊資料要加一天;
   * 全天事件 end 與 start 相同時開發期警告、當成零長度畫在開始那天。
   */
  end: string | Date
  /** 全天。沒寫時兩端都是只有日期的字串("YYYY-MM-DD")才當全天;Date 物件不推斷,要全天就明寫 `true`。 */
  allDay?: boolean
  /**
   * 事件類別色:12 個類別色相(1:1 對 `--color-{hue}-*`)或 `'neutral'`(不屬於任何類別,例:全公司的假日)。**消費 categorical-color SSOT**,
   * 與 Tag / Avatar 共用同一組色相;neutral 的長條 / 色條在 `CAT_EVENT_NEUTRAL`(calendar.spec.md「事件的兩種長相」)。沒傳 = blue。
   * 2026-11-25 前只收 12 色相(`CategoricalHue`);在 `renderEventTile` 裡拿 `event.color` 去查 12 色相的表(例 `CAT_SUBTLE[event.color]`)的,
   * 要先處理 `'neutral'`。2026-06-04 修:原 `orange` 與 `red` 都誤接 deep-orange;改消費 SSOT 後 orange→`--color-orange-*`、red→`--color-red-*`
   *(品牌紅 hue 25),各自獨立。
   */
  color?: CategoricalColor
  /**
   * 只有這一筆唯讀(例:可點的團隊月曆裡的公司假日):不是按鈕、不亮、不進格內導覽,點了什麼都不發生(也不在這天新增)。
   * 整個月曆的事件都唯讀用 `readOnlyEvents`(calendar.spec.md「日期格與事件方塊:可點或唯讀」單筆事件那一列【AI 推導】)。
   */
  readOnly?: boolean
  metadata?: Record<string, unknown>
}

/**
 * `renderEventTile` 的第二個參數:這一段事件的延續資訊(五個欄位的定義見 calendar-layout.ts `CalendarEventSegment`)。
 * isStart / isEnd = 這一段含事件真正的第一 / 最後一天(為假 = 斷開端,直角);continuesBefore / continuesAfter = 事件延續到可見範圍之前 / 之後;
 * isSegmentRepeat = 不是畫面上第一段(第二段起標題重複)。
 */
export type { CalendarEventSegment }

// ── 日期格 / 事件方塊:可點或唯讀(2026-09-26,待辦總帳 L8 / C15;calendar.spec.md「日期格與事件方塊:可點或唯讀」)──
// 兩者各自二擇一,由型別層逼出來 —— 不拿「回調有沒有傳」當渲染閘(meta-patterns M23(f)):
//   可點(預設)= 必傳回調;長成可點的樣子(按鈕、滑過換色、手形游標、Enter / Space)。
//   唯讀      = 寫 `readOnlyDates` / `readOnlyEvents`、**不可以**傳回調;不是按鈕、滑過不變、游標不變。
// 先前(2026-09-25 批次)把兩個回調改成無條件必填,等於規定月曆一定可點,與「沒有新增功能的月曆格子不亮」相反(C15),已撤回。
// 命名:沿用 DS 既有的 `readOnly`(Rating `readOnly`「唯讀:…不響應 hover / click / 鍵盤」、Field 家族 readonly 模式),
// 加上作用對象 —— 日期格與事件方塊是兩個獨立的點擊目標,要能分開宣告(內容排程月曆:事件點得開、日子不能點來新增)。

/** 日期格(整格 + 日期數字)可點與否。不單獨匯出:consumer 一律用 CalendarProps(root barrel 只列 CalendarProps / CalendarEvent)。 */
type CalendarDateCellProps =
  | {
      /** 日期格唯讀:不可點、不亮、日期數字不是按鈕;鍵盤仍可在格陣內走動(焦點改停在格子本身)。 */
      readOnlyDates?: false
      /** 點月 cell / 日期數字鈕回調(用於在這天新增)。日期格可點時**必填**:元件沒有內建的「新增」行為(spec「禁止事項」:不自動開表單)。 */
      onDateClick: (date: Date) => void
    }
  | {
      /** 日期格唯讀:不可點、不亮、日期數字不是按鈕;鍵盤仍可在格陣內走動(焦點改停在格子本身)。宣告了就不可以傳 `onDateClick`。 */
      readOnlyDates: true
      onDateClick?: never
    }

/** 事件方塊可點與否。同上,不單獨匯出;每一段事件的可點 / 唯讀由 Calendar 本體的 eventModeOf 依這一份(加上單筆 readOnly)決定。 */
type CalendarEventTileProps =
  | {
      /** 事件方塊唯讀:不可點、不亮、不是按鈕(只顯示事件,例如公司假日這類沒有詳情可開的標記)。 */
      readOnlyEvents?: false
      /**
       * 點 event tile 回調。事件方塊可點時**必填**:元件沒有內建的「打開事件」行為。
       * 第二個參數 `{ anchor }` = 被點的那一列 / 那一段(事件方塊的外層元素;跨日長條換週切開時是被點的那一段)—— 滑鼠點與格內導覽的
       * `Enter` / `Space` 都一樣(calendar.spec.md「API」`onEventClick={(event, { anchor }) => …}`、命中區表事件方塊列【總帳更正 #4】)。
       * 產品自己開詳情浮層時拿它當錨點(例:Popover 的 `PopoverAnchor virtualRef`)。不要改從 `document.activeElement` 反推:
       * 焦點所在的元素只是「剛好」常常是被點的那一段(程式化 `click()`、按下時不搬焦點的內容都會分開),anchor 直接就是被點的那一個。
       * 只收一個參數的寫法照樣能用。
       */
      onEventClick: (event: CalendarEvent, details: { anchor: HTMLElement }) => void
    }
  | {
      /** 事件方塊唯讀:不可點、不亮、不是按鈕(只顯示事件)。宣告了就不可以傳 `onEventClick`。 */
      readOnlyEvents: true
      onEventClick?: never
    }

// ── 讀屏字串(labels)────────────────────────────────────────────────────────
// calendar.spec.md「A11y 預設」「字串可覆寫」:元件裡的讀屏字串都從這一份取,預設繁中、逐鍵可覆寫(Partial 傳入、與預設合併),
// 元件裡不另寫死 aria-label。已有個別參數的字串(prevAriaLabel / nextAriaLabel / navAriaLabel / todayLabel / createLabel / moreLabel)
// 不收進來、照用那些參數(決策總帳 2026-11-25「labels 不收已有個別參數的字串」);事件、「+N」、清單與詳情的關閉等鍵隨各自的功能加進來
//(週數欄的兩個鍵 weekNumberHeader / weekNumber 2026-11-25 隨 showWeekNumbers 加進來)。
// 命名(AGENTS.md「命名 3 重 test」):(1) 本 DS 既有寫法 —— BulkActionBar `labels?: Partial<BulkActionBarLabels>`、AgentDecisionCard / Coachmark /
// FileViewer / ProfileCard 同一形狀;鍵名的「前 / 後綴」用 `…Prefix` / `…Suffix`(AgentDecisionCard `recommendedSuffix`、BulkActionBar `hiddenSuffix`);
// (2) 外部同名同義:Mantine Schedule `labels`(<https://github.com/mantinedev/mantine/blob/master/packages/@mantine/schedule/src/labels.ts>)、
// react-day-picker `labels`(格陣 `labelGrid`、日期鈕 `labelDayButton`,今天在完整日期前加「Today, 」:
// <https://github.com/gpbl/react-day-picker/blob/v9.14.0/src/labels/labelDayButton.ts#L25-L26>);
// (3) `todayLabel`(工具列「今天」鈕的字)是另一個字串:這裡的 `todayPrefix` 只接在日期停靠點名稱前面,兩者語意不同、不共用。

/** Calendar 的讀屏字串(全部可覆寫;`labels` 以 Partial 傳入、與 DS 預設合併)。 */
export interface CalendarLabels {
  /** 月格陣(`role="grid"`)的名稱。收到工具列標題同一份月份字(Intl `{ year: 'numeric', month: 'long' }`,zh-TW「2026年7月」)。 */
  grid: (monthTitle: string) => string
  /**
   * 日期停靠點的名稱 —— 日期格可點時是日期鈕的名稱,唯讀時是格子開頭只給讀屏的那段字(其後接格內的事件)。
   * 收到完整日期(Intl `dateStyle: 'full'`,zh-TW「2026年7月15日 星期三」;1 號畫面上寫「7月1日」不影響這裡)與這一天的事件筆數
   *(含格子放不下、沒畫出來的)。
   */
  day: (fullDate: string, eventCount: number) => string
  /** 今天的日期停靠點名稱前綴,接在 `day` 的結果前面(今天另帶 `aria-current="date"`)。 */
  todayPrefix: string
  /**
   * 週數欄(`showWeekNumbers`)的欄頭:看得見的字,也是欄頭(`columnheader`)的讀屏名稱(calendar.spec.md「Cell 規則」週數欄「欄頭「週」(`labels` 可換)」)。
   * 週數欄很窄(2 × 4 + 兩位數):覆寫時用一兩個字(例 'W'),長字會溢出到旁邊的星期欄。
   */
  weekNumberHeader: string
  /** 每一週週數格(`rowheader`)的讀屏名稱,收到週數(1–53);看得見的只有數字(calendar.spec.md「A11y 預設」週數欄的名稱由 `labels` 給【AI 推導】)。 */
  weekNumber: (week: number) => string
  /**
   * 可點的事件列 / 長條(含 `renderEventTile` 的外層)的讀屏名稱(calendar.spec.md「A11y 預設」事件列那條「{標題},{開始時間 或 起訖日期}{,全天}」【AI 推導】)。
   * 收到事件標題、`when` 與是否全天:`when` 在有時段(未滿 24 小時)的事件 = 開始時間(與畫面上的時間同一個格式,依 `locale` / `eventTimeFormat`,
   * zh-TW「上午10:00」);在長條(全天,或有時段且滿 24 小時)= 起訖日期(Intl `{ month: 'long', day: 'numeric' }`,一天 =「7月3日」、多天 =「7月20日 – 7月22日」,
   * 結束日是畫出來的最後一天)。唯讀的事件不命名(沒有角色,標題與時間就是它的文字內容)。
   */
  event: (title: string, when: string, allDay: boolean) => string
}

// i18n-allow: DS 預設文案(中文);consumer 經 `labels` 覆寫
const DEFAULT_LABELS: CalendarLabels = {
  // 2026-11-25 前寫死在格陣上
  grid: (monthTitle) => `月行事曆,${monthTitle}`,
  // 2026-11-25 前是「2026-07-15,N 個事件」(yyyy-MM-dd,不念星期、不分今天)
  day: (fullDate, eventCount) => `${fullDate},${eventCount} 個事件`,
  // 同 DateGrid 的日期鈕名稱(date-grid.tsx labelDayButton「今天,」前綴)
  todayPrefix: '今天,',
  // 2026-11-25 加(週數欄):欄頭「週」照規格字面;週數格念「第 27 週」(只念數字聽不出是週數)
  weekNumberHeader: '週',
  weekNumber: (week) => `第 ${week} 週`,
  // 2026-11-25 前寫死在事件方塊上「事件:{標題}」(只有標題,聽不到時間與日期)
  event: (title, when, allDay) => `${title},${when}${allDay ? ',全天' : ''}`,
}

interface CalendarOwnProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
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

  /**
   * 右上角「新事件」CTA 的回調 —— 全域新增入口,恆渲染;日期能不能新增由新增流程自己擋,不由這顆鈕的有無表達
   *(user 2026-09-29:「右上角那是全域新增，表示點了之後要先選了日期才能新增啊，那肯定會擋住不能新增的日期啊」)。
   * 元件沒有內建的「新增」行為,所以必填:meta-patterns M23(f)—— 固定元素不以 callback 有無當渲染閘、
   * 無內建 fallback 的 callback 必填。唯讀月曆(`readOnlyDates` / `readOnlyEvents`)一樣要傳。
   */
  onCreateEvent: () => void

  /**
   * 一週從哪天開始:0 = 週日 … 6 = 週六。有傳就用;沒傳時從 `locale` 推(CLDR 週資料;zh-TW 週日、en-GB / zh-CN 週一)——
   * 唯一實作 `lib/date-locale.ts` `resolveWeekStartsOn`,不讀 date-fns 語系物件(calendar.spec.md「資料語意」週起始日【WS(定)】)。
   */
  weekStartsOn?: WeekStartsOn

  /**
   * 隱藏週末(預設關;calendar.spec.md「Cell 規則」隱藏週末【Q10(定)】)。週末 = 語系的週末(`lib/date-locale.ts` `resolveWeekend`,
   * CLDR 週資料:zh-TW 週六、週日,en-IL 週五、週六)【AI 推導】;那幾欄不畫、星期列同步拿掉,只落在週末的事件不畫。
   * 鍵盤跳過被藏的日子(方向鍵 / Home / End / PageUp / PageDown 的落點、今天被藏時停在哪,見 calendar.spec.md「A11y 預設」【AI 推導】)。
   */
  hideWeekends?: boolean

  /**
   * 左側週數欄(預設關;calendar.spec.md「Cell 規則」週數欄【Q10(定)、Q10b(定)】)。週數 = 該週第一天的 date-fns `getWeek`,
   * 週起始日 = 本元件解析後的那一個、第一週至少幾天跟語系(`lib/date-locale.ts` `resolveFirstWeekMinDays`,CLDR `minDays`)——
   * 年底那一週 en-GB 是第 53 週、en-US 是第 1 週。週數格與欄頭不是操作目標(不進格陣的 Tab 停靠點,第一段不可點);字串在 `labels`。
   */
  showWeekNumbers?: boolean

  /**
   * 載入中(預設關;calendar.spec.md「狀態與邊界案例」載入中【Q11(定)】):工具列、星期列、日期數字照畫,每格的事件區換成一條與事件列同高的
   * `Skeleton`(不畫事件與「+N」);格陣 `aria-busy="true"`。點空白新增、鍵盤走格照常【AI 推導】;日期停靠點的讀屏名稱載入中不念筆數【AI 推導】。
   */
  loading?: boolean

  /**
   * 工具列月份標題的標題層級(預設 `'h2'`)。字樣不隨層級變(`text-body-lg font-medium`,header-canonical.spec.md「Title typography」);
   * 只換文件大綱的層級,讓 Calendar 放在頁面上時接得上頁面自己的標題階層(calendar.spec.md「工具列」標題條)。
   * 命名:子部位前綴 `title` + 本 DS 既有的「換語意標籤」寫法 `as`(InlineEdit `as`,`inline-edit.tsx#InlineEditProps`)。
   */
  titleAs?: 'h1' | 'h2' | 'h3'

  /**
   * 自訂事件方塊的內容。每一段呼叫一次:跨日長條換週切開、被「+N」切開時,同一筆事件會收到好幾次,第二個參數 `segment` 說明這一段的
   * 延續(isStart / isEnd / continuesBefore / continuesAfter / isSegmentRepeat;畫延續或重複標題用)。
   * 外層(位置、寬、命中、按鈕角色、Enter / Space、阻止冒泡、焦點框)由本元件擁有;回傳的內容要放得進一列的高度(`--tag-height-md`,
   * 車道等距)、鋪滿外層、不可再巢狀按鈕或連結(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」「滑過責任歸屬」)。
   */
  renderEventTile?: (event: CalendarEvent, segment: CalendarEventSegment) => React.ReactNode

  className?: string

  /** locale(預設 'zh-TW' = DS 日期元件共用的 `DEFAULT_DATE_LOCALE`) */
  locale?: string

  /**
   * 事件開始時間的格式(`Intl.DateTimeFormat` 的選項,與 `locale` 一起用;傳了就整份取代預設,不合併)。
   * 預設 `{ hour: 'numeric', minute: '2-digit' }`:zh-TW「上午10:00」、en-US「10:00 AM」(calendar.spec.md「資料語意」時間顯示)。
   * 月格只顯示開始時間:有時段的事件在標題前、滿 24 小時的有時段長條在含真起點的那一段標題前;窄寬時不顯示(calendar.spec.md「窄寬度」(1))。
   * 事件的讀屏名稱用同一個格式(`labels.event` 收到的 `when`)。時區一律是瀏覽器的時區 —— 顯示用時區參數第二段再定(calendar.spec.md「API(第一段)」)。
   * 命名同 FullCalendar `eventTimeFormat`(<https://fullcalendar.io/docs/eventTimeFormat>)。
   */
  eventTimeFormat?: Intl.DateTimeFormatOptions

  /** ARIA labels for chrome controls. Override for i18n. */
  prevAriaLabel?: string
  nextAriaLabel?: string
  /** 月份導覽 <nav> landmark 的 aria-label。Override for i18n. */
  navAriaLabel?: string
  todayLabel?: string
  /** 「新事件」CTA 文字。Override for i18n。CTA 是 toolbar 的固定元素、恆渲染(spec Toolbar 段;`onCreateEvent` 必填)。 */
  createLabel?: string
  /**
   * 一格放不下時,最後一列「+N」的計數文字(收到的是這一格沒畫出來的筆數;每格放幾列依格高,calendar.spec.md「每格筆數與「+N」」)。
   * 預設 `+N more`;Override for i18n(同 `todayLabel` / `createLabel`)。2026-11-21 前寫死在元件裡、沒有 prop 可換,中文月曆裡只有這一句是英文。
   */
  moreLabel?: (count: number) => string
  /**
   * 讀屏字串(格陣名稱、日期停靠點名稱、今天的前綴),預設繁中、逐鍵可覆寫(calendar.spec.md「A11y 預設」字串可覆寫;鍵見 `CalendarLabels`)。
   * 上面那幾個已有個別參數的字串(‹ › 的名稱、月份導覽、「今天」、「新事件」、計數文字)照用那些參數,不在這裡。
   */
  labels?: Partial<CalendarLabels>
}

export type CalendarProps = CalendarOwnProps & CalendarDateCellProps & CalendarEventTileProps

// ── 事件的顏色(calendar.spec.md「事件的兩種長相」【C2】)──────────────────────────────────
// **消費 categorical-color SSOT**,與 Tag / Avatar 共用色相,key X 一律對 `--color-X-*`(1:1):
//   長條(全天 / 跨日)= CAT_EVENT(淡底 step-1 + 字 step-7 + 滑過 step-2);唯讀的長條 = CAT_SUBTLE(同底同字、**不帶滑過** ——
//   點了沒反應的東西不給滑過回饋,color.spec.md「Hover 換色配對總則」;待辦總帳 L8);
//   有時段 = 透明列 + 左側色條 CAT_ACCENT(step-6,只給顏色;寬由 calendar-geometry.ts 給);
//   neutral(不是色相)= CAT_EVENT_NEUTRAL 的同三鍵(--secondary 底 / --foreground 字 / --secondary-hover;色條 --color-neutral-9)。
// 2026-11-25 前全天事件是淡底 + 左側 3px 實心邊框(CAT_ACCENT 當時是 `border-l-[3px]`),有時段是淡底;現在色條只給有時段事件,
// 兩種都有色條就分不出來【AI 推導,calendar.spec.md 同表「前綴」列】。
// 色表在 MonthEventPiece 裡直接按名字取(不先包成物件再當 prop 傳下去):hover class 住在 .ts 的色表裡,scripts/hover-instant-invariant.mjs
// 靠名字追「帶著 hover class 的識別字」進到同一個 cn() —— 包一層 prop 就追不到,有人在那裡加 transition-colors 也不會紅。
/** 沒傳顏色 = blue(calendar.spec.md「CalendarEvent」下方);認不得的值(JS 或 `as` 繞過型別)也當沒傳,不畫成沒有底色的長條。 */
function resolveEventColor(color: CategoricalColor | undefined): CategoricalColor {
  if (color === 'neutral') return color
  return color !== undefined && Object.prototype.hasOwnProperty.call(CAT_EVENT, color) ? color : 'blue'
}

/** 事件開始時間的預設格式(calendar.spec.md「資料語意」時間顯示;zh-TW「上午10:00」)。`eventTimeFormat` 傳了就整份取代。 */
const DEFAULT_EVENT_TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

// ── Helpers ────────────────────────────────────────────────────────────────
// 日期字串解析、事件資料語意、長條、車道、切段、「+N」都在 ./calendar-layout.ts(唯一實作);2026-11-25 前本檔另有一份 coerceDate
// 與逐日分桶 eventsByDate(每格最多 3 筆、每涵蓋一天各畫一塊),月檢視事件版面那一包接上 calendar-layout.ts 時刪掉(M37:不留兩份)。

// ── 隱藏週末時的鍵盤落點(calendar.spec.md「A11y 預設」鍵盤表的 hideWeekends 那幾條【AI 推導】)──────────────
/** 不隱藏週末時的「週末」:空集合(每一天都看得見)。 */
const NO_HIDDEN_DAYS: ReadonlySet<number> = new Set()

/**
 * 從 `date` 起往 `step` 方向找第一個看得見的日子(含 `date` 自己)。逐日用 date-fns `addDays`(日曆日,不用固定毫秒)。
 * CLDR 的週末至多兩天、一週至少五天看得見 → 至多走 2 步;上限 7 只是防呆。
 */
function nearestShownDay(date: Date, step: 1 | -1, isShown: (day: Date) => boolean): Date {
  let day = date
  for (let i = 0; i < 7 && !isShown(day); i++) day = addDays(day, step)
  return day
}

/**
 * 元素在版面上的外框寬與高(border-box,含小數),不受祖先 transform 影響(calendar.spec.md「窄寬度」:斷點看欄寬;「每格筆數」:k 看格高)。
 * 不用 getBoundingClientRect():它量的是畫面上的視覺尺寸 —— 掛載當下祖先正在縮放(Dialog 開場 zoom-in-95,dialog.tsx:349;
 * Popover 同,popover.tsx:292)就量到縮小後的寬(欄寬 62 在 scale(0.95) 下量到 58.9 → 誤判成窄;格高同理會少算列數),縮放結束版面尺寸沒變、
 * ResizeObserver 不會再叫,旗標就一直錯。offsetWidth / offsetHeight 也是版面尺寸,但取整數,門檻附近會差半個 px。
 * getComputedStyle 的 width / height 是版面上的使用值(DS styles/base.css 全域 border-box → 就是外框);
 * 萬一 consumer 把 box-sizing 蓋成 content-box,把內距與框線加回去,量到的仍是外框。
 */
function layoutBorderBoxSize(el: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(el)
  const width = parseFloat(style.width)
  const height = parseFloat(style.height)
  if (style.boxSizing === 'border-box') return { width, height }
  return {
    width: width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth),
    height: height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
  }
}

// ── 指標底下是哪一格(格子的滑過、滑鼠點長條時的「進格那一天」)───────────────────────────────────────────
// 長條的 DOM 在它這一週第一個看得見的日子(calendar.spec.md「跨日長條」實作備註),所以「指標底下那一格」不能從 DOM 祖先找:
// 用 document.elementsFromPoint 取指標所在點由上到下的元素,長條蓋在格子上、它底下第一個 gridcell 就是指標所在那一格。
// POC(2026-11-25,團隊行事曆「Alex 休假」7/20–7/22 三段正中各量一次):elementsFromPoint 與「逐格比外框」都得到 7/20 / 7/21 / 7/22,
// CSS :hover 三次都亮 7/20;選 elementsFromPoint —— 週數欄、隱藏週末、捲動、祖先縮放都由瀏覽器的命中測試處理,不必自己算,
// 也較快(1000 次平均 0.010 vs 0.016 ms)。只認同一個格陣裡的格子(巢狀月曆或旁邊別的格陣不算)。

/** 由上到下的命中元素裡,第一個屬於這個格陣的格子 */
function gridcellIn(stack: Element[], grid: HTMLElement): HTMLElement | null {
  for (const el of stack) {
    if (el instanceof HTMLElement && el.getAttribute('role') === 'gridcell' && grid.contains(el)) return el
  }
  return null
}

/** 指標所在點底下的那一格(不論可不可點);沒有 = null */
function cellAtPoint(grid: HTMLElement, x: number, y: number): HTMLElement | null {
  return gridcellIn(grid.ownerDocument.elementsFromPoint(x, y), grid)
}

/**
 * 指標在這一點時該亮的那一格(calendar.spec.md「Cell 規則」命中區表)。「最上面的元素」= 捕獲指標的那個元素(captured;拖週列捲軸的滑塊時
 * Radix 把指標捕獲在滑塊上,瀏覽器的 :hover 也跟著它、不跟指標底下的格子),沒有捕獲時 = 命中測試最上面那一個。
 * 它不在這個格陣裡(浮層、提示蓋在上面)→ 沒有;
 * 它不在這個格陣的任何一格裡(週列的捲軸蓋在最右欄上;拖滑塊時指標漂到格子上)→ 沒有【P11 規格核對必修:捲軸不是格子,在捲軸上按下去是捲動、
 * 不會新增,底下那格亮著就違反 hit-area-canonical.md「一、可以操作的東西」第 1 條;改前的純 CSS :hover 不亮 —— 捲軸不是格子的子孫】;
 * 最上面是唯讀的一段(有 data-calendar-covers、沒有 data-calendar-tile)→ 沒有【總帳更正 #3:唯讀列上格子不亮 —— 點它什麼都不發生,
 * 同一條】;其餘(格內空白、日期鈕、可點的列 / 長條、「+N」)→ 指標所在那一格(可點的列上格子照亮,color.spec.md「巢狀滑過」【U6】)。
 * 「在不在格子裡」看最上面元素的祖先(長條的 DOM 在它第一格,照樣算在格子裡),「是哪一格」看命中測試(長條第 3 天那段 = 第 3 格)。
 */
function hoverTargetCell(grid: HTMLElement, x: number, y: number, captured: Element | null): HTMLElement | null {
  const stack = grid.ownerDocument.elementsFromPoint(x, y)
  const top = captured ?? stack[0]
  if (!top || !grid.contains(top)) return null
  const home = top.closest('[role="gridcell"]')
  if (!home || !grid.contains(home)) return null
  const piece = top.closest('[data-calendar-covers]')
  if (piece && !piece.hasAttribute('data-calendar-tile')) return null
  return gridcellIn(stack, grid)
}

/**
 * 今天剛好被藏時停靠點落在哪:同一週的下一個看得見的日子,這一週後面沒有了就前一個(週五後面只剩週末 → 週五)。
 * 「今天」鈕搬停靠點也走這一支。
 */
function shownDayNearToday(today: Date, isShown: (day: Date) => boolean, weekStartsOn: WeekStartsOn): Date {
  if (isShown(today)) return today
  const later = nearestShownDay(today, 1, isShown)
  return isSameWeek(later, today, { weekStartsOn }) ? later : nearestShownDay(today, -1, isShown)
}

// ── Component ──────────────────────────────────────────────────────────────

// ── 一段事件(格內一列,或跨格長條)────────────────────────────────────────────────────
// 外層 = 位置(車道 = 事件區第幾列)、寬(跨格長條畫過後面幾格)、命中、角色、鍵盤 —— 預設方塊與 renderEventTile 自訂方塊共用這一個外層
//(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」);裡面才是長相。

/** 一段事件可點(開事件)或唯讀(什麼都不發生)。唯讀 = readOnlyEvents 或這一筆的 readOnly,由 Calendar 本體的 eventModeOf 一支判斷。 */
type EventPieceMode = { readOnly: true } | { readOnly: false; onEventClick: (event: CalendarEvent, details: { anchor: HTMLElement }) => void }

interface MonthEventPieceShellProps extends React.HTMLAttributes<HTMLDivElement> {
  event: CalendarEvent
  segment: CalendarEventSegment
  /** 車道(0 起)= 事件區第幾列 */
  lane: number
  /** 這一段涵蓋的看得見的日子(yyyy-MM-dd,空白分隔):格內導覽依日子查這一段(長條的 DOM 只在第一格) */
  covers: string
  /** 跨格長條的寬(calendar-geometry.ts calendarPieceWidth);只在一格裡 = undefined */
  width: string | undefined
  /** 底下墊一層不透明的格子底(預設長相的長條,見 MonthEventPiece) */
  underlay: boolean
  mode: EventPieceMode
  /** 可點時的讀屏名稱(labels.event 的結果,Calendar 本體算好);唯讀時不用(沒有角色的元素禁止命名) */
  name: string
}

const MonthEventPieceShell = React.forwardRef<HTMLDivElement, MonthEventPieceShellProps>(function MonthEventPieceShell(
  { event, segment, lane, covers, width, underlay, mode, name, className, style, onClick, onKeyDown, children, ...rest },
  ref,
) {
  // 外形 = 事件列 = Tag md(calendar.spec.md「間距」【SPACING(定)】):高 h-tag-md(24)、rounded-md。
  // 斷開那一端直角【Q3(定)】:斷開 = 這一段不含事件真正的起點 / 終點(segment.isStart / isEnd 為假 —— 換週、可見範圍外、被「+N」切開、
  // 被藏起來的日子切開都是;calendar-layout.ts CalendarEventSegment 的定義)。只拿掉該端圓角,不新增箭頭等形狀。
  // relative:長條畫過後面幾格,後面的格子是它的兄弟、DOM 順序在後 —— 不定位時後畫的格子(含滑過底)會蓋在長條上、點擊也落到格子
  //(POC 實測:不定位時長條第 3 天那段的命中是第 3 格)。定位元素在同一層疊順序裡晚於所有不定位的格子,所以格子本身**不得**是定位元素。
  const shape = cn(
    'relative h-tag-md rounded-md',
    !segment.isStart && 'rounded-s-none',
    !segment.isEnd && 'rounded-e-none',
    // 不透明的格子底 = Calendar 根節點的 --surface 疊在頁面底 --canvas 上(兩層背景:surface 是圖層、canvas 是底色)。
    // 深色主題的類別淡底 step-1 與 --surface 都是半透明(primitives.css 深色 step-1..4 的 alpha 公式、semantic.css 深色 --surface),
    // 長條直接蓋在格線上會透出格線(研究 research3 BAR mock BARM-X1);墊這一層後,長條底下是跟格子一樣的底,格線被蓋掉。
    // 淺色主題兩者都不透明,畫面不變。消費既有 token,不另調顏色【AI 推導】。
    underlay && 'bg-canvas bg-[image:linear-gradient(var(--surface),var(--surface))]',
    className,
  )
  const placement = {
    ...rest,
    // 車道 = 事件區第幾列(事件區是 grid、列高 h-tag-md、列距 --calendar-gap),寬 = 這一段畫過的格數
    style: { ...style, gridRow: lane + 1, width },
    'data-calendar-covers': covers,
    'data-calendar-lane': lane,
  }
  if (mode.readOnly) {
    // 唯讀(readOnlyEvents 或單筆 readOnly):不是按鈕、不進格內導覽(沒有 data-calendar-tile,F2 找不到它)、游標不變(cursor-default 蓋掉可點格子的手形)。
    // 點它什麼都不發生 —— 阻止冒泡,不會變成在這天新增【總帳更正 #3】;長條的 DOM 在第一格,不阻止的話點第 3 天會在第 1 天新增。
    // 指標在它上面時格子也不亮(命中區表唯讀列「格子在它上面也不亮」):由 Calendar 本體的 hoverTargetCell 認「沒有 data-calendar-tile 的一段」。
    // 不寫 aria-label:沒有角色的 div 禁止命名(ARIA 1.2 generic 的 name prohibited),事件標題就是它的文字內容。
    return (
      <div
        ref={ref}
        {...placement}
        onClick={(e) => {
          onClick?.(e)
          e.stopPropagation()
        }}
        onKeyDown={onKeyDown}
        className={cn(shape, 'cursor-default')}
      >
        {children}
      </div>
    )
  }
  return (
    <div
      ref={ref}
      {...placement}
      role="button"
      // 2026-09-24:tile 從 tabIndex=0 改 -1。role="grid" 要求整個格陣只有一個 Tab 停靠點
      //(W3C APG Grid Pattern「only one element in the entire grid is included in the tab sequence」);
      // tile 改由格內導覽抵達(F2 進格、Escape 出格),詳 calendar.spec.md「A11y 預設」。
      tabIndex={-1}
      data-calendar-tile=""
      {...escapeLayerProps(true)}
      onClick={(e) => {
        onClick?.(e)
        // 阻止冒泡:點事件不會變成在這天新增【Q6(定)】;長條的 DOM 在它這一週第一個看得見的日子,冒泡會在錯的日子新增(calendar.spec.md「命中區」下方那段)
        e.stopPropagation()
        // anchor = 這一段的外層(被點的那一列 / 那一段;calendar.spec.md「API」【總帳更正 #4】)
        mode.onEventClick(event, { anchor: e.currentTarget })
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          mode.onEventClick(event, { anchor: e.currentTarget })
        }
      }}
      // 讀屏名稱 =「{標題},{開始時間 或 起訖日期}{,全天}」(calendar.spec.md「A11y 預設」事件列那條【AI 推導】;字串在 labels.event)。
      // 2026-11-25 前是「事件:{標題}」—— 聽不到時間與日期,格內兩筆同名事件分不出來。
      aria-label={name}
      // 焦點框往外(= 不寫 class,走全域 :focus-visible):四周最小淨空 = 列距 4、格子內距 4 ≥ 4(calendar.spec.md「焦點框」、focus-canonical.md「問題二」)。
      // 跨日長條同一條:框畫在整段外層上(calendar.spec.md「A11y 預設」格內那段「焦點框畫在整段上」;量測 calendar-month-invariant E4)。
      className={cn(shape, 'cursor-pointer')}
    >
      {children}
    </div>
  )
})

/**
 * 一段事件:預設長相或 renderEventTile 自訂內容,外層都是 MonthEventPieceShell。預設長相分兩種(calendar.spec.md「事件的兩種長相」【C2】):
 *   長條(全天,或有時段且滿 24 小時;版面 kind 'bar')= 類別淡底 + 標題(滿 24 小時的有時段長條在含真起點的那一段標題前加開始時間);
 *   有時段(未滿 24 小時;kind 'timed')= 透明列 + 左側色條 + 開始時間 + 標題。
 * 截斷 → tooltip 顯完整標題(tooltip.spec.md:32,僅實際截斷時);外層是 interactive host → trigger = 外層本體、量測內層文字 span ——
 * useTruncated 自組 pattern(truncated-text.spec.md「兩層架構(對齊世界級聯集)」;範本 inline-edit.tsx:257 + tag.tsx)。
 */
function MonthEventPiece({
  piece,
  covers,
  endsAtLastColumn,
  color,
  time,
  name,
  mode,
  renderEventTile,
}: {
  piece: CalendarLayoutPiece<CalendarEvent>
  covers: string
  /** 這一段的最後一格是這一列最右那一格(那格不畫右格線,寬度式子少扣一條) */
  endsAtLastColumn: boolean
  /** 這筆事件的顏色(resolveEventColor 解析過:沒傳 / 認不得 = blue) */
  color: CategoricalColor
  /** 畫在標題前的開始時間(已依 locale / eventTimeFormat 格式化);null = 這一段不畫時間(全天、長條的非起點段、窄寬) */
  time: string | null
  /** 可點時的讀屏名稱(labels.event) */
  name: string
  mode: EventPieceMode
  renderEventTile?: (event: CalendarEvent, segment: CalendarEventSegment) => React.ReactNode
}) {
  const { event } = piece.entry
  // 時間出現 / 消失(窄寬切換)也會改變文字寬,一起當重量的依據
  const { ref: truncationRef, isTruncated } = useTruncated<HTMLSpanElement>({ deps: [event.title, time] })
  const shell = {
    event,
    segment: piece.segment,
    lane: piece.lane,
    covers,
    width: calendarPieceWidth(piece.span, endsAtLastColumn),
    mode,
    name,
  }
  if (renderEventTile) {
    // 自訂內容:外層只 own 位置、命中與鍵盤,不畫滑過、不墊底(它不知道自訂內容的靜止底;calendar.spec.md「renderEventTile 的滑過責任歸屬」)。
    // 第二段起照樣呼叫,segment 帶這一段的延續資訊(isSegmentRepeat = 不是畫面上第一段)。
    // overflow-clip:自訂內容裁在這一段的外形裡(含圓角與斷開端直角)。格子只裁上下、不裁左右(讓長條畫過去),所以「別畫出這一段」由外層負責 ——
    // 回傳比一列高、或比這一段寬又不自己截斷的內容(例:不換行的長字),不裁的話會畫到下一列 / 隔壁格,而且外層是定位元素,
    // 下一列與隔壁格的點擊也被它接走(2026-11-25 規格核對實測:60 高的內容底 190、外層底 154;不換行內容右緣 1133、格右緣 907)。
    // 用 clip 不用 hidden:只裁不捲,外層不會變成捲動容器。外層自己的焦點框(全域 :focus-visible 的 outline)畫在外框外面,不受自己的 overflow 影響。
    // 只加在自訂內容這一支:預設長相的內層與外層同大小、同圓角,本來就不會畫出去;加了反而在圓角上再裁一次、四角各 2–3 個畫素變淡
    //(實測團隊行事曆角落畫素差最多 55 / 255),所以預設長相不加 —— 量測 scripts/calendar-month-invariant.mjs CT1–CT3。
    return <MonthEventPieceShell {...shell} underlay={false} className="overflow-clip">{renderEventTile(event, piece.segment)}</MonthEventPieceShell>
  }
  // 預設長相:事件列 = Tag md(calendar.spec.md「間距」【SPACING(定)】)—— text-body 14px font-normal,字左緣離列左緣 8(兩種長相同一條線)。
  // 被「+N」切開或換週切開的片段一樣畫標題【AI 推導:只剩色塊沒有標題的片段讀不出是哪件事;calendar-layout.ts CalendarEventSegment】。
  // 時間與標題是同一行文字(時間在前,中間隔一個格內空隙 4【AI 推導】):一起截斷、省略號只在行尾 —— 欄寬不夠時先吃標題,時間仍在;
  // 不拆成兩個各自截斷的盒子(那樣時間會被裁成半個字,或標題寬度歸零)。時間的元素帶 data-calendar-time、色條帶 data-calendar-accent(量測用)。
  const isBar = piece.entry.kind === 'bar'
  // 長條的色:可點 = CAT_EVENT(帶滑過 step-2),唯讀 = CAT_SUBTLE(不帶);neutral = CAT_EVENT_NEUTRAL 的同兩鍵。色條 = CAT_ACCENT / CAT_EVENT_NEUTRAL.accent。
  const barClass = color === 'neutral'
    ? (mode.readOnly ? CAT_EVENT_NEUTRAL.subtle : CAT_EVENT_NEUTRAL.event)
    : (mode.readOnly ? CAT_SUBTLE[color] : CAT_EVENT[color])
  const accentClass = color === 'neutral' ? CAT_EVENT_NEUTRAL.accent : CAT_ACCENT[color]
  const timeSpan = time === null ? null : (
    // 時間 text-fg-secondary、標題 text-foreground【TIMECOLOR(定)】(長條裡兩者都是類別字色 step-7,同一張表的左欄)
    <span data-calendar-time="" className={cn('me-[var(--calendar-gap)]', !isBar && 'text-fg-secondary')}>{time}</span>
  )
  return (
    // 恆 wrap、未截斷 open={false} 靜默(truncated-text.spec.md always-wrap:條件 wrap 會 remount 丟 RO 訂閱)。
    // 唯讀方塊照樣掛:截斷提示是「資訊揭露」,不是點擊回饋(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容。」不分可不可點)。
    <Tooltip open={isTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        <MonthEventPieceShell {...shell} underlay={isBar}>
          {isBar ? (
            // 長條(左欄):類別淡底 + 字 step-7,可點時滑過 step-2(CAT_EVENT)、唯讀不帶滑過(CAT_SUBTLE)【維持 U10】;不帶色條(色條只給有時段事件)。
            // 文字左右內距 8 用 Tag 的兩層結構表示(外層 4 + 文字 4,同 tag.tsx 的 size md 與 data-tag-text 那兩層),兩層都讀 --calendar-gap。
            // 顏色畫在內層(圓角跟外層 rounded-[inherit]):外層是長條墊底那一層(深色主題不透出格線),內層疊類別淡底與滑過。
            <div className={cn('flex items-center h-full rounded-[inherit] px-[var(--calendar-gap)] text-body font-normal', barClass)}>
              <span ref={truncationRef} className="min-w-0 truncate px-[var(--calendar-gap)]">{timeSpan}{event.title}</span>
            </div>
          ) : (
            // 有時段(右欄):透明列(permanent transparent,只在滑過 / 焦點時看得見 rounded-md 的形狀),可點時滑過 = 透明底的配對 --neutral-hover
            //(color.spec.md「Hover 換色配對總則」;瞬間切換、不做過渡【維持 U2】);唯讀不亮(游標由外層給)。
            // 左側色條佔 Tag 的「Tag px」那 4(寬 --calendar-accent-w,calendar-geometry.ts)、後接列內間隔 4(gap,=「Text px」)→ 字左緣 8,
            // 與長條同一條線(calendar.spec.md「間距」有時段的色條列;修 2026-11-25 前有色條的字右偏 3px)。
            // 色條 = 字高(--font-body-size,text-body 的字級 token)、上下置中(items-center)、圓頭(rounded-sm:radius.css「短邊 ≤ 10px 用 sm」,
            // 寬 4 的 2px 圓角 = 兩端半圓)【BAR(定)】;顏色 = 類別 step-6(CAT_ACCENT;neutral 是 --color-neutral-9)。裝飾,讀屏不念(aria-hidden)。
            <div className={cn('flex items-center h-full rounded-[inherit] gap-[var(--calendar-gap)] pe-[var(--calendar-text-inset)] text-body font-normal', !mode.readOnly && 'hover:bg-neutral-hover')}>
              <span aria-hidden data-calendar-accent="" className={cn('shrink-0 w-[var(--calendar-accent-w)] h-[var(--font-body-size)] rounded-sm', accentClass)} />
              <span ref={truncationRef} className="min-w-0 truncate text-foreground">{timeSpan}{event.title}</span>
            </div>
          )}
        </MonthEventPieceShell>
      </TooltipTrigger>
      <TooltipContent>{event.title}</TooltipContent>
    </Tooltip>
  )
}

/** `moreLabel` 的預設:與 2026-11-21 前寫死的字相同(預設不變;改預設文案是文案語意,不在這裡改) */
const defaultMoreLabel = (count: number) => `+${count} more`

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(function Calendar({
  referenceDate: referenceDateProp,
  defaultReferenceDate,
  onReferenceDateChange,
  today: todayProp,
  events = [],
  readOnlyEvents,
  onEventClick,
  readOnlyDates,
  onDateClick,
  onCreateEvent,
  weekStartsOn,
  hideWeekends = false,
  showWeekNumbers = false,
  loading = false,
  titleAs: TitleTag = 'h2',
  renderEventTile,
  className,
  locale = DEFAULT_DATE_LOCALE,
  eventTimeFormat,
  prevAriaLabel = '上個月', // i18n-allow: DS default; consumer override via prevAriaLabel prop
  nextAriaLabel = '下個月', // i18n-allow: DS default; consumer override via nextAriaLabel prop
  navAriaLabel = '行事曆月份導覽', // i18n-allow: DS default; consumer override via navAriaLabel prop
  todayLabel = '今天', // i18n-allow: DS default; consumer override via todayLabel prop
  createLabel = '新事件', // i18n-allow: DS default; consumer override via createLabel prop
  moreLabel = defaultMoreLabel,
  labels: labelsOverride,
  style,
  ...props
}, ref) {
  // 讀屏字串:DS 預設 + consumer 逐鍵覆寫(同 BulkActionBar 的合併寫法)
  const labels: CalendarLabels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsOverride }), [labelsOverride])
  // 可點與否只看明示的 readOnlyDates / readOnlyEvents(M23(f);型別層保證沒宣告唯讀時回調一定在,
  // 見 CalendarDateCellProps / CalendarEventTileProps)。
  const datesInteractive = !readOnlyDates
  // 「這一筆唯讀」只用這一支判斷(M37:直接量性質 = 整個月曆的事件唯讀 readOnlyEvents,或這一筆唯讀 event.readOnly):
  // 唯讀 = 不是按鈕、不亮、不進格內導覽、點了什麼都不發生(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。
  // 可點時回調一定在:CalendarEventTileProps 二擇一,readOnlyEvents 為假時型別層把 onEventClick 收窄成必有(M23(f) 不看回調在不在)。
  const eventModeOf = (event: CalendarEvent): EventPieceMode =>
    readOnlyEvents || event.readOnly ? { readOnly: true } : { readOnly: false, onEventClick }
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

  // 週起始日:有傳就用,沒傳從語系推(CLDR;lib/date-locale.ts 唯一實作,同 DatePicker / DateGrid)。
  // 格陣起訖、Home / End、星期列都讀這一個解析後的值,不各自再判一次。
  const resolvedWeekStartsOn = React.useMemo(() => resolveWeekStartsOn(locale, weekStartsOn), [locale, weekStartsOn])
  // 隱藏週末:週末 = 語系的週末(CLDR;lib/date-locale.ts resolveWeekend 唯一實作),0–6、週日 = 0,與 Date#getDay 同一套。
  // 星期列、週列、鍵盤落點都讀這一個 isShown,不各自再判一次。
  const hiddenDays = React.useMemo(() => (hideWeekends ? resolveWeekend(locale) : NO_HIDDEN_DAYS), [hideWeekends, locale])
  const isShown = React.useCallback((date: Date) => !hiddenDays.has(date.getDay()), [hiddenDays])
  // 週數:第一週至少幾天跟語系(CLDR minDays;lib/date-locale.ts resolveFirstWeekMinDays),週起始日用上面解析後的同一個值
  const firstWeekMinDays = React.useMemo(() => resolveFirstWeekMinDays(locale), [locale])

  // Build month grid
  const days = React.useMemo(() => {
    const monthStart = startOfMonth(refDate)
    const monthEnd = endOfMonth(refDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: resolvedWeekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: resolvedWeekStartsOn })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [refDate, resolvedWeekStartsOn])
  const weekCount = Math.ceil(days.length / 7)
  // 每一週:看得見的日子(隱藏週末時少那幾天)+ 週數(用這一週的第一天算,被藏的那天也算 —— 週數是整週的)。
  // 事件版面(車道、長條、切段)只吃看得見的日子:只落在被藏日子的事件不畫、不佔車道,跨過被藏日子的長條在那裡切段(calendar.spec.md「隱藏週末」)。
  const weeks = React.useMemo(
    () => Array.from({ length: weekCount }, (_, i) => {
      const all = days.slice(i * 7, i * 7 + 7)
      return {
        visibleDays: all.filter(isShown),
        number: showWeekNumbers ? getWeek(all[0], { weekStartsOn: resolvedWeekStartsOn, firstWeekContainsDate: firstWeekMinDays }) : null,
      }
    }),
    [days, weekCount, isShown, showWeekNumbers, resolvedWeekStartsOn, firstWeekMinDays],
  )

  // Intl.DateTimeFormat 的建構子貴:每個格式依 locale 各 memo 一次,render 時只呼叫 .format()(cheap)。
  // 2026-11-25 前星期名在 map 裡每一天 new 一個(稽核 D19-j),這裡的註解卻寫「已 memo」—— 已改成真的 memo。
  // 星期:看得見的字用 short(zh-TW「週日」),讀屏名稱用 long(「星期日」,calendar.spec.md「A11y 預設」columnheader 名稱用完整星期名);
  // narrow(「日」)給窄寬度(calendar.spec.md「窄寬度」)。1 號:{ month: 'short', day: 'numeric' }(zh-TW「7月1日」,Q15(定))。
  // 日期停靠點的讀屏名稱:{ dateStyle: 'full' }(zh-TW「2026年7月15日 星期三」,calendar.spec.md「A11y 預設」)。
  const formatters = React.useMemo(
    () => ({
      monthTitle: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }),
      weekdayShort: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
      weekdayLong: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
      weekdayNarrow: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }),
      monthDay: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
      fullDate: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }),
    }),
    [locale],
  )
  const monthTitle = formatters.monthTitle.format(refDate)
  // 事件的時間與日期(calendar.spec.md「資料語意」時間顯示、「A11y 預設」事件列名稱):同上,依 locale 與 eventTimeFormat 各 memo 一次。
  // eventTimeFormat 常是 consumer 每次 render 新寫的物件字面值 → 以內容(JSON)當相依,內容沒變就不重建 formatter。
  const eventTimeFormatKey = JSON.stringify(eventTimeFormat ?? DEFAULT_EVENT_TIME_FORMAT)
  const eventFormatters = React.useMemo(
    () => ({
      time: new Intl.DateTimeFormat(locale, JSON.parse(eventTimeFormatKey) as Intl.DateTimeFormatOptions),
      // 長條讀屏名稱的起訖日期(zh-TW「7月20日」);不用 formatRange:zh-TW 的區間會換成「7/20至7/22」數字樣式、與單日「7月3日」不一致(Node 24 實測)
      date: new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }),
    }),
    [locale, eventTimeFormatKey],
  )

  // 星期列:取 `days[0..6]`(格陣起點開始 7 天,正好一週),隱藏週末時同步拿掉那幾天
  const weekdays = React.useMemo(
    () => days.slice(0, 7).filter(isShown).map((d) => ({
      day: d.getDay(),
      short: formatters.weekdayShort.format(d),
      narrow: formatters.weekdayNarrow.format(d),
      long: formatters.weekdayLong.format(d),
    })),
    [days, formatters, isShown],
  )
  // 欄:週數欄(選用)+ 看得見的日子數。欄數會變(隱藏週末 5 欄),所以寫在 style:Tailwind 只掃得到字面上的 grid-cols-N。
  // 星期列與週列是兩個格陣容器(星期列在捲動區外),兩邊讀同一個字串 → 欄寬一致;週數欄寬 = --calendar-week-number-w(calendar-geometry.ts)。
  const gridTemplateColumns = `${showWeekNumbers ? 'var(--calendar-week-number-w) ' : ''}repeat(${weekdays.length}, minmax(0, 1fr))`

  // ── 量欄寬與格高(calendar.spec.md「窄寬度」:斷點看欄寬、不看視窗寬;「每格筆數與「+N」」:k 依格高)───────────────────
  // ResizeObserver 掛在週列格陣上;量一個日期格的外框(各週等高、各欄等寬,量一格就夠):寬 = 欄寬(含它自己的右格線),高 = 格高(含自己的底線)。
  // 欄是 minmax(0, 1fr)、列是 minmax(格最小高, 1fr):容器有高時兩者都只跟著容器走,不被內容撐 → 旗標與 k 不會來回跳。
  // 欄的組成(隱藏週末、週數欄)或週數(4–6 週)變了,格陣本身不一定變大小、觀察者不會叫,所以隨 gridTemplateColumns / weekCount 重掛並當場量一次。
  // useLayoutEffect:第一次量在畫面出來之前,窄容器不會先閃一下寬版的字、矮格子不會先畫出放不下的列。
  // 量版面尺寸、不量畫面尺寸,理由見 layoutBorderBoxSize(祖先縮放時 getBoundingClientRect 會少算)。
  // k 與上一次相同時 setState 不重畫(React 對同值 bail out)—— 容器高度在兩個整數 k 之間變動時元件不重畫。
  const weeksGridRef = React.useRef<HTMLDivElement | null>(null)
  const [columnWidth, setColumnWidth] = React.useState<number | null>(null)
  // 還沒量到(SSR / 第一次 render 之前)= 不限,全部畫出來
  const [maxRows, setMaxRows] = React.useState<number>(Infinity)
  React.useLayoutEffect(() => {
    const grid = weeksGridRef.current
    if (!grid) return
    const measure = () => {
      const cell = grid.querySelector<HTMLElement>('[role="gridcell"]')
      if (!cell) return
      const size = layoutBorderBoxSize(cell)
      setColumnWidth(size.width)
      // k 的算式住在 calendar-geometry.ts(與 CSS 讀同一批常數,M17);傳給 layoutMonth 的 maxRows 只有這一個來源
      setMaxRows(calendarRowsThatFit(size.height))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [gridTemplateColumns, weekCount])
  // 窄:星期縮一字、1 號只顯示「1」(有時段列拿掉時間在事件長相那一包接同一個旗標)。還沒量到(SSR / 第一次 render)= 寬版。
  const narrow = columnWidth !== null && columnWidth <= CALENDAR_NARROW_COLUMN_MAX_PX

  // 日期框裡的字:每月 1 號(含前後月溢出的那幾格)帶月份「7月1日」,其他日子只寫數字【Q15(定)】;窄的時候 1 號也只寫「1」【總帳更正 #8】。
  // 平日不走 Intl:zh-TW 的 { day: 'numeric' } 會出「1日」(實測),數字直接用 getDate()。
  const dayLabel = (date: Date) => (date.getDate() === 1 && !narrow ? formatters.monthDay.format(date) : String(date.getDate()))

  // 一段事件畫在標題前的時間與讀屏名稱(calendar.spec.md「事件的兩種長相」內容列、「資料語意」時間顯示、「A11y 預設」事件列):
  //   時間 = 開始時間,畫在有時段事件(kind 'timed')的標題前;滿 24 小時的有時段長條只畫在含真起點的那一段(segment.isStart)【AI 推導】;
  //   全天不畫;窄的時候都不畫(calendar.spec.md「窄寬度」(1);同一個 narrow 旗標)。
  //   名稱 = labels.event(標題, when, 全天):有時段 when = 開始時間(與畫面同一個格式),長條 when = 起訖日期(畫出來的第一天 – 最後一天,一天就一個日期);
  //   窄寬不影響名稱(同日期停靠點,讀屏名稱照舊)。
  const eventText = (entry: CalendarLayoutPiece<CalendarEvent>['entry'], segment: CalendarEventSegment) => {
    const startTime = eventFormatters.time.format(entry.start)
    const showsTime = !narrow && (entry.kind === 'timed' || (!entry.allDay && segment.isStart))
    const first = eventFormatters.date.format(entry.firstDay)
    const last = eventFormatters.date.format(entry.lastDay)
    const when = entry.kind === 'timed' ? startTime : first === last ? first : `${first} – ${last}`
    return { time: showsTime ? startTime : null, name: labels.event(entry.event.title, when, entry.allDay) }
  }

  // ── 事件版面(calendar.spec.md「資料語意」「跨日長條」「格內排序」「每格筆數與「+N」」;唯一實作 calendar-layout.ts)──────────
  // 每筆事件只解析一次(normalizeEvents;異常資料的開發期警告也在那裡);版面吃「看得見的日子」(隱藏週末時已濾掉 —— 只落在週末的事件不畫、
  // 不佔車道,跨過週末的長條在被藏的日子切段)與量到的 k。events / 週 / k 沒變就不重算(數百到上千筆的真實規模,父層重畫不重付)。
  const normalizedEvents = React.useMemo(() => normalizeEvents(events), [events])
  const monthLayout = React.useMemo(
    () => layoutMonth({ weeks: weeks.map((week) => week.visibleDays), events: normalizedEvents, maxRows, locale }),
    [weeks, normalizedEvents, maxRows, locale],
  )

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
  // 相依用「今天 00:00 的毫秒數」(primitive),不用 resolvedToday 物件:沒傳 `today` 時它每次 render 都是
  // 新的 new Date(),拿物件當相依 = memo 每次都重算(eslint exhaustive-deps 抓的就是這個)。
  // 不把 new Date() 包進 useMemo 凍在掛載時:行事曆分頁常掛好幾天,跨過午夜「今天」的 pill、Today 鈕目標
  // 都要在下一次 render 跟著走(react-day-picker 9.14 DayPicker.js:131 同樣每次 render 重取 today)。
  const todayDayMs = startOfDay(resolvedToday).getTime()
  // 隱藏週末時【AI 推導】:今天被藏 → 同一週下一個看得見的日子(沒有就前一個,shownDayNearToday);
  // 1 號被藏(落在週末)→ 1 號之後第一個看得見的日子(仍在這個月)。
  const anchorDate = React.useMemo(
    () => (isSameMonth(todayDayMs, refDate)
      ? shownDayNearToday(new Date(todayDayMs), isShown, resolvedWeekStartsOn)
      : nearestShownDay(startOfMonth(refDate), 1, isShown)),
    [todayDayMs, refDate, isShown, resolvedWeekStartsOn],
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
  // 停靠點恆為「畫得出來的那一天」:換月後掉出格陣的舊值、或剛被藏起來的日子(開了 hideWeekends)自動回落 anchor,
  // 保證任何一刻**剛好一顆**日期鈕 tabIndex=0(不會 0 顆,也不會 2 顆)。
  const focusedDate = focusedDateState !== null && isRendered(focusedDateState) && isShown(focusedDateState) ? focusedDateState : anchorDate

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

  // 一格的「日期停靠點」:日期格可點時是格內的日期數字鈕,唯讀時是格子本身(見下方 gridcell 的註解)。
  // 兩種都掛 `data-calendar-day`;querySelector 不含自己,所以先看格子本身。
  const dayStopOf = (cell: HTMLElement) =>
    cell.matches('[data-calendar-day]') ? cell : cell.querySelector<HTMLElement>('[data-calendar-day]')
  // 某一天的格內 widget(可點的事件列 / 長條),依車道由上而下。**依日子查,不只查格子自己的子孫**:跨日長條的 DOM 只放在它這一週
  // 第一個看得見的日子(calendar.spec.md「跨日長條」實作備註),從它涵蓋的其他日子進格也要走得到它(「A11y 預設」格內那段);
  // 每一段帶 data-calendar-covers(涵蓋的日子)與 data-calendar-lane(車道)。唯讀的列沒有 data-calendar-tile,不在裡面。
  const widgetsOfDay = (iso: string | null) => {
    const grid = gridRef.current
    if (!grid || iso === null) return []
    return Array.from(grid.querySelectorAll<HTMLElement>(`[data-calendar-tile][data-calendar-covers~="${iso}"]`))
      .sort((a, b) => Number(a.dataset.calendarLane) - Number(b.dataset.calendarLane))
  }
  // 某一天的日期停靠點(日期格可點 = 日期鈕、唯讀 = 格子本身;兩者都帶 data-calendar-day)
  const dayStopByIso = (iso: string) => gridRef.current?.querySelector<HTMLElement>(`[data-calendar-day="${iso}"]`) ?? null

  // ── 進格那一天(calendar.spec.md「A11y 預設」格內那段:Escape / F2 回到**進格那一天**的日期停靠點【AI 推導】)──────
  // 跨日長條的 DOM 只在它這一週第一個看得見的日子,從第 X 天 F2 進來的焦點落在那一格的 DOM 裡 —— 出格時不能照 DOM 找回去
  //(2026-11-25 前是 dayStopOf(焦點所在那一格),從第 3 天進格、按 Esc 回到第 1 天)。所以進格時把那一天記下來:
  //   鍵盤:F2(唯讀格的 Enter)從哪一天的停靠點進來;滑鼠:按在長條的哪一天那段(cellAtPoint,同滑過的命中)。
  // 只是記憶、不是狀態(不需要重畫)→ ref。讀的時候先驗:記下的日子不在焦點所在這一段涵蓋的日子裡(過期,例:程式化 focus 到別的方塊)
  // → 改用這一段的第一天,不會回到一個跟這個方塊無關的日子。
  const entryDayRef = React.useRef<string | null>(null)

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
      // 這一次是從哪一天進格的(見 entryDayRef);widget 順序與出格的落點都照那一天,不照方塊的 DOM 在哪一格
      const covers = tile.getAttribute('data-calendar-covers')?.split(' ') ?? []
      const entry = entryDayRef.current
      const day = entry !== null && covers.includes(entry) ? entry : covers[0] ?? null
      const tiles = widgetsOfDay(day)
      const index = tiles.indexOf(tile)
      // 出格:回進格那一天的停靠點(那一天沒畫出來 —— 例:進格後換了月 —— 才退回方塊所在那一格)
      const exitTo = () => (day !== null ? dayStopByIso(day) : null) ?? dayStopOf(cell)
      let nextNode: HTMLElement | null | undefined
      switch (event.key) {
        case 'Escape':
          // 格內模式是焦點所在控件自己的一層(方塊帶 data-escape-layer):放在 Dialog 裡第一下 Esc 只出格、不關對話框;
          // 這一下若已被 Radix 用來關掉別的浮層就不動(lib/overlay-escape.ts)
          if (!isEscapeForControl(event)) return
          nextNode = exitTo()
          entryDayRef.current = null
          break
        case 'F2':
          nextNode = exitTo()
          entryDayRef.current = null
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
    // widget.」)。日期格可點時不用 Enter 當進格鍵,因為在月曆格陣裡 Enter 已經是「啟用這一天」——
    // APG Date Picker Dialog 的 Date Grid 把 Space/Enter 指派給選日期。兩者都是 APG 明文列的
    // 慣例,這裡取不會互相蓋掉的那一組。
    // 日期格唯讀時焦點在格子本身、格子沒有主要動作 → Enter 也是進格(跨元件規則
    // `ds-canonical/references/keyboard-model-canonical.md`「`Enter` 恆為「啟動焦點上的東西」—— 焦點在格上時那就等於進格」,
    // 與 DataTable 檢視態儲存格同一條;不是另立的例外)。
    if (event.key === 'F2' || (event.key === 'Enter' && !datesInteractive)) {
      const firstTile = widgetsOfDay(dayValue)[0]
      if (firstTile === undefined) return
      event.preventDefault()
      event.stopPropagation()
      // 記下進格那一天:出格回這一天(見 entryDayRef;從長條的第 X 天進來,firstTile 的 DOM 可能在第 1 天那格)
      entryDayRef.current = dayValue
      firstTile.focus()
      return
    }

    // data-calendar-day 是 'yyyy-MM-dd'(只有日期 = 本地那一天):與事件的日期字串同一支解析(calendar-layout.ts parseEventDate,不走 new Date(str) 的 UTC 午夜)
    const current = parseEventDate(dayValue)
    // 隱藏週末時,落點是被藏的日子就往移動方向找最近一個看得見的(nearestShownDay;沒藏時每一天都看得見,原樣回傳)【AI 推導】
    let next: Date
    switch (event.key) {
      case 'ArrowRight':
        next = nearestShownDay(addDays(current, 1), 1, isShown)
        break
      case 'ArrowLeft':
        next = nearestShownDay(addDays(current, -1), -1, isShown)
        break
      case 'ArrowDown':
        next = nearestShownDay(addDays(current, 7), 1, isShown)
        break
      case 'ArrowUp':
        next = nearestShownDay(addDays(current, -7), -1, isShown)
        break
      case 'Home':
        // 該列第一個 / 最後一個看得見的日子
        next = nearestShownDay(startOfWeek(current, { weekStartsOn: resolvedWeekStartsOn }), 1, isShown)
        break
      case 'End':
        next = nearestShownDay(endOfWeek(current, { weekStartsOn: resolvedWeekStartsOn }), -1, isShown)
        break
      case 'PageUp':
      case 'PageDown': {
        // date-fns addMonths 溢位自動夾到當月最後一天,正好等於 APG 的
        //「If that day does not exist, moves focus to the last day of the month.」
        const months = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)
        const target = addMonths(current, months)
        // 落在被藏的日子:往同方向找;找到的那天跑出目標月(例:1/31 是週六,往後找會到 2 月)就改往反方向,停在目標月裡
        const step = months < 0 ? -1 : 1
        const along = nearestShownDay(target, step, isShown)
        next = isSameMonth(along, target) ? along : nearestShownDay(target, step === 1 ? -1 : 1, isShown)
        break
      }
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    moveFocusToDay(next)
  }

  // 「今天」:跳到今天所在的月,鍵盤停靠點也搬到今天(calendar.spec.md「工具列」‹ › 與「今天」條)。
  // 只搬 roving tabindex 的停靠點、不搶 DOM 焦點(焦點留在「今天」鈕,下一次 Tab 進格陣才停在今天)。
  // 2026-11-25 前只換月:停靠點只有「舊值掉出格陣」才回落今天,舊值若仍畫在今天那個月的格陣裡(含溢出日),按了「今天」停靠點還在舊日子。
  const handleToday = () => {
    setRefDate(new Date(resolvedToday.getTime()))
    // 今天被藏(隱藏週末)時停在同一週下一個看得見的日子、沒有就前一個,同 Tab 進來的規則(shownDayNearToday)
    setFocusedDateState(shownDayNearToday(startOfDay(resolvedToday), isShown, resolvedWeekStartsOn))
  }
  const handlePrev = () => setRefDate(subMonths(refDate, 1))
  const handleNext = () => setRefDate(addMonths(refDate, 1))

  // ── 格子的滑過(calendar.spec.md「Cell 規則」滑過條與命中區表、「跨日長條」滑過 / 點擊 / 焦點條)─────────────────────
  // 格子的滑過底由屬性 data-hovered 驅動(格子的 class `data-[hovered]:bg-neutral-hover`),**不用 CSS :hover**:
  //   :hover 沿 DOM 祖先亮,長條的 DOM 在第一格 —— 指標在「Alex 休假」7/22 那段,亮的是 7/20(POC 實測,見 cellAtPoint 上方);
  //   唯讀的列 / 長條是格子的子孫,:hover 也排除不掉它們(命中區表:唯讀列上格子不亮)。
  // 誰亮 = hoverTargetCell(指標底下那一格;唯讀的一段、蓋在上面的浮層、週列的捲軸 → 都不亮)。寫法照 DateGrid / DataTable 的「用屬性而不是 React state」
  //(date-grid.tsx GAP_CONFIRMS_ATTR 上方、data-table.tsx setHoveredRow):它跟著指標每一步變,不該讓整張格陣重畫;
  // 唯一寫入者 markHoveredCell —— 標新格的同一個動作清掉舊格,同一時間最多一格亮。
  // 何時重算(POC 實測 Chromium):指標移動 / 換到別的元素(pointermove / pointerover);捲動區捲了但指標沒動(scroll 捕獲 ——
  // Chromium 捲完會補送 pointerover,這裡不靠它);每次重畫之後(換月、事件變了、列數變了,格子可能換了節點,用最後的指標位置再對一次);
  // 指標離開格陣(pointerleave;蓋上 modal 時 Chromium 也送)→ 清掉。觸控沒有滑過,不算。瞬間切換、不做過渡【維持 U2】。
  // 日期格唯讀(readOnlyDates)時格子不亮(class 本來就不掛),這裡也不標。
  const hoveredCellRef = React.useRef<HTMLElement | null>(null)
  // 最後的指標位置與捕獲它的元素(沒有捕獲 = null;捲動與重畫之後的重算也照它 —— 拖捲軸滑塊時週列一直在捲)
  const pointerAtRef = React.useRef<{ x: number; y: number; captured: Element | null } | null>(null)
  const markHoveredCell = (next: HTMLElement | null) => {
    const prev = hoveredCellRef.current
    if (prev === next) return
    prev?.removeAttribute('data-hovered')
    next?.setAttribute('data-hovered', '')
    hoveredCellRef.current = next
  }
  const syncHoveredCell = () => {
    const grid = gridRef.current
    const at = pointerAtRef.current
    markHoveredCell(grid && at && datesInteractive ? hoverTargetCell(grid, at.x, at.y, at.captured) : null)
  }
  const handleGridPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    // 指標被捕獲時(拖捲軸滑塊),事件的 target 就是捕獲它的元素
    const { target } = event
    const captured = target instanceof Element && target.hasPointerCapture(event.pointerId) ? target : null
    pointerAtRef.current = { x: event.clientX, y: event.clientY, captured }
    syncHoveredCell()
  }
  const handleGridPointerLeave = () => {
    pointerAtRef.current = null
    markHoveredCell(null)
  }
  // 滑鼠按在可點的一段上 = 從指標底下那一天進格(entryDayRef;按下就會把焦點給那一段)。按在別處不動記憶。
  const handleGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid || !(event.target instanceof Element) || !event.target.closest('[data-calendar-tile]')) return
    const at = cellAtPoint(grid, event.clientX, event.clientY)
    entryDayRef.current = at ? dayStopOf(at)?.getAttribute('data-calendar-day') ?? null : null
  }
  // 每次重畫之後用最後的指標位置對一次(沒有相依陣列 = 每次 commit 都跑;指標不在格陣上時直接清,不呼叫命中測試)
  React.useLayoutEffect(() => {
    syncHoveredCell()
  })

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col w-full h-full bg-surface rounded-md border border-divider overflow-hidden',
        className,
      )}
      {...props}
      // 幾何常數設成元件內變數(--calendar-gap / --calendar-text-inset / --calendar-cell-min-h;calendar-geometry.ts)。
      // consumer 傳的 style 照併進來;這三個名字只有 Calendar 自己讀(元件內變數,不是 token)。
      style={{ ...CALENDAR_GEOMETRY_STYLE, ...style }}
    >
      {/* 工具列 = ChromeHeader(calendar.spec.md「工具列」【AI 推導】):常駐 chrome → B 家族固定高 48 / 56
          (header-canonical.spec.md:26 / :68),裡面控件一律 sm(同檔 :73)。不傳底色:Calendar 根節點已是 bg-surface,
          工具列坐在它上面 = 巢狀 chrome、透明(header-canonical.spec.md「6. Background ownership」巢狀那一列);
          底線用 ChromeHeader 自畫的 border-b。2026-11-25 前是手刻的 div(內距撐高,實測 53 / 大密度 64,稽核 D17)。
          排法:左 =〔‹〕〔今天〕〔›〕+ 標題,右 =〔+ 新事件〕(action-bar.spec.md:109 標題在左、按鈕靠右;:121 primary 在業務層最右)。
          導覽群到標題的距離 = ChromeHeader 子項的 gap-2(8);2026-11-25 前標題另帶 ml-2,合計 16【AI 推導】。 */}
      <ChromeHeader>
        {/* 月份導覽 landmark:‹ / 今天 / › 包成 <nav aria-label>(calendar.spec.md「A11y 預設」第一條);標題與「新事件」留在 nav 外。
            gap-2 = 按鈕群 8px(utility-registry canonical_micro_geometry;calendar-geometry-invariant 只在 <nav> 上放行) */}
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

        {/* 標題層級由 titleAs 給(預設 h2),字樣不變(header-canonical.spec.md:100 text-body-lg font-medium)。 */}
        <TitleTag className="text-body-lg font-medium text-foreground flex-1 min-w-0 truncate">
          {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容。」,僅實際截斷時顯示)——
              窄 toolbar 下標題被裁掉沒有補救路徑。display="block":標題元素是 block container。 */}
          <TruncatedText display="block">{monthTitle}</TruncatedText>
        </TitleTag>

        {/* 全域新增入口:toolbar 固定元素、恆渲染(M23(f);2026-09-29 前寫成 `{onCreateEvent && …}`,唯讀月曆就沒這顆鈕 —— 已撤回,
            日期能不能新增由新增流程自己擋,不由鈕的有無表達,user 2026-09-29 原話見 CalendarOwnProps.onCreateEvent) */}
        <Button variant="primary" size="sm" startIcon={Plus} onClick={onCreateEvent}>
          {createLabel}
        </Button>
      </ChromeHeader>

      {/* 月格陣(role="grid")= 星期列(第一個 row,不捲)+ 週列(在 ScrollArea 裡捲)。
          星期列 2026-11-25 前在格陣外、沒有任何角色(稽核 D14);依 calendar.spec.md「A11y 預設」它是格陣的第一個 row、每格 columnheader。
          sticky 表頭不採用:灰底 --muted 是半透明(semantic.css),捲過去的內容會從底下透出來 —— 所以星期列放在捲動區外。
          ARIA 的 grid > row 之間夾著 ScrollArea 的三層 div(Radix Root / Viewport / 內層):都沒有角色、沒有 aria 屬性、不可聚焦
          → 讀屏與 axe 都穿透它們(viewportTabIndex={null}:格陣是 composite,捲動包層不得多一個 Tab 停靠點,scroll-area.tsx 註解)。 */}
      <div
        ref={gridRef}
        className="flex flex-col flex-1 min-h-0"
        role="grid"
        aria-label={labels.grid(monthTitle)}
        // 載入中(calendar.spec.md「狀態與邊界案例」;skeleton.spec.md:86 aria-busy 由容器 own)
        aria-busy={loading || undefined}
        // grid navigation 掛在格陣上(事件委派):日期鈕與事件方塊都在這棵子樹裡,
        // 焦點在哪一層由 handler 自己判,不必每顆鈕各掛一份 handler。
        onKeyDown={handleGridKeyDown}
        // 格子的滑過(data-hovered)與滑鼠進格那一天:同樣委派在格陣上(見上方「格子的滑過」)。
        // scroll 不冒泡,用捕獲才收得到 ScrollArea 視窗的捲動。
        onPointerMove={handleGridPointer}
        onPointerOver={handleGridPointer}
        onPointerLeave={handleGridPointerLeave}
        onPointerDown={handleGridPointerDown}
        onScrollCapture={syncHoveredCell}
      >
        {/* 星期列:字樣 text-foreground text-body font-medium、置中、bg-muted 灰底條與底線都維持(calendar.spec.md「Cell 規則」星期列條;
            字樣【P6、總帳更正 #6】、灰底【總帳更正 #9】)。內距【AI 推導】:左右 = 格子內距、上下讓列高 = 4 + 列高單位 24 + 4 = 32
            (與日期列同一個列高單位;內容盒 h-tag-md 置中,所以列高不跟字型行高走)。2026-11-25 前寫死 px-2 py-1.5(列高 33)。
            看得見的字 = Intl weekday short(「週日」),窄的時候 narrow(「日」,calendar.spec.md「窄寬度」);讀屏名稱 = long(「星期日」)。
            欄由 gridTemplateColumns 給(週數欄 + 看得見的日子;與下方週列同一個字串)。容器 text-body:週數欄寬的 ch 在這裡解析,兩個格陣同一個字級。 */}
        <div role="row" className="grid shrink-0 border-b border-divider bg-muted text-body" style={{ gridTemplateColumns }}>
          {showWeekNumbers && (
            // 週數欄欄頭「週」(labels.weekNumberHeader):一般字重、fg-secondary、上下左右置中(calendar.spec.md「Cell 規則」週數欄【Q10b(定)】);
            // 灰底條本來就是整列的底,延伸到這一格【AI 推導】。名稱由文字來(不另掛 aria-label)。
            <div role="columnheader" className="flex items-center justify-center p-[var(--calendar-gap)] text-body font-normal text-fg-secondary">
              <span className="flex items-center h-tag-md">{labels.weekNumberHeader}</span>
            </div>
          )}
          {weekdays.map((weekday) => (
            <div
              key={weekday.day}
              role="columnheader"
              aria-label={weekday.long}
              className="flex justify-center p-[var(--calendar-gap)] text-body text-foreground font-medium"
            >
              <span className="flex items-center h-tag-md">{narrow ? weekday.narrow : weekday.short}</span>
            </div>
          ))}
        </div>

        {/* 週列:每一週等高(calendar.spec.md「每一週等高」【C3】),列 = minmax(格最小高, 1fr) —— 平分格陣高度、不被內容撐高;
            容器比「週數 × 格最小高」還矮時在 ScrollArea 裡捲,工具列與星期列不捲【AI 推導】。
            fillX:Radix Viewport 內層 display:table 改 block(scroll-area.tsx fillX);內層再給 h-full,週列的 h-full 才有確定高度可分
            (Root className 選到 Radix 的內層,同 sidebar.tsx 從 Root 選 Radix 捲軸的寫法)。容器高度不確定時(外層沒給高)
            h-full 退成 auto,週列照內容排開、不捲。2026-11-25 前格陣直接 flex-1、列高 auto(被內容撐高,稽核 D7),
            根節點 overflow-hidden 把下面的週裁掉、沒有捲軸(稽核 D8)。 */}
        <ScrollArea fillX viewportTabIndex={null} className="flex-1 min-h-0 [&>[data-radix-scroll-area-viewport]>div]:h-full">
          <div
            ref={weeksGridRef}
            className="grid h-full text-body"
            style={{ gridTemplateColumns, gridTemplateRows: `repeat(${weekCount}, minmax(var(--calendar-cell-min-h), 1fr))` }}
          >
            {/* WAI-ARIA grid 要求 row > gridcell 階層:每一週包成 role="row"(display:contents 保 CSS grid 佈局) */}
            {weeks.map((week, rowIdx) => {
              // 這一週的版面(calendar-layout.ts layoutMonth;週的索引與 weeks 一一對應):每一段的 DOM 放在它起始那一格(startCol)
              const weekLayout = monthLayout.weeks[rowIdx]
              // 每一段涵蓋的日子(格內導覽依日子查用;yyyy-MM-dd 同 data-calendar-day)
              const isoOf = (col: number) => format(weekLayout.days[col], 'yyyy-MM-dd')
              return (
              <div key={rowIdx} role="row" style={{ display: 'contents' }}>
                {week.number !== null && (
                  // 週數格(calendar.spec.md「Cell 規則」週數欄【Q10b(定)】):一般字重、fg-secondary、水平置中、上邊距與高度同日期框(4 / 24);
                  // 等寬數字(欄寬照最寬兩位數算)。格線跟日期格同一套(右 / 下各一條,最後一週不畫下線)【AI 推導】。
                  // rowheader【AI 推導】:不是操作目標 —— 沒有 tabIndex、不進 roving 停靠點,第一段不可點;名稱 labels.weekNumber(「第 27 週」)。
                  <div
                    role="rowheader"
                    aria-label={labels.weekNumber(week.number)}
                    className={cn(
                      'flex justify-center pt-[var(--calendar-gap)] text-body font-normal text-fg-secondary tabular-nums',
                      'border-r border-b border-divider',
                      rowIdx === weekCount - 1 && 'border-b-0',
                    )}
                  >
                    <span className="flex items-center h-tag-md">{week.number}</span>
                  </div>
                )}
                {week.visibleDays.map((date, colIdx) => {
                  const inMonth = isSameMonth(date, refDate)
                  const isToday = isSameDay(date, resolvedToday)
                  const label = dayLabel(date)
                  // 比 24 寬的日期框:今天的實心底、1 號的「7月1日」→ 左右內距 8(calendar.spec.md「間距」日期框列【AI 推導】);窄的時候 1 號只寫「1」、不算
                  const wideDayBox = isToday || (date.getDate() === 1 && !narrow)
                  // 這一格的版面:畫在這一格上的段(含從左邊橫跨過來的長條)、要幾列 m、「+N」的 N(看最高佔用車道,calendar.spec.md「每格筆數與「+N」」)
                  const cellLayout = weekLayout.cells[colIdx]
                  // DOM 放在這一格的段(起始欄 = 這一欄;長條畫過後面幾格)
                  const ownPieces = weekLayout.pieces.filter((piece) => piece.startCol === colIdx)
                  // 從左邊格子橫跨過來的長條(DOM 在它這一週第一個看得見的日子,不在這一格;依車道由上而下)。日期格唯讀時格子的名稱由內容來,
                  // 這幾條的標題不在這一格的 DOM 裡 → 另補只給讀屏的標題(calendar.spec.md「A11y 預設」:readOnlyDates 時讀屏要念到每個事件標題)。
                  // 2026-11-25 前多日事件每涵蓋一天各畫一塊,每一格本來就念得到;改成一條長條後要補,否則第 2 天起的格子只念到筆數。
                  const carriedPieces = loading ? [] : cellLayout.pieces.filter((piece) => piece.startCol < colIdx)
                  // 事件區的列數:放得下就照最高佔用車道(m),放不下就是 k(第 k 列換「+N」)。經過這一格的長條佔的車道也算 ——
                  // 列先排好,長條(DOM 在別格)才對得上這一格的列,容器沒給高時格子也照這個列數撐開
                  const rowsShown = cellLayout.moreCount > 0 ? monthLayout.maxRows : cellLayout.rowsNeeded
                  // 這一天的事件筆數 = 畫在這一格的段 + 「+N」藏起來的(兩者不重疊:有「+N」時畫出來的段都在車道 k−2 以內)
                  const eventCount = cellLayout.pieces.length + cellLayout.moreCount
                  // 這一天的讀屏名稱:完整日期 + 筆數(含沒畫出來的),今天前面加前綴(calendar.spec.md「A11y 預設」;字串在 labels)。
                  // 1 號畫面上寫「7月1日」(dayLabel)不影響這裡。載入中不念筆數(還沒載完的筆數不是事實;格陣另有 aria-busy)【AI 推導】。
                  const fullDate = formatters.fullDate.format(date)
                  const dayName = `${isToday ? labels.todayPrefix : ''}${loading ? fullDate : labels.day(fullDate, eventCount)}`
                  // 這一天的鍵盤停靠點屬性(roving tabindex):可點時掛在日期數字鈕上,唯讀時掛在格子本身。
                  // 兩處共用同一組屬性,只換掛的位置 —— handleGridKeyDown / moveFocusToDay 只認 data-calendar-day。
                  // 名稱**不**在這一組裡:日期鈕用 aria-label;唯讀的格子名稱由內容來(見下方 gridcell 的註解),格子上掛 aria-label 會蓋掉格內的事件標題。
                  const dayStop = {
                    // 只有今天帶 aria-current="date"(calendar.spec.md「A11y 預設」日期停靠點那條;可點時在日期鈕上、唯讀時在格子上)
                    'aria-current': isToday ? ('date' as const) : undefined,
                    // roving tabindex:整個格陣只有這一個(= 目前焦點日)進 Tab 序列,其餘 -1。
                    // APG Date Picker Dialog 逐字:「only one button in the calendar grid is in the Tab sequence」。
                    'data-calendar-day': format(date, 'yyyy-MM-dd'),
                    tabIndex: isSameDay(date, focusedDate) ? 0 : -1,
                    // 焦點用任何方式落到某一天(Tab 進來 / 滑鼠點 / 程式化)都把停靠點同步過去,
                    // 免得下次 Tab 回來停在別天。
                    onFocus: () => setFocusedDateState(date),
                  }
                  const dayNumberClass = cn(
                    // 日期框 = 一列的高(h-tag-md 24,與事件列同一個列高單位;calendar.spec.md「間距」日期框列),左上【C10(改)】。
                    // 焦點框往外(= 不寫):日期框離格頂 4、格左 4,下方是 4 的列距 → 四周最小淨空 4.00 = canonical「算放得下」。
                    'inline-flex items-center justify-center h-tag-md min-w-tag-md rounded-full text-body font-medium',
                    wideDayBox && 'px-[var(--calendar-text-inset)]',
                    isToday && 'bg-info text-on-emphasis',
                    // 非當月 = 淡字 `fg-muted`,**不是** `fg-disabled`:這天跟當月格同一種可點性(可點就一樣可點,唯讀就一樣唯讀),
                    // 只是不在焦點月份(同 DateGrid「鄰月日子」的淡字,date-grid.spec.md outside 列;disabled 字色留給真的不可操作)。
                    !isToday && !inMonth && 'text-fg-muted',
                  )

                  return (
                    // 2026-06-11 a11y(user 拍板 2c 修 code):cell 從 <button role="gridcell"> 改非互動容器 —
                    // W3C button 語義禁止互動後代,cell 內含 role="button" 事件 tile = nested-interactive 違規。
                    // 對齊 Google Calendar:gridcell = 容器,日期數字按鈕 = 日期級 keyboard 入口,tile 各自為 button。
                    // div onClick 保留滑鼠「點 cell 空白處等同點日期」便利(keyboard 走日期數字按鈕,功能等價)。
                    // 點格內空白處也把**鍵盤位置**帶過來(2026-09-29,待辦總帳 N46):停靠點(roving tabindex)搬到這一天、
                    // 焦點落在這一天的日期鈕 —— 之後 Tab 回來停在剛點的那天、consumer 開的對話框關掉後焦點也回到它。
                    // 同一條規則 DataTable 試算表已做(「滑鼠點到哪一格,鍵盤位置就跟到哪一格」,data-table.spec.md「試算表模式」)。
                    //
                    // **日期格唯讀(readOnlyDates)時**(2026-09-26,待辦總帳 L8 / C15):格子不接點擊、不亮,日期數字只是文字;
                    // 格子裡於是只剩文字(與可點的事件方塊,若有)→ 依 APG Grid「A cell contains text or a single graphic and
                    // grid navigation keys set focus on the cell」,鍵盤停靠點改成**格子本身**(dayStop 掛在這裡),
                    // 方向鍵 / Home / End / PageUp / PageDown 照舊。格與格之間沒有縫,焦點框往內畫(focus-canonical「問題二」)。
                    // 唯讀格的名稱由**內容**來(gridcell 的名稱可取自內容,ARIA 1.2「Name From: contents, author」):開頭一段只給讀屏的字
                    //(日期 / 今天 / 筆數)、看得見的日期數字 aria-hidden(不念兩次),其後是格內的事件 —— 焦點落在格子上時念得到每個事件標題
                    //(calendar.spec.md「A11y 預設」:格子的 aria-label 不得蓋掉格內文字)。2026-11-25 前格子掛 aria-label「2026-07-15,N 個事件」,事件標題念不到。
                    <div
                      key={date.toISOString()}
                      role="gridcell"
                      {...(datesInteractive
                        ? {
                          onClick: (e: React.MouseEvent<HTMLDivElement>) => {
                            // 日期鈕、事件列 / 長條(可點與唯讀)、「+N」自己的 onClick 都 stopPropagation(calendar.spec.md「命中區」);
                            // 走到這裡的只有格內空白處(內距、列與列的縫、日期列空白)
                            dayStopOf(e.currentTarget)?.focus({ preventScroll: true })
                            setFocusedDateState(date)
                            onDateClick(date)
                          },
                        }
                        : dayStop)}
                      className={cn(
                        // 格子四邊內距 4、日期框到第一列 4(都讀 --calendar-gap;calendar.spec.md「間距」【SPACING(定)】,
                        // 2026-11-25 前是 p-1.5 = 6,首版 86c5436c 寫的、沒有依據)。格高由週列的 grid 列決定(minmax(格最小高, 1fr)),
                        // 不寫 min-h;每格放幾列依量到的格高算(k),放不下的由「+N」取代,不撐高也不疊到下一週。
                        // 裁切只裁上下(overflow-y: clip),左右不裁(overflow-x: visible):跨日長條的 DOM 在第一格、往右畫過後面幾格
                        //(calendar.spec.md「跨日長條」實作備註),裁左右會把長條切成只剩第一格(POC 實測)。
                        // 左右的保險另放在日期列上(見下方日期列的 overflow-x-clip)與自訂事件方塊的外層上(MonthEventPiece 的 renderEventTile 那一支 overflow-clip:
                        // 回傳的內容比這一段寬 / 比一列高時裁在外層裡,不畫進隔壁格、不接走隔壁格的點擊)。2026-11-25 前是 overflow-hidden。
                        'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)] min-w-0 overflow-x-visible overflow-y-clip',
                        // 格線:每格右 / 下各一條;每一週最右那格不畫右線(每個 role=row 只裝自己那 7 格,last: 就是第 7 格);
                        // 最後一週不畫下線 —— 根節點外框已經是那一條,兩條疊成 2px 雙線(稽核 D6)。
                        // 格子是 border-box,底線畫在格高裡面 → 格最小高把它算進去(calendar-geometry.ts CALENDAR_GRID_LINE_PX)。
                        'border-r border-b border-divider last:border-r-0',
                        rowIdx === weekCount - 1 && 'border-b-0',
                        // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
                        // 非當月格**不加底色**(2026-09-25 user 選『可以，拿掉底色 (Recommended)』,選項由 AI 提供):它跟當月格一樣可點(onDateClick = 在這天新增),
                        // 底色一律透明,所以滑過與當月格同一個滑過色。先前的 `bg-muted` 是「不可操作」的 token,放在可點的格上
                        // 讓滑過反而變淺(淺 #F5F5F5 → #FAFAFA)。非當月只靠日期數字的淡字區分,見下方日期鈕與 spec「Outside day cell」。
                        // 唯讀的格不亮:點了沒反應就不給滑過回饋(color.spec.md「Hover 換色配對總則」;待辦總帳 L8)。
                        // 亮的是「指標底下那一格」:由 data-hovered 驅動,不是 :hover(2026-11-25 前是 `hover:bg-neutral-hover` —— 指標在長條第 3 天那段,
                        // 亮的是長條 DOM 所在的第 1 天;指在唯讀列上格子也亮)。寫入者 = 上方「格子的滑過」markHoveredCell。
                        datesInteractive && 'data-[hovered]:bg-neutral-hover',
                        // 點得到(點整格 = 在這天新增)→ 手形游標(hit-area-canonical.md 滑過原則一-3;先前只有日期數字鈕是手形,
                        // 格子空白處滑過會亮、點了會新增,游標卻是箭頭)
                        datesInteractive && 'cursor-pointer',
                        !datesInteractive && 'focus-visible:focus-ring-inset',
                      )}
                    >
                      {/* Date number = keyboard 入口,在格子左上【C10(改)】(2026-11-25 前在右上)。24 的框是**列高**(與事件列同一個列高單位),
                          **不是**某條最小點擊尺寸(先前這裡寫的「WCAG 2.5.8 ≥24」已於 2026-09-24 撤回)—— 本 DS 以滑鼠精度為前提,不拿觸控尺寸建議當依據
                          (owner = `ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)。
                          命中與懸停的相等關係成立在 **cell** 這一層:懸停回饋是整格的 `data-[hovered]:bg-neutral-hover`
                          (上方 gridcell 的 className;指標底下那一格才帶 data-hovered,見「格子的滑過」),而整格 div 的 onClick 就是同一個 onDateClick
                          → 懸停形狀 ≡ 命中區。指在唯讀的列上點了什麼都不發生,那一格也就不亮(hoverTargetCell)。
                          這顆鈕本身沒有任何 hover 樣式、平日底色透明,所以它不是另一個獨立目標,而是同一個目標的鍵盤入口 + 焦點框幾何;
                          它完全落在宿主格內、動作與宿主相同,不會生出隱形帶也搶不走別人的點擊。
                          規格 → `calendar.spec.md`「Cell 規則」的「命中區」條;量測 → scripts/calendar-month-invariant.mjs(日期框離格邊 4 / 4、高 24)。
                          唯讀的格:日期數字是同一個盒、同一組字級與今天 pill,只是 <span>(不是按鈕、沒有手形游標) */}
                      {/* 日期列左右裁切:格子不裁左右(讓長條畫過去),比格子寬的日期框(窄欄的「7月1日」、長的語系月份字)改由這一層裁 ——
                          往兩側延伸一個格子內距(-mx + px),裁切邊 = 格子的內距框,與 2026-11-25 前整格 overflow-hidden 的裁切邊相同;
                          上下不裁(overflow-y 照 visible),焦點框往外畫的四周淨空不受影響。 */}
                      <div className="flex items-start justify-start -mx-[var(--calendar-gap)] px-[var(--calendar-gap)] overflow-x-clip">
                        {datesInteractive ? (
                          <button
                            type="button"
                            {...dayStop}
                            aria-label={dayName}
                            onClick={(e) => {
                              e.stopPropagation()
                              // 點日期鈕也把焦點與停靠點帶過來,與格子空白處同一條路(calendar.spec.md「命中區」下方那段):
                              // Safari 點按鈕不給焦點,只靠 onFocus 同步的話停靠點留在別天。
                              e.currentTarget.focus({ preventScroll: true })
                              setFocusedDateState(date)
                              onDateClick(date)
                            }}
                            className={dayNumberClass}
                          >
                            {label}
                          </button>
                        ) : (
                          // 唯讀:名稱由格子內容組成 —— 這段只給讀屏(sr-only,同 Command / DataTable 的讀屏用字寫法),看得見的數字不念
                          <>
                            <span className="sr-only">{dayName}</span>
                            <span aria-hidden className={dayNumberClass}>{label}</span>
                            {/* 橫跨過來的長條標題(見 carriedPieces):接在日期那一段之後、格內自己的事件之前,同樣只給讀屏 */}
                            {carriedPieces.map((piece) => (
                              <span key={`${piece.entry.event.id}@${piece.startCol}`} data-calendar-carried="" className="sr-only">{piece.entry.event.title}</span>
                            ))}
                          </>
                        )}
                      </div>

                      {/* 事件區 = CSS grid,一列一條車道(calendar.spec.md「跨日長條」車道分配:每一列在一週裡的 y 位置固定,長條才能在相鄰格對齊):
                          列高 = 事件列 Tag md(--tag-height-md 24)、列距 4(--calendar-gap;item-anatomy.spec.md:467 standalone pill ≥ 4)。
                          列數 = 這一格要顯示的列(rowsShown);每一段放在自己的車道那一列(gridRow = 車道 + 1),從左邊格子橫跨過來的長條佔的列
                          這裡空著、由那條長條蓋過來。欄 = minmax(0, 1fr):格子不裁左右(讓長條畫過去),單格的列不得被長標題撐寬。
                          shrink-0:列是固定高的單位,格子比內容矮時不壓扁列;k 由量到的格高算,放得下才畫(2026-11-25 首版這裡是 min-h-0,
                          最小高的週事件列只剩 23、格子再矮多筆的列縮到 21、「+N」縮到 15.6)。 */}
                      <div
                        className="grid gap-y-[var(--calendar-gap)] shrink-0"
                        style={{
                          gridTemplateColumns: 'minmax(0, 1fr)',
                          gridTemplateRows: !loading && rowsShown > 0 ? `repeat(${rowsShown}, var(--tag-height-md))` : undefined,
                        }}
                      >
                        {/* 載入中:事件區換成一條與事件列同高的骨架(calendar.spec.md「狀態與邊界案例」載入中【Q11(定);一條是 AI 推導】),
                            不畫事件與「+N」。形狀對齊事件列(高 h-tag-md、rounded-md,skeleton.spec.md:64);aria-hidden(同檔 :86-87),
                            格陣另帶 aria-busy。點空白新增、鍵盤走格不受影響(格子與日期鈕照畫)。 */}
                        {loading ? <Skeleton aria-hidden className="h-tag-md w-full" /> : <>
                        {ownPieces.map((piece) => {
                          const { event } = piece.entry
                          // 長相由版面的 kind 決定(長條 / 有時段);這裡決定顏色(沒傳 / 認不得 = blue)、時間與名稱、可點 / 唯讀(eventModeOf),
                          // 色表在 MonthEventPiece 裡按名字取(見檔頭「事件的顏色」)
                          const { time, name } = eventText(piece.entry, piece.segment)
                          return (
                            <MonthEventPiece
                              key={`${event.id}@${piece.startCol}`}
                              piece={piece}
                              covers={Array.from({ length: piece.span }, (_, i) => isoOf(piece.startCol + i)).join(' ')}
                              endsAtLastColumn={piece.startCol + piece.span === weekLayout.days.length}
                              color={resolveEventColor(event.color)}
                              time={time}
                              name={name}
                              mode={eventModeOf(event)}
                              renderEventTile={renderEventTile}
                            />
                          )
                        })}
                        {/* 「+N」列:佔第 k 列、與事件列同高 24、左右內距 8(calendar.spec.md「間距」「+N」列、「每格筆數與「+N」」)。
                            N = 這一格車道 ≥ k−1 的筆數(看車道不看筆數,總帳更正 #7)。點它不會變成在這天新增 —— 阻止冒泡(「命中區」;修稽核 D1);
                            可點(原生 button、開當天清單)與字色在「+N」清單那一包。一行不換行、放不下的字裁掉(格子不裁左右)。 */}
                        {cellLayout.moreCount > 0 && (
                          <div
                            data-calendar-more=""
                            style={{ gridRow: monthLayout.maxRows }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center h-tag-md px-[var(--calendar-text-inset)] text-caption text-fg-muted overflow-hidden whitespace-nowrap"
                          >
                            {moreLabel(cellLayout.moreCount)}
                          </div>
                        )}
                        </>}
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        </ScrollArea>
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
    fg: ['text-fg-muted', 'text-foreground', 'text-fg-secondary'],
    ring: ['focus-ring-inset', '--ring'],
  },
} as const

export { Calendar }
