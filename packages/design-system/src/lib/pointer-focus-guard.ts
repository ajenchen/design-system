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
 *
 * **第二個使用者:唯讀欄位(2026-11-11,`installReadonlyPointerFocusGuard`,見檔尾)** —— 同一個屬性、同一個「真的按了鍵才拿掉」,
 * 只多補瀏覽器的第二個差異:唯讀的 `<input>` / `<textarea>` 滑鼠點下去瀏覽器照樣判 `:focus-visible`。
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

// ── 唯讀欄位:滑鼠點不畫焦點,鍵盤 Tab 進來才畫(2026-11-11)─────────────────────────────────────────────
//
// **規則**(`ds-canonical/references/focus-canonical.md` 規則二「唯讀的 Field 控件」列;`components/Field/field-controls.spec.md`「Focus 行為」):
// 唯讀欄位滑鼠點下去**不變**;鍵盤進來才出 1px 主色邊框。user 2026-11-11(逐字):「確認 polaris真的就是這樣的話那就照你建議」——
// 查證成立:Shopify Polaris 現行 `s-text-field` 唯讀滑鼠點 0 變化、Tab 才出藍環,它自己的 CSS 有唯讀專屬的
// `.input-wrapper.read-only:has(input:focus, textarea:focus) { box-shadow: none; }`,鍵盤另掛 `keyboard-focus` class
//(https://shopify.dev/docs/api/app-home/latest/web-components/forms/text-field 官方範例「Store URL」實機讀 shadow root 樣式)。
//
// **為什麼要 JS**:div 型唯讀宿主(Select / Combobox / DatePicker / TimePicker / NumberInput 觸發器、唯讀三兄弟)滑鼠點時瀏覽器自己就判
// `:focus-visible` 不成立,CSS 寫 `:focus-visible` 就夠;但唯讀的 `<input>` / `<textarea>` 兩大引擎都當成文字輸入,滑鼠點也判成立 ——
// Chromium `selector_checker.cc` `bool is_text_input = element.MayTriggerVirtualKeyboard();` … `return (always_show_focus || is_text_input ||
// !last_focus_from_mouse || had_keyboard_event);`,`text_field_input_type.cc` / `html_text_area_element.cc` 的 `MayTriggerVirtualKeyboard()`
// 不看 readonly 一律 `return true`(https://github.com/chromium/chromium/blob/52d57f535f10873ac9bc84ee0f31e73762973e27/third_party/blink/renderer/core/css/selector_checker.cc#L3893-L3901);
// Firefox `nsFocusManager.cpp` 對 textarea 與單行文字框一律 `return true`
//(https://github.com/mozilla-firefox/firefox/blob/eebfc2395a938361f2ecaf6107f3767c1df8d04e/dom/base/nsFocusManager.cpp#L1512-L1519)。
// 規格本來的建議是「指標互動、而且元素**不接受鍵盤輸入** → 不畫」(Selectors 4 §9.4,non-normative:「If the user interacts with the page via
// a pointing device (mouse, touchscreen, etc.) and the focused element does not support keyboard input, don’t indicate focus.」
// https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo)—— 唯讀框不接受打字,所以這裡做的是把唯讀文字框**照非文字元素算**,
// 也就是套 Chromium 上面那一行裡 `is_text_input` 以外的兩項:`!last_focus_from_mouse || had_keyboard_event`。WebKit 的 UA 樣式本來就把
// `input[readonly]` 排除在焦點框之外(html.css `:not(…, input[readonly], …):focus-visible`,
// https://github.com/WebKit/WebKit/blob/0114bf8a057d0197cfebc75246fe56f2d7ca209a/Source/WebCore/css/html.css#L1479;
// 起源 https://bugs.webkit.org/show_bug.cgi?id=8705「readonly text fields shouldn't get a focus ring」;原始碼證據,Safari 未實機量)。
//
// **要保證的性質**(M37):「這次焦點是指標造成的(而且之後沒有真的按鍵)」。拿來判斷的值:最近一次「會決定焦點要不要畫」的互動是指標按下
// 還是鍵盤 —— 與 Chromium 判非文字元素用的是同一件事(上一段那兩項),不是另找的代理;程式聚焦跟著上一個互動走,也與瀏覽器相同。
//
// **做法 —— 一份機制,全部唯讀欄位共用,元件端零接線**:
//   - document 層 capture 監聽(模組第一次被 `field-wrapper.tsx` 載入時安裝,一個 document 只裝一次):
//     pointerdown → 模態 = 指標;真的按了鍵(`isKeyboardModalityKey`,與上方修飾鍵規則同一支)→ 模態 = 鍵盤。
//   - 焦點落進唯讀欄位(`isInReadonlyField`:最近的 `[data-field-mode]` 控件宿主是 `readonly`)那一刻:模態是指標,或瀏覽器本來就判不畫 → 掛
//     `data-pointer-focus`;否則不掛。
//   - 已經聚焦的唯讀欄位被指標再按一下 → 掛(同 `pointerFocusGuard.onPointerDown`);之後真的按了鍵 → 拿掉;失焦 → 拿掉。
//   畫框的 CSS 一律帶 `:not([data-pointer-focus])`(`components/Field/field-wrapper.tsx` readonly compound)。
// 可編輯欄位不經這裡:它們最近的 `[data-field-mode]` 是 `edit`,行為與修前完全相同(閘 `scripts/readonly-focus-pointer-invariant.mjs` E 段)。

/** 控件宿主:帶 `data-field-mode` 的欄位外框 / 控件本身。Field 外層容器也帶這個屬性(`field.tsx`,同時帶 `data-field-orientation`),不算。 */
const FIELD_HOST_SELECTOR = '[data-field-mode]:not([data-field-orientation])'

/** 這個元素屬於唯讀欄位:最近的控件宿主是 `data-field-mode="readonly"`(含元素自己就是宿主) */
export function isInReadonlyField(el: Element): boolean {
  return el.closest(FIELD_HOST_SELECTOR)?.getAttribute('data-field-mode') === 'readonly'
}

/** 焦點落進唯讀欄位那一刻要不要掛 `data-pointer-focus`:模態是指標,或瀏覽器本來就判不畫 */
export function readonlyFocusIsPointer(pointerModality: boolean, browserFocusVisible: boolean): boolean {
  return pointerModality || !browserFocusVisible
}

const installedDocuments = new WeakSet<Document>()

/** 安裝唯讀欄位的指標聚焦判斷(一個 document 只裝一次;SSR 沒有 document 時不做事) */
export function installReadonlyPointerFocusGuard(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc || installedDocuments.has(doc)) return
  installedDocuments.add(doc)
  let pointerModality = false
  doc.addEventListener('pointerdown', (e) => {
    pointerModality = true
    const active = doc.activeElement
    const target = e.target
    if (!active || !(target instanceof Element) || !isInReadonlyField(active)) return
    // 只在按的是同一個欄位時補掛(按欄位外的東西若沒有搬走焦點,瀏覽器也不會改變它要不要畫)
    if (active.closest(FIELD_HOST_SELECTOR) === target.closest(FIELD_HOST_SELECTOR)) active.setAttribute(POINTER_FOCUS_ATTR, '')
  }, true)
  doc.addEventListener('keydown', (e) => {
    if (!isKeyboardModalityKey(e)) return
    pointerModality = false
    const active = doc.activeElement
    if (active && isInReadonlyField(active)) active.removeAttribute(POINTER_FOCUS_ATTR)
  }, true)
  doc.addEventListener('focusin', (e) => {
    const el = e.target
    if (!(el instanceof Element) || !isInReadonlyField(el)) return
    if (readonlyFocusIsPointer(pointerModality, el.matches(':focus-visible'))) el.setAttribute(POINTER_FOCUS_ATTR, '')
    else el.removeAttribute(POINTER_FOCUS_ATTR)
  }, true)
  doc.addEventListener('focusout', (e) => {
    const el = e.target
    if (el instanceof Element && isInReadonlyField(el)) el.removeAttribute(POINTER_FOCUS_ATTR)
  }, true)
}
