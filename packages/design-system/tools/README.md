# Design-system migration tools

This directory is shipped inside `@qijenchen/design-system`; it is the provider-neutral runtime for versioned API codemods and reviewed visual-baseline updates. Claude, Codex, hosted environments, and future models call the same package binaries and therefore do not own parallel migration logic.

- `codemods/`: exact TypeScript AST binding, versioned migration plans, manual blockers, digest-bound check/apply, and rollback-safe pathname publication.
- `visual-baseline/`: full PNG decode/CRC validation, content-addressed image statements, signed human or activated managed-broker review, and `apply-reviewed` without Git mutation.
- `shared/`: no-link path validation and the common exclusive transaction/rollback primitive.

The transaction claim is limited to cooperating writers that honor the same lock plus observed per-file pathname CAS. These tools do not claim parent-directory-swap resistance, storage power-loss durability, or protection from a non-cooperative writer that retains an old open file descriptor.
