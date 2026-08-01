---
name: codify-principle
description: User 提出新設計原則 → auto 5-layer artifact generation pipeline。將原則文字自動轉化為 SSOT canonical text + hook scaffold + audit dim + scaffold update + memory entry,依 rule-placement Level 1–9 taxonomy 放入正確 home。對齊 M14 + M19。Invoke when user says「我想加一條設計原則 X」「新原則 Y」「ensure X always」OR auto-recognize trigger phrase。本 skill 把 reactive markdown rule 升級成 proactive principle-to-artifact generator。
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/codify-principle/SKILL.md; provider: codex; do not edit this adapter view. -->

# Codify Principle Skill — 原則 → 5-layer artifacts auto-generator

User mandate「我說一條原則 → 自動轉化產生正確 artifacts 放正確位置」(2026-04-26)。本 skill 是 M19 ensure-canonical pipeline 的 generator 上層,接受 principle text 為 input,output 5-layer 完整落地。

## When to invoke

- User 明說「我想加一條設計原則 X」「新原則 Y」
- User 描述新規則 + 期望「永遠遵守」/「不可漂移」
- M19 trigger phrase(確保 / 一定 / 永遠不漂移)+ 涉及新原則內容
- Auto-chained from `/ensure-canonical` 當 trigger 是「新原則」非「既有原則 enforce」

## Non-goals

- 不自行改寫使用者未決定的產品／UI／UX SSOT；工程／治理 canonical implementation 依 Standing Authorization 自動落地
- 不跳過 M8 benchmark — 任何新 cross-component 原則必 ≥ 3 家世界級對照
- 不省略 authority classification 與 evidence receipt
- 不替換 user 的產品／UI／UX取捨；scope/home/type/hook/audit/release 等工程判斷由 agent 自行決定

## Workflow(7 phases)

### Phase 1 — Parse principle text(Auto)

User 提供 principle text。Skill 提取:
- **Scope**:跨元件 / 單元件 / 跨 layer / governance-only
- **Type**:Absolute(機械可驗)/ Consistency(對照可驗)/ Judgement(無 mechanical)
- **Affected homes**(依 `design-system-audit/references/rule-placement.md` Level 1–9 taxonomy):
  - `packages/design-system/ds-canonical/rules/` 或 `references/` 哪個 canonical owner?
  - `*.spec.md` 哪個元件?
  - 新 hook?
  - 新 audit dim?
  - 新 skill?
  - Memory entry?

### Phase 2 — M8 benchmark(fail closed if missing)

對 cross-component 原則(scope ≠ governance-only),**強制** M8 ≥ 3 家世界級 DS 對照:
1. 跑 web research(WebFetch Polaris / Material / Carbon / Atlassian / Ant 等對應 component / pattern)
2. 列對照表:每家做法 + 我們對齊 / 偏離 + 偏離 rationale
3. 若 < 3 家對照 → 擴大 primary-source research／distinct-provider review，不得把資料不足轉成 user 工程判斷；只有「是否採用無 benchmark 的原創產品／UI／UX原則」是真產品取捨時才 STOP

### Phase 3 — Draft 5 layer artifacts(authority-classified)

每 layer 產 draft + evidence，工程 mapping 不逐層等 user:

| Layer | Action |
|-------|--------|
| 1. SSOT canonical | 寫 markdown text 到對應 canonical home(`packages/design-system/ds-canonical/rules/` / `references/`、spec.md 段);包含 rule + Why + How to apply + 世界級 anchor |
| 2. Spec frontmatter | 若 trait-like → 加入 `traits:` array OR 新增 frontmatter field |
| 3. Hook | 若 Absolute → scaffold `packages/design-system/ds-canonical/hooks/check_{topic}.sh` 含 P0/P1 detection logic + 7-Q self-check 模板，並更新 canonical `registrations.json` |
| 4. Audit dim | 加 dim N 到 `packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md` + `references/audit-prompts.md`(periodic verify) |
| 5. Memory | 寫 `governance/memory/project_{topic}_{date}.md` + 更新 `governance/memory/MEMORY.md` index；provider cache 只由 `npm run sync-memory` 投影 |

**每 layer 都記錄 review receipt**:
```
Phase 3 Layer N draft ready:
{draft content}
Authority: ENGINEERING-AUTO | PRODUCT-UIUX-DECISION
Evidence / tests / rollback: {...}
```

### Phase 4 — Auto-generate scaffold update

若原則是「新元件 / 新 story 該滿足」 → 更新 `/new-component` Phase 5 scaffold + `/story-writing` Phase 0。

### Phase 5 — Auto-generate hook test

若 Layer 3 hook 建立 → scaffold `packages/design-system/ds-canonical/hooks/tests/test_{topic}.sh` 含 ≥ 5 smoke tests(silent skip / canonical compliance / drift block / rationale escape / per-trait verify)。Provider hook config/view 由 adapter materialize，禁止手改。

### Phase 6 — Apply + verify(分組 commit)

Per layer 一個 commit:
1. SSOT commit
2. Hook + test commit
3. Audit dim commit
4. Scaffold update commit
5. Memory + final verify commit

每 commit 後跑:
- `npx tsc -b`
- 新 hook test
- `node scripts/audit-content-quality.mjs --check`(防 content drift)

### Phase 7 — Self-improvement capture

```markdown
## Self-improvement capture
- 新原則 SSOT home: {path}
- 新 hook: {filename} / fires on: {pattern}
- 新 audit dim: N
- 5-layer 落地完整度: {% layers actually shipped}
- 跳過的 layer + rationale: {if any}
```

更新 `$GOVERNANCE_STATE_DIR/codified-principles.jsonl` runtime log(lazy-create on first run；只在 trusted telemetry opt-in 且 state root 位於 Git-owned `<git-dir>/governance-runtime/` 時建立；provider home 不得作 fallback):
```json
{"date":"2026-04-26", "principle":"...", "scope":"...", "layers":["ssot","hook","audit","scaffold","memory"], "commits":[...]}
```

## Authority gates(禁止跳 classifier，禁止 blanket user gate)

### Gate 1 — Phase 1 parse
Scope / type / affected homes 是工程 mapping，由 agent 依 canonical 自行決定。只有原則文字本身對產品／UI／UX語意有多種合理解讀且會改 SSOT，才請 user 釐清。

### Gate 2 — Phase 2 benchmark
< 3 家世界級對照 → 繼續 primary-source research 或標 `REVIEW-BLOCKED`；只有 OG-only 是否成為產品／UI／UX原則的選擇交給 user，工程治理原則由 evidence + security/hard gates 決定。

### Gate 3 — Phase 3 per-layer
每 layer 都過 tests／independent review／rollback check；工程 canonical substantive 直接執行，只有產品／UI／UX SSOT 真取捨停下。

### Gate 4 — Phase 6 verify
任何 layer commit 後 tsc / hook test fail → 回該 phase 修,**不繞過**。

## 與既有 skills 分工

| Skill | Scope |
|-------|-------|
| `/ensure-canonical` | 既有原則 enforcement(hook / audit 補強)|
| `/codify-principle`(本)| **新原則** 從 0 生成 5-layer artifacts |
| `/knowledge-prune` | 反向:既有原則太多時 retire |
| `/design-system-audit` | periodic verify 既有 artifacts compliance |

`/codify-principle` 是新原則 entry point;落地後其他 skill 接管 enforcement / verify / retire。

## References

- `governance/memory/MEMORY.md` — repository-owned index of codified principles（SSOT）
- `$GOVERNANCE_STATE_DIR/codified-principles.jsonl` — non-authoritative execution log(lazy-create on first run,見 Phase 7)
- `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md` — home 識別 rules
- `packages/design-system/ds-canonical/rules/meta-patterns.md` M14 / M19 — 上游 pipeline rules

## 範例呼叫

User 說:「我要加一條原則:所有 form-like 元件必須支援 controlled + uncontrolled dual-mode」

Skill 自動:
1. Parse:scope=cross-component,type=Absolute(可機械驗 prop pair)
2. M8:Polaris/Material/Atlassian React form lib 都支援 dual-mode ✓ (3/3 ≥3)
3. Draft layer:
   - SSOT:`packages/design-system/ds-canonical/rules/ui-development.md`「元件 Props 命名」 + form spec
   - Hook:`packages/design-system/ds-canonical/hooks/check_form_dual_mode.sh`(未實作;此為 5-layer 產物範例 — audit-only via dim,無 write-time hook)偵測 missing pair
   - Audit dim:Dim 31「Dual-mode coherence」(已存在 Dim 26 — 依 evidence 擴充既有 dim，不重複新增)
   - Scaffold:`/new-component` Phase 4 加 dual-mode template
   - Memory:`project_form_dual_mode_2026_04_26.md`
4. Per-layer evidence + authority receipt
5. Hook test + audit prompt
6. Apply + tsc + verify
7. Capture
