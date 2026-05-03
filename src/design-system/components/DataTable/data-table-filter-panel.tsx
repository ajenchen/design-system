// same-row-mixed-allow: header chrome corner buttons(close)跟 row inline actions(trash)不在同 row
import * as React from 'react'
import { Plus, Trash2, X as XIcon, RotateCcw } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { FilterValuePicker } from './filter-value-picker'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import type { ColumnType } from './column-types'
import { getColumnId, getColumnLabel, getColumnMeta } from './lib/column-meta'
import {
  OPERATOR_REGISTRY,
  DEFAULT_OPERATOR,
  getOperatorSpec,
  getValueShape,
  type ValueShape,
} from './filter-operators'
import {
  createEmptyFilterTree,
  isFilterTreeActive,
  isFilterTreeEqual,
  evaluateTree,
  dataTableFilterMatch,
  type Conjunction,
  type FilterCondition,
  type FilterGroup,
  type FilterTree,
  type FilterTreeFlat,
  type FilterTreeNested,
} from './filter-tree'

// Re-export public API from filter-tree(consumer 既有 import path 不變)
export {
  createEmptyFilterTree,
  isFilterTreeActive,
  evaluateTree,
  dataTableFilterMatch,
}
export type { Conjunction, FilterCondition, FilterGroup, FilterTree, FilterTreeFlat, FilterTreeNested }

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

// ── Internal — id seed ──────────────────────────────────────────────────

let _idSeed = 0
const newId = () => `f${++_idSeed}-${Date.now().toString(36)}`

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
    const id = getColumnId(col)
    if (!id || id === '__select__') continue
    const meta = getColumnMeta(col)
    const type: ColumnType | undefined = meta?.type
    if (!type) continue
    if (meta?.filterable === false) continue
    out.push({
      id,
      label: getColumnLabel(col, id),
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

// ── Main Component ──────────────────────────────────────────────────────

// 內部 fn — generic + ref 轉發。export 走 cast(對齊 DataTable 同 pattern)
function DataTableFilterPanelInner<TData>({
  mode,
  columns,
  value,
  onChange,
  defaultValue,
  prefilledColumnId,
  onPrefillConsumed,
  onClose,
  className,
}: DataTableFilterPanelProps<TData>, ref: React.ForwardedRef<HTMLDivElement>): React.ReactElement {
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
    // 寬度策略:desktop 680px;mobile 縮到 viewport 內留 32px 邊(避溢出 popover 切右半)。
    // 對齊 Notion / Airtable 的 advanced filter 在 mobile 走 full-width 邊處理。
    <div ref={ref} className={cn('w-[min(680px,calc(100vw-2rem))]', className)}>
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

// Generic + ref forward 套 cast 的 idiom — 對齊 DataTable(同檔家)。
// React.forwardRef 對 generic component 會丟掉 type param,改 cast 成 generic-preserving signature。
export const DataTableFilterPanel = React.forwardRef(DataTableFilterPanelInner) as <TData>(
  props: DataTableFilterPanelProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement
;(DataTableFilterPanel as { displayName?: string }).displayName = 'DataTableFilterPanel'

// ── ConjunctionLabel ───────────────────────────────────────────────────

const CONJ_OPTIONS: SelectOption[] = [
  { value: 'and', label: 'And' },
  { value: 'or', label: 'Or' },
]

function ConjunctionLabel({
  index, conjunction, onChange,
}: { index: number; conjunction: Conjunction; onChange: (c: Conjunction) => void }) {
  if (index === 0) {
    // 「Where」靜態 label;w-20 對齊 row 2+ 的 Select 寬度
    return <div className="w-20 shrink-0 text-body text-fg-muted px-2">Where</div>
  }
  return (
    // w-20(80px)— 容納「And ⌄」/「Or ⌄」label + chevron 不被截斷
    <div className="w-20 shrink-0">
      <Select
        size="md"
        options={CONJ_OPTIONS}
        value={conjunction}
        onChange={(v) => onChange(v as Conjunction)}
        aria-label="連接詞 — 同 group 共用"
      />
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
        <Select
          size="md"
          options={fieldOptions}
          value={condition.field}
          onChange={onChangeField}
          placeholder="選擇欄位"
          aria-label="篩選欄位"
        />
      </div>
      <div className="w-32 shrink-0">
        <Select
          size="md"
          options={operatorOptions}
          value={condition.op}
          onChange={onChangeOp}
          disabled={!hasField}
          aria-label="篩選運算子"
        />
      </div>
      <div className="flex-1 min-w-0">
        <FilterValuePicker
          shape={valueShape}
          value={condition.value}
          onChange={onChangeValue}
          colInfo={colInfo}
          disabled={!hasField}
          ariaLabel={colInfo ? `${colInfo.label} 篩選值` : '篩選值'}
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
      {/* Group container 灰底 — 用 --color-neutral-1 對齊 token canonical(non-existent --surface-3 改 ✓) */}
      <div className="flex-1 min-w-0 rounded-md bg-[var(--color-neutral-1)] p-2 flex flex-col gap-2">
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
