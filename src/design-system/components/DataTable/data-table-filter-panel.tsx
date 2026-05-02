// same-row-mixed-allow: header chrome corner buttons(close)跟 row inline actions(drag/trash)不在同 row
import * as React from 'react'
import { Plus, Trash2, X as XIcon, GripVertical } from 'lucide-react'
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import type { ColumnType } from './column-types'
import { OPERATOR_REGISTRY, DEFAULT_OPERATOR } from './filter-operators'

/**
 * DataTableFilterPanel — ClickUp-style 篩選 panel(MVP flat conditions)
 *
 * 對齊 ClickUp / Airtable / Notion 派 — filter 永遠 global,不 per-cell inline。
 * MVP: flat conditions(field + operator + value);Phase C.3 加 nested boolean group。
 *
 * Source-of-truth:
 * - Operator definitions:`./filter-operators.ts` `OPERATOR_REGISTRY`(SSOT,禁 hardcode op 字串)
 * - Filter state:TanStack `ColumnFiltersState`(同 `useReactTable.state.columnFilters`,
 *   Phase C.4 改 globalFilter approach 支援 N 條同 field + tree 求值)
 *
 * Phase 6 partial(2026-05-02):consume OPERATOR_REGISTRY,棄 inline ops。
 * Mode/Group/data-driven picker/auto-add row 等大重構排 Phase C.3 後續。
 */

interface FilterColumn {
  id: string
  label: string
  type?: ColumnType
}

export interface FilterCondition {
  id: string         // column id
  operator: string   // contains | equals | gt | lt
  value: unknown
}

export interface DataTableFilterPanelProps<TData> {
  columns: ColumnDef<TData, any>[]
  filters: ColumnFiltersState
  onFiltersChange: (next: ColumnFiltersState) => void
  /** Cell ⌄ menu「Filter by this」帶入的 column id;trigger 後清空 */
  prefilledColumnId?: string
  onPrefillConsumed?: () => void
  onClose?: () => void
  className?: string
}

/**
 * Operator options derived from `OPERATOR_REGISTRY` SSOT.
 * Falls back to `string` ops if columnType missing or unknown.
 */
function getOperatorOptions(type?: ColumnType): SelectOption[] {
  const registry = type && OPERATOR_REGISTRY[type] ? OPERATOR_REGISTRY[type] : OPERATOR_REGISTRY.string
  return registry.map((op) => ({ value: op.op, label: op.label }))
}

/** Default op for given columnType — from SSOT, fallback `contains`(string default) */
function getDefaultOperator(type?: ColumnType): string {
  return (type && DEFAULT_OPERATOR[type]) || DEFAULT_OPERATOR.string
}

function extractColumns<TData>(columns: ColumnDef<TData, any>[]): FilterColumn[] {
  const out: FilterColumn[] = []
  for (const col of columns) {
    const id = (col as any).id ?? (col as any).accessorKey
    if (!id || id === '__select__') continue
    // Filterable iff: accessor column + meta.type set + meta.filterable !== false
    // (對齊 advanced-filter.draft.md Section 6.5 + Notion/Airtable/Linear idiom)
    const meta = (col as any).meta
    const type: ColumnType | undefined = meta?.type
    if (!type) continue                             // 無 type 不列(無法決定 op set)
    if (meta?.filterable === false) continue        // 顯式 opt-out
    const headerVal = (col as any).header
    const label = typeof headerVal === 'string' ? headerVal : String(id)
    out.push({ id: String(id), label, type })
  }
  return out
}

// ColumnFilter value:封裝 { operator, value } 以共存 — TanStack value 是 unknown,我們塞 object
type WrappedValue = { operator: string; value: unknown }
const isWrappedValue = (v: unknown): v is WrappedValue =>
  typeof v === 'object' && v !== null && 'operator' in v && 'value' in v

function unwrapFilters(filters: ColumnFiltersState): FilterCondition[] {
  return filters.map((f) => {
    if (isWrappedValue(f.value)) {
      return { id: f.id, operator: f.value.operator, value: f.value.value }
    }
    // legacy / external set:預設 contains
    return { id: f.id, operator: 'contains', value: f.value }
  })
}
function wrapFilters(conditions: FilterCondition[]): ColumnFiltersState {
  return conditions.map((c) => ({
    id: c.id,
    value: { operator: c.operator, value: c.value } as WrappedValue,
  }))
}

export function DataTableFilterPanel<TData>({
  columns,
  filters,
  onFiltersChange,
  prefilledColumnId,
  onPrefillConsumed,
  onClose,
  className,
}: DataTableFilterPanelProps<TData>) {
  const filterableColumns = React.useMemo(() => extractColumns(columns), [columns])
  const fieldOptions: SelectOption[] = React.useMemo(
    () => filterableColumns.map((c) => ({ value: c.id, label: c.label })),
    [filterableColumns]
  )

  const conditions = React.useMemo(() => unwrapFilters(filters), [filters])

  // Prefill:cell ⌄ menu「Filter by this」帶入 column id → 自動加一條空 condition for that field
  React.useEffect(() => {
    if (!prefilledColumnId) return
    const exists = conditions.some((c) => c.id === prefilledColumnId)
    if (!exists) {
      const colInfo = filterableColumns.find((c) => c.id === prefilledColumnId)
      if (colInfo) {
        const next: FilterCondition[] = [
          ...conditions,
          { id: prefilledColumnId, operator: getDefaultOperator(colInfo.type), value: '' },
        ]
        onFiltersChange(wrapFilters(next))
      }
    }
    onPrefillConsumed?.()
  }, [prefilledColumnId])  // eslint-disable-line react-hooks/exhaustive-deps

  const setConditions = (next: FilterCondition[]) => onFiltersChange(wrapFilters(next))

  const updateAt = (index: number, patch: Partial<FilterCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  const removeAt = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }
  const addCondition = () => {
    const firstCol = filterableColumns[0]
    if (!firstCol) return
    setConditions([...conditions, { id: firstCol.id, operator: getDefaultOperator(firstCol.type), value: '' }])
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = conditions.findIndex((c) => c.id === active.id)
    const newIndex = conditions.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = [...conditions]
    const [moved] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, moved)
    setConditions(next)
  }

  return (
    <div className={cn('w-[560px]', className)}>
      <SurfaceHeader>
        <div className="flex items-center gap-1 w-full min-w-0">
          <PopoverTitle className="flex-1">篩選</PopoverTitle>
          {onClose && (
            <PopoverClose asChild>
              <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" onClick={onClose} />
            </PopoverClose>
          )}
        </div>
      </SurfaceHeader>

      <SurfaceBody className="flex flex-col gap-2">
        {conditions.length === 0 ? (
          <div className="text-body text-fg-muted py-2">尚未設定篩選條件</div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={conditions.map(c => `${c.id}-${conditions.indexOf(c)}`)} strategy={verticalListSortingStrategy}>
              {conditions.map((condition, index) => {
                const colInfo = filterableColumns.find((c) => c.id === condition.id)
                const operatorOptions = getOperatorOptions(colInfo?.type)
                return (
                  <FilterRow
                    key={`${condition.id}-${index}`}
                    rowId={`${condition.id}-${index}`}
                    condition={condition}
                    fieldOptions={fieldOptions}
                    operatorOptions={operatorOptions}
                    onChangeField={(v) => {
                      const newCol = filterableColumns.find((c) => c.id === v)
                      updateAt(index, { id: v, operator: getDefaultOperator(newCol?.type), value: '' })
                    }}
                    onChangeOperator={(v) => updateAt(index, { operator: v })}
                    onChangeValue={(v) => updateAt(index, { value: v })}
                    onRemove={() => removeAt(index)}
                  />
                )
              })}
            </SortableContext>
          </DndContext>
        )}
      </SurfaceBody>

      <SurfaceFooter className="justify-start">
        <Button variant="tertiary" size="sm" startIcon={Plus} onClick={addCondition}>加條件</Button>
      </SurfaceFooter>
    </div>
  )
}

// FilterRow:DnD-enabled row,GripVertical 為 drag handle。
function FilterRow({
  rowId, condition, fieldOptions, operatorOptions,
  onChangeField, onChangeOperator, onChangeValue, onRemove,
}: {
  rowId: string
  condition: FilterCondition
  fieldOptions: SelectOption[]
  operatorOptions: SelectOption[]
  onChangeField: (v: string) => void
  onChangeOperator: (v: string) => void
  onChangeValue: (v: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowId })
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
      <div className="w-40 shrink-0">
        <Select size="md" options={fieldOptions} value={condition.id} onChange={onChangeField} />
      </div>
      <div className="w-28 shrink-0">
        <Select size="md" options={operatorOptions} value={condition.operator} onChange={onChangeOperator} />
      </div>
      <div className="flex-1 min-w-0">
        <Input
          size="md"
          value={String(condition.value ?? '')}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder="輸入值…"
        />
      </div>
      {/* Trash 走 ItemInlineActionButton(same-row consistency canonical)*/}
      <ItemInlineActionButton icon={Trash2} size="md" aria-label="刪除" onClick={onRemove} />
    </div>
  )
}

DataTableFilterPanel.displayName = 'DataTableFilterPanel'

/**
 * Filter helper:適用 TanStack `getFilteredRowModel` 的 filterFn 推斷。
 *
 * 在 useReactTable consumer 處,把 column 的 filterFn 設為:
 *   filterFn: (row, columnId, filterValue) => dataTableFilterMatch(row.getValue(columnId), filterValue)
 *
 * 對齊 wrapFilters 的 WrappedValue 格式。
 */
export function dataTableFilterMatch(cellValue: unknown, filterValue: unknown): boolean {
  if (!isWrappedValue(filterValue)) {
    // legacy:fallback contains
    return String(cellValue ?? '').toLowerCase().includes(String(filterValue ?? '').toLowerCase())
  }
  const { operator, value } = filterValue
  const v = String(value ?? '').trim()
  if (v === '') return true
  const cv = cellValue
  switch (operator) {
    case 'contains':
      return String(cv ?? '').toLowerCase().includes(v.toLowerCase())
    case 'equals':
      return String(cv ?? '').toLowerCase() === v.toLowerCase()
    case 'gt': {
      const n1 = Number(cv); const n2 = Number(v)
      return Number.isFinite(n1) && Number.isFinite(n2) && n1 > n2
    }
    case 'lt': {
      const n1 = Number(cv); const n2 = Number(v)
      return Number.isFinite(n1) && Number.isFinite(n2) && n1 < n2
    }
    default:
      return true
  }
}
