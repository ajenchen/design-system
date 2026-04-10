import * as React from 'react'
import { cn } from '@/lib/utils'

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

import type { FieldMode, FieldOrientation, FieldSize, FieldControlLayout, FieldContextValue } from './field-context'
import { FieldContext } from './field-context'

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

const FIELD_TEXT_CLASS: Record<FieldSize, string> = {
  sm: 'text-body',
  md: 'text-body',
  lg: 'text-body-lg',
}

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
   * 預設由 Field 自動偵測——讀第一個 control child 的 `type.fieldLayout` static 屬性,
   * primitive 沒宣告時視為 `'inline'`。
   *
   * 只有兩種情況需要手動指定:
   * 1. consumer 把自己手寫的 JSX(`<div>` / 函式元件)當 control,系統無法偵測——強制 `'block'`
   * 2. 想覆寫 primitive 的預設(如把 RadioGroup 強制 inline 呈現,罕見)
   */
  controlLayout?: FieldControlLayout
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      id: idProp,
      mode = 'edit',
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
    const descriptionId = `${id}-description`
    const errorId = `${id}-error`

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
        descriptionId,
        errorId,
        mode,
        disabled,
        required,
        invalid,
        size,
        orientation,
        controlLayout,
        hasFieldWrapper: true,
      }),
      [id, descriptionId, errorId, mode, disabled, required, invalid, size, orientation, controlLayout]
    )

    // Control area：兩種佈局模型,「第一行內容中線」都錨在 field-height/2,
    // 跟 FieldLabel 在 horizontal 模式下的 padding-top 公式自然對齊。
    //
    // - inline: min-h-field-{size} + items-center
    //   單行 control(Input、Button 等)中線置中於 min-h box。
    //
    // - block:  flex-col + items-start + padding-top: calc((field-height - 1lh) / 2)
    //   多行 control(RadioGroup 等),第一行往下推到 field-height 中線,
    //   後續 item 自然往下流。不設 min-h(內容自己決定高度)。
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
              ...(labelWidth !== undefined
                ? ({ ['--field-label-width' as string]: labelWidth } as React.CSSProperties)
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
}

const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required: requiredProp, htmlFor: htmlForProp, style, children, ...props }, ref) => {
    const ctx = useFieldContext()
    const required = requiredProp ?? ctx?.required ?? false
    const disabled = ctx?.disabled ?? false
    const htmlFor = htmlForProp ?? ctx?.id
    const isHorizontal = ctx?.orientation === 'horizontal'
    const size: FieldSize = ctx?.size ?? 'md'

    // Horizontal 模式：label 與 input 中線對齊公式
    //   padding-top = (field-height - 1lh) / 2
    // 單行 label → 文字置中於 input；多行 label → 第一行對齊 input 中線，其餘往下流
    const horizontalStyle: React.CSSProperties | undefined = isHorizontal
      ? { paddingTop: `calc((${FIELD_HEIGHT_VAR[size]} - 1lh) / 2)` }
      : undefined

    return (
      <label
        ref={ref}
        htmlFor={htmlFor}
        className={cn(
          FIELD_TEXT_CLASS[size],
          'font-normal select-none',
          disabled ? 'text-fg-disabled' : 'text-foreground',
          className
        )}
        style={{ ...horizontalStyle, ...style }}
        data-field-slot="label"
        data-field-disabled={disabled ? '' : undefined}
        {...props}
      >
        {required && (
          <span
            aria-hidden="true"
            className={disabled ? 'text-fg-disabled' : 'text-fg-muted'}
          >
            *
          </span>
        )}
        {children}
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
  const size: FieldSize = ctx?.size ?? 'md'

  return (
    <p
      ref={ref}
      id={idProp ?? ctx?.descriptionId}
      className={cn(
        FIELD_TEXT_CLASS[size],
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
  const size: FieldSize = ctx?.size ?? 'md'

  // 無內容不渲染，避免空殼佔位
  if (children == null || children === false || children === '') return null

  return (
    <p
      ref={ref}
      id={idProp ?? ctx?.errorId}
      className={cn(FIELD_TEXT_CLASS[size], 'text-error-text', className)}
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
}

const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ className, gap = 'normal', ...props }, ref) => {
    const gapClass = gap === 'compact' ? 'gap-3' : gap === 'loose' ? 'gap-6' : 'gap-4'
    return (
      <div
        ref={ref}
        className={cn('flex flex-col min-w-0', gapClass, className)}
        data-field-group=""
        {...props}
      />
    )
  }
)
FieldGroup.displayName = 'FieldGroup'

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup }
