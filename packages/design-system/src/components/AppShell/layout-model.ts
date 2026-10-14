/**
 * AppShell 四區版面的可執行模型(2026-10-14;純函式,無 DOM、無時鐘、無隨機)。
 *
 * 規則的唯一住所是 `app-shell.spec.md`「版面規則(Menu / Main / Right panel / AI agent)」;本檔是那一節的可執行版本,
 * 判定表 `scripts/test-app-shell-layout-model.mjs`(user 2026-10-14 寫的每一個數字例子 + AI 走查;`--selftest` 注入改壞版必紅)。
 * 註解裡的 `U:n` / `D:n` 指 user 2026-10-14 第一則原文 / 第二則原文與核准清單的第 n 行,
 * 逐字收錄於 `governance/planning/2026-10-14-app-shell-layout-user-spec.md`(以 `U:n` / `D:n` 標行)。
 *
 * 三樣東西分開管(U:9、U:11、U:66-67):
 *   - 開關紀錄 `open`:只有使用者改得動;視窗變化、內容自動變化都不改它(唯一例外:U:12 的連帶關閉)。
 *   - 顯示方式 `PanelDisplay`:每次由本模型現算(並排 / 浮層 / 暫藏 / 關閉),不存。
 *   - 寬度紀錄 `records`:每個面板、每種內容類型一份;只有使用者調整寬度會寫(D:19),系統夾寬從不寫。
 *
 * 本檔是 DS 內部模組,不從 `index.ts` 對外匯出(型別 `PanelDisplay` / `PanelWidthRange` 由 `app-shell.tsx` 轉出)。呼叫端只有兩個:
 *   - AppShell(`app-shell.tsx` 的 `useAppShellLayoutEngine`):四區全部經 `reduceLayout` / `deriveLayout`;
 *   - AgentPanel 不在 AppShell 裡單獨使用時(`agent-panel.tsx`,D:30 清單 N14「AgentPanel 只算自己」):經 `computeStandaloneAgentLayout`
 *     —— 同一支 `computeLayout`,只開 AI agent 一區。
 * 判定表會檢查這兩個呼叫端真的呼叫這裡(不是平行實作)。
 */

export type AppShellPanelId = 'menu' | 'right' | 'agent'

/**
 * 面板此刻的顯示方式。`side-by-side` / `overlay` 沿用 `AgentPanelMode` 既有的兩個值(`agent-panel.tsx`)。
 * `hidden` = 開關紀錄是開、但放不下而暫藏(只有 Menu 會有,U:25);`closed` = 開關紀錄是關。
 */
export type PanelDisplay = 'side-by-side' | 'overlay' | 'hidden' | 'closed'

/** 排列順序(U:20「依 Right panel → AI agent → Menu 的順序，安排已開啟的面板」)。 */
export const PANEL_PLACEMENT_ORDER: readonly AppShellPanelId[] = ['right', 'agent', 'menu']

/** 一種內容類型的寬度設定(U:6)。 */
export interface PanelWidthRange {
  min: number
  initial: number
  max: number
}

/** 浮點比較的容差:可拉上限不取整(1440 會算出 213.33…),比較時吃掉二進位誤差。 */
const EPSILON = 1e-9

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi)

/** U:6「三者皆須為正數，且 最小 ≤ 初始 ≤ 最大」。合法回 null,不合法回原因。 */
export function validatePanelWidthRange(range: PanelWidthRange): string | null {
  const { min, initial, max } = range
  if (![min, initial, max].every((n) => Number.isFinite(n) && n > 0)) return '最小、初始、最大寬度都必須是正數'
  if (!(min <= initial && initial <= max)) return '必須 最小 ≤ 初始 ≤ 最大'
  return null
}

// ─────────────────────────── 1. 誰並排(U:18-27)───────────────────────────

export interface PlacementInput {
  /** 「視窗寬度」= 視窗內可供 App 排版的寬度(U:7);不含水平捲動延伸出去的部分(U:27)。 */
  availableWidth: number
  mainMinWidth: number
  /** Menu 細列寬;消費者沒開細列時為 0(D:24)。 */
  railWidth: number
  open: Record<AppShellPanelId, boolean>
  /** 各面板「目前內容類型」的最小寬度。 */
  minWidth: Record<AppShellPanelId, number>
  /** Menu 目前是不是浮層(U:25「已是浮層就維持，否則暫藏」)。 */
  menuOverlayActive: boolean
}

/**
 * 依 Right panel → AI agent → Menu 排已開啟的面板(U:20)。每一步:視窗寬 − Main 最小寬 − 已並排面板的最小寬 ≥ 這個面板的最小寬 → 並排(U:21);
 * 只看最小寬,不看初始寬或使用者設的寬(U:21)。放不下時:Right 仍然並排、AI agent 變右側浮層、Menu 已是浮層就維持否則暫藏(U:22-25)。
 *
 * 細列(D:24):Menu 最小看得到的就是細列,所以排 Right、AI agent 之前細列已經在版面上(先扣 `railWidth`);
 * Menu 並排時展開的 Menu 取代細列的位置(細列不另扣),Menu 的判斷因此把細列加回來 —— 展開後就是 U:21 原句。
 */
export function placePanels(input: PlacementInput): Record<AppShellPanelId, PanelDisplay> {
  const { availableWidth, mainMinWidth, railWidth, open, minWidth, menuOverlayActive } = input
  const display = {} as Record<AppShellPanelId, PanelDisplay>
  let reserved = mainMinWidth + railWidth
  for (const id of ['right', 'agent'] as const) {
    if (!open[id]) {
      display[id] = 'closed'
      continue
    }
    const fits = availableWidth - reserved >= minWidth[id]
    if (fits || id === 'right') {
      display[id] = 'side-by-side'
      reserved += minWidth[id]
    } else {
      display[id] = 'overlay'
    }
  }
  if (!open.menu) display.menu = 'closed'
  else if (availableWidth - reserved + railWidth >= minWidth.menu) display.menu = 'side-by-side'
  else display.menu = menuOverlayActive ? 'overlay' : 'hidden'
  return display
}

// ─────────────────────────── 2. 可拉上限(U:29-51)───────────────────────────

export interface SideBySideCapsInput {
  availableWidth: number
  mainMinWidth: number
  /** Menu 沒並排時版面上的細列寬;Menu 並排時為 0(D:24)。 */
  railWidthInLayout: number
  panels: ReadonlyArray<{ id: AppShellPanelId; min: number; max: number }>
}

/**
 * 先從視窗寬扣除 Main 與所有並排面板的最小寬,剩餘平均加到各面板的可拉上限;到設定最大寬的面板停止分配,其餘繼續均分(U:31-32)。
 * 結果:所有面板拉到上限時 Main 剛好剩最小寬;全部到最大寬時多出的留給 Main(`surplusToMain`,U:33)。
 * 上限不取整:取整後 1440 全拉滿時 Main 會剩 601,不是 U:33 的「剛好」。
 * 合計放不下時(要水平捲動,U:27)剩餘 ≤ 0,上限 = 最小寬。上限只決定最多能拉多寬,不會自動拉到上限(U:51)。
 */
export function computeSideBySideCaps(input: SideBySideCapsInput): {
  caps: Partial<Record<AppShellPanelId, number>>
  surplusToMain: number
} {
  const { availableWidth, mainMinWidth, railWidthInLayout, panels } = input
  const caps: Partial<Record<AppShellPanelId, number>> = {}
  let remaining = availableWidth - mainMinWidth - railWidthInLayout
  for (const p of panels) {
    caps[p.id] = p.min
    remaining -= p.min
  }
  let growing = panels.filter((p) => p.max - p.min > EPSILON)
  while (remaining > EPSILON && growing.length > 0) {
    const share = remaining / growing.length
    const reachingMax = growing.filter((p) => p.max - (caps[p.id] as number) <= share + EPSILON)
    if (reachingMax.length === 0) {
      for (const p of growing) caps[p.id] = (caps[p.id] as number) + share
      remaining = 0
      break
    }
    for (const p of reachingMax) {
      remaining -= p.max - (caps[p.id] as number)
      caps[p.id] = p.max
    }
    growing = growing.filter((p) => !reachingMax.includes(p))
  }
  return { caps, surplusToMain: Math.max(0, remaining) }
}

// ─────────────────────────── 3. 浮層(U:53-62)───────────────────────────

export interface OverlayRangeInput {
  availableWidth: number
  min: number
  max: number
  /** 浮層另一側至少保留的距離(U:55 的 48px = `--layout-space-viewport-inset`);由呼叫端量 token 傳入,本檔不寫死數值。 */
  edgeGap: number
}

/**
 * 浮層可拖範圍:最小寬 ~ min(最大寬, 視窗寬 − 另一側留白)(U:56-59)。
 * 視窗扣掉留白後連最小寬都放不下 → 優先保留留白,範圍縮成「視窗寬 − 留白」一個值,`belowMin` = true(U:61-62,例:320 → 272)。
 * 浮層不佔並排空間(U:53),所以與並排面板、細列無關。
 */
export function computeOverlayRange(input: OverlayRangeInput): { min: number; max: number; belowMin: boolean } {
  const { availableWidth, min, max, edgeGap } = input
  // 寬度不會是負數(物理下限,不是設計規則;DS 不為過小視窗設計,D:20)
  const hi = Math.max(0, Math.min(max, availableWidth - edgeGap))
  if (hi < min) return { min: hi, max: hi, belowMin: true }
  return { min, max: hi, belowMin: false }
}

/** 實際顯示寬:目標寬合法就照目標;超出限制暫時夾到最近的合法寬,不覆寫紀錄(U:70-71)。 */
export function resolveDisplayedWidth(target: number, range: { min: number; max: number }): number {
  return clamp(target, range.min, range.max)
}

// ─────────────────────────── 4. 唯一的連帶關閉(U:12-16)───────────────────────────

/**
 * 使用者主動要求 Right panel 顯示內容(打開 Right,或切換它目前的內容,U:15)時:
 * Main 最小寬 + 細列 + Right「新內容」最小寬 + 已開啟 AI agent 的最小寬 > 視窗寬 → 關閉 AI agent(U:12)。
 * AI agent 不論並排或浮層,開著就算(U:11 開關與顯示方式分開)。細列那一項是 D:24 核准的延伸:
 * 排 Right、AI agent 時已先扣細列(不論 Menu 此刻是否並排 —— Menu 排在最後,之後可能被暫藏而只剩細列),這裡用同一把尺,
 * 要求 Right 之後 AI agent 只會並排或被關,不會變成蓋住 Right 的浮層。合計不含 Menu 的最小寬(U:12 只列 Main、Right、AI agent)。
 * 只開 AI agent、或只是視窗變窄,都不走這裡(U:16)。
 */
export function shouldCloseAgentOnRightRequest(input: {
  availableWidth: number
  mainMinWidth: number
  railWidth: number
  rightMinWidth: number
  agentMinWidth: number
  agentOpen: boolean
}): boolean {
  if (!input.agentOpen) return false
  return input.mainMinWidth + input.railWidth + input.rightMinWidth + input.agentMinWidth > input.availableWidth
}

// ─────────────────────────── 5. 寬度紀錄(U:64-75、D:19)───────────────────────────

/**
 * 使用者一次調整寬度結束(放開拖曳,或鍵盤每按一下)時的新紀錄(D:19):
 * 有實際操作 → 紀錄 = 當下實際顯示的寬度(超出限制的部分本來就顯示不出來,U:72);
 * 只點一下把手沒有拖(`moved` = false)→ 不算調整,紀錄不變。系統校正(視窗變化、重新排版)不走這裡,所以從不寫紀錄。
 */
export function recordAfterUserResize(input: { previousRecord: number | undefined; displayedWidth: number; moved: boolean }): number | undefined {
  return input.moved ? input.displayedWidth : input.previousRecord
}

// ─────────────────────────── 6. 整體版面 ───────────────────────────

export interface LayoutInput {
  availableWidth: number
  mainMinWidth: number
  railWidth: number
  overlayEdgeGap: number
  open: Record<AppShellPanelId, boolean>
  /** 各面板「目前內容類型」的寬度設定。 */
  widths: Record<AppShellPanelId, PanelWidthRange>
  /** 各面板「目前內容類型」的目標寬 = 紀錄,沒調過時 = 初始寬(U:66)。 */
  targets: Record<AppShellPanelId, number>
  menuOverlayActive: boolean
}

export interface LayoutResult {
  display: Record<AppShellPanelId, PanelDisplay>
  /** 細列此刻佔不佔版面(有細列、且 Menu 沒並排);Menu 浮層蓋在它上面時仍佔版面。 */
  railInLayout: boolean
  /** 並排面板的可拉上限。 */
  caps: Partial<Record<AppShellPanelId, number>>
  /** 浮層的可拖範圍。 */
  overlayRanges: Partial<Record<AppShellPanelId, { min: number; max: number; belowMin: boolean }>>
  /** 並排與浮層面板此刻顯示的寬。 */
  widths: Partial<Record<AppShellPanelId, number>>
  mainWidth: number
  /** 全部並排面板都到設定最大寬時,多出來留給 Main 的空間(U:33)。 */
  surplusToMain: number
  /** Main + 細列 + 並排面板的最小寬合計超過視窗寬的量 = 殼要水平捲動的距離(U:27);0 = 不捲。 */
  horizontalOverflow: number
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const { availableWidth, mainMinWidth, railWidth, overlayEdgeGap, open, widths, targets, menuOverlayActive } = input
  const minWidth = { menu: widths.menu.min, right: widths.right.min, agent: widths.agent.min }
  const display = placePanels({ availableWidth, mainMinWidth, railWidth, open, minWidth, menuOverlayActive })
  const railInLayout = railWidth > 0 && display.menu !== 'side-by-side'
  const railWidthInLayout = railInLayout ? railWidth : 0
  const sideIds = PANEL_PLACEMENT_ORDER.filter((id) => display[id] === 'side-by-side')
  const { caps, surplusToMain } = computeSideBySideCaps({
    availableWidth,
    mainMinWidth,
    railWidthInLayout,
    panels: sideIds.map((id) => ({ id, min: widths[id].min, max: widths[id].max })),
  })
  const shown: Partial<Record<AppShellPanelId, number>> = {}
  const overlayRanges: LayoutResult['overlayRanges'] = {}
  for (const id of sideIds) shown[id] = resolveDisplayedWidth(targets[id], { min: widths[id].min, max: caps[id] as number })
  for (const id of PANEL_PLACEMENT_ORDER.filter((i) => display[i] === 'overlay')) {
    const range = computeOverlayRange({ availableWidth, min: widths[id].min, max: widths[id].max, edgeGap: overlayEdgeGap })
    overlayRanges[id] = range
    shown[id] = resolveDisplayedWidth(targets[id], range)
  }
  const minSum = mainMinWidth + railWidthInLayout + sideIds.reduce((sum, id) => sum + widths[id].min, 0)
  const horizontalOverflow = Math.max(0, minSum - availableWidth)
  const sideSum = sideIds.reduce((sum, id) => sum + (shown[id] as number), 0)
  // U:5 Main 填滿並排面板沒用到的空間;要捲動時維持最小寬(U:27)
  const mainWidth = horizontalOverflow > EPSILON ? mainMinWidth : availableWidth - railWidthInLayout - sideSum
  return { display, railInLayout, caps, overlayRanges, widths: shown, mainWidth, surplusToMain, horizontalOverflow }
}

// ─────────────────────────── 7. 狀態與動作 ───────────────────────────

export interface LayoutState {
  availableWidth: number
  mainMinWidth: number
  railWidth: number
  overlayEdgeGap: number
  /** 開關紀錄(U:9)。 */
  open: Record<AppShellPanelId, boolean>
  /** 各面板目前顯示的內容類型。 */
  contentType: Record<AppShellPanelId, string>
  /** 各面板、各內容類型的寬度設定(U:6;同一內容類型的不同資料共用)。 */
  widthConfig: Record<AppShellPanelId, Record<string, PanelWidthRange>>
  /** 寬度紀錄:各面板、各內容類型一份;並排與浮層共用;切換內容、切換顯示方式、關閉都不清(U:66-67)。 */
  records: Record<AppShellPanelId, Record<string, number>>
  /** Menu 浮層是否叫出來了(U:25 的「已是浮層」)。Menu 並排或關閉時歸 false。 */
  menuOverlayActive: boolean
}

export type LayoutAction =
  /** 系統:視窗(App 排版區)寬度變了(U:11,不改開關紀錄)。 */
  | { type: 'resize'; availableWidth: number }
  /** 系統:Main 最小寬變了(例:換頁),重新排版。 */
  | { type: 'set-main-min-width'; mainMinWidth: number }
  /** 使用者主動要求 Right panel 顯示內容:打開它(開關鈕、⌘.)或切換它目前的內容(U:12、U:15)。 */
  | { type: 'request-right'; contentType: string }
  /** 內容自動變化(不是使用者要求):只重排,不走連帶關閉(U:11)。 */
  | { type: 'set-content-type'; panel: AppShellPanelId; contentType: string }
  | { type: 'close-right' }
  /** 使用者打開 AI agent;不觸發連帶關閉(U:12「唯一」)。 */
  | { type: 'open-agent' }
  /** 使用者關閉 AI agent(×、入口鈕、浮層時點遮罩或 Esc)。 */
  | { type: 'close-agent' }
  /** 使用者按 Menu 開關或 ⌘B。 */
  | { type: 'toggle-menu' }
  /** Menu 浮層開著時按 Esc 或點浮層外(D:26)。 */
  | { type: 'dismiss-menu-overlay' }
  /** AI agent 裡導向 Main 的動作(內部連結、有網址的 modal、確認前往)(D:23)。執行面:`useAppShell().navigateFromAgent()`。 */
  | { type: 'navigate-main-from-agent' }
  /** 使用者一次調整寬度結束:拖曳放開(`moved` = 按下到放開有沒有位移)或鍵盤按一下(`moved` = true)(D:19)。 */
  | { type: 'user-resize'; panel: AppShellPanelId; width: number; moved: boolean }

/** 目前內容類型的寬度設定。 */
export function currentWidthRange(state: LayoutState, panel: AppShellPanelId): PanelWidthRange {
  const range = state.widthConfig[panel][state.contentType[panel]]
  if (!range) throw new Error(`AppShell 版面:${panel} 沒有內容類型「${state.contentType[panel]}」的寬度設定`)
  return range
}

/** 目標寬:有紀錄用紀錄,沒調過用初始寬(U:66)。 */
export function targetWidth(state: LayoutState, panel: AppShellPanelId): number {
  return state.records[panel][state.contentType[panel]] ?? currentWidthRange(state, panel).initial
}

export function createLayoutState(init: Omit<LayoutState, 'records' | 'menuOverlayActive'> & Partial<Pick<LayoutState, 'records'>>): LayoutState {
  for (const panel of PANEL_PLACEMENT_ORDER) {
    for (const [type, range] of Object.entries(init.widthConfig[panel])) {
      const problem = validatePanelWidthRange(range)
      if (problem) throw new Error(`AppShell 版面:${panel} 內容類型「${type}」的寬度設定不合法 —— ${problem}`)
    }
  }
  const state: LayoutState = {
    ...init,
    open: { ...init.open },
    contentType: { ...init.contentType },
    records: init.records ?? { menu: {}, right: {}, agent: {} },
    menuOverlayActive: false,
  }
  return normalizeMenuOverlay(state)
}

export function deriveLayout(state: LayoutState): LayoutResult {
  return computeLayout({
    availableWidth: state.availableWidth,
    mainMinWidth: state.mainMinWidth,
    railWidth: state.railWidth,
    overlayEdgeGap: state.overlayEdgeGap,
    open: state.open,
    widths: {
      menu: currentWidthRange(state, 'menu'),
      right: currentWidthRange(state, 'right'),
      agent: currentWidthRange(state, 'agent'),
    },
    targets: { menu: targetWidth(state, 'menu'), right: targetWidth(state, 'right'), agent: targetWidth(state, 'agent') },
    menuOverlayActive: state.menuOverlayActive,
  })
}

/** 「已是浮層」只在 Menu 仍是浮層時成立;Menu 一旦並排或關閉,下次放不下時是暫藏(U:25)。 */
function normalizeMenuOverlay(state: LayoutState): LayoutState {
  if (!state.menuOverlayActive) return state
  return deriveLayout(state).display.menu === 'overlay' ? state : { ...state, menuOverlayActive: false }
}

export function reduceLayout(state: LayoutState, action: LayoutAction): LayoutState {
  return normalizeMenuOverlay(applyAction(state, action))
}

function applyAction(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'resize':
      return { ...state, availableWidth: action.availableWidth }
    case 'set-main-min-width':
      return { ...state, mainMinWidth: action.mainMinWidth }
    case 'request-right': {
      const rightMin = state.widthConfig.right[action.contentType]?.min
      if (rightMin === undefined) throw new Error(`AppShell 版面:right 沒有內容類型「${action.contentType}」的寬度設定`)
      const closeAgent = shouldCloseAgentOnRightRequest({
        availableWidth: state.availableWidth,
        mainMinWidth: state.mainMinWidth,
        railWidth: state.railWidth,
        rightMinWidth: rightMin,
        agentMinWidth: currentWidthRange(state, 'agent').min,
        agentOpen: state.open.agent,
      })
      return {
        ...state,
        open: { ...state.open, right: true, agent: closeAgent ? false : state.open.agent },
        contentType: { ...state.contentType, right: action.contentType },
      }
    }
    case 'set-content-type':
      return { ...state, contentType: { ...state.contentType, [action.panel]: action.contentType } }
    case 'close-right':
      return { ...state, open: { ...state.open, right: false } }
    case 'open-agent':
      return { ...state, open: { ...state.open, agent: true } }
    case 'close-agent':
      return { ...state, open: { ...state.open, agent: false } }
    case 'toggle-menu': {
      const shown = deriveLayout(state).display.menu
      // 並排 → 關閉(U:9 使用者決定開關)
      if (shown === 'side-by-side') return { ...state, open: { ...state.open, menu: false } }
      // 暫藏 → 叫出左側浮層(U:26)
      if (shown === 'hidden') return { ...state, menuOverlayActive: true }
      // 浮層 → 收回暫藏,開關紀錄仍是開;之後放得下時自己回來並排(D:26)
      if (shown === 'overlay') return { ...state, menuOverlayActive: false }
      // 關閉 → 打開;放不下時一按就是左側浮層,不先變成看不到的暫藏(D:25);放得下時 normalize 會把浮層旗標歸零 → 並排
      return { ...state, open: { ...state.open, menu: true }, menuOverlayActive: true }
    }
    case 'dismiss-menu-overlay':
      return { ...state, menuOverlayActive: false }
    case 'navigate-main-from-agent':
      // 浮層時收起 AI agent、讓目標呈現在眼前;並排時維持(D:23,v14 條 B)
      return deriveLayout(state).display.agent === 'overlay' ? { ...state, open: { ...state.open, agent: false } } : state
    case 'user-resize': {
      const layout = deriveLayout(state)
      const shown = layout.display[action.panel]
      if (shown !== 'side-by-side' && shown !== 'overlay') return state
      const config = currentWidthRange(state, action.panel)
      // 並排:夾在 [最小, 可拉上限];浮層:夾在浮層範圍(U:72;拖並排面板的差只由 Main 吸收,U:75 —— 上限只看最小 / 最大寬,不看別人的顯示寬)
      const range = shown === 'side-by-side'
        ? { min: config.min, max: layout.caps[action.panel] as number }
        : (layout.overlayRanges[action.panel] as { min: number; max: number })
      const displayedWidth = resolveDisplayedWidth(action.width, range)
      const type = state.contentType[action.panel]
      const next = recordAfterUserResize({ previousRecord: state.records[action.panel][type], displayedWidth, moved: action.moved })
      if (next === undefined || next === state.records[action.panel][type]) return state
      return { ...state, records: { ...state.records, [action.panel]: { ...state.records[action.panel], [type]: next } } }
    }
  }
}

// ─────────────────────────── 8. 鍵盤、焦點、展開狀態 ───────────────────────────

/**
 * 焦點在 AI agent 裡按 Esc(D:22):一次只關一層 —— 裡面開著選單 / 歷史浮層 / 確認框等暫時性 UI 時先關那一層;
 * 沒有了,浮層的 AI agent 才關閉(= 按 ×,開關紀錄變關);並排的 AI agent 永遠不因 Esc 關閉。
 * 輸入法組字中的 Esc 只取消組字(`lib/ime-composition.ts`,全 DS 同一條)。
 */
export function resolveAgentEscape(input: { display: PanelDisplay; innerLayerOpen: boolean; imeComposing: boolean }): 'none' | 'close-inner-layer' | 'close-agent' {
  if (input.imeComposing) return 'none'
  if (input.innerLayerOpen) return 'close-inner-layer'
  return input.display === 'overlay' ? 'close-agent' : 'none'
}

/**
 * 面板因版面被暫藏或被連帶關閉、焦點正好在它裡面時,焦點要去哪(WCAG 2.4.3;`app-shell.spec.md`「版面規則」焦點列):
 * 回 Main(`#app-shell-main`)—— 沿用 DS 既有後備「開啟者不在了 → `#app-shell-main`」(`lib/overlay-focus-return.ts`),
 * 延伸到「被版面收掉」是 AI 推導、列在 user 以 D:10 核准的 D:30 清單裡(保留項 K7)。user 沒寫、清單也沒有「改去別的面板」。
 * 焦點不在被收掉的面板裡 → null(不動)。
 */
export function resolveFocusAfterLayoutChange(input: {
  focusedPanel: AppShellPanelId | 'main' | null
  displayAfter: Record<AppShellPanelId, PanelDisplay>
}): 'main' | null {
  const { focusedPanel, displayAfter } = input
  if (focusedPanel === null || focusedPanel === 'main') return null
  const gone = displayAfter[focusedPanel] === 'hidden' || displayAfter[focusedPanel] === 'closed'
  if (!gone) return null
  return 'main' // K7:沿用既有後備
}

/** 開關鈕的 `aria-expanded` 跟著畫面:展開的內容此刻看得到(並排或浮層)才是 true;暫藏、關閉是 false(AI 推導,W3C APG Disclosure)。 */
export function isPanelExpanded(display: PanelDisplay): boolean {
  return display === 'side-by-side' || display === 'overlay'
}

// ─────────────────────────── 9. AgentPanel 單獨使用(N14)───────────────────────────

/** 只開 AI agent 一區時,其他兩區的寬度設定用不到;給一個合法的佔位(不參與任何計算)。 */
const UNUSED_RANGE: PanelWidthRange = { min: 1, initial: 1, max: 1 }

/**
 * AgentPanel 不在 AppShell 裡時「只算自己」(D:30 清單新增項 N14):同一支 `computeLayout`,只開 AI agent;
 * 宿主那一側的最小寬 = `hostMinWidth`(AgentPanel 的 `hostMinWidth` prop;沒給 = 0,也就是只要放得下面板自己的最小寬就並排)。
 * 沒有固定門檻,放得下就並排、放不下變浮層;可拉範圍、浮層範圍、實際顯示寬的算法與 AppShell 完全相同。
 */
export function computeStandaloneAgentLayout(input: {
  availableWidth: number
  hostMinWidth: number
  overlayEdgeGap: number
  range: PanelWidthRange
  target: number
}): { display: 'side-by-side' | 'overlay'; width: number; range: { min: number; max: number } } {
  const layout = computeLayout({
    availableWidth: input.availableWidth,
    mainMinWidth: input.hostMinWidth,
    railWidth: 0,
    overlayEdgeGap: input.overlayEdgeGap,
    open: { menu: false, right: false, agent: true },
    widths: { menu: UNUSED_RANGE, right: UNUSED_RANGE, agent: input.range },
    targets: { menu: 1, right: 1, agent: input.target },
    menuOverlayActive: false,
  })
  const display = layout.display.agent === 'overlay' ? 'overlay' : 'side-by-side'
  const range = display === 'overlay'
    ? (layout.overlayRanges.agent as { min: number; max: number })
    : { min: input.range.min, max: layout.caps.agent as number }
  return { display, width: layout.widths.agent as number, range: { min: range.min, max: range.max } }
}
