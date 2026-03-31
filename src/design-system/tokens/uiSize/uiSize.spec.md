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
| **Badge 尺寸** | md (20px) | **lg (24px)** |
| **Checkbox / Radio** | sm/md (16px) | **lg (20px)** |
| **字體** | text-body (14px) | **text-body-lg (16px)** |

### Icon-in-Container 規則

容器 ≤ 20px（指示器類：Checkbox、Radio、Badge suffix button）：
- **icon = 容器 - 4px**——icon 填充容器，保證可見性

容器 > 20px（互動元件：Button、TextField）：
- **icon 固定 16px 或 20px**——多出的空間是觸控區域，不是放大 icon
- xs / sm / md = 16px，lg = 20px

### Badge ↔ Field 配對

| Field size | Badge size | Badge 高度 | Tag padding (四邊等距) |
|---|---|---|---|
| sm | md | 20px | (field-height-sm - 1.25rem) / 2 |
| md | md | 20px | (field-height-md - 1.25rem) / 2 |
| lg | lg | 24px | (field-height-lg - 1.5rem) / 2 |

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
