---
component: Tooltip
family: composite
variants: {}
sizes: {}
traits:
  - isOverlay
benchmark:
  - Radix Tooltip primitive: github.com/radix-ui/primitives/tree/main/packages/react/tooltip
  - Ant Design Tooltip: github.com/ant-design/ant-design/tree/master/components/tooltip
  - MUI Tooltip: github.com/mui/material-ui/tree/master/packages/mui-material/src/Tooltip
  - Polaris Tooltip: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Tooltip
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Tooltip 設計原則

## 定位

Tooltip 是 hover 或 focus 時出現的短文字提示，用於補充畫面上未能清楚傳達的資訊。
基於 Radix Tooltip（shadcn 包裝）+ 橋接 DS token。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

## 何時用

Tooltip 的判斷標準是：**畫面上的資訊是否已經足夠讓使用者理解？**

- **畫面不夠清楚 → 用 tooltip 補充。** 例如：icon-only 按鈕沒有文字 label，使用者需要 tooltip 才能確認這個 icon 代表什麼操作
- **畫面已經清楚 → 不需要 tooltip。** 例如：按鈕已有完整的文字 label（「儲存」「刪除」），tooltip 重複同樣的文字沒有價值
- **截斷文字 → 用 tooltip 顯示完整內容。** 但只有當文字實際被截斷時才顯示——tooltip 是補救機制，不是裝飾

## 出現時機

全產品統一一組時間參數，不因 tooltip 類型或位置而異——不一致的延遲會讓使用者無法建立穩定的操作預期。

**Warm-up pattern（暖機模式）：**

1. 使用者首次 hover 某個觸發器 → 等待初始延遲，確認是刻意停留而非滑鼠路過（NNGroup 研究：低於此閾值會導致隨意移動滑鼠時螢幕不停閃爍）
2. Tooltip 出現後，使用者移到下一個觸發器 → 在掃描窗口期內，tooltip 即時切換，不再等待（toolbar 逐一掃描場景）
3. 使用者離開所有觸發器超過掃描窗口期 → 系統冷卻，下次 hover 重新等待初始延遲

這是一個行為的兩個階段,不是兩種不同的延遲。所有 tooltip(包括 Button icon-only 自動產生的)共享同一組參數——初始延遲由 DS shared constant `HOVER_DELAY_PLAIN_MS`(Tooltip Root wrapper 預設 `delayDuration`;Radix Root prop 優先於 Provider 同名設定)統一,warm-up 掃描窗口(`skipDelayDuration`)由全域 `TooltipProvider` 控制。

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 內容需要互動（按鈕 / 連結 / 輸入框）| `HoverCard` | Tooltip 不可點擊，HoverCard 才支援互動元素 |
| 需要長篇說明（多段文字 / 圖片）| `HoverCard` / 側邊 help panel | Tooltip 是一句話補充 |
| 欄位驗證錯誤 | inline error message | Tooltip 需要 hover 才能看到，錯誤必須 persistent |
| 必要資訊的唯一載體 | 直接顯示在畫面上 | Tooltip 觸控裝置無法觸發，關鍵資訊不能只靠 hover |
| 按鈕已有完整文字 label | 不要加 tooltip | 重複同樣的文字沒有價值 |

## 與 Button icon-only 的關係

Button 的 `iconOnly` 模式已內建自動 tooltip（以 `aria-label` 驅動），開發者不需要額外包 `<Tooltip>`。只有在非 Button 元素需要 tooltip 時，才手動使用 Tooltip 元件。

## 內容完整性

Tooltip 是資訊的終點——tooltip 內不能再觸發 tooltip。內容必須完整呈現，不截斷、不省略。

- Tag 在 tooltip 內不設 max-width，文字完整顯示
- 多個 tag 自然換行（flex-wrap），tooltip 高度隨內容撐開
- 不在 tooltip 內使用需要 hover 才能看到的元素

## 子元素色彩

Tooltip 底色是深色，子元素永遠套用 dark theme token（透過 `data-theme="dark"` wrapper）。元件放進 tooltip 自動適配深色背景，不需要特殊樣式。

## Align 對齊

**Tooltip 走「輕量浮層」例外**(見 `../Popover/popover.spec.md`「SSOT 適用範圍」)—— hover 觸發、純文字展示、寬度極窄(max 280px),Radix 預設 `center` 貼合指標即可。不強制對齊 structured overlay 的 trigger-position canonical。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## Edge collision(避免貼 viewport 邊)

**`collisionPadding` default = 8**(與 HoverCard 一致),Radix `avoidCollisions` 預設 true 會自動翻邊,但 padding 0 會讓 tooltip **貼齊 viewport 邊緣**(視覺上擠)。default 8 讓 tooltip 跟 viewport 邊保留最少 8px 呼吸距離。consumer 需自訂傳 prop 即可覆寫。

世界級對照:Material Tooltip `margin: 14px` default / Polaris Tooltip 8-12px — 本 DS 選 8 對齊 HoverCard。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 最大寬度（元件級常數）

Tooltip 最大寬度 **280px**（見 `.tsx` 的 `max-w-[280px]`）——超過換行。避免單條 tooltip 占據過大空間遮蔽內容，同時保證文字可完整呈現（見「內容完整性」節，tooltip 是資訊終點，不截斷）。

對照世界級：Material tooltip 約 250–300px、Apple HIG tooltip 限制在可讀寬度——**單一元件的 canonical 寬度屬於該元件自己的 design spec，不抽為跨元件 token**。Token 系統只管共享值（如 `--field-height-*`、`--layout-space-*`）；單一元件獨有的結構常數留在 component code + 本 spec。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 邊界狀態

- **觸控裝置**:無 hover,tooltip 無法觸發——必要資訊不可只靠 tooltip 承載(見「何時不用」「禁止事項」)
- **長文字**:超過 max-width 280px 自動換行、完整呈現不截斷(見「最大寬度」「內容完整性」)
- **貼近 viewport 邊**:Radix 自動翻邊 + `collisionPadding` 8px 呼吸距離(見「Edge collision」)

## 禁止事項

- ❌ 不要在已有完整 label 的按鈕上加 tooltip 重複同樣的文字
- ❌ 不要在 tooltip 裡放互動元素——改用 HoverCard
- ❌ 不要把 tooltip 當作必要資訊的唯一載體——tooltip 需要 hover 才能看到，觸控裝置無法觸發
- ❌ 不要為個別 tooltip 設定不同的延遲時間——全產品統一一組參數
- ❌ 不要在 tooltip 內截斷資訊——tooltip 是資訊終點，內容必須完整

---

## 為何無 ColorMatrix / SizeMatrix / StateBehavior

Tooltip 是**單一職責 hover 提示 primitive**(一句話補充),刻意無變體:

- **無 ColorMatrix**:Tooltip 固定一種視覺(dark surface + white text,跟頁面主題反轉),無 variant / severity / hue。若需要有色 hint,那是 Popover / HoverCard 的職責。Dark mode 自動由 inverse theme 處理。故無 color matrix。
- **無 SizeMatrix**:Tooltip 無 size prop,尺寸由內容 + max-width 常數決定(本 spec「最大寬度」段)。不提供 sm/md/lg tier——短文字 hint 不需要尺寸變體。
- **無 StateBehavior**:Tooltip 是 passive 出現 / 消失(hover / focus 觸發,見「出現時機」段),無 hover / selected / active / disabled 這類互動元件 state。開 / 關行為由 Radix primitive 處理,寫在 `Overview` 的 usage 說明已足夠。

對應 anatomy story:保留 `Overview` + `Inspector`(delay / placement 互動試玩) + 元件特有 `PlacementReference`(12 種 side × align 對照)。

---

## 相關

- `../HoverCard/hover-card.spec.md` — hover 觸發的可互動浮層（**Tooltip vs HoverCard 的分界 SSOT 在 HoverCard spec**「與 Tooltip 的分界」段落）
- `../Button/button.spec.md` — `iconOnly` 模式自動產生 tooltip（由 aria-label 驅動）

## A11y 預設

**ARIA / Pattern**:繼承 Radix `tooltip` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/tooltip#accessibility)。

**Keyboard 行為**:

- Tab — focus trigger 時顯示
- Esc — 關閉

**Focus**:non-modal hover/focus surface — focus 開啟 surface,**不 trap**,focus 仍 在 trigger,Esc 關閉。Visible focus ring 由 trigger 元件自身的 focus-visible 樣式提供(各 trigger 元件 canonical;Tooltip 本體不另加 ring)。(2026-05-27 修正 codex M31 finding:Tooltip 非 modal,不該有 focus trap,原 wording 誤導)

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`
- `hover-card.spec.md`
- `motion.spec.md`
- `popover.spec.md`
- `profile-card.spec.md`
