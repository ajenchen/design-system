#!/bin/bash
# Note: This file is SOURCED by other hooks. Do NOT add `set -u` / `set -e` /
# `pipefail` here — `source` runs in caller shell and propagates flags,
# breaking caller code that legitimately reads unset vars (e.g. ${VIOLATIONS}
# accumulator pattern). Caller hooks set their own flags as standalone scripts.
#
# Shared helper: resolve a provider-neutral runtime state directory and log per-hook fire there;
# also resolves the separate enforcement-state directory that gates read back to decide
#(governance_enforcement_state_dir,條件見下方「兩種寫入、兩道開關」)。
#
# Why: enables /knowledge-prune D2 dead-hook detection(6 月 0 fire → retire 提名;前提是觀測窗涵蓋分類窗,
#   遙測預設關 → 零筆是預設狀態不是證據,見 knowledge-prune SKILL D2)。
# 各 hook 在 top-of-file source 本檔 + 呼叫 `log_hook_fire`。
#
# 與 hook-fires.jsonl 分離:後者記 governance-file edits(tool+path),本 log 記
# per-hook fire(hook basename+ts)。兩 log 互補不重疊。
#
# 規則:silent on failure,不 block hook 執行。

_governance_safe_runtime_path() {
  python3 - "$1" "$2" <<'PY'
import os
import sys

root_input = os.path.abspath(sys.argv[1])
target_input = os.path.abspath(sys.argv[2])

# macOS exposes /var and /tmp through system symlink aliases while Git reports
# their physical /private/... spelling.  Compare physical paths so two names
# for the same Git-owned directory are not mistaken for an escape.
root = os.path.realpath(root_input)
target = os.path.realpath(target_input)
try:
    if os.path.commonpath([root, target]) != root:
        raise ValueError('escape')
except ValueError:
    raise SystemExit(2)

# Permit only aliases that are ancestors of the Git-owned root(e.g. macOS
# /var -> /private/var).  A symlink at, or anywhere below, the runtime root is
# attacker-controlled runtime state and must fail closed even when it points
# back inside the repository.
cursor = os.path.sep
for segment in target_input.split(os.sep)[1:]:
    cursor = os.path.join(cursor, segment)
    if not os.path.lexists(cursor) or not os.path.islink(cursor):
        continue
    resolved = os.path.realpath(cursor)
    try:
        inside_runtime = os.path.commonpath([root, resolved]) == root
    except ValueError:
        inside_runtime = False
    if inside_runtime:
        raise SystemExit(2)
print(target)
PY
}

# 兩種寫入、兩道開關(2026-11-18 WP-05 分開;之前兩者共用遙測開關):
#
#   遙測(telemetry)—— governance_runtime_state_dir:
#     hook 觸發次數、編輯紀錄這類「觀察用」資料。永遠不是預設:沒有 GOVERNANCE_TELEMETRY_OPT_IN=1
#     就一個 byte 都不寫,一般 session 也一樣。
#
#   功能狀態(enforcement state)—— governance_enforcement_state_dir:
#     閘自己要靠它才能判定的狀態,例如 check_solo_workflow.sh R1 的「本 session 已開的分支」、
#     各閘 GOVERNANCE_BYPASS_* 的稽核紀錄。綁在遙測開關上 = 預設關 = 閘預設失效(R1 從開遙測才擋
#     那天起就是這樣,2026-11-18 knowledge-prune D4-01 / D5-01 抓到)。所以它不看遙測開關,只在下列
#     三個條件都成立時可寫:
#       (1) GOVERNANCE_READ_ONLY ≠ 1(CI replay、hooks:test 的 run-all.sh 都設 1 → 照舊完全唯讀);
#       (2) GOVERNANCE_RUNTIME_ROOT 由啟動 hook 的 adapter 明確給定(scripts/run-provider-hook.mjs 與
#           fork-governance-dispatcher.sh 一定會設;直接手動跑 hook 沒有 → 照舊唯讀);
#       (3) 那個 root 正是本 repo Git 目錄下的 governance-runtime(與遙測同一套路徑驗證:拒 symlink、
#           檔案層再拒 hard link / 非一般檔)。managed host 刻意給的停用 root
#           (.managed-governance-runtime-disabled)不符 → 照舊唯讀。
#     寫的位置只在 .git 裡面,永遠不會變成 repo 追蹤的檔案。

# Shared resolver: READ_ONLY gate + exact Git-owned runtime root + safe GOVERNANCE_STATE_DIR.
# Callers decide which switch (telemetry opt-in / adapter-provided runtime root) admits them.
_governance_resolve_runtime_state_dir() {
  [ "${GOVERNANCE_READ_ONLY:-0}" != "1" ] || return 1
  # Resolve the repository root without assuming a provider discovery path. Canonical hooks run
  # below ds-canonical/, while generated Claude views run below .claude/; suffix stripping alone
  # would write runtime telemetry into the immutable canonical source tree.
  local _self_dir
  _self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local _resolved_root="${GOVERNANCE_PROJECT_DIR:-}"
  if [ -z "$_resolved_root" ]; then
    _resolved_root="$(git -C "$_self_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  [ -n "$_resolved_root" ] && [ -d "$_resolved_root" ] || return 1

  local _git_dir _runtime_parent _allowed_root _runtime_root _state_dir
  _git_dir="$(git -C "$_resolved_root" rev-parse --absolute-git-dir 2>/dev/null || true)"
  # Runtime evidence is meaningful only when owned by a concrete Git repository.
  # A no-Git temp fallback would silently create a second authority and is forbidden.
  [ -n "$_git_dir" ] || return 1
  _runtime_parent="$(cd "$_git_dir" 2>/dev/null && pwd -P)" || return 1
  _allowed_root="$_runtime_parent/governance-runtime"
  _runtime_root="${GOVERNANCE_RUNTIME_ROOT:-$_allowed_root}"
  _runtime_root="$(_governance_safe_runtime_path "$_runtime_parent" "$_runtime_root" 2>/dev/null)" || return 1
  [ "$_runtime_root" = "$_allowed_root" ] || return 1
  _state_dir="${GOVERNANCE_STATE_DIR:-$_runtime_root}"
  _state_dir="$(_governance_safe_runtime_path "$_runtime_root" "$_state_dir" 2>/dev/null)" || return 1
  printf '%s\n' "$_state_dir"
}

governance_runtime_state_dir() {
  # Telemetry is never implicit. CI, direct hook probes, and ordinary provider sessions write no
  # telemetry byte unless their trusted adapter/caller explicitly opts in.
  [ "${GOVERNANCE_TELEMETRY_OPT_IN:-0}" = "1" ] || return 1
  _governance_resolve_runtime_state_dir
}

governance_enforcement_state_dir() {
  # Enforcement state never consults the telemetry switch (see header above). An adapter-provided
  # runtime root is the admission ticket; direct probes have none and stay read-only. The resolver
  # still rejects READ_ONLY=1 and any root other than the exact Git-owned governance-runtime.
  [ -n "${GOVERNANCE_RUNTIME_ROOT:-}" ] || return 1
  _governance_resolve_runtime_state_dir
}

_governance_prepare_state_dir_with() {
  local _resolver="$1" _state_dir _revalidated
  _state_dir="$("$_resolver" 2>/dev/null)" || return 1
  mkdir -p -- "$_state_dir" 2>/dev/null || return 1
  # Revalidate after creation so an existing or concurrently substituted
  # symlink never becomes an accepted runtime directory.
  _revalidated="$("$_resolver" 2>/dev/null)" || return 1
  [ "$_state_dir" = "$_revalidated" ] || return 1
  [ -d "$_state_dir" ] && [ ! -L "$_state_dir" ] || return 1
  printf '%s\n' "$_state_dir"
}

governance_prepare_runtime_state_dir() {
  _governance_prepare_state_dir_with governance_runtime_state_dir
}

governance_prepare_enforcement_state_dir() {
  _governance_prepare_state_dir_with governance_enforcement_state_dir
}

governance_runtime_file_path() {
  local _name="${1:-}" _state_dir="${2:-}" _candidate
  case "$_name" in ""|.|..) return 1 ;; esac
  printf '%s' "$_name" | grep -qE '^[A-Za-z0-9.][A-Za-z0-9._-]*$' || return 1
  [ -n "$_state_dir" ] || _state_dir="$(governance_runtime_state_dir 2>/dev/null)" || return 1
  _candidate="$(_governance_safe_runtime_path "$_state_dir" "$_state_dir/$_name" 2>/dev/null)" || return 1
  # Reject pre-existing aliases, devices, FIFOs, sockets, and hard-linked files.
  # Telemetry must never mutate another inode through a poisoned filename.
  python3 - "$_candidate" <<'PY' >/dev/null 2>&1 || return 1
import os
import stat
import sys

path = sys.argv[1]
if os.path.lexists(path):
    info = os.lstat(path)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise SystemExit(2)
PY
  printf '%s\n' "$_candidate"
}

# Append one line to an enforcement-state file(governance_enforcement_state_dir 的條件不成立 → 不寫、回 1)。
# 在子 shell 裡標 GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1:這筆寫入成敗不改變「這一次」的判定
#(bypass 照樣放行、第一條分支照樣放行),所以缺 python3 寫不成時,不能讓 adapter 把整支閘當成看不見
#(與 log_hook_fire 同一個理由,G4 複核二)。要靠狀態「判定」的讀取端(R1 查同 session 舊分支)不走這裡。
governance_append_enforcement_record() {
  local _name="${1:-}" _line="${2:-}"
  ( GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1
    export GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL
    _dir="$(governance_prepare_enforcement_state_dir 2>/dev/null)" || exit 1
    _file="$(governance_runtime_file_path "$_name" "$_dir" 2>/dev/null)" || exit 1
    printf '%s\n' "$_line" >> "$_file" 2>/dev/null )
}

log_hook_fire() {
  local hook_name="${1:-$(basename "${BASH_SOURCE[1]:-$0}")}"
  # 紀錄是旁路(本檔規則:失敗不影響 hook)。在子 shell 裡標 GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1,
  # 讓 scripts/run-provider-hook.mjs 的缺工具探針不把這裡的 python3 呼叫算成「這支 hook 需要 python3」——
  # 否則開了紀錄又缺 python3 時,只是紀錄寫不成,核准閘就被當成跑不起來而擋下工程改動(G4 複核二,2026-10-07)。
  ( GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1
    export GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL
    _governance_log_hook_fire "$hook_name" )
  return 0
}

_governance_log_hook_fire() {
  local hook_name="$1"
  local log_dir log_file archive_file
  log_dir="$(governance_prepare_runtime_state_dir 2>/dev/null)" || return 0
  log_file="$(governance_runtime_file_path hook-fires-per-hook.jsonl "$log_dir" 2>/dev/null)" || return 0

  # Rotate if > 1 MB
  if [ -f "$log_file" ]; then
    local size
    size=$(wc -c < "$log_file" 2>/dev/null | tr -d ' ')
    if [ -n "$size" ] && [ "$size" -gt 1048576 ]; then
      # 2026-06-11 fix(prune D2 抓 data-loss):原 mv 同月二次 rotation 直接覆寫 archive
      # (實證 .202605 只存 5/31 六小時,5/31–6/10 數萬筆 fire 史遺失)→ append 後清空,不覆寫
      archive_file="$(governance_runtime_file_path "hook-fires-per-hook.jsonl.$(date +%Y%m)" "$log_dir" 2>/dev/null)" || return 0
      cat "$log_file" >> "$archive_file" 2>/dev/null && : > "$log_file" || true
    fi
  fi

  printf '{"ts":"%s","hook":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$hook_name" \
    >> "$log_file" 2>/dev/null || true
}
