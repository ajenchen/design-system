<!-- @benchmark-cited: D5 retrofit 2026-05-18 — verified 0 world-class DS claim in body; blanket retract removed. -->

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
- **Opacity blanket**：對整個元件套 `opacity-disabled`，一次處理所有子元素。適用於結構簡單、子元素多的元件（Avatar、Switch thumb、Rating）。Slider 屬灰階 token-swap 派,**不**用 opacity(`slider.spec.md`「Disabled 策略」反覆確認後的結論)。

不可混用——同一元件要嘛用 token swap，要嘛用 opacity，不兩者同時。

**Scope**:opacity 只負責 disabled 一個 role——error / warning 等 state 走 semantic color token 變色（`border-error` 等）、hover / active 走 `-hover` / `-active` token，皆無透明度變化（role 隔離，詳「設計哲學」(2)；全 DS production code 無 error-state opacity 用例）。**已 codify 的 reuse 例外**（reuse 同一 token，非新增 opacity role）：DataTable 整表 refresh loading（`data-table.spec.md`「狀態處理職責邊界」）與 drag source 半透（同 spec「Drag visual SSOT」+ `lib/drag-visual.ts`）。

## 為什麼 0.45

0.45 在 light mode 和 dark mode 都能對 disabled 元件產生足夠辨識度（明顯區分於 active state）。「辨識」與「閱讀」是兩個不同要求：WCAG 2.1 SC 1.4.3 明文豁免 inactive UI component 的文字對比（無法定「可讀對比」門檻）；但 UX 上使用者仍須**辨識**出「這裡有一個控件、且目前停用」——0.45 服務的是辨識，不是閱讀。

選 0.45 的位置: <!-- @benchmark-unverified -->

- 比 **Material 0.38** 略亮(Material 在白底 dark text 0.38 太弱,DS 使用 lg / dark mode 共用一個值需折衷)
- 比 **Apple iOS 0.4 / Atlassian 0.4** 稍亮(iOS 是 mobile-first 對比偏強,DS desktop 場景文字密集需更可辨識)
- 比 **Polaris 0.5 / Tailwind 0.5** 稍暗(0.5 對 disabled 元件辨識度不足,容易誤判為 hover state)
- **0.45 是 0.4-0.5 區間中位數**,跨 light / dark mode 都 robust

世界級對照(2026-05-01 加): <!-- @benchmark-unverified -->

| DS | Material 3 | Carbon | Tailwind v4 | Ant Design | Polaris | Apple HIG | Atlassian |
|----|-----------|--------|-------------|------------|---------|-----------|-----------|
| **0.45**(opacity-disabled)+ token swap 雙策略 | 0.38(text on surface)/ 0.12(container)| 0.25(opacity fallback,主走 token swap)| `opacity-{0,5,10,...,95,100}` percent ladder | 純 token swap(`colorTextDisabled` 等)| 0.5 + token swap | 0.4(`UIDisabled`)| 0.4 + token swap |

**結論**:disabled 在世界級 DS 的兩派哲學(token swap-only vs opacity blanket)+ opacity value 從 0.25 到 0.5 不等。本 DS 採「雙策略並存」哲學(複雜元件 token swap / 簡單元件 opacity blanket),value 取 0.4-0.5 中位 0.45。

## 設計哲學

兩個關鍵決策,各自有世界級先例支撐:

**(1) 雙策略並存(token swap 為主 + opacity blanket 為輔)— 對齊 Carbon / Atlassian 折衷哲學** <!-- @benchmark-unverified -->

純 token swap(Material / Ant / Polaris):每元件每層 disabled 自己一個 token,精確但 token 數激增(Material 有 50+ disabled token);純 opacity blanket(早期 Bootstrap):一律 0.5 簡單但無法表達 multi-layer hierarchy(disabled Button 的 icon / label / border 三層該有不同程度 fade)。

本 DS 採 Carbon-aligned 折衷:**多層結構元件用 token swap**(Button 有 fg / bg / border 各自 disabled token);**簡單元件用 opacity blanket**(Avatar / Switch thumb 一個視覺單位,opacity 0.45 一次處理所有子元素)。明文「不可混用」避免 disabled overlay 重疊產生「過度褪色」(0.45 × 0.45 = 0.2 不可讀)。

**(2) Single tier 0.45 而非 Tailwind multi-tier opacity scale — 對齊 Polaris / Apple 單值哲學** <!-- @benchmark-unverified -->

Tailwind 提供 `opacity-{5/10/20/30/40/50/60/70/80/90/95}` 百分比 ladder,但這是 utility scale 非 semantic role — 每個 consumer 自己挑值,跨元件不一致(A 用 opacity-50 / B 用 opacity-40 都 disabled)。

本 DS 為 disabled 場景 single semantic token(`opacity-disabled = 0.45`),所有 disabled 用同一值 — 對齊 Polaris `opacity-disabled` / Material `disabled-on-surface` / Apple `UIDisabled` 「single semantic value for one role」哲學。捨棄 Tailwind multi-tier 的代價是「無法表達多層 hover/active fade」,但 hover / active 走 hover-bg / pressed-bg token,opacity 只負責 disabled,role 隔離。

## A11y（disabled 訊號不只透明度）

透明度是視覺輔助,不是 disabled 的唯一訊號:語意由 native `disabled` / `aria-disabled` attribute 傳達給輔助技術（SR 朗讀 unavailable,非依賴視覺）,並伴隨互動阻斷（無法觸發 / `cursor-not-allowed`）提供非色彩線索——色弱使用者不依賴 0.45 fade 也能辨識停用狀態。

## 消費者

直接套用 `opacity-disabled` 的元件（grep 驗證 2026-06-11）：Avatar（Field disabled context self-dim）、Button（`aria-disabled` 分支）、MenuItem、Rating（disabled / loading 整塊）、Steps、Switch、Textarea（disabled 分支）、DataTable（drag source 半透 + 整表 refresh loading reuse，經 `lib/drag-visual.ts`）。

非消費者（曾誤列）：Slider / Sidebar 走灰階 token swap；Chip 無 opacity 用例；Field wrapper blanket 已移除（Avatar self-dim 取代，見 field-wrapper.tsx 註解）。

## 反向引用

- Disabled 策略選擇框架：`tokens/color/color.spec.md`
