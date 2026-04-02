import * as React from 'react'
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
import { ChevronDown, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { columnTypeDefaults, type ColumnType } from './column-types'
import { TextFieldDisplay } from '@/design-system/components/fields/TextField/text-field'
import { NumberFieldDisplay } from '@/design-system/components/fields/NumberField/number-field'
import { BooleanFieldDisplay } from '@/design-system/components/fields/BooleanField/boolean-field'
import { SelectFieldDisplay } from '@/design-system/components/fields/SelectField/select-field'
import { MultiSelectFieldDisplay } from '@/design-system/components/fields/MultiSelectField/multi-select-field'
import { DateFieldDisplay } from '@/design-system/components/fields/DateField/date-field'
import { PersonDisplay, MultiPersonDisplay, type PersonValue } from './person-display'
import { LinkFieldDisplay } from '@/design-system/components/fields/LinkField/link-field'

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
}

// ── Type → Display ──────────────────────────────────────────────────────────

function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: TableSize): React.ReactNode {
  const type = meta?.type as ColumnType | undefined
  const wrap = autoRowHeight && meta?.wrap === true
  switch (type) {
    case 'number': case 'currency':
      return <NumberFieldDisplay value={value as number | null} prefix={type === 'currency' ? (meta?.prefix ?? '$') : meta?.prefix} suffix={meta?.suffix} precision={meta?.precision} locale={meta?.locale} />
    case 'date': return <DateFieldDisplay value={value as string | number | Date | null} formatOptions={meta?.formatOptions} locale={meta?.locale} />
    case 'boolean': return <BooleanFieldDisplay value={value as boolean | null} />
    case 'select': return <SelectFieldDisplay value={value as string | null} options={meta?.options} size={tableSize} />
    case 'multiSelect': return <MultiSelectFieldDisplay value={value as string[] | null} options={meta?.options} wrap={wrap} />
    case 'person': return <PersonDisplay value={value as PersonValue | null} size={tableSize} />
    case 'multiPerson': return <MultiPersonDisplay value={value as PersonValue[] | null} size={tableSize} />
    case 'link': return <LinkFieldDisplay value={value as string | null} label={meta?.linkLabel} />
    default: return <TextFieldDisplay value={value != null ? String(value) : null} />
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const CELL_PX = '0.75rem'
const cellPadding: React.CSSProperties = { paddingBlock: 'var(--table-cell-py)', paddingInline: CELL_PX }
const HEADER_BG = 'bg-[var(--color-neutral-2-opaque)]'

// ── TruncateCell ─────────────────────────────────────────────────────────────

function TruncateCell({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)
  const check = React.useCallback(() => { const el = ref.current; if (el) setIsTruncated(el.scrollWidth > el.clientWidth) }, [])
  React.useEffect(() => { check(); const obs = new ResizeObserver(check); if (ref.current) obs.observe(ref.current); return () => obs.disconnect() }, [check])
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

function DataTableInner<TData>(
  {
    columns, data, size = 'md', autoRowHeight = false, height = '400px',
    overscan = 5, emptyState, enableHover = true, bordered,
    estimateRowHeight = 36, tableOptions, rowActions,
    pinnedLeftColumns, pinnedRightColumns, inlineEdit = false,
    className, ...props
  }: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const [sorting, setSorting] = React.useState<SortingState>(tableOptions?.state?.sorting as SortingState ?? [])

  const table = useReactTable({
    data, columns,
    state: { sorting, columnPinning: { left: pinnedLeftColumns ?? [], right: pinnedRightColumns ?? [] }, ...tableOptions?.state },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...tableOptions,
  })

  const { rows } = table.getRowModel()
  const isEmpty = rows.length === 0
  const hasHeightConstraint = height !== 'auto'
  const useVirtual = hasHeightConstraint && !isEmpty
  const hasRowActions = !!rowActions

  // Refs
  const tableRef = React.useRef<HTMLDivElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const centerHeaderRef = React.useRef<HTMLDivElement>(null)
  const centerBodyRef = React.useRef<HTMLDivElement>(null)
  const leftHeaderRef = React.useRef<HTMLDivElement>(null)
  const rightHeaderRef = React.useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = React.useState(0)
  const [rightWidth, setRightWidth] = React.useState(0)

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => estimateRowHeight,
    overscan, enabled: useVirtual,
  })

  // JS scroll sync: center-body scrollLeft → center-header scrollLeft
  const onCenterBodyScroll = React.useCallback(() => {
    if (centerHeaderRef.current && centerBodyRef.current) {
      centerHeaderRef.current.scrollLeft = centerBodyRef.current.scrollLeft
    }
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

  // ── Cross-region row hover ──
  const onRowEnter = React.useCallback((idx: number) => {
    tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach(el => (el as HTMLElement).dataset.hovered = '')
  }, [])
  const onRowLeave = React.useCallback((idx: number) => {
    tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach(el => delete (el as HTMLElement).dataset.hovered)
  }, [])
  const hoverProps = (idx: number) => enableHover ? { onMouseEnter: () => onRowEnter(idx), onMouseLeave: () => onRowLeave(idx) } : {}

  // ── Cell render ──
  const renderCellContent = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const wrap = autoRowHeight && meta?.wrap === true
    const isCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'link'
    const content = colType ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size) : flexRender(cell.column.columnDef.cell, cell.getContext())
    return wrap ? <span className="break-words min-w-0">{content}</span> : isCompound ? content : <TruncateCell>{content}</TruncateCell>
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
        <span className={cn('flex-1 min-w-0 overflow-hidden flex items-center', align === 'right' && 'justify-end')}>
          {renderCellContent(cell)}
        </span>
        {indicator}
      </div>
    )
  }

  // ── Header cell ──
  const headerCellEl = (header: ReturnType<typeof table.getHeaderGroups>[number]['headers'][number], showDivider: boolean) => {
    const meta = header.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    return (
      <div key={header.id} role="columnheader" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'} className={cn('relative flex items-center text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none', align === 'right' && 'text-right', align === 'center' && 'text-center')} style={{ width: header.getSize(), minWidth: header.column.columnDef.minSize, maxWidth: header.column.columnDef.maxSize, ...cellPadding }}>
        <TruncateCell>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TruncateCell>
        {showDivider && <span className="absolute right-0 w-px bg-divider" style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }} aria-hidden />}
      </div>
    )
  }

  // ── Region helpers ──
  const getRegionHeaders = (cols: Column<TData, unknown>[]) => {
    const ids = new Set(cols.map(c => c.id))
    return table.getHeaderGroups()[0]?.headers.filter(h => ids.has(h.id)) ?? []
  }

  const getRegionCells = (row: typeof rows[number], cols: Column<TData, unknown>[]) => {
    const ids = new Set(cols.map(c => c.id))
    return row.getVisibleCells().filter(c => ids.has(c.column.id))
  }

  // ── Render header row for a region ──
  const renderHeaderRow = (cols: Column<TData, unknown>[], isRight: boolean) => {
    const headers = getRegionHeaders(cols)
    return (
      <div role="row" className={cn('flex items-center border-b border-divider', rowHeight, HEADER_BG)}>
        {headers.map((h, i) => headerCellEl(h, i < headers.length - 1 && !(isRight && i === headers.length - 1)))}
        {isRight && hasRowActions && (
          <div role="columnheader" className="flex items-center justify-end shrink-0 gap-2 invisible" style={cellPadding}>
            {/* 渲染一個假 row 的 actions 來佔位，確保 header 和 body 同寬 */}
            {rows[0] && rowActions!(rows[0].original)}
          </div>
        )}
      </div>
    )
  }

  // ── Render body rows for a region ──
  const renderBodyRows = (cols: Column<TData, unknown>[], isCenter: boolean, isRight: boolean, regionWidth?: number) => {
    if (isEmpty && isCenter) {
      return <div className="flex items-center justify-center text-fg-muted text-body py-12">{emptyState ?? '沒有資料'}</div>
    }
    if (isEmpty) return null

    const rowEl = (row: typeof rows[number], idx: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
      const showBorder = bordered !== false ? !opts?.isLast : true
      return (
        <div key={row.id} ref={isCenter && opts?.virtual ? virtualizer.measureElement : undefined} data-index={isCenter && opts?.virtual ? idx : undefined} data-row-index={idx} role="row" aria-rowindex={idx + 2} className={cn('flex items-center', !autoRowHeight && rowHeight, opts?.virtual && 'absolute w-full', showBorder && 'border-b border-divider', 'transition-colors data-[hovered]:bg-neutral-hover')} style={opts?.virtual ? { transform: `translateY(${opts.start}px)` } : undefined} {...hoverProps(idx)}>
          {getRegionCells(row, cols).map((cell, ci, arr) => cellEl(cell, ci === arr.length - 1 && !(isRight && hasRowActions)))}
          {isRight && hasRowActions && (
            <div role="cell" className="flex items-center justify-end shrink-0 gap-2 flex-1" style={cellPadding}>
              {rowActions!(row.original)}
            </div>
          )}
        </div>
      )
    }

    if (useVirtual) {
      const colsWidth = cols.reduce((a, c) => a + c.getSize(), 0)
      // 用 header 量測的寬度（包含 actions 佔位），或 fallback 到 column 寬度合計
      const containerWidth = regionWidth || colsWidth
      return (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: containerWidth }}>
          {virtualizer.getVirtualItems().map(vr => rowEl(rows[vr.index], vr.index, { virtual: true, start: vr.start, isLast: vr.index === rows.length - 1 }))}
        </div>
      )
    }
    return <>{rows.map((row, i) => rowEl(row, i, { isLast: i === rows.length - 1 }))}</>
  }

  return (
    <div
      ref={(el) => { tableRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el }}
      data-table-size={size}
      className={cn(dataTableVariants({ bordered }), className)}
      role="table" aria-rowcount={rows.length + 1}
      {...props}
    >
      {/* ══ HEADER（固定頂部，不在 scroll 內）══ */}
      <div role="rowgroup" className="flex">
        {hasLeft && (
          <div ref={leftHeaderRef} className="shrink-0 overflow-hidden border-r border-divider">
            {renderHeaderRow(leftCols, false)}
          </div>
        )}
        <div ref={centerHeaderRef} className="flex-1 min-w-0 overflow-hidden">
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

      {/* ══ BODY（唯一的垂直 scroll container）══ */}
      <div ref={bodyRef} className="flex items-start" style={hasHeightConstraint ? { maxHeight: height, overflowY: 'auto' } : undefined}>
        {hasLeft && (
          <div className="shrink-0 overflow-hidden border-r border-divider" style={leftWidth ? { width: leftWidth } : undefined}>
            {renderBodyRows(leftCols, false, false, leftWidth)}
          </div>
        )}
        <div ref={centerBodyRef} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden" onScroll={onCenterBodyScroll}>
          <div className="w-max min-w-full">
            {renderBodyRows(centerCols, true, false)}
          </div>
        </div>
        {hasRight && (
          <div className="shrink-0 overflow-hidden border-l border-divider" style={rightWidth ? { width: rightWidth } : undefined}>
            {renderBodyRows(rightCols, false, true, rightWidth)}
          </div>
        )}
      </div>
    </div>
  )
}

export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

;(DataTable as any).displayName = 'DataTable'
export { dataTableVariants }
