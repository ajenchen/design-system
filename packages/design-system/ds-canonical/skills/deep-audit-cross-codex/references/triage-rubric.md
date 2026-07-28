# Triage and convergence rubric

## Human-owned product decisions

Stop and request a decision only when a proposed change creates a genuine unresolved product／UI／UX SSOT choice, including user-visible behavior, information architecture, interaction model, UI pattern, component or copy semantics, visual language, or another user-visible trade-off. Explain the evidence, viable options, trade-offs, recommendation, and downstream propagation in plain language.

## Standing-delegated engineering decisions

Architecture, canonical governance policy implementation, ownership wiring, release trust, security boundaries, provider capabilities, adapters, CI/CD, migration, release, rollout, rollback, and failure remediation are engineering decisions. Resolve them autonomously under the canonical Standing Authorization using evidence, independent review, hard gates, least privilege, readback, and recovery. Examples also include implementation drift back to an existing contract, broken pointers, deterministic generated-view regeneration, tests that enforce an unchanged rule, dead code, typos, or behavior-preserving refactors. Verification remains mandatory.

## Finding materiality

Adversarially reproduce every raw finding before action:

| Class | Meaning | Action |
|---|---|---|
| material | user, contract, accessibility, security, release, or verified regression impact | route genuine product／UI／UX choices to the user; remediate engineering findings under Standing Authorization |
| marginal | preference or wording with no material effect | record without churn |
| false positive | source or an applicable exception disproves the claim | reject with evidence |
| evidence-blocked | required source/runtime evidence is unavailable | retain blocker; never call PASS |

## Convergence

Stop iterative generative review when a complete pass, followed by adversarial verification, yields zero material findings and zero regressions. Do not chase stylistic zero and do not stop while inventory, rubric, identity, isolation, or deterministic verification is incomplete.

The final report must include input digests, per-dimension coverage for both providers, verified findings, rejected findings, unresolved decisions, corrections made, exact verification artifacts, and residual risk.
