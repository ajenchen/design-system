# Popover 設計原則

## 定位

Popover 是**點擊觸發的浮層容器**——提供定位、動畫、焦點管理，內容由 consumer 決定。

**實作基礎**：shadcn passthrough——基於 Radix Popover。本 DS 保留 shadcn 原結構 + 橋接 DS token（elevation / radius / border）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

**視覺對齊 Dialog**：外殼 token 與 Dialog 完全一致（`bg-surface-raised` / `border-border` / `rounded-lg` / `elevation-200`）。差別僅兩點：(1) Popover 是 non-modal 輕量浮層不阻斷背景，(2) **density 永遠鎖 `md`** — Popover 不隨頁面 density 放大（lightweight 浮層保持緊湊）。

**結構化組合（可選）**：PopoverContent 外殼無內距，consumer 可選擇：
- **單一 body**：包 `<PopoverBody>` 取得 Dialog body 同 padding (`px-loose py-tight`)
- **含標題**：組合 `<PopoverHeader>` + `<PopoverBody>`（下分隔線由 Header 提供）
- **含操作按鈕列**：再加 `<PopoverFooter>`（上分隔線由 Footer 提供）

Close 按鈕：Popover 預設 click-outside-to-close，**不強制提供 Close 按鈕**（Dialog 才需要）。如需加，consumer 在 PopoverHeader 內自行放 `<PopoverPrimitive.Close>` 包 `ItemInlineActionButton icon={X}`。

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

- **DropdownMenu**：有預設 item 結構（MenuItem list），語意是「從清單中選一個動作」
- **Popover**：內容自由（任意 React 元素），可放按鈕、輸入框、圖表、form

選單類（一排可點選的動作）用 DropdownMenu；自由組合的 UI 面板（多欄表單、filter 控制群）用 Popover。

---

## 禁止事項

- ❌ **不把 Popover 當 Tooltip**：Tooltip 是 hover 觸發的純文字輔助，Popover 是 click 觸發的互動面板，語意與觸發模型不同
- ❌ **不用 Popover 做 confirmation dialog**：確認框必須阻斷背景互動,使用者不能忽略——那是 Dialog 的職責
- ❌ **不在 Popover 內放 nested Popover**：嵌套層級混亂、焦點管理崩壞，複雜互動改用 Dialog 或拆成多步驟

---

## A11y 預設

Radix Popover 自動處理：

- **焦點管理**：開啟時移動焦點進入 content；關閉時 focus return to trigger
- **Esc 關閉**：按 Esc 自動關閉並返回焦點
- **Focus trap**：`modal={true}` 時焦點鎖在 content 內；預設 non-modal 下焦點離開 content 樹會自動關閉
- **ARIA**：trigger 自動 `aria-expanded` / `aria-controls`，content `role="dialog"`

Consumer 無需額外處理 a11y，保留 Radix `data-state` 屬性即可。

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
