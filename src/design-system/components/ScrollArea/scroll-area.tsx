// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
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
    className={cn('relative flex flex-col overflow-hidden', className)}
    {...props}
  >
    {/* Viewport canonical(2026-04-23):Root 用 `flex flex-col`,Viewport 用 `flex-1 min-h-0`。
        原 `h-full` 在 Root 為 flex item(外層 flex-1 min-h-0)時失效 — Chrome 不把
        flex-computed 高度視為 `height: 100%` 的 definite anchor,導致 Viewport 撐成
        content height 而非 parent height → 失去 scroll 能力。
        改 Root 為 flex container,Viewport 成 flex item,flex algorithm 給 definite height。
        `w-full` 保留(水平維度不受影響)。 */}
    {/* a11y(2026-04-25 axe scrollable-region-focusable fix):Viewport 需 tabIndex=0
        才能 keyboard focus(Safari 不自動把 scroll container 標 focusable)。focus-
        visible:outline 用 DS focus ring,不破壞視覺。 */}
    <ScrollAreaPrimitive.Viewport
      tabIndex={0}
      className="flex-1 min-h-0 w-full rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
    >
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
    {/* Thumb 用 border/border-hover(neutral-5/-6)— 世界級 SaaS(Linear / Notion /
         Figma / macOS)scrollbar thumb 慣例為「很淡、幾乎看不見,hover 略深」,
         而非深色常駐塊。`--border` 在此作「UI chrome 淡灰 tier」重用,符合 subtle 視覺。 */}
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn('relative flex-1 rounded-full bg-border hover:bg-border-hover transition-colors')}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const scrollAreaMeta = {
  component: 'ScrollArea',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { ScrollArea, ScrollBar }
