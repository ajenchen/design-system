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

**Root cause CONFIRMED**(2026-05-06 v14.8 runtime debug):
`reorderableColumnIds` 計算用 `c.id`,但 TanStack `accessor()` columns 沒 explicit `id` field
(runtime 從 accessorKey 推導)→ map 結果全 ''  → filter 全濾掉 → `reorderableColumnIds = []`
→ handleDragOver 中 `activeIdx === -1 || overIdx === -1` 永遠成立 → `setDropIndicator(null)`
早 return → 永遠不 set indicator state → pseudo class 永不 apply。

dnd-kit 本身沒問題:`over.id` 是正確的 'name' / 'category' / 'price'(從 useSortable id 來)。
**問題 only in our reorderable lookup**。

**Fix**:`reorderableColumnIds` map 加 fallback `cAny.accessorKey ?? ''`。同時 lookup `def`
也用 same fallback。Verify 後 `reorderable= [name, category, stock, seller, updatedAt, price]` ✓
indicator pseudo class apply ✓。

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

---

## 8. TreeView library landscape(2026-05-06 v14.9 webfetch update)

**重要發現**:**Radix / shadcn 都沒官方 TreeView**,community 自寫:

| Library | Status | Drag/drop | Virtualization | Notes |
|---|---|---|---|---|
| **Radix UI Tree primitive** | issue #1456 feature request,未做 | N/A | N/A | 沒 |
| **shadcn TreeView** | issue #4642 feature request,未做 | N/A | N/A | 沒 |
| **react-arborist** | mature canonical | ✓ built-in | ✓ | 最 cited reference,但 opinionated full-featured |
| **react-complex-tree** | mature | ✓ | partial | flex props-based |
| **MrLightful/shadcn-tree-view** | community shadcn-style | partial | ✗ | shadcn-styled,輕 |
| **ggoggam/shadcn-treeview** | community shadcn-style | ✓ + cross-tree | ✗ | 跨 tree drag |
| **neigebaie/shadcn-ui-tree-view** | community shadcn-style | ✓ + multi-select | ✗ | range select / drag select |

**結論**:**我們 TreeView 不是 reinventing**(沒官方可抄)。但有 3 個 community shadcn 風 impls 可參考。考慮:
- Path A 維持現 custom impl(features 對齊我們 DS,但每個 drag bug 自修)
- Path B 換 react-arborist(mature 但 opinionated,失去 visual customization 自由度)
- Path C 借 community shadcn TreeView code 為 base,migrate 到我們 visual SSOT
- Path D 維持自寫 + 每次 bug 對齊 react-arborist canonical(實際我們現在做的)

---

## 9. Drag SSOT 收斂 audit(本 round 重點)

**現況**:`drag-visual.ts` 已 SSOT 視覺。drag 行為邏輯散在 3 處:

| 邏輯 | TreeView | DataTable row | DataTable column |
|---|---|---|---|
| Drop position 計算(cursor Y → before/after/inside) | TreeView 自寫 0-25/25-75/75-100 | 用 active vs over index 算 before/after | 同 row drag |
| Collision detection 策略 | 不傳 `collisionDetection`(default rectIntersection)| pointerWithin + rectIntersection composite(v14.8 fix) | 同 row drag |
| Cycle prevention | TreeView 自寫 walk descendant | 沒(top-level only) | 沒(無 nesting) |
| Cross-parent rule | TreeView 自由 | 過濾 same-parent only | N/A |

**抽 SSOT 機會**:
- ✓ **`lib/drag-collision.ts`**:`pointerWithinComposite(args)` helper — TreeView + DataTable 都 consume
- ✓ **`lib/drag-position.ts`**:`computeDropPosition(cursorY, targetRect, hasChildren)` helper — TreeView + Phase 2 DataTable advanced drag 都 consume
- ⚠️ **Collision 內部 filter logic**(same-parent / drag-type)各自有業務語意,不抽

---

---

## 10. Modern table drag impl 完整對照(2026-05-06 v14.12 webfetch)

### 三大 paradigm

| Paradigm | Library | Source 行為 | 其他 rows | Sortable list 自動 shift | 我們的元件 |
|---|---|---|---|---|---|
| **A. dnd-kit useSortable + SortableContext + DragOverlay** | `@dnd-kit/core` + `@dnd-kit/sortable` | source 跟 cursor 預測 drop 位置(dnd-kit 算 transform 給 source 跟 others 預示 drop) | shift transform 自動讓 space | ✓ free | **DataTable row + column** |
| **B. dnd-kit useDraggable + useDroppable + DragOverlay**(分離 hook)| `@dnd-kit/core` 純 | source 留原位(transform 不套)| 不自動 shift,自管 | ✗ 需自管 | **TreeView** ✓ |
| **C. Atlassian Pragmatic(native HTML5)**| `@atlassian/pragmatic-drag-and-drop` | source 留原位(browser native drag preview 跟 cursor)| 不自動 shift,自管 | ✗ 自管 | Jira / Trello / Confluence 用 |

### dnd-kit 官方 docs 重點(direct quote 摘錄)

> "For keeping the drag source element in place while dragging (rather than having it follow the cursor),
> **use a drag overlay rather than transforming the original draggable source** element that is connected
> to the useDraggable hook. You can update the position of the draggable source while dragging without
> affecting the drag overlay."

> "when implementing table row reordering with dnd-kit, you can use **two separate hooks with the same
> id** — useDraggable + useDroppable — which gives the behavior of the row only becoming draggable from
> the handle, AND source stays still."

**= 我們 TreeView 已經用這 pattern。DataTable 要跟同模式 = paradigm B refactor**。

### Atlassian Pragmatic Jira 真實視覺(深 dive 後修正前理解)

Pragmatic 用 native HTML5 drag preview:
- **Browser native drag preview** opacity 0.95 + box-shadow(無法 disable,瀏覽器 control)
- **Source 不主動 transform** — 留 DOM 原位
- **Drop indicator** 自管 render(line / border)
- **Trello shadow indicator** = drop placeholder pattern(複雜,scale 不好)

**= Source 留原位確實是 Jira pattern,但靠的是 native HTML5 drag preview + 不套 source transform**。

---

## 11. 我們 DataTable 走 Path 比較

| Path | 改動 | 視覺結果 | Cost | Trade-off |
|---|---|---|---|---|
| **A 維持 v14.11**(dnd-kit useSortable canonical)| 0(現狀)| Source 跟其他 rows 都 shift 預測 drop 位置 | 0 | ✗ 不像 Jira;✓ free auto-shift visual |
| **B 重構 useDraggable + useDroppable**(TreeView pattern)| ~150-250 行 refactor:砍 SortableContext / 重寫 collisionDetection / 自管 drop animation | Source 完全留原位;Ghost 跟 cursor;自管 indicator | 中-大 | ✓ 對齊 Jira / TreeView 一致;✗ 失 dnd-kit free shift,要自管 visual reorder |
| **C 換 Atlassian Pragmatic** | 完全砍 dnd-kit + 重 onboard Pragmatic 全 API | Native HTML5 drag preview;Source 完全留原位 | 大(全 refactor)| ✓ Jira 同 stack;✗ 換 lib + 重學 + 跨 column / row / tree 重寫 |

### 我推薦 **Path B**(對齊 DS 內 TreeView):
- TreeView 已用 `useDraggable + useDroppable` 同 stack
- DataTable 換同 pattern → DS 內所有 drag 同 paradigm
- Cost 中等(~200 行),對齊我們已有的 SSOT(`drag-visual.ts`)
- 結果:Jira 風 source-stays-still + 我們 DS 一致設計語言

---

## Sources(M26 webfetch update)

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
- [Radix UI Tree primitive feature request #1456](https://github.com/radix-ui/primitives/issues/1456)
- [shadcn TreeView feature request #4642](https://github.com/shadcn-ui/ui/issues/4642)
- [react-arborist canonical tree library](https://github.com/jameskerr/react-arborist)
- [MrLightful/shadcn-tree-view](https://github.com/MrLightful/shadcn-tree-view)
- [ggoggam/shadcn-treeview cross-tree drag](https://github.com/ggoggam/shadcn-treeview)
- [neigebaie/shadcn-ui-tree-view multi-select](https://github.com/neigebaie/shadcn-ui-tree-view)
