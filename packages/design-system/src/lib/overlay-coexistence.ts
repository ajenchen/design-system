/**
 * 浮層並存 primitive —— 讓一個浮層在開著時,**指定的區域仍然可用**。
 *
 * ── 為什麼需要它 ──────────────────────────────────────────────────────
 * agent 原則 v14 條 A:「內部內容以自己的 URL 取得協作資格」;條 B:「寬螢幕讓具資格的
 * 內容與 agent **並列可操作**」。Radix Dialog 的 modal 分支寫死三件事,三件都擋住它:
 *   `hideOthers(content)` 只保留 content(`react-dialog` 的 modal 分支,無法傳白名單)
 *   `trapFocus: true` + `onFocusOutside: preventDefault`(焦點出不去)
 *   `disableOutsidePointerEvents: true`(body 不可點)
 * 而 `modal={false}` 是另一個極端:三件全關,**連 Overlay 都不渲染**。
 * 兩個預設都不是 v14 要的「其餘 inert、但這幾塊仍可用」。
 *
 * ── 這支做什麼 ────────────────────────────────────────────────────────
 * `suppressOthers([...保留節點])` —— `aria-hidden` 官方 API,第一個參數就收**陣列**,
 * 支援 `inert` 時用原生 `inert`(一次處理鍵盤、指標、無障礙樹),不支援才退回 `aria-hidden`。
 * 保留節點以外的整棵樹被抑制,保留節點自己完全不受影響。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────
 * - **不合成跨區的 Tab 循環**。v14 只要求「並列**可操作**」,沒要求兩區之間 Tab 連續;
 *   鍵盤往返是 user 2026-09-07 明確裁示的 backlog,不在這裡偷偷升級成前置條件。
 * - **不碰預設路徑**。沒有傳保留節點時這支不做任何事,Dialog 的 modal 行為一個位元不變。
 * - **不認識 agent**。它只知道「保留這些節點」,誰是 agent 由呼叫端決定 —— DS 元件不被產品概念汙染。
 */
import * as React from 'react'
import { suppressOthers } from 'aria-hidden'

export type CoexistenceTargets = () => Element[]

/**
 * @param active   浮層是否開著
 * @param keep     要保留可用的節點(回傳陣列的函式,在 effect 內才呼叫 —— ref 那時才有值)
 */
export function useOverlayCoexistence(active: boolean, keep: CoexistenceTargets | undefined) {
  React.useEffect(() => {
    if (!active || !keep) return
    const targets = keep().filter((el): el is Element => !!el && el.isConnected)
    // 一個保留節點都沒有時什麼都不做:抑制「除了空集合以外的一切」等於抑制整頁,
    // 那會把浮層自己也關掉(2026-09-08 寫這支時第一個想到的失敗模式)。
    if (targets.length === 0) return
    return suppressOthers(targets)
  }, [active, keep])
}
