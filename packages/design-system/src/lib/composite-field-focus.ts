/**
 * 「觸發欄位 + 它的彈出層 = 同一個欄位」的唯一判準(2026-10-01,待辦總帳 N83)。
 *
 * 問題:Select / 可搜尋的 Select / Combobox / DatePicker / TimePicker 的觸發欄位接了 `useFormValidation` 的 `onBlur`
 * (規則 2「離開欄位才驗」),可是**打開彈出層**那一刻焦點從觸發欄位搬進浮層(Radix FocusScope / 本 DS 的 onOpenAutoFocus),
 * 觸發欄位先 blur → 必填錯誤在使用者還沒選任何東西時就長出來(2026-10-01 實測四個控件都是)。對使用者而言他**還在這個欄位裡**。
 *
 * 規則:焦點在觸發欄位與它的彈出層之間移動,不算離開欄位;兩邊都不在了才算 blur 一次。
 * 世界級同一條(各家機制不同):React Aria Select 觸發鈕的 blur 在選單開著時直接 return、選單自己的 blur 只在焦點去了選單外才轉給 consumer
 * (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/select/useSelect.ts#L244-L251、#L271-L278);
 * React Aria ComboBox "Ignore blur if focused moved to the button(if exists) or into the popover."
 * (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/combobox/useComboBox.ts#L269-L280);
 * rc-select(Ant Design 的底層)把「容器 + 彈出層」當成同一組(`getSelectElements`,
 * https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L570-L573),
 * 根節點 blur 時以焦點還在不在這一組裡決定要不要收起(同檔 #L594-L600)。
 *
 * 「同一個欄位」的零件 = 觸發欄位(DOM 子孫)+ 彈出層(`popupId`)+ 欄位自己另掛在 portal 的東西(`extra`;Combobox 的「+N」浮出清單)。
 * 彈出層與「+N」卡都在 portal 裡、不是觸發欄位的 DOM 子孫,所以要逐一點名 —— 漏點名的零件,焦點搬進去就會被當成離開。
 *
 * 使用者(清單住 `README.md` 本模組那一列):Select(桌機觸發區)、Combobox 觸發區(含「+N」浮出清單)、DatePicker(觸發區與可打字欄位)、TimePicker。
 */

/** 這個欄位的零件:觸發欄位本身與它的彈出層(用 id 找,彈出層在 portal 裡、不是 DOM 子孫)。 */
export interface CompositeFieldParts {
  /** 觸發欄位(含欄位內搜尋框、清除鈕等) */
  trigger: Element | null | undefined
  /** 彈出層內容的 id(PopoverContent / listbox 容器);關著時 getElementById 回 null,照常算離開 */
  popupId?: string | null
  /** 其他也算「同一個欄位」的節點(例:Combobox「+N」浮出清單) */
  extra?: () => Array<Element | null | undefined>
}

/** 某個節點是否在這個欄位的任一零件裡。 */
export function isWithinCompositeField(target: EventTarget | null, parts: CompositeFieldParts): boolean {
  if (!(target instanceof Node)) return false
  if (parts.trigger?.contains(target)) return true
  const popup = parts.popupId ? parts.trigger?.ownerDocument.getElementById(parts.popupId) : null
  if (popup?.contains(target)) return true
  for (const el of parts.extra?.() ?? []) if (el?.contains(target)) return true
  return false
}

/** FocusEvent 裡本判準用得到的部分(React 合成事件與原生事件都符合)。 */
export interface FocusEventLike {
  readonly currentTarget: EventTarget | null
  readonly relatedTarget: EventTarget | null
}

/**
 * 包在觸發欄位的 `onBlur` 外面:焦點只是搬進自己的彈出層(或從彈出層回到欄位、在欄位的零件之間移動)→ 不轉呼叫;
 * 真的離開(`relatedTarget` 在外面)→ 轉呼叫一次。`relatedTarget` 為 null(焦點落到非可聚焦處 / 視窗失焦)時
 * 等這一輪事件派送完再看 `document.activeElement`:還在欄位裡就不算離開。
 * 轉呼叫時傳一個保留 `currentTarget` 的事件殼(React 的合成事件在 handler 回傳後 `currentTarget` 會被清掉,
 * `useFormValidation` 要用它判斷「延後的驗證跑之前焦點回到這一格了嗎」)。
 */
export function compositeFieldBlur<E extends FocusEventLike>(
  event: E,
  parts: CompositeFieldParts,
  onBlur: ((event: E) => void) | undefined,
): void {
  if (!onBlur) return
  const currentTarget = event.currentTarget
  const forward = () => onBlur(Object.assign(Object.create(Object.getPrototypeOf(event) as object) as E, event, { currentTarget, relatedTarget: event.relatedTarget }))
  if (event.relatedTarget) {
    if (!isWithinCompositeField(event.relatedTarget, parts)) forward()
    return
  }
  const doc = (currentTarget instanceof Node ? currentTarget.ownerDocument : null) ?? document
  setTimeout(() => {
    if (isWithinCompositeField(doc.activeElement, parts)) return
    forward()
  }, 0)
}
