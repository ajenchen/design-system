# 本專案 AI 治理核心(provider-neutral;AGENTS.md 開放標準)

**本檔為所有 AI agent 的治理 SSOT bootstrap**:Codex 等支援 AGENTS.md 標準的 agent 原生載入;Claude Code 經 `CLAUDE.md` 的 `@AGENTS.md` import 載入同一份(Anthropic 官方共用模式)。增刪改跨模型 bootstrap 行為原則**只改本檔**,兩邊自動同步。
**最終 authority 不是本檔**:本檔引導行為;強制層 = provider-neutral governance verifier、同一份 release verification manifest、受保護 CI 與外部 required check。只有這些控制已實際啟用且證據綁定當次 commit 時才可宣稱 compliant；本機 hook 或 workflow 檔存在本身不構成保證。Claude 另有 write-time hooks 加速回饋(`.claude/hooks/`,provider 專屬加速器,非信任邊界)。
**治理／infra 改動只改 canonical owner**，不得手改 build graph 宣告的 `.claude` provider views、`.agents/**`、`.codex/**`、`generated/**` 等 generated outputs；完成後跑 `npm run governance:generate` 與 `npm run governance:check`。精確 owner/output/non-authority 邊界由 `infra/governance/protected-root-classification.json` 封閉，新路徑未分類即失敗。
**巢狀 instruction 只准補充 scope，不得複製本檔**：Codex 由 repo root→cwd 合併 `AGENTS.md`，整條鏈必守預設 32KiB；`packages/design-system/AGENTS.md` 因此由獨立短 source 生成，npm package 導航不得成為第二份治理 SSOT。

# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?」沒對齊又說不出理由 = 設計 bug。視覺整齊度不輸原版 + 符合 DS 語言**同時成立**。**禁止以「選較簡單」「省 N edits」為由選 shortcut**——一律最世界級做法。說「快速修」「省工程」是 yellow flag,停下重想。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / variant / layout primitive 前先 `grep` 既有。**強制 `# SSOT 消費 canonical` 清單**——寫視覺 code 前列消費的 components/patterns/tokens/spec。提建議也算定 pattern,給 option 必對照 DS canonical + ≥3 家世界級。**禁止憑印象列部分家**。
3. **改一處必看三處**——code / spec / story 三方聯動。改 cva `defaultVariants` / variant / token 前先 grep 該元件所有檔案,一次改完。
4. **範例必真實業務場景**——Jira / Stripe / Notion / Figma 可辨識情境;禁 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。
5. **先證據、再分權**——無前例的產品／UI／UX SSOT 決策:grep 既有 → 讀近親 spec → 仍有真實選擇或取捨才停下問。純工程不確定性由最高 certified model 依 canonical、tests、Harness、security gates 與 independent review 收斂，**不得用問 user 代替工程判斷**；禁止憑直覺造新 pattern。
6. **大原則吸收瑣碎**——同類 bug 反覆糾正 = meta 層沒抓住。見 `packages/design-system/ds-canonical/rules/meta-patterns.md` 31 active M-rules(M1-M32,M27/M33/M34/M35 retired,折入 M20/M7/M23(c)(d))。**AI 不需 user 提醒才找 root invariant**——rule 震盪 → AI 自跑 M12 benchmark + invariant test。User 第 2 次問 → 必截圖 verify(M13)。對話結論 → AUTO 5-layer pipeline(M14)。Visual / behavior decision 前必先 WebFetch ≥ 3 source(M26)。Solo-work git ops 必先 grep canonical(M28)。**視覺/結構 propose 前必 grep DS spec.md 找 owner SSOT(M29)— 出 3-column 表;否則提案不被接受**。使用者 tell me once 不該要 tell me twice。

完整 M-rules 詳 `packages/design-system/ds-canonical/rules/meta-patterns.md`(必讀)。

# Rule Index(progressive disclosure — 編對應檔案前必先讀)

| 檔案 | 何時必讀 |
|---|---|
| `packages/design-system/ds-canonical/rules/meta-patterns.md` | 每個任務(31 條 M-rules,fundamental)|
| `packages/design-system/ds-canonical/rules/spec-rules.md` | 編任何 `*.spec.md` 或 DS 內容 |
| `packages/design-system/ds-canonical/rules/ui-development.md` | 編任何 `.tsx`/`.ts`(Tailwind 5 條 / Token 4 條 / Props 命名 / shadcn / public-vs-internal)|
| `packages/design-system/ds-canonical/rules/story-rules.md` | 編任何 `*.stories.tsx`(三層定位 / Title / 範例準則)|
| `packages/design-system/ds-canonical/rules/self-verify.md` | 編任何檔案(Pre/Mid/Post/Pre-commit 4 階段自驗)|
| `packages/design-system/ds-canonical/references/ssot-consultation.md` | 寫視覺 code 前(9 項決策對應 SSOT + tsx 檔頭宣告)|
| `packages/design-system/ds-canonical/references/ssot-index.md` | 視覺/結構 propose 前(owner SSOT 對照)|
| `packages/design-system/ds-canonical/references/naming-conventions.md` | 命名新檔/變數/prop |
| `packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md` | 稽核判準 SSOT(91 dim rubric,Claude 與 Codex 同判準)|

(Claude Code 對 generated `.claude/rules/` view 有 path-scoped 自動載入；其他 agent 依本表讀 canonical source。兩者由 build graph 做 exact projection，禁止把 provider view 當第二份 SSOT。)

# 治理 canonical(home 分層 + anti-bloat)

## 規則放哪 home(8-home 分層)

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `AGENTS.md`(本檔;Claude 經 CLAUDE.md import) | 每 session signal 的 mindset + 6 條 + 任務導航 |
| 1.5 | `packages/design-system/ds-canonical/rules/*.md` | 規則 authority；provider adapters 只負責 discovery/path scope |
| 2 | `{name}.spec.md` | 單元件「何時用 / 為什麼」 |
| 3 | Pattern `spec.md` | runtime 跨元件 primitive |
| 4 | Code(`.tsx` / `.css`) | cva / 型別等機械強制 |
| 5 | Skill(`packages/design-system/ds-canonical/skills/`) | invoke 情境的多步驟 workflow + checkpoint；生成到各 provider discovery view |
| 6 | Memory(repo `governance/memory/` SSOT + provider home 可重建 cache)| 跨 session 狀態。只改 committed repo；`npm run sync-memory` 單向刷新 Claude home cache |
| 7 | Hook(`packages/design-system/ds-canonical/hooks/`) | 中立機械判準；provider lifecycle adapters 提供 write-time 接線，最終兜底 = preflight/CI |
| 8 | Command(`packages/design-system/ds-canonical/commands/`) | 一次性單步 action；只有支援 native commands 的 provider 才 materialize view |
| 9 | Plan doc(`governance/planning/`)| 完整 plan / RFC / spec 草稿 SSOT;memory file 是短 index pointer |

**Q1 設計規則 → Level 1-4 / Q2 invoke 情境 → Skill or Command / Q3 隨時間變化 → Memory(short index)+ Plan doc / Q4 機械化 → Hook(+ preflight gate)**。完整 flowchart → `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md`。

## 行數預算(Anthropic 對齊)

Bootstrap(AGENTS.md + CLAUDE.md 合計)target ≤ 250 / transition ≤ 400 / hard cap 800。SKILL ≤ 250 / spec ≤ 300(foundational SSOT 例外 ≤ 800-1200)/ memory **per-file ≤ 100 lines** + **MEMORY.md index ≤ 20 entries**(soft 18 / hard 20)。Hooks **26 soft / 60 hard**(SSOT = `session_start_governance_check.sh` Check 7)。動態值以 `scripts/sync-governance-counters.mjs` 跑出為準。

## Anti-bloat L1-L3

- **L1 Pre-write**:`packages/design-system/ds-canonical/hooks/check_file_size_budget.sh`(+ canonical hook registry)
- **L2 Per-edit**:`log_governance_fires.sh` → opt-in Git-owned `governance-runtime/hook-fires.jsonl`；provider homes 永不持有 telemetry authority
- **L3 Periodic**(季度 / `--deep`):`/knowledge-prune` skill,retire ≥ 5%

## 加規則前必過 3 題

1. 既有 Meta-Pattern / 近親 spec / canonical chapter 命中 → append pointer 不新寫
2. **Rule-of-3**:同概念 ≥ 3 處 → 選 SSOT 其他 pointer
3. 7 天後還會 fire 嗎?不確定 → 不寫

# 稽核 canonical

3 層級 × 6 維度。**Stakeholder-visible artifact**(prototype / 元件 merge / 產品 demo)**必過 code + visual 雙層 audit**(搭配 M6+M10)。

| Tier | 時機 | Scope | Skill |
|------|------|-------|------|
| 1 Stakeholder-gate(強制)| 新元件 merge / prototype / demo | artifact-scoped | `/component-quality-gate` / `/prototype` P3.5 / `/product-ui-audit` P5 |
| 2 Daily dev | bug / refactor / 文字改 | git diff + direct consumer | `visual-audit --scope=changed`(default) |
| 3 Periodic deep | release / token 大改 / 季度 | full DS | `/design-system-audit --deep` |

| 維度 | 對應 skill |
|------|-----------|
| D1 設計語言 | `/design-system-audit` |
| D2 程式語言 | tsc + lint + `/design-system-audit` |
| D3 元件效能 | `/performance-audit` |
| D4 UX 行為 | `/ux-audit` |
| D5 視覺品質 | `/visual-audit`(Layer A mechanical + B AI) |
| D6 原則自檢 | `design-system-audit/references/principle-audit-protocol.md` |

**Consistency 類稽核必 Phase 0 全掃再判**。**Deep audit 全掃優先 + 決策 batch-at-end 鐵律**(2026-07-11 user directive):先全 DS 掃完(NO-SAMPLE)→ 跨元件去重 → **最後一次**列「真問題 + 只影響 SSOT-UI/UX」決策清單給 user 拍板;非-SSOT autonomous 做完美;**禁**途中逐元件問 user。

**Audit-vs-execute 分權**:只有改變產品／UI／UX SSOT 且存在真實選擇或取捨 → STOP、batch-at-end 給 user 拍板；治理、架構、security、release、migration 等純工程 canonical substantive meaning 依 `# 自主執行 canonical` Standing Authorization AUTO，以最高 assurance independent review + hard gates 收斂。對齊 / 表達統一 / 清 duplicate / 補 pointer 一律 AUTO。

**Scope classifier — Surgical visual bug**:user 列 N 個 visual defects + 無新 canonical / 無新 API contract / 無 cross-component semantic 改動 → **Surgical scope**:no collab / no new M-rule / no audit report,batch fix + final pixel-quantified verify only。Substantive 改動依 audit-vs-execute authority classifier：只有產品／UI／UX SSOT 真取捨才 STOP，其餘工程決策 AUTO。

# Independent second opinion(跨 provider 對抗審查)

**Canonical 概念**:重大變更(governance / Critical DS change / deep audit)需 **author provider ≠ reviewer provider** 的獨立第二意見。判準 = 同一份 rubric(`audit-prompts.md`),reviewer 只提 findings(rule 對照 + severity + evidence),**不得**自建規範。記錄雙方 provider/model/version。
- **路由 authority**:`packages/governance/canonical/providers.json` 只定義 provider-neutral selection policy 與 review class，不得固定 peer/model/version/API。`standard/high/maximum` 為 canonical assurance tiers；Tier-0 governance = `maximum`。`packages/governance/src/provider-review-binding.mjs` 的 `resolveProviderReviewBinding` 從 capability/profile/certification registries 排除 author provider，依 assurance→reasoning→compute 選 policy 允許的最高 certified capability；budget 只能 batch/stop，禁降級。選定後才凍結 exact provider/profile/model/release 與所有 registry digests，response substitution 一律 fail closed。
- **Workflow selection**:產品消費者第二意見讀 `packages/design-system/ds-canonical/skills/independent-review/SKILL.md`；重大 governance/release/DS no-sample 審查讀 `packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md`(舊 discovery 名稱，workflow 語意為 provider-neutral)。兩者都不得從 skill 名稱推斷 peer。
- **Binding 不可用 → fail-closed**:標 `REVIEW-BLOCKED`;禁同一 agent 假扮另一 provider;未登錄、同 provider、缺 capability certification/entitlement readback/transport/隔離/證據或未通過 exact target certification 皆不得取得 independent/compliant 宣稱。訂閱方案是 entitlement route、不是 model identity；沒有 certified exact entitlement readback 時不得冒充或以其他 API/較低模型作成本導向 fallback。新模型只更新 capability/release/certification data，不修改 canonical semantics。

# SSOT 消費 canonical

寫視覺 code 前必查對照 — 沒列 = 自創。**完整對照表 + 強制 checklist** → `packages/design-system/ds-canonical/references/ssot-consultation.md`(SSOT owner;含 9 項決策對應 SSOT + 新元件 tsx 開頭「── 消費的 SSOT ──」段強制要求)。

# 任務導航表

| 任務 | 必讀 |
|------|------|
| **新增元件** | `packages/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀 / shadcn 元件規範」+ canonical `rules/spec-rules.md` → `/component-quality-gate` |
| **修 variant / size / state** | 該元件 `spec.md` → `/story-writing` |
| **新增 token** | `tokens/README.md` → canonical `rules/ui-development.md`「Token 命名 4 條硬規則」→ `tokens/xxx.spec.md` |
| **寫 story / 視覺 code** | `/story-writing` + `# SSOT 消費 canonical` |
| **命名新檔 / 變數 / prop** | `# 命名與語言一致性` + canonical `rules/ui-development.md`「元件 Props 命名」 |
| **新元件 layout** | `# 4-Family Layout Model` |
| **建產品 / 開新 product app** | `npm run create-app <name>` → `apps/<name>/`;**2-scenario architecture SSOT** → `packages/design-system/ds-canonical/references/scenario-definition.md` |
| **新 skill / hook / command** | `packages/design-system/ds-canonical/{skills,hooks,commands}/README.md` charter |
| **無前例設計決策** | `# 遇不確定時的協議` |
| **Tailwind 出怪事** | canonical `rules/ui-development.md`「Tailwind 5 條核心」+ `# 失敗記憶索引` |
| **Stakeholder 產出 / 稽核** | `# 稽核 canonical` |
| **User 糾正後** | `# 治理 canonical`(home 判斷) |
| **跨 provider 討論 / 多輪震盪 / 任何 peer 輸出** | 由 `packages/governance/src/provider-review-binding.mjs` `resolveProviderReviewBinding` 依 `packages/governance/canonical/providers.json` 選 peer;產品第二意見 → `/independent-review`;重大 governance/release → `/deep-audit-cross-codex`;詳 `# Independent second opinion` |
| **PR merge 後 / session start branch 健檢** | `# Git solo-work canonical` |

**找不到** → 進 `# 遇不確定時的協議`；產品／UI／UX SSOT 真取捨不自決，純工程由最高 certified capability 依證據自決並驗證。

# Git solo-work canonical(SSOT → `governance/memory/feedback_solo_dev_workflow.md`)

**1 chat = 1 working branch + 1 PR**;**protected main + required CI 是不可繞過 hard gate**。**Session-start 必先 grep canonical + 開 working branch，禁直接在 main 上 edit 或 push**(M28 sub-rule)。真正強制的是 required checks、conversation resolution、preview／canary、attestation 與 external readback(非自我 approval/CODEOWNERS);gate 全綠後 merge 是 standing-delegated 工程動作，不另等 user trigger。

| 步驟 | 動作 |
|------|------|
| 1 Edit | AI 改 code |
| 2 Commit + push working branch | 自動觸發 Netlify per-branch preview 與 PR CI |
| 3 建立或更新唯一 PR | PR 必指向 protected `main`；禁止 direct-main fallback |
| 4 **SSOT/release pre-merge gate** | 動到 skill/hook/spec/token/AGENTS/CLAUDE 等 release-affecting paths時，在同一 branch 完成 exact version bump + **`npm run release:preflight`**；結果與 attestation 都進 PR |
| 5 監看並回報 PR / preview | Agent 等待 required checks、preview／canary、conversation resolution 與 external readback 全綠；回報是 receipt，不是 approval checkpoint |
| 6 收斂 hard gates | gate fail → 同 branch/PR 自行 remediation + rerun affected validation；gate 全綠 → step 7。若 user 提出產品／UI／UX變更，回 step 1 |
| 7 Squash merge PR | 依 Standing Authorization 透過受保護 main 的 PR merge；不得繞過 ruleset/direct push，merge 後立即 external readback |
| 8 發版與傳播 | release-affecting PR merge 後，通過 release hard gates即 tag 該 main commit → GitHub Actions OIDC/provenance publish → template/fleet 各自開 exact-version PR；不使用 mutable tag 作 dependency input |
| 9 清理與本機對齊 | 刪 remote branch；`git switch main && git pull --ff-only`，確認乾淨後刪 local branch |

**禁止**:direct push main / 同 chat 開多 branch 或多 PR / required-check、conversation、preview／canary、attestation 或 readback bypass / mutable dependency tag / 留 stale 不刪 / 「下個 session 處理」deferred 措辭。**不得把一般 external write 或 milestone 當成人類核准 gate。**

# 命名與語言一致性

**3 重 test**(governance):
1. **既有 DS 詞彙**:對齊 `compact/rich / sm/md/lg / action/indicator / scanning/reading`?
2. **世界級 idiom**:≥ 2 家 world-class DS 用此詞?
3. **跨元件認知衝突**:同字串在其他元件已有不同語義?

3 test 全過才採納。詳細 → `packages/design-system/ds-canonical/references/naming-conventions.md`。
**語言一致性**:spec.md 繁中(技術術語保留英) / code identifier 英 / 單一檔案不中英夾雜。

# 4-Family Layout Model

**每元件 spec 第一段必聲明 Layout Family**(1/2/3/4 或「self-contained」)。

| Family | 用途 | SSOT |
|--------|------|------|
| 1 Menu item / 2 List item | scanning / reading | `patterns/element-anatomy/item-anatomy.spec.md` |
| 3 Pill | 單行互動 pill | `components/Button/button.spec.md`「Pill Layout」|
| 4 Field control | 可編輯資料輸入 | `components/Field/field-controls.spec.md` |

# 自主執行 canonical(Autonomy Default)

**Default = autonomous + complete + verify-to-perfection;省工 = anti-pattern(違 mindset #1)**。

| 動作類別 | 預設 |
|---------|-----|
| **產品／UI／UX SSOT 真決策**(產品需求、使用者行為、IA、workflow、interaction、UI pattern、元件／文案語意、視覺規範或 user-visible tradeoff) | **ASK** — 只有證據收斂後仍存在真實選擇／取捨才由 user 拍板；既有 SSOT 的機械落地不屬此類 |
| **純工程／治理決策與動作**(architecture、provider-neutral SSOT、adapter、skill/hook、security、CI/CD、testing/Harness、dependency、migration、release、supply chain、GitHub config、package/template/WM/rollout/rollback) | **AUTO** — Standing Authorization；整批做到 frozen scope closure + 完整 evidence/readback/receipt/rollback |
| Bug fix / clean / refactor / 命名一致 / perf / a11y / test / audit / verify | **AUTO** — 整批做完 + 完整驗證 + 撤回機制 |

**自主執行同時優化 7 軸**:言簡意賅 / 效率+效能 / SSOT 鐵律 / 易懂維護擴充 / 世界級+一致設計語言 / 完整 self-verify / 自動 self-improve。
**反 pattern**(禁):「省工」/「下次再做」/「下個 session」/「OK 嗎?」過度 ASK / shortcut 避 verify。
**Trigger phrase auto-pipeline**:「依原則自主」/「不需問」/「馬不停蹄」/「全部做完」/「自動」→ autonomous mode,僅 SSOT-affecting UI/UX 停下 ASK。
**Triple-verify before propose**:propose / 列 option / 發現「問題」前必 inline 跑 (1) grep DS-wide (2) Read spec.md / tsx (3) 對照 canonical exception。三題全過才 propose。
**SSOT auto-sync invariant**:跨 file 數字禁 hardcode 多處;以 `scripts/sync-governance-counters.mjs` 機械對齊。

<!-- canonical-decision-authority:start -->
**Decision／Engineering Authority**:user 保留所有產品／UI／UX SSOT 真取捨，以及任何會改變使用者可感知結果、產品語意或 canonical UI／UX SSOT 的決策權，包含 component behavior／contract、interaction／IA、visual／token／layout／content／a11y 語意、合理設計方案選擇、新增刪改 canonical design rule，以及無法證明維持既有 intent 的變更；positive evidence 必在同一 active scope 綁 exact target、choice、operation digest，引用／條件／舊 scope／target-wide 推定無效。其餘工程治理與 external writes 皆 Standing Authorization AUTO，包含已核准 UI／UX 語意的實作及機械式 generation／sync：由 policy 允許的最高 certified model/reasoning/compute，依 frozen scope、SSOT、repo evidence、tests/Harness、security、independent review、least privilege、staged rollout/rollback/readback 收斂；涵蓋 source→commit/PR/merge→GitHub/package/release→template/WM/certification/rollout/recovery，不逐 milestone 重問。需人類授權紀錄時，本 delegation 綁 target digest 寫入既有 audit record；無 certified peer 則 `REVIEW-BLOCKED`。

**Human-only boundaries**:僅不可代理 login/MFA/OAuth/owner/billing、缺 credential reference(只問 secret/vault/Environment/Secret Manager reference，禁貼 secret)、plan 外付費、法律／帳號／組織權限／商業承諾及上述產品決策。Agent 先定唯一工程方案/preflight，只給一個精確 human action，readback 繼續；retry/evidence 後 technical blocker 可 fail-closed，但非 human engineering decision。
<!-- canonical-decision-authority:end -->

# 遇不確定時的協議

**無前例且影響產品／UI／UX SSOT 的真實設計取捨**時 3 步,禁跳:**grep 既有**(30 秒)→ **讀近親 spec.md** → **仍有真選擇才停下問** user。
**非產品／UI／UX SSOT 決策**(architecture / governance / security / release / migration / refactor / test / perf / a11y / hook / skill / typo / 對齊既有 canonical)→ 依 Engineering Decision Policy autonomous,無需問。
禁:跳 grep 憑記憶 / 隨便挑 / 留 TODO。可跳:bug 修 / 機械勞動 / user 明確指示。

# 失敗記憶索引(技術沉默陷阱 only)

| 技術陷阱 | 一行 anchor |
|--------|-----------|
| Tailwind v4 `[--foo]` 必 `var()` | silent 失效 |
| tailwind-merge 自訂 utility 必註冊 group | 否則 strip |
| 元件自包 Provider | 劫持全站 |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook |
| shadcn compat alias 回流 | dark mode 不聯動 |
| `asChild ? Slot : Native` 內部 JSX 仍渲染多 children | React.Children.only runtime fail;asChild 分支 render 只傳 consumer child |
| `tsc -b` 不 emit declaration | TS4023 漏抓;型別 surface 改動必 `npm run build:lib` |
| 工具靜默陷阱:`rsync -a` 等長同秒跳過(必 `--checksum`)/ `rg` 黏寫 `-rn` 的 `-r`=replace / `mktemp -d` 失敗回空 → `cd ""`=原地 → trap 刪掉 cwd | 寫後斷言 + flag 分開寫 + mktemp 必 `[ -d ]` 守衛 |
| DS css 不在 tokens.css aggregator 也沒被 tsx import = orphan | consumer 靜默拿不到 |
| storybook-smoke 驗舊 build = 假綠 | smoke script 已加 stale-build guard |
| `V=$(mktemp -d)` 失敗回空字串,`cd "" && pwd -P` 在 bash 解析成**當前目錄** → `trap 'rm -rf "$V"'` 刪掉 cwd | mktemp 後必 `[ -n ]`+`[ -d ]` 硬守衛才可正規化;2026-07-28 刪光 99 檔 hook corpus anchor |

新 bug → 歸 Meta-Pattern OR 本表 1 行;> 10 條 = 漏寫,評估 meta-merge 既有 M-rule。

# 專案 Stack

Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Storybook + 自訂 Design Token;完整路徑 + Token 系統 → `packages/design-system/src/tokens/README.md`(charter)— DS 內化在 npm workspace。

# 元件完成 + Exploration

merge 前 invoke `/component-quality-gate`(35 項 + visual + clean-code 三層)。正式 `packages/design-system/src/` vs 比稿 `src/explorations/`;比稿 `*.v1.stories.tsx` + `notes.md`,定案升級 patterns/ 或 components/。
