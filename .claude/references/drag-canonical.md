# Drag & Drop Canonical(2026-05-06 v14.8 audit)

**Purpose**:統整世界級 drag-drop 實作慣例,作為 DS 內 TreeView / DataTable row drag / DataTable column reorder 的對齊基準。M26 webfetch 後產出,Phase 2(table 進階 tree-view 式 drag)的設計依據。

---

## 1. 世界級實作分類

| Library / Product | 機制 | Drop indicator | 三位置 (before/after/inside) | Snap-back on no-drop |
|---|---|---|---|---|
| **Atlassian Pragmatic** | Native HTML5 drag-and-drop API | line bleed 4px outwards on left of target,via `@atlaskit/pragmatic-drag-and-drop-react-drop-indicator` | optional via edge detection package | YES — native HTML5 行為 |
| **dnd-kit**(我們用)| Custom synthetic events(non-native) | DIY render via state | DIY computation | **依 collision detection 策略** |
| **Notion table** | proprietary | single horizontal stroke between rows(藍)| no inside drop in tables(用 chevron + sidebar reparent) | YES — 原 row 留原位 + transition state |
| **Notion blocks** | proprietary | single horizontal stroke + indent at depth | YES via cursor X axis | YES |
| **AG Grid** | custom | `setRowDropPositionIndicator` API | YES via `treeData` mode | YES |
| **Linear / Asana** | dnd-kit-based | horizontal stroke (sub-issue reparent) | YES (drop on parent issue) | YES |
| **VS Code TreeView** | native + Electron | line indicator at depth | YES + cycle prevention | YES |
| **react-sortable-tree / react-complex-tree** | DIY | + - icons or strokes | YES | YES |
| **DevExtreme TreeList** | own | + icon for inside,--- for between | configurable `allowDropInsideItem` | YES |

---

## 2. dnd-kit Collision Detection 4 大策略(canonical reference)

**官方 docs(https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms)**:

| Algorithm | over=null when? | 適用 case |
|---|---|---|
| `closestCenter` | **永遠不 null**(always finds nearest)| draggable items 有相同 size + 整齊排列(典型 list reorder) |
| `closestCorners` | **永遠不 null** | 跟 closestCenter 類似,multi-corner 算法 |
| `rectIntersection` | over=null 當 dragged rect 完全不跟 droppable rect 相交 | 需要明確「在 target 內」才算 over |
| `pointerWithin` | over=null 當 pointer 不在任何 droppable rect 內 | **canonical for tree drag / list with cancel** — pointer-precise,允許 release 在 gap 取消 drop |

**Best practice composite**(dnd-kit official recommendation):
```ts
const collisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions
  return rectIntersection(args)  // fallback for keyboard sensor
}
```

---

## 3. 我們 DS 3 個 drag impl 現況 audit

### 3.1 TreeView(基準 canonical)

| 維度 | 現況 |
|---|---|
| Mechanism | dnd-kit `useDraggable` + `useDroppable`(non-Sortable) |
| Collision | **不傳 `collisionDetection` prop** — dnd-kit 預設 `rectIntersection` |
| Drop position | **手動算 cursor Y offset**(0-25 before / 25-75 inside / 75-100 after for folder; 0-50/50-100 for leaf)|
| Indicator | absolute div `dropIndicatorRow.before/after/inside`(SSOT v14.5) |
| Snap-back | ✓(若 release 不在 droppable rect,dropTarget=null,onDragEnd `targetId` undefined → consumer 不更動)|
| Cycle prevention | 有(walk descendant,exclude self) |
| Ghost | DragOverlay portal 半透 chip(`bg-surface border shadow-elevation-200`)|

### 3.2 DataTable row drag(現況)

| 維度 | 現況 | 跟 TreeView 一致? |
|---|---|---|
| Mechanism | dnd-kit `useSortable`(Sortable variant)| ✗ 不同 |
| Collision | 自訂 `sameParentCollisionDetection` 用 `closestCenter` | **✗ closestCenter 永遠返回 over → 任何 release 都觸發 reorder**(user bug 2 root cause)|
| Drop position | active vs over index(只 before/after)| ✗ TreeView 有 inside |
| Indicator | absolute div `dropIndicatorRow.before/after`(v14.6 SSOT) | ✓ 視覺對齊 |
| Snap-back | **✗ 不 work** — closestCenter 永遠有 over,釋放任何位置都 fire onRowReorder | ✗ |
| Cycle prevention | 沒(top-level only,depth>0 沒 handle 不可拖)| N/A |
| Ghost | DragOverlay portal cloned row HTML(`bg-surface-raised shadow`)| ✓ 同 pattern |

### 3.3 DataTable column reorder(現況)

| 維度 | 現況 | 跟 TreeView 一致? |
|---|---|---|
| Mechanism | dnd-kit `useSortable` + cloneElement wrap | ✗ 不同 |
| Collision | `dndCollisionDetection` 中 column branch 用 `closestCenter` 過濾 type='column' droppables | ✗ |
| Drop position | active vs over index(only before/after) | ✗ |
| Indicator | pseudo `dropIndicatorColumn.pseudoBefore/After`(v14.5 SSOT)| ✓ 視覺對齊 |
| Snap-back | **✗ 不 work** — closestCenter 同 row drag bug | ✗ |
| Drop indicator visible? | **✗ user 報「ghost 顯示但 indicator line 沒出現」** — root cause 待 debug | ✗ |

---

## 4. Root cause 分析(user 兩 bug)

### Bug 1:Column drag — ghost 出來但 column 不動 + 無 indicator

**疑點**:
1. **closestCenter 永遠返回 over** → handleDragOver 應該 fire setDropIndicator,但 user 看不到視覺
2. 可能 cause:Tailwind v4 `before:content-['']` pseudo-class 在 cloneElement 注入後 React reconcile 沒重新 apply(已驗證 CSS 有 compile,但 runtime 沒掛上 dropIndicatorSide prop?)
3. 也可能:`indicatorSide` 計算 `dropIndicator?.type === 'column' && dropIndicator.id === colId` 在 React strict mode 下 batched state update 慢一拍?
4. **更可能 root cause**:DraggableHeaderCell 用 `cloneElement` 注入 className,但 useSortable hook 的 `setNodeRef` 和 `transform` 是 INSIDE component。cloneElement 從 parent re-render 觸發 child re-render 時,className 重算,但 indicator state 變化需要 component re-render,我用 `cloneElement` pattern 可能造成 React 找不到正確元件 instance。

**TreeView vs DataTable column 差別**:TreeView 直接 render `<div>` 接收 props,DataTable column 用 cloneElement wrap headerCellEl 結果。**這個 indirection 可能是 root cause**。

### Bug 2:Nested row — 拉動就強制 reorder 不能 snap back

**Root cause CONFIRMED**:
- `closestCenter` 永遠返回最接近的 droppable
- `sameParentCollisionDetection` 過濾 cross-parent 但同 parent siblings 仍永遠返回最近的
- handleDragEnd `if (!over || active.id === over.id) return` — over 永遠非 null,active=over 只在 cursor 完全在 source 上才成立
- 所以釋放在 row 中間任何位置都會觸發 reorder

**修法**(per dnd-kit canonical):switch to **pointerWithin composite collision detection**:
```ts
const collisionDetection = (args) => {
  // 先過濾 type / parent
  const filtered = filterDroppables(args)
  const pointerCollisions = pointerWithin({ ...args, droppableContainers: filtered })
  if (pointerCollisions.length > 0) return pointerCollisions
  return rectIntersection({ ...args, droppableContainers: filtered })  // keyboard fallback
}
```

---

## 5. Phase 1 修法(unified 3 impls 跟 canonical 對齊)

### F1. DataTable 換 `pointerWithin + rectIntersection` composite collision

**Affected**:`dndCollisionDetection`(line 1957)+ `sameParentCollisionDetection`(line 1791)
- 改用 `pointerWithin` first,fallback `rectIntersection`(keyboard)
- Result:cursor 在 row gap / cell gap 釋放 → over=null → onRowReorder 不 fire → snap back

### F2. DataTable column drag indicator root cause debug

**步驟**:加 console.log 到 handleDragOver 觀察 over.id / dropIndicator state update,確認是 collision 問題還是 cloneElement re-render 問題。可能 fix:
- 改用 `<div>` wrapper(不用 cloneElement)— 對齊 TreeView pattern
- 或 verify React state batching 沒問題

### F3. TreeView 維持(canonical baseline,3 impls 對齊它)

無需改動。

---

## 6. Phase 2 plan — Table row 進階 tree-view 式 drag

### 6.1 設計目標

對齊 TreeView 完整功能 + 對齊 Jira / Linear / Asana subtask reparent canonical:
- 每個 row(任何 depth)有 drag handle
- Drop position 3 種:before / after / inside(reparent)
- Cross-parent move 允許
- Cycle prevention(不可 drop into 自己 descendant)
- 視覺對齊 SSOT(`drag-visual.ts` `dropIndicatorRow` + `dropIndicatorInside`)

### 6.2 實作步驟(等 Phase 1 完成才開始)

**6.2.1 State extension**:
- `dropIndicator.side` type 加 `'inside'`
- 已 partial done(side type 在 row drop indicator render 已支援)

**6.2.2 handleDragOver — cursor Y 算 3 位置**(對齊 TreeView 邏輯):
```ts
const offsetY = cursorY - targetRect.top
const ratio = offsetY / targetRect.height
const hasChildren = (over.row.subRows ?? []).length > 0
let position
if (hasChildren) {
  position = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
} else {
  position = ratio < 0.5 ? 'before' : 'after'
}
```

**6.2.3 Drop handle on every depth**:
- 砍 `(row.depth ?? 0) === 0` 條件 in `showDragHandle`

**6.2.4 Cycle prevention**:
- Build descendant set of dragged row
- collisionDetection filter excludes descendants

**6.2.5 Visual `inside` highlight**:
- target row 加 `bg-primary-subtle`(SSOT `dropIndicatorInside`)

**6.2.6 API breaking change**:
- `onRowReorder(sourceId, targetId, position: 'before' | 'after' | 'inside')`
- TS type 抓得到既有 consumer 缺漏

### 6.3 Jira-style 特殊規則

從 Jira webfetch 找到:
- **Story / Task / Bug**:tied to global rank → drag/drop within epic 受限制(只 reorder)
- **Sub-task**:not tied to global rank → 可自由 drop
- **Cross-epic reparent**:UI 允許,可拖 task 到 epic panel(Cmd/Ctrl 多選)

我們 table 不需處理 global rank,**全部 row 都 reparent 自由**(對齊 TreeView simpler pattern)。

---

## 7. 不在世界級對齊內的設計決策(我們可選的)

### 7.1 Drop indicator 厚度
- TreeView 用 `h-0.5`(2px),Atlassian Pragmatic「line bleed 4px outwards」(總 4px outwards)
- 我們選 2px(對齊 TreeView,SSOT 維持)

### 7.2 Cursor 觸發距離(activationConstraint)
- 我們設 `distance: 8`(8px move 才啟動 drag,避免 click 誤觸)
- TreeView 同
- Atlassian / Notion 慣例:5-8px

### 7.3 Inside-drop highlight 顏色
- TreeView / 我們:`bg-primary-subtle`
- VS Code:full bg primary
- Notion:no inside drop in tables

---

## Sources(M26 webfetch,search-only confidence)

- [Atlassian Pragmatic D&D core](https://atlassian.design/components/pragmatic-drag-and-drop)
- [Atlassian Pragmatic D&D design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines/)
- [dnd-kit collision detection algorithms](https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms)
- [dnd-kit issue: Transform null when no collision](https://github.com/clauderic/dnd-kit/issues/1773)
- [dnd-kit cancel discussion #210](https://github.com/clauderic/dnd-kit/discussions/210)
- [Notion Tables docs](https://www.notion.com/help/tables)
- [AG Grid tree row dragging](https://www.ag-grid.com/react-data-grid/tree-data-row-dragging/)
- [Syncfusion TreeView drag](https://ej2.syncfusion.com/react/documentation/treeview/drag-and-drop)
- [react-sortable-tree](https://github.com/frontend-collective/react-sortable-tree)
- [react-complex-tree](https://rct.lukasbach.com/docs/guides/drag-and-drop/)
- [DevExtreme Tree List Local Reordering](https://js.devexpress.com/Demos/WidgetsGallery/Demo/TreeList/LocalReordering/React/Light/)
- [Jira backlog drag subtasks](https://jira.atlassian.com/browse/JRACLOUD-24547)
