// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — Cell Registry 含 10 cell-type components(string/number/date/time/select/multiSelect/person/multiPerson/boolean/url)+ shared helpers,split-into-files 會破壞 type-keyed registry SSOT canonical
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
import { FieldSurfaceProvider, FieldSurfaceSizeProvider } from '@/design-system/components/Field/field-context'

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
  /** 2026-05-13:cell 是否 disabled(state overlay,orthogonal to display/edit lifecycle)。
   *  per codex Q3 verdict:不擴 CellMode='disabled',加 prop。各 Cell function 收 true 時
   *  傳 `mode='disabled'` 給 inner Field control,各 Field 內部走具體 disabled token(非 wrapper opacity)。 */
  isDisabled?: boolean
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
  /** Per-keystroke draft propagation(2026-05-10 Phase 7 D.3 portal Field virtualizer unmount preserve draft):
   *  Edit mode 內部 input onChange/onValueChange 每 keystroke 呼叫 onDraft,讓 lifted draft state(in
   *  data-table.tsx)持有 user 編輯中字。Cell DOM unmount(virtualizer scroll out)時 draft 在
   *  parent state 不丟;mount-back 時 portal Field value 從 draft 取,user 字保留。
   *  非 portal mode(inline edit)不傳此 prop,各 Cell 走原 uncontrolled defaultValue 路徑。 */
  onDraft?: (next: unknown) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 鍵盤 commit / cancel — string / number cell edit mode 共用 */
function makeKeyHandler(
  onCommit?: (v: unknown) => void,
  onCancel?: () => void,
  parseValue?: (raw: string) => unknown,
) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 組字 guard(2026-07-05 D4 fix):中文輸入法選字的 Enter 是組字確認、Esc 是取消組字,
    // 非 commit / cancel 意圖 — 無 guard 會把半截組字提交並退出 edit(Esc 則丟棄整個 draft)。
    // 同 data-table.tsx nav handler 既有寫法(isComposing + Safari/舊 Chrome keyCode 229)。
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = (e.target as HTMLInputElement).value
      onCommit?.(parseValue ? parseValue(raw) : raw)
    }
  }
}

const sizeForInput = (size: CellSize): CellSize => size

/** 2026-05-13 Q3 helper(per codex Q3 verdict):cell display + isDisabled → Field mode='disabled'。
 *  Cell display lifecycle 不擴 CellMode='disabled',而是各 Cell 在 display branch 翻譯 isDisabled
 *  → Field mode='disabled' prop。inner Field 內部走具體 disabled token(text-fg-disabled / bg-disabled 等),
 *  非 wrapper blanket opacity-disabled 逃生艙(per color.spec.md:729)。 */
const displayOrDisabled = (isDisabled?: boolean): 'display' | 'disabled' =>
  isDisabled ? 'disabled' : 'display'

// ── Cell Components ──────────────────────────────────────────────────────────

function StringCell({ value, meta, mode, size, isDisabled, autoRowHeight, onCommit, onCancel, onDraft }: CellComponentProps) {
  // 2026-05-14 I9 fix(per codex+Layer A 共識):meta.maxLines opt-in line-clamp。
  // display autoRow 用 Tailwind arbitrary line-clamp 支援 N rows;edit textarea field-sizing
  // 已 auto-grow to content,natural match clamp。
  // 2026-05-16 Round 5 audit Dim 27 fix:narrow type 取代 `as any` cast。
  const maxLines: number | undefined = (meta as { maxLines?: number } | undefined)?.maxLines
  const clampClass = maxLines && autoRowHeight ? `line-clamp-[${maxLines}]` : undefined
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
    // size 必傳:DataTable cell 字級隨 size 變(sm/md text-body / lg text-body-lg),
    // 對齊 Field family size→font SSOT(field-wrapper.tsx:60-64)。漏傳 → fallback md → lg 表格
    // 字卡 14px 跟 Select/Date 等有傳 size 的 cell 不一致(2026-06-08 user 抓 frozen string 欄字偏小)。
    return autoRowHeight
      ? <Textarea variant="naked" mode={displayOrDisabled(isDisabled)} value={v} size={size} className={clampClass} />
      : <Input variant="naked" mode={displayOrDisabled(isDisabled)} value={v} size={size} />
  }
  if (autoRowHeight) {
    // 2026-05-14 I8 fix(per codex verdict + user 抓「edit cell shrink」):
    // 原 `wrapRows = value.length / 40` 字元估算不準(對應實際 column width 不同
    // → cell 進 edit shrink)。改 CSS `field-sizing: content`(Chrome 123+ / FF 122+ /
    // Safari 17+)讓 textarea 自動 grow to content,匹配 display wrap 真實高度。
    // Fallback rows 仍保留給舊 browser(rows attr 在 field-sizing 支援時被覆蓋)。
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
        // any-allow: CSS `field-sizing` 屬性 Chrome 123+/FF 122+/Safari 17+ 支援但 TypeScript lib.dom
        // 尚未加 type;narrow 到 CSSProperties 仍需 cast,保留 single-site any 較 type aug 簡潔。
        style={{ fieldSizing: 'content' } as React.CSSProperties}
        onChange={(e) => onDraft?.((e.target as HTMLTextAreaElement).value)}
        onBlur={(e) => onCommit?.((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          // IME 組字 guard(2026-07-05 D4 fix,同 makeKeyHandler)
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
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
      onChange={(e) => onDraft?.(e.target.value)}
      onBlur={(e) => onCommit?.(e.target.value)}
      onKeyDown={makeKeyHandler(onCommit, onCancel)}
    />
  )
}

function NumberCell({ value, meta, mode, size, isDisabled, onCommit, onCancel, onDraft }: CellComponentProps) {
  // currency 透過 columnType-aware prefix:type='currency' → 預設 '$'(可 override)
  const isCurrency = meta?.type === 'currency'
  const prefix = isCurrency ? (meta?.prefix ?? '$') : meta?.prefix
  // React #310 fix:useState 必在 display early-return 前無條件呼叫。同一 memo'd cell instance
  // 在 display↔edit 切換時被重用(render site 無 key={mode},data-table.tsx:1352),hook 數量不可變,
  // 否則 Rules of Hooks violation → React #310 crash。對齊 combobox/select hoist pattern。
  const initial = typeof value === 'number' ? value : null
  const [localValue, setLocalValue] = React.useState<number | null>(initial)
  if (mode === 'display') {
    return (
      <NumberInput
        variant="naked"
        mode={displayOrDisabled(isDisabled)}
        value={value as number | null}
        // size 必傳(同 StringCell)— currency/number cell 字級隨 DataTable size 變,對齊 Field SSOT。
        size={size}
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
  // (initial + useState 已 hoist 到 display-return 前 — 見上方 React #310 fix。)
  return (
    <NumberInput
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      value={localValue}
      onChange={(v) => { setLocalValue(v); onDraft?.(v) }}
      prefix={prefix}
      suffix={meta?.suffix}
      precision={meta?.precision}
      onBlur={() => onCommit?.(localValue)}
      onKeyDown={(e) => {
        // IME 組字 guard(2026-07-05 D4 fix,同 makeKeyHandler;IME 可在 number 欄輸入全形數字)
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
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

function DateCell({ value, meta, mode, size, isDisabled, isEditable, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <DatePicker
        key="display"
        variant="naked"
        mode={displayOrDisabled(isDisabled)}
        value={value as string | null}
        size={size}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
        // Indicator(calendar icon)= editable affordance(2026-05-10 user 糾正)。
        // Non-editable cell 不該顯 picker indicator(誤導 read-only 為 editable)。
        // 對齊 UrlCell L394 / BooleanCell L368 既有 isEditable conditional pattern。
        showDisplayEndIcon={isEditable === true}
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

function TimeCell({ value, meta, mode, size, isDisabled, isEditable, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    return (
      <TimePicker
        key="display"
        variant="naked"
        mode={displayOrDisabled(isDisabled)}
        value={value as string | null}
        size={size}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
        showDisplayEndIcon={isEditable === true}  // 2026-05-10:non-editable 不顯 indicator
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

function SelectCell({ value, meta, mode, size, isDisabled, isEditable, onCommit, onCancel }: CellComponentProps) {
  // Display canonical(2026-05-05):cell IS variant,default plain text(no Tag pill 疊在 cell border 內)。
  // Consumer 可在 column meta.display='tag' opt-in 內容導向的 Tag 視覺(category 含色彩標籤等)。
  // 對齊 JTable / AG Grid「renderer/editor 視覺一致」canonical。
  const displayMode = (meta?.display as 'plain' | 'tag' | undefined) ?? 'plain'
  if (mode === 'display') {
    return (
      <Select
        key="display"
        variant="naked"
        mode={displayOrDisabled(isDisabled)}
        value={value as string | null}
        options={meta?.options ?? []}
        size={size}
        display={displayMode}
        showDisplayEndIcon={isEditable === true}  // 2026-05-10:non-editable 不顯 chevron indicator
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

function MultiSelectCell({ value, meta, mode, size, isDisabled, autoRowHeight, isEditable, onCommitLive, onCancel }: CellComponentProps) {
  const wrap = autoRowHeight && meta?.wrap === true
  if (mode === 'display') {
    return (
      <Combobox
        key="display"
        variant="naked"
        mode={displayOrDisabled(isDisabled)}
        value={(value as string[] | null) ?? []}
        options={meta?.options ?? []}
        wrap={wrap}
        size={size}
        showDisplayEndIcon={isEditable === true}  // 2026-05-10:non-editable 不顯 chevron indicator
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

function PersonCell({ value, mode, size, isDisabled, isEditable, onCommit, onCancel, meta }: CellComponentProps) {
  if (mode === 'display') {
    // 2026-05-10:non-editable 不顯 chevron indicator(對齊 UrlCell isEditable conditional pattern)
    return <PeoplePicker key="display" variant="naked" mode={displayOrDisabled(isDisabled)} value={value as PersonValue | null} size={size} showDisplayEndIcon={isEditable === true} />
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

function MultiPersonCell({ value, mode, size, isDisabled, isEditable, onCommitLive, onCancel, meta }: CellComponentProps) {
  if (mode === 'display') {
    // 2026-05-10:non-editable 不顯 chevron indicator
    return <PeoplePicker key="display" variant="naked" mode={displayOrDisabled(isDisabled)} value={(value as PersonValue[]) ?? []} size={size} showDisplayEndIcon={isEditable === true} />
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

function BooleanCell({ value, mode, meta, size, isEditable, isDisabled, onCommit }: CellComponentProps) {
  // boolean 不分 read/edit mode — display 渲 mode='display' 純展示;editable 時直接 toggle Checkbox
  // 2026-05-13 codex V1 fix:editable=true + disabled=true 之前 fall through to live Checkbox,
  // onCheckedChange 仍 fire(violate disabled contract)。Fix:`!isEditable || isDisabled` →
  // 走 display branch,Checkbox 拿 disabled mode + 不接 onCheckedChange。
  if (mode === 'display' && (!isEditable || isDisabled)) {
    return <Checkbox variant="naked" mode={displayOrDisabled(isDisabled)} checked={value === true} />
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
 *   read mode 仍 `<LinkInput mode={displayOrDisabled(isDisabled)}>` = 一致 SSOT。
 *   editable 互動:hover 時右側出 Pencil 鈕 → 進 edit(保留 link click 語意,對齊原 spec)。
 */
function UrlCell({ value, meta, mode, size, isDisabled, isEditable, onRequestEdit, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'display') {
    // showDisplayEndIcon ← D path Phase 2(2026-05-08):Field naked wrapper 包 anchor,與 Input edit 同 chrome
    const display = (
      <LinkInput variant="naked" mode={displayOrDisabled(isDisabled)} value={value as string | null} label={meta?.linkLabel} size={size} showDisplayEndIcon />
    )
    // 2026-05-13 codex V1 fix:disabled URL 不顯 Pencil affordance(parent onRequestEdit 已被攔但 UI 仍誤導)
    if (!isEditable || isDisabled) return display
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

/** Resolve cell component by type;default = StringCell(consumer 沒設 type 的 fallback)。
 *  2026-05-12 Stream C Cluster B fix:wrap with FieldSurfaceProvider `surface='table-cell'`
 *  讓所有 Cell 內的 Field family controls 透過 `useFieldSurface()` 取得「我在 cell 裡」context,
 *  取代散落的 `variant === 'naked'` cell-detection heuristic + per-prop hardcoded padding。
 *
 *  **2026-05-13 (a) perf fix(user 拍板 + codex V1 verdict + Layer A grep root cause)**:
 *  原 factory pattern 每次 call 在 function body 內宣告新 `CellWithSurface` FC closure → 每 scroll
 *  × 每 visible cell 都 return 新 FC reference → React 認 component type 變,**整 subtree mount/
 *  unmount cascade**(Field + ItemPrefix/Suffix + Avatar / Tag / PersonDisplay)。
 *  Fix:每 ColumnType **module-level 預建** wrapped FC + `React.memo`,resolve 走 cached map,
 *  identity stable across scroll → memo 真生效 + subtree 不 mount/unmount。
 *  Cite world-class:AG Grid「cell renderer per-type stable reference」/ MUI X DataGrid「memoized
 *  subcomponents」/ Glide Data Grid「DOM virtualization 加解掛 = bottleneck」。 */
const cellWithSurfaceCache = new Map<ColumnType | '_default_', ComponentType<CellComponentProps>>()

function buildCellWithSurface(Inner: ComponentType<CellComponentProps>, key: string): ComponentType<CellComponentProps> {
  const CellWithSurface = React.memo(function CellWithSurface(props: CellComponentProps) {
    return (
      <FieldSurfaceProvider surface="table-cell">
        {/* 2026-06-08:把 table-density size 經獨立 surface-size context 注給 child Field controls,
            漏傳 size 的 cell 也自動繼承(根治「新 cell 漏傳 size」class);size primitive 不破壞 memo identity。*/}
        <FieldSurfaceSizeProvider size={props.size}>
          <Inner {...props} />
        </FieldSurfaceSizeProvider>
      </FieldSurfaceProvider>
    )
  })
  ;(CellWithSurface as { displayName?: string }).displayName = `CellWithSurface(${key})`
  return CellWithSurface as ComponentType<CellComponentProps>
}

// Pre-build per-type cached wrapped components(module-level,one-time init)
for (const type of Object.keys(cellRegistry) as ColumnType[]) {
  cellWithSurfaceCache.set(type, buildCellWithSurface(cellRegistry[type], type))
}
cellWithSurfaceCache.set('_default_', buildCellWithSurface(StringCell, 'StringCell-fallback'))

export function resolveCellComponent(type?: ColumnType): ComponentType<CellComponentProps> {
  return cellWithSurfaceCache.get(type ?? '_default_') ?? cellWithSurfaceCache.get('_default_')!
}
