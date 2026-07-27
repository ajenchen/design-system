---
name: deep-audit-cross-codex
description: "Run two isolated, no-sample audits against the same inventory and rubric, reconcile disagreements, and retain complete coverage evidence."
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md + packages/governance/canonical/providers.json; do not edit this provider view. -->

# deep-audit-cross-codex — Claude Code adapter

Read and follow the complete provider-neutral workflow at `packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- `currentProvider: claude`
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
- `compatibilityEvidence: packages/governance/canonical/providers.json#claude.skillBindings`


## Adapter execution

1. Require explicit author provider identity; this binding is valid only when the author provider is claude.
2. Freeze the inventory and run the complete no-sample primary audit first.
3. Resolve the highest certified independent capability under highest-certified-independent-review-v1/tier-0-governance at review prepare time, freeze the exact certified reviewer receipt, and run it in a separate read-only context against the identical rubric and inventory; it must differ from both author and primary.
4. Reconcile dimension by dimension; missing coverage, mutation, absent identity, or author/peer collision is REVIEW-BLOCKED.

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is `REVIEW-BLOCKED`, never PASS.
