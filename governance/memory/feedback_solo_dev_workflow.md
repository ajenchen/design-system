# Solo repository workflow — one branch, one PR, protected main

**Current canonical (migrated 2026-07-20).** This supersedes the old no-PR/direct-main solo flow. The migration was required because provider-neutral governance cannot be authoritative while `main` remains directly writable or CI remains bypassable.

## Invariants

- One Codex/Claude task = one working branch = one pull request.
- Never edit or push directly on `main`.
- The PR is the only merge path. Required CI and resolved review threads are the `pr-checks` completion gates.
- In this solo repository, the PR author cannot meaningfully self-approve. CODEOWNERS records ownership, but the ruleset uses zero required human approvals; protected checks, resolved conversations, protected-main merge/readback, immutable publish, exact release readback, and exact consumer readback are the authority.
- Creating or updating the one PR is normal workflow and does not require a second confirmation.
- Merging is a standing-delegated engineering action once all hard gates are green. A status report or milestone is a receipt, not an approval checkpoint.
- A GitHub App may open propagation/upgrade PRs. It may never write `main` directly or bypass required checks.
- Dependency inputs are exact versions. `beta`, `latest`, ranges, and unattended `npm update` are forbidden for governed consumers.

## Canonical sequence

1. Read this file and confirm the current working branch before editing.
2. Make and verify changes on the single task branch.
3. Commit and push that branch; create or update its single PR.
4. If release-affecting SSOT changed, complete the exact version bump and generated projections on the same branch; no retired preflight attestation or extra approval ceremony is required.
5. Run `npm run release:auto`. It monitors required CI and unresolved conversations, remediates on the same PR, merges through protected `main`, publishes, reads back GitHub/npm, and lands exact-version template/WM PRs.
6. If the user requests changes before merge, continue on the same branch and PR.
7. If login/MFA/OAuth/credential reference pauses one action, complete that human action and rerun `release:auto`; it resumes from the first incomplete machine step.
8. Confirm completion with `npm run release:status -- --json`; optional preview/canary/soak may continue asynchronously but cannot block standard completion.
9. Delete the merged remote branch and clean local branch only after the orchestrator/readback says it is safe.

## Mechanical enforcement (M28)

`packages/design-system/ds-canonical/hooks/check_solo_workflow.sh` 是唯一 enforcement source；provider hook views 皆由它生成：

- R1: a session cannot create a second working branch; both `git checkout -b` and `git switch -c` are recognized across provider branch prefixes.
- R2: any direct push to `main` is blocked. Standing authorization does not bypass protected-main architecture.
Tag creation/push is owned by `release:auto` + the registered Release workflow, not a provider hook or retired local preflight marker. R3's transcript-keyword merge gate and the old R4 tag-attestation branch are retired because they inserted non-canonical ceremony. Remote protected checks and five-step live readback remain fail-closed.

`GOVERNANCE_BYPASS_SOLO_WORKFLOW=1` remains an audit-logged break-glass mechanism for recovery only when injected into the hook host environment before the provider starts. A token inside command text is never authority and must not disable the guard. The override is not a normal path and does not bypass GitHub rulesets.

## Decision authority at merge

`AGENTS.md` `# 自主執行 canonical` is the authority SSOT. Commit, push, PR, merge, release, propagation, rollout, and rollback are delegated engineering actions; none is itself an External Authorization Boundary. Stop only for a genuine product/UI/UX SSOT tradeoff or a human-only platform/credential/spend/legal-account-business boundary. A platform-only human action never transfers the engineering decision back to the user.

## Release hard gate

The standard release gate is the machine-readable five-step graph in `infra/governance/release-workflow.json`, executed by `npm run release:auto` and read by `npm run release:status -- --json`. Required PR CI, protected merge, immutable npm publish, GitHub/npm exact readback, and template/WM exact-version protected-main readback are the only standard blockers. Optional assurance never rewrites this graph.

## Why the old flow was retired

The 2026-05 no-PR rule solved branch/PR sprawl but permitted direct-main writes and made remote hard gates impossible. The preserved lesson is one task/one branch plus non-bypassable PR gates—not chat-keyword, local attestation, preview, soak, or fleet ceremonies. The current five-step machine workflow keeps those protections for Claude, Codex, and future providers.
