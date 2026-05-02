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
      // p-3 = 12px 四邊對稱;整個 popover padding 對齊 layout-space-tight
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
          // nav button 是單一 text-style icon button → semantic `text-fg-disabled`(對齊 Button variant=text disabled)
          // 非 composite 整塊 disabled,故**不**用 opacity token
          'disabled:text-fg-disabled disabled:pointer-events-none',
          'transition-colors',
        ),
        button_next: cn(
          'absolute top-0 right-0 z-[1]',
          'inline-flex items-center justify-center h-field-xs w-[var(--field-height-xs)] rounded-md',
          'text-fg-muted hover:text-foreground hover:bg-neutral-hover',
          // nav button 是單一 text-style icon button → semantic `text-fg-disabled`(對齊 Button variant=text disabled)
          // 非 composite 整塊 disabled,故**不**用 opacity token
          'disabled:text-fg-disabled disabled:pointer-events-none',
          'transition-colors',
        ),
        // Grid:flex flex-col,row 間距 mt-1(4px)垂直 between weeks(用 week 的 mt-1 或 grid gap-y-1)
        month_grid: 'flex flex-col gap-y-1',
        // Weekday row:14px(text-body)neutral-8 = fg-secondary
        weekdays: 'flex',
        weekday: 'text-fg-secondary text-body font-normal w-[var(--field-height-md)] h-field-md flex items-center justify-center',
        // Week row:flex cells 緊貼(no gap)→ cell 內 padding 產生 4px 視覺分離;
        // range bg 畫在 cell 完整寬度上,相鄰 cells 的 bg 於邊界接合 → **range track 連貫**
        week: 'flex w-full',
        // ── react-day-picker v9 classNames 對應 ──
        // `classNames[key]` 在對應 modifier 為 true 時附加到 Day CELL(td)。
        // DayButton 只拿 `classNames.day_button`。所以 `[&>button]:xxx` 從 cell 向內選 button。
        //
        // ── Cell / Button 尺寸策略(2026-04-21)──
        // Cell:h-field-md w-[field-height-md](32px @ md / 36 @ lg),**無 padding**
        // Button(內部):`inset-0.5`(absolute 定位,四邊 2px 內縮)→ 比 cell 小 4px
        //   視覺結果:相鄰 button 之間有 4px gap(2+2);Cell 本身緊貼相鄰 cell
        //   Range bg 畫在 Cell 上 → 連貫橫跨(不受 button 縮小影響)
        day: cn(
          'h-field-md w-[var(--field-height-md)] p-0 text-center relative',
        ),
        day_button: cn(
          // absolute 定位 + inset-0.5(四邊 2px 內縮)→ button 28×28 @ md / 32×32 @ lg
          // z-[1] 讓 button 疊在 range track `before:` pseudo 之上(canonical 2026-05-02)
          'absolute inset-0.5 z-[1] flex items-center justify-center',
          'font-normal text-body rounded-full transition-colors',
          // Hover 藍圈:**ring-[1.5px]** 對齊 Apple HIG / Ant 慣例(1.5px = 薄 + 可見)
          'hover:ring-[1.5px] hover:ring-primary hover:bg-transparent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        // today:button 下方藍色 rounded bar(1.5px 厚 + rounded-full 端點)
        // Button 已經是 `absolute inset-0.5`(absolute 本身就是 positioning context,
        // ::after 相對 button 定位 — 不要再加 `relative` 覆蓋,那會破壞尺寸)。
        //
        // ── bottom 定位:貼近數字(不貼 button 邊)──
        // Button md = 28×28(inset-0.5 於 32px cell)。text-body line-height ≈ 20px
        // 垂直置中 → 文字底到 button 底 ≈ 4px。bar 放 bottom-[5px] 剛好貼在文字底下一像素。
        // 避免 2px 看起來「黏 button 邊」的 optical flaw。
        //
        // ── Selected + today:bar 轉 on-emphasis 白色 ──
        // 選中 cell 走 `data-selected="true"` → button bg 變 primary 藍底。此時藍 bar 隱形。
        // 用 `[&[data-selected=true]>button]` 組合選到「當前 cell selected + today」的 button,
        // 切換 after:bg 為 on-emphasis(白)保視覺可見。
        today: cn(
          "[&>button]:after:content-['']",
          '[&>button]:after:absolute',
          '[&>button]:after:bottom-[5px] [&>button]:after:left-1/2 [&>button]:after:-translate-x-1/2',
          '[&>button]:after:w-[40%] [&>button]:after:h-[1.5px] [&>button]:after:rounded-full',
          '[&>button]:after:bg-primary',
          // today + selected:藍底藍 bar 隱形 → 切到 on-emphasis(白)
          '[&[data-selected=true]>button]:after:bg-on-emphasis',
        ),
        // outside(非本月):text-fg-muted = neutral-7
        outside: '[&>button]:text-fg-muted',
        // Selected(single 或 range 端點):button 藍底白字圓
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-on-emphasis',
          '[&>button]:hover:bg-primary-hover [&>button]:hover:ring-0',
        ),
        // disabled:跟 Button disabled 一致(bg-disabled + fg-disabled),rounded-full
        disabled: cn(
          '[&>button]:bg-disabled [&>button]:text-fg-disabled [&>button]:cursor-not-allowed',
          '[&>button]:hover:ring-0 [&>button]:hover:bg-disabled',
        ),
        // ── Range track:button 高度版(canonical 2026-05-02 Q8,M8 4 家共識)──
        // bg 用 before pseudo:`inset-y-0.5`(top/bottom 內縮 2px → 高度 = button 28px)
        // + `inset-x-0`(維持 cell 寬度 = 32px,相鄰 cell pseudo 接合 → 橫向連貫)
        // 半圓 round 的 left/right 收 0.5(2px)讓圓弧半徑跟 button 圓對齊。
        // **必含 `before:content-['']`** — Tailwind 的 `before:` modifier 不自動 set content,
        // 沒寫的話 pseudo 不渲染。
        range_start: cn(
          "before:content-[''] before:absolute before:inset-y-0.5 before:left-0.5 before:right-0",
          'before:bg-[var(--color-neutral-3)] before:rounded-l-full',
        ),
        range_end: cn(
          "before:content-[''] before:absolute before:inset-y-0.5 before:left-0 before:right-0.5",
          'before:bg-[var(--color-neutral-3)] before:rounded-r-full',
        ),
        // range 中段 cell:neutral-3 矩形 track,button 透明;
        // **hover 仍顯示藍圈 outline**(對齊 user AR:「滑到區間的日期灰底一樣 hover 會出現藍色框框」)
        range_middle: cn(
          "before:content-[''] before:absolute before:inset-y-0.5 before:inset-x-0",
          'before:bg-[var(--color-neutral-3)]',
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
