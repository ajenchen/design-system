export const ADDON_ID = 'ds-devmode'
export const PANEL_ID = `${ADDON_ID}/panel`
export const TOOL_ID = `${ADDON_ID}/tool`
export const PARAM_KEY = 'dsDevmode'

export const EVENTS = {
  TOGGLE: `${ADDON_ID}/toggle`,
  INSPECT: `${ADDON_ID}/inspect`,
  CLEAR: `${ADDON_ID}/clear`,
  /** Panel → preview:set forced pseudo-class state on pinned element */
  FORCE_STATE: `${ADDON_ID}/force-state`,
  /** R6 v3(2026-05-13):Panel → preview「點 token 名 highlight 所有用此 token 的 elements」 */
  HOTMAP_HIGHLIGHT: `${ADDON_ID}/hotmap-highlight`,
  /** R6 v3:Panel → preview「clear hot map highlight overlay」 */
  HOTMAP_CLEAR: `${ADDON_ID}/hotmap-clear`,
} as const

export type DevmodeMode = 'off' | 'live' | 'pin'

/** Pseudo-class force-state(對齊 Chrome / Firefox / Safari Inspector idiom) */
export type ForceState = 'none' | 'hover' | 'focus' | 'active'

export interface InspectPayload {
  tag: string
  className: string
  id: string
  rect: { x: number; y: number; width: number; height: number }
  parentRect: { x: number; y: number; width: number; height: number } | null
  distancesToParent: { top: number; right: number; bottom: number; left: number } | null
  padding: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
  border: { top: number; right: number; bottom: number; left: number }
  /** Position offsets — **Inspired by** Chrome `MetricsSidebarPane.ts` 的 5-layer model(2026-05-13 verify Chromium source 真是 flex 非 grid,本 addon 用 grid 但 5-layer 概念對齊)。`type` = static 時
   * 4 邊值無意義(panel 顯 N/A)。non-static(absolute/relative/fixed/sticky)才有意義。 */
  position: {
    type: string
    top: string
    right: string
    bottom: string
    left: string
  }
  computed: Record<string, string>
  tokenUsage: Array<{
    property: string
    /** Author 在 stylesheet 寫的 raw expression(可能含 calc / 多個 var)。Source-first 用此 for full formula display。 */
    raw: string
    /** 全部 var() token names(順序:外到內) */
    tokens: string[]
    /** Browser computed 最終值 */
    resolved: string
    /** 'author' = 從 source stylesheet/inline 抓的(可信);'speculative' = reverse-lookup 候選(同值多 token 推測,可能 misleading) */
    source: 'author' | 'speculative'
  }>
  /** Element ancestor chain(html → body → ... → element)。Click 任一 breadcrumb 可 pin parent。Chrome DevTools idiom。 */
  breadcrumb: Array<{
    tag: string
    id: string
    className: string
  }>
  /** **完整 author CSS**(2026-04-25 加)— Author 在 stylesheet / inline 寫的所有
   * declarations(不限 var-containing,不限 whitelist)。對齊 user 底線「完整
   * 顯示原本 css」+ Chrome DevTools Styles panel idiom。
   *
   * Property → { rawValue (author 原文)/ resolved (browser computed) / tokens
   * (var token names) / fromSelector (哪 rule)}。
   */
  authorCss: Array<{
    property: string
    rawValue: string
    resolved: string
    tokens: string[]
    fromSelector: string
  }>
  /** Sibling-to-sibling 距離(pin mode hover 另一元素時填)— 對齊 Panel canonical
   * invariant:canvas 小距離 hide label 時,user 仍能在 panel 讀數。null = 無 sibling
   * hover OR 兩元素 overlap / contain(不適用測距)。 */
  siblingDistance: { horizontal: number | null; vertical: number | null } | null
  /** Auto-layout context — element 是 flex / grid container 時填,讓 inspector 顯示 layout intent(對齊 Figma Inspect / Chrome layout panel idiom)。 */
  autoLayout: {
    display: 'flex' | 'grid' | null
    flexDirection?: string
    gap?: string
    rowGap?: string
    columnGap?: string
    justifyContent?: string
    alignItems?: string
    flexWrap?: string
    gridTemplateColumns?: string
    gridTemplateRows?: string
  } | null
}
