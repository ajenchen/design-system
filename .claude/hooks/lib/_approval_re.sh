#!/bin/bash
# SSOT approval keyword regex(M17 + M34,2026-05-18 codify per audit GAP 6)
#
# Used by:
#   - check_substantive_edit_approval_preflight.sh(pre-flight Edit/Write production)
#   - stop_self_audit.sh Mechanism 4(post-flight codex-design ship verify)
#   - check_solo_workflow.sh R3(push main trigger detect)
#
# Background:GAP 6 audit(2026-05-18) found approval regex duplicated 3 places + drift:
# preflight 已加 `#[N] A` numbered directive + 照建議 / 照共識 reference-style
# 但 stop_self_audit / solo_workflow 沒 sync。
# 抽出 single SSOT,source from all consumers,確保未來 update 自動 propagate。

# 完整 approval keyword regex(extended POSIX)
#
# 涵蓋:
# (1) 明確同意:同意 / 採用 / 採納 / 拍板 / 可以 / OK / 好 / approved / approve / 沒問題
# (2) 動作指令:改成 / 改為 / 執行 / 上吧 / push / implement / go ahead / ship / 上 main
# (3) 大批做:做一做 / 就做 / 做吧 / 做完 / 全部做完 / 做到完 / 馬不停蹄 / 全部照建議做
# (4) 建議認可:建議做 / 照你建議 / 照建議 / 照共識 / 照我的 / 按照(代詞 reference)
# (5) Numbered directive:#1 A / #2 B / 1. B / 2. A 類 user 點選 option
# (6) 合 main trigger(R3 solo workflow specific):合進去 / 合 main / merge / 上 main
# (7) Past-tense 認可:好了 / OK 了 / 可以了 / 沒問題了 / 同意了 / 拍板了
# 2026-05-18 syntactic fix:加 closing `)` 收尾(原 `grep: parentheses not balanced`
# 錯誤造成 hook silent fail-closed BLOCKER。純語法 bug,**不** widen 偵測 scope —
# 既有 keyword list 不動。
export APPROVAL_KEYWORD_RE='(同意|採用|採納|拍板|可以|改成|改為|執行|上吧|push|publish|release|implement|go ahead|approved|approve|OK|好|沒問題|做一做|就做|做吧|做完|全部做完|做到完|馬不停蹄|全部照建議做|建議做|照你建議|照建議|照共識|照我的|按照|合進去|合\s*main|merge|上\s*main|ship|好了|OK\s*了|可以了|沒問題了|同意了|拍板了|#[0-9]+\s*[A-Za-z]|^[0-9]+\.\s*[A-Za-z])'

# Helper:check input string contains approval keyword
# Usage: if has_approval "$user_msg"; then ...
has_approval() {
  echo "$1" | grep -qE "$APPROVAL_KEYWORD_RE"
}
