# DS Product Template

GitHub template for product apps that consume [`@qijenchen/design-system`](https://github.com/ajenchen/design-system). Use this repository when the product should receive the design system and its governance without carrying DS source.

## What is guaranteed at Day 0

The repository snapshot already contains the provider-neutral bootstrap and generated adapters before any AI session or npm lifecycle runs:

- `AGENTS.md` — shared instructions and SSOT pointers for Codex and other compatible agents.
- `CLAUDE.md` — thin Claude Code adapter importing `AGENTS.md`; no duplicate shared policy.
- `.claude/` and `.codex/` — native hook wiring generated from one event authority and routed through the same dispatcher/corpus; each provider's supported subset and every missing-event hard-gate fallback are locked in the manifest.
- `.claude/skills/` and `.agents/skills/` — equivalent generated views of every classified consumer skill.
- `governance/lock.json` — immutable BOM binding exact package versions to instruction, hook, and skill digests.
- `governance/consumer-governance.md` — upstream-managed explanatory guide delivered and hash-checked by the same BOM; it does not replace the machine authority.
- The same lock binds `protected-base-reconstruction-v2` plus the exact protocol specification, closed schema, and validator implementation digests; an old consumer without this complete marker is not eligible for ordinary `sync-all`.
- `npm run governance:check` — invokes the exact installed read-only hard gate at
  `node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs`; it
  remains authoritative with native hooks disabled.

No Claude plugin is required. Session startup never installs packages, resolves `@beta`/`latest`, or rewrites the checkout. Native hooks provide fast feedback; the provider-neutral check supplies the deterministic decision. Merge enforcement comes from protected `main` requiring that check.

The authenticated consumer predicate corpus currently requires Node 22.13.0+, Git, Bash, `jq`, and
Python 3. The provider-neutral checker verifies these tools and fails closed if one is absent. On
Windows, use the committed Linux dev container or WSL2. Native Windows is explicitly unsupported
and fails closed; it may not be relabelled as WSL2/devcontainer or as an unspecified "equivalent"
runtime. Native hook absence never counts as certification and protected CI remains required.

## First setup

1. Click **Use this template** on GitHub, then clone the new product repository.
2. Install the committed snapshot:

   ```text
   npm run setup:all
   ```

3. Open the repository with Claude Code, Codex, or another agent that reads `AGENTS.md`/Agent Skills.
4. Create the first product app:

   ```text
   npm run create-app order-dashboard
   npm install --legacy-peer-deps --ignore-scripts
   npm run storybook
   ```

5. Before a PR, run `npm run governance:check -- --hooks-off`, `npm run typecheck`, `npm run lint:imports`, and `npm run build`.

### Local, cloud, and container setup

Use the same canonical fresh-checkout bootstrap everywhere; run it locally and configure it explicitly in each hosted environment:

- Local macOS/Linux: run `npm run setup:all` from the repository root.
- Codex Cloud: set both the environment **Setup script** and **Maintenance script** to
  `npm run setup:all`. Codex runs setup after checkout and maintenance after restoring a
  cached container, as described in the [official Codex Cloud environment guide](https://developers.openai.com/codex/cloud/environments).
- Claude Code on the web: the Setup script below can go in the shared **Default** environment.
  It runs `npm run setup:all` only when this session's repository is `<repository-folder>` and
  returns that command's own exit status; for any other repository it prints one skip line and exits
  0, so it never blocks another repository's session. The official guide documents that the script
  runs as root on Ubuntu 24.04 after the repository is cloned and before Claude Code launches, that
  the environment's own variables are not set yet, and that a script that exits non-zero makes the
  session fail to start or start without what it failed to install. The guide does not document the
  script's working directory, so the script handles both starting at the repository root and
  starting one level up with the checkout in a subfolder (a Setup script run on Claude Code on the web started in the directory that
  contains the checkout, with the repository in its own subfolder). Replace
  `<repository-folder>` with this repository's folder name; left unreplaced, the script only skips. A successful run is cached as a filesystem snapshot and is re-run only when the
  script or allowed hosts change or the cache expires, so after a committed-lock change run
  `npm run setup:all` in the session. See [Setup scripts](https://code.claude.com/docs/en/cloud-environments#setup-scripts)
  and [Setup script failed](https://code.claude.com/docs/en/web-quickstart#setup-script-failed).

  ```bash
  #!/bin/bash
  # Claude Code Setup script (shared Default environment): runs setup:all only for <repository-folder>
  set -uo pipefail
  REPO_DIR="<repository-folder>"  # this repository's folder name
  if [ "$(basename "$PWD")" = "$REPO_DIR" ] && [ -f package.json ]; then
    :
  elif [ -f "$REPO_DIR/package.json" ]; then
    cd "$REPO_DIR" || exit 1
  else
    echo "setup:all: $REPO_DIR is not this session's repository (cwd $(pwd)); skipping" >&2
    exit 0
  fi
  if ! grep -q '"setup:all"' package.json; then
    echo "setup:all: $(pwd)/package.json has no setup:all script" >&2
    exit 1
  fi
  exec npm run setup:all
  ```
- GitHub Codespaces/devcontainer: the committed `postCreateCommand` invokes the same
  `setup:all` implementation after checking the pinned system tools.

The environment's npm is only the launcher for `npm run setup:all`. Once the committed Node
script starts, it reads the canonical npm tarball URL and SHA-512 from the committed lock, downloads
those bytes with Node HTTPS, closed-parses them into a disposable root, probes that exact CLI, and
uses the same independent runtime for both the lifecycle-disabled install and registry-signature
verification. Neither PATH npm nor an ignored `node_modules/npm` is executed as authority. It then
calls the exact installed provider-neutral checker with hooks off. This repository proof assumes the
committed Git snapshot, Node runtime/TLS, and canonical registry endpoint are not malicious; it
cannot certify a hostile host. Any step failing stops setup. Repository SessionStart remains verification-only; it never installs
or repairs dependencies. The same `setup:all` works on local macOS/Linux, Codex Cloud, Codespaces, and other Linux
devcontainer hosts; Claude Code on the web runs it through the Setup script above (see the network
note below). Native Windows is unsupported; use WSL2 or the committed Linux
dev container.

Outbound HTTPS that a proxy re-signs (Claude Code on the web, most corporate proxies) works when
the proxy CA is in the host system trust store and Node.js is 22.15.0 or newer: every registry
request in the locked setup chain then trusts Node's bundled CA store plus the system store (the
exact npm runs with `--use-system-ca`) and still ignores CA and `NODE_OPTIONS` environment
variables. A credential-free `HTTPS_PROXY` / `NO_PROXY` is used only for routing and adds no trust
(TLS still trusts only those two stores); a proxy URL that carries credentials is still ignored. On
Node.js 22.13.x–22.14.x the locked npm trusts only Node's bundled store, so such a host needs
Node.js 22.15.0+. Install a proxy CA into the system trust store; `NODE_EXTRA_CA_CERTS` or
`SSL_CERT_FILE` alone is not used.

Network on Claude Code on the web: the locked setup connects directly unless a credential-free
`HTTPS_PROXY` is set, in which case every host outside `NO_PROXY` goes through that proxy (routing
only, see above). Besides the npm registry, the registry signature audit (`audit signatures`)
downloads Sigstore TUF metadata from `tuf-repo-cdn.sigstore.dev`. In a Setup script run there no
proxy variable was set and both hosts were reached directly; inside a session that CDN is reachable
only through the session's credential-free `HTTPS_PROXY`, which the locked setup forwards, so when `setup:all` is rerun in the session (for example after a committed-lock change) the
signature audit reaches that CDN through the proxy. A
session where `setup:all` did not complete is degraded; do not claim compliance there.

Successful `setup:all` output is intentionally scoped as `scope=local-bootstrap`,
`providerCertification=not-checked`, and `externalActivationRequired=false`. Ordinary bootstrap is
complete on its own; per-surface certification and external activation are opt-in hardening lanes,
not preconditions.

## Exact, reviewed upgrades

Dependencies are exact semvers, not ranges or dist-tags. Planning is syntax-only and read-only:

```text
npm run sync-all -- --to X.Y.Z
```

It reports `ok=false`, `targetVerification=deferred`, `targetVerified=false`, and `ready=false`
until immutable release/provenance evidence is actually checked. A syntactically exact target,
including one that does not exist, is never presented as ready.

Apply only on a clean dedicated branch:

```text
npm run sync-all -- --apply --to X.Y.Z
```

One `sync-all --apply` command authenticates and reconstructs the complete incoming snapshot before mutation. An ordinary upgrade may update exact dependencies plus authenticated non-executable governance data, instructions, and provider views. If the reconstructed release changes `.github/**`, `.npmrc`, `governance/bin/**`, `scripts/**`, or `package.json#scripts`, those changes travel through the same command as data in the upgrade PR diff (`GOV-UPGRADE-BOOTSTRAP-001/002` were retired on 2026-08-12 and now only print an `INFO` line per path): during the transaction only the scripts already on your protected `main` execute, and the incoming control-plane code runs only after the PR merges (`docs/04-ds-upgrade.md`). Its process-crash journal covers every path that the transaction might stage, the common instruction (`AGENTS.md`), and the prior installed tree; a failed install/materialization/check or a later invocation after SIGKILL restores the original snapshot. Run upgrades with editors and other writers quiesced: no filesystem transaction can promise to capture a non-cooperative process that keeps writing through an already-open old file descriptor. Review every permitted diff and merge through a protected PR.

Automatic template delivery is owned upstream by the design-system release mirror. It opens a normal PR containing the exact published snapshot; no dispatch reaches this template repository. The `.github/workflows/sync-design-system.yml` it carries (since 0.1.0-beta.152) is the upgrade receiver for the product repositories created from it: it validates the release dispatch, runs `sync-all` on a GitHub runner, and pushes an `automation/design-system-<version>` branch (`docs/04-ds-upgrade.md`). Protected `main` requires the single `Verify consumer` check from `audit.yml`, which performs one locked install followed by the hooks-off `governance:check`, typecheck, import lint, and build. Preview, visual, a11y, canary, and independent-review evidence remain optional or scheduled unless explicitly requested; they do not block the standard release path.

The release authority is the provider-neutral five-step SSOT, in this exact order:
`pr-checks → merge → publish → readback → consumer`. The upstream release mirror owns delivery to
the template repository. The product receiver consumes the immutable release event
downstream only: it pins every dynamically discovered workspace manifest, regenerates the one npm
lock, and pushes an automation branch; the upstream release orchestrator opens the PR so that
`Verify consumer` runs on it. It never opens or merges that PR, publishes, writes `main`, or replaces
mirror authority. Both status detection and staging must use
`npm run sync:workspace-dependencies -- --list-receiver-paths` rather than a hard-coded app list.

Legacy consumers that predate this v2 boundary are intentionally different from new template users: they first complete a one-time separately reviewed full-snapshot bootstrap PR (they cannot bootstrap themselves through the old updater). After that, control-plane changes travel through ordinary `sync-all` as reviewed data in the upgrade PR, like every other v2 consumer. The optional fleet/readback-chain machinery in `docs/04-ds-upgrade.md` is an opt-in hardening lane, never a precondition for ordinary `sync-all`.

### Breaking API migration and reviewed visual baselines

The exact installed DS package provides both tools in local, devcontainer, Codex Cloud, Claude Code web, and future provider environments; no model-specific plugin is required. `sync-all` delivers their package version plus the BOM-managed visual-review policy, issuer registry, and schemas to existing consumers.

```text
npm run ds:migrate -- upgrade --root . --source apps/<app>/src [--from <old-version>] --report upgrade.md
npm run ds:migrate -- plan --root . --source apps/<app>/src [--from <old-version>] --output codemod.json
npm run ds:migrate -- check --root . --proposal codemod.json
npm run ds:migrate -- apply --root . --proposal codemod.json --expected-proposal-digest <sha256>

npm run visual-baseline:review -- plan --root . --author <audit-label> --candidate <dir> --baseline <dir> --statements statements.json --output visual-proposal.json
npm run visual-baseline:review -- check --root . --proposal visual-proposal.json --review signed-review.json
npm run visual-baseline:review -- apply-reviewed --root . --proposal visual-proposal.json --review signed-review.json --expected-proposal-digest <sha256>
```

`upgrade` reads the change ledger shipped in the installed package (`node_modules/@qijenchen/design-system/ds-changes.json`, every section after the old version up to the installed one), applies only the entries that carry a mechanical `fix`, and prints what is left with file:line, the action, and the spec section. Codemod ambiguity (dynamic values, old and new names together, name clashes) blocks the whole file, never a guessed edit. A visual proposal binds the governed Git origin, HEAD commit/tree, exact images, and explicit non-placeholder per-image statements; the signed human review cannot replay into another repository identity. The managed-model-broker branch is reserved but forced `not-activated` in this tool version until it directly reuses the canonical signed broker/model-authority receipt validators; digest-only pseudo activation is rejected. The shipped human policy is also currently `not-activated`, so planning works everywhere while apply intentionally fails closed until protected human issuer/policy activation exists. Neither tool commits or pushes. Transactions cover cooperating writers honoring the same lock and observed per-file pathname CAS; they do not claim parent-directory-swap resistance, storage power-loss durability, or protection from a non-cooperative old open descriptor. Git identity is a governed-workspace replay boundary, not an unbypassable identity proof against a malicious repository owner.

## Governance model

| Layer | Canonical behavior |
|---|---|
| Shared instructions | `AGENTS.md`; shared rules are not copied into provider files |
| Claude adapter | `CLAUDE.md` import + `.claude/settings.json` |
| Codex adapter | `AGENTS.md` + `.codex/hooks.json` + `.agents/skills` |
| Future provider | Enabled only after registering instruction, hook/exclusion, and skill materializers; otherwise it remains explicitly disabled and only the CLI/CI hard gate is usable |
| Native hooks | Feedback accelerator; the locked coverage record permits only declared events and gives every missing event the immutable checker/protected-CI fallback |
| Hard authority | exact installed checker + the protected-main `Verify consumer` required check from `audit.yml` |
| Managed guide | `governance/consumer-governance.md`; explanatory, exact-hash upstream-managed, and updated for existing consumers by `sync-all` |
| Product-specific policy | Add stricter, non-executable neutral rules in `governance/overlay.md`; never edit generated governance views or root product documentation through upstream sync |

Provider-native hooks and skills are a closed projection of the authenticated governance package. A product may not add a Claude-only hook or matching Claude/Codex skill pair: both create an unsigned executable policy source. Promote reusable executable behavior to the provider-neutral DS package and regenerate every provider view; keep product-only judgment in `governance/overlay.md`.

This closure includes sibling discovery files and aliases: do not add `.claude/settings.local.json`, another `.codex` hook file, undeclared entries under any generated skill directory, or a skill name borrowed from another provider. A disabled provider does not grant extension rights to a destination it shares with an enabled provider. `governance/` may contain only the generated guide, generated lock files, declared launcher substrate, BOM-declared non-executable trust policy/issuer/schema projections, and an optional regular, non-executable, non-symlink `overlay.md`; additional policy homes are rejected.

Discovery is closed across the whole repository, not only at its root. The installed manifest carries a BOM-digested `discoveryPolicy` generated from the canonical provider registry; it reserves instruction, config/MCP, provider-root, and plugin surfaces for every registered provider without consumer-side model names. Nested `AGENTS.md`/`CLAUDE.md`, local or override instruction files, nested `.claude`/`.codex`/`.agents` roots, project `.mcp.json`, and repository-local `.claude-plugin`/`.codex-plugin` packages are therefore rejected unless an authenticated release explicitly declares them. Product-only semantics still belong in `governance/overlay.md`.

Names such as `build`, `dist`, or `node_modules` are not blanket exemptions: only their exact generated locations at the protected repository/workspace roots are excluded. A same-named directory nested inside product source remains subject to exhaustive replay and discovery checks.

Do not modify `node_modules/@qijenchen/design-system/`. Propose canonical DS corrections in the DS repo. Product imports must use public package exports; `npm run lint:imports` blocks `src/` or `dist/` internals.

Before composing a DS component, read its shipped story and specification:

```text
node_modules/@qijenchen/design-system/src/components/<Name>/<name>.stories.tsx
node_modules/@qijenchen/design-system/src/components/<Name>/<name>.spec.md
node_modules/@qijenchen/design-system/ds-story-manifest.json
```

## Preview → verify → production

Work on a branch and push it for a Netlify branch preview. Use the preview, required checks, and protected-PR readback as engineering evidence. P2E engineering changes merge under Standing Authorization after every required gate passes. Stop for a stakeholder decision only when an unresolved product/UI/UX SSOT tradeoff or a non-derivable external business commitment remains. Production is rebuilt from `main`.

Run `npm run setup:netlify` for a read-only diagnostic and the official Dashboard steps. It intentionally exits with code 2 (`MANUAL ACTION REQUIRED`): the reviewed Netlify CLI candidate is blocked, so the script never installs or invokes it. In the Dashboard, import this GitHub repository, then enable **Project configuration → Build & deploy → Continuous Deployment → Branches and deploy contexts → Branch deploys: All**. Netlify does not enable branch deploys by default.

In a private repository, builds from people who are not members of the Netlify team wait for a Team Owner's approval. The approval options, their cost and environment-variable risk, and the fact that this is the account holder's decision are documented once in the private-repository collaborator section of `docs/03-co-edit-workflow.md`.

## Free password protection on Netlify

This template includes `netlify/edge-functions/basic-auth.ts`. In Netlify, add:

```text
STORYBOOK_BASIC_AUTH=user:password
```

The edge function protects all routes. Keep credentials in Netlify environment variables, never in Git. Netlify dashboard Password Protection and `_headers` Basic Auth require a paid plan; the included edge function is the free path. `netlify.toml` also sets no-index/security headers, but those headers do not replace authentication.

## Repository layout

```text
apps/template/                  product seed copied by create-app
scripts/                        create, deploy, exact upgrade, governance check
.claude/                        generated Claude adapter and shared-skill view
.codex/                         generated Codex hook adapter
.agents/skills/                 generated Agent Skills view
governance/lock.json            immutable release BOM
governance/consumer-governance.md upstream-managed cross-provider/cloud guide
.storybook/                     product-story configuration
.github/workflows/audit.yml     locked install + typecheck + import lint + build gate
.github/workflows/sync-design-system.yml  design-system release dispatch -> exact sync-all -> upgrade branch
netlify/edge-functions/         free HTTP Basic Auth
```

## CI and delivery

- `audit.yml` publishes the single `Verify consumer` required context after one `npm ci --ignore-scripts`, typecheck, import lint, and all app builds.
- Exact template updates arrive as normal protected-main PRs from the upstream release mirror.
- Product repositories created from this template receive exact upgrades through `sync-design-system.yml`, the upgrade receiver: it validates the release dispatch, runs `sync-all` on a GitHub runner, and pushes an `automation/design-system-<version>` branch; the upstream release orchestrator opens the PR. A product repository at 0.1.0-beta.151 or older gets the receiver with its next upgrade, which it runs itself (`docs/04-ds-upgrade.md`, First use).
- Netlify builds Storybook from protected `main` and branch previews from working branches.

See `docs/01-first-time-setup.md` through `docs/05-troubleshooting.md` for task-specific details.

## License

UNLICENSED — internal use only.
