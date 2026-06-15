// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — Select 含 3 子元件(NativeSelect/CustomSelect/ReadonlyDisplay)+ helpers + 4-mode renderer + Field SSOT consumption,split-into-files 會破壞 file-local helper closure
// @renderer-symmetry-allow: pre-existing Select architecture(2026-05-08 D-path)— selectedItemRenderer 由 CustomSelectTriggerContent 消費(edit + trigger 模式),ReadonlyDisplay 走 separate bare-span path(no D-path)。display→edit unify deferred 下 cycle per spec contract (a) note。本 turn 只加 `nakedCellRowModeAlign` import,no behavior change to renderer symmetry contract。
import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY, nakedCellRowModeAlign, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction, ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { useIsTouchDevice } from '@/design-system/hooks/use-is-touch-device'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── Tag padding per size ────────────────────────────────────────────────────
const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

// ── Display ─────────────────────────────────────────────────────────────────

/**
 * Select 用的 option schema(2026-05-10 Issue 4 + post-prune unify):**explicit extends
 * SelectMenuOption(primitive SSOT)** — 任何 SelectMenuOption 加 field 都自動繼承,不會 drift。
 *
 * Why `extends SelectMenuOption`(per user 「全盤檢查避免下次又改壞或是偏移」要求):
 *   - **schema SSOT 機械強制**:TypeScript inheritance 跟著 primitive 走,wrapper consumer 永遠
 *     拿得到 primitive 所有 surface field
 *   - **Hook lint**(M30 `check_wrapper_primitive_schema_drift.sh`):grep `interface .*Option`
 *     未 `extends` SelectMenuOption / 同名重複 declare 直接 BLOCK
 *
 * Wrapper-only field(`tagVariant`)— Select 獨有 `display='tag'` 用,SelectMenu primitive 不該知道
 * 此 wrapper-only concern,所以 wrapper 層 extend 加上,不污染 primitive。
 *
 * 對齊 Polaris ChoiceList / Material Autocomplete / Carbon Dropdown 的 wrapper-vs-primitive
 * schema-extension idiom。
 */
export interface SelectOption extends SelectMenuOption {
  /** Tag 模式的顏色。只在 display='tag' 時生效,對應 Tag 的 variant。Wrapper-only。 */
  tagVariant?: string
}

/** 分組設定 — 對齊 SelectMenuGroupConfig SSOT */
export interface SelectGroupConfig {
  key: string
  label: string
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'defaultValue' | 'onChange'> {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  /** 分組顯示(對齊 SelectMenu groups SSOT)。option.group 對應 groups[].key */
  groups?: SelectGroupConfig[]
  /** Controlled value(consumer 自管 state)。傳 `value` + `onChange` 表示 controlled mode。 */
  value?: string | null
  /** Uncontrolled 初始值(2026-05-21 D3 audit add per user verbatim「決策三照妳建議」+「都給我做到好」)。
   *  不傳 `value` 時 Select 自管 internal state,以 `defaultValue` 為初始值,選變更時 fire `onChange`
   *  callback 通知 consumer(但 state 仍歸 Select)。對齊 Radix Select(`defaultValue`)+ shadcn Input
   *  (`defaultValue`)+ React `<input>` dual-mode canonical。
   *  互斥規則:同時傳 `value` + `defaultValue` 走 controlled(value 勝),`defaultValue` 僅 first-mount 用。 */
  defaultValue?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  clearable?: boolean
  display?: 'plain' | 'tag'
  startIcon?: LucideIcon
  /** 啟用搜尋（desktop 時 field 變 input，打字即篩選） */
  searchable?: boolean
  /** Loading state(2026-05-15 audit B fix per user verbatim「dropdown 隨時可開,讀取在 panel 中間 CircularProgress」)。
   *  Forward 給 SelectMenu primitive SSOT;dropdown 開啟時取代 options 顯 CircularProgress + loadingText。
   *  Trigger 不變(chevron 保留 user 隨時可點開)。對齊 Field family loading SSOT + Empty 元件 `<Empty icon={CircularProgress}/>` compose。*/
  loading?: boolean

  /** Menu list 最小列數(空狀態 / 選項少時的視覺一致 reserve)。預設 3 — 選項 < 3 時顯式縮(如 And/Or 兩選項) */
  minRows?: number
  /** Initial open state(uncontrolled)。對齊 Radix Popover defaultOpen canonical;DataTable cell-as-input
   *  click → 1 step open menu(Airtable / Notion canonical),consumer pass `defaultOpen` 達成。
   *  Note:Native Select(mobile)無 popover 概念,此 prop 僅 Custom path 生效。 */
  defaultOpen?: boolean
  /** open state 變更 callback(對齊 Radix Popover onOpenChange canonical)。
   *  DataTable cell-as-input 用:open=false 時 cell 自動 exit edit mode(避免 dismiss 後卡住)。 */
  onOpenChange?: (open: boolean) => void
  /**
   * Display mode 顯 picker intrinsic end icon(2026-05-08 D path Phase 1)。
   * 預設 false:`mode="display"` 純展示 bare span(向後相容)。
   * `variant="naked" && mode="display"` 場景(DataTable cell)opt-in 設 true → wrap 進
   * Field naked-display + 渲 ChevronDown ItemSuffix。**只 display mode 生效**;readonly /
   * disabled / edit 已有 Field wrapper + suffix(不受此 prop 影響)。
   * Authority:`data-table.spec.md:204` + `inline-action.spec.md:157`「Field family endAction(自動繼承)」。
   * @default false
   */
  showDisplayEndIcon?: boolean
  /**
   * Trigger 內「已選項目」客製 render(2026-05-07 v15.5)。
   *
   * 設了 → trigger 不走純文字 / Tag 預設 path,改用 consumer 提供的 ReactNode(收 selectedOpt)。
   * Searchable+open 仍走 input(搜尋優先)。Empty value(no selection)仍走 placeholder。
   *
   * 用例:PeoplePicker 用此 slot 把 single 選中的 person render 成 PersonDisplay
   * (avatar + name)而非純文字 label。對齊 PeoplePicker = Select wrapper SSOT。
   */
  selectedItemRenderer?: (selectedOpt: SelectOption) => React.ReactNode
}

// ── Icon / size helpers ─────────────────────────────────────────────────────
// 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反)
const getIconSize = (size: string) => ICON_SIZE[size as 'sm' | 'md' | 'lg']

// ── Shared sub-components ───────────────────────────────────────────────────

/**
 * Inline clear button for Select trigger.
 * 共用 SSOT — Native + Custom 兩變體統一消費。差別僅 onClick 內是否 stopPropagation
 * (Custom trigger 是 combobox `<div>`,點 clear 不可冒泡到打開 menu;Native `<select>` 自有原生
 * 行為,不需 stopPropagation)。
 *
 * 消費的 SSOT:
 * - patterns/element-anatomy/item-anatomy.spec.md → ItemInlineAction(canonical row inline action)
 */
function SelectClearButton({
  size,
  onClear,
  stopPropagation = false,
}: {
  size: 'sm' | 'md' | 'lg'
  onClear: () => void
  stopPropagation?: boolean
}) {
  return (
    <span className="relative z-10">
      <ItemInlineAction
        size={size}
        action={{
          icon: X,
          label: '清除選取', // i18n-allow: DS default inline-action label
          onClick: stopPropagation ? (e) => { e?.stopPropagation(); onClear() } : () => onClear(),
        }}
      />
    </span>
  )
}
SelectClearButton.displayName = 'SelectClearButton'

/**
 * Trigger content for CustomSelect — 三種顯示模式分支(searchable+open / text / tag)
 * 抽出降低 `CustomSelect` forwardRef body 長度;邏輯本質是純展示分流,無 hook / ref。
 */
function CustomSelectTriggerContent({
  searchable,
  open,
  isTextDisplay,
  size,
  value,
  selectedLabel,
  selectedOpt,
  SelectedIcon,
  StartIcon,
  iconSize,
  placeholder,
  search,
  setSearch,
  inputRef,
  selectedItemRenderer,
}: {
  searchable: boolean
  open: boolean
  isTextDisplay: boolean
  size: 'sm' | 'md' | 'lg'
  value?: string | null
  selectedLabel: string
  selectedOpt?: SelectOption
  SelectedIcon?: LucideIcon
  StartIcon?: LucideIcon
  iconSize: number
  placeholder?: string
  search: string
  setSearch: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  selectedItemRenderer?: (selectedOpt: SelectOption) => React.ReactNode
}): React.ReactNode {
  // Searchable + open: 顯示搜尋 input
  // 2026-05-15 Bug 2 fix(Claude+Codex Step 5 比稿 consensus,user verbatim「就 A」):
  // 撤掉 native `<input placeholder=selectedLabel>` 不可靠 ellipsis renderer(browser-specific
  // placeholder painting,user 抓「placeholder 直接被截掉沒 ellipsis」)。改 span overlay:
  // - input native placeholder 限「搜尋…」/「請選擇人員」trigger empty hint(無 selectedLabel)
  // - sibling `<span aria-hidden pointer-events-none absolute inset-0 truncate>` 在 search='' 且
  //   有 selectedLabel 時 overlay 顯該人名(memory aid,truncate-with-ellipsis 可控)
  // 對齊 spec.md §B row 4「open + inline-search + 選 1 人 → input cursor + placeholder = 該人名 + ellipsis」。
  // a11y guard(per codex Q2 reply):input aria-label / accessible name 來自 field/label/aria-label,
  // **不**依賴 placeholder 當 label;overlay span aria-hidden + pointer-events-none。
  if (searchable && open) {
    const triggerEmptyPlaceholder = placeholder || '搜尋…' // i18n-allow: DS fallback
    const showSelectedOverlay = !search && selectedLabel
    return (
      <span className="relative flex-1 min-w-0 inline-flex items-center">
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // Native placeholder 限 trigger empty hint(無 selectedLabel 時);若已 selected,留空交給 overlay span
          placeholder={showSelectedOverlay ? '' : triggerEmptyPlaceholder}
          className={cn(bareInputStyles, 'cursor-text')}
          autoFocus
        />
        {showSelectedOverlay && (
          // 2026-05-16 Bug B 真 root cause fix(Claude+Codex M31 Step 5 比稿 consensus,user verbatim
          // 「修了一百次還沒好」+ codex cite W3C CSS Overflow / MDN / Mozilla Bug 972664#c1):
          // 原 `inline-flex items-center truncate` 套同一 span,text 變 anonymous flex item →
          // `text-overflow:ellipsis` 對 anonymous item 不 styleable → ellipsis dots 不可見(text 純 clip)。
          // 對齊 `person-display.tsx:148` 既有 DS canonical:outer flex container + inner truncate 真實 box。
          // DS-wide grep 29 個 truncate 都遵此 pattern,只本處違反 — 修齊。
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center text-fg-muted"
          >
            <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          </span>
        )}
      </span>
    )
  }
  // **selectedItemRenderer slot**(2026-05-07 v15.5):consumer 客製 selected display(e.g.
  // PeoplePicker 接 PersonDisplay)。優先於 isTextDisplay / Tag 預設 path,但 empty value
  // 仍走 placeholder。對齊 PeoplePicker = Select wrapper SSOT。
  if (selectedItemRenderer && value && selectedOpt) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {/* 2026-05-14 item-anatomy SSOT fix(per codex H2 propagation 斷點):加 nakedCellRowModeAlign
            → autoRowHeight cell 內 selected renderer 也對齊 first-line,不再 vertical-center 整 row。 */}
        <span className={cn("flex-1 min-w-0 inline-flex items-center", nakedCellRowModeAlign)}>{selectedItemRenderer(selectedOpt)}</span>
      </>
    )
  }
  // Text display: 純文字 + optional value icon
  if (isTextDisplay) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {!StartIcon && SelectedIcon && value && <ItemPrefix><SelectedIcon size={iconSize} className="pointer-events-none" aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 truncate', !value && 'text-fg-muted')}>
          {value ? selectedLabel : (placeholder ?? '選擇…')}
        </span>
      </>
    )
  }
  // Tag display: 用 option 的 tagVariant
  return (
    <>
      {value && selectedOpt?.tagVariant
        ? <Tag size={size} color={selectedOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'} className="shrink-0 pointer-events-none">{selectedLabel}</Tag>
        : value
          ? <Tag size={size} className="shrink-0 pointer-events-none">{selectedLabel}</Tag>
          : <span className="text-fg-muted">{placeholder ?? '選擇…'}</span>
      }
      <span className="flex-1" />
    </>
  )
}
CustomSelectTriggerContent.displayName = 'CustomSelectTriggerContent'

// ── Shared readonly/disabled/display render ─────────────────────────────────
function ReadonlyDisplay({
  mode, variant: variantProp, size, options, value, display, startIcon: StartIcon, className, placeholder, showDisplayEndIcon,
}: Pick<SelectProps, 'mode' | 'variant' | 'size' | 'options' | 'value' | 'display' | 'startIcon' | 'className' | 'placeholder' | 'showDisplayEndIcon'>) {
  const resolvedMode = mode ?? 'readonly'
  const variant = variantProp ?? 'default'
  const sz = size ?? 'md'
  const iconSize = getIconSize(sz)
  const label = options?.find(o => o.value === value)?.label ?? value
  const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'
  const isTextDisplay = display !== 'tag'
  // K10+K14 fix(2026-05-04):disabled mode placeholder/empty 顯示色 → fg-disabled(neutral-6),非 fg-muted(neutral-7)
  //   user canonical:disabled 顯著性優於 muted。同時 plain mode 必須 respect placeholder prop(之前忽略 = bug)
  const emptyColorCls = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'
  const emptyText = placeholder ?? EMPTY_DISPLAY

  // mode='display':2 path(2026-05-08 D path Phase 1 Select canary)
  //   ❌ 預設(無 showDisplayEndIcon):純內容輸出 bare span/Tag(原行為,backward compat)
  //      對齊原 SelectDisplay sub-component(retired)。readonly / disabled 仍走下方 fieldWrapperStyles。
  //   ✅ showDisplayEndIcon=true(DataTable cell opt-in):Field naked-display wrapper +
  //      ChevronDown ItemSuffix。SSOT canonical 跟 readonly/edit/disabled mode 同 DOM 結構。
  //      Authority: data-table.spec.md:204 + inline-action.spec.md:157「Field family endAction」
  if (resolvedMode === 'display') {
    if (!showDisplayEndIcon) {
      // 2026-05-14 I2 fix(spec contract (e) display typography canonical):bare span 必套
      // `fieldDisplayTextClass(sz)`(sm/md→text-body,lg→text-body-lg)— 對齊跨 Field
      // family display 視覺尺寸統一。
      if (!value) return <span className={cn(fieldDisplayTextClass(sz), 'text-fg-muted', className)}>{emptyText}</span>
      if (isTextDisplay) return <span className={cn(fieldDisplayTextClass(sz), 'truncate', className)}>{label}</span>
      const selOpt = options?.find(o => o.value === value)
      const tVariant = selOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
      return <Tag size={sz} color={tVariant} className={className}>{label}</Tag>
    }
    // D path opt-in: Field naked-display wrapper + ItemSuffix ChevronDown
    const selOpt = options?.find(o => o.value === value)
    const tVariant = selOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: 'display', variant, size: sz }), value && !isTextDisplay && tagPadding[sz], className)}
        data-field-mode="display"
      >
        {isTextDisplay ? (
          <span className={cn(bareInputStyles, 'flex-1 min-w-0 truncate', !value && emptyColorCls)}>
            {value ? label : emptyText}
          </span>
        ) : value ? (
          <Tag size={sz} color={tVariant}>{label}</Tag>
        ) : (
          <span className={cn('flex-1 min-w-0', emptyColorCls)}>{emptyText}</span>
        )}
        <ItemSuffix><ChevronDown size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemSuffix>
      </div>
    )
  }

  // 2026-06-10 user 拍板「類型身份 indicator」規則:readonly/disabled 保留 ChevronDown(表單情境恆顯;
  // naked cell 情境依 showDisplayEndIcon = isEditable,維持 2026-05-10 cell canonical「非可編欄不顯」)。
  // disabled → fg-disabled(對齊 spec L213 + Accordion M24 precedent + 原生 select/MUI/Carbon 慣例)。
  // aria-disabled:styled-disabled(非 native disabled 元素)需明告 AT「inactive」,同時讓 axe 正確
  // 豁免 disabled 文字的 color-contrast(WCAG 1.4.3 inactive UI 例外)。
  const showIndicator = variant === 'naked' ? !!showDisplayEndIcon : true
  const ariaDisabled = resolvedMode === 'disabled' ? true : undefined

  if (isTextDisplay) {
    return (
      <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), className)} data-field-mode={resolvedMode} aria-disabled={ariaDisabled}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className={cn('pointer-events-none', iconColor)} aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {value ? label : <span className={emptyColorCls}>{emptyText}</span>}
        </span>
        {showIndicator && <ItemSuffix className="pointer-events-none"><ChevronDown size={iconSize} className={cn('shrink-0', iconColor)} aria-hidden /></ItemSuffix>}
      </div>
    )
  }

  const selectedOpt = options?.find(o => o.value === value)
  const tagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined

  return (
    <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), value && tagPadding[sz], className)} data-field-mode={resolvedMode} aria-disabled={ariaDisabled}>
      {value ? <Tag size={sz} color={tagVariant}>{label}</Tag> : <span className={emptyColorCls}>{emptyText}</span>}
      {showIndicator && <ItemSuffix className="pointer-events-none"><ChevronDown size={iconSize} className={cn('shrink-0', iconColor)} aria-hidden /></ItemSuffix>}
    </div>
  )
}

// ── Native Select (mobile) ─────────────────────────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const NativeSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ mode, variant: variantProp, error: errorProp = false, size: sizeProp, options, value: valueProp, defaultValue, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'plain', startIcon: StartIcon, showDisplayEndIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, ...props }, ref) => {
    const fieldCtx = useFieldContext()
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-05-31 #11:size 從 Field context cascade(對齊 Input/NumberInput + MUI FormControl)
    const size = useResolvedFieldSize(sizeProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode(prop > 有效 disabled > fieldCtx.mode > 'edit');修 <Field mode="display"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    const iconSize = getIconSize(size)
    // 2026-05-21 D3 audit:Controlled / Uncontrolled dual-mode via 既有 SSOT hook(同 CustomSelect)
    const [value, setValue] = useControllable<string | null>({
      value: valueProp,
      defaultValue: defaultValue ?? null,
      onChange: onChange ? (next) => onChange(next ?? '') : undefined,
    })
    const handleNativeChange = (v: string) => setValue(v)
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'plain'
    const selectRef = React.useRef<HTMLSelectElement | null>(null)
    const setSelectRef = React.useCallback((el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }, [ref])

    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} showDisplayEndIcon={showDisplayEndIcon} />
    }

    const selectEl = (
      <select
        ref={setSelectRef}
        id={idProp ?? fieldCtx?.id}
        value={value ?? ''}
        onChange={(e) => handleNativeChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
        aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
        className={cn(bareInputStyles, 'cursor-pointer appearance-none', !value && 'text-fg-muted', !isTextDisplay && value && 'absolute inset-0 w-full h-full opacity-0 z-0')}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )

    const clearEl = showClear ? (
      <SelectClearButton size={size ?? 'md'} onClear={() => handleNativeChange('')} />
    ) : null

    const chevronEl = (
      <ItemSuffix className="relative z-10 pointer-events-none">
        <ChevronDown size={iconSize} className="text-fg-muted" aria-hidden />
      </ItemSuffix>
    )
    const selectedOpt = options?.find(o => o.value === value)
    const label = selectedOpt?.label ?? value
    const nativeTagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    const SelectedOptIcon = selectedOpt?.icon

    if (!isTextDisplay) {
      return (
        <div className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }), value && tagPadding[size], 'relative',
          error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
          style={{ paddingRight: '0.75rem' }} data-field-mode="edit" data-error={error ? '' : undefined}>
          {value ? <Tag size={size} color={nativeTagVariant} className="shrink-0 relative z-10 pointer-events-none">{label}</Tag> : <span className="text-fg-muted">{placeholder ?? '選擇...'}</span>}
          {selectEl}
          <span className="flex-1" />
          {clearEl}
          {chevronEl}
        </div>
      )
    }

    return (
      <div className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }),
        error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
        data-field-mode="edit" data-error={error ? '' : undefined}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {!StartIcon && SelectedOptIcon && value && <ItemPrefix><SelectedOptIcon size={iconSize} className="pointer-events-none" aria-hidden /></ItemPrefix>}
        {selectEl}
        {clearEl}
        {chevronEl}
      </div>
    )
  }
)
NativeSelect.displayName = 'NativeSelect'

// ── Custom Select (desktop — consumes SelectMenu) ────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const CustomSelect = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ mode, variant: variantProp, error: errorProp = false, size: sizeProp, options, groups, value: valueProp, defaultValue, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'plain', startIcon: StartIcon, searchable = false, loading, minRows, defaultOpen = false, onOpenChange, selectedItemRenderer, showDisplayEndIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, 'aria-label': ariaLabel }, ref) => {
    const fieldCtx = useFieldContext()
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-05-31 #11:size 從 Field context cascade(對齊 Input/NumberInput + MUI FormControl)
    const size = useResolvedFieldSize(sizeProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode(prop > 有效 disabled > fieldCtx.mode > 'edit');修 <Field mode="display"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    const iconSize = getIconSize(size)
    // 2026-05-21 D3 audit:Controlled / Uncontrolled dual-mode via 既有 SSOT hook(M17 對齊,取代自刻 isControlled pattern)。
    // Phase B codex 抓:之前 Custom clear 走 `onChange?.('')` 沒 setInternalValue → uncontrolled clear 失效。useControllable 統一 setter 修。
    // onChange forward coerce null → ''(consumer 簽名 `(value: string) => void`,null 是 internal empty signal)。
    const [value, setValue] = useControllable<string | null>({
      value: valueProp,
      defaultValue: defaultValue ?? null,
      onChange: onChange ? (next) => onChange(next ?? '') : undefined,
    })
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'plain'

    const [open, setOpen] = React.useState(defaultOpen)
    const [search, setSearch] = React.useState('')
    const inputRef = React.useRef<HTMLInputElement>(null)

    // 關閉時清搜尋
    React.useEffect(() => { if (!open) setSearch('') }, [open])

    // **React #310 fix(2026-05-04)**:所有 hooks 必在任何 early return 前 call,
    //   否則 disabled→edit 切換時 hook count 變動 → React 死亡。
    //   原本 useMemo(L280, L291) 在 early return 之後 = latent bug,K13 觸發(filter Op 從 disabled
    //   變 edit 當 user 選欄位)。修法:把所有 useMemo 提到 early return 之前。
    const selectedOpt = options?.find(o => o.value === value)
    // 2026-05-06 v9.1:value 不在 options 也要顯示原值(不沉默丟失)。原 fallback `''` 致
    // SelectCell 開 edit 時若 cell value 不在當前 options(e.g. 上游資料漂移 / options async
    // 後到 / 跨 dataset),trigger 顯示空白 — user 報「value 不見」。對齊 ReadonlyDisplay 同
    // 級 fallback `?? value`。
    const selectedLabel = selectedOpt?.label ?? value ?? ''
    const SelectedIcon = selectedOpt?.icon
    // ── 過濾選項 ──
    const filteredOptions = searchable && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options
    // ── 轉換 SelectOption → SelectMenuOption(必在 early return 前) ──
    // Issue 4(2026-05-10):forward avatar / description / disabled SSOT(per SelectMenuOption schema)。
    const menuOptions: SelectMenuOption[] = React.useMemo(
      () => filteredOptions.map(opt => ({
        value: opt.value,
        label: opt.label,
        icon: isTextDisplay ? opt.icon : undefined,
        avatar: opt.avatar,
        description: opt.description,
        disabled: opt.disabled,
        group: opt.group,
      })),
      [filteredOptions, isTextDisplay]
    )
    // ── Tag display 自訂 label 渲染(必在 early return 前) ──
    const renderLabel = React.useMemo(() => {
      if (isTextDisplay) return undefined
      return (menuOpt: SelectMenuOption) => {
        const srcOpt = options.find(o => o.value === menuOpt.value)
        if (srcOpt?.tagVariant) {
          return <Tag size={size} color={srcOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'}>{menuOpt.label}</Tag>
        }
        return menuOpt.label
      }
    }, [isTextDisplay, options, size])

    // **React #310 fix v2(2026-05-04)**:`handleValueChange` useCallback 也必在 early return 前
    //   原本 L306(early return 後)→ disabled→edit 切換時 hook count 仍變 → #310 持續
    // 2026-05-21 D3:`useControllable` 統一 controlled / uncontrolled state + onChange forward,不再手動 if-branch。
    const handleValueChange = React.useCallback(
      (newValue: string | string[]) => {
        setValue(Array.isArray(newValue) ? newValue[0] : newValue)
      },
      [setValue]
    )

    // Early return AFTER all hooks(disabled / readonly / display mode 走 ReadonlyDisplay)
    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} showDisplayEndIcon={showDisplayEndIcon} />
    }

    // 2026-05-21 D3 Phase B codex 抓:Custom clear 用 setValue 不直接 onChange,uncontrolled clear 才能真清 internal state。
    const clearEl = showClear ? (
      <SelectClearButton size={size ?? 'md'} onClear={() => setValue('')} stopPropagation />
    ) : null

    const chevronEl = (
      <ItemSuffix>
        <ChevronDown size={iconSize} className={cn('text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </ItemSuffix>
    )

    const triggerContent = (
      <CustomSelectTriggerContent
        searchable={searchable}
        open={open}
        isTextDisplay={isTextDisplay}
        size={size}
        value={value}
        selectedLabel={selectedLabel}
        selectedOpt={selectedOpt}
        SelectedIcon={SelectedIcon}
        StartIcon={StartIcon}
        iconSize={iconSize}
        placeholder={placeholder}
        search={search}
        setSearch={setSearch}
        inputRef={inputRef}
        selectedItemRenderer={selectedItemRenderer}
      />
    )

    // hooks(filteredOptions / menuOptions / renderLabel / handleValueChange)已全 hoist(React #310 fix v2)

    const trigger = (
      <div
        ref={ref}
        id={idProp ?? fieldCtx?.id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
        aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
        tabIndex={0}
        className={cn(
          fieldWrapperStyles({ mode: 'edit', variant: variant, size }),
          !isTextDisplay && value && !searchable && tagPadding[size],
          // 2026-05-06 v13.3 SSOT retire:per-control `open && 'border-primary'` 移除。Field default
          // state machine `data-[state=open]:border-border-hover`(灰深)處理 open;若 trigger focused
          // (Radix focus on open),focus-within:!border-primary 強制勝出顯藍。focus dominates everything
          // 全 DS 一致(Material/Polaris/Ant 共識),改 Field default 一處全 control 自動跟動。
          error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'],
          'cursor-pointer',
          className,
        )}
        style={!isTextDisplay ? { paddingRight: '0.75rem' } : undefined}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            // 2026-06-11 P0 a11y(R2 deep-audit):原 guard `!searchable` 連「關閉時的鍵盤開啟」一起擋
            // → searchable Select / PeoplePicker single 鍵盤打不開(WCAG 2.1.1)。原意只是開啟後
            // 別吃掉搜尋框的 Space/Enter → 正確 guard = !open(關閉才攔;開啟後不干擾 input 輸入)。
            if (!open) { e.preventDefault(); setOpen(true) }
          }
          // APG combobox 展開鍵:ArrowDown 也可開(對齊 combobox.tsx 同 pattern;open 後不攔讓方向鍵導覽選單)
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) }
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {triggerContent}
        {clearEl}
        {chevronEl}
      </div>
    )

    return (
      <SelectMenu
        options={menuOptions}
        groups={groups}
        value={value ?? null}
        onValueChange={handleValueChange}
        searchable={false}
        loading={loading}
        size={size}
        minRows={minRows}
        open={open}
        onOpenChange={(o) => { setOpen(o); onOpenChange?.(o) }}
        renderLabel={renderLabel}
        onOpenAutoFocus={searchable ? (e) => { e.preventDefault(); inputRef.current?.focus() } : undefined}
      >
        {trigger}
      </SelectMenu>
    )
  }
)
CustomSelect.displayName = 'CustomSelect'

// ── Public component（自動偵測 mobile / desktop）──────────────────────────────

const Select = React.forwardRef<HTMLSelectElement | HTMLDivElement, SelectProps>(
  (props, ref) => {
    const isMobile = useIsTouchDevice()

    if (isMobile) {
      return <NativeSelect ref={ref as React.Ref<HTMLSelectElement>} {...props} />
    }

    return <CustomSelect ref={ref as React.Ref<HTMLDivElement>} {...props} />
  }
)
Select.displayName = 'Select'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const selectMeta = {
  component: 'Select',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { Select }
