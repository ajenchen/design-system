#!/bin/bash
set -uo pipefail
# Stop hook: AI self-audit — detect 3 anti-patterns + inject corrective context.
#
# 1. Claim-verification gap:assistant claimed「verified / done / 全部 / pass / 完成」
#    in transcript but no verify cmd(tsc / hook test / compile / audit)ran this turn
# 2. Auto-prune trigger:CLAUDE.md > 500 OR foundational SSOT spec > cap → inject
#    /knowledge-prune chain reminder
# 3. Repeated-topic detector:user 問同 topic ≥ 3 turns within session → inject
#    /ensure-canonical reminder(M19 trigger phrase auto-pipeline)
#
# Why: M14 / M19 markdown rules rely on AI memory(unreliable). 本 hook 是 mechanical
# 落地 — AI 不需要記得自我審查,hook 強制 inject 反思 prompt to next turn。
#
# Triggers: every Stop event(low cost ~50ms per turn)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

INPUT=$(cat 2>/dev/null || echo "{}")
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)

WARNINGS=""

# ── Mechanism 1: Claim-verification gap ─────────────────────────────────────
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # NOTE(2026-05-01 v3): Claude transcript 把 tool_result 也標 role="user"。
  # 之前 awk 抓到 tool_result line 當「真 user prompt」→ scope window 算錯
  # → fire false positive。
  # 修:grep filter 真 user prompt(role=user 且 content 不是 tool_result),
  # 整 transcript scan(不 tail 500 windowed,避免 edge case)。
  LAST_USER_LINE=$(grep -n '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | \
    grep -v '"type":"tool_result"' | tail -1 | cut -d: -f1)
  LAST_USER_LINE=${LAST_USER_LINE:-0}
  if [ "$LAST_USER_LINE" -gt 0 ]; then
    LAST_ASSISTANT=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.role=="assistant") | .message.content[]?.text // empty' 2>/dev/null)
  else
    LAST_ASSISTANT=""
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
  if echo "$LAST_ASSISTANT" | grep -qiE "$CLAIM_RE" && ! echo "$LAST_ASSISTANT" | grep -qiE "$RETRACT_RE"; then
    # Check if any verify-class tool_use happened in THIS turn(after last user msg)
    VERIFY_RE='(npx tsc|bash .claude/hooks/tests|compile-stories|npm run build|npm run test|design-system-audit|visual-audit)'
    if [ "$LAST_USER_LINE" -gt 0 ]; then
      THIS_TURN_TOOLS=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
    else
      THIS_TURN_TOOLS=""
    fi
    if ! echo "$THIS_TURN_TOOLS" | grep -qE "$VERIFY_RE"; then
      WARNINGS="${WARNINGS}\n  • Claim-verify gap:你說 verified / done / 完成 等,但本 turn 無 tsc / test / audit 真執行。下輪實跑驗證或撤回 claim。"
      # 標記 CRITICAL — Mechanism 1 升 BLOCKER(2026-04-30 升級):AI claim done 但無驗證
      # = 100+ 次重複 failure mode。不再 silent log,exit `decision: block` 強制 turn 不結束。
      CRITICAL_CLAIM_VERIFY=1
    fi
  fi
fi

# ── Mechanism 2: Auto-prune trigger ─────────────────────────────────────────
if [ -f CLAUDE.md ]; then
  L=$(wc -l < CLAUDE.md | tr -d ' ')
  if [ "$L" -gt 500 ]; then
    WARNINGS="${WARNINGS}\n  • CLAUDE.md ${L} 行(over 500 — auto-prune trigger)。下輪 invoke /knowledge-prune scope=full,不 defer。"
  fi
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
    # 2026-05-22 prune codify per CLAUDE.md「foundational SSOT 例外 ≤ 800-1200」range:
    # color.spec.md = token system 218-line semantic 不可拆 + nested theme + Atlassian-flow rationale,foundational tier 2 cap 1000。
    */color/color.spec.md) cap=1000 ;;
    *) cap=800 ;;
  esac
  if [ "$L" -gt "$cap" ]; then
    WARNINGS="${WARNINGS}\n  • $f ${L}/${cap} cap — auto-prune trigger,下輪 /knowledge-prune"
  fi
done

# ── Mechanism 4: Codex-reply-verify gap(2026-05-09 user-authorized)──────────
# Why: feedback_codex_dual_track_synthesizer.md markdown rule 沒 enforce — 我每次貼 codex
# reply 就過,沒走 Step 4.5(verify cite)/ 4.6(regression scan)/ 5(own-version 比稿)。
# 本 mechanism 機械化偵測:同 turn 讀 codex reply file → 必有 cite verify 或 retract。
#
# 觸發 signal:本 turn 內任何 Read tool 命中 `/tmp/codex-reply-*.md` 或 `.claude/tmp/codex-reply-*.md`
# 必須 signal(任一):
#   (a) Bash with `grep` against any file path(cite verify)
#   (b) Bash with `npx tsc` / `bash .claude/hooks/tests`(regression-class verify)
#   (c) Read against codex-cited code path(`packages/design-system/src/...`)
#   (d) Explicit retract phrase(撤回 / 未採納 / 不採用 / skip codex)
# 任一 missing → CRITICAL 通知;同 Mechanism 1 升 BLOCKER 阻 turn 結束。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "$LAST_USER_LINE" -gt 0 ]; then
  THIS_TURN_FULL=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  CODEX_REPLY_READ=$(echo "$THIS_TURN_FULL" | grep -cE 'codex-reply-[a-zA-Z0-9_-]+\.md' 2>/dev/null)
  CODEX_REPLY_READ=${CODEX_REPLY_READ:-0}
  if [ "$CODEX_REPLY_READ" -gt 0 ]; then
    # Signal (a)/(b): grep / tsc / hook tests / src/ Read
    VERIFY_SIG_RE='(Bash.*grep|Bash.*npx tsc|Bash.*bash .claude/hooks/tests|Read.*packages/design-system/src)'
    # Signal (d): retract phrase in last assistant message
    # 2026-05-17 expanded: cover all FP patterns(historical cite / pure git / pure verify / 0 codex)
    RETRACT_CODEX_RE='(撤回採納|撤回 claim|未採納 codex|不採用 codex|skip codex|codex.*未 verify|0 條新 codex|0 codex|沒啟 codex|沒要啟 codex|純 git|純 verify|純文字|本 turn 純|本 turn 無 codex|引用 prior|cite previous|描述 prior|歷史 codex|historical reference)'
    HAS_VERIFY=$(echo "$THIS_TURN_FULL" | grep -cE "$VERIFY_SIG_RE" 2>/dev/null)
    HAS_VERIFY=${HAS_VERIFY:-0}
    HAS_RETRACT=$(echo "$LAST_ASSISTANT" | grep -cE "$RETRACT_CODEX_RE" 2>/dev/null)
    HAS_RETRACT=${HAS_RETRACT:-0}
    if [ "$HAS_VERIFY" -eq 0 ] && [ "$HAS_RETRACT" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Codex-reply verify gap:本 turn 讀 codex reply 但無 grep cite verify / tsc / hook tests / Read src/。下輪實 Step 4.5/4.6 verify 或撤回採納。"
      CRITICAL_CODEX_VERIFY=1
    fi

    # ── Sub-check: 比稿 anti-pass-through(2026-05-09 user-authorized infra auto;升級 dissent enforcement)──
    # User 反復糾正我「pass-through degeneration」(直接 quote codex 不標 Claude own version)
    # `feedback_codex_dual_track_synthesizer.md` 規定:必 Layer A(Claude own)+ Layer B(codex own)+ Layer C(synthesize)
    # 2026-05-09 v2 user verbatim:「infra 還應該要強迫你跟 codex 自動進行合理有依據(各自參考世界級的設計後我們的設計系統)的辯論吧?尤其是你們意見不同的時候,應該辯出一個最完美完整且全方位的方案再提交給我」
    # Mechanical 偵測:本 turn 讀 codex reply 必含 (own-version OR dissent OR retract) — 任一 valid;
    # 若 turn 還動 spec.md / packages/design-system/src / CLAUDE.md 等 substantive home → 缺辯證 → BLOCKER
    OWN_VERSION_RE='(Claude own|Step 0\.5|我 own analysis|我 Step 0|own version|own analysis)'
    DISSENT_RE='(撞 codex|不同意 codex|反駁 codex|撤回採|不採 codex|Layer C|比稿|我覺得 codex 錯|codex 撞我撞錯|codex 推論錯|採 user|user 撞對)'
    HAS_OWN_VERSION=$(echo "$LAST_ASSISTANT" | grep -ciE "$OWN_VERSION_RE" 2>/dev/null)
    HAS_OWN_VERSION=${HAS_OWN_VERSION:-0}
    HAS_DISSENT=$(echo "$LAST_ASSISTANT" | grep -ciE "$DISSENT_RE" 2>/dev/null)
    HAS_DISSENT=${HAS_DISSENT:-0}
    HAS_DEBATE=$((HAS_OWN_VERSION + HAS_DISSENT + HAS_RETRACT))
    if [ "$HAS_DEBATE" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Codex pass-through risk:本 turn 讀 codex reply 但無 (Claude own / Step 0.5 / 撞 codex / 撤回採 / Layer C 比稿) 任一 marker。下輪明標「Layer A Claude own:」+「Layer C 撞 codex N 點」section,真撞不過水 codex 結論。"
      # Sub-check: 同 turn 有 substantive edit + 無辯證 → BLOCKER
      SUBSTANTIVE_EDIT_RE='(Edit|Write).*(packages/design-system/src|\.spec\.md|CLAUDE\.md|\.claude/rules)'
      HAS_SUBSTANTIVE=$(echo "$THIS_TURN_FULL" | grep -cE "$SUBSTANTIVE_EDIT_RE" 2>/dev/null)
      HAS_SUBSTANTIVE=${HAS_SUBSTANTIVE:-0}
      if [ "$HAS_SUBSTANTIVE" -gt 0 ]; then
        CRITICAL_CODEX_VERIFY=1  # 升 BLOCKER:無辯證 + 動 substantive home = 違反「真辯論」紀律
        WARNINGS="${WARNINGS}\n    🚨 BLOCKER 升級:本 turn 動 substantive home(spec/src/CLAUDE.md/rules)且無辯證 marker → 違反「跟 codex 真辯論才 ship」紀律。立刻 inline 標 Layer C dissent OR 撤回 substantive edit。"
      fi
    fi

    # ── Sub-check M31 Phase-A-first(2026-05-29 codify per user「codex 只是 second opinion」)──
    # 偵測:本 turn 讀 codex reply 但無 prior Claude-solo audit trace(Agent/Explore dispatch OR ≥5 Grep/Read)
    # → codex 被當 primary 而非 second opinion = 違反 M31 dual-track「Claude 必先自己 Phase A」
    # SSOT: memory/feedback_m31_phaseA_first_and_autonomy_no_ask.md
    M31_PRIOR_AUDIT=$(echo "$THIS_TURN_FULL" | grep -cE '"(Agent|Task)"|subagent_type|Explore' 2>/dev/null)
    M31_PRIOR_AUDIT=${M31_PRIOR_AUDIT:-0}
    M31_GREP_READ=$(echo "$THIS_TURN_FULL" | grep -cE '"name":"(Grep|Read)"|name=.Grep|name=.Read' 2>/dev/null)
    M31_GREP_READ=${M31_GREP_READ:-0}
    if [ "$M31_PRIOR_AUDIT" -eq 0 ] && [ "$M31_GREP_READ" -lt 5 ]; then
      WARNINGS="${WARNINGS}\n  • M31 Phase-A-first risk:本 turn 啟 codex 但無 Claude-solo audit trace(Explore/Agent dispatch OR ≥5 Grep/Read)。codex = second opinion,Claude 必先自己跑完整 Phase A 深度 audit 才 defer codex(跑幾個 script ≠ Phase A)。per memory/feedback_m31_phaseA_first_and_autonomy_no_ask.md。Anchor 2026-05-29:run test+tsc 就 launch codex 跳過自己 audit,漏 3 個只有 Claude 抓到的 P0。"
    fi

    # ── Sub-check: 設計決策 implementation 沒 user approval(2026-05-09 user-authorized)──
    # User 直接糾「設計決策的東西你應該要先問過我讓我決策吧?為什麼就直接開跑」(commit 698ff58)
    # CLAUDE.md `# 稽核 canonical` Audit-vs-execute 分權:substantive meaning → STOP 提議。
    # 設計決策(token 換 / hover behavior / spec L4 改寫 / state machine)= substantive。
    # 2026-05-15 NO-SAMPLE detection(audit-full-sweep canonical):
    # 偵測 sub-agent prompt 含 sample subset keyword + `/design-system-audit --deep` context
    SAMPLE_RE='sample top [0-9]+|sampled top|subset|pick top [0-9]+|top hot|too many to scan|sampled components'
    DEEP_AUDIT_RE='/design-system-audit.*--deep|design-system-audit --deep'
    HAS_SAMPLE=$(echo "$THIS_TURN_FULL" | grep -cE "$SAMPLE_RE" 2>/dev/null)
    HAS_DEEP=$(echo "$THIS_TURN_FULL" | grep -cE "$DEEP_AUDIT_RE" 2>/dev/null)
    HAS_SAMPLE=${HAS_SAMPLE:-0}
    HAS_DEEP=${HAS_DEEP:-0}
    if [ "$HAS_SAMPLE" -gt 0 ] && [ "$HAS_DEEP" -gt 0 ]; then
      WARNINGS="${WARNINGS}\n  • NO-SAMPLE violation:本 turn `--deep` audit sub-agent prompt 含 sample subset keyword(sample top N / subset / pick top X 等)違反 audit-full-sweep canonical(memory/feedback_audit_full_sweep_not_sample.md)。下輪 sub-agent dispatch 改 DS-wide ALL components,context 不夠拆 stage 不 sample。"
    fi

    # Mechanical 偵測:codex reply read + Edit/Write production code(packages/design-system/src/)+ 近 user 無 approval keyword → BLOCKER
    # 2026-05-15 fix(per user「Hook false-positive 再犯」):
    # 原 regex `(Edit|Write).*packages/design-system/src` 在 raw text 上掃 → 誤抓 sub-agent report
    # 內含「Edit packages/design-system/src/...」file:line snippet 的描述文字。
    # 升級:jq 直接掃 tool_use 結構,只算「tool_name in {Edit,Write,MultiEdit} AND
    # tool_input.file_path startsWith packages/design-system/src/ AND NOT .stories.tsx/.test.ts/.spec.ts allowlist」。
    HAS_EDIT_PRODUCTION=$(echo "$THIS_TURN_FULL" | jq -r '
      select(.message.content) | .message.content[]? |
      select(.type == "tool_use") |
      select(.name == "Edit" or .name == "Write" or .name == "MultiEdit") |
      .input.file_path // empty
    ' 2>/dev/null | \
      grep -E '/packages/design-system/src/' | \
      grep -vE '\.stories\.tsx$|\.test\.ts$|\.spec\.ts$|\.anatomy\.stories\.tsx$|\.principles\.stories\.tsx$' | \
      wc -l | tr -d ' ')
    HAS_EDIT_PRODUCTION=${HAS_EDIT_PRODUCTION:-0}
    if [ "$HAS_EDIT_PRODUCTION" -gt 0 ]; then
      # Detect approval keyword in 近 5 條 user message(transcript jq parse limited;簡化用 USER_MSGS extract)
      # 2026-05-13:expanded keyword list per user verbatim「3. stop_self_audit.sh 那個 keyword regex 要不要擴?擴」
      # 加 5 個被前 turn 抓漏的 user 拍板 keyword(2026-05-12 sessions):做完 / 全部做完 / 做到完 / 馬不停蹄 / 建議做。
      # 2026-05-21 M34 fix:加「妳」變體 / 「決策N」 numbered directive / 「做到好」「都做」「全做」 — 對齊
      # check_substantive_edit_approval_preflight.sh sister regex(SSOT 同步)。
      # SSOT-sync with check_substantive_edit_approval_preflight.sh:61(2026-05-21 Phase B codex 抓兩 hook 不一致)
      APPROVAL_RE='(同意|採用|採納|拍板|拍\s*[A-Z0-9]|可以|改成|改為|執行|上吧|push|implement|go ahead|approved|OK|好|沒問題|做一做|就做|做吧|做完|全部做完|做到完|做到好|都做|全做|馬不停蹄|建議做|ship|合 main|^#[0-9]+|照你|照妳|照建議|照共識|照我的|按照|決策[一二三四五六七八九十1-9]|[A-Z][0-9]+\s*(做|改|修)|先\s*[A-Z][0-9]+)'
      RECENT_USER_MSGS=$(tail -100 "$TRANSCRIPT_PATH" 2>/dev/null | \
        jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null | tail -5)
      HAS_APPROVAL=$(echo "$RECENT_USER_MSGS" | grep -cE "$APPROVAL_RE" 2>/dev/null)
      HAS_APPROVAL=${HAS_APPROVAL:-0}
      if [ "$HAS_APPROVAL" -eq 0 ] && [ "$HAS_RETRACT" -eq 0 ]; then
        WARNINGS="${WARNINGS}\n  • Codex-design-no-approval:本 turn 讀 codex reply + Edit/Write packages/design-system/src 但近 5 條 user message 無 approval keyword(同意/採用/拍板/可以/改成/OK/好/push)。設計決策 = substantive,需 user 拍板才 ship — 對齊 CLAUDE.md 稽核 canonical Audit-vs-execute 分權。下輪 (a) 撤回 ship + revert,OR (b) 確認 user 已拍板列具體 quote。"
        CRITICAL_CODEX_DESIGN_NO_APPROVAL=1
      fi
    fi
  fi
fi

# ── Mechanism 6: PushNotification gap(2026-05-18 user-authorized)──────────
# Why: memory/feedback_push_always_call.md 明文「每 substantive turn 結尾必 call PushNotification」,
# 但純 markdown rule AI 會 silently forget(本 session 中段漏 5+ turns,user 抓「為何完成回覆沒送通知」)。
# 機械化:本 turn assistant 有 substantive output(text > 200 chars OR commit/ship/push/done 等)+
# 無 PushNotification tool call trace → P1 warn,未來升 BLOCKER 若仍漏。
# Allow escape:turn 純 ack(< 200 chars 確認類 reply)/ 純翻譯 / 純 grep-only 無 action。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  ASSISTANT_LEN=$(echo "$LAST_ASSISTANT" | wc -c | tr -d ' ')
  ASSISTANT_LEN=${ASSISTANT_LEN:-0}
  # Substantive trigger:長 reply OR 含 commit/ship/done/push keyword
  SUBSTANTIVE_RE='(commit|ship|push|done|完成|已 land|landed|merged|測試 PASS|verify gate PASS)'
  IS_SUBSTANTIVE=0
  if [ "$ASSISTANT_LEN" -gt 200 ]; then IS_SUBSTANTIVE=1; fi
  if echo "$LAST_ASSISTANT" | grep -qiE "$SUBSTANTIVE_RE"; then IS_SUBSTANTIVE=1; fi
  if [ "$IS_SUBSTANTIVE" = "1" ]; then
    # Check PushNotification tool call trace in this turn
    HAS_PUSH=$(echo "$THIS_TURN_TOOLS" | grep -ciE 'PushNotification|"name":"PushNotification"' 2>/dev/null)
    HAS_PUSH=${HAS_PUSH:-0}
    if [ "$HAS_PUSH" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • PushNotification gap:本 turn substantive output 但無 PushNotification tool call trace。per memory/feedback_push_always_call.md「每 substantive turn 結尾必 call,不自我 suppress(harness 自決)」。下輪 reply 結尾必 call PushNotification(若 terminal focused harness 自決 suppress = OK)。"
    fi
  fi
fi

# ── Mechanism 5: Codex transport discovery gap(2026-05-17 user-authorized)──
# Why: SKILL.md L42-58 Step 0.4 強制 3-test discovery(node_modules/.bin/codex / which / auth.json)
# 在啟 codex 前。Markdown rule 沒 enforce — 2026-05-17 我跑 `which codex` 失敗就斷言 unreachable
# + 試 sudo install / 繞 M28 開 PR / Explore agent 替身,user 抓「為何能失憶」。本 mechanism
# 機械化偵測:本 turn 含 codex collab 意圖 keyword AND 無 discovery cmd trace AND 無撤回 → BLOCKER。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && [ "${LAST_USER_LINE:-0}" -gt 0 ]; then
  THIS_TURN_RAW=$(tail -n +$((LAST_USER_LINE+1)) "$TRANSCRIPT_PATH" 2>/dev/null)
  # 2026-05-17 fix:CODEX_INTENT scope 改 LAST_ASSISTANT 而非 THIS_TURN_RAW —
  # 排除 bash commit message / tool input / status report cite 觸發 FP。
  # Active intent 必出現在 assistant prose(「我派 codex / 找 codex 比稿」)。
  # 2026-05-27 tighten POSITIVE detection per user「品質不降 SSOT 不偏」directive:
  # 原 regex 包含 broad `dual-track` 跟 `跟 codex`(無 action verb)→ retrospective mentions
  # 觸發 false-positive(本 session ≥ 4x BLOCKER on doc-only text)。Tighten:require action verb
  # adjacent to codex/dual-track keyword。保留 narrow action patterns(@codex DISCUSS / 派 / 啟 /
  # dispatch / invoke / 送 brief)— 真實 invocation 永遠帶 action verb。
  # Quality preserved:real codex invocation 必含 verb,tighten 不 miss real case;
  # retrospective documenting canonical 沒 verb,正確 skip。
  # 2026-05-27 v2 enrichment per Phase A+B 共識(Claude inline probe + codex independent probe 各抓 ~3-4 false-negative):
  # 加 patterns:auxiliary verb「會/will」+ codex verb / 「請 codex review」/「發給 codex」/「用 codex 做」/
  # action verb「propose|review|execute」adjacent / hyphenated `codex-collab` variant。
  # Quality preserved:smoke test 23/23 PASS(包含新增 EN + CN action-verb edge cases 不漏)。
  CODEX_INTENT_RE='(跟|找|請|問|用).{0,5}codex.{0,30}(討論|比稿|辯論|確認|propose|送 brief|exec|review|做|看)|(啟|跑|執行|觸發|執行|invoke|run|start|trigger|execute|propose|action|will|may|going to).{0,15}(codex[-_ ]?(collab|exec|review)|dual-track)|@codex (DISCUSS|IMPLEMENT)|(派|dispatch|invoke|send to|送 brief|發給|propose) codex|node_modules/\.bin/codex[[:space:]]+(exec|review)|codex.{0,10}(做|跑|review)|action[:：].{0,10}propose.{0,10}codex'
  CODEX_INTENT=$(echo "$LAST_ASSISTANT" | grep -ciE "$CODEX_INTENT_RE" 2>/dev/null)
  CODEX_INTENT=${CODEX_INTENT:-0}
  if [ "$CODEX_INTENT" -gt 0 ]; then
    DISCOVERY_RE='node_modules/\.bin/codex|which codex|\.codex/auth\.json'
    HAS_DISCOVERY=$(echo "$THIS_TURN_RAW" | grep -cE "$DISCOVERY_RE" 2>/dev/null)
    HAS_DISCOVERY=${HAS_DISCOVERY:-0}
    # 2026-05-27 expanded NEGATIVE indicators(retrospective / documentation / canonical-describe contexts):
    # 增加 markers that signal「描述 canonical / retrospective 紀念 anchor」not「啟 codex collab」。
    # Per AI-self-audit-unreliable canonical:擴 negative-list 不 loosen positive,品質保留。
    RETRACT_TRANSPORT_RE='(撤回 codex|改用 cloud|Explore 替身|未走 Step 0\.4|未跑 discovery|codex 通道斷|0 codex collab|沒要啟 codex|沒啟 codex|本 turn 純|純 git|純 verify|純文字|歷史 codex|cite previous|cite prior|引用 prior|描述 prior|無 codex (invocation|意圖|collab)|本 turn 無 codex|retrospective (anchor|reference|mention)|錨例|錨點|為例|是 supplementary|是 retrospective|documenting (canonical|skill)|skill 描述|skill 文檔|本輪 reply 提及.*是 retrospective|describing canonical|describe.*M31|M31.*真意|是 documentation|是 skill workflow 描述)'
    HAS_RETRACT_TRANSPORT=$(echo "$LAST_ASSISTANT" | grep -cE "$RETRACT_TRANSPORT_RE" 2>/dev/null)
    HAS_RETRACT_TRANSPORT=${HAS_RETRACT_TRANSPORT:-0}
    if [ "$HAS_DISCOVERY" -eq 0 ] && [ "$HAS_RETRACT_TRANSPORT" -eq 0 ]; then
      WARNINGS="${WARNINGS}\n  • Codex transport discovery 未跑(SKILL.md Step 0.4):本 turn 含 codex collab 意圖但無 \`node_modules/.bin/codex\` discovery cmd。下輪先跑 3-test 確認 transport,禁憑印象選 cloud / Explore 替身。詳 memory/feedback_codex_local_transport_node_modules.md。"
      CRITICAL_CODEX_TRANSPORT=1
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
# TODO: When `.claude/logs/self-audit-baseline-counts.jsonl` 累積 ≥ 100 samples,
# 改 dynamic threshold = baseline mean + 2σ(對齊 Datadog Watchdog 哲學)。
# Baseline capture mechanism 在本檔結尾(每 turn 寫 trigger/topic count
# 不論 fire 與否,讓 future analysis 有 ground truth distribution)。
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract user message texts from transcript(縮 500→200,只看最近 turns)
  USER_MSGS=$(tail -200 "$TRANSCRIPT_PATH" 2>/dev/null | \
    jq -r 'select(.message.role=="user") | .message.content // empty | if type=="string" then . else (.[]? | .text // empty) end' 2>/dev/null)

  # Detect M13/M19-style trigger phrases repeated across turns
  TRIGGER_RE='(確保|永遠|不留待辦|不能漂移|沒例外|ensure|always|never|world-class|世界級)'
  TRIGGER_COUNT=$(echo "$USER_MSGS" | grep -ciE "$TRIGGER_RE" 2>/dev/null)
  TRIGGER_COUNT=${TRIGGER_COUNT:-0}

  if [ "$TRIGGER_COUNT" -ge 5 ]; then
    WARNINGS="${WARNINGS}\n  • User trigger-phrase 累計 ${TRIGGER_COUNT} 次(M19 strong signal)。確認 /ensure-canonical 5-layer 全做完;若有任一 layer skip = 違反 M19。"
  fi

  # Same-topic repetition(quick keyword overlap heuristic)
  TOPIC_KEYWORDS=$(echo "$USER_MSGS" | tr -s '[:space:]' '\n' | \
    grep -iE '^(audit|prune|principles|trait|canonical|hook|skill|world-class|infra)$' | \
    sort | uniq -c | sort -rn | head -3)
  TOP_COUNT=$(echo "$TOPIC_KEYWORDS" | head -1 | awk '{print $1}')

  if [ -n "$TOP_COUNT" ] && [ "$TOP_COUNT" -gt 10 ]; then
    TOP_TOPIC=$(echo "$TOPIC_KEYWORDS" | head -1 | awk '{print $2}')
    WARNINGS="${WARNINGS}\n  • Topic「${TOP_TOPIC}」repeated ${TOP_COUNT}x — likely user 第 N 次提示同主題,可能 prior turns 落地不徹底。"
  fi

  # ── Mechanism 4: M33 stop-hook overfire reflex detection(2026-05-13 ship)──
  #
  # M33 canonical(meta-patterns.md):AI 對連續 stop hook BLOCKER 自動 conservative-defer
  # 「下個 session」「context budget」「省工」反 pattern。Detect 雙條件:
  #   (a) Last assistant reply 含 defer keyword
  #   (b) Recent user msgs 含 push-back keyword(user 反覆催做完)
  # 兩條件成立 → WARN「revert next-session framing,continue work or be specific about prereq deliverable」
  # 2026-05-13 codex Q12 fix:dedup 重複「下個 session」+ expand variants(下一個 / 下一輪 / 下次 / 下個工作 session / context 不夠 / token budget / 省 token 等)。
  DEFER_RE='(下個 session|下次 session|下一個 session|下個工作 session|下一輪|context budget|context 不夠|上下文不夠|token budget|省 token|省工|next session|defer|留下次|留下個)'
  PUSHBACK_RE='(沒理由不做|繼續做下去|全部做完|繼續全部做完|馬不停蹄|繼續做不要停|繼續|做完|沒擔憂|沒原因)'
  if [ -n "$LAST_ASSISTANT" ] && [ -n "$USER_MSGS" ]; then
    HAS_DEFER=$(echo "$LAST_ASSISTANT" | grep -cE "$DEFER_RE" 2>/dev/null)
    HAS_DEFER=${HAS_DEFER:-0}
    HAS_PUSHBACK=$(echo "$USER_MSGS" | grep -cE "$PUSHBACK_RE" 2>/dev/null)
    HAS_PUSHBACK=${HAS_PUSHBACK:-0}
    if [ "$HAS_DEFER" -gt 0 ] && [ "$HAS_PUSHBACK" -gt 0 ]; then
      WARNINGS="${WARNINGS}\n  • M33 stop-hook overfire reflex:你 reply 含 defer keyword(${HAS_DEFER}x)且 user 已 push-back(${HAS_PUSHBACK}x「沒理由不做/繼續/做完」)。**真理由必具體 deliverable**(prereq 缺什麼 / 真技術 dead-end);否則 revert「下個 session」framing,撤回 claim + continue work。per meta-patterns.md M33。"
    fi
  fi

  # ── Baseline capture(每 turn always log trigger/topic counts,不論 fire)
  # 為 future dynamic threshold(mean + 2σ)累積 ground truth distribution。
  BASELINE_FILE="$PROJECT_DIR/.claude/logs/self-audit-baseline-counts.jsonl"
  mkdir -p "$(dirname "$BASELINE_FILE")" 2>/dev/null
  printf '{"ts":"%s","trigger":%d,"topic":%d,"fired":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "${TRIGGER_COUNT:-0}" \
    "${TOP_COUNT:-0}" \
    "$([ -n "$WARNINGS" ] && echo true || echo false)" \
    >> "$BASELINE_FILE" 2>/dev/null || true
fi

# Silent if nothing
[ -z "$WARNINGS" ] && exit 0

# Dedup(2026-05-01):若同樣 warning content 已連續寫 ≥ 5 次 entry,skip 本次
# 寫入 — 對齊 Bugsnag occurrence count = 5 哲學:同 warning fired ≥ 5 次仍沒解
# = 該 user 主動處理,inject 第 6 次仍無效。避免 inject 一直 echo 老 warning。
if [ -f "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" ]; then
  WARN_HASH=$(printf '%b' "$WARNINGS" | shasum -a 256 2>/dev/null | cut -c1-16)
  RECENT_HASHES=$(tail -5 "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" 2>/dev/null | \
    jq -r '.warnings // empty' 2>/dev/null | \
    while IFS= read -r w; do printf '%s' "$w" | shasum -a 256 2>/dev/null | cut -c1-16; done)
  DEDUP_COUNT=$(echo "$RECENT_HASHES" | grep "^${WARN_HASH}$" 2>/dev/null | wc -l | tr -d ' ')
  DEDUP_COUNT=${DEDUP_COUNT:-0}
  if [ "$DEDUP_COUNT" -ge 5 ]; then
    exit 0
  fi
fi

# 永遠 log warnings(下 turn 透過 inject_pending_self_audit 看到)
mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null
printf '{"ts":"%s","warnings":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
  >> "$PROJECT_DIR/.claude/logs/self-audit-warnings.jsonl" 2>/dev/null || true

# ── BLOCKER upgrade(2026-04-30):Mechanism 1 claim-verify gap 升 block ──
# Anthropic Stop hook 接受 stdout JSON `{"decision":"block","reason":...}` 強制 turn
# 不結束,AI 必先處理 reason 再能完成。這修補 100+ 次重複 failure:AI claim done →
# 下 turn user 才發現未修 → 我重發現 → 補修。
#
# 防 infinite loop:同一 claim hash 已 block 過 1 次 → 該 turn 不再 block(降 warn)。
# 假設同一 claim hash:assistant text 末 200 char 的 sha256 prefix。
if [ "${CRITICAL_CLAIM_VERIFY:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  CLAIM_HASH=$(echo "$LAST_ASSISTANT" | tail -c 200 | shasum -a 256 | cut -c1-16)
  LAST_BLOCKED_FILE="$PROJECT_DIR/.claude/logs/.last-blocked-claim.txt"
  LAST_BLOCKED=""
  [ -f "$LAST_BLOCKED_FILE" ] && LAST_BLOCKED=$(cat "$LAST_BLOCKED_FILE" 2>/dev/null || echo "")

  if [ "$CLAIM_HASH" != "$LAST_BLOCKED" ]; then
    # 第一次 block,記 hash 防 loop
    echo "$CLAIM_HASH" > "$LAST_BLOCKED_FILE" 2>/dev/null || true
    REASON=$(printf '%s' \
      "🚨 CLAIM-VERIFY GAP BLOCKER:你 claim「verified / done / 完成」但本 turn 沒跑 tsc / test / audit / visual 真驗證。立刻 (a) 跑 npx tsc -b + 對應驗證指令,OR (b) 在本 turn 明確撤回 claim(打「撤回 claim」/「未驗證」)。否則 turn 不結束。" \
      "本機制 = M20 100+ 次 failure mode 升 BLOCKER(原 silent inject → block)。")
    # Anthropic Stop hook decision:block 格式
    printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | jq -Rs .)"
    exit 0
  fi
fi

# ── BLOCKER for Mechanism 4 codex-design-no-approval(2026-05-09 user-authorized + escalated)──
if [ "${CRITICAL_CODEX_DESIGN_NO_APPROVAL:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  DESIGN_HASH=$(echo "$LAST_ASSISTANT" | tail -c 200 | shasum -a 256 | cut -c1-16)
  LAST_BLOCKED_DESIGN_FILE="$PROJECT_DIR/.claude/logs/.last-blocked-design.txt"
  LAST_BLOCKED_DESIGN=""
  [ -f "$LAST_BLOCKED_DESIGN_FILE" ] && LAST_BLOCKED_DESIGN=$(cat "$LAST_BLOCKED_DESIGN_FILE" 2>/dev/null || echo "")
  if [ "$DESIGN_HASH" != "$LAST_BLOCKED_DESIGN" ]; then
    echo "$DESIGN_HASH" > "$LAST_BLOCKED_DESIGN_FILE" 2>/dev/null || true
    REASON=$(printf '%s' \
      "🚨 CODEX-DESIGN-NO-APPROVAL BLOCKER(M4 sub-check):本 turn 讀 codex reply + Edit/Write packages/design-system/src 但近 5 條 user message 無 approval keyword。設計決策 substantive change 需 user 拍板才 ship(CLAUDE.md 稽核 canonical Audit-vs-execute 分權)。立刻(a)撤回 ship + revert commit,OR(b)在本 turn 明引 user verbatim approval quote。否則 turn 不結束。" \
      "本機制 = workflow violation 升級為 mechanical BLOCKER(2026-05-09 user-authorized,起因 commit 698ff58 v15.16 ship 沒拍板)。")
    printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | jq -Rs .)"
    exit 0
  fi
fi

# ── BLOCKER for Mechanism 4 codex-verify gap(2026-05-09 user-authorized)──
# 升級邏輯同 Mechanism 1:第一次 block 阻 turn,降 warn for 同 hash 防 loop
if [ "${CRITICAL_CODEX_VERIFY:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  CODEX_HASH=$(echo "$LAST_ASSISTANT" | tail -c 200 | shasum -a 256 | cut -c1-16)
  LAST_BLOCKED_CODEX_FILE="$PROJECT_DIR/.claude/logs/.last-blocked-codex.txt"
  LAST_BLOCKED_CODEX=""
  [ -f "$LAST_BLOCKED_CODEX_FILE" ] && LAST_BLOCKED_CODEX=$(cat "$LAST_BLOCKED_CODEX_FILE" 2>/dev/null || echo "")

  if [ "$CODEX_HASH" != "$LAST_BLOCKED_CODEX" ]; then
    echo "$CODEX_HASH" > "$LAST_BLOCKED_CODEX_FILE" 2>/dev/null || true
    REASON=$(printf '%s' \
      "🚨 CODEX-VERIFY GAP BLOCKER(M4):本 turn 讀 codex reply 但無走 Step 4.5(grep cite verify)/ 4.6(regression scan)/ 5(own-version 比稿)。立刻(a) Bash grep 對 codex 引用 file:line verify,OR(b) 跑 tsc / hook tests regression,OR(c) 在本 turn 明寫「撤回採納 codex」/「未採納」。否則 turn 不結束。" \
      "本機制 = feedback_codex_dual_track_synthesizer.md markdown rule 升 mechanical BLOCKER(2026-05-09 user-authorized)。")
    printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | jq -Rs .)"
    exit 0
  fi
fi

# ── BLOCKER for Mechanism 5 codex-transport-discovery(2026-05-17 user-authorized)──
if [ "${CRITICAL_CODEX_TRANSPORT:-0}" = "1" ] && [ -n "$LAST_ASSISTANT" ]; then
  TRANSPORT_HASH=$(echo "$LAST_ASSISTANT" | tail -c 200 | shasum -a 256 | cut -c1-16)
  LAST_BLOCKED_TRANSPORT_FILE="$PROJECT_DIR/.claude/logs/.last-blocked-transport.txt"
  LAST_BLOCKED_TRANSPORT=""
  [ -f "$LAST_BLOCKED_TRANSPORT_FILE" ] && LAST_BLOCKED_TRANSPORT=$(cat "$LAST_BLOCKED_TRANSPORT_FILE" 2>/dev/null || echo "")
  if [ "$TRANSPORT_HASH" != "$LAST_BLOCKED_TRANSPORT" ]; then
    echo "$TRANSPORT_HASH" > "$LAST_BLOCKED_TRANSPORT_FILE" 2>/dev/null || true
    REASON=$(printf '%s' \
      "🚨 CODEX-TRANSPORT-DISCOVERY BLOCKER(M5):本 turn 含 codex collab 意圖但無 \`node_modules/.bin/codex\` discovery cmd trace。SKILL.md Step 0.4 強制 3-test discovery(local CLI / global / auth.json)在啟 codex 前。立刻 (a) 跑 \`ls -la node_modules/.bin/codex && node_modules/.bin/codex --version\` 確認 local CLI,OR (b) 明寫「撤回 codex / 改用 cloud / Explore 替身」+ 解釋為何不走 local。否則 turn 不結束。" \
      "本機制 = 防 2026-05-17 失憶 anti-pattern(嘗試 sudo install / 繞 M28 開 PR / Explore 替身),user-authorized markdown SKILL.md L42-58 升 mechanical BLOCKER。")
    printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$REASON" | jq -Rs .)"
    exit 0
  fi
fi

exit 0
