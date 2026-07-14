// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal } from '@/design-system/components/Field/field-types'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import { useControllable } from '@/design-system/hooks/use-controllable'

/**
 * Textarea — 多行文字輸入
 *
 * ── 定位 ────────────────────────────────────────────────────────────────
 * 多行版本的 Input，edit / display / readonly / disabled 四態與 Input 邏輯一致(Phase B1 2026-05-05)。
 * 不同於 Input：
 *   - 沒有固定 field-height（高度由 rows 或 min-h 決定）
 *   - 沒有 startIcon / endAction（textarea 慣例不放 icon）
 *   - readonly 呈現保留邊框與 padding，只改底色，讓多行文字有合理閱讀區
 *   - display 渲染 <div> + white-space:pre-wrap 保留多行文本
 *
 * ── Padding 規則 ───────────────────────────────────────────────────────
 * 多行內容必須有上下內距才能閱讀舒適。不沿用 Input 的 items-center，
 * 改用 py-2（8px）固定上下內距 + px-[var(--field-px)]（12px token，左右內距 SSOT，與 Input/Field family 一致）。
 *
 * ── Size ────────────────────────────────────────────────────────────────
 * sm / md → text-body（14px）
 * lg      → text-body-lg（16px）
 *
 * ── rows / min-h ───────────────────────────────────────────────────────
 * 預設 rows={3}。消費者可透過 rows prop 調整，或透過 min-h-* className 覆寫。
 */

// Phase B1(2026-05-05):chrome variant(default / naked;`bare` 2026-07-09 退役),mode×chrome 的
// chrome 規則由 compoundVariants 決定,鏡射 fieldWrapperStyles 對齊 canonical(Phase D 將整併進 fieldWrapperStyles)。
const textareaVariants = cva(
  [
    'w-full rounded-md',
    'text-foreground font-normal',
    'outline-none resize-y',
    'placeholder:text-fg-muted',
    // K10 fix(2026-05-04):disabled 時 placeholder + text 切 fg-disabled(parallel 到 bareInputStyles)
    //   Textarea 自身 `<textarea disabled>` 帶 disabled HTML attribute,用 `disabled:` variant 直接命中
    'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled',
    'px-[var(--field-px)] py-2',
    'transition-colors duration-150',
  ],
  {
    variants: {
      mode: {
        edit: '',
        display: '',
        readonly: '',
        disabled: '',
      },
      // chrome 對齊 fieldWrapperStyles.variant(default / naked;2026-07-09 `bare` 退役)。
      variant: {
        default: '',
        naked: '',
      },
      size: {
        sm: 'text-body',
        md: 'text-body',
        lg: 'text-body-lg',
      },
      // error(2026-07-04 Q1,鏡射 fieldWrapperStyles error variant;Phase D 整併時一起收)
      error: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      // default chrome × mode
      {
        mode: 'edit',
        variant: 'default',
        className: [
          'bg-surface border border-border',
          'hover:border-border-hover',
        ],
      },
      { mode: 'edit', variant: 'default', error: false, className: 'focus-within:!border-primary focus-within:hover:!border-primary' },
      {
        mode: 'display',
        variant: 'default',
        // 2026-05-13 Q3 Path Ⅰ:Textarea default display zero chrome,!px-0 !py-0 override base `px-[var(--field-px)] py-2`
        // (跟 Input 同 SSOT,per field-controls.spec.md (d))
        className: 'bg-transparent border border-transparent !px-0 !py-0',
      },
      {
        mode: 'readonly',
        variant: 'default',
        // 2026-07-13 a11y(WCAG 2.4.7):readonly 有值渲 native <textarea readOnly> 可鍵盤聚焦,base
        //   outline-none + border-transparent 無焦點指示 → 鏡射 field-wrapper.tsx readonly ring idiom
        //   (field-controls.spec.md「readonly focus ring」)。textarea 為裸 focusable element,直接用
        //   focus-visible:(非 :has()),僅鍵盤聚焦顯示、滑鼠點擊不觸發。
        className: 'bg-readonly border border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      },
      {
        mode: 'disabled',
        variant: 'default',
        className: 'bg-disabled border border-transparent cursor-not-allowed text-fg-disabled',
      },
      // (2026-07-09 `bare` chrome × mode compounds 退役已移除;error:true 為 variant-agnostic 保留)
      {
        mode: 'edit',
        error: true,
        className: 'border-error hover:border-error-hover focus-within:!border-error focus-within:hover:!border-error',
      },
      // (2026-07-09 display×bare / readonly×bare / disabled×bare compounds 退役已移除)
      // naked chrome × mode — cell-as-input substrate(2026-05-06 v14 revert v12)。
      //   v12 `!absolute -inset-px` autoRowHeight 不相容 → revert v9 baseline + 保留 v13.3
      //   focus !important。focus-visible 用 textarea 自身 selector(focusable element)。
      {
        mode: 'edit',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !resize-none !h-full',
          '!px-[var(--table-cell-px)] !py-[var(--table-cell-py)]',
          'border border-border',
          'hover:border-border-hover',
          // textarea UA stylesheet 預設 line-height: normal(1.2-1.5 不定),會跟 display
          // `<div>` text-body line-height: 1.5(21px @ 14px)不一致 → cell 進 edit 後 height
          // shift。顯式 leading 對齊 div 行為。
          '!leading-[1.5]',
        ],
      },
      { mode: 'edit', variant: 'naked', error: false, className: 'focus-visible:!border-primary focus-visible:hover:!border-primary' },
      // 2026-05-13 Q1 R4 verify(per codex Q1 verdict 補 Textarea nuance):
      // Textarea naked display/readonly/disabled 用 `!h-full`,**不**對齊 Field wrapper 的 `!h-auto`。
      // Why divergence:textarea 是 native form element 帶 intrinsic rows-based height,且 cell 內
      // multi-line text 需要撐滿 cell 而非依 line-height intrinsic。`!h-full` 讓 textarea 填滿 cell
      // 高度,文字 anchored to cell.top + cell padding(同視覺結果 Field wrapper autoRow !h-auto)。
      // 此 divergence intentional + documented;非 SSOT violation。
      { mode: 'display', variant: 'naked', className: 'bg-transparent !rounded-none !h-full !resize-none !px-0 !py-0 border border-transparent !leading-[1.5]' },
      { mode: 'readonly', variant: 'naked', className: 'bg-transparent !rounded-none !h-full !resize-none !px-0 !py-0 border border-transparent !leading-[1.5]' },
      // 2026-05-13 codex V2 fix:移除 `opacity-disabled` blanket(對齊 field-wrapper.tsx naked R3 fix +
      //   color.spec.md:729 逃生艙 rule)。Textarea 已用具體 `text-fg-disabled` token,不需要 wrapper opacity。
      { mode: 'disabled', variant: 'naked', className: 'bg-transparent !rounded-none cursor-not-allowed text-fg-disabled !h-full !resize-none !px-0 !py-0 border border-transparent !leading-[1.5]' },
    ],
    defaultVariants: {
      mode: 'edit',
      variant: 'default',
      size: 'md',
      error: false,
    },
  }
)

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    Omit<VariantProps<typeof textareaVariants>, 'mode' | 'variant'> {
  /** Field display mode */
  mode?: FieldMode
  /**
   * Visual chrome(正交於 mode);Phase B1(2026-05-05)新增。透傳自 FieldContext.variant,per-prop override。
   * - `'default'` — 完整 chrome(form 場景)
   * (2026-07-09 `bare` variant 退役;naked = cell-as-input substrate,@internal)
   * - `'naked'` — 完全無 chrome,cell-as-input(host cell 提供 border + focus frame,對齊 Airtable / Notion / Excel cell editing)
   */
  variant?: FieldVariant
  /** Error 狀態（正交於 mode）。border-error + aria-invalid。 */
  error?: boolean
}

// code-quality-allow: long-function — Textarea forwardRef body 含 mode×size×variant×error 4 軸 prop + autoFocus + aria 完整覆蓋,拆 sub-fn 會把 useFieldContext / fieldWrapperStyles 跨檔 drilling
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error: errorProp = false,
      size: sizeProp,
      className,
      disabled,
      readOnly,
      rows = 3,
      value,
      defaultValue,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    // Field context 整合：disabled / mode / chrome / invalid / size / id 都能從 context 繼承
    const fieldCtx = useFieldContext()
    // chrome 透傳:per-prop override context
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    const error = useResolvedFieldInvalid(errorProp)
    const size = useResolvedFieldSize(sizeProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })
    const emptyDisplay = useFieldEmptyDisplay()
    const isEditable = resolvedMode === 'edit'
    const isDisplay = resolvedMode === 'display'
    const inputId = idProp ?? fieldCtx?.id
    const ariaDescribedBy = ariaDescribedByProp ?? fieldCtx?.descriptionId
    const ariaErrorMessage = ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)

    // ── display mode(+ readonly 空值)純展示,渲染 <div> 取代 <textarea>(white-space:pre-wrap 保留多行) ──
    // 對齊 Carbon read-only / Cloudscape display-mode
    // 2026-07-08 user 拍板:readonly 空值也走 display-div 顯 '-'(readonly **有值** 仍走下方
    // native <textarea readOnly> 保留選取/複製語意 — field-controls.spec.md「null / undefined 值」)。
    // 2026-07-13 fix:空值判斷需認得 uncontrolled defaultValue — readonly / display 也要顯示內容,
    //   不可誤判為空值渲 '-'(原為靜態 value ?? defaultValue)。
    // 2026-07-14 R2(dual-model consensus,同 Input input.tsx):resolved value 改走 useControllable
    // 內部 SSOT(Radix idiom)。原靜態版有 typing-stale gap:uncontrolled 打字後外部切
    // display / readonly 仍顯示 stale defaultValue。uncontrolled 時 native textarea 由
    // value={resolved} 內部驅動(defaultValue 只作初始值,不落 DOM attribute),同時修
    // remount-stale(切 display 再回 edit 從 defaultValue attribute 重掛)+ form.reset() stale
    // (HTML 標準 reset 不發 input event,下方 reset bridge 修)。controlled(傳 value)時
    // useControllable 純 passthrough,行為與原本完全一致。consumer onChange 不接進 hook
    // (保留 native event signature),於 <textarea> onChange 另行轉發。
    const isControlled = value !== undefined
    const [resolved, setResolved] = useControllable<string | number | readonly string[]>({
      value: value as string | number | readonly string[] | undefined,
      defaultValue: defaultValue ?? '',
    })
    const displayValue = resolved != null && resolved !== '' ? String(resolved) : null
    const showDisplaySpan = isDisplay || (resolvedMode === 'readonly' && displayValue == null)

    // form.reset() bridge(uncontrolled only):reset 恢復 defaultValue 但不發 input event →
    // 手動把 resolved 歸位 defaultValue。keyed on showDisplaySpan:display 分支不掛 native
    // textarea,回 edit 重掛時 effect 重跑補掛 listener。
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)
    React.useEffect(() => {
      if (isControlled || showDisplaySpan) return
      const form = innerRef.current?.form
      if (!form) return
      const handleReset = () => setResolved(defaultValue ?? '')
      form.addEventListener('reset', handleReset)
      return () => form.removeEventListener('reset', handleReset)
    }, [isControlled, showDisplaySpan, defaultValue, setResolved])
    // Merge refs(LinkInput setRef idiom,link-input.tsx:138)
    const setRef = React.useCallback((el: HTMLTextAreaElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
    }, [ref])

    if (showDisplaySpan) {
      const spanMode = isDisplay ? 'display' : 'readonly'
      return (
        <div
          id={inputId}
          data-field-mode={spanMode}
          aria-describedby={ariaDescribedBy}
          className={cn(
            textareaVariants({ mode: spanMode, variant: variant, size }),
            'whitespace-pre-wrap break-words',
            displayValue == null && fieldEmptyColorClass(resolvedMode),
            className,
          )}
        >
          {displayValue ?? emptyDisplay}
        </div>
      )
    }

    return (
      <textarea
        ref={setRef}
        id={inputId}
        rows={rows}
        value={resolved}
        disabled={resolvedMode === 'disabled'}
        readOnly={resolvedMode === 'readonly'}
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedBy}
        aria-errormessage={ariaErrorMessage}
        data-field-mode={resolvedMode}
        data-error={isEditable && error ? '' : undefined}
        className={cn(
          textareaVariants({ mode: resolvedMode, variant: variant, size, error }),
          className
        )}
        {...props}
        // 置於 {...props} 後:寫回 resolved SSOT(controlled 時 useControllable 內部為 no-op)再轉發 consumer onChange。
        onChange={(e) => {
          setResolved(e.target.value)
          props.onChange?.(e)
        }}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// sizes 只反映 Textarea 真實控制的軸:typography(size 只控字體,不綁 field-height、無 icon slot —
//   高度由 rows + resize-y 決定,per textarea.spec.md L88-92 / L64 / L113)。
export const textareaMeta = {
  component: 'Textarea',
  family: 4,
  variants: {

  },
  sizes: {
    sm: { typography: 'body' },
    md: { typography: 'body' },
    lg: { typography: 'body-lg' },
  },
  // states 對齊 cva compoundVariants + anatomy ColorMatrix 真實 state 集合;
  //   text input 無 'active'(按下)視覺態(Material/Polaris/Carbon TextArea 共識)。
  //   'focus-visible' 泛指 focus 態:default chrome 實為 focus-within(滑鼠+鍵盤皆亮),naked chrome
  //   為 focus-visible(鍵盤限定),readonly 有值態為 focus-visible ring(見上方 compoundVariants)。
  states: ['default', 'hover', 'focus-visible', 'readonly', 'disabled', 'error'],
  tokens: {
    bg: ['bg-disabled', 'bg-readonly', 'bg-surface'], // 2026-07-04 補:readonly×default cva 實際消費(spec「Readonly 特例」主打 token)
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: [],
  },
  defaultSize: 'md',
} as const

export { Textarea, textareaVariants }
