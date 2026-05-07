import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction, ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { useIsTouchDevice } from '@/design-system/hooks/use-is-touch-device'

// ── Tag padding per size ────────────────────────────────────────────────────
const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

// ── Display ─────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
  /** Tag 模式的顏色。只在 display='tag' 時生效,對應 Tag 的 variant */
  tagVariant?: string
  /** 代表 value 的 prefix icon。觸發器和 dropdown 都會顯示。顏色跟 label 同(foreground) */
  icon?: LucideIcon
  /** 分組 key — 對應 SelectProps.groups[].key,有 groups 時必填(SelectMenu canonical) */
  group?: string
}

/** 分組設定 — 對齊 SelectMenuGroupConfig SSOT */
export interface SelectGroupConfig {
  key: string
  label: string
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'onChange'> {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  /** 分組顯示(對齊 SelectMenu groups SSOT)。option.group 對應 groups[].key */
  groups?: SelectGroupConfig[]
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  clearable?: boolean
  display?: 'plain' | 'tag'
  startIcon?: LucideIcon
  /** 啟用搜尋（desktop 時 field 變 input，打字即篩選） */
  searchable?: boolean
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
const getIconSize = (size: string) => size === 'lg' ? 20 : 16

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
  if (searchable && open) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selectedLabel || placeholder || '搜尋…'}
          className={cn(bareInputStyles, 'cursor-text')}
          autoFocus
        />
      </>
    )
  }
  // **selectedItemRenderer slot**(2026-05-07 v15.5):consumer 客製 selected display(e.g.
  // PeoplePicker 接 PersonDisplay)。優先於 isTextDisplay / Tag 預設 path,但 empty value
  // 仍走 placeholder。對齊 PeoplePicker = Select wrapper SSOT。
  if (selectedItemRenderer && value && selectedOpt) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        <span className="flex-1 min-w-0 inline-flex items-center">{selectedItemRenderer(selectedOpt)}</span>
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
        ? <Tag size={size} variant={selectedOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'} className="shrink-0 pointer-events-none">{selectedLabel}</Tag>
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
  mode, variant: variantProp, size, options, value, display, startIcon: StartIcon, className, placeholder,
}: Pick<SelectProps, 'mode' | 'variant' | 'size' | 'options' | 'value' | 'display' | 'startIcon' | 'className' | 'placeholder'>) {
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

  // mode='display'(Phase B2 2026-05-05):純內容輸出,無 Field wrapper chrome / 無 input affordance。
  //   對齊原 SelectDisplay sub-component(retired) — Tag mode → 純 <Tag>;text mode → 純 text。
  //   readonly / disabled 仍走下方 fieldWrapperStyles(input chrome 鎖定的 a11y signal)。
  if (resolvedMode === 'display') {
    if (!value) return <span className={cn('text-fg-muted', className)}>{emptyText}</span>
    if (isTextDisplay) return <span className={cn('truncate', className)}>{label}</span>
    const selOpt = options?.find(o => o.value === value)
    const tVariant = selOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    return <Tag size={sz} variant={tVariant} className={className}>{label}</Tag>
  }

  if (isTextDisplay) {
    return (
      <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), className)} data-field-mode={resolvedMode}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className={cn('pointer-events-none', iconColor)} aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {value ? label : <span className={emptyColorCls}>{emptyText}</span>}
        </span>
      </div>
    )
  }

  const selectedOpt = options?.find(o => o.value === value)
  const tagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined

  return (
    <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), value && tagPadding[sz], className)} data-field-mode={resolvedMode}>
      {value ? <Tag size={sz} variant={tagVariant}>{label}</Tag> : <span className={emptyColorCls}>{emptyText}</span>}
    </div>
  )
}

// ── Native Select (mobile) ─────────────────────────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const NativeSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ mode = 'edit', variant: variantProp, error: errorProp = false, size = 'md', options, value, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'plain', startIcon: StartIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, ...props }, ref) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const variant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
    const iconSize = getIconSize(size)
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'plain'
    const selectRef = React.useRef<HTMLSelectElement | null>(null)
    const setSelectRef = React.useCallback((el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }, [ref])

    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} />
    }

    const selectEl = (
      <select
        ref={setSelectRef}
        id={idProp ?? fieldCtx?.id}
        value={value ?? ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
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
      <SelectClearButton size={size ?? 'md'} onClear={() => onChange?.('')} />
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
          {value ? <Tag size={size} variant={nativeTagVariant} className="shrink-0 relative z-10 pointer-events-none">{label}</Tag> : <span className="text-fg-muted">{placeholder ?? '選擇...'}</span>}
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
  ({ mode = 'edit', variant: variantProp, error: errorProp = false, size = 'md', options, groups, value, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'plain', startIcon: StartIcon, searchable = false, minRows, defaultOpen = false, onOpenChange, selectedItemRenderer, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, 'aria-label': ariaLabel }, ref) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const variant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
    const iconSize = getIconSize(size)
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
    const menuOptions: SelectMenuOption[] = React.useMemo(
      () => filteredOptions.map(opt => ({
        value: opt.value,
        label: opt.label,
        icon: isTextDisplay ? opt.icon : undefined,
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
          return <Tag size={size} variant={srcOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'}>{menuOpt.label}</Tag>
        }
        return menuOpt.label
      }
    }, [isTextDisplay, options, size])

    // **React #310 fix v2(2026-05-04)**:`handleValueChange` useCallback 也必在 early return 前
    //   原本 L306(early return 後)→ disabled→edit 切換時 hook count 仍變 → #310 持續
    const handleValueChange = React.useCallback(
      (newValue: string | string[]) => {
        const v = Array.isArray(newValue) ? newValue[0] : newValue
        onChange?.(v)
      },
      [onChange]
    )

    // Early return AFTER all hooks(disabled / readonly / display mode 走 ReadonlyDisplay)
    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} />
    }

    const clearEl = showClear ? (
      <SelectClearButton size={size ?? 'md'} onClear={() => onChange?.('')} stopPropagation />
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
            if (!searchable) { e.preventDefault(); setOpen(true) }
          }
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
