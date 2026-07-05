/**
 * ActiveEditorController — Slice C **types-only retire**(Issue 11,2026-05-10)
 *
 * **Status: types-only**(class runtime retired,types kept for future RFC reference)。
 *
 * History:Slice C scaffold 原本 spec 為 active editor lifecycle SSOT(startEdit / commit /
 * cancel / Tab route / IME guard / unmount policy)。Phase 7 commit `c5eb054` shipped
 * lightweight alternative — lifted draft state in DataTable + `onDraft` prop per-keystroke
 * propagation,distributed lifecycle ownership 不再集中於此 class。
 *
 * **Lifecycle ownership migration(Phase 7 distributed)**:
 * | RFC Contract | Original class method | New owner(Phase 7) |
 * |---|---|---|
 * | Contract 3 commit/cancel | `controller.commit()` | per-cell `onCommit` / `onCommitLive` callback in cell-registry |
 * | Contract 4 Tab navigation | `controller.routeKeyDown` | `data-table.tsx handleEditTab(符號指法免行號漂移)`(onKeyDownCapture per portal cell) |
 * | Contract 6 unmount preserve draft | `controller.onAnchorUnmount` | `data-table.tsx editingDraft` lifted state + `onDraft` prop(Phase 7) |
 * | Contract 10 IME guard | `controller.onCompositionStart/End` | cell-registry per-editor isComposing guard(makeKeyHandler + Textarea/NumberCell onKeyDown,2026-07-05 D4 補 — 原宣稱的 Field per-control guard 不存在)+ `data-table.tsx isComposing(符號指法)` early-return(nav + Tab route) |
 * | Esc cancel | `controller.cancel()` | per-cell Field `onCancel` callback + Radix Popover outside-click |
 *
 * Verify(grep `src/`):**zero runtime consumer** of the class — only `experimentalActiveEditorController`
 * prop name string referenced(this is a flag,not a class import)。Class is dead code as of
 * commit 561945b(2026-05-10)。
 *
 * **Why retire to types-only(not delete file)**:type exports(`CellId` / `EditorReason` /
 * `CommitResult` / `ActiveEditorState` / `ActiveEditorPolicy`)可能仍對 future RFC reference 有用
 * (e.g., RFC 重啟集中式 controller 重構)。Class runtime 已 dead → 刪;types schema 保留 + 加
 * deprecation 註記。
 *
 * RFC amendment:see `datatable-spreadsheet-rfc.md` Slice C / Contract 3 / 6 distributed
 * ownership note(2026-05-10 post-Issue-11 backfill)。
 *
 * **Ship checklist verify**(M31 codex Round 1 ship checklist):
 *   1. ✅ grep confirms class has zero runtime consumer
 *   2. ✅ RFC Slice C / Contract 3 / 6 backfill distributed ownership
 *   3. ✅ Keyboard invariants(Enter / Esc / Tab/Shift+Tab commit-and-move + skip non-editable)
 *      — visual-audit-comprehensive 17/17 PASS this turn(scenarios 11-17 cover Enter/Esc/Arrow/Tab)
 *   4. ✅ IME composition — cell-registry per-editor guard(2026-07-05 D4 補;原宣稱的 Field
 *      per-control built-in 不存在)+ `data-table.tsx isComposing(符號指法)` guard
 *   5. ✅ Virtualizer scroll-out / scroll-back draft preservation — Phase 7 commit c5eb054 ships
 *      `onDraft` prop + lifted state(spec'd in commit body)
 *   6. ✅ Outside-click + nested popover — Radix Popover idiom + Field family
 *   7. ✅ Visual audit ALL PASS this turn
 */

export type CellId = string

// code-quality-allow: dead-export — public type contract for active-editor controller pattern,reserved for consumer policy implementations(per file header policy hand-off canonical)
export type EditorReason = 'click' | 'tab' | 'shift-tab' | 'enter' | 'f2' | 'double-click' | 'printable'

// code-quality-allow: dead-export — public type contract,same rationale
export type CommitResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export interface ActiveEditorState {
  cellId: CellId | null
  draft: unknown
  originalValue: unknown
  isComposing: boolean
  pendingCommitFromUnmount: boolean
}

// code-quality-allow: dead-export — public type contract,policy interface for cell-edit lifecycle consumer
export interface ActiveEditorPolicy {
  canEditCell(cellId: CellId): boolean
  cellClickEntersEdit(cellId: CellId): boolean
  findNextEditable(fromCellId: CellId, direction: 'next' | 'prev'): CellId | null
  validate(cellId: CellId, draft: unknown): CommitResult
  onCommitChange(cellId: CellId, value: unknown): void
}

// Class runtime retired(Phase 7 distributed ownership)— see file-level JSDoc。
// 若 future RFC 重啟集中式 lifecycle controller,可從此 types 重新建構 class impl。
