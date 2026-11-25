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
} from 'date-fns'
import { cn } from '@/lib/utils'
import { CAT_EVENT, CAT_SUBTLE, CAT_ACCENT, type CategoricalHue } from '@/design-system/tokens/categorical-color'
import { Button } from '@/design-system/components/Button/button'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { useTruncated } from '@/design-system/hooks/use-truncated'
import { DEFAULT_DATE_LOCALE, resolveWeekStartsOn, type WeekStartsOn } from '@/design-system/lib/date-locale'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { CALENDAR_GEOMETRY_STYLE } from './calendar-geometry'

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
 * - components: [Button, ScrollArea(格陣捲動區), Tooltip, Tag(列高,經 calendar-geometry.ts)]
 * - patterns: [header-canonical(工具列 = ChromeHeader), element-anatomy/truncated-text]
 * - tokens: [--chrome-header-height, --tag-height-md(h-tag-md / min-w-tag-md), --divider, --muted, --info, --neutral-hover,
 *   categorical-color.ts(CAT_EVENT / CAT_SUBTLE / CAT_ACCENT)]
 * - 幾何常數: ./calendar-geometry.ts(格內所有空隙、文字內距、格最小高;元件內變數 --calendar-*)
 * - spec refs: calendar.spec.md「工具列」「Cell 規則」「間距」「焦點框」「A11y 預設」;header-canonical.spec.md:26 / :68 / :73;
 *   tag.spec.md「尺寸」;focus-canonical.md「問題二」;lib/date-locale.ts(週起始日)
 * - 讀屏字串: `labels`(CalendarLabels,下方「讀屏字串」段;寫法同 BulkActionBar / AgentDecisionCard 的 `labels`);
 *   日期停靠點名稱 = Intl `dateStyle: 'full'` + 筆數(calendar.spec.md「A11y 預設」),今天加 aria-current="date" 與前綴(同 DateGrid「今天,」)
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

/** 事件方塊可點與否。同上,不單獨匯出;MonthEventTile 也吃這一份。 */
type CalendarEventTileProps =
  | {
      /** 事件方塊唯讀:不可點、不亮、不是按鈕(只顯示事件,例如公司假日這類沒有詳情可開的標記)。 */
      readOnlyEvents?: false
      /** 點 event tile 回調。事件方塊可點時**必填**:元件沒有內建的「打開事件」行為。 */
      onEventClick: (event: CalendarEvent) => void
    }
  | {
      /** 事件方塊唯讀:不可點、不亮、不是按鈕(只顯示事件)。宣告了就不可以傳 `onEventClick`。 */
      readOnlyEvents: true
      onEventClick?: never
    }

// ── 讀屏字串(labels)────────────────────────────────────────────────────────
// calendar.spec.md「A11y 預設」「字串可覆寫」:元件裡的讀屏字串都從這一份取,預設繁中、逐鍵可覆寫(Partial 傳入、與預設合併),
// 元件裡不另寫死 aria-label。已有個別參數的字串(prevAriaLabel / nextAriaLabel / navAriaLabel / todayLabel / createLabel / moreLabel)
// 不收進來、照用那些參數(決策總帳 2026-11-25「labels 不收已有個別參數的字串」);週數欄、事件、「+N」、清單與詳情的關閉等鍵隨各自的功能加進來。
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
}

// i18n-allow: DS 預設文案(中文);consumer 經 `labels` 覆寫
const DEFAULT_LABELS: CalendarLabels = {
  // 2026-11-25 前寫死在格陣上
  grid: (monthTitle) => `月行事曆,${monthTitle}`,
  // 2026-11-25 前是「2026-07-15,N 個事件」(yyyy-MM-dd,不念星期、不分今天)
  day: (fullDate, eventCount) => `${fullDate},${eventCount} 個事件`,
  // 同 DateGrid 的日期鈕名稱(date-grid.tsx labelDayButton「今天,」前綴)
  todayPrefix: '今天,',
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
   * 工具列月份標題的標題層級(預設 `'h2'`)。字樣不隨層級變(`text-body-lg font-medium`,header-canonical.spec.md「Title typography」);
   * 只換文件大綱的層級,讓 Calendar 放在頁面上時接得上頁面自己的標題階層(calendar.spec.md「工具列」標題條)。
   * 命名:子部位前綴 `title` + 本 DS 既有的「換語意標籤」寫法 `as`(InlineEdit `as`,`inline-edit.tsx#InlineEditProps`)。
   */
  titleAs?: 'h1' | 'h2' | 'h3'

  /** 自訂 event tile 渲染 */
  renderEventTile?: (event: CalendarEvent) => React.ReactNode

  className?: string

  /** locale(預設 'zh-TW' = DS 日期元件共用的 `DEFAULT_DATE_LOCALE`) */
  locale?: string

  /** ARIA labels for chrome controls. Override for i18n. */
  prevAriaLabel?: string
  nextAriaLabel?: string
  /** 月份導覽 <nav> landmark 的 aria-label。Override for i18n. */
  navAriaLabel?: string
  todayLabel?: string
  /** 「新事件」CTA 文字。Override for i18n。CTA 是 toolbar 的固定元素、恆渲染(spec Toolbar 段;`onCreateEvent` 必填)。 */
  createLabel?: string
  /**
   * 一格超過 3 筆事件時,沒畫出來的那幾筆的計數文字(收到的是沒畫出來的筆數)。Override for i18n(同 `todayLabel` / `createLabel`);
   * 預設 `+N more`(spec「Event tile 規則」超出 tile 限制)。2026-11-21 前寫死在元件裡、沒有 prop 可換,中文月曆裡只有這一句是英文。
   */
  moreLabel?: (count: number) => string
  /**
   * 讀屏字串(格陣名稱、日期停靠點名稱、今天的前綴),預設繁中、逐鍵可覆寫(calendar.spec.md「A11y 預設」字串可覆寫;鍵見 `CalendarLabels`)。
   * 上面那幾個已有個別參數的字串(‹ › 的名稱、月份導覽、「今天」、「新事件」、計數文字)照用那些參數,不在這裡。
   */
  labels?: Partial<CalendarLabels>
}

export type CalendarProps = CalendarOwnProps & CalendarDateCellProps & CalendarEventTileProps

// ── Event tile color tokens ─────────────────────────────────────────────────
// **消費 categorical-color SSOT**(CAT_EVENT = subtle 底 + hover step-2;CAT_ACCENT = 左側 step-6
// 實心條),與 Tag / Avatar 共用 12 色相,key X 一律對 `--color-X-*`(1:1)。
// 2026-06-01 allDay:全天事件 = 淡底 tile + 左側實心 accent 條 + medium,視覺區分「全天長條」vs
// 有時間事件;用 accent border 而非 solid fill 保文字對比安全。對齊 Google Calendar / Outlook 慣例。
const EVENT_COLOR_CLASSES = CAT_EVENT
// 唯讀事件方塊(readOnlyEvents):同一組靜止色、**不帶滑過** —— CAT_SUBTLE 就是 CAT_EVENT 去掉 `hover:bg-…-2` 那一段
//(categorical-color.ts CAT_SUBTLE vs CAT_EVENT,同色相同 step-1 底 / step-7 字),也就是 Tag 那種靜態類別標籤。
// 點了沒反應的東西不給滑過回饋(color.spec.md「Hover 換色配對總則」:只有「點了會有反應」的元素才有底色的滑過回饋;待辦總帳 L8)。
const EVENT_STATIC_COLOR_CLASSES = CAT_SUBTLE
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
// pattern(truncated-text.spec.md「兩層架構(對齊世界級聯集)」:trigger ≠ 量測元素時只用 hook 自組;範本 inline-edit.tsx:257 + tag.tsx)。
function MonthEventTile({
  event,
  colorClass,
  readOnlyEvents,
  onEventClick,
}: {
  event: CalendarEvent
  /** 已依可點 / 唯讀選好的色(可點 = CAT_EVENT 帶滑過;唯讀 = CAT_SUBTLE 不帶),見 Calendar 本體 */
  colorClass: string
} & CalendarEventTileProps) {
  // 與 Calendar 公開 props 同一份二擇一契約(CalendarEventTileProps):分支看明示的 readOnlyEvents,不看回調在不在(M23(f))
  const { ref: truncationRef, isTruncated } = useTruncated<HTMLSpanElement>({ deps: [event.title] })
  // 事件列 = Tag md(calendar.spec.md「間距」【SPACING(定)】):高 `h-tag-md`(24)、`text-body` 14px `font-normal`、`rounded-md`;
  // 文字左右內距 8 用 Tag 的兩層結構表示(外層 4 + 文字 4,同 tag.tsx 的 size md 與 data-tag-text 那兩層),
  // 兩層都讀元件內變數 --calendar-gap(calendar-geometry.ts),不寫死數字。
  const tileBase = 'flex items-center h-tag-md rounded-md px-[var(--calendar-gap)] text-body font-normal'
  const tileText = 'min-w-0 truncate px-[var(--calendar-gap)]'
  return (
    // 恆 wrap、未截斷 open={false} 靜默(truncated-text.spec.md always-wrap:條件 wrap 會 remount 丟 RO 訂閱)。
    // 唯讀方塊照樣掛:截斷提示是「資訊揭露」,不是點擊回饋(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容。」不分可不可點)。
    <Tooltip open={isTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        {!readOnlyEvents ? (
          <div
            role="button"
            // 2026-09-24:tile 從 tabIndex=0 改 -1。role="grid" 要求整個格陣只有一個 Tab 停靠點
            //(W3C APG Grid Pattern「only one element in the entire grid is included in the tab sequence」),
            // 原本一個月 35 格 × (1 日期鈕 + 3 tile) 是幾十個停靠點 = 與 grid 語意相反。
            // tile 改由格內導覽抵達(F2 進格、Escape 出格),詳 calendar.spec.md「A11y 預設」。
            tabIndex={-1}
            data-calendar-tile=""
            {...escapeLayerProps(true)}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEventClick(event)
              }
            }}
            aria-label={`事件:${event.title}`}
            className={cn(
              // hover 底色瞬間切換,不寫 transition-colors(tokens/motion/motion.spec.md「hover 回饋不做過渡」,user 2026-09-10 拍板)。
              // hover 底色在 colorClass 裡(tokens/categorical-color.ts CAT_EVENT 的 hover:bg-…),2026-09-10 全庫落地時
              // hover-instant 閘看不到 .ts 裡的 class 字串,這格因此漏掉;2026-09-25 補拿掉。
              tileBase,
              'cursor-pointer',
              // 焦點:tile 由格內導覽(F2 進格)取得焦點。框**往外**畫(= 不寫 class,走全域 :focus-visible):
              // 四周最小淨空 = 列距 4、格子內距 4 ≥ 4 → 往外(calendar.spec.md「焦點框」、focus-canonical.md「問題二」;4.00 算放得下)。
              // 2026-11-25 前列距是 gap-0.5 = 2px、框往內(focus-ring-inset);列距改 4 後那條理由失效,與下方自訂方塊外層同一條一起改。
              colorClass,
            )}
          >
            <span ref={truncationRef} className={tileText}>{event.title}</span>
          </div>
        ) : (
          // 唯讀方塊(readOnlyEvents):不是按鈕、不進格內導覽(沒有 data-calendar-tile,F2 找不到它)、游標不變。
          // 不寫 aria-label:沒有角色的 div 禁止命名(ARIA 1.2 generic 的 name prohibited),事件標題就是它的文字內容。
          <div className={cn(tileBase, colorClass)}>
            <span ref={truncationRef} className={tileText}>{event.title}</span>
          </div>
        )}
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
  titleAs: TitleTag = 'h2',
  renderEventTile,
  className,
  locale = DEFAULT_DATE_LOCALE,
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
  // 事件方塊的二擇一契約原樣交給 MonthEventTile(同一份型別,不在這裡另寫一套判斷)
  const eventTileMode: CalendarEventTileProps = readOnlyEvents ? { readOnlyEvents: true } : { onEventClick }
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

  // Build month grid
  const days = React.useMemo(() => {
    const monthStart = startOfMonth(refDate)
    const monthEnd = endOfMonth(refDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: resolvedWeekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: resolvedWeekStartsOn })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [refDate, resolvedWeekStartsOn])
  const weekCount = Math.ceil(days.length / 7)

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

  // 星期列:取 `days[0..6]`(格陣起點開始 7 天,正好一週)
  const weekdays = React.useMemo(
    () => days.slice(0, 7).map((d) => ({ short: formatters.weekdayShort.format(d), long: formatters.weekdayLong.format(d) })),
    [days, formatters],
  )
  // 日期框裡的字:每月 1 號(含前後月溢出的那幾格)帶月份「7月1日」,其他日子只寫數字【Q15(定)】。
  // 平日不走 Intl:zh-TW 的 { day: 'numeric' } 會出「1日」(實測),數字直接用 getDate()。
  const dayLabel = (date: Date) => (date.getDate() === 1 ? formatters.monthDay.format(date) : String(date.getDate()))

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
  // 相依用「今天 00:00 的毫秒數」(primitive),不用 resolvedToday 物件:沒傳 `today` 時它每次 render 都是
  // 新的 new Date(),拿物件當相依 = memo 每次都重算(eslint exhaustive-deps 抓的就是這個)。
  // 不把 new Date() 包進 useMemo 凍在掛載時:行事曆分頁常掛好幾天,跨過午夜「今天」的 pill、Today 鈕目標
  // 都要在下一次 render 跟著走(react-day-picker 9.14 DayPicker.js:131 同樣每次 render 重取 today)。
  const todayDayMs = startOfDay(resolvedToday).getTime()
  const anchorDate = React.useMemo(
    () => (isSameMonth(todayDayMs, refDate) ? new Date(todayDayMs) : startOfMonth(refDate)),
    [todayDayMs, refDate],
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

  // 一格的「日期停靠點」:日期格可點時是格內的日期數字鈕,唯讀時是格子本身(見下方 gridcell 的註解)。
  // 兩種都掛 `data-calendar-day`;querySelector 不含自己,所以先看格子本身。
  const dayStopOf = (cell: HTMLElement) =>
    cell.matches('[data-calendar-day]') ? cell : cell.querySelector<HTMLElement>('[data-calendar-day]')

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
          // 格內模式是焦點所在控件自己的一層(方塊帶 data-escape-layer):放在 Dialog 裡第一下 Esc 只出格、不關對話框;
          // 這一下若已被 Radix 用來關掉別的浮層就不動(lib/overlay-escape.ts)
          if (!isEscapeForControl(event)) return
          nextNode = dayStopOf(cell)
          break
        case 'F2':
          nextNode = dayStopOf(cell)
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
        next = startOfWeek(current, { weekStartsOn: resolvedWeekStartsOn })
        break
      case 'End':
        next = endOfWeek(current, { weekStartsOn: resolvedWeekStartsOn })
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

  // 「今天」:跳到今天所在的月,鍵盤停靠點也搬到今天(calendar.spec.md「工具列」‹ › 與「今天」條)。
  // 只搬 roving tabindex 的停靠點、不搶 DOM 焦點(焦點留在「今天」鈕,下一次 Tab 進格陣才停在今天)。
  // 2026-11-25 前只換月:停靠點只有「舊值掉出格陣」才回落今天,舊值若仍畫在今天那個月的格陣裡(含溢出日),按了「今天」停靠點還在舊日子。
  const handleToday = () => {
    setRefDate(new Date(resolvedToday.getTime()))
    setFocusedDateState(startOfDay(resolvedToday))
  }
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
        // grid navigation 掛在格陣上(事件委派):日期鈕與事件方塊都在這棵子樹裡,
        // 焦點在哪一層由 handler 自己判,不必每顆鈕各掛一份 handler。
        onKeyDown={handleGridKeyDown}
      >
        {/* 星期列:字樣 text-foreground text-body font-medium、置中、bg-muted 灰底條與底線都維持(calendar.spec.md「Cell 規則」星期列條;
            字樣【P6、總帳更正 #6】、灰底【總帳更正 #9】)。內距【AI 推導】:左右 = 格子內距、上下讓列高 = 4 + 列高單位 24 + 4 = 32
            (與日期列同一個列高單位;內容盒 h-tag-md 置中,所以列高不跟字型行高走)。2026-11-25 前寫死 px-2 py-1.5(列高 33)。
            看得見的字 = Intl weekday short(「週日」);讀屏名稱 = long(「星期日」)。 */}
        <div role="row" className="grid grid-cols-7 shrink-0 border-b border-divider bg-muted">
          {weekdays.map((weekday, i) => (
            <div
              key={i}
              role="columnheader"
              aria-label={weekday.long}
              className="flex justify-center p-[var(--calendar-gap)] text-body text-foreground font-medium"
            >
              <span className="flex items-center h-tag-md">{weekday.short}</span>
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
            className="grid grid-cols-7 h-full"
            style={{ gridTemplateRows: `repeat(${weekCount}, minmax(var(--calendar-cell-min-h), 1fr))` }}
          >
            {/* WAI-ARIA grid 要求 row > gridcell 階層:每 7 天包成 role="row"(display:contents 保 CSS grid 佈局) */}
            {Array.from({ length: weekCount }, (_, rowIdx) => (
              <div key={rowIdx} role="row" style={{ display: 'contents' }}>
                {days.slice(rowIdx * 7, rowIdx * 7 + 7).map((date) => {
                  const inMonth = isSameMonth(date, refDate)
                  const isToday = isSameDay(date, resolvedToday)
                  const label = dayLabel(date)
                  // 比 24 寬的日期框:今天的實心底、1 號的「7月1日」→ 左右內距 8(calendar.spec.md「間距」日期框列【AI 推導】)
                  const wideDayBox = isToday || date.getDate() === 1
                  // 2026-06-01 allDay:全天事件排 cell 頂端(對齊 Google Calendar 全天列在上)——
                  // 排序已在 eventsByDate bucketing memo 內完成(D3 perf),cell 內 O(1) 查表
                  const dayEvents = eventsByDate.get(dayKey(date)) ?? []
                  const visibleEvents = dayEvents.slice(0, MAX_TILES_PER_CELL)
                  const overflowCount = dayEvents.length - visibleEvents.length
                  // 這一天的讀屏名稱:完整日期 + 筆數(含沒畫出來的),今天前面加前綴(calendar.spec.md「A11y 預設」;字串在 labels)。
                  // 1 號畫面上寫「7月1日」(dayLabel)不影響這裡。
                  const dayName = `${isToday ? labels.todayPrefix : ''}${labels.day(formatters.fullDate.format(date), dayEvents.length)}`
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
                            // 日期鈕與事件方塊自己的 onClick 都 stopPropagation;目前「+N」列與唯讀事件列不攔,點它們也會走到這裡
                            //(calendar.spec.md「命中區」要它們阻止冒泡,在「+N」可點與唯讀列那兩包改)
                            dayStopOf(e.currentTarget)?.focus({ preventScroll: true })
                            setFocusedDateState(date)
                            onDateClick(date)
                          },
                        }
                        : dayStop)}
                      className={cn(
                        // 格子四邊內距 4、日期框到第一列 4(都讀 --calendar-gap;calendar.spec.md「間距」【SPACING(定)】,
                        // 2026-11-25 前是 p-1.5 = 6,首版 86c5436c 寫的、沒有依據)。格高由週列的 grid 列決定(minmax(格最小高, 1fr)),
                        // 不寫 min-h;內容比格高多時裁掉、不撐高也不疊到下一週(每格放幾列依格高算,在事件版面那一包)。
                        'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)] min-w-0 overflow-hidden',
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
                        datesInteractive && 'hover:bg-neutral-hover',
                        // 點得到(點整格 = 在這天新增)→ 手形游標(hit-area-canonical.md 滑過原則一-3;先前只有日期數字鈕是手形,
                        // 格子空白處滑過會亮、點了會新增,游標卻是箭頭)
                        datesInteractive && 'cursor-pointer',
                        !datesInteractive && 'focus-visible:focus-ring-inset',
                      )}
                    >
                      {/* Date number = keyboard 入口,在格子左上【C10(改)】(2026-11-25 前在右上)。24 的框是**列高**(與事件列同一個列高單位),
                          **不是**某條最小點擊尺寸(先前這裡寫的「WCAG 2.5.8 ≥24」已於 2026-09-24 撤回)—— 本 DS 以滑鼠精度為前提,不拿觸控尺寸建議當依據
                          (owner = `ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)。
                          命中與懸停的相等關係成立在 **cell** 這一層:懸停回饋是整格的 `hover:bg-neutral-hover`
                          (上方 gridcell 的 className),而整格 div 的 onClick 就是同一個 onDateClick → 懸停形狀 ≡ 命中區。
                          這顆鈕本身沒有任何 hover 樣式、平日底色透明,所以它不是另一個獨立目標,而是同一個目標的鍵盤入口 + 焦點框幾何;
                          它完全落在宿主格內、動作與宿主相同,不會生出隱形帶也搶不走別人的點擊。
                          規格 → `calendar.spec.md`「Cell 規則」的「命中區」條;量測 → scripts/calendar-month-invariant.mjs(日期框離格邊 4 / 4、高 24)。
                          唯讀的格:日期數字是同一個盒、同一組字級與今天 pill,只是 <span>(不是按鈕、沒有手形游標) */}
                      <div className="flex items-start justify-start">
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
                          </>
                        )}
                      </div>

                      {/* Event tiles:列距 4(--calendar-gap;item-anatomy.spec.md:467 standalone pill ≥ 4,2026-11-25 前 gap-0.5 = 2)。
                          shrink-0:列是固定高的單位(Tag md 24),格子比內容矮時**不壓扁列**,放不下的列由格子的 overflow-hidden 裁掉
                          (calendar.spec.md「每一週等高」;每格放幾列依格高算在事件版面那一包)。2026-11-25 首版這裡是 min-h-0,
                          讓這一層可以被壓、裡面的列跟著縮:最小高的週事件列只剩 23、格子再矮多筆的列縮到 21、「+N」縮到 15.6。 */}
                      <div className="flex flex-col gap-[var(--calendar-gap)] shrink-0">
                        {visibleEvents.map((event) => {
                          const ec = event.color ?? 'blue'
                          // 可點的方塊帶滑過(CAT_EVENT),唯讀的不帶(CAT_SUBTLE);兩者同色相同底同字,見檔頭 EVENT_STATIC_COLOR_CLASSES
                          const hueClass = readOnlyEvents ? EVENT_STATIC_COLOR_CLASSES[ec] : EVENT_COLOR_CLASSES[ec]
                          // 全天:淡底 + 左 accent 條(色條改給有時段事件、全天拿掉色條在事件長相那一包)。
                          // 字重跟事件列 = Tag md 的 font-normal,2026-11-25 前全天另加 font-medium(calendar.spec.md「間距」事件列列)。
                          const colorClass = event.allDay ? cn(hueClass, EVENT_ALLDAY_ACCENT[ec]) : hueClass
                          if (renderEventTile) {
                            // 自訂視覺也照同一份可點 / 唯讀契約:外層 wrapper 由本元件 own(spec「A11y 預設」renderEventTile 段);
                            // 外層固定一列高 h-tag-md(calendar.spec.md「renderEventTile 的鍵盤責任歸屬」:回傳內容必須放得進一列的高度)。
                            return readOnlyEvents ? (
                              // 唯讀:只包一層排版用的 div —— 不是按鈕、不進格內導覽(沒有 data-calendar-tile)、沒有焦點框
                              <div key={event.id} className="h-tag-md">{renderEventTile(event)}</div>
                            ) : (
                              <div
                                key={event.id}
                                role="button"
                                // 與內建 tile 同一條:grid 單一 Tab 停靠點,自訂 tile 也不得自己是停靠點
                                tabIndex={-1}
                                data-calendar-tile=""
                                {...escapeLayerProps(true)}
                                aria-label={`事件:${event.title}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onEventClick(event)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onEventClick(event)
                                  }
                                }}
                                // 焦點框往外(= 不寫 class):列距 4、格子內距 4,四周淨空 ≥ 4(calendar.spec.md「焦點框」;與內建 tile 同一條)
                                className="h-tag-md rounded-md"
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
                              {...eventTileMode}
                            />
                          )
                        })}
                        {/* 「+N」列:與事件列同高 24、左右內距 8(calendar.spec.md「間距」「+N」列)。本包只換尺寸,
                            可點(原生 button、開清單、阻止冒泡)與字色在「+N」清單那一包。 */}
                        {overflowCount > 0 && (
                          <div className="flex items-center h-tag-md px-[var(--calendar-text-inset)] text-caption text-fg-muted">
                            {moreLabel(overflowCount)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
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
    fg: ['text-fg-muted', 'text-foreground'],
    ring: ['focus-ring-inset', '--ring'],
  },
} as const

export { Calendar }
