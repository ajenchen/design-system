import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import { useFieldContext } from '@/design-system/components/Field/field-context'

/**
 * Textarea — 多行文字輸入
 *
 * ── 定位 ────────────────────────────────────────────────────────────────
 * 多行版本的 Input，edit / readonly / disabled 三態與 Input 邏輯一致。
 * 不同於 Input：
 *   - 沒有固定 field-height（高度由 rows 或 min-h 決定）
 *   - 沒有 startIcon / endAction（textarea 慣例不放 icon）
 *   - readonly 呈現保留邊框與 padding，只改底色，讓多行文字有合理閱讀區
 *
 * ── Padding 規則 ───────────────────────────────────────────────────────
 * 多行內容必須有上下內距才能閱讀舒適。不沿用 Input 的 items-center，
 * 改用 py-2（8px）固定上下內距 + px-3 左右內距（與 Input 一致）。
 *
 * ── Size ────────────────────────────────────────────────────────────────
 * sm / md → text-body（14px）
 * lg      → text-body-lg（16px）
 *
 * ── rows / min-h ───────────────────────────────────────────────────────
 * 預設 rows={3}。消費者可透過 rows prop 調整，或透過 min-h-* className 覆寫。
 */

const textareaVariants = cva(
  [
    'w-full rounded-md',
    'text-foreground font-normal',
    'outline-none resize-y',
    'placeholder:text-fg-muted',
    // K10 fix(2026-05-04):disabled 時 placeholder + text 切 fg-disabled(parallel 到 bareInputStyles)
    //   Textarea 自身 `<textarea disabled>` 帶 disabled HTML attribute,用 `disabled:` variant 直接命中
    'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled',
    'px-3 py-2',
    'transition-colors duration-150',
  ],
  {
    variants: {
      mode: {
        edit: [
          'bg-surface border border-border',
          'hover:border-border-hover',
          'focus-visible:border-primary focus-visible:hover:border-primary',
        ],
        // 純展示:無 input chrome,無 affordance(對齊 fieldWrapperStyles display mode)
        display: 'bg-transparent border border-transparent',
        readonly: 'bg-disabled border border-transparent',
        disabled: 'bg-disabled border border-transparent cursor-not-allowed text-fg-disabled',
      },
      size: {
        sm: 'text-body',
        md: 'text-body',
        lg: 'text-body-lg',
      },
    },
    defaultVariants: {
      mode: 'edit',
      size: 'md',
    },
  }
)

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    Omit<VariantProps<typeof textareaVariants>, 'mode'> {
  /** Field display mode */
  mode?: FieldMode
  /** Error 狀態（正交於 mode）。border-error + aria-invalid。 */
  error?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      mode: modeProp = 'edit',
      error: errorProp = false,
      size: sizeProp,
      className,
      disabled,
      readOnly,
      rows = 3,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    // Field context 整合：disabled / mode / invalid / size / id 都能從 context 繼承
    const fieldCtx = useFieldContext()
    const mode = (fieldCtx?.mode ?? modeProp) as FieldMode
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const size = sizeProp ?? fieldCtx?.size ?? 'md'
    const effectiveDisabled = disabled ?? (fieldCtx?.disabled || mode === 'disabled')
    const effectiveReadOnly = readOnly || mode === 'readonly'
    const resolvedMode: FieldMode = effectiveDisabled
      ? 'disabled'
      : effectiveReadOnly
        ? 'readonly'
        : mode
    const isEditable = resolvedMode === 'edit'
    const inputId = idProp ?? fieldCtx?.id
    const ariaDescribedBy = ariaDescribedByProp ?? fieldCtx?.descriptionId
    const ariaErrorMessage = ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)

    return (
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        disabled={effectiveDisabled}
        readOnly={effectiveReadOnly}
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedBy}
        aria-errormessage={ariaErrorMessage}
        data-field-mode={resolvedMode}
        data-error={isEditable && error ? '' : undefined}
        className={cn(
          textareaVariants({ mode: resolvedMode, size }),
          isEditable && error && [
            'border-error hover:border-error-hover',
            'focus-visible:border-error focus-visible:hover:border-error',
          ],
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const textareaMeta = {
  component: 'Textarea',
  family: 4,
  variants: {

  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 40, iconSize: 20, typography: 'body' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: [],
  },
  defaultSize: 'md',
} as const

export { Textarea, textareaVariants }
