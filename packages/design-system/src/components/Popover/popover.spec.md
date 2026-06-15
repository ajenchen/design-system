---
component: Popover
family: composite
variants: {}
sizes: {}
traits:
  - isOverlay
benchmark:
  - Radix Popover primitive: github.com/radix-ui/primitives/tree/main/packages/react/popover
  - MUI Popover: github.com/mui/material-ui/tree/master/packages/mui-material/src/Popover
  - Polaris Popover: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Popover
  - Ant Design Popover: github.com/ant-design/ant-design/tree/master/components/popover
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Popover 設計原則

## 定位

Popover 是**點擊觸發的浮層容器**——提供定位、動畫、焦點管理，內容由 consumer 決定。

**實作基礎**：shadcn passthrough——基於 Radix Popover。本 DS 保留 shadcn 原結構 + 橋接 DS token（elevation / radius / border）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

**視覺對齊 Dialog**：外殼 token 與 Dialog 完全一致（`bg-surface-raised` / `border-border` / `rounded-lg` / `elevation-200`）。差別僅兩點：(1) Popover 是 non-modal 輕量浮層不阻斷背景，(2) **density 永遠鎖 `md`** — Popover 不隨頁面 density 放大（lightweight 浮層保持緊湊）。

**Content size canonical（2026-04-29）**:density lock md → **fields(Input / Select / Checkbox)預設 `size="md"`**(field-height-md 32px,對齊 density)。其餘細節走 SSOT pointer:
- Chrome corner buttons(close X / refresh / dismiss)→ `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」(sm native + v5 trick)
- Row inline action(panel list row 內 Eye / drag / suffix toggle)→ `patterns/element-anatomy/inline-action.spec.md`「尺寸對照」table(md = 16+18 hover bg)
- Footer action button → `action-bar.spec.md`(輕量 chrome,sm canonical)

**觸發距離 canonical**：`sideOffset = 8`（px）—— trigger 到 Popover 邊緣的垂直/水平間距。8px 是世界級浮層 idiom（Notion / Linear / Figma / Stripe 皆約 6-8px）;< 4px 會讓浮層貼死 trigger 失去「另一層」感,> 12px 會拉斷 trigger ↔ content 的視覺關聯。Radix/shadcn 預設 4px 太緊,本 DS 改為 8 對齊 overlay primitive 的呼吸感。Dialog 不適用(居中或 full-screen)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Viewport 邊距 canonical**:`collisionPadding = 8`(px)——浮層與 viewport 邊緣的最小間距。當 popover 原本要貼近 viewport 邊(trigger 在頁面最右側、或視窗很窄),Radix 會自動推開 8px 讓浮層不貼死邊界。世界級對照:macOS / iOS / Notion / Figma 的 overflow 選單永遠留視覺呼吸距。`sideOffset` 管 trigger↔popover,`collisionPadding` 管 popover↔viewport,兩者互補。Consumer 不需傳 — 預設值是 canonical。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Align 對齊 canonical(跨浮層 SSOT)**:`align` 必須跟隨 trigger 在容器中的位置,**不是自由選擇**:

| Trigger 在容器 | `align` | 對齊行為 |
|---------------|---------|----------|
| **左側 / 左上**(page header left、sidebar filter button) | `"start"` | Popover 與 trigger 左邊緣對齊,向右展開 |
| **置中**(toolbar 中央、modal 內置中按鈕) | `"center"`(default)| Popover 與 trigger 中心對齊 |
| **右側 / 右上**(page header right、設定按鈕、overflow menu) | `"end"` | Popover 與 trigger 右邊緣對齊,向左展開 |

**為什麼**:Popover 通常比 trigger 寬。align 錯方向會 (1)溢出容器邊緣 / 被 viewport 裁切、(2)視覺上 popover「沒黏在 trigger 那一側」產生 disconnect,使用者以為兩者無關。世界級對照:Figma / Notion / Linear / Stripe / Material / Ant Design 一律遵循(trigger 靠哪邊、浮層跟著靠哪邊)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**SSOT 適用範圍(2026-04-20 精緻化)**:本規則是**「結構化浮層」的 canonical** —— Popover / DropdownMenu / Coachmark / SelectMenu 嚴格遵守(這些浮層寬度通常比 trigger 寬、且有結構化內容,錯方向必視覺 disconnect)。

**輕量浮層例外**:Tooltip / HoverCard 不適用此 canonical —— 兩者 predominantly hover 觸發、純展示(不互動或極少互動)、寬度隨內容自適應,Radix 預設 `align="center"` 即可涵蓋絕大多數情境。強行套 trigger-position alignment 反而破壞 Tooltip「貼合指標」的輕量感。這兩個 primitive 走自己的 spec canonical(通常 center + 小 sideOffset)。

**SelectMenu 特例**:SelectMenu 是 input-triggered,width 在 min/max 範圍內自動跟 input 同寬 → `align="start"`(對齊 input 左邊緣)在視覺上與「popover 跟 input 同寬」重疊,consumer 感知不到 alignment 差異。仍採用 canonical 以保 code 一致性,但視覺上是透明的。

其他結構化浮層 spec 若討論 align 應 pointer 指回本節。

**結構化組合（可選）**：PopoverContent 外殼無內距，consumer 可選擇：
- **單一 body**：包 `<PopoverBody>` 取得 Dialog body 同 padding (`px-loose py-tight`)
- **含標題**：組合 `<PopoverHeader>` + `<PopoverBody>`（下分隔線由 Header 提供）
- **含操作按鈕列**：再加 `<PopoverFooter>`（上分隔線由 Footer 提供）

**Dismiss 預設**(與 Dialog 一致):Popover **預設 dismissible** —— 點擊 trigger 外 / 按 Esc / focus 離開 content 樹,三者任一皆關閉。由 Radix 內建 `onPointerDownOutside` / `onEscapeKeyDown` 行為提供,consumer 無需額外 wire。如需強制 modal(必須按 Close 才能關),傳 `modal={true}` 並在 Header 放 Close 按鈕;但這是例外,不是預設——Popover 的本質是「使用者可以忽略、繼續主流程」。

> **跨家族 SSOT pointer**:PopoverHeader 屬 **Padding-based overlay header 家族**;border / padding / dismiss size / withTabs(tabs 進 PopoverHeader 時 border auto-suppress + tabs size sm)的跨家族視覺契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。本節僅 codify Popover 特有 close X v5 unbounded canonical。

**Close X 按鈕(2026-04-22 v5 unbounded canonical)**:所有 `PopoverHeader` 內建右上 X 按鈕,`<Button data-dismiss iconOnly dismiss size="sm" />` native sm(28 md / 32 lg)。透過 SurfaceHeader 的 v5 CSS rule 自動套負 margin 讓 layout 佔位;PopoverHeader 覆寫 `--chrome-slot-h:1.25rem` → 佔位 20(輕量 chrome,見 `popover.tsx` PopoverHeader docblock),非 Dialog 的 24。`hideClose` prop 可讓 composition 元件(如 Coachmark)選擇隱藏。詳 `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」。

**Header / Footer 高度 canonical**:padding-based(繼承 SurfaceHeader / SurfaceFooter),高度 = max(child layout) + 2×tight。header:slot 佔位 20(`--chrome-slot-h` override)→ max(21 title, 20 slot) + 2×12 = **45**,自然比 Dialog / Sheet 48 輕一級(`popover.tsx` PopoverHeader docblock + overlay-surface.tsx 對照);footer:無 override,unbounded 佔位 24 → 48(若只有 unbounded)或自然長(若有 bounded)。詳 `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」。

---

## Title typography canonical(non-modal 特化,2026-04-22 v4)

**PopoverTitle 用 `text-body font-medium`(14px),不是 Dialog / Sheet 的 `text-body-lg`(16px)**。這是針對 **non-modal 輕量浮層** 的視覺考量,跟 density 鎖 md 同源的輕量 rationale。

**重量分級(world-class 共通 pattern)**:

| Overlay 類型 | Title typography | Rationale |
|------------|------------------|-----------|
| **Modal**(Dialog / Sheet)| `text-body-lg`(16px)| 重量級決策 surface,title 是決策 anchor,需視覺重量 |
| **Non-modal**(Popover / Coachmark / Tooltip / HoverCard)| `text-body`(14px)| 輕量浮層,可忽略、非阻斷,title 是輔助標籤不搶視覺重心 |

**世界級對照**(7 家 DS 同 split):
| DS | Modal title | Non-modal popover title |
|----|-------------|------------------------|
| Material M3 | Headline(24px large / 16px body 分 variant)| Smaller(usually 14-16px) |
| Polaris | Modal title 大號 | Popover 較小 |
| Atlassian | Modal 大 | InlineDialog 小 |
| Notion | Modal 16px+ | Popover 14px |
| Linear | Modal 16px | Popover / HoverCard 14px |
| Figma | Modal 16px | Inline panel / popover 13-14px |
| GitHub Primer | Dialog 16px | Overlay 14px |

**共通原則**:non-modal overlay 的 title 比 modal 小一級。我方採 16 → 14 分級,在 world-class 範圍內。

**Coachmark 的 PopoverTitle 消費**:Coachmark 的 header 小標籤(如 "新功能介紹" / "Tip 1 of 3")繼承 PopoverTitle 14px。Coachmark **body 內容的主 title**(長敘述型 "建立你的第一個 Workspace")另走 `text-body-lg`(見 `coachmark.tsx` CoachmarkBody 主 title `<h3>`)— 那是 body content 不是 chrome title,分離 concerns。

**禁止**:consumer 自己在 PopoverContent 裡手刻 `<h2 className="text-body-lg">` 當 title(繞 PopoverTitle 的 canonical)。若需要大 title,視為該用 Dialog 而非 Popover(選對元件)。

---

## 何時用

- **點擊觸發的輕量浮層**：filter panel、date picker 展開、設定 mini panel
- **需要放互動元素的浮層**：按鈕、輸入框、checkbox 群組
- **非 modal 的補充 UI**：使用者可以忽略並繼續主流程，不阻斷背景互動

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| hover 觸發（非點擊）| `HoverCard` | HoverCard 觸發是 hover，Popover 是點擊 |
| 純文字提示 | `Tooltip` | Tooltip 更輕量，適合純文字 |
| 需要阻斷背景的流程 | `Dialog` | Dialog 是 modal，Popover 非 modal |
| 操作選單（複製 / 刪除）| `DropdownMenu` | DropdownMenu 有 menu 語意 + 鍵盤導覽 |
| 選值下拉 | `Select` / `Combobox` | 下拉選單用專用元件，不自組 Popover + list |

---

## 與 Dialog 的分界

- **Popover**：non-modal 輕量浮層（filter / settings panel / mini 操作面板）——背景仍可互動
- **Dialog**：modal 阻斷互動（confirmation / form wizard / 需要完成才能繼續的流程）

**判斷法**：問「使用者可以 ignore 這個浮層、繼續使用主介面嗎？」可以 → Popover；不可以、必須處理才能繼續 → Dialog。

## 與 DropdownMenu 的分界

- **DropdownMenu**：有預設 item 結構（MenuItem list），語意是「從清單中選一個動作」— click 單一 item 即觸發 action,無 save CTA
- **Popover**：內容自由（任意 React 元素），可放按鈕、輸入框、圖表、form;支援「暫存選中狀態 + 明確 save CTA」

選單類(click 單項即動作,無 save)用 DropdownMenu;自由組合 UI 面板(多欄表單、filter 控制群、「選完按套用」的多選工作流)用 Popover。

### 合法但少見:Popover 內含可選 item 列 + footer save CTA

Popover 可以在 body 放 checkbox / radio 列表 / 可選 chip / 可選 menu-item-like elements,**但必在 footer 有 CTA 按鈕(套用 / 儲存 / 完成)觸發狀態提交**。這個 pattern 跟 DropdownMenu 的差別是:**DropdownMenu 一 click 即觸發動作,Popover 這類是「暫存選擇 → 按 CTA 才 commit」**。典型情境:

- **多選 filter panel**:checkbox 列表 + 底部 `清除 / 套用`(見 `FilterPanel` story)
- **Bulk edit**:選多個 menu-item-like options + 底部 `儲存變更`
- **Custom toolbar 設定**:可選 toggle 列 + 底部 `套用偏好`

canonical 判斷:「使用者 click 單項是否立即改變系統狀態?」是 → DropdownMenu;否(要按 footer CTA 才 commit)→ Popover。

---

## 禁止事項

- ❌ **不把 Popover 當 Tooltip**：Tooltip 是 hover 觸發的純文字輔助，Popover 是 click 觸發的互動面板，語意與觸發模型不同
- ❌ **不用 Popover 做 confirmation dialog**：確認框必須阻斷背景互動,使用者不能忽略——那是 Dialog 的職責
- ❌ **不在 Popover 內放 nested Popover**：嵌套層級混亂、焦點管理崩壞，複雜互動改用 Dialog 或拆成多步驟

---

## 邊界案例

- **極長內容**:PopoverContent 設 `max-h-[var(--radix-popover-content-available-height)]`(popover.tsx:65),body 包 `<PopoverBody>`(SurfaceBody `flex-1 min-h-0 overflow-y-auto`)→ viewport 太小時 header / footer 留在視窗內、body 內捲。中間 wrapper 必 forward flex chain,詳 `../../patterns/overlay-surface/overlay-surface.spec.md`「Viewport-aware scroll chain invariant」。
- **Viewport 邊緣**:`collisionPadding = 8` 自動推開(見「Viewport 邊距 canonical」)。
- **嵌套 Popover**:禁止(見「禁止事項」)。
- **Dark mode**:殼走 semantic token 自動 adapt(見 `color.spec.md`)。
- **Density**:永遠鎖 `md`(見「定位」段),不隨頁面 density 放大。

---

## A11y 預設

焦點 / 鍵盤 / ARIA 行為分兩層——**DS 覆寫**(改 Radix 預設)與 **Radix 內建**(沿用)：

- **開啟焦點(DS 覆寫)**：DS 以 `onOpenAutoFocus` 覆寫 Radix 預設 autofocus(見 `popover.tsx` `handlePopoverOpenAutoFocus`),開啟時把焦點落在 body 第一個可互動元素。Radix 預設會先 focus 右上 close X,DS 覆寫以避免觸發 tooltip leak(對齊 Material / Polaris「open 時 focus 落首個有意義控制」)。**注意**:若移除此 default handler,行為會回退成 Radix 預設 focus close X
- **關閉返回(Radix 內建)**：關閉時 focus return to trigger
- **Esc 關閉(Radix 內建)**：按 Esc 自動關閉並返回焦點
- **Focus trap(Radix 內建,僅 modal)**：`modal={true}` 時焦點鎖在 content 內
- **點外 / 焦點離開即關(Radix 內建,non-modal)**：預設 non-modal **不鎖焦點**(無 focus trap),焦點或指標離開 content 樹時由 DismissableLayer 觸發 dismiss 自動關閉——這是 dismiss-on-focus-out 機制,**不是** focus trap
- **ARIA(Radix 內建)**：trigger 自動 `aria-expanded` / `aria-controls`，content `role="dialog"`

Consumer 無需額外處理 a11y,保留 Radix `data-state` 屬性即可(開啟焦點的 DS 覆寫 default 已 wire 在 `PopoverContent`,consumer 可傳自己的 `onOpenAutoFocus` override)。

---

## 為何無 Inspector

Popover 是**浮層容器 primitive**——關鍵決策是 `side` × `align` × `sideOffset`,以及內部 Header / Body / Footer 結構。`PlacementMatrix` 是完整的 side × align 12-cell 矩陣,比互動 Inspector(切單一 side/align)更能呈現所有定位組合。Header / Body / Footer padding 屬 `overlay-surface` SSOT,已由 `ColorMatrix` 的 token 表 + 該 pattern spec 覆蓋。

Popover 內容完全由 consumer 決定,無自己的 variant/size/disabled 等可試玩 prop——Inspector 對 container 類元件價值低。

對應 anatomy story:保留 `Overview` + 元件特有 `PlacementMatrix`(12-cell side × align 矩陣) + `ColorMatrix` + `SizeMatrix` + `StateBehavior`(open / close / animation)。

---

## 相關

- `../HoverCard/hover-card.spec.md` — hover 觸發的對應浮層
- `../Tooltip/tooltip.spec.md` — 純文字提示
- `../Dialog/dialog.spec.md` — 需要阻斷的 modal
- `../DropdownMenu/dropdown-menu.spec.md` — 有 menu 語意的操作選單
- `../SelectMenu/select-menu.spec.md` — SelectMenu 消費 Popover 作為浮層容器
- `../Coachmark/coachmark.spec.md` — Coachmark 為 Popover 的 composition pattern(無 header / 有 media / footer justify-between),共用所有 overlay-surface SSOT
- Radix Popover primitive — `@radix-ui/react-popover`
- `../../patterns/overlay-surface/overlay-surface.spec.md` — Header / Body / Footer padding SSOT（Dialog + Popover 共用）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`
- `dialog.spec.md`
- `dropdown-menu.spec.md`
- `hover-card.spec.md`
- `overlay-surface.spec.md`
- `select-menu.spec.md`
- `tooltip.spec.md`
