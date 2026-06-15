<!-- @benchmark-cited: world-class layered token architecture — Polaris/Material/Atlassian/Carbon/Apple HIG (URLs in body table) -->

# Token System 設計原則(SSOT,跨所有 token family)

> **Foundational SSOT rationale**(cap 1200,per CLAUDE.md「foundational SSOT 例外 ≤ 800-1200」):
> 本 spec 是**所有 token family 共同遵循的上游 canonical**——5-layer 架構、命名 family-scoped 規則、token vs hardcode 判斷、cross-family co-location rationale、SSOT consumer scope。改變本 spec = 影響全 DS 30+ 元件 + 200+ token。改一處不對齊就 drift,所以集中在這裡為 SSOT;個別 family spec(color / typography / uiSize 等)只 codify 自家具體規則,不重述上游架構。

## 架構流派定位

業界世界級 DS 都採「**分層 token 架構**」(layered token architecture),底層 raw value,上層 semantic intent。各家命名不同但概念一致:

| 流派 | 代表系統 | 層命名 | 對應我們 |
|---|---|---|---|
| **3-layer reference / system / component** | Material 3 | `md-ref-*` → `md-sys-*` → `md-comp-*` | Primitive / Semantic / Internal |
| **2-layer base / semantic + token-per-component** | Polaris | `--p-color-blue-500` → `--p-color-bg-primary` | Primitive / Semantic |
| **3-layer foundation / semantic / specific** | Atlassian DS | `color.text.brand` → 直接 raw oklch in foundation | Primitive / Semantic |
| **2-layer global / alias + size scale** | Carbon | `$blue-60` → `$button-primary` | Primitive / Semantic |
| **2-layer semantic + dynamic** | Apple HIG | `systemBlue` → `UIColor.label`(adaptive) | Primitive / Semantic |

**我們選 5-layer**(Primitive / Semantic / Family / Layout / Internal),擴充 Material 3 流派加兩層處理結構化常數:
- **Family**(Material 3 `md-sys-*` 子分支):cross-component 共用的具體尺寸 family(`--field-height-*` / `--table-row-*` / `--tab-height-*`)
- **Layout**(Material `md-comp-layout` 對應):跨層佈局常數(`--layout-space-loose` / `--sidebar-width` / `--chrome-header-height`)
- **Internal**(Material `md-comp-*` 對應):單元件內部不對 consumer 公開(目前 0 個——所有跨元件都 promote 到 Family,單元件 hardcode in tsx)

`tokens/README.md`「Public vs Internal token」表 cross-reference 本 spec 此段。

---

## 5-Layer 架構

| Layer | 抽象度 | 例子 | 居住檔案 | Consumer scope |
|---|---|---|---|---|
| **L1 Primitive** | 原始 raw value(無 mode 知識 / 無 component 知識) | `--color-blue-6` / `--color-neutral-9-opaque` / `--black-a45` / `--elevation-100` | `color/primitives.css` | **Internal**——只供 semantic 層 alias,或 Tag/Avatar 等「按色分類」元件直接消費(per `color.spec.md` 流派定位) |
| **L2 Semantic** | 表達**意圖** / 封裝 mode swap | `--primary` / `--error` / `--canvas` / `--surface` / `--foreground` / `--fg-disabled` / `--bg-disabled` | `color/semantic.css` | **Public**——consumer 直接 `bg-primary` / `text-foreground` |
| **L3 Family**(cross-component 共用尺寸) | family-scoped semantic value | `--field-height-md` / `--table-row-md` / `--tab-height-md` / `--tree-indent-md` | `uiSize/uiSize.css` | **Internal**——DS 內部 primitive 消費,consumer 用 `<Button size="sm">` 不直接寫 token |
| **L4 Layout**(全 app 結構常數) | 全域 layout primitive 尺寸 | `--sidebar-width` / `--sidebar-width-mobile` / `--chrome-header-height` / `--layout-space-loose` | `uiSize/uiSize.css` + `layoutSpace/layoutSpace.css` | **Public**——AppShell / Sidebar / ChromeHeader 等 layout primitive 元件直接消費 |
| **L5 Internal**(單元件內部) | 單元件 only | (目前 0 個) | — | 不開——若只 1 個 consumer hardcode in tsx 即可,2+ consumer 才升 L3/L4 |

**Layer 判斷流程**:

```
新增值 / 公式 / 結構常數時 ──→
  是 raw color/shadow/alpha 沒 component 意圖? ─→ L1 Primitive
  是「意圖」/ semantic state? ─────────────────→ L2 Semantic(必經 L1 alias)
  跨 component(Button/Input/Field 等都吃)? ──→ L3 Family
  全 app 結構(AppShell / Header / Sidebar)? ─→ L4 Layout
  單 component 內部? ─────────────────────────→ 不開 token,hardcode in tsx
```

---

## Naming Convention(family-scoped,3 條硬規則)

### 規則 1:`--<family>-<measurement>[-<size>]` 嚴格 family-scoped

每個 token name 一定先帶 family prefix,讓 grep 即知「這 token 屬哪 family / 哪 layer」:

| Family prefix | Layer | 範例 |
|---|---|---|
| `--color-*` | L1 Primitive | `--color-blue-6` / `--color-neutral-9-opaque` |
| `--brand` / `--primary` / `--error` / `--info` / `--success` / `--warning` | L2 Semantic(色 family,history 沒寫 `--color-` 前綴是 Atlassian 流派 idiom) | `--primary-hover` / `--error-subtle` |
| `--canvas` / `--surface*` / `--foreground` / `--fg-*` | L2 Semantic(shadcn idiom 沿用——surface tone family + fg state family 各自獨立) | `--canvas` / `--surface-raised` / `--fg-disabled` |
| `--bg-*` | L2 Semantic(state pair family,跟 `--fg-*` 配對) | `--bg-disabled`(配 `--fg-disabled`) |
| `--neutral-hover` / `--neutral-selected*` | L2 Semantic(neutral interaction family) | `--neutral-selected-hover` |
| `--<hue>-hover` / `--<hue>-active` | L2 Semantic(色相互動 family) | `--blue-hover` / `--red-active` |
| `--font-<role>-<measurement>` | L3 Family | `--font-h1-size` / `--font-body-size` |
| `--field-height-<size>` / `--table-row-<size>` / `--tab-height-<size>` / `--tree-indent-<size>` | L3 Family | `--field-height-md` |
| `--<part>-width` / `--<part>-height` / `--<part>-<measurement>` | L4 Layout | `--sidebar-width` / `--chrome-header-height` |
| `--layout-space-<role>` | L4 Layout | `--layout-space-loose` / `--layout-space-tight` |
| `--radius-<size>` | L3 Family(structural) | `--radius-md` |
| `--elevation-<step>[-hover]` | L1 Primitive(住 primitives.css 跟色一起,理由見下) | `--elevation-100` / `--elevation-200-hover` |
| `--opacity-<role>` | L1 Primitive(structural,單一值) | `--opacity-disabled` |
| `--<part>-<measurement>-<size>` | L4 Layout(panel widths 等)| `--data-table-sort-panel-width` |

### 規則 2:`--<size>` suffix 跟 family 共用 size vocabulary

所有 size suffix 統一 `xs / sm / md / lg`(elevation 例外用 `100 / 200` Material idiom,因 elevation 不跟 density 走)。**禁** 自創 `tiny` / `small` / `regular` / `large` 等同義詞。

### 規則 3:Tailwind utility bridge 命名同步

每個 token 若提供 utility(`text-h1` / `bg-primary` / `h-field-md`)必經 `@theme inline` 或 `@utility`,utility 名 = token name 去 `--` 前綴 + 必要的 utility prefix(`bg-` / `text-` / `h-`)。**禁** 在 bridge 中改名(`--font-body-size` 不可橋成 `text-paragraph`)。

---

## Token vs Hardcode 判斷

**標準:同值在 ≥ 2 處需要保持同步 → 必開 token。** 1 處 = hardcode + 註解 why(若非常識值);2+ 處 = token。

### Token 化必過 3 題

1. **這值會在 ≥ 2 處同步出現嗎?**(2 處不一定要 sync 也不算——須有「同步義務」,例如「Button 跟 Input 必同高」)
2. **找得到既有 family 可鏡射嗎?**(命中 → 用既有 family 加 size variant;沒命中 → 走規則 1 命名,別自創孤立 family)
3. **改值時所有 consumer 都該跟著變嗎?**(YES → token;NO → hardcode 因為各 consumer 各自意圖)

任一 NO → hardcode in code + 註解 why。

### Hardcode 合法情境

- 單一 consumer 的 padding / gap / size(eg. Tooltip arrow `4px`)
- 跟設計上下文耦合的值(eg. 圖表 axis tick gap)
- 數學 / 物理常數(eg. `Math.PI`,動畫 `easing` 公式參數)

**禁止以「省工」「之後再開」「先寫死試試」為由拒絕開 token。**(違 mindset #1)

### Hardcode 必註解(若不是視覺常識值)

```tsx
// hardcode 24px:Tooltip arrow geometry,只此一處 consumer + 跟 Radix arrow lib 物理綁定
<TooltipArrow width={24} />
```

---

## 跨 family co-location 規則(2026-05-26 codify)

某些 token 雖然名前綴看似屬一 family,但實際 co-located 在另一 family 檔案——**有意的依賴關係,不是命名 drift**:

### Co-location 1:`--elevation-*` 住 `color/primitives.css`

**Why**:elevation 跟 color 共用 light/dark mode 切換 trigger(`[data-theme="dark"]`)。把 elevation 跟 color primitives 放同一個 `[data-theme="dark"]` block,**改 mode 設定一處全聯動**;若拆出去 `elevation/elevation.css` 各有 dark override block → 兩處 mode trigger,容易「改 a 壞 b」。

**對齊**:Material 3 `md-sys-elevation` 直接定義在 `theme` 範圍內(跟 color theme 同 root);Atlassian DS 「shadow + color in same theme primitive layer」;Polaris `--p-shadow-*` 與 `--p-color-*` 同住 theme css。

**拆分例外條件**:若未來 elevation 需要獨立 dark mode trigger(eg. high-contrast mode 不變色但加重 shadow)→ 才拆。目前無此需求。

### Co-location 2:`--canvas` / `--surface` 跟 `--bg-<state>` 是 **2 個 family**(不是 drift)

| Family | 命名前綴 | 用途 | Sourced from |
|---|---|---|---|
| **Surface tone family** | `--canvas` / `--surface` / `--surface-raised` / `--surface-strong` / `--overlay` / `--tooltip` | 容器層級的**底色 tone**——不同 layer 不同視覺深度 | shadcn idiom(`--background` family),DS 沿用避免破壞 shadcn compat 命名 |
| **State pair family** | `--bg-<state>` 配 `--fg-<state>` | 互動元件 disabled / hover / active **state 底色**——跟前景文字 state 成對 | DS 自家 idiom,確保 bg + fg 一定一對一 sync(`--bg-disabled` 配 `--fg-disabled`) |

**Why 2 個 family**:Surface tone 是「容器深度」概念,跟 state 無關;State pair 是「元件當下互動 state」概念,跟容器深度無關。**強行統一**(eg. 命名全部 `--bg-canvas` / `--bg-disabled`)→ 失去語義邊界,consumer 寫 code 時不知該選哪個。

**對齊**:Polaris `--p-color-bg`(tone family)vs `--p-color-bg-disabled`(state pair);Material 3 `md-sys-color-surface*`(tone)vs `md-sys-color-on-disabled`(state);Atlassian `color.background.neutral`(tone)vs `color.background.disabled`(state)— 三家世界級全部 2 family 拆,我們對齊。

### Co-location 3:`--layout-space-*`(layoutSpace/)vs `--sidebar-*` / `--chrome-header-*` / `--*-panel-width`(uiSize/)

**Layer 同為 L4 Layout**,但兩個 family 拆兩個檔案(`layoutSpace/` vs `uiSize/`):

| Family | 檔案 | 用途 |
|---|---|---|
| `--layout-space-*` | `layoutSpace.css` | **抽象** spacing rhythm(loose / tight / bottom)——多 consumer 共用 |
| `--sidebar-*` / `--chrome-header-*` / `--data-table-*-width` | `uiSize.css` | **具體** layout primitive 尺寸——對應特定 layout primitive 元件 |

**Why 拆**:抽象 spacing rhythm 改值 → 整 app rhythm 動;具體 primitive 尺寸改值 → 單個 primitive 動。兩個影響半徑不同,拆檔案讓 grep / blame 直接看出。

### Co-location 4:`--opacity-disabled` 是 L1 Primitive 不是 L2 Semantic

雖然名含「disabled」看似 semantic,但實際是**單一 structural value**(0.45)沒 mode swap、沒 hover/active variant——當 L1 Primitive 處理。`@utility opacity-disabled` 直接 expose 給 consumer。

**對齊**:Atlassian Pragmatic guideline opacity scale 也住 primitive layer。

---

## Internal vs Public token(consumer scope)

| Layer | Scope | Consumer who reads token? |
|---|---|---|
| **L1 Primitive** | Internal | Tag / Avatar(per color.spec.md 混合存取流派);其他禁直接 `--color-blue-6` |
| **L2 Semantic** | **Public** | 所有 consumer(app / explorations / patterns)直接 `bg-primary` / `text-foreground` |
| **L3 Family**(`--field-height-*` 等) | Internal | DS 內部 primitive(Button / Input / DataTable)消費;**consumer 必走 component prop**(`<Button size="sm">`)不直接 raw token |
| **L4 Layout**(`--sidebar-width` / `--layout-space-*`) | **Public** | Layout primitive 元件(AppShell / Sidebar / ChromeHeader)+ consumer 寫自家 layout 直接消費 |
| **L5 Internal** | Internal | 單 component 內部(目前 0 個) |

**Stories 義務**:
- Public token → **必補 Storybook stories**(色票 / 字級 / 間距對照展示)
- Internal token → spec.md codify family 即可,**免 stories**(consumer 不直接看)

`tokens/README.md`「Public vs Internal token」表 cross-reference 本段。

---

## 跨 family `@theme inline` bridge(Tailwind v4 spec)

Tailwind v4 `@theme inline` 把 CSS variable 升級成 utility class。每 family CSS 檔末段必有 `@theme inline` block 橋接 token → utility:

```css
@theme inline {
  --spacing-field-md: var(--field-height-md);   /* `h-field-md` utility */
  --color-primary:    var(--primary);            /* `bg-primary` utility */
}
```

**禁** 在 bridge 中改 token 值或重新命名(`--spacing-field-md = 32px` 直接 hardcode = drift);**必** 用 `var()` 引用既有 L1/L2 token。

---

## SSOT auto-sync 義務(2026-05-23 user 永久 directive)

新增 / 改 / 廢 token 時:
1. **Spec.md** codify rationale(本 spec 上游 + family spec.md 下游)
2. **CSS file** 寫定義
3. **Tailwind bridge** `@theme inline` / `@utility` 補完
4. **Consumer 改寫**:若 rename / retire → grep DS-wide consumer 一次改完(M10 proactive scan)
5. **Hook / audit** 對齊(若新 family invariant → 補 hook;若新 dim → 補 audit skill)
6. **Stories**(if Public token)

**禁** 留「下個 session 補 stories」「之後再 grep consumer」(M33 retired but principle absorbed by M20 sub-rule)。

---

## 世界級對照 citation

| 概念 | 對應世界級 DS | source |
|---|---|---|
| 分層 token 架構 | Material 3 reference / system / component | <https://m3.material.io/foundations/design-tokens/overview> |
| Primitive + Semantic 2-layer | Polaris `--p-color-*` | <https://polaris.shopify.com/tokens/colors> |
| Semantic state token(hover / active / disabled) | Atlassian DS foundations | <https://atlassian.design/foundations/color-new> |
| Family scoped naming(`--<family>-<size>`) | Carbon `$button-primary-active` | <https://carbondesignsystem.com/elements/color/tokens/> |
| Adaptive token(light/dark co-location) | Apple HIG `UIColor.systemBlue` adaptive | <https://developer.apple.com/design/human-interface-guidelines/color> |
| Surface tone vs state pair 2 family | Polaris `--p-color-bg` vs `--p-color-bg-disabled` | <https://polaris.shopify.com/tokens/colors> |
| Elevation 跟 theme co-location | Material 3 `md-sys-elevation` in theme | <https://m3.material.io/styles/elevation/tokens> |

---

## 反 pattern(禁)

| 禁 | 原因 |
|---|---|
| 自創新命名 family 不過 family-scoped 規則 | 1 個 token 屬 N 個 family = consumer 認知衝突 |
| 1 處 hardcode 立即開 token | <2 處同步 = token 過度抽象,Linear/Polaris 都警告 token bloat |
| 為 1 consumer 開 L3 Family token | Family 抽象服務 cross-component,1 consumer 該 hardcode in tsx |
| 拆 elevation 出 primitives.css 另做 dark override | 兩處 mode trigger,「改 a 壞 b」(M10 違反) |
| L2 Semantic 直接 raw oklch 不 alias L1 | 跳層 = 失去 primitive scale benefit + 改值要動兩處 |
| L4 Layout token 不 publish 到 npm tokens aggregator | Consumer install DS 拿不到 → 跑版(2026-05-26 AppShell 事件 root cause) |
| Internal token(`--field-height-*`)出現在 consumer code | 該走 component prop 不直接 raw token |

---

## 相關

- `README.md`(tokens charter)— 檔案路徑 + Public vs Internal token 表
- `color/color.spec.md` — L1/L2 色彩 family 具體規則(含 Tag / Avatar 直接消費 L1 的流派定位)
- `uiSize/uiSize.spec.md` — L3 Family / L4 Layout 尺寸 token
- `typography/typography.spec.md` — `--font-*` family
- `elevation/elevation.spec.md` — `--elevation-*`(住 `color/primitives.css`,理由見「跨 family co-location 規則」)
- `layoutSpace/layoutSpace.spec.md` — `--layout-space-*` 抽象 spacing rhythm

---
