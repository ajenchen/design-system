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
import { useOverlayCoexistence, CoexistenceMask, createPersistentGuard } from "@/design-system/lib/overlay-coexistence"

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

// Modal 與 viewport 四邊的最小間距。2026-09-11 從 `--layout-space-bottom`(語意 = 結論留白)拆成同 family 的另一個 role token:
// 兩者值都是 48px,但語意不同,耦合在一起會讓「調結論留白」意外改掉全站 Dialog 的高度與最大寬度(見 token 註解)。
const DIALOG_INSET_VAR = 'var(--layout-space-viewport-inset)'

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay",
      // 遮罩與內容同一組時長 / 曲線(dialog.spec.md「動畫」表;2026-09-09 Codex R13 抓到規格寫 250ms、遮罩實際吃 tw-animate 預設 150ms/ease)
      surfaceMotion,
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
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
   * 高度軸 —— **只決定「怎麼長」,不決定「多高」**(多高由 `maxHeight` 管,兩者正交)。
   *
   * - `'fill'`(預設):填滿可用高度。內容多寡不改變外框幾何。
   * - `'hug'`:隨內容長高,碰到上限才由 body 捲動。
   *
   * **怎麼選(判準是時間維度,不是當下看起來幾行)**:
   * 從開啟到關閉這段期間,內容高度**會不會因為使用者的操作與互動而改變**?
   * 會 → `'fill'`(異步載入、展開區塊、可增減的清單);不會 → `'hug'`(確認框、短表單、固定文案)。
   * 理由:隨內容長高的浮層一旦內容變高變矮,整個對話框會上下跳動,體驗很差 —— 先把可用高度穩定下來,
   * 讓 body 自己捲,外框就不動了。
   *
   * 軸名與值照 DS 既有的寬度軸(`field-types.ts` 的 `FieldWidth = 'fill' | 'hug'`,2026-07-08 拍板),
   * 不另造詞彙。
   */
  height?: 'fill' | 'hug'
  /**
   * 最大高度 —— **只能選更矮的上限**。預設上限 = 視窗可用高度(`100svh - inset*2`);
   * 傳值時取 `min(視窗可用高度, 此值)`,傳再大也不會超過視窗。傳 number 視為 px。
   *
   * 形狀照 `DropdownMenu` 的 `maxHeight`(同樣是 min(視窗剩餘, 自訂));型別照本元件自己的 `maxWidth`
   * (`string | number`)—— 高度更需要 string,才寫得出 `60svh` / `calc(100svh - 120px)`。
   */
  maxHeight?: string | number
  /**
   * @deprecated 改用 `height="hug"`。兩者同時傳時 `height` 勝(dev 會 warn)。
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
>(({ className, maxWidth = '512px', height, maxHeight, autoHeight, persistentElements: persistentElementsProp, portalContainer, children, style, ...props }, ref) => {
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
  // 三種目標不算框外(規則與 FileViewer 共用一份:`lib/overlay-coexistence.ts` createPersistentGuard;dialog.spec.md「並存」):
  // (1) 保留節點子樹;(2) 保留區自己開出來的浮層 —— **含它關閉中的階段**;(3) 疊在上面的另一個 dialog(v14 第 9 題)。
  // 守衛要跨 render 存活(它記得認過的浮層),所以 contentEl 走 ref、memo 只綁 persistentElements。
  const contentElRef = React.useRef(contentEl)
  contentElRef.current = contentEl
  const insidePersistent = React.useMemo(
    () => (persistentElements ? createPersistentGuard(persistentElements, () => contentElRef.current) : () => false),
    [persistentElements],
  )
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
  // `svh`(small viewport height)不是 `vh`:行動裝置的網址列收合時 `100vh` 會大於實際可視高度,
  // 對話框底部(通常是主要動作鈕)會被切掉。DS 其他填滿視窗的外框已經是這個選擇
  // (`app-shell.tsx` 的 `h-svh`、`sidebar.tsx` 的 `100svh`),Dialog 跟上。桌機兩者等值。
  const availableH = `calc(100svh - ${insetCalc})`
  const maxWidthCss = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth
  const maxHeightCss = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
  // 上限只有一條公式,兩種模式共吃 —— 這就是「高度都不會超過最大高度」。
  // consumer 傳的值只能讓它更矮(`min`),傳再大也不會超過視窗。
  const heightCap = maxHeightCss ? `min(${availableH}, ${maxHeightCss})` : availableH

  const resolvedHeight: 'fill' | 'hug' = height ?? (autoHeight ? 'hug' : 'fill')
  if (process.env.NODE_ENV !== 'production' && height != null && autoHeight != null) {
    // eslint-disable-next-line no-console
    console.warn('[DialogContent] `height` 與 `autoHeight` 同時傳了;`autoHeight` 已 deprecated,這次以 `height` 為準。')
  }
  // fill 同時寫 height 與 maxHeight 不是冗餘:(a) 讓「兩種模式回報同一個上限」可被機械驗證;
  // (b) 擋住下方 `...style` 的逃生口 —— consumer 蓋掉 `height` 時 `maxHeight` 仍然生效。
  const heightStyle: React.CSSProperties = resolvedHeight === 'hug'
    ? { maxHeight: heightCap }
    : { height: heightCap, maxHeight: heightCap }

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
          // `overflow-hidden min-h-0` 是 overlay-surface primitive 明文要求的父層契約
          // (`overlay-surface.tsx:180-182` 逐字:「parent(PopoverContent / HoverCardContent /
          // Dialog / Sheet)是 flex flex-col + max-h + overflow-hidden」)。Popover/HoverCard 一直有,
          // Dialog 與 Sheet 漏了 → 視窗變矮時內容直接畫到圓角容器外面(2026-09-12 user 截圖)。
          // 少了 min-h-0,dialog 自己在 flex 容器裡也收縮不到 max-height 以下。
          "flex flex-col overflow-hidden min-h-0 bg-surface-raised rounded-lg border border-border",
          // 進出場 = 從中心淡入 + 輕微縮放,**不位移**(dialog.spec.md「動畫」段;時長 / 曲線 / reduced-motion 由
          // surfaceMotion 消費 --motion-duration-surface / --motion-easing-enter / --motion-easing-exit)。
          // 2026-09-09 user 抓到「從左上角飛到中間」:shadcn v3 時代的 `slide-in-from-left-1/2 slide-in-from-top-[48%]`
          // 是為了在 keyframe 的 `transform` 裡重寫置中位移(v3 的 -translate-x-1/2 也走 transform,會被 keyframe 蓋掉);
          // Tailwind v4 的 -translate-x-1/2 改寫進獨立的 `translate` 屬性,不再被 keyframe 蓋掉,兩者相加 = 第一幀
          // 中心落在視窗中心左 w/2、上 0.48h 處(實測 -240px / -90.72px)。shadcn v4 版本已把這兩組 class 拿掉。
          // 閘:scripts/dialog-coexistence-invariant.mjs「進場第一幀」(靜態禁同用 + 第一幀幾何 + 對照組)。
          surfaceMotion,
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
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
