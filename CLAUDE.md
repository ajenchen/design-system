@AGENTS.md

# Claude Code 專屬機制層(provider adapter)

**治理核心住在 `AGENTS.md`**(上方 import,launch 全載,內容零損失)——增刪改治理**只改 AGENTS.md**,Claude 與 Codex 等所有 agent 自動同步(PNG 架構,SSOT → `.claude/planning/2026-07-16-provider-neutral-governance.md`)。本檔只收 Claude Code 的 provider 機制說明。

## Path-scoped rules(Claude 自動載入;2026 Anthropic 推薦)

僅在編對應 path 檔案時載入,降低每 session context 成本(其他 agent 依 AGENTS.md「Rule Index」在編對應檔案前主動讀**同一份檔案**):

- `.claude/rules/meta-patterns.md` — 31 active M-rules(always loads,fundamental)
- `.claude/rules/spec-rules.md` — paths: `**/*.spec.md` + `packages/design-system/**`
- `.claude/rules/ui-development.md` — paths: `**/*.tsx` + `**/*.ts`
- `.claude/rules/story-rules.md` — paths: `**/*.stories.tsx`
- `.claude/rules/self-verify.md` — paths: `src/**` + `.claude/**` + `*.spec.md` + `*.tsx` + `*.css`

## Hooks(write-time 加速器,非信任邊界)

`.claude/hooks/` 於 Claude Code lifecycle(PreToolUse / PostToolUse / Stop / SessionStart / UserPromptSubmit)機械強制——提供**最早的回饋**(寫入當下攔截)。它是 Claude 專屬加速器;**最終不可繞過層 = `npm run release:preflight` + CI**(AGENTS.md 檔頭宣告),任何 provider 的產出都被同一套 deterministic gates 把關。Hook 計數/預算 SSOT = `session_start_governance_check.sh` Check 7。

## Skills / Commands / Memory(Claude 專屬 discovery)

- **Skills**:`.claude/skills/`(invoke 情境的多步驟 workflow + checkpoint;`/skill-name` 觸發)
- **Commands**:`.claude/commands/`(一次性單步 action)
- **Memory**:`~/.claude/projects/<project>/memory/` 為 SSOT + repo `.claude/memory/` mirror(本機編完跑 `npm run sync-memory` 推回 repo,讓 cloud sandbox / 其他 agent 看得到)
- **Plugin 邊界**:plugin 只能是 optional adapter / distribution convenience;任何 Critical 治理不得 plugin-only(cloud plugin 不可靠實證 → `.claude/memory/reference_cloud_governance_loading.md`)
