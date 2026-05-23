# Memory Index

## User context
- [user_role.md](user_role.md) — Design-oriented frontend engineer with high standards for design correctness
- [project_goal.md](project_goal.md) — World-class DS where CLAUDE.md + specs ensure AI faithfully executes design principles

## Feedback (workflow / collaboration discipline)
- [feedback_codex_dual_track_synthesizer.md](feedback_codex_dual_track_synthesizer.md) — Codex collab 永遠 dual-track:Claude own + codex own + 比稿 synthesize
- [feedback_solo_dev_workflow.md](feedback_solo_dev_workflow.md) — 1 chat = 1 working branch;Netlify preview = user gate;user 拍板才 push main(M28)
- [feedback_ship_then_revert_anti_pattern.md](feedback_ship_then_revert_anti_pattern.md) — SSOT-UI/UX edit 必先 propose verbatim approval,違 = hook BLOCKER(2026-05-15)
- [feedback_propose_in_plain_chinese.md](feedback_propose_in_plain_chinese.md) — 要 user 決策必用中文人話(發生什麼/影響/選項 outcome),禁 jargon,hook 機械強制(2026-05-15)
- [feedback_audit_full_sweep_not_sample.md](feedback_audit_full_sweep_not_sample.md) — `/design-system-audit --deep` sub-agent 必 DS-wide 全盤,禁「sample top N」當理由縮 scope(2026-05-15)
- [feedback_codex_local_transport_node_modules.md](feedback_codex_local_transport_node_modules.md) — 地端 codex 走 `node_modules/.bin/codex`(npm dep),不是全域 PATH;3-test discovery 順序固定(2026-05-17)
- [feedback_push_always_call.md](feedback_push_always_call.md) — 每 substantive turn 結尾必 call PushNotification,不自我 suppress(harness 自決),user verbatim「先強制推」(2026-05-17)
- [feedback_audit_preflight_全盤查.md](feedback_audit_preflight_全盤查.md) — `/design-system-audit --deep` Phase 1 前必跑 Phase 0.5 Preflight(全 DS file enum + 全原則 enum + coverage matrix)。`scripts/audit-preflight.mjs` SSOT
- [feedback_autonomous_default_triple_verify_2026_05_23.md](feedback_autonomous_default_triple_verify_2026_05_23.md) — ASK gate 只收斂 SSOT-UI/UX 增刪改;其他 autonomous 7 軸;所有 finding/codex 問題 triple-verify before bothering user;SSOT auto-sync 機械強制(2026-05-23 user 永久 directive)
- [feedback_audit_deterministic_script_not_subagent.md](feedback_audit_deterministic_script_not_subagent.md) — Dim 40/41/42 content-quality 必 chain audit-story-quality.mjs deterministic 全掃,禁 sub-agent 抽樣(2026-05-23 anchor:user 抓「你又再抽樣?」)
- [feedback_codex_collab_real_intent.md](feedback_codex_collab_real_intent.md) — 「trust 自己 / 不需要 codex 比稿」真意 = M31 adversarial dual-track + triple-verify,**禁** 解讀 skip Phase B(2026-05-23 anchor:user 怒糾「你搞錯我意思,你是低能兒嗎?」)
- [feedback_codex_brief_invariants_2026_05_23.md](feedback_codex_brief_invariants_2026_05_23.md) — Codex brief 必含三 invariant(全盤閱讀 / triple-verify / 禁抽樣);ASK gate 嚴格收斂 SSOT-UI/UX 增刪改唯一條件,其他 autonomous 7-axis(2026-05-23 user 永久 directive)

## Feedback (DS canonical / 視覺判斷)
> **2026-05-15 prune D3 retired 4 entries**(已完全被上游吸收,SSOT pointer):
> - `feedback_spec_impl_sort_parallel_fix_reproduce` → M10/M12/M23/M29 + hooks `check_spec_impl_default_alignment.sh` / `check_data_table_sort_parallel.sh`
> - `feedback_datatable_f3_row_drag_v1_limits` → `data-table.spec.md` 「L4 Row drag」段
> - `feedback_overlay_primitive_consumption` → `patterns/overlay-surface/overlay-surface.spec.md` 「Consumer rule」+ hook `check_overlay_handcraft.sh`
> - `feedback_overlay_chrome_token_semantic` → `semantic.css` token 註解 + DropdownMenuContent line 244 既有 canonical 先例

## Project (active state)
- [project_hover_overlay_decisions_2026_05_09.md](project_hover_overlay_decisions_2026_05_09.md) — Hover overlay Q1-Q7 已決 + cell picker D-path 已完成 + 路 B 拍板 spreadsheet target;Q3.6 send codex Q-A/Q-B/Q-C 比稿中
- [codex_collab_backfill_2026-05-19.md](codex_collab_backfill_2026-05-19.md) — 14 條 codex reply 7-column audit table(3 DONE / 4 DEEP-VERIFY-PENDING / 7 TRIAGE-PENDING),Q3.1 last-verdict gate SSOT
- [feedback_story_baseline_reference.md](feedback_story_baseline_reference.md) — 寫 stories wrap primitive 必 reference 既有完整佈局 baseline(per 2026-05-20 AppShell-vs-Sidebar drift)
- [feedback_nearest_same_purpose_canonical.md](feedback_nearest_same_purpose_canonical.md) — M35 nearest same-purpose canonical wins(registry-driven + hook R8 + SKILL Phase 0.0)

## Reference
- [reference_deploy_targets.md](reference_deploy_targets.md) — Storybook GitHub Pages + Netlify per-branch preview + main = production
