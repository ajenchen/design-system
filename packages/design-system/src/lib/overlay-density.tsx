/**
 * @internal — 小浮層的密度跟觸發點(全 DS 一支;規則住 tokens/density/density.spec.md「浮層跟觸發點」)。
 *
 * user 2026-11-11 決策頁「浮層密度」答「跟按鈕」:一般密度頁面裡的大密度區塊(或反過來),從那一區打開的小浮層
 * (下拉、選單、Popover、HoverCard、Tooltip、日期 / 時間選擇器等)用觸發它那一區的密度;對話框、側拉面板這種
 * 蓋住整頁的維持跟整頁(選項原文【AI 建議、user 選】)。
 *
 * 為什麼要程式:浮層經 Portal 掛到 body,CSS 繼承鏈從 html 起算,拿到的是整頁密度(M3)—— 實測一般密度頁面裡的
 * 大密度區塊,sm 下拉按鈕 32 高、打開的選項列 28(稽核 R7-02)。
 * 做法:Root 開一個登記處(OverlayAnchorScope),Trigger / Anchor 把自己的節點登記進來;Content 開啟時從那個節點
 * 往外讀兩軸各自的檔位(解析順序 = density.spec.md「同一個元素帶兩種屬性」),當屬性蓋到 Portal 內容的根元素上。
 * React context 本來就穿得過 Portal,所以 Content 讀得到 Root 的登記處。
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

interface OverlayAnchorRegistry {
  /** 觸發點(Trigger;Popover 也拿它做關閉時的焦點歸還) */
  trigger: React.MutableRefObject<HTMLElement | null>
  /** 定位錨點(Anchor;DatePicker 區間只用 Anchor、沒有 Trigger) */
  anchor: React.MutableRefObject<HTMLElement | null>
}

const OverlayAnchorContext = React.createContext<OverlayAnchorRegistry | null>(null)

/** 包在各浮層 Root 裡:開一個登記處給這一組的 Trigger / Anchor / Content。 */
export function OverlayAnchorScope({ children }: { children?: React.ReactNode }) {
  const trigger = React.useRef<HTMLElement | null>(null)
  const anchor = React.useRef<HTMLElement | null>(null)
  const value = React.useMemo(() => ({ trigger, anchor }), [])
  return <OverlayAnchorContext.Provider value={value}>{children}</OverlayAnchorContext.Provider>
}

/** 這一組的登記處(沒有包在 OverlayAnchorScope 裡時 null)。 */
export function useOverlayAnchorRegistry(): OverlayAnchorRegistry | null {
  return React.useContext(OverlayAnchorContext)
}

/** Trigger / Anchor 用:回傳一個 callback ref,把節點登記進來,同時轉給 consumer 的 ref。 */
export function useRegisterOverlayNode<T extends HTMLElement>(kind: "trigger" | "anchor", forwardedRef: React.ForwardedRef<T>) {
  const registry = React.useContext(OverlayAnchorContext)
  return React.useCallback((node: T | null) => {
    if (registry) registry[kind].current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [registry, kind, forwardedRef])
}

const sameAttrs = (a: OverlayDensityAttrs, b: OverlayDensityAttrs) =>
  a["data-ui-size"] === b["data-ui-size"] && a["data-layout-space"] === b["data-layout-space"]

/**
 * Content 用:回傳要蓋到浮層根元素上的屬性(觸發點那一區的兩軸檔位;優先讀 Anchor,沒有才讀 Trigger)。
 * 在 layout effect 裡讀(DOM 已掛上、畫面還沒畫):第一次畫出來就是對的檔位,不會先閃一下整頁密度。
 * 每次重繪都重讀(只是往外走幾層讀屬性),值沒變就不觸發重繪。
 * 要鎖某一軸的浮層(Popover 的版面間距鎖 md)在自己的根元素上把那一軸寫在這組屬性**之後**,覆蓋掉讀到的值。
 */
export function useTriggerRegionDensity(): OverlayDensityAttrs {
  const registry = React.useContext(OverlayAnchorContext)
  const [attrs, setAttrs] = React.useState<OverlayDensityAttrs>({})
  React.useLayoutEffect(() => {
    const node = registry?.anchor.current ?? registry?.trigger.current ?? null
    const next = readRegionDensity(node)
    setAttrs((prev) => (sameAttrs(prev, next) ? prev : next))
  })
  return attrs
}
