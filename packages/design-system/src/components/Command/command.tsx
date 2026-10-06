"use client"
/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 SelectMenu(搜尋式選單引擎)等 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */

import * as React from "react"
import { type DialogProps } from "@radix-ui/react-dialog"
import { Command as CommandPrimitive, useCommandState } from "cmdk"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/design-system/components/Dialog/dialog"
import { MenuItem, MenuGroup, type MenuItemProps } from "@/design-system/components/Menu/menu-item"
import { ICON_SIZE } from "@/design-system/tokens/uiSize/icon-size"
import { ScrollArea } from "@/design-system/components/ScrollArea/scroll-area"
import { CircularProgress } from "@/design-system/components/CircularProgress/circular-progress"
import { RowSizeProvider, useRowSize } from "@/design-system/patterns/element-anatomy/item-anatomy"
import { dispatchRelayedKey, markPointerGrab, useCursorMover } from "@/design-system/hooks/use-input-modality"
import { isOwnPointerTarget, keepFocusOnPointerPress } from "@/design-system/lib/pointer-press"
import { isImeComposing } from "@/design-system/lib/ime-composition"
// 「列上有小按鈕的一串」鍵盤路線的唯一判定(與 Sidebar / TreeView / FileUpload 共用;見下方 routeCommandRowKeys)
import {
  isTextEntryElement,
  listRovingControls,
  removeRovingControlsFromTabOrder,
  resolveRovingKey,
  scopeRovingSelector,
} from "@/design-system/lib/roving-list-keyboard"

type CommandSize = 'sm' | 'md' | 'lg'

/**
 * Command root —— 尺寸(sm / md / lg)在這裡進入 RowSizeProvider,搜尋列 / 項目 / 群組標題 / 空狀態全部從
 * context 取得同一個 size(2026-09-08 之前 CommandGroup 的字串 heading 永遠是 md 列高)。
 * 不自帶 surface / radius:殼(PopoverContent / DialogContent / inline 的邊框容器)才是 surface 的 owner。
 */
/** CommandEmpty 把它的字串文字登記到根,根的 live region 才有東西可播(見 Command root 註解)。 */
const EmptyTextContext = React.createContext<((text: string | null) => void) | null>(null)

// ── 鍵盤:列上可聚焦的東西(2026-09-25 待辦總帳 B9「路線乙」)──
// 決策出處 = governance/planning/2026-09-25-interaction-and-hover-remediation.md B9(該列點名「AI 面板對話紀錄列」與「多選找人頭像」,
// 兩者都是 cmdk 清單的列),user 逐字(附條件同意,條件查證成立記在同列):「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」。
// 規則 SSOT = ds-canonical/references/keyboard-model-canonical.md「列上有小按鈕的一串」;按鍵表住 command.spec.md「A11y」;
// 判定 = lib/roving-list-keyboard.ts `resolveRovingKey`(2026-09-26 與 Sidebar / TreeView / FileUpload 四份合一,同檔〇節「按鍵規則合併」)。
// 2026-09-25 前:列裡的東西(AgentPanel 歷史列的改名 / 刪除、SelectMenu 人員選項的頭像名片)每一個都各佔一站。
//
// cmdk 清單的「目前這一項」= 反白列(虛擬游標),DOM 焦點平常停在搜尋框(沒有搜尋框時停在清單)——這個位置叫 home。
// 所以路線乙的「焦點在項目上」= 焦點在 home、反白在那一列(AI 推導)。判定與其他三個宿主同一份,只有**執行**不同
// (反白由 cmdk 自己搬,本檔不代搬):
//   - home 上只接「→ 進反白列的第一個東西」;其餘鍵(↑↓ / Home / End / Enter / 打字)全部照舊交給 cmdk 與搜尋框。
//   - 列裡的東西上:換項類(↑↓ / Home / End)與 Tab 都是「回 home、**不擋預設**」—— cmdk 接著照常移反白 /
//     瀏覽器接著從 home 往下 / 往上走一站 = 一下離開這一串(同 Sidebar 的 Tab)。
//   - Enter / Space 在列裡的東西上屬於那個東西(按鈕照常啟動),不是「選這一列」—— cmdk 根的 Enter 要看 defaultPrevented 才不選列,
//     所以這裡擋預設後自己 click 按鈕 / 連結(全 DS 唯一一處;AgentPanel 歷史列原本另寫一份,2026-09-26 收回這裡)。
//   - Esc 不接(規範「本檔不規定」),照舊由外殼(Popover / Dialog)處理。
// 只有列裡真的有可聚焦東西的清單才受影響;今天全 DS 只有 AgentPanel 歷史列與 SelectMenu 帶名片頭像的人員選項(PeoplePicker)。

// 不用 `:is()`:舊版 jsdom(單元測試)不認得
const COMMAND_ROW_CONTROLS_IN_ITEM = scopeRovingSelector('[cmdk-item]')

/** 列裡的東西一律不在 Tab 路上。只在值不同時才寫(同值 setAttribute 也會產生 mutation,會讓 observer 自我觸發)。 */
function syncCommandRowTabStops(root: HTMLElement) {
  removeRovingControlsFromTabOrder(root.querySelectorAll<HTMLElement>(COMMAND_ROW_CONTROLS_IN_ITEM))
}

function routeCommandRowKeys(event: React.KeyboardEvent<HTMLDivElement>) {
  if (isImeComposing(event)) return // 判準唯一住所 lib/ime-composition.ts(2026-09-30 前只看 isComposing)
  const root = event.currentTarget
  const target = event.target as HTMLElement
  const input = root.querySelector<HTMLInputElement>('[cmdk-input]')
  const home = input ?? root.querySelector<HTMLElement>('[cmdk-list]') ?? root
  const itemEl = target.closest('[cmdk-item]')
  const atHome = !itemEl && (target === input || target.hasAttribute('cmdk-list') || target.hasAttribute('cmdk-root'))
  if (!itemEl && !atHome) return
  // 「這一項」:焦點在列裡時就是那一列;在 home 時是反白列
  const current = itemEl ?? getActiveOption(root)
  const controls = current ? listRovingControls(current) : []
  if (itemEl && !controls.includes(target)) return
  const onInput = !itemEl && target === input
  const action = resolveRovingKey({
    key: event.key,
    focus: itemEl ? 'control' : 'item',
    controlCount: controls.length,
    controlIndex: itemEl ? controls.indexOf(target) : -1,
    controlIsTextEntry: !!itemEl && isTextEntryElement(target),
    itemIsTextEntry: onInput,
    caretAtEnd: onInput ? input!.selectionStart === input!.value.length && input!.selectionEnd === input!.value.length : true,
    defaultPrevented: event.defaultPrevented,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  })
  // home 上:反白由 cmdk 管,本檔只接「→ 進反白列的第一個東西」
  if (!itemEl) {
    if (action.type === 'control') {
      event.preventDefault()
      controls[action.index]?.focus()
    }
    return
  }
  switch (action.type) {
    case 'control':
      event.preventDefault()
      controls[action.index]?.focus()
      return
    case 'item':
      event.preventDefault()
      home.focus()
      return
    case 'consume':
      event.preventDefault()
      return
    case 'item-prev':
    case 'item-next':
    case 'item-first':
    case 'item-last':
    case 'leave':
      // 回 home、不擋預設:cmdk 接著移反白 / 瀏覽器接著從 home 往外走一站
      home.focus()
      return
    case 'activate-control':
      event.preventDefault()
      if (target.matches('button, a[href]')) target.click()
      return
    default:
      return
  }
}

// ── 指標按在清單上:DOM 焦點留在控制這份清單的 combobox(2026-09-30)──
// user 同意的範圍(原話「其他部分我覺得”可以”」):**滑鼠點選項 = 按 Enter**,焦點不離開搜尋框。延伸到清單裡其他不是控件的位置
// (群組標題、訊息列、放大鏡、捲軸)與清單型浮層裡的按鈕(全選)屬 AI 推導,依 rc-select / MUI 整份清單擋 mousedown 的做法。
// 規則與出處住 command.spec.md「A11y 預設」;選單的「選完之後」總表住 SelectMenu/select-menu.spec.md「A11y 預設」Focus 段。
// 根因:cmdk 的選項只有 onPointerMove / onClick、沒有擋 mousedown
// (https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L706-L718),
// 按下去瀏覽器就把焦點交給最近的可聚焦祖先([cmdk-list] / [cmdk-root] 都是 tabIndex -1;人員選項的名片頭像也是),之後打的字全部丟掉。
// 掛在 Command 根 = 選項、群組標題、訊息列(沒有選項 / 載入中)、搜尋列的放大鏡、清單捲軸一處涵蓋。
// **只在「此刻握著 DOM 焦點的是控制這份清單的 combobox」時擋**:焦點在 role=combobox 上(或它裡面的輸入框),它的 aria-controls
// 指到本 Command 或包住本 Command 的浮層。焦點本來就在清單裡(不可打字的下拉)、或這份清單不屬於任何 combobox
// (Popover / Dialog 裡的純清單)→ 不插手,原生行為照舊。
// 握著焦點的東西住在哪,決定容器裡的按鈕怎麼算(W3C 依「彈出的是什麼」分流,select-menu-keyboard.ts B11 段同一條):
//   住在本 Command 裡(浮層內搜尋框 [cmdk-input] / CommandDialog / inline = 對話框型,面板裡的按鈕在同一個 Tab 序上)
//     → 容器裡自有行為的東西照原生(列上的改名 / 刪除鈕、全選鈕照常拿焦點;判準與 Field 外框同一份 lib/pointer-press.ts);
//   住在外面(觸發欄位內的搜尋框 = 清單型:DOM 焦點的主人是欄位內的搜尋框,清單靠它的 aria-activedescendant;浮層裡的全選鈕雖可 Tab,
//     但只有觸發欄位是頁面最後一格時 Tab 才會照 DOM 順序走進來)→ 連按鈕(全選)也不搬焦點,click 照常動作。
function comboboxFocusHolder(root: HTMLElement): Element | null {
  const doc = root.ownerDocument
  const active = doc.activeElement
  const combobox = active?.closest('[role="combobox"][aria-controls]')
  if (!active || !combobox) return null
  const controlsRoot = (combobox.getAttribute('aria-controls') ?? '').split(/\s+/).some((id) => {
    const controlled = id ? doc.getElementById(id) : null
    return !!controlled && (controlled.contains(root) || root.contains(controlled))
  })
  return controlsRoot ? active : null
}

function keepComboboxFocusOnPointerPress(event: React.MouseEvent<HTMLDivElement>) {
  const root = event.currentTarget
  const holder = comboboxFocusHolder(root)
  if (!holder) return
  if (root.contains(holder) && event.target instanceof Element && isOwnPointerTarget(root, event.target)) return
  // 其餘條件(左鍵、沒被擋過、按在本 Command 的 DOM 裡 —— React 事件會穿過 portal 冒泡、不是文字輸入)住在共用判準
  keepFocusOnPointerPress(event, root, holder)
}

// ── 浮層收起後焦點還給開啟者(2026-09-30)── 規則與唯一實作住 lib/overlay-focus-return.ts(`returnFocusToOpener`):
// 包著 Command 的浮層(SelectMenu、AgentPanel 歷史、下方 CommandDialog)在 onCloseAutoFocus 呼叫它;指標挑選收起時明說 focusVisible: false,
// 因為上一條讓焦點留在搜尋框(文字輸入永遠帶 :focus-visible),程式移走焦點時瀏覽器會讓新的那一個也畫框。

// ── 反白(cmdk 游標)的唯一讀法與寫法,以及「游標不准弄丟」(2026-09-30)──
// cmdk 的游標 = state.value,畫在那一列的 `data-selected="true"`
// (https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L681 與 #L716)。
// 這是反白列 id 的**唯一來源**:搜尋框(浮層內 [cmdk-input] / 觸發欄位內的輸入框)與清單的 aria-activedescendant、
// 列上按鈕的鍵盤路(routeCommandRowKeys)、SelectMenu 的 Tab / 空白鍵選定(select-menu-keyboard.ts)都從這裡讀(getActiveOption)。
// 不用 cmdk 自己的 selectedItemId(#L251-L254 在排程裡算、#L814 / #L866 綁上 [cmdk-input] / [cmdk-list]):
// 開啟時它是空的,要等第一次方向鍵才有值 —— 2026-09-30 實測 Select / Combobox / SelectMenu 開啟即讀為 null,同時已有一列 data-selected。
const ACTIVE_OPTION_SELECTOR = '[cmdk-item][data-selected="true"]'
const SELECTABLE_OPTION_SELECTOR = '[cmdk-item]:not([aria-disabled="true"])'

/** 反白列(cmdk 游標所在的那一列);沒有反白 → null。全 DS 讀反白只走這一支。 */
export function getActiveOption(root: ParentNode | null | undefined): HTMLElement | null {
  return root?.querySelector<HTMLElement>(ACTIVE_OPTION_SELECTOR) ?? null
}

/** Command 回報給「清單外面」握著焦點的輸入框的東西:反白列 id + 清單([cmdk-list],role=listbox)的 id。 */
export interface CommandActiveOption {
  /** 反白列的 DOM id;清單 0 筆 / 沒有反白 → undefined */
  id: string | undefined
  /** 清單([cmdk-list])的 DOM id —— aria-activedescendant 指到的選項住在它裡面 */
  listboxId: string | undefined
}

/**
 * aria-activedescendant 的唯一寫法(Command 自己的搜尋框 / 清單;觸發欄位內輸入框經 `applyListboxRelation` 也走這支)。直接寫 DOM、不經 React state:
 * 反白每移一格不重繪整份清單(MUI useAutocomplete 同做法,`syncHighlightedIndexToDOM` 直接 setAttribute,
 * https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L375-L388)。
 * 值相同不寫(同值 setAttribute 也會產生 mutation,會讓下方 observer 自我觸發)。
 */
function applyActiveDescendant(host: Element | null | undefined, id: string | undefined) {
  applyIdRef(host, 'aria-activedescendant', id)
}

function applyIdRef(host: Element | null | undefined, name: 'aria-activedescendant' | 'aria-controls', id: string | undefined) {
  if (!host || (host.getAttribute(name) ?? undefined) === id) return
  if (id) host.setAttribute(name, id)
  else host.removeAttribute(name)
}

/**
 * 清單**外面**握著焦點的輸入框(Select `searchable` / Combobox `searchIn='trigger'` 觸發欄位內的搜尋框)的唯一寫法:
 * aria-activedescendant = 反白列、aria-controls = 包住它的 listbox。ARIA 1.2 對 aria-activedescendant 的 MUST:
 * 指到的元素必須是自己的後代,或自己是 combobox / textbox / searchbox 而且 aria-controls 指到支援 aria-activedescendant 的元素
 * (https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant)—— 那顆輸入框是 textbox,只寫前者等於指向一個跟它沒有關係的節點。
 * 外層 div[role=combobox] 的 aria-controls 指的是浮層殼(role=dialog,不支援 aria-activedescendant),補不上這一層。
 * 清單卸載(`active` = undefined)時兩個一起移除(id 必須指向畫面上存在的節點)。
 */
export function applyListboxRelation(host: Element | null | undefined, active: CommandActiveOption | undefined) {
  applyIdRef(host, 'aria-activedescendant', active?.id)
  applyIdRef(host, 'aria-controls', active?.listboxId)
}

/**
 * 把游標放到第一個可選項 —— 走 cmdk 自己的 Home 鍵(#L617-L621 `updateSelectedToIndex(0)`:選第一項 + 捲進可視範圍);
 * 代發用 hooks/use-input-modality.ts `dispatchRelayedKey`(與 forwardKeyToListbox 同一座橋),不被記成「鍵盤搬了游標」。
 * cmdk 沒有公開的「選第一項」API;改用受控 `value` 會讓捲動與 selectedItemId 的時序錯開,不採。
 */
export function moveCursorToFirstOption(root: HTMLElement) {
  dispatchRelayedKey(root, 'Home')
}

/**
 * 游標弄丟了就放回第一項。cmdk 自己有這條修補(被反白的那一列卸載 → 選第一項,#L321-L333),但它的排程以槽號當 Map 的 key
 * (#L1046-L1058 `fns.current.set(id, cb)`),同一次 commit 卸載好幾列時只剩**最後一列**的檢查會跑 —— 反白列不是最後卸載的那一列就沒人補。
 * 會一次卸載很多列的正是搜尋字在觸發欄位(清單在 cmdk 外面過濾)與遠端搜尋換一批結果:實測 Select 打「日」後 0 列反白、Enter 沒反應(2026-09-30)。
 */
function restoreLostCursor(root: HTMLElement): boolean {
  if (getActiveOption(root) || !root.querySelector(SELECTABLE_OPTION_SELECTOR)) return false
  moveCursorToFirstOption(root)
  return true
}

/**
 * Command 根的 observer —— 列會隨搜尋過濾重掛、列裡的東西(如頭像名片)也可能自己重繪、反白會被滑鼠 / 鍵盤搬動、
 * cmdk 每次重繪都會把自己那份(可能是空的)aria-activedescendant 寫回去,所以用 MutationObserver 收,不靠某一次 render。
 * 同一個 observer 管三件事:
 *   (1) 列上可聚焦東西不在 Tab 路上(B9,syncCommandRowTabStops)
 *   (2) 游標弄丟時放回第一項(restoreLostCursor)
 *   (3) 反白列 id → 寫上本 Command 的搜尋框與清單,並連同清單 id 回報給觸發欄位內握著焦點的輸入框
 *       (onActiveOptionChange;卸載時回報 undefined)
 */
function useCommandRootObserver(
  rootRef: React.RefObject<HTMLDivElement | null>,
  onActiveOptionChange: ((active: CommandActiveOption | undefined) => void) | undefined,
) {
  const onActiveOptionChangeRef = React.useRef(onActiveOptionChange)
  onActiveOptionChangeRef.current = onActiveOptionChange
  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    let reported: CommandActiveOption | undefined
    const syncActiveOption = (repair: boolean) => {
      if (repair && restoreLostCursor(root)) return // cmdk 搬好游標後 data-selected 會變,observer 會再進來一次
      const id = getActiveOption(root)?.id || undefined
      root.querySelectorAll('[cmdk-input], [cmdk-list]').forEach((host) => applyActiveDescendant(host, id))
      const listboxId = root.querySelector('[cmdk-list]')?.id || undefined
      if (reported && reported.id === id && reported.listboxId === listboxId) return
      reported = { id, listboxId }
      onActiveOptionChangeRef.current?.(reported)
    }
    syncCommandRowTabStops(root)
    // 掛上的這一刻 cmdk 的第一個反白還在它自己的排程裡(列註冊後才選第一項 / 已選項)→ 只讀不補;下一格畫面 cmdk 已定,再讀一次並補
    syncActiveOption(false)
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => syncActiveOption(true)) : 0
    if (typeof MutationObserver === 'undefined') return () => cancelAnimationFrame(raf)
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' || r.attributeName === 'tabindex')) syncCommandRowTabStops(root)
      syncActiveOption(true)
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'data-selected', 'aria-activedescendant'] })
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      if (reported !== undefined) onActiveOptionChangeRef.current?.(undefined)
    }
  }, [rootRef])
}

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive> & {
    size?: CommandSize
    /**
     * 反白列(cmdk 游標)的 DOM id 或清單 id 變了就回報(`CommandActiveOption`);卸載時回報 undefined。給**觸發欄位內**握著焦點的輸入框
     * (Select `searchable` / Combobox `searchIn='trigger'`)寫 aria-activedescendant + aria-controls(`applyListboxRelation`)——
     * 它與清單分屬兩棵 DOM 子樹(清單在浮層 portal 裡),只能由這裡讀了交出去(SelectMenu 轉發,接收端
     * SelectMenu/select-menu-keyboard.ts `useActiveDescendant`)。本 Command 自己的搜尋框與清單不必接,已自動寫好。
     */
    onActiveOptionChange?: (active: CommandActiveOption | undefined) => void
  }
>(({ className, size, children, onKeyDown, onMouseDown, onActiveOptionChange, ...props }, ref) => {
  // 列上可聚焦東西的鍵盤路(B9,見上方 routeCommandRowKeys 段):根節點要拿來掛 observer
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const setRootRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
    },
    [ref],
  )
  // 列上可聚焦東西的 Tab 停靠(B9)+ 游標弄丟時放回第一項 + 反白列 id(見 useCommandRootObserver)
  useCommandRootObserver(rootRef, onActiveOptionChange)
  const inherited = useRowSize('md')
  // 0 筆結果的讀屏播報住在根(2026-09-09 user 核准「第二項如果確保是SSOT且不違背世界級的設計就照你建議做」):
  // live region 必須一直掛著才會播(新掛上、已帶文字的 live region 讀屏器多半不念;react-select A11yText / Downshift
  // status message 都由根元件常駐渲),文字由 CommandEmpty 的字串 children 登記進來。之前只有 SelectMenu 自己另放一份
  // CommandEmptyStatus,CommandDialog / inline Command 沒有(command.spec.md 卻寫「都渲一份」);現在三種形態都由根
  // 自動渲一份,消費端不必、也不得再放(放了會播兩次)。
  const [emptyText, setEmptyText] = React.useState<string | null>(null)
  return (
    <RowSizeProvider value={size ?? inherited}>
      <EmptyTextContext.Provider value={setEmptyText}>
        <CommandPrimitive
          ref={setRootRef}
          // 指標按在清單上不搬走 combobox 的焦點(見上方 keepComboboxFocusOnPointerPress);consumer 的 onMouseDown 先跑,擋了預設就不接
          onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
            onMouseDown?.(event)
            keepComboboxFocusOnPointerPress(event)
          }}
          // consumer 的 onKeyDown 先跑(它擋了預設就不接);再跑列上可聚焦東西的鍵盤路(B9);cmdk 自己的方向鍵處理最後跑
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            onKeyDown?.(event)
            routeCommandRowKeys(event)
          }}
          // @focus-suppress A — 程式游標:SelectMenu 非搜尋模式把 DOM 焦點放在 cmdk 殼上
          // (select-menu.tsx handleNonSearchableAutoFocus),cmdk 之後再把焦點搬到 [cmdk-list];
          // 承擔者:CommandItem 的 data-[selected=true]:focus-ring-inset(下方 CommandItem 的 cursorByKeyboard 分支;原寫行號 331 已過期)畫在游標項上。
          // 2026-09-10 實測:殼的框今天畫不出來(PopoverContent overflow-hidden 把 +2px 整條裁掉,
          // 逐像素 0),但 computed style 確實有 outline —— 殼一旦被放進不裁切的宿主就會現形,先抑制掉。
          className={cn("flex h-full w-full flex-col overflow-hidden text-foreground outline-none", className)}
          {...props}
        >
          {children}
          <CommandEmptyStatus text={emptyText ?? ''} />
        </CommandPrimitive>
      </EmptyTextContext.Provider>
    </RowSizeProvider>
  )
})
Command.displayName = CommandPrimitive.displayName

/**
 * CommandDialog —— Cmd+K 指令面板。內容**就是** SelectMenu 那一套(同一個 CommandInput 搜尋列、
 * 同一個 MenuItem 項目、同一個 MenuItem header 分組),殼是 DS Dialog。
 * 2026-09-08 刪掉這裡對 cmdk 的 8 條 `[&_[cmdk-…]]` 尺寸覆寫(input h-12 / item py-3 / svg h-5 …)——
 * 它們就是 user 抓到的「Command 每一支 story 都跟 SelectMenu 不同一套」的來源:同一個 primitive
 * 在面板裡被第二份樣式改寫。世界級的指令面板(Linear / Raycast / VS Code)也都是「同一份清單樣式 + 對話框殼」。
 * 指令面板依世界級慣例不畫可見標題;`title` 只給讀屏器(Radix 要求 DialogContent 有 Title)。
 */
const CommandDialog = ({ children, title = '指令面板', label = '搜尋指令', ...props }: DialogProps & { title?: string; label?: string }) => { // i18n-allow: DS 預設文案,可覆寫
  // 關閉後焦點還給**開啟當下握著焦點的元素**(2026-09-30;dialog.spec.md「Focus return:關閉時焦點返回 trigger 元素」)。
  // 指令面板多半由快捷鍵或普通按鈕的 onClick 開啟,沒有 DialogTrigger;Radix Dialog 只還給 DialogTrigger,沒有就不還 → 焦點掉到 body
  // (2026-09-30 實測本檔「全域指令面板」:點項目收起後 activeElement = BODY)。
  // 2026-10-01 起這是 DialogContent 的**預設**(待辦總帳 OE29;dialog.tsx useTriggerlessFocusReturn:掛上時記開啟者、沒有 Radix 觸發點就經
  // lib/overlay-focus-return.ts 還,指標挑選不畫鍵盤框),本檔那份 RememberFocusOrigin 收掉,不留第二份。
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-[var(--elevation-200)]" autoHeight>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {/* data-dialog-body:讓 DialogContent 的 onOpenAutoFocus 把焦點放進搜尋列(它只認 [data-dialog-body] 內的
            第一個 input)。2026-09-09 實測:沒有這個標記時焦點停在 dialog 殼上 —— 方向鍵到不了 cmdk(開了就是鍵盤死路,
            WCAG 2.1.1),而且殼在鍵盤模態下會被全域 :focus-visible 外描邊畫一圈(浮層殼不該畫框,focus-canonical E 類)。 */}
        <Command label={label} data-dialog-body>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/**
 * CommandInput —— 浮層/面板內的搜尋列。**唯一實作**:SelectMenu(Select / Combobox / PeoplePicker 的 searchable
 * 模式)、CommandDialog、inline Command 三種形態都用它(2026-09-08 之前 SelectMenu 自己另寫一份 raw cmdk input,
 * 這裡又一份 h-11 的,兩份漂移 —— user:「搜尋框為何不是我們的 input 的樣式?儘管是不同元件也要是相同樣式的 SSOT」)。
 * 尺寸/字級/placeholder/disabled 全部吃 Field 輸入控件的 token(`--field-height-*` + 8px 內距、text-body(-lg)、
 * placeholder:text-fg-muted、disabled 依 M24 切 fg-disabled);**沒有外框**(它是浮層內的一列,底部用分隔線收邊),
 * 這是跟 `Input` 唯一的差別 —— 對齊 Linear / Raycast / Spotlight 的指令面板搜尋列。
 */
const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>, 'size'> & {
    size?: CommandSize
    // 2026-09-09 user 拍板:搜尋列**沒有** `loading` prop 了 —— 選項載入的指示只在清單內(CommandEmpty 槽的 CommandLoading),
    // 搜尋列不為抓資料轉圈(2026-09-08 曾加、同日 user 抓到兩顆轉圈、09-09 退役;Polaris Autocomplete loading 時 TextField 也不轉)。
  }
>(({ className, size: sizeProp, ...props }, ref) => {
  const inherited = useRowSize('md')
  const size = sizeProp ?? inherited
  return (
  <div
    className={cn(
      'flex shrink-0 items-center gap-2 px-3 py-1 border-b border-divider',
      size === 'lg' ? 'min-h-[calc(var(--field-height-lg)+8px)]'
        : size === 'sm' ? 'min-h-[calc(var(--field-height-sm)+8px)]'
        : 'min-h-[calc(var(--field-height-md)+8px)]',
    )}
    cmdk-input-wrapper=""
  >
    <Search size={ICON_SIZE[size]} className="shrink-0 text-fg-muted" aria-hidden />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        // @focus-suppress B — B Field 家族輸入控件;承擔者:插入點(caret)本身;列底的分隔線不是焦點指示
        'flex w-full bg-transparent outline-none placeholder:text-fg-muted',
        // M24 disabled state precedence:disabled 時 placeholder 切 fg-disabled(audit dim 34)
        'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled disabled:cursor-not-allowed',
        size === 'lg' ? 'text-body-lg leading-compact' : 'text-body leading-compact',
        className,
      )}
      {...props}
    />
  </div>
)
})

CommandInput.displayName = CommandPrimitive.Input.displayName

/**
 * CommandList — cmdk primitive 外包 ScrollArea 跨 OS scrollbar 一致。
 *
 * Verified against cmdk/dist/index.js(2026-04-25):cmdk selected-item auto-scroll
 * 用標準 `Element.scrollIntoView({block:"nearest"})`,browser 向上找 nearest
 * scrollable ancestor → 命中 ScrollArea.Viewport(`overflow:hidden scroll`)→ 自動
 * 捲入 selected ✓。不需 MutationObserver sync。
 *
 * `cmdk-list-sizer` ResizeObserver 只量 offsetHeight 設 CSS var `--cmdk-list-height`
 * (純測量,非 scroll logic),wrap 不影響。
 *
 * 跨 DS 一致:DataTable / Sheet / Sidebar / DropdownMenu / Command 皆走 ScrollArea。
 */
const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, label = '選項', ...props }, ref) => ( // i18n-allow: DS 預設 listbox 名稱(cmdk 預設是英文 Suggestions)
  /* @story-baseline: overlay-surface.spec.md#Viewport-aware-scroll-chain-invariant(M25 SSOT owner)
      owner spec: overlay-surface.spec.md「SurfaceBody」+ overlay-chrome-sizing.spec.md「為什麼 SurfaceHeader 是 padding-based」(2026-09-27 拆檔前 = overlay-surface.spec.md:34/53/347-362)—— 「浮層 body 永遠 flex-1 min-h-0 overflow-y-auto;
        中間 wrapper 都必 flex flex-col h-full min-h-0;viewport 太小 body 內壓縮捲動」。
      conflicting code(修前): 本 ScrollArea 固定 max-h-300 無 flex-1 → 在夾住的 SelectMenu PopoverContent
        (max-h=available-height)內撐破外殼、底部選項被裁(320px viewport 實測 bottom 425 > 320 溢出)。
      修: 加 flex-1 min-h-0(對齊 M25 canonical + HoverCard/Popover),max-h-300 降為上限。Command root 已
        `flex h-full flex-col`(command.tsx:23)= chain 完整;非 flex 容器內 flex-1 為 no-op(spec:34 backward compat)。 */
  <ScrollArea className="flex-1 min-h-0 max-h-[var(--menu-max-height)]">
    {/* @focus-suppress A — 同 Command 根:cmdk 1.1.1 在第一次方向鍵後把 DOM 焦點搬到 list
        (`document.getElementById(listId).focus()`),殼同樣不該畫框;承擔者:CommandItem 的
        data-[selected=true]:focus-ring-inset(下方 CommandItem 的 cursorByKeyboard 分支;原寫行號 331 已過期)。 */}
    <CommandPrimitive.List ref={ref} label={label} className={cn("overflow-x-hidden outline-none", className)} {...props} />
  </ScrollArea>
))

CommandList.displayName = CommandPrimitive.List.displayName

/**
 * CommandEmpty —— **own 空狀態**(2026-09-08 user 拍板定稿:選單裡「不是選項的列」一律走 MenuItem 的列幾何)。
 * 字串 children 自動包 `<MenuItem message>`(非互動、次要色、字級同選項、置中),外層是 `MenuGroup`(一個 group 的 py-2 上下留白),
 * 所以「沒有結果」與「1 筆結果」等高(md 48px = 8 + 32 + 8),不再有任何最小高度公式(舊的 3 列 minRows 已退役)。
 * owner:select-menu.spec.md「Empty state」;歷史:2026-04-08 一行小字 → 04-10 撐 3 列 → 04-16 Empty 元件 → 09-08 訊息列。
 * loading 時把 `<CommandLoading>` 當 children 放進來(同一種訊息列,前綴槽放列圖示尺寸的轉圈)。
 * **放在 CommandList 外面(listbox 的兄弟,MUI Autocomplete 同構)**:axe `aria-required-children` 不允許 listbox 裡有非 option 的子元素
 * (2026-09-08 a11y 基線重建抓到);cmdk Empty 只讀 store,不需要住在 List 裡。空 listbox 載入時有 aria-busy,axe 全乾淨。
 */
const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty> & { size?: CommandSize }
>(({ className, children, size: sizeProp, ...props }, ref) => {
  const inherited = useRowSize('md')
  const size = sizeProp ?? inherited
  // 字串訊息登記到 Command 根的 live region(sr-only;根一直掛著)。元素 children(如 CommandLoading,自帶 role="status")
  // 不登記,避免同一狀態播兩次。本元件本身一直掛著(cmdk Empty 只在 0 筆時渲內容),所以 effect 不受筆數影響。
  const setEmptyText = React.useContext(EmptyTextContext)
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null
  React.useEffect(() => { setEmptyText?.(text); return () => setEmptyText?.(null) }, [text, setEmptyText])
  // 訊息列也住在群組裡(item-anatomy.spec.md「Group auto-separation」Pattern A:Command.List 沒有留白,8px 邊界留白
  // 只由群組提供;SelectMenu 的選項永遠在群組裡,連可建立列也是)。用 MenuGroup(不經 cmdk Group 註冊,Empty 槽只在
  // 0 筆時顯示、不需要 cmdk 的群組過濾)。
  return (
    <CommandPrimitive.Empty ref={ref} className={className} {...props}>
      <MenuGroup>
        {typeof children === 'string' || typeof children === 'number'
          ? <MenuItem size={size} message>{String(children)}</MenuItem>
          : children}
      </MenuGroup>
    </CommandPrimitive.Empty>
  )
})

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

/**
 * 載入中訊息列:與「沒有結果」同一種 `MenuItem message`,前綴槽放列圖示尺寸的 CircularProgress(sm/md 16、lg 20;
 * circular-progress.spec.md「Size canonical」:跟欄位高度有關的容器對齊該容器的圖示尺寸)+ 可見文字(label),整組置中。
 * `role="status"` 讓讀屏器直接播報文字;不經 Empty(empty.spec.md「禁止事項」)。放進 CommandEmpty 當 children。
 * 只在清單裡沒有任何可顯示的選項時才會被看到(cmdk Empty 槽)—— 這是選項載入**唯一**的指示(2026-09-09 user 拍板:
 * 搜尋列 / 觸發點不為選項轉圈;觸發點的轉圈是 Field 家族 `loading` = 這個值在讀取 / 驗證 / 儲存,另一件事)。
 */
function CommandLoading({ label, size: sizeProp }: { label: string; size?: CommandSize }) {
  const inherited = useRowSize('md')
  const size = sizeProp ?? inherited
  return (
    <MenuItem size={size} message role="status" startContent={<CircularProgress size={ICON_SIZE[size]} />}>
      {label}
    </MenuItem>
  )
}

// ── SR live status(2026-07-05 D4 於 SelectMenu 落地;2026-09-08 搬進 Command;2026-09-09 改由 Command 根自動渲一份,
//    文字來自 CommandEmpty 的字串 children —— 消費端(SelectMenu / CommandDialog / inline)不必也不得再放,放了會播兩次)──
// cmdk CommandEmpty 渲染為 role="presentation" div、cmdk 全鏈無 aria-live,且 DOM focus 停在
// combobox input(aria-activedescendant 虛擬焦點)→ SR 使用者搜尋到 0 結果或 loading 佔位時
// 聽不到任何播報。補 visually-hidden polite live region,鏡射 CommandEmpty 的無結果文字;
// loading 由可見的 CommandLoading `role="status"` + `aria-label` 直接宣告,避免同一狀態重複播報。
// 對齊 react-select A11yText / APG combobox no-results 播報 + empty.spec.md「動態 filter no-results 容器需 aria-live="polite"」。
export function CommandEmptyStatus({ loading = false, text }: { loading?: boolean; text: string }) {
  const filteredCount = useCommandState((state) => state.filtered.count)
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {filteredCount === 0 ? (loading ? null : text) : null}
    </div>
  )
}


/**
 * 分組標題**消費 `MenuItem header`,不自己寫樣式**。
 *
 * 2026-09-07 修(user 抓「Command 群組標題漂移了,照理說應該跟 SelectMenu 同一種設計語言」):
 * 這裡原本手寫 `px-3 py-1.5 text-caption font-medium text-fg-muted` ——
 * 而 SSOT(`patterns/element-anatomy/item-anatomy.spec.md:188`「Row header(分組標題)」)寫的是
 * 「用 `MenuItem header={true}` 模式,`font-medium text-fg-muted` + 與 items **完全相同**的
 * row geometry(同 px / 同 py / **同 text size**)」。
 * 差在字級:手寫的是 `text-caption`(12px),canonical 要求與項目同級(14px)。
 *
 * SelectMenu(`select-menu.tsx:465`)一直是照 SSOT 做的 —— 它傳
 * `heading={<MenuItem size={size} header>…}` 並用 `[&_[cmdk-group-heading]]:p-0` 中和 cmdk 的內距。
 * 所以這不是「兩種設計語言」,是 Command **沒有消費 SSOT**、自己抄了一份走樣的值。
 *
 * 現在改成:consumer 傳字串時由本元件包成 `<MenuItem header>`,樣式完全由 SSOT 決定;
 * consumer 自己傳 element(SelectMenu 那種)則原樣尊重。兩條路徑都不再有手寫值。
 */
const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, heading, ...props }, ref) => {
  const rowSize = useRowSize('md')
  return (
  <CommandPrimitive.Group
    ref={ref}
    // `p-0` 中和 cmdk 對 heading 容器的預設內距 —— 內距由 MenuItem 的 row geometry 提供
    className={cn(
      "overflow-hidden p-0 py-2 text-foreground [&_[cmdk-group-heading]]:p-0",
      // Group auto-separation(item-anatomy.spec.md,Pattern A):前面還有另一個「看得見」的群組時畫上邊線。
      // cmdk 把被搜尋濾掉的群組留在 DOM、加 `hidden`,所以用 :not([hidden]) 排除;consumer 不再手插 CommandSeparator
      // (cmdk 在搜尋字非空時不渲 Separator,手插版會讓可見群組之間沒線 —— 2026-09-08 修)。
      "[[cmdk-group]:not([hidden])~&:not([hidden])]:border-t [[cmdk-group]:not([hidden])~&:not([hidden])]:border-divider",
      className,
    )}
    heading={typeof heading === 'string' || typeof heading === 'number'
      ? <MenuItem size={rowSize} header>{heading}</MenuItem>
      : heading}
    {...props}
  />
)
})

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("h-px bg-divider", className)}
    {...props}
    asChild
  >
    <div role="presentation" />
  </CommandPrimitive.Separator>
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

type CommandItemMenuProps = Pick<MenuItemProps,
  'size' | 'startIcon' | 'startIconClassName' | 'avatar' | 'startContent' | 'description' | 'tag' | 'endContent' | 'selected' | 'checkbox' | 'checked'>
export type CommandItemProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & CommandItemMenuProps & {
  /** 尾端快捷鍵提示(`⌘K`);跟 DropdownMenuItem 的 `shortcut` 同名同樣式(text-caption + tracking-shortcut + fg-muted)。 */
  shortcut?: React.ReactNode
}

/**
 * CommandItem —— 外層 cmdk Item 只負責 cmdk 的反白/停用訊號,**視覺 anatomy 一律由內層 `MenuItem` 承擔**
 * (icon 槽 / label / description / 尾端 tag、endContent、shortcut;owner = item-anatomy.spec.md + menu-item.spec.md)。
 * 這跟 SelectMenu 包 option 的結構完全相同(select-menu.tsx「CommandItem > MenuItem role=presentation」),
 * 所以指令面板、inline 清單、下拉選單三種形態的每一列都長一樣。
 * 相容:SelectMenu 自己傳 `<MenuItem>` 當 children(它要管 checkbox/selected/renderLabel),這時不再包第二層。
 */
const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, children, size: sizeProp, startIcon, startIconClassName, avatar, startContent, description, tag, endContent, shortcut, selected, checkbox, checked, disabled, ...props }, ref) => {
  const inherited = useRowSize('md')
  const size = sizeProp ?? inherited
  const cursorByKeyboard = useCursorMover() === 'keyboard'
  const childIsMenuItem = React.isValidElement(children) && children.type === MenuItem
  const end = shortcut != null ? <CommandShortcut>{shortcut}</CommandShortcut> : endContent
  return (
    <CommandPrimitive.Item
      ref={ref}
      disabled={disabled}
      className={cn(
        // cmdk item 是 <div role="option"> 無 tabIndex,永遠拿不到 DOM 焦點 → 不需要 outline-none;
        // 游標(cmdk data-selected)的長相由下方依反白來歷分流。
        "relative flex cursor-default select-none items-center data-[selected=true]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:text-fg-disabled",
        // 內層 MenuItem 自帶內距與圓角;外層歸零
        "p-0 rounded-none",
        // cmdk 的反白(data-selected)是這裡**唯一的游標**:滑鼠移過就搶走(cmdk Item 的 onPointerMove → select(),
        // https://github.com/pacocoursey/cmdk/blob/main/cmdk/src/index.tsx),鍵盤方向鍵再搶回;
        // 誰最後搬動它就用誰的畫法(focus-canonical 規則一「兩類元件」+ 規則二,user 2026-09-09 拍板「都要畫框,不上底色」):
        //   滑鼠搬的:反白 = hover → 底色、無框。
        //   鍵盤搬的:反白 = 游標 → 框(列撐滿 → 內描邊)、不上底色。
        // **本節點沒有任何 `hover:` 樣式**:滑鼠停著不算搶,鍵盤把反白搬走後,滑鼠停留列的底色要跟著消失
        //(user 2026-09-09:「搶回去之後原本滑鼠的 hover 樣式即會消失直到滑鼠又搶回來才會再出現」;
        // shadcn CommandItem 同樣只畫 data-[selected=true],沒有 hover: —— https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/command.tsx)。
        // 2026-09-08 之前「已選 + 游標」的框沒有模態條件,滑鼠一點開就畫(user 抓到);
        // 2026-09-09 之前未選中的游標列用 hover 同色底(AI 推導自 cmdk 慣例,user 撤回);
        // 2026-09-09 下午之前鍵盤分支多帶一條 `hover:bg-neutral-hover`,滑鼠停留列與鍵盤游標列會同時亮(user 三問抓到)。
        cursorByKeyboard
          ? 'data-[selected=true]:focus-ring-inset'
          : 'data-[selected=true]:bg-neutral-hover',
        // @focus-suppress A — 焦點用 → 進到這一列裡的東西(按鈕 / 名片頭像,B9 路線乙,見上方 routeCommandRowKeys)時,
        //   上一行畫在反白列上的鍵盤框讓給那個東西:一個項目只有一個指示器(focus-canonical「一個項目只有一個指示器」);
        //   承擔者:被聚焦的那個東西自己的全域外描邊(styles/base.css `:focus-visible`)。
        //   特異性 (0,3,0) 高過上一行的 (0,2,0),不靠 Tailwind 排序。
        'data-[selected=true]:has-[:focus-visible]:outline-none',
        // 選中 × 互動疊加(owner:item-anatomy.spec.md「選中 × 互動疊加」,2026-08-11 user 拍板):
        // 選中底色釘住(指標反白也不變);鍵盤游標的框直接疊在上面。
        // 2026-09-08 之前這段只在 SelectMenu / AgentPanel 各手刻一份,CommandItem 自己的 `selected` 是死的。
        selected && 'bg-neutral-selected data-[selected=true]:bg-neutral-selected',
        className
      )}
      {...props}
      // 滑鼠移過 = 指標搶走反白(capture 版不會被 cmdk 覆寫 consumer 的 onPointerMove;座標沒變的補發事件不算)
      onPointerMoveCapture={(e) => { markPointerGrab(e); props.onPointerMoveCapture?.(e) }}
    >
      {childIsMenuItem ? children : (
        <MenuItem
          role="presentation"
          size={size}
          startIcon={startIcon}
          startIconClassName={startIconClassName}
          avatar={avatar}
          startContent={startContent}
          description={description}
          tag={tag}
          endContent={end}
          selected={selected}
          checkbox={checkbox}
          checked={checked}
          disabled={disabled}
          className="w-full !bg-transparent hover:!bg-transparent"
        >
          {children}
        </MenuItem>
      )}
    </CommandPrimitive.Item>
  )
})

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "text-caption tracking-shortcut text-fg-muted",
        className
      )}
      {...props}
    />
  )
}
CommandShortcut.displayName = "CommandShortcut"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const commandMeta = {
  component: 'Command',
  family: 'composite', // 對齊 command.spec.md frontmatter family: composite(SSOT)
  variants: {

  },
  sizes: {

  },
  // 'active' 移除 — cmdk row 僅 data-[selected] highlight,無按壓視覺(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-divider', 'bg-neutral-hover', 'bg-surface-raised', 'bg-transparent'], // 2026-07-04 補:CommandSeparator h-px bg-divider 實際消費
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: ['focus-ring-inset'],
  },
} as const

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandLoading,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
