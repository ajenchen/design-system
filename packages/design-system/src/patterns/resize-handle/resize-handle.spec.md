---
component: ResizeHandle
family: null  # primitive pattern, not row-layout family
traits:
  - isStructural
benchmark:
  - AG Grid column resize handle: github.com/ag-grid/ag-grid/tree/latest/community-modules/core/src/headerRendering
  - Material X-DataGrid MuiDataGrid-iconSeparator: github.com/mui/mui-x/tree/master/packages/grid/x-data-grid
  - Notion column / sidebar resize: notion.so app inspect
  - VS Code activity bar / sidebar resize: github.com/microsoft/vscode/tree/main/src/vs/workbench/browser/parts
  - Figma left panel resize: figma.com app inspect
---

# ResizeHandle 設計原則

## 定位

**Drag-to-resize 完整 window-splitter widget**——統一 column resize / panel resize(AppShell 四區;未來 row)的命中區、cursor、視覺 line、pointer 拖拉、鍵盤(←/→ 或 ↑/↓、Home/End)與 ARIA `separator` 契約(2026-09-02 v2;user directive「若雙方使用全然一致,務必變成同一個元件確保 SSOT」)。

**消費者**:
- DataTable column resize(✅ 2026-09-02 migrate,原自畫 span 刪除)
- AgentPanel 面板寬(✅ 2026-09-02;左緣 `position="start"`;並排與浮層都可拖,範圍由 AppShell「版面規則」給)
- AppShell Menu 右緣與 Menu 浮層(2026-10-14 user 規格 U:4、U:55;規則 `../../components/AppShell/app-shell.spec.md`「版面規則」)
- AppShell Right panel 左緣(同上)

**value-driven** — consumer 只持有尺寸 state,把 `value / min / max` 交給元件;拖拉與鍵盤算法、clamp、ARIA 由元件擁有,consumer 只接 `onValueChange`(拖拉中 live + 鍵盤每步)/ `onValueCommit`(一次調整結束:放開且按下到放開有位移、鍵盤每步;**只點一下不 commit** —— 2026-10-14 AppShell「版面規則」§7,寬度紀錄只記使用者真的調整過的寬;拖出去又回到原點放開 = 畫面回到起點、不 commit)/ `onDraggingChange`(拖拉開始 / 結束,結束一定發 —— consumer 用它收掉「拖拉中」的暫時狀態,因為沒有位移就不會有 commit)。

**Layout Family**:N/A(self-contained primitive,非 row-layout family member)。

## 為什麼需要 SSOT

`DataTable column resize`(已 ship 2026-05-06)+ 未來 sidebar / aside drag-resize 若各自手刻命中區尺寸、cursor、line 視覺,跨元件視覺漂移 = 用戶感受不一致。對齊 mindset #2「優先消費既有」+ M17「同概念出現 3 處 = 必抽 primitive」+ user 2026-05-21 directive「style 難道不用跟 data table column resize 維持 ssot」。

## API

```tsx
<ResizeHandle
  direction="horizontal" | "vertical"
  position="end"            // | "start":把手貼哪一緣,決定拖拉 delta 與方向鍵正負
  value={number}            // 目前尺寸 px(consumer 持有)
  min={number}
  max={number}              // 省略 = 無上限:不輸出 aria-valuemax、End 停用
  step={16}                 // 鍵盤每步,預設 16
  ariaLabel={`調整 ${欄名} 欄寬`}  // 必填(APG separator 必有 aria-label / aria-labelledby);同一頁有多顆時名稱必須分得出來 —— 帶入欄名 / 面板標題(WCAG 2.4.6)
  ariaControls?: string     // 指向被調整的 pane(欄寬把手 = 自己那一欄的 columnheader;面板把手 = 面板根節點)
  disabled?: boolean        // 只畫線;無 role / tabIndex / cursor / 拖拉
  showLine?: boolean        // default true,false = consumer 已自己畫 idle 線;hover / 拖拉的狀態色仍由本元件畫
  lineInsetStart?: string   // line 起點 inset(eg. var(--table-cell-py))
  lineInsetEnd?: string
  onValueChange={(next) => …}   // 拖拉中每次移動 + 鍵盤每步(live)
  onValueCommit={(final) => …}  // pointerup / pointercancel 一次;鍵盤每步亦算 commit
  onDraggingChange?={(dragging) => …}  // 拖拉開始 / 結束(結束一定發)
  isolatePointerDown?: boolean  // default false;true = 按下的那一下不冒泡給祖先(只給祖先另有 pointerdown 手勢的 consumer)
/>
```

`role / tabIndex / aria-value* / onKeyDown` 由元件擁有,consumer 不可覆寫。方向語意「箭頭往哪、邊緣就往哪」:`end` 把手往右/下拖或按 →/↓ = 變大;`start` 把手往左/上拖或按 ←/↑ = 變大(AgentPanel 左緣把手:← 變寬)。pointer:`onPointerDownCapture` + `preventDefault` + pointer capture;`touch-action: none`。**`stopPropagation` 只在 `isolatePointerDown` 時做**:祖先另有 pointerdown 手勢、會把這一下搶走的 consumer 才打開 —— DataTable 欄寬(表頭格掛 dnd-kit 欄位拖曳,不擋的話拉欄寬變成拖欄位)。預設不擋(2026-10-14 審查抓到):擋下的 pointerdown 也到不了 document,住在 Radix 浮層裡的把手(AppShell 的 Menu 浮層)按過之後,DismissableLayer 判斷「按在層裡」的旗標不會歸零,下一次點浮層外被當成點在裡面、浮層收不起來(`node_modules/@radix-ui/react-dismissable-layer` `usePointerDownOutside`:旗標由 React 捕獲階段設、由 document 上的 pointerdown 歸零)。機械閘 `scripts/app-shell-layout-invariant.mjs` S14(拖過 / 只按過浮層把手後點外面必收)。

**direction**:
- `horizontal`(拖左右)→ `cursor: col-resize`
- `vertical`(拖上下)→ `cursor: row-resize`

**position**:`end` 命中區在右(horizontal)/ 底(vertical)— column right edge / sidebar right edge 典型;`start` 左 / 上 — AgentPanel、AppShell Right panel 的左緣。

## 視覺 canonical(對齊 DataTable v11)

取值依據:7px 命中區 / 1px line 非自創——來自下方「世界級對照細節」5 家共識(hit zone 7-8px fingertip-friendly / 1px line non-intrusive)+ DataTable v11 已 ship 的既有 canonical(本 primitive 抽取自它,M17)。

- **命中區**:7px 寬(horizontal)/ 高(vertical),`-3px` outward offset 跨 boundary 抓得到。**外側 3px 必須真的抓得到**(2026-09-10):primitive 給命中區 `z-index: 1`,否則 DOM 順序在後的 positioned 鄰居會蓋住它;消費端的容器不得用 `overflow: hidden` 裁到它(要抑制 flex `min-width: auto` 時改 `min-w-0`)。面板 / 捲動容器的邊界把它裁掉是預期例外(AG Grid 同)。世界級:AG Grid `.ag-header-cell-resize{position:absolute;z-index:2;width:8px;right:-3px}`(https://unpkg.com/ag-grid-community/styles/ag-grid.css)、MUI X `columnSeparator` `position:'absolute', zIndex:30, right:-5`、目標寬 10(https://github.com/mui/mui-x/blob/master/packages/x-data-grid/src/components/containers/GridRootStyles.ts)、VS Code `.monaco-sash{position:absolute;z-index:35}`(https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/sash/sash.css)。閘:`scripts/data-table-pinned-resize-invariant.mjs` R3(欄界兩側各 2px 都要命中把手;`--selftest` 注入 overflow:hidden / z-index:auto 必紅);AgentPanel 左緣把手同款,`scripts/app-shell-layout-invariant.mjs` S11「把手外側命中」(2026-10-14 前在已 retired 的 `agent-panel-breakpoint.mjs`「OE1」;面板根節點 2026-09-29 由 `overflow-hidden` 改 `overflow-y-clip` + `min-w-0`,外側 2px 必命中;對照組注入 overflow:hidden 必紅)。
- **Indicator**:消費既有 DataTable resize indicator contract，預設覆蓋完整可調整邊；確切 thickness / offset 與 source utility 由 `resize-handle.tsx` 擁有
  - **idle**:`bg-divider`
  - **disabled**:`bg-divider`(無 hover affordance)
  - **hover**:`bg-[var(--border-hover)]`(via `group/resize` selector)。**為什麼靜止 `--divider`(neutral-4)滑過跳到 `--border-hover`(neutral-6)而不是下一階**(2026-09-27 補寫;待辦總帳 A8,2026-09-25 R17 篩為「保留、規格補理由」,**AI 推導、未逐題經 user 拍板**):把手線是 `ds-canonical/references/hit-area-canonical.md`「唯一例外」那種**先天只有 1px 寬的線**,滑過只走一階(neutral-4 → 5)在 1px 上幾乎看不出來,回饋等於沒有;世界級同樣直接跳到強調色 —— MUI X 欄分隔線滑過與拖拉中都直接換成 `vars.colors.foreground.accent`(一手:[`GridRootStyles.ts`](https://github.com/mui/mui-x/blob/master/packages/x-data-grid/src/components/containers/GridRootStyles.ts) `columnSeparator` 的 `'&:hover': { color: vars.colors.foreground.accent }` 與 `columnSeparator--resizing` 同值,2026-09-27 讀 master;待辦總帳記的 `:482-485` 是較早版本的行號)、AG Grid 拖拉中 1px 主色(下方「世界級對照細節」表)。本 DS 的折衷:滑過跳到 `--border-hover`(消費 Field 邊框滑過那一階,不自創值)、拖拉中才用主色。`scripts/hover-own-pair-baseline.json` 兩筆 resize-handle 命中因此登記為 `documented`(理由住這一條),`scripts/data-table-pinned-resize-invariant.mjs` R4 量的懸停值 = `--border-hover` 維持不變。
  - **dragging**:`bg-primary`(拖拉中由元件自己判定 —— pointerdown 到 pointerup / cancel;沒有 `isResizing` prop,舊寫法已更正 2026-09-10)
  - **idle 線的歸屬**(2026-09-10,user 抓「釘選欄位 resize 時分隔線沒有變藍」):`showLine=false` 只把 **idle** 線交給消費端(DataTable 面板邊界欄由凍結邊界線 `dtPanelBoundaryRight::after` 畫、表格外框欄由外框畫),**hover 與拖拉的狀態色仍由本元件畫**,畫在同一個像素上 —— 左釘選面板的邊界線在面板最後一個像素、與把手線同位,狀態色剛好蓋在它上面;右釘選面板的邊界線與外框在鄰面板 / 外框那一像素,把手線只能畫在自己面板內側相鄰的一像素(面板 `overflow` 裁切,越界不可見),拖拉中看起來是「主色線緊貼灰線」。舊行為:`showLine=false` 連狀態色一起不畫,面板邊界欄拖拉中沒有任何回饋 = 違反本表。閘:`scripts/data-table-pinned-resize-invariant.mjs` R4(釘選邊界欄拖拉中把手線 = primary、放開後回透明)。
- **Cursor**:`col-resize` / `row-resize`(`disabled` 時無)
- **`select-none`**:防 drag 時 text select(`disabled` 時關閉)

## a11y

- `role="separator"` + `aria-orientation`(horizontal 拖拉 → `vertical` 分隔線)+ `aria-valuenow / aria-valuemin / aria-valuetext="Npx"`(+ 有上限才 `aria-valuemax`;無上限時 valuetext 避免被讀成百分比)+ `aria-label` 必填;`tabIndex=0`;焦點框 = `focus-visible:focus-ring-inset`(內描邊,往內 2px;`resize-handle.tsx:243`)。
- 鍵盤:←/→(horizontal)或 ↑/↓(vertical)每步 `step`、Home = min、End = max(有上限才);命中的鍵 preventDefault + stopPropagation(不冒泡到排序 / 欄位拖曳)。
- `disabled` = 只畫線:無 role / tabIndex / cursor,`aria-hidden`。
- 對照 [APG Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/):Left/Right Arrow 移動垂直 splitter、Home/End 到極限。

## 何時用 / 何時不用

✅ **用**:水平 column / vertical row / sidebar / panel 拖拉調整尺寸

❌ **不用**:
- Modal / Dialog / Sheet 大小(固定或相對視窗的尺寸檔位,沒有拖拉調整;`sheet.tsx` 沒有任何把手實作,2026-09-10 核實,舊句「Sheet 自帶 handle」已撤回)。**例外**:AppShell 的 Menu 浮層與 AI agent 浮層要用(user 2026-10-14 U:55「浮層也可以拖曳調寬」);Dialog 與一般消費者的 Sheet 照舊不用
- Image crop 邊界(專用 `<ImageCropTool>` 領域)
- Splitter pane (`resizable-panes` style)— 雙端 drag with linked state(future 評估抽 `<SplitPane>` 上層 primitive 消費本 handle)

## 邊界案例

- **Disabled**:仍渲染 1px line(`bg-divider`,無 hover affordance),但無 cursor、無 `select-none`;所有狀態皆固定從 accessibility tree 隱藏。
- **拖到 min / max 卡住**:primitive 不持 width state(不耦合 drag math),邊界 clamp 與卡住回饋由 consumer 的 resize handler 管;拖拉期間 line 維持 `bg-primary` 不另示警。
- **同列多 handle 並存**(多欄 column resize):各 handle 為獨立 `<span>`,無互相協調;`-3px` outward offset 使相鄰欄命中區可能相接,先命中者(DOM 順序 / pointer target)收事件,衝突仲裁屬 consumer drag math。鄰格本身不得蓋住把手的外側(`z-index: 1`,見命中區)。
- **RTL**:全域明定 LTR-only；本元件使用 physical `left/right` 定位，不提供 RTL 鏡像。
- **已知缺口:Enter 收合 / 還原**:[APG Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) 的 Enter「If the primary pane is not collapsed, collapses the pane. If the pane is collapsed, restores the splitter to its previous position.」本元件沒有;2026-10-14 AI 建議延後、user 以「其他app shell 我沒意見的部分…就照你建議做」核准(D:29),記待辦總帳 Q5。

## Roadmap(用 user 既有的 v2 framing)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Ship primitive `<ResizeHandle>` + spec.md | ✅ 2026-05-21 |
| Phase 2 | DataTable column resize 消費本 primitive(value-driven,`data-table.tsx` 欄寬把手 = 同一顆元件,不再經 TanStack `getResizeHandler`) | ✅ 2026-09-02 |
| Phase 3 | AppShell Menu(Sidebar)拖寬,含 Menu 浮層(consume primitive) | 已拍板(2026-10-14),隨 AppShell「版面規則」落地 |
| Phase 4 | AppShell Right panel 拖寬 + AI agent 浮層可拖(consume primitive) | 已拍板(2026-10-14),同上 |

Phase 3-4 原訂「需獨立 RFC + user 拍板」(2026-05-21 AI 提的施工順序,user 以「都照你建議做」整包採納,commit `197401cc`;同日 user 原話「讓drag resize有一個最小寬度」,commit `e58576a6`)。**拍板 = user 2026-10-14 規格 U:4「除 Main 外，皆為可開關、可拖曳調寬的面板」**;原句的「+ localStorage 持久化」不沿用 —— 寬度跨重新整理由產品自存、DS 不存(「版面規則」§7)。Phase 1-2 已 ship,本 spec 鎖住視覺 canonical 與 splitter 語意。

## 世界級對照細節

| DS / Library | 命中區 | Line | Cursor | a11y |
|---|---|---|---|---|
| **AG Grid** | 7-8px | 1px primary on drag | col-resize | role="separator" |
| **Material X-DataGrid** | column-separator(resize 命中區)~8px | 1px hairline(`MuiDataGrid-iconSeparator` 是純裝飾分隔 icon,非命中區也非 a11y 來源)| col-resize | aria-label "Resize column" | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| **Notion(column / sidebar)** | ~6-8px | 1px line | col-resize | (DOM-only,無 role)|
| **VS Code** | 8px(activity bar)| bg highlight on drag | col-resize | aria-label "Resize" |
| **Figma** | 8px | 1px line | col-resize | role separator |

視覺共識是 7-8px hit zone / 1px line / cursor 對應 direction;各產品 a11y contract 不一致,本 primitive 採 APG Window Splitter 完整語意(`role="separator"` + `aria-value*` + 方向鍵 / Home / End,見「a11y」;2026-09-10 更正:v1 時期「只收斂視覺、不偽裝 separator」的句子已與實作不符)。

## 禁止事項

- ❌ 自畫 resize handle 視覺(`<div className="cursor-col-resize">`)— 必消費本 primitive
- ❌ 在 consumer 另寫拖拉算法(eg. `useColumnResize`)— 拖拉 / 鍵盤 / clamp 由本 primitive 擁有(value-driven),consumer 只接 `onValueChange` / `onValueCommit`
- ❌ 把「只點一下沒有拖」當成一次調整去 commit(會把系統暫時夾窄的寬寫進使用者的寬度紀錄;AppShell「版面規則」§7)
- ❌ 祖先沒有會搶 pointerdown 的手勢卻打開 `isolatePointerDown`(按在 Radix 浮層裡的把手會讓浮層之後點外面收不起來;見 API 段)
- ❌ 消費端自己再補 `role="separator"` / `aria-*value*`——本 primitive 已完整實作 splitter 語意,重複宣告會讓讀屏念兩次

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `data-table-known-defects.spec.md`
