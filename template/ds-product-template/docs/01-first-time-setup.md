# Day 0 — First-Time Setup

## Prerequisites

- Node 22.13.0+, npm 10+ as the launcher, Git, Bash, `jq`, and Python 3. Governance npm operations use exact lock-verified npm 11.19.0.
- Claude Code, Codex, or another agent that can read `AGENTS.md`

The exact governance checker intentionally fails closed when Bash, `jq`, or Python 3 is unavailable,
because the authenticated hook corpus currently contains both shell and Python predicates. On
Windows, use the committed Linux dev container or WSL2. Native Windows is unsupported and the
checker fails closed; an unregistered environment that merely has similarly named executables is
not an approved substitute. Do not treat a skipped native-hook run as certified governance.

## Setup

```text
git clone <your-template-derived-repository>
cd <repository>
npm run setup:all
```

`setup:all` is the provider-neutral single local, devcontainer, and hosted-setup entrypoint. It first executes the
role-specific `setup:governance` primitive, then installs and version-probes the lock-bound CLI
capabilities declared by the provider toolchain registry. CLI provisioning is not independent-review
activation or certification. A usable review still requires an activated managed broker, an exact
provider/runtime/surface/product-consumer certification tuple, author/reviewer separation, and the
required external evidence/readback. Until those bindings exist, the launcher remains plan-only and
must report `REVIEW-BLOCKED`. The host provider process remains vendor-managed; repository tooling
never claims to replace or certify that host runtime.

A successful command prints `scope=local-bootstrap`, `providerCertification=not-checked`,
`externalActivationRequired=false`, and `recordedContentDebt=<N>`. Treat these as an explicit boundary: the checkout bootstrap is
verified, but cloud/provider runtime certification and external activation still require their
independent target-bound evidence and readback. `recordedContentDebt` counts the content findings
the product has registered as existing debt (below); it is never a content-compliance claim.

### Recorded content debt

The last setup stage replays every content rule (layout magic numbers, consumer app invariants,
escape-marker ratchet, `any`, and so on) over the product source. A product that already has such
findings would otherwise fail `setup:all` with `GOV-CONTENT-001` until every one is fixed — and it
cannot fix them without a working environment. Register the existing findings once instead:

```text
npm run governance:check                       # see what fails
npm run governance:debt -- --record --by "<who>" --reason "<why these are accepted for now>"
git add governance/content-debt-baseline.json  # commit it in the same PR, where reviewers see it
```

`governance/content-debt-baseline.json` is product-owned; its format is the upstream-managed
`governance/schemas/content-debt-baseline.schema.json`. Each cell is rule + file + hook + event, and
holds line-number-free fingerprints of the findings, so moving code does not change it. The same
installed checker reads the same baseline in `setup:all`, `npm run governance:check`, and the
`Verify consumer` CI job:

- a finding that is in the baseline does not block;
- a new finding blocks and names the file: a file, rule, or hook not in the baseline, or a finding
  line the hook did not report when the baseline was recorded. The granularity is the hook's own
  report — a hook that reports one line per kind of violation (for example one line for every
  hand-written `<table>` in a file) shows a new kind, not a second occurrence of the same kind;
- a recorded finding that no longer occurs blocks (`GOV-CONTENT-DEBT-002`) until you shrink the
  baseline with `npm run governance:debt -- --prune` — the baseline may only shrink;
- a hand-edited baseline (its `entriesSha256` no longer matches) blocks as `GOV-CONTENT-DEBT-001`;
  growth goes only through `--record`, which writes who registered the findings and why. To recover,
  restore the file with `git checkout -- governance/content-debt-baseline.json`, or rebuild it from
  scratch with `--record` (the rebuilt file does not keep the old registrations; `--prune` refuses an
  invalid baseline);
- without a baseline file every finding blocks, as before.

`npm run governance:debt -- --list` shows recorded, unrecorded, and fixed-but-still-recorded findings,
one line per finding, without writing. It replays every hook on every file even when there is no
baseline yet, so its unrecorded findings are exactly what `--record` would register. (Without a
baseline, `governance:check` and `setup:all` stop at the first failing hook of each file, so they can
name fewer findings than `--list`.) This is the same model as ESLint bulk suppressions
([eslint.org/docs/latest/use/suppressions](https://eslint.org/docs/latest/use/suppressions):
existing violations are not reported while new code is enforced, and once a suppressed violation is
fixed ESLint exits non-zero until `--prune-suppressions` removes it). Native write-time hooks are
per-write accelerators and do not read the baseline; the hooks-off checker above is the authority.

The environment's npm only launches committed Node scripts. The governance phase resolves the canonical
npm tarball URL and SHA-512 from the committed lock, downloads those bytes with Node HTTPS,
closed-parses them into a disposable root, probes the exact CLI, and uses that same independent
runtime for the lifecycle-disabled install and signature audit. It never executes PATH npm or an
ignored `node_modules/npm` as authority. It then runs the exact installed hooks-off governance check;
any failed step stops setup. A malicious committed Git snapshot, host, Node/TLS runtime, or canonical
registry endpoint is outside this repository-only proof. The last stage is the local deterministic conformance boundary, not provider runtime
certification. It verifies the exact package/lock/BOM, installed governance corpus, each provider's
declared native-event projection and explicit hard-gate fallback, shared skills, and generated
digests without relying on native hooks or changing the checkout. Runtime certification remains
`not-certified` until independently signed target-bound evidence and external enforcement readback
are activated.

## Hosted setup

- In Codex Cloud, configure both the environment **Setup script** and cached-container
  **Maintenance script** as `npm run setup:all`. The ordering and cache behavior are defined
  by the [official Codex Cloud environment guide](https://developers.openai.com/codex/cloud/environments).
- In Claude Code on the web, the Setup script below can go in the shared **Default** environment.
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
- Codespaces and other devcontainer clients invoke the same setup implementation from the committed
  `.devcontainer/devcontainer.json`.

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

Do not move installation into SessionStart. The repository SessionStart adapter is deliberately
read-only so opening or resuming any local/cloud agent cannot mutate the checkout.

Now start the provider you prefer (`claude`, `codex`, or another registered interface). `AGENTS.md`, provider adapters, and skill views already exist before the session starts. No plugin or session-time install is required. A future provider is admitted through the registry, adapter, compatibility, review-binding, and target-bound certification contracts; an unknown executable is never silently treated as supported.

## Release authority

Every provider uses the same standard five-step release SSOT:
`pr-checks → merge → publish → readback → consumer`. The upstream release mirror alone delivers an
exact snapshot to the template repository. A registered product receiver is downstream-only: it
dynamically discovers every root-workspace `package.json`, pins governed packages to one exact
release, updates the single package lock, uses that same dynamic path set for status and staging,
and opens a protected PR. It cannot publish or write protected `main`.

## Verify product creation

```text
npm run create-app test-app
cd apps/test-app
npm run dev
```

Before opening a PR, return to the repository root and run:

```text
npm run governance:check -- --hooks-off
npm run typecheck
npm run lint:imports
npm run build
```

Next: run `npm run setup:netlify`. It performs no Netlify CLI installation or login; it prints the Dashboard/manual steps and intentionally exits 2 because a local script cannot verify the Netlify-side setup. Complete those steps in a browser, then continue with `docs/02-create-new-product.md`.
