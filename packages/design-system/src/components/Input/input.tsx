// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, fieldWidthVariant, fieldWidthStyle, bareInputStyles, focusFieldInputFromChrome, FIELD_TEXT_ENTRY_CURSOR } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid, useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { FieldDescriptionRow, useControlCharCount } from '@/design-system/components/Field/field-count'
import { ItemInlineAction, ItemPrefix, type InlineActionConfig } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── Types ───────────────────────────────────────────────────────────────────

// 原生 `width` / `height` 拿掉(2026-11-15「尺寸:甲」):`<input type="text">` 的 HTML width / height 屬性沒有任何作用
//(只有 type=image 才有),留著 = `<Input width="hug">` 型別檢查會過、畫面卻毫無反應(audit-r7 INV-02 型別探針 + 瀏覽器實測
// width=240 仍 153px)。寬度改走 DS 的寬度軸 `width?: FieldWidth`(下方);高度由 `size` 決定。
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'width' | 'height'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant' | 'width'> {
  /** Field mode */
  mode?: FieldMode
  /**
   * Visual variant(正交於 mode),對齊 FieldContext.variant 透傳。
   * 公開 variant 一個(2026-07-09 `bare` 退役,詳 field-types.ts FieldVariant note;naked 2026-07-14 型別收窄至 FieldVariantInternal):
   * - `'default'`(預設)— Field wrapper 完整 variant:bg-surface + 明顯 border + hover/focus 回饋。適用表單、Field 內嵌。
   *
   * @internal `'naked'` — 完全無 chrome / 無 border / 無 focus ring。單獨使用無視覺邊界,**不可直接 standalone 用**;僅供 DS 內部 cell-as-input 組合(edit×naked 的 border/hover/focus/error 由 field-wrapper 自渲 state machine 提供,非 host cell 自管;詳 field-wrapper.tsx)。consumer 請用 `default`(2026-07-14 起型別層已擋:公開 FieldVariant 不含 naked,僅 DataTable cell-registry 經 WithFieldVariantInternal 通道傳入)。
   *
   * 透傳:在 `<Field variant="default">` 內自動繼承 context.variant;per-prop override context。
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
   * 寬度軸(與 Select / Combobox / DatePicker 同一個 `width`,field-controls.spec.md「寬度軸」):
   * - `'fill'`(預設)— 撐滿容器
   * - `'hug'` — 跟內容:寬度 = 內容寬(value / placeholder 文字寬)+ startIcon + endAction + padding。
   *   使用 CSS `field-sizing: content`(Chrome 123+ / Safari 17.4+;Firefox 還在實驗)。
   *   **使用情境**:Inline edit(VS Code setting row / Figma property toolbar number input)、ZoomInput(FileViewer
   *   縮放比例:輸入「100%」自動縮到三位數寬)、Tag / Chip 內 inline rename。**不要用在**表單 Field(欄寬要對齊,不該隨值跳動)。
   *   **fallback**:不支援 `field-sizing` 的瀏覽器退化為 `w-auto`(外框縮到內容尺寸,input 為 min-w-0,依 content/placeholder 撐寬)。
   * - 數字 — 固定寬(px;窄容器裡不超出容器)。工具列裡的搜尋框、篩選列的條件欄這類「要固定寬」的地方用它,
   *   不要再用 `className="!w-[…]"` 硬蓋。
   */
  width?: FieldWidth
  /**
   * 顯示字數計數(預設 false)。上限用原生 `maxLength`:有上限顯示「12 / 100」、沒有只顯示「12」;
   * 打到上限照原生規則擋住不能再打。計數畫在 Field 說明那一行的右端、沒有說明時那一行只有計數;
   * 不在 Field 裡時畫在框下一行的右端。只在可輸入的框(編輯 / 唯讀 / 停用)顯示,純顯示與表格格不顯示。
   * 規則住 `Field/field-controls.spec.md`「字數計數」(2026-11-26 C7)。
   */
  showCount?: boolean
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
      width = 'fill',
      showCount = false,
      className,
      disabled: disabledProp,
      readOnly,
      value,
      defaultValue,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const hug = width === 'hug'
    // ── FieldContext 自動讀取(在 <Field> 內時,invalid / disabled / mode / chrome 由 context 接管) ──
    const fieldCtx = useFieldContext()
    // 2026-05-31 #11/#12:size + disabled 從 Field context cascade(對齊 NumberInput number-input.tsx#NumberInput
    // + MUI FormControl)。原 Input 不讀 fieldCtx.size/disabled → <Field size="lg"> / <Field disabled> 對 Input 無效。
    const size = useResolvedFieldSize(sizeProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // chrome 透傳:per-prop override context;context 沒值則 'default'
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')。
    // loading 期間 input 保持可編輯(Ant Input.Search 派),只用 aria-busy + endAction Spinner,不動 mode。
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })
    const emptyDisplay = useFieldEmptyDisplay()
    const isEditable = resolvedMode === 'edit'
    const isView = resolvedMode === 'view'
    // error 合併:自身 error prop OR Field context invalid
    const resolvedError = useResolvedFieldInvalid(error)
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'

    // ── view mode(+ readonly 空值)純展示,渲染 <span> 取代 <input> ──
    // 對齊 Carbon read-only / PatternFly inline-edit hidden-input / Cloudscape display-mode
    // 2026-07-08 user 拍板:readonly 空值也走 view-span 顯 '-'(readonly **有值** 仍走下方
    // native <input readOnly> 保留選取/複製語意 — field-controls.spec.md「null / undefined 值」)。
    // 2026-07-14 audit Dim 26(dual-mode coherence):uncontrolled `defaultValue` 也要被
    // view / readonly-空值判定認得 — 原本只讀 `value`,uncontrolled Input 切 view 會誤顯 '-'。
    // 2026-07-14 R2(dual-model consensus,取代同日稍早 onChange-mirror 版):resolved value 改走
    // useControllable 內部 SSOT(Radix idiom,同 Select / Pagination 既有消費)。uncontrolled 時
    // native input 由 value={resolved} 內部驅動(defaultValue 只作初始值,不落 DOM attribute),
    // 修 mirror 版兩個真缺陷:
    // (1) remount-stale — 切 view / readonly(native input unmount)再回 edit,native input 從
    //     defaultValue attribute 重掛 → 顯示 stale 初始值,與 mirror 判定分歧;
    // (2) form.reset() stale — HTML 標準 reset 不發 input event,onChange mirror 停在 reset 前的值
    //     (下方 reset bridge 修)。
    // controlled(傳 value)時 useControllable 純 passthrough,行為與原本完全一致。
    // consumer onChange 不接進 hook(保留 native event signature),於 <input> onChange 另行轉發。
    const isControlled = value !== undefined
    const [resolved, setResolved] = useControllable<string | number | readonly string[]>({
      value: value as string | number | readonly string[] | undefined,
      defaultValue: defaultValue ?? '',
    })
    const displayValue = resolved != null && resolved !== '' ? String(resolved) : null
    const showDisplaySpan = isView || (resolvedMode === 'readonly' && displayValue == null)

    // form.reset() bridge(uncontrolled only):reset 恢復 defaultValue 但不發 input event →
    // 手動把 resolved 歸位 defaultValue。keyed on showDisplaySpan:view 分支不掛 native input,
    // 回 edit 重掛時 effect 重跑補掛 listener。
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    React.useEffect(() => {
      if (isControlled || showDisplaySpan) return
      const form = innerRef.current?.form
      if (!form) return
      const handleReset = () => setResolved(defaultValue ?? '')
      form.addEventListener('reset', handleReset)
      return () => form.removeEventListener('reset', handleReset)
    }, [isControlled, showDisplaySpan, defaultValue, setResolved])
    // Merge refs(LinkInput setRef idiom,link-input.tsx#setRef)
    const setRef = React.useCallback((el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }, [ref])

    // 字數計數(Field/field-count.tsx;規則 field-controls.spec.md「字數計數」):只在有輸入元素的框顯示(純顯示 / 表格格不顯示)。
    // 在 Field 裡交給 Field 畫在說明那一行右端;單獨用時下方自己畫一行。Hook 一律呼叫(Rules of Hooks),不顯示時 enabled=false。
    const inputId = idProp ?? fieldCtx?.id
    const charCount = useControlCharCount({
      enabled: showCount && !showDisplaySpan && variant !== 'naked',
      value: resolved,
      maxLength: props.maxLength,
      controlId: inputId,
      disabled: resolvedMode === 'disabled',
    })
    const ariaDescribedBy = [ariaDescribedByProp ?? fieldCtx?.descriptionId, charCount.countId].filter(Boolean).join(' ') || undefined

    if (showDisplaySpan) {
      const spanMode = isView ? 'view' : 'readonly'
      return (
        <div
          className={cn(
            // hug:外框縮到內容寬(inline-flex w-auto);數字走 fixed + 行內寬
            fieldWrapperStyles({ mode: spanMode, variant: variant, size, width: hug ? undefined : fieldWidthVariant(width) }),
            hug && 'inline-flex w-auto',
            className,
          )}
          style={fieldWidthStyle(width)}
          data-field-mode={spanMode}
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
              // B1 fix(2026-05-05):view mode 單行 ellipsis 截斷(對齊 Notion / Airtable / Linear
              //   cell display canonical:single-line value 過長 → ellipsis。Textarea view 走 wrap path,
              //   不在此處;Input view 永遠 single-line。)
              'min-w-0',
              displayValue == null && fieldEmptyColorClass(resolvedMode),
            )}
          >
            {/* 2026-07-28:截斷必附 tooltip(tooltip.spec.md)—— 原本只有 `truncate` 沒有 tooltip,
                長值被裁掉就再也讀不到。改消費 truncated-text primitive(截斷才顯,未截斷靜默)。 */}
            {displayValue == null
              ? emptyDisplay
              : <TruncatedText>{displayValue}</TruncatedText>}
          </span>
        </div>
      )
    }

    const frame = (
      <div
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, variant: variant, size, error: resolvedError, width: hug ? undefined : fieldWidthVariant(width) }),
          // 整個外框都是輸入處:文字游標 + 點內距 / 邊框 / 前置圖示就聚焦 input(待辦總帳 N53③;
          // 規則 owner field-controls.spec.md「點擊與游標原則」;共用實作 field-wrapper.tsx focusFieldInputFromChrome)。
          // 停用不掛:停用的外框自己是 cursor-not-allowed(field-wrapper disabled compound),而且不接受焦點。
          resolvedMode !== 'disabled' && FIELD_TEXT_ENTRY_CURSOR,
          // hug:wrapper 縮到 inline-flex + w-auto,讓寬度由 startIcon + input(field-sizing: content)+ endAction 自然累加
          hug && 'inline-flex w-auto',
          className,
        )}
        style={fieldWidthStyle(width)}
        onMouseDown={focusFieldInputFromChrome}
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
          ref={setRef}
          type="text"
          id={inputId}
          value={resolved}
          readOnly={resolvedMode === 'readonly'}
          disabled={resolvedMode === 'disabled'}
          aria-invalid={resolvedError || undefined}
          aria-required={fieldCtx?.required || undefined}
          aria-describedby={ariaDescribedBy}
          aria-errormessage={ariaErrorMessageProp ?? (resolvedError ? fieldCtx?.errorId : undefined)}
          className={cn(
            bareInputStyles,
            resolvedMode === 'disabled' && 'text-fg-disabled placeholder:text-fg-disabled cursor-not-allowed',
            // hug:input 本身 field-sizing:content(Chrome 123+ / Safari 17.4+),寬度跟 value 文字寬。
            // w-auto 關掉預設 w-full;min-w-0 讓 flex shrink 不卡住。
            hug && '[field-sizing:content] w-auto min-w-0',
          )}
          {...props}
          // 置於 {...props} 後:寫回 resolved SSOT(controlled 時 useControllable 內部為 no-op)再轉發 consumer onChange。
          onChange={(e) => {
            setResolved(e.target.value)
            props.onChange?.(e)
          }}
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
    // 沒開計數、或在 Field 裡(計數由 Field 畫):只有框,DOM 跟以前一樣
    if (!charCount.standalone || !charCount.countId) return frame
    // 單獨用:框 + 計數那一行包在同一層 `flex-col gap-1`(= Field 欄內的排法,框下 4px;同 link-input.tsx 單獨用的錯誤說明),
    // 寬度跟框同一套:fill 撐滿 / 數字 = 固定寬 / hug 跟框一起縮到內容寬。這一層一律存在(開了計數就包),打字時框不重掛。
    return (
      <div
        className={cn('flex flex-col gap-1 min-w-0', hug ? 'w-fit max-w-full' : typeof width === 'number' ? 'max-w-full' : 'w-full')}
        style={fieldWidthStyle(width)}
      >
        {frame}
        <FieldDescriptionRow count={charCount.standalone} countId={charCount.countId} />
      </div>
    )
  }
)
Input.displayName = 'Input'

// Phase B1(2026-05-05):InputDisplay 退場。改用 `<Input mode="view" value={...} />`
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
    // (2026-07-09 `bare` variant 退役 — 見 field-types.ts FieldVariant note)
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
