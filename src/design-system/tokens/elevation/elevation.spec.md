# Elevation Spec

陰影系統。兩個層級對應兩種「浮起高度」，用 CSS 變數實現，light / dark mode 自動切換。

**不要用 Tailwind 的 `shadow-*`**，改用 CSS 變數：

```tsx
<div style={{ boxShadow: 'var(--elevation-100)' }} />
<div style={{ boxShadow: 'var(--elevation-200)' }} />
```


## 層級

| Token | 用途 | 對應元件 |
|-------|------|----------|
| `--elevation-100` | 頁面內容層，靜止 | Card |
| `--elevation-100-hover` | 頁面內容層，hover / 拖拽 | 可拖拽 card |
| `--elevation-200` | 浮層，靜止 | Modal、popover、dropdown、overlay drawer |
| `--elevation-200-hover` | 浮層，hover | — |

elevation-100 < elevation-200，數字越大浮起越高。


## 與 Surface 的配對規則

| Elevation | 必須搭配 | 原因 |
|-----------|----------|------|
| `--elevation-100` | `bg-surface` | 頁面內容層，半透明可接受 |
| `--elevation-200` | `bg-surface-raised` | 浮層必須不透明，否則底層內容透出 |

```tsx
// ✅ 正確
<div className="bg-surface rounded-md" style={{ boxShadow: 'var(--elevation-100)' }} />
<div className="bg-surface-raised rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />

// ❌ 錯誤——浮層用了半透明 bg-surface
<div className="bg-surface rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />
```
