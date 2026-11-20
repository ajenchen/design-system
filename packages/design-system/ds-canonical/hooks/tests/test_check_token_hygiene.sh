#!/bin/bash
# Contract for the token-hygiene helper(2026-11-18 D4-02 起會擋):五條規則各一組兩面對照 ——
# 這次新增的違規行 → exit 2(只寫 stderr);同一行寫豁免 + 理由 → 放行;豁免沒寫理由 → 照擋;
# 違規在既有行(不是這次新增)→ exit 0 + governanceContext「既有」清單。
# Edit / MultiEdit 兩種輸入形狀都測:provider 原樣(new_string / edits[])與正式入口 run-provider-hook.mjs 的(content + old_string)。
# 另驗:registry 仍只讀 runner 認證的 corpus(專案裡的可變副本不得覆蓋),corpus 缺 registry → fail closed。

set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/_token_hygiene.sh"
REPO_ROOT=$(git -C "$(dirname "$HOOK")" rev-parse --show-toplevel)
REGISTRY="$REPO_ROOT/packages/design-system/src/tokens/utility-registry.json"
TMP=$(mktemp -d)
[ -n "${TMP:-}" ] && [ -d "$TMP" ] || { echo "❌ mktemp -d failed(TMP;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
FILE="$PROJECT/packages/design-system/src/components/Foo/foo.tsx"
BAD_CORPUS="$TMP/bad-corpus"
mkdir -p "$(dirname "$FILE")" "$BAD_CORPUS"
STDOUT_FILE="$TMP/stdout"
STDERR_FILE="$TMP/stderr"
PASS=0
FAIL=0

# run_payload <payload> [corpus]
run_payload() {
  local payload="$1" corpus="${2:-$REPO_ROOT}"
  set +e
  printf '%s' "$payload" \
    | GOVERNANCE_PROJECT_DIR="$PROJECT" GOVERNANCE_CORPUS_ROOT="$corpus" \
      GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$STDOUT_FILE" 2>"$STDERR_FILE"
  EXIT=$?
  set -e
}

# write_and_run <file content> [corpus] —— Write 一個新檔(不在 git 裡 → 每一行都是新增)
write_and_run() {
  printf '%s\n' "$1" > "$FILE"
  run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}')" "${2:-$REPO_ROOT}"
}

ok() { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad() {
  FAIL=$((FAIL + 1)); printf '  FAIL  %s(exit %s)\n' "$1" "$EXIT"
  sed 's/^/    stdout: /' "$STDOUT_FILE"; sed 's/^/    stderr: /' "$STDERR_FILE"
}
expect_block() { # <name> <needle>
  if [ "$EXIT" -eq 2 ] && [ ! -s "$STDOUT_FILE" ] && grep -qF -- "$2" "$STDERR_FILE" \
    && ! grep -qF 'GOVERNANCE_INTEGRITY' "$STDERR_FILE"; then ok "$1"; else bad "$1"; fi
}
expect_clean() { # <name>
  if [ "$EXIT" -eq 0 ] && [ ! -s "$STDOUT_FILE" ] && [ ! -s "$STDERR_FILE" ]; then ok "$1"; else bad "$1"; fi
}
expect_existing() { # <name> <needle>
  if [ "$EXIT" -eq 0 ] && [ ! -s "$STDERR_FILE" ] \
    && jq -e --arg n "$2" '
      keys == ["governanceContext"]
      and .governanceContext.hookEventName == "PostToolUse"
      and (.governanceContext.message | contains("既有違規") and contains($n))
    ' "$STDOUT_FILE" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi
}

set -e
echo '=== token hygiene helper(blocking since D4-02)==='

write_and_run 'export const Clean = () => <div className="bg-surface" />'
expect_clean 'clean component stays silent'

# ── registry 名單閉包:每一個 alias 都擋 ──
while IFS= read -r ALIAS; do
  write_and_run "export const Bad = () => <div className=\"$ALIAS\" />"
  expect_block "registry alias closure blocks:$ALIAS" "$ALIAS"
done < <(jq -r '.shadcn_alias.block.color_alias[]' "$REGISTRY")

# ── 專案裡的可變 registry 不得覆蓋認證過的 corpus ──
SHADOW="$PROJECT/packages/design-system/src/tokens/utility-registry.json"
mkdir -p "$(dirname "$SHADOW")"
printf '{"schemaVersion":1,"shadcn_alias":{"block":{"color_alias":["shadow-only"]}}}\n' > "$SHADOW"
write_and_run 'export const Bad = () => <div className="bg-card" />'
expect_block 'mutable project registry cannot shadow the authenticated corpus' 'bg-card'

write_and_run 'export const Bad = () => <div className="bg-card" />' "$BAD_CORPUS"
if [ "$EXIT" -eq 70 ] && [ ! -s "$STDOUT_FILE" ] && grep -qF 'GOVERNANCE_INTEGRITY:' "$STDERR_FILE"; then
  ok 'missing authenticated registry fails closed'
else
  bad 'missing authenticated registry fails closed'
fi

# ── 五條規則各自的兩面:擋 / 豁免放行 / 豁免沒理由照擋 ──
# Check 1 shadcn alias(豁免 @token-registry-ok,與 PreToolUse check_opacity_token_usage.sh 同一個標記)
write_and_run '<div className="bg-popover" />'
expect_block 'C1 shadcn alias on a new line blocks' 'shadcn compat alias'
write_and_run '<div className="bg-popover" /> // @token-registry-ok: Radix 第三方覆寫示範'
expect_clean 'C1 escape with rationale passes'
write_and_run '<div className="bg-popover" /> // @token-registry-ok:'
expect_block 'C1 escape without rationale still blocks' 'shadcn compat alias'
# 收窄的對照(純註解行不算用法):同一個 alias 寫在註解行放行、寫在 className 照擋
write_and_run ' * shadcn 現行版是 focus:bg-accent,本 DS 刻意不同'
expect_clean 'C1 alias inside a comment line is not usage'
write_and_run '<div className="focus:bg-accent" />'
expect_block 'C1 same alias in className still blocks (comment narrowing keeps protection)' 'shadcn compat alias'

# Check 2 Tailwind v4 [--foo]
write_and_run '<div className="w-[--sidebar-width]" />'
expect_block 'C2 [--foo] shorthand on a new line blocks' '[--foo] 簡寫'
write_and_run '<div className="w-[--sidebar-width]" /> // @css-var-shorthand-ok: 第三方 class 字串原樣轉傳'
expect_clean 'C2 escape with rationale passes'
write_and_run '<div className="w-[var(--sidebar-width)] [&[data-open]]:block" />'
expect_clean 'C2 var() wrapper and arbitrary variants are not the shorthand'

# Check 3 Tailwind 預設陰影
write_and_run '<div className="shadow-md" />'
expect_block 'C3 Tailwind default shadow on a new line blocks' 'Tailwind 預設陰影'
write_and_run '<div className="shadow-md" /> // @token-registry-ok: 對照組示範'
expect_clean 'C3 escape with rationale passes'

# Check 4 原料色名
write_and_run '<div className="bg-neutral-3 text-turquoise-6" />'
expect_block 'C4 primitive color utility on a new line blocks' '原料色名'
write_and_run '<div className="bg-neutral-3" /> // @token-registry-ok: 類別色例外'
expect_clean 'C4 escape with rationale passes'

# Check 5 原生 overflow
write_and_run '<div className="min-h-0 overflow-y-auto" />'
expect_block 'C5 native overflow on a new line blocks' '原生 overflow'
write_and_run '<div className="overflow-x-auto" /> // @native-overflow-ok: DataTable 中央捲動區走原生捲軸(scroll-area.spec.md「何時用」)'
expect_clean 'C5 escape with rationale passes'
write_and_run '<div className="overflow-x-auto" /> // @native-overflow-ok:'
expect_block 'C5 escape without rationale still blocks' '原生 overflow'
# 2026-11-18 修排除式:`overflow-x-auto overflow-y-hidden [scrollbar-width:none]`(Tabs 的寫法)是刻意隱藏水平捲軸
write_and_run '<div className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />'
expect_clean 'C5 hidden horizontal scrollbar with overflow-y-hidden is the horizontal-overflow pattern'
# 收窄的對照:垂直捲動配隱藏捲軸不在例外裡,照擋
write_and_run '<div className="overflow-y-auto [scrollbar-width:none]" />'
expect_block 'C5 vertical overflow with a hidden scrollbar still blocks (narrowing keeps protection)' '原生 overflow'

# ── 新增 vs 既有:Edit 只新增乾淨的行 → 既有違規只列不擋 ──
printf '%s\n' 'const label = 1' '<div className="overflow-auto" />' > "$FILE"
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"const label = 0",new_string:"const label = 1"}}')"
expect_existing 'Edit that adds only a clean line reports the old overflow as existing, not a block' 'overflow-auto'
# 同一個檔、這次 Edit 新增的正是那一行 → 擋
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"<div />",new_string:"<div className=\"overflow-auto\" />"}}')"
expect_block 'Edit that adds the violating line blocks' '原生 overflow'
# MultiEdit:PreToolUse 那支看不到 edits[],這裡要擋
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"MultiEdit",tool_input:{file_path:$path,edits:[{old_string:"a",new_string:"b"},{old_string:"<div />",new_string:"<div className=\"overflow-auto\" />"}]}}')"
expect_block 'MultiEdit edits[] adding the violating line blocks' '原生 overflow'

# ── 片段 Edit:old_string / new_string 只是一行中間的幾個字 → 被改到的那一整行算新增 ──
# 兩面對照(2026-11-20):舊判法拿 new_string 的「行」去比檔案的整行,片段永遠比不到,下面第一格會是 exit 0 + 既有(漏擋)。
printf '%s\n' 'const label = 1' '<div className="p-2 shadow-md" />' > "$FILE"
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"p-2\"",new_string:"p-2 shadow-md\""}}')"
expect_block 'partial-line Edit that adds a violation mid-line blocks' 'Tailwind 預設陰影'
# 對照:同一個檔,片段 Edit 改的是別行 → 那一行的既有違規只列不擋
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:"= 0",new_string:"= 1"}}')"
expect_existing 'partial-line Edit on another line leaves that line'"'"'s violation as existing' 'shadow-md'
# MultiEdit 後面的 edit 又改掉了前面那筆的 new_string(在寫完的檔裡找不到)→ 退回寬判,含那段文字的行照擋
printf '%s\n' '<div className="shadow-md" />' 'const bar = 1' > "$FILE"
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"MultiEdit",tool_input:{file_path:$path,edits:[{old_string:"PLACEHOLDER",new_string:"<div className=\"shadow-md\" />\nconst foo = 1"},{old_string:"const foo = 1",new_string:"const bar = 1"}]}}')"
expect_block 'MultiEdit whose earlier new_string was rewritten later still blocks the line it added' 'Tailwind 預設陰影'

# ── 正式入口的形狀(WP-15a 審查必修 1):scripts/run-provider-hook.mjs 交給 hook 的 event-v1 輸入沒有 new_string、
#    沒有 edits[],只有 content(這次寫進去的文字;MultiEdit 是每筆 new_string 用換行接起來)與第一筆的 old_string。
#    兩面對照(2026-11-20):修正前只認 new_string / edits[],下面每一格「擋」都是 exit 0 + 既有(正式路徑上從沒擋過);
#    「既有」的格修正前後都是既有(寬判不把別行的既有違規算成新增)。
runner_payload() { # <tool> <old_string> <content> —— 欄位照 run-provider-hook.mjs 的逐檔 payload(file_path / path / old_string / content)
  jq -nc --arg path "$FILE" --arg tool "$1" --arg o "$2" --arg c "$3" \
    '{hook_event_name:"PostToolUse",tool_name:$tool,tool_input:{file_path:$path,path:$path,old_string:$o,content:$c}}'
}
printf '%s\n' 'const label = 1' '<div className="p-2 shadow-md" />' > "$FILE"
run_payload "$(runner_payload Edit 'p-2"' 'p-2 shadow-md"')"
expect_block 'runner-shape Edit (content + old_string, no new_string) adding a violation mid-line blocks' 'Tailwind 預設陰影'
run_payload "$(runner_payload Edit '= 0' '= 1')"
expect_existing 'runner-shape Edit on another line leaves that line'"'"'s violation as existing' 'shadow-md'
printf '%s\n' 'const label = 1' '<div className="p-2 overflow-auto" />' 'const other = 2' > "$FILE"
run_payload "$(runner_payload MultiEdit '= 0' "$(printf '%s\n%s' '= 1' 'p-2 overflow-auto"')")"
expect_block 'runner-shape MultiEdit (joined content, first old_string only) adding a violation blocks' '原生 overflow'
run_payload "$(runner_payload MultiEdit '= 0' "$(printf '%s\n%s' '= 1' 'other = 2')")"
expect_existing 'runner-shape MultiEdit touching only clean lines leaves the old overflow as existing' 'overflow-auto'
# 純刪除走正式入口時不帶 content(new_string 空)→ 拿不到可比對的文字,不得讀成「沒有新增行」→ 退回 git HEAD 比對;
# 這個檔不在 git 裡 = 整檔都算新增(寧可多判)。另一面(違規行已在 HEAD = 既有)在下面 Write 那段的 git fixture 裡。
run_payload "$(jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,path:$path,old_string:" stale"}}')"
expect_block 'runner-shape Edit with nothing comparable falls back to git HEAD instead of reading as no added line' '原生 overflow'

# ── Write 覆寫一個已在 git HEAD 的檔:HEAD 裡已有的違規行是既有,新多的違規行才擋 ──
GIT_FIX=$(mktemp -d)
[ -n "${GIT_FIX:-}" ] && [ -d "$GIT_FIX" ] || { echo "❌ mktemp -d failed(GIT_FIX;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
GIT_FILE="$GIT_FIX/packages/design-system/src/components/Bar/bar.tsx"
mkdir -p "$(dirname "$GIT_FILE")"
printf '%s\n' '<div className="overflow-auto" />' > "$GIT_FILE"
git -C "$GIT_FIX" init -q
git -C "$GIT_FIX" add -A
git -C "$GIT_FIX" -c user.name=fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -q -m fixture
printf '%s\n' '<div className="overflow-auto" />' 'const added = 1' > "$GIT_FILE"
run_payload "$(jq -nc --arg path "$GIT_FILE" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}')"
expect_existing 'Write over a tracked file treats lines already in HEAD as existing' 'overflow-auto'
printf '%s\n' '<div className="overflow-auto" />' '<div className="shadow-lg" />' > "$GIT_FILE"
run_payload "$(jq -nc --arg path "$GIT_FILE" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}')"
expect_block 'Write over a tracked file blocks the line that is not in HEAD' 'Tailwind 預設陰影'
# 正式入口的純刪除(不帶 content)退回 git HEAD 比對的另一面:刪掉剛加的那行之後,剩下的違規行在 HEAD 裡 = 既有,不擋
printf '%s\n' '<div className="overflow-auto" />' > "$GIT_FILE"
run_payload "$(jq -nc --arg path "$GIT_FILE" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,path:$path,old_string:"<div className=\"shadow-lg\" />\n"}}')"
expect_existing 'runner-shape deletion on a tracked file keeps lines already in HEAD as existing' 'overflow-auto'
rm -rf "$GIT_FIX"

echo "Passed: $PASS / $((PASS + FAIL))"
[ "$FAIL" -eq 0 ] && echo '✅ token hygiene helper: block / escape / existing / registry closure PASS'
[ "$FAIL" -eq 0 ]
