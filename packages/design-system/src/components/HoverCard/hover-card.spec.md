---
component: HoverCard
family: composite
variants: {}
sizes: {}
traits:
  - isOverlay
  - isInternal
benchmark:
  - Radix HoverCard primitive: github.com/radix-ui/primitives/tree/main/packages/react/hover-card
  - Ant Design Popover: github.com/ant-design/ant-design/tree/master/components/popover
---

# HoverCard 設計原則

## 定位

Hover 觸發的**可互動浮層**，基於 Radix HoverCard。

**實作基礎**：基於 Radix HoverCard——純行為 primitive，只提供觸發邏輯、定位、動畫，不含視覺樣式。

**分類**：Internal primitive——consumer 不直接 import;由 Avatar(`hoverCard`)/ OverflowIndicator / ProfileCard 場景組合消費(frontmatter `isInternal`:root barrel 排除,storybook `Design System/Internal/HoverCard`)。

- **是**：hover 顯示可互動內容（按鈕、連結、可選取文字）的浮層容器
- **不是**：Tooltip（純文字提示、不可互動、hover 離開即消失）

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **人員資訊卡**：Avatar hover 顯示 ProfileCard（姓名、角色、聯絡按鈕）
- **溢出項目展開**：人員列表 `+N` hover 展示完整清單
- **內容預覽**：連結 / 文件 hover 顯示標題 / 縮圖 / 摘要預覽
- **不破壞當前畫面的補充資訊**：hover 可看細節，不 hover 也能使用主要介面

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純文字提示（icon 用途、shortcut）| `Tooltip` | 見下「與 Tooltip 的分界」 |
| 點擊觸發（非 hover） | `Popover` | HoverCard 觸發是 hover，點擊用 Popover |
| 需要阻斷背景的流程 | `Dialog` | HoverCard 非阻斷、hover 離開自動消失 |
| 關鍵資訊（必須被看到）| 直接顯示在畫面上 | 觸控裝置無法 hover，關鍵資訊不可只靠 HoverCard |

---

## 與 Tooltip 的分界

兩者都是 hover 觸發，判斷用**互動性**和**內容性質**：

| | HoverCard | Tooltip |
|---|---|---|
| 觸發 | hover | hover |
| **內容可互動** | 是（按鈕、連結、hover 子元素） | 否（純文字） |
| 停留行為 | 滑鼠移到浮層上不消失 | 滑鼠離開 trigger 即消失 |
| 視覺樣式 | 由 consumer 決定（亮色 card 或深色 tooltip 風格皆可） | 統一深色背景 |
| 典型用例 | ProfileCard、內容預覽、溢出清單 | icon 用途、shortcut、截斷文字補全 |

**Fallback**：需要放按鈕 / 連結 → HoverCard；一句話純文字 → Tooltip。

**本節是 HoverCard vs Tooltip 的 SSOT**，Tooltip spec 指回本節。

## 純行為 primitive

HoverCardContent 只提供：
- `z-50`（浮層層級）
- 進出場動畫（fade + zoom + slide，方向感知）
- `sideOffset`（與 trigger 的間距）

**不提供** `bg`、`border`、`shadow`、`padding`、`rounded`——consumer 根據場景自行決定：

| Consumer | 視覺風格 |
|---|---|
| ProfileCard | 亮色 card（`bg-surface-raised` + `elevation-200` + `rounded-lg` + `border`） |
| OverflowIndicator | 深色 tooltip 風格（`bg-tooltip` + `data-theme="dark"`） |

## sideOffset

預設 `8px`，與系統其他浮層（Tooltip、Popover）統一。

## align

**HoverCard 走「輕量浮層」例外**(見 `../Popover/popover.spec.md`「SSOT 適用範圍」)—— hover 觸發、預設展示為主、寬度隨內容自適應,Radix 預設 `center` 即可涵蓋絕大多數情境。`align` 由 consumer 視視覺需求自選(ProfileCard hover 常用 `start` 對齊 avatar 左邊緣),**不強制對齊 structured overlay 的 trigger-position canonical**。

## 用途

- **ProfileCard**：人員 Avatar hover 顯示詳細資訊
- **Overflow person list**：溢出的人員列表 hover 展開
- **Preview card**：內容預覽（文件、連結）

## Avatar 整合

Avatar 元件的 `hoverCard` prop 接受 HoverCard content，自動將 Avatar 包在 HoverCardTrigger 內。人員類 Avatar 應統一使用此 pattern 提供 hover 資訊。

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

HoverCard 是**純行為 primitive**(只提供 hover 觸發邏輯 + 定位 + 動畫,不含視覺樣式),設計上刻意不擁有變體:

- **無 Inspector**:HoverCard 的互動 prop 只有 `sideOffset`(預設 8px,統一浮層間距)與 placement(side / align),再多就侵入 consumer 的職責。元件特有 `VisualVariants` story 展示「同一個 HoverCard primitive 如何被 ProfileCard / OverflowIndicator 兩個 consumer 包出完全不同的視覺」才是 HoverCard 的設計精神——互動 Inspector 無法呈現此點。
- **無 ColorMatrix**:HoverCardContent **不提供** `bg` / `border` / `shadow` / `rounded`(見本 spec「純行為 primitive」段),consumer 決定視覺(ProfileCard 亮色 card / OverflowIndicator 深色 tooltip 風格)。色彩不屬 HoverCard 職責。
- **無 SizeMatrix**:無 size prop,尺寸由 content 決定,寬高繼承 consumer。
- **無 StateBehavior**:passive open / close(hover 觸發),無 hover / selected / active / disabled——這些屬於 consumer 元件(ProfileCard 的 section, OverflowIndicator 的 item)。

對應 anatomy story:保留 `Overview` + 元件特有 `VisualVariants`(展示 primitive + consumer 視覺解耦的 hero story)。

---

## 禁止事項

- ❌ 把關鍵資訊放在 HoverCard — 觸控裝置無 hover 能力,user 永遠看不到;關鍵 info 直接顯示或 Popover(click 觸發)
- ❌ HoverCard 內塞表單 / 多步流程 — hover 離開可能誤關閉,複雜互動用 Dialog / Sheet
- ❌ HoverCard 自帶 bg / border / shadow / padding 套在 HoverCardContent 上 — HoverCard 是純行為 primitive,視覺由 consumer ProfileCard / OverflowIndicator 各自決定(見「純行為 primitive」段)
- ❌ HoverCard delay 設 0(立即彈出)— 滑鼠掃過所有 trigger 都彈,視覺雜訊;delay tier SSOT 見 `tokens/motion/motion.spec.md`(rich 700ms open / close 200ms;2026-06-11 起 HoverCard Root 內建預設,裸用即得 canonical,consumer 可 per-instance override — 如 OverflowIndicator 傳 plain)
- ❌ 拿 HoverCard 當 Tooltip(純文字提示)— 用 Tooltip(統一深色背景 + ARIA `role="tooltip"`),HoverCard 是 interactive surface 角色不同

## 常見誤解

- 「HoverCard 內的按鈕鍵盤可達」——錯。Radix 把 content 內 tabbable node 設 `tabindex="-1"`,鍵盤使用者進不了卡片(見 A11y 預設);需鍵盤可達的互動浮層用 Popover
- 「HoverCard = 大一點的 Tooltip」——錯。Tooltip 純文字不可互動;HoverCard 是 interactive surface(分界 SSOT 見上方)
- 「觸控裝置也會開卡」——觸控無 hover;關鍵資訊不可只放 HoverCard(見禁止事項)

## 邊界案例 / 空值

- **重複快速 hover**:open / close delay 自然 debounce——滑過不停留不開卡(open delay),短暫滑出再滑回不閃爍(close delay 緩衝)
- **Content 為空**:純行為 primitive 不驗證 content,傳空仍渲染空浮層;consumer(如 Avatar `hoverCard`)應在無資料時不掛 hoverCard prop
- **浮層超出 viewport**:Radix collision 自動 flip / shift(`collisionPadding=12` 保證視覺 ≥ 8px 邊距);高度以 `--radix-hover-card-content-available-height` 為 max-h + flex chain 壓縮 scroll(M25)
- **Disabled / loading**:純行為 primitive 無此 state;fetch 中的內容(如 ProfileCard loading)由 consumer 自行渲 skeleton

---

## 相關

- `../Tooltip/tooltip.spec.md` — 純文字 hover 提示（HoverCard vs Tooltip 的分界 SSOT 在本 spec）
- `../ProfileCard/profile-card.spec.md` — 人員資訊卡（HoverCard 最常見 content）
- `../Avatar/avatar.spec.md` — 人員 Avatar 自動 hoverCard 整合
- `../Popover/popover.spec.md` — 點擊觸發的浮層(align canonical SSOT,本 spec「align」段引用)

## A11y 預設

**ARIA / Pattern**:Radix `hover-card` 刻意**不**設 `role` / `aria-*`,定位為 sighted-mouse-user 增強,content 不暴露給輔助技術(grep Radix source 0 命中 role/aria-*)。Radix 只提供:hover / focus 開、Esc 關 + `data-state`。Trigger 的可聚焦性需 consumer 自補(如 Avatar `hoverCard` 在 `avatar.tsx` 手動加 `tabIndex=0` + `role="button"` + `aria-haspopup="dialog"`)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/hover-card#accessibility)。

**Keyboard 行為**:

- Tab — 進入 trigger
- Hover / focus — 開啟 card
- Esc — 關閉

**Focus**:non-modal hover/focus surface — focus 開啟 surface,**不 trap**,focus 仍在 trigger,Esc 關閉。Visible ring(`outline: 2px solid var(--ring)` per design-system focus-visible canonical)。(2026-05-27 修正 codex M31 finding:HoverCard 非 modal,不該有 focus trap)

**驗證**:Storybook a11y addon panel 應 0 critical violation;WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。**注意鍵盤限制**:Radix HoverCard 會把 content 內所有 tabbable node 強制設 `tabindex="-1"`,故卡片**內部**的按鈕 / 連結鍵盤 Tab 到不了 — 鍵盤使用者僅能 focus trigger 開卡 + Esc 關卡,無法進入卡片操作互動內容。關鍵互動勿放 HoverCard 內(見「禁止事項」),需鍵盤可達的互動浮層用 Popover(click 觸發)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `avatar.spec.md`
- `carousel.spec.md`
- `coachmark.spec.md`
- `motion.spec.md`
- `overflow-indicator.spec.md`
- `popover.spec.md`
- `profile-card.spec.md`
- `tooltip.spec.md`
