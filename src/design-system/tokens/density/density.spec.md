# Density Spec

`data-density` 統一控制 **UI Size**（元件高度 / 內距）與 **Layout Space**（版面間距），一個 attribute 切換整個介面密度。

詳細 token 數值見各自的 spec：
- 元件尺寸 → `uiSize/uiSize.spec.md`
- 版面間距 → `layoutSpace/layoutSpace.spec.md`


## 兩種密度

| 模式 | `data-density` | 適合場景 |
|------|----------------|----------|
| **md**（預設）| `"md"` | 資訊密集的桌面 UI |
| **lg** | `"lg"` | 觸控裝置、需要更大點擊目標 |


## 初始設定

在 `index.html` 設定，無需 JavaScript：

```html
<html data-theme="light" data-density="md">
```


## 動態切換

```ts
document.documentElement.setAttribute('data-density', 'lg')
```


## 逃生艙

一般不需要。若特定區域需要不同密度，可單獨設定子屬性：

```ts
// 全域單獨控制
document.documentElement.setAttribute('data-ui-size', 'lg')
document.documentElement.setAttribute('data-layout-space', 'lg')
```

```html
<!-- 局部容器覆蓋 -->
<div data-ui-size="lg">...</div>
```
