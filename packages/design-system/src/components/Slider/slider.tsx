import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { useFieldContext, useResolvedFieldDisabled, useResolvedFieldMode } from '@/design-system/components/Field/field-context'

/**
 * Slider — 數值範圍選取器
 *
 * 基於 Radix Slider primitive,橋接設計系統 token。詳細設計原則見 `slider.spec.md`。
 *
 * ── 核心設計 ──
 * 1. **視覺單一**:track 厚度、thumb 直徑、thumb 邊框都是固定值,不隨 `size` 變
 * 2. **`size` 只控容器外高**:對齊 Field family 的 `h-field-*` tier,讓 Slider 能跟
 *    Input / NumberInput / Select 在 Field 內並排對齊
 * 3. **Range mode 免費**:Radix 原生支援 `value: number[]`,傳多值自動多 thumb
 * 4. **Hover / active 用 elevation 陰影**:不用色變,避免暗示「這是 button」
 */

const sliderRootVariants = cva(
  // 容器外層:水平置中 + relative(Radix 會絕對定位內部元素)
  // flex items-center 讓 track+thumb 在任何 field-height 下都垂直置中
  //
  // ── Disabled 策略:灰階 token swap(對齊 Button / Checkbox)──
  // Slider 的藍色 range 是美學視覺,不是 semantic state——使用者從 disabled
  // slider 需要辨識的是 thumb 位置 + range 長度,這兩者不依賴顏色。失去藍色
  // 沒有資訊損失。
  //
  // 跟 Switch 的差別:Switch 的 on/off 是純顏色差異(沒有形狀差異),所以必須
  // 靠 opacity 保留色彩身分。Slider 的位置/長度是形狀差異,不需要保留顏色身分,
  // 跟 Checkbox(checkmark 形狀 = semantic 載體)同類,應該走灰階。
  //
  // 詳細判準見 `slider.spec.md` 的「Disabled 策略」章節。
  [
    'relative flex items-center w-full min-w-0 touch-none select-none',
    'data-[disabled]:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-field-sm',
        md: 'h-field-md',
        lg: 'h-field-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

export interface SliderProps
  // 'orientation' 一併 Omit(2026-07-07 deep-audit A.1b 殘項):spec「不支援 vertical」宣稱的
  // 型別面機械封鎖 — DS 樣式(track h-1 / w-full / items-center)假設 horizontal,透傳 vertical 壞版。
  extends Omit<React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, 'children' | 'orientation'>,
    VariantProps<typeof sliderRootVariants> {}

// code-quality-allow: long-function — foundational composite(thumb-count 推導 + Field disabled 整合 + multi-mode render)
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, size, value, defaultValue, 'aria-label': ariaLabel, ...props }, ref) => {
  // Field 家族整合:被 <Field mode="disabled"> 包裹時自動 disabled(per slider.spec.md「Slider 作為 Field
  // 家族整合時繼承其 canonical」)。Slider 已有完整 data-[disabled] 視覺,故只需把 fieldCtx disabled 接上。
  // 2026-06-08 SSOT:讀 useResolvedFieldDisabled()(fieldCtx.disabled)→ <Field disabled> 與 <Field mode="disabled"> 都生效
  // 2026-06-12 補:<Field mode="readonly"> → 鎖互動保留視覺(readonly ≠ disabled,不降色)
  const fieldDisabled = useResolvedFieldDisabled()
  const fieldMode = useResolvedFieldMode({ mode: undefined, disabled: undefined, readOnly: undefined })
  const fieldReadonly = fieldMode === 'readonly'
  // 2026-06-10 a11y:Field 內 Slider thumb(role=slider)無 accessible name(deep-audit axe 抓 aria-input-field-name)
  // → 預設接 FieldLabel(aria-labelledby),consumer ariaLabel 優先。對齊 rating/time-picker labelId 接線。
  const fieldLabelId = useFieldContext()?.labelId
  // 推導要渲染幾個 thumb:controlled 用 value,uncontrolled 用 defaultValue,
  // 都沒有時 fallback 單 thumb(Radix 預設行為)
  const thumbCount =
    (Array.isArray(value) && value.length) ||
    (Array.isArray(defaultValue) && defaultValue.length) ||
    1

  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      className={cn(sliderRootVariants({ size }), fieldReadonly && 'pointer-events-none', className)}
      {...props}
      disabled={(props as { disabled?: boolean }).disabled || fieldDisabled}
      // <Field mode="readonly"> cascade(2026-06-12 補):鎖互動、保留正常視覺(readonly
      // 不降色;值仍可讀)。pointer-events-none 擋滑鼠,thumb tabIndex=-1 擋鍵盤。
      data-readonly={fieldReadonly || undefined}
    >
      {/*
        Track — rest 用 bg-secondary(n-3,「微淡可辨」),disabled 用 bg-muted(n-2,退化)。
        跟 Tag neutral / Badge low 同家族。
      */}
      <SliderPrimitive.Track className={cn(
        'relative grow overflow-hidden rounded-full h-1',
        // Rest:bg-secondary(n-3,「微淡可辨」的 subtle fill,跟 Tag neutral / Badge low 同級)
        // Disabled:bg-muted(n-2,「disabled-like 退化」底色)
        'bg-secondary data-[disabled]:bg-muted',
      )}>
        {/*
          Range — 填滿段。

          ── Range 色 = Thumb border 色(語意一致) ──
          Rest 兩者都是 `primary`,disabled 兩者都是 `border`(n-5)。為什麼要一致?
          Range 是「填充視覺」,Thumb border 是「thumb 的輪廓線」——視覺上 thumb
          的 border 剛好是 range 的延續(thumb 坐落在 range 的端點上,border 跟
          range 在色彩上融為一體,看起來像「range 包住 thumb」而不是「thumb 浮在
          range 上」)。兩個 token 綁在一起 —— **同色綁定 scope = rest 與 disabled 兩態**;
          互動態(hover/active/focus)只動 thumb border 色階,range 填色恆 primary
          (詳下方 Thumb 註解 2026-07-06 retract)。
        */}
        <SliderPrimitive.Range
          className={cn(
            'absolute h-full bg-primary',
            'data-[disabled]:bg-border',
          )}
        />
      </SliderPrimitive.Track>

      {/*
        Thumb — N 個(由 thumbCount 決定)。
        白底 + 2px 邊框,邊框色 = Range 色(**一致綁定**):
          - Rest: `border-primary` ↔ Range `bg-primary`
          - Disabled: `border-border` ↔ Range `bg-border`
        這個一致性讓 thumb border 跟 range 融為一體,看起來像「range 包住 thumb」
        的連續視覺。**同色綁定 scope = rest 與 disabled 兩態**;互動態(hover/active/focus)
        只動 thumb border 色階(+ elevation),range 填色恆定 —— 2026-07-06 修正原
        「不論 state 永遠同色」過度宣稱(hover/active 一直都只動 thumb,claim 與 code 不符)。

        **Thumb bg 兩態(2026-06-12 user 拍板,深色模式破洞修正)**:
          - Rest/hover/active:`bg-on-emphasis`(固定白、深淺主題不反轉)— 對齊自家
            Switch thumb(switch.tsx bg-on-emphasis)+ Radix Themes(thumb 字面 white
            無 dark override)+ Apple iOS(深色模式旋鈕仍白)。原 `bg-surface` 在深色
            = 8% 白半透明 → thumb 變深色破洞且 track 穿透。
          - Disabled:`bg-canvas`(不透明頁面背景色)— 沉回背景表達「不可動」,
            = Radix disabled thumb 用 gray-1(app background)同款;不透明故 track
            不穿透。不可用 bg-muted(曾踩 thumb 跟 track 同色融合 bug;canvas 與
            track 的 muted 隔 n-5 邊框 + 不同值,不融)。
      */}
      {Array.from({ length: thumbCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          tabIndex={fieldReadonly ? -1 : undefined}
          aria-readonly={fieldReadonly || undefined}
          className={cn(
            'block h-4 w-4 shrink-0 rounded-full cursor-grab',
            'bg-on-emphasis border-2 border-primary',
            'transition-all duration-150',
            // Hover:border 升 hover 階(light mode 淺一階 lift,= Button primary hover 變色邏輯)
            // + elevation 陰影。2026-07-06 修語:原註解寫「加深」但 primary-hover 比 base 淺,
            // 措辭與 token 相反 — token 不遷就錯註解,註解修正。
            'hover:border-primary-hover hover:[box-shadow:var(--elevation-100)]',
            // Active(按壓拖曳):深一階 primary-active(= Button active 邏輯 button.tsx active:*-active
            // 對照組;原誤用 hover 階 = 全 DS 唯一 active-用-hover 偏移,2026-07-06 雙向全掃修正)
            'active:cursor-grabbing active:border-primary-active active:[box-shadow:var(--elevation-200)]',
            // Focus:跟 hover 同視覺(hover 階),不加 ring 或 halo
            'outline-none focus-visible:border-primary-hover',
            // Disabled:border 跟 Range 一起退成 border(n-5),bg 沉回 canvas(不透明背景色)
            'data-[disabled]:cursor-not-allowed data-[disabled]:border-border data-[disabled]:bg-canvas',
            'data-[disabled]:hover:[box-shadow:none]',
          )}
          // aria-label 策略(對齊 WAI-ARIA APG multi-thumb slider + Radix 原生語意標籤):
          //   - consumer 傳 ariaLabel:單 thumb → 原樣;多 thumb → `{label} (N)` 區分
          //   - 沒傳 ariaLabel:回傳 undefined,讓 Radix getLabel 提供語意標籤
          //     (2 thumb → Minimum/Maximum;>2 thumb → Value N of M;單 thumb → 無)
          //     比硬寫 `Thumb N` 更語意化,且讓「繼承 Radix a11y 預設」名實相符
          aria-label={
            ariaLabel
              ? thumbCount > 1
                ? `${ariaLabel} (${i + 1})`
                : ariaLabel
              : undefined
          }
          aria-labelledby={!ariaLabel && fieldLabelId ? fieldLabelId : undefined}
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = 'Slider'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const sliderMeta = {
  component: 'Slider',
  family: null, // self-contained(對齊 spec;同 rating.tsx 慣例),
  variants: {},
  // size 只控容器外高,對齊 Field family h-field-*(md density:28/32/36px,uiSize.css)。
  // track 厚度 / thumb 直徑固定不隨 size 變,故無 iconSize / typography。
  // fieldHeight key 對齊 compile-stories.mjs 消費 schema(同 Button/Checkbox/Switch)。
  sizes: {
    sm: { fieldHeight: 28, when: 'Toolbar / inline 編輯' },
    md: { fieldHeight: 32, when: '預設 — Form / cell inline edit' },
    lg: { fieldHeight: 36, when: 'Marketing / 高 touch 區' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-primary', 'bg-secondary', 'bg-on-emphasis', 'bg-canvas'],
    fg: [],
    ring: [],
  },
} as const

export { Slider, sliderRootVariants }
