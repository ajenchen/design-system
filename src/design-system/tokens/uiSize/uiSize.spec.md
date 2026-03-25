# UI Size Spec

元件高度與內部間距，隨 `data-density`（或 `data-ui-size`）切換。名稱編碼 md（預設）的值。

## Token 表

| Token | md | lg |
|-------|----|----|
| `--ui-height-64` | 64px | 72px |
| `--ui-height-56` | 56px | 64px |
| `--ui-height-48` | 48px | 56px |
| `--ui-height-40` | 40px | 48px |
| `--ui-height-36` | 36px | 40px |
| `--ui-height-32` | 32px | 36px |
| `--ui-height-28` | 28px | 32px |
| `--ui-space-8`   | 8px  | 10px |
| `--ui-space-6`   | 6px  | 8px  |
| `--ui-space-4`   | 4px  | 6px  |
| `--ui-space-2`   | 2px  | 4px  |

## 使用方式

```tsx
<div className="h-[var(--ui-height-36)]" />
<div className="px-[var(--ui-space-8)]" />
```

## 模式切換

UI Size 與 Layout Space 統一透過 `data-density` 控制。初始狀態在 `index.html` 設定：

```html
<html data-density="md">
```

動態切換：

```ts
document.documentElement.setAttribute('data-density', 'lg')
```

若需單獨控制元件尺寸而不影響版面間距，仍可直接使用 `data-ui-size`：

```ts
document.documentElement.setAttribute('data-ui-size', 'lg')
```
