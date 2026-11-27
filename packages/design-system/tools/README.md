# Design-system migration tools

This directory is shipped inside `@qijenchen/design-system`; it is the provider-neutral runtime for versioned API codemods and reviewed visual-baseline updates. Claude, Codex, hosted environments, and future models call the same package binaries and therefore do not own parallel migration logic.

- `codemods/`: the consumer upgrade command `qijenchen-ds-codemod upgrade [--from <version>]`. It reads the shipped change ledger `ds-changes.json` (every section from the old version to the installed one), applies the entries that carry a mechanical `fix` (rename-prop with value maps, rename-export, rename-token) through exact TypeScript AST binding, blocks ambiguous files without touching them, and prints a markdown report of everything left (file:line, what to do, spec section). `plan` / `check` / `apply` keep the digest-bound proposal flow with rollback-safe pathname publication. The rules live only in the ledger; the tool hard-codes none.
- `changes/`: the ledger reader shared by the upgrade command, the DS public-surface gate, the release-notes coverage gate, the GitHub Release notes (Added / Behavior and visual changes / Breaking changes, in that order), and the consumer write-time check of removed names (Node built-ins only).
- `visual-baseline/`: full PNG decode/CRC validation, content-addressed image statements, signed human or activated managed-broker review, and `apply-reviewed` without Git mutation.
- `shared/`: no-link path validation and the common exclusive transaction/rollback primitive.

The transaction claim is limited to cooperating writers that honor the same lock plus observed per-file pathname CAS. These tools do not claim parent-directory-swap resistance, storage power-loss durability, or protection from a non-cooperative writer that retains an old open file descriptor.
