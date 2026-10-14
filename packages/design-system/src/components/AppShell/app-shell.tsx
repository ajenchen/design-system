// @benchmark-cited: 2026-05-19 — Mantine AppShell / Ant Layout / Material 3 Drawer / Atlassian Navigation System cite in app-shell.spec.md frontmatter.
/**
 * AppShell — web service page-level layout primitive。
 *
 * 組合 Menu(`Sidebar`)+ ChromeHeader + Main + Right panel(`AppShellAside`)+ AI agent(`AgentPanel`)成完整 page shell。
 * SSOT 邊界:本 composite own slot composition + layout mode + 四區版面(誰並排、誰變浮層、誰暫藏、可拉上限、寬度紀錄、水平捲動);
 * 不 own sidebar / header / AI agent 面板內容的視覺(各自 spec own)。
 *
 * ── 消費的 SSOT ──
 * - 四區版面規則:`app-shell.spec.md`「版面規則」(user 2026-10-14 規格);計算全部經 `./layout-model.ts` 的 `reduceLayout` / `deriveLayout`
 *   (本檔不算任何版面數字,只量寬度、轉交動作、把結果交給面板 —— 判定表 `scripts/test-app-shell-layout-model.mjs` 檢查這件事)
 * - 面板登記契約:`./app-shell-context.ts`(三個面板怎麼交出設定、拿回顯示方式)
 * - 拖寬把手:`patterns/resize-handle`(Right panel 左緣;Menu 與 AI agent 的把手在各自元件裡)
 * - 細列寬 `--sidebar-width-icon`、浮層另一側留白 `--layout-space-viewport-inset`、Menu 預設寬 `--sidebar-width-min` / `--sidebar-width`:量實際寬,不寫死
 * - Header:`patterns/header-canonical` ChromeHeader;Aside body:ScrollArea
 *
 * 對齊 Mantine AppShell compound API + Ant Layout slot 模式(per spec.md frontmatter cite)。
 *
 * Spec SSOT:`components/AppShell/app-shell.spec.md`
 */

import * as React from 'react'
import { X as XIcon } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { ResizeHandle } from '@/design-system/patterns/resize-handle/resize-handle'
import { cn } from '@/lib/utils'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import {
  PANEL_PLACEMENT_ORDER,
  deriveLayout,
  reduceLayout,
  resolveDisplayedWidth,
  resolveFocusAfterLayoutChange,
  validatePanelWidthRange,
  type AppShellPanelId,
  type LayoutAction,
  type LayoutResult,
  type LayoutState,
  type PanelDisplay,
  type PanelWidthRange,
} from './layout-model'
import {
  AppShellPanelsContext,
  AppShellRegistryContext,
  useAppShellPanel,
  type AppShellPanelHandle,
  type AppShellRegistry,
  type PanelWidthCallbacks,
  type PanelWidthRegistration,
} from './app-shell-context'

export type { PanelDisplay, PanelWidthRange }

// ── Types ────────────────────────────────────────────────────────────────────

type AppShellLayout = 'primary-sidebar' | 'primary-header'

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** primary-sidebar (Linear/Notion 派) | primary-header (GitHub/Slack 派);預設 primary-sidebar */
  layout?: AppShellLayout
  /**
   * **必填**:Main 的最小寬(px)。Main 不能拖寬、始終保留這個寬,並填滿並排面板沒用到的空間(「版面規則」§1;user 2026-10-14 U:5)。
   * DS 不替產品挑預設(AI 建議,工程決定)。設值時照「版面規則」§8 消費者指引:Main 最小寬 + 細列寬 + 每一種 Right 內容的最小寬
   * ≤ 產品要支援的最窄 desktop 版面寬,水平捲軸就幾乎不會出現。
   */
  mainMinWidth: number
  /** Menu(應傳 `<Sidebar>` primitive,per Consumer 紀律;型別 optional 不機械強制,對齊 spec「應」措辭)*/
  sidebar?: React.ReactNode
  /**
   * Local page header(永遠 render 在 main column 頂部,當前頁 actions / breadcrumb / page-level filter)。
   * 兩 layout mode 都會 render 此 slot — `primary-header` mode 多了 globalHeader 在上方,
   * **不取代** local header(per 2026-05-20 user clarification「primary-header = primary-sidebar + 一條 global header」)。
   */
  header?: React.ReactNode
  /**
   * Global header(僅 `primary-header` mode render)。橫跨整 viewport 的頂部 bar:
   * account avatar / workspace switcher / global search / notifications。
   * 對齊 GitHub top nav / Slack workspace bar / Gmail logo bar 慣例。
   * `primary-sidebar` mode 傳此 prop 會被忽略。
   */
  globalHeader?: React.ReactNode
  /** Right panel(`<AppShellAside>` sub-component);可選 */
  aside?: React.ReactNode
  /** Right panel 開關紀錄(受控);省略 = 非受控,初值關閉 */
  asideOpen?: boolean
  onAsideOpenChange?: (open: boolean) => void
  /** AI agent(`<AgentPanelDock>{({ close }) => <AgentPanel onClose={close}>…</AgentPanel>}</AgentPanelDock>`);可選 */
  agent?: React.ReactNode
  /** Main content;`<main>` landmark + padding=0 */
  children: React.ReactNode
}

export interface AppShellAsideProps {
  /** Required:`<aside aria-label>` 與標題列文字 */
  title: string
  /**
   * 目前顯示的內容類型(同一類型的不同資料共用寬度設定與寬度紀錄;「版面規則」§1)。省略 = `'default'`。
   * 換成另一種內容時:使用者主動換的,在同一個事件裡呼叫 `useAppShell().requestAside(新類型)`(會走 §4 的連帶關閉);
   * 沒呼叫 = 內容自己變的(U:11,不連帶關閉任何面板)。
   */
  contentType?: string
  /** 這種內容類型的最小 / 初始 / 最大寬(px);省略 = DS 預設 240 / 320 / 640(240 = `--sidebar-width-min`)。 */
  widthRange?: PanelWidthRange
  /** 產品自存的寬度紀錄(重新整理後還原);只在這種內容類型還沒有紀錄時使用。DS 不存寬度(§7)。 */
  defaultWidth?: number
  /** 一次調整寬度結束時的新紀錄(拖曳放開且有位移、鍵盤每按一下;只點一下不發)。要跨重新整理記住就存這個值。 */
  onWidthCommit?: (width: number) => void
  /** Children content */
  children: React.ReactNode
  className?: string
}

// ── Context(public:`useAppShell`)─────────────────────────────────────────────

interface AppShellContextValue {
  layout: AppShellLayout
  /** Right panel 的開關紀錄。 */
  asideOpen: boolean
  /** 改 Right panel 的開關紀錄;打開 = 使用者主動要求 Right 顯示內容(走 §4)。 */
  setAsideOpen: (open: boolean) => void
  /**
   * 使用者主動要求 Right panel 顯示內容(「版面規則」§4):關著就打開;開著時切到 `contentType`(省略 = 目前的內容類型,例如換看另一筆同類資料)。
   * Main、Right「新內容」、已開啟 AI agent 的最小寬(+ 細列)合計超過版面寬 → 關閉 AI agent。
   */
  requestAside: (contentType?: string) => void
  /**
   * 使用者在 AI agent 裡點了導向 Main 的東西(內部連結、「確認前往」)時呼叫,和產品自己的導航放在同一個事件裡
   * (「版面規則」§4 末條、`../AgentPanel/agent-panel.spec.md`「浮層時從代理導向 Main」;D:23):
   * AI agent 是浮層 → 收起(開關紀錄變關,對話與草稿保留),焦點在它裡面時回 `#app-shell-main`;並排 → 什麼都不動。
   * 目標是 modal 時,Dialog 開啟時自己聚焦(AppShell 不搶已經被接走的焦點)。
   */
  navigateFromAgent: () => void
  /** 各區此刻的顯示方式(並排 / 浮層 / 暫藏 / 關閉;`layout-model.ts` `PanelDisplay`)。 */
  display: Record<AppShellPanelId, PanelDisplay>
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null)

function useAppShell(): AppShellContextValue {
  const ctx = React.useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell / AppShellAside must be used within <AppShell>')
  return ctx
}

// ── 預設值(產品沒設時;「版面規則」§1)──────────────────────────────────────────

/** Right panel 預設初始 / 最大寬(沿用 2026-10-14 前的 ASIDE_WIDTH_DEFAULT / MAX;最小寬預設 = `--sidebar-width-min`,量實際值)。 */
const ASIDE_WIDTH_DEFAULT = 320
const ASIDE_WIDTH_MAX = 640
const PANEL_RESIZE_KEY_STEP = 16
const DEFAULT_CONTENT_TYPE = 'default'
/** 還沒登記的面板在模型裡的佔位設定(開關一定是關,不參與任何計算)。 */
const PLACEHOLDER_RANGE: PanelWidthRange = { min: 1, initial: 1, max: 1 }

// ── 量 token 的實際寬(細列 / 浮層留白 / Menu 預設寬)──────────────────────────────

interface TokenWidths {
  rail: number
  edgeGap: number
  sidebarMin: number
  sidebarInitial: number
}

const TOKEN_PROBES: ReadonlyArray<[keyof TokenWidths, string]> = [
  ['rail', 'var(--sidebar-width-icon)'],
  ['edgeGap', 'var(--layout-space-viewport-inset)'],
  ['sidebarMin', 'var(--sidebar-width-min)'],
  ['sidebarInitial', 'var(--sidebar-width)'],
]

/** 量之前的猜測值(token 的預設值;第一格畫面之前就會被實測值取代)。 */
const TOKEN_GUESS: TokenWidths = { rail: 48, edgeGap: 48, sidebarMin: 240, sidebarInitial: 240 }

// ── Skip-to-main link(a11y WCAG 2.4.1)───────────────────────────────────────

function SkipToMain() {
  return (
    <nav aria-label="Skip links">
      <a
        href="#app-shell-main"
        className={cn(
          'sr-only focus:not-sr-only',
          'focus:fixed focus:top-2 focus:left-2 focus:z-50',
          'focus:px-3 focus:py-2 focus:rounded-md',
          'focus:bg-surface focus:text-foreground focus:shadow-[var(--elevation-200)]',
          // 焦點框走全域外描邊(base.css)—— skip link 被鍵盤聚焦時 :focus-visible 成立。
          // 原本的 ring-primary 與 --ring 同值(semantic.css:337 `--ring: var(--primary)`),遷移零視覺差。
        )}
      >
        Skip to main content
      </a>
    </nav>
  )
}

// ── 版面引擎(只接線,規則全在 layout-model.ts)──────────────────────────────────

interface Registered {
  registration: PanelWidthRegistration
  callbacks: React.MutableRefObject<PanelWidthCallbacks>
}

interface OpenOwner {
  open: boolean
  setOpen: React.MutableRefObject<(open: boolean) => void>
}

/** 模型自己的狀態(寬度紀錄、內容類型、Menu 浮層旗標、版面寬);開關由各自的主人持有,每次 render 讀回來。 */
interface ModelOwned {
  availableWidth: number | null
  contentType: Record<AppShellPanelId, string>
  widthConfig: Record<AppShellPanelId, Record<string, PanelWidthRange>>
  records: Record<AppShellPanelId, Record<string, number>>
  menuOverlayActive: boolean
}

const INITIAL_MODEL: ModelOwned = {
  availableWidth: null,
  contentType: { menu: DEFAULT_CONTENT_TYPE, right: DEFAULT_CONTENT_TYPE, agent: DEFAULT_CONTENT_TYPE },
  widthConfig: {
    menu: { [DEFAULT_CONTENT_TYPE]: PLACEHOLDER_RANGE },
    right: { [DEFAULT_CONTENT_TYPE]: PLACEHOLDER_RANGE },
    agent: { [DEFAULT_CONTENT_TYPE]: PLACEHOLDER_RANGE },
  },
  records: { menu: {}, right: {}, agent: {} },
  menuOverlayActive: false,
}

/** 量之前用的版面寬:第一格畫面之前 layout effect 就會量到實際寬,這個值只活在第一次 render。 */
const guessAvailableWidth = () => (typeof window === 'undefined' ? 1440 : window.innerWidth)

const PANEL_SELECTOR = (panel: AppShellPanelId) => `[data-app-shell-panel="${panel}"]`

/** K7 焦點後備等 Main 脫離 inert 的上限(影格);同 agent-panel.stories.tsx `focusWhenOperable` 的 10 格。 */
const FOCUS_MAIN_RETRY_FRAMES = 10

/** 焦點此刻在哪一區(K7 焦點後備要知道「被收掉的面板裡是不是正握著焦點」)。 */
function focusedPanel(): AppShellPanelId | 'main' | null {
  const active = typeof document === 'undefined' ? null : document.activeElement
  if (!active || active === document.body) return null
  for (const panel of PANEL_PLACEMENT_ORDER) {
    for (const el of Array.from(document.querySelectorAll(PANEL_SELECTOR(panel)))) {
      if (el.contains(active)) return panel
    }
  }
  return document.getElementById('app-shell-main')?.contains(active) ? 'main' : null
}

/**
 * 由 AppShell 收掉面板的動作(視窗變化、內容變化、§4 連帶關閉、§4 末條「從 AI agent 導向 Main」):焦點若在被收掉的面板裡 → 回 Main(K7;
 * 導向 Main 那一條同時是 agent-panel.spec「目標是頁面時把焦點交給 Main」)。使用者自己關的(×、開關、Esc)不在此列。
 */
const LAYOUT_CAUSED: ReadonlySet<LayoutAction['type']> = new Set(['resize', 'set-main-min-width', 'set-content-type', 'request-right', 'navigate-main-from-agent'])

function useAppShellLayoutEngine(options: {
  mainMinWidth: number
  asideOpen: boolean
  setAsideOpenOwner: (open: boolean) => void
}) {
  const { mainMinWidth, asideOpen, setAsideOpenOwner } = options
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const probeRef = React.useRef<HTMLDivElement | null>(null)
  const [model, setModel] = React.useState<ModelOwned>(INITIAL_MODEL)
  const [widthRegs, setWidthRegs] = React.useState<Partial<Record<AppShellPanelId, Registered>>>({})
  const [openOwners, setOpenOwners] = React.useState<Partial<Record<'menu' | 'agent', OpenOwner>>>({})
  const [menuHasRail, setMenuHasRail] = React.useState(false)
  const [tokens, setTokens] = React.useState<TokenWidths>(TOKEN_GUESS)
  const [live, setLive] = React.useState<{ panel: AppShellPanelId; width: number } | null>(null)
  const [dragging, setDragging] = React.useState<AppShellPanelId | null>(null)

  const widthRegsRef = React.useRef(widthRegs)
  widthRegsRef.current = widthRegs
  const openOwnersRef = React.useRef(openOwners)
  openOwnersRef.current = openOwners
  const setAsideOpenOwnerRef = React.useRef(setAsideOpenOwner)
  setAsideOpenOwnerRef.current = setAsideOpenOwner

  // ── 這一格的模型狀態:模型自己的欄位 + 開關(讀各自的主人)+ 量到的寬 ──
  const records = React.useMemo(() => {
    // 受控紀錄(AgentPanel `width`)就是那種內容類型的紀錄
    const merged = { menu: { ...model.records.menu }, right: { ...model.records.right }, agent: { ...model.records.agent } }
    for (const panel of PANEL_PLACEMENT_ORDER) {
      const reg = widthRegs[panel]?.registration
      if (reg?.width !== undefined) merged[panel][reg.contentType] = reg.width
    }
    return merged
  }, [model.records, widthRegs])
  const state: LayoutState = {
    availableWidth: model.availableWidth ?? guessAvailableWidth(),
    mainMinWidth,
    railWidth: menuHasRail && widthRegs.menu ? tokens.rail : 0,
    overlayEdgeGap: tokens.edgeGap,
    open: {
      menu: !!widthRegs.menu && !!openOwners.menu?.open,
      right: !!widthRegs.right && asideOpen,
      agent: !!widthRegs.agent && !!openOwners.agent?.open,
    },
    contentType: model.contentType,
    widthConfig: model.widthConfig,
    records,
    menuOverlayActive: model.menuOverlayActive,
  }
  const stateRef = React.useRef(state)
  stateRef.current = state
  const layout: LayoutResult = deriveLayout(state)

  // ── 動作:一律經 reduceLayout;開關的變化交還給各自的主人 ──
  // K7 焦點後備在**動作當下**判定(用模型算出的下一個狀態):開關的主人要再 render 一次才回報新開關,等 render 後再看會看到舊的。
  // 記的是「焦點原本在哪一區」,搬的時候才分得出焦點還在那一區(該搬)還是已經被別的東西接走(不搶)
  const focusMainFromRef = React.useRef<AppShellPanelId | null>(null)
  const dispatch = React.useCallback((action: LayoutAction) => {
    const before = stateRef.current
    const next = reduceLayout(before, action)
    stateRef.current = next
    if (LAYOUT_CAUSED.has(action.type)) {
      const focused = focusedPanel()
      if (focused && focused !== 'main' && resolveFocusAfterLayoutChange({ focusedPanel: focused, displayAfter: deriveLayout(next).display }) === 'main') {
        focusMainFromRef.current = focused
      }
    }
    setModel((m) => ({
      ...m,
      availableWidth: next.availableWidth,
      contentType: next.contentType,
      widthConfig: next.widthConfig,
      records: next.records,
      menuOverlayActive: next.menuOverlayActive,
    }))
    if (next.open.menu !== before.open.menu) openOwnersRef.current.menu?.setOpen.current(next.open.menu)
    if (next.open.agent !== before.open.agent) openOwnersRef.current.agent?.setOpen.current(next.open.agent)
    if (next.open.right !== before.open.right) setAsideOpenOwnerRef.current(next.open.right)
    return next
  }, [])

  // K7:AppShell 把焦點所在的面板收掉了 → 回 #app-shell-main(lib/overlay-focus-return.ts 的同一個後備)。
  // 收起的是 AI agent 浮層時,Main 身上的 inert 要等 AgentPanel 的並存 effect 清理才拿掉 —— 而 AI agent 的開關由 Dock 經 layout effect
  // 登記回來,AppShell 要再一次 commit 才算出「關閉」,那之前 Main 仍是 inert、focus() 會落空(2026-10-14 實測:點 AI agent 裡的連結,焦點掉到 body)。
  // 所以 Main 還在 inert 底下時,下一個影格再試(最多 FOCUS_MAIN_RETRY_FRAMES 格;那一次 commit 在同一個 task 裡就會跑完)。
  // 焦點此刻已經不在 body、也不在被收掉的那一區(例:從 AI agent 導向的目標是 modal,Dialog 開啟時自己聚焦)→ 不搶。
  const focusMainFrameRef = React.useRef(0)
  React.useEffect(() => {
    const from = focusMainFromRef.current
    if (!from) return
    focusMainFromRef.current = null
    if (focusMainFrameRef.current) cancelAnimationFrame(focusMainFrameRef.current)
    let tries = 0
    const attempt = () => {
      focusMainFrameRef.current = 0
      const main = document.getElementById('app-shell-main')
      if (!main) return
      const active = document.activeElement
      const stillThere = Array.from(document.querySelectorAll(PANEL_SELECTOR(from))).some((el) => el.contains(active))
      if (active && active !== document.body && active !== main && !stillThere) return
      if (main.closest('[inert]')) {
        if (tries++ < FOCUS_MAIN_RETRY_FRAMES) focusMainFrameRef.current = requestAnimationFrame(attempt)
        return
      }
      main.focus({ preventScroll: true })
    }
    attempt()
  })
  React.useEffect(() => () => { if (focusMainFrameRef.current) cancelAnimationFrame(focusMainFrameRef.current) }, [])

  // ── 量:版面寬(ResizeObserver 量 AppShell 根節點看得到的寬,不量 window、不含水平捲出去的部分;§1)與 token 實際寬 ──
  React.useLayoutEffect(() => {
    const root = rootRef.current
    const probe = probeRef.current
    if (!root) return
    const measureRoot = () => {
      const w = root.clientWidth
      // 沒有版面時量到的 0 不代表任何事(同 AgentPanel / AgentConversation 的守衛)
      if (w > 0 && w !== stateRef.current.availableWidth) dispatch({ type: 'resize', availableWidth: w })
    }
    const measureTokens = () => {
      if (!probe) return
      const next = { ...TOKEN_GUESS }
      for (const [key] of TOKEN_PROBES) {
        const el = probe.querySelector<HTMLElement>(`[data-token-probe="${key}"]`)
        const w = el?.getBoundingClientRect().width ?? 0
        if (w > 0) next[key] = w
      }
      setTokens((prev) => (TOKEN_PROBES.every(([k]) => prev[k] === next[k]) ? prev : next))
    }
    measureTokens()
    measureRoot()
    const ro = new ResizeObserver((entries) => {
      if (entries.some((e) => e.target === root)) measureRoot()
      if (entries.some((e) => e.target !== root)) measureTokens()
    })
    ro.observe(root)
    // token 隨密度變(細列 md 48 / lg 68):探針的尺寸一變就重量
    if (probe) for (const el of Array.from(probe.children)) ro.observe(el)
    return () => ro.disconnect()
  }, [dispatch])

  // Main 最小寬換了(例:換頁)= 系統重排:模型讀的是 props(每次 render 現讀),這裡只為了讓 K7 焦點後備跑一次
  //(焦點所在的面板因此被暫藏時回 Main;動作經 reduceLayout,判定表 `set-main-min-width`)
  const prevMainMinWidthRef = React.useRef(mainMinWidth)
  React.useLayoutEffect(() => {
    if (prevMainMinWidthRef.current === mainMinWidth) return
    prevMainMinWidthRef.current = mainMinWidth
    dispatch({ type: 'set-main-min-width', mainMinWidth })
  }, [mainMinWidth, dispatch])

  // ── 開 Right = 使用者主動要求(U:12;已關閉的面板不會自動重開,U:11 —— 所以「打開」一定是使用者)──
  const pendingRequestRef = React.useRef<string | null>(null)
  /** 使用者剛要求 Right 顯示內容:這次排好之後,若它被水平捲出看得到的範圍,捲到看得到(§8 末條,AI 推導;原則 D:31)。 */
  const revealRightRef = React.useRef(false)
  const prevAsideOpenRef = React.useRef(asideOpen)
  React.useLayoutEffect(() => {
    const was = prevAsideOpenRef.current
    prevAsideOpenRef.current = asideOpen
    if (asideOpen && !was) revealRightRef.current = true
    if (asideOpen && !was && widthRegsRef.current.right) {
      pendingRequestRef.current = null
      dispatch({ type: 'request-right', contentType: widthRegsRef.current.right.registration.contentType })
    }
  }, [asideOpen, dispatch])

  // 使用者要求的 Right 必須端到眼前(原則:user D:12 問句、AI D:31 確認,app-shell.spec.md「版面規則」開頭;本條是 §8 的 AI 推導):
  // Right 放不下仍並排(§3)時殼會水平捲,新開的 Right 可能落在捲軸右邊、只露出一截。排好之後(Right 已經畫出來)把唯一的捲動容器
  // 捲到 Right 整個看得到 —— 只捲 AppShell 自己的捲動容器(不用 scrollIntoView:它會連帶捲動頁面 / 文件)。
  // 右緣對齊看得到的右緣;Right 比看得到的範圍還寬時(DS 不為過小視窗設計)以左緣為準。
  // 等到下一個影格才量:這次要求在同一輪可能還會連帶排版(§4 關 AI agent、換內容類型後重新登記寬度),要量排完的樣子。
  // 之後 Menu 的寬度過渡讓內容變窄時,瀏覽器把捲動位置夾回最大值,Right 仍貼右緣(放不下時 Menu 只會變窄,不會變寬)。
  const revealFrameRef = React.useRef(0)
  React.useLayoutEffect(() => {
    if (!revealRightRef.current) return
    if (!asideOpen) { revealRightRef.current = false; return }
    if (revealFrameRef.current) return
    revealFrameRef.current = requestAnimationFrame(() => {
      revealFrameRef.current = 0
      if (!revealRightRef.current) return
      const root = rootRef.current
      const aside = root?.querySelector<HTMLElement>(`aside${PANEL_SELECTOR('right')}`)
      const scroller = root?.querySelector<HTMLElement>('[data-app-shell-scroll]')
      if (!aside || !scroller) return // Right 還沒畫出來(內容類型還在登記)→ 下一次 commit 再排
      revealRightRef.current = false
      const view = scroller.getBoundingClientRect()
      const box = aside.getBoundingClientRect()
      const overRight = box.right - view.right
      const overLeft = view.left - box.left
      if (overRight > 0) scroller.scrollLeft += Math.min(overRight, box.left - view.left)
      else if (overLeft > 0) scroller.scrollLeft -= overLeft
    })
  })
  React.useEffect(() => () => { if (revealFrameRef.current) cancelAnimationFrame(revealFrameRef.current) }, [])

  const registry = React.useMemo<AppShellRegistry>(() => ({
    registerWidth: (panel, registration, callbacks) => {
      const problem = validatePanelWidthRange(registration.widthRange)
      if (problem) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[AppShell] ${panel} 內容類型「${registration.contentType}」的寬度設定不合法 —— ${problem}(「版面規則」§1)`)
        }
        return () => {}
      }
      const entry: Registered = { registration, callbacks }
      widthRegsRef.current = { ...widthRegsRef.current, [panel]: entry }
      setWidthRegs((prev) => ({ ...prev, [panel]: entry }))
      // 設定併進模型(累積:換回舊類型時仍查得到它的最小寬)+ 產品自存的紀錄當成這種類型的紀錄(還沒有時)
      const s = stateRef.current
      const widthConfig = { ...s.widthConfig, [panel]: { ...s.widthConfig[panel], [registration.contentType]: registration.widthRange } }
      const seeded = registration.defaultWidth !== undefined && s.records[panel][registration.contentType] === undefined
      const recordsNext = seeded
        ? { ...s.records, [panel]: { ...s.records[panel], [registration.contentType]: registration.defaultWidth as number } }
        : s.records
      stateRef.current = { ...s, widthConfig, records: recordsNext }
      setModel((m) => ({
        ...m,
        widthConfig: { ...m.widthConfig, [panel]: { ...m.widthConfig[panel], [registration.contentType]: registration.widthRange } },
        records: seeded ? { ...m.records, [panel]: { ...m.records[panel], [registration.contentType]: registration.defaultWidth as number } } : m.records,
      }))
      // 內容類型換了:使用者在同一個事件裡要求過這種內容 → 走 §4;沒有 → 內容自己變的(U:11)
      if (stateRef.current.contentType[panel] !== registration.contentType) {
        const requested = panel === 'right' && pendingRequestRef.current === registration.contentType && stateRef.current.open.right
        if (requested) {
          pendingRequestRef.current = null
          dispatch({ type: 'request-right', contentType: registration.contentType })
        } else {
          dispatch({ type: 'set-content-type', panel, contentType: registration.contentType })
        }
      }
      return () => {
        if (widthRegsRef.current[panel] !== entry) return
        const { [panel]: _gone, ...rest } = widthRegsRef.current
        widthRegsRef.current = rest
        setWidthRegs((prev) => {
          if (prev[panel] !== entry) return prev
          const { [panel]: _removed, ...others } = prev
          return others
        })
      }
    },
    registerOpen: (panel, registration, setOpen) => {
      if (panel === 'right') return () => {}
      const owner: OpenOwner = { open: registration.open, setOpen }
      openOwnersRef.current = { ...openOwnersRef.current, [panel]: owner }
      const s = { ...stateRef.current, open: { ...stateRef.current.open, [panel]: registration.open } }
      stateRef.current = s
      setOpenOwners((prev) => ({ ...prev, [panel]: owner }))
      // 「已是浮層」只在 Menu 仍是浮層時成立(U:25):開關被主人從外面改掉(不經 Menu 開關)之後,模型裡的旗標同步歸零
      // (= layout-model `normalizeMenuOverlay`;經 reduceLayout 的動作本來就會做,這裡補「主人自己改」那一條路)
      if (panel === 'menu' && s.menuOverlayActive && deriveLayout(s).display.menu !== 'overlay') {
        stateRef.current = { ...s, menuOverlayActive: false }
        setModel((m) => ({ ...m, menuOverlayActive: false }))
      }
      return () => {
        if (openOwnersRef.current[panel] !== owner) return
        const { [panel]: _gone, ...rest } = openOwnersRef.current
        openOwnersRef.current = rest
        setOpenOwners((prev) => {
          if (prev[panel] !== owner) return prev
          const { [panel]: _removed, ...others } = prev
          return others
        })
      }
    },
    registerMenuRail: (hasRail) => {
      setMenuHasRail(hasRail)
      return () => setMenuHasRail(false)
    },
    toggleMenu: () => {
      if (!widthRegsRef.current.menu) return
      dispatch({ type: 'toggle-menu' })
    },
    dismissMenuOverlay: () => dispatch({ type: 'dismiss-menu-overlay' }),
    railWidth: tokens.rail,
    menuDefaultRange: { min: tokens.sidebarMin, initial: tokens.sidebarInitial, max: tokens.sidebarInitial },
  }), [dispatch, tokens])

  const requestAside = React.useCallback((contentType?: string) => {
    const right = widthRegsRef.current.right
    revealRightRef.current = true
    if (!asideOpen) {
      pendingRequestRef.current = contentType ?? null
      setAsideOpenOwnerRef.current(true)
      return
    }
    if (!right) return
    if (contentType === undefined || contentType === right.registration.contentType) {
      dispatch({ type: 'request-right', contentType: right.registration.contentType })
    } else {
      // 新內容類型的設定要等 AppShellAside 以那種類型登記時才查得到 —— 到時候(同一個事件的 commit 裡)走 §4
      pendingRequestRef.current = contentType
    }
  }, [asideOpen, dispatch])

  // §4 末條(D:23):AI agent 浮層時從 agent 導向 Main → AI agent 收起;並排時不動(判斷在模型 `navigate-main-from-agent`)
  const navigateFromAgent = React.useCallback(() => { dispatch({ type: 'navigate-main-from-agent' }) }, [dispatch])

  // ── 每個面板此刻的樣子 + 調寬接口 ──
  const commitResize = React.useCallback((panel: AppShellPanelId, width: number) => {
    const next = dispatch({ type: 'user-resize', panel, width, moved: true })
    setLive(null)
    // 新紀錄 = 此刻顯示的寬(D:19);交給產品自存(§7「DS 不存」)
    const record = next.records[panel][next.contentType[panel]]
    if (record !== undefined) widthRegsRef.current[panel]?.callbacks.current.onWidthCommit?.(record)
  }, [dispatch])

  const panels = React.useMemo(() => {
    const handleOf = (panel: AppShellPanelId): AppShellPanelHandle => {
      const display = layout.display[panel]
      const config = state.widthConfig[panel][state.contentType[panel]] ?? PLACEHOLDER_RANGE
      const range = display === 'side-by-side'
        ? { min: config.min, max: layout.caps[panel] as number }
        : display === 'overlay'
          ? { min: (layout.overlayRanges[panel] as { min: number }).min, max: (layout.overlayRanges[panel] as { max: number }).max }
          : undefined
      let width = layout.widths[panel]
      if (range && live?.panel === panel) width = resolveDisplayedWidth(live.width, range)
      return {
        display,
        width,
        range,
        resizing: dragging === panel,
        onResize: (next) => {
          if (!range) return
          const shown = resolveDisplayedWidth(next, range)
          setLive({ panel, width: shown })
          widthRegsRef.current[panel]?.callbacks.current.onWidthChange?.(shown)
        },
        onResizeCommit: (next) => commitResize(panel, next),
        onDraggingChange: (isDragging) => {
          setDragging(isDragging ? panel : null)
          if (!isDragging) setLive(null)
        },
      }
    }
    return { menu: handleOf('menu'), right: handleOf('right'), agent: handleOf('agent') }
    // layout / state 每格重算;依賴用它們的組成值
  }, [layout, state.widthConfig, state.contentType, live, dragging, commitResize])

  return { rootRef, probeRef, layout, registry, panels, requestAside, navigateFromAgent, availableWidth: state.availableWidth }
}

// ── AppShell root ────────────────────────────────────────────────────────────

// code-quality-allow: long-function — AppShell root = 兩種 layout mode 的 JSX + 引擎接線;拆開會把同一份 slot 結構寫兩次
const AppShell = React.forwardRef<HTMLDivElement, AppShellProps>(
  (
    {
      layout = 'primary-sidebar',
      mainMinWidth,
      sidebar,
      header,
      globalHeader,
      aside,
      asideOpen: asideOpenProp,
      onAsideOpenChange,
      agent,
      children,
      className,
      style,
      ...props
    },
    ref
  ) => {
    React.useEffect(() => {
      if (process.env.NODE_ENV !== 'production' && !(Number.isFinite(mainMinWidth) && mainMinWidth > 0)) {
        console.warn(`[AppShell] mainMinWidth 必須是正數(「版面規則」§1),收到 ${String(mainMinWidth)}`)
      }
    }, [mainMinWidth])
    const [asideOpenInternal, setAsideOpenInternal] = React.useState(false)
    const isControlled = asideOpenProp !== undefined
    const asideOpen = isControlled ? asideOpenProp : asideOpenInternal

    const setAsideOpenOwner = React.useCallback(
      (open: boolean) => {
        if (!isControlled) setAsideOpenInternal(open)
        onAsideOpenChange?.(open)
      },
      [isControlled, onAsideOpenChange]
    )

    const engine = useAppShellLayoutEngine({ mainMinWidth, asideOpen, setAsideOpenOwner })
    const { layout: result, registry, panels, requestAside, navigateFromAgent, rootRef, probeRef } = engine

    const setAsideOpen = React.useCallback(
      (open: boolean) => {
        if (open === asideOpen) return
        setAsideOpenOwner(open)
      },
      [asideOpen, setAsideOpenOwner]
    )

    // ── Keyboard: cmd+. toggle Right panel(打開算使用者主動要求,走 §4)──
    // ⌘B Menu toggle by Sidebar SSOT(本 component 不重覆 register)
    React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        // 輸入法組字中不接(與 Sidebar ⌘B 同一條;判準 lib/ime-composition.ts)
        if (isImeComposing(e)) return
        if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          setAsideOpen(!asideOpen)
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [asideOpen, setAsideOpen])

    const ctxValue = React.useMemo<AppShellContextValue>(
      () => ({ layout, asideOpen, setAsideOpen, requestAside, navigateFromAgent, display: result.display }),
      [layout, asideOpen, setAsideOpen, requestAside, navigateFromAgent, result.display]
    )

    const setRootRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      },
      [ref, rootRef]
    )

    // 水平捲動(§8):Main 與並排面板的最小寬(+ 細列)合計超過版面寬 → 各自維持最小寬、整個殼水平捲。
    // 列的最小寬 = 那個合計(模型的 horizontalOverflow + 版面寬);不超過時不設,Main 照常填滿。
    const rowMinWidth = result.horizontalOverflow > 0 ? engine.availableWidth + result.horizontalOverflow : undefined

    // Main 欄:最小寬 = mainMinWidth(U:5「始終保留最小寬度」;2026-10-14 前是 min-w-0,會被壓到 0)
    const mainColumn = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minWidth: mainMinWidth }} data-app-shell-main-column="">
        {header && (
          // Header 在 main column 內(main col sibling,非 main descendant)。ChromeHeader 自
          // 2026-05-20 起 render `<header>`(chrome-header.tsx);依 W3C HTML-AAM,`<div>` wrapper
          // 不 scope out banner(只有 main/article/aside/nav/section 能)→ 仍得 implicit banner ✓
          // (對齊 app-shell.spec.md「W3C ARIA in HTML banner rule」段)。
          <div className="flex-shrink-0">{header}</div>
        )}
        <main
          id="app-shell-main"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto focus-visible:focus-ring-inset"
        >
          {children}
        </main>
      </div>
    )

    // 版面列:[Menu][Main 欄][Right panel][AI agent]。列**不設定位**(static):AI agent 浮層與它的遮罩以根節點定位,
    // 不跟著水平捲走、也不被捲動容器裁掉(§8「浮層與遮罩釘在看得到的視窗範圍」)。
    const row = (
      <div className="flex min-h-0 w-full flex-1" style={rowMinWidth ? { minWidth: rowMinWidth } : undefined} data-app-shell-row="">
        {sidebar}
        {mainColumn}
        {aside}
        {agent}
      </div>
    )

    return (
      <AppShellContext.Provider value={ctxValue}>
        <AppShellRegistryContext.Provider value={registry}>
          <AppShellPanelsContext.Provider value={panels}>
            <div
              ref={setRootRef}
              // 根節點:定位脈絡(浮層、遮罩、AI agent 入口鈕以它為準)+ 不捲;不設 z-index(spec「Dialog / Sheet / Popover 互動」)
              className={cn('relative h-svh w-full overflow-hidden bg-canvas', className)}
              style={style}
              data-app-shell=""
              {...props}
            >
              <SkipToMain />
              {/* 唯一的捲動容器:水平可捲、垂直不捲(垂直捲動在各區自己裡面;不會出現兩條垂直捲軸)。不設定位,理由同上 */}
              <div className="flex h-full w-full flex-col overflow-x-auto overflow-y-hidden" data-app-shell-scroll="">
                {layout === 'primary-header' && globalHeader && (
                  // Row 1:Global header(account / workspace switcher / notifications);跟著整個殼一起水平捲
                  <div className="flex-shrink-0" style={rowMinWidth ? { minWidth: rowMinWidth } : undefined}>{globalHeader}</div>
                )}
                {row}
              </div>
              {/* token 實際寬的探針(細列 / 浮層留白 / Menu 預設寬;不可見、不佔版面、不在無障礙樹) */}
              <div ref={probeRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden">
                {TOKEN_PROBES.map(([key, width]) => (
                  <div key={key} data-token-probe={key} className="h-px" style={{ width }} />
                ))}
              </div>
            </div>
          </AppShellPanelsContext.Provider>
        </AppShellRegistryContext.Provider>
      </AppShellContext.Provider>
    )
  }
)
AppShell.displayName = 'AppShell'

// ── AppShellAside sub-component(Right panel)────────────────────────────────

/**
 * AppShellAside — Right panel:**只有並排一種形態**(「版面規則」§3:放不下仍然並排,user D1「我就是要並排」)。
 *   - Vertical extent:primary-sidebar → 頂天立地 / primary-header → header 下方
 *   - 寬度 = 這種內容類型的最小 / 初始 / 最大 + 寬度紀錄(§1、§7);左緣 `ResizeHandle` 可拖寬,上限 = AppShell 給的可拉上限(§5)
 *   - 2026-10-14 前「viewport < 768 走右側 Sheet」整支退場(D:30 清單 #49)
 */
const AppShellAside = React.forwardRef<HTMLElement, AppShellAsideProps>(
  ({ title, contentType = DEFAULT_CONTENT_TYPE, widthRange, defaultWidth, onWidthCommit, children, className }, ref) => {
    const { setAsideOpen } = useAppShell()
    const registry = React.useContext(AppShellRegistryContext)
    const range = widthRange ?? {
      min: registry?.menuDefaultRange.min ?? TOKEN_GUESS.sidebarMin,
      initial: ASIDE_WIDTH_DEFAULT,
      max: ASIDE_WIDTH_MAX,
    }
    const panel = useAppShellPanel('right', { contentType, widthRange: range, defaultWidth }, { onWidthCommit })
    if (!panel || panel.display !== 'side-by-side' || panel.width === undefined || !panel.range) return null

    return (
      <aside
        ref={ref}
        aria-label={title}
        data-app-shell-panel="right"
        className={cn(
          // 不 `overflow-hidden`:左緣把手 7px 命中區有 3px 在面板外側(宿主那側),裁掉就只剩 4px 點得到
          //(resize-handle.spec.md「命中區」;AgentPanel 2026-09-29 OE1 同一條)。橫向不裁、縱向 clip。
          // shrink-0:Main 有最小寬以後,flex 不得把 Right panel 壓窄 —— 放不下時整個殼水平捲(§8;D:30 清單 #113)。
          'relative flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-y-clip bg-surface',
          className
        )}
        style={{ width: panel.width }}
      >
        {/* 分隔線只有一個 owner:左緣把手的 1px line(DataTable 欄間 / AgentPanel 同款);2026-10-14 前是 `border-l border-divider` */}
        <ResizeHandle
          direction="horizontal"
          position="start"
          value={panel.width}
          min={panel.range.min}
          max={panel.range.max}
          step={PANEL_RESIZE_KEY_STEP}
          ariaLabel="調整面板寬度" // i18n-allow: DS 預設文案
          onValueChange={panel.onResize}
          onValueCommit={panel.onResizeCommit}
          onDraggingChange={panel.onDraggingChange}
        />
        {/* always-on header(title + close X)+ body(ScrollArea;padding 由內容自帶,spec「Aside body padding」)。
            2026-05-20 migrate 消費 ChromeHeader primitive(header-canonical.spec.md「6. Background ownership」:
            nested chrome header 透明繼承 parent,aside 自身已 bg-surface)。 */}
        <ChromeHeader>
          <h2 className="text-body-lg font-medium flex-1 truncate">{title}</h2>
          <Button
            iconOnly
            dismiss
            size="sm"
            startIcon={XIcon}
            aria-label="關閉"
            onClick={() => setAsideOpen(false)}
          />
        </ChromeHeader>
        <ScrollArea className="flex-1 min-h-0">
          {children}
        </ScrollArea>
      </aside>
    )
  }
)
AppShellAside.displayName = 'AppShellAside'

// ── Exports ──────────────────────────────────────────────────────────────────

// Story auto-compile metadata — canonical migration(2026-08-01)
// AppShell is a page-level composition primitive. `layout` is a structural mode,
// not a visual variant axis; slot controls own their interaction states and sizes.
export const appShellMeta = {
  component: 'AppShell',
  family: 'composite',
  variants: {},
  sizes: {},
  states: [],
  tokens: {
    bg: ['bg-canvas', 'bg-surface'],
    fg: ['text-foreground'],
    border: ['border-divider'],
    ring: ['focus-ring-inset', '--ring'],
  },
  defaultVariant: undefined,
  defaultSize: undefined,
} as const

// code-quality-allow: dead-export useAppShell — public compound API hook(consumer 可自拼 custom aside layout、
// 讀各區顯示方式 `display`、使用者要求 Right 顯示內容時呼叫 `requestAside`;對齊 Radix `useDialogContext` / MUI `useFormControl` 慣例)。
// 內部 AppShellAside 已消費,audit script 抓「無 cross-file import」是 false positive(2026-05-21 D2 codify)。
export { AppShell, AppShellAside, useAppShell }
