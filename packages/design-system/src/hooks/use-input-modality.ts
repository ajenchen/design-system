import * as React from "react"

/**
 * 兩個訊號,回答兩個不同的問題(SSOT:ds-canonical/references/focus-canonical.md 規則一「兩類元件」+ 規則二):
 *
 * 1. `useInputModality()` —— **最近一次使用者輸入是鍵盤還是指標**(給常駐清單的虛擬游標,如 TreeView)。
 *    真 DOM 焦點有瀏覽器的 `:focus-visible` 決定「這次聚焦要不要畫框」,虛擬游標(`aria-activedescendant`)沒有 ——
 *    框畫在被指到的那一項上,那一項並沒有真焦點,所以要自己判斷模態。
 *    判準逐字對齊 WICG focus-visible explainer「Example heuristic」:
 *    「if the most recent user interaction was via the keyboard; and the key press did not include
 *      a meta, alt/option, or control key; then the modality is keyboard. Otherwise, the modality is
 *      not keyboard.」(https://github.com/WICG/focus-visible/blob/main/explainer.md)
 *    Shift 不在排除清單內(Shift+Tab 是鍵盤導覽)。**滑鼠移動不算輸入**(polyfill 只監聽 mousedown / pointerdown /
 *    touchstart;mousemove 只在載入時用來判初始模態,第一次移動後就移除 listener —— src/focus-visible.js
 *    `onInitialPointerMove`),否則常駐清單的鍵盤框會被滑鼠一晃就抹掉,跟瀏覽器對真焦點的行為不一致。
 *
 * 2. `useCursorMover()` + `markPointerGrab()` —— **最後一次搬動「反白」的是誰**(給會搶反白的浮層選單:cmdk / Radix Menu)。
 *    這類選單裡反白只有一個主人:滑鼠移過項目就把反白搶走(cmdk `onPointerMove → select()` /
 *    Radix `onPointerMove → item.focus()`),鍵盤方向鍵再搶回來;兩種畫法(滑鼠 → 底色、鍵盤 → 框)永遠不同時出現。
 *    所以這裡**滑鼠移過項目要算**(那就是搶),但**滑鼠停著不算**(只有移動才會觸發 pointermove)——
 *    跟訊號一剛好相反,不能共用。項目在 `onPointerMoveCapture` 呼叫 `markPointerGrab`,keydown 統一在 document 記成鍵盤。
 *    2026-09-09 user:「滑鼠會搶反白的元件,搶完之後,那鍵盤是否可以再搶回?且搶回去之後原本滑鼠的 hover 樣式即會消失
 *    直到滑鼠又搶回來才會再出現,且滑鼠的搶應該是包括鍵盤焦點一起搶吧?」—— 三題都是「對」,一手來源見 focus-canonical Sources。
 *
 * 由來(2026-09-08 user 抓到):滑鼠點開 Select,已選項立刻出現鍵盤焦點框。
 * 根因是 cmdk 開啟時把游標放在已選項上,而「已選 + 游標」的畫框規則沒有模態條件。
 * 同款在 DropdownMenu / AgentPanel 歷史清單各一份,TreeView 自帶一份 `isKeyboardRef` ——
 * 四份各自實作 = 四份 SSOT(M17),收攏到這裡。
 *
 * 監聽掛在 document 的 capture 階段,**模組載入即安裝**(有 `document` 才裝,SSR 安全)。
 * 第一版是「第一個消費者掛載時才安裝」——實測會漏:鍵盤開啟選單時,Tab / ArrowDown 都發生在
 * 選單項目掛載**之前**,沒被觀察到,項目掛上時模態還是初始值 pointer,已選項就沒框
 * (2026-09-08 閘的 C 路徑當場紅)。WICG polyfill 也是載入即裝。
 *
 * 另外訂閱當下若還沒觀察到任何輸入(模組載入晚於使用者互動時會這樣),
 * 用瀏覽器自己的 `document.activeElement.matches(':focus-visible')` 當種子 ——
 * 那正是 TreeView 原本的判準:「它就是『這次聚焦該不該給可見指示』的權威答案」。
 */
export type InputModality = "keyboard" | "pointer"

let modality: InputModality = "pointer"
let cursorMover: InputModality = "pointer"
let observedAnyInput = false
const listeners = new Set<() => void>()
const moverListeners = new Set<() => void>()
/** 純修飾鍵不搬反白;其餘任何鍵(含 cmdk 的 ⌘↓ / Ctrl+N、Radix 的 typeahead)都可能搬,所以不沿用 WICG 的修飾鍵排除 */
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Alt", "Control", "CapsLock", "Fn", "OS"])
// Chromium 在內容捲動後會補發一個**座標不變**的 pointermove(讓 :hover 重新計算),那不是使用者在搶;
// 只有座標真的變了才算滑鼠在動。
let lastPointer = { x: Number.NaN, y: Number.NaN }
let lastPointerMoveWasReal = false

function set(next: InputModality) {
  if (modality === next) return
  modality = next
  listeners.forEach((l) => l())
}
function setMover(next: InputModality) {
  if (cursorMover === next) return
  cursorMover = next
  moverListeners.forEach((l) => l())
}
function onKeyDown(e: KeyboardEvent) {
  observedAnyInput = true
  if (!MODIFIER_KEYS.has(e.key)) setMover("keyboard")
  if (e.metaKey || e.altKey || e.ctrlKey) return
  set("keyboard")
}
function onPointerDown() {
  observedAnyInput = true
  set("pointer")
  setMover("pointer")
}
function onPointerMove(e: PointerEvent) {
  lastPointerMoveWasReal = e.clientX !== lastPointer.x || e.clientY !== lastPointer.y
  lastPointer = { x: e.clientX, y: e.clientY }
}
if (typeof document !== "undefined") {
  document.addEventListener("keydown", onKeyDown, { capture: true })
  document.addEventListener("pointerdown", onPointerDown, { capture: true })
  document.addEventListener("pointermove", onPointerMove, { capture: true })
}
function seedFromFocusVisible() {
  if (observedAnyInput || typeof document === "undefined") return
  const active = document.activeElement
  if (active && active !== document.body && active.matches(":focus-visible")) { modality = "keyboard"; cursorMover = "keyboard" }
}
function subscribe(cb: () => void) {
  seedFromFocusVisible()
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function subscribeMover(cb: () => void) {
  seedFromFocusVisible()
  moverListeners.add(cb)
  return () => { moverListeners.delete(cb) }
}
const getSnapshot = () => modality
const getMoverSnapshot = () => cursorMover
const getServerSnapshot = (): InputModality => "pointer"

/** 最近一次輸入是鍵盤還是指標(WICG :focus-visible 啟發式;給常駐清單的虛擬游標)。 */
export function useInputModality(): InputModality {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** 最後一次搬動反白的是鍵盤還是指標(給會搶反白的浮層選單:cmdk / Radix Menu 的項目)。 */
export function useCursorMover(): InputModality {
  return React.useSyncExternalStore(subscribeMover, getMoverSnapshot, getServerSnapshot)
}

/**
 * 會搶反白的項目在 `onPointerMoveCapture` 呼叫:滑鼠**移過**這一列 = 指標把反白搶走。
 * capture 階段是為了搶在 cmdk / Radix 自己的 `onPointerMove`(它們在這一下把反白搬過來)之前記下來歷,
 * 同一次 render 就能用對的畫法;cmdk 會覆寫 consumer 的 `onPointerMove`,capture 版不會被蓋掉。
 * 座標沒變的 pointermove(捲動後瀏覽器補發的)不算。
 */
export function markPointerGrab(_e?: { pointerType?: string }) {
  if (!lastPointerMoveWasReal) return
  observedAnyInput = true
  setMover("pointer")
}
