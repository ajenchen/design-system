#!/bin/bash
# Note: This file is SOURCED by other hooks. Do NOT add `set -u` / `set -e` /
# `pipefail` here — `source` runs in caller shell and propagates flags,
# breaking caller code that legitimately reads unset vars (e.g. ${VIOLATIONS}
# accumulator pattern). Caller hooks set their own flags as standalone scripts.
#
# Shared helper: log per-hook fire to .claude/logs/hook-fires-per-hook.jsonl
#
# Why: enables /knowledge-prune D2 dead-hook detection(6 月 0 fire → retire 提名)。
# 各 hook 在 top-of-file source 本檔 + 呼叫 `log_hook_fire`。
#
# 與 hook-fires.jsonl 分離:後者記 governance-file edits(tool+path),本 log 記
# per-hook fire(hook basename+ts)。兩 log 互補不重疊。
#
# 規則:silent on failure,不 block hook 執行。

log_hook_fire() {
  local hook_name="${1:-$(basename "${BASH_SOURCE[1]:-$0}")}"
  # Resolve project root from this helper's location(stable; cwd may be anywhere
  # depending on how Claude Code invokes the hook)to avoid stray .claude/ trees.
  local _self_dir
  _self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local _resolved_root="${_self_dir%/.claude/hooks}"
  local log_dir="${CLAUDE_PROJECT_DIR:-$_resolved_root}/.claude/logs"
  local log_file="$log_dir/hook-fires-per-hook.jsonl"

  mkdir -p "$log_dir" 2>/dev/null || return 0

  # Rotate if > 1 MB
  if [ -f "$log_file" ]; then
    local size
    size=$(wc -c < "$log_file" 2>/dev/null | tr -d ' ')
    if [ -n "$size" ] && [ "$size" -gt 1048576 ]; then
      # 2026-06-11 fix(prune D2 抓 data-loss):原 mv 同月二次 rotation 直接覆寫 archive
      # (實證 .202605 只存 5/31 六小時,5/31–6/10 數萬筆 fire 史遺失)→ append 後清空,不覆寫
      cat "$log_file" >> "${log_file}.$(date +%Y%m)" 2>/dev/null && : > "$log_file" || true
    fi
  fi

  printf '{"ts":"%s","hook":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$hook_name" \
    >> "$log_file" 2>/dev/null || true
}


