#!/bin/bash
set -uo pipefail
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
# Component-spec zero-debt rule:
#   `packages/design-system/src/components/**/*.spec.md` may not add any benchmark escape.
#   Claims must either carry direct inline evidence or be rewritten as internal product rationale.
#
# 其他 scope 允許 escape:
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
  */packages/design-system/src/**/*.spec.md|*/packages/design-system/src/**/*.tsx) ;;
  *) exit 0 ;;
esac

NEW_CONTENT=$(echo "$INPUT" | jq -r '
  (.tool_input.content // "") + "\n" +
  (.tool_input.new_string // "") + "\n" +
  ([.tool_input.edits[]? | .new_string] | join("\n"))
' 2>/dev/null || echo "")

grep -q '[^[:space:]]' <<<"$NEW_CONTENT" || exit 0

# Component specs are the public authoring contract and completed their D9 evidence-debt
# migration in beta.107. Do not allow either a per-claim retraction or a file-level bypass to
# recreate that debt. This intentionally runs before the legacy file-level allowlist below.
case "$FILE_PATH" in
  */packages/design-system/src/components/**/*.spec.md)
    if grep -qE '@benchmark-unverified([^-[:alnum:]]|-blanket:)|@benchmark-citation-allow:' <<<"$NEW_CONTENT"; then
      cat >&2 <<EOF

┄┄┄┄ check_benchmark_citation — component spec benchmark evidence debt ┄┄┄┄

[P0 BLOCKER] ${FILE_PATH}
Component specs are a zero-debt scope: \`@benchmark-unverified\`,
\`@benchmark-unverified-blanket\`, and \`@benchmark-citation-allow\` are forbidden.

Keep the claim only with a direct inline primary-source citation that supports it;
otherwise remove the external comparison and state the DS-internal product rationale.
EOF
      exit 2
    fi
    ;;
esac

# File-level allowlist
FIRST_LINES=$(printf '%s\n' "$NEW_CONTENT" | sed -n '1,5p')
if grep -qE '@benchmark-citation-allow:|@benchmark-unverified-blanket:' <<<"$FIRST_LINES"; then
  exit 0
fi
if [ -f "$FILE_PATH" ]; then
  ON_DISK_FIRST=$(sed -n '1,5p' "$FILE_PATH" 2>/dev/null || true)
  if grep -qE '@benchmark-citation-allow:|@benchmark-unverified-blanket:' <<<"$ON_DISK_FIRST"; then
    exit 0
  fi
fi

# Detect benchmark claim keywords + check inline citation in same paragraph
# 用 perl -0777 slurp 比 awk simpler;每個含 benchmark keyword 的「段」(連續非空行)
# 必含 citation evidence。
# 缺 perl = 這道 M22 防線無法判 → 明確 BLOCK,不得靜默放行(fail-closed;cloud 前提宣告)。
if ! command -v perl >/dev/null 2>&1; then
  echo '🚨 check_benchmark_citation: required interpreter perl is unavailable — M22 citation gate cannot run(fail-closed)' >&2
  exit 2
fi
# 2026-11-05 K8(待辦總帳 3h K8 落地):
#   - 關鍵字:原 13 個名稱原樣保留在最前面,其後依 DS *.spec.md 實際出現的世界級設計系統 / 元件庫 / 產品 / 實務指引補上
#     (2026-11-05 全樹盤點 739 段 / 182 檔,見 commit 209e656f)。刻意不收:DS 自己的執行期依賴(Radix 原件 / cmdk / react-day-picker /
#     TanStack / dnd-kit …,行為宣稱由 M2 實測)、平台(瀏覽器 / 作業系統)、規範本身(WCAG / WAI-ARIA / HTML / MDN)、與一般字撞名的詞。
#   - 來源網域:原 11 個前綴保留,補 DS 規格實際引用的官網 / 原始碼託管 / 標準組織網域(含不寫 https:// 的 `github.com/...` 寫法)。
#     修掉原句的內插 bug:`@benchmark-unverified` 在 perl -ne(無 strict)裡會把 @benchmark 內插成空陣列,實際只比對 "-unverified"。
#   - .tsx 只看**註解**與 `note=` 說明文字(範例資料裡的「label: Slack」「Notion 公告頁」不是對照宣稱 —— 擴到產品名後會誤擋 73 段);
#     .md 不看 ``` 程式碼框裡的內容(範例圖 / 決策樹裡的產品名)。來源一律在**整段原文**裡找(註解外的網址也算)。
#   - 與一般術語撞名的兩個:「Linear vs Non-linear」(線性 / 非線性步驟)、「Gestalt proximity」(完形接近律)不算產品名。
#   - 仍是段落層級:段裡有一家的來源、另一家沒有(partial)擋不到 —— 要逐家對網域,留待之後(k8/summary.json hookFindingsForLaterStep)。
IS_TSX=0
case "$FILE_PATH" in *.tsx) IS_TSX=1 ;; esac
VIOLATIONS=$(printf '%s' "$NEW_CONTENT" | IS_TSX="$IS_TSX" perl -0777 -ne '
  my $bench = qr/(Ant Design|Material(\s+X|\s+Design|\s+UI|\s+3)?|Polaris|Atlassian|Carbon|shadcn|Radix UI?|Apple HIG|Notion|Airtable|ClickUp|Figma|Linear(?! vs Non-linear)|\bAnt\b|\bantd\b|\bMUI\b|Base UI|Headless UI|React Aria|react-aria|React Spectrum|react-spectrum|\bSpectrum\b|\bAdobe\b|[Dd]ownshift|Ariakit|Reach UI|Chakra|Mantine|Bootstrap|Fluent|Primer|Cloudscape|Gestalt(?! proximity)|PatternFly|GOV\.UK|Salesforce|Lightning Design|\bSLDS\b|\bSAP\b|Fiori|Element (?:UI|Plus)|\bArco\b|PrimeReact|PrimeNG|Vuetify|\bEUI\b|Elastic UI|Zendesk|Vercel|\bGeist\b|react-select|\brc-[a-z][a-z-]*|react-component|AG Grid|ag-grid|Handsontable|\bGlide\b|Swiper|PhotoSwipe|\bVaul\b|Floating UI|floating-ui|Popper\.js|popper\.js|GitHub(?!\s*(?:issue|Issue|Actions|PR|Release|release|API|token|App\b))|Jira|Confluence|Trello|Asana|monday\.com|Slack|Discord|\bTeams\b|Gmail|Google|Excel|Outlook|Microsoft|Dropbox|Stripe|Shopify|VS ?Code|VSCode|Visual Studio|Raycast|Spotlight|\bFinder\b|ChatGPT|OpenAI|\bClaude\b(?!\s*(?:\+|＋|Code|code|\/\s*Codex|與\s*Codex|和\s*Codex))|Copilot|\bCanva\b|\bMiro\b|\bCursor\b(?!\.)|\bApple\b|\bHIG\b|Docusaurus|\bAPG\b|Authoring Practices|NN\/g|Nielsen Norman)/;
  my $host = qr/(?:github\.com|githubusercontent\.com|unpkg\.com|jsdelivr\.net|npmjs\.com|npmjs\.org|w3\.org|w3c\.github\.io|whatwg\.org|developer\.mozilla\.org|radix-ui\.com|mui\.com|material\.io|ant\.design|atlassian\.design|atlassian\.com|atlassian\.net|carbondesignsystem\.com|polaris\.shopify\.com|polaris-react\.shopify\.com|shopify\.dev|shopify\.com|primer\.style|styleguide\.github\.com|ui\.shadcn\.com|apple\.com|google\.com|android\.com|chromium\.org|googlesource\.com|microsoft\.com|microsoft\.design|fluentui\.dev|visualstudio\.com|adobe\.com|base-ui\.com|headlessui\.com|downshift-js\.com|ariakit\.org|chakra-ui\.com|mantine\.dev|getbootstrap\.com|cloudscape\.design|gestalt\.pinterest\.com|patternfly\.org|service\.gov\.uk|lightningdesignsystem\.com|salesforce\.com|sap\.com|element-plus\.org|arco\.design|primereact\.org|vuetifyjs\.com|elastic\.co|zendesk\.com|vercel\.com|react-select\.com|ag-grid\.com|handsontable\.com|glideapps\.com|swiperjs\.com|photoswipe\.com|floating-ui\.com|notion\.so|notion\.com|airtable\.com|clickup\.com|figma\.com|linear\.app|trello\.com|asana\.com|monday\.com|slack\.com|discord\.com|dropbox\.com|stripe\.com|raycast\.com|openai\.com|anthropic\.com|claude\.com|canva\.com|miro\.com|cursor\.com|docusaurus\.io|nngroup\.com|tanstack\.com|dndkit\.com|daypicker\.dev|react-day-picker\.js\.org|cmdk\.paco\.me|embla-carousel\.com|recharts\.org|emilkowal\.ski|tailwindcss\.com|react\.dev|reactjs\.org|todoist\.com|teambition\.com|refine\.dev|marmelab\.com|d3js\.org|adrianroselli\.com)/;
  my $cite = qr/(https?:\/\/(www\.)?(m3\.material|ant-design|material|polaris\.shopify|atlassian\.design|carbon|shadcn|ui\.shadcn|radix-ui|github|developer\.apple)|https?:\/\/([a-z0-9-]+\.)*$host\b|(?<![\w.\/-])([a-z0-9-]+\.)*$host\/[\w.~%\/#-]|#L\d|snapshots\/|\@benchmark-unverified)/;
  my $tsx = $ENV{IS_TSX};
  # 只留「要檢查宣稱」的文字,行數與空行原樣保留(段落切法不變):
  #   tsx → 註解(// … / /* … */ / {/* … */})與 note="…" / note={`…`};其餘程式碼換成一個佔位字
  #   md  → ``` 程式碼框內換成佔位字
  my @lines = split /\n/, $_, -1;
  my @scan;
  my ($inBlock, $inFence) = (0, 0);
  for my $l (@lines) {
    if (!$tsx) {
      if ($l =~ /^\s*(```|~~~)/) { $inFence = !$inFence; push @scan, "."; next }
      push @scan, ($inFence ? ($l =~ /\S/ ? "." : "") : $l);
      next;
    }
    if ($l !~ /\S/) { push @scan, ""; next }
    my $keep = "";
    my $rest = $l;
    while (length $rest) {
      if ($inBlock) {
        if ($rest =~ s/^(.*?)\*\///s) { $keep .= " $1"; $inBlock = 0 } else { $keep .= " $rest"; $rest = "" }
        next;
      }
      if ($rest =~ s/^.*?(\/\*|\/\/)//s) {
        if ($1 eq "//") { $keep .= " $rest"; $rest = "" } else { $inBlock = 1 }
      } else { $rest = "" }
    }
    while ($l =~ /\bnote=(?:\{\s*)?(["\x27`])(.*?)\1/g) { $keep .= " $2" }
    push @scan, ($keep =~ /\S/ ? $keep : ".");
  }
  my @orig = @lines;
  # 依原文空行切段,同一段的「檢查文字」與「原文」一起看
  my @paraScan; my @paraOrig; my $s = ""; my $o = "";
  for my $i (0 .. $#orig) {
    if ($orig[$i] !~ /\S/) { if (length $o) { push @paraScan, $s; push @paraOrig, $o } $s = ""; $o = ""; next }
    $s .= "$scan[$i]\n"; $o .= "$orig[$i]\n";
  }
  if (length $o) { push @paraScan, $s; push @paraOrig, $o }
  for my $k (0 .. $#paraScan) {
    my ($ps, $po) = ($paraScan[$k], $paraOrig[$k]);
    next unless $ps =~ $bench;
    # Skip paragraphs that ARE source citations(URL line itself)
    next if $po =~ /^\s*[\*-]?\s*https?:\/\//;
    # Has citation? OK
    next if $po =~ $cite;
    # Violation:claim 但沒 cite
    my $first_line = (split /\n/, $po)[0];
    print "  - " . substr($first_line, 0, 80) . "...\n";
  }
'
)

if [ -n "$VIOLATIONS" ]; then
  cat >&2 <<EOF

┄┄┄┄ check_benchmark_citation — world-class benchmark claim 缺 source ┄┄┄┄

[P0 BLOCKER] ${FILE_PATH}
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
  # P0 BLOCKER(2026-07-07 治理進化方向 2:對齊 user 2026-05-27 doctrine「SSOT canonical
  # 必 P0 BLOCKER 禁 P1 WARN」— escape 已備:@benchmark-unverified 逐句撤回 /
  # @benchmark-citation-allow / @benchmark-unverified-blanket 檔級,故升級不增誤殺)
  exit 2
fi

exit 0
