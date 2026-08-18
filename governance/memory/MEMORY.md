# Memory Index

## User context
- [user_role.md](user_role.md) — Design-oriented frontend engineer with high standards for design correctness
- [project_goal.md](project_goal.md) — World-class DS where AGENTS.md + specs ensure AI faithfully executes design principles

## Project (active work)
- [project_agent_ui_draft_model.md](project_agent_ui_draft_model.md) — AI agent 面板規格已定稿歸檔 BACKLOG(2026-08-11);SSOT 路徑在本檔內(planning 歸檔 §〇);實作前禁寫入 DS canonical
- [project_provider_neutral_governance.md](project_provider_neutral_governance.md) — PNG 現行索引 + five-step machine SSOT；舊 baton/P0/activation/certification/fleet/soak 只作歷史 provenance；current state 必由 exact-head deep-audit evidence與 `npm run release:status` 讀回

## Feedback (workflow / collaboration discipline)
- [feedback_audit_discipline_full_sweep_deterministic_preflight.md](feedback_audit_discipline_full_sweep_deterministic_preflight.md) — 稽核三 invariant:NO-SAMPLE 全盤 / 必 chain deterministic script / Preflight scan(合 3 file)
- [feedback_solo_dev_workflow.md](feedback_solo_dev_workflow.md) — 1 task = 1 branch + 1 PR；protected main/required checks/conversations + canonical five-step readback；依 Standing Authorization 自動 merge/release(M28)，preview/canary 非 blocking
- [feedback_ship_then_revert_anti_pattern.md](feedback_ship_then_revert_anti_pattern.md) — 產品／UI／UX SSOT 真取捨需 exact target-bound decision；工程 remediation AUTO；unknown fail closed(2026-05-15／2026-07-26)
- [feedback_propose_discipline.md](feedback_propose_discipline.md) — 中文人話(禁 jargon,2026-05-31 擴大至**所有 reply**,user 看不懂英文)+ file:line cite(claim「規定/必配」沒 cite = 撤回)(2026-05-15 + 2026-05-27 + 2026-05-31,合 3 file)
- [feedback_codex_full_access_standing_auth.md](feedback_codex_full_access_standing_auth.md) — Codex collab canonical(2026-08-12 三檔合併):常設授權全存取沙箱(user 2026-08-08)+ 地端 transport 4-test/守衛入口/最強禁降檔/小 focused brief + M31 dual-track 三層禁 pass-through/brief 三 invariant/Phase-A-first/auto-mode 禁問
- [feedback_push_always_call.md](feedback_push_always_call.md) — registered runtime 有 PushNotification capability 時 substantive turn 結尾必 call；能力缺席 = nonblocking/unobserved(2026-08-02 provider-neutral 收斂)
- [Storybook addon preset MUST be .cjs](feedback_storybook_addon_preset_must_be_cjs.md) — beta.27-.31 5 連敗 root cause: 強制 CJS evaluation,bypass Node ESM/esbuild-register CJS-interop 衝突(2026-05-28)
- [feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md](feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md) — SSOT canonical = 必 P0 BLOCKER 機械強制 with per-line escape comment;禁 P1 WARN soft signal(2026-05-27)
- [feedback_ai_ground_truth_unreliable_mechanical_primary.md](feedback_ai_ground_truth_unreliable_mechanical_primary.md) — AI self-audit unreliable;mechanical(pixel/DOM/tsc/playwright)= primary defense / AI judgement = supplementary only / new audit layer ALWAYS expand never replace(2026-05-27 + composition fidelity application,合 2 file)
- [feedback_consume_existing_classification_ssot.md](feedback_consume_existing_classification_ssot.md) — 消費既有不憑直覺:(a)分類用既有 category-matrix.json 5-category SSOT 禁發明新框架(朝三暮四根因;對抗 workflow 抓出重造)+ anatomy pattern(item/header)對稱公開;(b)用元件前先讀其 spec variant/size/emphasis 按原則選不吃 cva 預設(Button CTA 必 explicit primary;chrome header icon=text);(c)**先找既有機制再發明、先實測再把動作丟回 user**(2026-07-31 錨例:解 push 死結的腳本上個 session 已寫好卻從零重推;sandbox 讀取是 deny-only 卻誤判成 allow-only)

- [feedback_anti_self_lock_release_transport.md](feedback_anti_self_lock_release_transport.md) — 被擋先查對照表(gh/npm/TLS/journal/分類器 → 已建成的解),禁重發明禁問 user;immutable 版號不可重用;供應鏈閘是真警報(2026-08-11)

## Reference
- [reference_deploy_targets.md](reference_deploy_targets.md) — Deploy targets + URL 3-strategy 自動推導 + per-user override + transport self-awareness + Netlify 免費密碼 = Edge Function Basic Auth(STORYBOOK_BASIC_AUTH)+ Claude Code 直連 sandbox 雲端主路徑 + clone-on-demand(2026-06-11 合併 deploy_url_auto_detect;2026-07-07 合併 netlify_basic_password)
- [reference_cloud_governance_loading.md](reference_cloud_governance_loading.md) — 雲端 sandbox 治理載入實證:committed .claude 全 4 hook event 會 fire / plugin 不可靠(#63028/#62174)/ --cloud 需 TTY / skills 不認 node_modules(2026-06-16)+ C-prime fork 治理 shipped beta.70；歷史單一 Claude cloud target/snapshot 曾親證 proactive 指引與機械強制生效，不構成目前或所有 cloud certification(2026-07-14 合併 project_cprime)

---
**Prune history**(細節在 governance/archive/memory-retired/ + git log):
- 2026-05-15 → 2026-06-11 六輪 prune/consolidate(D1/D2/D3 上游吸收 + codex-transport + M31 Phase fold + story_baseline fold + deploy_url/css-aggregator 合併;原文在 governance/archive/memory-retired/ 2026-05-27 ~ 2026-06-11 各目錄)
- 2026-07-07 D8 headroom:netlify_basic_password→deploy_targets 合併(同部署域 D1 consolidation,invariant 零損;19→18)
- 2026-07-14 D8 headroom:project_cprime_governance_shipped→reference_cloud_governance_loading 合併(campaign 已完結 + 同雲端治理域 + 同 originSession D1 consolidation,invariant 零損;19→18)
- 2026-07-23 provider-neutral consolidation:退役 fixed Claude/Codex layer mapping 與 Codex exec transport；歷史原文移至 `governance/archive/memory-retired/2026-07-23-provider-neutral-consolidate/`，現行 authority 只保留 registry/binding/certification contracts
- 2026-07-31 續作保障:新增 planning baton；2026-08-01 deep-audit 收為 `reference / non-executable`，live state 回歸 machine evidence；**未新增 index 條目**
- 2026-08-12 superset 收斂:home-only dual_track+exec_transport → full_access 三檔合併(codex 域 D1,invariant 零損;home-only 來源,無 repo 原文可歸檔);promote agent_ui backlog 指標入 repo;index 20 = hard cap
- 2026-08-18 D8 prune:nearest_same_purpose 完全吸收退役(M23(d) + story-rules + story-writing SKILL + story-baseline-registry 全覆蓋)/ governance_evolution_roadmap 純 pointer 退役(planning registry 已是 status SSOT)/ wm_ds_alignment_campaign 收官歸檔(live 操作檔案併入 project_provider_neutral_governance);20→17
