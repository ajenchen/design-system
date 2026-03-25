# Radius Token Spec

## 圓角選項

圓角只有三個選項：

| Tailwind class | 值 | 用途 |
|----------------|----|------|
| `rounded-md`   | 4px    | 一般元件 |
| `rounded-lg`   | 8px    | 浮層 |
| `rounded-full` | 9999px | Pill 形狀 |


## 使用規則

### `rounded-md`（4px）— 一般元件

適用於大多數互動元件，視覺上「有圓角但不搶眼」：

- Button、Input、Select、Checkbox、Tag、Badge
- Card（非浮層，不需 elevation 層級感）
- Table cell、list item 的 hover 背景
- Tooltip

### `rounded-lg`（8px）— 浮層

適用於浮在頁面上層的元件：

- Modal、Dialog
- Popover、Dropdown menu、Command palette

### `rounded-full`（9999px）— Pill

適用於需要完全膠囊形狀的元件：

- Avatar（圓形）
- Toggle switch 外框
- Progress bar


## 禁止事項

```tsx
// ❌ 不要用非 token 的圓角（包含 rounded-sm、rounded 等）
<div className="rounded" />        // 4px，但意圖不明
<div className="rounded-xl" />     // 12px，超出 token 範圍
<div className="rounded-2xl" />    // 16px，超出 token 範圍

// ❌ 不要硬寫圓角值
<div className="rounded-[6px]" />
<div style={{ borderRadius: '8px' }} />

// ❌ 不要用 CSS 變數語法（Tailwind class 已夠用）
<div className="rounded-[var(--radius-md)]" />
```

```tsx
// ✅ 一般元件
<button className="rounded-md" />

// ✅ 浮層
<div className="rounded-lg" />

// ✅ Pill
<span className="rounded-full" />
```
