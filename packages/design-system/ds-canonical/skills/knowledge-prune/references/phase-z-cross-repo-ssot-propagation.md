# Cross-repository SSOT propagation

The trigger is not completion of `/knowledge-prune` or any other skill. Propagation begins only after a release-affecting PR passes every required gate and is merged through protected `main` under the standing engineering authorization.

Canonical chain:

1. The working branch contains the exact version bump, generated projections, immutable BOM, and a successful `npm run release:preflight` attestation.
2. Required PR checks, conversation resolution, product preview/canary, attestation, and external protection readback pass; no separate chat trigger or milestone approval is required.
3. The protected PR is merged. The release tag may target only the attested commit or a squash commit with an identical Git tree.
4. The Release workflow publishes immutable packages with provenance.
5. `mirror-to-published-template.yml` consumes the successful Release event, mints a short-lived GitHub App token, and opens a complete template mirror PR.
6. Fleet rollout advances through release rings. WM is the product canary. For each registered opt-in consumer selected in the current ring/wave, a reviewed fleet plan may issue one exact-version upgrade dispatch; that consumer must pass its own governance/product CI and independent readback before completion is claimed. Unregistered template descendants remain self-service and are not fleet-covered.

No skill or SessionStart hook may install, bump, dispatch a mutable tag, write a lockfile, push consumer `main`, or silently repair drift. The provider-neutral checker and protected CI are authoritative; native provider hooks only provide earlier feedback.
