---
name: knowledge-prune
description: Prune governance sprawl across provider-neutral instructions / specs / skills / hooks / memory / settings. Finds duplicate rules (Rule-of-3), dead hooks from the Git-owned provider telemetry state, stale memories, over-concrete bug case studies that should abstract to meta, and contradictions across homes. Enforces per-file budgets and quantifies quarterly retire rate without forcing deletion. Invoke quarterly or when governance exceeds its documented budgets. Auto-chained by /design-system-audit --deep Phase 4.5.
---

# Knowledge Prune — 治理反膨脹 skill

**目的**:本 DS governance 自身是活的知識庫,若只 append 會讓 provider-neutral canonical 載入成本失控、MEMORY.md 條目爆炸、hook 變殭屍、spec.md 重複。本 skill 依 `design-system-audit/references/rule-placement.md` 的 Level 1–9 taxonomy 與 provider registry 動態枚舉 canonical homes 找冗贅,提議 retire 候選,加嚴執行 Rule-of-3 SSOT + 行數預算;`.claude/**` / `.agents/**` 只是 generated provider delivery/discovery view,不參與 authority 枚舉或 retire 決策。

**🔒 核心前提(每次必遵,不需 user 提醒 — mindset #6「tell me once」)**:prune 唯一目的是**移除噪音以銳化 signal、提升遵循正確率**,**絕不以犧牲品質換行數 / 條目下降**。每次跑同時必滿足:(a) 品質不可因 prune 打折;(b) 以**提升品質**(清晰度↑ / drift 風險↓ / recall 精度↑)為目標。故:① 只 retire 真冗餘 / stale / 已被上游完整吸收的條目(這類本身是噪音,清掉反提升正確率);② consolidate 重複(同概念多 home → 選 SSOT + pointer);③ **每條真實 invariant / 機械防線必完整保留 — retire 前必 grep 確認保護已被別處覆蓋,否則不動**;④ distinct 條目強合成大條目會降 recall 精度 = 反 pattern,不做。**retire rate 是結果指標非目標**:湊 % 傷品質 = 違本前提;寧可 retire rate < 5% + report 明寫「成熟無冗餘」rationale,也不強刪真保護。本前提 override 下方所有 Phase / Checkpoint 的數值 target。

**對齊 `AGENTS.md` `# 治理 canonical`**:本 skill 是 L3(Periodic deep)實作。L1(pre-write hook)自動執行;L2(fire log)要 `GOVERNANCE_TELEMETRY_OPT_IN=1` 才寫(預設關,見 D2)；L3 的純工程治理 retire／consolidate 決策已 standing-delegated，依 evidence 與最高可用工程能力自主收斂。只有 task／deliverable 明確要求時才啟動 independent review；明確 waiver 必記錄且不得冒充已做。

**Authority boundary**:canonical substantive 本身不是 human gate。只有 resolution 會改變產品／UI／UX SSOT 且仍存在真實取捨才 **STOP**；治理 ownership、hook/skill lifecycle、架構與表達／duplicate／pointer 都依 `AGENTS.md # 自主執行 canonical` **AUTO**。

## When to run

- Bootstrap instructions(`AGENTS.md` + provider import shell) 超過 800 行(由 `session_start_governance_check.sh` Check 1 判,超過 800 才出 BLOCKER context)
- memory 索引條數超過 `governance/memory/contract.json` 的 `maxIndexEntries`(由 `scripts/validate-memory-contract.mjs` 判,CI 會紅)
- 季度健檢(每 3 個月跑 1 次)
- `/design-system-audit --deep` Phase 4.5 自動 chain
- 單一 spec.md 超過 `check_file_size_budget.sh` case 表的上限(寫入當下判:超過預算只警告;寫完超過過渡上限而且這次變長才擋)

## Non-goals

- 不動 code(`.tsx` / `.css` / `.ts`)— 只動 governance 文件
- 不 retire 被 hook / skill 仍引用的 rule(先改 consumer,再 retire)
- 不刪歷史 commit / git log
- 不 rewrite spec.md 內容(只刪 duplicate / 提議合併,實質改寫走 `/design-system-audit`)

## Workflow(5 phases)

### Phase 0 — Baseline scan(AUTO)

依 Level 1–9 taxonomy + canonical provider registry 動態枚舉 homes，建立基準表（下表是最低必含，不是封閉清單）:

```
Home              Size           Over-budget?
─────────────────────────────────────────────
Bootstrap         N lines        [AGENTS.md + provider import shell;target ≤ 250 / transition ≤ 400 / hard cap 800]
MEMORY.md         N entries      [≤20]
spec.md total     N files        per-file 分級(check_file_size_budget.sh case 表,非一律 300)
SKILL.md total    N files        per-file ≤250
hooks             N scripts      (count only, D2 看 fire log)
memory files      N              per-file ≤100
<absolute-git-dir>/governance-runtime/evidence/ parse existing evidence(feed Phase 3)
```

**Output**:`phase0-baseline.md`(session-local,不 commit)

### Phase 0.5 — 讀 external signal(AUTO)

讀 Git-owned provider-neutral evidence `<absolute-git-dir>/governance-runtime/evidence/` + provider telemetry `${GOVERNANCE_STATE_DIR}` + benchmark 產物 `infra/governance/runtime/benchmarks/`(由 `governance/benchmarks/fetch.sh` 手動抓;policy 見同目錄 README):

- `hook-fires.jsonl` — governance-file edits(tool/path per event);用於 hot governance files 分析
- `hook-fires-per-hook.jsonl` — per-hook fire count(2026-04-25 起);via canonical shared helper `packages/design-system/ds-canonical/hooks/_log-fire.sh`;啟用 D2 dead-hook detection
- `skill-invokes.jsonl`(若存在)— 過去 3 月每 skill invoke 次數
- `user-corrections.jsonl`(若存在)— pending codification 清單
- `infra/governance/runtime/benchmarks/claude-code-features.md` — 新 CC feature 採用提議
- `infra/governance/runtime/benchmarks/external-ds-snapshots/*.html` — Polaris / Material / Atlassian 近期更動

**Output**:外部 signal 摘要(送 Phase 3 judging)

### Phase 1 — 10 維 scan(D1–D10,並行 sub-agent)

依維度分 sub-agent 並行跑(D5–D10 細節在 references/prune-dimensions-d5-d10.md);**每一維都要回報「有候選 / 無候選 / 儀器全盲」三選一**,不得因本節只展開 D1–D4 就略過 D5–D10:

#### D1 — Duplicate across homes(Rule-of-3)

Scan:同概念(同 keyword / 同 canonical)出現在 ≥ 3 個不同 home 寫完整 rule?

Example violations(historic — 2026-05-22 prune verify 後均已收斂為 pointer 模式,僅留作教學範例):
- `Portal 逃脫 theme`:過去在 hover-card.spec.md / avatar.spec.md / color.spec.md 各重述;現只 M3 SSOT + 各 spec pointer。2026-05-22 audit verify 為已對齊(僅 ui-development.md / meta-patterns.md 2 home 涉及,clean pointer)
- `Inline Action vs Button predicate`:過去 `AGENTS.md` / item-anatomy.spec.md / button.spec.md 各完整;現 `inline-action.spec.md` 為 SSOT,其他 cross-link
- 新範例(2026-05-22 抓):**hook count threshold** 在當年 `AGENTS.md` `# 治理 canonical` 行數預算表(現已移除)/ meta-patterns M14 / M20 / `session_start_governance_check.sh` 4 處 drift 3 值(40/35/30)→ M14/M20 strip 數字改 pointer SSOT 修

**Output**:duplicate cluster 清單 + 建議 SSOT home。

#### D2 — Dead & stale(fire / edit recency)

- **Dead hooks**:跑 `npm run audit:hook-quality`(= `scripts/audit-hook-quality.mjs`,讀 Git-owned provider telemetry `${GOVERNANCE_STATE_DIR}/hook-fires-per-hook.jsonl`,產 report → `<absolute-git-dir>/governance-runtime/evidence/audit/hook-quality-report.json`:每支 hook 的 `fires6mo` / `firePerDay` / `classification`(hot / warm / cool / dead / not-instrumented / dispatched / orphan / unknown)/ `retireCandidate`)。6 月 0 fire 的 hook 名 → retire 提名(report 已標 `dead`)
  - **⚠️ 先決條件:遙測預設是關的,關著的時候這一維產不出任何東西。** `packages/design-system/ds-canonical/hooks/_log-fire.sh` 開頭是 `[ "${GOVERNANCE_TELEMETRY_OPT_IN:-0}" = "1" ] || return 1`,而 `infra/governance/lib/managed-host-assurance.mjs:1620` 與 `scripts/governance-check.mjs:2980` 明寫 `'0'` —— 也就是說**一般情況下沒有任何 hook 在寫這份 log**,零筆是預設狀態不是觀察結果。
  - 先看 report 的 `summary.observation`:`blind: true` 代表觀測窗沒有涵蓋分類窗(log 的最早一筆晚於窗頭,或最後一筆離現在太久),此時零筆 hook 都不標 `dead`(不寫紀錄的標 `not-instrumented`、dispatcher 子規則標 `dispatched`、其餘標 `unknown` / `unknown-orphan`;優先序見 `scripts/lib/hook-fire-observability.mjs` 的 `classifyHook`),`retireCandidates` 恆為 0。**這種報告不得用來 retire 任何 hook**,本維度當次直接記「儀器全盲、無候選」。
  - 要讓這一維真的能用:`GOVERNANCE_TELEMETRY_OPT_IN=1` 讓 hook 開始記錄,累積滿一個分類窗(6 個月)之後再跑。判準與兩面對照組:`scripts/lib/hook-fire-observability.mjs` + `scripts/test-audit-hook-quality.mjs`(紅面:空 log → 0 提名;綠面:健康 log → 仍然標得出 dead)。錨:2026-09-24 這一維把全部 60 支 hook 標成 `dead`,而同一天 Stop hook 才剛擋過我好幾次 —— 典型 M37「沒觀察到」被當成「沒發生」。
- **Stale memories**:只枚舉 repository SSOT `governance/memory/*.md`；以 `git log -- governance/memory/<file>`、`governance/memory/MEMORY.md` index 與 `governance/memory/contract.json` 判斷。不得讀取或回寫任何 provider home/cache 來決定 authority。
- **Unused skills**:`skill-invokes.jsonl` 3 月 0 invoke(除非是 rare-event skill,例 `delivery-handoff`)。前提同 Dead hooks:這份 log 也要開遙測才寫,而且收不到 user 打 `/name` 的 slash 呼叫;log 不存在或沒涵蓋 3 個月 = 儀器全盲,本項記「無候選」
- **Commands / context-fork agents**(2026-07-10 hunt 補,原零掃描):先讀 `packages/governance/canonical/providers.json` 的 `canonical.roots.commands` 與 `canonical.roots.contextForkAgents`,再對這兩個 canonical tree 做 enumeration。Commands 對照 `skill-invokes.jsonl`(命令同走 registered skill invocation log);context-fork agents 無 invoke log → 用 canonical file 的 git log recency + transcript grep 判 dead。Provider views 只驗 generated projection,不參與 dead/retire 決策。
- **References orphan**(2026-07-10 hunt 補):枚舉 `packages/design-system/ds-canonical/references/*.md`,rg 檔名 across `packages/design-system/ds-canonical/{skills,hooks,rules,references}/`(扣掉檔案自己與 README 索引)+ `AGENTS.md` + `packages/**/src/**`(含 `*.spec.md` 與程式註解)+ `scripts/` + `infra/governance/`,排除 generated provider view / planning / archive;0 cite = retire 候選(2026-11-17:只搜 skills / AGENTS / spec / hooks 會把 drag-canonical、certified-surfaces、tailwind-gotchas 誤報成孤兒)。Provider views 僅可用 mirror-check 驗交付完整性,不能反向證明 canonical 在使用。
- **Stale marker 兌現**(2026-07-10 hunt 補):`marker='stale''-pending-prune'; rg -l "$marker" packages/design-system/ds-canonical/ governance/ AGENTS.md` → 命中即列 update/retire 候選；命令與教學文字不得直接含 marker literal 造成自命中；generated provider view 的同源命中不重複計數。

**Output**:retire 候選 + rationale(`fire=0 / last_edit=2025-10 / 被 M14 吸收`)

#### D3 — Over-concrete case studies

Scan:Meta-Pattern / spec / memory 條目是「單次 bug 敘述」而非「meta 抽象」?

Example:
- M-row 是「2026-04-22 Dialog autoFocus tooltip 洩漏 / body 未用 ScrollArea / ... 7 題炸」這種純敘述 → 是否該抽成「凡 overlay + subtree context,必 self-scan N 題」的 meta rule?
- feedback memory 條目:「2026-04-21 User 抓到 applicable-where-meaningful」→ 是否已被 M10 / M14 吸收?

**Output**:候選 abstract proposal + 被吸收後可刪的下游條目

#### D4 — Cross-home contradiction

Scan:`AGENTS.md` canonical vs spec.md vs skill reference 描述同概念時**語義衝突**(非表達差異)?

Example:
- `AGENTS.md` M3 說「Portal 必繼承 data-theme」;但 avatar.spec.md 說「Portal 必繼承 data-theme + data-density」— 差 `data-density`,看誰真 SSOT
- `AGENTS.md` `# 稽核 canonical` 列 D4 UX 同時也談 3-tier scope — 2026-04-24 已合併為一章(原本 2 章重疊)

**Output**:matrix of 衝突點 + 誰該讓步

#### D5-D10 — 2026-05-17 加維度(各維 scan + Example + Output 詳 references/prune-dimensions-d5-d10.md)

D5 Canonical drift(spec vs code)/ D6 Hook-fire health / D7 Skill-invoke health / D8 Memory recency-orphan / D9 Benchmark-citation debt(M22)/ D10 Verification artifact rot(M32)。

### Phase 2 — Triage + authority classification

```
Phase 1 findings(D1-D10):
- D1 duplicate: M clusters
- D2 dead/stale: N items
- D3 over-concrete: K items (abstract proposals)
- D4 contradiction: L pairs
- D5-D10(2026-05-17 加,detail 詳 references/prune-dimensions-d5-d10.md): D5 canonical drift / D6 hook-fire health / D7 skill-invoke health / D8 memory recency-orphan / D9 benchmark-citation debt / D10 verification artifact rot — 各 N items(每維必寫「有候選 N / 無候選 / 儀器全盲」其一)

Priority:
- P0 (AUTO): 對齊 SSOT / 補 pointer / 刪 confirmed dead hook / retire unused skill — 表達層調整,不動 canonical 意思
- P1 (AUTO with brief report): 合併 duplicate(保 semantic)/ 刪 6+ 月 stale memory(非 critical)/ 編號 renumber
- P2E (AUTO):抽工程治理 meta / 解 governance contradiction / 撤工程 Meta-Pattern / 改治理 SSOT ownership；若 task／deliverable 明確要求 review，再加 maximum-assurance independent review
- P2H (HUMAN-ONLY):resolution 會改變產品／UI／UX SSOT，且 evidence 收斂後仍有真實選擇或取捨

Execution receipt:P0/P1/P2E 的分組、evidence、review binding、rollback；P2H 若有則 batch-at-end 一次列出。
「要 user 決定」只准出現在 P2H。遙測開關、要讀主資料夾(user 本機、代理不准讀)才能判的東西,寫進「量不到 / 外部前提」,不寫成要 user 決定。
```

**Do NOT skip authority classification**:純工程 canonical substantive 必自主執行，不能用 user sign-off 代替工程判斷；只有 P2H 停下。

### Phase 3 — Apply P0 + P1 fixes(分組 commit)

- 每個 cluster 一個 commit(`prune: duplicate X → SSOT owner Y / pointers elsewhere`)
- 每個 prune commit(含 Phase 4 的 P2 commit)訊息末尾都要帶 `Prune-Items: <Phase 1 ID>` 與 `Phase0-After: <bootstrap 行數>/<hook 數>/<meta-patterns 字數>`;P2 項再加 `Prune-Priority: P2E|P2H` 且只准 1 個 ID。格式見 references/phase5-report-template.md「prune commit 訊息」,`validate-knowledge-prune-run.mjs --commits-only` 會驗;歷史不改寫,漏了事後補不回來
- 每個 commit:跑跟這個 commit 改到的檔有關的檢查,並重量 Phase 0 寫進 `Phase0-After`(確認 size 有下降;validator 只驗格式、不重算數字)
- 全套(`npm run governance:generate` 後 `npm run governance:check` + `node scripts/validate-memory-contract.mjs` + `npm run test:reciprocal-pointers`)在最終狀態跑一次,再推 CI(prune 不動 code;要防的是治理檔與指標斷鏈,`tsc -b` 根本不看這些)。依據:`governance/memory/feedback_propose_discipline.md` Sub-rule 9 How to apply —— 本機 / CI 各跑什麼照 `rules/work-process.md`

### Phase 4 — P2 resolution + apply

- 每 P2 item 一個獨立 commit(animation trail 可回溯)；P2E 依最高 certified capability + evidence 自主收斂，只有明確要求時才加 independent review；P2H 只在取得產品／UI／UX決策後執行
- 新 meta-pattern 加進 `packages/design-system/ds-canonical/rules/meta-patterns.md`「# Meta-Pattern 預警」(AGENTS.md 沒有這一章,只有指標)→ 同時**必檢討哪些下游條目冗餘**(上游加 = 下游減)

### Phase Z reference — Cross-repo SSOT propagation

詳 references/phase-z-cross-repo-ssot-propagation.md。跨 repo 傳播由 protected PR merge 後的 immutable release workflow + GitHub App upgrade PR 統一觸發；skill 不自行 dispatch、直寫 main 或解析 mutable tag。

### Phase 5 — Final report + **quantified retire rate** + baseline update

**Retire rate 計算公式**(從 aspirational 轉 quantified,2026-04-24):

```
total_governance_items_before =
  count(AGENTS.md 章節)
  + count(Meta-Pattern 條目)
  + count(packages/design-system/ds-canonical/skills/)
  + count(packages/design-system/ds-canonical/hooks/)
  + count(MEMORY.md entries)
  + count(memory files)
  + count(spec.md SSOT anchors)

retired_this_quarter = items 本次 /knowledge-prune 刪 / 合併 / 撤

retire_rate = retired_this_quarter / total_governance_items_before
```

**Target**:≥ 5% / quarter。< 5% 不一定壞(系統已成熟 / 無冗贅),但必在 report 明寫 rationale(「成熟 — 無 retire 候選 / stable ecosystem」),不可空白。

**報告格式**:照 references/phase5-report-template.md(段落、Metric delta 五列、逐維三選一、逐項結局、被擋的指令;範本只有那一個住所,validator 讀同一份)。

**完成條件**:完成 = `node scripts/validate-knowledge-prune-run.mjs …`(參數見範本檔「怎麼跑」)exit 0;push、CI 綠都**不是**完成條件。

Update `${GOVERNANCE_STATE_DIR}/metric-snapshots.jsonl`(provider-neutral Git telemetry state;`tag` 寫 `knowledge-prune`、`base` 寫這輪起點 commit,validator 比對的是最後一筆這個 tag 的行,認 base 不認日期;計數欄位名照 `stop_passive_logging.sh` R3 的 v3):

```json
{"ts":"2026-04-24","tag":"knowledge-prune","base":"ac52e21e","retire_rate":0.07,"retired":5,"total_before":71,"instruction_lines":238,"hooks_total":18,"skills_total":13,"memory_entries":29}
```

**讀取端**:`/governance-health`「2d. 退場率連續偏低 → 換 `/knowledge-prune` 掃描策略候選」讀這些列(三季判準與「資料不足」怎麼報都在那一段,本檔不重述)。

## Authority gates(禁止把 milestone 變成人類工程核准)

### Gate 1 — Phase 2 triage(見上)

### Gate 2 — 動 Meta-Pattern(P2)

撤／合併／改寫工程治理 Meta-Pattern 由最高 certified capability 依全 repo evidence、tests 與 rollback 自主決定；若 task／deliverable 明確要求 independent review 才把它納入 required evidence。若條目本身定義產品／UI／UX SSOT 且存在真取捨，才列 P2H 給 user 拍板。

### Gate 3 — 抽新 canonical

Phase 1 D3 發現 5+ 條下游條目可被新 meta 吸收 → 建立新 Meta-Pattern 前走命名三 test + world-class benchmark；只有 task／deliverable 明確要求時才加 independent review(對齊 `AGENTS.md` M8 / M12)，工程 governance 直接落地。

### Gate 4 — Retire 率 < 5%

季度 prune 若 retire 不到 5%,由 evidence 判定是(a)成熟無冗餘或(b)judgment 太保守，report rationale；不得為達數字強刪，也不得把純工程判斷轉交 user。

## Retire rules(執行規則)

| 項目 | Retire criteria |
|------|-----------------|
| Hook | 6 月 `hook-fires-per-hook.jsonl` 0 fire + 無 future-planned consumer。**前提:report 的 `summary.observation.blind` 必須是 `false`** —— 全盲時零筆不是證據,見 D2;全盲時改用靜態判準(references/prune-dimensions-d5-d10.md「遙測全盲時的靜態退場判準」) |
| Skill | 3 月 0 invoke + 非 rare-event skill(release-cut 類可例外)。**前提同 Hook 列**:skill-invokes 要開遙測才寫、收不到 slash 呼叫,全盲時零筆不是證據 |
| Meta-Pattern 條目 | 被新上游 meta 完全吸收 + grep 無引用 |
| Memory file | 6 月未更新 + 現況已不符 + MEMORY.md 無 head pointer |
| Spec 段落 | 被 SSOT pointer 取代 + grep 無外部引用 |

**Hard rule**:retire 前必 grep 全 repo 無 reference,避免斷鏈。

---

## 世界級對照

詳 references/world-class-prune-alignment.md(Elasticsearch ILM / Linux kernel doc policy / Python PEP 387)。

## 與其他 skill 的分工

| Skill | Scope | 不重疊點 |
|-------|-------|---------|
| `/design-system-audit` | **full-dim DS code + spec audit**(Phase 0 自建 baseline) | 不管治理文件冗贅 — 找 bug / drift,不 prune governance 大小 |
| `/knowledge-prune` | **治理文件冗贅 + 行數 + 矛盾** | 不 audit DS code 本體 — 管 governance 不管 DS |
