# Provider-neutral memory SSOT

## 用途

本資料夾 `governance/memory/` 是唯一可審查、可攜、跨 provider 的 memory SSOT。Claude 的
`~/.claude/projects/<cwd-hash>/memory/` 只是可刪除重建的 discovery cache，不是 authority。

## 單向 materialize(避免 split-brain)

先在本目錄修改並經 Git review，再執行 `npm run sync-memory` 將內容單向刷新到 Claude home。
`node scripts/sync-memory.mjs --check` 是 read-only drift probe；`--reverse` 會 fail closed。
`node scripts/validate-memory-contract.mjs` 會驗 index 與 top-level Markdown exact inventory、20-entry/
100-line 上限、active planning pointer、regular-file/no-symlink 與高可信 secret 形狀；任何 orphan、漏檔或重複連結都失敗。

## 注意

- Memory 內容若含 secrets / 個人敏感資料,**不該** commit 到 repo(尤其 public repo)
- 若未來新增 memory file 且包含 secret,加 `.gitignore` 排除 + 改用 reference pointer

## Prune history

> 2026-11-17 knowledge-prune 從 `MEMORY.md` 檔尾逐字搬來(那份檔每個 session 都載入,這段 1,980 字是歷次整理經過、不是索引)。

**Prune history**(細節在 governance/archive/memory-retired/ + git log):
- 2026-05-15 → 2026-06-11 六輪 prune/consolidate(D1/D2/D3 上游吸收 + codex-transport + M31 Phase fold + story_baseline fold + deploy_url/css-aggregator 合併;2026-05-27 起各輪原文在 governance/archive/memory-retired/ 對應目錄;2026-05-15 該輪為上游吸收無 archive 目錄,詳 git log)
- 2026-07-07 D8 headroom:netlify_basic_password→deploy_targets 合併(同部署域 D1 consolidation,invariant 零損;19→18)
- 2026-07-14 D8 headroom:project_cprime_governance_shipped→reference_cloud_governance_loading 合併(campaign 已完結 + 同雲端治理域 + 同 originSession D1 consolidation,invariant 零損;19→18)
- 2026-07-23 provider-neutral consolidation:退役 fixed Claude/Codex layer mapping 與 Codex exec transport；歷史原文移至 `governance/archive/memory-retired/2026-07-23-provider-neutral-consolidate/`，現行 authority 只保留 registry/binding/certification contracts
- 2026-07-31 續作保障:新增 planning baton；2026-08-01 deep-audit 收為 `reference / non-executable`，live state 回歸 machine evidence；**未新增 index 條目**
- 2026-08-12 superset 收斂:home-only dual_track+exec_transport → full_access 三檔合併(codex 域 D1,invariant 零損;home-only 來源,無 repo 原文可歸檔);promote agent_ui backlog 指標入 repo;index 20 = hard cap
- 2026-08-18 D8 prune:nearest_same_purpose 完全吸收退役(M23(d) + story-rules + story-writing SKILL + story-baseline-registry 全覆蓋)/ governance_evolution_roadmap 純 pointer 退役(planning registry 已是 status SSOT)/ wm_ds_alignment_campaign 收官歸檔(live 操作檔案併入 project_provider_neutral_governance);20→17
- 2026-10-07 D1+D4 consolidation:feedback_anti_self_lock_release_transport → reference_auto_mode_sandbox_boundaries 第六節(兩份都自稱「被擋先查這裡」且互相矛盾:分類器擋下要不要換指令、AI 能不能直接合併 consumer PR)。原表 35 列:1 列依第三節刪除(擋下就換工具)、1 列移到第一節(sync-memory)、33 列保留:26 列逐字原文,6 列加註「2026-10-07 更正」(依第三節:git branch -D 改成停下回報、兩列 consumer PR 合併改走 release:auto 並待 G1 (2) 讀回;過時說法:.claude/hooks 鏡像已退役、發版同意綁內容不綁 commit、Bash 套 patch 已被核准閘擋),1 列加註「2026-10-07 補」(純註解判定讀 adapter 的 content 欄位);原文 `governance/archive/memory-retired/2026-10-07-blocked-route-merge/`;19→18
