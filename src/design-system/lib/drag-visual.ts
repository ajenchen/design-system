/**
 * Drag visual SSOT(2026-05-06 v14.5)
 *
 * DS canonical drag visual,3 處 consumer(TreeView / DataTable row drag / DataTable column reorder)
 * 共用同一組 styling constant — 對齊 TreeView 最早 codified 的 pattern。
 *
 * ## Pattern
 *
 * - **Source element**(被拖中的 row/column):`opacity-30`(半透,user 仍看得到原位)
 *   — 不是 `opacity:0` 全隱形,因 user 拖太遠看不到「源頭」會迷失方向。對齊 TreeView 最早 v1 + Notion / Atlassian / Linear。
 * - **Ghost preview**(浮動 follow cursor):透過 dnd-kit `<DragOverlay>` portal,clone source 的 outerHTML
 *   strip transform/transition/opacity → render 在 portal 層,visually 跟 cursor 走。
 * - **Drop indicator**(目標位置藍細線):2px(`h-0.5` / `w-0.5`)`bg-primary` absolute line:
 *   - **Row context**(TreeView / table row drag):水平線 在 target row 的 top(before)/ bottom(after)
 *   - **Column context**(table column reorder):垂直線 在 target column 的 left(before)/ right(after)
 * - **Inside-drop highlight**(nested target,如拖到 TreeView 子層 / Table nested row 內):整 row `bg-primary-subtle`
 *
 * ## Why centralize
 *
 * 三處 drag 之前各自實作不一致(TreeView opacity:30 + indicator vs DataTable row opacity:0 no indicator
 * vs Column reorder opacity:0 + indicator)— M23 / M27 violation(DS 內 canonical 沒對齊)。
 * 抽到此 module 後 3 處 import 同 constants,未來改 1 處全 sync。
 *
 * ## Token usage
 *
 * - `bg-primary`:semantic state token(`--primary`)— 跟 focus state ring color 同 source(M23 一致)
 * - `bg-primary-subtle`:semantic primary subtle(`--primary-subtle`)— inside-drop dim background
 * - `h-0.5` / `w-0.5`:Tailwind size token = 2px(對齊 hairline divider thickness 概念)
 * - `opacity-30`:Tailwind 30% opacity(半透但仍清楚看到 outline)
 */

import type * as React from 'react'

// ── Source element styling(被拖中的 source row/column)─────────────────────

/**
 * Source element 拖中的 opacity className。
 *
 * **Reuse `opacity-disabled` token**(2026-05-06 v14.5.2 對齊 Atlassian Pragmatic):
 * Atlassian dnd guidelines 也用 `opacity.disabled` token 給 drag source dim(他們值 0.40,
 * 我們值 0.45,role 一致)。不另開 drag-source 專屬 token — single-role-per-value 哲學
 * + DS internal SSOT。
 */
export const dragSourceClass = 'opacity-disabled' as const

/** Source element 拖中的 inline style(consume DS token `--opacity-disabled`)*/
export function dragSourceStyle(isDragging: boolean): React.CSSProperties {
  return isDragging ? { opacity: 'var(--opacity-disabled)' } : {}
}

/**
 * DragOverlay ghost 視覺 canonical(2026-05-06 v14.5.2 對齊 dnd-kit / Atlassian / Material):
 * **不 dim**(opacity:1)+ elevation shadow `shadow-[var(--elevation-200)]` + 顯式 bg
 * (`bg-surface` 或 `bg-surface-raised`)+ border。Lifted preview pattern,跟 surface 拉開
 * 視覺距離靠 shadow 不靠 opacity。
 *
 * Consumer 自己組 className(因 ghost 結構各自不同 — TreeView 是 icon+label compact pill,
 * DataTable 是 cloned row HTML wrapper),這裡只 codify 規則 不導出 class string。
 */

// ── Drop indicator className(target row/column edge 顯藍細線)──────────────

/**
 * Row drop indicator(水平線,跨 row 全寬)
 *
 * - `before`:在 target row top edge,提示「放開後會插入這 row 之前」
 * - `after`:在 target row bottom edge,提示「放開後會插入這 row 之後」
 *
 * **Indent option**:nested context(TreeView / table nested rows)可加 `style={{ left: indentPx }}`
 * 讓 indicator 隨 depth 縮排,視覺對齊 row content 起始位置。
 */
export const dropIndicatorRow = {
  before: 'absolute top-0 left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none',
  after: 'absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none',
} as const

/**
 * Column drop indicator(垂直線,跨 column header height)
 *
 * - `before`:在 target column left edge(-1px outset 對齊 grid line)
 * - `after`:在 target column right edge(-1px outset 對齊 grid line)
 *
 * 兩種變體,視覺一致(2px primary line),只有 DOM mechanism 不同 — consumer 視 use case 選:
 *
 * - **`absoluteDiv`**(TreeView pattern):render absolute `<div>` child;
 *   consumer 必須有 `position: relative` parent。
 * - **`pseudoBefore` / `pseudoAfter`**:用 Tailwind `before:` / `after:` pseudo-element;
 *   consumer 不需 child element(適合 cloneElement 等不能加 child 的場景)。
 *
 * 兩變體 thickness / color / z-index 完全一致,差別純 implementation 機制。
 */
export const dropIndicatorColumn = {
  // Absolute div 變體(consumer render <div>)
  before: 'absolute top-0 bottom-0 left-[-1px] w-0.5 bg-primary z-10 pointer-events-none',
  after: 'absolute top-0 bottom-0 right-[-1px] w-0.5 bg-primary z-10 pointer-events-none',
  // Pseudo-element 變體(用 Tailwind before:/after:)
  pseudoBefore: 'before:absolute before:top-0 before:bottom-0 before:left-[-1px] before:w-0.5 before:bg-primary before:z-10 before:pointer-events-none before:content-[""]',
  pseudoAfter: 'after:absolute after:top-0 after:bottom-0 after:right-[-1px] after:w-0.5 after:bg-primary after:z-10 after:pointer-events-none after:content-[""]',
} as const

// ── Inside-drop highlight(nested context,target row 整列亮藍 subtle)─────

/**
 * Nested 拖入 highlight(TreeView / nested rows 拖到子層)。整 row 加 background。
 */
export const dropIndicatorInside = 'bg-primary-subtle' as const

// ── Cursor classes ────────────────────────────────────────────────────────

/** Draggable element hover 時的 cursor(grab)*/
export const dragHandleCursor = 'cursor-grab' as const
/** Draggable element 拖中時的 cursor(grabbing)*/
export const dragActiveCursor = 'cursor-grabbing' as const

// ── Reorder noop helper(SSOT 對齊 row + column reorder canonical) ────────

/**
 * Drop position 等同 source 原位 → noop。對齊 Linear / Notion / Jira / TreeView SSOT:
 * user 拉到 source 鄰近(視覺等同原位)應 cancel,不 commit reorder 也不顯 indicator。
 *
 * Consumer 在 onDragOver 用此判斷是否畫 indicator;onDragEnd 用同一函數判斷是否
 * 觸發 reorder callback —— 兩處共享一個 invariant,避免「indicator 顯示但 commit 不 fire」
 * 或反向 drift。
 *
 * 規則:
 *   - source idx N,drop on idx N (self) → noop
 *   - source idx N,drop on idx N-1 with side='after'  = N(原位)→ noop
 *   - source idx N,drop on idx N+1 with side='before' = N(原位)→ noop
 */
export function isReorderNoop(activeIdx: number, overIdx: number, side: 'before' | 'after'): boolean {
  if (activeIdx === overIdx) return true
  if (side === 'after' && overIdx + 1 === activeIdx) return true
  if (side === 'before' && overIdx - 1 === activeIdx) return true
  return false
}

// ── Ghost reconstruction(跨 region table row → 完整橫跨 ghost) ───────────

/**
 * 為 dnd-kit DragOverlay 抓 source row clone(primary region only)。
 *
 * **Why**:Pinned column DataTable 結構 = 三 region(left / center / right)各 mount 一個
 * row div(同 row.id),但 listeners 只在 primary region(center)。Ghost 必須來自 primary
 * region row(= activator rect 對應的那個 DOM)→ DragOverlay 起始位置 + ghost width 才會
 * 跟 cursor 對齊(對齊 user directive「ghost 跟 cursor 維持固定相對位置」SSOT)。
 *
 * **What**:優先抓 `[data-row-drag-source="true"]` marker 的 row(consumer 在 primary region
 * 標此 attr);fallback `[data-sortable-row-id="${id}"]` 第一個 match(single-region 場景)。
 *
 * **Returns** `{ html, width }` 或 `null`(若找不到 row)。
 */
export function reconstructFullRowGhost(rowId: string): { html: string; width: number } | null {
  const sourceEl = document.querySelector<HTMLElement>(
    `[role="row"][data-sortable-row-id="${rowId}"][data-row-drag-source="true"]`,
  ) ?? document.querySelector<HTMLElement>(
    `[role="row"][data-sortable-row-id="${rowId}"]`,
  )
  if (!sourceEl) return null
  const clone = sourceEl.cloneNode(true) as HTMLElement
  sanitizeGhostClone(clone, sourceEl.offsetWidth)
  return { html: clone.outerHTML, width: sourceEl.offsetWidth }
}

/**
 * Reset ghost clone inline styles + strip 干擾 attributes(transform/opacity/data-row-index 等)。
 * Internal helper, not exported.
 */
function sanitizeGhostClone(el: HTMLElement, width: number): void {
  el.style.position = 'static'
  el.style.transform = 'none'
  el.style.transition = 'none'
  el.style.opacity = '1'
  el.style.zIndex = ''
  el.style.width = `${width}px`
  el.removeAttribute('data-row-index')
  el.removeAttribute('aria-rowindex')
  el.removeAttribute('data-hovered')
  el.querySelectorAll('[data-drag-handle-portal]').forEach((n) => n.remove())
}

// ── Type exports for consumer ─────────────────────────────────────────────

export type DropPosition = 'before' | 'after' | 'inside'
