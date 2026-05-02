// same-row-mixed-allow: header chrome corner buttons(close)跟 row inline actions(trash)不在同 row
import * as React from 'react'
import { Plus, Trash2, X as XIcon, RotateCcw } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { DatePicker, DatePickerRange } from '@/design-system/components/DatePicker/date-picker'
import { DateTimePicker, DateTimeRangePicker } from './date-time-picker'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import type { ColumnType } from './column-types'
import {
  OPERATOR_REGISTRY,
  DEFAULT_OPERATOR,
  DATE_RELATIVE_OPTIONS,
  getOperatorSpec,
  getValueShape,
  type OperatorSpec,
  type ValueShape,
} from './filter-operators'

/**
 * DataTableFilterPanel — ClickUp-style 進階篩選 panel
 *
 * 對齊 ClickUp / Airtable / Notion / Coda / Linear advanced-filter 派 —
 * parenthesized boolean expression builder。
 *
 * 兩種 mode 由 consumer 拍板:
 * - `flat`:root 下只能裝 condition,無 group
 * - `nested`:root 下裝 1+ group(灰底框),每個 group 內裝 1+ condition,**剛好 1 層**
 *
 * Source-of-truth:
 * - Operator definitions:`./filter-operators.ts` `OPERATOR_REGISTRY`(SSOT,禁 hardcode op 字串)
 * - Filter state:**FilterTree**(本檔自管;搭配 TanStack `globalFilter` 求值)
 *
 * 詳:`./advanced-filter.draft.md` + `./advanced-filter-operators.draft.md`
 */

// ── Types ────────────────────────────────────────────────────────────────

export type Conjunction = 'and' | 'or'

export interface FilterCondition {
  kind: 'cond'
  /** 唯一 row id(stable across renders) */
  id: string
  /** 對應 column id;空字串 = 尚未選 field(operator/value picker disabled) */
  field: string
  /** OperatorSpec.op key — 對齊 OPERATOR_REGISTRY */
  op: string
  /** 依 ValueShape 解讀的值 */
  value: unknown
}

export interface FilterGroup {
  kind: 'group'
  id: string
  /** group 內 children 共用的 join(全 AND 或全 OR;不允許混) */
  conjunction: Conjunction
  /** ⚠️ 型別鎖死:children 只能 condition,不可再 nested group(1-level cap) */
  children: FilterCondition[]
}

export type FilterTreeFlat = {
  mode: 'flat'
  conjunction: Conjunction
  children: FilterCondition[]
}

export type FilterTreeNested = {
  mode: 'nested'
  conjunction: Conjunction
  children: FilterGroup[]
}

export type FilterTree = FilterTreeFlat | FilterTreeNested

// ── Helpers — public API ────────────────────────────────────────────────

let _idSeed = 0
const newId = () => `f${++_idSeed}-${Date.now().toString(36)}`

/** Empty FilterTree — consumer 用來 init useState */
export function createEmptyFilterTree(mode: 'flat'): FilterTreeFlat
export function createEmptyFilterTree(mode: 'nested'): FilterTreeNested
export function createEmptyFilterTree(mode: 'flat' | 'nested'): FilterTree {
  if (mode === 'flat') return { mode: 'flat', conjunction: 'and', children: [] }
  return { mode: 'nested', conjunction: 'and', children: [] }
}

/** 是否有任何 active filter — DataTable trigger button checked state 用 */
export function isFilterTreeActive(tree: FilterTree): boolean {
  if (tree.mode === 'flat') {
    return tree.children.some((c) => isConditionComplete(c))
  }
  return tree.children.some((g) => g.children.some((c) => isConditionComplete(c)))
}

/** Condition 是否「已填齊」可參與 filter 求值 */
function isConditionComplete(c: FilterCondition): boolean {
  if (!c.field || !c.op) return false
  const spec = getOperatorSpec_loose(c.field, c.op)
  if (!spec) return false
  if (spec.valueShape === 'none') return true
  return c.value !== '' && c.value !== null && c.value !== undefined
}

/** loose lookup — field 用 column id,我們不知 columnType,試所有 type */
function getOperatorSpec_loose(_field: string, op: string): OperatorSpec | null {
  for (const list of Object.values(OPERATOR_REGISTRY)) {
    const found = list.find((o) => o.op === op)
    if (found) return found
  }
  return null
}

// ── Helpers — internal types ────────────────────────────────────────────

interface FilterColumn {
  id: string
  label: string
  type: ColumnType
  options?: Array<{ value: string; label: string }>
  includeTime?: boolean
}

function extractColumns<TData>(columns: ColumnDef<TData, any>[]): FilterColumn[] {
  const out: FilterColumn[] = []
  for (const col of columns) {
    const id = (col as any).id ?? (col as any).accessorKey
    if (!id || id === '__select__') continue
    const meta = (col as any).meta
    const type: ColumnType | undefined = meta?.type
    if (!type) continue
    if (meta?.filterable === false) continue
    const headerVal = (col as any).header
    const label = typeof headerVal === 'string' ? headerVal : String(id)
    out.push({
      id: String(id),
      label,
      type,
      options: meta?.options,
      includeTime: meta?.includeTime,
    })
  }
  return out
}

function getOperatorOptions(type?: ColumnType): SelectOption[] {
  const registry = type && OPERATOR_REGISTRY[type] ? OPERATOR_REGISTRY[type] : OPERATOR_REGISTRY.string
  return registry.map((op) => ({ value: op.op, label: op.label }))
}

function getDefaultOperator(type?: ColumnType): string {
  return (type && DEFAULT_OPERATOR[type]) || DEFAULT_OPERATOR.string
}

const newCondition = (firstCol: FilterColumn | undefined): FilterCondition => ({
  kind: 'cond',
  id: newId(),
  field: firstCol?.id ?? '',
  op: firstCol ? getDefaultOperator(firstCol.type) : '',
  value: '',
})

const newGroup = (firstCol: FilterColumn | undefined): FilterGroup => ({
  kind: 'group',
  id: newId(),
  conjunction: 'or',                                // group 內 default OR(對齊 ref 圖)
  children: [newCondition(firstCol)],
})

// ── Component Props ─────────────────────────────────────────────────────

export interface DataTableFilterPanelProps<TData> {
  /** flat(無 group)or nested(1-level group)— consumer 拍板 */
  mode: 'flat' | 'nested'
  /** 可被 filter 的 columns */
  columns: ColumnDef<TData, any>[]
  /** 當前 FilterTree(controlled) */
  value: FilterTree
  /** state 變更 callback */
  onChange: (next: FilterTree) => void
  /**
   * 管理員 set-as-default 的 baseline(refresh icon 顯示判定用)。
   * 當 `value` ≠ `defaultValue`(deep equal)→ panel header 顯示 refresh icon,
   * click → reset 回 defaultValue。對齊 sort 邏輯(相同 modified-from-default UX)。
   */
  defaultValue?: FilterTree
  /** Cell ⌄ menu「Filter by this」帶入的 column id(自動 add 一條 condition) */
  prefilledColumnId?: string
  onPrefillConsumed?: () => void
  onClose?: () => void
  className?: string
}

/**
 * Deep-equal compare for FilterTree(structural,忽略 row id 因 refresh-detection
 * 不應該被內部 id 干擾)。
 */
function isFilterTreeEqual(a: FilterTree, b: FilterTree): boolean {
  if (a.mode !== b.mode || a.conjunction !== b.conjunction) return false
  if (a.children.length !== b.children.length) return false
  if (a.mode === 'flat' && b.mode === 'flat') {
    return a.children.every((c, i) => isConditionEqual(c, b.children[i]))
  }
  if (a.mode === 'nested' && b.mode === 'nested') {
    return a.children.every((g, i) => isGroupEqual(g, b.children[i]))
  }
  return false
}

function isGroupEqual(a: FilterGroup, b: FilterGroup): boolean {
  if (a.conjunction !== b.conjunction) return false
  if (a.children.length !== b.children.length) return false
  return a.children.every((c, i) => isConditionEqual(c, b.children[i]))
}

function isConditionEqual(a: FilterCondition, b: FilterCondition): boolean {
  if (a.field !== b.field || a.op !== b.op) return false
  return JSON.stringify(a.value) === JSON.stringify(b.value)
}

// ── Main Component ──────────────────────────────────────────────────────

export function DataTableFilterPanel<TData>({
  mode,
  columns,
  value,
  onChange,
  defaultValue,
  prefilledColumnId,
  onPrefillConsumed,
  onClose,
  className,
}: DataTableFilterPanelProps<TData>) {
  const filterableColumns = React.useMemo(() => extractColumns(columns), [columns])
  const fieldOptions: SelectOption[] = React.useMemo(
    () => filterableColumns.map((c) => ({ value: c.id, label: c.label })),
    [filterableColumns],
  )
  const firstCol = filterableColumns[0]

  // 對齊 ref 圖 — 開啟時若空,自動加 1 條空 row(flat)or 1 個 group 含 1 條空 row(nested)
  React.useEffect(() => {
    if (filterableColumns.length === 0) return
    if (value.mode !== mode) return                  // mode 不一致時 consumer 須先修
    if (value.children.length > 0) return
    if (value.mode === 'flat') {
      onChange({ ...value, children: [newCondition(firstCol)] })
    } else {
      onChange({ ...value, children: [newGroup(firstCol)] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prefill from cell ⌄ menu「Filter by this」
  React.useEffect(() => {
    if (!prefilledColumnId) return
    const colInfo = filterableColumns.find((c) => c.id === prefilledColumnId)
    if (colInfo) {
      const cond: FilterCondition = {
        kind: 'cond',
        id: newId(),
        field: prefilledColumnId,
        op: getDefaultOperator(colInfo.type),
        value: '',
      }
      if (value.mode === 'flat') {
        onChange({ ...value, children: [...value.children, cond] })
      } else {
        // nested mode:add 到第 1 個 group(若無則新建)
        if (value.children.length === 0) {
          onChange({ ...value, children: [{ ...newGroup(colInfo), children: [cond] }] })
        } else {
          const updatedGroups = value.children.map((g, i) =>
            i === 0 ? { ...g, children: [...g.children, cond] } : g
          )
          onChange({ ...value, children: updatedGroups })
        }
      }
    }
    onPrefillConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledColumnId])

  // ── flat-mode mutators ──
  const flatTree = value.mode === 'flat' ? value : null
  const updateFlatCondition = (id: string, patch: Partial<FilterCondition>) => {
    if (!flatTree) return
    onChange({
      ...flatTree,
      children: flatTree.children.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
  }
  const removeFlatCondition = (id: string) => {
    if (!flatTree) return
    onChange({ ...flatTree, children: flatTree.children.filter((c) => c.id !== id) })
  }
  const addFlatCondition = () => {
    if (!flatTree) return
    onChange({ ...flatTree, children: [...flatTree.children, newCondition(firstCol)] })
  }
  const setFlatConjunction = (conj: Conjunction) => {
    if (!flatTree) return
    onChange({ ...flatTree, conjunction: conj })
  }

  // ── nested-mode mutators ──
  const nestedTree = value.mode === 'nested' ? value : null
  const updateGroup = (groupId: string, patch: Partial<FilterGroup>) => {
    if (!nestedTree) return
    onChange({
      ...nestedTree,
      children: nestedTree.children.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    })
  }
  const updateGroupCondition = (groupId: string, condId: string, patch: Partial<FilterCondition>) => {
    if (!nestedTree) return
    onChange({
      ...nestedTree,
      children: nestedTree.children.map((g) =>
        g.id === groupId
          ? { ...g, children: g.children.map((c) => (c.id === condId ? { ...c, ...patch } : c)) }
          : g
      ),
    })
  }
  const removeGroupCondition = (groupId: string, condId: string) => {
    if (!nestedTree) return
    onChange({
      ...nestedTree,
      children: nestedTree.children.map((g) =>
        g.id === groupId ? { ...g, children: g.children.filter((c) => c.id !== condId) } : g
      ),
    })
  }
  const addConditionToGroup = (groupId: string) => {
    if (!nestedTree) return
    onChange({
      ...nestedTree,
      children: nestedTree.children.map((g) =>
        g.id === groupId ? { ...g, children: [...g.children, newCondition(firstCol)] } : g
      ),
    })
  }
  const removeGroup = (groupId: string) => {
    if (!nestedTree) return
    onChange({ ...nestedTree, children: nestedTree.children.filter((g) => g.id !== groupId) })
  }
  const addGroup = () => {
    if (!nestedTree) return
    onChange({ ...nestedTree, children: [...nestedTree.children, newGroup(firstCol)] })
  }
  const setRootConjunction = (conj: Conjunction) => {
    if (!nestedTree) return
    onChange({ ...nestedTree, conjunction: conj })
  }

  return (
    <div className={cn('w-[680px]', className)}>
      <SurfaceHeader>
        <div className="flex items-center gap-1 w-full min-w-0">
          <PopoverTitle className="flex-1">篩選</PopoverTitle>
          {/* Refresh icon — 只在 value ≠ defaultValue 時顯示(對齊 sort modified-from-default UX) */}
          {defaultValue && !isFilterTreeEqual(value, defaultValue) && (
            <Button
              variant="text" size="sm" iconOnly startIcon={RotateCcw}
              aria-label="恢復預設"
              onClick={() => onChange(defaultValue)}
            />
          )}
          {onClose && (
            <PopoverClose asChild>
              <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" onClick={onClose} />
            </PopoverClose>
          )}
        </div>
      </SurfaceHeader>

      <SurfaceBody className="flex flex-col gap-2">
        {flatTree && flatTree.children.map((cond, idx) => (
          <FilterRow
            key={cond.id}
            index={idx}
            condition={cond}
            conjunction={flatTree.conjunction}
            filterableColumns={filterableColumns}
            fieldOptions={fieldOptions}
            onChangeConjunction={setFlatConjunction}
            onChangeField={(v) => {
              const newCol = filterableColumns.find((c) => c.id === v)
              updateFlatCondition(cond.id, { field: v, op: getDefaultOperator(newCol?.type), value: '' })
            }}
            onChangeOp={(v) => updateFlatCondition(cond.id, { op: v, value: '' })}
            onChangeValue={(v) => updateFlatCondition(cond.id, { value: v })}
            onRemove={() => removeFlatCondition(cond.id)}
          />
        ))}

        {nestedTree && nestedTree.children.map((group, gIdx) => (
          <GroupBlock
            key={group.id}
            index={gIdx}
            group={group}
            rootConjunction={nestedTree.conjunction}
            filterableColumns={filterableColumns}
            fieldOptions={fieldOptions}
            onChangeRootConjunction={setRootConjunction}
            onChangeGroupConjunction={(c) => updateGroup(group.id, { conjunction: c })}
            onChangeCondition={(condId, patch) => updateGroupCondition(group.id, condId, patch)}
            onRemoveCondition={(condId) => removeGroupCondition(group.id, condId)}
            onAddCondition={() => addConditionToGroup(group.id)}
            onRemoveGroup={() => removeGroup(group.id)}
          />
        ))}
      </SurfaceBody>

      <SurfaceFooter className="justify-start">
        <Button
          variant="tertiary" size="sm" startIcon={Plus}
          onClick={mode === 'flat' ? addFlatCondition : addGroup}
        >
          {mode === 'nested' ? '加入篩選器' : '加條件'}
        </Button>
      </SurfaceFooter>
    </div>
  )
}

DataTableFilterPanel.displayName = 'DataTableFilterPanel'

// ── ConjunctionLabel ───────────────────────────────────────────────────

const CONJ_OPTIONS: SelectOption[] = [
  { value: 'and', label: 'And' },
  { value: 'or', label: 'Or' },
]

function ConjunctionLabel({
  index, conjunction, onChange,
}: { index: number; conjunction: Conjunction; onChange: (c: Conjunction) => void }) {
  if (index === 0) {
    return <div className="w-16 shrink-0 text-body text-fg-muted px-2">Where</div>
  }
  return (
    <div className="w-16 shrink-0">
      <Select size="md" options={CONJ_OPTIONS} value={conjunction} onChange={(v) => onChange(v as Conjunction)} />
    </div>
  )
}

// ── FilterRow(flat 用 + group 內共用) ──────────────────────────────

function FilterRow({
  index, condition, conjunction, filterableColumns, fieldOptions,
  onChangeConjunction, onChangeField, onChangeOp, onChangeValue, onRemove,
}: {
  index: number
  condition: FilterCondition
  conjunction: Conjunction
  filterableColumns: FilterColumn[]
  fieldOptions: SelectOption[]
  onChangeConjunction: (c: Conjunction) => void
  onChangeField: (v: string) => void
  onChangeOp: (v: string) => void
  onChangeValue: (v: unknown) => void
  onRemove: () => void
}) {
  const colInfo = filterableColumns.find((c) => c.id === condition.field)
  const operatorOptions = getOperatorOptions(colInfo?.type)
  const hasField = !!condition.field
  const opSpec = colInfo ? getOperatorSpec(colInfo.type, condition.op) : null
  const valueShape: ValueShape | null = colInfo && opSpec
    ? getValueShape(opSpec, colInfo.type, colInfo.includeTime)
    : null

  return (
    <div className="flex items-center gap-2">
      <ConjunctionLabel index={index} conjunction={conjunction} onChange={onChangeConjunction} />
      <div className="w-40 shrink-0">
        <Select size="md" options={fieldOptions} value={condition.field} onChange={onChangeField} placeholder="選擇欄位" />
      </div>
      <div className="w-32 shrink-0">
        <Select
          size="md"
          options={operatorOptions}
          value={condition.op}
          onChange={onChangeOp}
          disabled={!hasField}
        />
      </div>
      <div className="flex-1 min-w-0">
        <ValuePicker
          shape={valueShape}
          value={condition.value}
          onChange={onChangeValue}
          colInfo={colInfo}
          disabled={!hasField}
        />
      </div>
      <ItemInlineActionButton icon={Trash2} size="md" aria-label="刪除" onClick={onRemove} />
    </div>
  )
}

// ── GroupBlock(nested 用) ────────────────────────────────────────────

function GroupBlock({
  index, group, rootConjunction, filterableColumns, fieldOptions,
  onChangeRootConjunction, onChangeGroupConjunction,
  onChangeCondition, onRemoveCondition, onAddCondition, onRemoveGroup,
}: {
  index: number
  group: FilterGroup
  rootConjunction: Conjunction
  filterableColumns: FilterColumn[]
  fieldOptions: SelectOption[]
  onChangeRootConjunction: (c: Conjunction) => void
  onChangeGroupConjunction: (c: Conjunction) => void
  onChangeCondition: (condId: string, patch: Partial<FilterCondition>) => void
  onRemoveCondition: (condId: string) => void
  onAddCondition: () => void
  onRemoveGroup: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="pt-2">
        <ConjunctionLabel index={index} conjunction={rootConjunction} onChange={onChangeRootConjunction} />
      </div>
      <div className="flex-1 min-w-0 rounded-md bg-[var(--surface-3)] p-2 flex flex-col gap-2">
        {group.children.map((cond, cIdx) => (
          <FilterRow
            key={cond.id}
            index={cIdx}
            condition={cond}
            conjunction={group.conjunction}
            filterableColumns={filterableColumns}
            fieldOptions={fieldOptions}
            onChangeConjunction={onChangeGroupConjunction}
            onChangeField={(v) => {
              const newCol = filterableColumns.find((c) => c.id === v)
              onChangeCondition(cond.id, { field: v, op: getDefaultOperator(newCol?.type), value: '' })
            }}
            onChangeOp={(v) => onChangeCondition(cond.id, { op: v, value: '' })}
            onChangeValue={(v) => onChangeCondition(cond.id, { value: v })}
            onRemove={() => onRemoveCondition(cond.id)}
          />
        ))}
        <div className="flex items-center justify-between">
          <Button variant="tertiary" size="sm" startIcon={Plus} onClick={onAddCondition}>加入巢狀篩選</Button>
          {group.children.length === 0 && (
            <Button variant="tertiary" size="sm" startIcon={Trash2} onClick={onRemoveGroup}>移除空群組</Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ValuePicker(data-driven by ValueShape) ───────────────────────────

function ValuePicker({
  shape, value, onChange, colInfo, disabled,
}: {
  shape: ValueShape | null
  value: unknown
  onChange: (v: unknown) => void
  colInfo: FilterColumn | undefined
  disabled?: boolean
}) {
  if (!shape || disabled) {
    return <Input size="md" value="" onChange={() => {}} placeholder="輸入值…" disabled />
  }
  switch (shape) {
    case 'none':
      return null
    case 'text':
      return <Input size="md" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="輸入值…" />
    case 'number':
      return (
        <NumberInput
          size="md"
          value={typeof value === 'number' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          placeholder="輸入數字…"
        />
      )
    case 'date_single':
      return (
        <DatePicker
          size="md"
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
        />
      )
    case 'date_range':
      return (
        <DatePickerRange
          size="md"
          value={Array.isArray(value) && value.length === 2 ? (value as [string | null, string | null]) : null}
          onChange={(v) => onChange(v)}
        />
      )
    case 'date_relative': {
      const opts: SelectOption[] = DATE_RELATIVE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
      return <Select size="md" options={opts} value={String(value ?? '')} onChange={(v) => onChange(v)} placeholder="選擇相對日期" />
    }
    case 'select_single': {
      const opts: SelectOption[] = (colInfo?.options ?? []).map((o) => ({ value: o.value, label: o.label }))
      return <Select size="md" options={opts} value={String(value ?? '')} onChange={(v) => onChange(v)} placeholder="選擇值" />
    }
    case 'select_multi': {
      const opts = (colInfo?.options ?? []).map((o) => ({ value: o.value, label: o.label }))
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <Combobox
          size="md"
          options={opts}
          value={arr}
          onChange={(v) => onChange(v)}
          placeholder="選擇值…"
        />
      )
    }
    case 'datetime_single':
      return (
        <DateTimePicker
          size="md"
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
        />
      )
    case 'datetime_range':
      return (
        <DateTimeRangePicker
          size="md"
          value={Array.isArray(value) && value.length === 2 ? (value as [string | null, string | null]) : null}
          onChange={(v) => onChange(v)}
        />
      )
    // person_* — Phase E 後續可接 PeoplePicker filter mode
    // v1 fallback:Combobox 文字 input(功能可用,視覺非 person-card)
    case 'person_single':
    case 'person_multi':
      return (
        <Input
          size="md"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="(person picker 預留)"
        />
      )
    default:
      return null
  }
}

// ── Tree Evaluation(globalFilter approach) ───────────────────────────

/**
 * 整棵 FilterTree 對 row 求 boolean。
 * 配合 useReactTable `globalFilterFn`:
 *
 *   const tree = useState<FilterTree>(createEmptyFilterTree('flat'))
 *   useReactTable({
 *     state: { globalFilter: tree },
 *     onGlobalFilterChange: setTree,
 *     globalFilterFn: (row, _, t: FilterTree) => evaluateTree(t, row.original),
 *     getFilteredRowModel: getFilteredRowModel(),
 *   })
 */
export function evaluateTree(tree: FilterTree, row: any): boolean {
  if (tree.children.length === 0) return true

  if (tree.mode === 'flat') {
    const completed = tree.children.filter(isConditionComplete)
    if (completed.length === 0) return true
    const results = completed.map((c) => evaluateCondition(c, row))
    return tree.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
  }

  // nested
  const groupResults = tree.children.map((g) => evaluateGroup(g, row))
  // group 沒任何 complete condition 的視為 pass-through(true)
  const meaningful = groupResults.filter((_, i) => tree.children[i].children.some(isConditionComplete))
  if (meaningful.length === 0) return true
  return tree.conjunction === 'and' ? meaningful.every(Boolean) : meaningful.some(Boolean)
}

function evaluateGroup(group: FilterGroup, row: any): boolean {
  const completed = group.children.filter(isConditionComplete)
  if (completed.length === 0) return true
  const results = completed.map((c) => evaluateCondition(c, row))
  return group.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
}

function evaluateCondition(cond: FilterCondition, row: any): boolean {
  if (!cond.field || !cond.op) return true
  const cellValue = row?.[cond.field]
  return matchOperator(cond.op, cellValue, cond.value)
}

function matchOperator(op: string, cellValue: unknown, filterValue: unknown): boolean {
  // 不需 value 的 op
  switch (op) {
    case 'is_set':     return cellValue !== null && cellValue !== undefined && cellValue !== ''
    case 'is_not_set': return cellValue === null || cellValue === undefined || cellValue === ''
    case 'is_true':    return cellValue === true
    case 'is_false':   return cellValue === false
  }

  // 需 value 但 value 空 → 視為 incomplete,pass-through
  if (filterValue === null || filterValue === undefined || filterValue === '') return true
  if (Array.isArray(filterValue) && filterValue.length === 0) return true

  switch (op) {
    case 'contains':         return String(cellValue ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
    case 'does_not_contain': return !String(cellValue ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
    case 'is':               return String(cellValue ?? '').toLowerCase() === String(filterValue).toLowerCase()
    case 'is_not':           return String(cellValue ?? '').toLowerCase() !== String(filterValue).toLowerCase()
    case 'starts_with':      return String(cellValue ?? '').toLowerCase().startsWith(String(filterValue).toLowerCase())
    case 'ends_with':        return String(cellValue ?? '').toLowerCase().endsWith(String(filterValue).toLowerCase())

    case 'equals':     return Number(cellValue) === Number(filterValue)
    case 'not_equals': return Number(cellValue) !== Number(filterValue)
    case 'gt':         return Number(cellValue) > Number(filterValue)
    case 'gte':        return Number(cellValue) >= Number(filterValue)
    case 'lt':         return Number(cellValue) < Number(filterValue)
    case 'lte':        return Number(cellValue) <= Number(filterValue)

    case 'is_before': return new Date(String(cellValue)).getTime() < new Date(String(filterValue)).getTime()
    case 'is_after':  return new Date(String(cellValue)).getTime() > new Date(String(filterValue)).getTime()
    case 'is_on_or_before': return new Date(String(cellValue)).getTime() <= new Date(String(filterValue)).getTime()
    case 'is_on_or_after':  return new Date(String(cellValue)).getTime() >= new Date(String(filterValue)).getTime()
    case 'is_between': {
      if (!Array.isArray(filterValue) || filterValue.length !== 2) return true
      const cv = new Date(String(cellValue)).getTime()
      const start = filterValue[0] ? new Date(String(filterValue[0])).getTime() : -Infinity
      const end = filterValue[1] ? new Date(String(filterValue[1])).getTime() : Infinity
      return cv >= start && cv <= end
    }
    case 'is_relative':
      // Phase D 完整實作(today/this_week/...)— v1 fallback pass
      return true

    case 'has_any_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return cellValue.some((c) => filterValue.includes(c))
      return filterValue.includes(cellValue)
    }
    case 'has_all_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return filterValue.every((v) => cellValue.includes(v))
      return false
    }
    case 'has_none_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return !cellValue.some((c) => filterValue.includes(c))
      return !filterValue.includes(cellValue)
    }

    default: return true
  }
}

/**
 * @deprecated v0.x — old per-column filterFn integration。
 * 新版用 `evaluateTree` 配 TanStack `globalFilter`。
 * 保留為了過渡期 backward-compat,新 consumer 不要用。
 */
export function dataTableFilterMatch(cellValue: unknown, filterValue: unknown): boolean {
  if (typeof filterValue === 'object' && filterValue !== null && 'operator' in filterValue && 'value' in filterValue) {
    const fv = filterValue as { operator: string; value: unknown }
    return matchOperator(fv.operator, cellValue, fv.value)
  }
  return String(cellValue ?? '').toLowerCase().includes(String(filterValue ?? '').toLowerCase())
}
