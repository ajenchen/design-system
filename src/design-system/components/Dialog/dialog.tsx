import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/Button/button"
import { SurfaceHeader, SurfaceFooter } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"

/**
 * Dialog (Modal) — Radix Dialog + 設計系統 token
 *
 * ── Layout ──
 * px = layout-space-loose, header/footer py = layout-space-tight。
 * Body pt = layout-space-tight, pb = layout-space-bottom。
 * data-density="lg" 讓所有 token 解析為 lg。
 *
 * ── Viewport Inset ──
 * Modal 與 viewport 四邊保持 layout-space-bottom (48px) 最小間距。
 *
 * ── 高度行為 ──
 * 預設：height 填滿 viewport（扣除 inset），body 捲動。防止動態內容跳動。
 * height="auto"：高度隨內容，超過 viewport 時 max-height 安全帽。
 */

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// Modal 與 viewport 四邊的最小間距 = layout-space-bottom (48px)
const DIALOG_INSET_VAR = 'var(--layout-space-bottom)'

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** 最大寬度。預設 512px。傳 number 視為 px。 */
  maxWidth?: string | number
  /**
   * 高度模式。
   * - 不傳（預設）：填滿 viewport（height = 100vh - inset*2），body 捲動。防止內容跳動。
   * - true：高度隨內容，超過 viewport 時捲動（max-height 安全帽）。
   */
  autoHeight?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, maxWidth = '512px', autoHeight, children, style, ...props }, ref) => {
  const insetCalc = `${DIALOG_INSET_VAR} * 2`
  const viewportH = `calc(100vh - ${insetCalc})`
  const maxWidthCss = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth

  const heightStyle: React.CSSProperties = autoHeight
    ? { maxHeight: viewportH }
    : { height: viewportH }

  // AutoFocus canonical(對齊 Material / Polaris / Atlassian)—
  // 開啟時 focus 落在 body 第一個有意義互動元素(input / button),不是 chrome close X。
  // 預設 Radix 會 focus first tabbable = close X → Button iconOnly 的 focus-triggered
  // tooltip 會立即顯示「關閉」,user-hostile。此 callback 攔截:先找 body 第一個
  // input/textarea/select/button(排除 data-dismiss)focus;找不到就 focus container(不 focus X)。
  const handleOpenAutoFocus = (e: Event) => {
    e.preventDefault()
    const content = e.currentTarget as HTMLElement
    const firstBodyTarget = content.querySelector<HTMLElement>(
      '[data-dialog-body] input:not([disabled]),[data-dialog-body] textarea:not([disabled]),[data-dialog-body] select:not([disabled]),[data-dialog-body] button:not([disabled]):not([data-dismiss])'
    )
    const firstFooterButton = content.querySelector<HTMLElement>(
      '[data-dialog-footer] button:not([disabled]):not([data-dismiss])'
    )
    ;(firstBodyTarget ?? firstFooterButton ?? content).focus({ preventScroll: true })
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        // Density decouple canonical(2026-04-22):Dialog 的 layout-space=lg 給 header/body/footer
        // 寬鬆呼吸,但 ui-size 繼承 page default(通常 md)— Button/Input 不被撐大。
        // 這樣 header 不會被 button chrome 撐高,未來加 strapline / wrap 內容也不需限死高度。
        // 詳 density.spec.md「layout-space vs ui-size 解耦」+ 世界級對照(Carbon spacing scale
        // 獨立於 control size / GitHub Primer 8px scale 獨立)。
        data-layout-space="lg"
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2",
          "flex flex-col bg-surface-raised rounded-lg border border-border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        style={{
          boxShadow: 'var(--elevation-200)',
          maxWidth: `min(${maxWidthCss}, calc(100vw - ${insetCalc}))`,
          ...heightStyle,
          ...style,
        }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

// DialogHeader: SurfaceHeader + Close 按鈕(Dialog 特有)
// justify-between 讓 children 與 Close 分左右;Close 用 Radix DialogPrimitive.Close 包裝。
const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <SurfaceHeader
    ref={ref}
    className={cn("justify-between", className)}
    {...props}
  >
    <div className="flex-1 min-w-0">{children}</div>
    <DialogPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
    </DialogPrimitive.Close>
  </SurfaceHeader>
))
DialogHeader.displayName = "DialogHeader"

// DialogBody: flex-1 ScrollArea + inner padding(對齊 overlay-surface SSOT + ScrollArea canonical)
// 捲軸必用 ScrollArea(跨 OS 一致、不吃寬度)— 不自寫 overflow-y-auto。
// padding 搬進 viewport inner div:px-loose / pt-tight / pb-bottom(Dialog 「大容器」底部多一拍呼吸)。
// data-dialog-body:讓 DialogContent onOpenAutoFocus 找得到 body 第一個有意義互動元素(避免 focus 到 close X)
const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <ScrollArea ref={ref} data-dialog-body className={cn("flex-1 min-h-0", className)} {...props}>
    <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)] pb-[var(--layout-space-bottom)]">
      {children}
    </div>
  </ScrollArea>
))
DialogBody.displayName = "DialogBody"

// DialogFooter: SurfaceFooter wrap 加 data-dialog-footer(autoFocus fallback target)
const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => <SurfaceFooter ref={ref} data-dialog-footer {...props} />)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-body-lg font-medium truncate", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    // title → description 的 2px 間距 canonical(item-anatomy Family 2)
    className={cn("mt-0.5 text-body text-fg-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
