#!/bin/bash
# PostToolUse hook: validate `/design-system-audit` final report quality.
# 2026-05-17 ship — codex Q4 verdict「post-audit stop hook / final report validator」最合理 trigger 位置。
#
# Triggers: 任何 Write/Edit 到 `audit-report-*.json` report artifact OR `governance/memory/project_audit_progress.md`
#           OR `*/C1-final-report*.md`(2026-07-14 加:C.1 決策清單真實載體,原 scope 漏 = Validator H/K 永不 fire)
# Runtime diagnostics 只寫 `governance_runtime_state_dir` 解析的 `$GOVERNANCE_STATE_DIR`
# (Git-owned `<git-dir>/governance-runtime/`,trusted telemetry opt-in only)。Generated provider homes 不是 authority。
#
# 驗證:
#   (a) NO-SAMPLE invariant — report 不含「sample top N / subset / pick top X」keyword
#   (b) matrix-derived full dispatch — report 應列齊當前 dim coverage 紀錄(或明示 N/A 跳過理由)
#   (c) audit-prompts.md coverage — 若 missing dim prompt → flag prune-chain-trigger
#   (d) `@benchmark-unverified-blanket` count drift — vs last audit baseline
#   (e) deep final report 必須記錄 same-run knowledge-prune + governance-coverage receipt;
#       progress artifact 缺 receipt 才 emit recovery context 進下一 turn
#
# 對應 SKILL.md `/design-system-audit` Phase 4.5 機械化 trigger(2026-05-17 加)。

HOOK_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || {
  printf 'GOVERNANCE_INTEGRITY: audit validator hook directory is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/lib/_hook_integrity.sh" 2>/dev/null || {
  printf 'GOVERNANCE_INTEGRITY: canonical hook integrity helper is unavailable\n' >&2
  exit 70
}
source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire
source "$HOOK_DIR/lib/_provider_paths.sh" 2>/dev/null || {
  governance_hook_integrity_fail 'audit validator canonical provider resolver is unavailable'
}

set -uo pipefail

governance_hook_load_input
governance_hook_require_commands grep jq node sort wc tr awk
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""') \
  || governance_hook_integrity_fail 'audit validator tool name could not be decoded'
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""') \
  || governance_hook_integrity_fail 'audit validator file path could not be decoded'

# Only fire on audit report writes. Final reports fail closed; the progress memory
# remains a recovery surface because it can be written before the run is complete.
IS_FINAL_REPORT=0
case "$FILE_PATH" in
  */audit-report-*.json) IS_FINAL_REPORT=1 ;;
  */project_audit_progress.md) ;;
  */C1-final-report*.md) IS_FINAL_REPORT=1 ;;
  *) exit 0 ;;
esac

case "$TOOL" in Write|Edit|MultiEdit) ;; *) exit 0 ;; esac

PROJECT_DIR="${GOVERNANCE_PROJECT_DIR:-$(pwd)}"
[ -f "$FILE_PATH" ] || exit 0
CANONICAL_SKILL_ROOT="$(governance_canonical_root skills 2>/dev/null)" || {
  governance_hook_integrity_fail 'audit validator canonical skill root is unavailable'
}
PEER_PROVIDER="${GOVERNANCE_PEER_PROVIDER:-}"
PEER_DISPLAY_NAME="${GOVERNANCE_PEER_DISPLAY_NAME:-$PEER_PROVIDER}"

WARNINGS=""
TRIGGER_PRUNE=0
CRITICAL_FAIL=0
AUDIT_MATRIX="$PROJECT_DIR/generated/governance/audit-coverage-matrix.json"

# Independent review is an explicit task/deliverable requirement,not a universal
# audit tax. A real UI/UX SSOT decision still requires the four-element review
# unless the user explicitly waived second opinion for this run.
_HAS_DECISION_ITEMS=0
if grep -qE '待你拍板|拍板清單' "$FILE_PATH" 2>/dev/null; then
  _DECISION_SEG=$(awk '/待你拍板|拍板清單/{found=1} found' "$FILE_PATH" 2>/dev/null)
  if printf '%s\n' "$_DECISION_SEG" | grep -qE '^[[:space:]]*([0-9]+[.、)]|##+ *決策)'; then
    _HAS_DECISION_ITEMS=1
  fi
fi

REVIEW_WAIVED=0
REVIEW_NOT_REQUIRED=0
REVIEW_CLAIMED=0
grep -qiE 'second[ -]opinion[[:space:]]*[:：][[:space:]]*(waived by (the )?user|user[- ]waived)|independent review[[:space:]]*[:：][[:space:]]*waived by (the )?user|第二意見.*(使用者|user).*(豁免|免除|不需要)|(使用者|user).*(豁免|免除).*第二意見' "$FILE_PATH" 2>/dev/null && REVIEW_WAIVED=1
grep -qiE 'second[ -]opinion[[:space:]]*[:：][[:space:]]*not required by (the )?(task|deliverable)|independent review[[:space:]]*[:：][[:space:]]*not required by (the )?(task|deliverable)|第二意見.*(任務|交付).*(未要求|不需要)' "$FILE_PATH" 2>/dev/null && REVIEW_NOT_REQUIRED=1
grep -qiE 'second[ -]opinion[[:space:]]*[:：][[:space:]]*(required|complete|completed|pass|done)|independent review[[:space:]]*[:：][[:space:]]*(required|complete|completed|pass|done)|peer review[[:space:]]*[:：][[:space:]]*(required|complete|completed|pass|done)|第二意見.*(必須|要求|已完成|已執行)|獨立審查.*(必須|要求|已完成|已執行)' "$FILE_PATH" 2>/dev/null && REVIEW_CLAIMED=1

if [ "$REVIEW_WAIVED" -eq 1 ]; then
  REVIEW_MODE=waived
elif [ "$_HAS_DECISION_ITEMS" -eq 1 ] || [ "$REVIEW_CLAIMED" -eq 1 ]; then
  REVIEW_MODE=required
elif [ "$REVIEW_NOT_REQUIRED" -eq 1 ]; then
  REVIEW_MODE=not-required
else
  REVIEW_MODE=unspecified
fi

# Report prose is a receipt, never waiver authority. The only valid waiver is
# the exact one-run selection frozen in the current immutable manifest. Reusing
# the canonical verifier also closes pointer digest, current HEAD/tree/index,
# provider binding, evidence-tree, and one-provider coverage in one readback.
if [ "$REVIEW_MODE" = waived ]; then
  WAIVER_PROOF=""
  if [ -f "$PROJECT_DIR/scripts/verify-deep-audit-coverage.mjs" ]; then
    WAIVER_PROOF=$(node "$PROJECT_DIR/scripts/verify-deep-audit-coverage.mjs" \
      --repo-root "$PROJECT_DIR" --json 2>/dev/null || true)
  fi
  if ! printf '%s' "$WAIVER_PROOF" | jq -e '
    .evidenceKind == "deep-audit-coverage-verification"
    and .secondOpinion == "waived-by-user"
    and (.providers.self | type == "string" and length > 0)
    and .providers.peer == null
  ' >/dev/null 2>&1; then
    WARNINGS="${WARNINGS}\n  🔴 [R] Report 文字不是 second-opinion waiver authority：目前 active immutable run 無可驗證的 exact user waiver／current binding／single-provider coverage。"
    CRITICAL_FAIL=1
  fi
fi

if [ "$REVIEW_MODE" = required ]; then
  if ! printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$'; then
    WARNINGS="${WARNINGS}\n  🔴 [R] Independent review 已被 report 要求／使用，但無 registry-resolved peer provider context。補齊可驗證的 peer 執行與回執，或記錄 user 明確豁免。"
    CRITICAL_FAIL=1
  fi
fi

# ─ Validator A: NO-SAMPLE ─────────────────────────────────────────────────
if grep -qE 'sample top [0-9]+|sampled top|subset|pick top [0-9]+|top hot|sampled components' "$FILE_PATH" 2>/dev/null; then
  WARNINGS="${WARNINGS}\n  ❌ [A] NO-SAMPLE violation:report 含 sample subset keyword,違反 audit-full-sweep canonical(memory/feedback_audit_full_sweep_not_sample.md)"
fi

# ─ Validator B: dim coverage(2026-05-30 M2/M3 fix per laziness-hunt:原 regex `5[01]` 只到 dim 51,
#   52-88 完全不計（含 PURE-JUDGMENT dim 62/66/68/72）+ 寫死 46。改動態讀 dispatch total + count UNIQUE dim 號）─
DIM_TOTAL=$(
  node -- "$HOOK_DIR/lib/audit-report-validator.mjs" \
    expected-dimensions "$AUDIT_MATRIX" 2>/dev/null || echo 91
)
# Counts English `dim N` and Chinese `維度 N` alike. A Chinese-only report used to score 0 unique
# dimensions, which silently disabled every dim-gated validator below — including M.
DIM_COUNT=$(
  {
    grep -oiE '\bdim[[:space:]]+[0-9]{1,2}\b' "$FILE_PATH" 2>/dev/null
    grep -oE '維度[[:space:]]*[0-9]{1,2}' "$FILE_PATH" 2>/dev/null
  } | grep -oE '[0-9]+' | sort -un | wc -l | tr -d ' '
)
DIM_COUNT=${DIM_COUNT:-0}
if [ "$DIM_COUNT" -lt "$DIM_TOTAL" ]; then
  WARNINGS="${WARNINGS}\n  ⚠️ [B] Dim coverage:report 提到 ${DIM_COUNT} unique dim,< ${DIM_TOTAL} 期望。確認全 dim NO-SAMPLE（PURE-JUDGMENT/requiresAgent dim 必有 per-dim agent-output 非散文提號）"
fi

# ─ Validator C: audit-prompts.md coverage ─────────────────────────────────
AUDIT_PROMPTS="$CANONICAL_SKILL_ROOT/design-system-audit/references/audit-prompts.md"
if [ -f "$AUDIT_PROMPTS" ]; then
  # 2026-05-30 M3 fix:原 regex `^### Dim N` 對不上實際格式 `## N. Title`（grep 0 → 永遠誤觸 prune）;
  # 寫死 46 也錯。改成數真實 `## N.` heading + 動態判「PURE-JUDGMENT dim 數」（只有 judgment dim 需 prompt
  # 才能派 agent;deterministic/hook dim 不需）。prompts < judgment dim = 有 judgment dim 派不出 agent。
  # 2026-05-30 fix(hook-test surfaced):`grep -c ... || echo 0` 在 0-match 時 grep 已印 "0" + exit 1,
  # `|| echo 0` 再 append → "0\n0" → 下方 `[ -lt ]` integer error → trigger 失效。改 `|| true` + 取首行。
  # 2026-05-31 fix(infra-audit self-finding):原 `[53 -lt 23]` 是 count-vs-count = 永遠 false = dead gate。
  # 改 SET-MEMBERSHIP:逐個 PURE-JUDGMENT dim 號檢查 audit-prompts.md 有無對應 `## N.` heading,列出缺的。
  MISSING_PROMPTS=$(
    node -- "$HOOK_DIR/lib/audit-report-validator.mjs" \
      missing-judgment-prompts "$AUDIT_MATRIX" "$AUDIT_PROMPTS" 2>/dev/null || echo ""
  )
  if [ -n "$MISSING_PROMPTS" ]; then
    WARNINGS="${WARNINGS}\n  🔴 [C] audit-prompts.md 缺 judgment dim prompt:dim ${MISSING_PROMPTS} 是 PURE-JUDGMENT 卻無 \`## N.\` rubric → sub-agent 派不出正確 prompt → 必被跳過。補這些 dim 的 prompt 進 audit-prompts.md。"
    TRIGGER_PRUNE=1; CRITICAL_FAIL=1
  fi
fi

# ─ Validator D: @benchmark-unverified-blanket count drift ─────────────────
BENCH_DEBT=$(grep -rc '@benchmark-unverified-blanket' "$PROJECT_DIR/packages/design-system/src/" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
BENCH_DEBT=${BENCH_DEBT:-0}
if [ "$BENCH_DEBT" -gt 0 ]; then
  WARNINGS="${WARNINGS}\n  ⚠️ [D] Benchmark cite debt:${BENCH_DEBT} 處「@benchmark-unverified-blanket」marker — 對應 prune D9(M22 cite debt)"
  TRIGGER_PRUNE=1
fi

# ─ Validator F: A.1b story-vs-code adversarial pass recorded(2026-05-30 403-finding 偷懶 anchor)─
#   deep-audit report 必含「每 component 讀 .tsx 逐句比對宣稱」的 story-vs-code verdict。缺 = 該 pass
#   沒跑/沒記 = 前期偷懶 failure mode。偵測 report 是否含 story-vs-code 證據 keyword;deep-audit 規模
#   report(提 ≥ 10 dim)卻無此 pass = BLOCKER-class warning(走 prune-chain inject 提醒補跑)。
if [ "$DIM_COUNT" -ge 10 ]; then   # 只對 full/deep-audit 規模 report 要求(小 scoped report 豁免)
  if ! grep -qiE 'story-vs-code|FALSE_CLAIM|claimsVerified|宣稱.*(真實|code)|A\.1b|逐句比對' "$FILE_PATH" 2>/dev/null; then
    WARNINGS="${WARNINGS}\n  🔴 [F] Story-vs-code adversarial pass 缺席:deep-audit report(${DIM_COUNT} dim)無 A.1b per-component story-vs-code verdict 證據。202 FALSE_CLAIM(2026-05-30)正是此 pass 沒跑 → 補跑 A.1b(讀每元件 .tsx + wrap lib 逐句驗 anatomy/a11y/spec 宣稱)再出 report。"
    TRIGGER_PRUNE=1; CRITICAL_FAIL=1
  fi

  # ─ Validator G: 全 PURE-JUDGMENT dim(含 infra 62/66/68/72)必 show「真跑」證據,非只 mention(2026-05-30 generalize)─
  #   user 質問「包括所有 infra 稽核?」→ Validator F 只硬保證 story 子集;G 推及全 judgment set。
  #   judgment dim 無 deterministic script / hook,只能靠「report 含 per-dim 真跑證據」當 proxy。
  #   evidence marker = 「files scanned / DS-wide 全N / file:line cite / 0 findings after 全掃」。
  #   evidence 數 < PURE-JUDGMENT dim 數 → 部分 judgment dim 可能 mention-only(偷懶 risk)。
  PJ_COUNT=$(
    node -- "$HOOK_DIR/lib/audit-report-validator.mjs" \
      pure-judgment-count "$AUDIT_MATRIX" 2>/dev/null || echo 23
  )
  EVIDENCE_COUNT=$(grep -oiE 'files? scanned|DS-wide|全 ?[0-9]+ (file|stories|component|spec)|[a-z0-9_.-]+\.(tsx|ts|md):[0-9]+|0 findings|scanned: ?[0-9]+' "$FILE_PATH" 2>/dev/null | wc -l | tr -d ' ')
  EVIDENCE_COUNT=${EVIDENCE_COUNT:-0}
  if [ "$EVIDENCE_COUNT" -lt "$PJ_COUNT" ]; then
    WARNINGS="${WARNINGS}\n  🔴 [G] PURE-JUDGMENT dim 真跑證據不足:report 只 ${EVIDENCE_COUNT} 個 per-dim 證據 marker < ${PJ_COUNT} judgment dim(含 infra 62/66/68/72)。judgment dim 無 script/hook 兜底,必每 dim show『DS-wide N files scanned + file:line / 0-after-全掃』證據,否則=mention-only 偷懶。補齊再出 report。"
    TRIGGER_PRUNE=1; CRITICAL_FAIL=1
  fi

  # ─ Validator I: D3/D4/D5 domain-skill chain invocation evidence(2026-07-04 solo-run 偏差 anchor:
  #   稽核 canonical 6-維度表 D3→/performance-audit、D4→/ux-audit、D5→/visual-audit,但歷次 deep run
  #   performance-audit 0 次 invoke = chain 缺席沒任何機械閘抓。deep-scale report 必含三 skill 名
  #   (= 有 chain 或有明寫 N/A 豁免理由;mention 缺席即偷懶 risk)─
  _D345_MISSING=""
  for _sk in performance-audit ux-audit visual-audit; do
    grep -q "$_sk" "$FILE_PATH" 2>/dev/null || _D345_MISSING="${_D345_MISSING} ${_sk}"
  done
  if [ -n "$_D345_MISSING" ]; then
    WARNINGS="${WARNINGS}\n  🔴 [I] D3/D4/D5 domain-skill chain 證據缺席:report 未提及${_D345_MISSING}。shared 稽核 canonical 6-維度表的 deep 規模必 chain 三 domain skill(或明寫豁免理由 + skill 名)。補跑/補記再出 report。"
    TRIGGER_PRUNE=1; CRITICAL_FAIL=1
  fi

  # ─ Validator J: independent-peer dim 覆蓋對帳─
  #   report 顯示 Phase B / peer 比稿有跑 → 必含「dim 覆蓋對帳」表(彙總 peer 各 brief 蓋到的
  #   dim 號 vs dispatch 清單逐號對;SKILL B.2 Step 0 契約的報告端機械閘 — 保證鏈第三段)。
  _PEER_RUN=0
  grep -qiE '(Phase B|peer 比稿|獨立審查|cite battle|dual-track).*(complete|completed|pass|done|完成|已跑|已執行|通過)|second[ -]opinion[[:space:]]*[:：][[:space:]]*(complete|completed|pass|done)' "$FILE_PATH" 2>/dev/null && _PEER_RUN=1
  if [ "$REVIEW_MODE" = required ] && printf '%s' "$PEER_PROVIDER" | grep -qE '^[a-z][a-z0-9-]*$'; then
    grep -qiF "$PEER_PROVIDER" "$FILE_PATH" 2>/dev/null && _PEER_RUN=1
    [ -n "$PEER_DISPLAY_NAME" ] && grep -qiF "$PEER_DISPLAY_NAME" "$FILE_PATH" 2>/dev/null && _PEER_RUN=1
  fi
  if [ "$_PEER_RUN" -eq 1 ]; then
    if ! grep -qiE 'dim 覆蓋對帳|dim 對帳|coverage tally' "$FILE_PATH" 2>/dev/null; then
      WARNINGS="${WARNINGS}\n  🔴 [J] Peer dim 覆蓋對帳缺席:report 提及 Phase B/比稿但無「dim 覆蓋對帳」表(${PEER_DISPLAY_NAME} 各 brief 蓋到的 dim 號 vs dispatch 清單逐號對,缺號 = 補 brief)。per SKILL B.2 Step 0(2026-07-10),不齊不得宣稱雙軌全覆蓋。"
      TRIGGER_PRUNE=1; CRITICAL_FAIL=1
    fi
  fi
fi

# ─ Validator H: 拍板清單 SSOT-理由 強制(2026-06-11 user 第 3 次糾正「要我拍板的都是 SSOT 的 UI/UX 嗎」)─
# 報告含「待你拍板」/「拍板清單」區塊時:區塊內每個編號題必含「SSOT 理由」字樣;
# 題數 > SSOT-理由數 = 有題目沒標理由 = 混入非 SSOT 項 → BLOCK。
if grep -qE '待你拍板|拍板清單' "$FILE_PATH" 2>/dev/null; then
  _BLOCK_SEG=$(awk '/待你拍板|拍板清單/{found=1} found' "$FILE_PATH" 2>/dev/null)
  _Q_COUNT=$(echo "$_BLOCK_SEG" | grep -cE '^[[:space:]]*([0-9]+[.、)]|##+ *決策)' || true)
  _R_COUNT=$(echo "$_BLOCK_SEG" | grep -c 'SSOT 理由' || true)
  if [ "${_Q_COUNT:-0}" -gt "${_R_COUNT:-0}" ]; then
    CRITICAL_FAIL=1
    WARNINGS="${WARNINGS}\n  • Validator H:拍板清單 ${_Q_COUNT} 題但僅 ${_R_COUNT} 題標「SSOT 理由」— 寫不出理由的題 = 非 SSOT,移回 AUTO 自己做,不問 user。"
  fi
fi

# ─ Validator K: 決策品質四要件(2026-07-13 user verbatim「需我拍板的議題,不是應該確保你和 codex 來回
#   討論辯論出來的共識與解法有研究過世界級的設計且符合我們需求與一致設計語言和設計原則並確保 SSOT?
#   現在跟未來都應該要確保這件事永遠成立」;SSOT = deep-audit SKILL C.1「🔒 決策品質四要件」。
#   命名注:SKILL 2026-07-13 初稿寫「Validator I」,但 I 已被 D3/D4/D5 chain(2026-07-04)佔用 → 定 K)─
#   報告含「待你拍板」/「拍板清單」section 時:section 內每個決策 block(切分同 Validator H heading regex)
#   必含全部四要件 marker:(1) SSOT-check(SSOT/既有拍板)(2) ≥3 世界級 cite(世界級/URL)
#   (3) registry-resolved independent-peer verdict(4) design-fit(設計語言/設計原則/design-fit)。缺任一 → 該題不成熟
#   → BLOCK(exit 2)。Detection conservative:只掃本 hook file scope(audit report / C1-final-report)
#   的拍板 section;無決策 block(「無待拍板」)= 合法 pass。
if [ "$_HAS_DECISION_ITEMS" -eq 1 ]; then
  _K_MISSING=$(
    node -- "$HOOK_DIR/lib/audit-report-validator.mjs" \
      missing-decision-evidence "$FILE_PATH" "$PEER_PROVIDER" "$PEER_DISPLAY_NAME" "$REVIEW_MODE" \
      2>/dev/null || echo ""
  )
  if [ -n "$_K_MISSING" ]; then
    CRITICAL_FAIL=1
    if [ "$REVIEW_MODE" = required ]; then
      _K_REVIEW_TEXT="(3)${PEER_DISPLAY_NAME:-independent peer} 辯論 verdict(4)"
    else
      _K_REVIEW_TEXT="(3)second opinion 已依 user 豁免並明示記錄(4)"
    fi
    WARNINGS="${WARNINGS}\n  🔴 [K] 決策品質要件不全:${_K_MISSING} — 每個送 user 拍板的決策必含 (1)SSOT-check(先 grep 既有 canonical/已拍板)(2)≥3 世界級 cite(真 source + URL)${_K_REVIEW_TEXT}設計語言/原則 fit。缺 = 該題不成熟,退回研究/辯論(deep-audit SKILL C.1),禁送 user。"
  fi
fi

# ─ Validator L: deep-final same-run closure receipts ─────────────────────────────────────
# Full knowledge prune and governance-home reconciliation are phases of the same
# deep run. A next-turn trigger is recovery only and cannot certify a final report.
SAME_RUN_PRUNE=0
SAME_RUN_GOVERNANCE_COVERAGE=0
grep -qiE '(knowledge[- ]prune).*(same[- ]run|同一(輪|次|run)).*(complete|completed|pass|done|完成|對帳)|same[- ]run.*(knowledge[- ]prune).*(complete|completed|pass|done)|同一(輪|次).*(knowledge[- ]prune).*(完成|對帳)' "$FILE_PATH" 2>/dev/null && SAME_RUN_PRUNE=1
grep -qiE '(governance[- ]coverage|governance-audit-coverage).*(same[- ]run|同一(輪|次|run)).*(complete|completed|pass|done|reconciled|receipt|unobserved|完成|對帳|回執)|same[- ]run.*(governance[- ]coverage|governance-audit-coverage).*(complete|completed|pass|done|reconciled|receipt|unobserved)|同一(輪|次).*(governance[- ]coverage|governance-audit-coverage).*(完成|對帳|回執|UNOBSERVED)' "$FILE_PATH" 2>/dev/null && SAME_RUN_GOVERNANCE_COVERAGE=1

if [ "${DIM_COUNT:-0}" -ge 10 ]; then
  if [ "$IS_FINAL_REPORT" -eq 1 ]; then
    if [ "$REVIEW_MODE" = unspecified ]; then
      WARNINGS="${WARNINGS}\n  🔴 [L] Second-opinion receipt 缺席:deep final report 必須明記 『second opinion: waived by user』、『second opinion: not required by task』或可驗證的 required/completed peer review。"
      CRITICAL_FAIL=1
    fi
    if [ "$SAME_RUN_PRUNE" -ne 1 ]; then
      WARNINGS="${WARNINGS}\n  🔴 [L] Same-run knowledge-prune receipt 缺席:deep final report 不得把 full prune 留到 next turn。完成後明記『knowledge-prune: same-run complete』。"
      CRITICAL_FAIL=1
    fi
    if [ "$SAME_RUN_GOVERNANCE_COVERAGE" -ne 1 ]; then
      WARNINGS="${WARNINGS}\n  🔴 [L] Same-run governance coverage receipt 缺席:必須逐 row 對帳 governance-audit-coverage.md，無法觀測的 home 標 UNOBSERVED，並明記『governance-coverage: same-run reconciled』。"
      CRITICAL_FAIL=1
    fi
  elif [ "$SAME_RUN_PRUNE" -ne 1 ] || [ "$SAME_RUN_GOVERNANCE_COVERAGE" -ne 1 ]; then
    TRIGGER_PRUNE=1
    WARNINGS="${WARNINGS}\n  • [L] Recovery only:deep progress 尚缺 same-run knowledge-prune / governance-coverage receipt；在 final report 前完成同一輪收斂。"
  fi
fi

# ─ Validator M: coverage verdict truthfulness ────────────────────────────────────────────
# Validator L only proves the three receipt strings are present. A run whose machine verdict is
# coverageStatus=incomplete could therefore ship a final report that reads like a pass, because
# nothing compared the prose against the verifier. That is exactly how the beta.108 Deep Audit was
# recorded as closed while dimensions 64/66 stayed unpassed (2026-08-02). The rule is not "coverage
# must be complete" — closing incomplete is legitimate — it is "an incomplete verdict must be stated
# in the report", so silence can never imply completion.
if [ "${DIM_COUNT:-0}" -ge 10 ] && [ "$IS_FINAL_REPORT" -eq 1 ]; then
  # Two steps, not one pipeline: under `set -o pipefail` a failing verifier makes the whole pipeline
  # non-zero *after* the parser has already printed its own "unknown", so `|| echo unknown` appended a
  # second one and the status read "unknownunknown".
  COVERAGE_JSON=$(node "$PROJECT_DIR/scripts/verify-deep-audit-coverage.mjs" --json 2>/dev/null || true)
  COVERAGE_STATUS=$(
    printf '%s' "$COVERAGE_JSON" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).coverageStatus||"unknown"))}catch{process.stdout.write("unknown")}})' 2>/dev/null
  )
  COVERAGE_STATUS=${COVERAGE_STATUS:-unknown}
  if [ "$COVERAGE_STATUS" != complete ]; then
    # Deliberately narrow phrases. A bare `未通過` substring let a report claim the opposite of the
    # verdict — "全部通過,無未通過項" matched and passed. An admission has to read as an admission.
    if ! grep -qiE 'closed as incomplete|this is not a pass|not a pass;|coverage[[:space:]]*status[^[:alnum:]]{0,4}incomplete|coverageStatus[^[:alnum:]]{0,4}incomplete|未通過結案|結案但未通過|以未通過|未完成覆蓋|[0-9]+[[:space:]]*個?[^[:space:]]{0,4}未通過' "$FILE_PATH" 2>/dev/null; then
      WARNINGS="${WARNINGS}\n  🔴 [M] Coverage verdict 為 '${COVERAGE_STATUS}' 但 final report 未明記未通過:允許以 incomplete 結案,但必須逐字寫出(例如『CLOSED AS INCOMPLETE; THIS IS NOT A PASS』或列出未通過的 dim),不得讓三段回執字串暗示已完成。"
      CRITICAL_FAIL=1
    fi
  fi
fi

# ─ Validator BLOCK gate(2026-05-31 fix infra-audit self-finding:原 hook 只 exit 0 + additionalContext
#   soft-inject = 我過度宣稱「BLOCKER」。改:critical fail → stderr + exit 2 真 block PostToolUse。
#   2026-07-10 user「只有 SSOT UI/UX 才交拍板,要確保」:Validator H 原在本 gate 之後 = CRITICAL_FAIL 白設
#   死旗(hunt finding #62)→ 搬到 gate 前,H 現在真擋)─
if [ "${CRITICAL_FAIL:-0}" -eq 1 ]; then
  printf '🚨 AUDIT-REPORT VALIDATOR BLOCK(C/F/G/H/I/J/K/L/R critical):%b\n\n此 deep-audit report 不合格,補齊上述後重出 report。' "$WARNINGS" >&2
  exit 2
fi

# ─ Validator E: prune-chain-trigger emit ──────────────────────────────────
# Validator L enforces deep-final closure. This trigger is only recovery for a
# progress artifact or another non-critical debt signal; it is never proof that
# the final report already ran knowledge prune.
if [ "$TRIGGER_PRUNE" -eq 1 ] || [ -n "$WARNINGS" ]; then
  if RUNTIME_STATE_DIR="$(governance_runtime_state_dir 2>/dev/null)"; then
    mkdir -p "$RUNTIME_STATE_DIR" 2>/dev/null
    printf '{"ts":"%s","file":"%s","trigger_prune":%d,"warnings":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$FILE_PATH" \
      "$TRIGGER_PRUNE" \
      "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
      >> "$RUNTIME_STATE_DIR/audit-post-report-validator.jsonl" 2>/dev/null || true
  fi

  if [ "$TRIGGER_PRUNE" -eq 1 ]; then
    CTX=$(printf '🚨 audit post-report validator: prune-chain-trigger fire。AI 必 AUTO-RUN /knowledge-prune(禁問 user;品質優先前提 per deep-audit SKILL C.0a；P2E 工程治理自主收斂，只有產品／UI／UX SSOT 真取捨的 P2H 才列拍板清單)。\n%b' "$WARNINGS")
    CONTEXT=$(jq -nc --arg ctx "$CTX" '{
      governanceContext: { hookEventName: "PostToolUse", message: $ctx }
    }') || governance_hook_integrity_fail 'audit validator governance context could not be encoded'
    printf '%s\n' "$CONTEXT"
  fi
fi

exit 0
