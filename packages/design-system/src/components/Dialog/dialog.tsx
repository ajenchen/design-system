// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/Button/button"
import { SurfaceHeader, SurfaceFooter, type SurfaceHeaderProps } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"

/**
 * Dialog (Modal) — Radix Dialog + 設計系統 token
 *
 * ── Layout ──
 * px = layout-space-loose, header/footer py = layout-space-tight。
 * Body pt = layout-space-tight, pb = layout-space-bottom。
 * Density:繼承 page `data-density`(v5 校準,跟 Sheet 對齊;header 自動對齊
 * `--chrome-header-height` 48/56)。詳 dialog.spec.md「Density」節。
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
      "data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none",
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
        // Density canonical(2026-04-22 v5 校準):Dialog 繼承 page density(跟 Sheet 對齊
        // sheet.tsx line 111 canonical),不自設 data-layout-space="lg" 或 data-density。
        //
        // 先前曾設 `data-layout-space="lg"` 給 header/body 寬鬆呼吸,但跟 chrome-header-height
        // canonical 衝突(md page dialog header 期望 48,強設 lg 會變 56)。
        // 世界級對照:Polaris Modal horizontal padding 16 / Material M3 24 / Atlassian 24 — 16 是
        // 合理 lower bound;md page 用 16 loose body padding 可接受,lg page 自動 24。
        // 詳 overlay-surface.spec.md「Chrome dismiss size canonical」
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2",
          "flex flex-col bg-surface-raised rounded-lg border border-border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none",
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
// 2026-05-18 audit gap fix:type 用 SurfaceHeaderProps 對齊 — DialogHeader 是 SurfaceHeader
// 薄包裝,withTabs / lockDensity 等 props 透過 spread 已 forward,但 TS type 沒 expose
// 導致 consumer 不能用 `<DialogHeader withTabs>` 而只能寫 `as any` 繞。Type lift 修
// per header-canonical.spec.md W1 跨 6 consumer 同契約。
const DialogHeader = React.forwardRef<
  HTMLDivElement,
  SurfaceHeaderProps
>(({ className, children, ...props }, ref) => (
  // 2026-05-18:className 不再硬加 justify-between(冗餘:row 1 是 flex items-center gap-2,
  // 第一 child flex-1 grow 自然 push close X 靠右,跟 justify-between 同視覺)。
  // 並且 column mode(tabsSlot 提供)justify-between 會把 row 1 / row 2 上下推開 = 破裂。
  // tabsSlot via `...props` spread 自動 forward(type 來自 SurfaceHeaderProps)。
  <SurfaceHeader
    ref={ref}
    className={className}
    {...props}
  >
    <div className="flex-1 min-w-0">{children}</div>
    {/* Dismiss X(chrome-slot canonical,v5):Button 本身 native sm(28 md / 32 lg,touch target 亦同),
        但 `dismiss` prop 自動標 `data-unbounded`,SurfaceHeader CSS rule 對其套負 my 讓
        layout 佔位 = 24(`data-dismiss` 僅作 openAutoFocus 排除 marker,與縮位無關),
        header = 24 + 2×tight = 48 / 56 chrome-header-height ✓。
        詳 overlay-surface.spec.md「Chrome dismiss size canonical」*/}
    <DialogPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
    </DialogPrimitive.Close>
  </SurfaceHeader>
))
DialogHeader.displayName = "DialogHeader"

// DialogBody: flex-1 ScrollArea + chrome padding(對齊 overlay-surface SSOT + ScrollArea canonical)
// 捲軸必用 ScrollArea(跨 OS 一致、不吃寬度)— 不自寫 overflow-y-auto。
// padding 搬進 viewport inner div:px-loose / pt-tight / pb-bottom(Dialog 「大容器」底部多一拍呼吸)。
// data-dialog-body:讓 DialogContent onOpenAutoFocus 找得到 body 第一個有意義互動元素(避免 focus 到 close X)
//
// ── List-as-region 場景(menu group / Cmd+K)──
// 不再提供 `flush` variant(2026-05-01 移除,先前曾叫 `variant="list"`)。
// **canonical pattern** = consumer 自管 list outer wrapper + 用 `className` override 撤掉 chrome padding:
// ```tsx
// <DialogBody className="!px-0 !pt-0 !pb-0">
//   <div className="py-2">  {/* list outer wrapper 自帶 py-2(menu group canonical)*/}
//     {items.map(item => <MenuItem className="px-[var(--layout-space-loose)] rounded-md" />)}
//   </div>
// </DialogBody>
// ```
// **rationale**:flush 只為 list-only body 省一行 className,但 (a) 多一個 row(search / banner)
// 就破功 → 保留 chrome padding 反而更穩,(b) 加新 variant 不解決底層脆弱(consumer 仍要管 list py
// 且 item px-loose),反而把 1 個 surface decision 拆兩 API。世界級主流(Material/Atlassian/Mantine/
// shadcn)無 universal LayoutBody flush variant,Polaris flush API 只用於極窄 scope。
// 詳 `tokens/layoutSpace/layoutSpace.spec.md`「List-as-region in overlay body」節
// `className` forward 到 **inner content div**(非外層 ScrollArea wrapper)——
// consumer `<DialogBody className="flex flex-col gap-X">` 期望作用於 children 排列;
// 套在 ScrollArea 上會 0 效果(children 住 inner div),曾造成 modal form field 完全貼邊。
const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollArea>
>(({ className, children, ...props }, ref) => (
  <ScrollArea ref={ref} data-dialog-body className="flex-1 min-h-0" {...props}>
    <div
      className={cn(
        "px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)] pb-[var(--layout-space-bottom)]",
        className,
      )}
    >
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
    // title → description 間距 canonical:DialogTitle 是 body-lg(16)+ desc body(14)→ reading-lg token
    // (label tier 決定 token 選擇;item-anatomy Family 2 reading-family token 對照表)
    className={cn("mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dialogMeta = {
  component: 'Dialog',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-surface-raised'],
    fg: ['text-fg-secondary'],
    ring: [],
  },
} as const

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
