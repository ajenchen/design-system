// code-quality-allow: file-size — foundational composite(Field + FieldLabel + FieldDescription + FieldError + context + 8 layout variants),拆檔會讓 Field 家族互相 import 循環
import * as React from 'react'
import { Info as InfoIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

/**
 * Field — 表單欄位佈局容器（shadcn Field 風格）
 *
 * ── 定位 ────────────────────────────────────────────────────────────────
 * Field 只負責 **佈局 + 狀態 context**，不擁有任何資料型別邏輯。
 * 每個資料型別對應的 Control（Input、NumberInput、Checkbox、Switch 等）
 * 維持自己的 edit / readonly / disabled 三態，Field 透過 context 把
 * mode / disabled / required / invalid / id 傳給子元件，由子元件決定
 * 如何反映。
 *
 * ── 結構 ────────────────────────────────────────────────────────────────
 *   <Field orientation="vertical | horizontal" labelWidth="120px">
 *     <FieldLabel>姓名</FieldLabel>
 *     <Input value={...} onChange={...} />         ← Control（任何非 label/desc/error 的 child）
 *     <FieldDescription>...</FieldDescription>
 *     <FieldError>{errors.name}</FieldError>
 *   </Field>
 *
 *   Control 會自動包在 control area slot（min-h-field-* + items-center），
 *   確保 Checkbox / Switch / Radio 等高度 < field-height 的 primitive
 *   垂直對齊 Input 中線；Input 等自身為 field-height 的 primitive 填滿。
 *
 * ── Horizontal mode 的 label 垂直對齊 ───────────────────────────────────
 * FieldLabel 在 horizontal 模式下使用公式：
 *     padding-top: calc((var(--field-height-{size}) - 1lh) / 2)
 *
 * 單行 label → 文字第一行與 input 中線對齊（視覺置中）
 * 多行 label → 第一行仍與 input 中線對齊，其餘行往下流（label 高度超過
 *              input 時視覺上仍保持與 input 內容同一基準線）
 *
 * 此公式 tracks field-height 和 line-height 的變動，size 切換或字體
 * 調整時自動連動，不需 JS 測量。
 *
 * ── Horizontal mode 的 label 寬度 ───────────────────────────────────────
 * 透過 labelWidth prop → --field-label-width CSS variable，可以是任何
 * CSS length（"120px"、"10rem"、"30%" 等）。預設 "auto" 由 label 內容撐開。
 *
 * ── Required 星號 ──────────────────────────────────────────────────────
 * Field 的 required prop 會透過 context 傳給 FieldLabel 自動渲染 *，
 * 星號為 neutral-7（fg-muted），貼齊 label 文字（無 gap），disabled
 * 時降為 fg-disabled。也可在個別 FieldLabel 覆寫。
 */

// ── Types & Context ──
// Context 定義在 field-context.ts(打斷 circular import)。
// field.tsx 只 import 不 re-export——consumer 直接從 field-context.ts import useFieldContext。

import type { FieldMode, FieldVariant, FieldOrientation, FieldSize, FieldControlLayout, FieldContextValue } from './field-context'
import { FieldContext, useFieldContext } from './field-context'

// ── Internal helpers ────────────────────────────────────────────────────────

const MIN_H_CLASS: Record<FieldSize, string> = {
  sm: 'min-h-field-sm',
  md: 'min-h-field-md',
  lg: 'min-h-field-lg',
}

const FIELD_HEIGHT_VAR: Record<FieldSize, string> = {
  sm: 'var(--field-height-sm)',
  md: 'var(--field-height-md)',
  lg: 'var(--field-height-lg)',
}

// Label / Description / Error 的字體固定 text-body (14px)，不隨 field size 變。
// 世界級共識：field size 只影響 input 高度，不影響表單佈局元素的 typography。
const FIELD_TEXT_CLASS = 'text-body'

type SlotKind = 'label' | 'description' | 'error' | 'control'

function resolveSlotKind(node: React.ReactNode): SlotKind {
  if (!React.isValidElement(node)) return 'control'
  const displayName = (node.type as { displayName?: string } | null | undefined)?.displayName
  if (displayName === 'FieldLabel') return 'label'
  if (displayName === 'FieldDescription') return 'description'
  if (displayName === 'FieldError') return 'error'
  return 'control'
}

/**
 * 偵測 control children 的 fieldLayout——任一 control 宣告為 'block' 即整個 area 切 block 模式。
 *
 * Convention：block primitive 在自己的元件檔案掛 static `fieldLayout = 'block'` 屬性,
 * Field 在 render 時讀 `child.type.fieldLayout`。預設 'inline'。
 *
 * 為什麼是「任一」而非「全部」：實務上 Field 一個 control area 通常只有一個 control,
 * 但若 consumer 同時放多個 child(例如 RadioGroup + 一段補充文字節點),只要其中有 block
 * primitive,整個 area 就應該以 block 模式佈局,確保第一行對齊正確。
 */
function detectControlLayout(controlNodes: React.ReactNode[]): FieldControlLayout {
  for (const node of controlNodes) {
    if (!React.isValidElement(node)) continue
    const layout = (node.type as { fieldLayout?: FieldControlLayout } | null | undefined)?.fieldLayout
    if (layout === 'block') return 'block'
  }
  return 'inline'
}

// ── Field ───────────────────────────────────────────────────────────────────

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  id?: string
  mode?: FieldMode
  /**
   * 視覺外殼(2026-05-05)。
   * - `default`(預設)— 含 border + bg(一般 form input)
   * - `bare` — 透明 variant,hover/focus reveal(cell-as-input substrate;VS Code/Figma toolbar idiom)
   *
   * 透傳機制:Field 一次宣告,所有 child Field control 自動繼承(per-control prop override 可覆寫)。
   */
  variant?: FieldVariant
  orientation?: FieldOrientation
  size?: FieldSize
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  /**
   * Horizontal mode 的 label 欄寬度。支援任何 CSS length 值（"120px"、"10rem"、"30%"...）。
   * 預設 'auto' 由 label 內容撐開。
   */
  labelWidth?: string
  /**
   * Control area 佈局模型(逃生艙)。
   *
   * 預設由 Field 自動偵測——迭代全部 control child 的 `type.fieldLayout` static 屬性,
   * 任一宣告為 `'block'` 即整個 area 切 block(first-block-wins);全部缺宣告時視為 `'inline'`。
   *
   * 只有兩種情況需要手動指定:
   * 1. consumer 把自己手寫的 JSX(`<div>` / 函式元件)當 control,系統無法偵測——強制 `'block'`
   * 2. 想覆寫 primitive 的預設(如把 RadioGroup 強制 inline 呈現,罕見)
   */
  controlLayout?: FieldControlLayout
}

// ── FieldGroup Context(cascade horizontal labelWidth)──
// 同一畫面多個 horizontal Field,label 寬度應統一對齊 → FieldGroup 提供 SSOT。
// 下面 Field 組件自動 consume,consumer 可用 Field 的 labelWidth prop 覆寫單行。
interface FieldGroupContextValue {
  horizontalLabelWidth?: string
}
// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FieldGroupContext = React.createContext<FieldGroupContextValue>({})

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      id: idProp,
      mode = 'edit',
      variant = 'default',
      orientation = 'vertical',
      size = 'md',
      required = false,
      disabled: disabledProp = false,
      invalid = false,
      labelWidth,
      controlLayout: controlLayoutProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const id = idProp ?? generatedId
    const labelId = `${id}-label`
    const descriptionId = `${id}-description`
    const errorId = `${id}-error`

    // FieldGroup cascade:group 的 horizontalLabelWidth 是 fallback,單行 labelWidth 覆寫
    const groupCtx = React.useContext(FieldGroupContext)
    const effectiveLabelWidth = labelWidth ?? groupCtx.horizontalLabelWidth

    // mode=disabled 與 disabled prop 任一為 true 即視為 disabled
    const disabled = disabledProp || mode === 'disabled'

    // 把 children 依 slot 類型分組
    const labelNodes: React.ReactNode[] = []
    const controlNodes: React.ReactNode[] = []
    const descriptionNodes: React.ReactNode[] = []
    const errorNodes: React.ReactNode[] = []

    React.Children.forEach(children, (child) => {
      const slot = resolveSlotKind(child)
      if (slot === 'label') labelNodes.push(child)
      else if (slot === 'description') descriptionNodes.push(child)
      else if (slot === 'error') errorNodes.push(child)
      else controlNodes.push(child)
    })

    // 解析 control layout：consumer 顯式指定 > primitive 自我宣告 > 預設 inline
    const controlLayout: FieldControlLayout =
      controlLayoutProp ?? detectControlLayout(controlNodes)

    const contextValue = React.useMemo<FieldContextValue>(
      () => ({
        id,
        labelId,
        descriptionId,
        errorId,
        mode,
        variant,
        disabled,
        required,
        invalid,
        size,
        orientation,
        controlLayout,
        hasFieldWrapper: true,
      }),
      [id, labelId, descriptionId, errorId, mode, variant, disabled, required, invalid, size, orientation, controlLayout]
    )

    // Control area：兩種佈局模型,「第一行內容中線」都錨在 field-height/2,
    // 跟 FieldLabel 在 horizontal 模式下的 padding-top 公式自然對齊。
    //
    // - inline: min-h-field-{size} + items-center
    //   單行 control(Input、Button 等)中線置中於 min-h box。
    //
    // - block:  flex-col + items-start(不設 min-h、不加 padding-top,內容自己決定高度)
    //   多行 control(RadioGroup 等),第一行中線由 block primitive 自帶 py 推到
    //   field-height/2,後續 item 自然往下流。
    // Block control area 不加額外 paddingTop——block primitive(RadioGroup 等)
    // 的子元件(SelectionItem)已自帶 py = calc((field-height - 1lh) / 2),
    // 第一個 item 的文字自然落在 field-height/2。額外加 paddingTop 會 double padding。
    const controlArea =
      controlLayout === 'block' ? (
        <div
          className="flex flex-col items-start min-w-0"
          data-field-slot="control"
          data-field-control-layout="block"
        >
          {controlNodes}
        </div>
      ) : (
        <div
          className={cn('flex items-center min-w-0', MIN_H_CLASS[size])}
          data-field-slot="control"
          data-field-control-layout="inline"
        >
          {controlNodes}
        </div>
      )

    // Horizontal：grid 兩欄，label 在左、content 欄堆疊（control → description → error）
    if (orientation === 'horizontal') {
      return (
        <FieldContext.Provider value={contextValue}>
          <div
            ref={ref}
            className={cn('grid gap-x-3 items-start', className)}
            style={{
              gridTemplateColumns: 'var(--field-label-width, auto) minmax(0, 1fr)',
              ...(effectiveLabelWidth !== undefined
                ? ({ ['--field-label-width' as string]: effectiveLabelWidth } as React.CSSProperties)
                : undefined),
              ...style,
            }}
            data-field-orientation="horizontal"
            data-field-mode={mode}
            data-field-size={size}
            data-field-disabled={disabled ? '' : undefined}
            data-field-invalid={invalid ? '' : undefined}
            {...props}
          >
            {labelNodes}
            <div className="flex flex-col gap-1 min-w-0">
              {controlArea}
              {descriptionNodes}
              {errorNodes}
            </div>
          </div>
        </FieldContext.Provider>
      )
    }

    // Vertical（預設）：單欄 flex-col
    return (
      <FieldContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={cn('flex flex-col gap-1 min-w-0', className)}
          style={style}
          data-field-orientation="vertical"
          data-field-mode={mode}
          data-field-size={size}
          data-field-disabled={disabled ? '' : undefined}
          data-field-invalid={invalid ? '' : undefined}
          {...props}
        >
          {labelNodes}
          {controlArea}
          {descriptionNodes}
          {errorNodes}
        </div>
      </FieldContext.Provider>
    )
  }
)
Field.displayName = 'Field'

// ── FieldLabel ──────────────────────────────────────────────────────────────

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * 強制渲染 required 星號（覆寫 Field context 的 required）。
   * 若未設定，預設讀 context。
   */
  required?: boolean
  /**
   * 在 label 文字後方顯示 info icon (ℹ)，hover 出現 tooltip 說明。
   * 傳 string → tooltip 內容。
   *
   * Info icon 用 inline action pattern（補充工具，視覺退後），
   * 因為 label 的 primary interaction 是 input，info 是補充說明。
   */
  info?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required: requiredProp, info, htmlFor: htmlForProp, style, children, ...props }, ref) => {
    const ctx = useFieldContext()
    const required = requiredProp ?? ctx?.required ?? false
    const disabled = ctx?.disabled ?? false
    const htmlFor = htmlForProp ?? ctx?.id
    const isHorizontal = ctx?.orientation === 'horizontal'
    const controlLayout = ctx?.controlLayout ?? 'inline'
    const size: FieldSize = ctx?.size ?? 'md'

    // Horizontal 模式對齊策略 — 依 controlLayout 分兩套 (CSS-only, 不需 JS 測量)
    //
    // ── Inline control (Input / Button / Switch / SegmentedControl) ──
    //   Control 有固定單行高度 = field-height,可以對齊中線。
    //   策略: min-h-field-{size} + flex flex-col + justify-content: center
    //
    //   1) 短 label (總高 ≤ field-height):
    //      min-h 生效 → 容器 = field-height → justify-center 把 label 垂直置中
    //      第一行 top = (field-height - 1lh)/2 → 第一行中線對齊 control 中線 ✓
    //   2) 長 label (總高 > field-height):
    //      min-h 被內容撐大 → 容器 = label 總高 → justify-center 無作用(內容已填滿)
    //      第一行 top = 0 → label top 對齊 control top ✓
    //
    // ── Block control (RadioGroup / CheckboxGroup) ──
    //   Control 是多行群組,沒有「整體中線」可以對齊;錨點是「第一個 item 的第一行
    //   中線永遠在 field-height/2」,由 SelectionItem 的 py 維持。
    //   策略: padding-top = (field-height - 1lh)/2 — 把 label 第一行推到同樣位置。
    //
    //   這個策略對任何 label 長度都正確:label 第一行永遠與第一個 item 第一行對齊,
    //   label 超出 control 時往下流(因為 block control 通常本來就很高,不會有
    //   inline 模式那種「label 比 control 高」的視覺問題)。
    //
    // 內層 <span>: 只有 inline 策略需要(flex-col 會把 * 星號和 label 文字縱向堆疊,
    // 必須包一層讓兩者 inline 同行)。block 策略可以不包,但為了 DOM 一致性一律包。
    const horizontalInlineClass =
      isHorizontal && controlLayout === 'inline'
        ? cn('flex flex-col justify-center', MIN_H_CLASS[size])
        : undefined

    const horizontalBlockStyle: React.CSSProperties | undefined =
      isHorizontal && controlLayout === 'block'
        ? { paddingTop: `calc((${FIELD_HEIGHT_VAR[size]} - 1lh) / 2)` }
        : undefined

    return (
      <label
        ref={ref}
        id={ctx?.labelId}
        htmlFor={htmlFor}
        className={cn(
          FIELD_TEXT_CLASS,
          'font-normal select-none',
          disabled ? 'text-fg-disabled' : 'text-foreground',
          horizontalInlineClass,
          className
        )}
        style={{ ...horizontalBlockStyle, ...style }}
        data-field-slot="label"
        data-field-disabled={disabled ? '' : undefined}
        // 2026-06-10 a11y:styled-disabled label 必明告 inactive(WCAG 1.4.3 inactive-UI 豁免需可機判;
        // axe 對無 aria-disabled 的 fg-disabled 文字誤報 color-contrast — deep-audit 抓 8 筆)
        aria-disabled={disabled || undefined}
        {...props}
      >
        <span className="inline-flex items-center gap-1">
          <span>
            {required && (
              <span
                aria-hidden="true"
                className={disabled ? 'text-fg-disabled' : 'text-fg-muted'}
              >
                *
              </span>
            )}
            {children}
          </span>
          {info && !disabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={info}
                  className="inline-flex items-center text-fg-muted hover:text-fg-secondary bg-transparent border-0 p-0 cursor-pointer"
                >
                  <InfoIcon size={16} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{info}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </label>
    )
  }
)
FieldLabel.displayName = 'FieldLabel'

// ── FieldDescription ────────────────────────────────────────────────────────

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, id: idProp, ...props }, ref) => {
  const ctx = useFieldContext()
  const disabled = ctx?.disabled ?? false

  return (
    <p
      ref={ref}
      id={idProp ?? ctx?.descriptionId}
      className={cn(
        FIELD_TEXT_CLASS,
        disabled ? 'text-fg-disabled' : 'text-fg-secondary',
        className
      )}
      data-field-slot="description"
      {...props}
    >
      {children}
    </p>
  )
})
FieldDescription.displayName = 'FieldDescription'

// ── FieldError ──────────────────────────────────────────────────────────────

const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, id: idProp, ...props }, ref) => {
  const ctx = useFieldContext()

  // 無內容不渲染，避免空殼佔位
  if (children == null || children === false || children === '') return null

  return (
    <p
      ref={ref}
      id={idProp ?? ctx?.errorId}
      className={cn(FIELD_TEXT_CLASS, 'text-error-text', className)}
      data-field-slot="error"
      role="alert"
      {...props}
    >
      {children}
    </p>
  )
})
FieldError.displayName = 'FieldError'

// ── FieldGroup ──────────────────────────────────────────────────────────────
// 垂直堆疊多個 Field，共用 gap 節奏。
// 用於表單中多個欄位排列。

export interface FieldGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Field 之間的垂直間距，預設 'normal'（gap-4） */
  gap?: 'compact' | 'normal' | 'loose'
  /**
   * 同一 group 內所有 horizontal Field 共用的 label 欄寬度。
   *
   * 支援任何 CSS length(`"140px"` / `"10rem"` / `"30%"` 等)。預設不指定——
   * 每個 Field 自動以 label 內容撐開(容易歪七扭八)。
   *
   * 世界級 idiom:macOS System Settings / iOS Settings / GitHub Settings 的
   * setting list 一律 label 固定寬、control 右對齊,列與列整齊對齊。
   *
   * 單一 Field 可以用自己的 `labelWidth` prop 覆寫 cascade 值。
   */
  horizontalLabelWidth?: string
}

const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ className, gap = 'normal', horizontalLabelWidth, ...props }, ref) => {
    const gapClass = gap === 'compact' ? 'gap-3' : gap === 'loose' ? 'gap-6' : 'gap-4'
    const groupCtxValue = React.useMemo(
      () => ({ horizontalLabelWidth }),
      [horizontalLabelWidth],
    )
    return (
      <FieldGroupContext.Provider value={groupCtxValue}>
        <div
          ref={ref}
          className={cn('flex flex-col min-w-0', gapClass, className)}
          data-field-group=""
          {...props}
        />
      </FieldGroupContext.Provider>
    )
  }
)
FieldGroup.displayName = 'FieldGroup'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const fieldMeta = {
  component: 'Field',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-error-text', 'text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup }
