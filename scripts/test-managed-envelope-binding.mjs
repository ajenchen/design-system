#!/usr/bin/env node
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  managedEvidenceEnvelopeDigest,
  sha256,
  stableStringify,
  validateManagedCiSandboxReceiptShape,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  validateManagedCiRawReceiptValidationReadback,
  validateManagedCiSandboxReceipt,
} from './lib/managed-ci-sandbox-receipt.mjs'
import { managedAttestationBindingDigest } from './lib/model-broker-transcript.mjs'

const ROOT = process.cwd()
const D = (label) => sha256(label)
const RUN_ID = '11111111-1111-4111-8111-111111111111'
const HEAD = '1'.repeat(40)
const TREE = '2'.repeat(40)
const OBSERVED = '2026-07-21T01:00:00.000Z'
const EXPIRES = '2026-07-21T01:30:00.000Z'
const RAW_RECEIPT_BINDING_KEYS = Object.freeze([
  'planDigest',
  'profileDigest',
  'executionClass',
  'evidenceKind',
  'selectedProvider',
  'networkPolicyDigest',
  'isolationPolicyDigest',
  'permissionsDigest',
  'workflowIdentityDigest',
  'containerImageDigest',
])

function bindingFixture() {
  const lockfileSha256 = D('lockfile')
  const installedLockfileSha256 = D('installed-lockfile')
  const installedDependencyIdentityDigest = D('installed-dependencies')
  const dependency = {
    lockfileSha256,
    installedLockfileSha256,
    installedDependencyIdentityDigest,
    installedPackageCount: 17,
  }
  return {
    issuerRegistryDigest: D('issuer-registry'),
    runtimePolicyDigest: D('runtime-policy'),
    observedAt: OBSERVED,
    expiresAt: EXPIRES,
    nonce: '22222222-2222-4222-8222-222222222222',
    planDigest: D('managed-plan'),
    profileDigest: D('managed-profile'),
    executionClass: 'model-broker',
    evidenceKind: 'deep-audit-judgment',
    selectedProvider: 'claude',
    networkPolicyDigest: D('network-policy'),
    isolationPolicyDigest: D('isolation-policy'),
    permissionsDigest: D('permissions'),
    workflowIdentityDigest: D('workflow'),
    containerImageDigest: `sha256:${'3'.repeat(64)}`,
    oidcClaimsDigest: D('oidc'),
    dependencyBundleDigest: D(stableStringify(dependency)),
    evidenceEnvelopeDigest: D('provisional-envelope'),
    dependency,
    execution: {
      runnerEnvironment: 'github-hosted',
      runnerImageDigest: D('runner-image'),
      containerImageDigest: `sha256:${'3'.repeat(64)}`,
      containerIdDigest: D('container-id'),
      oidcClaimsDigest: D('oidc'),
      containmentBackend: 'github-hosted-ephemeral-container',
      externalWriteContainment: 'verified',
    },
    workflow: {
      repository: 'ajenchen/design-system',
      path: '.github/workflows/deep-audit-managed.yml',
      runId: '123456789',
      runAttempt: 1,
      event: 'workflow_dispatch',
      head: HEAD,
      tree: TREE,
    },
    activeRun: { runId: RUN_ID, manifestSha256: D('manifest'), head: HEAD, tree: TREE },
    callerClosure: { beforeDigest: D('caller'), afterDigest: D('caller') },
    manifestClosure: { beforeDigest: D('manifest-closure'), afterDigest: D('manifest-closure') },
    dependencyClosure: { beforeDigest: D('dependency-closure'), afterDigest: D('dependency-closure') },
    generatedOutputClosureDigest: D('generated-output'),
    cleanup: true,
  }
}

function sandboxFixture(binding, signatures = []) {
  return {
    materialization: 'fresh-npm-ci-from-frozen-lockfile',
    manifestVerificationBeforeDigest: binding.manifestClosure.beforeDigest,
    manifestVerificationAfterDigest: binding.manifestClosure.afterDigest,
    callerFingerprintBeforeDigest: binding.callerClosure.beforeDigest,
    callerFingerprintAfterDigest: binding.callerClosure.afterDigest,
    dependencyViewBeforeDigest: binding.dependencyClosure.beforeDigest,
    dependencyViewAfterDigest: binding.dependencyClosure.afterDigest,
    dependencyLockfileSha256: binding.dependency.lockfileSha256,
    installedLockfileSha256: binding.dependency.installedLockfileSha256,
    installedDependencyIdentityDigest: binding.dependency.installedDependencyIdentityDigest,
    dependencyProvenance: 'fresh-npm-ci',
    dependencyTrust: 'managed-ci-attested',
    executionIsolation: 'ephemeral-managed-ci-container',
    containmentBackend: binding.execution.containmentBackend,
    externalWriteContainment: 'verified',
    cleanup: true,
    installedPackageCount: binding.dependency.installedPackageCount,
    attestation: {
      schemaVersion: 1,
      contract: 'managed-ci-sandbox-attestation-v1',
      binding,
      signatures,
    },
  }
}

function brokerReceipt(binding) {
  const transcriptSha256 = D('transcript')
  const providerInvocationWindow = { startedAt: '2026-07-21T00:10:00.000Z', finishedAt: '2026-07-21T00:12:00.000Z' }
  const exchangeInvocationObservations = Array.from({ length: 3 }, (_, index) => ({
    shardId: D(`shard-${index + 1}`),
    providerRunId: `provider-run-${index + 1}`,
    responseSha256: D(`response-${index + 1}`),
    observedAt: `2026-07-21T00:1${index}:00.000Z`,
  }))
  return {
    schemaVersion: 1,
    transportMode: 'managed-no-tools-api-shards-v1',
    coverageInventoryDigest: D('coverage'),
    transcriptReference: `judgment/claude/_transcripts/${transcriptSha256}.json`,
    transcriptSha256,
    transcriptBytes: 1234,
    brokerPlanDigest: D('broker-plan'),
    invocationRegistryDigest: D('invocation-registry'),
    brokerProfileDigest: D('broker-profiles'),
    selectedProfileDigest: D('selected-profile'),
    modelIdentityPolicyDigest: D('model-identity-policy'),
    requestModelId: 'claude-sonnet-4-5-20250929',
    observedResponseModelId: 'claude-sonnet-4-5-20250929',
    modelReleaseId: 'claude/claude-sonnet-4-5-20250929',
    modelReleaseBindingDigest: D('model-release-binding'),
    modelReleaseRegistryDigest: D('model-release-registry'),
    modelReleaseAuthorityBindingDigest: D('model-release-authority-binding'),
    effectivePromotionBindingDigest: D('effective-promotion-binding'),
    modelReleaseValidFrom: '2026-07-21T00:00:00.000Z',
    modelReleaseValidUntil: '2026-07-21T01:00:00.000Z',
    providerInvocationWindow,
    exchangeInvocationObservations,
    modelAuthorityReceiptDigest: D('model-authority-receipt'),
    modelAuthorityReadbackDigest: D('model-authority-readback'),
    modelAuthorityRevocationRegistryDigest: D('model-authority-revocation-registry'),
    modelAuthorityRevocationReadbackDigest: D('model-authority-revocation-readback'),
    modelAuthorityAuditReadbackDigest: D('model-authority-audit-readback'),
    modelAuthorityReplayLedgerReceiptDigest: D('model-authority-replay-ledger'),
    providerInvocationWindowDigest: sha256(stableStringify(providerInvocationWindow)),
    exchangeInvocationObservationsDigest: sha256(stableStringify(exchangeInvocationObservations)),
    modelAuthorityPolicyDigest: D('model-authority-policy'),
    modelAuthorityBindingSchemaDigest: D('model-authority-binding-schema'),
    modelAuthorityIssuerRegistryDigest: D('model-authority-issuer-registry'),
    resultSchemaSha256: D('result-schema'),
    shardSetDigest: D('shard-set'),
    shardCount: 3,
    reductionDigest: D('reduction'),
    managedAttestationDigest: managedAttestationBindingDigest(binding),
  }
}

function envelopeFixture(binding) {
  return {
    schemaVersion: 1,
    contractVersion: 1,
    evidenceKind: 'deep-audit-judgment',
    runId: RUN_ID,
    manifestSha256: D('manifest'),
    head: HEAD,
    tree: TREE,
    inventoryDigest: D('inventory'),
    rubricDigest: D('rubric'),
    worktreeBefore: D('worktree'),
    worktreeAfter: D('worktree'),
    producer: {
      providerId: 'claude', runtime: 'claude-code-cli', model: 'claude-sonnet-4-5-20250929',
      runtimeSurface: 'local', runtimeProfileId: 'claude',
      transport: 'managed-no-tools-api-shards-v1', runtimeCertificationDigest: D('certification'),
    },
    command: {
      argv: ['managed-model-broker', '--provider', 'claude'], cwd: '.', exitCode: 0,
      startedAt: OBSERVED, finishedAt: OBSERVED,
    },
    environment: {
      nodeVersion: process.version, npmVersion: '11.0.0', platform: process.platform, arch: process.arch,
      lockfilePath: 'package-lock.json', lockfileSha256: D('lockfile'),
    },
    coverage: { inventoryPaths: ['packages/design-system/src/Button.tsx'], inventoryDigest: D('coverage'), filesScanned: 1 },
    payload: {
      dim: 6,
      findings: [],
      brokerReceipt: brokerReceipt(binding),
      sandboxReceipt: sandboxFixture(binding),
    },
  }
}

const keys = generateKeyPairSync('ed25519')
const binding = bindingFixture()
const envelope = envelopeFixture(binding)
const canonicalPath = 'judgment/claude/dim-6.json'
binding.evidenceEnvelopeDigest = managedEvidenceEnvelopeDigest(envelope, canonicalPath)
assert.equal(envelope.payload.brokerReceipt.managedAttestationDigest, managedAttestationBindingDigest(binding))
const signedBytes = Buffer.from(stableStringify(binding))
const signatureBytes = sign(null, signedBytes, keys.privateKey)
const signature = {
  issuerKeyId: 'fixture-runtime-issuer',
  payloadSha256: sha256(signedBytes),
  signature: signatureBytes.toString('base64url'),
}
envelope.payload.sandboxReceipt.attestation.signatures = [signature]
assert.equal(verify(null, signedBytes, keys.publicKey, signatureBytes), true)
assert.equal(managedEvidenceEnvelopeDigest(envelope, canonicalPath), binding.evidenceEnvelopeDigest)

const receiptSchema = JSON.parse(readFileSync(resolve(ROOT, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const schemaValidate = ajv.compile(receiptSchema)
assert.equal(schemaValidate(envelope.payload.sandboxReceipt), true, ajv.errorsText(schemaValidate.errors))
assert.equal(validateManagedCiSandboxReceiptShape(envelope.payload.sandboxReceipt, { repoRoot: ROOT }), true)

for (const mutate of [
  (receipt) => { receipt.unexpected = true },
  (receipt) => { delete receipt.installedPackageCount },
  (receipt) => { receipt.attestation.binding.unexpected = true },
  (receipt) => { receipt.attestation.signatures[0].signature = 'not-canonical' },
]) {
  const poison = structuredClone(envelope.payload.sandboxReceipt)
  mutate(poison)
  assert.equal(schemaValidate(poison), false)
  assert.throws(() => validateManagedCiSandboxReceiptShape(poison, { repoRoot: ROOT }), /schema failed/)
}
console.log('✓ managed sandbox receipt schema and runtime structural gate accept/reject the same signed golden and poison shapes')

const trustFixtureRoot = mkdtempSync(join(tmpdir(), 'managed-ci-receipt-validator-'))
try {
  mkdirSync(resolve(trustFixtureRoot, 'scripts/schemas'), { recursive: true })
  mkdirSync(resolve(trustFixtureRoot, 'infra/governance/trust'), { recursive: true })
  mkdirSync(resolve(trustFixtureRoot, 'infra/governance/providers'), { recursive: true })
  writeFileSync(
    resolve(trustFixtureRoot, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json'),
    readFileSync(resolve(ROOT, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json')),
  )

  const secondKeys = generateKeyPairSync('ed25519')
  const registry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [
      {
        keyId: 'fixture-runtime-a',
        subject: 'fixture-runtime-a',
        publicKeySpki: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        roles: ['runtime-evidence-issuer'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2027-01-01T00:00:00.000Z',
        revokedAt: null,
      },
      {
        keyId: 'fixture-runtime-b',
        subject: 'fixture-runtime-b',
        publicKeySpki: secondKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        roles: ['runtime-evidence-issuer'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2027-01-01T00:00:00.000Z',
        revokedAt: null,
      },
    ],
  }
  const registryDigest = sha256(stableStringify(registry))
  const runtimeProfile = {
    issuerRegistryDigest: registryDigest,
    allowedKeyIds: ['fixture-runtime-a', 'fixture-runtime-b'],
    requiredIssuerQuorum: 2,
  }
  writeFileSync(
    resolve(trustFixtureRoot, 'infra/governance/trust/issuers.json'),
    `${stableStringify(registry, 2)}\n`,
  )
  const runtimeProfileBytes = Buffer.from(`${stableStringify(runtimeProfile, 2)}\n`)
  writeFileSync(
    resolve(trustFixtureRoot, 'infra/governance/providers/runtime-conformance.json'),
    runtimeProfileBytes,
  )
  writeFileSync(
    resolve(trustFixtureRoot, 'infra/governance/release-rings.json'),
    `${stableStringify({ attestationPolicy: { issuerRegistryDigest: registryDigest } }, 2)}\n`,
  )

  const fullyBound = structuredClone(binding)
  fullyBound.issuerRegistryDigest = registryDigest
  fullyBound.runtimePolicyDigest = sha256(runtimeProfileBytes)
  const fullSignedBytes = Buffer.from(stableStringify(fullyBound))
  const fullReceipt = sandboxFixture(fullyBound, [
    {
      issuerKeyId: 'fixture-runtime-a',
      payloadSha256: sha256(fullSignedBytes),
      signature: sign(null, fullSignedBytes, keys.privateKey).toString('base64url'),
    },
    {
      issuerKeyId: 'fixture-runtime-b',
      payloadSha256: sha256(fullSignedBytes),
      signature: sign(null, fullSignedBytes, secondKeys.privateKey).toString('base64url'),
    },
  ])
  const fullRawBytes = Buffer.from(stableStringify(fullReceipt))
  const expected = {
    manifestVerificationDigest: fullReceipt.manifestVerificationBeforeDigest,
    dependencyLockfileSha256: fullyBound.dependency.lockfileSha256,
    activeRun: fullyBound.activeRun,
    receiptBinding: Object.fromEntries(
      RAW_RECEIPT_BINDING_KEYS.map(key => [key, fullyBound[key]]),
    ),
    workflow: fullyBound.workflow,
    runnerEnvironment: fullyBound.execution.runnerEnvironment,
    evidenceEnvelopeDigest: fullyBound.evidenceEnvelopeDigest,
    oidcClaimsDigest: fullyBound.oidcClaimsDigest,
    generatedOutputClosureDigest: fullyBound.generatedOutputClosureDigest,
    maxAgeSeconds: 3600,
  }
  const readback = validateManagedCiSandboxReceipt({
    rawBytes: fullRawBytes,
    receipt: fullReceipt,
    rawReceiptPath: 'model-broker.json',
    repoRoot: trustFixtureRoot,
    now: new Date('2026-07-21T01:15:00.000Z'),
    expected,
  })
  assert.deepEqual(readback.checks, {
    schema: true,
    dependencyAndClosureBinding: true,
    classAndWorkflowBinding: true,
    runAndEnvelopeBinding: true,
    lifecycle: true,
    signatureQuorum: true,
  })
  assert.equal(validateManagedCiRawReceiptValidationReadback(readback, {
    expected: {
      executionClass: 'model-broker',
      evidenceKind: 'deep-audit-judgment',
      workflowRunId: fullyBound.workflow.runId,
      runAttempt: fullyBound.workflow.runAttempt,
      rawReceiptDigest: sha256(fullRawBytes),
      rawReceiptPath: 'model-broker.json',
    },
  }), true)

  const validatePoison = (mutate, pattern) => {
    const poison = structuredClone(fullReceipt)
    mutate(poison)
    assert.throws(() => validateManagedCiSandboxReceipt({
      receipt: poison,
      repoRoot: trustFixtureRoot,
      now: new Date('2026-07-21T01:15:00.000Z'),
      expected,
    }), pattern)
  }
  assert.throws(() => validateManagedCiSandboxReceipt({
    rawBytes: Buffer.from('{not-json'),
    repoRoot: trustFixtureRoot,
    now: new Date('2026-07-21T01:15:00.000Z'),
    expected,
  }), /invalid JSON/)
  validatePoison(
    receipt => { receipt.attestation.binding.executionClass = 'deterministic-hook-audit' },
    /typed execution binding mismatches:executionClass/,
  )
  validatePoison(
    receipt => { receipt.attestation.binding.activeRun.runId = '33333333-3333-4333-8333-333333333333' },
    /activeRun binding mismatches/,
  )
  validatePoison(
    receipt => { receipt.attestation.binding.evidenceEnvelopeDigest = D('detached-envelope') },
    /expected evidence envelope/,
  )
  validatePoison(
    receipt => { receipt.attestation.binding.oidcClaimsDigest = D('detached-oidc') },
    /expected OIDC claims/,
  )
  validatePoison(
    receipt => { receipt.attestation.binding.generatedOutputClosureDigest = D('detached-output') },
    /expected generated-output closure/,
  )
  validatePoison(
    receipt => {
      receipt.attestation.binding.execution.containmentBackend = 'self-hosted-attested-ephemeral-container'
      receipt.containmentBackend = 'self-hosted-attested-ephemeral-container'
    },
    /runner environment\/containment backend pair/,
  )
  validatePoison(
    receipt => { receipt.attestation.signatures[0].signature = 'A'.repeat(86) },
    /signature is invalid/,
  )
  validatePoison(
    receipt => { receipt.attestation.signatures = receipt.attestation.signatures.slice(0, 1) },
    /lacks bounded quorum/,
  )
  const poisonedReadback = structuredClone(readback)
  poisonedReadback.checks.lifecycle = false
  assert.throws(
    () => validateManagedCiRawReceiptValidationReadback(poisonedReadback),
    /does not prove every required check/,
  )
  assert.throws(
    () => validateManagedCiRawReceiptValidationReadback(readback, {
      expected: { rawReceiptPath: 'dependency-acquisition.json' },
    }),
    /expected rawReceiptPath mismatches/,
  )
  const schemaPath = resolve(trustFixtureRoot, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json')
  const schemaBytes = readFileSync(schemaPath)
  rmSync(schemaPath)
  symlinkSync(resolve(ROOT, 'scripts/schemas/managed-ci-sandbox-receipt.schema.json'), schemaPath)
  assert.throws(() => validateManagedCiSandboxReceipt({
    rawBytes: fullRawBytes,
    rawReceiptPath: 'model-broker.json',
    repoRoot: trustFixtureRoot,
    now: new Date('2026-07-21T01:15:00.000Z'),
    expected,
  }), /schema crosses a symbolic link/)
  rmSync(schemaPath)
  writeFileSync(schemaPath, schemaBytes)

  const runtimePath = resolve(trustFixtureRoot, 'infra/governance/providers/runtime-conformance.json')
  const runtimeHardlinkSource = resolve(trustFixtureRoot, 'runtime-conformance-hardlink-source.json')
  const runtimeBytes = readFileSync(runtimePath)
  rmSync(runtimePath)
  writeFileSync(runtimeHardlinkSource, runtimeBytes)
  linkSync(runtimeHardlinkSource, runtimePath)
  assert.throws(() => validateManagedCiSandboxReceipt({
    rawBytes: fullRawBytes,
    rawReceiptPath: 'model-broker.json',
    repoRoot: trustFixtureRoot,
    now: new Date('2026-07-21T01:15:00.000Z'),
    expected,
  }), /runtime conformance policy is not one unique regular file/)
  console.log('✓ shared managed-CI raw receipt validator closes bytes, class, run, envelope, lifecycle, and independent signature quorum')
} finally {
  rmSync(trustFixtureRoot, { recursive: true, force: true })
}

function assertSignedReplayRejected(mutate, path = canonicalPath) {
  const replay = structuredClone(envelope)
  mutate(replay)
  const replayDigest = managedEvidenceEnvelopeDigest(replay, path)
  assert.notEqual(replayDigest, binding.evidenceEnvelopeDigest)
  const replayBinding = structuredClone(binding)
  replayBinding.evidenceEnvelopeDigest = replayDigest
  assert.equal(verify(null, Buffer.from(stableStringify(replayBinding)), keys.publicKey, signatureBytes), false)
}

assertSignedReplayRejected((replay) => { replay.payload.dim = 7 })
assertSignedReplayRejected(() => {}, 'judgment/claude/dim-7.json')
assertSignedReplayRejected((replay) => {
  replay.evidenceKind = 'deep-audit-component-a1b'
  replay.payload = {
    component: 'Button', claimsVerified: 1, falseClaims: [], claimReceipt: { status: 'verified' },
    brokerReceipt: { ...replay.payload.brokerReceipt, transcriptReference: replay.payload.brokerReceipt.transcriptReference.replace('judgment/', 'component-a1b/') },
    sandboxReceipt: replay.payload.sandboxReceipt,
  }
}, 'component-a1b/claude/Button.json')
assertSignedReplayRejected((replay) => { replay.producer.providerId = 'codex' }, 'judgment/codex/dim-6.json')
assertSignedReplayRejected((replay) => { replay.coverage.inventoryPaths = ['packages/design-system/src/Other.tsx'] })
assertSignedReplayRejected((replay) => { replay.command.argv.push('--poison') })
assertSignedReplayRejected((replay) => {
  replay.payload.brokerReceipt.transcriptSha256 = D('replacement-transcript')
  replay.payload.brokerReceipt.transcriptReference = `judgment/claude/_transcripts/${replay.payload.brokerReceipt.transcriptSha256}.json`
})

const excludedSelfReference = structuredClone(envelope)
excludedSelfReference.payload.sandboxReceipt.attestation.binding.evidenceEnvelopeDigest = D('different-self-reference')
excludedSelfReference.payload.sandboxReceipt.attestation.signatures[0].signature = 'A'.repeat(86)
assert.equal(managedEvidenceEnvelopeDigest(excludedSelfReference, canonicalPath), binding.evidenceEnvelopeDigest)
console.log('✓ one Ed25519 envelope signature cannot replay across dimension, component, provider, path, coverage, command, or transcript identity')
