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
 * JS 與 CSS 同源(M17):列數算式(calendar.spec.md「每格筆數」k,含格線 `CALENDAR_GRID_LINE_PX`)讀這裡的數字,
 * 畫面讀 `CALENDAR_GEOMETRY_STYLE` 設出去的變數。
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

/** 設在 Calendar 根節點 style 上的元件內變數(名字用主人開頭 `--calendar-`;只有 Calendar 自己讀)。 */
export const CALENDAR_GEOMETRY_STYLE = {
  '--calendar-gap': `${CALENDAR_GAP_PX}px`,
  '--calendar-text-inset': `${CALENDAR_TEXT_INSET_PX}px`,
  '--calendar-cell-min-h': `${CALENDAR_CELL_MIN_HEIGHT_PX}px`,
  // 週數欄寬 = 2 × 格子內距 + 最寬週數。`ch` = 「0」的字寬,在用到這個變數的元素上解析(星期列與週列兩個格陣容器都是 text-body,
  // 所以兩邊的週數欄同寬)。POC(M2,2026-11-25,Chromium 1217 / macOS,text-body 14px):tabular-nums 的兩位數實寬 17.34、2ch = 17.63,
  // 差 0.28(zh-TW 與 en-US 兩個 lang 相同)< 0.5 → 用 calc 不另外量;差超過 0.5 時改成量到後寫進同一個變數。
  '--calendar-week-number-w': `calc(2 * var(--calendar-gap) + ${CALENDAR_WEEK_NUMBER_DIGITS}ch)`,
} as React.CSSProperties
