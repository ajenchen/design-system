#!/usr/bin/env bash
# _app_shell_primary_header_consistency.sh — PreToolUse Edit/Write(chrome_header_dispatcher 消費;原 check_app_shell_primary_header_consistency.sh fold)
#
# 2026-05-21 ship per user directive「該程式化的就程式化」+「確認當有 global header 時,
# sidebar 內的 header 應該要拿掉」+ world-class GitHub/Gmail/Figma 共識。
#
# Detects 3 violations in AppShell consumer code:
#   V1) `layout="primary-header"` without `globalHeader=...` prop
#       → 缺 globalHeader 而 layout=primary-header 是邏輯矛盾(per app-shell.spec.md
#         「primary-header = primary-sidebar + 一條 global header」)
#
#   V2) `layout="primary-header"` AppShell instance 內含 `<SidebarHeader>`
#       → WorkspaceBrand 已該在 globalHeader,sidebar 內不該再有 SidebarHeader
#         (per app-shell.spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 一致)
#         例外:該 instance 的正向 isMobile branch 內 mobile-only 補品牌(豁免)；
#         nested AppShell 是獨立 boundary。
#
#   V3) `layout="primary-header"` + 任何 `<SidebarFooter>...</SidebarFooter>` 在同 file(2026-06-18 beta.74)
#       → primary-header 帳號入口家在 globalHeader 右(收成 Sheet 鏡像到 Sheet header 右),**不該**用
#         sidebar footer〔那是 primary-sidebar 帳號家慣例〕→ 誤用 = 模式混淆
#         (per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」+ Material modal nav drawer
#         「account switcher 放 drawer header」)。與 V2 不同:primary-header 任何 breakpoint(含 mobile
#         Sheet)帳號家都在 header 區 → V3 不設 isMobile 豁免;非帳號用途 footer 走 escape allowlist。
#
# 對齊 `packages/design-system/ds-canonical/rules/self-verify.md`「Pre-edit」階段 +
# check_chrome_header_handcraft.sh /
# check_overlay_handcraft.sh 等既有 SSOT-enforcement hook idiom。
# Exception escape:`// @app-shell-primary-header-allow: <reason>` 檔頭。

set -uo pipefail
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

# 只看 Edit / Write / MultiEdit tool
# 2026-05-31 fix(folded-hook-audit):原從 $GOVERNANCE_TOOL_INPUT env + isatty 讀 → 經 chrome_header_dispatcher
# 的 stdin pipe 呼叫時 env 為空 → 此 helper 永不 fire(dead)。改標準 INPUT=$(cat) + jq,對齊 sibling helper。
fail_integrity() {
  echo "🚨 GOVERNANCE_INTEGRITY: AppShell primary-header enforcement integrity failure: $1" >&2
  exit 70
}

INPUT=$(cat) || fail_integrity "無法讀取 hook input"
if ! printf '%s' "$INPUT" | jq -e '
  type == "object"
  and (.tool_name | type == "string")
  and (.tool_input | type == "object")
  and (.tool_input.file_path | type == "string")
' >/dev/null 2>&1; then
  fail_integrity "hook input 不是有效的 provider-neutral event"
fi

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name')
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "MultiEdit" ]]; then exit 0; fi

TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path')
# 只查 .tsx / .stories.tsx consumer file
if [[ ! "$TARGET" =~ \.(tsx)$ ]]; then exit 0; fi

# 排除 spec / test / SSOT 檔
case "$TARGET" in
  *.spec.md|*test*|*/AppShell/app-shell.tsx) exit 0 ;;
esac

if [ "${GOVERNANCE_WRITE_STATE_TRUST:-}" != 'runner-v1' ]; then
  fail_integrity "受管轄的 AppShell mutation 缺少 runner-v1 proposed state"
fi
if ! printf '%s' "$INPUT" | jq -e '
  .tool_input.governance_write_state as $state
  | ($state | type == "object")
    and ($state.schemaVersion == 1)
    and ($state.path | type == "string" and length > 0)
    and (
      ($state.kind == "text" and ($state.content | type == "string"))
      or ($state.kind == "deleted" and ($state | has("content") | not))
    )
' >/dev/null 2>&1; then
  fail_integrity "trusted proposed write state 缺失或 malformed"
fi

STATE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.path')
STATE_KIND=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.kind')
if [[ "$TARGET" != "$STATE_PATH" && "$TARGET" != */"$STATE_PATH" ]]; then
  fail_integrity "trusted proposed write state 與 hook target 不相符"
fi
[ "$STATE_KIND" = 'deleted' ] && exit 0
FULL_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.governance_write_state.content')

# 用 TypeScript 自身的 TSX parser 做 per-AppShell 判斷；全檔 grep 會被 JSX
# whitespace/multiline、comments、另一個 AppShell instance 的 prop 或 `isMobile`
# decoy 繞過。TypeScript 是本 repo/template 的 pinned dev dependency；缺失或 parse
# diagnostics 都是治理 runtime integrity failure，不得假成功。
NODE_PROJECT_ROOT="${GOVERNANCE_PROJECT_DIR:-}"
if [ -z "$NODE_PROJECT_ROOT" ]; then
  NODE_PROJECT_ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) \
    || fail_integrity "無法定位 TypeScript parser project root"
fi
if ! JSX_COUNTS=$(
  cd "$NODE_PROJECT_ROOT" \
    && printf '%s' "$FULL_CONTENT" \
      | node -- "$(dirname "$0")/tsx-governance-analysis.mjs" \
          app-shell-primary-header 2>/dev/null
); then
  fail_integrity "TypeScript TSX parser unavailable or proposed content malformed"
fi

if [ "$JSX_COUNTS" = 'ESCAPE' ]; then exit 0; fi
IFS='|' read -r V1_COUNT V2_COUNT V3_COUNT <<<"$JSX_COUNTS"
case "$V1_COUNT|$V2_COUNT|$V3_COUNT" in
  *[!0-9\|]*|'') fail_integrity "TypeScript TSX analyzer output malformed" ;;
esac
if [ "$V1_COUNT" -eq 0 ] && [ "$V2_COUNT" -eq 0 ] && [ "$V3_COUNT" -eq 0 ]; then exit 0; fi

VIOLATIONS=()

# V1:layout="primary-header" 但無 globalHeader=
if [ "$V1_COUNT" -gt 0 ]; then
  VIOLATIONS+=("V1 缺 globalHeader prop:layout=\"primary-header\" 必傳 globalHeader 否則邏輯矛盾(per app-shell.spec.md「primary-header = primary-sidebar + 一條 global header」)")
fi

# V2 使用 AST instance boundary。只有正向 mobile branch：
# `isMobile && <SidebarHeader>` RHS 或 `isMobile ? <SidebarHeader> : ...`
# 才豁免；否定、OR、false branch 與 nested AppShell 都不會誤放行。
if [ "$V2_COUNT" -gt 0 ]; then
  VIOLATIONS+=("V2 Sidebar 內含 SidebarHeader:primary-header mode WorkspaceBrand 該在 globalHeader,sidebar 內不該重複(per spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 共識)。若是 mobile-only responsive 補品牌請用正向 isMobile 條件渲染;若 sidebar header 是其他內容,加檔頭 escape allowlist 並寫明 rationale")
fi

# V3:layout="primary-header" + <SidebarFooter> 同 file → 帳號入口家在 globalHeader 右,不該用 sidebar footer。
# 與 V2 不同 — primary-header 收成 Sheet 時帳號鏡像到 Sheet **header** 右(非 footer),故任何 breakpoint 都不該
# 有 SidebarFooter 放帳號 → V3 不設 isMobile 豁免(per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」
# Responsive 精修「不放 SidebarFooter」+ Material modal nav drawer「account switcher 放 drawer header」)。
# demo 天然不誤觸:layout="primary-header" 在 stories,<SidebarFooter> 在 _demo-helpers.tsx,分檔。
# 非帳號用途 footer(storage meter / collapse 等)→ escape allowlist 兜底。
if [ "$V3_COUNT" -gt 0 ]; then
  VIOLATIONS+=("V3 Sidebar 內含 SidebarFooter:primary-header mode 帳號入口家在 globalHeader 右(收成 Sheet 鏡像到 Sheet header 右),不該用 sidebar footer〔那是 primary-sidebar 慣例〕(per spec.md「帳號入口(Account entry)放置 SSOT」+ Material modal nav drawer)。若 footer 是非帳號用途,加 escape allowlist \`// @app-shell-primary-header-allow:\` 並說明 reason")
fi

if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
  echo "🚨 AppShell primary-header consistency violation" >&2
  echo "Target: $TARGET" >&2
  for v in "${VIOLATIONS[@]}"; do echo "  • $v" >&2; done
  echo "" >&2
  echo "修法:" >&2
  echo "  (a) 傳 globalHeader prop / 撤掉 SidebarHeader" >&2
  echo "  (b) 改 layout=\"primary-sidebar\"(若不需要 global header)" >&2
  echo "  (c) Escape 允許:檔首加 \`// @app-shell-primary-header-allow: <rationale>\`" >&2
  exit 2
fi

exit 0
