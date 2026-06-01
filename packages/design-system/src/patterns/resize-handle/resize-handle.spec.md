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

**Drag-to-resize 視覺 + a11y 共同 primitive**——統一 column resize / sidebar drag-resize / row resize / panel resize 的命中區、cursor、視覺 line、a11y attributes。

**消費者(計畫)**:
- DataTable column resize(目前自畫 — Phase 2 migrate)
- Sidebar drag-resize(目前無 — Phase 3 enable)
- AppShell Aside drag-resize(目前無 — Phase 4 enable)

**不耦合 drag math** — consumer 自管 width state(TanStack `header.getResizeHandler()` / 手刻 pointer math / `useResizeObserver` 各種路徑)。本 primitive only ship 視覺 + cursor + a11y。

**Layout Family**:N/A(self-contained primitive,非 row-layout family member)。

## 為什麼需要 SSOT

`DataTable column resize`(已 ship 2026-05-06)+ 未來 sidebar / aside drag-resize 若各自手刻命中區尺寸、cursor、line 視覺,跨元件視覺漂移 = 用戶感受不一致。對齊 mindset #2「優先消費既有」+ M17「同概念出現 3 處 = 必抽 primitive」+ user 2026-05-21 directive「style 難道不用跟 data table column resize 維持 ssot」。

## API

```tsx
<ResizeHandle
  direction="horizontal" | "vertical"
  position="end"           // | "start"
  isResizing?: boolean     // consumer 自管 drag state
  disabled?: boolean       // consumer 自決 resizable opt-in
  aria-label="拖曳調整欄寬" // 必傳
  showLine?: boolean       // default true,false = consumer paint own line
  lineInsetStart?: string  // line start inset(eg. var(--table-cell-py))
  lineInsetEnd?: string    // line end inset
  // …其餘 DOM 事件(onPointerDownCapture / onPointerDown / onTouchStart 等)非自有 typed prop
/>
```

上方為自有(own)props。drag handler(`onPointerDownCapture` / `onPointerDown` / `onTouchStart` 等)**非本元件 bespoke typed prop**,而是經 `ResizeHandleProps extends React.HTMLAttributes<HTMLSpanElement>` 的 `...restProps` spread 透傳到底層 `<span>`(與 `onClick` / `onPointerMove` 等 generic DOM 事件同 status)。consumer 接 drag math 即透過這些透傳事件,本 primitive 不耦合。

**direction**:
- `horizontal`(拖左右)→ `cursor: col-resize` + `aria-orientation="vertical"`(separator 軸垂直於 drag)
- `vertical`(拖上下)→ `cursor: row-resize` + `aria-orientation="horizontal"`

**position**:`end` 命中區在右(horizontal)/ 底(vertical)— column right edge / sidebar right edge 典型;`start` 左 / 上 — 罕用。

## 視覺 canonical(對齊 DataTable v11)

- **命中區**:7px 寬(horizontal)/ 高(vertical),`-3px` outward offset 跨 boundary 抓得到
- **Visual line**:1px,positioned `right-[3px]` / `bottom-[3px]`,default full-extent
  - **idle**:`bg-divider`
  - **disabled**:`bg-divider`(無 hover affordance)
  - **hover**:`bg-[var(--border-hover)]`(via `group/resize` selector)
  - **dragging**:`bg-primary`(consumer 傳 `isResizing=true`)
- **Cursor**:`col-resize` / `row-resize`(`disabled` 時無)
- **`select-none`**:防 drag 時 text select(`disabled` 時關閉)

## a11y

- **`role="separator"`** + **`aria-orientation`** + **`aria-label`**:目前 Phase 1 暴露 `role="separator"` marker + 描述性 label 供輔助技術(AT)發現此元件。完整 WAI-ARIA *window-splitter widget* 語意(focusable / `aria-valuenow`/`min`/`max` / `aria-controls` / Arrow key 操作)deferred 至鍵盤 Phase(見下行)。本元件目前不可 focus、無 value 屬性、無鍵盤 handler,屬靜態 separator marker 形狀,尚非可操作的 separator widget。
- 鍵盤導覽 future Phase: Arrow keys 微調 + Enter 顯式 commit(consumer Phase 2+ 補)
- `disabled` 時不掛 role / orientation / label(語意正確 — disabled separator 不該為 a11y tree 入口)

## 何時用 / 何時不用

✅ **用**:水平 column / vertical row / sidebar / panel 拖拉調整尺寸

❌ **不用**:
- Modal / Dialog 大小(那是 `<Sheet>` 自帶 handle,不該重發明)
- Image crop 邊界(專用 `<ImageCropTool>` 領域)
- Splitter pane (`resizable-panes` style)— 雙端 drag with linked state(future 評估抽 `<SplitPane>` 上層 primitive 消費本 handle)

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
| **Material X-DataGrid** | column-separator(resize 命中區)~8px | 1px hairline(`MuiDataGrid-iconSeparator` 是純裝飾分隔 icon,非命中區也非 a11y 來源)| col-resize | aria-label "Resize column" |
| **Notion(column / sidebar)** | ~6-8px | 1px line | col-resize | (DOM-only,無 role)|
| **VS Code** | 8px(activity bar)| bg highlight on drag | col-resize | aria-label "Resize" |
| **Figma** | 8px | 1px line | col-resize | role separator |

共識:7-8px hit zone / 1px line / cursor 對應 direction / role="separator" + aria-label。本 primitive 7px hit zone + 全對齊。

## 禁止事項

- ❌ 自畫 resize handle 視覺(`<div className="cursor-col-resize">`)— 必消費本 primitive
- ❌ 直接給 ResizeHandle 加 drag state hook(eg. `useColumnResize`)— drag math 是 consumer concern,不污染 primitive
- ❌ Phase 2/3/4 不走 RFC + user approval 自動 migrate — Audit-vs-execute 分權違反
- ❌ 重新發明 a11y attributes — `role="separator"` + `aria-orientation` + `aria-label` SSOT 不可漂移
