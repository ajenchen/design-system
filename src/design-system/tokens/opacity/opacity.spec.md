<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Opacity 設計原則

Opacity 定義元件停用狀態的透明度，確保全系統 disabled 視覺一致。

## Token

| Token | 值 | Tailwind utility | 用途 |
|-------|-----|-----------------|------|
| `--opacity-disabled` | 0.45 | `opacity-disabled` | 所有元件的 disabled 狀態 |

## 使用規則

### 何時用 opacity vs token swap

停用狀態有兩種視覺策略（詳見 `color.spec.md`「Disabled 狀態」節 / 「兩種 disabled 策略」）：

- **Token swap**（預設）：disabled 時換成專用 token（`fg-disabled`、`bg-disabled`），精確控制每個層的顏色。適用於多層結構的元件（Button、Input）。
- **Opacity blanket**：對整個元件套 `opacity-disabled`，一次處理所有子元素。適用於結構簡單、子元素多的元件（Avatar、Switch thumb、Slider）。

不可混用——同一元件要嘛用 token swap，要嘛用 opacity，不兩者同時。

## 為什麼 0.45

0.45 在 light mode 和 dark mode 都能產生足夠的「褪色感」，同時保持文字可讀（WCAG 不要求 disabled 元素的對比度，但仍需辨識）。

選 0.45 的位置:

- 比 **Material 0.38** 略亮(Material 在白底 dark text 0.38 太弱,DS 使用 lg / dark mode 共用一個值需折衷)
- 比 **Apple iOS 0.4 / Atlassian 0.4** 稍亮(iOS 是 mobile-first 對比偏強,DS desktop 場景文字密集需更可辨識)
- 比 **Polaris 0.5 / Tailwind 0.5** 稍暗(0.5 太弱「褪色感」不足,disabled 看起來像 hover state)
- **0.45 是 0.4-0.5 區間中位數**,跨 light / dark mode 都 robust

世界級對照(2026-05-01 加):

| DS | Material 3 | Carbon | Tailwind v4 | Ant Design | Polaris | Apple HIG | Atlassian |
|----|-----------|--------|-------------|------------|---------|-----------|-----------|
| **0.45**(opacity-disabled)+ token swap 雙策略 | 0.38(text on surface)/ 0.12(container)| 0.25(opacity fallback,主走 token swap)| `opacity-{0,5,10,...,95,100}` percent ladder | 純 token swap(`colorTextDisabled` 等)| 0.5 + token swap | 0.4(`UIDisabled`)| 0.4 + token swap |

**結論**:disabled 在世界級 DS 的兩派哲學(token swap-only vs opacity blanket)+ opacity value 從 0.25 到 0.5 不等。本 DS 採「雙策略並存」哲學(複雜元件 token swap / 簡單元件 opacity blanket),value 取 0.4-0.5 中位 0.45。

## 設計哲學

兩個關鍵決策,各自有世界級先例支撐:

**(1) 雙策略並存(token swap 為主 + opacity blanket 為輔)— 對齊 Carbon / Atlassian 折衷哲學**

純 token swap(Material / Ant / Polaris):每元件每層 disabled 自己一個 token,精確但 token 數激增(Material 有 50+ disabled token);純 opacity blanket(早期 Bootstrap):一律 0.5 簡單但無法表達 multi-layer hierarchy(disabled Button 的 icon / label / border 三層該有不同程度 fade)。

本 DS 採 Carbon-aligned 折衷:**多層結構元件用 token swap**(Button 有 fg / bg / border 各自 disabled token);**簡單元件用 opacity blanket**(Avatar / Switch thumb 一個視覺單位,opacity 0.45 一次處理所有子元素)。明文「不可混用」避免 disabled overlay 重疊產生「過度褪色」(0.45 × 0.45 = 0.2 不可讀)。

**(2) Single tier 0.45 而非 Tailwind multi-tier opacity scale — 對齊 Polaris / Apple 單值哲學**

Tailwind 提供 `opacity-{5/10/20/30/40/50/60/70/80/90/95}` 百分比 ladder,但這是 utility scale 非 semantic role — 每個 consumer 自己挑值,跨元件不一致(A 用 opacity-50 / B 用 opacity-40 都 disabled)。

本 DS 為 disabled 場景 single semantic token(`opacity-disabled = 0.45`),所有 disabled 用同一值 — 對齊 Polaris `opacity-disabled` / Material `disabled-on-surface` / Apple `UIDisabled` 「single semantic value for one role」哲學。捨棄 Tailwind multi-tier 的代價是「無法表達多層 hover/active fade」,但 hover / active 走 hover-bg / pressed-bg token,opacity 只負責 disabled,role 隔離。

## 消費者

Avatar、Sidebar、MenuItem、Slider、Switch、Steps、Chip。

## 反向引用

- Disabled 策略選擇框架：`tokens/color/color.spec.md`
