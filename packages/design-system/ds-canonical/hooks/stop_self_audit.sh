#!/bin/bash
set -uo pipefail
# Stop hook: AI self-audit — detect 3 anti-patterns + inject corrective context.
#
# 1. Claim-verification gap:assistant claimed「verified / done / 全部 / pass / 完成」
#    in transcript but no verify cmd(tsc / hook test / compile / audit)ran this turn
# 2. Auto-prune trigger:provider bootstrap > 500 OR foundational SSOT spec > cap → inject
#    /knowledge-prune chain reminder
# 3. Repeated-topic detector:user 問同 topic ≥ 3 turns within session → inject
#    /ensure-canonical reminder(M19 trigger phrase auto-pipeline)
#
# Why: M14 / M19 markdown rules rely on AI memory(unreliable). 本 hook 是 mechanical
# 落地 — AI 不需要記得自我審查,hook 強制 inject 反思 prompt to next turn。
#
# Triggers: every Stop event(low cost ~50ms per turn)。

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: self-audit hook directory is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: canonical hook integrity helper is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null \
  || governance_hook_integrity_fail "self-audit project root is unavailable:$PROJECT_DIR"
STATE_DIR="$(governance_runtime_state_dir 2>/dev/null || true)"
STATE_WRITES=0
[ -n "$STATE_DIR" ] && STATE_WRITES=1

governance_hook_load_input
governance_hook_require_commands node grep tail awk sed wc tr sort cut find date git mkdir basename
if ! jq -e '
  ((.session_id? // "") | type == "string")
  and ((.last_assistant_message? // "") | type == "string")
' >/dev/null 2>&1 <<< "$INPUT"; then
  governance_hook_integrity_fail 'self-audit input fields are invalid'
fi
TRANSCRIPT_PATH=$(jq -r '.transcript_path // ""' <<< "$INPUT") \
  || governance_hook_integrity_fail 'self-audit transcript path could not be decoded'
SESSION_ID=$(jq -r '.session_id // ""' <<< "$INPUT") \
  || governance_hook_integrity_fail 'self-audit session id could not be decoded'
LAST_ASSISTANT=$(jq -r '.last_assistant_message // ""' <<< "$INPUT") \
  || governance_hook_integrity_fail 'self-audit assistant message could not be decoded'
LAST_USER_LINE=0
TRANSCRIPT_PATH="${TRANSCRIPT_PATH:-${GOVERNANCE_TRANSCRIPT_PATH:-}}"
if [ -n "$TRANSCRIPT_PATH" ] && { [ ! -f "$TRANSCRIPT_PATH" ] || [ ! -r "$TRANSCRIPT_PATH" ]; }; then
  governance_hook_integrity_fail "self-audit transcript is unavailable:$TRANSCRIPT_PATH"
fi

SELF_PROVIDER="${GOVERNANCE_SELF_PROVIDER:-${GOVERNANCE_PROVIDER:-}}"
SELF_DISPLAY_NAME="${GOVERNANCE_SELF_DISPLAY_NAME:-${SELF_PROVIDER:-author}}"
PEER_PROVIDER="${GOVERNANCE_PEER_PROVIDER:-}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-${PEER_PROVIDER:-independent peer}}"
PEER_CLI="${GOVERNANCE_PEER_CLI:-}"
PEER_LOCAL_EXECUTABLE="${GOVERNANCE_PEER_LOCAL_EXECUTABLE:-}"
PEER_REPLY_PREFIX="${GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX:-}"
PEER_DISCOVERY_MARKERS_JSON="${GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON:-[]}"
INSTRUCTION_ENTRY="${GOVERNANCE_INSTRUCTION_ENTRY:-AGENTS.md}"
SHARED_INSTRUCTION_ENTRY="${GOVERNANCE_SHARED_INSTRUCTION_ENTRY:-AGENTS.md}"

if ! printf '%s' "$SELF_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$'; then
  governance_hook_integrity_fail 'self-audit registry-resolved self runtime context is missing or invalid'
fi

PEER_CONTEXT_PRESENT=0
if [ -n "$PEER_PROVIDER$PEER_CLI$PEER_LOCAL_EXECUTABLE$PEER_REPLY_PREFIX" ] \
  || [ "$PEER_DISCOVERY_MARKERS_JSON" != '[]' ]; then
  PEER_CONTEXT_PRESENT=1
  if ! printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$' \
    || ! printf '%s' "$PEER_CLI" | grep -qE '^[a-z][a-z0-9-]*$' \
    || ! printf '%s' "$PEER_REPLY_PREFIX" | grep -qE '^[a-z][a-z0-9-]*-reply$'; then
    governance_hook_integrity_fail 'self-audit registry-resolved peer runtime context is partial or invalid'
  fi
fi

json_array_to_ere() {
  node -- "$HOOK_DIR/lib/provider-marker-regex.mjs" discovery "$1" 2>/dev/null
}

PEER_DISCOVERY_RE=""
if [ "$PEER_CONTEXT_PRESENT" = "1" ]; then
  PEER_DISCOVERY_RE=$(json_array_to_ere "$PEER_DISCOVERY_MARKERS_JSON") || {
    governance_hook_integrity_fail 'self-audit registry-resolved peer discovery metadata is missing or invalid'
  }
fi

WARNINGS=""

governance_hash_prefix() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print substr($1, 1, 16)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print substr($1, 1, 16)}'
  else
    governance_hook_integrity_fail 'self-audit SHA-256 command is unavailable'
  fi
}

# Prove the hashing primitive before policy evaluation. Otherwise a missing host tool collapses
# every deduplication key to the same empty string and can silently suppress a real block.
HASH_PROBE=$(printf 'self-audit-integrity-probe' | governance_hash_prefix) \
  || governance_hook_integrity_fail 'self-audit SHA-256 command failed'
[ "${#HASH_PROBE}" -eq 16 ] \
  || governance_hook_integrity_fail 'self-audit SHA-256 command returned an invalid digest'

emit_governance_block() {
  local reason="$1"
  # Provider-neutral decision envelope. The transport adapter translates this into the provider's
  # declared native Stop contract(JSON continuation block vs blocking exit code).
  local decision
  decision=$(jq -nc --arg reason "$reason" '{governanceDecision:"block",reason:$reason}') \
    || governance_hook_integrity_fail 'self-audit governance decision could not be encoded'
  printf '%s\n' "$decision"
  exit 0
}

# ── Mechanism 1: Claim-verification gap ─────────────────────────────────────
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # NOTE(2026-05-01 v3):versioned transcript contract 把 tool_result 也標 role="user"。
  # 之前 awk 抓到 tool_result line 當「真 user prompt」→ scope window 算錯
  # → fire false positive。
  # 修:grep filter 真 user prompt(role=user 且 content 不是 tool_result),
  # 整 transcript scan(不 tail 500 windowed,避免 edge case)。
  LAST_USER_LINE=$(grep -n '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | \
    grep -v '"type":"tool_result"' | tail -1 | cut -d: -f1)
  LAST_USER_LINE=${LAST_USER_LINE:-0}
  if [ "$LAST_USER_LINE" -gt 0 ]; then
    TRANSCRIPT_LAST_ASSISTANT=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.role=="assistant") | .message.content[]?.text // empty' 2>/dev/null)
    [ -n "$TRANSCRIPT_LAST_ASSISTANT" ] && LAST_ASSISTANT="$TRANSCRIPT_LAST_ASSISTANT"
  fi

  # Detect claim keywords
  # NOTE(2026-05-01): 縮窄 CLAIM_RE — 移除「完成 / 沒問題 / 全部 done / 全綠 / 永遠合規」
  # over-broad conversational 字眼(每 turn 結尾「commit 完成 push」/「沒問題」自然出現,
  # false positive 率高)。保留 strong verification claim(verified / 0 errors / tsc 0 等)。
  # NOTE(2026-05-01): 移除「✅」— 我用 ✅ 在 markdown table 列 status(「✅ 同樣 / ✅ 已 done」)
  # 不是 claim verified done。CLAIM_RE match ✅ 在 table context = false positive。
  # 仍保留 strong verbal claim:verified / 0 errors / done\.(literal period)/ tsc 0
  CLAIM_RE='(verified|all green|all pass|0 errors|tsc 0|done\.|complete\.)'
  # 撤回 escape:assistant 已明確撤回 / 認錯 / 預先聲明否定 / 已 inline 跑 verify → 不 trigger gap
  # 包含 claim-denial patterns(「不 claim」「沒 claim」「明確不」)避免 false positive。
  # 加 verify-result patterns(2026-05-01):AI inline 跑 tsc / build 顯示 result 字眼,
  # 證明本 turn 已驗證,不應 trigger gap。
  RETRACT_RE='(撤回 claim|false claim|沒修好|未驗證|未驗 真實|撤回|不 claim|沒 claim|明確不|明確未|not yet verified|tsc exit 0|tsc:[[:space:]]*0|built in [0-9]+|✓ built|build-storybook exit 0|exit code 0)'
  if grep -qiE "$CLAIM_RE" <<< "$LAST_ASSISTANT" \
    && ! grep -qiE "$RETRACT_RE" <<< "$LAST_ASSISTANT"; then
    # Check if any verify-class tool_use happened in THIS turn(after last user msg)
    VERIFY_RE='(npx tsc|bash packages/design-system/ds-canonical/hooks/tests|compile-stories|npm run build|npm run test|design-system-audit|visual-audit)'
    if [ "$LAST_USER_LINE" -gt 0 ]; then
      THIS_TURN_TOOLS=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
    else
      THIS_TURN_TOOLS=""
    fi
    if ! grep -qE "$VERIFY_RE" <<< "$THIS_TURN_TOOLS"; then
      WARNINGS="${WARNINGS}\n  • Claim-verify gap:你說 verified / done / 完成 等,但本 turn 無 tsc / test / audit 真執行。下輪實跑驗證或撤回 claim。"
      # 標記 CRITICAL — Mechanism 1 升 BLOCKER(2026-04-30 升級):AI claim done 但無驗證
      # = 100+ 次重複 failure mode。不再 silent log,exit `decision: block` 強制 turn 不結束。
      CRITICAL_CLAIM_VERIFY=1
    fi
  fi
fi

# ── Mechanism 7: Completeness-claim without DS-wide scan gate(2026-06-03 user-authorized)──
# Why: 重複 failure mode — AI 在「剛做完那件事」邊界就宣告「全做完/全部完成」,沒先跑 M10
#   「改一處看三處」全庫 stale-ref 掃描 → user 問「真的做完?」才補掃出 loose end(CF model 漏 3 ref
#   / iceberg 等)。觸發器該是「我要宣告全做完」自己,不是 user pushback。
#   per self-verify.md Pre-final + meta-patterns M10 + mindset #6「tell me once」。
if [ "${LAST_USER_LINE:-0}" -gt 0 ] && [ -n "$LAST_ASSISTANT" ]; then
  COMPLETION_CLAIM_RE='(全做完|全部做完|都做完了|全部完成|所有任務.{0,6}(做完|完成)|100%.{0,4}完整|真的.{0,4}做完|全做到完)'
  # 否定/免責排除(對齊 Mechanism 1 RETRACT_RE 精神,2026-06-03 修 M7 自身 false-positive):
  # 宣告含「還沒說全做完」「沒資格說全做完」「核心做完…待跑」「等 X 才全做完/落地」等 disclaimer = 非完成宣告 → 不 fire。
  COMPLETION_NEG_RE='(還沒.{0,6}(說|宣告|算|到)|沒.{0,3}(說|算|資格).{0,8}(全做完|完整)|未.{0,3}全做完|不(敢|算|是|該).{0,6}全做完|核心做完|完整性(掃描)?待|待.{0,4}(跑|落地|驗)|等.{0,18}(才|再).{0,8}(全做完|完整|落地|上架)|尚未.{0,4}完成)'
  if grep -qE "$COMPLETION_CLAIM_RE" <<< "$LAST_ASSISTANT" \
    && ! grep -qE "$COMPLETION_NEG_RE" <<< "$LAST_ASSISTANT"; then
    THIS_TURN_FULL=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
    EDIT_COUNT=$(grep -oE '"name":"(Edit|Write|MultiEdit)"' <<< "$THIS_TURN_FULL" | wc -l | tr -d ' ')
    HAS_COMMIT=$(grep -cE 'git commit|git merge --ff' <<< "$THIS_TURN_FULL")
    if [ "${EDIT_COUNT:-0}" -ge 2 ] || [ "${HAS_COMMIT:-0}" -gt 0 ]; then
      # 全庫掃描證據:grep -r/-rn / rg 跨目錄掃 stale ref,OR claim-verify 表 marker
      SCAN_RE='(grep -[a-zA-Z]*r|rg -|claim-verify|完整性掃描|改一處看三處|stale.?ref|DS-wide|全庫掃)'
      if ! grep -qiE "$SCAN_RE" <<< "$THIS_TURN_FULL"; then
        WARNINGS="${WARNINGS}\n  • 🚨 完整性宣告閘:你宣告「全做完/全部完成」+ 本 turn 實質改動,但無「全庫掃描」證據(無 grep -r/rg 掃 stale ref、無 claim-verify 表)。per self-verify.md Pre-final + M10「改一處看三處」:宣告全做完前必先自己跑 DS-wide stale-ref 掃描 + claim-verify,不等 user 問第二次。"
        CRITICAL_COMPLETENESS=1
      fi
    fi
  fi
fi

# ── Mechanism 7c: Deep-audit coverage gate(2026-07-12 user verbatim「不抽樣不偷懶…現在和未來可以確保嗎」)──
# Why: deep audit「完成」宣告前必證 91 dim × author+peer 雙軌全有證據。AI 自律不可靠(本 session 漏跑
#   deterministic 24 + judgment 26 + hook 39 + CI 2 四層,只做 claim-vs-code + 反應式補,user 憤怒)。
#   verify-deep-audit-coverage.mjs = 機械閘;宣告完成 + ledger 有缺口 → BLOCK。
run_deep_audit_coverage_verify() {
  node scripts/verify-deep-audit-coverage.mjs \
    --self-provider "$SELF_PROVIDER"
}
if [ -n "$LAST_ASSISTANT" ] && [ -f scripts/verify-deep-audit-coverage.mjs ]; then
  DEEPAUDIT_CLAIM_RE='(deep.?audit.{0,10}(完成|完整|done)|稽核.{0,8}(完整完美|全部完成|都.?跑完)|91.{0,6}dim.{0,8}(都|全).{0,4}(跑|過|完|有證據)|Phase A.{0,6}完成)'
  DEEPAUDIT_NEG_RE='(未完成|還沒|尚未|缺口|gap|未跑|待跑|待驗|不算完成|覆蓋.{0,4}未|還有.{0,4}dim|待補)'
  if grep -qE "$DEEPAUDIT_CLAIM_RE" <<< "$LAST_ASSISTANT" \
    && ! grep -qE "$DEEPAUDIT_NEG_RE" <<< "$LAST_ASSISTANT"; then
    if ! run_deep_audit_coverage_verify >/dev/null 2>&1; then
      WARNINGS="${WARNINGS}\n  • Deep-audit completion claim rejected:the active immutable run's provider set, 91 dimensions, or component evidence is incomplete."
      CRITICAL_DEEPAUDIT_COVERAGE=1
    fi
  fi
fi

# ── Mechanism 2: Auto-prune trigger ─────────────────────────────────────────
BOOTSTRAP_LINES=0
SEEN_BOOTSTRAP=""
for f in "$INSTRUCTION_ENTRY" "$SHARED_INSTRUCTION_ENTRY"; do
  printf '%s' "$f" | grep -qE '^[A-Za-z0-9_.@/-]+$' || continue
  case "/$f/" in *"/../"*|*"/./"*) continue ;; esac
  case " $SEEN_BOOTSTRAP " in *" $f "*) continue ;; esac
  SEEN_BOOTSTRAP="${SEEN_BOOTSTRAP} ${f}"
  [ -f "$f" ] && BOOTSTRAP_LINES=$((BOOTSTRAP_LINES + $(wc -l < "$f" | tr -d ' ')))
done
if [ "$BOOTSTRAP_LINES" -gt 500 ]; then
  WARNINGS="${WARNINGS}\n  • ${SELF_DISPLAY_NAME} bootstrap ${BOOTSTRAP_LINES} 行(over 500 — auto-prune trigger)。下輪 invoke /knowledge-prune scope=full,不 defer。"
fi

# Foundational SSOT spec over cap
for f in packages/design-system/src/tokens/color/color.spec.md \
         packages/design-system/src/patterns/element-anatomy/item-anatomy.spec.md \
         packages/design-system/src/components/Sidebar/sidebar.spec.md \
         packages/design-system/src/components/TreeView/tree-view.spec.md \
         packages/design-system/src/components/Field/field.spec.md \
         packages/design-system/src/components/Field/field-controls.spec.md \
         packages/design-system/src/components/Button/button.spec.md \
         packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md \
         packages/design-system/src/patterns/action-bar/action-bar.spec.md \
         packages/design-system/src/tokens/uiSize/uiSize.spec.md; do
  [ -f "$f" ] || continue
  L=$(wc -l < "$f" | tr -d ' ')
  case "$f" in
    */item-anatomy.spec.md) cap=1200 ;;
    # 2026-05-22 prune codify per shared instruction「foundational SSOT 例外 ≤ 800-1200」range:
    # color.spec.md = token system 218-line semantic 不可拆 + nested theme + Atlassian-flow rationale,foundational tier 2 cap 1000。
    */color/color.spec.md) cap=1000 ;;
    *) cap=800 ;;
  esac
  if [ "$L" -gt "$cap" ]; then
    WARNINGS="${WARNINGS}\n  • $f ${L}/${cap} cap — auto-prune trigger,下輪 /knowledge-prune"
  fi
done

# ── Mechanism 4: Peer-reply-verify gap(2026-05-09 user-authorized)──────────
# Why:dual-track markdown rule 沒 enforce — author 讀 peer reply 後可能直接採納,
# 沒走 Step 4.5(verify cite)/ 4.6(regression scan)/ 5(own-version 比稿)。
# 本 mechanism 機械化偵測:同 turn 讀 registry-resolved peer reply file → 必有 cite verify 或 retract。
#
# 觸發 signal:本 turn 內任何 Read tool 命中 `<peer-reply-prefix>-*.md`
# 必須 signal(任一):
#   (a) Bash with `grep` against any file path(cite verify)
#   (b) Bash with `npx tsc` /
#       `bash packages/design-system/ds-canonical/hooks/tests`(regression-class verify)
#   (c) Read against peer-cited code path(`packages/design-system/src/...`)
#   (d) Explicit retract phrase(撤回 / 未採納 / 不採用 / skip peer)
# 任一 missing → CRITICAL 通知;同 Mechanism 1 升 BLOCKER 阻 turn 結束。
if [ "$PEER_CONTEXT_PRESENT" = "1" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "$LAST_USER_LINE" -gt 0 ]; then
  THIS_TURN_FULL=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  PEER_REPLY_READ=$(grep -cE "${PEER_REPLY_PREFIX}-[a-zA-Z0-9_-]+\\.md" <<< "$THIS_TURN_FULL" 2>/dev/null)
  PEER_REPLY_READ=${PEER_REPLY_READ:-0}
  if [ "$PEER_REPLY_READ" -gt 0 ]; then
    # Signal (a)/(b): grep / tsc / hook tests / src/ Read
    VERIFY_SIG_RE='(Bash.*grep|Bash.*npx tsc|Bash.*bash packages/design-system/ds-canonical/hooks/tests|Read.*packages/design-system/src)'
    # Signal (d): retract phrase in last assistant message
    # 2026-05-17 expanded: cover all FP patterns(historical cite / pure git / pure verify / 0 peer)
    RETRACT_PEER_RE="(撤回採納|撤回 claim|未採納 ${PEER_PROVIDER}|不採用 ${PEER_PROVIDER}|skip peer|${PEER_PROVIDER}.*未 verify|0 條新 peer|0 peer|沒啟 peer|沒要啟 peer|純 git|純 verify|純文字|本 turn 純|本 turn 無 peer|引用 prior|cite previous|描述 prior|歷史 peer|historical reference)"
    HAS_VERIFY=$(grep -cE "$VERIFY_SIG_RE" <<< "$THIS_TURN_FULL" 2>/dev/null)
    HAS_VERIFY=${HAS_VERIFY:-0}
    HAS_RETRACT=$(grep -cE "$RETRACT_PEER_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_RETRACT=${HAS_RETRACT:-0}
    if [ "$HAS_VERIFY" -eq 0 ] && [ "$HAS_RETRACT" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Peer-reply verify gap:本 turn 讀 ${PEER_DISPLAY_NAME} reply 但無 grep cite verify / tsc / hook tests / Read src/。下輪實 Step 4.5/4.6 verify 或撤回採納。"
      CRITICAL_PEER_VERIFY=1
    fi

    # ── Sub-check: 比稿 anti-pass-through(2026-05-09 user-authorized infra auto;升級 dissent enforcement)──
    # User 反復糾正「pass-through degeneration」(直接 quote peer 不標 author own version)。
    # 規定:必 Layer A(author own)+ Layer B(peer own)+ Layer C(synthesize)。
    # 2026-05-09 v2:author 與 peer 必須各自查證、真辯論、再 synthesize。
    # Mechanical 偵測:本 turn 讀 peer reply 必含 (own-version OR dissent OR retract) — 任一 valid;
    # 若 turn 還動 spec.md / production src / canonical governance 等 substantive home
    # → 缺辯證 → BLOCKER。產生的 provider delivery view 不是 semantic home。
    OWN_VERSION_RE="(${SELF_PROVIDER} own|Layer A own|Step 0\\.5|我 own analysis|我 Step 0|own version|own analysis)"
    DISSENT_RE="(撞 ${PEER_PROVIDER}|不同意 ${PEER_PROVIDER}|反駁 ${PEER_PROVIDER}|撤回採|不採 ${PEER_PROVIDER}|Layer C|比稿|我覺得 ${PEER_PROVIDER} 錯|${PEER_PROVIDER} 推論錯|採 user|user 撞對)"
    HAS_OWN_VERSION=$(grep -ciE "$OWN_VERSION_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_OWN_VERSION=${HAS_OWN_VERSION:-0}
    HAS_DISSENT=$(grep -ciE "$DISSENT_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_DISSENT=${HAS_DISSENT:-0}
    HAS_DEBATE=$((HAS_OWN_VERSION + HAS_DISSENT + HAS_RETRACT))
    if [ "$HAS_DEBATE" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Peer pass-through risk:本 turn 讀 ${PEER_DISPLAY_NAME} reply 但無 (Layer A own / Step 0.5 / dissent / 撤回採 / Layer C 比稿) 任一 marker。下輪明標「Layer A own:」+「Layer C dissent N 點」section,真撞不盲從 peer 結論。"
      # Sub-check: 同 turn 有 substantive edit + 無辯證 → BLOCKER
      SUBSTANTIVE_EDIT_RE='(Edit|Write).*(packages/design-system/src|\.spec\.md|packages/design-system/ds-canonical/(rules|references|skills|hooks)|packages/governance/canonical)'
      HAS_SUBSTANTIVE=$(grep -cE "$SUBSTANTIVE_EDIT_RE" <<< "$THIS_TURN_FULL" 2>/dev/null)
      HAS_SUBSTANTIVE=${HAS_SUBSTANTIVE:-0}
      if [ "$HAS_SUBSTANTIVE" -gt 0 ]; then
        CRITICAL_PEER_VERIFY=1  # 升 BLOCKER:無辯證 + 動 substantive home = 違反「真辯論」紀律
        WARNINGS="${WARNINGS}\n    🚨 BLOCKER 升級:本 turn 動 substantive home(spec/src/instructions/rules)且無辯證 marker → 違反「跟 peer 真辯論才 ship」紀律。立刻 inline 標 Layer C dissent OR 撤回 substantive edit。"
      fi
    fi

    # ── Sub-check M31 Phase-A-first(2026-05-29 codify per user「peer 只是 second opinion」)──
    # 偵測:本 turn 讀 peer reply 但無 prior author-solo audit trace(Agent/Explore dispatch OR ≥5 Grep/Read)
    # → peer 被當 primary 而非 second opinion = 違反 M31 dual-track「author 必先自己 Phase A」。
    M31_PRIOR_AUDIT=$(grep -cE '"(Agent|Task)"|subagent_type|Explore' <<< "$THIS_TURN_FULL" 2>/dev/null)
    M31_PRIOR_AUDIT=${M31_PRIOR_AUDIT:-0}
    M31_GREP_READ=$(grep -cE '"name":"(Grep|Read)"' <<< "$THIS_TURN_FULL" 2>/dev/null)
    M31_GREP_READ=${M31_GREP_READ:-0}
    if [ "$M31_PRIOR_AUDIT" -eq 0 ] && [ "$M31_GREP_READ" -lt 5 ]; then
      WARNINGS="${WARNINGS}\n  • M31 Phase-A-first risk:本 turn 啟 ${PEER_DISPLAY_NAME} 但無 ${SELF_DISPLAY_NAME}-solo audit trace(Explore/Agent dispatch OR ≥5 Grep/Read)。peer = second opinion,author 必先自己跑完整 Phase A 深度 audit 才 defer peer(跑幾個 script ≠ Phase A)。"
    fi

    # ── Sub-check: 產品／UI／UX SSOT 真取捨缺 exact target-bound decision；工程 remediation AUTO ──
    # User 直接糾「設計決策的東西你應該要先問過我讓我決策吧?為什麼就直接開跑」(commit 698ff58)
    # Shared instruction `# 稽核 canonical` Audit-vs-execute 分權:substantive meaning → STOP 提議。
    # 設計決策(token 換 / hover behavior / spec L4 改寫 / state machine)= substantive。
    # 2026-05-15 NO-SAMPLE detection(audit-full-sweep canonical):
    # 偵測 sub-agent prompt 含 sample subset keyword + `/design-system-audit --deep` context
    SAMPLE_RE='sample top [0-9]+|sampled top|subset|pick top [0-9]+|top hot|too many to scan|sampled components'
    DEEP_AUDIT_RE='/design-system-audit.*--deep|design-system-audit --deep'
    HAS_SAMPLE=$(grep -cE "$SAMPLE_RE" <<< "$THIS_TURN_FULL" 2>/dev/null)
    HAS_DEEP=$(grep -cE "$DEEP_AUDIT_RE" <<< "$THIS_TURN_FULL" 2>/dev/null)
    HAS_SAMPLE=${HAS_SAMPLE:-0}
    HAS_DEEP=${HAS_DEEP:-0}
    if [ "$HAS_SAMPLE" -gt 0 ] && [ "$HAS_DEEP" -gt 0 ]; then
      WARNINGS="${WARNINGS}\n  • NO-SAMPLE violation:本 turn `--deep` audit sub-agent prompt 含 sample subset keyword(sample top N / subset / pick top X 等)違反 audit-full-sweep canonical(memory/feedback_audit_full_sweep_not_sample.md)。下輪 sub-agent dispatch 改 DS-wide ALL components,context 不夠拆 stage 不 sample。"
    fi

    # Mechanical 偵測:peer reply read + Edit/Write production code(packages/design-system/src/)
    # + canonical target-bound decision evidence 不通過 → BLOCKER。
    # 2026-05-15 fix(per user「Hook false-positive 再犯」):
    # 原 regex `(Edit|Write).*packages/design-system/src` 在 raw text 上掃 → 誤抓 sub-agent report
    # 內含「Edit packages/design-system/src/...」file:line snippet 的描述文字。
    # 升級:jq 直接掃 tool_use 結構,只算「tool_name in {Edit,Write,MultiEdit} AND
    # tool_input.file_path startsWith packages/design-system/src/ AND NOT .stories.tsx/.test.ts/.spec.ts allowlist」。
    EDIT_TARGET_CANDIDATES=$(jq -r '
      select(.message.content) | .message.content[]? |
      select(.type == "tool_use") |
      select(.name == "Edit" or .name == "Write" or .name == "MultiEdit") |
      [
        .input.file_path?,
        .input.path?,
        (.input.changed_paths[]?),
        (.input.edits[]? | (.file_path? // .path?))
      ] | .[] | select(type == "string" and length > 0)
    ' 2>/dev/null <<< "$THIS_TURN_FULL") \
      || governance_hook_integrity_fail 'peer design target extraction failed'
    PRODUCTION_TARGETS=""
    while IFS= read -r candidate; do
      [ -z "$candidate" ] && continue
      case "$candidate" in
        packages/design-system/src/*.tsx|packages/design-system/src/*.ts|packages/design-system/src/*.css|*/packages/design-system/src/*.tsx|*/packages/design-system/src/*.ts|*/packages/design-system/src/*.css)
          case "$candidate" in
            *.stories.tsx|*.test.*|*.spec.ts|*.anatomy.stories.tsx|*.principles.stories.tsx) ;;
            *) PRODUCTION_TARGETS="${PRODUCTION_TARGETS}${PRODUCTION_TARGETS:+
}${candidate}" ;;
          esac
          ;;
      esac
    done <<EOF
$EDIT_TARGET_CANDIDATES
EOF
    if [ -n "$PRODUCTION_TARGETS" ]; then
      # One canonical parser owns decision-domain, target-binding and precedence semantics.
      # A peer retract can satisfy peer-verification discipline, but can never override user denial.
      APPROVAL_HELPER="$HOOK_DIR/lib/approval-evidence.mjs"
      if [ -L "$APPROVAL_HELPER" ] || [ ! -f "$APPROVAL_HELPER" ] || [ ! -r "$APPROVAL_HELPER" ]; then
        governance_hook_integrity_fail 'peer design approval evidence helper is unavailable or unsafe'
      fi
      while IFS= read -r candidate; do
        [ -z "$candidate" ] && continue
        APPROVAL_EVIDENCE=$(node "$APPROVAL_HELPER" \
          --transcript "$TRANSCRIPT_PATH" \
          --target "$candidate" 2>/dev/null)
        APPROVAL_RC=$?
        case "$APPROVAL_RC" in 0|2) ;; *)
          governance_hook_integrity_fail "peer design approval helper failed with rc=${APPROVAL_RC}"
        esac
        if ! jq -e '
          type == "object"
          and .schemaVersion == 1
          and .kind == "latest-user-design-authorization"
          and (.decision == "approved" or .decision == "blocked")
          and (.decisionDomain == "engineering-remediation"
            or .decisionDomain == "product-ui-ux"
            or .decisionDomain == "unknown")
          and (.target | type == "string" and length > 0)
          and (.targetBinding == null or (.targetBinding | type == "string" and length > 0))
          and (.reasonCode | type == "string" and test("^[A-Z][A-Z0-9_]*$"))
          and (.latestUserMessageSha256 | type == "string" and test("^[0-9a-f]{64}$"))
          and (.decisionMessageSha256 == null
            or (.decisionMessageSha256 | type == "string" and test("^[0-9a-f]{64}$")))
          and (.operationEvidenceSha256 | type == "string" and test("^[0-9a-f]{64}$"))
        ' >/dev/null 2>&1 <<< "$APPROVAL_EVIDENCE"; then
          governance_hook_integrity_fail 'peer design approval helper emitted an invalid contract'
        fi
        APPROVAL_REASON=$(jq -r '.reasonCode' <<< "$APPROVAL_EVIDENCE") \
          || governance_hook_integrity_fail 'peer design approval reason extraction failed'
        APPROVAL_DECISION=$(jq -r '.decision' <<< "$APPROVAL_EVIDENCE") \
          || governance_hook_integrity_fail 'peer design approval decision extraction failed'
        APPROVAL_DOMAIN=$(jq -r '.decisionDomain' <<< "$APPROVAL_EVIDENCE") \
          || governance_hook_integrity_fail 'peer design approval domain extraction failed'
        if [ "$APPROVAL_REASON" = "TRANSCRIPT_UNAVAILABLE_OR_INVALID" ]; then
          governance_hook_integrity_fail 'peer design transcript could not be parsed by the evidence helper'
        fi
        if { [ "$APPROVAL_RC" -eq 0 ] && [ "$APPROVAL_DECISION" != "approved" ]; } \
          || { [ "$APPROVAL_RC" -eq 2 ] && [ "$APPROVAL_DECISION" != "blocked" ]; }; then
          governance_hook_integrity_fail 'peer design approval decision did not match helper exit status'
        fi
        if [ "$APPROVAL_DECISION" = "blocked" ]; then
          PEER_DESIGN_TARGET="$candidate"
          PEER_DESIGN_REASON="$APPROVAL_REASON"
          PEER_DESIGN_DOMAIN="$APPROVAL_DOMAIN"
          WARNINGS="${WARNINGS}\n  • Peer-design-decision-blocked:target=${candidate}, domain=${APPROVAL_DOMAIN}, reason=${APPROVAL_REASON}。工程修復不需 human approval；UI/UX 取捨只接受 exact target-bound decision，未知情況 fail closed。"
          CRITICAL_PEER_DESIGN_NO_APPROVAL=1
          break
        fi
      done <<EOF
$(printf '%s\n' "$PRODUCTION_TARGETS" | sort -u)
EOF
    fi
  fi
fi

# ── Mechanism 8: Provenance escalation(M36(a),2026-08-08 user directive)──
# 把「我的推論」寫成「user 的決定」= 該 session 連犯 6 次的 failure mode
# (「<768 modal 無入口是你拍板」/「X = 終結 session」/「392px user 接受」/ 816 讓位線 …)。
# 同 provider 的對抗審查抓不到這一類(reviewer 無對話紀錄),只能在 reply 出口攔。
# Detector:reply 出現歸因語 + 全文零個中文引號 = 引不出原話。
# Escape 極簡:引 user 原話(「…」)或明寫「AI 推導 / AI 建議」即不 fire。
if [ -n "$LAST_ASSISTANT" ]; then
  ATTRIB_RE='(user (拍板|決定|核准)|你(拍板|的拍板)|已拍板|你最早的(拍板|決定))'
  # 有引號 = 有引原話;明說 AI 推導/建議 = 已誠實降級;兩者皆為合格 escape
  PROV_ESCAPE_RE='(「|」|AI 推導|AI 建議|未經拍板|前提錯誤|我捏造|本文自創)'
  if grep -qE "$ATTRIB_RE" <<< "$LAST_ASSISTANT" \
    && ! grep -qE "$PROV_ESCAPE_RE" <<< "$LAST_ASSISTANT"; then
    WARNINGS="${WARNINGS}\n  • Provenance 升格(M36a):你寫了「user 拍板/決定」但整段沒有引 user 原話。立刻補引原話,或降級成「AI 推導 / AI 建議、user 採納」。問句不是同意。"
  fi
fi

# ── Mechanism 6: capability-bound PushNotification gap ────────────────────
# Provider-neutral runtime 不可假設 exact tool 存在。只有 adapter/registry 明確宣告
# `push-notification` capability 時才檢查；缺宣告 = UNOBSERVED/nonblocking。
NOTIFICATION_AVAILABLE=0
case ",${GOVERNANCE_AVAILABLE_CAPABILITIES:-}," in
  *,push-notification,*|*,PushNotification,*) NOTIFICATION_AVAILABLE=1 ;;
esac
[ "${GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE:-0}" = "1" ] && NOTIFICATION_AVAILABLE=1
if [ "$NOTIFICATION_AVAILABLE" = "1" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  ASSISTANT_LEN=${#LAST_ASSISTANT}
  ASSISTANT_LEN=${ASSISTANT_LEN:-0}
  # Substantive trigger:長 reply OR 含 commit/ship/done/push keyword
  SUBSTANTIVE_RE='(commit|ship|push|done|完成|已 land|landed|merged|測試 PASS|verify gate PASS)'
  IS_SUBSTANTIVE=0
  if [ "$ASSISTANT_LEN" -gt 200 ]; then IS_SUBSTANTIVE=1; fi
  if grep -qiE "$SUBSTANTIVE_RE" <<< "$LAST_ASSISTANT"; then IS_SUBSTANTIVE=1; fi
  if [ "$IS_SUBSTANTIVE" = "1" ]; then
    # Check PushNotification tool call trace in this turn
    HAS_PUSH=$(grep -ciE 'PushNotification|"name":"PushNotification"' <<< "$THIS_TURN_TOOLS" 2>/dev/null)
    HAS_PUSH=${HAS_PUSH:-0}
    if [ "$HAS_PUSH" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • PushNotification gap:current adapter 已宣告 push-notification capability，但本 turn substantive output 無 tool call trace。per memory/feedback_push_always_call.md，有能力時必 call；terminal-focused suppression 由 harness 自決。"
    fi
  fi
fi

# ── Mechanism 5: Peer transport discovery gap(2026-05-17 user-authorized)──
# Registry 宣告 peer 的 local/global discovery markers。本 mechanism 偵測:本 turn 含 active peer
# collaboration 意圖 AND 無任一 discovery marker trace AND 無撤回 → BLOCKER。
if [ "$PEER_CONTEXT_PRESENT" = "1" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  THIS_TURN_RAW=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  # Scope to assistant prose so commit messages, tool inputs, and historical citations do not
  # trigger the gate. Active intent requires an action verb adjacent to the resolved peer id.
  PEER_INTENT_RE="(跟|找|請|問|用).{0,5}${PEER_PROVIDER}.{0,30}(討論|比稿|辯論|確認|propose|送 brief|exec|review|做|看)|(啟|跑|執行|觸發|invoke|run|start|trigger|execute|propose|action|will|may|going to).{0,15}(${PEER_PROVIDER}[-_ ]?(collab|exec|review)|dual-track)|@${PEER_PROVIDER} (DISCUSS|IMPLEMENT)|(派|dispatch|invoke|send to|送 brief|發給|propose) ${PEER_PROVIDER}|${PEER_PROVIDER}.{0,10}(做|跑|review)"
  PEER_INTENT=$(grep -ciE "$PEER_INTENT_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
  PEER_INTENT=${PEER_INTENT:-0}
  if [ "$PEER_INTENT" -gt 0 ]; then
    HAS_DISCOVERY=$(grep -cE "$PEER_DISCOVERY_RE" <<< "$THIS_TURN_RAW" 2>/dev/null)
    HAS_DISCOVERY=${HAS_DISCOVERY:-0}
    # 2026-05-27 expanded NEGATIVE indicators(retrospective / documentation / canonical-describe contexts):
    # 增加 markers that signal「描述 canonical / retrospective 紀念 anchor」not「啟 peer collab」。
    # Per AI-self-audit-unreliable canonical:擴 negative-list 不 loosen positive,品質保留。
    RETRACT_TRANSPORT_RE="(撤回 ${PEER_PROVIDER}|改用 cloud|Explore 替身|未走 Step 0\\.4|未跑 discovery|peer 通道斷|0 peer collab|沒要啟 peer|沒啟 peer|本 turn 純|純 git|純 verify|純文字|歷史 peer|cite previous|cite prior|引用 prior|描述 prior|無 peer (invocation|意圖|collab)|本 turn 無 peer|retrospective (anchor|reference|mention)|錨例|錨點|為例|是 supplementary|是 retrospective|documenting (canonical|skill)|skill 描述|skill 文檔|本輪 reply 提及.*是 retrospective|describing canonical|describe.*M31|M31.*真意|是 documentation|是 skill workflow 描述)"
    HAS_RETRACT_TRANSPORT=$(grep -cE "$RETRACT_TRANSPORT_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_RETRACT_TRANSPORT=${HAS_RETRACT_TRANSPORT:-0}
    if [ "$HAS_DISCOVERY" -eq 0 ] && [ "$HAS_RETRACT_TRANSPORT" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Peer transport discovery 未跑(SKILL Step 0.4):本 turn 含 ${PEER_DISPLAY_NAME} collab 意圖但無 registry discovery marker。下輪先跑 discovery 確認 transport,禁憑印象選 cloud / Explore 替身。"
      CRITICAL_PEER_TRANSPORT=1
    fi
  fi
fi

# ── Mechanism 3: Repeated-topic detector(session-scope, M13/M19 trigger)──
#
# Threshold rationale(對齊 ≥ 3 家世界級 governance system,M8 binding)─────
#
# | 工具 | Threshold 哲學 | 對應本 hook |
# |------|---------------|-------------|
# | Bugsnag | occurrence count = 5 before alerting | trigger ≥ 5 |
# | PagerDuty | time-window dedup = 5 min | dedup window 30m(below) |
# | Datadog Watchdog | mean + 2σ outlier detection | TODO: dynamic threshold(baseline) |
# | ESLint | max-warnings = 10 | topic > 10 |
# | Sentry | alert frequency = 10 events/hour | topic > 10 |
# | SonarQube | cognitive complexity = 15(較寬)| topic upper bound reference |
#
# Current threshold(fixed,對齊 Bugsnag/ESLint/Sentry minimum 共識):
# - Trigger phrase: ≥ 5(對齊 Bugsnag occurrence count 5)
# - Topic repeat: > 10(對齊 ESLint max-warnings 10 + Sentry alert freq 10)
# - Dedup count: ≥ 5(對齊 Bugsnag occurrence count 5;同 warning fired
#   ≥ 5 次 still 沒解 = 該 user 主動處理,inject 第 6 次仍無效)
#
# TODO: When neutral runtime `self-audit-baseline-counts.jsonl` 累積 ≥ 100 samples,
# 改 dynamic threshold = baseline mean + 2σ(對齊 Datadog Watchdog 哲學)。
# Baseline capture mechanism 在本檔結尾(每 turn 寫 trigger/topic count
# 不論 fire 與否,讓 future analysis 有 ground truth distribution)。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract user message texts from transcript(縮 500→200,只看最近 turns)
  USER_MSGS=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null)

  # Detect M13/M19-style trigger phrases repeated across turns
  TRIGGER_RE='(確保|永遠|不留待辦|不能漂移|沒例外|ensure|always|never|world-class|世界級)'
  TRIGGER_COUNT=$(grep -ciE "$TRIGGER_RE" <<< "$USER_MSGS" 2>/dev/null)
  TRIGGER_COUNT=${TRIGGER_COUNT:-0}

  if [ "$TRIGGER_COUNT" -ge 5 ]; then
    WARNINGS="${WARNINGS}\n  • User trigger-phrase 累計 ${TRIGGER_COUNT} 次(M19 strong signal)。確認 /ensure-canonical 5-layer 全做完;若有任一 layer skip = 違反 M19。"
  fi

  # Same-topic repetition(quick keyword overlap heuristic)
  TOPIC_KEYWORDS=$(tr -s '[:space:]' '\n' <<< "$USER_MSGS" | \
    grep -iE '^(audit|prune|principles|trait|canonical|hook|skill|world-class|infra)$' | \
    sort | uniq -c | sort -rn | awk 'NR <= 3 { print }')
  TOP_COUNT=$(awk 'NR == 1 { print $1 }' <<< "$TOPIC_KEYWORDS")

  if [ -n "$TOP_COUNT" ] && [ "$TOP_COUNT" -gt 10 ]; then
    TOP_TOPIC=$(awk 'NR == 1 { print $2 }' <<< "$TOPIC_KEYWORDS")
    WARNINGS="${WARNINGS}\n  • Topic「${TOP_TOPIC}」repeated ${TOP_COUNT}x — likely user 第 N 次提示同主題,可能 prior turns 落地不徹底。"
  fi

  # ── Mechanism 4: M33 stop-hook overfire reflex detection(2026-05-13 ship)──
  #
  # M33 canonical(meta-patterns.md):AI 對連續 stop hook BLOCKER 自動 conservative-defer
  # 「下個 session」「context budget」「省工」反 pattern。Detect 雙條件:
  #   (a) Last assistant reply 含 defer keyword
  #   (b) Recent user msgs 含 push-back keyword(user 反覆催做完)
  # 兩條件成立 → WARN「revert next-session framing,continue work or be specific about prereq deliverable」
  # 2026-05-13 peer review fix:dedup 重複「下個 session」+ expand variants。
  DEFER_RE='(下個 session|下次 session|下一個 session|下個工作 session|下一輪|context budget|context 不夠|上下文不夠|token budget|省 token|省工|next session|defer|留下次|留下個)'
  PUSHBACK_RE='(沒理由不做|繼續做下去|全部做完|繼續全部做完|馬不停蹄|繼續做不要停|繼續|做完|沒擔憂|沒原因)'
  if [ -n "$LAST_ASSISTANT" ] && [ -n "$USER_MSGS" ]; then
    HAS_DEFER=$(grep -cE "$DEFER_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_DEFER=${HAS_DEFER:-0}
    HAS_PUSHBACK=$(grep -cE "$PUSHBACK_RE" <<< "$USER_MSGS" 2>/dev/null)
    HAS_PUSHBACK=${HAS_PUSHBACK:-0}
    if [ "$HAS_DEFER" -gt 0 ] && [ "$HAS_PUSHBACK" -gt 0 ]; then
      WARNINGS="${WARNINGS}\n  • M33 stop-hook overfire reflex:你 reply 含 defer keyword(${HAS_DEFER}x)且 user 已 push-back(${HAS_PUSHBACK}x「沒理由不做/繼續/做完」)。**真理由必具體 deliverable**(prereq 缺什麼 / 真技術 dead-end);否則 revert「下個 session」framing,撤回 claim + continue work。per meta-patterns.md M33。"
    fi
  fi

  # ── Baseline capture(每 turn always log trigger/topic counts,不論 fire)
  # 為 future dynamic threshold(mean + 2σ)累積 ground truth distribution。
  if [ "$STATE_WRITES" = "1" ]; then
    BASELINE_FILE="$STATE_DIR/self-audit-baseline-counts.jsonl"
    mkdir -p "$STATE_DIR" 2>/dev/null
    printf '{"ts":"%s","trigger":%d,"topic":%d,"fired":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "${TRIGGER_COUNT:-0}" \
      "${TOP_COUNT:-0}" \
      "$([ -n "$WARNINGS" ] && echo true || echo false)" \
      >> "$BASELINE_FILE" 2>/dev/null || true
  fi
fi

# Silent if nothing
[ -z "$WARNINGS" ] && exit 0

# Dedup(2026-05-01):若同樣 warning content 已連續寫 ≥ 5 次 entry,skip 本次
# 寫入 — 對齊 Bugsnag occurrence count = 5 哲學:同 warning fired ≥ 5 次仍沒解
# = 該 user 主動處理,inject 第 6 次仍無效。避免 inject 一直 echo 老 warning。
if [ "$STATE_WRITES" = "1" ] && [ -f "$STATE_DIR/self-audit-warnings.jsonl" ]; then
  WARN_HASH=$(printf '%b' "$WARNINGS" | governance_hash_prefix)
  RECENT_HASHES=$(tail -5 "$STATE_DIR/self-audit-warnings.jsonl" 2>/dev/null | \
    jq -r '.warnings // empty' 2>/dev/null | \
    while IFS= read -r w; do printf '%s' "$w" | governance_hash_prefix; done)
  DEDUP_COUNT=$(grep -c "^${WARN_HASH}$" <<< "$RECENT_HASHES" 2>/dev/null)
  DEDUP_COUNT=${DEDUP_COUNT:-0}
  if [ "$DEDUP_COUNT" -ge 5 ]; then
    exit 0
  fi
fi

# 永遠 log warnings(下 turn 透過 inject_pending_self_audit 看到)
if [ "$STATE_WRITES" = "1" ]; then
  mkdir -p "$STATE_DIR" 2>/dev/null
  printf '{"ts":"%s","warnings":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
    >> "$STATE_DIR/self-audit-warnings.jsonl" 2>/dev/null || true
fi

# ── BLOCKER upgrade(2026-04-30):Mechanism 1 claim-verify gap 升 block ──
# Neutral Stop decision 經 adapter 轉為當前 provider native contract,強制 turn
# 不結束,AI 必先處理 reason 再能完成。這修補 100+ 次重複 failure:AI claim done →
# 下 turn user 才發現未修 → 我重發現 → 補修。
#
# 防 infinite loop:同一 claim hash 已 block 過 1 次 → 該 turn 不再 block(降 warn)。
# 假設同一 claim hash:assistant text 末 200 char 的 sha256 prefix。
if [ "${CRITICAL_CLAIM_VERIFY:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  CLAIM_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_FILE="$STATE_DIR/.last-blocked-claim.txt"
  LAST_BLOCKED=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_FILE" ] && LAST_BLOCKED=$(cat "$LAST_BLOCKED_FILE" 2>/dev/null || echo "")

  if [ "$CLAIM_HASH" != "$LAST_BLOCKED" ]; then
    # 第一次 block,記 hash 防 loop
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$CLAIM_HASH" > "$LAST_BLOCKED_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 CLAIM-VERIFY GAP BLOCKER:你 claim「verified / done / 完成」但本 turn 沒跑 tsc / test / audit / visual 真驗證。立刻 (a) 跑 npx tsc -b + 對應驗證指令,OR (b) 在本 turn 明確撤回 claim(打「撤回 claim」/「未驗證」)。否則 turn 不結束。" \
      "本機制 = M20 100+ 次 failure mode 升 BLOCKER(原 silent inject → block)。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 4 peer-design-no-approval(2026-05-09 user-authorized + escalated)──
if [ "${CRITICAL_PEER_DESIGN_NO_APPROVAL:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  DESIGN_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_DESIGN_FILE="$STATE_DIR/.last-blocked-design.txt"
  LAST_BLOCKED_DESIGN=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_DESIGN_FILE" ] && LAST_BLOCKED_DESIGN=$(cat "$LAST_BLOCKED_DESIGN_FILE" 2>/dev/null || echo "")
  if [ "$DESIGN_HASH" != "$LAST_BLOCKED_DESIGN" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$DESIGN_HASH" > "$LAST_BLOCKED_DESIGN_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 PEER-DESIGN-DECISION BLOCKER(M4 sub-check):本 turn 讀 ${PEER_DISPLAY_NAME} reply 並修改 ${PEER_DESIGN_TARGET:-packages/design-system/src}; canonical evidence domain=${PEER_DESIGN_DOMAIN:-unknown}, reason=${PEER_DESIGN_REASON:-UNKNOWN_POTENTIAL_UI_UX_DECISION}。工程 bug/refactor/test/governance/infra remediation 不需 human approval；真正 UI/UX SSOT 取捨需 exact target-bound decision，未知情況 fail closed。否則 turn 不結束。" \
      "本機制 = workflow violation 升級為 mechanical BLOCKER(2026-05-09 user-authorized,起因 commit 698ff58 v15.16 ship 沒拍板)。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 4 peer-verify gap(2026-05-09 user-authorized)──
# 升級邏輯同 Mechanism 1:第一次 block 阻 turn,降 warn for 同 hash 防 loop
if [ "${CRITICAL_PEER_VERIFY:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  PEER_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_PEER_FILE="$STATE_DIR/.last-blocked-peer-${PEER_PROVIDER}.txt"
  LAST_BLOCKED_PEER=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_PEER_FILE" ] && LAST_BLOCKED_PEER=$(cat "$LAST_BLOCKED_PEER_FILE" 2>/dev/null || echo "")

  if [ "$PEER_HASH" != "$LAST_BLOCKED_PEER" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$PEER_HASH" > "$LAST_BLOCKED_PEER_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 PEER-VERIFY GAP BLOCKER(M4):本 turn 讀 ${PEER_DISPLAY_NAME} reply 但無走 Step 4.5(grep cite verify)/ 4.6(regression scan)/ 5(own-version 比稿)。立刻(a) grep 對 peer 引用 file:line verify,OR(b) 跑 tsc / hook tests regression,OR(c) 明寫「撤回採納 peer」/「未採納」。否則 turn 不結束。" \
      "本機制 = dual-track markdown rule 升 mechanical BLOCKER(2026-05-09 user-authorized)。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 5 peer-transport-discovery(2026-05-17 user-authorized)──
if [ "${CRITICAL_PEER_TRANSPORT:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  TRANSPORT_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_TRANSPORT_FILE="$STATE_DIR/.last-blocked-transport.txt"
  LAST_BLOCKED_TRANSPORT=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_TRANSPORT_FILE" ] && LAST_BLOCKED_TRANSPORT=$(cat "$LAST_BLOCKED_TRANSPORT_FILE" 2>/dev/null || echo "")
  if [ "$TRANSPORT_HASH" != "$LAST_BLOCKED_TRANSPORT" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$TRANSPORT_HASH" > "$LAST_BLOCKED_TRANSPORT_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 PEER-TRANSPORT-DISCOVERY BLOCKER(M5):本 turn 含 ${PEER_DISPLAY_NAME} collab 意圖但無 registry discovery marker trace。SKILL Step 0.4 強制 local/global discovery 在啟 peer 前。立刻 (a) 驗證 registered peer CLI ${PEER_CLI},OR (b) 明寫「撤回 peer / 改用 cloud / Explore 替身」+ 解釋為何不走 local。否則 turn 不結束。" \
      "本機制 = 防 2026-05-17 失憶 anti-pattern(嘗試 sudo install / 繞 M28 direct-main 或未授權 merge / Explore 替身),user-authorized markdown SKILL.md L42-58 升 mechanical BLOCKER。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 7 completeness-claim-without-scan(2026-06-03 user-authorized)──
if [ "${CRITICAL_COMPLETENESS:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  COMPLETE_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_COMPLETE_FILE="$STATE_DIR/.last-blocked-completeness.txt"
  LAST_BLOCKED_COMPLETE=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_COMPLETE_FILE" ] && LAST_BLOCKED_COMPLETE=$(cat "$LAST_BLOCKED_COMPLETE_FILE" 2>/dev/null || echo "")
  if [ "$COMPLETE_HASH" != "$LAST_BLOCKED_COMPLETE" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$COMPLETE_HASH" > "$LAST_BLOCKED_COMPLETE_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 COMPLETENESS-CLAIM-WITHOUT-SCAN BLOCKER(M7,2026-06-03 user-authorized):你宣告「全做完/全部完成」+ 本 turn 實質多檔改動,但無「全庫掃描」證據。per self-verify.md Pre-final + M10「改一處看三處」+ mindset #6:宣告全做完前必先自己跑 (1) DS-wide stale-ref grep(對你改的東西掃連帶 reference)(2) claim-verify 表(每『done』對應證據)。立刻補跑 OR 把『全做完』改成『核心做完,完整性掃描待跑』。否則 turn 不結束。" \
      "本機制起因:重複 failure — user 每次問『真的全做完?』我才補掃出 loose end(CF model 漏 3 ref / iceberg)。觸發器改成『宣告完成』本身,非 user pushback。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 7c deep-audit coverage(2026-07-12 user-authorized)──
if [ "${CRITICAL_DEEPAUDIT_COVERAGE:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  DACOV_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_DACOV_FILE="$STATE_DIR/.last-blocked-deepaudit-coverage.txt"
  LAST_BLOCKED_DACOV=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_DACOV_FILE" ] && LAST_BLOCKED_DACOV=$(cat "$LAST_BLOCKED_DACOV_FILE" 2>/dev/null || echo "")
  if [ "$DACOV_HASH" != "$LAST_BLOCKED_DACOV" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$DACOV_HASH" > "$LAST_BLOCKED_DACOV_FILE" 2>/dev/null || true; }
    COVERAGE_OUTPUT=$(run_deep_audit_coverage_verify 2>/dev/null || true)
    GAPLINE=$(awk '/個 dim-證據缺口/ && !found { print; found=1 }' <<< "$COVERAGE_OUTPUT")
    REASON=$(printf '%s' \
      "🚨 DEEP-AUDIT-COVERAGE BLOCKER(M7c,2026-07-12 user-authorized「不抽樣不偷懶…現在和未來可以確保嗎」):你宣告 deep audit 完成,但 neutral evidence verifier 未通過 — ${GAPLINE:-immutable run 的 91 dim / component 證據未閉合}。禁宣稱 done。跑 node scripts/verify-deep-audit-coverage.mjs --self-provider ${SELF_PROVIDER} 看缺哪些；provider set 與本次 second-opinion disposition 只由 active immutable manifest 決定。填完 Git-owned governance-runtime/evidence/deep-audit 內的 judgment / deterministic / hook-residue / ci-enforced / component-a1b 證據才可宣稱；OR 明寫『核心做完,dim 覆蓋待補』。否則 turn 不結束。" \
      "本機制起因:本 session AI 漏跑 91 dim 裡 deterministic 24 + judgment 26 + hook 39 + CI 2 四層,只做 claim-vs-code + 反應式補,user 憤怒。觸發器 = 宣告 deep audit 完成本身。")
    emit_governance_block "$REASON"
  fi
fi

exit 0
