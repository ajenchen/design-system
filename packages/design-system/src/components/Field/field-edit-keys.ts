// @internal — DS-internal 單元(edit-in-place 鍵盤結算 SSOT);consumer 用 InlineEdit / DataTable,不直用。
// ── 消費的 SSOT ──
// (本檔即是被消費的 SSOT;不 import 其他 canonical)
//
// ── 為什麼存在 ──
// 「就地編輯(edit-in-place)」的鍵盤結算契約 —— Enter=commit / Esc=cancel + **中文 IME 組字 guard** ——
// 原本在兩處各寫一份、且**已分歧**:
//   - DataTable `cell-registry.tsx` makeKeyHandler:有 IME guard(2026-07-05 D4 fix)
//   - InlineEdit `inline-edit.tsx`:**無 IME guard** → 中文使用者按 Enter 確認選字時,會把半截組字
//     提交並退出 edit(Esc 則丟棄整個 draft)= latent bug。
// 2026-07-09 edit-in-place SSOT 研究(6-agent + 世界級)結論:**不抽大的共用狀態機**(兩 host 的 draft
// 擁有權 / state locus / focus model 根本不同,強抽違 M21 + 破壞表格虛擬捲動效能),**但抽這一片**——
// 唯一在兩處逐字重複、且現在分歧、且不碰 draft/state/focus 的純鍵盤結算邏輯。抽出後 InlineEdit 順手
// 得到 IME guard(修 bug)。對齊世界級「controls + 型別 registry 共用,orchestration 各自」split。
//
// **不含**:blur=commit(各 host 的 blur 語意不同)、finalizedRef 單次結算 guard(InlineEdit 專屬,
// 防 blur-after-Enter 雙 commit)、draft 管理(host-specific)。這些刻意留在各 host。
//
// ── 新增 edit-in-place host 的規矩(2026-07-10)──
// 之後任何新的「就地編輯」host(第 3 個以上),**Enter/Esc/Cmd·Ctrl+Enter/IME 組字結算一律消費本
// helper**,禁再手刻 `isComposing || keyCode===229` guard 或 Enter/Esc dispatch —— 現有 3 host
// (cell string / cell number / InlineEdit multiline)已全數收斂於此,手刻 = drift 回頭路(正是 2026-07
// 之前 InlineEdit 漏 IME guard 的病根)。單行傳 `commitOnEnter` 預設;多行傳 `commitOnEnter:false`
// (本 helper 內建 Cmd/Ctrl+Enter=commit)。此為文件層 SSOT 規矩,不另設 hook(host 少 + 避治理膨脹)。

import type * as React from 'react'

export interface EditSettleKeyOptions {
  /** Enter(非組字中)→ 呼叫。已 preventDefault。 */
  onCommit: (e: React.KeyboardEvent) => void
  /** Escape(非組字中)→ 呼叫。已 preventDefault。 */
  onCancel: (e: React.KeyboardEvent) => void
  /**
   * Enter 是否 = commit。預設 true。
   * 多行(Textarea)場景設 false:plain Enter = 換行(不攔,交還 Textarea 預設),
   * Cmd/Ctrl+Enter = commit(**本 handler 內建**,consumer 不需另接 capture handler),
   * 其餘 commit 走 blur。
   */
  commitOnEnter?: boolean
}

/**
 * edit-in-place 鍵盤結算 handler(SSOT)。IME 組字 guard 為第一道:中文/日文選字的 Enter 是
 * 組字確認、Esc 是取消組字,非 commit/cancel 意圖 —— 無 guard 會誤送半截組字。`isComposing` 為主,
 * `keyCode === 229` 補 Safari / 舊 Chrome(該分支不 emit isComposing)。
 */
export function makeEditSettleKeyHandler(opts: EditSettleKeyOptions) {
  const commitOnEnter = opts.commitOnEnter ?? true
  return (e: React.KeyboardEvent) => {
    // IME 組字 guard(見檔頭)—— 對齊 cell-registry 既有寫法 + data-table nav handler。
    if (e.nativeEvent.isComposing || (e.nativeEvent as { keyCode?: number }).keyCode === 229) return
    if (e.key === 'Escape') {
      e.preventDefault()
      opts.onCancel(e)
    } else if (e.key === 'Enter') {
      // 單行(commitOnEnter):Enter = commit。
      // 多行(commitOnEnter:false):plain Enter = 換行(不攔,交還 Textarea 預設),
      //   Cmd/Ctrl+Enter = commit —— 此契約由本 SSOT 擁有,3 個 consumer
      //   (cell string/number + InlineEdit multiline)不再各自手刻 capture handler。
      if (commitOnEnter || e.metaKey || e.ctrlKey) {
        e.preventDefault()
        opts.onCommit(e)
      }
    }
  }
}
