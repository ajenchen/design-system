---
component: Chip
family: 3
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Chip 設計原則

## 定位

Chip 是 **Material Design Filter Chip** 的實作——用於從多個選項裡**選取任意數量（多選）或單一選項（單選）**，視覺上是一排獨立的 pill。
基於 Radix ToggleGroup，橋接設計系統 token。

**Layout Family**：CLAUDE.md 4-Family Model **Family 3（Pill Layout）action trigger sub-profile**。內部結構 `[startIcon?] [<span px-1>label</span>] [suffix badge? + endIcon?]` 繼承 Button canonical（code docblock 明寫「鏡射 Button」）。SSOT 在 `components/Button/button.spec.md`「Pill Layout」章節。Chip 特有視覺（`rounded-full`、單一固定 `h-field-sm` size、hover/selected 色彩規則）寫在本 spec 下方章節。

---

## 何時用

- **Filter panel 的 tag 選取**：語言、狀態、類別、標籤
- **Toolbar 上的多選過濾**：列表頁、搜尋結果頁
- **標籤選取**：為內容選擇適合的 tags

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 2–5 個互斥單選且視覺要 compact 連體 | `SegmentedControl` | Chip 各自獨立，SegmentedControl 連體表達互斥更強 |
| 單一按鈕 on/off | `Button pressed` | 單個 toggle 不需要 Chip 的 group 語意 |
| 純顯示不可互動 | `Tag` | Chip 是 control，Tag 是 label |
| 計數 / 狀態指示器（不可互動）| `Badge`(`../Badge/badge.spec.md`) | Badge 是純視覺 indicator(count / status dot),Chip 是 selectable control |
| 使用者已輸入的 token（收件人、filter summary）| Input chip 系列（`LinkInput` / `PeoplePicker`）| 那些是 input 內的 token，不是獨立選擇器 |

---

## 與 SegmentedControl 的差異

| | Chip | SegmentedControl |
|---|---|---|
| 選擇語意 | 多選為主，可選單選 | 固定單選（radio） |
| 視覺連接 | 各自獨立 pill，`gap-2` | Items 連體，`-ml-px` border 重疊 |
| 圓角 | `rounded-full`（M3 身份特徵）| `rounded-md` |
| 規模 | 可能幾十個，必須處理 overflow | 2–5 個，規模固定 |
| Field 整合 | 不塞進 Field（規模不對） | 塞得進 Field（`useFieldContext()` 讀 size）|
| Overflow | `wrap` / `scroll` / `menu` 三模式 | 不支援 |

---

## 內部結構（鏡射 Button）

```
[startIcon?]  [<span px-1>label</span>]  [<span gap-1>badge? + endIcon?</span>]
  ↑              ↑                          ↑
  16px           text-body leading-compact   badge / LucideIcon
  │─── gap-1 ─│─── gap-1 ──────────────────│
```

- Slot 間 `gap-1`（4px），與 Button 一致
- Label 包 `<span className="px-1">`，與 Button 一致
- Suffix wrapper `<span className="inline-flex items-center gap-1">`，與 Button 一致
- Icon size：`16`（固定，因為 Chip 只有一個 size）

**支援的 slot**：
| Slot | 說明 |
|---|---|
| `startIcon` | `LucideIcon`，最多一個 |
| `badge` | 通常是計數指示器（「React 24」「進行中 3」）|
| `endIcon` | 用於 chip 點下去會展開更多的少見情境（如 `ChevronDown` 開 popover 選子分類）|

**不支援**：`danger` / `loading` / `pressed` / `asChild` / `iconOnly` / `dismiss` — 這些是其他元件的職責，混進 Chip 會模糊邊界。

### 為什麼不支援 dismiss X

Filter chip 的「移除這個 filter」動作已由「再點一次 deselect」承擔。加 dismiss X 等於同一動作有兩個 affordance，違反 Hicks's Law。Material 3 / Atlassian / Polaris filter chips 都不提供 dismiss。

**需要 dismiss 的情境** = active filter token / 使用者輸入 token，那是 Input chip 的語意（走 `LinkInput` / `Tag` + `onDismiss` 路線），不是 Filter chip。

### 為什麼不需要 checkmark-on-selected

Material 3 filter chip 在 selected 時會把 startIcon 換成 `Check`。我們不做，因為視覺層已經用 **primary-hover border + text + `primary-subtle` 背景**明確表達 selected 狀態，再加 icon 是冗餘信號。

---

## Size — 只有一種

Chip **只有一個 size**，對應 `h-field-sm`（md density 28px / lg density 32px）。

對齊 Material 3 / Atlassian / Polaris / Ant Design 的世界級共識：chips 使用單一高度，不暴露 size prop。使用場景（filter bar、tag panel）高度一致，多 size 不增加表達力、只增加 API 負擔。

**為什麼用 `--field-height-sm` 不用獨立 token**：chip 高度仍需 density 感知，沿用 `field-height-sm` 保證跟 Button / Input 的 density 節奏一致。若未來需要跟 form 高度解耦再新增 `--chip-height`。

---

## State

對應你設計中的四狀態：

| State | 樣式 |
|---|---|
| **Default** | `bg-surface border-border text-foreground` |
| **Hover**（未選）| `hover:border-border-hover`（對齊 Input / SegmentedControl hover 的 border 加深一階）|
| **Selected** | `bg-primary-subtle border-primary-hover text-primary-hover`（對齊 `semantic.css:67` canonical 選中規則）|
| **Disabled** | `cursor-not-allowed text-fg-disabled`，border 維持 `border-border` 不變色 |

Hover 和 selected 的色彩都對齊系統 canonical 規則，跟 SegmentedControl / Input / Tabs underline 使用同一套 primary-hover token，保持選中語意的視覺統一。

---

## ChipGroup — Chip 必須在群組內

Chip **不可單獨使用**，必須放在 `<ChipGroup>` 裡。跟 SegmentedControl / RadioGroup 的結構對齊。

```tsx
<ChipGroup type="multiple" value={tags} onValueChange={setTags}>
  <Chip value="react">React</Chip>
  <Chip value="vue">Vue</Chip>
  <Chip value="svelte">Svelte</Chip>
</ChipGroup>
```

### Type

| Type | 語意 | 預設 |
|---|---|---|
| `multiple` | 可勾選任意數量（checkbox 語意）| ★ **預設**（filter 最常見） |
| `single` | 互斥單選（radio 語意）| 從 tag 群裡選唯一主要 tag |

### Layout

Chip 的 overflow 處理有三種模式：

| Layout | 行為 | 何時用 |
|---|---|---|
| `wrap` ★default | 塞不下時換到下一排 | 大多數情況（filter panel / tag cloud） |
| `scroll` | 單行、水平滾動，邊緣 fade mask 指示還有內容 | Toolbar / header filter 必須單行 |
| `menu` | 塞不下的 chips 收進 `⋯` dropdown menu | 單行且需要完整選項可見（ListView toolbar）|

**詳見 overflow 段落。**

---

## Overflow 三種模式

### wrap — 預設

塞不下時 chip 換到下一排。最簡單、最常見——filter panel 裡 chip 數量不定時用這個。實作細節（flex-wrap / gap token）見 `.tsx`。

### scroll — 滾動 + fade mask + scroll arrows

- 外層 `overflow-x-auto scrollbar-none`
- 邊緣用 `mask-image: linear-gradient(...)` 做漸變透明，指示還有內容在視窗外
- Mask 依滾動位置動態調整：
  - 不可滾動 → 無 mask
  - 可往右滾（atEnd = false）→ 右邊 fade
  - 可往左滾（atStart = false）→ 左邊 fade
  - 雙向可滾 → 兩側 fade
- **左右 scroll arrow buttons**：`atStart === false` 顯示左 arrow、`atEnd === false` 顯示右 arrow，點擊捲動 80% 容器寬度（smooth）
- 使用 `useScrollEdges()` hook 追蹤 scroll state

**為什麼用 mask 不用 gradient overlay**：mask 淡化的是 chips 本身的 alpha，會自動融合任何背景色（dark mode / card / surface 都自動正確）。Gradient overlay 需要寫死 `from-surface` 等具體色，遇到不同背景就漂移。

**為什麼要 scroll arrow buttons**（與 Tabs scroll 同規則）：鍵盤用方向鍵、trackpad 用兩指滑、滑鼠滾輪使用者只能靠 arrows（`Shift+wheel` 太隱晦）。Material 3 / Ant Design / Carbon 都這麼做。

### menu — 收進 DropdownMenu

- 所有 Chip 渲染在 DOM 中（保留 Radix ToggleGroup 的 a11y）
- 用 `useOverflowIndices()` 偵測哪些 chip 溢出
- 溢出的 chip 套 `invisible`（`visibility: hidden`，不佔 hit test 但保持 layout）
- 右側渲染 `<Button variant="text" iconOnly startIcon={MoreVertical} />`(overflow menu canonical icon,見 CLAUDE.md「常用 icon canonical」;對齊決策 10)
- 點擊開 DropdownMenu，內容是 `DropdownMenuCheckboxItem` 陣列，checked 狀態跟 ChipGroup 當前 value 同步
- 點 menu item 時呼叫 ChipGroup 的 `onValueChange`，更新的值同時反映到可見 chips 和 menu checked state

**a11y 保留機制**：因為溢出的 chips 只是視覺隱藏、仍在 DOM，Radix ToggleGroup 的 roving tabindex 依然可以 focus 它們。鍵盤使用者可以透過 Tab 進入 ChipGroup，用方向鍵在所有 chips 之間導覽（含視覺隱藏的），或用 Tab 到 `⋯` 按鈕用 dropdown 介面。兩條互動路徑同時可用。

**menu 模式需要 controlled ChipGroup**：菜單 items 透過 `onValueChange` 觸發選擇變化，因此 ChipGroup 必須傳 `value` + `onValueChange`（controlled）。uncontrolled mode（`defaultValue`）的 menu 模式無法讓 menu items 與 chips 同步狀態。

---

## 禁止事項

- ❌ Chip 單獨使用——必須在 ChipGroup 內
- ❌ 用 `danger` / `loading` / `pressed` / `asChild` / `iconOnly`——不支援
- ❌ 加 dismiss X——用 Input chip / Tag 代替
- ❌ 手動改 `data-state` 或 `aria-pressed` / `aria-checked`——由 Radix 管理
- ❌ 把 Chip 塞進 Field 當 form control——規模語意不對，用 SegmentedControl
- ❌ Menu 模式搭配 uncontrolled（只給 `defaultValue`）——menu items 無法同步狀態，TS 不擋但 runtime 會看到 menu 勾選失效

## 為何無 Inspector

Chip 決策維度是「selection 行為(single / multi / menu)」× layout(連體 / 間隔)× overflow——已在 `SelectionMatrix` / `LayoutMatrix` 兩張結構矩陣覆蓋。互動 Inspector 無法呈現 selection model 的差異(需要 side-by-side 對照)。

ColorMatrix 已建:展示 default / hover / selected / disabled 四狀態的 bg / border / text / icon token 對照,採 pill-canonical 規則(`--primary-hover` 同步染 border + text,bg 維持 surface 不染色),對齊 SegmentedControl / Tabs 未選 hover。

---

## 相關

- Button (`button.spec.md`) — Chip 內部結構對標的來源
- SegmentedControl (`segmented-control.spec.md`) — compact 連體單選變體
- Tag — 純顯示 / dismissible tag
- `useOverflowItems` hook (`src/design-system/hooks/use-overflow-items.ts`) — scroll / menu 的共用追蹤邏輯，Tabs 也消費同一個 hook

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `badge.spec.md`
- `tag.spec.md`
