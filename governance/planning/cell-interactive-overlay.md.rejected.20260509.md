<!-- Authority/status: governance/planning/registry.json -->
# Project — Cell Interactive Overlay primitive — **REJECTED 2026-05-09**

**Date planned**: 2026-05-07
**Date rejected**: 2026-05-09
**Status**: ❌ **REJECTED** — Plan doc 提的 `<CellInteractiveOverlay>` primitive 路徑(以及前身 `CellInteractionRing` / `nakedCellOverlay` variant)在 Phase 1-2 round 3 已落地 → round 4 user 抓到違反 v13.3 SSOT(`field-wrapper.tsx:371-415` Field state machine 是 SSOT,overlay primitive 等於 parallel state ring system)→ revert。Memory invariant `feedback_ds_anchor_preflight.md` codify「`rg "CellInteractionRing|nakedCellOverlay" returns 0 production usage`,不重新引入」。本 plan doc 是同一路徑換名,違反 codified invariant。
**禁止重啟**:hover/focus 1px 視覺問題的解法**不該走 overlay primitive 路徑**(任何「新增 absolute positioned ring layer / 把 hover focus delegate 給 sibling primitive」皆 reject)。應走 in-place fix:tweak `nakedCellEditableDisplayHover` token / Field border state machine,或 user 拍板維持 spec L4 invariant。
**正確 anchor**:`field.spec.md` L3 v13.3 state machine SSOT + L4 Display hover invariant(divider-owner / editor-owner 分離 enterprise canonical)。

**Related issue**: P1 hover ring vs focus border 1px 視覺差(2026-05-09 真因 = 色對比 + ring 同色融合,非 pixel position 差;DOM 兩 state ring 都在 198-199 px)

## Background

Bug F revert 後 baseline canonical 恢復:
- Hover ring(display mode):cell wrapper outline
- Focus ring(edit mode):Field naked-edit border
- 因 cell `border-r border-divider` 1px 讓 cell.outer 比 Field 寬 1px → hover 包 divider / focus 不包 → **right edge 差 1px**

Codex deep eval(brief `4399101299` follow-up `4399197276`)+ 我比稿 + user 拍板:
- ✅ 短期 A:接受 1px diff,spec 明文「divider-owner / editor-owner 分離 invariant」
- ✅ 中期 D(本 plan):新增 `<CellInteractiveOverlay>` primitive,寬 = cell.contentWidth(對齊 Field border),hover/focus ring 都由此 overlay 提供 → pixel-perfect alignment

## D 設計目標

- 新 primitive `<CellInteractiveOverlay>`(暫名)
  - 位置:absolute,寬 = cell.contentWidth(不含 border-r 1px),高 = cell.height
  - 功能:hover ring(`outline-1 outline-offset:-1 outline-[var(--border-hover)]`)+ focus-within ring(`outline-1 outline-[var(--primary)]`)
  - Z-index:純視覺 layer,**不影響 hit test**(`pointer-events: none`)
- Cell render delegate ring 給 overlay(取代現有 `nakedCellEditableDisplayHover` outline on cell wrapper)
- Field naked-edit 不知 overlay 存在(SSOT 不衝突,Field border 仍存在但 transparent)

## D 實作模式(user-confirmed, 跨 session 必遵守)

> 「到時候要做的時候你跟 codex 一起協作實作,然後兩者同時一起列 test case 確保所有情境都能被驗證無誤」

實作時 invoke `codex-collab` SKILL 且必含:

1. **Implementation 階段 dual-track**:
   - Claude(我)寫 v1 implementation
   - Codex 在他 sandbox 也寫 v1
   - 比稿 final implementation(Step 5)

2. **Test case 同時列**(joint planning,**非依序**):
   - Claude 列 Q1-QN test scenarios
   - Codex 列 Q1-QN test scenarios(獨立)
   - 比稿合併 → final test plan(union)
   - **不只我列**(防漏)/ **不只 codex 列**(防 codex bias)/ 兩邊 union

3. **Test case 必涵蓋**(min coverage):
   - **4 大 stories regression**:VirtualScroll / RowAutoHeightInlineEdit / InlineEdit / RowDragInteractive(pinned columns)
   - **State combinations**:
     - hover idle vs hover edit mode vs focus-within vs both
     - sm/md/lg field size × autoRowHeight on/off × pinned vs non-pinned
   - **Visual regression**:Playwright pixel-level boundingBox probe,確認 hover/focus 完全同 box
   - **Hit test**:click cell 仍 trigger edit(overlay pointer-events:none verify)
   - **Z-index / portal**:overlay 在 DragOverlay / OverflowIndicator HoverCard popup 等 portal context 不破

## D 實作前 prerequisites

- [ ] User confirm 走 D(短期 A 已接受 — 不急)
- [ ] 檢查 4 大 stories Playwright pipeline 已 ready(`/component-quality-gate` Ship phase 整合)
- [ ] 確認 `pointer-events: none` 不破 cell click trigger edit(現有 `onEditableCellClick` chain)

## Cross-session loading

- MEMORY.md index 加 entry → 新 session 自動 discover
- `field.spec.md` L4 entry 加 pointer to 本 plan
- `codex-collab` SKILL Step 6(implement)加「joint test case planning」pattern when consumer is D-class architectural change

## Trigger to revisit

- User 提「pixel-perfect 對齊 / overlay primitive / cell-interactive layer / D 路徑」→ 啟動本 plan
- 或 future 出現需要 cell-level interaction(multi-cell range select / focus group / kbd nav highlight)場景 → D 順道 ship 更划算
