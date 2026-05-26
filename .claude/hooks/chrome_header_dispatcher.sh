#!/bin/bash
# chrome_header_dispatcher.sh — orchestrate 4 ChromeHeader-canonical lib helpers
#
# 2026-05-26 fold per Track C hook retire(39 → 36):4 個 PreToolUse hook 都
# enforce header-canonical.spec.md sub-invariants(consumption / app-shell / tabs-border / token-equal),
# 都是 P1 soft warn(exit 0,stderr-only)。fold pattern 對齊 post_edit_dispatcher.sh
# 已建立的 lib/_*.sh helper convention(_ prefix excluded from hook count)。
#
# 4 lib helpers:
#   _chrome_header_handcraft.sh        — Layer 3 consumption enforcement(自刻 chrome header className)
#   _app_shell_primary_header_consistency.sh — primary-header layout 必傳 globalHeader prop
#   _header_with_tabs_border.sh        — Header + Tabs 必標 withTabs prop(border auto-suppress)
#   _tab_lg_chrome_header_equal.sh     — `--tab-height-lg` 必等 `--chrome-header-height` token
#
# Each helper:reads stdin INPUT,jq-parses tool_input.file_path,scope-filters,
# 印 stderr soft warn,exit 0。本 dispatcher 把同一 stdin pipe 給 4 helpers 依序跑,
# 不 aggregate stdout(本系列 helper 不 emit additionalContext,純 stderr 給人讀)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
LIB_DIR="$(dirname "$0")/lib"

for helper in \
  "$LIB_DIR/_chrome_header_handcraft.sh" \
  "$LIB_DIR/_app_shell_primary_header_consistency.sh" \
  "$LIB_DIR/_header_with_tabs_border.sh" \
  "$LIB_DIR/_tab_lg_chrome_header_equal.sh"; do
  [ -f "$helper" ] || continue
  # Pipe same INPUT to helper. stderr propagates(soft warn). stdout discarded(no additionalContext).
  printf '%s' "$INPUT" | bash "$helper" 2>&1 1>/dev/null || true
done

exit 0
