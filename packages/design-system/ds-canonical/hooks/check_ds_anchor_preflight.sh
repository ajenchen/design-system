#!/bin/bash
# check_ds_anchor_preflight.sh — M29 mechanical enforcement(2026-05-26 backfill per user verbatim
# 「該程式化的都沒程式化,導致你他媽那麼容易便宜」+「未來其他人 fork 用其他元件也偏移」)。
#
# Purpose: PreToolUse Edit/Write/MultiEdit 偵測 production tsx wrap DS primitive
# (`<Sidebar>` / `<AppShell>` / `<DataTable>` / `<Dialog>` / `<Field>` 等)
# 沒同 turn 跑過 Grep / Read DS canonical baseline → P0 BLOCKER(exit 2,2026-07-07 治理進化方向 2 升級;
# escape CLAUDE_BYPASS_DS_ANCHOR=1 audit-logged),propose 前必出 3-column owner table。
#
# Scope:同 check_substantive_edit_approval_preflight.sh extended scope
#   - packages/design-system/src/**.tsx (DS internal)
#   - apps/**.tsx (consumer fork-user code) ← M29 gap absorption(2026-05-26)
#   - node_modules/@qijenchen/design-system/** (禁改)
#
# Excluded: *.stories.tsx (story_invariants R7/R8 already cover) / *.test.tsx / *.spec.md.
#
# Why mechanical:M29 anchor preflight 在 meta-patterns.md 喊很久,5 個文件 reference but file 0,
# 結果 2026-05-26 product-workspace App.tsx mock-drift 沒被攔 → user 抓「肌肉沒長出來」。
# 本 hook 將「propose / write 視覺結構 前必 grep DS spec.md / canonical story」從 mindset 升 mechanical。
#
# Detection:scan transcript 過去 ~30 turns:
#   (a) 有 Grep / Read tool call hit `packages/design-system/src/**/*.spec.md` OR
#       `**/*.stories.tsx`(canonical baseline) → PASS
#   (b) 無 → soft BLOCKER inject context 提醒 grep canonical 出 3-column owner table。
#
# 對齊 meta-patterns.md M29 「視覺/結構 propose 前必 grep DS spec.md 找 owner SSOT(M29)— 出 3-column 表」+
# .claude/rules/self-verify.md Pre-edit phase「M29 3-column owner table」。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

[ "$EVENT" != "PreToolUse" ] && exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

# Scope:DS production code + consumer fork-user app code(不含 stories / spec / test)
case "$FILE_PATH" in
  */packages/design-system/src/*.tsx) ;;
  */apps/*.tsx) ;;
  */node_modules/@qijenchen/design-system/*.tsx) ;;
  *) exit 0 ;;
esac

case "$FILE_PATH" in
  *.stories.tsx|*.test.tsx|*.spec.md|*.spec.ts) exit 0 ;;
esac

# Extract content being written/edited
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null)

# DS primitive 名單(wrap 這些就觸發 anchor preflight)
DS_PRIMITIVES_RE='<(Sidebar|AppShell|DataTable|Dialog|Sheet|Popover|DropdownMenu|Field|FieldControlGroup|MenuItem|ItemAvatar|ItemLabel|ItemIcon|SegmentedControl|Tabs|TabsList|TabsTrigger|Combobox|Select|DatePicker|TimePicker|TreeView|Tooltip|Coachmark|FileViewer|ScrollArea|Avatar|Badge|Button|ChromeHeader|SurfaceHeader|SurfaceBody|SurfaceFooter|OverlaySurface|NameCard|Toast|FileUpload|DescriptionList|Chart|BulkActionBar|ActionBar|Carousel|Breadcrumb)\b'

# 沒 wrap DS primitive → 檢「純手刻」洞(2026-07-07 治理進化方向 3 洞 b:原本此分支直接放行,
# 「該用 primitive 卻整個手刻」反而抓不到 — 內部盤點 file:line 證據見 planning/2026-07-07-governance-evolution-roadmap.md)
if ! echo "$NEW_CONTENT" | grep -qE "$DS_PRIMITIVES_RE"; then
  # 視覺簽名:row/浮層/chrome 手刻特徵(flex row + padding/border/rounded/shadow 組合)
  HANDCRAFT_SIG=$(echo "$NEW_CONTENT" | grep -cE 'className="[^"]*\b(flex|absolute|fixed)\b[^"]*\b(border|rounded|shadow|px-|py-|gap-)' || true)
  if [ "${HANDCRAFT_SIG:-0}" -ge 3 ] && ! echo "$NEW_CONTENT" | grep -q '@handcraft-ok:'; then
    cat >&2 <<'EOF_HC'
⚠️ [第一期 WARN] M23(d)/mindset #2 純手刻嫌疑:本段 production tsx 有 ≥3 處視覺結構 className
   但零 DS primitive 消費。先查 patterns/(item-anatomy / overlay-surface / ChromeHeader /
   horizontal-overflow)有無現成 primitive;真需自建 → 行內 `@handcraft-ok: <rationale>` +
   spec「自建 + 理由」宣告。誤殺率驗證期後升 P0(roadmap 方向 3)。
EOF_HC
  fi
  exit 0
fi

[ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ] && exit 0

# Scan last ~30 turns(~600 lines transcript)— 找 Grep/Read 對 DS spec.md / canonical story 的 trace
RECENT_TRANSCRIPT=$(tail -600 "$TRANSCRIPT_PATH" 2>/dev/null)

# Pass condition(a):有 Grep tool call pattern hit spec.md / stories.tsx
HAS_CANONICAL_READ=$(echo "$RECENT_TRANSCRIPT" | \
  jq -r 'select(.message.content != null) |
    .message.content // empty |
    if type == "array" then
      (.[]? | select(.type == "tool_use") |
        select(.name == "Grep" or .name == "Read" or .name == "Glob") |
        .input | tostring)
    else empty
    end' 2>/dev/null | \
  grep -cE 'packages/design-system/src/.*\.(spec\.md|stories\.tsx)|stories\.tsx#' 2>/dev/null)
HAS_CANONICAL_READ=${HAS_CANONICAL_READ:-0}

# Pass condition(b):AI 已 written 3-column owner table OR cite `@story-baseline:` marker
HAS_3COL_OR_MARKER=$(echo "$RECENT_TRANSCRIPT" | \
  grep -cE '@story-baseline:|owner spec|canonical sentence|3-column' 2>/dev/null)
HAS_3COL_OR_MARKER=${HAS_3COL_OR_MARKER:-0}

# Pass: 有任一 canonical read OR 3-column marker → silent
if [ "$HAS_CANONICAL_READ" -gt 0 ] || [ "$HAS_3COL_OR_MARKER" -gt 0 ]; then
  exit 0
fi

# Override env var(audit-logged)
if [ "${CLAUDE_BYPASS_DS_ANCHOR:-0}" = "1" ]; then
  mkdir -p "$(dirname "$0")/../logs" 2>/dev/null
  printf '{"ts":"%s","event":"ds-anchor-bypass","file":"%s","tool":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$FILE_PATH" "$TOOL" >> "$(dirname "$0")/../logs/governance-bypass.jsonl" 2>/dev/null
  exit 0
fi

REL_PATH=${FILE_PATH#*/my-project/}

# Soft BLOCKER(對齊 check_substantive_edit_approval_preflight.sh hybrid pattern)
cat >&2 <<EOF
🚨 M29 DS Anchor Preflight — visual/structural edit 偵測

📁 File: $REL_PATH
🔧 Tool: $TOOL
🧩 偵測到 DS primitive 在 new content:wrap pattern

⚠️ 過去 ~30 turns 無 Grep/Read 對 \`packages/design-system/src/**/spec.md\` 或
   \`*.stories.tsx\` baseline 的 trace,且未見 \`@story-baseline:\` marker 或 3-column owner table。

→ 這違反 M29 anchor preflight invariant + story-rules.md「Production-grade composition fidelity」。
→ 對 fork-user 後果:憑記憶寫 simplified mock(像 2026-05-26 App.tsx SidebarTrigger 漏 / collapsible 漏 / startIcon 漏)。

修法 — 2 選 1(對齊 check_substantive_edit_approval_preflight.sh hybrid):
  (a) 先 Grep / Read DS canonical:
        - \`packages/design-system/src/<Component>/*.spec.md\`(找 owner SSOT)
        - \`packages/design-system/src/<Component>/*.stories.tsx\`(找完整佈局 baseline)
      然後 inline 寫 3-column owner table(\`owner spec\` / \`canonical sentence\` / \`conflicting code\`)
      或加 \`// @story-baseline: <path>#<StoryName>\` marker 在檔頭。
  (b) Bypass:\`CLAUDE_BYPASS_DS_ANCHOR=1\` env var(audit-logged in governance-bypass.jsonl)
      僅當你**真的**已 Read canonical 但 transcript scan miss 時用,not 規則繞道。

對應 canonical:
  - \`.claude/rules/meta-patterns.md\` M29
  - \`.claude/rules/self-verify.md\` Pre-edit phase
  - \`.claude/references/ssot-index.md\` Step 0.1 high-risk interface owner mapping
EOF

# P0 BLOCKER(2026-07-07 治理進化方向 2:對齊 user 2026-05-27「SSOT canonical 必 P0 禁 soft」
# doctrine;bypass env CLAUDE_BYPASS_DS_ANCHOR=1 已備且 audit-logged,升級不增誤殺)。
exit 2
