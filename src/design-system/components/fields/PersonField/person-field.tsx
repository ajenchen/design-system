import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { PersonDisplay, MultiPersonDisplay, type PersonValue } from '@/design-system/components/DataTable/person-display'

// ── Component ───────────────────────────────────────────────────────────────
// 外觀同 SelectField，value 前面多 avatar。
// edit mode（下拉選人）暫未實作，目前只有 readonly / disabled。

export interface PersonFieldProps {
  mode?: FieldMode
  size?: 'sm' | 'md' | 'lg'
  value?: PersonValue | PersonValue[] | null
  className?: string
  disabled?: boolean
}

function PersonField({
  mode = 'edit',
  size = 'md',
  value,
  className,
  disabled,
}: PersonFieldProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const iconSize = size === 'lg' ? 20 : 16
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  return (
    <div
      className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
      data-field-mode={resolvedMode}
    >
      <span className={cn('flex-1 min-w-0 inline-flex items-center', resolvedMode === 'disabled' && 'text-fg-disabled')}>
        {isEmpty
          ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
          : isMulti
            ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
            : <PersonDisplay value={value as PersonValue} size={size} />
        }
      </span>
      {isEditable && (
        <ChevronDown size={iconSize} className="shrink-0 text-fg-muted cursor-pointer" aria-hidden />
      )}
    </div>
  )
}
PersonField.displayName = 'PersonField'

export { PersonField }
