# @qijenchen/governance

Node 22 control plane for the provider-neutral **DS-author** repository, with exact-pinned JSON Schema validation. It materializes provenance-bearing snapshots from canonical source pointers, verifies them without modifying the repository, normalizes provider hook events, and produces digest-bound evidence manifests and safe upgrade plans.

This package is infrastructure, not a second home for design-system rules. `canonical/manifest.json` points at the existing owners: `AGENTS.md` plus the publishable provider-neutral tree at `packages/design-system/ds-canonical/**`. `.claude/**`, `.agents/**`, and native hook configs are deterministic adapter views; generated artifacts contain paths and digests, never a second copy of mutable policy meaning.

## Control-plane invariants

### Generated artifacts are read-only

Files below the manifest's `outputDirectory` and the manifest's `lockFile` are generated views. Providers must not edit them directly. Change the canonical owner, regenerate, and review the resulting snapshot. The default layout is `governance/generated/**` plus `governance/control-plane.lock.json`; this deliberately cannot collide with the product consumer BOM at `governance/lock.json`.

### Snapshots are exact

`check` builds the expected snapshot in an OS temporary directory, then recursively compares the file set, type, content hash, and executable mode. It never repairs drift or writes into the target repository.

### Provider outcomes are equivalent

Claude, Codex, and generic automation use different bindings from the single `canonical/providers.json` registry but resolve to the same normalized operation and canonical rule IDs. Shared skills are compared recursively from `ds-canonical/skills` to every declared provider target after applying the manifest projection, so neither provider owns workflow meaning. Native hooks are feedback accelerators; the hook-independent `check`/`doctor` CI gates remain authoritative.

Provider tree ownership has two explicit scopes. `repositoryManagedTrees` contains DS-author repository views generated directly from canonical roots; `productManagedTrees` contains only consumer trees that the fork builder can deterministically materialize. The product lifecycle ledger derives exclusively from the latter plus each provider's instruction, hook config, and skill surface. The removed ambiguous `managedTrees` field is rejected, so a future provider cannot accidentally turn repository-only Claude files into consumer ownership.

Plugin discovery links are generated outputs, not another policy home. `canonical/plugin-aliases.json` names only the provider and managed-tree/skill-view key; `providers.json` supplies the destination, and the build graph derives the exact relative symlink target. A regular file is never clobbered, a dangling/retargeted link fails check, and every protected-root symlink requires one exact producer path.

Generated native adapters use the portable command-hook contract: an allowed operation exits `0` with no output; a blocked operation writes a concise reason to `stderr` and exits with the provider contract's blocking code. Outside the registered neutral hook envelopes described below, machine-readable JSON is emitted only by an explicitly requested CLI `--json` diagnostic, so provider hook parsers never receive an unrelated JSON shape.

Canonical hooks that need model-visible feedback emit only the neutral `governanceContext` or `governanceDecision` envelope. `scripts/run-provider-hook.mjs` validates the registration and converts that envelope into the exact transport declared by the provider registry (for example Claude hook-specific context versus Codex system context, and each runtime's supported Stop decision). Raw provider-native JSON is forbidden in active canonical hooks. A diagnostic exit, malformed JSON, unsupported event field, or ordinary exit code that the provider treats as non-blocking never counts as enforcement evidence; the adapter must produce the runtime's exact block semantic and the protected CI gate remains the final boundary.

Versioned native transcripts use the registry-owned `validated-jsonl-tail-v2` access contract. A provider-controlled filename is not a security property, so the adapter makes no basename or suffix assumption. It opens one canonical, unique regular file without following links, captures a fixed end offset, reads that bounded range twice, and accepts later bytes only when the same inode, mode, and single-link identity grew monotonically. A concurrent partial final record receives a bounded retry and may be omitted only when a later file observation proves append beyond that captured end. Every retained non-empty line must parse as one JSON object. A stable malformed record fails closed, as does any rewrite, truncation, or path substitution observed by the bounded identity, metadata, and byte-equality checks. This is deliberately a proof about the captured verification interval, not an impossible claim about unobserved file history before or after it. Canonical hooks receive only complete object records in a mode-`0600` private tail snapshot that is deleted on exit, never the provider's live session file or an unverified prefix. The current Claude contract retains up to the latest 1,200 records that fit its 16 MiB materialization budget; `maximumRecordBytes` counts the UTF-8 JSON body and the materialization budget additionally owns one normalized LF per retained record. Zero bytes are the explicit pre-first-record state. A link, malformed UTF-8/JSONL stable tail, oversized record, unstable captured range, or even one record that cannot fit the closed budget fails closed. Providers whose transcript is opaque, including Codex today, keep `access: null` and remain ineligible for hooks that require stable transcript evidence.

After an installed Claude adapter, plugin hook view, instruction, or skill changes, close every Claude
Code process using the old installation and start a fresh process before acceptance testing. A
settings watcher or `/clear` may refresh some surfaces, but neither is the portable activation
boundary for the complete governed surface. Never rename, copy, or edit a provider-owned session
transcript as a workaround; the adapter validates its content and stable file identity without
assuming a provider filename.

Judgment evidence follows the same split. The canonical model broker freezes content-addressed, bounded source shards and dependency-source shards; a provider profile has no repository mount or read tools and can only receive one exact shard prompt. Provider/model/version/certification/profile/shard/batch identities are carried through every result, while a deterministic reducer proves exact coverage. Legacy local model profiles remain available only as explicitly untrusted diagnostics and cannot satisfy promotion.

### Evidence authorities are build inputs

The canonical manifest and the `control-plane` build-graph stage name every deterministic plan, neutral hook transport and evidence plan, CI observation/attestation contract, model broker/profile/source-inventory contract, managed-CI workflow and activation contract, protected external-ledger writer workflow/library/CLI/schemas/adversarial tests, staged-rollout validator/CLI/poison corpus, and provider-neutral residue guard explicitly. Directory-level discovery remains defense in depth; it is not a substitute for a reviewable source ID and exact path. A change to any of these bytes therefore invalidates the same generated control-plane snapshot and lock.

Local plan and check commands are intentionally capability-free. `audit:ci-evidence-plan`, `audit:model-evidence-plan`, `audit:managed-ci-plan`, `audit:staged-rollout-plan`, and `audit:provider-neutral-residue` neither invoke a model nor open the network nor write evidence. Their stricter `*check` counterparts fail closed when the current immutable run, signed external activation, or rollout ledger is absent. `test:governance-evidence-control-plane` exercises the focused poison/adversarial suites without activating any external capability.

### Attestations are evidence-bound

`attest` succeeds only after the doctor gate passes and, inside a Git repository, the worktree is clean. Its canonical contract, generated snapshot, truthful claims, Git commit/tree, and timestamp are recorded as machine-readable evidence. GitHub's OIDC attestation signs release artifacts separately; this local JSON never claims to be a cryptographic signature.

### Upgrades are optimistic and atomic

`upgrade plan` records the current, expected, and contract digests. `upgrade apply` revalidates all three before atomically replacing only the configured generated directory. A stale plan is rejected.

## CLI

```text
qijenchen-governance generate [--repo DIR] [--role ROLE]
qijenchen-governance check [--repo DIR] [--role ROLE] [--json]
qijenchen-governance doctor [--repo DIR] [--role ROLE] [--json]
qijenchen-governance hook --provider claude|codex|generic [--json]
qijenchen-governance attest [--at ISO8601] [--attestation-file FILE] [--json]
qijenchen-governance upgrade plan [--plan-file FILE] [--json]
qijenchen-governance upgrade apply --plan-file FILE [--json]
```

Common options:

- `--manifest FILE`: alternate canonical manifest, primarily for a downstream package or fixture.
- `--output DIR`: override the manifest's repository-relative generated directory.
- `--lock FILE`: override the manifest's repository-relative committed lock.
- `--hooks-off`: records that the hard check ran without relying on native hooks.
- `--json`: emits a stable JSON result with `ruleId`, `severity`, `evidence`, and `outcome` diagnostics.

## Onboard another model or agent runtime

1. Add one provider binding to `canonical/providers.json`: identity, instruction entry, Agent Skills output, explicit `repositoryManagedTrees` and `productManagedTrees`, native-hook adapter template or a machine-readable exclusion, environment mapping, normalization aliases, and explicit skill peer/transport/invocation bindings. Start every new surface as `not-certified`; an unsupported product tree materializer or ambiguous invocation is `ADAPTER-BLOCKED`.
2. Point the provider at `AGENTS.md` directly, or use a thin provider file that imports it. The control plane rejects a detached instruction entry.
3. Register a skill discovery materializer before enabling generation; canonical skills may never silently disappear. Reuse the `agent-skills` adapter template when compatible. A runtime without a certified skill surface remains explicitly disabled and relies only on the provider-neutral CLI/CI gate until that surface exists. A new provider using an existing template requires registry data only; a genuinely new surface adds a declarative adapter template, never a fork of workflow prose.
4. If native hooks exist, declare supported events and matcher aliases so the generator projects every compatible canonical registration through `scripts/run-provider-hook.mjs`. Every omission needs a machine-readable reason code. If hooks do not exist, declare `hookEnforcement: ci-only`, null native wiring, and one `native-hooks` exclusion; the immutable checker and protected CI remain mandatory.
5. A rename or removal is a lifecycle migration: remove the active provider record and add one versioned `canonical.retiredProviders` record containing its prior discovery inventory. Partition every prior managed file/tree exactly once into `surfaces` (deletion tombstones; the lifecycle ledger adds the prior-content SHA-256) or optional `transfers` (the same path/kind is now owned by the named, distinct active replacement). A null replacement cannot transfer. The signed next corpus removes only authenticated deletion tombstones; transferred paths remain materialized by their replacement. Absence without a tombstone never authorizes cleanup.
6. Add explicit local/cloud/remote/CI surface ledger entries, executable conformance fixtures, tool/version evidence, and expiry. A generated adapter or passing unit test is not by itself a runtime certification.
7. Run `node scripts/sync-ds-canonical.mjs`, its `--check` drift gate, provider parity, and clean-room consumer tests; then review immutable evidence before promotion. Provider onboarding never authorizes a release, remote mutation, or certification by prose alone.
8. Add one `broker-content-only` HTTPS API profile with an exact endpoint, singleton egress host, closed request shape, tool omission, and exact semantic response selector, plus managed-execution and runtime-certification fixtures. The managed loader derives provider egress from this registry; do not add a provider-specific branch to the broker. A local provider CLI may exist only under `legacyUntrustedProfiles` for runtime diagnostics and can never satisfy promotion evidence. Keep the provider `not-certified` until a current independent issuer quorum signs a real runtime probe and all required surfaces are observed.

## Certified repository role

- `ds-author`: design-system source and governance authoring repository.

Template/product roles are intentionally **not** declared by this package until their role contracts are independently clean-room certified. Products receive one generated, immutable authority through `@qijenchen/design-system/ds-canonical/fork/consumer`: `AGENTS.md`, normalized Claude/Codex adapters, shared skills, `governance/lock.json`, and the exact installed checker. WM may add product checks as an overlay, never a competing lock/checker/receipt authority. This keeps one traceable chain instead of falsely advertising unsupported package roles.
