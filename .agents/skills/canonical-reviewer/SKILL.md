---
name: canonical-reviewer
description: "Review governance changes in an isolated read-only context with explicit author identity, complete canonical evidence, and mutation detection."
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/canonical-reviewer/SKILL.md + packages/governance/canonical/providers.json; do not edit this provider view. -->

# canonical-reviewer — Codex adapter

Read and follow the complete provider-neutral workflow at `packages/design-system/ds-canonical/skills/canonical-reviewer/SKILL.md`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- `currentProvider: codex`
- `reviewSelectionPolicy: highest-certified-independent-review-v1`
- `reviewClass: tier-0-governance`
- `independentPeerProvider: selected-and-frozen-at-review-prepare-time`
- `transport: external-or-orchestrator`
- `targetCertificationContract: not-declared`
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

- `packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md`


## Adapter execution

1. If the author provider is codex, resolve highest-certified-independent-review-v1/tier-0-governance; this context cannot claim independent review.
2. Use an immutable snapshot or denied write tools and fingerprint the worktree before and after.
3. Answer every canonical review question with evidence; suggestions are text only.

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is `REVIEW-BLOCKED`, never PASS.
