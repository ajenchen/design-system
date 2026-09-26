/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 DatePicker wrap 消費,end-user app 請用 wrapper 元件。
 */
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// M22 retrofit DONE 2026-05-03 v11(real source URLs added inline at lines 38 + 111)
import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import 'react-day-picker/style.css'

import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'

/**
 * DateGrid — DayPicker 包裝,用本 DS token 覆寫預設視覺。
 *
 * ── 視覺對照(ref/datepicker.png,2026-04-21 rewrite)──
 *
 * | 區塊 | 規格 |
 * |------|------|
 * | Outer padding | `p-3`(12px 四邊對稱) |
 * | Nav + Month caption row | h-field-xs(24px)單行,chevron(xs)分居左右 / 月份置中垂直對齊 |
 * | Nav → Weekday gap | 12px(month_caption mb-3) |
 * | Weekday | text-body(14px)text-foreground font-medium(neutral-9,同 caption 權重;撤銷 v3 fg-secondary) |
 * | Cell gap(水平 + 垂直)| 4px(table-native border-separate border-spacing-1;非 gap — grid 會 break,見下方 v7 註) |
 * | Day cell size | h-field-sm w-[var(--field-height-sm)](28×28 md / 32×32 lg) |
 * | Day button | rounded-full 填滿 cell |
 *
 * ── 五種 cell state canonical ──
 *
 * | State | 視覺 | Token |
 * |-------|------|-------|
 * | today | 數字下方藍色短桿 | `::after` pseudo bar(bg-primary,w-40% h-1.5px rounded-full,貼近數字底)|
 * | disabled | 灰底圓圈 + disabled 字色(跟 Button disabled 一致) | [&>button]:bg-disabled [&>button]:text-fg-disabled rounded-full |
 * | outside(非本月) | 單月:text-fg-muted(neutral-7)—— **僅在該日仍可點、且未被選中時**(不可點讓位 disabled、選中讓位藍底白字,M24);**兩月以上不渲染**(numberOfMonths > 1 強制 showOutsideDays=false) | [&:not([data-selected])>button:not(:disabled):not([aria-disabled="true"])]:text-fg-muted |
 * | selected / range 端點 | 藍底白字圓 | [&>button]:bg-primary [&>button]:text-on-emphasis rounded-full |
 * | range middle | 灰底矩形 track(bg-neutral-selected = neutral-2),**高度 = cell 高度**(28×28 @ md) | before pseudo: `inset-y-0 -inset-x-[2px]` |
 * | range start/end 半圓 track | 左/右半圓 + selected 圓疊在上,**圓半徑 = button 半徑** | before pseudo: `rounded-l/r-full` + start `left-0 -right-[2px]` / end `-left-[2px] right-0`(向 middle 外擴 2px bridge gap)|
 * | hover(未選中) | 藍圈 outline | hover:ring-[1.5px] hover:ring-primary-hover(2026-07-07 統一:瞬時 hover = hover 階)|
 * | range 預覽框(停留 / 焦點,只有 DatePicker.Range 會算出) | 同色同粗的藍色細框,把「點下去會變成」的區間框起來;兩端半圓、與 track 同高;停留日就是框的那一端(不再畫單格圈) | td `::after`(track 用 `::before`):`RANGE_PREVIEW_CLASSNAMES`,ring / inset 陰影 1.5px primary-hover(不用 border:1.5px 會被取整成 1px);user 2026-09-23 拍板 |
 *
 * ── Range track 高度 canonical(2026-05-03 v6,M8 4 家對照)──
 * Ant Design([picker source](https://github.com/ant-design/ant-design/blob/master/components/date-picker/style/panel.ts))/ Material X DateRangePicker([mui-x source](https://github.com/mui/mui-x/tree/master/packages/x-date-pickers-pro/src/DateRangeCalendar))/ Apple Calendar `@benchmark-unverified`(closed-source)/ Google Calendar `@benchmark-unverified`(closed-source)共識:
 * **range track 為連續 stadium**,跟 selected 圓緊貼成連續 pill。
 * 實作:bg 走 `before:` pseudo 用 `inset-y-0`(滿 cell 高度)+ `-inset-x-[2px]`
 * (左右各外擴 2px bridge 相鄰 cell gap)→ 相鄰 cell 的 pseudo 連續銜接 = 橫向連貫;
 * day cell 本身就是 button 容器(L102-105 day = h-field-sm cell),故滿 cell 高 = 滿 button 高。
 *
 * ── Range track 色用 bg-neutral-selected(= neutral-2)──
 * 對齊 TimePicker 選中項目樣式(semantic `--neutral-selected` = neutral-2,semantic.css L84/L340)。
 * 同 DS 內「持續選中」語意 token,不自開 neutral-3 tier。
 *
 * ── 為什麼 nav 放頂部 + 年月垂直置中(不 separate 兩行)──
 * ref/datepicker.png:chevron prev / 月份 / chevron next 同一行,24px 高(xs field height)。
 * 省垂直空間,使用者視線不需上下跳。世界級(Google Calendar / Apple / iOS 日期輸入)皆此佈局。
 */

export type DateGridProps = React.ComponentProps<typeof DayPicker>

// ── Range 視覺的唯一住所(2026-09-23)──
// 已選區間的灰色 track(td `::before`)與停留預覽的藍色框(td `::after`)兩組 class 只宣告在這裡。
// DateGrid 自己的 RDP range 模式(下方 classNames.range_*)和 DatePicker.Range 自管的 modifiers
//(modifiersClassNames)都從這裡拿 —— 先前 track 的 stadium class 在兩個檔各抄一份,是假 SSOT(M17)。
//
// 幾何(spec「Range track canonical」+「區間預覽框」):
//   - inset-y-0 = 滿 cell 高(= button 高,28 @ md);左右各外擴 2px 接鄰格的 border-spacing 縫
//   - 起點 / 終點只在朝外那一側畫側邊與半圓(rounded-l/r-full,圓半徑 = button 半徑,和藍圓同弧)
//   - 列首 / 列尾不畫側邊(換列處框是開口的,與 track 同款;month_grid 的 first/last-child 規則把外擴歸零)
//   - 單格(起訖同一天)= 完整一圈
//   - 停留日不再畫 button 的 hover 圈:框的半圓端點就是它(user 2026-09-23:「所 hover 的日期的藍框不會是完整的
//     圓形,而會是一個半圓,至於這個半圓的缺口朝向哪一邊則取決於正在選的是起始日還是結束日」)
export const RANGE_TRACK_CLASSNAMES = Object.freeze({
  start: cn(
    "before:content-[''] before:absolute before:inset-y-0",
    'before:left-0 before:-right-[2px]',
    'before:bg-neutral-selected before:pointer-events-none',
    'before:rounded-l-full',  // ← stadium 左半圓 matches button 圓的左半弧
  ),
  middle: cn(
    "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
    'before:bg-neutral-selected before:pointer-events-none',
  ),
  end: cn(
    "before:content-[''] before:absolute before:inset-y-0",
    'before:-left-[2px] before:right-0',
    'before:bg-neutral-selected before:pointer-events-none',
    'before:rounded-r-full',  // ← 鏡像
  ),
})

// 框的顏色與粗細逐字沿用單日 hover 圈(day_button 的 hover:ring-[1.5px] hover:ring-primary-hover):同一套語言,
// 不新增第二種「暫定」表達(user 2026-09-23 Q2 拍板選實線,不用 Ant v4 / MUI 的虛線)。
// **用 ring(box-shadow)畫、不用 border**:瀏覽器把 border-width 1.5px 在 DPR 1 取整成 1px(閘實測 computed 1px),
// box-shadow 不取整 —— 只有這樣才跟 hover 圈同一種筆觸(同色、同粗、同反鋸齒),不是「看起來差不多」。
const PREVIEW_FRAME = cn(
  "after:content-[''] after:absolute after:inset-y-0 after:pointer-events-none",
  // 停留日的單格圈讓位給框的端點(preview 的四種格都可能是停留日)
  '[&>button]:hover:!ring-0',
)
// 端點與單格:整圈內描邊(沿弧線等粗)。端點再把朝區間內側那 2px(外擴接縫區)裁到只剩上下兩條 1.5px 帶,
// 直邊消失、半圓的缺口就朝向區間(user Q5)。clip-path 裡的 2px = 外擴量,1.5px = 筆觸寬 —— 兩個數字都不是獨立的。
const PREVIEW_STROKE = 'after:ring-inset after:ring-[1.5px] after:ring-primary-hover'
const CLIP_INNER_RIGHT = 'after:[clip-path:polygon(0_0,100%_0,100%_1.5px,calc(100%_-_2px)_1.5px,calc(100%_-_2px)_calc(100%_-_1.5px),100%_calc(100%_-_1.5px),100%_100%,0_100%)]'
const CLIP_INNER_LEFT = 'after:[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,0_calc(100%_-_1.5px),2px_calc(100%_-_1.5px),2px_1.5px,0_1.5px)]'
export const RANGE_PREVIEW_CLASSNAMES = Object.freeze({
  start: cn(PREVIEW_FRAME, PREVIEW_STROKE, 'after:left-0 after:-right-[2px] after:rounded-l-full', CLIP_INNER_RIGHT),
  // 中段只有上下兩條線:兩個各 1.5px 的 inset 陰影(ring 畫不了單邊)
  middle: cn(PREVIEW_FRAME, 'after:-inset-x-[2px] after:shadow-[inset_0_1.5px_0_0_var(--primary-hover),inset_0_-1.5px_0_0_var(--primary-hover)]'),
  end: cn(PREVIEW_FRAME, PREVIEW_STROKE, 'after:-left-[2px] after:right-0 after:rounded-r-full', CLIP_INNER_LEFT),
  single: cn(PREVIEW_FRAME, PREVIEW_STROKE, 'after:inset-x-0 after:rounded-full'),
})
// 某一格是不是正畫著框的**端點**(起點 / 終點 / 單格)。判準就是上面這三串 class 有沒有整串落在那個 td 上 ——
// 框正是由它們畫出來的,而它們只住在本檔(DatePicker.Range 原樣交給 modifiersClassNames),所以這一問就是「框的端點畫在這格上嗎」
// 本身,不是旁證(M37)。中段只有上下線、不算端點。用在下方「縫或角裡點下去 = 點停留日」:停留日一定是框的端點,
// 不是端點(框是鍵盤那一天設的、或根本沒有框)就不接那一下點擊。
const PREVIEW_END_TOKENS = [RANGE_PREVIEW_CLASSNAMES.start, RANGE_PREVIEW_CLASSNAMES.end, RANGE_PREVIEW_CLASSNAMES.single]
  .map((classes) => classes.split(/\s+/).filter(Boolean))
const drawsPreviewEnd = (cell: Element | null) =>
  !!cell && PREVIEW_END_TOKENS.some((tokens) => tokens.every((token) => cell.classList.contains(token)))
// 預覽「上膛」的格(停留會有框的那些天)**靜態**壓掉 button 的單格 hover 圈。
// 單格圈是 CSS :hover,指標一到就畫;框是 React 狀態,慢一幀。只靠上面 PREVIEW_FRAME 裡的壓制(掛在停留後才出現的
// preview modifier 上),每次停留都會先閃一圈整圓、再變成半圓(user 2026-09-23:「hover 到日期都會先看到一圈圓形藍色外框,
// 閃了一下,才會變成半圓」)。壓制不能依賴慢的那一邊 —— 由 consumer 用「這一天停留會不會有框」當 modifier,停留前就掛好;
// 順序不合的日子(不會有框)與對面那端還空時(沒東西可接)不掛,單格圈照畫。
export const RANGE_PREVIEW_ARMED_CLASSNAME = '[&>button]:hover:!ring-0'
// 藍底格(選中日 / 區間端點)上的鍵盤焦點:1px 白線退 3px(styles/base.css `focus-ring-inset-emphasis`;
// focus-canonical「填色元素上的內描邊」,2026-09-23 user 拍板 D)。`[&>button]:focus-visible:` 的特異性高過
// day_button 自己的 `focus-visible:focus-ring-inset`,藍底格由這條勝出。
export const EMPHASIS_FOCUS_RING_CLASSNAME = '[&>button]:focus-visible:focus-ring-inset-emphasis'

// ── SR label 中文 formatter(2026-07-05)──
// 走 Intl.DateTimeFormat(對齊 TimePicker / Calendar 既有 canonical,不引第二套 date lib);
// module-level 建一次 — label fn 每個 day cell 都會呼叫,避免 per-call new formatter。
const ZH_FULL_DATE = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' })
const ZH_MONTH_YEAR = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' })
const ZH_WEEKDAY = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' })

// 可點的日子 = 沒有 disabled、也沒有 aria-disabled 的那顆 button(RDP 對鍵盤焦點落在不可選日時改掛 aria-disabled)
const CLICKABLE_DAY = 'button:not(:disabled):not([aria-disabled="true"])'

// ── 「縫或角」:格陣裡不屬於任何一天、但仍算「指標還在上一天身上」的位置(2026-09-26 補上「角」)──
//   (a) 縫:既不在 `<td>` 也不在 `<th>` 上 —— border-spacing 的 4px 空白、表格最外圈,都屬於 `<table>` 自己;
//   (b) 角:在某個**可點日子**的 `<td>` 裡、但不在它那顆 button(28px 的圓)上 —— 圓放在 28×28 的方格裡,圓外的四個角屬於 td。
// 停在不可點的日子(含它的角)、空白補位格、星期列、或格陣之外 → 都不算,照常清掉。
// 先前只有 (a):角被當成「已經離開」,指標只要沒走在格子正中線上(偏 1/4 格、貼邊、斜著走)就先清框再補回 ——
// 2026-09-26 實測整條框(17 格)消失 6–14 步(每步 1px),淺深色相同(世界級對照與一手出處:date-grid.spec.md「縫與角裡的點擊」)。
// 格陣自己的判斷(`grid.contains(cell)`):整張 DateGrid 若被放進別的表格的格子裡,`closest('td,th')` 會找到外面那一格,
// 那仍是本格陣的縫,不是「離開」。
function isGapOrCorner(node: EventTarget | null, grid: Element | null): boolean {
  if (!(node instanceof Element) || !grid || !grid.contains(node)) return false
  const cell = node.closest('td,th')
  if (!cell || !grid.contains(cell)) return true // (a) 縫
  if (cell.tagName !== 'TD') return false // 星期列
  const button = node.closest('button')
  if (button && cell.contains(button)) return false // 就在那顆圓上(可點與否都不是縫也不是角)
  return cell.querySelector(`:scope > ${CLICKABLE_DAY}`) !== null // (b) 可點日子的角
}

// 縫或角裡「點下去會確認」時掛在格陣上的屬性,只用來把游標變成跟日期一樣的手形
//(日期是 button,手形來自 styles/base.css「button:not(:disabled) { cursor: pointer }」)。
// 下方 month_grid 的 `data-[gap-confirms]:cursor-pointer` 讀的就是它 —— 兩處字串必須一致。
// 用屬性而不是 React state:它跟著指標每一步變,不該讓整張格陣重畫(同 tabs.tsx 的 data-action-hover、data-table.tsx 的 data-hovered)。
const GAP_CONFIRMS_ATTR = 'data-gap-confirms'

// 月曆格陣:在 react-day-picker 預設的 `<table {...props} />`
//(node_modules/react-day-picker/dist/esm/components/MonthGrid.js)上多掛這些東西 ——
//   (1) `data-day-grid` 錨點,給下方 handleDayMouseLeave 判斷「指標現在停在格陣的哪一種地方」;
//   (2) `onMouseOver`(由 context 遞進來),補掉「指標穿過縫或角之後停在不可點的日子」這條路徑;
//   (3) `onMouseLeave`(由 context 遞進來),補掉「指標從縫或角直接離開格陣」這條路徑(D1,見 handleGridMouseLeave);
//   (4) `onMouseMove` / `onPointerDown` / `onClick`(由 context 遞進來):縫或角裡的手形游標,與「在縫或角裡點下去 = 點停留日」。
// 只多屬性與事件,不改結構。
//
// ⚠️ **必須定義在 module 層,不能寫成 render 內的 inline 箭頭函式。** 寫成 inline 時每次 render 都是一個
// 新的 component type,React 會把整個格陣 unmount 再 mount,RDP 內部的焦點/動畫 effect 因此重新設 state,
// 立刻撞上「Maximum update depth exceeded」(React #185)—— 2026-09-24 第一版就是這樣寫的,storybook
// 整個 DatePicker range 故事白畫面。同檔的 PreviousMonthButton / NextMonthButton 是葉節點按鈕,沒有這個問題。
// handler 走 context 而不是 props,正是因為 RDP 只給 MonthGrid 固定的那組 props,塞不進額外的。
interface GridPointerHandlers {
  onMouseOver?: (event: React.MouseEvent<HTMLTableElement>) => void
  onMouseLeave?: (event: React.MouseEvent<HTMLTableElement>) => void
  onMouseMove?: (event: React.MouseEvent<HTMLTableElement>) => void
  onPointerDown?: (event: React.PointerEvent<HTMLTableElement>) => void
  onClick?: (event: React.MouseEvent<HTMLTableElement>) => void
}
const GridPointerContext = React.createContext<GridPointerHandlers>({})

function AnchoredMonthGrid(props: React.TableHTMLAttributes<HTMLTableElement>) {
  const { onMouseOver, onMouseLeave, onMouseMove, onPointerDown, onClick } = React.useContext(GridPointerContext)
  return (
    <table
      {...props}
      data-day-grid=""
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
  )
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DateGrid = React.forwardRef<HTMLDivElement, DateGridProps>(function DateGrid(
  {
    className,
    classNames,
    labels,
    showOutsideDays = true,
    numberOfMonths,
    onDayMouseEnter,
    onDayMouseLeave,
    onDayFocus,
    ...props
  },
  _ref,
) {
  // ── 停留日只在指標真的離開整張格陣時才清(2026-09-24;2026-09-26 把「角」也算進來)──────────────
  //
  // react-day-picker 只把 mouseenter / mouseleave 掛在 day button 上,而格與格之間的 4px
  // (`border-spacing-1`)屬於 `<table>`、不屬於任何一天;圓外的四個角屬於 `<td>`、也不屬於那顆圓。
  // 指標經過這些地方時瀏覽器必然先送一次 leave、再送 enter,消費端(DatePicker 的 previewAnchor)因此把整條區間
  // 預覽框卸掉再補回 —— user 2026-09-23 的原話是「從某日水平移動到其隔日,藍色的區間框線都會閃動一下」。
  //
  // 先前的解法是給 button 一條 `before:-inset-[2px]` 的隱形帶,讓縫裡也有人收 enter。
  // 那是**表層**解:它改的是命中幾何,而閃動的根因是「停留日被清掉」。而且它讓命中區(32)大於
  // 懸停回饋(28 圓 + 1.5px ring),違反 hit-area-canonical「懸停回饋的形狀 ≡ 命中區」,
  // 而日期格既不是線也不是點,吃不到那條唯一例外。
  //
  // 根因層的解法:**只在離開整個日曆時才清停留日** —— MUI X 把清除只掛在月份容器上
  //(v9.14.0 `DateRangeCalendar.tsx#L481-L486` `onMouseLeave: () => setRangePreviewDay(null)`,
  //  https://github.com/mui/mui-x/blob/c83b3dd6996f6913947b1be3e5d47655153ced60/packages/x-date-pickers-pro/src/DateRangeCalendar/DateRangeCalendar.tsx#L481-L486 ),
  // Zag(Chakra DatePicker 的底層)只掛在整張表格上(`date-picker.connect.ts#L546-L548` `onPointerLeave` →
  //  `send({ type: "TABLE.POINTER_LEAVE" })`,
  //  https://github.com/chakra-ui/zag/blob/46f88c089c1dbb0fc681b31172dc5eb8a07eef0d/packages/machines/date-picker/src/date-picker.connect.ts#L546-L548 )。
  // 本檔用同樣的判準:leave 事件的 `relatedTarget` 還落在同一張 `[data-day-grid]` 的**縫或角**裡(isGapOrCorner)就
  // **不轉發**給消費端。指標真的離開格陣時 relatedTarget 落在格陣外(或為 null = 離開視窗),照常轉發。
  //
  // 為什麼錨在 `data-day-grid` 而不是 `closest('table')`:標籤名是「剛好成立的觀察量」,不是要保證的性質
  //(M37);而且顯式屬性讓閘的對照組可以只用一行 `removeAttribute` 精準弄壞這個機制。
  // 閘:`scripts/datepicker-range-preview.mjs`「跨格不閃」(中線)+「角落路線」(偏離中線、貼邊、斜穿交會處)+ 同檔 `--selftest` 對照組。

  // 記住最後一次停留的日子與它的 button:下方補送 leave、縫或角裡的點擊都用得到
  //(消費端 DatePicker 的 onDayMouseLeave 兩個參數都沒用到,但契約要求帶,不能亂編)。
  const lastEnterRef = React.useRef<{
    day: Date
    modifiers: Parameters<NonNullable<typeof onDayMouseEnter>>[1]
    button: HTMLButtonElement | null
  } | null>(null)
  // 縫或角裡被吞掉的那一次 leave 還欠著沒送 = 停留日(預覽框)還掛在上一天身上。只有這種狀態才需要在離開格陣時補送,
  // 也只有這種狀態下,縫或角裡的點擊才會交給那一天。
  const owesLeaveRef = React.useRef(false)
  // 這一下點擊是哪一種指標按的(pointerdown 記、click 讀完就清)。只有滑鼠才有「滑過」:觸控的預覽框是上一次點的那一天,
  // 不是手指現在碰到的位置,所以觸控 / 觸控筆點在縫或角裡維持原樣(沒反應)。
  const pressPointerTypeRef = React.useRef<string | null>(null)
  // 滑鼠停留之後,鍵盤又把**看得見的**焦點移到某一天 = 最後一個輸入是鍵盤(date-picker.spec.md「滑鼠與鍵盤,最後一個輸入贏」),
  // 框改由焦點那一天決定,滑鼠所在的縫或角就不再代表框的停留端 —— 連「滑鼠上一天剛好是框另一端」的巧合也不接點擊。
  // 只讀焦點事件、不改任何鍵盤行為;滑鼠再進任何一天就歸零。
  const keyboardAfterPointerRef = React.useRef(false)

  // 「縫或角裡點下去會確認」的對象:指標正停在縫或角裡(leave 欠著)、上一天那顆 button 還在這張格陣裡而且可點、
  // 它那一格正畫著框的端點 —— 也就是「框亮著,而且框的停留端就是這一天」。沒有框(兩端都空、只有單格圈)就是 null:
  // 那時縫與角裡什麼都沒亮,點下去不該有反應(hit-area-canonical「懸停回饋的形狀 ≡ 命中區」)。
  // 手形游標與點擊用同一支判斷,游標不會說謊。
  const gapConfirmTarget = (grid: Element | null): HTMLButtonElement | null => {
    if (!owesLeaveRef.current || keyboardAfterPointerRef.current || !grid) return null
    const button = lastEnterRef.current?.button
    if (!button || !button.isConnected || !grid.contains(button) || !button.matches(CLICKABLE_DAY)) return null
    return drawsPreviewEnd(button.closest('td')) ? button : null
  }
  const syncGapCursor = (grid: Element | null) => {
    grid?.toggleAttribute(GAP_CONFIRMS_ATTR, gapConfirmTarget(grid) !== null)
  }

  const handleDayMouseEnter = (
    day: Date,
    modifiers: Parameters<NonNullable<typeof onDayMouseEnter>>[1],
    event: React.MouseEvent,
  ) => {
    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null
    lastEnterRef.current = { day, modifiers, button }
    owesLeaveRef.current = false
    keyboardAfterPointerRef.current = false
    syncGapCursor(button?.closest('[data-day-grid]') ?? null)
    onDayMouseEnter?.(day, modifiers, event)
  }

  const handleDayFocus = (
    day: Date,
    modifiers: Parameters<NonNullable<typeof onDayFocus>>[1],
    event: React.FocusEvent,
  ) => {
    if (event.currentTarget instanceof Element && event.currentTarget.matches(':focus-visible')) {
      keyboardAfterPointerRef.current = true
      syncGapCursor(event.currentTarget.closest('[data-day-grid]'))
    }
    onDayFocus?.(day, modifiers, event)
  }

  const handleDayMouseLeave =
    onDayMouseLeave &&
    ((day: Date, modifiers: Parameters<NonNullable<typeof onDayMouseLeave>>[1], event: React.MouseEvent) => {
      const from = (event.currentTarget ?? event.target) as Element | null
      const grid = from?.closest?.('[data-day-grid]') ?? null
      if (isGapOrCorner(event.relatedTarget, grid)) {
        owesLeaveRef.current = true
        syncGapCursor(grid)
        return
      }
      owesLeaveRef.current = false
      syncGapCursor(grid)
      onDayMouseLeave(day, modifiers, event)
    })

  // 補洞:指標**穿過縫或角之後停在不可點的日子**(順序不合而 disabled 的那些)、空白補位格或星期列。
  // 那條路徑上 button 的 leave 早在縫或角裡就發生過(被上面吞掉),而 disabled 的 button 收不到滑鼠事件、
  // 不會再有任何 day enter/leave —— 沒有這一段的話,上一天的預覽框會一直留著。
  // 判準跟上面同一條:停在縫或角裡不動作;停在其他 td / th 上,就補送一次 leave。
  const handleGridMouseOver =
    onDayMouseLeave &&
    ((event: React.MouseEvent<HTMLTableElement>) => {
      const grid = event.currentTarget
      const last = lastEnterRef.current
      if (!last) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(CLICKABLE_DAY)) return // 停在可點的日子 → 交給 RDP 的 enter
      if (isGapOrCorner(target, grid)) { syncGapCursor(grid); return } // 停在縫或角裡 → 視為還在上一天
      owesLeaveRef.current = false
      syncGapCursor(grid)
      onDayMouseLeave(last.day, last.modifiers, event)
    })

  // D1 補洞(2026-09-26,待辦總帳 N54「日期 D1」;date-grid.spec.md「現行機制」第 4 條):指標**從縫或角直接離開格陣**。
  // 上面兩支都不管這條路:離開最外圈那一天時 relatedTarget 落在縫或角裡 → leave 被吞(欠著);接著指標走出 <table>,
  // 已經沒有任何一天會再收到 leave、也沒有 td / th 會收到 mouseover —— 預覽框就一直卡在上一天(實測:從 6/13 每步 1px
  // 往右移到浮層外 20px,停 2 秒仍是 5/4→6/13;一次跳出去則會清,因為 day button 的 leave 直接落在格陣外、照常轉發)。
  // 本檔「只在指標真的離開整張格陣時才清」的判準本來就涵蓋這條,缺的是實作:MUI X 在月份容器掛
  // `onMouseLeave: () => setRangePreviewDay(null)`(上方同一條連結),09-24 照 MUI 做「縫裡不清」時沒一起做這一半。
  // 只在「欠著」時補送:一次跳出去的那條路,day button 的 leave 已經照常轉發過,不重送。
  // 兩張月曆並排時每張各是一張格陣,兩張之間的空白 = 離開格陣(date-picker.spec.md「滑鼠離開日期格區」)。
  const handleGridMouseLeave =
    onDayMouseLeave &&
    ((event: React.MouseEvent<HTMLTableElement>) => {
      const owed = owesLeaveRef.current
      owesLeaveRef.current = false
      syncGapCursor(event.currentTarget)
      if (!owed) return
      const last = lastEnterRef.current
      if (!last) return
      onDayMouseLeave(last.day, last.modifiers, event)
    })

  // 手形游標跟著每一步更新:框是 React 狀態、慢一幀才畫上,指標若在框畫好之前就滑進縫或角,上面 leave 那一刻還判不到端點;
  // 鍵盤把框移走時也一樣。每一步重算一次(只讀幾個 class,不觸發 render)。
  const handleGridMouseMove =
    onDayMouseLeave &&
    ((event: React.MouseEvent<HTMLTableElement>) => syncGapCursor(event.currentTarget))

  const handleGridPointerDown =
    onDayMouseLeave &&
    ((event: React.PointerEvent<HTMLTableElement>) => { pressPointerTypeRef.current = event.pointerType })

  // ── 縫或角裡點下去 = 點停留日(2026-09-26,待辦總帳 N54 ①;date-grid.spec.md「縫與角裡的點擊」)──
  // 預覽框亮著時,指標停在縫或角裡,框仍停在上一天(上面吞掉的 leave);此時點下去 = 點那一天的 button —— 真的去點它
  //(`button.click()`),所以結果、焦點、關浮層都跟直接點那一天一模一樣,不另寫一份選取邏輯。
  // 點在日子本身上由 RDP 的 handleDayClick 處理(它 stopPropagation,不會走到這裡);點在不可點的格、星期列上 → isGapOrCorner 為 false,沒反應。
  // 世界級:React Aria 預設就是「在月曆裡、但不在按鈕上放開 = 確認正在預覽的區間」(`useRangeCalendar.ts#L23-L32` 預設 `select`:
  // "select the currently hovered range of dates."、`#L80-L86` 的條件 `!target.closest('button, [role="button"]')`,
  // https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-aria/src/calendar/useRangeCalendar.ts#L80-L86 );
  // MUI X、Chakra 在縫裡點沒反應(R21 實測)—— 本 DS 取前者,理由是 user 的原則「滑過有變化的地方,點下去要有反應」(待辦總帳 N50)。
  const handleGridClick =
    onDayMouseLeave &&
    ((event: React.MouseEvent<HTMLTableElement>) => {
      const pointerType = pressPointerTypeRef.current
      pressPointerTypeRef.current = null
      if (pointerType !== 'mouse') return
      const grid = event.currentTarget
      if (!isGapOrCorner(event.target, grid)) return
      gapConfirmTarget(grid)?.click()
    })
  // Note: react-day-picker v9 DayPicker 未對外 forward ref 到單一 DOM 節點(內部有多 div),
  // 故 ref 簽名保留但不附著(符合 DS 統一 forwardRef 慣例;真要取 DOM 用 wrapper 包)。
  return (
    <GridPointerContext.Provider
      value={{
        onMouseOver: handleGridMouseOver,
        onMouseLeave: handleGridMouseLeave,
        onMouseMove: handleGridMouseMove,
        onPointerDown: handleGridPointerDown,
        onClick: handleGridClick,
      }}
    >
    {/* 下方 <DayPicker> 刻意不隨這層 Provider 往內縮排:整塊兩百多行只為了多包一層 context 而全部位移,
        會讓 diff 看起來像整檔重寫。Provider 本身沒有任何視覺或結構作用,只把格陣的指標事件(見 GridPointerHandlers)遞給 AnchoredMonthGrid。 */}
    <DayPicker
      // 兩月以上**不渲染鄰月日子**(2026-09-23 user 拍板):同一天會在相鄰兩張月曆各出現一次,區間 track / 端點藍圓 /
      // 預覽框就被畫兩次(user 圖一:4/26 在四月與五月面板各一顆藍圓)。MUI X(calendars > 1 時 filler 格 opacity 0,
      // 原註解「otherwise the same day would be rendered in two calendars」)/ Polaris(空格)/ flatpickr(hidden)與
      // react-day-picker 自家預設都不顯示;consumer 傳 showOutsideDays 也不放行(MUI 同樣忽略)。單月照舊(預設顯示、淡字)。
      // 一條原則(2026-09-24 user 拍板):鄰月日子只在「同一天不會被畫兩次」時顯示;八家對照 → date-grid.spec.md「鄰月日子:一條原則」。
      showOutsideDays={(numberOfMonths ?? 1) > 1 ? false : showOutsideDays}
      numberOfMonths={numberOfMonths}
      // navLayout="around" = prev 渲染在首月(displayIndex===0)caption 左、next 渲染在末月(displayIndex===numberOfMonths-1)caption 右;單月時兩鍵同 caption 兩側
      // 取代先前 absolute 定位覆蓋整個 months 容器導致箭頭垂直置中於中段的 bug
      navLayout="around"
      // 根**不帶內距**:內距搬到每一張月曆自己身上(見下方 `month`)。
      // 2026-09-18 user 裁示,原話:「我覺得真的要做的話,邏輯就是這樣,而不是另外加一個 token,
      // 反而造成漂移,因為視覺就是要在各種情況營造對稱感吧?」
      className={cn(className)}
      classNames={{
        // **兩張月曆之間不設 gap**(2026-09-18 user 裁示)。
        // 每張月曆自己四周留 `--item-px`,所以彼此之間自然就是**兩份內距**(md 12+12 = 24),
        // 而且「單張」與「並排」看起來完全一樣 —— 對稱是結構保證的,不是靠一個要人維護的數字。
        // 這也是為什麼**不需要**月間距 token:少一個可以漂的東西。
        // 世界級同款:Ant Design 就是這個作法(兩張各自帶左右內距、中間不設 gap),
        // 且 v4(內距 12 → 間距 24)與 v5(18 → 36)跨大版本維持 1:2,是刻意的比例。
        months: 'flex flex-col sm:flex-row',
        // Month:relative 讓 prev/next 按鈕 absolute 定位到 month 右上/左上(navLayout="around")。
        // **內距住在這裡**(2026-09-18 搬家):每張月曆自己四周留 `--item-px`,
        // 於是「面板邊 → 第一格」與「月曆 → 月曆」用的是同一顆東西,後者自然是前者的兩份。
        month: 'flex flex-col relative p-[var(--item-px,var(--field-px))]',
        // Month caption:單行置中 h-field-xs,prev/next 按鈕 absolute 從兩側貼齊
        month_caption: 'flex items-center justify-center h-field-xs mb-3',
        caption_label: 'text-body font-medium',
        // ── Prev/Next button(canonical 2026-05-03 v6,user audit fix)──
        // RDP 把這 className apply 到 <Button> 本身(不是 wrapper),所以用 className 直接套
        // 定位類(absolute top/left/right-0)。muted 色透過 Button override 內部加,不用 [&>button] 黑魔法。
        // nav 的 absolute 定位是相對 month 的 **padding box**(= 盒子最外緣),
        // 內距搬到 month 之後不補這個偏移,chevron 會貼到月曆盒最外緣、比日期格往外 12px(2026-09-18 實測確認)。
        // 讀同一顆 `--item-px`,所以它跟日期格永遠在同一條線上。
        button_previous: 'absolute top-[var(--item-px,var(--field-px))] left-[var(--item-px,var(--field-px))] z-[1]',
        button_next: 'absolute top-[var(--item-px,var(--field-px))] right-[var(--item-px,var(--field-px))] z-[1]',
        // ── Grid layout(canonical 2026-05-03 v7,純 table-native)──
        // RDP v9 month_grid = <table>。v6 試 grid 在 tr 上但 break border-spacing(grid 蓋掉
        // table-row layout)。乾淨修:**純 table layout** + `border-spacing-1`(4px H+V,table-native)。
        // 所有 cells 自動同寬同高(td 的 w/h-field-sm),無 grid hack。
        //
        // `-m-1` 抵銷**最外圈**的 border-spacing(2026-09-18 user 拍板)。
        // 為什麼需要它:`border-spacing` 是「格與格之間 4px」,但 CSS 連**最外圈也各給 4px** ——
        // 於是日期格的盒子落在 容器 12 + 4 = 16,而同一個面板的上下月 chevron 貼著容器的 12。
        // 規格(本檔 spec「Spacing canonical」原文,2026-05-03 v8)寫的是
        //「四邊對稱:chevron 按鈕到邊距 = 最左最右日期 cell 到邊距(12px)」—— 兩者都該是 12。
        // 那 4px 外圈**從來沒有人決定過**(全 repo 只有 2026-09-18 的 spec 段落提到它),是 `border-separate` 的副作用。
        // 負 margin 把 table 的盒子往外拉 4px:**格與格之間仍然是 4px,但最外圈歸零**,第一格因此落在 12。
        // 對照上游:我們包的 `react-day-picker` 自己是 `border-collapse: collapse`,
        // 它 457 行的 style.css 裡 `border-spacing` 出現 **0 次**(2026-09-18 讀 node_modules 原始碼);
        // IBM Carbon 的日曆同樣是第一格貼齊容器內距(實測外溢 0)。外溢是我們自己加的,不是慣例。
        // 列頭尾的 bridge 夾住:`-2px` 是用來跨過格與格之間的 4px 縫去接鄰格,
        // 但**列的第一格左邊、最後一格右邊沒有鄰格**,再往外就越過容器內距 —— 抵銷最外圈之後會直接溢出面板留白(實測 2px)。
        // 掛在 month_grid 而不是三個 range 狀態各寫一次:2026-09-18 實測 react-day-picker **不會**把
        // 我們加在 `classNames.range_*` 裡的這兩個 class 帶到 `<td>` 上(bundle 有、`cn()` 不吃、chunk 也載對了,
        // 但 DOM 完全查不到),而 `month_grid` 的 class 確定會落地(同一行的 `-m-1` 就是證據)。
        // 一處宣告、三種 range 狀態一起管,也少兩個要同步的地方。
        month_grid: cn(
          'border-separate border-spacing-1 -m-1',
          // 縫或角裡點下去會確認停留日時(GAP_CONFIRMS_ATTR,由上方 syncGapCursor 掛),游標跟日期一樣是手形。
          // td 沒有自己的 cursor,角會繼承這一條;button 自己的 pointer / disabled 的 not-allowed 不受影響。
          'data-[gap-confirms]:cursor-pointer',
          '[&_tr>td:first-child]:before:!left-0',
          '[&_tr>td:last-child]:before:!right-0',
          // 預覽框(td ::after)在列首 / 列尾同樣不得溢出面板留白;換列處框是開口的,與 track 同款
          '[&_tr>td:first-child]:after:!left-0',
          '[&_tr>td:last-child]:after:!right-0',
        ),
        weekdays: '',  // thead default
        weekday: cn(
          // text-foreground + font-medium 對齊 DS 一致設計語言(2026-05-03 user audit):
          // weekday 列標跟 caption「April 2026」同視覺權重(都屬 calendar header 區),
          // 不弱化(撤銷 v3 fg-secondary 的 mistake)。對齊 icon-only Button 預設 neutral-9 一致。
          'text-foreground text-body font-medium',
          // h-field-sm(md=28/lg=32 隨 density):對齊 day cell 同 token 同 row cadence
          // (spec:127 既定 canonical;Ant 36/36、Carbon 40/40 header/day 同節奏;2026-07-14 修 h-7 固定 drift)
          'h-[var(--field-height-sm)] align-middle text-center',
        ),
        week: '',  // tr default
        // Cell **就是** button 容器(28×28 @ md / 32×32 @ lg),`relative` 讓 before pseudo 定位
        // ── h-field-sm 對齊 user spec(28×28 @ md)— v3 用 h-field-md (32×32) 是錯的
        day: cn(
          'h-field-sm w-[var(--field-height-sm)] p-0 text-center relative',
        ),
        day_button: cn(
          // absolute inset-0 = 完全填滿 cell(naked button,無 inset 4px 空隙)
          // z-[1] 讓 button 疊在 range track `before:` pseudo 之上
          'absolute inset-0 z-[1] flex items-center justify-center',
          // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
          'font-normal text-body rounded-full',
          // Hover 藍圈 1.5px(對齊 Apple HIG / Ant `@benchmark-unverified` visual ring measurement)— ring 在 button 之上 + 透明 bg 不擋 range track
          // 2026-07-07 user 拍板統一:瞬時 hover 進 primary 家族 = hover 階(FileUpload dropzone /
          // Slider thumb hover 同族;base 專屬持續選中與 focus)——ring-primary → ring-primary-hover
          'hover:ring-[1.5px] hover:ring-primary-hover hover:bg-transparent',
          // 鍵盤焦點框往內畫(focus-canonical「問題二」):格與格只隔 4px,而區間 track(::before)與預覽框(::after)
          // 就跑在那 4px 縫裡 —— 往外畫的 2px 框正好壓在框線上(user 2026-09-23:「date 的鍵盤焦點感覺要改成
          // 往內畫的那種,否則會跟區間藍框有視覺衝突」)。藍底格另走 EMPHASIS_FOCUS_RING_CLASSNAME(白線退 3px)。
          'focus-visible:focus-ring-inset',
          // 命中區 = 可視形狀 = 這個 28×28(lg 32)的盒,不外擴(hit-area-canonical「懸停回饋的形狀 ≡ 命中區」;
          // 理由與實測數字寫在 date-grid.spec.md「日期格的命中區 = 可視形狀」)。
          // 2026-09-23 這裡曾有一條 `before:-inset-[2px]`,用四邊各 2px 的**不畫任何東西**的帶去補格間 4px 縫,
          // 解的是「跨格時區間框閃一下」。帶是對的解嗎?不是 —— 閃動的根因是**停留日在縫裡被清掉**,
          // 幾何外擴只是讓縫裡也有人收 enter。根因層的解法寫在上方 handleDayMouseLeave(只在指標真的離開整張格陣時才清),
          // 那正是同一條註解當時就引到的 MUI 作法。
          // 2026-09-26「縫或角裡點下去 = 點停留日」**不是**把這個盒外擴:滑過(enter)仍只從這顆圓開始,沒有框時縫與角點了照樣沒反應;
          // 只有框亮著、停留端就是那一天時,縫與角那一下點擊交給那一天(上方 handleGridClick)。
        ),
        // today:藍色 underline bar 貼近數字
        today: cn(
          "[&>button]:after:content-['']",
          '[&>button]:after:absolute',
          '[&>button]:after:bottom-[5px] [&>button]:after:left-1/2 [&>button]:after:-translate-x-1/2',
          '[&>button]:after:w-[40%] [&>button]:after:h-[1.5px] [&>button]:after:rounded-full',
          '[&>button]:after:bg-primary',
          // today + selected:bar 切 on-emphasis(白)— 只為「藍底白字圓」的選中日/端點設計;
          // range 中段(淺灰底)由 range_middle 的 !bg-primary 覆寫回藍(2026-07-07 user 拍板)。
          '[&[data-selected=true]>button]:after:bg-on-emphasis',
        ),
        // 2026-09-07 修 M24 違反(user 抓圖:「明明都是 disabled,有些字比較深有些比較淺」):
        // outside 與 disabled 是兩個獨立 modifier,RDP 會把兩個 className 都串上同一格。
        // 兩條 utility 特異性相同 → 由 stylesheet 順序決勝,實測 `text-fg-muted`(neutral-7,45%)
        // 贏過 `text-fg-disabled`(neutral-6,25%),導致**非本月又不可選的日子反而比本月不可選的更深**。
        // 依 M24「State 顯著性 precedence:disabled > muted > emphasis」與本元件 spec.md:106
        //(「outside…比 disabled 弱:outside 仍可 hover / 可點」)、:201(disabled → text-fg-disabled(M24)),
        // outside 的淡化**只適用於還能點的日子**,故加 :not() 前提而非用 !important 硬壓。
        // 2026-09-23 再加 `:not([data-selected])`:淡字是裝飾、選中是 state(M24 state 勝裝飾)—— 單月裡選中日落在鄰月位置時
        // 仍是藍底白字圓,不能被淡字選擇器(特異性 (0,3,1))壓成灰字。RDP `mode="range"` 單月的鄰月中段日也掛 selected,
        // 字色因此跟當月中段一樣深(不淡化);兩月時鄰月日子根本不渲染,這條只在單月 range 出現。
        outside: '[&:not([data-selected])>button:not(:disabled):not([aria-disabled="true"])]:text-fg-muted',
        // Selected(single 或 range 端點):button 藍底白字圓
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-on-emphasis',
          '[&>button]:hover:bg-primary-hover [&>button]:hover:!ring-0',
          EMPHASIS_FOCUS_RING_CLASSNAME,
        ),
        disabled: cn(
          '[&>button]:bg-disabled [&>button]:text-fg-disabled [&>button]:cursor-not-allowed',
          '[&>button]:hover:!ring-0 [&>button]:hover:bg-disabled',
        ),
        // ── Range track(canonical 2026-05-03 v6,Ant stadium pattern)──
        // v5 用 pseudo 矩形蓋全 cell 修「白色破圖」,但新副作用:button 圓比矩形小,4 個
        // corner triangle 區域 pseudo grey 凸出圓外(user 2026-05-03 抓到「凸出去」)。
        // 對齊 Ant 實證(`cell-range-start::before { border-radius: 9999px 0 0 9999px }`):
        // rangeStart pseudo 加 `rounded-l-full` → pseudo 變「左半圓 + 右矩形」stadium
        // 左半圓 EXACTLY OVERLAY button 圓的左半圓(同 center,同 radius 14)→ 邊界無縫
        // 右側矩形 bridge 2px to middle → 跟 middle pseudo 連續
        // Cell 的 top-left + bottom-left corner triangle:pseudo 不蓋 + button 不蓋 →
        // popover white 顯露(乾淨 breathing,跟 outside-of-range cells 一致視覺)
        // class 本體住在檔頭 RANGE_TRACK_CLASSNAMES(DatePicker.Range 消費同一份)
        range_start: RANGE_TRACK_CLASSNAMES.start,
        range_end: RANGE_TRACK_CLASSNAMES.end,
        range_middle: cn(
          RANGE_TRACK_CLASSNAMES.middle,
          // 2026-07-07 user 拍板:range 中段的 today bar 維持藍(切白只屬藍底選中日;白條在
          // neutral-selected 淺灰底上近乎隱形 = today 標記消失)。!important 確定性壓過 today 的
          // data-selected 切白規則(同權重靠 stylesheet 順序不可靠)。Ant 源碼實錘:cell-today
          // 指示 = colorPrimary,in-range 只換底色、無規則隱藏/改色 today 指示(panel.ts)。
          // 非 today 的中段日無 after content,本規則無作用 — 安全。
          '[&>button]:after:!bg-primary',
          // button 透明顯露 track。2026-07-05 對齊 RDP v9 真實行為(deep-audit A.1b):
          // range 中段日同樣掛 selected modifier(useRange rangeIncludesDate 不排除中段)→
          // 上方 selected 的 `[&>button]:hover:!ring-0` 一併壓制 hover ring(與 selected 一致
          // 的 hover 抑制),非原註解宣稱的「hover ring 仍顯示」;today bar 亦被 data-selected
          // selector 切 on-emphasis(見 spec「組合狀態」段)。
          '[&>button]:!bg-transparent [&>button]:!text-foreground',
          // 中段日同樣掛 selected(見上),會一併吃到 selected 的白線焦點 —— 但中段底是淺灰、白線看不見,
          // 焦點要回到一般的往內 2px 藍線;同權重靠順序不可靠,用 ! 壓過。
          '[&>button]:focus-visible:!focus-ring-inset',
        ),
        hidden: 'invisible',
        ...classNames,
      }}
      // ── SR label 中文 defaults(2026-07-05,RDP labels API 正門)──
      // 對齊 MUI X localeText「預設可覆寫」idiom + 2026-07-04 全庫 SR label 中文
      // canonical(commit 241676c6):DS 給中文 default,consumer 傳 labels 逐鍵覆寫(i18n)。
      // 禁在 components override 內 spread 後 hardcode aria-label — 會蓋死此覆寫通道
      // (2026-07-05 修正 07-04 的錯誤修法:中文要走 labels 正門,不是蓋 RDP 算好的值)。
      labels={{
        labelPrevious: () => '上一個月', // i18n-allow: DS default; consumer override via labels prop
        labelNext: () => '下一個月', // i18n-allow: DS default; consumer override via labels prop
        // 鏡射 RDP default 結構(labels/labelDayButton.js:today 前綴 / selected 後綴),文案中文化
        labelDayButton: (date, modifiers) => {
          let label = ZH_FULL_DATE.format(date)
          if (modifiers.today) label = `今天,${label}`
          if (modifiers.selected) label = `${label},已選取`
          return label
        },
        // 未傳 mode 的非互動 grid(spec「mode 無預設值」段)day cell 走 labelGridcell
        labelGridcell: (date, modifiers) => {
          let label = ZH_FULL_DATE.format(date)
          if (modifiers?.today) label = `今天,${label}`
          return label
        },
        labelGrid: (date) => ZH_MONTH_YEAR.format(date),
        labelWeekday: (date) => ZH_WEEKDAY.format(date),
        // 以下非 default 渲染面(captionLayout dropdown / showWeekNumber 由 consumer 經
        // {...props} 開啟)— 一併補齊,避免開啟後 SR 中英夾雜
        labelMonthDropdown: () => '選擇月份', // i18n-allow: DS default; consumer override via labels prop
        labelYearDropdown: () => '選擇年份', // i18n-allow: DS default; consumer override via labels prop
        labelWeekNumber: (weekNumber) => `第 ${weekNumber} 週`,
        labelWeekNumberHeader: () => '週數',
        ...labels,
      }}
      components={{
        // 月曆格陣的錨點(module 層 AnchoredMonthGrid,不可寫成 inline —— 見該處註解)
        MonthGrid: AnchoredMonthGrid,
        // ── Prev/Next nav(canonical 2026-05-03 v9,DS 一致設計語言)──
        // User 2026-05-03 audit:「icon-only Button icon 都用 neutral-9,只有 dismiss 用 45%」
        // → chevron 不是 dismiss,**走 Button 預設 text-foreground**(neutral-9 85%),
        // 不開新 tier 自打嘴(撤銷 v6-v8 用 fg-muted override 的 mistake)。
        // RDP v9 `PreviousMonthButton / NextMonthButton` override(node_modules/react-day-picker/dist/esm/components/Nav.js)
        // ⚠️ children: _ 必丟棄(RDP 把 <Chevron> 當 children 傳 → 跟 Button startIcon 重疊變 double chevron)
        // 2026-07-05 修:此處**不** hardcode aria-label — 中文走上方 labels API 正門,
        // RDP 算好 labelPrevious()/labelNext() 後經 {...props} 流入 Button;
        // spread 後 hardcode(07-04 舊修法)= 蓋死 consumer labels 覆寫通道。
        PreviousMonthButton: ({ className, children: _children, ...props }) => (
          <Button variant="text" size="xs" iconOnly startIcon={ChevronLeft}
            className={className} {...props} />
        ),
        NextMonthButton: ({ className, children: _children, ...props }) => (
          <Button variant="text" size="xs" iconOnly startIcon={ChevronRight}
            className={className} {...props} />
        ),
      }}
      {...props}
      // 放在 {...props} 之後:本元件對 enter/leave/focus 的記錄與過濾是格陣幾何的不變條件,不可被 consumer 的同名 prop 蓋掉
      //(consumer 的 handler 本來就由這三支包住後轉發,語意沒有被吃掉;focus 只多記一個「鍵盤在滑鼠之後」,不改焦點行為)。
      onDayMouseEnter={handleDayMouseEnter}
      onDayMouseLeave={handleDayMouseLeave}
      onDayFocus={handleDayFocus}
    />
    </GridPointerContext.Provider>
  )
})
DateGrid.displayName = 'DateGrid'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dateGridMeta = {
  component: 'DateGrid',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  // 'selected' = 選中日期 / range 端點持續選中(藍底白字圓 bg-primary + range 帶 bg-neutral-selected);
  // 'active' 移除 — 全檔無 Tailwind 按壓 utility,無按壓專屬視覺態(2026-07-07 詞彙統一對抗稽核補修)。
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-neutral-selected', 'bg-on-emphasis', 'bg-primary', 'bg-primary-hover', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground', 'text-on-emphasis'],
    ring: ['focus-ring-inset', 'focus-ring-inset-emphasis'],
  },
} as const

export { DateGrid }
