// ── Field Mode ───────────────────────────────────────────────────────────────
//
// 4 模式 canonical(2026-05-05 expand to 4):
//   edit     — 一般可編輯 input(預設 chrome:border + bg)
//   display  — **純展示**(無 input chrome / 無互動 affordance);語意「這是 read-only 內容,展示給人看」
//              對齊 Carbon read-only / PatternFly inline-edit hidden-input / Cloudscape display-mode
//   readonly — input chrome + non-editable(保留 underline / border subtle 給 a11y signal「這是 input 但鎖了」)
//              對齊 Carbon read-only-with-underline。差異:`display` 完全無 chrome;`readonly` 保留 input affordance signal
//   disabled — input chrome + disabled state(灰底,不可互動,語意「不適用」)
//
// `display` vs `readonly` 判別:
//   - 該位置語意上是「純展示資料」(如 DataTable cell read mode / NameCard meta) → `display`
//   - 該位置是「表單欄位但目前不可改」(如 form 鎖部分欄位) → `readonly`
//
// World-class refs(M22 verified):
//   Carbon: https://carbondesignsystem.com/patterns/read-only-states-pattern/
//   PatternFly: https://www.patternfly.org/components/inline-edit/design-guidelines/
//   Cloudscape: https://cloudscape.design/patterns/general/disabled-and-read-only-states/
export type FieldMode = 'edit' | 'display' | 'readonly' | 'disabled'

// ── Field Chrome ─────────────────────────────────────────────────────────────
//
// 視覺外殼(2026-05-05):
//   default — 含 border + bg(一般 form input)
//   bare    — 透明 chrome,hover/focus 才 reveal(cell-as-input substrate;VS Code/Figma toolbar idiom)
//
// 透傳機制:Field 透過 FieldContext.chrome 一次宣告,所有 child Field control 自動繼承。
// per-control prop override 可覆寫 context。
export type FieldChrome = 'default' | 'bare'

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

