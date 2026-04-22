# Density 設計原則

Density 由**兩個獨立維度**構成,並配合一個 convenience attribute 同時控制兩者:

| 維度 | 管的是 | attribute | 範例 |
|------|--------|-----------|------|
| **UI Size** | 元件**高度 / 內距**(Button / Input / SelectionItem / field-height / table-row) | `data-ui-size` | `md`(28px field)/ `lg`(32px field) |
| **Layout Space** | 版面**間距 / 外框 padding**(section gutter / dialog body padding / form gap) | `data-layout-space` | `md`(tight gap)/ `lg`(loose gap) |
| **Density**(convenience)| 一鍵同時切兩者 | `data-density` | `md` / `lg` |

## 兩維度為何解耦(世界級對照)

**Carbon Design System**:spacing scale 獨立於 component size([carbondesignsystem.com/elements/spacing](https://carbondesignsystem.com/elements/spacing/overview/))
**GitHub Primer**:8px base unit scale 獨立於 control size([styleguide.github.com/primer](https://styleguide.github.com/primer/support/spacing/))
**Atlassian**:spacing tokens 可單獨消費(partial decouple)

**反例**(耦合):Material M3 / Polaris density 模式綁 control size + spacing — 無法「寬版面 + 標準 control」的場景。

**我們走 decouple 流派**:解決 Dialog / overlay chrome 的痛點 — header 想要寬鬆呼吸(layout=lg),但不要被 button chrome 撐高(ui-size 跟 page 走 md)。

## 預設同步(density convenience)

日常使用:不管兩個維度,直接 `data-density` 一次切兩者:

```html
<html data-theme="light" data-density="md">
```

- **md**(預設):資訊密集的桌面 UI / form-heavy 頁面
- **lg**:觸控裝置 / 需要更大點擊目標的情境

`data-density` 內部等同同時設 `data-ui-size` + `data-layout-space` 相同 tier。CSS selectors 同時監聽 `[data-density="lg"], [data-ui-size="lg"]` 等(見 `uiSize.css` + `layoutSpace.css`)。

## 解耦用法(canonical 情境)

當需要「layout 寬鬆 + control 標準」時,**顯式設兩個 attribute**:

### Canonical 情境 1 — Overlay chrome 容器

**Dialog** canonical:header / body / footer 用 `--layout-space-lg`(寬鬆呼吸),但 Button / Input 保持 page default ui-size(md):

```tsx
// Dialog 內部實作
<DialogContent data-layout-space="lg">
  {/* data-ui-size 留空 → 繼承 html[data-density] 的 ui-size */}
  <DialogHeader>
    <DialogTitle>...</DialogTitle>
    <Button iconOnly dismiss size="sm" />  {/* 28px(md)不是 32px(lg) */}
  </DialogHeader>
</DialogContent>
```

**為什麼**:Header height = `max(title-line-height, button-height) + 2 × layout-space-tight`。若 button 32px,整 header >= 32 + padding → 太高。button 28px(md)+ layout padding 寬鬆 → header 視覺舒適但不擁擠。未來 title 加 strapline / 換行自動撐開,不需限死 height。

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

3. **Portal 逃逸 subtree?**(Dialog / Popover / Sheet / DropdownMenu)
   - Portal 到 body 的元件**不繼承 trigger 的 density** → 必自設(對齊 Meta-Pattern M3)

## 消費者清單

| 元件 | attribute 設置 | 用法理由 |
|------|---------------|---------|
| Dialog | `data-layout-space="lg"` 僅 | 寬 layout + page-default ui-size(不撐高 header) |
| Sheet | 無(繼承 page) | Sheet 繼承 page density,不 lock |
| Popover | `data-density="md"` | Portal 逃逸,且 popover 語意「compact」兩維度同鎖 md |
| DropdownMenu | `data-density="md"` | 同 Popover |
| Tooltip | `data-density="md"` | 同 Popover |
| Sidebar | `data-density="md"` | Sidebar 本身 compact(不管 page 是否 lg)|

## Anti-patterns(禁止)

- ❌ 元件同時設 `data-density` + `data-ui-size`(重複,以後者為準但混亂)
- ❌ Overlay Portal 元件不自設 density(Portal 到 body 不繼承 trigger — 見 Meta-Pattern M3)
- ❌ 為了「看起來 consistent」硬把 Dialog button 綁 lg ui-size(犧牲 header 高度 / strapline 彈性)
