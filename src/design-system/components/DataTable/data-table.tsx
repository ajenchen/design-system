// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite — 拆檔會複雜化 context / ref / state 同步
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Empty } from '@/design-system/components/Empty/empty'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type TableOptions,
  type Column,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown, Calendar, Clock, ArrowUp, ArrowDown, ArrowUpDown, Filter as FilterIcon, EyeOff, X as XIcon, GripVertical } from 'lucide-react'
// **v15.0 Path B**(對齊 user 「source 留原位 / indicator 為 drop preview / 不 auto-shift」directive):
// 砍 useSortable + SortableContext 用 useDraggable + useDroppable 分離 hooks(對齊 DS 內 TreeView SSOT)。
import { DndContext, DragOverlay, useDraggable, useDroppable, useDndContext, pointerWithin, rectIntersection, useSensor, useSensors, PointerSensor, KeyboardSensor, MeasuringStrategy, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { dragSourceStyle, dropIndicatorRow, dropIndicatorColumn, dragActiveCursor, isReorderNoop, reconstructFullRowGhost, snapToCursorModifier } from '@/design-system/lib/drag-visual'
import { nakedCellEditableDisplayHover } from '@/design-system/components/Field/field-wrapper'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ItemInlineActionButton, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { columnTypeDefaults, type ColumnType } from './column-types'
import { resolveCellComponent } from './cell-registry'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { Button } from '@/design-system/components/Button/button'

// ── Variants ─────────────────────────────────────────────────────────────────

// outer border = `border-divider`(同 row divider 色)— T-junction connectivity 設計原則:
// row divider 兩端 meet table outer border;若不同色 → 交匯處視覺斷層;
// divider 不能加重(過搶眼)→ 淡化 outer border 至 divider 同色,seamless。
// 對齊 Ant Design colorBorderSecondary idiom(table outer + divider 同色)。
// 詳 tokens/color/color.spec.md「T-junction connectivity」段。
const dataTableVariants = cva('bg-surface rounded-md overflow-hidden', {
  variants: { bordered: { true: 'border border-divider', false: '' } },
  defaultVariants: { bordered: true },
})

// ── Types ────────────────────────────────────────────────────────────────────

type TableSize = 'sm' | 'md' | 'lg'

export interface DataTableProps<TData>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof dataTableVariants> {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  size?: TableSize
  autoRowHeight?: boolean
  height?: string
  overscan?: number
  emptyState?: React.ReactNode
  enableHover?: boolean
  estimateRowHeight?: number
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
  rowActions?: (row: TData) => React.ReactNode
  pinnedLeftColumns?: string[]
  pinnedRightColumns?: string[]
  /** Inline edit 視覺模式：body cell 間加垂直分隔線，select 類欄位顯示指示器 */
  inlineEdit?: boolean

  // ── L2 Selection(see data-table.spec.md「L2 選取」)──
  /** 已選 row IDs(controlled) */
  selection?: string[]
  /** 預設選取(uncontrolled) */
  defaultSelection?: string[]
  /** Selection 變更 callback */
  onSelectionChange?: (next: string[]) => void
  /** 是否啟用 selection / 模式;true 等同 'multi' */
  selectable?: boolean | 'single' | 'multi'
  /** Row 是否可選(disabled rows 只 disable checkbox,row 內容正常 render) */
  isRowSelectable?: (row: TData) => boolean
  /** 取 row 唯一 ID(selection 用);default `(row, index) => String(index)` */
  getRowId?: (row: TData, index: number) => string
  /** Checkbox aria-label fallback;default `'Select row'` */
  getRowAriaLabel?: (row: TData) => string
  /** Filter 後 hidden selected rows 是否保留(default false,對齊 Material/AG Grid 共識) */
  preserveSelectionOnFilter?: boolean

  // ── L3 Column visibility(顯示隱藏)──
  /** 欄位顯隱(controlled),Record<columnId, boolean>;true / undefined = 顯示 */
  columnVisibility?: Record<string, boolean>
  /** 預設顯隱(uncontrolled) */
  defaultColumnVisibility?: Record<string, boolean>
  /** 顯隱變更 callback */
  onColumnVisibilityChange?: (next: Record<string, boolean>) => void

  // ── L3 Sort(排序)──
  /** 啟用多欄排序(shift+click 加 secondary;單擊仍 replace);default true,對齊 AG Grid / Material */
  enableMultiSort?: boolean

  // ── L3 Filter trigger(callback only — UI in consumer)──
  /** Cell ⌄ menu「Filter by this」點擊,emit columnId 讓 consumer 開 global filter panel + prefill。
   *  對齊 ClickUp / Airtable / Notion 派 — filter 永遠 global,不 per-cell inline。 */
  onColumnFilterTrigger?: (columnId: string) => void

  // ── L4 Inline edit ──
  /**
   * Cell value commit callback。User 編完(blur/Enter/select-option)→ 觸發本 callback。
   * Consumer 自管 data update + persistence。
   * 啟用條件:該 column `meta.editable` 為 true 或 fn 回傳 true。詳 `column-types.ts`。
   */
  onCellCommit?: (rowId: string, columnId: string, value: unknown) => void

  // ── L4 Row drag(Jira-style reorder)──
  /**
   * 啟用 row drag reorder。為 true 時,row 最左出 GripVertical handle(hover-revealed),
   * 拖曳改 default order via `onRowReorder` callback。
   *
   * Sort × Drag 互斥:`sorting.length > 0` 時 drag handle 視覺 disabled + Tooltip
   * 「排序中無法拖曳,清除排序後可重排」。對齊 Notion / Airtable 共識。
   *
   * **必填 `getRowId`**:enableRowDrag 為 true 時 consumer 必傳 `getRowId`,用穩定 row identity 作 dnd source / target id。否則 dnd 用 row.index 會在 reorder 後錯位(runtime 不會 throw,但 reorder 行為不正確)。
   *
   * **v2(2026-05-05)修正**:
   * - Virtualizer × transform:被拖 row 略過 `measureElement`(透過 SortableRowCtx 廣播 active id),避免 transform 干擾測量
   * - 3-panel mirror sync:每 region 都呼叫 `useSortable({id})`(同 SortableContext 共用 state),mirror 自然取得相同 transform
   * - Cross-parent drop:nested 全 row 進 SortableContext.items,自訂 collisionDetection 過濾出「同 parent siblings」;cross-parent over → 不觸發,handle cursor `not-allowed`
   *
   * 詳 `data-table.spec.md`「L4 Row drag」段。
   */
  enableRowDrag?: boolean
  /**
   * Row reorder callback。User 拖曳完成觸發。
   * @param sourceId 拖曳的 row id
   * @param targetId 放下的目標 row id
   * @param position 'before' | 'after' — 放在 target 前 OR 後
   */
  onRowReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  /**
   * 啟用全表 column resize(2026-05-06 v11):
   * - `true`: 所有 data columns 全 fixed width,header 右邊出現 resize handle(hover 顯色 +
   *   cursor:col-resize),user 拖拉調整 column width。System columns(checkbox / drag handle /
   *   row actions)永遠 fixed,不在 resize 集合。
   * - `false`(default): 所有 data columns 全 flex-grow:1 均分剩餘寬度。
   *
   * **二選一 canonical**(對齊 Notion / Airtable / Linear product UI 共識)— 不支援 per-column
   * mixed,簡單明確。Min width 預設 80px,consumer 透過 `columnDef.minSize` override。
   */
  enableColumnResize?: boolean
  /**
   * Column resize callback。User 拖完一輪觸發(commit-on-pointerup,非 live)。Consumer 收到
   * 自管 width persistence(localStorage / URL / API)— DS 不持久化(對齊「DS 不包全域 provider」原則)。
   * @param columnId 被 resize 的 column id
   * @param width 最終 width(px)
   */
  onColumnResize?: (columnId: string, width: number) => void
  /**
   * 啟用全表 column reorder(2026-05-06 v11):
   * - `true`: 所有 data column header 可拖曳重排,DragOverlay portal 顯示 ghost
   * - `false`(default): 不啟用
   *
   * 使用 `columnDef.meta.locked = true` 標示鎖定欄(無 grab cursor、不啟動 drag、被拖過不顯
   * drop indicator)。對齊 Notion / Linear locked column canonical。
   */
  enableColumnReorder?: boolean
  /**
   * Column reorder callback。
   * @param sourceId source column id
   * @param targetId target column id
   * @param position 'before' | 'after'
   */
  onColumnReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}

// ── Cell Rendering(Phase C 2026-05-05 — type-keyed registry SSOT)─────────────
//
// 原 `renderTypedValue` switch + `EditableCellContent` switch 兩條平行 type-switch
// 已 collapse 為單一 `cellRegistry`(./cell-registry.ts)— 每個 type → 一個 cell component,
// 同時處理 display + edit mode(底層 Field control 的 mode prop)。對齊 M17 SSOT consolidation。
//
// 對齊 Notion / Airtable type-aware inline edit canonical(詳 spec §十二):
//   - string / number / currency:cell click → inline edit
//   - date / time / select / multiSelect / person / multiPerson:cell click → 進 edit mode
//   - boolean:不分 read/edit mode,直接 `<Checkbox>` 點即 toggle + commit
//   - url:read = LinkInput display + hover Pencil button,click Pencil 才進 edit mode
//
// Cell id format: `${rowId}__${columnId}`(編輯狀態 keying)
// Commit: blur OR Enter OR overlay close → 呼叫 onCellCommit
// Cancel: Esc → 退出 edit mode 不 commit
//
// World-class source(@benchmark-unverified):AG Grid cellRendererSelector / Material X-Grid
// `valueGetter + renderCell` / Notion property type registry。

const cellEditId = (rowId: string, colId: string) => `${rowId}__${colId}`

// ── Constants ────────────────────────────────────────────────────────────────

// Phase C(2026-05-05):cell 水平 padding 從 magic `0.75rem` 提升為 `--table-cell-px` token
//   (詳 ./data-table.css)— consumer 可走 CSS override 改值,不再 hard-code in TS。
// L2 selection 內部 column id(避免 magic string 重複)
const SELECT_COL_ID = '__select__'
const cellPadding: React.CSSProperties = { paddingBlock: 'var(--table-cell-py)', paddingInline: 'var(--table-cell-px)' }
const HEADER_BG = 'bg-muted'

// Column sizing canonical(2026-05-06 v11 — table-level all-or-nothing,Notion / Airtable / Linear 共識):
//   - **Table-level prop `enableColumnResize`** 控制全表 mode(per-column mixed 已 retire,跟 product
//     UI 世界級對齊 — Notion / Airtable / Linear 都是全表二選一,簡單明確)
//   - `enableColumnResize=true`  → 所有 data columns 全 fixed width(尊重 user 拖拉)
//   - `enableColumnResize=false` → 所有 data columns 全 flex-grow:1 均分剩餘寬度(預設,minWidth 保護)
//   - **System columns**(`__select__` / drag handle / row actions)永遠 fixed,跟 enableColumnResize 無關
//   - maxSize 一律 forward 為 maxWidth(防 flex 無限擴張)
//
// 預設 min width = `MIN_COLUMN_WIDTH`(80px;對齊 Polaris IndexTable / AG Grid 範圍下限),consumer
// 可透過 `columnDef.minSize` override。
export const MIN_COLUMN_WIDTH = 80

function columnSizeStyle(
  col: { id: string; getSize: () => number; columnDef: { minSize?: number; maxSize?: number } },
  opts: { resize: boolean; isSystemCol: boolean },
): React.CSSProperties {
  const baseSize = col.getSize()
  // **Regression fix(2026-05-06 v14.1)**:default fallback 從 `MIN_COLUMN_WIDTH (80)` 改回
  // `baseSize`(等於 v9 行為)。前 v11 column resize commit 改 fallback 為 80 後,enableColumnResize=false
  // 的 default flex case 全 column 可 shrink 到 80 → flex 均分忽視 `size` prop → Note 360 被擠到 204
  // → text wrap 行數爆增 → autoRow cell 變高 → edit textarea rows=3 估算更不準 → shrink 看起來壞掉。
  // v9 直覺:沒明示 minSize 預設不 shrink 低於 size。enableColumnResize=true 仍 honour `MIN_COLUMN_WIDTH`
  // (因 user 主動拖拉時要能縮)。
  const minSize = col.columnDef.minSize ?? (opts.resize ? MIN_COLUMN_WIDTH : baseSize)
  const maxSize = col.columnDef.maxSize
  // System columns 永遠 fixed(checkbox / drag handle 等內建欄位,不在 resize 集合)
  if (opts.isSystemCol) {
    return { width: baseSize, minWidth: baseSize, maxWidth: maxSize }
  }
  // Data columns:enableColumnResize=true → fixed 尊重 user 拖拉
  if (opts.resize) {
    return { width: baseSize, minWidth: minSize, maxWidth: maxSize }
  }
  // Data columns:enableColumnResize=false → flex grow but NOT shrink below `size` prop。
  // 對齊 v9 行為:column 沒明示 minSize 時固定 ≥ baseSize(尊重 user `size` 設定),table 寬不夠
  // 觸發 H scroll(預期)。前 v11 換 MIN_COLUMN_WIDTH=80 fallback 讓 columns 全擠等寬,違 user
  // 預期。
  // **Tanstack default 干擾**:tanstack v8 `defaultColumn.minSize=20` 會 merge 進 column.columnDef
  // → `col.columnDef.minSize` 永遠不 undefined → `?? baseSize` 不 fall back。
  // 解法:直接用 baseSize(若 user 要明示 shrink-below-size,改 `enableColumnResize=true` 或別自設
  // `minSize` < size)。
  //
  // **flex-basis: baseSize(2026-05-06 v14.2)**:把 baseSize 當 explicit basis(不是 `0%`)。
  // 為什麼:flex item base = basis + padding(box-sizing: border-box content-box 行為)。前 `0%`
  // basis → cell padding 變 base 一部分。display(padding 12)vs edit(padding 0,Field 接管)
  // 兩態 base 不同 → flex 重分配 → user 報「Price cell 進 edit 寬度縮 12px」(verify by
  // debug-v14-1-display-edit-rect-match.mjs:Price display 130.5 → edit 118.5 = -12px)。
  // explicit basis = baseSize 讓 padding 不參與 base 計算 → display↔edit 寬度穩定。
  return { flex: `1 1 ${baseSize}px`, minWidth: baseSize, maxWidth: maxSize }
}

const SYSTEM_COL_IDS = new Set([SELECT_COL_ID, '__drag__', '__actions__'])
const isSystemColumn = (colId: string) => SYSTEM_COL_IDS.has(colId)

// ── TruncateCell ─────────────────────────────────────────────────────────────
// Shared ResizeObserver(2026-04-22 D3 perf audit):從 per-cell RO 改為全 DS 共用一個 RO
// dispatch 到 per-element callback。10 col × 100 row = 1 RO(before:1000 RO)。
// 跨 OS 一致的 RO 行為;element 卸載時 cleanup。

type RoCallback = (entry: ResizeObserverEntry) => void
let sharedResizeObserver: ResizeObserver | null = null
const roCallbacks = new WeakMap<Element, RoCallback>()

function getSharedRO(): ResizeObserver {
  if (sharedResizeObserver) return sharedResizeObserver
  sharedResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const cb = roCallbacks.get(entry.target)
      if (cb) cb(entry)
    })
  })
  return sharedResizeObserver
}

function observeShared(el: Element, cb: RoCallback): () => void {
  const obs = getSharedRO()
  roCallbacks.set(el, cb)
  obs.observe(el)
  return () => {
    roCallbacks.delete(el)
    obs.unobserve(el)
  }
}

function TruncateCell({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth)
    check()
    return observeShared(el, check)
  }, [])
  const span = <span ref={ref} className={cn('truncate min-w-0', className)}>{children}</span>
  if (!isTruncated) return span
  return <Tooltip><TooltipTrigger asChild>{span}</TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>
}

// ── L4 Row Drag: SortableRowContext (v2) ─────────────────────────────────────
// v2:每 region(left / center / right)各 mount 一次 SortableRowProvider — 多個 useSortable
// 共用同一 SortableContext / 同 row id 時,dnd-kit 內部以 id 為 unit 分發 transform / isDragging,
// 各 hook instance 取得相同值,因此 mirror region 自然跟動(v1 mirror static bug 修正)。
// listeners 仍只走 primary region(避免 pointer 事件雙重觸發);primary = left region 若存在否則 center。
// `invalidDrop`(cross-parent over)走 prop 廣播給 DragHandleCell 切 cursor-not-allowed。
interface SortableRowCtxValue {
  setNodeRef: (el: HTMLElement | null) => void
  role: 'primary' | 'mirror'
  style: React.CSSProperties
  attributes: Record<string, unknown>
  isDragging: boolean
  /** **v15.6 button-only drag**(對齊 Notion / Linear / Jira canonical):
   *  整列拖 + ghost 跟 cursor 在 multi-instance same-id pinned column 場景互相矛盾——
   *  唯一 single-source-of-activation = visible RowDragHandle Button。
   *  Source DOM = primary row(`setNodeRef`),activator = button(`handleSetActivatorNodeRef`),
   *  listeners = button(`handleListeners`)。User 從哪個 region 都看見 portal'd button → 點下啟動。
   *  Row click 不觸發 drag(允許 row click → select / open detail 等別的 UX)。
   *  保留 `rowListeners`/`rowAttributes` field 但 button-only mode 為 undefined。 */
  rowListeners: Record<string, unknown> | undefined
  rowAttributes: Record<string, unknown>
  /** RowDragHandle Button 用:接 setActivatorNodeRef → button rect 當 activator;
   *  primary 才提供(mirror 不需要,RowDragHandle 只在 primary region 渲染) */
  handleSetActivatorNodeRef: ((el: HTMLElement | null) => void) | undefined
  handleListeners: Record<string, unknown> | undefined
  handleAttributes: Record<string, unknown>
  /** drag 進行中且當前 over target 與 active 不同 parent → invalid signal */
  invalidDrop: boolean
}
const SortableRowCtx = React.createContext<SortableRowCtxValue | null>(null)

/** Per-region per-row sortable wrapper(v2 multi-instance pattern)。
 *  同 row.id 在 left/center/right 三 region 各 mount 一次 — useSortable 共享同 SortableContext
 *  state,各 instance 取得相同 transform → mirror 自動跟動。
 *  primary instance 額外提供 listeners 給 DragHandleCell;mirror 不提供避免雙觸發。 */
function SortableRowProvider(props: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  // **v15.4 final architectural split**:multi-instance same-id 是 dnd-kit anti-pattern。
  // 必須完全分離 component 讓 hook mount tree 不衝突:
  //   - primary 走 SourceRowProvider(useDraggable + useDroppable)— 唯一 source
  //   - mirror 走 MirrorRowProvider(useDroppable only)— 接受 drop target 但不參與 drag source
  // 之前 v15.2/15.3 同 component 内 conditional setNodeRef/disabled 仍讓 mirror instance 進入
  // dnd-kit context store,導致 last-mount-wins 把 activator 取成 mirror region row → ghost
  // 起點偏離 cursor。Split 後 dnd-kit 只看到 primary instance,問題消滅。
  return props.role === 'primary' ? <SourceRowProvider {...props} /> : <MirrorRowProvider {...props} />
}

function SourceRowProvider({
  id,
  disabled,
  role,
  invalidDrop,
  children,
}: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  const draggable = useDraggable({ id, disabled, data: { type: 'row' } })
  const droppable = useDroppable({ id, disabled, data: { type: 'row' } })
  // **v15.6 button-only drag**:setActivatorNodeRef 不接 row,改由 RowDragHandle Button 接(via ctx)。
  // setNodeRef = primary row(source DOM,ghost 抓這個);droppable.setNodeRef = same row(droppable target)。
  const setRefs = React.useCallback((el: HTMLElement | null) => {
    draggable.setNodeRef(el)
    droppable.setNodeRef(el)
  }, [draggable.setNodeRef, droppable.setNodeRef])
  const isDragging = draggable.isDragging
  const style: React.CSSProperties = { ...dragSourceStyle(isDragging) }
  // a11y(2026-05-07 v15.10 codex P1 fix):button-only drag mode 下,row 本身不該成為
  // keyboard tab stop。dnd-kit `useDraggable.attributes` 含 `role="button" tabIndex=0
  // aria-roledescription="..."` 全給 activator 用,套到 row div 會讓每筆 row tabbable
  // (large table 累積上百 inert focus stops,grid navigation 體驗壞)。
  // **拆分**:rowAttributes 留空(row 是 passive container)/ handleAttributes 全給
  // RowDragHandle Button(它是真 activator,Button 自帶 role/tabIndex 完全相容)。
  const handleAttrs = draggable.attributes as unknown as Record<string, unknown>
  const ctxValue: SortableRowCtxValue = {
    setNodeRef: setRefs,
    role,
    style,
    attributes: {},
    isDragging,
    // row 不接 listeners(button-only),baseRowDiv `{...(extra?.listeners ?? {})}` 自動 noop
    rowListeners: undefined,
    rowAttributes: {},
    // Button activator + listener:portal'd RowDragHandle Button 走這條 ctx,
    // user 從任何 region 看見 button → 點下啟動 drag,activator rect = button DOM(24×24),
    // ghost 起點 = button 位置(table outer 左 12px),cursor 在 ghost 左前段(自然視覺)。
    handleSetActivatorNodeRef: draggable.setActivatorNodeRef,
    handleListeners: draggable.listeners as unknown as Record<string, unknown> | undefined,
    handleAttributes: handleAttrs,
    invalidDrop,
  }
  return <SortableRowCtx.Provider value={ctxValue}>{children(ctxValue)}</SortableRowCtx.Provider>
}

function MirrorRowProvider({
  id,
  disabled,
  role,
  invalidDrop,
  children,
}: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  // Mirror region(left / right pinned)只 mount useDroppable — 接受 drop target,
  // 但不參與 drag source(避免 multi-instance same-id 衝突)。
  // RowDragHandle Button 只在 primary region 渲染(per `showDragHandle = ... && isPrimaryRegion`),
  // mirror ctx 不需要 handle listeners / activator,相關 field 為 undefined。
  // **v15.8 Bug 3 fix**(對齊 user 「source 沒一整條都有 disabled opacity」):
  //   mirror region drag 期間需跟 primary 同步顯 opacity-disabled,讓 source row 跨三 region
  //   視覺一致(SKU 釘選欄 + center + Updated 釘選欄整列半透明)。透過 useDndContext active
  //   判斷:any drag activated with active.id === own row id → mirror 也 isDragging。
  const droppable = useDroppable({ id, disabled, data: { type: 'row' } })
  const dndCtx = useDndContext()
  const isDragging = dndCtx.active?.id === id
  const ctxValue: SortableRowCtxValue = {
    setNodeRef: droppable.setNodeRef,
    role,
    style: { ...dragSourceStyle(isDragging) },
    attributes: {},
    isDragging,
    rowListeners: undefined,
    rowAttributes: {},
    handleSetActivatorNodeRef: undefined,
    handleListeners: undefined,
    handleAttributes: {},
    invalidDrop,
  }
  return <SortableRowCtx.Provider value={ctxValue}>{children(ctxValue)}</SortableRowCtx.Provider>
}

/** DraggableHeaderCell — wrap header cell 跟 dnd-kit useSortable 接軌(2026-05-06 v14.2)。
 *
 *  Why wrap-not-rewrite:`headerCellEl` 既有邏輯複雜(sort / resize / select column / right region 等),
 *  改 inline useSortable 入侵性高。本 wrapper cloneElement 注入 ref / style / listeners → 既有 render
 *  保持 untouched,單一職責 = 加 drag affordance。
 *
 *  Behavior:
 *    - useSortable 永遠 call(Rules of Hooks)— `disabled=true` 時不啟動 listeners
 *    - `data: { type: 'column', columnId }` 餵 dnd-kit handleDragStart / handleDragEnd 區分 row/column drag
 *    - 注入 ref(setNodeRef)+ transform style + transition + opacity(drag 時 source invisible,DragOverlay 顯 ghost)
 *    - draggable 時注入 attributes + listeners + cursor:grab / `data-column-id` (DragOverlay snapshot 用)
 *    - locked column / system column → disabled,無 grab cursor / 不啟動 drag
 *
 *  對齊 TanStack Column DnD canonical(<https://tanstack.com/table/latest/docs/framework/react/examples/column-dnd>)
 *  + Notion / Airtable header drag UX。 */
function DraggableHeaderCell({
  id,
  disabled,
  isLocked,
  dropIndicatorSide,
  children,
}: {
  id: string
  disabled: boolean
  isLocked: boolean
  /** Notion blue line drop indicator(2026-05-06 v14.4):'before' = 左邊緣藍線 / 'after' = 右邊緣藍線 / null = 無 */
  dropIndicatorSide: 'before' | 'after' | null
  children: React.ReactElement
}) {
  // **v15.0 Path B refactor**(對齊 TreeView SSOT):分離 useDraggable + useDroppable,不 auto-shift
  const draggable = useDraggable({ id, disabled, data: { type: 'column', columnId: id } })
  const droppable = useDroppable({ id, disabled, data: { type: 'column', columnId: id } })
  const setRefs = React.useCallback((el: HTMLElement | null) => {
    draggable.setNodeRef(el)
    droppable.setNodeRef(el)
  }, [draggable.setNodeRef, droppable.setNodeRef])
  const isDragging = draggable.isDragging
  const dragStyle: React.CSSProperties = {
    ...dragSourceStyle(isDragging),
  }
  // cloneElement 注入 — 不額外加 wrapper div(避免破壞 flex / column width 計算)
  const childProps = (children as React.ReactElement<{ style?: React.CSSProperties; className?: string; role?: string }>).props
  // useDraggable.attributes 含 `role="button"` + `tabIndex` 等 — 全部 spread 會蓋掉 header 原 `role="columnheader"`
  // (a11y 必保 columnheader 語意)。strip role + 保留 aria-* / tabIndex / aria-roledescription:
  const { role: _draggableRole, ...draggableAttrs } = draggable.attributes as unknown as Record<string, unknown>
  // Drop indicator(SSOT 對齊 TreeView):2px primary line via pseudo-element
  const indicatorClass = dropIndicatorSide === 'before'
    ? dropIndicatorColumn.pseudoBefore
    : dropIndicatorSide === 'after'
    ? dropIndicatorColumn.pseudoAfter
    : ''
  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ref: setRefs,
    style: { ...(childProps.style ?? {}), ...dragStyle },
    'data-column-id': id,
    'data-column-locked': isLocked || undefined,
    ...(disabled ? {} : { ...draggableAttrs, ...(draggable.listeners as unknown as Record<string, unknown>) }),
    // 2026-05-06 v14.9 cursor canonical(對齊 Notion / Jira):
    // **idle hover NOT 顯 cursor-grab** — header click 觸發 sort,grab cursor 會誤導 user 以為「點 = 拖」;
    // **drag activation 後**(isDragging=true,過 8px activationConstraint)才顯 cursor-grabbing。
    // user 點 = sort / 長壓 = drag,兩語意分開不互踩。
    className: cn(childProps.className, isDragging && dragActiveCursor, indicatorClass),
  })
}

/** Row drag handle — Portal-rendered, position:fixed 真正水平置中於 table outer border line(Jira canonical)。
 *
 *  v15.2 重構:**Button 純視覺 affordance**,不再 spread drag listeners — 改由 row div 整列接 listeners
 *  (TreeView SSOT)。Button 只負責顯示「此 row 可拖」的視覺暗示。
 *
 *  Why Portal + position:fixed(2026-05-05 v4):
 *    DataTable 結構含三層 overflow-hidden(outer wrapper / leftBody / row),用 absolute + translate-x:-50%
 *    凸出 row 左 border 會被三層任一裁切。position:fixed escape 所有 ancestor overflow constraint。
 *
 *  - 不佔 column 空間;hover-revealed 透過 row.dataset.hovered MutationObserver 觸發
 *  - Button variant="tertiary" iconOnly size="xs"(24px chip)
 *  - 任何 row drag 進行時(activeDragId != null)整體隱藏 — 對齊 user directive:
 *    drag 期間「INDICATOR + GHOST」就夠了,所有 row 不顯 hover bg / drag button */
function RowDragHandle({ disabled, anyDragActive }: { disabled: boolean; anyDragActive: boolean }) {
  const ctx = React.useContext(SortableRowCtx)
  const [rowEl, setRowEl] = React.useState<HTMLDivElement | null>(null)
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number; rowHovered: boolean } | null>(null)
  // Portal 逃逸 row DOM → cursor 移到 button 上時 row mouseleave → button hide → cycle flicker(2026-05-05)。
  // Fix:button 自帶 hover state,visibility = rowHovered || buttonHovered || isDragging。
  const [buttonHovered, setButtonHovered] = React.useState(false)

  // Anchor span ref callback finds the parent row element(自身位置 = row 內部,parentElement = row div)。
  // 用 useState 觸發 effect re-run(child ref callback 會 fire 在 commit phase,early enough for layout effect)
  const anchorRef = React.useCallback((node: HTMLSpanElement | null) => {
    setRowEl((node?.parentElement as HTMLDivElement) ?? null)
  }, [])

  React.useLayoutEffect(() => {
    if (!rowEl || !ctx || ctx.role !== 'primary') return

    // Portal target = table outer 的 parent(保持 CSS variable / theme scope 繼承,
    // 不 portal 到 document.body — body 沒 theme tokens 會使 Button tertiary 變透明)
    const tableEl = rowEl.closest<HTMLElement>('[data-data-table-outer]')
    setPortalTarget(tableEl?.parentElement ?? null)

    const update = () => {
      if (!tableEl) return
      const rRect = rowEl.getBoundingClientRect()
      const tRect = tableEl.getBoundingClientRect()
      // v15.1:drag 期間 source button hide(visible 邏輯已 guard isDragging),
      // 此處只報「真實 hover」狀態,不疊 isDragging mask。
      const rowHovered = rowEl.hasAttribute('data-hovered')
      setPos({
        top: rRect.top + rRect.height / 2,
        left: tRect.left, // table outer 左 border line position(viewport coords)
        rowHovered,
      })
    }

    update()

    // Observe row data-hovered changes(cross-region hover delegation 設置 dataset.hovered)
    const observer = new MutationObserver(update)
    observer.observe(rowEl, { attributes: true, attributeFilter: ['data-hovered'] })

    // Update on scroll(capture phase 抓所有 scroll container)+ resize
    const onScroll = () => requestAnimationFrame(update)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [rowEl, ctx])

  // 永遠 render anchor span(讓 anchorRef 可拿到 row element)。
  // A3 fix(2026-05-05):顯式 `top:0 left:0 pointer-events:none` — 雖 width/height=0 不該佔
  // flex space,但部分瀏覽器對 abs span 在 flex container 行為微妙 → 顯式座標固定原點,
  // 確保第一個 cell 文字位置不被推開。
  // ctx 為 null 或 mirror role 時 anchor 仍渲染但不渲 handle Portal
  const anchor = (
    <span
      ref={anchorRef}
      aria-hidden
      style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }}
    />
  )

  if (!ctx || ctx.role !== 'primary' || !pos) return anchor

  const canDrag = !disabled
  const showInvalid = !!ctx.invalidDrop && !!ctx.isDragging
  // Visibility canonical v15.3(對齊 Linear / Jira 世界級 + user directive
  // 「source 的 drag button 反倒是可以留在原本的位置維持被壓住的狀態」):
  //   - idle:rowHovered || buttonHovered → 顯示
  //   - drag 進行中:**source row 強制顯示 + active 視覺**(讓 user 知道哪個被壓住)
  //                  其他 row 的 button 隱藏(由 anyDragActive guard)
  const visible = ctx.isDragging || (!anyDragActive && (pos.rowHovered || buttonHovered))

  const handle = (
    <Button
      // **v15.6 button-only drag activator**:
      //   ref → setActivatorNodeRef(button DOM = 24×24 portal'd)
      //   listeners + attributes → spread(button 是 drag activator)
      //   pointer-events: visible=auto → 接 pointer events 觸發 drag
      ref={canDrag ? ctx.handleSetActivatorNodeRef : undefined}
      variant="tertiary"
      iconOnly
      size="xs"
      startIcon={GripVertical}
      aria-label={canDrag ? '拖曳重排此列' : '排序中無法拖曳'}
      aria-disabled={!canDrag || undefined}
      tabIndex={canDrag ? 0 : -1}
      disabled={!canDrag}
      onMouseEnter={() => setButtonHovered(true)}
      onMouseLeave={() => setButtonHovered(false)}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        opacity: visible ? 1 : 0,
        // visible=true → auto(接 pointer events 觸發 drag activator);invisible → none(避免 click 落空)
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 150ms ease',
      }}
      className={cn(
        // **v15.7 cursor canonical**(對齊 user directive「拖動時 cursor 不要變 grabbing」):
        // 只 hover 時 cursor-grab 提示「可拖」,drag 期間維持 cursor-grab 不變 grabbing
        // (對齊 Material / Carbon / Polaris canonical:drag affordance 由 visible button 提供,
        // cursor 變化反而干擾 indicator+ghost 視覺焦點)。
        canDrag && !showInvalid && 'cursor-grab',
        canDrag && showInvalid && 'cursor-not-allowed !text-error !border-error',
      )}
      {...(canDrag ? ctx.handleListeners ?? {} : {})}
      {...(canDrag ? ctx.handleAttributes ?? {} : {})}
    />
  )

  const wrapped = disabled ? (
    <Tooltip>
      <TooltipTrigger asChild>{handle}</TooltipTrigger>
      <TooltipContent>排序中無法拖曳,清除排序後可重排</TooltipContent>
    </Tooltip>
  ) : handle

  return (
    <>
      {anchor}
      {portalTarget && createPortal(wrapped, portalTarget)}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// AG Grid 模式：header 在 scroll 外面，body 是唯一的垂直 scroll container。
//
//  table
//  ├── header（固定頂部，不在 scroll 內）
//  │   ├── left-header
//  │   ├── center-header（overflow:hidden，JS sync scrollLeft）
//  │   └── right-header
//  └── body-viewport（overflow-y:auto，display:flex）
//      ├── left-body（overflow:hidden）
//      ├── center-body（overflow-x:auto, overflow-y:hidden）
//      └── right-body（overflow:hidden）
//
// 不用 CSS sticky。Header 永遠在頂部。
// ══════════════════════════════════════════════════════════════════════════════

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
function DataTableInner<TData>(
  {
    columns, data, size = 'md', autoRowHeight = false, height = '400px',
    overscan = 5, emptyState, enableHover = true, bordered,
    estimateRowHeight, tableOptions, rowActions,
    pinnedLeftColumns, pinnedRightColumns, inlineEdit = false,
    selection: selectionProp, defaultSelection, onSelectionChange,
    selectable = false, isRowSelectable, getRowId, getRowAriaLabel,
    preserveSelectionOnFilter = false,
    columnVisibility: columnVisibilityProp, defaultColumnVisibility, onColumnVisibilityChange,
    enableMultiSort = true,
    onColumnFilterTrigger,
    onCellCommit,
    enableRowDrag = false,
    onRowReorder,
    enableColumnResize = false,
    onColumnResize,
    enableColumnReorder = false,
    onColumnReorder,
    className, ...props
  }: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  // ── L4 Inline edit state ──
  // editingCellId: `${rowId}__${columnId}` 標識當前進 edit mode 的 cell;null = 無
  const [editingCellId, setEditingCellId] = React.useState<string | null>(null)
  const exitEdit = React.useCallback(() => setEditingCellId(null), [])
  const commitCell = React.useCallback(
    (rowId: string, colId: string, next: unknown) => {
      onCellCommit?.(rowId, colId, next)
      setEditingCellId(null)
    },
    [onCellCommit],
  )
  // 判 column meta.editable 對特定 row 是否成立(支援 fn)
  // column meta 是 free-form consumer bag(同 renderTypedValue any policy),不適合窄型化
  const isCellEditable = React.useCallback(
    // any-allow: free-form consumer meta — same rationale as L143 renderTypedValue
    (meta: Record<string, any> | undefined, row: unknown): boolean => {
      const e = meta?.editable
      if (typeof e === 'function') return e(row) === true
      return e === true
    },
    [],
  )
  const [sorting, setSorting] = React.useState<SortingState>(tableOptions?.state?.sorting as SortingState ?? [])

  // ── L3 Column visibility state(controllable)──
  const [columnVisibility, setColumnVisibility] = useControllable<Record<string, boolean>>({
    value: columnVisibilityProp,
    defaultValue: defaultColumnVisibility ?? {},
    onChange: onColumnVisibilityChange,
  })

  // ── L2 Selection state ──
  const enabled = selectable !== false
  const mode = selectable === 'single' ? 'single' : 'multi'
  const [selection, setSelection] = useControllable<string[]>({
    value: selectionProp,
    defaultValue: defaultSelection ?? [],
    onChange: onSelectionChange,
  })
  // Shift-click anchor:存最後一次「單擊」的 row id,shift-click 時做區間選
  const anchorRowIdRef = React.useRef<string | null>(null)

  // 注入 checkbox column(L2 selection;L4 row drag handle 不佔 column,absolute 浮在 row 左 border)
  // 順序:[__select__?, ...consumer columns]
  // **Column resizable canonical**(2026-05-05 user E rule):per-column `enableResizing` flag
  //   決定 width 行為(getCanResize=true → fixed / false → flex 1 1 0%)。**無 auto-default**
  //   "last column !resizable" — consumer 顯式設(對齊 user 拒絕「autoFillLastColumn」決策)。
  //
  // **2026-05-06 v14.3 DS canonical width API**:consumer 寫 `meta.width` / `meta.minWidth` /
  //   `meta.maxWidth`(DS-internal naming,避開跟 `size: 'sm'|'md'|'lg'` density 命名衝突)。
  //   此 pre-process 把 meta 值 copy 到 root size/minSize/maxSize,確保 TanStack column
  //   resize state 正常運作。**Back-compat**:consumer 寫 root `size` 仍 work(meta.width 沒設則
  //   不覆蓋 root)。新 code 一律用 meta.width。
  const dsProcessedColumns = React.useMemo<ColumnDef<TData>[]>(() => {
    return columns.map((c) => {
      const meta = c.meta as { width?: number; minWidth?: number; maxWidth?: number } | undefined
      if (!meta) return c
      const cAny = c as { size?: number; minSize?: number; maxSize?: number }
      const updates: { size?: number; minSize?: number; maxSize?: number } = {}
      if (meta.width !== undefined && cAny.size === undefined) updates.size = meta.width
      if (meta.minWidth !== undefined && cAny.minSize === undefined) updates.minSize = meta.minWidth
      if (meta.maxWidth !== undefined && cAny.maxSize === undefined) updates.maxSize = meta.maxWidth
      return Object.keys(updates).length > 0 ? ({ ...c, ...updates } as ColumnDef<TData>) : c
    })
  }, [columns])

  const columnsWithSelection = React.useMemo(() => {
    if (!enabled) return dsProcessedColumns
    const selectCol: ColumnDef<TData, any> = {
      id: SELECT_COL_ID,
      size: 40,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,  // selection col 不能藏(L3 column visibility)
      header: 'Select',  // header cell 由下方自訂 render 取代
      cell: () => null,  // body cell 由下方自訂 render 取代
    }
    return [selectCol, ...dsProcessedColumns]
  }, [dsProcessedColumns, enabled])

  // pinned-left 自動加 __select__(__select__ 永遠最左)
  const effectivePinnedLeft = React.useMemo(() => {
    const list = pinnedLeftColumns ?? []
    const out = [...list]
    if (enabled && !out.includes(SELECT_COL_ID)) out.unshift(SELECT_COL_ID)
    return out
  }, [pinnedLeftColumns, enabled])

  // columnOrder 自動加 __select__ 在最前:consumer 傳的 columnOrder 通常只列 data
  // columns,TanStack 會把不在 order 的 column 推到末位 → 同步幫他補上
  const userColumnOrder = tableOptions?.state?.columnOrder
  const effectiveColumnOrder = React.useMemo(() => {
    if (!userColumnOrder) return userColumnOrder
    if (!enabled) return userColumnOrder
    const out = [...userColumnOrder]
    if (enabled && !out.includes(SELECT_COL_ID)) out.unshift(SELECT_COL_ID)
    return out
  }, [userColumnOrder, enabled])

  // 注意:`...tableOptions` 必 spread 在 `state` 前,否則 user 傳的 tableOptions 會
  // 整個 override 掉我們組的 state(含 __select__ 自動 pinning + columnOrder 注入)。
  // 之前 bug:checkbox column 跑到右邊 = 此處 spread 順序錯。
  const table = useReactTable({
    ...tableOptions,
    data, columns: columnsWithSelection,
    state: {
      sorting, columnVisibility,
      ...tableOptions?.state,
      // columnPinning + columnOrder 在 user state 後 override,確保 __select__ 永遠左
      columnPinning: { left: effectivePinnedLeft, right: pinnedRightColumns ?? [] },
      ...(effectiveColumnOrder ? { columnOrder: effectiveColumnOrder } : {}),
    },
    enableMultiSort,
    // **#1 fix(2026-05-04)**:chain user `tableOptions.onSortingChange`(spread 在前被 override = 之前 bug)
    // 同 onColumnVisibilityChange:both internal setState + forward 給 user external state
    onSortingChange: (updater) => {
      setSorting(updater)
      tableOptions?.onSortingChange?.(updater)
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      setColumnVisibility(next)
      tableOptions?.onColumnVisibilityChange?.(updater)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // L4 nested rows:啟用 expanded row model(consumer 透過 tableOptions.getSubRows + state.expanded forward)
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: getRowId,
    // 2026-05-06 v14 column resize:`onChange` mode → drag 中 column 即時跟動 cursor(world-class
    // canonical:TanStack docs / AG Grid / Excel / Google Sheets 全部 live resize)。前 v13.2
    // 用 `onEnd` 拖完才 jump,user 報「感覺超頓像 bug」。tanstack 內部管 columnSizing state
    // (uncontrolled);`columnSizingState` 變動透過 useEffect 觀測 + 呼 callback。
    //
    // 前 v11 用 `onColumnSizingChange` 接管 updater 但忘了 setColumnSizing,導致 state 永遠不變動 →
    // column.getSize() 永遠回初始值 → drag visual 完全沒效果(user 報 "drag 沒反應")。本 v13.2 改回
    // tanstack uncontrolled state(預設行為)+ useEffect 觀測 columnSizing 變動 fire callback。
    enableColumnResizing: enableColumnResize,
    columnResizeMode: 'onChange',
  })

  // v13.2:onColumnResize callback 透過 useEffect 觀測 columnSizing state 變動 fire(uncontrolled state pattern)
  const columnSizingState = table.getState().columnSizing
  const prevColumnSizingRef = React.useRef(columnSizingState)
  React.useEffect(() => {
    if (!onColumnResize) return
    const prev = prevColumnSizingRef.current
    Object.keys(columnSizingState).forEach(id => {
      if (columnSizingState[id] !== prev[id]) {
        onColumnResize(id, columnSizingState[id])
      }
    })
    prevColumnSizingRef.current = columnSizingState
  }, [columnSizingState, onColumnResize])

  const { rows } = table.getRowModel()
  const isEmpty = rows.length === 0
  const hasHeightConstraint = height !== 'auto'
  // Fill-parent mode:height='100%' / '100vh' / 'fill' 等百分比 / 視口語義 → outer flex column + body flex-1 撐滿。
  // 固定 px/rem 仍維持 maxHeight cap 行為(資料少 = 內容高度,資料多 = 上限後 scroll)— 對齊既有 stories 預期。
  const isFillHeight = hasHeightConstraint && /^(100%|100vh|fill)$/.test(height)
  // **Virtualization threshold(2026-05-07 v15.9 Bug G fix)**:小資料集 skip 虛擬化。
  // Root cause:虛擬化器(TanStack Virtual)`getVirtualItems()` 在 scrollElement
  // 還沒 mount(first render,centerBodyRef = null)時會返回空陣列 →「0 row → N row」
  // 跨 frame transition,user 看到「table 從矮長高 + 資料慢慢露出」。≤ 30 rows
  // direct render 完全 bypass 此 race,且小資料下虛擬化沒效益(浪費 reflow)。
  // 對齊 AG Grid `suppressVirtualization` / TanStack Table virtualization-when-needed idiom。
  const VIRTUAL_THRESHOLD = 30
  const useVirtual = hasHeightConstraint && !isEmpty && rows.length > VIRTUAL_THRESHOLD
  const hasRowActions = !!rowActions

  // Refs
  const tableRef = React.useRef<HTMLDivElement | null>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const centerHeaderRef = React.useRef<HTMLDivElement>(null)
  const centerBodyRef = React.useRef<HTMLDivElement>(null)
  const leftHeaderRef = React.useRef<HTMLDivElement>(null)
  const rightHeaderRef = React.useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = React.useState(0)
  const [rightWidth, setRightWidth] = React.useState(0)

  // estimate 預設 size-aware 對齊 token(--table-row-{sm,md,lg} = 32/40/48 md density)
  // Q7 fix(2026-05-04):前用 hardcode 36 跟真高 40 差 4px,N rows 累積誤差呈現「table 慢慢長高」假象。
  // ResizeObserver+measureElement 的修正過程被 user 看見 = mount-time growth bug 的真因。
  const ESTIMATE_BY_SIZE: Record<string, number> = { sm: 32, md: 40, lg: 48 }
  const resolvedEstimate = estimateRowHeight ?? ESTIMATE_BY_SIZE[size] ?? 40
  // 2026-05-06 v10 DragOverlay canonical:retire windowed sticky range extractor (v4-v9 workaround)。
  // 改用 `<DragOverlay>` portal 把 source row 視覺解耦 — source 即使 unmount(virtual scroll out)
  // overlay 仍 render 由 cloned outerHTML 提供視覺。dnd-kit transform / collision 走 active item id
  // (id 永遠在 SortableContext.items 集合,跟 hook instance mount 狀態無關)。
  // 對齊 dnd-kit GitHub #1674 + drag-overlay docs canonical「virtualized list MUST use DragOverlay」。
  // overscan 仍輕微拉高(避免 source row 旁邊 rows 也 unmount 致使 hover signal 計算抖動)。
  const effectiveOverscan = enableRowDrag ? Math.max(overscan, 5) : overscan
  const activeDragIdRef = React.useRef<string | null>(null)

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    // V scroll 現在在 centerBodyRef(不是外層 bodyRef)
    getScrollElement: () => centerBodyRef.current,
    estimateSize: () => resolvedEstimate,
    overscan: effectiveOverscan, enabled: useVirtual,
  })

  // ── isFillHeight body maxHeight JS 計算(2026-04-30)──
  // CSS `%` height 在 flex column min-h-0 + auto basis 場景下,Chromium 不可靠 shrink
  // (實測:outer maxHeight 100% bind parent,但 body 不 shrink 反映 outer 約束 → outer
  // overflow-hidden 切掉 content,V scroll 不 trigger)。
  // 改用 ResizeObserver 算 body avail = outer rect - header rect → set centerBody
  // maxHeight = pixel value(不是 %)。content 大 → V scroll;content 小 → centerBody
  // = content,outer = intrinsic,沒留白。
  // **Q7 mount-time growth fix(2026-05-04 v3 真因)**:不是 visibility race,是 estimateRowHeight
  // 預設 36 ≠ 真實 row height(token md=40 / sm=32 / lg=48),virtualizer initial total = 6×36 = 216,
  // 後續 measureElement 修正到 6×40 = 240,差 24px 視覺看起來像「table 慢慢長高」。fix = estimate
  // 預設 size-aware 對齊 token(見下方 estimateRowHeight default 計算)。
  const [bodyMaxHeight, setBodyMaxHeight] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    if (!isFillHeight) { setBodyMaxHeight(null); return }
    const compute = () => {
      if (!tableRef.current) return
      const outerH = tableRef.current.getBoundingClientRect().height
      const headerEl = tableRef.current.firstElementChild as HTMLElement | null
      const headerH = headerEl?.getBoundingClientRect().height ?? 0
      setBodyMaxHeight(Math.max(0, outerH - headerH))
    }
    compute()
    const obs = new ResizeObserver(compute)
    if (tableRef.current) obs.observe(tableRef.current)
    // outer 也跟 parent 大小變化(parent flex-1 縮)
    if (tableRef.current?.parentElement) obs.observe(tableRef.current.parentElement)
    return () => obs.disconnect()
  }, [isFillHeight])

  // JS scroll sync(AR44 user-reported UX fix):
  // 原本 V scroll 在 body-viewport(外層),center-body H scroll 於其內部底部 = 所有 row 都 render 下方。
  // Virtualized 1800px 內容 → H scrollbar 在 1800px 下方,user 必須 V-scroll 到底才看見 → UX bug。
  // **現在 V scroll 移到各 region 自己(left / center / right 分別)**,三者 scrollTop JS 同步;
  // H scroll 仍在 center-body,但因 center-body 現在有自己的 maxHeight,H scrollbar 落在 visible 視窗底部 → user 一眼看到。
  const leftBodyRef = React.useRef<HTMLDivElement>(null)
  const rightBodyRef = React.useRef<HTMLDivElement>(null)
  const onCenterBodyScroll = React.useCallback(() => {
    const cb = centerBodyRef.current
    if (!cb) return
    if (centerHeaderRef.current) centerHeaderRef.current.scrollLeft = cb.scrollLeft
    if (leftBodyRef.current) leftBodyRef.current.scrollTop = cb.scrollTop
    if (rightBodyRef.current) rightBodyRef.current.scrollTop = cb.scrollTop
  }, [])

  // 三區域欄位
  const leftCols = table.getLeftVisibleLeafColumns()
  const centerCols = table.getCenterVisibleLeafColumns()
  const rightCols = table.getRightVisibleLeafColumns()
  const hasLeft = leftCols.length > 0
  const hasRight = rightCols.length > 0 || hasRowActions
  // 2026-05-06 v13.1:Center region SSOT width — header inner wrapper + body inner wrapper 共用
  // 同一個 minWidth 算法,確保 header / body cell 寬度永遠對齊(前 v8 用 `w-max min-w-full`
  // 在 header(content max-content 小)vs body(content max-content 大)會 diverge 76+ px,
  // user 報「header / row 對不起來」)。
  const centerColsWidth = centerCols.reduce((a, c) => a + c.getSize(), 0)

  // Header 寬度 → body region 同步（virtual mode 需要明確寬度）
  React.useEffect(() => {
    const measure = () => {
      if (leftHeaderRef.current) setLeftWidth(leftHeaderRef.current.offsetWidth)
      if (rightHeaderRef.current) setRightWidth(rightHeaderRef.current.offsetWidth)
    }
    measure()
    const obs = new ResizeObserver(measure)
    if (leftHeaderRef.current) obs.observe(leftHeaderRef.current)
    if (rightHeaderRef.current) obs.observe(rightHeaderRef.current)
    return () => obs.disconnect()
  }, [hasLeft, hasRight, rows.length])

  const rowHeight = `h-table-row-${size}`

  // ── Cross-region row hover (2026-04-22 D3 perf audit):event delegation 改 per-row closure
  // 舊:每 row 建 `{ onMouseEnter, onMouseLeave }` + 2 arrow functions → 100 row = 200 closures/render
  // 新:表格層 single onMouseOver / onMouseOut,透過 event.target.closest 找 data-row-index
  const enterLeaveHandlers = React.useMemo(() => {
    if (!enableHover) return { onMouseOver: undefined, onMouseOut: undefined }
    const findRowIndex = (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) return null
      const rowEl = target.closest<HTMLElement>('[data-row-index]')
      return rowEl?.dataset.rowIndex ?? null
    }
    return {
      onMouseOver: (e: React.MouseEvent) => {
        // v15.3:drag 進行中只允許 source row 自己被標 hover(維持 active 視覺
        // 對齊 Linear / Jira「source 維持 pressed 狀態」canonical)。其他 row 抑制。
        if (activeDragIdRef.current != null) {
          const target = e.target instanceof HTMLElement ? e.target : null
          const rowEl = target?.closest<HTMLElement>('[data-sortable-row-id]')
          const isSource = rowEl?.dataset.sortableRowId === activeDragIdRef.current
          if (!isSource) return
        }
        const idx = findRowIndex(e.target)
        if (idx == null) return
        tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach((el) => ((el as HTMLElement).dataset.hovered = ''))
      },
      onMouseOut: (e: React.MouseEvent) => {
        const idx = findRowIndex(e.target)
        if (idx == null) return
        // 仍在同一 row 的子元素間 bubble(e.g. cell → text node)則 relatedTarget 還在 row 內
        const related = e.relatedTarget instanceof HTMLElement ? e.relatedTarget.closest<HTMLElement>('[data-row-index]') : null
        if (related?.dataset.rowIndex === idx) return
        tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach((el) => delete (el as HTMLElement).dataset.hovered)
      },
    }
  }, [enableHover])
  // 維持 API:hoverProps(idx) 仍存在但 no-op,實際邏輯搬到 table 層 delegation
  const hoverProps = (_idx: number): Record<string, never> => ({})

  // ── Cell render(Phase C 2026-05-05 — type-keyed registry SSOT)──
  // 命中 columnType → 走 cellRegistry(display / edit mode 同元件 with `mode` prop);
  // 無 columnType → consumer 自訂 cell.columnDef.cell。
  const renderCellContent = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const wrap = autoRowHeight && meta?.wrap === true
    // 已知 compound 欄位(Tag / PersonDisplay / LinkInput 等自帶 layout)直接 bypass TruncateCell,
    // 因為 `truncate` 的 inline baseline context 會破壞自訂 layout 的垂直對齊。
    const isKnownCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'url'
    const rowId = cell.row.id
    const colId = cell.column.id
    const editable = isCellEditable(meta, cell.row.original)
    const isEditingThisCell = editingCellId === cellEditId(rowId, colId)

    let content: React.ReactNode
    if (colType) {
      const Cell = resolveCellComponent(colType)
      // boolean 不分 mode(editable 時 Checkbox 直接可 toggle);其他 type 由 isEditingThisCell 切 mode
      const cellMode: 'edit' | 'display' = isEditingThisCell ? 'edit' : 'display'
      content = (
        <Cell
          value={cell.getValue()}
          meta={meta ?? {}}
          mode={cellMode}
          size={size}
          autoRowHeight={autoRowHeight}
          isEditable={editable}
          onCommit={(next) => commitCell(rowId, colId, next)}
          onCommitLive={(next) => onCellCommit?.(rowId, colId, next)}
          onCancel={exitEdit}
          onRequestEdit={() => setEditingCellId(cellEditId(rowId, colId))}
        />
      )
    } else {
      content = flexRender(cell.column.columnDef.cell, cell.getContext())
    }
    // Consumer 自訂 cell(無 colType)若回傳 React element,視為 compound — consumer 自己處理
    // 對齊與截斷。回傳 primitive(string / number)才走 TruncateCell。
    // 理由:TruncateCell 的 `span.truncate` 強制 white-space:nowrap + inline baseline,
    // 對 inline-flex / icon+text 自訂結構會拉歪(見 circular-progress sync table 案例)。
    // **edit mode bypass**(2026-05-05 v9 Bug 2 修):editing cell 內部是 Field 控件
    // (Input/Textarea/Select etc.)自管 layout + 替代元素(textarea)不該被包進 inline span
    // baseline context — 否則 line-box descender 加 5-7px 致 cell 進 edit 後 row 撐高 layout shift。
    const isConsumerCompound = !colType && React.isValidElement(content)
    return isEditingThisCell ? content
      : wrap ? <span className="break-words min-w-0">{content}</span>
      : (isKnownCompound || isConsumerCompound) ? content
      : <TruncateCell>{content}</TruncateCell>
  }

  const iconSize = size === 'lg' ? 20 : 16

  // Inline edit 指示器 — 永遠顯示 canonical(2026-05-05 user explicit:不要 hover-reveal):
  //   editable cell 永遠顯示對應 type 的指示型 icon(chevron / Calendar / Clock),提示「可編輯」。
  //   只在 cellEditable=true 才 render(由 caller `cellEl` gating);non-editable cell 無 indicator。
  //   editing 時 hide(避免跟 Field control 自帶 trigger icon 衝突 → 雙 icon)。
  //   對齊 Airtable / Notion editable cell hint canonical — 永遠顯示維持互動可發現性。
  // Display-mode editable cell indicator(對齊 Notion / Airtable / Linear common idiom):
  //   editable cell display 永遠顯示「點擊觸發浮層」icon(chevron / calendar / clock),用戶
  //   一眼識別「這 cell 可編」。**包 `<ItemSuffix>` 消費 row-layout L1 SSOT**(永遠 h-[1lh],
  //   單行視覺 = items-center,autoRow 多行 pin first-line) — 解 v8 前 chevron 齊頂 bug。
  //   URL column 屬 hover-pencil 例外(URL 本身 click=導航,需保留;edit 走 hover affordance)。
  const getEditIndicator = (colType?: ColumnType) => {
    if (!inlineEdit) return null
    const Icon =
      (colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson') ? ChevronDown
      : colType === 'date' ? Calendar
      : colType === 'time' ? Clock
      : null
    if (!Icon) return null
    return (
      <ItemSuffix className="text-fg-muted">
        <Icon size={iconSize} aria-hidden />
      </ItemSuffix>
    )
  }

  // L4 row drag:sort active 時 drag handle disabled(對齊 Notion / Airtable 共識)
  const dragDisabled = sorting.length > 0

  // ── L4 Row drag v2:nested rows + parent map ─────────────────────────────────
  // v2 cross-parent fix:全 row 進 SortableContext.items(含 sub-rows),custom collisionDetection
  // 過濾掉 cross-parent over candidates,保留「同 parent siblings」。沒命中 → invalid drop signal。
  // parentMap: rowId → parentId(top-level row 的 parent = '' 哨兵 string)
  const { allRowIds, parentMap } = React.useMemo(() => {
    const ids: string[] = []
    const pmap = new Map<string, string>()
    const walk = (r: typeof rows[number], parentId: string) => {
      ids.push(r.id)
      pmap.set(r.id, parentId)
      const subs = (r as unknown as { subRows?: typeof rows }).subRows
      if (subs && Array.isArray(subs)) subs.forEach(s => walk(s, r.id))
    }
    rows.forEach(r => { if ((r.depth ?? 0) === 0) walk(r, '') })
    return { allRowIds: ids, parentMap: pmap }
  }, [rows])

  // active drag state(state for invalid signal re-render;ref for fast lookup in collisionDetection)
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  // sync ref + force virtualizer recompute so rangeExtractor 看得到新 active id(M25 chain invariant)
  React.useEffect(() => {
    activeDragIdRef.current = activeDragId
    if (enableRowDrag && useVirtual) virtualizer.measure()
  }, [activeDragId, enableRowDrag, useVirtual, virtualizer])
  const [invalidDropActive, setInvalidDropActive] = React.useState(false)
  const invalidRef = React.useRef(false)
  invalidRef.current = invalidDropActive

  // code-quality-allow: long-function — cell render 含 selection / pinned / type-aware formatter 三邏輯,拆會增 prop drilling
  const cellEl = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number], isLastInRow = false) => {
    // L2 selection:__select__ 欄自訂 render
    // multi 模式 → Checkbox(可多選)
    // single 模式 → Radio(單選 visual,對齊 Material DataGrid / Polaris IndexTable canonical)
    if (enabled && cell.column.id === SELECT_COL_ID) {
      const rowId = cell.row.id
      const rowOriginal = cell.row.original
      const isDisabled = isRowSelectable ? !isRowSelectable(rowOriginal) : false
      const ariaLabel = getRowAriaLabel?.(rowOriginal) ?? 'Select row'
      const checkboxSize = size === 'lg' ? 'lg' : 'md'
      // Cell 整格可點:click cell padding 也觸發 toggle/select(對齊 Linear / Apple Mail / Material DataGrid)
      // 內部 checkbox/radio 用 stopPropagation 避免 double-fire
      const onCellClick = isDisabled ? undefined : (e: React.MouseEvent) => {
        e.stopPropagation()
        if (mode === 'single') setSelection([rowId])
        else toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
      }
      return (
        <div
          key={cell.id}
          role="cell"
          className={cn('flex items-center justify-center shrink-0', !isDisabled && 'cursor-pointer')}
          style={{ ...columnSizeStyle(cell.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(cell.column.id) }), ...cellPadding }}
          onClick={onCellClick}
        >
          {mode === 'single' ? (
            <RadioGroupItem
              size={checkboxSize}
              value={rowId}
              disabled={isDisabled}
              aria-label={ariaLabel}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Checkbox
              size={checkboxSize}
              checked={selectionSet.has(rowId)}
              disabled={isDisabled}
              aria-label={ariaLabel}
              onClick={(e) => {
                e.stopPropagation()
                if (isDisabled) return
                e.preventDefault()  // 攔截 Radix 內部 toggle,自己 toggle 帶 shiftKey
                toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
              }}
              onKeyDown={(e) => {
                // Space:Radix 已處理 toggle,但要帶 shiftKey 區間選 → 攔截
                if (e.key === ' ' && !isDisabled) {
                  e.preventDefault()
                  toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
                }
              }}
            />
          )}
        </div>
      )
    }
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    // L4 inline edit 整合
    const cellRowId = cell.row.id
    const cellColId = cell.column.id
    const cellEditable = isCellEditable(meta, cell.row.original)
    const isEditingThisCell = editingCellId === cellEditId(cellRowId, cellColId)
    // Indicator canonical(2026-05-05):
    //   - 永遠顯示(user explicit:不要 hover-reveal)— 對齊 Airtable / Notion editable cell 永遠 hint 可編輯性
    //   - 只在 cellEditable 才顯示(non-editable cell 無 indicator)— user explicit
    //   - editing 時 hide(避免跟 Field control 自帶 trigger icon 衝突 → 雙 icon)
    //   - SSOT 在 DataTable cellEl,Field component 不渲染 indicator(不重複定義)
    const indicator = (cellEditable && !isEditingThisCell) ? getEditIndicator(colType) : null
    // Cell click → 進 edit mode(boolean 不需 — 自己 toggle;url 不需 — 走內部 Pencil button,Phase C 由 UrlCell 內處理)
    const onEditableCellClick = cellEditable && colType !== 'boolean' && colType !== 'url' && !isEditingThisCell
      ? () => setEditingCellId(cellEditId(cellRowId, cellColId))
      : undefined

    // L4 nested rows:該 cell 是否是 row 第 1 個非 select content cell(注入 chevron + indent)
    // 對齊 TreeView design language(token `--tree-indent-{sm,md,lg}` 為 SSOT,跨元件視覺一致)
    const allCells = cell.row.getVisibleCells()
    const firstContentCell = allCells.find(c => c.column.id !== SELECT_COL_ID)
    const isFirstContent = firstContentCell?.id === cell.id
    const depth = cell.row.depth ?? 0
    const canExpand = cell.row.getCanExpand?.() ?? false
    const isExpanded = cell.row.getIsExpanded?.() ?? false
    const toggleExpand = cell.row.getToggleExpandedHandler?.()
    const showNestedPrefix = isFirstContent && (depth > 0 || canExpand)
    return (
      <div
        key={cell.id}
        role="cell"
        // group/cell + data-row-mode:讓 Field naked 用 `group-data-[row-mode=...]/cell:items-X`
        // 從 cell 取 alignment(autoRowHeight=auto 頂對齊 / fixed=fixed 置中)。CSS propagation,
        // Field API 不變;每個 mode 內 display↔edit 同 alignment(同 Field, 同 group → 同 items)。
        data-row-mode={autoRowHeight ? 'auto' : 'fixed'}
        data-column-id={cell.column.id}
        className={cn(
          // Cell box(2026-05-05 v6 — A4 canonical: Field frame seamlessly replaces cell border):
          //   - `self-stretch`: cell 永遠填 row 高
          //   - **vertical alignment by row-mode**: autoRow=items-start(top per spec) /
          //     fixed=items-center(centered per spec)。indicator + 非 Field 內容跟 cell 走。
          //   - **editing cell**: padding=0 + 無 right divider → Field naked(`!h-full !px-[cell-px]
          //     !py-[cell-py]`)邊框與 table divider 無縫接軌,seamlessly replace cell border。
          //     Adjacent cell padding+divider 仍在,只 editing cell 自己改觀。對齊 user reminder
          //     「框框跟 cell 一樣大並取代 cell 的框且與 table 隔線無縫接軌」(2026-05-05)。
          //   - **沒有** cell 自己 box-shadow ring — focus / hover / open ring 由 Field naked 自帶
          //     state machine 提供(對齊 user「狀態樣式取決於原輸入框」reminder)
          'group/cell flex text-foreground text-body font-normal shrink-0 relative self-stretch overflow-hidden',
          autoRowHeight ? 'items-start' : 'items-center',
          align === 'right' && 'justify-end text-right',
          align === 'center' && 'justify-center text-center',
          // 2026-05-06 v14:revert v12 absolute(autoRowHeight 不相容)→ Field 留 layout flow,
          // 視覺接受 cell border-r grid + Field border 2px 雙線。永遠 keep border-r divider
          // (user 確認 cell 右邊 border 不必移除)。
          inlineEdit && !isLastInRow && 'border-r border-divider',
          indicator && 'gap-2',
          onEditableCellClick && ['cursor-pointer', nakedCellEditableDisplayHover],  // editable cell display hover affordance(對齊 Notion / Airtable hover-cell-shows-border canonical)
          isEditingThisCell && 'z-10',
        )}
        style={{
          ...columnSizeStyle(cell.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(cell.column.id) }),
          ...(isEditingThisCell ? {} : cellPadding),
        }}
        onClick={onEditableCellClick}
      >
        {/* L4 nested rows prefix:depth indent + chevron(僅 first content cell + 有 nested 結構)
            indent = depth * --tree-indent(對齊 TreeView SSOT)
            chevron click != row select(stopPropagation)— 對齊 TreeView design language */}
        {showNestedPrefix && (
          <span
            className="flex items-center shrink-0"
            style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--tree-indent-${size}, var(--tree-indent-md)))` : 0 }}
          >
            {canExpand ? (
              <button
                type="button"
                aria-label={isExpanded ? '收合' : '展開'}
                aria-expanded={isExpanded}
                className="inline-flex items-center justify-center shrink-0 w-4 h-4 mr-2 text-fg-muted hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-transform"
                style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                onClick={(e) => { e.stopPropagation(); toggleExpand?.() }}
              >
                <ChevronDown size={iconSize} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
              </button>
            ) : (
              <span aria-hidden className="shrink-0 w-4 h-4 mr-2" />
            )}
          </span>
        )}
        {/* `self-stretch`:span 強制填 cell 全高,Field naked `!h-full` 才有 definite parent height。
            inner span items-X **mirror cell**(autoRow → start / fixed → center)— 確保非 Field
            content(Checkbox / inline 內容)在兩 mode 視覺位置正確,Field naked content 也跟著走
            cell row-mode(透過 group-data SSOT 進一步傳遞到 Field 內部 wrapper,M19 ensure-canonical)。
            indicator 是 sibling 跟 cell items-X 走(fixed=center / autoRow=start per spec)。 */}
        <span className={cn(
          'flex-1 min-w-0 self-stretch flex',
          autoRowHeight ? 'items-start' : 'items-center',
          align === 'right' && 'justify-end',
        )}>
          {renderCellContent(cell)}
        </span>
        {indicator}
      </div>
    )
  }

  // ── L2 Selection helpers ──
  const visibleRowIdsKey = React.useMemo(() => rows.map(r => r.id).join(','), [rows])
  const visibleRowIdsSet = React.useMemo(() => new Set(rows.map(r => r.id)), [visibleRowIdsKey])

  // 對齊 spec L2 七、Filter 套用 → filtered-out selected rows 預設清掉
  React.useEffect(() => {
    if (!enabled || preserveSelectionOnFilter) return
    setSelection(prev => {
      const filtered = prev.filter(id => visibleRowIdsSet.has(id))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [visibleRowIdsKey, enabled, preserveSelectionOnFilter, visibleRowIdsSet, setSelection])

  // Visible 可選 row IDs(扣除 disabled)
  const selectableVisibleIds = React.useMemo(() => {
    if (!enabled) return [] as string[]
    return rows
      .filter(r => !isRowSelectable || isRowSelectable(r.original))
      .map(r => r.id)
  }, [rows, enabled, isRowSelectable])

  // Header tri-state checkbox value
  const selectionSet = React.useMemo(() => new Set(selection), [selection])
  const visibleSelectedCount = selectableVisibleIds.filter(id => selectionSet.has(id)).length
  const headerCheckedState: boolean | 'indeterminate' =
    selectableVisibleIds.length === 0 ? false
      : visibleSelectedCount === 0 ? false
      : visibleSelectedCount === selectableVisibleIds.length ? true
      : 'indeterminate'

  // visibleIdToRow Map(shift-click 區間選 lookup,避免 O(n) `rows.find()`)
  const visibleIdToRow = React.useMemo(
    () => new Map(rows.map(r => [r.id, r])),
    [rows]
  )

  const toggleHeaderCheckbox = React.useCallback(() => {
    if (headerCheckedState === true) {
      // 清掉本頁可見已選(保留可見外的 selection)
      const visibleSet = new Set(selectableVisibleIds)
      setSelection(prev => prev.filter(id => !visibleSet.has(id)))
    } else {
      // 選全可見(扣除 disabled);保留可見外的既有 selection
      setSelection(prev => Array.from(new Set([...prev, ...selectableVisibleIds])))
    }
  }, [headerCheckedState, selectableVisibleIds, setSelection])

  const toggleRow = React.useCallback((rowId: string, rowOriginal: TData, opts?: { shiftKey?: boolean }) => {
    if (isRowSelectable && !isRowSelectable(rowOriginal)) return
    if (mode === 'single') {
      setSelection(selectionSet.has(rowId) ? [] : [rowId])
      anchorRowIdRef.current = rowId
      return
    }
    // multi 模式
    const anchor = anchorRowIdRef.current
    if (opts?.shiftKey && anchor && anchor !== rowId) {
      // 區間選:從 anchor 到 rowId(在 visible 順序內),全 toggle 成 willCheck 狀態
      const visibleIds = rows.map(r => r.id)
      const a = visibleIds.indexOf(anchor)
      const b = visibleIds.indexOf(rowId)
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const rangeIds = visibleIds.slice(from, to + 1).filter(id => {
          const row = visibleIdToRow.get(id)
          return row && (!isRowSelectable || isRowSelectable(row.original))
        })
        // Mail / GitHub 慣例:shift-click 把 range 全變「rowId 點擊後該變的狀態」
        const willCheck = !selectionSet.has(rowId)
        setSelection(prev => {
          const set = new Set(prev)
          rangeIds.forEach(id => willCheck ? set.add(id) : set.delete(id))
          return Array.from(set)
        })
        return
      }
    }
    // 一般 toggle + 更新 anchor
    setSelection(prev => {
      const set = new Set(prev)
      if (set.has(rowId)) set.delete(rowId)
      else set.add(rowId)
      return Array.from(set)
    })
    anchorRowIdRef.current = rowId
  }, [isRowSelectable, mode, selectionSet, rows, visibleIdToRow, setSelection])

  // ── Cmd+A / Esc 鍵盤 handler(table-level)──
  // code-quality-allow: long-function — single keyboard dispatch covering Cmd+A / Esc / Arrow / Space + selection state mutations,拆 sub-handler 會切散 keyboard mode coherence
  const tableKeyboardHandler = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!enabled) return
      // Cmd/Ctrl+A:選全可見(扣 disabled)— 對齊 Mail / GitHub / Linear 慣例
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && mode === 'multi') {
        e.preventDefault()
        setSelection(prev => Array.from(new Set([...prev, ...selectableVisibleIds])))
        return
      }
      // Esc:clear selection
      if (e.key === 'Escape' && selection.length > 0) {
        e.preventDefault()
        setSelection([])
        anchorRowIdRef.current = null
        return
      }
    },
    [enabled, mode, selection.length, selectableVisibleIds, setSelection]
  )

  // ── Header cell ──
  // code-quality-allow: long-function — header render 含 selection tri-state / sort indicator / column dropdown / pinned / divider 五邏輯,拆 sub-fn 會切散 column type-aware rendering coherence
  const headerCellEl = (header: ReturnType<typeof table.getHeaderGroups>[number]['headers'][number], showDivider: boolean) => {
    // L2 selection:__select__ 欄自訂 render(tri-state header checkbox)
    if (enabled && header.column.id === SELECT_COL_ID) {
      const isHeaderDisabled = selectableVisibleIds.length === 0 || mode !== 'multi'
      return (
        <div
          key={header.id}
          role="columnheader"
          className={cn('flex items-center justify-center shrink-0 select-none', !isHeaderDisabled && 'cursor-pointer')}
          style={{ ...columnSizeStyle(header.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(header.column.id) }), ...cellPadding }}
          onClick={isHeaderDisabled ? undefined : (e) => { e.stopPropagation(); toggleHeaderCheckbox() }}
        >
          {mode === 'multi' && (
            <Checkbox
              size={size === 'lg' ? 'lg' : 'md'}
              checked={headerCheckedState}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => toggleHeaderCheckbox()}
              aria-label="Select all visible rows"
              disabled={selectableVisibleIds.length === 0}
            />
          )}
        </div>
      )
    }
    const meta = header.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    // Sort UI(Phase A.1):header cell 兩區結構
    //   左區(label + indicator slot):click → toggle sort 三態(asc → desc → none)
    //   右區:reserve future ⌄ menu(filter / hide / pin 等;hover 才出,A.x 加)
    // Indicator inline collapse:已套才顯;未套不顯(任何混雜組合不推 — 對齊 AG Grid / Notion)
    const canSort = header.column.getCanSort()
    const sortDir = header.column.getIsSorted() // false | 'asc' | 'desc'
    // **A fix(2026-05-04)**:multi-sort(≥2)hide header arrow + 取消排序 option
    //   理由:無 order 編號的單個 arrow 在 multi-sort 下是 partial info → 反而混淆
    //   user 走 SortManager panel 看完整 priority(SSOT)
    //   1 sort 仍秀 arrow(完整資訊);0 sort 自然不秀(canSort && sortDir 短路)
    const isMultiSort = (table.getState().sorting?.length ?? 0) > 1
    const SortIcon = sortDir === 'asc' ? ArrowUp : ArrowDown // 未套不渲染;套用後二擇一
    const sortHandler = canSort ? header.column.getToggleSortingHandler() : undefined
    return (
      <div
        key={header.id}
        role="columnheader"
        aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
        className={cn(
          // **Inline action canonical**(2026-05-05 v2):header 用 `flex items-center gap-2`
          // (= 8px,inline-action.spec.md SSOT),more action 為 inline shrink-0 sibling 而非
          // absolute → hover 顯時佔位 → label 自動讓出空間給 sort + more,**不再重疊**(對齊
          // user 圖示質疑 + Notion / Airtable header layout 共識)。
          // cell padding 12px 由外層 cellPadding style 提供 → more 距 cell 右邊 = 12px。
          'group relative flex items-center gap-2 text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none',
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
        )}
        style={{ ...columnSizeStyle(header.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(header.column.id) }), ...cellPadding }}
      >
        {/* 左區:label + sort indicator(整區 click → toggle sort;Shift+click 加 secondary,enableMultiSort 啟用時) */}
        <div
          role={canSort ? 'button' : undefined}
          tabIndex={canSort ? 0 : undefined}
          onClick={sortHandler}
          // any-allow: event-cast — TanStack getToggleSortingHandler 內部會 narrow,接受 KeyboardEvent
          onKeyDown={canSort ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortHandler?.(e as any) } } : undefined}
          className={cn(
            'flex items-center min-w-0 flex-1 gap-1 outline-none',
            canSort && 'cursor-pointer hover:text-foreground transition-colors',
            canSort && 'focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm',
          )}
        >
          <TruncateCell className={cn('min-w-0', align === 'right' && 'text-right', align === 'center' && 'text-center')}>
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </TruncateCell>
          {canSort && sortDir && !isMultiSort && (
            <SortIcon size={14} aria-hidden className="shrink-0 text-fg-secondary" />
          )}
        </div>
        {/* 右區:⌄ menu(hover/focus-within 才顯;**不顯示時不佔位**)
            **Layout canonical**(2026-05-06 v3 user explicit rule):`hidden` default →
            `group-hover:inline-flex` / `group-focus-within:inline-flex` / `has-[[data-state=open]]:inline-flex`
            才出現 + 佔位。前 v2 用 `opacity-0 group-hover:opacity-100` 是「永遠佔位 hover 才顯影」—
            user 報「不應永遠佔位,沒顯示時應讓 label 多空間」。新行為:
            - 不顯示 → display:none → 不佔位 → label 取得整個 header width
            - hover/focus/menu-open → display:inline-flex → 佔位(width 同前;label 自然 truncate 讓位)
            對齊 Notion(hover-row reveal action,inline action 不佔靜態 layout)/ Linear / Airtable。
            ItemInlineActionButton asChild-compatible,size="md" 因 header 不在 RowSizeProvider。 */}
        <div className="shrink-0 hidden group-hover:inline-flex group-focus-within:inline-flex has-[[data-state=open]]:inline-flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ItemInlineActionButton
                icon={ChevronDown}
                size="md"
                aria-label={`${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id} 欄位選單`}
                overlayTrigger
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSort && (
                <>
                  <DropdownMenuItem startIcon={ArrowUp} onClick={() => header.column.toggleSorting(false, false)}>升冪排序</DropdownMenuItem>
                  <DropdownMenuItem startIcon={ArrowDown} onClick={() => header.column.toggleSorting(true, false)}>降冪排序</DropdownMenuItem>
                  {sortDir && !isMultiSort && <DropdownMenuItem startIcon={XIcon} onClick={() => header.column.clearSorting()}>取消排序</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                </>
              )}
              {onColumnFilterTrigger && (
                <DropdownMenuItem startIcon={FilterIcon} onClick={() => onColumnFilterTrigger(header.column.id)}>依此欄篩選…</DropdownMenuItem>
              )}
              {header.column.getCanHide() && (
                <DropdownMenuItem startIcon={EyeOff} onClick={() => header.column.toggleVisibility(false)}>隱藏欄位</DropdownMenuItem>
              )}
              {/* 2026-05-06 v11:Auto-fit 放 more menu(不綁 double-click,避免跟 click-to-sort 衝突)。
                  scan column body cells max scrollWidth + cellPadding → reset column.size。
                  System columns 永遠 fixed 不顯此 item。 */}
              {enableColumnResize && !isSystemColumn(header.column.id) && (
                <DropdownMenuItem
                  startIcon={ArrowUpDown}
                  onClick={() => {
                    const cells = document.querySelectorAll<HTMLElement>(
                      `[role="cell"][data-column-id="${header.column.id}"]`,
                    )
                    let max = MIN_COLUMN_WIDTH
                    cells.forEach(c => {
                      const inner = c.firstElementChild as HTMLElement | null
                      const w = (inner?.scrollWidth ?? c.scrollWidth) + 32 // + cellPadding 兩側 + buffer
                      if (w > max) max = w
                    })
                    header.column.resetSize?.()
                    table.setColumnSizing(prev => ({ ...prev, [header.column.id]: max }))
                    onColumnResize?.(header.column.id, max)
                  }}
                >
                  自動調整寬度
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Header divider — 同時擔任 column resize handle(2026-05-06 v11):
            - 視覺:1px line `bg-divider` 永遠 visible(顯示 grid line)
            - Hot zone:absolute padding 4px 兩側,讓 mouse 容易 hit(invisible)
            - Hover:`bg-border-hover` 顏色加深(對齊 DS 一致語言「hover 永遠是顏色變化不加粗」)
            - Active(drag 中):`bg-primary` 信號 user 正在 resize
            - cursor: col-resize(可 resize 時)/ default(system column 或 enableColumnResize=false)
            - System columns 不啟動 resize listener(永遠 fixed)
            - role="separator" + aria-orientation="vertical" 對齊 WAI-ARIA */}
        {showDivider && (() => {
          const colId = header.column.id
          const isResizable = enableColumnResize && !isSystemColumn(colId)
          const isResizing = header.column.getIsResizing?.()
          // v13.2 visual fix:hot zone 7px straddle cell.right(invisible 易 hit),內 1px 線
          // **絕對定位 right-[3px]**(從 outer span 右側 3px,即 cell.right - 1)→ 視覺 1px 在 cell 內側右邊,
          // 對齊既有 grid divider 位置。前 v11 用 `flex justify-end` 把 1px 線放在 outer span 右端 →
          // cell.right + 2 px 處 → 被 cell.overflow-hidden 切掉 → user 看不到分隔線。
          return (
            <span
              role={isResizable ? 'separator' : undefined}
              aria-orientation={isResizable ? 'vertical' : undefined}
              aria-label={isResizable ? '拖曳調整欄寬' : undefined}
              className={cn(
                'group/resize absolute top-0 bottom-0 right-0 -mr-[3px] w-[7px]',
                isResizable && 'cursor-col-resize select-none',
              )}
              onMouseDown={isResizable ? header.getResizeHandler?.() : undefined}
              onTouchStart={isResizable ? header.getResizeHandler?.() : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute right-[3px] w-px transition-colors',
                  isResizing
                    ? 'bg-primary'
                    : isResizable
                      ? 'bg-divider group-hover/resize:bg-[var(--border-hover)]'
                      : 'bg-divider',
                )}
                style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }}
              />
            </span>
          )
        })()}
      </div>
    )
  }

  // ── Region helpers ──
  // hoist region id Sets 一次,避免 n_rows × n_regions 重建(virtual mode 1000+ rows 場景效益顯著)
  const leftIds = React.useMemo(() => new Set(leftCols.map(c => c.id)), [leftCols])
  const centerIds = React.useMemo(() => new Set(centerCols.map(c => c.id)), [centerCols])
  const rightIds = React.useMemo(() => new Set(rightCols.map(c => c.id)), [rightCols])
  const colsToIds = (cols: Column<TData, unknown>[]) =>
    cols === leftCols ? leftIds : cols === rightCols ? rightIds : centerIds

  const getRegionHeaders = (cols: Column<TData, unknown>[]) => {
    const ids = colsToIds(cols)
    return table.getHeaderGroups()[0]?.headers.filter(h => ids.has(h.id)) ?? []
  }

  const getRegionCells = (row: typeof rows[number], cols: Column<TData, unknown>[]) => {
    const ids = colsToIds(cols)
    return row.getVisibleCells().filter(c => ids.has(c.column.id))
  }

  // 2026-05-06 v14.4 Notion blue line drop indicator(column reorder visual canonical)
  // 必須宣告在 renderHeaderRow 之前(closure 引用,避 minified bundler TDZ false-positive)
  const [dropIndicator, setDropIndicator] = React.useState<{ id: string; side: 'before' | 'after'; type: 'row' | 'column' } | null>(null)
  // ref for stable lookup in handleDragOver(避免 closure 抓舊值)
  const reorderableColumnIdsRef = React.useRef<string[]>([])

  // ── Render header row for a region ──
  const renderHeaderRow = (cols: Column<TData, unknown>[], isRight: boolean) => {
    const headers = getRegionHeaders(cols)
    // a11y(2026-04-25 axe aria-required-children):若 region 無 visible cells(只有
    // invisible rowActions placeholder 或 region 本身空),不設 role='row' — 改為純
    // layout div,避免 axe 抓到「row 無 cell/columnheader 子元素」violation。
    const hasVisibleChildren = headers.length > 0
    const RowTag = hasVisibleChildren ? 'div' : 'div'
    const rowRole = hasVisibleChildren ? 'row' : undefined
    return (
      <RowTag role={rowRole} className={cn('flex items-center border-b border-divider', rowHeight, HEADER_BG)}>
        {headers.map((h, i) => {
          const showDivider = i < headers.length - 1 && !(isRight && i === headers.length - 1)
          const colId = h.column.id
          const meta = h.column.columnDef.meta as { locked?: boolean } | undefined
          const isLocked = meta?.locked === true
          const isSystem = isSystemColumn(colId)
          // useSortable per header(Rules of Hooks compliant — same hook count per render
          // as long as headers count consistent;column reorder/hide 整 row reflow 自然觸發 React reconcile)。
          // disabled=true 時仍 call hook 不啟動 listeners。
          const isDraggable = enableColumnReorder && !isLocked && !isSystem
          const indicatorSide = dropIndicator?.type === 'column' && dropIndicator.id === colId ? dropIndicator.side : null
          return (
            <DraggableHeaderCell
              key={h.id}
              id={colId}
              disabled={!isDraggable}
              isLocked={isLocked}
              dropIndicatorSide={indicatorSide}
            >
              {headerCellEl(h, showDivider)}
            </DraggableHeaderCell>
          )
        })}
        {isRight && hasRowActions && (
          <div className="flex items-center justify-end shrink-0 gap-2 invisible" aria-hidden="true" style={cellPadding}>
            {/* 渲染一個假 row 的 actions 來佔位,確保 header 和 body 同寬(aria-hidden 避免 screen reader 讀出 invisible 內容)*/}
            {rows[0] && rowActions!(rows[0].original)}
          </div>
        )}
      </RowTag>
    )
  }

  // ── Render body rows for a region ──
  const renderBodyRows = (cols: Column<TData, unknown>[], isCenter: boolean, isRight: boolean, regionWidth?: number) => {
    if (isEmpty && isCenter) {
      // 有框容器 → 垂直置中(design principle)
      if (emptyState && typeof emptyState !== 'string') return <div className="flex-1 flex items-center justify-center py-12">{emptyState}</div>
      return <div className="flex-1 flex items-center justify-center py-12"><Empty description={typeof emptyState === 'string' ? emptyState : '沒有資料'} /></div> // i18n-allow: DS default fallback; consumer override via emptyState prop
    }
    if (isEmpty) return null

    // **v15.4 architectural decision** — primary 永遠 = center region(不論是否 pinnedLeft)。
    // 之前 `primary = left if hasLeft else center` 有兩問題:
    //   1. multi-instance same-id 是 dnd-kit anti-pattern,setActivatorNodeRef 救不了
    //      (last-mount-wins,用 last region 的 rect 當 activator → ghost 起點偏離 cursor)
    //   2. user 從 center 主視覺 grab 才直觀;pinned-left(SKU)/ pinned-right(Updated)
    //      是「鎖定欄」語意,不是 drag handle。Linear / Notion / Jira 的 pinned column
    //      都不接 drag listeners,純視覺鎖。
    // 改 center-only listeners → ghost activator = center row → cursor 跟 ghost 維持初始
    // 相對位置(SSOT 對齊 user directive)。
    const isPrimaryRegion = isCenter
    const regionRole: 'primary' | 'mirror' = isPrimaryRegion ? 'primary' : 'mirror'

    const rowEl = (row: typeof rows[number], idx: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
      const showBorder = bordered !== false ? !opts?.isLast : true
      // L4 row drag v2:nested rows 也 sortable(配合 cross-parent collisionDetection 過濾)
      // sub-rows: depth>0 仍進 SortableContext,但 collisionDetection 只接受 same-parent over
      const isThisRowDragging = enableRowDrag && activeDragId === row.id
      const useSortableWrap = enableRowDrag

      // L4 row drag:handle absolute 貼齊 row 左 border(Jira canonical),不佔 column 空間。
      // 只在 primary region(left 若有,否則 center)+ depth===0 render — RowDragHandle
      // 內部再用 ctx.role === 'primary' 守門避免 mirror region 重複 render。
      const showDragHandle = enableRowDrag && (row.depth ?? 0) === 0 && isPrimaryRegion
      // v15.2 SSOT 對齊 TreeView:drag 期間 suppress 全表 hover state
      // (user directive「drag 時 row 不應 hover / drag button 不應出現」)
      const anyDragActive = activeDragId != null
      const baseRowDiv = (extra?: { ref?: (el: HTMLElement | null) => void; style?: React.CSSProperties; isDragging?: boolean; listeners?: Record<string, unknown>; attributes?: Record<string, unknown> }) => (
        <div
          key={row.id}
          ref={(el) => {
            // v2 fix #1:被拖 row 略過 measureElement(transform 干擾測量,長 list 累積誤差)
            // v2 fix #4(virtual freeze):drag 進行中(activeDragId != null)整個略過 measureElement
            // **2026-05-07 v15.17 A 路徑 — revert autoRowHeight guard**:
            //   v15.8 加 `&& autoRowHeight` guard 為了解 R4 mount-time row growth animation
            //   (假設 measureElement 在 fixed mode 觸發 getTotalSize 重算 → React re-render →
            //   mount 時看起來 row height 在變)。但 codex P2 audit (`6d5188e` line 1699)指出
            //   此 guard 副作用:consumer 傳 custom `estimateRowHeight` 或 CSS theme override
            //   row height 時,fixed mode 不再 reconcile estimate vs reality → getTotalSize 錯
            //   → scroll 範圍截斷或末端留白。
            //
            //   Codex deep R4 eval (`4399272774` follow-up reply) 認為 R4 真因更可能是
            //   「首幀樣式未齊 / 字型 async load / paint stagger」,不是 measureElement。
            //   故先 revert guard 觀察 R4 是否真回歸:
            //   - R4 不重現(我 + codex 推論對)→ guard mis-fix,永久撤,P2 自動解
            //   - R4 重現(measureElement 真因)→ 補 dampening (差異 <1px 不 setState /
            //     一幀只 update 一次)+ low-freq sampling per codex 雙模式方案
            if (isCenter && opts?.virtual && el && !isThisRowDragging && activeDragId == null) {
              virtualizer.measureElement(el)
            }
            extra?.ref?.(el)
          }}
          data-index={isCenter && opts?.virtual ? idx : undefined}
          data-row-index={idx}
          data-sortable-row-id={enableRowDrag ? row.id : undefined}
          // v15.4:primary region(center)= drag source row — ghost reconstruction 用此 marker
          // 找 source row(避免 multi-region 場景挑錯 region 的 row 當 ghost)
          data-row-drag-source={enableRowDrag && isPrimaryRegion ? 'true' : undefined}
          role="row"
          aria-rowindex={idx + 2}
          className={cn(
            'group/row flex relative',
            autoRowHeight ? 'items-start' : 'items-center',
            !autoRowHeight && rowHeight,
            !autoRowHeight && 'overflow-hidden',
            opts?.virtual && 'absolute w-full',
            showBorder && 'border-b border-divider',
            // v15.3 hover bg canonical:hover class 永遠生效,但 onMouseOver delegate
            // 在 drag 期間只允許 source row 寫 data-hovered → 其他 row 自然不顯 bg。
            // (對齊 Linear / Jira:source 維持 active 視覺,其他 row 完全靜止)
            'transition-colors data-[hovered]:bg-neutral-hover',
            extra?.isDragging && 'bg-neutral-hover',
            // **v15.3.1**:不變 cursor(對齊 Material / Carbon / Polaris / Notion canonical)。
            // 整列可拖的 affordance 由可見的 RowDragHandle Button 提供,不靠 cursor 暗示。
            // 之前 cursor-grab → drag 中 user 看到 cursor 變化反而干擾 indicator+ghost 的視覺焦點。
          )}
          style={{
            ...(opts?.virtual ? { transform: `translateY(${opts.start}px)` } : {}),
            ...(extra?.style ?? {}),
          }}
          {...hoverProps(idx)}
          {...(extra?.attributes ?? {})}
          {...(extra?.listeners ?? {})}
        >
          {showDragHandle && <RowDragHandle disabled={dragDisabled} anyDragActive={anyDragActive} />}
          {/* 2026-05-06 v14.6 row drop indicator(SSOT 對齊 TreeView):水平 2px primary line at top/bottom edge */}
          {dropIndicator?.type === 'row' && dropIndicator.id === row.id && dropIndicator.side === 'before' && (
            <div className={dropIndicatorRow.before} aria-hidden />
          )}
          {getRegionCells(row, cols).map((cell, ci, arr) => cellEl(cell, ci === arr.length - 1 && !(isRight && hasRowActions)))}
          {isRight && hasRowActions && (
            <div role="cell" className="flex items-center justify-end shrink-0 gap-2 flex-1" style={cellPadding}>
              {rowActions!(row.original)}
            </div>
          )}
          {dropIndicator?.type === 'row' && dropIndicator.id === row.id && dropIndicator.side === 'after' && (
            <div className={dropIndicatorRow.after} aria-hidden />
          )}
        </div>
      )

      if (useSortableWrap) {
        // invalidDrop 只對「正在被拖」的 row 顯示 — handle 在 active row 上,UI 警示只需該 row
        const rowInvalidDrop = isThisRowDragging && invalidDropActive
        return (
          <SortableRowProvider key={row.id} id={row.id} disabled={dragDisabled} role={regionRole} invalidDrop={rowInvalidDrop}>
            {(ctx) => baseRowDiv({
              // mirror 也掛 setNodeRef — dnd-kit 內部以 hook instance 為單元,
              // 多 instance 同 id 時,measurement 走最後 mount 的;不影響 transform 一致性
              ref: ctx.setNodeRef,
              style: ctx.style,
              isDragging: ctx.isDragging,
              // v15.2 整列可拖:listeners + attributes spread 在 row div 上(只 primary,
              // mirror region 沒 listeners 避免 a11y 重複 announce / pointer 雙觸發)
              listeners: ctx.rowListeners,
              attributes: ctx.rowAttributes,
            })}
          </SortableRowProvider>
        )
      }
      return baseRowDiv()
    }

    // AR44 canonical(2026-04-21):virtual / non-virtual 都用 `minWidth: colsWidth` 的 wrapper,
    // 讓兩種 rendering path 的 **水平 overflow 行為一致** — 中段 column 區塊都會因
    // columns 實際寬度超過 centerBody 可用寬而觸發 H scrollbar。
    // 先前 non-virtual 走 `<>...</>`(無 wrapper),依靠 row 內 cells 自然寬推擠容器,
    // 跟 virtual 的 `minWidth: containerWidth` 行為不同,造成 story 1 / story 2 看起來水平
    // 捲軸出現時機不一致。現在統一靠 wrapper 的 minWidth 強制 overflow。
    const colsWidth = cols.reduce((a, c) => a + c.getSize(), 0)
    const containerWidth = regionWidth || colsWidth

    if (useVirtual) {
      return (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: containerWidth }}>
          {virtualizer.getVirtualItems().map(vr => rowEl(rows[vr.index], vr.index, { virtual: true, start: vr.start, isLast: vr.index === rows.length - 1 }))}
        </div>
      )
    }
    return (
      <div style={{ minWidth: containerWidth }}>
        {rows.map((row, i) => rowEl(row, i, { isLast: i === rows.length - 1 }))}
      </div>
    )
  }

  // Single mode 用 RadioGroup wrap 整 table(Radix RadioGroup 用 context 傳遞 value/onValueChange)
  // Multi mode 不需 wrap(Checkbox 各自 controlled,不靠 context)
  const tableContent = (
    <div
      ref={(el) => { tableRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el }}
      data-table-size={size}
      data-data-table-outer  // anchor for RowDragHandle Portal getBoundingClientRect (M25 invariant: outer 一定存在)
      className={cn(dataTableVariants({ bordered }), isFillHeight && 'flex flex-col', className)}
      // isFillHeight:`maxHeight: 100%`(不是 height:100%)— content 小 → outer = intrinsic
      // (hug rows);content 大或 window 縮 < content → outer cap 到 100% of parent。
      // 行為:**永遠 hug rows**,只在被約束時才 cap + body shrink + V scroll。
      // 簡單需求:有約束 → rows 沒超就 hug;超就 cap+scroll;RWD 同理。
      style={isFillHeight ? { maxHeight: height } : undefined}
      role="table" aria-rowcount={rows.length + 1}
      tabIndex={enabled ? 0 : undefined}
      onKeyDown={enabled ? tableKeyboardHandler : undefined}
      onMouseOver={enterLeaveHandlers.onMouseOver}
      onMouseOut={enterLeaveHandlers.onMouseOut}
      {...props}
    >
      {/* ══ HEADER（固定頂部，不在 scroll 內）══ */}
      <div role="rowgroup" className="flex">
        {hasLeft && (
          <div ref={leftHeaderRef} className="shrink-0 overflow-hidden border-r border-divider">
            {renderHeaderRow(leftCols, false)}
          </div>
        )}
        {/* Header 的 center 區保持 overflow-hidden(非 scroll)—— body 的 center 才有 scroll,
            header 靠 JS 同步 scrollLeft(見 onCenterBodyScroll)。這樣不會出現雙 scrollbar。
            為了對齊 body 的 V scrollbar(native 捲軸吃 ~15-17px 寬),header 等寬預留 gutter:
            `scrollbar-gutter: stable` 放在 centerBody(真正有 V scroll 的 container)+
            header 這層不需額外處理,因為 body 預留了空間後 H 內容寬度會自然等同 header。
            注意:header 的 `scrollbar-gutter` 無效(因為 overflow-hidden),刻意不設 */}
        <div
          ref={centerHeaderRef}
          className="flex-1 min-w-0 overflow-hidden"
        >
          {/* 2026-05-06 v13.1:retire `w-max min-w-full` — 改 `style={{minWidth: centerColsWidth}}`
              跟 body inner wrapper 同 SSOT。前 `w-max` 讓 header content max-content(label 短)
              vs body content max-content(Note 長 break-words)diverge → header / row width 不對齊 76px。
              統一 minWidth 公式後兩者永遠等寬,cells flex 均分結果一致。 */}
          <div style={{ minWidth: centerColsWidth }}>
            {renderHeaderRow(centerCols, false)}
          </div>
        </div>
        {hasRight && (
          <div ref={rightHeaderRef} className="shrink-0 overflow-hidden border-l border-divider">
            {renderHeaderRow(rightCols, true)}
          </div>
        )}
      </div>

      {/* ══ BODY(AG Grid 流派:各 region 自己 V scroll + JS 同步)══
           AR44 user-reported UX fix:H scrollbar 現在落在 center-body 的 visible 底部(不是 1800px 內容底部)。
           三個 region(left / center / right)各自 maxHeight + overflowY,JS 同步 scrollTop。
           Pinned 區 overflow-y:hidden(看不到自己的 V scrollbar),V scroll 真正發生在 center。
           isFillHeight 時 body div 加 min-h-0 讓它在 outer flex column 內可被 flex shrink — region maxHeight: 100% 才能 bind 到實際分配的高度。 */}
      {/* body 在 isFillHeight 用 `min-h-0 min-w-0`(**不**用 flex-1)。
          flex-1 會強制 body 撐滿 outer = 不 hug content。預設 `flex: 0 1 auto` + min-h-0 =
          body intrinsic = content,被 outer maxHeight 約束時可 shrink 到 outer 分配空間。
          centerBody.maxHeight 用 JS 算 px(bypass CSS % flex 場景 buggy shrink)。 */}
      <div ref={bodyRef} className={cn('flex items-start', isFillHeight && 'min-h-0 min-w-0')}>
        {hasLeft && (
          <div
            ref={leftBodyRef}
            className="shrink-0 overflow-hidden border-r border-divider"
            style={{
              width: leftWidth || undefined,
              // isFillHeight 用 JS 算的 px;固定 px(300px 等)直接套
              ...(isFillHeight && bodyMaxHeight != null ? { maxHeight: bodyMaxHeight } : hasHeightConstraint ? { maxHeight: height } : {}),
            }}
          >
            {renderBodyRows(leftCols, false, false, leftWidth)}
          </div>
        )}
        <div
          ref={centerBodyRef}
          // Center body 同時擁有 H + V scroll;maxHeight 限制讓 H scrollbar 落在 visible 底部
          // `scrollbar-gutter: stable` 永遠預留 V scrollbar 寬度(~15-17px),避免 body 出現 V
          // scrollbar 時右端被縮,跟 header 右端產生 gap(Windows/Linux native scrollbar 吃寬)
          data-datatable-hscroll
          // overflow-x/y: auto — 沒 overflow 就不顯 bar。wrapper minWidth 仍 trigger H 真 overflow。
          // **不**用 scrollbar-gutter: stable — 那會永遠保留 V 軸 15px 空間,
          // content fit 時看起來像「永遠有 V 捲軸」(Image #5 bug)。
          // trade-off:V scroll 出現時 body 內側少 15px,header 不縮 → 右端微 misalign,
          // 但 content fit 視覺乾淨優先(Mac 用戶 overlay scrollbar 不可見)。
          className="flex-1 min-w-0 overflow-x-auto overflow-y-auto"
          // isFillHeight:用 JS 算的 px(bodyMaxHeight),bypass CSS % 在 flex 場景的不可靠 shrink。
          // 固定 px(300px etc):直接套 height。
          style={
            isFillHeight && bodyMaxHeight != null
              ? { maxHeight: bodyMaxHeight }
              : hasHeightConstraint
                ? { maxHeight: height }
                : undefined
          }
          onScroll={onCenterBodyScroll}
        >
          {/* 2026-05-06 v13.1:retire `w-max min-w-full` — 改 `style={{minWidth: centerColsWidth}}`
              跟 header inner wrapper 同 SSOT。renderBodyRows 內部已用同 containerWidth 公式 wrap rows,
              此外層 wrapper minWidth 跟內層一致 = 兩層都 = centerColsWidth → header / body 對齊。 */}
          <div style={{ minWidth: centerColsWidth }}>
            {renderBodyRows(centerCols, true, false)}
          </div>
        </div>
        {hasRight && (
          <div
            ref={rightBodyRef}
            className="shrink-0 overflow-hidden border-l border-divider"
            style={{
              width: rightWidth || undefined,
              ...(isFillHeight && bodyMaxHeight != null ? { maxHeight: bodyMaxHeight } : hasHeightConstraint ? { maxHeight: height } : {}),
            }}
          >
            {renderBodyRows(rightCols, false, true, rightWidth)}
          </div>
        )}
      </div>
    </div>
  )

  // ── L4 Row drag DnD wrapper ───────────────────────────────────────────────
  // Sensors:Pointer(8px activation distance,避免 cell click 誤觸 drag)+ Keyboard(a11y)
  // SortableContext items:**只 top-level row id**(nested sub-rows 不在 sortable 集合);
  // 同 parent level 限制由「sub-rows 不在 items 內」自然成立。
  // DragEnd:active.id / over.id → 算 position(active vs over 視覺位置),呼叫 onRowReorder。
  // hooks 必呼叫(rules-of-hooks)— 即使 enableRowDrag=false 也走 useSensors;wrap 才條件化。
  // **codex P1 fix(2026-05-07 v15.13)**:KeyboardSensor 不傳 `coordinateGetter`,用
  // dnd-kit 預設 25px 箭頭 stepping。`sortableKeyboardCoordinates` 是 `@dnd-kit/sortable`
  // preset,需 `<SortableContext>` 才正確 resolve 下一個 sortable target — 但 v15.0
  // path B 已 explicit 砍 SortableContext 改用 useDraggable+useDroppable(line 21),
  // 此 getter 在無 context 下 keyboard nav 無法 reliable resolve target → keyboard
  // drag/reorder regression。Default getter(arrow-key Δ25px)在 useDraggable 場景是
  // dnd-kit canonical(`@dnd-kit/core/src/sensors/keyboard/defaults.ts` 預設行為)。
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // **2026-05-06 v14.8 collision detection canonical(對齊 dnd-kit official best practice)**:
  // 從 closestCenter 換 `pointerWithin + rectIntersection` composite。
  // **Why**:closestCenter 永遠返回最近 droppable → over 永遠非 null → 釋放任何位置都觸發
  // onRowReorder 強制 reorder(user 報「拉動就強制 reorder 不能 snap back」)。
  // pointerWithin 要求 pointer 真在 droppable rect 內才返回 → release 在 gap 自然 over=null →
  // 不觸發 reorder → snap back 自然成立(對齊 Notion / TreeView 行為)。
  // rectIntersection fallback 給 keyboard sensor(無 pointer)。
  // 詳 .claude/references/drag-canonical.md。
  const sameParentCollisionDetection: CollisionDetection = React.useCallback((args) => {
    const activeId = args.active?.id != null ? String(args.active.id) : null
    if (!activeId) {
      const pointer = pointerWithin(args)
      return pointer.length > 0 ? pointer : rectIntersection(args)
    }
    // **v15.8 Bug 2 fix**(對齊 user「PRD-004 拉起儘管同位置放開後一定 reorder」):
    // 預設 dnd-kit `pointerWithin` 排除 active 自身,fallback `rectIntersection` 找最近
    // next row → cursor 仍在 source row 內 但 over=next row → reorder 觸發。
    // Fix:cursor 仍在 source row vertical range 內 → return [](no over → no indicator
    // → onDragEnd over=null → noop)。User 必須 cursor 真正離開 source row vertical 範圍
    // 才視為「想 reorder」,對齊 user 的「沒動就不該 reorder」直覺。
    const activeRect = args.active?.rect.current.initial
    const cursor = args.pointerCoordinates
    if (cursor && activeRect && cursor.y >= activeRect.top && cursor.y <= activeRect.bottom) {
      return []
    }
    const activeParent = parentMap.get(activeId)
    // 過濾 droppable container collection — 只保留 same parent siblings(且不含 active 本身)
    const filtered = args.droppableContainers.filter(c => {
      const cid = String(c.id)
      if (cid === activeId) return false
      const cParent = parentMap.get(cid)
      if (cParent === undefined) return false // 非 row droppable
      return cParent === activeParent
    })
    const filteredArgs = { ...args, droppableContainers: filtered }
    const pointer = pointerWithin(filteredArgs)
    if (pointer.length > 0) return pointer
    // **v15.8 fix**(virtualized list dnd-kit droppableRects stale issue):
    // virtualized rows position 由 virtualizer transform:translateY 動態套,但 dnd-kit
    // measure droppable 在 mount 瞬間(rows 還沒 transform → 全 rect at top=100)+ 不
    // re-measure(MeasuringStrategy.Always 沒效)→ stale rects → rectIntersection 永遠
    // 0 over。Fix:fallback 用 cursor.y 對 DOM querySelector 找 row whose live
    // boundingClientRect 包含 cursor.y(同 parent siblings,排除 active)。
    if (cursor) {
      // **codex P2 fix(2026-05-07)**:scope 到 active table root + 同時驗 X 邊界。
      // 之前 document-wide query + cursor.y-only match → 多 DataTable 同頁(side-by-side
      // panels with overlapping Y ranges)會把 cursor 不在當前 table 卻 Y 帶相同的 row
      // 認成 over,觸發錯誤 reorder indicator/commit。Fix:limit 到 tableRef.current 的
      // sortable rows + 同時驗 cursor 在 row's X bounds 內。
      const tableScope = tableRef.current ?? document
      const liveRows = Array.from(tableScope.querySelectorAll<HTMLElement>('[role="row"][data-sortable-row-id]'))
        .filter(el => el.dataset.sortableRowId !== activeId)
        .filter(el => {
          const cParent = parentMap.get(el.dataset.sortableRowId ?? '')
          return cParent === activeParent
        })
      for (const el of liveRows) {
        const r = el.getBoundingClientRect()
        if (
          cursor.y >= r.top && cursor.y <= r.bottom &&
          cursor.x >= r.left && cursor.x <= r.right
        ) {
          const rowId = el.dataset.sortableRowId
          const cont = filtered.find(c => String(c.id) === rowId)
          if (cont) return [{ id: cont.id, data: { droppableContainer: cont, value: 0 } }]
        }
      }
    }
    return rectIntersection(filteredArgs)
  }, [parentMap])

  // 2026-05-06 v10 DragOverlay canonical:drag start 時 snapshot source row outerHTML(strip
  // absolute / transform / opacity / data-* + reset width to natural width)→ render in
  // DragOverlay portal。Source row scroll out-of-viewport unmount 也不影響(canvas 視覺已 detach)。
  // 移除 windowed sticky range extractor — 不再需要 mount-pin source row,DragOverlay decoupled。
  // Atlassian / dnd-kit canonical:「If your useDraggable items are within a virtualized list,
  // you will absolutely want to use a drag overlay, since the original drag source can unmount
  // while dragging as the virtualized container is scrolled.」(GitHub #1674 / docs/api-documentation/draggable/drag-overlay)
  const [dragOverlayHtml, setDragOverlayHtml] = React.useState<string | null>(null)
  const [dragOverlayWidth, setDragOverlayWidth] = React.useState<number | null>(null)
  // 2026-05-06 v11:column reorder 共用 drag overlay state — `dragType` 區分 row vs column
  // **v15.9 移除 dragType state**:之前用來條件套 row drag modifier,現在三 scenario
  // 都無 modifier(SSOT 一致),drag type 只在 handler 內部用 active.data.current.type 取即可。
  const [, setActiveDragColId] = React.useState<string | null>(null)
  const handleDragStart = React.useCallback((e: { active: { id: string | number; data: { current?: { type?: 'row' | 'column'; columnId?: string } } } }) => {
    const id = String(e.active.id)
    const type = e.active.data?.current?.type ?? 'row'
    setInvalidDropActive(false)
    // v15.3:drag 啟動清掉非 source row 的 data-hovered(避免其他 row 殘留 hover bg + drag button)。
    // **保留 source row 的 hover** — 對齊 Linear / Jira「source 維持 active 視覺」world-class canonical。
    if (type === 'row') {
      tableRef.current?.querySelectorAll<HTMLElement>('[data-hovered]').forEach((el) => {
        const rowId = el.dataset.sortableRowId
        if (rowId !== id) delete el.dataset.hovered
      })
    } else {
      tableRef.current?.querySelectorAll<HTMLElement>('[data-hovered]').forEach((el) => delete el.dataset.hovered)
    }
    if (type === 'column') {
      // Column drag:snapshot header cell visual,strip transform/inline-styles
      const colId = e.active.data?.current?.columnId ?? id
      setActiveDragColId(colId)
      const headerEl = document.querySelector<HTMLElement>(`[role="columnheader"][data-column-id="${colId}"]`)
      if (headerEl) {
        const clone = headerEl.cloneNode(true) as HTMLElement
        clone.style.position = 'static'
        clone.style.transform = 'none'
        clone.style.transition = 'none'
        clone.style.opacity = '1'
        clone.style.zIndex = ''
        clone.style.width = `${headerEl.offsetWidth}px`
        // Strip resize handle clone(避免重複疊在 overlay 上)
        clone.querySelectorAll('[role="separator"][aria-orientation="vertical"]').forEach(n => n.remove())
        setDragOverlayHtml(clone.outerHTML)
        setDragOverlayWidth(headerEl.offsetWidth)
      }
    } else {
      setActiveDragId(id)
      // **v15.4 SSOT**:reconstructFullRowGhost 跨 pinned 區域(left/center/right)
      // 重組完整 row ghost,確保 cursor 在 ghost 內部維持與 mousedown 時相對位置一致
      // (對齊 user directive「ghost 跟 cursor 維持固定相對位置」+ Linear / Notion / Jira)
      const ghost = reconstructFullRowGhost(id, tableRef.current)
      if (ghost) {
        setDragOverlayHtml(ghost.html)
        setDragOverlayWidth(ghost.width)
      }
    }
  }, [])

  // SSOT helpers `isReorderNoop` + `reconstructFullRowGhost` 已搬到 `lib/drag-visual.ts`
  // —— TreeView / DataTable row / DataTable column drag 三處 consumer 共享同一 invariant。

  const handleDragOver = React.useCallback((e: { active: { id: string | number; data?: { current?: { type?: 'row' | 'column' } } }; over: { id: string | number } | null }) => {
    const { active, over } = e
    if (!active) return
    if (!over) {
      // 無 valid same-parent over → invalid drop signal(配合 v2 cross-parent visual)
      if (!invalidRef.current) setInvalidDropActive(true)
      setDropIndicator(null)
      return
    }
    if (invalidRef.current) setInvalidDropActive(false)
    if (active.id === over.id) { setDropIndicator(null); return }
    // Drop indicator(2026-05-06 v14.6 row + column 統一 SSOT pattern):
    // 用 active vs over 在 sortable items 的相對位置判 before/after。
    // (Notion canonical:source 在 target 之前 → drop after / source 在 target 之後 → drop before)
    const dragType = active.data?.current?.type ?? 'row'
    if (dragType === 'column') {
      const activeIdx = reorderableColumnIdsRef.current.indexOf(String(active.id))
      const overIdx = reorderableColumnIdsRef.current.indexOf(String(over.id))
      if (activeIdx === -1 || overIdx === -1) { setDropIndicator(null); return }
      const side: 'before' | 'after' = activeIdx < overIdx ? 'after' : 'before'
      // **v15.3 noop suppress**:drop position 等同原位 → 不顯 indicator(對齊 handleDragEnd noop guard)
      if (isReorderNoop(activeIdx, overIdx, side)) { setDropIndicator(null); return }
      setDropIndicator({ id: String(over.id), side, type: 'column' })
    } else {
      // Row drag — 用 allRowIds 算位置(只 same-parent siblings,跨 parent collisionDetection 已過濾)
      const activeIdx = allRowIds.indexOf(String(active.id))
      const overIdx = allRowIds.indexOf(String(over.id))
      if (activeIdx === -1 || overIdx === -1) { setDropIndicator(null); return }
      const side: 'before' | 'after' = activeIdx < overIdx ? 'after' : 'before'
      if (isReorderNoop(activeIdx, overIdx, side)) { setDropIndicator(null); return }
      setDropIndicator({ id: String(over.id), side, type: 'row' })
    }
  }, [allRowIds, isReorderNoop])

  const handleDragCancel = React.useCallback(() => {
    setActiveDragId(null)
    setActiveDragColId(null)
    setInvalidDropActive(false)
    setDragOverlayHtml(null)
    setDragOverlayWidth(null)
    setDropIndicator(null)
  }, [])

  // Reorderable column ids(non-locked,non-system) — 用 TanStack runtime visible order
  // **v14.10 fix**:之前用 columnsWithSelection 的 declaration order,user 控的 columnOrder
  // state(tableOptions.state.columnOrder)被忽略 → side('before'/'after')算錯 → drop 落
  // 在錯誤位置(user 報「Stock 移不到 Category/Price 之間」root cause)。
  // 改用 `table.getVisibleLeafColumns()` 拿 live visual order(已套 columnPinning + columnOrder)。
  const reorderableColumnIds = React.useMemo(() => {
    return table.getVisibleLeafColumns()
      .map(c => c.id)
      .filter(id => id && !isSystemColumn(id))
      .filter(id => {
        const meta = table.getColumn(id)?.columnDef.meta as { locked?: boolean } | undefined
        return !meta?.locked
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columnsWithSelection, tableOptions?.state?.columnOrder])
  // Sync ref(handleDragOver closure 抓不到最新 reorderableColumnIds)
  React.useEffect(() => { reorderableColumnIdsRef.current = reorderableColumnIds }, [reorderableColumnIds])

  const handleDragEnd = React.useCallback((e: DragEndEvent) => {
    const { active, over } = e
    const type = (active.data?.current as { type?: 'row' | 'column' } | undefined)?.type ?? 'row'
    setActiveDragId(null)
    setActiveDragColId(null)
    setInvalidDropActive(false)
    setDragOverlayHtml(null)
    setDragOverlayWidth(null)
    setDropIndicator(null)
    if (!over || active.id === over.id) return
    const sourceId = String(active.id)
    const targetId = String(over.id)

    if (type === 'column') {
      // Column reorder:用 reorderableColumnIds 算 before/after
      const oldIdx = reorderableColumnIds.indexOf(sourceId)
      const newIdx = reorderableColumnIds.indexOf(targetId)
      if (oldIdx === -1 || newIdx === -1) return
      const position: 'before' | 'after' = oldIdx < newIdx ? 'after' : 'before'
      // **v15.3 noop guard SSOT**(共用 isReorderNoop helper,跟 handleDragOver 同邏輯,
      // 確保 indicator-suppress + commit-suppress 不漂移)
      if (isReorderNoop(oldIdx, newIdx, position)) return
      onColumnReorder?.(sourceId, targetId, position)
      return
    }

    // Row reorder(原邏輯)
    if (parentMap.get(sourceId) !== parentMap.get(targetId)) return
    const parentId = parentMap.get(sourceId)
    const siblings = allRowIds.filter(id => parentMap.get(id) === parentId)
    const oldIdx = siblings.indexOf(sourceId)
    const newIdx = siblings.indexOf(targetId)
    if (oldIdx === -1 || newIdx === -1) return
    const position: 'before' | 'after' = oldIdx < newIdx ? 'after' : 'before'
    if (isReorderNoop(oldIdx, newIdx, position)) return
    onRowReorder?.(sourceId, targetId, position)
  }, [allRowIds, parentMap, onRowReorder, onColumnReorder, reorderableColumnIds, isReorderNoop])

  // 2026-05-06 v11:column reorder collision detection — drag column 時 droppable filter
  // 只保留 column id(避免 over 觸發 row);drag row 走 sameParent canonical。
  // v14.8:換 pointerWithin + rectIntersection composite(對齊 dnd-kit official canonical)
  // 解 user 報「ghost 出來但 indicator 沒 / 不能 reorder」snap-back 同類問題。
  const dndCollisionDetection: CollisionDetection = React.useCallback((args) => {
    const activeData = args.active?.data?.current as { type?: 'row' | 'column' } | undefined
    if (activeData?.type === 'column') {
      const filtered = args.droppableContainers.filter(c => {
        const cData = c.data?.current as { type?: 'row' | 'column' } | undefined
        return cData?.type === 'column' && c.id !== args.active?.id
      })
      const filteredArgs = { ...args, droppableContainers: filtered }
      const pointer = pointerWithin(filteredArgs)
      return pointer.length > 0 ? pointer : rectIntersection(filteredArgs)
    }
    return sameParentCollisionDetection(args)
  }, [sameParentCollisionDetection])

  const wrapWithDnd = (node: React.ReactNode): React.ReactNode => {
    if (!enableRowDrag && !enableColumnReorder) return node
    return (
      <DndContext
        sensors={dndSensors}
        // **v15.8 fix**:virtualized rows mount/unmount 期間 droppable rect cache stale →
        // rectIntersection 找不到 over → indicator/reorder 不 fire。改 `Always` 每次 collision
        // detection 都 re-measure droppables(SSOT 對齊 dnd-kit virtualized list canonical)。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        collisionDetection={dndCollisionDetection}
        // **v15.11 Ghost-cursor SSOT 復活**:
        // - `snapToCursorModifier`(drag-visual.ts):ghost top-left 永遠對齊 cursor 位置,
        //   保證「ghost 跟 cursor 維持初始 mousedown 時的相對位置」(M17 SSOT idea)。
        //   v15.7 → v15.8 撤回原因是 `rectIntersection` collision 用 transform 後的
        //   active.rect 找不到 over → 拖不動。v15.10 collision 改用 **DOM-based 直查
        //   live row rects(忽略 active.rect)**,modifier 偏移 transform 不再影響
        //   collision detection,可安全再用。
        // - 三 drag scenario(row / column / TreeView)現在都 ghost-跟-cursor 對齊,
        //   user directive「ghost-cursor SSOT」一致。
        modifiers={[snapToCursorModifier]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {/* v15.0 Path B:無 SortableContext(useDraggable + useDroppable 各自獨立,不需 sort context)。
            無 auto-shift visual reorder — source 留原位,indicator 顯 drop preview。 */}
        {node}
        {/* DragOverlay portal — row 跟 column 都用同一個 overlay state(dragOverlayHtml /
            dragOverlayWidth),onDragStart 依 type 截不同 source DOM 寫入 state。 */}
        <DragOverlay dropAnimation={null}>
          {dragOverlayHtml ? (
            <div
              style={{ width: dragOverlayWidth ?? undefined }}
              className="bg-surface-raised shadow-[var(--elevation-200)] rounded-md border border-border pointer-events-none"
              dangerouslySetInnerHTML={{ __html: dragOverlayHtml }}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    )
  }

  if (enabled && mode === 'single') {
    return (
      <RadioGroupPrimitive.Root
        value={selection[0] ?? ''}
        onValueChange={(v) => v && setSelection([v])}
      >
        {wrapWithDnd(tableContent)}
      </RadioGroupPrimitive.Root>
    )
  }
  return wrapWithDnd(tableContent)
}

export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

// any-allow: generic-constrained forwardRef cannot set displayName through typed API without erasing generic
;(DataTable as any).displayName = 'DataTable'
// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dataTableMeta = {
  component: 'DataTable',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-neutral-hover', 'bg-surface'],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { dataTableVariants }
