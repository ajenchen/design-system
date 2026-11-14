/**
 * @internal — 小浮層的密度跟觸發點(全 DS 一支;規則住 tokens/density/density.spec.md「浮層跟觸發點」)。
 *
 * user 2026-11-11 決策頁「浮層密度」答「跟按鈕」:一般密度頁面裡的大密度區塊(或反過來),從那一區打開的小浮層
 * (下拉、選單、Popover、HoverCard、Tooltip、日期 / 時間選擇器等)用觸發它那一區的密度;對話框、側拉面板這種
 * 蓋住整頁的維持跟整頁(選項原文【AI 建議、user 選】)。
 *
 * 為什麼要程式:浮層經 Portal 掛到 body,CSS 繼承鏈從 html 起算,拿到的是整頁密度(M3)—— 實測一般密度頁面裡的
 * 大密度區塊,sm 下拉按鈕 32 高、打開的選項列 28(稽核 R7-02)。
 * 做法:Root 開一個登記處(OverlayAnchorScope),Trigger / Anchor 把自己的節點登記進來;Content 的根元素**真的掛上去
 * 的那一刻**從那個節點往外讀兩軸各自的檔位(解析順序 = density.spec.md「同一個元素帶兩種屬性」),當屬性蓋到 Portal
 * 內容的根元素上;開著的期間祖先鏈上的密度屬性變了就重讀。React context 本來就穿得過 Portal,所以 Content 讀得到 Root 的登記處。
 *
 * **登記處一種浮層一個 context(2026-11-12 修)**:3d7f8ae6 讓四種浮層共用同一個 context,DatePicker 單日模式是
 * `<Popover><Tooltip><PopoverTrigger>…` —— PopoverTrigger 被 Tooltip 的登記處接走,Popover 的登記處拿到 null,
 * 關閉時焦點歸還找不到觸發點,Esc 收起後按 Tab 焦點掉到 body(escape-and-focus-contract N-esc-tab)。
 * 改成每一種浮層各自一個 context,與 Radix 自己的作法同一個身分:Radix 每一種 primitive 用自己的 context scope
 * (`createContextScope(POPOVER_NAME)`,@radix-ui/react-popover dist/index.mjs),PopoverTrigger 只認最近的 Popover、
 * 不會被包在中間的 Tooltip 接走 —— 登記處的歸屬跟 Radix 的歸屬一致,不再是「最近的任何一種浮層」這個代理(M37)。
 *
 * 對照:React Spectrum 的浮層在 Portal 裡再包一層 Provider(`<Provider ref={ref} UNSAFE_style={{background: 'transparent', isolation: 'isolate'}} …>`,
 * https://github.com/adobe/react-spectrum/blob/main/packages/@react-spectrum/overlays/src/Overlay.tsx#L59),
 * 那一層的 scale(medium / large = 密度)沒指定時沿用最近一層上層 Provider —— 也就是觸發點所在那一區
 * (`scale = prevContext ? prevContext.scale : autoScale`,
 * https://github.com/adobe/react-spectrum/blob/main/packages/@react-spectrum/provider/src/Provider.tsx#L57)。
 */

import * as React from "react"

export type DensityTier = "md" | "lg"

/** 蓋到浮層根元素上的屬性;某一軸往外找不到任何宣告時不寫(繼承 :root)。 */
export interface OverlayDensityAttrs {
  "data-ui-size"?: DensityTier
  "data-layout-space"?: DensityTier
}

type Axis = "data-ui-size" | "data-layout-space"

/** 會改變「某一區密度」的三個屬性(讀的時候看、開著的期間盯的也是這三個)。 */
export const DENSITY_ATTRIBUTES = ["data-density", "data-ui-size", "data-layout-space"] as const

const tierOf = (v: string | null): DensityTier | undefined => (v === "md" || v === "lg" ? v : undefined)

/** 從某個元素往外找某一軸的檔位:同一個元素上明寫的單軸屬性勝過 data-density(與 CSS 寫法同一條規則)。 */
export function resolveAxisTier(start: Element | null, axis: Axis): DensityTier | undefined {
  for (let el: Element | null = start; el; el = el.parentElement) {
    const own = tierOf(el.getAttribute(axis))
    if (own) return own
    const both = tierOf(el.getAttribute("data-density"))
    if (both) return both
  }
  return undefined
}

/** 某個節點所在那一區的兩軸檔位。 */
export function readRegionDensity(node: Element | null): OverlayDensityAttrs {
  if (!node) return {}
  const out: OverlayDensityAttrs = {}
  const ui = resolveAxisTier(node, "data-ui-size")
  const ls = resolveAxisTier(node, "data-layout-space")
  if (ui) out["data-ui-size"] = ui
  if (ls) out["data-layout-space"] = ls
  return out
}

/** 四種小浮層;各自一個登記處(見檔頭「一種浮層一個 context」)。 */
export type OverlayFamily = "popover" | "dropdown-menu" | "hover-card" | "tooltip"

/** Radix Anchor 的 `virtualRef`:current 可以是元素,也可以是只有 getBoundingClientRect 的量測物件(可帶 contextElement)。 */
type VirtualAnchorRef = React.RefObject<unknown>

interface OverlayAnchorRegistry {
  /** 觸發點(Trigger;Popover 也拿它做關閉時的焦點歸還) */
  trigger: React.MutableRefObject<HTMLElement | null>
  /** 定位錨點(Anchor;DatePicker 區間只用 Anchor、沒有 Trigger) */
  anchor: React.MutableRefObject<HTMLElement | null>
  /** `<PopoverAnchor virtualRef>`:Radix 不畫元素,登記的是 consumer 給的 ref 本身,讀的時候才取 current */
  virtualAnchor: React.MutableRefObject<VirtualAnchorRef | null>
}

const OverlayAnchorContexts: Record<OverlayFamily, React.Context<OverlayAnchorRegistry | null>> = {
  popover: React.createContext<OverlayAnchorRegistry | null>(null),
  "dropdown-menu": React.createContext<OverlayAnchorRegistry | null>(null),
  "hover-card": React.createContext<OverlayAnchorRegistry | null>(null),
  tooltip: React.createContext<OverlayAnchorRegistry | null>(null),
}

/** 包在各浮層 Root 裡:開一個登記處給這一組的 Trigger / Anchor / Content(只有同一種浮層的元件讀得到)。 */
export function OverlayAnchorScope({ family, children }: { family: OverlayFamily; children?: React.ReactNode }) {
  const trigger = React.useRef<HTMLElement | null>(null)
  const anchor = React.useRef<HTMLElement | null>(null)
  const virtualAnchor = React.useRef<VirtualAnchorRef | null>(null)
  const value = React.useMemo(() => ({ trigger, anchor, virtualAnchor }), [])
  const Context = OverlayAnchorContexts[family]
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** 這一組的登記處(沒有包在同一種浮層的 OverlayAnchorScope 裡時 null)。 */
export function useOverlayAnchorRegistry(family: OverlayFamily): OverlayAnchorRegistry | null {
  return React.useContext(OverlayAnchorContexts[family])
}

/** Trigger / Anchor 用:回傳一個 callback ref,把節點登記進來,同時轉給 consumer 的 ref。 */
export function useRegisterOverlayNode<T extends HTMLElement>(
  family: OverlayFamily,
  kind: "trigger" | "anchor",
  forwardedRef: React.ForwardedRef<T>,
) {
  const registry = React.useContext(OverlayAnchorContexts[family])
  return React.useCallback((node: T | null) => {
    if (registry) registry[kind].current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [registry, kind, forwardedRef])
}

/** `<PopoverAnchor virtualRef>` 用:Radix 走 virtualRef 時不畫元素,callback ref 永遠拿不到節點 → 改登記 ref 本身。 */
export function useRegisterVirtualAnchor(family: OverlayFamily, virtualRef: VirtualAnchorRef | undefined) {
  const registry = React.useContext(OverlayAnchorContexts[family])
  React.useLayoutEffect(() => {
    if (!registry || !virtualRef) return
    registry.virtualAnchor.current = virtualRef
    return () => {
      if (registry.virtualAnchor.current === virtualRef) registry.virtualAnchor.current = null
    }
  }, [registry, virtualRef])
}

/** virtualRef 的 current 是元素就用它;是量測物件就用它的 contextElement(Floating UI 虛擬元素的慣例);都沒有 = null。 */
function elementOfVirtual(v: unknown): Element | null {
  if (v instanceof Element) return v
  if (v && typeof v === "object" && "contextElement" in v) {
    const ctx = (v as { contextElement?: unknown }).contextElement
    if (ctx instanceof Element) return ctx
  }
  return null
}

/** 密度要從哪一個節點往外讀:錨點 → virtualRef 指到的元素 → 觸發點。 */
export function regionSourceNode(registry: OverlayAnchorRegistry | null): Element | null {
  if (!registry) return null
  return registry.anchor.current ?? elementOfVirtual(registry.virtualAnchor.current?.current) ?? registry.trigger.current
}

const sameAttrs = (a: OverlayDensityAttrs, b: OverlayDensityAttrs) =>
  a["data-ui-size"] === b["data-ui-size"] && a["data-layout-space"] === b["data-layout-space"]

/**
 * Content 用:回傳要蓋到浮層根元素上的屬性 + 要掛在**同一個根元素**上的 ref(會轉給 forwardedRef)。
 *
 * 什麼時候讀(2026-11-12 修,原本是每次重繪都跑、沒有依賴陣列的 layout effect):
 * - 浮層關著時一次都不讀 —— Radix 的 Content 關著不掛 DOM,ref 不會被呼叫。表格每一格的 TruncatedText 都包著 Tooltip,
 *   原本每一格每次重繪都往外爬完整條祖先鏈,頁面根節點帶 data-density 時每一格掛上去還多一次同步重繪。
 * - 根元素掛上去的那一刻讀(ref 在 commit 的 layout 階段被呼叫,這裡的 setState 跟 layout effect 一樣在畫面畫出來
 *   之前同步重繪 → 第一次畫出來就是對的檔位,不會先閃一下整頁密度)。開著的期間 Radix 的浮層內容每次重繪都重掛 ref
 *   (@radix-ui/react-popper 把轉進來的 ref 跟一個每次都是新的函式合在一起),所以每次重繪會再讀一次;值沒變不重繪。
 * - 開著的期間,文件裡任何元素的三個密度屬性變了就重讀(MutationObserver 只在開著時掛、關了就拆;值沒變不重繪)——
 *   區塊密度在浮層開著時被改,浮層跟著變,不會停在舊值。
 * 要鎖某一軸的浮層(Popover 的版面間距鎖 md)在自己的根元素上把那一軸寫在這組屬性**之後**,覆蓋掉讀到的值。
 */
export function useTriggerRegionDensity<T extends Element>(
  family: OverlayFamily,
  forwardedRef?: React.Ref<T>,
): { attrs: OverlayDensityAttrs; ref: (node: T | null) => void } {
  const registry = React.useContext(OverlayAnchorContexts[family])
  const [attrs, setAttrs] = React.useState<OverlayDensityAttrs>({})
  const [mounted, setMounted] = React.useState<T | null>(null)
  const read = React.useCallback(() => {
    const next = readRegionDensity(regionSourceNode(registry))
    setAttrs((prev) => (sameAttrs(prev, next) ? prev : next))
  }, [registry])
  const ref = React.useCallback((node: T | null) => {
    if (node) read()
    setMounted(node)
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<T | null>).current = node
  }, [read, forwardedRef])
  React.useEffect(() => {
    if (!mounted || typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: [...DENSITY_ATTRIBUTES] })
    return () => observer.disconnect()
  }, [mounted, read])
  return { attrs, ref }
}
