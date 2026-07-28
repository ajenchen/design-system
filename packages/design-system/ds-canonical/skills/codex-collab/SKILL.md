---
name: codex-collab
description: Provider-neutral workflow for evidence-complete collaboration with a genuinely independent peer; use when a second opinion or adversarial comparison is required.
---

# Cross-provider collaboration workflow

This file owns workflow meaning only. Provider identity, peer selection, transport, commands, and discovery paths are adapter bindings. Read `references/brief-template.md` for the shared input contract and `references/transport.md` for admissible transport evidence.

## Preconditions

- The primary provider and independent peer provider are explicitly identified and different.
- A real external or orchestrator transport is available; a same-provider subprocess, alias, or subagent is not independent.
- Both providers receive the same user wording, inventory, evidence, constraints, and decision rubric.
- The peer is always discussion/review-only and receives no mutation authority. Implementation stays in the primary context under Standing Authorization and hard gates; only a genuine product/UI/UX SSOT tradeoff routes to the user.

## Workflow

1. Capture the user's request verbatim and assemble an evidence-complete brief with scope, primary files, constraints, unknowns, and required output.
2. Complete the primary analysis before seeing the peer conclusion. Cite primary evidence and state uncertainty.
3. Dispatch the same neutral brief through the provider binding. Retain provider/model/transport identity and an artifact digest.
4. Verify every material peer claim against primary files or cited evidence. Do not accept labels, comments, or generated prose as proof.
5. Compare both results by decision axis, preserve disagreements, and synthesize only conclusions supported by evidence.
6. Run the same deterministic verification on both proposed outcomes. Implementation remains in the primary context and follows normal authorization and hard gates.

## Fail closed

Unavailable transport, same-provider execution, framed or incomplete evidence, missing identity, or unverifiable claims produce `REVIEW-BLOCKED`. Never infer or fabricate an independent opinion.

## Output evidence

Record the primary and peer identities, transport, brief digest, artifact digest, verified agreements, unresolved disagreements, and verification results.
