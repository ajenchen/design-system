# Memory Index

## User context
- [user_role.md](user_role.md) — Design-oriented frontend engineer with high standards for design correctness
- [project_goal.md](project_goal.md) — World-class DS where AGENTS.md + specs ensure AI faithfully executes design principles

## Project (active work)
- [project_agent_ui_draft_model.md](project_agent_ui_draft_model.md) — AI agent 面板規格已落地(2026-09-07 起實作;唯一權威 = planning `2026-09-06-agent-principles-v14.md`,2026-08-11 規格與隔離令只剩歷史);後續改動走 spec / v14 propose 流程,禁把 v14 已答題重列為未決
- [project_provider_neutral_governance.md](project_provider_neutral_governance.md) — PNG 現行索引 + five-step machine SSOT + **WM 身分(每 session 必知)與 canary 操作檔案**；舊 baton/P0/activation/certification/fleet/soak 只作歷史 provenance；current state 必由 exact-head deep-audit evidence與 `npm run release:status` 讀回
- active plan:`governance/planning/2026-09-25-interaction-and-hover-remediation.md`(registry 唯一 `status: active` 的計畫;user 要求每個未解問題追到結案。結案時拿掉本行,`validate-memory-contract.mjs` 會擋指向非 active 計畫的指標)

## Feedback (workflow / collaboration discipline)
- [feedback_audit_discipline_full_sweep_deterministic_preflight.md](feedback_audit_discipline_full_sweep_deterministic_preflight.md) — 稽核三 invariant:NO-SAMPLE 全盤 / 必 chain deterministic script / Preflight scan(合 3 file)
- [feedback_solo_dev_workflow.md](feedback_solo_dev_workflow.md) — 1 chat = 1 branch + 1 PR；protected main/required checks/conversations + canonical five-step readback；合併前需 user 說「發版」的 receipt,綁**user 看過的預覽內容**(不綁 commit 也不綁分支),其餘依 Standing Authorization 自動(M28)，preview/canary 非 blocking
- [feedback_ship_then_revert_anti_pattern.md](feedback_ship_then_revert_anti_pattern.md) — 產品／UI／UX SSOT 真取捨需 exact target-bound decision；工程 remediation AUTO；unknown fail closed(2026-05-15／2026-07-26)
- [feedback_propose_discipline.md](feedback_propose_discipline.md) — 中文人話(禁 jargon,2026-05-31 擴大至**所有 reply**,user 看不懂英文)+ file:line cite(claim「規定/必配」沒 cite = 撤回)(2026-05-15 + 2026-05-27 + 2026-05-31,合 3 file)+ 引原話先比原題、引規格行先讀它所在的段落(Sub-rule 8:規格引文也適用,子代理摘要的規格引文不得直接轉述;子代理的待決題轉成問 user 前先 grep DS 既有立場,立場外不問;範圍取字面最窄,原話只在擋 / 撤回 / 擴大工作時查一行,規格行另含拿它建議時)+ token 只花在 user 要的任務上(Sub-rule 9:沒證明是問題不開新戰場、決議過的不翻冷飯、程式跟規格對不上照修)
- [feedback_codex_full_access_standing_auth.md](feedback_codex_full_access_standing_auth.md) — Codex collab canonical(2026-08-12 三檔合併):常設授權全存取沙箱(user 2026-08-08)+ 地端 transport 4-test/守衛入口/最強禁降檔/小 focused brief + M31 dual-track 三層禁 pass-through/brief 三 invariant/Phase-A-first/auto-mode 禁問
- [feedback_push_always_call.md](feedback_push_always_call.md) — registered runtime 有 PushNotification capability 時 substantive turn 結尾必 call；能力缺席 = nonblocking/unobserved(2026-08-02 provider-neutral 收斂)
- [Storybook addon preset MUST be .cjs](feedback_storybook_addon_preset_must_be_cjs.md) — beta.27-.31 5 連敗 root cause: 強制 CJS evaluation,bypass Node ESM/esbuild-register CJS-interop 衝突(2026-05-28)
- [feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md](feedback_ssot_mechanical_p0_not_p1_warn_2026_05_27.md) — SSOT canonical = 必 P0 BLOCKER 機械強制 with per-line escape comment;禁 P1 WARN soft signal(2026-05-27)
- [feedback_ai_ground_truth_unreliable_mechanical_primary.md](feedback_ai_ground_truth_unreliable_mechanical_primary.md) — AI self-audit unreliable;mechanical(pixel/DOM/tsc/playwright)= primary defense / AI judgement = supplementary only / new audit layer ALWAYS expand never replace(2026-05-27 + composition fidelity application,合 2 file)
- [feedback_consume_existing_classification_ssot.md](feedback_consume_existing_classification_ssot.md) — 消費既有不憑直覺:(a)分類用既有 category-matrix.json 5-category SSOT 禁發明新框架(朝三暮四根因;對抗 workflow 抓出重造)+ anatomy pattern(item/header)對稱公開;(b)用元件前先讀其 spec variant/size/emphasis 按原則選不吃 cva 預設(Button CTA 必 explicit primary;chrome header icon=text);(c)**先找既有機制再發明、先實測再把動作丟回 user**(2026-07-31 錨例:解 push 死結的腳本上個 session 已寫好卻從零重推;sandbox 讀取是 deny-only 卻誤判成 allow-only)
- [feedback_orchestration_verify_before_scale.md](feedback_orchestration_verify_before_scale.md) — 多代理 / 長流程編排紀律(2026-11-18 對抗稽核):先小樣本兩面實跑再放大、量不到 = 儀器失效、交接資料不截斷、併行上限、修補不收斂就停下找根因、zsh 陷阱、被擋三選一、對 user 的數字從 log 擷取(流程步驟照 `rules/work-process.md`,數值不寫在記憶)

## Reference
- [reference_deploy_targets.md](reference_deploy_targets.md) — Deploy targets + URL 3-strategy 自動推導 + per-user override + transport self-awareness + Netlify 免費密碼 = Edge Function Basic Auth(STORYBOOK_BASIC_AUTH)+ Claude Code 直連 sandbox 雲端主路徑 + clone-on-demand(2026-06-11 合併 deploy_url_auto_detect;2026-07-07 合併 netlify_basic_password)+ **/tmp scratch 3 天沒存取即被清:驗證過的批次當天就要 push**(2026-10-06 五天停工全失)
- [reference_cloud_governance_loading.md](reference_cloud_governance_loading.md) — 雲端 sandbox 治理載入實證:committed .claude 全 4 hook event 會 fire / plugin 不可靠(#63028/#62174)/ --cloud 需 TTY / skills 不認 node_modules(2026-06-16)+ C-prime fork 治理 shipped beta.70；歷史單一 Claude cloud target/snapshot 曾親證 proactive 指引與機械強制生效，不構成目前或所有 cloud certification(2026-07-14 合併 project_cprime)
- [reference_perf_validation_same_host.md](reference_perf_validation_same_host.md) — 效能驗收必同網域:user 慢機器把 *.netlify.app 送進遠端隔離 thin client(LoAF 歸因 `thin-client-min.js`),github.io 本地渲染;程式碼無退步;先歸因再消融(2026-09-15)
- [reference_auto_mode_sandbox_boundaries.md](reference_auto_mode_sandbox_boundaries.md) — **被擋時先查這裡**:沙箱 / 封閉環境 / 分類器實測邊界(主目錄 .claude 鎖 → clone;封閉 npm 不透傳代理 → 端到端只靠 CI;分類器擋下 = 停下記入完成報告,不換指令繞過、不交給 user)+ 發版與工具傳輸「症狀 → 已建成的解」對照表(gh/npm/TLS/journal/Chrome MCP/mktemp);immutable 版號不可重用;供應鏈閘是真警報(2026-08-11 → 2026-10-07)

---
**Prune history** → `governance/memory/README.md`「Prune history」(2026-11-17 從本檔搬出;本檔每個 session 都載入,只留索引)。
