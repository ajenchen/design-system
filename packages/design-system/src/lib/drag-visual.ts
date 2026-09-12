/**
 * Drag visual SSOT(2026-05-06 v14.5)
 *
 * DS canonical drag visual,3 處 consumer(TreeView / DataTable row drag / DataTable column reorder)
 * 共用同一組 styling constant — 對齊 TreeView 最早 codified 的 pattern。
 *
 * ## Pattern
 *
 * - **Source element**(被拖中的 row/column):`opacity-disabled`(= var(--opacity-disabled) 0.45 半透,user 仍看得到原位;2026-05-06 v14.5.2 由 opacity-30 改)
 *   — 不是 `opacity:0` 全隱形,因 user 拖太遠看不到「源頭」會迷失方向。對齊 TreeView 最早 v1 + Notion / Atlassian / Linear。
 * - **Ghost preview**(浮動 follow cursor):透過 dnd-kit `<DragOverlay>` portal,clone source 的 outerHTML
 *   strip transform/transition/opacity → render 在 portal 層,visually 跟 cursor 走。
 * - **Drop indicator**(目標位置藍細線):2px(`h-0.5` / `w-0.5`)`bg-primary` absolute line:
 *   - **Row context**(TreeView / table row drag):水平線 在 target row 的 top(before)/ bottom(after)
 *   - **Column context**(table column reorder):垂直線 在 target column 的 left(before)/ right(after)
 * - **Inside-drop highlight**(nested target,如拖到 TreeView 子層 / Table nested row 內):整 row `bg-drop-target`
 *   (2026-09-03:由 `bg-primary-subtle` 改為 DS「可放下的區域」配對 —— 它蓋在該列自己的內容之上,依 color.spec
 *   「Drop target」段必須半透明;`--primary-subtle` 是元件自己的不透明淡底,語意不同)
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
 * - `bg-drop-target`:semantic 可放下的區域底(`--drop-target` = `--primary` @ 15%,兩模式皆半透明)— inside-drop highlight
 * - `h-0.5` / `w-0.5`:Tailwind size token = 2px(對齊 hairline divider thickness 概念)
 * - `opacity-disabled`:DS token var(--opacity-disabled)= 0.45(半透但仍清楚看到 outline;見下方 v14.5.2 note)
 */

import type * as React from 'react'
import type { Modifier } from '@dnd-kit/core'

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
 * 消費 DS「可放下的區域」配對的底色(`--drop-target`):它是覆蓋在該列文字之上的區域提示,
 * 依 color.spec「Drop target」段必須半透明(VS Code `list.dropBackground` 同款)。
 *
 * **為什麼帶 `hover:` 同色**(2026-09-06):inside-drop 的目標列**必然就是游標底下那一列**,
 * 而 dnd-kit 全程不呼叫 `setPointerCapture`(`@dnd-kit/core` 內 0 命中),所以拖曳期間
 * CSS `:hover` 照樣命中該列。少了這半邊,消費端的 `hover:bg-neutral-hover`(0,2,0)
 * 會在特異性上壓過無修飾的 `bg-drop-target`(0,1,0)—— 也就是**游標一放到可放入的節點上,
 * 「可以放這裡」的訊號就消失**,只剩一般的 hover 灰。把 hover 釘成同色即免疫。
 *
 * **消費端仍須負責順序**:本字串要放在 `cn()` 內所有其他 `bg-*` 之後。twMerge 同組後者勝,
 * 排在 `bg-neutral-selected` 之前會被整條刪掉(已選中的列因此永遠看不到落點底色)。
 */
export const dropIndicatorInside = 'bg-drop-target hover:bg-drop-target' as const

// ── dnd-kit activator 屬性:安全轉發 ──────────────────────────────────────

/**
 * 把 dnd-kit `useDraggable().attributes` / `useSortable().attributes` 灑到 DOM 之前先過這一關。
 *
 * **為什麼需要**:dnd-kit 在拖曳期間無條件加上 `aria-pressed="true"`
 * (`@dnd-kit/core` core.esm.js:3432 起的 memoizedAttributes)。它假設 activator 是一顆
 * `role="button"` 的切換鈕,但我們的 activator 有三種都不是:
 *   1. **拖曳把手**是 `<Button>`,而本 DS 的 Button 把 `aria-pressed` 解讀成「toggle 按下」
 *      (button.tsx `aria-pressed:bg-primary-subtle / text-primary / border-transparent`),
 *      於是非 toggle 的把手在拖曳中被畫成藍底藍字無框 —— 沒有人決定過這個外觀。
 *   2. **欄位表頭**是 `role="columnheader"`;`aria-pressed` 依 ARIA 只用於 `button` 角色,
 *      放在 columnheader 上是**無效 ARIA**。
 *   3. **面板內的排序項目**同理。
 *
 * **為什麼放在這裡而不是各元件自己處理**:同一個能力跨元件必進 SSOT
 * (`ds-canonical/references/drag-canonical.md` invariant 7)。這條先前只在 DataTable 的列把手
 * 上修過一次,結果欄位表頭與兩個面板仍在灑 —— 正是「改 A 沒改 B」。收進這裡之後,
 * 未來任何新的 drag 消費者只要走這個 helper 就不會再踩。
 *
 * 保留 `role` / `tabIndex` / `aria-roledescription` / `aria-describedby`:
 * 那些是 dnd-kit 的鍵盤與螢幕閱讀器接線,拿掉會弄壞無障礙。
 */
export function forwardDragActivatorAttributes(
  attributes: object | undefined,
): Record<string, unknown> {
  if (!attributes) return {}
  const { 'aria-pressed': _ariaPressed, ...rest } = attributes as Record<string, unknown>
  return rest
}

// ── Cursor classes ────────────────────────────────────────────────────────

/** Draggable element 拖中時的 cursor(grabbing)*/
export const dragActiveCursor = 'cursor-grabbing' as const
/**
 * Combined drag handle cursor canonical(2026-05-07 v15.7 user directive):
 * **只 cursor-grab,不變 grabbing**。對齊 Material / Carbon / Polaris canonical —
 * drag affordance 由 visible button 提供,cursor 變化反而干擾 indicator+ghost 視覺焦點。
 * Consumer 直接 cn(...)。
 */
export const dragHandleCursorClass = 'cursor-grab' as const

// ── Modifier:Ghost 跟 cursor 維持初始相對位置 SSOT(v15.7 user directive) ─

/**
 * Ghost 跟 cursor 維持「cursor 在 ghost 點下時相對位置」SSOT(對齊 user directive
 * 「ghost 和 cursor 要確保相對位置是合理的而且有 ssot」)。
 *
 * **Why need this**:dnd-kit DragOverlay 預設 ghost.top-left = source rect (`setNodeRef`)
 * 的 top-left。當 source ≠ activator 位置不同(e.g. activator = portal'd Button 在
 * table outer 邊緣;source = primary row 在 table 內 column region),cursor 點下
 * activator → cursor 落在 source rect 的 negative offset → ghost 永遠相對 source rect
 * 起算 → cursor 跟 ghost 起始就有大 offset(e.g. 100+ px),drag 期間維持錯位。
 *
 * **本 modifier**:把 (cursor.initial - source.left, cursor.initial - source.top)
 * 加進 transform → ghost.top-left 永遠對齊 cursor 位置(cursor 在 ghost 左前角)。
 * Consumer 套進 DndContext.modifiers array,所有 drag scenario 套用 = SSOT。
 *
 * **對齊世界級**:Linear / Notion / Jira / AG Grid 的 row drag ghost 都跟 cursor
 * 維持初始相對位置(整列拖時 cursor 在 click 點;button 拖時 cursor 在 button 位置)—
 * 這個 modifier 把「整列拖 + 整列 ghost」UX 在 button-only / 多 region 場景下也達到。
 */
export const snapToCursorModifier: Modifier = ({ transform, activatorEvent, draggingNodeRect }) => {
  if (!activatorEvent || !draggingNodeRect) return transform
  // **codex P1 fix(2026-05-07 v15.12)**:KeyboardSensor 走 KeyboardEvent,沒
  // `clientX/clientY` → `offsetX/offsetY = NaN` → ghost transform 變 NaN/NaN →
  // overlay 定位+collision 全 corrupt → keyboard-initiated drag 直接壞。Guard 條件:
  // 只 pointer/mouse event 才平移,keyboard 走 dnd-kit 預設(無 modifier 偏移)。
  if (!('clientX' in activatorEvent) || !('clientY' in activatorEvent)) return transform
  const ev = activatorEvent as PointerEvent | MouseEvent
  if (typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') return transform
  const offsetX = ev.clientX - draggingNodeRect.left
  const offsetY = ev.clientY - draggingNodeRect.top
  return {
    ...transform,
    x: transform.x + offsetX,
    y: transform.y + offsetY,
  }
}

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
 * 為 dnd-kit DragOverlay 重建跨 region 的完整 row ghost(2026-05-07 v15.9 Bug A+B 修)。
 *
 * **Why cross-region**:Pinned column DataTable 結構 = 三 region(left / center / right)
 * 各 mount 一個 row div(同 `row.id`),listeners 只在 primary(center)。之前 ghost 只
 * 抓 primary region row → cells 只有 center 欄(missing pinned SKU / Updated)→ user 看
 * 到 ghost「跟 source 不一樣」(Bug B)。virtualized + 無 pinning 下亦可能因 region 多
 * 個 mount 衍生不可預期(Bug A)。
 *
 * **Algorithm**:
 *   1. 收集 `[role="row"][data-sortable-row-id="${id}"]` 所有 match(可能 1-3 個 region)
 *   2. DOM 文檔順序剛好是 left → center → right(因 body region 排列順序)
 *   3. 從每個 region row 的 children(role=cell)抽出 outerHTML,串成單一 flex row
 *   4. 總寬 = sum(region offsetWidth)
 *   5. Wrap 用 primary region 的 className(視覺一致)+ inline `display:flex; width:total`
 *
 * **Single-region case**(無 pinning,常見):退化成 single row clone + sanitize,行為跟舊版同。
 *
 * **Returns** `{ html, width }` 或 `null`(找不到 row)。
 */
export function reconstructFullRowGhost(
  rowId: string,
  tableRoot: HTMLElement | null,
): { html: string; width: number } | null {
  // **codex P1 fix(2026-05-07 v15.13)**:tableRoot 強制 required(non-optional)。
  // 之前 fallback document 仍允許多 DataTable 同頁 row.id reuse(default index-based)→
  // cross-instance ghost 污染。strict-scope canonical:caller 必傳 tableRef.current
  // (`[data-data-table-outer]`),null 直接 return null(caller 該守 ref 已 mount)。
  if (!tableRoot) return null
  const escaped = rowId.replace(/(["\\])/g, '\\$1')
  const allRows = Array.from(
    tableRoot.querySelectorAll<HTMLElement>(
      `[role="row"][data-sortable-row-id="${escaped}"]`,
    ),
  )
  if (allRows.length === 0) return null

  // Single-region:直接 clone 整 row + sanitize(無 pinning 場景,跟舊版一致)
  if (allRows.length === 1) {
    const sourceEl = allRows[0]
    const clone = sourceEl.cloneNode(true) as HTMLElement
    sanitizeGhostClone(clone, sourceEl.offsetWidth)
    return { html: clone.outerHTML, width: sourceEl.offsetWidth }
  }

  // Multi-region:抽 cells 串接。Primary region(`data-row-drag-source="true"`)的
  // className + role 給 outer wrapper,確保 hover bg / border / row-height token 一致。
  const primaryRow =
    allRows.find((r) => r.dataset.rowDragSource === 'true') ?? allRows[0]
  const cellsHtml: string[] = []
  let totalWidth = 0
  for (const regionRow of allRows) {
    totalWidth += regionRow.offsetWidth
    for (const cell of Array.from(
      regionRow.querySelectorAll<HTMLElement>('[role="cell"],[role="gridcell"]'),
    )) {
      const cellClone = cell.cloneNode(true) as HTMLElement
      // Strip drag handle portal(只在 primary region)+ inline transform 殘餘
      cellClone.querySelectorAll('[data-drag-handle-portal]').forEach((n) => n.remove())
      cellClone.style.transform = 'none'
      cellsHtml.push(cellClone.outerHTML)
    }
  }
  // 套 primary row 的 class(cn 結果含 hover/border/sizing token)+ display:flex 顯式
  // 容納 cells,inline style override transform/position/opacity 避免 stale 殘餘
  const inlineStyle = `display:flex; width:${totalWidth}px; transform:none; position:static; opacity:1; transition:none;`
  const html = `<div role="row" class="${primaryRow.className}" style="${inlineStyle}">${cellsHtml.join('')}</div>`
  return { html, width: totalWidth }
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

// ── 拖曳啟動門檻(全 DS 單一來源)────────────────────────────────────────────

/**
 * 指標要移動多少 px 才算「開始拖曳」而不是「點一下」。
 *
 * 為什麼要有這個常數:2026-09-07 盤點發現全 DS 有三個不同答案 ——
 * DataTable 8、TreeView 5、AgentFab 8,而**欄位顯示面板與排序面板根本沒設**,
 * 於是吃 dnd-kit 預設(零距離即啟動):單次 `pointerdown` 零位移就會觸發拖曳,
 * 使用者只是想點一下核取方塊,卻收到 `aria-pressed=true` 與兩則 assertive 播報。
 *
 * 值取 8 —— 三處裡兩處已經是 8,其中 AgentFab 的 8 還是 user 實際用過調出來的
 * (`agent-panel-fab.tsx` DRAG_THRESHOLD)。dnd-kit 官方範例亦落在 8–10 這一帶。
 */
export const DRAG_ACTIVATION_DISTANCE_PX = 8

// ── 鍵盤拖曳:一次跳一格,不是一次 25px ──────────────────────────────────────

/**
 * dnd-kit 鍵盤拖曳的座標計算 —— **跳到下一個合法落點的中心**,而不是固定位移。
 *
 * 為什麼要自己寫:dnd-kit 的預設 getter 每按一次箭頭只移 **25px**
 * (`@dnd-kit/core/src/sensors/keyboard/defaults.ts`)。DataTable 的欄寬是 100–240px,
 * 於是「把一欄往右移一格」實測要按 **11 次**才會跨進隔壁欄的矩形 —— 能操作,但難用到
 * 幾乎沒人會用(2026-09-07 真瀏覽器實測)。
 *
 * 為什麼不是用 `sortableKeyboardCoordinates`:那是 `@dnd-kit/sortable` 的 preset,
 * 需要 `<SortableContext>` 才解得出下一個目標,而本 DS 的表格走的是
 * `useDraggable` + `useDroppable`(2026-05-07 明確砍掉 SortableContext)。
 * 當年那個決定排除的是**那個 preset**,不是「不能有自訂 getter」——
 * 這一份就是缺掉的那塊。
 *
 * 做法:沿按鍵的軸,在所有**合法**落點裡找中心點落在前方最近的那一個,
 * 回傳讓被拖曳者中心對齊它所需的座標。找不到就回 undefined(dnd-kit 會維持原位),
 * 這樣「左邊只剩鎖定欄」之類的情況自然就是不動,不需要另外寫規則。
 */
export function createStepToNeighborCoordinateGetter(
  /** 判斷某個落點在這一趟拖曳裡合不合法(例如型別要相同、鎖定欄要排除)。 */
  isValidTarget?: (targetId: string, activeId: string, context: StepGetterContext) => boolean,
) {
  return (event: KeyboardEvent, args: StepGetterArgs) => {
    const AXIS: Record<string, 'x' | 'y'> = {
      ArrowLeft: 'x', ArrowRight: 'x', ArrowUp: 'y', ArrowDown: 'y',
    }
    const axis = AXIS[event.code]
    if (!axis) return
    const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown'
    const { currentCoordinates, context, active } = args
    const rect = context.collisionRect
    if (!rect) return

    const centerOf = (r: { left: number; top: number; width: number; height: number }) =>
      axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
    const here = centerOf(rect)

    let best: number | null = null
    context.droppableRects.forEach((r, id) => {
      const sid = String(id)
      if (sid === String(active)) return
      if (isValidTarget && !isValidTarget(sid, String(active), context)) return
      const c = centerOf(r)
      // 只看前方的;`+1` 的容差避開浮點與同中心的情況
      if (forward ? c <= here + 1 : c >= here - 1) return
      if (best === null || Math.abs(c - here) < Math.abs(best - here)) best = c
    })
    if (best === null) return

    const delta = best - here
    return axis === 'x'
      ? { x: currentCoordinates.x + delta, y: currentCoordinates.y }
      : { x: currentCoordinates.x, y: currentCoordinates.y + delta }
  }
}

/** `createStepToNeighborCoordinateGetter` 用得到的 dnd-kit context 欄位(結構型別,不綁 dnd-kit 版本)。 */
export interface StepGetterContext {
  collisionRect: { left: number; top: number; width: number; height: number } | null
  droppableRects: Map<string | number, { left: number; top: number; width: number; height: number }>
  droppableContainers: { get(id: string | number): { data?: { current?: Record<string, unknown> } } | undefined }
}

interface StepGetterArgs {
  active: string | number
  currentCoordinates: { x: number; y: number }
  context: StepGetterContext
}

// ── Type exports for consumer ─────────────────────────────────────────────

export type DropPosition = 'before' | 'after' | 'inside'
