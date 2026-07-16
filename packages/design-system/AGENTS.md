# 本專案 AI 治理核心(provider-neutral;AGENTS.md 開放標準)

**本檔為所有 AI agent 的治理 SSOT bootstrap**:Codex 等支援 AGENTS.md 標準的 agent 原生載入;Claude Code 經 `CLAUDE.md` 的 `@AGENTS.md` import 載入同一份(Anthropic 官方共用模式)。增刪改治理核心**只改本檔**,兩邊自動同步。
**最終 authority 不是本檔**:本檔引導行為;不可繞過的強制層 = `npm run release:preflight`(~30 deterministic gates)+ CI(release.yml / ci.yml)。**任何 provider 產出的不合規變更都無法通過 preflight/CI 發佈**。Claude 另有 write-time hooks 加速回饋(`.claude/hooks/`,provider 專屬加速器,非信任邊界)。

# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?」沒對齊又說不出理由 = 設計 bug。視覺整齊度不輸原版 + 符合 DS 語言**同時成立**。**禁止以「選較簡單」「省 N edits」為由選 shortcut**——一律最世界級做法。說「快速修」「省工程」是 yellow flag,停下重想。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / variant / layout primitive 前先 `grep` 既有。**強制 `# SSOT 消費 canonical` 清單**——寫視覺 code 前列消費的 components/patterns/tokens/spec。提建議也算定 pattern,給 option 必對照 DS canonical + ≥3 家世界級。**禁止憑印象列部分家**。
3. **改一處必看三處**——code / spec / story 三方聯動。改 cva `defaultVariants` / variant / token 前先 grep 該元件所有檔案,一次改完。
4. **範例必真實業務場景**——Jira / Stripe / Notion / Figma 可辨識情境;禁 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。
5. **猶豫就問**——無前例的決策:grep 既有 → 讀近親 spec → 仍不確定停下問。**禁止憑直覺造新 pattern**。
6. **大原則吸收瑣碎**——同類 bug 反覆糾正 = meta 層沒抓住。見 `.claude/rules/meta-patterns.md` 31 active M-rules(M1-M32,M27/M33/M34/M35 retired,折入 M20/M7/M23(c)(d))。**AI 不需 user 提醒才找 root invariant**——rule 震盪 → AI 自跑 M12 benchmark + invariant test。User 第 2 次問 → 必截圖 verify(M13)。對話結論 → AUTO 5-layer pipeline(M14)。Visual / behavior decision 前必先 WebFetch ≥ 3 source(M26)。Solo-work git ops 必先 grep canonical(M28)。**視覺/結構 propose 前必 grep DS spec.md 找 owner SSOT(M29)— 出 3-column 表;否則提案不被接受**。使用者 tell me once 不該要 tell me twice。

完整 M-rules 詳 `.claude/rules/meta-patterns.md`(必讀)。

# Rule Index(progressive disclosure — 編對應檔案前必先讀)

| 檔案 | 何時必讀 |
|---|---|
| `.claude/rules/meta-patterns.md` | 每個任務(31 條 M-rules,fundamental)|
| `.claude/rules/spec-rules.md` | 編任何 `*.spec.md` 或 DS 內容 |
| `.claude/rules/ui-development.md` | 編任何 `.tsx`/`.ts`(Tailwind 5 條 / Token 4 條 / Props 命名 / shadcn / public-vs-internal)|
| `.claude/rules/story-rules.md` | 編任何 `*.stories.tsx`(三層定位 / Title / 範例準則)|
| `.claude/rules/self-verify.md` | 編任何檔案(Pre/Mid/Post/Pre-commit 4 階段自驗)|
| `.claude/references/ssot-consultation.md` | 寫視覺 code 前(9 項決策對應 SSOT + tsx 檔頭宣告)|
| `.claude/references/ssot-index.md` | 視覺/結構 propose 前(owner SSOT 對照)|
| `.claude/references/naming-conventions.md` | 命名新檔/變數/prop |
| `.claude/skills/design-system-audit/references/audit-prompts.md` | 稽核判準 SSOT(91 dim rubric,Claude 與 Codex 同判準)|

(Claude Code 對 `.claude/rules/` 有 path-scoped 自動載入;其他 agent 依本表在編對應檔案前主動讀取——**同一份檔案,零複製**。)

# 治理 canonical(home 分層 + anti-bloat)

## 規則放哪 home(8-home 分層)

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `AGENTS.md`(本檔;Claude 經 CLAUDE.md import) | 每 session signal 的 mindset + 6 條 + 任務導航 |
| 1.5 | `.claude/rules/*.md` | path-scoped rules(Claude 自動載入;其他 agent 按 Rule Index 讀) |
| 2 | `{name}.spec.md` | 單元件「何時用 / 為什麼」 |
| 3 | Pattern `spec.md` | runtime 跨元件 primitive |
| 4 | Code(`.tsx` / `.css`) | cva / 型別等機械強制 |
| 5 | Skill(`.claude/skills/`) | invoke 情境的多步驟 workflow + checkpoint |
| 6 | Memory(`~/.claude/.../memory/` SSOT + repo `.claude/memory/` mirror)| 跨 session 狀態。本機編完跑 `npm run sync-memory` 推回 repo |
| 7 | Hook(`.claude/hooks/`) | 機械化 pre/post tool 檢查(Claude write-time;最終兜底 = preflight/CI) |
| 8 | Slash Command(`.claude/commands/`) | 一次性單步 action |
| 9 | Plan doc(`.claude/planning/`)| 完整 plan / RFC / spec 草稿 SSOT;memory file 是短 index pointer |

**Q1 設計規則 → Level 1-4 / Q2 invoke 情境 → Skill or Command / Q3 隨時間變化 → Memory(short index)+ Plan doc / Q4 機械化 → Hook(+ preflight gate)**。完整 flowchart → `.claude/skills/design-system-audit/references/rule-placement.md`。

## 行數預算(Anthropic 對齊)

Bootstrap(AGENTS.md + CLAUDE.md 合計)target ≤ 250 / transition ≤ 400 / hard cap 800。SKILL ≤ 250 / spec ≤ 300(foundational SSOT 例外 ≤ 800-1200)/ memory **per-file ≤ 100 lines** + **MEMORY.md index ≤ 20 entries**(soft 18 / hard 20)。Hooks **26 soft / 60 hard**(SSOT = `session_start_governance_check.sh` Check 7)。動態值以 `scripts/sync-governance-counters.mjs` 跑出為準。

## Anti-bloat L1-L3

- **L1 Pre-write**:`check_file_size_budget.sh`(+ governance hooks — dynamic SSOT 在 `.claude/hooks/`)
- **L2 Per-edit**:`log_governance_fires.sh` → `.claude/logs/hook-fires.jsonl`
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

**Audit-vs-execute 分權**:動 canonical substantive meaning → STOP 提議;對齊 / 表達統一 / 清 duplicate / 補 pointer → AUTO。

**Scope classifier — Surgical visual bug**:user 列 N 個 visual defects + 無新 canonical / 無新 API contract / 無 cross-component semantic 改動 → **Surgical scope**:no collab / no new M-rule / no audit report,batch fix + final pixel-quantified verify only。Substantive 改動走 audit-vs-execute STOP 提議流程。

# Independent second opinion(跨 provider 對抗審查)

**Canonical 概念**:重大變更(governance / Critical DS change / deep audit)需 **author provider ≠ reviewer provider** 的獨立第二意見。判準 = 同一份 rubric(`audit-prompts.md`),reviewer 只提 findings(rule 對照 + severity + evidence),**不得**自建規範。記錄雙方 provider/model/version。
- Claude authored → Codex review(現行 driver = `/deep-audit-cross-codex` Phase B,transport = `scripts/codex-run-guarded.mjs`)
- Codex authored → Claude review(對稱)
- **Backend 不可用 → fail-closed**:標 review pending;禁同一 agent 假扮另一 provider;Critical change 不得取得 compliant 宣稱。

# SSOT 消費 canonical

寫視覺 code 前必查對照 — 沒列 = 自創。**完整對照表 + 強制 checklist** → `.claude/references/ssot-consultation.md`(SSOT owner;含 9 項決策對應 SSOT + 新元件 tsx 開頭「── 消費的 SSOT ──」段強制要求)。

# 任務導航表

| 任務 | 必讀 |
|------|------|
| **新增元件** | `.claude/rules/ui-development.md` 「建立 UI 前必讀 / shadcn 元件規範」 + `.claude/rules/spec-rules.md` → `/component-quality-gate` |
| **修 variant / size / state** | 該元件 `spec.md` → `/story-writing` |
| **新增 token** | `tokens/README.md` → `.claude/rules/ui-development.md`「Token 命名 4 條硬規則」→ `tokens/xxx.spec.md` |
| **寫 story / 視覺 code** | `/story-writing` + `# SSOT 消費 canonical` |
| **命名新檔 / 變數 / prop** | `# 命名與語言一致性` + `.claude/rules/ui-development.md`「元件 Props 命名」 |
| **新元件 layout** | `# 4-Family Layout Model` |
| **建產品 / 開新 product app** | `npm run create-app <name>` → `apps/<name>/`;**2-scenario architecture SSOT** → `.claude/references/scenario-definition.md` |
| **新 skill / hook / command** | `.claude/{home}/README.md` charter |
| **無前例設計決策** | `# 遇不確定時的協議` |
| **Tailwind 出怪事** | `.claude/rules/ui-development.md`「Tailwind 5 條核心」+ `# 失敗記憶索引` |
| **Stakeholder 產出 / 稽核** | `# 稽核 canonical` |
| **User 糾正後** | `# 治理 canonical`(home 判斷) |
| **跟 codex 討論 / 多輪震盪 / 任何 codex 輸出** | `.claude/skills/codex-collab/SKILL.md`(M31 5-step canonical SSOT)+ M31 anchor in meta-patterns.md |
| **PR merge 後 / session start branch 健檢** | `# Git solo-work canonical` |

**找不到** → 進 `# 遇不確定時的協議`,不自決定。

# Git solo-work canonical(SSOT → `.claude/memory/feedback_solo_dev_workflow.md`)

**1 chat = 1 working branch**;**Netlify preview 是 user gate**;**「push」/「OK」trigger 才 merge main**。**Session-start 必先 grep canonical + 開 working branch,禁直接在 main 上 edit production code**(M28 sub-rule)。

| 步驟 | 動作 |
|------|------|
| 1 Edit | AI 改 code |
| 2 Commit + push working branch | 自動觸發 Netlify per-branch preview |
| 3 告訴 user 主要 change(or preview URL)| 讓 user 知道看什麼 |
| 4 等 user trigger | **「push / OK / 好 / 合 main」** → step 5;**「改 X / 不對 / 等等」** → 繼續 step 1 |
| 5 Squash merge to main | 不開 PR(可 GitHub API squash-merge OR fast-forward)|
| 5.5 **SSOT propagation gate** | 動到 skill/hook/spec/token/AGENTS/CLAUDE 等 SSOT-affecting paths + user 已給 merge trigger → AI 自動 bump → **`npm run release:preflight`**(唯一發版前 gate 指令)→ tag → publish → `npm view` 驗證,全程不停下問;user 隨時可喊停。bump npm `0.1.0-beta.<N+1>` |
| 6 砍 remote branch | `git push origin --delete <branch>` |
| 7 Local 對齊 | `git checkout main && git fetch && git reset --hard origin/main && git branch -d <branch>` |

**禁止**:開 PR / AI 自決 push main / 同 chat 開多 branch / 留 stale 不刪 / 「下個 session 處理」deferred 措辭。

# 命名與語言一致性

**3 重 test**(governance):
1. **既有 DS 詞彙**:對齊 `compact/rich / sm/md/lg / action/indicator / scanning/reading`?
2. **世界級 idiom**:≥ 2 家 world-class DS 用此詞?
3. **跨元件認知衝突**:同字串在其他元件已有不同語義?

3 test 全過才採納。詳細 → `.claude/references/naming-conventions.md`。
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
| **SSOT-affecting UI/UX**(增刪改 component / token / spec 視覺結構 / 跨元件 design language) | **ASK** — 中文具體人話講選項 + tradeoff,user 拍板才動 |
| Bug fix / clean / refactor / 命名一致 / test / audit / verify | **AUTO** — 整批做完 + 完整驗證 + 撤回機制 |
| Governance / hook / skill / spec **內部**(typo / pointer / 結構 — 不動 canonical meaning)| **AUTO** |
| Perf / a11y / 漸進遷移(不動 SSOT)| **AUTO** — 整批 + verify |

**自主執行同時優化 7 軸**:言簡意賅 / 效率+效能 / SSOT 鐵律 / 易懂維護擴充 / 世界級+一致設計語言 / 完整 self-verify / 自動 self-improve。
**反 pattern**(禁):「省工」/「下次再做」/「下個 session」/「OK 嗎?」過度 ASK / shortcut 避 verify。
**Trigger phrase auto-pipeline**:「依原則自主」/「不需問」/「馬不停蹄」/「全部做完」/「自動」→ autonomous mode,僅 SSOT-affecting UI/UX 停下 ASK。
**Triple-verify before propose**:propose / 列 option / 發現「問題」前必 inline 跑 (1) grep DS-wide (2) Read spec.md / tsx (3) 對照 canonical exception。三題全過才 propose。
**SSOT auto-sync invariant**:跨 file 數字禁 hardcode 多處;以 `scripts/sync-governance-counters.mjs` 機械對齊。

# 遇不確定時的協議

**無前例且影響 SSOT UI/UX 設計判斷**時 3 步,禁跳:**grep 既有**(30 秒)→ **讀近親 spec.md** → **仍不確定停下問** user。
**非 SSOT-UI/UX**(refactor / test / perf / a11y / hook / skill / typo / 對齊既有 canonical)→ autonomous,無需問。
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
| 工具 flag 沉默陷阱:`rsync -a` 等長同秒靜默跳過(必 `--checksum`)/ `rg` 黏寫 `-rn` 的 `-r`=replace 輸出假字串 | 寫後斷言 + flag 分開寫 |
| DS css 不在 tokens.css aggregator 也沒被 tsx import = orphan | consumer 靜默拿不到 |
| storybook-smoke 驗舊 build = 假綠 | smoke script 已加 stale-build guard |

新 bug → 歸 Meta-Pattern OR 本表 1 行;> 10 條 = 漏寫,評估 meta-merge 既有 M-rule。

# 專案 Stack

Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Storybook + 自訂 Design Token;完整路徑 + Token 系統 → `packages/design-system/src/tokens/README.md`(charter)— DS 內化在 npm workspace。

# 元件完成 + Exploration

merge 前 invoke `/component-quality-gate`(35 項 + visual + clean-code 三層)。正式 `packages/design-system/src/` vs 比稿 `src/explorations/`;比稿 `*.v1.stories.tsx` + `notes.md`,定案升級 patterns/ 或 components/。
