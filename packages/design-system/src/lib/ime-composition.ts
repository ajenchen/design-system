/**
 * 「這一下 keydown 是輸入法(IME)組字的一部分」的唯一判準(2026-09-30)。
 *
 * 中文 / 日文輸入法選字時按的 Enter / 空白 / 方向鍵 / Esc 是在操作候選字,不是對元件下的指令(提交、開選單、選選項、送出訊息)。
 * `isComposing` 為主;`keyCode === 229` 補「最後一顆」:`compositionend` 可能先於那一下 keydown 發生(注音在 Safari 按 Enter 選字),
 * 那一顆的 `isComposing` 已是 false,只剩 keyCode 229 看得出來 —— MDN「keydown events with IME」逐字:
 * 「compositionend may fire before keydown when typing the last character that closes the IME. In these cases, isComposing is false
 *  even when the event is part of composition. However, KeyboardEvent.keyCode is still 229 in these cases」
 * (https://github.com/mdn/content/blob/main/files/en-us/web/api/element/keydown_event/index.md#keydown-events-with-ime)。
 * cmdk 自己的搜尋框同一條(https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L582-L590)。
 *
 * 2026-09-30 之前這條判斷在 DS 裡手寫了七份,其中三份只看 `isComposing`(Command 列上按鈕的鍵盤路、Sidebar 的 ⌘B、
 * AgentPanel 輸入框的 Enter 送出 —— 後者在 Safari 用注音按 Enter 選字會直接把訊息送出去);欄位內搜尋框轉送給清單的 ↑ ↓ Enter
 * (SelectMenu/select-menu-keyboard.ts `forwardKeyToListbox`)則完全沒有判斷,而且代發出去的那一顆是全新事件、
 * `isComposing` / `keyCode` 都被洗掉,cmdk 也看不出來。收成這一支。
 * 同日第二輪把全 DS「文字輸入框上對 Enter / Esc / 方向鍵 / 空白鍵有動作」的 keydown 逐一盤點,再補七處(DatePicker 可打字輸入框原本自己記
 * compositionstart/end、LinkInput 編輯態、NumberInput、FileViewer 縮放輸入框、`useFormValidation` 的 Esc 還原、AgentPanel 改名框、AppShell ⌘.);
 * 使用者清單住 `README.md` 本模組那一列。
 */

/** 原生 KeyboardEvent 或 React 合成事件都可以傳。 */
type KeyEventLike = { nativeEvent: { isComposing?: boolean; keyCode?: number } } | { isComposing?: boolean; keyCode?: number }

export function isImeComposing(event: KeyEventLike): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event
  return native.isComposing === true || native.keyCode === 229
}

/**
 * Radix 浮層 / 對話框的 `onEscapeKeyDown`:**輸入法組字中的 Esc 是在取消選字,不是「關掉這一層」**(2026-10-01)。
 * Radix 的 Esc 監聽掛在 document 捕獲階段、只看 `event.key === 'Escape'`
 * (https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/use-escape-keydown/src/use-escape-keydown.tsx#L14-L19;
 * 本 repo 安裝的 1.1.1 dist/index.mjs:7-10 同),DismissableLayer 呼叫 `onEscapeKeyDown` 之後、沒被 `preventDefault` 就關
 * (https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/dismissable-layer/src/dismissable-layer.tsx#L102-L110;
 * 安裝的 1.1.11 dist/index.mjs:59-66 同)—— 組字中按 Esc 會把選單 / 指令面板 / 改名對話框 / 日期欄位的日曆連同打到一半的字一起關掉。
 * 元件自己的 `onKeyDown` 已先問 `isImeComposing`,但那管不到 Radix 在捕獲階段的這一條。
 * 組字中:`preventDefault()`(Radix 看到就不關),**不**轉呼叫 consumer 的 handler(那一下不是要關閉的 Esc);其餘照舊轉呼叫。
 * 全 DS 的可關閉浮層只掛這一支:Popover / Dialog / Sheet 的內容元件,與直接用 Radix Dialog 的 FileViewer(使用者清單住 `README.md` 本模組那一列)。
 */
export function withImeSafeEscape<E extends KeyboardEvent>(handler?: (event: E) => void): (event: E) => void {
  return (event) => {
    if (isImeComposing(event)) {
      event.preventDefault()
      return
    }
    handler?.(event)
  }
}
