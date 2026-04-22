import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { Button } from "@/design-system/components/Button/button"

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
>(({ className, align = "center", sideOffset = 8, collisionPadding = 8, onOpenAutoFocus, ...props }, ref) => (
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
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
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
    <SurfaceHeader
      ref={ref}
      className={cn("justify-between", className)}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {!hideClose && (
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
// (autoFocus consistency — 不 focus 到 chrome close X)。
const PopoverBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ ...props }, ref) => <SurfaceBody ref={ref} data-popover-body {...props} />
)
PopoverBody.displayName = "PopoverBody"

const PopoverFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ ...props }, ref) => <SurfaceFooter ref={ref} data-popover-footer {...props} />
)
PopoverFooter.displayName = "PopoverFooter"

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

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverTitle,
}
