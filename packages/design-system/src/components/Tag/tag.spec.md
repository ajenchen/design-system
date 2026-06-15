---
component: Tag
family: 3
# categorical 色相(裝飾性分類,非語意狀態)。每個 variant 1:1 對 `--color-{hue}-*` primitive,零 offset。
# 語意(成功 / 錯誤 / 警告)由消費端內容與上下文決定,**不**由色名綁定 semantic token(見「禁止」段)。
# 對齊 Ant Tag「preset 原始色相名」categorical 模型 + Atlassian「categorical 色 vs semantic 色分離」。
variants:
  neutral:
    when: "通用分類、草稿、無特定語義（GitHub label default / Notion page tag untagged）"
    world-class: ["Polaris Tag default", "Atlassian Tag standard", "Ant Tag default"]
  blue:
    when: "categorical 色相（--color-blue-*）— 分類 / 標記，常用於資訊類"
    world-class: ["Ant Tag color=blue", "Notion tag color=blue", "Linear label color=blue"]
  green:
    when: "categorical 色相（--color-green-*）— 分類 / 標記，常用於完成 / 正向類"
    world-class: ["Ant Tag color=green", "Notion tag color=green", "GitHub label merged"]
  deep-orange:
    when: "categorical 色相（--color-deep-orange-*，hue 38）— 暖橙紅分類"
    world-class: ["Ant Tag color=volcano", "Notion tag color=orange", "Linear label color=orange"]
  yellow:
    when: "categorical 色相（--color-yellow-*，淺底深字）— 分類 / 標記，常用於注意類"
    world-class: ["Ant Tag color=gold", "Notion tag color=yellow", "Linear label color=yellow"]
  red:
    when: "categorical 色相（--color-red-*，品牌紅家族 hue 25；≠ 語意 --error，與 deep-orange 無關）"
    world-class: ["Ant Tag color=red", "Notion tag color=red", "Linear label color=red"]
  orange:
    when: "categorical 色相（--color-orange-*）— 分類 / 標記"
    world-class: ["Ant Tag color=orange", "Notion tag color=orange", "Linear label color=orange"]
  amber:
    when: "categorical 色相（--color-amber-*，淺底深字）— 琥珀分類"
    world-class: ["Ant Tag color=gold", "Notion tag color=yellow", "Linear label color=amber"]
  lime:
    when: "categorical 色相（--color-lime-*）— 黃綠分類"
    world-class: ["Ant Tag color=lime", "Notion tag color=green", "Linear label color=lime"]
  turquoise:
    when: "categorical 色相（--color-turquoise-*）— 產品線 / 團隊區別標記"
    world-class: ["Ant Tag color=cyan", "Notion tag color=teal", "Linear label color=turquoise"]
  indigo:
    when: "categorical 色相（--color-indigo-*）— 產品線 / 團隊區別標記"
    world-class: ["Ant Tag color=geekblue", "Notion tag color=blue", "Linear label color=indigo"]
  purple:
    when: "categorical 色相（--color-purple-*）— 產品線 / 團隊區別標記"
    world-class: ["Ant Tag color=purple", "Notion tag color=purple", "Linear label color=purple"]
  magenta:
    when: "categorical 色相（--color-magenta-*）— 產品線 / 團隊區別標記"
    world-class: ["Ant Tag color=magenta", "Notion tag color=pink", "Linear label color=pink"]
sizes:
  sm:
    when: "form field-height 28 / compact chrome / dialog / panel context"
  md:
    when: "default general UI"
  lg:
    when: "touch / prominent CTA / stakeholder-facing surface"
traits:
  - hasVariants
  - hasSizes
benchmark:
  - Ant Design Tag: github.com/ant-design/ant-design/tree/master/components/tag
  - MUI Chip: github.com/mui/material-ui/tree/master/packages/mui-material/src/Chip
  - Carbon Tag: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Tag
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Tag 設計原則

## 定位

Tag 是 inline label，用於分類標籤、狀態標記、多選已選值。不是 overlay 通知圓點（那是 Badge / Notification indicator）。

**實作基礎**：純視覺 atom——styled span + 可選 dismiss button，無 external primitive base。

**Layout Family**：CLAUDE.md 4-Family Model **Family 3（Pill Layout）** 的 **data indicator sub-profile**。SSOT 在 `components/Button/button.spec.md`「Pill Layout」章節；Tag 是 indicator variant（見下「與 Button 的差異」）。

## 與 Button 的差異（Family 3 indicator variant）

同 Family 結構 `[startIcon?] [<span px-1>label</span>] [suffix dismiss]`,但以下值不同——因為 role 是 **data indicator 非 action trigger**：

| 項目 | Button（action trigger） | Tag（data indicator） | 為什麼 |
|------|-------------------------|--------------------|-------|
| 外距 | `xs=px-2`, `sm+=px-3` | 全部 `px-1` | indicator 緊湊 passive,不搶焦點 |
| 字重 | `font-medium` | md/lg `font-normal`、sm `font-medium` | indicator 不強調（sm 例外見下方尺寸表）|
| Cursor | `pointer` | `text` | indicator 非 action（dismiss button 內部仍 pointer）|
| 字體 pairing | Button xs 是 standalone utility（text-caption 12px） | Tag md pair Field md（text-body 14px） | size 對應 Field, Tag 出現在 Field 內需視覺連續 |

**不該把 Tag 改成 Button 樣式來「統一」**——這是 world-class DS（Polaris / Material / Atlassian / Ant / Carbon）共識：action 跟 indicator padding + typography 分開。

---

## 何時用

- **分類標籤**：產品類別（Electronics / Food / Furniture）、文章 tag（React / Design / Tutorial）
- **狀態標記**：訂單狀態（In stock / Shipped / Delivered）——用 variant 色彩加速掃視
- **多選已選值**：Combobox / searchable 選擇後顯示的 tag 陣列
- **user-generated label**：使用者自己建立的標籤（如 Notion labels）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 通知計數 / 狀態紅點 | `Badge` | Badge 較小、適合 overlay、主要傳達數量或「有新東西」 |
| 互動式 filter（可點擊切換）| `Chip` | Tag 是純顯示，Chip 是可點擊控件 |
| Person 顯示（name + avatar）| `ProfileCard` / `Avatar + Text` | Tag 是單行 inline label，不承載人員資訊 |
| 可搜尋的多選入口 | `Combobox`（內部會渲染 Tag 陣列）| Combobox 才是選擇器，Tag 是選擇後的結果 |

---

## Color

以色名命名，**色名即色相，語義由消費端內容與上下文決定**（categorical 色，非 semantic 狀態）。Prop 命名 `color`（對齊 MUI Chip / Ant Tag / Atlaskit Tag world-class 多數派 idiom）。**12 色相 1:1 對 color token 的 categorical 色相**（`--color-{hue}-*`），與 Avatar / Calendar event 共用同一組 SSOT（`tokens/categorical-color.ts`），名實一致零 offset。 <!-- @benchmark-cited: Ant Design Tag preset colors https://ant.design/components/tag#components-tag-demo-colorful (raw hue names) -->

| Color | categorical 色相 |
|---------|----------|
| `neutral`（預設） | 通用分類、草稿、無特定語義（`--secondary` 底） |
| `blue` | `--color-blue-*` |
| `green` | `--color-green-*` |
| `deep-orange` | `--color-deep-orange-*`（hue 38） |
| `yellow` | `--color-yellow-*`（淺底深字） |
| `red` | `--color-red-*`（品牌紅家族 hue 25） |
| `orange` | `--color-orange-*` |
| `amber` | `--color-amber-*`（淺底深字） |
| `lime` | `--color-lime-*` |
| `turquoise` | `--color-turquoise-*` |
| `indigo` | `--color-indigo-*` |
| `purple` | `--color-purple-*` |
| `magenta` | `--color-magenta-*` |

所有有色 variant 直接使用 primitive token（`--color-blue-*` 等），不使用 semantic token（`--primary`、`--error`）。Tag 的「blue」代表藍色本身，不代表「主要操作」語義；「red」代表紅色（品牌紅 hue 25），**不代表 `--error`**。

**注意**：`red` 與語意 `--error` 完全無關 —— `--error` = `--color-deep-orange-6`（hue 38），而 `red` variant = `--color-red-*`（品牌紅 hue 25）。三者（`red` / `deep-orange` / `--error`）是各自獨立的色相 / 語意 token，**無映射關係**。2026-06-04 修正原「red variant 接 deep-orange」offset。

### 文字色

所有有色 variant 的文字一律使用 primitive step-7（`--color-{hue}-7`），優先辨識度。Primitives 的相對色階公式在 dark mode 自動把 step-7 解析為高對比方向，確保文字在 subtle 底色上始終可讀。Tag 以呈現資訊為主，小面積色塊文字需要更高對比才能舒適閱讀。neutral variant 用 `text-foreground`（不適用此規則）。

見 `color.spec.md` 的「文字色 Step 原則」。

---

## Solid 模式

`solid` boolean prop，預設 false。開啟後使用 step-6 全色背景 + on-emphasis 配對前景（yellow / amber / orange / lime 用深字，詳下「Solid 文字色規則」），適合需要更強視覺權重的場景（狀態標記、重點標籤）。

### Subtle vs Solid 選用準則(2026-06-11 user 拍板補,M8 benchmark)

| 場景 | 用 | 理由 |
|---|---|---|
| 被動分類 / 屬性標示(列表標籤、檔案類型、多 Tag 並排掃視)| **subtle**(預設)| 大量並排時低視覺噪音;對齊 Ant Tag filled 預設(淡底)、Atlassian Lozenge default(非 bold)|
| 高訊號狀態(當前工作流狀態、需立即辨識的單一重點、選取/啟用態區分)| **solid** | 一眼鎖定;對齊 Ant Tag solid「更濃郁視覺」([ant.design/components/tag](https://ant.design/components/tag))、Atlassian Lozenge `isBold` 強調態([atlassian.design/components/lozenge](https://atlassian.design/components/lozenge),search-only confidence)、Carbon selectable tag 必 high-contrast 區分 selected([carbondesignsystem.com/components/tag/usage](https://carbondesignsystem.com/components/tag/usage/),search-only confidence)|

**經驗法則**:一個視圖內 solid Tag 應是少數(≤1 類);整排都 solid = 全部都重點 = 沒有重點。

### Subtle vs Solid 色彩對照

| Variant | Subtle 背景 | Subtle 文字 | Solid 背景 | Solid 文字 |
|---|---|---|---|---|
| neutral | `--secondary`（neutral-3） | `--foreground` | `--color-neutral-9` | `--inverse-fg` |
| blue | `--color-blue-1` | `--color-blue-7` | `--color-blue-6` | `--on-emphasis`（白） |
| green | `--color-green-1` | `--color-green-7` | `--color-green-6` | `--on-emphasis`（白）★ |
| deep-orange | `--color-deep-orange-1` | `--color-deep-orange-7` | `--color-deep-orange-6` | `--on-emphasis`（白） |
| yellow | `--color-yellow-1` | `--color-yellow-7` | `--color-yellow-6` | **`--on-emphasis-dark`（深）** |
| red | `--color-red-1` | `--color-red-7` | `--color-red-6` | `--on-emphasis`（白） |
| orange | `--color-orange-1` | `--color-orange-7` | `--color-orange-6` | **`--on-emphasis-dark`（深）** |
| amber | `--color-amber-1` | `--color-amber-7` | `--color-amber-6` | **`--on-emphasis-dark`（深）** |
| lime | `--color-lime-1` | `--color-lime-7` | `--color-lime-6` | **`--on-emphasis-dark`（深）** |
| turquoise | `--color-turquoise-1` | `--color-turquoise-7` | `--color-turquoise-6` | `--on-emphasis`（白） |
| indigo | `--color-indigo-1` | `--color-indigo-7` | `--color-indigo-6` | `--on-emphasis`（白） |
| purple | `--color-purple-1` | `--color-purple-7` | `--color-purple-6` | `--on-emphasis`（白） |
| magenta | `--color-magenta-1` | `--color-magenta-7` | `--color-magenta-6` | `--on-emphasis`（白） |

**Solid 文字色規則（on-emphasis 配對,2026-06-04）**：依 step-6 底色明暗分桶，合規門檻 = WCAG **large/bold 3:1**（solid Tag 視為大粗字，user 拍板「以最低為原則」）。底夠深 → `--on-emphasis`（白）；底太亮(白字連 3:1 都不過)→ `--on-emphasis-dark`（深，= `black-a85`，原 `warning-foreground` 改名）：**yellow / amber / orange / lime** 四個。**★ green 例外**：green-6 白字實測 2.47（連 3:1 都不過），但維持白字（沿用慣見「綠底白字」觀感）= documented exception，待日後評估是否調 green-6。**SSOT**：上表機械對應 `tokens/categorical-color.ts`（`CAT_SUBTLE` / `CAT_SOLID`，1:1 + 對比由 `categorical-color-invariants.mjs` I4 機械驗，green exempt）。

### Dismiss 行為（Inline Action 客製）

Dismiss 是 Inline Action，但 icon 色繼承 Tag 文字色（非 `fg-muted`），因為宿主有色彩：

| 模式 | Icon 色 | Hover 背景 | Active 背景 |
|---|---|---|---|
| subtle | 繼承 Tag 文字色 | `--neutral-hover` | `--neutral-active` |
| solid（有色） | 繼承 Tag 文字色 | `--{hue}-hover`（如 `--blue-hover`） | `--{hue}-active` |
| solid neutral | `--inverse-fg` | `--inverse-neutral-hover` | `--inverse-neutral-active` |

**Solid dismiss 採 solid color shade change**——跟 Button 等互動元件同視覺語言（hover 換較亮 step、active 換較暗 step），維持整個設計系統的互動一致性。這是我們選擇 Atlassian-style semantic state token 流派的具體體現（非 Material 3 的 state layer overlay）。

#### 為什麼 Tag 同時用 primitive（靜態色）和 semantic（互動色）

這是 **有意的職責分離**，非 code smell：

| 概念 | 為什麼住這層 |
|------|------------|
| 靜態色（subtle bg、text、solid bg）→ **primitive** | 不需要 mode 翻轉知識——primitives 公式翻轉已自動處理 step-1 alpha、step-7 對比方向 |
| 互動色（hover、active）→ **semantic `--{hue}-hover/active`** | 需要保證「hover 永遠較亮、active 永遠較暗」，dark mode swap 必須住 semantic 層 |

兩個概念本來就不該綁同一層。Tailwind 也是同樣分離：`bg-blue-500`（靜態 scale step）vs `hover:bg-blue-600 dark:hover:bg-blue-400`（互動需 consumer 處理 mode）。差別只在於我們把 mode swap 封裝進 token，consumer 不需自己寫 dark variant。

詳細流派討論見 `color.spec.md` 的「架構流派定位」段落。

#### `--{hue}-hover/active` 的定位

Semantic 互動 token，從 brand color (`--primary-hover`) 延伸到所有作為 bg 的色相。**刻意只有 hover/active 兩個 token**——base/subtle/text 用 primitive。沒有 `--blue` base 或 `--blue-subtle`，避免重新引入完整 categorical 層。

#### Neutral 例外

neutral solid 的 bg 是 `--color-neutral-9`，在 dark mode 反轉（近黑 → 近白），bg 本身會跨 mode 變色。所以 overlay 不能用 `--{hue}-hover/active`（這些針對「bg 不變」的飽和色），改用 `--inverse-neutral-hover` / `--inverse-neutral-active`（內部處理 mode 鏡射 swap）。

Inline Action 的其他規則（尺寸、hover 背景 pattern）不變。

---

## 尺寸

三種尺寸（子元件補齊原則），不隨 density 變化。尺寸在元件內定義，不引用 field-height token——Tag 和 Button 尺寸是獨立的設計決策。

| Size | 高度 | 字體 | 字重 | Tag px | Text px | 配對 field |
|------|------|------|------|----------|---------|-----------|
| sm | 20px | text-caption (12px) | font-medium | 4px | 4px | field sm |
| md（預設） | 24px | text-body (14px) | font-normal | 4px | 4px | field md |
| lg | 24px | text-body (14px) | font-normal | 4px | 4px | field lg（與 md 同值，子元件補齊原則） |

**Tag 內 icon 統一 16px**，不分 Tag 尺寸。

## 內部結構

```
[tag-px] [icon? | avatar?] [text-px TEXT text-px] [dismiss?] [tag-px]
```

- tag-px：外層呼吸空間
- text-px：文字自身 padding（固定 4px），同時作為與 icon/avatar 和 dismiss 的間距
- 不用 gap——text padding 自然拉開
- icon / dismiss 顏色繼承文字色

### Props

| Prop | 類型 | 說明 |
|------|------|------|
| `icon` | `LucideIcon` | 左側 icon，Tag 統一 16px。與 avatar 互斥 |
| `avatar` | `ReactNode` | 左側 avatar。與 icon 互斥 |
| `onRemove` | `() => void` | 可移除——Tag 自動渲染 remove 按鈕並控制尺寸與互動樣式(從集合移除 item) |
| `solid` | `boolean` | 深底配對前景模式（step-6 背景；yellow/amber/orange/lime 用深字，其餘白字），預設 false |
| `unbounded` | `boolean` | 預設 false = 寬度 cap 160px;true = 寬度交給 parent constrain（cell-as-input narrow cell 場景），詳「邊界案例」 |

## 圓角

統一 `rounded-md`（4px）。

## Tag 間距

tag 與 tag 之間：`gap-1`（4px）。

## 包含 Tag 的 Field

Field 內包含 Tag 時，Field 的 padding 改為 `(field-height - tag-height) / 2`，確保 tag 四邊等距。

---

## Dismiss（Inline Action）

傳入 `onRemove` callback 時，Tag 自動渲染 remove 按鈕。消費端不需要自行建構 remove 按鈕或知道 inline action 的尺寸規格。

尺寸 / 互動規則共用 SSOT 見 `../../patterns/element-anatomy/inline-action.spec.md`(獨立 SSOT,2026-04-24 自 item-anatomy 抽出)。

**Icon 色彩特例（colored host)**：Tag dismiss icon **繼承 Tag 文字色**（非 `fg-muted`）— Tag 屬「colored host」分類。完整兩支規則（neutral host vs colored host）見上述 item-anatomy.spec.md SSOT。詳細每 variant 的 icon 色 + hover 背景見上面「Dismiss 行為（Inline Action 客製）」段。

| Tag size | Icon | Hover 背景 | 上下呼吸空間 |
|---|---|---|---|
| sm (20px) | 16px | 18px | 1px |
| md/lg (24px) | 16px | 18px | 3px |

---

## 邊界案例

- **極長文字**:預設寬度 cap 160px(`max-w-40` 等效),超出時文字 truncate ellipsis + **自動包 Tooltip 顯示全文**(Canvas measureText 偵測截斷);`unbounded=true` 時 cap 改由 parent 注入寬度 constrain。
- **Dark mode**:subtle 底(step-1 alpha 公式)/ step-7 文字自動高對比,solid 對比由 `categorical-color-invariants.mjs` I4 機械驗——皆 primitives 層處理,Tag 不 own dark token(見 `color.spec.md`)。
- **Disabled / Loading**:Tag 為純顯示 indicator,無此二 state(見「為何無 StateBehavior」);需互動 state → `Chip`。

---

## 禁止事項

- ❌ Tag 尺寸不引用 field-height token——兩者獨立
- ❌ 不用 gap 處理 icon/dismiss 間距——text padding 已拉開
- ❌ 不用 Tag 做 overlay 通知圓點——那是不同元件（Badge）
- ❌ 不用 color 名稱傳達語義（例：不靠 `red` = 錯誤）——color 是顏色，語義由消費端的內容和上下文決定
- ❌ 不用 prefix/suffix 傳入 remove 按鈕——用 `onRemove` callback，Tag 內部控制渲染

---

## 為何無 StateBehavior

Tag 是**純顯示 indicator**(非互動 — 見「與 Button 的差異」段),本身**無互動狀態**:

- 無 hover / focus / active / selected / disabled——Tag 是 Family 3 indicator variant(非 Pill button)。若要 hover / selected 語意,改用 `Chip`(可互動版本)。
- 僅有的「行為」是 remove(`onRemove` callback 觸發,Tag 本身不管 remove 動畫),close icon 的 hover 狀態屬 Inline Action pattern(`inline-action.spec.md` 獨立 SSOT),非 Tag 自有。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix`(variant solid/subtle) + `SizeMatrix`。互動狀態 → 改用 Chip(見「與 Button 的差異」段)。

---

## A11y 預設

Tag 是**純視覺 indicator**(非互動 control,互動版本是 Chip),預設 ARIA 行為:

- **靜態 Tag**(無 `onRemove`):render 為 `<div data-tag-root>`(無 role、`inline-flex`,SR 等價於無語意 generic container,視覺上為 inline-level 跟隨 inline flow)。若 Tag 表達狀態語意(「進行中」「已逾期」),consumer 應在父 region 用 `aria-label` 或視覺 prefix(icon)讓 SR 理解 context
- **Removable Tag**(`onRemove` 存在):inline X close 走 `<ItemInlineActionButton icon={X} size="md" aria-label="移除 {tagLabel}" />`(item-anatomy SSOT 的原生 `<button>`,非 `Button` 元件)— 對齊 inline-action canonical(`patterns/element-anatomy/inline-action.spec.md`)
- **Keyboard**:靜態 Tag 不取得 focus(無互動);dismissible 的 X 走原生 button 鍵盤(Tab → focus → Enter/Space → dismiss)
- **Color-only 語意警告**:Tag 用色相區分狀態時必有文字 label 或 prefix icon(色盲 user 友好);對齊 WCAG 1.4.1「不僅靠顏色傳達」
- **驗證**:Storybook a11y addon panel 0 critical violation;WCAG AA contrast ≥ 4.5:1(text)/ 3:1(icon)

## 相關

- `../Badge/badge.spec.md` — 通知計數 / 狀態紅點（overlay 場景）
- `../Chip/chip.spec.md` — 可互動 filter（Tag 的互動版本）
- `../Combobox/combobox.spec.md` — 多選場景會渲染 Tag 陣列
- `../ProfileCard/profile-card.spec.md` — 人員資訊顯示

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `avatar.spec.md`
- `badge.spec.md`
- `overflow-indicator.spec.md`
