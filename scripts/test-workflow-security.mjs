#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  runGovernanceAnchorVersionProjection,
  withGovernanceAnchorVersionProjection,
} from '../infra/governance/lib/governance-anchor-version-projection.mjs'
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
}

base['.github/workflows/governance-anchor.yml'] = `on:
  pull_request_target:
permissions:
  contents: read
jobs:
  verify-candidate:
    steps:
      - uses: actions/checkout@cccccccccccccccccccccccccccccccccccccccc
        with:
          persist-credentials: false
          ref: \${{ github.event.pull_request.head.sha }}
      - run: node trusted/scripts/verify-privileged-change.mjs
      - run: node trusted/scripts/install-candidate-dependencies.mjs --candidate candidate
      - run: |
          node trusted/infra/governance/lib/governance-anchor-version-projection.mjs --trusted-root trusted --candidate-root candidate
          node trusted/scripts/audit-workflow-security.mjs --root candidate
`
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

const projectionPackages = [
  ['@qijenchen/design-system', 'packages/design-system/package.json'],
  ['@qijenchen/governance', 'packages/governance/package.json'],
  ['@qijenchen/storybook-config', 'packages/storybook-config/package.json'],
]

function projectionSandbox(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'governance-anchor-version-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function writeProjectionRepository(parent, name, versions) {
  const root = join(parent, name)
  for (const [packageName, repoPath] of projectionPackages) {
    const path = join(root, repoPath)
    mkdirSync(dirname(path), { recursive: true })
    const version = typeof versions === 'string' ? versions : versions[packageName]
    writeFileSync(path, `${JSON.stringify({ name: packageName, version }, null, 2)}\n`)
  }
  return root
}

const manifestAt = (root, repoPath) => JSON.parse(readFileSync(join(root, repoPath), 'utf8'))

test('anchor projects only validated generator provenance and always restores protected-base bytes', (t) => {
  const sandbox = projectionSandbox(t)
  const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
  const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.104')
  const trustedGovernancePath = join(trusted, 'packages/governance/package.json')
  const original = readFileSync(trustedGovernancePath)

  const result = withGovernanceAnchorVersionProjection({
    trustedRoot: trusted,
    candidateRoot: candidate,
    execute(plan) {
      assert.equal(plan.trusted.version, '0.1.0-beta.103')
      assert.equal(plan.candidate.version, '0.1.0-beta.104')
      assert.equal(plan.projected, true)
      assert.equal(manifestAt(trusted, 'packages/governance/package.json').version, '0.1.0-beta.104')
      assert.equal(manifestAt(trusted, 'packages/design-system/package.json').version, '0.1.0-beta.103')
      assert.equal(manifestAt(trusted, 'packages/storybook-config/package.json').version, '0.1.0-beta.103')
      return 'verified'
    },
  })
  assert.equal(result, 'verified')
  assert.deepEqual(readFileSync(trustedGovernancePath), original)

  assert.throws(() => withGovernanceAnchorVersionProjection({
    trustedRoot: trusted,
    candidateRoot: candidate,
    execute() {
      throw new Error('expected verifier failure')
    },
  }), /expected verifier failure/)
  assert.deepEqual(readFileSync(trustedGovernancePath), original, 'verifier failure did not restore protected-base bytes')
})

test('anchor CLI executes one fixed protected-base governance command without a shell', (t) => {
  const sandbox = projectionSandbox(t)
  const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
  const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.104')
  const calls = []
  const plan = runGovernanceAnchorVersionProjection([
    '--trusted-root', trusted,
    '--candidate-root', candidate,
  ], {
    spawn(executable, args, options) {
      calls.push({ executable, args, options })
      assert.equal(manifestAt(trusted, 'packages/governance/package.json').version, '0.1.0-beta.104')
      return { status: 0 }
    },
  })
  assert.equal(plan.projected, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].executable, process.execPath)
  assert.deepEqual(calls[0].args, [
    join(trusted, 'packages/governance/bin/governance.mjs'),
    'check',
    '--repo', candidate,
    '--manifest', join(candidate, 'packages/governance/canonical/manifest.json'),
    '--role', 'ds-author',
    '--hooks-off',
  ])
  assert.equal(calls[0].options.cwd, trusted)
  assert.equal(calls[0].options.shell, false)
  assert.equal(manifestAt(trusted, 'packages/governance/package.json').version, '0.1.0-beta.103')
})

test('anchor version projection rejects split, downgraded, noncanonical, symlinked, and hard-linked manifests', async (t) => {
  await t.test('split candidate release train', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', {
      '@qijenchen/design-system': '0.1.0-beta.104',
      '@qijenchen/governance': '0.1.0-beta.105',
      '@qijenchen/storybook-config': '0.1.0-beta.104',
    })
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /candidate package versions must be identical/)
  })

  await t.test('candidate downgrade', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.102')
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /older than protected-base/)
  })

  await t.test('candidate version outside the closed release train', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-alpha.104')
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /outside the closed release train/)
  })

  await t.test('noncanonical candidate JSON', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.104')
    writeFileSync(join(candidate, 'packages/governance/package.json'), '{"name":"@qijenchen/governance","version":"0.1.0-beta.104"}\n')
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /canonical JSON serialization/)
  })

  await t.test('symbolic-link candidate manifest', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.104')
    const manifest = join(candidate, 'packages/governance/package.json')
    const target = join(candidate, 'packages/governance/package.target.json')
    writeFileSync(target, readFileSync(manifest))
    unlinkSync(manifest)
    symlinkSync(target, manifest)
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /symbolic link/)
  })

  await t.test('hard-linked candidate manifest', (t) => {
    const sandbox = projectionSandbox(t)
    const trusted = writeProjectionRepository(sandbox, 'trusted', '0.1.0-beta.103')
    const candidate = writeProjectionRepository(sandbox, 'candidate', '0.1.0-beta.104')
    const manifest = join(candidate, 'packages/governance/package.json')
    const target = join(candidate, 'packages/governance/package.target.json')
    writeFileSync(target, readFileSync(manifest))
    unlinkSync(manifest)
    linkSync(target, manifest)
    assert.throws(() => withGovernanceAnchorVersionProjection({ trustedRoot: trusted, candidateRoot: candidate, execute() {} }), /one regular file/)
  })
})

test('governance package version remains provenance-only in protected verifier source', () => {
  const common = readFileSync('packages/governance/src/common.mjs', 'utf8')
  const snapshot = readFileSync('packages/governance/src/snapshot.mjs', 'utf8')
  const versionSourceFiles = readdirSync('packages/governance/src', { recursive: true })
    .filter(path => path.endsWith('.mjs'))
    .filter(path => /\bPACKAGE_VERSION\b/.test(readFileSync(join('packages/governance/src', path), 'utf8')))
    .sort()
  assert.deepEqual(versionSourceFiles, ['common.mjs', 'snapshot.mjs'])
  assert.equal((common.match(/\bPACKAGE_VERSION\b/g) || []).length, 1)
  assert.match(common, /export const PACKAGE_VERSION = JSON\.parse\(readFileSync\(resolve\(PACKAGE_ROOT, 'package\.json'\), 'utf8'\)\)\.version/)
  const versionLines = snapshot.split('\n').filter(line => /\bPACKAGE_VERSION\b/.test(line))
  assert.equal(versionLines.length, 5)
  for (const line of versionLines) {
    assert.ok([
      /^\s*PACKAGE_VERSION,$/,
      /^\s*generatorVersion: PACKAGE_VERSION,$/,
      /@generated by @qijenchen\/governance \$\{PACKAGE_VERSION\}/,
      /Generator:.*\$\{PACKAGE_VERSION\}/,
    ].some(pattern => pattern.test(line)), `PACKAGE_VERSION gained a non-provenance use: ${line}`)
  }
})

test('actual DS anchor installs and audits protected-base dependencies before executing protected verifier code', () => {
  const workflow = readFileSync('.github/workflows/governance-anchor.yml', 'utf8')
  const markers = [
    'working-directory: trusted',
    'npm run --silent setup:dependencies',
    'node trusted/scripts/verify-privileged-change.mjs',
    'node trusted/scripts/install-candidate-dependencies.mjs --candidate candidate',
    'node trusted/infra/governance/lib/governance-anchor-version-projection.mjs',
    'node trusted/scripts/audit-workflow-security.mjs --root candidate',
  ].map((marker) => workflow.indexOf(marker))
  assert.ok(markers.every((index) => index >= 0), 'DS anchor is missing the protected-base exact dependency bootstrap closure')
  assert.deepEqual(markers, [...markers].sort((left, right) => left - right), 'DS anchor executes protected verifier code before its trusted dependencies are installed and audited')
  assert.doesNotMatch(workflow, /node trusted\/packages\/governance\/bin\/governance\.mjs check/, 'DS anchor bypasses target-version provenance projection')
  assert.doesNotMatch(
    workflow,
    /issues: read|bootstrap-comments|--pull-request|DS-GOVERNANCE-BOOTSTRAP-V1/,
    'DS anchor retained the removed OWNER-comment/per-change authorization ceremony',
  )
  assert.match(workflow, /Verify all other privileged closure changes structurally/)
})

test('consumer template keeps only the native Verify consumer workflow', () => {
  assert.equal(existsSync('template/ds-product-template/.github/workflows/governance-anchor.yml'), false)
  assert.equal(existsSync('template/ds-product-template/.github/workflows/audit.yml'), true)
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
  ['manual trigger', source => source.replace('  repository_dispatch:\n', '  workflow_dispatch:\n  repository_dispatch:\n'), 'WF-MIRROR-TRIGGER'],
  ['legacy finalizer trigger', source => source.replace('  repository_dispatch:\n    types: [mirror-published-release]', '  workflow_run:\n    workflows: [Release finalize]\n    types: [completed]'), 'WF-MIRROR-TRIGGER'],
  ['built-in contents writer', source => source.replace('      contents: read', '      contents: write'), 'WF-MIRROR-RELEASE'],
  ['missing live published-release readback', source => source.replace('gh release view', 'gh release inspect'), 'WF-MIRROR-RELEASE'],
  ['early cross-repository credential', source => source.replace('      - name: Verify six-file release set, BOM, and npm readback', '      - run: echo "${{ secrets.CROSS_REPO_TOKEN }}" >/dev/null\n      - name: Verify six-file release set, BOM, and npm readback'), 'WF-MIRROR-CREDENTIAL'],
]) {
  test(`published-release mirror rejects ${label}`, () => {
    const source = mutate(base[mirrorPath])
    assert.ok(audit({ ...base, [mirrorPath]: source }).some(finding => finding.rule === expectedRule))
  })
}

test('rejects workflow_dispatch for the authority protected-base verifier', () => {
  const rootSources = {
    ...base,
    '.github/workflows/governance-anchor.yml': base['.github/workflows/governance-anchor.yml']
      .replace('  pull_request_target:', '  workflow_dispatch:'),
  }
  assert.ok(audit(rootSources).some((finding) => finding.rule === 'WF-ANCHOR'))
})

for (const [label, mutate] of [
  [
    'direct governance check that bypasses target-version projection',
    source => source.replace(
      'node trusted/infra/governance/lib/governance-anchor-version-projection.mjs --trusted-root trusted --candidate-root candidate',
      'node trusted/packages/governance/bin/governance.mjs check --repo candidate --role ds-author --hooks-off',
    ),
  ],
  [
    'projection without the exact candidate root',
    source => source.replace('--candidate-root candidate', '--candidate-root unbound'),
  ],
  [
    'candidate workflow audit before version projection',
    source => source.replace(
      'node trusted/infra/governance/lib/governance-anchor-version-projection.mjs --trusted-root trusted --candidate-root candidate\n          node trusted/scripts/audit-workflow-security.mjs --root candidate',
      'node trusted/scripts/audit-workflow-security.mjs --root candidate\n          node trusted/infra/governance/lib/governance-anchor-version-projection.mjs --trusted-root trusted --candidate-root candidate',
    ),
  ],
]) {
  test(`rejects root anchor ${label}`, () => {
    const path = '.github/workflows/governance-anchor.yml'
    const source = mutate(base[path])
    assert.notEqual(source, base[path], `${label}: poison did not mutate fixture`)
    assert.ok(
      audit({ ...base, [path]: source }).some(finding => finding.file === path && finding.rule === 'WF-ANCHOR'),
      `${label}: expected WF-ANCHOR`,
    )
  })
}

test('rejects pull_request_target secret in candidate verification job', () => {
  const path = '.github/workflows/governance-anchor.yml'
  const sources = {
    ...base,
    [path]: base[path].replace(
      '    steps:\n',
      '    steps:\n      - run: echo ${{ secrets.PRIVATE_KEY }}\n',
    ),
  }
  assert.ok(audit(sources).some((finding) => finding.rule === 'WF-PR-TARGET-SECRET'))
})

test('rejects hostile pull_request_target event field interpolated directly into a shell run', () => {
  const path = '.github/workflows/governance-anchor.yml'
  const safe = readFileSync(path, 'utf8')
  assert.equal(
    audit({ ...base, [path]: safe }).some(finding => finding.rule === 'WF-PR-TARGET-SHELL-INTERPOLATION'),
    false,
    'the protected-base workflow must bind pull-request event fields outside run',
  )
  const mutated = safe.replace(
    '--candidate-head-sha "$HEAD_SHA"',
    '--candidate-head-sha "${{ github.event.pull_request.head.sha }}"',
  )
  assert.notEqual(mutated, safe, 'hostile event-field poison did not mutate the protected-base fixture')
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

test('published mirror has no dependency on unprovisioned App credentials', () => {
  const source = base['.github/workflows/mirror-to-published-template.yml']
  assert.doesNotMatch(source, /GOVERNANCE_(?:WRITER|CHECK)_APP|create-github-app-token/)
  assert.match(source, /secrets\.CROSS_REPO_TOKEN/)
})

test('rejects reintroduction of the retired consumer governance anchor', () => {
  const path = 'template/ds-product-template/.github/workflows/governance-anchor.yml'
  const sources = {
    ...base,
    [path]: 'on:\n  pull_request_target:\njobs: {}\n',
  }
  assert.ok(audit(sources).some((finding) => finding.file === path && finding.rule === 'WF-RETIRED-CONSUMER-ANCHOR'))
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
