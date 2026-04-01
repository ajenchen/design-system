import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, InlineActionConfig } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Format ──────────────────────────────────────────────────────────────────

export interface NumberFormatOptions {
  /** 小數位數 */
  precision?: number
  /** 前綴（如 '$'、'NT$'） */
  prefix?: string
  /** 後綴（如 '%'、'元'） */
  suffix?: string
  /** locale（預設 'en-US'） */
  locale?: string
}

function formatNumber(
  value: number | null | undefined,
  options: NumberFormatOptions = {},
): string {
  if (value == null) return ''
  const { precision, prefix = '', suffix = '', locale = 'en-US' } = options
  const formatted = precision != null
    ? value.toLocaleString(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision })
    : value.toLocaleString(locale)
  return `${prefix}${formatted}${suffix}`
}

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用。DataTable 透過 column type 查到這個元件。

export interface NumberFieldDisplayProps extends NumberFormatOptions {
  value?: number | null
}

function NumberFieldDisplay({ value, ...formatOptions }: NumberFieldDisplayProps) {
  if (value == null) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{formatNumber(value, formatOptions)}</>
}
NumberFieldDisplay.displayName = 'NumberFieldDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange' | 'type'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode'>,
    NumberFormatOptions {
  /** Field display mode */
  mode?: FieldMode
  /** Error 狀態（正交於 mode）。 */
  error?: boolean
  /** 數值 */
  value?: number | null
  /** 數值變更 */
  onChange?: (value: number | null) => void
  /** 右側 inline action — 宣告式 API，Field 根據 size 自動渲染。 */
  endAction?: InlineActionConfig
}

// ── Component ───────────────────────────────────────────────────────────────

const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      mode = 'edit',
      error = false,
      size,
      value,
      onChange,
      precision,
      prefix,
      suffix,
      locale,
      endAction,
      className,
      disabled,
      readOnly,
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : readOnly ? 'readonly' : mode

    // readonly / disabled 顯示格式化值
    if (resolvedMode !== 'edit') {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span
            className={cn(
              'flex-1 min-w-0',
              resolvedMode === 'disabled' && 'text-fg-disabled cursor-not-allowed',
              value == null && 'text-fg-muted',
            )}
          >
            {value == null ? EMPTY_DISPLAY : formatNumber(value, { precision, prefix, suffix, locale })}
          </span>
        </div>
      )
    }

    // edit 模式：raw 數值輸入
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!onChange) return
      const raw = e.target.value
      if (raw === '' || raw === '-') {
        onChange(null)
        return
      }
      const parsed = Number(raw)
      if (!Number.isNaN(parsed)) {
        onChange(parsed)
      }
    }

    const iconSize = size === 'lg' ? 20 : 16
    const actionHoverSize = iconSize + 2

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
          ref={ref}
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          onChange={handleChange}
          aria-invalid={error || undefined}
          className={bareInputStyles}
          {...props}
        />
        {endAction && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={endAction.onClick}
                className={cn(
                  'group/action relative grid place-content-center shrink-0',
                  'text-fg-muted hover:text-foreground active:text-foreground transition-colors',
                )}
                style={{ width: iconSize, height: iconSize }}
                aria-label={endAction.label}
              >
                <span
                  className={cn(
                    'absolute rounded-sm pointer-events-none',
                    'bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active',
                    'transition-colors',
                    size === 'lg' && 'rounded-md',
                  )}
                  style={{
                    width: actionHoverSize,
                    height: actionHoverSize,
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                  aria-hidden
                />
                <endAction.icon size={iconSize} className="relative" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{endAction.label}</TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }
)
NumberField.displayName = 'NumberField'

export { NumberField, NumberFieldDisplay, formatNumber }
