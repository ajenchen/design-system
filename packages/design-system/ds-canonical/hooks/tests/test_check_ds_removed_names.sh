#!/usr/bin/env bash
# 「DS 已移除 / 改名的名字」那一段的對照組 —— 經由 check_consumer_code_quality.sh 觸發(判定住 hooks/lib/_ds_removed_names.sh;
# 2026-11-16 併進消費端品質 hook,不另佔 hook 數)。名單 = corpus 裡的真實變更帳本,經唯一實作 ledger.mjs 投影。
# 舊名必紅並附新名 / 做法 / 規格;同名參數在別的元件、目前仍存在的名字、註解與引文(decoy)必綠;
# .css 與 docs/*.md 不在品質檢查範圍,只跑名單檢查;名單壞了 / 不見 = 儀器失效。
set -uo pipefail
HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/check_consumer_code_quality.sh"
REPO_ROOT=$(git -C "$(dirname "$HOOK")" rev-parse --show-toplevel)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ds-removed-names-test.XXXXXX")
[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "FAIL setup: mktemp -d did not yield a directory (TMPDIR=${TMPDIR:-unset})"; exit 1; }
trap 'rm -rf "$TMP"' EXIT
PROJECT="$TMP/project"
mkdir -p "$PROJECT/apps/demo/src" "$PROJECT/docs" "$PROJECT/governance"
export GOVERNANCE_PROJECT_DIR="$PROJECT"
export GOVERNANCE_CORPUS_ROOT="$REPO_ROOT"
PASS=0
payload() { jq -nc --arg p "$1" --arg e "${2:-PostToolUse}" '{hook_event_name:$e,tool_name:"Write",tool_input:{file_path:$p}}'; }
expect() {
  local want="$1" label="$2" file="$3" event="${4:-PostToolUse}"
  set +e; payload "$file" "$event" | bash "$HOOK" >/dev/null 2>"$TMP/stderr"; local got=$?; set -e
  [ "$got" -eq "$want" ] || { echo "FAIL $label: expected $want got $got"; sed 's/^/  /' "$TMP/stderr"; exit 1; }
  PASS=$((PASS + 1))
}
set -e
CODE="$PROJECT/apps/demo/src/App.tsx"
CSS="$PROJECT/apps/demo/src/app.css"
DOC="$PROJECT/docs/guide.md"
OVERLAY="$PROJECT/governance/overlay.md"
DS="import { Button, DialogContent, Popover } from '@qijenchen/design-system'"

printf '%s\nexport const A = () => <Button width="fill">送出</Button>\n' "$DS" > "$CODE"; expect 0 clean-current-api "$CODE"
printf "import { dataTableFilterMatch } from '@qijenchen/design-system'\nexport const f = dataTableFilterMatch\n" > "$CODE"; expect 2 removed-export "$CODE"
grep -qF 'GOV-DS-REMOVED-NAMES-001' "$TMP/stderr" || { echo 'FAIL removed-export-code: stderr lacks GOV-DS-REMOVED-NAMES-001'; exit 1; }
printf '%s\nexport const A = () => <DialogContent maxWidth={480}>x</DialogContent>\n' "$DS" > "$CODE"; expect 2 removed-prop-on-its-component "$CODE"
grep -qF 'DialogContent maxWidth' "$TMP/stderr" && grep -qF '改用 width' "$TMP/stderr" \
  || { echo 'FAIL removed-prop-message: stderr lacks the component + new name'; exit 1; }
printf '%s\nexport const A = () => <Popover maxWidth={480}>x</Popover>\n' "$DS" > "$CODE"; expect 0 same-prop-name-on-another-component "$CODE"
printf '%s\nexport const A = () => <div className="rounded-[var(--radius-xs)]" />\n' "$DS" > "$CODE"; expect 2 removed-token-in-class-string "$CODE"
grep -qF '改用 --radius-sm' "$TMP/stderr" && grep -qF 'node_modules/@qijenchen/design-system/src/tokens/radius/radius.spec.md「四檔」' "$TMP/stderr" \
  || { echo 'FAIL removed-token-message: stderr lacks the new name or the shipped spec section'; sed 's/^/  /' "$TMP/stderr"; exit 1; }
printf '%s\n// 舊的 --radius-xs 已改名 --radius-sm;dataTableFilterMatch 也刪了\nexport const A = () => <div className="rounded-[var(--radius-sm)]" />\n' "$DS" > "$CODE"; expect 0 decoy-comment "$CODE"
printf '%s\nexport const note = "dataTableFilterMatch 已移除"\nexport const why = "看「--radius-xs」那一段"\n' "$DS" > "$CODE"; expect 0 decoy-string-citation "$CODE"
printf 'export function isTabbableElement() { return true }\n' > "$CODE"; expect 0 own-function-without-ds-import "$CODE"
printf "import { useNarrow } from '@qijenchen/design-system/hooks/use-is-narrow-viewport'\n" > "$CODE"; expect 2 removed-subpath "$CODE"
printf '%s\nexport const A = () => <div className="animate-accordion-down" />\n' "$DS" > "$CODE"; expect 0 class-still-provided-elsewhere "$CODE"
# 兩段合一份報告:同一個 .tsx 同時有品質違規(any)與舊名 → 一次 exit 2,兩個代號都在
printf '%s\nexport const bad: any = <DialogContent maxWidth={480}>x</DialogContent>\n' "$DS" > "$CODE"; expect 2 quality-and-removed-share-one-report "$CODE"
grep -qF 'GOV-CONSUMER-QUALITY-001' "$TMP/stderr" && grep -qF 'GOV-DS-REMOVED-NAMES-001' "$TMP/stderr" \
  || { echo 'FAIL combined-report: stderr lacks one of the two report codes'; sed 's/^/  /' "$TMP/stderr"; exit 1; }
printf '.a { border-radius: var(--radius-xs); }\n' > "$CSS"; expect 2 removed-token-in-css "$CSS"
printf '/* var(--radius-xs) 已改名 */\n.a { border-radius: var(--radius-sm); }\n' > "$CSS"; expect 0 css-comment-decoy "$CSS"
# 品質檢查範圍外(.css / docs)只跑名單檢查:品質規則會擋的寫法在這裡不擋
printf '.a { color: var(--radius-sm); }\n.b { composes: bg-popover text-popover-foreground; }\n' > "$CSS"; expect 0 css-outside-quality-scope-only-names "$CSS"
printf '# 範例\n\n```ts\nexport const bad: any = 1\n```\n' > "$DOC"; expect 0 doc-outside-quality-scope-only-names "$DOC"
printf '# 對話框\n\n```tsx\n<DialogContent maxWidth={480}>\n```\n' > "$DOC"; expect 2 doc-jsx-snippet "$DOC"
printf '# 歷史\n\n原話:「dataTableFilterMatch 不要了」\n<!-- --menu-max-height 已收回 -->\n' > "$DOC"; expect 0 doc-quote-and-comment-decoy "$DOC"
printf '# 規則\n\n選單高度讀 `--menu-max-height`。\n' > "$OVERLAY"; expect 2 overlay-removed-token "$OVERLAY"
printf '<DialogContent maxWidth={480} />\n' > "$CODE"; expect 0 not-post-tool-use "$CODE" PreToolUse
printf 'x --radius-xs\n' > "$PROJECT/README.md"; expect 0 out-of-scope-path "$PROJECT/README.md"
mkdir -p "$PROJECT/packages/design-system/src/tokens"
printf '.a { border-radius: var(--radius-xs); }\n' > "$PROJECT/packages/design-system/src/tokens/x.css"; expect 0 ds-package-source-is-the-owner "$PROJECT/packages/design-system/src/tokens/x.css"
mkdir -p "$PROJECT/apps/demo/node_modules/x/src"
printf '.a { border-radius: var(--radius-xs); }\n' > "$PROJECT/apps/demo/node_modules/x/src/y.css"; expect 0 node-modules-excluded "$PROJECT/apps/demo/node_modules/x/src/y.css"

# DS 作者 repo:文件寫歷史是正常的,只查程式
printf '{}\n' > "$PROJECT/packages/design-system/ds-changes.json"
printf '選單高度原本是 `--menu-max-height`。\n' > "$DOC"; expect 0 ds-author-docs-skipped "$DOC"
printf '.a { border-radius: var(--radius-xs); }\n' > "$CSS"; expect 2 ds-author-code-still-checked "$CSS"
rm "$PROJECT/packages/design-system/ds-changes.json"

# 名單壞了 / 不見 = 儀器失效(不當成沒有舊名):corpus 換成只有帳本工具與壞帳本的副本
CORPUS="$TMP/corpus"
mkdir -p "$CORPUS/packages/design-system/tools/changes"
cp "$REPO_ROOT/packages/design-system/tools/changes/ledger.mjs" "$CORPUS/packages/design-system/tools/changes/ledger.mjs"
printf '{"releases":' > "$CORPUS/packages/design-system/ds-changes.json"
GOVERNANCE_CORPUS_ROOT="$CORPUS" expect 70 invalid-ledger "$CSS"
rm "$CORPUS/packages/design-system/ds-changes.json"
GOVERNANCE_CORPUS_ROOT="$CORPUS" expect 70 missing-ledger "$CSS"
printf '{' | bash "$HOOK" >/dev/null 2>&1 && { echo 'FAIL malformed-input: expected non-zero'; exit 1; } || true

echo "✓ check_consumer_code_quality removed-names: $PASS cases"
