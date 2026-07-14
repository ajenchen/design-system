#!/usr/bin/env bash
# run-deterministic-dims.sh — 跑全部 24 DETERMINISTIC audit dim scripts,收 verdict(2026-07-12 完整 91-dim 補跑)。
cd "$(dirname "$0")/.."
OUT=".claude/logs/dim-audit/_deterministic-results.txt"
: > "$OUT"
run() {
  local dim="$1"; shift
  local desc="$1"; shift
  echo "── dim $dim: $desc" | tee -a "$OUT"
  local o; o=$(node "$@" 2>&1); local code=$?
  local tail=$(echo "$o" | grep -iE "violation|pass|✅|❌|error|scanned|0 |fail|drift|clean" | tail -3 | tr '\n' ' ')
  echo "   exit=$code | $tail" | tee -a "$OUT"
}
echo "=== DETERMINISTIC dim battery $(date -u +%FT%TZ) ===" | tee -a "$OUT"
run 2  "spec deadlinks"           scripts/audit-spec-deadlinks.mjs --check
run 3  "reciprocal pointers"      scripts/add-reciprocal-pointers.mjs --check
run 5  "orphan tokens"            scripts/audit-orphan-tokens.mjs --check
run 15 "content quality (cross-doc)" scripts/audit-content-quality.mjs --check
run 16 "layout-family frontmatter" scripts/audit-layout-family-frontmatter.mjs --check
run 27 "code quality"             scripts/code-quality-audit.mjs --scope full
run 36 "datatable row-mode ssot"  scripts/audit-data-table-row-mode-ssot.mjs
run 40 "story quality (title/name/placeholder)" scripts/audit-story-quality.mjs --check
run 85 "ds-canonical mirror fresh" scripts/sync-ds-canonical.mjs --check
run 86 "plugin structure"         scripts/plugin-structure-validate.mjs
run 88 "dangling infra ref"       scripts/check-dangling-infra-ref.mjs --check
run 88b "skill deadref"           scripts/check-skill-deadref.mjs --check
run 91 "failure-class coverage"   scripts/audit-failure-class-coverage.mjs --check
run 84 "2-scenario architecture"  scripts/test-2-scenario-architecture.mjs
echo "=== light battery done; heavy (visual-audit --matrix / composition-fidelity / verify-published-deploy / dogfood-prepublish / a11y axe / size-limit) need storybook build or network — run separately ===" | tee -a "$OUT"
