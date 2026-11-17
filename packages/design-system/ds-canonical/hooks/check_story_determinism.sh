#!/bin/bash
# check_story_determinism.sh — stories 寫入時 determinism 哨(2026-07-07 治理進化軌道 7)
#
# Why:story 用真實時間/亂數 → VR baseline 換日假 breach(anchor:2026-07-07 calendar 三 scenario
# 0.07–0.51% 週期性假紅,三修才根治:story 釘日期 → 元件內部時間 → runner 偏移時鐘)。
# runner 層已有偏移時鐘兜底(scripts/visual-audit.mjs),本 hook = 寫入層提前攔,
# 讓 determinism 在出生點就成立(非 VR 撞到才修)。
#
# 偵測(新寫入內容):裸 `new Date()`(無參數)/ `Date.now()` / `Math.random()`。
# escape:行內 `@nondeterministic-ok: <rationale>`(如「即時鐘 demo,VR 不截」)。
# 第一期 WARN(exit 0):存量 10 檔(dry-run 2026-07-07,DateGrid 家族為主)未清,
# 誤殺率驗證期後升 P0(對齊 handcraft 偵測同節奏;roadmap 方向 1 KPI 隨頻回顧)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
case "$FILE_PATH" in *.stories.tsx) ;; *) exit 0 ;; esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")
grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

# 2026-11-17 /knowledge-prune 收窄(D6-3):引號裡的字串(文件表格寫 'new Date()' 當說明,例
# date-grid.anatomy.stories.tsx)不是呼叫,先從該行拿掉再判;同一行另有裸用法照樣警告。
# 「事件處理裡產生的 id」(field.stories.tsx、file-upload.stories.tsx 的 onUpload)**照樣警告**:
# 「只在使用者操作後才出現」是程式結構的性質,單行比對看不出來 —— 拿 `id: \`…${Date.now()}…\`` 的寫法
# 當代理,會連初次渲染資料裡的 id(`[{ id: \`ORD-${Date.now()}\` }]`)一起放行(M37;consumer CI 把本 hook
# 的 stderr 判成 BLOCKER,放行 = 少一道擋)。那幾行請改用行內 `@nondeterministic-ok: <rationale>`。
HITS=$(printf '%s\n' "$NEW_CONTENT" | awk '
  /@nondeterministic-ok:/ { next }
  {
    probe = $0
    gsub(/["\047](new Date[(][)]|Date[.]now[(][)]|Math[.]random[(][)])["\047]/, "", probe)
    if (probe ~ /new Date[(][)]|Date[.]now[(][)]|Math[.]random[(][)]/) print NR ":" $0
  }' || true)
[ -z "$HITS" ] && exit 0

cat >&2 <<EOF
⚠️ [第一期 WARN] story 非決定性時間/亂數(VR baseline 換日假 breach 根因):
$HITS
→ 釘固定值(new Date(2026, 6, 15) / 常數 seed);真需即時值 → 行內 \`@nondeterministic-ok: <rationale>\`。
  Anchor:2026-07-07 calendar VR 三修;runner 偏移時鐘為兜底非藉口。roadmap 方向 1(planning/2026-07-07-governance-evolution-roadmap.md)。
EOF
exit 0
