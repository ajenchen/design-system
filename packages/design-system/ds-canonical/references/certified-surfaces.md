# Certified Surface Registry(PNG ADR-5;SSOT)

**規則**:每個 AI provider × surface 的治理支援度**只能由實測證據升級**;未測 = Uncertified,禁推定。三態:
- **Certified** — 原生機制完整實測(instructions/rules/hooks discovery + gates)
- **Certified-equivalent** — 原生機制不足,但 provider-neutral verifier(release:preflight + CI)達成相同 rule coverage 與 blocking outcome,無 Critical 弱化
- **Uncertified** — 缺實測證據;可產草稿,**不得**宣稱合規/取得 attestation/發佈

**最終 authority(所有 surface 共通)**:`npm run release:preflight`(~30 deterministic gates)+ CI(release.yml/ci.yml)— 任何 surface 的不合規產出無法發佈。此層與 surface 無關,故「Uncertified surface 產的草稿」仍會在 merge/release 被同一套擋下(fail-closed)。

| Provider | Surface | 狀態 | 原生機制實測 | 等效控制 | 證據 | 日期 |
|---|---|---|---|---|---|---|
| Claude Code | local CLI/desktop | **Certified** | CLAUDE.md(@AGENTS.md import)+ .claude/rules path-scoped + hooks 4 events + skills/commands 全量日常運行 | preflight+CI | 本 repo 全程開發史;hook fire logs `.claude/logs/hook-fires.jsonl` | 持續 |
| Claude Code | cloud/web(sandbox) | **Certified-equivalent** | committed `.claude` 4 hook events fire 實測 ✓;plugin **不可靠**(官方 issue #63028/#62174)→ 治理不依賴 plugin | preflight+CI | memory `reference_cloud_governance_loading.md`(2026-06-16 + 2026-07-14 端到端蓋章) | 2026-07-14 |
| OpenAI Codex | CLI local(exec) | **Certified-equivalent** | AGENTS.md 原生 discovery 實測 ✓(canary:不讀檔答出「release:preflight與CI」CODEX-OUTCOME:SUCCESS);hooks/skills 支援度 → P2.1 研究中(未證前不宣稱) | preflight+CI + codex-run-guarded 失敗守衛 + freshness 閘 | commit d88ceac2 canary probe;`scripts/check-codex-freshness.mjs` | 2026-07-16 |
| OpenAI Codex | cloud / IDE / app | **Uncertified** | 未實測(載入哪些 repo config 未知) | —(preflight/CI 仍擋 merge/release) | 無 | — |
| 其他 AGENTS.md 相容 agent(Cursor/Copilot/Jules…) | 各自 | **Uncertified** | AGENTS.md 標準宣稱支援,本 repo 未逐一實測 | preflight+CI | agents.md 標準頁(宣稱層) | — |

**升級程序**:(1) 官方文件 cite;(2) 本 repo live 實測(canary probe / clean-room);(3) 記錄 provider+版本+日期+證據;(4) 更新本表同 commit。**降級**:發現 regression(如 provider 改版 discovery 變更)→ 立即降 Uncertified + 記錄。

**Fork/template consumer surfaces**:consumer repo 的 Claude 治理 = C-prime corpus(實測蓋章 2026-07-14);consumer 的 Codex 治理 = P2.4 落地後補列(現況 Uncertified)。
