// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved(2026-07-14 自 data-table-filter-panel.tsx 拆檔搬移,原檔級 escape 隨段落帶入)。
// @internal — DS-internal 單元(FilterValuePicker value-picker switcher,只被
// data-table-filter-group.tsx FilterRow 消費);不隨 index.ts re-export 進 npm public surface。
// ────────────────────────────── 消費的 SSOT ──────────────────────────────
// - Field controls(Family 4,統一 size="sm"):Input / NumberInput / Select / Combobox /
//   DatePicker + DatePickerRange(showTime)/ PeoplePicker — 按 ValueShape dispatch
//   (ValueShape ↔ picker 對照 canonical:./data-table.spec.md「三、Operator × ValueShape SSOT」)
// - className 直接 forward 給 inner Field control(不另開 wrapper div)—
//   field-control-group.spec.md「forward className」canonical(2026-05-04 #2 fix)
// - Operator / ValueShape SSOT:./filter-operators.ts(DATE_RELATIVE_OPTIONS / DATE_RELATIVE_GROUPS)
// - Person pool:PeoplePicker PersonValue(對齊 cell-registry meta.people SSOT)
// 設計規則:./filter-operators.spec.md「ValueShape canonical」+ ./data-table.spec.md「進階篩選」段

import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { DatePicker, DatePickerRange } from '@/design-system/components/DatePicker/date-picker'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import {
  DATE_RELATIVE_OPTIONS,
  DATE_RELATIVE_GROUPS,
  type ValueShape,
} from './filter-operators'

// ── FilterValuePicker(value-picker switcher per ValueShape)────────────────
//
// 2026-05-03 M21 retract:本 helper 原獨立檔 filter-value-picker.tsx(187 行 / 1 consumer),
// claim「未來 inline filter UI 共用」= premature abstraction → inline 回 panel。
// 2026-07-14 拆檔 refactor:panel 822 行過 800 hard cap(file-size escalation)→ 重新抽出為
// @internal 私有模組(非 public API 抽象,與 M21 不衝突;consumer 仍只見 DataTableFilterPanel)。

export interface FilterValuePickerColInfo {
  id: string
  label: string
  options?: Array<{ value: string; label: string }>
  /** Person pool — person/multiPerson filter picker 用(2026-05-07 升級,SSOT 對齊 cell-registry) */
  people?: Array<{ name: string; avatarUrl?: string; description?: string }>
}

export interface FilterValuePickerProps {
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

export function FilterValuePicker({
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
