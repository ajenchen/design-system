<!-- @benchmark-cited: D5 retrofit 2026-05-18 — verified 0 world-class DS claim in body; blanket retract removed. -->

# Density 設計原則

Density 由**兩個獨立維度**構成,並配合一個 convenience attribute 同時控制兩者:

| 維度 | 管的是 | attribute | 範例 |
|------|--------|-----------|------|
| **UI Size** | 元件**高度 / 內距**(Button / Input / SelectionItem / field-height / table-row) | `data-ui-size` | `md`(32px field-height-md)/ `lg`(36px field-height-md) |
| **Layout Space** | 版面**間距 / 外框 padding**(section gutter / dialog body padding / form gap) | `data-layout-space` | `md`(tight gap)/ `lg`(loose gap) |
| **Density**(convenience)| 一鍵同時切兩者 | `data-density` | `md` / `lg` |

## 兩維度為何解耦(世界級對照)

**Carbon Design System**:spacing scale 獨立於 component size([carbondesignsystem.com/elements/spacing](https://carbondesignsystem.com/elements/spacing/overview/))
**GitHub Primer**:8px base unit scale 獨立於 control size([styleguide.github.com/primer](https://styleguide.github.com/primer/support/spacing/))
**Atlassian**:spacing tokens 可單獨消費(partial decouple)

**反例**(耦合):Material M3 / Polaris density 模式綁 control size + spacing — 無法「寬版面 + 標準 control」的場景。

**我們走 decouple 流派**:解決 Dialog / overlay chrome 的痛點 — header 想要版面間距寬鬆(layout-space=lg),但不要被 button chrome 撐高(ui-size 跟 page 走 md)。

## 預設同步(density convenience)

日常使用:不管兩個維度,直接 `data-density` 一次切兩者:

```html
<html data-theme="light" data-density="md">
```

- **md**(預設):資訊密集的桌面 UI / form-heavy 頁面
- **lg**:觸控裝置 / 需要更大點擊目標的情境

`data-density` 內部等同同時設 `data-ui-size` + `data-layout-space` 相同 tier。CSS selectors 同時監聽 `[data-density="lg"], [data-ui-size="lg"]` 等(見 `uiSize.css` + `layoutSpace.css`)。

## 解耦用法(canonical 情境)

當需要「版面間距寬鬆(layout-space)+ 控件高度標準(ui-size)」時,**顯式設兩個 attribute**:

### Canonical 情境 1 — Overlay 的 layout-space tier(2026-06-15 重訂)

**核心原則**:浮層(Portal overlay)**預設全繼承 page density**;只鎖「**有設計理由 + 該元件真的消費到**」的那個 dial,**禁用 `data-density` master switch 鎖浮層**(它連 ui-size 一起鎖 → 內部控件 / 選單 item 對不上觸發點)。**ui-size 永遠跟 page** —— 浮層只決定「版面間距 tier」(layout-space),控件大小交給 page。

| 浮層 | 鎖 | 理由 |
|------|----|------|
| Dialog | **不鎖(繼承 page)** | layout-space 本 spec 第 10 行定義即管「dialog body padding」,鎖死 = override 自家 dial 自相矛盾;modal 寬鬆需求在 lg 階自然滿足(md 16 = Polaris 下限合格);button 不撐高由 ui-size 繼承解決。有同類 dial 的 SAP/Cloudscape modal 跟 dial、不鎖 |
| Popover / Coachmark | `data-layout-space="md"` | 輕量浮層 → header py-tight 保持精簡;ui-size 跟 page 讓內部 field 控件對齊觸發點。Coachmark 建在 Popover 上自動繼承 |
| Tooltip / DropdownMenu | 不鎖(繼承 page) | 不消費任何 layout-space token(Tooltip padding 寫死 px-3 py-2;Dropdown 是 RowSize + py-2);鎖 ui-size 會把選單 item(field-height-{size})釘在 md-scale → 對不上 lg 觸發點 |
| Sheet | 不鎖(繼承 page) | 側板,螢幕變小時常駐側板會 responsive 變 Sheet;若 Sheet 鎖 tier 而側板繼承 page → 切換瞬間跳 mode,不一致 |
| FileViewer | 不鎖(繼承 page) | 全螢幕 chrome 殼。原 `lockDensity="lg"` 只鎖在兩個 ChromeHeader、沒鎖 body → header(px-loose@lg=24)與 body(px-loose@page=16)左緣不對齊;移除 → 全 surface 同密度 |

**Tier alignment**:每個 overlay 宣告自己的 layout-space tier → header 高度隨之(Dialog lg → title 24 + py-tight 16×2 = 56;Popover md → 45)。「對齊 `--chrome-header-height`」是**同 tier 內**成立(Popover 45 ≠ Dialog 56 ≠ chrome 48 本就允許,各宣告各 tier),非跨 page 強制。詳 `patterns/header-canonical/header-canonical.spec.md` A 家族。

**為何不鎖 ui-size**:field-height token 隨 density 變(md 28/32/36 → lg 32/36/40);鎖 ui-size=md 會把浮層內控件 / 選單 item 釘死 md-scale,lg page 上對不上 lg 觸發點。decouple = 只鎖版面間距、控件跟 page。對標 Carbon spacing scale 獨立於 control size / GitHub Primer 8px scale 獨立。

### Canonical 情境 2 — 單獨切 ui-size

Product demo / stakeholder 觀感測試:

```ts
document.documentElement.setAttribute('data-ui-size', 'lg')
// layout-space 仍 md — 看大 control 在密集 layout 裡是否合用
```

### Canonical 情境 3 — 局部覆蓋

某 region 需要不同密度:

```tsx
<div data-layout-space="lg">
  {/* 這個 region layout 寬鬆,control 跟外層 page 走 */}
</div>
```

## 動態切換

```ts
// 一鍵(兩維度同步)
document.documentElement.setAttribute('data-density', 'lg')

// 解耦(獨立控制)
document.documentElement.setAttribute('data-ui-size', 'lg')
document.documentElement.setAttribute('data-layout-space', 'md')
```

## 判斷流程(寫新元件時)

1. **元件是否有自己特定 density**?
   - 否(繼承 page) → 不設任何 `data-*-size` attribute,所有 token 由 `html[data-density]` 繼承
   - 是 → 看 Q2

2. **需要 layout 跟 control 同步 density 嗎**?
   - 是 → 用 `data-density="X"`(convenience)
   - 否(想解耦) → 明示 `data-layout-space="X"` + / 或 `data-ui-size="Y"`

3. **Portal 逃逸 subtree?**(Dialog / Popover / Sheet / DropdownMenu / Tooltip)
   - density 設在 `html` root 時,CSS cascade 會傳到 portal 出去的內容(portal 掛 body,仍在 html 底下)→ **浮層繼承 page density 正常,不需自設**。
   - 只有 density 設在「中層 div」時 portal 才逃逸該 subtree(M3 邊界)。
   - **鎖浮層 density/layout-space = 刻意覆蓋成某 tier,需設計理由(見情境 1 表)**,非 Portal 必要;且只鎖該元件真正消費的 dial。

## 消費者清單

| 元件 | attribute 設置 | 用法理由 |
|------|---------------|---------|
| Dialog | **無(繼承 page,2026-06-16)** | layout-space 定義即管 dialog body padding → 鎖 = override 自家 dial 自相矛盾;header 隨 page md=48 / lg=56;有同類 dial 的 SAP/Cloudscape modal 跟 dial |
| Sheet | 無(繼承 page) | 側板;responsive 會跟常駐側板互換,不能跳 mode |
| Popover / Coachmark | `data-layout-space="md"`(2026-06-15) | 輕量;header py-tight 精簡;ui-size 繼承 page → 內部控件對齊觸發點。Coachmark 建在 Popover 上自動繼承 |
| DropdownMenu | 無(繼承 page,2026-06-15) | 不消費 layout-space token;鎖 ui-size 會讓 menu item(field-height-{size})對不上觸發點 |
| Tooltip | 無(繼承 page,2026-06-15) | 不消費任何 density/layout-space token,鎖 = inert |
| FileViewer | 無(繼承 page,2026-06-15) | 全螢幕 chrome 殼;原 lockDensity 只鎖 header 造成左緣不對齊 → 移除 |
| Sidebar | 無(繼承 page) | inline chrome(非 Portal 逃逸),跟隨 page density;size="md" 在 density="lg" 下自動變 36px row(見 sidebar.spec.md)|

**邊界:page density=lg 下的 Portal overlay**——Tooltip / DropdownMenu 繼承 page → lg page 上隨 page 放大,選單 item 對齊 lg 觸發點。Popover / Coachmark 鎖 layout-space=md(header 精簡)但 ui-size 仍繼承 lg(內部控件放大)。Dialog 繼承 page(不鎖)→ md 16 / lg 24 padding 隨 page。皆透過 `[data-layout-space="md|lg"]` reset selector(layoutSpace.css L21/L31)在任意 page density 上正確解析。

## Anti-patterns(禁止)

- ❌ 元件同時設 `data-density` + `data-ui-size`(重複,以後者為準但混亂)
- ❌ **用 `data-density` master switch 鎖浮層**(連 ui-size 一起鎖 → 內部控件 / 選單 item 對不上觸發點)。只鎖該元件真正消費的 dial(見情境 1 表)
- ❌ **把 density/layout-space lock 設在 header primitive(ChromeHeader / SurfaceHeader)而非 surface 根**——header 鎖、body 沒鎖 → 左緣不對齊(FileViewer 圖二 bug)。lock 一律放 surface 根容器
- ❌ 為了追求表面一致性硬把 Dialog button 綁 lg ui-size(犧牲 header 高度 / strapline 彈性)
- ❌ **鎖 Dialog 的 layout-space**(2026-06-16 定論)—— 本 spec 第 10 行定義 layout-space 就管「dialog body padding」,鎖 Dialog = 令自家 dial 對它點名要管的對象失效 = 自相矛盾;有同類 dial 的 SAP/Cloudscape 都讓 modal 跟 page dial。modal 寬鬆需求在 lg 階自然滿足(md 16 = Polaris 下限),不靠鎖。Popover/Coachmark 鎖 md 是另一回事(空間效率、消費 layout-space token、且為非阻斷錨定浮層)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`
- `dropdown-menu.spec.md`
- `file-viewer.spec.md`
- `header-canonical.spec.md`
