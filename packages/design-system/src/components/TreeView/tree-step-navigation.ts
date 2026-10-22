/**
 * TreeView 步驟導覽樹的判定 —— 純函式:沒有時鐘、沒有 DOM、沒有 React,同一份輸入永遠同一份輸出。
 *
 * 規格 SSOT:`tree-view.spec.md`「步驟導覽樹」(點大步驟的文字會發生什麼、連點保護、鍵盤)與「步驟結果」(列尾圖示、灰底代顯)。
 * 呼叫端:`tree-view.tsx` 的 TreeItem —— 指標點列的文字(handleRowClick)與 Enter / 空白鍵(TreeView 鍵盤路線的 onActivateItem
 * 經 registry 轉回同一列)都呼叫 `resolveStepActivation`;連點判斷 `isRepeatClick`(TreeView clickRowText);列尾 `stepRowResult`;灰底 `stepMarker`。
 * 呼叫端必須真的消費這幾支,否則判定表測的是平行實作(M37)—— `scripts/test-tree-step-navigation.mjs` 最後一段直接讀 tree-view.tsx 驗。
 * 判定表(含序列):`scripts/test-tree-step-navigation.mjs`;真瀏覽器:`scripts/tree-view-step-navigation-invariant.mjs`。
 *
 * 決定來源(user 原話逐字,全文在 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` T1–T5):
 *   A2:「C對吧」(2026-10-06);D 與連點保護:「1. 做D,且確保不違背世界級的設計,若世界級設計有擋就擋」(2026-10-07);
 *   有自己頁面的大步驟收起後不代顯:「2. 我覺得每種做法都有缺點，不如此情境收起後不代顯」(2026-10-06);
 *   列尾結果:「4. 照你建議…」(2026-10-06,原話全文見總帳 T4)。其餘細節是 AI 依規格推導,在規格各段標明。
 */

/**
 * 連點保護的時間窗:同一列的上一下點擊之後這麼短的時間內再點,這一下只處理選取、不開合。
 * 500 = Windows 預設的雙擊時間(MicrosoftDocs/sdk-api@c12073e4 nf-winuser-setdoubleclicktime.md:62「the default double-click
 * time of 500 milliseconds」)= Chromium 判斷連點的時間(chromium@147.0.7727.15 ui/events/event_constants.h:115
 * `kDoubleClickTimeMs = 500`)。VS Code 活動列同一顆圖示用 300(microsoft/vscode@3dabe9b5 paneCompositeBar.ts:767);
 * 理由與差異見 tree-view.spec.md「步驟導覽樹 → 連點保護」。
 */
export const STEP_REPEAT_CLICK_WINDOW_MS = 500

/** 一頁做完之後的結果:成功 / 失敗。沒有值 = 還沒有結果(不畫)。與 FileItem `status` 的 completed / error 同一組字。 */
export type StepResult = 'completed' | 'error'

/** 上一次點在列的文字上的紀錄(連點保護用) */
export interface StepClick {
  rowId: string
  /** 毫秒;呼叫端用 performance.now()(單調遞增) */
  at: number
  /**
   * 這一下把焦點留在哪一列(null = 點的那一列)。同一串連點裡被擋下的那幾下沿用它 —— 雙擊的結果要跟單擊一模一樣,
   * 焦點也是(微軟指引「interpret a "double click" as one single click」,出處見 tree-view.spec.md「連點保護」)。
   */
  focus: string | null
}

/**
 * 這一下是不是「同一列的連點」:
 *   - 上一下也點在**這一列**的文字上(換列不算 —— 換到別列的快點照常處理);而且
 *   - 瀏覽器回報的連點次數 ≥ 2(`MouseEvent.detail`;Windows / Mac 照使用者在系統設定的雙擊速度),**或**
 *     離上一下不到 `windowMs`。
 * 兩個條件都要:WebKit(iPhone / iPad 上所有瀏覽器)手指點一下回報第 1 下(WebKit@b4363b9b WebPage.h:1169
 * `int clickCount = 1`、WebPageCocoa.mm:3290-3296 不傳次數、EventHandler.cpp:2168 直接取用);快點兩下時,只有頁面在那一點
 * (或整個視窗)有在聽雙擊(dblclick)才會送出第 2 下(WebPageCocoa.mm:3832-3893 handleDoubleTapForDoubleClickAtPoint、
 * LocalFrame.cpp:1942-1967 nodeRespondingToDoubleClickEvent)—— React 18 在根節點聽所有事件、含雙擊(react@v18.3.1
 * DOMEventProperties.js:130、DOMPluginEventSystem.js:386-398),但那條路還有別的條件、也沒在實機上量過:次數靠不住,只看次數等於沒擋;
 * Chromium 觸控的次數數到 3 就重來(第 4 下又是 1)。只看時間又會忽略使用者把雙擊速度調慢的設定(微軟指引
 * inter-mouse.md:242「Use the system double-click speed to distinguish between single and double clicks」)。
 * 時間從**上一下**量起(不是從第一下):連續快點幾下都算同一串,跟系統數「第幾下」的方式一樣(chromium event.cc:463-488
 * 每一下都跟上一下比)。
 */
export function isRepeatClick(previous: StepClick | null, rowId: string, at: number, detail: number, windowMs: number = STEP_REPEAT_CLICK_WINDOW_MS): boolean {
  if (previous === null || previous.rowId !== rowId) return false
  return detail >= 2 || at - previous.at < windowMs
}

export type StepActivationOutcome =
  /** 沒有自己頁面的大步驟、目前那一步不在裡面 → 到第一個能前往的子步驟,沿路只展開(A2) */
  | 'go-first-child'
  /** 沒有自己頁面的大步驟、目前那一步在裡面但被收著 → 只展開,選取不變(A2) */
  | 'reveal-current'
  /** 選這一列(步驟導覽樹的指標點擊另外只展開、永不收合) */
  | 'go-self'
  /** 這一下什麼都不會變 → 開 ↔ 合(D) */
  | 'toggle'
  /** 本來會開合,但這一下是同一列的連點 → 不開合,焦點回到這一串第一下留下的位置(連點保護) */
  | 'guarded'
  /** 什麼都不做 */
  | 'none'

export interface StepActivation {
  /** 要選的列(null = 不動選取)。非步驟導覽樹照舊每一下都呼叫選取(冪等,onSelectedChange 照發) */
  select: string | null
  /** 要展開的列(只加不減) */
  expand: readonly string[]
  /** 這一列開 ↔ 合 */
  toggle: boolean
  /** 焦點要搬到的列(null = 留在點 / 按的那一列) */
  focus: string | null
  outcome: StepActivationOutcome
}

export interface StepActivationInput {
  /** pointer = 滑鼠 / 手指點列的文字(不含展開箭頭、不含列上的按鈕);keyboard = 焦點在列上按 Enter / 空白鍵 */
  source: 'pointer' | 'keyboard'
  selectionMode: 'single' | 'multiple' | 'none'
  /** TreeView `expandOnSelect`(步驟導覽樹 = 單選 + expandOnSelect) */
  expandOnSelect: boolean
  id: string
  hasChildren: boolean
  /** TreeItem `selectable`(false = 沒有自己頁面的大步驟) */
  selectable: boolean
  /** 這一列就是目前選中的那一列(單選) */
  isCurrent: boolean
  expanded: boolean
  /** 只對沒有自己頁面的大步驟:目前那一步在這一列底下(任意深) */
  currentInside: boolean
  /** 只對沒有自己頁面的大步驟 + currentInside:這一列與它到目前那一步之間的大步驟裡,收著的那些(只加不減的展開清單) */
  collapsedOnPathToCurrent: readonly string[]
  /** 只對沒有自己頁面的大步驟:第一個能前往的子孫(依畫面順序,跳過停用的分支),以及這一列與它之間收著的大步驟 */
  firstTarget: { id: string; collapsedOnPath: readonly string[] } | null
  /** 這一下若是同一列的連點(`isRepeatClick` 成立)→ 上一下的紀錄;不是 → null(鍵盤一律 null) */
  repeatOf: StepClick | null
}

const nothing = (outcome: StepActivationOutcome = 'none'): StepActivation => ({ select: null, expand: [], toggle: false, focus: null, outcome })

/**
 * 點(或按 Enter / 空白鍵)一列會發生什麼 —— 規格「步驟導覽樹」那張表的唯一實作。
 *
 * 判斷順序(一句話:**會換位置就去那裡並只展開;什麼都不會變才開合**):
 *  1. 沒有自己頁面的大步驟(`selectable={false}`,單選):
 *     - 目前那一步不在裡面 → 到第一個能前往的子步驟,沿路只展開,焦點跟過去(指標與鍵盤相同)
 *     - 在裡面但被收著 → 指標:只展開(選取不變);鍵盤:不動(原地開合走 → / ←)
 *     - 在裡面而且看得到 → 什麼都不會變 → D
 *  2. 能選的列:
 *     - 這一下會改變選取(單選點別列 / 多選每一下)→ 選它;步驟導覽樹的指標點擊另外只展開它(永不收合;修掉舊的一律開合)
 *     - 不會改變選取(單選點目前那一列 / 不選取模式)→ 開了 expandOnSelect 而且有子步驟 → D;否則照舊
 *  D = 指標點擊 → 開 ↔ 合,但同一列的連點不開合、焦點回到這一串第一下留下的位置(連點保護);鍵盤 → 不動(原地開合走 → / ←)。
 */
export function resolveStepActivation(input: StepActivationInput): StepActivation {
  const action = resolveWithoutGuard(input)
  // 連點保護:同一列的連點只處理選取、不改開合 —— 擋的是「這一下沒有換位置、卻會開或合」的兩種(D 的開合、在裡面收著時的展開)。
  // 原地雙擊:第一下收起、第二下本來會「展開讓目前那一步露出來」→ 擋,否則就是閃一下。
  // 會換位置的那一下(到第一個子步驟 / 選別的列)不擋:它要展開才看得到新的位置,而且第二下以後選取已在那裡,本來就只剩開合可做。
  // 焦點:沿用這一串第一下留下的位置(從別處雙擊沒頁面大步驟 → 第一下把焦點帶到第一個子步驟,第二下的按下讓列搶走焦點,這裡還回去),
  // 雙擊的結果與單擊一模一樣。
  if (input.source === 'pointer' && input.repeatOf !== null && (action.outcome === 'toggle' || action.outcome === 'reveal-current')) {
    return { select: action.select, expand: [], toggle: false, focus: input.repeatOf.focus, outcome: 'guarded' }
  }
  return action
}

function resolveWithoutGuard(input: StepActivationInput): StepActivation {
  const pointer = input.source === 'pointer'
  // D:這一下什麼都不會變 → 指標點擊等同點箭頭開合;鍵盤原地開合走 → / ←
  const toggle = (): StepActivation => (pointer ? { select: null, expand: [], toggle: true, focus: null, outcome: 'toggle' } : nothing())

  if (!input.selectable) {
    // 沒有自己頁面的大步驟只在單選的樹裡有意義;沒有子步驟 = 沒有地方可去
    if (!input.hasChildren || input.selectionMode !== 'single') return nothing()
    if (!input.currentInside) {
      if (input.firstTarget === null) return toggle()
      return { select: input.firstTarget.id, expand: input.firstTarget.collapsedOnPath, toggle: false, focus: input.firstTarget.id, outcome: 'go-first-child' }
    }
    if (input.collapsedOnPathToCurrent.length > 0) {
      return pointer
        ? { select: null, expand: input.collapsedOnPathToCurrent, toggle: false, focus: null, outcome: 'reveal-current' }
        : nothing()
    }
    return toggle()
  }

  const select = input.selectionMode === 'none' ? null : input.id
  const changesSelection = input.selectionMode === 'multiple' || (input.selectionMode === 'single' && !input.isCurrent)
  if (changesSelection) {
    const expand = pointer && input.expandOnSelect && input.hasChildren && !input.expanded ? [input.id] : []
    return { select, expand, toggle: false, focus: null, outcome: 'go-self' }
  }
  // 選取不變(單選點目前那一列 / 不選取模式):開了 expandOnSelect 而且有子步驟 → D;否則照舊再選一次(冪等,onSelectedChange 照發)
  if (input.expandOnSelect && input.hasChildren) return { ...toggle(), select }
  return { select, expand: [], toggle: false, focus: null, outcome: 'none' }
}

// ── 子步驟結構(沒有自己頁面的大步驟要知道收起來的子樹裡有誰;收起的子樹不掛載,所以從 children 讀)──

/** tree-view.tsx 從 TreeItem children 讀出來的形狀 */
export interface StepNode {
  id: string
  selectable: boolean
  disabled: boolean
  status?: StepResult
  children: readonly StepNode[]
}

/** 從 nodes(某一列的子步驟)到 targetId 的路徑(含 targetId 那一個);不在裡面 → null */
export function findStepPath(nodes: readonly StepNode[], targetId: string): StepNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node]
    const rest = findStepPath(node.children, targetId)
    if (rest) return [node, ...rest]
  }
  return null
}

/** 第一個能前往的子孫(畫面順序;停用的列連同它底下都跳過)的路徑;沒有 → null */
export function firstReachableStepPath(nodes: readonly StepNode[]): StepNode[] | null {
  for (const node of nodes) {
    if (node.disabled) continue
    if (node.selectable) return [node]
    const rest = firstReachableStepPath(node.children)
    if (rest) return [node, ...rest]
  }
  return null
}

/** 底下所有「有自己頁面」的子孫的結果(任意深;沒有自己頁面的大步驟本身沒有結果,跳過它、往下找) */
export function collectStepResults(nodes: readonly StepNode[]): (StepResult | undefined)[] {
  const out: (StepResult | undefined)[] = []
  for (const node of nodes) {
    if (node.selectable) out.push(node.status)
    out.push(...collectStepResults(node.children))
  }
  return out
}

/**
 * 沒有自己頁面的大步驟在判斷時要知道的四件事,全部從它的子步驟結構與目前狀態算出來(TreeItem 與判定表共用這一支,
 * 不各算一份):目前那一步在不在裡面、到它之間收著的大步驟、第一個能前往的子孫與到它之間收著的大步驟、底下所有有頁面子孫的結果。
 * 「收著的大步驟」清單都含這一列自己(它收著時也要展開)、不含終點那一列。
 */
export function pagelessStepContext(rowId: string, children: readonly StepNode[], currentId: string | null, isExpanded: (id: string) => boolean): {
  currentInside: boolean
  collapsedOnPathToCurrent: string[]
  firstTarget: { id: string; collapsedOnPath: string[] } | null
  descendantResults: (StepResult | undefined)[]
} {
  const collapsed = (path: readonly StepNode[]) => [rowId, ...path.slice(0, -1).map((n) => n.id)].filter((id) => !isExpanded(id))
  const pathToCurrent = currentId === null ? null : findStepPath(children, currentId)
  const firstPath = firstReachableStepPath(children)
  return {
    currentInside: pathToCurrent !== null,
    collapsedOnPathToCurrent: pathToCurrent === null ? [] : collapsed(pathToCurrent),
    firstTarget: firstPath === null ? null : { id: firstPath[firstPath.length - 1].id, collapsedOnPath: collapsed(firstPath) },
    descendantResults: collectStepResults(children),
  }
}

/**
 * 代顯的算法(user 2026-10-01 提的 AND,再加上「還沒有結果」):任一失敗 → 失敗;每一個都明確成功 → 成功;
 * 其他(含還沒有結果、沒有任何子孫有頁面)→ 不畫。還沒有結果的永遠不會被算成成功。
 */
export function summarizeStepResults(results: readonly (StepResult | undefined)[]): StepResult | undefined {
  if (results.some((r) => r === 'error')) return 'error'
  if (results.length > 0 && results.every((r) => r === 'completed')) return 'completed'
  return undefined
}

export interface StepRowResult {
  result: StepResult | undefined
  /** true = 這不是這一列自己的結果,是收起的大步驟替藏起來的子步驟代顯 */
  proxy: boolean
}

/**
 * 列尾畫什麼:
 *  - 有自己頁面的列(子步驟、有自己頁面的大步驟):只畫產品給它自己的結果,展開收起都一樣,永不代顯
 *  - 沒有自己頁面的大步驟:展開 → 不畫(子步驟自己看得到);收起 → 代顯底下所有有頁面子孫的彙總
 */
export function stepRowResult(input: { selectable: boolean; hasChildren: boolean; expanded: boolean; ownResult: StepResult | undefined; descendantResults: readonly (StepResult | undefined)[] }): StepRowResult {
  if (input.selectable) return { result: input.ownResult, proxy: false }
  if (!input.hasChildren || input.expanded) return { result: undefined, proxy: false }
  const result = summarizeStepResults(input.descendantResults)
  return { result, proxy: result !== undefined }
}

/**
 * 灰底(「你在哪」)畫在哪一列:
 *  - 目前那一步看得到 → 畫在它自己身上('own')
 *  - 它藏在收起的、沒有自己頁面的大步驟裡 → 畫在**看得到的最近那一層**這種大步驟上('proxy')
 *  - 它藏在收起的、有自己頁面的大步驟裡 → 哪裡都不畫(user 2026-10-06「不如此情境收起後不代顯」)
 * `branchOpen` = 這一列的所有上層都展開著(這一列看得到);收起動畫期間的子列已不算看得到,灰底不會同時出現在兩列。
 */
export function stepMarker(input: { selectable: boolean; hasChildren: boolean; isCurrent: boolean; currentInside: boolean; expanded: boolean; branchOpen: boolean }): 'own' | 'proxy' | null {
  if (!input.branchOpen) return null
  if (input.selectable) return input.isCurrent ? 'own' : null
  return input.hasChildren && !input.expanded && input.currentInside ? 'proxy' : null
}
