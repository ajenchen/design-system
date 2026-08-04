#!/bin/bash
# PostToolUse hook: flag hardcoded user-facing strings in DS component tsx
# (CJK ≥ 3 chars or English ≥ 8 chars that look like sentence-case labels).
#
# Rationale(AGENTS.md shared bootstrap + canonical audit rubric internationalization gap):
#   DS primitive 的文案若 hardcode,consumer 換語言 / A/B test label 時要 forkDS。
#   正確路線:prop 接收 + `loadingText` / `emptyText` 等 slot,或走 i18n 層。
#
# Scope:
#   - ONLY packages/design-system/src/components/**/*.tsx(primitives)
#   - ONLY patterns/ 如果出現 user-facing string
#   - SKIP stories.tsx(stories 用真實 Jira/Stripe 範例 = 刻意)
#   - SKIP spec.md / anatomy
#
# Whitelist(不 flag):
#   - 註解 // /* */
#   - `aria-label` / `title` 等 a11y prop 若無對應 prop 可接收 → 仍 flag(warn 改成 prop)
#   - 標示 `// i18n-allow: {rationale}` 該行白名單
#
# WARN-style, 不 block.

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

FILE_PATH=$(jq -r '.tool_input.file_path // empty')

# Scope: only design-system components/patterns .tsx
if ! grep -qE 'packages/design-system/src/(components|patterns)/.*\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if grep -qE '\.(stories|principles|anatomy\.stories)\.tsx$' <<<"$FILE_PATH"; then
  exit 0
fi
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Detect hardcoded user-facing CJK / English labels via perl oneliner
# (macOS-portable: perl is always present; grep -P / pcregrep / rg 不一定有)
# 缺 perl = 這道 i18n 防線無法判 → 明確 BLOCK,不得靜默放行(fail-closed;cloud 前提宣告)。
if ! command -v perl >/dev/null 2>&1; then
  echo '🚨 _hardcoded_strings: required interpreter perl is unavailable — i18n gate cannot run(fail-closed)' >&2
  exit 2
fi
#
# Perl logic(per line):
#  1. 跳過 `// ...` 單行註解(但不影響行內其他 content 判斷 — 我們直接跳整行簡化)
#  2. 跳過 `/* ... */` 一行註解
#  3. 跳過該行含 `i18n-allow` 白名單標記
#  4. 對剩餘行偵測 JSX 文字節點 `>...<` 或字串字面量 `"..."` / `'...'`
#     內含 ≥ 3 個 CJK 字元(\p{Han} / \p{Hiragana} / \p{Katakana} / \p{Hangul})
#  5. English:narrow detection,僅當 JSX 文字節點或屬性值含 ≥ 2 個 sentence-case 詞
#
# Output: "line_num:matched_snippet"(每 file 最多 5 條)

VIOLATIONS=""

CJK_HITS=$(perl -CSD -ne '
  BEGIN {
    our $jsdoc = 0; our $console_open = 0; our $jsx_comment = 0;
    our $allow_pending = 0; our $allow_depth = 0;
    our $hit_count = 0;
  }
  # ── block-level i18n-allow:上一行有 `// i18n-allow-block` 或
  # `// i18n-allow`(單獨 comment 行)→ 標記下一個 `{...}` 區塊整個 skip ──
  if (m{^\s*(?://|/\*+)\s*i18n-allow(-block)?\b}) { $allow_pending = 1; next }
  if ($allow_pending && m{[\{\[]}) {
    $allow_pending = 0;
    my $opens = () = /[\{\[]/g; my $closes = () = /[\}\]]/g;
    $allow_depth = $opens - $closes;
    next if $allow_depth > 0;  # only enter block if net positive opens
  }
  if ($allow_depth > 0) {
    my $opens = () = /[\{\[]/g; my $closes = () = /[\}\]]/g;
    $allow_depth += $opens - $closes;
    next;
  }
  # ── JSDoc block(多行 /** ... */)── stateful ──
  if (!$jsdoc && m{/\*\*}) { $jsdoc = 1 }
  if ($jsdoc) {
    if (m{\*/}) { $jsdoc = 0 }
    next;
  }
  # ── JSX block comment(多行 {/* ... */})── stateful ──
  if (!$jsx_comment && m{\{/\*}) { $jsx_comment = 1 }
  if ($jsx_comment) {
    if (m{\*/\s*\}}) { $jsx_comment = 0 }
    next;
  }
  # ── Line-level 註解 skip ──────────────
  next if m{^\s*//};                    # single-line comment
  next if m{^\s*/\*.*\*/\s*$};          # single-line block comment
  next if m{^\s*\*};                    # stray JSDoc line
  next if m{i18n-allow};
  # ── strip trailing `//` comments(naïve:不處理 URL 等 string 內 `//`)─
  # Fix FP:`code() // CJK comment` 被誤匹配 comment 內的 CJK
  # 注意:不能用 `[^\x27"]` 限制,comment 內可能有 `"` 被 CJK 夾住
  # 簡單策略 — `//` 後到 EOL 全 strip(string 內的 `//` 罕見 → 可接受 FP trade)
  $_ =~ s{\s+//.*$}{};
  # ── dev-only console.* / throw new Error() multi-line — stateful ─
  # 這些是 DS internal dev / developer-facing diagnostics,consumer 看不到
  if (!$console_open && m{(console\.(warn|error|log|info|debug)|throw\s+new\s+(Error|TypeError|RangeError))\s*\(}) {
    $console_open = 1;
    if (m{\)\s*[;,]?\s*$}) { $console_open = 0 }
    next;
  }
  if ($console_open) {
    if (m{\)\s*[;,]?\s*$}) { $console_open = 0 }
    next;
  }
  # ── DS-internal metadata keys(designer-facing,非 end-user-facing)──
  # 典型:buttonMeta / componentMeta / story args 的 `purpose:` / `description:` / `rationale:` / `when:` / `dont:` / `note:` / `text:`(stories)
  # 匹配「行內任何位置出現 `{metadata_key}: "..."`」:如 `primary: { purpose: "..." }` 的 purpose
  next if m{\b(purpose|description|rationale|when|dont|note|tip|detail|explanation|summary)\s*:\s*[\x27"]};
  # ── JSX text node or string literal with CJK ≥ 3 ─
  if (m{([>"\047])([^<"\047]*?[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]{3,}[^<"\047]*?)([<"\047])}) {
    my $snippet = $2;
    $snippet =~ s/^\s+|\s+$//g;
    $snippet = substr($snippet, 0, 80) . "…" if length($snippet) > 80;
    print "$.:$snippet\n";
    $hit_count++;
    exit 0 if $hit_count >= 5;
  }
' "$FILE_PATH" 2>/dev/null)

if [ -n "$CJK_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Hardcoded CJK strings in DS primitive(consumer 換語言要 fork 元件):\n${CJK_HITS}\n  修法:改成 prop 接收(e.g. \`loadingText / emptyText / label\` slot)。若確實 DS 層預設(如 internal debug),在該行末加 \`// i18n-allow: {rationale}\` 白名單。"
fi

# English sentence-case labels — narrow detection
ENG_HITS=$(perl -CSD -ne '
  BEGIN { our $allow_pending = 0; our $allow_depth = 0; our $hit_count = 0; }
  # ── block-level i18n-allow(同 CJK block)─
  if (m{^\s*(?://|/\*+)\s*i18n-allow(-block)?\b}) { $allow_pending = 1; next }
  if ($allow_pending && m{[\{\[]}) {
    $allow_pending = 0;
    my $opens = () = /[\{\[]/g; my $closes = () = /[\}\]]/g;
    $allow_depth = $opens - $closes;
    next if $allow_depth > 0;  # only enter block if net positive opens
  }
  if ($allow_depth > 0) {
    my $opens = () = /[\{\[]/g; my $closes = () = /[\}\]]/g;
    $allow_depth += $opens - $closes;
    next;
  }
  # ── 註解 skip(line-level)─────────────────────
  next if m{^\s*//};
  next if m{^\s*/\*.*\*/\s*$};
  next if m{^\s*\*};
  next if m{^\s*/\*\*?\s*$};
  next if m{i18n-allow};
  next if m{console\.(warn|error|log|info|debug)\s*\(};
  next if m{className=|aria-label=|data-\w+=|href=|key=};
  if (m{>([A-Z][a-z]+ [a-z]+(?: [a-z]+)+)<} || m{[\"\047]([A-Z][a-z]+ [a-z]+(?: [a-z]+)+)[\"\047]}) {
    print "$.:$1\n";
    $hit_count++;
    exit 0 if $hit_count >= 3;
  }
' "$FILE_PATH" 2>/dev/null)

if [ -n "$ENG_HITS" ]; then
  VIOLATIONS="${VIOLATIONS}\n⚠️ Hardcoded English sentence-case labels:\n${ENG_HITS}\n  若是 user-facing label,改 prop 接收;若是 internal,加 \`// i18n-allow\` 白名單。"
fi

# ── Emit warning if any violation ────────────────────────────────────────────
if [ -n "$VIOLATIONS" ]; then
  CTX=$(printf 'i18n hygiene 檢查(24-checklist #13 gap):%b\n\nDS primitive 應 prop-driven,hardcoded 文案讓 consumer 換語言時要 fork。' "$VIOLATIONS")
  jq -n --arg ctx "$CTX" '{governanceContext:{hookEventName:"PostToolUse",message:$ctx}}'
fi

exit 0
