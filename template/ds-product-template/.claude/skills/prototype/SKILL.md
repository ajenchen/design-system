---
name: prototype
description: Build UI prototypes / MVPs via a structured UX workflow — benchmark world-class, evaluate against DS + business, produce 2-3 shortlisted candidates as Storybook explorations, self-audit via product-ui-audit, let stakeholders decide. Invoke via /prototype ONLY when user explicitly uses the words「prototype」「MVP」「原型」 in their message (e.g.「做 prototype」「做 MVP」「做原型」「prototype 一個 X」). **DO NOT auto-invoke on casual phrases** like「怎麼做世界級」「給我幾個方案」「比版本」「比幾個版本」「還能怎麼做」「有哪些選項」— these are ambient conversation / thought-partnering, not explicit skill requests; instead ask「要走 prototype skill 正式流程嗎?還是只想先口頭討論?」to confirm before invoking.
---

# Prototype Workflow

Purpose: embody the UX designer's mental model for BUILDING PROTOTYPES — never design by gut; benchmark world-class, filter against DS + business, build multiple shortlisted proposals, self-audit, let stakeholders decide.

This skill is the **structured version** of CLAUDE.md Mindset #1「對標世界級」+ #4「真實業務場景」+ #5「猶豫就問」,and the orchestrator for `src/explorations/` folder usage.

## When to run

**明確觸發**(直接 invoke):user 用「prototype / MVP / 原型」明確字眼。例:「做 prototype」「做 MVP」「做原型」「prototype 一個 X」「做幾個 prototype 版本 compare」。

**模糊觸發**(先 clarify):「給我幾個方案」「怎麼做世界級」「有哪些選項」「比版本」 — 多為 thought-partnering,**先問**「要走正式 prototype skill 還是先口頭討論?」

**不觸發**:已確定單一 feature(直接 implement)/ 單一 pattern 諮詢(直接答)/ 產品交付(走 `/delivery-handoff`)/ DS 本身稽核(走 `/design-system-audit`)/ consumer UI 檢查(走 `/product-ui-audit`)。

**生態位**:`/prototype` → Phase 3.5 chain `/product-ui-audit` gate → stakeholder 決定 → 採用後 `/delivery-handoff`。新 primitive 採用後,加入 DS 時跑 `/design-system-audit` 確保內部健康(正交關注點)。

## Preconditions

- User has briefed a feature / problem / user need (will be clarified in Phase 0)
- Working directory is project root
- CLAUDE.md read fully(DS 既有 primitives / layout primitives 清單 / mindset)

---

## 6-Phase Workflow

### Phase 0 — Clarify

**Input**: user's initial request(可能模糊)

**Process**: AI asks user 3-5 targeted questions to lock down:
- 要做什麼(feature / flow / component)
- 給誰用(primary user persona)
- 解決什麼 jobs-to-be-done(具體使用情境,不是 "better UX")
- 量化指標(若有)(e.g., "減少 50% 流失率")
- Constraints(mobile-first? accessibility level? 時程?)

**Output**: 一段 1-liner summary 確認 alignment。

### ⚠️ Checkpoint 0 — User confirms framing

User approves the problem framing OR clarifies. Do NOT skip to benchmarking without a clean frame.

### Phase 1 — Benchmark research

**Input**: Phase 0 framing

**Process**: Scan 5+ world-class references. See `references/benchmark-sources.md` for the canonical list of DS + world-class SaaS + industry-specific references.

For each reference,收集**兩類資訊**:

**A. 視覺 / 互動(表層)**:
- How do they solve this problem?
- Screenshot(WebFetch or user provides)
- Key mechanics:layout / interaction pattern / states / a11y
- 1-2 line summary of approach

**B. OOUX 層(資訊架構深度對標)**:
- **Core objects** identified(名詞清單 + attributes)
- **Relationships**(object 間如何連,NOM highlights)
- **CTAs per role**(key actions each role 對每 object 可做什麼)
- **UI shape observed**(同一 object 在 list / card / detail / inline 多種 shape 下 attributes 怎麼 progressive disclose)

**為什麼加 OOUX 欄**:視覺只看外型會抄到形式,object model 才是 IA 深度。做完 5 家 benchmark 後,你會發現哪些 object 是業界共識 / 哪些命名是該產品獨有 — 這是 Phase 3 自己建 Object Map 的原料。

詳細 OOUX 分析方法與範本見 [`references/ooux-template.md`](references/ooux-template.md)「Phase 1 用法」節(內含 Linear issue tracking 完整範例)。

**Output**: Markdown scan table(視覺 + OOUX 兩 section):

```
| Reference | Approach | Key mechanics | Screenshot |
|-----------|----------|---------------|------------|
| Linear    | ...      | ...           | link       |
| Stripe    | ...      | ...           | link       |
| ...       |          |               |            |
```

**Report format**: report back to user as the scan table. Do not advance to evaluation yet.

### ⚠️ Checkpoint 1 — Research scope confirmation

User reviews the scan. Options:
- `(a)` Research is sufficient → proceed to Phase 2
- `(b)` Add references X, Y → extend Phase 1
- `(c)` Scope changed → restart Phase 0

### Phase 2 — Evaluate candidates

**Input**: Phase 1 scan table

**Process**: for each candidate,score on 4 axes(see `references/evaluation-matrix.md`):

| Axis | Scale | Meaning |
|------|-------|---------|
| 優缺 | Pros / Cons bullets | 每個候選的獨立評估 |
| DS 一致性 | 1-5 | 能用多少既有元件 / primitives?新元件要不要造? |
| 業務 fit | 1-5 | 符合 Phase 0 jobs-to-be-done 多深? |
| 複雜度 | 1-5(低複雜度 = 5) | 開發成本 / 維護負擔 |

**Output**: 評分矩陣 + narrative summary per candidate。

Narrative 必含:
- 對齊 Mindset #1:「我們 vs 這家做法一樣 / 不同的理由」
- 對齊 Mindset #4:「搭我們的業務情境會不會水土不服」
- 對齊 Mindset #2:「這個 pattern 我們有對應 primitive 嗎?」

### ⚠️ Checkpoint 2 — Shortlist decision(MUST ASK)

這是最關鍵的 checkpoint。presenting 評分後,user 決定:
- 哪 2-3 個候選進 shortlist(要實際做原型)
- 哪些直接 drop(排除理由寫在 exploration notes)
- 是否需要混搭(A 的 interaction + B 的視覺 = 新候選 C)

**絕對不可**憑 AI 自己評分就挑 shortlist。這是設計決策,stakeholder 要參與。

### Phase 3.0 — Build Object Map(ORCA,design 前強制)

**Input**: shortlist + Phase 1 benchmark 的 OOUX 分析

**Process**: 在寫任何 candidate story 之前,**先做 Object Map**(全體 candidate 共享同一個)。ORCA 4 步:

1. **O** Objects:feature 的核心名詞(2-7 個理想;命名三重 test)
2. **R** Relationships(NOM):object 間關聯(1:1 / 1:many / optional)
3. **C** CTAs per role:每角色對每 object 的動作清單
4. **A** Attributes per object:core / metadata / identifying

**Output**:`src/explorations/{topic-slug}/notes.md` 增補 OOUX section(見 `references/ooux-template.md`「Phase 3.0」範本 + Step 5 UI Shape → DS 元件映射表)。

**為什麼共享同一 Object Map**:3 個 candidate 差異應在 **UI shape + progressive disclosure + CTA ordering**,不在 object 定義本身。若 A candidate 把 Task 拆成 Task + Subtask、B candidate 只有 Task,stakeholder 比稿會變成「比 data model」失焦。除非該 feature 本質就是 data model 辯論,否則 object 定義應一致。

**何時跳過**:極小 feature(單一 button / 1-object 開關)可跳過 Phase 3.0,在 notes.md 明文標示「feature 範圍小,跳過 ORCA」。

---

### Phase 3 — Design each shortlisted candidate

**Input**: shortlist(2-3 items)+ Phase 3.0 產出的 Object Map

**Phase 3.0a — SSOT 5-step pre-check**:寫任何 candidate code 前必過 CLAUDE.md「SSOT 消費 canonical」+ memory `feedback_proactive_5layer_pipeline.md`「5-step pre-check」(SSOT 在 memory + CLAUDE.md,本 skill 不重複)。`check_story_invariants.sh` R1 anatomy(原 check_story_anatomy.sh folded 折入)PreToolUse 是最後安全網,但 5-step 是事前 discipline。

**Process**: 每個 candidate 建一個 exploration story,**各 candidate 共享 Object Map 但差異在 UI shape + CTAs 順序**。see `references/proposal-template.md` for structure。

目錄結構:
```
src/explorations/{topic-slug}/
├── notes.md                              # 本 topic 概述 + Phase 2 評估摘要 + 3 候選簡介
├── {CandidateA}.stories.tsx              # 候選 A 原型(Storybook)
├── {CandidateB}.stories.tsx              # 候選 B 原型
└── {CandidateC}.stories.tsx              # 候選 C 原型
```

Storybook title 慣例(不與 Components/ 衝突):
`Explorations/{Topic}/{CandidateName}`

每個 candidate story 必含:
- 標題說明(candidate 名 + 一句話 positioning)
- 實際可互動 prototype(用 node_modules/@qijenchen/design-system/src/ 既有元件!)
- 若需新元件,在 notes.md 標示「此 candidate 需新增 X 元件(若選用此版)」
- 3 種以上使用場景示範(對齊 Mindset #4 真實業務場景)

**DS 一致性鐵律**:
- 優先用既有 `node_modules/@qijenchen/design-system/src/components/` 元件
- 若需新元件 / primitive,**notes.md 明文標示**(不偷偷 add 到 components/)
- 所有 token / layout primitive 按 CLAUDE.md「既有 layout primitives 清單」消費

### ⚠️ Checkpoint 3 — 新元件 / primitive 需求

若任一 candidate 需要新 DS 元件,**必須 ASK**:
- 此新元件是本 candidate 獨有?還是跨 candidate 共用?
- 若被選中,值得升級到 Components/ 嗎?
- 三重命名 test 過嗎?(見 CLAUDE.md)

**絕對不可**在 explorations/ 階段就偷偷 add 到 Components/,會污染 DS。

### Phase 3.5 — Self-audit(stakeholder-gate,強制進階 6 維)

**Input**: Phase 3 完成 + Checkpoint 3 資源決策完畢的 exploration stories
**核心原則**:exploration code 不該直接進 Phase 4 給 stakeholder 看 — AI 必先掃 6 維(對齊 CLAUDE.md `# 稽核 canonical` M6:stakeholder-visible 產出 → 強制進階模式)。
**Output**: per candidate 6 維 report,彙整成 Phase 3.5 gate report。

**6 維 + 執行順序 + Gate 規則完整詳細** → `references/audit-checks.md`(SSOT;本 skill 不重複)。重點:
- D1-D5 chain `/product-ui-audit` / `/performance-audit` / `/ux-audit` / `/visual-audit`
- D6 chain `principle-audit-protocol.md`(設計原則自檢 4 子維)
- 前置:M15 Flow snapshot coverage(無 OpenSnapshot story = block audit)
- Gate 規則:P0 必修 / 高 impact 必修 / D6 疑點 STOP 等 sign-off

### Phase 4 — Present & stakeholder decision

**Input**: 3 個 exploration stories

**Process**: 撰寫 summary(放在 `notes.md`):
- 每 candidate 一句話重述 positioning
- 每 candidate 3 個適合場景 / 3 個不適合場景
- 推薦(AI 可 recommend 一個,但表明 user 決定)
- Link 到各自 Storybook route

**Output**: summary markdown + Storybook URL list → 丟給 stakeholder 評估。

### ⚠️ Checkpoint 4 — Final decision & graduation

User / stakeholder 決定採用某 candidate 後:
- `(a)` 採用 A,promote 到 `node_modules/@qijenchen/design-system/src/` 正式(若需新元件)或消費既有元件建正式 UI
- `(b)` 採用 A 但修改(進第二輪 proposal)
- `(c)` 混搭 A+B 新 hybrid(新 exploration)
- `(d)` 全部不採用(保留 explorations/ 作紀錄,也是有價值的 ruled-out)

**Graduation 流程**:若升級到正式,在 `explorations/_archive/` 備份 exploration(per CLAUDE.md `# 元件完成 + Exploration`:比稿定案升級 patterns/ 或 components/,舊比稿保留作紀錄),正式 code 進 design-system/。

### Phase 5 — Cleanup

刪除 drop 的 exploration 或移 `_archive/`。更新 `src/explorations/` 索引。

---

## Non-goals

- 不在 explorations/ 階段做 detail pixel polish(focus 在 pattern 可行性 + 使用者反應)
- 不自動 promote exploration 到 Components/
- 不代替 stakeholder 決策(AI 可 recommend,但 flag「需 user / stakeholder 決定」)
- 不跳過 benchmark 憑直覺造 pattern(違反 Mindset #1 / #2)
- 不在單個 exploration 塞多個 pattern(一個 story = 一個明確 candidate)

## Common failure modes

- **Phase 1 太淺**:只看 shadcn / Material 就收工。世界級 SaaS(Linear / Stripe / Notion / Figma)的在地解法才是精華
- **Phase 2 評分偏誤**:對 DS 一致性加權過低,結果 shortlist 全是「要造 5 個新元件」 — 違反 DRY
- **Phase 3 太快**:candidate 只做 1 個 story 沒展示多場景 — stakeholder 看不出 robustness
- **Checkpoint 2 skip**:AI 自己挑 2 個 shortlist 用戶沒過目 → 建完才發現方向全錯
- **Phase 4 recommend 太強勢**:summary 幫 user「決定」,違反 skill 精神(exploration 就是讓 stakeholder 評估)

---

## References(`references/`)

- `benchmark-sources.md` 世界級對標 + OOUX
- `ooux-template.md` ORCA / Object Map / NOM / CTA(Sophia V. Prater)
- `evaluation-matrix.md` 4 軸評分 + 決策規則
- `proposal-template.md` explorations/ + Storybook 結構
- `checkpoints.md` 5 MUST ASK 範本 + 歷史 failure mode
