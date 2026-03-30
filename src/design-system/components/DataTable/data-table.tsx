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
  /** Show outer border */
  bordered?: boolean
  /** Estimated row height hint for virtualizer (px), actual height measured dynamically */
  estimateRowHeight?: number
  /** Additional TanStack Table options */
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
  /** Container className */
  className?: string
}

// ── Shared cell style ────────────────────────────────────────────────────────

const cellPadding: React.CSSProperties = {
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

  // 固定高度 = 有隱藏內容 = 自動加邊框
  const resolvedBordered = bordered || useVirtual

  // Scroll container ref — handles both horizontal + vertical (virtual mode) scrolling
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    enabled: useVirtual,
  })

  // ── Render cells for a row ──
  const renderCells = (row: (typeof rows)[number]) =>
    row.getVisibleCells().map(cell => {
      const meta = cell.column.columnDef.meta as Record<string, any> | undefined
      const wrap = meta?.wrap === true
      const align = meta?.align as string | undefined

      return (
        <div
          key={cell.id}
          role="cell"
          className={cn(
            'text-foreground text-body font-normal shrink-0',
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

  return (
    <div
      ref={ref}
      data-table-size={size}
      className={cn(
        'bg-surface rounded-md overflow-hidden',
        resolvedBordered && 'border border-border',
        className,
      )}
      role="table"
      aria-rowcount={rows.length + 1}
    >
      {/*
        Single scroll container:
        - overflow-x-auto: horizontal scroll (header + body move together)
        - overflow-y-auto (virtual mode): vertical scroll
        - Header uses sticky top-0 to stay visible during vertical scroll
        - inline-block min-w-full inner wrapper ensures width = max(container, content)
      */}
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto',
          useVirtual && 'overflow-y-auto',
        )}
        style={useVirtual ? { height } : undefined}
      >
        <div className="inline-block min-w-full">

          {/* ── Header ── */}
          <div
            role="rowgroup"
            className={cn(
              useVirtual ? 'sticky top-0 z-10' : 'bg-muted',
            )}
            style={useVirtual ? {
              // sticky 時自帶不透明底：canvas（不透明）+ muted（半透明疊加）
              // 避免 body rows 滑到底下時透出
              background: 'linear-gradient(var(--muted), var(--muted)) var(--canvas)',
            } : undefined}
          >
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
                        'relative flex items-start text-fg-secondary text-body font-normal shrink-0',
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
          <div role="rowgroup">
            {isEmpty ? (
              <div className="flex items-center justify-center text-fg-muted text-body py-12">
                {emptyState ?? '沒有資料'}
              </div>
            ) : useVirtual ? (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map(virtualRow => {
                  const row = rows[virtualRow.index]
                  const isLastRow = virtualRow.index === rows.length - 1
                  const showBottomBorder = resolvedBordered ? !isLastRow : true

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
                      {renderCells(row)}
                    </div>
                  )
                })}
              </div>
            ) : (
              rows.map((row, index) => {
                const isLastRow = index === rows.length - 1
                const showBottomBorder = resolvedBordered ? !isLastRow : true

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
                    {renderCells(row)}
                  </div>
                )
              })
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// forwardRef with generics
export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

(DataTable as any).displayName = 'DataTable'
