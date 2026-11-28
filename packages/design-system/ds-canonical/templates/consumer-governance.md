# Consumer Governance Contract

This file is an upstream-managed, release-authenticated guide for every repository created from the
DS product template. It explains the machine-enforced contract; it is not a second policy authority.
The exact installed checker, `governance/lock.json`, the fork corpus lock, and protected CI remain
authoritative. Product-owned root documentation stays product-owned, and stricter non-executable
product rules belong only in `governance/overlay.md`.

## One setup path in every environment

Run `npm run setup:all` from a fresh checkout on local macOS/Linux, Codespaces, or another Linux
devcontainer host, with the exact Node.js version in `.node-version` (the one Node.js version
source: CI `setup-node`, the dev container image, and Netlify all use it). Session-start hooks never
install or repair dependencies.

On Claude Code on the web and Codex Cloud, use the Setup script in the template README ("Local,
cloud, and container setup"; Codex Cloud also as its maintenance script). That section is the only
description of it (exact `.node-version` Node.js, then `npm run setup:all`; which environment to put
it in and how cached setup results behave).

Hosts whose outbound HTTPS is re-signed by a proxy work when the proxy CA is in the host system
trust store and Node.js is 22.15.0 or newer: every registry request in the locked setup chain then
trusts Node's bundled CA store plus the system store (the exact npm runs with `--use-system-ca`)
and still ignores CA and `NODE_OPTIONS` environment variables. A credential-free `HTTPS_PROXY` /
`NO_PROXY` is used only for routing and adds no trust; a proxy URL that carries credentials is still
ignored. On Node.js 22.13.x–22.14.x the locked npm trusts only the bundled store.

On Claude Code on the web the registry signature audit (`audit signatures`) also reaches the
Sigstore TUF CDN (`tuf-repo-cdn.sigstore.dev`). In a Setup script run it was reached directly (no
proxy variable set); inside a session it is reachable only through the session's credential-free
`HTTPS_PROXY`, which the locked setup forwards for routing only, so a session rerun of `setup:all` reaches it through that proxy. A session where `setup:all` did not complete is degraded and must not claim compliance.

Successful setup deliberately reports `scope=local-bootstrap`,
`providerCertification=not-checked`, and `externalActivationRequired=false`. Ordinary bootstrap is
complete on its own; the external-activation/readback lane is an explicit opt-in hardening path.
The fields still do not claim that a cloud/provider runtime is certified or that external branch
protection, apps, secrets, and required checks are activated.

The locked execution contract requires Node.js 22.13.0 or newer, Bash, Git, `jq`, and Python 3.
Native Windows is unsupported; use the committed Linux devcontainer or WSL2. The host npm only
launches the setup script and may be npm 10 or newer. All authoritative npm operations use the
independently downloaded and lock-verified exact npm 11.19.0 runtime. Unsupported or incomplete
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
non-executable governance data, including the exact `@qijenchen/*` versions declared by every
`apps/*/package.json` (one lock, no nested second copy; `governance:check` blocks a split as
`GOV-WORKSPACE-VERSION-001/002`). This guide is one of those exact-hash upstream-managed files.
Consumers already established on the current runtime/bootstrap contract receive later guide updates
through ordinary `sync-all`. A legacy v1 consumer cannot use its old updater to replace that updater
or cross the v2 runtime boundary: it first needs one reviewed full-snapshot bootstrap PR.
Product-owned root README and other root documents are never taken over.

Changes to `.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`, or package scripts travel
through ordinary `sync-all` as data in the upgrade PR diff (`GOV-UPGRADE-BOOTSTRAP-001/002` retired
2026-08-12; each such path prints an `INFO` line). The transaction still executes only the scripts on
the protected base; incoming control-plane code runs only after the PR merges.

The guarded apply reads the design-system GitHub Release and tag through the GitHub API. A Claude
Code cloud session reaches only the GitHub repositories attached to it, so there an upgrade first
needs `ajenchen/design-system` attached (measured 2026-11-27: without it the read fails with HTTP
401 / 403 even though the repository is public). Upgrade scripts from 0.1.0-beta.152 send those reads
through a credential-free `HTTPS_PROXY` themselves; an upgrade run by older scripts also needs
`NODE_USE_ENV_PROXY=1`. Otherwise let the receiver below run it on a GitHub runner or run it on a
local terminal (`docs/04-ds-upgrade.md`, Where to run an upgrade).

## Release mirror and protected PR trust chain

Automatic template delivery is owned upstream by the release mirror. It opens a normal PR containing
the exact published snapshot. Product repositories carry one upstream-managed receiver,
`.github/workflows/sync-design-system.yml` (since 0.1.0-beta.152): on `repository_dispatch`
`design-system-published` it validates the exact `{ version, tag, commit }` payload, runs
`sync-all --apply` on a GitHub runner, and pushes only `automation/design-system-<version>`, holding
nothing but `contents: write`. A product repository at 0.1.0-beta.151 or older receives it with its
next upgrade, which it runs itself (`docs/04-ds-upgrade.md`, First use); later releases arrive through
the receiver. Repository Actions defaults remain read-only, and ordinary delivery requires no hosted
environment or App credential in the consumer.

The provider-neutral standard release order is exactly
`pr-checks → merge → publish → readback → consumer`. The upstream release mirror owns template
delivery. The product receiver is downstream-only: it pushes its automation branch, and the upstream
release orchestrator opens the PR so that `Verify consumer` runs on it. The receiver may not open or
merge that PR, publish, direct-write `main`, or replace mirror authority.

Protected `main` requires the single `Verify consumer` context from `audit.yml`. That workflow performs
one locked install followed by the hooks-off `governance:check`, typecheck, import lint, and build. The normal PR review and protected
branch rules decide whether the mirror proposal can merge. Preview, visual, accessibility, canary, and
external readback evidence are optional hardening lanes unless a repository explicitly opts into them;
they are not hidden prerequisites for the standard release path.

## Recorded content debt

`governance/content-debt-baseline.json` is product-owned; its schema is the upstream-managed
`governance/schemas/content-debt-baseline.schema.json`. The installed checker reads it in
`setup:all`, `governance:check`, and `Verify consumer`: recorded findings do not block, findings the
hooks did not report when the baseline was recorded block (by file, rule, hook, and reported finding
line), recorded findings that no longer occur block until
`npm run governance:debt -- --prune` removes them (the baseline only shrinks), and a hand edit fails
`entriesSha256` (`GOV-CONTENT-DEBT-001`; restore it from Git, or rebuild it from scratch with
`--record`, which does not keep the old registrations). It grows only through
`npm run governance:debt -- --record --by <who> --reason <why>`, whose registration is reviewed in the
PR diff. `npm run governance:debt -- --list` prints every finding without writing; its unrecorded part
is exactly what `--record` registers. Without the file every content finding blocks. `recordedContentDebt=<N>` reports registered
debt; it is not a content-compliance claim. Creating and shrinking it: `docs/01-first-time-setup.md`
and `docs/04-ds-upgrade.md`.

## Reasoned exemptions

The shipped content checks (write-time hooks and the same hooks replayed by `governance:check` and
`Verify consumer`) default to the DS norm and block deviations; they are never downgraded to warnings.
The DS cannot foresee every product situation, so a product with a reasonable cause may exempt one
place itself without waiting for DS approval:

- Write the marker that the block message names, followed by a colon and a concrete reason, in a
  comment on that line (or the line directly above), e.g. `// @<rule>-ok: <reason>` or
  `{/* @<rule>-allow: <reason> */}`. An environment-variable bypass only works at write time; CI never
  sees it, so the committed marker is the only exemption CI accepts.
- An empty reason (only the colon, or only a comment closer after it) still blocks.
- Within the quota (fewer than 3 marker kinds and fewer than 5 markers per file, at most 10 per
  `apps/<name>`) any reasoned marker passes. Past the quota each marker needs a reason specific to its
  line: at least 10 characters and not repeated within the same content.
- Every `governance:check` run lists the exemptions: the text report prints how many times each marker
  occurs, and `--json` carries every entry (file, line, marker, reason) in `evidence.exemptions`. The DS
  reviews these lists periodically and turns recurring reasons into spec cases.

## Verification boundary

Use `npm run governance:check -- --hooks-off` before a PR. A local or cloud run proves deterministic
repository conformance on that host; it does not by itself prove external GitHub protection or
provider-runtime certification. Those claims require current target-bound evidence and independent
external readback.
