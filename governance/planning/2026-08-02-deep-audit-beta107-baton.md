<!-- Authority/status: governance/planning/registry.json -->
# Deep Audit beta.107 → beta.108 closure record — 2026-08-02

> **CLOSED AS INCOMPLETE; THIS IS NOT A PASS.** The executable campaign is over because the
> immutable beta.108 release cannot acquire the two missing historical CI receipts without a new
> release identity. This record preserves the exact gap and the release-neutral canonical repair;
> it must never be used to claim complete Deep Audit coverage.

## Decision authority and UI/UX boundary

- Engineering, governance, Git, PR, CI, merge, release, readback, consumer propagation, and
  recoverable Knowledge Prune actions were `AUTO`.
- No unresolved UI/UX SSOT choice entered beta.108. The audit observed the existing `Tag` solid
  green + white contrast debt (2.47:1); changing that visual baseline still requires an explicit
  UI/UX decision, so this campaign did not alter it.
- The user waived second opinion for this run only. The waiver does not waive deterministic, hook,
  CI, Storybook-content, repository-hygiene, or knowledge-prune evidence.

## Immutable release result

- Design System PR: `ajenchen/design-system#37`
- Frozen PR head/tree: `31585bc75382a46a42213cafb3ce4eebbaccba61` /
  `003d5407b76a204ba7e651ca36b407bced72988b`
- Protected main, tag, and release commit: `70a56cc1e05ef0a2fd8b94415d01629203b2d49d`
- Version/tag: `0.1.0-beta.108` / `v0.1.0-beta.108`
- GitHub release: `https://github.com/ajenchen/design-system/releases/tag/v0.1.0-beta.108`
- Storybook: `https://ajenchen.github.io/design-system/`
- Exact six-asset release-set SHA-256:
  `a166f97a374181c1130d05e44d2375617bd967bee09fdbb064c9258adb109b60`
- The release record was recreated from the exact downloaded bytes after repository immutable
  releases were enabled. npm was not republished and beta.109 was not created.
- Work Management propagation PR `#34` merged beta.108; PR `#35` repaired stale consumer
  documentation/test readback. Protected main consumes the exact beta.108 package locks.

## Formal Deep Audit result

- Run ID: `15cad169-5c0f-4381-badd-106e48e5199b`
- Run manifest SHA-256:
  `ca8ca652396dfd63466cc69b9768334d7bc07f772949850d1dbb132f4a481631`
- Deterministic dimensions: complete, including typed dimension 83 `UNOBSERVED` with
  `NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT`.
- Hook envelopes: complete.
- Waived self review: imported; substantive findings remain findings, not promotion evidence.
- Knowledge Prune phases 0–5: complete. No tracked transient or redundant repository artifact was
  found; `.changeset/` is the only governed future-reserved surface. Forty-eight stale unreferenced
  runtime runs (~931.4 MiB) were moved recoverably to Trash and two valid runs were retained.
- Coverage status: `incomplete`. The only gaps are CI dimensions 64 and 66; deterministic,
  judgment, and hook gap lists are empty. `promotionEligible` remains `false`.

## Why dimensions 64 and 66 cannot be backfilled

The frozen SSOT declared the product consumer `Verify consumer` producer as `audit.yml` on
`repository_dispatch`, but the exact governed `audit.yml` accepts only `push` and `pull_request`.
The beta.108 receiver instead emitted a custom check from `sync-design-system.yml`; its check did
not bind an Actions-run `details_url`. Later PR #35 produced a real `audit.yml` `pull_request` check,
but it is not the frozen protected-base dispatch receipt and its PR binding is not the beta.108
propagation identity. A new dispatch is always attached to the then-current default-branch head, so
it cannot recreate the historical PR base. Treating either artifact as PASS would fabricate
provenance.

## Canonical repair for the next release identity

This release-neutral closure makes the five-step workflow fail closed without adding ceremony:

- ordinary product required checks truthfully bind `audit.yml` + `pull_request`;
- the Work Management release receiver remains protected-base `sync-design-system.yml` +
  `repository_dispatch`, but its same-name receipt must bind the current Actions run, PR head, and
  PR base exactly;
- release automation verifies the check App, producer workflow/event/head, exact version and
  release commit before merging a consumer PR;
- repository immutable releases are canonical desired state, are enabled before publish, and a
  published GitHub Release is incomplete unless `isImmutable=true`;
- the normal path remains exactly `pr-checks → merge → publish → readback → consumer`; no candidate,
  offline-signature, soak, external-activation, or extra-release loop is restored.

These repairs govern future releases. They do not mutate beta.108 evidence and do not authorize
beta.109.

## Required receipts

```text
knowledge-prune: same-run complete
governance-coverage: same-run reconciled
second opinion: waived by user
```

`governance-coverage: same-run reconciled` means the same-run ledger and its two exact gaps are
reconciled and recorded; it does **not** mean coverage is complete.

## Self-improvement capture

- New false-positive pattern: none; the CI failure was a real producer/event contradiction.
- New meta-pattern: a required-check name is not evidence; release SSOT must bind App + Actions run
  + workflow + event + PR head/base.
- Corrected contradiction: immutable-release and consumer-check provenance now live in the
  canonical five-step release workflow, desired GitHub model, validators, and regression tests.
