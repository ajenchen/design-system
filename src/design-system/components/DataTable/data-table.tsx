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
import { PersonDisplay, type PersonValue } from './person-display'
import { LinkDisplay } from './link-display'

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
  /** Column definitions (TanStack Table ColumnDef) */
  columns: ColumnDef<TData, any>[]
  /** Data array */
  data: TData[]
  /** Table density size */
  size?: TableSize
  /**
   * 行高模式：
   * - false（預設）：內容垂直置中，文字截斷
   * - true：內容頂部對齊，wrap 欄位可撐高 row
   */
  autoRowHeight?: boolean
  /** Height constraint for body scrolling (CSS value, e.g. '400px'). Use 'auto' for no constraint. */
  height?: string
  /** Overscan rows for virtual scrolling */
  overscan?: number
  /** Empty state content */
  emptyState?: React.ReactNode
  /** Enable row hover highlight */
  enableHover?: boolean
  /** Estimated row height hint for virtualizer (px) */
  estimateRowHeight?: number
  /** Additional TanStack Table options */
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
}

// ── Type → Display auto-resolve ─────────────────────────────────────────────
// 當 column 沒有自訂 cell renderer 時，根據 meta.type 自動選擇 Display 元件。
// 有自訂 cell 時完全跳過，不干涉。

function renderTypedValue(value: unknown, meta?: Record<string, any>, autoRowHeight?: boolean, tableSize?: 'sm' | 'md' | 'lg'): React.ReactNode {
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
    case 'link':
      return <LinkDisplay value={value as string | null} label={meta?.linkLabel} />
    default:
      return <TextFieldDisplay value={value != null ? String(value) : null} />
  }
}

// ── Cell padding ────────────────────────────────────────────────────────────
// py = (table-row - 1lh) / 2（CSS 變數，定義在 data-table.css）
// px = 12px（固定，不隨 density 變）
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
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    }
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

  // ── Render cells for a row ──
  const renderCells = (row: (typeof rows)[number]) =>
    row.getVisibleCells().map(cell => {
      const meta = cell.column.columnDef.meta
      const wrap = autoRowHeight && meta?.wrap === true
      const colType = meta?.type as ColumnType | undefined
      const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)

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
          {(() => {
            // 有 meta.type → 用 Display 自動渲染
            // 需要完全自訂 cell 的 column 不設 meta.type，直接用 cell function
            const colType = meta?.type as ColumnType | undefined
            const content = colType
              ? renderTypedValue(cell.getValue(), meta, autoRowHeight, size)
              : flexRender(cell.column.columnDef.cell, cell.getContext())

            // compound 類型：Tag 自帶截斷 tooltip，不需 wrapper
            const isCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'link'

            return wrap ? (
              <span className="break-words min-w-0">{content}</span>
            ) : isCompound ? (
              content
            ) : (
              <TruncateCell>{content}</TruncateCell>
            )
          })()}
        </div>
      )
    })

  return (
    <div
      ref={ref}
      data-table-size={size}
      className={cn(dataTableVariants({ bordered }), className)}
      role="table"
      aria-rowcount={rows.length + 1}
      {...props}
    >
      {/* ── Header ── */}
      <div
        ref={headerRef}
        role="rowgroup"
        className="bg-muted overflow-hidden"
      >
        <div className="w-max min-w-full">
          {table.getHeaderGroups().map(headerGroup => (
            <div
              key={headerGroup.id}
              role="row"
              className="flex items-stretch border-b border-divider"
            >
              {headerGroup.headers.map((header, idx) => {
                const isLast = idx === headerGroup.headers.length - 1
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
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())
                      }
                    </TruncateCell>
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
              {virtualizer.getVirtualItems().map(virtualRow => {
                const row = rows[virtualRow.index]
                const isLastRow = virtualRow.index === rows.length - 1
                const showBottomBorder = bordered !== false ? !isLastRow : true

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
              const showBottomBorder = bordered !== false ? !isLastRow : true

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
  )
}

// forwardRef with generics
export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

(DataTable as any).displayName = 'DataTable'

export { dataTableVariants }
