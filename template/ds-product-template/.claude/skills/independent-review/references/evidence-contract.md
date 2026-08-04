# Independent-review evidence contract

Use the transport selected by the generated provider binding. Do not invent a provider command, copy credentials into the repository, or create a second evidence schema.

The model-broker execution layer (evidence broker, shard/transcript carriers, model runner, managed-CI executors) was retired 2026-08-04; broker or managed receipts are permanently rejected. The surviving authority-owned contract surfaces are `scripts/lib/deep-audit-evidence-contract.mjs` (waived self-review and entitlement review-lane validation) and `scripts/lib/model-api-transport.mjs` (pure invocation-profile and response-substitution contract). A product reviewer consumes their validated receipt but never edits, publishes, or executes authority release controls. If a validated receipt is unavailable, use `LOCAL-REVIEW-ONLY` or `REVIEW-BLOCKED`, never managed or certified evidence.

A caller-supplied JavaScript callback, a self-declared model string, or structurally valid result
JSON is not transport attestation and can never yield `REVIEW-VALIDATED`. An independent-review
claim requires the entitlement review lane: a resolved provider binding whose peer, profile, and
entitlement readback are certified for the exact target, with response substitution fail-closed.
Without that binding the only honest outcomes are the waived self-review route (recorded waiver,
self-attested coverage, `unverifiedModelCoverage` visible) or `REVIEW-BLOCKED`.

Emit one closed review record in the response with:

- outcome and evidence class;
- author/current/peer provider, model release, context, transport, and exact target-certification identity;
- repository, head, tree, diff, inventory, rubric, brief, and peer-output digests;
- before/after worktree fingerprints and mutation verdict;
- complete scope coverage, verified findings, rejected claims, unresolved disagreements, and unavailable evidence;
- explicit role-boundary confirmation: no files, Git state, comments, external systems, releases, or upstream canonical sources were mutated.

Missing fields or digest mismatch produce `REVIEW-BLOCKED`. The record is evidence about a review, not authorization to change or release anything.
