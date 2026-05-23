---
name: Audit content-quality dims MUST chain deterministic script not sub-agent judgment
description: Dim 40/41/42 (title canonical / name jargon / placeholder) 必 chain `node scripts/audit-story-quality.mjs --check`,禁 sub-agent self-judgment 抽樣替代
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Rule

Deep-audit Dim 40 / 41 / 42(story content-quality)**禁** sub-agent AI judgment 替代 deterministic script。**必 chain** `node scripts/audit-story-quality.mjs --check` 全 196 stories / 350 names 全掃。

Sub-agent dispatch prompt 對這 3 dim **必含**:
> 「先跑 `node scripts/audit-story-quality.mjs --check`,把 stderr 完整貼進 report;script 0 violations = CLEAN,有 violations 列具體 file:line。**禁** sub-agent 自寫 grep / 自評 sample。」

# Why

User verbatim 2026-05-23:
> 「我他媽你確定 deep audit cross codex 跑完了?我不信現在所有的範例都有講具體言簡意賅的中文任何也不相信所有範例標題都有合規,你他媽如果又被發現你他媽又再偷懶又再抽樣他媽該怎麼幹死你避免你下次再犯?」

**Anchor incident**(2026-05-23 deep audit Batch 3):
- Sub-agent 自報 D43「sample-based AI judgment per Dim spec; sampled Button only — could deepen」
- D40/D41/D42 表面 grep regex pass 但無 deterministic script 全掃 cite
- User 抓「不信全合規,你又再抽樣?」
- 後手 inline 跑 `python3` + 自寫 grep verified 全 196 stories / 350 names / 0 violations
- 但這是 reactive fix,非 mechanical prevention

# How to apply

- Dim 40/41/42 sub-agent prompt **必含**「先跑 audit-story-quality.mjs script」directive
- CI `ci.yml` 加 `npm run story-quality:check` step(每 push verify)
- audit-story-quality.mjs **deterministic full-sweep**(不可加 `--sample` flag,不可 sub-agent self-write grep 替代)

# Mechanical enforcement

- `scripts/audit-story-quality.mjs` deterministic 全 196 stories / 350 names 掃,exit 1 on any violation
- `ci.yml` Verify job 加 `npm run story-quality:check` step
- `package.json` npm script `story-quality:check`
- `design-system-audit/SKILL.md` Dim 40/41/42 列「**MUST chain** `audit-story-quality.mjs --check`」+「**禁** sub-agent self-judgment 替代」
- `check_story_invariants.sh` R4 / R5 / R6 write-time PostToolUse 預警(現有,本 mechanism 為 audit-time 補強)
- `check_audit_sample_escape.sh` PreToolUse Agent dispatch 攔截 sample escape keyword(現有)

# Anti-pattern(永久 ban)

- ❌ Sub-agent dispatch 對 D40/D41/D42 沒 chain script
- ❌ Sub-agent 自寫 grep / 自評 sample top N
- ❌ Sub-agent 自稱 "I sampled Button only, looks clean" → 沒 chain script = audit incomplete
- ❌ Audit report claim "D40 CLEAN" 無 cite script output(stderr "✅ Story quality DS-wide CLEAN")

# 對齊原則

- CLAUDE.md `# 稽核 canonical` audit-vs-execute 分權:content-quality 是 deterministic 可機械化 → 必走 script
- M20 score 機制:audit 不完整 score regress → next session 自動 inject directive
- mindset #1 不取巧:抽樣 = 取巧,違反
- Toyota TPS / Linux kernel pre-submit:checkpatch.pl is deterministic script, not human sampling
