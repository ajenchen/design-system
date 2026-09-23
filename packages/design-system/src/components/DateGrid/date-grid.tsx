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
 * | outside(非本月) | text-fg-muted(neutral-7)—— **僅在該日仍可點時**;不可點時讓位給 disabled(M24) | [&>button:not(:disabled):not([aria-disabled="true"])]:text-fg-muted |
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

// ── SR label 中文 formatter(2026-07-05)──
// 走 Intl.DateTimeFormat(對齊 TimePicker / Calendar 既有 canonical,不引第二套 date lib);
// module-level 建一次 — label fn 每個 day cell 都會呼叫,避免 per-call new formatter。
const ZH_FULL_DATE = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' })
const ZH_MONTH_YEAR = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' })
const ZH_WEEKDAY = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' })

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DateGrid = React.forwardRef<HTMLDivElement, DateGridProps>(function DateGrid(
  {
    className,
    classNames,
    labels,
    showOutsideDays = true,
    ...props
  },
  _ref,
) {
  // Note: react-day-picker v9 DayPicker 未對外 forward ref 到單一 DOM 節點(內部有多 div),
  // 故 ref 簽名保留但不附著(符合 DS 統一 forwardRef 慣例;真要取 DOM 用 wrapper 包)。
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
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
        outside: '[&>button:not(:disabled):not([aria-disabled="true"])]:text-fg-muted',
        // Selected(single 或 range 端點):button 藍底白字圓
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-on-emphasis',
          '[&>button]:hover:bg-primary-hover [&>button]:hover:!ring-0',
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
    />
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
    ring: ['ring-primary', 'ring-ring'],
  },
} as const

export { DateGrid }
