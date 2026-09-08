import * as React from "react"

/**
 * 最近一次使用者輸入是鍵盤還是指標。
 *
 * 給**虛擬游標**(`aria-activedescendant` / cmdk `data-selected` / Radix `data-highlighted`)用:
 * 真 DOM 焦點有瀏覽器的 `:focus-visible` 決定「這次聚焦要不要畫框」,虛擬游標沒有 ——
 * 框畫在被指到的那一項上,那一項並沒有真焦點,所以要自己判斷模態。
 *
 * 判準逐字對齊 WICG focus-visible explainer「Example heuristic」:
 * 「if the most recent user interaction was via the keyboard; and the key press did not include
 *   a meta, alt/option, or control key; then the modality is keyboard. Otherwise, the modality is
 *   not keyboard.」(https://github.com/WICG/focus-visible/blob/main/explainer.md)
 * Shift 不在排除清單內(Shift+Tab 是鍵盤導覽)。
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
let observedAnyInput = false
const listeners = new Set<() => void>()

function set(next: InputModality) {
  if (modality === next) return
  modality = next
  listeners.forEach((l) => l())
}
function onKeyDown(e: KeyboardEvent) {
  observedAnyInput = true
  if (e.metaKey || e.altKey || e.ctrlKey) return
  set("keyboard")
}
function onPointerDown() {
  observedAnyInput = true
  set("pointer")
}
if (typeof document !== "undefined") {
  document.addEventListener("keydown", onKeyDown, { capture: true })
  document.addEventListener("pointerdown", onPointerDown, { capture: true })
}
function subscribe(cb: () => void) {
  if (!observedAnyInput && typeof document !== "undefined") {
    const active = document.activeElement
    if (active && active !== document.body && active.matches(":focus-visible")) modality = "keyboard"
  }
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const getSnapshot = () => modality
const getServerSnapshot = (): InputModality => "pointer"

export function useInputModality(): InputModality {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
