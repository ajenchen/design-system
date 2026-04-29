import * as React from 'react'
import { Plus, Trash2, X as XIcon, RotateCcw, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'

/**
 * DataTableSortManager — Notion-style 多欄排序管理 panel
 *
 * 對齊 ref/進階篩選/sort.png 設計:
 *   Header(title + refresh + close)/ list(field + direction + delete + reorder)/
 *   footer(+ 加排序)。
 *
 * Source-of-truth: TanStack `SortingState`(同 `useReactTable.state.sorting`)。
 * 跟 cell click sort 共享 state — single source-of-truth across cell + panel。
 *
 * MVP: reorder 用 ↑/↓ button(DnD 留 phase 2 跟 column reorder 一起做)。
 */

interface SortColumn {
  id: string
  label: string
  enableSorting?: boolean
}

export interface DataTableSortManagerProps<TData> {
  /** 可排序欄位來源(讀 columnDef.header / id);會自動排除 enableSorting=false */
  columns: ColumnDef<TData, any>[]
  /** 當前排序 state(TanStack SortingState) */
  sorting: SortingState
  /** 排序變更 callback */
  onSortingChange: (next: SortingState) => void
  /** Refresh 按鈕點擊(可選 — 重置或外部 refetch) */
  onReset?: () => void
  /** Close 按鈕點擊(若有 — 通常是包在 Popover 外層的 close 行為) */
  onClose?: () => void
  className?: string
}

function extractColumns<TData>(columns: ColumnDef<TData, any>[]): SortColumn[] {
  const out: SortColumn[] = []
  for (const col of columns) {
    const id = (col as any).id ?? (col as any).accessorKey
    if (!id || id === '__select__') continue
    if (col.enableSorting === false) continue
    const headerVal = (col as any).header
    const label = typeof headerVal === 'string' ? headerVal : String(id)
    out.push({ id: String(id), label, enableSorting: true })
  }
  return out
}

const DIRECTION_OPTIONS: SelectOption[] = [
  { value: 'asc', label: '升冪' },
  { value: 'desc', label: '降冪' },
]

export function DataTableSortManager<TData>({
  columns,
  sorting,
  onSortingChange,
  onReset,
  onClose,
  className,
}: DataTableSortManagerProps<TData>) {
  const sortableColumns = React.useMemo(() => extractColumns(columns), [columns])
  const fieldOptions: SelectOption[] = React.useMemo(
    () => sortableColumns.map((c) => ({ value: c.id, label: c.label })),
    [sortableColumns]
  )

  const updateAt = (index: number, patch: Partial<{ id: string; desc: boolean }>) => {
    const next = sorting.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onSortingChange(next)
  }
  const removeAt = (index: number) => {
    onSortingChange(sorting.filter((_, i) => i !== index))
  }
  const moveUp = (index: number) => {
    if (index === 0) return
    const next = [...sorting]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onSortingChange(next)
  }
  const moveDown = (index: number) => {
    if (index === sorting.length - 1) return
    const next = [...sorting]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onSortingChange(next)
  }
  const addSort = () => {
    const used = new Set(sorting.map((s) => s.id))
    const firstUnused = sortableColumns.find((c) => !used.has(c.id))
    if (!firstUnused) return
    onSortingChange([...sorting, { id: firstUnused.id, desc: false }])
  }

  return (
    <div className={cn('w-[480px] bg-surface-raised', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-b border-divider">
        <div className="text-body-strong">排序</div>
        <div className="flex items-center gap-1">
          {onReset && (
            <Button variant="text" size="sm" iconOnly startIcon={RotateCcw} aria-label="重置" onClick={onReset} />
          )}
          {onClose && (
            <Button variant="text" size="sm" iconOnly startIcon={XIcon} aria-label="關閉" onClick={onClose} />
          )}
        </div>
      </div>

      {/* List */}
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] flex flex-col gap-2">
        {sorting.length === 0 ? (
          <div className="text-body text-fg-muted py-2">尚未設定排序條件</div>
        ) : (
          sorting.map((sort, index) => {
            const usedByOthers = new Set(sorting.filter((_, i) => i !== index).map((s) => s.id))
            const optionsForRow = fieldOptions.filter((o) => !usedByOthers.has(o.value))
            return (
              <div key={`${sort.id}-${index}`} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="向上移動"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="text-fg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="向下移動"
                    onClick={() => moveDown(index)}
                    disabled={index === sorting.length - 1}
                    className="text-fg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
                <GripVertical size={14} className="text-fg-muted shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <Select
                    size="sm"
                    options={optionsForRow}
                    value={sort.id}
                    onChange={(v) => updateAt(index, { id: v })}
                  />
                </div>
                <div className="w-32 shrink-0">
                  <Select
                    size="sm"
                    options={DIRECTION_OPTIONS}
                    value={sort.desc ? 'desc' : 'asc'}
                    onChange={(v) => updateAt(index, { desc: v === 'desc' })}
                  />
                </div>
                <Button variant="text" size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={() => removeAt(index)} />
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-t border-divider">
        <Button
          variant="text"
          size="sm"
          startIcon={Plus}
          onClick={addSort}
          disabled={sorting.length >= sortableColumns.length}
        >
          加排序
        </Button>
      </div>
    </div>
  )
}

DataTableSortManager.displayName = 'DataTableSortManager'
