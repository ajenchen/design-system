import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, InlineActionConfig } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'

// ── Types ───────────────────────────────────────────────────────────────────

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode'> {
  /** Field display mode */
  mode?: FieldMode
  /**
   * Visual chrome variant(正交於 mode):
   * - `'default'`(預設)— Field wrapper 完整 chrome:bg-surface + 明顯 border + hover/focus 回饋。適用表單、Field 內嵌。
   * - `'bare'` — 透明 chrome,hover / focus 才出現 border。適用 Toolbar inline editing(如 FileViewer zoom input / chart config toolbar / rich text toolbar number input)。保留 padding / typography / height,只拿掉背景和常態 border。
   *
   * 世界級對照(bare):VS Code settings input / Figma toolbar number / Notion prop input。
   */
  variant?: 'default' | 'bare'
  /** Error 狀態（正交於 mode）。border-error + aria-invalid。 */
  error?: boolean
  /** 左側靜態 icon — 輔助理解 input 用途（如 Search）。fg-muted。 */
  startIcon?: LucideIcon
  /** 右側 inline action — 宣告式 API，Field 根據 size 自動渲染。 */
  endAction?: InlineActionConfig
  /**
   * 右側 slot(ReactNode)— escape hatch 供 consumer 放自訂元素(如 DropdownMenuTrigger asChild + ItemInlineActionButton)。
   * 跟 `endAction` 互斥(同時傳 endSlot 會優先,endAction 被忽略)。
   *
   * **使用情境**:ZoomInput 需要 chevron 作 DropdownMenuTrigger anchor,config-only API 無法做到。
   * **禁止情境**:表單欄位 / 一般 inline action → 用 `endAction` 宣告式 API。
   */
  endSlot?: React.ReactNode
  /**
   * Loading 狀態(async 驗證 / debounce fetch 中)。
   * - **input 保持可編輯**(user 可以邊改邊讀,debounce 場景 UX 最好)
   * - 世界級對照:Ant Input.Search 派(input editable during loading);非 Material readonly 派
   * - 自動在 endAction slot 塞 `<CircularProgress size={iconSize}/>`(與 endAction prop 互斥)
   * - 宣告 `aria-busy="true"` 讓 screen reader 感知處理中
   */
  loading?: boolean
  /**
   * Auto-width:Input 寬度 = 內容寬(value / placeholder 文字寬)+ startIcon + endAction + padding。
   * 使用 CSS `field-sizing: content`(Chrome 123+ / Safari 17.4+;Firefox 還在實驗)。
   *
   * **使用情境**:
   * - Inline edit(VS Code setting row / Figma property toolbar number input)
   * - ZoomInput(FileViewer 縮放比例:輸入「100%」自動縮到三位數寬)
   * - Tag / Chip 內 inline rename
   *
   * **不要用在**:表單 Field(Field 需要欄寬對齊,不該隨值跳動)
   *
   * **fallback**:不支援 `field-sizing` 的瀏覽器會退化為 `w-auto`(wrapper 縮到 content 尺寸,
   * input 本身有 min-width 避免消失)。UX 上稍不一致但不致斷;若必須精準對齊所有瀏覽器,
   * consumer 可自行傳 `style={{ width: ... }}` 顯式寬度,不走 auto。
   */
  autoWidth?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      mode = 'edit',
      variant = 'default',
      error = false,
      size,
      startIcon: StartIcon,
      endAction,
      endSlot,
      loading = false,
      autoWidth = false,
      className,
      disabled,
      readOnly,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    // ── FieldContext 自動讀取(在 <Field> 內時,invalid / disabled 由 context 接管) ──
    const fieldCtx = useFieldContext()
    // loading 期間 input 保持可編輯(Ant Input.Search 派,UX「邊改邊讀」)
    // 只用 aria-busy + endAction Spinner 標示狀態,不動 mode
    const resolvedMode = disabled
      ? 'disabled'
      : readOnly
        ? 'readonly'
        : fieldCtx?.disabled
          ? 'disabled'
          : mode
    const isEditable = resolvedMode === 'edit'
    // error 合併:自身 error prop OR Field context invalid
    const resolvedError = error || (fieldCtx?.invalid ?? false)
    const iconSize = size === 'lg' ? 20 : 16
    const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'

    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, variant, size }),
          isEditable && resolvedError && [
            'border-error hover:border-error-hover',
            'focus-within:border-error focus-within:hover:border-error',
          ],
          // autoWidth:wrapper 縮到 inline-flex + w-auto,讓寬度由 startIcon + input(field-sizing: content)+ endAction 自然累加
          autoWidth && 'inline-flex w-auto',
          className,
        )}
        data-field-mode={resolvedMode}
        data-error={isEditable && resolvedError ? '' : undefined}
        aria-busy={loading || undefined}
      >
        {StartIcon && (
          <StartIcon
            size={iconSize}
            className={cn('shrink-0 pointer-events-none', iconColor)}
            aria-hidden
          />
        )}
        <input
          ref={ref}
          type="text"
          id={idProp ?? fieldCtx?.id}
          readOnly={resolvedMode === 'readonly'}
          disabled={resolvedMode === 'disabled'}
          aria-invalid={resolvedError || undefined}
          aria-required={fieldCtx?.required || undefined}
          aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
          aria-errormessage={ariaErrorMessageProp ?? (resolvedError ? fieldCtx?.errorId : undefined)}
          className={cn(
            bareInputStyles,
            resolvedMode === 'disabled' && 'text-fg-disabled placeholder:text-fg-disabled cursor-not-allowed',
            // autoWidth:input 本身 field-sizing:content(Chrome 123+ / Safari 17.4+),寬度跟 value 文字寬。
            // w-auto 關掉預設 w-full;min-w-0 讓 flex shrink 不卡住。
            autoWidth && '[field-sizing:content] w-auto min-w-0',
          )}
          {...props}
        />
        {loading ? (
          <CircularProgress size={iconSize} className="shrink-0" />
        ) : endSlot && isEditable ? (
          // endSlot escape hatch:consumer 自控右側 slot(如 DropdownMenuTrigger asChild wrap)
          endSlot
        ) : endAction && isEditable ? (
          <ItemInlineAction action={endAction} size={size ?? 'md'} />
        ) : null}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ── Display ─────────────────────────────────────────────────────────────────
// Table cell 和 Form readonly 共用的格式化顯示。

function InputDisplay({ value }: { value?: string | null }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{value}</>
}
InputDisplay.displayName = 'InputDisplay'

export { Input, InputDisplay }
