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

// 2026-07-30 WM patch-package 吸收:Tooltip 恆以受控模式掛 Radix Root。
// 動機:truncated-text.tsx 截斷抑制 canonical `open={isTruncated ? undefined : false}` 直通
// Radix 會反覆 controlled ↔ uncontrolled 切換(Radix useControllableState dev warning 噪音,
// consumer 大量截斷 cell 實證)。做法:`open` 未傳時以 internal state 鏡射 Radix 的 open/close
// 決策(hover/focus/delay 時機仍由 Radix owns,經 onOpenChange 回報落地),對 Radix 永遠是
// controlled,模式切換消失。`defaultOpen` destructure 出來 seed internal state(語意保留;不可
// 與 `open` 一起 spread 給 Root)。consumer 三 prop(open/defaultOpen/onOpenChange)行為不變;
// open 與 defaultOpen 同傳時 open 勝(Radix idiom)。
const Tooltip = ({
  delayDuration = MOTION_DELAY_PLAIN_MS,
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const open = openProp ?? internalOpen
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp],
  )

  return (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      open={open}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}

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
        // **`pointer-events-none`:tooltip 不吃指標**(2026-09-04 user 回報「hover 出現 tooltip 的地方
        // 點下去打不開」的根因)。tooltip 是純提示 —— 本檔 `tooltipMeta.states` 自己就寫著
        // 「Tooltip 浮層本身無互動 state」—— 但它預設會吃指標,於是浮層覆蓋到的那一整塊區域變成
        // 「看得到提示、點不到底下的東西」。實測貼邊態的 AgentFab:tooltip 盒佔 x=1063–1171、
        // 按鈕在 1179,滑到 1100 時 `elementFromPoint` 回的是 tooltip 自己。
        // **content 與 wrapper 兩層都要設**(實測:只設 content,命中的變成 wrapper;兩層都設才穿透),
        // wrapper 那一半在 `tooltip.css`。
        "pointer-events-none",
        "z-50 overflow-hidden rounded-md px-3 py-2 text-body font-normal text-on-emphasis bg-tooltip max-w-[280px] break-words",
        overlayMotion,
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-tooltip-content-transform-origin)]",
        className
      )}
      style={{ boxShadow: 'var(--elevation-200)', ...style }}
      {...props}
      // `data-slot` 是 `tooltip.css` 的 `:has()` 鉤子(popper wrapper 由 Radix 產生、拿不到
      // className,只能從外面靠這個屬性認出「這個 wrapper 裝的是 tooltip」)。
      // **寫在 `{...props}` 之後**:它是不變條件的一半,不能被 consumer 的 props 覆蓋掉
      // ——另一半(content 的 `pointer-events-none`)在 `cn()` 裡、className 排最後,
      // consumer 仍可顯式覆寫,兩半的逃生口刻意不對稱(2026-09-04 對抗式稽核抓到)。
      data-slot="tooltip-content"
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
