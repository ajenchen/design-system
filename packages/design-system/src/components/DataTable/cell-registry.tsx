// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — Cell Registry 含 10 cell-type components(string/number/date/time/select/multiSelect/person/multiPerson/boolean/url)+ shared helpers,split-into-files 會破壞 type-keyed registry SSOT canonical
// DataTable Cell Registry — type-keyed SSOT for cell rendering(Phase C 2026-05-05)
//
// 對齊 M17 SSOT consolidation + audit recommendation:
//   原 `renderTypedValue` switch + `EditableCellContent` switch 兩條平行 type-switch 已 collapse
//   為**一張 type → cell component** registry。每個 cell component 同時處理 view / edit mode,
//   靠底層 Field control 的 `mode` prop 切換。
//
// 設計原則:
//   - 每個 cell component 接同一組 props(`CellComponentProps`)
//   - 用 `variant="naked"` — DataTable cell-as-input substrate(Field chrome variant;bare 2026-07-09 退役)
//   - 消費 full Field 家族 primitive(無 stub)
//   - 不再用 `meta._editable` 私有 flag — `isEditable` 直接顯式入參(消除 M1 hack)
//
// World-class 對照(@benchmark-unverified):AG Grid cellRendererSelector / Material X-Grid
// `valueGetter + renderCell` / Notion property type registry。

import * as React from 'react'
import type { ComponentType } from 'react'
import { Pencil } from 'lucide-react'
import { cn, lineClampClass } from '@/lib/utils'
import type { ColumnType } from './column-types'
import { Input as InputPublic } from '@/design-system/components/Input/input'
import { Textarea as TextareaPublic } from '@/design-system/components/Textarea/textarea'
import { NumberInput as NumberInputPublic } from '@/design-system/components/NumberInput/number-input'
import { Select as SelectPublic } from '@/design-system/components/Select/select'
import { Combobox as ComboboxPublic } from '@/design-system/components/Combobox/combobox'
import { DatePicker as DatePickerPublic } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker as TimePickerPublic } from '@/design-system/components/TimePicker/time-picker'
import { PeoplePicker as PeoplePickerPublic } from '@/design-system/components/PeoplePicker/people-picker'
import { LinkInput as LinkInputPublic } from '@/design-system/components/LinkInput/link-input'
import { Checkbox as CheckboxPublic } from '@/design-system/components/Checkbox/checkbox'
import { Button } from '@/design-system/components/Button/button'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import { FieldSurfaceProvider, FieldSurfaceSizeProvider, FieldSurfaceEditableProvider } from '@/design-system/components/Field/field-context'
import { makeEditSettleKeyHandler } from '@/design-system/components/Field/field-edit-keys'
import type { WithFieldVariantInternal } from '@/design-system/components/Field/field-types'

// ── @internal naked variant 通道(2026-07-14 API 策展 E,user 拍板「全部收窄」)──────────────
// `naked` 已從公開 FieldVariant 拆出(field-types.ts `FieldVariantInternal`);本檔是唯一合法
// naked 消費者(field-controls.spec.md「軸二 variant」明文)。以 `WithFieldVariantInternal`
// 型別層 widen 各 Field control 的 `variant` prop — 純型別、零 runtime;元件內部 cva / resolver
// 分支本就吃 FieldVariantInternal,widen 不引入 unsound 行為。
const Input = InputPublic as WithFieldVariantInternal<typeof InputPublic>
const Textarea = TextareaPublic as WithFieldVariantInternal<typeof TextareaPublic>
const NumberInput = NumberInputPublic as WithFieldVariantInternal<typeof NumberInputPublic>
const Select = SelectPublic as WithFieldVariantInternal<typeof SelectPublic>
const Combobox = ComboboxPublic as WithFieldVariantInternal<typeof ComboboxPublic>
const DatePicker = DatePickerPublic as WithFieldVariantInternal<typeof DatePickerPublic>
const TimePicker = TimePickerPublic as WithFieldVariantInternal<typeof TimePickerPublic>
const PeoplePicker = PeoplePickerPublic as WithFieldVariantInternal<typeof PeoplePickerPublic>
const LinkInput = LinkInputPublic as WithFieldVariantInternal<typeof LinkInputPublic>
const Checkbox = CheckboxPublic as WithFieldVariantInternal<typeof CheckboxPublic>

// ── Types ────────────────────────────────────────────────────────────────────

export type CellMode = 'view' | 'edit'
export type CellSize = 'sm' | 'md' | 'lg'

export interface CellComponentProps {
  // any-allow: free-form column value(consumer-defined,跨 type 共用 signature)
  value: any
  // any-allow: free-form consumer meta bag(prefix / options / formatOptions / locale / linkLabel 等)
  meta: Record<string, any>
  mode: CellMode
  size: CellSize
  /** 該 cell 的 accessible name(= 欄標題)。naked Field 控件在 cell 內無 FieldLabel,
   *  漏此名 → editor 成無名控件(axe aria-input-field-name / select-name)。由 renderCellContent
   *  從 columnDef.header 解析後注入。對齊 AG Grid / MUI X「editor aria-label = column headerName」。 */
  ariaLabel?: string
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
  // 消費 edit-in-place 鍵盤結算 SSOT(field-edit-keys.ts):IME guard + Enter/Esc dispatch 統一
  // (2026-07-09 抽出;原本 InlineEdit 漏 IME guard = bug,現同源)。value 讀取為 input-specific,留本地。
  return makeEditSettleKeyHandler({
    onCommit: (e) => {
      const raw = (e.target as HTMLInputElement).value
      onCommit?.(parseValue ? parseValue(raw) : raw)
    },
    onCancel: () => onCancel?.(),
  })
}

const sizeForInput = (size: CellSize): CellSize => size

// 2026-07-16 round16:cell「disabled」態廢除(世界級 grid 無 disabled cell — MUI X / AG Grid /
//   Handsontable 皆只有 editable/readonly;meta.disabled 全庫 0 消費)。cell view 態一律 mode="view",
//   鎖定用 `editable:(row)=>false` 閘(= isCellEditable 模型)。原 displayOrDisabled helper 已移除。

// ── Cell Components ──────────────────────────────────────────────────────────

function StringCell({ value, meta, mode, size, autoRowHeight, onCommit, onCancel, onDraft, ariaLabel }: CellComponentProps) {
  // 2026-05-14 I9 fix(per codex+Layer A 共識):meta.maxLines opt-in line-clamp。
  // view autoRow 用 Tailwind arbitrary line-clamp 支援 N rows;edit textarea field-sizing
  // 已 auto-grow to content,natural match clamp。
  // 2026-05-16 Round 5 audit Dim 27 fix:narrow type 取代 `as any` cast。
  const maxLines: number | undefined = (meta as { maxLines?: number } | undefined)?.maxLines
  const clampClass = autoRowHeight ? lineClampClass(maxLines) : undefined
  // string type canonical(2026-05-05 v2 user 校正:input space ≥ display space):
  //   - autoRowHeight: Textarea(view + edit)— view wrap text 撐高 row,edit textarea
  //     多行輸入、`!h-full` 填 cell。對齊 Notion long-text cell canonical。
  //   - fixed: Input(view + edit)— 單行 truncate view,單行 input edit;Field naked intrinsic
  //     高 = cell 高 = h-field-md,文字位置 view↔edit 完全一致。對齊 AG Grid / Material X-Grid。
  //   - autoRowHeight 是 table 框架決定(consumer 不需 per-column 設 meta.wrap)。
  //   - 互動(Textarea):Esc cancel / Cmd|Ctrl+Enter commit / blur commit;Enter 保留換行
  //   - 互動(Input):Esc cancel / Enter commit / blur commit
  const v = value != null ? String(value) : ''
  if (mode === 'view') {
    // size 必傳:DataTable cell 字級隨 size 變(sm/md text-body / lg text-body-lg),
    // 對齊 Field family size→font SSOT(field-wrapper.tsx:60-64)。漏傳 → fallback md → lg 表格
    // 字卡 14px 跟 Select/Date 等有傳 size 的 cell 不一致(2026-06-08 user 抓 frozen string 欄字偏小)。
    return autoRowHeight
      ? <Textarea variant="naked" mode="view" value={v} size={size} className={clampClass} aria-label={ariaLabel} />
      : <Input variant="naked" mode="view" value={v} size={size} aria-label={ariaLabel} />
  }
  if (autoRowHeight) {
    // 2026-05-14 I8 fix(per codex verdict + user 抓「edit cell shrink」):
    // 原 `wrapRows = value.length / 40` 字元估算不準(對應實際 column width 不同
    // → cell 進 edit shrink)。改 CSS `field-sizing: content`(Chrome 123+ / FF 122+ /
    // Safari 17+)讓 textarea 自動 grow to content,匹配 view wrap 真實高度。
    // Fallback rows 仍保留給舊 browser(rows attr 在 field-sizing 支援時被覆蓋)。
    const newlineRows = (v.match(/\n/g) || []).length + 1
    const wrapRows = Math.ceil(v.length / 40)
    const estimateRows = Math.min(10, Math.max(1, newlineRows, wrapRows))
    return (
      <Textarea
        autoFocus
        variant="naked"
        aria-label={ariaLabel}
        size={sizeForInput(size)}
        rows={estimateRows}
        defaultValue={v}
        // any-allow: CSS `field-sizing` 屬性 Chrome 123+/FF 122+/Safari 17+ 支援但 TypeScript lib.dom
        // 尚未加 type;narrow 到 CSSProperties 仍需 cast,保留 single-site any 較 type aug 簡潔。
        style={{ fieldSizing: 'content' } as React.CSSProperties}
        onChange={(e) => onDraft?.((e.target as HTMLTextAreaElement).value)}
        onBlur={(e) => onCommit?.((e.target as HTMLTextAreaElement).value)}
        // 多行:走 edit-in-place 鍵盤結算 SSOT(IME guard + Esc + Cmd/Ctrl+Enter commit;
        // plain Enter=換行)。commitOnEnter:false → 純 Enter 不攔。
        onKeyDown={makeEditSettleKeyHandler({
          onCommit: (e) => onCommit?.((e.target as HTMLTextAreaElement).value),
          onCancel: () => onCancel?.(),
          commitOnEnter: false,
        })}
      />
    )
  }
  return (
    <Input
      autoFocus
      variant="naked"
      aria-label={ariaLabel}
      size={sizeForInput(size)}
      defaultValue={v}
      onChange={(e) => onDraft?.(e.target.value)}
      onBlur={(e) => onCommit?.(e.target.value)}
      onKeyDown={makeKeyHandler(onCommit, onCancel)}
    />
  )
}

function NumberCell({ value, meta, mode, size, onCommit, onCancel, onDraft, ariaLabel }: CellComponentProps) {
  // currency 透過 columnType-aware prefix:type='currency' → 預設 '$'(可 override)
  const isCurrency = meta?.type === 'currency'
  const prefix = isCurrency ? (meta?.prefix ?? '$') : meta?.prefix
  // React #310 fix:useState 必在 view early-return 前無條件呼叫。同一 memo'd cell instance
  // 在 view↔edit 切換時被重用(render site 無 key={mode},data-table.tsx:1352),hook 數量不可變,
  // 否則 Rules of Hooks violation → React #310 crash。對齊 combobox/select hoist pattern。
  const initial = typeof value === 'number' ? value : null
  const [localValue, setLocalValue] = React.useState<number | null>(initial)
  if (mode === 'view') {
    return (
      <NumberInput
        variant="naked"
        mode="view"
        aria-label={ariaLabel}
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
  // empty。對齊 cell-as-input「edit mode 自動帶入 view 值」(對齊 Notion / Airtable 共識),
  // 改用 local state controlled。User typing → setLocalValue;blur/Enter → onCommit(localValue)。
  // (initial + useState 已 hoist 到 view-return 前 — 見上方 React #310 fix。)
  return (
    <NumberInput
      autoFocus
      variant="naked"
      aria-label={ariaLabel}
      size={sizeForInput(size)}
      value={localValue}
      onChange={(v) => { setLocalValue(v); onDraft?.(v) }}
      prefix={prefix}
      suffix={meta?.suffix}
      precision={meta?.precision}
      onBlur={() => onCommit?.(localValue)}
      // 單行:走 edit-in-place 鍵盤結算 SSOT(IME guard + Esc + Enter commit)。
      // commit localValue(controlled state,非 e.target.value)。
      onKeyDown={makeEditSettleKeyHandler({
        onCommit: () => onCommit?.(localValue),
        onCancel: () => onCancel?.(),
      })}
    />
  )
}

// Cell-as-input dismiss canonical(2026-05-05):defaultOpen=true 開始 → user click 外 popover 關
// → 元件 fire onOpenChange(false) → cell call onCancel exit edit。否則 cell 卡 edit mode 不可 re-trigger
// (對齊 Airtable / Notion canonical:click 外即關)。
const dismissOnClose = (onCancel?: () => void) => (open: boolean) => { if (!open) onCancel?.() }

// Mode-keyed remount canonical(2026-05-05):view↔edit 切換時,因 React reconciliation 同 type 同
// position 會重用 instance,導致 `useState(defaultOpen)` 只在首次 mount 跑(那時 mode='view'
// defaultOpen 沒給→預設 false)。後續 mode='edit' 即使傳 defaultOpen=true 也無效。
// Fix:`key={mode}` 強制 React unmount + remount,每次切 mode 都重跑 useState init。
// 對齊 Notion / Airtable cell-as-input「view 跟 edit 是不同 mount cycle」語義。

function DateCell({ value, meta, mode, size, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'view') {
    return (
      <DatePicker
        key="view"
        variant="naked"
        mode="view"
        value={value as string | null}
        size={size}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
        // 2026-07-08 user 拍板 A 案(推翻 2026-05-10/06-26 兩次拍板,per 6 家 benchmark 6/6 共識
        // Ant/MUI X/AG Grid/Atlaskit/Notion/Airtable:view 態零恆顯型別 icon;editable
        // affordance 統一 = hover outline(field.spec.md L4)。showDisplayEndIcon 不再傳
        //(prop 保留為 spreadsheet-flavored 消費端 opt-in 逃生門,見 field.spec.md L6)。
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
  if (mode === 'view') {
    return (
      <TimePicker
        key="view"
        variant="naked"
        mode="view"
        value={value as string | null}
        size={size}
        formatOptions={meta?.formatOptions}
        locale={meta?.locale}
        // showDisplayEndIcon 不傳 — 2026-07-08 A 案:view 態零恆顯 icon(同 DateCell 註)
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
  // View canonical(2026-05-05):cell IS variant,default plain text(no Tag pill 疊在 cell border 內)。
  // Consumer 可在 column meta.display='tag' opt-in 內容導向的 Tag 視覺(category 含色彩標籤等)。
  // 對齊 JTable / AG Grid「renderer/editor 視覺一致」canonical。
  const displayMode = (meta?.display as 'plain' | 'tag' | undefined) ?? 'plain'
  if (mode === 'view') {
    return (
      <Select
        key="view"
        variant="naked"
        mode="view"
        value={value as string | null}
        options={meta?.options ?? []}
        size={size}
        display={displayMode}
        // showDisplayEndIcon 不傳 — 2026-07-08 A 案:view 態零恆顯 icon(同 DateCell 註)
        selectedItemRenderer={meta?.selectedItemRenderer}  // 2026-07-08 WM 戰役:status 類彩色 cell 顯示通道
      />
    )
  }
  return (
    <Select
      key="edit"
      autoFocus
      variant="naked"
      size={sizeForInput(size)}
      selectedItemRenderer={meta?.selectedItemRenderer}
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
  if (mode === 'view') {
    return (
      <Combobox
        key="view"
        variant="naked"
        mode="view"
        value={(value as string[] | null) ?? []}
        options={meta?.options ?? []}
        wrap={wrap}
        size={size}
        // showDisplayEndIcon 不傳 — 2026-07-08 A 案:view 態零恆顯 icon(同 DateCell 註)
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
  if (mode === 'view') {
    // 2026-07-08 A 案:view 態零恆顯 icon(同 DateCell 註)
    return <PeoplePicker key="view" variant="naked" mode="view" value={value as PersonValue | null} size={size} />
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
  if (mode === 'view') {
    // 2026-07-08 A 案:view 態零恆顯 icon(同 DateCell 註)
    return <PeoplePicker key="view" variant="naked" mode="view" value={(value as PersonValue[]) ?? []} size={size} />
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
  // boolean 不分 read/edit mode — view 渲 mode='view' 純展示;editable 時直接 toggle Checkbox。
  // 不可編(!isEditable)→ 走 view branch,Checkbox mode="view" 純展示不接 onCheckedChange。
  if (mode === 'view' && !isEditable) {
    // size 傳入 → boolean 值 icon(Check/X)@lg 縮放對齊其他 cell(對齊 editable 分支同 size 邏輯)
    return <Checkbox variant="naked" size={size === 'lg' ? 'lg' : 'md'} mode="view" checked={value === true} />
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
 * UrlCell(2026-07-14 docblock 對齊實作):
 *   view branch = `<LinkInput mode="view">`(URL parse / hostname
 *   顯示一致性 SSOT);editable 互動:hover 時右側出 Pencil 鈕 → 進 edit(保留 link click 語意)。
 *   edit branch = plain `<Input variant="naked">`(LinkInput edit 的 controlled value 衝突
 *   revert,詳下方 edit branch 註解);URL 驗證 deferred 到 onCommit(consumer 端 validate)。
 */
function UrlCell({ value, meta, mode, size, isEditable, onRequestEdit, onCommit, onCancel }: CellComponentProps) {
  if (mode === 'view') {
    // showDisplayEndIcon ← D path Phase 2(2026-05-08):Field naked wrapper 包 anchor,與 Input edit 同 chrome。
    // LinkInput 此 prop = wrapper-only(無 icon,field.spec.md L6 例外)→ A 案(2026-07-08)不撤;
    // 但修 I1:原無條件 true 違反「= isEditable」knob 等式(field-controls.spec.md cell 例外),改等式。
    const display = (
      <LinkInput variant="naked" mode="view" value={value as string | null} label={meta?.linkLabel} size={size} showDisplayEndIcon={isEditable === true} />
    )
    // 不可編 URL 不顯 Pencil affordance(純 view 顯示連結,無編輯入口)
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
          {/* 2026-07-08 user 拍板:cell 可編輯訊號經獨立 boolean context 注給 child Field controls,
              讓 useFieldEmptyDisplay 分流「可編輯 cell 空 view → 空白」vs「不可編輯 cell → '-'」。
              boolean primitive 不破壞 memo identity(同 size context)。 */}
          <FieldSurfaceEditableProvider isEditable={props.isEditable ?? false}>
            <Inner {...props} />
          </FieldSurfaceEditableProvider>
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
