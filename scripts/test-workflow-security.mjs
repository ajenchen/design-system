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
const trustedPublisher = readFileSync('scripts/release-npm-publish.mjs', 'utf8')
const trustedGithubPublisher = readFileSync('scripts/release-github-release.mjs', 'utf8')
const base = {
  '.github/workflows/ci.yml': 'on:\n  pull_request:\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n        with:\n          persist-credentials: false\n      - run: npm ci --ignore-scripts\n      - run: npm audit signatures\n      - run: npm audit --audit-level=high\n      - run: npm run --silent test:governance-harnesses\n',
  '.github/workflows/a11y-and-size.yml': 'on:\n  pull_request:\njobs: {}\n',
  '.github/workflows/visual-regression.yml': 'on:\n  pull_request:\njobs: {}\n',
  '.github/workflows/composition-fidelity.yml': 'on:\n  pull_request:\njobs:\n  composition:\n    steps:\n      - run: node scripts/composition-fidelity-visual-diff.mjs --require-mappings\n',
  '.github/workflows/packaging-canary.yml': 'on:\n  pull_request:\njobs:\n  packaging:\n    steps:\n      - run: node scripts/test-fork-governance.mjs\n',
  'template/ds-product-template/.github/workflows/audit.yml': 'on:\n  pull_request:\n    branches: [main]\njobs:\n  audit:\n    name: Verify consumer\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm ci --ignore-scripts\n      - run: npm run typecheck\n      - run: npm run lint:imports\n      - run: npm run build\n',
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
}

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

base['.github/workflows/release.yml'] = readFileSync('.github/workflows/release.yml', 'utf8')
base['.github/workflows/mirror-to-published-template.yml'] = readFileSync('.github/workflows/mirror-to-published-template.yml', 'utf8')

const audit = (sources, publisher = trustedPublisher, githubPublisher = trustedGithubPublisher) => auditWorkflowSources(sources, {
  rootNpmrc: npmrc,
  releaseNpmPublisher: publisher,
  releaseGithubPublisher: githubPublisher,
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
  assert.doesNotMatch(
    workflow,
    /issues: read|bootstrap-comments|--pull-request|DS-GOVERNANCE-BOOTSTRAP-V1/,
    'DS anchor retained the removed OWNER-comment/per-change authorization ceremony',
  )
  assert.match(workflow, /Verify all other privileged closure changes structurally/)
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
  ['manual trigger', source => source.replace('  release:\n', '  workflow_dispatch:\n  release:\n'), 'WF-MIRROR-TRIGGER'],
  ['legacy finalizer trigger', source => source.replace('  release:\n    types: [published]', '  workflow_run:\n    workflows: [Release finalize]\n    types: [completed]'), 'WF-MIRROR-TRIGGER'],
  ['built-in contents writer', source => source.replace('      contents: read', '      contents: write'), 'WF-MIRROR-RELEASE'],
  ['early cross-repository credential', source => source.replace('      - name: Verify six-file release set, BOM, and npm readback', '      - run: echo "${{ secrets.CROSS_REPO_TOKEN }}" >/dev/null\n      - name: Verify six-file release set, BOM, and npm readback'), 'WF-MIRROR-CREDENTIAL'],
]) {
  test(`published-release mirror rejects ${label}`, () => {
    const source = mutate(base[mirrorPath])
    assert.ok(audit({ ...base, [mirrorPath]: source }).some(finding => finding.rule === expectedRule))
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

test('published mirror has no dependency on unprovisioned App credentials', () => {
  const source = base['.github/workflows/mirror-to-published-template.yml']
  assert.doesNotMatch(source, /GOVERNANCE_(?:WRITER|CHECK)_APP|create-github-app-token/)
  assert.match(source, /secrets\.CROSS_REPO_TOKEN/)
})

test('rejects writer App in check-authority workflow', () => {
  const sources = {
    ...base,
    'template/ds-product-template/.github/workflows/governance-anchor.yml': base['template/ds-product-template/.github/workflows/governance-anchor.yml'].replaceAll('GOVERNANCE_CHECK_APP', 'GOVERNANCE_WRITER_APP'),
  }
  assert.ok(audit(sources).some((finding) => ['WF-APP-SEPARATION', 'WF-ANCHOR'].includes(finding.rule)))
})

test('rejects path-filtered required pull request workflow', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': 'on:\n  pull_request:\n    paths:\n      - packages/**\njobs: {}\n',
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

test('does not require the duplicate All-Harness in CI or release', () => {
  const sources = {
    ...base,
    '.github/workflows/ci.yml': base['.github/workflows/ci.yml'].replace('      - run: npm run --silent test:governance-harnesses\n', ''),
  }
  assert.equal(audit(sources).some((finding) => finding.rule === 'WF-PORTABILITY-MATRIX'), false)
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

test('rejects npm job contents-write crossover', () => {
  const source = base['.github/workflows/release.yml'].replace(
    '      contents: read\n      id-token: write',
    '      contents: write\n      id-token: write',
  )
  assert.ok(audit({ ...base, '.github/workflows/release.yml': source }).some(finding => finding.rule === 'WF-RELEASE-PRIVILEGE'))
})

test('rejects release identity without exact event-to-main equality', () => {
  const source = base['.github/workflows/release.yml'].replace('          test "$event_commit" = "$main_commit" || {', '          true || {')
  assert.ok(audit({ ...base, '.github/workflows/release.yml': source }).some(finding => finding.rule === 'WF-RELEASE-IDENTITY'))
})

test('rejects tag-push release entrypoint', () => {
  const source = base['.github/workflows/release.yml'].replace('  repository_dispatch:\n', '  push:\n    tags: [v*]\n  repository_dispatch:\n')
  assert.ok(audit({ ...base, '.github/workflows/release.yml': source }).some(finding => finding.rule === 'WF-RELEASE-TRIGGER'))
})

test('rejects direct npm publication without provenance', () => {
  const publisher = trustedPublisher.replace("        '--provenance',\n", '')
  assert.ok(audit(base, publisher).some(finding => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects resumable npm publication without validating an existing version', () => {
  const publisher = trustedPublisher.replace('        await validateRegistryPackage(npmCli, item, context.identity)', '        return')
  assert.ok(audit(base, publisher).some(finding => finding.rule === 'WF-TRUSTED-PUBLISH'))
})

test('rejects GitHub release publication without digest readback', () => {
  const githubPublisher = trustedGithubPublisher.replace(
    'observed.digest !== wanted.digest || observed.size !== wanted.size',
    'observed.size !== wanted.size',
  )
  assert.ok(audit(base, trustedPublisher, githubPublisher).some(finding => finding.rule === 'WF-RELEASE-EVIDENCE'))
})
