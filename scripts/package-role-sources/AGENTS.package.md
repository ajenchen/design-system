# `@qijenchen/design-system` package scope

This file is a **scoped augmentation**, not a second repository or product-governance SSOT.

- Inside the design-system monorepo, inherit the repository-root `AGENTS.md`; do not restate or override it here. Author governance only in the canonical owners classified by `infra/governance/protected-root-classification.json`, then regenerate the declared build graph.
- Inside an installed npm package, treat every file under `node_modules/@qijenchen/design-system` as immutable release material. Never patch it in place; fix the upstream DS source, publish an immutable exact version/BOM, and upgrade the consumer through its governed PR flow.
- Consumer product governance comes from the authenticated `ds-canonical/fork/manifest.json` snapshot materialized into the consumer repository. This package-scoped file is navigation only and must never substitute for that snapshot, its lock, provider adapters, verifier, or protected CI.
- Rules, hooks, skills, commands, and provider views under this package follow the same owner/output boundary: `ds-canonical/` is the shipped canonical corpus; generated `.claude`, `.codex`, and `.agents` views are rebuildable adapters and are not edit targets.
