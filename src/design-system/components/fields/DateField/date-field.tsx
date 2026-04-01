import * as React from 'react'
import { X, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Format ──────────────────────────────────────────────────────────────────

export interface DateFormatOptions {
  /** Intl.DateTimeFormat options（預設 { year: 'numeric', month: '2-digit', day: '2-digit' }） */
  formatOptions?: Intl.DateTimeFormatOptions
  /** locale（預設 'en-US'） */
  locale?: string
}

function formatDate(
  value: string | number | Date,
  options: DateFormatOptions = {},
): string {
  const {
    formatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' },
    locale = 'en-US',
  } = options
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale, formatOptions).format(date)
}

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用。DataTable 透過 column type 查到這個元件。

export interface DateFieldDisplayProps extends DateFormatOptions {
  value?: string | number | Date | null
}

function DateFieldDisplay({ value, ...formatOptions }: DateFieldDisplayProps) {
  if (value == null) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{formatDate(value, formatOptions)}</>
}
DateFieldDisplay.displayName = 'DateFieldDisplay'

// ── Component ───────────────────────────────────────────────────────────────

export interface DateFieldProps extends DateFormatOptions {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** ISO date string（YYYY-MM-DD） */
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 允許清空已選值 */
  clearable?: boolean
}

const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    {
      mode = 'edit',
      error = false,
      size = 'md',
      value,
      onChange,
      placeholder,
      className,
      disabled,
      clearable = false,
      formatOptions,
      locale,
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const showClear = clearable && value && isEditable
    const inputRef = React.useRef<HTMLInputElement>(null)
    const setRef = React.useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }, [ref])
    const openPicker = () => { inputRef.current?.showPicker?.(); inputRef.current?.focus() }

    // readonly / disabled
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span className={cn('flex-1 min-w-0', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {value
              ? formatDate(value, { formatOptions, locale })
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
        <input
          ref={setRef}
          type="date"
          value={value ?? ''}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          disabled={disabled}
          aria-invalid={error || undefined}
          className={cn(
            bareInputStyles,
            'cursor-pointer appearance-none',
            // 隱藏瀏覽器原生日期 icon，用我們自己的 Calendar icon
            '[&::-webkit-calendar-picker-indicator]:hidden',
            !value && 'text-fg-muted',
          )}
          {...props}
        />
        {showClear && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange?.('')}
                className="group/action relative grid place-content-center shrink-0 cursor-pointer text-fg-muted hover:text-foreground active:text-foreground transition-colors"
                style={{ width: iconSize, height: iconSize }}
                aria-label="清除日期"
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
            <TooltipContent>清除日期</TooltipContent>
          </Tooltip>
        )}
        <Calendar size={iconSize} className="shrink-0 text-fg-muted cursor-pointer" onClick={openPicker} aria-hidden />
      </div>
    )
  }
)
DateField.displayName = 'DateField'

export { DateField, DateFieldDisplay, formatDate }
