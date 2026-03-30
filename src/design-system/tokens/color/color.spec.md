# Color Token Spec

## 系統架構

色彩分兩層定義：
- **`primitives.css`**：原始色票（`--color-blue-6` 等），不直接使用
- **`semantic.css`**：語義 token（`--primary`、`--canvas` 等），元件只用這層

Tailwind utility 透過 `@theme inline` 橋接語義 token，元件寫 `bg-primary` 即可。


## Surface 分層（非常重要）

| Token / Utility     | 用途 | 說明 |
|---------------------|------|------|
| `bg-canvas`         | 頁面最底層背景 | HTML body 背景色 |
| `bg-surface`        | 非遮蓋型容器 | card、sidebar、table，dark mode 半透明 |
| `bg-surface-raised` | 遮蓋型浮層 | modal、popover、dropdown，必須不透明 |

`bg-surface-raised` 必須不透明，避免底層內容透出。


## 文字 / Icon 層級

| Utility            | 用途 |
|--------------------|------|
| `text-foreground`  | 主要文字（一般資訊）|
| `text-fg-secondary`| 次要資訊、helper text |
| `text-fg-muted`    | placeholder、caption、弱化 icon |
| `text-fg-disabled` | disabled 文字 |

文字色一律使用 neutral alpha token，疊加在任何背景都能維持對比。
弱化 icon hover 後變 `text-fg-secondary`。


## 語義色

### Action — Primary

`--primary` 只用於互動入口，代表「使用者可以執行的操作」。

| 用途 | 範例 |
|------|------|
| 主要按鈕 | `bg-primary` |
| 文字連結 | `text-primary` |
| Focus ring | `ring-ring` |

```tsx
<Button variant="primary">確認</Button>
<a className="text-primary hover:text-primary-hover">查看詳情</a>
```

### Status

狀態色表達系統回饋，代表「系統在告訴你什麼」，不用於互動操作。

| Token | 色相 | 用途 |
|-------|------|------|
| `--info` | blue | 資訊提示、進行中（in-progress）、active 指示、step indicator |
| `--error` | deep-orange | 錯誤 / 危險 |
| `--success` | green | 成功 |
| `--warning` | yellow | 警告 |

雖然 `--info` 與 `--primary` 目前同色（blue），**語義截然不同，不可混用**：

> 只要是「呈現狀態」就用 `--info`，只要是「互動入口」就用 `--primary`。
> 尤其在同一個 UI 脈絡中可能出現多種 status 色時（如任務列表、step indicator），一律使用 status 色系，絕不混入 `--primary`，否則使用者無法建立一致的色彩解讀框架。

```tsx
// ✅ 正確
<ProgressBar className="bg-info" value={60} />
<Badge className="bg-info-subtle text-info">進行中</Badge>
<p className="text-error">此操作無法復原</p>

// ❌ 錯誤——progress bar 不是互動操作
<ProgressBar className="bg-primary" value={60} />
```

每個語義色的 bridge 同時產出 `bg-xxx`、`text-xxx`、`border-xxx` 三組 utility，視場景選用。

- `bg-error` 為本系統命名，`bg-destructive` 僅供 shadcn 元件內部 compat
- warning 背景上的文字使用 `text-warning-foreground`（深色，非 white）；純文字顏色則直接 `text-warning`

### Indicator — Notification

| Token | Utility | 色相 | 用途 |
|-------|---------|------|------|
| `--notification` | `bg-notification` | deep-orange | 未讀計數 badge、通知紅點 |

`--notification` 目前與 `--error` 使用同色（deep-orange-6），但語義獨立——`--error` 表示「系統出了問題」，`--notification` 表示「有待處理的項目」。兩者保持分離的 token，未來可單獨調整顏色。

```tsx
<span className="bg-notification text-white">3</span>   // badge 計數
```

### Identity — 品牌

| Token | 用途 |
|-------|------|
| `--brand` | 品牌色，固定色 #DF3232，兩主題相同 |


### Subtle 背景（淡色填充）

```tsx
<div className="bg-primary-subtle" />
<div className="bg-error-subtle" />
<div className="bg-success-subtle" />
<div className="bg-warning-subtle" />
```

#### Dark mode subtle

Light mode subtle 使用不透明 `-1` 階色票。Dark mode 改為 alpha + 自動亮度補償：

```css
--xxx-subtle: oklch(from var(--xxx) l c h / calc(0.12 / l));
```

`α = 0.12 / l`：亮度越高的色相 alpha 越低，在 dark canvas 上感知亮度自動統一。
基於語義 token，新增色相只需複製公式。


## 互動狀態推導（Hover / Active）

### 公式

Hover / active **直接引用色盤 step**，不使用獨立公式：

| | Hover（較亮） | Active（較暗） |
|---|---|---|
| Light | step **-5** | step **-7** |
| Dark | step **-7** | step **-5** |

相對色階公式保證 step -5 永遠比 base 亮、step -7 永遠比 base 暗，
所有色相適用同一規則，無例外。

高亮度色相（yellow 等）的 hover gap 較小（ΔL ≈ 0.03），
這是物理事實——亮色的淺色方向空間窄。
cursor 變化 + 細微色移疊加仍提供足夠互動回饋。

```tsx
<button className="bg-primary hover:bg-primary-hover active:bg-primary-active" />
```

### 各 semantic 色的 step 對應

| Token | base | hover (light/dark) | active (light/dark) | subtle |
|-------|------|--------------------|---------------------|--------|
| primary | blue-6 | blue-5 / blue-7 | blue-7 / blue-5 | blue-1 |
| info | = primary | = primary-hover | = primary-active | = primary-subtle |
| error | deep-orange-6 | deep-orange-5 / -7 | deep-orange-7 / -5 | deep-orange-1 |
| success | green-6 | green-5 / -7 | green-7 / -5 | green-1 |
| warning | yellow-6 | yellow-5 / -7 | yellow-7 / -5 | yellow-1 |

每個語義色使用色盤的 4 個 step：-1（subtle）、-5（hover）、-6（base）、-7（active）。

### 新增色相的推導步驟

1. 在 `primitives.css` 定義 base-6 值（只需指定 L、C、H），相對公式自動推導 1-10 階
2. 在 `semantic.css` 加入 6 個 token：
   ```css
   --new-color:        var(--color-xxx-6);
   --new-color-hover:  var(--color-xxx-5);
   --new-color-active: var(--color-xxx-7);
   --new-color-subtle: var(--color-xxx-1);
   ```
3. Dark mode 加 hover/active 方向反轉 + subtle alpha：
   ```css
   [data-theme="dark"] {
     --new-color-hover:  var(--color-xxx-7);
     --new-color-active: var(--color-xxx-5);
     --new-color-subtle: oklch(from var(--new-color) l c h / calc(0.12 / l));
   }
   ```


## Neutral Interaction

中性互動背景按深度遞進：

| Utility | 用途 |
|---------|------|
| `bg-neutral-hover` | hover |
| `bg-neutral-active` | active（按下）、selected（選中） |

文字一律用 `text-foreground`。

```tsx
<div className="hover:bg-neutral-hover active:bg-neutral-active">list row</div>
<div className="bg-neutral-active">selected row</div>
```


## Static Subtle Background

| Utility | 用途 |
|---------|------|
| `bg-muted` | 靜態裝飾性低調背景（非互動狀態）|

適用場景：table header、tab 容器、code block、skeleton loading 等需要與主內容區做出微弱層級區分但不具備互動意義的區域。

與 `bg-neutral-hover` / `bg-neutral-active` 的區別：neutral 系列表達互動狀態（hover / 選中），`bg-muted` 表達結構性的靜態層級——即使沒有互動，它永遠是這個顏色。

```tsx
<div className="bg-muted">table header / tab bar</div>
```


## 邊框 / 分隔

| Utility | 用途 |
|---------|------|
| `border-border`  | 元件標準邊框 |
| `border-divider` | 分隔線（比 border 更淡）|

`border-input` 為 shadcn 內部使用，自己寫的元件改用 `border-border`。

選中狀態的邊框或文字使用 hover token：

```tsx
<div className="border-primary-hover text-primary-hover" />
```


## Utility Tokens

| Token | 用途 |
|-------|------|
| `--overlay` | dialog backdrop 遮罩 |
| `--tooltip` | tooltip 深色底（不透明）|
| `opacity-disabled` | disabled 元件整體透明度（0.45），用於無法改寫內部色彩的第三方元件 |

`opacity-disabled` 適用場景：包裝第三方元件（如圖表、地圖）的 disabled 狀態，無法逐一替換內部顏色時，直接對容器套用透明度：

```tsx
<div className={disabled ? 'opacity-disabled pointer-events-none' : undefined}>
  <ThirdPartyChart />
</div>
```

自己寫的元件優先用具體的 disabled 色彩（如 `text-fg-disabled`、`bg-[var(--bg-disabled)]`）。`opacity-disabled` 僅作為逃生艙，適用於無法逐一替換內部顏色的場景（第三方元件、複雜多層結構如 Switch）。


## shadcn Compat Aliases（僅供 shadcn 元件內部使用）

**自己寫的元件不要使用**，改用語義 token：

| shadcn alias   | 對應語義 token  |
|----------------|-----------------|
| `bg-background`| = `bg-canvas`   |
| `bg-card`      | = `bg-surface`  |
| `bg-popover`   | = `bg-surface-raised` |
| `bg-destructive`| = `bg-error`   |
| `bg-secondary` | neutral-3 底色  |
| `bg-accent`    | = neutral-hover |
| `border-input` | = border-border（input 專用）|
| `ring-ring`    | focus ring（= primary）|


## 禁止事項

```tsx
// ❌ 不要使用 Tailwind 原始色
<div className="bg-blue-500 text-gray-700" />

// ❌ 不要硬寫色碼
<div className="bg-[#1677FF]" />

// ❌ 不要直接使用 primitive token（Layer 1）
<div className="bg-[var(--color-blue-6)]" />  // 改用 bg-primary

// ❌ 自己寫的元件不要用 shadcn alias
<div className="bg-background" />  // 改用 bg-canvas
<div className="bg-destructive" /> // 改用 bg-error
```

```tsx
// ✅ 正確
<div className="bg-canvas" />
<div className="bg-primary hover:bg-primary-hover" />
<div className="bg-primary-subtle text-primary" />
<div className="bg-error" />
<span className="bg-notification text-white">3</span>
```
