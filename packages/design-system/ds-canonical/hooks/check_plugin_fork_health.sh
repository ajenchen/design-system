#!/bin/bash
# check_plugin_fork_health.sh — SessionStart ×2 — fork-user repo plugin 健康(DS repo 內 by-design 早退)
#
# 2026-06-11 prune merge(user 拍板「照你建議做」;59→51 headroom):
# #   r1_plugin_install = 原 check_fork_user_plugin_install.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
#   r2_plugin_freshness = 原 check_plugin_freshness.sh(規則逐字搬入,BLOCKER 級別與 escape 標記不變)
# 原檔 → .claude/hooks/retired/2026-06-11-prune-merge/
# 各規則跑在 pipeline 子 shell:規則內 exit 不中斷其他規則;任一 exit 2 → 整體 exit 2。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire
_PROVIDER_PATHS="$(dirname "$0")/lib/_provider_paths.sh"
if [ ! -f "$_PROVIDER_PATHS" ] || [ -L "$_PROVIDER_PATHS" ]; then
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: canonical provider resolver 缺失、symlink 或不是一般檔案\n' >&2
  exit 70
fi
source "$_PROVIDER_PATHS" 2>/dev/null || {
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: canonical provider resolver unavailable\n' >&2
  exit 70
}

set -uo pipefail
INPUT=$(cat 2>/dev/null) || {
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: 無法讀取 canonical input\n' >&2
  exit 70
}
if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: invalid input envelope\n' >&2
  exit 70
fi
ACTIVE_PROVIDER="${GOVERNANCE_PROVIDER:-${GOVERNANCE_SELF_PROVIDER:-}}"
governance_provider_string_field instructionEntry >/dev/null 2>&1 || {
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: provider is absent from canonical registry:%s\n' "${ACTIVE_PROVIDER:-<missing>}" >&2
  exit 70
}
PROJECT_ROOT="$(governance_project_root)" || {
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: project root is unavailable\n' >&2
  exit 70
}

r1_plugin_install() {
set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

[ "$EVENT" != "SessionStart" ] && exit 0

CWD="$PROJECT_ROOT"

# (a) 不是 DS repo:無 packages/design-system/src
[ -d "$CWD/packages/design-system/src" ] && exit 0

# (b) package.json 含 DS dep?
[ ! -f "$CWD/package.json" ] && exit 0
if ! grep -q '"@qijenchen/design-system"' "$CWD/package.json" 2>/dev/null; then
  exit 0
fi

# (c) C-prime committed 治理鏈健康?(2026-07-04 dim 58 對齊:主路徑 = committed-config + npm,
# 免 plugin — 2026-06-17 C-prime 改版,plugin 路線不可靠 per memory reference_cloud_governance_loading)
# dispatcher(committed 啟動器)+ manifest(npm ship 治理本體)都在 → 官方 fork hooks 會 fire → 健康。
DISPATCHER="$CWD/governance/bin/fork-governance-dispatcher.sh"
MANIFEST="$CWD/node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json"
if [ -f "$DISPATCHER" ] && [ -f "$MANIFEST" ]; then
  exit 0
fi

# (d) A legacy provider plugin is compatibility feedback only. It never satisfies the shared
# runtime health contract and must not hide a missing dispatcher/manifest on one provider while
# every other provider correctly reports degraded. r2 may inspect it only for a non-authoritative
# compatibility notice after this neutral health result is established.

# 治理鏈缺失 → context inject(SessionStart additional context),修法 = canonical one-command setup(免 plugin)
if jq -e '.scripts["setup:all"]' "$CWD/package.json" >/dev/null 2>&1; then
  PUBLIC_SETUP_CMD="npm run setup:all"
elif jq -e '.scripts["setup:governance"]' "$CWD/package.json" >/dev/null 2>&1; then
  PUBLIC_SETUP_CMD="npm run setup:governance   # legacy consumer fallback;current template uses setup:all"
else
  PUBLIC_SETUP_CMD="GOVERNANCE-SETUP-MISSING:以 reviewed full-snapshot template bootstrap PR 恢復 setup/lock 後再執行"
fi
if [ -f "$DISPATCHER" ]; then
  MISSING_DESC="接線骨架(dispatcher)已 commit ✅,但治理本體 manifest 不在 node_modules ❌(setup:all 尚未完成)"
  FIX_CMD="$PUBLIC_SETUP_CMD   # 依 committed exact lock 安裝、驗簽、跑 role hard gate 並 provision peer CLI"
else
  MISSING_DESC="C-prime 接線骨架(governance/bin/fork-governance-dispatcher.sh)不存在 ❌(fork 尚未 adopt provider-neutral runtime)"
  FIX_CMD="先以 reviewed full-snapshot template bootstrap PR 補齊接線;merge 後跑 npm run setup:all(禁止 mutable tag 自助 bootstrap)"
fi

cat <<EOF
🚨 Fork-user DS 治理鏈未就位 — 官方 fork governance hooks 不會 fire,憑記憶寫 mock 不會被攔。

偵測:
  cwd = $CWD
  package.json 含 @qijenchen/design-system dep ✅
  $MISSING_DESC

→ 後果(2026-05-26 anchor event):憑記憶寫 App.tsx mock(漏 SidebarTrigger / collapsible / startIcon /
  tooltip / SidebarFooter)= production-grade fork-user 跑版 anti-pattern。

修法(**免 /plugin install;正確 template checkout 只需 1 條 setup 指令**):
  $FIX_CMD

就位後:
  - fork-governance-dispatcher.sh 每 event 讀 node_modules 官方 manifest 跑全部 fork 治理 hooks(BLOCKER 會轉發攔截)
  - DS canonical / rules / skills 從 node_modules/@qijenchen/design-system/ds-canonical/ cross-load
  - 憑記憶寫 mock 會被 mechanical BLOCKER 攔

對應 canonical:
  - template AGENTS.md「🚀 Onboarding(C-prime)」段(provider adapter 可建立自己的 instruction view)
  - ds-canonical/fork/manifest.json(build-fork-governance.mjs 生成)
EOF
exit 0
}

r2_plugin_freshness() {
set -uo pipefail

# Remote marketplace freshness belongs to the Claude plugin compatibility surface. The neutral
# npm runtime is version-pinned by manifest/lock checks elsewhere, so non-Claude providers neither
# read Claude HOME nor perform this legacy network probe.
[ "$ACTIVE_PROVIDER" = "claude" ] || exit 0

INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)

case "${EVENT:-}" in
  SessionStart) ;;
  *) exit 0 ;;
esac

# 2026-07-16 dim 75 修:DS repo 本身 early-exit(對齊 r1 guard (a))。原本無此 guard →
# candidate 3(.claude-plugin/plugin.json 在 DS repo 存在)讓 r2 在 DS repo fire,
# 印 `npm run sync-all` 但 DS root package.json 無此 script(sync-all 是 fork/template 的
# consumer script,見 template/ds-product-template/package.json)= 指引斷鏈;
# 且 DS repo 是 SSOT 源頭,local 版本領先 published 是開發常態,不該 nag。
[ -d "$PROJECT_ROOT/packages/design-system/src" ] && exit 0

# Only DS consumers participate in this control plane. A globally installed
# legacy plugin must not make unrelated repositories perform network checks or
# receive governance upgrade guidance.
[ -f "$PROJECT_ROOT/package.json" ] || exit 0
grep -q '"@qijenchen/design-system"' "$PROJECT_ROOT/package.json" 2>/dev/null || exit 0

# Find local plugin.json (DS plugin install path)
PLUGIN_JSON=""
CLAUDE_HOME="${HOME:-}"
PLUGIN_CANDIDATES=("$PROJECT_ROOT/.claude-plugin/plugin.json")
if [ -n "$CLAUDE_HOME" ]; then
  PLUGIN_CANDIDATES=(
    "$CLAUDE_HOME/.claude/plugins/design-system@qijenchen-ds/plugin.json"
    "$CLAUDE_HOME/.claude/plugins/cache/design-system/plugin.json"
    "${PLUGIN_CANDIDATES[@]}"
  )
fi
for candidate in "${PLUGIN_CANDIDATES[@]}"
do
  if [ -f "$candidate" ]; then PLUGIN_JSON="$candidate"; break; fi
done

if [ -z "$PLUGIN_JSON" ]; then exit 0; fi

LOCAL_VERSION=$(jq -r '.version // ""' "$PLUGIN_JSON" 2>/dev/null)
if [ -z "$LOCAL_VERSION" ]; then exit 0; fi

# Fetch latest marketplace.json from GitHub raw (5s timeout). Network failure, timeout, an empty
# response, or malformed/nonconforming JSON is an explicit compatibility-probe skip. Keep each
# fallible command in a conditional so an inherited errexit/pipefail state cannot turn this
# non-authoritative probe into an undefined child exit.
REMOTE_BODY=""
if ! REMOTE_BODY=$(curl -sS --max-time 5 \
  "https://raw.githubusercontent.com/ajenchen/design-system/main/.claude-plugin/marketplace.json" \
  2>/dev/null); then
  exit 0
fi
[ -n "$REMOTE_BODY" ] || exit 0
REMOTE_VERSION=""
if ! REMOTE_VERSION=$(printf '%s' "$REMOTE_BODY" \
  | jq -er 'if type == "object" and (.metadata | type == "object") and (.metadata.version | type == "string") and (.metadata.version | length > 0) then .metadata.version else empty end' \
      2>/dev/null); then
  exit 0
fi

if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
  # Dim 75 current contract:the marketplace version is a Claude-only compatibility diagnostic,
  # never an upgrade authority. Verify the repository's committed exact version; package upgrades
  # arrive only through a reviewed exact-version PR.
  if jq -e '.scripts["setup:all"]' "$PROJECT_ROOT/package.json" >/dev/null 2>&1; then
    SETUP_CMD="npm run setup:all"
  elif jq -e '.scripts["setup:governance"]' "$PROJECT_ROOT/package.json" >/dev/null 2>&1; then
    SETUP_CMD="npm run setup:governance   # legacy consumer fallback"
  elif [ -f "$PROJECT_ROOT/scripts/setup-governance.mjs" ]; then
    SETUP_CMD="node scripts/setup-governance.mjs"
  elif jq -e '.scripts["sync-all"]' "$PROJECT_ROOT/package.json" >/dev/null 2>&1; then
    SETUP_CMD="npm run sync-all   # 僅接受 authenticated exact-version transition"
  elif [ -f "$PROJECT_ROOT/scripts/sync-all.mjs" ]; then
    SETUP_CMD="node scripts/sync-all.mjs   # 僅接受 authenticated exact-version transition"
  else
    SETUP_CMD="GOVERNANCE-SETUP-MISSING:以 reviewed full-snapshot template bootstrap PR 恢復 setup/lock 後再執行"
  fi
  cat << EOF

📦 Legacy Claude plugin compatibility version differs(non-authoritative):
   Local legacy plugin: $LOCAL_VERSION
   Marketplace metadata: $REMOTE_VERSION

Verify the repository's committed exact governance version:
  $SETUP_CMD

Package/provider upgrades must arrive through a reviewed exact-version PR. Never install a mutable
dist-tag from this notice; marketplace metadata is not current governance certification.

(This compatibility notice does not replace governance/lock.json, the installed checker, or protected CI.)

EOF
fi

exit 0
}

_CAPTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/check-plugin-fork-health.XXXXXX") || {
  printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: output capture unavailable\n' >&2
  exit 70
}
trap 'rm -rf -- "$_CAPTURE_DIR"' EXIT
CONTEXTS=""
_RULE_INDEX=0
for _rule in r1_plugin_install r2_plugin_freshness; do
  _RULE_INDEX=$((_RULE_INDEX + 1))
  _stdout="$_CAPTURE_DIR/$_RULE_INDEX.stdout"
  _stderr="$_CAPTURE_DIR/$_RULE_INDEX.stderr"
  printf '%s' "$INPUT" | "$_rule" >"$_stdout" 2>"$_stderr"
  _rc=$?
  case "$_rc" in
    0)
      if [ -s "$_stderr" ]; then
        printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: rule %s rc0 產生 raw stderr\n' \
          "$_rule" >&2
        exit 70
      fi
      if [ -s "$_stdout" ]; then
        _output=$(cat "$_stdout")
        if [ -n "$CONTEXTS" ]; then
          CONTEXTS="${CONTEXTS}"$'\n\n'"$_output"
        else
          CONTEXTS="$_output"
        fi
      fi
      ;;
    2)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && ! grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
        exit 2
      fi
      printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: rule %s rc2 必須是 stderr-only nonempty policy blocker\n' \
        "$_rule" >&2
      exit 70
      ;;
    70)
      if [ ! -s "$_stdout" ] && [ -s "$_stderr" ] \
        && grep -qF 'GOVERNANCE_INTEGRITY:' "$_stderr"; then
        cat "$_stderr" >&2
      else
        printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: rule %s rc70 必須是 stderr-only marker\n' \
          "$_rule" >&2
      fi
      exit 70
      ;;
    *)
      printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: rule %s 回傳未定義 exit code %s\n' \
        "$_rule" "$_rc" >&2
      exit 70
      ;;
  esac
done
if [ -n "$CONTEXTS" ]; then
  _encoded_contexts=$(printf '%s' "$CONTEXTS" | jq -Rs .) || {
    printf '🚨 GOVERNANCE_INTEGRITY: PLUGIN/FORK HEALTH FAILURE: combined context 無法編碼\n' >&2
    exit 70
  }
  printf '{"governanceContext":{"hookEventName":"SessionStart","message":%s}}\n' "$_encoded_contexts"
fi
exit 0
