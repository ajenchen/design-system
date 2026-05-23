# 03 — Co-edit workflow(team PR + merge)

多人共編模式(跟 DS repo solo workflow 不同 — DS owner 1 人;product-workspace team 共編)。

## Daily flow

1. **Pull main**:`git pull origin main`
2. **Open feature branch**:`git checkout -b feat/order-list-filter`
3. **Edit + commit + push**:`git push origin feat/order-list-filter`
4. **Open PR**:`gh pr create --title "feat: add order list filter"` or GitHub UI
5. **Wait for CI**:`.github/workflows/audit.yml` 跑 audit + build + storybook
6. **CODEOWNERS review**:per `.github/CODEOWNERS`,team 互審
7. **Merge**(squash by default)
8. **Cleanup**:`git checkout main && git pull && git branch -d feat/...`

## CI Quality gates(merge blocker)

- `npx tsc -b` 全綠
- `audit-content-quality --check` ✅(consumer apps 通常 N/A skip)
- `audit-code-quality --scope=apps` ✅
- `npm run build --workspaces`
- `npm run build-storybook`

## Conflict resolution

DS 端有 breaking change → `package.json` 跟動 → 跑 codemod(若有):
```bash
npx @qijenchen/design-system codemod v0-to-v1 apps/<name>/src
```

無 codemod 但有 conflict → manual fix + 加 `docs/migration-notes-v<N>.md` 給後續 team member。

## Branch protection(per CODEOWNERS)

`.github/CODEOWNERS` 強制:
- main branch require ≥1 reviewer approval
- 動 `.claude/settings.json` / `.storybook/` / `package.json` 額外要 team-leads approval

## DS 不准 fork-edit

```
❌ 你打開 node_modules/@qijenchen/design-system/.../button.tsx 改它 → 下次 npm install 被覆蓋
✅ 開 issue 給 DS repo,DS owner ship 新版,team renovate auto-update
```
