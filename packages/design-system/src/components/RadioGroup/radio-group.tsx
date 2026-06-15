// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import type { FieldMode, FieldVariant } from "@/design-system/components/Field/field-types"
import { useFieldContext, useResolvedFieldMode, useResolvedFieldDisabled, useResolvedFieldSize } from "@/design-system/components/Field/field-context"
import { SelectionItem } from "@/design-system/components/SelectionControl/selection-item"
import type { LucideIcon } from "lucide-react"
import type { AvatarData } from "@/design-system/components/Avatar/avatar"
import { EMPTY_DISPLAY, fieldWrapperStyles } from "@/design-system/components/Field/field-wrapper"

// ── RadioGroup display mode ─────────────────────────────────────────────────
// RadioGroup mode='display' 時:Group 不渲染 Radix primitive(無 radio 視覺),
// 改由 RadioGroup 本體 walk props.children,找 control.value === selectedValue 的
// SelectionItem,把它的 label 渲染為單一純文字 span(其他選項不顯示)。
// 對齊 Carbon read-only single-select(只顯示 selected 內容)+ Airtable / Notion read-only。
// 實作在 RadioGroup forwardRef 內(見下方 mode === 'display' 分支)。

// ── RadioGroup ──────────────────────────────────────────────────────────────

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /**
   * Field mode(2026-05-05 Phase B3 align):
   *   edit     — 一般可互動 RadioGroup(預設)
   *   display  — **純展示**:不渲染 Radix Root / 任何 radio 視覺;RadioGroup 本體 walk
   *              children,僅 control.value === group.value 那筆把 label 渲染為純文字 span。
   *              對齊 Carbon read-only / DataTable single-select cell read mode。
   *   readonly — standalone:ReadonlyContext 傳 items 鎖互動保留視覺;Field 內:灰框 + 選中項 label(不渲染 radio 群組)
   *   disabled — 同 RadioGroupPrimitive.Root disabled 屬性
   */
  mode?: FieldMode
  /**
   * Visual chrome — RadioGroup 本體無 input wrapper variant,本 prop 對主體無視覺影響;
   * 為對齊 Field 4-mode + chrome 透傳契約而保留(M19 一致性)。
   */
  variant?: FieldVariant
}

// RadioGroup mode='readonly' → 透過 context 把 readOnly 傳給所有 child RadioGroupItem
// (item 已支援 readOnly prop + data-[readonly] 樣式;Radix Root 無 readOnly,故用 context)。
const RadioGroupReadonlyContext = React.createContext(false)

// walk children 找 control.value === selectedValue 的 SelectionItem label(display / readonly-in-Field 共用)
function findSelectedRadioLabel(children: React.ReactNode, selectedValue: string | undefined): React.ReactNode {
  let selectedLabel: React.ReactNode = null
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const cProps = child.props as { control?: unknown; label?: React.ReactNode; value?: unknown }
    // 形狀 1:<RadioGroupItem value label>(主用法)— value/label 直掛 props
    if (cProps.value === selectedValue && cProps.value !== undefined) {
      selectedLabel = cProps.label ?? selectedValue
      return
    }
    // 形狀 2:<SelectionItem control={<RadioGroupItem value/>} label>(組合用法)
    const control = cProps.control
    if (React.isValidElement(control)) {
      const controlValue = (control.props as { value?: unknown }).value
      if (controlValue === selectedValue) {
        selectedLabel = cProps.label ?? selectedValue
      }
    }
  })
  return selectedLabel
}

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ className, mode, variant: _chrome, value, defaultValue, ...props }, ref) => {
  // 2026-06-08 SSOT cascade:resolvedMode 經 resolver hook 讀 fieldCtx(原 root 完全不讀 → <Field disabled>/<Field mode> 失效)
  const resolvedMode = useResolvedFieldMode({ mode, disabled: (props as { disabled?: boolean }).disabled })
  const fieldCtx = useFieldContext()
  // readonly 灰框 size:走 SSOT resolver(RadioGroup 無 size prop → ctx > 'md')
  const resolvedBoxSize = useResolvedFieldSize(undefined, 'md') as 'sm' | 'md' | 'lg'
  // mode='display' — 純展示 selected option 的 label,不渲染任何 radio control 視覺。
  // 對齊 Carbon read-only single-select(只顯示 selected 內容)+ Airtable / Notion read-only。
  // 實作:walk children 找 control.value === selectedValue 的 SelectionItem,render label plain text。
  // (不用 context dispatch 給 RadioGroupItem — SelectionItem layout wrapper 仍會渲染所有 item label)
  if (resolvedMode === 'display') {
    const selectedValue = (value ?? defaultValue) as string | undefined
    if (!selectedValue) {
      return <div role="group" className={cn('grid', className)}><span className="text-fg-muted">{EMPTY_DISPLAY}</span></div>
    }
    const selectedLabel = findSelectedRadioLabel(props.children, selectedValue)
    return (
      <div role="group" className={cn('grid', className)}>
        <span className="text-foreground">{selectedLabel ?? selectedValue}</span>
      </div>
    )
  }

  // ── mode='readonly' in Field(2026-06-12 user 拍板,與 Checkbox/Switch 灰框模型一致)──
  // Field 內 readonly 單選 = fieldWrapperStyles readonly 灰框 + 選中項 label 文字
  // (= Select readonly 同款呈現:同為「單選資料」,鎖定時呈現一致)。
  // standalone readonly(無 Field)維持原樣鎖互動(ReadonlyContext 路徑)。
  if (resolvedMode === 'readonly' && fieldCtx?.hasFieldWrapper === true) {
    const selectedValue = (value ?? defaultValue) as string | undefined
    const selectedLabel = selectedValue ? findSelectedRadioLabel(props.children, selectedValue) : null
    const boxSize = resolvedBoxSize
    return (
      <div
        role="radiogroup"
        aria-readonly="true"
        aria-labelledby={fieldCtx?.labelId}
        aria-invalid={fieldCtx?.invalid || undefined}
        data-readonly="true"
        tabIndex={0}
        className={cn(
          fieldWrapperStyles({ size: boxSize, mode: 'readonly', variant: 'default' }),
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        {selectedValue
          ? <span className="text-foreground">{selectedLabel ?? selectedValue}</span>
          : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>}
      </div>
    )
  }

  // mode='disabled' → Radix Root disabled(原生 propagate 給所有 item);
  // mode='readonly' → context 傳 readOnly 給 items(item 渲染為 data-[readonly] 鎖互動 + aria-readonly)。
  return (
    <RadioGroupReadonlyContext.Provider value={resolvedMode === 'readonly'}>
      <RadioGroupPrimitive.Root
        className={cn("grid", className)}
        value={value}
        defaultValue={defaultValue}
        {...props}
        disabled={resolvedMode === 'disabled'}
        ref={ref}
      />
    </RadioGroupReadonlyContext.Provider>
  )
})
RadioGroup.displayName = 'RadioGroup'
// Field layout 宣告：RadioGroup 是 block primitive（多項堆疊），
// 進入 <Field> 時 control area 自動切 items-start + padding-top 公式對齊。
// Convention 詳見 components/Field/field.spec.md「Control area:Inline vs Block」段落。
;(RadioGroup as unknown as { fieldLayout: 'block' }).fieldLayout = 'block'

// ── RadioGroupItem Variants ─────────────────────────────────────────────────
// 與 Checkbox 完全對齊：sm/md=16px, lg=20px。差異只有形狀（rounded-full）和指示器（filled dot）。

const radioItemVariants = cva(
  [
    'grid place-content-center shrink-0 rounded-full',
    'border border-border bg-surface',
    'transition-colors duration-150',
    'hover:border-border-hover',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'data-[state=checked]:border-primary data-[state=checked]:text-primary',
    'data-[state=checked]:hover:border-primary-hover data-[state=checked]:hover:text-primary-hover',
    'disabled:cursor-not-allowed disabled:bg-disabled disabled:border-transparent disabled:hover:border-transparent',
    'disabled:data-[state=checked]:bg-disabled disabled:data-[state=checked]:border-transparent disabled:data-[state=checked]:text-fg-disabled',
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

// ── Dot Size ────────────────────────────────────────────────────────────────
const dotSize: Record<string, number> = { sm: 8, md: 8, lg: 10 }

// ── Types ───────────────────────────────────────────────────────────────────

type RadioItemPrimitiveProps = React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>

export interface RadioGroupItemProps
  extends RadioItemPrimitiveProps,
    VariantProps<typeof radioItemVariants> {
  /**
   * Inline label。提供時 RadioGroupItem 自動透過 SelectionItem 包裝，
   * 套用 codified 樣式（text-body / text-foreground / disabled 色）。
   * 在 <Field> context 內時此 prop 仍然生效（Radio 的 label 是每個 item
   * 各自的，不是整組 Field 的；FieldLabel 是 RadioGroup 整體的 label）。
   */
  label?: React.ReactNode
  /**
   * Inline description（secondary 文字）。須與 label 搭配使用。
   * 套用 text-body / text-fg-secondary 樣式。
   */
  description?: React.ReactNode
  /** 可選左側 icon(label 前)— 2026-06-12 M30 修:轉發 SelectionItem 既有 canonical 槽(selection-item.tsx jsDoc SSOT;與 avatar 互斥)*/
  icon?: LucideIcon
  /** 可選左側 avatar(label 前)— 同上 */
  avatar?: AvatarData
  /**
   * readonly 模式：鎖定互動但維持 checked/unchecked 視覺正確。
   * 通常整個 RadioGroup 一起設 readonly（由 parent RadioGroup 的 disabled
   * 或 readonly 行為決定），個別 item 也可設。
   */
  readOnly?: boolean
}

// ── RadioGroupItem ──────────────────────────────────────────────────────────

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(
  (
    {
      className,
      size,
      label,
      icon,
      avatar,
      description,
      readOnly = false,
      disabled,
      id: idProp,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const dotPx = dotSize[sizeKey]

    // 注意:RadioGroup mode='display' 的純文字渲染由 RadioGroup 本體 walk-children 處理
    // (見上方 RadioGroup forwardRef 的 mode === 'display' 分支),RadioGroupItem 在 display
    // mode 下不會被獨立 render,故此處無 display 分支。

    // 注意：Radio 的 label 語意與 Checkbox/Switch 不同——
    // Checkbox/Switch 的 label 就是該 control 的唯一 label（被 Field context 接管），
    // RadioGroupItem 的 label 是「該選項」的 label（每 item 各自擁有），
    // FieldLabel 則是整個 RadioGroup 的 label。
    // 因此 RadioGroupItem 的 label 不因 Field context 被忽略。
    const resolvedDisabled = useResolvedFieldDisabled(disabled)
    // group-level readonly(RadioGroup mode='readonly')或 item-level readOnly,任一 true 即鎖互動。
    const groupReadonly = React.useContext(RadioGroupReadonlyContext)
    const effectiveReadonly = readOnly || groupReadonly

    const generatedId = React.useId()
    const inputId = idProp ?? generatedId

    const rootEl = (
      <RadioGroupPrimitive.Item
        id={inputId}
        ref={ref}
        disabled={resolvedDisabled}
        aria-readonly={effectiveReadonly || undefined}
        data-readonly={effectiveReadonly || undefined}
        tabIndex={effectiveReadonly ? -1 : undefined}
        className={cn(radioItemVariants({ size }), className)}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="grid place-content-center">
          <Circle
            style={{ width: dotPx, height: dotPx }}
            className="fill-current text-current"
          />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    )

    // 無 label → 只渲染 radio 本體
    if (label == null) return rootEl

    // 有 label → 透過 SelectionItem 包裝，與 Checkbox 一致（disabled 已於上方 useResolvedFieldDisabled 解析）
    return (
      <SelectionItem
        control={rootEl}
        label={label}
        description={description}
        icon={icon}
        avatar={avatar}
        htmlFor={inputId}
        disabled={resolvedDisabled}
        size={sizeKey}
      />
    )
  }
)
RadioGroupItem.displayName = 'RadioGroupItem'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const radioGroupMeta = {
  component: 'RadioGroup',
  family: null, // self-contained primitive(對齊 spec frontmatter self-contained + body L31;非 Family 4 — field-controls.spec.md 成員名單不含 RadioGroup)
  variants: {

  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 36, iconSize: 20, typography: 'body-lg' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground', 'text-primary'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { RadioGroup, RadioGroupItem, radioItemVariants }
