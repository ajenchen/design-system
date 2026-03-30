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
  /**
   * 行高模式：
   * - false（預設）：固定行高，內容垂直置中，文字截斷。適合大多數場景
   * - true：自動行高，內容頂部對齊，wrap 欄位可撐高 row。適合有描述欄位的場景
   */
  autoRowHeight?: boolean
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
  /** Estimated row height hint for virtualizer (px) */
  estimateRowHeight?: number
  /** Additional TanStack Table options */
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
  /** Container className */
  className?: string
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
  const resolvedBordered = bordered || useVirtual

  // Refs for scroll sync
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

  // ── Row + cell styles based on mode ──
  // Row 永遠 items-stretch（cell 撐滿 row 高度，divider 才能正確定位）
  // 固定行高：row 有 min-height，cell 用 items-center 居中，只有水平 padding
  // 自動行高：row 無 min-height，cell 用 items-start 頂對齊，有垂直 + 水平 padding
  const rowStyle: React.CSSProperties = autoRowHeight ? {} : { minHeight: 'var(--table-row-height)' }
  const cellPadding: React.CSSProperties = autoRowHeight
    ? {
        paddingTop: 'var(--table-cell-py)',
        paddingBottom: 'var(--table-cell-py)',
        paddingLeft: 'var(--table-cell-px)',
        paddingRight: 'var(--table-cell-px)',
      }
    : {
        paddingLeft: 'var(--table-cell-px)',
        paddingRight: 'var(--table-cell-px)',
      }

  // ── Render cells for a row ──
  const renderCells = (row: (typeof rows)[number]) =>
    row.getVisibleCells().map(cell => {
      const meta = cell.column.columnDef.meta as Record<string, any> | undefined
      const wrap = autoRowHeight && meta?.wrap === true
      const align = meta?.align as string | undefined

      return (
        <div
          key={cell.id}
          role="cell"
          className={cn(
            'flex text-foreground text-body font-normal shrink-0',
            autoRowHeight ? 'items-start' : 'items-center',
            'overflow-hidden',
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
          <span className={cn(!wrap ? 'truncate' : 'break-words', 'min-w-0')}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </span>
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
      {/* ── Header ── */}
      <div
        ref={headerRef}
        role="rowgroup"
        className="bg-muted overflow-hidden"
      >
        <div className="inline-block min-w-full">
          {table.getHeaderGroups().map(headerGroup => (
            <div
              key={headerGroup.id}
              role="row"
              className="flex items-stretch border-b border-divider"
              style={rowStyle}
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
                      'relative flex text-fg-secondary text-body font-normal shrink-0',
                      autoRowHeight ? 'items-start' : 'items-center',
                      'overflow-hidden select-none',
                    )}
                    style={{
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      maxWidth: header.column.columnDef.maxSize,
                      ...cellPadding,
                    }}
                  >
                    <span className="truncate">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())
                      }
                    </span>
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
      </div>

      {/* ── Body ── */}
      <div
        ref={bodyRef}
        role="rowgroup"
        className="overflow-x-auto"
        style={useVirtual ? { height, overflowY: 'auto' } : undefined}
        onScroll={onBodyScroll}
      >
        <div className="inline-block min-w-full">
          {isEmpty ? (
            <div className="flex items-center justify-center text-fg-muted text-body py-12">
              {emptyState ?? '沒有資料'}
            </div>
          ) : useVirtual ? (
            <div style={{ height: virtualizer.getTotalSize(), width: table.getTotalSize(), position: 'relative' }}>
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
                    style={{ ...rowStyle, transform: `translateY(${virtualRow.start}px)` }}
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
                  style={rowStyle}
                >
                  {renderCells(row)}
                </div>
              )
            })
          )}
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
