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

A successful command prints `scope=local-bootstrap`, `providerCertification=not-checked`, and
`externalActivationRequired=false`. Treat these as an explicit boundary: the checkout bootstrap is
verified, but cloud/provider runtime certification and external activation still require their
independent target-bound evidence and readback.

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
- In Claude Code on the web, configure the environment **Setup script** as
  `npm run setup:all`. Anthropic may reuse a cached successful setup, so rebuild the cache or
  run the same command explicitly after a committed-lock change. See the
  [official Claude Code web setup guide](https://code.claude.com/docs/en/claude-code-on-the-web#setup-scripts).
- Codespaces and other devcontainer clients invoke the same setup implementation from the committed
  `.devcontainer/devcontainer.json`.

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
