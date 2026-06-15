---
component: Sheet
family: composite
variants: {}
sizes: {}
traits:
  - isOverlay
benchmark:
  - Radix Dialog primitive (shadcn Sheet base): github.com/radix-ui/primitives/tree/main/packages/react/dialog
  - MUI Drawer: github.com/mui/material-ui/tree/master/packages/mui-material/src/Drawer
  - Ant Design Drawer: github.com/ant-design/ant-design/tree/master/components/drawer
  - Polaris Sheet: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Sheet
---

# Sheet 設計原則

## 定位

Sheet 是**從畫面邊緣滑入的浮層面板**。**消費者 API = 右側滑入**（`side="right"`，detail panel / 編輯 / filter drawer，對齊 Jira / Linear / Notion 右側 detail drawer 慣例）。`top` / `bottom` / `left` 變體**保留 DS 內部基建用**（例：Sidebar 在小視口從 left 滑入），消費者 code **禁止傳** `side="top" | "bottom" | "left"`，這些用途需 user 授權（canonical 見 `sheet.tsx` L23-27 + showcase `AR35`）。

**實作基礎**：shadcn passthrough——基於 Radix Dialog（`side` variant，非居中 modal）。本 DS 保留 shadcn 原結構 + 橋接 DS token。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **側邊操作面板**：filter panel、detail pane、task 編輯 side sheet
- **暫時性內容展示**：notification drawer、cart summary、activity history
- **Mobile 側邊編輯**：桌機 detail / 編輯 flow 在手機沿用同一個右側 Sheet（mobile 預設占 75% 寬）。內容過於複雜需全螢幕時改用 fullscreen Dialog 或導航到獨立頁面，不借 `side="bottom"`（bottom 為 DS 內部基建變體、非消費者 API；需 mobile bottom sheet 另用專屬元件）
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
| 位置 | 畫面右側滑入（消費者 API 僅 `side="right"`;top/bottom/left 為 DS 內部基建） | 畫面居中 |
| 視覺重量 | 較輕（單邊） | 較重（四周 overlay） |
| 典型用途 | 側邊工作流程、detail panel | 確認流程、複雜表單 |
| 阻斷感 | 較弱（使用者視線可繼續掃主頁） | 強（完全聚焦 modal） |
| 手機體驗 | 沿用同一右側 Sheet（mobile 預設占 75% 寬;不借 `side="bottom"`，見「何時用」） | 桌機導向（中央 modal 不符 mobile sheet pattern，浮層遮住主流向） |

**判準**：
- **需要聚焦決策（刪除、確認、複雜表單）→ Dialog**
- **主頁面平行的側邊工作 / mobile 編輯 → Sheet**

---

## Inspector

`Inspector` 提供互動 Controls 即時切換 SheetContent 三個關鍵維度:`side`(top / right / bottom / left,看四方向滑入動畫 + 位置)、`width`(default / sm / lg 寬度覆寫)、`showFooter`(是否顯示底部 CTA 列)。內容區由 consumer 決定,Inspector 聚焦容器層級的可試玩 prop。

對應 anatomy story:`Overview` + `Inspector` + 元件特有 `SideMatrix`(4 方向 × 用途) + `ColorMatrix` + `SizeMatrix` + `StateBehavior`。

---

## Padding SSOT

Sheet 的 `SheetHeader` / `SheetFooter` 消費 `SurfaceHeader` / `SurfaceFooter` primitive;`SheetBody` 用 `<ScrollArea>` wrap + 同一套 overlay-surface padding token(對齊 DialogBody canonical,SSOT 見 `patterns/overlay-surface/overlay-surface.spec.md`「Body overflow canonical」)——padding + 分隔線由 overlay-surface own,Sheet 與 Dialog / Popover 共用,避免 token 漂移。Sheet 特有行為:side variant(`top` / `right` / `bottom` / `left`)決定滑入方向 + height/width 響應式策略,padding 本身對齊 overlay-surface canonical。

---

## 關閉按鈕

> **跨家族 SSOT pointer**:SheetHeader 屬 **Padding-based overlay header 家族**;border / padding / dismiss size / withTabs 的跨家族視覺契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。本節僅 codify Sheet 特有 close X canonical。

永遠存在於 SheetHeader 右側(對齊 DialogHeader canonical)。使用 `<Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />`,不可移除——使用者永遠需要明確的關閉手段。

**Canonical 來源**:Sheet 是 overlay chrome,corner close X 屬 action group region,必用 Button(非 Inline Action / 非自刻 button)。詳見 `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」+ `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」。

---

## 空值 / 驗證 / a11y

Sheet 為容器,內容由 consumer 決定;focus trap + Escape close + `aria-labelledby` 由 Radix Dialog primitive 提供。

---

## 禁止事項

- ❌ Sheet 內塞滿全頁複雜流程 — Sheet 是 side surface 不是 page 替代;若內容超過 3-4 個 section / 多步表單,改 navigate 到獨立 route page
- ❌ Sheet 內再開 Sheet(nested side surface)— 視覺空間衝突,user 找不到 escape;改用 Dialog 或 page transition
- ❌ Sheet trigger 用 inline link(非 Button)— Sheet 是 substantive action 不是 navigation,affordance 必須是 Button(可 tertiary / icon-only)
- ❌ Sheet content 無 title — `aria-labelledby` 必須對應可見 title,SR 否則讀「unnamed dialog」
- ❌ Sheet 用作 Toast / 短暫通知 — Sheet 阻斷 chrome interaction,不適合 ephemeral 訊息;短暫 → Toast / 持久 → Alert / 阻斷 confirm → Dialog
- ❌ 跳過 Radix Dialog primitive 自建 Sheet — focus trap / Esc close / Portal escape 邏輯複雜,自建必漏

---

## 邊界案例

- **Disabled**:Sheet 本身無 disabled state(非互動 control,是 surface container);trigger Button 由 consumer 控 disabled。
- **Loading(panel content loading)**:Sheet 為純容器,不獨立 own loading state。Async body 場景由 consumer 在 body slot 渲 `<Empty icon={<CircularProgress size={48}/>}/>`(對齊 `empty.spec.md:168` loading compose SSOT)或 `<Skeleton>` line-stack 取代 content,不開 / 不關 Sheet 即可。
- **Empty(no content)**:Sheet 必含 title(`aria-labelledby` 強制要求);body 為空時 consumer 應渲 `<Empty>` placeholder,不渲空白 panel。
- **Scroll(body 內容超過視口高度)**:`SheetBody` = `<ScrollArea>`(`flex-1 min-h-0`),超高內容在 body 內部捲動,header / footer 固定不動;consumer 不需自寫 `overflow-y-auto`。
- **誤嵌套降級(nested Sheet)**:禁止事項已禁 nested;若 consumer 不慎嵌套,Radix 的 Esc 與 focus trap 只作用於**最上層** layer(DismissableLayer 只 dismiss highest layer;FocusScope stack 最新 scope active),關閉由上而下逐層。
- **RTL**:`side` 為物理方向(`right-0` 物理定位),不隨 `dir="rtl"` 自動鏡像。
- **Dark mode**:overlay-surface SSOT 自動 adapt(`overlay-surface.spec.md`);Sheet 不獨立 own dark token。
- **Density**:Sheet body density 由 consumer 控(若內含 form / DataTable / Menu 各自有 density 規則);Sheet container 自身不持 density。

---

## 相關

- `../Dialog/dialog.spec.md` — 居中 modal 的對應元件（共用 Radix Dialog base）
- `../Sidebar/sidebar.spec.md` — 持久性導覽（非暫時浮層）
- `../Toast/toast.spec.md` — 短暫自動消失的浮動通知
- `../DropdownMenu/dropdown-menu.spec.md` — 選單類浮層
- Radix Dialog primitive — `@radix-ui/react-dialog`（Sheet 是 side variant）

## A11y 預設

**ARIA / Pattern**:繼承 Radix `dialog` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/dialog#accessibility)。

**Keyboard 行為**:

- Tab — focus trap 在 sheet 內
- Esc — 關閉
- Shift+Tab — 反向 focus 循環

**Focus**:Radix primitive 自管 focus trap / restoration / visible ring(`outline: 2px solid var(--ring)` per design-system focus-visible canonical)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `app-shell.spec.md`
- `dialog.spec.md`
- `scroll-area.spec.md`
