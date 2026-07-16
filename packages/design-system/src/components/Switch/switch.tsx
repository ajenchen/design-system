// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { Check } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { useFieldContext, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldSize } from '@/design-system/components/Field/field-context'
import { fieldWrapperStyles } from '@/design-system/components/Field/field-wrapper'
import { BooleanValueIcon } from '@/design-system/components/SelectionControl/boolean-value'

/**
 * Switch — 開關控件
 *
 * ── 結構 ──
 *   Track（pill 形容器）→ Thumb（白色圓 + 2px border + check icon）
 *   Track 寬 = 2 × 高，thumb 直徑 = track 高度
 *
 * ── 尺寸（sm = md）──
 *   sm/md: track 20×40, thumb 20, 白色圓 16, check 12（= checkbox sm/md）
 *   lg:    track 24×48, thumb 24, 白色圓 20, check 16（= checkbox lg）
 *
 * ── 視覺狀態 ──
 *   OFF: track border (neutral-5), thumb 白色 + 2px border-border(neutral-5,與 OFF track 同色)無 check
 *   ON:  track primary, thumb 白色 + 2px primary border + primary check icon
 *   disabled: opacity-disabled（整體透明度）
 *   readOnly(standalone): 視覺同一般態，但 pointer-events-none + aria-readonly
 *   readOnly(Field 內): 渲染 readonly 灰框 + 勾/叉 icon(2026-06-12 拍板,= Input readonly 同視覺語言)
 *
 * ── label / description / readOnly ──
 * Switch 可以透過 `label` 和 `description` props 在元件內直接渲染緊鄰的文字，
 * 樣式全部 codify 在元件內（text-body、foreground/fg-secondary、disabled 色）。
 *
 * 單獨使用時：
 *   <Switch label="啟用通知" description="收到新訊息時提醒" />
 *
 * Form 內使用（在 <Field> context 內）：
 *   <Field>
 *     <FieldLabel>啟用通知</FieldLabel>
 *     <Switch />                      ← label/description prop 會被自動忽略
 *     <FieldDescription>收到新訊息時提醒</FieldDescription>
 *   </Field>
 *
 * Field context 透過 useFieldContext() 偵測，避免雙層 label。
 *
 * readOnly 模式：
 *   <Switch readOnly checked={true} label="..." />
 *   standalone:視覺維持 ON/OFF 正確狀態,但無法互動、不在 tab order 內、寫入 aria-readonly。
 *   Field 內:渲染 readonly 灰框 + 勾/叉 icon(不渲染 toggle;見 forwardRef 內 readonly 分支)。
 *   與 disabled 的差異：readonly 不降色（可讀），disabled 降色（弱化）。
 */

const switchVariants = cva(
  [
    'group peer inline-flex shrink-0 cursor-pointer items-center rounded-full',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-disabled',
    // readOnly：鎖定互動但視覺正常
    'data-[readonly=true]:pointer-events-none data-[readonly=true]:cursor-default',
    // OFF → ON 背景色
    'data-[state=unchecked]:bg-border',
    'data-[state=checked]:bg-primary',
    // 選中之上的 hover = 同色相升 hover 階(2026-07-06 user 掃出 Switch 是「藍色選中家族」
    // 唯一漏網:Checkbox checked hover 早有同款、Ant Switch checked hover = colorPrimaryHover
    // 源碼實錘;順修 meta states 宣稱 'hover' 但 code 原本零 hover 樣式的 claim-vs-code 落差)。
    // unchecked hover:border(n-5)→ border-hover(n-6)深一階,對齊 Checkbox 未選 hover
    // 加深一階慣例 + Ant unchecked hover(colorTextTertiary 加深)同方向。
    'data-[state=unchecked]:hover:bg-border-hover',
    'data-[state=checked]:hover:bg-primary-hover',
  ],
  {
    variants: {
      size: {
        sm: 'h-5 w-10',   // 20×40
        md: 'h-5 w-10',   // 20×40
        lg: 'h-6 w-12',   // 24×48
      },
    },
    defaultVariants: { size: 'md' },
  }
)

const SPECS: Record<string, { thumb: number; check: number; checkStroke: number }> = {
  // checkStroke:16px 以下 icon 視覺不夠顯眼 → 加粗 stroke 補償(跟 Checkbox 共用原則,
  // 見 checkbox.tsx 的 checkStrokeWidth 註解)。12px 用 3.5(render ≈ 1.75px 線寬,比 Lucide
  // 預設的 1px render 明顯更粗,視覺跟 16px 預設 stroke 的 1.33px 有足夠區別),16px 用 2.5
  // (render ≈ 1.67px,比預設 1.33px 稍粗讓 toggle check 夠顯眼)。跨 size 配對值由 checkbox.tsx 共用。
  // 2026-05-18 簡化 per user 視覺證 + Checkbox 同步(3.5 → 3 sm/md):effective render 差
  // 0.08px 視覺看不出,保留 compensation 主旨但不過度差異化。
  // 2026-07-04 刪 dead field translate:整檔零消費,實際位移 SSOT = Thumb className
  // translate-x-5(20px)/ translate-x-6(24px)(見下方 Thumb),消除雙住所漂移風險。
  sm: { thumb: 20, check: 12, checkStroke: 3 },
  md: { thumb: 20, check: 12, checkStroke: 3 },
  lg: { thumb: 24, check: 16, checkStroke: 2.5 },
}

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {
  /**
   * Inline label。提供時 Switch 自動包一個 <label> 並連結 htmlFor，
   * 套用 text-body / text-foreground / disabled 色 的 codified 樣式。
   * 在 <Field> context 內時此 prop 會被忽略（由 FieldLabel 接管）。
   */
  label?: React.ReactNode
  /**
   * Inline description（secondary 文字）。須與 label 搭配使用，
   * 單獨設定 description 無效果。套用 text-body / text-fg-secondary 樣式。
   * 在 <Field> context 內時此 prop 會被忽略（由 FieldDescription 接管）。
   */
  description?: React.ReactNode
  /**
   * readonly 模式:standalone = 鎖定互動但維持 ON/OFF 視覺;Field 內 = 灰框 + 勾/叉 icon。
   * 與 disabled 的差異:readonly 不降色(可讀),disabled 降色(弱化)。
   * DataTable cell 非編輯態用 mode="view"(勾/叉 icon),非 readOnly。
   */
  readOnly?: boolean
  /**
   * Field mode(2026-05-05 Phase B3 align):
   *   edit     — 一般可互動 Switch(預設)
   *   display  — **純展示**:渲染 勾/叉 icon(無互動 primitive、無 input chrome);
   *              對齊 Carbon read-only / DataTable boolean cell。
   *              `display` 完全無 toggle 形體;`readonly` 視場景(field-types.ts)。
   *   readonly — standalone 同 readOnly prop(保留視覺鎖互動);Field 內 = 灰框 + 勾/叉 icon
   *   disabled — 同 disabled prop
   */
  mode?: FieldMode
  /**
   * Visual chrome — Switch 本體無 input wrapper variant,本 prop 對 Switch 主體無視覺影響;
   * 為對齊 Field 4-mode + chrome 透傳契約而保留(M19 一致性)。
   */
  variant?: FieldVariant
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(
  (
    {
      className,
      size,
      label,
      description,
      readOnly = false,
      disabled: disabledProp,
      mode,
      // chrome 對 Switch 主體無視覺影響(無 input wrapper)— 接收純為 prop 一致性;destructure 防 leak 到 DOM。
      variant: _chrome,
      id: idProp,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const spec = SPECS[sizeKey]

    // Field context 偵測：在 Field 內時忽略自己的 label/description，避免雙層
    // 2026-05-31 #35:hooks(useFieldContext / useId)必在任何 conditional return 前呼叫(Rules of Hooks)。
    // 原 mode='view' early return 寫在 hooks 之上 → runtime 切 mode 會 hook count 不一致 crash;已下移至 hooks 後。
    const fieldCtx = useFieldContext()
    // 2026-06-08 SSOT:<Field disabled>/<Field mode> cascade(原 disabled/mode 直傳 prop,漏 fieldCtx)
    const disabled = useResolvedFieldDisabled(disabledProp)
    const resolvedMode = useResolvedFieldMode({ mode, disabled, readOnly })
    const effectiveReadOnly = readOnly || resolvedMode === 'readonly'
    // mode='disabled' 直傳(無 Field ctx 的 cell 場景)必須落到真 disabled chrome(同 Checkbox 2026-06-12 修)
    const effectiveDisabled = disabled || resolvedMode === 'disabled'
    // readonly 灰框 size:走 SSOT resolver(prop > ctx > 'md',field-context.ts:150-161)
    const resolvedBoxSize = useResolvedFieldSize(size ?? undefined, 'md') as 'sm' | 'md' | 'lg'
    const insideField = fieldCtx?.hasFieldWrapper === true
    const effectiveLabel = insideField ? undefined : label
    const effectiveDescription = insideField ? undefined : description

    // 在 horizontal Field 內自動齊右(iOS / macOS Settings canonical):
    // horizontal Field 的 layout 是 label(固定寬)| control area(fill),Switch 作為
    // trailing control 應靠右(對齊 horizontal DescriptionItem 的「label 左 / value 右」模式)。
    // 世界級對照:iOS Settings / macOS System Settings / GitHub Settings / Figma prefs
    // 一律 switch 齊右 — 視覺掃描快、對齊一致。
    const alignRightInField =
      insideField && fieldCtx?.orientation === 'horizontal' ? 'ml-auto' : ''

    // Id 連結：優先使用 prop，再退到 Field context 的 id，最後用 useId 生成
    const generatedId = React.useId()
    const inputId = idProp ?? fieldCtx?.id ?? generatedId

    // 2026-07-04 修:display / readonly-in-Field 分支的裸 span/div 原丟棄剩餘 props
    // (id/data-*/aria-*)且不轉發 forwardRef ref → consumer 的 aria-label 等靜默失效。
    // 抽出 Radix 專屬 non-DOM props,其餘 DOM props 於兩分支 spread 轉發(與 Checkbox/
    // RadioGroup 同修);edit 主路徑不受影響(rootEl 仍 spread 完整 props)。
    const {
      checked: checkedProp,
      defaultChecked: defaultCheckedProp,
      onCheckedChange: _onCheckedChange,
      required: _required,
      name: _name,
      value: _value,
      asChild: _asChild,
      children: _children,
      ...restDomProps
    } = props

    // ── mode='view'(下移至所有 hooks 之後,per #35 Rules of Hooks)──────────
    // 純展示模式:無互動 toggle、渲染 Check / X icon。與 Checkbox display 對齊(同 boolean primitive,
    // 共用 SelectionControl/boolean-value.tsx SSOT — 勾/叉 icon + 中性 foreground 色)。
    if (resolvedMode === 'view') {
      const isChecked = checkedProp === true
      return (
        <span {...restDomProps} ref={ref as React.Ref<HTMLSpanElement>} className="inline-flex">
          <BooleanValueIcon checked={isChecked} size={resolvedBoxSize} />
        </span>
      )
    }

    // ── mode='readonly' in Field(2026-06-12 拍板「灰框 + 勾/叉」,與 Checkbox 同款;2026-07-09 glyph → Check/X icon)──
    // Field 內 readonly boolean = fieldWrapperStyles readonly 灰框(= Input readonly 同源)
    // + 勾/叉 icon 值語言;standalone readOnly(settings list)維持原樣鎖互動。詳 checkbox.tsx 同段註解。
    if (effectiveReadOnly && insideField) {
      const isChecked = (checkedProp ?? defaultCheckedProp) === true
      const boxSize = resolvedBoxSize
      return (
        <div
          {...(restDomProps as React.HTMLAttributes<HTMLDivElement>)}
          ref={ref as React.Ref<HTMLDivElement>}
          role="switch"
          aria-checked={isChecked}
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
          <BooleanValueIcon checked={isChecked} size={boxSize} />
        </div>
      )
    }

    const rootEl = (
      <SwitchPrimitives.Root
        id={inputId}
        className={cn(switchVariants({ size }), alignRightInField, className)}
        ref={ref}
        disabled={effectiveDisabled}
        aria-readonly={effectiveReadOnly || undefined}
        data-readonly={effectiveReadOnly || undefined}
        tabIndex={effectiveReadOnly ? -1 : undefined}
        aria-describedby={fieldCtx?.descriptionId}
        {...props}
        // 2026-07-05 D4 修:readOnly 鎖互動補 label 繞道 — <label htmlFor> 的 synthetic click
        // 不是 pointer event,cva pointer-events-none 攔不到,點 label 文字仍 toggle。
        // preventDefault 讓 Radix composeEventHandlers(checkForDefaultPrevented)跳過內部 toggle;
        // 必列在 {...props} 之後才不被 consumer onClick 覆蓋(與 Checkbox/RadioGroupItem 同修)。
        onClick={(event) => {
          if (effectiveReadOnly) {
            event.preventDefault()
            return
          }
          props.onClick?.(event)
        }}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            'pointer-events-none flex items-center justify-center rounded-full bg-on-emphasis border-2',
            'transition-all duration-150',
            'data-[state=unchecked]:translate-x-0 data-[state=unchecked]:border-border',
            'data-[state=checked]:border-primary',
            sizeKey === 'lg' ? 'data-[state=checked]:translate-x-6' : 'data-[state=checked]:translate-x-5',
          )}
          style={{ width: spec.thumb, height: spec.thumb }}
        >
          {/* Check icon — Radix Thumb inherits data-state from Root */}
          <Check
            size={spec.check}
            strokeWidth={spec.checkStroke}
            className="text-primary opacity-0 transition-opacity duration-150 group-data-[state=checked]:opacity-100"
            aria-hidden
          />
        </SwitchPrimitives.Thumb>
      </SwitchPrimitives.Root>
    )

    // 無 label → 只渲染 switch 本體
    if (effectiveLabel == null) return rootEl

    // 有 label → 包 <label> + codified 樣式
    // Switch 慣例：label 在左、switch 在右（對齊 iOS / Polaris / Material 標準）
    // label 行第一行對齊 switch 中線：容器用 items-start + switch 包 h-[1lh] flex-center
    return (
      <label
        htmlFor={inputId}
        // 2026-07-05 D4 修:readOnly 時在 label 端取消 synthetic activation(第一道防線;
        // Root onClick guard 為第二道 — 兩道對齊 finding suggestion 防 consumer 自寫 label 繞過)。
        onClick={(event) => {
          if (effectiveReadOnly) event.preventDefault()
        }}
        className={cn(
          'inline-flex items-start gap-3 select-none',
          effectiveDisabled ? 'cursor-not-allowed' : readOnly ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        {/* Label↔desc gap typography-mode-aware:
            sm/md = reading(body+body 14/1.5),lg = reading-lg(body-lg+body 14/1.5) */}
        <span
          className={cn(
            'flex-1 min-w-0 flex flex-col',
            sizeKey === 'lg'
              ? 'gap-[var(--item-gap-label-desc-reading-lg)]'
              : 'gap-[var(--item-gap-label-desc-reading)]',
          )}
        >
          <span
            className={cn(
              // Reading mode 字級:lg → text-body-lg (16px),sm/md → text-body (14px)
              sizeKey === 'lg' ? 'text-body-lg' : 'text-body',
              effectiveDisabled ? 'text-fg-disabled' : 'text-foreground'
            )}
          >
            {effectiveLabel}
          </span>
          {effectiveDescription != null && (
            <span
              className={cn(
                effectiveDisabled ? 'text-fg-disabled' : 'text-fg-secondary'
              )}
              // Reading mode description:**最小 14px**(spec 14→14px, 16→14px),lh 預設 1.5。
              // 用 inline style 直接繞過 tailwind-merge 對 text-body / text-fg-* 的潛在衝突。
              style={{ fontSize: 'var(--font-body-size)' }}
            >
              {effectiveDescription}
            </span>
          )}
        </span>
        {/* @row-slot-handcraft-allow: Field 控件的 1lh 首行對齊 wrapper(selection-control 家族 Checkbox/RadioGroup 同構),非 row item slot,不消費 MenuItem */}
        <span className="h-[1lh] flex items-center shrink-0">
          {rootEl}
        </span>
      </label>
    )
  }
)
Switch.displayName = SwitchPrimitives.Root.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const switchMeta = {
  component: 'Switch',
  family: null, // self-contained primitive(對齊 spec frontmatter self-contained + body L31;非 Family 4)
  variants: {

  },
  sizes: {
    sm: { fieldHeight: 28, iconSize: 12, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 12, typography: 'body' },
    lg: { fieldHeight: 36, iconSize: 16, typography: 'body-lg' },
  },
  // 2026-07-04 修 stale meta:移除 'active' — switchVariants / Thumb 無 active-state 樣式
  // (cva 只有 unchecked/checked/disabled/readonly/focus-visible;對照 checkboxMeta 正確不含 active)
  // 'checked' = ON 持續態(bg-primary;2026-07-07 meta 詞彙統一補列,toggle 家族用 'checked')
  states: ['default', 'hover', 'checked', 'focus-visible', 'disabled'],
  tokens: {
    // 2026-07-04 補齊漏列:bg-border = OFF track(cva data-[state=unchecked]:bg-border)、
    // bg-on-emphasis = Thumb 白圓(Thumb className)— 兩者 code 實際消費,meta 原漏列
    bg: ['bg-border', 'bg-on-emphasis', 'bg-primary'],
    fg: ['text-fg-disabled', 'text-fg-secondary', 'text-foreground', 'text-primary'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { Switch, switchVariants }
