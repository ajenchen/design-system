# Phase A — primary complete audit

## 1. Detect repository mode

Classify the target from evidence, not provider identity:

- **source repository**: owns `packages/design-system/src` and canonical governance sources;
- **consumer repository**: consumes the design-system package and owns product code;
- **out of scope**: neither condition is true; return `REVIEW-BLOCKED`.

For a source repository, include canonical governance, package sources, specifications, stories, tests, template sources, and the product canary. For a consumer repository, include the installed immutable governance snapshot, local product code, local governance overlays, and upgrade evidence. Never propose edits inside installed dependencies.

## 2. Freeze inputs

Before reading conclusions:

1. Record repository, base/head, worktree fingerprint, and user wording.
2. Generate the complete applicable file inventory mechanically.
3. Digest the inventory and every rubric source.
4. Record unavailable evidence as a blocker; do not silently narrow scope.

## 3. Read canonical sources

Read all applicable material directly from its owner:

- `packages/governance/canonical/**` for cross-provider governance contracts;
- `packages/design-system/ds-canonical/rules/**` and `references/**` for shared rules;
- the full audit rubric under `packages/design-system/ds-canonical/skills/design-system-audit/**`;
- all in-scope specifications, implementation, stories, tests, templates, and consumer surfaces.

Follow pointers to their owner. Do not treat a generated provider view as a second owner.

## 4. Execute complete coverage

Partition the frozen inventory into non-overlapping work units. Parallel workers are allowed only when the current provider can preserve identical inputs and return a coverage ledger. Every rubric dimension must record:

- files inspected and their inventory membership;
- findings with path/line evidence;
- deterministic checks actually run and literal result artifacts;
- explicit zero-finding evidence;
- uncertainty or unavailable runtime evidence.

Sampling, representative subsets, skipped heavy checks, or exit-zero without mode evidence makes the pass incomplete.

## 5. Triage and verify

Classify each raw finding only after adversarial source verification:

- **material**: contract, user impact, accessibility, security, release, or real regression;
- **marginal**: non-material wording or style preference;
- **false positive**: contradicted by source or an applicable exception.

Route only genuine unresolved product／UI／UX SSOT choices for user decision. Apply engineering, governance, security, provider, release, rollout, and remediation corrections under the canonical Standing Authorization, including substantive engineering changes when required by the frozen scope. Run the complete deterministic gate set appropriate to the changed scope and retain artifacts.

## Phase A output

Return the frozen-input digests, coverage ledger, verified findings by severity, genuine product／UI／UX decisions requiring user direction, standing-delegated engineering corrections within scope, verification artifacts, and remaining uncertainty. Finish this output before exposing the primary context to peer conclusions.
