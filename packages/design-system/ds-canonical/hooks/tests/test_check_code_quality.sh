#!/bin/bash
# Contract for lib/_code_quality.sh(2026-11-18 D4-02 起會擋):
#   any —— 這次新增的行沒有 `any-allow: <理由>`(同一行或上一行)→ exit 2;豁免放行;豁免沒理由照擋;既有的只列不擋。
#   tsx file-size —— 超過 800 行、沒有檔頭豁免、而且這次變長 → exit 2;沒變長只列不擋;有檔頭豁免(file-size 後面要寫理由)放行。
#   兩條都測兩種輸入形狀:provider 原樣(new_string)與正式入口 run-provider-hook.mjs 的(content + old_string)。
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/_code_quality.sh"
[ -x "$HOOK" ] || { echo "FATAL: hook not exec"; exit 1; }
TMP=$(mktemp -d)
[ -n "${TMP:-}" ] && [ -d "$TMP" ] || { echo "❌ mktemp -d failed(TMP;TMPDIR=${TMPDIR:-unset});fixture unavailable" >&2; exit 1; }
trap 'rm -rf "$TMP"' EXIT
FILE="$TMP/packages/design-system/src/components/Foo/foo.tsx"
mkdir -p "$(dirname "$FILE")"
PASS=0; FAIL=0

run_payload() {
  set +e
  printf '%s' "$1" | GOVERNANCE_READ_ONLY=1 bash "$HOOK" >"$TMP/stdout" 2>"$TMP/stderr"
  EXIT=$?
  set -e
}
write_payload() { jq -nc --arg path "$FILE" '{hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$path}}'; }
edit_payload() { jq -nc --arg path "$FILE" --arg o "$1" --arg n "$2" '{hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$path,old_string:$o,new_string:$n}}'; }
# 正式入口 scripts/run-provider-hook.mjs 交給 hook 的形狀:沒有 new_string、沒有 edits[],只有 content(MultiEdit = 每筆 new_string
# 用換行接起來)與第一筆 old_string;純刪除時連 content 都不帶(第 4 個參數給空字串)。
runner_payload() { # <file> <tool> <old_string> <content>
  jq -nc --arg path "$1" --arg tool "$2" --arg o "$3" --arg c "$4" \
    '{hook_event_name:"PostToolUse",tool_name:$tool,tool_input:({file_path:$path,path:$path,old_string:$o} + (if $c == "" then {} else {content:$c} end))}'
}
ok() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1(exit $EXIT)"; sed 's/^/    stdout: /' "$TMP/stdout"; sed 's/^/    stderr: /' "$TMP/stderr"; }
expect_block() { if [ "$EXIT" -eq 2 ] && [ ! -s "$TMP/stdout" ] && grep -qF -- "$2" "$TMP/stderr"; then ok "$1"; else bad "$1"; fi; }
expect_clean() { if [ "$EXIT" -eq 0 ] && [ ! -s "$TMP/stdout" ] && [ ! -s "$TMP/stderr" ]; then ok "$1"; else bad "$1"; fi; }
expect_existing() {
  if [ "$EXIT" -eq 0 ] && [ ! -s "$TMP/stderr" ] \
    && jq -e --arg n "$2" '.governanceContext.hookEventName == "PostToolUse" and (.governanceContext.message | contains("既有違規") and contains($n))' "$TMP/stdout" >/dev/null 2>&1
  then ok "$1"; else bad "$1"; fi
}

set -e
echo '=== code quality helper(blocking since D4-02)==='

run_payload "$(jq -nc '{tool_name:"Write",tool_input:{file_path:"/tmp/random.txt",content:"x"}}')"
expect_clean 'non-matching file stays silent'

# ── any ──
printf '%s\n' 'const value: any = load()' > "$FILE"
run_payload "$(write_payload)"
expect_block 'new `: any` without any-allow blocks' 'TypeScript `any`'

printf '%s\n' '// any-allow: TanStack ColumnDef TValue idiom' 'const value: any = load()' > "$FILE"
run_payload "$(write_payload)"
expect_clean 'any-allow with rationale on the previous line passes'

printf '%s\n' 'const value = raw as any // any-allow: lib.dom 還沒有 field-sizing' > "$FILE"
run_payload "$(write_payload)"
expect_clean 'any-allow with rationale on the same line passes'

printf '%s\n' 'const value = raw as any // any-allow:' > "$FILE"
run_payload "$(write_payload)"
expect_block 'any-allow without rationale still blocks' 'TypeScript `any`'

printf '%s\n' 'const label = "many"' 'const kind = "any"' > "$FILE"
run_payload "$(write_payload)"
expect_clean 'the word any inside a string literal is not a type'

printf '%s\n' 'const value: any = load()' 'const next = 1' > "$FILE"
run_payload "$(edit_payload 'const next = 0' 'const next = 1')"
expect_existing 'edit that adds only a clean line reports the old any as existing' 'TypeScript `any`'

run_payload "$(edit_payload 'const value = load()' 'const value: any = load()')"
expect_block 'edit that adds the any line blocks' 'TypeScript `any`'

# 片段 Edit(只改一行中間幾個字)加進 any → 那一整行算新增,照擋(2026-11-20 前的整行比對會漏)
printf '%s\n' 'const value: any = load()' 'const next = 1' > "$FILE"
run_payload "$(edit_payload 'value = load' 'value: any = load')"
expect_block 'partial-line edit that adds any mid-line blocks' 'TypeScript `any`'

# 正式入口的形狀(WP-15a 審查必修 1)兩面:修正前沒有 new_string 就讀成「沒有新增行」,第一格是 exit 0 + 既有(漏擋)
printf '%s\n' 'const value: any = load()' 'const next = 1' > "$FILE"
run_payload "$(runner_payload "$FILE" Edit 'value = load' 'value: any = load')"
expect_block 'runner-shape Edit (content + old_string) that adds any mid-line blocks' 'TypeScript `any`'
run_payload "$(runner_payload "$FILE" Edit 'next = 0' 'next = 1')"
expect_existing 'runner-shape Edit on another line reports the old any as existing' 'TypeScript `any`'

# ── tsx file-size ──
awk 'BEGIN { for (i = 0; i < 820; i++) print "export const v" i " = " i }' > "$FILE"
run_payload "$(edit_payload 'export const v1 = 1' "$(printf 'export const v1 = 1\nexport const w = 2')")"
expect_block 'tsx over 800 lines that grows in this edit blocks' 'file-size P0'

run_payload "$(edit_payload "$(printf 'export const v1 = 1\nexport const w = 2')" 'export const v1 = 1')"
expect_existing 'tsx over 800 lines that does not grow is existing, not a block' 'file-size'

run_payload "$(edit_payload 'export const v1 = 0' 'export const v1 = 1')"
expect_existing 'same-length edit to an oversized tsx is existing, not a block' 'file-size'

run_payload "$(write_payload)"
expect_block 'new oversized tsx file (not in git HEAD) counts as growth' 'file-size P0'

{ echo '// code-quality-allow: file-size foundational composite(Sidebar 同型)'; cat "$FILE"; } > "$FILE.next"
mv "$FILE.next" "$FILE"
run_payload "$(edit_payload 'export const v1 = 1' "$(printf 'export const v1 = 1\nexport const w = 2')")"
expect_clean 'header file-size exemption lets an oversized tsx grow'

# 兩面對照:同一個檔頭豁免拿掉理由(只剩 `file-size`)→ 不算豁免,照擋
{ echo '// code-quality-allow: file-size'; tail -n +2 "$FILE"; } > "$FILE.next"
mv "$FILE.next" "$FILE"
run_payload "$(edit_payload 'export const v1 = 1' "$(printf 'export const v1 = 1\nexport const w = 2')")"
expect_block 'header file-size exemption without a rationale does not exempt' 'file-size P0'

# ── file-size 走正式入口的形狀(WP-15a 審查必修 2)──
# Edit:content 就是那一筆的 new_string → 照逐筆算;MultiEdit(content 是接起來的、old_string 只有第一筆)與純刪除
# → 改比寫完的行數與 git HEAD 版本,訊息照實寫是哪一種比法。
# 兩面對照:修正前淨增只算 new_string / edits[],正式入口拿不到 → 兩格「擋」都是 exit 0 + 「既有;這次沒有變長」(訊息也不實)。
REPO_FIX="$TMP/repo"
BIG="$REPO_FIX/packages/design-system/src/components/Big/big.tsx"
mkdir -p "$(dirname "$BIG")"
awk 'BEGIN { for (i = 0; i < 820; i++) print "export const v" i " = " i }' > "$BIG"
git -C "$REPO_FIX" init -q
git -C "$REPO_FIX" add -A
git -C "$REPO_FIX" -c user.name=fixture -c user.email=fixture@example.invalid -c commit.gpgsign=false commit -q -m fixture
awk 'BEGIN { for (i = 0; i < 820; i++) { print "export const v" i " = " i; if (i == 1) print "export const w = 2" } }' > "$BIG"
run_payload "$(runner_payload "$BIG" Edit 'export const v1 = 1' "$(printf '%s\n%s' 'export const v1 = 1' 'export const w = 2')")"
expect_block 'runner-shape Edit that grows an oversized tsx blocks (counted per edit)' '這次編輯又多了 1 行'
run_payload "$(runner_payload "$BIG" MultiEdit 'export const v1 = 1' "$(printf '%s\n%s\n%s' 'export const v1 = 1' 'export const w = 2' 'export const v5 = 5')")"
expect_block 'runner-shape MultiEdit on an oversized tsx longer than git HEAD blocks' '比 git HEAD 版本多了 1 行'
awk 'BEGIN { for (i = 0; i < 820; i++) print "export const v" i " = " (i == 5 ? 6 : i) }' > "$BIG"
run_payload "$(runner_payload "$BIG" MultiEdit 'export const v5 = 5' 'export const v5 = 6')"
expect_existing 'runner-shape MultiEdit leaving an oversized tsx as long as git HEAD is existing' '沒有比 git HEAD 版本長'
run_payload "$(runner_payload "$BIG" Edit 'export const v5 = 5' 'export const v5 = 6')"
expect_existing 'runner-shape same-length Edit on an oversized tsx is existing' '這次編輯沒有變長'
run_payload "$(runner_payload "$BIG" Edit 'export const w = 2' '')"
expect_existing 'runner-shape deletion (no content) compares with git HEAD and is existing when not longer' '沒有比 git HEAD 版本長'

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1
