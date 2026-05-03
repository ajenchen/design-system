---
component: Breadcrumb
family: null
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Breadcrumb 設計原則

## 定位

Breadcrumb 顯示「當前頁面在資訊階層中的位置」，同時提供快速回到上層的路徑導覽。
基於 shadcn/ui Breadcrumb 結構（純 HTML + Tailwind，無 Radix primitive），橋接設計系統 token。

**Breadcrumb 是「你在哪裡」的指示器，不是「你可以去哪裡」的選單**——反映當前路徑，不是全部可能路徑。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **頁面深度 ≥ 3 層**的資訊階層導覽（專案 / 子專案 / 任務，組織 / 團隊 / 成員 / 設定）
- **檔案管理器類 UI**（folder 路徑）
- **電商多層分類**（Home / Electronics / Phones / iPhone 15）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 頁面結構只有 1–2 層 | page header + back button | 兩層不值得 Breadcrumb 的視覺投資 |
| 切換**平行** view（非階層）| `Tabs` | Breadcrumb 表達的是 parent-child 關係 |
| 主導覽 | `Sidebar` / top nav | Breadcrumb 反映當前位置，不是全局導覽 |

---

## 內部結構

```
<nav aria-label="Breadcrumb">
  <ol>
    <li>  BreadcrumbItem
      <a> BreadcrumbLink   ← clickable, 可回到上層
    </li>
    <li>
      <span> BreadcrumbSeparator (ChevronRight, aria-hidden)
    </li>
    ...
    <li>
      <span> BreadcrumbPage  ← 當前頁面, 不可點, aria-current="page"
    </li>
  </ol>
</nav>
```

### 元件家族

| 元件 | 語意 | HTML |
|---|---|---|
| `Breadcrumb` | 整個 nav 容器 | `<nav aria-label="Breadcrumb">` |
| `BreadcrumbList` | items 清單 | `<ol>` flex row |
| `BreadcrumbItem` | 單一項目容器 | `<li>` |
| `BreadcrumbLink` | 可點擊路徑項（非當前）| `<a>` 或 Slot（支援 `asChild` 給 router Link）|
| `BreadcrumbPage` | 當前頁面（非 clickable）| `<span aria-current="page">` |
| `BreadcrumbSeparator` | 項目間分隔 | `<li role="presentation">` + `ChevronRight` icon |
| `BreadcrumbEllipsis` | 省略中間路徑的 `⋯` | `<span aria-hidden>` + `MoreHorizontal` |

---

## 視覺 Token

| Slot | Token | 原因 |
|---|---|---|
| 基底字體 | `text-body` (14px) | navigation 尺度的標準 |
| 間距（items 之間） | `gap-2` (8px) | 對齊 item-layout pattern 的 slot gap |
| **`BreadcrumbLink`（可點擊）預設** | `text-fg-secondary` | neutral-8, 提示「可互動但非焦點」 |
| **`BreadcrumbLink` hover** | **`text-primary-hover`** | 藍字 + `transition-colors duration-150`，明確回饋「點這個會有動作」 |
| **`BreadcrumbPage`（當前）** | `text-foreground`（不加粗）| neutral-9 深色區分於 fg-secondary 的 links，但**不加粗**——加粗會讓 breadcrumb 最右端視覺過重，破壞「你從哪來 → 你在這」的流動感 |
| **`BreadcrumbSeparator`** | `text-fg-muted` + `ChevronRight` size=14 | 視覺降噪，separator 不搶焦點 |
| **`BreadcrumbEllipsis`** | `text-fg-muted` + `MoreHorizontal` size=14 | 同 separator 層級 |

## 對齊既有設計語言

- **色彩三階層**（fg-secondary → foreground / primary-hover → fg-muted）跟 MenuItem / Tabs trigger / SegmentedControl 的三階層結構一致：**次要 → 主要（或 hover 強調） → 弱化**
- **`primary-hover` 在 Breadcrumb 的用法是「互動時文字變藍」**，跟 Tabs underline / Chip border / SegmentedControl border 用 `primary-hover` 的 canonical 選中規則屬於同一個色彩語言（`primary-hover` = 互動高亮）
- **分隔 icon 用 `ChevronRight`**（不用 `/` 字元）對齊 Button `endIcon` 的「方向指示」icon 選擇

---

## 互動狀態

### `BreadcrumbLink`
- **Default**：`text-fg-secondary`
- **Hover**：`text-primary-hover`（使用者要求的核心互動）
- **Active/Click**：瀏覽器原生 `:active` 反饋，不特別覆寫
- **Focus-visible**：`ring-2 ring-ring ring-offset-1`（對齊全系統 focus 規則）
- **Disabled**：通常 breadcrumb link 不會 disabled（如果需要，consumer 自己處理為 `BreadcrumbPage` 樣式）

### `BreadcrumbPage`
- 無互動狀態，只是 text。`aria-current="page"` 給螢幕閱讀器

### `BreadcrumbSeparator`
- 無互動。`aria-hidden`（語意分隔由 `<ol>` / `<li>` 結構承擔）

---

## Overflow / 長路徑處理

當路徑層級太深（> 4–5 層）且容器寬度有限時，world-class 作法是**中段折疊**：

```
首頁 › ⋯ › 成員管理 › 權限設定
```

具體：
- **保留第一個** 和 **最後 1–2 個** items
- **中間用 `BreadcrumbEllipsis`（⋯）折疊**
- `BreadcrumbEllipsis` 預設是 display-only icon；consumer 想要「點 ⋯ 展開折疊的項目」可以把它包在 `DropdownMenu` trigger 裡（v1 不內建這行為）

**決定折疊策略是 consumer 的事**，Breadcrumb 元件只提供元件家族和視覺，不內建自動偵測 overflow 的邏輯（比 Tabs / Chip 的 overflow 簡單，因為 breadcrumb 路徑是靜態的）。

世界級對照：
- **Material**：支援點擊 ⋯ 展開
- **Polaris**：同
- **Atlassian**：直接顯示完整路徑，consumer 自己決定 truncation

---

## 禁止事項

- ❌ **不用 `/` 字元作分隔**——用 `ChevronRight` icon。`/` 是文字字元，跟文字對齊不穩、顏色綁 text、screen reader 會讀出「斜線」
- ❌ **最後一項不可是 `BreadcrumbLink`**——最後一項代表當前頁，無處可點。必須用 `BreadcrumbPage`
- ❌ **Breadcrumb 不做頁面切換動作的「back 按鈕」**——back 的語意是「上一步瀏覽歷史」不是「上一層階層」，兩者不同。Back 用 Button 或瀏覽器原生
- ❌ **不得在 Breadcrumb 裡嵌入複雜互動元素**（dropdown、search、avatar picker）——breadcrumb 是「位置指示器」，塞功能會變 nav bar
- ❌ **不得覆寫 `BreadcrumbLink` 的 hover 色彩**——`primary-hover` 是全系統的「互動高亮」canonical，覆寫破壞語言一致性
- ❌ **不得把 Breadcrumb 拿來當 sidebar 或 top nav 替代**——breadcrumb 只顯示當前路徑，不展示 sibling 選項
- ❌ **單一層級頁面不要放 Breadcrumb**——「首頁」一個 item 沒導覽價值，造成視覺噪音

---

## 為何無 Inspector

Breadcrumb 決策維度是 collapse 策略 × size × 當前頁狀態,已在 `CollapseMatrix` / `SizeMatrix` / `ColorMatrix` / `StateBehavior` / 元件特有 `UsageExamples` 五張結構矩陣 + 真實場景完整覆蓋。互動 Inspector(切換 size / truncate)無法呈現「路徑深度 + 斷點」這類真實場景決策——`UsageExamples` 展示實際業務路徑更直接。

ColorMatrix 已建:展示 BreadcrumbLink / Page / Separator / Ellipsis 四種節點的 default / hover / focus 色彩矩陣,採 fg-muted → fg-secondary → foreground 的階層策略(對齊 GitHub / Notion / Linear)。

---

## 相關

- `Tabs` — 切換平行 view 的導覽（不同層級的 problem，breadcrumb 是階層內，Tabs 是同層切換）
- `Button variant="link"` — 一般文字連結按鈕
- `Sidebar` — 主導覽（breadcrumb 用來補 sidebar 之外的「當前位置」資訊）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `steps.spec.md`
