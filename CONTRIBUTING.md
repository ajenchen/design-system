# Contributing

2026-05-22 Phase 4 team-distribution-roadmap ship.

## Daily workflow

1. **Working branch**:1 chat = 1 working branch(per `.claude/memory/feedback_solo_dev_workflow.md`)
2. **Edit → commit → push branch**:每次 push 觸發 Netlify preview deploy(per-branch URL)
3. **User 預檢 preview**:點 Netlify URL 看視覺 / 行為
4. **User 拍板「push / OK / 合 main」**:才 merge to main(no PR)
5. **Cleanup**:merge 後 `git push origin --delete <branch>` + `git branch -d <branch>`

## PR-based workflow(team distribution era,2026 Q3 開始)

Roadmap Phase 5+6 完成後,team monorepo `product-workspace` 走 PR + CODEOWNERS 路徑。DS repo
本身仍是 solo workflow(owner = 1 人,team 只 consume)。

## Release(per Phase 4)

每個 PR 動 `packages/*` substantive code → 必加 changeset:

```bash
npx changeset
# interactive:選 package + bump type + summary
# 產生 .changeset/<random>.md
```

CI fail if missing changeset(blocked merge)。

### Release flow

1. Author PR + add changeset
2. Merge to `main`(solo era:直接 merge / team era:CODEOWNERS approve 後 merge)
3. `changeset-bot` 自動開「Version Packages」PR — aggregate 累積 changesets → bump versions + 寫 CHANGELOG
4. Merge bot PR → CI tag-push → `.github/workflows/release.yml` 跑:audit gates → build → publish npm → GitHub Release

### Pre-release(beta/next dist-tag)

```bash
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
# CI 自動 detect `-beta` suffix → publish to `@beta` dist-tag(consumer:`npm install @qijenchen/design-system@beta`)
```

對齊 Vercel `pkg.pr.new` pre-release model — instant publish,easy rollback。

## Quality gates(merge blocker)

每個 PR / tag-push CI 跑 audit pipeline,任一 fail 阻擋 release:

| Check | Script |
|---|---|
| TypeScript strict | `npx tsc -b` |
| Orphan token | `node scripts/audit-orphan-tokens.mjs --check` |
| Code quality | `node scripts/code-quality-audit.mjs --scope=packages/design-system/src/components` |
| Content quality | `node scripts/audit-content-quality.mjs --check` |
| Governance counters | `node scripts/sync-governance-counters.mjs --check` |
| Vite build | `npm run build` |
| Storybook build | `npm run build-storybook` |
| Pack content | `npm pack --dry-run` per package |

## Codemod for breaking change

Major version bump 必伴隨 codemod:

```
packages/design-system/codemods/
  v0-to-v1/
    transform.ts         # jscodeshift-based
    README.md            # migration doc
    test/
```

Consumer migrate:

```bash
npx @qijenchen/design-system codemod v0-to-v1 ./src
```

對齊 Material UI / Next.js / Storybook canonical(jscodeshift idiom)。

## Console deprecation warning(transition period)

Breaking API change 前 N 個 minor 版本:console.warn 提示 + docs migration ref。React `componentWillMount` deprecation idiom。

## World-class refs

- changesets/changesets GitHub repo
- Vercel pkg.pr.new pre-release
- Material UI semver discipline
- Storybook 8.0 codemod
- Anthropic Claude Code Plugin Marketplace docs(2025)
