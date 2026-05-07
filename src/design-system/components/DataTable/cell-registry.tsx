// DataTable Cell Registry — type-keyed SSOT for cell rendering(Phase C 2026-05-05)
//
// 對齊 M17 SSOT consolidation + audit recommendation:
//   原 `renderTypedValue` switch + `EditableCellContent` switch 兩條平行 type-switch 已 collapse
//   為**一張 type → cell component** registry。每個 cell component 同時處理 display / edit mode,
//   靠底層 Field control 的 `mode` prop 切換。
//
// 設計原則:
//   - 每個 cell component 接同一組 props(`CellComponentProps`)
//   - 用 `variant="naked"` — DataTable cell-as-input substrate(對齊 Field B1 chrome=bare)
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
import { Textarea } from '@/design-system/components/Textarea/textarea'
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
  /** Cell 進 edit mode → 提交新值(blur / Enter / option select 都觸發)— 提交後**自動 exit edit**。
   *  適用 single-shot commit:string / number / select(single)/ person(single)/ date / time / boolean / url。 */
  onCommit?: (next: unknown) => void
  /** Live commit — 提交新值但 **不 exit edit**(popover 持續開)。
   *  適用 multi-select 類:multiSelect / multiPerson — user 連續勾選,直到點外面才關。
   *  對齊 Notion / Linear / Airtable canonical:multi-pick popover 不在每次 toggle 後關閉。 */
  onCommitLive?: (next: unknown) => void
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

function StringCell({ value, mode, size, autoRowHeight, onCommit, onCancel }: CellComponentProps) {
  // string type canonical(2026-05-05 v2 user 校正:input space ≥ display space):
  //   - autoRowHeight: Textarea(display + edit)— display wrap text 撐高 row,edit textarea
  //     多行輸入、`!h-full` 填 cell。對齊 Notion long-text cell canonical。
  //   - fixed: Input(display + edit)— 單行 truncate display,單行 input edit;Field naked intrinsic
  //     高 = cell 高 = h-field-md,文字位置 display↔edit 完全一致。對齊 AG Grid / Material X-Grid。
  //   - autoRowHeight 是 table 框架決定(consumer 不需 per-column 設 meta.wrap)。
  //   - 互動(Textarea):Esc cancel / Cmd|Ctrl+Enter commit / blur commit;Enter 保留換行
  //   - 互動(Input):Esc cancel / Enter commit / blur commit
  const v = value != null ? String(value) : ''
  if (mode === 'display') {
    return autoRowHeight
      ? <Textarea variant="naked" mode="display" value={v} />
      : <Input variant="naked" mode="display" value={v} />
  }
  if (autoRowHeight) {
    // rows 估算(2026-05-05 v9 Bug 2 修):autoRow cell 進 edit 時 textarea intrinsic 必須
    // ≈ display div 高度(否則 row layout shift)。`!h-full` 走循環依賴 fallback 到
    // textarea intrinsic = `rows × line-height + padding + border`。
    // 估算 rows = max(顯式 \n 行數, 字元 wrap 行數)。chars-per-line=40 對齊 typical column
    // width(~300px content area / 14px font ~7-8px char width = 38-43 chars)。前 v8 用 60
    // 過寬鬆 → 3-line 內容算成 2 lines → cell 進 edit shrink。Min=1 防短 value 強撐 layout。
    const newlineRows = (v.match(/\n/g) || []).length + 1
    const wrapRows = Math.ceil(v.length / 40)
    const estimateRows = Math.min(10, Math.max(1, newlineRows, wrapRows))
    return (
      <Textarea
        autoFocus
        variant="naked"
        size={sizeForInput(size)}
        rows={estimateRows}
        defaultValue={v}
        onBlur={(e) => onCommit?.((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onCommit?.((e.target as HTMLTextAreaElement).value)
          }
        }}
      />
    )
  }
  return (
    <Input
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      defaultValue={v}
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
        variant="naked"
        mode="display"
        value={value as number | null}
        prefix={prefix}
        suffix={meta?.suffix}
        precision={meta?.precision}
        locale={meta?.locale}
      />
    )
  }
  // Edit mode value pre-fill canonical(2026-05-05):NumberInput edit 強制 controlled
  // (`value={value ?? ''}`)— 若 NumberCell 以 `defaultValue` 傳入,NumberInput value=undefined → ''
  // empty。對齊 cell-as-input「edit mode 自動帶入 display 值」(對齊 Notion / Airtable 共識),
  // 改用 local state controlled。User typing → setLocalValue;blur/Enter → onCommit(localValue)。
  const initial = typeof value === 'number' ? value : null
  const [localValue, setLocalValue] = React.useState<number | null>(initial)
  return (
    <NumberInput
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      value={localValue}
      onChange={setLocalValue}
      prefix={prefix}
      suffix={meta?.suffix}
      precision={meta?.precision}
      onBlur={() => onCommit?.(localValue)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
        if (e.key === 'Enter') { e.preventDefault(); onCommit?.(localValue) }
      }}
    />
  )
}

// Cell-as-input dismiss canonical(2026-05-05):defaultOpen=true 開始 → user click 外 popover 關
// → 元件 fire onOpenChange(false) → cell call onCancel exit edit。否則 cell 卡 edit mode 不可 re-trigger
// (對齊 Airtable / Notion canonical:click 外即關)。
const dismissOnClose = (onCancel?: () => void) => (open: boolean) => { if (!open) onCancel?.() }

// Mode-keyed remount canonical(2026-05-05):display↔edit 切換時,因 React reconciliation 同 type 同
// position 會重用 instance,導致 `useState(defaultOpen)` 只在首次 mount 跑(那時 mode='display'
// defaultOpen 沒給→預設 false)。後續 mode='edit' 即使傳 defaultOpen=true 也無效。
// Fix:`key={mode}` 強制 React unmount + remount,每次切 mode 都重跑 useState init。
// 對齊 Notion / Airtable cell-as-input「display 跟 edit 是不同 mount cycle」語義。

function DateCell({ value, meta, mode, size, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <DatePicker
        key="display"
        variant="naked"
        mode="display"
        value={value as string | null}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
      />
    )
  }
  return (
    <DatePicker
      key="edit"
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      value={typeof value === 'string' ? value : null}
      showTime={meta?.includeTime === true}
      onChange={(v) => onCommit?.(v)}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function TimeCell({ value, meta, mode, size, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <TimePicker
        key="display"
        variant="naked"
        mode="display"
        value={value as string | null}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
      />
    )
  }
  return (
    <TimePicker
      key="edit"
      variant="naked"
      size={sizeForInput(size)}
      value={typeof value === 'string' ? value : null}
      showSeconds={meta?.showSeconds === true}
      minuteStep={meta?.minuteStep}
      secondStep={meta?.secondStep}
      onChange={(v) => onCommit?.(v)}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function SelectCell({ value, meta, mode, size, onCommit, onCancel }: CellComponentProps) {
  // Display canonical(2026-05-05):cell IS variant,default plain text(no Tag pill 疊在 cell border 內)。
  // Consumer 可在 column meta.display='tag' opt-in 內容導向的 Tag 視覺(category 含色彩標籤等)。
  // 對齊 JTable / AG Grid「renderer/editor 視覺一致」canonical。
  const displayMode = (meta?.display as 'plain' | 'tag' | undefined) ?? 'plain'
  if (mode === 'display') {
    return (
      <Select
        key="display"
        variant="naked"
        mode="display"
        value={value as string | null}
        options={meta?.options ?? []}
        size={size}
        display={displayMode}
      />
    )
  }
  return (
    <Select
      key="edit"
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      options={meta?.options ?? []}
      value={value as string | null | undefined}
      onChange={(v) => onCommit?.(v)}
      // B7(2026-05-05):cell 編輯時支援 inline search,沿用 Select.searchable 機制(對齊 cell-as-input
      // 「沿用既有輸入框互動」原則)。Default false,consumer 在 meta.searchable 開啟。
      searchable={meta?.searchable === true}
      display={displayMode}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function MultiSelectCell({ value, meta, mode, size, autoRowHeight, onCommitLive, onCancel }: CellComponentProps) {
  const wrap = autoRowHeight && meta?.wrap === true
  if (mode === 'display') {
    return (
      <Combobox
        key="display"
        variant="naked"
        mode="display"
        value={(value as string[] | null) ?? []}
        options={meta?.options ?? []}
        wrap={wrap}
        size={size}
      />
    )
  }
  // Multi 用 onCommitLive(commit 但不 exit edit)— 每勾一項即時生效,popover 持續開
  // 直到點外面;onOpenChange(false) → onCancel exit edit。對齊 Notion / Linear / Airtable canonical。
  return (
    <Combobox
      key="edit"
      variant="naked"
      size={sizeForInput(size)}
      options={meta?.options ?? []}
      value={Array.isArray(value) ? (value as string[]) : []}
      onChange={(v) => onCommitLive?.(v)}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function PersonCell({ value, mode, size, onCommit, onCancel, meta }: CellComponentProps) {
  if (mode === 'display') {
    // PeoplePicker mode='display' 自動依 value 是否為 array 切 PersonDisplay vs MultiPersonDisplay
    return <PeoplePicker key="display" variant="naked" mode="display" value={value as PersonValue | null} size={size} />
  }
  return (
    <PeoplePicker
      key="edit"
      variant="naked"
      size={sizeForInput(size)}
      value={value as PersonValue | null}
      people={meta?.people ?? []}
      // PeoplePicker onChange 永遠 emit array(API contract);single mode commit 取首位
      onChange={(next) => onCommit?.(next[0] ?? null)}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function MultiPersonCell({ value, mode, size, onCommitLive, onCancel, meta }: CellComponentProps) {
  if (mode === 'display') {
    return <PeoplePicker key="display" variant="naked" mode="display" value={(value as PersonValue[]) ?? []} size={size} />
  }
  // Multi 用 onCommitLive(commit 但不 exit edit)— 每勾一人即時生效,popover 持續開
  // 直到點外面;onOpenChange(false) → onCancel exit edit。對齊 multiSelect canonical。
  return (
    <PeoplePicker
      key="edit"
      variant="naked"
      size={sizeForInput(size)}
      value={Array.isArray(value) ? (value as PersonValue[]) : []}
      people={meta?.people ?? []}
      onChange={(next) => onCommitLive?.(next)}
      defaultOpen
      onOpenChange={dismissOnClose(onCancel)}
    />
  )
}

function BooleanCell({ value, mode, meta, size, isEditable, onCommit }: CellComponentProps) {
  // boolean 不分 read/edit mode — display 渲 mode='display' 純展示;editable 時直接 toggle Checkbox
  if (mode === 'display' && !isEditable) {
    return <Checkbox variant="naked" mode="display" checked={value === true} />
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
      <LinkInput variant="naked" mode="display" value={value as string | null} label={meta?.linkLabel} />
    )
    if (!isEditable) return display
    // editable read mode:hover Pencil 鈕(對齊 spec 第十二段「url:read = 連結 + Pencil」)
    return (
      <span className="group/cell relative flex items-center w-full"> {/* @naked-row-mode-allow: URL hover-Pencil 是 inline action 不是 value content,items-center 鎖 Pencil 對齊行高第一行(autoRow 跟 fixed 皆同視覺正確) */}
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
  // edit mode value pre-fill canonical(2026-05-05):LinkInput edit `value` prop 強制 controlled
  // (line 113 `useState(value ?? '')`)+ `showLink = !editing && hasValidValue` 預設顯 link 不顯 input
  // → cell-as-input editing 場景需要 input 直接 focus 編輯。改用 plain `<Input>`(uncontrolled
  // `defaultValue` 正確 pre-fill,Input.tsx `value={value}` 是 undefined → uncontrolled 走 defaultValue)。
  // URL 驗證等 deferred 到 commit phase(consumer 可在 onCommit 時 validate)。
  return (
    <Input
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      defaultValue={value != null ? String(value) : ''}
      onBlur={(e) => onCommit?.(e.target.value)}
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
