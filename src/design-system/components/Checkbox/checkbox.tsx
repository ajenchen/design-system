// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useFieldContext } from "@/design-system/components/Field/field-context"
import { SelectionItem } from "@/design-system/components/SelectionControl/selection-item"
import { CheckboxGroupContext } from "./checkbox-group"

// ── Variants ────────────────────────────────────────────────────────────────
// 三種尺寸（sm/md=16px, lg=20px），對齊 icon 系統與 SelectionItem。

const checkboxVariants = cva(
  [
    'grid place-content-center shrink-0 rounded-md',
    'border border-border bg-surface',
    'transition-colors duration-150',
    'hover:border-border-hover',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'data-[state=checked]:bg-primary data-[state=checked]:text-on-emphasis data-[state=checked]:border-primary',
    'data-[state=checked]:hover:bg-primary-hover data-[state=checked]:hover:border-primary-hover',
    'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-on-emphasis data-[state=indeterminate]:border-primary',
    'data-[state=indeterminate]:hover:bg-primary-hover data-[state=indeterminate]:hover:border-primary-hover',
    'disabled:cursor-not-allowed disabled:bg-disabled disabled:border-transparent disabled:hover:border-transparent',
    'disabled:data-[state=checked]:bg-disabled disabled:data-[state=checked]:text-fg-disabled disabled:data-[state=checked]:border-transparent',
    'disabled:data-[state=indeterminate]:bg-disabled disabled:data-[state=indeterminate]:text-fg-disabled disabled:data-[state=indeterminate]:border-transparent',
    // readOnly：鎖定互動但維持 checked/unchecked 視覺
    'data-[readonly=true]:pointer-events-none data-[readonly=true]:cursor-default',
    'data-[readonly=true]:hover:border-border',
  ],
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-4 w-4',
        lg: 'h-5 w-5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

// ── Check Icon Size ─────────────────────────────────────────────────────────
const checkIconSize: Record<string, number> = { sm: 12, md: 12, lg: 16 }

// ── Check Icon Stroke Weight ────────────────────────────────────────────────
// 16px 以下 icon 視覺不夠顯眼 → 用較粗 stroke 補償。Lucide 預設 strokeWidth=2 在
// 12px 下 render 約 1px 線寬,視覺偏細;加粗到 3.5(render ≈ 1.75px)才有足夠視覺權重。
// 16px 用 2.5(render ≈ 1.67px)讓 checked 態的 check icon 夠顯眼。
//
// 為什麼不是 3 / 2:本 session 實測 3 / 2 在 storybook 上兩個 size 的 render 線寬差僅
// 0.17px(1.5 vs 1.33),使用者肉眼看不出差異(image #64 回報)。改為 3.5 / 2.5:
//   - md 12px × 3.5 → 1.75px 線寬
//   - lg 16px × 2.5 → 1.67px 線寬
// 兩者仍接近但 md 的線寬 **絕對值** 跟 16px 預設(1.33)有更明顯差異,視覺上「小 check 更粗」。
//
// 世界級對照:iOS HIG / Material 3 / Polaris 的 checkmark 在 <16px 下皆加粗 compensate。
// 為什麼不用 Lucide absoluteStrokeWidth:那保持「絕對 px 粗細」,我們反而要「小尺寸比例更粗」。
//
// Check 與 Minus(indeterminate)共用此規則;Switch 的 SPECS.checkStroke 採同樣值。
const checkStrokeWidth: Record<string, number> = { sm: 3.5, md: 3.5, lg: 2.5 }

// ── Types ───────────────────────────────────────────────────────────────────

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  /**
   * Inline label。提供時 Checkbox 自動透過 SelectionItem 包裝，
   * 套用 text-body / text-foreground / disabled 色 的 codified 樣式。
   * 在 <Field> context 內時此 prop 會被忽略（由 FieldLabel 接管）。
   */
  label?: React.ReactNode
  /**
   * Inline description（secondary 文字）。須與 label 搭配使用。
   * 套用 text-body / text-fg-secondary 樣式。
   * 在 <Field> context 內時此 prop 會被忽略（由 FieldDescription 接管）。
   */
  description?: React.ReactNode
  /**
   * readonly 模式：鎖定互動但維持 checked/unchecked 視覺正確。
   * 與 disabled 的差異：readonly 不降色（可讀），disabled 降色（弱化）。
   * 用於表單 readonly 呈現、DataTable cell 非編輯態。
   */
  readOnly?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(
  (
    {
      className,
      size,
      label,
      description,
      readOnly = false,
      disabled,
      id: idProp,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const iconPx = checkIconSize[sizeKey]
    const iconStrokeWidth = checkStrokeWidth[sizeKey]

    // Field context:Checkbox 單獨塞進 Field(binary toggle)時,忽略自己的 label 讓 FieldLabel 接管
    //
    // **例外**:Checkbox 是 CheckboxGroup 的 child 時(multi-select 情境),**每個 checkbox
    // 的 label 是它自己的選項名**,FieldLabel 只是群組名稱 — 此時 label **必須保留**,
    // 不能被 Field context 吞掉。AR50 的根因就是這個 branch 之前誤把 group 內的 checkbox
    // label 全清空,導致 sheet 內 3 個 checkbox 沒 label。
    const fieldCtx = useFieldContext()
    const checkboxGroupCtx = React.useContext(CheckboxGroupContext)
    const insideField = fieldCtx?.hasFieldWrapper === true
    const insideGroup = checkboxGroupCtx?.inGroup === true
    const shouldSuppressLabel = insideField && !insideGroup
    const effectiveLabel = shouldSuppressLabel ? undefined : label
    const effectiveDescription = shouldSuppressLabel ? undefined : description

    // Id 連結
    //
    // ── 2026-04-21 bug fix ──
    // 原本:`idProp ?? fieldCtx?.id ?? generatedId`。
    // 在 Field 內 fieldCtx.id 存在,CheckboxGroup 所有 children 共用同一個 id →
    // 每個 checkbox 的 `<label htmlFor={sameId}>` 全指向第一個 checkbox →
    // **點任何 label 都只開關第一個 checkbox(real bug)**。
    //
    // 修法:group 內的 checkbox 強制用 generatedId(唯一),不沿用 Field id;
    //      solo in Field(binary toggle)才沿用 fieldCtx.id 讓 FieldLabel htmlFor 生效。
    const generatedId = React.useId()
    const inputId = idProp ?? (insideGroup ? generatedId : (fieldCtx?.id ?? generatedId))

    const rootEl = (
      <CheckboxPrimitive.Root
        id={inputId}
        ref={ref}
        disabled={disabled}
        aria-readonly={readOnly || undefined}
        data-readonly={readOnly || undefined}
        tabIndex={readOnly ? -1 : undefined}
        aria-describedby={fieldCtx?.descriptionId}
        className={cn(checkboxVariants({ size }), className)}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
          {props.checked === 'indeterminate'
            ? <Minus style={{ width: iconPx, height: iconPx }} strokeWidth={iconStrokeWidth} />
            : <Check style={{ width: iconPx, height: iconPx }} strokeWidth={iconStrokeWidth} />
          }
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    )

    // 無 label → 只渲染 checkbox 本體
    if (effectiveLabel == null) return rootEl

    // 有 label → 透過 SelectionItem 包裝（control 在左、label+description 在右）
    return (
      <SelectionItem
        control={rootEl}
        label={effectiveLabel}
        description={effectiveDescription}
        htmlFor={inputId}
        disabled={disabled}
        size={sizeKey}
      />
    )
  }
)
Checkbox.displayName = CheckboxPrimitive.Root.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const checkboxMeta = {
  component: 'Checkbox',
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
    bg: ['bg-disabled', 'bg-primary', 'bg-primary-hover', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { Checkbox, checkboxVariants }
