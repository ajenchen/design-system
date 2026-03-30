# Layout Space Spec

頁面結構間距，隨 `data-density`（或 `data-layout-space`）切換。名稱編碼 md（預設）的值。

## Token 表

| Token | md | lg |
|-------|----|-----|
| `--layout-space-loose`  | 16px | 24px |
| `--layout-space-tight`  | 12px | 16px |
| `--layout-space-bottom` | 48px | 48px |

## 使用方式

```tsx
<div className="px-[var(--layout-space-loose)]" />
<div className="py-[var(--layout-space-tight)]" />
```

## 模式切換

Layout Space 與 UI Size 統一透過 `data-density` 控制。初始狀態在 `index.html` 設定：

```html
<html data-density="md">
```

動態切換：

```ts
document.documentElement.setAttribute('data-density', 'lg')
```

若需單獨控制版面間距而不影響元件尺寸，仍可直接使用 `data-layout-space`：

```ts
document.documentElement.setAttribute('data-layout-space', 'lg')
```

## 元件與容器的間距

元件不貼齊容器邊緣——容器負責提供內距（padding），元件本身不加外距（margin）來推開容器。這讓同一個元件在不同容器中都有一致的行為，間距的控制權在容器端。
