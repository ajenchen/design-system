import * as React from 'react'
import { Plus, Trash2, X as XIcon, GripVertical } from 'lucide-react'
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Input } from '@/design-system/components/Input/input'

/**
 * DataTableFilterPanel — ClickUp-style 篩選 panel(MVP flat conditions)
 *
 * 對齊 ClickUp / Airtable / Notion 派 — filter 永遠 global,不 per-cell inline。
 * MVP: flat conditions(field + operator + value);phase 2 加 boolean group nesting。
 *
 * Source-of-truth: TanStack `ColumnFiltersState`(同 `useReactTable.state.columnFilters`)。
 *
 * Operator 集合 MVP 簡化(對齊 column meta type 自動推斷):
 *   string → contains(default)/ equals
 *   number / date → equals / gt / lt
 *   select → equals
 */

interface FilterColumn {
  id: string
  label: string
  type?: string
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

const STRING_OPS: SelectOption[] = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等於' },
]
const NUMBER_OPS: SelectOption[] = [
  { value: 'equals', label: '等於' },
  { value: 'gt', label: '大於' },
  { value: 'lt', label: '小於' },
]
const SELECT_OPS: SelectOption[] = [{ value: 'equals', label: '等於' }]

function getOperatorOptions(type?: string): SelectOption[] {
  switch (type) {
    case 'number':
    case 'currency':
    case 'date':
      return NUMBER_OPS
    case 'select':
      return SELECT_OPS
    default:
      return STRING_OPS
  }
}

function extractColumns<TData>(columns: ColumnDef<TData, any>[]): FilterColumn[] {
  const out: FilterColumn[] = []
  for (const col of columns) {
    const id = (col as any).id ?? (col as any).accessorKey
    if (!id || id === '__select__') continue
    const headerVal = (col as any).header
    const label = typeof headerVal === 'string' ? headerVal : String(id)
    const type = (col as any).meta?.type
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
        const ops = getOperatorOptions(colInfo.type)
        const next: FilterCondition[] = [
          ...conditions,
          { id: prefilledColumnId, operator: ops[0].value, value: '' },
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
    const ops = getOperatorOptions(firstCol.type)
    setConditions([...conditions, { id: firstCol.id, operator: ops[0].value, value: '' }])
  }

  return (
    <div className={cn('w-[560px] bg-surface-raised', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border-b border-divider">
        <div className="text-body-strong">篩選</div>
        {onClose && (
          <Button variant="text" size="sm" iconOnly startIcon={XIcon} aria-label="關閉" onClick={onClose} />
        )}
      </div>

      {/* List */}
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] flex flex-col gap-2">
        {conditions.length === 0 ? (
          <div className="text-body text-fg-muted py-2">尚未設定篩選條件</div>
        ) : (
          conditions.map((condition, index) => {
            const colInfo = filterableColumns.find((c) => c.id === condition.id)
            const operatorOptions = getOperatorOptions(colInfo?.type)
            return (
              <div key={`${condition.id}-${index}`} className="flex items-center gap-2">
                <GripVertical size={14} className="text-fg-muted shrink-0" aria-hidden />
                <div className="w-40 shrink-0">
                  <Select
                    size="sm"
                    options={fieldOptions}
                    value={condition.id}
                    onChange={(v) => {
                      const newCol = filterableColumns.find((c) => c.id === v)
                      const newOps = getOperatorOptions(newCol?.type)
                      updateAt(index, { id: v, operator: newOps[0].value, value: '' })
                    }}
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Select
                    size="sm"
                    options={operatorOptions}
                    value={condition.operator}
                    onChange={(v) => updateAt(index, { operator: v })}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Input
                    size="sm"
                    value={String(condition.value ?? '')}
                    onChange={(e) => updateAt(index, { value: e.target.value })}
                    placeholder="輸入值…"
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
        <Button variant="text" size="sm" startIcon={Plus} onClick={addCondition}>加條件</Button>
      </div>
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
