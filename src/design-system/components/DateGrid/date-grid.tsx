import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import 'react-day-picker/style.css'

import { cn } from '@/lib/utils'

/**
 * DateGrid — DayPicker 包裝,用本 DS token 覆寫預設視覺。
 *
 * ── 視覺對照(ref/datepicker.png,2026-04-21 rewrite)──
 *
 * | 區塊 | 規格 |
 * |------|------|
 * | Outer padding | `p-3`(12px 四邊對稱) |
 * | Nav + Month caption row | h-field-xs(24px)單行,chevron(xs)分居左右 / 月份置中垂直對齊 |
 * | Nav → Weekday gap | 12px(mt-3) |
 * | Weekday | text-body(14px)text-fg-secondary(neutral-8) |
 * | Cell gap(水平 + 垂直)| 4px(gap-1) |
 * | Day cell size | h-field-md w-field-height-md(32×32 md / 36×36 lg) |
 * | Day button | rounded-full 填滿 cell |
 *
 * ── 五種 cell state canonical ──
 *
 * | State | 視覺 | Token |
 * |-------|------|-------|
 * | today | 文字下方藍色底線 | underline decoration-primary decoration-2 underline-offset-4 |
 * | disabled | 灰底圓圈 + disabled 字色(跟 Button disabled 一致) | [&>button]:bg-disabled [&>button]:text-fg-disabled rounded-full |
 * | outside(非本月) | text-fg-muted(neutral-7) | [&>button]:text-fg-muted |
 * | selected / range 端點 | 藍底白字圓 | [&>button]:bg-primary [&>button]:text-on-emphasis rounded-full |
 * | range middle | 灰底矩形 track(neutral-3),**高度 = button 高度**(28×28 @ md) | before pseudo: `inset-y-0.5 inset-x-0` |
 * | range start/end 半圓 track | 左/右半圓 + selected 圓疊在上,**圓半徑 = button 半徑** | before pseudo: `rounded-l/r-full` 加 `left-0.5` / `right-0.5` |
 * | hover(未選中) | 藍圈 outline | hover:ring-1 hover:ring-primary |
 *
 * ── Range track 高度 canonical(2026-05-02 Q8 修正,M8 4 家對照)──
 * Ant Design / Material X DateRangePicker / Apple Calendar / Google Calendar 共識:
 * **range track 高度 = button 高度**(不是 cell 高度)— track 跟 selected 圓緊貼,
 * 不留 2px「fat」邊距(舊版 cell-level bg 在 button 上下留 2px 空白看起來「胖」)。
 * 實作:bg 走 `before:` pseudo 走 `inset-y-0.5`(top/bottom 2px 內縮),`inset-x-0`
 * 維持完整 cell 寬度 → 相鄰 cell 的 pseudo 在 cell 邊界相接 = 橫向連貫。
 *
 * ── 為什麼 neutral-3 不 neutral-2(AR 新版 canonical)──
 * neutral-2 在 light mode 太淡(OKLCH L≈0.97),range track 跟 white bg 幾乎無對比。
 * neutral-3(L≈0.94-0.95)在 Google / Ant / Apple DateRange track 視覺明顯,維持「可見 track」。
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
      // navLayout="around" = 每個 month caption 兩側渲染 prev / next 按鈕(inline row)
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
        // navLayout="around" 下 button_previous / button_next 是 Month 內 sibling — absolute 定位到 caption 行兩端
        button_previous: cn(
          'absolute top-0 left-0 z-[1]',
          'inline-flex items-center justify-center h-field-xs w-[var(--field-height-xs)] rounded-md',
          'text-fg-muted hover:text-foreground hover:bg-neutral-hover',
          'disabled:text-fg-disabled disabled:pointer-events-none',
          'transition-colors',
        ),
        button_next: cn(
          'absolute top-0 right-0 z-[1]',
          'inline-flex items-center justify-center h-field-xs w-[var(--field-height-xs)] rounded-md',
          'text-fg-muted hover:text-foreground hover:bg-neutral-hover',
          'disabled:text-fg-disabled disabled:pointer-events-none',
          'transition-colors',
        ),
        // ── Grid layout(canonical 2026-05-02 v3,naked button + gap-1)──
        // 之前用 wrap 32×32 cell + button absolute inset-0.5 是為了 range bg 連貫,但
        // 留下兩個 anti-pattern:(1) cell wrap 多 4px 視覺保留區 (2) weekday row 也卡 32px
        // 高造成上下 dead space。
        //
        // 現改:cells 用 `grid grid-cols-7 gap-1`(4px gap)+ cell **就是** button(28×28 @ md)。
        // Range track 連貫透過 cell 的 `before:` pseudo `before:-inset-x-[2px]` 兩側
        // 各延伸 2px → 跨過 4px gap → 視覺連續(對齊 Ant DateRange track 連貫共識)。
        // popover 整體 padding `p-3`(12px,canonical 不變)。
        month_grid: 'flex flex-col gap-y-1',
        weekdays: 'grid grid-cols-7 gap-x-1',
        weekday: cn(
          // text-body 跟 date 同 size(撤銷 v3 我擅自改的 text-caption)
          'text-fg-secondary text-body font-normal',
          'h-7 flex items-center justify-center',
        ),
        week: 'grid grid-cols-7 gap-x-1',
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
          // Hover 藍圈 1.5px(對齊 Apple HIG / Ant)— ring 在 button 之上 + 透明 bg 不擋 range track
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
        // ── Range track(canonical 2026-05-02 v3,連貫 + naked + gap)──
        // before pseudo `inset-y-0`(button 高度全滿)+ `-inset-x-[2px]`(左右各延伸 2px)
        // → 相鄰 cell 的 pseudo 在 4px gap 中間相接 → **連貫 track**(對齊 Ant)。
        // pointer-events-none 確保 hover 事件直接到 button(不被 pseudo 攔)。
        // 半圓 round:start 只延伸右側(left 從 1/2 起,跟 button 圓銜接),end 反之。
        range_start: cn(
          "before:content-[''] before:absolute before:inset-y-0",
          'before:left-1/2 before:-right-[2px]',
          'before:bg-[var(--color-neutral-3)] before:pointer-events-none',
        ),
        range_end: cn(
          "before:content-[''] before:absolute before:inset-y-0",
          'before:-left-[2px] before:right-1/2',
          'before:bg-[var(--color-neutral-3)] before:pointer-events-none',
        ),
        range_middle: cn(
          "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
          'before:bg-[var(--color-neutral-3)] before:pointer-events-none',
          // button 透明顯露 track,但 hover ring 仍顯示(對齊 user AR)
          '[&>button]:!bg-transparent [&>button]:!text-foreground',
        ),
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
          return <Icon size={16} />
        },
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
    bg: ['bg-disabled', 'bg-neutral-hover', 'bg-primary', 'bg-primary-hover', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-primary', 'ring-ring'],
  },
} as const

export { DateGrid }
