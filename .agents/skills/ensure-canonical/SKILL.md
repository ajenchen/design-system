---
name: ensure-canonical
description: User 說「確保 X 一定要 / 不可繞過 / 永不漂移 / ensure X always」trigger phrase → 自動規劃完整 defense-in-depth pipeline(M14 5-layer + M8 benchmark + M17 SSOT + M10 下游),至少 3 層落地。對應 canonical meta-pattern M19。Invoke via /ensure-canonical OR auto-recognize trigger keywords(確保 / 一定 / 不可繞過 / 不准 silent / 永不漂移 / ensure / always / never bypass / never silent)。本 skill 把 reactive「user 講 N 次才完整落地」改 proactive「trigger phrase auto plan 5-layer」。
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/ensure-canonical/SKILL.md; provider: codex; do not edit this adapter view. -->

# Ensure Canonical — User Trigger Phrase → Auto Defense-in-Depth

**目的**: User 提出「某事 X 一定要照規矩發生」類 request → 自動套 5-layer defense-in-depth(canonical / hook / skill / audit / verify),不靠 AI 自律,不靠多次糾正,不留 silent bypass。

**對應**:`packages/design-system/ds-canonical/rules/meta-patterns.md` M19。世界級對照 Spotify Backstage / Polaris / Material / Carbon 4 家「rule + lint + test + doc」共識。

## When to run

**自動 trigger keywords**(英中):
- 「確保 X / 確保所有 / 一定要 / 一律 / 永不漂移 / 不可繞過 / 不准 silent」
- 「ensure X always / X must / X required / never bypass / no silent X」
- 「規矩」+「發生 / 觸發 / enforce」
- 「自動 X / X must auto」

**手動 invoke**:`/ensure-canonical` 後接規則描述。

## When NOT to run

- 純資訊請求(「告訴我 X 是什麼」)
- 一次性 ad-hoc 操作(「修這 1 個 bug」)
- 已 codified rule 的 enforcement(走 audit 不走本 skill)

## Preconditions

- 讀 `packages/design-system/ds-canonical/rules/meta-patterns.md` M14 / M19(本 skill SSOT 上游)
- 讀 `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md`(home placement)
- 該 rule 若仍有會改變產品／UI／UX SSOT 的真取捨 → Phase 5 列 human-only decision；純工程／治理 substantive 依 Standing Authorization 自主 finalize

## Workflow(8 phases)

### Phase 0 — Parse user rule(必跑)

從 user prompt 抽出:
- **Subject**: 「什麼事」(e.g. story splitting principle)
- **Constraint**: 「必 X」「禁 Y」(e.g. start+end icon 必合 WithIcon,不准拆兩 story)
- **Scope**: 全 DS / 特定元件 / 特定情境
- **Existing state**: 已有相關 canonical 嗎?(grep `packages/design-system/ds-canonical/{rules,references,skills,hooks}` / spec.md)

Output:1 句結構化 rule。

### Phase 1 — M8 World-class benchmark(必跑)

≥ 3 家 world-class DS / engineering org 對照:
- Polaris / Material / Atlassian / Ant / Carbon / Apple HIG / VS Code / Figma / Storybook 官方 / Spotify Backstage
- 每家寫具體實作名 + URL or source(closed source 標 closed)

通過條件:**3 家 verified + AI 不假裝對齊不存在的 source**(對齊 M8 「無對照 = 未成熟」)。

### Phase 2 — M17 SSOT 識別(必跑)

問 4 題:
- 此 rule 屬哪 canonical home?(`packages/design-system/ds-canonical/{rules,references,hooks,skills}` / spec.md / token / governance memory)
- 該 rule 是 SSOT 本身還是 pointer?
- 是否 token / primitive / utility class 三擇一可程式化(M17)?
- 若仍 markdown-only canonical → flag 為「假 SSOT」風險

### Phase 3 — Rule-of-3 + M10 下游檢查(必跑)

- grep 既有 canonical(`packages/design-system/ds-canonical/` / specs / governance memory)有無相同概念
- 若 ≥ 3 處出現 → 選 SSOT owner,其他 pointer only(避免 drift)
- 新 rule 落地後,既有哪些 spec / memory / bug case 變冗餘?明寫「可刪 X」或「無下游」

### Phase 4 — 5-Layer enforcement plan(必跑)

對應 M14 pipeline,plan 對齊以下 5+1 層,**至少 3 層真落地**:

| Layer | 用途 | 範例 |
|------|------|------|
| **1 ds-canonical rule / spec.md** | Canonical SSOT,文字規則 | 在 `packages/design-system/ds-canonical/rules/` 或 owning spec 加段、加 row,定義 rule + rationale |
| **2 Hook** | Write-time mechanical block | exit 2 + 訊息 + allowlist |
| **3 Hook test** | Regression 防護 | 8+ scenario test_*.sh |
| **4 Skill workflow** | invoke 時 phase gate | /story-writing Phase 0 mapping |
| **5 Audit dim** | Periodic mechanical batch verify | /design-system-audit Group X |
| **6 Memory / verify** | Cross-session state + 每次 verify | tsc / build / visual / hook test |

**選擇邏輯**:
- 機械可判斷 + 高頻寫 → 必加 Hook
- 多步驟或含平台 human-only action → 必加 Skill；human action 不轉移工程決策權
- 既有元件需驗 → 必加 Audit dim
- 規則本身 → 必加 canonical rule / owning spec.md
- 無 user-reported pain 的層 → 跳過(M6 反 vanity)

### Phase 5 — Authority classification + plan receipt(必跑但非 blanket stop)

產出並回報:
```
Rule: <Phase 0 結構化>
Benchmark: <Phase 1 3 家對照>
SSOT: <Phase 2 home + 是否 SSOT 本身>
下游影響: <Phase 3 retire 候選>
落地 plan(5+1 層,至少 3 落地):
  1. Canonical rule/spec: ✓ <加哪個 ds-canonical/spec owner>
  2. Hook: ✓ <檔名 + 抓什麼 pattern>
  3. Hook test: ✓ <case 數>
  4. Skill: ✓ / ✗ <為什麼>
  5. Audit dim: ✓ / ✗
  6. Verify: ✓ <tsc / build / visual>
Authority: <ENGINEERING-AUTO | PRODUCT-UIUX-DECISION | HUMAN-PLATFORM-ACTION>
Substantive 動議: <工程 → evidence/review/rollback；產品 UI/UX 真取捨 → batch-at-end decision>
```

`ENGINEERING-AUTO` 直接進 Phase 6，不等 milestone 確認。只有 `PRODUCT-UIUX-DECISION` 或 shared governance 定義的平台／credential／額外付費／法律帳號商業 human-only boundary 才停；平台 action 前仍先完成唯一工程方案與可做 preflight。

### Phase 6 — Execute(每層 commit / verify)

每層分批 commit(M11 user-perspective walk + governance check):
1. Canonical rule/spec edit + 7-Q hook self-check 過
2. Hook write + 8 scenario test + register `packages/design-system/ds-canonical/hooks/registrations.json`
3. Canonical skill workflow 加 phase
4. Audit dim 加到 `packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md`
5. Batch fix 既有違規(grep + perl/sed rename + Visual diff)
6. Commit `feat(scope): <rule> + N-layer enforcement(M19)`
7. Push + GitHub Pages deploy verify

### Phase 7 — Verify

- `npx tsc -b 2>&1 | tail -3` → 0 error
- `npm run build-storybook 2>&1 | tail -3` → ✓ built
- `bash packages/design-system/ds-canonical/hooks/tests/run-all.sh` → all suites pass
- `git status --short` → clean
- `git log origin/main..HEAD` → empty(全 push)

任一 fail → 回 Phase 6 修。

### Phase F — Self-improvement capture(必跑)

```markdown
## Self-improvement capture
- 新發現 trigger pattern: ... OR 「無」
- 新確立 enforce template: ... OR 「無」
- 修完的 trigger 漂移 / user 糾正: ... OR 「無糾正」
```

回填:
- 新 trigger phrase → 加進 SKILL.md「When to run」
- enforce template 抽象化 → 加進 references/patterns.md(若 ≥ 3 次同 pattern)
- user 糾正 → `governance/memory/feedback_*.md` / `packages/design-system/ds-canonical/rules/meta-patterns.md` M-row

## Authority gates

### Gate 1 — Phase 5 plan receipt

Plan 與 scope classifier 必記錄，但純工程不得停等 user 拍板。只有 plan 暴露出新的產品／UI／UX SSOT 真取捨才請 user 決策。

### Gate 2 — Substantive 動議

- 工程／治理 canonical 既有 substantive meaning(改 rule、刪 rule、改 SSOT 位置)→ AUTO，綁 evidence；task／deliverable 明確要求時才加 maximum-assurance independent review
- 改變產品／UI／UX SSOT 且仍有真取捨 → STOP
- 對齊 / 表達層調整 / 補 pointer → AUTO

### Gate 3 — Layer 數不足

至少 3 層落地。若計算只有 2 層(e.g. 只 spec + hook,無 skill / audit / verify)→ 重 Phase 4 plan 補。

### Gate 4 — User 沒明確 trigger phrase但有 implicit ensure 意圖

例:user 說「為什麼之前都漏這個」「下次怎麼確保不再發生」 → 自動 trigger M19 並走完整 pipeline，不另問是否啟動。

## Non-goals

- 不負責 single-file refactor(走 /design-system-audit)
- 不負責 ad-hoc bug fix(走 /scan-similar-bugs)
- 不替代 propose-options 4-Q gate(M18 不同階段:propose vs ensure)
- 不自行發明產品／UI／UX SSOT；純工程／治理 substantive 依 Standing Authorization 自動執行

## 與其他 skill 分工

| Skill | Trigger | Scope |
|-------|---------|-------|
| **/ensure-canonical** | 「確保 X 一定要」trigger phrase | 規劃 N-layer enforcement |
| `/propose-options` | 列 options 給 user 前 | 4-Q gate per option |
| `/design-system-audit` | 已 codified rule batch verify | audit 既有元件 |
| `/knowledge-prune` | governance bloat | Level 1–9 taxonomy retire / consolidate |
| `/scan-similar-bugs` | 修 bug 後 | M10 exhaustive scan |
| `/story-writing` | 寫 / 編 stories | rule-mapping workflow |

## References

- `packages/design-system/ds-canonical/rules/meta-patterns.md` M14(對話結論 → integrate pipeline)
- `packages/design-system/ds-canonical/rules/meta-patterns.md` M19(本 skill SSOT 上游)
- `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md`(home placement)
- Story splitting principle(2026-04-26 本 skill template 案例,4-layer 落地)

## 世界級對照(template 細節)

| Org | 4-layer pattern |
|-----|---------------|
| **Spotify Backstage** | Catalog rules + tech docs + hooks + integration tests |
| **Polaris** | Spec.md + storybook tests + lint rules + contribution gate |
| **Material 3** | Rule docs + linter + test suite + design token |
| **Carbon** | Storybook + a11y test + style lint + contribution check |

我們的 5-layer 對齊 + 加 audit dim(periodic verify drift)。
