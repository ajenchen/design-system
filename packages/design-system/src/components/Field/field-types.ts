// ── Field Mode ───────────────────────────────────────────────────────────────
//
// 4 模式 canonical(2026-05-05 expand to 4):
//   edit     — 一般可編輯 input(預設 variant:border + bg)
//   display  — **純展示**(無 input chrome / 無互動 affordance);語意「這是 read-only 內容,展示給人看」
//              對齊 Carbon read-only / PatternFly inline-edit hidden-input / Cloudscape display-mode
//   readonly — input chrome + non-editable(保留 underline / border subtle 給 a11y signal「這是 input 但鎖了」)
//              對齊 Carbon read-only-with-underline。差異:`display` 完全無 chrome;`readonly` 保留 input affordance signal
//   disabled — input chrome + disabled state(灰底,不可互動,語意「不適用」)
//
// `display` vs `readonly` 判別:
//   - 該位置語意上是「純展示資料」(如 DataTable cell read mode / ProfileCard meta) → `display`
//   - 該位置是「表單欄位但目前不可改」(如 form 鎖部分欄位) → `readonly`
//
// World-class refs(M22 verified):
//   Carbon: https://carbondesignsystem.com/patterns/read-only-states-pattern/
//   PatternFly: https://www.patternfly.org/components/inline-edit/design-guidelines/
//   Cloudscape: https://cloudscape.design/patterns/general/disabled-and-read-only-states/
export type FieldMode = 'edit' | 'display' | 'readonly' | 'disabled'

// ── Field Variant ────────────────────────────────────────────────────────────
//
// 視覺外殼(公開 1 + internal 1;2026-07-09 user 拍板退役 `bare`,2026-07-14 API 策展 E user 拍板
// 「全部收窄」把 naked 從公開 union 拆出 — 見下方 note):
//   default — 含 border + bg(一般 form input,= Ant outlined / MUI outlined)。公開 FieldVariant 唯一值
//   naked   — @internal(FieldVariantInternal)。cell-as-input(host cell substrate)。edit×naked 自畫
//             border-based state machine(rest → hover → focus-within:border-primary → error 紅框);
//             display/readonly/disabled×naked 用 transparent border,由 host cell 提供視覺邊框。
//             對齊 Airtable / Notion / Excel cell editing。唯一合法消費者 = DataTable cell-registry
//             (field-controls.spec.md「軸二 variant」明文)— consumer 直傳 `<Input variant="naked">`
//             會繞過 canonical chrome / focus,故公開型別排除
//
// **`bare` 退役紀錄(2026-07-09)**:原「透明外殼、hover/focus 才顯 border」variant,2026-05-05 加入時
//   宣稱用途 = toolbar inline editing(FileViewer zoom / config toolbar)。實測全 repo(DS + apps + stories)
//   `variant="bare"` **零真實 JSX 消費者**:唯一出現處是一個 ❌ 反例 story + 過時註解(含錯誤宣稱 FileViewer
//   縮放用 bare — 實為 `<Input size="sm" autoWidth>` default variant)。其目標場景已被 default(toolbar,
//   對齊「邊框給互動元素、輸入框就該有邊框」原則)與 naked(cell-as-input)覆蓋 → 純冗餘,移除。
//   ⚠️ 注意:被大量 import 的 `bareInputStyles` 常數(field-wrapper.tsx)是**內層 <input> 的重置樣式**
//   (透明底 / 無 border / 繼承字體),與本 variant 同名但不同物,**保留不動**(8 個控件共用)。
//
// 透傳機制:Field 透過 FieldContext.variant 一次宣告,所有 child Field control 自動繼承。
// per-control prop override 可覆寫 context。
//
// Benchmark(M22 verified 2026-07-09):Ant `Input variant` 有 borderless(https://ant.design/components/input/)
//   → 「無邊框輸入框」概念世界級合法;但 Material M3 只有 filled/outlined 無無邊框變體
//   (https://m3.material.io/components/text-fields/guidelines),MUI standard(underline)已 deprecated。
//   我們的取捨:無真實消費場景 → 不保留純預留 variant(對齊自家「消費既有、不憑空造」原則)。
export type FieldVariant = 'default'

/**
 * @internal Substrate union — 公開 FieldVariant + `naked`(cell-as-input)。
 * 2026-07-14 API 策展 E(user 拍板「全部收窄」):naked 從公開 union 拆出,型別層防 consumer
 * `<Input variant="naked">` 繞過 canonical chrome / focus。內部實作(field-wrapper cva、各控件
 * useResolvedFieldVariant 分支)吃本型別;唯一合法 naked 傳入點 = DataTable cell-registry
 * (field-controls.spec.md「軸二 variant」明文)。
 */
export type FieldVariantInternal = FieldVariant | 'naked'

/**
 * @internal 型別層 naked 通道 — 把 Field control 的公開 `variant?: FieldVariant` widen 為
 * FieldVariantInternal(純型別、零 runtime;元件 runtime 本就支援 naked)。消費者:DataTable
 * cell-registry(naked 起點)+ PeoplePicker(wrapper forward 給 Select / Combobox,M30 全 surface
 * forward)。保留原 call signature 與 statics(`Pick<C, keyof C>`),widen 方向與函式參數
 * contravariance 相容,故單次 assertion 可過(非 `as unknown as` 雙跳,型別仍受檢)。
 */
export type WithFieldVariantInternal<C> = C extends (props: infer P) => infer R
  ? ((props: Omit<P, 'variant'> & { variant?: FieldVariantInternal }) => R) & Pick<C, keyof C>
  : never

// ── Field Width ──────────────────────────────────────────────────────────────
//
// 寬度軸(2026-07-08 user 拍板,正交於 mode / variant / size — 只改寬度,chrome 與互動不變):
//   fill — `w-full` 填滿容器(default;form 直欄對齊 / DataTable cell 滿格)
//   hug  — `w-fit max-w-full` 依內容收縮:value 寬 + 各 slot 元素寬 + gap + field 內 padding
//          (detail pane inline metadata / toolbar 內 field 場景)
//
// Benchmark(M22 verified):
//   shadcn v4 SelectTrigger 預設 `w-fit`
//     https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/select.tsx
//   Radix Select Trigger intrinsic sizing
//     https://www.radix-ui.com/primitives/docs/components/select
//
// SSOT:fieldWrapperStyles `width` variant(field-wrapper.tsx)+ field-controls.spec.md「寬度軸」。
export type FieldWidth = 'fill' | 'hug'

// ── Menu List Min Height ─────────────────────────────────────────────────────
// SelectMenu / Select / Combobox 共用的 CommandList minHeight 計算。
// 確保空狀態有足夠高度讓 Empty 垂直置中(有框容器 → 置中原則)。

const FIELD_HEIGHT_TOKEN: Record<string, string> = {
  sm: 'var(--field-height-sm)',
  md: 'var(--field-height-md)',
  lg: 'var(--field-height-lg)',
}

/** CommandList 最小高度 = field-height × rows + 16px(CommandGroup py-2 上下 padding） */
export function getMenuListMinHeight(size: string, rows: number = 3): string {
  const token = FIELD_HEIGHT_TOKEN[size] ?? FIELD_HEIGHT_TOKEN.md
  return `calc(${token} * ${rows} + 16px)`
}

