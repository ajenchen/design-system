# Cross-repository SSOT propagation

The trigger is not completion of `/knowledge-prune` or any other skill. Standard propagation is owned only by `infra/governance/release-workflow.json` and resumed by `npm run release:auto` under the standing engineering authorization.

Canonical chain:

1. `pr-checks`:the single task branch/PR contains the intended exact version and generated projections; required CI and conversation resolution pass.
2. `merge`:the PR merges through protected `main`, followed by protected-main readback.
3. `publish`:the registered Release workflow publishes the exact npm packages.
4. `readback`:GitHub Release and npm exact-version readbacks both match.
5. `consumer`:reviewed exact-version PRs land in the template and WM, and both protected `main` lockfiles read back the released version.

`release:preflight`, candidate freeze, offline signatures, preview/canary, model certification, soak, and fleet promotion are retired or optional assurance for the standard profile. Their absence never inserts a sixth step or blocks the five-step completion claim. Login/MFA/OAuth/credential reference may pause only the exact action; completion resumes automatically afterward.

No skill or SessionStart hook may install, bump, dispatch a mutable tag, write a lockfile, push consumer `main`, or silently repair drift. `release:auto`, protected CI, and live readback are authoritative; native provider hooks only provide earlier feedback.
