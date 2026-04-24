---
description: One-shot dump governance health snapshot(無 workflow,< 10s 完成)
---

# /gov-status — Governance Health Snapshot

快印現在 governance state,不走 `/governance-health` 完整 skill workflow(那有 5 phase + CP),只是 user 想 quick check 時的一眼看。

## 跑法

執行以下 bash 並 format output 成 markdown table:

```bash
echo "=== File sizes ==="
echo "CLAUDE.md: $(wc -l < CLAUDE.md | tr -d ' ') / 400 target / 800 transition"
echo ""
echo "=== Over-cap specs ==="
for f in $(find src/design-system -name "*.spec.md"); do
  lines=$(wc -l < "$f" | tr -d ' ')
  case "$f" in
    */item-anatomy.spec.md) cap=1200 ;;
    */color.spec.md|*/sidebar.spec.md|*/tree-view.spec.md) cap=800 ;;
    *) cap=500 ;;
  esac
  if [ "$lines" -gt "$cap" ]; then
    echo "  ❌ $f: $lines > $cap"
  fi
done
echo ""
echo "=== Memory ==="
MEM_DIR=/Users/chenqiren/.claude/projects/-Users-chenqiren-Library-CloudStorage-GoogleDrive-qijenchen-gmail-com--------my-project/memory
echo "active: $(ls $MEM_DIR/*.md | grep -v retired | wc -l | tr -d ' ') / 20 target"
echo ""
echo "=== Hooks / Skills / Agents / Commands ==="
for d in hooks skills agents commands; do
  c=$(ls .claude/$d/ 2>/dev/null | grep -v README | grep -v gitignore | wc -l | tr -d ' ')
  echo "  .claude/$d: $c"
done
echo ""
echo "=== Logs ==="
for f in hook-fires skill-invokes user-corrections metric-snapshots; do
  fn=".claude/logs/$f.jsonl"
  if [ -f "$fn" ]; then
    echo "  $f: $(wc -l < $fn | tr -d ' ') entries"
  else
    echo "  $f: (empty)"
  fi
done
echo ""
echo "=== Benchmark freshness ==="
if [ -f .claude/benchmarks/last-fetch.txt ]; then
  LAST=$(cat .claude/benchmarks/last-fetch.txt)
  echo "  last: $LAST"
else
  echo "  never fetched — run bash .claude/benchmarks/fetch.sh"
fi
echo ""
echo "=== Retire rate(latest snapshot)==="
if [ -f .claude/logs/metric-snapshots.jsonl ]; then
  tail -1 .claude/logs/metric-snapshots.jsonl | head -c 200
fi
echo ""
echo "=== tsc state ==="
npx tsc -b 2>&1 | grep -c "error TS" || echo "0"
echo ""
echo "=== compile-stories drift ==="
node scripts/compile-stories.mjs --all --check 2>&1 | tail -1
```

## 結論分類

根據上述輸出自動判斷:
- **✅ OK** — 若無 over-cap spec + 無 tsc error + 無 drift + memory ≤ 20
- **⚠️ Warning** — 有 over-cap / pending corrections > 10 / benchmark stale > 30 days
- **❌ Fail** — tsc errors / compile drift / CLAUDE.md > 800

最後給 user 一行 summary:「Governance:{✅/⚠️/❌}{one-line rationale}」。

若要深度 audit → suggest `/governance-health` 跑完整 5-phase skill。
