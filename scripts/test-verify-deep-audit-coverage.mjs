#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDeepAuditEvidenceEnvelope,
  deepAuditProviderIdentityDigest,
  deepAuditEvidenceContract,
  digestInventoryRows,
  digestSandboxVerification,
  loadActiveDeepAuditRun,
  prepareDeepAuditRun,
  sha256,
  stableStringify,
  validateDeepAuditRunManifest,
  validateDeepAuditRunProviderBindings,
  validateDeepAuditEvidenceEnvelope,
  writeDeepAuditEvidenceEnvelope,
  writeDeepAuditEvidenceEnvelopeBatch,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  hookDimensionNumbers,
  summarizeDeepAuditCompliance,
  verifyDeepAuditCoverage,
} from './verify-deep-audit-coverage.mjs'
import { loadHookEvidencePlan } from './lib/hook-evidence-plan.mjs'

const fixture = mkdtempSync(join(tmpdir(), 'deep-audit-contract-'))
const ambientToolFixture = mkdtempSync(join(realpathSync(tmpdir()), 'deep-audit-ambient-tool-'))
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const realHookPlan = loadHookEvidencePlan({ repoRoot: repositoryRoot })
assert.deepEqual(hookDimensionNumbers(realHookPlan), [
  1, 4, 11, 13, 18, 21, 29, 30, 31, 34, 35, 37, 39, 47, 52, 53, 54, 56, 57, 58,
  59, 60, 61, 63, 65, 67, 69, 70, 71, 73, 74, 75, 76, 78, 79, 80, 81, 82, 89,
])
assert.equal(realHookPlan.hookDimensions.every((record) => record && typeof record === 'object' && Number.isInteger(record.dim)), true)

function write(path, value = '{}\n') {
  const target = resolve(fixture, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
}

function git(...args) {
  return execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).trim()
}

function throwsBlocked(fn, pattern) {
  assert.throws(fn, pattern)
}

function command(now = '2026-07-21T00:00:00.000Z') {
  return {
    argv: ['node', 'scripts/test-fixture.mjs'],
    cwd: '.',
    exitCode: 0,
    startedAt: now,
    finishedAt: now,
  }
}

function sandboxReceipt(manifest) {
  const manifestDigest = digestSandboxVerification(manifest)
  const callerDigest = sha256('unchanged caller repository')
  const dependencyDigest = sha256('unchanged disposable dependency view')
  const lockfile = manifest.inventory.find((row) => row.path === 'package-lock.json' && row.kind === 'file')
  return {
    materialization: 'inode-independent-copy-on-write-or-byte-copy',
    manifestVerificationBeforeDigest: manifestDigest,
    manifestVerificationAfterDigest: manifestDigest,
    callerFingerprintBeforeDigest: callerDigest,
    callerFingerprintAfterDigest: callerDigest,
    dependencyViewBeforeDigest: dependencyDigest,
    dependencyViewAfterDigest: dependencyDigest,
    dependencyLockfileSha256: lockfile.sha256,
    installedLockfileSha256: sha256('fixture hidden npm lockfile'),
    installedDependencyIdentityDigest: sha256('fixture installed dependency identity'),
    dependencyProvenance: 'caller-node-modules-copy',
    dependencyTrust: 'untrusted-local-copy',
    executionIsolation: 'disposable-repository-copy',
    containmentBackend: 'none',
    externalWriteContainment: 'unverified',
    cleanup: true,
  }
}

function deterministicPayload(dim, manifest) {
  const now = '2026-07-21T00:00:00.000Z'
  return {
    dim,
    name: `fixture-dim-${dim}`,
    planDigest: sha256('fixture-plan'),
    capabilities: ['local'],
    commandIds: [`fixture-${dim}`],
    commands: [{
      argv: ['node', 'scripts/test-fixture.mjs'],
      exitCode: 0,
      startedAt: now,
      finishedAt: now,
      stdoutSha256: sha256('fixture stdout'),
      stderrSha256: sha256(''),
      stdoutTail: 'fixture complete',
      stderrTail: '',
      generatedOutputReceipt: {
        declaredRoots: [],
        beforeDigest: sha256('fixture generated outputs'),
        afterDigest: sha256('fixture generated outputs'),
        changedPaths: [],
      },
    }],
    findings: [],
    summary: `fixture dimension ${dim} completed`,
    sandboxReceipt: sandboxReceipt(manifest),
  }
}

function modelTransport(coverageDigest) {
  return {
    promptSha256: sha256('prompt'),
    promptBytes: 6,
    responseSha256: sha256('response'),
    responseBytes: 8,
    providerRunId: 'provider-run-fixture',
    sessionId: 'provider-session-fixture',
    coverageInventoryDigest: coverageDigest,
  }
}

try {
  execFileSync('git', ['init', '-q', fixture])
  git('config', 'user.name', 'Deep Audit Fixture')
  git('config', 'user.email', 'deep-audit@example.invalid')
  write('package.json', '{"scripts":{}}\n')
  write('package-lock.json', `${JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: { npm: '11.18.0' } },
      'node_modules/npm': {
        version: '11.18.0',
        resolved: 'https://registry.npmjs.org/npm/-/npm-11.18.0.tgz',
        integrity: 'sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w==',
        bin: { npm: 'bin/npm-cli.js', npx: 'bin/npx-cli.js' },
      },
    },
  })}\n`)

  const matrix = ['export const COVERAGE = {']
  for (let dim = 1; dim <= 91; dim += 1) matrix.push(`  ${dim}: { tier: 'DETERMINISTIC' },`)
  matrix.push('}', '')
  write('scripts/audit-coverage-matrix.mjs', matrix.join('\n'))

  const stage = (id, auditScope = 'none', sourceResolvers = []) => ({
    id,
    auditScope,
    generate: ['node', 'noop.mjs'],
    check: ['node', 'noop.mjs'],
    runtimeEntrypoints: [],
    sources: id === 'audit-rubric' ? ['scripts/audit-coverage-matrix.mjs'] : [],
    sourceResolvers,
    sourceExcludes: [],
    outputs: [],
    outputResolvers: [],
    sourceOutputOverlaps: [],
  })
  write('scripts/governance-build-graph.json', `${JSON.stringify({
    $schema: './schemas/governance-build-graph.schema.json',
    schemaVersion: 5,
    stages: [
      stage('audit-rubric', 'deep-audit-rubric', ['governance-manifest']),
      stage('fixture-two'), stage('fixture-three'), stage('fixture-four'), stage('fixture-five'), stage('fixture-six'),
    ],
  }, null, 2)}\n`)
  write('.husky/pre-commit', '#!/bin/sh\n')
  write('scripts/governance-build-graph.mjs', '// fixture global build-graph input\n')
  write('scripts/test-governance-build-graph.mjs', '// fixture global build-graph test input\n')
  write('scripts/schemas/governance-build-graph.schema.json', readFileSync(resolve(repositoryRoot, 'scripts/schemas/governance-build-graph.schema.json'), 'utf8'))
  write('packages/governance/canonical/schemas/manifest.schema.json', readFileSync(resolve(repositoryRoot, 'packages/governance/canonical/schemas/manifest.schema.json'), 'utf8'))
  write('packages/governance/canonical/manifest.json', `${JSON.stringify({
    $schema: './schemas/manifest.schema.json',
    schemaVersion: 3,
    id: 'deep-audit-fixture',
    defaultRole: 'fixture',
    outputDirectory: 'governance/generated',
    lockFile: 'governance/control-plane.lock.json',
    registries: { rules: './rules.json', roles: './roles.json', providers: './providers.json', gates: './gates.json' },
    artifactSchemas: {
      diagnostic: './schemas/diagnostic.schema.json', lock: './schemas/lock.schema.json',
      attestation: './schemas/attestation.schema.json', upgradePlan: './schemas/upgrade-plan.schema.json',
    },
    skillParityContracts: [{
      id: 'fixture-skills', sourceDirectory: 'packages/design-system/ds-canonical/skills',
      targetSelection: 'all-generated-skill-views', compare: 'content-and-mode', required: true,
    }],
    sources: [
      { id: 'fixture-rules', ownerRepo: 'fixture', path: 'packages/design-system/ds-canonical/rules', required: true },
      { id: 'dynamic-rubric', ownerRepo: 'fixture', path: 'docs/dynamic-rubric.md', required: true },
    ],
  }, null, 2)}\n`)
  for (const path of [
    'packages/governance/canonical/rules.json',
    'packages/governance/canonical/roles.json',
    'packages/governance/canonical/gates.json',
    'packages/governance/canonical/schemas/diagnostic.schema.json',
    'packages/governance/canonical/schemas/lock.schema.json',
    'packages/governance/canonical/schemas/attestation.schema.json',
    'packages/governance/canonical/schemas/upgrade-plan.schema.json',
  ]) write(path, '{}\n')
  for (const path of [
    'scripts/schemas/deep-audit-evidence-contract.schema.json',
    'scripts/schemas/managed-ci-sandbox-receipt.schema.json',
    'scripts/schemas/ci-evidence-observation.schema.json',
  ]) write(path, readFileSync(resolve(repositoryRoot, path), 'utf8'))
  write('packages/design-system/ds-canonical/rules/fixture.md', '# fixture rule\n')
  write('packages/design-system/ds-canonical/skills/fixture/SKILL.md', '# fixture skill\n')
  write('docs/dynamic-rubric.md', '# manifest-resolved rubric\n')
  write('docs/retired-rubric.md', '# removed rubric input\n')
  write('packages/design-system/src/components/Button/button.tsx', 'export const Button = 1\n')
  write('packages/design-system/src/components/alpha/alpha.tsx', 'export const alpha = 1\n')
  write('packages/design-system/src/components/Retired/retired.tsx', 'export const Retired = 1\n')
  write('scripts/test-fixture.mjs', 'process.stdout.write("fixture complete\\n")\n')
  // The build-graph loader validates the same closed provider registry contract as production.
  // Copy the canonical registry + schema instead of maintaining a stale, permissive mini-shape.
  write('packages/governance/canonical/providers.json', readFileSync(resolve(repositoryRoot, 'packages/governance/canonical/providers.json'), 'utf8'))
  write('packages/governance/canonical/schemas/providers.schema.json', readFileSync(resolve(repositoryRoot, 'packages/governance/canonical/schemas/providers.schema.json'), 'utf8'))
  const reviewCapabilityRegistry = JSON.parse(readFileSync(resolve(repositoryRoot, 'infra/governance/providers/review-capability-registry.json'), 'utf8'))
  const codexReviewProfile = reviewCapabilityRegistry.reviewProfiles.find((profile) => profile.id === 'codex-managed-api-sol')
  write('infra/governance/providers/review-capability-registry.json', `${JSON.stringify(reviewCapabilityRegistry, null, 2)}\n`)
  write('infra/governance/providers/review-capability-certifications.json', `${JSON.stringify({
    schemaVersion: 1,
    kind: 'review-capability-certification-ledger',
    certifications: [{
      id: 'fixture-codex-sol-v1',
      reviewProfileId: codexReviewProfile.id,
      reviewProfileDigest: sha256(stableStringify(codexReviewProfile)),
      providerId: codexReviewProfile.providerId,
      modelReleaseId: codexReviewProfile.modelReleaseId,
      entitlementId: null,
      status: 'certified',
      assuranceTier: 'maximum',
      reasoningTier: 'maximum',
      computeTier: 'maximum',
      certifiedAt: '2026-07-20T00:00:00.000Z',
      expiresAt: '2026-08-20T00:00:00.000Z',
      evidence: {
        reference: 'fixture/codex-sol-capability.json',
        sha256: sha256('fixture codex sol capability evidence'),
      },
    }],
  }, null, 2)}\n`)
  for (const path of [
    'infra/governance/providers/model-invocation-profiles.json',
    'infra/governance/providers/model-release-registry.json',
  ]) write(path, readFileSync(resolve(repositoryRoot, path), 'utf8'))
  write('infra/governance/providers/compatibility-matrix.json', readFileSync(resolve(repositoryRoot, 'infra/governance/providers/compatibility-matrix.json'), 'utf8'))
  write('infra/governance/providers/runtime-conformance.json', readFileSync(resolve(repositoryRoot, 'infra/governance/providers/runtime-conformance.json'), 'utf8'))
  write('infra/governance/inventory/managed-repos.json', readFileSync(resolve(repositoryRoot, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  write('infra/governance/desired/github.json', readFileSync(resolve(repositoryRoot, 'infra/governance/desired/github.json'), 'utf8'))
  write('infra/governance/providers/role-surface-policy.json', readFileSync(resolve(repositoryRoot, 'infra/governance/providers/role-surface-policy.json'), 'utf8'))
  write('infra/governance/trust/issuers.json', readFileSync(resolve(repositoryRoot, 'infra/governance/trust/issuers.json'), 'utf8'))
  write('infra/governance/providers/certifications.json', '{"certifications":[]}\n')
  git('add', '.')
  git('commit', '-qm', 'fixture')
  unlinkSync(resolve(fixture, 'docs/retired-rubric.md'))
  unlinkSync(resolve(fixture, 'packages/design-system/src/components/Retired/retired.tsx'))

  const graphPath = resolve(fixture, 'scripts/governance-build-graph.json')
  const graphDocument = JSON.parse(readFileSync(graphPath, 'utf8'))
  const poisonGraph = (mutate, pattern) => {
    const poisoned = structuredClone(graphDocument)
    mutate(poisoned)
    writeFileSync(graphPath, `${JSON.stringify(poisoned, null, 2)}\n`)
    try {
      throwsBlocked(() => prepareDeepAuditRun({
        repoRoot: fixture,
        selfProvider: 'claude',
        peerProvider: 'codex',
        selfSurface: 'local',
        peerSurface: 'local',
      }), pattern)
    } finally {
      writeFileSync(graphPath, `${JSON.stringify(graphDocument, null, 2)}\n`)
    }
  }
  poisonGraph(
    graph => { for (const item of graph.stages) item.auditScope = 'none' },
    /governance build graph schema failure/,
  )
  poisonGraph(
    graph => { graph.stages[1].auditScope = 'deep-audit-rubric' },
    /governance build graph schema failure/,
  )
  poisonGraph(
    graph => { graph.stages[0].sourceResolvers = [] },
    /deep-audit rubric self-guard is missing or unsafe:packages\/governance\/canonical\/manifest.json/,
  )
  const unsafeComponentLink = resolve(fixture, 'packages/design-system/src/components/Linked/linked.tsx')
  mkdirSync(dirname(unsafeComponentLink), { recursive: true })
  symlinkSync('../../../Button/button.tsx', unsafeComponentLink)
  try {
    throwsBlocked(() => prepareDeepAuditRun({
      repoRoot: fixture,
      selfProvider: 'claude',
      peerProvider: 'codex',
      selfSurface: 'local',
      peerSurface: 'local',
    }), /component inventory contains unsafe source/)
  } finally {
    unlinkSync(unsafeComponentLink)
  }
  console.log('✓ deep-audit rubric scope cardinality and graph/manifest self-guards fail closed')

  throwsBlocked(
    () => prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'claude', peerProvider: 'codex' }),
    /self runtime surface must be explicit/,
  )
  throwsBlocked(
    () => prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'claude', peerProvider: 'codex', selfSurface: 'local' }),
    /peer runtime surface must be explicit/,
  )

  const first = prepareDeepAuditRun({
    repoRoot: fixture,
    selfProvider: 'claude',
    peerProvider: 'codex',
    selfSurface: 'local',
    peerSurface: 'local',
  })
  assert.equal(first.repository, realpathSync(fixture))
  assert.equal(first.manifest.head, git('rev-parse', 'HEAD'))
  assert.equal(first.manifest.tree, git('rev-parse', 'HEAD^{tree}'))
  assert.equal(first.manifest.providers.self.runtimeCertification, null)
  assert.equal(first.manifest.providers.peer.runtimeCertification, null)
  assert.equal(first.manifest.providers.self.runtimeSurface, 'local')
  assert.equal(first.manifest.providers.self.runtimeProfileId, 'claude')
  assert.equal(first.manifest.providers.peer.runtimeSurface, 'local')
  assert.equal(first.manifest.providers.peer.runtimeProfileId, 'codex')
  assert.equal(first.manifest.authorProvider, 'claude')
  assert.equal(first.manifest.providerIdentityDigest, deepAuditProviderIdentityDigest({
    authorProvider: first.manifest.authorProvider,
    providers: first.manifest.providers,
    reviewSelection: first.manifest.reviewSelection,
  }))
  const listed = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean).sort()
  assert.deepEqual(first.manifest.inventory.map((row) => row.path), listed)
  assert(first.manifest.inventory.some((row) => row.path === 'package-lock.json'))
  assert(first.manifest.rubricPaths.includes('docs/dynamic-rubric.md'))
  assert(!first.manifest.rubricPaths.includes('docs/retired-rubric.md'))
  assert(first.manifest.rubricPaths.includes('packages/design-system/ds-canonical/rules/fixture.md'))
  assert(!first.manifest.rubricPaths.includes('package-lock.json'))
  assert.equal(first.manifest.inventory.find((row) => row.path === 'docs/retired-rubric.md')?.kind, 'missing')
  assert.deepEqual(first.manifest.components.map((component) => component.name), ['Button', 'alpha'])
  assert.equal(first.manifest.inventory.find((row) => row.path === 'packages/design-system/src/components/Retired/retired.tsx')?.kind, 'missing')
  const omittedComponent = structuredClone(first.manifest)
  omittedComponent.components = omittedComponent.components.slice(0, 1)
  throwsBlocked(() => validateDeepAuditRunManifest(omittedComponent), /do not exactly partition/)
  const crossComponent = structuredClone(first.manifest)
  crossComponent.components[1].paths = [...crossComponent.components[0].paths]
  crossComponent.components[1].digest = crossComponent.components[0].digest
  throwsBlocked(() => validateDeepAuditRunManifest(crossComponent), /not an exact regular member/)
  assert.equal(loadActiveDeepAuditRun({ repoRoot: fixture }).manifest.runId, first.manifest.runId)
  console.log('✓ prepare freezes exact HEAD/tree/index/full inventory/rubric and permits null certifications for mechanical stages')

  throwsBlocked(
    () => prepareDeepAuditRun({
      repoRoot: fixture,
      selfProvider: 'claude',
      peerProvider: 'codex',
      selfSurface: 'local',
      peerSurface: 'local',
      authorProvider: 'codex',
      replaceActive: true,
    }),
    /REVIEW_AUTHOR_COLLISION/,
  )
  const authorCollision = structuredClone(first.manifest)
  authorCollision.authorProvider = 'codex'
  authorCollision.providerIdentityDigest = deepAuditProviderIdentityDigest({
    authorProvider: authorCollision.authorProvider,
    providers: authorCollision.providers,
    reviewSelection: authorCollision.reviewSelection,
  })
  throwsBlocked(() => validateDeepAuditRunManifest(authorCollision), /authorProvider must equal providers\.self\.id|peer provider must differ from authorProvider/)
  const identityDigestPoison = structuredClone(first.manifest)
  identityDigestPoison.providerIdentityDigest = sha256('forged author/provider binding')
  throwsBlocked(() => validateDeepAuditRunManifest(identityDigestPoison), /providerIdentityDigest mismatches/)
  const legacyManifest = structuredClone(first.manifest)
  legacyManifest.schemaVersion = 2
  throwsBlocked(() => validateDeepAuditRunManifest(legacyManifest), /run manifest identity is invalid/)
  const missingSurfaceManifest = structuredClone(first.manifest)
  delete missingSurfaceManifest.providers.peer.runtimeSurface
  throwsBlocked(() => validateDeepAuditRunManifest(missingSurfaceManifest), /invalid or open shape/)
  console.log('✓ author identity is manifest-bound; author=peer and forged provider-identity digests fail closed')

  throwsBlocked(
    () => prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'claude', peerProvider: 'codex', selfSurface: 'local', peerSurface: 'local' }),
    /active deep-audit run already exists/,
  )
  assert.equal(readdirSync(resolve(first.runRoot, '..')).length, 1)
  throwsBlocked(
    () => prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'unknown', peerProvider: 'codex', selfSurface: 'local', peerSurface: 'local', replaceActive: true }),
    /not a registered concrete runtime/,
  )
  console.log('✓ active run is exclusive and unknown providers fail closed')

  const coveragePaths = ['packages/design-system/src/components/Button/button.tsx']
  const active = loadActiveDeepAuditRun({ repoRoot: fixture })
  const ambientBin = ambientToolFixture
  const ambientNpm = resolve(ambientBin, 'npm')
  writeFileSync(ambientNpm, '#!/bin/sh\nprintf poison > \"$0.marker\"\nexit 99\n', { mode: 0o755 })
  const previousPath = process.env.PATH
  let envelope
  try {
    process.env.PATH = `${ambientBin}:${previousPath ?? ''}`
    envelope = buildDeepAuditEvidenceEnvelope({
      activeRun: active,
      evidenceKind: 'deep-audit-deterministic',
      producer: deepAuditEvidenceContract.genericProducer,
      command: command(),
      coveragePaths,
      payload: deterministicPayload(1, active.manifest),
    })
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
  }
  assert.equal(existsSync(`${ambientNpm}.marker`), false, 'ambient npm must not participate in evidence identity')
  assert.equal(envelope.environment.npmVersion, '11.18.0')
  assert.equal(validateDeepAuditEvidenceEnvelope(envelope, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    requireCurrentEnvironment: true,
    repoRoot: fixture,
  }), true)
  throwsBlocked(() => validateDeepAuditEvidenceEnvelope(envelope, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
  }), /explicit repository root/)
  for (const poisoned of [
    { ...envelope, runId: '00000000-0000-4000-8000-000000000000' },
    { ...envelope, manifestSha256: sha256('other run') },
    { ...envelope, coverage: { ...envelope.coverage, inventoryDigest: sha256('fake coverage') } },
    { ...envelope, unexpected: true },
  ]) {
    throwsBlocked(() => validateDeepAuditEvidenceEnvelope(poisoned, {
      manifest: active.manifest,
      manifestSha256: active.manifestSha256,
      repoRoot: fixture,
    }), /deep-audit evidence blocked/)
  }
  const foreignRuntime = { ...envelope, environment: { ...envelope.environment, nodeVersion: 'v99.0.0' } }
  assert.equal(validateDeepAuditEvidenceEnvelope(foreignRuntime, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    repoRoot: fixture,
    requireCurrentEnvironment: false,
  }), true)
  throwsBlocked(() => validateDeepAuditEvidenceEnvelope(foreignRuntime, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    repoRoot: fixture,
    requireCurrentEnvironment: true,
  }), /producer\/write runtime/)
  console.log('✓ stale/mixed/open/fake coverage fails; portable verifier and write-time runtime checks are separated')

  const coverageDigest = envelope.coverage.inventoryDigest
  const sandboxDigest = sha256('unchanged isolated sandbox')
  const sandboxVerificationDigest = digestSandboxVerification(active.manifest)
  const cleanInvocation = {
    path: coveragePaths[0],
    hook: 'fixture-hook.sh',
    event: 'PostToolUse',
    tool: 'Edit',
    exitCode: 0,
    outcome: 'clean',
    stdoutBytes: 0,
    stdoutSha256: sha256(''),
    stderrBytes: 0,
    stderrSha256: sha256(''),
  }
  const hookEnvelope = buildDeepAuditEvidenceEnvelope({
    activeRun: active,
    evidenceKind: 'deep-audit-hook-residue',
    producer: deepAuditEvidenceContract.genericProducer,
    command: command(),
    coveragePaths,
    payload: {
      dim: 1,
      capability: 'fixture-hook-capability',
      enforcementSuiteReceipt: {
        planSha256: sha256('hook plan'),
        commandSha256: sha256('hook suite command'),
        stdoutSha256: sha256('hook suite stdout'),
        stderrSha256: sha256(''),
        sandboxBeforeSha256: sandboxDigest,
        sandboxAfterSha256: sandboxDigest,
        sandboxVerificationDigest,
        tests: [{ test: 'test_fixture_hook.sh', observed: true }],
        suitePassed: true,
      },
      replayReceipt: {
        planSha256: sha256('hook plan'),
        inventoryDigest: coverageDigest,
        filesScanned: 1,
        invocationCount: 1,
        warningCount: 0,
        blockingCount: 0,
        sandboxBeforeSha256: sandboxDigest,
        sandboxAfterSha256: sandboxDigest,
        sandboxVerificationDigest,
        findings: [],
        invocations: [cleanInvocation],
        focusedContracts: [],
        complete: true,
      },
      sandboxReceipt: sandboxReceipt(active.manifest),
    },
  })
  assert.equal(validateDeepAuditEvidenceEnvelope(hookEnvelope, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    repoRoot: fixture,
  }), true)
  const hiddenWarning = structuredClone(hookEnvelope)
  hiddenWarning.payload.replayReceipt.invocations[0].outcome = 'warning'
  hiddenWarning.payload.replayReceipt.warningCount = 1
  throwsBlocked(() => validateDeepAuditEvidenceEnvelope(hiddenWarning, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    repoRoot: fixture,
  }), /findings must match every non-clean invocation/)
  console.log('✓ hook receipts allow invocation-backed focused=[] but cannot hide warning/blocking findings or sandbox drift')

  throwsBlocked(() => buildDeepAuditEvidenceEnvelope({
    activeRun: active,
    evidenceKind: 'deep-audit-judgment',
    producer: deepAuditEvidenceContract.genericProducer,
    command: command(),
    coveragePaths,
    payload: { dim: 6, findings: [], transportReceipt: modelTransport(coverageDigest) },
  }), /generic producer is forbidden/)
  throwsBlocked(() => buildDeepAuditEvidenceEnvelope({
    activeRun: active,
    evidenceKind: 'deep-audit-component-a1b',
    producer: {
      providerId: 'claude',
      runtime: 'claude-code-cli',
      runtimeSurface: 'local',
      runtimeProfileId: 'claude',
      model: 'claude-fixture',
      transport: 'external-or-orchestrator',
      runtimeCertificationDigest: null,
    },
    command: command(),
    coveragePaths,
    payload: { component: 'Button', claimsVerified: 1, falseClaims: [], transportReceipt: modelTransport(coverageDigest) },
  }), /lacks runtime certification/)
  throwsBlocked(() => buildDeepAuditEvidenceEnvelope({
    activeRun: active,
    evidenceKind: 'deep-audit-component-a1b',
    producer: {
      providerId: 'claude',
      runtime: 'claude-code-cli',
      runtimeSurface: 'cloud',
      runtimeProfileId: 'claude-code-cloud',
      model: 'claude-fixture',
      transport: 'external-or-orchestrator',
      runtimeCertificationDigest: sha256('fixture certification'),
    },
    command: command(),
    coveragePaths,
    payload: { component: 'Button', claimsVerified: 1, falseClaims: [], transportReceipt: modelTransport(coverageDigest) },
  }), /runtime surface mismatches run manifest/)
  throwsBlocked(() => buildDeepAuditEvidenceEnvelope({
    activeRun: active,
    evidenceKind: 'deep-audit-ci-enforced',
    producer: deepAuditEvidenceContract.genericProducer,
    command: command(),
    coveragePaths,
    payload: { dim: 64, capability: 'fixture-ci', receipt: { status: 'verified', reference: 'fake', sha256: sha256('fake') } },
  }), /CI trust receipt.*invalid or open shape/)
  console.log('✓ judgment/A1b reject generic and uncertified concrete providers even with complete-looking JSON')

  const written = writeDeepAuditEvidenceEnvelope({ repoRoot: fixture, relativePath: 'deterministic/dim-1.json', envelope })
  assert(existsSync(written.path))
  throwsBlocked(
    () => writeDeepAuditEvidenceEnvelope({ repoRoot: fixture, relativePath: 'deterministic/dim-1.json', envelope }),
    /cannot be created exclusively/,
  )

  const second = prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'claude', peerProvider: 'codex', selfSurface: 'local', peerSurface: 'local', replaceActive: true })
  const activeSecond = loadActiveDeepAuditRun({ repoRoot: fixture })
  throwsBlocked(
    () => verifyDeepAuditCoverage({ repoRoot: fixture, authorProvider: 'codex' }),
    /--author-provider differs from the active run manifest/,
  )
  const batch = [1, 2].map((dim) => ({
    relativePath: `deterministic/dim-${dim}.json`,
    envelope: buildDeepAuditEvidenceEnvelope({
      activeRun: activeSecond,
      evidenceKind: 'deep-audit-deterministic',
      producer: deepAuditEvidenceContract.genericProducer,
      command: command(),
      coveragePaths,
      payload: deterministicPayload(dim, activeSecond.manifest),
    }),
  }))
  const published = writeDeepAuditEvidenceEnvelopeBatch({ repoRoot: fixture, items: batch })
  assert.equal(published.count, 2)
  throwsBlocked(() => writeDeepAuditEvidenceEnvelopeBatch({ repoRoot: fixture, items: batch }), /publish root already exists/)
  const originalDimOne = readFileSync(resolve(activeSecond.runRoot, 'deterministic/dim-1.json'))
  const appendItem = (dim) => ({
    relativePath: `deterministic/dim-${dim}.json`,
    envelope: buildDeepAuditEvidenceEnvelope({
      activeRun: activeSecond,
      evidenceKind: 'deep-audit-deterministic',
      producer: deepAuditEvidenceContract.genericProducer,
      command: command(),
      coveragePaths,
      payload: deterministicPayload(dim, activeSecond.manifest),
    }),
  })
  const appended = writeDeepAuditEvidenceEnvelopeBatch({
    repoRoot: fixture,
    items: [appendItem(3)],
    appendExistingCategory: true,
  })
  assert.equal(appended.count, 1)
  assert.deepEqual(readFileSync(resolve(activeSecond.runRoot, 'deterministic/dim-1.json')), originalDimOne)
  throwsBlocked(() => writeDeepAuditEvidenceEnvelopeBatch({
    repoRoot: fixture,
    items: [appendItem(2)],
    appendExistingCategory: true,
  }), /would overwrite existing evidence/)
  const transactionMarker = resolve(activeSecond.runRoot, 'deterministic/.append-transaction.json')
  writeFileSync(transactionMarker, '{}\n')
  try {
    throwsBlocked(() => writeDeepAuditEvidenceEnvelopeBatch({
      repoRoot: fixture,
      items: [appendItem(4)],
      appendExistingCategory: true,
    }), /incomplete append transaction/)
  } finally {
    unlinkSync(transactionMarker)
  }
  assert.notEqual(first.manifest.runId, second.manifest.runId)
  console.log('✓ exclusive writes plus transaction-guarded deterministic append prevent overwrite, mixed runs, and visible partial batches')

  const findingSummary = summarizeDeepAuditCompliance({
    totalGaps: 0,
    envelopes: [{
      evidenceKind: 'deep-audit-judgment',
      payload: {
        findings: [{ problem: 'complete-looking evidence still contains a material finding' }],
        accessReceipt: { status: 'verified' },
        sandboxReceipt: { dependencyTrust: 'trusted-attested', externalWriteContainment: 'verified' },
      },
    }],
  })
  assert.deepEqual({
    coverageStatus: findingSummary.coverageStatus,
    complianceStatus: findingSummary.complianceStatus,
    promotionEligible: findingSummary.promotionEligible,
    status: findingSummary.status,
  }, {
    coverageStatus: 'complete',
    complianceStatus: 'findings-present',
    promotionEligible: false,
    status: 'complete-with-findings',
  })
  const downgradedSummary = summarizeDeepAuditCompliance({
    totalGaps: 0,
    envelopes: [{
      evidenceKind: 'deep-audit-deterministic',
      payload: { sandboxReceipt: { dependencyTrust: 'untrusted-local-copy', externalWriteContainment: 'unverified' } },
    }],
  })
  assert.equal(downgradedSummary.complianceStatus, 'blocked')
  assert.equal(downgradedSummary.promotionEligible, false)
  console.log('✓ coverage completeness cannot hide findings or untrusted execution/containment downgrades')

  const alias = resolve(activeSecond.runRoot, 'deterministic/dim-1-alias.json')
  linkSync(resolve(activeSecond.runRoot, 'deterministic/dim-1.json'), alias)
  throwsBlocked(() => verifyDeepAuditCoverage({ repoRoot: fixture }), /hard-link evidence/)
  unlinkSync(alias)
  const outside = resolve(fixture, 'outside-hook-evidence')
  mkdirSync(outside)
  const hookLink = resolve(activeSecond.runRoot, 'hook-residue')
  symlinkSync(outside, hookLink)
  throwsBlocked(() => verifyDeepAuditCoverage({ repoRoot: fixture }), /symbolic-link evidence/)
  unlinkSync(hookLink)
  const legacy = resolve(activeSecond.deepAuditRoot, 'judgment')
  mkdirSync(legacy)
  writeFileSync(resolve(legacy, 'flat.json'), '{"status":"verified"}\n')
  throwsBlocked(() => verifyDeepAuditCoverage({ repoRoot: fixture }), /legacy\/poisoned flat evidence/)
  rmSync(legacy, { recursive: true, force: true })
  console.log('✓ hardlink, symlink and legacy flat JSON poison all fail before plan/evidence claims are considered')

  const stalePath = resolve(fixture, 'untracked-after-prepare.txt')
  writeFileSync(stalePath, 'stale\n')
  throwsBlocked(() => loadActiveDeepAuditRun({ repoRoot: fixture, requireCurrent: true }), /active run is stale/)
  unlinkSync(stalePath)

  const third = prepareDeepAuditRun({ repoRoot: fixture, selfProvider: 'claude', peerProvider: 'codex', selfSurface: 'local', peerSurface: 'local', replaceActive: true })
  const activeThird = loadActiveDeepAuditRun({ repoRoot: fixture })
  const originalManifestBytes = readFileSync(activeThird.manifestPath)
  const originalPointerBytes = readFileSync(activeThird.activePath)
  const assertRubricProjectionTamperBlocked = mutate => {
    const poisoned = structuredClone(activeThird.manifest)
    mutate(poisoned)
    poisoned.rubricPaths.sort()
    poisoned.rubricDigest = digestInventoryRows(poisoned.inventory, poisoned.rubricPaths)
    const poisonedBytes = Buffer.from(`${stableStringify(poisoned, 2)}\n`)
    writeFileSync(activeThird.manifestPath, poisonedBytes)
    writeFileSync(activeThird.activePath, `${stableStringify({
      schemaVersion: 1,
      evidenceKind: 'deep-audit-active-run',
      runId: poisoned.runId,
      manifestSha256: sha256(poisonedBytes),
    }, 2)}\n`)
    try {
      throwsBlocked(() => loadActiveDeepAuditRun({ repoRoot: fixture, requireCurrent: true }), /rubric projection differs/)
    } finally {
      writeFileSync(activeThird.manifestPath, originalManifestBytes)
      writeFileSync(activeThird.activePath, originalPointerBytes)
    }
  }
  assertRubricProjectionTamperBlocked(manifest => {
    manifest.rubricPaths = manifest.rubricPaths.filter((path) => path !== 'docs/dynamic-rubric.md')
  })
  assertRubricProjectionTamperBlocked(manifest => { manifest.rubricPaths.push('package-lock.json') })
  assertRubricProjectionTamperBlocked(manifest => { manifest.rubricPaths.push('docs/retired-rubric.md') })
  const good = buildDeepAuditEvidenceEnvelope({
    activeRun: activeThird,
    evidenceKind: 'deep-audit-deterministic',
    producer: deepAuditEvidenceContract.genericProducer,
    command: command(),
    coveragePaths,
    payload: deterministicPayload(1, activeThird.manifest),
  })
  const bad = { ...good, payload: deterministicPayload(2, activeThird.manifest), coverage: { ...good.coverage, inventoryDigest: sha256('poison') } }
  throwsBlocked(() => writeDeepAuditEvidenceEnvelopeBatch({
    repoRoot: fixture,
    items: [
      { relativePath: 'deterministic/dim-1.json', envelope: good },
      { relativePath: 'deterministic/dim-2.json', envelope: bad },
    ],
  }), /inventoryDigest mismatches/)
  assert.equal(existsSync(resolve(activeThird.runRoot, 'deterministic')), false)
  assert.equal(loadActiveDeepAuditRun({ repoRoot: fixture }).manifest.runId, third.manifest.runId)
  console.log('✓ stale worktrees and invalid batch members fail without publishing partial evidence')

  throwsBlocked(() => prepareDeepAuditRun({
    repoRoot: fixture,
    selfProvider: 'claude',
    peerProvider: 'codex',
    selfRuntime: 'claude-code-cli',
    selfSurface: 'cloud',
    peerSurface: 'local',
    replaceActive: true,
  }), /runtime identity\/surface tuple is unregistered/)
  throwsBlocked(() => prepareDeepAuditRun({
    repoRoot: fixture,
    selfProvider: 'claude',
    peerProvider: 'codex',
    selfSurface: 'satellite',
    peerSurface: 'local',
    replaceActive: true,
  }), /runtime surface is unregistered/)
  const mixedSurface = prepareDeepAuditRun({
    repoRoot: fixture,
    selfProvider: 'claude',
    peerProvider: 'codex',
    selfRuntime: 'claude-code-cloud',
    peerRuntime: 'codex-desktop',
    selfSurface: 'cloud',
    peerSurface: 'remote-control',
    replaceActive: true,
  })
  assert.deepEqual({
    runtime: mixedSurface.manifest.providers.self.runtimeIdentity,
    surface: mixedSurface.manifest.providers.self.runtimeSurface,
    profile: mixedSurface.manifest.providers.self.runtimeProfileId,
  }, { runtime: 'claude-code-cloud', surface: 'cloud', profile: 'claude-code-cloud' })
  assert.deepEqual({
    runtime: mixedSurface.manifest.providers.peer.runtimeIdentity,
    surface: mixedSurface.manifest.providers.peer.runtimeSurface,
    profile: mixedSurface.manifest.providers.peer.runtimeProfileId,
  }, { runtime: 'codex-desktop', surface: 'remote-control', profile: 'codex-desktop-remote' })
  assert.equal(validateDeepAuditRunProviderBindings(mixedSurface.manifest, { repoRoot: fixture }), true)
  const compatibilityPath = resolve(fixture, 'infra/governance/providers/compatibility-matrix.json')
  const compatibilityBytes = readFileSync(compatibilityPath)
  const poisonedCompatibility = JSON.parse(compatibilityBytes.toString('utf8'))
  poisonedCompatibility.providers['claude-code'].runtimeKinds['claude-code-cloud'].runtimeProfilesBySurface.cloud = 'codex-cloud'
  writeFileSync(compatibilityPath, `${JSON.stringify(poisonedCompatibility, null, 2)}\n`)
  try {
    throwsBlocked(
      () => validateDeepAuditRunProviderBindings(mixedSurface.manifest, { repoRoot: fixture }),
      /compatibility\/runtime profile authority is invalid|provider compatibility\/profile binding is stale/,
    )
  } finally {
    writeFileSync(compatibilityPath, compatibilityBytes)
  }
  const runtimeProfilePath = resolve(fixture, 'infra/governance/providers/runtime-conformance.json')
  const runtimeProfileBytes = readFileSync(runtimeProfilePath)
  const poisonedProfile = JSON.parse(runtimeProfileBytes.toString('utf8'))
  poisonedProfile.providers.find((profile) => profile.id === 'claude-code-cloud').certificationSurface = 'local'
  writeFileSync(runtimeProfilePath, `${JSON.stringify(poisonedProfile, null, 2)}\n`)
  try {
    throwsBlocked(
      () => validateDeepAuditRunProviderBindings(mixedSurface.manifest, { repoRoot: fixture }),
      /compatibility\/runtime profile authority is invalid/,
    )
  } finally {
    writeFileSync(runtimeProfilePath, runtimeProfileBytes)
  }
  const manifestBytes = readFileSync(mixedSurface.manifestPath)
  const pointerBytes = readFileSync(mixedSurface.activePath)
  const staleReviewManifest = structuredClone(mixedSurface.manifest)
  staleReviewManifest.providers.self.reviewTransport = 'stale-managed-review-transport'
  staleReviewManifest.providerIdentityDigest = deepAuditProviderIdentityDigest({
    authorProvider: staleReviewManifest.authorProvider,
    providers: staleReviewManifest.providers,
    reviewSelection: staleReviewManifest.reviewSelection,
  })
  const staleReviewBytes = Buffer.from(`${stableStringify(staleReviewManifest, 2)}\n`)
  writeFileSync(mixedSurface.manifestPath, staleReviewBytes)
  writeFileSync(mixedSurface.activePath, `${stableStringify({
    ...JSON.parse(pointerBytes.toString('utf8')),
    manifestSha256: sha256(staleReviewBytes),
  }, 2)}\n`)
  try {
    throwsBlocked(
      () => verifyDeepAuditCoverage({ repoRoot: fixture }),
      /provider compatibility\/profile binding is stale/,
    )
  } finally {
    writeFileSync(mixedSurface.manifestPath, manifestBytes)
    writeFileSync(mixedSurface.activePath, pointerBytes)
  }
  console.log('✓ explicit local/cloud/remote-control tuples resolve through compatibility/profile; missing, unknown, and mismatched surfaces fail closed')
} finally {
  rmSync(fixture, { recursive: true, force: true })
  rmSync(ambientToolFixture, { recursive: true, force: true })
}

console.log('✅ immutable deep-audit evidence contract/verifier attack tests PASS')
