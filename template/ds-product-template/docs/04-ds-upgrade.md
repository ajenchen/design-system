# DS Upgrade Flow

Every consumer snapshot uses exact versions. An upgrade is a reviewed change to code, package lock,
governance material, provider adapters, and skills—not an install-time lookup of “latest”.

## Automated proposal

The design-system authority owns the five-step release SSOT. Its last step (`consumer`) reaches two
kinds of repository, and neither needs a Governance App environment:

- **This template repository** receives the exact published snapshot from the upstream release mirror
  as a normal protected-main PR.
- **Product repositories created from the template** receive upgrades through
  `.github/workflows/sync-design-system.yml`, an upstream-managed file that `sync-all` keeps current.

### Upgrade receiver (`sync-design-system.yml`)

When a release is published, the release orchestrator sends `repository_dispatch` with event type
`design-system-published` and `client_payload = { version, tag, commit }` to each product repository
registered for automatic delivery. GitHub runs this event only from the workflow on the default
branch, so the receiver must be on `main`. On a GitHub-hosted runner it:

1. validates the payload: `version` is one exact SemVer (no `latest`, range, or `v` prefix), `tag`
   equals `v<version>`, and `commit` is a lowercase 40-character SHA that the design-system tag
   actually points at;
2. installs the current lock with `npm ci --ignore-scripts`, then `npm audit signatures`;
3. runs `npm run sync-all -- --apply --to <version>` on a new branch `automation/design-system-<version>`;
4. commits the result and pushes only that branch.

It holds only `contents: write`, reads no secrets, and does not open the PR. GitHub does not run
workflows for a PR opened by the run's own `GITHUB_TOKEN`, so such a PR would never receive
`Verify consumer`. Instead the orchestrator opens `chore(ds): sync v<version>` from the pushed branch
with its own credential; if the branch arrives after the orchestrator has stopped waiting, its next
run (`npm run release:auto` in the design-system repository) opens it. Merging stays with the product repository.

A repository that the orchestrator does not dispatch to can send the same event itself and then open
the PR from `automation/design-system-X.Y.Z`:

```text
printf '%s\n' '{"event_type":"design-system-published","client_payload":{"version":"X.Y.Z","tag":"vX.Y.Z","commit":"<40-character commit of tag vX.Y.Z>"}}' \
  | gh api --method POST repos/<owner>/<repo>/dispatches --input -
```

Two limits. GitHub refuses workflow-file changes pushed with `GITHUB_TOKEN`, so when a release
changes `.github/workflows/**` the receiver stops before pushing; run that upgrade on a local terminal
(Manual proposal below). And the automated branch carries only the upgrade transaction: when
`ds-changes.json` lists entries for the versions crossed, check out the branch and run
`npm run ds:migrate` there before merging (see Manual proposal).

Every upgrade PR, automated or manual, must pass exactly one required context, `Verify consumer`, from `audit.yml`. That job performs
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

Before running the codemod, read `node_modules/@qijenchen/design-system/ds-changes.json` (every section after the old version up to the new one), then, before committing the version bump, run `npm run ds:migrate -- upgrade --root . --source apps/<app>/src` once with one `--source` per product app (it refuses to run over uncommitted files in those folders, and a stamp under `.git/` refuses the same from → to twice; outside a git top level there is no stamp, so do not run it again); it applies the mechanical renames and lists every entry's status with file:line, the action, and the spec section. Finish with `npm run typecheck`, `npm run lint:imports`, `npm run governance:check`, and `npm run build`.

Review all generated changes, run product CI, then open a PR. Mutable values such as `beta`, `latest`, `^0.1.0`, or `*` are rejected in a consumer release.

A release may also change protected control-plane paths (`.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`) or `package.json#scripts`. That no longer stops the ordinary flow: `GOV-UPGRADE-BOOTSTRAP-001/002` were retired on 2026-08-12 and now only print an `INFO` line. During the transaction only the scripts already on your protected `main` execute (the provider module loads from the protected-base sandbox); the incoming `scripts/**` and package scripts enter the PR diff as data, are reviewed with it, and run only in runs after the merge. The two IDs stay as stable compatibility names; they do not mean an established v2 consumer should repeat the one-time legacy bootstrap.

## Where to run an upgrade

This section answers the question「一般使用 ds template 的消費者也是用一樣的方式可以建置等價的雲端環境？」(asked by the design-system owner, 2026-11-26).

- **New consumers.** The release workflow upgrades the template repository automatically at every release, so a repository created from the template starts at the template's current version (0.1.0-beta.150 or later). Follow the README Setup script (with your own folder name) and set network access to Full; there is no version gate to cross.
- **Existing consumers at 0.1.0-beta.149 or older.** The first upgrade to 0.1.0-beta.150 runs the transaction scripts frozen on your own `main` (the older copies), not the ones fixed in 0.1.0-beta.150, and in a Claude Code cloud session those older scripts hit the certificate and proxy problems that 0.1.0-beta.150 fixed. Run that first upgrade on a GitHub runner (the receiver above) or on a local terminal; do not run `sync-all` inside a Claude Code cloud session. The receiver ships in a release after 0.1.0-beta.150, so an older repository adds it once by hand: copy `.github/workflows/sync-design-system.yml` byte-for-byte from the published template repository (before that release, from `template/ds-product-template/.github/workflows/sync-design-system.yml` on design-system `main`) into a PR on its `main`, merge it, then send the dispatch above.
- **After 0.1.0-beta.150**, later upgrades and `setup:all` can also run in a Claude Code cloud session 【AI 推導,待實測】: nobody has yet upgraded from 0.1.0-beta.150 to a newer release inside a cloud session.
- **Common conditions for a cloud session:** Node.js 22.15.0 or newer (the cloud image measured 22.23.5); network access set to Full; a proxy URL that carries credentials is not forwarded, by design. The README proxy and network notes have the details.

## Recurring reviewed control-plane updates

New template snapshots (`new-snapshot-v2`) and consumers that already completed legacy bootstrap (`reviewed-bootstrap-established-v2`) may use this route as an opt-in fleet hardening lane when a release changes a protected control-plane path or `package.json#scripts`; ordinary `sync-all` no longer requires it (see above). Run these commands in the **DS authority repository**, which owns inventory, release evidence, schemas, and `consumerctl`.

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
  --repo-id <legacy-consumer-id> \
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

`sync-all --apply` writes an atomic process-recovery journal, authenticates and reconstructs the incoming release's complete managed-file map, and classifies the exact add/modify/delete set before live mutation. An ordinary upgrade writes the permitted exact dependency changes, governance data, instructions, and provider views. Changes to `.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`, or `package.json#scripts` travel in the same change as data (an `INFO` line names each one; `GOV-UPGRADE-BOOTSTRAP-001/002` retired 2026-08-12): none of that incoming code runs during the transaction, and it takes effect only after the PR merges. For a permitted change, the journal snapshots every path the transaction may write **including the common instruction (`AGENTS.md`)** and atomically moves the original `node_modules` on the same filesystem. If install, materialization, or the post-upgrade hard check fails, it restores both tracked state and the original installed tree byte-for-byte. A later invocation also recovers safely after SIGKILL or abrupt process termination. Path-visible concurrent edits are revalidated and fail closed, but the upgrade must run while editors and other writers are quiesced: a non-cooperative process that retains an old open file descriptor is outside the pathname-CAS guarantee. This is process-crash recovery; physical storage/power-loss durability is not claimed because the workflow does not recursively `fsync` every package tree and directory entry.

That transaction is pre-merge recovery, not a way to republish or silently downgrade an already promoted release. If a bad snapshot has merged, keep the evidence, revert product-only changes when safe, fix the canonical source, and publish a strictly newer corrected DS release. Then open a normal exact upgrade PR:

```text
npm run sync-all -- --apply --to <newer-corrected-exact-version>
npm run governance:check -- --hooks-off
```

The upgrade client intentionally rejects version downgrade and one-package rollback. Do not hand-edit generated adapters/BOM or move npm dist-tags backward.

Next: `docs/05-troubleshooting.md`.
