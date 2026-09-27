import * as React from "react"
import { isTextEntryElement } from "@/design-system/lib/roving-list-keyboard"

/**
 * **最後一次搬動「反白」的是誰**(SSOT:ds-canonical/references/focus-canonical.md 規則一「兩類元件」+ 規則二)。
 *
 * 2026-09-26 起本檔只剩這一個訊號。原本的第一個訊號 `useInputModality()`(最近一次輸入是鍵盤還是指標,WICG `:focus-visible`
 * 啟發式,給常駐清單的虛擬游標)唯一的消費者是 TreeView 的 `showRing`;2026-09-25 TreeView 改成列上的真焦點(待辦總帳 B9、
 * 批次細節 X8「樹改真焦點」),框改由瀏覽器的 `:focus-visible` 決定,那個訊號就沒有任何消費者了 —— 留著 = 一份沒人讀的第二套判準,
 * 下一個人會以為常駐清單還有兩種畫框依據。刪除依據:待辦總帳〇節「09-26 同意清單回覆」(同意的清單含「按鍵規則合併」與 X8),
 * user 逐字:「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」。
 * 常駐清單(TreeView / Sidebar / FileUpload 檔案清單)現在全部是真焦點 + `focus-visible:`,不需要這裡。
 *
 * `useCursorMover()` + `markPointerGrab()` —— 給會搶反白的浮層選單(cmdk / Radix Menu)。
 *    這類選單裡反白只有一個主人:滑鼠移過項目就把反白搶走(cmdk `onPointerMove → select()` /
 *    Radix `onPointerMove → item.focus()`),鍵盤方向鍵再搶回來;兩種畫法(滑鼠 → 底色、鍵盤 → 框)永遠不同時出現。
 *    所以這裡**滑鼠移過項目要算**(那就是搶),但**滑鼠停著不算**(只有移動才會觸發 pointermove)——
 *    這一點與瀏覽器的 `:focus-visible` 啟發式相反(那個只看按下,不看移動)。項目在 `onPointerMoveCapture` 呼叫 `markPointerGrab`,
 *    keydown 統一在 document 記成鍵盤 ——
 *    **但在文字輸入框裡打字不算搬游標**(2026-09-10 user:「滑鼠點擊輸入框然後輸入 a,再點 backspace,選單上會出現鍵盤焦點的藍色邊框」):
 *    字元 / Backspace / Delete / 空白 是在編輯文字,反白跳到第一個符合項是函式庫的自動落點(cmdk `search` 一變就
 *    `schedule(1, selectFirstItem)`),沒有人「搬」它;只有方向鍵 / Home / End / PageUp / PageDown / Tab / Esc 才算鍵盤搬游標。
 *    世界級同判:React Aria `useFocusVisible` 對文字輸入框只認 Tab / Escape 為會顯示焦點的鍵(`FOCUS_VISIBLE_INPUT_KEYS`);
 *    MUI Autocomplete 只在 `reason === 'keyboard'`(方向鍵)才加 `focusVisible`,打字後的 autoHighlight 不加;
 *    Ant rc-select 在 searchValue 一變就 `setActive(第一項)`、樣式是 `optionActiveBg` 底色、`outline: none`。
 *    所以打字後的自動落點用「開啟那一下」的來歷畫:滑鼠點進輸入框 → 底色;Tab 進來 → 框。
 *    2026-09-09 user:「滑鼠會搶反白的元件,搶完之後,那鍵盤是否可以再搶回?且搶回去之後原本滑鼠的 hover 樣式即會消失
 *    直到滑鼠又搶回來才會再出現,且滑鼠的搶應該是包括鍵盤焦點一起搶吧?」—— 三題都是「對」,一手來源見 focus-canonical Sources。
 *
 * 由來(2026-09-08 user 抓到):滑鼠點開 Select,已選項立刻出現鍵盤焦點框。
 * 根因是 cmdk 開啟時把游標放在已選項上,而「已選 + 游標」的畫框規則沒有模態條件。
 * 同款在 DropdownMenu / AgentPanel 歷史清單各一份,TreeView 自帶一份 `isKeyboardRef` ——
 * 四份各自實作 = 四份 SSOT(M17),收攏到這裡(TreeView 那一份之後已隨改真焦點退役,見上)。
 *
 * 監聽掛在 document 的 capture 階段,**模組載入即安裝**(有 `document` 才裝,SSR 安全)。
 * 第一版是「第一個消費者掛載時才安裝」——實測會漏:鍵盤開啟選單時,Tab / ArrowDown 都發生在
 * 選單項目掛載**之前**,沒被觀察到,項目掛上時模態還是初始值 pointer,已選項就沒框
 * (2026-09-08 閘的 C 路徑當場紅)。WICG polyfill 也是載入即裝。
 *
 * 另外訂閱當下若還沒觀察到任何輸入(模組載入晚於使用者互動時會這樣),
 * 用瀏覽器自己的 `document.activeElement.matches(':focus-visible')` 當種子 ——
 * 「它就是『這次聚焦該不該給可見指示』的權威答案」。
 */
export type InputModality = "keyboard" | "pointer"

let cursorMover: InputModality = "pointer"
let observedAnyInput = false
const moverListeners = new Set<() => void>()
/** 純修飾鍵不搬反白;其餘任何鍵(含 cmdk 的 ⌘↓ / Ctrl+N、Radix 的 typeahead)都可能搬,所以不沿用 WICG 的修飾鍵排除 */
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Alt", "Control", "CapsLock", "Fn", "OS"])
/** 在文字輸入框裡仍算「搬游標」的鍵;其餘(字元、Backspace、Delete、空白、Enter…)是在編輯文字,不改反白來歷。 */
const CURSOR_KEYS_IN_TEXT_ENTRY = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Tab", "Escape"])
// 「是不是文字輸入」的判準與清單鍵盤共用一份(lib/roving-list-keyboard.ts `isTextEntryElement`;2026-09-26 前本檔另有一份)
const isTextEntryTarget = (target: EventTarget | null) => target instanceof Element && isTextEntryElement(target)
// Chromium 在內容捲動後會補發一個**座標不變**的 pointermove(讓 :hover 重新計算),那不是使用者在搶;
// 只有座標真的變了才算滑鼠在動。
let lastPointerX = Number.NaN
let lastPointerY = Number.NaN
let lastPointerMoveWasReal = false

function setMover(next: InputModality) {
  if (cursorMover === next) return
  cursorMover = next
  moverListeners.forEach((l) => l())
}
function onKeyDown(e: KeyboardEvent) {
  observedAnyInput = true
  // 反白來歷:修飾鍵不算;在文字輸入框裡打字(非游標鍵)不算(見檔頭)
  const typing = isTextEntryTarget(e.target) && !CURSOR_KEYS_IN_TEXT_ENTRY.has(e.key)
  if (!MODIFIER_KEYS.has(e.key) && !typing) setMover("keyboard")
}
function onPointerDown() {
  observedAnyInput = true
  setMover("pointer")
}
function onPointerMove(e: PointerEvent) {
  // 每次滑鼠移動都會跑到這裡,所以不配置物件 —— 兩個數字分開存,省掉每一動一顆垃圾。
  lastPointerMoveWasReal = e.clientX !== lastPointerX || e.clientY !== lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
}

// **keydown / pointerdown 掛在模組頂層;只有 pointermove 惰性掛。**
//
// 2026-09-14:我一度把三個都改成「有人訂閱才掛」,理由是「呼叫 markPointerGrab 的元件都在同一棵樹裡
// 呼叫 useCursorMover,語意等價」。**那是錯的**,CI 當場抓到(test:virtual-cursor-modality 的
// Select / SelectMenu / PeoplePicker F 三條):模組層監聽的存在意義正是**在任何元件訂閱之前就已經在看** ——
// 使用者「點開選單」那一下的 pointerdown 發生在選單掛載之前,惰性掛就漏掉它,模態沒被記成指標,
// 接著在搜尋列打字就被判成鍵盤,冒出不該有的焦點框。
//
// 這兩個只在真的按鍵 / 真的按下指標時開火,一次互動一次,成本可以忽略 —— 放回頂層。
// 真正貴的是 pointermove(隨滑鼠持續開火),而它只餵 `lastPointerMoveWasReal` 給 markPointerGrab;
// 呼叫 markPointerGrab 的 command.tsx / dropdown-menu.tsx 都在同一棵樹裡呼叫 useCursorMover,
// 所以它惰性掛是安全的 —— 指標搶得到反白時必定早已有訂閱者。掛上後不再卸載。
if (typeof document !== "undefined") {
  document.addEventListener("keydown", onKeyDown, { capture: true })
  document.addEventListener("pointerdown", onPointerDown, { capture: true })
}
let _movingHooked = false
function ensureListening() {
  if (_movingHooked || typeof document === "undefined") return
  _movingHooked = true
  document.addEventListener("pointermove", onPointerMove, { capture: true })
}

function seedFromFocusVisible() {
  ensureListening()
  if (observedAnyInput || typeof document === "undefined") return
  const active = document.activeElement
  if (active && active !== document.body && active.matches(":focus-visible")) cursorMover = "keyboard"
}
function subscribeMover(cb: () => void) {
  seedFromFocusVisible()
  moverListeners.add(cb)
  return () => { moverListeners.delete(cb) }
}
const getMoverSnapshot = () => cursorMover
const getServerSnapshot = (): InputModality => "pointer"

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
