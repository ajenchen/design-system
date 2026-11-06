// code-quality-allow: file-size foundational composite family(9 元件一家族檔,同 Sidebar 前例)
/**
 * AgentPanel 家族 — 智慧代理面板(9 元件;附屬資產 AgentLogo/AgentFab 另檔)。
 *
 * ── 消費的 SSOT ──
 * - 容器:右側欄=bg-surface + 左緣分隔線(可拖時 = ResizeHandle 的 1px line);形態(並排 / 浮層)、可拉範圍、寬度紀錄
 *   = AppShell「版面規則」(app-shell.spec.md;在 AppShell 裡由 AppShell 算,單獨使用時同一支 layout-model 只算自己);
 *   預設寬 360 / 400 / 640(本檔 AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX,沒有 CSS token);把手=ResizeHandle pattern,
 *   鍵盤等價=WAI-ARIA separator 同 DataTable 欄寬慣例;開合 --motion-duration-surface。
 * - 標題列:ChromeHeader(header-canonical;chrome 內控件一律 sm);品牌區=gap-2+24 標誌;
 *   標題+chevron=單一複合觸發鈕:**原生 `<button>`,不包 Button 殼**(Button 會多出左 9 / 右 5 內距
 *   與 28 高的懸停底,見 agent-panel.spec.md「禁用 Button 殼」);語意仍同 Polaris disclosure /(來源:https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/Button/Button.tsx#L35-L36)
 *   Combobox 觸發器,chevron=裝飾性指示(inline-action.spec.md Q1);
 *   ButtonDivider 於 gap-2 cluster(action-bar 規則 3)。
 *   **固定構件恆渲染**:+ / × / 標題觸發鈕不隨 callback 有無消失(2026-09-02 根因修正)。
 * - 歷史浮層:Popover+Command+MenuItem,列組裝逐字照 select-menu.tsx 原型(外層 CommandItem 單一
 *   互動 owner、內層 MenuItem role=presentation 透明、群組 heading、CommandSeparator、Empty);
 *   行內動作=ItemSuffix hoverReveal + ItemInlineAction(懸停/鍵盤 focus-visible 浮出);思考列=CircularProgress 16。
 * - 訊息:氣泡 bg-secondary/rounded-md/8/12;附件=Chip assist 分支(chip.spec.md),相互 4;
 *   輪距 40=8+24(Button text xs)+8。
 * - 思考塊:Radix Collapsible+disclosureMotion(tokens/motion/disclosure-motion.ts;與 TreeView / Accordion 同一份);chevron=accordion 慣例
 *   (裝飾指示、色同 Select 觸發器 chevron);微光僅標題+最新行(agent-panel.css);完成步驟 fg-secondary。
 * - 輸入盒:欄位家族內距(--field-control-py-md/--field-px/text-body;32 等高鐵律);
 *   附件列=Tag md 單列 + 超寬 +N(OverflowTagList,與 Combobox 多選同一份量測);送出/停止=Button primary xs。
 * - 決策卡:SurfaceHeader(compact)+SurfaceFooter(overlay-surface);選項=灰底卡(--secondary、
 *   rounded-md、內距 8/12、整卡可點)包 RadioGroup md(Popover all-sm 律之拍板豁免;footer 鈕 sm 守律);
 *   一題一問步進(跳過 / 上一題 / 下一題 / 送出);N>1 才顯示「n / N」小標;淡入+下滑 --motion-duration-overlay;
 *   選填單選題有選取時 footer 左側「清除選取」(選取類浮層 footer 順序,overlay-surface.spec.md;Select clearable 的有值才出現 / 焦點交回)。
 * - 改名/刪除:Dialog(header md+X;body Field+Input;footer md 鈕;刪除=primary+danger;
 *   form-validation:儲存 dirty 規則、空名 blur 顯錯;Esc=Dialog 取消)。
 * - 空狀態:Empty icon slot 接 AgentLogo 招喚態。
 * 全表:agent-panel.spec.md。
 */
import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import {
  createLucideIcon,
  ArrowUp,
  ChevronDown,
  Copy,
  MessageSquare,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlayCoexistence, CoexistenceMask } from '@/design-system/lib/overlay-coexistence'
import { useCursorMover } from '@/design-system/hooks/use-input-modality'

/**
 * 停止實心正方:12/24 grid(= Material Symbols `stop` 480/960)→ 8px @ Button icon 16。(來源:https://github.com/google/material-design-icons/blob/10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7/symbols/web/stop/materialsymbolsoutlined/stop_24px.svg https://github.com/carbon-design-system/carbon/blob/593de4deda2d96f47f71cdfc9b30d07bd1302304/packages/icons/src/svg/32/stop.svg)
 * lucide Square 填滿後 20/24 = 13.3px,比 ArrowUp/Plus(14/24 線稿)視覺偏重,故自繪
 * (2026-09-02 user 抓「太巨大」;rx 1.5 ≈ Carbon 2/20、lucide 2/18 圓角比例)。
 */
const StopFilled = createLucideIcon('StopFilled', [
  ['rect', { x: '6', y: '6', width: '12', height: '12', rx: '1.5', fill: 'currentColor', stroke: 'none', key: 'stop' }],
])
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { fieldChromeStyles, keepFieldFocusBeforeUnmount } from '@/design-system/components/Field/field-wrapper'
import {
  SurfaceHeader,
  SurfaceFooter,
  COMPACT_HEADER_SLOT,
} from '@/design-system/patterns/overlay-surface/overlay-surface'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/design-system/components/Popover/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/design-system/components/Command/command'
import { captureFocusOrigin, returnFocusToOpener } from '@/design-system/lib/overlay-focus-return'
import { useEscapeRegion } from '@/design-system/lib/overlay-escape'
import { isOwnPointerTarget, keepFocusOnPointerPress } from '@/design-system/lib/pointer-press'
import { cancelAfterPress, isPointerPressed, retainPressTracking, runAfterPress } from '@/design-system/lib/press-settle'
import { focusAfterCollectionRemoval } from '@/design-system/lib/collection-removal-focus'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import {
  ItemInlineAction,
  ItemSuffix,
} from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ResizeHandle } from '@/design-system/patterns/resize-handle/resize-handle'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { OverflowTagList, TAG_ROW_CONTAINER_CLASS } from '@/design-system/components/OverflowIndicator/overflow-tag-list'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'
import { Chip } from '@/design-system/components/Chip/chip'
import { Tag } from '@/design-system/components/Tag/tag'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog/dialog'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import { disclosureMotion, disclosureIndicatorMotion } from '@/design-system/tokens/motion/disclosure-motion'
import { overlayIndicatorMotion } from '@/design-system/tokens/motion/overlay-motion'
import { AgentLogo, type AgentLogoState } from './agent-panel-logo'
import { AgentPanelDockContext } from './agent-panel-dock-context'
import {
  useAppShellPanel,
  useAppShellPanelOpen,
  useAppShellRegistry,
  type PanelWidthRange,
} from '@/design-system/components/AppShell/app-shell-context'
import {
  computeStandaloneAgentLayout,
  recordAfterUserResize,
  resolveDisplayedWidth,
} from '@/design-system/components/AppShell/layout-model'
import './agent-panel.css'

/* ────────────────────────────────────────────────────────────────────────────
 * 1. AgentPanel(容器;可拖拉寬度)
 * ──────────────────────────────────────────────────────────────────────── */

/** 產品沒設時的寬度設定(spec「Token」節:面板寬只住這裡,2026-10-15 退役 `--agent-panel-width`)。範圍 / 紀錄 / 實際顯示寬的規則住 app-shell.spec.md「版面規則」§1、§5、§7、§9。 */
const PANEL_WIDTH_DEFAULT = 400
const PANEL_WIDTH_MIN = 360
const PANEL_WIDTH_MAX = 640
const PANEL_RESIZE_KEY_STEP = 16
const DEFAULT_WIDTH_RANGE: PanelWidthRange = { min: PANEL_WIDTH_MIN, initial: PANEL_WIDTH_DEFAULT, max: PANEL_WIDTH_MAX }
const DEFAULT_CONTENT_TYPE = 'conversation'

/** 面板形態:並排(flex 兄弟)或浮層(absolute 貼右、照紀錄寬、左側至少留 `--layout-space-viewport-inset`);同時標在根節點 `data-agent-panel-mode`。 */
export type AgentPanelMode = 'side-by-side' | 'overlay'

export interface AgentPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 面板開合;false 時不渲染(關閉後由 AgentFab 承接入口,兩者互斥)。 */
  open?: boolean
  /** 目前顯示的內容類型(同一類型的不同資料共用寬度設定與紀錄;`app-shell.spec.md`「版面規則」§1)。省略 = `'conversation'`。 */
  contentType?: string
  /** 這種內容類型的最小 / 初始 / 最大寬(px);省略 = DS 預設 360 / 400 / 640(`AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX`)。 */
  widthRange?: PanelWidthRange
  /** 受控的寬度紀錄(px);省略=非受控。實際顯示寬 = 紀錄夾在此刻允許的範圍(「版面規則」§7)。 */
  width?: number
  /** 非受控的起始紀錄(產品自存、重新整理後還原);省略 = 沒調過,以 `widthRange.initial` 為目標。 */
  defaultWidth?: number
  /** 寬度變更時回報(**拖曳中每一格都發**,受控 consumer 才有即時回饋)。 */
  onWidthChange?: (width: number) => void
  /** 一次調整結束時回報新紀錄(拖曳放開且有位移、鍵盤每按一下;只點一下不發 —— 「版面規則」§7)。要落地儲存的接這個;DS 不持久化,產品自存。 */
  onWidthCommit?: (width: number) => void
  /** 可拖拉(左緣把手;並排與浮層都可拖,U:4、U:55);預設 true。 */
  resizable?: boolean
  /**
   * **不在 AppShell 裡**單獨使用時,宿主那一側的最小寬(px)。面板「只算自己」(D:30 清單 N14):宿主寬 − 這個值 ≥ 面板最小寬 → 並排,否則浮層;
   * 沒有固定門檻(`../AppShell/layout-model.ts` `computeStandaloneAgentLayout`)。省略 = 0(只要放得下面板自己的最小寬就並排)。
   * 在 AppShell 裡不用 —— 由 AppShell 的 `mainMinWidth` 與其他面板一起排(「版面規則」§3)。
   */
  hostMinWidth?: number
  /**
   * 浮層態(面板蓋在宿主上)仍要可用的節點 —— 與 Dialog 的 `persistentElements` 同一份契約、
   * 同一支 primitive(`lib/overlay-coexistence.ts`)。v14 條 B 說的「宿主暫不可操作」只講**宿主**;
   * 宿主之外的瀏覽器 chrome(網址列、上一頁 / 下一頁、重新整理)不是宿主,浮層時不得被抑制
   * (2026-09-09 user 抓到範例變成滿版時上方模擬的網址列完全點不了)。
   * 並排態不抑制任何東西,此 prop 無作用。面板自己永遠在保留集合裡,不必傳。
   */
  persistentElements?: () => Element[]
  /**
   * 形態(並排 / 浮層)改變時回報;面板看得到、形態算出來之後才發第一次,之後只在形態真的翻轉時發。
   * 用途:浮層態下「代理內導向 Main 的動作」(內部連結、有網址的 modal)要把代理收成入口鈕、讓 Main 顯示目標
   * (v14 條 B,2026-09-09 user 推翻「抽屜保持開啟」的 AI 推導;2026-10-14 D:23 保留)。**面板不知道連結**,所以收合是消費端的責任:
   * 用這個回呼記住目前形態,在自己的內部導航裡「浮層且開著 → `onOpenChange(false)`」;並排態不收。
   * 詳 spec「形態:並排 / 浮層」後段「浮層時從代理導向 Main」。
   */
  onModeChange?: (mode: AgentPanelMode) => void
  /**
   * 浮層態下**點擊面板外的遮罩**或**按 Esc**(面板裡沒有更內層時)通知消費端關閉面板
   * (遮罩:2026-09-17 user 裁示,取代 2026-09-16 的「點了不關」;Esc:2026-10-14 D:22,見 spec「Esc 與關閉語意」)。
   *
   * 命名依據 `ds-canonical/references/props-naming.md`:`onClose` = 「關閉 overlay session —— 浮層關閉回背景」,
   * 與 Dialog / Sheet / Popover / FileViewer 同一個名字同一個語意(不是 `onDismiss`,那是「暫時訊息被忽略」)。
   *
   * **面板不自己關**:`open` 一直是消費端控的(同 `onModeChange` 那段的分工),所以這裡只發通知。
   * 並排態沒有遮罩、Esc 也不關,此 prop 無作用。
   *
   * **必填,不是可選**(2026-09-18 修正):第一版寫成 `onClose?:`,理由是「向後相容,既有 consumer 一行都不用改」——
   * 結果就是**沒傳的那些照舊點了不關**,而全庫最像產品的那則範例(`agent-panel.stories.tsx` 的 URL 註冊表示意)剛好沒傳,
   * 於是使用者在預覽站上點遮罩「根本沒有任何反應」(2026-09-18 user 回報)。這正是本家族已經立過的規矩:
   * spec §2「固定 anatomy 恆渲染」與 M23(f)「可省略 callback ≠ 可省略行為 —— 無內建行為的 callback 一律必填 prop(型別層擋)」。
   * 面板自己關不了(`open` 住在 `AgentPanelDock`),所以它沒有內建 fallback → 必填。機械閘:`scripts/agent-panel-fixed-anatomy-invariant.mjs`。
   */
  onClose: () => void
}

/**
 * 元素在整頁疊放脈絡裡的層級:由內往外走,最外層「有定位、z-index 不是 auto」的祖先的 z-index(沒有 = 0)。
 * `../../tokens/elevation/elevation.spec.md`「疊放順序」的全域列就是在這一層比大小。
 */
function rootStackLevel(el: Element): number {
  let level = 0
  const body = el.ownerDocument.body
  for (let node: Element | null = el; node && node !== body; node = node.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.position !== 'static' && cs.zIndex !== 'auto') level = Number(cs.zIndex) || 0
  }
  return level
}

/**
 * 浮層開始抑制宿主的那一刻,**已經開著、疊在 AI agent 浮層上面**的層(一般確認框、Menu 浮層 —— Sheet;層級表第 6 列 `z-50` > 第 5 列 `z-[45]`)。
 * 它們不是「被蓋住的宿主」,照樣要能操作(`../AppShell/app-shell.spec.md`「版面規則」§9 浮層可以同時存在多個,誰在上面照層級表;
 * `../Dialog/dialog.spec.md` 層級)。並存 modal(第 4 列 `z-40`)刻意在 AI agent 浮層底下(v14 推導第 4 題),不在此列。
 * 由來(2026-10-14 審查抓到):Menu 浮層開著、或確認框開著時把視窗縮窄 → AI agent 變浮層 → 那一層被設成 inert:畫在最上面卻點不到、焦點掉到 body,
 * 滑鼠使用者卡住,只有 Esc 救得回來。
 */
function openLayersAbove(panel: Element | null): Element[] {
  if (!panel) return []
  const panelLevel = rootStackLevel(panel)
  return Array.from(panel.ownerDocument.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'))
    .filter((el) => !panel.contains(el) && rootStackLevel(el) > panelLevel)
}

/** 單獨使用時:往上找到**第一個有盒子的**祖先(宿主)。 */
function resolveHostElement(panel: HTMLElement | null): HTMLElement | null {
  // 直接抓 parentElement 會踩到兩種「沒有盒子」的包層:
  //   `display: contents` —— AgentPanelDock 為了「關閉時不卸載」包的那層(2026-09-07 踩過)
  //   `display: none`     —— **同一個包層在面板關閉時的樣子**(2026-09-08 跨模型審查抓到)
  // 第一版只跳過 contents,於是「初始關閉 → 打開」這條路量到的是 display:none 那層,clientWidth = 0 → 宿主寬卡在 0。
  // **這是 G2(keep-mounted)與量宿主互相踩到:兩支閘各自都綠,合起來才壞。**
  let node = panel?.parentElement ?? null
  while (node && (getComputedStyle(node).display === 'contents' || getComputedStyle(node).display === 'none')) {
    node = node.parentElement
  }
  return node
}

/** 量 token 的實際寬(浮層另一側留白 `--layout-space-viewport-inset`;不寫死 48)。 */
function measureTokenWidth(host: HTMLElement, cssWidth: string): number {
  const probe = host.ownerDocument.createElement('div')
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:0;width:${cssWidth}`
  host.appendChild(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()
  return width
}

// code-quality-allow: long-function — 容器 = 兩種形態(AppShell 裡 / 單獨使用)× 兩種顯示(並排 / 浮層)的單一實作;拆開會讓遮罩、抑制、Esc、把手的啟用條件各寫兩份
const AgentPanel = React.forwardRef<HTMLDivElement, AgentPanelProps>(
  (
    {
      open = true,
      onClose,
      contentType = DEFAULT_CONTENT_TYPE,
      widthRange = DEFAULT_WIDTH_RANGE,
      width,
      defaultWidth,
      onWidthChange,
      onWidthCommit,
      resizable = true,
      hostMinWidth = 0,
      persistentElements,
      onModeChange,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const dock = React.useContext(AgentPanelDockContext)
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    // 把手以 aria-controls 指向面板本身(W3C APG Window Splitter;resize-handle.spec.md API `ariaControls`);consumer 給了 id 就用它的(來源:https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/windowsplitter/windowsplitter-pattern.html#L95)
    const autoId = React.useId()
    const panelId = props.id ?? autoId

    // ── 在 AppShell 裡:登記寬度設定與開關,版面(形態、可拉範圍、顯示寬)由 AppShell 算(「版面規則」;面板自己不算)──
    const registry = useAppShellRegistry()
    const inShell = !!registry
    const shellPanel = useAppShellPanel(
      'agent',
      inShell ? { contentType, widthRange, defaultWidth, width } : null,
      { onWidthChange, onWidthCommit },
    )
    // 開關紀錄 = Dock 的開關 × 本元件的 `open`;§4 連帶關閉時 AppShell 代為關閉(有 Dock 走 Dock,沒有走 onClose)
    const effectiveOpen = open && (dock ? dock.open : true)
    useAppShellPanelOpen('agent', effectiveOpen, (next) => {
      if (next) return
      if (dock) dock.setOpen(false)
      else onClose()
    })

    // ── 單獨使用(D:30 清單 N14「AgentPanel 只算自己」):量宿主寬,用同一支 layout-model 只排 AI agent 一區 ──
    // 量**宿主**(面板的父層)而不是視窗:面板住在宿主裡。用 ResizeObserver 而不是 window resize ——
    // 版面可能因為側欄收合、分頁切換而改變,那些都不會發 window resize。
    const hostRef = React.useRef<HTMLElement | null>(null)
    const [hostPx, setHostPx] = React.useState(0)
    const [edgeGap, setEdgeGap] = React.useState(0)
    const [selfVisible, setSelfVisible] = React.useState(false)
    React.useLayoutEffect(() => {
      let host = resolveHostElement(rootRef.current)
      let ro: ResizeObserver | null = null
      const measure = () => {
        // **每次都重新解析宿主**:面板從關閉變成開啟時,原本 `display: none` 的包層會變成 `contents`,真正的宿主因此改變。
        const next = resolveHostElement(rootRef.current)
        if (next !== host) {
          if (host && ro) ro.unobserve(host)
          host = next
          if (host && ro) ro.observe(host)
        }
        hostRef.current = host
        // 面板自己有沒有版面:Dock 關閉時是 display:none,那時**不能**保持整頁抑制(R3 反例:隱藏後背景仍 inert)。
        setSelfVisible((rootRef.current?.clientWidth ?? 0) > 0)
        const w = host?.clientWidth ?? 0
        // 沒有版面時量到的 0 不代表任何事,不拿去更新(同 person-display / AgentConversation)
        if (w > 0) setHostPx(w)
        if (host) {
          const gap = measureTokenWidth(host, 'var(--layout-space-viewport-inset)')
          if (gap > 0) setEdgeGap(gap)
        }
      }
      ro = new ResizeObserver(measure)
      if (host) ro.observe(host)
      // 也觀察面板自己:它從隱藏變可見時尺寸 0 → N,藉此觸發上面的重綁。
      if (rootRef.current) ro.observe(rootRef.current)
      measure()
      return () => ro?.disconnect()
    }, [])
    const [uncontrolledRecord, setUncontrolledRecord] = React.useState<number | undefined>(defaultWidth)
    const [liveWidth, setLiveWidth] = React.useState<number | null>(null)
    const record = width ?? uncontrolledRecord
    const standalone = !inShell && hostPx > 0
      ? computeStandaloneAgentLayout({
          availableWidth: hostPx,
          hostMinWidth,
          overlayEdgeGap: edgeGap,
          range: widthRange,
          target: record ?? widthRange.initial,
        })
      : null

    // ── 此刻的樣子(兩條路收成同一組值)──
    const mode: AgentPanelMode | null = inShell
      ? shellPanel?.display === 'overlay' ? 'overlay' : shellPanel?.display === 'side-by-side' ? 'side-by-side' : null
      : standalone?.display ?? null
    const isOverlay = mode === 'overlay'
    const range = inShell ? shellPanel?.range : standalone?.range
    const shownWidth = inShell
      ? shellPanel?.width
      : standalone && (liveWidth !== null ? resolveDisplayedWidth(liveWidth, standalone.range) : standalone.width)
    const known = mode !== null && shownWidth !== undefined && shownWidth !== null && !!range
    const visible = known && selfVisible

    // 單獨使用的調寬:紀錄 = 一次調整結束時此刻顯示的寬(D:19;只點一下沒拖不寫,由 ResizeHandle 不發 commit 保證)
    const standaloneResize = {
      onResize: (next: number) => {
        if (!standalone) return
        const shown = resolveDisplayedWidth(next, standalone.range)
        setLiveWidth(shown)
        onWidthChange?.(shown)
      },
      onResizeCommit: (next: number) => {
        if (!standalone) return
        const nextRecord = recordAfterUserResize({ previousRecord: record, displayedWidth: resolveDisplayedWidth(next, standalone.range), moved: true })
        setLiveWidth(null)
        if (nextRecord === undefined) return
        if (width === undefined) setUncontrolledRecord(nextRecord)
        onWidthCommit?.(nextRecord)
      },
      onDraggingChange: (dragging: boolean) => { if (!dragging) setLiveWidth(null) },
    }
    const resize = inShell && shellPanel
      ? { onResize: shellPanel.onResize, onResizeCommit: shellPanel.onResizeCommit, onDraggingChange: shellPanel.onDraggingChange }
      : standaloneResize

    // 形態回報:**看得到、算出來才發**;回呼走 ref,消費端傳 inline 箭頭函式也不會每次 render 重發。
    const onModeChangeRef = React.useRef(onModeChange)
    onModeChangeRef.current = onModeChange
    React.useEffect(() => {
      if (mode && visible) onModeChangeRef.current?.(mode)
    }, [mode, visible])

    // v14 條 B:「以抽屜覆蓋宿主(左留視窗內距、底下鋪遮罩),**宿主暫不可操作**」(2026-10-14 起讀作「浮層時」)。
    // 「覆蓋 + 遮罩」是視覺、「不可操作」是行為 —— 兩件事,只做前者的話鍵盤照樣走得進去。
    // 實測(2026-09-08 跨模型審查)浮層態下宿主 20 個控件有 19 個仍可聚焦,Enter 會執行。
    // 用共用的並存 primitive 而不是「對兄弟節點設 inert」:兄弟迴圈只涵蓋宿主 DOM 裡的節點,
    // **body portal 出去的浮層(Dialog / FileViewer)完全不在裡面**。
    // `inertOutside([面板])`(lib/overlay-coexistence.ts)是「保留這一塊、其餘全部抑制」,portal 出去的也照樣被抑制。
    // 保留集合 = 面板自己 + 遮罩 + 呼叫端指定的宿主外常駐區(瀏覽器 chrome 等;見 `persistentElements` 說明)。
    // 遮罩在保留集合裡:它必須**接住**留白處的指標(不被 inertOutside 設成 inert),否則點擊會穿過去
    // 打到底下 modal 的外部點擊偵測、把 modal 關掉(2026-09-16 user:「為何點擊露出的遮罩會關閉agent panel底下的modal??」)。
    const scrimRef = React.useRef<HTMLDivElement | null>(null)
    const keepPanel = React.useCallback(
      () => [rootRef.current as Element | null, scrimRef.current as Element | null, ...(persistentElements?.() ?? [])].filter((el): el is Element => !!el),
      [persistentElements],
    )
    // **算出形態之前不要動手**:不知道是不是浮層時先抑制整頁,會讓同時開著的對話框帶著 inert 卡住(2026-09-08 實測)。
    const overlayActive = isOverlay && visible
    // 抑制時另外保留「此刻已開著、疊在浮層上面的層」(上方 `openLayersAbove`);遮罩挖洞仍只看 keepPanel(上面那些層本來就畫在遮罩上方)
    const keepForInert = React.useCallback(() => [...keepPanel(), ...openLayersAbove(rootRef.current)], [keepPanel])
    useOverlayCoexistence(overlayActive, keepForInert)

    // Esc 的作用域封閉在焦點所在區(`agent-panel.spec.md`「Esc 與關閉語意」,2026-10-14 依形態分開):
    //   焦點在面板內、面板內開著浮層 → 關那個最內層浮層,面板不動
    //   焦點在面板內、面板內沒有浮層 → **並排**什麼都不關;**浮層**關閉面板(= ×;D:22)
    //   焦點在面板外 → 關該區自己的浮層,**不跨區碰面板**
    // 判定全 DS 一支 lib/overlay-escape.ts `useEscapeRegion`(含 Tooltip 特例、輸入法、欄位自己那一層);面板永不進 Radix DismissableLayer(負向鐵律)。
    useEscapeRegion(rootRef, { onEscapeClose: overlayActive ? onClose : undefined })

    // 浮層形態**開啟時焦點進面板**(同 Dialog / Sheet;spec「Esc 與關閉語意」焦點段,AI 推導 WCAG 2.4.3);並排不移焦。
    // 「開啟」= 面板從看不到變看得到;已開著、只因版面變窄而變成浮層的不算。
    const wasVisibleRef = React.useRef(false)
    React.useEffect(() => {
      const was = wasVisibleRef.current
      wasVisibleRef.current = visible
      if (!visible || was || !isOverlay) return
      const root = rootRef.current
      if (!root || root.contains(document.activeElement)) return
      const target = root.querySelector<HTMLElement>('textarea:not([disabled])') ?? root
      target.focus({ preventScroll: true })
    }, [visible, isOverlay])

    if (!open) return null
    // 浮層態的遮罩(2026-09-16 user:「且此時該agent panel底下會有滿版的遮罩，若點擊到該遮罩不會有任何反應故點擊遮罩不會關閉agent panel,其單純只是用來讓使用者知道agent panel底下還有東西」;2026-09-17 改為點擊關閉):
    // 重用 Dialog 並存時的同一支 `CoexistenceMask`(z-30、`--overlay`、替 persistentElements 挖洞),不手刻第二份遮罩(M17 / M23)。
    // - `absolute`:遮罩跟面板一樣以**定位祖先**為準(AppShell 裡 = AppShell 根節點,單獨使用 = 宿主;tailwind-merge 讓它覆掉預設的 `fixed`);
    // - 遮罩**接住**指標:點留白處 = 點到遮罩本身(→ `onClose`);它要在保留集合裡(不被設 inert),
    //   而且 Dialog 的並存遮罩算洞時把它當「遮罩不是洞」跳過(overlay-coexistence.ts `boxes()`)。modal 的外部點擊守衛(createPersistentGuard)看到
    //   目標在保留區子樹裡就不關 —— 遮罩是常駐殼的子節點,自然在裡面。
    // - 是面板根節點的**兄弟**不是子節點:根節點 z-[45] 自成堆疊脈絡,放進去遮罩就會壓過並存 modal(z-40),違反 dialog.spec 層級梯。
    // 幾何與「點遮罩關閉面板」由 `scripts/app-shell-layout-invariant.mjs` 機械守住;
    // 「`onClose` 必填、不得以 callback 有無當行為閘」由 `scripts/agent-panel-fixed-anatomy-invariant.mjs` 守住。
    const showScrim = overlayActive
    return (
      <>
        {showScrim && (
          <CoexistenceMask
            ref={scrimRef}
            keep={keepPanel}
            data-agent-panel-scrim=""
            // 點遮罩關面板(2026-09-17 user 裁示,取代 2026-09-16 的「點了不關」;兩條裁示逐字都在 spec 的來源總帳)。
            // 這一改讓它**回到** DS 既有的浮層語言:`../Dialog/dialog.spec.md`「Overlay click:點擊 overlay 關閉」。
            // 並存 modal 時只關面板、modal 留著(2026-09-17 user 選 a 案)。鍵盤路徑:浮層時 Esc 同樣關閉(上方 useEscapeRegion)。
            onClick={onClose}
            className="absolute animate-in fade-in-0 duration-[var(--motion-duration-surface)] motion-reduce:animate-none"
          />
        )}
        <div
          ref={(node) => {
            rootRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }}
          id={panelId}
          role="complementary"
          aria-label="智慧代理" // i18n-allow: DS 預設,props 展開在後可覆寫
          // 浮層要讓 AT 與閘知道它現在是蓋在內容上的一層,不是並排的一欄
          data-agent-panel-mode={mode ?? undefined}
          data-app-shell-panel={inShell ? 'agent' : undefined}
          tabIndex={-1}
          className={cn(
            // 不 `overflow-hidden`(2026-09-29,待辦總帳 OE1):它會把左緣把手跨到宿主那側的外側 3px 裁掉,7px 命中區只剩面板內的 4px 可點 ——
            // resize-handle.spec.md「命中區」明寫消費端容器不得用 overflow:hidden 裁到它、要壓 flex `min-width:auto` 改 `min-w-0`。橫向不裁;縱向改 `overflow-y-clip`
            // (與 overflow-x:visible 並存不會被升成 auto、不成為捲動容器),讓貼底浮層的 slide-in 仍照舊被面板底緣裁住。
            // @focus-suppress E — E 浮層程式落點;承擔者:tabIndex=-1 的面板殼,只在浮層形態開啟、面板內沒有輸入盒時被上方 effect 程式聚焦,本身不可操作;內部控件各自有指示
            'relative flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-y-clip bg-surface outline-none',
            // 浮層(2026-10-14 起由版面決定,沒有固定門檻):右貼齊、上下貼齊定位祖先;寬 = 紀錄夾在「版面規則」§9 的範圍,
            // 左側至少留 `--layout-space-viewport-inset`(範圍保證,不再撐滿「容器 − 48」)。用 absolute 而不是把宿主推走:浮層不佔並排空間(U:53)。
            // z-[45]:高於**並存面**(Dialog/FileViewer 有 persistentElements 時 z-40 —— v14 推導第 4 題「URL Modal 在被蓋住的宿主區」),
            // 低於**一般確認框**(z-50 —— 條 A「沒有 URL 的 Modal 阻擋其餘介面,包含 agent」);整張表 → elevation.spec.md「疊放順序」。
            // 浮層 = 遮蓋型浮層:底色與陰影跟 Sheet 同一組(sheet.tsx `bg-surface-raised shadow-[var(--elevation-200)]`)——
            // `--surface` 在深色模式是半透明(semantic.css「非遮蓋型容器」),蓋在宿主上會讓底下文字透出來。
            isOverlay && 'absolute inset-y-0 right-0 z-[45] bg-surface-raised shadow-[var(--elevation-200)]',
            // 分隔線只有一個 owner:可拖時由 ResizeHandle 的 1px line 擁有(DataTable 欄間同款,hover/拖曳會變色);
            // 不可拖才由容器畫 border-l(app-shell aside 前例)。兩者並存 = 2px 粗線(2026-09-02 user 抓到)。
            !resizable && !isOverlay && 'border-l border-divider',
            'animate-in fade-in-0 slide-in-from-right-4 duration-[var(--motion-duration-surface)] motion-reduce:animate-none',
            className,
          )}
          // 寬度還沒算出來(單獨使用、宿主還沒量到)的那一格先用初始寬,量到之前不畫浮層
          style={{ width: known ? (shownWidth as number) : widthRange.initial, ...style }}
          {...props}
        >
          {resizable && known && range && (
            // 同一顆 ResizeHandle 擁有視覺 / 拖拉 / 鍵盤 / ARIA(DataTable 欄寬同元件,2026-09-02 SSOT 收斂);並排與浮層都可拖(U:4、U:55)。
            // `max`(→ aria-valuemax)= 此刻真的停得住的上限(並排 = 可拉上限 §5,浮層 = §9 的範圍),與實際停的位置同一個值(2026-09-07 G5)。
            <ResizeHandle
              direction="horizontal"
              position="start"
              value={shownWidth as number}
              min={range.min}
              max={range.max}
              step={PANEL_RESIZE_KEY_STEP}
              // 名稱帶出面板自己的名字(= 上方 aria-label 預設「智慧代理」):Right panel 的把手原本同名「調整面板寬度」,兩顆分不出來(WCAG 2.4.6;2026-10-15 r1b 複驗 F9)
              ariaLabel="調整智慧代理寬度" // i18n-allow: DS 預設文案
              ariaControls={panelId}
              className="z-10"
              onValueChange={resize.onResize}
              onValueCommit={resize.onResizeCommit}
              onDraggingChange={resize.onDraggingChange}
            />
          )}
          {children}
        </div>
      </>
    )
  },
)
AgentPanel.displayName = 'AgentPanel'

/* ────────────────────────────────────────────────────────────────────────────
 * 2. AgentPanelHeader(標題列)+ 歷史浮層 / 改名 / 刪除
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentConversationSummary {
  id: string
  title: string
  /** 分組標題(如「今天」「過去 7 天」);同組相鄰排列。 */
  group?: string
  /** 代理仍在回覆:列首圖示原地換 CircularProgress 16,等寬等高不動版面。 */
  thinking?: boolean
}

export interface AgentPanelHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** 目前對話標題(標題本身=歷史浮層觸發鈕)。 */
  title: string
  /** 歷史浮層搜尋 placeholder(i18n override)。 */
  historySearchPlaceholder?: string
  /** 歷史浮層無結果文案(i18n override)。 */
  historyEmptyText?: string
  /** 標誌狀態(代理思考中傳 "think")。 */
  logoState?: AgentLogoState
  /** 歷史對話清單;空清單=浮層顯示無結果(觸發鈕恆在)。 */
  conversations?: AgentConversationSummary[]
  /** 目前對話 id(歷史清單高亮)。 */
  activeConversationId?: string
  /** 目前對話尚無已送出訊息=本身就是新對話 → 「+ 新對話」停用。 */
  conversationEmpty?: boolean
  /** 歷史浮層初始開啟(展示/快照用;M15 OpenSnapshot)。 */
  defaultHistoryOpen?: boolean
  onSelectConversation?: (id: string) => void
  /** 改名確認(Dialog 流程由元件內建)。 */
  onRenameConversation?: (id: string, title: string) => void
  /**
   * 刪除確認(Dialog 流程由元件內建)。consumer 契約:刪的是目前對話 → 切到最近一則;
   * 全部刪光 → 面板回空狀態(spec「附:歷史浮層」)。
   */
  onDeleteConversation?: (id: string) => void
  /** 固定構件:+ 恆渲染,主流程無內建行為 → 必填。 */
  onNewConversation: () => void
  /** 固定構件:× 恆渲染,面板 open 是 consumer state → 必填。 */
  onClose: () => void
}

// ── 鍵盤:歷史列上的「改名 / 刪除」(2026-09-25 待辦總帳 B9「路線乙」)──
// 決策出處 = governance/planning/2026-09-25-interaction-and-hover-remediation.md B9(該列點名「AI 面板對話紀錄列」),
// user 逐字(附條件同意,條件查證成立記在同列):「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」。
// 鍵盤路整條由 Command 本身提供(command.tsx routeCommandRowKeys,判定 = lib/roving-list-keyboard.ts:列裡的鈕 -1、→ 進 / ← 回 /
// ↑↓ Tab 回搜尋框、Enter / Space 屬於那顆鈕),SelectMenu 的人員頭像走同一份;本檔只負責「鍵盤反白這一列時浮出改名 / 刪除」(見 HistoryRow)。
// 按鍵表住 agent-panel.spec.md「附:歷史浮層」與 command.spec.md「A11y」。2026-09-25 前:每一列的改名 / 刪除都在 Tab 路上(4 列 = 8 站)。

/** 歷史列(select-menu.tsx 原型):外層 CommandItem 單一互動 owner;內層 MenuItem 純視覺。 */
function HistoryRow({
  conversation,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: AgentConversationSummary
  selected: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}) {
  // 鍵盤反白停在這一列時浮出改名 / 刪除(keyboard-model-canonical「列上有小按鈕的一串」:鍵盤走到的那顆鈕要看得見;
  // cmdk 清單的「焦點在這一項」就是鍵盤反白,AI 推導,見上方段落)。只在反白是鍵盤搬的時候 —— 滑鼠搬的反白就是滑鼠正停著的列,
  // group-hover 本來就浮出;滑鼠離開清單後 cmdk 仍留著反白,不額外讓那一列的鈕常駐(滑鼠畫面不變)。
  const cursorByKeyboard = useCursorMover() === 'keyboard'
  return (
    <CommandItem
      value={conversation.id}
      keywords={[conversation.title]}
      onSelect={onSelect}
      // 游標與選中的長相全部由 CommandItem 統一畫(指標模態底色 / 鍵盤模態畫框 / 選中底色釘住;
      // focus-canonical 規則二 + item-anatomy「選中 × 互動疊加」);本列只交 `selected`,不再手刻一份
      //(2026-09-09 之前這裡自己寫了一份 not-hover:focus-ring-inset,與 CommandItem 重複)。
      selected={selected}
      className="group/menu-item"
    >
      <MenuItem
        labelMaxLines={1}
        role="presentation"
        selected={selected}
        className="!bg-transparent hover:!bg-transparent"
        startContent={
          conversation.thinking ? (
            <CircularProgress size={16} aria-label="回覆中" /> // i18n-allow: DS 預設
          ) : (
            <MessageSquare size={16} aria-hidden className="text-fg-muted" />
          )
        }
        endContent={
          // 行內動作恆在 DOM;鍵盤用 → 進得去、不在 Tab 路上(B9,Command 的 routeCommandRowKeys 提供);
          // 懸停/focus-visible 瞬間出現(不淡入,待辦總帳 L9)=ItemSuffix hoverReveal SSOT,鍵盤反白這一列時也浮出(cursorByKeyboard)。
          /* MenuItem 的 endContent slot 內再包 ItemSuffix 只為 hoverReveal(opacity 0→1,瞬間);兩層同盒
             (h-[1lh] items-center ml-auto gap-2),不疊任何位移——非 drift(2026-09-02 覆核實測)。 */
          <ItemSuffix
            hoverReveal
            hoverGroup="menu-item"
            className={cursorByKeyboard ? 'group-data-[selected=true]/menu-item:opacity-100' : undefined}
          >
            {/* Enter/Space 在行內動作上 = 啟動該動作、不選列 —— 由 Command 根的 routeCommandRowKeys 統一處理
                (2026-09-26 之前這裡另寫了一份 onKeyDown 做同一件事,兩份並存;待辦總帳〇節「按鍵規則合併」收回 command.tsx)。
                data-history-row-actions = 量測腳本找「這一列自己的鈕」的錨點。 */}
            <span className="contents" data-history-row-actions="">
            <ItemInlineAction
              action={{
                icon: Pencil,
                label: '改名', // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
                onClick: (e) => {
                  e?.stopPropagation()
                  onRename()
                },
              }}
            />
            <ItemInlineAction
              action={{
                icon: Trash2,
                label: '刪除', // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
                onClick: (e) => {
                  e?.stopPropagation()
                  onDelete()
                },
              }}
            />
            </span>
          </ItemSuffix>
        }
      >
        {conversation.title}
      </MenuItem>
    </CommandItem>
  )
}

const AgentPanelHeader = React.forwardRef<HTMLElement, AgentPanelHeaderProps>(
  (
    {
      title,
      logoState = 'still',
      historySearchPlaceholder = '搜尋對話', // i18n-allow: DS 預設文案,prop 可覆寫
      historyEmptyText = '沒有對話', // i18n-allow: DS 預設文案(2026-09-08 一句到底,對應 No options;沒有對話與搜尋無結果共用),prop 可覆寫
      conversations = [],
      activeConversationId,
      conversationEmpty = false,
      defaultHistoryOpen = false,
      onSelectConversation,
      onRenameConversation,
      onDeleteConversation,
      onNewConversation,
      onClose,
      className,
      ...props
    },
    ref,
  ) => {
    const [historyOpen, setHistoryOpen] = React.useState(defaultHistoryOpen)
    const [renameTarget, setRenameTarget] = React.useState<AgentConversationSummary | null>(null)
    const [deleteTarget, setDeleteTarget] = React.useState<AgentConversationSummary | null>(null)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    // 改名 / 刪除對話框關閉後焦點(WCAG 2.4.3):還給開啟它的那顆行內動作鈕;那一列已跟著歷史浮層收起(焦點外移)→ 回標題觸發鈕。
    // 對話框是受控開啟、沒有 DialogTrigger,Radix 沒有東西可還 → 由 lib/overlay-focus-return.ts 還(全 DS 一支:沒有觸發點 + modal,
    // 開啟者不在了走 fallback)。2026-09-30 前這裡另寫一份:關閉時 setTimeout 0 聚焦標題(浮層仍開就交給 Radix),是第六份平行實作。
    const dialogOpenerRef = React.useRef<HTMLElement | null>(null)
    const openDialog = (open: () => void) => {
      dialogOpenerRef.current = captureFocusOrigin()
      open()
    }
    const returnFocusFromDialog = (event: Event) => {
      const opener = dialogOpenerRef.current
      dialogOpenerRef.current = null
      returnFocusToOpener(event, opener, { noTrigger: true, modal: true, fallback: () => triggerRef.current })
    }
    // 觸發器失去版面時關掉歷史浮層(2026-09-10 實測兩條路徑):宿主用 display:none 收起 keep-mounted 的面板
    // (AgentPanelDock,路由切換 / 全域快捷鍵這類不經指標與焦點的關閉)、或 Storybook 把整頁 docs 藏起來 —— 浮層 portal 到 body
    // 不會跟著消失,Radix 對 0×0 的錨點會把它定位到視窗左上角 (0, 8),焦點還留在裡面。ResizeObserver 在元素變成
    // display:none 時會回報 0×0;掛上時的第一次回呼帶真實尺寸,可見的觸發器不會被誤關。
    React.useEffect(() => {
      const el = triggerRef.current
      if (!historyOpen || !el || typeof ResizeObserver === 'undefined') return
      const ro = new ResizeObserver(() => {
        if (el.getClientRects().length === 0) setHistoryOpen(false)
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [historyOpen])

    const groups = React.useMemo(() => {
      const order: string[] = []
      const byGroup = new Map<string, AgentConversationSummary[]>()
      for (const item of conversations) {
        const key = item.group ?? ''
        if (!byGroup.has(key)) {
          byGroup.set(key, [])
          order.push(key)
        }
        byGroup.get(key)!.push(item)
      }
      return order.map((key) => ({ label: key, items: byGroup.get(key)! }))
    }, [conversations])

    // 標題群 ↔ 動作群 gap = loose(2026-09-02 user 拍板:chevron 與右側按鈕至少 --layout-space-loose;
    // ChromeHeader 預設 gap-2 是 slot 內間距,長標題截斷時 chevron 會貼到 28px 圖示鈕被讀成同一群)。
    return (
      <ChromeHeader ref={ref} className={cn('gap-[var(--layout-space-loose)] bg-surface', className)} {...props}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AgentLogo state={logoState} size={24} />
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              {/* 標題+chevron 複合觸發:幾何沿用品牌區前例(238cdf91:gap-2 / 零 padding);
                  **chevron 是 20 不是 16** —— 標題是 text-body-lg,依「字級↔icon tier」對齊 ICON_SIZE.lg
                  (見下方 ChevronDown 的註解與 spec「箭頭 20」);chevron 純指示、fg-muted 靜色、
                  無懸停底(同 AgentThinking 標題列);原生 button 承接 Radix Slot props。 */}
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={historyOpen}
                className={cn(
                  'flex min-w-0 max-w-full cursor-pointer items-center gap-2 p-0 text-left',
                  'rounded-sm ',
                )}
              >
                {/* 單行截斷 → 截斷時才顯 tooltip 補全(tooltip.spec.md:32;引擎 truncated-text.spec.md),
                    禁手刻 truncate span。 */}
                <TruncatedText className="text-body-lg font-medium">{title}</TruncatedText>
                {/* 指示 chevron 與 Select 觸發器逐字同款:同色 text-fg-muted、同線粗、同「字級↔icon tier」
                    (標題 text-body-lg = Select lg → ICON_SIZE.lg 20)、開啟時 rotate-180;旋轉跟它打開的歷史浮層
                    同一個時長與曲線(overlayIndicatorMotion;motion.spec.md「展開箭頭跟它打開的東西同步」)。 */}
                <ChevronDown
                  size={ICON_SIZE.lg}
                  aria-hidden
                  className={cn('shrink-0 text-fg-muted', overlayIndicatorMotion(historyOpen), historyOpen && 'rotate-180')}
                />
              </button>
            </PopoverTrigger>
            {/* 寬度 = Popover canonical w-72(288;popover.tsx 預設,不另訂):沿用 DS 既有 rich-popover 寬度,
                且在面板最窄 360 時仍容得下(標題左緣起 312)。
                與觸發點距 = OVERLAY_SIDE_OFFSET 8(elevation.spec.md)。 */}
            <PopoverContent
              align="start"
              aria-label="歷史對話" // i18n-allow: DS 預設文案
              className="overflow-hidden p-0"
              // 滑鼠挑一則對話收起 → 焦點回標題但不畫鍵盤框(打過字之後尤其會冒出來;規則與唯一實作住 lib/overlay-focus-return.ts,
              // SelectMenu 同一支);鍵盤收起與「改名 / 刪除開了對話框」照原本(交還 Radix / 不搶)
              onCloseAutoFocus={(e) => returnFocusToOpener(e, triggerRef.current)}
            >
              <Command label="歷史對話">
                {/* 搜尋列幾何 = CommandInput SSOT(2026-09-08 刪掉這裡的第二份 py/h 覆寫) */}
                <CommandInput
                  placeholder={historySearchPlaceholder}
                  aria-label={historySearchPlaceholder}
                />
                <CommandEmpty>{historyEmptyText}</CommandEmpty>
                <CommandList label="對話">
                  {groups.map(({ label, items }) => (
                    <React.Fragment key={label || '(ungrouped)'}>
                      <CommandGroup
                        heading={label ? <MenuItem header>{label}</MenuItem> : undefined}
                      >
                        {items.map((conversation) => (
                          <HistoryRow
                            key={conversation.id}
                            conversation={conversation}
                            selected={conversation.id === activeConversationId}
                            onSelect={() => {
                              onSelectConversation?.(conversation.id)
                              setHistoryOpen(false)
                            }}
                            onRename={() => openDialog(() => setRenameTarget(conversation))}
                            onDelete={() => openDialog(() => setDeleteTarget(conversation))}
                          />
                        ))}
                      </CommandGroup>
                    </React.Fragment>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={Plus}
            aria-label="新對話" // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
            disabled={conversationEmpty}
            onClick={onNewConversation}
          />
          <ButtonDivider />
          <Button dismiss size="sm" startIcon={XIcon} aria-label="關閉面板" onClick={onClose} />
        </div>
        {renameTarget && (
          <AgentRenameDialog
            conversation={renameTarget}
            onOpenChange={(next) => {
              if (!next) setRenameTarget(null)
            }}
            onConfirm={(nextTitle) => {
              onRenameConversation?.(renameTarget.id, nextTitle)
              setRenameTarget(null)
            }}
            onCloseAutoFocus={returnFocusFromDialog}
          />
        )}
        {deleteTarget && (
          <Dialog
            open
            onOpenChange={(next) => {
              if (!next) setDeleteTarget(null)
            }}
          >
            {/* 確認框/短表單:height="hug" 隨內容(dialog.spec.md 高度行為)、寬 440(DS 五個確認框 story 慣例)。 */}
            <DialogContent height="hug" maxWidth={440} onCloseAutoFocus={returnFocusFromDialog}>
              <DialogHeader>
                <DialogTitle>刪除對話</DialogTitle>
              </DialogHeader>
              <DialogBody>
                確定刪除「{deleteTarget.title}」?此動作立即生效且不可復原。
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" onClick={() => setDeleteTarget(null)}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  danger
                  onClick={() => {
                    onDeleteConversation?.(deleteTarget.id)
                    setDeleteTarget(null)
                  }}
                >
                  刪除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </ChromeHeader>
    )
  },
)
AgentPanelHeader.displayName = 'AgentPanelHeader'

/** 改名 Dialog:Field+Input 預填全選;驗證走 `useFormValidation`(更新類:沒改停用、空白按「儲存」才報錯並移焦點);Enter=儲存;Esc 先回復名稱、再按一次才關。 */
function AgentRenameDialog({
  conversation,
  onOpenChange,
  onConfirm,
  onCloseAutoFocus,
}: {
  conversation: AgentConversationSummary
  onOpenChange: (open: boolean) => void
  onConfirm: (title: string) => void
  /** 關閉後焦點還給誰(由開啟它的標題列決定,見 AgentPanelHeader returnFocusFromDialog) */
  onCloseAutoFocus: (event: Event) => void
}) {
  // 走 form-validation 可執行層(2026-10-01,待辦總帳 N70;規格 agent-panel.spec.md「改名」):規則 1(焦點在欄位裡不報錯)/ 2(離開才驗,指標按著時延到
  // 按壓完成 —— 清空後直接按「取消」不再被長出來的錯誤推走,N67 同根)/ 4(Esc 回復,放在 Dialog 裡第一下只回復、第二下才關,N68)/ 7 / 8(按「儲存」才
  // 報「名稱不可空白」並把焦點移到欄位)。2026-10-01 前這裡自己寫 touched / onBlur / `disabled={!dirty || empty}`:焦點還在欄位裡清空就當場報錯(違規則 1)、
  // 清空直接按取消那一下落空(實測取消鈕上緣 150.8 → 204.8)、Esc 一下關整個對話框。「空白時儲存停用」沒有 user 原話,且與 hook 的 submitDisabled
  //(只看 pristine / 送出中)衝突 —— 再加 `|| empty` 就是第二份規則(M17 / M30);規則 1 下空白錯誤在聚焦時看不到,停用鈕就變成規格自己點名的
  // 「讓使用者猜為什麼按不了」。改成可按、按了報錯並移焦點。
  const form = useFormValidation({
    initialValues: { title: conversation.title },
    intent: 'update',
    validate: { title: (v) => (String(v).trim() ? undefined : '名稱不可空白') }, // i18n-allow: DS 預設文案
    onSubmit: ({ title }) => {
      const trimmed = String(title).trim()
      // 修剪後與原名相同 = 只改了空白,不算改名:只關閉、不呼叫 onConfirm(保留原語意)
      if (trimmed === conversation.title) { onOpenChange(false); return }
      onConfirm(trimmed)
    },
  })
  const titleProps = form.getInputProps('title')
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* 確認框/短表單:height="hug" 隨內容(dialog.spec.md 高度行為)、寬 440(DS 五個確認框 story 慣例)。 */}
      <DialogContent height="hug" maxWidth={440} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>改名對話</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* 沒有 <form>:footer 鈕 onClick={() => void form.handleSubmit()}(form-validation.spec.md R8b 的寫法);不包 <form> 以免切斷 Dialog 的 flex 鏈(M25) */}
          <Field required invalid={!!form.errors.title}>
            <FieldLabel>名稱</FieldLabel>
            <Input
              {...titleProps}
              error={!!form.errors.title}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                titleProps.onKeyDown(e)
                // 規則 3:Enter = 儲存。輸入法選字的 Enter 不提交(判準 lib/ime-composition.ts;2026-09-30 前沒有 → 用注音改名,按 Enter 選字就直接存了半截)
                if (e.key === 'Enter' && !isImeComposing(e)) {
                  e.preventDefault()
                  void form.handleSubmit()
                }
              }}
            />
            <FieldError>{form.errors.title}</FieldError>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={form.submitDisabled} loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. AgentConversation(訊息卷軸區)
 * ──────────────────────────────────────────────────────────────────────── */

export type AgentConversationProps = React.HTMLAttributes<HTMLDivElement>

/** 最後一則代理訊息的工具列常駐(其餘懸停);由 AgentConversation 判定,consumer 不設(SSOT)。 */
const LastAgentMessageContext = React.createContext<boolean>(false)

const AgentConversation = React.forwardRef<HTMLDivElement, AgentConversationProps>(
  ({ className, children, ...props }, ref) => {
    // 找最後一則 role="agent" 的直接子訊息:它的工具列常駐,其他訊息懸停才顯(spec「AgentToolbar」)。
    const items = React.Children.toArray(children)
    let lastAgentIndex = -1
    items.forEach((child, index) => {
      if (React.isValidElement<AgentMessageProps>(child) && child.type === AgentMessage && (child.props.role ?? 'agent') === 'agent') {
        lastAgentIndex = index
      }
    })
    // 自動捲到最新:掛載時與訊息數增加時捲到底(使用者若已往上捲離底部 > 40px 則不打擾;
    // 往上捲 = 正在讀舊訊息,不把人拉走);全家族一致,consumer 不自接。
    const logRef = React.useRef<HTMLDivElement | null>(null)
    React.useImperativeHandle(ref, () => logRef.current as HTMLDivElement)
    const wasNearBottomRef = React.useRef(true)
    // 上次在「面板看得見」時停在哪 —— 用來在面板從隱藏回來時把位置補回去(spec E 條「閱讀位置保存」)。
    const savedTopRef = React.useRef<number | null>(null)
    React.useLayoutEffect(() => {
      const log = logRef.current
      const viewport = log?.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
      if (!log || !viewport) return
      // 2026-09-07 G2:面板關閉時走 `display:none`(不再卸載)。實測祖先被 display:none 之後
      // **瀏覽器會把捲動位置歸零**,而且 ResizeObserver 會以 0×0 觸發一次 ——
      // 那一刻量到的 scrollHeight / clientHeight / scrollTop 全是 0,拿去更新狀態就會
      // 把「使用者剛剛在哪」洗成「貼在底部」。所以兩個 handler 都先擋掉沒有版面的情況,
      // 這跟 person-display 的 `availablePx <= 0 → 不更新` 是同一條原則:
      // **沒有版面時量到的數字不代表任何事,不能拿來做決定。**
      const hasLayout = () => viewport.clientHeight > 0
      const stick = () => {
        if (!hasLayout()) return
        if (wasNearBottomRef.current) { viewport.scrollTop = viewport.scrollHeight; return }
        // 從隱藏回來:位置被歸零了,補回上次看得見時的位置。
        // 只在「現在是 0、而且記得的不是 0」時才補 —— 使用者本來就停在頂端時 saved 也是 0,不會誤補。
        if (savedTopRef.current !== null && savedTopRef.current > 0 && viewport.scrollTop === 0) {
          viewport.scrollTop = savedTopRef.current
        }
      }
      stick()
      const onScroll = () => {
        if (!hasLayout()) return
        savedTopRef.current = viewport.scrollTop
        wasNearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 40
      }
      viewport.addEventListener('scroll', onScroll, { passive: true })
      // 量**內容高度**而不是訊息則數:代理回覆是串流寫進同一則訊息的,則數不變但高度一直長,
      // 只看則數會讓整段回覆期間都不跟隨(貼底時要一路跟到串流結束)。
      const ro = new ResizeObserver(stick)
      ro.observe(log)
      return () => {
        viewport.removeEventListener('scroll', onScroll)
        ro.disconnect()
      }
    }, [])
    return (
      // 捲軸必用 ScrollArea(跨 OS 一致;Dialog body 同法)。
      <ScrollArea fillX className="min-h-0 flex-1">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          className={cn(
            // 輪距 40 = 8 + 24(工具列)+ 8;懸停工具列絕對定位於輪距內,出現不推擠。
            // 底部 = --layout-space-bottom 48:捲到最底時,最後內容(常駐工具列)→ 輸入盒至少 48(user 2026-09-02 23:14
            // 「當聊天內容捲到最底時,那個工具列距離prompt input 應該至少要留 bottom (layout space token, 48px)的距離吧？」;agent-panel.spec.md「3. AgentConversation」)。
            'flex flex-col gap-10 p-[var(--layout-space-loose)] pb-[var(--layout-space-bottom)]',
            className,
          )}
          {...props}
        >
          {items.map((child, index) => (
            <LastAgentMessageContext.Provider key={(React.isValidElement(child) && child.key) || index} value={index === lastAgentIndex}>
              {child}
            </LastAgentMessageContext.Provider>
          ))}
        </div>
      </ScrollArea>
    )
  },
)
AgentConversation.displayName = 'AgentConversation'

/* ────────────────────────────────────────────────────────────────────────────
 * 4. AgentMessage(訊息)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentAttachment {
  id: string
  label: string
}

export interface AgentMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 訊息角色:user=我方氣泡靠右;agent=無氣泡全寬。 */
  role?: 'user' | 'agent'
  /** 氣泡內文字上方的附件(送出後視覺=Chip assist 分支)。 */
  attachments?: AgentAttachment[]
  onAttachmentClick?: (attachment: AgentAttachment) => void
  /** 訊息工具列(AgentToolbar);絕對定位於輪距內。 */
  toolbar?: React.ReactNode
}

const AgentMessage = React.forwardRef<HTMLDivElement, AgentMessageProps>(
  (
    { role = 'agent', attachments, onAttachmentClick, toolbar, className, children, ...props },
    ref,
  ) => {
    const isUser = role === 'user'
    return (
      <div
        ref={ref}
        className={cn('group/agent-message relative', isUser && 'flex justify-end', className)}
        {...props}
      >
        <div
          className={cn(
            'text-body text-foreground',
            isUser
              ? [
                  'max-w-[85%] rounded-md bg-secondary px-3 py-2',
                  'animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none',
                ]
              : 'w-full [&_a]:text-primary [&_a:hover]:text-primary-hover [&_a]:underline-offset-2 [&_a]:underline' // spec:151 長文閱讀需要底線可掃描(2026-09-08 從 hover 才畫改回恆畫),
          )}
        >
          {attachments && attachments.length > 0 && (
            // chip 相互垂直/水平 4(=Combobox 內 Tag 區間距;2026-09-02 拍板)。
            <div className="mb-2 flex flex-wrap gap-1">
              {attachments.map((attachment) => (
                <Chip
                  key={attachment.id}
                  variant="assist"
                  aria-label={`附件:${attachment.label}`}
                  onClick={() => onAttachmentClick?.(attachment)}
                >
                  {attachment.label}
                </Chip>
              ))}
            </div>
          )}
          {children}
        </div>
        {toolbar}
      </div>
    )
  },
)
AgentMessage.displayName = 'AgentMessage'

/* ────────────────────────────────────────────────────────────────────────────
 * 5. AgentThinking(思考塊)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentThinkingProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 進行中:標題「思考中」+微光;完成:「思考過程」靜態。 */
  thinking?: boolean
  /** 已完成的步驟(靜態,fg-secondary)。 */
  steps?: React.ReactNode[]
  /** 正在寫入的最新一行(僅此行與標題套微光)。 */
  currentStep?: React.ReactNode
  /** 開合(未受控時:回覆中自動展開、回覆完自動收合)。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const AgentThinking = React.forwardRef<HTMLDivElement, AgentThinkingProps>(
  ({ thinking = false, steps, currentStep, open, onOpenChange, className, ...props }, ref) => {
    // 非受控:AI 回覆中自動展開、回覆完自動收合(拍板;三套元件庫一致慣例)。
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(thinking)
    React.useEffect(() => {
      if (open === undefined) setUncontrolledOpen(thinking)
    }, [thinking, open])
    const resolvedOpen = open ?? uncontrolledOpen
    const handleOpenChange = (next: boolean) => {
      setUncontrolledOpen(next)
      onOpenChange?.(next)
    }
    return (
      <CollapsiblePrimitive.Root
        ref={ref}
        open={resolvedOpen}
        onOpenChange={handleOpenChange}
        className={cn('text-body', className)}
        {...props}
      >
        <CollapsiblePrimitive.Trigger
          className={cn(
            'group/agent-thinking flex cursor-pointer items-center gap-1 text-fg-secondary hover:text-foreground',
            // 焦點框往外(= 什麼都不寫,吃 styles/base.css 全域規則)。
            // 2026-09-10 翻案:原本寫「往外 +2px 實測會壓到下方展開的思考內容(overflow-hidden 的 collapsible)」——
            // 那句沒有量過。實測(展開與收合、1440 / 700 / 420 三種寬、三個實例):上 40 / 右 322 / 下 8 / 左 15,
            // **四周最小 8px**,往外只需要 4px。那個 collapsible 的外框確實從標題底邊 0px 開始,但它是**兄弟節點**
            //(不裁任何東西)而且背景全透明,裡面第一個真的畫出線的元素在 8px 外 —— 依 focus-canonical「問題二」
            // 的「正當障礙」定義(會碰撞的鄰居或會切掉框的邊界),透明的兄弟盒不是障礙。
            'rounded-sm',
          )}
        >
          <span className={cn(thinking && 'agent-shimmer')}>
            {thinking ? '思考中' : '思考過程'}
          </span>
          {/* chevron=裝飾指示(accordion 慣例),不吃微光;色同 Select 觸發器 chevron(fg-muted)。
              旋轉跟下方思考內容的高度動畫同一個時長與曲線(disclosureIndicatorMotion;motion.spec.md「展開箭頭跟它打開的東西同步」)。 */}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn('shrink-0 text-fg-muted', disclosureIndicatorMotion, 'group-data-[state=open]/agent-thinking:rotate-180')}
          />
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content className={disclosureMotion}>
          {/* 完成步驟=fg-secondary(2026-09-02 拍板;原 muted 太淺);微光行基色由 agent-panel.css 自管。 */}
          <div className="mt-2 flex flex-col gap-1 border-l border-divider pl-3 text-fg-secondary">
            {steps?.map((step, index) => <div key={index}>{step}</div>)}
            {currentStep != null && (
              <div className={cn(thinking && 'agent-shimmer')}>{currentStep}</div>
            )}
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    )
  },
)
AgentThinking.displayName = 'AgentThinking'

/* ────────────────────────────────────────────────────────────────────────────
 * 6. AgentToolbar(訊息工具列;固定 anatomy 恆渲染)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 常駐顯示。預設由 AgentConversation 判定:代理**最後一則**常駐,其餘懸停時瞬間出現(SSOT,consumer 不需設);
   * 只在 AgentConversation 之外單獨使用時才需手動指定。
   */
  pinned?: boolean
  // 固定 anatomy:三顆鈕恆渲染且沒有內建行為 → 型別層必填,少接就編譯不過(M23(f):
  // 「無內建行為的 callback 一律必填 prop」;可選會變成點了沒反應的死鈕)。
  onCopy: () => void
  onLike: () => void
  onDislike: () => void
}

const AgentToolbar = React.forwardRef<HTMLDivElement, AgentToolbarProps>(
  ({ pinned: pinnedProp, onCopy, onLike, onDislike, className, children, ...props }, ref) => {
    const pinnedFromConversation = React.useContext(LastAgentMessageContext)
    const pinned = pinnedProp ?? pinnedFromConversation
    return (
    <div
      ref={ref}
      className={cn(
        // 懸停/鍵盤聚焦時「出現」是滑過造成的變化 → 瞬間出現、不淡入(hover 底色瞬間 = user 2026-09-10「第三題改成全部瞬間」;延伸到所有滑過造成的變化 = 2026-09-26 待辦總帳 L9 那一題 user 答「確定這樣才是一致設計語言就做」;
        // SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」;待辦總帳 L9)。訊息進場的淡入是另一件事(內容出現),不在此。
        'mt-2 flex h-6 items-center gap-2',
        // 常駐(最後一則)= 在流內佔位,底部才能守 --layout-space-bottom;懸停顯示 = 絕對定位於輪距內,
        // 出現/消失完全不推擠版面(輪距 40 ≥ 8+24+8)。
        // 鍵盤那一條用 has-[:focus-visible] 不用 focus-within(2026-10-21,r1b DT-06 同族):滑鼠點「複製」focus-within 就成立,
        // 指標移開後工具列一直亮到焦點離開(理由的住所 = item-anatomy.tsx `SUFFIX_HOVER_REVEAL_BY_GROUP` 的 JSDoc;閘 scripts/test-hover-revealed-affordances.mjs)。
        pinned
          ? 'relative opacity-100'
          : 'absolute left-0 top-full opacity-0 group-hover/agent-message:opacity-100 has-[:focus-visible]:opacity-100',
        className,
      )}
      {...props}
    >
      <Button variant="text" size="xs" iconOnly startIcon={Copy} aria-label="複製" onClick={onCopy} />
      <ButtonDivider />
      <Button variant="text" size="xs" iconOnly startIcon={ThumbsUp} aria-label="讚" onClick={onLike} />
      <Button variant="text" size="xs" iconOnly startIcon={ThumbsDown} aria-label="倒讚" onClick={onDislike} />
      {children}
    </div>
    )
  },
)
AgentToolbar.displayName = 'AgentToolbar'

/* ────────────────────────────────────────────────────────────────────────────
 * 7. AgentPromptInput(複合輸入盒;固定 anatomy 恆渲染)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentPromptAttachment {
  id: string
  label: string
}

export interface AgentPromptInputProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  value: string
  onValueChange: (value: string) => void
  /** 送出(Enter / 送出鈕);無內建行為 → 必填。 */
  onSubmit: () => void
  /** 代理進行中:送出鈕同位換停止(實心正方),0.15s 淡切。 */
  busy?: boolean
  onStop?: () => void
  /** 輸入中附件(Tag md 恆帶 ×;超寬 +N;送出後於訊息內轉 Chip assist 視覺)。 */
  attachments?: AgentPromptAttachment[]
  /** 固定構件:每個 Tag 的 × 恆渲染 → 必填。 */
  onRemoveAttachment: (attachment: AgentPromptAttachment) => void
  /** 固定構件:工具列 + 恆渲染 → 必填。 */
  onAddAttachment: () => void
  placeholder?: string
}

/**
 * 附件單列 + 超寬 +N —— 放得下幾顆由 `OverflowTagList` 決定(與 Combobox 多選的 Tag 列同一份實作,2026-10-13)。
 * 修前用 `useOverflowIndices` + 寫死 48px 給「+N」留位,而且全部放得下也照留:最後一顆放得下卻被收進「+1」(與 Combobox 標籤格「+2」同一個缺口)。
 */
function PromptAttachmentRow({
  attachments,
  onRemove,
  owner,
}: {
  attachments: AgentPromptAttachment[]
  onRemove: (attachment: AgentPromptAttachment) => void
  /** 這個複合輸入控件的主人(textarea):移除後焦點接力的終點、按 +N 卡裡的零件時焦點不離開它 */
  owner: React.RefObject<HTMLTextAreaElement | null>
}) {
  const rowRef = React.useRef<HTMLDivElement>(null)
  const items = attachments.map((attachment) => ({ value: attachment.id, label: attachment.label }))
  // 移除後的焦點接力(2026-10-01,待辦總帳 OE30;combobox.spec.md「Tag 操作 › 個別移除」同一條,全 DS 一支 lib/collection-removal-focus.ts):
  // 焦點在某顆 × 上(鍵盤、或 textarea 沒握著焦點時滑鼠按下)→ 下一顆 × → 前一顆 → textarea;+N 卡裡的 × → 直接回 textarea。
  // 修前焦點隨 × 卸載掉到 body,接著打的字不見(實測)。textarea 握著焦點時按 × 本來就不搬焦點(下方 onMouseDown / onOverflowMouseDown)。
  const remove = (id: string) => {
    const attachment = attachments.find((a) => a.id === id)
    if (!attachment) return
    focusAfterCollectionRemoval(rowRef.current, { owner: owner.current })
    onRemove(attachment)
  }
  return (
    // 附件列 28:Tag 相互間距 4、距內緣 4;單列不換行,溢出以 +N 收納。TAG_ROW_CONTAINER_CLASS:`relative` =「+N」量尺的定位容器、
    // `isolate` = 附件 Tag 的疊放值只在這一列裡比(與 Combobox 的 Tag 列同一個常數;OverflowTagList 檔頭)。
    // 只裁水平(`overflow-x-clip`,不裁垂直):單列放不下的 Tag 本來就交給 +N,要裁的只有左右;原本 `overflow-hidden` 連下緣也裁,
    // 鍵盤停在 Tag / +N 時焦點框下緣被切掉(列底沒有內距)—— focus-canonical.md「框怎麼畫」:預設往外、四邊完整(SH-clip)。
    // 同 Combobox 單行 Tag 列的 `tagRowOverflowClass`(combobox.tsx:同一份 OverflowTagList、同一個理由;`clip` 不建捲動容器,
    // 不可改成 overflow-x-hidden —— 單軸 hidden 會把另一軸算成 auto)。
    // @layout-space-magic-ok: Tag 相互間距 4、距內緣 4 = 本元件規格寫的值 —— agent-panel.spec.md:243「相互間距 4、距內緣 4」(「7. AgentPromptInput(複合輸入盒)」附件列那一行)
    <div ref={rowRef} className={cn(TAG_ROW_CONTAINER_CLASS, 'flex items-center gap-1 overflow-x-clip px-1 pt-1')}>
      <OverflowTagList
        items={items}
        size="md"
        wrap={false}
        renderTag={(item) => <Tag size="md" onRemove={() => remove(item.value)}>{item.label}</Tag>}
        renderHiddenTag={(item, onRemoveHidden) => <Tag size="md" onRemove={onRemoveHidden}>{item.label}</Tag>}
        onRemove={remove}
        // 浮出清單在另一個 portal,外框的 onMouseDown 看不到它 → 卡上掛同一支判準(同 Combobox `keepSearchFocus`;OverflowIndicator `onContentMouseDown`)
        onOverflowMouseDown={(e) => keepFocusOnPointerPress(e, e.currentTarget, owner.current)}
      />
    </div>
  )
}

const AgentPromptInput = React.forwardRef<HTMLDivElement, AgentPromptInputProps>(
  (
    {
      value,
      onValueChange,
      onSubmit,
      busy = false,
      onStop,
      attachments = [],
      onRemoveAttachment,
      onAddAttachment,
      placeholder = '輸入訊息…',
      className,
      ...props
    },
    ref,
  ) => {
    const canSubmit = value.trim().length > 0
    const submit = () => {
      if (busy || !canSubmit) return
      onSubmit()
    }
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
    return (
      <div
        ref={ref}
        className={cn(
          'm-[var(--layout-space-loose)] mt-0 shrink-0 rounded-md',
          // 外框互動 = Field 家族 default chrome SSOT(field-wrapper.tsx fieldChromeStyles:單行 wrapper /
          // Textarea / 複合輸入盒三宿主同一份 compounds):hover 一階 border-hover、focus-within 主色;
          // 2026-09-02 user 問「此外為何 prompt input的互動跟 text area 不一樣？」→ 收斂為單一住所,禁自刻。
          fieldChromeStyles({ mode: 'edit', variant: 'default', error: false }),
          className,
        )}
        {...props}
        // textarea 握著焦點時,用滑鼠按這個複合輸入控件的零件(附件 ×、+、送出、停止、空白處)焦點與正在打的字都留在輸入盒,click 照常
        //(2026-10-01,待辦總帳 OE30;判準全 DS 一支 lib/pointer-press.ts keepFocusOnPointerPress,Select / Combobox 觸發欄位同一支;
        // 修前 Chrome 在 mousedown 把焦點交給那顆 ×、移除後掉到 body,接著打的字不見,實測)。+、送出、停止是同根延伸(AI 推導)。
        onMouseDown={(e) => { props.onMouseDown?.(e); keepFocusOnPointerPress(e, e.currentTarget, textareaRef.current) }}
      >
        {attachments.length > 0 && (
          <PromptAttachmentRow attachments={attachments} onRemove={onRemoveAttachment} owner={textareaRef} />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            // 按 Enter 送出、Shift+Enter 換行(拍板)。輸入法選字的 Enter 不送出(判準 lib/ime-composition.ts;2026-09-30 前只看
            // isComposing,Safari 用注音按 Enter 選字時那一顆 isComposing 已是 false、只剩 keyCode 229 → 訊息被直接送出)
            if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="訊息"
          className={cn(
            // 欄位家族內距:單行 32 等高鐵律((欄高−1lh)/2−1 + --field-px)。
            // @focus-suppress B — B Field 家族輸入控件;承擔者:指示器是輸入盒外框
            'block w-full resize-none bg-transparent outline-none',
            'px-[var(--field-px)] py-[var(--field-control-py-md)] text-body text-foreground',
            'placeholder:text-fg-muted',
            'field-sizing-content max-h-40',
          )}
        />
        <div className="flex h-10 items-center justify-between px-2">
          <Button
            variant="text"
            size="xs"
            iconOnly
            startIcon={Plus}
            aria-label="新增附件"
            onClick={onAddAttachment}
          />
          {busy ? (
            <Button
              variant="primary"
              size="xs"
              iconOnly
              startIcon={StopFilled}
              aria-label="停止生成"
              onClick={() => onStop?.()}
              className="animate-in fade-in-0 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none"
            />
          ) : (
            <Button
              variant="primary"
              size="xs"
              iconOnly
              startIcon={ArrowUp}
              aria-label="送出"
              disabled={!canSubmit}
              onClick={submit}
              className="animate-in fade-in-0 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none"
            />
          )}
        </div>
      </div>
    )
  },
)
AgentPromptInput.displayName = 'AgentPromptInput'

/* ────────────────────────────────────────────────────────────────────────────
 * 8. AgentDecisionCard(決策卡;一題一問步進)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentDecisionOption {
  value: string
  /** 單行、≤10 字、無句尾標點、說「選了會怎樣」(產題守則 5)。 */
  label: string
  /** 一行差異描述:單句、無句號、同題比同一維度(產題守則 6)。 */
  description: string
}

export interface AgentDecisionQuestion {
  id: string
  /** 題目=一句完整問句、以「?」結尾、句內點名決策對象(產題守則 3)。 */
  label: string
  /** 2-4 具名選項(不含「其他」;「其他」由元件必備附加,產題守則 4/7)。 */
  options: AgentDecisionOption[]
  /** 預選推薦解;省略=第一項;元件在該項 label 後加「(建議)」(產題守則 8)。 */
  defaultValue?: string
  /** 不可逆/安全/法律/稱謂類題:不預選(產題守則 8 例外);複選題恆不預選。 */
  noDefault?: boolean
  /** 答案本質可複選才開(產題守則 10):改 CheckboxGroup、不預選、值以 `\n` 連接。 */
  multiSelect?: boolean
  /**
   * 選填:不答也能按「下一題 / 送出」(送出值 = 空字串)。預設必答(沒選就用錯誤訊息擋下,agent-decision-card.spec.md「步進」)。
   * 單選選填題有選取時(含預選的建議解),footer 左側出現「清除選取」,按了回到沒有選取 —— 單選圓選了就回不去「都沒選」
   * (GOV.UK radios:「Users cannot go back to having no option selected once they have selected one」)。(來源:https://github.com/alphagov/govuk-design-system/blob/d742a4083fcb963b63b6a5233084dcd30f92811e/src/components/radios/index.md#L35)
   * 必答題不出現:「沒有選取」不是有效答案,清掉只會卡在錯誤上(同 `../Select/select.spec.md`「何時開 clearable」)。
   * 複選題的方框本來就能逐一取消,選填只放寬「至少一項」、不加清除鈕。
   * 讀屏:必答單選題的 radiogroup 帶 aria-required="true"(選填 = "false");複選群組是 role="group",不帶。
   */
  optional?: boolean
}

export interface AgentDecisionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit' | 'title'> {
  /** ≤3 題;一題一問步進,N>1 時標題列顯示「n / N」。 */
  questions: AgentDecisionQuestion[]
  /** 全部作答後送出:answers[questionId] = 選項值或「其他」文字(複選以 `\n` 連接;選填題沒答 = 空字串)。 */
  onSubmit?: (answers: Record<string, string>) => void
  /** 跳過=採預設值繼續(Skip 鈕與 header × 同一行為);回傳目前預設/已選值。 */
  onSkip?: (answers: Record<string, string>) => void
  /** 卡上自帶的文字(Partial 傳入、與 DS 預設合併 —— 同 Coachmark / FileViewer `labels`);DS 預設中文,英文由 consumer 傳。 */
  labels?: Partial<AgentDecisionCardLabels>
}

/** 決策卡自帶的文字(全部可覆寫)。 */
export interface AgentDecisionCardLabels {
  /** footer 第一題的鈕與 header ×(aria-label):跳過 = 用預設繼續 */
  skip: string
  /** 第二題起 footer 的回頭鈕 */
  previous: string
  /** 推進到下一題 */
  next: string
  /** 末題送出 */
  submit: string
  /** 選填單選題有選取時 footer 左側的清除鈕 */
  clearSelection: string
  /** 元件附加在最後的「其他」選項 */
  other: string
  /** 「其他」輸入格的 placeholder */
  otherPlaceholder: string
  /** 「其他」輸入格的 aria-label */
  otherAriaLabel: string
  /** 預選項(建議解)label 後的標記 */
  recommendedSuffix: string
  /** 按「下一題 / 送出」這一題沒過:單選沒選 */
  errorSingle: string
  /** 同上:複選一項都沒勾 */
  errorMulti: string
  /** 同上:「其他」選中而文字空白 */
  errorOther: string
}

const OTHER_VALUE = '__agent_decision_other__'
const OTHER_LABEL = '其他'
const RECOMMENDED_SUFFIX = '(建議)'
const MULTI_JOIN = '\n'
/**
 * DS 預設文字(中文;lib/i18n/README.md「Fallback chain」3)—— consumer 經 `labels` 覆寫(同 Coachmark `DEFAULT_LABELS`)。
 * - `clearSelection`:同 Select 單選一鍵清空的「清除選取」(select.tsx)與 BulkActionBar `clear` —— 清掉選了的那一個,全 DS 一種說法。
 * - `error*`:按「下一題 / 送出」時這一題沒過的錯誤訊息(句型照 DS 既有範例:select.stories「請選擇出貨倉庫」、
 *   combobox.stories「請至少選擇一個商品類別」、field 範例「請輸入姓名」;產題守則 7 / 10 的「不得前進」改用錯誤訊息說出來,
 *   見 agent-decision-card.spec.md「步進」)。三句是新的元件預設文案(產品文案語意):AI 依上述句型擬的建議,【待確認】——
 *   user 換字時改這裡,閘 `scripts/agent-decision-card-validation-invariant.mjs` 的 TEXT 一起改。
 */
// i18n-allow: DS 預設文案(中文);consumer 經 `labels` 覆寫
const DEFAULT_DECISION_LABELS: AgentDecisionCardLabels = {
  skip: '跳過',
  previous: '上一題',
  next: '下一題',
  submit: '送出',
  clearSelection: '清除選取',
  other: OTHER_LABEL,
  otherPlaceholder: '輸入其他選項',
  otherAriaLabel: '其他(自由輸入)',
  recommendedSuffix: RECOMMENDED_SUFFIX,
  errorSingle: '請選擇一個選項',
  errorMulti: '請至少選擇一個選項',
  errorOther: '請輸入其他選項',
}
type DecisionError = 'empty' | 'other'

/** 產題守則機械層(agent-decision-card.spec.md §8「產題守則」⚙ 條):DEV 只警告不阻擋,內容規則靠稽核。 */
function warnDecisionRules(questions: AgentDecisionQuestion[]) {
  const warn = (msg: string) => console.warn(`[AgentDecisionCard] 產題守則:${msg}`)
  if (questions.length === 0 || questions.length > 3) warn(`題數 1–3(收到 ${questions.length})。`)
  for (const q of questions) {
    if (!/[??]$/.test(q.label.trim())) warn(`題目必是完整問句、以「?」結尾(${q.id}:「${q.label}」)。`)
    if (q.options.length < 2 || q.options.length > 4) warn(`每題 2–4 個具名選項(${q.id} 有 ${q.options.length})。`)
    for (const o of q.options) {
      if (/\n/.test(o.label) || o.label.length > 10) warn(`選項標籤單行且 ≤10 字(${q.id}:「${o.label}」)。`)
      if (/[,,;;.。!!]$/.test(o.label)) warn(`選項標籤無句尾標點(${q.id}:「${o.label}」)。`)
      if (/\(建議\)|\(建議\)|\(Recommended\)/i.test(o.label)) warn(`「(建議)」由元件標,勿寫進標籤(${q.id}:「${o.label}」)。`)
      if (!o.description?.trim()) warn(`每個具名選項必附一行差異描述(${q.id}:「${o.label}」)。`)
      else if (/\n/.test(o.description) || /[。.]$/.test(o.description.trim())) warn(`描述單句、無句號(${q.id}:「${o.label}」)。`)
      if (/^(其他|other)$/i.test(o.label.trim()) || o.value === OTHER_VALUE) warn(`「其他」由元件附加,勿自列(${q.id})。`)
    }
    if (q.multiSelect && q.defaultValue) warn(`複選題不預選(${q.id})。`)
    if (!q.multiSelect && !q.noDefault) {
      const def = q.defaultValue ?? q.options[0]?.value
      if (q.defaultValue && !q.options.some((o) => o.value === q.defaultValue)) warn(`defaultValue 必是選項之一(${q.id})。`)
      if (def !== q.options[0]?.value) warn(`推薦解必排第一(${q.id})。`)
    }
  }
}

function initialAnswer(q: AgentDecisionQuestion) {
  if (q.multiSelect || q.noDefault) return ''
  return q.defaultValue ?? q.options[0]?.value ?? ''
}

/** 複選值 = 已勾選 value 集合(含 OTHER_VALUE),以 `\n` 連接存於 answers。 */
const splitMulti = (v: string | undefined) => (v ? v.split(MULTI_JOIN).filter(Boolean) : [])

/** 這一題能不能前進(產題守則 7「空字串不得前進」、10 複選至少一項;單選 noDefault 初值是空字串):
 *  沒選 → 'empty'(選填題沒選不算錯);「其他」選中而文字空白 → 'other'(兩者互斥:選了「其他」就不是沒選;
 *  選填題也一樣 —— 選了「其他」卻沒寫是什麼,不是「不答」,要不答就按「清除選取」)。 */
function decisionError(q: AgentDecisionQuestion, answer: string, other: string): DecisionError | undefined {
  const picked = q.multiSelect ? splitMulti(answer) : answer ? [answer] : []
  if (picked.length === 0) return q.optional ? undefined : 'empty'
  if (picked.includes(OTHER_VALUE) && other.trim() === '') return 'other'
  return undefined
}

/**
 * 選項卡的滑過(2026-09-26 user 同意;待辦總帳 B12;規則住 agent-decision-card.spec.md「8. AgentDecisionCard」選項卡條):
 * 指標在整張卡的任何位置 → 卡內的圓(複選是方框)照它被自己的 `<label for>` 滑過時的樣子變色;卡片灰底、字色都不變。
 * 原本的轉發是 HTML 自己做的(指標在 label 上,label 綁定的控件也算 :hover),範圍只到 SelectionItem 那個 label。
 * 整張卡不能改成 <label> 來借這個轉發:卡內已有 SelectionItem 的 label、<div> 與「其他」輸入格,都違反 label 的內容規定。
 * 所以用 DS 既有的「外層具名群組帶動內層」寫法(item-anatomy.tsx 的 `hoverGroup`):卡片掛 `group/agent-option`,
 * 控件把**它自己的** `hover:` 配對原樣接到群組滑過上。下面兩串逐條鏡射 owner,不新增任何顏色:
 *   Radio    ← radio-group.tsx `radioItemVariants` 的 `hover:border-border-hover` 與 `data-[state=checked]:hover:…` 兩行
 *   Checkbox ← checkbox.tsx `checkboxVariants` 的 `hover:border-border-hover` 與 `data-[state=checked]:hover:…` 兩行
 *              (indeterminate 那行不鏡射:選項卡不會半選)
 * owner 的 hover 配對一改,這裡必須同一次改動跟著改。
 * 不帶 owner 的停用 / 唯讀守衛:決策卡的選項沒有停用或唯讀(AgentDecisionOption 無此欄);日後要加,守衛必一起鏡射。
 */
const OPTION_RADIO_HOVER =
  'group-hover/agent-option:border-border-hover data-[state=checked]:group-hover/agent-option:border-primary-hover data-[state=checked]:group-hover/agent-option:text-primary-hover'
const OPTION_CHECKBOX_HOVER =
  'group-hover/agent-option:border-border-hover data-[state=checked]:group-hover/agent-option:bg-primary-hover data-[state=checked]:group-hover/agent-option:border-primary-hover'

const AgentDecisionCard = React.forwardRef<HTMLDivElement, AgentDecisionCardProps>(
  ({ questions, onSubmit, onSkip, labels: labelsOverride, className, ...props }, ref) => {
    const labels = { ...DEFAULT_DECISION_LABELS, ...labelsOverride }
    const titleId = React.useId()
    const otherInputId = React.useId()
    const optionIdBase = React.useId()
    const errorId = React.useId()
    const otherFieldRowRef = React.useRef<HTMLDivElement>(null)
    if (import.meta.env?.DEV) warnDecisionRules(questions)
    const [step, setStep] = React.useState(0)
    const [answers, setAnswers] = React.useState<Record<string, string>>(() =>
      Object.fromEntries(questions.map((q) => [q.id, initialAnswer(q)])),
    )
    const [otherText, setOtherText] = React.useState<Record<string, string>>({})
    /** 每一題按「下一題 / 送出」沒過時記下的錯誤;上一題 / 回來時原樣留著(同 TreeView 步驟導覽樹範例:上一次送出的值與錯誤留著)。 */
    const [errors, setErrors] = React.useState<Record<string, DecisionError | undefined>>({})
    // 按著指標的那一下要清的錯誤,排到這一下按完之後(理由見下方 clearError;整頁的按壓追蹤與 useFormValidation 規則 2 的延後共用
    // `lib/press-settle.ts`,待辦總帳 N67)。這個實例還沒跑的那一筆:被新的取代、卸載時撤掉。
    const pendingClear = React.useRef<(() => void) | null>(null)
    React.useEffect(() => {
      const release = retainPressTracking()
      return () => {
        if (pendingClear.current) cancelAfterPress(pendingClear.current)
        pendingClear.current = null
        release()
      }
    }, [])
    const resolveOne = (q: AgentDecisionQuestion) => {
      const other = (otherText[q.id] ?? '').trim()
      if (q.multiSelect) {
        return splitMulti(answers[q.id])
          .map((v) => (v === OTHER_VALUE ? other : v))
          .filter(Boolean)
          .join(MULTI_JOIN)
      }
      return answers[q.id] === OTHER_VALUE ? other : (answers[q.id] ?? '')
    }
    const resolvedAnswers = () =>
      Object.fromEntries(questions.map((q) => [q.id, resolveOne(q)])) as Record<string, string>
    const total = questions.length
    const question = questions[Math.min(step, total - 1)]
    const isLast = step >= total - 1
    // 改了這一題的答案(換選、勾 / 取消勾、在「其他」打字)就清掉這一題的錯誤(form-validation.spec.md 規則 5「開始編輯時立即清除 error」);
    // 值沒變(點已選中的那張、聚焦已選中的「其他」)不算改。按著指標的那一下改了值(按下「其他」輸入格 = 聚焦即選中)→ 等這一下按完才清:
    // 決策卡貼底往上長,錯誤一消失,上面每一張卡都往下移一行;按下與放開之間版面一動,放開時指標已不在同一處,
    // 這一下 click 落到別的元素上(複選「其他」會被卡轉給方框而切掉)。
    const clearError = (id: string) => {
      if (!errors[id]) return
      const clear = () => setErrors((prev) => (prev[id] ? { ...prev, [id]: undefined } : prev))
      if (!isPointerPressed()) return clear()
      if (pendingClear.current) cancelAfterPress(pendingClear.current)
      const run = () => {
        if (pendingClear.current === run) pendingClear.current = null
        clear()
      }
      pendingClear.current = run
      runAfterPress(run)
    }
    const select = (value: string) => {
      if ((answers[question.id] ?? '') !== value) clearError(question.id)
      setAnswers((prev) => ({ ...prev, [question.id]: value }))
    }
    const toggle = (value: string, checked: boolean) => {
      if (splitMulti(answers[question.id]).includes(value) !== checked) clearError(question.id)
      setAnswers((prev) => {
        const set = new Set(splitMulti(prev[question.id]))
        if (checked) set.add(value)
        else set.delete(value)
        return { ...prev, [question.id]: [...set].join(MULTI_JOIN) }
      })
    }
    const skip = () => onSkip?.(resolvedAnswers())

    if (!question) return null
    const multi = Boolean(question.multiSelect)
    const selectedSet = new Set(multi ? splitMulti(answers[question.id]) : [answers[question.id]])
    const errorKind = errors[question.id]
    const errorText =
      errorKind === 'other' ? labels.errorOther
        : errorKind === 'empty' ? (multi ? labels.errorMulti : labels.errorSingle)
          : undefined
    const groupInvalid = errorKind === 'empty'
    const recommendedValue =
      !multi && !question.noDefault ? (question.defaultValue ?? question.options[0]?.value) : undefined
    const optionLabel = (option: AgentDecisionOption | { value: string; label: string }) =>
      option.value === recommendedValue ? `${option.label}${labels.recommendedSuffix}` : option.label
    const allOptions = [...question.options, { value: OTHER_VALUE, label: labels.other }]
    // 下一題 / 送出恆可按(form-validation.spec.md「Submit Button 狀態」新建那列:不看填了沒、填對沒 —— 決策卡的答案每次都是新填的,
    // 沒有「已存的值」可比;同 TreeView 步驟導覽樹範例的「下一步」)。按下時驗這一題(規則 7):沒過就不前進,錯誤訊息出現在最後一張
    // 選項卡之後,焦點移到第一個出錯的控件(規則 8):沒選 → 第一個選項的圓 / 方框;「其他」文字空白 → 輸入格。
    // 只 focus、不另外 scrollIntoView:決策卡每步不需捲動即可讀完(產題守則 13),focus 本身會把它捲進視野;
    // 主動置中會連帶捲動面板與頁面。2026-11-04 前這兩顆在沒選時 disabled(2026-09-02 加,查無 user 原話)。
    const advance = (pass: () => void) => {
      const kind = decisionError(question, answers[question.id] ?? '', otherText[question.id] ?? '')
      if (!kind) return pass()
      setErrors((prev) => ({ ...prev, [question.id]: kind }))
      document.getElementById(kind === 'other' ? otherInputId : `${optionIdBase}-${allOptions[0].value}`)?.focus()
    }
    // 「清除選取」(選填單選題,有選取時才渲染;agent-decision-card.spec.md「步進」):這一題回到沒有選取 ——
    // 答案與「其他」打到一半的字一起清(同 Select「Clearable」清除後回到 placeholder、打到一半的關鍵字一起清),錯誤一併清掉(值變了,規則 5)。
    // 鈕隨清除卸載:焦點在它身上(鍵盤 Enter / 空白、Chrome 滑鼠按下)時先交給第一個圓 —— APG radio「沒有選取時,Tab 進群組落在第一個」
    // (https://www.w3.org/WAI/ARIA/apg/patterns/radio/),不掉到 body;交接走 Field 共用的 keepFieldFocusBeforeUnmount(Select / Combobox / DatePicker 同一支)。
    // 讀屏:焦點換到第一個圓,讀屏念它「未選取」—— 不另加播報(同 Select 一鍵清空;DS 只在焦點不動時才補念,select-menu-removal-status.tsx)。
    const showClear = !multi && Boolean(question.optional) && (answers[question.id] ?? '') !== ''
    const clearSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
      keepFieldFocusBeforeUnmount(event.currentTarget, document.getElementById(`${optionIdBase}-${allOptions[0].value}`))
      clearError(question.id)
      setAnswers((prev) => ({ ...prev, [question.id]: '' }))
      setOtherText((prev) => ({ ...prev, [question.id]: '' }))
    }
    const renderOtherInput = () => (
      // 「其他」卡:常駐 32 高輸入格;label 行框↔Input 8(mt-2);距卡右/下各 12(卡 px 12;卡 py 8 + mb 4);
      // 左縮排 24 = radio 16 + gap 8,與 label 對齊(Polaris ChoiceChildren 同款)。
      // otherFieldRowRef:這一列唯一的子元素就是 Input 的外框 —— 外框整塊都是輸入處(field-controls.spec.md「點擊與游標原則」),
      // 按在外框裡由輸入格自己負責(聚焦即選中「其他」);縮排 24 與外框圓角外的那一點點仍是卡 —— 判定見下方 pressOptionCard。
      <div ref={otherFieldRowRef} className="mb-1 mt-2 pl-6">
        <Input
          id={otherInputId}
          value={otherText[question.id] ?? ''}
          placeholder={labels.otherPlaceholder}
          aria-label={labels.otherAriaLabel}
          aria-describedby={titleId}
          // 「其他」選中而文字空白:輸入格紅框 + aria-invalid(Input 自己接),aria-errormessage 指向下方錯誤訊息(field.spec.md「驗證與 aria 屬性」)
          error={errorKind === 'other'}
          aria-errormessage={errorKind === 'other' ? errorId : undefined}
          // 聚焦即選中「其他」(agent-decision-card.spec.md 選項卡條)。【待確認】只用 Tab 經過這格也會選中「其他」:選填題因此無法只用鍵盤
          // 「不答就前進」(清除 → 焦點回第一個圓 → Tab 又經過這格 → 又選中);必答題 Tab 經過也會把預選的建議解換成「其他」。改不改交 user。
          onFocus={() => (multi ? toggle(OTHER_VALUE, true) : select(OTHER_VALUE))}
          onChange={(e) => {
            clearError(question.id)
            setOtherText((prev) => ({ ...prev, [question.id]: e.target.value }))
          }}
        />
      </div>
    )
    // 滑鼠/觸控點整張「其他」卡 → 聚焦輸入格(明確指向意圖);鍵盤方向鍵選中不搶焦點(APG radio roving),Tab 一步即到。
    const focusOtherInput = () =>
      window.setTimeout(() => (document.getElementById(otherInputId) as HTMLInputElement | null)?.focus(), 0)
    // 選項卡的點擊:卡 = 控件的標籤盒子,點卡裡任何一點 = 點控件一次(hit-area-canonical.md 一-4「點下去等於點控件」)。
    // 一次點擊只能有一個主人切換,照 HTML label 的啟動行為分 —— WHATWG:label 對「落在它 interactive content 後代上」的點擊
    // 什麼都不做(https://html.spec.whatwg.org/multipage/forms.html#the-label-element):
    //   · 落在控件、或 SelectionItem 的 `<label for>` 上 → 控件自己切換 / 瀏覽器把這一下轉給控件一次;
    //     判準 = DS 共用的「容器裡自有行為的東西」(lib/pointer-press.ts isOwnPointerTarget)再加 label(WHATWG 把 label 列為 interactive content)
    //   · 落在「其他」輸入格的外框裡 → 輸入格自己負責(聚焦即選中)
    //   · 其餘(內距、圓與字的空隙、說明文字)→ 卡把這一下轉給控件:`control.click()`,切換只由控件做
    // 2026-11-03 前卡自己呼叫 toggle、label 又照常轉發 → 點標籤那一整行切兩次抵銷(複選看得出,單選同值看不出);
    // 點「其他」輸入格的外框:按下時聚焦已選中、放開時卡再切一次 → 又抵銷(user 2026-10-29 第十一輪問句「為何多選的那道題目的選項那麼難按？」)。
    // 「其他」卡另有聚焦:滑鼠 / 觸控點下去(detail ≥ 1)且這一下讓它被選中 → 聚焦輸入格。鍵盤 Space、方向鍵、label 與卡轉給控件的
    // 那一下都是 detail 0 的虛擬點擊 —— 取 React Aria `isVirtualClick` 裡 `detail === 0` 那一條判法
    // (https://github.com/adobe/react-spectrum/blob/6dec77beccf0545a04318e6a01b8eb9cbe2dccc6/packages/react-aria/src/utils/isVirtualEvent.ts#L19-L40;
    // 它另外把讀屏 + Firefox、Android TalkBack 的點擊也判成虛擬,本元件沒有取那兩條,那兩種照指標點擊處理;
    // DS 內 agent-panel-fab.tsx 認鍵盤合成的 click 也是 detail === 0 這一條),不搶焦點 ——
    // 方向鍵選到「其他」、焦點在「其他」的圓上按 Space,焦點都留在圓上(APG radio roving;Space「checks the focused radio button」,
    // https://www.w3.org/WAI/ARIA/apg/patterns/radio/);2026-11-03 前兩者都會把焦點拉進輸入格。
    const pressOptionCard = (event: React.MouseEvent<HTMLDivElement>, controlId: string, selectsOther: boolean) => {
      const card = event.currentTarget
      const target = event.target
      if (!(target instanceof Element)) return
      if (otherFieldRowRef.current?.firstElementChild?.contains(target)) return
      const label = target.closest('label')
      if (!isOwnPointerTarget(card, target) && !(label && card.contains(label))) {
        document.getElementById(controlId)?.click()
      }
      if (selectsOther && event.detail > 0) focusOtherInput()
    }
    // 灰底選項卡 = 唯一行距 owner(py 8);SelectionItem 自帶 py((32−1lh)/2=5.5)歸零,避免 double padding
    // (checkbox.spec.md 零外部 gap 鐵律的反向:間距只能有一個 owner)。
    // 滑過:卡片 = 具名群組 `group/agent-option`,自己不掛任何滑過樣式,只帶動卡內控件(OPTION_RADIO_HOVER /
    // OPTION_CHECKBOX_HOVER,理由與鏡射來源見其上方註解)。命中區 = 整卡(pressOptionCard)= 滑過回饋的範圍。
    const cardClass = 'group/agent-option cursor-pointer rounded-md bg-secondary px-3 py-2'
    return (
      <div
        ref={ref}
        role="group"
        aria-labelledby={titleId}
        className={cn(
          // 繼承 Popover surface:rounded-lg/border/elevation-200;改寫:無下圓角、貼底。
          'absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden',
          'rounded-t-lg rounded-b-none border border-b-0 border-border bg-surface-raised',
          'shadow-[var(--elevation-200)]',
          'animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {/* 標題列:N>1 時小標「n / N」+ 題目 + ×(跳過);改寫:header 下無分隔線。 */}
        <SurfaceHeader className={cn(COMPACT_HEADER_SLOT, 'items-start justify-between border-b-0')}>
          <div className="flex min-w-0 flex-1 flex-col">
            {total > 1 && (
              <span className="text-caption font-medium text-fg-secondary">
                {step + 1} / {total}
              </span>
            )}
            <span id={titleId} className="text-body font-medium text-foreground">
              {question.label}
            </span>
          </div>
          <Button dismiss size="sm" startIcon={XIcon} aria-label={labels.skip} onClick={skip} />
        </SurfaceHeader>
        {/* body:上下無內距、左右 16;選項=灰底卡 gap 8(整卡可點;拍板樣張,本地包裝不抽通用元件);捲軸必用 ScrollArea。
            錯誤訊息 = FieldError(與欄位錯誤同一個元件、同字級同色、role="alert"),放在最後一張選項卡之後(agent-decision-card.spec.md「步進」);
            沒有錯誤時 FieldError 不渲染、不佔位。與最後一張卡的距離【待確認】:現行放進選項卡同一個 gap 8 堆疊 = user 2026-10-29 問句裡的提案
            (「跟最後一個選項距離=選項跟選項之間的距離」),不是既有規範推出的;另一案 = Field 內部 gap-1 4。user 選定後改這裡,閘 `scripts/agent-decision-card-validation-invariant.mjs` E4 / E10 一起改。 */}
        <ScrollArea fillX className="min-h-0">
          <div className="flex flex-col gap-2 px-[var(--layout-space-loose)]">
            {multi ? (
              <CheckboxGroup
                key={question.id}
                aria-labelledby={titleId}
                // 沒勾任何一項:群組標 aria-invalid(同 checkbox-group.tsx 在 Field 裡的接法);aria-errormessage 依 WAI-ARIA 1.2 只能掛在
                // checkbox(group 不在它的適用角色),所以下面每個方框各自帶 —— 焦點移到第一個方框時讀得到錯誤
                aria-invalid={groupInvalid || undefined}
                className="flex flex-col gap-2"
              >
                {allOptions.map((option) => {
                  const isOther = option.value === OTHER_VALUE
                  const checked = selectedSet.has(option.value)
                  return (
                    <div
                      key={option.value}
                      data-state={checked ? 'checked' : 'unchecked'}
                      className={cardClass}
                      onClick={(e) => pressOptionCard(e, `${optionIdBase}-${option.value}`, isOther && !checked)}
                    >
                      <SelectionItem
                        size="md"
                        className="py-0"
                        htmlFor={`${optionIdBase}-${option.value}`}
                        control={
                          <Checkbox
                            id={`${optionIdBase}-${option.value}`}
                            size="md"
                            checked={checked}
                            onCheckedChange={(next) => toggle(option.value, next === true)}
                            aria-invalid={groupInvalid || undefined}
                            aria-errormessage={groupInvalid ? errorId : undefined}
                            aria-controls={isOther ? otherInputId : undefined}
                            className={OPTION_CHECKBOX_HOVER}
                          />
                        }
                        label={optionLabel(option)}
                        description={isOther ? undefined : (option as AgentDecisionOption).description}
                      />
                      {isOther && renderOtherInput()}
                    </div>
                  )
                })}
              </CheckboxGroup>
            ) : (
              <RadioGroup
                key={question.id}
                value={answers[question.id] ?? ''}
                onValueChange={select}
                aria-labelledby={titleId}
                // 沒選(noDefault 單選):radiogroup 本身帶 aria-invalid + aria-errormessage(WAI-ARIA 1.2 兩者都適用於 radiogroup、不適用於 radio)
                aria-invalid={groupInvalid || undefined}
                aria-errormessage={groupInvalid ? errorId : undefined}
                // 必答(沒有 `optional`)= radiogroup aria-required="true"(`../Field/field.spec.md`「SR 識別路徑」:required 由控件的 aria-required 承擔;
                // WAI-ARIA 1.2 aria-required 適用 radiogroup,https://www.w3.org/TR/wai-aria-1.2/#aria-required);選填 = "false"(= Radix 原本的預設輸出)。
                // 複選不帶:CheckboxGroup 是 role="group",不在 aria-required 的適用角色裡(axe aria-allowed-attr 會抓),每個方框各帶又會變成「每一項都要勾」。
                aria-required={!question.optional}
                className="flex flex-col gap-2"
              >
                {allOptions.map((option) => {
                  const isOther = option.value === OTHER_VALUE
                  const checked = selectedSet.has(option.value)
                  return (
                    <div
                      key={option.value}
                      data-state={checked ? 'checked' : 'unchecked'}
                      className={cardClass}
                      onClick={(e) => pressOptionCard(e, `${optionIdBase}-${option.value}`, isOther)}
                    >
                      <SelectionItem
                        size="md"
                        className="py-0"
                        htmlFor={`${optionIdBase}-${option.value}`}
                        control={
                          <RadioGroupItem
                            id={`${optionIdBase}-${option.value}`}
                            value={option.value}
                            size="md"
                            aria-controls={isOther ? otherInputId : undefined}
                            className={OPTION_RADIO_HOVER}
                          />
                        }
                        label={optionLabel(option)}
                        description={isOther ? undefined : (option as AgentDecisionOption).description}
                      />
                      {isOther && renderOtherInput()}
                    </div>
                  )
                })}
              </RadioGroup>
            )}
            <FieldError id={errorId}>{errorText}</FieldError>
          </div>
        </ScrollArea>
        {/* footer:右側兩鈕 —— 第一題=跳過(用預設繼續)、第二題起=上一題(答案保留,回上一題可改答),(來源:https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/ChoiceList/ChoiceList.module.css#L1-L4)
            右=下一題 / 送出(末題);左側 = 操作選取的「清除選取」(選填單選題有選取時才有;選取類浮層 footer 順序:左操作選取、右提交,
            overlay-surface.spec.md;排法照 Coachmark footer 的 justify-between + 右側一組,沒有清除鈕時左邊留空 span,右側兩鈕的位置不因它出現 / 消失而動)。
            鈕 sm 守 Popover all-sm 律;清除與跳過 / 上一題同為 tertiary(同 SelectMenu 多選 footer 的全選 / 取消全選);無上分隔線;× 恆為跳過。 */}
        <SurfaceFooter className="justify-between border-t-0">
          {showClear ? (
            <Button variant="tertiary" size="sm" onClick={clearSelection}>
              {labels.clearSelection}
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button variant="tertiary" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                {labels.previous}
              </Button>
            ) : (
              <Button variant="tertiary" size="sm" onClick={skip}>
                {labels.skip}
              </Button>
            )}
            {isLast ? (
              <Button variant="primary" size="sm" onClick={() => advance(() => onSubmit?.(resolvedAnswers()))}>
                {labels.submit}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => advance(() => setStep((s) => s + 1))}>
                {labels.next}
              </Button>
            )}
          </div>
        </SurfaceFooter>
      </div>
    )
  },
)
AgentDecisionCard.displayName = 'AgentDecisionCard'

/* ────────────────────────────────────────────────────────────────────────────
 * 9. AgentDecisionSummary(決策回執)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentDecisionSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** [問題, 答案] 配對(靜態回執)。 */
  entries: Array<{ question: string; answer: string }>
}

const AgentDecisionSummary = React.forwardRef<HTMLDivElement, AgentDecisionSummaryProps>(
  ({ entries, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-body',
        className,
      )}
      {...props}
    >
      {entries.map(({ question, answer }, index) => (
        <div key={index} className="flex flex-col">
          <span className="text-fg-secondary">{question}</span>
          <span className="text-foreground">{answer}</span>
        </div>
      ))}
    </div>
  ),
)
AgentDecisionSummary.displayName = 'AgentDecisionSummary'

export {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentThinking,
  AgentToolbar,
  AgentPromptInput,
  AgentDecisionCard,
  AgentDecisionSummary,
  PANEL_WIDTH_DEFAULT as AGENT_PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN as AGENT_PANEL_WIDTH_MIN,
  PANEL_WIDTH_MAX as AGENT_PANEL_WIDTH_MAX,
}
