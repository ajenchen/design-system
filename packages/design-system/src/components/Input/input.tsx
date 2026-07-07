// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { ItemInlineAction, ItemPrefix, type InlineActionConfig } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── Types ───────────────────────────────────────────────────────────────────

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant'> {
  /** Field display mode */
  mode?: FieldMode
  /**
   * Visual chrome(正交於 mode);Phase B1(2026-05-05)從 `variant` 改名 `chrome`,對齊 FieldContext.variant 透傳。
   * 公開 variant 兩個:
   * - `'default'`(預設)— Field wrapper 完整 variant:bg-surface + 明顯 border + hover/focus 回饋。適用表單、Field 內嵌。
   * - `'bare'` — 透明 variant,hover / focus 才出現 border。適用 Toolbar inline editing(如 FileViewer zoom input / chart config toolbar / rich text toolbar number input)。保留 padding / typography / height,只拿掉背景和常態 border。
   *
   * @internal `'naked'` — 完全無 chrome / 無 border / 無 focus ring。單獨使用無視覺邊界,**不可直接 standalone 用**;僅供 DS 內部 cell-as-input 組合(host cell 自管 border + focus visual,正被 `FieldSurfaceContext='table-cell'` 取代)。consumer 請用 `default` / `bare`。
   *
   * 透傳:在 `<Field variant="default|bare">` 內自動繼承 context.variant;per-prop override context。
   * 世界級對照(bare):VS Code settings input / Figma toolbar number / Notion prop input。
   */
  variant?: FieldVariant
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

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error = false,
      size: sizeProp,
      startIcon: StartIcon,
      endAction,
      endSlot,
      loading = false,
      autoWidth = false,
      className,
      disabled: disabledProp,
      readOnly,
      value,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    // ── FieldContext 自動讀取(在 <Field> 內時,invalid / disabled / mode / chrome 由 context 接管) ──
    const fieldCtx = useFieldContext()
    // 2026-05-31 #11/#12:size + disabled 從 Field context cascade(對齊 NumberInput number-input.tsx:100-101
    // + MUI FormControl)。原 Input 不讀 fieldCtx.size/disabled → <Field size="lg"> / <Field disabled> 對 Input 無效。
    const size = useResolvedFieldSize(sizeProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // chrome 透傳:per-prop override context;context 沒值則 'default'
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')。
    // loading 期間 input 保持可編輯(Ant Input.Search 派),只用 aria-busy + endAction Spinner,不動 mode。
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })
    const isEditable = resolvedMode === 'edit'
    const isDisplay = resolvedMode === 'display'
    // error 合併:自身 error prop OR Field context invalid
    const resolvedError = useResolvedFieldInvalid(error)
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'

    // ── display mode:純展示,渲染 <span> 取代 <input> ──
    // 對齊 Carbon read-only / PatternFly inline-edit hidden-input / Cloudscape display-mode
    if (isDisplay) {
      const displayValue = value != null && value !== '' ? String(value) : null
      return (
        <div
          className={cn(
            fieldWrapperStyles({ mode: 'display', variant: variant, size }),
            autoWidth && 'inline-flex w-auto',
            className,
          )}
          data-field-mode="display"
        >
          {StartIcon && (
            <ItemPrefix>
              <StartIcon
                size={iconSize}
                className={cn('pointer-events-none', iconColor)}
                aria-hidden
              />
            </ItemPrefix>
          )}
          <span
            className={cn(
              bareInputStyles,
              // B1 fix(2026-05-05):display mode 單行 ellipsis 截斷(對齊 Notion / Airtable / Linear
              //   cell display canonical:single-line value 過長 → ellipsis。Textarea display 走 wrap path,
              //   不在此處;Input display 永遠 single-line。)
              'truncate',
              displayValue == null && 'text-fg-muted',
            )}
          >
            {displayValue ?? EMPTY_DISPLAY}
          </span>
        </div>
      )
    }

    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, variant: variant, size, error: resolvedError }),
          // autoWidth:wrapper 縮到 inline-flex + w-auto,讓寬度由 startIcon + input(field-sizing: content)+ endAction 自然累加
          autoWidth && 'inline-flex w-auto',
          className,
        )}
        data-field-mode={resolvedMode}
        data-error={isEditable && resolvedError ? '' : undefined}
        aria-busy={loading || undefined}
      >
        {StartIcon && (
          <ItemPrefix>
            <StartIcon
              size={iconSize}
              className={cn('pointer-events-none', iconColor)}
              aria-hidden
            />
          </ItemPrefix>
        )}
        <input
          ref={ref}
          type="text"
          id={idProp ?? fieldCtx?.id}
          value={value as string | number | readonly string[] | undefined}
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

// Phase B1(2026-05-05):InputDisplay 退場。改用 `<Input mode="display" value={...} />`
// 對齊 Carbon read-only / PatternFly inline-edit hidden-input / Cloudscape display-mode 統一 mode 模型。

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// 2026-07-05 Phase 2 fill(deep-audit A.1b):variants 按 input.tsx variant jsdoc、sizes 按
// fieldWrapperStyles cva 真值(h-field-sm/md/lg = 28/32/36,uiSize.css)+ ICON_SIZE SSOT
// (sm/md 16、lg 20)填。`naked` 為 @internal cell-as-input substrate → 不列入 public variants。
export const inputMeta = {
  component: 'Input',
  family: 4,
  variants: {
    default: { purpose: 'Field wrapper 完整 chrome(bg-surface + border + hover/focus 回饋)— 表單 / Field 內嵌' },
    bare: { purpose: '透明 chrome,hover / focus 才現 border — Toolbar inline editing(zoom input / config toolbar)' },
  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 36, iconSize: 20, typography: 'body-lg' },
  },
  // 'active' 移除 — Field chrome 無按壓態(對齊 Textarea / LinkInput meta 既有寫法)(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { Input }
