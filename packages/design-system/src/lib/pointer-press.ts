/**
 * 「按下指標時,焦點該不該動」的共用判準(2026-09-30)。
 *
 * 同一件事的宿主:容器上掛 mousedown / click,按在容器裡「沒有自己行為的地方」時由容器接手 ——
 *   - Field 家族可打字欄位的外框(`components/Field/field-wrapper.tsx` `focusFieldInputFromChrome`):點外框 = 點輸入處
 *   - LinkInput 連結狀態的外框(`components/LinkInput/link-input.tsx`):點外框 = 按鉛筆進入編輯
 *   - cmdk 選單(`components/Command/command.tsx` Command 根):點選項 / 清單 / 訊息列,DOM 焦點留在控制這份清單的 combobox
 *   - 觸發欄位內有搜尋框的 Select / Combobox 觸發區(`keepFocusOnPointerPress`):搜尋框握著焦點時,按 Tag ×、一鍵清空 ×、
 *     欄位空白處都不把焦點搬走;Combobox「+N」浮出清單(另一個 portal)由它自己掛同一支(OverflowIndicator `onContentMouseDown`)
 *   - AgentPanel 輸入盒(`components/AgentPanel/agent-panel.tsx` AgentPromptInput 外框 + 附件「+N」浮出清單,2026-10-01 待辦總帳 OE30):
 *     textarea 握著焦點時,按附件 ×、+、送出、停止,焦點與正在打的字都留在輸入盒(同一個複合輸入控件的零件)
 * 用 mousedown 擋預設、不等 click:click 之前焦點早已被瀏覽器搬走(blur → focus 閃一下)。
 * 世界級同一手法:rc-select 清單 `onMouseDown` → `event.preventDefault()`
 * (https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/OptionList.tsx#L79-L81)、
 * 選取區按在輸入框以外的地方同樣擋預設
 * (https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/SelectInput/index.tsx#L182-L209);
 * MUI Autocomplete 根元素 `handleMouseDown` 按在輸入框以外就擋預設
 * (https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1316-L1329)。
 * 2026-09-30 之前這份清單住 field-wrapper.tsx(`FIELD_CHROME_OWN_TARGET`,只有 Field 與 LinkInput 用);選單要用同一份,搬來這裡,不另寫第二份。
 */

/**
 * 容器裡本身可操作、照它自己行為走的東西:按它不擋預設(按鈕照常聚焦與啟動 / 輸入框放插入點、拖曳選字 / 連結照常)。
 * **刻意不含 `[tabindex]`**:cmdk 的清單殼(`tabIndex -1`)、選項裡的名片頭像(`tabIndex -1`)都算「按在選項上」,不是另一個控件。
 */
const POINTER_OWN_TARGET =
  'button, a[href], input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]'

/** 會自己放插入點 / 拖曳選字 / 展開原生選單的東西:不論誰握著焦點,按它一律照原生。 */
const POINTER_TEXT_ENTRY_TARGET = 'input, textarea, select, [contenteditable="true"]'

/** 按下的目標是否落在容器裡「自有行為」的東西上(容器自己不算)。 */
export function isOwnPointerTarget(container: Element, target: Element): boolean {
  const own = target.closest(POINTER_OWN_TARGET)
  return !!own && own !== container && container.contains(own)
}

/** mousedown 事件裡本判準用得到的部分(React 合成事件與原生事件都符合)。 */
export interface PointerPressEvent {
  readonly button: number
  readonly defaultPrevented: boolean
  readonly target: EventTarget | null
  preventDefault(): void
}

/**
 * 焦點此刻握在 `holder` 上(可打字的搜尋框,或它所屬的 combobox),按在同一個控件的其他部位時**焦點不動**:
 * 擋 mousedown 預設,click 照常觸發(按鈕照常動作)。回傳是否擋了。
 * 全部成立才擋:左鍵;沒被別人擋過;按下點在 `container` 的 DOM 裡(React 事件會穿過 portal 冒泡 —— 在另一個 portal 裡、
 * 卻是**同一個控件的零件**的(Combobox 的「+N」浮出清單)由那個 portal 自己再掛一次本判準、container 傳它自己;
 * 名片這類**另一個控件**的浮層不掛,照原生);`holder` 就是此刻的 `document.activeElement`;按下的不是 `holder` 本身,
 * 也不是另一個文字輸入(那裡要放插入點)。
 * 按鈕**也擋**(與 `isOwnPointerTarget` 不同):這條給「DOM 焦點的主人是搜尋框,清單、欄位上的按鈕都是同一個控件的零件」的控件 ——
 * 按零件是在同一個控件上下指令(移除一項、全選、清空),不換焦點的主人;這些按鈕照樣可以用鍵盤 Tab 到(Tag × 在 Tab 序上)。
 * rc-select / MUI 的選取區同樣連 Tag 的移除鈕一起擋(出處見檔頭)。
 */
export function keepFocusOnPointerPress(event: PointerPressEvent, container: Element, holder: Element | null | undefined): boolean {
  if (event.button !== 0 || event.defaultPrevented || !holder) return false
  if (holder.ownerDocument.activeElement !== holder) return false
  const target = event.target
  if (!(target instanceof Element) || !container.contains(target) || holder.contains(target)) return false
  if (target.closest(POINTER_TEXT_ENTRY_TARGET)) return false
  event.preventDefault()
  return true
}
