#!/bin/bash
set -uo pipefail
# M31 機械強制:Adversarial dual-track 5-step canonical — author / independent peer 每次 collab 必走完整
# 5-step(各自熟讀 / 各自驗證 / 各自視覺稽核 / cite-based propose / 整合完美版本)。
# 執法等級:會擋(exit 2)。2026-11-21 knowledge-prune WP-16 依 D4-02 由「寫 stderr、exit 0」升級;整 commit 豁免 `@peer-collab-allow: <reason>`。
#
# PreToolUse(Bash git commit)hook — 攔截 commit message 含 registry-resolved peer / Layer A / Layer B keyword
# 但**未同時**含以下 3 必備 marker:
#   (a) spec.md cite — regex `spec.md:L\d+` OR `spec.md` + 引文 OR `canonical`
#   (b) verify run — regex `tsc|audit|invariant|visual|playwright|grep verify`
#   (c) verdict — regex `agree|disagree-with-cite|synthesize|approve|cite battle|counter-cite`
#
# Bug 史(2026-05-10):author pass-through peer proposal,無 spec cite + 無 verify + 直接
# commit。M31 因此要求每題都含 3 必備 marker,不只 disagree 時啟動。
#
# Allow escape:
#   commit message 含 `@peer-collab-allow: <reason>` 整 commit 豁免(緊急 hotfix etc)
#
# 只在 M31 已啟動時跑:registrations.json 給本支 reviewSkill codex-collab + requires peer-review-binding,
# task 沒要求 independent review(沒有選定 peer)時 adapter 不派本支,一般 commit 不經過這裡。
#
# 出聲方式(registrations.json outputMode = governance-context-or-block;輸出收法照 check_story_invariants.sh 的 _finalize_hook_output):
#   - 缺 marker → exit 2,理由只寫 stderr:PreToolUse 擋下這次 git commit,模型把理由當工具錯誤讀到。
#   - exit 0 時若有任何輸出 → 包成 {"governanceContext":{hookEventName,message}} 走 stdout(adapter 轉成 additionalContext)。
#   - registry 給的 self / peer 不合法 → GOVERNANCE_INTEGRITY exit 70。
# 改版前(到 2026-11-21)是「stderr 警告、exit 0」,舊檔頭說「stop hook + session start hook 會撈 fire log
# 後續 raise 為 BLOCKER」—— 不成立:沒有任何 Stop / SessionStart hook 讀本支的 fire log
# (session_start_governance_check.sh 檔頭「輸出只有兩條通道」,只收集不輸出的舊提醒變數 2026-11-18 已刪),
# fire log 本身也要 GOVERNANCE_TELEMETRY_OPT_IN=1 才寫、預設關;而 exit 0 的 stderr 模型看不到
# (官方 hooks 文件 exit code 0 段「Claude never sees stderr from a hook that exits 0」,https://code.claude.com/docs/en/hooks)
# —— 這支從來沒有一個字進到模型。舊理由「commit message 自由 draft、誤報太高」正是
# governance/memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md「反 pattern」第 1 條禁止的理由;誤報用 @peer-collab-allow 逐 commit 豁免。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

_HOOK_OUTPUT_CAPTURE=$(mktemp "${TMPDIR:-/tmp}/check-codex-collab-5step.XXXXXX") || {
  printf 'GOVERNANCE_INTEGRITY: peer collab output capture unavailable\n' >&2
  exit 70
}
exec 3>&1 4>&2
exec >"$_HOOK_OUTPUT_CAPTURE" 2>&1

_finalize_hook_output() {
  _hook_rc=$?
  trap - EXIT
  exec 1>&3 2>&4
  _hook_output=$(cat "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true)
  rm -f "$_HOOK_OUTPUT_CAPTURE" 2>/dev/null || true

  case "$_hook_rc" in
    0)
      [ -z "$_hook_output" ] && exit 0
      if ! jq -cn \
        --arg event PreToolUse \
        --arg message "$_hook_output" \
        '{governanceContext:{hookEventName:$event,message:$message}}'; then
        printf 'GOVERNANCE_INTEGRITY: peer collab context envelope encoding failed\n' >&2
        exit 70
      fi
      exit 0
      ;;
    2)
      if grep -q 'GOVERNANCE_INTEGRITY:' <<< "$_hook_output"; then
        printf '%s\n' "$_hook_output" >&2
        exit 70
      elif [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'peer collab hook blocked without diagnostic\n' >&2
      fi
      exit 2
      ;;
    70)
      if [ -n "$_hook_output" ]; then
        printf '%s\n' "$_hook_output" >&2
      else
        printf 'GOVERNANCE_INTEGRITY: peer collab hook failed without diagnostic\n' >&2
      fi
      exit 70
      ;;
    *)
      printf 'GOVERNANCE_INTEGRITY: peer collab hook undefined exit code %s\n' "$_hook_rc" >&2
      [ -n "$_hook_output" ] && printf '%s\n' "$_hook_output" >&2
      exit 70
      ;;
  esac
}
trap _finalize_hook_output EXIT

INPUT=$(cat) || { printf 'GOVERNANCE_INTEGRITY: peer collab input read failed\n'; exit 70; }
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null) \
  || { printf 'GOVERNANCE_INTEGRITY: peer collab tool extraction failed\n'; exit 70; }
COMMAND=$(jq -r '.tool_input.command // ""' <<<"$INPUT" 2>/dev/null) \
  || { printf 'GOVERNANCE_INTEGRITY: peer collab command extraction failed\n'; exit 70; }

SELF_PROVIDER="${GOVERNANCE_SELF_PROVIDER:-${GOVERNANCE_PROVIDER:-}}"
PEER_PROVIDER="${GOVERNANCE_PEER_PROVIDER:-}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-${PEER_PROVIDER:-independent peer}}"
if ! printf '%s' "$SELF_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$' \
  || ! printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$'; then
  printf 'GOVERNANCE_INTEGRITY:PEER_COLLAB_REGISTRY_CONTEXT_INVALID\n'
  exit 70
fi

# Only Bash tool with git commit
case "$TOOL" in
  Bash) ;;
  *) exit 0 ;;
esac

# Match git commit -m with HEREDOC or inline message
if ! grep -qE 'git commit' <<<"$COMMAND"; then
  exit 0
fi

# Extract commit message text(rough — supports HEREDOC `<<'EOF' ... EOF` + inline -m '...')
# HEREDOC pattern:`cat <<'EOF'` ... `EOF`
MSG=$(sed -nE "s/.*-m \"(.*)\"$/\\1/p; /cat <<'?EOF'?/,/^EOF$/p" <<<"$COMMAND" 2>/dev/null || true)
# Fallback:整個 command string(若 HEREDOC parse 失敗)
if [ -z "$MSG" ]; then
  MSG="$COMMAND"
fi

# Allow escape
if grep -qE '@peer-collab-allow:' <<<"$MSG"; then
  exit 0
fi

# Trigger check:does message mention this provider's resolved peer collaboration?
TRIGGER_REGEX="${PEER_PROVIDER}|Layer A own|Layer B peer|Layer B ${PEER_PROVIDER}|dual-track|據理力爭|据理力爭|cite battle"
if ! grep -qE "$TRIGGER_REGEX" <<<"$MSG"; then
  # Not a peer-collab commit — skip
  exit 0
fi

# Required markers
MISSING=()

# (a) spec cite
SPEC_CITE_REGEX='spec\.md[:L0-9]|spec\.md.*L[0-9]|canonical[ 的引文]|RFC.*L[0-9]'
if ! grep -qE "$SPEC_CITE_REGEX" <<<"$MSG"; then
  MISSING+=("spec.md cite(規格 path:line / 引文)")
fi

# (b) verify
VERIFY_REGEX='tsc|audit|invariant|visual|playwright|grep verify|grep .*confirm'
if ! grep -qiE "$VERIFY_REGEX" <<<"$MSG"; then
  MISSING+=("verify run(tsc / audit / invariant / visual / playwright)")
fi

# (c) verdict keyword
VERDICT_REGEX='agree|disagree-with-cite|disagree.*cite|approve|synthesize|cite battle|counter-cite|verdict'
if ! grep -qiE "$VERDICT_REGEX" <<<"$MSG"; then
  MISSING+=("verdict keyword(agree / disagree-with-cite / synthesize)")
fi

if [ ${#MISSING[@]} -eq 0 ]; then
  exit 0
fi

# 擋:理由寫進 capture,_finalize_hook_output 依 exit 2 只送 stderr(PreToolUse 擋下 commit,模型讀得到)
echo "❌ M31 peer-collab 5-step canonical 違反,這次 git commit 已擋下(self=${SELF_PROVIDER},peer=${PEER_PROVIDER}):"
echo "   Commit 含 ${PEER_DISPLAY_NAME} collab keyword 但缺以下 marker:"
for m in "${MISSING[@]}"; do
  echo "   ✗ $m"
done
echo ""
echo "   M31 universal mindset:每次 peer collab 都該完整 5-step:"
echo "     (1) 各自熟讀 spec.md / canonical"
echo "     (2) 各自驗證 tsc / audit / playwright"
echo "     (3) 各自視覺稽核 screenshot / DOM"
echo "     (4) 各自 cite-based propose"
echo "     (5) 整合完美版本(not pass-through)"
echo ""
echo "   Commit message 補 cite + verify + verdict marker 再 commit。"
echo "   這個 commit 其實不是 peer 協作(訊息只是提到 peer 名字)或緊急 hotfix → 訊息加 \`@peer-collab-allow: <reason>\` 豁免。"
echo "   詳 provider-neutral meta-patterns M31 + collaboration workflow canonical"
exit 2
