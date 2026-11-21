#!/bin/bash
set -uo pipefail
# Stop hook: AI self-audit — detect 3 anti-patterns + inject corrective context.
#
# 1. Claim-verification gap:assistant claimed「verified / done / 全部 / pass / 完成」
#    in transcript but no verify cmd(tsc / hook test / compile / audit)ran this turn
# 2. Auto-prune trigger:provider bootstrap > 500 OR spec > transition cap(case 表)→ inject
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
# 「本回合從哪一行開始」只在這支 helper 判(2026-11-21,工作包 E7);各 Mechanism 從哪一種紀錄算起,寫在它檔頭的表。
source "$HOOK_DIR/lib/_turn_boundary.sh" 2>/dev/null \
  || governance_hook_integrity_fail 'self-audit turn-boundary helper is unavailable'

set -uo pipefail

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" 2>/dev/null \
  || governance_hook_integrity_fail "self-audit project root is unavailable:$PROJECT_DIR"
# 兩種寫入、兩道開關(_log-fire.sh 檔頭同名段;2026-11-21 WP-06):
#   遙測 STATE_DIR(要 GOVERNANCE_TELEMETRY_OPT_IN=1):Mechanism 3 的基線樣本、各 BLOCKER 的 .last-blocked-* 防重擋紀錄。
#   功能狀態 WARN_STATE_DIR(adapter 啟動、非 READ_ONLY 就有,不看遙測開關):self-audit-warnings.jsonl ——
#     inject_pending_self_audit.sh 下一回合讀它注入(M33 的 Mechanism 11 與其餘提醒都靠這一份送到下一回合)。
STATE_DIR="$(governance_runtime_state_dir 2>/dev/null || true)"
STATE_WRITES=0
[ -n "$STATE_DIR" ] && STATE_WRITES=1
WARN_STATE_DIR="$(governance_enforcement_state_dir 2>/dev/null || true)"
source "$HOOK_DIR/lib/_size_budget.sh" 2>/dev/null \
  || governance_hook_integrity_fail 'self-audit size-budget helper is unavailable'

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

# ── 含中文的比對一律在正式環境的語系下做(2026-11-21,工作包 E7 併入 E2-SIB 的 8 處)──
# scripts/run-provider-hook.mjs 組 hook 環境時把 LANG / LC_ALL 寫死成 C,而本機與 CI 跑測試的預設是 UTF-8。
# C 語系逐位元組比:中文字放進方括號會被拆成三個位元組各自比(「這」E9 80 99 含 0x80,和「」」E3 80 8D 共用一個位元組,
# 所以 [^」] 比不過「這」—— user 拍板「這樣對吧」在 C 語系比不到);中文旁邊的 .{0,N} 只剩約 N/3 個中文字。
# 兩種語系結果不同,測試綠也證明不了正式環境。修法:這些比對一律 LC_ALL=C;方括號裡不放中文(改成 (…|…));
# 「最多隔 N 個字」寫成 ${U8C}{0,N} —— U8C 是 C 語系下逐位元組拼出來的「一個 UTF-8 字元」,N 照原意是字數。
# 兩面對照在 tests/test_stop_self_audit.sh Tests 102–108(每格兩種語系各跑一次)。
U8C_CONT="[$(printf '\200')-$(printf '\277')]"
U8C="([$(printf '\001')-$(printf '\177')]|[$(printf '\302')-$(printf '\337')]${U8C_CONT}|[$(printf '\340')-$(printf '\357')]${U8C_CONT}{2}|[$(printf '\360')-$(printf '\364')]${U8C_CONT}{3})"

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

# 三個起點都由 lib/_turn_boundary.sh 的同一份判斷算(2026-11-21,工作包 E7;交接 process-audit 根因 8):
#   LAST_USER_LINE   = 最後一則 user 本人訊息(回合起點)。Stop hook 回饋、背景通知都不切回合 ——
#                      舊寫法「role=user 且不是 tool_result」把 hook 回饋當成新回合,補正回覆看不到前面的推播與擋下紀錄。
#   WAKE_START_LINE  = 最後一則 user 本人訊息或背景通知(只給 Mechanism 6 推播用,理由見 helper 檔頭的表)。
#   REPLY_START_LINE = 最後一筆任何種類的 role=user 紀錄 = 這一則回覆的起點(被擋之後只看補正那一則)。
# 整份 transcript 掃,不用 tail 視窗,避免邊界情況。
#
# **順序很重要**:2026-09-06 把 `THIS_TURN_TOOLS` 搬到所有 mechanism 之前(因為 Mechanism 6
# 也要讀它),但那時 `LAST_USER_LINE` 還在 Mechanism 1 裡面算 —— 搬過頭之後它讀到的永遠是
# 初始值 0,於是 `THIS_TURN_TOOLS` **恆為空字串**,驗證偵測看不到本 turn 跑過的 tsc,
# Test 3(claim + tsc → 不該擋)因此一直紅。修法是把行號計算一起提前(2026-09-08)。
TURN_MARKS=""
WAKE_START_LINE=0
REPLY_START_LINE=0
if [ -n "${TRANSCRIPT_PATH:-}" ] && [ -f "${TRANSCRIPT_PATH:-}" ]; then
  TURN_MARKS=$(governance_turn_marks "$TRANSCRIPT_PATH") \
    || governance_hook_integrity_fail 'self-audit turn boundary classification failed'
  LAST_USER_LINE=$(governance_turn_last "$TURN_MARKS" human)
  WAKE_START_LINE=$(governance_turn_last "$TURN_MARKS" human wake)
  REPLY_START_LINE=$(governance_turn_last "$TURN_MARKS" human wake feedback meta)
fi

# `THIS_TURN_TOOLS` = 本回合(LAST_USER_LINE 之後)的 transcript 切片:驗證、擋下、推播 / 提問這類「做過什麼」的證據。
# `THIS_REPLY_TOOLS` = 這一則回覆(REPLY_START_LINE 之後)的切片:Mechanism 10 的交辦管道(說出口的話收不回來,被擋之後只看補正)。
# 必須在所有 mechanism 之前算好:它原本只在 Mechanism 1 的 claim 分支內賦值,而 Mechanism 6
# 也讀它 —— 當 Mechanism 1 沒進那個分支時,Mechanism 6 就會讀到未定義變數。
THIS_TURN_TOOLS=""
THIS_REPLY_TOOLS=""
if [ -n "${TRANSCRIPT_PATH:-}" ] && [ -f "${TRANSCRIPT_PATH:-}" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  THIS_TURN_TOOLS=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  THIS_REPLY_TOOLS=$(tail -n +$((REPLY_START_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
fi

# ── Mechanism 1: Claim-verification gap ─────────────────────────────────────
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # LAST_USER_LINE 已在上面(所有 mechanism 之前)算好,這裡不重算 ——
  # 重算會讓「提前計算」那段變成裝飾,順序 bug 也就看不出來。
  # 回覆文字取「這一則回覆」(REPLY_START_LINE 之後);驗證證據(下面的 THIS_TURN_TOOLS)取整個回合 ——
  # 被別的 hook 擋一次之後,補正回覆仍看得到同一回合稍早跑過的驗證。
  if [ "$LAST_USER_LINE" -gt 0 ]; then
    TRANSCRIPT_LAST_ASSISTANT=$(governance_assistant_text_after "$TRANSCRIPT_PATH" "$REPLY_START_LINE")
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
    # 2026-10-07(N14(b) 補完 / G2):裸 `npx tsc`(= `tsc -b`)不再算驗證 —— 本 repo 的 composite 設定下
    # `tsc -b` 只看根目錄 src/,不檢查 DS 原始碼(AGENTS.md 失敗記憶索引;2026-09-06 實證漏 TS2741)。
    # 型別證明 = `npm run build:lib`(或 `tsc -p <project>`);其餘真驗證:測試、閘、稽核、hook 測試。
    VERIFY_RE='(npm run (build|test|typecheck|hooks:test|governance:check|check:|story-quality|a11y)|tsc -p |bash packages/design-system/ds-canonical/hooks/tests|compile-stories|design-system-audit|visual-audit)'
    if ! grep -qE "$VERIFY_RE" <<< "$THIS_TURN_TOOLS"; then
      WARNINGS="${WARNINGS}\n  • Claim-verify gap:你說 verified / done / 完成 等,但本 turn 沒有任何真驗證(型別 = npm run build:lib;測試 / 閘 / 稽核;tsc -b 不算)。下輪實跑驗證或撤回 claim。"
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
  # 距離一律 ${U8C}{0,N}(N = 字數)、LC_ALL=C(理由見檔頭 U8C 那段;2026-11-21 前是 .{0,N},正式環境只剩約三分之一)。
  COMPLETION_CLAIM_RE="(全做完|全部做完|都做完了|全部完成|所有任務${U8C}{0,6}(做完|完成)|100%${U8C}{0,4}完整|真的${U8C}{0,4}做完|全做到完)"
  # 否定/免責排除(對齊 Mechanism 1 RETRACT_RE 精神,2026-06-03 修 M7 自身 false-positive):
  # 宣告含「還沒說全做完」「沒資格說全做完」「核心做完…待跑」「等 X 才全做完/落地」等 disclaimer = 非完成宣告 → 不 fire。
  COMPLETION_NEG_RE="(還沒${U8C}{0,6}(說|宣告|算|到)|沒${U8C}{0,3}(說|算|資格)${U8C}{0,8}(全做完|完整)|未${U8C}{0,3}全做完|不(敢|算|是|該)${U8C}{0,6}全做完|核心做完|完整性(掃描)?待|待${U8C}{0,4}(跑|落地|驗)|等${U8C}{0,18}(才|再)${U8C}{0,8}(全做完|完整|落地|上架)|尚未${U8C}{0,4}完成)"
  if LC_ALL=C grep -qE "$COMPLETION_CLAIM_RE" <<< "$LAST_ASSISTANT" \
    && ! LC_ALL=C grep -qE "$COMPLETION_NEG_RE" <<< "$LAST_ASSISTANT"; then
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
  # 距離同 Mechanism 7:${U8C}{0,N}(N = 字數)+ LC_ALL=C。
  DEEPAUDIT_CLAIM_RE="(deep${U8C}?audit${U8C}{0,10}(完成|完整|done)|稽核${U8C}{0,8}(完整完美|全部完成|都${U8C}?跑完)|91${U8C}{0,6}dim${U8C}{0,8}(都|全)${U8C}{0,4}(跑|過|完|有證據)|Phase A${U8C}{0,6}完成)"
  DEEPAUDIT_NEG_RE="(未完成|還沒|尚未|缺口|gap|未跑|待跑|待驗|不算完成|覆蓋${U8C}{0,4}未|還有${U8C}{0,4}dim|待補)"
  if LC_ALL=C grep -qE "$DEEPAUDIT_CLAIM_RE" <<< "$LAST_ASSISTANT" \
    && ! LC_ALL=C grep -qE "$DEEPAUDIT_NEG_RE" <<< "$LAST_ASSISTANT"; then
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

# spec 超過 transition cap:上限與量法只讀 lib/_size_budget.sh 的表(check_file_size_budget.sh 的 case 表),
# 本檔不留 spec 清單也不留 spec 上限數字(2026-11-21 WP-06;原本這裡另有一份 10 檔清單,其中 6 檔寫 cap 800,表上是 500)。
SPEC_OVERRUNS="$(governance_size_spec_overruns)"
while IFS=$'\t' read -r f L cap cap_label; do
  [ -n "$f" ] || continue
  WARNINGS="${WARNINGS}\n  • $f ${L}/${cap} cap(${cap_label})— auto-prune trigger,下輪 /knowledge-prune"
done <<< "$SPEC_OVERRUNS"

# ── Mechanism 4: Peer-reply-verify gap(2026-05-09 user-authorized)──────────
# Why:dual-track markdown rule 沒 enforce — author 讀 peer reply 後可能直接採納,
# 沒走 Step 4.5(verify cite)/ 4.6(regression scan)/ 5(own-version 比稿)。
# 本 mechanism 機械化偵測:同 turn 讀 registry-resolved peer reply file → 必有 cite verify 或 retract。
#
# 觸發 signal:本 turn 內任何 Read tool 命中 `<peer-reply-prefix>-*.md`
# 必須 signal(任一):
#   (a) Bash with `grep` against any file path(cite verify)
#   (b) Bash with `npm run build` / `tsc -p` /
#       `bash packages/design-system/ds-canonical/hooks/tests`(regression-class verify;裸 tsc -b 不算,見 Mechanism 1)
#   (c) Read against peer-cited code path(`packages/design-system/src/...`)
#   (d) Explicit retract phrase(撤回 / 未採納 / 不採用 / skip peer)
# 任一 missing → CRITICAL 通知;同 Mechanism 1 升 BLOCKER 阻 turn 結束。
if [ "$PEER_CONTEXT_PRESENT" = "1" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "$LAST_USER_LINE" -gt 0 ]; then
  THIS_TURN_FULL=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  PEER_REPLY_READ=$(grep -cE "${PEER_REPLY_PREFIX}-[a-zA-Z0-9_-]+\\.md" <<< "$THIS_TURN_FULL" 2>/dev/null)
  PEER_REPLY_READ=${PEER_REPLY_READ:-0}
  if [ "$PEER_REPLY_READ" -gt 0 ]; then
    # Signal (a)/(b): grep / tsc / hook tests / src/ Read
    VERIFY_SIG_RE='(Bash.*grep|Bash.*npm run build|Bash.*tsc -p |Bash.*bash packages/design-system/ds-canonical/hooks/tests|Read.*packages/design-system/src)'
    # Signal (d): retract phrase in last assistant message
    # 2026-05-17 expanded: cover all FP patterns(historical cite / pure git / pure verify / 0 peer)
    RETRACT_PEER_RE="(撤回採納|撤回 claim|未採納 ${PEER_PROVIDER}|不採用 ${PEER_PROVIDER}|skip peer|${PEER_PROVIDER}.*未 verify|0 條新 peer|0 peer|沒啟 peer|沒要啟 peer|純 git|純 verify|純文字|本 turn 純|本 turn 無 peer|引用 prior|cite previous|描述 prior|歷史 peer|historical reference)"
    HAS_VERIFY=$(grep -cE "$VERIFY_SIG_RE" <<< "$THIS_TURN_FULL" 2>/dev/null)
    HAS_VERIFY=${HAS_VERIFY:-0}
    HAS_RETRACT=$(grep -cE "$RETRACT_PEER_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
    HAS_RETRACT=${HAS_RETRACT:-0}
    if [ "$HAS_VERIFY" -eq 0 ] && [ "$HAS_RETRACT" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Peer-reply verify gap:本 turn 讀 ${PEER_DISPLAY_NAME} reply 但無 grep cite verify / build:lib / hook tests / Read src/。下輪實 Step 4.5/4.6 verify 或撤回採納。"
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
  # 「user 看過」當依據(2026-11-18,A80 ⑤ / 工作包 E2):A80 那次把 --brand 寫成「依 user 看過的句子退場」——
  # 看過不等於同意,但這樣寫讀起來就像 user 核准過,同屬 M36(a) 升格,與上面的歸因語同一級(只提醒、不擋 turn)。
  # 判式:以全形「。，、；：！？」與半形「, ; : ?」切成子句,子句裡「看過」前面最近的人稱是「你 / user」(兩者之間不夾「我」、
  # 相距 ≤ 36 位元組 ≈ 12 個中文字),且不是否定(沒 / 未 / 不曾)、不是問句(看過後 3 字內有「嗎」)。
  # 為什麼不寫成一行 grep:正式環境的 hook 在 LC_ALL=C 下跑(scripts/run-provider-hook.mjs 組 hook 環境時把
  # LANG / LC_ALL 寫死成 C),中文字放進 [^。] 會被拆成三個位元組各自排除 ——「這」(E9 80 99)含 0x80,
  # 和「。」(E3 80 82)共用一個位元組,於是「你這頁看過」比不到;方括號裡的 \n 是字母 n,「user 在 notion
  # 看過」也比不到。所以這裡一律 LC_ALL=C + index / substr 字面比對;Tests 36-45 在 C 與 UTF-8 兩種語系各跑一次。
  USER_SEEN_AWK='
    function lastpos(s, t,   p, q) { p = 0; while ((q = index(substr(s, p + 1), t)) > 0) p += q; return p }
    BEGIN { RS = "\001" }
    { s = s $0 "\n" }
    END {
      gsub(/。|，|、|；|：|！|？|,|;|:|\?/, "\n", s)
      n = split(s, c, "\n")
      for (i = 1; i <= n; i++) {
        t = c[i]
        while ((k = index(t, "看過")) > 0) {
          pre = substr(t, 1, k - 1); u = 0; w = 0
          p = lastpos(pre, "你");            if (p > u) { u = p; w = 3 }
          p = lastpos(tolower(pre), "user"); if (p > u) { u = p; w = 4 }
          if (u > 0) {
            gap = substr(pre, u + w); post = substr(t, k + 6, 9)
            if (length(gap) <= 36 && !index(gap, "我") && !index(gap, "沒") && !index(gap, "未") &&
              !index(gap, "不曾") && !index(post, "嗎")) exit 0
          }
          t = substr(t, k + 6)
        }
      }
      exit 1
    }'
  ATTRIB_HIT=0
  grep -qE "$ATTRIB_RE" <<< "$LAST_ASSISTANT" && ATTRIB_HIT=1
  if [ "$ATTRIB_HIT" = "0" ] && LC_ALL=C awk "$USER_SEEN_AWK" <<< "$LAST_ASSISTANT"; then
    ATTRIB_HIT=1
  fi
  # 有引號 = 有引原話;明說 AI 推導/建議 = 已誠實降級;兩者皆為合格 escape
  PROV_ESCAPE_RE='(「|」|AI 推導|AI 建議|未經拍板|前提錯誤|我捏造|本文自創)'
  # M36(a) 引文完整性(2026-08-09):引 user 原話當裁決依據,但引文以徵詢語氣結尾
  # (吧/嗎/?)= 那是提議不是拍板。錨例:把「…才對吧?」寫成「…才對」竄改語氣。
  # 2026-11-21(E2-SIB):原本是一行 grep「「[^」]*(吧|嗎)[?？]?」」,正式環境(C 語系)下 [^」] 會把含 0x80 / 0x8D
  # 位元組的中文字擋掉 —— user 拍板「這樣對吧」比不到。改成 LC_ALL=C + 字面 index / substr 逐一取出「」裡的字,
  # 判它是不是以 吧 / 嗎 / ? / ? 結尾(跨行的引號不算,同原本一行一行比)。
  QUOTE_ASK_AWK='
    BEGIN { RS = "\001" }
    { s = s $0 }
    END {
      p = 1
      while ((a = index(substr(s, p), "「")) > 0) {
        a = p + a - 1
        b = index(substr(s, a + 3), "」")
        if (b == 0) exit 1
        q = substr(s, a + 3, b - 1)
        if (!index(q, "\n") && q ~ /(吧|嗎|\?|？)$/) exit 0
        p = a + 3
      }
      exit 1
    }'
  if [ "$ATTRIB_HIT" = "1" ] \
    && LC_ALL=C awk "$QUOTE_ASK_AWK" <<< "$LAST_ASSISTANT"; then
    WARNINGS="${WARNINGS}\n  • 引文語氣(M36a):你引的 user 原話以「吧/嗎/?」結尾——那是徵詢不是拍板。改標「user 提議、查證後採用」或「未決」;引文一律逐字,禁刪語氣詞。"
  fi
  if [ "$ATTRIB_HIT" = "1" ] \
    && ! grep -qE "$PROV_ESCAPE_RE" <<< "$LAST_ASSISTANT"; then
    WARNINGS="${WARNINGS}\n  • Provenance 升格(M36a):你寫了「user 拍板/決定」或「user 看過」當依據,但整段沒有引 user 原話。看過不等於同意。立刻補引原話,或降級成「AI 推導 / AI 建議、user 採納」。問句不是同意。"
  fi
fi

# ── Mechanism 8b: 引原話當限制理由卻沒寫原題(M36(a) + feedback_propose_discipline.md Sub-rule 8,2026-11-15)──
# 錨例:「我查到你 10-21 的原話：「…不要給我改壞喔」…這次對那頁的改動要撤回」—— 那句原話回答的是 B1 留言框
# 送出鈕那題,BulkActionBar 只是對照圖;拿摘要當範圍、沒核原題就撤回。判式刻意窄,三條件全中才擋:
#   (1) 引了 user 的**舊**原話:「 前 30 bytes 內同時有日期(MM-DD)與 原話 / 你 / user —— 規則只管「把舊話拿來當這次依據」,
#       所以不帶日期的(例「規格原話「…」」)不算;引號內容若出自本輪 user 訊息(在回答 user 剛說的話)也不算(2026-11-15 審查:
#       第一版只認「原話 / user / 你說」前綴,這個 session 的 8 種正常回覆會被誤擋);
#   (2) 同句(引號外)或下一句出現 不動 / 不改 / 撤回 / 擱置 / 不准 / 不得 / 一律不 / 改回原樣;
#   (3) 整段沒有「原題:」。只引不限制、限制但沒引原話,一律放行。
# 用 LC_ALL=C + 字面子字串(index/substr):hook 在 C locale 跑,多位元組字元放進 [^」] 會被切成單一位元組而失準。
QUOTE_LIMIT_RE='不動|不改|撤回|擱置|不准|不得|一律不|改回原樣'
QUOTE_CUR_USER=""
if [ -n "${TRANSCRIPT_PATH:-}" ] && [ -f "${TRANSCRIPT_PATH:-}" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  QUOTE_CUR_USER=$(sed -n "${LAST_USER_LINE}p" "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r '.message.content as $c | if ($c|type)=="string" then $c else ($c[]?.text // empty) end' 2>/dev/null)
fi
if [ -n "$LAST_ASSISTANT" ] \
  && LC_ALL=C grep -qF '「' <<< "$LAST_ASSISTANT" \
  && LC_ALL=C grep -qE "$QUOTE_LIMIT_RE" <<< "$LAST_ASSISTANT" \
  && ! LC_ALL=C grep -qE '原題(:|：)' <<< "$LAST_ASSISTANT" \
  && CUR_USER="$QUOTE_CUR_USER" LC_ALL=C awk -v R="$QUOTE_LIMIT_RE" '
    function strip(t,   a, b, out) {
      out = ""
      while ((a = index(t, "「")) > 0) {
        b = index(substr(t, a + 3), "」"); out = out substr(t, 1, a - 1)
        if (b == 0) return out
        t = substr(t, a + b + 5)
      }
      return out t
    }
    function seg(t) { gsub(/。|！|？|!|\?|\n/, "\n", t); return t }
    BEGIN { RS = "\001" }
    { s = s $0 }
    END {
      pos = 1
      while ((rel = index(substr(s, pos), "「")) > 0) {
        qs = pos + rel - 1; qe = index(substr(s, qs + 3), "」")
        if (qe == 0) exit 1
        qe = qs + qe + 2; st = (qs > 30) ? qs - 30 : 1
        pre = substr(s, st, qs - st); q = substr(s, qs + 3, qe - qs - 3); U = ENVIRON["CUR_USER"]
        if (pre ~ /[0-9][0-9]?-[0-9][0-9]?/ && pre ~ /原話|你|user/ && (U == "" || q == "" || index(U, q) == 0)) {
          hs = (qs > 600) ? qs - 600 : 1
          nh = split(seg(strip(substr(s, hs, qs - hs))), h, "\n")
          na = split(seg(strip(substr(s, qe + 3, 600))), a, "\n")
          if ((h[nh] a[1]) ~ R || (na > 1 && a[2] ~ R)) exit 0
        }
        pos = qe + 3
      }
      exit 1
    }' <<< "$LAST_ASSISTANT"; then
  CRITICAL_QUOTE_SCOPE=1
  WARNINGS="${WARNINGS}\n  • 引原話當限制理由(M36a / Sub-rule 8):你拿 user 原話去擋 / 撤回 / 擱置,卻沒寫它回答的那一題。"
fi

# ── Mechanism 9: 問句必正面回答(2026-08-09 user directive)────────────────
# SSOT = governance/memory/feedback_propose_discipline.md Sub-rule 3。
# user 以「好不好 / 行不行 / 可以嗎 / 對吧 / 不是更 X 嗎」結尾 = 要一個裁決,
# 不是要一段分析。reply 開頭沒表態 → 結論懸空,下一輪重辯同一題。
# Detector 刻意保守:只看 user 訊息「最後一行」是否為徵詢句尾,且 reply 前 400 字
# 完全沒有任何表態詞才 warn。
if [ -n "$LAST_ASSISTANT" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] \
  && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  USER_TEXT=$(sed -n "${LAST_USER_LINE}p" "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r '.message.content as $c | if ($c|type)=="string" then $c else ($c[]?.text // empty) end' 2>/dev/null)
  # 2026-11-21(E2-SIB):三個比對都改成 LC_ALL=C、方括號裡不放中文。原本 [?？] 在 C 語系下是「? 或 EF / BC / 9F 其中一個位元組」,
  # 全形問號結尾的「這樣對吧？」比不到;[,,。] 會被「、」「」」的首位元組 E3 誤中;[[:space:]] 在 UTF-8 語系才含全形空白。
  # 表態詞的逗號照原意補上全形「，」(原本寫成兩個半形逗號,「是，」「對，」從來沒被認過)。
  USER_TAIL=$(printf '%s' "$USER_TEXT" | tr -d '\r' | LC_ALL=C grep -vE '^([[:space:]]|　)*$' | tail -1)
  ASK_TAIL_RE='(好不好|行不行|可以嗎|對吧|是不是|要不要|不是更.*嗎|嗎(\?|？)?|吧(\?|？)?)(\?|？)?$'
  # 表態詞:任何明確裁決開頭都算合格 escape
  STANCE_RE='(^|[[:space:]]|　)(是(，|,|。)|不是|對(，|,|。)|不對|可以|不可以|不行|同意|不同意|你對|我錯|正確|錯了|沒錯|會|不會|要|不要|已決|未決)'
  if [ -n "$USER_TAIL" ] && LC_ALL=C grep -qE "$ASK_TAIL_RE" <<< "$USER_TAIL"; then
    REPLY_HEAD=$(printf '%s' "$LAST_ASSISTANT" | head -c 400)
    if ! LC_ALL=C grep -qE "$STANCE_RE" <<< "$REPLY_HEAD"; then
      WARNINGS="${WARNINGS}\n  • 問句未正面回答:user 這則以徵詢語氣結尾(要裁決,不是要分析),但你開頭 400 字沒有任何表態。先給「是 / 不是 / 有條件的是(條件是什麼)」再展開;真的判不了就明說還缺什麼。"
    fi
  fi
fi

# ── Mechanism 10: 自鎖後把動作推給 user(M36(b),2026-09-19)────────────────
# SSOT = meta-patterns M36(b)/(b') + governance/memory/reference_auto_mode_sandbox_boundaries.md(第三節分類器、第六節對照表)。
#
# 為什麼要機械化:這條規則 2026-08-08 就立了、2026-08-11 連環五鎖逐層拆完、2026-08-28 還特別
# 寫下「**禁**指路 `!`(與 Bash 同沙箱必再擋)或推 user 終端機」(2026-11-16 更正:官方 sandboxing 文件說
# v2.1.260 起一般 session 的 `!` 在沙箱外,背景 session 才仍在沙箱內;見 M36(b')(4))—— 然後 2026-09-19 又犯:
# `git branch -D` 被 classifier 擋下,沒走等價的 `git update-ref -d`(plumbing,只寫 .git 可寫區),
# 直接寫「你要清的話在終端機打 `! git branch -D ...` 就行」,而且是 user 反問才發現。
# M36(a) 有 Mechanism 8 把關,M36(b) 一直是**零機械強制** —— 所以它才會重犯。
#
# 判準:本 turn 有工具被擋(denied / EPERM / not permitted),且 reply 把一個**具體指令**交給
# user 去跑 → CRITICAL。真正的 human-only 邊界(login / MFA / OAuth / 帳單 / 缺 credential
# reference)明文豁免,那些本來就該交給 user。
#
# 2026-11-18 補(工作包 E2;user 11-18 00:06「要打啥 確定沒有作繭自縛？確定這件事就是一定得為難我？」那次漏網)。
# 第一版(001c964d)只換了比對字串,註解寫「這兩種說法舊清單一個都比不到」,讓人以為換了字串就修好 —— 照 session 96d711a5
# 的原始紀錄結構重放,第一版一樣不會擋(反駁 #1)。那幾次交辦的真實形狀是:
#   (a) 15:54:00Z 與 16:05:29Z 兩個 turn:被擋紀錄在本 turn,交辦字只寫在 thinking 區塊與 PushNotification 的 message
#       (16:05 那則:「刪測試殘留又被擋:請在對話框貼上我給的那行 ! cd … && rm -rf … && git checkout … 指令」);
#       本 turn 唯一的可見文字是英文(「Once you've run that command, I'll check `git status`, …」)。舊版只看可見文字、只認中文。
#   (b) 15:55:07Z「在對話框貼上下面這一整行…」:是 user 問「要打什麼？」之後的新一輪,本輪沒有任何工具被擋 ——
#       被擋的是上一輪 15:53:48Z 那條 rm -rf(deny 規則)。舊版只看本 turn 的被擋紀錄。
#   (c) 15:55:13Z「請把上面那行指令貼到對話框…」:前面夾了一則 Stop hook 回饋(isMeta = true 的 user 紀錄),
#       舊版把回饋當成新的 user 回合,「本 turn」只剩回饋之後那幾行。
# 現行判式:
#   ① 交辦文字 = 可見回覆 + 本 turn PushNotification 的 message + AskUserQuestion 的題目與選項(三者都會送到 user 面前)。
#      thinking 不掃:那是推理,掃它會把「要不要叫 user 跑?不要」這種自我檢查也算成交辦。
#      依全形「。！？，；」切成子句;含 不用 / 不必 / 不需 / 無需 / 無須 / 毋須 的子句不算(「你不用在對話框貼任何東西」),
#      以子句為單位,所以「不用擔心，在對話框貼上下面這行」的第二個子句照算。
#      2026-11-21(工作包 E7,E2 審查 PROBE-4 建議)補「別」:只認「別(再)在 / 貼 / 打 / 跑 / 執行 / 輸入」這種緊接動作的否定 ——
#      裸的「別」會吃掉「特別 / 分別 / 別的」整個子句(「特別注意：在對話框貼上下面這行」仍要擋,Test 101;
#      「特別在對話框…」這種字面仍會被當成否定,已知不涵蓋)。
#      交辦管道只看「這一則回覆」(REPLY_START_LINE 之後):說出口的話收不回來,被擋之後只看補正那一則,否則永遠擋。
#   ② 強交辦(以「! 」開頭的一行、行內 `! 、對話框 + 貼上 / 輸入 / 執行 / 打 + 指令代稱、貼到 / 貼進對話框):被擋紀錄從
#      「上一則真 user 提問」起算,即本輪加上一輪 —— 涵蓋 (b)(c)。不拿掉「有被擋」這個前提:M36(b) 管的是被擋之後把動作
#      丟回 user,沒被擋時教 user 用 `!` 不在這條規則內(Test 66)。
#   ③ 一般交辦(在終端機打、你(要)(自己)跑 / 打 … + 指令、英文 run that command / waiting for you to …):被擋紀錄從「最後一則真 user
#      提問」起算。真 user 提問 = lib/_turn_boundary.sh 的 human(Stop hook 回饋 / 背景工作通知 / system-reminder /
#      `!` 指令的輸入輸出 / 對話接續摘要都不是;有 origin 欄位時只認 origin.kind = human)。2026-11-21 前這裡另有一份
#      self_lock_genuine_prompt_lines,判準搬進 helper 後兩邊只剩一份(工作包 E7)。
#   「對話框」在本 repo 也是 Dialog 元件的中文名,所以只認「對話框 + 動詞 + 指令代稱」與「貼到 / 貼進對話框」,
#   不認第一版的「對話框 … 貼」(「對話框的 footer 按鈕貼齊右側」不是交辦,Test 74)。
#   比對一律 LC_ALL=C(正式環境的語系;scripts/run-provider-hook.mjs 組 hook 環境時寫死):中文只做字面比對,不放進方括號。
#   被擋比對用 awk 逐行讀整段,不用 printf | grep -q:grep -q 比到就提早結束,寫端吃 SIGPIPE,pipefail 下回 141 = 假陰性(Test 60)。
#   已知不涵蓋:被擋發生在兩輪以前,之後 user 又問了兩次才交辦(Test 67 把這個範圍釘住)。
HANDOFF_SOURCE=""
if [ "${LAST_USER_LINE:-0}" -gt 0 ] || [ -n "$LAST_ASSISTANT" ]; then
  BLOCKED_RE='(has been denied|Permission to use|Operation not permitted|EPERM|not accessible by personal access token|Blocked by classifier|auto mode classifier)'
  # 指令代稱 = 交辦動詞後面接的那一段(下面這行 / 我給的那行 / `… / ! …)。只認這些,動詞後面接別的字(打開 / 輸入框)不算。
  HANDOFF_CMD_REF='(一下)?([[:space:]]|:|：)*(我給的|我貼的|我寫的)?(下面|以下|底下|上面|這行|這一行|這一整行|這段指令|這條指令|這個指令|那行|那一行|那條指令|那個指令|指令|`|!)'
  STRONG_HANDOFF_RE="(^![[:space:]]|\`![[:space:]]|對話框(裡|中|內)?(貼上|貼|輸入|執行|打)${HANDOFF_CMD_REF}|貼(到|進)(這個|你的)?對話框)"
  # 「你 + 動詞」只在後面接指令時才算(反駁 #2):指令代稱(同上)或指令開頭(git / npm / rm … / $ )。
  # 001c964d 把「你要?」改成「你(要)?」之後,正式環境(LC_ALL=C)下「你打開 / 你輸入的 / 你執行的」全中;
  # 被擋比對又是對整段紀錄找字串(測試輸出常有 EPERM),於是「你打開預覽連結就能看到…」這種回報會被擋(Test 75)。
  HANDOFF_CMD_HEAD='(\$[[:space:]]|(git|npm|npx|node|pnpm|yarn|rm|cd|gh|bash|sh|zsh|curl|chmod|mv|cp|sudo|make|python3?)[[:space:]])'
  WEAK_HANDOFF_RE="(在終端機(打|輸入|跑|執行)|你(要)?(自己)?(跑|執行|打|輸入|貼)(${HANDOFF_CMD_REF}|(一下)?([[:space:]]|:|：)*${HANDOFF_CMD_HEAD})|請你(跑|執行|手動)|麻煩你(跑|執行))"
  EN_HANDOFF_RE="(you('ve|’ve| have| can| need to| should| will)?|please) (just )?(run|type|paste|execute|enter) (that|this|the following|these|those|the) (command|commands|line|lines|one-liner)|waiting for you to (run|paste|type|execute|delete|remove)|(paste|type|enter) [^.]{0,40}(into|in) (the|this|your) (chat|prompt|input box|message box)|(run|execute|type|paste) [^.]{0,40}in your (own )?terminal|(run|execute) (it|this|that) yourself"
  HUMAN_ONLY_RE='(auth login|gh auth|MFA|OAuth|二階段|登入|帳單|billing|付費|credential reference|vault|Secret Manager)'
  SELF_LOCK_DELIVERED=""
  if [ -n "${THIS_REPLY_TOOLS:-}" ]; then
    SELF_LOCK_DELIVERED=$(jq -R -r '
      fromjson? | select(type == "object" and .type != "api-request-blob")
      | (.message.content? // empty) | arrays | .[]
      | select(type == "object" and .type == "tool_use")
      | if .name == "PushNotification" then (.input.message? | strings)
        elif .name == "AskUserQuestion" then
          (.input.questions[]? | select(type == "object")
            | (.question? | strings),
              (.options[]? | select(type == "object") | (.label? | strings), (.description? | strings)))
        else empty end
    ' <<< "$THIS_REPLY_TOOLS") \
      || governance_hook_integrity_fail 'self-audit handoff channel extraction failed'
  fi
  HANDOFF_SOURCE="$LAST_ASSISTANT"
  [ -n "$SELF_LOCK_DELIVERED" ] && HANDOFF_SOURCE="${HANDOFF_SOURCE}${HANDOFF_SOURCE:+
}${SELF_LOCK_DELIVERED}"
  HANDOFF_KIND=""
  if [ -n "$HANDOFF_SOURCE" ]; then
    # grep -v 全部濾掉時回 1,代表沒有可算的子句,不是錯誤
    HANDOFF_TEXT=$(LC_ALL=C awk '{ gsub(/。|！|？|，|；/, "\n"); print }' <<< "$HANDOFF_SOURCE" \
      | LC_ALL=C grep -vE '不用|不必|不需|無需|無須|毋須|別(再)?(在|貼|打|跑|執行|輸入)')
    if LC_ALL=C grep -qE "$STRONG_HANDOFF_RE" <<< "$HANDOFF_TEXT"; then
      HANDOFF_KIND=strong
    elif LC_ALL=C grep -qE "$WEAK_HANDOFF_RE" <<< "$HANDOFF_TEXT" \
      || LC_ALL=C grep -qiE "$EN_HANDOFF_RE" <<< "$HANDOFF_TEXT"; then
      HANDOFF_KIND=weak
    fi
  fi
  if [ -n "$HANDOFF_KIND" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ] \
    && ! grep -qE "$HUMAN_ONLY_RE" <<< "$HANDOFF_SOURCE"; then
    # 最後兩則 user 本人提問的行號(舊在前);判準只住 lib/_turn_boundary.sh
    GENUINE_LINES=$(governance_turn_lines "$TURN_MARKS" human | tail -n 2)
    GENUINE_COUNT=$(grep -c . <<< "$GENUINE_LINES")
    GEN_PREV="$LAST_USER_LINE"; GEN_CUR="$LAST_USER_LINE"
    if [ "${GENUINE_COUNT:-0}" -ge 2 ]; then
      GEN_PREV=$(head -n 1 <<< "$GENUINE_LINES"); GEN_CUR=$(tail -n 1 <<< "$GENUINE_LINES")
    elif [ "${GENUINE_COUNT:-0}" -eq 1 ]; then
      GEN_PREV=0; GEN_CUR="$GENUINE_LINES"
    fi
    case "$GEN_PREV$GEN_CUR" in (*[!0-9]*|'') GEN_PREV="$LAST_USER_LINE"; GEN_CUR="$LAST_USER_LINE" ;; esac
    SELF_LOCK_FROM="$GEN_CUR"
    [ "$HANDOFF_KIND" = strong ] && SELF_LOCK_FROM="$GEN_PREV"
    if LC_ALL=C awk -v from="$SELF_LOCK_FROM" -v re="$BLOCKED_RE" \
      'NR > from + 0 && $0 ~ re { hit = 1 } END { exit hit ? 0 : 1 }' "$TRANSCRIPT_PATH"; then
      CRITICAL_SELF_LOCK_HANDOFF=1
      WARNINGS="${WARNINGS}\n  • M36(b) 自鎖後把動作推給 user:本輪(強交辦含上一輪)有工具被擋,而你在回覆 / 推播 / 提問選項裡請 user 自己跑指令。"
    fi
  fi
fi

# ── Mechanism 10b: 分類器擋下卻沒在回覆講(2026-11-18,工作包 E2 / 稽核 #8)────────────────
# SSOT = governance/memory/reference_auto_mode_sandbox_boundaries.md 第四節第 4 條「分類器擋下 = 停在該處並回報」。
# Mechanism 10 管「被擋之後把指令丟給 user」;這裡管另一半 —— 被擋了卻在回覆裡完全不提,user 不知道少做了什麼。
# 判準刻意窄:
#   (1) 只認**分類器**擋下:tool_result 內容含 auto mode classifier / Blocked by classifier,或該筆記錄標
#       toolDenialKind = automode-blocked(Claude Code 寫在記錄上的欄位,措辭改了也還在)。專案 settings 的
#       deny 規則擋下(Permission to use … has been denied)不算 —— 那類擋下之後改寫是日常,逐次回報是 user 不想看的雜訊。
#   (2) 只認 is_error = true 的 tool_result 本身。讀到的檔案、子代理 / 工作流輸出裡「引述」那句話不算(本工作包的
#       規劃證據就引了那句);api-request-blob 是 API 請求的重放副本,會夾帶更早 turn 的擋下紀錄,也不算。
#   (3) 本回合全部回覆文字裡有「被擋 / 擋下 / 擋掉 / 擋住 / 分類器 / classifier / 被拒 / 拒絕」任一 = 已回報。
#       後四個是 2026-11-21 補的(工作包 E7;E2 審查 PROBE-5:「這個 rm 被 auto mode classifier 擋掉」照實講了仍被擋)。
#   (4) 範圍 = 本回合(LAST_USER_LINE 之後,lib/_turn_boundary.sh):擋下紀錄與回報文字都從 user 本人上一則訊息算起。
#       2026-11-21 前用「最後一筆 role=user」切,背景工作通知或 Stop hook 回饋一插進來,先前的擋下就落在範圍外、永遠不查
#       (PROBE-6);回報文字也看整個回合,前一則回覆已經講過、被別的 hook 擋下後的補正不必再講一次。
if [ -n "$LAST_ASSISTANT" ] && [ -n "${THIS_TURN_TOOLS:-}" ]; then
  CLASSIFIER_DENIALS=$(jq -R -r '
    fromjson? | select(type == "object" and .type != "api-request-blob")
    | . as $record
    | (.message.content? // empty) | arrays | .[]
    | select(type == "object" and .type == "tool_result" and .is_error == true)
    | (.content | if type == "string" then .
        elif type == "array" then ([.[]? | .text? // empty | strings] | join("\n"))
        else "" end) as $text
    | select($record.toolDenialKind? == "automode-blocked"
        or ($text | test("auto mode classifier|Blocked by classifier")))
    | "classifier-denial"
  ' <<< "$THIS_TURN_TOOLS") \
    || governance_hook_integrity_fail 'self-audit classifier denial extraction failed'
  CLASSIFIER_REPORT_TEXT="$LAST_ASSISTANT"
  if [ -n "$CLASSIFIER_DENIALS" ]; then
    CLASSIFIER_REPORT_TEXT="$(governance_assistant_text_after "$TRANSCRIPT_PATH" "$LAST_USER_LINE")
${LAST_ASSISTANT}"
  fi
  if [ -n "$CLASSIFIER_DENIALS" ] \
    && ! LC_ALL=C grep -qiE '被擋|擋下|擋掉|擋住|分類器|classifier|被拒|拒絕' <<< "$CLASSIFIER_REPORT_TEXT"; then
    CRITICAL_CLASSIFIER_SILENT=1
    WARNINGS="${WARNINGS}\n  • 分類器擋下卻沒講:本 turn 有動作被 auto mode 分類器擋下,回覆裡沒有交代被擋的是什麼、為什麼、影響到哪裡。"
  fi
fi

# ── Mechanism 12: 發版前機器可讀項目自我稽核(2026-11-21,工作包 E7;M20 的機械化)────────────────
# user 2026-11-17 20:01(台灣時間)原話:「你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪」
# 起因:同日 AI 回報只剩 A101、A41 兩件就請 user 說「發版」,user 追問後自查才查出 24 項。發版同意綁產品指紋,
# 但「開口要同意之前先把機器看得到的那一半查乾淨」沒有機械面。SSOT = governance/memory/feedback_solo_dev_workflow.md 發版同意段。
# 名稱照實:紀錄只涵蓋機器讀得到的項目(工作樹、預覽綁定、PR 必過檢查),零未解 ≠ 沒有遺漏(交接 process-audit 根因 9)。
# 判定全部在 scripts/release-self-audit.mjs(這裡只搬資料):
#   ① 回覆 / 推播 / AskUserQuestion 題目裡,有沒有「請 user 現在說一句會被判成同意的話」—— 什麼字算同意只用
#      release-consent-language.mjs 那一份判準;引述過去、解釋規則、回答「什麼時候會問你」、受理 user 本輪剛說的「發版」都不算;
#      選項 label 直接交給同一份判準。
#   ② 在要 → 紀錄(<git-dir>/governance-runtime/release-self-audit/current.json)必須 (a) 綁現在這一份:產品指紋 = 現在 HEAD 的
#      (preview-binding;release-orchestrator.mjs productContentDigest,與發版同意同一個單位),record.headSha = 現在的 HEAD
#      (git-worktree / pr-checks 量的是那一刻的 HEAD;只改治理檔把 CI 弄紅也要失效)(b) 未解 0(由逐項清單重算)
#      (c) 由該腳本照機器讀回產生(腳本版本 + 整份 sha256 + 三個必備來源各帶證據);路徑有符號連結 / 硬連結 → 拒讀。
# 範圍 = 本回合(LAST_USER_LINE 之後;推播、提問、回覆文字、user 原話都用同一個起點 —— 舊草稿推播從「最後一筆 role=user」抓、
#   user 原話從真 user 提問抓,同一個機制兩種「本回合」,中間夾一則 hook 回饋就看不到前面那則請說發版的推播)。
#   例外:本機制已經擋過一次(本回合有一則含 RELEASE-SELF-AUDIT BLOCKER 的 hook 回饋),那一則之前的不再重擋 ——
#   推播送出去就收不回,AI 已經被告知,之後只看補正;不然紀錄補不齊時 turn 永遠結束不了。
#   不做「同 hash 第二次降級」:那要開遙測才有狀態檔,這裡改用 transcript 本身判斷「擋過沒」。
# 只在範圍內的文字含「 / 『 / “ 三種開引號之一、或有推播 / 提問時才叫 node(其餘 turn 零成本)。
# 腳本不在(既有 fixture、consumer)= 不檢查,同 7c。
RELEASE_SELF_AUDIT_SCRIPT="scripts/release-self-audit.mjs"
RSA_REASON=""
if [ -f "$RELEASE_SELF_AUDIT_SCRIPT" ] && [ ! -L "$RELEASE_SELF_AUDIT_SCRIPT" ]; then
  RSA_FROM="${LAST_USER_LINE:-0}"
  RSA_SLICE=""
  RSA_REPLY="$LAST_ASSISTANT"
  RSA_USER=""
  if [ -n "${TRANSCRIPT_PATH:-}" ] && [ -f "${TRANSCRIPT_PATH:-}" ] && [ "$RSA_FROM" -gt 0 ]; then
    RSA_FEEDBACK_LINES=$(governance_turn_lines "$TURN_MARKS" feedback meta | awk -v from="$RSA_FROM" '$1 > from + 0' | tr '\n' ' ')
    if [ -n "$RSA_FEEDBACK_LINES" ]; then
      RSA_CUT=$(tail -n +$((RSA_FROM + 1)) "$TRANSCRIPT_PATH" 2>/dev/null | LC_ALL=C awk -v base="$RSA_FROM" -v want=" $RSA_FEEDBACK_LINES" \
        'index(want, " " (NR + base) " ") && index($0, "RELEASE-SELF-AUDIT BLOCKER") { n = NR + base } END { print n + 0 }')
      case "$RSA_CUT" in (''|*[!0-9]*) RSA_CUT=0 ;; esac
      [ "$RSA_CUT" -gt "$RSA_FROM" ] && RSA_FROM="$RSA_CUT"
    fi
    RSA_SLICE=$(tail -n +$((RSA_FROM + 1)) "$TRANSCRIPT_PATH" 2>/dev/null)
    RSA_REPLY="$(governance_assistant_text_after "$TRANSCRIPT_PATH" "$RSA_FROM")
${LAST_ASSISTANT}"
    RSA_USER=$(sed -n "${LAST_USER_LINE}p" "$TRANSCRIPT_PATH" 2>/dev/null | jq -r '
      .message.content as $c
      | if ($c | type) == "string" then $c
        else ([$c[]? | select(type == "object" and .type == "text") | (.text? | strings)] | join("\n")) end' 2>/dev/null)
  fi
  RSA_SCAN=0
  LC_ALL=C grep -qE '「|『|“' <<< "$RSA_REPLY" && RSA_SCAN=1
  if [ -n "$RSA_SLICE" ] && LC_ALL=C grep -qE '"(PushNotification|AskUserQuestion)"' <<< "$RSA_SLICE"; then
    RSA_SCAN=1
  fi
  if [ "$RSA_SCAN" = "1" ]; then
    RSA_CHANNELS='{"delivered":[],"options":[]}'
    if [ -n "$RSA_SLICE" ]; then
      RSA_CHANNELS=$(jq -R -s -c '
        [split("\n")[] | fromjson? | select(type == "object" and (.type == null or .type == "assistant"))
          | (.message.content? // empty) | arrays | .[]
          | select(type == "object" and .type == "tool_use")] as $uses
        | {
            delivered: [$uses[]
              | if .name == "PushNotification" then (.input.message? | strings)
                elif .name == "AskUserQuestion" then (.input.questions[]? | select(type == "object") | (.question? | strings))
                else empty end],
            options: [$uses[] | select(.name == "AskUserQuestion")
              | .input.questions[]? | select(type == "object") | .options[]? | select(type == "object") | (.label? | strings)]
          }' <<< "$RSA_SLICE") \
        || governance_hook_integrity_fail 'release self-audit channel extraction failed'
    fi
    RSA_INPUT=$(jq -nc --arg reply "$RSA_REPLY" --arg user "$RSA_USER" --argjson channels "$RSA_CHANNELS" \
      '{reply: $reply, currentUser: $user, delivered: $channels.delivered, options: $channels.options}') \
      || governance_hook_integrity_fail 'release self-audit input could not be encoded'
    RSA_OUT=$(node "$RELEASE_SELF_AUDIT_SCRIPT" stop-check <<< "$RSA_INPUT" 2>/dev/null)
    RSA_RC=$?
    case "$RSA_RC" in
      0) ;;
      2)
        RSA_REASON=$(jq -r '.reason // empty' <<< "$RSA_OUT" 2>/dev/null)
        [ -n "$RSA_REASON" ] || governance_hook_integrity_fail 'release self-audit block carried no reason'
        CRITICAL_RELEASE_SELF_AUDIT=1
        WARNINGS="${WARNINGS}\n  • 發版前機器可讀項目自我稽核:這一回合在向 user 要發版同意,但沒有綁現在這一份(產品指紋與 HEAD)、零未解、由腳本產生的紀錄。"
        ;;
      *) governance_hook_integrity_fail "release self-audit stop-check failed with rc=${RSA_RC}" ;;
    esac
  fi
fi

# ── Mechanism 6: capability-bound PushNotification gap ────────────────────
# Provider-neutral runtime 不可假設 exact tool 存在。只有 adapter/registry 明確宣告
# `push-notification` capability 時才檢查；缺宣告 = UNOBSERVED/nonblocking。
# 能力來源(2026-09-06 接上):`GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE` 由
# `scripts/run-provider-hook.mjs` 依 `packages/governance/canonical/providers.json` 的
# `capabilities.pushNotification` 匯出。registry-owned,所以沒有該工具的 provider 不會被要求 call。
# 歷史:在接上之前,這兩個變數在整個 repo 只出現在本檔、無人設定,`NOTIFICATION_AVAILABLE` 恆為 0,
# 因此同日「從 WARNING 升成 BLOCKER」那次 commit **並未實際生效**;該次的「機械收口」宣稱不成立,
# 據實留檔以免再被當成已完成。
NOTIFICATION_AVAILABLE=0
case ",${GOVERNANCE_AVAILABLE_CAPABILITIES:-}," in
  *,push-notification,*|*,PushNotification,*) NOTIFICATION_AVAILABLE=1 ;;
esac
[ "${GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE:-0}" = "1" ] && NOTIFICATION_AVAILABLE=1
# **能力也可以由觀察證明(2026-09-11 user:「我又沒收到推播了,你他媽到底何時才能永遠解決這個問題?」)**。
# 原本只認環境變數 —— 而那個變數在實際的 Claude Code session 裡沒有被設,於是這道閘**全程靜音**,
# 我同時忘了呼叫,連續多個 substantive turn 沒有推播也沒有任何警告。
# 環境變數是宣告,不是證據;**這個 session 裡真的成功呼叫過一次** 才是不可辯駁的證據。
# 掃整份 transcript(不只本 turn)找 `"name":"PushNotification"` 的 tool_use:
#   有 → 能力確定存在 → 從此每個 substantive turn 都要檢查(這正是本 session 的情況)
#   沒有 → 維持 nonblocking(不對沒有這個 tool 的 runtime 誤報)
if [ "$NOTIFICATION_AVAILABLE" = "0" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  if grep -qE '"type"[[:space:]]*:[[:space:]]*"tool_use"[^}]*"name"[[:space:]]*:[[:space:]]*"PushNotification"|"name"[[:space:]]*:[[:space:]]*"PushNotification"[^}]*"type"[[:space:]]*:[[:space:]]*"tool_use"' "$TRANSCRIPT_PATH" 2>/dev/null; then
    NOTIFICATION_AVAILABLE=1
  fi
fi
# 範圍(2026-11-21,工作包 E7;交接 process-audit 根因 8):從 WAKE_START_LINE 算起 = 最後一則 user 本人訊息或背景通知
# (lib/_turn_boundary.sh)。Stop hook 回饋不切 —— 舊寫法把回饋當成新回合,「推播 → 被別的 hook 擋 → 補正回覆」會被誤擋
# (11-18 17:27:04、17:27:15、18:06:40 三次,擋下前 9 到 54 秒其實已經推播過);背景通知照舊切,通知叫醒的回覆沒人在看。
if [ "$NOTIFICATION_AVAILABLE" = "1" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "${WAKE_START_LINE:-0}" -gt 0 ]; then
  # 長度一律算位元組(2026-11-21,E2-SIB 同族第 9 處):${#var} 在 UTF-8 語系算字、在 C 語系(正式環境)算位元組,
  # 同一則 100 個中文字的回覆,測試判「不實質」、正式環境判「實質」。照正式環境的意思固定成位元組。
  ASSISTANT_LEN=$(printf '%s' "$LAST_ASSISTANT" | wc -c | tr -d ' ')
  ASSISTANT_LEN=${ASSISTANT_LEN:-0}
  # Substantive trigger:長 reply OR 含 commit/ship/done/push keyword
  SUBSTANTIVE_RE='(commit|ship|push|done|完成|已 land|landed|merged|測試 PASS|verify gate PASS)'
  IS_SUBSTANTIVE=0
  if [ "$ASSISTANT_LEN" -gt 200 ]; then IS_SUBSTANTIVE=1; fi
  if grep -qiE "$SUBSTANTIVE_RE" <<< "$LAST_ASSISTANT"; then IS_SUBSTANTIVE=1; fi
  if [ "$IS_SUBSTANTIVE" = "1" ]; then
    # Check PushNotification tool call trace in this turn.
    # **必須是真的 tool_use block,不能只是字串出現**(2026-09-10 抓到的兩個洞之一):
    # 舊寫法 `grep -ciE 'PushNotification|"name":"PushNotification"'` 會被三種東西騙過 ——
    #   (1) 本 hook 自己寫進 transcript 的警告文字就含「PushNotification gap」→ 一旦警告過一次,
    #       之後每一 turn 都被自己的輸出遮蔽(實測:2026-09-10 07:17 之後五小時零 call,gate 全程靜音);
    #   (2) `ToolSearch` 的回傳結果會把整份工具 schema(含 "name": "PushNotification")貼進 transcript;
    #   (3) 我自己在回覆裡提到「PushNotification」也算。
    # 改成解析 transcript 的 content block:type=tool_use 且 name=PushNotification 才算。
    HAS_PUSH=0
    if command -v python3 >/dev/null 2>&1; then
      HAS_PUSH=$(TURN_START="$WAKE_START_LINE" python3 - "$TRANSCRIPT_PATH" <<'PY' 2>/dev/null || echo 0
import json, os, sys
start = int(os.environ.get("TURN_START", "0"))
count = 0
try:
    with open(sys.argv[1], encoding="utf-8", errors="ignore") as fh:
        for index, line in enumerate(fh, start=1):
            if index <= start or '"PushNotification"' not in line:
                continue
            try:
                record = json.loads(line)
            except Exception:
                continue
            message = record.get("message") or {}
            for block in message.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") == "PushNotification":
                    count += 1
except Exception:
    pass
print(count)
PY
      )
    else
      # 沒有 python3 的環境:退回較緊的兩段式比對(同一行同時有 tool_use 與 name),仍比舊寫法窄
      HAS_PUSH=$(tail -n +$((WAKE_START_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | grep -E '"type"[[:space:]]*:[[:space:]]*"tool_use"' 2>/dev/null | grep -cE '"name"[[:space:]]*:[[:space:]]*"PushNotification"' 2>/dev/null)
    fi
    HAS_PUSH=${HAS_PUSH:-0}
    if [ "$HAS_PUSH" -eq 0 ]; then
      # 2026-09-06 升 BLOCKER(user 逐字:「你他媽完成回覆後的推播到底為何又不見了?到底要講幾百次?
      # 你他媽這個不是有定義在工作流程嗎?換言之不管是現在未來還是在任何環節任何 session,
      # 你他媽都應該要按照工作流程規範運行才對啊」)。
      # 原本只是 WARNING → 漏 call 時不擋 turn，於是同一條規則被反覆違反。
      # 依 memory/feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md「SSOT canonical = 必 P0
      # BLOCKER 機械強制；禁 P1 WARN soft signal」升級。**只要求 call**，harness 自行決定要不要
      # 真的送出(terminal 有焦點時它會回「Not sent — redundant」，那仍算已 call)。
      CRITICAL_PUSH_GAP=1
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
  # 距離同 Mechanism 7:${U8C}{0,N}(N = 字數)+ LC_ALL=C(2026-11-21 E2-SIB;原本 .{0,N} 在正式環境只剩約三分之一)。
  PEER_INTENT_RE="(跟|找|請|問|用)${U8C}{0,5}${PEER_PROVIDER}${U8C}{0,30}(討論|比稿|辯論|確認|propose|送 brief|exec|review|做|看)|(啟|跑|執行|觸發|invoke|run|start|trigger|execute|propose|action|will|may|going to)${U8C}{0,15}(${PEER_PROVIDER}[-_ ]?(collab|exec|review)|dual-track)|@${PEER_PROVIDER} (DISCUSS|IMPLEMENT)|(派|dispatch|invoke|send to|送 brief|發給|propose) ${PEER_PROVIDER}|${PEER_PROVIDER}${U8C}{0,10}(做|跑|review)"
  PEER_INTENT=$(LC_ALL=C grep -ciE "$PEER_INTENT_RE" <<< "$LAST_ASSISTANT" 2>/dev/null)
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
# | Datadog Watchdog | mean + 2σ outlier detection | dynamic threshold(≥ 100 baseline samples) |
# | ESLint | max-warnings = 10 | topic > 10 |
# | Sentry | alert frequency = 10 events/hour | topic > 10 |
# | SonarQube | cognitive complexity = 15(較寬)| topic upper bound reference |
#
# Threshold(共識下限,對齊 Bugsnag/ESLint/Sentry minimum):
# - Trigger phrase: ≥ 5(對齊 Bugsnag occurrence count 5)
# - Topic repeat: > 10(對齊 ESLint max-warnings 10 + Sentry alert freq 10)
# - Dedup count: ≥ 5(對齊 Bugsnag occurrence count 5;同 warning fired
#   ≥ 5 次 still 沒解 = 該 user 主動處理,inject 第 6 次仍無效)
#
# 動態門檻(2026-10-07 收掉原 TODO):本機遙測(opt-in)的 `self-audit-baseline-counts.jsonl` 最近 10000 筆
# 樣本 ≥ 100 時,門檻 = max(共識下限, ceil(baseline mean + 2σ))(Datadog Watchdog)—— 只會為了壓掉這位
# user 平常就很高的基線而往上調,不會比共識下限更敏感。樣本不足 / 遙測沒開 / 資料壞掉(計算腳本 fail
# closed)/ 腳本不在 → 共識下限。公式只有一份:`scripts/calc-self-audit-baseline.mjs --thresholds`(M17)。
# Baseline capture mechanism 在本檔結尾(每 turn 寫 trigger/topic count 不論 fire 與否)。
TRIGGER_THRESHOLD=5
TOPIC_THRESHOLD=10
BASELINE_CALC="$PROJECT_DIR/scripts/calc-self-audit-baseline.mjs"
if [ "$STATE_WRITES" = "1" ] && [ -f "$STATE_DIR/self-audit-baseline-counts.jsonl" ] \
  && [ -f "$BASELINE_CALC" ] && [ ! -L "$BASELINE_CALC" ]; then
  BASELINE_DYNAMIC=$(GOVERNANCE_STATE_DIR="$STATE_DIR" node "$BASELINE_CALC" --thresholds 2>/dev/null || true)
  if printf '%s' "$BASELINE_DYNAMIC" | grep -qE '^[0-9]+ [0-9]+ [0-9]+$'; then
    read -r _BASELINE_SAMPLES _DYNAMIC_TRIGGER _DYNAMIC_TOPIC <<< "$BASELINE_DYNAMIC"
    [ "$_DYNAMIC_TRIGGER" -gt "$TRIGGER_THRESHOLD" ] && TRIGGER_THRESHOLD="$_DYNAMIC_TRIGGER"
    [ "$_DYNAMIC_TOPIC" -gt "$TOPIC_THRESHOLD" ] && TOPIC_THRESHOLD="$_DYNAMIC_TOPIC"
  fi
fi
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract user message texts from transcript(縮 500→200,只看最近 turns)
  USER_MSGS=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null)

  # Detect M13/M19-style trigger phrases repeated across turns
  TRIGGER_RE='(確保|永遠|不留待辦|不能漂移|沒例外|ensure|always|never|world-class|世界級)'
  TRIGGER_COUNT=$(grep -ciE "$TRIGGER_RE" <<< "$USER_MSGS" 2>/dev/null)
  TRIGGER_COUNT=${TRIGGER_COUNT:-0}

  if [ "$TRIGGER_COUNT" -ge "$TRIGGER_THRESHOLD" ]; then
    WARNINGS="${WARNINGS}\n  • User trigger-phrase 累計 ${TRIGGER_COUNT} 次(門檻 ${TRIGGER_THRESHOLD};M19 strong signal)。確認 /ensure-canonical 5-layer 全做完;若有任一 layer skip = 違反 M19。"
  fi

  # Same-topic repetition(quick keyword overlap heuristic)
  TOPIC_KEYWORDS=$(tr -s '[:space:]' '\n' <<< "$USER_MSGS" | \
    grep -iE '^(audit|prune|principles|trait|canonical|hook|skill|world-class|infra)$' | \
    sort | uniq -c | sort -rn | awk 'NR <= 3 { print }')
  TOP_COUNT=$(awk 'NR == 1 { print $1 }' <<< "$TOPIC_KEYWORDS")

  if [ -n "$TOP_COUNT" ] && [ "$TOP_COUNT" -gt "$TOPIC_THRESHOLD" ]; then
    TOP_TOPIC=$(awk 'NR == 1 { print $2 }' <<< "$TOPIC_KEYWORDS")
    WARNINGS="${WARNINGS}\n  • Topic「${TOP_TOPIC}」repeated ${TOP_COUNT}x — likely user 第 N 次提示同主題,可能 prior turns 落地不徹底。"
  fi

  # ── Mechanism 11: M33 stop-hook overfire reflex detection(2026-05-13 ship;原與 peer-reply-verify 同叫 Mechanism 4,2026-11-17 改編號)──
  #
  # M33 canonical(meta-patterns.md):AI 對連續 stop hook BLOCKER 自動 conservative-defer
  # 「下個 session」「context budget」「省工」反 pattern。Detect 雙條件:
  #   (a) Last assistant reply 含 defer keyword
  #   (b) Recent user msgs 含 push-back keyword(user 反覆催做完)
  # 兩條件成立 → WARN「revert next-session framing,continue work or be specific about prereq deliverable」
  # 2026-05-13 peer review fix:dedup 重複「下個 session」+ expand variants。
  # WARN 寫進功能狀態的 self-audit-warnings.jsonl,下一回合由 inject_pending_self_audit.sh 注入;
  # 2026-11-21 WP-06 以前綁遙測開關,預設關 = 永遠送不到(test_stop_self_audit.sh Test 109)。
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
  # 為 future dynamic threshold(mean + 2σ)累積 ground truth distribution。觀察用樣本 = 遙測(要 opt-in)。
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
# 這份檔是功能狀態(WARN_STATE_DIR,見檔頭):讀寫都走 governance_runtime_file_path(拒 symlink / hard link / 非一般檔);
# 解析要 python3,放在 GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1 的子 shell —— 寫不成只少一筆提醒,不改本回合的判定。
WARN_LOG=""
if [ -n "$WARN_STATE_DIR" ]; then
  WARN_LOG="$(GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL=1
    export GOVERNANCE_TOOL_PROBE_SIDE_CHANNEL
    governance_runtime_file_path self-audit-warnings.jsonl "$WARN_STATE_DIR" 2>/dev/null)" || WARN_LOG=""
fi
if [ -n "$WARN_LOG" ] && [ -f "$WARN_LOG" ]; then
  WARN_HASH=$(printf '%b' "$WARNINGS" | governance_hash_prefix)
  RECENT_HASHES=$(tail -5 "$WARN_LOG" 2>/dev/null | \
    jq -r '.warnings // empty' 2>/dev/null | \
    while IFS= read -r w; do printf '%s' "$w" | governance_hash_prefix; done)
  DEDUP_COUNT=$(grep -c "^${WARN_HASH}$" <<< "$RECENT_HASHES" 2>/dev/null)
  DEDUP_COUNT=${DEDUP_COUNT:-0}
  if [ "$DEDUP_COUNT" -ge 5 ]; then
    exit 0
  fi
fi

# 永遠 log warnings(下 turn 透過 inject_pending_self_audit 看到)。功能狀態:不看遙測開關(檔頭)。
if [ -n "$WARN_STATE_DIR" ]; then
  governance_append_enforcement_record self-audit-warnings.jsonl \
    "$(printf '{"ts":"%s","warnings":%s}' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$(printf '%b' "$WARNINGS" | jq -Rs .)")" || true
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
      "🚨 CLAIM-VERIFY GAP BLOCKER:你 claim「verified / done / 完成」但本 turn 沒跑任何真驗證(型別 / 測試 / 閘 / 稽核 / 視覺)。立刻 (a) 跑對應驗證(型別證明 = npm run build:lib;本 repo 的 tsc -b 不檢查 DS 原始碼,不算),OR (b) 在本 turn 明確撤回 claim(打「撤回 claim」/「未驗證」)。否則 turn 不結束。" \
      "本機制 = M20 100+ 次 failure mode 升 BLOCKER(原 silent inject → block)。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 10 自鎖後把動作推給 user(M36(b),2026-09-19)──
# 升級邏輯同 M1/M4:第一次 block 阻 turn,同 hash 降 warn 防 loop。
if [ "${CRITICAL_SELF_LOCK_HANDOFF:-0}" = "1" ] && [ -n "$HANDOFF_SOURCE" ]; then
  LOCK_HASH=$(printf '%s' "${HANDOFF_SOURCE: -200}" | governance_hash_prefix)
  LAST_BLOCKED_LOCK_FILE="$STATE_DIR/.last-blocked-self-lock.txt"
  LAST_BLOCKED_LOCK=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_LOCK_FILE" ] && LAST_BLOCKED_LOCK=$(cat "$LAST_BLOCKED_LOCK_FILE" 2>/dev/null || echo "")
  if [ "$LOCK_HASH" != "$LAST_BLOCKED_LOCK" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$LOCK_HASH" > "$LAST_BLOCKED_LOCK_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 SELF-LOCK HANDOFF BLOCKER(M36(b)):本輪(交辦 '!' 指令或叫 user 在對話框貼上的,含上一輪)有工具被擋,而你在回覆、推播或提問選項裡請 user 自己跑指令。先答 M36(b') 三問 — (1) 憑證真的缺嗎?(2) 體檢測的是真實需要的能力嗎?(3) 有沒有已驗證可通的等價傳輸?尤其 git plumbing(update-ref -d / update-index --cacheinfo,只寫 .git 可寫區)、harness 檔案工具、index-authoritative generator。'!' 在不在牆內看 session:一般 session 的 '!' 在沙箱外(官方 sandboxing 文件,v2.1.260 起),背景 session 仍在沙箱內、指它 = 把死路交給 user;不論哪種,上面三問沒答完就交出去,都是把動作丟回 user。真 human-only 只有 login/MFA/OAuth/帳單/缺 credential reference。做到了,或確認是真 human-only 邊界,才可結束 turn。" \
      "本機制 = M36(b) 從純散文升為 mechanical BLOCKER(2026-09-19;規則 2026-08-08 就立、2026-08-28 已明文禁指路 '!',仍於 2026-09-19 再犯且是 user 反問才發現)。")
    emit_governance_block "$REASON"
  fi
fi

# ── BLOCKER for Mechanism 10b 分類器擋下卻沒講(2026-11-18)── 升級邏輯同 M10:第一次擋,同 hash 降 warn 防 loop。
if [ "${CRITICAL_CLASSIFIER_SILENT:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  SILENT_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_SILENT_FILE="$STATE_DIR/.last-blocked-classifier-silent.txt"
  LAST_BLOCKED_SILENT=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_SILENT_FILE" ] && LAST_BLOCKED_SILENT=$(cat "$LAST_BLOCKED_SILENT_FILE" 2>/dev/null || echo "")
  if [ "$SILENT_HASH" != "$LAST_BLOCKED_SILENT" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$SILENT_HASH" > "$LAST_BLOCKED_SILENT_FILE" 2>/dev/null || true; }
    emit_governance_block "🚨 CLASSIFIER-SILENT BLOCKER(governance/memory/reference_auto_mode_sandbox_boundaries.md 第四節第 4 條「分類器擋下 = 停在該處並回報」):本 turn 有動作被 auto mode 分類器擋下,但回覆沒有交代。在回覆寫明:哪一個動作被擋、分類器給的理由、這件事因此停在哪裡;不換工具或寫法重做同一件事、不下一 turn 再試,也不把指令交給 user 去跑。"
  fi
fi

# ── BLOCKER for Mechanism 12 發版前機器可讀項目自我稽核(2026-11-21)── 不做同 hash 降級;本機制擋過一次之後,
# 那則 hook 回饋之前的推播 / 回覆不再重擋(範圍規則見 Mechanism 12 檔頭),所以不會死鎖。
if [ "${CRITICAL_RELEASE_SELF_AUDIT:-0}" = "1" ] && [ -n "${RSA_REASON:-}" ]; then
  emit_governance_block "$RSA_REASON"
fi

# ── BLOCKER for Mechanism 8b 引原話當限制理由卻沒寫原題(2026-11-15)── 升級邏輯同 M10。
if [ "${CRITICAL_QUOTE_SCOPE:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  QUOTE_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_QUOTE_FILE="$STATE_DIR/.last-blocked-quote-scope.txt"
  LAST_BLOCKED_QUOTE=""
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_QUOTE_FILE" ] && LAST_BLOCKED_QUOTE=$(cat "$LAST_BLOCKED_QUOTE_FILE" 2>/dev/null || echo "")
  if [ "$QUOTE_HASH" != "$LAST_BLOCKED_QUOTE" ]; then
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$QUOTE_HASH" > "$LAST_BLOCKED_QUOTE_FILE" 2>/dev/null || true; }
    emit_governance_block "🚨 QUOTE-SCOPE BLOCKER(M36a / feedback_propose_discipline.md Sub-rule 8):你拿 user 原話當不動 / 撤回 / 擱置的理由,補一行「原題:<那句原話回答的是哪一題>」,範圍只取字面最窄讀法(「不要改壞 X」≠「不要改 X」),原題撐不住這個限制就照規格做。"
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

# ── BLOCKER for Mechanism 6 PushNotification gap(2026-09-06 user-authorized)──
# 升級邏輯同 M1/M4/M5:第一次 block 阻 turn,同 hash 降 warn 防 loop。
if [ "${CRITICAL_PUSH_GAP:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  PUSH_HASH=$(printf '%s' "${LAST_ASSISTANT: -200}" | governance_hash_prefix)
  LAST_BLOCKED_PUSH_FILE="$STATE_DIR/.last-blocked-push.txt"
  PUSH_STREAK_FILE="$STATE_DIR/.blocked-push-streak.txt"
  LAST_BLOCKED_PUSH=""
  PUSH_STREAK=0
  [ "$STATE_WRITES" = "1" ] && [ -f "$LAST_BLOCKED_PUSH_FILE" ] && LAST_BLOCKED_PUSH=$(cat "$LAST_BLOCKED_PUSH_FILE" 2>/dev/null || echo "")
  [ "$STATE_WRITES" = "1" ] && [ -f "$PUSH_STREAK_FILE" ] && PUSH_STREAK=$(cat "$PUSH_STREAK_FILE" 2>/dev/null || echo 0)
  case "$PUSH_STREAK" in (*[!0-9]*|'') PUSH_STREAK=0 ;; esac
  # 2026-09-10:同 hash 就降 warn 的舊規則等於「回覆改一個字就能逃掉」——實測今天連續五小時零 call。
  # 改成:同一段回覆最多擋 3 次(改寫也照擋),第 4 次才降 warn 防死鎖。真的 call 過就整個重置。
  if [ "$PUSH_HASH" != "$LAST_BLOCKED_PUSH" ] || [ "$PUSH_STREAK" -lt 3 ]; then
    if [ "$PUSH_HASH" = "$LAST_BLOCKED_PUSH" ]; then PUSH_STREAK=$((PUSH_STREAK + 1)); else PUSH_STREAK=1; fi
    [ "$STATE_WRITES" = "1" ] && { mkdir -p "$STATE_DIR" 2>/dev/null; echo "$PUSH_HASH" > "$LAST_BLOCKED_PUSH_FILE" 2>/dev/null || true; echo "$PUSH_STREAK" > "$PUSH_STREAK_FILE" 2>/dev/null || true; }
    REASON=$(printf '%s' \
      "🚨 PUSH-NOTIFICATION BLOCKER(M6):本 turn 是 substantive output 但沒有 PushNotification tool call trace。" \
      "工作流程規範(memory/feedback_push_always_call.md):registered runtime 具 push-notification capability 時,substantive turn 結尾**必 call**。" \
      "立刻 call PushNotification(一行、200 字內、講對方現在會想知道的事)。harness 若因 terminal 有焦點回「Not sent — redundant」仍算已 call,不必重試。否則 turn 不結束。")
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
