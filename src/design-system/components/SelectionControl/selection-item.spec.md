---
component: SelectionItem
family: 2
variants: {}
sizes:
  sm: {}
  md: {}
  lg: {}
traits:
  - hasSizes
  - isStructural
  - isInternal
---

# SelectionItem 設計原則

## 定位

SelectionItem 是 **Checkbox 和 RadioGroup 共用的 item 佈局 primitive**——提供 control + optional prefix + content（label/description）+ optional suffix 的 4-slot 結構，並處理 padding 公式（`py = (field-height - 1lh) / 2`）讓單行高度對齊同 size 的 Input。

> **關於資料夾命名**: `SelectionControl/` 是**概念群組**名稱（對齊 `Menu/` 包 `menu-item.tsx` / `Field/` 包 `field.tsx` 的專案慣例），其內包含主要 primitive `selection-item.tsx`。未來可能增加 `selection-indicator.tsx` 等相關 primitive 到同一資料夾。spec / file 以 main primitive 為準命名(見 `menu-item.spec.md` 先例)。

**實作基礎**：自建 internal primitive——純視覺佈局 + padding 公式，無 external primitive base。

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。SelectionItem 是 Family 2 的 SelectionItem variant：prefix 放 Checkbox/Radio indicator 而非 icon/avatar。

---

## 何時用 / 何時不用

**SelectionControl 是 internal primitive**——不直接使用，透過 Checkbox / RadioGroup 消費。

| 場景 | 正確做法 |
|------|---------|
| 建立一組 Checkbox 選項 | 用 `Checkbox`（內部消費 SelectionItem）|
| 建立一組 Radio 選項 | 用 `RadioGroup` + `RadioGroupItem`（內部消費 SelectionItem）|
| 直接用 `<SelectionItem>` | ❌ **禁止**——會失去 Checkbox / Radio 的 ARIA state、keyboard、form integration |

---

## 為什麼要獨立 primitive

Checkbox 和 Radio 視覺幾乎完全一致（差異只在形狀 `rounded-md` vs `rounded-full` 和指示器 check icon vs filled dot），佈局邏輯（prefix / content / suffix 對齊、`py` padding 公式、clamp 政策、disabled 狀態處理）100% 共享。

**不獨立**的話兩邊各自實作會漂移——某天改了 Checkbox 的 gap 或 clamp，Radio 會忘記同步。獨立成 SelectionItem 保證兩者視覺 / 行為永遠一致。

---

## 結構

```
[control]  [optional prefix (icon | avatar)]  [content: label + description]  [optional suffix]
```

- `flex items-start gap-2`：控件與 content 對齊第一行
- 控件包在 `h-[1lh]` 容器中，跟第一行文字垂直置中
- 多行 label 時，控件保持對齊第一行（不跳到中間）

### 字體

- `text-body` (sm/md) / `text-body-lg` (lg)——建立 `1lh` context 讓控件高度跟隨字體

### Padding 公式

`py = (field-height - 1lh) / 2`

- 單行時總高度 = field-height（對齊同 size 的 Input）
- 多行時 padding 不變，自然撐高
- density 切換時 field-height 自動調整，padding 跟著算

### Clamp 政策

見 `../Checkbox/checkbox.spec.md`「Clamp 政策」——Label / Description 預設 `'none'`（完整閱讀優先），非「掃視優先」。

---

## 禁止事項

- ❌ 直接在 JSX 用 `<SelectionItem>`——透過 Checkbox / Radio 消費
- ❌ 在 Checkbox / Radio 之外複製 SelectionItem 邏輯——共用源頭一定是 SelectionControl
- ❌ 改動 `py` padding 公式只針對某一 variant——Checkbox 和 Radio 必須同步

---

## 為何無 ColorMatrix / StateBehavior

SelectionItem 是**純 layout primitive**,只處理 4-slot 結構 + padding 公式,無獨立色彩與互動狀態:

- **無 ColorMatrix**:SelectionItem 本身**不設** bg / border color,也**不擁有** control 視覺(Checkbox 方框 / Radio 圓圈)——control 由 consumer 傳入(`control` prop 接 ReactNode)。色彩決策屬於 Checkbox / Radio 層級,其 `.anatomy.stories.tsx` 負責 ColorMatrix(如 Checkbox 的 unchecked / checked / indeterminate × default / hover / disabled 矩陣)。
- **無 StateBehavior**:SelectionItem 只有 `disabled` 影響 label 顏色(`text-fg-disabled`),無 selected / checked / hover / active——這些狀態屬於傳入的 `control`。Disabled 行為在 `Inspector` 的 props 已足夠展示,不需獨立 story。

對應 anatomy story:保留 `Overview` / `Inspector` / `SizeMatrix`,額外追加元件特有的 `PrefixAlignment`(展示 24px 閾值下 icon/avatar 的 inline vs block 對齊行為——這是 SelectionItem 最重要的結構規則,取代 ColorMatrix)。

---

## 相關

- `../Checkbox/checkbox.spec.md` — 主要消費者之一，含 Clamp 政策 SSOT
- `../RadioGroup/radio-group.spec.md` — 另一消費者
- `../../patterns/element-anatomy/item-anatomy.spec.md` — 4-slot 結構的 pattern 來源
- `../../tokens/uiSize/uiSize.spec.md` — `--field-height-*` token
