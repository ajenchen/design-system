#!/bin/bash
# PostToolUse hook: validate `/design-system-audit` final report quality.
# 2026-05-17 ship — codex Q4 verdict「post-audit stop hook / final report validator」最合理 trigger 位置。
#
# Triggers: 任何 Write/Edit 到 `.claude/logs/audit-report-*.json` OR `.claude/memory/project_audit_progress.md`
#           OR `*/C1-final-report*.md`(2026-07-14 加:C.1 決策清單真實載體,原 scope 漏 = Validator H/K 永不 fire)
#
# 驗證:
#   (a) NO-SAMPLE invariant — report 不含「sample top N / subset / pick top X」keyword
#   (b) 46-dim full dispatch — report 應列 ≥ 46 dim coverage 紀錄(或明示 N/A 跳過理由)
#   (c) audit-prompts.md coverage — 若 missing dim prompt → flag prune-chain-trigger
#   (d) `@benchmark-unverified-blanket` count drift — vs last audit baseline
#   (e) prune-chain-trigger signal → emit additionalContext 進下一 turn,inject_pending_self_audit 吸
#
# 對應 SKILL.md `/design-system-audit` Phase 4.5 機械化 trigger(2026-05-17 加)。

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail

INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

# Only fire on audit report writes
case "$FILE_PATH" in
  */audit-report-*.json) ;;
  */project_audit_progress.md) ;;
  */C1-final-report*.md) ;;
  *) exit 0 ;;
esac

case "$TOOL" in Write|Edit|MultiEdit) ;; *) exit 0 ;; esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -f "$FILE_PATH" ] || exit 0

WARNINGS=""
TRIGGER_PRUNE=0

# ─ Validator A: NO-SAMPLE ─────────────────────────────────────────────────
if grep -qE 'sample top [0-9]+|sampled top|subset|pick top [0-9]+|top hot|sampled components' "$FILE_PATH" 2>/dev/null; then
  WARNINGS="${WARNINGS}\n  ❌ [A] NO-SAMPLE violation:report 含 sample subset keyword,違反 audit-full-sweep canonical(memory/feedback_audit_full_sweep_not_sample.md)"
fi

# ─ Validator B: dim coverage(2026-05-30 M2/M3 fix per laziness-hunt:原 regex `5[01]` 只到 dim 51,
#   52-88 完全不計（含 PURE-JUDGMENT dim 62/66/68/72）+ 寫死 46。改動態讀 dispatch total + count UNIQUE dim 號）─
DIM_TOTAL=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$PROJECT_DIR/.claude/logs/audit-dims-dispatch.json','utf8')).total)}catch{console.log(88)}" 2>/dev/null || echo 88)
DIM_COUNT=$(grep -oiE '\bdim[[:space:]]+[0-9]{1,2}\b' "$FILE_PATH" 2>/dev/null | grep -oE '[0-9]+' | sort -un | wc -l | tr -d ' ')
DIM_COUNT=${DIM_COUNT:-0}
if [ "$DIM_COUNT" -lt "$DIM_TOTAL" ]; then
  WARNINGS="${WARNINGS}\n  ⚠️ [B] Dim coverage:report 提到 ${DIM_COUNT} unique dim,< ${DIM_TOTAL} 期望。確認全 dim NO-SAMPLE（PURE-JUDGMENT/requiresAgent dim 必有 per-dim agent-output 非散文提號）"
fi

# ─ Validator C: audit-prompts.md coverage ─────────────────────────────────
AUDIT_PROMPTS="$PROJECT_DIR/.claude/skills/design-system-audit/references/audit-prompts.md"
if [ -f "$AUDIT_PROMPTS" ]; then
  # 2026-05-30 M3 fix:原 regex `^### Dim N` 對不上實際格式 `## N. Title`（grep 0 → 永遠誤觸 prune）;
  # 寫死 46 也錯。改成數真實 `## N.` heading + 動態判「PURE-JUDGMENT dim 數」（只有 judgment dim 需 prompt
  # 才能派 agent;deterministic/hook dim 不需）。prompts < judgment dim = 有 judgment dim 派不出 agent。
  # 2026-05-30 fix(hook-test surfaced):`grep -c ... || echo 0` 在 0-match 時 grep 已印 "0" + exit 1,
  # `|| echo 0` 再 append → "0\n0" → 下方 `[ -lt ]` integer error → trigger 失效。改 `|| true` + 取首行。
  # 2026-05-31 fix(infra-audit self-finding):原 `[53 -lt 23]` 是 count-vs-count = 永遠 false = dead gate。
  # 改 SET-MEMBERSHIP:逐個 PURE-JUDGMENT dim 號檢查 audit-prompts.md 有無對應 `## N.` heading,列出缺的。
  MISSING_PROMPTS=$(node -e "
    try {
      const fs=require('fs');
      const m=JSON.parse(fs.readFileSync('$PROJECT_DIR/.claude/logs/audit-coverage-matrix.json','utf8'));
      const judg=Object.entries(m.coverage_by_dim).filter(([k,v])=>v.tier==='PURE-JUDGMENT').map(([k])=>+k);
      const prompts=fs.readFileSync('$AUDIT_PROMPTS','utf8');
      const have=new Set([...prompts.matchAll(/^##\s+(\d+)\./gm)].map(x=>+x[1]));
      console.log(judg.filter(d=>!have.has(d)).join(','));
    } catch(e){ console.log(''); }
  " 2>/dev/null || echo "")
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
  PJ_COUNT=$(node -e "try{const m=JSON.parse(require('fs').readFileSync('$PROJECT_DIR/.claude/logs/audit-coverage-matrix.json','utf8'));console.log(Object.values(m.coverage_by_dim).filter(v=>v.tier==='PURE-JUDGMENT').length)}catch{console.log(23)}" 2>/dev/null || echo 23)
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
    WARNINGS="${WARNINGS}\n  🔴 [I] D3/D4/D5 domain-skill chain 證據缺席:report 未提及${_D345_MISSING}。稽核 canonical 6-維度表(CLAUDE.md)deep 規模必 chain 三 domain skill(或明寫豁免理由 + skill 名)。補跑/補記再出 report。"
    TRIGGER_PRUNE=1; CRITICAL_FAIL=1
  fi

  # ─ Validator J: codex dim 覆蓋對帳(2026-07-10 user「codex 稽核一模一樣所有項目,有確保嗎?」)─
  #   report 顯示 Phase B / codex 比稿有跑 → 必含「dim 覆蓋對帳」表(彙總 codex 各 brief 蓋到的
  #   dim 號 vs dispatch 清單逐號對;SKILL B.2 Step 0 契約的報告端機械閘 — 保證鏈第三段)。
  if grep -qiE 'Phase B|codex 比稿|cite battle|dual-track' "$FILE_PATH" 2>/dev/null; then
    if ! grep -qiE 'dim 覆蓋對帳|dim 對帳|coverage tally' "$FILE_PATH" 2>/dev/null; then
      WARNINGS="${WARNINGS}\n  🔴 [J] Codex dim 覆蓋對帳缺席:report 提及 Phase B/比稿但無「dim 覆蓋對帳」表(codex 各 brief 蓋到的 dim 號 vs dispatch 清單逐號對,缺號 = 補 brief)。per SKILL B.2 Step 0(2026-07-10),不齊不得宣稱雙軌全覆蓋。"
      TRIGGER_PRUNE=1; CRITICAL_FAIL=1
    fi
  fi
fi

# ─ Validator H: 拍板清單 SSOT-理由 強制(2026-06-11 user 第 3 次糾正「要我拍板的都是 SSOT 的 UI/UX 嗎」)─
# 報告含「待你拍板」/「拍板清單」區塊時:區塊內每個編號題必含「SSOT 理由」字樣;
# 題數 > SSOT-理由數 = 有題目沒標理由 = 混入非 SSOT 項 → BLOCK。
if grep -qE '待你拍板|拍板清單' "$FILE_PATH" 2>/dev/null; then
  _BLOCK_SEG=$(sed -n '/待你拍板\|拍板清單/,$p' "$FILE_PATH" 2>/dev/null)
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
#   (3) codex 辯論 verdict(codex)(4) design-fit(設計語言/設計原則/design-fit)。缺任一 → 該題不成熟
#   → BLOCK(exit 2)。Detection conservative:只掃本 hook file scope(audit report / C1-final-report)
#   的拍板 section;無決策 block(「無待拍板」)= 合法 pass。
if grep -qE '待你拍板|拍板清單' "$FILE_PATH" 2>/dev/null; then
  _K_MISSING=$(node -e '
    try {
      const fs = require("fs");
      const txt = fs.readFileSync(process.argv[1], "utf8");
      const m = txt.search(/待你拍板|拍板清單/);
      if (m < 0) { console.log(""); process.exit(0); }
      const lines = txt.slice(m).split("\n");
      const headRe = /^\s*(?:\d+[.、)]|#{2,}\s*決策)/;
      const blocks = []; let cur = null;
      for (const ln of lines) {
        if (headRe.test(ln)) { if (cur !== null) blocks.push(cur); cur = ln; }
        else if (cur !== null) cur += "\n" + ln;
      }
      if (cur !== null) blocks.push(cur);
      const req = [
        ["SSOT-check", /SSOT|既有拍板/],
        ["世界級cite", /世界級|https?:\/\//],
        ["codex-verdict", /codex/i],
        ["design-fit", /設計語言|設計原則|design-fit/],
      ];
      const miss = [];
      blocks.forEach((b, i) => {
        const lack = req.filter(([, re]) => !re.test(b)).map(([n]) => n);
        if (lack.length) miss.push("決策" + (i + 1) + " 缺[" + lack.join("/") + "]");
      });
      console.log(miss.join(";"));
    } catch (e) { console.log(""); }
  ' "$FILE_PATH" 2>/dev/null || echo "")
  if [ -n "$_K_MISSING" ]; then
    CRITICAL_FAIL=1
    WARNINGS="${WARNINGS}\n  🔴 [K] 決策四要件不全:${_K_MISSING} — 每個送 user 拍板的決策必含 (1)SSOT-check(先 grep 既有 canonical/已拍板)(2)≥3 世界級 cite(WebFetch 真 source + URL)(3)codex 辯論 verdict(4)設計語言/原則 fit。缺 = 該題不成熟,退回研究/辯論(deep-audit SKILL C.1 四要件),禁送 user。"
  fi
fi

# ─ Validator BLOCK gate(2026-05-31 fix infra-audit self-finding:原 hook 只 exit 0 + additionalContext
#   soft-inject = 我過度宣稱「BLOCKER」。改:critical fail → stderr + exit 2 真 block PostToolUse。
#   2026-07-10 user「只有 SSOT UI/UX 才交拍板,要確保」:Validator H 原在本 gate 之後 = CRITICAL_FAIL 白設
#   死旗(hunt finding #62)→ 搬到 gate 前,H 現在真擋)─
if [ "${CRITICAL_FAIL:-0}" -eq 1 ]; then
  printf '🚨 AUDIT-REPORT VALIDATOR BLOCK(C/F/G/H/I/J/K critical):%b\n\n此 deep-audit report 不合格,補齊上述後重出 report。' "$WARNINGS" >&2
  exit 2
fi

# ─ Validator E: prune-chain-trigger emit ──────────────────────────────────
# 2026-06-11 擴充(user 糾正「為何每次都要問我是否要跑 knowledge prune」機械兜底,SSOT = deep-audit SKILL C.0a):
# deep-audit 規模 report(DIM_COUNT≥10)→ 無條件 fire prune-chain trigger,非僅 coverage 不足時。
# 分權不變:AI 收到 trigger 必 AUTO-RUN(品質優先前提),P2 retire 仍 user 拍板。
if [ "${DIM_COUNT:-0}" -ge 10 ] && [ "$TRIGGER_PRUNE" -eq 0 ]; then
  TRIGGER_PRUNE=1
  WARNINGS="${WARNINGS}\n  • C.0a unconditional chain:deep-audit 收尾必 AUTO-RUN /knowledge-prune(禁問 user 要不要跑;headroom trigger 命中時 scope 聚焦,否則 quarterly)。"
fi
if [ "$TRIGGER_PRUNE" -eq 1 ] || [ -n "$WARNINGS" ]; then
  mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null
  printf '{"ts":"%s","file":"%s","trigger_prune":%d,"warnings":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$FILE_PATH" \
    "$TRIGGER_PRUNE" \
    "$(printf '%b' "$WARNINGS" | jq -Rs .)" \
    >> "$PROJECT_DIR/.claude/logs/audit-post-report-validator.jsonl" 2>/dev/null || true

  if [ "$TRIGGER_PRUNE" -eq 1 ]; then
    CTX=$(printf '🚨 audit post-report validator: prune-chain-trigger fire。AI 必 AUTO-RUN /knowledge-prune(禁問 user;品質優先前提 per deep-audit SKILL C.0a;P2 retire 候選列拍板清單)。\n%b' "$WARNINGS")
    jq -n --arg ctx "$CTX" '{
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx }
    }'
  fi
fi

exit 0
