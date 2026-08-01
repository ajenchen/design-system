# DS Upgrade Flow

Every consumer snapshot uses exact versions. An upgrade is a reviewed change to code, package lock,
governance material, provider adapters, and skills—not an install-time lookup of “latest”.

## Automated proposal

The design-system authority owns the five-step release SSOT and mirrors the exact published snapshot
into this template repository through a normal protected-main PR. The template intentionally carries
no second release-dispatch/updater workflow and requires no Governance App environment.

The PR must pass exactly one required context, `Verify consumer`, from `audit.yml`. That job performs
one `npm ci --ignore-scripts` followed by typecheck, import-boundary lint, and build. Review
conversations and protected-main exact readback remain required. Preview, a11y, visual, canary, fleet,
and independent-review evidence are optional or scheduled unless explicitly requested and never
block the standard release path by default.

## Fleet onboarding

Creating a repository from this template supplies the release-bound `new-snapshot-v2` baseline. Ordinary consumers need nothing more than `setup:all`, protected CI, and ordinary `sync-all` upgrades. Fleet registration is the opt-in coordination lane: a maintainer produces a closed `consumerctl plan-registration` proposal in the DS authority repository, `check-registration` reproduces the exact proposal from current inventory, role policy, and rings, and both after-images are reviewed together in one protected DS PR.

Once registered, the consumer participates in the same fleet path as every other registered opt-in product repository. `plan-fanout --to <exact-version>` enumerates every registered product consumer, but produces dispatches only for the current ring/wave entries that bind the immutable candidate, have no manual blocker, fit the parallel budget, and do not require legacy bootstrap. It explicitly records that unregistered public-template descendants are not globally observable and never claims global template-lineage completeness. `check-fanout` rejects stale or substituted plans. `apply-fanout` requires the reviewed plan digest, derives every GitHub endpoint from inventory, writes an atomic receipt under `infra/governance/runtime/consumer-fleet`, and records dispatch acceptance as unverified—not as workflow, PR, check, merge, or rollout completion. The signed-readback ceremony is part of this opt-in fleet lane, never a gate on ordinary consumer upgrades. Consumers outside the managed GitHub owner still receive the same self-service template/setup/checker contract, but require an explicit federated opt-in before this authority can claim fleet control over them.

## Manual proposal

Planning is read-only:

```text
npm run sync-all -- --to X.Y.Z
```

This plan validates only the target syntax. It deliberately exits non-ready with `ok=false`,
`targetVerification=deferred`, `targetVerified=false`, and `ready=false`; it does not prove that the
release exists. The guarded apply transaction performs immutable-release, Release BOM, npm
provenance, and signature verification before any live mutation and fails closed when the target is
missing or invalid.

Apply on a clean upgrade branch:

```text
git checkout -b governance/upgrade-0-1-0-beta-94
npm run sync-all -- --apply --to X.Y.Z
npm run governance:check -- --hooks-off
```

Review all generated changes, run product CI, then open a PR. Mutable values such as `beta`, `latest`, `^0.1.0`, or `*` are rejected in a consumer release.

If the plan changes a protected control-plane path or any package script, stop the ordinary flow and use the recurring reviewed control-plane route below. This is intentional: an updater may not automatically replace the workflow/verifier that grants its next update authority. The historical `GOV-UPGRADE-BOOTSTRAP-001/002` identifiers remain stable compatibility IDs; they do not mean an established v2 consumer should repeat the one-time legacy bootstrap.

## Recurring reviewed control-plane updates

New template snapshots (`new-snapshot-v2`) and consumers that already completed legacy bootstrap (`reviewed-bootstrap-established-v2`) use the same recurring route whenever a release changes a protected control-plane path or `package.json#scripts`. Run these commands in the **DS authority repository**, which owns inventory, release evidence, schemas, and `consumerctl`; do not expect the consumer checkout to self-authorize its own updater replacement.

The route is a six-stage, full-tree protocol:

```text
npm run governance:control-plane:plan -- <source flags> --json
npm run governance:control-plane:materialize-reviewed -- <source flags> --plan-file <plan.json> --expected-plan-digest <sha256> --output <fresh-directory>
npm run governance:control-plane:check-materialization -- <source flags> --plan-file <plan.json> --expected-plan-digest <sha256> --materialized-root <fresh-directory>
npm run governance:control-plane:check-readback -- <source flags> --plan-file <plan.json> --expected-plan-digest <sha256> --materialized-root <fresh-directory> --readback <signed-readback.json>
npm run governance:control-plane:plan-acceptance -- <source flags> --plan-file <plan.json> --expected-plan-digest <sha256> --materialized-root <fresh-directory> --readback <signed-readback.json>
npm run governance:control-plane:check-acceptance -- <source flags> --plan-file <plan.json> --expected-plan-digest <sha256> --materialized-root <fresh-directory> --readback <signed-readback.json> --proposal <acceptance-proposal.json>
```

The source flags are the exact `--repo-id`, `--root`, `--base`, `--incoming`, `--release-bom`, and `--required-checks-digest` inputs used for the reviewed plan. Materialization writes only a new non-existing snapshot and never executes candidate code. The independent readback binds the protected PR/merge, immutable candidate and BOM, complete current/base/incoming roots, materialized tree, every implementation/schema digest, the shared protected-path policy, sequence number, and predecessor readback. Acceptance only emits a closed inventory proposal. There is no live-checkout apply or inventory-apply command.

The first accepted update moves a new-template consumer to `new-snapshot-control-plane-established-v2`, or preserves legacy-bootstrap lineage as `reviewed-bootstrap-control-plane-established-v2`. Later updates must extend the exact accepted readback hash with sequence +1; stale, replayed, or cross-profile evidence fails closed.

## Existing consumers before protected-base reconstruction v2

An older consumer cannot safely use its own old updater or workflow to cross this trust-boundary change. The first transition is a one-time, separately reviewed full-snapshot bootstrap PR. The DS authority has six explicit commands for this path; none can apply to a live consumer checkout. The materializer writes only to a new, non-existing output directory, and the promotion commands produce a proposal rather than changing inventory.

Every source-aware bootstrap command re-reads the exact inventory bytes and derives the immutable candidate only from `release-rings.json`. It requires `--repo-id`, `--root`, `--base`, `--incoming`, `--release-bom`, and `--required-checks-digest`; unknown or duplicate flags fail closed. Start by creating the review plan:

```text
npm run governance:bootstrap:plan -- \
  --repo-id work-management \
  --root <consumer-checkout> \
  --base <last-trusted-consumer-snapshot> \
  --incoming <candidate-full-snapshot> \
  --release-bom <candidate-release-bom.json> \
  --required-checks-digest <sha256> \
  --json
```

After independent engineering review under the canonical standing delegation, use `governance:bootstrap:materialize-reviewed` with the same source flags plus `--plan-file`, `--expected-plan-digest`, and a fresh `--output`. Recheck that output with `governance:bootstrap:check-materialization`. After the protected PR merges and an independent signer produces `consumer-governance-bootstrap-readback-v1`, run `governance:bootstrap:check-readback`, then `governance:bootstrap:plan-promotion`, and finally `governance:bootstrap:check-promotion`; the last three re-read the same source roots and additionally require the reviewed plan, exact plan digest, materialized root, and signed readback. The final check also requires the promotion proposal. There is deliberately no `apply-bootstrap` or `apply-promotion` command.

The one-time bootstrap ends with the reviewed full-snapshot PR merging on the consumer's protected `main`; after that, ordinary `sync-all` proceeds normally. The signed-readback / promotion ceremony (`check-readback` → `plan-promotion` → `check-promotion`) is the opt-in fleet-inventory hardening lane on top of that merge — it moves the consumer to the distinct `reviewed-bootstrap-established-v2` inventory profile and content-addresses the exact readback, and it must never relabel a legacy consumer as `new-snapshot-v2`. New repositories created from a release-bound v2 template enter through the new-snapshot profile and do not impersonate this legacy bootstrap.

## Failed upgrade and rollback

`sync-all --apply` writes an atomic process-recovery journal, authenticates and reconstructs the incoming release's complete managed-file map, and classifies the exact add/modify/delete set before live mutation. An ordinary upgrade writes only the permitted exact dependency changes plus non-executable governance data, instructions, and provider views. If reconstruction detects `.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`, or `package.json#scripts` drift, it fails closed with the recurring reviewed control-plane route (or the one-time bootstrap route for a still-legacy profile) and does not partially activate that release. For a permitted ordinary change, the journal snapshots every path the transaction may write **including the common instruction (`AGENTS.md`)** and atomically moves the original `node_modules` on the same filesystem. If install, materialization, or the post-upgrade hard check fails, it restores both tracked state and the original installed tree byte-for-byte. A later invocation also recovers safely after SIGKILL or abrupt process termination. Path-visible concurrent edits are revalidated and fail closed, but the upgrade must run while editors and other writers are quiesced: a non-cooperative process that retains an old open file descriptor is outside the pathname-CAS guarantee. This is process-crash recovery; physical storage/power-loss durability is not claimed because the workflow does not recursively `fsync` every package tree and directory entry.

That transaction is pre-merge recovery, not a way to republish or silently downgrade an already promoted release. If a bad snapshot has merged, keep the evidence, revert product-only changes when safe, fix the canonical source, and publish a strictly newer corrected DS release. Then open a normal exact upgrade PR:

```text
npm run sync-all -- --apply --to <newer-corrected-exact-version>
npm run governance:check -- --hooks-off
```

The upgrade client intentionally rejects version downgrade and one-package rollback. Do not hand-edit generated adapters/BOM or move npm dist-tags backward.

Next: `docs/05-troubleshooting.md`.
