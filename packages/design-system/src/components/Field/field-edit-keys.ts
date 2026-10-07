// @internal — DS-internal 單元(edit-in-place 鍵盤結算 SSOT);consumer 用 InlineEdit / DataTable,不直用。
// ── 消費的 SSOT ──
// - lib/overlay-escape.ts(Esc 分層:就地編輯中的草稿是焦點所在控件自己的一層,浮層守門留給它;Radix 已用掉的那一下不取消)
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
// helper**,禁再手刻 Enter/Esc dispatch(組字判準本身住 `lib/ime-composition.ts` `isImeComposing`,全 DS 一支) —— 現有 host
// (cell string / cell number / cell url / InlineEdit / LinkInput)已全數收斂於此,手刻 = drift 回頭路(正是 2026-07
// 之前 InlineEdit 漏 IME guard 的病根;2026-10-01 LinkInput 自己寫的 Enter 沒 preventDefault,同一下 Enter 的 keypress 落到剛拿到焦點的鉛筆上,
// 提交完又重開編輯 —— 第二次證明)。單行傳 `commitOnEnter` 預設;多行傳 `commitOnEnter:false`
// (本 helper 內建 Cmd/Ctrl+Enter=commit)。此為文件層 SSOT 規矩,不另設 hook(host 少 + 避治理膨脹)。
//
// ── Esc 分層(2026-10-01;規則 ds-canonical/references/keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」)──
// 就地編輯中的草稿是焦點所在控件自己的一層:放在 Dialog / Sheet / Popover 裡時,第一下 Esc 只取消編輯、浮層不關,第二下才關。
// 機制:`editSettleKeyProps` 把 `data-escape-layer` 與 onKeyDown 一起給 host spread(編輯中才掛),浮層守門(`lib/overlay-escape.ts`
// `withOverlayEscape`)看到標記就留住這一下;handler 的 Escape 分支先問 `isEscapeForControl` —— Radix 已用掉的那一下(host 自己的彈出層
// 剛被關掉)不取消編輯。2026-10-01 前這裡只在 React handler 處理,Radix 在 document 捕獲階段早一步把浮層關了(一下少兩層,待辦總帳 N68)。

import type * as React from 'react'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import { escapeLayerProps, isEscapeForControl, type EscapeLayerProps } from '@/design-system/lib/overlay-escape'

export interface EditSettleKeyOptions {
  /** Enter(非組字中)→ 呼叫。已 preventDefault。 */
  onCommit: (e: React.KeyboardEvent) => void
  /** Escape(非組字中、而且這一下歸本控件)→ 呼叫。已 preventDefault。 */
  onCancel: (e: React.KeyboardEvent) => void
  /**
   * Enter 是否 = commit。預設 true。
   * 多行(Textarea)場景設 false:plain Enter = 換行(不攔,交還 Textarea 預設),
   * Cmd/Ctrl+Enter = commit(**本 handler 內建**,consumer 不需另接 capture handler),
   * 其餘 commit 走 blur。
   */
  commitOnEnter?: boolean
  /**
   * `F2` 是否 = commit(回到格導覽)。預設 false。
   * 只有**格子裡的編輯器**(DataTable cell)傳 true:跨元件規則 `ds-canonical/references/keyboard-model-canonical.md`
   * 「進格用什麼鍵」——「`F2` 恆為進到格裡的控件,再按一次回到格導覽」(APG Grid「Editing and Navigating Inside a Cell」逐字:
   * "A subsequent press of F2 restores grid navigation functions.")。值留著(= commit)而不是丟掉:APG 只把「還原」寫在 Escape 那一條,
   * F2 那一條沒有;DataTable 的 Escape 已是「取消編輯」,F2 是另一條出口。InlineEdit 不是格,不傳。
   */
  commitOnF2?: boolean
}

/**
 * edit-in-place 鍵盤結算 handler(SSOT)。IME 組字 guard 為第一道:中文/日文選字的 Enter 是
 * 組字確認、Esc 是取消組字,非 commit/cancel 意圖 —— 無 guard 會誤送半截組字。`isComposing` 為主,
 * `keyCode === 229` 補 Safari / 舊 Chrome(該分支不 emit isComposing)。
 */
export function makeEditSettleKeyHandler(opts: EditSettleKeyOptions) {
  const commitOnEnter = opts.commitOnEnter ?? true
  return (e: React.KeyboardEvent) => {
    // IME 組字 guard(見檔頭;判準唯一住所 lib/ime-composition.ts,2026-09-30 自本檔與另六處手寫收成一支)
    if (isImeComposing(e)) return
    if (e.key === 'Escape') {
      // 這一下已被 Radix 用來關 host 自己的彈出層(或被別的控件獨占)→ 不取消編輯(一下只少一層)
      if (!isEscapeForControl(e)) return
      e.preventDefault()
      opts.onCancel(e)
    } else if (e.key === 'F2' && opts.commitOnF2) {
      // 格子裡的編輯器:再按一次 F2 = 結算、回到格導覽(見 EditSettleKeyOptions.commitOnF2)
      e.preventDefault()
      opts.onCommit(e)
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

export interface EditSettleKeyProps extends EscapeLayerProps {
  onKeyDown: (e: React.KeyboardEvent) => void
}

/**
 * host 直接 spread 到編輯控件上的一組:結算 handler + Esc 層宣告(`data-escape-layer`,編輯中才掛)。
 * `escapeLayer` 預設 true(host 渲染本控件就是在編輯中);LinkInput 這種「輸入框在沒有合法值時也一直在」的 host
 * 傳自己的判斷(正在編輯、或有打了還沒存的字才算一層)。
 */
export function editSettleKeyProps(opts: EditSettleKeyOptions & { escapeLayer?: boolean }): EditSettleKeyProps {
  const { escapeLayer = true, ...settle } = opts
  return { onKeyDown: makeEditSettleKeyHandler(settle), ...escapeLayerProps(escapeLayer) }
}
