// @internal — DS-internal 單元(viewport 覆蓋 paint layer,只被 data-table.tsx 內部消費);不隨 index.ts re-export 進 npm public surface。
/**
 * DataTableInteractionLayer — Slice D Step 1A scaffold(per `.claude/planning/datatable-spreadsheet-rfc.md`)
 *
 * Singleton overlay root inside DataTable(M21 private,不抽 global pattern)。
 * Sub-layer children(2026-07-04 對齊實作;原 RFC 5-layer 清單含未實作元件):
 *   - HoverCellRect(z 1):hover 邊框,「one geometry owner, two paint owners」(Contract 8)
 *   - SelectionRing(z 2):spreadsheet mode selected cell 1px ring(CELL_RING_STYLES.selected)
 *   - ActiveEditorHost(z 3):portal active edit Field(Slice C wire-up)
 *   -(range 視覺 = CSS [data-range-cell] cell-bg,非 layer 元件;nested popup 走 Radix idiom
 *     見 active-editor-controller.ts — RangeRect / NestedPortalRegistry 元件不存在)
 *
 * Slice D Step 1A scope:
 *   - getCellRect(cellId)geometry source(per Contract 8)
 *   - HoverCellRect 1 layer 先做(Contract 8 / Contract 15 cellClickEntersEdit predicate)
 *   - 默認 disabled via `experimentalSpreadsheetOverlay` flag,不破現有 outline
 *   - 後續 Step 1B/C/D 漸進切換 + 拆 outline
 */

import * as React from 'react'

type CellId = string

interface CellRect {
  x: number
  y: number
  width: number
  height: number
}

interface DataTableInteractionLayerProps {
  /** Flag default false:不破現有 outline。enable 後 hover/editor 走 overlay。 */
  enabled: boolean
  /** Container ref;geometry source(getCellRect 由此 query cell DOM)。layer root 本身是
   *  position:fixed inset:0 viewport-anchor(見 render),非 container-origin absolute */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Per Contract 15:`cellClickEntersEdit` predicate;hover overlay 顯示與否 */
  cellClickEntersEdit?: (cellId: CellId) => boolean
  /**
   * Active editor cell id。null = 無 active editor。
   * 已接線(Slice D Step 5 完成,2026-07-14 docblock 對齊):activeEditorEnabled +
   * activeEditorCellId + activeEditorRender 齊 → ActiveEditorHost(z 3)portal render
   * 真 edit Field(per Contract 8「two paint owners」)。
   */
  activeEditorCellId?: CellId | null
  /**
   * Slice D Step 3.x flag:啟用 ActiveEditorHost dashed scaffold rect rendering。
   * 2026-05-10 bug fix(user 圖1 雙 ring 同時顯示):dashed scaffold 之前綁
   * `enabled`(= experimentalSpreadsheetOverlay)→ 任何 cell 進 edit mode 就 leak
   * 出 dashed rect。改 gate 給 `experimentalActiveEditorController`(Step 3.3 真
   * portal Field 工作),hover overlay scope 不會看到 dashed scaffold。
   */
  activeEditorEnabled?: boolean
  /**
   * Slice D Step 4(spreadsheet semantics,2026-05-10 user 圖1 ask + RFC Contract 5):
   * Excel-like 選取 cell ID。Click 1 select / Click 2 enter edit。
   * Layer renders solid border SelectionRect(per user「不要 dash 直接實的就好」)。
   */
  selectedCellId?: CellId | null
  /**
   * Slice D Step 5(D.3 portal Field,2026-05-10 user 拍板「在乎完美乾淨」+ codex Q6.1
   * 撤回 defer):active editor render callback。當 activeEditorEnabled + activeEditorCellId
   * truthy → layer call this 拿 React node(已 bind value/onCommit/onCancel from controller),
   * 在 ActiveEditorHost portal(z 3,float rect)render 之。
   *
   * Per codex Q6.2 outline:cell 永遠 mode="display"(SSOT preserved);portal host 渲
   * mode="edit" 同 registry component;float pass-through + z-index 3 cover display below。
   */
  activeEditorRender?: (cellId: CellId, rect: CellRect) => React.ReactNode
}

/**
 * `getCellRect(cellId)` geometry source(per Contract 8)。
 *
 * 從 DOM 量(per-call `getBoundingClientRect()`)而非 layoutCache,因為:
 *   1. cell DOM 是 React-rendered,getBoundingClientRect 永遠是 source of truth
 *   2. layoutCache 需另寫 invalidation logic,added complexity
 *   3. Hover overlay re-render 頻率低(per cell hover,不是 per frame)
 *
 * Float coords pass-through — no rounding / no snap(v3 fix,見下方 v3 註解;原 RFC 0.5px snap 已撤)。
 */
function getCellRect(containerEl: HTMLElement | null, cellId: CellId): CellRect | null {
  if (!containerEl) return null
  const cellEl = containerEl.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
  if (!cellEl) return null
  // Page-absolute coords for viewport-fixed layer(per Step 1C bug fix:layer
  // 用 position:fixed,讓 paint owner 跟 reference frame 解耦 outer container 的 positioning)。
  // 2026-05-10 v3 fix(user 圖5 SSOT consistency):**float coords no rounding**。
  //   Cell 自身 layout 用 sub-pixel float position(CSS 不 snap to integer)— 跨 cell 累積
  //   常見 144.328 / 244.0 / 524.172 等 fractional。任何 Math.round / floor / ceil 都引入
  //   varying rounding error(visual audit verified:dx=0.17/0.5/0.83 不一致)。
  //   Float pass-through + outline + outline-offset:-1px(下方 paint)→ overlay 永遠跟
  //   cell exact pixel-perfect overlap,user verbatim「在內容起始位置不變的前提下讓
  //   overlay 的邊框直接剛好壓住 cell 邊框」達成。
  const rect = cellEl.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * Issue 6 viewport clip(2026-05-10):cell 跟 panel(left/center/right)bounding rect 一起取,
 * layer 用 panel rect 當 clip viewport intersect cell rect → overlay 永不畫到 panel 外。
 *
 * Per codex 13-issues verdict:「getCellRect 找最近 scroll viewport;intersect(cellRect, viewportRect),
 * 空 → 不 render,部分 → clipped rect render。」
 *
 * 對齊 AG Grid `cellsForRangeSet` viewport-aware paint / Glide DataGrid clip helpers /
 * Notion sticky-cell virtualizer mask。
 */
interface CellGeometry {
  /** Cell exact viewport rect(no rounding,float pass-through per Bug 5 SSOT) */
  rect: CellRect
  /** Nearest panel container rect(left/center/right body)— clip viewport for overlays */
  clipRect: CellRect
  /** Panel identifier(`left` / `center` / `right`)— grouped range outer ring 分段用 */
  panel: 'left' | 'center' | 'right'
}

function getCellGeometry(containerEl: HTMLElement | null, cellId: CellId): CellGeometry | null {
  if (!containerEl) return null
  const cellEl = containerEl.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`)
  if (!cellEl) return null
  const panelEl = cellEl.closest<HTMLElement>('[data-datatable-panel]')
  if (!panelEl) return null
  const panel = panelEl.dataset.datatablePanel as 'left' | 'center' | 'right'
  const cellR = cellEl.getBoundingClientRect()
  const panelR = panelEl.getBoundingClientRect()
  return {
    rect: { x: cellR.x, y: cellR.y, width: cellR.width, height: cellR.height },
    clipRect: { x: panelR.x, y: panelR.y, width: panelR.width, height: panelR.height },
    panel,
  }
}


/**
 * Reactive rect sync hook — 確保 overlay rect 跨 RWD / scroll / resize 永遠對齊 cell(2026-05-10
 * user 拍板「所有 overlay 在各種 RWD 和捲動時都能處在正確位置上」)。
 *
 * 監聽 3 source(rAF coalesce 避 frame storm):
 *   1. window scroll(capture mode 抓 nested table body scroll + page scroll)
 *   2. window resize(viewport size change → cell width 變)
 *   3. ResizeObserver on container(column resize / table dimension 變)
 *
 * 每次事件 fire → setVersion(v+1) → 觸發 layer re-render → rect 用最新 getBoundingClientRect
 * 重算。getBoundingClientRect 本身永遠 return 當下 viewport-relative coords,沒 stale cache。
 *
 * Per codex(brief: codex-brief-rwd-future-2026-05-10):rAF coalesce 不需要 debounce,scroll
 * 跟到不延遲才對(Glide / AG Grid 同 idiom)。
 */
function useReactiveRect(containerRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [, setVersion] = React.useState(0)
  React.useEffect(() => {
    if (!enabled) return
    let rafId: number | null = null
    const force = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setVersion((v) => v + 1)
      })
    }
    window.addEventListener('scroll', force, { capture: true, passive: true })
    window.addEventListener('resize', force, { passive: true })
    const container = containerRef.current
    let ro: ResizeObserver | null = null
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(force)
      ro.observe(container)
    }
    return () => {
      window.removeEventListener('scroll', force, { capture: true } as EventListenerOptions)
      window.removeEventListener('resize', force)
      if (ro) ro.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [enabled, containerRef])
}

/**
 * Hover state hook — 監聽 container hover events,track hovered cell id。
 *
 * Implementation:event delegation on container(不 per-cell mount listeners),
 * 利用 `data-cell-id` attribute + closest()。
 */
function useHoveredCell(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): CellId | null {
  const [hoveredCellId, setHoveredCellId] = React.useState<CellId | null>(null)

  React.useEffect(() => {
    if (!enabled) { setHoveredCellId(null); return }
    const container = containerRef.current
    if (!container) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const cellEl = target?.closest<HTMLElement>('[data-cell-id]')
      const id = cellEl?.dataset.cellId ?? null
      setHoveredCellId(id)
    }
    const handleMouseLeave = () => setHoveredCellId(null)

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [enabled, containerRef])

  return hoveredCellId
}

/**
 * Singleton interaction layer(全 sub-layer 已接線;2026-07-14 docblock 對齊實作)。
 *
 * 現況:HoverCellRect(z 1)+ SelectionRing(z 2)+ ActiveEditorHost(z 3,portal edit Field);
 * range 視覺走 cell 自身 CSS `[data-range-cell]`(RangeRect / rangeCellIds prop 已 retire)。
 * layer root = position:fixed inset:0 viewport-anchor,pointerEvents:none(僅 ActiveEditorHost 開 auto)。
 */
export function DataTableInteractionLayer({
  enabled,
  containerRef,
  cellClickEntersEdit,
  activeEditorCellId,
  activeEditorEnabled = false,
  activeEditorRender,
  selectedCellId = null,
}: DataTableInteractionLayerProps) {
  const hoveredCellId = useHoveredCell(containerRef, enabled)
  // 2026-05-10 RWD/scroll sync(per user mandate「所有 overlay 在各種 RWD 和捲動時都處在正確位置」):
  // window scroll(capture)+ resize + ResizeObserver(container)→ rAF coalesced re-render → rect 重算
  useReactiveRect(containerRef, enabled)

  // Contract 14 state precedence:editing > selected > hover(per RFC §State Precedence Matrix)
  const isEditingHovered = activeEditorCellId != null && activeEditorCellId === hoveredCellId
  const isSelectedHovered = selectedCellId != null && selectedCellId === hoveredCellId
  const shouldShowHover = enabled && hoveredCellId != null && !isEditingHovered && !isSelectedHovered
    && (cellClickEntersEdit ? cellClickEntersEdit(hoveredCellId) : true)

  // Issue 6 viewport clip(2026-05-10):每個 overlay rect 都跟最近 panel(left/center/right body)
  // intersect。Cell scroll 出 panel viewport(H scroll / pinned 範圍)→ rect null → 不 render;
  // 部分 → 用 ClipMask wrap 在 panel viewport 內裁切,outline 永遠在 cell 真邊但被 mask 限制視覺。
  const hoverGeo = shouldShowHover
    ? getCellGeometry(containerRef.current, hoveredCellId!)
    : null

  // Slice D Step 3 scaffold:ActiveEditorHost rect placeholder(per Contract 8 active editor paint owner)。
  // 2026-05-10 bug fix:gate by `activeEditorEnabled` flag(Step 3.3 portal Field work)。
  // Issue 6:active editor host **不**做 viewport clip(per codex「editor 必可見」),
  // 仍走原 path 從 getCellRect 取 viewport coords。User 應將 active editor cell 滾到 viewport 內。
  const activeEditorRect = activeEditorEnabled && activeEditorCellId != null
    ? getCellRect(containerRef.current, activeEditorCellId)
    : null

  // Slice D Step 4(spreadsheet semantics):SelectionRing with viewport clip(RangeRect 已 retire — range 視覺走 CSS [data-range-cell])。
  const selectedGeo = enabled && selectedCellId != null
    ? getCellGeometry(containerRef.current, selectedCellId)
    : null

  // 2026-05-10 retire `rangeOuterRingsByPanel` calc + render(per user 抓 range 2px outer
  // ring 不需要 — cell-bg `--primary-subtle` 已給「這些 cell 在範圍內」訊號,outer ring 是
  // redundant visual)。`CellRangeOuterRing` primitive 已 retire(下方刪),getCellGeometry 仍
  // 給 hover / selected overlay 使用,保留。Future 若需 outer ring 復用,從 git history 取
  // commit `763b3ac`(Issue 6 viewport clip)的 implementation。

  if (!enabled) return null

  // Layer absolute fixed-position relative to viewport(避 outer container 缺 position:relative
  // 找錯 reference frame)。getCellRect 已 return container-relative,但這裡 set top/left 用
  // page coords 一致 — 改用 viewport-fixed 簡化。
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      {/* HoverRing — kind=hover(1px var(--border-hover)) z 1。Wrap 在 ClipMask(panel viewport)
          內 → cell scroll 出 panel 時 outline 自動被 mask 裁切,不會 leak 到 panel 外。 */}
      {hoverGeo && (
        <ClipMask clipRect={hoverGeo.clipRect}>
          <CellRingOverlay rect={toRelRect(hoverGeo.rect, hoverGeo.clipRect)} kind="hover" />
        </ClipMask>
      )}
      {/* SelectionRing — kind=selected(1px var(--primary)) z 2,SSOT 同 hover wide */}
      {selectedGeo && (
        <ClipMask clipRect={selectedGeo.clipRect}>
          <CellRingOverlay
            rect={toRelRect(selectedGeo.rect, selectedGeo.clipRect)}
            kind="selected"
            cellId={selectedCellId!}
          />
        </ClipMask>
      )}
      {/* 2026-05-10 retire RangeOuterRing(per user 抓 image 4 + verbatim「range 的 cell 本來就有顏色變化,
          那樣就夠了,不需要再有 2px 藍色的框」)。Range visual now relies purely on cell-bg
          (`--primary-subtle` via `[data-range-cell]` CSS in `data-table.css`)+ focus cell 1px selected
          border。Outer 2px primary ring 從 Issue 6 ship 但 visual 太重 — bg-fill 已給「這些 cell 在範圍內」
          訊號,outer ring 是 redundant。calc + render 皆已 retire(變數已移除;future 若需 reinstate
          參考 git history 2026-05-10)。 */}
      {/* {rangeOuterRingsByPanel.map((group) => (
        <ClipMask key={group.panel} clipRect={group.clipRect}>
          <CellRangeOuterRing rect={toRelRect(group.bbox, group.clipRect)} />
        </ClipMask>
      ))} */}
      {/* ActiveEditorHost — z 3,float rect,pointerEvents:auto opaque host(NOT a ring)。
          Issue 6:active editor 不 clip(editor 必可見) — user 滾出 viewport 自負責。 */}
      {activeEditorRect && (
        <ActiveEditorHost rect={activeEditorRect}>
          {activeEditorRender ? activeEditorRender(activeEditorCellId!, activeEditorRect) : null}
        </ActiveEditorHost>
      )}
    </div>
  )
}

/**
 * `toRelRect(cellRect, clipRect)` — Issue 6 helper(2026-05-10):
 * 把 viewport coords cell rect 轉成 ClipMask containing-block 內 relative coords。
 * ClipMask 用 panel rect 做 absolute container + overflow:hidden,內部 child absolute 定位
 * 以 mask 為 reference frame,所以 cellRect.x - clipRect.x 才對齊 cell 真實位置。
 */
function toRelRect(cellRect: CellRect, clipRect: CellRect): CellRect {
  return {
    x: cellRect.x - clipRect.x,
    y: cellRect.y - clipRect.y,
    width: cellRect.width,
    height: cellRect.height,
  }
}

// ── Private primitives(per codex unified-ring-overlay-2026-05-10 Final A')──────
//
// 三個 private primitive 各自 own 一個 paint concern(2026-07-14 對齊實作:CellRangeFill
// 不存在 — range bg 走 cell 自身 CSS `[data-range-cell]`,非 layer 元件):
//   1. CellRingOverlay  — outline ring(hover / selected / future focus / error)
//   2. ClipMask         — panel viewport 裁切 wrapper(Issue 6 partial-visibility)
//   3. ActiveEditorHost — opaque host(portal Field edit)
//
// SSOT pattern(共 3 primitives):rect float pass-through + boxSizing:border-box +
//   pointerEvents 視 kind / position:absolute on viewport-fixed layer。
//
// Token mapping 集中 `CELL_RING_STYLES`(per codex Q3 verdict 不開 global `--cell-ring-*` token,
// 在 primitive 內 kind → semantic token mapping)。

const CELL_RING_STYLES = {
  hover:    { width: 1, color: 'var(--border-hover)', zIndex: 1 },
  selected: { width: 1, color: 'var(--primary)',      zIndex: 2 },
  // future kinds(per codex Q6 outline,加 entry 即可擴展):
  // focus:  { width: 2, color: 'var(--primary)',      zIndex: 2 },
  // error:  { width: 1, color: 'var(--error)',        zIndex: 2 },
} as const

type CellRingKind = keyof typeof CELL_RING_STYLES

function rectStyle(rect: CellRect): React.CSSProperties {
  return {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * CellRingOverlay — paint owner for hover / selected / future focus / error rings。
 *
 * 共用 SSOT(per Bug 5 fix + codex Q2 unified primitive):
 *   - Float pass-through rect(getCellRect 不 round)
 *   - outline + outline-offset:`-${width}px` paint 在 cell 既有 border 上 in-place
 *   - boxSizing:border-box(避免 outline 影響 layout)
 *   - pointerEvents:none(透視點擊穿透)
 *   - transition:none(避 fade flash)
 */
function CellRingOverlay({ rect, kind, cellId }: {
  rect: CellRect
  kind: CellRingKind
  cellId?: CellId
}) {
  const ring = CELL_RING_STYLES[kind]
  const dataAttr = kind === 'selected' && cellId ? { 'data-selected-cell-id': cellId } : {}
  return (
    <div
      aria-hidden
      style={{
        ...rectStyle(rect),
        outline: `${ring.width}px solid ${ring.color}`,
        outlineOffset: `-${ring.width}px`,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        transition: 'none',
        zIndex: ring.zIndex,
      }}
      {...dataAttr}
    />
  )
}

// `CellRangeOuterRing` primitive retired 2026-05-10(per user 「range cell 本來就有顏色變化
// 那樣就夠了,不需要再有 2px 藍色的框」)。Source 留 git history commit `763b3ac`(Issue 6
// viewport clip ship)若需 reinstate。

/**
 * ClipMask — Issue 6 primitive(2026-05-10):panel viewport 裁切容器。
 *
 * 用在 hover / selected / range outer ring overlay,避免 cell 滾出 panel viewport(H scroll /
 * pinned 範圍)時 overlay 仍漂浮在 panel 外。Layer 是 `position: fixed` viewport-anchor,
 * ClipMask 用 panel rect 當 absolute container + `overflow: hidden` mask;child overlay 用
 * `toRelRect(cellRect, clipRect)` 算出 mask-relative 座標,在 mask 內精準定位但被 mask 邊緣裁切。
 *
 * 對齊 AG Grid `cellsForRangeSet` viewport-aware paint / Glide DataGrid clip helpers /
 * Notion sticky-cell virtualizer mask。
 */
function ClipMask({ clipRect, children }: { clipRect: CellRect; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: clipRect.x,
        top: clipRect.y,
        width: clipRect.width,
        height: clipRect.height,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

/**
 * ActiveEditorHost — opaque host for portal Field edit(D.3,Slice D Step 5)。
 *
 * Per codex Q2 verdict:不該進 CellRingOverlay primitive — 它是 host 不是 ring。
 *   - pointerEvents:auto(child Field 接收 click / keyboard)
 *   - background:var(--canvas)(opaque cover display Field below;Cell SSOT 保留)
 *   - z-index 3(above hover / selected / range)
 *   - children = activeEditorRender 的回傳 React node
 *
 * Empty children fallback = dashed debug indicator(no portal Field provided)。
 */
function ActiveEditorHost({ rect, children }: { rect: CellRect; children: React.ReactNode }) {
  if (!children) {
    return (
      <div
        aria-hidden
        style={{
          ...rectStyle(rect),
          pointerEvents: 'none',
          zIndex: 3,
          border: '1px dashed var(--primary)',
          boxSizing: 'border-box',
        }}
        data-active-editor-host-scaffold
      />
    )
  }
  return (
    <div
      style={{
        ...rectStyle(rect),
        pointerEvents: 'auto',
        zIndex: 3,
        boxSizing: 'border-box',
        background: 'var(--canvas)',
      }}
      data-active-editor-host
    >
      {children}
    </div>
  )
}
