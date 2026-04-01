import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Badge } from '@/design-system/components/Badge/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Tag padding per size ────────────────────────────────────────────────────
// tag 四邊等距：p = (field-height - badge-height) / 2
// sm 用 badge-sm (20px=1.25rem)，md/lg 用 badge-md/lg (24px=1.5rem)
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
  return <Badge size={size}>{label}</Badge>
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
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : mode
    const iconSize = size === 'lg' ? 20 : 16
    const showClear = clearable && value && resolvedMode === 'edit'

    // readonly / disabled
    if (resolvedMode !== 'edit') {
      return (
        <div
          className={cn(
            fieldWrapperStyles({ mode: resolvedMode, size }),
            value && tagPadding[size],
            className,
          )}
          data-field-mode={resolvedMode}
        >
          <span className={cn(resolvedMode === 'disabled' && 'bg-disabled text-fg-disabled')}>
            {value
              ? <Badge size={size}>{options?.find(o => o.value === value)?.label ?? value}</Badge>
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
        </div>
      )
    }

    // edit
    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: 'edit', size }),
          error && [
            'border-error hover:border-error-hover',
            'focus-within:border-error focus-within:hover:border-error',
          ],
          className,
        )}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
      >
        <select
          ref={ref}
          value={value ?? ''}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          disabled={disabled}
          aria-invalid={error || undefined}
          className={cn(
            bareInputStyles,
            'cursor-pointer appearance-none',
            !value && 'text-fg-muted',
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>{placeholder}</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {showClear && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange?.('')}
                className="group/action relative grid place-content-center shrink-0 cursor-pointer text-fg-muted hover:text-foreground active:text-foreground transition-colors"
                style={{ width: iconSize, height: iconSize }}
                aria-label="清除選取"
              >
                <span
                  className={cn(
                    'absolute rounded-sm pointer-events-none',
                    'bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active',
                    'transition-colors',
                    size === 'lg' && 'rounded-md',
                  )}
                  style={{ width: iconSize + 2, height: iconSize + 2, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  aria-hidden
                />
                <X size={iconSize} className="relative" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>清除選取</TooltipContent>
          </Tooltip>
        )}
        <ChevronDown size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
      </div>
    )
  }
)
SelectField.displayName = 'SelectField'

export { SelectField, SelectFieldDisplay }
