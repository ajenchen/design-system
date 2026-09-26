/**
 * @internal — 「列上有小按鈕的一串」鍵盤路線的**唯一**判定與執行(2026-09-26 由四份合一)。
 *
 * ── 規則住所 ─────────────────────────────────────────────────────────────────
 * 規則(Tab 換區、方向鍵在區裡走、Esc 退一步)= `ds-canonical/references/keyboard-model-canonical.md`
 * 「列上有小按鈕的一串」;本檔是那張按鍵表**唯一的程式版**,四個宿主只讀自己的 DOM、執行結果:
 *   - `components/Sidebar/sidebar.tsx`        SidebarMenu(真焦點,roving tabindex)
 *   - `components/FileUpload/file-upload.tsx` 內建檔案清單(真焦點,roving tabindex)
 *   - `components/TreeView/tree-view.tsx`      樹狀表格(真焦點 + 樹的展開 / 收合 / 回上一層 + 鍵盤重排)
 *   - `components/Command/command.tsx`         cmdk 清單(「這一項」= 反白列,焦點停在搜尋框 / 清單 = home)
 *
 * ── 決定來源 ─────────────────────────────────────────────────────────────────
 * 路線乙:待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` B9,user 逐字(附條件同意,
 * 條件查證成立記在同列):「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」。
 * 合併與 X1–X7 統一:同檔〇節「09-26 同意清單回覆」,user 逐字:「確保符合我們一致的設計語言且不違背世界級的設計且都有
 * 確保整個ds 是SSOT,避免漂移就照你建議做」—— 同意的清單含「按鍵規則合併」與批次細節 X1–X35,其中
 * X4(按鈕上 Home / End)、X6(列上選單鈕按 ↓)、X7(樹在按鈕上 Shift+Tab)三處「統一成側欄做法」。
 * 2026-09-26 之前這張表有四份平行實作(側欄 / 檔案清單 / 樹 `tree-keyboard-route.ts` / Command),三處互相不一致:
 *   X4 側欄與檔案清單的按鈕上 Home / End 換到頭尾項,樹不處理;
 *   X6 側欄的選單鈕按 ↓ 換下一項,樹讓給按鈕開選單;
 *   X7 側欄在按鈕上 Shift+Tab 一下離開,樹要兩下(先落回本列)—— 違反 B9「Tab 一下離開」。
 *
 * ── 本檔兩層 ─────────────────────────────────────────────────────────────────
 *   (一) 判定(純函式,不碰 DOM):`resolveRovingKey` / `pickRovingTarget` / `pickRovingTabStop`
 *        —— 判定表 `scripts/test-roving-list-keyboard.mjs`(含舊路線對照組)逐格驗。
 *   (二) 宿主共用的 DOM 小工具:列裡可走到的東西、把它們收出 Tab 路、真焦點宿主的執行器 `applyRovingAction`。
 *        Command 是虛擬游標(cmdk 自己搬反白),執行方式不同,在 command.tsx 自己對應 —— 判定仍只讀本檔。
 */

// ════════════════════════════════════════════════════════════════════════════
// (一) 判定
// ════════════════════════════════════════════════════════════════════════════

/** 按鍵發生時,焦點在「這一項」本身,還是這一項裡的某一個東西(小按鈕 / 連結 / 名片頭像…) */
export type RovingFocus = 'item' | 'control'

/** 樹才有的三個狀態;平面清單不傳 = 沒有「先展開」「回上一層」這兩步 */
export interface RovingTreeState {
  hasChildren: boolean
  expanded: boolean
  hasParent: boolean
}

export interface RovingKeyInput {
  /** KeyboardEvent.key */
  key: string
  focus: RovingFocus
  /** 這一項可以用 → 走到的東西數(宿主以 `listRovingControls` 數出來) */
  controlCount: number
  /** focus === 'control' 時焦點在第幾個(0 起算);focus === 'item' 時不讀 */
  controlIndex: number
  /** 焦點所在的東西是文字輸入(輸入框 / 多行框 / 下拉 / 可編輯區):方向鍵、Home / End、Enter / 空白鍵都屬於它自己 */
  controlIsTextEntry?: boolean
  /** 「這一項」本身是文字輸入(只有 Command 的搜尋框):← / Home / End / 打字屬於插入點 */
  itemIsTextEntry?: boolean
  /** itemIsTextEntry 時:插入點已在字尾(且沒有選取範圍)。不在字尾時 → 要留給插入點移動 */
  caretAtEnd?: boolean
  /** 樹的狀態;平面清單不傳 */
  tree?: RovingTreeState
  /** 可以用 Cmd / Ctrl + Shift + 方向鍵重排(只有 draggable 的樹) */
  reorderable?: boolean
  /** 事件已被更外層的捕獲處理程式 preventDefault */
  defaultPrevented: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type RovingReorderKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
export type RovingMove = 'item-prev' | 'item-next' | 'item-first' | 'item-last'

export type RovingKeyAction =
  /** 不處理 —— 交給瀏覽器、插入點或那個東西自己 */
  | { type: 'none' }
  /** 吃掉按鍵(preventDefault)但不動焦點 —— 例:已在最後一顆按鈕上再按 → */
  | { type: 'consume' }
  /** 換到上 / 下 / 第一 / 最後一項(焦點落在項目上;不繞回) */
  | { type: RovingMove }
  | { type: 'expand' }
  | { type: 'collapse' }
  | { type: 'parent' }
  /** 把焦點放到這一項第 index 個東西 */
  | { type: 'control'; index: number }
  /** 焦點回到這一項本身 */
  | { type: 'item' }
  /** Tab / Shift+Tab:焦點先回到這一項(整串唯一的 Tab 停靠點),**不擋預設** —— 瀏覽器接著往下 / 往上走一站 = 一下離開這一串 */
  | { type: 'leave' }
  /** Enter / 空白鍵在項目上:這一項自己的預設動作(樹 = 選取;原生按鈕 = 瀏覽器自己點) */
  | { type: 'activate-item' }
  /** Enter / 空白鍵在項目裡的按鈕 / 連結上:那個東西自己的動作,**不是**「選這一項」 */
  | { type: 'activate-control' }
  /** 鍵盤重排(樹;修飾鍵層,與導覽鍵正交) */
  | { type: 'reorder'; key: RovingReorderKey }

const REORDER_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const isReorderKey = (key: string): key is RovingReorderKey => REORDER_KEYS.includes(key)

/**
 * 按鍵表(規格 SSOT = keyboard-model-canonical.md「列上有小按鈕的一串」;每一格的來歷寫在該格旁):
 *
 * | 鍵 | 焦點在項目上 | 焦點在這一項的東西上 |
 * |---|---|---|
 * | ↑ ↓ | 上 / 下一項 | 回到上 / 下一項(X3,依 Adobe 方向鍵模式;選單鈕也一樣 —— X6 統一成側欄做法) |
 * | Home End | 第一 / 最後一項 | 同左(X4 統一成側欄做法) |
 * | → | 樹裡收著的資料夾先展開;否則進第一個東西;沒有就不動 | 下一個;最後一個停住 |
 * | ← | 樹:展開的先收合、否則回上一層;平面清單:不動 | 上一個;第一個 → 回項目 |
 * | Tab / Shift+Tab | 一下離開這一串 | 同左(X7:先回項目、再由瀏覽器往外走) |
 * | Enter / 空白鍵 | 這一項自己的預設動作 | 那個東西自己的動作 |
 */
export function resolveRovingKey(input: RovingKeyInput): RovingKeyAction {
  const { key } = input
  if (input.defaultPrevented) return { type: 'none' }

  // 鍵盤重排:修飾鍵層,只從項目上發動(tree-view.spec.md「鍵盤重排」,行為不變)
  if (input.focus === 'item' && input.reorderable && (input.metaKey || input.ctrlKey) && input.shiftKey && isReorderKey(key)) {
    return { type: 'reorder', key }
  }
  // 帶 Cmd / Ctrl / Alt 的組合留給瀏覽器、輔助科技與按鈕自己(例:Alt+↓)。Shift 不在內:Shift+Tab 是導覽鍵。
  if (input.metaKey || input.ctrlKey || input.altKey) return { type: 'none' }

  // Tab / Shift+Tab:不論焦點在項目或項目裡的東西上,都是一下離開這一串(B9;X7)
  if (key === 'Tab') return { type: 'leave' }

  // ── 焦點在這一項裡的東西上 ──
  if (input.focus === 'control') {
    // 文字輸入:方向鍵移插入點、Enter / 空白鍵是打字,全部屬於它(原樹的 isButtonLike 例外,現全宿主一致)
    if (input.controlIsTextEntry) return { type: 'none' }
    switch (key) {
      case 'ArrowRight':
        // 已是最後一個 → 不動(W3C 樹狀表格:最右一格按 → 焦點不移動)
        return input.controlIndex < input.controlCount - 1
          ? { type: 'control', index: input.controlIndex + 1 }
          : { type: 'consume' }
      case 'ArrowLeft':
        // 已是第一個 → 回到這一項(B9「← 回項目」)
        return input.controlIndex > 0 ? { type: 'control', index: input.controlIndex - 1 } : { type: 'item' }
      case 'ArrowDown':
        // X6:選單鈕(aria-haspopup)也一樣換下一項 —— 開選單用 Enter / 空白鍵(同側欄帳號列,sidebar.spec.md)
        return { type: 'item-next' }
      case 'ArrowUp':
        return { type: 'item-prev' }
      case 'Home':
        // X4:同側欄 / 檔案清單 —— 換到第一 / 最後一項
        return { type: 'item-first' }
      case 'End':
        return { type: 'item-last' }
      case 'Enter':
      case ' ':
        return { type: 'activate-control' }
      default:
        return { type: 'none' }
    }
  }

  // ── 焦點在項目本身(Command:焦點在 home、反白在這一列)──
  if (input.itemIsTextEntry) {
    // 搜尋框:插入點已在字尾、沒有按 Shift(Shift+→ 是選取文字)時,→ 才進反白列的第一個東西(AI 推導,command.spec.md「A11y」)
    if (key === 'ArrowRight') {
      return !input.shiftKey && input.caretAtEnd !== false && input.controlCount > 0
        ? { type: 'control', index: 0 }
        : { type: 'none' }
    }
    if (key === 'ArrowDown') return { type: 'item-next' }
    if (key === 'ArrowUp') return { type: 'item-prev' }
    // ← / Home / End / Enter / 空白鍵 / 打字:屬於搜尋框與清單函式庫
    return { type: 'none' }
  }
  switch (key) {
    case 'ArrowDown':
      return { type: 'item-next' }
    case 'ArrowUp':
      return { type: 'item-prev' }
    case 'Home':
      return { type: 'item-first' }
    case 'End':
      return { type: 'item-last' }
    case 'ArrowRight': {
      // 樹裡收著的資料夾 → 先展開(B9);已展開的資料夾或葉節點、平面清單 → 進第一個東西;沒有就不動
      const tree = input.tree
      if (tree && tree.hasChildren && !tree.expanded) return { type: 'expand' }
      return input.controlCount > 0 ? { type: 'control', index: 0 } : { type: 'consume' }
    }
    case 'ArrowLeft': {
      // 樹:展開的資料夾 → 收合;否則 → 回上一層;最外層不動。平面清單:不動(B9「← 在列上維持樹的語意」)
      const tree = input.tree
      if (tree && tree.hasChildren && tree.expanded) return { type: 'collapse' }
      return tree && tree.hasParent ? { type: 'parent' } : { type: 'consume' }
    }
    case 'Enter':
    case ' ':
      return { type: 'activate-item' }
    default:
      return { type: 'none' }
  }
}

/**
 * 上 / 下 / 第一 / 最後一項落在哪 —— **不繞回**(同 W3C grid / tree;X2)。
 * `items` 依畫面順序、含走不到的項目(停用、看不見);`isNavigable` 決定哪些能當落點。
 * 目前這一項本身走不到(例:樹裡用 ← 回到停用的上一層)時,仍從它的位置往前 / 往後找。
 */
export function pickRovingTarget<T>(
  move: RovingMove,
  items: readonly T[],
  current: T | null,
  isNavigable: (item: T) => boolean = () => true,
): T | null {
  if (move === 'item-first') return items.find(isNavigable) ?? null
  if (move === 'item-last') {
    for (let i = items.length - 1; i >= 0; i--) if (isNavigable(items[i])) return items[i]
    return null
  }
  const start = current == null ? -1 : items.indexOf(current)
  if (start < 0) return null
  const dir = move === 'item-next' ? 1 : -1
  for (let i = start + dir; i >= 0 && i < items.length; i += dir) {
    if (isNavigable(items[i])) return items[i]
  }
  return null
}

export interface RovingTabStopOptions<T> {
  /** 上次焦點停過的那一項 */
  remembered?: T | null
  /** 「目前這一頁 / 選中」那一項(側欄 aria-current="page";樹 aria-selected) */
  isCurrent?: (item: T) => boolean
  /** 能不能當「目前」或「第一項」的落點(停用、看不見的不算) */
  isNavigable?: (item: T) => boolean
  /** 上次停過的那一項還能不能拿焦點(預設同 isNavigable;樹的停用列仍可經 ← 拿到焦點,傳 () => true) */
  canHoldFocus?: (item: T) => boolean
}

/**
 * 整串唯一的 Tab 停靠點(X1):上次停過的那一項 → 目前這一頁 / 選中那一項 → 第一個可用項。
 * 出處:W3C「the element that had focus the last time the composite contained focus」+ 導覽樹範例
 * 「focus always lands on the item representing the current page」(keyboard-model-canonical.md 同節引文)。
 */
export function pickRovingTabStop<T>(items: readonly T[], options: RovingTabStopOptions<T> = {}): T | null {
  const isNavigable = options.isNavigable ?? (() => true)
  const canHoldFocus = options.canHoldFocus ?? isNavigable
  const { remembered, isCurrent } = options
  if (remembered != null && items.includes(remembered) && canHoldFocus(remembered)) return remembered
  const current = isCurrent ? items.find((item) => isNavigable(item) && isCurrent(item)) : undefined
  return current ?? items.find(isNavigable) ?? null
}

// ════════════════════════════════════════════════════════════════════════════
// (二) 宿主共用的 DOM 小工具
// ════════════════════════════════════════════════════════════════════════════

/**
 * 項目裡「可以走到的東西」的候選(再經 `isRovingControlReachable` 過濾)。
 * 2026-09-26 之前四份各寫一份、各差一點(樹多認 contenteditable、側欄只認按鈕類),合成這一份;
 * 側欄另有自己的範圍(只認動作鈕的兩個出口),以參數傳入。
 */
export const ROVING_CONTROL_SELECTOR =
  'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]'

/** 把候選 selector 限定在某個範圍裡(`[cmdk-item] a[href], [cmdk-item] button, …`)。不用 `:is()`:舊版 jsdom 不認得。 */
export function scopeRovingSelector(scope: string, selector: string = ROVING_CONTROL_SELECTOR): string {
  return selector.split(',').map((part) => `${scope} ${part.trim()}`).join(', ')
}

/**
 * 文字輸入(方向鍵、Home / End、打字屬於它自己)。沒有插入點的 input type 不算(同 React Aria `nonTextInputTypes`)。
 * 全 DS 只有這一份:清單鍵盤(本檔)、反白來歷(hooks/use-input-modality.ts)、下拉的空白鍵(SelectMenu/select-menu-keyboard.ts)
 * 都讀它(2026-09-26 之前各寫一份)。
 */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'image', 'button', 'submit', 'reset', 'hidden'])
export function isTextEntryElement(el: Element): boolean {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)
  return (el as HTMLElement).isContentEditable === true
}

/**
 * 此刻走得到:沒有停用、不在 inert / aria-hidden 裡(例:多選列的勾選框是 inert + aria-hidden 的純視覺)、
 * 畫得出來(display:none 不算;opacity 0 的「滑過才出現」按鈕算 —— 鍵盤走到時它會浮出)。
 */
export function isRovingControlReachable(el: HTMLElement): boolean {
  return (
    !(el as HTMLButtonElement).disabled &&
    !el.closest('[inert], [aria-hidden="true"]') &&
    el.getClientRects().length > 0
  )
}

/** 某一項裡可以走到的東西,依畫面(文件)順序。 */
export function listRovingControls(root: Element, selector: string = ROVING_CONTROL_SELECTOR): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isRovingControlReachable)
}

/** 只在值不同時才寫:同值 setAttribute 也會產生 mutation record,會讓宿主的 MutationObserver 自我觸發。 */
export function setRovingTabIndex(el: HTMLElement, value: 0 | -1): void {
  if (el.getAttribute('tabindex') !== String(value)) el.setAttribute('tabindex', String(value))
}

/**
 * 項目裡的東西一律不在 Tab 路上(-1,→ 才進得去;別項與本項的都一樣)。
 * 用 DOM 設而不是逐一傳 prop:consumer 的插槽(inlineActionsSlot / description / 名片頭像)是任意 ReactNode,拿不到它們的 props。
 */
export function removeRovingControlsFromTabOrder(elements: Iterable<HTMLElement>): void {
  for (const el of elements) setRovingTabIndex(el, -1)
}

/** 真焦點宿主(側欄 / 檔案清單 / 樹)執行判定結果時要的東西 */
export interface RovingDomHost {
  event: { preventDefault(): void }
  /** 目前這一項(整串唯一的 Tab 停靠點就在這種元素上) */
  item: HTMLElement
  /** 這一項可以走到的東西(已過濾,`listRovingControls`) */
  controls: readonly HTMLElement[]
  /** 整串的項目,依畫面順序(含走不到的;由 isNavigable 篩) */
  items: readonly HTMLElement[]
  isNavigable?: (item: HTMLElement) => boolean
  /** 樹傳 { preventScroll: true }(捲動由列自己的 scrollIntoView 以 block:nearest 處理) */
  focusOptions?: FocusOptions
  /** 樹才有:展開 / 收合 / 回上一層 */
  onExpand?: () => void
  onCollapse?: () => void
  onParent?: () => void
  /** 項目本身的預設動作要由宿主執行時才傳(樹 = 選取);不傳 = 項目是原生按鈕,交給瀏覽器 */
  onActivateItem?: () => void
}

/**
 * 真焦點宿主的執行器:判定之外只剩「焦點怎麼搬、要不要擋預設」,三個宿主完全相同,所以也只寫一份。
 * `reorder` 不在這裡(樹自己處理:要看是否正在用滑鼠拖曳)。
 */
export function applyRovingAction(action: RovingKeyAction, host: RovingDomHost): void {
  const { event, item, controls, focusOptions } = host
  switch (action.type) {
    case 'none':
    case 'reorder':
    case 'activate-control':
      // 按鈕 / 連結的 Enter、空白鍵是瀏覽器原生行為;這裡不擋也不代點
      return
    case 'leave':
      // 焦點在項目裡的東西上時先放回這一項(整串唯一那顆 0),**不擋預設**:瀏覽器接著從這一項往下 / 往上走 = 一下離開。
      // 往前若不先放回,Shift+Tab 會先落回本項(X7 修的就是這個);往後在焦點鎖(手機抽屜 = Radix FocusScope)裡,
      // 鎖判斷「是不是最後一顆」看的是 tabindex≥0 的元素,-1 的按鈕永遠不是它 → 不先放回就繞不回開頭
      //(@radix-ui/react-focus-scope@1.1.7 dist/index.mjs:106-121)。焦點已在這一項上時 focus() 不做任何事。
      item.focus(focusOptions)
      return
    case 'activate-item':
      if (!host.onActivateItem) return
      event.preventDefault()
      host.onActivateItem()
      return
    default:
      break
  }
  event.preventDefault()
  switch (action.type) {
    case 'consume':
      return
    case 'item-prev':
    case 'item-next':
    case 'item-first':
    case 'item-last':
      pickRovingTarget(action.type, host.items, item, host.isNavigable)?.focus(focusOptions)
      return
    case 'control':
      controls[action.index]?.focus(focusOptions)
      return
    case 'item':
      item.focus(focusOptions)
      return
    case 'expand':
      host.onExpand?.()
      return
    case 'collapse':
      host.onCollapse?.()
      return
    case 'parent':
      host.onParent?.()
      return
  }
}
