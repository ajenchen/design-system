# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?」沒對齊又說不出理由 = 設計 bug。視覺整齊度不輸原版 + 符合 DS 語言**同時成立**。**禁止以「選較簡單」「省 N edits」為由選 shortcut**——一律最世界級做法。說「快速修」「省工程」是 yellow flag,停下重想。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / variant / layout primitive 前先 `grep` 既有。**強制 `# SSOT 消費 canonical` 清單**——寫視覺 code 前列消費的 components/patterns/tokens/spec。提建議也算定 pattern,給 option 必對照 DS canonical + ≥3 家世界級。**禁止憑印象列部分家**。
3. **改一處必看三處**——code / spec / story 三方聯動。改 cva `defaultVariants` / variant / token 前先 grep 該元件所有檔案,一次改完。
4. **範例必真實業務場景**——Jira / Stripe / Notion / Figma 可辨識情境;禁 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。
5. **猶豫就問**——無前例的決策:grep 既有 → 讀近親 spec → 仍不確定停下問。**禁止憑直覺造新 pattern**。
6. **大原則吸收瑣碎**——同類 bug 反覆糾正 = meta 層沒抓住。見 `.claude/rules/meta-patterns.md` 27 條大原則(M1-M27)。**AI 不需 user 提醒才找 root invariant**——rule 震盪 → AI 自跑 M12 benchmark + invariant test。User 第 2 次問 → 必截圖 verify(M13)。對話結論 → AUTO 5-layer pipeline(M14)。Visual / behavior decision 前必先 WebFetch ≥ 3 source(M26)。使用者 tell me once 不該要 tell me twice。

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

CLAUDE.md target ≤ 200(Anthropic best-practice)/ transition ≤ 400 / hard cap 800。SKILL ≤ 250 / spec ≤ 300(foundational SSOT 例外 ≤ 800-1200)/ memory ≤ 100。

## Anti-bloat L1-L3

- **L1 Pre-write**:`check_file_size_budget.sh` / `check_l3_primitive_import.sh` / `check_principles_canonical.sh`
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

**Audit-vs-execute 分權**:動 canonical substantive meaning → STOP 提議;對齊 / 表達統一 / 補 pointer → AUTO。

# SSOT 消費 canonical

寫視覺 code 前必查對照 — 沒列 = 自創(hook `check_ssot_consultation.sh` 攔)。完整對照 → `.claude/references/ssot-consultation.md`。

| 決策 | 必查 SSOT |
|------|----------|
| 元件選擇 | `ls components/` + `ls patterns/` + 近親 spec |
| Token / 值 | `tokens/{name}/spec.md` |
| Padding / Icon size | `.claude/references/ui-dev-rules.md` |
| Row / item 結構 | `patterns/element-anatomy/item-anatomy.spec.md` |
| 連續 list gap / 容器 breathing | `patterns/element-anatomy/element-anatomy.spec.md` |
| 按鈕排列 / Action bar | `patterns/action-bar/action-bar.spec.md` |
| Chrome header 高度 | `tokens/uiSize/uiSize.spec.md` |
| Overlay 結構 | `patterns/overlay-surface/overlay-surface.spec.md` |
| Variant / prop 命名 | 既有 grep + `# 命名與語言一致性` |

**強制 checklist**:新元件 tsx 開頭必含「── 消費的 SSOT ──」段。

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
| **跟 codex 討論 / 多輪震盪 / 任何 codex 輸出** | `.claude/skills/codex-collab/SKILL.md`。**3-step discipline 鐵律(動 code 前必過)**:(1) Step 4.5 verify codex claim 真不真;(2) Step 4.6 regression / 連動 scan 自己 fix(grep callers / type contract / edge / cross-component / 跑 tsc + invariants);(3) Step 5 比稿 my own-version vs codex 取優棄劣。**禁** pass-through / 直覺 ship / 短 format。Queue SSOT → `.claude/memory/codex-brief-queue.jsonl`(每 session start 必讀,3 min 間隔 / 1 in-flight serial / 10 min auto-followup) |
| **PR merge 後 / session start branch 健檢** | `# Git solo-work canonical` |

**找不到** → 進 `# 遇不確定時的協議`,不自決定。

# Git solo-work canonical(2026-05-08 codified — solo work 不該累積 branch)

**單 active feature branch + main**;PR merge 完**立刻**清,不留 stale。

| 步驟 | 動作 |
|------|------|
| 1 Local main 對齊 | `git fetch origin && git checkout main && git reset --hard origin/main`(sandbox 累積的 unpushed 都是 stop-hook / sync-memory 殘留可棄)|
| 2 砍 local feature branch | `git branch -d <feature>`(已 merge 的 lowercase `-d` 安全) |
| 3 砍 remote feature branch | `git push origin --delete <feature>` ;sandbox proxy HTTP 403 攔 → 提醒 user **GitHub UI 手動刪** |
| 4 Session start 健檢 | `git branch -a` 應只有 `main` + 0-1 active feature(本 session 的);> 1 active feature → 立刻清 |

**禁止**:留 merged 但 remote 未刪的 branch / local main 跟 origin/main divergent / 並行多 active feature 不收斂。Solo work = 1-active 法則,違反 = governance bug。

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

# 遇不確定時的協議

無前例時 3 步,禁跳:**grep 既有**(30 秒)→ **讀近親 spec.md** → **仍不確定停下問** user。
禁:跳 grep 憑記憶 / 隨便挑 / 留 TODO。
可跳:bug 修 / 機械勞動 / user 明確指示。

# 失敗記憶索引(技術沉默陷阱 only)

設計判斷類已被 M1-M27 吸收(見 `.claude/rules/meta-patterns.md`);具體歷史詳 `.claude/skills/design-system-audit/references/historical-bugs.md`。

| 技術陷阱 | 一行 anchor |
|--------|-----------|
| Tailwind v4 `[--foo]` 必 `var()` | silent 失效 |
| tailwind-merge 自訂 utility 必註冊 group | 否則 strip |
| 元件自包 Provider | 劫持全站 |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook |
| shadcn compat alias 回流 | dark mode 不聯動 |

新 bug → 歸 Meta-Pattern OR 本表 1 行;> 10 條 = 漏寫,新增 M21。

# 專案 Stack

Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Storybook + 自訂 Design Token。
必要檔案:`index.html` / `src/main.tsx` / `src/globals.css` / `vite.config.ts` / `package.json` / `tsconfig.json`。
完整路徑 + Token 系統 → `src/design-system/tokens/README.md`(charter)。

# Path-scoped rules(2026 Anthropic 推薦)

僅在相關檔案打開時載入,降低本檔 token 成本:

- `.claude/rules/meta-patterns.md` — 27 M-rules(always loads,fundamental)
- `.claude/rules/spec-rules.md` — paths: `**/*.spec.md` + `src/design-system/**`
- `.claude/rules/ui-development.md` — paths: `**/*.tsx` + `**/*.ts`(含 Tailwind / Token / Props 命名 / shadcn)
- `.claude/rules/story-rules.md` — paths: `**/*.stories.tsx`(三層定位 + Title + 範例最高準則)

# 元件完成 checklist

merge 前 invoke `/component-quality-gate`(45 項 + visual + clean-code 三層)。

# Exploration & Prototype

正式 `src/design-system/` vs 比稿 `src/explorations/`(hook `block_prototype_imports.py` 強制隔離)。比稿 `*.v1.stories.tsx` + `notes.md`,定案升級 patterns/ 或 components/。Skills:`/prototype` / `/component-quality-gate` / `/delivery-handoff`。
