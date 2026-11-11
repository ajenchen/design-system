// @internal — DataTable 排序面板 / 篩選面板的「整批動作」(標題列「恢復預設」、加條件那一排的「清除全部」)共用的兩件事:
//   1. 按下後**焦點不掉到 body**:這兩顆按鈕按下去就讓自己消失(值 = 預設 / 值 = 空 → 不再出現),握著焦點時(鍵盤按、或 Chrome 滑鼠按下給了焦點)
//      焦點會被瀏覽器重設到 `<body>`(WHATWG focus fixup)。改交給同一個面板裡還在的那顆:加條件那一顆(「加排序」/「加篩選」)可按就給它,
//      否則給標題列的 ×(恆渲染)。【AI 推導】依 DS 既有「焦點不可因 DOM unmount 掉到 body」(`ds-canonical/references/keyboard-model-canonical.md`
//      「按了之後自己變停用」節列的六份 spec)+ W3C APG「focus is set on another element that provides logical work flow」(同檔 dialog 那段引文);
//      選「加條件」是因為兩個動作之後的下一步都是「重新加條件」。只有焦點真的掉了(activeElement 是 body / null)才搬,使用者已帶走焦點就不搶
//      (React Aria FocusScope「Only restore focus if we've lost focus to the body」,同檔引文)。
//   2. 按下後**播報結果**(polite):焦點落到「加排序」只會唸那顆按鈕,唸不出清單被清掉 / 換回預設。訊息只在「值仍等於這次動作的結果」時留著,
//      使用者再改任何一處就清空 —— 下一次按同一顆時文字從空變回來,讀屏才會再唸(同一句文字不變 = 不播報)。
//   規格:`../data-table.spec.md` L4「Header 恢復預設 / 清除全部」;閘:`scripts/data-table-panel-reset-clear-invariant.mjs`。

import * as React from 'react'

export interface PanelBulkAction<V> {
  /** 在按鈕的 onClick 裡呼叫:記下「焦點在不在這顆按鈕上」、登記播報,再把 next 交給 consumer */
  run: (event: React.MouseEvent<HTMLElement>, next: V, announcement: string) => void
  /** 面板內恆渲染的 polite 區域(sr-only);沒渲染 = 整批動作無聲 */
  liveRegion: React.ReactElement
}

export function usePanelBulkAction<V>({
  value,
  isEqual,
  onChange,
  focusTargets,
}: {
  value: V
  isEqual: (a: V, b: V) => boolean
  onChange: (next: V) => void
  /** 依序試:第一個還在畫面上、沒有停用的拿焦點 */
  focusTargets: () => ReadonlyArray<HTMLElement | null | undefined>
}): PanelBulkAction<V> {
  const pendingFocus = React.useRef(false)
  const [notice, setNotice] = React.useState<{ text: string; after: V } | null>(null)

  // 每次 render 後看一次:這一下是自己的整批動作造成的、焦點也真的掉了,才搬。旗標只活一個 render(沒卸載 / consumer 沒採用 → 焦點還在按鈕上 → 不搬、清旗標)
  React.useLayoutEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    const active = document.activeElement
    if (active && active !== document.body) return
    for (const el of focusTargets()) {
      if (el && el.isConnected && !el.matches(':disabled')) {
        el.focus({ preventScroll: true })
        return
      }
    }
  })

  const run = React.useCallback((event: React.MouseEvent<HTMLElement>, next: V, announcement: string) => {
    const button = event.currentTarget
    if (button.contains(button.ownerDocument.activeElement)) pendingFocus.current = true
    setNotice({ text: announcement, after: next })
    onChange(next)
  }, [onChange])

  const message = notice && isEqual(value, notice.after) ? notice.text : ''
  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-panel-live-region="">{message}</div>
  )
  return { run, liveRegion }
}
