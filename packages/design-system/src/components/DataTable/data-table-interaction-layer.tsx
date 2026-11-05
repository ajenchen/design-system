// @internal — DS-internal 單元(格上的覆蓋 paint layer,只被 data-table.tsx 內部消費);不隨 index.ts re-export 進 npm public surface。
/**
 * DataTableInteractionLayer — Slice D Step 1A scaffold(per `.claude/planning/datatable-spreadsheet-rfc.md`)
 *
 * Singleton overlay root inside DataTable(M21 private,不抽 global pattern)。
 * Sub-layer children(2026-07-04 對齊實作;原 RFC 5-layer 清單含未實作元件):
 *   - HoverCellRect(z 1):hover 邊框,「one geometry owner, two paint owners」(Contract 8)
 *   - SelectionRing(z 2):spreadsheet mode 格游標 = DS 焦點框 `focus-ring-inset`(CELL_RING_STYLES.selected;
 *     2026-09-26 起取代原 1px `--primary`,且為試算表模式唯一的焦點指示 —— 有格游標時表格根節點不畫)
 *   - ActiveEditorHost(z 3):portal active edit Field(Slice C wire-up)
 *   -(range 視覺 = CSS [data-range-cell] cell-bg,非 layer 元件;nested popup 走 Radix idiom
 *     見 active-editor-controller.ts — RangeRect / NestedPortalRegistry 元件不存在)
 *
 * Slice D Step 1A scope:
 *   - 幾何來源(per Contract 8):2026-11-05 起就是目標格自己的盒子(覆蓋層 portal 進格內,見 `findCell` 段)
 *   - HoverCellRect 1 layer 先做(Contract 8 / Contract 15 cellClickEntersEdit predicate)
 *   - 默認 disabled via `experimentalSpreadsheetOverlay` flag,不破現有 outline
 *   - 後續 Step 1B/C/D 漸進切換 + 拆 outline
 */

import * as React from 'react'
import { createPortal } from 'react-dom'

type CellId = string

interface DataTableInteractionLayerProps {
  /** Flag default false:不破現有 outline。enable 後 hover/editor 走 overlay。 */
  enabled: boolean
  /** Container ref:由此 query 格的 DOM(`[data-cell-id]`),覆蓋層 portal 進那一格(見 render)。 */
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
   * Layer renders solid border SelectionRect(per user:不要 dash 直接實的就好(轉述))。
   */
  selectedCellId?: CellId | null
  /**
   * Slice D Step 5(D.3 portal Field,2026-05-10 user 拍板:在乎完美乾淨(轉述)+ codex Q6.1
   * 撤回 defer):active editor render callback。當 activeEditorEnabled + activeEditorCellId
   * truthy → layer call this 拿 React node(已 bind value/onCommit/onCancel from controller),
   * 在 ActiveEditorHost(z 3,鋪滿那一格)render 之。
   *
   * Per codex Q6.2 outline:cell 永遠 mode="view"(SSOT preserved);portal host 渲
   * mode="edit" 同 registry component;float pass-through + z-index 3 cover view below。
   */
  activeEditorRender?: (cellId: CellId) => React.ReactNode
}

/**
 * **覆蓋層畫在格子裡面,不畫在表格外面的固定層上**(2026-11-05,待辦總帳 Q2c 併入 Q2b)。
 *
 * 修前:覆蓋層是 `position: fixed; inset: 0` 的一整層,每個 overlay 用 `getBoundingClientRect()` 量格子在視窗裡的位置,
 * 捲動時靠 `window` 的 scroll(capture)→ rAF → setState → 重繪去追 —— 捲動是合成器先畫、這條路晚一到兩格才到,
 * 試算表的格游標框與編輯框在捲動中**落後格子一到兩格**(待辦總帳 Q2c,`data-table-interaction-layer.tsx:172-179` 那一段)。
 * 部分露出的格要另外用面板的可視框裁切(ClipMask,Issue 6)。
 *
 * 現在:三種覆蓋層都 portal 進**那一格自己的 DOM**(格是 `position: relative; overflow: hidden`,見 data-table.tsx 的格 class),
 * `inset: 0` 鋪滿 —— 格子怎麼動、它就怎麼動(同一個盒子),捲動、欄寬、列高、縮放全都不需要任何量測或追趕;
 * 部分露出時由黏住的表頭 / 釘選面板自然蓋住(z 層見 data-table.css「表頭列群組」),不再需要 ClipMask。
 * 世界級同向:AG Grid 的格焦點框就是格自己的樣式(`.ag-cell-focus`,不是另一層);MUI X `& .cell:focus`。
 *
 * 目標格的 DOM 在 **commit 之後**才解析(layout effect):虛擬捲動換列時舊格會被卸載、新格在這一次 commit 才出現,
 * 在 render 裡 query 會拿到舊的(或還不存在的)節點。這裡只做 `querySelector`,不讀任何版面值。
 */
function findCell(containerEl: HTMLElement | null, cellId: CellId | null): HTMLElement | null {
  if (!containerEl || cellId == null) return null
  return containerEl.querySelector<HTMLElement>(`[data-cell-id="${CSS.escape(cellId)}"]`)
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
 * 2026-11-05 起三者都 portal 進目標格(見上方 `findCell` 段),不再有表格外的固定層。
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

  // Contract 14 state precedence:editing > selected > hover(per RFC §State Precedence Matrix)
  const isEditingHovered = activeEditorCellId != null && activeEditorCellId === hoveredCellId
  const isSelectedHovered = selectedCellId != null && selectedCellId === hoveredCellId
  const shouldShowHover = enabled && hoveredCellId != null && !isEditingHovered && !isSelectedHovered
    && (cellClickEntersEdit ? cellClickEntersEdit(hoveredCellId) : true)

  const hoverId = shouldShowHover ? hoveredCellId : null
  const selectedId = enabled ? selectedCellId : null
  // Slice D Step 3 scaffold:ActiveEditorHost(per Contract 8 active editor paint owner)。gate by `activeEditorEnabled`(Step 3.3 portal Field work)。
  const editorId = activeEditorEnabled && activeEditorCellId != null ? activeEditorCellId : null

  // 目標格的 DOM 節點:每次 commit 之後重新解析(只 querySelector,不讀版面);節點換了才 setState(layout effect 內 → 同一幀重畫,不會閃)。
  const [targets, setTargets] = React.useState<{ hover: HTMLElement | null; selected: HTMLElement | null; editor: HTMLElement | null }>(
    { hover: null, selected: null, editor: null },
  )
  // 掛載那一次 commit 裡,父層(根節點)的 ref 在子元件的 layout effect **之後**才接上 → 讀到 null。
  // 那種時候(而且確實有目標要畫)等一格再解析一次;之後的 commit 根節點 ref 早已穩定(data-table.tsx `setTableRef`)。
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useLayoutEffect(() => {
    const root = containerRef.current
    if (!root && (hoverId ?? selectedId ?? editorId) != null) {
      const raf = requestAnimationFrame(bump)
      return () => cancelAnimationFrame(raf)
    }
    const next = { hover: findCell(root, hoverId), selected: findCell(root, selectedId), editor: findCell(root, editorId) }
    setTargets((prev) => (prev.hover === next.hover && prev.selected === next.selected && prev.editor === next.editor ? prev : next))
    return undefined
  })

  if (!enabled) return null

  return (
    <>
      {/* HoverRing — kind=hover(1px var(--border-hover))z 1。 */}
      {hoverId && targets.hover?.isConnected && createPortal(<CellRingOverlay kind="hover" />, targets.hover)}
      {/* SelectionRing — kind=selected(DS 焦點框 `focus-ring-inset`)z 2。
          格裡的控件被鍵盤聚焦、自己畫框時這一圈收起(data-table.css 的 `:has([role='gridcell'] :focus-visible)`,一次只一個指示器) */}
      {selectedId && targets.selected?.isConnected && createPortal(<CellRingOverlay kind="selected" cellId={selectedId} />, targets.selected)}
      {/* 2026-05-10 retire RangeOuterRing(per user 抓 image 4 + verbatim「range 的 cell 本來就有顏色變化,
          那樣就夠了,不需要再有 2px 藍色的框」)。Range visual relies purely on cell-bg(`[data-range-cell]` CSS)+ 起點格的焦點框。 */}
      {/* ActiveEditorHost — z 3,鋪滿編輯中的那一格,pointerEvents:auto opaque host(NOT a ring)。 */}
      {editorId && targets.editor?.isConnected && createPortal(
        <ActiveEditorHost>{activeEditorRender ? activeEditorRender(editorId) : null}</ActiveEditorHost>,
        targets.editor,
      )}
    </>
  )
}

// ── Private primitives(per codex unified-ring-overlay-2026-05-10 Final A')──────
//
// 兩個 private primitive 各自 own 一個 paint concern(2026-07-14 對齊實作:CellRangeFill
// 不存在 — range bg 走 cell 自身 CSS `[data-range-cell]`,非 layer 元件;2026-11-05 ClipMask 隨「畫進格子裡」退役):
//   1. CellRingOverlay  — outline ring(hover / selected / future focus / error)
//   2. ActiveEditorHost — opaque host(portal Field edit)
//
// SSOT pattern:鋪滿目標格(`position:absolute; inset:0`,格是定位盒且 `overflow:hidden`)+ boxSizing:border-box +
//   pointerEvents 視 kind。幾何**就是格子本身**,沒有任何量測(修前的 float pass-through rect 與「不准取整」那條 v3 規則,
//   目的都是讓框壓在格子真正的邊上;現在框就是格子的子元素,這件事結構上成立)。
//
// Token mapping 集中 `CELL_RING_STYLES`(per codex Q3 verdict 不開 global `--cell-ring-*` token,
// 在 primitive 內 kind → semantic token mapping)。
//
// 兩種 kind 的畫法不同源,刻意分開:
//   - hover:1px `--border-hover` 提示「點了會進編輯」,不是焦點指示,由本檔寫值。
//   - selected:**格游標就是焦點指示**,一律消費 DS 焦點框 `focus-ring-inset`(2px `--ring`、往內 2px),
//     值只住 `styles/base.css` 的 `@utility focus-ring-inset`,這裡只掛 class 不寫值
//     (`ds-canonical/references/focus-canonical.md`「框怎麼畫」只准三種幾何;R21 第 5 題 (b) 的 AI 建議「格子框用 DS 焦點框」,09-26 user 未另提 → AI 判讀照建議做)。
//     原本是 1px `--primary` inline outline —— 第四種幾何,而且與表格根節點的 2px 框同時出現(兩個焦點指示)。

type CellRingKind = 'hover' | 'selected'
/** 自己寫值的線(width + color),或消費 DS utility 的 class —— 二選一,不准兩者並存(並存就是兩份幾何) */
type CellRingStyle = { zIndex: number } & (
  | { width: number; color: string; className?: never }
  | { className: string; width?: never; color?: never }
)

const CELL_RING_STYLES: Record<CellRingKind, CellRingStyle> = {
  hover:    { width: 1, color: 'var(--border-hover)', zIndex: 1 },
  selected: { className: 'focus-ring-inset',          zIndex: 2 },
  // future kinds(per codex Q6 outline,加 entry 即可擴展):
  // error:  { width: 1, color: 'var(--error)',        zIndex: 2 },
}

/** 鋪滿目標格(格是 `position: relative`)。 */
const FILL_CELL: React.CSSProperties = { position: 'absolute', inset: 0 }

/**
 * CellRingOverlay — paint owner for hover / selected(格游標)/ future error rings。
 *
 *   - 自己寫值的線(hover):outline + outline-offset:`-${width}px` paint 在 cell 既有 border 上 in-place
 *   - 消費 utility 的框(selected):只掛 class(`focus-ring-inset` = 2px `--ring` 往內),不寫任何 outline 值
 *   - boxSizing:border-box(避免 outline 影響 layout)
 *   - pointerEvents:none(透視點擊穿透)
 *   - transition:none(避 fade flash)
 */
function CellRingOverlay({ kind, cellId }: {
  kind: CellRingKind
  cellId?: CellId
}) {
  const ring = CELL_RING_STYLES[kind]
  const dataAttr = kind === 'selected' && cellId ? { 'data-selected-cell-id': cellId } : {}
  return (
    <div
      aria-hidden
      className={ring.className}
      style={{
        ...FILL_CELL,
        ...(ring.width != null ? { outline: `${ring.width}px solid ${ring.color}`, outlineOffset: `-${ring.width}px` } : {}),
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
 * ActiveEditorHost — opaque host for portal Field edit(D.3,Slice D Step 5)。
 *
 * Per codex Q2 verdict:不該進 CellRingOverlay primitive — 它是 host 不是 ring。
 *   - pointerEvents:auto(child Field 接收 click / keyboard)
 *   - background:var(--canvas)(opaque cover view Field below;Cell SSOT 保留)
 *   - z-index 3(above hover / selected / range)
 *   - children = activeEditorRender 的回傳 React node
 *
 * Empty children fallback = dashed debug indicator(no portal Field provided)。
 */
function ActiveEditorHost({ children }: { children: React.ReactNode }) {
  if (!children) {
    return (
      <div
        aria-hidden
        style={{
          ...FILL_CELL,
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
        ...FILL_CELL,
        pointerEvents: 'auto',
        zIndex: 3,
        boxSizing: 'border-box',
        background: 'var(--canvas)',
        // 編輯框住在唯一的捲動盒裡(2026-11-05 起 portal 進格);macOS 鍵位的 Home / End / PageUp / PageDown 在輸入框裡不移游標,
        // 預設動作是「捲最近的捲動盒」→ 整張表捲走、編輯列被卸載、草稿丟失(2026-11-05 審查 D2)。在這一層把鍵盤捲動的
        // 串連停住:`overflow: hidden`(格子本來就 overflow:hidden、本層鋪滿格子 → 不多裁任何東西)+ `overscroll-behavior: contain`。
        // 輸入框自己的游標移動不受影響(Windows / Linux 的 Home / End 照常移游標)—— 只擋「冒到捲動盒的那一下」。
        // 修前編輯框在表格外的固定層,這些鍵本來就捲不到表格;滑鼠滾輪在編輯框上同理不捲表格(修前同)。
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }}
      data-active-editor-host
    >
      {children}
    </div>
  )
}
