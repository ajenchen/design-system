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
  variants: {
    bordered: { true: 'border border-border', false: '' },
  },
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
}

// ── Type → Display ──────────────────────────────────────────────────────────

function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: TableSize): React.ReactNode {
  const type = meta?.type as ColumnType | undefined
  const wrap = autoRowHeight && meta?.wrap === true
  switch (type) {
    case 'number': case 'currency':
      return <NumberFieldDisplay value={value as number | null} prefix={type === 'currency' ? (meta?.prefix ?? '$') : meta?.prefix} suffix={meta?.suffix} precision={meta?.precision} locale={meta?.locale} />
    case 'date':
      return <DateFieldDisplay value={value as string | number | Date | null} formatOptions={meta?.formatOptions} locale={meta?.locale} />
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
const HEADER_BG = 'bg-[var(--color-neutral-2-opaque)]' // 不透明，sticky header 蓋住捲動內容

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
// Component — 三區域架構（AG Grid 模式）
//
//  outer (flex, overflow-y: auto)         ← 共用垂直捲動
//  ├── left-pinned (shrink-0)             ← 不水平捲
//  │   ├── header (sticky top:0)
//  │   └── body
//  ├── center (flex-1, overflow-x: auto)  ← 唯一水平捲
//  │   ├── header (sticky top:0)
//  │   └── body
//  └── right-pinned (shrink-0)            ← 不水平捲（含 row actions）
//      ├── header (sticky top:0)
//      └── body
//
// 固定行高：三 region 的 row 高度一致，自然對齊。
// Row hover：data-hovered + CSS，跨 region。
// ══════════════════════════════════════════════════════════════════════════════

function DataTableInner<TData>(
  {
    columns, data, size = 'md', autoRowHeight = false, height = '400px',
    overscan = 5, emptyState, enableHover = true, bordered,
    estimateRowHeight = 36, tableOptions, rowActions,
    pinnedLeftColumns, pinnedRightColumns,
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

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const tableRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan, enabled: useVirtual,
  })

  // 三區域欄位
  const leftCols = table.getLeftVisibleLeafColumns()
  const centerCols = table.getCenterVisibleLeafColumns()
  const rightCols = table.getRightVisibleLeafColumns()
  const hasLeft = leftCols.length > 0
  const hasRight = rightCols.length > 0 || hasRowActions

  // ── Cross-region row hover（ref-based, zero re-render）──
  const onRowEnter = React.useCallback((idx: number) => {
    tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach(el => (el as HTMLElement).dataset.hovered = '')
  }, [])
  const onRowLeave = React.useCallback((idx: number) => {
    tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach(el => delete (el as HTMLElement).dataset.hovered)
  }, [])
  const hoverProps = (idx: number) => enableHover ? { onMouseEnter: () => onRowEnter(idx), onMouseLeave: () => onRowLeave(idx) } : {}

  // ── Render cell content ──
  const renderCellContent = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const wrap = autoRowHeight && meta?.wrap === true
    const isCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'link'
    const content = colType ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size) : flexRender(cell.column.columnDef.cell, cell.getContext())
    return wrap ? <span className="break-words min-w-0">{content}</span> : isCompound ? content : <TruncateCell>{content}</TruncateCell>
  }

  // ── Render a region ──
  const renderRegion = (
    type: 'left' | 'center' | 'right',
    regionCols: Column<TData, unknown>[],
  ) => {
    const isCenter = type === 'center'
    const isRight = type === 'right'
    const totalWidth = regionCols.reduce((a, c) => a + c.getSize(), 0)

    // Header cells for this region
    const headerGroup = table.getHeaderGroups()[0]
    const regionHeaderIds = new Set(regionCols.map(c => c.id))
    const regionHeaders = headerGroup.headers.filter(h => regionHeaderIds.has(h.id))

    // Row cells for this region
    const getCells = (row: typeof rows[number]) =>
      row.getVisibleCells().filter(c => regionHeaderIds.has(c.column.id))

    // Render rows
    const renderRows = () => {
      if (isEmpty && isCenter) {
        return <div className="flex items-center justify-center text-fg-muted text-body py-12">{emptyState ?? '沒有資料'}</div>
      }
      if (isEmpty) return null

      const rowEl = (row: typeof rows[number], idx: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
        const showBorder = bordered !== false ? !opts?.isLast : true
        return (
          <div
            key={row.id}
            ref={isCenter && opts?.virtual ? virtualizer.measureElement : undefined}
            data-index={isCenter && opts?.virtual ? idx : undefined}
            data-row-index={idx}
            role="row"
            aria-rowindex={idx + 2}
            className={cn(
              'flex items-stretch',
              opts?.virtual && 'absolute w-full',
              showBorder && 'border-b border-divider',
              'transition-colors data-[hovered]:bg-neutral-hover',
            )}
            style={opts?.virtual ? { transform: `translateY(${opts.start}px)` } : undefined}
            {...hoverProps(idx)}
          >
            {getCells(row).map(cell => {
              const meta = cell.column.columnDef.meta
              const colType = meta?.type as ColumnType | undefined
              const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
              return (
                <div
                  key={cell.id}
                  role="cell"
                  className={cn(
                    'flex text-foreground text-body font-normal shrink-0 overflow-hidden',
                    autoRowHeight ? 'items-start' : 'items-center',
                    align === 'right' && 'justify-end text-right',
                    align === 'center' && 'justify-center text-center',
                  )}
                  style={{ width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize, maxWidth: cell.column.columnDef.maxSize, ...cellPadding }}
                >
                  {renderCellContent(cell)}
                </div>
              )
            })}
            {/* Row actions 在 right region 最後 */}
            {isRight && hasRowActions && (
              <div role="cell" className="flex items-center justify-end shrink-0 gap-2" style={cellPadding}>
                {rowActions!(row.original)}
              </div>
            )}
          </div>
        )
      }

      if (useVirtual) {
        return (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', ...(isCenter ? { minWidth: totalWidth } : {}) }}>
            {virtualizer.getVirtualItems().map(vr => rowEl(rows[vr.index], vr.index, { virtual: true, start: vr.start, isLast: vr.index === rows.length - 1 }))}
          </div>
        )
      }
      return <>{rows.map((row, i) => rowEl(row, i, { isLast: i === rows.length - 1 }))}</>
    }

    return (
      <div className={cn(
        isCenter ? 'flex-1 min-w-0 overflow-x-auto overflow-y-hidden' : 'shrink-0 overflow-hidden',
        type === 'left' && 'border-r border-divider',
        isRight && 'border-l border-divider',
      )}>
        {/* Header */}
        <div role="rowgroup" className={cn('sticky top-0 z-[2]', HEADER_BG)}>
          <div className={cn(isCenter && 'w-max min-w-full')}>
            <div role="row" className="flex items-stretch border-b border-divider">
              {regionHeaders.map((header, idx) => {
                const meta = header.column.columnDef.meta
                const colType = meta?.type as ColumnType | undefined
                const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
                const isLast = idx === regionHeaders.length - 1 && !(isRight && hasRowActions)
                return (
                  <div
                    key={header.id}
                    role="columnheader"
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                    className={cn('relative flex items-center text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none', align === 'right' && 'text-right', align === 'center' && 'text-center')}
                    style={{ width: header.getSize(), minWidth: header.column.columnDef.minSize, maxWidth: header.column.columnDef.maxSize, ...cellPadding }}
                  >
                    <TruncateCell>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TruncateCell>
                    {!isLast && <span className="absolute right-0 w-px bg-divider" style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }} aria-hidden />}
                  </div>
                )
              })}
              {/* Row actions header — flex-1 撐滿 region 寬度，對齊 body 的 buttons */}
              {isRight && hasRowActions && <div role="columnheader" className="flex-1" style={cellPadding} />}
            </div>
          </div>
        </div>
        {/* Body */}
        <div role="rowgroup" className={cn(isCenter && 'w-max min-w-full')}>
          {renderRows()}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={(el) => { tableRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el }}
      data-table-size={size}
      className={cn(dataTableVariants({ bordered }), className)}
      role="table"
      aria-rowcount={rows.length + 1}
      {...props}
    >
      <div ref={scrollRef} className="flex overflow-auto" style={hasHeightConstraint ? { maxHeight: height } : undefined}>
        {hasLeft && renderRegion('left', leftCols)}
        {renderRegion('center', centerCols)}
        {hasRight && renderRegion('right', rightCols)}
      </div>
    </div>
  )
}

export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

;(DataTable as any).displayName = 'DataTable'
export { dataTableVariants }
