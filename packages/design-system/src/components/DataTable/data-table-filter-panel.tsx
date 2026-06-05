// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: header chrome corner buttons(close)跟 row inline actions(trash)不在同 row
// code-quality-allow: file-size — 2026-05-03 M21 retract:filter-value-picker.tsx(187 行 / 1 consumer)inline 回本檔。panel 從 505 → 687 行,進 transition zone 但未過 800 hard cap。等 inline filter UI 接入第 2 consumer 再考慮抽出。
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
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import { SurfaceHeader, SurfaceBody } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { FieldControlGroup } from '@/design-system/components/FieldControlGroup/field-control-group'
import type { ColumnType } from './column-types'
import { getColumnId, getColumnLabel, getColumnMeta } from './lib/column-meta'
import {
  OPERATOR_REGISTRY,
  DEFAULT_OPERATOR,
  DATE_RELATIVE_OPTIONS,
  DATE_RELATIVE_GROUPS,
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
 * 詳:`./filter-operators.spec.md`
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
  /** People pool for person/multiPerson filter picker(對齊 cell-registry meta.people SSOT)*/
  people?: Array<{ name: string; avatarUrl?: string; description?: string }>
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
      people: meta?.people,
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

// **G fix(2026-05-04)**:initial-mount 用 — field 不預選,user 自選後 op/value 才 enable
//   Disabled state(field='')→ op + value 在 FilterRow 內走 `disabled={!hasField}` 自動連動
const newEmptyCondition = (): FilterCondition => ({
  kind: 'cond',
  id: newId(),
  field: '',
  op: '',
  value: '',
})

const newGroup = (firstCol: FilterColumn | undefined): FilterGroup => ({
  kind: 'group',
  id: newId(),
  conjunction: 'or',                                // group 內 default OR(對齊 ref 圖)
  children: [newCondition(firstCol)],
})

const newEmptyGroup = (): FilterGroup => ({
  kind: 'group',
  id: newId(),
  conjunction: 'or',
  children: [newEmptyCondition()],
})

// ── Internal — FilterValuePicker(value-picker switcher per ValueShape)──
//
// 2026-05-03 M21 retract:本 helper 原本獨立檔 `filter-value-picker.tsx`,
// claim「未來 inline filter UI 共用」但只 1 consumer(本 panel)= 違 M21
// premature abstraction。inline 回 panel,日後若真有第 2 consumer 再抽。

interface FilterValuePickerColInfo {
  id: string
  label: string
  options?: Array<{ value: string; label: string }>
  /** Person pool — person/multiPerson filter picker 用(2026-05-07 升級,SSOT 對齊 cell-registry) */
  people?: Array<{ name: string; avatarUrl?: string; description?: string }>
}

interface FilterValuePickerProps {
  shape: ValueShape | null
  value: unknown
  onChange: (v: unknown) => void
  colInfo?: FilterValuePickerColInfo
  disabled?: boolean
  /** 用 column.label 組「{label} 篩選值」(panel 每 row 不顯式 label,a11y 必填) */
  ariaLabel?: string
  /** Forward 給內部 Field control 的 className(2026-05-04 #2 fix)
   *  避免外層包 wrapper div 破壞 FieldControlGroup CSS variants(rounded radii / margin overlap) */
  className?: string
}

function FilterValuePicker({
  shape,
  value,
  onChange,
  colInfo,
  disabled,
  ariaLabel,
  className,
}: FilterValuePickerProps) {
  if (!shape || disabled) {
    return <Input size="sm" value="" onChange={() => {}} placeholder="輸入值…" disabled aria-label={ariaLabel} className={className} />
  }

  switch (shape) {
    case 'none':
      return null

    case 'text':
      return (
        <Input
          size="sm"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="輸入值…"
          aria-label={ariaLabel}
          className={className}
        />
      )

    case 'number':
      return (
        <NumberInput
          size="sm"
          value={typeof value === 'number' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          placeholder="輸入數字…"
          aria-label={ariaLabel}
          className={className}
        />
      )

    case 'date_single':
      return (
        <DatePicker
          size="sm"
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          aria-label={ariaLabel}
          className={className}
        />
      )

    case 'date_range':
      return (
        <DatePickerRange
          size="sm"
          value={Array.isArray(value) && value.length === 2
            ? (value as [string | null, string | null])
            : null}
          onChange={(v) => onChange(v)}
          aria-label={ariaLabel}
          className={className}
        />
      )

    case 'date_relative': {
      // 群組分類:Past / Current / Future(對齊 Linear / Notion idiom),走 Select.groups → SelectMenu
      const opts: SelectOption[] = DATE_RELATIVE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        group: o.group,
      }))
      return (
        <Select
          size="sm"
          options={opts}
          groups={DATE_RELATIVE_GROUPS as unknown as Array<{ key: string; label: string }>}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          placeholder="選擇相對日期"
          aria-label={ariaLabel}
          className={className}
        />
      )
    }

    case 'select_single': {
      const opts: SelectOption[] = (colInfo?.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
      }))
      return (
        <Select
          size="sm"
          options={opts}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          placeholder="選擇值"
          aria-label={ariaLabel}
          className={className}
        />
      )
    }

    case 'select_multi': {
      const opts = (colInfo?.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
      }))
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <Combobox
          size="sm"
          options={opts}
          value={arr}
          onChange={(v) => onChange(v)}
          placeholder="選擇值…"
          aria-label={ariaLabel}
          className={className}
        />
      )
    }

    case 'datetime_single':
      return (
        <DatePicker
          size="sm"
          showTime
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          aria-label={ariaLabel}
          className={className}
        />
      )

    case 'datetime_range':
      return (
        <DatePickerRange
          size="sm"
          showTime
          value={Array.isArray(value) && value.length === 2
            ? (value as [string | null, string | null])
            : null}
          onChange={(v) => onChange(v)}
          aria-label={ariaLabel}
          className={className}
        />
      )

    // person_single / person_multi — 走 PeoplePicker(2026-05-07 升級,對齊 cell-registry SSOT)。
    // colInfo.people 來自 column meta.people。Filter value:
    //   - person_single:存 PersonValue | null(picker emit array,我們取 [0])
    //   - person_multi:存 PersonValue[]
    case 'person_single': {
      const v = value as PersonValue | null | undefined
      return (
        <PeoplePicker
          size="sm"
          value={v ?? null}
          people={colInfo?.people ?? []}
          onChange={(next) => onChange(next[0] ?? null)}
          aria-label={ariaLabel}
          className={className}
        />
      )
    }
    case 'person_multi': {
      const v = Array.isArray(value) ? (value as PersonValue[]) : []
      return (
        <PeoplePicker
          size="sm"
          value={v}
          people={colInfo?.people ?? []}
          onChange={(next) => onChange(next)}
          aria-label={ariaLabel}
          className={className}
        />
      )
    }
    default:
      return null
  }
}

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
  // K13 後 firstCol 不再被 add* 消費(改用 newEmpty*),這裡只留 prefill effect 用(已直接讀 prefilledColumnId)。

  // **G fix(2026-05-04 v2)**:initial-mount 預設 1 empty row(field 未選 → op+value 自動 disabled)
  //   useRef gate → 只 mount 一次;user 後續手動刪光 → 不 re-add → 維持「全清 = empty CTA only」UX
  //   Two states clearly separated:
  //     (a) Initial mount with empty value → auto-add 1 empty row(讓 user 看到 row shape,不必先點 CTA)
  //     (b) User explicitly deletes all → empty CTA only(無 row,respect user intent)
  const initialMountDoneRef = React.useRef(false)
  React.useEffect(() => {
    if (initialMountDoneRef.current) return
    initialMountDoneRef.current = true
    if (filterableColumns.length === 0) return
    if (value.children.length > 0) return
    if (value.mode === 'flat') {
      onChange({ ...value, children: [newEmptyCondition()] } as FilterTreeFlat)
    } else {
      onChange({ ...value, children: [newEmptyGroup()] } as FilterTreeNested)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterableColumns.length])

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
    // K13 fix(2026-05-04):加篩選 → empty row(field 未選 → op+value disabled)
    //   World-class:Notion / Coda / ClickUp 不 auto-select;對齊 initial mount canonical
    onChange({ ...flatTree, children: [...flatTree.children, newEmptyCondition()] })
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
  // K13 fix(2026-05-04):同 addFlatCondition,巢狀內加條件也 empty row
  const addConditionToGroup = (groupId: string) => {
    if (!nestedTree) return
    onChange({
      ...nestedTree,
      children: nestedTree.children.map((g) =>
        g.id === groupId ? { ...g, children: [...g.children, newEmptyCondition()] } : g
      ),
    })
  }
  const removeGroup = (groupId: string) => {
    if (!nestedTree) return
    onChange({ ...nestedTree, children: nestedTree.children.filter((g) => g.id !== groupId) })
  }
  const addGroup = () => {
    if (!nestedTree) return
    // K13:加群組也用 empty group
    onChange({ ...nestedTree, children: [...nestedTree.children, newEmptyGroup()] })
  }
  const setRootConjunction = (conj: Conjunction) => {
    if (!nestedTree) return
    onChange({ ...nestedTree, conjunction: conj })
  }

  return (
    // 寬度策略:desktop 680px;mobile 縮到 viewport 內留 32px 邊(避溢出 popover 切右半)。
    // 對齊 Notion / Airtable 的 advanced filter 在 mobile 走 full-width 邊處理。
    // **#8 fix(2026-05-04)**:popover width by mode(由 cell min-w 與 group nested chrome 反推)
    //   flat:cell ConjunctionLabel(80) + gap-2(8) + FCG(field-min 160 + op-min 120 + value 200) +
    //         gap-2(8) + trash(28) + 2×loose padding(32) = ~636 → 640px
    //   nested:再加 group p-2 (16) + outer ConjunctionLabel (80) + outer gap (8) → ~740 → 760px
    //   對齊 Airtable / Notion / Linear filter row 視覺密度 @benchmark-unverified(non-OSS)
    // **K11 fix(2026-05-04)**:viewport-aware scroll chain invariant
    //   parent PopoverContent 是 flex flex-col + max-h + overflow-hidden,
    //   panel root 必 forward `flex flex-col h-full` 才能讓 SurfaceBody flex-1 min-h-0 overflow-y-auto 生效
    //   無此 forward → 中間 wrapper 斷鏈 → body 不 scroll(ProfileCard 因為自身設 max-h flex-col 才繞過)
    //   詳 overlay-surface.spec.md「viewport-aware scroll chain invariant」段
    // K11 v2 fix(2026-05-04):flex item 預設 min-h:auto 讓 content 撐 height,h-full 失效。
    // 必加 `min-h-0` 才能讓 panel 在 PopoverContent max-h cap 下正確 shrink + body scroll。
    <div ref={ref} className={cn(
      'flex flex-col h-full min-h-0',
      mode === 'nested'
        ? 'w-[min(760px,calc(100vw-2rem))]'
        : 'w-[min(640px,calc(100vw-2rem))]',
      className,
    )}>
      {/* Popover 派輕量 chrome — slot 縮 20 匹配 PopoverTitle text-body line-height,header 自然 ~45px */}
      <SurfaceHeader className="[--chrome-slot-h:1.25rem]">
        <PopoverTitle className="flex-1">篩選</PopoverTitle>
        {/* Refresh icon — 只在 value ≠ defaultValue 時顯示(對齊 sort modified-from-default UX)
            含 ButtonDivider 對齊「欄位顯示」+「排序」chrome corner action canonical(2026-05-04) */}
        {defaultValue && !isFilterTreeEqual(value, defaultValue) && (
          <>
            <Button
              variant="text" size="sm" iconOnly startIcon={RotateCcw}
              aria-label="恢復預設"
              onClick={() => onChange(defaultValue)}
            />
            {onClose && <ButtonDivider />}
          </>
        )}
        {onClose && (
          <PopoverClose asChild>
            <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" onClick={onClose} />
          </PopoverClose>
        )}
      </SurfaceHeader>

      {/* Body — flat / nested 條件;空條件 → 直接顯 + 加篩選 CTA(對齊 Notion / Airtable / Linear inline 派,
          無條件時不需要 Empty 元件大區塊,單顆 CTA 引導即可。SurfaceFooter 整層拔除,
          + Add filter / + 加篩選器 inline 緊貼最後一條 row,讓 user 感受到「條件」與「加入」屬同一語境)*/}
      <SurfaceBody className="flex flex-col gap-[var(--layout-space-tight)]">
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

        {/* Inline CTA(2026-05-04 A1)— root-level「加篩選」用 tertiary(視覺輕量但有邊界,
            符合 root-CTA 視覺重量);nested 內「加入巢狀篩選」走 text variant(更輕,在 group 內 inline)
            不放 SurfaceFooter:條件與「加入」屬同一語義群,中間插 footer 切斷敘事 */}
        <div>
          <Button
            variant="tertiary" size="sm" startIcon={Plus}
            onClick={mode === 'flat' ? addFlatCondition : addGroup}
          >
            {mode === 'nested' ? '加入篩選器' : '加篩選'}
          </Button>
        </div>
      </SurfaceBody>
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
  // index === 0:首 row 顯示靜態「Where」label
  // index === 1:**唯一可改**的 AND/OR Select(連動整 group conjunction)
  // index ≥ 2:被連動的 row,read-only 顯示當前 conjunction 文字(同 Where 視覺,A6 canonical)
  //   對齊 Airtable / Notion / Linear 共識 @benchmark-unverified(non-OSS)
  //   px-3 對齊 Field 內部 padding 12px(Q13)
  if (index === 0) {
    return <div className="w-20 shrink-0 text-body text-fg-muted px-3 self-center">Where</div>
  }
  if (index >= 2) {
    const label = conjunction === 'and' ? 'And' : 'Or'
    return <div className="w-20 shrink-0 text-body text-fg-muted px-3 self-center">{label}</div>
  }
  // index === 1:可切換的 AND/OR Select
  // minRows={2} — And/Or 2 選項,顯式縮 menu 高度避免 reserve 3 row 空白(Q5)
  return (
    <div className="w-20 shrink-0">
      <Select
        size="sm"
        options={CONJ_OPTIONS}
        value={conjunction}
        onChange={(v) => onChange(v as Conjunction)}
        minRows={2}
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
  // op 'is_set' / 'is_not_set' 等 shape='none' → 無 value cell,op 自動 expand 填剩餘寬
  // 對齊 Notion / Airtable / Linear filter row 行為
  // 注意:valueShape=null(初始無 field 選)時仍 render value cell(disabled placeholder)— 只 'none' 才 fold
  const hasValueCell = valueShape !== 'none'

  // FieldControlGroup 接合 field + op + value 視覺(2026-05-04 E refactor + 多輪 fix):
  //   - border collapse 取代 3 顆獨立 Select 並排,對齊 Airtable / Linear / Notion filter row idiom
  //   - ConjunctionLabel + Trash 在 group 外層(meta actions,不屬 control 一體)
  //   - **#5 fix**:row 內水平 gap = `gap-2` (8px),layoutSpace 規則 5 緊密相關
  //   - **#9 fix**:cell 用 `min-w-[]`(field 160 / op 120),value flex-1 min-w-0,讓 long label 可撐寬
  //   - **#2 fix**:FilterValuePicker 直接是 FieldControlGroup direct child(無 wrapper div),CSS variants 命中正確
  return (
    <div className="flex items-center gap-2">
      <ConjunctionLabel index={index} conjunction={conjunction} onChange={onChangeConjunction} />
      {/* **#9 fix(2026-05-04 v4)**:Field controls trigger `w-full` override 外 className,改用 Tailwind `!`
          important 強制 override(`!w-[160px]` / `!w-[120px]`),value 用 `!flex-1 !min-w-0`。
          Select 元件本身沒 destructure `style` prop 所以 inline style flex-basis 行不通,只能用 className。 */}
      <FieldControlGroup block className="flex-1 min-w-0">
        {/* 2026-05-23 Phase A.4 Decision 2:`!w-[160px]` / `!w-[120px]` → tokens
            `--data-table-filter-field-width` / `--data-table-filter-op-width`(SSOT in uiSize.css)
            Behavior preserved 完好如初:flat + nested 同 width(token 是 design constant) */}
        <Select
          className="!w-[var(--data-table-filter-field-width)] flex-shrink-0"
          size="sm"
          options={fieldOptions}
          value={condition.field}
          onChange={onChangeField}
          placeholder="選擇欄位"
          aria-label="篩選欄位"
        />
        <Select
          className={hasValueCell ? '!w-[var(--data-table-filter-op-width)] flex-shrink-0' : '!flex-1 !min-w-0'}
          size="sm"
          options={operatorOptions}
          value={condition.op}
          onChange={onChangeOp}
          disabled={!hasField}
          placeholder="運算子"
          aria-label="篩選運算子"
        />
        {hasValueCell && (
          <FilterValuePicker
            shape={valueShape}
            value={condition.value}
            onChange={onChangeValue}
            colInfo={colInfo}
            disabled={!hasField}
            ariaLabel={colInfo ? `${colInfo.label} 篩選值` : '篩選值'}
            className="!flex-1 !min-w-0"
          />
        )}
      </FieldControlGroup>
      {/* Trash 用 text Button — filter row 是 form-control row,Field 同高對齊(28 md) */}
      <Button variant="text" size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={onRemove} />
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
      {/* Group container 灰底 — `bg-muted`(`--muted` neutral-2,user 2026-05-09 拍板 Q3 A)。對齊 color.spec.md L651-654 「table header / tab / code block / skeleton」靜態低重要 surface semantic */}
      <div className="flex-1 min-w-0 rounded-md bg-muted p-2 flex flex-col gap-2">
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
        {/* Q9 — text variant 對齊 inline 派 + 視覺輕量 */}
        <div className="flex items-center justify-between">
          <Button variant="text" size="sm" startIcon={Plus} onClick={onAddCondition}>加入巢狀篩選</Button>
          {group.children.length === 0 && (
            <Button variant="text" size="sm" startIcon={Trash2} danger onClick={onRemoveGroup}>移除空群組</Button>
          )}
        </div>
      </div>
    </div>
  )
}
