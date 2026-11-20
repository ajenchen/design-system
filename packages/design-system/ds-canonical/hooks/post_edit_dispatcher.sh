#!/bin/bash
# post_edit_dispatcher.sh — orchestrate 5 lib helper rules (PostToolUse Write|Edit|MultiEdit)
#
# 2026-05-13 /knowledge-prune consolidation:
#   Per hook count budget(SSOT = session_start_governance_check.sh Check 7)
#   Pre-consolidation: 32 hooks → BLOCKER 30 cap breached
#   This dispatcher folds lib/_*.sh helpers into one hook registration
#   Lib helpers remain as standalone testable files (renamed `_*` per Unix internal-helper convention)
#   2026-11-04 退役 _layout_space_canonical.sh:它教的是 v1 的 block 相鄰判法(block 相鄰 = tight、inline ↔ inline = loose),
#   且用 grep -m 截斷;間距看 layoutSpace.spec.md 規則 3 親疏。檔案留在 hooks/retired/。
#
# D4-02 審計(2026-11-18 起,依 user 2026-05-27 永久指令 governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md
# 「Decision tree(寫 hook 前自問)」逐支判原本的 8 支 advisory helper):
#   - 留下的 5 支 = 下方迴圈列的那 5 支,全部升為會擋;各自的判定(執法等級 + 理由)只寫在該 helper 檔頭第 2 行,這裡不重抄。
#   - 退場的 3 支(判不出規格說的那件事 → 回到規格當指引,不留 helper;檔案已刪):
#     _hardcoded_strings.sh  —— 規範是「文案可被覆寫」(packages/design-system/src/lib/i18n/README.md「Fallback chain」:prop → I18nProvider → DS 預設中文;
#        元件逐步 opt-in,不是每個字串都要接),它量的是「有 3 個以上中文字的字串沒標 i18n-allow」—— 有 fallback 的預設字串照樣被抓、
#        標了 i18n-allow 卻不能覆寫的照樣放行。2026-11-20 全樹唯讀 16 檔命中:7 檔是 _demo / 探針 / 量測面板;其餘混著
#        有後備的具名預設值(BulkActionBar 的 BULK_ACTION_BAR_DEFAULT_LABELS、Avatar 的 DEFAULT_HOVER_TRIGGER_LABEL —— 照規格可覆寫,卻被抓)、
#        還沒 opt-in 的 aria-label(DataTable 拖曳把手、FileUpload 清單等 —— README 說逐元件 opt-in,不是違規)、
#        開發用 console 訊息(TreeView)與 className 字串裡的註解(AccountMenu)。
#     _person_data_richness.sh —— 規範(packages/design-system/src/components/ProfileCard/profile-card.spec.md「DS-wide PersonData 預設展示一致 canonical」)講的是
#        「展示 ProfileCard 時 description / fields 要給」;它量的是單行 `{ name, avatarUrl }` 字面值,判不出是否會展示 ProfileCard,
#        訊息還要求已改成 opt-in 的 status / statusMessage、指向的 NameCard 規格已改名成 ProfileCard。2026-11-20 全樹 0 命中。
#     _cva_default_sync.sh —— 只要編輯碰到 cva 就印同一句「去核對三方」,算出來的三份預設值從沒拿來比;沒有偵測。
#        spec frontmatter 沒有結構化的預設值欄位(只有 `when:` 散文裡的「預設」),三方漂移(cva ↔ spec ↔ anatomy)由 design-system-audit dim 1 稽核。
#
# 輸出契約(registrations.json outputMode = governance-context-or-block):
#   - 每支 helper:exit 0 不出聲 / exit 0 + stdout 一個 PostToolUse governanceContext(既有違規清單)/
#     exit 2 + 只寫 stderr(這次新增的違規)/ exit 70 + GOVERNANCE_INTEGRITY(量具失效)。
#   - 任一支 exit 2 → 本 dispatcher exit 2,stderr = 所有擋的理由,後面附其他 helper 的既有違規。
#   - 沒有擋、有既有違規 → stdout 一個合併的 governanceContext。
#   - helper 缺失 / 被換成 symlink / 寫 raw stderr / 輸出 malformed / 回傳未定義的 exit code /
#     exit 2 卻寫 stdout 或沒理由 → enforcement-integrity failure,exit 70(fail closed)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: 無法讀取 canonical event envelope\n' >&2
  exit 70
}
HOOKS_DIR="$(dirname "$0")"
LIB_DIR="$HOOKS_DIR/lib"

# A registered PostToolUse dispatcher must never reinterpret malformed or misrouted input as a
# clean result. Provider adapters normalize aliases before invoking this canonical hook.
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and .hook_event_name == "PostToolUse"
  and (.tool_name == "Write" or .tool_name == "Edit" or .tool_name == "MultiEdit")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string" and length > 0)
' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: malformed or wrong-event canonical envelope\n' >&2
  exit 70
fi

CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/post-edit-dispatcher.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: 無法建立 helper output capture\n' >&2
  exit 70
}
trap 'rm -rf -- "$CAPTURE_DIR"' EXIT HUP INT TERM

# Aggregate governance context fragments(既有違規)and block reasons(這次新增的違規)
COMBINED=""
BLOCKS=""

append_context() {
  if [ -z "$COMBINED" ]; then
    COMBINED="$1"
  else
    COMBINED="${COMBINED}"$'\n\n────────\n\n'"$1"
  fi
}

run_helper() {
  local helper="$1"
  local helper_name
  helper_name="$(basename "$helper")"
  if [ ! -f "$helper" ] || [ -L "$helper" ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: required helper 缺失、symlink 或不是一般檔案: %s\n' \
      "$helper_name" >&2
    return 70
  fi

  local stdout_file="$CAPTURE_DIR/stdout"
  local stderr_file="$CAPTURE_DIR/stderr"
  : >"$stdout_file"
  : >"$stderr_file"

  printf '%s' "$INPUT" | bash "$helper" >"$stdout_file" 2>"$stderr_file"
  local rc=$?
  case "$rc" in
    0) ;;
    2)
      # 擋:只准 stderr、而且要有理由;帶保留的 integrity 標記 = 不是政策擋,是量具失效。
      if [ -s "$stdout_file" ] || ! grep -q '[^[:space:]]' "$stderr_file" 2>/dev/null \
        || grep -qF 'GOVERNANCE_INTEGRITY' "$stderr_file" 2>/dev/null; then
        printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s exit 2 必須是 stderr-only、非空、不帶 integrity 標記的擋\n' \
          "$helper_name" >&2
        return 70
      fi
      if [ -z "$BLOCKS" ]; then
        BLOCKS="$(cat "$stderr_file")"
      else
        BLOCKS="${BLOCKS}"$'\n\n────────\n\n'"$(cat "$stderr_file")"
      fi
      return 0
      ;;
    70)
      if [ -s "$stderr_file" ] && [ ! -s "$stdout_file" ] && grep -qF 'GOVERNANCE_INTEGRITY' "$stderr_file" 2>/dev/null; then
        cat "$stderr_file" >&2
      fi
      printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s 回報量具失效(exit 70)\n' "$helper_name" >&2
      return 70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s 回傳非預期 exit code %s\n' \
        "$helper_name" "$rc" >&2
      return 70
      ;;
  esac
  if [ -s "$stderr_file" ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s 產生 raw stderr\n' \
      "$helper_name" >&2
    return 70
  fi
  [ -s "$stdout_file" ] || return 0

  # One helper may emit exactly one provider-neutral context object. Reject native envelopes,
  # multiple JSON values, extra fields, empty messages, and an event name other than PostToolUse.
  if ! jq -e -s '
    length == 1
    and (.[0] |
      type == "object"
      and keys == ["governanceContext"]
      and (.governanceContext |
        type == "object"
        and (keys | sort) == ["hookEventName", "message"]
        and .hookEventName == "PostToolUse"
        and (.message | type == "string" and length > 0)
      )
    )
  ' "$stdout_file" >/dev/null 2>&1; then
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s 輸出 malformed or wrong-event envelope\n' \
      "$helper_name" >&2
    return 70
  fi

  local ctx
  ctx=$(jq -er '.governanceContext.message' "$stdout_file") || {
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: helper %s context 無法解碼\n' \
      "$helper_name" >&2
    return 70
  }
  append_context "$ctx"
}

# Run 5 helpers sequentially;每一支都跑完才決定結果(擋的理由與既有清單一次給齊)
for helper in \
  "$LIB_DIR/_token_hygiene.sh" \
  "$LIB_DIR/_code_quality.sh" \
  "$LIB_DIR/_overlay_handcraft.sh" \
  "$LIB_DIR/_story_compile_drift.sh" \
  "$LIB_DIR/_governance_coverage_check.sh"; do
  run_helper "$helper"
  helper_rc=$?
  [ "$helper_rc" -eq 0 ] || exit 70
done

if [ -n "$BLOCKS" ]; then
  if [ -n "$COMBINED" ]; then
    printf '%s\n\n────────\n\n%s\n' "$BLOCKS" "$COMBINED" >&2
  else
    printf '%s\n' "$BLOCKS" >&2
  fi
  exit 2
fi

if [ -n "$COMBINED" ]; then
  ESCAPED=$(printf '%s' "$COMBINED" | jq -Rs .) || {
    printf '🚨 GOVERNANCE_INTEGRITY: POST-EDIT DISPATCH FAILURE: combined context 無法編碼\n' >&2
    exit 70
  }
  printf '{"governanceContext":{"hookEventName":"PostToolUse","message":%s}}\n' "$ESCAPED"
fi

exit 0
