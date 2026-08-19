# Contributing

2026-05-22 Phase 4 team-distribution-roadmap ship.

## Daily workflow

1. **Working branch**:1 task = 1 working branch + 1 PR(per `governance/memory/feedback_solo_dev_workflow.md`;protected `main` 禁 direct push)
2. **Edit → commit → push branch**:每次 push 觸發 Netlify preview deploy(per-branch URL);建立/更新該 task 唯一 PR
3. **Required CI + conversations resolved** 後依 Standing Authorization 自動 squash merge 進 protected `main`(Netlify preview 是 optional 佐證,不是 merge gate)
4. **Cleanup**:merge 後刪 remote/local branch(`npm run release:status` 讀回安全後)

## Release(canonical five-step machine workflow)

Release 的 machine SSOT 是 `infra/governance/release-workflow.json`:`pr-checks → merge → publish → readback → consumer` 五步全 AUTO;公開入口只有 `npm run release:auto`(安全續跑)與 `npm run release:status`(唯讀)。changelog 由 GitHub Releases auto-notes 自動生成(`release.yml` 配 `generate_release_notes: true`)。無 changeset 流程(stale changesets 已於 2026-05-29 清除,per commit `0146e02f`)。

### Release flow

1. 內容 PR 走上方 workflow 合入 protected `main`
2. **Version bump PR**:`packages/design-system` 抬 `0.1.0-beta.<N>` 後跑 `npm run governance:generate`(release-version stage 同步全部 manifest/lock),PR + required CI + merge
3. `npm run release:auto` 接手其餘步驟:tag + protected release dispatch → `.github/workflows/release.yml` 跑 audit gates → build → publish npm(immutable exact version;`-beta` suffix → `@beta` dist-tag + auto-repoint `latest`)→ GitHub Release(auto-notes)→ **readback**(GitHub Release + npm 三包 exact version 讀回)→ **consumer**(template/WM exact-version PR 自動建立、CI、合併、讀回)

### Consumer install

受治理 consumer(template/WM)一律釘 **exact version**(`0.1.0-beta.<N>`),由 consumer step 自動升版;禁 `@beta`/`latest`/range(per `governance/memory/feedback_solo_dev_workflow.md`)。未治理的 ad-hoc 試用才可 `npm install @qijenchen/design-system@beta`。

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
