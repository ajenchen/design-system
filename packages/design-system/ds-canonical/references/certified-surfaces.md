# Provider surface certification policy

> This document explains the policy; it is not a certification ledger. The only machine-readable
> status authority is `infra/governance/providers/certifications.json`, validated against
> `infra/governance/schemas/provider-surface-certification.schema.json` and the exact runtime
> profiles/evidence named by that control plane. A prose table, hook log, local development history,
> or old canary may never upgrade a status.

Every provider surface starts as `not-certified`. Repository projection tests prove deterministic
generation only; they do not prove that a particular Claude Code, Codex, desktop, cloud, remote,
CI, operating-system, architecture, path-class, or distribution-version target loaded and enforced
the projection. Native hooks are feedback accelerators and are never the security boundary. Missing
native events are recorded in the signed product manifest with the authoritative fallback
`immutable-governance-check-and-protected-ci`.

The current committed certification ledger intentionally remains `not-certified` for every real
target because no independently signed, target-bound runtime evidence and no verified external
required-check/readback chain have been activated in this repository. Historical experiments can
guide a new probe, but cannot be replayed as current certification after the provider registry,
runtime profile, hook contract, package, operating environment, or distribution version changes.

The activated-authority workflow builder already exists:
`managedCiActivatedWorkflowDocument` and `renderManagedCiActivatedWorkflow` in
`scripts/lib/managed-ci-trusted-execution-plan.mjs` render only the closed reviewed workflow
contract. Builder availability is not activation. The committed
`scripts/managed-ci-trusted-execution-plan.json` still has null external activation bindings,
including workflow/repository identity, executor provenance, authority attestations, signer
readback, and every execution-class image supply-chain digest. The verifier therefore requires the
pinned manual refusal scaffold and reports the managed workflow blocked. No transport, hosted
runtime, certification, or enforcement claim is valid until an external authority supplies those
bindings and the committed verifier accepts their exact readback.

## Promotion rule

A status may change only through the provider-neutral control plane:

1. Run the registered clean-room probe on one exact target tuple: provider/surface, operating
   system, Node platform, architecture, execution environment, distribution version, and path class.
2. Bind all required instruction, skill, hook/event, hard-gate, package, and readback observations to
   the current registry/profile/artifact digests.
3. Obtain the required independent issuer signatures. Private signing material must stay outside the
   repository and model environment.
4. Verify expiry, revocation, issuer quorum, target matrix, managed-host identity, required-check
   enforcement, and evidence provenance with the committed validators.
5. Change the ledger and release state in the same reviewed transition. Any mismatch, stale evidence,
   missing event, unsupported native Windows target, or absent external activation remains
   `not-certified` (or `unsupported` where the schema permits it).

Generation, schema validation, poison tests, local macOS execution, WSL2/devcontainer compatibility
declarations, and a green provider-neutral checker are necessary controls, but none independently
constitutes provider runtime certification.
