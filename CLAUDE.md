# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?」沒對齊又說不出理由 = 設計 bug。視覺整齊度不輸原版 + 符合 DS 語言**同時成立**。**禁止以「選較簡單」「省 N edits」為由選 shortcut**——一律最世界級做法。說「快速修」「省工程」是 yellow flag,停下重想。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / variant / layout primitive 前先 `grep` 既有。**強制 `# SSOT 消費 canonical` 清單**——寫視覺 code 前列消費的 components/patterns/tokens/spec。提建議也算定 pattern,給 option 必對照 DS canonical + ≥3 家世界級。**禁止憑印象列部分家**。
3. **改一處必看三處**——code / spec / story 三方聯動。改 cva `defaultVariants` / variant / token 前先 grep 該元件所有檔案,一次改完。
4. **範例必真實業務場景**——Jira / Stripe / Notion / Figma 可辨識情境;禁 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。
5. **猶豫就問**——無前例的決策:grep 既有 → 讀近親 spec → 仍不確定停下問。**禁止憑直覺造新 pattern**。
6. **大原則吸收瑣碎**——同類 bug 反覆糾正 = meta 層沒抓住。見 `.claude/rules/meta-patterns.md` 31 active M-rules(M1-M32,M27/M33/M34/M35 retired,折入 M20/M7/M23(c)(d))。**AI 不需 user 提醒才找 root invariant**——rule 震盪 → AI 自跑 M12 benchmark + invariant test。User 第 2 次問 → 必截圖 verify(M13)。對話結論 → AUTO 5-layer pipeline(M14)。Visual / behavior decision 前必先 WebFetch ≥ 3 source(M26)。Solo-work git ops 必先 grep canonical(M28)。**視覺/結構 propose 前必 grep DS spec.md 找 owner SSOT(M29)— 出 3-column 表;否則提案不被接受**。使用者 tell me once 不該要 tell me twice。

完整 M-rules 詳 `.claude/rules/meta-patterns.md`(always loads)。

# 治理 canonical(Claude Code 配置 home 分層 + anti-bloat)

## 規則放哪 home(8-home 分層)

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `CLAUDE.md`(本檔) | 每 session signal 的 mindset + 6 條 + 任務導航 |
| 1.5 | `.claude/rules/*.md` | path-scoped rules(只在相關檔案載入,2026 Anthropic 推薦) |
| 2 | `{name}.spec.md` | 單元件「何時用 / 為什麼」 |
| 3 | Pattern `spec.md` | runtime 跨元件 primitive |
| 4 | Code(`.tsx` / `.css`) | cva / 型別等機械強制 |
| 5 | Skill(`.claude/skills/`) | invoke 情境的多步驟 workflow + checkpoint |
| 6 | Memory(`~/.claude/.../memory/` SSOT + repo `.claude/memory/` mirror)| 跨 session 狀態。本機編完跑 `npm run sync-memory` 推回 repo(讓 cloud sandbox 看得到) |
| 7 | Hook(`.claude/hooks/`) | 機械化 pre/post tool 檢查 |
| 8 | Slash Command(`.claude/commands/`) | 一次性單步 action |
| 9 | Plan doc(`.claude/planning/`)| 完整 plan / RFC / spec 草稿 SSOT;memory file 是短 index pointer 指向 plan doc(對齊 ds-devmode / story-auto-compile pattern) |

**Q1 設計規則 → Level 1-4 / Q2 invoke 情境 → Skill or Command / Q3 隨時間變化 → Memory(short index)+ Plan doc(完整 spec)/ Q4 機械化 → Hook**。完整 flowchart → `.claude/skills/design-system-audit/references/rule-placement.md`。

## 行數預算(Anthropic 對齊)

CLAUDE.md target ≤ 200(Anthropic best-practice)/ transition ≤ 400 / hard cap 800。SKILL ≤ 250 / spec ≤ 300(foundational SSOT 例外 ≤ 800-1200)/ memory **per-file ≤ 100 lines** + **MEMORY.md index ≤ 20 entries**(soft 18 / hard 20,session-start hook 攔)。Hooks **26 soft / 40 hard**(SSOT = `session_start_governance_check.sh:173`)。動態值見 `scripts/sync-governance-counters.mjs` 跑出為準(2026-05-23:**31 M-rules / 56 audit dims / 37 hooks** — 不寫死避 drift,per 2026-05-22 prune codify)。

## Anti-bloat L1-L3

- **L1 Pre-write**:`check_file_size_budget.sh`(+ governance hooks listed in `.claude/hooks/` — dynamic SSOT,不在 CLAUDE.md hardcode 個別 hook)
- **L2 Per-commit**:`log_governance_fires.sh` → `.claude/logs/hook-fires.jsonl`
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

**Consistency 類稽核必 Phase 0 全掃再判**(避免單元件看漏系統 drift)。

**Audit-vs-execute 分權**:動 canonical substantive meaning → STOP 提議;對齊 / 表達統一 / 清 duplicate / 補 pointer → AUTO(對齊 knowledge-prune SKILL Phase 2 P0+P1 scope)。

**Scope classifier — Surgical visual bug**(2026-05-12 codex 抓 anti-pattern「surgical bug 升 architecture audit」)。user 列 N 個 visual defects + 無新 canonical / 無新 API contract / 無 cross-component semantic 改動 → **Surgical scope**:**no codex collab / no new M-rule / no audit report,batch fix + final pixel-quantified verify only**。對齊 Anthropic Best Practice 小修 skip plan + M32(c) batch fix + 對立面是「unscoped investigation infinite exploration」反 pattern。Substantive 改動(API / SSOT / cross-component)走 audit-vs-execute STOP 提議流程。

# SSOT 消費 canonical

寫視覺 code 前必查對照 — 沒列 = 自創。**完整對照表 + 強制 checklist** → `.claude/references/ssot-consultation.md`(SSOT owner;含 9 項決策對應 SSOT + 新元件 tsx 開頭「── 消費的 SSOT ──」段強制要求)。Hook `check_ssot_consultation.sh` 2026-05-XX 已 retired → 改靠 mindset #2 + audit dim 1 + check_canonical_propagation hook 接手檢查。

# 任務導航表

| 任務 | 必讀 |
|------|------|
| **新增元件** | `.claude/rules/ui-development.md` 「建立 UI 前必讀 / shadcn 元件規範」 + `.claude/rules/spec-rules.md` → `/component-quality-gate` |
| **修 variant / size / state** | 該元件 `spec.md` → `/story-writing` |
| **新增 token** | `tokens/README.md` → `.claude/rules/ui-development.md`「Token 命名 4 條硬規則」→ `tokens/xxx.spec.md` |
| **寫 story / 視覺 code** | `/story-writing` + `# SSOT 消費 canonical` |
| **命名新檔 / 變數 / prop** | `# 命名與語言一致性` + `.claude/rules/ui-development.md`「元件 Props 命名」 |
| **新元件 layout** | `# 4-Family Layout Model` |
| **新 skill / hook / command** | `.claude/{home}/README.md` charter |
| **無前例設計決策** | `# 遇不確定時的協議` |
| **Tailwind 出怪事** | `.claude/rules/ui-development.md`「Tailwind 5 條核心」+ `# 失敗記憶索引` |
| **Stakeholder 產出 / 稽核** | `# 稽核 canonical` |
| **User 糾正後** | `# 治理 canonical`(home 判斷) |
| **跟 codex 討論 / 多輪震盪 / 任何 codex 輸出** | `.claude/skills/codex-collab/SKILL.md`(M31 5-step canonical SSOT;含 transport / Step 0.05 user-verbatim relay / queue + interval / hook 機械強制)+ M31 anchor in meta-patterns.md |
| **PR merge 後 / session start branch 健檢** | `# Git solo-work canonical` |

**找不到** → 進 `# 遇不確定時的協議`,不自決定。

# Git solo-work canonical(SSOT → `.claude/memory/feedback_solo_dev_workflow.md`)

**1 chat = 1 working branch**;**Netlify preview 是 user gate**;**「push」/「OK」trigger 才 merge main**。**Session-start 必先 grep canonical + 開 working branch,禁直接在 main 上 edit production code**(M28 sub-rule,hook `check_main_branch_workbench.sh` mechanical 攔截)。

| 步驟 | 動作 |
|------|------|
| 1 Edit | AI 改 code |
| 2 Commit + push working branch | 自動觸發 Netlify per-branch preview |
| 3 告訴 user 主要 change(or preview URL)| 讓 user 知道看什麼 |
| 4 等 user trigger | **「push / OK / 好 / 合 main」** → step 5;**「改 X / 不對 / 等等」** → 繼續 step 1 |
| 5 Squash merge to main | 不開 PR(可 GitHub API squash-merge OR fast-forward)|
| 6 砍 remote branch | `git push origin --delete <branch>` ;sandbox HTTP 403 → 提醒 user GitHub UI 手動 |
| 7 Local 對齊 | `git checkout main && git fetch && git reset --hard origin/main && git branch -d <branch>` |

**禁止**:開 PR / AI 自決 push main / 同 chat 開多 branch / 留 stale 不刪 / 「下個 session 處理」deferred 措辭。完整禁忌 / Trigger phrase / 反 pattern 詳 SSOT memory file。

# 命名與語言一致性

**3 重 test**(governance):
1. **既有 DS 詞彙**:對齊 `compact/rich / sm/md/lg / action/indicator / scanning/reading`?
2. **世界級 idiom**:≥ 2 家 world-class DS 用此詞?
3. **跨元件認知衝突**:同字串在其他元件已有不同語義?

3 test 全過才採納。歷史:FileItem `text/picture` 撞 Button `variant="text"` → 改 `compact/rich`。

詳細 → `.claude/references/naming-conventions.md`。

**語言一致性**:spec.md 繁中(技術術語保留英) / code identifier 英 / 單一檔案不中英夾雜。

# 4-Family Layout Model

**每元件 spec 第一段必聲明 Layout Family**(1/2/3/4 或「self-contained」)。

| Family | 用途 | SSOT |
|--------|------|------|
| 1 Menu item / 2 List item | scanning / reading | `patterns/element-anatomy/item-anatomy.spec.md` |
| 3 Pill | 單行互動 pill | `components/Button/button.spec.md`「Pill Layout」|
| 4 Field control | 可編輯資料輸入 | `components/Field/field-controls.spec.md` |

# 自主執行 canonical(Autonomy Default,2026-05-14 user SSOT directive)

**Default = autonomous + complete + verify-to-perfection;省工 = anti-pattern(違 mindset #1)**。

| 動作類別 | 預設 |
|---------|-----|
| **SSOT-affecting UI/UX**(增刪改 component / token / spec 視覺結構 / 跨元件 design language) | **ASK** — 中文具體人話講選項 + tradeoff,user 拍板才動。**Enforcement scope split**:production code(`src/**/*.{tsx,ts,css}`)由 `check_substantive_edit_approval_preflight.sh` PreToolUse 攔截;`*.spec.md` 視覺結構 / canonical / SSOT 段落 edit 由 `stop_self_audit.sh` 補位 post-action 攔截(避免 spec typo false-positive BLOCKER)|
| Bug fix / clean / refactor / 命名一致 / test / audit / verify | **AUTO** — 整批做完 + 完整驗證 + 撤回機制(M33 反 defer) |
| Governance / hook / skill / spec **內部**(typo / pointer / 結構 — 不動 canonical meaning)| **AUTO** — audit-vs-execute 分權 |
| Perf / a11y / 漸進遷移(不動 SSOT)| **AUTO** — 整批 + verify |

**自主執行同時優化 7 軸**:言簡意賅 / 效率 + 效能(M20 ≥ 80)/ SSOT 鐵律(M17/M23/M29/M30)/ 易懂維護擴充(M9/M21/M23(c))/ 世界級 + 一致設計語言(mindset #1 + M8/M22/M26)/ 完整 self-verify(M20/M31/M32)/ 自動 self-improve(M14/M20)。

**反 pattern**(禁):「省工」/「下次再做」/「下個 session」(M33)/「OK 嗎?」過度 ASK / shortcut 避 verify / 不對齊 mindset #1。

**Trigger phrase auto-pipeline**(M19 升級):「依原則自主」/「不需問」/「馬不停蹄」/「全部做完」/「自動」→ 進 autonomous mode,僅 SSOT-affecting UI/UX 停下 ASK。

**2026-05-23 永久 reinforcement(user verbatim,hook 機械強制)**:
- **Triple-verify before propose**(M18 Q0 universal gate):propose / 列 option / 發現「問題」(含 codex / deep audit findings)前必 inline 跑 (1) grep DS-wide (2) Read spec.md / tsx (3) 對照 canonical exception。三題全過才 propose;任一 NO → 自動撤回不煩 user。Hook `check_propose_pre_grep_verify.sh`。Anchor:2026-05-18 Sheet/inline-action/SurfaceBody false positive、2026-05-23 Badge `text-[10px]` 誤判為 drift(spec L161-167 documented exception)
- **SSOT auto-sync invariant**:M-rule count / hook count / dim count / npm scope / version / plugin name 等跨 file 數字禁 hardcode 多處;SSOT in `session_start_governance_check.sh:173` / `meta-patterns.md` / `design-system-audit/SKILL.md` / `package.json` / `.claude-plugin/plugin.json`;其他 file reference 或 `scripts/sync-governance-counters.mjs` 機械對齊,drift 偵測 auto fix

# 遇不確定時的協議

**無前例且影響 SSOT UI/UX 設計判斷**時 3 步,禁跳:**grep 既有**(30 秒)→ **讀近親 spec.md** → **仍不確定停下問** user。
**非 SSOT-UI/UX**(refactor / test / perf / a11y / hook / skill / typo / 對齊既有 canonical)→ autonomous,無需問。
禁:跳 grep 憑記憶 / 隨便挑 / 留 TODO。
可跳:bug 修 / 機械勞動 / user 明確指示。

# 失敗記憶索引(技術沉默陷阱 only)

設計判斷類已被 M-rules 吸收(見 `.claude/rules/meta-patterns.md`);具體歷史詳 `.claude/skills/design-system-audit/references/historical-bugs.md`。

| 技術陷阱 | 一行 anchor |
|--------|-----------|
| Tailwind v4 `[--foo]` 必 `var()` | silent 失效 |
| tailwind-merge 自訂 utility 必註冊 group | 否則 strip |
| 元件自包 Provider | 劫持全站 |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook |
| shadcn compat alias 回流 | dark mode 不聯動 |

新 bug → 歸 Meta-Pattern OR 本表 1 行;> 10 條 = 漏寫,**評估 meta-merge 既有 M-rule 而非無腦新增**(meta-patterns velocity ≤ 3/quarter,單 M-rule 必吸收 ≥ 3 prior bugs)。

# 專案 Stack

Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Storybook + 自訂 Design Token。
必要檔案:`index.html` / `src/main.tsx` / `src/globals.css` / `vite.config.ts` / `package.json` / `tsconfig.json`。
完整路徑 + Token 系統 → `packages/design-system/src/tokens/README.md`(charter)— Phase 1 後 DS 內化在 npm workspace。

# Path-scoped rules(2026 Anthropic 推薦)

僅在相關檔案打開時載入,降低本檔 token 成本:

- `.claude/rules/meta-patterns.md` — 31 active M-rules(M1-M32,M27/M33/M34/M35 retired,always loads,fundamental)
- `.claude/rules/spec-rules.md` — paths: `**/*.spec.md` + `src/design-system/**` + `packages/design-system/**`(post Phase 1 migration)
- `.claude/rules/ui-development.md` — paths: `**/*.tsx` + `**/*.ts`(含 Tailwind / Token / Props 命名 / shadcn)
- `.claude/rules/story-rules.md` — paths: `**/*.stories.tsx`(三層定位 + Title + 範例最高準則)

# 元件完成 checklist

merge 前 invoke `/component-quality-gate`(45 項 + visual + clean-code 三層)。

# Exploration & Prototype

正式 `packages/design-system/src/`(Phase 1 後 npm workspace 內化)vs 比稿 `src/explorations/`(hook `block_prototype_imports.py` 強制隔離)。比稿 `*.v1.stories.tsx` + `notes.md`,定案升級 patterns/ 或 components/。Skills:`/prototype` / `/component-quality-gate` / `/delivery-handoff`。
