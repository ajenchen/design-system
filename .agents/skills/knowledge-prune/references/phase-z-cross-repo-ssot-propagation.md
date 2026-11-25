# Cross-repository SSOT propagation

The trigger is not completion of `/knowledge-prune` or any other skill. Standard propagation is owned only by `infra/governance/release-workflow.json` and resumed by `npm run release:auto` under the standing engineering authorization.

Canonical chain:

1. `pr-checks`:the single task branch/PR contains the intended exact version and generated projections; required CI and conversation resolution pass.
2. `merge`:the PR merges through protected `main`, followed by protected-main readback.
3. `publish`:the registered Release workflow publishes the exact npm packages.
4. `readback`:GitHub Release and npm exact-version readbacks both match.
5. `consumer`:reviewed exact-version PRs land in the template on every release and are read back from its protected `main` lockfile. The product canary `ajenchen/workspace` (`upgrade: automatic`, `merge: consumer-owned`) gets its upgrade PR opened on every release, but merging is its own decision (user 2026-11-25 verbatim:「此外，設計系統 repo 要把 canary 換成 ajenchen/workspace，換過來之後，設計系統出新版時，這個 repo 也會自動收到升級 PR。」): it is recorded as `consumerOwned`, is not a completion condition, and its PR is never merged to make an audit green. `upgrade: on-request` remains available but no consumer uses it (it was added for work-management, retired 2026-11-25). Selection lives only in `scripts/lib/release-consumer-selection.mjs`.

`release:preflight`, candidate freeze, offline signatures, preview/canary, model certification, soak, and fleet promotion are retired or optional assurance for the standard profile. Their absence never inserts a sixth step or blocks the five-step completion claim. A human-only boundary (`infra/governance/release-workflow.json` `decisionAuthority.humanOnly`) may pause only the exact action; completion resumes automatically afterward.

No skill or SessionStart hook may install, bump, dispatch a mutable tag, write a lockfile, push consumer `main`, or silently repair drift. `release:auto`, protected CI, and live readback are authoritative; native provider hooks only provide earlier feedback.
