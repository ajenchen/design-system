# 本專案 AI 治理核心(provider-neutral;AGENTS.md 開放標準)

**本檔為所有 AI agent 的治理 SSOT bootstrap**:Codex 等 AGENTS.md 標準 agent 原生載入,Claude Code 經 `CLAUDE.md` 的 `@AGENTS.md` import 載入同一份。跨模型 bootstrap 原則**只改本檔**,兩邊自動同步。
**最終 authority 不是本檔**:本檔引導行為,強制層 = provider-neutral governance verifier、同一份 release verification manifest、受保護 CI 與外部 required check;只有這些控制實際啟用且證據綁定當次 commit 才可宣稱 compliant,本機 hook 或 workflow 檔存在本身不構成保證。Claude 另有 write-time hooks 加速回饋(`.claude/hooks/`,provider 專屬加速器,非信任邊界)。
**治理／infra 改動只改 canonical owner**,不得手改 build graph 宣告的 `.claude` provider views、`.agents/**`、`.codex/**`、`generated/**` 等 generated outputs;完成後跑 `npm run governance:generate` 與 `npm run governance:check`。owner/output/non-authority 邊界由 `infra/governance/protected-root-classification.json` 封閉,新路徑未分類即失敗。
**巢狀 instruction 只准補充 scope,不得複製本檔**:Codex 由 repo root→cwd 合併 `AGENTS.md`,整條鏈必守預設 32KiB;`packages/design-system/AGENTS.md` 因此由獨立短 source 生成,npm package 導航不得成為第二份治理 SSOT。

# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是所有規則背後的**態度**,接到任務先複習再看規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?」沒對齊又說不出理由 = 設計 bug;視覺整齊度不輸原版 + 符合 DS 語言**同時成立**。**禁以「較簡單」「省 N edits」選 shortcut**;說「快速修」「省工程」是 yellow flag,停下重想。
2. **不憑直覺發明 / 優先消費既有**——新增任何值／名／pattern／variant／layout primitive 前先 `grep` 既有。**強制 `# SSOT 消費 canonical` 清單**:寫視覺 code 前列出消費的 components/patterns/tokens/spec。提建議也算定 pattern,給 option 必對照 DS canonical + ≥3 家世界級,**禁憑印象列部分家**。
3. **改一處必看三處**——code / spec / story 三方聯動。改 cva `defaultVariants`／variant／token 前先 grep 該元件所有檔案,一次改完。
4. **範例必真實業務場景**——Jira / Stripe / Notion / Figma 可辨識情境;禁 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。
5. **先證據、再分權**——無前例的產品／UI／UX SSOT 決策:grep 既有 → 讀近親 spec → 仍有真實取捨才停下問。純工程不確定性由最高 certified model 依 canonical、tests、Harness 與 security gates 收斂;只有 task／deliverable 明確要求時才加 independent review,**不得用問 user 代替工程判斷**;禁憑直覺造新 pattern。
6. **大原則吸收瑣碎**——同類 bug 反覆糾正 = meta 層沒抓住,見 `packages/design-system/ds-canonical/rules/meta-patterns.md`(33 active M-rules;M27/M33/M34/M35 已折入 M20/M7/M23(c)(d))。**AI 不需 user 提醒才找 root invariant**:rule 震盪 → 自跑 M12 benchmark + invariant test;user 第 2 次問 → 必截圖 verify(M13);對話結論 → AUTO 5-layer pipeline(M14);visual/behavior decision 前必先 WebFetch ≥ 3 source(M26);solo-work git ops 必先 grep canonical(M28);**視覺／結構 propose 前必 grep DS spec.md 找 owner SSOT(M29)並出 3-column 表,否則提案不被接受**。使用者 tell me once 不該要 tell me twice。

# Rule Index(progressive disclosure — 編對應檔案前必先讀)

| 檔案 | 何時必讀 |
|---|---|
| `packages/design-system/ds-canonical/rules/meta-patterns.md` | 每個任務(33 條 M-rules,fundamental)|
| `packages/design-system/ds-canonical/rules/spec-rules.md` | 編任何 `*.spec.md` 或 DS 內容 |
| `packages/design-system/ds-canonical/rules/ui-development.md` | 編任何 `.tsx`/`.ts`(Tailwind 5 條 / Token 4 條 / Props 命名 / shadcn / public-vs-internal)|
| `packages/design-system/ds-canonical/rules/story-rules.md` | 編任何 `*.stories.tsx`(三層定位 / Title / 範例準則)|
| `packages/design-system/ds-canonical/rules/self-verify.md` | 編任何檔案(Pre/Mid/Post/Pre-commit 4 階段自驗)|
| `packages/design-system/ds-canonical/references/ssot-consultation.md` | 寫視覺 code 前(9 項決策對應 SSOT + tsx 檔頭宣告)|
| `packages/design-system/ds-canonical/references/ssot-index.md` | 視覺/結構 propose 前(owner SSOT 對照)|
| `packages/design-system/ds-canonical/references/naming-conventions.md` | 命名新檔/變數/prop |
| `packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md` | 稽核判準 SSOT(91 dim rubric,Claude 與 Codex 同判準)|

(Claude Code 對 generated `.claude/rules/` view 有 path-scoped 自動載入,其他 agent 依本表讀 canonical source;兩者由 build graph exact projection,禁把 provider view 當第二份 SSOT。)

# 治理 canonical(home 分層 + anti-bloat)

**規則放哪裡**:本檔只做每 session 導航,不是 home taxonomy 的第二份 SSOT。Level 1–9 的唯一 owner／scope／flowchart 是 `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md`——設計知識走 Level 1–4;invoke workflow／單步 action 走 Skill／Command;跨 session 短狀態走 Memory,完整計畫／RFC 走 Planning;可機械化判準走 Hook + preflight/CI。Provider views 只作 discovery/delivery,不得反向成為 semantic owner。

**行數預算**(Anthropic 對齊):Bootstrap(AGENTS.md + CLAUDE.md 合計)target ≤ 250 / transition ≤ 400 / hard cap 800。SKILL ≤ 250 / spec ≤ 300(foundational SSOT 例外 ≤ 800-1200)/ memory **per-file ≤ 100 lines** + **MEMORY.md index ≤ 20 entries**(soft 18 / hard 20)。Hooks **26 soft / 60 hard**(SSOT = `session_start_governance_check.sh` Check 7)。動態值以 `scripts/sync-governance-counters.mjs` 跑出為準。

**Anti-bloat**:L1 pre-write `packages/design-system/ds-canonical/hooks/check_file_size_budget.sh`(+ canonical hook registry)/ L2 per-edit `log_governance_fires.sh` → opt-in Git-owned `governance-runtime/hook-fires.jsonl`(provider homes 永不持有 telemetry authority)/ L3 periodic(季度 或 `--deep`)`/knowledge-prune`:任何 Deep Audit 必在同一 run、final report 前跑完 Phase 0–5 並留 receipt,量化 retire rate 但只移除有證據的噪音,禁為湊比例犧牲真實 invariant。

**加規則前必過 3 題**:(1) 既有 Meta-Pattern／近親 spec／canonical chapter 命中 → append pointer 不新寫;(2) **Rule-of-3**:同概念 ≥ 3 處 → 選 SSOT 其他 pointer;(3) 7 天後還會 fire 嗎?不確定 → 不寫。

# 稽核 canonical

3 層級 × 6 維度。**Stakeholder-visible artifact**(prototype / 元件 merge / 產品 demo)**必過 code + visual 雙層 audit**(搭配 M6+M10)。

| Tier | 時機 | Scope | Skill |
|------|------|-------|------|
| 1 Stakeholder-gate(強制)| 新元件 merge / prototype / demo | artifact-scoped | `/component-quality-gate` / `/prototype` P3.5 / `/product-ui-audit` P5 |
| 2 Daily dev | bug / refactor / 文字改 | git diff + direct consumer | `visual-audit --scope=changed`(default) |
| 3 Periodic deep | release / token 大改 / 季度 | full DS | `/design-system-audit --deep` |

**6 維度 → skill**:D1 設計語言 `/design-system-audit` / D2 程式語言 tsc + lint + `/design-system-audit` / D3 元件效能 `/performance-audit` / D4 UX 行為 `/ux-audit` / D5 視覺品質 `/visual-audit`(Layer A mechanical + B AI)/ D6 原則自檢 `design-system-audit/references/principle-audit-protocol.md`。

**Consistency 類稽核必 Phase 0 全掃再判**。**Deep audit 全掃優先 + 決策 batch-at-end 鐵律**(2026-07-11 user directive):先全 DS 掃完(NO-SAMPLE)→ 跨元件去重 → **最後一次**列「真問題 + 只影響 SSOT-UI/UX」決策清單給 user 拍板;非-SSOT autonomous 做完美;**禁**途中逐元件問 user。

**Audit-vs-execute 分權**:只有改變產品／UI／UX SSOT 且存在真實選擇或取捨 → STOP、batch-at-end 給 user 拍板;治理、架構、security、release、migration 等純工程 canonical 依 `# 自主執行 canonical` Standing Authorization AUTO,以 canonical required hard gates 收斂。Independent review 只有在交付物明確要求時才是該 claim 的必要條件,不得阻擋一般工程或標準 release。對齊／表達統一／清 duplicate／補 pointer 一律 AUTO。

**Scope classifier — Surgical visual bug**:user 列 N 個 visual defects + 無新 canonical／無新 API contract／無 cross-component semantic 改動 → **Surgical scope**:no collab／no new M-rule／no audit report,batch fix + final pixel-quantified verify only。Substantive 改動回上一段 audit-vs-execute classifier。

# Independent second opinion(跨 provider 對抗審查)

**只有 task／deliverable 明確要求時才啟動**:author provider ≠ reviewer provider;判準 = 同一份 rubric(`audit-prompts.md`),reviewer 只提 findings(rule 對照 + severity + evidence)、不得自建規範,雙方 provider/model/version 入 receipt。User 對 exact run 的 waiver 必尊重並寫入 receipt,該 run 不得冒充已做 review;optional review 缺席不阻擋一般工程、deep audit 或 standard release。
- **路由 authority**:`packages/governance/canonical/providers.json` 只定 selection policy 與 review class(assurance tier `standard/high/maximum`,Tier-0 governance = `maximum`),不得固定 peer/model/version/API。`packages/governance/src/provider-review-binding.mjs` 的 `resolveProviderReviewBinding` 排除 author provider,依 assurance→reasoning→compute 選 policy 允許的最高 certified capability(budget 只能 batch/stop,禁降級);選定後凍結 exact provider/profile/model/release 與所有 registry digests,response substitution fail closed。
- **Workflow selection**:產品消費者第二意見 → `packages/design-system/ds-canonical/skills/independent-review/SKILL.md`;重大 governance/release/DS no-sample → `packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md`(舊 discovery 名稱,語意為 provider-neutral)。禁從 skill 名稱推斷 peer。
- **Binding 不可用 → claim fail-closed**:只有明確要求 independent-review 交付物時才標該 claim `REVIEW-BLOCKED`;禁同一 agent 假扮另一 provider;未登錄／同 provider／缺 capability certification、entitlement readback、transport、隔離、證據或未過 exact target certification,皆不得取得 independent/compliant 宣稱。不可用 peer 不阻擋一般工程或 canonical five-step release。訂閱方案是 entitlement route 不是 model identity,無 certified exact entitlement readback 時禁冒充、禁以其他 API／較低模型作成本導向 fallback。新模型只更新 capability/release/certification data,不改 canonical semantics。

# SSOT 消費 canonical

寫視覺 code 前必查對照,沒列 = 自創。完整對照表 + 強制 checklist(9 項決策對應 SSOT + 新元件 tsx 檔頭「── 消費的 SSOT ──」段)→ `packages/design-system/ds-canonical/references/ssot-consultation.md`。

# 任務導航表

| 任務 | 必讀 |
|------|------|
| **新增元件** | canonical `rules/ui-development.md`「建立 UI 前必讀 / shadcn 元件規範」+ `rules/spec-rules.md` → `/component-quality-gate` |
| **修 variant / size / state** | 該元件 `spec.md` → `/story-writing` |
| **新增 token** | `tokens/README.md` → `rules/ui-development.md`「Token 命名 4 條硬規則」→ `tokens/xxx.spec.md` |
| **寫 story / 視覺 code** | `/story-writing` + `# SSOT 消費 canonical` |
| **命名新檔／變數／prop** | `# 命名與語言一致性` + `rules/ui-development.md`「元件 Props 命名」 |
| **新元件 layout** | `# 4-Family Layout Model` |
| **建產品／開新 product app** | `npm run create-app <name>` → `apps/<name>/`;2-scenario SSOT → `packages/design-system/ds-canonical/references/scenario-definition.md` |
| **新 skill / hook / command** | `packages/design-system/ds-canonical/{skills,hooks,commands}/README.md` charter |
| **無前例設計決策** | `# 遇不確定時的協議` |
| **Tailwind 出怪事** | `rules/ui-development.md`「Tailwind 5 條核心」+ `# 失敗記憶索引` |
| **Stakeholder 產出／稽核** | `# 稽核 canonical` |
| **User 糾正後** | `# 治理 canonical`(home 判斷) |
| **跨 provider 討論 / 多輪震盪 / 任何 peer 輸出** | `packages/governance/src/provider-review-binding.mjs` 的 `resolveProviderReviewBinding` 依 `packages/governance/canonical/providers.json` 選 peer;產品第二意見 → `/independent-review`;重大 governance/release → `/deep-audit-cross-codex`;詳 `# Independent second opinion` |
| **PR merge 後／session start branch 健檢** | `# Git / release canonical` |

**找不到** → `# 遇不確定時的協議`;產品／UI／UX SSOT 真取捨不自決,純工程由最高 certified capability 依證據自決並驗證。

# Git / release canonical(machine SSOT → `infra/governance/release-workflow.json`)

**1 chat = 1 working branch + 1 PR**;protected `main` + required CI 不可繞過。所有 agent(Claude、Codex、未來 provider)只跑同一條五步,**但合併前有一道人類閘**(2026-09-02 user 原話:「你要先把我們討論的東西部署到 netlify,等我確認後認為都沒問題,主動說要發版,你才會 push 到 GitHub main 同時更新 GitHub 上的 storybook 並發版到 NPM」):

| 步驟 | AUTO 動作與完成條件 |
|---|---|
| 1 `pr-checks` | 編輯、生成、測試、commit、push、建立／更新唯一 PR(**draft**);自行修到 required CI green 且 conversations resolved;**回報 Netlify deploy preview 連結**(`deploy-preview-<PR>--<site>.netlify.app`)給 user 檢視 |
| 1.5 **發版同意(ASK)** | **user 看過預覽後在對話說「發版」**(exact target = **user 看過的那份產品內容**)→ hook `record_release_consent.sh` 自動落地 receipt(`.git/governance-runtime/release-consent/current.json`,schemaVersion 3);缺 receipt → `release:auto` **停在預覽階段**印 `AWAITING_USER_RELEASE_CONSENT`,不合併、不發布;問句／否定不算同意。**同意綁「user 看過的產品內容」,不綁 commit、不綁分支**(2026-09-20 兩次修正的結論):commit 與分支都是 **agent 切工作的單位**,不是 user 授權的單位 —— 綁 commit 讓版號 bump 就失效,改綁分支之後開一條新分支又失效,**問題只是換地方發作**(user 原話:「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?你他媽到底是要我說發版說到何時?」)。現在綁預覽看得見的檔(`packages/<pkg>/src` 的 ts/tsx/js/jsx/css)內容指紋:**內容沒變 → 換幾個 commit、幾條分支都算數**;**內容變了 → 必須重新確認**(2026-09-02 事故要保護的正是這一格);明確否定 → 撤回。**一份同意 = 一次 final release**:帳本記在 receipt 的 `releases`,第二次發布必須有 incident 證據(`RELEASE_ADDITIONAL_INCIDENT`),否則 fail closed —— 這條 canonical 早就寫了、`authorizeDeepAuditPublish()` 也寫好了,但 2026-09-20 之前**執行面零呼叫**,才會出現同一份工作連發 beta.135–139 五版、user 被迫重講五次 |
| 2 `merge` | 有 receipt 後以 exact-head CAS squash merge 進 protected `main`,立即讀回 main |
| 3 `publish` | 從 protected main 自動發布 immutable exact version;禁 mutable dependency tag |
| 4 `readback` | 自動讀回 GitHub Release 與 npm 三包 exact version;未一致不得宣稱完成 |
| 5 `consumer` | 自動建立、修復、合併 template 與 WM exact-version PR,讀回 consumer protected main |

公開入口只有 `npm run release:auto`(安全續跑未完成步驟;合併前必檢查發版同意 receipt)、`npm run release:status`(唯讀狀態)與 `npm run release:consent -- --quote "<user 原話>"`(hook 失效時的手動落地,仍需 user 原話)。ASK 只有兩種:未解決的產品／UI／UX SSOT 真取捨、以及**發版同意**(每條工作分支／每個 PR 一次,不是每個 commit 一次;預覽 → user 說「發版」);login/MFA/OAuth／缺 credential reference 只暫停當下動作,完成後 AUTO resume。`candidate-freeze`、broad external activation、model certification、offline signatures、72h soak、fleet promotion 對 standard small-team release 一律 non-blocking 或已退役,不得另建 approval/promotion 流程。完成後才清 remote/local branch 並 `git switch main && git pull --ff-only`。

**禁止**:direct push main / 同 chat 多 branch 或多 PR / required CI、conversation 或 live readback bypass / mutable dependency tag / 把 external write、milestone 或 legacy ceremony 當人類核准 gate / **未經 user 說「發版」就合併或發布**(2026-09-02 錨:beta.131 與 #122 在 user 還在看草稿時就被自動發出)。

# 命名與語言一致性

**3 重 test**(全過才採納):(1) 對齊既有 DS 詞彙(`compact/rich / sm/md/lg / action/indicator / scanning/reading`)?(2) ≥ 2 家 world-class DS 用此詞?(3) 同字串在其他元件已有不同語義?詳 `packages/design-system/ds-canonical/references/naming-conventions.md`。
**語言一致性**:spec.md 繁中(技術術語保留英)/ code identifier 英 / 單一檔案不中英夾雜。

# 4-Family Layout Model

**每元件 spec 第一段必聲明 Layout Family**(1/2/3/4 或「self-contained」):1 Menu item 與 2 List item(scanning / reading)→ `patterns/element-anatomy/item-anatomy.spec.md`;3 Pill(單行互動)→ `components/Button/button.spec.md`「Pill Layout」;4 Field control(可編輯資料輸入)→ `components/Field/field-controls.spec.md`。

# 自主執行 canonical(Autonomy Default)

**Default = autonomous + complete + verify-to-perfection;省工 = anti-pattern(違 mindset #1)**。

| 動作類別 | 預設 |
|---------|-----|
| **產品／UI／UX SSOT 真決策**(產品需求、使用者行為、IA、workflow、interaction、UI pattern、元件／文案語意、視覺規範或 user-visible tradeoff) | **ASK** — 只有證據收斂後仍存在真實選擇／取捨才由 user 拍板；既有 SSOT 的機械落地不屬此類 |
| **純工程／治理決策與動作**(architecture、provider-neutral SSOT、adapter、skill/hook、security、CI/CD、testing/Harness、dependency、migration、release、supply chain、GitHub config、package/template/WM/rollout/rollback) | **AUTO** — Standing Authorization；整批做到 frozen scope closure + 完整 evidence/readback/receipt/rollback |
| Bug fix / clean / refactor / 命名一致 / perf / a11y / test / audit / verify | **AUTO** — 整批做完 + 完整驗證 + 撤回機制 |

**同時優化 7 軸**:言簡意賅／效率+效能／SSOT 鐵律／易懂維護擴充／世界級+一致設計語言／完整 self-verify／自動 self-improve。**反 pattern**(禁):「省工」「下次再做」「下個 session」「OK 嗎?」過度 ASK、shortcut 避 verify。
**Trigger phrase auto-pipeline**:「依原則自主」「不需問」「馬不停蹄」「全部做完」「自動」→ autonomous mode,僅 SSOT-affecting UI/UX 停下 ASK。
**Triple-verify before propose**:propose／列 option／宣稱發現「問題」前必 inline 跑 (1) grep DS-wide (2) Read spec.md／tsx (3) 對照 canonical exception,三題全過才 propose。
**SSOT auto-sync invariant**:跨 file 數字禁 hardcode 多處;以 `scripts/sync-governance-counters.mjs` 機械對齊。

<!-- canonical-decision-authority:start -->
**Decision／Engineering Authority**:user 只拍板產品／UI／UX SSOT 真取捨及可感知／產品語意變更（behavior/interaction/IA/visual/token/layout/content/a11y/canonical rules）；核准 = user 在對話中對 exact target + choice 說可（**「我說可以就是可以，就是授權」— user 2026-08-04 verbatim**；最新一則 user 訊息的明確 blanket 授權即核准當下 pending 的 exact 提案）。operation digest 為可選佐證——有引且相符可加強、有引但不符 fail-closed、未引不阻擋（強制引 digest 屬已拆除的 per-PR 簽章同族儀式，835b519e 先例）。引用/條件/舊 scope/跨 target 無效。其餘工程/external writes 皆 Standing Authorization AUTO，含已核准 UI／UX 實作/機械 generation/sync 與 source→commit/PR/merge→canonical `infra/governance/release-workflow.json` 的 `pr-checks → merge → publish → readback → consumer`；依 frozen scope、SSOT、required checks、security、least privilege、rollback/readback 收斂，不逐 milestone 重問。Deep Audit 必須在單一 branch／PR 完成 remediation 與 local/CI candidate validation，禁止把 immutable publish 當 iteration/test loop，每次 audit 最多一次 final release；只有另有 evidence ref 綁定 incident ID、failure class、published version 的 post-publish blocker 或 security incident 才可額外 release。Certification、rollout、staged rollout、preview/canary 與 independent review 是明確要求時的附加 assurance，不得進入標準 five-step release blocking graph；peer 不可用只阻擋明確要求的 independent-review claim。

**Visual baseline**:user 對 exact image set／UI／UX 語意說「可以改」即拍板；Agent 自動 apply/generate/test/commit/PR/CI/merge，禁再核准/key enrollment/簽章。僅 user 明確要求 independent cryptographic review 才啟用 `visual-baseline-review-policy.json`，否則不阻擋。

**Human-only boundaries**:僅 login/MFA/OAuth/owner/billing、缺 credential reference（只問 vault/Environment/Secret Manager reference，禁 secret）、plan 外付費、法律/帳號/組織權限/商業承諾及上述產品決策。Agent 完成唯一方案/preflight，只問一個 exact action，readback 後續跑；technical failure fail-closed，非 human decision。Release 常見的 login/MFA/OAuth/credential reference 完成後一律 AUTO resume，不另問核准。
<!-- canonical-decision-authority:end -->

# 遇不確定時的協議

**無前例且影響產品／UI／UX SSOT 的真實取捨**才走 3 步(禁跳):**grep 既有**(30 秒)→ **讀近親 spec.md** → **仍有真選擇才停下問** user。**非產品／UI／UX SSOT 決策**(architecture / governance / security / release / migration / refactor / test / perf / a11y / hook / skill / typo / 對齊既有 canonical)依 Engineering Decision Policy autonomous,無需問。禁:跳 grep 憑記憶／隨便挑／留 TODO;可跳:bug 修／機械勞動／user 明確指示。

# 失敗記憶索引(技術沉默陷阱 only)

| 技術陷阱 | 一行 anchor |
|--------|-----------|
| Tailwind v4 `[--foo]` 必 `var()` | silent 失效 |
| tailwind-merge 自訂 utility 必註冊 group | 否則 strip |
| 元件自包 Provider | 劫持全站 |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook |
| shadcn compat alias 回流 | dark mode 不聯動 |
| `asChild ? Slot : Native` 內部 JSX 仍渲染多 children | React.Children.only runtime fail;asChild 分支只傳 consumer child |
| `tsc -b` **在本 repo 的 composite 設定下根本不檢查 DS 原始碼** | 不只是「不 emit declaration」——2026-09-06 實證:`data-table.tsx` 少傳一個必填 prop(TS2741),`npx tsc -b --force` 回 **0**,`npm run build:lib` 才報錯。**「tsc -b 通過」不構成型別正確的證據**,任何 .tsx 改動的型別驗證一律以 `npm run build:lib` 為準 |
| 工具靜默陷阱:`rsync -a` 等長同秒跳過 / `rg` 黏寫 `-rn` 的 `-r`=replace / `mktemp -d` 失敗回空 → `cd ""` 原地 → trap 刪掉 cwd | 必 `--checksum`、flag 分開寫;mktemp 後必 `[ -n "$V" ]` + `[ -d "$V" ]` 才可正規化／註冊 cleanup(2026-07-28)。**2026-09-18 beta.134 再犯**:consumer mirror 的 `package-lock.json` 換版號後與舊版**完全等長**(版本字串／resolved URL／integrity base64 三者都是固定長度,實測 292873 bytes 不變),clone 又與生成落在同一秒 → rsync 靜默跳過、lock 沒進 commit,直到 consumer 的 `npm ci` 才炸。**上游那句 `✓ lock pins the exact released version` 還是綠的,因為它驗的是來源那份、不是真的被複製過去的那份 —— 綠燈驗錯對象比沒有綠燈更騙人**。規則早就寫了、三處也遵守了,第四處漏掉 → 機械化 `scripts/rsync-checksum-invariant.mjs`(CI required,對照組用合成檔且必須只紅在合成檔上)。**2026-09-20 同一條的第二種形狀:驗了「怎麼判」,沒驗「判的那個值怎麼來」**——發版同意改綁分支後,判定表 8 格全綠、`npm run test:release-consent` 全綠,但餵給它的 `productVisibleFilesChanged` **恆回 true**(自家 helper `run()` 回 `{ok,stdout,stderr}` 沒有 `status`,寫成 `diff.status !== 0` 就是 `undefined !== 0`,恆真且零報錯),整個修正從第一天起是死的,是我刻意去驗它才抓到。**吃參數的純函式,參數邊界就是測試的天然盲點**:判定表把值當輸入,於是永遠測不到算那個值的程式。判準:純函式測試通過後,必再問「這個參數在正式流程裡是誰算的,那支有沒有被測」,並用**真實資料**(真 git commit、真 API 回應)跑兩面對照 —— 該 true 的一筆、該 false 的一筆,兩邊都找得到才算數,找不到對照組要 fail 而不是空跑當綠|
| DS css 不在 tokens.css aggregator 也沒被 tsx import = orphan | consumer 靜默拿不到 |
| storybook-smoke 驗舊 build = 假綠 | smoke script 已加 stale-build guard |
| hook 測試直跑留 fixture `.git/` 進 corpus | `git status` 不顯但 snapshot tree fingerprint 全算 → trio 漂移;測試必經 run-all.sh(自帶隔離),清 debris 用 `find -type f` 對照 `git ls-files`(2026-08-05) |
| SMIL `begin="indefinite"` 動畫掛上後沒人 `beginElement()` = 永不起跑(靜默、base 值定格) | begin-once 守衛的觸發 key 必含每個會新掛動畫的狀態段(think→exit 同 key 漏掉 7 個 animate);驗證看 `getStartTime()` 是否丟例外,CI C6(2026-09-03) |
| 量 focus 顏色不等 transition = 量到過渡中間值 | `transition-colors` 的 transition-property **含 `outline-color`**;聚焦後立刻 `getComputedStyle().outlineColor` 會抓到中間值(量到 currentColor,看起來像「焦點框顏色壞了」)。2026-09-08 差點據此寫成「全 DS 焦點框失效」,等 600ms 後三個元件都回主色。**凡量 focus 顏色先等過渡**;另 `document.body.focus()` 不重設 Tab 起點(body 不可聚焦),Tab 會從上一個聚焦元素繼續往後走,要重設只能 reload |
| 拖曳 vs 點擊只靠「收到幾個 pointermove」或「setTimeout(0) 內吞 click」= 輸入代理 / 遠端隔離環境靜默失效 | 代理會丟掉 / 合併 pointermove、讓 click 晚一個 task 送達;本機 Chromium 兩者都成立所以永遠重現不了(2026-09-16 FAB「拖一下就開面板」,程式碼自 9/8 起零改動)。判準必是**放開點離按下點的距離**,吞 click 的旗標由**下一次 pointerdown** 才清,鍵盤合成 click(detail 0)放行;閘 `scripts/agent-fab-drag-click-invariant.mjs` 用合成事件造「晚到的 click」與「0 個 move 放開在 80px 外」 |
| `git commit -- <路徑>`(指定路徑的部分提交)會讓治理 pre-commit 掛掉 | 錯誤訊息是 `authority generation index publish could not stage:hooks/scripts`,看起來像沙箱權限問題,其實是**部分提交模式下 git 自己鎖著 index**,hook 裡的 `git update-index --cacheinfo` 拿不到鎖。同一個 `update-index` 手動跑 rc=0。正解:把要的東西 `git add` 進暫存區,然後跑**不帶路徑**的 `git commit`;要排除某個檔就用 `git update-index --cacheinfo <HEAD 的 blob>` 把它還原成 HEAD 版(2026-09-18)|
| **寫了閘卻沒有任何執行面呼叫它** | spec 寫「由 `xxx.mjs` 機械強制」、腳本存在、甚至有包裝測試 —— 但 CI / npm script / hook 都沒提到它,那條保護是假的而且**零訊號**。2026-09-18 機械盤點:`scripts/*.mjs` 有**大量**名字像閘/測試卻不可達(把 CI + package.json + hooks + skills + infra/test 全算進來之後)。**確切數字不在本檔硬寫** —— 它會隨棘輪往下走,SSOT 是 `scripts/gate-reachability-baseline.json`(2026-09-20 prune 抓到本檔與 ci.yml 都還停在舊值 94,而 baseline 已是 93)。同族錨例:推播閘(hook 在、6 個情境測試全綠,但真實入口被 `requires: peer-cli` 擋掉,從沒跑過)、native/custom parity 閘(只掛非 required 的 nightly)。**判準**:寫完任一支閘立刻問「誰呼叫它」,grep 執行面拿不到答案就等於沒寫。棘輪閘 `scripts/gate-reachability-invariant.mjs`(CI required)鎖 baseline,新增孤兒立刻紅。**同族第二種形狀(2026-09-19)**:文件講的那道防線**檔案根本不在**——hook home 自己的 README 在 Stop 區列 5 支 hook,其中 3 支(`stop_harvest_corrections` / `stop_capture_metrics` / `stop_meta_self_audit`)早在 2026-05-13 就折進 `stop_passive_logging.sh`、檔名已不存在,而「折進去」這件事就寫在同一張表的**上一列**。閘 `scripts/hook-citation-liveness-invariant.mjs`(CI required):文件提到的 hook 名必須存在於 canonical hook 樹,否則該行前後 3 行要明講它是舊名/已折/未實作 |
| `file://` 開 storybook = story 整個不渲染而且不報錯 | CORS 擋掉模組載入,`#storybook-root` 子節點 0、畫面空白,探針卻拿得到 Storybook 自己的 UI(「Set string」按鈕)而誤以為有渲染。瀏覽器閘一律起本機靜態站。同場:CSSOM 對含 `var()` 的簡寫回**空字串**,用 `r.style.outline` 掃規則會全空,要用 `r.cssText`(2026-09-08)|

新 bug → 歸 Meta-Pattern OR 本表 1 行;> 10 條 = 漏寫,評估 meta-merge 既有 M-rule。

# 專案 Stack

Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Storybook + 自訂 Design Token(DS 內化在 npm workspace);完整路徑 + Token 系統 → `packages/design-system/src/tokens/README.md`。

# 元件完成 + Exploration

merge 前 invoke `/component-quality-gate`(35 項 + visual + clean-code 三層)。正式 `packages/design-system/src/`,比稿 `src/explorations/`(`*.v1.stories.tsx` + `notes.md`,定案才升級 patterns/ 或 components/)。
