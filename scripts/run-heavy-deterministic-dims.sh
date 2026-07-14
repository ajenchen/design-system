#!/usr/bin/env bash
# run-heavy-deterministic-dims.sh — 跑 6 個 build/network-dependent DETERMINISTIC dim(49/50/51/77/83/87)。
# 2026-07-12 完整 91-dim 補跑;這些平時 CI/release-preflight 跑,dev session 需先 build storybook。
cd "$(dirname "$0")/.."
OUT=".claude/logs/dim-audit/_deterministic-results.txt"
say() { echo "── $*" | tee -a "$OUT"; }
run() { local dim="$1" desc="$2"; shift 2; say "dim $dim: $desc"; local o; o=$(node "$@" 2>&1); local c=$?; echo "   exit=$c | $(echo "$o" | grep -iE 'pass|fail|✅|❌|violation|error|scanned|0 |budget|ratio' | tail -2 | tr '\n' ' ')" | tee -a "$OUT"; }

# storybook-static 需在(a11y axe / visual matrix / composition / size 都靠它)
if [ ! -d storybook-static ] || [ -z "$(ls -A storybook-static 2>/dev/null)" ]; then
  say "storybook-static 缺 → build(~2-3 min)"
  npm run build-storybook > /tmp/sb-build.log 2>&1; echo "   build exit=$?" | tee -a "$OUT"
fi

run 49 "a11y axe-core"          scripts/audit-a11y.mjs
run 51 "theme/density visual matrix" scripts/visual-audit.mjs --matrix
run 77 "composition-fidelity visual diff" scripts/composition-fidelity-visual-diff.mjs
# 50 size-limit: npx size-limit(需 build:lib bundle)
say "dim 50: bundle size budget"; o=$(npx size-limit 2>&1); echo "   exit=$? | $(echo "$o" | tail -3 | tr '\n' ' ')" | tee -a "$OUT"
# 83 verify-published-deploy + 87 dogfood-prepublish:需 published npm / network / pack — 記為 CI-gated
say "dim 83: verify-published-deploy(需 published npm + network)"; o=$(node scripts/verify-published-deploy.mjs 2>&1); echo "   exit=$? | $(echo "$o" | tail -2 | tr '\n' ' ')" | tee -a "$OUT"
say "dim 87: dogfood-prepublish-verify(需 npm pack + build)"; o=$(node scripts/dogfood-prepublish-verify.mjs 2>&1); echo "   exit=$? | $(echo "$o" | tail -2 | tr '\n' ' ')" | tee -a "$OUT"
say "heavy deterministic battery done"
