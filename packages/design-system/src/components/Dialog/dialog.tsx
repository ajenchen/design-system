// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/Button/button"
import { ButtonDivider } from "@/design-system/components/Button/button-group"
import { SurfaceHeader, SurfaceFooter, type SurfaceHeaderProps } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { TruncatedText } from "@/design-system/patterns/element-anatomy/truncated-text"
import { surfaceMotion } from "@/design-system/tokens/motion/overlay-motion"
import { useOverlayCoexistence, CoexistenceMask } from "@/design-system/lib/overlay-coexistence"

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
 * autoHeight（boolean）：高度隨內容，超過 viewport 時 max-height 安全帽。
 */

// 並存設定**一次到位**:在 Root 傳 `persistentElements`,Root 自動走 `modal={false}`,
// Content 由 context 拿到保留集合。不再要求消費者同時改兩個地方(Content 的 opt-in 與
// Root 的 modal 互相打架 —— 忘了 `modal={false}` 時 Radix 仍執行 hideOthers(content),
// 保留區不會變可用;跨模型審查 2026-09-08 R3 指出)。FileViewer 已是同款自動推導。
const DialogCoexistContext = React.createContext<(() => Element[]) | undefined>(undefined)
type DialogRootProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** 並存區域(中性契約):這個對話框開著時仍然可用的節點。傳了就自動非模態。 */
  persistentElements?: () => Element[]
}
const Dialog = ({ persistentElements, modal, ...props }: DialogRootProps) => (
  <DialogCoexistContext.Provider value={persistentElements}>
    <DialogPrimitive.Root modal={persistentElements ? false : modal} {...props} />
  </DialogCoexistContext.Provider>
)
Dialog.displayName = 'Dialog'
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

// asChild Omit(2026-07-18 決策2):DialogContent 是固定 surface chrome(overlay + 定位 +
// bg/rounded/shadow + onOpenAutoFocus),恆渲染 {children}(consumer body,通常 Header+Body+Footer
// 多節點)→ <Content asChild> Radix Slot React.Children.only crash。children 保留(consumer body)。
interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'asChild'> {
  /** 最大寬度。預設 512px。傳 number 視為 px。 */
  maxWidth?: string | number
  /**
   * 高度模式。
   * - 不傳（預設）：填滿 viewport（height = 100vh - inset*2），body 捲動。防止內容跳動。
   * - true：高度隨內容，超過 viewport 時捲動（max-height 安全帽）。
   */
  autoHeight?: boolean
  /**
   * **並存區域**(opt-in,中性契約)。傳入之後,這個 Dialog 開著時**這些節點仍然可用**,
   * 其餘一切被抑制(原生 `inert`,不支援時退回 `aria-hidden`)。不傳 = 行為與過去完全相同。
   *
   * 為什麼是「節點清單」而不是 `modality: 'partial'`:`partial` 不說「對誰部分」就沒有意義
   * (跨模型審查 2026-09-08 的指正)。世界級前例是 Chakra 的 `persistentElements`。
   *
   * **本元件不認識 agent**:誰要保留由呼叫端決定,DS 元件不被產品概念汙染。
   * 用途來自 agent 原則 v14 條 A/B(有 URL 的內容與 agent 並列可操作),
   * 但契約本身對任何「常駐區域」都成立。
   *
   * ⚠️ 傳了它就必須同時把 `Dialog`(Root)設 `modal={false}` ——
   * Radix 的 modal 分支寫死 `hideOthers(content)` 只保留 content、且無法傳白名單,
   * 兩者並用會互相打架。
   */
  persistentElements?: () => Element[]
  /**
   * Portal 目的地。預設 document.body;story / 產品的「模擬瀏覽器畫布」可把 Dialog 傳送進一個帶 transform 的
   * 容器,讓 `fixed` 定位以那個容器為準,modal 與遮罩就不會跑出畫布(2026-09-08 story 擬真需求)。
   */
  portalContainer?: HTMLElement | null
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, maxWidth = '512px', autoHeight, persistentElements: persistentElementsProp, portalContainer, children, style, ...props }, ref) => {
  const persistentElementsCtx = React.useContext(DialogCoexistContext)
  const persistentElements = persistentElementsProp ?? persistentElementsCtx
  // 用 **state** 而不是 ref 承接節點:並存的保留集合要「這個 Content + 常駐區域」,
  // 而 effect 跑的時候 ref 可能還沒填 —— 實測就是這樣,保留集合只剩常駐區,
  // **對話框自己被 inert 掉**(2026-09-08,對照組那一條當場紅)。
  // state 一變 effect 就重跑,節點掛上的那一刻保留集合才完整。
  const [contentEl, setContentEl] = React.useState<HTMLDivElement | null>(null)
  const composedRef = React.useCallback((node: HTMLDivElement | null) => {
    setContentEl(node)
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref])
  // 並存:保留集合 = 這個 Content + 呼叫端指定的常駐區域。
  // 沒傳 persistentElements 時 keep 是 undefined,hook 直接 no-op,預設路徑一個位元不變。
  const keep = React.useMemo(
    () => (persistentElements
      ? () => [contentEl, ...persistentElements()].filter((el): el is Element => !!el)
      : undefined),
    [persistentElements, contentEl],
  )
  // 只在 **Content 真的掛著** 時抑制(contentEl 非 null)。用 `!!persistentElements` 的話,
  // controlled `open=false` 期間 Content 已卸載但這個 wrapper 元件仍在,抑制不會解除 ——
  // 實測初始關閉 / 開→關 背景仍 inert(R3 生命週期反例)。
  useOverlayCoexistence(!!persistentElements && !!contentEl, keep)

  // 非模態分支會在「互動或焦點跑到框外」時 dismiss(`DialogContentNonModal` 追蹤
  // `hasInteractedOutsideRef`)。並存的時候這正好會反咬:**把焦點移進常駐區域就等於框外互動**,
  // 對話框當場關掉 —— 實測就是這樣,連 Esc 都還沒按(2026-09-08)。
  // 所以常駐區域內的 outside 事件要擋掉。Radix 官方對這件事的機制是 `DismissableLayer.Branch`,
  // 但那要求消費端把常駐區包起來;在這裡擋等價而且不強迫消費端改結構。
  // 只在有傳 persistentElements 時掛,預設路徑仍然一個位元不變。
  const insidePersistent = React.useCallback((node: EventTarget | null) => {
    if (!persistentElements || !(node instanceof Node)) return false
    if (persistentElements().some((el) => el.contains(node))) return true
    // 疊在上面的另一個 dialog(例:從並存 modal 裡開出的、沒有 URL 的確認框)也不算框外:
    // 非模態分支會把「焦點移進確認框」當 focus-outside 而把並存 modal 關掉,v14 第 9 題要的是「取消後兩邊恢復」。
    const other = (node instanceof Element ? node : node.parentElement)?.closest('[role="dialog"]')
    return !!other && other !== contentEl
  }, [persistentElements, contentEl])
  const guardOutside = persistentElements
    ? {
        onPointerDownOutside: (e: CustomEvent<{ originalEvent: PointerEvent }>) => {
          if (insidePersistent(e.detail.originalEvent.target)) e.preventDefault()
        },
        onFocusOutside: (e: CustomEvent<{ originalEvent: FocusEvent }>) => {
          if (insidePersistent(e.detail.originalEvent.target)) e.preventDefault()
        },
        onInteractOutside: (e: CustomEvent<{ originalEvent: Event }>) => {
          if (insidePersistent(e.detail.originalEvent.target)) e.preventDefault()
        },
      }
    : {}

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
    <DialogPortal container={portalContainer ?? undefined}>
      {/* 並存(modal={false})時 Radix 不畫 Overlay;user 2026-09-08:「為何 modal 沒有遮罩」—— 它仍是 modal,
          宿主要被遮,只有保留節點挖洞。一般 modal 走 Radix 自己的 Overlay(z-50)。 */}
      {/* 洞只挖給常駐節點;Content 本來就在遮罩上層(z-40 > z-30),挖給它反而會留下開場動畫縮放中量到的錯位白框 */}
      {persistentElements ? <CoexistenceMask keep={persistentElements} /> : <DialogOverlay />}
      <DialogPrimitive.Content
        ref={composedRef}
        // Density:**全繼承 page**(layout-space + ui-size 都不自鎖)。2026-06-16 定論(撤回本 session 一度加的
        // data-layout-space="lg"):density.spec 第 10 行親自定義 layout-space 管「dialog body padding」——
        // Dialog 鎖死它 = override 自家 dial 對它點名要管的對象失效 = 自相矛盾。有同類 padding-density dial 的
        // 世界級(SAP Fiori syncStyleClass / AWS Cloudscape「all view types」)都讓 modal 跟 page dial 走、不鎖固定 tier。
        // 效果:md page → body px-loose 16 / header py-tight 12(header 48);lg page → 24 / 16(header 56),隨 page。
        // 「modal 要寬鬆」需求在 lg 階自然滿足(Polaris modal 16 = 世界級下限,證明 md 16 合格);「button 不撐高
        // header」由 ui-size 繼承 page 解決(button=page sm),與 layout-space 鎖不鎖無關 → 故不需鎖。
        onOpenAutoFocus={handleOpenAutoFocus}
        {...guardOutside}
        className={cn(
          // 並存面(有 persistentElements)降到 z-40:窄版時常駐區(AgentPanel 蓋板 z-[45])要蓋在
          // **它**上面;沒有 URL 的一般確認框維持 z-50,必須蓋在常駐區上面(v14 條 A)。
          persistentElements ? "fixed left-1/2 top-1/2 z-40 w-full -translate-x-1/2 -translate-y-1/2"
                             : "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2",
          "flex flex-col bg-surface-raised rounded-lg border border-border",
          surfaceMotion,
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
// Close 靠右由「第一 child flex-1 grow」達成(justify-between 已移除,見 return 註解);Close 用 Radix DialogPrimitive.Close 包裝。
// 2026-05-18 audit gap fix:type 用 SurfaceHeaderProps 對齊 — DialogHeader 是 SurfaceHeader
// 薄包裝,withTabs / tabsSlot props 透過 spread 已 forward,但 TS type 沒 expose
// 導致 consumer 不能用 `<DialogHeader withTabs>` 而只能寫 `as any` 繞。Type lift 修
// per header-canonical.spec.md W1 跨 6 consumer 同契約。
export interface DialogHeaderProps extends SurfaceHeaderProps {
  /**
   * Header 級操作 cluster(2026-07-08 WM 戰役 codify — 關閉鈕分隔線 SSOT 化)。
   *
   * 提供時 render 在 Close X 左側,DS 自動在 actions 與 Close 之間放 `<ButtonDivider>`
   * (action-bar.spec.md:281「最右側為關閉/解除按鈕 → 分隔線必須(誤觸保護)」;
   * 幾何 = ButtonDivider mx-1 於 gap-2 cluster → 12px 對稱,同 spec「分隔線幾何」段)。
   *
   * 用例:任務詳情 prev/next 導覽、header 級溢出選單(⋮)。
   * Consumer 傳 `<Button variant="text" iconOnly …>`(text variant 自動 data-unbounded,
   * 不撐高 chrome header)。**禁**在 children 內自刻 cluster + divider(分隔線落點歸 DS)。
   */
  actions?: React.ReactNode
}

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  DialogHeaderProps
>(({ className, children, actions, ...props }, ref) => {
  // Dismiss X(chrome-slot canonical,v5):Button 本身 native sm(28 md / 32 lg,touch target 亦同),
  // 但 `dismiss` prop 自動標 `data-unbounded`,SurfaceHeader CSS rule 對其套負 my 讓
  // layout 佔位 = 24(`data-dismiss` 僅作 openAutoFocus 排除 marker,與縮位無關),
  // header = 24 + 2×tight = 48 / 56 chrome-header-height ✓。
  // 詳 overlay-surface.spec.md「Chrome dismiss size canonical」
  const closeButton = (
    <DialogPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
    </DialogPrimitive.Close>
  )
  return (
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
      {actions != null ? (
        // actions 提供 → 右側一體 cluster:{actions} + ButtonDivider + Close。
        // 分隔線 = 關閉保護 canonical(action-bar.spec.md:281),由 DS 放,consumer 零自刻。
        // gap-2 + ButtonDivider mx-1 = 兩側 12px 對稱(action-bar.spec.md「分隔線幾何」)。
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <ButtonDivider />
          {closeButton}
        </div>
      ) : (
        // 無 actions → 原結構(Close 直接是 SurfaceHeader child),行為零回歸
        closeButton
      )}
    </SurfaceHeader>
  )
})
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
// <DialogBody className="!px-0 !pt-0 !pb-0">  ← @tabs-content-gap-ok: JSDoc 文件範例(list-as-region canonical,非 tabs !pt-0 hack)
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
  <ScrollArea fillX ref={ref} data-dialog-body className="flex-1 min-h-0" {...props}>
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
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-body-lg font-medium truncate", className)}
    {...props}
  >
    {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md「截斷 → tooltip,僅實際截斷時顯示」)——
        title 單行 truncate 被裁掉後沒有 hover 補救路徑。display="block":h2 是 block container,
        inline span 量測不到 clientWidth(對照 breadcrumb.tsx 同型消費)。 */}
    <TruncatedText display="block">{children}</TruncatedText>
  </DialogPrimitive.Title>
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
  // 2026-07-04 audit 對齊:容器無 hover/active/disabled 態(spec「狀態處理的職責邊界」明文;對齊 popover meta 已修 pattern)
  states: ['default'],
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
