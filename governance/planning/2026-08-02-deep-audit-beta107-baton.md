<!-- Authority/status: governance/planning/registry.json -->
# Deep Audit beta.107 → beta.108 incident active baton — 2026-08-02

> **ACTIVE / NOT A FINAL VERDICT.** This is the cross-session continuation ledger for the
> current Deep Audit. Machine state, exact Git readback, and
> `infra/governance/release-workflow.json` override prose if they differ.

## Authority and hard constraints

- Engineering, governance, Git, PR, required-CI remediation, merge, release, readback, and
  exact-version consumer upgrades are `AUTO`. Ask only for a genuinely unresolved product/UI/UX
  SSOT choice. Human-only runtime boundaries remain login/MFA/OAuth/credential reference.
- No unresolved UI/UX decision currently blocks this campaign. The approved DataTable/Empty
  recommendations may be implemented. The mode-discriminated controlled-only public type
  prototype was deliberately reverted and must not be shipped without a separate decision.
- This run has an explicit one-run second-opinion waiver from the user. Its exact receipt is
  `second opinion: waived by user`.
- A Deep Audit must finish remediation and candidate verification before publication. beta.107 was
  the one ordinary final release. Its post-publish formal prepare exposed a release-blocking SSOT
  contradiction in the audit harness and a stale shipped cross-agent workflow. The exact incident
  record below authorizes one additional beta.108 release; do not publish any intermediate version.

## Post-publish blocker incident

- `incidentId`: `DA-2026-08-02-FORMAL-AUDIT-SSOT`
- `failureClass`: `post-publish-blocker`
- `publishedVersion`: `0.1.0-beta.107`
- `evidenceRef`: this baton's `Observed evidence` list

Observed evidence:

- Formal prepare rejected beta.107 because the governed Node pre-script argv lacked the required
  `--` sentinel and the Storybook test-only harness was absent from the canonical inventory.
- The user-waived run had no executable self-review import route even though prepare and verifier
  required that evidence.
- CI dimensions 64/66 still depended on `candidateRelease`, external activation, and offline
  completion-attestor ceremony that the standard five-step release SSOT explicitly retired or made
  non-blocking.
- The beta.107 republish gate now correctly rejects the shipped cross-agent skill change until a
  strictly newer immutable package version exists.

## Live Git state

- Branch: `codex/deep-audit-beta108-final`
- Current integration worktree on the originating host:
  `/private/tmp/ds-formal-prep-fix.rtMJdR/source` (convenience only; never authority)
- Released base: protected `origin/main@67b01dc2a92198cc0eab0e05a0faea2b8cbd3628`
- Always start with `git status --short`, `git rev-parse HEAD`, `git fetch origin main`, and
  `npm run release:status`; do not infer live state from this document's snapshot.

## Durable completed work

- Integrated remediation covers provider-neutral authority/runtime gaps, future-reserved hygiene
  contracts, RadioGroup/Tabs state coherence, M22 benchmark evidence-debt closure, Storybook
  anatomy/reader/test-only/content governance, reader guidance, and consumer/template/Netlify
  release safeguards.
- Knowledge Prune same-run phases 0–5 completed. Mechanical and semantic repository hygiene found
  zero tracked transient artifacts; the only future-reserved tracked surface is `.changeset/`, now
  bound to owner/purpose/activation/lifecycle. Forty-eight stale unreferenced runtime runs
  (~931.4 MiB) were moved recoverably to Trash; two valid runs were preserved.
- Formal beta.106 baseline evidence is historical only: deterministic 25 commands/24 receipts
  passed; Storybook had 213 story files, 981 exports, and 71 docs entries; visual audit covered 124
  scenarios x light/dark x md/lg = 496 with zero diff. A11y scanned 981/981 stories and found 5,034
  serious color-contrast nodes against the accepted 5,108-node baseline (74-node improvement, no
  regression). Do not relabel that debt as WCAG AA pass.
- Netlify authenticated L3 remains `UNOBSERVED` without a credential reference; L1/L2 passed. This
  does not authorize a fake PASS and does not block ordinary release unless a five-step action
  actually requires that credential.

## Remaining execution order

1. Finish the formal-audit SSOT repairs: typed user-waived self review, typed credential-gated
   `UNOBSERVED`, and CI 64/66 readback from the canonical five-step workflow rather than retired
   candidate/signature ceremony. Regenerate canonical projections once and run focused tests.
2. Bump the single version input from beta.107 to beta.108, regenerate, run all candidate gates once,
   and commit a clean frozen tree. No source change is allowed after the immutable run is prepared.
3. Prepare the run with `node scripts/prepare-deep-audit-run.mjs --self-provider codex --self-surface
   local --author-provider codex --self-runtime codex-desktop --second-opinion-waiver user
   --replace-active --json`; import the substantive 25-dimension/65-component self-attested review,
   execute 39 hook envelopes and all deterministic dimensions once. Netlify L3 without a credential
   reference must be recorded as typed `UNOBSERVED`, never PASS or a coverage gap.
4. Run `npm run release:auto` once for beta.108. It alone performs
   `pr-checks -> merge -> publish -> readback -> consumer`; remediate the same PR if required CI fails.
5. From that exact release tree, produce the standard five-step live CI evidence for dimensions
   64/66 and verify complete self-attested coverage. The explicit waiver keeps independent promotion
   ineligible; it must not turn complete coverage into a fabricated independent-review claim.
6. Final report must include the literal receipts below, all `UNOBSERVED` surfaces, exact release
   and Storybook URLs, PR/main/tag/npm/consumer readbacks, and the three mandatory self-improvement
   lines. Only then close this baton and mark its registry row `completed / executable:false` in a
   release-neutral governance/docs PR; beta.109 is forbidden.

## Required final receipts

```text
knowledge-prune: same-run complete
governance-coverage: same-run reconciled
second opinion: waived by user
```

## Completion condition

Completion is not "source fixed" or "PR opened". It requires beta.108's five release steps to read
complete, the exact protected-main formal Deep Audit to finish without fabricated evidence, and
this baton to be closed in `governance/planning/registry.json`.
