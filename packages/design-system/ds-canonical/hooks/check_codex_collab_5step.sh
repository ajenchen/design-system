#!/bin/bash
set -uo pipefail
# M31 機械強制:Adversarial dual-track 5-step canonical — author / independent peer 每次 collab 必走完整
# 5-step(各自熟讀 / 各自驗證 / 各自視覺稽核 / cite-based propose / 整合完美版本)。
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
# Soft warning(P1):exit 0 但 stderr 印警告 — 不 block commit(因 commit message 自由 draft,
# false-positive 太高 hard-block 會困住)。但 stop hook + session start hook 會撈 fire log
# 後續 raise 為 BLOCKER。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -euo pipefail

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT")
COMMAND=$(jq -r '.tool_input.command // ""' <<<"$INPUT")

SELF_PROVIDER="${GOVERNANCE_SELF_PROVIDER:-${GOVERNANCE_PROVIDER:-}}"
PEER_PROVIDER="${GOVERNANCE_PEER_PROVIDER:-}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-${PEER_PROVIDER:-independent peer}}"
if ! printf '%s' "$SELF_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$' \
  || ! printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$'; then
  printf 'GOVERNANCE_INTEGRITY:PEER_COLLAB_REGISTRY_CONTEXT_INVALID\n' >&2
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

# Soft warning(stderr only,exit 0 — 不 block 因 false-positive 風險)
echo "⚠️  M31 peer-collab 5-step canonical 違反(P1 soft warn;self=${SELF_PROVIDER},peer=${PEER_PROVIDER}):" >&2
echo "   Commit 含 ${PEER_DISPLAY_NAME} collab keyword 但缺以下 marker:" >&2
for m in "${MISSING[@]}"; do
  echo "   ✗ $m" >&2
done
echo "" >&2
echo "   M31 universal mindset:每次 peer collab 都該完整 5-step:" >&2
echo "     (1) 各自熟讀 spec.md / canonical" >&2
echo "     (2) 各自驗證 tsc / audit / playwright" >&2
echo "     (3) 各自視覺稽核 screenshot / DOM" >&2
echo "     (4) 各自 cite-based propose" >&2
echo "     (5) 整合完美版本(not pass-through)" >&2
echo "" >&2
echo "   Commit message 補 cite + verify + verdict marker 再 commit。" >&2
echo "   或加 \`@peer-collab-allow: <reason>\` 緊急豁免。" >&2
echo "   詳 provider-neutral meta-patterns M31 + collaboration workflow canonical" >&2

# Soft warning — exit 0,不 block(per M31 hook design note)
exit 0
