---
component: Tag
family: 3
variants:
  neutral:
    when: "通用分類、草稿、無特定語義（GitHub label default / Notion page tag untagged）"
    world-class: ["Polaris Tag default", "Atlassian Tag standard", "Ant Tag default"]
  blue:
    when: "進行中、資訊提示、active 狀態（對應 --info）"
    world-class: ["Atlassian Lozenge inProgress", "Jira status=in progress", "Linear status=in progress"]
  red:
    when: "錯誤、已封鎖、危險（對應 --error）"
    world-class: ["Atlassian Lozenge removed", "Jira status=blocked", "Ant Tag color=red"]
  green:
    when: "成功、已完成、已核准（對應 --success）"
    world-class: ["Atlassian Lozenge success", "Jira status=done", "GitHub label merged"]
  yellow:
    when: "警告、待審核、注意（對應 --warning）"
    world-class: ["Atlassian Lozenge moved", "Jira status=review", "Ant Tag color=warning"]
  turquoise:
    when: "分類色（無固定語義）— 產品線 / 團隊區別標記"
    world-class: ["GitHub label custom hex", "Notion tag color=teal", "Linear label color=turquoise"]
  purple:
    when: "分類色（無固定語義）— 產品線 / 團隊區別標記"
    world-class: ["GitHub label custom hex", "Notion tag color=purple", "Linear label color=purple"]
  magenta:
    when: "分類色（無固定語義）— 產品線 / 團隊區別標記"
    world-class: ["GitHub label custom hex", "Notion tag color=pink", "Linear label color=pink"]
  indigo:
    when: "分類色（無固定語義）— 產品線 / 團隊區別標記"
    world-class: ["GitHub label custom hex", "Notion tag color=blue", "Linear label color=indigo"]
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
  - hasInteractiveStates
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
| 字重 | `font-medium` | `font-normal` | indicator 不強調 |
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
| Person 顯示（name + avatar）| `NameCard` / `Avatar + Text` | Tag 是單行 inline label，不承載人員資訊 |
| 可搜尋的多選入口 | `Combobox`（內部會渲染 Tag 陣列）| Combobox 才是選擇器，Tag 是選擇後的結果 |

---

## Variant

以色名命名，語義由消費端決定。建議用法與色彩系統的語義定義對齊。

| Variant | 建議用法 |
|---------|----------|
| `neutral`（預設） | 通用分類、草稿、無特定語義 |
| `blue` | 進行中、資訊提示、active 狀態（對應 `--info`） |
| `red` | 錯誤、已封鎖、危險（對應 `--error`） |
| `green` | 成功、已完成、已核准（對應 `--success`） |
| `yellow` | 警告、待審核、注意（對應 `--warning`） |
| `turquoise` | 分類色（無固定語義） |
| `purple` | 分類色（無固定語義） |
| `magenta` | 分類色（無固定語義） |
| `indigo` | 分類色（無固定語義） |

所有有色 variant 直接使用 primitive token（`--color-blue-*`、`--color-deep-orange-*` 等），不使用 semantic token（`--primary`、`--error`）。Tag 的「blue」代表藍色本身，不代表「主要操作」語義。

**注意**：`red` variant 使用 primitive `deep-orange`（`--color-deep-orange-*`）。

### 文字色

所有有色 variant 的文字一律使用 primitive step-7（`--color-{hue}-7`），優先辨識度。Primitives 的相對色階公式在 dark mode 自動把 step-7 解析為高對比方向，確保文字在 subtle 底色上始終可讀。Tag 以呈現資訊為主，小面積色塊文字需要更高對比才能舒適閱讀。neutral variant 用 `text-foreground`（不適用此規則）。

見 `color.spec.md` 的「文字色 Step 原則」。

---

## Solid 模式

`solid` boolean prop，預設 false。開啟後使用 step-6 全色背景 + 白色前景，適合需要更強視覺權重的場景（狀態標記、重點標籤）。

### Subtle vs Solid 色彩對照

| Variant | Subtle 背景 | Subtle 文字 | Solid 背景 | Solid 文字 |
|---|---|---|---|---|
| neutral | `--muted` | `--foreground` | `--color-neutral-9` | `--inverse-fg` |
| blue | `--color-blue-1` | `--color-blue-7` | `--color-blue-6` | white |
| red | `--color-deep-orange-1` | `--color-deep-orange-7` | `--color-deep-orange-6` | white |
| green | `--color-green-1` | `--color-green-7` | `--color-green-6` | white |
| yellow | `--color-yellow-1` | `--color-yellow-7` | `--color-yellow-6` | **`--warning-foreground`** |
| turquoise | `--color-turquoise-1` | `--color-turquoise-7` | `--color-turquoise-6` | white |
| purple | `--color-purple-1` | `--color-purple-7` | `--color-purple-6` | white |
| magenta | `--color-magenta-1` | `--color-magenta-7` | `--color-magenta-6` | white |
| indigo | `--color-indigo-1` | `--color-indigo-7` | `--color-indigo-6` | white |

**yellow 例外**：yellow solid 背景亮度高，白字對比不足，改用 `--warning-foreground`（深色文字）。

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
| `onDismiss` | `() => void` | 可移除——Tag 自動渲染 dismiss 按鈕並控制尺寸與互動樣式 |
| `solid` | `boolean` | 深底白字模式（step-6 背景 + 白色前景，yellow 例外），預設 false |

## 圓角

統一 `rounded-md`（4px）。

## Tag 間距

tag 與 tag 之間：`gap-1`（4px）。

## 包含 Tag 的 Field

Field 內包含 Tag 時，Field 的 padding 改為 `(field-height - tag-height) / 2`，確保 tag 四邊等距。

---

## Dismiss（Inline Action）

傳入 `onDismiss` callback 時，Tag 自動渲染 dismiss 按鈕。消費端不需要自行建構 dismiss 按鈕或知道 inline action 的尺寸規格。

尺寸 / 互動規則共用 SSOT 見 `../../patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」段落。

**Icon 色彩特例（colored host)**：Tag dismiss icon **繼承 Tag 文字色**（非 `fg-muted`）— Tag 屬「colored host」分類。完整兩支規則（neutral host vs colored host）見上述 item-anatomy.spec.md SSOT。詳細每 variant 的 icon 色 + hover 背景見上面「Dismiss 行為」表（92-100 行）。

| Tag size | Icon | Hover 背景 | 上下呼吸空間 |
|---|---|---|---|
| sm (20px) | 16px | 18px | 1px |
| md/lg (24px) | 16px | 18px | 3px |

---

## 禁止事項

- ❌ Tag 尺寸不引用 field-height token——兩者獨立
- ❌ 不用 gap 處理 icon/dismiss 間距——text padding 已拉開
- ❌ 不用 Tag 做 overlay 通知圓點——那是不同元件（Badge）
- ❌ 不用 variant 名稱傳達語義（例：不靠 `red` = 錯誤）——variant 是顏色，語義由消費端的內容和上下文決定
- ❌ 不用 prefix/suffix 傳入 dismiss 按鈕——用 `onDismiss` callback，Tag 內部控制渲染

---

## 為何無 StateBehavior

Tag 是**純顯示 indicator**(非互動 — 見「與 Button 的差異」段),本身**無互動狀態**:

- 無 hover / focus / active / selected / disabled——Tag 是 Family 3 indicator variant(非 Pill button)。若要 hover / selected 語意,改用 `Chip`(可互動版本)。
- 僅有的「行為」是 dismiss(`onDismiss` callback 觸發,Tag 本身不管 dismiss 動畫),close icon 的 hover 狀態屬 Inline Action pattern(item-anatomy.spec.md「Inline Action 設計規格」SSOT),非 Tag 自有。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix`(variant solid/subtle) + `SizeMatrix`。互動狀態 → 改用 Chip(見「與 Button 的差異」段)。

---

## 相關

- `../Badge/badge.spec.md` — 通知計數 / 狀態紅點（overlay 場景）
- `../Chip/chip.spec.md` — 可互動 filter（Tag 的互動版本）
- `../Combobox/combobox.spec.md` — 多選場景會渲染 Tag 陣列
- `../NameCard/name-card.spec.md` — 人員資訊顯示

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `overflow-indicator.spec.md`
