// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { Button } from "@/design-system/components/Button/button"
import { OVERLAY_SIDE_OFFSET, OVERLAY_COLLISION_PADDING } from "@/design-system/tokens/elevation/overlay-geometry"

/**
 * Popover — Radix Popover + 設計系統 token
 *
 * ── 視覺 ──
 * 與 Dialog 對齊：bg-surface-raised / rounded-lg / border-border / elevation-200。
 * density 永遠鎖 md（non-modal 輕量浮層不隨頁面 density 放大）。
 *
 * ── 結構 ──
 * PopoverContent：外殼（bg / border / radius / shadow / density），無內距。
 * PopoverHeader / PopoverBody / PopoverFooter：消費 overlay-surface pattern
 * 共用的 SurfaceHeader / SurfaceBody / SurfaceFooter primitives(padding SSOT)。
 *
 * ── Header dismiss X(2026-04-20 決策) ──
 * 所有 PopoverHeader 一律附右上 X 按鈕(對齊 Dialog 的 canonical)。Popover 雖是
 * non-modal + click-outside-to-close,但有 header 的 Popover 通常結構化程度高
 * (title / 多區塊),明確的「關閉」入口讓使用者更易退出。無 header 的簡單 Popover
 * 不加 X(click-outside / Esc 即可)。
 */

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor
const PopoverClose = PopoverPrimitive.Close

// AutoFocus canonical(對齊 Dialog / Sheet / Material / Polaris)—
// 開啟時 focus 落在 body 第一個有意義互動元素,避免 focus 到 close X 觸發 tooltip leak
const handlePopoverOpenAutoFocus = (e: Event) => {
  e.preventDefault()
  const content = e.currentTarget as HTMLElement
  const firstBodyTarget = content.querySelector<HTMLElement>(
    '[data-popover-body] input:not([disabled]),[data-popover-body] textarea:not([disabled]),[data-popover-body] select:not([disabled]),[data-popover-body] button:not([disabled]):not([data-dismiss]),input:not([disabled]),textarea:not([disabled]),button:not([disabled]):not([data-dismiss])'
  )
  const firstFooterButton = content.querySelector<HTMLElement>(
    '[data-popover-footer] button:not([disabled]):not([data-dismiss])'
  )
  ;(firstBodyTarget ?? firstFooterButton ?? content).focus({ preventScroll: true })
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = OVERLAY_COLLISION_PADDING, onOpenAutoFocus, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      data-density="md"
      onOpenAutoFocus={onOpenAutoFocus ?? handlePopoverOpenAutoFocus}
      className={cn(
        "z-50 w-72 rounded-lg border border-border bg-surface-raised text-foreground shadow-[var(--elevation-200)] outline-none",
        // 2026-05-04 viewport-aware max-h SSOT(從 ProfileCard 升 DS-wide):header/footer 永遠 in-viewport,body 壓縮 scroll
        // 2026-05-05 audit dim 35 補:加 `min-h-0` 完成 M25 chain invariant(flex item default min-h: auto 阻 shrink)
        "max-h-[var(--radix-popover-content-available-height,100vh)] flex flex-col overflow-hidden min-h-0",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-popover-content-transform-origin)]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// PopoverHeader: SurfaceHeader + Close X(對齊 Dialog 的 canonical,見 docblock)
// justify-between 讓 children 與 Close 分左右。
interface PopoverHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 隱藏右上 close X(預設 false,顯示)。
   * Coachmark / Tour 類 composition 用 Skip / Done 自管 close,不需 X。
   */
  hideClose?: boolean
}

const PopoverHeader = React.forwardRef<HTMLDivElement, PopoverHeaderProps>(
  ({ className, children, hideClose = false, ...props }, ref) => (
    // Popover lightweight chrome canonical(2026-05-04 重思 v2):
    //   覆寫 `--chrome-slot-h: 1.25rem` (20px) → unbounded button 佔位縮成 20,**匹配 PopoverTitle
    //   text-body line-height (14×1.5≈21,floor 20)**。Header 維持 padding-based 自然撐開:
    //   max(21 title, 20 slot) + py-tight(12*2) = 45 → 自然比 Dialog/Sheet 48 輕一級。
    //   Q10 穩定:title-only / title+close 都 = title + py 主導,slot 不 dominate。
    //   無 min-h / 無 py override — 修正前一版過度設計。
    <SurfaceHeader
      ref={ref}
      className={cn("justify-between [--chrome-slot-h:1.25rem]", className)}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {!hideClose && (
        // Dismiss X = native sm,SurfaceHeader 負 my trick 讓 layout 佔位 24 → 匹配 inner 24
        <PopoverPrimitive.Close asChild>
          <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
        </PopoverPrimitive.Close>
      )}
    </SurfaceHeader>
  ),
)
PopoverHeader.displayName = "PopoverHeader"

// PopoverBody / PopoverFooter: wrap SurfaceBody / SurfaceFooter with data-popover-*
// attributes so handlePopoverOpenAutoFocus 可正確定位 body 內第一個 interactive 元素
//
// ── List-as-region 場景(menu / Cmd+K / nav)──
// 不再提供 `flush` variant(2026-05-01 移除,對齊 DialogBody / SheetBody canonical)。
// consumer 用 SurfaceBody className override 撤掉 chrome padding + 自管 list outer wrapper:
// `<PopoverBody className="!px-0 !py-0"><div className="py-2">{items}</div></PopoverBody>`
// 或乾脆不用 PopoverBody,直接 PopoverContent > 自管 list 結構(naked popover)。
// 詳 DialogBody comment + `tokens/layoutSpace/layoutSpace.spec.md`「List-as-region in overlay body」
const PopoverBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ ...props }, ref) => <SurfaceBody ref={ref} data-popover-body {...props} />,
)
PopoverBody.displayName = "PopoverBody"

const PopoverFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ ...props }, ref) => <SurfaceFooter ref={ref} data-popover-footer {...props} />
)
PopoverFooter.displayName = "PopoverFooter"

// PopoverTitle(2026-04-22 v4 non-modal canonical):`text-body font-medium`(14px)
// Rationale:Popover / Coachmark 屬 **non-modal 輕量浮層**,跟 density 鎖 md 同源的視覺語言 —
// chrome 全體輕量:
//   - density 鎖 md(不隨 page 放大)
//   - dismiss X 透過 v5 unbounded trick layout 佔位 24
//   - **title `text-body`(14px)跟 Dialog / Sheet modal 的 body-lg(16px)形成重量級 vs 輕量級視覺區分**
// 世界級對照:Figma / Notion / Linear / Material 的 popover / filter panel / inline settings
// 的 header title 多半比 modal dialog title 小一級(16→14 或同比),視覺宣告「此浮層可忽略」
//
// Coachmark 同樣消費 PopoverTitle 作 header 小標籤(如 "新功能介紹" / "Tip 1 of 3"),
// CoachmarkBody 的主 title 另走 text-body-lg(見 coachmark.tsx CoachmarkBody 主 title <h3>)。
const PopoverTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-body font-medium truncate", className)}
    {...props}
  />
))
PopoverTitle.displayName = "PopoverTitle"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const popoverMeta = {
  component: 'Popover',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 浮層容器 primitive,無自己的 variant/size/disabled 互動 state(spec「為何無 Inspector」段;對齊 separator.tsx meta canonical)
  tokens: {
    bg: ['bg-surface-raised'],
    fg: ['text-foreground'],
    ring: [],
  },
} as const

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverContent,
  PopoverClose,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverTitle,
}
