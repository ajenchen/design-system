import * as React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type TableOptions,
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
    bordered: {
      true: 'border border-border',
      false: '',
    },
  },
  defaultVariants: {
    bordered: true,
  },
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
  rowActionsAlwaysVisible?: boolean
  pinnedLeftColumns?: string[]
  pinnedRightColumns?: string[]
}

// ── Type → Display ──────────────────────────────────────────────────────────

function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: TableSize): React.ReactNode {
  const type = meta?.type as ColumnType | undefined
  const wrap = autoRowHeight && meta?.wrap === true
  switch (type) {
    case 'number':
    case 'currency':
      return <NumberFieldDisplay value={value as number | null} prefix={type === 'currency' ? (meta?.prefix ?? '$') : meta?.prefix} suffix={meta?.suffix} precision={meta?.precision} locale={meta?.locale} />
    case 'date':
      return <DateFieldDisplay value={value as string | number | Date | null} formatOptions={meta?.formatOptions} locale={meta?.locale} />
    case 'boolean':
      return <BooleanFieldDisplay value={value as boolean | null} />
    case 'select':
      return <SelectFieldDisplay value={value as string | null} options={meta?.options} size={tableSize} />
    case 'multiSelect':
      return <MultiSelectFieldDisplay value={value as string[] | null} options={meta?.options} wrap={wrap} />
    case 'person':
      return <PersonDisplay value={value as PersonValue | null} size={tableSize} />
    case 'multiPerson':
      return <MultiPersonDisplay value={value as PersonValue[] | null} size={tableSize} />
    case 'link':
      return <LinkFieldDisplay value={value as string | null} label={meta?.linkLabel} />
    default:
      return <TextFieldDisplay value={value != null ? String(value) : null} />
  }
}

// ── Cell padding ────────────────────────────────────────────────────────────

const cellPadding: React.CSSProperties = {
  paddingBlock: 'var(--table-cell-py)',
  paddingInline: '0.75rem',
}

// ── Truncate with auto tooltip ───────────────────────────────────────────────

function TruncateCell({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  const checkTruncation = React.useCallback(() => {
    const el = ref.current
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth)
  }, [])

  React.useEffect(() => {
    checkTruncation()
    const observer = new ResizeObserver(checkTruncation)
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [checkTruncation])

  const span = <span ref={ref} className={cn('truncate min-w-0', className)}>{children}</span>
  if (!isTruncated) return span
  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

// ── Pinned cell helpers ──────────────────────────────────────────────────────

function getPinnedStyle(pinned: 'left' | 'right' | false, offset: number): React.CSSProperties | undefined {
  if (!pinned) return undefined
  return {
    position: 'sticky',
    [pinned]: offset,
    zIndex: 1,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

function DataTableInner<TData>(
  {
    columns, data, size = 'md', autoRowHeight = false, height = '400px',
    overscan = 5, emptyState, enableHover = true, bordered,
    estimateRowHeight = 36, tableOptions, rowActions,
    rowActionsAlwaysVisible = false, pinnedLeftColumns, pinnedRightColumns,
    className, ...props
  }: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const [sorting, setSorting] = React.useState<SortingState>(
    tableOptions?.state?.sorting as SortingState ?? []
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnPinning: { left: pinnedLeftColumns ?? [], right: pinnedRightColumns ?? [] },
      ...tableOptions?.state,
    },
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
  const headerRef = React.useRef<HTMLDivElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  // Virtual scrolling
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    enabled: useVirtual,
  })

  // Sync header horizontal scroll with body
  const onBodyScroll = React.useCallback(() => {
    if (headerRef.current && bodyRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft
    }
  }, [])

  // ── Calculate pinned offsets ──
  const leftPinnedOffsets = React.useMemo(() => {
    const cols = table.getLeftVisibleLeafColumns()
    const offsets: Record<string, number> = {}
    let acc = 0
    for (const col of cols) {
      offsets[col.id] = acc
      acc += col.getSize()
    }
    return offsets
  }, [table, pinnedLeftColumns])

  const rightPinnedOffsets = React.useMemo(() => {
    const cols = table.getRightVisibleLeafColumns()
    const offsets: Record<string, number> = {}
    let acc = hasRowActions ? 72 : 0 // reserve space for row actions
    for (let i = cols.length - 1; i >= 0; i--) {
      offsets[cols[i].id] = acc
      acc += cols[i].getSize()
    }
    return offsets
  }, [table, pinnedRightColumns, hasRowActions])

  // ── Frozen boundary detection ──
  const leftPinnedIds = new Set(pinnedLeftColumns ?? [])
  const rightPinnedIds = new Set(pinnedRightColumns ?? [])
  const allHeaders = table.getHeaderGroups()[0]?.headers ?? []
  const lastLeftPinnedIdx = allHeaders.findLastIndex(h => leftPinnedIds.has(h.id))
  const firstRightPinnedIdx = allHeaders.findIndex(h => rightPinnedIds.has(h.id))

  // ── Render cell ──
  const renderCell = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const wrap = autoRowHeight && meta?.wrap === true
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    const isCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'link'

    const content = colType
      ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size)
      : flexRender(cell.column.columnDef.cell, cell.getContext())

    const pinned = cell.column.getIsPinned()
    const pinnedOffset = pinned === 'left' ? leftPinnedOffsets[cell.column.id] ?? 0
      : pinned === 'right' ? rightPinnedOffsets[cell.column.id] ?? 0
      : 0

    return (
      <div
        key={cell.id}
        role="cell"
        className={cn(
          'flex text-foreground text-body font-normal shrink-0',
          autoRowHeight ? 'items-start' : 'items-center',
          'overflow-hidden',
          align === 'right' && 'justify-end text-right',
          align === 'center' && 'justify-center text-center',
          pinned && 'bg-[inherit]',
        )}
        style={{
          width: cell.column.getSize(),
          minWidth: cell.column.columnDef.minSize,
          maxWidth: cell.column.columnDef.maxSize,
          ...cellPadding,
          ...getPinnedStyle(pinned, pinnedOffset),
        }}
      >
        {wrap ? (
          <span className="break-words min-w-0">{content}</span>
        ) : isCompound ? content : (
          <TruncateCell>{content}</TruncateCell>
        )}
      </div>
    )
  }

  // ── Row actions cell ──
  const renderRowActionsCell = (row: typeof rows[number]) => (
    <div
      role="cell"
      className={cn(
        'flex items-center justify-end shrink-0 gap-2 bg-surface',
        'sticky right-0 z-[1]',
        'border-l border-divider',
      )}
      style={cellPadding}
    >
      {rowActions!(row.original)}
    </div>
  )

  // ── Render row ──
  const renderRow = (row: typeof rows[number], index: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
    const showBottomBorder = bordered !== false ? !opts?.isLast : true

    return (
      <div
        key={row.id}
        ref={opts?.virtual ? virtualizer.measureElement : undefined}
        data-index={opts?.virtual ? index : undefined}
        role="row"
        aria-rowindex={index + 2}
        className={cn(
          'flex items-stretch',
          opts?.virtual && 'absolute w-full',
          showBottomBorder && 'border-b border-divider',
          enableHover && 'hover:bg-neutral-hover transition-colors group',
        )}
        style={opts?.virtual ? { transform: `translateY(${opts.start}px)` } : undefined}
      >
        {row.getVisibleCells().map(cell => renderCell(cell))}
        {hasRowActions && renderRowActionsCell(row)}
      </div>
    )
  }

  // ── Render header ──
  const renderHeader = () => (
    <div ref={headerRef} role="rowgroup" className="bg-muted overflow-hidden">
      <div className="w-max min-w-full">
        {table.getHeaderGroups().map(headerGroup => (
          <div key={headerGroup.id} role="row" className="flex items-stretch border-b border-divider">
            {headerGroup.headers.map((header, idx) => {
              const headerMeta = header.column.columnDef.meta
              const headerType = headerMeta?.type as ColumnType | undefined
              const headerAlign = headerMeta?.align ?? (headerType ? columnTypeDefaults[headerType].align : undefined)
              const pinned = header.column.getIsPinned()
              const pinnedOffset = pinned === 'left' ? leftPinnedOffsets[header.column.id] ?? 0
                : pinned === 'right' ? rightPinnedOffsets[header.column.id] ?? 0
                : 0

              // frozen 邊界：full-height border 取代 header 短線
              const isLastLeftPinned = idx === lastLeftPinnedIdx
              const isFirstRightPinned = firstRightPinnedIdx >= 0 && idx === firstRightPinnedIdx
              const isLast = idx === headerGroup.headers.length - 1 && !hasRowActions
              const showShortDivider = !isLast && !isLastLeftPinned

              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={
                    header.column.getIsSorted() === 'asc' ? 'ascending' :
                    header.column.getIsSorted() === 'desc' ? 'descending' : 'none'
                  }
                  className={cn(
                    'relative flex items-center text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none',
                    headerAlign === 'right' && 'text-right',
                    headerAlign === 'center' && 'text-center',
                    pinned && 'bg-muted',
                    isLastLeftPinned && 'border-r border-divider',
                    isFirstRightPinned && 'border-l border-divider',
                  )}
                  style={{
                    width: header.getSize(),
                    minWidth: header.column.columnDef.minSize,
                    maxWidth: header.column.columnDef.maxSize,
                    ...cellPadding,
                    ...getPinnedStyle(pinned, pinnedOffset),
                  }}
                >
                  <TruncateCell>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TruncateCell>
                  {showShortDivider && (
                    <span className="absolute right-0 w-px bg-divider" style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }} aria-hidden />
                  )}
                </div>
              )
            })}
            {/* Row actions header */}
            {hasRowActions && (
              <div
                role="columnheader"
                className="sticky right-0 z-[1] bg-muted border-l border-divider shrink-0"
                style={cellPadding}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div
      ref={ref}
      data-table-size={size}
      className={cn(dataTableVariants({ bordered }), className)}
      role="table"
      aria-rowcount={rows.length + 1}
      {...props}
    >
      {renderHeader()}

      {/* Body */}
      <div
        ref={bodyRef}
        role="rowgroup"
        className="overflow-x-auto"
        style={hasHeightConstraint ? { maxHeight: height, overflowY: 'auto' } : undefined}
        onScroll={onBodyScroll}
      >
        <div className="w-max min-w-full">
          {isEmpty ? (
            <div className="flex items-center justify-center text-fg-muted text-body py-12">
              {emptyState ?? '沒有資料'}
            </div>
          ) : useVirtual ? (
            <div style={{ height: virtualizer.getTotalSize(), width: table.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(vr => {
                const row = rows[vr.index]
                return renderRow(row, vr.index, { virtual: true, start: vr.start, isLast: vr.index === rows.length - 1 })
              })}
            </div>
          ) : (
            rows.map((row, i) => renderRow(row, i, { isLast: i === rows.length - 1 }))
          )}
        </div>
      </div>
    </div>
  )
}

export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

;(DataTable as any).displayName = 'DataTable'

export { dataTableVariants }
