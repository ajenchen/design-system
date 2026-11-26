# Consumer Governance Contract

This file is an upstream-managed, release-authenticated guide for every repository created from the
DS product template. It explains the machine-enforced contract; it is not a second policy authority.
The exact installed checker, `governance/lock.json`, the fork corpus lock, and protected CI remain
authoritative. Product-owned root documentation stays product-owned, and stricter non-executable
product rules belong only in `governance/overlay.md`.

## One setup path in every environment

Run `npm run setup:all` from a fresh checkout on local macOS/Linux, Codex Cloud, Codespaces, or
another Linux devcontainer host. Configure that same command as each
hosted environment's setup command; Codex Cloud also uses it as the maintenance command after a
cached container is restored. Session-start hooks never install or repair dependencies.

On Claude Code on the web, use the Setup script in the template README ("Local, cloud, and
container setup"). It can go in the shared Default environment: it runs `npm run setup:all` only
when the session's repository is this one and returns that command's exit status, and for any other
repository it prints one skip line and exits 0, because a setup script that exits non-zero makes the
session fail to start or start without what it failed to install
(https://code.claude.com/docs/en/cloud-environments#setup-scripts). The script starts in
`/home/user` with this repository in a subfolder, and also works when started at the repository root.

Hosts whose outbound HTTPS is re-signed by a proxy work when the proxy CA is in the host system
trust store and Node.js is 22.15.0 or newer: every registry request in the locked setup chain then
trusts Node's bundled CA store plus the system store (the exact npm runs with `--use-system-ca`)
and still ignores CA and `NODE_OPTIONS` environment variables. A credential-free `HTTPS_PROXY` /
`NO_PROXY` is used only for routing and adds no trust; a proxy URL that carries credentials is still
ignored. On Node.js 22.13.x–22.14.x the locked npm trusts only the bundled store.

On Claude Code on the web, `setup:all` completes both in the Setup script stage and when rerun
inside a session. In the Setup script stage no proxy variable is set and the npm registry and the
Sigstore TUF CDN used by the registry signature audit (`audit signatures`,
`tuf-repo-cdn.sigstore.dev`) are reached directly; inside a session that CDN is reachable only
through the environment's credential-free `HTTPS_PROXY`, which the locked setup forwards together
with `NO_PROXY`. Earlier releases dropped every proxy variable, so that audit failed in a session
with `ENOTFOUND tuf-repo-cdn.sigstore.dev`. A session where `setup:all` did not complete is
degraded and must not claim compliance.

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

## Release mirror and protected PR trust chain

Automatic template delivery is owned upstream by the release mirror. It opens a normal PR containing
the exact published snapshot; a consumer does not carry a second release-dispatch/updater workflow.
Repository Actions defaults remain read-only, and ordinary delivery requires no hosted environment or
App credential in the consumer.

The provider-neutral standard release order is exactly
`pr-checks → merge → publish → readback → consumer`. The upstream release mirror owns template
delivery. A registered product receiver is downstream-only: it pins every manifest discovered from
the root workspace declaration to the exact release, regenerates the single npm lock, and derives
both status and staging paths from `sync-exact-workspace-dependencies.mjs --list-receiver-paths`.
It may open a protected PR; it may not publish, direct-write `main`, or replace mirror authority.

Protected `main` requires the single `Verify consumer` context from `audit.yml`. That workflow performs
one locked install followed by typecheck, import lint, and build. The normal PR review and protected
branch rules decide whether the mirror proposal can merge. Preview, visual, accessibility, canary, and
external readback evidence are optional hardening lanes unless a repository explicitly opts into them;
they are not hidden prerequisites for the standard release path.

## Verification boundary

Use `npm run governance:check -- --hooks-off` before a PR. A local or cloud run proves deterministic
repository conformance on that host; it does not by itself prove external GitHub protection or
provider-runtime certification. Those claims require current target-bound evidence and independent
external readback.
