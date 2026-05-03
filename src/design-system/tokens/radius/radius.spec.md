<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Radius 設計原則

圓角系統提供四個語意層級，對應不同元件類型。

## 圓角選項

| Tailwind class | Token | 值 | 用途 |
|----------------|-------|----|------|
| `rounded-xs`   | `--radius-xs` | 2px | 極小視覺 indicator(Chart legend swatch 8×8 色塊等 ≤ 10px 元素) |
| `rounded-md`   | `--radius-md` | 4px | 一般元件(Button、Input、Card、Tag、hover bg) |
| `rounded-lg`   | `--radius-lg` | 8px | 浮層(Dialog、Popover、Dropdown) |
| `rounded-full` | `--radius-full` | 9999px | Pill 形狀(Avatar、Switch、Progress) |

### `rounded-sm` 保留未使用

CSS 定義了 `--radius-sm`(目前 = 4px,與 md 同值),但**不在元件中使用**。保留給未來「介於 md 和 xs 之間」的需求(如更密集的 UI 模式)。所有 4px 圓角一律用 `rounded-md`。


## 使用規則

### `rounded-xs`(2px)— 極小 indicator

適用於直徑 ≤ 10px 的視覺 indicator,視覺效果需要「微圓而非完全方」:

- Chart legend swatch(8×8 色塊)
- 未來其他 micro indicator(若尺寸 ≥ 12px 請改 `rounded-md`,不要為了「更圓」使用 xs)

**判斷**:`rounded-md`(4px)在 8×8 元素上接近 50% 填滿,視覺變成 pill。2px 才維持「色塊」而非「膠囊」語意。≥ 12px 時 4px 比例適當,不需 xs。

### `rounded-md`(4px)— 一般元件

適用於大多數互動元件，視覺上「有圓角但不搶眼」：

- Button、Input、Select、Checkbox、Tag
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
// ❌ 不要用非 token 的圓角（包含 rounded-md、rounded 等）
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


## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁 `rounded-xl` / `rounded-2xl` raw utility」+「禁硬寫 `rounded-[6px]`」是本 spec 的 binary strict rule,以下為支撐 rationale。

| 維度 | 本 DS | Material 3 | Carbon | Tailwind v4 | Ant Design | Polaris | shadcn/Apple |
|------|-------|-----------|--------|-------------|------------|---------|--------------|
| Tier 數 | **4 tier**(xs/md/lg/full)+ 1 reserved sm | 6 tier(extra-small ~ extra-large + full) | 3 tier(0/1/2) | 7 tier(none/sm/md/lg/xl/2xl/3xl/full)| **4 tier**(XS/SM/Default/LG)| 6 tier(050/100/200/300/400/500/full)| 1 base + calc(shadcn)/ Squircle 連續曲率(Apple)|
| 數值序列 | **2 / 4 / 8 / 9999** geometric × 2 | 4 / 8 / 12 / 16 / 28 額外 | 0 / 2px / 4px(token rem)| 2 / 4 / 6 / 8 / 12 / 16 / 24 | 2 / 4 / 6 / 8 | 2 / 4 / 6 / 8 / 12 / 16 | `--radius` × calc 變化 |
| Pill 方案 | `rounded-full` 9999px | `shape-corner-full` | 不顯式提供 | `rounded-full` 9999px | `borderRadiusOuter` ad-hoc | `border-radius-full` | 視 component shape |
| 動態 shape | 無(靜態 4 tier)| Dynamic shape morphing(可動畫) | 無 | 無 | 無 | 無 | Apple 連續曲率動態 |

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) 4 tier(xs/md/lg/full)— 對齊 Ant Design 4-tier minimal,捨多家 6+ tier**

Material 3 / Polaris / Tailwind 6-7 tier 過細 — 每 tier 只差 2-4px,reader 視覺難分(「rounded-md 6px」vs「rounded-lg 8px」差 25% 但目視幾乎相同)。Carbon 3 tier(0/1/2)太極簡無法表達 elevation 層級(浮層 vs inline 同 radius 失去視覺 hierarchy)。

本 DS 4 tier 是「視覺可區分 + 維護友善」最佳交集 — `xs(2)→ md(4)→ lg(8)→ full` 每跳一級數值翻倍,目視差異 ≥ 50%(Weber-Fechner law 知覺閾值),不會出現「rounded-md vs rounded-mdlg 哪個對」糾結。

**(2) Geometric scale(2 / 4 / 8 doubling)— 對齊 Tailwind / Polaris 慣例**

數值 doubling 確保 reader 一眼感知「不同層級」(2→4→8 比 4→6→8 對比明顯)。對齊 Tailwind sm(2)/ md(4)/ lg(8) + Polaris 100(4)/ 200(6 — 偏離)/ 300(8) 的 powers-of-2 idiom。

捨棄連續 ratio(Material 4/8/12/16/28 等差 + 跳級)的代價是「中段 size 表現空間」(無 6px tier),DS 場景無此需求(中段需求都歸入 md=4)。

**(3) `rounded-full` 9999px 而非 50%(對齊 Tailwind / Polaris)**

50% percentage 在「短矩形」(高 < 寬,如 horizontal Switch)變橢圓而非 pill — 9999px 確保任意 aspect ratio 都圓形(實際 capped 在 height/2)。對齊 Tailwind / Polaris 全 pill 慣例,避免短矩形 edge case。

**(4) 保留 `--radius-sm` token 但不用 — 對齊 Material「reserve for future dense pattern」**

CSS 定義 `--radius-sm = 4px`(目前同 md),component 強制 `rounded-md` 不引用 sm。為什麼留:未來若引入 dense mode(`density="compact"` 介於 md / xs 之間),可開新 sm tier 不破壞既有 xs/md/lg/full 命名階梯(避免 rename 引發全 DS grep refactor)。對齊 Material 3 的「extra-small reserved tier」哲學。

捨棄「立即啟用 sm」的代價是命名空間預占,接受 — 命名穩定 > 短期 utility。

捨棄「Apple Continuous Corner / Squircle」的代價是「平台一致性」(Apple HIG 用連續曲率非單一 radius,iOS 元件視覺更柔)— DS 是 cross-platform web,採 Material/Tailwind 標準 border-radius 對齊大多數 OS native 元件,避免引入 SVG path 額外 runtime 成本。

