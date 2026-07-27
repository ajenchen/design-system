# Managed CI class adapters

This directory is the canonical, provider-neutral adapter corpus mounted from
the content-addressed control plane. Each thin adapter fixes one execution
class and delegates only to the shared verifier. The verifier accepts a fixed,
closed set of launcher arguments; it does not accept an arbitrary command,
executable path, provider credential, or network endpoint from
candidate-controlled input.

These adapters are only the candidate-side readback-verification layer. They
compare the readback's class/run and subject/frozen-artifact fields with their
fixed inputs, and verify the result and raw-receipt byte digests. Missing or
substituted bytes fail closed. The executor runtime performs the fuller
workflow-definition, repository-mount, and subject-provenance checks before it
invokes an adapter. The adapters do not themselves execute the class operation,
prove sandbox containment, establish authority, cryptographically authenticate
the readback, sign receipts, or make evidence promotion-eligible.

Those stronger invariants are separate layers: the independently administered
sandbox service must perform the fixed class operation under the activated host
policy; the host observation and final receipt must pass their respective
signature and issuer-policy checks; and external activation/staged-release
verification must bind the resulting evidence. The presence of this adapter
corpus alone is therefore not proof that any of those layers is active.
