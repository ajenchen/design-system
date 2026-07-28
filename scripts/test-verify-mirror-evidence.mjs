#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  validateMirrorInventory,
  validateMirrorRoot,
  verifyMirrorEvidence,
  verifyMirrorEvidenceEnvelope,
} from './verify-mirror-evidence.mjs'
import { RELEASE_PACKAGE_NAMES, RELEASE_PUBLISH_ORDER, RELEASE_SUPPLY_CHAIN } from './release-bom-contract.mjs'
import {
  buildProductTemplateScaffoldLock,
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  verifyProductTemplateScaffold,
} from './product-template-scaffold-lock.mjs'
import {
  copyVerifiedForkManagedSurfaces,
  loadVerifiedForkSurfaceAuthority,
} from './lib/published-template-provider-surfaces.mjs'
import {
  SETUP_GOVERNANCE_EXACT_NPM_VERSION,
  SETUP_GOVERNANCE_MINIMUM_NODE_VERSION,
  SETUP_GOVERNANCE_SCRIPT,
} from './setup-governance.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const policy = { schemaVersion: 1, exactPaths: ['package.json'], generatedExactPaths: [], pathPrefixes: ['apps/template/'] }
const canonicalMaterializers = JSON.parse(readFileSync(new URL('../packages/governance/canonical/providers.json', import.meta.url), 'utf8')).canonical.materializers
const file = path => ({ path, mode: '644', sha256: 'a'.repeat(64) })

test('fresh writer accepts only the protected-base mirror inventory', () => {
  assert.equal(validateMirrorInventory({ files: [file('package.json'), file('apps/template/src/main.ts')], policy }), true)
})

for (const [label, files, pattern] of [
  ['out-of-scope build output', [file('package.json'), file('backdoor.sh')], /outside protected-base allowlist/],
  ['newline/PATH poison path', [file('package.json'), file('apps/template/a\nGITHUB_PATH=/tmp/evil')], /unsafe path/],
  ['duplicate path', [file('package.json'), file('package.json')], /duplicate mirror path/],
  ['missing required file', [file('apps/template/src/main.ts')], /required mirror path is missing/],
]) {
  test(`rejects ${label} before mirror token`, () => {
    assert.throws(() => validateMirrorInventory({ files, policy }), pattern)
  })
}

const sha256 = body => createHash('sha256').update(body).digest('hex')
const sri = value => `sha512-${createHash('sha512').update(value).digest('base64')}`
const temporary = []
test.after(() => { for (const path of temporary) rmSync(path, { recursive: true, force: true }) })

function completeEvidenceFixture() {
  const base = mkdtempSync(join(tmpdir(), 'mirror-scaffold-evidence-'))
  temporary.push(base)
  const mirror = join(base, 'mirror')
  const evidence = join(base, 'evidence')
  mkdirSync(mirror); mkdirSync(evidence)
  const version = '1.2.3'
  const sourceSha = 'a'.repeat(40)
  const sourceTree = 'f'.repeat(40)
  const observedAt = new Date(Date.now() - 60_000).toISOString()
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
  const packageSris = {
    '@qijenchen/design-system': sri('design-system'),
    '@qijenchen/storybook-config': sri('storybook-config'),
    '@qijenchen/governance': sri('governance'),
  }
  const rootManifest = {
    name: 'ds-product-template', version: '0.0.0', workspaces: ['apps/*'],
    dependencies: { '@qijenchen/design-system': version, '@qijenchen/storybook-config': version },
    devDependencies: { npm: SETUP_GOVERNANCE_EXACT_NPM_VERSION },
    engines: { node: `>=${SETUP_GOVERNANCE_MINIMUM_NODE_VERSION}` },
    scripts: { 'setup:governance': SETUP_GOVERNANCE_SCRIPT },
  }
  writeFileSync(join(mirror, 'package.json'), `${JSON.stringify(rootManifest, null, 2)}\n`)
  writeFileSync(join(mirror, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\n')
  mkdirSync(join(mirror, 'apps/template'), { recursive: true })
  writeFileSync(join(mirror, 'apps/template/package.json'), `${JSON.stringify({
    name: '@product/template', version: '0.0.0', dependencies: { '@qijenchen/design-system': version },
  }, null, 2)}\n`)
  const scaffoldLock = buildProductTemplateScaffoldLock({ root: mirror, releaseVersion: version })
  const scaffoldBytes = Buffer.from(`${JSON.stringify(scaffoldLock, null, 2)}\n`)
  const scaffoldDigest = sha256(scaffoldBytes)
  writeFileSync(join(evidence, PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET), scaffoldBytes)
  writeFileSync(join(mirror, 'package-lock.json'), `${JSON.stringify({
    name: rootManifest.name, version: rootManifest.version, lockfileVersion: 3, requires: true,
    packages: {
      '': {
        name: rootManifest.name,
        version: rootManifest.version,
        workspaces: rootManifest.workspaces,
        dependencies: rootManifest.dependencies,
        devDependencies: rootManifest.devDependencies,
        engines: rootManifest.engines,
      },
      'apps/template': { name: '@product/template', version: '0.0.0', dependencies: { '@qijenchen/design-system': version } },
      'node_modules/@qijenchen/design-system': { version, resolved: `https://registry.npmjs.org/@qijenchen/design-system/-/design-system-${version}.tgz`, integrity: packageSris['@qijenchen/design-system'] },
      'node_modules/@qijenchen/storybook-config': { version, resolved: `https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-${version}.tgz`, integrity: packageSris['@qijenchen/storybook-config'] },
      'node_modules/npm': {
        version: SETUP_GOVERNANCE_EXACT_NPM_VERSION,
        resolved: `https://registry.npmjs.org/npm/-/npm-${SETUP_GOVERNANCE_EXACT_NPM_VERSION}.tgz`,
        integrity: sri('npm-runtime'),
        bin: { npm: 'bin/npm-cli.js' },
      },
    },
  }, null, 2)}\n`)
  chmodSync(join(mirror, 'package-lock.json'), 0o644)
  const packages = RELEASE_PACKAGE_NAMES.map(name => ({
    name, version, file: `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`,
    size: 1, entryCount: 1, shasum: 'b'.repeat(40), sha256: 'c'.repeat(64), integrity: packageSris[name],
    packageJsonSha256: 'd'.repeat(64), sourceManifest: `packages/${name.split('/')[1]}/package.json`, sourceManifestSha256: 'e'.repeat(64),
  }))
  const bom = {
    schemaVersion: 5, releaseVersion: version, npmDistTag: 'latest', publishOrder: RELEASE_PUBLISH_ORDER,
    source: { repository: 'ajenchen/design-system', repositoryUrl: 'git+https://github.com/ajenchen/design-system.git', gitCommit: sourceSha, gitTree: sourceTree, tag: `v${version}` },
    supplyChain: RELEASE_SUPPLY_CHAIN,
    packages,
    governance: {
      controlPlane: { path: 'governance/control-plane.lock.json', sha256: '1'.repeat(64), role: 'ds-author', inputDigest: `sha256:${'2'.repeat(64)}`, contractDigest: `sha256:${'3'.repeat(64)}`, snapshotDigest: `sha256:${'4'.repeat(64)}`, generatorVersion: version },
      consumer: { path: 'template/ds-product-template/governance/lock.json', sha256: '5'.repeat(64), role: 'template-consumer', release: { designSystem: version, storybookConfig: version } },
      forkCorpus: { path: 'packages/design-system/ds-canonical/fork/governance.lock', sha256: '6'.repeat(64) },
      productTemplateScaffold: {
        path: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET, size: scaffoldBytes.length, sha256: scaffoldDigest,
        schemaVersion: scaffoldLock.schemaVersion, releaseVersion: version,
        staticTreeSha256: scaffoldLock.staticTreeSha256, publishedPathCount: scaffoldLock.publishedPathCount,
      },
    },
    sbom: { file: 'release.sbom.cdx.json', size: 1, sha256: '7'.repeat(64) },
  }
  const bomBytes = Buffer.from(`${JSON.stringify(bom, null, 2)}\n`)
  writeFileSync(join(evidence, 'release-bom.json'), bomBytes)
  writeFileSync(join(evidence, 'mirror.tar'), 'archive fixture\n')
  const activationBoundaryProof = {
    schemaVersion: 1,
    kind: 'mirror-activation-boundary-proof-v1',
    release: { repository: 'ajenchen/design-system', commit: sourceSha, tree: sourceTree },
    bindings: {
      requirementsSha256: '8'.repeat(64),
      policyDigest: '9'.repeat(64),
      projectionContractDigest: 'a'.repeat(64),
    },
    minimumExpiresAt: expiresAt,
    boundaries: [
      {
        repository: 'ajenchen/design-system',
        requirementId: 'activate-design-system-mirror-mutation-boundary',
        observedAt,
        expiresAt,
        publicRulesetProjectionDigest: 'b'.repeat(64),
        normalizedRulesetsDigest: 'c'.repeat(64),
        environmentPolicyDigest: 'd'.repeat(64),
        environmentClassification: { kind: 'named-protected-environment', name: 'governance-mirror' },
      },
      {
        repository: 'ajenchen/ds-product-template',
        requirementId: 'activate-product-template-mirror-mutation-boundary',
        observedAt,
        expiresAt,
        publicRulesetProjectionDigest: 'e'.repeat(64),
        normalizedRulesetsDigest: 'f'.repeat(64),
        environmentPolicyDigest: '0'.repeat(64),
        environmentClassification: { kind: 'absent', name: null },
      },
    ],
  }
  const activationBoundaryProofBytes = Buffer.from(`${JSON.stringify(activationBoundaryProof, null, 2)}\n`)
  writeFileSync(join(evidence, 'mirror-activation-boundary-proof.json'), activationBoundaryProofBytes)
  const policy = {
    schemaVersion: 1,
    exactPaths: ['.npmrc', 'apps/template/package.json', 'package.json'],
    generatedExactPaths: ['package-lock.json'],
    pathPrefixes: [],
  }
  const policyPath = join(base, 'policy.json')
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  const files = validateMirrorRoot({ mirrorRoot: mirror, policy })
  const treeBody = files.map(item => `${item.mode} ${item.sha256} ./${item.path}\n`).join('')
  const receipt = {
    schemaVersion: 4,
    sourceSha,
    sourceTree,
    version,
    archiveSha256: sha256(readFileSync(join(evidence, 'mirror.tar'))),
    treeSha256: sha256(Buffer.from(treeBody)),
    releaseBomSha256: sha256(bomBytes),
    scaffoldLockSha256: scaffoldDigest,
    activationBoundaryProofSha256: sha256(activationBoundaryProofBytes),
  }
  writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  return { base, mirror, evidence, policyPath, sourceSha, sourceTree, version, receipt, activationBoundaryProof }
}

function verifyFixture(fixture) {
  return verifyMirrorEvidence({
    evidenceDirectory: fixture.evidence,
    mirrorRoot: fixture.mirror,
    policyPath: fixture.policyPath,
    expectedSourceSha: fixture.sourceSha,
    expectedSourceTree: fixture.sourceTree,
    expectedVersion: fixture.version,
    expectedArchiveSha256: fixture.receipt.archiveSha256,
    expectedTreeSha256: fixture.receipt.treeSha256,
    expectedReleaseBomSha256: fixture.receipt.releaseBomSha256,
    expectedScaffoldLockSha256: fixture.receipt.scaffoldLockSha256,
    expectedActivationBoundaryProofSha256: fixture.receipt.activationBoundaryProofSha256,
  })
}

function resealFixtureActivationBoundaryProof(fixture, proof = fixture.activationBoundaryProof) {
  fixture.activationBoundaryProof = proof
  const bytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`)
  writeFileSync(join(fixture.evidence, 'mirror-activation-boundary-proof.json'), bytes)
  fixture.receipt.activationBoundaryProofSha256 = sha256(bytes)
  writeFileSync(join(fixture.evidence, 'receipt.json'), `${JSON.stringify(fixture.receipt, null, 2)}\n`)
}

function resealFixtureTree(fixture) {
  const fixturePolicy = JSON.parse(readFileSync(fixture.policyPath, 'utf8'))
  const files = validateMirrorRoot({ mirrorRoot: fixture.mirror, policy: fixturePolicy })
  const treeBody = files.map(item => `${item.mode} ${item.sha256} ./${item.path}\n`).join('')
  fixture.receipt.treeSha256 = sha256(Buffer.from(treeBody))
  writeFileSync(join(fixture.evidence, 'receipt.json'), `${JSON.stringify(fixture.receipt, null, 2)}\n`)
}

test('fresh writer closes BOM -> scaffold lock bytes -> full published tree readback', () => {
  const fixture = completeEvidenceFixture()
  assert.deepEqual(verifyMirrorEvidenceEnvelope({
    evidenceDirectory: fixture.evidence,
    expectedSourceSha: fixture.sourceSha,
    expectedSourceTree: fixture.sourceTree,
    expectedVersion: fixture.version,
    expectedArchiveSha256: fixture.receipt.archiveSha256,
    expectedTreeSha256: fixture.receipt.treeSha256,
    expectedReleaseBomSha256: fixture.receipt.releaseBomSha256,
    expectedScaffoldLockSha256: fixture.receipt.scaffoldLockSha256,
    expectedActivationBoundaryProofSha256: fixture.receipt.activationBoundaryProofSha256,
  }).receipt, fixture.receipt)
  assert.deepEqual(verifyFixture(fixture), fixture.receipt)

  mkdirSync(join(fixture.mirror, '.git'))
  writeFileSync(join(fixture.mirror, '.git/config'), '[core]\nrepositoryformatversion = 0\n')
  assert.throws(() => verifyMirrorEvidence({
    evidenceDirectory: fixture.evidence,
    mirrorRoot: fixture.mirror,
    policyPath: fixture.policyPath,
    expectedSourceSha: fixture.sourceSha,
    expectedSourceTree: fixture.sourceTree,
  }), /git metadata is forbidden/)
  assert.deepEqual(verifyMirrorEvidence({
    evidenceDirectory: fixture.evidence,
    mirrorRoot: fixture.mirror,
    policyPath: fixture.policyPath,
    expectedSourceSha: fixture.sourceSha,
    expectedSourceTree: fixture.sourceTree,
    allowRootGitMetadata: true,
  }), fixture.receipt)
})

test('receipt v4 makes the fresh signed activation-boundary proof an inseparable evidence asset', () => {
  const downgraded = completeEvidenceFixture()
  downgraded.receipt.schemaVersion = 3
  writeFileSync(join(downgraded.evidence, 'receipt.json'), `${JSON.stringify(downgraded.receipt, null, 2)}\n`)
  assert.throws(() => verifyFixture(downgraded), /receipt has an open or invalid shape/)

  const missing = completeEvidenceFixture()
  rmSync(join(missing.evidence, 'mirror-activation-boundary-proof.json'))
  assert.throws(() => verifyFixture(missing), /evidence must contain exactly.*mirror-activation-boundary-proof\.json/)

  const substituted = completeEvidenceFixture()
  const proofPath = join(substituted.evidence, 'mirror-activation-boundary-proof.json')
  writeFileSync(proofPath, `${readFileSync(proofPath, 'utf8')} `)
  assert.throws(() => verifyFixture(substituted), /activation-boundary proof digest mismatch/)

  const open = completeEvidenceFixture()
  resealFixtureActivationBoundaryProof(open, { ...open.activationBoundaryProof, undeclared: true })
  assert.throws(() => verifyFixture(open), /activation-boundary proof is invalid:.*open shape/)

  const expired = completeEvidenceFixture()
  const expiredAt = '2000-01-01T01:00:00.000Z'
  const expiredObservedAt = '2000-01-01T00:00:00.000Z'
  const expiredProof = structuredClone(expired.activationBoundaryProof)
  expiredProof.minimumExpiresAt = expiredAt
  for (const boundary of expiredProof.boundaries) {
    boundary.observedAt = expiredObservedAt
    boundary.expiresAt = expiredAt
  }
  resealFixtureActivationBoundaryProof(expired, expiredProof)
  assert.throws(() => verifyFixture(expired), /activation-boundary proof is invalid:.*minimum remaining validity/)

  for (const field of ['commit', 'tree']) {
    const wrongRelease = completeEvidenceFixture()
    const proof = structuredClone(wrongRelease.activationBoundaryProof)
    proof.release[field] = '0'.repeat(40)
    resealFixtureActivationBoundaryProof(wrongRelease, proof)
    assert.throws(() => verifyFixture(wrongRelease), /proof release differs from the receipt source commit\/tree/)
  }

  const expectedMismatch = completeEvidenceFixture()
  assert.throws(() => verifyMirrorEvidenceEnvelope({
    evidenceDirectory: expectedMismatch.evidence,
    expectedSourceSha: expectedMismatch.sourceSha,
    expectedSourceTree: expectedMismatch.sourceTree,
    expectedActivationBoundaryProofSha256: '0'.repeat(64),
  }), /activation-boundary proof digest differs from the credential-free job output/)
})

test('pre-extraction envelope rejects source-tree and credential-free output substitution', () => {
  const fixture = completeEvidenceFixture()
  const expected = {
    evidenceDirectory: fixture.evidence,
    expectedSourceSha: fixture.sourceSha,
    expectedSourceTree: fixture.sourceTree,
    expectedVersion: fixture.version,
    expectedArchiveSha256: fixture.receipt.archiveSha256,
    expectedTreeSha256: fixture.receipt.treeSha256,
    expectedReleaseBomSha256: fixture.receipt.releaseBomSha256,
    expectedScaffoldLockSha256: fixture.receipt.scaffoldLockSha256,
  }
  assert.throws(() => verifyMirrorEvidenceEnvelope({ ...expected, expectedSourceTree: '0'.repeat(40) }), /receipt tree is not the immutable release tree/)
  assert.throws(() => verifyMirrorEvidenceEnvelope({ ...expected, expectedArchiveSha256: '0'.repeat(64) }), /differs from the credential-free job output/)
})

test('published-day0 verifier rejects source-scaffold and fully rehashed setup snapshot poison', () => {
  const sourceScaffold = completeEvidenceFixture()
  rmSync(join(sourceScaffold.mirror, 'package-lock.json'))
  assert.throws(
    () => verifyFixture(sourceScaffold),
    /required generated mirror path is missing: package-lock\.json/,
  )

  const poisonedSetup = completeEvidenceFixture()
  const lockPath = join(poisonedSetup.mirror, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.packages['node_modules/npm'].bin.npm = 'bin/attacker.js'
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  resealFixtureTree(poisonedSetup)
  assert.throws(
    () => verifyFixture(poisonedSetup),
    /npm artifact does not bind bin\/npm-cli\.js/,
  )
})

test('fresh writer rejects scaffold-lock byte substitution and post-receipt tree drift', () => {
  const first = completeEvidenceFixture()
  writeFileSync(join(first.evidence, PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET), '{}\n')
  assert.throws(() => verifyMirrorEvidence({
    evidenceDirectory: first.evidence, mirrorRoot: first.mirror,
    policyPath: first.policyPath, expectedSourceSha: first.sourceSha, expectedSourceTree: first.sourceTree,
  }), /scaffold lock digest mismatch/)

  const second = completeEvidenceFixture()
  writeFileSync(join(second.mirror, 'apps/template/package.json'), '{}\n')
  assert.throws(() => verifyMirrorEvidence({
    evidenceDirectory: second.evidence, mirrorRoot: second.mirror,
    policyPath: second.policyPath, expectedSourceSha: second.sourceSha, expectedSourceTree: second.sourceTree,
  }), /scaffold bytes\/mode drifted|extracted tree differs/)

  const third = completeEvidenceFixture()
  const lockPath = join(third.mirror, 'package-lock.json')
  writeFileSync(lockPath, JSON.stringify(JSON.parse(readFileSync(lockPath, 'utf8'))))
  assert.throws(() => verifyMirrorEvidence({
    evidenceDirectory: third.evidence, mirrorRoot: third.mirror,
    policyPath: third.policyPath, expectedSourceSha: third.sourceSha, expectedSourceTree: third.sourceTree,
  }), /extracted tree differs/)
})

test('verified future provider surfaces flow into mirror policy and scaffold evidence without provider hard-coding', () => {
  const authorityRoot = mkdtempSync(join(tmpdir(), 'future-provider-mirror-authority-'))
  temporary.push(authorityRoot)
  const forkRoot = join(authorityRoot, 'packages/design-system/ds-canonical/fork')
  const templateRoot = join(authorityRoot, 'template/ds-product-template')
  const mirrorRoot = join(authorityRoot, 'mirror')
  mkdirSync(forkRoot, { recursive: true }); mkdirSync(templateRoot, { recursive: true }); mkdirSync(mirrorRoot)
  const write = (root, path, body) => {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
  }
  const commonBody = '# common AGENTS\n'
  const instructionBody = '# FUTURE provider\n'
  const hookBody = '{"events":[]}\n'
  const skillBody = '# future workflow\n'
  const rulesBody = '# future product rules\n'
  write(forkRoot, 'common/instruction.md', commonBody)
  write(forkRoot, 'providers/future/instruction.md', instructionBody)
  write(forkRoot, 'providers/future/hook-config.json', hookBody)
  write(forkRoot, 'providers/future/skills/review/WORKFLOW.md', skillBody)
  write(forkRoot, 'providers/future/trees/rules/policy.md', rulesBody)
  write(templateRoot, 'AGENTS.md', commonBody)
  write(templateRoot, 'FUTURE.md', instructionBody)
  write(templateRoot, '.future/hooks.json', hookBody)
  write(templateRoot, '.future/skills/review/WORKFLOW.md', skillBody)
  write(templateRoot, '.future/rules/policy.md', rulesBody)
  const manifest = {
    schemaVersion: 2,
    kind: 'provider-neutral-fork-manifest',
    materializers: structuredClone(canonicalMaterializers),
    consumer: {
      commonInstruction: {
        schemaVersion: 1, artifact: 'common/instruction.md', destination: 'AGENTS.md', materializerId: 'shared-instruction-v1',
      },
      launcherDestination: 'governance/bin',
      managedFiles: {},
    },
    providerSurfaces: {
      future: {
        schemaVersion: 3,
        generated: true,
        capabilities: { nativeHooks: true, hookEnforcement: 'native-feedback-plus-ci', hardGate: 'provider-neutral-ci-required' },
        instructionArtifact: 'providers/future/instruction.md',
        instructionDestination: 'FUTURE.md',
        instructionMaterializerId: 'markdown-relative-at-import-v1',
        hookArtifact: 'providers/future/hook-config.json',
        hookDestination: '.future/hooks.json',
        hookMaterializerId: 'command-hooks-json-v1',
        skillArtifactRoot: 'providers/future/skills',
        skillDestination: '.future/skills',
        skillMaterializerId: 'markdown-workflows-directory-v1',
        skillEntryFile: 'WORKFLOW.md',
        skills: ['review'],
        trees: [{
          schemaVersion: 1,
          name: 'rules',
          artifactRoot: 'providers/future/trees/rules',
          destination: '.future/rules',
          materializerId: 'closed-tree-copy-v1',
          transformPolicy: 'byte-exact',
        }],
        managedSurfaces: [
          { path: '.future/hooks.json', kind: 'file' },
          { path: '.future/rules', kind: 'tree' },
          { path: '.future/skills', kind: 'tree' },
          { path: 'FUTURE.md', kind: 'file' },
        ],
        nativeHookCoverage: {
          schemaVersion: 2,
          canonicalEvents: ['PreToolUse'],
          projectedEvents: ['PreToolUse'],
          projectedNativeEvents: [{ canonicalEvent: 'PreToolUse', nativeEvent: 'beforeWrite' }],
          excludedEvents: [],
        },
        environmentMap: {},
        exclusions: [],
      },
    },
  }
  write(forkRoot, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  const lockedPaths = [
    'common/instruction.md', 'manifest.json', 'providers/future/hook-config.json',
    'providers/future/instruction.md', 'providers/future/skills/review/WORKFLOW.md',
    'providers/future/trees/rules/policy.md',
  ].sort(compareUtf8Bytes)
  const lock = {
    schemaVersion: 1,
    kind: 'fork-governance-corpus-lock',
    hashAlgorithm: 'sha256',
    _purpose: 'synthetic authenticated future-provider corpus',
    entries: lockedPaths.map(path => ({
      schemaVersion: 1, file: path, sha256: sha256(readFileSync(join(forkRoot, path))),
      source: null, classification: null, destination: null,
    })),
  }
  write(forkRoot, 'governance.lock', `${JSON.stringify(lock, null, 2)}\n`)
  const authority = loadVerifiedForkSurfaceAuthority({
    authorityRoot,
    manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
    lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
  })
  const mismatchedInstructionMirror = join(authorityRoot, 'mismatched-instruction-mirror')
  mkdirSync(mismatchedInstructionMirror)
  write(templateRoot, 'FUTURE.md', '# drifted generated instruction\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedInstructionMirror, authority }),
    /instruction differs from its authenticated fork artifact/,
  )
  assert.deepEqual(readdirSync(mismatchedInstructionMirror), [], 'template drift must fail before the first mirror write')
  write(templateRoot, 'FUTURE.md', instructionBody)
  const mismatchedHookMirror = join(authorityRoot, 'mismatched-hook-mirror')
  mkdirSync(mismatchedHookMirror)
  write(templateRoot, '.future/hooks.json', '{"events":["drift"]}\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedHookMirror, authority }),
    /hook config differs from its authenticated fork artifact/,
  )
  write(templateRoot, '.future/hooks.json', hookBody)
  const mismatchedSkillMirror = join(authorityRoot, 'mismatched-skill-mirror')
  mkdirSync(mismatchedSkillMirror)
  write(templateRoot, '.future/skills/review/UNLOCKED.md', '# unlocked drift\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedSkillMirror, authority }),
    /skills differ from their authenticated fork artifact tree/,
  )
  rmSync(join(templateRoot, '.future/skills/review/UNLOCKED.md'))
  const mismatchedProductTreeMirror = join(authorityRoot, 'mismatched-product-tree-mirror')
  mkdirSync(mismatchedProductTreeMirror)
  write(templateRoot, '.future/rules/policy.md', '# drifted product tree\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedProductTreeMirror, authority }),
    /product tree rules differs from its authenticated fork artifact tree/,
  )
  write(templateRoot, '.future/rules/policy.md', rulesBody)
  copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot, authority })
  for (const path of ['AGENTS.md', 'FUTURE.md', '.future/hooks.json', '.future/rules/policy.md', '.future/skills/review/WORKFLOW.md']) {
    assert.equal(readFileSync(join(mirrorRoot, path), 'utf8').length > 0, true, `${path} is absent from the synthetic mirror`)
  }
  const dynamicPolicy = {
    schemaVersion: 2,
    exactPaths: [],
    generatedExactPaths: [],
    pathPrefixes: [],
    providerSurfaceAuthority: {
      derivationPolicy: 'verified-fork-managed-surfaces-v1',
      manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
      lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
    },
  }
  assert.equal(validateMirrorRoot({ mirrorRoot, policy: dynamicPolicy, requireGenerated: false, authorityRoot }).length, 5)
  assert.throws(() => validateMirrorRoot({
    mirrorRoot,
    policy: {
      ...dynamicPolicy,
      providerSurfaceAuthority: { ...dynamicPolicy.providerSurfaceAuthority, undeclared: true },
    },
    requireGenerated: false,
    authorityRoot,
  }), /provider surface authority has an open or invalid shape/)
  assert.throws(() => validateMirrorRoot({
    mirrorRoot,
    policy: { ...dynamicPolicy, generatedExactPaths: ['AGENTS.md'] },
    requireGenerated: false,
    authorityRoot,
  }), /cannot be both static\/provider-managed and post-release generated/)
  const scaffoldLock = buildProductTemplateScaffoldLock({ root: mirrorRoot, releaseVersion: '1.2.3' })
  assert.equal(scaffoldLock.entries.some(entry => entry.path === 'FUTURE.md'), true)
  assert.equal(scaffoldLock.entries.some(entry => entry.path === '.future/hooks.json'), true)
  assert.equal(scaffoldLock.entries.some(entry => entry.path === '.future/skills/review/WORKFLOW.md'), true)
  write(mirrorRoot, 'FUTURE.md', '# tampered\n')
  assert.throws(() => verifyProductTemplateScaffold({ root: mirrorRoot, lock: scaffoldLock, phase: 'source' }), /bytes\/mode drifted/)

  const overlappingManifest = structuredClone(manifest)
  overlappingManifest.providerSurfaces.future.managedSurfaces.unshift({ path: '.future', kind: 'tree' })
  write(forkRoot, 'manifest.json', `${JSON.stringify(overlappingManifest, null, 2)}\n`)
  lock.entries.find(entry => entry.file === 'manifest.json').sha256 = sha256(readFileSync(join(forkRoot, 'manifest.json')))
  write(forkRoot, 'governance.lock', `${JSON.stringify(lock, null, 2)}\n`)
  assert.throws(() => loadVerifiedForkSurfaceAuthority({
    authorityRoot,
    manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
    lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
  }), /managedSurfaces contain overlapping portable paths|managedSurfaces trees must exactly match|published provider surfaces overlap/)
})
