<!-- Authority/status: governance/planning/registry.json -->
# Phase A.0 全盤閱讀 Preflight Checklist(2026-05-18)

## Baseline gate(per design-system-audit Phase 0)
- ✅ `npx tsc -b` exit 0
- ✅ `audit-content-quality.mjs --check` → No content drift
- (Canonical extract + invariant scripts run in A.4 post-edit verify gate)

## Read sweep inventory(本 turn 已 load 進 context)

### 治理 home(always-load + path-scoped)
- ✅ CLAUDE.md(本 turn context)
- ✅ `.claude/rules/meta-patterns.md`(M1-M33,本 turn 加 M18 Q0 升 6-Q)
- ✅ `.claude/rules/spec-rules.md` / `ui-development.md` / `story-rules.md` / `self-verify.md`

### Reference SSOT(15 file in `.claude/references/`)
- ssot-index / ssot-consultation / build-ui-canonicals / naming-conventions / ui-dev-rules / props-naming / tailwind-gotchas / cva-patterns / drag-canonical / item-anatomy-recipe / spec-rules / structural-token-retention / audit-coverage-vs-24-checklist / principle-dim-map.json

### DS spec.md(78 file)
- **Tokens**(7):color / density / elevation / layoutSpace / opacity / radius / typography / uiSize
- **Patterns**(6):action-bar / element-anatomy / inline-action / item-anatomy / horizontal-overflow / overlay-surface / header-canonical
- **Components**(65):見 Glob 結果

### Memory(active)
- MEMORY.md index + 6 project / 10 feedback / 1 reference / 1 user_role

## 預警點(Phase A.0 read 過程發現)

- M18 本 turn 剛升 4-Q → 6-Q,Q0 hook 剛 ship — 本 audit 是首次 Q0 落地驗
- SSOT integrity for `deep-audit-cross-codex` 剛 fix(13 處 hardcoded dim count 清除)
- 36 hooks 接近 35 hard cap(per session_start_governance_check.sh:173)— `/knowledge-prune` 候選 trigger
- D4 hook test coverage 74/100(score warning),D8a hook count 65/100

## Phase A.1 dispatch plan

並行 6 個 Explore sub-agent 覆蓋 Group A-P:

1. **Agent-Group-AB**:Correctness(cva drift / SSOT dead link / reciprocal / Tailwind v4)+ Spec hygiene(Rule A 文字 / Rule B 邊界 / 7-維度覆蓋)
2. **Agent-Group-CDE**:Code conformance(shadcn passthrough / a11y)+ Story 三層 + System consistency(命名 / cross-doc)
3. **Agent-Group-FGH**:Architecture(Layout Family / prop value 衝突 / shadcn alias)+ Home governance + Consumer-layer
4. **Agent-Group-IJK**:Story auto-compile drift + Form integrity + Clean code 量化
5. **Agent-Group-LM**:Story splitting + trait compliance + principles canonical + Overlay body API + Filter operator
6. **Agent-Group-NOP**:State precedence + chain invariants + Storybook content quality + World-class tier(token registry / orphan / a11y / bundle / header / reverse drift)

每 agent NO-SAMPLE STRICT,每 finding cite file:line + 引文 + 違反 spec/rule。
