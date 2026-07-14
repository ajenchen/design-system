---
name: deep-audit-cross-codex
description: Phase A Claude solo 完整深度進階稽核 → Phase B codex 同流程稽核 + 比稿辯論共識 → Phase C 落地。SSOT-UI/UX 中文人話 propose / 其他 autonomous。對齊 M14/M18/M19/M20/M22/M23/M26/M29/M31/M32 + audit dim list 全集(SSOT = design-system-audit/SKILL.md)+ codex-collab 5-step。
arguments: scope?=full|changed focus?=「ssot|visual|behavior|all」
---

# Deep Audit Cross-Codex — 雙 model adversarial 完整 DS 稽核

上游 context / 框架(SSOT integrity invariant + 生態位 + canonical 全繼承)+ user-verbatim directives(2026-05-18 + 2026-05-29)+ 機械強制對齊清單(實際涵蓋 R18-R22 / R24-R26 共 8 條;R23「確保 SSOT」未單列,由上游 M17/M23 + 檔頭 SSOT integrity invariant 涵蓋)詳 references/upstream-directives-r-mapping.md

## When to invoke

- User 明確 trigger:「跑深度稽核 + codex 比稿」「完整盤查 with codex」「dual-pass audit」「/deep-audit-cross-codex」
- **Solo mode**(2026-07-02 codify,user 主要入口):「深度稽核不用 codex」「/deep-audit-cross-codex solo」→ 跳過 Phase B,**其餘全跑**(Phase 0 + A.0 全盤閱讀 + A.1 全 dim + A.1b 對抗驗證 + A.2-4 + Phase C 含 C.0a prune)— 品質底盤不打折,唯失 codex 第二對眼(mitigation:A.1b multi-agent adversarial 仍在)。**禁**為此另開 skill(Rule-of-3;本 mode = B.0 fallback 路徑升 first-class)
- 重大 release / SSOT 大改 / 季度健檢
- 多輪修正後想雙 model verify

**不該 invoke**:single 元件小修(用 `/design-system-audit --scope=component`)/ 已知 surgical bug fix(用 `/bug-fix-rhythm`)/ 日常 dev(`visual-audit --scope=changed`)。

## Non-goals

- 不取代 `/design-system-audit --deep`(本 skill **chain** 它 Phase A.1)
- 不取代 `/codex-collab`(本 skill **chain** 它 Phase B)
- 不動 audit 觸發以外的 PR / branch ops(M28 由 user 拍板)

---

## Phase 0 — Cwd context detection(2-mode branching,2026-05-29 加)

自動偵測 cwd 切 scope:`packages/design-system/src` 存在 → **ds-repo**(full DS canonical scope,含 template scaffold;A.1 全 dim + chain `/product-ui-audit` 對 `apps/template` dogfood);package.json 含 `@qijenchen/design-system` → **fork-user-repo**(A.0/A.1 限 fork-side:dim 83 runtime + 完整 consumer/fork enforcement dim 集 58/59/62-64/69-71/73-76/82;propose scope 限 `apps/**`,**禁** propose DS source 改動,hooks 信任 committed C-prime 治理鏈);其餘 → non-ds exit。

detect_mode snippet / 為何 2-mode 不是 3-mode(3-mode = dead code)/ mode×scope 完整表 / fork-mode safety invariants 全文 → `references/phase-a-workflow.md`「Phase 0」。

---

## Phase A — Claude solo full audit(必先 NO-SAMPLE 跑完才進 Phase B)

### 🔒 全掃優先 + 決策 batch-at-end 鐵律(2026-07-11 user directive,Claude + codex 雙方永遠遵守)

**deep audit = 先把全 DS 掃完,最後才一次給 user 決策清單 —— 禁一個元件一個元件問。**

1. **全掃優先**:A.0 全盤閱讀 + A.1 全 dim + A.1b **全元件** NO-SAMPLE 掃完 → 收集 + **跨元件去重**所有 findings(cross-component drift 只有全部一起看才浮現,例:7 浮層 slide 距離 8px/50%/100% 三制式並存)。**禁**稽核**中途**針對單一元件停下問 user。
2. **決策 batch-at-end**:全掃完後,C.1 final report **一次**列出「經整體評估後**真是問題** + **只影響 SSOT-UI/UX**(視覺/行為/結構/跨元件設計語言/新 API contract)」的決策清單給 user 拍板。同類決策合併呈現讓 user 通盤權衡。
3. **非-SSOT-UI/UX autonomous**:doc 對齊 code / 誠實描述 / refactor / 命名一致 / pedantic 駁回 = Claude+codex **辯論共識** → autonomous 做到一致設計語言 + 世界級 + SSOT + 自驗到完美,**不打斷 user**。
4. **codex 同軌**:codex 走**相同**全掃流程(B.1 三重對等),**禁** codex 只做部分元件;codex findings 併入同一次 batch。

**反 pattern(禁)**:稽核途中「Tooltip 跑完→問 user→HoverCard 跑完→又問」piecemeal(抓不到跨元件 drift + 反覆打斷 + 同類決策分散難通盤權衡)。Anchor:2026-07-11 user 抓「你應該先全掃完再一個一個看違規…不然怎麼抓跨元件不一致?…全部稽核完最後再列真的需要我決策的(真問題且只影響 SSOT-UI/UX)要我拍板…其他你和 codex 辯論共識照建議做到完美」。

### A.0 — 全盤閱讀 preflight(M29 升級,**禁止憑記憶**)

**強制 read sweep**(不可 sample,不可挑)7 項:CLAUDE.md 全文 / 5 rules 全文 / 4 references(ssot-index 等)/ 全 spec.md ×86(components+tokens+patterns,Glob 列舉 + Read)/ session 對話脈絡 + memory index + active project memory / 全 SKILL.md ×22(2026-07-10 hunt 抓 row13 超前宣稱補真 — skill 文字宣稱 vs 行為是弱軸,A.0 至少保 read 層)。逐 file list canonical → `references/phase-a-workflow.md` A.0。

**完成 gate**:Phase A.0 output = `phaseA-preflight-checklist.md`(session-local,列出讀過的 N file + 任何 spec 漂移嫌疑點)。**禁** skip / sample / 「先看標題判斷」。

### A.1 — 跑全 dim NO-SAMPLE deep audit(chain `/design-system-audit --deep` SSOT)

**Dispatch plan auto-pickup**(2026-05-23 ship per user verbatim「infra 增刪改 audit 自動跟最新」):
必先跑 `node scripts/dispatch-audit-dims.mjs --summary` 取**動態 dim 列**(non-hardcoded),從 `.claude/logs/audit-dims-dispatch.json` 讀 sub-agent batch 分組。Heavy dims 自動標,新加 dim 自動 included,retire 自動排除。

**禁** hardcode dim range numbers(eg.「Dims 1-15」/「Dims 34-56」)在 sub-agent prompt — 用 dispatch-audit-dims.mjs output 的 `dispatchPlan.suggestedBatches[].dimNumbers` 動態填。

完整跑,**no sample / no escape**(對齊 `feedback_audit_full_sweep_not_sample.md` + `check_audit_sample_escape.sh` BLOCKER)。
每 dim sub-agent prompt 必含「DS-wide 全盤,禁 sample top N」。

**DETERMINISTIC dim 必驗「mode 真的有跑」(2026-06-11 加)**:script exit 0 ≠ 該 dim 宣稱的模式真的執行了 — 必看輸出證據(per-mode 計數 / cell label / scenario 數)確認 flag 真生效。Anchor:dim 51 `--matrix` flag 接受後 `MATRIX_CELLS` 定義但 main loop 從未消費(dead code),跑出來是無 matrix 的普通 scan + exit 0 = 連續假綠;另 cell 清單含 Storybook 不認識的 globals(hc/rtl)= 注入後靜默 fallback = 假覆蓋。兩層都要驗:flag→行為、行為→真值。

**PURE-JUDGMENT dim 真跑證據強制(2026-05-30 generalize,user 問「包括所有 infra 稽核?」)**:judgment dim(無 deterministic script / write-time hook 兜底者,含 infra 62/66/68/72 fork-onboarding/runtime/API-surface)report 必逐 dim show「DS-wide N files scanned + file:line findings / 或『0 after 全掃』」真跑證據,**禁只 mention dim 號**。report-validator `check_audit_post_report_validator.sh` Validator G 機械強制(evidence marker 數 < judgment dim 數 = BLOCKER)。DETERMINISTIC + HOOK-ENFORCED dim 由 CI / write-time hook 兜底,不在此 risk;tier 數禁 hardcode,以 `npm run audit:coverage-matrix`(`.claude/logs/audit-coverage-matrix.json`)動態值為準(snapshot 2026-07-10:24/40/27,total 91)。

**🚨 反抽樣鐵律 — 「機械涵蓋」必先 breadth-verify(2026-06-05 user 抓 story-title 又抽樣,verbatim「這個問題已經問你一百次了結果你還是抽樣」)**:把某 judgment dim 標為「DETERMINISTIC/HOOK 已兜底、不在 judgment risk」**= 一種抽樣**,除非該 gate 的偵測廣度被**證明**對齊 canonical。**強制兩步,缺一即視同抽樣**:
1. **Breadth-test**:對該 gate 注入一個「已知違規」樣本 → 跑 gate → 確認被抓(exit 1)→ revert。沒通過 = 該 gate **不算**涵蓋該 dim,退回 PURE-JUDGMENT 跑完整枚舉。
2. **完整枚舉 + partition-review**(judgment dim sample-proof 跑法):deterministic 腳本枚舉**全部單元**(eg. `gen-ds-story-manifest.mjs` — **scope 注意:regex 只收 components/internal 兩 family、元件名 ≤2 段,patterns/tokens stories 不在內**;story-name 類 dim 要真全集需直接讀 `storybook-static/index.json` 全 entries)→ 機械 auto-pass 明確合規者 → 剩餘 candidate **切 N chunk,每 chunk agent 審它每一個**(chunk 互斥涵蓋全集 → 每單元剛好審一次,數學上不可能漏)。**禁** agent 自選 top N。
- **錨例**:dim 40/41/43 被當「story-quality:check 已涵蓋」排除 → gate 有 detection gap(只抓 100%-English)+ scope gap(漏 anatomy/principles),放過 84 違規還報「0 violations」假綠。修:補 `name_mixed_english` + 全 storyFiles scope + breadth-verified。對齊 M34「spec broad + hook narrow = gap 必補」。

### A.1b — Claim-vs-code + docblock + spec-internal adversarial verification(MANDATORY,NO-SAMPLE,per-component)

**2026-05-30 anchor(user verbatim「之前他媽都在偷懶?」)**:獨立 adversarial 再審抓 **403 findings / 64 單元 / 202 FALSE_CLAIM**(doc 系統性記載 code 沒有的行為,如 Calendar 宣稱方向鍵導覽、Alert 記不存在的 `actions` prop)。根因 = 前期把 story-content dim(12/24/25/30/43 等)當「散文 looks-fine 掃」,沒 adversarial 讀 .tsx(+ wrap 的 lib)逐句比對宣稱。**為何不能純 grep**:prop passthrough(`...props` 轉發 Radix 等)使 naive prop-existence grep 必 over-flag 合法 prop(2026-05-30 建過即刪)→ **FALSE_CLAIM 驗證本質需 LLM 讀 source,故用「強制 + report-validator 確認真跑」機制保證**。

**強制流程**(deep-audit 每次必跑,no skip):
0. **機械 gate 先跑(deterministic,2026-06-02 加)**:`npm run typecheck:stories`(deterministic 抓 stories 的 `{var}`-undefined / prop 型別錯 —— **這是 SizeMatrix `{size}` crash 的真防線**;主 tsc -b exclude stories 故必跑此)+ `node scripts/storybook-smoke-test.mjs --full`(runtime crash render 掃)。先過才進 adversarial read。Anchor:2026-06-02 Field SizeMatrix `{size}` JSX-undefined crash 隨 beta.44 ship。**注**:smoke 全覆蓋 coverage-gate(防靜默-skip 假綠燈)attempted 但 CI server 規模化降級(~60 story 後 timeout 撞 20-min budget)→ **defer**(需 robust-server / browser-recycle + 可靠測試環境);故 typecheck:stories 是目前 deterministic 主防線。
1. **per-component(NO-SAMPLE,全 64 component + 全 pattern)** dispatch adversarial agent。
2. 每 agent 必 **Read 元件 .tsx + 其 wrap 的 lib(Radix/cmdk/react-day-picker/sonner 等)source**,對該元件**所有** anatomy / a11y / principles / spec 宣稱**逐句**比對:鍵盤 map / ARIA role / focus 行為 / prop 存在性 / 視覺 token / 預設值 / native-vs-custom。
   **+ 2026-06-04 補兩 lens(Dim 15 cross-doc 明文涵蓋但前期被「散文 skim」漏的同 class failure;非抽樣、非無覆蓋,是「有 dim 淺跑」)**:
   - **(a) 元件 `.tsx` 自己的 docblock / inline 註解 vs 同檔 code**:A.1b 原設計把 `.tsx` 當「真相來源」去驗別人(story/spec),**從不反驗它自己的註解** → docblock claim 的 padding / typography mode / hover / 行為 vs code 真實值,逐行比。
   - **(b) spec 段落間描述性一致(spec-internal cross-section)**:A.1b 原驗 claim-vs-code,**不驗 spec-段-vs-段** → 同一 spec 內 Mode 表 typography 標籤 / padding 值 / gap 值 / surface 行為,跨 section 不可打架。
   - **(c) token / pattern spec 的 cross-file consumer-list claims(2026-06-11 加)**:token spec 常有「消費者清單」宣稱**其他檔案**的行為(如 motion.spec「hover-card.tsx Provider 預設 override 為 --hover-delay-rich」)— per-component A.1b 只驗「該元件自己的 spec vs 自己的 code」,**cross-file 宣稱兩邊都不在誰的 claim set 裡 = 系統性盲區**。每個 token / pattern spec 的消費者清單必逐檔開 code 驗。Anchor:2026-06-11 hover delay 雙 drift(HoverCard 沒接 token / OverflowIndicator 誤 tier)連續多輪 deep-audit 漏抓,正是此 lens 缺;現另有 `scripts/audit-motion-delay-invariants.mjs` 機械凍結 motion 域。
   - **Anchor**:2026-06-04 user 抓「deep-audit 多次沒發現」—— tsx docblock(`閱讀模式 1.5` / `hover:bg-neutral-hover`,自 2026-04-23 stale)+ spec Mode 表 typography stale,全是 Dim 15 該抓、卻被當散文掃漏。納入此強制 adversarial(Validator F 檢查 A.1b 證據存在 keyword 級;逐 component 覆蓋由 A.1b 流程 + CP-A1b 自律),不再可 skim。
3. **「自上次 audit 無 code 改動」≠ 可跳過** —— content 宣稱可在 code 沒變下就是假的(前期正是用此藉口跳過 = 違規)。
4. output per-component:`{component, claimsVerified: N, falseClaims: [{fileLine, 宣稱, 真實 code 行為}]}`。
5. findings 併入 A.2 triage(FALSE_CLAIM 對齊 doc-to-code = autonomous;substantive design-language tension = HOLD propose)。

**完成 gate**:report 必含**每個** component 的 story-vs-code verdict(claimsVerified count + falseClaims list)。report-validator hook `check_audit_post_report_validator.sh` Validator F 檢查 A.1b 證據存在(keyword 級;deep-audit 規模 report 全缺 story-vs-code 證據 = BLOCKER),**不逐 component 計數** — 逐 component 覆蓋由本流程 + CP-A1b checkpoint 自律(見 Mechanical enforcement)。

### A.2 — Triage findings → 中文人話 propose SSOT-UI/UX / autonomous non-SSOT

**Scope classifier**(critical,先過):
- **SSOT-UI/UX substantive 增刪改** = 動 component / token / spec.md 視覺結構 / 跨元件 design language / 新 API contract → **STOP propose**
- **Non-SSOT**(bug fix / clean / refactor / 命名一致 / test / audit / verify / hook regex 加廣 / pointer 補 / spec typo / 漂移 mechanical 對齊)→ **AUTO 整批做完**

**SSOT-UI/UX propose 必過 gate + 中文人話 format**(SSOT 在主檔,不在此重述以免多處抄寫漂移):
- **Propose 前必過 7-Q gate**(Q0 先驗「問題是否真存在」/ Q1 cite / Q1' DS canonical 優先 / Q2 SSOT consume / Q3 Rule-of-3 / Q4 下游吸收 / Q5 issue 100% mapped)→ SSOT `.claude/skills/propose-options/SKILL.md`(hook `check_propose_pre_grep_verify.sh` soft warn 提示 Q0 — P1 stderr、僅 planning/reports/handoff md 寫入時 fire;reply 通道靠 M18 mindset);M18 為 meta anchor
- **中文人話 propose format + 禁用 jargon 對照表** → SSOT `.claude/memory/feedback_propose_discipline.md`(hook `check_propose_discipline.sh` r1 = Stop soft warn 自我修正訊號〔exit 0〕;r2 claim 無 cite 才 exit 2 BLOCKER)
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

**Solo mode 先判**:user invoke 含「solo / 不用 codex / 不要 codex」→ **整個 Phase B 跳過**(明文 opt-out,非故障 fallback;不跑 B.0 transport discovery),直接進 Phase C。Report 標注「撤回 codex:solo mode(user opt-out),Phase B skipped」——此句同時滿足 codex-transport stop hook 的 (b) 顯式撤回選項(該 hook 機械 grep turn 內容,solo 跑仍可能 fire,用撤回聲明過閘,勿被迫跑 discovery)。

### B.0 — Codex transport discovery(per codex-collab/SKILL.md Step 0.4)

3-test 順序固定(local 優先):`node_modules/.bin/codex` → `which codex` → `~/.codex/auth.json`。**禁 Explore agent 替身**(M31)。

**Auto-fallback policy(2026-05-29 加,fork-user 友善)**:
- 全 ❌ **且** cwd = `fork-user-repo` → **auto-fallback Phase A only**(不 interactive ASK),印中文:`「Codex 未裝(@openai/codex 不在你的 fork repo deps),skip Phase B 比稿。Phase A solo audit 已完整跑完。若要 dual-track 比稿請 npm i --save-dev @openai/codex 後重跑」`(2026-05-29 verified:`/tmp/ds-product-template/node_modules/.bin/codex` 不存在 = fork user 預設無 codex,此 fallback 為正常路徑)
- 全 ❌ **且** cwd = `ds-repo` → 報 user(DS owner config issue,需 fix)
- **禁** Explore 替身 / 嘗試 `sudo npm i -g` / 繞 M28 開 PR(per `memory/feedback_codex_exec_transport_canonical.md` Anti-pattern)
- **最強模型算力強制(2026-07-10 user directive「應強制使用 codex 最新最強的模型與算力」)**:codex exec **禁帶任何 `-c model_reasoning_effort` / `-m` 降檔 override** — `~/.codex/config.toml`(**無 model pin** + effort xhigh)= SSOT,不帶 flag 即繼承 CLI default(隨版本自動跟最新 model)。大型 brief 死局(r1-r4 anchor)對策 = `--dangerously-bypass-approvals-and-sandbox` + **只拆更小 single-axis focused brief 並行**、不降 effort(2026-05-29 死局根因是 brief 太大非 effort;降檔 = 稽核品質打折)。詳 `memory/feedback_codex_exec_transport_canonical.md` Rule 3
- **B.0 前置 freshness 閘(2026-07-10 加 + 同日二次升級,「不用 user 提醒」機制)**:brief codex 前**必先跑** `node scripts/check-codex-freshness.mjs` — (1) CLI 落後 npm latest → **直接自動 `npm i -D @openai/codex@latest`**(不問 user);(2) model pin 出現 → 刪(pin 鎖舊);(3) **effort = 探測出的最高可用檔**:檔位支援是執行期資料(server-driven),靜態查不到 → CLI 換版 / cache 缺 / pin 漂移 → **自動跑 `--probe`**(由高往低 1-行-prompt 實測,自動改 config pin + 寫 cache)。錨例:2026-07-10 裝 0.134.0 落後 10 版 + pin gpt-5.5;同日 user 抓「xhigh 不一定永遠最高」→ 實測 ultra 可用,probe 機自動 xhigh→ultra;unpin 後 default 解析 gpt-5.6-sol = OpenAI 官方對「大型可拆分複雜工作」的推薦組合(Ultra=多子代理並行,Max=單題深想 — 稽核屬前者,user 圖一 ChatGPT 引官方定位)。**B.0 必 relay 本次實際解析 settings(model + effort,取自 probe cache)進 C.1 report**;官方檔位語義若再變(新檔名出現)→ freshness 閘紅燈觸發重評,選「適合稽核」而非盲選最高名

- **Codex 失敗守衛(2026-07-10 user「codex 額度不足要通知我」)**:所有 `codex exec` 必經 `node scripts/codex-run-guarded.mjs`(--brief/--stdin)。outcome 非 SUCCESS(QUOTA/AUTH/EMPTY/ERROR)→ **立即 STOP + PushNotification 通知 user 處理**(額度耗盡 / 重登 / 縮 brief),**禁**把空/錯輸出當「codex 0 findings = clean」續跑(false-green)。詳 memory 「Codex 失敗守衛」段。

### B.1 — Brief codex 跑相同 Phase A 完整流程

**三重對等條款(2026-07-10 user directive「任務、擁有的資訊、閱讀的資訊都要一模一樣」)**:
(a) **任務對等** — 相同 Phase A 流程(A.0/A.1/**A.1b per-component claim-vs-code**/A.4,brief SSOT-pointer 指 SKILL Phase A 全段,hook 7️⃣ 驗 A.1b)+ 相同動態 dim 清單(dispatch 注入)+ 回程 dim 對帳(B.2 Step 0);
(b) **資訊/環境對等** — `-C "$PWD"` 同 repo root(同 spec/scripts/node_modules)+ bypass 可跑同一套機械驗證(M31 Step 2);
(c) **閱讀對等** — brief 閱讀清單**逐字鏡射 A.0 六項**(泛 glob 不算;hook 5️⃣ 驗 meta-patterns/memory 錨點);唯一結構性差異 = session 對話脈絡,以 user-verbatim(Step 0.05)+ Phase A 摘要補償(明文契約)。
(d) **判準對等(2026-07-10 user「同樣的完美標準」)** — codex 必讀 `design-system-audit/references/audit-prompts.md` 每-dim rubric + 逐 dim 套用(= Claude dim sub-agent 判準 SSOT);hook 6️⃣ 驗 audit-prompts 錨點。只給 dim 編號 = 標準不對稱。

Brief 必含 4 段(完整 template SSOT → `references/phase-b-codex-brief.md`,per codex-collab Step 0.05 user-verbatim faithful relay + Step 0.5 own-version invariant):**(1)** user 原話 verbatim(中英符號圖文全保)**(2)** Claude Phase A 結果摘要(P0/P1/P2 count + propose N 項 + landed M 項 file:line)**(3)** 請 codex 獨立跑相同 Phase A(全盤閱讀 + 全 dim NO-SAMPLE + 完整報告 + 不 frame 答案)**(4)** 回「你抓 Claude 漏 / Claude 抓你不同意 / 兩邊都漏」。Send via `codex exec`(local CLI per M31 Step 0.4)或 cloud `@codex`。

### B.2 — Receive codex report + Step 4 self-check + Step 4.5 verify

**Step 0(2026-07-10 加,user「codex 要稽核一模一樣的所有項目,有確保嗎?」)— dim 覆蓋對帳(mandatory,不齊禁進 B.3)**:
彙總全部 codex 回覆的「dim 覆蓋對帳段」→ 逐號對 `dispatch-audit-dims.mjs` 動態 dim 列;
**缺任一 dim → 補發該 dim 的 focused brief 再跑,不得以「大致蓋到」放行**。對帳表(dim 號 × Claude 掃了 / codex 掃了)必進 C.1 final report。
保證鏈三段:brief 端(check_codex_brief_invariants.sh 攔缺 invariant 的 brief)→ 回程端(本對帳步)→ 報告端(對帳表進 report 供 report-validator 掃)。

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

### C.0b — 判準化 harvest(predicate-ization,2026-07-07 user 拍板治理進化方向 1)

Deep-audit 收尾(C.0a 旁)**必跑**:讀 `node scripts/audit-coverage-matrix.mjs` 的 PURE-JUDGMENT gap list,**選 top 1-3 個本輪已充分理解的 judgment 維度,當場寫成 deterministic script**(invariant .mjs / hook rule);寫不成的必記一行「為何不能謂詞化」(品味 / 需 LLM 讀 source / 外部演進類)。**雙柱模型**:完整稽核 = 永久機構(存量 / 外來 / 漂移 / 防線腐化 / 品味五類永遠需要);謂詞化 = 稽核的機械化引擎——每類問題轉謂詞後,同一謂詞對存量與外來元件全量零抽樣免費掃,稽核不縮編、機械部分逐季變厚。KPI(PURE-JUDGMENT 佔比 trend)由 `/governance-health` 月度追蹤。SSOT → `.claude/planning/2026-07-07-governance-evolution-roadmap.md`。錨例:2026-07-07 selected/active meta 謂詞、VR shifted-clock(當場謂詞化,存量 63 元件一次掃平)。

### C.0b — 治理全軸覆蓋對照(2026-07-10 user「deep audit 會稽核所有治理軸嗎?要確保」)

收尾必讀 `.claude/references/governance-audit-coverage.md`(治理 home × 稽核者覆蓋表)逐 row 對照:
(1) 本輪新增/改動的治理物(新 hook / script / reference / registry / home)在表上**有 row 嗎**?沒有 → 當場補 row(誰稽核它、多常跑);(2) 表上 4 個弱軸(gate script meta-test / SKILL claim-vs-behavior / eslint 發佈 / planning 靜置)狀態有變 → 更新。**沒對照 = C 階段不完整**。

### C.0 — 收斂判準(rerun stop gate,2026-06-01)

決定「**再 rerun 嗎**」必過此 gate:deep-audit = LLM 對抗式 non-deterministic + 高假陽性,**追零 = 跑步機 + 誘發 regression**。STOP 判準 = **某輪 adversarial 二次驗證後真 material/regression = 0(只剩 marginal + false-positive)**——不追零、不過早收。收斂靠 CI gate + 寫入時紀律,非 audit loop。三分類表 + 「改一處看 N 處」→ `references/triage-rubric.md`「收斂判準」。

### C.1 — Final report(送 user)

四段骨架(Phase A 結果 / Phase B 結果〔含 B.2 Step 0 dim 覆蓋對帳表〕/ 待你拍板 / Verify artifact〔backlog 項必附 verifyCmd+fixedSignal 可攜指令,對帳 = `node scripts/verify-backlog.mjs`,2026-07-07 軌道 3〕)完整 template → `references/triage-rubric.md`「C.1 final report template」。

**每題必附「SSOT 理由:」一句**(= 為何這是「會影響 SSOT 的 UI/UX 增刪改」:新 API contract / 改 canonical 語意 / 新視覺 design language,三類之一,具體指出)。**寫不出 SSOT 理由 = 該題不是拍板題,移回 AUTO 自己做**(2026-06-11 user 第 3 次糾正 codify:bug fix / a11y 對齊 W3C / 對齊 spec 既有意圖 / story 內容 / 治理 / 補 rationale 文件 / dead code 清除,全部 AUTO 不問)。Hook `check_audit_post_report_validator.sh` Validator H 機械強制。

**🔒 決策品質四要件(2026-07-13 user verbatim「需我拍板的議題,不是應該確保你和 codex 來回討論辯論出來的共識與解法有研究過世界級的設計且符合我們需求與一致設計語言和設計原則並確保 SSOT?現在跟未來都應該要確保這件事永遠成立」)—— 每個送 user 拍板的 decision 必全備,缺一即不成熟、退回研究/辯論、禁送 user**:
1. **SSOT-check 先行**:先 grep 我方 spec + memory + user 歷史拍板,查**是否已有 canonical / 你已拍板過**。已有 → 對齊即可、移回 AUTO,**不重問**(錨例:2026-07-13 誤把 MenuItem-internal〔你 2026-06-05 Q2 已拍板「可 subpath 消費」〕+ menu selected×hover 色〔你 2026-07-04 Q2 已拍板 neutral-selected 且已 cite Ant/VS Code〕當「新決策」問你 → 應是 autonomous 對齊,不是拍板題)。
2. **World-class ≥3 cite(M26)**:每個真決策的 recommendation 必附 **≥3 家世界級 DS 在該情況的真實做法**(WebFetch 真 source + URL,禁憑印象)。
3. **Claude↔codex 雙軌辯論(M31)**:兩 model **各自獨立研究 + propose + cite battle → 共識**;禁單方憑感覺直接給 user。
4. **設計語言/原則 fit**:明寫此建議如何符合我方**既有一致設計語言 + 設計原則 + 需求**。
**判準**:decision block 缺「SSOT-check / ≥3 world-class cite / codex verdict / design-fit」任一 marker → 該題不成熟。Hook `check_audit_post_report_validator.sh` Validator K 機械強制(送 user 的 decision 缺四要件 marker → exit 2 BLOCK;2026-07-14 ship,letter I 已被 D3/D4/D5 chain validator 佔用故定 K)。

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
| **CP-B0** | B.0 codex transport | **solo mode(user opt-out)→ 整個 Phase B 跳過不進此 CP**;3-test 全 ❌ + cwd=fork → **auto-fallback Phase A only 印中文**,不 interactive ASK;cwd=ds-repo → 報 user;禁 Explore 替身 |
| **CP-B4** | B.4 cite battle | evidence 對等 → STOP 等 user 拍板,**禁** AI 自決誰勝 |
| **CP-C2** | C.2 push gate | 等 user「Push 到 main」trigger;禁 AI 自決 merge |

## References

- `references/phase-a-workflow.md` — Phase 0 detect/mode 表/fork-safety 完整版 + A.0 全盤閱讀 file list canonical + A.1 全 dim sub-agent dispatch template
- `references/phase-b-codex-brief.md` — codex brief template(B.1)+ Step 4.5 verify checklist + Step 5 比稿 matrix template
- `references/triage-rubric.md` — Scope classifier(SSOT-UI/UX vs non-SSOT)+ 中文人話 propose format + 收斂判準 + C.1 final report template
- `references/upstream-directives-r-mapping.md` — 上游 context / 框架(SSOT integrity invariant + 生態位 + canonical 全繼承)+ user-verbatim directives(2026-05-18 + 2026-05-29)+ 機械強制對齊清單(R18-R22 / R24-R26,R23 未單列詳檔頭)
- `references/skill-relationships-antipatterns-benchmarks.md` — 與其他 skill 分工 + Anti-pattern(永久 ban)+ 世界級對照
