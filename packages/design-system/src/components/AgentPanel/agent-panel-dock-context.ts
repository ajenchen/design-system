/**
 * `AgentPanelDock` 交給包在它裡面的 `AgentPanel` 的開關接線(DS 內部;不從 `index.ts` 對外匯出)。
 *
 * 為什麼需要:面板關閉時不卸載、只是 `display:none`(`agent-panel.spec.md`「關閉不等於卸載」)—— 面板自己看不出「我現在是關的」,
 * 而 AppShell 排版要知道 AI agent 的開關紀錄(`app-shell.spec.md`「版面規則」§2),§4 連帶關閉時也要能代為關閉。
 * 開關的唯一主人仍是 Dock(互斥、位置記憶、標誌狀態的唯一住所),這裡只是把它交下去。
 */
import * as React from 'react'

export interface AgentPanelDockLink {
  /** Dock 的開關紀錄。 */
  open: boolean
  /** 版面造成的關閉(§4 連帶關閉):只改開關,焦點由 AppShell 的後備處理(K7),不搬到入口鈕。 */
  setOpen: (open: boolean) => void
}

export const AgentPanelDockContext = React.createContext<AgentPanelDockLink | null>(null)
