import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import { OVERLAY_SIDE_OFFSET, OVERLAY_COLLISION_PADDING } from "@/design-system/tokens/elevation/overlay-geometry"
import { MOTION_DELAY_PLAIN_MS } from "@/design-system/tokens/motion/motion"
import { overlayMotion } from "@/design-system/tokens/motion/overlay-motion"

// 2026-05-18 ship per user 拍板 #3A:Tooltip Provider 預設 delayDuration 對齊 motion token SSOT。
// Radix 預設 700ms 過保守(被 Material 150-200 / MUI 100 / Atlassian 300 集體驗證),DS 統一用
// `--motion-delay-plain` (500ms,JS mirror `MOTION_DELAY_PLAIN_MS`)。Consumer 仍可 per-instance override。
// 2026-05-21 D5 Phase B codex 抓 comment 200 vs token 500 drift → 註解 500ms 對齊 motion.css:27 SSOT。
const TooltipProvider = ({ delayDuration = MOTION_DELAY_PLAIN_MS, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = ({ delayDuration = MOTION_DELAY_PLAIN_MS, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) => (
  <TooltipPrimitive.Root delayDuration={delayDuration} {...props} />
)

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = OVERLAY_COLLISION_PADDING, style, children, ...props }, ref) => {
  // 空內容不掛浮層:children 為 null / undefined / false / 空字串時不渲染帶 padding 的空
  // role="tooltip" 殼(見 spec「邊界狀態」)。Tooltip 是資訊補救機制,無補充內容即不出現,
  // trigger 由 TooltipTrigger 原樣保留。
  const isEmptyContent =
    children == null ||
    children === false ||
    (typeof children === 'string' && children.trim() === '')
  if (isEmptyContent) return null
  return (
  // collisionPadding default 8px:避免 tooltip 貼 viewport 邊(Radix avoidCollisions 預設 true 但 padding 0 會貼邊)
  // 消費 OVERLAY_COLLISION_PADDING overlay 家族 canonical(與 Popover 一致;HoverCard 特例 12 補 rounding)避免 viewport edge clipping
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      // Density:繼承 page density(2026-06-15 canonical)。Tooltip padding 寫死 px-3 py-2、內容 text-body,
      // 不消費任何 density / layout-space token → 鎖 density 對它是 inert(原 data-density="md" 是 409b91da
      // a11y 批次「對齊 Popover」順手加,非設計決策)→ 移除,讓全浮層行為一致(全繼承 page)。
      className={cn(
        "z-50 overflow-hidden rounded-md px-3 py-2 text-body font-normal text-on-emphasis bg-tooltip max-w-[280px] break-words",
        overlayMotion,
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-tooltip-content-transform-origin)]",
        className
      )}
      style={{ boxShadow: 'var(--elevation-200)', ...style }}
      {...props}
    >
      <div data-theme="dark" className="contents">{children}</div>
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const tooltipMeta = {
  component: 'Tooltip',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 2026-06-11 R2:Tooltip 浮層本身無互動 state(anatomy rationale L9-12),
  tokens: {
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
