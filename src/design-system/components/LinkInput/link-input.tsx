import * as React from 'react'
import { Pencil } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'

// ── URL Validation ──────────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ── Display ─────────────────────────────────────────────────────────────────

export interface LinkInputDisplayProps {
  value?: string | null
  label?: string
}

function LinkInputDisplay({ value, label }: LinkInputDisplayProps) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const displayText = label || formatHostname(value)
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate min-w-0 text-primary hover:text-primary-hover hover:underline transition-colors"
    >
      {displayText}
    </a>
  )
}
LinkInputDisplay.displayName = 'LinkInputDisplay'

// ── Component ───────────────────────────────────────────────────────────────

export interface LinkInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode'> {
  mode?: FieldMode
  error?: boolean
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 自訂顯示文字（非編輯時） */
  label?: string
}

const LinkInput = React.forwardRef<HTMLInputElement, LinkInputProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size: sizeProp = 'md',
      value,
      onChange,
      placeholder = 'https://',
      className,
      disabled: disabledProp,
      label,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const size = sizeProp ?? fieldCtx?.size ?? 'md'
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'

    const [editing, setEditing] = React.useState(false)
    const [localValue, setLocalValue] = React.useState(value ?? '')
    const [localError, setLocalError] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    // Sync external value → local
    React.useEffect(() => {
      if (!editing) setLocalValue(value ?? '')
    }, [value, editing])

    // Merge refs
    const setRef = React.useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }, [ref])

    const hasValidValue = !!value && isValidUrl(value)
    const showLink = isEditable && hasValidValue && !editing && !localError
    const error = errorProp || localError

    const handleEdit = () => {
      setEditing(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    }

    const handleBlur = () => {
      setEditing(false)
      const trimmed = localValue.trim()
      if (!trimmed) {
        // Empty is OK — clear value
        setLocalError(false)
        onChange?.('')
        return
      }
      if (isValidUrl(trimmed)) {
        setLocalError(false)
        onChange?.(trimmed)
      } else {
        setLocalError(true)
      }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)
      // Clear error on edit (blur validation)
      if (localError) setLocalError(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') inputRef.current?.blur()
      if (e.key === 'Escape') {
        setLocalValue(value ?? '')
        setLocalError(false)
        setEditing(false)
      }
    }

    // readonly — 顯示藍色連結（可點擊）
    // disabled — 顯示純文字 fg-disabled（不可點擊）
    if (!isEditable) {
      const displayText = value ? (label || formatHostname(value)) : null
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span className="flex-1 min-w-0 truncate">
            {resolvedMode === 'disabled'
              ? (displayText
                  ? <span className="text-fg-disabled">{displayText}</span>
                  : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>)
              : <LinkInputDisplay value={value} label={label} />
            }
          </span>
        </div>
      )
    }

    // edit — link display mode（有合法 URL 且未在編輯中）
    if (showLink) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'edit', size }), className)}
          data-field-mode="edit"
        >
          <span className="flex-1 min-w-0">
            <LinkInputDisplay value={value} label={label} />
          </span>
          <ItemInlineAction
            size={size ?? 'md'}
            action={{ icon: Pencil, label: '編輯連結', onClick: handleEdit }} // i18n-allow: DS default inline-action label
          />
        </div>
      )
    }

    // edit — text input mode（正在編輯、無值、或格式錯誤）
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
          type="url"
          id={idProp ?? fieldCtx?.id}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-invalid={(error || fieldCtx?.invalid) || undefined}
          aria-required={fieldCtx?.required || undefined}
          aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
          aria-errormessage={ariaErrorMessageProp ?? ((error || fieldCtx?.invalid) ? fieldCtx?.errorId : undefined)}
          className={bareInputStyles}
          {...props}
        />
      </div>
    )
  }
)
LinkInput.displayName = 'LinkInput'

export { LinkInput, LinkInputDisplay }
