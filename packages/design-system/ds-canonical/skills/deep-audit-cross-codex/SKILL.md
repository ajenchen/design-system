---
name: deep-audit-cross-codex
description: Phase A Claude solo 完整深度進階稽核 → Phase B codex 同流程稽核 + 比稿辯論共識 → Phase C 落地。SSOT-UI/UX 中文人話 propose / 其他 autonomous。對齊 M14/M18/M19/M20/M22/M23/M26/M29/M31/M32 + audit dim list 全集(SSOT = design-system-audit/SKILL.md)+ codex-collab 5-step。
arguments: scope?=full|changed focus?=「ssot|visual|behavior|all」
---

# Deep Audit Cross-Codex — 雙 model adversarial 完整 DS 稽核

上游 context / 框架(SSOT integrity invariant + 生態位 + canonical 全繼承)+ user-verbatim directives(2026-05-18 + 2026-05-29)+ 機械強制 R18-R26 對齊清單 詳 references/upstream-directives-r-mapping.md

## When to invoke

- User 明確 trigger:「跑深度稽核 + codex 比稿」「完整盤查 with codex」「dual-pass audit」「/deep-audit-cross-codex」
- 重大 release / SSOT 大改 / 季度健檢
- 多輪修正後想雙 model verify

**不該 invoke**:single 元件小修(用 `/design-system-audit --scope=component`)/ 已知 surgical bug fix(用 `/bug-fix-rhythm`)/ 日常 dev(`visual-audit --scope=changed`)。

## Non-goals

- 不取代 `/design-system-audit --deep`(本 skill **chain** 它 Phase A.1)
- 不取代 `/codex-collab`(本 skill **chain** 它 Phase B)
- 不動 audit 觸發以外的 PR / branch ops(M28 由 user 拍板)

---

## Phase 0 — Cwd context detection(2-mode branching,2026-05-29 加)

Skill 必能跑在 **DS repo + fork user repo** 兩處(per user 2026-05-29「fork user 在自己獨立環境下 infra 仍正確運行」directive)。Phase 0 自動偵測 cwd 切 scope:

```bash
detect_mode() {
  if [ -d "packages/design-system/src" ]; then echo "ds-repo"
  elif grep -q '"@qijenchen/design-system"' package.json 2>/dev/null; then echo "fork-user-repo"
  else echo "non-ds"; exit 0; fi
}
```

**為何 2-mode 不是 3-mode**(per user「避免原則無限膨脹」):「template SSOT」實際上是 ds-repo 內 `template/ds-product-template/` 子目錄;DS owner 編 template scaffold 仍在 ds-repo cwd 跑,**無 semantic 區隔**。Published `ds-product-template` GitHub repo 跟 fork user new repo 在 file structure 上一致(都消費 DS via npm + plugin),統一 fork-user-repo mode 處理。3-mode 設計 dead code:`ds-template-ssot` 永不 trigger 因 `packages/design-system/src` 條件先 win。

| Mode | A.0 全盤閱讀 scope | A.1 audit dim scope | Phase B codex scope |
|---|---|---|---|
| **ds-repo**(DS owner workflow,含 template SSOT 編輯)| full DS canonical + spec + token + pattern + memory + `template/ds-product-template/` scaffold | 全 dim per `/design-system-audit --deep` SSOT(含 dim 83 cross-3-repo runtime audit)**＋ chain `/product-ui-audit` 對 `apps/template`**(DS owner dogfood 自家消費端 surface,用 fork user 同等產品標準把關)| 全 dim parallel verify |
| **fork-user-repo**(published template repo / fork user product repo)| `node_modules/@qijenchen/design-system/CLAUDE.md` + `ds-canonical/rules/meta-patterns.md` + `apps/**` + 本 repo `CLAUDE.md` | dim 83 fork-side runtime checks(plugin hook fire / **fork-committed bootstrap hooks fire〔check_plugin_bootstrap SessionStart + block_production_edit_without_plugin PreToolUse〕** / cross-load / setup-netlify smoke / **deploy URL hook 每次 push 吐 URL live** / **環境建置斷點清單通暢 + 無法自動的斷點有 plain-中文引導**)+ **完整 consumer/fork enforcement dim 集(2026-05-30 補,原僅 62-67 漏掉 bootstrap 等)**:58(plugin install + bootstrap chicken-egg gate)/ 59(approval-preflight `apps/**`)/ 62(Netlify onboarding + 斷點清單 + ≥6 條中文引導話術)/ 63(deploy URL auto-reply 每次必吐)/ 64(post-main-push SSOT propagation)/ 69-71(consumer no-catalog / @story-baseline / DS primitive misuse)/ 73-74(full-story sweep / overlay probe)/ 75(plugin freshness)/ 76(escape marker abuse)/ 82(consumer app story title)| 同 dim,fork-side verify;**禁** propose DS source change |

### Fork-mode safety invariants(2026-05-29 加)

當 cwd = `fork-user-repo`:
- A.2 propose scope 限 fork user's product code(`apps/**`,可選 `packages/<consumer-utils>/**`)
- **禁** propose DS source 改動(`node_modules/@qijenchen/design-system/**` read-only;要改 file PR 回 DS repo)
- A.3 autonomous batch fix scope 同上
- Commit / push 仍走 M28 working branch + user push trigger
- Hooks fire 信任 plugin 機制(skill 不重複實作 hook logic)

---

## Phase A — Claude solo full audit(必先 NO-SAMPLE 跑完才進 Phase B)

### A.0 — 全盤閱讀 preflight(M29 升級,**禁止憑記憶**)

**強制 read sweep**(不可 sample,不可挑):
1. `CLAUDE.md` 全文
2. `.claude/rules/{meta-patterns,spec-rules,ui-development,story-rules,self-verify}.md` 全文
3. `.claude/references/{ssot-index,ssot-consultation,build-ui-canonicals,naming-conventions}.md`
4. `packages/design-system/src/**/*.spec.md` 全部(83 file,通過 Glob 列舉 + Read)
5. `packages/design-system/src/tokens/**/*.spec.md` + `packages/design-system/src/patterns/**/*.spec.md` 全部
6. 本 session 對話脈絡 + memory `~/.claude/.../memory/MEMORY.md` index + active project memory files

**完成 gate**:Phase A.0 output = `phaseA-preflight-checklist.md`(session-local,列出讀過的 N file + 任何 spec 漂移嫌疑點)。**禁** skip / sample / 「先看標題判斷」。

### A.1 — 跑全 dim NO-SAMPLE deep audit(chain `/design-system-audit --deep` SSOT)

**Dispatch plan auto-pickup**(2026-05-23 ship per user verbatim「infra 增刪改 audit 自動跟最新」):
必先跑 `node scripts/dispatch-audit-dims.mjs --summary` 取**動態 dim 列**(non-hardcoded),從 `.claude/logs/audit-dims-dispatch.json` 讀 sub-agent batch 分組。Heavy dims 自動標,新加 dim 自動 included,retire 自動排除。

**禁** hardcode dim range numbers(eg.「Dims 1-15」/「Dims 34-56」)在 sub-agent prompt — 用 dispatch-audit-dims.mjs output 的 `dispatchPlan.suggestedBatches[].dimNumbers` 動態填。

完整跑,**no sample / no escape**(對齊 `feedback_audit_full_sweep_not_sample.md` + `check_audit_sample_escape.sh` BLOCKER)。
每 dim sub-agent prompt 必含「DS-wide 全盤,禁 sample top N」。

**DETERMINISTIC dim 必驗「mode 真的有跑」(2026-06-11 加)**:script exit 0 ≠ 該 dim 宣稱的模式真的執行了 — 必看輸出證據(per-mode 計數 / cell label / scenario 數)確認 flag 真生效。Anchor:dim 51 `--matrix` flag 接受後 `MATRIX_CELLS` 定義但 main loop 從未消費(dead code),跑出來是無 matrix 的普通 scan + exit 0 = 連續假綠;另 cell 清單含 Storybook 不認識的 globals(hc/rtl)= 注入後靜默 fallback = 假覆蓋。兩層都要驗:flag→行為、行為→真值。

**PURE-JUDGMENT dim 真跑證據強制(2026-05-30 generalize,user 問「包括所有 infra 稽核?」)**:judgment dim(無 deterministic script / write-time hook 兜底者,含 infra 62/66/68/72 fork-onboarding/runtime/API-surface)report 必逐 dim show「DS-wide N files scanned + file:line findings / 或『0 after 全掃』」真跑證據,**禁只 mention dim 號**。report-validator `check_audit_post_report_validator.sh` Validator G 機械強制(evidence marker 數 < judgment dim 數 = BLOCKER)。DETERMINISTIC(22)+ HOOK(42)dim 由 CI / write-time hook 兜底(含 22/26 infra dim),不在此 risk。

**🚨 反抽樣鐵律 — 「機械涵蓋」必先 breadth-verify(2026-06-05 user 抓 story-title 又抽樣,verbatim「這個問題已經問你一百次了結果你還是抽樣」)**:把某 judgment dim 標為「DETERMINISTIC/HOOK 已兜底、不在 judgment risk」**= 一種抽樣**,除非該 gate 的偵測廣度被**證明**對齊 canonical。**強制兩步,缺一即視同抽樣**:
1. **Breadth-test**:對該 gate 注入一個「已知違規」樣本 → 跑 gate → 確認被抓(exit 1)→ revert。沒通過 = 該 gate **不算**涵蓋該 dim,退回 PURE-JUDGMENT 跑完整枚舉。
2. **完整枚舉 + partition-review**(judgment dim sample-proof 跑法):deterministic 腳本枚舉**全部單元**(eg. `gen-ds-story-manifest.mjs` 全 926 name)→ 機械 auto-pass 明確合規者 → 剩餘 candidate **切 N chunk,每 chunk agent 審它每一個**(chunk 互斥涵蓋全集 → 每單元剛好審一次,數學上不可能漏)。**禁** agent 自選 top N。
- **錨例**:dim 40/41/43 被當「story-quality:check 已涵蓋」排除 NO-SAMPLE → 但 gate 有 detection gap(只抓 100%-English,漏中英混雜)+ scope gap(漏 anatomy/principles)→ 放過 84 違規,還回報「0 violations」假綠燈。修:gate 補 `name_mixed_english`(Dim 41b)+ 全 storyFiles scope + breadth-verified(注入 `Hover Compact 測試` 確認抓到)。對齊 M7 子規則 M34「spec broad + hook narrow = gap 必補」。

### A.1b — Claim-vs-code + docblock + spec-internal adversarial verification(MANDATORY,NO-SAMPLE,per-component)

**2026-05-30 anchor(user verbatim 質問「之前他媽都在偷懶?」)**:獨立 adversarial 再審抓到 **403 findings / 64 單元 / 0 全乾淨**,其中 **202 個 FALSE_CLAIM**(anatomy/a11y/principles/spec 系統性記載 code 根本沒有的行為:Calendar 宣稱方向鍵導覽 / Tooltip·HoverCard 宣稱 focus trap / Alert 記不存在的 `actions` prop / Select 宣稱「用原生 select」但桌機自建 cmdk / AspectRatio spec 說「無 wrapper」但 code wrap)。**根因**:前期 audit 把 story-content dim(12/24/25/30/43 等)當「散文層 looks-fine 掃」跑,**沒 adversarial 讀 .tsx(+ wrap 的 lib)逐句比對宣稱**。這是「偷懶」的具體 failure mode。

**為何不能只靠 deterministic grep**:2026-05-30 嘗試建 `audit-anatomy-prop-existence.mjs`(已刪除不存在)機械驗 prop-existence,但 **prop passthrough(元件 `...props` 轉發 Radix/react-day-picker)使 naive grep 必 over-flag 合法 prop** → 不可靠 → 刪除。**結論:FALSE_CLAIM 驗證本質需 LLM 讀 source 判斷,無法純 grep gate → 故必用「強制 + 報告驗證確認真跑」的機制保證**。

**強制流程**(deep-audit 每次必跑,no skip):
0. **機械 gate 先跑(deterministic,2026-06-02 加)**:`npm run typecheck:stories`(deterministic 抓 stories 的 `{var}`-undefined / prop 型別錯 —— **這是 SizeMatrix `{size}` crash 的真防線**;主 tsc -b exclude stories 故必跑此)+ `node scripts/storybook-smoke-test.mjs --full`(runtime crash render 掃)。先過才進 adversarial read。Anchor:2026-06-02 Field SizeMatrix `{size}` JSX-undefined crash 隨 beta.44 ship。**注**:smoke 全覆蓋 coverage-gate(防靜默-skip 假綠燈)attempted 但 CI server 規模化降級(~60 story 後 timeout 撞 20-min budget)→ **defer**(需 robust-server / browser-recycle + 可靠測試環境);故 typecheck:stories 是目前 deterministic 主防線。
1. **per-component(NO-SAMPLE,全 62 component + 全 pattern)** dispatch adversarial agent。
2. 每 agent 必 **Read 元件 .tsx + 其 wrap 的 lib(Radix/cmdk/react-day-picker/sonner 等)source**,對該元件**所有** anatomy / a11y / principles / spec 宣稱**逐句**比對:鍵盤 map / ARIA role / focus 行為 / prop 存在性 / 視覺 token / 預設值 / native-vs-custom。
   **+ 2026-06-04 補兩 lens(Dim 15 cross-doc 明文涵蓋但前期被「散文 skim」漏的同 class failure;非抽樣、非無覆蓋,是「有 dim 淺跑」)**:
   - **(a) 元件 `.tsx` 自己的 docblock / inline 註解 vs 同檔 code**:A.1b 原設計把 `.tsx` 當「真相來源」去驗別人(story/spec),**從不反驗它自己的註解** → docblock claim 的 padding / typography mode / hover / 行為 vs code 真實值,逐行比。
   - **(b) spec 段落間描述性一致(spec-internal cross-section)**:A.1b 原驗 claim-vs-code,**不驗 spec-段-vs-段** → 同一 spec 內 Mode 表 typography 標籤 / padding 值 / gap 值 / surface 行為,跨 section 不可打架。
   - **(c) token / pattern spec 的 cross-file consumer-list claims(2026-06-11 加)**:token spec 常有「消費者清單」宣稱**其他檔案**的行為(如 motion.spec「hover-card.tsx Provider 預設 override 為 --hover-delay-rich」)— per-component A.1b 只驗「該元件自己的 spec vs 自己的 code」,**cross-file 宣稱兩邊都不在誰的 claim set 裡 = 系統性盲區**。每個 token / pattern spec 的消費者清單必逐檔開 code 驗。Anchor:2026-06-11 hover delay 雙 drift(HoverCard 沒接 token / OverflowIndicator 誤 tier)連續多輪 deep-audit 漏抓,正是此 lens 缺;現另有 `scripts/audit-motion-delay-invariants.mjs` 機械凍結 motion 域。
   - **Anchor**:2026-06-04 user 抓「deep-audit 多次沒發現」—— tsx docblock(`閱讀模式 1.5` / `hover:bg-neutral-hover`,自 2026-04-23 stale)+ spec Mode 表 typography stale,全是 Dim 15 該抓、卻被當散文掃漏。納入此強制 adversarial(Validator F per-component 覆蓋率閘一併保證),不再可 skim。
3. **「自上次 audit 無 code 改動」≠ 可跳過** —— content 宣稱可在 code 沒變下就是假的(前期正是用此藉口跳過 = 違規)。
4. output per-component:`{component, claimsVerified: N, falseClaims: [{fileLine, 宣稱, 真實 code 行為}]}`。
5. findings 併入 A.2 triage(FALSE_CLAIM 對齊 doc-to-code = autonomous;substantive design-language tension = HOLD propose)。

**完成 gate**:report 必含**每個** component 的 story-vs-code verdict(claimsVerified count + falseClaims list)。report-validator hook `check_audit_post_report_validator.sh` Validator F 檢查此 per-component coverage,缺 = BLOCKER(見 Mechanical enforcement)。

### A.2 — Triage findings → 中文人話 propose SSOT-UI/UX / autonomous non-SSOT

**Scope classifier**(critical,先過):
- **SSOT-UI/UX substantive 增刪改** = 動 component / token / spec.md 視覺結構 / 跨元件 design language / 新 API contract → **STOP propose**
- **Non-SSOT**(bug fix / clean / refactor / 命名一致 / test / audit / verify / hook regex 加廣 / pointer 補 / spec typo / 漂移 mechanical 對齊)→ **AUTO 整批做完**

**SSOT-UI/UX propose 必過 gate + 中文人話 format**(SSOT 在主檔,不在此重述以免多處抄寫漂移):
- **Propose 前必過 7-Q gate**(Q0 先驗「問題是否真存在」/ Q1 cite / Q1' DS canonical 優先 / Q2 SSOT consume / Q3 Rule-of-3 / Q4 下游吸收 / Q5 issue 100% mapped)→ SSOT `.claude/skills/propose-options/SKILL.md`(hook `check_propose_pre_grep_verify.sh` 機械強制 Q0);M18 為 meta anchor
- **中文人話 propose format + 禁用 jargon 對照表** → SSOT `.claude/memory/feedback_propose_discipline.md`(hook `check_propose_discipline.sh(r1,2026-06-11 merge)` 機械強制)
- **Triage 分流 + format 細則** → `references/triage-rubric.md`

### A.3 — Autonomous batch execute(non-SSOT,M33 anti-defer)

7 軸 simultaneous optimize 操作清單 → `references/phase-a-workflow.md` A.3(SSOT `CLAUDE.md` `# 自主執行 canonical`)。

**禁defer keyword**:「下次再做 / 下個 session / 省工 / 等等」(M33 BLOCKER)。

### A.4 — Verify-to-perfection(per self-verify.md 4 階段)

- Post-edit:`npx tsc -b` / 相關 invariant 腳本 / `audit-content-quality.mjs --check` / `extract-canonical-rules.mjs`
- Visual:`/visual-audit --scope=changed`(UI 改動)+ playwright pixel-quantified(M32)
- M14 5-layer pipeline:spec / hook / SKILL / CLAUDE.md / memory 同步

**Phase A complete gate**:全部 verify PASS + commit on working branch + 報 user「Phase A 完成,N 項 SSOT-UI/UX 等你拍板」。**禁** skip Phase A 直接 Phase B。

---

## Phase B — Codex parallel audit + 比稿辯論共識

### B.0 — Codex transport discovery(per codex-collab/SKILL.md Step 0.4)

3-test 順序固定(local 優先):`node_modules/.bin/codex` → `which codex` → `~/.codex/auth.json`。**禁 Explore agent 替身**(M31)。

**Auto-fallback policy(2026-05-29 加,fork-user 友善)**:
- 全 ❌ **且** cwd = `fork-user-repo` → **auto-fallback Phase A only**(不 interactive ASK),印中文:`「Codex 未裝(@openai/codex 不在你的 fork repo deps),skip Phase B 比稿。Phase A solo audit 已完整跑完。若要 dual-track 比稿請 npm i --save-dev @openai/codex 後重跑」`(2026-05-29 verified:`/tmp/ds-product-template/node_modules/.bin/codex` 不存在 = fork user 預設無 codex,此 fallback 為正常路徑)
- 全 ❌ **且** cwd = `ds-repo` → 報 user(DS owner config issue,需 fix)
- **禁** Explore 替身 / 嘗試 `sudo npm i -g` / 繞 M28 開 PR(per `memory/feedback_codex_exec_transport_canonical.md` Anti-pattern)
- **大型 brief 死局 fix**:r1-r4 anchor — 用 `--dangerously-bypass-approvals-and-sandbox` + `-c model_reasoning_effort=low` + 拆 N 個 single-axis focused brief 並行(每 brief 25k tokens 真完成)

### B.1 — Brief codex 跑相同 Phase A 完整流程

Brief 必含 4 段(完整 template SSOT → `references/phase-b-codex-brief.md`,per codex-collab Step 0.05 user-verbatim faithful relay + Step 0.5 own-version invariant):**(1)** user 原話 verbatim(中英符號圖文全保)**(2)** Claude Phase A 結果摘要(P0/P1/P2 count + propose N 項 + landed M 項 file:line)**(3)** 請 codex 獨立跑相同 Phase A(全盤閱讀 + 全 dim NO-SAMPLE + 完整報告 + 不 frame 答案)**(4)** 回「你抓 Claude 漏 / Claude 抓你不同意 / 兩邊都漏」。Send via `codex exec`(local CLI per M31 Step 0.4)或 cloud `@codex`。

### B.2 — Receive codex report + Step 4 self-check + Step 4.5 verify

**禁 pass-through**(per M31 + `feedback_codex_dual_track_synthesizer.md`):
- Step 4:M22/M23/M27/M8 4 題自檢
- **Step 4.5 verify each claim**:grep / WebFetch / run invariant script / counter-example scan
- 每 codex claim 標 `✅ verified` / `❌ FALSE` / `⚠️ partial`

### B.3 — Step 5 比稿(matrix per claim)

不可只「pick A/B/C」(round-7 trap)。對每 finding 4 axis:
- **接受 codex**:codex 抓 + verified + Claude 漏
- **接受 Claude**:Claude 抓 + codex 漏 / codex verified FALSE
- **修正 = synthesize**:兩邊各補對方缺漏 → final 比兩 v1 都強
- **重啟**:兩邊都不對 → 重做

### B.4 — Disagreement → cite battle(M31 Step 4 / 5)

任何 disagreement **禁** vote / 直覺;走 cite battle:
- 各自提 spec.md path:line + 引文
- WebFetch ≥ 3 家 world-class DS 對照
- evidence stronger 勝;evidence 對等 → STOP 給 user 拍板

### B.5 — 共識 triage → 中文人話 propose / autonomous

跟 Phase A.2 同 format,但 finding source = 共識(Claude + codex 兩邊都認 + verify PASS)。

---

## Phase C — Final report + commit + push trigger gate

### C.0a — Governance prune auto-chain(2026-06-11 user verbatim 糾正 codify)

Deep-audit 收尾**必自動跑** `/knowledge-prune` deep — **前提鐵律:確保產出不打折、以產出完美為前提**(quality-first,= knowledge-prune SKILL 2026-06-02 核心前提:只清真冗餘提升 signal,每一條真實 invariant / 機械防線必完整保留,retire 前必確認保護已被別處覆蓋;2026-06-11 user verbatim「請確保有確保產出不打折且產出完美,且未來也必須要確保產出不打折以產出為完美的前提跑 knowledge prune deep」)。governance headroom / session-start trigger 命中時 scope 聚焦觸發點,否則 quarterly scope。**禁問 user「要不要跑」**(anchor:2026-06-11 user verbatim「deep audit cross codex不是會自動…跑 knowledge prune deep?為何每次都要問我是否要跑?」)。分權不變:P0+P1(表達層對齊/清 stale)AUTO 執行;**P2(retire 機械防線 / 動 canonical)整理成候選表進 C.1 拍板清單** — user 只拍板 P2 內容,不拍板「跑不跑」。

### C.0 — 收斂判準(rerun stop gate,2026-06-01)

決定「**再 rerun 嗎**」必過此 gate:deep-audit = LLM 對抗式 non-deterministic + 高假陽性,**追零 = 跑步機 + 誘發 regression**。STOP 判準 = **某輪 adversarial 二次驗證後真 material/regression = 0(只剩 marginal + false-positive)**——不追零、不過早收。收斂靠 CI gate + 寫入時紀律,非 audit loop。三分類表 + 「改一處看 N 處」→ `references/triage-rubric.md`「收斂判準」。

### C.1 — Final report(送 user)

```
## Deep Audit Cross-Codex 完整報告(N 日期)

### Phase A 結果
- 全 dim findings: <P0 N / P1 M / P2 K>
- Autonomous landed: <N 項> commit <hash>
- SSOT-UI/UX 已拍板: <M 項>
- SSOT-UI/UX 待拍板: <列出 + 簡述>

### Phase B 結果
- Codex 抓 + Claude 漏: <N 項>
- Claude 抓 + Codex 漏: <M 項>
- Cite battle: <K 題,各題 verdict + evidence>
- 共識 SSOT-UI/UX 待拍板: <列出 + 簡述>
- 共識 autonomous landed: <N 項> commit <hash>

### 待你拍板(中文人話)
<決策 1-N(per A.2 format)>

**每題必附「SSOT 理由:」一句**(= 為何這是「會影響 SSOT 的 UI/UX 增刪改」:新 API contract / 改 canonical 語意 / 新視覺 design language,三類之一,具體指出)。**寫不出 SSOT 理由 = 該題不是拍板題,移回 AUTO 自己做**(2026-06-11 user 第 3 次糾正 codify:bug fix / a11y 對齊 W3C / 對齊 spec 既有意圖 / story 內容 / 治理 / 補 rationale 文件 / dead code 清除,全部 AUTO 不問)。Hook \`check_audit_post_report_validator.sh\` Validator H 機械強制。

### Verify artifact
- tsc PASS / invariant PASS / content-quality PASS / visual probe PASS
- file:line + before / after diff link
```

### C.2 — Push trigger gate(M28 solo-work canonical)

**禁** AI 自決 merge main / push origin main。等 user 「Push 到 main」trigger。

---

## Mechanical enforcement

- Pre-edit:`check_substantive_edit_approval_preflight.sh` + `check_ds_anchor_preflight.sh`(SSOT-UI/UX 必先 approval)
- Mid:`check_audit_sample_escape.sh`(Agent dispatch 攔 sample escape)+ `check_codex_collab_5step.sh`(Layer A/B/C cite verdict)
- Post:`stop_self_audit.sh` Mechanism 1 claim-verify-gap BLOCKER + `audit-content-quality.mjs --check`
- Commit gate:`check_solo_workflow.sh`(no PR / 1 chat 1 branch / 等 user push trigger)

## Checkpoints(禁止跳)

| Checkpoint | 在哪 | What |
|---|---|---|
| **CP-P0** | Phase 0 結束 | Print detected mode(ds-repo / fork-user-repo),mode = non-ds 直接 exit;確認 user 跑對 repo |
| **CP-A0** | A.0 結束 | 全盤閱讀清單給 user 看(列 N file read,per detected mode 切 scope),禁未讀就進 A.1 |
| **CP-A1b** | A.1b 結束 | **每個** component/pattern 都有 story-vs-code adversarial verdict(讀 .tsx + wrap lib 逐句比對宣稱);**禁** 用「無 code 改動」跳過任一單元。缺任一 component verdict = 不可進 A.2(2026-05-30 403-finding 偷懶 anchor)|
| **CP-A2** | A.2 SSOT-UI/UX propose | 中文人話 + 4-Q gate;**STOP** 等 user A/B 才動 code(fork-user-repo mode:propose scope 限 `apps/**`,禁 DS source)|
| **CP-B0** | B.0 codex transport | 3-test 全 ❌ + cwd=fork → **auto-fallback Phase A only 印中文**,不 interactive ASK;cwd=ds-repo → 報 user;禁 Explore 替身 |
| **CP-B4** | B.4 cite battle | evidence 對等 → STOP 等 user 拍板,**禁** AI 自決誰勝 |
| **CP-C2** | C.2 push gate | 等 user「Push 到 main」trigger;禁 AI 自決 merge |

## References

- `references/phase-a-workflow.md` — A.0 全盤閱讀 file list canonical + A.1 全 dim sub-agent dispatch template
- `references/phase-b-codex-brief.md` — codex brief template(B.1)+ Step 4.5 verify checklist + Step 5 比稿 matrix template
- `references/triage-rubric.md` — Scope classifier(SSOT-UI/UX vs non-SSOT)+ 中文人話 propose format + 7 autonomous 目標 expansion
- `references/upstream-directives-r-mapping.md` — 上游 context / 框架(SSOT integrity invariant + 生態位 + canonical 全繼承)+ user-verbatim directives(2026-05-18 + 2026-05-29)+ 機械強制 R18-R26 對齊清單
- `references/skill-relationships-antipatterns-benchmarks.md` — 與其他 skill 分工 + Anti-pattern(永久 ban)+ 世界級對照
