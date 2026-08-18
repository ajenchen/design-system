# Contributing

2026-05-22 Phase 4 team-distribution-roadmap ship.

## Daily workflow

1. **Working branch**:1 chat = 1 working branch(per `governance/memory/feedback_solo_dev_workflow.md`)
2. **Edit → commit → push branch**:每次 push 觸發 Netlify preview deploy(per-branch URL)
3. **User 預檢 preview**:點 Netlify URL 看視覺 / 行為
4. **User 拍板「push / OK / 合 main」**:才 merge to main(no PR)
5. **Cleanup**:merge 後 `git push origin --delete <branch>` + `git branch -d <branch>`

## PR-based workflow(team distribution era,2026 Q3 開始)

Roadmap Phase 5+6 完成後,team monorepo `product-workspace` 走 PR + CODEOWNERS 路徑。DS repo
本身仍是 solo workflow(owner = 1 人,team 只 consume)。

## Release(手動 bump + tag + GitHub Releases auto-notes)

Release 走**手動 bump beta + tag push**,changelog 由 GitHub Releases auto-notes 自動生成(`release.yml` 配 `generate_release_notes: true`)。無 changeset 流程(stale changesets 已於 2026-05-29 清除,per commit `0146e02f`)。

### Release flow

1. SSOT-affecting code merge 到 `main`(solo workflow:user 拍板才 merge,no PR)
2. **手動 bump version**:`packages/design-system` + `packages/storybook-config` 兩 package 同步 bump `0.1.0-beta.<N>`(lockstep),commit `chore(release): bump beta.<N> — <摘要>`
3. **Tag push** 觸發 release:

   ```bash
   git tag v0.1.0-beta.<N>
   git push origin v0.1.0-beta.<N>
   ```

4. `.github/workflows/release.yml`(`push: tags: v*`)自動跑:audit gates → build → publish npm(`-beta` suffix → `@beta` dist-tag + auto-repoint `latest`)→ `softprops/action-gh-release@v2`(`generate_release_notes: true`)開 GitHub Release(commit log auto-notes)

### Consumer install

```bash
npm install @qijenchen/design-system@beta
# 裸 npm i 也拿最新 beta(release.yml 自動把 latest dist-tag 重指當前 @beta)
```

對齊 GitHub Releases auto-generated notes + Vercel `pkg.pr.new` pre-release model(instant publish,easy rollback)。

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

- GitHub Releases auto-generated release notes(`softprops/action-gh-release`)
- Vercel pkg.pr.new pre-release
- Material UI semver discipline
- Storybook 8.0 codemod
- Anthropic Claude Code Plugin Marketplace docs(2025)
