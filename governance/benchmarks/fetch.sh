#!/bin/bash
# Fetch external signals: Claude Code release notes + world-class DS snapshots.
# Fail-silent: network / site errors don't block, only last-fetch.txt on success.
#
# Run manually: bash governance/benchmarks/fetch.sh
# Auto-reminded: session_start_governance_check.sh when > 30 days stale.

set -u  # NOT -e; we want to continue on individual fetch failures

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}}"
BENCH_DIR="$PROJECT_DIR/infra/governance/runtime/benchmarks"
SNAPSHOT_DIR="$BENCH_DIR/external-ds-snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SUCCESS_COUNT=0
FAIL_COUNT=0
ERRORS=""

fetch_to_file() {
  local url="$1"
  local out_file="$2"
  local label="$3"

  if curl -sfL --max-time 15 "$url" -o "$out_file.tmp" 2>/dev/null; then
    mv "$out_file.tmp" "$out_file"
    echo "  ✓ $label"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    rm -f "$out_file.tmp"
    echo "  ✗ $label (fetch failed — skip)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    ERRORS="${ERRORS}\n  - ${label}: ${url}"
  fi
}

echo "Fetching external signals → $BENCH_DIR"
echo

# Claude Code release notes (Anthropic docs)
fetch_to_file \
  "https://docs.claude.com/en/release-notes/claude-code.md" \
  "$BENCH_DIR/claude-code-features.md" \
  "Claude Code release notes"

fetch_to_file \
  "https://developers.openai.com/codex/changelog/" \
  "$BENCH_DIR/codex-changelog.html" \
  "Codex changelog"

# World-class DS changelogs(best-effort public URLs)
fetch_to_file \
  "https://polaris.shopify.com/components" \
  "$SNAPSHOT_DIR/polaris-components.html" \
  "Polaris components index"

fetch_to_file \
  "https://m3.material.io/foundations" \
  "$SNAPSHOT_DIR/material3-foundations.html" \
  "Material 3 foundations"

fetch_to_file \
  "https://atlassian.design/components" \
  "$SNAPSHOT_DIR/atlassian-components.html" \
  "Atlassian components index"

# Record outcome
echo
echo "Done: $SUCCESS_COUNT succeeded, $FAIL_COUNT failed"

if [ "$SUCCESS_COUNT" -gt 0 ]; then
  echo "$TIMESTAMP" > "$BENCH_DIR/last-fetch.txt"
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '{"ts":"%s","failures":"%s"}\n' "$TIMESTAMP" "$(echo "$ERRORS" | tr '\n' ' ')" >> "$BENCH_DIR/last-failure.jsonl"
fi

exit 0
