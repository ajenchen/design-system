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
| Keyboard | tree virtual-focus 的自建 modifier+arrow reorder | **無**(2026-09-06 拆除,見下) | dnd-kit KeyboardSensor(實測可用)|
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
> **⚠️ DataTable 列重排目前違反下方 invariant 6(2026-09-06 登記)**:列的鍵盤拖曳曾掛 dnd-kit
> `KeyboardSensor`,但實測是假路徑 —— Space 會啟動、按方向鍵後落點線消失、放下順序不變。根因是
> dnd-kit 鍵盤座標自 activator 矩形起算,而列的 activator 是貼表格左緣的 fixed 把手浮層,不在任何
> 列的矩形內,`pointerWithin → rectIntersection` 因此永遠解不出 `over`。已於 `c5d3b4c1` 拆除該假
> 路徑(欄位那條 activator 是 header cell、落在其他 header 矩形內,實測可用,**保留**)。
> 補救路徑登記在 `data-table.spec.md`「列重排的鍵盤與單指標路徑」段:先補 WCAG 2.5.7 要求的
> 「上移／下移」選單項(同時解本 invariant),再議是否加 modifier+arrow 加速器。
> **加速器需要一個「目前在哪一列」的游標,而 DataTable 尚無 roving/virtual focus
> (`data-table.spec.md:671`);勾選狀態不可充當該游標 —— 違反 `tree-view.spec.md:130`
> 「焦點跟選取分離」。**

7. **同一能力跨元件必進 SSOT;SSOT 不夠就以世界級方式擴充 SSOT,不得分岔**
   (2026-09-06 user 逐字:「理想上應該要確保所有有此功能的元件能 SSOT 就要 SSOT,避免偏移,
   若 SSOT 滿足不了需求,那就是擴充 SSOT,但反正也是以世界級的設計擴充」;對應 M17
   「SSOT 必可傳播」+ mindset #2)。
   **現況缺口**:`lib/drag-visual.ts` 只擁有**視覺**(來源半透 / 落點線 / inside 高亮 / 游標)
   與三個共用行為 helper(`snapToCursorModifier` / `isReorderNoop` / `reconstructFullRowGhost`);
   **鍵盤重排的行為契約不在 SSOT 內** —— TreeView 的實作是元件私有的
   (`tree-view.tsx` 容器 `handleKeyDown` 分支 + `REORDER_ARROW_KEYS`)。
   因此 DataTable 若要同一能力,**先擴充 SSOT 再消費,不得各寫一份**。
   SSOT 該擁有:鍵位、每按即 commit 的語意(反向鍵即 undo)、結構化播報契約、
   以及「reorder 分支必排在不分 modifier 攔截 Arrow 的分支之前」這條守衛順序
   (TreeView 已解,見 `tree-view.tsx` 該處註解)。
   消費端只供給:**目前是哪一個項目(游標)**、它的合法鄰居、commit callback。
   → 依此,DataTable 專屬的未解項只剩「列游標」一件;其餘全部來自 SSOT。
   **SSOT 自己也不得違背世界級設計**(2026-09-06 user:「這個 SSOT 本身也不能違背世界級的設計,對吧」)。
   本案的實際咬合:`Cmd/Ctrl+Shift+方向鍵` 在文件／清單類(Notion / Asana / Todoist / Figma)是
   「直接移動項目」,在表格／試算表類(Excel / Smartsheet / Airtable)卻是「擴選到資料邊界」。
   若 SSOT 直接把 TreeView 的鍵位寫死,等於逼表格消費者去搶 Excel 的鍵 —— **SSOT 自身即違背世界級**。
   故 SSOT 擁有的不是「一組鍵」而是**「情境 → 鍵位」對照表,每個分支各附世界級 cite**;
   消費者只宣告自己屬於哪個情境。這樣表格不是「例外」,而是命中對照表的另一列 —— 仍是 SSOT,不是分岔。

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
