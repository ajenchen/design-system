import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import { OVERLAY_SIDE_OFFSET, OVERLAY_COLLISION_PADDING, OVERLAY_HIDE_WHEN_DETACHED } from "@/design-system/tokens/elevation/overlay-geometry"
import { MOTION_DELAY_PLAIN_MS } from "@/design-system/tokens/motion/motion"
import { overlayMotion } from "@/design-system/tokens/motion/overlay-motion"
import { OverlayAnchorScope, useRegisterOverlayNode, useTriggerRegionDensity } from "@/design-system/lib/overlay-density"

// 2026-05-18 ship per user 拍板 #3A:Tooltip Provider 預設 delayDuration 對齊 motion token SSOT。
// Radix 預設 700ms 偏保守(MUI 預設 100ms、Atlassian 300ms、Material Components Web 500ms),DS 統一用(來源:https://github.com/mui/material-ui/blob/34d78acfd16dfe3426c0b2c7d9f94b7fb930f5f8/packages/mui-material/src/Tooltip/Tooltip.js#L247 https://cdn.jsdelivr.net/npm/@atlaskit/tooltip@24.4.3/dist/es2019/tooltip.js https://github.com/material-components/material-components-web/blob/6ceadb81df508ac08ab007c52c4d3dc1d811cc15/packages/mdc-tooltip/constants.ts#L42-L43)
// `--motion-delay-plain` (500ms,JS mirror `MOTION_DELAY_PLAIN_MS`)。Consumer 仍可 per-instance override。
// 2026-05-21 D5 Phase B codex 抓 comment 200 vs token 500 drift → 註解 500ms 對齊 motion.css#--motion-delay-plain SSOT。
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
// ── 聚焦帶來的捲動不關提示(2026-11-05,MASTER-TODO 3f「AppShell 主標頭佈局窄視窗 Tab 到細列不開 Tooltip」)──
// Radix 在提示打開時對 window 掛捕獲階段的 scroll 監聽:任何「包含觸發點」的祖先一捲就關(radix-ui/primitives
// packages/react/tooltip/src/tooltip.tsx#L546-L552,本 repo 鎖的 1.2.8 dist/index.mjs:311-319)。用意是觸發點被捲走時提示不要懸空。
// 但鍵盤 Tab 到一個在捲動容器裡、此刻不在可視範圍的觸發點時,**瀏覽器自己會把容器捲到看得見它** —— 那一下 scroll 事件
// 在聚焦打開提示之後才派送(實測 AppShell 主標頭佈局 820 寬:focus 931ms → 提示打開 933 → 水平捲動容器 scroll 935 → 關 948),
// 於是 Tab 到的那顆永遠看不到提示,違反 tooltip.spec.md「A11y 預設」「Tab — focus trigger 時顯示」與 WCAG 2.2 SC 1.4.13
// 「Persistent:…remains visible until the hover or focus trigger is removed」(焦點還在觸發點上)。
// 做法:只放過「聚焦後緊接著那一段捲動」造成的關閉 —— 判準是**這次關閉發生在一個 scroll 事件的派送當中**(下方全域監聽在
// Radix 之前登記,把派送中的事件記下來,下一個 task 清掉)且焦點仍在本觸發點、離聚焦或上一次放過的捲動不到 FOCUS_SCROLL_IDLE_MS
// (平滑捲動一幀一個事件,一路延長)、總長不超過 FOCUS_SCROLL_MAX_MS。其他關閉(Esc、點擊、失焦、指標離開、別的提示打開、
// 之後使用者自己捲動)一律照 Radix。同一種「自己造成的捲動不算」的例外,React Aria 也有:useCloseOnScroll 對 input / textarea
// 的捲動不關(游標位置會讓它自己捲;adobe/react-spectrum packages/react-aria/src/overlays/useCloseOnScroll.ts#L52-L57)。
// 機械閘:scripts/sidebar-standalone-collapse-invariant.mjs R3k(主標頭佈局 820×700 真按 Tab 到細列列鈕)。
const FOCUS_SCROLL_IDLE_MS = 150
const FOCUS_SCROLL_MAX_MS = 1000

/** 目前正在派送的 scroll 事件(全域一份;在任何提示內容掛上 Radix 的監聽之前登記,所以同一次派送裡一定先跑)。 */
let scrollInDispatch: Event | null = null
let scrollTrackerInstalled = false
function installScrollTracker() {
  if (scrollTrackerInstalled || typeof window === 'undefined') return
  scrollTrackerInstalled = true
  window.addEventListener(
    'scroll',
    (event) => {
      scrollInDispatch = event
      // 監聽器之間會跑 microtask,所以用下一個 task 清(同一次派送的其他監聽器都看得到)
      window.setTimeout(() => {
        if (scrollInDispatch === event) scrollInDispatch = null
      }, 0)
    },
    { capture: true, passive: true },
  )
}

type FocusScrollGuard = { el: HTMLElement; focusAt: number; lastAt: number } | null
const FocusScrollGuardContext = React.createContext<React.MutableRefObject<FocusScrollGuard> | null>(null)

/** 這次關閉是不是「聚焦後緊接著的捲動」造成的(是 → 放過,並把放過的時間延長到現在)。 */
function shouldKeepOpenThroughFocusScroll(guardRef: React.MutableRefObject<FocusScrollGuard>): boolean {
  const guard = guardRef.current
  const scroll = scrollInDispatch
  if (!guard || !scroll || typeof document === 'undefined') return false
  if (document.activeElement !== guard.el) return false
  const target = scroll.target
  const contains = target === document || (target instanceof Node && target.contains(guard.el))
  if (!contains) return false
  const now = performance.now()
  if (now - guard.lastAt > FOCUS_SCROLL_IDLE_MS || now - guard.focusAt > FOCUS_SCROLL_MAX_MS) return false
  guard.lastAt = now
  return true
}

const Tooltip = ({
  delayDuration = MOTION_DELAY_PLAIN_MS,
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const open = openProp ?? internalOpen
  const guardRef = React.useRef<FocusScrollGuard>(null)
  React.useEffect(installScrollTracker, [])
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && shouldKeepOpenThroughFocusScroll(guardRef)) return
      if (openProp === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp],
  )

  return (
    <FocusScrollGuardContext.Provider value={guardRef}>
      {/* 觸發點登記處:Content 從觸發點那一區讀密度(lib/overlay-density.tsx;density.spec.md「浮層跟觸發點」) */}
      <OverlayAnchorScope family="tooltip">
        <TooltipPrimitive.Root
          delayDuration={delayDuration}
          open={open}
          onOpenChange={handleOpenChange}
          {...props}
        />
      </OverlayAnchorScope>
    </FocusScrollGuardContext.Provider>
  )
}

/** Radix Trigger + 記下「誰、何時被聚焦」(給上方的聚焦捲動判準用;其餘行為與 props 原樣交給 Radix)。 */
const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onFocus, onBlur, ...props }, ref) => {
  const guardRef = React.useContext(FocusScrollGuardContext)
  const composedRef = useRegisterOverlayNode("tooltip", "trigger", ref)
  return (
    <TooltipPrimitive.Trigger
      ref={composedRef}
      {...props}
      onFocus={(event) => {
        onFocus?.(event)
        installScrollTracker()
        if (guardRef) {
          const now = performance.now()
          guardRef.current = { el: event.currentTarget, focusAt: now, lastAt: now }
        }
      }}
      onBlur={(event) => {
        onBlur?.(event)
        if (guardRef) guardRef.current = null
      }}
    />
  )
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = OVERLAY_COLLISION_PADDING, hideWhenDetached = OVERLAY_HIDE_WHEN_DETACHED, style, children, ...props }, ref) => {
  // 空內容不掛浮層:children 為 null / undefined / false / 空字串時不渲染帶 padding 的空
  // role="tooltip" 殼(見 spec「邊界狀態」)。Tooltip 是資訊補救機制,無補充內容即不出現,
  // trigger 由 TooltipTrigger 原樣保留。
  // 觸發點那一區的兩軸檔位(lib/overlay-density.tsx)。hook 依 React 規則寫在提早 return 之前,但它關著時一次都不讀 DOM:
  // 只在內容根元素真的掛上去(= Tooltip 打開)那一刻讀一次,開著的期間才盯密度屬性。表格每一格的 TruncatedText 都包著
  // Tooltip,關著時的成本 = 兩個 useState + 兩個 useCallback + 一個 no-op effect(2026-11-12 修;原本每格每次重繪都爬祖先鏈)。
  const { attrs: regionDensity, ref: contentRef } = useTriggerRegionDensity("tooltip", ref)
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
      ref={contentRef}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      // 錨點失去版面(被 display:none 藏起來 / 卸載 / 回收)時不畫:否則 Radix 拿 0×0 量測值把它定位到視窗左上角
      // (0, sideOffset),關閉動畫還會讓它在那裡閃一下(2026-09-16 user 回報);詳 overlay-geometry.ts
      hideWhenDetached={hideWhenDetached}
      // Density:不鎖,跟觸發點那一區(2026-11-11 user「浮層密度:跟按鈕」,在那之前是跟整頁)。Tooltip padding 寫死 px-3 py-2、
      // 內容 text-body,目前不消費任何 density / layout-space token(原 data-density="md" 是 409b91da a11y 批次「對齊 Popover」順手加,
      // 2026-06-15 移除);仍照小浮層同一條規則蓋上觸發點的檔位,以後內容消費密度 token 時不必再補。
      {...regionDensity}
      className={cn(
        // **刻意不設 `pointer-events: none`**(2026-09-04 撤回同日的錯誤改動;同日這檔翻了三次「加 → 改 → 撤」,
        // 所以由機械閘守著:`scripts/agent-fab-hit-area-invariant.mjs` H6 量開著的 tooltip 本體與 Radix popper
        // 外殼的 computed pointer-events ≠ none、H7 真指標從觸發點移進內容後仍開著):
        // 讓 tooltip 穿透會直接命中 WCAG **F95**「Failure of SC 1.4.13 due to content shown on hover
        // not being hoverable」—— 使用者(尤其用螢幕放大鏡的)無法把指標移上去閱讀。
        // 世界級實證(2026-09-04 逐家查第一手 CSS,10 家;2026-09-05 逐行複核,精確到條件而不是二分「設／不設」):
        // - 只有 Polaris 對整個 overlay 無條件設穿透(TooltipOverlay.module.css:18
        //   https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Tooltip/components/TooltipOverlay/TooltipOverlay.module.css)。
        // - AG Grid v33.3.2 只對**非互動** tooltip 設,並留 `.ag-tooltip-interactive` 逃生口
        //   (`.ag-tooltip:where(:not(.ag-tooltip-interactive)) { pointer-events: none }`,tooltip.css:17-20
        //   https://raw.githubusercontent.com/ag-grid/ag-grid/v33.3.2/packages/ag-grid-community/src/tooltip/tooltip.css)。
        // - MUI 基底寫 `pointerEvents: 'none'`,但 `open && !disableInteractive` 變體覆寫成 `'auto'`(Tooltip.js:60、63-67
        //   https://raw.githubusercontent.com/mui/material-ui/master/packages/mui-material/src/Tooltip/Tooltip.js)——
        //   預設 interactive,生效值是 auto;只有開 `disableInteractive` 才穿透。v5 遷移文件更把
        //   「interactive by default」直接連到 WCAG 1.4.13。
        // - Fluent 只在 `hidden` 狀態設(useTooltipStyles.styles.ts:43-46
        //   https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-tooltip/library/src/components/Tooltip/useTooltipStyles.styles.ts),
        //   看得見時不穿透。
        // - Bootstrap / Ant / Radix / shadcn 完全不設(Bootstrap scss/_tooltip.scss@v5.3.8、Ant components/tooltip/style/index.ts、shadcn new-york-v4 tooltip.tsx 整檔都沒有 pointer-events)。(來源:https://github.com/twbs/bootstrap/blob/v5.3.8/scss/_tooltip.scss https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/tooltip/style/index.ts https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/tooltip.tsx)
        // 註:tooltip 與觸發點恆距 8px(`OVERLAY_SIDE_OFFSET`),兩者不重疊 ——
        // 「tooltip 擋住觸發點的點擊」本來就不會發生,穿透解決的不是這個問題。
        // `z-[70]`:蓋在 Toast(`z-[60]`)與所有 modal / 浮層(`z-50`)之上(其上只有頁面層的拖曳影像:拖曳元件放在 modal / 浮層裡時,拖曳影像被那一層封頂、在提示之下);
        // 層級表與理由的唯一住所 → tokens/elevation/elevation.spec.md「疊放順序」(user 2026-10-13 採納:所有提示都蓋在 Toast 上面)。
        // @layout-space-magic-ok: 內距 px-3 py-2(12 / 8)是已發布版同值(ec7466f5 同一串 class,F-S8),規格沒寫這兩個值(放行章 (d));本行在 PR 只多了 z-[70]
        "z-[70] overflow-hidden rounded-md px-3 py-2 text-body font-normal text-on-emphasis bg-tooltip max-w-[280px] break-words",
        overlayMotion,
        // 何時播 / 收尾 / 減少動態由 overlayMotion 負責(tokens/motion/overlay-motion.ts);這裡只寫幾何。
        // 進場幾何用「不是 closed」當打開判準:Radix Tooltip 打開時是 delayed-open / instant-open,從來不是 open
        // (2026-10-13 前寫 data-[state=open],進場動畫一次都沒播過;判準的住所 = overlay-motion.ts 檔頭)
        "not-data-[state=closed]:fade-in-0 not-data-[state=closed]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-tooltip-content-transform-origin)]",
        className
      )}
      style={{ boxShadow: 'var(--elevation-200)', ...style }}
      {...props}
    >
      {/* @theme-boundary-ok: 外層 Content 已宣告 text-on-emphasis,這層只讓子元件的 token 解析成深色,字色照外層 */}
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
