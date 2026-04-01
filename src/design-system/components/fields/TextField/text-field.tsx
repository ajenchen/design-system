import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, InlineActionConfig } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Types ───────────────────────────────────────────────────────────────────

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode'> {
  /** Field display mode */
  mode?: FieldMode
  /** Error 狀態（正交於 mode）。border-error + aria-invalid。 */
  error?: boolean
  /** 左側靜態 icon — 輔助理解 input 用途（如 Search）。fg-muted。 */
  startIcon?: LucideIcon
  /** 右側 inline action — 宣告式 API，Field 根據 size 自動渲染。 */
  endAction?: InlineActionConfig
}

// ── Component ───────────────────────────────────────────────────────────────

const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      mode = 'edit',
      error = false,
      size,
      startIcon: StartIcon,
      endAction,
      className,
      disabled,
      readOnly,
      ...props
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : readOnly ? 'readonly' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'
    const actionHoverSize = iconSize + 2

    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, size }),
          isEditable && error && [
            'border-error hover:border-error-hover',
            'focus-within:border-error focus-within:hover:border-error',
          ],
          className,
        )}
        data-field-mode={resolvedMode}
        data-error={isEditable && error ? '' : undefined}
      >
        {StartIcon && (
          <StartIcon
            size={iconSize}
            className={cn('shrink-0 pointer-events-none', iconColor)}
            aria-hidden
          />
        )}
        <input
          ref={ref}
          type="text"
          readOnly={resolvedMode === 'readonly'}
          disabled={resolvedMode === 'disabled'}
          aria-invalid={error || undefined}
          className={cn(
            bareInputStyles,
            resolvedMode === 'disabled' && 'text-fg-disabled cursor-not-allowed',
          )}
          {...props}
        />
        {endAction && isEditable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={endAction.onClick}
                className={cn(
                  'group/action relative grid place-content-center shrink-0 cursor-pointer',
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
TextField.displayName = 'TextField'

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用的格式化顯示。

function TextFieldDisplay({ value }: { value?: string | null }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{value}</>
}
TextFieldDisplay.displayName = 'TextFieldDisplay'

export { TextField, TextFieldDisplay }
