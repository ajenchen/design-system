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
 * **機械防線**:`scripts/categorical-color-invariants.mjs` I1(current required CI / deterministic audit chain)強制 map 的 key X 的值含 `--color-X-`(名實一致,禁 offset;原引 hook 名不存在,2026-07-04 修)。
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

/**
 * neutral 不是色相(無 hue),用 secondary/foreground + neutral-9 solid,不在下列 12 色相的 map(I1 / I2 只管色相)。
 * Tag / Avatar 在各自元件裡處理;Calendar 事件的 neutral 收在本檔下方的 `CAT_EVENT_NEUTRAL`(決策總帳 2026-11-25「neutral 事件色放 categorical-color.ts」)。
 */
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
 *
 * **實心底字色原則**(2026-11-26 user 決定;全 DS「類別色 step-6 實心底上的字」都照這一條,字色只從本檔兩張 solid map 取):
 *   白字對比**不低於綠色** → 白字 `text-on-emphasis`;低於綠色 → 深字 `text-on-emphasis-dark`。
 *   綠色 = user 接受的最低白字對比,是這條原則的**基準**,不是例外。淺色、深色兩個模式各自和綠色在同一模式的值比較
 *  (兩個模式都達門檻才是白字)。
 * user 原話(2026-11-26,依序逐字):
 *   1.「turquoise的 solid tag的配色為何其上字體不是跟blue上的字體顏色一樣都是白色？這是何時改的？這個沒經過我同意吧？我認為上面是要白色，請確保整個 ds 此類邏輯配色的地方都按這個 ssot」
 *   2. 選「白字,照綠色先例登記例外 (Recommended)」並寫「應該照你建議啊，而且超奇怪，2.47都過了，2.77憑什麼不過？？？」
 *   3.「橘色要一起改啊，2.47以上的都應該過吧？」
 *   「以綠色為基準、兩個模式各自比較」是依這三段整理成一條的寫法,回覆 user 時已列出、user 未反對【AI 整理;深色門檻 2.21 是 AI 推導 —— user 原話只提到淺色的 2.47】。
 * 實測(oklch → 相對亮度;`scripts/categorical-color-invariants.mjs` I4 每次由 primitives 現算門檻,並逐格核對下表 —— 數字或字色和現算不符就紅):
 *   | 色相 | 淺 白字 | 深 白字 | 字 |
 *   | green | 2.47 | 2.21 | 白(基準) |
 *   | blue | 5.20 | 3.69 | 白 |
 *   | deep-orange | 4.67 | 3.78 | 白 |
 *   | red | 7.19 | 6.36 | 白 |
 *   | indigo | 5.99 | 4.90 | 白 |
 *   | purple | 6.05 | 4.84 | 白 |
 *   | magenta | 5.11 | 4.12 | 白 |
 *   | turquoise | 3.23 | 2.77 | 白 |
 *   | orange | 2.51 | 2.24 | 白 |
 *   | amber | 1.98 | 1.78 | 深 |
 *   | lime | 1.73 | 1.57 | 深 |
 *   | yellow | 1.49 | 1.42 | 深 |
 * 深字桶的深字對比照舊要 ≥ 3:1(2026-06-04 user「以最低為原則」的大粗字門檻;同一支閘驗)。
 * **換桶**(primitives 改了某色相亮度,讓它跨過門檻)= 畫面變化:閘只會紅、不會自動換,要 user 確認後才同時改上表與兩張 solid map。
 * **原則本身要改**(換基準色、改門檻)= 產品／UI／UX 決策(AGENTS.md#canonical-decision-authority)。
 * 沿革:2026-06-04 起是「白字 ≥ 3:1 → 白,green 列 documented exception」;2026-07-16 commit 7bbeac58 把 turquoise 切成深字 ——
 * 那次 user 核准的是深色 turquoise 的色相修正(「照設計語言推導自動調整」),切字色是 AI 連帶改動、沒有 user 原話。
 * 2026-11-26 依上面的原則,turquoise、orange 改回 / 改成白字。
 */
export const CAT_SOLID: Record<CategoricalHue, string> = {
  blue: 'bg-[var(--color-blue-6)] text-on-emphasis',
  green: 'bg-[var(--color-green-6)] text-on-emphasis',
  'deep-orange': 'bg-[var(--color-deep-orange-6)] text-on-emphasis',
  yellow: 'bg-[var(--color-yellow-6)] text-on-emphasis-dark',
  red: 'bg-[var(--color-red-6)] text-on-emphasis',
  orange: 'bg-[var(--color-orange-6)] text-on-emphasis',
  amber: 'bg-[var(--color-amber-6)] text-on-emphasis-dark',
  lime: 'bg-[var(--color-lime-6)] text-on-emphasis-dark',
  turquoise: 'bg-[var(--color-turquoise-6)] text-on-emphasis',
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
// 同 CAT_SOLID 的文字分桶(白 / 深,依上方「實心底字色原則」),raw token 版供 Avatar style 物件用。
export const CAT_SOLID_TOKENS: Record<CategoricalHue, { bg: string; text: string }> = {
  blue: { bg: 'var(--color-blue-6)', text: 'var(--on-emphasis)' },
  green: { bg: 'var(--color-green-6)', text: 'var(--on-emphasis)' },
  'deep-orange': { bg: 'var(--color-deep-orange-6)', text: 'var(--on-emphasis)' },
  yellow: { bg: 'var(--color-yellow-6)', text: 'var(--on-emphasis-dark)' },
  red: { bg: 'var(--color-red-6)', text: 'var(--on-emphasis)' },
  orange: { bg: 'var(--color-orange-6)', text: 'var(--on-emphasis)' },
  amber: { bg: 'var(--color-amber-6)', text: 'var(--on-emphasis-dark)' },
  lime: { bg: 'var(--color-lime-6)', text: 'var(--on-emphasis-dark)' },
  turquoise: { bg: 'var(--color-turquoise-6)', text: 'var(--on-emphasis)' },
  indigo: { bg: 'var(--color-indigo-6)', text: 'var(--on-emphasis)' },
  purple: { bg: 'var(--color-purple-6)', text: 'var(--on-emphasis)' },
  magenta: { bg: 'var(--color-magenta-6)', text: 'var(--on-emphasis)' },
}

/**
 * Calendar 全天 / 跨日長條(可點):淡底 step-1 + 字 step-7 + 滑過 step-2(1:1;calendar.spec.md「事件的兩種長相」左欄)。
 * 唯讀的長條用 `CAT_SUBTLE`(同底同字、不帶滑過);有時段事件是透明列 + 左側色條(`CAT_ACCENT`),不用這張表。
 * 淡底的滑過 = 同色離底更遠一格:淺色變深、深色變亮(色階號碼 = 離所在底色多遠;primitives.css 檔頭、
 * color.spec.md「Dark mode subtle」)。與上方實心色互動 state 不同 —— 那是 semantic `--{hue}-hover`(深色要反轉),
 * 這裡是淡底區 step-1 → step-2,兩主題同向,直接用 primitive(2026-09-26 深色 step-2..4 改半透明淡底後成立)。
 */
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

/**
 * Calendar 長條「詳情開著」:打開詳情的那一段 / 那一列在詳情開著時維持自己的滑過色(1:1,值 = `CAT_EVENT` 的滑過 step-2;
 * calendar.spec.md「「+N」清單浮層」點清單裡的事件、「事件詳情浮層」位置【AI 推導】)。由元素上的 `data-detail-open` 驅動,
 * 與滑過同值、不是另一種顏色:看得出「詳情是從這一筆開的」(Google Calendar 從 overview 點事件時,那一列維持反白)。
 * 有時段事件的透明列用 `--neutral-hover`(透明底的配對),neutral 長條用 `CAT_EVENT_NEUTRAL.open`。
 */
export const CAT_EVENT_OPEN: Record<CategoricalHue, string> = {
  blue: 'data-[detail-open]:bg-[var(--color-blue-2)]',
  green: 'data-[detail-open]:bg-[var(--color-green-2)]',
  'deep-orange': 'data-[detail-open]:bg-[var(--color-deep-orange-2)]',
  yellow: 'data-[detail-open]:bg-[var(--color-yellow-2)]',
  red: 'data-[detail-open]:bg-[var(--color-red-2)]',
  orange: 'data-[detail-open]:bg-[var(--color-orange-2)]',
  amber: 'data-[detail-open]:bg-[var(--color-amber-2)]',
  lime: 'data-[detail-open]:bg-[var(--color-lime-2)]',
  turquoise: 'data-[detail-open]:bg-[var(--color-turquoise-2)]',
  indigo: 'data-[detail-open]:bg-[var(--color-indigo-2)]',
  purple: 'data-[detail-open]:bg-[var(--color-purple-2)]',
  magenta: 'data-[detail-open]:bg-[var(--color-magenta-2)]',
}

/**
 * Calendar 有時段事件的色條:類別 step-6 實心(1:1;calendar.spec.md「事件的兩種長相」右欄)。**只給顏色** —— 色條是一個元素,
 * 寬、高、圓角由 Calendar 自己給(寬 = calendar-geometry.ts 的常數、高 = 字高、圓頭),不寫在色表裡。
 * 2026-11-25 前是全天事件的左側 3px 邊框(`border-l-[3px]` + 邊框色);全天改成淡底長條、不帶色條,色條改給有時段事件。
 */
export const CAT_ACCENT: Record<CategoricalHue, string> = {
  blue: 'bg-[var(--color-blue-6)]',
  green: 'bg-[var(--color-green-6)]',
  'deep-orange': 'bg-[var(--color-deep-orange-6)]',
  yellow: 'bg-[var(--color-yellow-6)]',
  red: 'bg-[var(--color-red-6)]',
  orange: 'bg-[var(--color-orange-6)]',
  amber: 'bg-[var(--color-amber-6)]',
  lime: 'bg-[var(--color-lime-6)]',
  turquoise: 'bg-[var(--color-turquoise-6)]',
  indigo: 'bg-[var(--color-indigo-6)]',
  purple: 'bg-[var(--color-purple-6)]',
  magenta: 'bg-[var(--color-magenta-6)]',
}

/**
 * Calendar 事件的 neutral(`CalendarEvent.color = 'neutral'`;不是色相,所以不進上面 12 色相的 map)。三個鍵對上面三張表:
 * - `event` ↔ `CAT_EVENT`:可點的全天 / 跨日長條 = `--secondary` 底 + `--foreground` 字,滑過換它自己的配對 `--secondary-hover`
 *  (color.spec.md「Static Subtle Background」bg-secondary 列「站在這個底上而且可點的…滑過時換自己的配對」、「Hover 換色配對總則」;
 *   同 Tag neutral 的底與字 `components/Tag/tag.tsx#tagVariants`,可點時的滑過同 FileItem 靜態小膠囊 `components/FileItem/file-item.tsx#FileItem`);
 * - `subtle` ↔ `CAT_SUBTLE`:唯讀的長條,同底同字、不帶滑過;
 * - `accent` ↔ `CAT_ACCENT`:有時段事件的色條 = `--color-neutral-9`(同 Tag / Avatar neutral solid 的 neutral-9);
 * - `open` ↔ `CAT_EVENT_OPEN`:詳情開著時維持滑過色 `--secondary-hover`。
 * 【AI 推導,calendar.spec.md「事件的兩種長相」neutral 那條;放在本檔 = 決策總帳 2026-11-25 AI 判定】
 */
export const CAT_EVENT_NEUTRAL = {
  event: 'bg-secondary text-foreground hover:bg-secondary-hover',
  subtle: 'bg-secondary text-foreground',
  accent: 'bg-[var(--color-neutral-9)]',
  open: 'data-[detail-open]:bg-secondary-hover',
} as const
