# DS Devmode — Storybook Addon

**DS-aware inspector inside Storybook**。Click any canvas element → 看見它的:

1. **Token**(author 寫的 `var(--primary)`)
2. **公式**(完整 `calc((var(--field-height-sm) - 16px - 2px) / 2)` raw expression)
3. **實際值**(browser computed `5px`)

**核心定位**:**用最少 click,看清楚一個 element 的 spacing / token / formula / 實際值**。對齊 Figma Dev Mode 測量 + Chrome DevTools 調試,專為**我們自家 DS tokens** 優化(source-first 反查,非 speculation)。

可以跟 Figma 不一樣,甚至超越 — 只要持續服務「**click → 快速簡單看見 CSS 完整 spec**」的核心。

## What it gives you

### Inspect 核心(Figma Dev Mode 風)

| Feature | How |
|---|---|
| **Click-to-pin / hover-live** | Toolbar toggle / `Alt+I` / Touch tap-to-pin |
| **Source-first token display** | Author 寫 `padding: calc((var(--field-height-sm) - 16px) / 2)` → panel 完整顯 raw expression(token 高亮)→ resolved 值,**公式不丟** |
| **Anatomy box(5-rect 完整 box model)** | Position(non-static)/ Margin / Border / Padding / Content,4 邊距離 label 完整(Chrome `MetricsSidebarPane.ts` 同源)|
| **Redline overlay** | 紫 outline + 藍 padding 斜紋 + 紅距離(2px solid + halo + T-cap 端點 + dimension extension lines) |
| **Sibling distance** | Pin 後 hover 其他元素 → edge-to-edge gap(Figma-style)|
| **Auto-layout(flex/grid)** | Container 自動顯 gap / direction / justify / align |

### 調試擴展(Chrome DevTools 風)

| Feature | How |
|---|---|
| **Pseudo-state force** | Pin 後 toggle `:hover` / `:focus` / `:active` 看 styled state |
| **DOM tree breadcrumb** | Panel 顯父鏈(html › body › ... › element) |
| **Arrow keys walk DOM** | ↑ parent / ↓ first child / ←→ sibling |
| **Copy all CSS** | One-click copy 整段 selector + declarations(含 token + 公式 + resolved 註釋) |

### 操作

| Mode / Key | Action |
|---|---|
| `Alt+I` | Toggle Off / Live(touch:Off / Pin) |
| click | Pin element |
| Pin 後 hover 別元素 | 顯 sibling distance(Figma-style)|
| `Esc` | Unpin(back to Live;touch 回 Off) |
| `↑↓←→` | 已 pin 時走 DOM tree |
| `H` | Toggle redline labels(暫清數字看視覺對齊;對齊 Chrome `Ctrl+hold` idiom)|

## 你會看到什麼(範例)

點擊 iconOnly button 後,panel 顯:

```
button.bg-primary.text-on-emphasis.h-field-md...

[ Margin 0/0/0/0 ]
  [ Border 1px ]
    [ Padding ]
      28 × 28 (border-box)

Auto-layout: flex
  direction  row
  justify    center
  align      center
  gap        4px

:state  [none] [:hover] [:focus] [:active]

Layout
  height           var(--field-height-md)  → 32px
  background-color var(--primary)          → oklch(0.59 0.24 257)
  padding-inline   calc((var(--field-height-sm) - 16px - 2px) / 2)  → 5px

Style
  color            var(--on-emphasis)      → oklch(1 0 0)
  font-size        var(--font-body-size)   → 14px
  ...

[Copy all CSS]
```

每行**raw 公式 → resolved 值**並列,**完整保留 token + calc + 實際值**。

## Why built(vs. 既有)

- `@storybook/addon-measure`:只 Alt+hover,無 click-pin / 無 token / 無公式
- `@whitespace/storybook-addon-html`:HTML + class 列表,無 computed / 無 token
- `storybook-addon-pseudo-states`:hover 模擬器,非 inspector
- **Chrome DevTools**:強但 generic,**不認得我們的 DS tokens**(無 reverse / source 反查)
- **Figma Dev Mode**:Figma side,測 design 不測 storybook
- **本 addon**:**combines Figma 的 measurement idiom + Chrome 的調試 + DS-aware token 解析**,full-context inspect for our system

## Architecture

```
.storybook/addons/ds-devmode/
├── preset.ts                    addon entry
├── manager.tsx                  toolbar + panel register
├── preview.ts                   canvas iframe driver
│                                  (click / hover / arrow / touch / pseudo-state force)
├── Panel.tsx                    right-side panel UI
│                                  (anatomy / breadcrumb / Copy all / state toggle /
│                                   auto-layout / layout / style / list-code view)
├── constants.ts                 ADDON_ID / EVENTS / Payload types
└── utils/
    ├── dom-geometry.ts          rect + distances-to-parent
    ├── computed-style.ts        getComputedStyle + default filter
    ├── token-reverse-lookup.ts  source-first(extractSourceVars walks
    │                              CSSLayerBlockRule recursively)+ fallback
    │                              speculative reverse-lookup
    └── overlay.ts               imperative redline + T-caps + extension lines
```

## Token / Formula / Resolved 顯示邏輯

每 property 過兩階段:

1. **Source-first**(authoritative):walk matched stylesheet rules + inline style,抓含 `var()` 的 declarations。Author 寫了什麼就顯什麼(完整 raw expression,含 calc / 多 var)。
2. **Reverse-lookup**(fallback):若 source 無 var(),掃 `:root` custom properties,找 candidate tokens with same resolved value。標 'speculative',淡灰 hint 顯示「ⓘ N candidates」避免誤導。

Display formula:`<raw with token highlighted> → <resolved>`

```
padding-inline: calc((var(--field-height-sm) - 16px - 2px) / 2)  → 5px
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^
                          token underlined,hover 看 resolved chain
```

## Reusability

- 新元件 / 新 stories 0 改 — 純 DOM-level
- 任何 viewport / density / theme — read live computed
- Touch device:auto-detect,tap-to-pin(skip hover-live)
- Tailwind v4 nested @layer rules:source-first 遞迴 walk CSSLayerBlockRule,token 抓得到

## Reading the overlay

| Visual | Meaning |
|---|---|
| **Purple solid outline 2px + white halo** | Pinned element bounds |
| **Cyan solid outline 2px + white halo** | Sibling hover(Figma-style distance target) |
| **Purple dashed outline** | Immediate parent bounds |
| **Green 45° hatching** | Computed padding — color 對齊 Chrome `Common.Color.PageHighlight.Padding`(`#93C47D`)|
| **Yellow dashed** | Border layer(對齊 Chrome PageHighlight.Border `#FFE599`)|
| **Orange diagonal stripes** | Margin layer(對齊 Chrome PageHighlight.Margin `#F6B26B`)|
| **Red 2px line + T-cap stubs + extension lines** | Distance from element edge to target edge,T-cap 兩端標位 unambiguous |
| **Red label with halo** | Distance value(px,< 12px 自動隱藏只留線 + T-cap)|
| **Purple top badge** | Element selector(< 18×12 元件自動隱藏)|

**Occlusion canonical**(2026-04-25,對齊 Chrome `tool_highlight.ts`):
- Canvas 是 visual hint,允許粗糙;**Panel 是 canonical**,任何 value 都查得到
- Per-side padding 數字**不畫於 canvas**,只在 Panel anatomy box(對齊 Chrome)
- Distance label / property badge 過小時自動 suppress(避免遮元件)
- 按 `H` 暫清全 label 看視覺對齊(對齊 Chrome `Ctrl+hold` idiom)

## Performance

- `extractSourceVars` 遞迴遍 stylesheet rules — 大 stylesheet(1000+ rules)觀察 < 50ms
- TokenMap 2s TTL cache
- Overlay imperative DOM(no React iframe-side)— 1 paint per emit
