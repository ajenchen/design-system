#!/bin/bash
# chrome_header_dispatcher.sh — orchestrate 4 ChromeHeader-canonical lib helpers
#
# 2026-05-26 fold per Track C hook retire(39 → 36):4 個 PreToolUse hook 都
# enforce header-canonical.spec.md sub-invariants(consumption / app-shell / tabs-border / token-equal)。
# fold pattern 對齊 post_edit_dispatcher.sh 已建立的 lib/_*.sh helper convention(_ prefix 不計 hook 數)。
#
# SSOT canonical deterministic 4 helpers 均為 blocking enforcement。helper 缺失、被 symlink
# 取代或回傳未定義的非零 exit code 都是 enforcement integrity failure，必須 fail closed。
#
# 4 lib helpers:
#   _chrome_header_handcraft.sh        — Layer 3 consumption enforcement(自刻 chrome header className)
#   _app_shell_primary_header_consistency.sh — primary-header layout 必傳 globalHeader prop
#   _header_with_tabs_border.sh        — Header + Tabs 必標 withTabs prop(border auto-suppress)
#   _tab_lg_chrome_header_equal.sh     — `--tab-height-lg` 必等 `--chrome-header-height` token
#
# Each helper:reads stdin INPUT,jq-parses tool_input.file_path,scope-filters。
# 本 dispatcher 把同一 stdin pipe 給 4 helpers 依序跑，不 aggregate stdout。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: 無法讀取 hook input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and (.tool_name | type == "string")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string")
' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: hook input 不是有效的 provider-neutral event\n' >&2
  exit 70
fi

LIB_DIR="$(dirname "$0")/lib"

WORST=0
CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/chrome-header-dispatch.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: 無法建立 output contract capture\n' >&2
  exit 70
}
trap 'rm -rf "$CAPTURE_DIR"' EXIT
HELPER_INDEX=0

# Blocking helpers(SSOT canonical deterministic:primary-header / withTabs border /
# token pixel equal / chrome-header handcraft)。
for helper in \
  "$LIB_DIR/_app_shell_primary_header_consistency.sh" \
  "$LIB_DIR/_header_with_tabs_border.sh" \
  "$LIB_DIR/_tab_lg_chrome_header_equal.sh" \
  "$LIB_DIR/_chrome_header_handcraft.sh"; do
  if [ ! -f "$helper" ] || [ -L "$helper" ]; then
    printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: required helper 缺失或不是一般檔案: %s\n' \
      "$(basename "$helper")" >&2
    WORST=70
    continue
  fi
  HELPER_INDEX=$((HELPER_INDEX + 1))
  CHILD_STDOUT="$CAPTURE_DIR/$HELPER_INDEX.stdout"
  CHILD_STDERR="$CAPTURE_DIR/$HELPER_INDEX.stderr"
  printf '%s' "$INPUT" | bash "$helper" >"$CHILD_STDOUT" 2>"$CHILD_STDERR"
  rc=$?
  case "$rc" in
    0)
      if [ -s "$CHILD_STDOUT" ] || [ -s "$CHILD_STDERR" ]; then
        printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: helper %s rc0 必須完全 silent\n' \
          "$(basename "$helper")" >&2
        WORST=70
      fi
      ;;
    2)
      if [ -s "$CHILD_STDERR" ] && [ ! -s "$CHILD_STDOUT" ]; then
        cat "$CHILD_STDERR" >&2
        if grep -qF 'GOVERNANCE_INTEGRITY' "$CHILD_STDERR"; then
          WORST=70
        else
          [ "$WORST" -eq 0 ] && WORST=2
        fi
      else
        printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: helper %s rc2 必須是 stderr-only nonempty blocker\n' \
          "$(basename "$helper")" >&2
        WORST=70
      fi
      ;;
    70)
      if [ -s "$CHILD_STDERR" ] && [ ! -s "$CHILD_STDOUT" ]; then
        cat "$CHILD_STDERR" >&2
      else
        printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: helper %s rc70 必須是 stderr-only nonempty integrity failure\n' \
          "$(basename "$helper")" >&2
      fi
      WORST=70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: CHROME HEADER ENFORCEMENT FAILURE: helper %s 回傳未定義 exit code %s\n' \
        "$(basename "$helper")" "$rc" >&2
      WORST=70
      ;;
  esac
done

exit $WORST
