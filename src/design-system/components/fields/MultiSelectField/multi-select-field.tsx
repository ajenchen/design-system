import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
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
  wrap = false,
  maxVisible,
}: {
  value?: string[] | null
  options?: SelectOption[]
  badgeSize?: 'sm' | 'md' | 'lg'
  /** 是否允許換行（autoRowHeight 場景） */
  wrap?: boolean
  /** 固定行高時最多顯示幾個 badge，超出顯示 +N（不設則全部顯示，由容器截斷） */
  maxVisible?: number
}) {
  if (!value || value.length === 0) {
    return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  }

  const labels = value.map(v => options?.find(o => o.value === v)?.label ?? v)
  const visibleCount = maxVisible != null && maxVisible < labels.length ? maxVisible : labels.length
  const overflow = labels.length - visibleCount

  const hiddenLabels = labels.slice(visibleCount)

  return (
    <div className={cn('flex gap-1 min-w-0', wrap ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}>
      {labels.slice(0, visibleCount).map((label, i) => (
        <Badge key={value[i]} size={badgeSize} className="min-w-12">{label}</Badge>
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Badge size={badgeSize} className="shrink-0 cursor-default">
                + {overflow} …
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-wrap gap-1">
              {hiddenLabels.map((label, i) => (
                <span key={i}>{label}{i < hiddenLabels.length - 1 ? ',' : ''}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
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
  /** 允許 badges 換行（field 高度隨內容長） */
  wrap?: boolean
  /** 單行模式下最多顯示幾個 badge，超出顯示 +N */
  maxVisible?: number
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
  wrap = false,
  maxVisible,
}: MultiSelectFieldProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'

  const handleRemove = (removeValue: string) => {
    onChange?.(value.filter(v => v !== removeValue))
  }

  const handleAdd = (addValue: string) => {
    if (!value.includes(addValue)) {
      onChange?.([...value, addValue])
    }
  }

  // readonly / disabled
  if (!isEditable) {
    const hasTags = value.length > 0
    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, size }),
          hasTags && tagPadding[size],
          wrap && 'flex-wrap h-auto py-1',
          'gap-1',
          className,
        )}
        data-field-mode={resolvedMode}
      >
        {hasTags ? (
          <span className={cn(resolvedMode === 'disabled' && 'opacity-disabled', wrap ? 'contents' : 'min-w-0 overflow-hidden inline-flex gap-1 items-center')}>
            <MultiSelectFieldDisplay value={value} options={options} badgeSize={size} wrap={wrap} maxVisible={maxVisible} />
          </span>
        ) : (
          <span className={cn('text-fg-muted', resolvedMode === 'disabled' && 'opacity-disabled')}>{EMPTY_DISPLAY}</span>
        )}
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
        wrap ? 'flex-wrap h-auto py-1' : '',
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
            size={size}
            suffix={
              <button
                type="button"
                onClick={() => handleRemove(v)}
                className="group/action relative grid place-content-center text-fg-muted hover:text-foreground active:text-foreground transition-colors"
                style={{ width: 16, height: 16 }}
                aria-label={`移除 ${label}`}
              >
                <span
                  className="absolute rounded-sm pointer-events-none bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active transition-colors"
                  style={{
                    width: 18,
                    height: 18,
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                  aria-hidden
                />
                <X size={16} className="relative" aria-hidden />
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

MultiSelectField.displayName = 'MultiSelectField'

export { MultiSelectField, MultiSelectFieldDisplay }
