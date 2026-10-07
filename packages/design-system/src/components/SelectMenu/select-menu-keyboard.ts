/**
 * @internal — SelectMenu 的鍵盤橋接:觸發欄位與浮層清單分屬兩棵 DOM 子樹(浮層 portal 到 body 最後),
 * 這裡收三件事,由 select-menu.tsx 轉出(Select / Combobox 既有 import 路徑不變):
 *   1. `forwardKeyToListbox`  —— 觸發欄位內的輸入框把 ↑ ↓ Enter 轉送給 cmdk(2026-07-05 D4,原住 select-menu.tsx,原樣搬來)
 *   2. `useActiveDescendant`  —— 觸發欄位輸入框的 aria-activedescendant + aria-controls(值由 Command 根讀、SelectMenu 轉交;2026-09-30 改)
 *   3. `useSelectMenuPopupKeys` —— 開著按 Tab / Shift+Tab(2026-09-25 待辦總帳 B11)與不可打字單選的空白鍵(2026-09-26,L7)
 *   4. `useTriggerSearch`     —— 搜尋字在觸發欄位時:打字把反白放回第一個符合項、多選挑選後清空關鍵字(2026-09-30)
 *   5. 觸發欄位上的三條按鍵規則(2026-10-07,待辦總帳 K1–K3):`moveHighlightToFirst`(一鍵清空後反白回第一列)、
 *      `isRemoveLastValueKey`(關鍵字空白的 Backspace = 按最後一個值的 ×)、`routeTypingToSearch`(焦點在欄位本身時打字 → 打開清單、字進搜尋框);
 *      移除時的讀屏播報區住 `select-menu-removal-status.tsx`
 * 2026-09-25 搬家理由(AI 推導):select-menu.tsx 已 799 行,加 3 會超過 `scripts/code-quality-audit.mjs` 的 800 行上限;
 * 三者同一件事(跨子樹的鍵盤 / 焦點接線),與清單渲染無關。
 * 2026-09-26:「從觸發欄位算下一站」與 DropdownMenu 合成一份 `lib/focus-after-trigger.ts`(待辦總帳〇節「按鍵規則合併」)。
 */
import * as React from 'react'
import { flushSync } from 'react-dom'
import { focusFromTrigger, tabbableOrder } from '@/design-system/lib/focus-after-trigger'
import { isTextEntryElement } from '@/design-system/lib/roving-list-keyboard'
import { dispatchRelayedKey } from '@/design-system/hooks/use-input-modality'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import {
  applyListboxRelation,
  getActiveOption,
  moveCursorToFirstOption,
  type CommandActiveOption,
} from '@/design-system/components/Command/command'

/**
 * 2026-07-05 D4 P0 修(searchable 鍵盤死路):trigger 內的裸 <input> 與 portal 內的 cmdk root
 * 在不同 DOM 子樹 — 鍵盤事件永遠 bubble 不到 cmdk 的 ArrowUp/Down/Enter handler([cmdk-root]
 * onKeyDown)→ searchable Select / PeoplePicker single / Combobox searchIn='trigger' 開啟後
 * 只能 Esc。修法 = APG combobox-with-list:trigger input 把三鍵 re-dispatch 給 cmdk root
 * (native KeyboardEvent bubbles 經 React root delegation 觸發 cmdk synthetic handler)。
 * Home/End 刻意不轉送(文字輸入的 caret 語意優先,對齊 MUI/Ant Autocomplete)。
 * 代發走 hooks/use-input-modality.ts `dispatchRelayedKey`(2026-09-30):使用者按的那一下已在觸發欄位上記過反白來歷,
 * 代發的那一份不再記一次 —— 否則 Enter 選完後(多選不關)反白會被當成鍵盤搬的而畫框,與浮層內搜尋框按 Enter 不同。
 * aria-activedescendant 綁回 trigger input → 見下方 useActiveDescendant。
 * 輸入法組字中不轉送(2026-09-30):選字的 ↑ ↓ Enter 是在操作候選字;代發出去的是一顆全新事件,isComposing / keyCode 都被洗掉,
 * cmdk 自己的組字判斷看不出來 —— 判準 lib/ime-composition.ts(全 DS 一支)。
 */
export function forwardKeyToListbox(contentId: string | undefined, e: React.KeyboardEvent): boolean {
  if (!contentId || isImeComposing(e)) return false
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return false
  const root = document.getElementById(contentId)?.querySelector<HTMLElement>('[cmdk-root]')
  if (!root) return false
  e.preventDefault()
  dispatchRelayedKey(root, e.key)
  return true
}

/**
 * 觸發欄位內搜尋框的 aria-activedescendant 與 aria-controls(APG combobox:DOM 焦點留在 combobox,反白靠 aria-activedescendant;
 * 規則住 SelectMenu/select-menu.spec.md「A11y 預設」Focus 段)。
 * **值只有一個來源**:Command 根讀到的反白列與清單 id(Command/command.tsx `useCommandRootObserver`),經 SelectMenu `onActiveOptionChange`
 * 交到這裡;回傳的 callback 用唯一寫法 `applyListboxRelation` 直接寫進輸入框 —— 不經 React state,反白每移一格不重繪整個欄位與整份清單。
 * 兩個一起寫:ARIA 1.2 要求 textbox 用 aria-activedescendant 時,aria-controls 必須指到包住那個選項的 listbox(出處見 applyListboxRelation)。
 * 浮層關閉(清單卸載)時收到 undefined → 兩個一起移除(ARIA:id 必須指向畫面上存在的節點)。
 * 2026-09-30 前:本 hook 自己拿 contentId 找浮層,effect 跑的那一刻浮層還沒掛上 —— Radix Portal 第一輪渲 null、
 * 在自己的 layout effect 之後才掛 children(node_modules/@radix-ui/react-portal/dist/index.mjs:12-14)—— 找不到就 return、
 * 依賴不變不再重跑,Select `searchable` / Combobox `searchIn='trigger'` 的輸入框上恆為 null(實測)。
 */
export function useActiveDescendant(inputRef: React.RefObject<HTMLElement | null>) {
  return React.useCallback((active: CommandActiveOption | undefined) => applyListboxRelation(inputRef.current, active), [inputRef])
}

/**
 * 搜尋字在觸發欄位(受控 `search`、SelectMenu 不畫搜尋框)時的兩條規則(關鍵字的去留表住 select-menu.spec.md「搜尋關鍵字何時保留、何時清空」):
 *
 * (a) **多選挑選後清空關鍵字**(2026-09-30 user 同意,原話「其他部分我覺得”可以”」):`clearAfterPick()` 由 SelectMenu 的挑選路徑
 *     (handleSelect / handleSelectAll:勾、取消勾、「不限」、全選)呼叫,經受控 `onSearchChange('')` 交給持有關鍵字的 consumer。
 *     浮層內搜尋框(`searchable`)保留關鍵字,不走這裡;單選選完即收起,關鍵字隨關閉清空。
 * (b) **打字 → 反白回到第一個符合項**,與浮層內搜尋框同一條規則
 *     (cmdk 在自己的搜尋字一變就選第一項,cmdk/src/index.tsx #L238-L242;觸發欄位的字 cmdk 看不到,反白會停在舊的那一列)。
 *     **挑選後的清空不算打字**:反白留在剛挑的那一列,與浮層內搜尋框「選了不動反白」一致,滑鼠挑選時反白也還在指標底下
 *     (MUI useAutocomplete 多選「Keep the current selected highlight while the popup stays open」,
 *     https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L632-L645)。
 *     判斷「這次搜尋字變化來自挑選」用 (a) 當下立的記號 + 變成的值就是空字串 —— 量的就是那件事本身;2026-09-30 初版用「已選值有沒有跟著變」
 *     推斷,consumer 沒在同一次 commit 更新值(固定值的規格範例、數量上限擋掉、非同步提交)時會把挑選誤判成打字、反白跳回第一列(M37)。
 */
export function useTriggerSearch(params: {
  commandRef: React.RefObject<HTMLElement | null>
  /** 開著、而且搜尋字在觸發欄位 */
  active: boolean
  multiple: boolean
  search: string
  setSearch: (next: string) => void
}) {
  const { commandRef, active, search } = params
  const latest = React.useRef(params)
  latest.current = params
  const lastSearch = React.useRef(search)
  const clearedByPick = React.useRef(false)
  React.useLayoutEffect(() => {
    if (lastSearch.current === search) return
    lastSearch.current = search
    const picked = clearedByPick.current && search === ''
    clearedByPick.current = false
    if (!picked && active && commandRef.current) moveCursorToFirstOption(commandRef.current)
  }, [active, search, commandRef])
  const clearAfterPick = React.useCallback(() => {
    const p = latest.current
    if (!p.active || !p.multiple || p.search === '') return
    clearedByPick.current = true
    p.setSearch('')
  }, [])
  return { clearAfterPick }
}

// ── 觸發欄位上的三條按鍵規則(2026-10-07,待辦總帳 K1–K3;SSOT = select-menu.spec.md「A11y 預設」Keyboard 段)──────────────
// Select / Combobox(PeoplePicker 經它們)的觸發欄位各自呼叫,判準只住這裡一份。

/**
 * 一鍵清空之後,反白回到第一個可選列(K2;user 2026-10-06「Ａ,B照你建議,確保符合我們一致的設計語言且不違背世界級的設計」)。
 * 一鍵清空 = 整個欄位重來,跟打開一個空欄位同一個落點(本元件 spec「A11y 預設」Focus 段第一句:反白落在第一個 / 已選選項,清空後沒有已選的)。
 * 清單只在「搜尋字有變」時才把反白放回第一項(上方 useTriggerSearch (b);浮層內搜尋框由 cmdk 自己做)—— 關鍵字本來就空時清空不會動它,
 * 反白停在剛被清掉的那一列,接著按 Enter 會把它選回來(2026-10-06 實測)。開了「不限」的欄位第一列就是「不限」本身(同開一個空欄位)。
 * 浮層關著(清單不在)時什麼都不做 —— 下次打開本來就從第一項 / 已選項開始。
 */
export function moveHighlightToFirst(contentId: string | undefined) {
  const root = contentId ? document.getElementById(contentId)?.querySelector<HTMLElement>('[cmdk-root]') : null
  if (root) moveCursorToFirstOption(root)
}

/**
 * K1:這一下 Backspace 是不是「按最後一個值的 ×」—— 關鍵字空白、不是按住連發、不在輸入法組字中(user 2026-10-06「可以跟」= 跟 MUI / rc-select / react-select)。
 * 呼叫端另外確認:焦點在觸發欄位本身或欄位內的搜尋框(不是欄位上的按鈕)、欄位裡有值、這種欄位的值可以被清掉(Select 單選只在 clearable,
 * select.spec.md「何時開 clearable」:必須有值的欄位 Backspace 不能做出 × 做不到的事)。
 * - 關鍵字空白才刪:三家同一個條件(MUI `inputValue === ''` https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1096-L1118、
 *   rc-select `!mergedSearchValue` https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L503-L530、react-select `if (inputValue) return` https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/Select.tsx#L1597-L1610)。
 * - 連發不刪(AI 依原始碼推導,user 未表示同意或反對 —— 待辦總帳 R2 行為變化清單):按住刪一長串關鍵字,刪到空之後的連發不接著把值一個個吃掉,
 *   放開再按一下才刪。三家只有 rc-select 擋(刪到空後 250ms 內不刪,https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L475-L480、
 *   #L501-L506,時長 https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/hooks/useLock.ts#L9-L30),這裡用鍵盤事件自帶的連發記號
 *   (`KeyboardEvent.repeat`),量的就是「這一下是不是按住產生的」本身,不用計時器當代理(M37)。
 * - 組字中不刪:判準唯一住所 lib/ime-composition.ts。
 */
export function isRemoveLastValueKey(e: React.KeyboardEvent, keyword: string): boolean {
  return e.key === 'Backspace' && keyword === '' && !e.repeat && !isImeComposing(e)
}

/**
 * K3:焦點在觸發欄位本身(不是欄位內的搜尋框、不是欄位上的按鈕)時打字 = 打開清單、這個字進搜尋框
 * (user 2026-10-06 同上;W3C 可打字下拉範例「Printable Characters: … Types the character in the textbox.」,
 * https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-autocomplete-list.html#L295-L300)。
 * 焦點會停在欄位本身的時機:Tab 進來、Esc 收起、Select 選完 / 清空之後(select.spec.md「Clearable」、本元件 spec Focus 段)—— 2026-10-06 前這時打的字沒有人接。
 * 「開始打字」= 一般可列印字元(空白鍵不算:它在欄位上是「打開清單」,本元件 spec Keyboard 段)或輸入法處理中的第一鍵(keyCode 229 / key 'Process':
 * 欄位本身不能打字、不可能在這裡組字,這一下就是使用者開始用輸入法打字的訊號)。帶 Ctrl / ⌘ / Alt 的是快捷鍵,不算。
 * 做法:打開清單(同步 commit,搜尋框此刻就在),焦點交給搜尋框,**不擋這一下的預設** —— 字(或輸入法接著的組字)落進已握著焦點的搜尋框。
 * 回傳是否接手了這一下。輸入法第一鍵的限制(AI 推導,真機待驗):瀏覽器在不可編輯的元素上通常不啟用輸入法,第一鍵可能以英文字母送出;
 * 根治是讓搜尋框自己當 combobox、焦點永遠落在能打字的框上(待辦總帳 OE27,不在這一批)。
 */
export function routeTypingToSearch(e: React.KeyboardEvent, { open, openNow, searchBox }: {
  open: boolean
  /** 同步打開清單(呼叫端以 flushSync 包自己的 setOpen) */
  openNow: () => void
  /** 打開之後的搜尋框(欄位內 / 浮層內) */
  searchBox: () => HTMLElement | null | undefined
}): boolean {
  if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return false
  const typing = isImeComposing(e) || e.key === 'Process' || (e.key.length === 1 && e.key !== ' ')
  if (!typing) return false
  if (!open) openNow()
  const box = searchBox()
  if (!box) return false
  box.focus()
  return true
}

/**
 * 這一下「按在外面」其實是指標按在觸發欄位本身(×、Tag ×、欄位內搜尋框、空白處、箭頭)—— 是的話 SelectMenu 的 `onInteractOutside` 擋掉
 * (2026-10-07,待辦總帳 K3 同批)。Radix 非 modal Popover 只要沒被擋,就把它記成「互動過外面」(@radix-ui/react-popover 1.1.15
 * dist/index.mjs:185-192;原始碼 https://github.com/radix-ui/primitives/blob/4a49a34316fa8068389ed0f8619383af1bfd734b/packages/react/popover/src/popover.tsx#L350-L372;它自己再擋關閉,但記號已設),之後用 Esc / Enter 收起時就不把焦點還給觸發欄位(同檔 :179)——
 * Select 的搜尋框隨收起卸載、浮層內搜尋框跟著浮層卸載,焦點掉到頁面上(違 select.spec.md「Clearable」清除後焦點、select-menu.spec.md
 * 「A11y 預設」Focus 段「選完 / Esc 關閉時焦點回觸發欄位」;2026-10-06 實測)。判準同 lib/overlay-focus-return.ts「按在開啟者上不算外面」。
 * 只認指標:鍵盤 Tab 走到欄位上的 × 那種 focusin 維持原樣。欄位內搜尋框握著焦點時點欄位收起、焦點留在搜尋框(select-menu.spec.md
 * Focus 段「收起後焦點回觸發點的長相」括號那一格)由 overlay-focus-return 的 (a′) 守。
 */
export function isPointerOnTrigger(original: Event, trigger: HTMLElement | null): boolean {
  const target = original.target
  return original.type === 'pointerdown' && target instanceof Node && !!trigger?.contains(target)
}

/** 欄位上「值被移除」的讀屏播報句型(K1;句型同 lib/drag-announcements.ts「已移動…『X』」)。 */
export const removalAnnouncement = (label: string) => `已移除『${label}』` // i18n-allow: DS default 讀屏播報

// ── 開著按 Tab / Shift+Tab(2026-09-25 待辦總帳 B11;SSOT = select-menu.spec.md「A11y 預設」)─────────────
//
// 兩種浮層、兩條規則 —— W3C 下拉規範依「彈出的是什麼」分流:
//
// (1) 單選 = 清單型(listbox):選定反白那一項 → 收起 → 焦點落到觸發欄位的下一個(Shift:上一個)可 Tab 元素,
//     也就是「關著時從觸發欄位按 Tab 會到的同一格」。
//     W3C 單選下拉範例 Tab 列:「Sets the value to the content of the focused option in the listbox. / Closes the listbox. /
//     Performs the default action, moving focus to the next focusable element.」
//     https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-select-only.html#L187-L199
//     Shift+Tab 同樣選定:該範例是在觸發欄位失焦時選定,不分方向
//     https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/js/select-only.js#L249-L260
//     Fluent 單選 `case 'Tab': !multiselect && activeOption && selectOption(e, activeOption);`(不分 Shift)
//     https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-combobox/library/src/utils/useTriggerSlot.ts#L198-L200
//
// (2) 多選 = 小面板型(dialog:面板裡有搜尋框 / 全選鈕,DOM 焦點會進到面板):Tab 留在面板裡繞圈,行為不變。
//     W3C:dialog 型彈出「implements the keyboard interaction defined in the modal dialog pattern」
//     https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/combobox-pattern.html#L391
//     對話框「contain their tab sequence」
//     https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L29-L30
//     這裡只補一個洞:焦點停在「程式落點」(cmdk 殼,tabIndex -1,不在 Tab 序裡)時,Shift+Tab 照 DOM 順序往前
//     找到的是頁面最後一個元素(浮層掛在 body 最後)→ 跳出面板到頁尾(R15 實測 S-PAGE-END)。
//
// 為什麼自己算「下一格」,不把焦點先丟回觸發欄位再讓瀏覽器照走(AI 推導,2026-09-25):
//   (a) 焦點在觸發欄位上停一下,欄位的截斷 tooltip 會因 focus 打開、又立刻因 blur 關閉 → 閃一下淡出動畫;
//   (b) 觸發欄位在另一個小面板 / 對話框裡時,那一層的 Radix FocusScope 正被本浮層「暫停」
//       (`@radix-ui/react-focus-scope` 1.1.7 dist:`if (focusScope.paused) return`),不會替我們繞回 ——
//       交給瀏覽器照走,觸發欄位若是那一層的第一 / 最後一格,焦點就跑出去、把外層面板一起關掉。
// 「下一格」的算法與選單同一份(lib/focus-after-trigger.ts):對話框 / 面板裡繞圈;頁面上已沒有下一格 → 留在觸發欄位(X20)。
// 2026-09-26 之前這裡另有一份(不認正 tabindex、頁面邊緣交還瀏覽器 —— 會落在 Radix 關閉動畫期間仍掛著的隱形焦點護欄上)。

/**
 * 多選小面板:焦點在程式落點(不在 Tab 序裡)時,Tab / Shift+Tab 仍留在面板裡(規則 (2))。
 * 焦點已在可 Tab 元素上 → 不插手:Radix FocusScope(`loop: true`,`@radix-ui/react-popover` 1.1.15 dist/index.mjs:225-226)
 * 在邊緣自己繞回,中間交給瀏覽器照 DOM 順序走,本來就不會出面板。
 */
function keepTabInsidePanel(e: React.KeyboardEvent, content: HTMLElement | null) {
  if (!content) return
  const active = content.ownerDocument.activeElement as HTMLElement | null
  if (!active || !content.contains(active)) return // 焦點不在面板裡(例:搜尋框在觸發欄位內)→ 不歸這裡管
  const list = tabbableOrder(content)
  if (list.includes(active)) return
  e.preventDefault()
  if (list.length === 0) return // 面板裡沒有可 Tab 的東西:焦點留在原地(仍不出面板)
  const preceding = list.filter((el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
  const following = list.filter((el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  const target = e.shiftKey ? (preceding[preceding.length - 1] ?? list[list.length - 1]) : (following[0] ?? list[0])
  target.focus()
}

interface SelectMenuPopupKeysParams {
  open: boolean
  multiple: boolean
  /** cmdk 反白列的 `data-value`(cmdk 會 trim)→ 對應的可選選項值;不是可選選項(建立列 / disabled)回 undefined */
  resolveOptionValue: (dataValue: string) => string | undefined
  isSelected: (value: string) => boolean
  /** 單選:選定 + 收起(SelectMenu `handleSelect`) */
  commit: (value: string) => void
  close: () => void
}

/** 焦點在文字輸入上(可打字搜尋的搜尋框):空白鍵是打字,不是選取(判準 = lib/roving-list-keyboard.ts `isTextEntryElement`,全 DS 一份) */
const isTextEntryTarget = (target: EventTarget | null) => target instanceof Element && isTextEntryElement(target)

/** 反白列(讀法唯一住所 Command/command.tsx `getActiveOption`)對應的可選選項值;建立列 / 停用 / 沒有反白 → undefined */
function highlightedOptionValue(content: HTMLElement | null, resolve: (dataValue: string) => string | undefined) {
  const active = getActiveOption(content)
  const dataValue = active?.getAttribute('data-disabled') === 'true' ? null : active?.getAttribute('data-value')
  return dataValue == null ? undefined : resolve(dataValue)
}

/**
 * 回傳:
 * - `triggerRef` → PopoverTrigger;`contentRef` → PopoverContent
 * - `onKeyDown`:掛在觸發欄位(可打字搜尋時焦點在欄位內的輸入框)與 cmdk 根(不可打字時焦點在浮層裡)兩處
 * - `onCloseAutoFocus` → PopoverContent:Tab 收起時擋掉 Radix「關閉後把焦點還給觸發欄位」——那一步在 FocusScope 卸載
 *   (關閉動畫結束後的 setTimeout 0)才跑,會把剛走到下一格的焦點搶回來(與 B11 點名的
 *   `agent-panel-fab.tsx:702-705`「關選單時硬搶焦點」同一類)
 */
export function useSelectMenuPopupKeys(params: SelectMenuPopupKeysParams) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(params)
  latest.current = params
  const closedByTabRef = React.useRef(false)

  // 重新開啟 = 新的一輪,舊的「由 Tab 收起」記號作廢
  React.useEffect(() => {
    if (params.open) closedByTabRef.current = false
  }, [params.open])

  const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const p = latest.current
    if (e.altKey || e.ctrlKey || e.metaKey) return
    // IME 組字中不動(判準唯一住所 lib/ime-composition.ts)
    if (isImeComposing(e)) return
    if (!p.open || e.defaultPrevented) return
    const content = contentRef.current

    // ── 不可打字的單選:空白鍵 = 選這一項(同 Enter)──
    // 2026-09-26 待辦總帳〇節 L7 第 1 條,主線正本定義:「不能打字的選項清單,Enter 與空白鍵都是選這一項」;
    // 同意 = 同檔「09-26 同意清單回覆」,user 逐字:「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」。
    // W3C 單選下拉範例「Listbox Popup」表的 Space 列,與 Enter 列逐字相同:「Sets the value to the content of the focused option
    // in the listbox. / Closes the listbox. / Sets visual focus on the combobox.」
    // (https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/examples/combobox-select-only.html#L177-L186)。
    // 可打字(焦點在搜尋框)時空白鍵是打字,不動;多選(面板)不在本條。cmdk 自己不處理空白鍵,所以不會重複觸發。
    if (e.key === ' ') {
      if (p.multiple || isTextEntryTarget(e.target)) return
      e.preventDefault()
      const value = highlightedOptionValue(content, p.resolveOptionValue)
      // 與 Enter 同一個動作(cmdk Enter → CommandItem onSelect → handleSelect):選定 + 收起,焦點由 Radix 還給觸發欄位
      if (value !== undefined) p.commit(value)
      return
    }
    if (e.key !== 'Tab') return

    // B11 多選(有全選):行為不變,Tab 留在面板裡;只修程式落點上 Shift+Tab 跳頁尾
    if (p.multiple) {
      keepTabInsidePanel(e, content)
      return
    }

    // B11 單選:Tab / Shift+Tab = 選定反白那一項 + 收起 + 從觸發欄位往下 / 往上走
    const value = highlightedOptionValue(content, p.resolveOptionValue)
    const trigger = triggerRef.current
    if (!trigger) return
    e.preventDefault()
    closedByTabRef.current = true
    // flushSync:先讓收起生效(可打字搜尋的輸入框卸載、觸發欄位換回顯示值),再算「下一格」,
    // 否則算到的會是即將消失的輸入框。已是目前值 → 不重發 onValueChange,只收起。
    flushSync(() => {
      if (value !== undefined && !p.isSelected(value)) p.commit(value)
      else p.close()
    })
    // 下一格 = 觸發欄位關著時按同一個鍵會到的那一格(lib/focus-after-trigger.ts;與選單同一份)。
    // 本浮層關閉動畫期間還在 DOM 裡,裡面的捲動區可 Tab → 排除。
    focusFromTrigger(trigger, e.shiftKey, (el) => !!content?.contains(el))
  }, [])

  const onCloseAutoFocus = React.useCallback((e: Event) => {
    if (!closedByTabRef.current) return
    closedByTabRef.current = false
    e.preventDefault()
  }, [])

  return { triggerRef, contentRef, onKeyDown, onCloseAutoFocus }
}
