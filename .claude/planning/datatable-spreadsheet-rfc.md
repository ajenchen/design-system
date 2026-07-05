---
title: DataTable Spreadsheet-grade Interaction RFC
status: draft
date: 2026-05-09
authors: Claude Opus 4.7 + Codex(dual-track Q3.6/Q3.7/Q3.8/Q3.9)+ User(directives)
branch: claude/cleanup-codex-deploy-2026-05-08
---

# DataTable Spreadsheet-grade Interaction RFC

User 拍板「肯定之後要做到 spreadsheet 等級」(2026-05-09)→ 一次到位 design,避免 v1 短期 → v2 大改 hybrid。本 RFC 為 Slice A SSOT,定 14 contract + 6 invariant + migration slice plan。

---

## ToC

1. [Background](#background)
2. [State Model](#state-model)
3. [14 Interaction Contracts](#14-interaction-contracts)
4. [Rendering Ownership](#rendering-ownership)
5. [Lifecycle / Keyboard / IME](#lifecycle--keyboard--ime)
6. [Overlay Geometry](#overlay-geometry)
7. [Portal / A11y](#portal--a11y)
8. [Virtualizer / Pinned Sync](#virtualizer--pinned-sync)
9. [Invariant Tests](#invariant-tests)
10. [Migration Slice Plan](#migration-slice-plan)
11. [M-rule Alignment](#m-rule-alignment)
12. [Spec Home Assignment](#spec-home-assignment)

---

## Background

User 拍板需求(2026-05-09 verbatim):
- 「肯定之後要做到 spreadsheet 等級」
- 「理想:基於現狀,cell 內容在各種狀態都能維持同樣的起始位置不會因為狀態改變造成內容跳動」
- 「希望 hover 時 overlay 邊框可以剛好蓋住原本 cell 的邊框」
- 「但 editing 要與 Field border SSOT,技術上不確定是否做得到並能維持在程式碼乾淨好維護的狀態」

Codex dual-track sequence:
- Q3.6:displayRegistry vs Field display SSOT — Claude 撤回 codex「Display SSOT 真破」假設,因 cell 仍 render `<Field display>`
- Q3.7:simplified path B confirmed
- Q3.8:codex 補 14 contract(7 → 14)+ 我 Contract 8 認錯(seamless replace cell border)
- Q3.9:codex 撞我 Q-12(Notion 點 cell select row)→ user 撞 codex(Notion select 用 row drag handle 不是 cell click);Q-15 簡化(撤 codex 過度拆分 5 mode)

---

## State Model

3 mode + 5 cell-level interaction state:

### Mode
| Mode | 描述 | Click cell 行為 | Selection 模型 |
|---|---|---|---|
| `spreadsheetMode` | Excel-like(click 1=select / 2=edit) | click → selected cell;Enter/F2/double-click → edit | range + active cell + row checkbox |
| `clickToEditMode` | 預設(click 直接 edit) | editable click → edit;non-editable click → 無事 | row checkbox only(無 active cell concept) |
| `readonlyDisplayMode` | 全 readonly | click 無事 | 看產品需求(row checkbox optional) |

### Cell-level interaction state
| State | spreadsheetMode | clickToEditMode | readonlyDisplayMode |
|---|---|---|---|
| `idle` | ✓ | ✓ | ✓ |
| `hover-editable`(row hover 永遠 trigger; cell hover edit overlay 視 `cellClickEntersEdit` 而定) | hover ring(若 editable) | hover ring(若 editable) | 無 cell ring(row hover 仍可) |
| `selected` / `active` | click cell after | (無此 state) | (無此 state) |
| `range-edge` | range overlay | (無) | (無) |
| `editing` | Enter/F2/dbl-click after | click after | (無) |

Row hover state(`tr:hover`):**任何 mode 永遠保留**(cell 在 row 內,hover cell 自然 trigger row hover 是 CSS native behavior)。

---

## 14 Interaction Contracts

### Contract 1 — activeEditor 數量
**Default**:single active editor(across mode)
**Cite**: Excel / Sheets / Handsontable / Glide / AG Grid 共識(Q3.7 Q-4 confirm)
**SSOT**:Field own editor border;ActiveEditorController 集中

### Contract 2 — Display vs edit rendering
**Default**:cell 永遠 render `<Field mode='display'>`;ActiveEditor host 只 render active edit Field(mode='edit')
**Why no displayRegistry**:cell-registry.tsx 已用 Field display SSOT(L1 註解 verbatim「同 component 靠 mode prop 切」)+ data-table.principles.stories.tsx:140-145 codified Field display 是 type SSOT
**Cite**:Glide overlay editor + AG Grid mixed model

### Contract 3 — Commit/cancel semantics
**Default**:per-type `onCommit` / `onCommitLive` / `onCancel` 行為由 picker own + **central Tab/IME/keyboard route by ActiveEditorController**
**Cite**:AG Grid 有 central editing API(`startEditingCell` / Tab stop+start / popup close stops editing)

### Contract 4 — Tab/Shift+Tab navigation
**Default**:commit current + move selected cell + start edit if next editable;**skip non-editable cell**
**Cite**:Excel / AG Grid skip non-editable
**SSOT**:`colDef.cellEditable` 明確 contract(M1 no private hack)

### Contract 5 — Range selection vs editing
**Default**:range overlay + 1 anchor active editor;非 N editors
**Cite**:Excel / Sheets / Handsontable / AG Grid 共識(Q3.7 Q-4)

### Contract 6 — Scroll/virtualizer positioning
**Default**:portal host anchor active cell rect;scroll/resize/column-resize/pinned-region sync;**unmount → commit-if-valid → cancel**(IME 中 cancel 不 commit)
**User 拍板 stronger upgrade**:**Esc 滾走仍可還原**(controller-managed draft state,not bound to cell DOM)
**Implementation cost**:ActiveEditorController 持 `{ cellId, draft, originalValue, isComposing }` state across virtualizer unmount。 Esc keydown route 到 controller(不靠 cell DOM keydown listener)。

### Contract 7 — Portal nesting / outside click
**Default**:editor root + registered nested portal roots(date / select popup 不算 outside);**nested portal 強制 forward `data-theme` + `data-density`**
**Cite**:M3 portal canonical 對齊 + density M25 chain

### Contract 8 — Hover overlay vs cell border 視覺對齊(corrected per Q3.8 codex)
**Default**:**「one geometry owner, two paint owners」**
- Geometry owner:DataTable `getCellRect(cellId)` 共享 border-box rect
- Hover paint owner:DataTable overlay `<div className="dtHoverRect">` border 1px var(--border-hover)
- Editing paint owner:Field naked editor 自畫 border(SSOT)
- State precedence:editing 時 hover hidden(per Contract 14)
- **Transition**:不做 CSS transition,same-frame state switch(避免 fade-out / fade-in 雙線 flash)
- **Pixel invariant**:hover rect border-box vs editor host border-box diff ≤ 0.5px on all 4 edges

**Field naked edit border 真實位置**:per `data-table.tsx:1226` 註解 verbatim「**A4 canonical:Field frame seamlessly replaces cell border**」 — **cell.outer.border 同位置**(seamless replace)。所以 hover overlay 跟 Field border 真在同位置,但**不同時刻顯示**。

### Contract 9 — Cell content 起始位置不跳動 invariant
**Default**:**`content visual anchor`** stable across {idle / hover / selected / active / editing} 5 state, anchorX/Y diff ≤ 0.5px
- 純文字:caret offset 0 時第一字符 left/top edge
- 空 cell:placeholder/input text origin
- chip / avatar / picker:第一個 item/wrapper origin(不是整 string 寬度)
- **Truncated 字串末端跳是正常 editing behavior**(by-design,非違反)

### Contract 10 — IME composition guard(NEW per Q3.8 codex)
**Default**:composition 期間 Enter/Tab/Escape 不 commit/navigate/remount
- Guard:`e.isComposing || controller.isComposing || keyCode === 229`
- compositionend 後**下一次** non-composing keydown 才 route commit(macrotask 延遲 per Q3.9 codex)
- Event 順序:`compositionstart → keydown(ignored) → compositionupdate → compositionend → next keydown(routed)`

### Contract 11 — A11y focus model(NEW per Q3.8 codex)
**Default**:grid 一個 roving focus / `aria-activedescendant` owner;editing 時 focus 進 editor,退出後還給 active cell;readonly cell `aria-readonly`
**Cite**:WAI-ARIA APG grid pattern + AG Grid editing API

### Contract 12 — Read-only / non-editable cell visual contract(NEW per Q3.8 codex,user 修正 mode 拆)
**Default**(三 mode 各自):
- spreadsheetMode:non-editable cell 可 selected/focused;Tab skip edit target;焦點樣式是 selection/focus
- **clickToEditMode:non-editable cell click 無事**(撞 codex「click-to-edit 仍可有 active cell」假設,user 撞對:UX 一致性)
- readonlyDisplayMode:全 cell 無 edit affordance
**所有 mode**:multi-select 統一靠 row checkbox(現有 BulkActions pattern),不靠 cell click

### Contract 13 — Pinned divider precedence(per Q3.8 codex,user 拍板派 B)
**Default**(user 拍板):**hover overlay 蓋過 pinned divider OK**
- 理由:pinned 分隔線上的互動(調整欄寬)已由 column resize 功能負責,**沒有衝突**
- 短期 implementation 簡化(派 B):hover overlay 跟 pinned divider 同 z-index layer,hover 時暫時蓋過去
- **Codex 推派 A trade-off**(structural layer above hover):若未來加 pinned shadow / column drop marker 可能要 reconsider,但本 RFC scope 走 user 拍板派 B

### Contract 14 — State precedence matrix(NEW per Q3.8 codex)
**Default priority(高→低)**:
1. `disabled` / `read-only capability`(M24 對齊)
2. `active editor`(editing)
3. `nested popup open`(date / select popup)
4. `range selection`(spreadsheet mode only)
5. `selected cell` / `selected row`
6. `hover-editable`(cell ring)
7. `idle`

**衝突解析**:editing 時 hover hidden / popup 開時 outside click 不關 editor / disabled 永遠 mute 其他 affordance

### Contract 15 — Cell click affordance predicate(per Q3.9 codex,簡化版)
**Default**:**`cellClickEntersEdit(cellType): boolean`** 決定 hover edit overlay
- `true`(顯示 hover edit overlay):text / number / date / time / select(plain or tag)/ multiSelect / person / multiPerson / combobox / TimePicker
- `false`(無 hover edit overlay):checkbox / boolean(toggle) / readonly
- **url 邊界 case**:`cellClickEntersEdit=false`(因為 anchor click 開連結),**但保留 LinkInput 自身 hover-pencil affordance**(`link-input.tsx:194` Pencil ItemInlineAction);**affordance 不限 inline action,xs Button 也 OK**(cell 比 field 大可用)

**Why not codex 4 mode**(`directAction` / `openAction` / `menuOnClick` / `cellClickEntersEdit`):過度拆分。Select / person / multiSelect 是「點 cell 進編輯(從 menu 選)」一種,跟 text「打字」同類。user 撞 codex 撞對。

---

## Rendering Ownership

```
DataTable
├─ Cell content layer
│  └─ <Field mode='display'>  ← own 顯示 + format SSOT(per Contract 2)
│
├─ DataTableInteractionLayer(NEW,本 RFC 引入)
│  ├─ HoverCellRect           ← own hover ring paint(per Contract 8)
│  ├─ SelectionRect / RangeRect ← own selection overlay(spreadsheet mode)
│  ├─ ActiveEditorHost(portal,higher z-index)
│  │  └─ <Field mode='edit'>   ← own edit border(Field SSOT 不變,per Contract 2)
│  └─ NestedPortalRegistry    ← register date / select popup,forward theme/density
│
└─ Pinned region structural divider ← user 拍板派 B,跟 hover overlay 同 z-index
```

**Geometry source**(per Contract 8):`getCellRect(cellId)` returns border-box rect,所有 paint owner 共享。

---

## Lifecycle / Keyboard / IME

`ActiveEditorController`(NEW class,管所有 lifecycle):
```ts
class ActiveEditorController {
  state: {
    cellId: string | null
    draft: any
    originalValue: any
    isComposing: boolean
    pendingCommitFromUnmount: boolean
  }
  startEdit({ cellId, value, reason: 'click' | 'tab' | 'enter' | 'printable' }): void
  commit(): void          // commit-if-valid → controller draft → onChange
  cancel(): void          // restore originalValue → onChange
  commitLive(value): void // multi-select live commit
  routeKeyDown(e: KeyboardEvent): void
  onCompositionStart(): void
  onCompositionEnd(): void  // macrotask delay before next keydown route
  onAnchorUnmount(): void   // commit-if-valid → cancel(per Contract 6)
}
```

Tab route:
```
commit-if-valid → findNextEditable(colDef.cellEditable) → setActiveCell → startEdit({reason:'tab'})
```

IME guard(per Contract 10):
```
keydown.isComposing || controller.isComposing || e.keyCode === 229 → return
compositionend → setTimeout(() => { controller.isComposing = false }, 0)
next non-composing keydown → route
```

Esc handling(per Contract 6 stronger):
```
Esc keydown → controller.cancel()  // restore originalValue
controller.draft 存在 controller,不靠 cell DOM
若 cell DOM unmount → controller 仍持 draft + originalValue → user 滾回來 + Esc → 還原
```

---

## Overlay Geometry

**Single overlay root**(DataTable private,per M21 不抽 global pattern):
```tsx
<div className="dtOverlayRoot" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
  {hoverRect && <div className="dtHoverRect" style={rectStyle(hoverRect)} />}
  {rangeOverlay && <RangeOverlayLayer rects={rangeRects} />}
  {activeEditor && (
    <ActiveEditorHost rect={editorRect}>
      <Field variant="tableCellEditor" {...editorProps} />
    </ActiveEditorHost>
  )}
</div>
```

CSS:
- `.dtOverlayRoot`:absolute inset:0 / pointer-events:none
- `.dtHoverRect`:z-index 1 / border 1px var(--border-hover) / box-sizing:border-box / **transition: none**
- `.dtRangeRect`:z-index 1.5
- `.dtActiveEditorHost`:z-index 3 / pointer-events:auto

**`getCellRect(cellId)` 實作**(geometry owner):
```ts
function getCellRect(cellId: string): DOMRect {
  const cell = layoutCache.get(cellId)?.borderBox
  return {
    x: Math.round(cell.x) + 0.5,  // 0.5px sub-pixel snap
    y: Math.round(cell.y) + 0.5,
    width: Math.round(cell.width),
    height: Math.round(cell.height),
  }
}
```

---

## Portal / A11y

- ActiveEditor host portal 出 DataTable root,進 body
- Nested popup(date/select)portal 進 ActiveEditor host(避被 outside-click 誤關)
- 強制 forward `data-theme` + `data-density`(per M3 + M25)
- `aria-activedescendant` 指 active cell;editing 時 focus 進 editor,退出還給 cell
- `aria-readonly` 標 non-editable cell

---

## Virtualizer / Pinned Sync

- Active cell scroll 出 viewport → `controller.onAnchorUnmount()` → commit-if-valid → cancel
- 但 controller draft 仍持(per Contract 6 stronger)→ user 滾回來可繼續 edit OR Esc 還原
- Pinned region resize/scroll 時 ActiveEditor host rect 重 sync(per Contract 6)

---

## Invariant Tests(6 個 per Q3.8 Q-C codex)

1. **content-origin invariant**:同 cell × 5 state(idle/hover/selected/active/editing)visual anchor x/y diff ≤ 0.5px
2. **Tab transition invariant**:A1→B1 切 cell,A1 display 回復不跳 + B1 editor mount baseline 對齊
3. **IME invariant**:composition 期間 Enter/Tab/Escape 不 commit/navigate/remount
4. **virtualizer scroll invariant**:active cell unmount commit-if-valid policy + 鄰近 cells rect 不位移
5. **picker continuity invariant**:select/multi/person display→overlay editor baseline 對齊
6. **url special-case invariant**:link click 不 start edit / pencil 才 start edit / 兩者都不改 origin

每 invariant test 寫 Playwright assertion(per Layer A mechanical)。

---

## Migration Slice Plan

| Slice | Scope | LOC | 必要性 |
|---|---|---|---|
| **A RFC**(本 doc) | 14 contract + 6 invariant + ToC | doc 600+ | ✅ 必要(現在動工) |
| ~~B Display registry~~ | ~~抽 displayRegistry~~ | — | ❌ **不必要**(Field 已 own display SSOT,per Contract 2 / Q3.7 codex confirm) |
| **C Lifecycle 集中化**(retired,distributed)| ActiveEditorController + IME guard + Tab route + Esc + commit-if-valid | 300-700 | ⚠️ **Distributed via Phase 7 lightweight alternative**(commit `c5eb054`)+ controller class retired to types-only(commit Issue 11,2026-05-10)— lifecycle 分散到:(a) IME 組字 guard = cell-editor keydown 層(data-table.tsx,2026-07-05 D4 補;Field per-control 為輔,field-controls.spec.md)(b) `data-table.tsx handleEditTab` Tab/Shift route(符號指法免行號漂移)(c) lifted draft state + `onDraft` prop(virtualizer-unmount preserve)(d) per-cell Field `onCancel` / Radix Popover outside-click。Future 若需重啟集中 controller,types 仍在 `active-editor-controller.ts`。|
| **D.1-D.2 Hover overlay** | HoverCellRect singleton layer + getCellRect + Contract 15 predicate | shipped | ✅ done(commits e3f5fb3 / eb6b762)|
| ~~D.3 Portal Field active editor~~ | ~~ActiveEditorHost portal Field 出 cell~~ | — | ❌ **post-v1 defer**(per local-edit-field-in-overlay-2026-05-09 codex synthesis:Glide DataEditor `target: Rectangle` + AG Grid inline+popup dual mode → hover ring inline overlay + edit cell-internal,RFC defer post-v1)|

**動工順序**:A(本 doc) → C(controller) → D.1-D.2(overlay hover) → 視覺稽核(per user verbatim「實作完要自動進行視覺稽核」) → ~~D.3 portal Field~~ defer post-v1。

每 Slice 之間 commit + push working branch + Netlify preview verify(per Git solo-work canonical M28)。

---

## M-rule Alignment

- M1 no private hack:`colDef.cellEditable` 明確 contract,不回 meta hidden flag ✓
- M3 portal theme:nested portal forward data-theme(Contract 7) ✓
- M11 specificity:ActiveEditor host 不畫 editing ring,Field own focus border(Contract 8) ✓
- M14 5-layer 落地:本 RFC + spec.md + ActiveEditorController + ContractInvariantTests + memory ✓
- M17 SSOT propagation:ActiveEditor host 繼承 size/density/token chain ✓
- M21 Rule-of-3:overlay pattern DataTable private,不抽 global(Contract 8 SSOT 不擴 global) ✓
- M22 cite:每 contract cite ≥ 3 source(Excel / AG Grid / Handsontable / Glide / Notion) ✓
- M23 DS canonical priority:廢棄 `nakedCellEditableDisplayHover outline`,改 singleton overlay(Contract 8) ✓
- M24 disabled state precedence:contract 14 state matrix 對齊 ✓
- M25 layered chain:overlay scroll chain SSOT(per Contract 7) ✓
- M27 cross-component prop name:`cellClickEntersEdit` / `colDef.cellEditable` 命名須 grep 衝突(本 RFC 已使用 unique prefix `cell*`) ✓
- M29 spec-first:本 RFC 是 spec-first artifact ✓

---

## Spec Home Assignment(per Q3.8 codex Q-D)

- **`data-table.spec.md`(主 SSOT)**:新增章節
  - 「Interaction Overlay / Border Layer Canonical」(Contract 8)
  - 「Cell Content Origin Invariant」(Contract 9)
  - 「State Precedence Matrix」(Contract 14)
  - 「3-mode Interaction Model」(Contract 12)
  - 「Cell Click Affordance Predicate」(Contract 15)
- **`field-controls.spec.md`**:補 Field naked variant 約束
  - 「Field naked edit 是 cell-as-input 的 edge border(seamless replace cell border)」
  - 「Field display 是 type SSOT,DataTable cell 必消費(不重寫)」
  - 「不得自畫 table hover/range overlay」
- **不**抽 global `interaction-overlay.spec.md`(per M21,目前只 1 consumer DataTable)

---

## Open questions(等動工 Slice C/D 過程 surface 解)

- `getCellRect()` 實作:從 layoutCache 取(已有)還是 per-call `getBoundingClientRect()`?
- `ActiveEditorController` 是 React Context 還是 Zustand store?
- IME composition macrotask delay 用 `setTimeout(0)` 還是 `requestAnimationFrame`?
- Esc 滾走還原:controller draft 持多久?(viewport 切換 5min 後仍可還原?)

---

## Appendix — Codex pure-CSS alternative 評估 final reject(2026-05-09)

Codex Q3.6 alternative:「outer 用 definite `height: 100%` + body `flex: 1 1 auto; min-height: 0`,少量資料用 `maxHeight` 分支」。Claude own 真評估後 **reject**。

### Risk vs benefit deep-dive(撤回上輪「defer 到未來」 — 改 evaluated reject)

**現有 JS measure fix(commit e1db92e)work 證據**:
- Reproduce verified:viewport 1280→1920→900,bodyMaxHeight 352/632/252 跟 parent 變
- circular dependency 真打破(observe parent only)
- tsc + 20/20 invariants pass

**Pure-CSS alternative 真風險**(grep 7 處 `isFillHeight` 用法後評估):
1. **`height: 100%` vs `maxHeight: 100%` 語意不同**:`height: 100%` outer 永遠 = parent height(不管 content);少量資料(6 row = 240px)會在 parent 500px 留 260px 空白 → **visual regression**。Codex 提的「少量資料 hug content 用 maxHeight 分支」 = 還是要 JS branch 邏輯,沒簡化
2. **3 mode branching 複雜化**:`height='100%'` (CSS path)/ `height='300px'` (fixed)/ `height='auto'` (intrinsic)— pure-CSS 路要新 branch,跟現有 JS measure 比 branch 數量 ↑,複雜度 ↑
3. **Cross-region(left / center / right)flex 行為一致性**:純 flex 解需 verify 各 region maxHeight 跟 content hug 行為跨 region 一致(現有 JS bodyMaxHeight 一個值套全 3 region,行為簡單)

### Final reject rationale
- **現有 fix 已治本**(circular 真破)+ **沒 break 既有**(tsc + invariants + reproduce 全 ✓)
- **Pure-CSS 路 risk > benefit**(更乾淨 illusion / 分支增加 / cross-region 待驗)
- 對應 **M14 invariant**:「沒 broken 沒理由 fix」(不為 hypothetical 「更純粹」重做 working code)
- 仍保留可能性:若未來 layout architecture 大重構(eg. 棄 AG-Grid 派 3-region scroll → 改 ScrollArea 派 single viewport),那時順便評估 pure-CSS 取代 JS measure
- **不是 "defer to future"** = 評估後 reject;若需要重啟,需新 trigger(eg. profiling 證 JS measure 是 perf bottleneck)
