/**
 * @internal — 「觸發欄位 + 它的彈出層 = 同一個欄位」的唯一判準(2026-10-01,待辦總帳 N83)。
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
 * 使用者(清單住 `README.md` 本模組那一列):SelectMenu(替 Select 桌機觸發區 / Combobox 觸發區(含「+N」浮出清單)/ PeoplePicker 掛;2026-10-21 起)、
 * DatePicker(觸發區與可打字欄位)、TimePicker —— 都經下方 `useCompositeFieldBlur`。
 *
 * **兩邊都要聽,關的那一下還要補量一次**(2026-10-21,r1b fields F1;下方 `useCompositeFieldBlur`):
 * 2026-10-01 版只把判準掛在觸發欄位的 `onBlur`。彈出層在 portal 裡、在 React 樹上是觸發欄位的兄弟(SelectMenu 的 PopoverContent、
 * DatePicker / TimePicker 的面板),焦點從彈出層直接離開(開著點空白處、開著直接點下一格、不可搜尋的 Select 開著按 Tab)時,
 * 觸發欄位收不到任何 blur → 規則 2 不跑,必填錯誤要等送出才出現(修前實測:兩種 Select、DatePicker、TimePicker 都是;main 在這幾條路徑
 * 都會長出錯誤,只是長得太早)。另一個洞:握著焦點的節點隨收起卸載(可搜尋 Select 的欄位內搜尋框),瀏覽器不發 focusout,
 * 焦點悄悄落到 body。所以:觸發欄位與彈出層**兩邊**都掛同一組 `onFocus` / `onBlur`;彈出層關掉的那一下(`popupClosed`,掛在彈出層的
 * `onCloseAutoFocus` —— 浮層「還焦點」那一步之後),等這一輪事件派送完再看一次焦點還在不在這個欄位裡 —— 不在、而且這次進來之後還沒轉呼叫過,就算離開一次。
 * 為什麼掛在 `onCloseAutoFocus` 而不是看 `open` 變 false:沒有收起動畫(使用者要求減少動態)時,Radix 先卸載內容、下一輪才把焦點還給觸發點;
 * 看 `open` 的那一次檢查會早於還焦點,把「Esc 收起、焦點正要回欄位」誤判成離開(2026-10-21 實測:escape-and-focus B-popup 在沒有樣式的頁面上紅)。「進來過、還沒轉呼叫過」由同一個記號管,
 * 所以一次離開不管從哪一邊量到,consumer 的 `onBlur` 都只跑一次。
 * 世界級:React Aria useSelect 觸發鈕與選單**兩邊**都接 blur、選單那邊「only if focus moved outside the menu」才轉給 consumer
 * (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/select/useSelect.ts#L244-L251、#L271-L278)。
 */

import * as React from 'react'

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

/** @internal 只給 DS 元件用(見 useCompositeFieldBlur);不進 root barrel(lib/README「公開與否」) */
export interface UseCompositeFieldBlurOptions<E extends FocusEventLike> {
  /** 彈出層內容的 id(彈出層在 portal 裡,用 id 找) */
  popupId: string | undefined
  /** 其他也算同一個欄位的節點(例:Combobox「+N」浮出清單) */
  extra?: () => Array<Element | null | undefined>
  /**
   * 觸發欄位的 ref(PopoverTrigger asChild 的那一個)。觸發欄位那一邊的事件本身就帶著它(`currentTarget`),這個 ref 只在
   * 「焦點直接進了彈出層、觸發欄位一次都還沒收過事件」時才用得到(`defaultOpen`)。不能只靠它:Radix Slot 每次重繪換一支合併後的 ref,
   * React 在 commit 中先給 null 再給節點 —— 開啟那一下欄位內搜尋框 `autoFocus` 搬焦點時正好落在 null 的那一段(2026-10-21 實測)。
   */
  triggerRef?: React.RefObject<Element | null>
  /** consumer 的 onBlur:真的離開這個欄位才轉呼叫,一次離開只一次 */
  onBlur: ((event: E) => void) | undefined
}

type FocusHandlers = { onFocus: (event: FocusEventLike) => void; onBlur: (event: FocusEventLike) => void }

/**
 * @internal —— DS 元件(SelectMenu 替 Select / Combobox / PeoplePicker 掛、DatePicker、TimePicker)內部用,不是公開 API;
 * 判準是上方同一支 `compositeFieldBlur`;本模組整支 `@internal`(檔頭,r1b others OTH-07),兩者都不進 root barrel(lib/README「公開與否」,2026-10-21)。
 *
 * 回傳兩組 handler:`trigger` 掛在觸發欄位(PopoverTrigger asChild,Slot 會與欄位自己的 handler 串起來)、`popup` 掛在彈出層內容
 * (見檔頭「兩邊都要聽」)。收的是任一零件的事件(元素型別不同),轉給 consumer 時才是 E。
 * 轉給 consumer 的事件:`currentTarget` 一律是觸發欄位(彈出層那一邊量到的、關的那一下補量的也一樣)——
 * `useFormValidation` 用它判斷「延後的驗證跑之前焦點回到這一格了嗎」,彈出層隨收起卸載,拿它來判斷會判錯。
 */
export function useCompositeFieldBlur<E extends FocusEventLike>({ popupId, extra, triggerRef, onBlur }: UseCompositeFieldBlurOptions<E>): {
  trigger: FocusHandlers
  popup: FocusHandlers
  /** 掛在彈出層的 `onCloseAutoFocus`(與既有的那一支串起來):關掉的那一下補量一次(見檔頭) */
  popupClosed: () => void
} {
  // 焦點進了這個欄位(任一零件)、還沒轉呼叫過 consumer 的 onBlur
  const insideRef = React.useRef(false)
  // 觸發欄位那一邊最近一次事件的 currentTarget(= 觸發欄位本身)
  const seenTriggerRef = React.useRef<Element | null>(null)
  // 最近一次進來的 focus 事件:關的那一下補量時,照它的形狀做一個 blur 事件殼(consumer 收到的仍是 React 合成事件的樣子)
  const lastFocusRef = React.useRef<FocusEventLike | null>(null)
  const latest = React.useRef({ popupId, extra, triggerRef, onBlur })
  latest.current = { popupId, extra, triggerRef, onBlur }

  const parts = React.useCallback((): CompositeFieldParts => ({
    trigger: latest.current.triggerRef?.current ?? seenTriggerRef.current,
    popupId: latest.current.popupId,
    extra: latest.current.extra,
  }), [])
  const leave = React.useCallback((event: FocusEventLike) => {
    if (!insideRef.current) return
    insideRef.current = false
    const trigger = parts().trigger
    const fromTrigger = trigger && event.currentTarget instanceof Node && trigger.contains(event.currentTarget)
    latest.current.onBlur?.((trigger && !fromTrigger ? withFieldTarget(event, trigger) : event) as E)
  }, [parts])
  const focus = React.useCallback((event: FocusEventLike) => {
    insideRef.current = true
    lastFocusRef.current = event
  }, [])
  const blur = React.useCallback((event: FocusEventLike) => {
    if (latest.current.onBlur) compositeFieldBlur(event, parts(), leave)
  }, [parts, leave])
  const trigger = React.useMemo<FocusHandlers>(() => ({
    onFocus: (event) => { if (event.currentTarget instanceof Element) seenTriggerRef.current = event.currentTarget; focus(event) },
    onBlur: (event) => { if (event.currentTarget instanceof Element) seenTriggerRef.current = event.currentTarget; blur(event) },
  }), [focus, blur])
  const popup = React.useMemo<FocusHandlers>(() => ({ onFocus: focus, onBlur: blur }), [focus, blur])

  const popupClosed = React.useCallback(() => {
    if (!insideRef.current || !latest.current.onBlur) return
    // 呼叫時浮層還在決定焦點去哪(consumer 的 onCloseAutoFocus 之後還有 Radix 的預設);按下指標的預設動作也在這一輪之內 → 下一輪再看
    setTimeout(() => {
      const p = parts()
      const doc = p.trigger?.ownerDocument ?? document
      if (!insideRef.current || isWithinCompositeField(doc.activeElement, p)) return
      const base = lastFocusRef.current
      if (!base || !p.trigger) { insideRef.current = false; return }
      leave(withFieldTarget(base, p.trigger, { type: 'blur', target: p.trigger, relatedTarget: null }))
    }, 0)
  }, [parts, leave])

  return { trigger, popup, popupClosed }
}

/** 事件殼:保留原事件的形狀與方法(同 compositeFieldBlur 的 forward —— React 合成事件的 handler 回傳後 currentTarget 會被清掉),currentTarget 換成觸發欄位 */
function withFieldTarget<E extends FocusEventLike>(event: E, trigger: Element, extra?: Record<string, unknown>): E {
  return Object.assign(Object.create(Object.getPrototypeOf(event) as object) as E, event, { currentTarget: trigger }, extra)
}
