# Repository hygiene canonical

Repository hygiene is part of a full/deep audit. It is separate from
`/knowledge-prune`:knowledge-prune owns governance knowledge only, while this check owns the
repository's complete folder/file topology.

## Required inventory

For every repository in scope, enumerate the Git worktree with
`git ls-files --cached --others --exclude-standard`. Classify by declared home instead of judging
files from names alone:

1. active source/authority;
2. generated provider or release projection;
3. fixture/baseline;
4. archive/evidence;
5. future-reserved asset with a policy declaration that names all four required fields: owner,
   concrete purpose, activation condition, and review/expiry lifecycle;
6. transient junk.

Only class 6 is automatically removable. Classes 2-5 are not redundancy. A zero-reference grep
is evidence, not deletion authority:dynamic entrypoints, package exports, workflow paths,
fixtures, templates, compatibility projections, and explicitly future-planned consumers must be
checked first.

"Future use" by itself is not a classification. A class-5 exemption exists only when
`repository-hygiene-policy.json` binds the exact path prefix to:

1. an existing repository-relative canonical owner;
2. a concrete retained purpose (not "maybe useful", `TBD`, or a generic parking area);
3. a concrete activation condition that names the evidence/authority which would turn the asset
   into active work; and
4. a machine-checkable `review-by` or `expire-on` date plus the fail-closed lapse action
   `reclassify-or-remove`.

Missing any field means the asset cannot use the future-reserved exemption and must be classified
by its current role. Passing the four-field contract is necessary, not permission to keep unrelated
temporary/editor junk. On the lifecycle date the invariant fails until the declaration is reviewed,
renewed with evidence, activated, or removed.

## Mechanical core

`packages/design-system/ds-canonical/references/repository-hygiene-policy.json` is the topology
and exception SSOT. `node scripts/repository-hygiene-invariant.mjs --profile=authority --check`
enforces:

- every top-level home has a declared purpose;
- temporary/editor/OS artifacts are not repository content;
- every tracked symlink and target is declared;
- exact-content duplicates outside generated/fixture/baseline/archive homes are rejected unless
  a narrow path-set exception has a reason.
- every future-reserved prefix satisfies the four-field contract, has a present canonical owner,
  and has not crossed its review/expiry date.

Exceptions must be path-bound and explain the retained role. Blanket filename or directory
exceptions are forbidden. Future-reserved declarations are narrow classification exemptions, not
an alternate archive or backlog; an undeclared or incomplete "future use" claim fails closed.

## Judgment layer

After the mechanical gate, inspect ambiguous files and homes against package exports, npm scripts,
workflow references, story globs, test discovery, ownership manifests, and `rg` references. Prefer
moving a valid file into its owning home over deleting it. Remove only high-confidence junk;
preserve future-use material only when the four-field declaration is complete and current.

Ignored local caches/builds (`node_modules`, `dist`, `storybook-static`, reference media) are not
Git repository content. Report their size separately when local disk hygiene is in scope, but do
not make a portable deep-audit receipt depend on machine-specific ignored state. OS junk such as
`.DS_Store` may be removed locally with a recoverable operation.

### Local worktree lifecycle

A full/deep audit also enumerates `git worktree list --porcelain` for every observed repository.
This is machine-local hygiene, not a portable source gate. Classify each linked worktree before
cleanup:

- preserve the current worktree, every dirty worktree, and every branch whose remote work is open
  or unmerged;
- a clean worktree whose exact commit is already merged may be moved out recoverably, after which
  `git worktree prune` may remove only the now-missing registration;
- preserve untracked release/debug artifacts together with the recoverable worktree move unless
  their owning retention policy independently proves them disposable;
- never delete a branch merely to make the worktree list shorter.

Report active and reclaimed worktrees separately. Missing GitHub/network readback makes merge
status **unobserved** and therefore preserves the worktree.

Git-local audit/review state below `<absolute-git-dir>/governance-runtime/evidence/` is also outside
the Git inventory, but a full/deep audit must classify it under
[runtime evidence retention canonical](runtime-evidence-retention.md). Preserve current active,
live-referenced, genuine-review, and unexpired-receipt closure; reclaim only complete unreferenced
blocked/failed/stale runs. Never use repository duplicate rules to delete part of an evidence CAS.

Run the same classification for every locally available registered repository. A repository that
is unavailable in the current runtime is **unobserved**, never PASS; its repo-local audit/release
gate remains the authority.

## World-class benchmark(M8/M22;2026-08-04 backfill — canonical 制定時漏做,本節補齊)

| System | Convention(verbatim/paraphrase) | Source | Status |
|---|---|---|---|
| Turborepo | `apps/` for applications and services、`packages/` for libraries and tooling;「Turborepo does not support nested packages like `apps/**` or `packages/**`」(flat nesting only);每 package 自帶 `package.json` 成獨立小專案;「If you ever find yourself writing `../` to get from one package to another, you likely have an opportunity to re-think your approach」 | github.com/vercel/turborepo `apps/docs/content/docs/crafting-your-repository/structuring-a-repository.mdx` | VERIFIED(raw 實取) |
| Carbon | monorepo(Yarn workspaces + Lerna);元件住 `packages/react/src/components` 每元件一資料夾、樣式住 `packages/styles/scss/components`;快取產物不入 repo(「You do not need to commit any `.yarn/cache` tarballs」,non-committed cache strategy) | github.com/carbon-design-system/carbon `docs/developer-handbook.md` | VERIFIED(raw 實取) |
| Nx | 「common convention … separating applications from packages(shared libraries)」;`libs/`/`packages/` 皆可,分組依 scope(所屬 app 或 app 內區塊);structure 可自訂但「good to have a plan in place」 | nx.dev/docs/concepts/decisions/folder-structure | search-only confidence(nx.dev 不在網域白名單,依官方頁搜尋摘要;maintainer 於 nrwl/nx discussion #16184 未表態單一命名) |

**對照結論**:本 repo 的 R1-R4 + future-reserved 契約與三家一致或更嚴——`apps/`+`packages/` 頂層分家(Turborepo/Nx 同構)、每 package 自為 project(Turborepo 同構)、生成/快取產物不入 tracked tree 或以 generated 家分類(Carbon non-committed cache 同構,本 repo 更進一步:generated 家有 drift check)。三家皆**無**「未來保留檔案」的機械契約——本 repo 的四欄位 future-reserved 契約(owner/用途/啟用條件/複審期限,逾期 fail-closed)為超出業界基線的自有強化,屬 justified 差異而非 drift。
