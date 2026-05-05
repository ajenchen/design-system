// DataTable Cell Registry — type-keyed SSOT for cell rendering(Phase C 2026-05-05)
//
// 對齊 M17 SSOT consolidation + audit recommendation:
//   原 `renderTypedValue` switch + `EditableCellContent` switch 兩條平行 type-switch 已 collapse
//   為**一張 type → cell component** registry。每個 cell component 同時處理 display / edit mode,
//   靠底層 Field control 的 `mode` prop 切換。
//
// 設計原則:
//   - 每個 cell component 接同一組 props(`CellComponentProps`)
//   - 用 `chrome="naked"` — DataTable cell-as-input substrate(對齊 Field B1 chrome=bare)
//   - 消費 full Field 家族 primitive(無 stub)
//   - 不再用 `meta._editable` 私有 flag — `isEditable` 直接顯式入參(消除 M1 hack)
//
// World-class 對照(@benchmark-unverified):AG Grid cellRendererSelector / Material X-Grid
// `valueGetter + renderCell` / Notion property type registry。

import * as React from 'react'
import type { ComponentType } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnType } from './column-types'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Button } from '@/design-system/components/Button/button'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'

// ── Types ────────────────────────────────────────────────────────────────────

export type CellMode = 'display' | 'edit'
export type CellSize = 'sm' | 'md' | 'lg'

export interface CellComponentProps {
  // any-allow: free-form column value(consumer-defined,跨 type 共用 signature)
  value: any
  // any-allow: free-form consumer meta bag(prefix / options / formatOptions / locale / linkLabel 等)
  meta: Record<string, any>
  mode: CellMode
  size: CellSize
  autoRowHeight: boolean
  /** 該 cell 是否可編。replaces 舊 `meta._editable` 私有 flag(Phase C M1 hack 移除)。 */
  isEditable?: boolean
  /** Cell 進 edit mode → 提交新值(blur / Enter / option select 都觸發)。 */
  onCommit?: (next: unknown) => void
  /** Esc 取消編輯,不 commit。 */
  onCancel?: () => void
  /** URL cell 專用:hover 顯示的 Pencil 鈕 → 進 edit mode(read mode 保留 link click 語意)。 */
  onRequestEdit?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 鍵盤 commit / cancel — string / number cell edit mode 共用 */
function makeKeyHandler(
  onCommit?: (v: unknown) => void,
  onCancel?: () => void,
  parseValue?: (raw: string) => unknown,
) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = (e.target as HTMLInputElement).value
      onCommit?.(parseValue ? parseValue(raw) : raw)
    }
  }
}

const sizeForInput = (size: CellSize): CellSize => size

// ── Cell Components ──────────────────────────────────────────────────────────

function StringCell({ value, mode, size, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') return <Input mode="display" value={value != null ? String(value) : ''} />
  return (
    <Input
      autoFocus
      chrome="naked"
      size={sizeForInput(size)}
      defaultValue={value != null ? String(value) : ''}
      onBlur={(e) => onCommit?.(e.target.value)}
      onKeyDown={makeKeyHandler(onCommit, onCancel)}
    />
  )
}

function NumberCell({ value, meta, mode, size, onCommit, onCancel }: CellComponentProps) {
  // currency 透過 columnType-aware prefix:type='currency' → 預設 '$'(可 override)
  const isCurrency = meta?.type === 'currency'
  const prefix = isCurrency ? (meta?.prefix ?? '$') : meta?.prefix
  if (mode === 'display') {
    return (
      <NumberInput
        mode="display"
        value={value as number | null}
        prefix={prefix}
        suffix={meta?.suffix}
        precision={meta?.precision}
        locale={meta?.locale}
      />
    )
  }
  const parseNum = (raw: string): number | null => {
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : null
  }
  return (
    <NumberInput
      autoFocus
      chrome="naked"
      size={sizeForInput(size)}
      defaultValue={typeof value === 'number' ? value : undefined}
      prefix={prefix}
      suffix={meta?.suffix}
      precision={meta?.precision}
      onBlur={(e) => onCommit?.(parseNum(e.target.value))}
      onKeyDown={makeKeyHandler(onCommit, onCancel, parseNum)}
    />
  )
}

function DateCell({ value, meta, mode, size, onCommit }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <DatePicker
        mode="display"
        value={value as string | null}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
      />
    )
  }
  return (
    <DatePicker
      autoFocus
      chrome="naked"
      size={sizeForInput(size)}
      value={typeof value === 'string' ? value : null}
      showTime={meta?.includeTime === true}
      onChange={(v) => onCommit?.(v)}
    />
  )
}

function TimeCell({ value, meta, mode, size, onCommit }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <TimePicker
        mode="display"
        value={value as string | null}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
      />
    )
  }
  return (
    <TimePicker
      chrome="naked"
      size={sizeForInput(size)}
      value={typeof value === 'string' ? value : null}
      showSeconds={meta?.showSeconds === true}
      minuteStep={meta?.minuteStep}
      secondStep={meta?.secondStep}
      onChange={(v) => onCommit?.(v)}
    />
  )
}

function SelectCell({ value, meta, mode, size, onCommit }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <Select
        mode="display"
        value={value as string | null}
        options={meta?.options ?? []}
        size={size}
        display="tag"
      />
    )
  }
  return (
    <Select
      autoFocus
      chrome="naked"
      size={sizeForInput(size)}
      options={meta?.options ?? []}
      value={value as string | null | undefined}
      onChange={(v) => onCommit?.(v)}
    />
  )
}

function MultiSelectCell({ value, meta, mode, size, autoRowHeight, onCommit }: CellComponentProps) {
  const wrap = autoRowHeight && meta?.wrap === true
  if (mode === 'display') {
    return (
      <Combobox
        mode="display"
        value={(value as string[] | null) ?? []}
        options={meta?.options ?? []}
        wrap={wrap}
        size={size}
      />
    )
  }
  return (
    <Combobox
      chrome="naked"
      size={sizeForInput(size)}
      options={meta?.options ?? []}
      value={Array.isArray(value) ? (value as string[]) : []}
      onChange={(v) => onCommit?.(v)}
    />
  )
}

function PersonCell({ value, mode, size, onCommit, meta }: CellComponentProps) {
  if (mode === 'display') {
    // PeoplePicker mode='display' 自動依 value 是否為 array 切 PersonDisplay vs MultiPersonDisplay
    return <PeoplePicker mode="display" value={value as PersonValue | null} size={size} />
  }
  return (
    <PeoplePicker
      chrome="naked"
      size={sizeForInput(size)}
      value={value as PersonValue | null}
      people={meta?.people ?? []}
      // PeoplePicker onChange 永遠 emit array(API contract);single mode commit 取首位
      onChange={(next) => onCommit?.(next[0] ?? null)}
    />
  )
}

function MultiPersonCell({ value, mode, size, onCommit, meta }: CellComponentProps) {
  if (mode === 'display') {
    return <PeoplePicker mode="display" value={(value as PersonValue[]) ?? []} size={size} />
  }
  return (
    <PeoplePicker
      chrome="naked"
      size={sizeForInput(size)}
      value={Array.isArray(value) ? (value as PersonValue[]) : []}
      people={meta?.people ?? []}
      onChange={(next) => onCommit?.(next)}
    />
  )
}

function BooleanCell({ value, mode, meta, size, isEditable, onCommit }: CellComponentProps) {
  // boolean 不分 read/edit mode — display 渲 mode='display' 純展示;editable 時直接 toggle Checkbox
  if (mode === 'display' && !isEditable) {
    return <Checkbox mode="display" checked={value === true} />
  }
  return (
    <Checkbox
      size={size === 'lg' ? 'lg' : 'md'}
      checked={value === true}
      onCheckedChange={(checked) => onCommit?.(checked === true)}
      aria-label={meta?.ariaLabel ?? '切換'}
    />
  )
}

/**
 * UrlCell — Phase C drift fix:
 *   舊 EditableCellContent edit mode 對 url 走 plain `<Input>`(失去 URL 驗證 + auto-link)。
 *   現改用 `<LinkInput>` edit mode → 保留 URL parse / hostname 顯示一致性 + 鍵盤 commit / cancel。
 *   read mode 仍 `<LinkInput mode="display">` = 一致 SSOT。
 *   editable 互動:hover 時右側出 Pencil 鈕 → 進 edit(保留 link click 語意,對齊原 spec)。
 */
function UrlCell({ value, meta, mode, size, isEditable, onRequestEdit, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    const display = (
      <LinkInput mode="display" value={value as string | null} label={meta?.linkLabel} />
    )
    if (!isEditable) return display
    // editable read mode:hover Pencil 鈕(對齊 spec 第十二段「url:read = 連結 + Pencil」)
    return (
      <span className="group/cell relative flex items-center w-full">
        <span className="flex-1 min-w-0">{display}</span>
        <Button
          variant="tertiary"
          size="xs"
          iconOnly
          startIcon={Pencil}
          aria-label="編輯連結"
          className={cn('ml-1 opacity-0 group-hover/cell:opacity-100 transition-opacity')}
          onClick={(e) => {
            e.stopPropagation()
            onRequestEdit?.()
          }}
        />
      </span>
    )
  }
  // edit mode:用 LinkInput edit(URL validation + hostname 顯示一致)
  return (
    <LinkInput
      autoFocus
      chrome="naked"
      size={sizeForInput(size)}
      defaultValue={value != null ? String(value) : ''}
      label={meta?.linkLabel}
      onBlur={(e) => onCommit?.((e.target as HTMLInputElement).value)}
      onKeyDown={makeKeyHandler(onCommit, onCancel)}
    />
  )
}

// ── Registry ────────────────────────────────────────────────────────────────
//
// type → cell component。新增 columnType 必同步註冊一條(否則 fallback 到 string)。

export const cellRegistry: Record<ColumnType, ComponentType<CellComponentProps>> = {
  string:      StringCell,
  number:      NumberCell,
  currency:    NumberCell,  // 共用 NumberCell — currency-ness 走 meta.type 判 prefix='$'
  date:        DateCell,
  time:        TimeCell,
  select:      SelectCell,
  multiSelect: MultiSelectCell,
  person:      PersonCell,
  multiPerson: MultiPersonCell,
  boolean:     BooleanCell,
  url:         UrlCell,
}

/** Resolve cell component by type;default = StringCell(consumer 沒設 type 的 fallback)。 */
export function resolveCellComponent(type?: ColumnType): ComponentType<CellComponentProps> {
  if (!type) return StringCell
  return cellRegistry[type] ?? StringCell
}
