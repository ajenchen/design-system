---
name: independent-review
description: "Obtain an evidence-bound, read-only second opinion on product-consumer changes from a distinct certified peer provider without acquiring DS-author authority."
---

<!-- _generated: canonical provider skill projection; source: node_modules/@qijenchen/design-system/ds-canonical/skills/independent-review/SKILL.md + packages/governance/canonical/providers.json; do not edit this provider view. -->

# independent-review — Codex adapter

Read and follow the complete provider-neutral workflow at `node_modules/@qijenchen/design-system/ds-canonical/skills/independent-review/SKILL.md`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- `currentProvider: codex`
- `reviewSelectionPolicy: highest-certified-independent-review-v1`
- `reviewClass: tier-0-governance`
- `independentPeerProvider: selected-and-frozen-at-review-prepare-time`
- `transport: content-addressed-model-broker-exchange-v1`
- `targetCertificationContract: exact-provider-runtime-surface-role-target-v1`
- `sameProviderPeer: invalid`
- `authorProviderRequired: true`
- `authorProviderMustEqualCurrentProvider: true`
- `independentReviewerMustDifferFromAuthor: true`
- `reviewIsolation: separate-context-required`
- `reviewMutation: read-only`
- `reviewWorkspace: immutable-snapshot-or-enforced-tool-deny`
- `mutationDetection: before-after-worktree-fingerprint`
- `missingEvidenceOutcome: REVIEW-BLOCKED`
- `compatibilityEvidence: packages/governance/canonical/providers.json#codex.skillBindings`

## Required canonical references

- `node_modules/@qijenchen/design-system/ds-canonical/skills/independent-review/references/evidence-contract.md`


## Adapter execution

1. Require the author provider to be codex and resolve only a distinct reviewer through highest-certified-independent-review-v1/tier-0-governance.
2. Verify an exact certified provider/runtime/surface/product-consumer target before claiming an independent second opinion.
3. Freeze and digest the product scope, dispatch without author conclusions, and require a separate read-only context.
4. Validate broker/transport evidence and before/after worktree fingerprints; emit findings only and never acquire DS-author, release, or mutation authority.

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is `REVIEW-BLOCKED`, never PASS.
