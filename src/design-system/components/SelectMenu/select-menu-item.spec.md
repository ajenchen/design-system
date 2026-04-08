# SelectMenu 設計原則

## 定位

SelectMenu 是下拉選單的浮層元件。由 SelectField / MultiSelectField 內部觸發，不單獨使用。

---

## 搜尋行為（searchIn）

搜尋位置由選擇模式決定，開發者可覆寫：

| 模式 | `searchIn` 預設 | 選了之後 | 原因 |
|---|---|---|---|
| **單選** | `"trigger"`（唯一值，不可覆寫） | 關閉浮層 | 選完就結束，不需保留關鍵字 |
| **多選** | `"menu"` | 關鍵字保留，繼續勾選 | 最常見：搜一個關鍵字，勾選多個相關項目 |
| **多選 + `searchIn="trigger"`** | — | 關鍵字清除，打新的 | 一個一個挑不同類型的項目 |

- 單選搜尋在觸發點：field 變 input，打字即篩選，選完關閉
- 多選搜尋在浮層：浮層頂部搜尋框，勾選不關閉，關鍵字保留
- 多選搜尋在觸發點：tags 旁邊 inline input，選了一個 tag 後關鍵字清除

---

## 浮層規格

| 屬性 | Token | 說明 |
|---|---|---|
| 背景 | `bg-surface-raised` | 不透明 |
| 陰影 | `--elevation-200` | 與 Modal / Popover 一致 |
| 圓角 | `rounded-lg` | 8px |
| 邊框 | `border border-border` | 1px |
| 間距 | `sideOffset={8}` | 與所有浮層統一 |
| 寬度 | 跟隨觸發元件寬度 | 可設 `minWidth` |

---

## 鍵盤操作

由 cmdk 提供，所有模式統一：

| 按鍵 | 行為 |
|---|---|
| `↑` `↓` | 移動焦點 |
| `Enter` | 選中目前焦點的選項 |
| `Escape` | 關閉浮層 |
| 任意字元（searchable 時） | 開始搜尋 |
| `Tab` | 關閉浮層，焦點移到下一個元素 |

---

## SelectMenuItem

SelectMenuItem 是 SelectMenu 的選項元件——處理 prefix 對齊、尺寸、狀態。

---

## 結構

```
[checkbox?]  [startIcon? | avatar?]  [label + description?]
```

- `startIcon` 和 `avatar` 互斥，不會同時佔位
- `checkbox` 獨立於 icon/avatar，由父層的多選模式注入
- `description` 是可選的次要文字，顯示在 label 下方

---

## Prefix 對齊——24px 閾值

所有 prefix 元素（checkbox、icon、avatar）共享同一個對齊容器。容器高度決定對齊行為：

| prefix 最大高度 | 容器 | 對齊目標 |
|---|---|---|
| ≤ 24px | `h-[1lh]` | 第一行 label 的垂直中心 |
| > 24px | `h-[calc(1lh+2px+desc_1lh)]` | label + gap + description 文字塊的垂直中心 |

**24px 是物理限制**——16px icon 在 24px 圓內仍可辨識（內部 icon 下限 12px），但在更小的容器中 icon 會低於可讀閾值。

**無 description 時 prefix 上限 24px**——沒有文字塊可對齊，強制 inline。

多行文字超過參考高度時，外層 `items-start` 讓 prefix Y 不隨文字下移。

---

## startIcon vs avatar

| | `startIcon` | `avatar` |
|---|---|---|
| 型別 | `LucideIcon` | `ReactNode` |
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

單行高度對齊 field-height token，與 Button、TextField 等互動元件等高。

| Size | 高度 | Label | Description | Icon | Checkbox |
|---|---|---|---|---|---|
| sm | `h-field-sm` | `text-body leading-compact` | `text-caption` | 16px | 16px (sm) |
| md | `h-field-md` | `text-body leading-compact` | `text-caption` | 16px | 16px (md) |
| lg | `h-field-lg` | `text-body-lg leading-compact` | `text-body leading-compact` | 20px | 20px (lg) |

所有文字使用 `leading-compact` (1.3)——選單選項是短文字，不需要閱讀行距。

description 降一級：sm/md 的 label 14px → description 12px；lg 的 label 16px → description 14px。

---

## 狀態

| 狀態 | 背景 | 文字 | 觸發方式 |
|---|---|---|---|
| default | transparent | foreground | — |
| hover | `--neutral-hover` | foreground | 滑鼠 hover |
| selected（單選） | `--neutral-active` | foreground | 選中 |
| selected（多選） | transparent | foreground | checkbox 勾選，背景不變 |
| disabled | transparent | `--fg-disabled` | disabled prop |

disabled 時所有元素（icon、checkbox、文字）統一 `fg-disabled`。

---

## Group

群組由 `SelectMenuGroup` 包裹，`py-2`（8px）上下內距。群組緊鄰群組，無額外間距。

### Group Header

`header` prop 讓 item 變為群組標題：
- `font-medium` (500)
- `text-fg-muted` (neutral-7)
- 不可選、不可 hover
- 尺寸與一般 item 相同

---

## Footer（多選）

`SelectMenuFooter` 提供固定底部區域（`border-t` + `py-2`）。

典型用途：「全選」checkbox item，使用 `checked="indeterminate"` 在部分選中時顯示 minus 圖示。

---

## 禁止事項

- ❌ `startIcon` 和 `avatar` 不可同時使用
- ❌ 無 `description` 時不可使用 > 24px 的 avatar
- ❌ disabled item 不可有 hover 效果
- ❌ header item 不可被選中
- ❌ 不在 item 內放獨立互動元素（如 Button）——item 本身就是互動單位
