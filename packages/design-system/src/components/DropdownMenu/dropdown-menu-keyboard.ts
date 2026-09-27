/**
 * @internal — DropdownMenu 的鍵盤接線:選單開著按 Tab、子選單裡按 Esc(2026-09-25 user 拍板,待辦總帳 B10 / B11)。
 * 不進 barrel(只有 dropdown-menu.tsx 消費)。
 *
 * 2026-09-26 從 dropdown-menu.tsx 拆出(該檔 879 行,超過 `scripts/code-quality-audit.mjs` 的 800 行上限;
 * 待辦總帳〇節「dropdown-menu.tsx 879 行超過 800 行上限,拆檔」)。拆法:dropdown-menu.tsx 只留視覺層,
 * 開關狀態 / 觸發點登記 / Tab / Esc 全部住這裡;「從觸發點算下一站」合併進 `lib/focus-after-trigger.ts`(與 SelectMenu 共用一份)。
 *
 * 規則住所 = `ds-canonical/references/keyboard-model-canonical.md`「彈出框開著時的 Tab 與 Esc」,本檔只做機械落地:
 *   Tab / Shift+Tab:收起全部層,從「開啟者」往下 / 往上走一站(= 在開啟者上按 Tab)。
 *     Radix 預設把 Tab 擋掉(@radix-ui/react-menu@2.1.16 dist/index.mjs:305;上游 menu.tsx:570-572
 *     https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/menu/src/menu.tsx#L570-L572)。
 *   子選單 Esc:只關這一層、焦點回上一層那一項(= ←)。Radix 預設關整棵(menu.tsx:1262-1266
 *     https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/menu/src/menu.tsx#L1262-L1266)。
 * user 原話(逐字,附條件同意):選單 Tab「你確定這個符合我們一致的設計語言且不違背世界級的設計就這樣做」;
 * 子選單 Esc「你確定這符合我們一致的設計語言且不違背世界級的設計就這樣做」。
 */
import * as React from 'react'
import { flushSync } from 'react-dom'
import { focusFromTrigger } from '@/design-system/lib/focus-after-trigger'

/** 能拿焦點的元素(判斷「觸發點本身能不能當開啟者」用) */
const FOCUSABLE = 'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]'

/** 選單各層(含收合動畫中還掛著的那層)不是頁面上的一站 */
const isInsideMenu = (el: HTMLElement) => !!el.closest('[data-radix-menu-content]')

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/**
 * 選單的「開啟者」—— Tab 離開時從它算下一站。
 * 觸發點自己能聚焦 → 就是它(一般情況)。觸發點只是透明錨點(AgentFab 右鍵選單:錨點是蓋在按鈕上、aria-hidden 的 span)→
 * 改找「宣告 `aria-controls` 指向本選單」的可聚焦元素(ARIA 的 menu button 關係本來就是這樣寫);再不行才找包住觸發點的可聚焦祖先。
 */
function menuOpener(trigger: HTMLElement | null, content: HTMLElement | null): HTMLElement | null {
  if (!trigger) return null
  if (trigger.matches(FOCUSABLE) && !trigger.matches(':disabled')) return trigger
  const id = content?.id
  if (id) {
    const owner = Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>('[aria-controls]')).find(
      (el) => el !== trigger && (el.getAttribute('aria-controls') ?? '').split(/\s+/).includes(id) && el.matches(FOCUSABLE),
    )
    if (owner) return owner
  }
  return trigger.parentElement?.closest<HTMLElement>(FOCUSABLE) ?? null
}

/** 整個選單(根)共用的鍵盤狀態:誰是觸發點、根內容是哪個元素、這次關閉是不是 Tab 走掉的 */
export interface DropdownMenuKeyboard {
  closeAll: () => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
  contentRef: React.MutableRefObject<HTMLElement | null>
  /** 這次關閉是 Tab 離開 → 焦點已由使用者帶走,關閉時不再自動聚焦(不還觸發點、也不呼叫 consumer 的 onCloseAutoFocus) */
  tabbedOutRef: React.MutableRefObject<boolean>
}
const DropdownMenuKeyboardContext = React.createContext<DropdownMenuKeyboard | null>(null)

/** 每一層(根 / 每個子選單)各一份:「關掉這一層」。子選單已在收合動畫中時,再按 Esc 交給上一層。 */
export interface DropdownMenuLevel {
  closeLevel: () => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
}
const DropdownMenuLevelContext = React.createContext<DropdownMenuLevel | null>(null)

/**
 * 選單開著按 Tab(B11):收起全部層,焦點從開啟者往下 / 往上走一站;頁面上已沒有下一站 → 留在開啟者(X20)。
 * 只處理「焦點就在這一層」按下的 Tab;子層的 Tab 由子層處理,冒泡到上層時已 defaultPrevented。
 */
function handleMenuTab(event: React.KeyboardEvent<HTMLElement>, keyboard: DropdownMenuKeyboard | null) {
  if (!keyboard || event.key !== 'Tab' || event.defaultPrevented) return
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if ((event.target as Element).closest('[data-radix-menu-content]') !== event.currentTarget) return
  const opener = menuOpener(keyboard.triggerRef.current, keyboard.contentRef.current)
  if (!opener) return // 找不到開啟者 → 留給 Radix 預設(不動),總比把焦點丟到頁尾好
  event.preventDefault()
  keyboard.tabbedOutRef.current = true
  // 先同步關掉:modal 選單的 FocusScope 焦點鎖要先解除,否則 focus() 會被拉回選單裡
  flushSync(() => keyboard.closeAll())
  focusFromTrigger(opener, event.shiftKey, isInsideMenu)
}

/** 開關狀態由 DS 這一層擁有、受控地交給 Radix:Tab 離開(B11)與子選單 Esc 傳到根(B10)都要從 DS 這一側關掉選單 */
function useOwnedOpenState(open: boolean | undefined, defaultOpen: boolean | undefined, onOpenChange?: (open: boolean) => void) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const resolvedOpen = open ?? uncontrolledOpen
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, open],
  )
  return [resolvedOpen, setOpen] as const
}

export interface OpenStateProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/** 根:開關狀態 + 鍵盤狀態 + 根這一層的「關掉這一層」(交給 `DropdownMenuKeyboardProvider` 包住 Radix Root)。 */
export function useDropdownMenuRootKeyboard({ open, defaultOpen, onOpenChange }: OpenStateProps) {
  const [resolvedOpen, setOpen] = useOwnedOpenState(open, defaultOpen, onOpenChange)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const contentRef = React.useRef<HTMLElement | null>(null)
  const tabbedOutRef = React.useRef(false)
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) tabbedOutRef.current = false
      setOpen(nextOpen)
    },
    [setOpen],
  )
  const keyboard = React.useMemo<DropdownMenuKeyboard>(
    () => ({ closeAll: () => handleOpenChange(false), triggerRef, contentRef, tabbedOutRef }),
    [handleOpenChange],
  )
  const level = React.useMemo<DropdownMenuLevel>(
    () => ({ closeLevel: () => handleOpenChange(false), triggerRef }),
    [handleOpenChange],
  )
  return { resolvedOpen, handleOpenChange, keyboard, level }
}

/** 子選單:開關狀態 + 「關掉這一層」(B10:Esc 只關最內層、焦點回上一層那一項)。 */
export function useDropdownMenuSubKeyboard({ open, defaultOpen, onOpenChange }: OpenStateProps) {
  const [resolvedOpen, handleOpenChange] = useOwnedOpenState(open, defaultOpen, onOpenChange)
  const parent = React.useContext(DropdownMenuLevelContext)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const level = React.useMemo<DropdownMenuLevel>(
    () => ({
      closeLevel: () => {
        // 這一層已經在收合動畫中(Radix 的 DismissableLayer 還掛著、仍是最上層)→ 這次 Esc 屬於上一層
        if (!resolvedOpen) {
          parent?.closeLevel()
          return
        }
        // 與 Radix 子選單的 ← 同一組動作(上游 menu.tsx:1271-1274 onOpenChange(false) + trigger.focus())
        handleOpenChange(false)
        triggerRef.current?.focus()
      },
      triggerRef,
    }),
    [handleOpenChange, parent, resolvedOpen],
  )
  return { resolvedOpen, handleOpenChange, level }
}

/** 根用:鍵盤狀態 + 根這一層(`useDropdownMenuRootKeyboard` 的回傳值原樣傳進來) */
export function DropdownMenuKeyboardProvider({ keyboard, level, children }: {
  keyboard: DropdownMenuKeyboard
  level: DropdownMenuLevel
  children: React.ReactNode
}) {
  return React.createElement(
    DropdownMenuKeyboardContext.Provider,
    { value: keyboard },
    React.createElement(DropdownMenuLevelContext.Provider, { value: level }, children),
  )
}

/** 子選單用:這一層(`useDropdownMenuSubKeyboard` 的回傳值原樣傳進來) */
export function DropdownMenuLevelProvider({ level, children }: { level: DropdownMenuLevel; children: React.ReactNode }) {
  return React.createElement(DropdownMenuLevelContext.Provider, { value: level }, children)
}

/** 觸發點:記下它,選單開著按 Tab 時從它算下一站(B11) */
export function useMenuTriggerRef<T extends HTMLElement>(ref: React.ForwardedRef<T>) {
  const keyboard = React.useContext(DropdownMenuKeyboardContext)
  return React.useCallback(
    (node: T | null) => {
      if (keyboard) keyboard.triggerRef.current = node
      assignRef(ref, node)
    },
    [keyboard, ref],
  )
}

/** 子選單觸發項:記下它,子選單按 Esc 只關這一層時焦點回到它(B10) */
export function useSubMenuTriggerRef<T extends HTMLElement>(ref: React.ForwardedRef<T>) {
  const level = React.useContext(DropdownMenuLevelContext)
  return React.useCallback(
    (node: T | null) => {
      if (level) level.triggerRef.current = node
      assignRef(ref, node)
    },
    [level, ref],
  )
}

/**
 * 根內容:記下它(觸發點是透明錨點時靠它的 id 找開啟者)、接上 Tab、Tab 離開時擋掉關閉後的自動聚焦。
 * Focus return on close 的其餘情形不 override —— 用 Radix 內建 default(close 時 focus 還 trigger;
 * outside-interaction 例外由 Radix `hasInteractedOutsideRef` 自管;W3C APG menubar「Escape: …return focus to the element…
 * from which the menu was opened」)。唯一例外是 Tab 離開:焦點已由使用者帶到下一站,沒有「關閉後自動聚焦」這回事 →
 * 擋掉 Radix 的還觸發點,也不轉給 consumer 的 onCloseAutoFocus(否則像「還焦點給編輯器」的 consumer 會把焦點拉回去,X21)。
 */
export function useMenuContentKeyboard<T extends HTMLElement>(
  ref: React.ForwardedRef<T>,
  onKeyDown: React.KeyboardEventHandler<T> | undefined,
  onCloseAutoFocus: ((event: Event) => void) | undefined,
) {
  const keyboard = React.useContext(DropdownMenuKeyboardContext)
  const setRef = React.useCallback(
    (node: T | null) => {
      if (keyboard) keyboard.contentRef.current = node
      assignRef(ref, node)
    },
    [keyboard, ref],
  )
  return {
    ref: setRef,
    onKeyDown: (event: React.KeyboardEvent<T>) => {
      onKeyDown?.(event)
      handleMenuTab(event, keyboard)
    },
    onCloseAutoFocus: (event: Event) => {
      if (keyboard?.tabbedOutRef.current) {
        keyboard.tabbedOutRef.current = false
        event.preventDefault()
        return
      }
      onCloseAutoFocus?.(event)
    },
  }
}

/**
 * 子選單內容:Tab 同樣收起全部層、從根的開啟者往下走(W3C「close all menus and submenus」);
 * Esc 只關這一層、焦點回上一層那一項(B10)。preventDefault 讓 Radix 的 rootContext.onClose() 不跑
 *(composeEventHandlers 見 defaultPrevented 就跳過內建 handler);consumer 自己 preventDefault = 不關,照 Radix 慣例。
 */
export function useSubMenuContentKeyboard<T extends HTMLElement>(
  onKeyDown: React.KeyboardEventHandler<T> | undefined,
  onEscapeKeyDown: ((event: KeyboardEvent) => void) | undefined,
) {
  const keyboard = React.useContext(DropdownMenuKeyboardContext)
  const level = React.useContext(DropdownMenuLevelContext)
  return {
    onKeyDown: (event: React.KeyboardEvent<T>) => {
      onKeyDown?.(event)
      handleMenuTab(event, keyboard)
    },
    onEscapeKeyDown: (event: KeyboardEvent) => {
      onEscapeKeyDown?.(event)
      if (event.defaultPrevented || !level) return
      event.preventDefault()
      level.closeLevel()
    },
  }
}
