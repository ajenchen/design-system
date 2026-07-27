---
name: codex-collab
description: "Coordinate an evidence-complete primary analysis with a genuinely independent peer provider, then verify and synthesize both results."
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/codex-collab/SKILL.md + packages/governance/canonical/providers.json; do not edit this provider view. -->

# codex-collab — Codex adapter

Read and follow the complete provider-neutral workflow at `packages/design-system/ds-canonical/skills/codex-collab/SKILL.md`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- `currentProvider: codex`
- `reviewSelectionPolicy: highest-certified-independent-review-v1`
- `reviewClass: tier-0-governance`
- `independentPeerProvider: selected-and-frozen-at-review-prepare-time`
- `transport: external-or-orchestrator`
- `targetCertificationContract: not-declared`
- `sameProviderPeer: invalid`
- `authorProviderRequired: false`
- `reviewIsolation: separate-context-required`
- `reviewMutation: read-only`
- `reviewWorkspace: immutable-snapshot-or-enforced-tool-deny`
- `mutationDetection: before-after-worktree-fingerprint`
- `missingEvidenceOutcome: REVIEW-BLOCKED`
- `compatibilityEvidence: packages/governance/canonical/providers.json#codex.skillBindings`


## Adapter execution

1. Complete the current provider analysis before seeing peer conclusions.
2. Dispatch the same evidence-complete brief through the bound transport.
3. Verify peer claims against primary evidence, preserve disagreements, and synthesize only supported conclusions.

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is `REVIEW-BLOCKED`, never PASS.
