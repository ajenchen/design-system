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
