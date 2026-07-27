# Solo repository workflow — one branch, one PR, protected main

**Current canonical (migrated 2026-07-20).** This supersedes the old no-PR/direct-main solo flow. The migration was required because provider-neutral governance cannot be authoritative while `main` remains directly writable or CI remains bypassable.

## Invariants

- One Codex/Claude task = one working branch = one pull request.
- Never edit or push directly on `main`.
- The PR is the only merge path. Required checks, resolved review threads, immutable dependency checks, and the product preview are gates.
- In this solo repository, the PR author cannot meaningfully self-approve. CODEOWNERS records ownership, but the ruleset uses zero required human approvals; protected checks, resolved conversations, preview/canary evidence, immutable attestations, and external readback are the authority.
- Creating or updating the one PR is normal workflow and does not require a second confirmation.
- Merging is a standing-delegated engineering action once all hard gates are green. A status report or milestone is a receipt, not an approval checkpoint.
- A GitHub App may open propagation/upgrade PRs. It may never write `main` directly or bypass required checks.
- Dependency inputs are exact versions. `beta`, `latest`, ranges, and unattended `npm update` are forbidden for governed consumers.

## Canonical sequence

1. Read this file and confirm the current working branch before editing.
2. Make and verify changes on the single task branch.
3. Commit and push that branch; create or update its single PR.
4. If release-affecting SSOT changed, complete the exact version bump and run `npm run release:preflight` on the clean branch. The attestation belongs to the PR evidence.
5. Monitor required CI, preview/canary, unresolved conversations, and external protection readback; remediate failures on the same branch and PR. Report the important diff, PR, and preview as receipts.
6. If the user requests changes, continue on the same branch and PR.
7. After every hard gate is green, squash-merge the PR through protected `main` under the standing engineering authorization, then read back the merge and protection state.
8. For a release, update local `main` with `git pull --ff-only`. The tag guard accepts the attested commit or an identical attested tree after squash; push the immutable tag and verify the published exact versions/provenance.
9. Release completion opens checked PRs for the template and product rings. It never dispatches a mutable tag or directly rewrites consumer `main`.
10. Delete the merged remote branch, update local `main` with fast-forward only, then delete the local task branch when clean.

## Mechanical enforcement (M28)

`packages/design-system/ds-canonical/hooks/check_solo_workflow.sh` 是唯一 enforcement source；provider hook views 皆由它生成：

- R1: a session cannot create a second working branch; both `git checkout -b` and `git switch -c` are recognized across provider branch prefixes.
- R2: any direct push to `main` is blocked. Standing authorization does not bypass protected-main architecture.
- R4: tag push is blocked unless `release:preflight` produced a marker for the same commit or identical Git tree.

R3's transcript-keyword merge gate is retired because it confused human product authority with delegated engineering execution. Remote protected checks, conversation resolution, preview/canary evidence, attestation, and external readback remain fail-closed.

`GOVERNANCE_BYPASS_SOLO_WORKFLOW=1` remains an audit-logged break-glass mechanism for recovery only when injected into the hook host environment before the provider starts. A token inside command text is never authority and must not disable the guard. The override is not a normal path and does not bypass GitHub rulesets.

## Decision authority at merge

`AGENTS.md` `# 自主執行 canonical` is the authority SSOT. Commit, push, PR, merge, release, propagation, rollout, and rollback are delegated engineering actions; none is itself an External Authorization Boundary. Stop only for a genuine product/UI/UX SSOT tradeoff or a human-only platform/credential/spend/legal-account-business boundary. A platform-only human action never transfers the engineering decision back to the user.

## Release hard gate

The single release gate is `npm run release:preflight`. It performs deterministic generation/checks, full build and dogfood validation, verifies all version surfaces, requires a clean tree, and writes `release/release-preflight-pass.json` below the fail-closed Git-owned governance evidence root with commit, Git tree, exact version, governance digest, and passed gates.

After a squash merge, the commit ID changes but the tree must remain byte-identical. R4 therefore accepts an exact attested Git tree; any merge-time content change invalidates the marker and requires a new preflight. Publishing uses npm provenance/OIDC where supported, and consumers adopt only exact versions through reviewed PRs.

## Why the old flow was retired

The 2026-05 no-PR rule solved branch/PR sprawl but permitted direct-main writes and made remote hard gates impossible. The preserved lesson is one task/one branch plus non-bypassable PR gates—not a chat-keyword merge gate. The 2026-07 migration keeps those protections while making CI, release attestation, rollback, and fleet rollout enforceable for Claude, Codex, and future providers.
