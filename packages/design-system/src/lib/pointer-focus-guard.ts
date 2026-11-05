/**
 * @internal
 * 「按著修飾鍵點下去,之後不畫焦點框」的唯一實作(2026-11-05,待辦 3f G-16)。
 *
 * **規則**(`ds-canonical/references/focus-canonical.md`「按鈕不屬於例外列」與「什麼時候畫(真焦點)」兩列):
 * 滑鼠點按鈕不畫焦點框,按著 Shift / ⌘ / Ctrl 點也一樣是滑鼠點;**單獨按下的修飾鍵不算鍵盤操作**。
 *
 * **為什麼瀏覽器自己不會這樣**:Chromium 只把帶 Ctrl / Alt / ⌘ 的按鍵排除在「鍵盤互動」之外,單獨的 Shift 照算 ——
 * `keyboard_event_manager.cc`「If this keydown did not involve a meta-key press, update the keyboard event state and trigger
 * :focus-visible matching」(`if (!event->ctrlKey() && !event->altKey() && !event->metaKey()) node->UpdateHadKeyboardEvent(*event)`,
 * https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/input/keyboard_event_manager.cc);滑鼠聚焦才把
 * 這個狀態清掉(`element.cc` `if (focus_type == kMouse) GetDocument().SetHadKeyboardEvent(false)`),**點已經聚焦的元素不會清**
 * (同函式前面 `IsFocused() == now_focused` 就 return)。所以:滑鼠點過排序區 → 再按 Shift → 排序區立刻出框;
 * Shift+點同一個排序區(升冪 → 降冪)框一直在。2026-11-05 實測 4e7a8572:A2 / B3 / C1 / R3 / S2 / S3 六種情境都出框。
 * React Aria 把單獨的修飾鍵排除在鍵盤模態之外(`@react-aria/interactions@3.25.0` `useFocusVisible.ts#L63-L66` `isValidKey`:
 * 「Control and Shift keys trigger when navigating back to the tab with keyboard.」
 * https://github.com/adobe/react-spectrum/blob/%40react-aria/interactions%403.25.0/packages/%40react-aria/interactions/src/useFocusVisible.ts#L63-L66)。
 * 規格把這件事交給瀏覽器的啟發式(Selectors 4「If the user interacts with the page via a pointing device … and the focused element
 * does not support keyboard input, don’t indicate focus.」https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo)。
 *
 * **做法 —— 只修正這一個差異,其餘照瀏覽器**(元件仍不自己判斷模態):
 *   - 聚焦的那一刻照瀏覽器:`:focus-visible` 不成立(滑鼠 / 跟在滑鼠後面的程式聚焦)→ 掛 `data-pointer-focus`;成立(鍵盤)→ 不掛;
 *   - 已經聚焦時被指標按下 → 掛(滑鼠點按鈕不畫框);
 *   - 之後真的按了鍵(不是單獨的修飾鍵、也不是 ⌘ / Ctrl / Alt 組合 —— 後者 Chromium 本來就不算)→ 拿掉,框照瀏覽器回來;
 *   - 失焦 → 拿掉。
 *   畫框的 CSS 一律寫成 `:focus-visible:not([data-pointer-focus])`(`styles/base.css` 全域外描邊;Tailwind 寫
 *   `focus-visible:not-data-pointer-focus:…`);依 `:focus-visible` 判斷「控件自己畫了框」的選擇器也要一起排除(同一個狀態,M10)。
 *
 * **誰掛**:DS 自己替它定義了「修飾鍵+點擊」行為的控件 —— 目前只有 DataTable 的排序區(Shift+點擊加進多重排序)、
 * 列勾選框與表格根節點(Shift+點擊選一段區間;點選取格的空白處焦點落在根節點)。全 DS `shiftKey` / `metaKey` / `ctrlKey` 的其他用處都在鍵盤處理裡(2026-11-05 grep)。
 * 新增「修飾鍵+點擊」的控件時一起掛,閘 `scripts/modifier-click-focus-invariant.mjs`。
 */

/** 「焦點是指標給的,之後沒有真的鍵盤操作」—— 掛著的時候不畫焦點框 */
export const POINTER_FOCUS_ATTR = 'data-pointer-focus'

interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

/**
 * 這一下 keydown 算不算「用鍵盤操作」:單獨的 Shift / Control / Meta / Alt 不算;帶 ⌘ / Ctrl / Alt 的組合也不算
 * (React Aria `isValidKey` 的範圍;Alt 組合在 Chromium 本來就不觸發 :focus-visible,兩個平台一起不算,畫面結果相同)。
 */
export function isKeyboardModalityKey(e: KeyLike): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Alt'
}

interface GuardEvent {
  currentTarget: Element
  target: EventTarget | null
}

/** 掛在「修飾鍵+點擊」控件上的四個事件(React 事件或原生事件都可以;只讀 currentTarget / target / key 與修飾鍵) */
export const pointerFocusGuard = {
  onPointerDown(e: GuardEvent): void {
    const el = e.currentTarget
    if (el.ownerDocument.activeElement === el) el.setAttribute(POINTER_FOCUS_ATTR, '')
  },
  onFocus(e: GuardEvent): void {
    if (e.target !== e.currentTarget) return
    const el = e.currentTarget
    if (el.matches(':focus-visible')) el.removeAttribute(POINTER_FOCUS_ATTR)
    else el.setAttribute(POINTER_FOCUS_ATTR, '')
  },
  onKeyDown(e: GuardEvent & KeyLike): void {
    if (e.target !== e.currentTarget) return
    if (isKeyboardModalityKey(e)) e.currentTarget.removeAttribute(POINTER_FOCUS_ATTR)
  },
  onBlur(e: GuardEvent): void {
    if (e.target !== e.currentTarget) return
    e.currentTarget.removeAttribute(POINTER_FOCUS_ATTR)
  },
}
