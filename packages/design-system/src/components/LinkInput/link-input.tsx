import * as React from 'react'
import { Pencil } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
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

// ── Display rendering(inline,2026-05-05 Phase B3 retire LinkInputDisplay)──
// 取代 LinkInputDisplay sub-component:純展示 a tag,無 input chrome、無 hover affordance。
// edit mode 內 link state(showLink branch)也共用此 helper,確保「編輯態的 link 顯示」與
// display mode 的視覺完全一致(SSOT)。
function renderLinkAnchor(value: string, label?: string) {
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

// ── Component ───────────────────────────────────────────────────────────────

export interface LinkInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant'> {
  mode?: FieldMode
  /**
   * Visual chrome(2026-05-05 Phase B3)。對齊 FieldContext.variant 透傳。
   * - `'default'`(預設)— Field wrapper 完整 chrome(form / Field 內嵌)。
   * - `'bare'` — 透明 variant,hover/focus 才現 border(Toolbar inline edit / DataTable cell-as-input)。
   *
   * mode='display' 時 chrome 無視覺意義(display 完全無 wrapper);chrome 僅作用於 edit / readonly / disabled。
   */
  variant?: FieldVariant
  error?: boolean
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 自訂顯示文字（非編輯時） */
  label?: string
  /**
   * Display 是否包 Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell display↔edit 像素級對齊用。預設 false(裸 anchor,backward compat)。
   * 設 true 時 display 走 fieldWrapperStyles(naked variant)包覆 anchor,
   * 與 cell edit (`<Input naked>`) 同 DOM 結構,消除 Layer-B padding mismatch。
   * **本元件 edit 無 endIcon(UrlCell 用 plain Input edit)→ display 也無 ItemSuffix**(僅 wrapper)。
   */
  showDisplayEndIcon?: boolean
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const LinkInput = React.forwardRef<HTMLInputElement, LinkInputProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      placeholder = 'https://',
      className,
      disabled: disabledProp,
      label,
      showDisplayEndIcon = false,
      readOnly,
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
    // mode resolution(對齊 input.tsx L107-112 / textarea.tsx L202 canonical):
    //   prop > fieldCtx.mode > (readOnly → 'readonly') > (disabled → 'disabled') > 'edit'
    // spec field-controls.spec.md L125「readOnly 原生屬性自動覆蓋 mode」契約落地。
    const resolvedMode: FieldMode =
      modeProp ?? fieldCtx?.mode ?? (readOnly ? 'readonly' : disabled ? 'disabled' : 'edit')
    const isEditable = resolvedMode === 'edit'
    // chrome resolution:per-prop > context > 'default'
    const resolvedVariant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'

    // ── mode='display' ─────────────────────────────────────────────────────
    // 純展示:無 input chrome / 無 hover affordance / 無 Pencil edit 入口。
    // 取代既有 LinkInputDisplay sub-component(2026-05-05 Phase B3 retire)。
    // Default(showDisplayEndIcon=false):無 wrapper 裸 anchor — backward compat。
    // Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper 包覆 anchor,
    // 與 cell edit (`<Input naked>`) 同 DOM 結構消除像素偏移(無 ItemSuffix,因 edit 也無 endIcon)。
    if (resolvedMode === 'display') {
      if (!showDisplayEndIcon) {
        // 2026-05-14 I2 fix(spec contract (e) display typography canonical):非 D-path bare
        // anchor / span 必套 `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)
        // — 對齊跨 Field family display 視覺尺寸統一。原無 font-size class → 用 browser default
        // 字體 → 跟其他 Field display 不一致(user 抓 I2)。truncate 同需,長 URL ellipsis(I1)。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), 'text-fg-muted block truncate')}>{EMPTY_DISPLAY}</span>
        return <span className={cn(fieldDisplayTextClass(size), 'block truncate')}>{renderLinkAnchor(value, label)}</span>
      }
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'display', variant: resolvedVariant, size }), className)}
          data-field-mode="display"
        >
          <span className="flex-1 min-w-0 truncate">
            {value
              ? renderLinkAnchor(value, label)
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
        </div>
      )
    }

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

    // 2026-05-16 audit codex Round 6:capture rAF + cancel on unmount(defensive hygiene)
    const focusRafIdRef = React.useRef<number>(0)
    React.useEffect(() => () => { if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current) }, [])

    const handleEdit = () => {
      setEditing(true)
      if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current)
      focusRafIdRef.current = requestAnimationFrame(() => {
        focusRafIdRef.current = 0
        inputRef.current?.focus()
      })
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
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span className="flex-1 min-w-0 truncate">
            {resolvedMode === 'disabled'
              ? (displayText
                  ? <span className="text-fg-disabled">{displayText}</span>
                  : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>)
              : (value
                  ? renderLinkAnchor(value, label)
                  : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>)
            }
          </span>
        </div>
      )
    }

    // edit — link display mode（有合法 URL 且未在編輯中）
    if (showLink) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size }), className)}
          data-field-mode="edit"
        >
          <span className="flex-1 min-w-0">
            {value && renderLinkAnchor(value, label)}
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
          fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size }),
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
          readOnly={resolvedMode === 'readonly'}
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

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const linkInputMeta = {
  component: 'LinkInput',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-primary'],
    ring: [],
  },
} as const

export { LinkInput }
