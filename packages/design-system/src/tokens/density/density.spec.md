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

### Canonical 情境 1 — 歷史備忘(Dialog 已撤回)

**歷史:** Dialog 先前設 `data-layout-space="lg"` 給 header/body 寬鬆呼吸,但跟 `--chrome-header-height` canonical(md=48)衝突(強設 lg 會變 56)。**已於 2026-04-22 v5 撤回**,Dialog 全盤繼承 page density(跟 Sheet 對齊)。

**本情境仍有效的使用時機**:若未來有新元件需要「page density = md 但此元件 chrome 要 lg padding」,可用 `data-layout-space="lg"`(不撐高 header 的 rationale 仍成立,前提是 chrome-header-height 對齊不是需求)。

```tsx
// 假設未來某元件需要 lg 呼吸 + page-default ui-size
<SomeContent data-layout-space="lg">
  <Button size="sm" />  {/* 仍是 28px md */}
</SomeContent>
```

**實際 v5 canonical(Dialog / Sheet / Popover)**:
- Dialog / Sheet:繼承 page density(無 override)
- Popover / DropdownMenu / Tooltip:`data-density="md"` 鎖定(Portal 逃逸 + compact 語意)

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
| Dialog | 無(繼承 page,v5 校準)| 跟 Sheet 對齊;header 高度 = `--chrome-header-height` 自動對齊(md=48 / lg=56);原 `data-layout-space="lg"` 已於 2026-04-22 撤回(衝突 chrome-header canonical) |
| Sheet | 無(繼承 page) | Sheet 繼承 page density,不 lock |
| Popover | `data-density="md"` | Portal 逃逸,且 popover 語意「compact」兩維度同鎖 md |
| DropdownMenu | `data-density="md"` | 同 Popover |
| Tooltip | `data-density="md"` | 同 Popover |
| Sidebar | 無(繼承 page) | Sidebar 是 inline chrome(非 Portal 逃逸),跟隨 page density;size="md" 在 density="lg" 下自動變 36px row(見 sidebar.spec.md「Row size 跟 density 的差別」)|

**邊界:page density=lg 下的 Portal overlay**——Popover / DropdownMenu / Tooltip 在 `data-density="lg"` 的 page 上仍鎖 `md`(code:各 Content 自設 `data-density="md"`)。這不是漏接:Portal 到 body 本就不繼承 subtree density(M3),鎖 md 是 overlay「compact」語意的刻意設計(2026-04-22 v5 canonical)。

## Anti-patterns(禁止)

- ❌ 元件同時設 `data-density` + `data-ui-size`(重複,以後者為準但混亂)
- ❌ Overlay Portal 元件不自設 density(Portal 到 body 不繼承 trigger — 見 Meta-Pattern M3)
- ❌ 為了追求表面一致性硬把 Dialog button 綁 lg ui-size(犧牲 header 高度 / strapline 彈性)
