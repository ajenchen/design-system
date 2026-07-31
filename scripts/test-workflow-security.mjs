#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { auditWorkflowSources } from './audit-workflow-security.mjs'
import {
  compareExactSemver,
  parseExactSemver,
} from './workflow-static-validation.mjs'

const npmrc = 'ignore-scripts=true\nlegacy-peer-deps=true\n'
const trustedPublisher = `
receiptItem.status = 'submitting'
writeAtomicJson(receiptPath, receipt)
await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)
const staged = npmResult(npmCli, ['stage', 'publish', archive, '--tag', context.stagingTag, '--provenance', '--json'])
receiptItem.status = 'ambiguous'
writeAtomicJson(receiptPath, receipt)
receiptItem.stageId = evidence.stageId
receiptItem.status = 'staged'
writeAtomicJson(receiptPath, receipt)
`
const base = {
  '.github/workflows/ci.yml': 'on:\n  pull_request:\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n        with:\n          persist-credentials: false\n      - run: npm ci --ignore-scripts\n      - run: npm audit signatures\n      - run: npm audit --audit-level=high\n      - run: npm run --silent test:governance-harnesses\n',
  '.github/workflows/a11y-and-size.yml': 'on:\n  pull_request:\njobs: {}\n',
  '.github/workflows/visual-regression.yml': 'on:\n  pull_request:\njobs: {}\n',
  '.github/workflows/composition-fidelity.yml': 'on:\n  pull_request:\njobs:\n  composition:\n    steps:\n      - run: node scripts/composition-fidelity-visual-diff.mjs --require-mappings\n',
  '.github/workflows/packaging-canary.yml': 'on:\n  pull_request:\njobs:\n  packaging:\n    steps:\n      - run: node scripts/test-fork-governance.mjs\n',
  '.github/workflows/release.yml': `on:
  repository_dispatch:
    types: [stage-protected-release]
jobs:
  resolve-release-request:
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
    steps:
      - run: |
          test "$event_commit" = "$main_commit"
          test "$tag_commit" = "$main_commit"
  trust-preflight:
    needs: resolve-release-request
    permissions:
      contents: read
      actions: read
      checks: read
    steps:
      - id: resolve_trust
        env:
          GH_TOKEN: \${{ secrets.RELEASE_TRUST_PREFLIGHT_TOKEN || github.token }}
        run: node scripts/release-trust-preflight.mjs --release-tag tag
  build-release-evidence:
    needs: [resolve-release-request]
    permissions:
      contents: read
    outputs:
      release_set_sha256: \${{ steps.release_set.outputs.sha256 }}
    steps:
      - run: git merge-base --is-ancestor tag refs/remotes/origin/main
      - run: node scripts/release-sbom.mjs --input "$RUNNER_TEMP/release.sbom.raw.json" --output "$GITHUB_WORKSPACE/release-artifacts/release.sbom.cdx.json" --tag "$RELEASE_TAG" --git-tree "\${{ needs.resolve-release-request.outputs.release_tree }}"
      - run: npm run --silent test:governance-harnesses
      - id: release_set
      - uses: actions/upload-artifact@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  attest-release:
    needs: [trust-preflight, build-release-evidence]
    permissions:
      contents: read
      id-token: write
      attestations: write
    steps:
      - run: node scripts/release-set.mjs --expected digest
      - run: node scripts/build-release-bom.mjs --verify
      - run: echo release-trust-\${{ github.run_id }}-\${{ github.run_attempt }}
      - run: node scripts/release-trust-preflight.mjs --verify evidence --expected-authorization-digest digest
      - run: node scripts/release-remote-tag.mjs --expected commit --expected-object object --token-env GH_TOKEN
      - uses: actions/attest@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  publish-npm:
    needs: [trust-preflight, build-release-evidence, attest-release]
    environment:
      name: npm-release
    permissions:
      contents: read
      id-token: write
    outputs:
      stage_artifact_digest: \${{ steps.finalizer_handoff.outputs.stage_artifact_digest }}
      stage_receipt_sha256: \${{ steps.finalizer_handoff.outputs.stage_receipt_sha256 }}
    steps:
      - run: node scripts/release-set.mjs --expected digest
      - run: node scripts/build-release-bom.mjs --verify
      - run: echo release-trust-\${{ github.run_id }}-\${{ github.run_attempt }}
      - run: node scripts/release-trust-preflight.mjs --verify evidence --expected-authorization-digest digest
      - run: node scripts/release-remote-tag.mjs --expected commit --expected-object object --token-env GH_TOKEN
      - run: node scripts/release-npm-publish.mjs --receipt "$RUNNER_TEMP/npm-stage/npm-stage-receipt.json" --trust-artifact-digest digest --trust-run-attempt "$GITHUB_RUN_ATTEMPT"
      - if: always()
        run: sha256sum "$receipt"
      - if: always()
        uses: actions/upload-artifact@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
        with:
          name: npm-stage-\${{ github.event.client_payload.tag }}-\${{ github.run_id }}-\${{ github.run_attempt }}
      - id: finalizer_handoff
        env:
          STAGE_ARTIFACT_DIGEST: \${{ steps.retain_stage.outputs.artifact-digest }}
        run: echo "$GITHUB_STEP_SUMMARY"
`,
  '.github/workflows/release-finalize.yml': `on:
  repository_dispatch:
    types: [finalize-staged-release]
jobs:
  certify-finalization:
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      actions: read
    outputs:
      tag_object: \${{ steps.issued_trust.outputs.tag_object }}
      release_trust_evidence_file_sha256: \${{ steps.issued_trust.outputs.evidence_file_sha256 }}
    steps:
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          ref: refs/tags/\${{ github.event.client_payload.tag }}
          persist-credentials: false
      - run: git merge-base --is-ancestor tag refs/remotes/origin/main
      - run: echo 'client_payload | keys | sort stage_artifact_digest'
      - run: echo \${{ github.event.client_payload.stage_artifact_digest }} \${{ github.event.client_payload.release_authorization_digest }} \${{ github.event.client_payload.release_trust_evidence_digest }} \${{ github.event.client_payload.release_trust_artifact_digest }}
      - run: node scripts/release-stage-run-identity.mjs --release-trust-artifact-digest "\${{ github.event.client_payload.release_trust_artifact_digest }}"
      - name: Download exact original release trust evidence
        uses: actions/download-artifact@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
        with:
          name: release-trust-\${{ github.event.client_payload.stage_run_id }}-\${{ github.event.client_payload.stage_run_attempt }}
      - id: issued_trust
        run: node scripts/release-trust-preflight.mjs --verify-issued evidence.json --expected-authorization-digest "\${{ github.event.client_payload.release_authorization_digest }}" --retain-exact "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json" --github-output "$GITHUB_OUTPUT"
      - name: Download the exact durable stage receipt
        run: echo download
      - run: node scripts/run-verified-npm.mjs -- pack ./packages/design-system
      - run: node scripts/run-verified-npm.mjs -- pack ./packages/storybook-config
      - run: node scripts/run-verified-npm.mjs -- pack ./packages/governance
      - run: node scripts/release-sbom.mjs --input "$RUNNER_TEMP/release.sbom.raw.json" --output "$GITHUB_WORKSPACE/release-artifacts/release.sbom.cdx.json" --tag "\${{ github.event.client_payload.tag }}" --git-tree "\${{ steps.identity.outputs.tree }}"
      - run: echo \${{ github.event.client_payload.stage_receipt_sha256 }}
      - run: node scripts/build-release-bom.mjs --allow-repository-dispatch
      - run: node scripts/release-set.mjs --expected "\${{ github.event.client_payload.release_set_sha256 }}"
      - run: echo npm-stage-\${{ github.event.client_payload.tag }}-\${{ github.event.client_payload.stage_run_id }}-\${{ github.event.client_payload.stage_run_attempt }}
      - id: signed_tag
        run: node scripts/release-remote-tag.mjs --expected-object "\${{ steps.issued_trust.outputs.tag_object }}" --github-output "$GITHUB_OUTPUT"
      - run: node scripts/release-npm-finalize-verify.mjs --tag-object "\${{ steps.issued_trust.outputs.tag_object }}" --release-authorization-digest "\${{ github.event.client_payload.release_authorization_digest }}" --release-trust-evidence-digest "\${{ github.event.client_payload.release_trust_evidence_digest }}" --release-trust-evidence-file "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json" --release-trust-evidence-file-sha256 "\${{ steps.issued_trust.outputs.evidence_file_sha256 }}" --release-trust-artifact-digest "\${{ github.event.client_payload.release_trust_artifact_digest }}"
      - uses: actions/upload-artifact@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
        with:
          path: |
            finalization-evidence/release-trust-preflight.json
            finalization-evidence/npm-finalization-receipt.json
  publish-github-release:
    if: github.ref == 'refs/heads/main'
    needs: certify-finalization
    permissions:
      contents: write
      actions: read
    environment:
      name: release-finalize
    steps:
      - run: node scripts/release-set.mjs --expected "\${{ needs.certify-finalization.outputs.release_set_sha256 }}"
      - run: node scripts/release-stage-run-identity.mjs --release-trust-artifact-digest "\${{ github.event.client_payload.release_trust_artifact_digest }}"
      - run: node scripts/release-npm-finalization-receipt.mjs --tag-object "\${{ needs.certify-finalization.outputs.tag_object }}" --release-authorization-digest "\${{ github.event.client_payload.release_authorization_digest }}" --release-trust-evidence-digest "\${{ github.event.client_payload.release_trust_evidence_digest }}" --release-trust-evidence-file "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json" --release-trust-evidence-file-sha256 "\${{ needs.certify-finalization.outputs.release_trust_evidence_file_sha256 }}" --release-trust-artifact-digest "\${{ github.event.client_payload.release_trust_artifact_digest }}"
      - env:
          TAG_READ_TOKEN: \${{ secrets.RELEASE_TAG_READ_TOKEN }}
        run: node scripts/release-remote-tag.mjs --expected-object "\${{ needs.certify-finalization.outputs.tag_object }}" --token-env TAG_READ_TOKEN
      - env:
          TAG_READ_TOKEN: \${{ secrets.RELEASE_TAG_READ_TOKEN }}
        run: node scripts/release-github-release.mjs --tag-object "\${{ needs.certify-finalization.outputs.tag_object }}" --tag-token-env TAG_READ_TOKEN --audit-evidence "$GITHUB_WORKSPACE/finalization-evidence/npm-finalization-receipt.json" --audit-evidence-sha256 "\${{ needs.certify-finalization.outputs.finalization_receipt_sha256 }}" --release-trust-evidence "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json" --release-trust-evidence-sha256 "\${{ needs.certify-finalization.outputs.release_trust_evidence_file_sha256 }}"
`,
  '.github/workflows/mirror-to-published-template.yml': 'on: {}\njobs:\n  certify-mirror:\n    outputs:\n      artifact_digest: ${{ steps.upload.outputs.artifact-digest }}\n    steps:\n      - id: certify\n      - run: test "$(gh api release --jq \'.immutable // false\')" = true\n      - id: upload\n      - run: git merge-base --is-ancestor a b\n  write-mirror-pr:\n    needs: certify-mirror\n    environment:\n      name: governance-mirror\n    steps:\n      - name: Fail closed on artifact or receipt substitution\n        env:\n          EXPECTED_ARCHIVE_SHA: ${{ needs.certify-mirror.outputs.archive_sha256 }}\n      - uses: actions/create-github-app-token@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n        with:\n          app-id: ${{ secrets.GOVERNANCE_WRITER_APP_ID }}\n          private-key: ${{ secrets.GOVERNANCE_WRITER_APP_PRIVATE_KEY }}\n          permission-contents: write\n          permission-pull-requests: write\n          permission-workflows: write\n      - run: BRANCH="governance/mirror-${BUILT_VER//./-}-${SOURCE_SHA:0:12}"\n      - name: Open PR(no direct main write)\n',
  'template/ds-product-template/.github/workflows/governance-anchor.yml': `on:
  pull_request_target:
  repository_dispatch:
    types: [governance-upgrade-candidate-validation]
permissions:
  contents: read
jobs:
  verify-candidate:
    outputs:
      head_sha: \${{ steps.request.outputs.head_sha }}
    steps:
      - id: request
        run: |
          test governance-upgrade-writer-v1
          jq -e '(.client_payload | keys | sort)'
          jq -r '.base.ref' pr.json
          jq -r '.base.sha' pr.json
          jq -r '.head.sha' pr.json
          gh api repos/$GITHUB_REPOSITORY/git/ref/heads/main
      - uses: actions/checkout@cccccccccccccccccccccccccccccccccccccccc
        with:
          persist-credentials: false
          ref: \${{ steps.request.outputs.head_sha }}
  publish-app-verdict:
    if: \${{ always() && needs.verify-candidate.outputs.head_sha != '' }}
    needs: verify-candidate
    steps:
      - uses: actions/create-github-app-token@dddddddddddddddddddddddddddddddddddddddd
        with:
          app-id: \${{ secrets.GOVERNANCE_CHECK_APP_ID }}
          private-key: \${{ secrets.GOVERNANCE_CHECK_APP_PRIVATE_KEY }}
          permission-checks: write
      - run: echo \${{ needs.verify-candidate.outputs.head_sha }} && gh api repos/$GITHUB_REPOSITORY/check-runs # Immutable consumer snapshot
`,
  'template/ds-product-template/.github/workflows/sync-design-system.yml': `on: {}
# no direct main write
jobs:
  certify-upgrade:
    outputs:
      base_sha: \${{ steps.source.outputs.sha }}
      version: \${{ steps.evidence.outputs.version }}
      patch_sha256: \${{ steps.evidence.outputs.patch_sha256 }}
      tree_sha256: \${{ steps.evidence.outputs.tree_sha256 }}
      authority_sha256: \${{ steps.evidence.outputs.authority_sha256 }}
    steps:
      - id: source
      - uses: actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          node-version: '24.14.0'
      - id: evidence
        run: node scripts/verify-upgrade-evidence.mjs --certify-staged --previous-root "$PREVIOUS_ROOT" --sync-report "$RUNNER_TEMP/sync-all-report.json"
  verify-upgrade:
    needs: certify-upgrade
    permissions:
      contents: read
    outputs:
      verification_sha256: \${{ steps.verified.outputs.verification_sha256 }}
    steps:
      - uses: actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          node-version: '24.14.0'
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          persist-credentials: false
          ref: \${{ github.sha }}
      - name: Independently reconstruct exact incoming tree without write authority
        id: verified
        run: |
          node scripts/verify-upgrade-evidence.mjs --verify-only --live-main-remote origin \\
            --base-sha "\${{ needs.certify-upgrade.outputs.base_sha }}" \\
            --version "\${{ needs.certify-upgrade.outputs.version }}" \\
            --expected-patch-sha256 "\${{ needs.certify-upgrade.outputs.patch_sha256 }}" \\
            --expected-tree-sha "\${{ needs.certify-upgrade.outputs.tree_sha256 }}" \\
            --expected-authority-sha256 "\${{ needs.certify-upgrade.outputs.authority_sha256 }}"
  write-upgrade-pr:
    name: Apply preverified evidence + open Writer App reviewed PR
    needs: [certify-upgrade, verify-upgrade]
    environment:
      name: governance-upgrade
    permissions:
      contents: read
    steps:
      - uses: actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          node-version: '24.14.0'
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          persist-credentials: false
          ref: \${{ needs.verify-upgrade.outputs.base_sha }}
      - name: Install authenticated protected-base verifier only
        run: |
          test "\$(git rev-parse HEAD)" = "\${{ needs.verify-upgrade.outputs.base_sha }}"
          npm run setup:governance
      - name: Apply protected-base verified bytes
        run: |
          node scripts/verify-upgrade-evidence.mjs --apply-preverified --live-main-remote origin \\
            --expected-verification-sha256 "\${{ needs.verify-upgrade.outputs.verification_sha256 }}"
      - uses: actions/create-github-app-token@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
        id: app-token
        with:
          app-id: \${{ secrets.GOVERNANCE_WRITER_APP_ID }}
          private-key: \${{ secrets.GOVERNANCE_WRITER_APP_PRIVATE_KEY }}
          permission-contents: write
          permission-pull-requests: write
          permission-workflows: write
      - env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
          GH_PROMPT_DISABLED: '1'
          PATH: /usr/bin:/bin
          HOME: \${{ runner.temp }}/upgrade-writer-home
          XDG_CONFIG_HOME: \${{ runner.temp }}/upgrade-writer-home/xdg
          GH_CONFIG_DIR: \${{ runner.temp }}/upgrade-writer-home/gh
          GIT_CONFIG_NOSYSTEM: '1'
          GIT_CONFIG_GLOBAL: /dev/null
          GIT_TERMINAL_PROMPT: '0'
          GIT_ASKPASS: /bin/false
          SSH_ASKPASS: /bin/false
          GIT_PAGER: /bin/cat
          PAGER: /bin/cat
          GIT_CONFIG_COUNT: '4'
          GIT_CONFIG_KEY_0: credential.helper
          GIT_CONFIG_VALUE_0: ''
          GIT_CONFIG_KEY_1: credential.helper
          GIT_CONFIG_VALUE_1: '!/usr/bin/gh auth git-credential'
          GIT_CONFIG_KEY_2: core.hooksPath
          GIT_CONFIG_VALUE_2: /dev/null
          GIT_CONFIG_KEY_3: protocol.file.allow
          GIT_CONFIG_VALUE_3: never
          GIT_AUTHOR_NAME: Qijenchen Governance Writer App
          GIT_AUTHOR_EMAIL: qijenchen-governance-writer[bot]@users.noreply.github.com
          GIT_COMMITTER_NAME: Qijenchen Governance Writer App
          GIT_COMMITTER_EMAIL: qijenchen-governance-writer[bot]@users.noreply.github.com
          WRITER_LOGIN: qijenchen-governance-writer[bot]
        run: |
          set -euo pipefail
          WRITER_TOKEN="$GH_TOKEN"
          unset GH_TOKEN
          git() {
            local token_environment=()
            case "\${1:-}" in
              fetch|ls-remote|push)
                token_environment=(GH_TOKEN="$WRITER_TOKEN" GH_PROMPT_DISABLED=1)
                ;;
            esac
            /usr/bin/env -i \\
              GIT_CONFIG_NOSYSTEM=1 \\
              GIT_CONFIG_GLOBAL=/dev/null \\
              GIT_TERMINAL_PROMPT=0 \\
              GIT_ASKPASS=/bin/false \\
              SSH_ASKPASS=/bin/false \\
              GIT_PAGER=/bin/cat \\
              PAGER=/bin/cat \\
              GIT_CONFIG_COUNT=4 \\
              GIT_CONFIG_KEY_0=credential.helper \\
              GIT_CONFIG_VALUE_0= \\
              GIT_CONFIG_KEY_1=credential.helper \\
              GIT_CONFIG_VALUE_1='!/usr/bin/gh auth git-credential' \\
              GIT_CONFIG_KEY_2=core.hooksPath \\
              GIT_CONFIG_VALUE_2=/dev/null \\
              GIT_CONFIG_KEY_3=protocol.file.allow \\
              GIT_CONFIG_VALUE_3=never \\
              GIT_AUTHOR_NAME='Qijenchen Governance Writer App' \\
              GIT_AUTHOR_EMAIL='qijenchen-governance-writer[bot]@users.noreply.github.com' \\
              GIT_COMMITTER_NAME='Qijenchen Governance Writer App' \\
              GIT_COMMITTER_EMAIL='qijenchen-governance-writer[bot]@users.noreply.github.com' \\
              "\${token_environment[@]}" \\
              /usr/bin/git "$@"
          }
          BRANCH="governance/upgrade-\${VERSION//./-}-\${BASE_SHA:0:12}" # deterministic branch
          LIVE_MAIN_SHA=$(git ls-remote --exit-code origin refs/heads/main)
          test "$LIVE_MAIN_SHA" = "$BASE_SHA"
          git commit --no-gpg-sign -m upgrade
          git push origin "$BRANCH"
          git fetch --force --no-tags origin "$BRANCH"
          LIVE_MAIN_SHA=$(git ls-remote --exit-code origin refs/heads/main)
          test "$LIVE_MAIN_SHA" = "$BASE_SHA"
          LIVE_MAIN_SHA=$(git ls-remote --exit-code origin refs/heads/main)
          test "$LIVE_MAIN_SHA" = "$BASE_SHA"
          REMOTE_LINE=x
          test "$(wc -w <<<"$REMOTE_LINE" | tr -d ' ')" = 2
          test "$REMOTE_TREE" = "$DESIRED_TREE" && test "$REMOTE_PARENT" = "$BASE_SHA"
          gh pr list --json number,url,author,baseRefName,headRefName,headRefOid,isCrossRepository
          test "$(jq -r '.[0].author.login' <<<"$PR_JSON")" = "$WRITER_LOGIN"
          test "$(jq -r '.[0].baseRefName' <<<"$PR_JSON")" = main
          test "$(jq -r '.[0].headRefName' <<<"$PR_JSON")" = "$BRANCH"
          test "$(jq -r '.[0].isCrossRepository' <<<"$PR_JSON")" = false
          test "$(jq -r '.[0].headRefOid' <<<"$PR_JSON")" = "$REMOTE_COMMIT"
          test "$LIVE_MAIN_SHA" = "$BASE_SHA" && test "$LIVE_BRANCH_SHA" = "$REMOTE_COMMIT"
          echo governance-upgrade-writer-v1
          echo '{event_type:"governance-upgrade-candidate-validation"}'
          WRITER_TOKEN=''
          unset WRITER_TOKEN
`,
}

base['.github/workflows/mirror-to-published-template.yml'] = `on:
  workflow_run:
    workflows: [Finalize staged release]
    types: [completed]
  repository_dispatch:
    types: [mirror-template-request]
concurrency:
  group: \${{ github.repository }}-mirror-\${{ github.event.workflow_run.id || github.event.client_payload.finalizer_run_id }}-\${{ github.event.workflow_run.run_attempt || github.event.client_payload.finalizer_run_attempt }}
  cancel-in-progress: false
permissions:
  contents: read
jobs:
  certify-mirror:
    if: \${{ github.event_name == 'repository_dispatch' || github.event.workflow_run.conclusion == 'success' }}
    permissions:
      actions: read
      contents: read
    outputs:
      ready: \${{ steps.certify.outputs.ready }}
      trusted_sha: \${{ steps.handoff.outputs.trusted_sha }}
      handoff_sha256: \${{ steps.handoff.outputs.handoff_sha256 }}
      finalizer_workflow_source_sha: \${{ steps.handoff.outputs.finalizer_workflow_source_sha }}
      finalizer_run_id: \${{ steps.handoff.outputs.finalizer_run_id }}
      finalizer_run_attempt: \${{ steps.handoff.outputs.finalizer_run_attempt }}
      finalizer_artifact_id: \${{ steps.handoff.outputs.finalizer_artifact_id }}
      finalizer_artifact_digest: \${{ steps.handoff.outputs.finalizer_artifact_digest }}
      release_id: \${{ steps.handoff.outputs.release_id }}
      release_tag: \${{ steps.handoff.outputs.release_tag }}
      version: \${{ steps.handoff.outputs.version }}
      tag_object: \${{ steps.handoff.outputs.tag_object }}
      source_sha: \${{ steps.handoff.outputs.release_commit }}
      source_tree: \${{ steps.handoff.outputs.release_tree }}
      release_set_sha256: \${{ steps.handoff.outputs.release_set_sha256 }}
      release_bom_sha256: \${{ steps.handoff.outputs.release_bom_sha256 }}
      finalization_receipt_sha256: \${{ steps.handoff.outputs.finalization_receipt_sha256 }}
      release_trust_evidence_sha256: \${{ steps.handoff.outputs.release_trust_evidence_sha256 }}
      archive_sha256: \${{ steps.archive.outputs.archive_sha256 }}
      tree_sha256: \${{ steps.archive.outputs.tree_sha256 }}
      scaffold_lock_sha256: \${{ steps.archive.outputs.scaffold_lock_sha256 }}
      artifact_id: \${{ steps.upload.outputs.artifact-id }}
      artifact_digest: \${{ steps.upload.outputs.artifact-digest }}
    steps:
      - name: Validate closed retry request
        if: \${{ github.event_name == 'repository_dispatch' }}
        env:
          FINALIZER_RUN_ID: \${{ github.event.workflow_run.id || github.event.client_payload.finalizer_run_id }}
          FINALIZER_RUN_ATTEMPT: \${{ github.event.workflow_run.run_attempt || github.event.client_payload.finalizer_run_attempt }}
        run: jq -e '(.client_payload | keys | sort) == ["finalizer_run_attempt","finalizer_run_id"]' "$GITHUB_EVENT_PATH"
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          persist-credentials: false
          ref: \${{ github.sha }}
          path: trusted
      - name: Prove trusted checkout is current protected main
        env:
          TRUSTED_SHA: \${{ github.sha }}
        run: |
          git -C trusted fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'
          test "$(git -C trusted rev-parse 'HEAD^{commit}')" = "$TRUSTED_SHA"
          test "$TRUSTED_SHA" = "$(git -C trusted rev-parse 'refs/remotes/origin/main^{commit}')"
      - id: handoff
        env:
          GH_TOKEN: \${{ github.token }}
          FINALIZER_RUN_ID: \${{ github.event.workflow_run.id || github.event.client_payload.finalizer_run_id }}
          FINALIZER_RUN_ATTEMPT: \${{ github.event.workflow_run.run_attempt || github.event.client_payload.finalizer_run_attempt }}
        run: |
          node trusted/scripts/release-finalizer-mirror-handoff.mjs \
            --repository "$GITHUB_REPOSITORY" --finalizer-run-id "$FINALIZER_RUN_ID" \
            --finalizer-run-attempt "$FINALIZER_RUN_ATTEMPT" --token-env GH_TOKEN \
            --output "$RUNNER_TEMP/finalizer-handoff.json"
          echo release_commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          persist-credentials: false
          ref: \${{ steps.handoff.outputs.release_commit }}
          path: source
      - name: Prove exact immutable release source
        run: |
          test "$(git -C source rev-parse 'HEAD^{commit}')" = "$SOURCE_SHA"
          test "$(git -C source rev-parse 'HEAD^{tree}')" = "$SOURCE_TREE"
          git -C source fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'
          git -C source merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main
      - id: certify
        run: node source/scripts/verify-mirror-release.mjs && echo ready=true >> "$GITHUB_OUTPUT"
      - id: archive
        run: echo archive
      - id: upload
        uses: actions/upload-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          name: mirror-\${{ github.run_id }}-\${{ github.run_attempt }}
  write-mirror-pr:
    needs: certify-mirror
    if: \${{ needs.certify-mirror.result == 'success' && needs.certify-mirror.outputs.ready == 'true' }}
    environment:
      name: governance-mirror
    permissions:
      actions: read
      contents: read
    steps:
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          persist-credentials: false
          ref: \${{ github.sha }}
          path: trusted
      - name: Re-resolve finalized release handoff and compare every identity
        env:
          READY: \${{ needs.certify-mirror.outputs.ready }}
          EXPECTED_TRUSTED_SHA: \${{ needs.certify-mirror.outputs.trusted_sha }}
          EXPECTED_HANDOFF_SHA256: \${{ needs.certify-mirror.outputs.handoff_sha256 }}
          FINALIZER_WORKFLOW_SOURCE_SHA: \${{ needs.certify-mirror.outputs.finalizer_workflow_source_sha }}
          FINALIZER_RUN_ID: \${{ needs.certify-mirror.outputs.finalizer_run_id }}
          FINALIZER_RUN_ATTEMPT: \${{ needs.certify-mirror.outputs.finalizer_run_attempt }}
          FINALIZER_ARTIFACT_ID: \${{ needs.certify-mirror.outputs.finalizer_artifact_id }}
          FINALIZER_ARTIFACT_DIGEST: \${{ needs.certify-mirror.outputs.finalizer_artifact_digest }}
          RELEASE_ID: \${{ needs.certify-mirror.outputs.release_id }}
          RELEASE_TAG: \${{ needs.certify-mirror.outputs.release_tag }}
          VERSION: \${{ needs.certify-mirror.outputs.version }}
          TAG_OBJECT: \${{ needs.certify-mirror.outputs.tag_object }}
          SOURCE_SHA: \${{ needs.certify-mirror.outputs.source_sha }}
          SOURCE_TREE: \${{ needs.certify-mirror.outputs.source_tree }}
          RELEASE_SET_SHA256: \${{ needs.certify-mirror.outputs.release_set_sha256 }}
          RELEASE_BOM_SHA256: \${{ needs.certify-mirror.outputs.release_bom_sha256 }}
          FINALIZATION_RECEIPT_SHA256: \${{ needs.certify-mirror.outputs.finalization_receipt_sha256 }}
          RELEASE_TRUST_EVIDENCE_SHA256: \${{ needs.certify-mirror.outputs.release_trust_evidence_sha256 }}
          ARCHIVE_SHA256: \${{ needs.certify-mirror.outputs.archive_sha256 }}
          TREE_SHA256: \${{ needs.certify-mirror.outputs.tree_sha256 }}
          SCAFFOLD_LOCK_SHA256: \${{ needs.certify-mirror.outputs.scaffold_lock_sha256 }}
          ARTIFACT_ID: \${{ needs.certify-mirror.outputs.artifact_id }}
          ARTIFACT_DIGEST: \${{ needs.certify-mirror.outputs.artifact_digest }}
          GH_TOKEN: \${{ github.token }}
        run: |
          TRUSTED_SHA=$(git -C trusted rev-parse 'HEAD^{commit}')
          test "$TRUSTED_SHA" = "$EXPECTED_TRUSTED_SHA"
          HANDOFF="$RUNNER_TEMP/fresh-handoff.json"
          node trusted/scripts/release-finalizer-mirror-handoff.mjs \
            --repository "$GITHUB_REPOSITORY" --finalizer-run-id "$FINALIZER_RUN_ID" \
            --finalizer-run-attempt "$FINALIZER_RUN_ATTEMPT" --token-env GH_TOKEN \
            --output "$HANDOFF"
          test "$(sha256sum "$HANDOFF" | cut -d' ' -f1)" = "$EXPECTED_HANDOFF_SHA256"
          test "$(jq -er '.workflowSourceSha' "$HANDOFF")" = "$FINALIZER_WORKFLOW_SOURCE_SHA"
          test "$(jq -er '.finalizerRun.runId' "$HANDOFF")" = "$FINALIZER_RUN_ID"
          test "$(jq -er '.finalizerRun.runAttempt' "$HANDOFF")" = "$FINALIZER_RUN_ATTEMPT"
          test "$(jq -er '.artifact.id' "$HANDOFF")" = "$FINALIZER_ARTIFACT_ID"
          test "$(jq -er '.artifact.digest' "$HANDOFF")" = "$FINALIZER_ARTIFACT_DIGEST"
          test "$(jq -er '.release.releaseId' "$HANDOFF")" = "$RELEASE_ID"
          test "$(jq -er '.release.tag' "$HANDOFF")" = "$RELEASE_TAG"
          test "$(jq -er '.release.version' "$HANDOFF")" = "$VERSION"
          test "$(jq -er '.release.tagObject' "$HANDOFF")" = "$TAG_OBJECT"
          test "$(jq -er '.release.releaseCommit' "$HANDOFF")" = "$SOURCE_SHA"
          test "$(jq -er '.release.releaseTree' "$HANDOFF")" = "$SOURCE_TREE"
          test "$(jq -er '.release.releaseSetSha256' "$HANDOFF")" = "$RELEASE_SET_SHA256"
          test "$(jq -er '.release.bomSha256' "$HANDOFF")" = "$RELEASE_BOM_SHA256"
          test "$(jq -er '.release.finalizationReceiptSha256' "$HANDOFF")" = "$FINALIZATION_RECEIPT_SHA256"
          test "$(jq -er '.release.releaseTrustEvidenceSha256' "$HANDOFF")" = "$RELEASE_TRUST_EVIDENCE_SHA256"
      - name: Verify same-run artifact identity
        env:
          GH_TOKEN: \${{ github.token }}
          MIRROR_EVENT: \${{ github.event_name }}
          MIRROR_HEAD_SHA: \${{ github.sha }}
          MIRROR_RUN_ID: \${{ github.run_id }}
          MIRROR_RUN_ATTEMPT: \${{ github.run_attempt }}
          ARTIFACT_ID: \${{ needs.certify-mirror.outputs.artifact_id }}
          ARTIFACT_DIGEST: \${{ needs.certify-mirror.outputs.artifact_digest }}
        run: |
          node trusted/scripts/mirror-run-artifact-identity.mjs \
            --repository "$GITHUB_REPOSITORY" --event "$MIRROR_EVENT" --head-sha "$MIRROR_HEAD_SHA" \
            --run-id "$MIRROR_RUN_ID" --run-attempt "$MIRROR_RUN_ATTEMPT" \
            --artifact-id "$ARTIFACT_ID" --artifact-digest "$ARTIFACT_DIGEST" \
            --token-env GH_TOKEN --output "$RUNNER_TEMP/mirror-artifact-identity.json"
      - uses: actions/download-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          artifact-ids: \${{ needs.certify-mirror.outputs.artifact_id }}
          path: \${{ runner.temp }}/mirror-evidence
      - name: Verify envelope before extraction
        run: |
          node trusted/scripts/verify-mirror-evidence.mjs --pre-extract \
            --evidence "$RUNNER_TEMP/mirror-evidence" --source-sha "$SOURCE_SHA" --source-tree "$SOURCE_TREE" \
            --version "$VERSION" --archive-sha256 "$ARCHIVE_SHA256" --tree-sha256 "$TREE_SHA256" \
            --release-bom-sha256 "$RELEASE_BOM_SHA256" --scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256"
          if tar -tf "$RUNNER_TEMP/mirror-evidence/mirror.tar" | grep -qE '(^/|(^|/)\\.\\.(/|$))'; then exit 1; fi
          tar -tvf "$RUNNER_TEMP/mirror-evidence/mirror.tar" | awk '{ type=substr($1,1,1); if (type != "-" && type != "d") exit 1 }'
          tar --no-same-owner --no-same-permissions -C "$RUNNER_TEMP/mirror" -xf "$RUNNER_TEMP/mirror-evidence/mirror.tar"
          node trusted/scripts/verify-mirror-evidence.mjs \
            --evidence "$RUNNER_TEMP/mirror-evidence" --mirror "$RUNNER_TEMP/mirror" \
            --policy trusted/scripts/published-template-mirror-policy.json \
            --source-sha "$SOURCE_SHA" --source-tree "$SOURCE_TREE" --version "$VERSION" \
            --archive-sha256 "$ARCHIVE_SHA256" --tree-sha256 "$TREE_SHA256" \
            --release-bom-sha256 "$RELEASE_BOM_SHA256" --scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256"
      - name: Prepare and verify exact public target tree
        run: |
          PUBLISHED="$RUNNER_TEMP/published"
          ROOT_PACKAGE="$PUBLISHED/package.json"
          APP_PACKAGE="$PUBLISHED/apps/template/package.json"
          for package_file in "$ROOT_PACKAGE" "$APP_PACKAGE"; do
            test -f "$package_file" && test ! -L "$package_file"
          done
          ROOT_DS_SPEC=$(node -p "require(process.argv[1]).dependencies?.['@qijenchen/design-system'] || ''" "$ROOT_PACKAGE")
          ROOT_STORYBOOK_SPEC=$(node -p "require(process.argv[1]).dependencies?.['@qijenchen/storybook-config'] || ''" "$ROOT_PACKAGE")
          APP_DS_SPEC=$(node -p "require(process.argv[1]).dependencies?.['@qijenchen/design-system'] || ''" "$APP_PACKAGE")
          ROOT_DS_SPEC="$ROOT_DS_SPEC" ROOT_STORYBOOK_SPEC="$ROOT_STORYBOOK_SPEC" \
            APP_DS_SPEC="$APP_DS_SPEC" BUILT_VER="$BUILT_VER" node <<'NODE'
          const compareAscii = (left, right) => left === right ? 0 : left < right ? -1 : 1
          const compareNumericIdentifier = (left, right) => (
            left.length - right.length || compareAscii(left, right)
          )
          const isNonCanonicalNumericIdentifier = identifier => (
            identifier.length > 1 && identifier.startsWith('0')
          )
          const parse = (value, { legacyRange = false } = {}) => {
            if (legacyRange && /^[~^]/.test(value)) value = value.slice(1)
            const match = value.match(/^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/)
            if (!match) throw new Error('non-exact release')
            const core = match.slice(1, 4)
            const prerelease = match[4]?.split('.') ?? null
            if (
              core.some(isNonCanonicalNumericIdentifier)
              || prerelease?.some(identifier => (
                identifier.length === 0
                || (/^\\d+$/.test(identifier) && isNonCanonicalNumericIdentifier(identifier))
              ))
            ) throw new Error('non-canonical SemVer release')
            return [...core, prerelease]
          }
          const compare = (a, b) => {
            const left = parse(a); const right = parse(b, { legacyRange: true })
            for (let i = 0; i < 3; i += 1) {
              if (left[i] !== right[i]) return compareNumericIdentifier(left[i], right[i])
            }
            const x = left[3]; const y = right[3]
            if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
            for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
              if (x[i] === undefined || y[i] === undefined) return x[i] === undefined ? -1 : 1
              if (x[i] === y[i]) continue
              const leftNumeric = /^\\d+$/.test(x[i])
              const rightNumeric = /^\\d+$/.test(y[i])
              if (leftNumeric && rightNumeric) return compareNumericIdentifier(x[i], y[i])
              if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
              return compareAscii(x[i], y[i])
            }
            return 0
          }
          const current = [
            ['root design-system', process.env.ROOT_DS_SPEC],
            ['root storybook-config', process.env.ROOT_STORYBOOK_SPEC],
            ['app design-system', process.env.APP_DS_SPEC],
          ].map(([label, spec]) => {
            const parsed = parse(spec, { legacyRange: true })
            const normalized = \`\${parsed[0]}.\${parsed[1]}.\${parsed[2]}\${parsed[3] === null ? '' : \`-\${parsed[3].join('.')}\`}\`
            return [label, spec, normalized]
          })
          const versions = new Set(current.map(([, , normalized]) => normalized))
          if (versions.size !== 1) throw new Error('target package versions differ')
          const currentVersion = current[0][2]
          if (compare(process.env.BUILT_VER, currentVersion) < 0) throw new Error('downgrade')
          NODE
          rsync -a --delete "$RUNNER_TEMP/mirror/" "$PUBLISHED/"
          node trusted/scripts/verify-mirror-evidence.mjs \
            --evidence "$RUNNER_TEMP/mirror-evidence" --mirror "$PUBLISHED" \
            --policy trusted/scripts/published-template-mirror-policy.json \
            --source-sha "$SOURCE_SHA" --source-tree "$SOURCE_TREE" --version "$VERSION" \
            --archive-sha256 "$ARCHIVE_SHA256" --tree-sha256 "$TREE_SHA256" \
            --release-bom-sha256 "$RELEASE_BOM_SHA256" --scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256" \
            --allow-git-metadata
          git -C "$PUBLISHED" add -f -A
          test -z "$(git -C "$PUBLISHED" ls-files --others --exclude-standard)"
          test -z "$(git -C "$PUBLISHED" ls-files --others --ignored --exclude-standard)"
          git -C "$PUBLISHED" diff --cached --check
          DESIRED_TREE=$(git -C "$PUBLISHED" write-tree)
          INDEX_READBACK="$RUNNER_TEMP/published-index-readback"
          test ! -e "$INDEX_READBACK"
          mkdir -m 700 "$INDEX_READBACK"
          git -C "$PUBLISHED" archive "$DESIRED_TREE" | tar \
            --no-same-owner --no-same-permissions \
            -C "$INDEX_READBACK" -xf -
          node trusted/scripts/verify-mirror-evidence.mjs \
            --evidence "$RUNNER_TEMP/mirror-evidence" --mirror "$INDEX_READBACK" \
            --policy trusted/scripts/published-template-mirror-policy.json \
            --source-sha "$SOURCE_SHA" --source-tree "$SOURCE_TREE" --version "$VERSION" \
            --archive-sha256 "$ARCHIVE_SHA256" --tree-sha256 "$TREE_SHA256" \
            --release-bom-sha256 "$RELEASE_BOM_SHA256" --scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256"
      - name: Verify live mutation boundaries
        run: |
          node trusted/scripts/check-branch-protection.mjs \
            --check \
            --repository "$GITHUB_REPOSITORY" \
            --environment governance-mirror \
            --mutation-boundary-only
          node trusted/scripts/check-branch-protection.mjs \
            --check \
            --repository ajenchen/ds-product-template \
            --mutation-boundary-only
      - uses: actions/create-github-app-token@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
        with:
          app-id: \${{ secrets.GOVERNANCE_WRITER_APP_ID }}
          private-key: \${{ secrets.GOVERNANCE_WRITER_APP_PRIVATE_KEY }}
          permission-contents: write
          permission-pull-requests: write
          permission-workflows: write
      - name: Open PR(no direct main write)
        run: |
          git add -A
          TARGET_BASE_SHA=$(git -C "$PUBLISHED" rev-parse 'refs/remotes/origin/main^{commit}')
          BRANCH="governance/mirror-\${BUILT_VER//./-}-\${SOURCE_SHA:0:12}-\${TARGET_BASE_SHA:0:12}"
          REMOTE_COMMIT=$(git rev-parse "refs/remotes/origin/$BRANCH^{commit}")
          REMOTE_TREE=$(git rev-parse "$REMOTE_COMMIT^{tree}")
          REMOTE_LINE=$(git rev-list --parents -n 1 "$REMOTE_COMMIT")
          test "$(wc -w <<<"$REMOTE_LINE" | tr -d ' ')" = 2
          REMOTE_PARENT=$(cut -d' ' -f2 <<<"$REMOTE_LINE")
          test "$REMOTE_TREE" = "$DESIRED_TREE" && test "$REMOTE_PARENT" = "$TARGET_BASE_SHA"
          EXPECTED_BRANCH_COMMIT="$REMOTE_COMMIT"
          LOCAL_COMMIT=$(git rev-parse HEAD)
          LOCAL_TREE=$(git rev-parse "$LOCAL_COMMIT^{tree}")
          LOCAL_LINE=$(git rev-list --parents -n 1 "$LOCAL_COMMIT")
          test "$(wc -w <<<"$LOCAL_LINE" | tr -d ' ')" = 2
          LOCAL_PARENT=$(cut -d' ' -f2 <<<"$LOCAL_LINE")
          test "$LOCAL_TREE" = "$DESIRED_TREE" && test "$LOCAL_PARENT" = "$TARGET_BASE_SHA"
          git push origin "$BRANCH"
          EXPECTED_BRANCH_COMMIT="$LOCAL_COMMIT"
          LIVE_TARGET_BASE_SHA=$(git ls-remote origin refs/heads/main | awk 'NR == 1 { print $1 }')
          test "$LIVE_TARGET_BASE_SHA" = "$TARGET_BASE_SHA"
          LIVE_BRANCH_COMMIT=$(git ls-remote origin "refs/heads/$BRANCH" | awk 'NR == 1 { print $1 }')
          test "$LIVE_BRANCH_COMMIT" = "$EXPECTED_BRANCH_COMMIT"
          EXISTING=$(gh pr list --repo ajenchen/ds-product-template --state open \
            --head "$BRANCH" --base main --json number,url)
          EXISTING_COUNT=$(jq 'length' <<<"$EXISTING")
          test "$EXISTING_COUNT" -le 1
          if [ "$EXISTING_COUNT" = 1 ]; then
            PR_NUMBER=$(jq -er '.[0].number' <<<"$EXISTING")
          else
            PR_URL=$(gh pr create \
              --repo ajenchen/ds-product-template \
              --base main \
              --head "$BRANCH" \
              --title mirror \
              --body certified)
            PR_NUMBER=$(gh pr view "$PR_URL" --repo ajenchen/ds-product-template --json number --jq '.number')
          fi
          PR_IDENTITY=$(gh pr view "$PR_NUMBER" --repo ajenchen/ds-product-template \
            --json headRefOid,baseRefOid,headRefName,baseRefName,isCrossRepository,headRepository,headRepositoryOwner)
          jq -e \
            --arg headOid "$EXPECTED_BRANCH_COMMIT" \
            --arg baseOid "$TARGET_BASE_SHA" \
            --arg headName "$BRANCH" '
              keys == ["baseRefName", "baseRefOid", "headRefName", "headRefOid", "headRepository", "headRepositoryOwner", "isCrossRepository"]
              and .headRefOid == $headOid
              and .baseRefOid == $baseOid
              and .headRefName == $headName
              and .baseRefName == "main"
              and .isCrossRepository == false
              and .headRepository.nameWithOwner == "ajenchen/ds-product-template"
              and .headRepositoryOwner.login == "ajenchen"
            ' <<<"$PR_IDENTITY"
          test "$(git ls-remote origin "refs/heads/$BRANCH" | awk 'NR == 1 { print $1 }')" = "$EXPECTED_BRANCH_COMMIT"
          test "$(git ls-remote origin refs/heads/main | awk 'NR == 1 { print $1 }')" = "$TARGET_BASE_SHA"
`
// Keep mirror poison tests aligned with the complete production trust boundary. A
// reduced fixture can accidentally normalize away a newly required proof binding.
base['.github/workflows/mirror-to-published-template.yml'] = readFileSync(
  '.github/workflows/mirror-to-published-template.yml',
  'utf8',
)
// The release fixture is written directly in the proportionate default shape:
// dispatch-bound tag resolution, opt-in trust preflight, evidence build with one
// registered All-Harness, attestation, OIDC Trusted Publishing, tag-verified
// GitHub Release.
base['template/ds-product-template/.github/workflows/sync-design-system.yml'] = base['template/ds-product-template/.github/workflows/sync-design-system.yml'].replace(
  'on: {}',
  'on:\n  repository_dispatch:\n    types: [governance-release, manual-governance-upgrade-request]',
)
  .replace('Fail closed on certified upgrade evidence substitution', 'Independently verify protected-base path authority and apply evidence')
  .replace(
    '        env:\n          EXPECTED_PATCH_SHA: ${{ needs.certify-upgrade.outputs.patch_sha256 }}\n        run: git apply --binary --index upgrade.patch',
    '        run: node scripts/verify-upgrade-evidence.mjs --manifest node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json --base-sha "${{ github.sha }}"\n      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n        with:\n          persist-credentials: false\n          ref: ${{ github.sha }}',
  )
base['template/ds-product-template/.github/workflows/governance-anchor.yml'] = base['template/ds-product-template/.github/workflows/governance-anchor.yml']
  .replace('    needs: verify-candidate\n    steps:', '    needs: verify-candidate\n    environment:\n      name: governance-check-verdict\n    steps:')
  .replace('      - run: gh api', '      - run: echo ${{ github.event.pull_request.head.sha }} && gh api')
  .replace(
    '  publish-app-verdict:',
    `      - run: node trusted/scripts/consumer-source-harness.mjs --stage-trusted-product-checks trusted/.governance-tools --trusted trusted
      - run: node trusted/node_modules/playwright/cli.js install --with-deps chromium
      - run: node trusted/scripts/governance-anchor-preflight.mjs --lock-only
      - run: node ../trusted/scripts/setup-governance.mjs --dependencies-only --root .
      - run: node trusted/node_modules/npm/bin/npm-cli.js audit signatures --include-attestations
      - run: node trusted/scripts/governance-anchor-preflight.mjs --verified-attestations "$RUNNER_TEMP/verified-attestations.json"
      - run: node trusted/node_modules/npm/bin/npm-cli.js audit --audit-level=high
      - run: node ../trusted/scripts/setup-governance.mjs --installed-check-only --root .
      - run: |
          sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin governance-candidate
          sudo -u governance-candidate env -i node trusted/.governance-tools/scripts/consumer-source-harness.mjs --repo candidate
          sudo pkill -KILL -u governance-candidate
          sudo chmod -R a-w candidate
      - run: |
          node trusted/scripts/consumer-source-harness.mjs --verify-trusted-product-checks trusted/.governance-tools --trusted trusted
          node trusted/.governance-tools/scripts/lint-ds-internal-imports.mjs --repo candidate
          node trusted/.governance-tools/scripts/audit-consumer-a11y.mjs --repo candidate
  publish-app-verdict:`,
  )
// 1B(2026-07-29):root anchor = verifier-only,不得有 App verdict job(規則反向要求);
// template anchor 保留 App 架構作 fleet consumer 藍圖。
base['.github/workflows/governance-anchor.yml'] = `${base['template/ds-product-template/.github/workflows/governance-anchor.yml']
  .split('\n  publish-app-verdict:')[0]}\n      - run: node trusted/scripts/verify-privileged-change.mjs\n`
base['.github/workflows/deploy-storybook.yml'] = `on:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  build-pages:
    if: github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.conclusion == 'success'
    permissions:
      contents: read
    steps:
      - run: test "$source_sha" = "$main_sha"
      - uses: actions/upload-pages-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  deploy-pages:
    needs: build-pages
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`

const audit = (sources, publisher = trustedPublisher) => auditWorkflowSources(sources, {
  rootNpmrc: npmrc,
  releaseNpmPublisher: publisher,
})

test('actual DS anchor installs and audits protected-base dependencies before executing protected verifier code', () => {
  const workflow = readFileSync('.github/workflows/governance-anchor.yml', 'utf8')
  const markers = [
    'working-directory: trusted',
    'npm run --silent setup:dependencies',
    'node trusted/scripts/verify-privileged-change.mjs',
    'node trusted/packages/governance/bin/governance.mjs',
  ].map((marker) => workflow.indexOf(marker))
  assert.ok(markers.every((index) => index >= 0), 'DS anchor is missing the protected-base exact dependency bootstrap closure')
  assert.deepEqual(markers, [...markers].sort((left, right) => left - right), 'DS anchor executes protected verifier code before its trusted dependencies are installed and audited')
})

test('actual template anchor binds candidate dependencies to immutable provenance before executing the installed checker', () => {
  const workflow = readFileSync('template/ds-product-template/.github/workflows/governance-anchor.yml', 'utf8')
  const markers = [
    '--lock-only',
    '--dependencies-only --root .',
    '--include-attestations',
    '--verified-attestations',
    '--installed-check-only --root .',
  ].map(marker => workflow.indexOf(marker))
  assert.ok(markers.every(index => index >= 0), 'template anchor is missing the closed dependency/provenance/checker sequence')
  assert.deepEqual(markers, [...markers].sort((left, right) => left - right), 'template anchor executes installed candidate code before immutable provenance is bound')
  assert.equal(workflow.includes('runGovernanceSetup({ root: process.cwd() })'), false, 'full setup must not execute the installed checker during candidate dependency bootstrap')
  assert.doesNotMatch(
    workflow,
    /node \.\.\/trusted\/node_modules\/npm\/bin\/npm-cli\.js audit --audit-level=high/,
    'template anchor must not repeat a raw lock-only audit after the canonical overlay-aware dependency bootstrap',
  )
})

test('actual managed executor builder loads privileged authority only from protected-default repository dispatch', () => {
  const path = '.github/workflows/build-managed-ci-executors.yml'
  const source = readFileSync(path, 'utf8')
  const trigger = JSON.parse(readFileSync('infra/governance/providers/managed-ci-executor-supply-chain.json', 'utf8')).builder.trigger
  assert.deepEqual(
    auditWorkflowSources({ [path]: source }).filter(finding => finding.file === path),
    [],
  )
  const branchSelectable = source.replace(
    `  ${trigger.eventName}:\n    types: [${trigger.activityType}]\n`,
    '  workflow_dispatch:\n',
  )
  assert.ok(auditWorkflowSources({ [path]: branchSelectable })
    .some(finding => finding.file === path && finding.rule === 'WF-PRIVILEGED-TRIGGER'))
})

test('managed executor builder keeps registry mutation, digest binding, and OIDC attestation mechanically separated', () => {
  const path = '.github/workflows/build-managed-ci-executors.yml'
  const source = readFileSync(path, 'utf8')
  const findingsFor = candidate => auditWorkflowSources({ [path]: candidate })
    .filter(finding => finding.file === path)
  const mutations = [
    [
      'floating hosted runner',
      source.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'),
      'WF-RUNNER-PIN',
    ],
    [
      'registry writer can mint OIDC',
      source.replace('      packages: write\n', '      packages: write\n      id-token: write\n'),
      'WF-REGISTRY-OIDC-SEPARATION',
    ],
    [
      'attester regains package mutation',
      source.replace(
        '      contents: read\n      id-token: write\n      attestations: write\n',
        '      contents: read\n      packages: write\n      id-token: write\n      attestations: write\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'attester bypasses the digest-binding job',
      source.replace('    needs: bind-image-set\n', '    needs: build-and-push\n'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'attester selects an artifact by mutable name',
      source.replace(
        '          artifact-ids: ${{ needs.bind-image-set.outputs.artifact_id }}',
        '          name: managed-ci-image-set-${{ github.run_id }}-${{ github.run_attempt }}',
      ),
      'WF-MANAGED-CI-DIGEST-HANDOFF',
    ],
    [
      'handoff archive digest is not rebound',
      source.replace(
        '          EXPECTED_ARTIFACT_DIGEST: ${{ needs.bind-image-set.outputs.artifact_digest }}',
        '          EXPECTED_ARTIFACT_DIGEST: substituted',
      ),
      'WF-MANAGED-CI-DIGEST-HANDOFF',
    ],
    [
      'source-tree consensus is not rebound',
      source.replace(
        `'[.[].sourceTree] | unique | if length == 1 then .[0] else error("source tree mismatch") end'`,
        `'[.[].sourceTree] | .[0]'`,
      ),
      'WF-MANAGED-CI-DIGEST-HANDOFF',
    ],
    [
      'attester can push to the registry',
      source.replace('          push-to-registry: false', '          push-to-registry: true'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'provenance is substituted by a second handoff attestation',
      source
        .replace('          predicate-type: https://slsa.dev/provenance/v1', '          predicate-type: https://qijenchen.dev/attestations/managed-ci-image-handoff/v2')
        .replace('          predicate-path: ${{ steps.image.outputs.provenance }}', '          predicate-path: ${{ steps.image.outputs.predicate }}'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'CycloneDX attestation is pointed at unbound bytes',
      source.replace('          sbom-path: ${{ steps.image.outputs.sbom }}', '          sbom-path: /tmp/unbound.cdx.json'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'workflow-level secret reaches privileged jobs',
      source.replace(
        'permissions: {}\n',
        'permissions: {}\n\nenv:\n  CANDIDATE_SECRET: ${{ secrets.CANDIDATE_SECRET }}\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'candidate container wraps the OIDC attester',
      source.replace(
        '    timeout-minutes: 15\n',
        '    timeout-minutes: 15\n    container: ghcr.io/example/candidate:latest\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'unreviewed local action is inserted into the OIDC attester',
      source.replace(
        '      - name: Upload the exact offline evidence as a non-WORM GitHub handoff\n',
        '      - name: Execute unreviewed local action\n        uses: ./candidate-action\n\n      - name: Upload the exact offline evidence as a non-WORM GitHub handoff\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'candidate command is appended inside the existing OIDC rebinding shell',
      source.replace(
        '          echo "predicate=$PREDICATE" >> "$GITHUB_OUTPUT"',
        '          node ./candidate-owned.mjs\n          echo "predicate=$PREDICATE" >> "$GITHUB_OUTPUT"',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'provenance output is substituted inside the existing OIDC rebinding shell',
      source.replace(
        '          echo "provenance=$PROVENANCE" >> "$GITHUB_OUTPUT"',
        '          echo "provenance=$PREDICATE" >> "$GITHUB_OUTPUT"',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'independent SBOM generation is weakened',
      source.replace('                format: "cyclonedx-json-1.6"', '                format: "spdx-json"'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'registry writer shell appends a post-logout command',
      source.replace(
        '          /usr/bin/docker logout ghcr.io\n',
        '          /usr/bin/docker logout ghcr.io\n          /usr/bin/docker login ghcr.io\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'read-only SBOM shell appends another credential-bearing process',
      source.replace(
        '              --output "cyclonedx-json=$RUNNER_TEMP/managed-ci-image-binding/${{ matrix.execution-class }}.cdx.json"\n',
        '              --output "cyclonedx-json=$RUNNER_TEMP/managed-ci-image-binding/${{ matrix.execution-class }}.cdx.json"\n          /usr/bin/docker pull "$IMAGE_REF"\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'digest binder shell appends an unreviewed command',
      source.replace(
        '          echo "manifest_sha256=$MANIFEST_SHA256" >> "$GITHUB_OUTPUT"\n',
        '          echo "manifest_sha256=$MANIFEST_SHA256" >> "$GITHUB_OUTPUT"\n          node ./candidate-owned.mjs\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'setup action redownloads Buildx through a version input',
      source.replace(
        '          driver: docker-container\n',
        '          version: v0.35.0\n          driver: docker-container\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'BuildKit regains insecure entitlements',
      source.replace(
        '          buildkitd-flags: --debug=false\n',
        '          buildkitd-flags: --allow-insecure-entitlement security.insecure\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'build regains network access',
      source.replace('            --network none \\\n', '            --network host \\\n'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'build shell emits unbound provenance',
      source.replace('            --provenance=false \\\n', '            --provenance=mode=max \\\n'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'build shell emits an unbound SBOM',
      source.replace('            --sbom=false \\\n', '            --sbom=true \\\n'),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'registry mutation starts before exact context archive validation',
      source.replace(
        '          test "$(tar -tf "$CONTEXT_ARCHIVE")" = "$(printf \'%s\\n\' \\\n',
        '          /usr/bin/docker buildx build --push - < "$CONTEXT_ARCHIVE"\n'
          + '          test "$(tar -tf "$CONTEXT_ARCHIVE")" = "$(printf \'%s\\n\' \\\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Git archive loses its commit-epoch mtime',
      source.replace(
        '          /usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME" \\\n',
        '          /usr/bin/git archive --format=tar \\\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Syft registry credentials escape GHCR',
      source.replace(
        '            SYFT_REGISTRY_AUTH_AUTHORITY="ghcr.io" \\\n',
        '            SYFT_REGISTRY_AUTH_AUTHORITY="docker.io" \\\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'exact build context archive is dropped from handoff',
      source.replace(
        '            ${{ runner.temp }}/managed-ci-image-binding/${{ matrix.execution-class }}.tar\n',
        '',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'writer uses ambient Docker configuration',
      source.replace(
        `          printf 'DOCKER_CONFIG=%s/managed-ci-docker-config\\n' "$RUNNER_TEMP" >> "$GITHUB_ENV"\n`,
        `          printf 'DOCKER_CONFIG=%s/.docker\\n' "$HOME" >> "$GITHUB_ENV"\n`,
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Buildx binary digest is substituted',
      source.replace(
        'd41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda',
        'a'.repeat(64),
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Syft archive digest is substituted',
      source.replace(
        '0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509',
        'b'.repeat(64),
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Syft binary digest is substituted',
      source.replace(
        '6c1eb5c6f15c177fa3dd727ee186c61a660a3939a4e1dc1bc4b3e00eafec098e',
        'c'.repeat(64),
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'Syft download receives a registry token',
      source.replace(
        '      - name: Materialize exact Syft bytes without any registry credential\n        run: |\n',
        '      - name: Materialize exact Syft bytes without any registry credential\n        env:\n          GHCR_READ_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n        run: |\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'opaque third-party SBOM action is reintroduced',
      source.replace(
        '      - name: Retain the scanned image binding as a non-WORM GitHub handoff\n',
        '      - name: Generate an opaque SBOM\n        uses: anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610\n\n      - name: Retain the scanned image binding as a non-WORM GitHub handoff\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
    [
      'nonsemantic workflow bytes drift from the reviewed set',
      source.replace(
        'name: Build managed CI executors\n',
        'name: Build managed CI executors\n# reviewed-byte-set changed\n',
      ),
      'WF-MANAGED-CI-PRIVILEGE-SEPARATION',
    ],
  ]
  for (const [label, candidate, rule] of mutations) {
    assert.notEqual(candidate, source, `${label}: fixture mutation did not apply`)
    assert(findingsFor(candidate).some(finding => finding.rule === rule), `${label}: missing ${rule}`)
  }
})

test('registry and OIDC authority cannot be co-located through inherited workflow permissions', () => {
  const path = '.github/workflows/inherited-authority-fixture.yml'
  const source = `on:
  repository_dispatch:
permissions:
  packages: write
  id-token: write
jobs:
  privileged:
    runs-on: ubuntu-24.04
    steps: []
`
  assert(auditWorkflowSources({ [path]: source })
    .some(finding => finding.file === path && finding.rule === 'WF-REGISTRY-OIDC-SEPARATION'))
})

test('valid trust boundaries pass', () => assert.deepEqual(audit(base), []))

for (const [label, run] of [
  ['short eval flag', '        run: node -e "process.exit(0)"'],
  ['long eval flag', '        run: node --eval="process.exit(0)"'],
  ['short print flag', '        run: node -p "process.version"'],
  ['long print flag', '        run: /usr/bin/node --print="process.version"'],
  ['environment-prefixed eval', '        run: VALUE=untrusted node -e "console.log(process.env.VALUE)"'],
  ['folded runtime flag plus eval', '        run: >-\n          node --input-type=module -e\n          "await Promise.resolve();"'],
  ['heredoc stdin code', "        run: |\n          node <<'NODE'\n          process.exit(0)\n          NODE"],
  ['explicit-dash heredoc stdin code', "        run: |\n          node - <<'NODE'\n          process.exit(0)\n          NODE"],
  ['explicit stdin path code', '        run: node /dev/stdin < script.js'],
  ['piped stdin code', '        run: printf %s process.exit\\(0\\) | node'],
  ['bare stdin interpreter', '        run: node'],
]) {
  test(`rejects Node.js workflow ${label}`, () => {
    const path = `.github/workflows/node-dynamic-${label.replaceAll(' ', '-')}.yml`
    const source = `on: {}
jobs:
  dynamic:
    runs-on: ubuntu-24.04
    steps:
      - name: Dynamic code poison
${run}
`
    const findings = auditWorkflowSources({ [path]: source })
    assert.ok(
      findings.some(finding => finding.file === path && finding.rule === 'WF-NODE-DYNAMIC-CODE'),
      `${label}: expected WF-NODE-DYNAMIC-CODE; got ${JSON.stringify(findings)}`,
    )
  })
}

test('allows Claude print mode and committed Node.js static CLIs', () => {
  const path = '.github/workflows/static-cli-fixture.yml'
  const source = `on: {}
jobs:
  static:
    runs-on: ubuntu-24.04
    steps:
      - run: |
          claude -p "review this repository"
          claude --print "review this repository"
          node scripts/workflow-static-validation.mjs assert-exact-semver --value 1.2.3
          node scripts/tool.mjs --print report
          echo "node -e is forbidden"
          # node -p "comment-only"
`
  assert.equal(
    auditWorkflowSources({ [path]: source }).some(finding => finding.rule === 'WF-NODE-DYNAMIC-CODE'),
    false,
  )
})

test('committed static SemVer oracle is deterministic and precision-safe', () => {
  assert.equal(compareExactSemver('1.0.0', '1.0.0'), 0)
  assert.ok(compareExactSemver('1.0.0', '1.0.0-rc.999999999999999999999999999999999999') > 0)
  assert.ok(compareExactSemver('1.0.0-beta.10', '1.0.0-beta.9') > 0)
  assert.ok(compareExactSemver('1.0.0-beta.999999999999999999999999999999999999', '1.0.0-beta.10') > 0)
  assert.ok(compareExactSemver('999999999999999999999999999999.0.0', '100000000000000000000000000000.0.0') > 0)
  assert.ok(compareExactSemver('1.0.0-1', '1.0.0-alpha') < 0)
  assert.ok(compareExactSemver('1.2.4', '^1.2.3', { rightAllowsLegacyPrefix: true }) > 0)
  assert.equal(parseExactSemver('1.2.3+build.7').normalized, '1.2.3+build.7')
  assert.throws(() => parseExactSemver('01.2.3'), /non-canonical numeric core/)
  assert.throws(() => parseExactSemver('1.2.3-rc.01'), /non-canonical prerelease/)
  assert.throws(() => parseExactSemver('^^1.2.3', { allowLegacyPrefix: true }), /exact semantic version required/)
  assert.throws(() => compareExactSemver('1.2.3+build.7', '1.2.3'), /build metadata is forbidden/)
})

test('committed static workflow oracle stays closed across product delivery and ownership surfaces', () => {
  const helperPath = 'scripts/workflow-static-validation.mjs'
  const forkBuilder = readFileSync('scripts/build-fork-governance.mjs', 'utf8')
  const mirrorBuilder = readFileSync('scripts/build-published-template-mirror.mjs', 'utf8')
  const mirrorPolicy = JSON.parse(readFileSync('scripts/published-template-mirror-policy.json', 'utf8'))
  const inventory = JSON.parse(readFileSync('infra/governance/inventory/managed-repos.json', 'utf8'))
  const manifest = JSON.parse(readFileSync('packages/governance/canonical/manifest.json', 'utf8'))
  const graph = JSON.parse(readFileSync('scripts/governance-build-graph.json', 'utf8'))
  const ownershipRules = inventory.ownershipPolicies['product-consumer'].rules
    .filter((rule) => rule.pattern === helperPath)

  assert.match(
    forkBuilder,
    /'scripts\/workflow-static-validation\.mjs': join\(ROOT, 'scripts\/workflow-static-validation\.mjs'\)/,
  )
  assert.match(
    forkBuilder,
    /const FORK_SCRIPT_FILES = new Set\(\[[\s\S]*'workflow-static-validation\.mjs'/,
  )
  assert.match(mirrorBuilder, /'scripts\/workflow-static-validation\.mjs'/)
  assert.equal(mirrorPolicy.exactPaths.filter((path) => path === helperPath).length, 1)
  assert.deepEqual(ownershipRules, [{
    pattern: helperPath,
    mode: 'upstream-managed',
    owner: 'design-system-governance',
  }])
  assert.deepEqual(
    manifest.sources.filter((source) => source.id === 'workflow-static-validation-helper'),
    [{
      id: 'workflow-static-validation-helper',
      ownerRepo: 'design-system',
      path: helperPath,
      required: true,
    }],
  )
  assert.ok(
    graph.stages.find((stage) => stage.id === 'fork-template').sources.includes(helperPath),
  )
  assert.ok(
    graph.stages.find((stage) => stage.id === 'control-plane').sources.includes(helperPath),
  )
})

for (const [name, mutate, rule] of [
  ['floating action', (s) => s.replace('@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '@v4'), 'WF-ACTION-PIN'],
  ['checkout credential persistence', (s) => s.replace('persist-credentials: false\n', ''), 'WF-CHECKOUT-CREDS'],
  ['lifecycle install', (s) => s.replace('npm ci --ignore-scripts', 'npm ci'), 'WF-LIFECYCLE'],
  ['npx registry fallback', (s) => `${s}      - run: npx playwright install\n`, 'WF-NPX'],
  ['title bypass', (s) => `${s}    if: contains(github.event.pull_request.title, '[skip-visual]')\n`, 'WF-BYPASS'],
]) {
  test(`rejects ${name}`, () => {
    const sources = { ...base, '.github/workflows/ci.yml': mutate(base['.github/workflows/ci.yml']) }
    assert.ok(audit(sources).some((finding) => finding.rule === rule))
  })
}

const mirrorPath = '.github/workflows/mirror-to-published-template.yml'
const replaceLast = (source, needle, replacement) => {
  const at = source.lastIndexOf(needle)
  return at < 0 ? source : `${source.slice(0, at)}${replacement}${source.slice(at + needle.length)}`
}
const moveBlockBefore = (source, startMarker, endMarker, beforeMarker) => {
  const startAt = source.indexOf(startMarker)
  const endAt = source.indexOf(endMarker, startAt + startMarker.length)
  if (startAt < 0 || endAt < 0) return source
  const block = source.slice(startAt, endAt)
  const without = `${source.slice(0, startAt)}${source.slice(endAt)}`
  const beforeAt = without.indexOf(beforeMarker)
  if (beforeAt < 0) return source
  return `${without.slice(0, beforeAt)}${block}${without.slice(beforeAt)}`
}
const removeContinuedCommand = (source, marker, occurrence = 0) => {
  const lines = source.split('\n')
  let seen = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(marker)) continue
    if (seen !== occurrence) { seen += 1; continue }
    let end = index + 1
    while (lines[end - 1]?.trimEnd().endsWith('\\') && end < lines.length) end += 1
    lines.splice(index, end - index)
    return lines.join('\n')
  }
  return source
}
for (const [label, mutate, expectedRule] of [
  [
    'authoritative push trigger',
    source => source.replace('on:\n', 'on:\n  push:\n    branches: [main]\n'),
    'WF-MIRROR-TRIGGER',
  ],
  [
    'branch-selectable workflow_dispatch',
    source => source.replace('  repository_dispatch:\n    types: [mirror-template-request]', '  workflow_dispatch:'),
    'WF-MIRROR-TRIGGER',
  ],
  [
    'open manual payload shape',
    source => source.replace('["finalizer_run_attempt", "finalizer_run_id"]', '["finalizer_run_attempt", "finalizer_run_id", "source_sha"]'),
    'WF-MIRROR-TRIGGER',
  ],
  [
    'cancelled in-flight finalizer attempt',
    source => source.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    'WF-MIRROR-CONCURRENCY',
  ],
  [
    'finalizer workflow head used as release source',
    source => source.replace('ref: ${{ github.sha }}', 'ref: ${{ github.event.workflow_run.head_sha }}'),
    'WF-MIRROR-TRIGGER',
  ],
  [
    'missing protected-base finalizer resolver',
    source => source.replace('node trusted/scripts/release-finalizer-mirror-handoff.mjs', 'node trusted/scripts/unchecked-handoff.mjs'),
    'WF-MIRROR-SOURCE',
  ],
  [
    'release checkout falls back to workflow source',
    source => source.replace('ref: ${{ steps.handoff.outputs.source_sha }}', 'ref: ${{ github.sha }}'),
    'WF-MIRROR-SOURCE',
  ],
  [
    'release tree proof removed',
    source => source.replace('          test "$(git -C source rev-parse \'HEAD^{tree}\')" = "$EXPECTED_SOURCE_TREE"\n', ''),
    'WF-MIRROR-SOURCE',
  ],
  [
    'writer Actions read permission removed',
    source => replaceLast(source, '      actions: read\n', ''),
    'WF-LATE-CREDENTIAL',
  ],
  [
    'writer result dependency removed',
    source => source.replace("needs.certify-mirror.result == 'success' && ", ''),
    'WF-LATE-CREDENTIAL',
  ],
  [
    'release-tree job output substitution',
    source => source.replace('source_tree: ${{ steps.handoff.outputs.source_tree }}', 'source_tree: ${{ github.sha }}'),
    'WF-MIRROR-HANDOFF',
  ],
  [
    'same-run artifact identity adapter removed',
    source => source.replace('node trusted/scripts/mirror-run-artifact-identity.mjs', 'node trusted/scripts/unchecked-artifact.mjs'),
    'WF-MIRROR-ARTIFACT',
  ],
  [
    'artifact digest not rebound to upload output',
    source => source.replace('--artifact-digest "$ARTIFACT_DIGEST"', '--unchecked-digest "$ARTIFACT_DIGEST"'),
    'WF-MIRROR-ARTIFACT',
  ],
  [
    'artifact downloaded by mutable name',
    source => source.replace('artifact-ids: ${{ needs.certify-mirror.outputs.artifact_id }}', 'name: mirror-latest'),
    'WF-MIRROR-ARTIFACT',
  ],
  [
    'pre-extract envelope verification removed',
    source => source.replace('--pre-extract', '--unchecked-envelope'),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'source-tree exact verifier argument removed',
    source => source.replaceAll('--source-tree "$SOURCE_TREE"', '--unchecked-source-tree "$SOURCE_TREE"'),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'tar link and special-file rejection removed',
    source => source.replace('-|d) ;;', '-) ;;'),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'safe extraction permissions removed',
    source => source.replace('--no-same-permissions ', ''),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'App token minted before evidence verification',
    source => source.replace(
      '      - name: Re-resolve finalizer handoff and compare every closed field',
      '      - uses: actions/create-github-app-token@cccccccccccccccccccccccccccccccccccccccc\n      - name: Re-resolve finalizer handoff and compare every closed field',
    ),
    'WF-LATE-CREDENTIAL',
  ],
  [
    'deterministic branch missing exact target-base identity',
    source => source.replace('-${TARGET_BASE_SHA:0:12}', ''),
    'WF-MIRROR-PRIVILEGE',
  ],
  [
    'reused branch missing single-parent proof',
    source => source.replace('          test "$(wc -w <<<"$REMOTE_LINE" | tr -d \' \')" = 2\n', ''),
    'WF-MIRROR-PRIVILEGE',
  ],
  [
    'new branch missing single-parent proof',
    source => source.replace('          test "$(wc -w <<<"$LOCAL_LINE" | tr -d \' \')" = 2\n', ''),
    'WF-MIRROR-PRIVILEGE',
  ],
]) {
  test(`rejects mirror boundary poison: ${label}`, () => {
    const mutated = mutate(base[mirrorPath])
    assert.notEqual(mutated, base[mirrorPath], `poison did not mutate fixture: ${label}`)
    const findings = audit({ ...base, [mirrorPath]: mutated })
    assert.ok(
      findings.some(finding => finding.file === mirrorPath && finding.rule === expectedRule),
      `${label}: expected ${expectedRule}; got ${JSON.stringify(findings.filter(finding => finding.file === mirrorPath))}`,
    )
  })
}

for (const [label, mutate, expectedRule] of [
  [
    'certifier activation verifier removed',
    source => source.replace('node trusted/scripts/verify-mirror-activation-boundary.mjs', 'node trusted/scripts/unchecked-activation-boundary.mjs'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer activation verifier removed',
    source => replaceLast(source, 'node trusted/scripts/verify-mirror-activation-boundary.mjs', 'node trusted/scripts/unchecked-activation-boundary.mjs'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'certifier activation verifier reads protected-base instead of release bytes',
    source => source.replace('--release-source-root "$GITHUB_WORKSPACE/source"', '--release-source-root "$GITHUB_WORKSPACE/trusted"'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer activation verifier reads protected-base instead of release bytes',
    source => source.replace('--release-source-root "$GITHUB_WORKSPACE/release-source"', '--release-source-root "$GITHUB_WORKSPACE/trusted"'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'certifier activation proof runs after release build',
    source => moveBlockBefore(
      source,
      '      - name: Revalidate fresh signed source and target mutation boundaries',
      '      - name: Bind dependency cache to the immutable release lock',
      '      - name: Bind npm artifacts to immutable GitHub release BOM',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer release source checkout substituted with workflow source',
    source => source.replace(
      'ref: ${{ needs.certify-mirror.outputs.source_sha }}\n          path: release-source',
      'ref: ${{ github.sha }}\n          path: release-source',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer release-source clean-tree proof removed',
    source => source.replace('          test -z "$(git -C release-source status --porcelain=v1 --untracked-files=no --ignore-submodules=none)"\n', ''),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer activation proof runs after artifact evidence use',
    source => moveBlockBefore(
      source,
      '      - name: Recompute signed activation proof from the exact release before artifact use',
      '      - name: Verify envelope before safe extraction, then verify published Day-0 tree',
      '      - name: Prepare and fully verify the exact public target tree before credentials',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'activation-proof job output is substituted',
    source => source.replace(
      'activation_boundary_proof_sha256: ${{ steps.archive.outputs.activation_boundary_proof_sha256 }}',
      'activation_boundary_proof_sha256: ${{ github.sha }}',
    ),
    'WF-MIRROR-HANDOFF',
  ],
  [
    'external-activation requirements output is substituted',
    source => source.replace(
      'external_activation_requirements_sha256: ${{ steps.handoff.outputs.external_activation_requirements_sha256 }}',
      'external_activation_requirements_sha256: ${{ github.sha }}',
    ),
    'WF-MIRROR-HANDOFF',
  ],
  [
    'receipt is downgraded from v4',
    source => source.replace('{schemaVersion:4,', '{schemaVersion:3,'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'activation proof is only an unbound receipt sidecar',
    source => source.replace(',activationBoundaryProofSha256:$activation}', '}'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'receipt binds activation proof field to mirror tree digest',
    source => source.replace('activationBoundaryProofSha256:$activation', 'activationBoundaryProofSha256:$tree'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'activation proof sidecar destination is substituted',
    source => source.replace(
      'cp "$RUNNER_TEMP/mirror-activation-boundary-proof.json" "$EVIDENCE/mirror-activation-boundary-proof.json"',
      'cp "$RUNNER_TEMP/mirror-activation-boundary-proof.json" "$EVIDENCE/unbound-proof-sidecar.json"',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'activation proof sidecar is copied only after its receipt digest',
    (source) => {
      const copy = '          cp "$RUNNER_TEMP/mirror-activation-boundary-proof.json" "$EVIDENCE/mirror-activation-boundary-proof.json"\n'
      return source.replace(copy, '').replace(
        '          echo "activation_boundary_proof_sha256=$ACTIVATION_BOUNDARY_PROOF_SHA" >> "$GITHUB_OUTPUT"\n',
        `${copy}          echo "activation_boundary_proof_sha256=$ACTIVATION_BOUNDARY_PROOF_SHA" >> "$GITHUB_OUTPUT"\n`,
      )
    },
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'receipt v4 and proof are uploaded from a substituted directory',
    source => source.replace('path: ${{ runner.temp }}/mirror-evidence/', 'path: ${{ runner.temp }}/unbound-sidecars/'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'receipt v4 artifact permits missing proof files',
    source => source.replace('          if-no-files-found: error\n', '          if-no-files-found: ignore\n'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer reads an unbound activation proof sidecar',
    source => source.replace(
      'ARTIFACT_PROOF="$RUNNER_TEMP/mirror-evidence/mirror-activation-boundary-proof.json"',
      'ARTIFACT_PROOF="$RUNNER_TEMP/mirror-evidence/unbound-proof-sidecar.json"',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer accepts a symlinked artifact proof',
    source => source.replace('test -f "$ARTIFACT_PROOF" && test ! -L "$ARTIFACT_PROOF"', 'test -e "$ARTIFACT_PROOF"'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer drops artifact proof digest comparison',
    source => source.replace(
      'test "$(sha256sum "$ARTIFACT_PROOF" | cut -d\' \' -f1)" = "$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"',
      'true # artifact proof digest not rebound',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer drops fresh proof digest comparison',
    source => source.replace(
      'test "$(sha256sum "$FRESH_PROOF" | cut -d\' \' -f1)" = "$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"',
      'true # fresh proof digest not rebound',
    ),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'writer drops byte comparison between fresh and artifact proofs',
    source => source.replace('cmp -s "$FRESH_PROOF" "$ARTIFACT_PROOF"', 'true # proof bytes not compared'),
    'WF-MIRROR-ACTIVATION-PROOF',
  ],
  [
    'shared evidence verifier args omit activation proof digest',
    source => source.replace(
      '            --activation-boundary-proof-sha256 "$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"\n',
      '',
    ),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'index evidence verifier omits activation proof digest',
    source => replaceLast(
      source,
      '--activation-boundary-proof-sha256 "$ACTIVATION_BOUNDARY_PROOF_SHA256"',
      '--unchecked-activation-boundary-proof-sha256 "$ACTIVATION_BOUNDARY_PROOF_SHA256"',
    ),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'certifier adds an unbound evidence-verifier side channel',
    source => source.replace(
      '      - name: Upload exact mirror evidence',
      '      - run: node trusted/scripts/verify-mirror-evidence.mjs --evidence "$RUNNER_TEMP/unbound-sidecar"\n      - name: Upload exact mirror evidence',
    ),
    'WF-MIRROR-EVIDENCE',
  ],
  [
    'source mutation-boundary check removed',
    source => removeContinuedCommand(source, 'trusted/scripts/check-branch-protection.mjs', 0),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'target mutation-boundary check removed',
    source => removeContinuedCommand(source, 'trusted/scripts/check-branch-protection.mjs', 1),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'target mutation-boundary proof argument removed',
    source => replaceLast(
      source,
      '--activation-proof "$RUNNER_TEMP/mirror-evidence/mirror-activation-boundary-proof.json"',
      '--unchecked-proof "$RUNNER_TEMP/mirror-evidence/mirror-activation-boundary-proof.json"',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'target mutation-boundary release root substituted',
    source => replaceLast(
      source,
      '--release-source-root "$GITHUB_WORKSPACE/release-source"',
      '--release-source-root "$GITHUB_WORKSPACE/trusted"',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'target mutation-boundary check inherits source environment policy',
    source => source.replace(
      '            --repository ajenchen/ds-product-template \\\n            --mutation-boundary-only',
      '            --repository ajenchen/ds-product-template \\\n            --environment governance-mirror \\\n            --mutation-boundary-only',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'mutation-boundary checks run before exact index readback',
    source => moveBlockBefore(
      source,
      '      - name: Prove live mutation boundaries before requesting write credentials',
      '      - name: Mint least-privilege short-lived Governance Writer App token',
      '      - name: Prepare and fully verify the exact public target tree before credentials',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'mutation-boundary checks run after Writer App token minting',
    source => moveBlockBefore(
      source,
      '      - name: Prove live mutation boundaries before requesting write credentials',
      '      - name: Mint least-privilege short-lived Governance Writer App token',
      '      - name: Open or reuse one deterministic mirror PR',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'an unreviewed step is inserted between mutation checks and token minting',
    source => source.replace(
      '      - name: Mint least-privilege short-lived Governance Writer App token',
      '      - name: Unbound side effect\n        run: node trusted/scripts/unbound-side-effect.mjs\n\n      - name: Mint least-privilege short-lived Governance Writer App token',
    ),
    'WF-MIRROR-MUTATION-BOUNDARY',
  ],
  [
    'Writer App token is replaced by a PAT',
    source => source.replace('GH_TOKEN: ${{ steps.app-token.outputs.token }}', 'GH_TOKEN: ${{ secrets.GOVERNANCE_ADMIN_PAT }}'),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'extra admin credential is loaded',
    source => source.replace(
      '          GH_TOKEN: ${{ steps.app-token.outputs.token }}',
      '          GH_TOKEN: ${{ steps.app-token.outputs.token }}\n          ADMIN_TOKEN: ${{ secrets.GOVERNANCE_ADMIN_TOKEN }}',
    ),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'second write-capable App token channel is added',
    source => source.replace(
      '      - name: Open or reuse one deterministic mirror PR',
      '      - uses: actions/create-github-app-token@cccccccccccccccccccccccccccccccccccccccc\n        with:\n          app-id: ${{ secrets.GOVERNANCE_WRITER_APP_ID }}\n          private-key: ${{ secrets.GOVERNANCE_WRITER_APP_PRIVATE_KEY }}\n      - name: Open or reuse one deterministic mirror PR',
    ),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'writer job receives built-in contents write authority',
    source => replaceLast(source, '      contents: read\n', '      contents: write\n'),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'Writer App token owner scope is broadened',
    source => source.replace('          owner: ajenchen\n', '          owner: ajenchen-enterprise\n'),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'Writer App installation repository scope is broadened',
    source => source.replace('          repositories: ds-product-template\n', '          repositories: ds-product-template,design-system\n'),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'Writer App token lacks workflow mutation authority',
    source => source.replace('          permission-workflows: write\n', ''),
    'WF-MIRROR-CREDENTIAL',
  ],
  [
    'post-proof mutation uses the built-in workflow token',
    source => source.replace('GH_TOKEN: ${{ steps.app-token.outputs.token }}', 'GH_TOKEN: ${{ github.token }}'),
    'WF-MIRROR-CREDENTIAL',
  ],
]) {
  test(`rejects mirror proof-v4 poison: ${label}`, () => {
    const mutated = mutate(base[mirrorPath])
    assert.notEqual(mutated, base[mirrorPath], `poison did not mutate production fixture: ${label}`)
    const findings = audit({ ...base, [mirrorPath]: mutated })
    assert.ok(
      findings.some(finding => finding.file === mirrorPath && finding.rule === expectedRule),
      `${label}: expected ${expectedRule}; got ${JSON.stringify(findings.filter(finding => finding.file === mirrorPath))}`,
    )
  })
}

for (const [label, mutate, expectedRule] of [
  ['downgrade oracle drops regular-file proof', source => source.replace('test -f "$package_file"', 'test -e "$package_file"'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle accepts symlink manifests', source => source.replace('test ! -L "$package_file"', 'true'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle substitutes the committed helper', source => source.replace('"$GITHUB_WORKSPACE/trusted/scripts/workflow-static-validation.mjs"', '"$GITHUB_WORKSPACE/trusted/scripts/unreviewed-validator.mjs"'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle substitutes its closed command', source => source.replace('            assert-mirror-version-floor \\\n', '            print-package-version \\\n'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle drops root manifest binding', source => source.replace('            --root-manifest "$ROOT_PACKAGE" \\\n', ''), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle substitutes root manifest binding', source => source.replace('--root-manifest "$ROOT_PACKAGE"', '--root-manifest "$APP_PACKAGE"'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle drops app manifest binding', source => source.replace('            --app-manifest "$APP_PACKAGE" \\\n', ''), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle substitutes app manifest binding', source => source.replace('--app-manifest "$APP_PACKAGE"', '--app-manifest "$ROOT_PACKAGE"'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle drops built-version binding', source => source.replace('            --built-version "$BUILT_VER"\n', ''), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle substitutes built-version binding', source => source.replace('--built-version "$BUILT_VER"', '--built-version "$TARGET_BASE_SHA"'), 'WF-MIRROR-DOWNGRADE'],
  ['downgrade oracle executes after target sync', source => source.replace('          ROOT_PACKAGE="$PUBLISHED/package.json"\n', '          rsync -a before-oracle/ "$PUBLISHED/"\n          ROOT_PACKAGE="$PUBLISHED/package.json"\n'), 'WF-MIRROR-DOWNGRADE'],

  ['future-provider files are not force-indexed', source => source.replace('git -C "$PUBLISHED" add -f -A', 'git -C "$PUBLISHED" add -A'), 'WF-MIRROR-INDEX'],
  ['unstaged untracked path proof removed', source => source.replace('ls-files --others --exclude-standard', 'ls-files --others --error-unmatch'), 'WF-MIRROR-INDEX'],
  ['ignored path proof removed', source => source.replace('ls-files --others --ignored --exclude-standard', 'ls-files --others --ignored --error-unmatch'), 'WF-MIRROR-INDEX'],
  ['staged diff validation removed', source => source.replace('          git -C "$PUBLISHED" diff --cached --check\n', ''), 'WF-MIRROR-INDEX'],
  ['index tree is replaced with worktree HEAD', source => source.replace('DESIRED_TREE=$(git -C "$PUBLISHED" write-tree)', 'DESIRED_TREE=$(git -C "$PUBLISHED" rev-parse HEAD^{tree})'), 'WF-MIRROR-INDEX'],
  ['index archive reads the wrong tree', source => source.replace('archive "$DESIRED_TREE"', 'archive HEAD'), 'WF-MIRROR-INDEX'],
  ['index readback directory may preexist', source => source.replace('          test ! -e "$INDEX_READBACK"\n', ''), 'WF-MIRROR-INDEX'],
  ['index archive restores owner metadata', source => replaceLast(source, '--no-same-owner --no-same-permissions', '--no-same-permissions'), 'WF-MIRROR-INDEX'],
  ['index archive restores permission metadata', source => replaceLast(source, '--no-same-owner --no-same-permissions', '--no-same-owner'), 'WF-MIRROR-INDEX'],
  ['index verifier reads the mutable worktree', source => replaceLast(source, '--mirror "$INDEX_READBACK"', '--mirror "$PUBLISHED"'), 'WF-MIRROR-INDEX'],
  ['index verifier permits Git metadata', source => replaceLast(source, '--scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256"', '--scaffold-lock-sha256 "$SCAFFOLD_LOCK_SHA256" --allow-git-metadata'), 'WF-MIRROR-INDEX'],
  ['Writer token is minted before force-index readback', source => source.replace('          git -C "$PUBLISHED" add -f -A\n', '      - uses: actions/create-github-app-token@cccccccccccccccccccccccccccccccccccccccc\n          git -C "$PUBLISHED" add -f -A\n'), 'WF-MIRROR-INDEX'],

  ['PR list omits exact base filter', source => source.replace('--head "$BRANCH" --base main --json number,url', '--head "$BRANCH" --json number,url'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR list substitutes the deterministic head', source => source.replace('--head "$BRANCH" --base main --json number,url', '--head attacker --base main --json number,url'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR list substitutes target repository', source => source.replace('EXISTING=$(gh pr list --repo ajenchen/ds-product-template', 'EXISTING=$(gh pr list --repo attacker/template'), 'WF-MIRROR-PR-IDENTITY'],
  ['multiple matching PRs are accepted', source => source.replace('test "$EXISTING_COUNT" -le 1', 'test "$EXISTING_COUNT" -le 2'), 'WF-MIRROR-PR-IDENTITY'],
  ['existing PR number is not read exactly', source => source.replace("PR_NUMBER=$(jq -er '.[0].number'", "PR_NUMBER=$(jq -er '.[0].url'"), 'WF-MIRROR-PR-IDENTITY'],
  ['PR create omits exact base', source => source.replace(/(PR_URL=\$\(gh pr create[\s\S]{0,300}?)--base main/, '$1--base staging'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR create substitutes exact head', source => source.replace(/(PR_URL=\$\(gh pr create[\s\S]{0,300}?)--head "\$BRANCH"/, '$1--head attacker'), 'WF-MIRROR-PR-IDENTITY'],
  ['created PR number is not rebound', source => source.replace('PR_NUMBER=$(gh pr view "$PR_URL"', 'PR_NUMBER=$(gh pr view latest'), 'WF-MIRROR-PR-IDENTITY'],
  ['full PR identity readback removed', source => source.replace('PR_IDENTITY=$(gh pr view', 'PR_IDENTITY=$(gh pr status'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops head OID', source => source.replace('and .headRefOid == $headOid', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops base OID', source => source.replace('and .baseRefOid == $baseOid', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops head name', source => source.replace('and .headRefName == $headName', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops base name', source => source.replace('and .baseRefName == "main"', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity accepts cross-repository head', source => source.replace('and .isCrossRepository == false', 'and .isCrossRepository == true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops exact head repository', source => source.replace('and .headRepository.nameWithOwner == "ajenchen/ds-product-template"', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['PR identity drops exact head owner', source => source.replace('and .headRepositoryOwner.login == "ajenchen"', 'and true'), 'WF-MIRROR-PR-IDENTITY'],
  ['remote branch is not re-read before PR operation', source => source.replace('          LIVE_BRANCH_COMMIT=$(git ls-remote origin "refs/heads/$BRANCH" | awk \'NR == 1 { print $1 }\')\n', ''), 'WF-MIRROR-PR-IDENTITY'],
  ['target main is not compared before PR operation', source => replaceLast(source, 'test "$LIVE_TARGET_BASE_SHA" = "$TARGET_BASE_SHA" || {', 'true || {'), 'WF-MIRROR-PR-IDENTITY'],
  ['remote branch is not re-read after PR operation', source => source.replace('          test "$(git ls-remote origin "refs/heads/$BRANCH" | awk \'NR == 1 { print $1 }\')" = "$EXPECTED_BRANCH_COMMIT"\n', ''), 'WF-MIRROR-PR-IDENTITY'],
  ['target main is not re-read after PR operation', source => source.replace('          test "$(git ls-remote origin refs/heads/main | awk \'NR == 1 { print $1 }\')" = "$TARGET_BASE_SHA"\n', ''), 'WF-MIRROR-PR-IDENTITY'],
]) {
  test(`rejects mirror closure poison: ${label}`, () => {
    const mutated = mutate(base[mirrorPath])
    assert.notEqual(mutated, base[mirrorPath], `poison did not mutate fixture: ${label}`)
    const findings = audit({ ...base, [mirrorPath]: mutated })
    assert.ok(
      findings.some(finding => finding.file === mirrorPath && finding.rule === expectedRule),
      `${label}: expected ${expectedRule}; got ${JSON.stringify(findings.filter(finding => finding.file === mirrorPath))}`,
    )
  })
}

test('rejects branch-selectable workflow_dispatch for the privileged upgrade writer', () => {
  const sources = {
    ...base,
    'template/ds-product-template/.github/workflows/sync-design-system.yml': base['template/ds-product-template/.github/workflows/sync-design-system.yml']
      .replace('  repository_dispatch:\n    types: [governance-release, manual-governance-upgrade-request]', '  workflow_dispatch:'),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PRIVILEGED-TRIGGER'))
})

const privilegedUpgradePath = 'template/ds-product-template/.github/workflows/sync-design-system.yml'
const canonicalUpgradeDispatch = '  repository_dispatch:\n    types: [governance-release, manual-governance-upgrade-request]'
for (const [label, replacement] of [
  ['retired design-system-published alias', '  repository_dispatch:\n    types: [design-system-published, manual-governance-upgrade-request]'],
  ['retired ds-published alias', '  repository_dispatch:\n    types: [ds-published, manual-governance-upgrade-request]'],
  ['arbitrary additional event', '  repository_dispatch:\n    types: [governance-release, manual-governance-upgrade-request, arbitrary-event]'],
  ['missing manual event', '  repository_dispatch:\n    types: [governance-release]'],
  ['missing governance-release event', '  repository_dispatch:\n    types: [manual-governance-upgrade-request]'],
  ['reordered exact events', '  repository_dispatch:\n    types: [manual-governance-upgrade-request, governance-release]'],
  ['duplicated event', '  repository_dispatch:\n    types: [governance-release, manual-governance-upgrade-request, governance-release]'],
  ['extra push trigger', `${canonicalUpgradeDispatch}\n  push:`],
]) {
  test(`rejects privileged upgrade trigger drift: ${label}`, () => {
    const mutated = base[privilegedUpgradePath].replace(canonicalUpgradeDispatch, replacement)
    assert.notEqual(mutated, base[privilegedUpgradePath], `poison did not mutate fixture: ${label}`)
    const findings = audit({ ...base, [privilegedUpgradePath]: mutated })
    assert.ok(
      findings.some(finding => finding.file === privilegedUpgradePath && finding.rule === 'WF-PRIVILEGED-TRIGGER'),
      `${label}: expected WF-PRIVILEGED-TRIGGER; got ${JSON.stringify(findings.filter(finding => finding.file === privilegedUpgradePath))}`,
    )
  })
}

test('rejects workflow_dispatch for the protected-base Check App producer', () => {
  // 1B 後 Check App producer 只存在 template anchor(fleet 藍圖);root anchor 的
  // trigger 錯置由 WF-ANCHOR 守(verifier-only 合約要求 pull_request_target)。
  const templateSources = {
    ...base,
    'template/ds-product-template/.github/workflows/governance-anchor.yml':
      base['template/ds-product-template/.github/workflows/governance-anchor.yml']
        .replace('  pull_request_target:', '  workflow_dispatch:'),
  }
  assert.ok(audit(templateSources).some((finding) => finding.rule === 'WF-PRIVILEGED-TRIGGER'))
  const rootSources = {
    ...base,
    '.github/workflows/governance-anchor.yml': base['.github/workflows/governance-anchor.yml']
      .replace('  pull_request_target:', '  workflow_dispatch:'),
  }
  assert.ok(audit(rootSources).some((finding) => finding.rule === 'WF-ANCHOR'))
})

test('rejects pull_request_target secret in candidate verification job', () => {
  const sources = {
    ...base,
    'template/ds-product-template/.github/workflows/governance-anchor.yml': base['template/ds-product-template/.github/workflows/governance-anchor.yml'].replace(
      'jobs:\n',
      'jobs:\n  verify-candidate:\n    steps:\n      - run: echo ${{ secrets.PRIVATE_KEY }}\n',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PR-TARGET-SECRET'))
})

test('rejects hostile pull_request_target head ref interpolated directly into a shell run', () => {
  const path = '.github/workflows/governance-anchor.yml'
  const safe = readFileSync(path, 'utf8')
  assert.equal(
    audit({ ...base, [path]: safe }).some(finding => finding.rule === 'WF-PR-TARGET-SHELL-INTERPOLATION'),
    false,
    'the protected-base workflow must bind pull-request event fields outside run',
  )
  const mutated = safe.replace(
    '--head-ref "$HEAD_REF"',
    '--head-ref "${{ github.event.pull_request.head.ref }}"',
  )
  assert.notEqual(mutated, safe, 'hostile head-ref poison did not mutate the protected-base fixture')
  const findings = audit({ ...base, [path]: mutated })
  assert.ok(
    findings.some(finding => finding.file === path && finding.rule === 'WF-PR-TARGET-SHELL-INTERPOLATION'),
    `expected direct pull-request shell interpolation to fail closed; got ${JSON.stringify(findings.filter(finding => finding.file === path))}`,
  )
})

test('allows pull_request_target event fields in env, if, and with while run consumes only quoted variables', () => {
  const path = '.github/workflows/pull-request-target-env-only.yml'
  const source = `on:
  pull_request_target:
jobs:
  verify:
    runs-on: ubuntu-24.04
    steps:
      - if: startsWith(github.event.pull_request.head.ref, 'governance/')
        env:
          HOSTILE_HEAD_REF: \${{ github.event.pull_request.head.ref }}
        run: test -n "$HOSTILE_HEAD_REF"
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          persist-credentials: false
`
  assert.equal(
    audit({ [path]: source }).some(finding => finding.rule === 'WF-PR-TARGET-SHELL-INTERPOLATION'),
    false,
  )
})

for (const [label, mutate] of [
  [
    'full candidate setup before immutable provenance binding',
    source => source.replace(
      'node ../trusted/scripts/setup-governance.mjs --dependencies-only --root .',
      'node ../trusted/scripts/setup-governance.mjs',
    ),
  ],
  [
    'installed checker before immutable provenance binding',
    source => moveBlockBefore(
      source,
      '      - run: node ../trusted/scripts/setup-governance.mjs --installed-check-only --root .',
      '      - run: |',
      '      - run: node trusted/node_modules/npm/bin/npm-cli.js audit signatures --include-attestations',
    ),
  ],
  [
    'candidate-owned post-build lint helper',
    source => source.replace(
      'trusted/.governance-tools/scripts/lint-ds-internal-imports.mjs --repo candidate',
      'candidate/scripts/lint-ds-internal-imports.mjs',
    ),
  ],
  [
    'missing protected-tool revalidation',
    source => source.replace('--verify-trusted-product-checks trusted/.governance-tools', '--unverified-product-checks trusted/.governance-tools'),
  ],
  [
    'candidate build with inherited runner environment',
    source => source.replace('sudo -u governance-candidate env -i', 'sudo -u governance-candidate env'),
  ],
]) {
  test(`rejects ${label} in the protected product-check boundary`, () => {
    const path = 'template/ds-product-template/.github/workflows/governance-anchor.yml'
    const mutated = mutate(base[path])
    assert.notEqual(mutated, base[path], `poison did not mutate fixture: ${label}`)
    assert.ok(
      audit({ ...base, [path]: mutated }).some(finding => finding.file === path && finding.rule === 'WF-ANCHOR'),
      `${label}: expected WF-ANCHOR`,
    )
  })
}

test('rejects legacy ambiguous Governance App identity', () => {
  const sources = {
    ...base,
    '.github/workflows/mirror-to-published-template.yml': base['.github/workflows/mirror-to-published-template.yml'].replaceAll('GOVERNANCE_WRITER_APP', 'GOVERNANCE_APP'),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-APP-LEGACY-SECRET'))
})

test('rejects check-only App in writer workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/mirror-to-published-template.yml': base['.github/workflows/mirror-to-published-template.yml'].replaceAll('GOVERNANCE_WRITER_APP', 'GOVERNANCE_CHECK_APP'),
  }
  assert.ok(audit(sources).some((finding) => ['WF-APP-SEPARATION', 'WF-MIRROR-EVIDENCE'].includes(finding.rule)))
})

test('rejects writer App in check-authority workflow', () => {
  const sources = {
    ...base,
    'template/ds-product-template/.github/workflows/governance-anchor.yml': base['template/ds-product-template/.github/workflows/governance-anchor.yml'].replaceAll('GOVERNANCE_CHECK_APP', 'GOVERNANCE_WRITER_APP'),
  }
  assert.ok(audit(sources).some((finding) => ['WF-APP-SEPARATION', 'WF-ANCHOR'].includes(finding.rule)))
})

test('rejects upgrade credentials in the certification job', () => {
  const sources = {
    ...base,
    'template/ds-product-template/.github/workflows/sync-design-system.yml': base['template/ds-product-template/.github/workflows/sync-design-system.yml'].replace(
      '      - id: source\n',
      '      - id: source\n      - run: echo ${{ secrets.GOVERNANCE_WRITER_APP_ID }}\n',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-UPGRADE-PRIVILEGE'))
})

for (const [label, mutate] of [
  ['PAT candidate event authority', source => source.replace('GH_TOKEN: ${{ steps.app-token.outputs.token }}', 'GH_TOKEN: ${{ secrets.CANDIDATE_WRITER_PAT }}')],
  ['built-in GITHUB_TOKEN fake-green writer', source => source.replace('GH_TOKEN: ${{ steps.app-token.outputs.token }}', 'GH_TOKEN: ${{ github.token }}')],
  ['missing workflow mutation authority', source => source.replace('          permission-workflows: write\n', '')],
  ['candidate-run or PR approval authority', source => source.replace('echo governance-upgrade-writer-v1\n', 'gh api --method POST repos/x/actions/runs/1/approve\n          echo governance-upgrade-writer-v1\n')],
  ['missing protected-default validation dispatch', source => source.replace('echo \'{event_type:"governance-upgrade-candidate-validation"}\'\n', '')],
  ['candidate script execution in the writer', source => source.replace('echo governance-upgrade-writer-v1\n', 'node scripts/audit-consumer-a11y.mjs\n          echo governance-upgrade-writer-v1\n')],
  ['stale main accepted before remote mutation', source => source.replaceAll('          test "$LIVE_MAIN_SHA" = "$BASE_SHA"\n', '')],
  ['wrong existing PR base accepted', source => source.replace('          test "$(jq -r \'.[0].baseRefName\' <<<"$PR_JSON")" = main\n', '')],
  ['wrong existing PR head ref accepted', source => source.replace('          test "$(jq -r \'.[0].headRefName\' <<<"$PR_JSON")" = "$BRANCH"\n', '')],
  ['cross-repository PR head accepted', source => source.replace('          test "$(jq -r \'.[0].isCrossRepository\' <<<"$PR_JSON")" = false\n', '')],
  ['wrong existing PR head accepted', source => source.replace('          test "$(jq -r \'.[0].headRefOid\' <<<"$PR_JSON")" = "$REMOTE_COMMIT"\n', '')],
  ['wrong remote commit tree or parent accepted', source => source.replace('          test "$REMOTE_TREE" = "$DESIRED_TREE" && test "$REMOTE_PARENT" = "$BASE_SHA"\n', '')],
]) {
  test(`rejects upgrade boundary poison: ${label}`, () => {
    const path = 'template/ds-product-template/.github/workflows/sync-design-system.yml'
    const sources = { ...base, [path]: mutate(base[path]) }
    assert.ok(audit(sources).some((finding) => ['WF-UPGRADE-PRIVILEGE', 'WF-UPGRADE-CANDIDATE-EXECUTION'].includes(finding.rule)))
  })
}

for (const [label, mutate] of [
  [
    'gh auth setup-git persists the Writer token',
    source => source.replace(
      '          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
      '          gh auth setup-git\n          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
    ),
  ],
  [
    'gh auth login persists the Writer token',
    source => source.replace(
      '          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
      '          gh auth login --with-token <<<"$WRITER_TOKEN"\n          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
    ),
  ],
  [
    'Git credential approval persists the Writer token',
    source => source.replace(
      '          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
      '          git credential approve <<<"password=$WRITER_TOKEN"\n          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
    ),
  ],
  [
    'Writer token is redirected to disk',
    source => source.replace(
      '          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
      '          printf %s "$WRITER_TOKEN" > "$HOME/token"\n          BRANCH="governance/upgrade-${VERSION//./-}-${BASE_SHA:0:12}"',
    ),
  ],
  [
    'system Git config is inherited',
    source => source.replace("          GIT_CONFIG_NOSYSTEM: '1'", "          GIT_CONFIG_NOSYSTEM: '0'"),
  ],
  [
    'global Git config is inherited',
    source => source.replace('          GIT_CONFIG_GLOBAL: /dev/null', '          GIT_CONFIG_GLOBAL: ~/.gitconfig'),
  ],
  [
    'ambient credential helpers are not reset',
    source => source.replace("          GIT_CONFIG_VALUE_0: ''", "          GIT_CONFIG_VALUE_0: '!attacker-helper'"),
  ],
  [
    'exact GitHub App credential helper is substituted',
    source => source.replace(
      "          GIT_CONFIG_VALUE_1: '!/usr/bin/gh auth git-credential'",
      "          GIT_CONFIG_VALUE_1: '!gh auth git-credential'",
    ),
  ],
  [
    'repository hooks are re-enabled',
    source => source.replace('          GIT_CONFIG_VALUE_2: /dev/null', '          GIT_CONFIG_VALUE_2: .git/hooks'),
  ],
  [
    'ambient Git pager is re-enabled',
    source => source.replace('          GIT_PAGER: /bin/cat', '          GIT_PAGER: less'),
  ],
  [
    'ambient shell pager is re-enabled',
    source => source.replace('          PAGER: /bin/cat', '          PAGER: less'),
  ],
  [
    'Git askpass is re-enabled',
    source => source.replace('          GIT_ASKPASS: /bin/false', '          GIT_ASKPASS: /tmp/askpass'),
  ],
  [
    'SSH askpass is re-enabled',
    source => source.replace('          SSH_ASKPASS: /bin/false', '          SSH_ASKPASS: /tmp/askpass'),
  ],
  [
    'closed env is replaced by ambient execution',
    source => source.replace('            /usr/bin/env -i \\\n', '            /usr/bin/env \\\n'),
  ],
  [
    'exact Git binary is replaced by PATH lookup',
    source => source.replace('              /usr/bin/git "$@"', '              git "$@"'),
  ],
  [
    'commit bypasses the closed Git wrapper',
    source => source.replace('          git commit --no-gpg-sign', '          /usr/bin/git commit --no-gpg-sign'),
  ],
  [
    'push bypasses the closed Git wrapper',
    source => source.replace('          git push origin', '          command git push origin'),
  ],
  [
    'fetch bypasses the closed Git wrapper',
    source => source.replace('          git fetch --force', '          /usr/bin/git fetch --force'),
  ],
  [
    'remote read bypasses the closed Git wrapper',
    source => source.replace(
      'LIVE_MAIN_SHA=$(git ls-remote --exit-code origin refs/heads/main)',
      'LIVE_MAIN_SHA=$(/usr/bin/git ls-remote --exit-code origin refs/heads/main)',
    ),
  ],
  [
    'Writer token leaks into commit subprocesses',
    source => source.replace('              fetch|ls-remote|push)', '              commit|fetch|ls-remote|push)'),
  ],
  [
    'ambient GH token remains exported',
    source => source.replace('          unset GH_TOKEN\n', ''),
  ],
  [
    'ephemeral Writer token is not cleared',
    source => source.replace("          WRITER_TOKEN=''\n          unset WRITER_TOKEN\n", ''),
  ],
]) {
  test(`rejects upgrade Writer App Git-closure poison: ${label}`, () => {
    const path = 'template/ds-product-template/.github/workflows/sync-design-system.yml'
    const mutated = mutate(base[path])
    assert.notEqual(mutated, base[path], `poison did not mutate fixture: ${label}`)
    const findings = audit({ ...base, [path]: mutated })
    assert.ok(
      findings.some(finding => finding.file === path && finding.rule === 'WF-UPGRADE-GIT-CLOSURE'),
      `${label}: expected WF-UPGRADE-GIT-CLOSURE; got ${JSON.stringify(findings.filter(finding => finding.file === path))}`,
    )
  })
}

test('rejects path-filtered required pull request workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/packaging-canary.yml': 'on:\n  pull_request:\n    paths:\n      - packages/**\njobs: {}\n',
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-REQUIRED-UNCONDITIONAL'))
})

test('rejects job-level write authority in an approval-required pull_request run', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': base['.github/workflows/ci.yml'].replace(
      '  test:\n',
      '  test:\n    permissions:\n      contents: write\n',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PR-PERMISSION'))
})

test('rejects secret authority in an approval-required pull_request run', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': base['.github/workflows/ci.yml'].replace(
      '    steps:\n',
      '    steps:\n      - run: echo ${{ secrets.CANDIDATE_SECRET }}\n',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PR-SECRET'))
})

test('rejects All-Harness removal from a release-bearing workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': base['.github/workflows/ci.yml'].replace('      - run: npm run --silent test:governance-harnesses\n', ''),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PORTABILITY-MATRIX'))
})

test('rejects Pages or OIDC authority inside pull-request CI', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': `${base['.github/workflows/ci.yml']}\npermissions:\n  pages: write\n  id-token: write\n`,
  }
  assert.ok(audit(sources).some((finding) => ['WF-PRIVILEGED-TRIGGER', 'WF-CI-PRIVILEGE'].includes(finding.rule)))
})

test('rejects branch-selectable Pages deployment workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/deploy-storybook.yml': base['.github/workflows/deploy-storybook.yml'].replace(
      '  workflow_run:\n    workflows: [CI]\n    types: [completed]',
      '  workflow_dispatch:',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PRIVILEGED-TRIGGER'))
})

test('rejects release authority collapse or permission crossover', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '  publish-npm:\n    needs: [trust-preflight, build-release-evidence, attest-release]\n    environment:\n      name: npm-release\n    permissions:\n      contents: read\n      id-token: write',
      '  publish-npm:\n    needs: [trust-preflight, build-release-evidence, attest-release]\n    environment:\n      name: npm-release\n    permissions:\n      contents: write\n      id-token: write',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-RELEASE-PRIVILEGE'))
})

test('rejects making the release trust preflight optional', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '  trust-preflight:\n    needs: resolve-release-request',
      "  trust-preflight:\n    if: vars.RELEASE_HIGH_ASSURANCE == 'true'\n    needs: resolve-release-request",
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-TRUST-PREFLIGHT'))
})

test('rejects native staging that bypasses the mandatory trust preflight', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '  publish-npm:\n    needs: [trust-preflight, build-release-evidence, attest-release]',
      '  publish-npm:\n    needs: [build-release-evidence, attest-release]',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-TRUST-PREFLIGHT'))
})

test('rejects a release producer that bypasses the canonical SBOM normalizer', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - run: node scripts/release-sbom.mjs --input "$RUNNER_TEMP/release.sbom.raw.json" --output "$GITHUB_WORKSPACE/release-artifacts/release.sbom.cdx.json" --tag "$RELEASE_TAG" --git-tree "${{ needs.resolve-release-request.outputs.release_tree }}"\n',
      '',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})

test('rejects inline release SBOM normalization beside the canonical helper', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - run: node scripts/release-sbom.mjs --input "$RUNNER_TEMP/release.sbom.raw.json" --output "$GITHUB_WORKSPACE/release-artifacts/release.sbom.cdx.json" --tag "$RELEASE_TAG" --git-tree "${{ needs.resolve-release-request.outputs.release_tree }}"\n',
      '      - run: node scripts/release-sbom.mjs --input "$RUNNER_TEMP/release.sbom.raw.json" --output "$GITHUB_WORKSPACE/release-artifacts/release.sbom.cdx.json" --tag "$RELEASE_TAG" --git-tree "${{ needs.resolve-release-request.outputs.release_tree }}"\n      - run: /usr/bin/jq \'.serialNumber = "different" | del(.metadata.timestamp)\' raw.json\n',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})

test('rejects attestation authority without an immediate exact remote-tag recheck', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - run: node scripts/release-remote-tag.mjs --expected commit --expected-object object --token-env GH_TOKEN\n      - uses: actions/attest@',
      '      # node scripts/release-remote-tag.mjs --expected fake --token-env GH_TOKEN\n      - uses: actions/attest@',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})

test('rejects multiple attestation writes when the signed tag is not rechecked before each one', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - uses: actions/attest@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      '      - uses: actions/attest@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n      - uses: actions/attest@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})

test('rejects native staging without an attempt-bound stage receipt artifact', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - if: always()\n        uses: actions/upload-artifact@eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n        with:\n          name: npm-stage-${{ github.event.client_payload.tag }}-${{ github.run_id }}-${{ github.run_attempt }}\n',
      '',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})

test('rejects a native stage helper that drops provenance', () => {
  const publisher = trustedPublisher.replace("'--provenance', ", '')
  assert.ok(audit(base, publisher).some(finding => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects a native stage helper that drops the pre-authority tag-object recheck', () => {
  const publisher = trustedPublisher.replace(
    "await recheckRemoteTag(context.identity, args['--tag-object'], githubToken)\n",
    '',
  )
  assert.ok(audit(base, publisher).some(finding => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects a direct npm publish path in the protected stage workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      'node scripts/release-npm-publish.mjs --receipt "$RUNNER_TEMP/npm-stage/npm-stage-receipt.json" --trust-artifact-digest digest --trust-run-attempt "$GITHUB_RUN_ATTEMPT"',
      'npm publish "$tarball" --provenance --access public',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects a tag-controlled workflow copy with OIDC and attestation authority', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '  repository_dispatch:\n    types: [stage-protected-release]',
      "  push:\n    tags:\n      - 'v*'",
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PRIVILEGED-TRIGGER'))
})

test('rejects publication outside the npm-release environment binding', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '    environment:\n      name: npm-release\n',
      '',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects a direct GitHub Release writer in the native stage workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': `${base['.github/workflows/release.yml']}  github-release:
    needs: publish-npm
    permissions:
      contents: write
    steps:
      - run: gh release create "$RELEASE_TAG" --verify-tag
`,
  }
  assert.ok(audit(sources).some((finding) => ['WF-TRUSTED-PUBLISH', 'WF-RELEASE-PRIVILEGE'].includes(finding.rule)))
})

test('rejects npm authority in the independent finalizer', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      '      - run: node scripts/release-npm-finalize-verify.mjs',
      '      - run: npm dist-tag add package@1.0.0 latest',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects a finalizer SBOM normalizer bound to a different tree identity', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      '--git-tree "${{ steps.identity.outputs.tree }}"',
      '--git-tree "${{ github.sha }}"',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects OIDC authority in the GitHub Release writer', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      '    permissions:\n      contents: write',
      '    permissions:\n      contents: write\n      id-token: write',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-PRIVILEGE'))
})

test('rejects branch-selectable workflow_dispatch for a privileged finalizer', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml']
      .replace('  repository_dispatch:\n    types: [finalize-staged-release]', '  workflow_dispatch:'),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-PRIVILEGE'))
})

test('rejects a privileged finalizer without protected-default ref guards', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml']
      .replaceAll("    if: github.ref == 'refs/heads/main'\n", ''),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-PRIVILEGE'))
})

test('rejects missing exact evidence rebound in privileged release stage', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      '        run: node scripts/release-remote-tag.mjs --expected-object "${{ needs.certify-finalization.outputs.tag_object }}" --token-env TAG_READ_TOKEN\n',
      '',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects finalization when writer and certifier do not bind the same tag object', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replaceAll(
      '${{ needs.certify-finalization.outputs.tag_object }}',
      '${{ github.sha }}',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects a same-commit finalizer tag object that differs from the originally issued trust evidence', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replaceAll(
      '${{ steps.issued_trust.outputs.tag_object }}',
      '${{ steps.signed_tag.outputs.tag_object }}',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects immutable GitHub Release publication without the permanent finalization audit asset', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      ' --audit-evidence "$GITHUB_WORKSPACE/finalization-evidence/npm-finalization-receipt.json" --audit-evidence-sha256 "${{ needs.certify-finalization.outputs.finalization_receipt_sha256 }}"',
      '',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects finalization that reserializes or drops the exact historical trust-evidence copy', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      ' --retain-exact "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json"',
      '',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects immutable GitHub Release publication without the digest-bound historical trust-evidence asset', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replace(
      ' --release-trust-evidence "$GITHUB_WORKSPACE/finalization-evidence/release-trust-preflight.json" --release-trust-evidence-sha256 "${{ needs.certify-finalization.outputs.release_trust_evidence_file_sha256 }}"',
      '',
    ),
  }
  assert.ok(audit(sources).some(finding => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects using the contents-write token as the GitHub Release tag trust oracle', () => {
  const sources = {
    ...base,
    '.github/workflows/release-finalize.yml': base['.github/workflows/release-finalize.yml'].replaceAll(
      'TAG_READ_TOKEN: ${{ secrets.RELEASE_TAG_READ_TOKEN }}',
      'TAG_READ_TOKEN: ${{ github.token }}',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-FINALIZE-EVIDENCE'))
})

test('rejects release tags without a literal protected-main ancestry proof', () => {
  const sources = {
    ...base,
    '.github/workflows/release.yml': base['.github/workflows/release.yml'].replace(
      '      - run: git merge-base --is-ancestor tag refs/remotes/origin/main\n',
      '',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-RELEASE-EVIDENCE'))
})
