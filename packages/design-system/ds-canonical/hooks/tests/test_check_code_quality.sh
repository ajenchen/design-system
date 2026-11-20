#!/bin/bash
# Contract for lib/_code_quality.sh(2026-11-18 D4-02 起會擋):
#   any —— 這次新增的行沒有 `any-allow: <理由>`(同一行或上一行)→ exit 2;豁免放行;豁免沒理由照擋;既有的只列不擋。
#   tsx file-size —— 超過 800 行、沒有檔頭豁免、而且這次變長 → exit 2;沒變長只列不擋;有檔頭豁免(file-size 後面要寫理由)放行。
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

echo "Results: $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ] || exit 1
