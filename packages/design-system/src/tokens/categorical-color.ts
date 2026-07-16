/**
 * categorical-color.ts — Categorical 色相 SSOT(2026-06-04 codify)
 *
 * Tag / Avatar / Calendar 等「以色相做分類標籤」的元件,色彩 variant **一律消費此 SSOT**。
 * 目的:**variant 名 == primitive 色相名,1:1,零 offset** —— 根治「red variant 接到 deep-orange」
 * 這類 categorical-vs-semantic 混淆(2026-06-04 user 抓:red = 品牌紅 hue-25〔--brand #DF3232 同族〕
 * ≠ deep-orange hue-38 ≠ semantic --error〔= deep-orange〕。三者完全無關)。
 *
 * 世界級對照:
 * - Ant Design Tag preset colors —— 用原始色相名(red/orange/green/blue…)做 categorical labeling
 *   (https://ant.design/components/tag/)。本 DS Tag/Avatar 採此模型。
 * - Atlassian Color 原則 —— **categorical(裝飾)色 vs semantic(狀態)色必須分離**
 *   (https://atlassian.design/foundations/color):categorical `red` 用 `--color-red-*`,跟 semantic
 *   `--error`(= deep-orange)無關;把 error 色拿來當 categorical 標籤 = 反 pattern。
 *
 * ⚠️ Tailwind v4 掃描限制:class 字串**必須以字面形式出現在被掃描的 source**(本檔在 src/,會被掃),
 * 不可用 runtime function 拼字串(否則 `bg-[var(--color-orange-1)]` 不被生成 → silent 失效)。
 * 故本 SSOT 以**字面 const map** 提供;consumer `import` 後索引(cva 列 key 取值,保 VariantProps 型別)。
 *
 * 互動 state(solid dismiss hover/active)用 semantic `--{hue}-hover` / `--{hue}-active`
 * (dark-mode 方向 pre-computed,**不可**用 primitive step-5,否則 dark mode 反向)。12 色相皆已定義。
 *
 * **加色相**:加進 `CATEGORICAL_HUES` + 下列 5 個 map 各補一行字面值(key X 用 `--color-X-*`,1:1)。
 * **機械防線**:`scripts/categorical-color-invariants.mjs` I1(release:preflight 已 chain)強制 map 的 key X 的值含 `--color-X-`(名實一致,禁 offset;原引 hook 名不存在,2026-07-04 修)。
 */

/** 12 個 categorical 色相。⚠️ 順序 = **categorical 指派序**(圖表系列鄰色最大區辨:blue→green→deep-orange→yellow→red…),**非** primitives.css 檔內宣告序 — 兩者本就不同,map 以名為 key 故功能無涉;**禁**為「對齊」重排(重排 = 圖表系列換色 = 視覺 breaking)。 */
export const CATEGORICAL_HUES = [
  'blue',
  'green',
  'deep-orange',
  'yellow',
  'red',
  'orange',
  'amber',
  'lime',
  'turquoise',
  'indigo',
  'purple',
  'magenta',
] as const

export type CategoricalHue = (typeof CATEGORICAL_HUES)[number]

/** neutral 不是色相(無 hue),用 secondary/foreground + neutral-9 solid,各 consumer 自處理(不在下列 map)。 */
export type CategoricalColor = CategoricalHue | 'neutral'

/** subtle 模式 class:step-1 底 + step-7 字。key X 一律對 `--color-X-*`(1:1)。 */
export const CAT_SUBTLE: Record<CategoricalHue, string> = {
  blue: 'bg-[var(--color-blue-1)] text-[var(--color-blue-7)]',
  green: 'bg-[var(--color-green-1)] text-[var(--color-green-7)]',
  'deep-orange': 'bg-[var(--color-deep-orange-1)] text-[var(--color-deep-orange-7)]',
  yellow: 'bg-[var(--color-yellow-1)] text-[var(--color-yellow-7)]',
  red: 'bg-[var(--color-red-1)] text-[var(--color-red-7)]',
  orange: 'bg-[var(--color-orange-1)] text-[var(--color-orange-7)]',
  amber: 'bg-[var(--color-amber-1)] text-[var(--color-amber-7)]',
  lime: 'bg-[var(--color-lime-1)] text-[var(--color-lime-7)]',
  turquoise: 'bg-[var(--color-turquoise-1)] text-[var(--color-turquoise-7)]',
  indigo: 'bg-[var(--color-indigo-1)] text-[var(--color-indigo-7)]',
  purple: 'bg-[var(--color-purple-1)] text-[var(--color-purple-7)]',
  magenta: 'bg-[var(--color-magenta-1)] text-[var(--color-magenta-7)]',
}

/**
 * solid 模式 class:step-6 底 + on-emphasis 配對文字。
 * 文字色依「step-6 底亮度」分桶(WCAG ≥3:1 大粗字門檻,2026-06-04 user「以最低為原則」):
 *   - 夠深的色底 → `text-on-emphasis`(白):blue / deep-orange / red / indigo / purple / magenta
 *   - 太亮的色底 → `text-on-emphasis-dark`(深):yellow / amber / orange / lime / turquoise(白字連 3:1 都不過;turquoise 2026-07-16 dark 色相修正後 L=0.68 白字 2.77 → 切深字,兩 mode 5.65/6.47 全過)
 *   - ★ green 例外:白字 2.47 連 3:1 都不過,但 user 拍板維持白字(綠底白字慣見觀感)= documented exception。
 * 對比為 oklch→相對亮度實測(scripts/categorical-color-invariants.mjs 機械驗,green 列 exempt)。
 */
export const CAT_SOLID: Record<CategoricalHue, string> = {
  blue: 'bg-[var(--color-blue-6)] text-on-emphasis',
  green: 'bg-[var(--color-green-6)] text-on-emphasis', // ★白字 documented exception(實測 2.47 < 3:1)
  'deep-orange': 'bg-[var(--color-deep-orange-6)] text-on-emphasis',
  yellow: 'bg-[var(--color-yellow-6)] text-on-emphasis-dark',
  red: 'bg-[var(--color-red-6)] text-on-emphasis',
  orange: 'bg-[var(--color-orange-6)] text-on-emphasis-dark',
  amber: 'bg-[var(--color-amber-6)] text-on-emphasis-dark',
  lime: 'bg-[var(--color-lime-6)] text-on-emphasis-dark',
  turquoise: 'bg-[var(--color-turquoise-6)] text-on-emphasis-dark',
  indigo: 'bg-[var(--color-indigo-6)] text-on-emphasis',
  purple: 'bg-[var(--color-purple-6)] text-on-emphasis',
  magenta: 'bg-[var(--color-magenta-6)] text-on-emphasis',
}

/** solid 互動(dismiss hover/active)— semantic dark-mode-aware token。 */
export const CAT_INTERACT: Record<CategoricalHue, { hover: string; active: string }> = {
  blue: { hover: 'var(--blue-hover)', active: 'var(--blue-active)' },
  green: { hover: 'var(--green-hover)', active: 'var(--green-active)' },
  'deep-orange': { hover: 'var(--deep-orange-hover)', active: 'var(--deep-orange-active)' },
  yellow: { hover: 'var(--yellow-hover)', active: 'var(--yellow-active)' },
  red: { hover: 'var(--red-hover)', active: 'var(--red-active)' },
  orange: { hover: 'var(--orange-hover)', active: 'var(--orange-active)' },
  amber: { hover: 'var(--amber-hover)', active: 'var(--amber-active)' },
  lime: { hover: 'var(--lime-hover)', active: 'var(--lime-active)' },
  turquoise: { hover: 'var(--turquoise-hover)', active: 'var(--turquoise-active)' },
  indigo: { hover: 'var(--indigo-hover)', active: 'var(--indigo-active)' },
  purple: { hover: 'var(--purple-hover)', active: 'var(--purple-active)' },
  magenta: { hover: 'var(--magenta-hover)', active: 'var(--magenta-active)' },
}

/** Avatar style 物件用:subtle / solid 的 raw token { bg, text }(非 class)。 */
export const CAT_SUBTLE_TOKENS: Record<CategoricalHue, { bg: string; text: string }> = {
  blue: { bg: 'var(--color-blue-1)', text: 'var(--color-blue-7)' },
  green: { bg: 'var(--color-green-1)', text: 'var(--color-green-7)' },
  'deep-orange': { bg: 'var(--color-deep-orange-1)', text: 'var(--color-deep-orange-7)' },
  yellow: { bg: 'var(--color-yellow-1)', text: 'var(--color-yellow-7)' },
  red: { bg: 'var(--color-red-1)', text: 'var(--color-red-7)' },
  orange: { bg: 'var(--color-orange-1)', text: 'var(--color-orange-7)' },
  amber: { bg: 'var(--color-amber-1)', text: 'var(--color-amber-7)' },
  lime: { bg: 'var(--color-lime-1)', text: 'var(--color-lime-7)' },
  turquoise: { bg: 'var(--color-turquoise-1)', text: 'var(--color-turquoise-7)' },
  indigo: { bg: 'var(--color-indigo-1)', text: 'var(--color-indigo-7)' },
  purple: { bg: 'var(--color-purple-1)', text: 'var(--color-purple-7)' },
  magenta: { bg: 'var(--color-magenta-1)', text: 'var(--color-magenta-7)' },
}
// 同 CAT_SOLID 的文字分桶(白 / 深),raw token 版供 Avatar style 物件用。green = ★白字 exception。
export const CAT_SOLID_TOKENS: Record<CategoricalHue, { bg: string; text: string }> = {
  blue: { bg: 'var(--color-blue-6)', text: 'var(--on-emphasis)' },
  green: { bg: 'var(--color-green-6)', text: 'var(--on-emphasis)' }, // ★白字 documented exception
  'deep-orange': { bg: 'var(--color-deep-orange-6)', text: 'var(--on-emphasis)' },
  yellow: { bg: 'var(--color-yellow-6)', text: 'var(--on-emphasis-dark)' },
  red: { bg: 'var(--color-red-6)', text: 'var(--on-emphasis)' },
  orange: { bg: 'var(--color-orange-6)', text: 'var(--on-emphasis-dark)' },
  amber: { bg: 'var(--color-amber-6)', text: 'var(--on-emphasis-dark)' },
  lime: { bg: 'var(--color-lime-6)', text: 'var(--on-emphasis-dark)' },
  turquoise: { bg: 'var(--color-turquoise-6)', text: 'var(--on-emphasis-dark)' },
  indigo: { bg: 'var(--color-indigo-6)', text: 'var(--on-emphasis)' },
  purple: { bg: 'var(--color-purple-6)', text: 'var(--on-emphasis)' },
  magenta: { bg: 'var(--color-magenta-6)', text: 'var(--on-emphasis)' },
}

/** Calendar event tile:subtle 底 + hover step-2(1:1)。 */
export const CAT_EVENT: Record<CategoricalHue, string> = {
  blue: 'bg-[var(--color-blue-1)] text-[var(--color-blue-7)] hover:bg-[var(--color-blue-2)]',
  green: 'bg-[var(--color-green-1)] text-[var(--color-green-7)] hover:bg-[var(--color-green-2)]',
  'deep-orange': 'bg-[var(--color-deep-orange-1)] text-[var(--color-deep-orange-7)] hover:bg-[var(--color-deep-orange-2)]',
  yellow: 'bg-[var(--color-yellow-1)] text-[var(--color-yellow-7)] hover:bg-[var(--color-yellow-2)]',
  red: 'bg-[var(--color-red-1)] text-[var(--color-red-7)] hover:bg-[var(--color-red-2)]',
  orange: 'bg-[var(--color-orange-1)] text-[var(--color-orange-7)] hover:bg-[var(--color-orange-2)]',
  amber: 'bg-[var(--color-amber-1)] text-[var(--color-amber-7)] hover:bg-[var(--color-amber-2)]',
  lime: 'bg-[var(--color-lime-1)] text-[var(--color-lime-7)] hover:bg-[var(--color-lime-2)]',
  turquoise: 'bg-[var(--color-turquoise-1)] text-[var(--color-turquoise-7)] hover:bg-[var(--color-turquoise-2)]',
  indigo: 'bg-[var(--color-indigo-1)] text-[var(--color-indigo-7)] hover:bg-[var(--color-indigo-2)]',
  purple: 'bg-[var(--color-purple-1)] text-[var(--color-purple-7)] hover:bg-[var(--color-purple-2)]',
  magenta: 'bg-[var(--color-magenta-1)] text-[var(--color-magenta-7)] hover:bg-[var(--color-magenta-2)]',
}

/** Calendar all-day accent:左側 step-6 實心條。 */
export const CAT_ACCENT: Record<CategoricalHue, string> = {
  blue: 'border-l-[3px] border-[var(--color-blue-6)]',
  green: 'border-l-[3px] border-[var(--color-green-6)]',
  'deep-orange': 'border-l-[3px] border-[var(--color-deep-orange-6)]',
  yellow: 'border-l-[3px] border-[var(--color-yellow-6)]',
  red: 'border-l-[3px] border-[var(--color-red-6)]',
  orange: 'border-l-[3px] border-[var(--color-orange-6)]',
  amber: 'border-l-[3px] border-[var(--color-amber-6)]',
  lime: 'border-l-[3px] border-[var(--color-lime-6)]',
  turquoise: 'border-l-[3px] border-[var(--color-turquoise-6)]',
  indigo: 'border-l-[3px] border-[var(--color-indigo-6)]',
  purple: 'border-l-[3px] border-[var(--color-purple-6)]',
  magenta: 'border-l-[3px] border-[var(--color-magenta-6)]',
}
