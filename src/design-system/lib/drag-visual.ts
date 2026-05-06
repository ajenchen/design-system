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

/** Source element 拖中的 opacity className(consumer apply on source element)*/
export const dragSourceClass = 'opacity-30' as const

/** Source element 拖中的 inline style(對需要 conditional 的 use case)*/
export function dragSourceStyle(isDragging: boolean): React.CSSProperties {
  return isDragging ? { opacity: 0.3 } : {}
}

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

// ── Type exports for consumer ─────────────────────────────────────────────

export type DropPosition = 'before' | 'after' | 'inside'
