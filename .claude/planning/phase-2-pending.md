# Phase 2 Planning Docs(2026-05-06 v15.0+)

3 個 deferred 任務的完整 plan,任一 session 任一時間都能無痛接軌。每條都有:context / current state / scope / impl steps / verify criteria / where to start。

---

## P2-1:DataTable advanced tree-table drag(Jira-style)

### Context

User directive(2026-05-06):
> 「應該也要可以支援 path B那種吧?不然要怎麼做出類似 Jira 的產品?」
> 「Jira-style product 必走 Path B(epic 拖進別 epic 變子 task / sub-task 跨 parent reparent)」

Phase 1(v15.0)做完了 source-stays-still pattern(useDraggable + useDroppable)。Phase 2 = 加 advanced tree manipulation 對齊 Jira 行為。

### Current state(Phase 1 done in v15.0)

- `enableRowDrag` 只 top-level rows 可拖(handle 只 render 在 `(row.depth ?? 0) === 0`)
- 子 rows 不可拖(無 handle)
- Cross-parent drop 過濾(`sameParentCollisionDetection`)
- Drop indicator only `'before' | 'after'`(2 位置)
- API:`onRowReorder(sourceId, targetId, position: 'before' | 'after')`

NestedRowsWithDrag story 已 exercise 此 Path A canonical。

### Phase 2 scope

對齊 TreeView 完整 tree drag canonical:

| Feature | Phase 1 (v15.0) | Phase 2 |
|---------|-----------------|---------|
| Top-level drag | ✓ | ✓ |
| **Sub-rows drag handle** | ✗ 沒 | ✓ render handle on every depth |
| **Cross-parent drop** | ✗ 過濾掉 | ✓ 允許,但禁循環(cycle prevent)|
| **Inside-drop nest**(把 source 放進 target 變子 row)| ✗ | ✓ `'inside'` position |
| Drop indicator positions | 2 (before/after)| **3** (before/after/inside)|
| Inside-drop visual | N/A | `bg-primary-subtle` 全 row(SSOT 對齊 TreeView `dropIndicatorInside`)|
| API breaking change | none | `onRowReorder` position 加 `'inside'` |

### Impl steps(順序)

**Step 1**:Drop position 計算改 cursor-Y-based(對齊 TreeView)
- File:`data-table.tsx` `handleDragOver`
- 從 `over.rect` + `event.delta.y` + cursor 算 ratio = `(cursorY - rect.top) / rect.height`
- Folder rule(target hasChildren):0-25 before / 25-75 inside / 75-100 after
- Leaf rule(target no children):0-50 before / 50-100 after
- 對齊 TreeView line 340-374 logic
- 或抽到 `lib/drag-position.ts` SSOT(SSOT 收斂 audit 之機會)

**Step 2**:Sub-rows 也加 drag handle
- File:`data-table.tsx` line 1574(`showDragHandle`)
- 砍 `(row.depth ?? 0) === 0` 條件 → handle render 在每 depth
- Handle 已是 portal-rendered,跨 depth 無 layout 衝突

**Step 3**:Cross-parent drop 允許 + cycle prevention
- File:`data-table.tsx` `sameParentCollisionDetection` → 改 `crossParentCollisionDetection`
- 移除 `cParent === activeParent` filter
- 加 cycle prevention:filter out 任何 over.id 為 active.id 的 descendant
- Build descendant set:`buildDescendantSet(activeId, allRows): Set<string>`(walk 樹)

**Step 4**:Inside-drop highlight render
- File:`data-table.tsx` row render(line 1597+)
- 加 `dropIndicator?.side === 'inside'` 條件 → 整 row 加 `dropIndicatorInside` class(`bg-primary-subtle`)
- 已有 SSOT export from `lib/drag-visual.ts`,直接 consume

**Step 5**:onRowReorder API 擴展
- File:`data-table.tsx` `handleDragEnd` + `OnRowReorderHandler` type
- 加 `'inside'` to position union
- Consumer 處理 inside-drop:source 變 target 的 child(splice + nesting logic)
- NestedRowsWithDrag story handler 加 inside case 範例

**Step 6**:DataTable spec.md 更新
- 「Cross-parent drop 禁止」段(line 451-452)→ 改 Path B canonical 描述
- 加 cycle prevention rationale + 3-position indicator visual

**Step 7**:Visual + e2e verify
- 新 playwright script `scripts/debug-tree-drag-cross-parent.mjs`
- Test cases:
  - Drag sub-row to top-level position
  - Drop on parent's right half(inside-drop nest)
  - Drop on top-25%(before sibling)
  - Cycle prevention(drag parent into own child → over=null)

### Reference docs
- TreeView impl: `tree-view.tsx` line 280-411(`useDraggable + useDroppable + handleDragMove` 完整 impl)
- TreeView spec: `tree-view.spec.md` Drag and Drop 段
- Webfetch refs: `.claude/references/drag-canonical.md` 段 8-10
- Drop position SSOT 機會: `lib/drag-position.ts`(目前 TreeView inline,可抽)

### Verify criteria

- ✓ tsc clean
- ✓ DataTable invariants 20/20
- ✓ NestedRowsWithDrag story:sub-row drag handle visible
- ✓ Cross-parent drop 觸發 onRowReorder
- ✓ Inside-drop visual `bg-primary-subtle` 顯
- ✓ Cycle prevention(parent → own descendant)被擋

### Where to start
Start at Step 1(drop position 算法),最 self-contained。其他 steps depend on Step 1 的 position type。

---

## P2-2:PeoplePicker SSOT alignment(searchIn: 'trigger' mode)

### Context

User directive(2026-05-06):
> 「people picker 不管單人還多人應該都會像 select/combobox 一樣可以支援在輸入框內直接輸入搜尋」
> 「兩者都有用槍時機」(指 trigger-search vs menu-search 都有適用情境)

### Current state(SSOT gap confirmed)

| 元件 | `searchable` | `searchIn: 'trigger'` | `searchIn: 'menu'` |
|------|------------|---------------------|--------------------|
| Select | ✓ opt-in | ✓ trigger 變 input | ✓ |
| Combobox | ✓ opt-in | ✓ | ✓ |
| **PeoplePicker** | **永遠 true(line 205 hardcoded)** | **✗ 沒** | ✓ |

PeoplePicker 只 popover-menu-search。Cell-as-input(table inline edit)時希望像 Combobox 在 trigger 直接打字。

### Phase 2 scope

加 `searchIn: 'menu' | 'trigger'` prop 給 PeoplePicker(對齊 Select / Combobox API SSOT)。

| 場景 | searchIn 預設 | 視覺 |
|------|------------|-----|
| Form 內 PeoplePicker(空間夠)| `'menu'`(現狀)| 點 trigger 開 popover,popover 內搜尋 |
| **Cell-as-input PeoplePicker** | `'trigger'`(對齊 multiPerson cell 期望)| trigger 變 input,直接打字 filter |

### Impl steps

**Step 1**:Audit Select / Combobox `searchIn` impl
- File:`select.tsx` line 109-228(Trigger content branches)
- Note 三 mode(searchable+open / text / tag),抽 logic 對齊 PeoplePicker 也適用

**Step 2**:PeoplePicker tsx 加 `searchIn` prop
- File:`people-picker.tsx`
- 預設 `'menu'`(back-compat 現有 consumer)
- 當 `'trigger'` 時,trigger 渲染 `<input>` 取代 read-only display
- 當 trigger input focus 時 popover open + 直接打字 filter
- 對齊 Combobox `searchIn: 'trigger'` impl pattern

**Step 3**:PeoplePicker spec.md 更新
- 加 `searchIn` prop description
- 對照 Select / Combobox SSOT,文檔化 cell-as-input use case

**Step 4**:DataTable cell-registry MultiPersonCell + PersonCell update
- File:`cell-registry.tsx` line 313-347
- 設 `searchIn='trigger'`(cell 內希望 inline 編輯)
- multiPerson edit pattern 從 popover-only → trigger-search-with-popover-options
- Reviewers cell 終於支援 inline-edit(解之前 invariants test 找不到 `[data-field-mode="edit"]` 之困)

**Step 5**:`data-table-invariants.mjs` test logic update
- multiPerson 加進 invariant test(現在可以走 inline-edit 了)
- I2/I3/I4 invariants 全 cell type 完整覆蓋

### Verify criteria

- ✓ Select / Combobox / PeoplePicker API 三家 `searchable + searchIn` 對齊
- ✓ MultiPersonCell 在 cell-as-input 走 `searchIn='trigger'` 模式
- ✓ Reviewers cell 進 invariants test 也 pass

### Where to start
Step 1 audit Combobox `searchIn: 'trigger'` 實作(取代我們 PeoplePicker 自寫)— 然後 mirror 到 PeoplePicker。

---

## P2-3:Drag-position SSOT 抽到 `lib/`

### Context

`drag-canonical.md` 段 9 提的 SSOT 收斂機會。

### Current state

3 處 drag 各自有 drop position 計算:
- TreeView:cursor Y → before/inside/after(完整 3 位置 + folder/leaf rules)
- DataTable row:active vs over index → before/after(2 位置)
- DataTable column:active vs over index → before/after(2 位置)

### Phase 2 scope

抽 `lib/drag-position.ts`:
```ts
export function computeDropPosition(
  cursorY: number,
  targetRect: DOMRect,
  hasChildren: boolean,
  pointerIndentLevel?: number,
  targetDepth?: number
): DropPosition
```

3 元件 consume 同 SSOT。Phase 2 tree-table advanced drag(P2-1)會用到此 SSOT。

### Where to start
跟 P2-1 Step 1 同時做:從 TreeView extract 函數 → `lib/drag-position.ts` → DataTable 也 consume。

---

## P2-4:Other deferred / governance(non-blocking)

| 項目 | 狀態 | 何時做 |
|------|-----|------|
| Hook count 28(D8a sub-threshold)| 全 active 沒 dead | 季度 `/knowledge-prune` task |
| Spec consolidation 496/500 | monitor only | 越過 cap 才動 |
| ColumnReorder real-mouse Netlify verify | playwright simulation gap | user 真實 mouse 試 v15.0 Path B |

---

## Quick Reference(任 session 重接)

讀本 doc 對齊 context。Phase 2 working order:
1. P2-3 抽 `lib/drag-position.ts`(prep step)
2. P2-1 Step 1-7(tree-table advanced drag)
3. P2-2 PeoplePicker `searchIn: 'trigger'` SSOT alignment
4. P2-4 governance items(quarterly schedule)

每條都有完整 self-contained context,任 session 從 doc 開始就能執行。
