#!/bin/bash
# PreToolUse hook:阻止「沒 source citation 的 world-class benchmark claim」(對齊 M22)。
#
# Bug 史(2026-05-02):
#   AI 在 spec.md / tsx comment 寫「對齊 Ant Design」「Material 共識」「Polaris 派」
#   但沒附 source URL / screenshot / specific impl reference → 寫 code 時憑印象解讀,
#   常常**錯誤**(e.g., 我寫 Ant showTime range 是 2 calendar,實證是 1 calendar)。
#
# 機械化規則:
#   寫 spec / tsx 含 benchmark 關鍵詞 → 必同段含**至少一條** citation:
#     - Inline URL(`https://...` 包含 ant-design / material / polaris / atlassian / carbon / shadcn / radix-ui domain)
#     - GitHub issue / PR / source path(`#L42` line ref)
#     - Screenshot reference(`snapshots/...`)
#     - Marked `@benchmark-unverified`(顯式撤回)
#
# 允許 escape:
#   檔頭加 `// @benchmark-citation-allow: <reason>` 整檔豁免(legacy,M22 hook 上線過渡期)
#   檔頭加 `// @benchmark-unverified-blanket: <reason>` 整檔 M22 (d) 撤回(file-level unverified)

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$TOOL" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Only spec.md / .tsx in design-system
case "$FILE_PATH" in
  */src/design-system/**/*.spec.md|*/src/design-system/**/*.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

[ -z "${NEW_CONTENT//[[:space:]]/}" ] && exit 0

# File-level allowlist
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
if echo "$FIRST_LINES" | grep -qE '@benchmark-citation-allow:|@benchmark-unverified-blanket:'; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if echo "$ON_DISK_FIRST" | grep -qE '@benchmark-citation-allow:|@benchmark-unverified-blanket:'; then
    exit 0
  fi
fi

# Detect benchmark claim keywords + check inline citation in same paragraph
# 用 perl -0777 slurp 比 awk simpler;每個含 benchmark keyword 的「段」(連續非空行)
# 必含 citation evidence。
VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | perl -0777 -ne '
  my $bench = qr/(Ant Design|Material(\s+X|\s+Design|\s+UI|\s+3)?|Polaris|Atlassian|Carbon|shadcn|Radix UI?|Apple HIG|Notion|Airtable|ClickUp|Figma|Linear)/;
  my $cite = qr/(https?:\/\/(www\.)?(ant-design|material|polaris\.shopify|atlassian\.design|carbon|shadcn|ui\.shadcn|radix-ui|github|developer\.apple)|#L\d|snapshots\/|@benchmark-unverified)/;
  # Iterate paragraphs(separated by blank lines)
  for my $para (split /\n\s*\n/) {
    next unless $para =~ $bench;
    # Skip paragraphs that ARE source citations(URL line itself)
    next if $para =~ /^\s*[\*-]?\s*https?:\/\//;
    # Has citation? OK
    next if $para =~ $cite;
    # Violation:claim 但沒 cite
    my $first_line = (split /\n/, $para)[0];
    print "  - " . substr($first_line, 0, 80) . "...\n";
  }
'
)

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<EOF

┄┄┄┄ check_benchmark_citation — world-class benchmark claim 缺 source ┄┄┄┄

[P1 WARN] ${FILE_PATH}
偵測到 benchmark claim 段缺 inline citation:
${VIOLATIONS}
M22 canonical(2026-05-02):**寫 spec / code 含「Ant / Material / Polaris / ...」claim 必附**:
  (a) Inline URL(domain 含 ant-design / material / polaris / atlassian / radix-ui / github 等)
  (b) GitHub source path + line ref(\`#L42\`)
  (c) Screenshot reference(\`snapshots/...\`)
  (d) 顯式撤回 \`@benchmark-unverified\`

歷史教訓(2026-05-02):
  - 我 claim「Ant showTime range = 2 calendars」憑印象 → 實證是 1 calendar,白忙一場
  - User: 「下次到底該如何完全避免你自己不斷說鬼話?」→ M22 + 本 hook

整檔豁免:
  - \`// @benchmark-citation-allow: <reason>\`(legacy 過渡期暫掛)
  - \`// @benchmark-unverified-blanket: <reason>\`(M22 (d) file-level 撤回)
EOF
  # Soft warning(P1)— print to stderr, don't block(exit 1 vs exit 2)
  exit 1
fi

exit 0
