/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Avatar(hoverCard)/ OverflowIndicator 等 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */
import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"
import { OVERLAY_SIDE_OFFSET } from "@/design-system/tokens/elevation/overlay-geometry"
import { HOVER_DELAY_RICH_MS, HOVER_DELAY_CLOSE_MS } from "@/design-system/tokens/motion/motion"

/**
 * HoverCard — hover 顯示可互動內容的浮層（行為 primitive）
 *
 * 跟 Tooltip 的差異：內容可互動（按鈕、連結、hover 子元素）。
 *
 * **不含視覺樣式**——bg、border、shadow、padding 由 consumer 決定：
 * - OverflowIndicator：深色 Tooltip 樣式（bg-tooltip + data-theme="dark"）
 * - ProfileCard：亮色 Card 樣式（bg-surface-raised + elevation-200）
 *
 * 只提供：z-index、動畫、sideOffset。
 */

// 2026-06-11 user 拍板 A 案(「確保所有 hover 延遲都有按照設計原則」):Root 預設接 motion token SSOT
// (rich 700ms open / close 200ms)— 對齊 tooltip.tsx 同 pattern(2026-05-18 拍板 #3A)。
// 原裸用 Radix 預設 open 700 / close 300:open 巧合同值、close 300 ≠ canonical 200(drift)。
// Consumer 仍可 per-instance override(Avatar 同值傳入、OverflowIndicator 傳 plain)。
const HoverCard = ({ openDelay = HOVER_DELAY_RICH_MS, closeDelay = HOVER_DELAY_CLOSE_MS, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) => (
  <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />
)

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = 12, ...props }, ref) => (
  // HoverCardPrimitive.Portal(2026-04-23):把 Content 搬到 `document.body`。
  // 不 Portal 時 Content 會 DOM-nested 在 trigger subtree,如 trigger 位於 OverflowIndicator
  // `data-theme="dark"` tooltip 內部 → Avatar 自帶 HoverCard 的 Content 也卡在 dark subtree,
  // CSS var(--foreground) 繼承 dark 值 → ProfileCard 內部文字變 white 看不見(user 抓的 bug)。
  // Portal 到 body 讓 CSS 繼承 chain 從 app root data-theme 起算,不受 trigger subtree 污染。
  //
  // collisionPadding=12:Radix / browser 內部 1-2px rounding 讓 visual padding 比 prop 值少 1-2px。
  // 提高到 12 保證使用者實際看到 ≥ 8px viewport edge gap(overlay-surface「靠邊 8px」canonical)。
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-50 outline-none",
        // 2026-05-04 viewport-aware max-h SSOT(對齊 Popover):header/footer 永遠 in-viewport,body 壓縮 scroll
        // 2026-05-05 audit dim 35 fix:加 `min-h-0` 完成 M25 chain invariant
        "max-h-[var(--radix-hover-card-content-available-height,100vh)] flex flex-col overflow-hidden min-h-0",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-hover-card-content-transform-origin)]",
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const hoverCardMeta = {
  component: 'HoverCard',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: ['bg-surface-raised'],
    fg: ['--foreground'],
    ring: [],
  },
} as const

export { HoverCard, HoverCardTrigger, HoverCardContent }
