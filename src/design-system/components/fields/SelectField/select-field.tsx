import * as React from 'react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Badge } from '@/design-system/components/Badge/badge'

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

function SelectFieldDisplay({ value, options }: { value?: string | null; options?: SelectOption[] }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const label = options?.find(o => o.value === value)?.label ?? value
  return <Badge>{label}</Badge>
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
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : mode

    // readonly / disabled：固定高度 + tag padding
    if (resolvedMode !== 'edit') {
      return (
        <div
          className={cn(
            fieldWrapperStyles({ mode: resolvedMode, size }),
            tagPadding[size],
            className,
          )}
          data-field-mode={resolvedMode}
        >
          <span className={cn(resolvedMode === 'disabled' && 'opacity-disabled')}>
            {value
              ? <Badge size={size}>{options?.find(o => o.value === value)?.label ?? value}</Badge>
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
        </div>
      )
    }

    // edit：原生 select
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
      </div>
    )
  }
)
SelectField.displayName = 'SelectField'

export { SelectField, SelectFieldDisplay }
