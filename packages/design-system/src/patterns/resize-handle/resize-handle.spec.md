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

**Drag-to-resize 完整 window-splitter widget**——統一 column resize / panel resize(未來 sidebar / row)的命中區、cursor、視覺 line、pointer 拖拉、鍵盤(←/→ 或 ↑/↓、Home/End)與 ARIA `separator` 契約(2026-09-02 v2;user directive「若雙方使用全然一致,務必變成同一個元件確保 SSOT」)。

**消費者**:
- DataTable column resize(✅ 2026-09-02 migrate,原自畫 span 刪除)
- AgentPanel 面板寬(✅ 2026-09-02;左緣 `position="start"`,360–640)
- Sidebar drag-resize(Phase 3 enable)
- AppShell Aside drag-resize(Phase 4 enable)

**value-driven** — consumer 只持有尺寸 state,把 `value / min / max` 交給元件;拖拉與鍵盤算法、clamp、ARIA 由元件擁有,consumer 只接 `onValueChange`(拖拉中 live + 鍵盤每步)/ `onValueCommit`(放開;鍵盤每步亦 commit)。

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
  ariaLabel="調整欄寬"       // 必填(APG separator 必有 aria-label / aria-labelledby)
  ariaControls?: string     // 指向被調整的 pane
  disabled?: boolean        // 只畫線;無 role / tabIndex / cursor / 拖拉
  showLine?: boolean        // default true,false = consumer 已自己畫線
  lineInsetStart?: string   // line 起點 inset(eg. var(--table-cell-py))
  lineInsetEnd?: string
  onValueChange={(next) => …}   // 拖拉中每次移動 + 鍵盤每步(live)
  onValueCommit={(final) => …}  // pointerup / pointercancel 一次;鍵盤每步亦算 commit
/>
```

`role / tabIndex / aria-value* / onKeyDown` 由元件擁有,consumer 不可覆寫。方向語意「箭頭往哪、邊緣就往哪」:`end` 把手往右/下拖或按 →/↓ = 變大;`start` 把手往左/上拖或按 ←/↑ = 變大(AgentPanel 左緣把手:← 變寬)。pointer:`onPointerDownCapture` + `stopPropagation`(不讓 dnd-kit 欄位拖曳搶事件)+ `preventDefault` + pointer capture;`touch-action: none`。

**direction**:
- `horizontal`(拖左右)→ `cursor: col-resize`
- `vertical`(拖上下)→ `cursor: row-resize`

**position**:`end` 命中區在右(horizontal)/ 底(vertical)— column right edge / sidebar right edge 典型;`start` 左 / 上 — 罕用。

## 視覺 canonical(對齊 DataTable v11)

取值依據:7px 命中區 / 1px line 非自創——來自下方「世界級對照細節」5 家共識(hit zone 7-8px fingertip-friendly / 1px line non-intrusive)+ DataTable v11 已 ship 的既有 canonical(本 primitive 抽取自它,M17)。

- **命中區**:7px 寬(horizontal)/ 高(vertical),`-3px` outward offset 跨 boundary 抓得到
- **Indicator**:消費既有 DataTable resize indicator contract，預設覆蓋完整可調整邊；確切 thickness / offset 與 source utility 由 `resize-handle.tsx` 擁有
  - **idle**:`bg-divider`
  - **disabled**:`bg-divider`(無 hover affordance)
  - **hover**:`bg-[var(--border-hover)]`(via `group/resize` selector)
  - **dragging**:`bg-primary`(consumer 傳 `isResizing=true`)
- **Cursor**:`col-resize` / `row-resize`(`disabled` 時無)
- **`select-none`**:防 drag 時 text select(`disabled` 時關閉)

## a11y

- `role="separator"` + `aria-orientation`(horizontal 拖拉 → `vertical` 分隔線)+ `aria-valuenow / aria-valuemin / aria-valuetext="Npx"`(+ 有上限才 `aria-valuemax`;無上限時 valuetext 避免被讀成百分比)+ `aria-label` 必填;`tabIndex=0`;focus-visible = `outline-2 outline-offset-[-2px] outline-ring`(DataTable 既有字串)。
- 鍵盤:←/→(horizontal)或 ↑/↓(vertical)每步 `step`、Home = min、End = max(有上限才);命中的鍵 preventDefault + stopPropagation(不冒泡到排序 / 欄位拖曳)。
- `disabled` = 只畫線:無 role / tabIndex / cursor,`aria-hidden`。
- 對照 [APG Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/):Left/Right Arrow 移動垂直 splitter、Home/End 到極限。

## 何時用 / 何時不用

✅ **用**:水平 column / vertical row / sidebar / panel 拖拉調整尺寸

❌ **不用**:
- Modal / Dialog 大小(那是 `<Sheet>` 自帶 handle,不該重發明)
- Image crop 邊界(專用 `<ImageCropTool>` 領域)
- Splitter pane (`resizable-panes` style)— 雙端 drag with linked state(future 評估抽 `<SplitPane>` 上層 primitive 消費本 handle)

## 邊界案例

- **Disabled**:仍渲染 1px line(`bg-divider`,無 hover affordance),但無 cursor、無 `select-none`;所有狀態皆固定從 accessibility tree 隱藏。
- **拖到 min / max 卡住**:primitive 不持 width state(不耦合 drag math),邊界 clamp 與卡住回饋由 consumer 的 resize handler 管;`isResizing` 期間 line 維持 `bg-primary` 不另示警。
- **同列多 handle 並存**(多欄 column resize):各 handle 為獨立 `<span>`,無互相協調;`-3px` outward offset 使相鄰欄命中區可能相接,先命中者(DOM 順序 / pointer target)收事件,衝突仲裁屬 consumer drag math。
- **RTL**:全域明定 LTR-only；本元件使用 physical `left/right` 定位，不提供 RTL 鏡像。

## Roadmap(用 user 既有的 v2 framing)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Ship primitive `<ResizeHandle>` + spec.md | ✅ 2026-05-21 |
| Phase 2 | DataTable column resize migrate consume primitive(TanStack `header.getResizeHandler()` 接) | Pending |
| Phase 3 | Sidebar drag-resize enable(consume primitive + localStorage 持久化) | Pending |
| Phase 4 | AppShell Aside drag-resize enable(consume primitive) | Pending |

Phase 2-4 需獨立 RFC + 各別 user approval,本 spec 只 ship Phase 1 + 鎖住視覺 canonical。

## 世界級對照細節

| DS / Library | 命中區 | Line | Cursor | a11y |
|---|---|---|---|---|
| **AG Grid** | 7-8px | 1px primary on drag | col-resize | role="separator" |
| **Material X-DataGrid** | column-separator(resize 命中區)~8px | 1px hairline(`MuiDataGrid-iconSeparator` 是純裝飾分隔 icon,非命中區也非 a11y 來源)| col-resize | aria-label "Resize column" | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| **Notion(column / sidebar)** | ~6-8px | 1px line | col-resize | (DOM-only,無 role)|
| **VS Code** | 8px(activity bar)| bg highlight on drag | col-resize | aria-label "Resize" |
| **Figma** | 8px | 1px line | col-resize | role separator |

視覺共識是 7-8px hit zone / 1px line / cursor 對應 direction；各產品 a11y contract 不一致。本 primitive 只收斂視覺，不把未實作的 splitter behavior 偽裝成 separator。

## 禁止事項

- ❌ 自畫 resize handle 視覺(`<div className="cursor-col-resize">`)— 必消費本 primitive
- ❌ 直接給 ResizeHandle 加 drag state hook(eg. `useColumnResize`)— drag math 是 consumer concern,不污染 primitive
- ❌ Phase 2/3/4 不走 RFC + user approval 自動 migrate — Audit-vs-execute 分權違反
- ❌ 在本 pointer-only primitive 加 `role="separator"` / `aria-*value*`——完整 splitter 語意必須連同 keyboard/value/controls 一次實作
