/**
 * AppShell 與住在它裡面的三個面板(Menu = `Sidebar`、Right panel = `AppShellAside`、AI agent = `AgentPanel`)之間的內部契約。
 *
 * 規則的唯一住所是 `app-shell.spec.md`「版面規則」;計算的唯一住所是 `./layout-model.ts`。這裡只有「面板怎麼把自己的設定交給 AppShell、
 * 怎麼拿回此刻的顯示方式與寬度」—— 面板自己不算任何版面(N1:四區只有 AppShell 一個判定點)。
 *
 * 為什麼是登記而不是讀 props:三個面板都是 ReactNode slot(AI agent 還包在 `AgentPanelDock` 的 render prop 裡),AppShell 讀不到它們的 props;
 * 開關也各有主人(Menu 的開關住在 `SidebarProvider`、Right panel 的在 AppShell、AI agent 的在 `AgentPanelDock`)。所以每個面板在 layout effect 裡
 * 把「目前內容類型 + 寬度設定」與「開關 + 改開關的函式」登記給 AppShell(paint 之前完成,第一格畫面就是算好的版面)。
 *
 * DS 內部模組:不從 `index.ts` 對外匯出;消費者用 `useAppShell()`(`app-shell.tsx`)。
 */
import * as React from 'react'
import type { AppShellPanelId, PanelDisplay, PanelWidthRange } from './layout-model'

export type { AppShellPanelId, PanelDisplay, PanelWidthRange }

/** 面板交給 AppShell 的寬度設定(U:6「依面板的內容類型預先設定最小、初始、最大寬度」)與寬度紀錄的接口(§7)。 */
export interface PanelWidthRegistration {
  /** 目前顯示的內容類型;同一類型的不同資料共用設定與紀錄(U:6、U:66)。 */
  contentType: string
  /** 這種內容類型的最小 / 初始 / 最大。 */
  widthRange: PanelWidthRange
  /** 產品自存的紀錄(重新整理後還原用;DS 不存,§7)。只在這種內容類型還沒有紀錄時當成紀錄。 */
  defaultWidth?: number
  /** 受控紀錄(AgentPanel `width`):有值時就是這種內容類型的紀錄。 */
  width?: number
}

/** 寬度相關的回呼(走 ref,consumer 傳 inline 函式也不會讓登記一直重跑)。 */
export interface PanelWidthCallbacks {
  /** 拖拉中每一格、鍵盤每一步(此刻顯示的寬)。 */
  onWidthChange?: (width: number) => void
  /** 一次調整結束、寬度紀錄寫入時(= 新紀錄;只點一下不發,§7)。產品要跨重新整理記住寬度就存這個值。 */
  onWidthCommit?: (width: number) => void
}

/** 開關的主人交給 AppShell 的東西(U:9 開關只有使用者改得動;AppShell 只在 §4 連帶關閉時代為關閉)。 */
export interface PanelOpenRegistration {
  open: boolean
}

/** 面板此刻的樣子 + 調寬的接口(ResizeHandle 直接接這幾支)。 */
export interface AppShellPanelHandle {
  display: PanelDisplay
  /** 並排或浮層時此刻顯示的寬(px;拖拉中跟著指標);暫藏 / 關閉時 undefined。 */
  width: number | undefined
  /** 此刻允許的調寬範圍:並排 = [最小, 可拉上限](§5);浮層 = §9 的浮層範圍。暫藏 / 關閉時 undefined。 */
  range: { min: number; max: number } | undefined
  /** 拖拉中(把手按住中):面板關掉寬度過渡,畫面才跟得上指標。 */
  resizing: boolean
  onResize: (width: number) => void
  onResizeCommit: (width: number) => void
  onDraggingChange: (dragging: boolean) => void
}

export interface AppShellRegistry {
  registerWidth: (panel: AppShellPanelId, registration: PanelWidthRegistration, callbacks: React.MutableRefObject<PanelWidthCallbacks>) => () => void
  registerOpen: (panel: AppShellPanelId, registration: PanelOpenRegistration, setOpen: React.MutableRefObject<(open: boolean) => void>) => () => void
  /** Menu 登記自己有沒有細列(`collapsible="icon"`,§6)。 */
  registerMenuRail: (hasRail: boolean) => () => void
  /** 使用者按 Menu 開關或 ⌘B(§3)。 */
  toggleMenu: () => void
  /** Menu 浮層開著時按 Esc 或點浮層外 → 收回暫藏(D:26)。 */
  dismissMenuOverlay: () => void
  /** Menu 細列寬(px,量 `--sidebar-width-icon`);沒有細列時 0。 */
  railWidth: number
  /** 產品沒給 Menu 寬度設定時的 DS 預設(量 `--sidebar-width-min` / `--sidebar-width`;§1)。 */
  menuDefaultRange: PanelWidthRange
  /** Menu 浮層的 portal 目的地(`<AppShell portalContainer>`;省略 = document.body)。 */
  portalContainer?: HTMLElement | null
}

export const AppShellRegistryContext = React.createContext<AppShellRegistry | null>(null)
export const AppShellPanelsContext = React.createContext<Record<AppShellPanelId, AppShellPanelHandle> | null>(null)

/** 面板在 AppShell 裡時回登記接口;單獨使用時 null(面板走自己的單獨規則,N14)。 */
export function useAppShellRegistry(): AppShellRegistry | null {
  return React.useContext(AppShellRegistryContext)
}

function sameRange(a: PanelWidthRange, b: PanelWidthRange) {
  return a.min === b.min && a.initial === b.initial && a.max === b.max
}

/**
 * 面板登記寬度設定與回呼,拿回此刻的顯示方式與寬度。不在 AppShell 裡時回 null。
 * 登記在 layout effect(paint 之前);只有值真的變了才重登記(回呼走 ref)。
 */
export function useAppShellPanel(
  panel: AppShellPanelId,
  registration: PanelWidthRegistration | null,
  callbacks: PanelWidthCallbacks,
): AppShellPanelHandle | null {
  const registry = React.useContext(AppShellRegistryContext)
  const panels = React.useContext(AppShellPanelsContext)
  const callbacksRef = React.useRef(callbacks)
  callbacksRef.current = callbacks
  const lastRef = React.useRef<PanelWidthRegistration | null>(null)
  const stable = registration && lastRef.current
    && lastRef.current.contentType === registration.contentType
    && sameRange(lastRef.current.widthRange, registration.widthRange)
    && lastRef.current.defaultWidth === registration.defaultWidth
    && lastRef.current.width === registration.width
    ? lastRef.current
    : registration
  lastRef.current = stable
  React.useLayoutEffect(() => {
    if (!registry || !stable) return
    return registry.registerWidth(panel, stable, callbacksRef)
  }, [registry, panel, stable])
  if (!registry || !panels) return null
  return panels[panel]
}

/** 開關的主人登記開關;AppShell 只在 §4 連帶關閉(與焦點後備)時代為呼叫 `setOpen(false)`。 */
export function useAppShellPanelOpen(panel: AppShellPanelId, open: boolean, setOpen: (open: boolean) => void): boolean {
  const registry = React.useContext(AppShellRegistryContext)
  const setOpenRef = React.useRef(setOpen)
  setOpenRef.current = setOpen
  React.useLayoutEffect(() => {
    if (!registry) return
    return registry.registerOpen(panel, { open }, setOpenRef)
  }, [registry, panel, open])
  return !!registry
}
