import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import type { InlineActionConfig } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'

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

// Phase B1(2026-05-05):NumberInputDisplay 退場。
// 改用 `<NumberInput mode="display" value={...} prefix={...} ... />`,format 邏輯在 mode='display' 分支重用。

// ── Types ───────────────────────────────────────────────────────────────────

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange' | 'type'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant'>,
    NumberFormatOptions {
  /** Field display mode */
  mode?: FieldMode
  /**
   * Visual chrome(正交於 mode);Phase B1(2026-05-05)新增。
   * - `'default'`(預設)— 完整 Field wrapper chrome。
   * - `'bare'` — 透明 variant,hover/focus 才 reveal(Toolbar inline / DataTable cell)。
   *
   * 透傳:在 `<Field variant="bare">` 內自動繼承 context.variant;per-prop override context。
   */
  variant?: FieldVariant
  /** Error 狀態（正交於 mode）。 */
  error?: boolean
  /** 數值 */
  value?: number | null
  /** 數值變更 */
  onChange?: (value: number | null) => void
  /** 右側 inline action — 宣告式 API，Field 根據 size 自動渲染。 */
  endAction?: InlineActionConfig
  /**
   * 右側 slot(ReactNode)— escape hatch 供 consumer 放自訂元素(如 stepper button group / 自訂 popover trigger)。
   * 跟 `endAction` 互斥(同時傳 endSlot 會優先,endAction 被忽略)。
   * 規則對齊 Input.endSlot:90% case 用 endAction 宣告式 API,10% config 表達不出時走 endSlot。
   */
  endSlot?: React.ReactNode
}

// ── Component ───────────────────────────────────────────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      precision,
      prefix,
      suffix,
      locale,
      endAction,
      endSlot,
      className,
      disabled: disabledProp,
      readOnly,
      id: idProp,
      onBlur: onBlurProp,
      onKeyDown: onKeyDownProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const error = useResolvedFieldInvalid(errorProp)
    const size = useResolvedFieldSize(sizeProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // chrome 透傳:per-prop override context;context 沒值則 'default'
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })

    // 2026-07-05 D4 draft state:controlled value 回寫會吃掉輸入中間態('-'、'1.'、'0.0' 等
    // parse 後 lossy 的 raw 字串)— 例:已有值 5 全選打「-」→ onChange(null) 回寫把 DOM 重設
    // 為空,負號被吃、無法打出 -5。修法對齊 Ant InputNumber / Adobe Spectrum NumberField 的
    // internal draft string canonical:輸入期間 DOM 顯示以 local draft 優先,parse 成功即時同步
    // onChange(parsed);blur / Enter commit 清 draft 回 value 顯示;Escape 一併棄 draft(對齊
    // form-validation 規則 4 回復原值)。宣告於 non-edit early return 之前(Rules-of-Hooks,
    // 同 LinkInput 2026-07-04 修法)。
    const [draft, setDraft] = React.useState<string | null>(null)

    // display / readonly / disabled 都顯示格式化值(span 取代 input)
    if (resolvedMode !== 'edit') {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: variant, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span
            className={cn(
              'flex-1 min-w-0',
              resolvedMode === 'disabled' && 'text-fg-disabled cursor-not-allowed',
              // 2026-05-31 M24:disabled > muted。disabled 時不可再套 muted(否則 neutral-7 蓋過 disabled neutral-6)
              value == null && resolvedMode !== 'disabled' && 'text-fg-muted',
            )}
          >
            {value == null ? EMPTY_DISPLAY : formatNumber(value, { precision, prefix, suffix, locale })}
          </span>
        </div>
      )
    }

    // edit 模式:raw 數值輸入(draft 承載中間態;value 面語意不變 — ''/'-' 視為空、NaN 忽略)
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setDraft(raw)
      if (!onChange) return
      if (raw === '' || raw === '-') {
        onChange(null)
        return
      }
      const parsed = Number(raw)
      if (!Number.isNaN(parsed)) {
        onChange(parsed)
      }
    }

    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: 'edit', variant: variant, size, error }),
          className,
        )}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
      >
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          id={idProp ?? fieldCtx?.id}
          // 輸入期間 draft(raw 字串)優先;非輸入期間才從 value prop 同步顯示(2026-07-05 D4)
          value={draft ?? (value != null ? String(value) : '')}
          onChange={handleChange}
          // blur / Enter = commit(清 draft,顯示回 committed value);Escape 棄 draft
          onBlur={(e) => { setDraft(null); onBlurProp?.(e) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setDraft(null)
            onKeyDownProp?.(e)
          }}
          aria-invalid={error || undefined}
          aria-required={fieldCtx?.required || undefined}
          aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
          aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
          className={bareInputStyles}
          {...props}
        />
        {endSlot ? (
          // endSlot escape hatch:consumer 自控右側 slot(對齊 Input.endSlot canonical)
          endSlot
        ) : endAction ? (
          <ItemInlineAction action={endAction} size={size ?? 'md'} />
        ) : null}
      </div>
    )
  }
)
NumberInput.displayName = 'NumberInput'

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const numberInputMeta = {
  component: 'NumberInput',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export { NumberInput, formatNumber }
