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

// 2026-10-01 上午曾在這裡放 `withImeSafeEscape`(浮層的 `onEscapeKeyDown`:組字中的 Esc 不關那一層)。同日下午「這一下 Esc 由誰處理」
// 擴成一條完整規則(焦點所在控件自己那一層也算一層),判定住 `lib/overlay-escape.ts` `withOverlayEscape`,組字那一條併進它的第一步 ——
// 模組名(輸入法)與職責(Esc 分層)不符,不留兩支守門。本檔只剩判準本身。
