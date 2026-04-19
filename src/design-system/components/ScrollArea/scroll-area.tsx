import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '@/lib/utils'

/**
 * ScrollArea — 自訂樣式的捲動區(Radix ScrollArea primitive 包裝)
 *
 * 世界級對照:shadcn `ScrollArea` / Ant Design scrollable 容器的 pattern。
 *
 * ── 為什麼需要 ScrollArea ──
 * Native scrollbar 跨 OS 不一致:
 *   macOS: overlay(不吃寬度,預設隱藏,滾動時浮出)
 *   Windows / Linux: always-visible(永遠吃 ~15-17px 寬度)
 *
 * 結果:同一個 DataTable / Sheet / Dialog 內容在 macOS 看起來對齊,在 Windows
 * 右側被吃 17px 跑版(「Left pinned + Row Actions」那張圖的問題)。
 *
 * ScrollArea 用 Radix 包裝自建 overlay 捲軸 → **跨 OS 一致不吃寬度**,
 * 捲動時浮現(hover / scroll 自動顯示)。
 *
 * ── 何時用 ──
 * - DataTable 橫向捲動(水平跑版最明顯場景)
 * - Sheet / Dialog 垂直內容捲動(body 太長)
 * - Sidebar nav 長列表
 * - 任何「內容可能溢出容器」且「跨 OS 視覺必須一致」的場景
 *
 * ── 何時不用 ──
 * - 全頁捲動(瀏覽器 document scroll,保持 native 即可;ScrollArea 是 sub-region)
 * - 單行 truncate(用 text-overflow:ellipsis 就夠)
 * - 極短內容(不會捲動 → 不需 wrapper)
 */

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = 'ScrollArea'

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    {/* Thumb 用 fg-muted(neutral-7,foreground 灰階 tier)而非 border(語意是邊框,
         視覺偏淡、scrollbar 可見度不足)。hover 升到 fg-secondary(neutral-8)。 */}
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn('relative flex-1 rounded-full bg-fg-muted hover:bg-fg-secondary transition-colors')}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
