# Independent peer transport contract

Transport selection is a provider-adapter concern. The workflow only accepts a transport that can prove all of these properties:

- the peer provider differs from the primary provider;
- the peer runs in a separate context;
- the exact frozen brief and evidence digests are retained;
- the peer is read-only through an immutable snapshot or enforced write denial;
- provider, model, transport, start/end time, and response digest are recorded;
- retry and duplicate handling cannot replace or merge responses silently.

## Selection order

1. Prefer an orchestrator or external service that exposes verifiable provider identity and read-only controls.
2. Otherwise use a local or remote provider process only when it is genuinely a different registered provider and its input/output artifacts can be digested.
3. If neither option proves identity, isolation, and immutability, return `REVIEW-BLOCKED`.

Latency, convenience, or an existing login never relaxes the contract. A same-provider worker, renamed command, prompt variation, or byte-identical adapter is not independent evidence.

## Artifact record

Persist only repository-approved evidence and never credentials:

```json
{
  "primaryProvider": "<id>",
  "peerProvider": "<different-id>",
  "transport": "<registered-binding>",
  "briefDigest": "sha256:<hex>",
  "inventoryDigest": "sha256:<hex>",
  "rubricDigest": "sha256:<hex>",
  "responseDigest": "sha256:<hex>",
  "readOnly": true,
  "startedAt": "<ISO-8601>",
  "completedAt": "<ISO-8601>"
}
```

The provider adapter decides the concrete command, API, queue, or comment mechanism. Canonical workflow files must not embed one.
