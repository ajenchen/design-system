// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Slot } from "@radix-ui/react-slot"
import { RemoveScroll } from "react-remove-scroll"
import { X as XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/Button/button"
import { MODAL_AVAILABLE_HEIGHT, MODAL_VIEWPORT_INSET, capHeight } from "@/design-system/tokens/elevation/overlay-geometry" // 本行原是 ButtonDivider import 的佔位註解(分隔線 2026-11-10 移到 SurfaceHeader 右側按鈕位),2026-11-24 換成這個 import,行號不位移
import { SurfaceHeader, SurfaceFooter, type SurfaceHeaderProps } from "@/design-system/patterns/overlay-surface/overlay-surface"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { TruncatedText } from "@/design-system/patterns/element-anatomy/truncated-text"
import { surfaceMotion } from "@/design-system/tokens/motion/overlay-motion"
import { useOverlayCoexistence, CoexistenceMask, createPersistentGuard } from "@/design-system/lib/overlay-coexistence"
import { withOverlayEscape } from "@/design-system/lib/overlay-escape"
import { useExitStartFocusReturn, useTriggerlessFocusReturn, radixTriggerOf } from "@/design-system/lib/overlay-focus-return"
import { useI18n } from "@/design-system/lib/i18n/i18n-context"
import { DescriptionPresenceContext, useDescriptionPresence, useRegisterDescription } from "@/design-system/lib/overlay-description"

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
 * Modal 與所在區塊(視窗,或 portalContainer 舞台)四邊保持 layout-space-viewport-inset (48px) 最小間距(2026-09-11 從 layout-space-bottom 拆出,見 tokens/elevation/overlay-geometry.ts MODAL_VIEWPORT_INSET)。
 *
 * ── 寬度 ──
 * `width` = 檔位 sm 400 / md 480(預設)/ lg 640 / xl 960,或數字 px;都是最大寬,受上面的 inset 夾住、沒有下限。
 *
 * ── 高度行為 ──
 * 預設：height 填滿 viewport（扣除 inset），body 捲動。防止動態內容跳動。
 * height="hug"：高度隨內容，超過 viewport 時 max-height 安全帽(見 dialog.spec.md「高度軸」)。
 */

// 並存設定**一次到位**:在 Root 傳 `persistentElements`,Root 自動走 `modal={false}`,
// Content 由 context 拿到保留集合。不再要求消費者同時改兩個地方(Content 的 opt-in 與
// Root 的 modal 互相打架 —— 忘了 `modal={false}` 時 Radix 仍執行 hideOthers(content),
// 保留區不會變可用;跨模型審查 2026-09-08 R3 指出)。FileViewer 已是同款自動推導。
const DialogCoexistContext = React.createContext<(() => Element[]) | undefined>(undefined)
// Content 要知道自己是不是 modal(關閉後還焦點:modal 按遮罩收起也還、非 modal 點外面不搶;lib/overlay-focus-return.ts)。
// Radix 沒有把 modal 暴露給 Content,由 Root 經 context 交下去(並存 persistentElements 時為 false,同下方 Root 的推導)。
const DialogModalContext = React.createContext<boolean>(true)
type DialogRootProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** 並存區域(中性契約):這個對話框開著時仍然可用的節點。傳了就自動非模態。 */
  persistentElements?: () => Element[]
}
const Dialog = ({ persistentElements, modal, ...props }: DialogRootProps) => (
  <DialogCoexistContext.Provider value={persistentElements}>
    <DialogModalContext.Provider value={persistentElements ? false : (modal ?? true)}>
      <DialogPrimitive.Root modal={persistentElements ? false : modal} {...props} />
    </DialogModalContext.Provider>
  </DialogCoexistContext.Provider>
)
Dialog.displayName = 'Dialog'
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// Modal 與 viewport 四邊的最小間距(MODAL_VIEWPORT_INSET)與 modal 可用高(MODAL_AVAILABLE_HEIGHT)住 tokens/elevation/overlay-geometry.ts
// (2026-11-24 從本檔搬過去:浮層高度上限收成一份,與錨定浮層同一條 capHeight 公式)。為什麼不跟 `--layout-space-bottom` 共用(同值不同義)
// 寫在那邊的常數註解。寬度那條算法(下方 maxWidth)也讀同一個 MODAL_VIEWPORT_INSET。
// 寬度檔位(2026-11-15 A18;user 2026-11-11「對話框寬:訂檔位」,定義與用途 → dialog.spec.md「寬度檔位」)。值 = 寬螢幕時的寬,也是上限。
// 檔位表**只住這裡**與 spec 那張表(元件級常數,同 Toast 360、AgentPanel 400 / 640;不開全域 token)。DS 自己的元件、範例只寫檔名。
// 閘:scripts/dialog-width-invariant.mjs(1440 寬量到這四個值;--selftest 把表改壞必紅)。
const DIALOG_WIDTH_TIERS = { sm: 400, md: 480, lg: 640, xl: 960 } as const
type DialogWidthTier = keyof typeof DIALOG_WIDTH_TIERS
// 所在區塊(containing block)的寬 / 高:沒傳 portalContainer → 視窗;傳了 → 那個帶 transform 的舞台(fixed 以它為準)。
// 2026-11-15 前寫 100vw / 100svh,外框的 w-full 卻以所在區塊算 —— 放進比視窗窄或矮的並存舞台時四邊少於 48、超出的部分被舞台裁掉
// (dialog.spec.md「Viewport Inset」;閘 dialog-width-invariant W3 實量,--selftest 改回 100vw / 100svh 必紅)。
// 高另取 min(100svh, …):保留行動裝置網址列那道安全帽;沒傳 portalContainer 時兩者等值,畫面不變。
const DIALOG_BLOCK_WIDTH = '100%'
// 所在區塊的高(min(100svh, 100%))住 overlay-geometry.ts 的 MODAL_AVAILABLE_HEIGHT(2026-11-24 起;理由同上,也寫在那邊)。
// 並存捲動鎖的「沒有 shards」:同一個參照,預設路徑的 effect 設回它時 React 會 bail out,不多一次 render。
const NO_SCROLL_SHARDS: Array<{ current: Element }> = []

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
      "data-[state=closed]:fade-out-0 not-data-[state=closed]:fade-in-0",
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
  /**
   * 寬度 —— 檔位名或數字(px),兩種都是**最大寬**:實際寬 = min(此值, 所在區塊寬 − 2 × `--layout-space-viewport-inset`),
   * 視窗(或 `portalContainer` 舞台)窄了就往內縮、四邊至少 48,沒有下限。預設 `'md'`。
   *
   * - `'sm'` 400:只有一件事 —— 一兩句話(確認、刪除確認、告知、離開不儲存),或一個控制項(改名輸入框、一個選單)。
   * - `'md'` 480(預設):幾件事疊成一欄 —— 多欄位表單、說明加欄位、成員清單。不確定時用它。
   * - `'lg'` 640:有一件東西本身就寬 —— 表格、拖放上傳區、圖片預覽。只有文字時不用。
   * - `'xl'` 960:兩欄並排(主內容 + 資訊欄),或 lg 放不下的表格;這是建議上限。
   * - 數字(px):檔位不適用的產品特例,不設上限、不擋;比 xl 還大的內容先考慮改成頁面或側板。DS 自己的元件與範例只寫檔位名。
   *
   * 內容不得橫向捲動,放不下往上一檔。選檔規則與世界級出處:`dialog.spec.md`「寬度檔位」。
   */
  width?: DialogWidthTier | number
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
   * 軸名與值照 DS 既有的寬度軸(`field-types.ts` 的 `SizingMode = 'fill' | 'hug'`,2026-07-08 拍板;
   * 全 DS 規則 `ds-canonical/references/props-naming.md`「尺寸參數」),不另造詞彙。
   */
  height?: 'fill' | 'hug'
  /**
   * 最大高度 —— **只能選更矮的上限**。預設上限 = 所在區塊的可用高度(`min(100svh, 所在區塊高) - inset*2`;沒傳 `portalContainer` 時就是視窗);
   * 傳值時取 `min(可用高度, 此值)`,傳再大也不會超過所在區塊。傳 number 視為 px。
   *
   * 形狀照 `DropdownMenu` 的 `maxHeight`(同樣是 min(視窗剩餘, 自訂));型別照 DS 上下限的寫法
   * (`string | number`,props-naming.md「尺寸參數」)—— 高度更需要 string,才寫得出 `60svh` / `calc(100svh - 120px)`。
   */
  maxHeight?: string | number
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
>(({ className, width, height = 'fill', maxHeight, persistentElements: persistentElementsProp, portalContainer, children, style, onEscapeKeyDown, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const persistentElementsCtx = React.useContext(DialogCoexistContext)
  const persistentElements = persistentElementsProp ?? persistentElementsCtx
  const modal = React.useContext(DialogModalContext) && !persistentElementsProp
  // 關閉後焦點還給開啟者(2026-10-01 預設,待辦總帳 OE29):受控 `open`、沒有 DialogTrigger 開的對話框,Radix 沒有東西可還 → 焦點掉到 body。
  // 內容掛上時記下開啟者(住在選單裡的開啟者改記選單的觸發鈕),關閉時找不到 Radix 觸發點就由全 DS 一支 lib/overlay-focus-return.ts 還;
  // consumer 自己接了 onOpenAutoFocus / onCloseAutoFocus 的(AgentPanel 改名 / 刪除對話框)照舊先跑、擋了預設就不接。
  // FileViewer 不經 DialogContent(直接用 Radix Dialog),2026-10-20 起同樣消費這支 hook。
  const focusReturn = useTriggerlessFocusReturn(modal)
  // 沒有 DialogDescription(DS 允許只有標題)時不寫 aria-describedby —— Radix 預設指向一個不存在的 id(lib/overlay-description.ts;獨立驗證 OV-15)
  const descriptionPresence = useDescriptionPresence('aria-describedby' in props)
  // 用 **state** 而不是 ref 承接節點:並存的保留集合要「這個 Content + 常駐區域」,
  // 而 effect 跑的時候 ref 可能還沒填 —— 實測就是這樣,保留集合只剩常駐區,
  // **對話框自己被 inert 掉**(2026-09-08,對照組那一條當場紅)。
  // state 一變 effect 就重跑,節點掛上的那一刻保留集合才完整。
  const [contentEl, setContentEl] = React.useState<HTMLDivElement | null>(null)
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

  // 並存時的**捲動鎖**(2026-09-29,待辦總帳 OE13;user 原話「第二題照你建議」—— 建議由 AI 提出、user 採納:
  // 鎖舞台、常駐區照常可捲)。規格說並存 modal「對宿主其餘部分仍然是 modal」(dialog.spec.md「並存」),而 Radix 只在 modal 分支
  // 掛捲動鎖:react-dialog `DialogOverlayImpl` 逐字 `<RemoveScroll as={Slot} allowPinchZoom shards={[contentRef, …]}>`、
  // `DialogOverlay` 在 `context.modal` 為 false 時回 null(https://github.com/radix-ui/primitives/blob/main/packages/react/dialog/src/dialog.tsx)。
  // 並存走 `modal={false}` → 非模態分支沒有任何捲動處理,滾輪落在舞台就把宿主捲走(修前實測)。
  // 這裡用 Radix 同款機制、同一個套件(react-remove-scroll,Radix 的相依,現列為 DS 直接相依、與 lock 同版):
  //   · Content 自己是鎖的根(`as={Slot}` 把 onWheelCapture / onTouchMoveCapture 與 ref 合進 Content,不多一層 DOM);
  //   · 常駐節點是 shards ——「鎖外、但准捲」:滾輪落在常駐區,react-remove-scroll 只擋它捲到底之後的溢出,自己的捲動照常;
  //   · 其餘一切(舞台、遮罩)的 wheel / touchmove 被 preventDefault;上面再疊一個一般 modal 時,它的鎖成為 lockStack 最上層接手。
  // shards 在 effect 內取(與上方 keep 同一個理由:ref 那時才有值),react-remove-scroll 在事件當下才讀它們;
  // 沒傳 persistentElements 時 shards 恆為同一個空陣列、不掛 RemoveScroll,預設路徑一個位元不變(Radix 自己已鎖)。
  // `removeScrollBar` 保留預設 true,與一般 modal 同款:body 有捲軸時拿掉並以 padding 補寬防跳版;並排佈局 body 沒捲軸 → gap 0,
  // 開關對話框常駐區 0px 位移(閘量)。
  // **限制**:常駐區自己 portal 到 body 的非模態浮層不在 shards 裡,滾輪會被擋 —— 與已裝版本 Radix 在一般 modal 裡開 Popover 同款限制。
  // 閘:scripts/dialog-coexist-scroll-lock-invariant.mjs(舞台空白處合成滾輪 scrollTop 不變 / 常駐區清單會動 / 一般 modal 照舊鎖;--selftest 在頁面上拆掉鎖必紅)。
  const [scrollShards, setScrollShards] = React.useState<Array<{ current: Element }>>(NO_SCROLL_SHARDS)
  React.useEffect(() => {
    if (!persistentElements || !contentEl) { setScrollShards(NO_SCROLL_SHARDS); return }
    setScrollShards(persistentElements().map((current) => ({ current })))
  }, [persistentElements, contentEl])

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

  const insetCalc = `${MODAL_VIEWPORT_INSET} * 2`
  // 可用高 = MODAL_AVAILABLE_HEIGHT(tokens/elevation/overlay-geometry.ts;2026-11-24 從這裡搬過去,式子逐字不變):
  // 所在區塊高與 `100svh` 取小、再扣上下 inset。為什麼是 `svh` 不是 `vh`(行動裝置網址列收合時 `100vh` 大於實際可視高度,
  // 底部主要動作鈕會被切掉;DS 其他填滿視窗的外框 `app-shell.tsx` 的 `h-svh`、`sidebar.tsx` 的 `100svh` 同一個選擇)、
  // 為什麼要與所在區塊高取小(傳 portalContainer 時上限以舞台算,2026-11-15)寫在那邊。
  const availableH = MODAL_AVAILABLE_HEIGHT
  // 寬:width(檔位名或 px)> 預設 md。
  const tierPx = typeof width === 'string' ? DIALOG_WIDTH_TIERS[width] : undefined
  if (process.env.NODE_ENV !== 'production' && typeof width === 'string' && tierPx === undefined) {
    console.warn(`[DialogContent] 不認得的寬度檔位 \`${width}\`(只有 sm / md / lg / xl,或傳數字 px);這次以 md 為準。`)
  }
  const widthCss = typeof width === 'number' ? `${width}px` : `${tierPx ?? DIALOG_WIDTH_TIERS.md}px`
  // 上限只有一條公式,兩種模式共吃 —— 這就是「高度都不會超過最大高度」(全 DS 同一支 capHeight,與錨定浮層共用)。
  // consumer 傳的值只能讓它更矮(`min`),傳再大也不會超過視窗;數字 = px,字串照原樣。
  // capHeight 在沒傳(undefined / null / 空字串)時回可用高本身,同 2026-11-24 前本檔自己寫的判斷。
  const heightCap = capHeight(availableH, maxHeight)

  // fill 同時寫 height 與 maxHeight 不是冗餘:(a) 讓「兩種模式回報同一個上限」可被機械驗證;
  // (b) 擋住下方 `...style` 的逃生口 —— consumer 蓋掉 `height` 時 `maxHeight` 仍然生效。
  const heightStyle: React.CSSProperties = height === 'hug'
    ? { maxHeight: heightCap }
    : { height: heightCap, maxHeight: heightCap }

  // AutoFocus canonical(對齊 Material / Polaris / Atlassian)—
  // 開啟時 focus 落在 body 第一個有意義互動元素(input / button),不是 chrome close X。
  // 預設 Radix 會 focus first tabbable = close X → Button iconOnly 的 focus-triggered
  // tooltip 會立即顯示「關閉」,user-hostile。此 callback 攔截:先找 body 第一個
  // input/textarea/select/button(排除 data-dismiss)focus;找不到就 focus container(不 focus X)。
  // 2026-10-01:consumer 的 onOpenAutoFocus 不再被 `{...props}` 整支蓋掉 —— 先記開啟者、再跑 consumer 的、consumer 沒擋預設才走 DS 預設落點。
  // 選擇器排除 `aria-disabled="true"`:忙碌 / 握著焦點時被停用的 Button 不轉原生 disabled(button.tsx 可聚焦的停用),不該成為開啟時的落點。
  const handleOpenAutoFocus = (e: Event) => {
    focusReturn.onOpenAutoFocus(e)
    onOpenAutoFocus?.(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    const content = e.currentTarget as HTMLElement
    const firstBodyTarget = content.querySelector<HTMLElement>(
      '[data-dialog-body] input:not([disabled]),[data-dialog-body] textarea:not([disabled]),[data-dialog-body] select:not([disabled]),[data-dialog-body] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
    )
    const firstFooterButton = content.querySelector<HTMLElement>(
      '[data-dialog-footer] button:not([disabled]):not([aria-disabled="true"]):not([data-dismiss])'
    )
    ;(firstBodyTarget ?? firstFooterButton ?? content).focus({ preventScroll: true })
  }
  // consumer 的先跑、擋了預設就不接(AgentPanel 改名 / 刪除對話框自己的接線勝出);沒擋 → DS 預設還給開啟者
  const handleCloseAutoFocus = (e: Event) => {
    onCloseAutoFocus?.(e)
    focusReturn.onCloseAutoFocus(e)
  }
  // 還焦點的時機 = 關閉的那一刻,不等 250ms 收起動畫(keyboard-model-canonical.md「關了之後焦點去哪」;待辦總帳 R1b-FN1b):
  // 修前 Esc 之後在收起期間按 Tab,Tab 在淡出的對話框裡走掉、動畫一播完又被 Radix 拉回觸發點(Tab 被吃掉)。同一支 lib 也撤掉
  // 這次開啟加上的 aria-hidden(觸發點不再落在讀屏看不到的區域)、淡出中的內容 inert(lib/overlay-focus-return.ts useExitStartFocusReturn)。
  // 只接 Radix modal:並存(persistentElements,非 modal)的宿主 inert 綁在內容卸載(lib/overlay-coexistence.ts),提早還會還進 inert 的區域 → 照舊卸載時還。
  // radixDefault = Radix modal 的預設(@radix-ui/react-dialog 1.1.15 dist/index.mjs DialogContentModal:`context.triggerRef.current?.focus()`)。
  const exitFocus = useExitStartFocusReturn({
    onCloseAutoFocus: handleCloseAutoFocus,
    onOpenAutoFocus: handleOpenAutoFocus,
    radixDefault: (e) => { radixTriggerOf(e.currentTarget instanceof Element ? e.currentTarget : null)?.focus() },
    modal: true,
  })
  // 先取出 ref 再用(同 PopoverContent 的 attachExitFocus):直接呼叫 `exitFocus.ref(node)` 是物件方法呼叫,
  // react-hooks/exhaustive-deps 要整個 exitFocus 進相依(check:react-hooks 紅);取出來的函式就是同一個參照,行為不變
  const attachExitFocus = exitFocus.ref
  const composedRef = React.useCallback((node: HTMLDivElement | null) => {
    setContentEl(node)
    if (modal) attachExitFocus(node)
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref, modal, attachExitFocus])

  const content = (
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
      onCloseAutoFocus={exitFocus.onCloseAutoFocus}
      {...guardOutside}
      className={cn(
        // 並存面(有 persistentElements)降到 z-40:AI agent 浮層時常駐區(AgentPanel 浮層 z-[45])要蓋在
        // **它**上面;沒有 URL 的一般確認框維持 z-50,必須蓋在常駐區上面(v14 條 A)。
        persistentElements ? "fixed left-1/2 top-1/2 z-40 w-full -translate-x-1/2 -translate-y-1/2"
                           : "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2",
        // `overflow-hidden min-h-0` 是 overlay-surface primitive 明文要求的父層契約
        // (`overlay-surface.tsx:173-175` 逐字:「parent(PopoverContent / HoverCardContent /
        // Dialog / Sheet)是 flex flex-col + max-h + overflow-hidden」)。Popover/HoverCard 一直有,
        // Dialog 與 Sheet 漏了 → 視窗變矮時內容直接畫到圓角容器外面(2026-09-12 user 截圖)。
        // 少了 min-h-0,dialog 自己在 flex 容器裡也收縮不到 max-height 以下。
        "flex flex-col overflow-hidden min-h-0 bg-surface-raised rounded-lg border border-border",
        // 進出場 = 從中心淡入 + 輕微縮放,**不位移**(dialog.spec.md「動畫」段;何時播 / 時長 / 曲線 / 收尾 / reduced-motion 由
        // surfaceMotion 消費 --motion-duration-surface / --motion-easing-enter / --motion-easing-exit,這裡只寫幾何)。
        // 2026-09-09 user 抓到 dialog 從左上角飛到中間:shadcn v3 時代的 `slide-in-from-left-1/2 slide-in-from-top-[48%]`
        // 是為了在 keyframe 的 `transform` 裡重寫置中位移(v3 的 -translate-x-1/2 也走 transform,會被 keyframe 蓋掉);
        // Tailwind v4 的 -translate-x-1/2 改寫進獨立的 `translate` 屬性,不再被 keyframe 蓋掉,兩者相加 = 第一幀
        // 中心落在視窗中心左 w/2、上 0.48h 處(實測 -240px / -90.72px)。shadcn v4 版本已把這兩組 class 拿掉。
        // 閘:scripts/dialog-coexistence-invariant.mjs「進場第一幀」(靜態禁同用 + 第一幀幾何 + 對照組)。
        surfaceMotion,
        "data-[state=closed]:fade-out-0 not-data-[state=closed]:fade-in-0",
        "data-[state=closed]:zoom-out-95 not-data-[state=closed]:zoom-in-95",
        className,
      )}
      style={{
        boxShadow: 'var(--elevation-200)',
        // 兩種寫法都是最大寬,只受所在區塊四邊的 inset 夾住、沒有下限(dialog.spec.md「寬度檔位」)
        maxWidth: `min(${widthCss}, calc(${DIALOG_BLOCK_WIDTH} - ${insetCalc}))`,
        ...heightStyle,
        ...style,
      }}
      {...descriptionPresence.descriptionPresenceProps}
      {...props}
      // 這一下 Esc 由誰處理(全 DS 一支,判準與出處住 lib/overlay-escape.ts withOverlayEscape):輸入法組字中不關;焦點所在控件宣告了自己還有一層
      //(改過的欄位 / 就地編輯中 / 格游標 / 拖曳中)且在這一層裡面 → 留給控件、不關;其餘照舊關閉
      onEscapeKeyDown={withOverlayEscape(onEscapeKeyDown, () => contentEl)}
    >
      <DescriptionPresenceContext.Provider value={descriptionPresence.register}>{children}</DescriptionPresenceContext.Provider>
    </DialogPrimitive.Content>
  )

  return (
    <DialogPortal container={portalContainer ?? undefined}>
      {/* 並存(modal={false})時 Radix 不畫 Overlay;user 2026-09-08 問為何 modal 沒有遮罩 —— 它仍是 modal,
          宿主要被遮,只有保留節點挖洞。一般 modal 走 Radix 自己的 Overlay(z-50)。 */}
      {/* 洞只挖給常駐節點;Content 本來就在遮罩上層(z-40 > z-30),挖給它反而會留下開場動畫縮放中量到的錯位白框 */}
      {persistentElements ? <CoexistenceMask keep={persistentElements} /> : <DialogOverlay />}
      {/* 並存:Content 當捲動鎖的根、常駐節點當 shards(理由與限制見上方 scrollShards 註解);預設路徑直接渲染 Content,不多任何一層 */}
      {persistentElements ? (
        <RemoveScroll as={Slot} allowPinchZoom shards={scrollShards}>
          {content}
        </RemoveScroll>
      ) : content}
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

// DialogHeader: SurfaceHeader + Close 按鈕(Dialog 特有)
// Close 靠右由「第一 child flex-1 grow」達成(justify-between 已移除,見 return 註解);Close 用 Radix DialogPrimitive.Close 包裝。
// 2026-05-18 audit gap fix:type 用 SurfaceHeaderProps 對齊 — DialogHeader 是 SurfaceHeader
// 薄包裝,tabsSlot 透過 spread forward,型別也從 SurfaceHeaderProps 繼承,consumer 可以 type-safe 寫
// `<DialogHeader tabsSlot={<TabsList>…</TabsList>}>`(per header-canonical.spec.md W1 跨 6 consumer 同契約)。
export interface DialogHeaderProps extends Omit<SurfaceHeaderProps, 'dismiss'> {
  /**
   * Header 級操作 cluster(2026-07-08 WM 戰役 codify — 關閉鈕分隔線 SSOT 化)。
   *
   * 提供時 render 在 Close X 左側,分隔線由 SurfaceHeader 的右側按鈕位自動放(規則與幾何住 overlay-surface.spec.md「SurfaceHeader」右側按鈕位)。
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
  // Dismiss X(chrome-slot canonical,v5):Button 本身 native sm(28 md / 32 lg,命中區亦同 —— 命中 ≡ 可視,
  // 見 ds-canonical/references/hit-area-canonical.md;2026-09-24 把原文的「touch target」正名為命中區,
  // 本 DS 以滑鼠精度為前提,尺寸不以觸控門檻推導),
  // 但 `dismiss` prop 自動標 `data-unbounded`,SurfaceHeader CSS rule 對其套負 my 讓
  // layout 佔位 = 24(`data-dismiss` 僅作 openAutoFocus 排除 marker,與縮位無關),
  // header = 24 + 2×tight = 48 / 56 chrome-header-height ✓。
  // 詳 patterns/overlay-surface/overlay-chrome-sizing.spec.md「Chrome dismiss size canonical」(2026-09-27 自 overlay-surface.spec.md 拆出)
  // 關閉鈕的讀屏名稱:I18nProvider 的 `dialog.close` → DS 預設「關閉」(lib/i18n/README.md「Fallback chain」;user F1 預設中文、WM 要能傳英文)
  const { t } = useI18n()
  const closeButton = (
    <DialogPrimitive.Close asChild>
      <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label={t('dialog', 'close', '關閉')} />{/* i18n-allow: DS 預設 */}
    </DialogPrimitive.Close>
  )
  return (
    // 2026-05-18:className 不再硬加 justify-between(冗餘:row 1 是 flex items-center gap-2,
    // 第一 child flex-1 grow 自然 push close X 靠右,跟 justify-between 同視覺)。
    // 並且 column mode(tabsSlot 提供)justify-between 會把 row 1 / row 2 上下推開 = 破裂。
    // tabsSlot via `...props` spread 自動 forward(type 來自 SurfaceHeaderProps)。
    // 右側〔actions〕〔分隔線〕〔×〕由 SurfaceHeader 的右側按鈕位排(2026-11-10 自本處搬下去共用,overlay-surface.spec.md「SurfaceHeader」右側按鈕位)。
    <SurfaceHeader
      ref={ref}
      className={className}
      {...props}
      actions={actions}
      dismiss={closeButton}
    >
      {children}
    </SurfaceHeader>
  )
})
DialogHeader.displayName = "DialogHeader"

// DialogBody: flex-1 ScrollArea + chrome padding(對齊 overlay-surface SSOT + ScrollArea canonical)
// 捲軸必用 ScrollArea(跨 OS 一致、不吃寬度)— 不自寫 overflow-y-auto。
// padding 搬進 viewport inner div:左右 px-loose(規則 1 / 6);上下由容器自己給 —— inner div 宣告 data-layout-body="fill"
// (對話框擋住頁面 = layoutSpace.spec.md 規則 4 第 1 列),上 = tight、底依最後一個東西的邊緣:element → bottom 48、
// 有框的表格 / 卡片(data-layout-region="bounded")→ loose、自帶上下內距的清單(unbounded)→ 0。實作住 tokens/layoutSpace/layoutSpace.css,
// 本檔不寫底距的值(2026-11-17 A102:修前寫死 pb-bottom,A18 的「對話框裡放表格」因此底部 48、照規則應 16 / 24)。
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
    <div data-layout-body="fill" className={cn("px-[var(--layout-space-loose)]", className)}>
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
    {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容」)——
        title 單行 truncate 被裁掉後沒有 hover 補救路徑。display="block":h2 是 block container,
        inline span 量測不到 clientWidth(對照 breadcrumb.tsx 同型消費)。 */}
    <TruncatedText display="block">{children}</TruncatedText>
  </DialogPrimitive.Title>
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  // 向 DialogContent 登記「有說明」:沒有任何說明時 DialogContent 不寫 aria-describedby(lib/overlay-description.ts)
  useRegisterDescription()
  return (
    <DialogPrimitive.Description
      ref={ref}
      // title → description 間距 canonical:DialogTitle 是 body-lg(16)+ desc body(14)→ reading-lg token
      // (label tier 決定 token 選擇;item-anatomy Family 2 reading-family token 對照表)
      className={cn("mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary", className)}
      {...props}
    />
  )
})
DialogDescription.displayName = DialogPrimitive.Description.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dialogMeta = {
  component: 'Dialog',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  // 寬度檔位(2026-11-15 A18):key 對齊 dialog.spec.md frontmatter `sizes`(scripts/compile-stories.mjs 比對 key);
  // 數值只住上方 DIALOG_WIDTH_TIERS 與 spec 檔位表,這裡不再寫一份(寬度檔沒有控件的高度 / 圖示 / 字級三欄)。
  sizes: {
    sm: {},
    md: {},
    lg: {},
    xl: {},
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
