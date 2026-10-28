/**
 * @internal — 「這個對話框 / 側板有沒有說明文字」的唯一判斷(2026-10-20,獨立驗證 OV-15)。
 *
 * Radix Dialog 一律在內容元件上寫 `aria-describedby = <說明的 id>`,不管畫面上到底有沒有說明元件
 * (`@radix-ui/react-dialog` 1.1.15 `DialogContentImpl`:`"aria-describedby": context.descriptionId` 寫在 `...contentProps` 前面)。
 * DS 允許只有標題的對話框(`components/Dialog/dialog.spec.md`「A11y 預設」:DialogDescription 可省),於是沒寫說明的對話框
 * `aria-describedby` 指向一個不存在的 id(壞掉的 IDREF;2026-10-20 前 Dialog / Sheet / FileViewer 開著時實測都是),開發模式下 Radix 還在
 * console 印「Missing `Description` or `aria-describedby={undefined}`」。Radix 給的出口是 consumer 自己傳 `aria-describedby={undefined}`
 * —— 每個沒寫說明的呼叫端都要記得傳 = 一定會漏(M37:用「consumer 記得」代替「畫面上真的有說明」)。
 *
 * 這裡讓內容元件自己知道:說明元件掛上時向最近的內容元件登記(`useRegisterDescription`),內容元件沒有任何登記、consumer 也沒自己指定時,
 * 把 `aria-describedby` 拿掉(`descriptionPresenceProps`)。有說明就照 Radix 原樣指向它。
 * 消費者:`DialogContent` / `DialogDescription`、`SheetContent` / `SheetDescription`;FileViewer 沒有說明元件,直接傳 `aria-describedby={undefined}`。
 * 閘:`scripts/overlay-story-contract-invariant.mjs` R7(開著的 Dialog / Sheet / FileViewer 的 `aria-describedby` 不是指向存在的元素就是不寫)。
 */

import * as React from 'react'

/** 內容元件提供給它底下說明元件的登記函式;回傳取消登記 */
export const DescriptionPresenceContext = React.createContext<(() => () => void) | null>(null)

/** 內容元件用:回傳要放進 Provider 的登記函式,與要展開到 Radix Content 上的屬性(沒有說明、consumer 也沒指定時 = `aria-describedby: undefined`) */
export function useDescriptionPresence(consumerSetDescribedBy: boolean): {
  register: () => () => void
  descriptionPresenceProps: { 'aria-describedby'?: undefined }
} {
  const [count, setCount] = React.useState(0)
  const register = React.useCallback(() => {
    setCount((c) => c + 1)
    return () => setCount((c) => c - 1)
  }, [])
  return {
    register,
    descriptionPresenceProps: consumerSetDescribedBy || count > 0 ? {} : { 'aria-describedby': undefined },
  }
}

/** 說明元件用:掛上時向最近的內容元件登記,卸載時取消(在版面效果裡做,第一次繪製前就補回 aria-describedby) */
export function useRegisterDescription(): void {
  const register = React.useContext(DescriptionPresenceContext)
  React.useLayoutEffect(() => register?.(), [register])
}
