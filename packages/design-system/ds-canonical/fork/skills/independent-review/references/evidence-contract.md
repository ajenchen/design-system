# Independent-review evidence contract

Use the transport and evidence broker selected by the generated provider binding. Do not invent a provider command, copy credentials into the repository, or create a second broker schema.

When managed broker evidence is requested, accept it only after the existing content-addressed broker and deep-audit evidence validators have accepted the exact receipt. The authority-owned implementations are `infra/governance/model-evidence-broker.json`, `scripts/lib/model-evidence-broker.mjs`, and `scripts/lib/deep-audit-evidence-contract.mjs`; a product reviewer consumes their validated receipt but never edits, publishes, or executes authority release controls. If that validated receipt is unavailable, use `LOCAL-REVIEW-ONLY` or `REVIEW-BLOCKED`, never managed or certified evidence.

The shipped product launcher is deliberately plan-only. A caller-supplied JavaScript callback, a
self-declared model string, or structurally valid result JSON is not transport attestation and can
never yield `REVIEW-VALIDATED`. Every carrier must use the canonical
`content-addressed-model-broker-exchange-v1` exporter/importer and its exact selection, request,
result, coverage, and reduction receipts. Managed broker execution is an optional deployment
wrapper over that same exchange core; only its independently verified runtime/attestation evidence
can upgrade a structural reduction to managed or promotion-eligible evidence.

Emit one closed review record in the response with:

- outcome and evidence class;
- author/current/peer provider, model release, context, transport, and exact target-certification identity;
- repository, head, tree, diff, inventory, rubric, brief, and peer-output digests;
- before/after worktree fingerprints and mutation verdict;
- complete scope coverage, verified findings, rejected claims, unresolved disagreements, and unavailable evidence;
- explicit role-boundary confirmation: no files, Git state, comments, external systems, releases, or upstream canonical sources were mutated.

Missing fields or digest mismatch produce `REVIEW-BLOCKED`. The record is evidence about a review, not authorization to change or release anything.
