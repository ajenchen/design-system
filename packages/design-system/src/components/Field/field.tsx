// code-quality-allow: file-size — foundational composite(Field + FieldLabel + FieldDescription + FieldError + context + 8 layout variants),拆檔會讓 Field 家族互相 import 循環
import * as React from 'react'
import { InfoTooltip } from '@/design-system/components/InfoTooltip/info-tooltip'
import { cn } from '@/lib/utils'
// (本行原是 Tooltip 的 import;2026-11-27 標籤旁的 ⓘ 改用公開元件 InfoTooltip,這一行保留成註解,別處以行號引用本檔不位移)

/**
 * Field — 表單欄位佈局容器（shadcn Field 風格:https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/field.tsx#L81 ）
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
 * 透過 labelWidth prop(單一 Field)或 FieldGroup 的同名 labelWidth(整組)→ 直接寫進 grid 的第一欄
 * (2026-11-15 前經 CSS variable --field-label-width 轉一手)。數字 = px,也可以是任何 CSS length（"10rem"、"30%" 等）。預設 "auto" 由 label 內容撐開。
 *
 * ── Required 星號 ──────────────────────────────────────────────────────
 * Field 的 required prop 會透過 context 傳給 FieldLabel 自動渲染 *，
 * 星號為 neutral-7（fg-muted），貼齊 label 文字（無 gap），disabled
 * 時降為 fg-disabled。也可在個別 FieldLabel 覆寫。
 */

// ── Types & Context ──
// Context 定義在 field-context.ts(打斷 circular import)。
// field.tsx 只 import 不 re-export——consumer 直接從 field-context.ts import useFieldContext。(這裡的 consumer 指 DS 內部控件;產品的自訂控件請用公開 hook `useFieldState`,本檔檔尾轉出。)

import type { FieldMode, FieldVariant, FieldOrientation, FieldSize, FieldControlLayout, FieldContextValue } from './field-context'
import { FieldContext, useFieldContext, resolveGroupPreferredSize, FIELD_TEXT_CLASS } from './field-context'
import { FieldDescriptionRow, useFieldCountRegistry } from './field-count'

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

// Label / Description / Error 的字體 = field-context.ts FIELD_TEXT_CLASS(text-body 14px,不隨 field size 變;字數計數同一個值)

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

/**
 * 偵測 control child 的偏好尺寸——control primitive 在自己的檔案掛 static `fieldPreferredSize`
 * (如 InlineEdit = 'sm',view 態無邊框,md 過大會讓版面鬆散),Field 未顯式指定 size 時收此偏好。
 * 對齊 detectControlLayout 讀 `type.fieldLayout` 的機制(first-declared-wins);全部缺宣告 → null。
 */
function detectPreferredSize(controlNodes: React.ReactNode[]): FieldSize | null {
  for (const node of controlNodes) {
    if (!React.isValidElement(node)) continue
    const pref = (node.type as { fieldPreferredSize?: FieldSize } | null | undefined)?.fieldPreferredSize
    if (pref) return pref
  }
  return null
}

/** FieldError 有沒有字可畫(沒字不渲染、不佔位)—— FieldError 自己與 Field「使用端的錯誤有沒有字」共用這一支 */
function hasErrorContent(children: React.ReactNode): boolean {
  return !(children == null || children === false || children === '')
}

// ── Field ───────────────────────────────────────────────────────────────────

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  id?: string
  mode?: FieldMode
  /**
   * 視覺外殼(2026-05-05)。
   * - `default`(預設)— 含 border + bg(一般 form input)
   * - `naked` — cell-as-input(@internal;不在公開 FieldVariant 型別 — 2026-07-14 收窄至 FieldVariantInternal;2026-07-09 `bare` 退役)。edit×naked 自畫 border-based state
   *   machine(rest/hover/focus/error);view×naked 用 transparent border,host cell 提供視覺邊框
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
   * Horizontal mode 的 label 欄寬度。數字 = px(與全 DS 的長度參數同一套,2026-11-15「尺寸:甲」);
   * 也收任何 CSS length 字串（"10rem"、"30%"...——比例寬只能用字串）。預設 'auto' 由 label 內容撐開。
   */
  labelWidth?: number | string
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

// ── FieldGroup Context(cascade horizontal labelWidth + 閱讀情境的範圍)──
// 同一畫面多個 horizontal Field,label 寬度應統一對齊 → FieldGroup 提供 SSOT。
// 下面 Field 組件自動 consume,consumer 可用 Field 的 labelWidth prop 覆寫單行。
//
// 範圍(field.spec.md「閱讀情境」):最外層 FieldGroup;不在組裡的 Field,範圍就是它自己。標籤色、沒有框的值的內縮、同組同高三件事同一個範圍。
// 最外層 FieldGroup 建 `scope`,內層 FieldGroup 原樣往下傳(labelWidth 照舊是最近一層覆寫,scope 不是)。
interface FieldScopeValue {
  /** 同組同高:登記這一列的控件偏好(null = 收回)。key = 該 Field 的 id */
  registerPreferredSize: (key: string, size: FieldSize | null) => void
  /** 整組沒寫 size 的列共用的尺寸(field-context.ts resolveGroupPreferredSize);沒有人登記 = null */
  preferredSize: FieldSize | null
}
interface FieldGroupContextValue {
  labelWidth?: number | string
  /** 有值 = 這個 Field / FieldGroup 在某個 FieldGroup 裡(值 = 最外層那一組的範圍) */
  scope?: FieldScopeValue
}

// 閱讀情境的兩顆元件內變數 --scope-label-color / --scope-value-inset:設在讀它的元素自己身上(標籤 / 沒有框的值)、只有 Field 自己讀;不是 token、不登記
// (tokens/token-system.spec.md「命名」元件內變數)。設值住 ./field.css(閱讀情境唯一的判斷;不設在範圍元素上的理由在該檔檔頭);這裡只讀。名字不用 `--field-` 開頭
// (那一族是共用刻度,field.spec.md「horizontal」labelWidth 段記的稽核 P20),改用掛它的記號 `data-field-scope` 的後半。
// 後備值 = 表單(範圍裡沒有就地編輯、也沒有 Field 層純顯示)與範圍以外(FieldLabel 單獨使用)的樣子,一樣在讀者身上代換、跟著讀者所在的主題。
// 標籤色:閱讀情境(就地編輯或 Field 層純顯示 mode="view")→ fg-secondary,否則 foreground;停用另走 text-fg-disabled(停用優先,M24)
const LABEL_COLOR_CLASS = 'text-[color:var(--scope-label-color,var(--foreground))]'
// 水平排:沒有框的值(開關 / 單一勾選框,掛 FIELD_FRAMELESS_VALUE_ATTR = data-field-frameless-value)往右內縮到同一欄框內的字線;
// 表單範圍 0。字面寫出屬性名(Tailwind 只掃字面 class,不認樣板字串);兩邊同名由 scripts/reading-context-invariant.mjs 靜態段 S2 鎖。
const FRAMELESS_VALUE_INSET_CLASS = '[&_[data-field-frameless-value]]:ml-[var(--scope-value-inset,0px)]'
// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FieldGroupContext = React.createContext<FieldGroupContextValue>({})

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      id: idProp,
      mode = 'edit',
      variant = 'default',
      orientation = 'vertical',
      size: sizeProp,
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

    // FieldGroup cascade:group 的 labelWidth 是 fallback,單行 labelWidth 覆寫;數字 = px
    const groupCtx = React.useContext(FieldGroupContext)
    const scope = groupCtx.scope
    const labelWidthValue = labelWidth ?? groupCtx.labelWidth
    const effectiveLabelWidth = typeof labelWidthValue === 'number' ? `${labelWidthValue}px` : labelWidthValue

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

    // 解析 size：consumer 顯式 > control primitive 偏好(如 InlineEdit='sm')> 預設 md
    //   (對齊 controlLayout 三層優先序;InlineEdit 進 Field 不指定 size 時自動收 sm)
    // 靜態偵測只看得到直接子元件;包 wrapper / memo / HOC 時由 control 於掛載時註冊補位,
    // 讓 Field 的控件槽高度也跟上(control 自身尺寸走 useResolvedFieldSize 同步解析)。
    const [registeredSize, setRegisteredSize] = React.useState<FieldSize | null>(null)
    const registerPreferredSize = React.useCallback((preferred: FieldSize) => {
      setRegisteredSize((current) => (current === preferred ? current : preferred))
    }, [])
    // Control 自己驗出來的錯誤說明(FieldContext.registerControlError;目前只有 LinkInput):使用端的 <FieldError> 有字時以使用端為準,
    // 一個欄位只畫一行。沒有 control 宣告(其他所有用法)時 controlError 一直是 null,畫面不變。
    const [controlError, registerControlError] = React.useState<string | null>(null)
    const consumerErrorShown = errorNodes.some(
      (node) => React.isValidElement<{ children?: React.ReactNode }>(node) && hasErrorContent(node.props.children),
    )
    const controlErrorNode = controlError != null && !consumerErrorShown ? <FieldError>{controlError}</FieldError> : null
    // 字數計數(field-controls.spec.md「字數計數」;2026-11-26 C7):Input / Textarea 開 showCount 時把字數交給 Field(registerControlCount),
    // 說明那一行換成「說明在左、計數在右端」;沒有說明時那一行只有計數。沒有 control 交字數時 controlCount 一直是 null,說明照舊、畫面不變。
    const countId = `${id}-count`
    const [controlCount, registerControlCount] = useFieldCountRegistry()
    const descriptionArea = controlCount
      ? <FieldDescriptionRow description={descriptionNodes} count={{ ...controlCount, disabled: disabled || controlCount.disabled }} countId={countId} />
      : descriptionNodes

    const detectedSize = detectPreferredSize(controlNodes)
    const controlPreferredSize = detectedSize ?? registeredSize
    // 同組同高(field.spec.md「閱讀情境」;繪製前登記):在組裡、自己沒寫 size 的列把控件偏好登記給範圍;
    // 自己寫了 size 的列不登記(那一列的控件偏好已被它蓋掉,不該再帶動別列)。
    const registerToScope = scope?.registerPreferredSize
    const ownPreferenceForScope = sizeProp == null ? controlPreferredSize : null
    React.useLayoutEffect(() => {
      if (!registerToScope) return undefined
      registerToScope(id, ownPreferenceForScope)
      return () => registerToScope(id, null)
    }, [registerToScope, id, ownPreferenceForScope])
    // 解析順序:Field 自己寫的 → 範圍的同組偏好(各列控件偏好,不同時取最小)→ 自己控件的偏好 → md
    const resolvedPreferredSize = sizeProp ?? scope?.preferredSize ?? controlPreferredSize
    const size: FieldSize = resolvedPreferredSize ?? 'md'
    const sizeExplicit = resolvedPreferredSize != null

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
        sizeExplicit,
        registerPreferredSize,
        registerControlError,
        countId,
        registerControlCount,
        orientation,
        controlLayout,
        hasFieldWrapper: true,
      }),
      [id, labelId, descriptionId, errorId, mode, variant, disabled, required, invalid, size, sizeExplicit, registerPreferredSize, registerControlError, countId, registerControlCount, orientation, controlLayout]
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
          className={cn('flex items-center min-w-0', MIN_H_CLASS[size], orientation === 'horizontal' && FRAMELESS_VALUE_INSET_CLASS)}
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
              // label 欄寬直接寫進欄定義(2026-11-15 前經元件內變數 --field-label-width 轉一手:那個名字的開頭
              // 跟共用刻度 --field-* 同一族,看起來像全系統的值;它只在這個元素上設、只在這個元素上讀,稽核 P20)
              gridTemplateColumns: `${effectiveLabelWidth ?? 'auto'} minmax(0, 1fr)`,
              ...style,
            }}
            data-field-orientation="horizontal"
            data-field-scope={scope ? undefined : ''}
            data-field-mode={mode}
            data-field-size={size}
            data-field-disabled={disabled ? '' : undefined}
            data-field-invalid={invalid ? '' : undefined}
            {...props}
          >
            {labelNodes}
            <div className="flex flex-col gap-1 min-w-0">
              {controlArea}
              {descriptionArea}
              {errorNodes}
              {controlErrorNode}
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
          data-field-scope={scope ? undefined : ''}
          data-field-mode={mode}
          data-field-size={size}
          data-field-disabled={disabled ? '' : undefined}
          data-field-invalid={invalid ? '' : undefined}
          {...props}
        >
          {labelNodes}
          {controlArea}
          {descriptionArea}
          {errorNodes}
          {controlErrorNode}
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
   * Info icon 是「給資訊」的觸發處（hit-area-canonical.md 三-1），不是行內動作：
   * 平常 fg-muted、滑過 fg-secondary，游標一般箭頭（點下去不做事）。
   * label 的主要互動是 input，info 只是補充說明。
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
    // 純顯示(`<Field mode="view">`)底下沒有輸入框可對:`<label for>` 指向不存在的控件 = a11y 錯(axe label 類規則),
    // 改渲 span(同 id,控件的 aria-labelledby 照樣接得到)。
    const isViewMode = ctx?.mode === 'view'
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

    // ⓘ 是 <button>(HTML「可被標籤的元素」),HTML 不准它住在 <label> 裡(WHATWG label 的內容規定:不得含 labelable 後代,
    // 除了它標的那個控件;2026-11-26 產品 canary 回報 C8 (b))—— 住在裡面時,控件經 aria-labelledby / <label for> 算出的讀屏名稱
    // 會把 ⓘ 的說明文字一起念進去。有 ⓘ 時改成:外層 span 帶版面(同一組 class / style / data-field-slot,版面與顏色不變),
    // <label> 只包星號 + 標籤文字,ⓘ 是它的兄弟。沒有 ⓘ(或檢視態本來就是 span)維持原本單一 <label> / <span>。
    // 點擊範圍不變:修前整個標籤列(含文字右邊、文字與 ⓘ 之間 4px、橫排時整個標籤欄)都是 <label>,點空白處會交給控件;
    // 拆開後外層把「點在自己或那層 inline-flex 上」(= ⓘ 與文字以外的空白)轉成點 <label>,交給瀏覽器原生的 label 行為(聚焦 / 勾選照舊)。
    // 點在 <label> 本身已由原生處理、點 ⓘ 是看說明,兩者都不轉(轉了會重複觸發:勾選框一下切兩次)。
    const showInfo = Boolean(info) && !disabled
    const split = showInfo && !isViewMode
    const RootTag = (isViewMode || split ? 'span' : 'label') as 'label'
    const TextTag = (split ? 'label' : 'span') as 'label'
    const labelAttrs = {
      ref,
      id: ctx?.labelId,
      htmlFor: isViewMode ? undefined : htmlFor,
      // 2026-06-10 a11y:styled-disabled label 必明告 inactive(WCAG 1.4.3 inactive-UI 豁免需可機判;
      // axe 對無 aria-disabled 的 fg-disabled 文字誤報 color-contrast — deep-audit 抓 8 筆)
      'aria-disabled': disabled || undefined,
      ...props,
    }
    // 外層只轉「點在自己或那層 inline-flex 上」的那一下(= 空白處);label.click() 走瀏覽器原生的 label 行為
    const forwardBlankClick = (e: React.MouseEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget && e.target !== e.currentTarget.firstChild) return
      e.currentTarget.querySelector<HTMLLabelElement>(':scope > span > label')?.click()
    }
    return (
      <RootTag
        {...(split ? { onClick: forwardBlankClick } : labelAttrs)}
        className={cn(
          FIELD_TEXT_CLASS,
          'font-normal select-none',
          // 停用優先(M24);否則讀標籤色變數(./field.css 在閱讀情境把它設在標籤自己身上 = fg-secondary;表單不設 → 後備 foreground;field.spec.md「閱讀情境」)
          disabled ? 'text-fg-disabled' : LABEL_COLOR_CLASS,
          horizontalInlineClass,
          className
        )}
        style={{ ...horizontalBlockStyle, ...style }}
        data-field-slot="label"
        data-field-disabled={disabled ? '' : undefined}
      >
        <span className="inline-flex items-center gap-1">
          <TextTag {...(split ? labelAttrs : {})}>
            {required && (
              <span
                aria-hidden="true"
                className={disabled ? 'text-fg-disabled' : 'text-fg-muted'}
              >
                *
              </span>
            )}
            {children}
          </TextTag>
          {/* ⓘ = 公開元件 InfoTooltip(長相、游標、讀屏名稱的理由都住 info-tooltip.tsx / info-tooltip.spec.md)。
              size="md" 明寫:標籤字級固定 text-body、不隨欄位尺寸變(field-context.ts FIELD_TEXT_CLASS),
              所以 ⓘ 固定 16,不跟著外面可能有的列尺寸走 */}
          {showInfo && info && <InfoTooltip info={info} size="md" />}
        </span>
      </RootTag>
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
      // 2026-09-29 a11y(待辦總帳 OE21):與上方 FieldLabel 同一條理由 —— styled-disabled 的說明文字必明告 inactive,
      // 否則 axe color-contrast 把 fg-disabled(#BFBFBF,1.83:1)當一般文字誤報(field 色彩對照 / 狀態行為兩則 story 各 1 筆)
      aria-disabled={disabled || undefined}
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
  if (!hasErrorContent(children)) return null

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
  /**
   * 同一 group 內所有 horizontal Field 共用的 label 欄寬度 —— 跟單一 Field 的 `labelWidth` **同一個名字、同一種值**
   *(2026-11-15「尺寸:甲」:同一個值不再有兩個名字)。數字 = px;也收任何 CSS length 字串(`"10rem"` / `"30%"` 等)。
   * 預設不指定——每個 Field 自動以 label 內容撐開(容易歪七扭八)。
   *
   * 用途:讓 setting list 一律 label 固定寬、control 右對齊,列與列整齊對齊。
   *
   * 單一 Field 可以用自己的 `labelWidth` prop 覆寫 cascade 值。
   */
  labelWidth?: number | string
}

// 欄位垂直間距 = `--layout-space-loose`,**不開放 per-instance 選檔**(2026-09-12 user 拍板)。
//
// 這是回歸 DS 自己早就寫下的規則:`layoutSpace.spec.md:77` 逐字把
// 「跨範疇 + parallel / independent」的例子列為「**form fields stack(parallel inputs)**」→ 規則 3 = **loose**。
// 表單間距是**系統級**設定,要調就整個 density 一起調(md 16px / lg 24px),不是每個表單各自挑。
//
// 原本的 `gap?: 'compact' | 'normal' | 'loose'`(硬寫 gap-3/4/6、凍結不隨 density)來自
// 2026-04-10 的 `9917993e`,commit 訊息宣稱「rename to shadcn conventions」(git show 9917993e 核對)——(來源:https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/field.tsx#L44)
// 但 shadcn 的 `FieldGroup` **根本沒有 gap prop**(props 只有 className,間距由元件固定),
// 那三檔是重構時自己長出來的,沒有任何 user 決定背書。實際使用也證實它不帶資訊:
// 全 repo 33 個 `<FieldGroup>` 只有 2 個傳過 gap(1 個 compact 無理由、1 個傳的就是預設值),
// `loose` 一次都沒用過。世界級同樣沒有一家開放 per-instance 檔位:
// shadcn 元件固定 / MUI Stack 任意數值經 `theme.spacing()` 換算(「The spacing value can be any number, including decimals,
// or a string.」https://mui.com/material-ui/react-stack/ )/ Ant 全域 component token `itemMarginBottom`
// (https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/form/style/index.ts )
// 走 ConfigProvider 的 `theme.components`(「Modify Component Token and Alias Token applied to components」,
// https://github.com/ant-design/ant-design/blob/615d1baef4a4d3197bd611651e6415d15d8bb4ca/docs/react/customize-theme.en-US.md )。
//
// md density 下新舊值都是 16px,所以 33 個用法裡 32 個視覺零變化;lg 下從凍結的 16px 變成 24px,
// 也就是開始履行 density 的承諾。
//
// 範圍(2026-11-25,field.spec.md「閱讀情境」):最外層 FieldGroup 掛 `data-field-scope`、持有同組同高的登記;內層 FieldGroup 沿用外層的範圍。
// 同組同高是內部機制,FieldGroup **不新增**公開的 size 參數(某一列要固定尺寸,照舊在那個 Field 上寫 size)。
const FieldGroup = React.forwardRef<HTMLDivElement, FieldGroupProps>(
  ({ className, labelWidth, ...props }, ref) => {
    const parent = React.useContext(FieldGroupContext)
    const [preferences, setPreferences] = React.useState<Readonly<Record<string, FieldSize>>>({})
    const registerPreferredSize = React.useCallback((key: string, size: FieldSize | null) => {
      setPreferences((current) => {
        if (size == null) {
          if (!(key in current)) return current
          const next = { ...current }
          delete next[key]
          return next
        }
        return current[key] === size ? current : { ...current, [key]: size }
      })
    }, [])
    const preferredSize = resolveGroupPreferredSize(Object.values(preferences))
    const ownScope = React.useMemo<FieldScopeValue>(
      () => ({ registerPreferredSize, preferredSize }),
      [registerPreferredSize, preferredSize],
    )
    const scope = parent.scope ?? ownScope
    const groupCtxValue = React.useMemo(
      () => ({ labelWidth, scope }),
      [labelWidth, scope],
    )
    return (
      <FieldGroupContext.Provider value={groupCtxValue}>
        <div
          ref={ref}
          className={cn('flex flex-col min-w-0 gap-[var(--layout-space-loose)]', className)}
          data-field-group=""
          data-field-scope={parent.scope ? undefined : ''}
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
  // 'active' 移除 — field-wrapper compoundVariants 無按壓態(TimePicker 2026-07-04 audit 同結論)(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-error-text', 'text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup }

// form-validation.spec.md 可執行層(per-component index gen 只 re-export 主檔,故經此公開)
export { useFieldState, type FieldState } from './field-context'
export { useFormValidation } from './use-form-validation'
export type { UseFormValidationOptions, UseFormValidationReturn, FormFieldInputProps } from './use-form-validation'
