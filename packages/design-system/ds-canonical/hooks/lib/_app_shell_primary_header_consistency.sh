#!/usr/bin/env bash
# check_app_shell_primary_header_consistency.sh — PreToolUse Edit/Write
#
# 2026-05-21 ship per user directive「該程式化的就程式化」+「確認當有 global header 時,
# sidebar 內的 header 應該要拿掉」+ world-class GitHub/Gmail/Figma 共識。
#
# Detects 3 violations in AppShell consumer code:
#   V1) `layout="primary-header"` without `globalHeader=...` prop
#       → 缺 globalHeader 而 layout=primary-header 是邏輯矛盾(per app-shell.spec.md
#         「primary-header = primary-sidebar + 一條 global header」)
#
#   V2) `layout="primary-header"` + 任何 `<SidebarHeader>...</SidebarHeader>` 在同 file
#       → WorkspaceBrand 已該在 globalHeader,sidebar 內不該再有 SidebarHeader
#         (per app-shell.spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 一致)
#         例外:同 file 用 useSidebar/isMobile = mobile-only 補品牌的正確 responsive fork(豁免)
#
#   V3) `layout="primary-header"` + 任何 `<SidebarFooter>...</SidebarFooter>` 在同 file(2026-06-18 beta.74)
#       → primary-header 帳號入口家在 globalHeader 右(收成 Sheet 鏡像到 Sheet header 右),**不該**用
#         sidebar footer〔那是 primary-sidebar 帳號家慣例〕→ 誤用 = 模式混淆
#         (per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」+ Material modal nav drawer
#         「account switcher 放 drawer header」)。與 V2 不同:primary-header 任何 breakpoint(含 mobile
#         Sheet)帳號家都在 header 區 → V3 不設 isMobile 豁免;非帳號用途 footer 走 escape allowlist。
#
# 對齊 .claude/rules/self-verify.md「Pre-edit」階段 + check_chrome_header_handcraft.sh /
# check_overlay_handcraft.sh 等既有 SSOT-enforcement hook idiom。
# Exception escape:`// @app-shell-primary-header-allow: <reason>` 檔頭。

set -uo pipefail
source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire

# 只看 Edit / Write / MultiEdit tool
# 2026-05-31 fix(folded-hook-audit):原從 $CLAUDE_TOOL_INPUT env + isatty 讀 → 經 chrome_header_dispatcher
# 的 stdin pipe 呼叫時 env 為空 → 此 helper 永不 fire(dead)。改標準 INPUT=$(cat) + jq,對齊 sibling helper。
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "MultiEdit" ]]; then exit 0; fi

TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# 只查 .tsx / .stories.tsx consumer file
if [[ ! "$TARGET" =~ \.(tsx)$ ]]; then exit 0; fi
if [[ ! -f "$TARGET" ]]; then exit 0; fi

# 排除 spec / test / SSOT 檔
case "$TARGET" in
  *.spec.md|*test*|*/AppShell/app-shell.tsx) exit 0 ;;
esac

# Escape allowlist
if grep -q "@app-shell-primary-header-allow:" "$TARGET"; then exit 0; fi

# 偵測 layout="primary-header"(三種 JSX 形式:layout="x" / layout={"x"} / layout={'x'})
# 2026-06-18 beta.74 fix(adversarial audit P1):舊 `["\047]` 想用 octal \047 表單引號,但 BRE char-class
# **不** interpret octal → 單引號 JSX `layout={'primary-header'}` 整個 hook 靜默 skip(false-negative)。
# 改 grep -E + 字面單/雙引號 alternation(`('\''|")`)— 三種引號形式皆match。⚠️ 驗證用 /usr/bin/grep,
# 互動 shell 的 wrapped grep 對 octal 給相反結果會藏 bug。
if ! grep -Eq 'layout="primary-header"|layout=\{('\''|")primary-header('\''|")\}' "$TARGET"; then exit 0; fi

VIOLATIONS=()

# V1:layout="primary-header" 但無 globalHeader=
if ! grep -q 'globalHeader\s*=' "$TARGET"; then
  VIOLATIONS+=("V1 缺 globalHeader prop:layout=\"primary-header\" 必傳 globalHeader 否則邏輯矛盾(per app-shell.spec.md「primary-header = primary-sidebar + 一條 global header」)")
fi

# V2:layout="primary-header" + <SidebarHeader> 同 file → WorkspaceBrand 該在 globalHeader 不重複。
# 例外(2026-06-18 responsive 精修,M34 hook-intent 對齊):同 file 也用 useSidebar/isMobile =
# mobile-only 補品牌的「正確 responsive fork」(小螢幕 Sheet 蓋住 globalHeader → Sheet 內補同組 primitive,
# desktop 仍無 SidebarHeader,非真重複)→ 不 flag。見 app-shell.spec.md WorkspaceBrand SSOT「Responsive 精修」子句。
# ⚠️ 限制(2026-06-18 beta.74 audit 記錄):V2 是 token-presence 啟發式(file 含 useSidebar/isMobile 即豁免),
#    非「isMobile 真的 guard 該 <SidebarHeader>」的 AST 級判斷 → 罕見假陰性(unguarded SidebarHeader 但 file
#    因別處用 isMobile → 漏擋)。bash 無法精準 AST;靠 code review + escape allowlist 兜底,目前唯一 consumer(stories)正確。
#    要嚴格需 TS AST lint rule(future)。
# tag boundary `([^A-Za-z]|$)`(2026-06-18 audit P2#4):避免 prefix-extended 名(<SidebarHeaderXyz>)誤觸
if grep -Eq '<SidebarHeader([^A-Za-z]|$)' "$TARGET" && ! grep -qE 'useSidebar|isMobile' "$TARGET"; then
  VIOLATIONS+=("V2 Sidebar 內含 SidebarHeader:primary-header mode WorkspaceBrand 該在 globalHeader,sidebar 內不該重複(per spec.md「WorkspaceBrand 放置 SSOT」+ world-class GitHub/Gmail/Figma 共識)。若是 mobile-only responsive 補品牌請用 useSidebar().isMobile 條件渲染(自動豁免);若 sidebar header 是其他內容(非 brand),加 escape allowlist `// @app-shell-primary-header-allow:` 並說明 reason")
fi

# V3:layout="primary-header" + <SidebarFooter> 同 file → 帳號入口家在 globalHeader 右,不該用 sidebar footer。
# 與 V2 不同 — primary-header 收成 Sheet 時帳號鏡像到 Sheet **header** 右(非 footer),故任何 breakpoint 都不該
# 有 SidebarFooter 放帳號 → V3 不設 isMobile 豁免(per app-shell.spec.md「帳號入口(Account entry)放置 SSOT」
# Responsive 精修「不放 SidebarFooter」+ Material modal nav drawer「account switcher 放 drawer header」)。
# demo 天然不誤觸:layout="primary-header" 在 stories,<SidebarFooter> 在 _demo-helpers.tsx,分檔。
# 非帳號用途 footer(storage meter / collapse 等)→ escape allowlist 兜底。
if grep -Eq '<SidebarFooter([^A-Za-z]|$)' "$TARGET"; then
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
