# Claude Code 專屬機制層(provider adapter)

**跨模型 bootstrap 核心住在 `AGENTS.md`**(上方 import,launch 全載,內容零損失)——增刪改共同 bootstrap 原則**只改 AGENTS.md**,Claude 與 Codex 等所有 agent 自動同步；其他治理／infra 只改 `infra/governance/protected-root-classification.json` 指定的 canonical owner，再跑完整 governance build graph。當前機器可驗的 authority chain 是 `packages/governance/canonical/manifest.json` → `scripts/governance-build-graph.json` → `infra/governance/` 內的 evidence/release/rollout contracts；`governance/planning/2026-07-16-provider-neutral-governance.md` 只是歷史遷移紀錄。本檔只收 Claude Code 的 generated adapter 機制說明，不是另一份 authority。

## Path-scoped rules(Claude 自動載入;2026 Anthropic 推薦)

僅在編對應 path 檔案時載入,降低每 session context 成本(其他 agent 依 AGENTS.md「Rule Index」在編對應檔案前主動讀**同一份檔案**):

- `.claude/rules/meta-patterns.md` — 31 active M-rules(always loads,fundamental)
- `.claude/rules/spec-rules.md` — paths: `**/*.spec.md` + `packages/design-system/**`
- `.claude/rules/ui-development.md` — paths: `**/*.tsx` + `**/*.ts`
- `.claude/rules/story-rules.md` — paths: `**/*.stories.tsx`
- `.claude/rules/self-verify.md` — paths: `**/*`(開始處理任一 repo 檔案後載入，不佔純對話 session 的啟動 context)

## Hooks(write-time 加速器,非信任邊界)

`.claude/hooks/` 於 Claude Code lifecycle(PreToolUse / PostToolUse / Stop / SessionStart / UserPromptSubmit)提供**最早的回饋**(寫入當下攔截)。它是 Claude 專屬加速器；最終判定來自 provider-neutral verifier、受保護 CI 與外部 required check，且只有遠端保護已驗證時才可宣稱不可繞過。Hook 計數/預算 SSOT = `session_start_governance_check.sh` Check 7。

## Skills / Commands / Memory(Claude 專屬 discovery)

- **Skills**:`.claude/skills/`(invoke 情境的多步驟 workflow + checkpoint;`/skill-name` 觸發)
- **Commands**:`.claude/commands/`(一次性單步 action)
- **Memory**:committed `governance/memory/` 是跨 provider SSOT；`~/.claude/projects/<project>/memory/` 只是 Claude 可重建 cache。只允許 repo → home 的 `npm run sync-memory`，禁止 home 反向覆寫 repo。
- **Plugin 邊界**:plugin 只能是 optional adapter / distribution convenience;任何 Critical 治理不得 plugin-only(cloud plugin 不可靠實證 → `governance/memory/reference_cloud_governance_loading.md`)
