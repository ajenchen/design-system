---
name: independent-review
description: Obtain a provider-adaptive, read-only second opinion on product-repository changes; use before accepting a material product, design-system-consumption, exact-package-upgrade, or canary conclusion that needs review by a distinct provider.
---

# Independent product review

Use this workflow only for product-consumer work. Canonical semantics request an independent capability, never a provider, model, version, API, context length, or token count. The provider adapter resolves the exact reviewer only through the registered capability policy; never infer it from a skill name or prose.

## Preconditions

- Bind `authorProvider` to the current provider and exclude it from selection. Resolve the highest policy-allowed certified assurance, reasoning, and compute capability from a different provider. Assurance tiers are `standard`, `high`, and `maximum`; Tier-0 governance requires `maximum`.
- Budget may change deterministic batching or stop the review, but must never downgrade capability, model, reasoning, compute, or coverage. A subscription entitlement is a route constraint, not a model identity; it requires exact certified adapter-readback evidence.
- Freeze the Git head/tree, diff, complete in-scope inventory, user wording, applicable product rules, installed governance lock, and verification artifacts. Digest the packet before dispatch.
- After selection, freeze the exact provider, review profile, model release, entitlement where applicable, and provider/capability/certification/invocation/model-release registry digests. Reject mutable aliases and any response substitution.
- Finish the author's analysis before revealing it to the peer. Send facts and criteria, not the author's conclusions.
- Enforce a separate read-only peer context. Fingerprint status and binary diff before and after; mutation, missing identity, or moving inputs produce `REVIEW-BLOCKED`.

An unknown provider, absent binding, same-provider peer, uncertified target, unavailable transport, or incomplete evidence is `REVIEW-BLOCKED`. Never impersonate a peer or downgrade the requirement silently.

## Role boundary

Review product code, product tests/stories, product configuration, use of installed public design-system APIs, exact-version upgrade effects, and product canary evidence.

Do not edit anything. Do not authorize or perform design-system canonical changes, template/governance corpus changes, package publication, release/promotion, privileged GitHub changes, deep-audit remediation, or fleet rollout. If a finding belongs upstream, identify the owner and provide a minimal reproduction; leave the upstream change to the DS-author workflow.

## Workflow

1. Classify the target as a product consumer from committed evidence. Otherwise return `ROLE-BLOCKED`.
2. Build one neutral brief containing the frozen inventory, criteria, artifact digests, and explicit questions. Exclude all author conclusions.
3. Resolve and freeze the highest certified distinct capability, then dispatch through its registered adapter/transport. Require provider, exact profile/model release, entitlement where applicable, context, transport, target-certification, selection receipt, and input-digest evidence.
4. Require the peer to inspect the full declared scope, cite path/line or runtime artifacts, report counterexamples and uncertainty, and remain read-only.
5. Validate the returned identity, certification, digests, coverage, and before/after fingerprints before reading the verdict.
6. Reproduce each material claim against the frozen source. Classify it as verified, false, partial, or evidence-blocked; never resolve disagreement by vote.
7. Emit the evidence record described in [references/evidence-contract.md](references/evidence-contract.md). Suggestions remain text only.

Return `PASS`, evidence-backed findings, `ROLE-BLOCKED`, or `REVIEW-BLOCKED`. A local unbrokered opinion may be useful, but label it `LOCAL-REVIEW-ONLY`; it cannot satisfy a required independent-review gate.
