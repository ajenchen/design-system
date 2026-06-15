---
component: Breadcrumb
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
benchmark:
  - Ant Design Breadcrumb: github.com/ant-design/ant-design/tree/master/components/breadcrumb
  - MUI Breadcrumbs: github.com/mui/material-ui/tree/master/packages/mui-material/src/Breadcrumbs
  - Polaris Breadcrumbs: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Breadcrumbs
  - Carbon Breadcrumb: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Breadcrumb
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

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

## 近親元件分界

| vs | 差異軸 | 何時用 Breadcrumb |
|---|---|---|
| **Tabs** | Tabs 平行視圖切換;Breadcrumb 階層位置 indicator | 表達「我在 A → B → C 的 C」 |
| **Steps** | Steps 是順序流程進度;Breadcrumb 是樹狀階層位置 | 非進度,而是 nested resource path |
| **Sidebar nav** | Sidebar 是全局導覽 chrome;Breadcrumb 是 content header 內 inline path | 局部位置 anchor,不取代全局 nav |
| **Link / page header** | Link 是單一導覽動作;Breadcrumb 是 parent-chain 完整路徑 | 路徑 ≥ 3 層需要可逐層回上 |

對齊 Polaris Breadcrumbs / Material Breadcrumb / Atlassian Breadcrumbs 共識:nav inside page header,不取代 sidebar。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 內部結構

```
<nav aria-label="Breadcrumb">
  <ol>
    <li>  BreadcrumbItem
      <a> BreadcrumbLink   ← clickable, 可回到上層
    </li>
    <li role="presentation" aria-hidden="true"> BreadcrumbSeparator (ChevronRight)
    </li>
    ...
    <li>
      <span role="link" aria-disabled="true" aria-current="page"> BreadcrumbPage  ← 當前頁面, 不可點
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
| `BreadcrumbPage` | 當前頁面（非 clickable）| `<span role="link" aria-disabled="true" aria-current="page">` |
| `BreadcrumbSeparator` | 項目間分隔 | `<li role="presentation">` + `ChevronRight` icon |
| `BreadcrumbEllipsis` | 省略中間路徑的 `⋯`（可點擊展開折疊路徑）| `<button type="button" aria-label="顯示折疊路徑">` + `MoreHorizontal`（消費 `ItemInlineActionButton` primitive，作為 DropdownMenuTrigger）|

---

## 視覺 Token

| Slot | Token | 原因 |
|---|---|---|
| 基底字體 | `text-body` (14px) | navigation 尺度的標準 |
| 間距（items 之間，含 separator）| `gap-1` (4px) | 緊湊節奏，符合 breadcrumb 密集流動感（`breadcrumb.tsx` BreadcrumbList `<ol>`）|
| **`BreadcrumbLink`（可點擊）預設** | `text-fg-secondary` | neutral-8, 提示「可互動但非焦點」 |
| **`BreadcrumbLink` hover** | **`text-primary-hover`** | 藍字 + `transition-colors duration-150`，明確回饋「點這個會有動作」 |
| **`BreadcrumbPage`（當前）** | `text-foreground`（不加粗）| neutral-9 深色區分於 fg-secondary 的 links，但**不加粗**——加粗會讓 breadcrumb 最右端視覺過重，破壞「你從哪來 → 你在這」的流動感 |
| **`BreadcrumbSeparator`** | `text-fg-muted` + `ChevronRight`,尺寸消費 `BREADCRUMB_ICON_SIZE`(`breadcrumb.tsx` SSOT,對齊 `uiSize.spec.md` Icon Size Tier)| 視覺降噪,separator 不搶焦點 |
| **`BreadcrumbEllipsis`** | `text-fg-muted` + `MoreHorizontal`,消費 `ItemInlineActionButton` 固定 `size="md"`(不隨 BreadcrumbList size 變化)| 尺寸 SSOT 在 `inline-action.spec.md` 尺寸表;固定 md 的理由詳 `breadcrumb.tsx` |
| **`BreadcrumbLink` / `BreadcrumbPage` `startIcon`** | `<Icon size={BREADCRUMB_ICON_SIZE[size]} aria-hidden />` | 首項 Home icon 業界慣例(Material / Atlassian)。Consumer 只傳 `LucideIcon`,DS 統一管 size 消費 BREADCRUMB_ICON_SIZE SSOT — 對齊 `uiSize.spec.md` Icon Size Tier,**禁 consumer 傳 size prop**(避免寫死 drift)|

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

## Single-line + Overflow / 長路徑處理(2026-05-10 升級)

**Single-line canonical**:BreadcrumbList 預設 `flex-nowrap`,**不 wrap 到下一行**。對齊 Material UI / GitHub / Notion / Linear / Atlassian 共識(WebFetch verified Material UI source `Breadcrumbs.js renderItemsBeforeAndAfter`)。路徑過長走中段折疊,非 multi-line wrap。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

當路徑層級太深(> 4–5 層)且容器寬度有限,world-class 作法是**中段折疊**:

```
首頁 › ⋯ › 成員管理 › 權限設定
```

**v1 現況**(consumer 手動):
- 保留第一個 + 最後 1–2 items;中間用 `<BreadcrumbEllipsis>` 折疊
- `<BreadcrumbEllipsis>` 消費 `ItemInlineActionButton` primitive(per inline-action.spec.md predicate + M1 SSOT 消費),`overlayTrigger=true` 內建 DropdownMenu open 視覺鎖
- 包 `<DropdownMenuTrigger asChild>` 提供點 ⋯ 展開互動

**v2 shipped Phase B**(2026-05-10):declarative `items` prop + `maxItems`(**default 4**,user-tuned;Material UI source 預設 8)+ `itemsBeforeCollapse`(default 1)+ `itemsAfterCollapse`(default 1)auto-collapse mode。對齊 Material UI source `Breadcrumbs.js renderItemsBeforeAndAfter` mechanism(2026-05-10 WebFetch verified)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

```tsx
<BreadcrumbList
  items={[
    { label: '組織', href: '/org' },
    { label: '產品團隊', href: '/team' },
    { label: '成員管理', href: '/members' },
    { label: '權限', href: '/permissions' },
    { label: '編輯角色' },  // 無 href → 自動 BreadcrumbPage(末位)
  ]}
  // maxItems={4}              // default
  // itemsBeforeCollapse={1}   // default
  // itemsAfterCollapse={1}    // default
/>
```

**Per-item width canonical(Phase B)— flex-shrink hierarchy**:

| Role(`data-bc-role`)| `flex-shrink` | 行為 |
|---|---|---|
| `root`(首位)| **3** | 縮最積極(root context 可弱化)|
| `middle`(中段)| **2** | 次積極 |
| `current`(末位 / BreadcrumbPage)| **1** | 最後縮(a11y current page anchor)|
| `ellipsis`(BreadcrumbEllipsis 包裝)| **0** | 永遠完整顯示 ⋯ |
| `BreadcrumbSeparator` | **0** | 永遠完整(否則 path 視覺斷裂)|

**為何 flex-shrink hierarchy 不用 fixed max-width**:
- 容器寬 / items 少 → 各 item 自然寬度,**不浪費剩餘空間**
- 容器窄 / items 多 → 按 priority 縮(root 先 → middle → current 最後)
- 都縮到 `min-w-0` 後 CSS `truncate` 開啟 + Tooltip 補完整文字
- Root **也會** truncate(shrink:3 縮最積極)— 不是 `shrink-0`

**Truncate-on-overflow + tooltip canonical**(消費 Tooltip「資訊補救」canonical,見 `tooltip.principles.stories.tsx`):
- 每 BreadcrumbLink / BreadcrumbPage 內部 wrap `<TruncatedLabel>` — 與 DataTable `TruncateCell` / Tag truncate 同一 idiom(偵測機制詳 `breadcrumb.tsx`)
- 只在實際 truncate 時才顯 Tooltip — 沒被截斷不顯

世界級對照:
- **Material UI**:`maxItems=8` declarative auto-collapse(source verified,no per-item width rule)
- **Polaris**:點 ⋯ DropdownMenu 展開
- **Atlassian**:中段 ⋯ + dropdown
- **GitHub / Notion / Linear / Apple Finder**:auto truncate 中段
- Per-item width(flex-shrink hierarchy)無世界級 source 可考(**unverified**)— 本 DS 自有設計,依據詳上方「為何 flex-shrink hierarchy 不用 fixed max-width」

## Title-breadcrumb-end 同步 canonical(2026-05-10 新增)

**Breadcrumb 末位 `<BreadcrumbPage>` 文字 = page title `<h2>` / `<h3>` / `<h4>` 內容**。對齊 GitHub / Notion / Linear / Atlassian / Material UI examples 共識。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

具體 pairing(per BreadcrumbList size):
- `size="sm"` + 末位 `<BreadcrumbPage>X</BreadcrumbPage>` + `<h4>X</h4>` 同字
- `size="md"`(default)+ 末位 `<BreadcrumbPage>X</BreadcrumbPage>` + `<h3>X</h3>` 同字
- `size="lg"` + 末位 `<BreadcrumbPage>X</BreadcrumbPage>` + `<h2>X</h2>` 同字

**為何同字重複**:breadcrumb 末位是 a11y 階層 navigation 階梯末端(`aria-current="page"`);title h2/h3/h4 是同字**視覺大字 emphasis**。兩者各司其職:小字 breadcrumb 提供路徑 context,大字 title 提供 page identity。同 SSOT 兩 view。

**禁止**:breadcrumb 末位用 `BreadcrumbLink`(parent path)+ title 才顯示 current page = breadcrumb 末位 ≠ title 內容 = 違反「禁止事項」段「最後一項不可是 `BreadcrumbLink`,必須用 `BreadcrumbPage`」+ 違反 world-class consensus。

---

## 邊界案例

- **空值**:`items={[]}` 渲染空容器、空 label 渲染空節點(元件皆不 guard)— 單一層級本就禁用 Breadcrumb(見禁止事項),consumer 應條件性不渲染
- **中段項無 `href`**:declarative mode 僅末位自動轉 `BreadcrumbPage`;中段項無 `href` 仍渲染 `BreadcrumbLink`(輸出無 `href` 的 `<a>`,不可 focus / 不可導覽)
- **Loading / Error**:本元件無 loading / error state — 純 sync 展示元件;async 路徑載入時 consumer 以 Skeleton 取代整條(對齊 Steps 同類處理),路徑解析失敗的降級由 consumer own
- **多語言長字串**:truncate 為 CSS 字元級裁切,不分語言(中英同規則),完整文字由 Tooltip 補(見 truncate canonical)
- **RTL**:未實作方向鏡像(separator 固定 `ChevronRight`,flex-shrink hierarchy 以 LTR 設計);RTL 屬 DS-wide 決策,未定

---

## 禁止事項

- ❌ **不用 `/` 字元作分隔**——用 `ChevronRight` icon。`/` 是文字字元，跟文字對齊不穩、顏色綁 text、screen reader 會讀出「斜線」
- ❌ **最後一項不可是 `BreadcrumbLink`**——最後一項代表當前頁，無處可點。必須用 `BreadcrumbPage`
- ❌ **Breadcrumb 不做頁面切換動作的「back 按鈕」**——back 的語意是「上一步瀏覽歷史」不是「上一層階層」，兩者目的地可能不同（從搜尋結果直接進深層頁時，back 回搜尋結果＝歷史，breadcrumb 上一層回 parent＝階層）。Back 用 Button 或瀏覽器原生
- ❌ **不得在 Breadcrumb 裡嵌入複雜互動元素**（dropdown、search、avatar picker）——使用者對 breadcrumb 的心智模型是「每個節點都是回上層的連結」，混入查詢 / 選擇功能會打斷路徑掃讀，breadcrumb 就變成 nav bar（`BreadcrumbEllipsis` 展開折疊路徑的選單屬路徑導覽本身、是本 spec 既定 canonical，非此禁令範圍——禁令指 consumer 自嵌的業務 dropdown / search）
- ❌ **不得覆寫 `BreadcrumbLink` 的 hover 色彩**——`primary-hover` 是全系統的「互動高亮」canonical，覆寫破壞語言一致性
- ❌ **不得把 Breadcrumb 拿來當 sidebar 或 top nav 替代**——breadcrumb 只顯示當前路徑，不展示 sibling 選項
- ❌ **單一層級頁面不要放 Breadcrumb**——「首頁」一個 item 沒導覽價值，造成視覺噪音

---

## anatomy story 結構

互動 `Inspector`(切 `size` / `showHomeIcon` / `pathLength` / `maxItems` / collapse 設定,即時看路徑深度 × 折疊行為)搭配 `CollapseMatrix` / `SizeMatrix` / `ColorMatrix` / `StateBehavior` / 元件特有 `UsageExamples` 結構矩陣 + 真實場景,完整覆蓋 collapse 策略 × size × 當前頁狀態的決策維度。

ColorMatrix 已建:展示 BreadcrumbLink / Page / Separator / Ellipsis 四種節點的 default / hover / focus 色彩矩陣,採 fg-muted → fg-secondary → foreground 的階層策略(對齊 GitHub / Notion / Linear)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 相關

- `Tabs` — 切換平行 view 的導覽（不同層級的 problem，breadcrumb 是階層內，Tabs 是同層切換）
- `Button variant="link"` — 一般文字連結按鈕
- `Sidebar` — 主導覽（breadcrumb 用來補 sidebar 之外的「當前位置」資訊）

## A11y 預設

**ARIA / Pattern**:純 HTML 結構元件(nav + ol + li + a/span),無第三方 primitive。a11y 來自原生 HTML 語意 — 外層 `<nav aria-label="Breadcrumb">`、當前頁 `<span role="link" aria-disabled="true" aria-current="page">`、分隔符 `aria-hidden`(不進無障礙樹)。對齊 [WAI-ARIA Breadcrumb pattern](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/)。

**為何當前頁加 `role="link" aria-disabled="true"`**:BreadcrumbPage 是「被 disable 的連結」— 把它標記成連結家族(`role="link"`)讓螢幕閱讀器把整條 breadcrumb 念成同一個連結序列,再以 `aria-disabled="true"` 告知不可操作(對齊 shadcn/ui Breadcrumb canonical `BreadcrumbPage`)。WAI-ARIA APG 允許 current 用 link + `aria-current`,shadcn 加 `aria-disabled` 是合理增強。

**Keyboard 行為**:

- Tab — 逐個 link 導覽
- Enter — navigate

**Focus**:聚焦時顯示 visible ring;`BreadcrumbLink` 用 `focus-visible:ring-2 ring-ring ring-offset-1`（box-shadow ring，對齊全系統 focus-visible canonical，見上方「互動狀態」段），`BreadcrumbEllipsis` 按鈕（消費 `ItemInlineActionButton`）用 `focus-visible:outline-2 outline-ring`。連結逐個依序成為 tab stop,不攔截焦點(無 focus trap — breadcrumb 是序列式導覽,trap 反而是無障礙 bug)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `steps.spec.md`
