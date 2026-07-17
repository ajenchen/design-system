// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: header chrome corner buttons(close)跟 row inline actions(trash)不在同 row
import * as React from 'react'
import { Plus, X as XIcon, RotateCcw } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import type { SelectOption } from '@/design-system/components/Select/select'
import { SurfaceHeader, SurfaceBody, COMPACT_HEADER_SLOT } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import type { ColumnType } from './column-types'
import { getColumnId, getColumnLabel, getColumnMeta } from './lib/column-meta'
import {
  FilterRow,
  GroupBlock,
  getDefaultOperator,
  datePrecisionOf,
  type FilterColumn,
} from './data-table-filter-group'
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
 * - Row / nested-group renderer:`./data-table-filter-group.tsx`;value picker:
 *   `./data-table-filter-value-picker.tsx`(皆 @internal — 2026-07-14 file-size 拆檔,
 *   本檔只留 orchestration:columns 抽取 / FilterTree mutators / panel chrome)
 *
 * 詳:`./filter-operators.spec.md`
 */

// ── Internal — id seed ──────────────────────────────────────────────────

let _idSeed = 0
const newId = () => `f${++_idSeed}-${Date.now().toString(36)}`

// ── Helpers — column extraction + condition factories ──────────────────
// (FilterColumn type + operator helpers 住 ./data-table-filter-group.tsx)

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

const newCondition = (firstCol: FilterColumn | undefined): FilterCondition => ({
  kind: 'cond',
  id: newId(),
  field: firstCol?.id ?? '',
  op: firstCol ? getDefaultOperator(firstCol.type) : '',
  value: '',
  datePrecision: datePrecisionOf(firstCol),
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

// ── Component Props ─────────────────────────────────────────────────────

export interface DataTableFilterPanelProps<TData> {
  // 2026-07-18 決策17:移除獨立 `mode` prop(單一真相源 = `value.mode` discriminant)——
  //   舊設計 mode + value.mode 兩來源型別允許矛盾(mode='nested' 配 flat value → CTA 錯文案 + 死操作);
  //   無外部消費者傳 mode(grep 0),全由 value.mode 推導。對齊 MUI X GridFilterModel / AG Grid 單一 model。
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
        // 2026-07-14 deep-audit fix:補 datePrecision(原漏 → datetime(includeTime=true)欄
        // prefill 掉到 undefined=day 精度忽略 ms;對齊初始 add / changeField 路徑的 datePrecisionOf)
        datePrecision: datePrecisionOf(colInfo),
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
      value.mode === 'nested'
        ? 'w-[min(760px,calc(100vw-2rem))]'
        : 'w-[min(640px,calc(100vw-2rem))]',
      className,
    )}>
      {/* Popover 派輕量 chrome — slot 走 COMPACT_HEADER_SLOT(=21,衍生自 PopoverTitle text-body line-box),header 自然 ~45px */}
      <SurfaceHeader className={COMPACT_HEADER_SLOT}>
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
              updateFlatCondition(cond.id, { field: v, op: getDefaultOperator(newCol?.type), value: '', datePrecision: datePrecisionOf(newCol) })
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
            onClick={value.mode === 'flat' ? addFlatCondition : addGroup}
          >
            {value.mode === 'nested' ? '加入篩選器' : '加篩選'}
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
