#!/bin/bash
# stop_passive_logging.sh — Cluster B partial merge(2026-05-10,extended 2026-05-13)
#
# Per codex mega review Q-16 + Layer A own scope decision:
#   Merges 5 stop hooks into 1 mega dispatcher with 5 internal functions:
#     R1 tsc_sanity(原 lib/stop_tsc_sanity.sh) — tsc -b error count log
#     R2 harvest_corrections(原 lib/stop_harvest_corrections.sh) — user 糾正 keyword 偵測
#     R3 capture_metrics(原 lib/stop_capture_metrics.sh) — 24h dedup metric snapshot
#     R4 governance_drift(原 lib/stop_governance_drift_check.sh) — gov file edit + size check
#     R5 infra_best_practice_score(原 stop_meta_self_audit.sh,2026-05-13 fold)
#        — score-infra-best-practice.mjs regression / dim < 80 log
#        rationale:silent log only(per stop_meta L66 comment),不 inject blocker,
#        與 R1-R4 同質(passive log)→ 同 dispatcher 合理。Hook count 25 → 24。
#
# Layer A own 撞 codex Q-16:
#   Codex 推「Cluster B not same commit as Cluster A」cautious due to Stop event exit precedence。
#   我撞:Cluster A pattern 已 verified work。BUT root stop_self_audit + stop_meta_self_audit
#   留 standalone(those 含 BLOCKER detection 邏輯,exit 2 影響 turn)。
#   本 dispatcher 只 merge 4 lib non-blocking hooks(全 silent / log-only)。
#
# All 4 functions are exit 0(non-blocking),safe to chain in single dispatcher。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_PROVIDER_RESOLVER_UNAVAILABLE\n' >&2
  exit 70
}

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0
STATE_DIR="$(governance_prepare_runtime_state_dir 2>/dev/null)" || exit 0

runtime_file() {
  governance_runtime_file_path "$1" "$STATE_DIR" 2>/dev/null
}

INSTRUCTION_ENTRY="$(governance_provider_string_field instructionEntry 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_INSTRUCTION_ENTRY_UNAVAILABLE\n' >&2
  exit 70
}
SHARED_INSTRUCTION_ENTRY="$(governance_provider_string_field sharedInstructionEntry 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_SHARED_INSTRUCTION_ENTRY_UNAVAILABLE\n' >&2
  exit 70
}
CANONICAL_HOOK_ROOT="$(governance_canonical_root hooks 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_HOOK_ROOT_UNAVAILABLE\n' >&2
  exit 70
}
CANONICAL_SKILL_ROOT="$(governance_canonical_root skills 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_SKILL_ROOT_UNAVAILABLE\n' >&2
  exit 70
}
PROVIDER_SKILL_REL="$(governance_provider_string_field skillDirectory 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_SKILL_DIRECTORY_UNAVAILABLE\n' >&2
  exit 70
}
CANONICAL_MANAGED_ROOTS=()
for key in hooks skills contextForkAgents commands rules references; do
  root="$(governance_canonical_relative_root "$key" 2>/dev/null)" || {
    printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_CANONICAL_ROOT_UNAVAILABLE:%s\n' "$key" >&2
    exit 70
  }
  CANONICAL_MANAGED_ROOTS+=("$root")
done
PROVIDER_MANAGED_ROOTS=()
MANAGED_ROOTS="$(governance_provider_managed_roots 2>/dev/null)" || {
  printf 'GOVERNANCE_INTEGRITY:PASSIVE_LOGGING_MANAGED_ROOTS_UNAVAILABLE\n' >&2
  exit 70
}
while IFS= read -r root; do
  [ -n "$root" ] && PROVIDER_MANAGED_ROOTS+=("$root")
done <<< "$MANAGED_ROOTS"

is_governance_change() {
  local changed="${1#./}" root
  case "$changed" in
    "$INSTRUCTION_ENTRY"|"$SHARED_INSTRUCTION_ENTRY"|governance/memory/*.md|*.spec.md) return 0 ;;
  esac
  for root in "${CANONICAL_MANAGED_ROOTS[@]}"; do
    governance_path_is_under "$changed" "$root" && return 0
  done
  for root in "${PROVIDER_MANAGED_ROOTS[@]}"; do
    governance_path_is_under "$changed" "$root" && return 0
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# R1 — tsc sanity(原 lib/stop_tsc_sanity.sh):若 turn 動 .ts/.tsx → tsc -b log
# ─────────────────────────────────────────────────────────────────────────────
rule_tsc_sanity() {
  [ -z "$TRANSCRIPT_PATH" ] && return 0
  [ -f "$TRANSCRIPT_PATH" ] || return 0

  local touched
  touched=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null \
    | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | select(.name=="Edit" or .name=="Write" or .name=="MultiEdit") | .input.file_path // empty' 2>/dev/null \
    | grep -E '\.(ts|tsx)$' \
    | awk 'NR == 1 { first = $0 } END { if (first != "") print first }' || echo "")

  [ -z "$touched" ] && return 0

  local tsc_output error_lines error_count sample
  tsc_output=$(timeout 60 npx tsc -b --noEmit --pretty false 2>&1 || true)
  error_lines=$(echo "$tsc_output" | grep "error TS" || true)
  error_count=$(echo "$error_lines" | grep -c "error TS" || true)
  error_count=${error_count:-0}

  if [ "$error_count" -gt 0 ]; then
    local tsc_log
    tsc_log="$(runtime_file tsc-errors.jsonl)" || return 0
    sample=$(sed -n '1,3p' <<<"$error_lines")
    printf '{"ts":"%s","tsc_errors":%s,"sample":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$error_count" \
      "$(echo "$sample" | jq -Rs .)" \
      >> "$tsc_log" 2>/dev/null || true
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# R2 — harvest user corrections(原 lib/stop_harvest_corrections.sh)
# ─────────────────────────────────────────────────────────────────────────────
rule_harvest_corrections() {
  [ -z "$TRANSCRIPT_PATH" ] && return 0
  [ -f "$TRANSCRIPT_PATH" ] || return 0

  local log_dir log_file archive_file tmp_file
  log_dir="$STATE_DIR"
  log_file="$(runtime_file user-corrections.jsonl)" || return 0

  # Rotate if > 1 MB
  if [ -f "$log_file" ]; then
    local size
    size=$(wc -c < "$log_file" | tr -d ' ')
    if [ "$size" -gt 1048576 ]; then
      archive_file="$(runtime_file "user-corrections.jsonl.$(date +%Y%m)")" || return 0
      mv "$log_file" "$archive_file"
    fi
  fi

  local timestamp corrections count escaped
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  corrections=$(tail -500 "$TRANSCRIPT_PATH" 2>/dev/null \
    | jq -r 'select(.type=="user") | .message.content? // empty | if type=="string" then . else (.[]? | select(.type=="text") | .text) end' 2>/dev/null \
    | grep -E '不是|不對|錯了|應該|糾正|為什麼沒|先不管|之後再|別再|不要' \
    | awk 'NR <= 5' || true)

  [ -z "$corrections" ] && return 0

  # Dedup by session
  if [ -f "$log_file" ]; then
    tmp_file="$(runtime_file user-corrections.jsonl.tmp)" || return 0
    grep -v "\"session\":\"$SESSION_ID\"" "$log_file" > "$tmp_file" 2>/dev/null || true
    [ -f "$tmp_file" ] && mv -f "$tmp_file" "$log_file"
  fi

  count=$(echo "$corrections" | wc -l | tr -d ' ')
  escaped=$(sed -n '1,2p' <<<"$corrections" | jq -Rs .)
  printf '{"ts":"%s","session":"%s","count":%s,"sample":%s}\n' \
    "$timestamp" "$SESSION_ID" "$count" "$escaped" >> "$log_file"
}

# ─────────────────────────────────────────────────────────────────────────────
# R3 — capture metrics 24h dedup(原 lib/stop_capture_metrics.sh)
# ─────────────────────────────────────────────────────────────────────────────
rule_capture_metrics() {
  local snapshot_file
  snapshot_file="$(runtime_file metric-snapshots.jsonl)" || return 0

  # 24h dedup
  if [ -f "$snapshot_file" ]; then
    local last_ts last_epoch now_epoch diff
    last_ts=$(tail -1 "$snapshot_file" 2>/dev/null | jq -r '.ts // empty' 2>/dev/null || echo "")
    if [ -n "$last_ts" ]; then
      last_epoch=$(date -u -d "$last_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_ts" +%s 2>/dev/null || echo 0)
      now_epoch=$(date -u +%s)
      diff=$(( now_epoch - last_epoch ))
      [ "$diff" -lt 86400 ] && return 0
    fi
  fi

  # Capture metrics
  local instruction_lines=0 entry seen=""
  for entry in "$INSTRUCTION_ENTRY" "$SHARED_INSTRUCTION_ENTRY"; do
    case "$entry" in ""|/*|*..*) continue ;; esac
    case "|$seen|" in *"|$entry|"*) continue ;; esac
    seen="${seen:+$seen|}$entry"
    [ -f "$entry" ] && instruction_lines=$((instruction_lines + $(wc -l < "$entry" | tr -d ' ')))
  done

  local repo_memory_dir memory_dir memory_entries=0
  repo_memory_dir="governance/memory"
  if [ -d "$repo_memory_dir" ]; then
    memory_dir="$repo_memory_dir"
  else
    memory_dir=""
  fi
  if [ -n "$memory_dir" ] && [ -d "$memory_dir" ]; then
    memory_entries=$(find "$memory_dir" -maxdepth 1 -name '*.md' -not -name 'MEMORY.md' -not -name 'README.md' 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  fi

  local hooks_total=0 hooks_dir="$CANONICAL_HOOK_ROOT"
  if printf '%s' "${GOVERNANCE_REGISTERED_HOOK_COUNT:-}" | grep -qE '^[0-9]+$'; then
    hooks_total="$GOVERNANCE_REGISTERED_HOOK_COUNT"
  elif [ -d "$hooks_dir" ]; then
    hooks_total=$(find "$hooks_dir" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.py' \) 2>/dev/null \
      | grep -vE '(_log-fire\.sh)' | wc -l | tr -d ' ' || echo 0)
  fi

  local skills_total=0 skill_dir="$PROJECT_DIR/$PROVIDER_SKILL_REL"
  [ -d "$skill_dir" ] || skill_dir="$CANONICAL_SKILL_ROOT"
  if [ -d "$skill_dir" ]; then
    skills_total=$(find "$skill_dir" -maxdepth 1 -type d 2>/dev/null | tail -n +2 | wc -l | tr -d ' ' || echo 0)
  fi

  local tested=0
  if [ -d "$hooks_dir/tests" ]; then
    tested=$(find "$hooks_dir/tests" -maxdepth 1 -name 'test_*.sh' 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  fi
  # Defensive: strip non-digit chars (multiline / fallback "0\n0" from pipefail edge case)
  hooks_total="${hooks_total//[^0-9]/}"
  hooks_total=${hooks_total:-0}
  tested="${tested//[^0-9]/}"
  tested=${tested:-0}
  local untested=$(( hooks_total - tested ))
  [ "$untested" -lt 0 ] && untested=0

  local last_prune_ts last_prune_days=-1 now
  last_prune_ts=$(git log --format='%ct' --grep='knowledge-prune\|prune:\|governance.*prune' -1 2>/dev/null || echo "")
  if [ -n "$last_prune_ts" ]; then
    now=$(date +%s)
    last_prune_days=$(( (now - last_prune_ts) / 86400 ))
  fi

  local corrections_log corrections=0
  corrections_log="$(runtime_file user-corrections.jsonl)" || return 0
  [ -f "$corrections_log" ] && corrections=$(wc -l < "$corrections_log" | tr -d ' ')

  local timestamp snapshot
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  snapshot=$(jq -nc \
    --arg ts "$timestamp" --arg tag "auto-daily" --arg sv "v3" \
    --argjson il "$instruction_lines" --argjson me "$memory_entries" \
    --argjson ht "$hooks_total" --argjson st "$skills_total" \
    --argjson uh "$untested" --argjson lpd "$last_prune_days" \
    --argjson c "$corrections" \
    '{ts:$ts, schema_version:$sv, tag:$tag, instruction_lines:$il, memory_entries:$me, hooks_total:$ht, skills_total:$st, untested_hooks:$uh, last_prune_days_ago:$lpd, corrections_pending:$c}')

  echo "$snapshot" >> "$snapshot_file"
}

# ─────────────────────────────────────────────────────────────────────────────
# R4 — governance drift check(原 lib/stop_governance_drift_check.sh)
# ─────────────────────────────────────────────────────────────────────────────
rule_governance_drift() {
  local head_now head_prev_file head_prev commits_made gov_edited
  head_now=$(git rev-parse HEAD 2>/dev/null || echo "")
  head_prev_file="$(runtime_file .stop-drift-last-head)" || return 0
  head_prev=""
  [ -f "$head_prev_file" ] && head_prev=$(cat "$head_prev_file" 2>/dev/null || echo "")

  commits_made="false"
  if [ -n "$head_now" ] && [ -n "$head_prev" ] && [ "$head_now" != "$head_prev" ]; then
    commits_made="true"
  fi

  gov_edited="false"
  while IFS= read -r changed; do
    if is_governance_change "$changed"; then
      gov_edited="true"
      break
    fi
  done < <(git diff --name-only HEAD 2>/dev/null)

  echo "$head_now" > "$head_prev_file" 2>/dev/null || true

  if [ "$commits_made" = "false" ] && [ "$gov_edited" = "false" ]; then
    return 0
  fi

  local warnings="" L entry seen=""
  for entry in "$INSTRUCTION_ENTRY" "$SHARED_INSTRUCTION_ENTRY"; do
    case "|$seen|" in *"|$entry|"*) continue ;; esac
    seen="${seen:+$seen|}$entry"
    [ -f "$entry" ] || continue
    L=$(wc -l < "$entry" | tr -d ' ')
    if [ "$L" -gt 800 ]; then
      warnings="${warnings}\n  • $entry ${L} lines(over 800 cap → /knowledge-prune REQUIRED)"
    elif [ "$L" -gt 600 ]; then
      warnings="${warnings}\n  • $entry ${L} lines(over 600 strong-warn)"
    elif [ "$L" -gt 500 ]; then
      warnings="${warnings}\n  • $entry ${L} lines(approaching 600)"
    fi
  done

  for f in packages/design-system/src/tokens/color/color.spec.md \
           packages/design-system/src/patterns/element-anatomy/item-anatomy.spec.md \
           packages/design-system/src/components/Sidebar/sidebar.spec.md \
           packages/design-system/src/components/TreeView/tree-view.spec.md; do
    [ -f "$f" ] || continue
    L=$(wc -l < "$f" | tr -d ' ')
    local cap
    case "$f" in
      */item-anatomy.spec.md) cap=1200 ;;
      # 2026-05-22 prune codify per shared bootstrap「foundational SSOT 例外 ≤ 800-1200」range
      */color/color.spec.md) cap=1000 ;;
      *) cap=800 ;;
    esac
    if [ "$L" -gt "$cap" ]; then
      warnings="${warnings}\n  • $f ${L} lines(over ${cap} cap)"
    fi
  done

  if [ "$gov_edited" = "true" ]; then
    local tsc_errors
    tsc_errors=$(npx tsc -b --noEmit --pretty false 2>&1 | grep -c "error TS" 2>/dev/null | tr -d '[:space:]' || echo 0)
    tsc_errors=${tsc_errors:-0}
    if [ "$tsc_errors" -gt 0 ] 2>/dev/null; then
      warnings="${warnings}\n  • tsc -b reports ${tsc_errors} errors(governance edit broke types)"
    fi
  fi

  [ -z "$warnings" ] && return 0

  local drift_log
  drift_log="$(runtime_file governance-drift.jsonl)" || return 0
  printf '{"ts":"%s","warnings":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(printf '%b' "$warnings" | jq -Rs .)" \
    >> "$drift_log" 2>/dev/null || true
}

# ─────────────────────────────────────────────────────────────────────────────
# R5 — infra best-practice score(原 stop_meta_self_audit.sh,2026-05-13 fold)
#   per-Stop scripts/score-infra-best-practice.mjs(8 dim,0-100)
#   regression / dim < 80 → log warning to provider-neutral runtime state
#   silent log only(no provider-native context transport)
# ─────────────────────────────────────────────────────────────────────────────
rule_infra_best_practice_score() {
  local log_file score_history_file
  log_file="$(runtime_file infra-best-practice-score.jsonl)" || return 0
  score_history_file="$(runtime_file score-history.jsonl)" || return 0
  local score_output current_score prev_score=0 warnings="" drop low_dims

  score_output=$(node scripts/score-infra-best-practice.mjs --json 2>/dev/null)
  [ -z "$score_output" ] && return 0

  current_score=$(echo "$score_output" | jq -r '.finalScore // 0' 2>/dev/null || echo 0)
  [ "$current_score" = "0" ] && return 0

  if [ -f "$log_file" ]; then
    prev_score=$(tail -2 "$log_file" | sed -n '1p' | jq -r '.finalScore // 0' 2>/dev/null || echo 0)
  fi

  # Trigger 1: regression(score dropped ≥ 5)
  if [ "$prev_score" -gt 0 ] && [ "$current_score" -lt "$prev_score" ]; then
    drop=$((prev_score - current_score))
    if [ "$drop" -ge 5 ]; then
      warnings="${warnings}\n  🚨 SCORE REGRESSION: ${prev_score} → ${current_score}(drop ${drop})"
    fi
  fi

  # Trigger 2: any dim < 80
  low_dims=$(echo "$score_output" | jq -r '.dimensions[] | select(.score < 80) | "\(.dim): \(.score)/100 (\(.value))"' 2>/dev/null)
  if [ -n "$low_dims" ]; then
    warnings="${warnings}\n  ⚠️  Sub-threshold dimensions:\n$(echo "$low_dims" | sed 's/^/    • /')"
  fi

  # Trigger 3: overall < 80
  if [ "$current_score" -lt 80 ]; then
    warnings="${warnings}\n  ❌ Overall score ${current_score}/100 below threshold 80"
  fi

  [ -z "$warnings" ] && return 0

  printf '{"ts":"%s","score":%s,"prev":%s,"warnings":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$current_score" "$prev_score" \
    "$(printf '%b' "$warnings" | jq -Rs .)" \
    >> "$score_history_file" 2>/dev/null || true
}

# ─── Run rules sequentially(all non-blocking,exit 0)──
rule_tsc_sanity
rule_harvest_corrections
rule_capture_metrics
rule_governance_drift
rule_infra_best_practice_score

exit 0
