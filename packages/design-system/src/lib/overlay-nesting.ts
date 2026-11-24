/**
 * @internal — 「從這一層開出來的另一層,算這一層的內部」的唯一判準(2026-11-24;規則住 `patterns/overlay-surface/overlay-surface.spec.md`
 * 「A11y 預設」的「Esc / 點外面關閉」條)。
 *
 * ── 為什麼需要它 ──────────────────────────────────────────────────────
 * Radix 判斷「按在這一層裡」是以**元件樹**認(`isPointerInsideReactTreeRef` / `isFocusInsideReactTreeRef`,
 * https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/dismissable-layer/src/dismissable-layer.tsx#L221-L296);
 * 本 DS 的欄位零件判準 `lib/composite-field-focus.ts` `useOwnTreeEvents` 也是。浮層裡的表單控件自己開的選單在元件樹上是那一層的子孫,
 * 天生成立。但「清單浮層點一項,在那一項旁邊開它的詳情浮層」(`components/Popover/popover.spec.md`「禁止事項」允許的第 (2) 種用法)
 * 常常是**產品**開的:詳情浮層畫在清單的元件樹外(例:Calendar 把被點的那一列交給 `onEventClick`,產品用它當錨點開自己的 Popover),
 * 照元件樹認,點詳情 = 點清單外面 → 清單被關;詳情一打開、焦點搬進去的那一下也一樣(focus outside)。
 * FullCalendar 與 React Big Calendar 正是這個坑(總帳研究 LB-V13、LB-V42)。
 *
 * ── 規則 ─────────────────────────────────────────────────────────────
 * 一個框外事件的目標落在另一層浮層裡,而那一層「**錨點在這一層裡、而且比這一層晚開**」—— 它是從這一層開出來的,算這一層的內部。
 * 往下一層一層追(詳情裡的日期欄位自己的日曆:錨點在詳情裡、詳情錨點在清單裡 → 也算清單的內部),鏈上每一層都要比這一層晚開。
 * **只多認這一種**:不得放寬成「按在任何一層浮層裡」—— 那會讓頁面上另一個不相干的浮層(比這一層早開、或錨點在別處)也被當成自己的
 * (2026-11-03 SelectMenu / InlineEdit 修前就是那個代理,閘 `scripts/overlay-nested-dismiss-invariant.mjs` 的對照組造的正是它)。
 * 兩個條件各有理由:「錨點在這一層裡」= 從這一層開的(位置關係);「比這一層晚開」= 打開它的時候這一層已經在(時間關係)——
 * 只看錨點,一個先開著、後來被產品改錨到這一層某一列上的浮層會被誤認成子層;只看先後,一個晚開但錨在頁面別處的浮層會被誤認。
 *
 * ── 怎麼用 ───────────────────────────────────────────────────────────
 * - 每一種會被點進去的 DS 浮層內容(PopoverContent、DropdownMenuContent / SubContent、HoverCardContent)掛 `useOverlayLayer(錨點)`
 *   的 ref:掛上時登記(第一次看到這個節點時給它開啟序號,同一個節點重掛 —— Radix 每次重繪都換一支合併後的 ref —— 序號不變)。
 * - 會因為「點外面 / 焦點移到外面」而關的那一層(PopoverContent)在 `onInteractOutside` 問 `isInChildLayer(自己, 目標)`,是 → 不算外面。
 * - 錨點 = 那一層真正定位的元素(`lib/overlay-density.tsx` `regionSourceNode`:Anchor → virtualRef 指到的元素 → Trigger;
 *   子選單 = 它的 SubTrigger)。沒有登記的浮層(產品直接用 Radix、或 DS 以外的套件)一律不算子層 —— 寧可多關,不可不關。
 *
 * 世界級:Radix 與 React Aria 的實作層都支援「點子層不關父層、Esc 只關最上層」—— 兩者都以元件樹認(總帳研究 NP-N36、NP-N25);
 * 本模組把同一個關係延伸到元件樹外、以「錨點 + 開啟順序」認的子層。Esc 一次一層不在這裡:Radix DismissableLayer 只讓最上層處理 Esc
 * (同上 dismissable-layer.tsx `isHighestLayer`),跨元件樹照樣成立。
 */

import * as React from 'react'

interface LayerRecord {
  node: Element
  anchor: () => Element | null
  order: number
}

/** 目前開著(掛著)的浮層 */
const layers = new Map<Element, LayerRecord>()
/** 節點第一次登記時給的開啟序號(同一個節點重掛不換號;節點卸載後 WeakMap 自動放掉) */
const openOrder = new WeakMap<Element, number>()
let sequence = 0

/** 登記一層;回傳解除登記的函式 */
export function registerOverlayLayer(node: Element, anchor: () => Element | null): () => void {
  let order = openOrder.get(node)
  if (order == null) {
    order = ++sequence
    openOrder.set(node, order)
  }
  const record: LayerRecord = { node, anchor, order }
  layers.set(node, record)
  return () => { if (layers.get(node) === record) layers.delete(node) }
}

/** 含有這個節點的已登記浮層中最內層那一個(浮層 DOM 互相包住時取最深的) */
function layerContaining(target: Node): LayerRecord | null {
  let found: LayerRecord | null = null
  for (const record of layers.values()) {
    if (!record.node.isConnected || !record.node.contains(target)) continue
    if (!found || found.node.contains(record.node)) found = record
  }
  return found
}

/**
 * 這個目標是不是落在「從 `self` 開出來的那一層」(或它再往下開出來的層)裡。見檔頭「規則」。
 * `self` 沒登記、目標不在任何已登記的浮層裡、目標就在 `self` 裡 → false(後者由 Radix 自己認,這裡不重複)。
 */
export function isInChildLayer(self: Element | null | undefined, target: EventTarget | null | undefined): boolean {
  if (!self || !(target instanceof Node)) return false
  const own = layers.get(self)
  if (!own) return false
  const seen = new Set<LayerRecord>()
  let layer = layerContaining(target)
  // 從目標所在那一層沿「錨點住在哪一層」往上追,追到 self = 是它開出來的;鏈上任一層比 self 早開、沒有錨點、或錨點不在任何浮層裡 = 不是
  while (layer && layer !== own && !seen.has(layer)) {
    seen.add(layer)
    if (layer.order <= own.order) return false
    const anchor = layer.anchor()
    if (!anchor) return false
    if (own.node.contains(anchor)) return true
    layer = layerContaining(anchor)
  }
  return false
}

/**
 * 掛在浮層內容根元素上的 callback ref:掛上時登記、卸載時解除;有 `forwardedRef` 就一併轉給它(呼叫端不必再合併一次)。
 * `anchor` 收到根元素、在**判斷的那一刻**才呼叫(錨點可能在開著時才定下來,例:產品改了 virtualRef 指向的那一列;子選單的錨點要從根元素找)。
 */
export function useOverlayLayer<T extends Element>(
  anchor: (node: T) => Element | null,
  forwardedRef?: React.Ref<T>,
): (node: T | null) => void {
  const latest = React.useRef(anchor)
  latest.current = anchor
  const release = React.useRef<(() => void) | null>(null)
  return React.useCallback((node: T | null) => {
    release.current?.()
    release.current = node ? registerOverlayLayer(node, () => latest.current(node)) : null
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<T | null>).current = node
  }, [forwardedRef])
}
