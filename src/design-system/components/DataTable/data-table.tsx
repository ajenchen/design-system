import * as React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type TableOptions,
  type Header,
  type Cell,
  type Row,
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
  /** Columns to pin to the left (by column id) */
  pinnedLeftColumns?: string[]
  /** Columns to pin to the right (by column id) */
  pinnedRightColumns?: string[]
}

// ── Type → Display auto-resolve ─────────────────────────────────────────────

function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: TableSize): React.ReactNode {
  const type = meta?.type as ColumnType | undefined
  const wrap = autoRowHeight && meta?.wrap === true
  switch (type) {
    case 'number':
    case 'currency':
      return (
        <NumberFieldDisplay
          value={value as number | null}
          prefix={type === 'currency' ? (meta?.prefix ?? '$') : meta?.prefix}
          suffix={meta?.suffix}
          precision={meta?.precision}
          locale={meta?.locale}
        />
      )
    case 'date':
      return (
        <DateFieldDisplay
          value={value as string | number | Date | null}
          formatOptions={meta?.formatOptions}
          locale={meta?.locale}
        />
      )
    case 'boolean':
      return <BooleanFieldDisplay value={value as boolean | null} />
    case 'select':
      return <SelectFieldDisplay value={value as string | null} options={meta?.options} size={tableSize} />
    case 'multiSelect':
      return (
        <MultiSelectFieldDisplay
          value={value as string[] | null}
          options={meta?.options}
          wrap={wrap}
        />
      )
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

  const span = (
    <span ref={ref} className={cn('truncate min-w-0', className)}>
      {children}
    </span>
  )

  if (!isTruncated) return span

  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

function DataTableInner<TData>(
  {
    columns,
    data,
    size = 'md',
    autoRowHeight = false,
    height = '400px',
    overscan = 5,
    emptyState,
    enableHover = true,
    bordered,
    estimateRowHeight = 36,
    tableOptions,
    rowActions,
    rowActionsAlwaysVisible = false,
    pinnedLeftColumns,
    pinnedRightColumns,
    className,
    ...props
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
      columnPinning: {
        left: pinnedLeftColumns ?? [],
        right: pinnedRightColumns ?? [],
      },
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

  // 三區域欄位分組
  const leftCols = table.getLeftVisibleLeafColumns()
  const centerCols = table.getCenterVisibleLeafColumns()
  const rightCols = table.getRightVisibleLeafColumns()
  const hasLeft = leftCols.length > 0
  const hasRight = rightCols.length > 0 || !!rowActions

  // 共用垂直 scroll container
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const tableRef = React.useRef<HTMLDivElement>(null)

  // Virtual scrolling — 指向共用垂直 scroll container
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    enabled: useVirtual,
  })

  // ── Cross-region row hover（ref-based, zero re-render）──
  const hoveredRowRef = React.useRef<number | null>(null)

  const onRowEnter = React.useCallback((index: number) => {
    hoveredRowRef.current = index
    tableRef.current?.querySelectorAll(`[data-row-index="${index}"]`)
      .forEach(el => (el as HTMLElement).dataset.hovered = '')
  }, [])

  const onRowLeave = React.useCallback((index: number) => {
    hoveredRowRef.current = null
    tableRef.current?.querySelectorAll(`[data-row-index="${index}"]`)
      .forEach(el => delete (el as HTMLElement).dataset.hovered)
  }, [])

  // ── Render a single cell ──
  const renderCell = (cell: Cell<TData, unknown>) => {
    const meta = cell.column.columnDef.meta
    const wrap = autoRowHeight && meta?.wrap === true
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    const isCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'link'

    const content = colType
      ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size)
      : flexRender(cell.column.columnDef.cell, cell.getContext())

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
        )}
        style={{
          width: cell.column.getSize(),
          minWidth: cell.column.columnDef.minSize,
          maxWidth: cell.column.columnDef.maxSize,
          ...cellPadding,
        }}
      >
        {wrap ? (
          <span className="break-words min-w-0">{content}</span>
        ) : isCompound ? (
          content
        ) : (
          <TruncateCell>{content}</TruncateCell>
        )}
      </div>
    )
  }

  // ── Render header cell ──
  const renderHeaderCell = (header: Header<TData, unknown>, isLast: boolean) => {
    const headerMeta = header.column.columnDef.meta
    const headerType = headerMeta?.type as ColumnType | undefined
    const headerAlign = headerMeta?.align ?? (headerType ? columnTypeDefaults[headerType].align : undefined)

    return (
      <div
        key={header.id}
        role="columnheader"
        aria-sort={
          header.column.getIsSorted() === 'asc' ? 'ascending' :
          header.column.getIsSorted() === 'desc' ? 'descending' :
          'none'
        }
        className={cn(
          'relative flex items-center text-fg-secondary text-body font-normal shrink-0 overflow-hidden select-none',
          headerAlign === 'right' && 'text-right',
          headerAlign === 'center' && 'text-center',
        )}
        style={{
          width: header.getSize(),
          minWidth: header.column.columnDef.minSize,
          maxWidth: header.column.columnDef.maxSize,
          ...cellPadding,
        }}
      >
        <TruncateCell>
          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
        </TruncateCell>
        {!isLast && (
          <span
            className="absolute right-0 w-px bg-divider"
            style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }}
            aria-hidden
          />
        )}
      </div>
    )
  }

  // ── Render a region (header + body) ──
  const renderRegion = (
    regionType: 'left' | 'center' | 'right',
    regionHeaders: Header<TData, unknown>[],
    getCellsForRow: (row: Row<TData>) => Cell<TData, unknown>[],
  ) => {
    const isCenter = regionType === 'center'
    const isRight = regionType === 'right'

    // 計算 total width for center（確保 min-width 撐滿）
    const totalWidth = regionHeaders.reduce((acc, h) => acc + h.getSize(), 0)

    const rowHoverProps = (index: number) => enableHover ? ({
      onMouseEnter: () => onRowEnter(index),
      onMouseLeave: () => onRowLeave(index),
    }) : {}

    const renderRows = () => {
      if (isEmpty && isCenter) {
        return (
          <div className="flex items-center justify-center text-fg-muted text-body py-12">
            {emptyState ?? '沒有資料'}
          </div>
        )
      }

      if (useVirtual) {
        return (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', ...(isCenter ? { minWidth: totalWidth } : {}) }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index]
              const isLastRow = virtualRow.index === rows.length - 1
              const showBottomBorder = bordered !== false ? !isLastRow : true

              return (
                <div
                  key={row.id}
                  ref={isCenter ? virtualizer.measureElement : undefined}
                  data-index={isCenter ? virtualRow.index : undefined}
                  data-row-index={virtualRow.index}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  className={cn(
                    'flex items-stretch absolute w-full',
                    showBottomBorder && 'border-b border-divider',
                    'transition-colors data-[hovered]:bg-neutral-hover',
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  {...rowHoverProps(virtualRow.index)}
                >
                  {getCellsForRow(row).map(cell => renderCell(cell))}
                  {isRight && rowActions && renderRowActionsCell(row)}
                </div>
              )
            })}
          </div>
        )
      }

      // Non-virtual
      return (
        <>
          {rows.map((row, index) => {
            const isLastRow = index === rows.length - 1
            const showBottomBorder = bordered !== false ? !isLastRow : true

            return (
              <div
                key={row.id}
                data-row-index={index}
                role="row"
                aria-rowindex={index + 2}
                className={cn(
                  'flex items-stretch',
                  showBottomBorder && 'border-b border-divider',
                  'transition-colors data-[hovered]:bg-neutral-hover',
                )}
                {...rowHoverProps(index)}
              >
                {getCellsForRow(row).map(cell => renderCell(cell))}
                {isRight && rowActions && renderRowActionsCell(row)}
              </div>
            )
          })}
        </>
      )
    }

    return (
      <div
        className={cn(
          isCenter ? 'flex-1 min-w-0 overflow-x-auto overflow-y-hidden' : 'shrink-0 overflow-hidden',
          regionType === 'left' && hasLeft && 'border-r border-divider',
          isRight && 'border-l border-divider',
        )}
      >
        {/* Header */}
        <div role="rowgroup" className="sticky top-0 z-[2] bg-muted">
          <div className={cn(isCenter && 'w-max min-w-full')}>
            <div role="row" className="flex items-stretch border-b border-divider">
              {regionHeaders.map((header, idx) => {
                const isLastInRegion = idx === regionHeaders.length - 1
                // frozen region 的最後一個 header 不需要短分隔線（region border 已處理）
                const isLast = isLastInRegion
                return renderHeaderCell(header, isLast)
              })}
              {/* Row actions header placeholder */}
              {isRight && rowActions && (
                <div role="columnheader" className="shrink-0" style={cellPadding} />
              )}
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

  // ── Row Actions cell ──
  const renderRowActionsCell = (row: Row<TData>) => (
    <div
      role="cell"
      className={cn(
        'flex items-center justify-end shrink-0 gap-2',
        !rowActionsAlwaysVisible && 'opacity-0 transition-opacity',
      )}
      // data-hovered 驅動的 opacity 需要在 JS hover handler 處理
      style={cellPadding}
    >
      {rowActions!(row.original)}
    </div>
  )

  // ── 取得 header groups 中各 region 的 headers ──
  const headerGroups = table.getHeaderGroups()
  const firstHeaderGroup = headerGroups[0]
  const leftHeaders = firstHeaderGroup?.headers.filter(h => leftCols.some(c => c.id === h.id)) ?? []
  const centerHeaders = firstHeaderGroup?.headers.filter(h => centerCols.some(c => c.id === h.id)) ?? []
  const rightHeaders = firstHeaderGroup?.headers.filter(h => rightCols.some(c => c.id === h.id)) ?? []

  // Row actions 的 opacity 需要跟 hover 連動
  React.useEffect(() => {
    if (!rowActions || rowActionsAlwaysVisible) return
    const table = tableRef.current
    if (!table) return

    const observer = new MutationObserver(() => {
      table.querySelectorAll('[data-row-index]').forEach(row => {
        const isHovered = (row as HTMLElement).dataset.hovered !== undefined
        const actionsCell = row.querySelector('[role="cell"]:last-child')
        if (actionsCell) {
          (actionsCell as HTMLElement).style.opacity = isHovered ? '1' : '0'
        }
      })
    })
    observer.observe(table, { attributes: true, subtree: true, attributeFilter: ['data-hovered'] })
    return () => observer.disconnect()
  }, [rowActions, rowActionsAlwaysVisible])

  return (
    <div
      ref={(el) => {
        tableRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
      }}
      data-table-size={size}
      className={cn(dataTableVariants({ bordered }), className)}
      role="table"
      aria-rowcount={rows.length + 1}
      {...props}
    >
      <div
        ref={scrollRef}
        className="flex"
        style={hasHeightConstraint ? { maxHeight: height, overflowY: 'auto' } : undefined}
      >
        {/* Left pinned region */}
        {hasLeft && renderRegion('left', leftHeaders, (row) =>
          row.getVisibleCells().filter(c => leftCols.some(lc => lc.id === c.column.id))
        )}

        {/* Center scrollable region */}
        {renderRegion('center', centerHeaders, (row) =>
          row.getVisibleCells().filter(c => centerCols.some(cc => cc.id === c.column.id))
        )}

        {/* Right pinned region */}
        {hasRight && renderRegion('right', rightHeaders, (row) =>
          row.getVisibleCells().filter(c => rightCols.some(rc => rc.id === c.column.id))
        )}
      </div>
    </div>
  )
}

// forwardRef with generics
export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

;(DataTable as any).displayName = 'DataTable'

export { dataTableVariants }
