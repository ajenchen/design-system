/**
 * @internal — SelectMenu 的鍵盤橋接:觸發欄位與浮層清單分屬兩棵 DOM 子樹(浮層 portal 到 body 最後),
 * 這裡收三件事,由 select-menu.tsx 轉出(Select / Combobox 既有 import 路徑不變):
 *   1. `forwardKeyToListbox`  —— 觸發欄位內的輸入框把 ↑ ↓ Enter 轉送給 cmdk(2026-07-05 D4,原住 select-menu.tsx,原樣搬來)
 *   2. `useActiveDescendant`  —— 觸發欄位輸入框的 aria-activedescendant(同上,原樣搬來)
 *   3. `useSelectMenuPopupKeys` —— 開著按 Tab / Shift+Tab(2026-09-25 待辦總帳 B11)與不可打字單選的空白鍵(2026-09-26,L7)
 * 2026-09-25 搬家理由(AI 推導):select-menu.tsx 已 799 行,加 3 會超過 `scripts/code-quality-audit.mjs` 的 800 行上限;
 * 三者同一件事(跨子樹的鍵盤 / 焦點接線),與清單渲染無關。
 * 2026-09-26:「從觸發欄位算下一站」與 DropdownMenu 合成一份 `lib/focus-after-trigger.ts`(待辦總帳〇節「按鍵規則合併」)。
 */
import * as React from 'react'
import { flushSync } from 'react-dom'
import { focusFromTrigger, tabbableOrder } from '@/design-system/lib/focus-after-trigger'
import { isTextEntryElement } from '@/design-system/lib/roving-list-keyboard'

/**
 * 2026-07-05 D4 P0 修(searchable 鍵盤死路):trigger 內的裸 <input> 與 portal 內的 cmdk root
 * 在不同 DOM 子樹 — 鍵盤事件永遠 bubble 不到 cmdk 的 ArrowUp/Down/Enter handler([cmdk-root]
 * onKeyDown)→ searchable Select / PeoplePicker single / Combobox searchIn='trigger' 開啟後
 * 只能 Esc。修法 = APG combobox-with-list:trigger input 把三鍵 re-dispatch 給 cmdk root
 * (native KeyboardEvent bubbles 經 React root delegation 觸發 cmdk synthetic handler)。
 * Home/End 刻意不轉送(文字輸入的 caret 語意優先,對齊 MUI/Ant Autocomplete)。
 * aria-activedescendant 綁回 trigger input → 見下方 useActiveDescendant(2026-07-05 D4 補齊)。
 */
export function forwardKeyToListbox(contentId: string | undefined, e: React.KeyboardEvent): boolean {
  if (!contentId) return false
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return false
  const root = document.getElementById(contentId)?.querySelector<HTMLElement>('[cmdk-root]')
  if (!root) return false
  e.preventDefault()
  root.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }))
  return true
}

/**
 * 2026-07-05 D4 補齊(APG combobox aria-activedescendant):追蹤 cmdk 目前 virtual-focus item
 * 的 DOM id,供 trigger 端搜尋 input 綁 `aria-activedescendant` —— SR 才會在方向鍵導覽 /
 * 打字過濾時播報 active option 名。機制:trigger 與 portal 內 cmdk 分屬不同 DOM 子樹,cmdk
 * 只把 active id 綁在自己的 Command.Input / List(cmdk source:item 自帶 auto-generated id +
 * `data-selected="true"` 標記 virtual focus)→ trigger 端用 MutationObserver 監聽 popover 容器
 * (contentId = PopoverContent id)內 `data-selected` 屬性變化 + childList(打字過濾 re-render
 * 換 item 節點),單一機制涵蓋全部更新路徑:開啟初始 auto-highlight / forwardKeyToListbox
 * 方向鍵轉送 / 搜尋過濾後 cmdk 自動移 cursor / pointer hover。
 * 關閉時清 undefined —— ARIA 要求 id 必指向存在於 DOM 的節點,不可留 stale id。
 */
export function useActiveDescendant(contentId: string | undefined, open: boolean): string | undefined {
  const [activeId, setActiveId] = React.useState<string | undefined>(undefined)
  React.useEffect(() => {
    if (!open || !contentId) {
      setActiveId(undefined)
      return
    }
    // PopoverContent 與 trigger 同一個 React commit mount(open state 同批 render)→ effect 跑時已在 DOM
    const container = document.getElementById(contentId)
    if (!container) return
    const read = () => {
      setActiveId(container.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.id || undefined)
    }
    // 初始補讀:MutationObserver 只看「觀察開始後」的變化;cmdk 初始 auto-highlight(layout effect
    // 排程)可能已 commit → rAF 讀當下狀態兜底,與 observer 互補、誰先到都不漏。
    const raf = requestAnimationFrame(read)
    const observer = new MutationObserver(read)
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-selected'] })
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [open, contentId])
  return activeId
}

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

/** 反白列(cmdk 的 data-selected)對應的可選選項值;建立列 / 停用 / 沒有反白 → undefined */
function highlightedOptionValue(content: HTMLElement | null, resolve: (dataValue: string) => string | undefined) {
  const dataValue = content
    ?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]:not([data-disabled="true"])')
    ?.getAttribute('data-value')
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
    // IME 組字中不動(同 DataTable handleEditTab 的 isComposing / 229 守衛)
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
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
