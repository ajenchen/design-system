# Product Workspace — Claude Code Adapter

> **Generated view**: `build-fork-governance.mjs`; this adapter is governance-owned and must stay
> byte-identical to the exact installed payload. Put product-specific, provider-neutral additions in
> `governance/overlay.md`, never below this Claude-only adapter.

This file contains Claude Code mechanics only. Shared product rules, SSOT pointers, review requirements, and quality policy come from the imported `AGENTS.md`. Operational onboarding and deploy instructions live in `README.md` and `docs/`; do not duplicate them here.

## Discovery surfaces

- `.claude/skills/**` is the generated Claude view of the same classified workflows published to `.agents/skills/**`. Change the DS canonical skill and regenerate; never maintain two versions by hand.
- `.claude/settings.json` registers the two provider-neutral thin adapters in `governance/bin/`.
  The dispatcher invokes the exact-version npm governance payload; deleting or retiring the Claude
  discovery surface cannot remove the shared launcher substrate used by other providers.
- `SessionStart` is verification-only. It may report missing `AGENTS.md`, governance lock, or installed dependencies, but it must never run `npm install`, resolve `@beta`/`latest`, rewrite a lockfile, or materialize skills.
- A native hook is fast feedback, not the trust boundary. The provider-neutral governance check and protected CI decide pass/fail even when hooks are disabled or unavailable.
- Generated hook commands clear Bash, Node, Python, and dynamic-loader startup injection before the
  repository launcher. Claude's already-running host process and any command shell created before
  that command are still the local host trust boundary; a repository hook cannot sanitize code that
  has already executed.

## Fresh environments

Use `npm run setup:all` as the Claude Code on the web environment **Setup script**. It runs
the shared locked install, signature audit, and exact installed hooks-off checker before work. The
web environment may reuse a cached setup result, so rebuild that cache or run the same command
explicitly whenever the committed lock changes. Opening or resuming a Claude session does not
mutate the checkout through repository SessionStart. If setup cannot authenticate the locked
snapshot, treat the environment as degraded and do not claim compliance.

No Claude plugin is required. Installing one may add convenience, but it cannot replace or override the committed bootstrap, exact release lock, generated provider views, or hard gates.

## Exact upgrades

`npm run sync-all` is read-only planning. Applying an upgrade requires an exact semver on a clean dedicated branch:

```text
npm run sync-all -- --to X.Y.Z
npm run sync-all -- --apply --to X.Y.Z
```

Review the resulting diff and merge only through the protected upgrade PR after governance and product CI pass. Dist-tags and semver ranges are intentionally rejected.

## Claude-specific timing

- Dispatcher bodies are read from the installed exact payload on each invocation.
- Changes to `.claude/settings.json` may hot-reload, but a fresh session only verifies discovery of
  the reviewed adapter. It is not runtime certification; certification requires current,
  independently signed target-bound evidence and external enforcement readback.
- Newly generated `.claude/skills/**` are discovered on the next session. Do not use `/clear` as a substitute for a reviewed upgrade.

For preview, Netlify, app creation, handoff, and product workflow, follow `README.md`; those rules are provider-neutral.
