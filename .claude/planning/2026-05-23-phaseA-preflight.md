# Phase A.0 全盤閱讀 checklist(2026-05-23 deep-audit-cross-codex,Layer A Claude own)

## 已讀(session context + auto-load)

- ✅ `CLAUDE.md` 全文(202 lines,system-reminder auto-load)
- ✅ `.claude/rules/meta-patterns.md`(31 active M-rules,system-reminder auto-load)
- ✅ `.claude/rules/spec-rules.md`(system-reminder path-scoped)
- ✅ `.claude/rules/ui-development.md`(system-reminder path-scoped)
- ✅ `.claude/rules/self-verify.md`(system-reminder path-scoped)
- ✅ `.claude/rules/story-rules.md`(system-reminder path-scoped)
- ✅ MEMORY.md index + 20 active memory files(system-reminder auto-load)
- ✅ 本 session 前文(commit `3d4ecd2f` 已 land autonomous-default + SSOT auto-sync)
- ✅ `audit-preflight.mjs` output:397 files / 56 dims / 0 coverage gaps
- ✅ `dispatch-audit-dims.mjs` output:3 batches dispatch plan(SSOT-driven)

## 待讀(sub-agent per-dim 自行 read in scope)

- `packages/design-system/src/**/*.spec.md`(82 files;sub-agent per Group A-P 自讀)
- `packages/design-system/src/tokens/**/*.spec.md`
- `packages/design-system/src/patterns/**/*.spec.md`
- `packages/design-system/src/components/**/*.{tsx,stories.tsx}`

## 注意(本 session 已 land 變動)

Commit `3d4ecd2f`(本 turn 之前)已動:
- `time-picker.spec.md:209` `### a11y` → `## A11y 預設`(H2 promotion)
- `header-canonical.spec.md:23` `[--layout-space-tight]` → `[var(--layout-space-tight)]`(typo fix)
- `combobox.stories.tsx` 加 `@story-baseline` cite
- 4 SSOT file M-rule count 對齊(31)
- CLAUDE.md `# 自主執行 canonical` 2026-05-23 段(autonomous + triple-verify 永久)
- `sync-governance-counters.mjs` 升 全 SSOT drift detector
- `session_start_governance_check.sh` 加 Check 10(SSOT drift auto-detect)

## Coverage matrix(per audit-preflight.mjs)

| Artifact | Count |
|---|---|
| Component tsx | 81 |
| Showcase stories | 71 |
| Anatomy stories | 62 |
| Principles stories | 62 |
| Spec.md | 82 |
| **Total files** | **397** |

- M-rules: 31 / Traits: 11 / Hooks: 28 (note: total hooks count 37 含 lib/, 28 是 mainline)
- Audit dims: 56(全 cover,0 gaps)

## Phase A.1 dispatch ready

Batch 1: Dims 1-19(Groups A-G,heavy:12)
Batch 2: Dims 20-38(Groups G-N,heavy:24,25)
Batch 3: Dims 39-56(Groups N-P,heavy:40,41,42,43,45,49,50,51,52,53)
