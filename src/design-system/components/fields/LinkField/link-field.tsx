import * as React from 'react'
import { Pencil } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

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

export interface LinkFieldDisplayProps {
  value?: string | null
  label?: string
}

function LinkFieldDisplay({ value, label }: LinkFieldDisplayProps) {
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
LinkFieldDisplay.displayName = 'LinkFieldDisplay'

// ── Component ───────────────────────────────────────────────────────────────

export interface LinkFieldProps
  extends Omit<VariantProps<typeof fieldWrapperStyles>, 'mode'> {
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

const LinkField = React.forwardRef<HTMLInputElement, LinkFieldProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size,
      value,
      onChange,
      placeholder = 'https://',
      className,
      disabled,
      label,
    },
    ref
  ) => {
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const actionHoverSize = iconSize + 2

    const [editing, setEditing] = React.useState(false)
    const [localValue, setLocalValue] = React.useState(value ?? '')
    const [localError, setLocalError] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

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

    // readonly / disabled — 直接用 Display
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span className={cn('flex-1 min-w-0', resolvedMode === 'disabled' && 'text-fg-disabled opacity-disabled')}>
            <LinkFieldDisplay value={value} label={label} />
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
            <LinkFieldDisplay value={value} label={label} />
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleEdit}
                className="group/action relative grid place-content-center shrink-0 cursor-pointer text-fg-muted hover:text-foreground active:text-foreground transition-colors"
                style={{ width: iconSize, height: iconSize }}
                aria-label="編輯連結"
              >
                <span
                  className={cn(
                    'absolute rounded-sm pointer-events-none',
                    'bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active',
                    'transition-colors',
                    size === 'lg' && 'rounded-md',
                  )}
                  style={{ width: actionHoverSize, height: actionHoverSize, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  aria-hidden
                />
                <Pencil size={iconSize} className="relative" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>編輯連結</TooltipContent>
          </Tooltip>
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
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-invalid={error || undefined}
          className={bareInputStyles}
        />
      </div>
    )
  }
)
LinkField.displayName = 'LinkField'

export { LinkField, LinkFieldDisplay }
