# Phase B — independent peer audit and reconciliation

## 1. Build the peer packet

Use the frozen Phase A inventory, rubric, user wording, repository identity, and primary evidence without including Phase A conclusions. The packet must include digests so the response can prove input equality.

Require the peer to:

- identify provider, model, context, and transport;
- run in a separate read-only context;
- cover the full inventory and every applicable rubric dimension without sampling;
- verify claims against source and actual runtime artifacts;
- report complete per-dimension coverage, including zero-finding evidence;
- return findings, counterexamples, uncertainty, and literal verification results.

Use the transport contract in the cross-provider collaboration workflow. An unavailable or unverified transport produces `REVIEW-BLOCKED`.

## 2. Validate the response

Before considering conclusions, verify:

1. author, primary, and peer provider identities are explicit; the author equals the bound primary and the peer differs from both;
2. inventory and rubric digests match;
3. context isolation and read-only enforcement are evidenced;
4. worktree fingerprints are unchanged;
5. every required dimension and inventory partition is accounted for;
6. every material claim has primary evidence.

Reject partial, mutated, same-provider, framed, or identity-free responses.

## 3. Reconcile independently

For each primary and peer finding:

1. locate the governing canonical owner;
2. reproduce the claimed source/runtime fact;
3. scan counterexamples across the full relevant inventory;
4. classify it as verified, false, partial, or evidence-blocked;
5. preserve disagreements rather than resolving them by vote.

Use this comparison record:

```markdown
| Decision axis | Primary claim + evidence | Peer claim + evidence | Independent verification | Final state |
|---|---|---|---|---|
| <axis> | <claim> | <claim> | <artifact> | accept-primary / accept-peer / synthesize / blocked |
```

## 4. Complete the audit

Return author, primary, and peer provider identities, matching input digests, both coverage ledgers, verified overlaps, findings unique to each pass, rejected claims, unresolved disagreements, authorization decisions, final verification artifacts, and residual risk. Never describe a single-provider, author/peer collision, or incomplete run as independent review.
