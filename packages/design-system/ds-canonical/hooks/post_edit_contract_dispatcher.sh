#!/bin/bash
# post_edit_contract_dispatcher.sh — 寫入之後(PostToolUse Write|Edit|MultiEdit)跑 4 條「元件契約」規則,違反就擋(exit 2)
#
# 2026-11-21 knowledge-prune WP-14(D4-02 + H-M5):原本 4 支各自註冊、都只提醒不擋的 hook 合成這一支,並升為會擋。
#   lib/_peoplepicker_ssot_drift.sh  ← 原 check_peoplepicker_ssot_drift.sh(people-picker.spec.md「Trigger display SSOT canonical table」)
#   lib/_pixel_quantified_audit.sh   ← 原 check_pixel_quantified_audit.sh(meta-patterns M32 主句:visual-audit 腳本必量像素)
#   lib/_field_controls_contracts.sh ← 原 check_field_controls_contracts.sh(field-controls.spec.md「共享 contract」(a)–(d))
#   lib/_select_all_canonical.sh     ← 原 check_select_all_canonical.sh(src/lib/multi-select-ordering.ts `applySelectAll`)
# 為什麼升為擋:四條都是寫進規格 / SSOT primitive、判得出來的規則;只提醒 = 嘴上說重要、執行是軟的
#   (governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md「Decision tree」)。
#   各條的執法等級、判法、豁免寫法與全樹掃描結果只寫在各 helper 檔頭第 2 行起,這裡不重抄。
# 為什麼不併進 post_edit_dispatcher.sh:那支的 helper 由 WP-15a 管(它自己的審計、它自己的新增行判法擁有者 lib/_added_lines.sh);
#   兩組規則的範圍與規格不同,分開註冊,一支 helper 出錯只讓自己那組 fail closed。
# fork 分類:DROP(四支原本都是 DROP;規則全是 DS 作者端的元件內部契約,scripts/fork-hook-classification.json)。
#
# 輸出契約(registrations.json outputMode = governance-context-or-block;fail-closed 寫法照 chrome_header_dispatcher.sh):
#   - 每支 helper:exit 0 不出聲 / exit 0 + stdout 恰好一個 PostToolUse governanceContext(既有違規清單)/
#     exit 2 + 只寫 stderr、內容非空(這次寫入造成的違規)/ exit 70 + GOVERNANCE_INTEGRITY(量具失效)。
#   - 四支都跑完才決定結果(擋的理由一次給齊)。任一支 exit 2 → 本支 exit 2,stderr = 所有擋的理由,後面附其他 helper 的既有清單。
#   - 沒有擋、有既有清單 → stdout 一個合併的 governanceContext,exit 0。
#   - helper 缺失 / 被換成 symlink / 不是一般檔、exit 0 卻寫 stderr 或 stdout 不是單一 PostToolUse context、
#     exit 2 卻寫 stdout 或沒寫原因或帶 integrity 標記、回傳 0 / 2 / 70 以外的 exit code
#     → 一律當量具壞了:stderr 印 GOVERNANCE_INTEGRITY,exit 70(fail closed,不讀成通過)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT CONTRACT DISPATCH FAILURE: 無法讀取 hook input\n' >&2
  exit 70
}
# 只註冊在 PostToolUse Write|Edit|MultiEdit;收到別的事件或格式不對 = 傳輸或註冊壞了,不能讀成「沒有違反」。
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and .hook_event_name == "PostToolUse"
  and (.tool_name == "Write" or .tool_name == "Edit" or .tool_name == "MultiEdit")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string" and length > 0)
' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT CONTRACT DISPATCH FAILURE: hook input 不是有效的 PostToolUse Write/Edit/MultiEdit 事件\n' >&2
  exit 70
fi

LIB_DIR="$(dirname "$0")/lib"
CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/post-edit-contract-dispatch.XXXXXX") || CAPTURE_DIR=""
if [ -z "$CAPTURE_DIR" ] || [ ! -d "$CAPTURE_DIR" ]; then
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT CONTRACT DISPATCH FAILURE: 無法建立 helper output capture\n' >&2
  exit 70
fi
trap 'rm -rf -- "$CAPTURE_DIR"' EXIT HUP INT TERM

SEPARATOR=$'\n\n────────\n\n'
BLOCKS=""
CONTEXTS=""
INTEGRITY=0
HELPER_INDEX=0

integrity_failure() {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT CONTRACT DISPATCH FAILURE: %s\n' "$1" >&2
  INTEGRITY=1
}

for helper in \
  "$LIB_DIR/_peoplepicker_ssot_drift.sh" \
  "$LIB_DIR/_pixel_quantified_audit.sh" \
  "$LIB_DIR/_field_controls_contracts.sh" \
  "$LIB_DIR/_select_all_canonical.sh"; do
  helper_name="$(basename "$helper")"
  if [ ! -f "$helper" ] || [ -L "$helper" ]; then
    integrity_failure "required helper 缺失、symlink 或不是一般檔案: $helper_name"
    continue
  fi
  HELPER_INDEX=$((HELPER_INDEX + 1))
  child_stdout="$CAPTURE_DIR/$HELPER_INDEX.stdout"
  child_stderr="$CAPTURE_DIR/$HELPER_INDEX.stderr"
  printf '%s' "$INPUT" | bash "$helper" >"$child_stdout" 2>"$child_stderr"
  rc=$?
  case "$rc" in
    0)
      if [ -s "$child_stderr" ]; then
        integrity_failure "helper $helper_name exit 0 卻寫 stderr(只提醒的舊寫法不算數)"
        continue
      fi
      [ -s "$child_stdout" ] || continue
      if ! jq -e -s '
        length == 1
        and (.[0] |
          type == "object"
          and keys == ["governanceContext"]
          and (.governanceContext |
            type == "object"
            and (keys | sort) == ["hookEventName", "message"]
            and .hookEventName == "PostToolUse"
            and (.message | type == "string" and length > 0)))
      ' "$child_stdout" >/dev/null 2>&1; then
        integrity_failure "helper $helper_name exit 0 的 stdout 不是單一 PostToolUse governanceContext"
        continue
      fi
      message=$(jq -er '.governanceContext.message' "$child_stdout") || {
        integrity_failure "helper $helper_name context 無法解碼"
        continue
      }
      CONTEXTS="${CONTEXTS:+$CONTEXTS$SEPARATOR}$message"
      ;;
    2)
      if [ -s "$child_stdout" ] || ! grep -q '[^[:space:]]' "$child_stderr" 2>/dev/null \
        || grep -qF 'GOVERNANCE_INTEGRITY' "$child_stderr" 2>/dev/null; then
        [ -s "$child_stderr" ] && cat "$child_stderr" >&2
        integrity_failure "helper $helper_name exit 2 必須是 stderr-only、非空、不帶 integrity 標記的擋"
        continue
      fi
      BLOCKS="${BLOCKS:+$BLOCKS$SEPARATOR}$(cat "$child_stderr")"
      ;;
    70)
      if [ -s "$child_stderr" ] && [ ! -s "$child_stdout" ]; then
        cat "$child_stderr" >&2
      fi
      integrity_failure "helper $helper_name 回報量具失效(exit 70)"
      ;;
    *)
      integrity_failure "helper $helper_name 回傳非預期 exit code $rc"
      ;;
  esac
done

if [ "$INTEGRITY" -ne 0 ]; then
  # 量具壞了優先於擋:不讀成單純擋,也不讀成通過;同一輪已收到的擋照樣列出,免得修完量具才發現。
  [ -n "$BLOCKS" ] && printf '%s\n' "$BLOCKS" >&2
  exit 70
fi

if [ -n "$BLOCKS" ]; then
  if [ -n "$CONTEXTS" ]; then
    printf '%s%s%s\n' "$BLOCKS" "$SEPARATOR" "$CONTEXTS" >&2
  else
    printf '%s\n' "$BLOCKS" >&2
  fi
  exit 2
fi

if [ -n "$CONTEXTS" ]; then
  jq -n --arg ctx "$CONTEXTS" '{governanceContext:{hookEventName:"PostToolUse",message:$ctx}}' 2>/dev/null || {
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT CONTRACT DISPATCH FAILURE: 合併的 context 無法編碼\n' >&2
    exit 70
  }
fi
exit 0
