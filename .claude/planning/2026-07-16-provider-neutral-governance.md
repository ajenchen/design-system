# Provider-Neutral Governance(PNG)— Master Plan(2026-07-16,user 拍板動工)

**目標(user verbatim 濃縮)**:「確保我能夠在各種 AI 服務下都能產出完美品質的產出…兩者都能被同樣嚴格的鞭策…確保 SSOT,讓我未來增刪改任何都必定能同步而不會偏移」。
**正式定義(採 codex 規格)**:Claude 與 Codex 同等治理 = **相同 SSOT、相同 applicable rule coverage、相同證據要求、相同 blocking outcome**——不要求兩者用相同原生機制;provider 能力不足 → provider-neutral verifier/CI 補足,否則該 surface = Unsupported(fail-closed,禁靜默降級)。

**本檔地位**:PNG 工程的執行軌道 SSOT。後續任何 session/executor 從本檔接續;每完成一項就地打勾 + 記 commit。codex 產出的 27 節規格(user 貼於 2026-07-16 對話)為 requirements 參照;本檔為「映射到本 repo 真實現況」的執行版。

---

## 0. Ground-truth 現況(2026-07-16 盤點,file:line 級)

### 已存在且符合目標架構的資產(消費不重造 — M23)
| 資產 | 現況 | PNG 角色 |
|---|---|---|
| `.claude/{rules,skills,hooks,references,commands}` + `*.spec.md` + `CLAUDE.md` | canonical 治理內容 | **SSOT 本體**(內容不動,結構重整) |
| `scripts/sync-ds-canonical.mjs` | repo `.claude` → `ds-canonical/` mirror + `--check` drift gate | 既有 projection 引擎(加 codex target) |
| `scripts/build-fork-governance.mjs` | .claude SSOT → fork 治理 corpus(hooks+preamble),**classify 漏接閘 + drift gate + 假 fork harness** | 既有 adapter 生成器 + 三重保證鏈範本 |
| `scripts/sync-all.mjs` / `npm run sync-all` | consumer 端一鍵同步 | 既有 sync 入口(擴充) |
| `scripts/release-preflight.mjs` | ~30 deterministic gates,fail-fast,HEAD-bound pass-marker | **provider-neutral 最終 authority 已存在**(純 node,無 provider 依賴) |
| `.github/workflows/release.yml` audit gates + ci.yml | CI 強制 | 不可繞過層(需驗 branch-protection = 未驗項) |
| `ds-canonical/`(npm ship)+ `cli-init.mjs` | consumer 治理 payload + init | npm 投影(加 AGENTS/codex 內容) |
| `verify-published-deploy.mjs` / `dogfood-prepublish-verify.mjs` | 發佈後/前驗證 | 既有 clean-room 驗證(擴 codex 斷言) |
| `check-codex-freshness.mjs` / `codex-run-guarded.mjs` | codex CLI 版本/模型/effort 自動最新 + 失敗守衛 | 既有 codex transport 基建 |
| `audit-prompts.md`(per-dim rubric)+ `audit-coverage-matrix.mjs`(91 dim 三級分類)+ `verify-deep-audit-coverage.mjs` | 判準 SSOT + coverage 機械帳 | **rule registry 的雛形**(補 rule-ID 化) |
| deep-audit-cross-codex B.1 三重對等(brief 注入) | codex 吃相同任務/資訊/判準 | second-opinion 現行 transport(升級為 native discovery 後保留為深稽核模式) |

### 缺口(codex 規格 §3-4 疑點逐項 ground-truth)
| # | 缺口 | 證據 |
|---|---|---|
| G1 | **AGENTS.md / .codex/ / .agents/ 全不存在**(repo + npm + template + fork corpus)| `ls` 0 hit(2026-07-16)|
| G2 | npm `files` 只帶 CLAUDE.md + ds-canonical(Claude-oriented)| package.json files field |
| G3 | codex 治理靠 per-brief 注入(deep-audit B.1),**非 repo-native discovery**;user 直接開 codex CLI 在本 repo = 裸奔(僅 ~/.codex 全域 config) | codex-collab SKILL 全鏈 |
| G4 | fork/template consumer 的 codex surface = 0(fork corpus 只生成 Claude hooks/preamble)| build-fork-governance.mjs targets |
| G5 | rule 無穩定 ID(91 dim 有號但 spec 條文無 rule-ID;waiver=escape marker 無 expiry/owner schema)| audit-coverage-matrix |
| G6 | branch protection / required checks 未機械驗證(release.yml 存在≠enforced)| codex 規格 §16;現無 probe |
| G7 | Certified Surface Registry 不存在(cloud/local 支援度散在 memory)| reference_cloud_governance_loading.md 有實證但非 registry 格式 |
| G8 | CLAUDE.md 混 provider-neutral 治理內容與 Claude 專屬機制敘述 | CLAUDE.md 全文 |

### 官方文件研究(M26,2026-07-16 fetch)
1. **AGENTS.md 標準**(https://agents.md):root + nested(closest wins)、純 Markdown、60k+ 專案、Codex/Cursor/Copilot/Jules 等支援。
2. **Codex 官方**(https://learn.chatgpt.com/docs/agent-configuration/agents-md):discovery = `~/.codex/AGENTS{.override,}.md` → git-root→cwd 逐層串接(近者後讀=優先);合併上限 `project_doc_max_bytes` 預設 32KiB;fallback 檔名可設。hooks/skills 另文件(Phase 2 補研究;**不得假設 PreToolUse 可 block**)。
3. **Anthropic 官方**(https://code.claude.com/docs/en/memory):CLAUDE.md 支援 `@AGENTS.md` import(**官方明文推薦此模式共用**);import 遞迴 4 層、launch 時全載;`.claude/rules` 為 Claude 專屬 discovery;managed policy 不可被排除。
4. 補充既有實證:memory `reference_cloud_governance_loading.md` — Claude cloud committed `.claude` 4 hook events 會 fire、plugin 不可靠;C-prime fork 治理雲端端到端已蓋章。

---

## 1. 目標架構(ADR)

### ADR-1:Bootstrap 統一 = AGENTS.md(canonical)+ CLAUDE.md(=@AGENTS.md + Claude 段)
- 新 `AGENTS.md`(repo root,手維護 canonical):**provider-neutral 治理核心** = 6 mindset、治理/稽核/SSOT canonical、命名、任務導航、rule index pointer、autonomous canonical、「找不到→問」協議。**≤32KiB**(Codex cap;現 CLAUDE.md ~200 行遠低於)。
- `CLAUDE.md` 改為:`@AGENTS.md` + **Claude 專屬段**(hook 機制細節、.claude/rules 說明、plugin/skill 路徑、memory 機制)——Anthropic 官方 pattern,Claude 載入內容**零損失**(import launch 全載),Codex 原生吃到同一份核心。
- **禁 symlink 作唯一機制**(Windows/tarball/zip;官方亦標注)。
- 遷移判準:CLAUDE.md 每一段標 N(neutral→AGENTS.md)或 C(Claude-specific→留 CLAUDE.md);不確定 = N(嚴格度不弱化)。

### ADR-2:Codex 原生層 = AGENTS.md + 指路式 progressive disclosure(非復制 rules)
- `.claude/rules/*.md` 是 Claude 專屬 discovery;**不複製**成第二份。AGENTS.md 內建「Rule Index」段:列每條 rule 檔案路徑 + 一行摘要 + 觸發情境(「編 *.spec.md 前必讀 .claude/rules/spec-rules.md」)——Codex 有檔案讀取能力,index 即 progressive disclosure(對齊 Codex 官方 size 建議)。
- `.codex/config.toml`(repo-level 若 Codex 支援 project config;Phase 2 研究確認,不支援則記 Unsupported 不虛構)。
- Codex hooks:**Phase 2 研究後定**;短期 blocking 由 preflight/CI 兜底(= Certified with equivalent controls 路徑)。

### ADR-3:最終 authority = 既有 provider-neutral gates(不新造引擎)
- `release-preflight.mjs` + release.yml/ci.yml **已是** codex 規格 §16 要求的「不可繞過層」(純 node scripts,任何 provider 寫的 code 都被同一套擋)。
- PNG 增量:(a) AGENTS/CLAUDE 一致性 drift gate 進 preflight;(b) branch-protection probe(可讀權限→機械驗;不可讀→doctor 顯 Unverified,**不宣稱 enforced**);(c) governance-tamper 偵測(改 gate 本身需獨立 review 的 CI 規則)。

### ADR-4:Second opinion = provider-neutral 概念,deep-audit-cross-codex 為 alias
- Canonical 概念改名 `independent second opinion`:author provider ≠ reviewer provider(family 級);rubric = audit-prompts.md(已 SSOT ✓);記錄雙方 provider/model/version(codex-run-guarded 已記 ✓);backend 不可用→fail-closed 標 pending,**禁同 agent 假扮**(已 canonical ✓)。
- skill 保留現名(user 慣用入口),SKILL.md 補「本 skill = independent-second-opinion 的 Claude-side driver;Codex-side driver = 對稱 brief(未來 AGENTS.md skill)」。

### ADR-5:Certified Surface Registry = 檔案化 + 誠實三態
- 新 `.claude/references/certified-surfaces.md`(SSOT)+ 機械投影進 doctor。三態:Certified / Certified-equivalent / Uncertified。**只有實測證據能升級狀態**;cloud 未測 = Uncertified,不推定。

### ADR-6:rule-ID 化採漸進(不 big-bang)
- 既有 91 dim = 事實上的 rule registry(有分類/機制/coverage 帳)。Phase 3 給 dim 補穩定 ID(`DS-<domain>-<nnn>`)+ severity(Critical 標記)+ waiver schema(owner/expiry/scope),**不重寫內容**。escape markers 升級為 waiver 格式(向下相容,舊 marker 過渡期 ratchet)。

---

## 2. 分階段執行(每階段有驗收;按序;可跨 session)

### Phase 1 — Bootstrap 統一 + drift gate(本 session 動工)
- [x] P1.1 建 `AGENTS.md`:從 CLAUDE.md 遷移 N 段(mindset/治理/稽核/SSOT/命名/導航/autonomous/協議/失敗記憶索引)+ 新增「Rule Index」段(指路 .claude/rules + audit-prompts + spec 家族)+「Independent second opinion」段 +「最終 authority = preflight/CI」宣告。
- [x] P1.2 改 `CLAUDE.md` = `@AGENTS.md` + Claude 專屬段(hooks 機制、rules 載入說明、skills/commands 路徑、memory、plugin 邊界)。
- [x] P1.3 新 `scripts/check-agents-bootstrap.mjs`:斷言 (a) AGENTS.md 存在且 ≤32KiB;(b) CLAUDE.md 首個非註解內容 = `@AGENTS.md`;(c) AGENTS.md 的 Rule Index 路徑全部存在(死鏈 = fail);(d) 兩檔無重複 normative 段(標題級 dedup 掃描)。wire 進 release:preflight + breadth-test。
- [x] P1.4a npm files 加 `AGENTS.md` + `sync-ds-canonical.mjs` 鏡 AGENTS.md(shipped mirror 同步,gate A5 驗)— commit d88ceac2
- [ ] P1.4b(移入 P2.4)`cli-init.mjs` / fork corpus 投影 AGENTS.md 到 consumer + init root 計算查驗(§4 疑點)
- [x] P1.5 驗收:battery 全綠(tsc/agents-bootstrap/mirror/counters/content-quality/linkto/hook smoke/dangling-ref);**codex canary probe 實測 PASS**(不讀檔答出「release:preflight與CI」= 原生 discovery 生效);Claude 端 `/memory` 列 AGENTS.md 待下 session 人工確認 — commit d88ceac2

### Phase 2 — Codex surface 研究 + adapter(需 codex 官方 hooks/skills/config 文件研究)
- [ ] P2.1 研究(WebFetch 當日官方):Codex project-level config、hooks 事件/可否 block、skills discovery(.agents/skills?)、cloud 行為、trust 模型。**live 實測**每一宣稱(canary probe),不推測。
- [ ] P2.2 依研究結果生成 `.codex/` 或等效(生成器擴充 build-fork-governance 家族;generated banner + digest + drift gate)。
- [ ] P2.3 Codex-side second-opinion driver:AGENTS.md 或 codex skill 形式提供「review Claude-authored change」workflow(消費同 rubric)。
- [ ] P2.4 fork/template:corpus 生成加 codex targets;template repo checked-in AGENTS.md;`npm run sync-all` 契約擴充(§15:deterministic/idempotent/atomic/dry-run/json — 對照現況補齊)。
- [ ] P2.5 Certified Surface Registry 建檔:Claude local(Certified,證據=本 repo 日常)/ Claude cloud(Certified-equivalent,證據=memory 2026-07-14 端到端蓋章;範圍=committed .claude)/ Codex CLI local(目標 Certified-equivalent:AGENTS.md discovery 實測 + preflight/CI 兜底)/ Codex cloud、IDE surfaces(Uncertified until tested)。

### Phase 3 — rule-ID 化 + waiver schema + coverage 100%
- [ ] P3.1 dim→rule-ID 對映表(machine-readable json;audit-coverage-matrix 擴欄位:id/severity/critical/waiver-policy)。
- [ ] P3.2 escape-marker → waiver 升級(owner/approver/reason/scope/expiry/remediation;過期=fail;Critical 禁一般 waiver)。掃既有 markers 列冊 ratchet。
- [ ] P3.3 rule coverage report 進 preflight(coverage <100% applicable = fail;已有 verify-deep-audit-coverage 為基底)。
- [ ] P3.4 attestation:preflight pass-marker 擴充為 attestation 格式(repo/SHA/digest/DS version/governance version/surface/rule PASS list/timestamp)。

### Phase 4 — 測試矩陣 + clean-room + 供應鏈
- [ ] P4.1 codex 規格 §24 的 38 項測試映射:已有(npm pack dogfood/假 fork harness/hook tests/breadth tests)標 DONE;缺項(ignore-scripts install、Windows、pnpm、interrupted sync、tamper tests)逐項建 fixture。
- [ ] P4.2 branch-protection probe + CODEOWNERS 驗證(或 doctor Unverified)。
- [ ] P4.3 governance-tamper negative fixtures(刪 gate/弱化 rule/改 generated 檔 → 必 fail)。
- [ ] P4.4 cloud clean-room:Claude cloud(已有實證,補 registry 格式)+ Codex cloud(排程;未測前 Uncertified)。

### 明文不做 / 邊界
- 不弱化任何既有規範遷就共用(codex 規格鐵律)。
- 不 plugin-only governance(已符:plugin 已非 critical path,memory 實證)。
- 不虛構 Codex hooks 能力;研究+實測前一律走 equivalent-controls。
- 不動 push/publish/branch-protection(user gate)。
- `deep-audit-cross-codex` 名稱保留(alias);內容漸進對齊 ADR-4。

## 3. Definition of Done(對照 codex 規格 §25 裁剪為可驗版)
唯一 SSOT(AGENTS.md+.claude 家族)/ adapters 全生成+drift gate / applicable rules 100% coverage 帳 / DS repo Tier-0 自我治理(已有,補 AGENTS gate)/ template+consumer 一鍵 setup(既有 cli-init+sync-all 擴充)/ npm tarball 正確(dogfood 斷言擴充)/ 故意違規全被擋(negative fixtures)/ Claude+Codex local 實測證據 / cloud 誠實標態 / second opinion fail-closed / 全部宣稱有測試證據。

## 4. 風險與備註
- **Codex hooks 能力未知** = 最大不確定;架構已按「hooks 是加速器非信任邊界」設計,故不阻塞(blocking 由 CI 兜底)。
- CLAUDE.md 重構觸及每 session 載入內容 → P1 驗收必含「下 session Claude 行為無退化」人工確認點。
- AGENTS.md 32KiB cap:現核心內容 ~15KiB,餘裕足;Rule Index 用一行式。
- quota:agent 艦隊受 session 限額;本工程主體可由 main-loop 直接執行(檔案生成+gate 為主)。
