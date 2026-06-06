# Memory Index

## User context
- [user_role.md](user_role.md) — Design-oriented frontend engineer with high standards for design correctness
- [project_goal.md](project_goal.md) — World-class DS where CLAUDE.md + specs ensure AI faithfully executes design principles

## Feedback (workflow / collaboration discipline)
- [feedback_codex_dual_track_synthesizer.md](feedback_codex_dual_track_synthesizer.md) — Codex collab 永遠 dual-track:Claude own + codex own + 比稿 synthesize
- [feedback_codex_collab_2026_05_23_directives.md](feedback_codex_collab_2026_05_23_directives.md) — Codex brief 三 invariant + 「trust 自己」真意=dual-track NOT skip + ASK gate 嚴格 + triple-verify(2026-05-23,合 3 file)
- [feedback_audit_discipline_full_sweep_deterministic_preflight.md](feedback_audit_discipline_full_sweep_deterministic_preflight.md) — 稽核三 invariant:NO-SAMPLE 全盤 / 必 chain deterministic script / Preflight scan(合 3 file)
- [feedback_solo_dev_workflow.md](feedback_solo_dev_workflow.md) — 1 chat = 1 working branch;Netlify preview = user gate;user 拍板才 push main(M28)
- [feedback_ship_then_revert_anti_pattern.md](feedback_ship_then_revert_anti_pattern.md) — SSOT-UI/UX edit 必先 propose verbatim approval,違 = hook BLOCKER(2026-05-15)
- [feedback_propose_discipline.md](feedback_propose_discipline.md) — 中文人話(禁 jargon,2026-05-31 擴大至**所有 reply**,user 看不懂英文)+ file:line cite(claim「規定/必配」沒 cite = 撤回)(2026-05-15 + 2026-05-27 + 2026-05-31,合 3 file)
- [feedback_codex_exec_transport_canonical.md](feedback_codex_exec_transport_canonical.md) — 地端 transport `node_modules/.bin/codex` 3-test + visual audit `--dangerously-bypass-approvals-and-sandbox`(user authorize)+ 大 brief 死局 → 拆 N focused brief + low reasoning(2026-05-29 合 2 file)
- [feedback_push_always_call.md](feedback_push_always_call.md) — 每 substantive turn 結尾必 call PushNotification,不自我 suppress(2026-05-17)
- [feedback_ds_css_aggregator_full_sweep_2026_05_27.md](feedback_ds_css_aggregator_full_sweep_2026_05_27.md) — DS src/**/*.css 必在 tokens.css aggregator 或被 tsx import — 否則 consumer 拿不到(2026-05-27,hook `check_orphan_ds_css.sh`)
- [feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md](feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md) — SSOT canonical = 必 P0 BLOCKER 機械強制 with per-line escape comment;禁 P1 WARN soft signal(2026-05-27)
- [feedback_ai_ground_truth_unreliable_mechanical_primary.md](feedback_ai_ground_truth_unreliable_mechanical_primary.md) — AI self-audit unreliable;mechanical(pixel/DOM/tsc/playwright)= primary defense / AI judgement = supplementary only / new audit layer ALWAYS expand never replace(2026-05-27 + composition fidelity application,合 2 file)
- [feedback_consume_existing_classification_ssot.md](feedback_consume_existing_classification_ssot.md) — 分類/治理先消費既有 category-matrix.json 5-category SSOT,禁發明新框架疊上去(朝三暮四根因;對抗 workflow 抓出重造)+ anatomy pattern(item/header)對稱公開(2026-06-06)
- [feedback_read_component_spec_before_use.md](feedback_read_component_spec_before_use.md) — 用任何 DS component 前先讀其 spec variant/size/emphasis 按原則選,不靠 cva 預設(Button 預設=primary)、不靠截圖事後補抓;chrome header icon=variant text 非 tertiary(2026-06-06)
- [feedback_deploy_url_auto_detect_2026_05_27.md](feedback_deploy_url_auto_detect_2026_05_27.md) — Deploy URL auto-detection 3-strategy + per-user override + curl content sniff(2026-05-27 hook v4 ship)
- [feedback_netlify_basic_password_canonical_2026_05_29.md](feedback_netlify_basic_password_canonical_2026_05_29.md) — Netlify 免費密碼 = Edge Function Basic Auth(STORYBOOK_BASIC_AUTH;Dashboard + _headers 都 Pro $20/mo;Identity 未 deprecated 但不適合 simple gate)+ Claude Code 直連 sandbox 是雲端主路徑 + clone-on-demand(2026-05-29 / 2026-06-05 二修)

## Feedback (DS canonical / 視覺判斷)
- [feedback_nearest_same_purpose_canonical.md](feedback_nearest_same_purpose_canonical.md) — 寫 stories wrap primitive 前必抄 production baseline(M35→M23(d);registry R8 + grep-baseline R7 + AppShell drift 錨例;2026-06-02 fold story_baseline_reference 同事件進來)

## Reference
- [reference_deploy_targets.md](reference_deploy_targets.md) — Storybook GitHub Pages + Netlify per-branch preview + main = production

---
**Prune history**:
- **2026-05-15 D3 retire 4 entries**(已被上游吸收)
- **2026-05-27 D1+D2 prune 8 entries**(Rule-of-3 absorb + stale)
- **2026-05-28 D3 consolidate 4 → 2 entries**(per M33 anti-defer,session-end cleanup):
  - Cluster A:`feedback_propose_in_plain_chinese` + `feedback_propose_without_cite_fabrication_2026_05_27` → 合 `feedback_propose_discipline.md`(propose 2 規則)
  - Cluster B:`feedback_ai_self_audit_unreliable_mechanical_primary_2026_05_27` + `feedback_composition_fidelity_pixel_vs_structural_2026_05_27` → 合 `feedback_ai_ground_truth_unreliable_mechanical_primary.md`(AI ground-truth canonical + composition fidelity specific application)
  - Archive: `.claude/memory/retired/2026-05-28-consolidate/`
  - Net delta:20 → 18 entries(-2,軟 cap 18 達標)
- **2026-05-29 D3 consolidate 2 → 1 entry**(per M33 anti-defer):
  - Cluster:`feedback_codex_local_transport_node_modules` + `feedback_codex_visual_audit_dangerously_bypass` → 合 `feedback_codex_exec_transport_canonical.md`(transport + bypass + 大 brief 死局 3 rules under one Codex exec canonical)
  - Archive: `.claude/memory/retired/2026-05-29-codex-transport-consolidate/`
  - Net delta:20 → 19 entries(-1,hard cap 20 達標)
- **2026-05-29 D4 fold(auto-chained from /deep-audit-cross-codex Phase 4.5)**:
  - `feedback_m31_phaseA_first_and_autonomy_no_ask`(M31 Phase-A-first + auto-mode-no-ASK)→ fold into `feedback_codex_collab_2026_05_23_directives.md` Sub-rule 3C(Phase-A-first)+ 3D(auto-mode ASK gate)。原 #2 已涵蓋 ASK gate + dual-track-NOT-skip,#4 大半 duplicate;唯一新增 Phase-A-first explicit「script ≠ Phase A」+ mechanical backstop ref folded in。stop_self_audit.sh ref 更新 #4 → #2。#2 trim 冗段 96 行 under cap。
  - Archive: `.claude/memory/retired/2026-05-29-m31-phase-consolidate/`
  - Net delta:20 → 19 entries(-1)
- **2026-06-02 D1/D3 prune(quality-first,user verbatim「以確保+提升產出品質為目標」)**:
  - Memory fold:`feedback_story_baseline_reference` → `feedback_nearest_same_purpose_canonical`(同事件同原則 originSessionId a689a78e;R7+R8 兩 hook 全保留,R7 grep 機制 + 4 缺陷 + 錨例併入保留檔)
  - 同輪清 deep-audit skill 家族 Rule-of-3 重複(propose gate / format / 禁用詞 / 7 軸 → 全改 pointer 指主檔)+ 修死檔名 ref(`feedback_propose_in_plain_chinese` 殘留 3 處)+ count drift(brief-template 82→83 / 20→19)+ 抄錯的檔案上限「500」,皆表達層對齊、零保護損失
  - codify「品質優先」為 knowledge-prune SKILL.md 每次必遵核心前提(mindset #6 tell-me-once)
  - Archive: `.claude/memory/retired/2026-06-02-prune/`
  - Net delta:19 → 18 entries(-1,soft cap 18 達標)
- [Storybook addon preset MUST be .cjs](feedback_storybook_addon_preset_must_be_cjs.md) — beta.27-.31 5 連敗 root cause: 強制 CJS evaluation,bypass Node ESM/esbuild-register CJS-interop 衝突(2026-05-28)
