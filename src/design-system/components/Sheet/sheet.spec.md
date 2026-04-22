# Sheet 設計原則

## 定位

Sheet 是**從畫面邊緣滑入的浮層面板**——上 / 下 / 左 / 右四個方向，用於側邊操作、暫時性 panel、mobile fullscreen 編輯。

**實作基礎**：shadcn passthrough——基於 Radix Dialog（`side` variant，非居中 modal）。本 DS 保留 shadcn 原結構 + 橋接 DS token。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **側邊操作面板**：filter panel、detail pane、task 編輯 side sheet
- **暫時性內容展示**：notification drawer、cart summary、activity history
- **Mobile fullscreen 編輯**：桌機用 Dialog 的場景在手機改用 Sheet bottom / fullscreen
- **跟主頁面平行的工作流程**：使用者在主頁看清單，sheet 編輯某一項，不離開清單 context

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 需要集中注意力的確認 / 破壞性動作 | `Dialog` | Dialog 是居中 modal，視覺更聚焦；Sheet 靠邊較輕 |
| 短暫的回饋訊息（成功 / 失敗）| `Toast` | Toast 自動消失，Sheet 需使用者明確關閉 |
| 持久性頁面通知 | `Alert` | Alert 是 inline，Sheet 是浮層 |
| 主導覽外殼 | `Sidebar` | Sidebar 持續存在，Sheet 是暫時浮層 |
| Hover 補充資訊 | `HoverCard` / `Tooltip` | Sheet 觸發是點擊、體積大 |
| 選值 / 選單 | `Select` / `DropdownMenu` | Sheet 太重，選單用專用元件 |

---

## Sheet vs Dialog 的分界

| | Sheet | Dialog |
|---|---|---|
| 位置 | 畫面邊緣滑入（上/下/左/右） | 畫面居中 |
| 視覺重量 | 較輕（單邊） | 較重（四周 overlay） |
| 典型用途 | 側邊工作流程、detail panel | 確認流程、複雜表單 |
| 阻斷感 | 較弱（使用者視線可繼續掃主頁） | 強（完全聚焦 modal） |
| 手機體驗 | 自然（從底部 / 全螢幕滑入符合 mobile pattern） | 桌機導向（中央 modal 在手機不舒服） |

**判準**：
- **需要聚焦決策（刪除、確認、複雜表單）→ Dialog**
- **主頁面平行的側邊工作 / mobile 編輯 → Sheet**

---

## 為何無 Inspector

Sheet 是**側邊滑入 modal 容器**,關鍵決策維度是 `side`(top / right / bottom / left)× size(響應式)× open/close——已由元件特有 `SideMatrix`(4 個方向結構對照) + `SizeMatrix` + `StateBehavior`(open/close/ESC) + `ColorMatrix` 四張矩陣覆蓋。互動 Inspector 切換 side 不如 side-by-side 4 方向對照直觀——需要視覺比較各方向滑入結構。內容完全由 consumer 決定,Sheet 本身無 variant/disabled 等可試玩 prop。

對應 anatomy story:保留 `Overview` + 元件特有 `SideMatrix`(4 方向 × 用途) + `ColorMatrix` + `SizeMatrix` + `StateBehavior`。

---

## Padding SSOT

Sheet 的 `SheetHeader` / `SheetBody` / `SheetFooter` 對應 `SurfaceHeader` / `SurfaceBody` / `SurfaceFooter` primitive——padding + 分隔線由 `patterns/overlay-surface/overlay-surface.spec.md` own,Sheet 與 Dialog / Popover 共用同一套 primitive,避免 token 漂移。Sheet 特有行為:side variant(`top` / `right` / `bottom` / `left`)決定滑入方向 + height/width 響應式策略,padding 本身對齊 overlay-surface canonical。

---

## 關閉按鈕

永遠存在於 SheetHeader 右側(對齊 DialogHeader canonical)。使用 `<Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />`,不可移除——使用者永遠需要明確的關閉手段。

**Canonical 來源**:Sheet 是 overlay chrome,corner close X 屬 action group region,必用 Button(非 Inline Action / 非自刻 button)。詳見 `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss canonical」+ `patterns/overlay-surface/overlay-surface.spec.md`「Close X canonical」。

---

## 空值 / 驗證 / a11y

Sheet 為容器,內容由 consumer 決定;focus trap + Escape close + `aria-labelledby` 由 Radix Dialog primitive 提供。

---

## 相關

- `../Dialog/dialog.spec.md` — 居中 modal 的對應元件（共用 Radix Dialog base）
- `../Sidebar/sidebar.spec.md` — 持久性導覽（非暫時浮層）
- `../Toast/toast.spec.md` — 短暫自動消失的浮動通知
- `../DropdownMenu/dropdown-menu.spec.md` — 選單類浮層
- Radix Dialog primitive — `@radix-ui/react-dialog`（Sheet 是 side variant）
