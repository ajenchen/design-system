/**
 * filter-value-picker.tsx — render value-picker UI per ValueShape。
 *
 * 抽自 data-table-filter-panel.tsx(原 panel 784→500+ 行 budget),由 panel 與
 * 未來 DataTable inline filter UI 共用(M17 SSOT 雛形)。
 *
 * Pure switch-on-shape;無 panel state / context dep。
 */

import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { DatePicker, DatePickerRange } from '@/design-system/components/DatePicker/date-picker'
import { DATE_RELATIVE_OPTIONS, type ValueShape } from './filter-operators'

export interface FilterColumnInfo {
  id: string
  label: string
  options?: Array<{ value: string; label: string }>
}

export interface FilterValuePickerProps {
  shape: ValueShape | null
  value: unknown
  onChange: (v: unknown) => void
  colInfo?: FilterColumnInfo
  disabled?: boolean
  /** 用 column.label 組「{label} 篩選值」(panel 每 row 不顯式 label,a11y 必填) */
  ariaLabel?: string
}

export function FilterValuePicker({
  shape,
  value,
  onChange,
  colInfo,
  disabled,
  ariaLabel,
}: FilterValuePickerProps) {
  if (!shape || disabled) {
    return <Input size="md" value="" onChange={() => {}} placeholder="輸入值…" disabled aria-label={ariaLabel} />
  }

  switch (shape) {
    case 'none':
      return null

    case 'text':
      return (
        <Input
          size="md"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="輸入值…"
          aria-label={ariaLabel}
        />
      )

    case 'number':
      return (
        <NumberInput
          size="md"
          value={typeof value === 'number' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          placeholder="輸入數字…"
          aria-label={ariaLabel}
        />
      )

    case 'date_single':
      return (
        <DatePicker
          size="md"
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          aria-label={ariaLabel}
        />
      )

    case 'date_range':
      return (
        <DatePickerRange
          size="md"
          value={Array.isArray(value) && value.length === 2
            ? (value as [string | null, string | null])
            : null}
          onChange={(v) => onChange(v)}
          aria-label={ariaLabel}
        />
      )

    case 'date_relative': {
      const opts: SelectOption[] = DATE_RELATIVE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      }))
      return (
        <Select
          size="md"
          options={opts}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          placeholder="選擇相對日期"
          aria-label={ariaLabel}
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
          size="md"
          options={opts}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          placeholder="選擇值"
          aria-label={ariaLabel}
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
          size="md"
          options={opts}
          value={arr}
          onChange={(v) => onChange(v)}
          placeholder="選擇值…"
          aria-label={ariaLabel}
        />
      )
    }

    case 'datetime_single':
      return (
        <DatePicker
          size="md"
          showTime
          value={typeof value === 'string' ? value : null}
          onChange={(v) => onChange(v ?? '')}
          aria-label={ariaLabel}
        />
      )

    case 'datetime_range':
      return (
        <DatePickerRange
          size="md"
          showTime
          value={Array.isArray(value) && value.length === 2
            ? (value as [string | null, string | null])
            : null}
          onChange={(v) => onChange(v)}
          aria-label={ariaLabel}
        />
      )

    // person_* — v1 fallback Combobox 文字 input。
    // 後續若要 person card UI:抽 PeoplePicker `pickerMode` variant(query mode 不限填單一人)。
    // 目前 multi-select 用 Combobox 是 Notion / Asana / ClickUp 通行 idiom。
    case 'person_single':
    case 'person_multi':
      return (
        <Input
          size="md"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="(person picker 預留)"
          aria-label={ariaLabel}
        />
      )

    default:
      return null
  }
}
