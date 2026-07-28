#!/bin/bash
# Tests for check_orphan_ds_css.sh(P0 BLOCKER,2026-05-27 codify)
#
# Hook 規則(Stop / SubagentStop event):
#   Scan $GOVERNANCE_PROJECT_DIR/packages/design-system/src/**/*.css。
#   Orphan condition(provider-neutral Stop block decision):
#     file NOT in styles/tokens.css aggregator(grep -qF rel path)
#     AND basename NOT imported by any tsx/ts/css in DS(grep -rln 'import.*base|@import.*base')
#   任一 orphan → exit 0 + stdout governanceDecision JSON，供 provider runner 轉譯。
#   非 Stop/SubagentStop event → exit 0 silent。
#   active canonical root 缺 DS_SRC / tokens.css aggregator → integrity exit 70。
#   styles/tokens.css aggregator 自身永遠 skip(不算 orphan)。
#
# 全部 fixture 走 TMP_DIR + GOVERNANCE_PROJECT_DIR override,deterministic,無 network。

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$SCRIPT_DIR/../check_orphan_ds_css.sh"

if [ ! -x "$HOOK" ]; then
  echo "FATAL: hook not executable: $HOOK"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# GOVERNANCE_PROJECT_DIR override → hook 完全在 TMP_DIR sandbox 內掃,不碰 repo 真 DS。
export GOVERNANCE_PROJECT_DIR="$TMP_DIR"
DS_SRC="$TMP_DIR/packages/design-system/src"

# ── Fixture helpers ────────────────────────────────────────────────────────

# 重建乾淨 DS_SRC:tokens.css aggregator + styles dir。
reset_ds() {
  rm -rf "$TMP_DIR/packages"
  mkdir -p "$DS_SRC/styles" "$DS_SRC/tokens" "$DS_SRC/components" "$DS_SRC/patterns"
  cat > "$DS_SRC/styles/tokens.css" <<'EOF'
/* AUTO-GENERATED aggregator */
@import "../tokens/primitives.css";
@import "../tokens/semantic.css";
EOF
}

run_hook() {
  local event="${1:-Stop}"
  local payload
  payload=$(jq -n --arg e "$event" '{hook_event_name:$e}')
  STDOUT=$(mktemp); STDERR=$(mktemp)
  set +e
  printf '%s' "$payload" | bash "$HOOK" >"$STDOUT" 2>"$STDERR"
  EXIT=$?
  set -e
  STDOUT_TEXT=$(cat "$STDOUT" 2>/dev/null)
  STDERR_TEXT=$(cat "$STDERR" 2>/dev/null)
  rm -f "$STDOUT" "$STDERR"
}

expect_block() {
  local name="$1"; local needle="${2:-ORPHAN-DS-CSS BLOCKER}"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
     && echo "$STDOUT_TEXT" | jq -e --arg needle "$needle" '.governanceDecision == "block" and (.reason | contains($needle))' >/dev/null 2>&1; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected neutral BLOCK decision + '$needle', got exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

# neutral reason 必含此 file 的 rel path(guard against 漏報具體檔)
expect_block_lists() {
  local name="$1"; local rel="$2"
  if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
     && echo "$STDOUT_TEXT" | jq -e --arg rel "$rel" '.governanceDecision == "block" and (.reason | contains("ORPHAN-DS-CSS BLOCKER")) and (.reason | contains($rel))' >/dev/null 2>&1; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected BLOCK listing '$rel', exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_pass_silent() {
  local name="$1"
  if [ "$EXIT" = "0" ] && [ -z "$STDOUT_TEXT" ] && [ -z "$STDERR_TEXT" ]; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected silent exit=0, got exit=$EXIT, stderr=$([ -n "$STDERR_TEXT" ] && echo non-empty || echo empty))"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

expect_integrity() {
  local name="$1"; local needle="$2"
  if [ "$EXIT" = "70" ] && [ -z "$STDOUT_TEXT" ] \
    && echo "$STDERR_TEXT" | grep -qF "GOVERNANCE_INTEGRITY:" \
    && echo "$STDERR_TEXT" | grep -qF "$needle"; then
    echo "  PASS  $name"; PASS=$((PASS+1))
  else
    echo "  FAIL  $name (expected integrity exit 70 + '$needle', got exit=$EXIT)"
    echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    echo "  --- stderr ---"; echo "$STDERR_TEXT" | sed 's/^/    /'; echo "  --- end ---"
    FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - $name"
  fi
}

echo "=== check_orphan_ds_css tests ==="

# ── NEGATIVE: event gating + missing infra ─────────────────────────────────

# 1. Non-Stop event(PreToolUse)→ silent，即使有 orphan 也不掃
reset_ds
cat > "$DS_SRC/components/orphan.css" <<'EOF'
:root { --foo: 1px; }
EOF
run_hook "PreToolUse"
expect_pass_silent "1. event=PreToolUse → skip(不掃,即使有 orphan)"

# 2. 無 DS_SRC dir → active hook configuration integrity fault
rm -rf "$TMP_DIR/packages"
run_hook "Stop"
expect_integrity "2. 無 packages/design-system/src dir → integrity 70" "canonical DS root or aggregator"

# 3. 有 DS_SRC 但無 tokens.css aggregator → integrity fault
mkdir -p "$DS_SRC/components"
cat > "$DS_SRC/components/x.css" <<'EOF'
:root { --x: 1px; }
EOF
run_hook "Stop"
expect_integrity "3. 無 tokens.css aggregator → integrity 70" "canonical DS root or aggregator"

# ── POSITIVE: real orphan(guards against over-narrow regex)────────────────

# 4. CSS 既不在 aggregator 也沒被 import → BLOCK，列出該檔
#    (這是 2026-05-26 header-canonical.css / data-table.css 真 root case)
reset_ds
cat > "$DS_SRC/patterns/data-table.css" <<'EOF'
.ds-data-table { display: grid; }
EOF
run_hook "Stop"
expect_block_lists "4. orphan CSS(不在 aggregator 不被 import)→ BLOCK 列出檔" "patterns/data-table.css"

# 5. 多個 orphan → BLOCK，兩個 rel path 都列出(M10 exhaustive,不只報第一個)
reset_ds
cat > "$DS_SRC/patterns/data-table.css" <<'EOF'
.ds-data-table { display: grid; }
EOF
cat > "$DS_SRC/components/header-canonical.css" <<'EOF'
.ds-chrome-header { height: var(--chrome-header-h); }
EOF
run_hook "Stop"
if [ "$EXIT" = "0" ] && [ -z "$STDERR_TEXT" ] \
   && echo "$STDOUT_TEXT" | jq -e '.governanceDecision == "block" and (.reason | contains("patterns/data-table.css")) and (.reason | contains("components/header-canonical.css"))' >/dev/null 2>&1; then
  echo "  PASS  5. 多 orphan → 兩檔都列出"; PASS=$((PASS+1))
else
  echo "  FAIL  5. 多 orphan(expected 兩檔都列出, exit=$EXIT)"
  echo "  --- stdout ---"; echo "$STDOUT_TEXT" | sed 's/^/    /'; echo "  --- end ---"
  FAIL=$((FAIL+1)); FAILED_TESTS="${FAILED_TESTS}\n  - 5. 多 orphan"
fi

# ── NEGATIVE: legit CSS not orphan(guards against over-broad regex)─────────

# 6. CSS 在 aggregator(rel path @import)→ silent
reset_ds
cat > "$DS_SRC/tokens/primitives.css" <<'EOF'
:root { --primitive-blue: #06f; }
EOF
# tokens.css 已 @import "../tokens/primitives.css" → rel "tokens/primitives.css" 命中 grep -F
run_hook "Stop"
expect_pass_silent "6. CSS 在 tokens.css aggregator(rel path 命中)→ silent"

# 7. CSS 被 tsx import(component-internal scoped)→ silent
reset_ds
cat > "$DS_SRC/components/Tooltip.css" <<'EOF'
.ds-tooltip { z-index: 50; }
EOF
cat > "$DS_SRC/components/Tooltip.tsx" <<'EOF'
import "./Tooltip.css";
export const Tooltip = () => null;
EOF
run_hook "Stop"
expect_pass_silent "7. CSS 被 tsx import → silent(component-internal scoped)"

# 8. CSS 被另一個 .css @import(chain via css)→ silent
reset_ds
cat > "$DS_SRC/patterns/sub.css" <<'EOF'
.ds-sub { color: red; }
EOF
cat > "$DS_SRC/patterns/index.css" <<'EOF'
@import "./sub.css";
EOF
# index.css 自己也得被消費,否則它變 orphan → 讓 tokens.css 收 index.css
sed -i.bak '$a\
@import "../patterns/index.css";' "$DS_SRC/styles/tokens.css"
rm -f "$DS_SRC/styles/tokens.css.bak"
run_hook "Stop"
expect_pass_silent "8. CSS 被另一 .css @import + chain head 在 aggregator → silent"

# 9. styles/tokens.css aggregator 自身永遠 skip(空 DS,只有 aggregator)→ silent
#    (near-miss:aggregator rel path 不在自己內容裡，但 hook 顯式 skip)
reset_ds
run_hook "Stop"
expect_pass_silent "9. 只有 tokens.css aggregator 自身 → silent(顯式 skip)"

# 10. SubagentStop event 同樣觸發掃描(orphan → BLOCK)
reset_ds
cat > "$DS_SRC/components/lone.css" <<'EOF'
.ds-lone { display: none; }
EOF
run_hook "SubagentStop"
expect_block "10. event=SubagentStop + orphan → BLOCK" "ORPHAN-DS-CSS BLOCKER"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS / $((PASS + FAIL))"
if [ "$FAIL" -gt 0 ]; then
  printf "Failed:%b\n" "$FAILED_TESTS"
  exit 1
fi
exit 0
