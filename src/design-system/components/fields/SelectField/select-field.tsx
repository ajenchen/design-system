import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Tag padding per size ────────────────────────────────────────────────────
// tag 四邊等距：p = (field-height - tag-height) / 2
// sm 用 tag-sm (20px=1.25rem)，md/lg 用 tag-md/lg (24px=1.5rem)
const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

// ── Display ─────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

function SelectFieldDisplay({ value, options, size }: { value?: string | null; options?: SelectOption[]; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const label = options?.find(o => o.value === value)?.label ?? value
  return <Tag size={size}>{label}</Tag>
}
SelectFieldDisplay.displayName = 'SelectFieldDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'onChange'> {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  /** 允許清空已選值 */
  clearable?: boolean
  /** 顯示模式：text = 純文字（像 TextField），tag = Tag 標籤。預設 text */
  display?: 'text' | 'tag'
  /** 左側 icon（display="text" 時，代表 value 的圖示） */
  startIcon?: LucideIcon
}

// ── Component ───────────────────────────────────────────────────────────────

const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      mode = 'edit',
      error = false,
      size = 'md',
      options,
      value,
      onChange,
      placeholder,
      className,
      disabled,
      clearable = false,
      display = 'text',
      startIcon: StartIcon,
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : mode
    const iconSize = size === 'lg' ? 20 : 16
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'text'
    const selectRef = React.useRef<HTMLSelectElement>(null)
    const setSelectRef = React.useCallback((el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }, [ref])
    const openSelect = () => { selectRef.current?.showPicker?.(); selectRef.current?.focus() }

    // readonly / disabled
    if (resolvedMode !== 'edit') {
      const label = options?.find(o => o.value === value)?.label ?? value
      const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'

      if (isTextDisplay) {
        // text 模式：跟 TextField readonly/disabled 一致
        return (
          <div
            className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
            data-field-mode={resolvedMode}
          >
            {StartIcon && <StartIcon size={iconSize} className={cn('shrink-0 pointer-events-none', iconColor)} aria-hidden />}
            <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
              {value ? label : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>}
            </span>
          </div>
        )
      }

      // tag 模式
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), value && tagPadding[size], className)}
          data-field-mode={resolvedMode}
        >
          <span className={cn(resolvedMode === 'disabled' && 'bg-disabled text-fg-disabled')}>
            {value
              ? <Tag size={size}>{label}</Tag>
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
        </div>
      )
    }

    // edit — 共用的 select + clear + chevron
    const selectEl = (
      <select
        ref={setSelectRef}
        value={value ?? ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={cn(
          bareInputStyles,
          'cursor-pointer appearance-none',
          !value && 'text-fg-muted',
          // tag 模式：select 覆蓋整個 field（跟 MultiSelect 同模式）
          !isTextDisplay && value && 'absolute inset-0 w-full h-full opacity-0 z-0',
        )}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )

    const clearEl = showClear ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange?.('')}
            className="group/action relative grid place-content-center shrink-0 cursor-pointer text-fg-muted hover:text-foreground active:text-foreground transition-colors relative z-10"
            style={{ width: iconSize, height: iconSize }}
            aria-label="清除選取"
          >
            <span
              className={cn('absolute rounded-sm pointer-events-none bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active transition-colors', size === 'lg' && 'rounded-md')}
              style={{ width: iconSize + 2, height: iconSize + 2, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              aria-hidden
            />
            <X size={iconSize} className="relative" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>清除選取</TooltipContent>
      </Tooltip>
    ) : null

    const chevronEl = <ChevronDown size={iconSize} className="shrink-0 text-fg-muted cursor-pointer relative z-10" onClick={openSelect} aria-hidden />

    const label = options?.find(o => o.value === value)?.label ?? value

    // edit: tag 模式 — Tag + 隱藏 select overlay
    if (!isTextDisplay) {
      return (
        <div
          className={cn(
            fieldWrapperStyles({ mode: 'edit', size }),
            tagPadding[size],
            'relative',
            error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'],
            className,
          )}
          style={{ gap: 4 }}
          data-field-mode="edit"
          data-error={error ? '' : undefined}
        >
          {value ? (
            <Tag size={size} className="shrink-0 relative z-10 pointer-events-none">{label}</Tag>
          ) : (
            <span className="text-fg-muted">{placeholder ?? '選擇...'}</span>
          )}
          {selectEl}
          <span className="flex-1" />
          {clearEl}
          {chevronEl}
        </div>
      )
    }

    // edit: text 模式 — 原生 select 顯示文字
    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: 'edit', size }),
          error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'],
          className,
        )}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
      >
        {StartIcon && <StartIcon size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />}
        {selectEl}
        {clearEl}
        {chevronEl}
      </div>
    )
  }
)
SelectField.displayName = 'SelectField'

export { SelectField, SelectFieldDisplay }
