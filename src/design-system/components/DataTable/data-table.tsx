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
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type TableSize = 'sm' | 'md' | 'lg'

export interface DataTableProps<TData> {
  /** Column definitions (TanStack Table ColumnDef) */
  columns: ColumnDef<TData, any>[]
  /** Data array */
  data: TData[]
  /** Table density size */
  size?: TableSize
  /** Fixed height for virtual scrolling (CSS value, e.g. '400px'). Use 'auto' to disable virtual scrolling. */
  height?: string
  /** Overscan rows for virtual scrolling */
  overscan?: number
  /** Empty state content */
  emptyState?: React.ReactNode
  /** Enable row hover highlight */
  enableHover?: boolean
  /** Show outer border (auto-enabled when frozen columns or inline edit) */
  bordered?: boolean
  /** Estimated row height hint for virtualizer (px), actual height measured dynamically */
  estimateRowHeight?: number
  /** Additional TanStack Table options */
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
  /** Container className */
  className?: string
}

// ── Shared cell style helper ─────────────────────────────────────────────────

const cellPadding = {
  paddingTop: 'var(--table-cell-py)',
  paddingBottom: 'var(--table-cell-py)',
  paddingLeft: 'var(--table-cell-px)',
  paddingRight: 'var(--table-cell-px)',
}

// ── Component ────────────────────────────────────────────────────────────────

function DataTableInner<TData>(
  {
    columns,
    data,
    size = 'md',
    height = '400px',
    overscan = 5,
    emptyState,
    enableHover = true,
    bordered = false,
    estimateRowHeight = 36,
    tableOptions,
    className,
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
      ...tableOptions?.state,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...tableOptions,
  })

  const { rows } = table.getRowModel()
  const isEmpty = rows.length === 0
  const useVirtual = height !== 'auto' && !isEmpty

  // Virtual scrolling (only when height is fixed)
  const parentRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    enabled: useVirtual,
  })

  // ── Render a single row ──
  const renderRow = (row: (typeof rows)[number], index: number) => {
    const isLastRow = index === rows.length - 1
    const showBottomBorder = bordered ? !isLastRow : true

    return row.getVisibleCells().map(cell => {
      const meta = cell.column.columnDef.meta as Record<string, any> | undefined
      const wrap = meta?.wrap === true
      const align = meta?.align as string | undefined

      return (
        <div
          key={cell.id}
          role="cell"
          className={cn(
            'text-foreground text-body font-normal',
            !wrap && 'truncate',
            wrap && 'break-words',
            align === 'right' && 'text-right',
            align === 'center' && 'text-center',
          )}
          style={{
            width: cell.column.getSize(),
            minWidth: cell.column.columnDef.minSize,
            maxWidth: cell.column.columnDef.maxSize,
            ...cellPadding,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      )
    })
  }

  return (
    <div
      ref={ref}
      data-table-size={size}
      className={cn(
        'bg-surface rounded-md overflow-hidden',
        bordered && 'border border-border',
        className,
      )}
      role="table"
      aria-rowcount={rows.length + 1}
    >
      {/* ── Header ── */}
      <div role="rowgroup" className="bg-muted">
        {table.getHeaderGroups().map(headerGroup => (
          <div
            key={headerGroup.id}
            role="row"
            className="flex items-stretch border-b border-divider"
          >
            {headerGroup.headers.map((header, idx) => {
              const isLast = idx === headerGroup.headers.length - 1
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
                    'relative flex items-start text-fg-secondary text-body font-normal',
                    'truncate select-none',
                  )}
                  style={{
                    width: header.getSize(),
                    minWidth: header.column.columnDef.minSize,
                    maxWidth: header.column.columnDef.maxSize,
                    ...cellPadding,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  }
                  {!isLast && (
                    <span
                      className="absolute right-0 w-px bg-divider"
                      style={{
                        top: 'var(--table-cell-py)',
                        bottom: 'var(--table-cell-py)',
                      }}
                      aria-hidden
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Body ── */}
      <div
        ref={parentRef}
        role="rowgroup"
        className={cn(useVirtual && 'overflow-auto')}
        style={useVirtual ? { height } : undefined}
      >
        {isEmpty ? (
          <div className="flex items-center justify-center text-fg-muted text-body py-12">
            {emptyState ?? '沒有資料'}
          </div>
        ) : useVirtual ? (
          /* Virtual rows */
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index]
              const isLastRow = virtualRow.index === rows.length - 1
              const showBottomBorder = bordered ? !isLastRow : true

              return (
                <div
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  className={cn(
                    'flex items-stretch absolute w-full',
                    showBottomBorder && 'border-b border-divider',
                    enableHover && 'hover:bg-neutral-hover transition-colors',
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderRow(row, virtualRow.index)}
                </div>
              )
            })}
          </div>
        ) : (
          /* Static rows (height="auto") */
          rows.map((row, index) => {
            const isLastRow = index === rows.length - 1
            const showBottomBorder = bordered ? !isLastRow : true

            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={index + 2}
                className={cn(
                  'flex items-stretch',
                  showBottomBorder && 'border-b border-divider',
                  enableHover && 'hover:bg-neutral-hover transition-colors',
                )}
              >
                {renderRow(row, index)}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// forwardRef with generics
export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

(DataTable as any).displayName = 'DataTable'
