---
name: governance-status
description: Fast, provider-neutral governance health check for this repository. Use when asked for governance status, adapter drift, provider parity, or whether generated governance surfaces are current.
---

# Governance status

Run the repository-owned deterministic checks below. This skill is intentionally provider-neutral and contains no user-home paths or provider-specific state.

## Checks

Run every check even when an earlier one fails:

1. `npm run --silent governance:doctor`
2. `node scripts/gen-codex-adapter.mjs --check`
3. `node scripts/build-fork-governance.mjs --check`
4. `node --test infra/governance/test/provider-surface.test.mjs`

Do not regenerate, repair, install, publish, or modify anything unless the user separately asks for a fix.

## Output

Return one compact table with each command marked `PASS`, `FAIL`, or `BLOCKED`, followed by exactly one overall state:

- `HEALTHY`: all checks pass.
- `DRIFTED`: a generated projection or snapshot differs from its authority.
- `INVALID`: a contract, provider surface, or inventory check fails.
- `BLOCKED`: required tooling or files are unavailable.

Include the first actionable diagnostic for every non-pass result. Never call the repository healthy based only on hook availability; deterministic checks and CI are authoritative.
