# `@qijenchen/design-system` package scope

Scoped augmentation only — never a second repository or product-governance SSOT.

- In the monorepo, inherit the root `AGENTS.md`; never restate or override it here. Author governance only in the owners classified by `infra/governance/protected-root-classification.json`, then regenerate the declared build graph.
- In an installed package, everything under `node_modules/@qijenchen/design-system` is immutable release material: never patch in place; fix upstream, publish an immutable exact version/BOM, upgrade the consumer by governed PR.
- Consumer governance comes from the authenticated `ds-canonical/fork/manifest.json` snapshot materialized into the consumer repo. This file is navigation only and never substitutes for that snapshot, its lock, adapters, verifier, or protected CI.
- Same owner/output boundary for rules, hooks, skills, commands, and provider views: `ds-canonical/` is the shipped canonical corpus; generated `.claude`, `.codex`, `.agents` views are rebuildable adapters, not edit targets.
