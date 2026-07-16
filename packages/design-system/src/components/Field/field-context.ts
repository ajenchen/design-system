import * as React from 'react'
import type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth } from './field-types'
import { EMPTY_DISPLAY } from './field-wrapper'

// ── Types ──
export type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth }
export type FieldOrientation = 'vertical' | 'horizontal'
export type FieldSize = 'sm' | 'md' | 'lg'
export type FieldControlLayout = 'inline' | 'block'

/**
 * Field surface(2026-05-12 codex Q2 verdict — Stream C 4-issues Cluster B fix):
 * 替代散落的 `variant === 'naked'` 判 cell heuristic,讓 Field family components
 * 顯式 query「我在哪 surface」derive cell-specific padding / alignment / overflow。
 *
 * - `'form'`(default)— Standalone Field control(對齊 Polaris / Material Form idiom)
 * - `'toolbar'`— Toolbar / Action bar inline Field(future,目前無 consumer)
 * - `'table-cell'`— DataTable cell-as-input substrate(取代 variant='naked' cell-detection
 *   heuristic;canonical metrics 由 surface 推導,不再 hardcode in Field consumer)
 */
type FieldSurface = 'form' | 'toolbar' | 'table-cell'

// ── Context ──
export interface FieldContextValue {
  id: string
  /** a11y(2026-04-25):FieldLabel 渲染時若元素為 div-based role(combobox/slider
   * 等非 native form control),`<label for>` 無效,需 aria-labelledby 指向 labelId。
   * FieldLabel 自動設 id={labelId},下游 control 可讀此值寫入 aria-labelledby。 */
  labelId: string
  descriptionId: string
  errorId: string
  mode: FieldMode
  /** 視覺外殼透傳(2026-05-05)。default = 含 border+bg;naked = cell-as-input(edit×naked 自畫 border-based state machine;display/readonly/disabled×naked 用 transparent border 由 host cell 供邊框);`bare` 2026-07-09 退役;naked 2026-07-14 型別收窄至
   *  FieldVariantInternal(@internal)— 公開 `<Field variant>` 只收 default,故本欄位維持 FieldVariant。
   *  child Field control 自動繼承,per-control prop override 可覆寫。詳 field-types.ts。 */
  variant: FieldVariant
  disabled: boolean
  required: boolean
  invalid: boolean
  size: FieldSize
  orientation: FieldOrientation
  controlLayout: FieldControlLayout
  hasFieldWrapper: true
  /** 2026-05-12 Stream C Cluster B fix:surface 上下文(form / toolbar / table-cell)
   *  從 host(Field wrapper / DataTable cell registry)propagate 給 child controls。
   *  Optional — 未設視同 `'form'`(backward compat)。 */
  surface?: FieldSurface
}

export const FieldContext = React.createContext<FieldContextValue | null>(null)

/** 讓 primitive（Checkbox/Switch/Radio/Button/Input 等）讀 Field context */
export function useFieldContext(): FieldContextValue | null {
  return React.useContext(FieldContext)
}

/**
 * Surface context — **獨立於 FieldContext** 的 surface signal(2026-05-12 v2 fix)。
 *
 * 原 v1 設計(`FieldSurfaceProvider` 透過 FieldContext.Provider 注入)誤把 stub
 * `hasFieldWrapper: true` 傳給沒有真正 Field wrapper 的場景(例 DataTable cell 內 standalone
 * DatePicker),導致 cells 誤以為有 Field 父 → 視覺 regression(2026-05-12 visual-audit 抓 3
 * stories 超過 baseline budget:DatePicker range-picker / FileViewer open-snapshot /
 * DataTable pinned-columns)。
 *
 * v2 修:**完全分離** FieldSurfaceContext;FieldContext 不被污染;non-FieldWrapper hosts
 * 只能影響 surface signal,不能假冒 Field wrapper 身份。
 */
const FieldSurfaceContext = React.createContext<FieldSurface | null>(null)

/**
 * Helper: 取當前 surface,fall back 'form'。
 *
 * Stream C Cluster B canonical entry point — Field family controls 用此 helper 替代
 * 散落的 `variant === 'naked'` cell heuristic。對齊 codex Q2 verdict「surface context」
 * canonical(替代「inCellContext per-prop」反 pattern)。
 *
 * 優先順序:FieldSurfaceContext(host-provided) → FieldContext.surface(Field-wrapper-provided)
 *           → fallback 'form'。
 */
export function useFieldSurface(): FieldSurface {
  const surfaceCtx = React.useContext(FieldSurfaceContext)
  if (surfaceCtx) return surfaceCtx
  const fieldCtx = React.useContext(FieldContext)
  return fieldCtx?.surface ?? 'form'
}

/**
 * Standalone FieldSurface provider — 給 host(non-Field-wrapper, 如 DataTable cell)
 * **僅**設 surface signal,**不**污染 FieldContext。
 *
 * Usage(per cell-registry.tsx,2026-05-12):
 *   <FieldSurfaceProvider surface="table-cell"><Field control /></FieldSurfaceProvider>
 *
 * 與 FieldContext.Provider 差別:
 *   - FieldContext.Provider — 完整 Field wrapper 用,provides mode/variant/disabled/...
 *   - FieldSurfaceProvider — host **僅**注 surface signal,Field controls 透過
 *     `useFieldSurface()` 讀;`useFieldContext()` 仍 returns null(沒被假冒)。
 */
export function FieldSurfaceProvider({
  surface,
  children,
}: {
  surface: FieldSurface
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(FieldSurfaceContext.Provider, { value: surface }, children)
}

/**
 * 2026-05-13 (c) scroll-defer perf SSOT(per codex DataTable perf brief V3 + user 拍板
 * 「Roadmap still >50ms 進 (c)」):
 * Host(DataTable)在 virtualizer.isScrolling=true 期間 wrap children with `TableScrollProvider`,
 * 重 cell 組件(Avatar HoverCard / PeoplePicker / etc.)讀此 signal 跳過昂貴 subtree(如 HoverCard
 * Portal + useDocumentTheme observer),scroll 結束 unset → 重渲染為完整 affordance。
 *
 * 對齊 codex Profile Plan step 6(Scripting vs Layout 判分):scrolling 期間 cell 渲染壓縮 →
 * 240ms/frame catastrophe → close to 50ms target。世界級對齊:AG Grid `deferRender` for slow
 * React cell components / MUI X DataGrid scroll-defer hover affordance。
 *
 * 不放在 FieldSurfaceContext 內(避免 value object identity drift on scroll → 全 cell 重渲)
 * — 用獨立 Context,value = boolean primitive(stable when unchanged)。
 */
const TableScrollContext = React.createContext<boolean>(false)

export function useTableIsScrolling(): boolean {
  return React.useContext(TableScrollContext)
}

export function TableScrollProvider({
  isScrolling,
  children,
}: {
  isScrolling: boolean
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(TableScrollContext.Provider, { value: isScrolling }, children)
}

/**
 * Surface size signal — 獨立於 FieldContext + FieldSurfaceContext 的純視覺 size context(2026-06-08)。
 * 讓 host(DataTable cell substrate)把「這片 surface 的 density size」propagate 給 child Field controls,
 * 未來新 cell 漏傳 size prop 也自動繼承 → 字級一致(根治 StringCell/NumberCell 漏傳 size class)。
 *
 * 不放進 FieldSurfaceContext value(避免 string→object identity drift on scroll → 全 cell 重渲,
 * 同 TableScrollContext L119-121 canonical)— 獨立 Context,value = FieldSize primitive(stable when unchanged)。
 * 絕不污染 FieldContext:不碰 hasFieldWrapper/mode/invalid/disabled,useFieldContext() 在 cell 內仍 null。
 */
const FieldSurfaceSizeContext = React.createContext<FieldSize | null>(null)

/**
 * Resolve Field control size — 控件用此 helper 取代散落的 `sizeProp ?? fieldCtx?.size ?? 'md'`。
 * 優先序:prop(caller 顯式)> FieldContext.size(真 <Field> wrapper)> surface-size(host 如 cell)> 'md'。
 * 真 <Field> 永遠勝 host surface(安全序);cell 無 Field wrapper(fieldCtx=null)→ 自動接 surface-size,
 * 漏傳 size 的新 cell 也字級一致。
 */
export function useResolvedFieldSize<T extends string = FieldSize>(sizeProp?: T | null, fallback?: T): T {
  const fieldCtx = React.useContext(FieldContext)
  const surfaceSize = React.useContext(FieldSurfaceSizeContext)
  // generic T(預設 FieldSize)讓非-input 控件(SegmentedControl/Rating 的 'xs'|'sm'|'md'|'lg' 超集、各自 fallback)
  // 也走同一 SSOT resolution。fieldCtx.size/surfaceSize 為 FieldSize(T 的子集)→ widen cast 安全。
  // fallback 未傳預設 'md'(input-class 控件向後相容);Rating 傳 'xs'、SegmentedControl 傳 'md'。
  return (sizeProp ?? (fieldCtx?.size as T | undefined) ?? (surfaceSize as T | undefined) ?? fallback ?? ('md' as T))
}

/**
 * Resolve Field control 的 **disabled** — 取代散落的 `disabledProp ?? fieldCtx?.disabled`(2026-06-08 SSOT)。
 * 優先序:顯式 prop > FieldContext.disabled(`<Field disabled>` / `<Field mode="disabled">`)> false。
 * **caller 必傳「未預設」的原始 prop**(沒傳 = undefined),否則 `disabled=false` 預設會吃掉 `??` fallback。
 * DataTable cell 無 FieldContext(fieldCtx=null)→ 回 prop 或 false,行為與現況完全一致(inert)。
 */
export function useResolvedFieldDisabled(disabledProp?: boolean | null): boolean {
  const fieldCtx = React.useContext(FieldContext)
  return disabledProp ?? fieldCtx?.disabled ?? false
}

/**
 * Resolve Field control 的 **mode**(display / readonly / disabled / edit)— 2026-06-08 SSOT,統一兩派散落:
 *   舊 Input 派 `modeProp ?? fieldCtx?.mode ?? (...)` → `<Field disabled>` 時 ctx.mode 仍 'edit',漏 disabled chrome。
 *   舊 picker 派 `disabled ? 'disabled' : mode`(mode 預設 'edit')→ 完全不讀 fieldCtx.mode,`<Field mode="view">` 失效。
 * 統一優先序(world-class:MUI FormControl disabled 完整 cascade + 顯式 prop 永遠最優先):
 *   1. 顯式 mode prop(caller / DataTable cell 的 displayOrDisabled)→ **永遠最優先**,故表格等顯式場景 inert
 *   2. 有效 disabled(prop 或 `<Field disabled>`)→ 'disabled'(完整 disabled chrome)
 *   3. FieldContext.mode(`<Field mode="view"/"readonly">`)→ 讓 mode cascade 真正生效
 *   4. 本地 readOnly → 'readonly'
 *   5. 'edit'
 * cell:mode prop 必有 → step 1 命中、fieldCtx=null → 完全 inert(Δ=0)。`disabled` 傳已 resolve 的 boolean 或未預設 prop。
 */
export function useResolvedFieldMode({
  mode,
  disabled,
  readOnly,
}: {
  mode?: FieldMode | null
  disabled?: boolean | null
  readOnly?: boolean
}): FieldMode {
  const fieldCtx = React.useContext(FieldContext)
  if (mode) return mode
  if ((disabled ?? fieldCtx?.disabled) === true) return 'disabled'
  if (fieldCtx?.mode) return fieldCtx.mode
  if (readOnly) return 'readonly'
  return 'edit'
}

/**
 * Resolve Field control 的 **variant**(default / naked 視覺外殼;`bare` 2026-07-09 退役)— 2026-06-08 SSOT。
 * 優先序:顯式 prop > FieldContext.variant > 'default'。與既有各控件公式一字不差(Δ=0),統一以利 gate 強制。
 * 2026-07-14 API 策展 E:入參 / 回傳 widen 為 FieldVariantInternal — naked 僅 DataTable cell-registry
 * 經 @internal 通道傳入(公開 prop 型別 = FieldVariant,不含 naked)。
 */
export function useResolvedFieldVariant(variantProp?: FieldVariantInternal | null): FieldVariantInternal {
  const fieldCtx = React.useContext(FieldContext)
  return variantProp ?? fieldCtx?.variant ?? 'default'
}

/**
 * Resolve Field control 的 **error/invalid** — 取代散落的 `errorProp || (fieldCtx?.invalid ?? false)`(2026-06-08 SSOT)。
 * 自身 error prop **或** FieldContext.invalid(`<Field invalid>`)任一為真即 error。與既有公式一致(Δ=0)。
 */
export function useResolvedFieldInvalid(errorProp?: boolean): boolean {
  const fieldCtx = React.useContext(FieldContext)
  return Boolean(errorProp) || (fieldCtx?.invalid ?? false)
}

/**
 * Host(non-Field-wrapper,如 DataTable cell)注 surface density size 給 child Field controls。
 * 僅注 size 視覺訊號,不污染 FieldContext。Usage:cell-registry buildCellWithSurface。
 */
export function FieldSurfaceSizeProvider({
  size,
  children,
}: {
  size: FieldSize
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(FieldSurfaceSizeContext.Provider, { value: size }, children)
}

/**
 * Table-cell 可編輯訊號(2026-07-08 user 拍板)— 獨立於 FieldSurfaceContext / FieldSurfaceSizeContext
 * 的純 boolean context,由 host(DataTable cell registry)注入該 cell 是否可編輯,讓 useFieldEmptyDisplay
 * 分流「可編輯 cell 空 display → 空白」vs「不可編輯 cell 空 display → '-'」。
 * value = boolean primitive(stable when unchanged),不破壞 cell memo identity(同 TableScrollContext /
 * FieldSurfaceSizeContext L119-121 canonical);絕不污染 FieldContext(useFieldContext() 在 cell 內仍 null)。
 */
const FieldSurfaceEditableContext = React.createContext<boolean>(false)

export function FieldSurfaceEditableProvider({
  isEditable,
  children,
}: {
  isEditable: boolean
  children: React.ReactNode
}): React.ReactElement {
  return React.createElement(FieldSurfaceEditableContext.Provider, { value: isEditable }, children)
}

/**
 * 空值顯示分流(2026-07-08 user 拍板,verbatim「...都用"-"...我從頭到尾哪裡有說要用全形的」):
 *
 * | 情境                                           | 空值顯示 |
 * |------------------------------------------------|----------|
 * | table-cell **可編輯** 的 display 靜止態        | **空白 `''`**(不佔位,affordance = hover outline)|
 * | table-cell **不可編輯**(readonly cell)        | **半形 `-`** |
 * | standalone display / readonly / form / toolbar | **半形 `-`** |
 *
 * 收斂式:`surface==='table-cell' && isEditable ? '' : EMPTY_DISPLAY`。
 * 可編輯 form / edit 輸入框走 native placeholder(不經此 hook)。boolean → unchecked / disabled →
 * 同上文字 + text-fg-disabled(M24),各控件自理。
 * 世界級對照:table-cell blank = MUI X / AG Grid / Ant core / Notion / Airtable grid 域共識;
 * 非 table `-` = Ant ProTable `columnEmptyText`(見 field-wrapper.tsx EMPTY_DISPLAY 註)。
 * SSOT 條文 → field-controls.spec.md「null / undefined 值」;全 Field family display/readonly/disabled
 * 空值渲染必經此 hook,禁直接引 EMPTY_DISPLAY 常數(genre 分流會漏)。
 */
export function useFieldEmptyDisplay(): string {
  const surface = useFieldSurface()
  const isEditable = React.useContext(FieldSurfaceEditableContext)
  return surface === 'table-cell' && isEditable ? '' : EMPTY_DISPLAY
}

/**
 * 空值符號「-」顏色分流(2026-07-09 user 拍板 verbatim「「-」代表的是不可編輯只拿來供檢視的值
 * 所以應該跟readonly 的value同樣顏色吧」):
 *
 * 「-」是「不可編輯、供檢視的值」→ 同 readonly value 色 = `text-foreground`
 * (field-wrapper.tsx base `text-foreground`),**非** `text-fg-muted`(muted 是「可編輯 placeholder
 * 提示」的裝飾語意;空值符號不是提示、是被檢視的值狀態)。
 * disabled 態維持 `text-fg-disabled`(M24 disabled 顯著性 > foreground/muted,不可被蓋)。
 *
 * SSOT:全 Field family display/readonly/disabled 空值 span 消費此 helper,傳入已 resolve 的
 * resolvedMode。純函式(非 hook)—— resolvedMode 已由 useResolvedFieldMode 解析(含控件自身
 * disabled prop,context hook 讀不到);故以 resolvedMode 為入參,可條件呼叫、不受 Rules of Hooks 限制。
 * 世界級對照:Ant read-only / Carbon read-only value = 正常前景色;placeholder 才 muted。
 */
export function fieldEmptyColorClass(resolvedMode: FieldMode): string {
  return resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-foreground'
}
