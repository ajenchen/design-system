#!/bin/bash
# check_layout_space_magic_numbers.sh — P0 BLOCKER
#
# 偵測 consumer / DS app code 用 Tailwind spacing magic numbers
# (`p-4` / `px-6` / `py-2` / `gap-3` 等)而非 layoutSpace token
# (`p-[var(--layout-space-N) N∈{loose,tight}]` / `gap-[var(--layout-space-N) N∈{loose,tight}]`)。
# 2026-05-27 user verbatim「機械無強制就不會做?那為何不全部 ssot 都要強制吻合?」
# 永久 codify — SSOT canonical 必 P0 BLOCKER,不分級。
#
# Anchor:user 質疑「content 自動繼承 layoutSpace SSOT 嗎?」
# - app-shell.spec.md:205 明文 `<main>` landmark padding=0 (intentional)
# - app-shell.spec.md:207-212 consumer 必遵循 layoutSpace.spec.md 6 條規則 + 親疏 3 級
#
# PostToolUse Edit/Write detect magic Tailwind spacing → P0 BLOCKER exit 2
# 強制改 token OR 加 `// @layout-space-magic-ok: <rationale>` escape comment(per-line)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$(dirname "$0")/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: hook integrity helper unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_provider_paths.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: layout-space corpus resolver unavailable\n' >&2
  exit 70
}
source "$(dirname "$0")/lib/_micro_geometry.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: layout-space micro-geometry classifier unavailable\n' >&2
  exit 70
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands grep head sed python3
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'layout-space tool extraction failed'

case "${TOOL:-}" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'layout-space path extraction failed'

# Only check .tsx / .ts in app code
if ! governance_hook_grep_q 'layout-space scope matcher failed' "$FILE" -qE '\.(tsx|ts)$'; then exit 0; fi
# Skip DS source (DS components have their own spacing logic via cva)
if governance_hook_grep_q 'layout-space exclusion matcher failed' "$FILE" -qE 'packages/design-system/src/|node_modules/'; then exit 0; fi

# Get new content
NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null) \
  || governance_hook_integrity_fail 'layout-space content extraction failed'
[ -z "$NEW_CONTENT" ] && exit 0

# Escape clause:single line escape comment per line of magic number usage
# `// @layout-space-magic-ok: <rationale>` immediately above the line OR on same line
ESCAPE_MARKER='@layout-space-magic-ok:'

# Detect magic spacing classes (Tailwind class strings only — NOT JSX props like size={24})
# Match per line so we can check per-line escape comments
# 2026-07-08 WM 戰役 R4 擴 scope(broad-vs-narrow gap 實證修補):
#   (a) logical properties ps-/pe-/ms-/me-(WM 6 筆 ps-4 漏網實證)
#   (b) arbitrary bracket 固定 px:gap-[7px] / p-[13px] 類(spacing 家族)
#   (c) 固定寬度 w-[Npx](WM w-[640px] 丟失 min() viewport clamp 實證;w-[min(...)]/var()/% 不攔)
#   (d) grid-template 固定 px 欄寬:grid-cols-[...Npx...](WM mini-table 88px/72px 黏死實證)
governance_hook_grep_capture MAGIC_LINES 'layout-space matcher failed' "$NEW_CONTENT" -nE \
  '\b(p|px|py|pt|pb|pl|pr|ps|pe|gap|space-x|space-y|m|mx|my|mt|mb|ml|mr|ms|me)-(0\.5|[1-9][0-9]?(\.[0-9])?)\b|\b(p|px|py|pt|pb|pl|pr|ps|pe|gap|m|mx|my|mt|mb|ml|mr|ms|me)-\[[0-9]+(\.[0-9]+)?px\]|\bw-\[[0-9]+(\.[0-9]+)?px\]|\bgrid-(cols|rows)-\[[^]]*[0-9]+px[^]]*\]'

# ── 幻覺 token 攔截(2026-07-08 WM 戰役:app 自創 var(--layout-space-distant) → CSS 未定義
# silent 解析 0 → 區塊全黏死,PDF「全部擠在一起」根因之一。白名單 = loose|tight|bottom
# (layoutSpace.css SSOT 僅此三顆;新增 tier 走 DS token 流程,不在 consumer 端發明)──
governance_hook_grep_capture PHANTOM_CANDIDATES 'layout-space phantom-token candidate matcher failed' \
  "$NEW_CONTENT" -nE 'var\(--layout-space-[a-z-]+\)'
governance_hook_grep_capture PHANTOM 'layout-space phantom-token exclusion matcher failed' \
  "$PHANTOM_CANDIDATES" -vE 'var\(--layout-space-(loose|tight|bottom)\)'
if [ -n "$PHANTOM" ]; then
  cat >&2 <<EOF_PH
🚨 [P0 BLOCKER] 幻覺 layout-space token(CSS 未定義 = silent 0 = 佈局黏死):
$PHANTOM
→ 白名單只有 --layout-space-{loose,tight,bottom}(layoutSpace.css SSOT)。
  要更大一級間距 → 用 loose;真需新 tier → 走 DS token 新增流程(layoutSpace.spec),禁 consumer 端自創。
  Anchor:2026-07-08 WM --layout-space-distant ×4 處,整個 detail modal 區塊黏死。
EOF_PH
  exit 2
fi

# 2026-07-10 批次 A:divider 幾何 canonical(h-6 mx-1 / h-5 mx-1,action-bar.spec.md「分隔線幾何」)
# 是**正解**,不該被 magic-number 攔(原本懲罰 canonical 修法、放行違規 = 治理自我打架)。
governance_hook_grep_capture MAGIC_LINES_FILTERED 'layout-space canonical-divider filter failed' \
  "$MAGIC_LINES" -vE '(Separator|ButtonDivider)'
MAGIC_LINES="$MAGIC_LINES_FILTERED"

# layoutSpace.spec.md L150-163:token scaling owns macro structure, while fixed micro/control/list
# geometry and rule-5 grouped horizontal fields must not be over-tokenized. The shared classifier
# consumes the authenticated utility registry and admits only same-line/bounded-nearby structural
# evidence. It also requires every magic token on the line to be a registered gap-1/2, so an inline
# gap cannot hide p-/m-/space-* macro magic.
MAGIC_LINES_FILTERED=$(governance_filter_canonical_micro_geometry "$NEW_CONTENT" "$MAGIC_LINES") \
  || governance_hook_integrity_fail 'layout-space canonical micro-geometry classification failed'
MAGIC_LINES="$MAGIC_LINES_FILTERED"

if [ -z "$MAGIC_LINES" ]; then
  exit 0
fi

# Filter out lines with escape marker on same line OR immediately preceding line
# 2026-06-03 修(doc-vs-code bug,M32):L41 文件宣稱支援「preceding line OR same line」,
# 但原 code 只檢查同行 → JSX className 行無法放同行 `//` comment(會破壞 JSX)→ escape 對 JSX
# 實質失效。補實作前一行檢查(grep -n 行號 → sed 取前一行),對齊文件 + 解 JSX 必需。
UNJUSTIFIED=""
while IFS= read -r line; do
  # same-line marker
  if governance_hook_grep_q 'layout-space same-line escape matcher failed' "$line" -qF "$ESCAPE_MARKER"; then continue; fi
  # preceding-line marker(JSX `{/* @layout-space-magic-ok: ... */}` 在上一行)。
  # 對齊 ESLint disable-next-line 慣例:前一行 marker 僅在該行是「註解專用行」(trimmed 開頭
  # //、{/*、/*、*)時生效 — 否則上一行 code 的「同行 escape」會誤串到下一行(P8 conflict)。
  lineno="${line%%:*}"
  if [ "$lineno" -gt 1 ] 2>/dev/null; then
    prev=$(sed -n "$((lineno-1))p" <<< "$NEW_CONTENT" 2>/dev/null) \
      || governance_hook_integrity_fail 'layout-space preceding-line extraction failed'
    if governance_hook_grep_q 'layout-space preceding escape matcher failed' "$prev" -qF "$ESCAPE_MARKER" \
      && governance_hook_grep_q 'layout-space preceding comment matcher failed' "$prev" -qE '^[[:space:]]*(//|\{?/\*|\*)'; then
      continue
    fi
  fi
  UNJUSTIFIED="${UNJUSTIFIED}${line}\n"
done <<< "$MAGIC_LINES"

if [ -z "$UNJUSTIFIED" ]; then
  exit 0
fi

cat >&2 << EOF
🚨 LAYOUT-SPACE-MAGIC-NUMBER BLOCKER(P0,2026-05-27 user verbatim「機械無強制就不會做?
為何不全部 ssot 都要強制吻合?」永久 codify)

  Detected Tailwind spacing magic numbers in $FILE without escape:
$(printf '%b' "$UNJUSTIFIED" | sed 's/^/    /' | awk 'NR <= 10')

  per app-shell.spec.md L205-219 + layoutSpace.spec.md SSOT:consumer content 必遵循
  layoutSpace 6 條規則 + 親疏 3 級,**禁** 硬寫 Tailwind magic numbers。改用:
    p-[var(--layout-space-loose)]      /* 16px 規則 1A/1B chrome / wrap */
    gap-[var(--layout-space-tight)]    /* 12px 規則 3 親 gap(跨範疇相關) */
    gap-[var(--layout-space-loose)]    /* 16px 規則 3 疏 gap(跨範疇 parallel;lg 密度自動 24px) */
    (token 全集 = loose/tight/bottom,無其他級 — 自創 --layout-space-distant 類 = 幻覺 token,本 hook 會攔)

  修法 2 選 1:
    (a) 改 token:換成 var(--layout-space-N) N∈{loose,tight} family per 6 規則 + 親疏 3 級
    (b) Escape:在該 line 加 \`// @layout-space-magic-ok: <rationale>\` 顯式 documented
        (eg.「\`gap-1\` 是 4px stack icon — non-spacing context,not consumer layout」)

  注意:canonical inline item/control、semantic homogeneous list、toolbar 與 rule-5 grouped
  horizontal fields 的 gap-1/2 會由 utility-registry 結構規則自動辨識,不需 escape。
  一般 flex/grid/section 的 gap-1/2 沒有這些語意證據時仍是 blocker。

  完整 6 條規則 → packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md
EOF
exit 2
