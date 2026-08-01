# Runtime evidence retention canonical

This policy owns the lifecycle of mutable audit, rollout, and review evidence below
`<absolute-git-dir>/governance-runtime/evidence/`. That evidence supports current operations; it is
not product authority, a permanent archive, or a reason to keep every attempted run forever.

## Scope and unit of retention

Resolve the evidence root from the repository's absolute Git directory. Each linked worktree may
have a different root and must be observed independently. Missing worktree-local evidence is
**unobserved**, not PASS, and portable audit/release claims must not depend on ignored local state.

The atomic retention unit is a complete run directory. A portable review bundle includes its exact
artifact topology and content-addressed store (CAS); never delete individual leaves, blobs, task
descriptors, or other bundle members. Partial CAS pruning creates corrupt evidence rather than
useful space savings.

## Preserve roots

Preserve a complete run when any one of these conditions holds:

1. the current active-run pointer validates against the current frozen target;
2. a live staged-rollout, release, readback, in-flight journal, or other operational record directly
   references the run or one of its receipts;
3. the run contains a genuine cross-provider review archive;
4. the run contains an unexpired pass/closure receipt, together with every artifact required to
   validate that receipt.

A pointer that no longer validates against the current target is stale, not an active preserve
root. Repair or clear that pointer before classifying its former target.

## Autonomous whole-run reclamation

After enumerating preserve roots and direct references, the agent may reclaim the following
complete run directories without user approval:

- unreferenced `REVIEW-BLOCKED` runs with no selected peer and no genuine review;
- unreferenced failed or abandoned runs;
- stale-target runs with no genuine review and no unexpired receipt;
- superseded incomplete runs that are not referenced by a live operation.

Cleanup should be recoverable when the runtime permits it. Re-run pointer/reference validation
after cleanup. Do not add a bespoke approval gate, signing step, receipt ceremony, or general GC
framework: this is lifecycle-based engineering maintenance under standing authorization.

## Lazy portable-review materialization

`REVIEW-BLOCKED`, peer-null, and review-waived outcomes retain only their compact selection,
blocked, or waiver evidence. They must not materialize a full portable review bundle.

A full bundle may be built only after a peer capability selection and dispatch schedule are frozen,
immediately before the existing dispatch/archive path needs it. Repeated attempts for the same
frozen target should reuse existing valid immutable evidence rather than create parallel copies.

## Deep-audit and prune procedure

A full/deep audit and knowledge-prune D10 must:

1. report bytes by evidence class and run;
2. validate the active pointer against the current target;
3. enumerate direct references from rollout, release, readback, journals, and receipts;
4. classify every observed run as preserved or whole-run reclaimable with its reason;
5. autonomously perform high-confidence recoverable cleanup, then verify the remaining roots.

Repository hygiene reports this ignored runtime separately from Git worktree topology. Git-tracked
fixtures, baselines, release provenance, and archives continue to follow their owning policies and
must not be mistaken for reclaimable runtime evidence.
