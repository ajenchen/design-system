import * as React from 'react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles } from '@/design-system/components/fields/field-wrapper'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 readonly 共用。純文字呈現，不暗示可編輯。
// null = false = unchecked，三者視覺一致。

function BooleanFieldDisplay({ value }: { value?: boolean | null }) {
  return value
    ? <span className="text-foreground">✓</span>
    : <span className="text-fg-muted">—</span>
}
BooleanFieldDisplay.displayName = 'BooleanFieldDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface BooleanFieldProps {
  /** Field display mode */
  mode?: FieldMode
  /** 布林值 */
  value?: boolean | null
  /** 值變更 */
  onChange?: (value: boolean) => void
  /** Size（readonly wrapper 高度） */
  size?: 'sm' | 'md' | 'lg'
  /** className */
  className?: string
  /** disabled（覆蓋 mode） */
  disabled?: boolean
  /** readOnly（覆蓋 mode） */
  readOnly?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

const BooleanField = React.forwardRef<HTMLButtonElement, BooleanFieldProps>(
  (
    {
      mode = 'edit',
      value,
      onChange,
      size,
      className,
      disabled,
      readOnly,
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : readOnly ? 'readonly' : mode

    // readonly：純文字 ✓/—，不暗示可編輯
    if (resolvedMode === 'readonly') {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'readonly', size }), className)}
          data-field-mode="readonly"
        >
          <BooleanFieldDisplay value={value} />
        </div>
      )
    }

    // edit / disabled：Checkbox 外觀
    return (
      <Checkbox
        ref={ref}
        checked={value ?? false}
        onCheckedChange={resolvedMode === 'edit' && onChange
          ? (checked) => onChange(checked === true)
          : undefined
        }
        disabled={resolvedMode === 'disabled'}
        className={className}
      />
    )
  }
)
BooleanField.displayName = 'BooleanField'

export { BooleanField, BooleanFieldDisplay }
