# Runtime evidence retention canonical

This policy owns the lifecycle of mutable audit, rollout, and review evidence below
`<absolute-git-dir>/governance-runtime/evidence/`. That evidence supports current operations; it is
not product authority, a permanent archive, or a reason to keep every attempted run forever. The
"Workspace runtime" section separately covers two disposable classes in the working-tree runtime
directory `infra/governance/runtime/`.

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

## Typed unobserved deterministic coverage

The credential-gated published-live-deploy dimension may be recorded as `UNOBSERVED` only when
both accepted credential references, `NETLIFY_LIVE_BASIC_AUTH` and `NETLIFY_PREVIEW_PASSWORD`, are
absent or empty. The canonical recorder is:

```text
node scripts/run-deterministic-deep-audit.mjs --record-unobserved=NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT --dims=83
```

The closed receipt records the exact reason and empty observed-reference set. It contains no
deployment command observations or sandbox receipt and never claims PASS. If either reference is
present but unusable, execution must fail closed rather than reclassify it as absent.

A valid typed `UNOBSERVED` receipt closes enumeration coverage only. It adds a trust downgrade,
keeps compliance blocked and `promotionEligible=false`, and remains visible in verifier output.
The verifier's default exit gate requires promotion eligibility. An explicitly authorized
single-provider or self-attested audit may use `--require coverage`, which exits successfully only
when every expected evidence artifact validates and `coverageStatus=complete`; it does not suppress
findings or upgrade compliance/release authority.

## Workspace runtime (`infra/governance/runtime/`)

`infra/governance/runtime/` is a second runtime directory, inside the working tree. Its own
`.gitignore` ignores everything except itself, so nothing written there is tracked, portable, or
authority. The whole-run rules above are written for the Git-owned evidence root and grant no
cleanup here. This section covers exactly two disposable classes. Every other file in the directory
keeps the lifecycle its writer defines (for example the reconcile journal, consumer-fleet receipts,
the all-harness receipt, and provider runtime-conformance staging evidence); this section grants no
cleanup for those, and a sweep reports their names and bytes as unclassified instead of deleting
them.

| Class | Writer | Keep | Delete (whole files only) |
|---|---|---|---|
| Workflow-identity review proposal | `npm run governance:workflow-identities:propose -- --output <file>` | while it can still be applied: its `sourceRevision` equals the current `HEAD` commit and tree, **and** its `desired.beforeSha256` equals the SHA-256 of the current `infra/governance/desired/github.json` | as soon as either binding stops matching; `applyReviewedWorkflowIdentityProposal` refuses such a file anyway. A successful apply rewrites `desired/github.json`, so every applied proposal lands here. Also any leftover `.*.tmp` from an interrupted proposal write |
| Benchmark cache, `benchmarks/` | `bash governance/benchmarks/fetch.sh` | the newest copy of each fetched file plus `last-fetch.txt`; `fetch.sh` already replaces each file in place | leftover `*.tmp` files, any dated or duplicate copy `fetch.sh` does not write, and `last-failure.jsonl` once `last-fetch.txt` is later than the `ts` of its last row (the newest run then succeeded completely) |

Identify a proposal by its content (`"kind": "workflow-identity-review-proposal"`), not by its file
name: `--output` accepts any name below the directory.

**Who deletes.** The agent that wrote a proposal deletes it right after
`governance:workflow-identities:apply-reviewed` succeeds, or when it abandons the change. A full/deep
audit and knowledge-prune D10 sweep whatever is left with the same rules, as step 6 of the procedure
below.

**No partial deletion.** A proposal is exact canonical bytes bound to its `proposalDigest`; editing
or trimming it makes it unparseable, not smaller. Delete whole files only: never trim rows out of
`last-failure.jsonl` and never rewrite a proposal.

**No automatic reclaimer, on purpose.** Re-running `--propose` on the current `HEAD` regenerates a
deleted proposal and `fetch.sh` regenerates a deleted benchmark file, so a missed cleanup costs disk
space, not evidence. A cleanup script would add one more writer to maintain without protecting
anything.

## Deep-audit and prune procedure

A full/deep audit and knowledge-prune D10 must:

1. report bytes by evidence class and run;
2. validate the active pointer against the current target;
3. enumerate direct references from rollout, release, readback, journals, and receipts;
4. classify every observed run as preserved or whole-run reclaimable with its reason;
5. autonomously perform high-confidence recoverable cleanup, then verify the remaining roots;
6. classify every file below `infra/governance/runtime/` under "Workspace runtime", report its bytes
   separately from the Git-owned evidence root, delete the whole files that section marks as
   deletable, and list the rest as unclassified.

Repository hygiene reports this ignored runtime separately from Git worktree topology. Git-tracked
fixtures, baselines, release provenance, and archives continue to follow their owning policies and
must not be mistaken for reclaimable runtime evidence.
