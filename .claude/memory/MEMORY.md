# Memory Index

## User context
- [user_role.md](user_role.md) — Design-oriented frontend engineer with high standards for design correctness
- [project_goal.md](project_goal.md) — World-class DS where CLAUDE.md + specs ensure AI faithfully executes design principles

## Feedback (workflow / collaboration discipline)
- [feedback_codex_dual_track_synthesizer.md](feedback_codex_dual_track_synthesizer.md) — Codex dual-track + ASK gate 嚴格 + triple-verify + brief 三 invariant + Phase-A-first + auto-mode 禁問(2026-06-11 合併 05-23 directives)
- [feedback_audit_discipline_full_sweep_deterministic_preflight.md](feedback_audit_discipline_full_sweep_deterministic_preflight.md) — 稽核三 invariant:NO-SAMPLE 全盤 / 必 chain deterministic script / Preflight scan(合 3 file)
- [feedback_solo_dev_workflow.md](feedback_solo_dev_workflow.md) — 1 chat = 1 working branch;Netlify preview = user gate;user 拍板才 push main(M28)
- [feedback_ship_then_revert_anti_pattern.md](feedback_ship_then_revert_anti_pattern.md) — SSOT-UI/UX edit 必先 propose verbatim approval,違 = hook BLOCKER(2026-05-15)
- [feedback_propose_discipline.md](feedback_propose_discipline.md) — 中文人話(禁 jargon,2026-05-31 擴大至**所有 reply**,user 看不懂英文)+ file:line cite(claim「規定/必配」沒 cite = 撤回)(2026-05-15 + 2026-05-27 + 2026-05-31,合 3 file)
- [feedback_codex_exec_transport_canonical.md](feedback_codex_exec_transport_canonical.md) — 地端 transport `node_modules/.bin/codex` 3-test + visual audit `--dangerously-bypass-approvals-and-sandbox`(user authorize)+ 大 brief 死局 → 拆 N focused brief + low reasoning(2026-05-29 合 2 file)
- [feedback_push_always_call.md](feedback_push_always_call.md) — 每 substantive turn 結尾必 call PushNotification,不自我 suppress(2026-05-17)
- [Storybook addon preset MUST be .cjs](feedback_storybook_addon_preset_must_be_cjs.md) — beta.27-.31 5 連敗 root cause: 強制 CJS evaluation,bypass Node ESM/esbuild-register CJS-interop 衝突(2026-05-28)
- [feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md](feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md) — SSOT canonical = 必 P0 BLOCKER 機械強制 with per-line escape comment;禁 P1 WARN soft signal(2026-05-27)
- [feedback_ai_ground_truth_unreliable_mechanical_primary.md](feedback_ai_ground_truth_unreliable_mechanical_primary.md) — AI self-audit unreliable;mechanical(pixel/DOM/tsc/playwright)= primary defense / AI judgement = supplementary only / new audit layer ALWAYS expand never replace(2026-05-27 + composition fidelity application,合 2 file)
- [feedback_consume_existing_classification_ssot.md](feedback_consume_existing_classification_ssot.md) — 消費既有不憑直覺:(a)分類用既有 category-matrix.json 5-category SSOT 禁發明新框架(朝三暮四根因;對抗 workflow 抓出重造)+ anatomy pattern(item/header)對稱公開;(b)用元件前先讀其 spec variant/size/emphasis 按原則選不吃 cva 預設(Button CTA 必 explicit primary;chrome header icon=text)(2026-06-06 合 2 file)
- [feedback_netlify_basic_password_canonical_2026_05_29.md](feedback_netlify_basic_password_canonical_2026_05_29.md) — Netlify 免費密碼 = Edge Function Basic Auth(STORYBOOK_BASIC_AUTH;Dashboard + _headers 都 Pro $20/mo;Identity 未 deprecated 但不適合 simple gate)+ Claude Code 直連 sandbox 是雲端主路徑 + clone-on-demand(2026-05-29 / 2026-06-05 二修)

## Feedback (DS canonical / 視覺判斷)
- [feedback_nearest_same_purpose_canonical.md](feedback_nearest_same_purpose_canonical.md) — 寫 stories wrap primitive 前必抄 production baseline(M35→M23(d);registry R8 + grep-baseline R7 + AppShell drift 錨例;2026-06-02 fold story_baseline_reference 同事件進來)

## Reference
- [reference_deploy_targets.md](reference_deploy_targets.md) — Deploy targets + URL 3-strategy 自動推導 + per-user override + transport self-awareness(2026-06-11 合併 deploy_url_auto_detect)

---
**Prune history**(細節在 .claude/memory/retired/ + git log):
- 2026-05-15 D3 retire 4(上游吸收)/ 2026-05-27 D1+D2 prune 8 / 2026-05-28 D3 4→2(20→18)
- 2026-05-29 codex-transport 2→1 + M31 Phase fold(20→19)
- 2026-06-02 quality-first prune:story_baseline fold + deep-audit 家族 Rule-of-3 清(19→18)
- 2026-06-11 D8 headroom:codex directives→dual_track / deploy_url→deploy_targets 合併 + css-aggregator retire(教訓入 CLAUDE.md 失敗記憶索引;19→16;修 stale ×3)
