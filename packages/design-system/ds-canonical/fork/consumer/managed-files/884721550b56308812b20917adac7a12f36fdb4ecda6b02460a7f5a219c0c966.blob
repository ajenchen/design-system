# Consumer Governance Contract

This file is an upstream-managed, release-authenticated guide for every repository created from the
DS product template. It explains the machine-enforced contract; it is not a second policy authority.
The exact installed checker, `governance/lock.json`, the fork corpus lock, and protected CI remain
authoritative. Product-owned root documentation stays product-owned, and stricter non-executable
product rules belong only in `governance/overlay.md`.

## One setup path in every environment

Run `npm run setup:all` from a fresh checkout on local macOS/Linux, Codex Cloud, Claude Code
on the web, Codespaces, or another Linux devcontainer host. Configure that same command as each
hosted environment's setup command; Codex Cloud also uses it as the maintenance command after a
cached container is restored. Session-start hooks never install or repair dependencies.

Successful setup deliberately reports `scope=local-bootstrap`,
`providerCertification=not-checked`, and `externalActivationRequired=false`. Ordinary bootstrap is
complete on its own; the external-activation/readback lane is an explicit opt-in hardening path.
The fields still do not claim that a cloud/provider runtime is certified or that external branch
protection, apps, secrets, and required checks are activated.

The locked execution contract requires Node.js 22.13.0 or newer, Bash, Git, `jq`, and Python 3.
Native Windows is unsupported; use the committed Linux devcontainer or WSL2. The host npm only
launches the setup script and may be npm 10 or newer. All authoritative npm operations use the
independently downloaded and lock-verified exact npm 11.18.0 runtime. Unsupported or incomplete
hosts fail before dependency installation or repository mutation.

## Provider-neutral behavior

`AGENTS.md` is the shared instruction authority. Claude, Codex, and future registered providers
receive generated projections of the same instructions, hooks, skills, and independent-review
contract. Provider-native hooks accelerate feedback but do not grant authority. A missing provider
event falls back to the exact hooks-off checker and protected CI; an unregistered provider remains
fail-closed instead of inventing a local policy surface.

## Exact upgrades and `sync-all`

`npm run sync-all -- --to X.Y.Z` is a syntax-only read-only plan. It does not query or authenticate
the target and therefore reports `ok=false`, `targetVerification=deferred`,
`targetVerified=false`, and `ready=false`; an exact-looking or nonexistent version cannot be
mistaken for a verified release. The guarded apply path performs immutable-release, Release BOM,
npm provenance, and signature verification before any live mutation. On a clean dedicated branch,
`npm run sync-all -- --apply --to X.Y.Z` authenticates the exact release, reconstructs the complete
managed snapshot, and transactionally updates eligible package, instruction, provider, skill, and
non-executable governance data. This guide is one of those exact-hash upstream-managed files.
Consumers already established on the current runtime/bootstrap contract receive later guide updates
through ordinary `sync-all`. A legacy v1 consumer cannot use its old updater to replace that updater
or cross the v2 runtime boundary: it first needs one reviewed full-snapshot bootstrap PR.
Product-owned root README and other root documents are never taken over.

Changes to `.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`, or package scripts require a
separately reviewed full-snapshot PR — ordinary `sync-all` cannot replace the control plane that
authorizes its own next execution. Reviewed paths run from the DS authority, materialize only a
fresh snapshot, execute no candidate code, and emit proposals rather than applying to the live
consumer or inventory.

## Automated upgrade trust chain

Repository Actions defaults stay read-only, and **Allow GitHub Actions to create and approve pull
requests** stays disabled. The credential-free certifier and fresh read-only verifier first bind the
exact base, paths, patch, tree, and incoming bytes. Only the protected-branch `governance-upgrade`
environment may mint the short-lived Governance Writer App token with contents and pull-request
write permissions. The Writer App may create or strictly reuse one deterministic upgrade branch and
PR; it cannot publish checks, approve, merge, bypass protection, or write directly to `main`.

Writer App pushes can start ordinary candidate workflows. Those automatic candidate runs are
non-authoritative and never satisfy the required check. The writer must explicitly send the
`governance-upgrade-candidate-validation` repository dispatch. That event reloads
`governance-anchor.yml` from protected default, executes candidate verification without credentials,
and lets only the separate check-only Governance Check App publish the required
`Immutable consumer snapshot` verdict. Review and protected rules decide whether the PR can merge.

## Verification boundary

Use `npm run governance:check -- --hooks-off` before a PR. A local or cloud run proves deterministic
repository conformance on that host; it does not by itself prove external GitHub protection or
provider-runtime certification. Those claims require current target-bound evidence and independent
external readback.
