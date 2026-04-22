# MenuItem 設計原則

## 定位

MenuItem 是所有 menu 類元件的**共用視覺佈局層**——處理 prefix 對齊、尺寸、狀態。SelectMenu、DropdownMenu、未來的 ContextMenu 等都消費它。它只負責 layout（padding、gap、prefix alignment、typography），互動行為由各 menu 的 Radix primitive 外層控制。

**Layout Family**：CLAUDE.md 4-Family Model **Family 1（Menu item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「Menu item layout」章節的 scanning-mode 規格。

---

## 結構

```
prefix                       content               suffix
[checkbox?] [icon? | avatar?]  [label + description?]  [tag?]
```

- **Prefix**：checkbox（多選，由父層注入）+ startIcon 或 avatar（互斥）
- **Content**：label + 可選 description
- **Suffix**：tag（ml-auto 靠右）

prefix icon 跟 label 同色（foreground），不是 fg-muted。詳見 item-anatomy.spec.md 的 Icon 色彩原則。

---

## Prefix 對齊——24px 閾值

所有 prefix 元素（checkbox、icon、avatar）共享同一個對齊容器。容器高度決定對齊行為：

| prefix 最大高度 | 容器 | 對齊目標 |
|---|---|---|
| ≤ 24px | `h-[1lh]` | 第一行 label 的垂直中心 |
| > 24px | `h-[calc(1lh+var(--item-gap-label-desc)+desc_1lh)]` | label + gap + description 文字塊的垂直中心 |

**SSOT**:公式實作在 `patterns/element-anatomy/item-anatomy.tsx` 的 `itemPrefixAlignVariants`
cva(2026-04-23 重構)。MenuItem 直接 import 消費,不自建 cva:
```tsx
import { itemPrefixAlignVariants } from '@/design-system/patterns/element-anatomy/item-anatomy'
<div className={cn(itemPrefixAlignVariants({ align: 'block-md' }))}>
```
改 gap token(`--item-gap-label-desc`)或 font-size token 一處 → MenuItem 自動同步。

**24px 是物理限制**——16px icon 在 24px 圓內仍可辨識(內部 icon 下限 12px),但在更小的容器中 icon 會低於可讀閾值。

**無 description 時 prefix 上限 24px**——沒有文字塊可對齊,強制 inline。

多行文字超過參考高度時，外層 `items-start` 讓 prefix Y 不隨文字下移。

---

## startIcon vs avatar

| | `startIcon` | `avatar` |
|---|---|---|
| 型別 | `LucideIcon` | `AvatarData` |
| 角色 | **描述**選項的性質（形容詞） | **代表**選項的身份（名詞） |
| 尺寸 | 16/20px（icon tier，元件控制） | 由 description 決定：無 desc → 20/24/24px，有 desc → 32/32/40px |
| 對齊 | 永遠 inline（≤ 24px） | 無 desc → inline；有 desc → block |

### avatar 尺寸推導

inline（無 description）= 對應 size 的 Tag 高度：

| sm | md | lg |
|---|---|---|
| 20px | 24px | 24px |

block（有 description）= `floor₈(1lh + 2px + desc_1lh)`：

| sm | md | lg |
|---|---|---|
| 32px | 32px | 40px |

---

## Size

單行高度對齊 field-height token，與 Button、Input 等互動元件等高。

| Size | 高度 | Label | Description | Icon | Checkbox |
|---|---|---|---|---|---|
| sm | `h-field-sm` | `text-body leading-compact` | `text-caption` | 16px | 16px (sm) |
| md | `h-field-md` | `text-body leading-compact` | `text-caption` | 16px | 16px (md) |
| lg | `h-field-lg` | `text-body-lg leading-compact` | `text-body leading-compact` | 20px | 20px (lg) |

所有文字使用 `leading-compact` (1.3)——選單選項是短文字，不需要閱讀行距。

description 降一級：sm/md 的 label 14px → description 12px；lg 的 label 16px → description 14px。

---

## Suffix 對齊(實作限制)

依 `item-anatomy.spec.md` 的對齊規則,suffix 應該套用 24px 閾值公式(跟 prefix 同公式但獨立判斷)。但 **MenuItem 的實作把 suffix 寫死成 `h-[1lh]` inline 對齊**——只支援 ≤24px 的小 suffix(Tag、ChevronRight、Badge、計數)。

### 為什麼 hardcode

選單選項的 suffix 99% 是小元素,不會超過 24px。為了避免每個 consumer 都要思考 suffix 對齊規則,MenuItem 直接套用最常見的 inline 對齊。

### 限制

如果你要塞大塊 suffix(thumbnail 40px、stacked badge、multi-line text),**MenuItem 會把它對齊到 label 第一行而不是文字塊中心**,視覺上會跟它修飾的對象失聯。

### 解法

需要大塊 suffix 的場景應該:

1. **重新評估這個東西是不是 menu item**——如果 suffix 是大塊內容,可能需要 ListItem(列表行)而非 menu item
2. **包一個 wrapper 元件**——consumer 自己組合 prefix + content + 大塊 suffix,套用 item-anatomy.spec.md 的完整 4-slot 規則
3. 不要 hack `endContent` 塞大東西進去——layout 會壞

---

## Clamp 政策(Label / Description 行數)

| Prop | 預設 | 理由 |
|---|---|---|
| `labelMaxLines` | `1` | 選項是供快速掃視的短文字，必須在一行內辨識完 |
| `descMaxLines` | `1` | 與 label 對稱，維持掃視節奏；description 是補充說明，不是閱讀內容 |

**為什麼 description 也預設 1 行?**

Menu 的設計目的是「**快速掃視多個選項挑一個**」。垂直空間是寶貴的——選單通常要塞 5–20 個選項。如果 description 沒有 clamp,一個過長的 description 會把 item 撐高,破壞 row rhythm,使用者眼睛要重新校準。

整個選單應該只有「**兩種 row 高度**」:
- 無 description → `field-height`(單行 label)
- 有 description → `field-height` + 2px + 一行 desc 高度

不能讓 row 高度變成「label 1 行 + desc 1~N 行」這種不可預測的範圍。

**Per-instance override**:consumer 若有合理理由(例如 settings 選單想顯示 2 行說明),可以顯式 `<MenuItem descMaxLines={2} ...>` 覆寫。要顯示完整不截,傳 `descMaxLines="none"`(不能傳 `undefined`,React props 的 destructure default 在 undefined 時會接管,fallback 到預設 `1`)。

---

## 狀態

| 狀態 | 背景 | 文字 | 觸發方式 |
|---|---|---|---|
| default | transparent | foreground | — |
| hover | `--neutral-hover` | foreground | 滑鼠 hover |
| selected（單選） | `--neutral-selected` | foreground | bg 高亮（不用 ✓ 勾號，避免影響 prefix 對齊） |
| selected（多選） | transparent | foreground | checkbox 勾選 |
| disabled | transparent | `--fg-disabled` | disabled prop |

### 選中指示器

| 模式 | 選中指示器 |
|---|---|
| 單選 | `bg-neutral-selected` 背景高亮 |
| 多選 | Checkbox 勾選 |

單選和 DropdownMenu RadioItem 統一用 `bg-neutral-selected`。不用 ✓ 勾號——勾號在 prefix 會影響群組內對齊。

disabled 時所有元素（icon、checkbox、文字）統一 `fg-disabled`。

### 浮層關閉行為

| 模式 | 選了之後 | 原因 |
|---|---|---|
| 單選 | **關閉浮層** | 選完就結束 |
| 多選 | **不關閉** | 需要繼續勾選 |
| DropdownMenu CheckboxItem | **不關閉** | 同多選邏輯 |
| DropdownMenu 一般 Item | **關閉** | 執行動作後結束 |

### Prefix icon 色彩

Menu item 的 prefix icon 跟 label 同色（foreground），不是 fg-muted。Prefix icon 是 label 的視覺延伸。

詳見 `item-anatomy.spec.md` 的 Icon 色彩原則。

---

## Group

群組由 `MenuGroup` 包裹，`py-2`（8px）上下內距。群組緊鄰群組，無額外間距。

### Group Header

`header` prop 讓 item 變為群組標題：
- `font-medium` (500)
- `text-fg-muted` (neutral-7)
- 不可選、不可 hover
- 尺寸與一般 item 相同

---

## Footer（多選）

`MenuFooter` 提供固定底部區域（`border-t` + `py-2`）。

典型用途：「全選」checkbox item，使用 `checked="indeterminate"` 在部分選中時顯示 minus 圖示。

---

## 禁止事項

- ❌ `startIcon` 和 `avatar` 不可同時使用
- ❌ 無 `description` 時不可使用 > 24px 的 avatar
- ❌ disabled item 不可有 hover 效果
- ❌ disabled item 內的所有子元件（icon、checkbox、文字）都必須呈現 disabled 狀態——fg-disabled 統一，checkbox 用 disabled 樣式
- ❌ header item 不可被選中
- ❌ 不在 item 內放獨立互動元素（如 Button）——item 本身就是互動單位

---

## 何時用 / 何時不用

**MenuItem 是 internal primitive**——不直接使用，透過 `SelectMenu` / `DropdownMenu` 等外層 menu 元件消費。

| 場景 | 正確做法 |
|------|---------|
| 建立操作選單（複製 / 刪除 / 分享）| 用 `DropdownMenu` + `DropdownMenuItem`（內部消費 MenuItem）|
| 建立選值下拉（選項 + 搜尋）| 用 `SelectMenu`（內部消費 MenuItem）|
| 建立右鍵選單 | 用未來的 `ContextMenu`（待開發）|
| 直接在 JSX 中用 `<MenuItem>` | ❌ **禁止**——會失去 menu 外層的 Radix 無障礙 / 鍵盤 / 焦點管理 |

### 消費者

- `../SelectMenu/select-menu.tsx` — 下拉選單浮層
- `../DropdownMenu/dropdown-menu.tsx` — 操作選單
- 未來：ContextMenu、CommandPalette

---

## 為何無獨立 StateBehavior story

MenuItem 的狀態色(default / hover / selected / disabled)是**結構性的**——透過 variant(single / multi)× state 的二維矩陣呈現比時序互動更清楚。已在 `ColorMatrix` 用 TOKEN_MAP 完整矩陣覆蓋(單選 multi / 多選 single 各自的 4 state × bg / text / icon / desc token 對照)。

獨立 StateBehavior story 會複製 ColorMatrix 內容——MenuItem 的 state 本身就是色彩表達,無額外「時序 / 動畫」可獨立呈現(不像 Accordion 有 expand/collapse 行為)。Inspector 已互動式展示 selected / disabled 單一 variant 的切換。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix`(含完整狀態色矩陣) + `SizeMatrix`。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — MenuItem 的 row primitive 繼承規則（prefix / label / suffix 對齊）
- `../Avatar/avatar.spec.md` — Prefix 的 Avatar 尺寸
- `../Checkbox/checkbox.spec.md` — CheckboxItem 的視覺規則（DropdownMenu 使用）
- `../SelectMenu/select-menu.spec.md` — 主要消費者之一
- `../DropdownMenu/dropdown-menu.spec.md` — 另一個主要消費者
