<!-- Authority/status: governance/planning/registry.json -->
# Deep Audit beta.107 active baton — 2026-08-02

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
- A Deep Audit must finish remediation and candidate verification before publication. It gets one
  ordinary final release only. beta.107 is that release; do not publish an intermediate version.

## Live Git state

- Branch: `codex/deep-audit-beta107-final`
- Current integration worktree on the originating host:
  `/private/tmp/ds-beta107-final.Integrate` (convenience only; never authority)
- Base: protected `origin/main@54d317ef18291156f21bfef35d8bcd34b8598afb`
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

1. Integrate the approved DataTable single-column/Empty loading remediation commit, then regenerate
   canonical projections once. Do not add a new public loading component if existing accessible
   `CircularProgress` composition closes the contract without geometry change.
2. Run focused combined checks, then the canonical candidate gates once (not once per commit):
   content audit, Storybook test-only semantics, citation hook tests, DS/stories/storybook-config
   typechecks, `governance:generate`, `governance:check`, and `git diff --check`.
3. Change the version input in `packages/design-system/package.json` from beta.106 to beta.107,
   run `npm run governance:generate`, verify synchronized manifests/locks, and commit.
4. Run `npm run release:auto`. It alone performs
   `pr-checks -> merge -> publish -> readback -> consumer`; remediate the same PR if a required
   check fails. Do not add candidate/soak/signature/activation ceremony.
5. From a clean checkout of the exact protected beta.107 main tree, prepare the immutable formal
   run with `node scripts/prepare-deep-audit-run.mjs --self-provider codex --self-surface
   local --author-provider codex --self-runtime codex-desktop --second-opinion-waiver user
   --replace-active --json`; execute/check the deterministic plan with the required build/network/
   published-release capability flags, rerun full a11y and 496-scenario visual evidence, and finish
   the judgment/governance coverage ledger. Never reuse beta.106 receipts as beta.107 receipts.
6. Final report must include the literal receipts below, all `UNOBSERVED` surfaces, exact release
   and Storybook URLs, PR/main/tag/npm/consumer readbacks, and the three mandatory self-improvement
   lines. Only then mark this registry row `completed / executable:false`.

## Required final receipts

```text
knowledge-prune: same-run complete
governance-coverage: same-run reconciled
second opinion: waived by user
```

## Completion condition

Completion is not "source fixed" or "PR opened". It requires beta.107's five release steps to read
complete, the exact protected-main formal Deep Audit to finish without fabricated evidence, and
this baton to be closed in `governance/planning/registry.json`.
