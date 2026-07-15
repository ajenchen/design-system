// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved(2026-07-14 自 data-table-filter-panel.tsx 拆檔搬移,原檔級 escape 隨段落帶入)。
// @internal — DS-internal 單元(filter row / nested-group renderer + 共用 column/operator
// helpers;GroupBlock 為 nested-group renderer,FilterRow / ConjunctionLabel 為其 row 構件、
// flat mode 共用。只被 data-table-filter-panel.tsx 消費);不隨 index.ts re-export 進 npm public surface。
// ────────────────────────────── 消費的 SSOT ──────────────────────────────
// - FieldControlGroup:field + op + value border-collapse 接合(field-control-group.spec.md;
//   FilterValuePicker 為 direct child,className forward 不開 wrapper div — 2026-05-04 #2 fix)
// - Button(variant="text" iconOnly)row meta trash / Select(size="sm")conjunction・field・op
//   (data-table.spec.md「四、UI canonical」:trash = form-control row text Button;A6 conjunction)
// - Width tokens:--data-table-filter-field-width / --data-table-filter-op-width(uiSize.css SSOT,
//   2026-05-23 Phase A.4 Decision 2)
// - Operator SSOT:./filter-operators.ts OPERATOR_REGISTRY(禁 hardcode op 字串)
// - Group container 灰底 bg-muted:color.spec.md L651-654 靜態低重要 surface semantic(2026-05-09 Q3 A)
// 設計規則:./filter-operators.spec.md + ./data-table.spec.md「進階篩選」段

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { FieldControlGroup } from '@/design-system/components/FieldControlGroup/field-control-group'
import type { ColumnType } from './column-types'
import {
  OPERATOR_REGISTRY,
  DEFAULT_OPERATOR,
  getOperatorSpec,
  getValueShape,
  type ValueShape,
} from './filter-operators'
import type { Conjunction, FilterCondition, FilterGroup } from './filter-tree'
import { FilterValuePicker } from './data-table-filter-value-picker'

// ── Shared internal types + operator helpers(panel orchestration 也消費)────

export interface FilterColumn {
  id: string
  label: string
  type: ColumnType
  options?: Array<{ value: string; label: string }>
  /** People pool for person/multiPerson filter picker(對齊 cell-registry meta.people SSOT)*/
  people?: Array<{ name: string; avatarUrl?: string; description?: string }>
  includeTime?: boolean
}

function getOperatorOptions(type?: ColumnType): SelectOption[] {
  const registry = type && OPERATOR_REGISTRY[type] ? OPERATOR_REGISTRY[type] : OPERATOR_REGISTRY.string
  return registry.map((op) => ({ value: op.op, label: op.label }))
}

export function getDefaultOperator(type?: ColumnType): string {
  return (type && DEFAULT_OPERATOR[type]) || DEFAULT_OPERATOR.string
}

// Q6(2026-07-04):date 欄位把比對精度寫進 condition(includeTime=true → ms,否則 day)。
// 'time' 欄暫不寫(值非完整日期,truncate 語意不成立;見 filter-operators.spec v3 time 註)。
export const datePrecisionOf = (col: FilterColumn | undefined): 'day' | 'ms' | undefined =>
  col?.type === 'date' ? (col.includeTime ? 'ms' : 'day') : undefined

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
  //   px-[var(--field-px)] 對齊 Field 內部 padding 12px(Q13)
  if (index === 0) {
    return <div className="w-20 shrink-0 text-body text-fg-muted px-[var(--field-px)] self-center">Where</div>
  }
  if (index >= 2) {
    const label = conjunction === 'and' ? 'And' : 'Or'
    return <div className="w-20 shrink-0 text-body text-fg-muted px-[var(--field-px)] self-center">{label}</div>
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

export function FilterRow({
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

export function GroupBlock({
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
              onChangeCondition(cond.id, { field: v, op: getDefaultOperator(newCol?.type), value: '', datePrecision: datePrecisionOf(newCol) })
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
