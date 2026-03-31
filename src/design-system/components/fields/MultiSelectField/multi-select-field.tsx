import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Badge } from '@/design-system/components/Badge/badge'

// ── Tag padding per size ────────────────────────────────────────────────────
const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.25rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

// ── Option Type ─────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

// ── Display ─────────────────────────────────────────────────────────────────

function MultiSelectFieldDisplay({
  value,
  options,
  badgeSize = 'md',
}: {
  value?: string[] | null
  options?: SelectOption[]
  badgeSize?: 'md' | 'lg'
}) {
  if (!value || value.length === 0) {
    return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  }

  return (
    <div className="flex gap-1">
      {value.map(v => {
        const label = options?.find(o => o.value === v)?.label ?? v
        return <Badge key={v} size={badgeSize}>{label}</Badge>
      })}
    </div>
  )
}
MultiSelectFieldDisplay.displayName = 'MultiSelectFieldDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MultiSelectFieldProps {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

function MultiSelectField({
  mode = 'edit',
  error = false,
  size = 'md',
  options,
  value = [],
  onChange,
  placeholder,
  className,
  disabled,
}: MultiSelectFieldProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const badgeSize = size === 'lg' ? 'lg' : 'md'

  const handleRemove = (removeValue: string) => {
    onChange?.(value.filter(v => v !== removeValue))
  }

  const handleAdd = (addValue: string) => {
    if (!value.includes(addValue)) {
      onChange?.([...value, addValue])
    }
  }

  // readonly / disabled：固定高度 + tag padding + 一行
  if (!isEditable) {
    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, size }),
          tagPadding[size],
          'gap-1',
          className,
        )}
        data-field-mode={resolvedMode}
      >
        <span className={cn(resolvedMode === 'disabled' && 'opacity-disabled')}>
          <MultiSelectFieldDisplay value={value} options={options} badgeSize={badgeSize} />
        </span>
      </div>
    )
  }

  // edit：Tag list + select dropdown
  const unselected = options.filter(o => !value.includes(o.value))

  return (
    <div
      className={cn(
        fieldWrapperStyles({ mode: 'edit', size }),
        tagPadding[size],
        'gap-1',
        error && [
          'border-error hover:border-error-hover',
          'focus-within:border-error focus-within:hover:border-error',
        ],
        className,
      )}
      data-field-mode="edit"
      data-error={error ? '' : undefined}
    >
      {value.map(v => {
        const label = options.find(o => o.value === v)?.label ?? v
        return (
          <Badge
            key={v}
            size={badgeSize}
            suffix={
              <button
                type="button"
                onClick={() => handleRemove(v)}
                className="h-4 w-4 grid place-content-center rounded-sm hover:bg-neutral-active transition-colors"
                aria-label={`移除 ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            }
          >
            {label}
          </Badge>
        )
      })}
      {unselected.length > 0 && (
        <select
          value=""
          onChange={(e) => handleAdd(e.target.value)}
          className="flex-1 min-w-20 bg-transparent outline-none border-none p-0 text-[inherit] font-[inherit] leading-[inherit] text-fg-muted cursor-pointer appearance-none"
        >
          <option value="" disabled>{placeholder ?? '選擇...'}</option>
          {unselected.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export { MultiSelectField, MultiSelectFieldDisplay }
