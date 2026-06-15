/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
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
 * | Cell gap(水平 + 垂直)| 4px(gap-1) |
 * | Day cell size | h-field-sm w-[var(--field-height-sm)](28×28 md / 32×32 lg) |
 * | Day button | rounded-full 填滿 cell |
 *
 * ── 五種 cell state canonical ──
 *
 * | State | 視覺 | Token |
 * |-------|------|-------|
 * | today | 數字下方藍色短桿 | `::after` pseudo bar(bg-primary,w-40% h-1.5px rounded-full,貼近數字底)|
 * | disabled | 灰底圓圈 + disabled 字色(跟 Button disabled 一致) | [&>button]:bg-disabled [&>button]:text-fg-disabled rounded-full |
 * | outside(非本月) | text-fg-muted(neutral-7) | [&>button]:text-fg-muted |
 * | selected / range 端點 | 藍底白字圓 | [&>button]:bg-primary [&>button]:text-on-emphasis rounded-full |
 * | range middle | 灰底矩形 track(bg-neutral-selected = neutral-2),**高度 = cell 高度**(28×28 @ md) | before pseudo: `inset-y-0 -inset-x-[2px]` |
 * | range start/end 半圓 track | 左/右半圓 + selected 圓疊在上,**圓半徑 = button 半徑** | before pseudo: `rounded-l/r-full` + start `left-0 -right-[2px]` / end `-left-[2px] right-0`(向 middle 外擴 2px bridge gap)|
 * | hover(未選中) | 藍圈 outline | hover:ring-[1.5px] hover:ring-primary |
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

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DateGrid = React.forwardRef<HTMLDivElement, DateGridProps>(function DateGrid(
  {
    className,
    classNames,
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
      // p-3 = 12px 四邊對稱(canonical 不可動)
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        // Month:relative 讓 prev/next 按鈕 absolute 定位到 month 右上/左上(navLayout="around")
        month: 'flex flex-col relative',
        // Month caption:單行置中 h-field-xs,prev/next 按鈕 absolute 從兩側貼齊
        month_caption: 'flex items-center justify-center h-field-xs mb-3',
        caption_label: 'text-body font-medium',
        // ── Prev/Next button(canonical 2026-05-03 v6,user audit fix)──
        // RDP 把這 className apply 到 <Button> 本身(不是 wrapper),所以用 className 直接套
        // 定位類(absolute top/left/right-0)。muted 色透過 Button override 內部加,不用 [&>button] 黑魔法。
        button_previous: 'absolute top-0 left-0 z-[1]',
        button_next: 'absolute top-0 right-0 z-[1]',
        // ── Grid layout(canonical 2026-05-03 v7,純 table-native)──
        // RDP v9 month_grid = <table>。v6 試 grid 在 tr 上但 break border-spacing(grid 蓋掉
        // table-row layout)。乾淨修:**純 table layout** + `border-spacing-1`(4px H+V,table-native)。
        // 所有 cells 自動同寬同高(td 的 w/h-field-sm),無 grid hack。
        month_grid: 'border-separate border-spacing-1',
        weekdays: '',  // thead default
        weekday: cn(
          // text-foreground + font-medium 對齊 DS 一致設計語言(2026-05-03 user audit):
          // weekday 列標跟 caption「April 2026」同視覺權重(都屬 calendar header 區),
          // 不弱化(撤銷 v3 fg-secondary 的 mistake)。對齊 icon-only Button 預設 neutral-9 一致。
          'text-foreground text-body font-medium',
          'h-7 align-middle text-center',
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
          'font-normal text-body rounded-full transition-colors',
          // Hover 藍圈 1.5px(對齊 Apple HIG / Ant `@benchmark-unverified` visual ring measurement)— ring 在 button 之上 + 透明 bg 不擋 range track
          'hover:ring-[1.5px] hover:ring-primary hover:bg-transparent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        // today:藍色 underline bar 貼近數字
        today: cn(
          "[&>button]:after:content-['']",
          '[&>button]:after:absolute',
          '[&>button]:after:bottom-[5px] [&>button]:after:left-1/2 [&>button]:after:-translate-x-1/2',
          '[&>button]:after:w-[40%] [&>button]:after:h-[1.5px] [&>button]:after:rounded-full',
          '[&>button]:after:bg-primary',
          // today + selected:bar 切 on-emphasis(白)
          '[&[data-selected=true]>button]:after:bg-on-emphasis',
        ),
        outside: '[&>button]:text-fg-muted',
        // Selected(single 或 range 端點):button 藍底白字圓
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-on-emphasis',
          '[&>button]:hover:bg-primary-hover [&>button]:hover:ring-0',
        ),
        disabled: cn(
          '[&>button]:bg-disabled [&>button]:text-fg-disabled [&>button]:cursor-not-allowed',
          '[&>button]:hover:ring-0 [&>button]:hover:bg-disabled',
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
        range_start: cn(
          "before:content-[''] before:absolute before:inset-y-0",
          'before:left-0 before:-right-[2px]',
          'before:bg-neutral-selected before:pointer-events-none',
          'before:rounded-l-full',  // ← stadium 左半圓 matches button 圓的左半弧
        ),
        range_end: cn(
          "before:content-[''] before:absolute before:inset-y-0",
          'before:-left-[2px] before:right-0',
          'before:bg-neutral-selected before:pointer-events-none',
          'before:rounded-r-full',  // ← 鏡像
        ),
        range_middle: cn(
          "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
          'before:bg-neutral-selected before:pointer-events-none',
          // button 透明顯露 track,但 hover ring 仍顯示
          '[&>button]:!bg-transparent [&>button]:!text-foreground',
        ),
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        // ── Prev/Next nav(canonical 2026-05-03 v9,DS 一致設計語言)──
        // User 2026-05-03 audit:「icon-only Button icon 都用 neutral-9,只有 dismiss 用 45%」
        // → chevron 不是 dismiss,**走 Button 預設 text-foreground**(neutral-9 85%),
        // 不開新 tier 自打嘴(撤銷 v6-v8 用 fg-muted override 的 mistake)。
        // RDP v9 `PreviousMonthButton / NextMonthButton` override(node_modules/react-day-picker/dist/esm/components/Nav.js)
        // ⚠️ children: _ 必丟棄(RDP 把 <Chevron> 當 children 傳 → 跟 Button startIcon 重疊變 double chevron)
        PreviousMonthButton: ({ className, children: _children, ...props }) => (
          <Button variant="text" size="xs" iconOnly startIcon={ChevronLeft}
            aria-label="上一個月"
            className={className} {...props} />
        ),
        NextMonthButton: ({ className, children: _children, ...props }) => (
          <Button variant="text" size="xs" iconOnly startIcon={ChevronRight}
            aria-label="下一個月"
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
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-neutral-selected', 'bg-on-emphasis', 'bg-primary', 'bg-primary-hover', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground', 'text-on-emphasis'],
    ring: ['ring-primary', 'ring-ring'],
  },
} as const

export { DateGrid }
