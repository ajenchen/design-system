# Phase 2 Planning Docs(2026-05-06 v15.0+)

本 doc 收 v15.0 後 deferred 任務。**任一 session 任一時間都能無痛接軌**。每條都有:context / current state / scope / impl steps / verify criteria / where to start。

## Cross-reference:Planning dir 全貌

本 doc 是 v15.0+ 系列的子集。Planning dir 還有其他長線未開工 plans:

| Plan | 狀態 | Trigger |
|------|------|--------|
| **本 doc(`phase-2-pending.md`)** | v15.0 完成後 deferred 任務(P2-1~P2-4)| 「P2-X 開做 / 上述 deferred 開始」 |
| **`team-distribution-roadmap.md`** | **Architecture decided 2026-05-01,6 phases NOT STARTED**(npm workspaces 拆 / Storybook 拆 / Claude plugin / release pipeline / product-workspace template / onboarding doc)| 「開始 team distribution / 拆 npm package」 |
| **`story-auto-compile.md`** | Phase 1-3 done,**Phase 4 migration 58/59 元件未跑** | 「做 migration / phase 4」 |
| `row-primitive-consolidation.md.rejected` | 2026-04-24 declined(over-engineering)| 歷史 archive |

**任一 session 重接,先 `ls .claude/planning/` 看哪些 plan 在進行 / 待開工**。

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

## P2-2:PeoplePicker SSOT alignment(consume Select / Combobox as base)

### Context

User directive(2026-05-06,精準版):
> 「多人的 inline edit 樣式也跟 combobox 一樣,反正在 people picker 就只是把 tag 變成 avatar 而已,其他都是以此類推」
> 「單人的 inline edit 就是跟 select 一樣,應該都是效仿的要」
> 「所以都要 SSOT」

PeoplePicker 不該自開新 trigger pattern,應該:
- **single mode** → consume Select(只換 selected-display item renderer)
- **multi mode** → consume Combobox(只換 selected-tag pill renderer)
- 共用 trigger 行為(searchable input / search-in-trigger / popover open / focus return)

### Current state(SSOT gap confirmed)

| 元件 | `searchable` | `searchIn: 'trigger'` | `searchIn: 'menu'` | Selected display |
|------|------------|---------------------|--------------------|-----------------|
| Select | ✓ opt-in | ✓ trigger 變 input | ✓ | text |
| Combobox | ✓ opt-in | ✓ | ✓ | Tag pill |
| **PeoplePicker** | **永遠 true(line 205 hardcoded)** | **✗ 沒** | ✓ only | Avatar+name(custom)|

PeoplePicker 自寫一套 popover+search,**沒繼承 Select / Combobox trigger 行為**。

### Phase 2 scope(對齊 user directive 「以 Select / Combobox 為 base」)

**Architecture**:PeoplePicker 拆 single / multi 兩 mode 各自 consume base:

```
PeoplePicker (single)
├── 內部 render <Select searchable {...}>
│     ├── 共用 trigger 行為(search-in-trigger / popover / focus)
│     └── selected display slot 改 render <PersonDisplay avatar={...} name={...} />
└── value: PersonValue | null

PeoplePicker (multi)
├── 內部 render <Combobox searchable {...}>
│     ├── 共用 trigger 行為(search-in-trigger / multi-tag inline / popover / focus)
│     └── tag renderer slot 改 render <PersonTag avatar={...} name={...} />
└── value: PersonValue[]
```

**Key principle**:PeoplePicker 退化成 thin wrapper +「item renderer override」slot。所有 trigger 互動 / search / popover canonical 由 Select / Combobox SSOT 提供。

### Impl steps

**Step 1**:Audit Select / Combobox API 完整性
- File:`select.tsx` + `combobox.tsx`
- 確認都有 `searchable + searchIn` + `selectedItemRenderer` slot(或可加)
- 若沒 slot,加(對齊 SSOT extension point)

**Step 2**:抽 Select / Combobox shared trigger primitive
- 評估是否抽 `lib/searchable-trigger.ts`(Select / Combobox / PeoplePicker 都用)
- 若 Select / Combobox 已 90% 一致,抽一層 helper;若差異大,各自留 own impl + PeoplePicker 各 mode 對應 consume

**Step 3**:PeoplePicker(single mode)→ wrapper around Select
- File:`people-picker.tsx`
- single mode 砍自寫 popover,改 render `<Select searchable searchIn={...}>` + `selectedItemRenderer={({value}) => <PersonDisplay person={value} />}`
- API 不變,內部 delegated

**Step 4**:PeoplePicker(multi mode)→ wrapper around Combobox
- File:`people-picker.tsx`
- multi mode 砍自寫,改 render `<Combobox searchable searchIn={...} multi>` + `tagRenderer={({value}) => <PersonTag person={value} />}`
- API 不變,內部 delegated

**Step 5**:DataTable cell-registry update
- File:`cell-registry.tsx` `MultiPersonCell` / `PersonCell`
- 設 `searchIn='trigger'`(對齊 cell-as-input 期望)
- multiPerson cell 終於可 inline-edit(解之前 invariants test 困)

**Step 6**:`data-table-invariants.mjs` 加 multiPerson / person 進 test
- 已可走 `[data-field-mode="edit"]` selector(因 PeoplePicker 內部 = Select / Combobox 提供 Field-like 行為)
- I2/I3/I4 全 cell type 完整覆蓋

**Step 7**:PeoplePicker spec.md 更新
- 「定位」段:**基於 Select(single)+ Combobox(multi)**(對齊 spec-rules canonical:每元件 spec 必明確宣告實作基礎)
- 移除 popover-search-only 自寫描述
- 對照 Select / Combobox SSOT

### Verify criteria

- ✓ Select / Combobox / PeoplePicker API 三家 `searchable + searchIn` 對齊
- ✓ PeoplePicker single / multi 各自 delegate 到 Select / Combobox
- ✓ DataTable MultiPersonCell 在 cell-as-input 走 `searchIn='trigger'` 模式
- ✓ Reviewers cell 進 invariants test 也 pass
- ✓ Trigger 行為(search / focus / popover open-close)Select / Combobox / PeoplePicker 完全一致

### Where to start
Step 1 audit Select / Combobox API completeness。確認他們已有 `selectedItemRenderer` slot OR 加上去後,PeoplePicker 變 thin wrapper 才有可能。

### M23 alignment
本 plan 完全對齊 M23「DS 內既有 canonical 優先於外部 benchmark」— PeoplePicker 不另開 popover-search 架構,consume DS 內既有 Select / Combobox SSOT。

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
