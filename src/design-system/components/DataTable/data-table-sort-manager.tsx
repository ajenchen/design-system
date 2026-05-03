// same-row-mixed-allow: header chrome corner buttons(refresh/close)跟 row inline actions(drag/trash)不在同 row
import * as React from 'react'
import { Plus, Trash2, X as XIcon, RotateCcw, GripVertical } from 'lucide-react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { getColumnId, getColumnLabel } from './lib/column-meta'

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
    const id = getColumnId(col)
    if (!id || id === '__select__') continue
    if (col.enableSorting === false) continue
    out.push({ id, label: getColumnLabel(col, id), enableSorting: true })
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
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorting.findIndex((s) => s.id === active.id)
    const newIndex = sorting.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = [...sorting]
    const [moved] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, moved)
    onSortingChange(next)
  }
  const addSort = () => {
    const used = new Set(sorting.map((s) => s.id))
    const firstUnused = sortableColumns.find((c) => !used.has(c.id))
    if (!firstUnused) return
    onSortingChange([...sorting, { id: firstUnused.id, desc: false }])
  }

  return (
    <div className={cn('w-[480px]', className)}>
      <SurfaceHeader>
        <div className="flex items-center gap-1 w-full min-w-0">
          <PopoverTitle className="flex-1">排序</PopoverTitle>
          {onReset && sorting.length > 0 && (
            <>
              <Button variant="text" size="sm" iconOnly startIcon={RotateCcw} aria-label="重置" onClick={onReset} />
              <ButtonDivider />
            </>
          )}
          {onClose && (
            <PopoverClose asChild>
              <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" onClick={onClose} />
            </PopoverClose>
          )}
        </div>
      </SurfaceHeader>

      <SurfaceBody className="flex flex-col gap-2">
        {sorting.length === 0 ? (
          <div className="text-body text-fg-muted py-2">尚未設定排序條件</div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sorting.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sorting.map((sort, index) => {
                const usedByOthers = new Set(sorting.filter((_, i) => i !== index).map((s) => s.id))
                const optionsForRow = fieldOptions.filter((o) => !usedByOthers.has(o.value))
                return (
                  <SortRow
                    key={sort.id}
                    sort={sort}
                    optionsForRow={optionsForRow}
                    onChangeId={(v) => updateAt(index, { id: v })}
                    onChangeDir={(v) => updateAt(index, { desc: v === 'desc' })}
                    onRemove={() => removeAt(index)}
                  />
                )
              })}
            </SortableContext>
          </DndContext>
        )}
      </SurfaceBody>

      <SurfaceFooter className="justify-start">
        <Button
          variant="tertiary"
          size="sm"
          startIcon={Plus}
          onClick={addSort}
          disabled={sorting.length >= sortableColumns.length}
        >
          加排序
        </Button>
      </SurfaceFooter>
    </div>
  )
}

DataTableSortManager.displayName = 'DataTableSortManager'

// SortRow:DnD-enabled row。GripVertical 為 drag listener handle(對齊 Notion / Airtable 拖曳 idiom)。
function SortRow({
  sort, optionsForRow, onChangeId, onChangeDir, onRemove,
}: {
  sort: { id: string; desc: boolean }
  optionsForRow: SelectOption[]
  onChangeId: (v: string) => void
  onChangeDir: (v: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sort.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <ItemInlineActionButton
        icon={GripVertical}
        size="md"
        aria-label="拖曳重排"
        className="cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      />
      <div className="flex-1 min-w-0">
        <Select size="md" options={optionsForRow} value={sort.id} onChange={onChangeId} />
      </div>
      <div className="w-32 shrink-0">
        <Select size="md" options={DIRECTION_OPTIONS} value={sort.desc ? 'desc' : 'asc'} onChange={onChangeDir} />
      </div>
      {/* Trash 走 ItemInlineActionButton(same-row consistency:同 row 不混 Inline Action + Button)*/}
      <ItemInlineActionButton icon={Trash2} size="md" aria-label="刪除" onClick={onRemove} />
    </div>
  )
}
