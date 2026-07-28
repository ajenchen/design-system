#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  applyPreverifiedUpgradeEvidence,
  assertLiveProtectedMain,
  assertProtectedPackageScripts,
  requiresReviewedBootstrap,
  stagedUpgradeOperations,
  upgradeAuthoritySha256,
  upgradeVerificationSha256,
  validateUpgradeOperations,
  validateUpgradeReceipt,
  verifyAndApplyUpgradeEvidence,
} from './verify-upgrade-evidence.mjs'
import {
  REVIEWED_CONTROL_PLANE_UPDATE_COMMAND,
  REVIEWED_CONTROL_PLANE_UPDATE_ROUTE,
  canonicalPackageScripts,
  packageScriptsAreIdentical,
  requiresReviewedControlPlaneUpdate,
} from './lib/consumer-control-plane-policy.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const version = '1.2.3'
const previousCorpus = {
  releaseVersion: '1.2.2',
  consumerBomSha256: '1'.repeat(64),
  forkCorpusLockSha256: '2'.repeat(64),
  manifestSha256: '3'.repeat(64),
  providerLifecycleSha256: '4'.repeat(64),
}
const incomingCorpus = {
  releaseVersion: version,
  consumerBomSha256: '5'.repeat(64),
  forkCorpusLockSha256: '6'.repeat(64),
  manifestSha256: '7'.repeat(64),
  providerLifecycleSha256: '8'.repeat(64),
}
const provenance = {
  repository: 'ajenchen/design-system',
  workflow: '.github/workflows/release.yml',
  tag: `v${version}`,
  tagObject: 'e'.repeat(40),
  gitCommit: '9'.repeat(40),
  gitTree: 'f'.repeat(40),
  bomSha256: 'a'.repeat(64),
  releaseAssetDigest: `sha256:${'a'.repeat(64)}`,
  releaseSetSha256: 'b'.repeat(64),
  finalizationReceiptSha256: 'c'.repeat(64),
  releaseTrustEvidenceSha256: 'd'.repeat(64),
  packages: [
    { name: '@qijenchen/design-system', version, integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
    { name: '@qijenchen/storybook-config', version, integrity: `sha512-${Buffer.alloc(64, 2).toString('base64')}` },
  ],
}
const toolchain = { node: 'v22.22.0', npm: '11.18.0' }

const authority = {
  schemaVersion: 1,
  previousCorpus,
  incomingCorpus,
  provenance,
  toolchain,
  previousMaterialization: {
    exactPaths: ['governance/lock.json', 'governance/old.md', 'package-lock.json'],
    pathPrefixes: ['.agents/skills/existing/'],
  },
  incomingMaterialization: {
    exactPaths: ['governance/lock.json', 'governance/setup.md', 'package-lock.json'],
    pathPrefixes: ['.agents/skills/existing/', '.agents/skills/new-skill/'],
  },
  retirementDeletes: [{ kind: 'tree', path: '.legacy-provider', sha256: 'b'.repeat(64) }],
}

const patch = Buffer.from('fixture patch\n')
const base = 'c'.repeat(40)
const operations = [{ path: 'governance/lock.json', status: 'M' }]
const receipt = {
  schemaVersion: 2,
  baseSha: base,
  version,
  patchSha256: sha256(patch),
  treeSha256: 'd'.repeat(40),
  paths: operations.map(item => item.path),
  operations,
  previousCorpus,
  incomingCorpus,
  provenance,
  authoritySha256: upgradeAuthoritySha256(authority),
  toolchain,
}

test('committed v2 JSON Schema accepts the canonical receipt and rejects an open receipt', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, 'schemas/upgrade-evidence-receipt.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors))
  assert.equal(validate({ ...receipt, attacker: true }), false)
  for (const field of [
    'tagObject', 'gitTree', 'releaseSetSha256',
    'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
  ]) {
    assert.equal(validate({ ...receipt, provenance: { ...provenance, [field]: 'not-a-bound-identity' } }), false, field)
  }
})

test('accepts a v2 receipt rebound to protected-base authority and certifier outputs', () => {
  const validated = validateUpgradeReceipt({
    receipt,
    patchBytes: patch,
    expectedBaseSha: base,
    expectedVersion: version,
    expectedPatchSha256: receipt.patchSha256,
    expectedTreeSha: receipt.treeSha256,
    expectedAuthoritySha256: receipt.authoritySha256,
    authority,
  })
  assert.deepEqual(validated.operations, operations)
})

test('operation authority supports retained edits, new paths and current retirement deletes', () => {
  assert.deepEqual(validateUpgradeOperations([
    { path: '.agents/skills/existing/added-reference.md', status: 'A' },
    { path: '.agents/skills/existing/removed-reference.md', status: 'D' },
    { path: '.agents/skills/new-skill/SKILL.md', status: 'A' },
    { path: '.legacy-provider/OLD.md', status: 'D' },
    { path: 'governance/lock.json', status: 'M' },
    { path: 'governance/setup.md', status: 'A' },
  ], authority).length, 6)
})

for (const [label, poisoned, pattern] of [
  ['candidate takeover of a product path', [{ path: 'apps/product/src/backdoor.ts', status: 'M' }], /not retained governance authority/],
  ['modification at an incoming-only path', [{ path: 'governance/setup.md', status: 'M' }], /not retained governance authority/],
  ['un-tombstoned removal of old authority', [{ path: 'governance/old.md', status: 'D' }], /no retained authority/],
  ['write into a retired provider root', [{ path: '.legacy-provider/OLD.md', status: 'M' }], /not retained governance authority/],
  ['unsupported type-changing status', [{ path: 'governance/lock.json', status: 'T' }], /unsupported/],
]) {
  test(`rejects ${label}`, () => assert.throws(() => validateUpgradeOperations(poisoned, authority), pattern))
}

for (const path of [
  '.github/workflows/audit.yml',
  '.npmrc',
  'governance/bin/normalize-provider-event.mjs',
  'scripts/audit-consumer-a11y.mjs',
]) {
  test(`routes every protected control-plane operation to recurring reviewed update: ${path}`, () => {
    const protectedAuthority = {
      ...authority,
      previousMaterialization: { exactPaths: [path], pathPrefixes: [] },
      incomingMaterialization: { exactPaths: [path], pathPrefixes: [] },
    }
    for (const status of ['A', 'M', 'D']) {
      assert.throws(
        () => validateUpgradeOperations([{ path, status }], protectedAuthority),
        new RegExp(`GOV-UPGRADE-BOOTSTRAP-001.*${REVIEWED_CONTROL_PLANE_UPDATE_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        `${status}:${path}`,
      )
    }
  })
}

test('protected control-plane classification is one closed SSOT with safe near misses', () => {
  for (const path of [
    '.github/workflows/audit.yml',
    '.npmrc',
    'governance/bin/normalize-provider-event.mjs',
    'scripts/sync-all.mjs',
  ]) {
    assert.equal(requiresReviewedControlPlaneUpdate(path), true, path)
    assert.equal(requiresReviewedBootstrap(path), true, path)
  }
  for (const path of [
    '.github-safe/workflows/audit.yml',
    '.npmrc.example',
    'governance/binary/data.json',
    'scripts-safe/sync-all.mjs',
    'governance/lock.json',
  ]) {
    assert.equal(requiresReviewedControlPlaneUpdate(path), false, path)
    assert.equal(requiresReviewedBootstrap(path), false, path)
  }
  assert.equal(REVIEWED_CONTROL_PLANE_UPDATE_ROUTE.includes(REVIEWED_CONTROL_PLANE_UPDATE_COMMAND), true)

  const verifierSource = readFileSync(join(import.meta.dirname, 'verify-upgrade-evidence.mjs'), 'utf8')
  assert.match(verifierSource, /from '\.\/lib\/consumer-control-plane-policy\.mjs'/)
  assert.doesNotMatch(verifierSource, /BOOTSTRAP_ONLY_(?:EXACT_PATHS|PATH_PREFIXES)/)
})

test('package-script classification is canonical, closed, and order-independent', () => {
  const previous = { scripts: { test: 'node test.mjs', build: 'node build.mjs' } }
  const reordered = { scripts: { build: 'node build.mjs', test: 'node test.mjs' } }
  const changed = { scripts: { build: 'node takeover.mjs', test: 'node test.mjs' } }
  const added = { scripts: { build: 'node build.mjs', lint: 'node lint.mjs', test: 'node test.mjs' } }
  const removed = { scripts: { build: 'node build.mjs' } }
  assert.deepEqual(Object.keys(canonicalPackageScripts(previous)), ['build', 'test'])
  assert.equal(packageScriptsAreIdentical(previous, reordered), true)
  assert.equal(packageScriptsAreIdentical(previous, changed), false)
  assert.equal(packageScriptsAreIdentical(previous, added), false)
  assert.equal(packageScriptsAreIdentical(previous, removed), false)
  assert.throws(() => canonicalPackageScripts({ scripts: [] }), /scripts are invalid/)
  assert.throws(() => canonicalPackageScripts({ scripts: { build: '' } }), /script build is invalid/)
})

test('rejects open receipts, digest substitution, output substitution and operation/path mismatch', () => {
  const common = { patchBytes: patch, expectedBaseSha: base, expectedVersion: version }
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, attacker: true } }), /open or incomplete/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, patchBytes: Buffer.from('different') }), /patch digest mismatch/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, expectedPatchSha256: 'e'.repeat(64) }), /certifier patch output/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, expectedTreeSha: 'e'.repeat(40) }), /certifier tree output/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, paths: ['governance//lock.json'] } }), /non-canonical|differ/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, operations: [...receipt.operations, receipt.operations[0]], paths: [...receipt.paths, receipt.paths[0]] } }), /duplicate/)
})

test('rejects malformed and semantically detached immutable-release provenance', () => {
  const common = { patchBytes: patch, expectedBaseSha: base, expectedVersion: version }
  for (const field of [
    'tagObject', 'gitTree', 'releaseSetSha256',
    'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
  ]) {
    assert.throws(
      () => validateUpgradeReceipt({ ...common, receipt: { ...receipt, provenance: { ...provenance, [field]: 'not-a-bound-identity' } } }),
      new RegExp(field),
    )
  }
  assert.throws(
    () => validateUpgradeReceipt({
      ...common,
      receipt: { ...receipt, provenance: { ...provenance, releaseAssetDigest: `sha256:${'0'.repeat(64)}` } },
    }),
    /immutable Release BOM binding/,
  )
  assert.throws(
    () => validateUpgradeReceipt({
      ...common,
      receipt: {
        ...receipt,
        provenance: {
          ...provenance,
          packages: [provenance.packages[0], { ...provenance.packages[1], version: '1.2.4' }],
        },
      },
    }),
    /one exact release version/,
  )
})

test('binds every immutable-release identity into protected-base authority', () => {
  const common = {
    patchBytes: patch,
    expectedBaseSha: base,
    expectedVersion: version,
    expectedAuthoritySha256: receipt.authoritySha256,
    authority,
  }
  for (const [field, replacement] of [
    ['tagObject', '0'.repeat(40)],
    ['gitTree', '1'.repeat(40)],
    ['releaseSetSha256', '2'.repeat(64)],
    ['finalizationReceiptSha256', '3'.repeat(64)],
    ['releaseTrustEvidenceSha256', '4'.repeat(64)],
  ]) {
    assert.throws(
      () => validateUpgradeReceipt({
        ...common,
        receipt: { ...receipt, provenance: { ...provenance, [field]: replacement } },
      }),
      /receipt provenance differs from protected-base reconstruction/,
      field,
    )
  }
})

test('routes workflow-executed package script changes to recurring reviewed control-plane update', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-package-scripts-')))
  try {
    writeFileSync(join(root, 'package.json'), '{"scripts":{"build":"node trusted-build.mjs"}}\n')
    git(root, ['init', '--quiet'])
    git(root, ['config', 'user.name', 'Fixture'])
    git(root, ['config', 'user.email', 'fixture@example.invalid'])
    git(root, ['add', '-A'])
    git(root, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(root, ['rev-parse', 'HEAD']).trim()
    writeFileSync(join(root, 'package.json'), '{"scripts":{"build":"node candidate-takeover.mjs"}}\n')
    assert.throws(
      () => assertProtectedPackageScripts(root, fixtureBase),
      new RegExp(`GOV-UPGRADE-BOOTSTRAP-002.*${REVIEWED_CONTROL_PLANE_UPDATE_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('protected-base reconstruction uses the independent lock-digested npm runtime', () => {
  const source = readFileSync(join(import.meta.dirname, 'verify-upgrade-evidence.mjs'), 'utf8')
  assert.match(source, /runtimeFactory = prepareVerifiedExactNpmRuntime/)
  assert.match(source, /resolveExactNpmRuntimeContract\(repo\)/)
  assert.match(source, /assertVerifiedExactNpmRuntimeCapability\(npmRuntime, expectedNpmArtifact\)/)
  assert.match(source, /cli, 'ci', '--legacy-peer-deps', '--ignore-scripts'/)
  assert.doesNotMatch(source, /protectedNpmToolchain|node_modules\/npm\/bin\/npm-cli\.js/)
  const baseInstall = source.indexOf("cli, 'ci', '--legacy-peer-deps'")
  const previousValidation = source.indexOf('const previousCorpus = validateInstalledForkCorpus(sandbox)')
  const targetInstall = source.indexOf("cli, 'install',", previousValidation)
  const overlayApply = source.indexOf('npmRuntime.applyInstalledSecurityOverlay(sandbox)', targetInstall)
  const signatureAudit = source.indexOf("cli, 'audit', 'signatures'", overlayApply)
  const vulnerabilityAudit = source.indexOf('runVerifiedHighVulnerabilityAudit(process.execPath', signatureAudit)
  assert.ok(
    baseInstall > 0
      && baseInstall < previousValidation
      && previousValidation < targetInstall
      && targetInstall < overlayApply
      && overlayApply < signatureAudit
      && signatureAudit < vulnerabilityAudit,
  )
  assert.match(source.slice(vulnerabilityAudit), /cli, 'audit', '--audit-level=high', '--json'/)
})

const git = (cwd, args, input = undefined) => {
  const result = spawnSync('git', args, { cwd, input, encoding: input === undefined ? 'utf8' : null })
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout))
  return result.stdout
}

const fixtureLiveMainVerifier = (repository, expectedBaseSha, remote) => {
  const output = git(repository, ['ls-remote', '--exit-code', remote, 'refs/heads/main']).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  assert.equal(lines.length, 1)
  const [sha, ref, ...extra] = lines[0].split(/\s+/)
  assert.equal(extra.length, 0)
  assert.equal(ref, 'refs/heads/main')
  if (sha !== expectedBaseSha) {
    throw new Error(`GOV-UPGRADE-SOURCE-006: protected main moved after reconstruction:${expectedBaseSha}:${sha}`)
  }
  return sha
}

function rollbackFixture(label) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `upgrade-evidence-rollback-${label}-`)))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  mkdirSync(join(repo, 'governance'), { recursive: true })
  mkdirSync(join(repo, '.legacy-provider'), { recursive: true })
  mkdirSync(evidence)
  writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
  writeFileSync(join(repo, '.legacy-provider/OLD.md'), 'retired provider\n')
  git(repo, ['init', '--quiet'])
  git(repo, ['config', 'user.name', 'Fixture'])
  git(repo, ['config', 'user.email', 'fixture@example.invalid'])
  git(repo, ['add', '-A'])
  git(repo, ['commit', '--quiet', '-m', 'base'])
  const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
  const remote = join(root, 'remote.git')
  mkdirSync(remote)
  git(remote, ['init', '--quiet', '--bare'])
  git(repo, ['remote', 'add', 'origin', remote])
  git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])

  writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
  writeFileSync(join(repo, 'governance/setup.md'), 'new governance surface\n')
  rmSync(join(repo, '.legacy-provider/OLD.md'))
  git(repo, ['add', '-A'])
  const fixtureOperations = stagedUpgradeOperations(repo)
  const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames']))
  const actualTree = git(repo, ['write-tree']).trim()
  const poisonedTree = `${actualTree[0] === 'f' ? 'e' : 'f'}${actualTree.slice(1)}`
  const fixtureReceipt = {
    ...receipt,
    baseSha: fixtureBase,
    patchSha256: sha256(fixturePatch),
    treeSha256: poisonedTree,
    paths: fixtureOperations.map(item => item.path),
    operations: fixtureOperations,
  }
  writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
  writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
  git(repo, ['reset', '--hard', '--quiet', fixtureBase])
  return {
    authority,
    evidence,
    fixtureBase,
    fixtureOperations,
    fixturePatch,
    fixtureReceipt,
    repo,
    root,
  }
}

function assertRollbackRestored(fixture) {
  assert.equal(git(fixture.repo, ['rev-parse', 'HEAD']).trim(), fixture.fixtureBase)
  assert.equal(git(fixture.repo, ['status', '--porcelain=v1', '--untracked-files=all']).trim(), '')
  assert.equal(git(fixture.repo, ['diff', '--cached', '--name-only']).trim(), '')
  assert.equal(readFileSync(join(fixture.repo, 'governance/lock.json'), 'utf8'), '{"release":"old"}\n')
  assert.equal(readFileSync(join(fixture.repo, '.legacy-provider/OLD.md'), 'utf8'), 'retired provider\n')
  assert.equal(existsSync(join(fixture.repo, 'governance/setup.md')), false)
}

test('preverified writer rolls back A/M/D operations when post-apply tree verification fails', () => {
  const fixture = rollbackFixture('preverified')
  try {
    const verificationSha256 = upgradeVerificationSha256(fixture.fixtureReceipt, fixture.fixturePatch)
    assert.throws(() => applyPreverifiedUpgradeEvidence({
      repository: fixture.repo,
      evidenceDirectory: fixture.evidence,
      expectedBaseSha: fixture.fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixture.fixtureReceipt.patchSha256,
      expectedTreeSha: fixture.fixtureReceipt.treeSha256,
      expectedAuthoritySha256: fixture.fixtureReceipt.authoritySha256,
      expectedVerificationSha256: verificationSha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    }), /GOV-UPGRADE-TREE-002/)
    assertRollbackRestored(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('reconstruct-and-apply rolls back A/M/D operations when post-apply tree verification fails', async () => {
  const fixture = rollbackFixture('reconstruct')
  try {
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: fixture.repo,
      evidenceDirectory: fixture.evidence,
      expectedBaseSha: fixture.fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixture.fixtureReceipt.patchSha256,
      expectedTreeSha: fixture.fixtureReceipt.treeSha256,
      expectedAuthoritySha256: fixture.fixtureReceipt.authoritySha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
      reconstruct: async () => ({
        authority: fixture.authority,
        authoritySha256: fixture.fixtureReceipt.authoritySha256,
        operations: fixture.fixtureOperations,
        paths: fixture.fixtureReceipt.paths,
        patchBytes: fixture.fixturePatch,
        treeSha256: fixture.fixtureReceipt.treeSha256,
      }),
    }), /GOV-UPGRADE-TREE-002/)
    assertRollbackRestored(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('live protected-main readback rejects local and credential-bearing remotes before network access', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-live-main-remote-')))
  try {
    git(root, ['init', '--quiet'])
    git(root, ['remote', 'add', 'origin', join(root, 'local.git')])
    assert.throws(
      () => assertLiveProtectedMain(root, '0'.repeat(40), 'origin'),
      /GOV-UPGRADE-SOURCE-006: live-main remote URL is invalid/,
    )
    git(root, ['remote', 'set-url', 'origin', 'https://user:secret@github.com/ajenchen/design-system.git'])
    assert.throws(
      () => assertLiveProtectedMain(root, '0'.repeat(40), 'origin'),
      /GOV-UPGRADE-SOURCE-006: live-main remote must be one credential-free canonical GitHub HTTPS URL/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('sync-all exact-target plan is syntax-only and cannot claim immutable-release readiness', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sync-all-plan-readiness-')))
  const script = join(import.meta.dirname, 'sync-all.mjs')
  try {
    const dependencies = {
      '@qijenchen/design-system': '1.0.0',
      '@qijenchen/storybook-config': '1.0.0',
    }
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({
      name: 'plan-readiness-fixture',
      private: true,
      dependencies,
    }, null, 2)}\n`)
    writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify({
      name: 'plan-readiness-fixture',
      lockfileVersion: 3,
      packages: {
        '': { name: 'plan-readiness-fixture', dependencies },
        'node_modules/@qijenchen/design-system': { version: '1.0.0' },
        'node_modules/@qijenchen/storybook-config': { version: '1.0.0' },
      },
    }, null, 2)}\n`)

    for (const target of ['2.0.0', '9999.0.0']) {
      const result = spawnSync(process.execPath, ['--', script, '--to', target, '--json'], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.mode, 'plan')
      assert.equal(report.ok, false)
      assert.equal(report.mutationAuthorized, false)
      assert.equal(report.syntaxValid, true)
      assert.equal(report.targetVerification, 'deferred')
      assert.equal(report.targetVerified, false)
      assert.equal(report.ready, false)
      assert.ok(report.diagnostics.some(item => (
        item.ruleId === 'GOV-UPGRADE-VERIFICATION-001'
        && /immutable release/.test(item.message)
        && /live mutation 前 fail closed/.test(item.message)
      )))
    }

    const text = spawnSync(process.execPath, ['--', script, '--to', '2.0.0'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.notEqual(text.status, 0, text.stderr)
    assert.match(text.stdout, /targetVerification=deferred/)
    assert.match(text.stdout, /targetVerified=false/)
    assert.match(text.stdout, /ready=false/)
    assert.doesNotMatch(text.stdout, /Apply on a clean upgrade branch/)

    const invalid = spawnSync(process.execPath, ['--', script, '--to', 'latest', '--json'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.notEqual(invalid.status, 0, invalid.stderr)
    const invalidReport = JSON.parse(invalid.stdout)
    assert.equal(invalidReport.ok, false)
    assert.equal(invalidReport.syntaxValid, false)
    assert.equal(invalidReport.targetVerified, false)
    assert.equal(invalidReport.ready, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('read-only reconstruction digest gates the fresh preverified writer', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-writer-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(join(repo, 'governance'), { recursive: true })
    mkdirSync(evidence)
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    const remote = join(root, 'remote.git')
    mkdirSync(remote)
    git(remote, ['init', '--quiet', '--bare'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
    git(repo, ['add', '-A'])
    const fixtureOperations = stagedUpgradeOperations(repo)
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])

    const reconstruct = async () => ({
      authority,
      authoritySha256: fixtureReceipt.authoritySha256,
      operations: fixtureOperations,
      paths: fixtureReceipt.paths,
      patchBytes: fixturePatch,
      treeSha256: fixtureTree,
    })
    const result = await verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      reconstruct,
      verificationOnly: true,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    })
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
    assert.throws(() => applyPreverifiedUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      expectedVerificationSha256: 'e'.repeat(64),
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    }), /GOV-UPGRADE-EVIDENCE-008/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
    applyPreverifiedUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      expectedVerificationSha256: result.verificationSha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    })
    assert.equal(result.treeSha256, fixtureTree)
    assert.equal(readFileSync(join(repo, 'governance/lock.json'), 'utf8'), '{"release":"new"}\n')
    assert.deepEqual(stagedUpgradeOperations(repo), fixtureOperations)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('live main movement during long reconstruction fails before writer mutation', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-main-move-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(join(repo, 'governance'), { recursive: true })
    mkdirSync(evidence)
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    const remote = join(root, 'remote.git')
    mkdirSync(remote)
    git(remote, ['init', '--quiet', '--bare'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])

    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
    git(repo, ['add', '-A'])
    const fixtureOperations = stagedUpgradeOperations(repo)
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])

    const updater = join(root, 'updater')
    git(root, ['clone', '--quiet', '--branch', 'main', remote, updater])
    git(updater, ['config', 'user.name', 'Updater'])
    git(updater, ['config', 'user.email', 'updater@example.invalid'])
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      verificationOnly: true,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
      reconstruct: async () => {
        writeFileSync(join(updater, 'main-moved.txt'), 'new main\n')
        git(updater, ['add', '-A'])
        git(updater, ['commit', '--quiet', '-m', 'move main'])
        git(updater, ['push', '--quiet', 'origin', 'HEAD:main'])
        return {
          authority,
          authoritySha256: fixtureReceipt.authoritySha256,
          operations: fixtureOperations,
          paths: fixtureReceipt.paths,
          patchBytes: fixturePatch,
          treeSha256: fixtureTree,
        }
      },
    }), /GOV-UPGRADE-SOURCE-006: protected main moved after reconstruction/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reconstruction mismatch blocks before the writer checkout is mutated', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-mismatch-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(repo)
    mkdirSync(evidence)
    writeFileSync(join(repo, 'package.json'), '{}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    writeFileSync(join(repo, 'governance.json'), '{}\n')
    git(repo, ['add', '-A'])
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureOperations = stagedUpgradeOperations(repo)
    const takeoverAuthority = {
      ...authority,
      previousMaterialization: { exactPaths: [], pathPrefixes: [] },
      incomingMaterialization: { exactPaths: ['governance.json'], pathPrefixes: [] },
    }
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
      authoritySha256: upgradeAuthoritySha256(takeoverAuthority),
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), JSON.stringify(fixtureReceipt))
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      reconstruct: async () => ({
        authority: takeoverAuthority,
        authoritySha256: fixtureReceipt.authoritySha256,
        operations: fixtureOperations,
        paths: fixtureReceipt.paths,
        patchBytes: Buffer.from('different reconstruction'),
        treeSha256: fixtureTree,
      }),
    }), /certifier patch differs/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
