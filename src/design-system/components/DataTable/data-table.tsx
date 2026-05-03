// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite — 拆檔會複雜化 context / ref / state 同步
import * as React from 'react'
import { Empty } from '@/design-system/components/Empty/empty'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type TableOptions,
  type Column,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown, Calendar, ArrowUp, ArrowDown, Filter as FilterIcon, EyeOff, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { columnTypeDefaults, type ColumnType } from './column-types'
import { InputDisplay } from '@/design-system/components/Input/input'
import { NumberInputDisplay } from '@/design-system/components/NumberInput/number-input'
import { BooleanDisplay } from '@/design-system/components/Checkbox/boolean-display'
import { SelectDisplay } from '@/design-system/components/Select/select'
import { ComboboxDisplay } from '@/design-system/components/Combobox/combobox'
import { DatePickerDisplay } from '@/design-system/components/DatePicker/date-picker'
import { PersonDisplay, MultiPersonDisplay, type PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import { LinkInputDisplay } from '@/design-system/components/LinkInput/link-input'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { useControllable } from '@/design-system/hooks/use-controllable'

// ── Variants ─────────────────────────────────────────────────────────────────

const dataTableVariants = cva('bg-surface rounded-md overflow-hidden', {
  variants: { bordered: { true: 'border border-border', false: '' } },
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
}

// ── Type → Display ──────────────────────────────────────────────────────────

// column meta is user-supplied free-form bag(type / prefix / options / formatOptions / locale 等);
// 窄型化到 discriminated union 會把 renderTypedValue() 吹成 ~100 行 switch,實際 runtime 靠 `type` field 區分
// any-allow: free-form consumer meta
function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: TableSize): React.ReactNode {
  const type = meta?.type as ColumnType | undefined
  const wrap = autoRowHeight && meta?.wrap === true
  switch (type) {
    case 'number': case 'currency':
      return <NumberInputDisplay value={value as number | null} prefix={type === 'currency' ? (meta?.prefix ?? '$') : meta?.prefix} suffix={meta?.suffix} precision={meta?.precision} locale={meta?.locale} />
    case 'date': return <DatePickerDisplay value={value as string | number | Date | null} formatOptions={meta?.formatOptions} locale={meta?.locale} />
    case 'boolean': return <BooleanDisplay value={value as boolean | null} />
    case 'select': return <SelectDisplay value={value as string | null} options={meta?.options} size={tableSize} />
    case 'multiSelect': return <ComboboxDisplay value={value as string[] | null} options={meta?.options} wrap={wrap} />
    case 'person': return <PersonDisplay value={value as PersonValue | null} size={tableSize} />
    case 'multiPerson': return <MultiPersonDisplay value={value as PersonValue[] | null} size={tableSize} />
    case 'url': return <LinkInputDisplay value={value as string | null} label={meta?.linkLabel} />
    default: return <InputDisplay value={value != null ? String(value) : null} />
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const CELL_PX = '0.75rem'
// L2 selection 內部 column id(避免 magic string 重複)
const SELECT_COL_ID = '__select__'
const cellPadding: React.CSSProperties = { paddingBlock: 'var(--table-cell-py)', paddingInline: CELL_PX }
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
    estimateRowHeight = 36, tableOptions, rowActions,
    pinnedLeftColumns, pinnedRightColumns, inlineEdit = false,
    selection: selectionProp, defaultSelection, onSelectionChange,
    selectable = false, isRowSelectable, getRowId, getRowAriaLabel,
    preserveSelectionOnFilter = false,
    columnVisibility: columnVisibilityProp, defaultColumnVisibility, onColumnVisibilityChange,
    enableMultiSort = true,
    onColumnFilterTrigger,
    className, ...props
  }: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
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

  // 注入 checkbox column(enabled 時)
  const columnsWithSelection = React.useMemo(() => {
    if (!enabled) return columns
    const selectColumn: ColumnDef<TData, any> = {
      id: SELECT_COL_ID,
      size: 40,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,  // selection col 不能藏(L3 column visibility)
      header: 'Select',  // header cell 由下方自訂 render 取代
      cell: () => null,  // body cell 由下方自訂 render 取代
    }
    return [selectColumn, ...columns]
  }, [columns, enabled])

  // pinned-left 自動加 __select__
  const effectivePinnedLeft = React.useMemo(() => {
    if (!enabled) return pinnedLeftColumns ?? []
    const list = pinnedLeftColumns ?? []
    return list.includes(SELECT_COL_ID) ? list : [SELECT_COL_ID, ...list]
  }, [pinnedLeftColumns, enabled])

  // columnOrder 自動加 __select__ 第一位:consumer 傳的 columnOrder 通常只列 data
  // columns(忘 __select__),TanStack 會把不在 order 的 column 推到末位 → checkbox
  // 變右邊。世界級 convention(Notion / Linear / Airtable / Material X-Grid)選取在左。
  const userColumnOrder = tableOptions?.state?.columnOrder
  const effectiveColumnOrder = React.useMemo(() => {
    if (!enabled || !userColumnOrder) return userColumnOrder
    return userColumnOrder.includes(SELECT_COL_ID) ? userColumnOrder : [SELECT_COL_ID, ...userColumnOrder]
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
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      setColumnVisibility(next)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    // V scroll 現在在 centerBodyRef(不是外層 bodyRef)
    getScrollElement: () => centerBodyRef.current,
    estimateSize: () => estimateRowHeight,
    overscan, enabled: useVirtual,
  })

  // ── isFillHeight body maxHeight JS 計算(2026-04-30)──
  // CSS `%` height 在 flex column min-h-0 + auto basis 場景下,Chromium 不可靠 shrink
  // (實測:outer maxHeight 100% bind parent,但 body 不 shrink 反映 outer 約束 → outer
  // overflow-hidden 切掉 content,V scroll 不 trigger)。
  // 改用 ResizeObserver 算 body avail = outer rect - header rect → set centerBody
  // maxHeight = pixel value(不是 %)。content 大 → V scroll;content 小 → centerBody
  // = content,outer = intrinsic,沒留白。
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

  // ── Cell render ──
  const renderCellContent = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const wrap = autoRowHeight && meta?.wrap === true
    // 已知 compound 欄位(Tag / PersonDisplay 等自帶 layout)直接 bypass TruncateCell,
    // 因為 `truncate` 的 inline baseline context 會破壞自訂 layout 的垂直對齊。
    const isKnownCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'url'
    const content = colType ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size) : flexRender(cell.column.columnDef.cell, cell.getContext())
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

  // inline edit 指示器：select 類顯示 ChevronDown，date 顯示 Calendar
  const getEditIndicator = (colType?: ColumnType) => {
    if (!inlineEdit) return null
    if (colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson')
      return <ChevronDown size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
    if (colType === 'date')
      return <Calendar size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
    return null
  }

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
        )}
        style={{ width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize, maxWidth: cell.column.columnDef.maxSize, ...cellPadding }}
      >
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
          // code-quality-allow: any-event — TanStack getToggleSortingHandler 內部會 narrow,接受 KeyboardEvent
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
          {canSort && sortDir && (
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
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSort && (
                <>
                  <DropdownMenuItem startIcon={ArrowUp} onClick={() => header.column.toggleSorting(false, false)}>升冪排序</DropdownMenuItem>
                  <DropdownMenuItem startIcon={ArrowDown} onClick={() => header.column.toggleSorting(true, false)}>降冪排序</DropdownMenuItem>
                  {sortDir && <DropdownMenuItem startIcon={XIcon} onClick={() => header.column.clearSorting()}>取消排序</DropdownMenuItem>}
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

    const rowEl = (row: typeof rows[number], idx: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
      const showBorder = bordered !== false ? !opts?.isLast : true
      return (
        <div key={row.id} ref={isCenter && opts?.virtual ? virtualizer.measureElement : undefined} data-index={isCenter && opts?.virtual ? idx : undefined} data-row-index={idx} role="row" aria-rowindex={idx + 2} className={cn('flex', autoRowHeight ? 'items-start' : 'items-center', !autoRowHeight && rowHeight, !autoRowHeight && 'overflow-hidden', opts?.virtual && 'absolute w-full', showBorder && 'border-b border-divider', 'transition-colors data-[hovered]:bg-neutral-hover')} style={opts?.virtual ? { transform: `translateY(${opts.start}px)` } : undefined} {...hoverProps(idx)}>
          {getRegionCells(row, cols).map((cell, ci, arr) => cellEl(cell, ci === arr.length - 1 && !(isRight && hasRowActions)))}
          {isRight && hasRowActions && (
            <div role="cell" className="flex items-center justify-end shrink-0 gap-2 flex-1" style={cellPadding}>
              {rowActions!(row.original)}
            </div>
          )}
        </div>
      )
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

  if (enabled && mode === 'single') {
    return (
      <RadioGroupPrimitive.Root
        value={selection[0] ?? ''}
        onValueChange={(v) => v && setSelection([v])}
      >
        {tableContent}
      </RadioGroupPrimitive.Root>
    )
  }
  return tableContent
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
