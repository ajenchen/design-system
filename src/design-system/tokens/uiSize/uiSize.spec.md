# Component Size Spec

元件高度的語義 token，rem 單位。透過 `data-density`（或 `data-ui-size`）切換。

## Field Height

Button、TextField、Checkbox/Radio SelectionItem 等互動元件。

| Token | md density | lg density |
|-------|-----------|-----------|
| `--field-height-xs` | 1.5rem (24px) | 1.5rem (24px) — 固定 |
| `--field-height-sm` | 1.75rem (28px) | 2rem (32px) |
| `--field-height-md` | 2rem (32px) | 2.25rem (36px) |
| `--field-height-lg` | 2.25rem (36px) | 2.5rem (40px) |

## Table Row

DataTable 行高。density 切換統一 +0.5rem (+8px)。

| Token | md density | lg density |
|-------|-----------|-----------|
| `--table-row-sm` | 2rem (32px) | 2.5rem (40px) |
| `--table-row-md` | 2.5rem (40px) | 3rem (48px) |
| `--table-row-lg` | 3rem (48px) | 3.5rem (56px) |

---

## 元件尺寸對應系統

**`field-height-lg` 是尺寸切換點。** xs/sm/md 用同一組內部尺寸，lg 切換到較大的一組。

| | xs / sm / md | **lg** |
|---|---|---|
| **Field 高度** | 24 / 28 / 32px | **36px** |
| **Icon 尺寸** | 16px | **20px** |
| **Checkbox / Radio** | sm/md (16px) | **lg (20px)** |
| **字體** | text-body (14px) | **text-body-lg (16px)** |

### 子元件補齊原則

當子元件被父元件透過 size prop 消費時，子元件必須補齊父元件的所有 size 選項，即使值重複。消費端直接透傳 size，不做 mapping。

已套用此原則的元件：Checkbox（sm=md=16px）、Radio（sm=md=16px）、Badge（lg=md=24px）。

### 元件高度地板

**field-height-xs（24px）是獨立互動元件的最小高度。** 任何可獨立存在的互動元件（Button、TextField 等）不得使用比 field-height-xs 更小的高度。若空間不足以容納 24px，應重新檢視容器佈局，而非縮小元件。

比 24px 更小的互動區域只存在於元件內部的 Inline Action（如 Badge dismiss、Field endAction），由宿主元件的 spec 定義規格。

### Icon 尺寸 Tier

系統有兩個 icon tier，由元件引用的 field-height token 決定：

| 元件引用 | Icon | 控件（Checkbox/Radio） | 字體 |
|---|---|---|---|
| `field-height-xs / sm / md` | 16px | 16px（內部 icon 12px） | text-body |
| `field-height-lg` | 20px | 20px（內部 icon 16px） | text-body-lg |

這是離散的兩組配對，不存在中間值，不需要公式推導。判斷依據是元件自身的 size prop 對應到哪個 field-height token，與全域 density 設定無關（density 只負責等比放大 field-height 的 px 值）。

**Stroke icon 尺寸的下限是 12px**（出現在 Checkbox 等指示器容器內部）。Filled indicator（如 Radio 的實心圓點）不受此限制——實心形狀在任何尺寸都清晰可辨。

### Badge ↔ Field 配對

Badge 有自己的尺寸定義（見 `badge.spec.md`），與 Field 的配對透過 size 直接對應：

| Field size | Badge size | Badge 高度 | Tag padding (四邊等距) |
|---|---|---|---|
| sm | sm | 20px | (field-height-sm - 1.25rem) / 2 |
| md | md | 24px | (field-height-md - 1.5rem) / 2 |
| lg | lg | 24px | (field-height-lg - 1.5rem) / 2 |

---

## Inline Action

嵌入在其他元件內部的互動觸發點（Badge dismiss、Field endAction 等）。不是獨立的 Button，由宿主元件渲染和控制。

### 視覺規則

1. **Icon 視覺尺寸跟隨宿主 tier**，排版以 icon 為準
2. **平時透明**，視覺上等同靜態 icon
3. **Hover 時顯示背景色區域**，提示可點擊。背景色區域 = icon + 2px（直徑，即每邊 +1px），不影響排版（用 absolute positioning 或 negative margin 溢出）

### 互動狀態

與 Button text variant 一致：

| 狀態 | 背景 | 過渡 |
|---|---|---|
| 預設 | transparent | — |
| hover | `bg-neutral-hover` | transition-colors |
| active | `bg-neutral-active` | transition-colors |
| focus-visible | `outline: 2px solid var(--ring)` | — |
| 宿主 disabled | 不渲染 inline action | — |

### Icon 色彩

所有 inline action 統一行為：預設 `fg-muted`，hover / active 時變 `foreground`。不區分層級——utility icon 本質上都是輔助操作，預設退到背景，hover 時提示可操作。

### 尺寸對照

| 宿主 | Icon 視覺 | Hover 背景 | 圓角 | 排版佔位 |
|---|---|---|---|---|
| Badge sm (20px) | 16px | 18px | rounded-sm | 16px |
| Badge md/lg (24px) | 16px | 18px | rounded-sm | 16px |
| Field sm/md | 16px | 18px | rounded-sm | 16px |
| Field lg | 20px | 22px | rounded-md | 20px |

### API 設計

Inline action 由宿主元件渲染，消費者只需宣告 intent：

```tsx
// ❌ 舊：消費者自行決定 Button size、icon size
<TextField endAction={<Button size="xs" iconOnly startIcon={X} aria-label="清除" onClick={...} />} />

// ✅ 新：宣告式，Field 自己根據 size tier 渲染
<TextField endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部根據自己的 size 決定 icon 尺寸、hover 背景大小、視覺層級。消費者不需要知道這些。

### 實作要求

- 必須是 `<button>` 元素，不是 `<span>` + onClick
- 必須有 `aria-label`
- 必須有 Tooltip（`label` 欄位同時作為 `aria-label` 和 tooltip 內容）——icon-only 控件沒有可見文字，tooltip 是使用者理解功能的唯一視覺提示
- 宿主 disabled 時不渲染（不可操作就不該暗示可以操作）

---

## Tailwind Bridge

透過 `@theme inline` 橋接到 Tailwind spacing：

```tsx
<div className="h-field-md" />       /* = var(--field-height-md) */
<div className="h-table-row-md" />   /* = var(--table-row-md) */
```

## 模式切換

初始狀態在 `index.html` 設定：

```html
<html data-density="md">
```

動態切換：

```ts
document.documentElement.setAttribute('data-density', 'lg')
```
