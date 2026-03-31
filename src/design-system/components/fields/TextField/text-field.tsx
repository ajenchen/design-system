import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'

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
  /** 右側可互動元素 — Button xs iconOnly。條件渲染即可，不佔位。 */
  endAction?: React.ReactNode
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
            className={cn('shrink-0', iconColor)}
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
        {endAction}
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
