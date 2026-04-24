import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
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
}

function SelectDisplay({ value, options, size }: { value?: string | null; options?: SelectOption[]; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const opt = options?.find(o => o.value === value)
  const label = opt?.label ?? value
  const variant = opt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
  return <Tag size={size} variant={variant}>{label}</Tag>
}
SelectDisplay.displayName = 'SelectDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'onChange'> {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  clearable?: boolean
  display?: 'text' | 'tag'
  startIcon?: LucideIcon
  /** 啟用搜尋（desktop 時 field 變 input，打字即篩選） */
  searchable?: boolean
}

// ── Icon / size helpers ─────────────────────────────────────────────────────
const getIconSize = (size: string) => size === 'lg' ? 20 : 16

// ── Shared readonly/disabled render ─────────────────────────────────────────
function ReadonlyDisplay({
  mode, size, options, value, display, startIcon: StartIcon, className,
}: Pick<SelectProps, 'mode' | 'size' | 'options' | 'value' | 'display' | 'startIcon' | 'className'>) {
  const resolvedMode = mode ?? 'readonly'
  const sz = size ?? 'md'
  const iconSize = getIconSize(sz)
  const label = options?.find(o => o.value === value)?.label ?? value
  const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'
  const isTextDisplay = display !== 'tag'

  if (isTextDisplay) {
    return (
      <div className={cn(fieldWrapperStyles({ mode: resolvedMode, size: sz }), className)} data-field-mode={resolvedMode}>
        {StartIcon && <StartIcon size={iconSize} className={cn('shrink-0 pointer-events-none', iconColor)} aria-hidden />}
        <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {value ? label : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>}
        </span>
      </div>
    )
  }

  const selectedOpt = options?.find(o => o.value === value)
  const tagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined

  return (
    <div className={cn(fieldWrapperStyles({ mode: resolvedMode, size: sz }), value && tagPadding[sz], className)} data-field-mode={resolvedMode}>
      {value ? <Tag size={sz} variant={tagVariant}>{label}</Tag> : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>}
    </div>
  )
}

// ── Native Select (mobile) ─────────────────────────────────────────────

const NativeSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ mode = 'edit', error: errorProp = false, size = 'md', options, value, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'text', startIcon: StartIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, ...props }, ref) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const iconSize = getIconSize(size)
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'text'
    const selectRef = React.useRef<HTMLSelectElement | null>(null)
    const setSelectRef = React.useCallback((el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }, [ref])

    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} />
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
      <span className="relative z-10">
        <ItemInlineAction
          size={size ?? 'md'}
          action={{ icon: X, label: '清除選取', onClick: () => onChange?.('') }} // i18n-allow: DS default inline-action label; consumer override by passing own `clearable` / wrapping logic
        />
      </span>
    ) : null

    const chevronEl = <ChevronDown size={iconSize} className="shrink-0 text-fg-muted pointer-events-none relative z-10" aria-hidden />
    const selectedOpt = options?.find(o => o.value === value)
    const label = selectedOpt?.label ?? value
    const nativeTagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    const SelectedOptIcon = selectedOpt?.icon

    if (!isTextDisplay) {
      return (
        <div className={cn(fieldWrapperStyles({ mode: 'edit', size }), value && tagPadding[size], 'relative',
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
      <div className={cn(fieldWrapperStyles({ mode: 'edit', size }),
        error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
        data-field-mode="edit" data-error={error ? '' : undefined}>
        {StartIcon && <StartIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />}
        {!StartIcon && SelectedOptIcon && value && <SelectedOptIcon size={iconSize} className="shrink-0 pointer-events-none" aria-hidden />}
        {selectEl}
        {clearEl}
        {chevronEl}
      </div>
    )
  }
)
NativeSelect.displayName = 'NativeSelect'

// ── Custom Select (desktop — consumes SelectMenu) ────────────────────────

const CustomSelect = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ mode = 'edit', error: errorProp = false, size = 'md', options, value, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'text', startIcon: StartIcon, searchable = false, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp }, ref) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const iconSize = getIconSize(size)
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'text'

    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const inputRef = React.useRef<HTMLInputElement>(null)

    // 關閉時清搜尋
    React.useEffect(() => { if (!open) setSearch('') }, [open])

    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} />
    }

    const selectedOpt = options?.find(o => o.value === value)
    const selectedLabel = selectedOpt?.label ?? ''
    const SelectedIcon = selectedOpt?.icon

    const clearEl = showClear ? (
      <span className="relative z-10">
        <ItemInlineAction
          size={size ?? 'md'}
          action={{
            icon: X,
            label: '清除選取', // i18n-allow: DS default inline-action label
            onClick: (e) => { e?.stopPropagation(); onChange?.('') },
          }}
        />
      </span>
    ) : null

    const chevronEl = <ChevronDown size={iconSize} className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />

    // ── Trigger content ──
    const triggerContent = searchable && open ? (
      // Searchable + open: 顯示搜尋 input
      <>
        {StartIcon && <StartIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />}
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selectedLabel || placeholder || '搜尋…'}
          className={cn(bareInputStyles, 'cursor-text')}
          autoFocus
        />
      </>
    ) : isTextDisplay ? (
      // Text display: 純文字 + optional value icon
      <>
        {StartIcon && <StartIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />}
        {!StartIcon && SelectedIcon && value && <SelectedIcon size={iconSize} className="shrink-0 pointer-events-none" aria-hidden />}
        <span className={cn('flex-1 min-w-0 truncate', !value && 'text-fg-muted')}>
          {value ? selectedLabel : (placeholder ?? '選擇…')}
        </span>
      </>
    ) : (
      // Tag display: 用 option 的 tagVariant
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

    // ── 過濾選項（searchable 時由 trigger input 過濾，不走 SelectMenu 內建搜尋）──
    const filteredOptions = searchable && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options

    // ── 轉換 SelectOption → SelectMenuOption ──
    const menuOptions: SelectMenuOption[] = React.useMemo(
      () => filteredOptions.map(opt => ({
        value: opt.value,
        label: opt.label,
        icon: isTextDisplay ? opt.icon : undefined,
      })),
      [filteredOptions, isTextDisplay]
    )

    // ── Tag display: 自訂 label 渲染 ──
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

    const handleValueChange = React.useCallback(
      (newValue: string | string[]) => {
        const v = Array.isArray(newValue) ? newValue[0] : newValue
        onChange?.(v)
      },
      [onChange]
    )

    const trigger = (
      <div
        ref={ref}
        id={idProp ?? fieldCtx?.id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
        aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
        tabIndex={0}
        className={cn(
          fieldWrapperStyles({ mode: 'edit', size }),
          !isTextDisplay && value && !searchable && tagPadding[size],
          open && !error && 'border-primary',
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
        value={value ?? null}
        onValueChange={handleValueChange}
        searchable={false}
        size={size}
        open={open}
        onOpenChange={setOpen}
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

export { Select, SelectDisplay }
