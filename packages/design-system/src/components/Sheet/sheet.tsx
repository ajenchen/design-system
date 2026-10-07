// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { withOverlayEscape } from "@/design-system/lib/overlay-escape"
import { useTriggerlessFocusReturn } from "@/design-system/lib/overlay-focus-return"
import {
  SurfaceHeader,
  SurfaceFooter,
  type SurfaceHeaderProps,
} from "@/design-system/patterns/overlay-surface/overlay-surface"
import { Button } from "@/design-system/components/Button/button"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { surfaceMotion } from "@/design-system/tokens/motion/overlay-motion"

/**
 * Sheet — **右側 Dialog primitive**(給消費者的 canonical)。
 *
 * ── 定位(2026-04-21 canonical)──
 * Sheet 給**消費者**用的唯一合法形式 = **右側開啟的 modal**(side="right"),
 * 內部結構跟 `Dialog` 一致:`SheetHeader` / `SheetBody` / `SheetFooter`(Header / Footer 消費
 * `SurfaceHeader` / `SurfaceFooter` primitive;Body = `ScrollArea` + 內層 padding div,
 * padding token SSOT 在 `patterns/overlay-surface/`)。side="right" 是 defaultVariants,消費者不傳 side。
 *
 * ── 其他 side(top / bottom / left)——**非消費者 API**,內部基建用 ──
 * top / bottom / left 變體保留給 DS 內部基建(例:Sidebar 在小尺寸視口時從 left 滑入)。
 * 消費者 code **禁止** 傳 `side="top" | "bottom" | "left"` — 這些用途需 user 授權。
 *
 * ── 跟 Dialog 的差異 ──
 * - Dialog = 中央 modal,用於「明確決策 / 表單 / 確認」
 * - Sheet(side="right")= 側滑 modal,用於「補充資訊 / 多欄位表單 / 編輯 flow」
 * - 兩者 API 結構 1:1 對應,差異只在 side / 動畫 / 初始寬度
 *
 * ── Header / Footer 消費 SurfaceXxx SSOT;Body 走 ScrollArea canonical ──
 * 避免 padding 漂移 — Dialog / Popover / Sheet / Coachmark 共用同一套 overlay-surface
 * padding token(px-loose / py-tight),改 overlay-surface.tsx 四者自動跟進;
 * SheetBody 同 DialogBody:ScrollArea + 內層 px-loose / pt-tight / pb-bottom(詳 SheetBody comment)。
 */

// Content 要知道自己是不是 modal(關閉後還焦點:modal 按遮罩收起也還、非 modal 點外面不搶;lib/overlay-focus-return.ts)。
// Radix 沒有把 modal 暴露給 Content,由 Root 經 context 交下去(同 Dialog 的 DialogModalContext)。
const SheetModalContext = React.createContext<boolean>(true)
const Sheet = ({ modal, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) => (
  <SheetModalContext.Provider value={modal ?? true}>
    <SheetPrimitive.Root modal={modal} {...props} />
  </SheetModalContext.Provider>
)
Sheet.displayName = 'Sheet'

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    // 遮罩與面板同一組 何時播 / 時長 / 曲線 / 收尾 / 減少動態 = surfaceMotion(與 DialogOverlay、FileViewer 遮罩同一份;
    // dialog.spec.md「動畫」表「Overlay:同上」、motion.spec.md「模態面板 Dialog/Sheet/FileViewer → --motion-duration-surface」)。
    // 2026-10-07 前這裡自己寫 animate-in/out + motion-reduce:animate-none:時長吃 tw-animate 預設 150ms/ease(沒接 token),
    // 減少動態守衛又輸給 data-[state=…] 的權重、從沒生效(待辦總帳 T7 / T8)。這裡只寫幾何。
    className={cn(
      "fixed inset-0 z-50 bg-overlay",
      surfaceMotion,
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

// ── sheetVariants ─────────────────────────────────────────────────────────
// side="right" 給**消費者**。top/bottom/left 給 **DS 內部基建**用(如 Sidebar 在
// narrow viewport 時切 side="left")。消費者 code 不傳 side,用 default。
const sheetVariants = cva(
  // 核心容器 — 無 padding(由 SheetBody / SheetHeader / SheetFooter 自理 padding,
  // 對齊 overlay-surface pattern + Dialog canonical)
  // Animation canonical:panel = surfaceMotion 250ms(--motion-duration-surface)雙向一致
  // (D4 audit:500ms 太久 sluggish);何時播 / 收尾 / 減少動態也在 surfaceMotion,這裡只寫 slide 幾何
  // overflow-hidden min-h-0:同 Dialog,補上 overlay-surface primitive 要求的父層契約(2026-09-12)。
  `fixed z-50 flex flex-col overflow-hidden min-h-0 bg-surface-raised shadow-[var(--elevation-200)] transition ease-in-out ${surfaceMotion}`,
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-divider data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-divider data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r border-divider data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-md",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-divider data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

// asChild Omit(2026-07-18 決策2):SheetContent 是固定 edge-anchored surface(overlay + sheetVariants
// 定位/slide 動畫 + onOpenAutoFocus),恆渲染 {children}(consumer body 多節點)→ <Content asChild>
// Radix Slot React.Children.only crash。children 保留(consumer body)。同 Dialog 收窄。
interface SheetContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, 'asChild'>,
    VariantProps<typeof sheetVariants> {}

// AutoFocus canonical(對齊 Dialog / Material / Polaris)— 見 dialog.tsx handleOpenAutoFocus 註解
/** @internal DS 預設 open-focus(首個 body 互動元素)。2026-10-01 起 SheetContent 會**組合** consumer 的 onOpenAutoFocus(consumer 先跑、
 *  沒擋預設才走這支),不再被 `{...props}` 整支蓋掉;自訂前置行為(如 AppShellAside opener snapshot)後仍可 import 接力呼叫。
 *  選擇器排除 `aria-disabled="true"`:忙碌 / 握著焦點時被停用的 Button 不轉原生 disabled(button.tsx),不該成為開啟時的落點。 */
export const handleSheetOpenAutoFocus = (e: Event) => {
  e.preventDefault()
  const content = e.currentTarget as HTMLElement
  const firstBodyTarget = content.querySelector<HTMLElement>(
    '[data-sheet-body] input:not([disabled]),[data-sheet-body] textarea:not([disabled]),[data-sheet-body] select:not([disabled]),[data-sheet-body] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
  )
  const firstFooterButton = content.querySelector<HTMLElement>(
    '[data-sheet-footer] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
  )
  ;(firstBodyTarget ?? firstFooterButton ?? content).focus({ preventScroll: true })
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, onEscapeKeyDown, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  // 關閉後焦點還給開啟者(2026-10-01 預設,待辦總帳 OE29;同 DialogContent):受控 `open`、沒有 SheetTrigger 開的側板,Radix 沒有東西可還。
  // 內容掛上時記下開啟者,關閉時找不到 Radix 觸發點就由全 DS 一支 lib/overlay-focus-return.ts 還;consumer 自己接了的(Sidebar 窄版抽屜 / AppShell 窄版側欄)照舊先跑、擋了預設就不接。
  const focusReturn = useTriggerlessFocusReturn(React.useContext(SheetModalContext))
  // Esc 守門要知道「焦點所在的控件在不在這一層裡面」(lib/overlay-escape.ts withOverlayEscape):內容節點走內部 ref,再合進 forwarded ref
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const composedRef = React.useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref])
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={composedRef}
        onOpenAutoFocus={(e) => {
          focusReturn.onOpenAutoFocus(e)
          onOpenAutoFocus?.(e)
          if (!e.defaultPrevented) handleSheetOpenAutoFocus(e)
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          focusReturn.onCloseAutoFocus(e)
        }}
        // Sheet 不自設 density,繼承 page 層級的 `html[data-density]`(2026-04-21 canonical 定案)
        className={cn(sheetVariants({ side }), className)}
        {...props}
        // 這一下 Esc 由誰處理(全 DS 一支,判準與出處住 lib/overlay-escape.ts withOverlayEscape):輸入法組字中不關;焦點所在控件宣告了自己還有一層且在這一層裡面 → 留給控件;其餘照舊關閉
        onEscapeKeyDown={withOverlayEscape(onEscapeKeyDown, () => contentRef.current)}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

// ── SheetHeader:SurfaceHeader + Close X(對齊 DialogHeader canonical)──────────
// 2026-05-18 audit gap fix:type 對齊 SurfaceHeaderProps,withTabs / tabsSlot expose
// 給 consumer(per header-canonical.spec.md W1 跨 6 consumer 同契約)。Spread 早 forward
// 過去,只是 TS type 沒 expose 導致 consumer 不能 type-safe 用 `<SheetHeader withTabs>`。
const SheetHeader = React.forwardRef<
  HTMLDivElement,
  SurfaceHeaderProps
>(({ className, children, ...props }, ref) => (
  // 2026-05-18:className 不再硬加 justify-between(同 DialogHeader 邏輯,避 column mode 破裂)。
  <SurfaceHeader
    ref={ref}
    className={className}
    {...props}
  >
    <div className="flex-1 min-w-0">{children}</div>
    {/* Dismiss X = native sm,SurfaceHeader 負 my trick 讓 layout 佔位 24 → chrome-header-height */}
    <SheetPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
    </SheetPrimitive.Close>
  </SurfaceHeader>
))
SheetHeader.displayName = "SheetHeader"

// ── SheetBody:flex-1 ScrollArea + chrome padding(對齊 DialogBody + ScrollArea canonical) ──
// 捲軸必用 ScrollArea(跨 OS 一致、不吃寬度)— 不自寫 overflow-y-auto。
// padding 搬進 viewport inner div:px-loose / pt-tight / pb-bottom。
// data-sheet-body:讓 SheetContent onOpenAutoFocus 找得到 body 第一個互動元素
//
// ── List-as-region 場景(menu / nav / settings list)──
// 不再提供 `flush` variant(2026-05-01 移除)。canonical = consumer 用 className override:
// `<SheetBody className="!px-0 !pt-0 !pb-0"><div className="py-2">{items}</div></SheetBody>`  ← @tabs-content-gap-ok: JSDoc 文件範例(list-as-region canonical,非 tabs !pt-0 hack;對齊 dialog.tsx 同款 marker)
// 詳 DialogBody comment + `tokens/layoutSpace/layoutSpace.spec.md`「List-as-region in overlay body」
// `className` forward 到 **inner content div**(非外層 ScrollArea wrapper)——
// consumer `<SheetBody className="flex flex-col gap-X">` 期望作用於 children 排列;
// 套在 ScrollArea 上會 0 效果(children 住 inner div),曾造成 Sheet form field 完全貼邊。
const SheetBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof ScrollArea>
>(({ className, children, ...props }, ref) => (
  <ScrollArea ref={ref} data-sheet-body className="flex-1 min-h-0" {...props}>
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
SheetBody.displayName = "SheetBody"

// ── SheetFooter:SurfaceFooter wrap 加 data-sheet-footer(autoFocus fallback target)──
const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => <SurfaceFooter ref={ref} data-sheet-footer {...props} />)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-body-lg font-medium truncate", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    // title → description 間距 canonical:SheetTitle body-lg(16)+ desc body(14)→ reading-lg token
    // (label tier 決定;對齊 Dialog canonical。Tailwind preflight reset h2/p margin=0 → 必顯式 mt)
    className={cn("mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const sheetMeta = {
  component: 'Sheet',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  // 2026-07-04 audit 對齊:Sheet 本身無 disabled state(surface container,spec 邊界案例明文;對齊 popover/dialog meta pattern)
  states: ['default'],
  tokens: {
    bg: ['bg-surface-raised'],
    fg: ['text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  sheetVariants,
}
