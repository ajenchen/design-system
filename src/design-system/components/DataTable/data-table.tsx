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
import { ChevronDown, Calendar, Clock, ArrowUp, ArrowDown, Filter as FilterIcon, EyeOff, X as XIcon, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
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
  /** 只 primary 提供 listeners — render 在 __drag__ column body cell */
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
function SortableRowProvider({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style: React.CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1 : undefined,
    position: 'relative',
  }
  const ctxValue: SortableRowCtxValue = {
    setNodeRef,
    role,
    style,
    attributes: attributes as unknown as Record<string, unknown>,
    isDragging,
    handleListeners: role === 'primary' ? (listeners as unknown as Record<string, unknown> | undefined) : undefined,
    handleAttributes: attributes as unknown as Record<string, unknown>,
    invalidDrop,
  }
  return <SortableRowCtx.Provider value={ctxValue}>{children(ctxValue)}</SortableRowCtx.Provider>
}

/** Row drag handle — Portal-rendered, position:fixed 真正水平置中於 table outer border line(Jira canonical)。
 *
 *  Why Portal + position:fixed(2026-05-05 v4):
 *    DataTable 結構含三層 overflow-hidden(outer wrapper / leftBody / row),用 absolute + translate-x:-50%
 *    凸出 row 左 border 會被三層任一裁切。position:fixed escape 所有 ancestor overflow constraint。
 *    座標來自 row.getBoundingClientRect() + table outer.getBoundingClientRect(),scroll/resize 同步。
 *
 *  - 不佔 column 空間;hover-revealed 透過 row.dataset.hovered MutationObserver 觸發
 *  - Button variant="tertiary" iconOnly size="xs"(24px chip)→ bg-surface + border + foreground icon
 *  - 透過 SortableRowCtx 拿 listeners(nested rows 子層 ctx=null → 不 render)
 *  - sort active 時 disabled(visual + listeners 移除 + Tooltip 解釋)
 *  - invalidDrop(cross-parent over)→ cursor-not-allowed + text-error 警示
 *  - drag 進行中(ctx.isDragging)強制可見(即使 cursor 移開 row)*/
function RowDragHandle({ disabled }: { disabled: boolean }) {
  const ctx = React.useContext(SortableRowCtx)
  const [rowEl, setRowEl] = React.useState<HTMLDivElement | null>(null)
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number; visible: boolean } | null>(null)

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
      const isHovered = rowEl.hasAttribute('data-hovered') || !!ctx.isDragging
      setPos({
        top: rRect.top + rRect.height / 2,
        left: tRect.left, // table outer 左 border line position(viewport coords)
        visible: isHovered,
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

  // 永遠 render anchor span(讓 anchorRef 可拿到 row element)
  // ctx 為 null 或 mirror role 時 anchor 仍渲染但不渲 handle Portal
  const anchor = <span ref={anchorRef} aria-hidden style={{ position: 'absolute', width: 0, height: 0 }} />

  if (!ctx || ctx.role !== 'primary' || !pos) return anchor

  const canDrag = !disabled
  const showInvalid = !!ctx.invalidDrop && !!ctx.isDragging

  const handle = (
    <Button
      variant="tertiary"
      iconOnly
      size="xs"
      startIcon={GripVertical}
      aria-label={canDrag ? '拖曳重排此列' : '排序中無法拖曳'}
      aria-disabled={!canDrag || undefined}
      tabIndex={canDrag ? 0 : -1}
      disabled={!canDrag}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        // hover-reveal:opacity 切換取代 visibility(動畫平順)
        opacity: pos.visible ? 1 : 0,
        pointerEvents: pos.visible ? 'auto' : 'none',
        transition: 'opacity 150ms ease',
      }}
      className={cn(
        canDrag && !showInvalid && 'cursor-grab active:cursor-grabbing',
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
  const columnsWithSelection = React.useMemo(() => {
    if (!enabled) return columns
    const selectCol: ColumnDef<TData, any> = {
      id: SELECT_COL_ID,
      size: 40,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,  // selection col 不能藏(L3 column visibility)
      header: 'Select',  // header cell 由下方自訂 render 取代
      cell: () => null,  // body cell 由下方自訂 render 取代
    }
    return [selectCol, ...columns]
  }, [columns, enabled])

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
  })

  const { rows } = table.getRowModel()
  const isEmpty = rows.length === 0
  const hasHeightConstraint = height !== 'auto'
  // Fill-parent mode:height='100%' / '100vh' / 'fill' 等百分比 / 視口語義 → outer flex column + body flex-1 撐滿。
  // 固定 px/rem 仍維持 maxHeight cap 行為(資料少 = 內容高度,資料多 = 上限後 scroll)— 對齊既有 stories 預期。
  const isFillHeight = hasHeightConstraint && /^(100%|100vh|fill)$/.test(height)
  const useVirtual = hasHeightConstraint && !isEmpty
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
  // L4 row drag × virtualization fix(2026-05-05):enableRowDrag 時 overscan 自動拉到 ≥ 10。
  // Root cause:rows scroll out of viewport → 整 row component unmount → useSortable subscription
  // 跟著 unmount → SortableContext.items 還含該 id 但無 sortable instance → dnd-kit transform / collision
  // 在拖到該 id 附近時 stale lookup → 視覺位移 / drop position 錯算。Overscan 拉高讓拖動範圍內
  // 的 rows 全保持 mounted。10 是經驗值(Notion / Airtable virtualized list 也用 10-20 級別)。
  const effectiveOverscan = enableRowDrag ? Math.max(overscan, 10) : overscan
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
    const isConsumerCompound = !colType && React.isValidElement(content)
    return wrap ? <span className="break-words min-w-0">{content}</span>
      : (isKnownCompound || isConsumerCompound) ? content
      : <TruncateCell>{content}</TruncateCell>
  }

  const iconSize = size === 'lg' ? 20 : 16

  // inline edit 指示器:select 類顯示 ChevronDown,date 顯示 Calendar,time 顯示 Clock(Phase C)
  const getEditIndicator = (colType?: ColumnType) => {
    if (!inlineEdit) return null
    if (colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson')
      return <ChevronDown size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
    if (colType === 'date')
      return <Calendar size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
    if (colType === 'time')
      return <Clock size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
    return null
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
          style={{ width: cell.column.getSize(), ...cellPadding }}
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
    const indicator = getEditIndicator(colType)
    // L4 inline edit 整合
    const cellRowId = cell.row.id
    const cellColId = cell.column.id
    const cellEditable = isCellEditable(meta, cell.row.original)
    const isEditingThisCell = editingCellId === cellEditId(cellRowId, cellColId)
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
        className={cn(
          'flex text-foreground text-body font-normal shrink-0 overflow-hidden',
          autoRowHeight ? 'items-start' : 'items-center',
          align === 'right' && 'justify-end text-right',
          align === 'center' && 'justify-center text-center',
          inlineEdit && !isLastInRow && 'border-r border-divider',
          indicator && 'gap-2',
          onEditableCellClick && 'cursor-pointer',
        )}
        style={{ width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize, maxWidth: cell.column.columnDef.maxSize, ...cellPadding }}
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
        <span className={cn('flex-1 min-w-0 flex items-center', align === 'right' && 'justify-end')}>
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
          style={{ width: header.getSize(), ...cellPadding }}
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
          'group relative flex items-center text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none',
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
        )}
        style={{ width: header.getSize(), minWidth: header.column.columnDef.minSize, maxWidth: header.column.columnDef.maxSize, ...cellPadding }}
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
        {/* 右區:⌄ menu(hover/focus-within 顯,reserve = inline-action 排版佔位 16,對齊
            inline-action.spec.md「尺寸對照」表 sm/md = 16px;NOT 24)。
            data-table.spec.md「九之二、Cell action primitive 分類」對齊。
            ItemInlineActionButton asChild-compatible,size="md" 因 header 不在 RowSizeProvider。
            has-[[data-state=open]]:opacity-100 — menu 開啟後 trigger 維持可見,即使 cursor
            移開(無 hover)+ focus 已 portal 到 menu 第一項(無 focus-within in subtree)。 */}
        <div className="shrink-0 ml-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {showDivider && <span className="absolute right-0 w-px bg-divider" style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }} aria-hidden />}
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
        {headers.map((h, i) => headerCellEl(h, i < headers.length - 1 && !(isRight && i === headers.length - 1)))}
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

    // L4 row drag v2:per-region per-row useSortable instances 共享同一 SortableContext。
    // primary = left region(若有)否則 center;listeners 只在 primary。
    // mirror regions(其他)同呼叫 useSortable → 取得相同 transform → 自然跟動(v2 fix #2)。
    const isPrimaryRegion = hasLeft ? cols === leftCols : isCenter
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
      const baseRowDiv = (extra?: { ref?: (el: HTMLElement | null) => void; style?: React.CSSProperties; isDragging?: boolean }) => (
        <div
          key={row.id}
          ref={(el) => {
            // v2 fix #1:被拖 row 略過 measureElement(transform 干擾測量,長 list 累積誤差)
            // v2 fix #4(virtual freeze):drag 進行中(activeDragId != null)整個略過 measureElement —
            // 任一 row 重新量測都可能觸發 row position recompute → 跟 dnd-kit transform 競爭。
            if (isCenter && opts?.virtual && el && !isThisRowDragging && activeDragId == null) {
              virtualizer.measureElement(el)
            }
            extra?.ref?.(el)
          }}
          data-index={isCenter && opts?.virtual ? idx : undefined}
          data-row-index={idx}
          role="row"
          aria-rowindex={idx + 2}
          className={cn(
            'group/row flex relative',
            autoRowHeight ? 'items-start' : 'items-center',
            !autoRowHeight && rowHeight,
            !autoRowHeight && 'overflow-hidden',
            opts?.virtual && 'absolute w-full',
            showBorder && 'border-b border-divider',
            'transition-colors data-[hovered]:bg-neutral-hover',
            extra?.isDragging && 'bg-neutral-hover',
          )}
          style={{
            ...(opts?.virtual ? { transform: `translateY(${opts.start}px)` } : {}),
            ...(extra?.style ?? {}),
          }}
          {...hoverProps(idx)}
        >
          {showDragHandle && <RowDragHandle disabled={dragDisabled} />}
          {getRegionCells(row, cols).map((cell, ci, arr) => cellEl(cell, ci === arr.length - 1 && !(isRight && hasRowActions)))}
          {isRight && hasRowActions && (
            <div role="cell" className="flex items-center justify-end shrink-0 gap-2 flex-1" style={cellPadding}>
              {rowActions!(row.original)}
            </div>
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
          <div className="w-max min-w-full">
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
          <div className="w-max min-w-full">
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
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // v2 fix #3:custom collisionDetection — 過濾出與 active 同 parent 的 sortable items。
  // 跨 parent 的 candidate 全部排除 → over 為 null → DragHandleCell 切 cursor-not-allowed。
  // closestCenter 仍是 base alg(對齊既有行為);只是 droppable 集合先過濾。
  const sameParentCollisionDetection: CollisionDetection = React.useCallback((args) => {
    const activeId = args.active?.id != null ? String(args.active.id) : null
    if (!activeId) return closestCenter(args)
    const activeParent = parentMap.get(activeId)
    // 過濾 droppable container collection — 只保留 same parent siblings(且不含 active 本身)
    const filtered = args.droppableContainers.filter(c => {
      const cid = String(c.id)
      if (cid === activeId) return false
      const cParent = parentMap.get(cid)
      if (cParent === undefined) return false // 非 row droppable
      return cParent === activeParent
    })
    return closestCenter({ ...args, droppableContainers: filtered })
  }, [parentMap])

  const handleDragStart = React.useCallback((e: { active: { id: string | number } }) => {
    setActiveDragId(String(e.active.id))
    setInvalidDropActive(false)
  }, [])

  const handleDragOver = React.useCallback((e: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = e
    if (!active) return
    if (!over) {
      // 無 valid same-parent over → invalid drop signal(配合 v2 cross-parent visual)
      if (!invalidRef.current) setInvalidDropActive(true)
      return
    }
    if (invalidRef.current) setInvalidDropActive(false)
  }, [])

  const handleDragCancel = React.useCallback(() => {
    setActiveDragId(null)
    setInvalidDropActive(false)
  }, [])

  const handleDragEnd = React.useCallback((e: DragEndEvent) => {
    const { active, over } = e
    setActiveDragId(null)
    setInvalidDropActive(false)
    if (!over || active.id === over.id) return
    const sourceId = String(active.id)
    const targetId = String(over.id)
    // v2:cross-parent 已被 collisionDetection 過濾,但 defensive check
    if (parentMap.get(sourceId) !== parentMap.get(targetId)) return

    // position 計算需用「same parent siblings」list(對 sub-rows 也適用)
    const parentId = parentMap.get(sourceId)
    const siblings = allRowIds.filter(id => parentMap.get(id) === parentId)
    const oldIdx = siblings.indexOf(sourceId)
    const newIdx = siblings.indexOf(targetId)
    if (oldIdx === -1 || newIdx === -1) return
    // 對齊 @dnd-kit/sortable arrayMove 慣例:active 從上往下拖到 over 下方 = after
    const position: 'before' | 'after' = oldIdx < newIdx ? 'after' : 'before'
    onRowReorder?.(sourceId, targetId, position)
  }, [allRowIds, parentMap, onRowReorder])

  // v2 fix #5(2026-05-05):custom modifier — 鎖 Y 軸,排除 X 抖動。
  // Row drag 是垂直 reorder 語義(同 parent siblings 上下移),X 軸抖動會觸發水平 transform
  // → 進而 row width / measureElement loop → 視覺錯位。等同 @dnd-kit/modifiers `restrictToVerticalAxis`
  // 行為(那 package 沒裝;inline 實作避免新增 dep)。
  const restrictToVerticalAxis = React.useCallback(
    ({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) => ({
      ...transform,
      x: 0,
    }),
    []
  )

  const wrapWithDnd = (node: React.ReactNode): React.ReactNode => {
    if (!enableRowDrag) return node
    return (
      <DndContext
        sensors={dndSensors}
        collisionDetection={sameParentCollisionDetection}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allRowIds} strategy={verticalListSortingStrategy}>
          {node}
        </SortableContext>
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
