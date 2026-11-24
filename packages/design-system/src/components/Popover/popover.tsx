// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SurfaceHeader, SurfaceBody, SurfaceFooter, COMPACT_HEADER_SLOT, type SurfaceHeaderProps } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { TruncatedText } from "@/design-system/patterns/element-anatomy/truncated-text"
import { Button } from "@/design-system/components/Button/button"
import { OVERLAY_SIDE_OFFSET, OVERLAY_COLLISION_PADDING, OVERLAY_HIDE_WHEN_DETACHED, OVERLAY_VIEWPORT_MAX_WIDTH, OVERLAY_AVAILABLE_HEIGHT, OVERLAY_COVER_AVAILABLE_HEIGHT, capHeight, coverAnchorPosition } from "@/design-system/tokens/elevation/overlay-geometry"
import { overlayMotion } from "@/design-system/tokens/motion/overlay-motion"
import { withOverlayEscape } from "@/design-system/lib/overlay-escape"
import { useExitStartFocusReturn } from "@/design-system/lib/overlay-focus-return"
import { useI18n } from "@/design-system/lib/i18n/i18n-context"
import { OverlayAnchorScope, elementOfVirtual, regionSourceNode, useOverlayAnchorRegistry, useRegisterOverlayNode, useRegisterVirtualAnchor, useTriggerRegionDensity } from "@/design-system/lib/overlay-density"
import { isInChildLayer, useOverlayLayer } from "@/design-system/lib/overlay-nesting"

/**
 * Popover — Radix Popover + 設計系統 token
 *
 * ── 視覺 ──
 * 與 Dialog 對齊：bg-surface-raised / rounded-lg / border-border / elevation-200。
 * layout-space 鎖 md（輕量浮層 header py-tight 保持精簡）；ui-size 跟觸發點那一區（內部控件對齊觸發點；2026-06-15 起不鎖、
 * 2026-11-11 起從「跟整頁」改成「跟觸發點」—— user「浮層密度:跟按鈕」,lib/overlay-density.tsx）。
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

// 觸發點 / 錨點節點登記處(lib/overlay-density.tsx;Popover 自己一個 context,不與 Tooltip 等其他浮層共用):
// Root 開登記處、Trigger 與 Anchor 把節點登記進來。
// 兩個用途:(1) 密度跟觸發點 —— Content 從錨點(沒有就觸發點)那一區讀兩軸檔位(density.spec.md「浮層跟觸發點」);
// (2) 焦點歸還(2026-10-21,r1b fields N1)—— PopoverContent 在關閉的那一刻就要做 Radix 卸載時才做的「還給觸發點」
// (lib/overlay-focus-return.ts useExitStartFocusReturn),Radix 的 context 不外露。Root / Trigger / Anchor 的 props 與行為原樣轉給 Radix。
// 為什麼一定要「Popover 自己一個」:DatePicker 單日模式是 <Popover><Tooltip><PopoverTrigger>,共用時 PopoverTrigger 會被
// 中間那層 Tooltip 的登記處接走 → 焦點歸還拿到 null → Esc 收起後 Tab 掉到 body(2026-11-12 修;lib/overlay-density.tsx 檔頭)。
const Popover = ({ children, ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) => (
  <PopoverPrimitive.Root {...props}>
    <OverlayAnchorScope family="popover">{children}</OverlayAnchorScope>
  </PopoverPrimitive.Root>
)
Popover.displayName = "Popover"

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>((props, ref) => {
  const composedRef = useRegisterOverlayNode("popover", "trigger", ref)
  return <PopoverPrimitive.Trigger ref={composedRef} {...props} />
})
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName

// ── 蓋在錨點上(PopoverContent `coverAnchor`;2026-11-24,總帳 Q2b(定))──
// Radix 只會把浮層貼在錨點某一側(side + align;floating-ui 的 offset / shift / flip),沒有「浮層中心 = 錨點中心」這種擺法。
// 做法(POC 2026-11-24:6 種錨點位置 × 3 種內容高,18 / 18 中心與推回量誤差 0px;改用 Radix 預設的對照組 0 / 18):
// consumer 給的 virtualRef 不直接交給 Radix,交的是包過一層的虛擬錨點 —— floating-ui 每次算位置都呼叫它的
// getBoundingClientRect(開啟、捲動、縮放視窗、浮層自己長高都會重算,`autoUpdate` 有觀察浮層尺寸):
//   - 這一組的內容沒開 coverAnchor → 原樣回錨點的矩形(畫面與改前相同);
//   - 開了 → 用「錨點當下的矩形 + 內容當下的尺寸 + 視窗」算出浮層左上角(`coverAnchorPosition`),回一個高 0 的矩形,
//     PopoverContent 同時改成 side=bottom / align=start / 間距 0 / 不由 Radix 推回 —— 浮層左上角就落在算好的位置。
//   - 錨點沒有版面(0×0)或整個在視窗外 → 回原矩形,讓 hideWhenDetached 照常藏起來,不把浮層推回畫面上一個看不到錨點的地方
//     (同 overlay-geometry.ts OVERLAY_HIDE_WHEN_DETACHED:沒有版面時量到的數字不代表任何事)。
// contextElement = 錨點真正的元素:floating-ui 用它找捲動祖先、裁切範圍(Floating UI「virtual elements」https://floating-ui.com/docs/virtual-elements )。
//
// **換錨點 = 換一個包裝物件**(2026-11-24 審查必修):Radix 只在 virtualRef.current 換了物件時才通知「錨點變了」、floating-ui 才換參考元素
// 並重算位置(@radix-ui/react-popper 1.2.8 dist/index.mjs:43-48 PopperAnchor 的 useEffect:`anchorRef.current = virtualRef?.current || ref.current`,
// 與上一次不同才 `context.onAnchorChange`)。所以交給 Radix 的 ref 的 current 是 getter:consumer 的 current 是同一個東西 → 回同一個包裝;
// 換成另一個 → 回一個綁定新錨點的新包裝;null → null —— 與直接把 consumer 的 virtualRef 交給 Radix 時,Radix 看到的「換了沒」逐次相同。
// 只交一個永遠不變的包裝時:浮層還掛著(收起動畫中又被打開、或一直開著)consumer 改指另一個元素,Radix 不重算 → 浮層停在舊錨點、內容卻是新的
// (Calendar 示範殼開著時點另一個事件;閘 scripts/overlay-cover-anchor-invariant.mjs M 列,對照突變 = 那個寫法)。
type CoverAwareAnchor = { getBoundingClientRect: () => DOMRect; readonly contextElement: Element | undefined }
type MeasurableSource = { getBoundingClientRect?: () => DOMRect }

function coverAwareAnchorOf(source: MeasurableSource, coverContent: () => HTMLElement | null | undefined): CoverAwareAnchor {
  return {
    get contextElement() { return elementOfVirtual(source) ?? undefined },
    getBoundingClientRect() {
      const rect = source.getBoundingClientRect?.() ?? new DOMRect()
      const content = coverContent()
      if (!content?.isConnected) return rect
      const root = content.ownerDocument.documentElement
      const viewport = { width: root.clientWidth, height: root.clientHeight }
      const detached = (rect.width === 0 && rect.height === 0) || rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewport.height || rect.left >= viewport.width
      if (detached) return rect
      const { x, y } = coverAnchorPosition(rect, { width: content.offsetWidth, height: content.offsetHeight }, viewport)
      return new DOMRect(x, y, rect.width, 0)
    },
  }
}

function useCoverAwareAnchor(virtualRef: React.RefObject<unknown> | undefined, registry: ReturnType<typeof useOverlayAnchorRegistry>) {
  const latest = React.useRef(virtualRef)
  latest.current = virtualRef
  const latestRegistry = React.useRef(registry)
  latestRegistry.current = registry
  const handle = React.useRef<{ readonly current: CoverAwareAnchor | null } | null>(null)
  if (!handle.current) {
    let source: MeasurableSource | null = null
    let wrapped: CoverAwareAnchor | null = null
    handle.current = {
      get current() {
        const next = (latest.current?.current ?? null) as MeasurableSource | null
        if (next !== source) {
          source = next
          wrapped = next ? coverAwareAnchorOf(next, () => latestRegistry.current?.coverContent.current) : null
        }
        return wrapped
      },
    }
  }
  return virtualRef ? handle.current : undefined
}

const PopoverAnchor = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Anchor>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(({ virtualRef, ...props }, ref) => {
  const composedRef = useRegisterOverlayNode("popover", "anchor", ref)
  // virtualRef 時 Radix 不畫元素(callback ref 拿不到節點)→ 登記 ref 本身,密度改從它指到的元素那一區讀
  useRegisterVirtualAnchor("popover", virtualRef)
  // 交給 Radix 的是包過一層的虛擬錨點(見上方「蓋在錨點上」;consumer 換錨點 = 換一個包裝,Radix 才會重算);沒開 coverAnchor 時它原樣回 virtualRef 指到的那個東西的矩形
  const radixVirtualRef = useCoverAwareAnchor(virtualRef, useOverlayAnchorRegistry("popover"))
  return <PopoverPrimitive.Anchor ref={composedRef} {...props} virtualRef={radixVirtualRef as React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>["virtualRef"]} />
})
PopoverAnchor.displayName = PopoverPrimitive.Anchor.displayName
const PopoverClose = PopoverPrimitive.Close

// AutoFocus canonical(對齊 Dialog / Sheet / Material / Polaris)—
// 開啟時 focus 落在 body 第一個有意義互動元素,避免 focus 到 close X 觸發 tooltip leak。
// 兩段查詢對齊 dialog.tsx handleOpenAutoFocus(2026-07-05 修):舊版單一混合清單按 DOM 序取
// 第一 match,header 內互動元素(非 data-dismiss)會搶走 body 首元素焦點,且 bare 段漏 select。
// 改為:先 body-scoped 查詢,查無才退 bare 全域清單(保留 naked popover — consumer 不用
// PopoverBody 自管結構 — 的 fallback 意圖),最後 footer → content 容器。
// 選擇器排除 `aria-disabled="true"`(2026-10-01):忙碌 / 握著焦點時被停用的 Button 不轉原生 disabled(button.tsx 可聚焦的停用),不該成為開啟時的落點。
const handlePopoverOpenAutoFocus = (e: Event) => {
  e.preventDefault()
  const content = e.currentTarget as HTMLElement
  const firstBodyTarget = content.querySelector<HTMLElement>(
    '[data-popover-body] input:not([disabled]),[data-popover-body] textarea:not([disabled]),[data-popover-body] select:not([disabled]),[data-popover-body] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
  )
  const firstBareTarget = content.querySelector<HTMLElement>(
    'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
  )
  const firstFooterButton = content.querySelector<HTMLElement>(
    '[data-popover-footer] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
  )
  ;(firstBodyTarget ?? firstBareTarget ?? firstFooterButton ?? content).focus({ preventScroll: true })
}

// ── PopoverTitle → aria-labelledby 自動接線(2026-07-05,照 Radix Dialog Title 機制補 DS 層)──
// Radix Popover 的 content 有 role="dialog",但沒有 Radix Dialog Title 式的自動 accessible name
// 接線 → 一般 Popover 預設無 accessible name。DS 層以 context 補同機制:PopoverContent 以 useId
// 建 titleId 供給 children;PopoverTitle 掛載時註冊,PopoverContent 偵測到有 title 註冊才設
// aria-labelledby。Consumer 自傳 aria-label / aria-labelledby 一律優先。PopoverTitle 亦被
// DataTable sort / filter panel 等非 PopoverContent 場景裸用(raw SurfaceHeader chrome)—
// context 為 null 時全部 no-op,行為與舊版一致。
interface PopoverTitleContextValue {
  titleId: string
  onTitleMount: () => void
  onTitleUnmount: () => void
}

const PopoverTitleContext = React.createContext<PopoverTitleContextValue | null>(null)

interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * 浮層寬(2026-11-15;`ds-canonical/references/props-naming.md`「尺寸參數」= user「尺寸:甲」)。不傳 = 預設 18rem(`w-72`,畫面不變)。
   * - 數字 = px 固定寬,夾在視窗內(`OVERLAY_VIEWPORT_MAX_WIDTH`,左右各留 1rem)—— 視窗再窄也不超出畫面;
   * - `'hug'` = 跟內容(裡面的面板自己決定寬,例:表格三個工具面板 `DataTableSortManager` / `DataTableFilterPanel` / 指定了 `width` 的 `DataTableColumnVisibilityPanel`)。
   * 2026-11-15 前只能用 `className="w-80"` / `"w-auto"` 改(沒有型別;className 仍可用,但改寬走這個參數)。
   */
  width?: number | 'hug'
  /**
   * 最大高度 —— **只能選更矮的上限**(2026-11-24;契約同 `DialogContent` 的 `maxHeight`)。預設上限 = 觸發點那一側的可用高
   * (Radix 算到碰撞邊界、已扣 collisionPadding;`OVERLAY_AVAILABLE_HEIGHT`);傳值時取 `min(可用高, 此值)`,傳再大也不會超出視窗。
   * 數字 = px;字串照原樣(`60svh` / `calc(100svh - 120px)`)。公式住 `tokens/elevation/overlay-geometry.ts` 的 `capHeight`。
   */
  maxHeight?: number | string
  /**
   * 蓋在錨點上(2026-11-24;「展開型」,`popover.spec.md`「蓋在錨點上(展開型)」):浮層中心 = 錨點中心(水平 + 垂直),
   * 碰到視窗邊推回、離邊 `collisionPadding` 8(`tokens/elevation/overlay-geometry.ts` `coverAnchorPosition`);
   * 高度上限的可用高改成「視窗高 − 上下各 8」(`OVERLAY_COVER_AVAILABLE_HEIGHT`),`maxHeight` 照樣只能往更矮調。
   * 錨點要用 `<PopoverAnchor virtualRef>` 給(例:月曆的那一格);開著時 `side` / `align` / `sideOffset` / `alignOffset` /
   * `avoidCollisions` / `collisionPadding` 不作用(位置由錨點與視窗決定)。用途:點格子裡的「+N」展開當天全部事件。
   */
  coverAnchor?: boolean
}

/** coverAnchor 時交給 Radix 的擺法:浮層左上角 = 虛擬錨點的左下角(= 算好的位置),推回由我們算(見 PopoverAnchor 上方「蓋在錨點上」) */
const COVER_PLACEMENT = { side: "bottom", align: "start", sideOffset: 0, alignOffset: 0, avoidCollisions: false, collisionPadding: 0 } as const

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, style, width, maxHeight, coverAnchor = false, align = "center", sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = OVERLAY_COLLISION_PADDING, hideWhenDetached = OVERLAY_HIDE_WHEN_DETACHED, onOpenAutoFocus, onCloseAutoFocus, onInteractOutside, onEscapeKeyDown, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props }, ref) => {
  const titleId = React.useId()
  const [hasTitle, setHasTitle] = React.useState(false)
  const titleContext = React.useMemo<PopoverTitleContextValue>(
    () => ({ titleId, onTitleMount: () => setHasTitle(true), onTitleUnmount: () => setHasTitle(false) }),
    [titleId],
  )
  // Esc 守門要知道「焦點所在的控件在不在這一層裡面」(lib/overlay-escape.ts withOverlayEscape):內容節點走內部 ref,再合進 forwarded ref
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  // 收起動畫不延後焦點歸還(lib/overlay-focus-return.ts useExitStartFocusReturn;2026-10-21 r1b fields N1):
  // 關閉的那一刻就跑 consumer 的 onCloseAutoFocus,沒被擋再走 Radix 非 modal 的預設 —— 沒互動過外面就還給觸發點
  // (@radix-ui/react-popover 1.1.15 dist/index.mjs PopoverContentNonModal 的 onCloseAutoFocus / onInteractOutside,這裡照抄同一個判斷)。
  const anchorRegistry = useOverlayAnchorRegistry("popover")
  const triggerNodeRef = anchorRegistry?.trigger ?? null
  const interactedOutsideRef = React.useRef(false)
  const resolvedOpenAutoFocus = onOpenAutoFocus ?? handlePopoverOpenAutoFocus
  const exitFocus = useExitStartFocusReturn({
    onCloseAutoFocus,
    onOpenAutoFocus: resolvedOpenAutoFocus,
    radixDefault: () => {
      if (!interactedOutsideRef.current) triggerNodeRef?.current?.focus()
      interactedOutsideRef.current = false
    },
  })
  const attachExitFocus = exitFocus.ref
  // 這一層登記進浮層疊(lib/overlay-nesting.ts):錨點在這一層裡、比這一層晚開的另一層 = 從這一層開出來的,點它不關這一層(下方 onInteractOutside)
  const attachLayer = useOverlayLayer<HTMLDivElement>(() => regionSourceNode(anchorRegistry))
  const coverRef = React.useRef(coverAnchor)
  coverRef.current = coverAnchor
  const innerRef = React.useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node
    attachExitFocus(node)
    attachLayer(node)
    // 蓋在錨點上:PopoverAnchor 的虛擬錨點在定位計算的那一刻讀這個節點的尺寸(見 PopoverAnchor 上方「蓋在錨點上」)
    if (anchorRegistry) anchorRegistry.coverContent.current = node && coverRef.current ? node : null
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref, attachExitFocus, attachLayer, anchorRegistry])
  // 開發期提醒:coverAnchor 的位置由 PopoverAnchor 的虛擬錨點算,沒有它就只是一般擺法(Anchor 的登記在 layout effect,這裡讀得到)
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && coverAnchor && anchorRegistry && !anchorRegistry.virtualAnchor.current) {
      console.warn('[PopoverContent] coverAnchor 要用 <PopoverAnchor virtualRef> 指定錨點;目前沒有,浮層照一般擺法貼在觸發點旁。')
    }
  }, [coverAnchor, anchorRegistry])
  // 觸發點那一區的兩軸檔位(lib/overlay-density.tsx;內容根元素掛上去才讀、關著不讀);版面間距那一軸下面再鎖回 md
  const { attrs: regionDensity, ref: composedRef } = useTriggerRegionDensity("popover", innerRef)
  // Provider 必須包在 Portal **外面**(2026-10-13,待辦總帳 T11):Radix PopoverPortal 自己有一層 Presence
  // (@radix-ui/react-popover dist/index.mjs:110),它經 Slot 把 ref 交給 Portal 的**直接子元素**、靠那個 DOM 節點讀
  // animation-name 決定「等收起動畫播完才卸載」。eff41482(2026-07-07)把 Provider 夾在 Portal 與 Content 之間,
  // ref 落在 Provider 上拿不到節點 → 關閉當下整個卸載,收起動畫(overlayMotion 的 150ms 淡出)從來沒播過。
  // React context 本來就穿得過 Portal,搬到外面 PopoverTitle 照樣讀得到,行為不變。
  return (
    <PopoverTitleContext.Provider value={titleContext}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={composedRef}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          // 錨點失去版面時不畫(同 Tooltip;詳 tokens/elevation/overlay-geometry.ts)
          hideWhenDetached={hideWhenDetached}
          // 控制項大小跟觸發點那一區(2026-11-11 user「浮層密度:跟按鈕」;lib/overlay-density.tsx):
          // 一般密度頁面裡的大密度區塊打開的下拉,選項列 = 該區塊的值,跟觸發點對齊。
          {...regionDensity}
          // 版面間距鎖 md(2026-06-15 canonical,原 data-density="md" 改為只鎖 layout-space):Popover 是
          // 輕量浮層,header/footer 用 py-tight(layout-space)→ 鎖 layout-space=md 保持精簡 padding;寫在上面那組屬性之後,
          // 覆蓋讀到的版面間距檔位。[data-layout-space="md"] 有 reset selector(layoutSpace.css「鎖回一般密度」段)→ lg 上正確回到 md。
          data-layout-space="md"
          onOpenAutoFocus={(e) => { interactedOutsideRef.current = false; resolvedOpenAutoFocus(e) }}
          onCloseAutoFocus={(e) => { exitFocus.onCloseAutoFocus(e); interactedOutsideRef.current = false }}
          // 與 Radix 同一個判準記「互動過外面」:consumer 沒擋 = 記(Radix 自己的那一份不外露)
          // 從這一層開出來的那一層(錨點在這一層裡、比這一層晚開;lib/overlay-nesting.ts)不算外面 —— 同 Radix 對元件樹裡的子孫,不轉呼叫 consumer
          onInteractOutside={(e) => {
            if (isInChildLayer(contentRef.current, e.detail.originalEvent.target)) { e.preventDefault(); return }
            onInteractOutside?.(e)
            if (!e.defaultPrevented) interactedOutsideRef.current = true
          }}
          aria-label={ariaLabel}
          // accessible name 自動接線:consumer 自傳優先;無 aria-label 且有 PopoverTitle 註冊才掛 titleId
          aria-labelledby={ariaLabelledBy ?? (ariaLabel == null && hasTitle ? titleId : undefined)}
          className={cn(
            // @focus-suppress E — E 浮層程式落點;承擔者:浮層開啟時的程式落點;內部控件各自有指示
            "z-50 w-72 rounded-lg border border-border bg-surface-raised text-foreground shadow-[var(--elevation-200)] outline-none",
            // 2026-05-04 viewport-aware 高度上限(從 ProfileCard 升 DS-wide):header/footer 永遠 in-viewport,body 壓縮 scroll。
            // 上限本身寫在下方 style.maxHeight(2026-11-24 起讀 overlay-geometry 的 capHeight;class 讀不到 TS 常數)
            // 2026-05-05 audit dim 35 補:加 `min-h-0` 完成 M25 chain invariant(flex item default min-h: auto 阻 shrink)
            "flex flex-col overflow-hidden min-h-0",
            overlayMotion,
            // 何時播 / 收尾 / 減少動態由 overlayMotion 負責(tokens/motion/overlay-motion.ts);這裡只寫幾何
            "data-[state=closed]:fade-out-0 not-data-[state=closed]:fade-in-0 data-[state=closed]:zoom-out-95 not-data-[state=closed]:zoom-in-95",
            // 蓋在錨點上:沒有「從哪一側滑進來」,從自己的中心(= 錨點中心)縮放展開
            coverAnchor
              ? "origin-center"
              : ["data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                "origin-[var(--radix-popover-content-transform-origin)]"],
            // width="hug":排在預設 w-72 之後、consumer className 之前(tailwind-merge 取後者;consumer 自己的 w-* 仍可蓋)
            width === "hug" && "w-auto",
            className
          )}
          // 高度上限 = capHeight(可用高, maxHeight)(tokens/elevation/overlay-geometry.ts;與 HoverCard / DropdownMenu / Dialog 同一條公式)。
          // width={數字}:inline style 勝過 class 的預設 w-72;夾限與表格工具面板同一份(OVERLAY_VIEWPORT_MAX_WIDTH)。consumer 的 style 最後展開,仍可蓋
          style={{
            maxHeight: capHeight(coverAnchor ? OVERLAY_COVER_AVAILABLE_HEIGHT : OVERLAY_AVAILABLE_HEIGHT, maxHeight),
            ...(typeof width === "number" ? { width: `${width}px`, maxWidth: OVERLAY_VIEWPORT_MAX_WIDTH } : null),
            ...style,
          }}
          {...props}
          {...(coverAnchor ? COVER_PLACEMENT : null)}
          // 這一下 Esc 由誰處理(全 DS 一支,判準與出處住 lib/overlay-escape.ts withOverlayEscape):輸入法組字中不關;焦點所在控件宣告了自己還有一層
          // 且在這一層裡面(面板裡改過的欄位 / 鍵盤拖曳中的條件)→ 留給控件、不關;控件在外面(可打字的 DatePicker 欄位 + 它自己的日曆)→ 照舊關這一層
          onEscapeKeyDown={withOverlayEscape(onEscapeKeyDown, () => contentRef.current)}
        />
      </PopoverPrimitive.Portal>
    </PopoverTitleContext.Provider>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// PopoverHeader: SurfaceHeader + Close X(對齊 Dialog 的 canonical,見 docblock)
// justify-between 讓 children 與 Close 分左右。
interface PopoverHeaderProps extends React.HTMLAttributes<HTMLDivElement>, Pick<SurfaceHeaderProps, 'actions'> {
  /**
   * 隱藏右上 close X(預設 false,顯示)。
   * Coachmark / Tour 類 composition 用 Skip / Done 自管 close,不需 X。
   */
  hideClose?: boolean
  /**
   * × 的讀屏名稱(aria-label)。取值順序:本參數 > I18nProvider 的 `popover.close` > DS 預設「關閉」
   * (lib/i18n/README.md「Fallback chain」)。用在元件自己收讀屏字串的地方(例:Calendar 的 `labels` 換掉清單 / 詳情的關閉,
   * calendar.spec.md「字串可覆寫」)。規則與命名依據 → popover.spec.md「A11y 預設」的 × 讀屏名稱條。
   */
  closeAriaLabel?: string
}

// 關閉鈕的讀屏名稱:consumer 的 closeAriaLabel → I18nProvider 的 `popover.close` → DS 預設「關閉」(lib/i18n/README.md「Fallback chain」;user F1 預設中文、WM 要能傳英文)
function PopoverCloseButton({ ariaLabel }: { ariaLabel?: string }) {
  const { t } = useI18n()
  return (
    <PopoverPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label={ariaLabel ?? t('popover', 'close', '關閉')} />{/* i18n-allow: DS 預設 */}
    </PopoverPrimitive.Close>
  )
}

const PopoverHeader = React.forwardRef<HTMLDivElement, PopoverHeaderProps>(
  ({ className, children, hideClose = false, closeAriaLabel, actions, ...props }, ref) => (
    // Popover lightweight chrome canonical(2026-05-04 重思 v2;2026-06-16 slot 改衍生 + 收斂 SSOT):
    //   走 `COMPACT_HEADER_SLOT`(= calc(--font-body-size×1.5) = 14×1.5 = 21 = PopoverTitle text-body line-box,
    //   衍生非寫死,取代舊各自寫死的 1.25rem / 20 巧合值)→ slot = title 行高,title 字級改 slot 自動跟。
    //   Header 維持 padding-based:max(21 title, 21 slot) + py-tight(12*2) = 45 → 自然比 Dialog/Sheet 48 輕一級。
    //   Q10 穩定:title-only / title+close 都 = title + py 主導(slot=title)。無 min-h / 無 py override。
    <SurfaceHeader
      ref={ref}
      className={cn("justify-between", COMPACT_HEADER_SLOT, className)}
      {...props}
      // 右側〔actions〕〔分隔線〕〔×〕由 SurfaceHeader 的右側按鈕位排(overlay-surface.spec.md「SurfaceHeader」右側按鈕位);
      // Dismiss X = native sm,SurfaceHeader 負 my trick 讓 layout 佔位縮到 slot(21 = title line-box)
      actions={actions}
      dismiss={hideClose ? undefined : <PopoverCloseButton ariaLabel={closeAriaLabel} />}
    >
      {children}
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
//   - layout-space 鎖 md(ui-size 繼承 page,2026-06-15)
//   - dismiss X 走 COMPACT_HEADER_SLOT 佔位 21(= title text-body line-box;見 PopoverHeader docblock)
//   - **title `text-body`(14px)跟 Dialog / Sheet modal 的 body-lg(16px)形成重量級 vs 輕量級視覺區分**
// 世界級對照:Figma / Notion / Linear / Material 的 popover / filter panel / inline settings
// 的 header title 多半比 modal dialog title 小一級(16→14 或同比),視覺宣告「此浮層可忽略」
//
// Coachmark 同樣消費 PopoverTitle 作 header 小標籤(如 "新功能介紹" / "Tip 1 of 3"),
// CoachmarkBody 的主 title 另走 text-body-lg(見 coachmark.tsx CoachmarkBody 主 title <h3>)。
const PopoverTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, id, children, ...props }, ref) => {
  const titleCtx = React.useContext(PopoverTitleContext)
  // 掛載時向 PopoverContent 註冊 → content 自動設 aria-labelledby(見 PopoverTitleContext docblock)。
  // consumer 自傳 id 時不註冊:auto 接線指向 context titleId,自訂 id 下引用會斷 → aria 由 consumer 自管。
  const shouldRegister = id == null && titleCtx != null
  const onTitleMount = titleCtx?.onTitleMount
  const onTitleUnmount = titleCtx?.onTitleUnmount
  React.useLayoutEffect(() => {
    if (!shouldRegister) return
    onTitleMount?.()
    return onTitleUnmount
  }, [shouldRegister, onTitleMount, onTitleUnmount])
  return (
    <h2
      ref={ref}
      id={id ?? titleCtx?.titleId}
      className={cn("text-body font-medium truncate", className)}
      {...props}
    >
      {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容」)——
          同 DialogTitle 同型修;id/aria-labelledby 留在 h2 本體不受影響。 */}
      <TruncatedText display="block">{children}</TruncatedText>
    </h2>
  )
})
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
