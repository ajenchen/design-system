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
 *   item-anatomy.spec.md:467(有底色 + 圓角 + 內縮的 standalone pill,清單 gap ≥ 4)
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

/** 設在 Calendar 根節點 style 上的元件內變數(名字用主人開頭 `--calendar-`;只有 Calendar 自己讀)。 */
export const CALENDAR_GEOMETRY_STYLE = {
  '--calendar-gap': `${CALENDAR_GAP_PX}px`,
  '--calendar-text-inset': `${CALENDAR_TEXT_INSET_PX}px`,
  '--calendar-cell-min-h': `${CALENDAR_CELL_MIN_HEIGHT_PX}px`,
} as React.CSSProperties
