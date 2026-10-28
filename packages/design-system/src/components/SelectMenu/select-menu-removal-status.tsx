/**
 * @internal — 欄位上「值被移除」的讀屏播報(2026-10-07,待辦總帳 K1 Backspace)。
 *
 * 關鍵字空白時按 Backspace 刪掉最後一個值,焦點**不動**(還在搜尋框 / 欄位本身)—— 焦點沒換,讀屏不會自己念任何東西,
 * 使用者聽不到少了一個值。所以刪的那一下念一句「已移除『X』」(句型 `removalAnnouncement`,select-menu-keyboard.ts)。
 * 「讀屏念『已移除「X」』」是 AI 依三家原始碼推導、user 沒有表示同意或反對的一項(待辦總帳 K1 / R2 行為變化清單)。
 * 世界級:react-select polite 區域念「option X, deselected.」(https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/accessibility/index.ts#L134-L137);
 * rc-select 欄位有焦點時以 polite 區域念目前的值(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/Polite.tsx#L9-L31);MUI 不念。
 *
 * 形狀同 Command 根的 `CommandEmptyStatus`(sr-only + `role="status"` + `aria-live="polite"`):**一直掛著**,只換裡面的字 ——
 * 新掛上、已帶文字的 live region 讀屏器多半不念(command.tsx 同一段理由)。同一句話連念兩次(刪掉「Food」、又選回來再刪)時,
 * 內層換一個 key 讓文字節點整個換新,讀屏才會再念(live region 預設念「新加入」的節點,aria-relevant 預設 additions text)。
 * 放在觸發欄位裡(sr-only 絕對定位,不佔版面):欄位以外沒有 Select / Combobox 自己擁有的 DOM(浮層關著時不在)。
 *
 * **這句話只在它還是現況時掛著**(2026-10-07 驗證回報:修前刪掉「日本」再選「美國」,欄位裡仍寫著「已移除『日本』」——
 * 讀屏用虛擬游標逐字瀏覽時會讀到過期的句子)。兩件事讓它退場:
 *   (a) **值又變了**(選了別的、按 Tag × 刪了別的、受控的 consumer 沒有接受這次移除):播報時記下「移除之後的值」,此刻的值不是它 → 清空,
 *       而且是真的清掉狀態(不是只在畫面上藏起來)—— 否則值兜一圈回到同一個樣子時,舊句子會重新掛上、被當成新的一句念出來。
 *       量的是「值是不是移除後那一個」本身,不是「過了多久」之類的代理(M37);
 *   (b) **焦點離開這個欄位**(觸發欄位與它的浮層都不在了,判準 lib/composite-field-focus.ts):呼叫端在欄位的 blur 裡呼叫 `clear`。
 * 世界級同一條:react-select 的播報區只在欄位有焦點時有內容
 * (https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/components/LiveRegion.tsx#L213-L220),
 * 下一個動作的句子取代上一句;rc-select 的 Polite 只在欄位有焦點、清單關著時掛(上面 Polite.tsx 連結,掛載條件
 * https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L827)。
 * 清空不會被念出來(拿掉文字不是「新加入」)。
 */
import * as React from 'react'
import { removalAnnouncement } from '@/design-system/components/SelectMenu/select-menu-keyboard'

export interface RemovalAnnouncement { text: string; n: number }

interface Said extends RemovalAnnouncement {
  /** 播報那一下「移除之後的值」;此刻的值不是它 = 這句話已經過期 */
  valueAfter: string
}

/**
 * @param valueKey 欄位此刻的值,壓成一個字串(Select:值本身;Combobox:`removalValueKey(陣列)`)—— 與 `announce` 第二個參數同一種壓法
 * @returns 目前要念的句子、`announce(label, valueAfter)`(呼叫一次 = 念一次「已移除『label』」)、`clear()`(焦點離開欄位時呼叫)
 */
export function useRemovalAnnouncement(valueKey: string) {
  const [said, setSaid] = React.useState<Said>({ text: '', n: 0, valueAfter: '' })
  const announce = React.useCallback((label: string, valueAfter: string) => setSaid((p) => ({ text: removalAnnouncement(label), n: p.n + 1, valueAfter })), [])
  const clear = React.useCallback(() => setSaid((p) => (p.text ? { ...p, text: '' } : p)), [])
  // (a) 值又變了 → 在這一次繪製就把狀態清掉(React「依上一次的 props 調整 state」做法:條件成立才設、設完條件就不成立,不會一直重繪)
  if (said.text && said.valueAfter !== valueKey) setSaid({ ...said, text: '' })
  const current = said.text && said.valueAfter === valueKey ? said.text : ''
  return { said: { text: current, n: said.n } satisfies RemovalAnnouncement, announce, clear }
}

/** 多選的值壓成 `useRemovalAnnouncement` 要的字串(JSON:不同陣列不會壓成同一串) */
export const removalValueKey = (values: readonly string[]) => JSON.stringify(values)

export function RemovalStatus({ said }: { said: RemovalAnnouncement }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      <span key={said.n}>{said.text}</span>
    </span>
  )
}
