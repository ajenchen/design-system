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
 * - 寬內容橫向捲動(寬表格類 demo / 程式碼區塊;例外:DataTable 中央捲動區走 native
 *   overflow-x-auto + scrollLeft 同步,不用 ScrollArea — 見 scroll-area.spec.md「何時用」)
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
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    /** 2026-07-08(WM 戰役 R2):Radix Viewport 內建 wrapper `display:table; min-width:100%`
     *  讓垂直捲動容器內的 flex 多欄佈局以 max-content 佈局、突破 100% 寬(WM 兩欄 dialog
     *  右欄被裁 33px 實證)。垂直捲動場景 opt-in 此 prop 中和為 block/w-full(水平捲動
     *  場景勿開 — table wrapper 是其 min-content 溢出機制)。 */
    fillX?: boolean
    /** Viewport tabIndex(預設 0 = axe scrollable-region-focusable fix)。內容已有自帶
     *  focusable 元素(如 TimePicker role=listbox tabIndex=0)時傳 -1 消除雙 tab stop —
     *  axe 由內部 focusable 內容滿足,焦點直接落在有 keydown 的 listbox 上。 */
    viewportTabIndex?: 0 | -1
  }
>(({ className, children, fillX, viewportTabIndex = 0, ...props }, ref) => (
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
      tabIndex={viewportTabIndex}
      className={cn(
        'flex-1 min-h-0 w-full rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
        fillX && '[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0',
      )}
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
    {/* Thumb 用 scrollbar-thumb / -hover semantic alias(2026-05-09 抽 SSOT,跟 DataTable fake scrollbar
         共享 token)。Token 值仍 = `--border` / `--border-hover`(neutral-5/-6)— 世界級 SaaS
         (Linear / Notion / Figma / macOS)scrollbar thumb 慣例「很淡、幾乎看不見,hover 略深」。
         前身直接 `bg-border` borrowing(2026-04 ship)→ semantic alias 收斂 SSOT(避免 thumb 視覺
         未來演化時誤動 Field/Input/Checkbox border 視覺)。對齊 shadcn ScrollArea source `bg-border`。 */}
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn('relative flex-1 rounded-full bg-[var(--scrollbar-thumb)] hover:bg-[var(--scrollbar-thumb-hover)] transition-colors')}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const scrollAreaMeta = {
  component: 'ScrollArea',
  family: 'self-contained', // 對齊 scroll-area.spec.md frontmatter(SSOT;同 Separator/OverflowIndicator meta 寫法)
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { ScrollArea, ScrollBar }
