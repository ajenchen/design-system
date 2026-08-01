# Drag & Drop Canonical

**Status:** active；2026-08-01 依現行 code/spec 重驗。舊的 stale-prune 標記、未落地
Path 比較與已修 bug 過程已由本次 knowledge-prune 收斂；歷史仍可由 Git 追溯。

## Authority boundary

- 元件行為與 API：各元件 `*.spec.md` + production code。
- 跨元件視覺與純函式：`packages/design-system/src/lib/drag-visual.ts`。
- 本檔：解釋共同 invariant、現行能力差異與 future-reserved 邊界；不得覆寫 spec/code。

TreeView、DataTable row 與 DataTable column 都使用 `@dnd-kit/core` 的
`useDraggable` + `useDroppable` + `DragOverlay`，但合法 target 與 position 是各元件業務語意，
不能為表面一致硬抽成同一 collision function。

## 現行能力矩陣

| 能力 | TreeView | DataTable row | DataTable column |
|---|---|---|---|
| Drag source | 整列；pointer activation 5px | top-level row handle；8px | header handle；8px |
| Position | before / after / inside | before / after | before / after |
| Target scope | 合法 tree node；排除 self/descendant/disabled | same-parent sibling；目前 UI 只開 top-level source | visible、non-system、non-locked column |
| Collision | dnd-kit rect intersection + component position logic | pointerWithin → live DOM/rectIntersection fallback | pointerWithin → rectIntersection fallback |
| No-op / cancel | 無合法 target 不 commit | source 範圍、相鄰 noop、cross-parent、gap 都不 commit | noop + 未跨 target midpoint 不 commit |
| Keyboard | tree virtual-focus 的自建 modifier+arrow reorder | dnd-kit KeyboardSensor | dnd-kit KeyboardSensor |
| Indicator | row line + inside highlight | row line | column pseudo line |
| Overlay | node ghost | reconstructed full-row ghost | header ghost |

補充：DataTable 的 column visibility panel、sort manager 等小型內部 sortable list 仍可使用
`useSortable` + `closestCenter`。它們不是 DataTable canvas row/column drag，沒有「離開 target 應取消」
的相同語意，因此不構成 SSOT drift。

## 共同 invariant

1. **原 source 留位、overlay 跟 cursor**：overlay 不可讓 source DOM 自動位移；
   `snapToCursorModifier` 與 overlay reconstruction 由 `drag-visual.ts` owning。
2. **無意圖不得 commit**：沒有合法 target、仍在 source、等價相鄰位置或未跨越 column midpoint
   都是 no-op；禁止「一拉起就必換位置」。
3. **Target 先過語意過濾**：row/column/tree droppable 不可互撞；same-parent、locked、disabled、
   descendant 等限制先過濾，再做幾何 collision。
4. **視覺只消費共享 primitive**：source opacity、row/column indicator、invalid cursor、ghost 重建與
   no-op helper 由 `drag-visual.ts` 提供；元件不可另造平行 class。
5. **Virtualization 要重測量**：DataTable droppable 使用 `MeasuringStrategy.Always`，必要時以目前
   table root 內 live DOM rect fallback；禁止 document-wide、只看 Y 軸的 target 搜尋。
6. **Pointer 與鍵盤都要可完成合法操作**：TreeView 因 `aria-activedescendant` 使用自建鍵盤分支；
   DataTable 無 `SortableContext`，不可誤套 `sortableKeyboardCoordinates`。

## Collision canonical

需要「pointer 離開合法 target 就取消」的場景，先用 `pointerWithin`，鍵盤／非 pointer 再以
`rectIntersection` fallback：

```ts
const collisionDetection = (args) => {
  const eligible = filterSemanticTargets(args)
  const pointer = pointerWithin(eligible)
  return pointer.length > 0 ? pointer : rectIntersection(eligible)
}
```

`closestCenter` 適合「始終選最近一項」的緊密 sortable list；不可用於需要 gap/cross-scope
cancel 的 DataTable canvas drag。

## Future-reserved（保留，不是現行承諾）

- DataTable nested row 的 cross-parent/inside reparent。
- 把 position/collision 抽成跨元件 helper；只有出現第三個同語意 consumer 且完整 predicate 相同時才抽。
- 更換 drag library。

若啟動 nested reparent，必先更新 DataTable spec/API，補 descendant cycle prevention、inside target
visual、pointer/keyboard parity、virtualized cases 與 consumer migration；目前
`onRowReorder(sourceId, targetId, 'before' | 'after')` 不得被文件誤寫成支援 `inside`。

## Historical closure

- 2026-05 的 DataTable row/column 已從 `useSortable` Path A 遷移到
  `useDraggable` + `useDroppable` Path B；舊比較不再是待決提案。
- accessor-derived column id、強制 reorder、source-scope false target、virtualized stale rect、
  ghost/cursor 偏移與 midpoint 問題均已有 production guard；現況以 code/spec/tests 為準。
- `lib/drag-collision.ts`、`lib/drag-position.ts` 從未成為現行 authority，故不再以打勾清單冒充已落地。

## Sources

- [dnd-kit collision detection algorithms](https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms)
- [dnd-kit drag overlay](https://docs.dndkit.com/api-documentation/draggable/drag-overlay)
- [dnd-kit keyboard sensor](https://docs.dndkit.com/api-documentation/sensors/keyboard)
- [Atlassian Pragmatic drag and drop](https://atlassian.design/components/pragmatic-drag-and-drop)
