import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readClaudePermissionPolicy } from '../../../scripts/lib/claude-permission-policy.mjs'
import { providerHookOutputContract } from '../../../scripts/lib/provider-hook-output-transport.mjs'
import { compareUtf8Bytes, readJson, sha256, stableStringify } from '../lib/common.mjs'
import {
  assertCodexManagedEngineeringDelegationPolicy,
  buildCodexManagedDispatcher,
  buildExpectedClaudePluginRuntime,
  buildExpectedCodexBundle,
  buildExpectedManagedHostControls,
  buildManagedFilesystemRequirements,
  collectManagedFilesystemTrustEvidence,
  loadCandidateReleaseSourceFiles,
  managedHostVersionAtLeast,
  materializeManagedHostPolicy,
  resolveManagedHostRelease,
  validateManagedHostAssuranceModel,
  verifyManagedHostAssurance,
} from '../lib/managed-host-assurance.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const NOW = new Date('2026-07-21T00:00:00.000Z')
// 合成 candidate 的版本必須追隨 repo 當前版本(plugin/marketplace 綁定檢查對照的是
// repo 真實 manifest)— hardcode 會在每次 bump 時假紅(2026-07-29 beta.96 錨例)。
const VERSION = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/design-system/package.json'), 'utf8')).version
const COMMIT = 'a'.repeat(40)
const TREE = 'b'.repeat(40)
const BOM = 'c'.repeat(64)
const DEVICE = 'd'.repeat(64)
const HOST_IDENTITY = { hostId: 'host-001', endpointId: 'fleet-prod', platform: 'darwin', deviceIdentitySha256: DEVICE }
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const PUBLIC_SPKI = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

function rootAdminFilesystemProbe({ defaultProbe }) {
  const observed = defaultProbe()
  return {
    ...observed,
    unix: observed.unix ? { ...observed.unix, uid: 0, gid: 0, mode: observed.unix.mode & ~0o022 } : null,
  }
}

function rootOwnerOnlyFilesystemProbe({ defaultProbe }) {
  const observed = defaultProbe()
  return { ...observed, unix: observed.unix ? { ...observed.unix, uid: 0, gid: 0 } : null }
}

function sri(byte) {
  return `sha512-${Buffer.alloc(64, byte).toString('base64')}`
}

function models({ candidate = false, trustedKey = true } = {}) {
  const desired = readJson(resolve(GOVERNANCE_ROOT, 'providers/managed-host-assurance.json'))
  const compatibility = readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'))
  const rings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))
  const contract = readJson(resolve(GOVERNANCE_ROOT, 'managed-host/codex-hook-bundle-contract.json'))
  if (trustedKey) desired.readbackTrust.trustedEndpointKeys = [{ keyId: 'endpoint-prod-1', publicKeySPKI: PUBLIC_SPKI, endpointIds: ['fleet-prod'] }]
  if (candidate) {
    rings.candidateRelease = {
      id: `ajenchen/design-system@v${VERSION}`,
      version: VERSION,
      sourceCommit: COMMIT,
      sourceTree: TREE,
      bomSha256: BOM,
      packages: [
        { name: '@qijenchen/design-system', version: VERSION, integrity: sri(1) },
        { name: '@qijenchen/governance', version: VERSION, integrity: sri(2) },
        { name: '@qijenchen/storybook-config', version: VERSION, integrity: sri(3) },
      ],
      observedAt: '2026-07-20T22:00:00.000Z',
    }
  }
  return { desired, compatibility, rings, contract }
}

function physical(hostRoot, logical) {
  return resolve(hostRoot, ...logical.split('/').filter(Boolean))
}

function writeExecutable(hostRoot, logical, body) {
  const path = physical(hostRoot, logical)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return { executablePath: logical, executableSha256: sha256(body) }
}

function createRuntime(hostRoot) {
  return {
    node: writeExecutable(hostRoot, '/opt/qijenchen/runtime/node', '#!/bin/sh\nexit 0\n'),
    shell: writeExecutable(hostRoot, '/opt/qijenchen/runtime/sh', '#!/bin/sh\nexit 0\n'),
    python: writeExecutable(hostRoot, '/opt/qijenchen/runtime/python3', '#!/bin/sh\nexit 0\n'),
  }
}

function createDarwinEtcAliasHost() {
  const hostRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-host-darwin-etc-')))
  const canonicalEtc = resolve(hostRoot, 'private/etc')
  const policy = resolve(canonicalEtc, 'codex/requirements.toml')
  mkdirSync(dirname(policy), { recursive: true })
  writeFileSync(policy, 'allow_managed_hooks_only = true\n')
  symlinkSync('private/etc', resolve(hostRoot, 'etc'))
  return { hostRoot, canonicalEtc, policy }
}

function collectDarwinPathTrust(hostRoot, logicalPath = '/etc/codex/requirements.toml', testOnlyFilesystemProbe = rootAdminFilesystemProbe) {
  return collectManagedFilesystemTrustEvidence({
    requirements: [{ logicalPath, objectType: 'file' }],
    platform: 'darwin',
    hostRoot,
    hostIdentity: HOST_IDENTITY,
    collectorInstanceId: 'collector-001',
    attestorKeyId: 'endpoint-prod-1',
    observedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    testOnlyFilesystemProbe,
  })
}

function inventory(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const absolute = resolve(directory, entry.name)
      const path = relative(root, absolute).split(sep).join('/')
      assert.equal(entry.isSymbolicLink(), false, `fixture may not contain symlink:${path}`)
      if (entry.isDirectory()) visit(absolute)
      else {
        assert.equal(entry.isFile(), true)
        files.push({ path, sha256: sha256(readFileSync(absolute)) })
      }
    }
  }
  visit(root)
  return files.sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

function inventoryDigest(root) {
  return sha256(stableStringify(inventory(root), 0))
}

function copyRepoPath(source, destination) {
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
}

function candidateSourceSnapshot() {
  const output = new Map()
  const add = (absolute, repoPath) => {
    const info = lstatSync(absolute)
    assert.equal(info.isSymbolicLink(), false, `candidate fixture source may not be a symlink:${repoPath}`)
    if (info.isDirectory()) {
      for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
        add(resolve(absolute, entry.name), `${repoPath}/${entry.name}`)
      }
    } else {
      assert.equal(info.isFile(), true)
      output.set(repoPath, readFileSync(absolute))
    }
  }
  for (const path of [
    'AGENTS.md',
    'packages/design-system/ds-canonical',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    'hooks/hooks.json',
    'generated/governance',
    'scripts',
    'packages/governance/canonical',
    'packages/governance/src',
  ]) add(resolve(REPO_ROOT, path), path)
  return output
}

function installCodexBundle({ current, release, hostRoot }) {
  const expected = buildExpectedCodexBundle({ contract: current.contract, repoRoot: REPO_ROOT, release, candidateSourceFiles: current.candidateSourceFiles })
  const logicalRoot = `/opt/qijenchen/governance/${COMMIT}`
  const root = physical(hostRoot, logicalRoot)
  mkdirSync(root, { recursive: true })
  copyRepoPath(
    resolve(REPO_ROOT, 'packages/design-system/ds-canonical'),
    resolve(root, 'payload/packages/design-system/ds-canonical'),
  )
  writeFileSync(resolve(root, 'managed-hook-dispatcher.mjs'), expected.dispatcher)
  const manifest = {
    schemaVersion: 2,
    sourceCommit: COMMIT,
    sourceTree: TREE,
    package: { name: '@qijenchen/design-system', version: release.packageVersion, integrity: release.packageIntegrity },
    contractSha256: sha256(stableStringify(current.contract, 0)),
    canonicalInputsSha256: expected.canonicalInputsSha256,
    dispatcherSha256: expected.dispatcherSha256,
    files: expected.files,
    bundleSha256: expected.bundleSha256,
  }
  writeFileSync(resolve(root, 'managed-hook-bundle.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { root, logicalRoot, expected, hookDelivery: {
    mode: 'deterministic-absolute-managed-bundle',
    logicalRoot,
    sourceCommit: COMMIT,
    sourceTree: TREE,
    packageVersion: release.packageVersion,
    packageIntegrity: release.packageIntegrity,
    contractSha256: manifest.contractSha256,
    canonicalInputsSha256: expected.canonicalInputsSha256,
    dispatcherSha256: expected.dispatcherSha256,
    bundleSha256: expected.bundleSha256,
  } }
}

function installClaudePlugin({ current, release, hostRoot }) {
  const logicalRoot = `/opt/qijenchen/claude-plugins/${COMMIT}`
  const root = physical(hostRoot, logicalRoot)
  copyRepoPath(resolve(REPO_ROOT, 'AGENTS.md'), resolve(root, 'AGENTS.md'))
  copyRepoPath(resolve(REPO_ROOT, '.claude-plugin/marketplace.json'), resolve(root, '.claude-plugin/marketplace.json'))
  copyRepoPath(resolve(REPO_ROOT, '.claude-plugin/plugin.json'), resolve(root, '.claude-plugin/plugin.json'))
  copyRepoPath(resolve(REPO_ROOT, 'hooks/hooks.json'), resolve(root, 'hooks/hooks.json'))
  // hooks/scripts aliases the canonical corpus since the .claude/hooks mirror retired (2026-08-04).
  copyRepoPath(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/hooks'), resolve(root, 'hooks/scripts'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/hooks'), resolve(root, 'packages/design-system/ds-canonical/hooks'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/references'), resolve(root, 'packages/design-system/ds-canonical/references'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/rules'), resolve(root, 'packages/design-system/ds-canonical/rules'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/skills'), resolve(root, 'packages/design-system/ds-canonical/skills'))
  copyRepoPath(
    resolve(REPO_ROOT, 'packages/design-system/src/tokens/utility-registry.json'),
    resolve(root, 'packages/design-system/src/tokens/utility-registry.json'),
  )
  copyRepoPath(resolve(REPO_ROOT, 'scripts'), resolve(root, 'scripts'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/governance/canonical'), resolve(root, 'packages/governance/canonical'))
  copyRepoPath(resolve(REPO_ROOT, 'packages/governance/src'), resolve(root, 'packages/governance/src'))
  copyRepoPath(resolve(REPO_ROOT, 'generated/governance'), resolve(root, 'generated/governance'))
  const files = inventory(root)
  const canonicalDigest = inventoryDigest(resolve(REPO_ROOT, 'packages/design-system/ds-canonical/hooks'))
  const scriptDigest = canonicalDigest
  const runtimeDependencies = buildExpectedClaudePluginRuntime(current.candidateSourceFiles)
  const canonicalHookCorpusSha256 = sha256(stableStringify({ canonicalDigest, hookViewSha256: sha256(readFileSync(resolve(REPO_ROOT, 'hooks/hooks.json'))), scriptDigest, runtimeDependencySha256: runtimeDependencies.runtimeDependencySha256 }, 0))
  return { root, logicalRoot, hookDelivery: {
    mode: 'force-enabled-release-tagged-plugin-with-installed-inventory',
    pluginFullId: 'design-system@qijenchen-ds',
    marketplaceName: 'qijenchen-ds',
    marketplaceRef: release.tag,
    marketplaceResolvedCommit: release.sourceCommit,
    pluginVersion: release.packageVersion,
    installedRoot: logicalRoot,
    marketplaceManifestSha256: sha256(readFileSync(resolve(REPO_ROOT, '.claude-plugin/marketplace.json'))),
    pluginManifestSha256: sha256(readFileSync(resolve(REPO_ROOT, '.claude-plugin/plugin.json'))),
    canonicalHookCorpusSha256,
    files,
    inventorySha256: sha256(stableStringify(files, 0)),
  } }
}

function canonicalInputs({ current, provider, release, runtime }) {
  const policy = materializeManagedHostPolicy({ provider, release, compatibility: current.compatibility, repoRoot: REPO_ROOT, platform: 'darwin', runtime })
  const controls = buildExpectedManagedHostControls({
    provider,
    release,
    compatibility: current.compatibility,
    contract: current.contract,
    platform: 'darwin',
    runtime,
    repoRoot: REPO_ROOT,
  })
  const values = {
    desiredSha256: sha256(stableStringify(current.desired, 0)),
    compatibilitySha256: sha256(stableStringify(current.compatibility, 0)),
    releaseRingsSha256: sha256(stableStringify(current.rings, 0)),
    artifactContractSha256: sha256(stableStringify(current.contract, 0)),
    materializedPolicySha256: policy.sha256,
    expectedControlsSha256: sha256(stableStringify(controls, 0)),
  }
  return { inputs: { ...values, canonicalInputsSha256: sha256(stableStringify(values, 0)) }, controls }
}

let nonceCounter = 0
function nextNonce() {
  nonceCounter += 1
  return Buffer.alloc(18, nonceCounter).toString('base64url')
}

function signEnvelope(payload) {
  const bytes = Buffer.from(stableStringify(payload, 0))
  return {
    $schema: 'infra/governance/schemas/managed-host-effective-readback.schema.json',
    schemaVersion: 2,
    kind: 'managed-host-effective-readback-envelope',
    payload,
    attestation: {
      algorithm: 'ed25519',
      keyId: 'endpoint-prod-1',
      payloadSha256: sha256(bytes),
      signature: sign(null, bytes, privateKey).toString('base64url'),
    },
  }
}

function resign(envelope) {
  return signEnvelope(envelope.payload)
}

function readback({ current, release, provider, runtime, hookDelivery, hostRoot, codexExpectedFiles = [], source = 'endpoint-management-composed-effective', unknown = false }) {
  const canonical = canonicalInputs({ current, provider, release, runtime })
  const issuedAt = new Date(NOW.getTime() - 60_000).toISOString()
  const collector = { kind: source === 'configRequirements/read' ? 'provider-effective-api' : 'endpoint-management', instanceId: 'collector-001' }
  const requirements = buildManagedFilesystemRequirements({ provider, platform: 'darwin', runtime, hookDelivery, codexExpectedFiles })
  const filesystemTrust = source === 'endpoint-management-composed-effective'
    ? collectManagedFilesystemTrustEvidence({
        requirements,
        platform: 'darwin',
        hostRoot,
        hostIdentity: HOST_IDENTITY,
        collectorInstanceId: collector.instanceId,
        attestorKeyId: 'endpoint-prod-1',
        observedAt: issuedAt,
        testOnlyFilesystemProbe: current.testOnlyFilesystemProbe,
      })
    : null
  const payload = {
    schemaVersion: 2,
    kind: 'managed-host-effective-readback-payload',
    provider: provider.id,
    hostIdentity: HOST_IDENTITY,
    source,
    sourceIdentity: `${provider.id}:${source}:fixture`,
    observedVersion: current.compatibility.providers[provider.id].minimumVersion,
    canonicalInputs: canonical.inputs,
    controlReadbacks: provider.enforcementControls.map(controlId => unknown
      ? { controlId, status: 'unknown', source, value: null, reason: `${source} does not expose this effective control` }
      : { controlId, status: 'observed', source, value: canonical.controls[controlId], reason: null }),
    runtime,
    hookDelivery,
    filesystemTrust,
    issuedAt,
    expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    nonce: nextNonce(),
    collector,
  }
  return signEnvelope(payload)
}

function createAlignedFixture() {
  const current = models({ candidate: true })
  current.testOnlyFilesystemProbe = rootAdminFilesystemProbe
  current.candidateSourceFiles = candidateSourceSnapshot()
  const release = resolveManagedHostRelease(current.desired, current.rings)
  assert.equal(release.status, 'ready')
  const hostRoot = mkdtempSync(resolve(tmpdir(), 'managed-host-assurance-'))
  const runtime = createRuntime(hostRoot)
  const codexBundle = installCodexBundle({ current, release, hostRoot })
  const claudePlugin = installClaudePlugin({ current, release, hostRoot })
  const claudeProvider = current.desired.providers.find(item => item.id === 'claude-code')
  const codexProvider = current.desired.providers.find(item => item.id === 'codex')
  const readbacks = {
    'claude-code': readback({ current, release, provider: claudeProvider, runtime: null, hookDelivery: claudePlugin.hookDelivery, hostRoot }),
    codex: readback({ current, release, provider: codexProvider, runtime, hookDelivery: codexBundle.hookDelivery, hostRoot, codexExpectedFiles: codexBundle.expected.files }),
  }
  return { current, release, hostRoot, runtime, codexBundle, claudePlugin, readbacks }
}

function replayCache() {
  const seen = new Set()
  return {
    durability: 'persistent-atomic',
    consume({ key }) {
      if (seen.has(key)) return false
      seen.add(key)
      return true
    },
  }
}

test('managed-host semantic-version comparison follows deterministic SemVer prerelease precedence', () => {
  for (const [actual, minimum, expected] of [
    ['1.0.0-alpha', '1.0.0-alpha', true],
    ['1.0.0-alpha.1', '1.0.0-alpha', true],
    ['1.0.0-alpha', '1.0.0-alpha.1', false],
    ['1.0.0-alpha.beta', '1.0.0-alpha.1', true],
    ['1.0.0-beta.2', '1.0.0-beta.11', false],
    ['1.0.0-beta.11', '1.0.0-beta.2', true],
    ['1.0.0-1', '1.0.0-alpha', false],
    ['1.0.0-999999999999999999999999', '1.0.0-999999999999999999999998', true],
    ['1.0.0-rc.1', '1.0.0-beta.11', true],
    ['1.0.0', '1.0.0-rc.1', true],
    ['1.0.0-rc.1', '1.0.0', false],
  ]) {
    assert.equal(managedHostVersionAtLeast(actual, minimum), expected, `${actual} >= ${minimum}`)
  }
  for (const invalid of ['01.0.0', '1.00.0', '1.0.0-01', '1.0.0-alpha..1', '1.0.0-']) {
    assert.throws(() => managedHostVersionAtLeast(invalid, '1.0.0'), /not a supported semantic version/, invalid)
  }
})

test('desired state, bundle contract, signed readbacks, and evidence use closed schemas', () => {
  const fixture = createAlignedFixture()
  try {
    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: fixture.current })
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    let desiredValidator
    let bundleValidator
    for (const [schemaPath, label, values] of [
      ['schemas/managed-host-assurance.schema.json', 'desired', [fixture.current.desired]],
      ['schemas/codex-managed-hook-bundle.schema.json', 'bundle contract', [fixture.current.contract]],
      ['schemas/managed-host-effective-readback.schema.json', 'effective readback', Object.values(fixture.readbacks)],
      ['schemas/managed-host-assurance-evidence.schema.json', 'evidence', [evidence]],
    ]) {
      const validate = ajv.compile(readJson(resolve(GOVERNANCE_ROOT, schemaPath)))
      if (label === 'desired') desiredValidator = validate
      if (label === 'bundle contract') bundleValidator = validate
      for (const value of values) assert.equal(validate(value), true, `${label}: ${ajv.errorsText(validate.errors)}`)
    }
    const open = structuredClone(fixture.current.desired)
    open.unreviewed = true
    assert.equal(desiredValidator(open), false)
    const legacyExitContract = structuredClone(fixture.current.contract)
    legacyExitContract.entrypoint.protocol = 'qijenchen-codex-managed-dispatcher-v1'
    legacyExitContract.entrypoint.failClosedExitCode = 2
    delete legacyExitContract.entrypoint.policyBlockingExitCode
    delete legacyExitContract.entrypoint.integrityExitCode
    assert.equal(bundleValidator(legacyExitContract), false)
    const conflatedExitContract = structuredClone(fixture.current.contract)
    conflatedExitContract.entrypoint.integrityExitCode = 2
    assert.equal(bundleValidator(conflatedExitContract), false)
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('signed effective state must prove authority-only endpoint assignment for both providers', () => {
  for (const providerId of ['claude-code', 'codex']) {
    const fixture = createAlignedFixture()
    try {
      const control = fixture.readbacks[providerId].payload.controlReadbacks
        .find(item => item.controlId === 'authority-endpoint-assignment')
      assert.ok(control, `${providerId} omitted authority endpoint assignment`)
      control.value.mixedRoleUseAllowed = true
      fixture.readbacks[providerId] = resign(fixture.readbacks[providerId])
      const evidence = verifyManagedHostAssurance({
        repoRoot: REPO_ROOT,
        platform: 'darwin',
        hostRoot: fixture.hostRoot,
        effectiveReadbacks: fixture.readbacks,
        expectedHostIdentity: HOST_IDENTITY,
        generatedAt: NOW,
        models: fixture.current,
      })
      const result = evidence.providers.find(item => item.id === providerId)
      assert.equal(result.status, 'fail')
      assert.match(result.reasons.join(' '), /effective control mismatch:authority-endpoint-assignment/)
      assert.equal(evidence.certification.status, 'not-certified')
    } finally {
      rmSync(fixture.hostRoot, { recursive: true, force: true })
    }
  }
})

test('Claude signed effective state must prove the complete non-bypassable sandbox', () => {
  for (const [label, mutate, pattern] of [
    [
      'missing sandbox control',
      readback => {
        readback.payload.controlReadbacks = readback.payload.controlReadbacks
          .filter(item => item.controlId !== 'strict-bash-sandbox')
      },
      /control readback inventory is incomplete or duplicated/,
    ],
    [
      'substituted network scope',
      readback => {
        readback.payload.controlReadbacks
          .find(item => item.controlId === 'strict-bash-sandbox')
          .value.network.allowedDomains = ['github.com']
      },
      /effective control mismatch:strict-bash-sandbox/,
    ],
    [
      'unsandboxed escape enabled',
      readback => {
        readback.payload.controlReadbacks
          .find(item => item.controlId === 'strict-bash-sandbox')
          .value.allowUnsandboxedCommands = true
      },
      /effective control mismatch:strict-bash-sandbox/,
    ],
  ]) {
    const fixture = createAlignedFixture()
    try {
      mutate(fixture.readbacks['claude-code'])
      fixture.readbacks['claude-code'] = resign(fixture.readbacks['claude-code'])
      const evidence = verifyManagedHostAssurance({
        repoRoot: REPO_ROOT,
        platform: 'darwin',
        hostRoot: fixture.hostRoot,
        effectiveReadbacks: fixture.readbacks,
        expectedHostIdentity: HOST_IDENTITY,
        generatedAt: NOW,
        models: fixture.current,
      })
      const result = evidence.providers.find(item => item.id === 'claude-code')
      assert.equal(result.status, 'fail', label)
      assert.match(result.reasons.join(' '), pattern, label)
      assert.equal(evidence.certification.status, 'not-certified', label)
    } finally {
      rmSync(fixture.hostRoot, { recursive: true, force: true })
    }
  }
})

test('portable baseline and local files never become managed-host proof', () => {
  const hostRoot = mkdtempSync(resolve(tmpdir(), 'managed-host-empty-'))
  try {
    const local = resolve(hostRoot, 'etc/codex/requirements.toml')
    mkdirSync(dirname(local), { recursive: true })
    writeFileSync(local, 'allow_managed_hooks_only = true\n')
    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'linux', hostRoot, generatedAt: NOW })
    const codex = evidence.providers.find(item => item.id === 'codex')
    assert.equal(evidence.scope.portableRepoBaseline, 'declared-not-managed-host-proof')
    assert.equal(evidence.releaseBinding.status, 'missing')
    assert.equal(evidence.overallStatus, 'external-activation-required')
    assert.equal(evidence.certification.status, 'not-certified')
    assert.equal(codex.localPolicyDiscovered, true)
    assert.equal(codex.effectiveReadback, 'untrusted-local-only')
  } finally {
    rmSync(hostRoot, { recursive: true, force: true })
  }
})

test('candidate inputs are loaded recursively from the immutable Git tree, never the worktree', () => {
  const git = (args, encoding = 'utf8') => {
    const result = spawnSync('git', ['-C', REPO_ROOT, ...args], { encoding })
    assert.equal(result.status, 0, result.stderr?.toString())
    return result.stdout
  }
  const sourceCommit = git(['rev-parse', 'HEAD']).trim()
  const sourceTree = git(['rev-parse', `${sourceCommit}^{tree}`]).trim()
  const paths = ['package.json', 'packages/design-system/ds-canonical/commands']
  const snapshot = loadCandidateReleaseSourceFiles({ repoRoot: REPO_ROOT, release: { status: 'ready', sourceCommit, sourceTree }, paths })
  const expectedPaths = git(['ls-tree', '-r', '--name-only', sourceCommit, '--', ...paths]).trim().split('\n').filter(Boolean).sort(compareUtf8Bytes)
  assert.deepEqual([...snapshot.keys()], expectedPaths)
  assert.deepEqual(snapshot.get('package.json'), git(['show', `${sourceCommit}:package.json`], null))
  assert.throws(
    () => loadCandidateReleaseSourceFiles({ repoRoot: REPO_ROOT, release: { status: 'ready', sourceCommit, sourceTree: 'f'.repeat(40) }, paths }),
    /candidate release Git tree mismatch/,
  )
})

test('signed alignment is distinct from replay-consumed certification', () => {
  const fixture = createAlignedFixture()
  try {
    const aligned = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: fixture.current })
    assert.equal(aligned.overallStatus, 'aligned-unattested')
    assert.equal(aligned.certification.status, 'not-certified')
    assert.ok(aligned.providers.every(item => item.status === 'pass' && item.attestation === 'replay-unchecked' && item.filesystemTrust === 'verified'))

    const replayProtection = replayCache()
    const certified = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, replayProtection, generatedAt: NOW, models: fixture.current })
    assert.equal(certified.overallStatus, 'certified')
    assert.equal(certified.certification.status, 'certified')
    const replayed = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, replayProtection, generatedAt: NOW, models: fixture.current })
    assert.equal(replayed.overallStatus, 'fail')
    assert.match(replayed.providers.flatMap(item => item.reasons).join(' '), /nonce was replayed/)
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('the standard macOS /etc alias resolves to /private/etc without weakening filesystem trust', () => {
  const fixture = createDarwinEtcAliasHost()
  try {
    const trust = collectDarwinPathTrust(fixture.hostRoot)
    const paths = trust.observations.map(item => item.logicalPath)
    assert.ok(paths.includes('/private'), 'the canonical /private ancestor must remain ownership and mode checked')
    const etc = trust.observations.find(item => item.logicalPath === '/etc')
    const canonicalEtc = lstatSync(fixture.canonicalEtc, { bigint: true })
    assert.equal(etc.identity.device, canonicalEtc.dev.toString())
    assert.equal(etc.identity.inode, canonicalEtc.ino.toString())

    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, generatedAt: NOW })
    const codex = evidence.providers.find(item => item.id === 'codex')
    assert.equal(codex.localPolicyDiscovered, true)
    assert.equal(codex.localPolicyPathSafety, 'safe-regular-file')
    assert.equal(codex.effectiveReadback, 'untrusted-local-only')
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('the macOS /etc exception rejects wrong, indirect, dangling, non-canonical, and leaf symlinks', () => {
  for (const [label, setup, logicalPath, pattern] of [
    ['wrong /etc target', hostRoot => {
      const policy = resolve(hostRoot, 'private/not-etc/codex/requirements.toml')
      mkdirSync(dirname(policy), { recursive: true })
      writeFileSync(policy, 'policy\n')
      symlinkSync('private/not-etc', resolve(hostRoot, 'etc'))
    }, '/etc/codex/requirements.toml', /only cross the standard macOS/],
    ['symlink inside canonical target', hostRoot => {
      const actual = resolve(hostRoot, 'actual-private/etc/codex')
      mkdirSync(actual, { recursive: true })
      writeFileSync(resolve(actual, 'requirements.toml'), 'policy\n')
      symlinkSync('actual-private', resolve(hostRoot, 'private'))
      symlinkSync('private/etc', resolve(hostRoot, 'etc'))
    }, '/etc/codex/requirements.toml', /canonical target crosses a symbolic link/],
    ['arbitrary ancestor symlink', hostRoot => {
      const policy = resolve(hostRoot, 'actual-var/codex/requirements.toml')
      mkdirSync(dirname(policy), { recursive: true })
      writeFileSync(policy, 'policy\n')
      symlinkSync('actual-var', resolve(hostRoot, 'var'))
    }, '/var/codex/requirements.toml', /crosses a symbolic link/],
    ['dangling arbitrary ancestor symlink', hostRoot => {
      symlinkSync('missing-var', resolve(hostRoot, 'var'))
    }, '/var/codex/requirements.toml', /crosses a symbolic link/],
    ['symlink leaf', hostRoot => {
      const canonical = resolve(hostRoot, 'private/etc/codex')
      const outside = resolve(hostRoot, 'outside-policy')
      mkdirSync(canonical, { recursive: true })
      writeFileSync(outside, 'policy\n')
      symlinkSync(outside, resolve(canonical, 'requirements.toml'))
      symlinkSync('private/etc', resolve(hostRoot, 'etc'))
    }, '/etc/codex/requirements.toml', /crosses a symbolic link/],
    ['non-canonical logical spelling', hostRoot => {
      const policy = resolve(hostRoot, 'private/etc/codex/requirements.toml')
      mkdirSync(dirname(policy), { recursive: true })
      writeFileSync(policy, 'policy\n')
      symlinkSync('private/etc', resolve(hostRoot, 'etc'))
    }, '/etc/codex/../codex/requirements.toml', /canonical absolute spelling/],
  ]) {
    const hostRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-host-darwin-negative-')))
    try {
      setup(hostRoot)
      assert.throws(() => collectDarwinPathTrust(hostRoot, logicalPath), pattern, label)
      if (label === 'wrong /etc target') {
        const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot, generatedAt: NOW })
        const codex = evidence.providers.find(item => item.id === 'codex')
        assert.equal(codex.localPolicyDiscovered, false)
        assert.equal(codex.localPolicyPathSafety, 'unsafe')
      }
    } finally {
      rmSync(hostRoot, { recursive: true, force: true })
    }
  }
})

test('the macOS /etc canonical chain remains root-owned, non-writable, and revalidated after drift', () => {
  const writable = createDarwinEtcAliasHost()
  try {
    chmodSync(resolve(writable.hostRoot, 'private'), 0o777)
    assert.throws(
      () => collectDarwinPathTrust(writable.hostRoot, '/etc/codex/requirements.toml', rootOwnerOnlyFilesystemProbe),
      /managed filesystem \/private is writable by an untrusted Unix group\/other principal/,
    )
  } finally {
    rmSync(writable.hostRoot, { recursive: true, force: true })
  }

  const unowned = createDarwinEtcAliasHost()
  try {
    assert.throws(() => collectDarwinPathTrust(unowned.hostRoot, '/etc/codex/requirements.toml', null), /not root\/admin owned/)
  } finally {
    rmSync(unowned.hostRoot, { recursive: true, force: true })
  }

  const drifted = createDarwinEtcAliasHost()
  try {
    collectDarwinPathTrust(drifted.hostRoot)
    rmSync(resolve(drifted.hostRoot, 'etc'))
    const replacement = resolve(drifted.hostRoot, 'private/replacement/etc/codex')
    mkdirSync(replacement, { recursive: true })
    writeFileSync(resolve(replacement, 'requirements.toml'), 'policy\n')
    symlinkSync('private/replacement/etc', resolve(drifted.hostRoot, 'etc'))
    assert.throws(() => collectDarwinPathTrust(drifted.hostRoot), /only cross the standard macOS/)
  } finally {
    rmSync(drifted.hostRoot, { recursive: true, force: true })
  }
})

test('filesystem trust requires root/admin ownership and rejects writable managed objects or ancestors', () => {
  for (const [label, mutate, probe, pattern] of [
    ['user-owned installation', () => {}, null, /not root\/admin owned/],
    ['writable managed bundle', fixture => { chmodSync(fixture.codexBundle.root, 0o777) }, rootOwnerOnlyFilesystemProbe, /writable by an untrusted Unix group\/other principal/],
    ['writable managed ancestor', fixture => { chmodSync(resolve(fixture.hostRoot, 'opt/qijenchen/governance'), 0o777) }, rootOwnerOnlyFilesystemProbe, /writable by an untrusted Unix group\/other principal/],
  ]) {
    const fixture = createAlignedFixture()
    try {
      mutate(fixture)
      const verificationModels = { ...fixture.current, testOnlyFilesystemProbe: probe }
      const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: verificationModels })
      assert.equal(evidence.overallStatus, 'fail', label)
      assert.match(evidence.providers.flatMap(item => item.reasons).join(' '), pattern, label)
      assert.equal(evidence.certification.status, 'not-certified', label)
      assert.ok(evidence.providers.some(item => item.filesystemTrust === 'mismatch'), label)
    } finally {
      rmSync(fixture.hostRoot, { recursive: true, force: true })
    }
  }
})

test('filesystem device/inode metadata must remain stable across the complete verification read', () => {
  const fixture = createAlignedFixture()
  try {
    const changingProbe = (context) => {
      const observed = rootAdminFilesystemProbe(context)
      if (context.phase !== 'after' || context.logicalPath !== fixture.runtime.node.executablePath) return observed
      return { ...observed, identity: { ...observed.identity, inode: (BigInt(observed.identity.inode) + 1n).toString() } }
    }
    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: { ...fixture.current, testOnlyFilesystemProbe: changingProbe } })
    assert.equal(evidence.overallStatus, 'fail')
    assert.match(evidence.providers.flatMap(item => item.reasons).join(' '), /managed filesystem object changed during verification/)
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('missing endpoint filesystem evidence remains unknown and Windows cannot self-certify without raw ACL evidence', () => {
  const fixture = createAlignedFixture()
  try {
    fixture.readbacks.codex.payload.filesystemTrust = null
    fixture.readbacks.codex = resign(fixture.readbacks.codex)
    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: fixture.current })
    const codex = evidence.providers.find(item => item.id === 'codex')
    assert.equal(evidence.overallStatus, 'external-activation-required')
    assert.equal(evidence.certification.status, 'not-certified')
    assert.equal(codex.status, 'unknown')
    assert.equal(codex.filesystemTrust, 'missing')
    assert.match(codex.reasons.join(' '), /owner\/permission\/ACL evidence.*unavailable/)

    assert.throws(() => collectManagedFilesystemTrustEvidence({
      requirements: [{ logicalPath: 'C:\\Program Files\\Qijenchen\\Governance\\runtime.exe', objectType: 'file' }],
      platform: 'win32',
      hostRoot: fixture.hostRoot,
      hostIdentity: { ...HOST_IDENTITY, platform: 'win32' },
      collectorInstanceId: 'collector-001',
      attestorKeyId: 'endpoint-prod-1',
      observedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    }), /Windows filesystem trust requires endpoint-collected owner and ACL evidence/)
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('Windows endpoint ACL evidence is raw-digest-bound and rejects every untrusted write grant', () => {
  const paths = [
    ['C:\\', 'directory'],
    ['C:\\Program Files', 'directory'],
    ['C:\\Program Files\\Qijenchen', 'directory'],
    ['C:\\Program Files\\Qijenchen\\Governance', 'directory'],
    ['C:\\Program Files\\Qijenchen\\Governance\\runtime.exe', 'file'],
  ]
  const observations = paths.map(([logicalPath, objectType], index) => ({
    logicalPath,
    objectType,
    identity: { device: '1', inode: String(index + 1), linkCount: '1', size: objectType === 'file' ? '7' : '0', modifiedTimeNs: '1', changedTimeNs: '1' },
    contentSha256: objectType === 'file' ? sha256('runtime') : null,
    unix: null,
    windowsAcl: {
      ownerSid: 'S-1-5-18',
      daclProtected: true,
      rawSecurityDescriptorSha256: sha256(`descriptor-${index}`),
      aces: [
        { type: 'allow', sid: 'S-1-5-18', rights: ['full-control'], inherited: false },
        { type: 'allow', sid: 'S-1-5-32-545', rights: ['generic-read'], inherited: true },
      ],
    },
  }))
  const args = {
    requirements: [{ logicalPath: paths.at(-1)[0], objectType: 'file' }],
    platform: 'win32',
    hostRoot: '/',
    hostIdentity: { ...HOST_IDENTITY, platform: 'win32' },
    collectorInstanceId: 'collector-001',
    attestorKeyId: 'endpoint-prod-1',
    observedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  }
  const trusted = collectManagedFilesystemTrustEvidence({ ...args, windowsAclObservations: observations })
  assert.equal(trusted.observationsSha256, sha256(stableStringify(observations, 0)))

  const writable = structuredClone(observations)
  writable.at(-1).windowsAcl.aces.push({ type: 'allow', sid: 'S-1-1-0', rights: ['generic-write'], inherited: false })
  assert.throws(() => collectManagedFilesystemTrustEvidence({ ...args, windowsAclObservations: writable }), /grants write-capable Windows rights to an untrusted principal/)

  const ambiguous = structuredClone(observations)
  ambiguous.at(-1).windowsAcl.aces[1].rights = ['mystery-right']
  assert.throws(() => collectManagedFilesystemTrustEvidence({ ...args, windowsAclObservations: ambiguous }), /rights are invalid or not normalized/)
})

test('signature, host, time, control, source-capability, and key-alias attacks fail closed', () => {
  for (const [label, mutate, pattern] of [
    ['unsigned mutation', fixture => { fixture.readbacks.codex.payload.observedVersion = '99.0.0' }, /payload digest mismatch/],
    ['wrong host', fixture => { fixture.readbacks.codex.payload.hostIdentity = { ...HOST_IDENTITY, hostId: 'other-host' }; fixture.readbacks.codex = resign(fixture.readbacks.codex) }, /host identity mismatch/],
    ['expired', fixture => { fixture.readbacks.codex.payload.issuedAt = '2026-07-20T22:00:00.000Z'; fixture.readbacks.codex.payload.expiresAt = '2026-07-20T22:05:00.000Z'; fixture.readbacks.codex = resign(fixture.readbacks.codex) }, /expired/],
    ['control mismatch', fixture => { fixture.readbacks.codex.payload.controlReadbacks[0].value = false; fixture.readbacks.codex = resign(fixture.readbacks.codex) }, /effective control mismatch/],
    ['filesystem attestor spoof', fixture => { fixture.readbacks.codex.payload.filesystemTrust.attestorKeyId = 'endpoint-other'; fixture.readbacks.codex = resign(fixture.readbacks.codex) }, /filesystem trust collector\/attestor mismatch/],
    ['source overclaim', fixture => { fixture.readbacks.codex.payload.source = 'configRequirements\/read'; fixture.readbacks.codex.payload.sourceIdentity = 'configRequirements/read:fixture'; fixture.readbacks.codex.payload.collector.kind = 'provider-effective-api'; for (const item of fixture.readbacks.codex.payload.controlReadbacks) item.source = 'configRequirements/read'; fixture.readbacks.codex = resign(fixture.readbacks.codex) }, /cannot observe control/],
  ]) {
    const fixture = createAlignedFixture()
    try {
      mutate(fixture)
      const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: fixture.current })
      assert.equal(evidence.overallStatus, 'fail', label)
      assert.match(evidence.providers.flatMap(item => item.reasons).join(' '), pattern, label)
    } finally {
      rmSync(fixture.hostRoot, { recursive: true, force: true })
    }
  }
  const current = models()
  current.desired.readbackTrust.trustedEndpointKeys.push({ keyId: 'endpoint-alias', publicKeySPKI: PUBLIC_SPKI, endpointIds: ['fleet-prod'] })
  assert.throws(() => validateManagedHostAssuranceModel({ desired: current.desired, compatibility: current.compatibility, contract: current.contract, repoRoot: REPO_ROOT }), /public key is aliased/)
})

test('configRequirements/read leaves undocumented Codex controls unknown rather than self-certifying', () => {
  const fixture = createAlignedFixture()
  try {
    const provider = fixture.current.desired.providers.find(item => item.id === 'codex')
    fixture.readbacks.codex = readback({ current: fixture.current, release: fixture.release, provider, runtime: fixture.runtime, hookDelivery: fixture.codexBundle.hookDelivery, hostRoot: fixture.hostRoot, codexExpectedFiles: fixture.codexBundle.expected.files, source: 'configRequirements/read', unknown: true })
    const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, replayProtection: replayCache(), generatedAt: NOW, models: fixture.current })
    const codex = evidence.providers.find(item => item.id === 'codex')
    assert.equal(evidence.overallStatus, 'external-activation-required')
    assert.equal(codex.status, 'unknown')
    assert.equal(codex.policy, 'not-evaluable')
    assert.deepEqual(codex.unknownControls, [...provider.enforcementControls].sort(compareUtf8Bytes))
    assert.equal(codex.hookDelivery, 'not-evaluable')
  } finally {
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('release-tag/plugin inventory, deterministic bundle, runtime, and ancestor drift fail closed', () => {
  for (const [label, mutate, pattern] of [
    ['Claude tag uses commit instead of release tag', fixture => { fixture.readbacks['claude-code'].payload.hookDelivery.marketplaceRef = COMMIT; fixture.readbacks['claude-code'] = resign(fixture.readbacks['claude-code']) }, /marketplace tag/],
    ['Claude installed inventory drift', fixture => { writeFileSync(resolve(fixture.claudePlugin.root, 'unexpected.txt'), 'drift\n') }, /signed filesystem observation does not match|missing or unexpected files/],
    ['Claude hook runner missing from a self-consistent signed inventory', fixture => {
      rmSync(resolve(fixture.claudePlugin.root, 'scripts/run-provider-hook.mjs'))
      const hook = fixture.readbacks['claude-code'].payload.hookDelivery
      hook.files = inventory(fixture.claudePlugin.root)
      hook.inventorySha256 = sha256(stableStringify(hook.files, 0))
      fixture.readbacks['claude-code'] = resign(fixture.readbacks['claude-code'])
    }, /managed filesystem requirement digest mismatch|signed filesystem observation does not match|runtime root digest mismatch|runtime dependency mismatch/],
    ['Claude hook runner substitution in a self-consistent signed inventory', fixture => {
      writeFileSync(resolve(fixture.claudePlugin.root, 'scripts/run-provider-hook.mjs'), 'process.exit(0)\n')
      const hook = fixture.readbacks['claude-code'].payload.hookDelivery
      hook.files = inventory(fixture.claudePlugin.root)
      hook.inventorySha256 = sha256(stableStringify(hook.files, 0))
      fixture.readbacks['claude-code'] = resign(fixture.readbacks['claude-code'])
    }, /signed filesystem observation does not match|runtime root digest mismatch|runtime dependency mismatch/],
    ['Claude authority policy missing from a self-consistent signed inventory', fixture => {
      rmSync(resolve(fixture.claudePlugin.root, 'AGENTS.md'))
      const hook = fixture.readbacks['claude-code'].payload.hookDelivery
      hook.files = inventory(fixture.claudePlugin.root)
      hook.inventorySha256 = sha256(stableStringify(hook.files, 0))
      fixture.readbacks['claude-code'] = resign(fixture.readbacks['claude-code'])
    }, /managed filesystem requirement digest mismatch|signed filesystem observation does not match|runtime file mismatch/],
    ['Codex dispatcher drift', fixture => { writeFileSync(resolve(fixture.codexBundle.root, 'managed-hook-dispatcher.mjs'), 'process.exit(0)\n') }, /signed filesystem observation does not match|file digest mismatch|dispatcher bytes mismatch/],
    ['Codex bundle extra file', fixture => { writeFileSync(resolve(fixture.codexBundle.root, 'unexpected.sh'), 'exit 0\n') }, /signed filesystem observation does not match|missing or unexpected files/],
    ['Codex runtime symlink', fixture => { const target = resolve(fixture.hostRoot, 'outside-node'); writeFileSync(target, 'runtime\n'); chmodSync(target, 0o755); const node = physical(fixture.hostRoot, fixture.runtime.node.executablePath); rmSync(node); symlinkSync(target, node) }, /crosses a symbolic link/],
  ]) {
    const fixture = createAlignedFixture()
    try {
      mutate(fixture)
      const evidence = verifyManagedHostAssurance({ repoRoot: REPO_ROOT, platform: 'darwin', hostRoot: fixture.hostRoot, effectiveReadbacks: fixture.readbacks, expectedHostIdentity: HOST_IDENTITY, generatedAt: NOW, models: fixture.current })
      assert.equal(evidence.overallStatus, 'fail', label)
      assert.match(evidence.providers.flatMap(item => item.reasons).join(' '), pattern, label)
    } finally {
      rmSync(fixture.hostRoot, { recursive: true, force: true })
    }
  }
})

test('a clean installed Claude plugin can execute a release-bound canonical hook', () => {
  const fixture = createAlignedFixture()
  const project = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-claude-project-')))
  try {
    const initialized = spawnSync('git', ['init', '-q', project], { encoding: 'utf8' })
    assert.equal(initialized.status, 0, initialized.stderr)
    const target = resolve(project, 'src/Example.tsx')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, 'export const Example = () => null\n')
    const result = spawnSync(process.execPath, ['--',
      'scripts/run-provider-hook.mjs',
      '--provider', 'claude',
      '--hook', 'check_item_list_gap.sh',
    ], {
      cwd: fixture.claudePlugin.root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: target,
          old_string: 'export const Example = () => null',
          new_string: '<div><FileItem /><FileItem /></div>',
        },
      }),
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    const output = JSON.parse(result.stdout)
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse')
    assert.match(output.hookSpecificOutput.additionalContext, /M16 Item-list gap canonical/)
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(fixture.hostRoot, { recursive: true, force: true })
  }
})

test('the deterministic Codex dispatcher enforces neutral input, proposed-state, output, and integrity contracts', async () => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-dispatcher-')))
  const project = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-dispatcher-project-')))
  try {
    const fork = resolve(root, 'payload/packages/design-system/ds-canonical/fork')
    const hooksRoot = resolve(fork, 'hooks')
    const dispatcher = resolve(root, 'managed-hook-dispatcher.mjs')
    mkdirSync(resolve(fork, 'launchers'), { recursive: true })
    mkdirSync(hooksRoot, { recursive: true })
    assert.equal(spawnSync('git', ['-C', project, 'init', '-q']).status, 0)
    mkdirSync(resolve(project, 'src'), { recursive: true })
    writeFileSync(resolve(project, 'src/Existing.tsx'), 'export const value = "old"\n')
    for (const [source, destination] of [
      [
        resolve(REPO_ROOT, 'scripts/lib/provider-hook-output-transport.mjs'),
        resolve(fork, 'launchers/provider-hook-output-transport.mjs'),
      ],
      [
        resolve(REPO_ROOT, 'packages/governance/src/provider-hook-normalization.mjs'),
        resolve(fork, 'launchers/provider-hook-normalization.mjs'),
      ],
      [
        resolve(REPO_ROOT, 'packages/governance/src/canonical-order.mjs'),
        resolve(fork, 'launchers/canonical-order.mjs'),
      ],
      [
        resolve(REPO_ROOT, 'packages/design-system/ds-canonical/templates/product-launchers/normalize-provider-event.mjs'),
        resolve(fork, 'launchers/normalize-provider-event.mjs'),
      ],
    ]) cpSync(source, destination)

    const proposedProbe = `import json, os, sys
payload = json.load(sys.stdin)
forbidden_environment = sorted(
    name for name in os.environ
    if name == "GOVERNANCE_TOOL_INPUT"
    or name == "EXPECTED_PROPOSED_CONTENT"
    or name.endswith("_TOOL_INPUT")
    or name.startswith("GIT_")
    or name in {
        "BASH_ENV", "ENV", "NODE_OPTIONS", "NODE_PATH", "PYTHONHOME", "PYTHONPATH",
        "PYTHONSTARTUP", "PYTHONINSPECT",
    }
)
if forbidden_environment:
    print("forbidden child environment:" + ",".join(forbidden_environment), file=sys.stderr)
    raise SystemExit(70)
if os.environ.get("PATH") != ${JSON.stringify(providerHookOutputContract.executablePath)}:
    print("controlled executable PATH is unavailable", file=sys.stderr)
    raise SystemExit(70)
snapshot_adapter = json.loads(
    open(os.path.join(os.environ["GOVERNANCE_CORPUS_ROOT"], "manifest.json"), encoding="utf-8").read()
)["providerAdapters"]["codex"]
if json.loads(os.environ.get("GOVERNANCE_PROVIDER_ADAPTER_JSON", "null")) != snapshot_adapter:
    print("authenticated provider adapter environment mismatch", file=sys.stderr)
    raise SystemExit(70)
if os.environ.get("GOVERNANCE_WRITE_STATE_TRUST") != "runner-v1":
    print("proposed state trust is unavailable", file=sys.stderr)
    raise SystemExit(70)
if os.environ.get("GOVERNANCE_TRANSCRIPT_PATH") or os.environ.get("GOVERNANCE_TRANSCRIPT_TRUST") != "unavailable":
    print("unverified transcript trust reached child", file=sys.stderr)
    raise SystemExit(70)
if payload.get("transcript_path") != "":
    print("untrusted transcript path reached child", file=sys.stderr)
    raise SystemExit(70)
state = payload.get("governance_write_state")
if state != payload.get("tool_input", {}).get("governance_write_state"):
    print("trusted proposed state is missing or split", file=sys.stderr)
    raise SystemExit(70)
if state.get("schemaVersion") != 1 or state.get("kind") != "text":
    print("trusted proposed state is malformed", file=sys.stderr)
    raise SystemExit(70)
transport_id = snapshot_adapter["normalization"]["writeTransports"][0]["id"]
expected_content = {
    "codex-apply-patch-v1": 'export const value = "codex"\\n',
    "claude-edit-v1": 'export const value = "claude"\\n',
    "generic-edit-v1": 'export const value = "generic"\\n',
}.get(transport_id)
if expected_content is None or state.get("content") != expected_content:
    print("proposed after-image mismatch", file=sys.stderr)
    raise SystemExit(70)
def has_forbidden(value):
    if isinstance(value, dict):
        if any(key in value for key in {
            "command", "diff", "patch", "old_string", "replace_all",
            "governance_fake", "governance_proposed_state",
        }):
            return True
        return any(has_forbidden(item) for item in value.values())
    if isinstance(value, list):
        return any(has_forbidden(item) for item in value)
    return False
if has_forbidden(payload):
    print("untrusted governance or raw write transport reached child", file=sys.stderr)
    raise SystemExit(70)
print(json.dumps({
    "governanceContext": {
        "hookEventName": payload["hook_event_name"],
        "message": "managed proposed state verified",
    }
}, separators=(",", ":")))
`
    const policyHook = 'import sys\nprint("managed policy denial", file=sys.stderr)\nraise SystemExit(2)\n'
    const behaviorHook = `import json, os, sys, time
mode = os.environ.get("MANAGED_HOOK_MODE", "clean")
if mode == "context":
    print(json.dumps({"governanceContext":{"hookEventName":"PreToolUse","message":"managed context"}}))
elif mode == "large-context":
    print(json.dumps({"governanceContext":{"hookEventName":"PreToolUse","message":"x" * (900 * 1024)}}, separators=(",", ":")))
elif mode == "decision":
    print(json.dumps({"governanceDecision":"block","reason":"managed stop"}))
elif mode == "diagnostic":
    print("managed diagnostic", file=sys.stderr)
elif mode == "diagnostic-integrity-marker":
    print("GOVERNANCE_INTEGRITY:spoofed successful diagnostic", file=sys.stderr)
elif mode == "raw":
    print("raw child stdout")
elif mode == "mixed":
    print(json.dumps({"governanceContext":{"hookEventName":"PreToolUse","message":"mixed"}}))
    print("mixed stderr", file=sys.stderr)
elif mode == "undefined-exit":
    print("child crashed", file=sys.stderr)
    raise SystemExit(1)
elif mode == "integrity-marker":
    print("GOVERNANCE_INTEGRITY:spoofed child integrity", file=sys.stderr)
    raise SystemExit(2)
elif mode == "invalid-utf8":
    sys.stdout.buffer.write(b"\\xff")
elif mode == "overflow":
    sys.stdout.write("x" * 4096)
elif mode == "sleep":
    time.sleep(1)
`
    const raceHook = `#!/bin/sh
mv "$MANAGED_RACE_REPLACEMENT" "$MANAGED_RACE_TARGET"
`
    const signalTreeHook = `#!/bin/bash
set -uo pipefail
cat >/dev/null
trap '' TERM
(
  trap '' TERM
  while :; do sleep 1; done
) &
descendant=$!
printf '%s\\n%s\\n' "$GOVERNANCE_CORPUS_ROOT" "$descendant" > "$MANAGED_SIGNAL_READY_LOG"
wait "$descendant"
`
    const orphanTreeHook = `#!/bin/bash
set -uo pipefail
cat >/dev/null
(
  trap '' TERM
  exec >/dev/null 2>&1
  while :; do sleep 1; done
) &
printf '%s\\n' "$!" > "$MANAGED_ORPHAN_PID_LOG"
`
    const snapshotMutationDeniedHook = `#!/bin/bash
set -uo pipefail
cat >/dev/null
root="$GOVERNANCE_CORPUS_ROOT"
target="$root/hooks/bash-sibling.sh"
before="$(cat "$target")"
if printf 'poison\\n' 2>/dev/null >> "$target"; then
  echo "GOVERNANCE_INTEGRITY:snapshot file accepted an in-place write" >&2
  exit 70
fi
if rm "$target" 2>/dev/null; then
  echo "GOVERNANCE_INTEGRITY:snapshot directory accepted an unlink" >&2
  exit 70
fi
if mkdir "$root/unsigned" 2>/dev/null; then
  echo "GOVERNANCE_INTEGRITY:snapshot root accepted an unsigned child" >&2
  exit 70
fi
after="$(cat "$target")"
[ "$before" = "$after" ] || {
  echo "GOVERNANCE_INTEGRITY:snapshot bytes changed during denial probe" >&2
  exit 70
}
printf '%s\\n' "$root" > "$MANAGED_SNAPSHOT_LOG"
`
    const snapshotTamperHook = `#!/bin/bash
set -uo pipefail
cat >/dev/null
root="$GOVERNANCE_CORPUS_ROOT"
printf '%s\\n' "$root" > "$MANAGED_SNAPSHOT_LOG"
chmod 0700 "$root/hooks/bash-sibling.sh"
printf 'authenticated bytes replaced after launch\\n' > "$root/hooks/bash-sibling.sh"
`
    const bashSibling = `#!/bin/bash
managed_snapshot_sibling() {
  local sibling_path
  sibling_path="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)/$(basename "\${BASH_SOURCE[0]}")"
  [ "\${BASH_SOURCE[0]}" = "$sibling_path" ] || {
    echo "GOVERNANCE_INTEGRITY:managed Bash sibling path metadata mismatch" >&2
    return 70
  }
  printf 'sibling=%s\\n' "$sibling_path" >> "$MANAGED_SNAPSHOT_PATH_LOG"
}
`
    const bashSnapshotHook = `#!/bin/bash
set -uo pipefail
main_path="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)/$(basename "\${BASH_SOURCE[0]}")"
if [ "$0" != "$main_path" ] || [ "\${BASH_SOURCE[0]}" != "$main_path" ]; then
  echo "GOVERNANCE_INTEGRITY:managed Bash main path metadata mismatch" >&2
  exit 70
fi
source "$(dirname "$main_path")/bash-sibling.sh" || exit $?
managed_snapshot_sibling || exit $?
printf 'hook=%s\\nroot=%s\\npath=%s\\n' "$main_path" "$GOVERNANCE_CORPUS_ROOT" "$PATH" >> "$MANAGED_SNAPSHOT_PATH_LOG"
cat >/dev/null
`
    const pythonSnapshotHook = `import json, os
from pathlib import Path

payload = json.load(__import__("sys").stdin)
hook = Path(__file__).resolve()
root = Path(os.environ["GOVERNANCE_CORPUS_ROOT"]).resolve()
sibling = (hook.parent / "python-sibling.txt").resolve()
if hook != root / "hooks" / "python-snapshot.py":
    raise SystemExit("managed Python __file__ is not the authenticated snapshot path")
if sibling.read_text(encoding="utf-8") != "managed sibling\\n":
    raise SystemExit("managed Python sibling is unavailable")
with open(os.environ["MANAGED_SNAPSHOT_PATH_LOG"], "a", encoding="utf-8") as log:
    log.write(f"hook={hook}\\nroot={root}\\nsibling={sibling}\\npath={os.environ.get('PATH', '')}\\n")
`
    const orderedContextHook = (id) => `import json, os, sys
payload = json.load(sys.stdin)
name = os.path.basename(payload.get("tool_input", {}).get("file_path", ""))
with open(os.environ["MANAGED_ORDER_LOG"], "a", encoding="utf-8") as log:
    log.write(${JSON.stringify(id + ':')} + name + "\\n")
print(json.dumps({"governanceContext":{"hookEventName":"PreToolUse","message":${JSON.stringify(id + ':')} + name}}, separators=(",", ":")))
`
    const orderedPolicyHook = `import json, os, sys
payload = json.load(sys.stdin)
name = os.path.basename(payload.get("tool_input", {}).get("file_path", ""))
with open(os.environ["MANAGED_ORDER_LOG"], "a", encoding="utf-8") as log:
    log.write("policy:" + name + "\\n")
print("managed first policy denial", file=sys.stderr)
raise SystemExit(2)
`
    const orderedLaterHook = `import json, os, sys
payload = json.load(sys.stdin)
name = os.path.basename(payload.get("tool_input", {}).get("file_path", ""))
with open(os.environ["MANAGED_ORDER_LOG"], "a", encoding="utf-8") as log:
    log.write("later:" + name + "\\n")
`
    const stopHook = (id) => `import json, os, sys
json.load(sys.stdin)
with open(os.environ["MANAGED_ORDER_LOG"], "a", encoding="utf-8") as log:
    log.write(${JSON.stringify(`stop:${id}\n`)})
print(json.dumps({"governanceDecision":"block","reason":${JSON.stringify('managed stop ' + id)}}, separators=(",", ":")))
`
    for (const [name, body] of [
      ['proposed.py', proposedProbe],
      ['policy.py', policyHook],
      ['behavior.py', behaviorHook],
      ['unicode-\uE000.txt', 'BMP private-use ordering probe\n'],
      ['unicode-\u{10000}.txt', 'supplementary-plane ordering probe\n'],
      ['race.sh', raceHook],
      ['signal-tree.sh', signalTreeHook],
      ['orphan-tree.sh', orphanTreeHook],
      ['snapshot-mutation-denied.sh', snapshotMutationDeniedHook],
      ['snapshot-tamper.sh', snapshotTamperHook],
      ['bash-sibling.sh', bashSibling],
      ['bash-snapshot.sh', bashSnapshotHook],
      ['python-snapshot.py', pythonSnapshotHook],
      ['python-sibling.txt', 'managed sibling\n'],
      ['order-first.py', orderedContextHook('first')],
      ['order-second.py', orderedContextHook('second')],
      ['order-policy.py', orderedPolicyHook],
      ['order-later.py', orderedLaterHook],
      ['stop-first.py', stopHook('first')],
      ['stop-later.py', stopHook('later')],
    ]) {
      writeFileSync(resolve(hooksRoot, name), body)
      chmodSync(resolve(hooksRoot, name), 0o755)
    }

    const providers = readJson(resolve(REPO_ROOT, 'packages/governance/canonical/providers.json')).providers
    const managedFixtureEnvironmentMap = Object.fromEntries([
      'MANAGED_HOOK_MODE',
      'MANAGED_ORDER_LOG',
      'MANAGED_ORPHAN_PID_LOG',
      'MANAGED_RACE_REPLACEMENT',
      'MANAGED_RACE_TARGET',
      'MANAGED_SIGNAL_READY_LOG',
      'MANAGED_SNAPSHOT_LOG',
      'MANAGED_SNAPSHOT_PATH_LOG',
    ].map((name) => [name, name]))
    const adapterFor = (providerId) => {
      const provider = providers.find((candidate) => candidate.id === providerId)
      return {
        environmentMap: {
          ...(provider.adapter.environmentMap || {}),
          ...managedFixtureEnvironmentMap,
        },
        normalization: provider.normalization,
        contextOutputTransport: 'system-message',
        stopDecisionTransport: 'continue-json',
      }
    }
    const lockedCorpusFiles = (directory, prefix = '') =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const repositoryPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (repositoryPath === 'governance.lock') return []
        if (entry.isDirectory()) {
          return lockedCorpusFiles(resolve(directory, entry.name), repositoryPath)
        }
        assert.equal(entry.isFile(), true, `fixture corpus entry must be regular:${repositoryPath}`)
        return [repositoryPath]
      })
    const configure = ({
      providerId = 'codex',
      event = 'PreToolUse',
      descriptors,
      dispatcherOptions = {},
    }) => {
      const hooks = {
        PreToolUse: [],
        PostToolUse: [],
        SessionStart: [],
        UserPromptSubmit: [],
        Stop: [],
      }
      hooks[event] = descriptors
      writeFileSync(resolve(fork, 'manifest.json'), `${JSON.stringify({
        providerAdapters: { codex: adapterFor(providerId) },
        hooks,
      }, null, 2)}\n`)
      writeFileSync(resolve(fork, 'governance.lock'), `${JSON.stringify({
        schemaVersion: 1,
        kind: 'fork-governance-corpus-lock',
        hashAlgorithm: 'sha256',
        entries: lockedCorpusFiles(fork).sort(compareUtf8Bytes).map((file) => ({
          file,
          sha256: sha256(readFileSync(resolve(fork, file))),
        })),
      }, null, 2)}\n`)
      const body = buildCodexManagedDispatcher(dispatcherOptions)
      assert.match(body, /import \{ Buffer \} from 'node:buffer'/)
      assert.match(body, /function compareUtf8Bytes\(left, right\) \{\s+return Buffer\.compare\(Buffer\.from\(String\(left\), 'utf8'\), Buffer\.from\(String\(right\), 'utf8'\)\)\s+\}/)
      assert.match(body, /interpretProviderHookChildResult/)
      assert.match(body, /materialized_write_states/)
      assert.match(body, /spawn\(runtime, \[executionPath\]/)
      assert.match(body, /detached: true/)
      assert.match(body, /MAX_AGGREGATE_CHILD_OUTPUT_BYTES/)
      writeFileSync(dispatcher, body)
    }
    const descriptor = ({
      file,
      matcher = '',
      runtime = 'python3',
      outputMode = 'blocking',
      inputContract = 'event-v1',
      transcriptRequirement = 'none',
    }) => ({
      file: `hooks/${file}`,
      sourceHook: file,
      bucket: 'SHIP_AS_IS',
      matcher,
      runtime,
      outputMode,
      inputContract,
      transcriptRequirement,
    })
    const run = ({
      event = 'PreToolUse',
      payload = {},
      input = null,
      env = {},
      runtimeArgs = [],
    } = {}) => spawnSync(process.execPath, [
      '--',
      dispatcher,
      '--event', event,
      '--shell', '/bin/bash',
      '--python', '/usr/bin/python3',
      ...runtimeArgs,
    ], {
      cwd: project,
      env: {
        ...process.env,
        PATH: resolve(root, 'poison-bin'),
        GIT_DIR: '/spoofed/git-dir',
        GIT_WORK_TREE: '/spoofed/git-work-tree',
        GIT_CONFIG_SYSTEM: '/spoofed/git-system-config',
        GIT_CONFIG_GLOBAL: '/spoofed/git-global-config',
        GIT_CONFIG_COUNT: '1',
        GOVERNANCE_TOOL_INPUT: 'spoofed-neutral-payload',
        CODEX_TOOL_INPUT: 'spoofed-codex-payload',
        UNREGISTERED_TOOL_INPUT: 'spoofed-unregistered-payload',
        BASH_ENV: '/spoofed/bash-env',
        NODE_PATH: '/spoofed/node-path',
        PYTHONPATH: '/spoofed/python-path',
        PYTHONSTARTUP: '/spoofed/python-startup.py',
        PYTHONINSPECT: '1',
        GOVERNANCE_WRITE_STATE_TRUST: 'spoofed-trust',
        GOVERNANCE_TRANSCRIPT_TRUST: 'spoofed-transcript-trust',
        GOVERNANCE_TRANSCRIPT_PATH: '/spoofed/transcript',
        ...env,
      },
      input: input ?? `${JSON.stringify(payload)}\n`,
      encoding: 'utf8',
    })
    const startAsync = ({
      event = 'PreToolUse',
      payload = {},
      env = {},
      runtimeArgs = [],
    } = {}) => {
      const child = spawn(process.execPath, [
        '--',
        dispatcher,
        '--event', event,
        '--shell', '/bin/bash',
        '--python', '/usr/bin/python3',
        ...runtimeArgs,
      ], {
        cwd: project,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const stdout = []
      const stderr = []
      child.stdout.on('data', (chunk) => stdout.push(chunk))
      child.stderr.on('data', (chunk) => stderr.push(chunk))
      const completion = new Promise((accept) => {
        child.once('close', (status, signal) => accept({
          signal,
          status,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }))
      })
      child.stdin.end(`${JSON.stringify(payload)}\n`)
      return { child, completion }
    }
    const waitForFixtureText = async (path, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() <= deadline) {
        try {
          const body = readFileSync(path, 'utf8')
          if (body.trim()) return body
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        await new Promise((accept) => setTimeout(accept, 20))
      }
      throw new Error(`timed out waiting for ${path}`)
    }
    const waitForFixtureProcessExit = async (pid, timeoutMs = 3000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() <= deadline) {
        try {
          process.kill(pid, 0)
        } catch (error) {
          if (error.code === 'ESRCH') return
          throw error
        }
        await new Promise((accept) => setTimeout(accept, 20))
      }
      throw new Error(`process ${pid} remained alive`)
    }

    const proposedDescriptor = descriptor({
      file: 'proposed.py',
      matcher: 'Edit|Write|MultiEdit',
      outputMode: 'governance-context',
      inputContract: 'proposed-text-v1',
      transcriptRequirement: 'optional',
    })
    configure({ descriptors: [proposedDescriptor] })
    const codexAfter = 'export const value = "codex"\n'
    const codexProposed = run({
      payload: {
        hook_event_name: 'spoofed-event',
        tool_name: 'apply_patch',
        transcript_path: '/untrusted/transcript',
        governance_fake: 'spoofed',
        governance_write_state: { content: 'spoofed' },
        tool_input: {
          governance_fake: 'spoofed',
          command: [
            '*** Begin Patch',
            '*** Update File: src/Existing.tsx',
            '@@',
            '-export const value = "old"',
            '+export const value = "codex"',
            '*** End Patch',
          ].join('\n'),
        },
      },
      env: { EXPECTED_PROPOSED_CONTENT: codexAfter },
    })
    assert.equal(codexProposed.status, 0, codexProposed.stderr)
    assert.deepEqual(JSON.parse(codexProposed.stdout), { systemMessage: 'managed proposed state verified' })
    assert.equal(readFileSync(resolve(project, 'src/Existing.tsx'), 'utf8'), 'export const value = "old"\n')
    writeFileSync(resolve(project, 'src/SymlinkTarget.tsx'), 'export const alias = "old"\n')
    symlinkSync('SymlinkTarget.tsx', resolve(project, 'src/SymlinkSource.tsx'))
    const symlinkedSource = run({
      payload: {
        tool_name: 'apply_patch',
        tool_input: {
          command: [
            '*** Begin Patch',
            '*** Update File: src/SymlinkSource.tsx',
            '@@',
            '-export const alias = "old"',
            '+export const alias = "new"',
            '*** End Patch',
          ].join('\n'),
        },
      },
      env: { EXPECTED_PROPOSED_CONTENT: 'export const alias = "new"\n' },
    })
    assert.equal(symlinkedSource.status, 70)
    assert.match(symlinkedSource.stderr, /GOVERNANCE_INTEGRITY:.*symbolic link/)
    rmSync(resolve(project, 'src/SymlinkSource.tsx'))

    configure({ providerId: 'claude', descriptors: [proposedDescriptor] })
    const claudeAfter = 'export const value = "claude"\n'
    const claudeProposed = run({
      payload: {
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/Existing.tsx',
          content: claudeAfter,
          governance_fake: 'spoofed',
        },
      },
      env: { EXPECTED_PROPOSED_CONTENT: claudeAfter },
    })
    assert.equal(claudeProposed.status, 0, claudeProposed.stderr)
    assert.deepEqual(JSON.parse(claudeProposed.stdout), { systemMessage: 'managed proposed state verified' })

    configure({ providerId: 'generic', descriptors: [proposedDescriptor] })
    const genericAfter = 'export const value = "generic"\n'
    const genericProposed = run({
      payload: {
        operation: 'apply_patch',
        diff: [
          '--- a/src/Existing.tsx',
          '+++ b/src/Existing.tsx',
          '@@ -1 +1 @@',
          '-export const value = "old"',
          '+export const value = "generic"',
          '',
        ].join('\n'),
      },
      env: { EXPECTED_PROPOSED_CONTENT: genericAfter },
    })
    assert.equal(genericProposed.status, 0, genericProposed.stderr)
    assert.deepEqual(JSON.parse(genericProposed.stdout), { systemMessage: 'managed proposed state verified' })

    const snapshotPayload = (name) => ({
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          `*** Add File: src/${name}.tsx`,
          `+export const ${name} = true`,
          '*** End Patch',
        ].join('\n'),
      },
    })
    for (const [file, runtime, name] of [
      ['bash-snapshot.sh', 'bash', 'BashSnapshot'],
      ['python-snapshot.py', 'python3', 'PythonSnapshot'],
    ]) {
      const snapshotLog = resolve(root, `${name}.log`)
      configure({
        event: 'PostToolUse',
        descriptors: [descriptor({ file, runtime })],
      })
      const snapshotResult = run({
        event: 'PostToolUse',
        payload: snapshotPayload(name),
        env: { MANAGED_SNAPSHOT_PATH_LOG: snapshotLog },
      })
      assert.equal(snapshotResult.status, 0, `${file}:${snapshotResult.stderr}`)
      const snapshotPaths = Object.fromEntries(
        readFileSync(snapshotLog, 'utf8').trim().split('\n').map((line) =>
          line.split(/=(.*)/s).slice(0, 2)),
      )
      assert.equal(snapshotPaths.hook, resolve(snapshotPaths.root, `hooks/${file}`))
      assert.equal(snapshotPaths.path, providerHookOutputContract.executablePath)
      if (runtime === 'bash') {
        assert.equal(snapshotPaths.sibling, resolve(snapshotPaths.root, 'hooks/bash-sibling.sh'))
      } else {
        assert.equal(snapshotPaths.sibling, resolve(snapshotPaths.root, 'hooks/python-sibling.txt'))
      }
      assert.notEqual(snapshotPaths.root, fork)
      assert.throws(() => lstatSync(snapshotPaths.root), /ENOENT/)
    }

    const deniedSnapshotLog = resolve(root, 'managed-snapshot-denied.log')
    configure({
      event: 'PostToolUse',
      descriptors: [descriptor({ file: 'snapshot-mutation-denied.sh', runtime: 'bash' })],
    })
    const deniedSnapshot = run({
      event: 'PostToolUse',
      payload: snapshotPayload('SnapshotMutationDenied'),
      env: { MANAGED_SNAPSHOT_LOG: deniedSnapshotLog },
    })
    assert.equal(deniedSnapshot.status, 0, deniedSnapshot.stderr)
    const deniedSnapshotRoot = readFileSync(deniedSnapshotLog, 'utf8').trim()
    assert.equal(deniedSnapshotRoot.startsWith('/'), true)
    assert.throws(() => lstatSync(deniedSnapshotRoot), /ENOENT/)

    const tamperSnapshotLog = resolve(root, 'managed-snapshot-tamper.log')
    configure({
      event: 'PostToolUse',
      descriptors: [descriptor({ file: 'snapshot-tamper.sh', runtime: 'bash' })],
    })
    const tamperedSnapshot = run({
      event: 'PostToolUse',
      payload: snapshotPayload('SnapshotTamper'),
      env: { MANAGED_SNAPSHOT_LOG: tamperSnapshotLog },
    })
    assert.equal(tamperedSnapshot.status, 70)
    assert.match(tamperedSnapshot.stderr, /authenticated snapshot entry is unsafe|changed after materialization/)
    const tamperedSnapshotRoot = readFileSync(tamperSnapshotLog, 'utf8').trim()
    assert.equal(tamperedSnapshotRoot.startsWith('/'), true)
    assert.throws(() => lstatSync(tamperedSnapshotRoot), /ENOENT/)

    const twoPathPayload = {
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Add File: src/One.tsx',
          '+export const One = true',
          '*** Add File: src/Two.tsx',
          '+export const Two = true',
          '*** End Patch',
        ].join('\n'),
      },
    }
    const orderLog = resolve(root, 'managed-order.log')
    configure({
      descriptors: [
        descriptor({ file: 'order-first.py', outputMode: 'governance-context' }),
        descriptor({ file: 'order-second.py', outputMode: 'governance-context' }),
      ],
    })
    const orderedContexts = run({
      payload: twoPathPayload,
      env: { MANAGED_ORDER_LOG: orderLog },
    })
    assert.equal(orderedContexts.status, 0, orderedContexts.stderr)
    assert.deepEqual(
      readFileSync(orderLog, 'utf8').trim().split('\n'),
      ['first:One.tsx', 'first:Two.tsx', 'second:One.tsx', 'second:Two.tsx'],
    )
    assert.deepEqual(JSON.parse(orderedContexts.stdout), {
      systemMessage: 'first:One.tsx\n\nfirst:Two.tsx\n\nsecond:One.tsx\n\nsecond:Two.tsx',
    })

    writeFileSync(orderLog, '')
    configure({
      descriptors: [
        descriptor({ file: 'order-policy.py' }),
        descriptor({ file: 'order-later.py' }),
      ],
    })
    const firstPolicy = run({
      payload: twoPathPayload,
      env: { MANAGED_ORDER_LOG: orderLog },
    })
    assert.equal(firstPolicy.status, 2, firstPolicy.stderr)
    assert.equal(firstPolicy.stderr, 'managed first policy denial\n')
    assert.deepEqual(readFileSync(orderLog, 'utf8').trim().split('\n'), ['policy:One.tsx'])

    writeFileSync(orderLog, '')
    configure({
      event: 'Stop',
      descriptors: [
        descriptor({ file: 'stop-first.py', outputMode: 'governance-decision' }),
        descriptor({ file: 'stop-later.py', outputMode: 'governance-decision' }),
      ],
    })
    const firstStop = run({
      event: 'Stop',
      payload: { stop_hook_active: true },
      env: { MANAGED_ORDER_LOG: orderLog },
    })
    assert.equal(firstStop.status, 0, firstStop.stderr)
    assert.deepEqual(JSON.parse(firstStop.stdout), {
      continue: false,
      stopReason: 'managed stop first',
    })
    assert.deepEqual(readFileSync(orderLog, 'utf8').trim().split('\n'), ['stop:first'])

    const manyCodexFilesPayload = (count) => ({
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          ...Array.from({ length: count }, (_, index) => [
            `*** Add File: src/Bound-${index}.tsx`,
            `+export const Bound${index} = ${index}`,
          ]).flat(),
          '*** End Patch',
        ].join('\n'),
      },
    })
    configure({
      descriptors: Array.from({ length: 65 }, () =>
        descriptor({ file: 'behavior.py' })),
    })
    const descriptorBound = run({ payload: { tool_name: 'Read' } })
    assert.equal(descriptorBound.status, 70)
    assert.match(descriptorBound.stderr, /descriptor count exceeds 64/)

    configure({ descriptors: [descriptor({ file: 'behavior.py' })] })
    const changedFileBound = run({ payload: manyCodexFilesPayload(257) })
    assert.equal(changedFileBound.status, 70)
    assert.match(changedFileBound.stderr, /changed-file count exceeds 256/)

    configure({
      descriptors: Array.from({ length: 5 }, () =>
        descriptor({ file: 'behavior.py' })),
    })
    const invocationBound = run({ payload: manyCodexFilesPayload(256) })
    assert.equal(invocationBound.status, 70)
    assert.match(invocationBound.stderr, /invocation count exceeds 1024/)

    for (const name of ['Large-A.tsx', 'Large-B.tsx']) {
      writeFileSync(resolve(project, `src/${name}`), `A${'x'.repeat(9 * 1024 * 1024 - 1)}`)
    }
    configure({ providerId: 'claude', descriptors: [proposedDescriptor] })
    const proposedImageBound = run({
      payload: {
        tool_name: 'MultiEdit',
        tool_input: {
          edits: ['Large-A.tsx', 'Large-B.tsx'].map((name) => ({
            file_path: `src/${name}`,
            old_string: 'A',
            new_string: 'B',
          })),
        },
      },
    })
    assert.equal(proposedImageBound.status, 70)
    assert.match(
      proposedImageBound.stderr,
      /GOVERNANCE_INTEGRITY:AGGREGATE_TEXT_TOO_LARGE:provider proposed state blocked:AGGREGATE_TEXT_TOO_LARGE:materialized text states exceed 7340032 remaining bytes:src\/Large-B\.tsx/,
    )

    configure({
      descriptors: [descriptor({
        file: 'behavior.py',
        outputMode: 'governance-context',
      })],
    })
    const largeContext = run({
      payload: { tool_name: 'Read' },
      env: { MANAGED_HOOK_MODE: 'large-context' },
    })
    assert.equal(largeContext.status, 0, largeContext.stderr)
    assert.equal(JSON.parse(largeContext.stdout).systemMessage.length, 900 * 1024)
    const aggregateBound = run({
      payload: manyCodexFilesPayload(10),
      env: { MANAGED_HOOK_MODE: 'large-context' },
    })
    assert.equal(aggregateBound.status, 70)
    assert.match(aggregateBound.stderr, /aggregate child output exceeds 8388608 bytes/)
    assert.equal(aggregateBound.stdout, '')

    configure({ descriptors: [descriptor({ file: 'policy.py', matcher: 'Read' })] })
    const policy = run({ payload: { tool_name: 'Read' } })
    assert.equal(policy.status, 2)
    assert.equal(policy.stdout, '')
    assert.equal(policy.stderr, 'managed policy denial\n')
    assert.doesNotMatch(policy.stderr, /GOVERNANCE_INTEGRITY:/)

    configure({
      descriptors: [descriptor({
        file: 'behavior.py',
        matcher: 'Read',
        outputMode: 'governance-context',
        transcriptRequirement: 'optional',
      })],
    })
    const context = run({ payload: { tool_name: 'Read' }, env: { MANAGED_HOOK_MODE: 'context' } })
    assert.equal(context.status, 0, context.stderr)
    assert.deepEqual(JSON.parse(context.stdout), { systemMessage: 'managed context' })

    configure({
      event: 'UserPromptSubmit',
      descriptors: [descriptor({ file: 'behavior.py', outputMode: 'diagnostic' })],
    })
    const diagnostic = run({
      event: 'UserPromptSubmit',
      payload: { prompt: 'diagnostic' },
      env: { MANAGED_HOOK_MODE: 'diagnostic' },
    })
    assert.equal(diagnostic.status, 0, diagnostic.stderr)
    assert.equal(diagnostic.stdout, '')
    assert.equal(diagnostic.stderr, 'managed diagnostic\n')
    const spoofedDiagnostic = run({
      event: 'UserPromptSubmit',
      payload: { prompt: 'diagnostic marker' },
      env: { MANAGED_HOOK_MODE: 'diagnostic-integrity-marker' },
    })
    assert.equal(spoofedDiagnostic.status, 70)
    assert.match(spoofedDiagnostic.stderr, /GOVERNANCE_INTEGRITY:.*reserved integrity marker/)

    configure({
      event: 'Stop',
      descriptors: [descriptor({ file: 'behavior.py', outputMode: 'governance-decision' })],
    })
    const stop = run({
      event: 'Stop',
      payload: { stop_hook_active: true },
      env: { MANAGED_HOOK_MODE: 'decision' },
    })
    assert.equal(stop.status, 0, stop.stderr)
    assert.deepEqual(JSON.parse(stop.stdout), { continue: false, stopReason: 'managed stop' })

    const integrityDescriptor = descriptor({
      file: 'behavior.py',
      matcher: 'Read',
      outputMode: 'governance-context-or-block',
    })
    configure({ descriptors: [integrityDescriptor] })
    for (const mode of ['raw', 'mixed', 'undefined-exit', 'integrity-marker', 'invalid-utf8']) {
      const malformed = run({ payload: { tool_name: 'Read' }, env: { MANAGED_HOOK_MODE: mode } })
      assert.equal(malformed.status, 70, mode)
      assert.match(malformed.stderr, /GOVERNANCE_INTEGRITY:/, mode)
    }

    configure({
      descriptors: [descriptor({
        file: 'behavior.py',
        matcher: 'Read',
        outputMode: 'diagnostic',
      })],
    })
    const rawDiagnostic = run({ payload: { tool_name: 'Read' }, env: { MANAGED_HOOK_MODE: 'raw' } })
    assert.equal(rawDiagnostic.status, 70)
    assert.match(rawDiagnostic.stderr, /GOVERNANCE_INTEGRITY:.*forbidden raw stdout/)

    configure({
      descriptors: [descriptor({
        file: 'behavior.py',
        matcher: 'Read',
        outputMode: 'governance-context',
        transcriptRequirement: 'stable-required',
      })],
    })
    const transcriptUnavailable = run({ payload: { tool_name: 'Read', transcript_path: '/spoofed' } })
    assert.equal(transcriptUnavailable.status, 70)
    assert.match(transcriptUnavailable.stderr, /GOVERNANCE_INTEGRITY:.*verified transcript contract is unavailable/)

    configure({
      descriptors: [integrityDescriptor],
      dispatcherOptions: { maxChildOutputBytes: 128 },
    })
    const overflow = run({ payload: { tool_name: 'Read' }, env: { MANAGED_HOOK_MODE: 'overflow' } })
    assert.equal(overflow.status, 70)
    assert.match(overflow.stderr, /GOVERNANCE_INTEGRITY:.*stdout exceeds 128 bytes/)

    configure({
      descriptors: [integrityDescriptor],
      dispatcherOptions: { childTimeoutMs: 50 },
    })
    const timeout = run({ payload: { tool_name: 'Read' }, env: { MANAGED_HOOK_MODE: 'sleep' } })
    assert.equal(timeout.status, 70)
    assert.match(timeout.stderr, /GOVERNANCE_INTEGRITY:.*timed out after 50ms/)

    configure({
      descriptors: [integrityDescriptor],
      dispatcherOptions: { maxInputBytes: 128 },
    })
    const tooLarge = run({ payload: { tool_name: 'Read', content: 'x'.repeat(512) } })
    assert.equal(tooLarge.status, 70)
    assert.match(tooLarge.stderr, /GOVERNANCE_INTEGRITY:.*input exceeds 128 bytes/)
    const invalidInput = run({ input: Buffer.from([0xc3, 0x28]) })
    assert.equal(invalidInput.status, 70)
    assert.match(invalidInput.stderr, /GOVERNANCE_INTEGRITY:.*strict UTF-8/)

    configure({ descriptors: [integrityDescriptor] })
    const badEvent = run({ event: 'Unknown', payload: {} })
    assert.equal(badEvent.status, 70)
    assert.match(badEvent.stderr, /GOVERNANCE_INTEGRITY:.*event is invalid/)
    configure({
      descriptors: [{
        ...integrityDescriptor,
        outputMode: 'untrusted-open-mode',
      }],
    })
    const malformedDescriptor = run({ payload: { tool_name: 'Read' } })
    assert.equal(malformedDescriptor.status, 70)
    assert.match(malformedDescriptor.stderr, /GOVERNANCE_INTEGRITY:.*unsupported outputMode/)

    configure({
      descriptors: [descriptor({
        file: 'orphan-tree.sh',
        matcher: 'Read',
        runtime: 'bash',
      })],
    })
    const orphanLog = resolve(root, 'managed-orphan.pid')
    const orphan = run({
      payload: { tool_name: 'Read' },
      env: { MANAGED_ORPHAN_PID_LOG: orphanLog },
    })
    assert.equal(orphan.status, 0, orphan.stderr)
    await waitForFixtureProcessExit(Number(readFileSync(orphanLog, 'utf8').trim()))

    configure({
      descriptors: [descriptor({
        file: 'signal-tree.sh',
        matcher: 'Read',
        runtime: 'bash',
      })],
    })
    const signalReady = resolve(root, 'managed-signal-ready.log')
    const signaled = startAsync({
      payload: { tool_name: 'Read' },
      env: { MANAGED_SIGNAL_READY_LOG: signalReady },
    })
    const [signalSnapshot, signalDescendantText] =
      (await waitForFixtureText(signalReady)).trim().split('\n')
    const signalDescendant = Number(signalDescendantText)
    signaled.child.kill('SIGTERM')
    const signalCompletion = await signaled.completion
    assert.equal(signalCompletion.status, 143, signalCompletion.stderr)
    assert.throws(() => lstatSync(signalSnapshot), /ENOENT/)
    await waitForFixtureProcessExit(signalDescendant)

    configure({
      descriptors: [descriptor({
        file: 'signal-tree.sh',
        matcher: 'Read',
        runtime: 'bash',
      })],
    })
    const deadlineReady = resolve(root, 'managed-deadline-ready.log')
    const deadline = startAsync({
      payload: { tool_name: 'Read' },
      env: {
        NODE_ENV: 'test',
        MANAGED_SIGNAL_READY_LOG: deadlineReady,
      },
      runtimeArgs: ['--test-short-batch-runtime'],
    })
    const [deadlineSnapshot, deadlineDescendantText] =
      (await waitForFixtureText(deadlineReady)).trim().split('\n')
    const deadlineDescendant = Number(deadlineDescendantText)
    const deadlineCompletion = await deadline.completion
    assert.equal(deadlineCompletion.status, 70, deadlineCompletion.stderr)
    assert.match(deadlineCompletion.stderr, /managed hook batch exceeded 750ms/)
    assert.throws(() => lstatSync(deadlineSnapshot), /ENOENT/)
    await waitForFixtureProcessExit(deadlineDescendant)

    configure({ descriptors: [integrityDescriptor] })
    const transportPath = resolve(fork, 'launchers/provider-hook-output-transport.mjs')
    const transportBody = readFileSync(transportPath)
    rmSync(transportPath)
    const missingRuntime = run({ payload: { tool_name: 'Read' } })
    assert.equal(missingRuntime.status, 70)
    assert.match(missingRuntime.stderr, /GOVERNANCE_INTEGRITY:.*(?:runtime import failed|corpus entry .* cannot be inspected)/)
    writeFileSync(transportPath, transportBody)

    const behaviorPath = resolve(hooksRoot, 'behavior.py')
    const behaviorBody = readFileSync(behaviorPath)
    rmSync(behaviorPath)
    symlinkSync(resolve(hooksRoot, 'policy.py'), behaviorPath)
    const symlinked = run({ payload: { tool_name: 'Read' } })
    assert.equal(symlinked.status, 70)
    assert.match(symlinked.stderr, /GOVERNANCE_INTEGRITY:.*symbolic link/)
    rmSync(behaviorPath)
    writeFileSync(behaviorPath, behaviorBody)
    chmodSync(behaviorPath, 0o755)

    configure({
      descriptors: [descriptor({
        file: 'race.sh',
        matcher: 'Read',
        runtime: 'bash',
        outputMode: 'blocking',
      })],
    })
    const raceTarget = resolve(hooksRoot, 'race.sh')
    const raceReplacement = resolve(hooksRoot, 'race-replacement.sh')
    writeFileSync(raceReplacement, '#!/bin/sh\nexit 0\n')
    chmodSync(raceReplacement, 0o755)
    const raced = run({
      payload: { tool_name: 'Read' },
      env: {
        MANAGED_RACE_TARGET: raceTarget,
        MANAGED_RACE_REPLACEMENT: raceReplacement,
      },
    })
    assert.equal(raced.status, 0, raced.stderr)
    assert.equal(readFileSync(raceTarget, 'utf8'), '#!/bin/sh\nexit 0\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('future providers cannot silently inherit an existing managed adapter', () => {
  const current = models()
  current.compatibility.providers['future-model'] = structuredClone(current.compatibility.providers.codex)
  assert.throws(() => validateManagedHostAssuranceModel({ desired: current.desired, compatibility: current.compatibility, contract: current.contract, repoRoot: REPO_ROOT }), /not exhaustive; onboard or explicitly exclude every provider/)
  const spoofed = models()
  spoofed.desired.providers.find(item => item.id === 'codex').adapter = 'claude-managed-settings-v2'
  assert.throws(() => validateManagedHostAssuranceModel({ desired: spoofed.desired, compatibility: spoofed.compatibility, contract: spoofed.contract, repoRoot: REPO_ROOT }), /provider adapter is unknown/)
  const missingSandboxControl = models()
  const claudeControls = missingSandboxControl.desired.providers.find(item => item.id === 'claude-code').enforcementControls
  claudeControls.splice(claudeControls.indexOf('strict-bash-sandbox'), 1)
  assert.throws(
    () => validateManagedHostAssuranceModel({
      desired: missingSandboxControl.desired,
      compatibility: missingSandboxControl.compatibility,
      contract: missingSandboxControl.contract,
      repoRoot: REPO_ROOT,
    }),
    /omits the fail-closed Bash sandbox control/,
  )
  const legacyDispatcher = models()
  legacyDispatcher.contract.entrypoint.protocol = 'qijenchen-codex-managed-dispatcher-v1'
  assert.throws(
    () => validateManagedHostAssuranceModel({ desired: legacyDispatcher.desired, compatibility: legacyDispatcher.compatibility, contract: legacyDispatcher.contract, repoRoot: REPO_ROOT }),
    /execution\/verification contract is incomplete/,
  )
  const conflatedExit = models()
  conflatedExit.contract.entrypoint.integrityExitCode = 2
  assert.throws(
    () => validateManagedHostAssuranceModel({ desired: conflatedExit.desired, compatibility: conflatedExit.compatibility, contract: conflatedExit.contract, repoRoot: REPO_ROOT }),
    /execution\/verification contract is incomplete/,
  )
})

test('templates bind exact release tags, absolute runtimes, first-launch bootstrap, and narrow claims', () => {
  const current = models({ candidate: true })
  const release = resolveManagedHostRelease(current.desired, current.rings)
  const hostRoot = mkdtempSync(resolve(tmpdir(), 'managed-template-runtime-'))
  try {
    const runtime = createRuntime(hostRoot)
    const claudeProvider = current.desired.providers.find(item => item.id === 'claude-code')
    const codexProvider = current.desired.providers.find(item => item.id === 'codex')
    const claude = materializeManagedHostPolicy({ provider: claudeProvider, release, compatibility: current.compatibility, repoRoot: REPO_ROOT, platform: 'darwin' }).value
    const codex = materializeManagedHostPolicy({ provider: codexProvider, release, compatibility: current.compatibility, repoRoot: REPO_ROOT, platform: 'darwin', runtime }).value
    const permissionPolicy = readClaudePermissionPolicy({ sourceRoot: REPO_ROOT })
    assert.equal(claude.requiredMinimumVersion, current.compatibility.providers['claude-code'].minimumVersion)
    assert.equal(claude.strictKnownMarketplaces[0].ref, `v${VERSION}`)
    assert.equal(claude.extraKnownMarketplaces['qijenchen-ds'].source.ref, `v${VERSION}`)
    assert.equal(claude.enabledPlugins['design-system@qijenchen-ds'], true)
    assert.equal(Object.hasOwn(claude, 'permissionPolicy'), false)
    assert.deepEqual(claude.permissions.ask, permissionPolicy.permissions.ask)
    assert.equal(claude.permissions.disableBypassPermissionsMode, 'disable')
    assert.equal(Object.hasOwn(claude.permissions, 'disableAutoMode'), false)
    assert.equal(Object.hasOwn(claude, 'defaultMode'), false)
    assert.equal(Object.hasOwn(claude, 'disableAutoMode'), false)
    assert.deepEqual(claude.permissions.allow, ['Edit'])
    assert.equal(claude.permissions.defaultMode, 'acceptEdits')
    assert.ok(claude.permissions.deny.includes('Bash(git reset *)'))
    assert.ok(claude.permissions.deny.includes('Bash(npm unpublish *)'))
    assert.ok(claude.permissions.deny.includes('Bash(*--dangerously-skip-permissions*)'))
    for (const rule of ['Read(./.env)', 'Read(./secrets/**)', 'Read(~/.npmrc)', 'Read(~/.ssh/**)']) {
      assert.ok(claude.permissions.deny.includes(rule), `${rule} is not protected by the managed Claude policy`)
    }
    assert.equal(claude.sandbox.enabled, true)
    assert.equal(claude.sandbox.failIfUnavailable, true)
    assert.equal(claude.sandbox.autoAllowBashIfSandboxed, true)
    assert.equal(claude.sandbox.allowUnsandboxedCommands, false)
    assert.deepEqual(claude.sandbox.network.allowedDomains, [])
    assert.equal(claude.sandbox.network.allowManagedDomainsOnly, true)
    assert.deepEqual(claude.sandbox.network.allowUnixSockets, [])
    assert.equal(claude.sandbox.network.allowAllUnixSockets, false)
    assert.equal(claude.sandbox.enableWeakerNestedSandbox, true)
    assert.equal(claude.sandbox.enableWeakerNetworkIsolation, false)
    assert.equal(claude.sandbox.allowAppleEvents, false)
    assert.deepEqual(claude.sandbox.excludedCommands, [])
    for (const name of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
      assert.deepEqual(claude.sandbox.credentials.envVars.find(record => record.name === name), { name, mode: 'deny' })
    }
    assert.match(codex, /allow_managed_hooks_only = true/)
    assert.match(codex, /allowed_approval_policies = \["never", "on-request"\]/)
    assert.doesNotMatch(codex, /allowed_approval_policies = \[[^\]]*"untrusted"/)
    assert.equal(assertCodexManagedEngineeringDelegationPolicy(codex), true)
    assert.match(codex, /plugins = false\nremote_plugin = false/)
    assert.match(codex, new RegExp(`ref = "v${VERSION.replace(/[.\\]/g, '\\$&')}"`))
    assert.match(codex, /\/opt\/qijenchen\/runtime\/node/)
    assert.match(codex, /--shell \/opt\/qijenchen\/runtime\/sh --python \/opt\/qijenchen\/runtime\/python3/)
    assert.doesNotMatch(`${JSON.stringify(claude)}${codex}`, /__[_A-Z0-9]+__/)
    const codexControls = buildExpectedManagedHostControls({
      provider: codexProvider,
      release,
      compatibility: current.compatibility,
      contract: current.contract,
      platform: 'darwin',
      runtime,
    })
    assert.deepEqual(codexControls['approval-policy-allowlist'], ['never', 'on-request'])
    assert.deepEqual(codexControls['permission-profile-allowlist'], {
      default: ':workspace',
      allowed: { ':read-only': true, ':workspace': true },
    })
    const claudeControls = buildExpectedManagedHostControls({
      provider: claudeProvider,
      release,
      compatibility: current.compatibility,
      contract: current.contract,
      platform: 'darwin',
      repoRoot: REPO_ROOT,
    })
    assert.deepEqual(claudeControls['strict-bash-sandbox'], claude.sandbox)
    for (const [label, poison, pattern] of [
      [
        'missing non-interactive approval',
        codex.replace('allowed_approval_policies = ["never", "on-request"]', 'allowed_approval_policies = ["on-request"]'),
        /lacks exact governed authority binding/,
      ],
      [
        'untrusted approval fallback',
        codex.replace('allowed_approval_policies = ["never", "on-request"]', 'allowed_approval_policies = ["never", "on-request", "untrusted"]'),
        /lacks exact governed authority binding|weakens sandbox/,
      ],
      [
        'over-privileged sandbox',
        codex.replace('default_permissions = ":workspace"', 'default_permissions = "danger-full-access"'),
        /lacks exact governed authority binding/,
      ],
      [
        'disabled managed hooks',
        codex.replace('hooks = true', 'hooks = false'),
        /does not bind managed hooks/,
      ],
      [
        'unmanaged MCP surface',
        codex.replace('[mcp_servers]\n', '[mcp_servers]\nattacker = "enabled"\n'),
        /unmanaged MCP execution surface/,
      ],
    ]) assert.throws(
      () => assertCodexManagedEngineeringDelegationPolicy(poison, { label }),
      pattern,
      label,
    )
    assert.equal(current.desired.scope.managedHostExclusive.coveredControlBoundary, 'only-enforcementControls-listed-per-provider')
    assert.equal(current.desired.activationProtocol.firstLaunchBootstrapRequired, true)
    assert.deepEqual(codexProvider.effectiveState.sourceCapabilities['configRequirements/read'], [])
  } finally {
    rmSync(hostRoot, { recursive: true, force: true })
  }
})

test('CLI certified gate requires persistent replay state and differs from aligned gate', () => {
  const cli = resolve(GOVERNANCE_ROOT, 'bin/verify-managed-host-assurance.mjs')
  const result = spawnSync(process.execPath, ['--', cli, '--require-certified'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /requires a persistent replay cache/)

  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), 'managed-host-replay-')))
  const cache = resolve(directory, 'replay.json')
  try {
    const initialized = spawnSync(process.execPath, ['--', cli, '--replay-cache', cache], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(initialized.status, 0, initialized.stderr)
    assert.deepEqual(JSON.parse(readFileSync(cache, 'utf8')), { schemaVersion: 1, entries: [] })
    assert.equal(lstatSync(cache).mode & 0o077, 0)

    mkdirSync(`${cache}.lock`, { mode: 0o700 })
    const concurrent = spawnSync(process.execPath, ['--', cli, '--replay-cache', cache], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(concurrent.status, 2)
    assert.match(concurrent.stderr, /already locked; concurrent certification fails closed/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('every managed-host semantic input remains canonical-manifest bound and privileged-protected', () => {
  const manifest = readJson(resolve(REPO_ROOT, 'packages/governance/canonical/manifest.json'))
  const privileged = readJson(resolve(GOVERNANCE_ROOT, 'privileged-trust-roots.json'))
  const sourcePaths = manifest.sources.map(item => item.path)
  const semanticPaths = [
    'infra/governance/providers/managed-host-assurance.json',
    'infra/governance/schemas/managed-host-assurance.schema.json',
    'infra/governance/schemas/managed-host-assurance-evidence.schema.json',
    'infra/governance/schemas/managed-host-effective-readback.schema.json',
    'infra/governance/schemas/codex-managed-hook-bundle.schema.json',
    'infra/governance/managed-host/templates/claude-managed-settings.json',
    'infra/governance/managed-host/templates/codex-requirements.unix.toml',
    'infra/governance/managed-host/templates/codex-requirements.windows.toml',
    'infra/governance/managed-host/codex-hook-bundle-contract.json',
    'infra/governance/lib/managed-host-assurance.mjs',
    'infra/governance/bin/verify-managed-host-assurance.mjs',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
  ]
  for (const path of semanticPaths) {
    assert.ok(sourcePaths.some(source => source.endsWith('/') ? path.startsWith(source) : path === source), `managed-host semantic source is absent from canonical manifest:${path}`)
    assert.ok(privileged.protectedPaths.includes(path) || privileged.protectedPrefixes.some(prefix => path.startsWith(prefix)), `managed-host semantic source is absent from privileged closure:${path}`)
  }
})
