/**
 * @internal — Calendar 月檢視的幾何常數:唯一住處(calendar.spec.md「間距」【SPACING(定)】)。
 *
 * 不進任何出口(元件資料夾的 index 只轉出口 .tsx;root barrel 不收元件資料夾的 .ts),只給 Calendar 自己讀。
 *
 * ── 消費的 SSOT ──
 * - components: [Tag(列高 = Tag md 盒高;與 tag.tsx `TAG_HEIGHT_PX.md` 同值,scripts/calendar-geometry-invariant.mjs 鎖)]
 * - tokens: [--tag-height-md(CSS 側的同一個列高;它與 TAG_HEIGHT_PX 相等由 scripts/token-twin-invariant.mjs 鎖)]
 * - utilities: [border-b(格線 = Tailwind `border` 預設寬 1px,算進格最小高)]
 * - spec refs: calendar.spec.md「間距」表、tag.spec.md「尺寸」(:196-200 Tag px / Text px 4)、
 *   item-anatomy.spec.md:467(有底色 + 圓角 + 內縮的 standalone pill,清單 gap ≥ 4)、
 *   calendar.spec.md「Cell 規則」週數欄寬【Q10b(定)】、「窄寬度」門檻【Q8(定);值為 AI 推導】
 *
 * ── 為什麼是元件自己的值、不開 token ──
 * token-system.spec.md 判斷流程第 0 題:只有 Calendar 讀、不隨密度切換 → 元件自己的值,不開全系統的名字【AI 推導】。
 * 寫成**元件內變數**(只在 Calendar 根節點的 style 上設值、只有 Calendar 自己讀;不在 :root 宣告、不登記分類表),
 * 先例 Sidebar 的 `--sidebar-rail-icon-slot`(token-system.spec.md「命名」)。class 一律寫 `p-[var(--calendar-gap)]` 這種形式,
 * 格內不寫死數字(calendar.spec.md「禁止事項」;閘 scripts/calendar-geometry-invariant.mjs)。
 * 代價:Tag 的「Tag px」哪天改了,這裡的 4 不會自動跟 —— 4 在這裡是「格內所有空隙」,不是 Tag 的內距本身;依據寫在下方註解。
 *
 * JS 與 CSS 同源(M17):列數算式(calendar.spec.md「每格筆數」k,`calendarRowsThatFit`,含格線 `CALENDAR_GRID_LINE_PX`)讀這裡的數字,
 * 畫面讀 `CALENDAR_GEOMETRY_STYLE` 設出去的變數;跨日長條的寬(`calendarPieceWidth`)讀同一批變數。
 */
import type * as React from 'react'

/**
 * 列高單位:日期框、事件列、「+N」列、星期列內容的高 = Tag md 盒高(24)。CSS 側用 `h-tag-md` 讀 `--tag-height-md`。
 * 寫成同值常數、不 import tag.tsx 的 `TAG_HEIGHT_PX`:tag.tsx 頂層有 cva(...) 等打包器搖不掉的呼叫,import 一個數字會把整個 Tag 模組
 *(含 ItemInlineActionButton)帶進 Calendar 的包 —— 2026-11-25 實測 gzip 含相依 46.5 → 54.3 kB(+7.8)。
 * 兩邊相等由 scripts/calendar-geometry-invariant.mjs 從 tag.tsx 讀 `TAG_HEIGHT_PX.md` 逐值鎖住(同 token-twin-invariant 的雙生常數做法):
 * Tag md 盒高改了、這裡沒跟,閘就紅。
 */
export const CALENDAR_ROW_HEIGHT_PX = 24

/**
 * 格內所有空隙(4):列距、格子四邊內距、日期框到第一列、事件文字兩層內距的每一層。
 * 依據:tag.spec.md:196-200 Tag md 的「Tag px」4、「Text px」4;item-anatomy.spec.md:467 standalone pill 清單 gap ≥ 4;
 * 也等於 Tag 與 Tag 之間 4(tag.spec.md「圓角與間距」)。格子內距與列距同值 → 格邊到事件列 = 事件列到事件列(四邊等距)。
 */
export const CALENDAR_GAP_PX = 4

/** 文字內距(8 = 4 + 4,Tag 的「Tag px」+「Text px」):比 24 寬的日期框(今天、1 號的「7月1日」)與「+N」列左右用。 */
export const CALENDAR_TEXT_INSET_PX = 2 * CALENDAR_GAP_PX

/**
 * 有時段事件的色條寬(4):色條佔 Tag 的「Tag px」那 4、後接間隔 4(=「Text px」)→ 字左緣 = 4 + 4 = 文字內距 8,
 * 與全天長條(外層 4 + 文字 4)同一條線(calendar.spec.md「間距」有時段的色條列;修 2026-11-25 前有色條的字右偏 3px)。
 * 色條的顏色在 categorical-color.ts `CAT_ACCENT`(只給顏色、不寫寬),高 = 字高(`--font-body-size`)、圓頭(`rounded-sm`)在 calendar.tsx【BAR(定)】。
 * 「色條寬 + 間隔 = 文字內距」由 scripts/calendar-geometry-invariant.mjs 核對。
 */
export const CALENDAR_ACCENT_WIDTH_PX = CALENDAR_GAP_PX

/**
 * 格線(每格自己的底線)= 1:格子的 `border-b` 是 Tailwind `border` 的預設寬 1px(本元件的 class 不准寫數字型邊框寬,
 * scripts/calendar-geometry-invariant.mjs 守,所以格線只可能是這個預設值)。
 * 格子是 border-box、底線畫在格高**裡面**:格高要把它算進去,內容才拿得到「上內距 + 日期框 + 列距 + 一列 + 下內距」的完整高度。
 * 2026-11-25 首版格最小高沒算它(60),內容只剩 59 —— 事件列被壓成 23、或不壓就吃掉 1px 下內距(三條規格只能同時成立兩條)。
 */
export const CALENDAR_GRID_LINE_PX = 1

/**
 * 格最小高 = 上內距 + 日期框 + 日期到第一列 + 一列 + 下內距 + 格線(4 + 24 + 4 + 24 + 4 + 1 = 61):
 * 至少看得到一列(或「+N」),而且那一列是完整的 24、下內距是完整的 4【AI 推導,calendar.spec.md「每一週等高」】。
 * 容器比「週數 × 格最小高」還矮時,週列在格陣的捲動區裡捲。
 * 最後一週沒有底線(根節點外框就是那一條):它在最小高時下方多 1px 空白,不會少。
 */
export const CALENDAR_CELL_MIN_HEIGHT_PX =
  CALENDAR_GAP_PX + CALENDAR_ROW_HEIGHT_PX + CALENDAR_GAP_PX + CALENDAR_ROW_HEIGHT_PX + CALENDAR_GAP_PX + CALENDAR_GRID_LINE_PX

/**
 * 週數欄放得下的最多位數:一年的週數是 1–53(date-fns `getWeek`),最寬兩位。
 * 欄寬 = 格子左內距 × 2 + 最寬週數(calendar.spec.md「Cell 規則」週數欄【Q10b(定)】;「間距」表週數欄寬那一列)。
 */
export const CALENDAR_WEEK_NUMBER_DIGITS = 2

/**
 * 窄寬度門檻:**欄寬**(一個日期格的外框寬,含它自己的右格線)≤ 這個值就是「窄」—— 星期縮一字(`Intl` `weekday: 'narrow'`)、
 * 1 號只顯示「1」,有時段列拿掉時間也讀同一個旗標(calendar.spec.md「窄寬度」【Q8(定)、總帳更正 #8】)。
 * 值 60【AI 推導,實量後回報 user】:起點取 FullCalendar 的 micro 門檻(欄寬 ≤ 60 拿掉時間、星期縮一字、只顯示「+N」;
 * `dayMicroWidth = 60` 與 `cellIsMicro = measuredColWidth <= dayMicroWidth`,
 * <https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/daygrid/components/DayGridLayoutNormal.tsx#L78>)。
 * 2026-11-25 在 1280 × 900 實量現有範例的欄寬:展示 / 設計規格各則 178、設計原則三則 141.14、「與 DatePicker 的分工」那則(半寬)69.28 ——
 * 都沒有跨過,現有範例的畫面不變。只看欄寬、不看內容寬:欄是 `minmax(0, 1fr)`,縮內容不會讓欄寬變,旗標不會來回跳
 *(scripts/calendar-month-invariant.mjs 掃 20 個寬度量)。
 */
export const CALENDAR_NARROW_COLUMN_MAX_PX = 60

/**
 * 事件詳情浮層的寬(PopoverContent `width` 數字;calendar.spec.md「事件詳情浮層」外殼「寬先用 Popover 預設,不夠才傳 `width` 數字,不新增寬度檔位」)【AI 推導,實量後回報 user】。
 * 唯一目的:時間欄進編輯的 `DatePicker.Range showTime` 兩端的字不被裁。平常的檢視(一段合併文字)在 288 就放得下,
 * 但浮層寬不隨編輯 / 全天切換變,所以一律用這個寬。量法(兩端平分多出來的寬):每端分到 = 91 + (寬 − 288) ÷ 2。
 * - 2026-11-26 在 1280 × 900 實量(團隊行事曆「設計審查」):Popover 預設 288 時每端只分到 91,當時的字「2026/07/05 10:00」每端要 113–115
 *   → 至少 288 + 2 × 24 = 336,取 22rem = 352(預設 18rem 之上的整數 rem;多 16 給字型 / 語系差異的餘量)。
 * - 同日 DATE-TIME(定)後時間 12 / 24 跟語系,預設 zh-TW 編輯中的字變成「2026/07/05 上午10:00」:多兩個中文字(字級 14 → 約 +28),
 *   每端約要 141–143,352 時每端只分到約 123 → 會被裁【AI 推算,未實量】。照同一套量法:至少 288 + 2 × (143 − 91) = 392,
 *   加同樣 16 的餘量 = 408,取整數 rem 26rem = 416(每端約分到 155;en-US「07/05/2026, 10:00 AM」估每端約 146 也放得下)。
 *   實量由 scripts/calendar-month-invariant.mjs DT-time-fit(一般 / 大密度,編輯中兩端 scrollWidth ≤ clientWidth,訊息印每端要的寬與分到的寬)在 CI 讀回。
 */
export const CALENDAR_EVENT_DETAIL_WIDTH_PX = 416

/**
 * 量到的版面尺寸是 Chromium 的 LayoutUnit(1/64 px)取整後的值:高 117 的格子可能量成 116.984。
 * 每格列數取整數前加回這一點點,「剛好放滿」那一格才不會因為取整少一列(差距小於一個 LayoutUnit 不是真的放不下)。
 */
const LAYOUT_UNIT_PX = 1 / 64

/**
 * 每格放得下幾列 k(calendar.spec.md「每格筆數與「+N」」算式【AI 推導】):
 * k = max(1, ⌊(格高 − 格線 − 上內距 − 日期框高 − 日期到第一列 − 下內距 + 列距) ÷ (列高 + 列距)⌋)。
 * 格高 = 量到的格子外框(border-box,含自己的底線 1;最後一週沒有底線,照同一式算只是下方多 1px 空白)。
 * 每一項都讀本檔的常數 —— 畫面讀的是同一批常數設出去的 --calendar-* 與 --tag-height-md(M17:JS 與 CSS 同源)。
 * Calendar 量到格高後把結果當 `maxRows` 交給 calendar-layout.ts 的 `layoutMonth`;判定表與「是誰算的」靜態檢查在 scripts/test-calendar-layout.mjs。
 */
export function calendarRowsThatFit(cellHeightPx: number): number {
  const content = cellHeightPx - CALENDAR_GRID_LINE_PX - CALENDAR_GAP_PX - CALENDAR_ROW_HEIGHT_PX - CALENDAR_GAP_PX - CALENDAR_GAP_PX
  return Math.max(1, Math.floor((content + CALENDAR_GAP_PX + LAYOUT_UNIT_PX) / (CALENDAR_ROW_HEIGHT_PX + CALENDAR_GAP_PX)))
}

/**
 * 一段事件的寬(calendar.spec.md「跨日長條」實作備註【AI 推導】:長條的 DOM 放在它這一週第一個看得見的日子的格子裡,寬度畫過後面幾格)。
 * 只橫跨一格 → undefined(格子裡的一列,寬 = 格子內容寬,不另給)。橫跨 span 格 → 從第一格內容左緣到最後一格內容右緣:
 * 一欄寬 = 第一格內容寬(100%)+ 左右內距 + 它自己的右格線;寬 = span 欄 − 左右內距 − 最後一格的右格線(這一列最右那格不畫右線,
 * calendar.tsx 格子的 `last:border-r-0`)。欄是等分的(`minmax(0, 1fr)`),週數欄不在裡面 —— 隱藏週末與週數欄都不改這個式子。
 * POC(M2,2026-11-25,Chromium 1217):7 欄 / 5 欄 / 加週數欄、終點在最後一欄各量一次,長條右緣 = 最後一格內容右緣(離格線內緣 4 = 右內距)± 0.02。
 */
export function calendarPieceWidth(span: number, endsAtLastColumn: boolean): string | undefined {
  if (span <= 1) return undefined
  return `calc(${span} * (100% + 2 * var(--calendar-gap) + var(--calendar-grid-line)) - 2 * var(--calendar-gap) - ${endsAtLastColumn ? '0px' : 'var(--calendar-grid-line)'})`
}

/** 設在 Calendar 根節點 style 上的元件內變數(名字用主人開頭 `--calendar-`;只有 Calendar 自己讀)。 */
export const CALENDAR_GEOMETRY_STYLE = {
  '--calendar-gap': `${CALENDAR_GAP_PX}px`,
  '--calendar-text-inset': `${CALENDAR_TEXT_INSET_PX}px`,
  '--calendar-cell-min-h': `${CALENDAR_CELL_MIN_HEIGHT_PX}px`,
  // 有時段事件的色條寬(CALENDAR_ACCENT_WIDTH_PX)
  '--calendar-accent-w': `${CALENDAR_ACCENT_WIDTH_PX}px`,
  // 格線寬(跨日長條的寬度式子要加回中間每一格的右格線,calendarPieceWidth)
  '--calendar-grid-line': `${CALENDAR_GRID_LINE_PX}px`,
  // 週數欄寬 = 2 × 格子內距 + 最寬週數。`ch` = 「0」的字寬,在用到這個變數的元素上解析(星期列與週列兩個格陣容器都是 text-body,
  // 所以兩邊的週數欄同寬)。POC(M2,2026-11-25,Chromium 1217 / macOS,text-body 14px):tabular-nums 的兩位數實寬 17.34、2ch = 17.63,
  // 差 0.28(zh-TW 與 en-US 兩個 lang 相同)< 0.5 → 用 calc 不另外量;差超過 0.5 時改成量到後寫進同一個變數。
  '--calendar-week-number-w': `calc(2 * var(--calendar-gap) + ${CALENDAR_WEEK_NUMBER_DIGITS}ch)`,
} as React.CSSProperties
