---
name: deep-audit-cross-codex
description: Provider-neutral workflow for two isolated no-sample audits under one inventory and rubric. Use only when the task or deliverable explicitly requests independent review; material governance, release, or design-system scope alone does not trigger it.
---

# Cross-provider deep-audit workflow

This canonical workflow contains no provider, model, version, API, context-length, token-count, or transport preference. It requests an independent review capability; registered adapters resolve execution details without changing these semantics.

## Preconditions

- Freeze the exact review scope, commit/diff, complete inventory, canonical rubric, and user wording.
- Record the author provider and primary provider explicitly, then exclude both from reviewer selection. Missing or contradictory author identity produces `REVIEW-BLOCKED`.
- Resolve `tier-0-governance` through the registered capability policy: `standard/high/maximum` are the assurance tiers and Tier-0 requires `maximum`. Choose the highest certified policy-allowed assurance, reasoning, and compute capability from a distinct provider. Budget may batch or stop but must never downgrade.
- Treat subscription-plan access as an entitlement route, not a model identity. It is eligible only with exact certified adapter-readback evidence; do not fall back to another route or lower model for cost.
- Freeze the selected exact provider/profile/model release, entitlement where applicable, selection receipt, and provider/capability/certification/invocation/model-release registry digests before dispatch. Mutable aliases, stale registries, or response substitution produce `REVIEW-BLOCKED`.
- Run the selected reviewer in a separate context with read-only execution.
- Fingerprint the worktree before review. A moving target invalidates comparison.

## Phase A — primary audit

1. Read every applicable canonical rule and rubric dimension; do not sample.
2. Enumerate the full scope mechanically, then partition it without overlap or omission.
3. Verify claims against source, runtime evidence, and deterministic gates. Exit zero alone is not proof that a claimed mode ran.
4. Produce a dimension-by-dimension coverage record, including explicit PASS evidence for dimensions without findings.
5. Finish this pass before receiving peer conclusions.

## Phase B — independent peer audit

1. Send the identical frozen inventory, rubric, wording, and evidence through the selected adapter/transport.
2. Require the same no-sample coverage record plus exact provider/profile/model-release/selection/transport identity.
3. Keep the peer workspace immutable or deny mutation tools; fingerprint before and after.
4. Missing dimensions, partial output, mutation, same-provider execution, author/peer identity collision, or absent identity produce `REVIEW-BLOCKED`.

## Phase C — reconciliation and action

1. Compare both passes dimension by dimension and independently verify every disagreement.
2. Preserve unresolved gaps; silence is not agreement and missing evidence is not PASS.
3. Batch user decisions only for genuine unresolved product／UI／UX SSOT choices. Resolve engineering, governance, security, provider, release, rollout, and remediation decisions under the canonical Standing Authorization; platform-only login/MFA/OAuth/owner/billing actions are human actions, not human engineering decisions.
4. Re-run deterministic gates against the final diff and record both coverage and remaining risk.

A user may explicitly request a single-provider audit. It must be labelled single-provider and must never claim independent review.

### Standard CI-enforced evidence route

For CI dimensions 64 and 66, the small-team blocking path is exactly:

`npm run audit:ci-evidence-observe`

The command performs one live read-only observation and atomically publishes both envelopes with the same content digest. It must bind the active PR tree to the squash-merge/tag tree, the exact required-check producers, successful `repository_dispatch` release and mirror runs, immutable GitHub Release/BOM, all three npm SLSA provenance identities, and template/work-management exact locks plus `Verify consumer`. Candidate freeze, broad external activation, model certification, offline completion-attestor signatures, staging, and import are maximum-assurance or legacy mechanisms and cannot block or substitute for this standard path.

### Exact user-waiver route

When the active run has `reviewSelection.kind=provider-review-capability-selection-waived`,
`waiverAuthority=user`, `self=author`, and `peer=null`, do not dispatch a peer/model or
materialize synthetic broker envelopes. Complete the local review against the frozen run,
write the canonical self-attested JSON bundle, then import it once with:

`node scripts/import-waived-self-review.mjs --input <absolute-or-repository-contained-path> [--evidence-root <path>] --json`

Bundle shape SSOT: `scripts/schemas/deep-audit-evidence-contract.schema.json#/$defs/waivedSelfReview`.

The bundle must enumerate the current coverage-matrix `PURE-JUDGMENT` dimensions and every
frozen manifest component; the importer binds it to the exact run/manifest/Git/inventory/
rubric/provider identities at `review/waived-self-review.json`. `PASS`, `FINDINGS`, and
`UNOBSERVED` are explicit records. This route is always `independent=false` and
`assurance=self-attested`; coverage may be complete, but `unverifiedModelCoverage` remains a
trust downgrade and `promotionEligible=false`.
