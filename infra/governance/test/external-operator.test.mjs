import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  externalHardGateContractDigest,
  externalManagedControlPlaneDigest,
  externalManagedSessionDigest,
  externalRepositoryReadbackDigest,
  externalSurfaceDistributionIdentityDigest,
  externalSurfaceEvidenceSigningPayload,
} from '../lib/external-surface-evidence.mjs'
import {
  deriveGithubAppActivationExpectations,
  validateExternalActivationCarrierAfterImage,
} from '../lib/external-activation.mjs'
import {
  applyReviewedExternalActivationProposal,
  applyReviewedExternalCertificationProposal,
  createExternalActivationProposal,
  createExternalActivationSigningRequest,
  createExternalCertificationProposal,
  createReviewedExternalActivationHandoff,
  createReviewedExternalCertificationHandoff,
  externalOperatorBlockResult,
  externalOperatorTestHarness,
  inspectExternalSurfaceReceipt,
  materializeExternalSurfaceReceipt,
  readExternalOperatorArtifact,
  validateExternalActivationProposal,
  validateExternalActivationSignatureBundle,
  validateExternalActivationSigningRequest,
  validateExternalCertificationCarrierAfterImage,
  validateExternalCertificationProposal,
  validateExternalLedgerTransactionHandoff,
  writeExternalOperatorRuntimeArtifact,
} from '../lib/external-operator.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { readJson, sha256, stableStringify } from '../lib/common.mjs'
import { runtimeTargetDigest } from '../lib/provider-runtime-conformance.mjs'

const GOVERNANCE_ROOT = resolve(import.meta.dirname, '..')
const NOW = new Date('2026-07-23T00:10:00.000Z')
const GENERATED_AT = '2026-07-23T00:00:00.000Z'
const CERTIFIED_AT = '2026-07-23T00:05:00.000Z'
const EXPIRES_AT = '2026-07-23T12:00:00.000Z'
const EXPECTED_BASE_COMMIT = 'f'.repeat(40)
const EXPECTED_BASE_TREE = '1'.repeat(40)

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value)}\n`)
}

function loadModels() {
  return {
    certifications: readJson(resolve(GOVERNANCE_ROOT, 'providers/certifications.json')),
    activationLedger: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json')),
    inventory: readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')),
    desired: readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json')),
    matrix: readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')),
    runtimeProfile: readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')),
    roleSurfacePolicy: readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json')),
    rings: readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json')),
    activationPolicy: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json')),
    mutationBoundaryContract: readJson(resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json')),
  }
}

function context() {
  const models = loadModels()
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const applyKeys = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [
      {
        keyId: 'activation-apply-fixture',
        subject: 'independent-activation-apply-authorizer',
        publicKeySpki: applyKeys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        roles: ['apply-authorizer'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2030-01-01T00:00:00.000Z',
        revokedAt: null,
      },
      {
        keyId: 'external-operator-fixture',
        subject: 'independent-external-operator',
        publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        roles: ['runtime-evidence-issuer', 'completion-attestor'],
        status: 'active',
        notBefore: '2026-01-01T00:00:00.000Z',
        notAfter: '2030-01-01T00:00:00.000Z',
        revokedAt: null,
      },
    ],
  }
  models.runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  models.runtimeProfile.allowedKeyIds = ['external-operator-fixture']
  models.runtimeProfile.requiredIssuerQuorum = 1
  models.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  models.rings.attestationPolicy.allowedKeyIds = ['activation-apply-fixture', 'external-operator-fixture']
  models.rings.attestationPolicy.applyAuthorizationQuorum = 1
  models.rings.attestationPolicy.completionAttestationQuorum = 1
  const runtimeIdentity = {
    gitCommit: 'a'.repeat(40),
    gitTree: 'b'.repeat(40),
    profileDigest: `sha256:${sha256(stableStringify(models.runtimeProfile, 0))}`,
    harnessDigest: `sha256:${'c'.repeat(64)}`,
  }
  return { ...models, issuerRegistry, privateKey, runtimeIdentity }
}

function signedSurfaceReceipt(ctx, repositoryRole = 'authority') {
  const profile = ctx.runtimeProfile.providers.find(item => item.id === 'codex-cloud')
  const target = profile.certificationTargets[0]
  const repository = ctx.inventory.repositories.find(item => item.role === repositoryRole)
  const distribution = {
    authority: profile.distributionVersionAuthority.authority,
    productId: profile.distributionVersionAuthority.productId,
    version: profile.distributionVersionAuthority.version,
    identityDigest: null,
  }
  distribution.identityDigest = externalSurfaceDistributionIdentityDigest(distribution)
  const evidence = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-conformance',
    status: 'pass',
    profile: {
      id: profile.id,
      adapterProviderId: profile.adapterProviderId,
      runtimeKind: profile.runtimeKind,
      surface: profile.certificationSurface,
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: repository.role,
    },
    run: {
      runId: '10000000-0000-4000-8000-000000000001',
      generatedAt: GENERATED_AT,
      validUntil: new Date(new Date(GENERATED_AT).getTime() + ctx.runtimeProfile.maxEvidenceAgeSeconds * 1000).toISOString(),
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      pathClass: target.pathClass,
      targetId: target.id,
      targetDigest: runtimeTargetDigest(target),
    },
    subject: {
      gitCommit: 'd'.repeat(40),
      gitTree: 'e'.repeat(40),
      profileDigest: ctx.runtimeIdentity.profileDigest,
      harnessDigest: ctx.runtimeIdentity.harnessDigest,
      hardGateContractDigest: externalHardGateContractDigest(ctx.matrix, repository.role),
    },
    distribution,
    checks: profile.checks.map(check => ({
      id: check.id,
      driver: check.driver,
      status: 'pass',
      receiptSha256: '0'.repeat(64),
    })),
    surfaceBinding: {
      kind: 'managed-runtime-readback',
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: repository.role,
      defaultBranch: repository.defaultBranch,
      sessionIdentitySha256: '0'.repeat(64),
      repositoryReadbackSha256: '0'.repeat(64),
      distributionReadbackSha256: distribution.identityDigest.slice('sha256:'.length),
      hardGateReceiptSha256: sha256('external-operator-hard-gate'),
      controlPlaneReadbackSha256: '0'.repeat(64),
    },
    attestation: null,
    evidenceDigest: null,
  }
  evidence.surfaceBinding.repositoryReadbackSha256 = externalRepositoryReadbackDigest(repository, evidence.subject)
  const setReceipt = (driver, digest) => {
    const matches = evidence.checks.filter(check => check.driver === driver)
    assert.equal(matches.length, 1)
    matches[0].receiptSha256 = digest
  }
  setReceipt('external-distribution-identity', evidence.surfaceBinding.distributionReadbackSha256)
  setReceipt('external-hard-gate-receipt', evidence.surfaceBinding.hardGateReceiptSha256)
  evidence.surfaceBinding.sessionIdentitySha256 = externalManagedSessionDigest(evidence)
  setReceipt('external-runtime-session-binding', evidence.surfaceBinding.sessionIdentitySha256)
  evidence.surfaceBinding.controlPlaneReadbackSha256 = externalManagedControlPlaneDigest(evidence)
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = evidence
  evidence.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  evidence.attestation = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-evidence-attestation',
    status: 'verified',
    issuerId: 'external-operator-fixture',
    issuerRegistryDigest: ctx.runtimeProfile.issuerRegistryDigest,
    algorithm: 'ed25519',
    evidenceDigest: evidence.evidenceDigest,
    runId: evidence.run.runId,
    signature: '',
    coSignatures: [],
  }
  evidence.attestation.signature = sign(
    null,
    externalSurfaceEvidenceSigningPayload(evidence, evidence.attestation.issuerId),
    ctx.privateKey,
  ).toString('base64')
  return evidence
}

function git(root, args) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-07-23T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-07-23T00:00:00Z',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepoRoot(ctx) {
  const repoRoot = mkdtempSync(resolve(tmpdir(), 'external-operator-'))
  mkdirSync(resolve(repoRoot, 'infra/governance/providers'), { recursive: true })
  writeFileSync(resolve(repoRoot, 'infra/governance/providers/certifications.json'), canonicalBytes(ctx.certifications))
  writeFileSync(resolve(repoRoot, 'infra/governance/external-activation-requirements.json'), canonicalBytes(ctx.activationLedger))
  return repoRoot
}

function overrides(ctx, repoRoot) {
  return {
    repoRoot,
    certifications: ctx.certifications,
    activationLedger: ctx.activationLedger,
    inventory: ctx.inventory,
    desired: ctx.desired,
    matrix: ctx.matrix,
    runtimeProfile: ctx.runtimeProfile,
    roleSurfacePolicy: ctx.roleSurfacePolicy,
    rings: ctx.rings,
    issuerRegistry: ctx.issuerRegistry,
    activationPolicy: ctx.activationPolicy,
    mutationBoundaryContract: ctx.mutationBoundaryContract,
    runtimeIdentity: ctx.runtimeIdentity,
  }
}

function githubAppObservedResource(ctx) {
  const expected = deriveGithubAppActivationExpectations(ctx)
  const installationTokenProbes = expected.installationProbeRoutes.map((route, index) => ({
    ...route,
    appId: expected.appIds[route.integration],
    installationId: 2000 + index,
    credentialSource: 'named-environment-secrets',
    tokenMinted: true,
    installationRepositoryVerified: true,
    capability: expected.integrations[route.integration].capability,
    repositorySelection: expected.appConfigurations[route.integration].repositorySelection,
    permissions: expected.appConfigurations[route.integration].permissions,
    capabilityProbeSucceeded: true,
  }))
  return {
    appIds: expected.appIds,
    appConfigurations: expected.appConfigurations,
    appConfigurationsDigest: expected.appConfigurationsDigest,
    installationRepositoriesByIntegration: expected.installationRepositoriesByIntegration,
    installationRepositoriesDigest: expected.installationRepositoriesDigest,
    environmentSecretPlacements: expected.environmentSecretPlacements,
    environmentSecretPlacementsDigest: expected.environmentSecretPlacementsDigest,
    nonEnvironmentGovernanceSecrets: expected.nonEnvironmentGovernanceSecrets,
    nonEnvironmentGovernanceSecretsDigest: expected.nonEnvironmentGovernanceSecretsDigest,
    installationTokenProbes,
    installationTokenProbesDigest: sha256(stableStringify(installationTokenProbes, 0)),
  }
}

function compileSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  for (const name of [
    'provider-surface-certification',
    'external-activation-requirements',
    'review-capability-certifications',
  ]) {
    ajv.addSchema(readJson(resolve(GOVERNANCE_ROOT, `schemas/${name}.schema.json`)))
  }
  const names = [
    'external-surface-import-receipt',
    'external-runtime-certification-proposal',
    'external-activation-signing-request',
    'external-activation-signature-bundle',
    'external-activation-proposal',
    'provider-review-capability-certification-proposal',
    'external-ledger-transaction-handoff',
    'external-operator-block-result',
  ]
  return Object.fromEntries(names.map(name => [
    name,
    ajv.compile(readJson(resolve(GOVERNANCE_ROOT, `schemas/${name}.schema.json`))),
  ]))
}

test('signed surface receipt imports once into immutable CAS and drives a protected Git certification handoff without ledger mutation', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const evidence = signedSurfaceReceipt(ctx)
    const bytes = canonicalBytes(evidence)
    const inspected = inspectExternalSurfaceReceipt(bytes, {
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    assert.equal(inspected.evidence.evidenceDigest, evidence.evidenceDigest)
    const imported = materializeExternalSurfaceReceipt(bytes, {
      repoRoot,
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    const importedAgain = materializeExternalSurfaceReceipt(bytes, {
      repoRoot,
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    assert.equal(imported.reference, importedAgain.reference)
    assert.equal(imported.receipt.externalMutationPerformed, false)

    const contextOverrides = overrides(ctx, repoRoot)
    const proposal = createExternalCertificationProposal({
      ...contextOverrides,
      reference: imported.reference,
      artifactSha256: imported.artifactSha256,
      certifiedAt: CERTIFIED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    })
    assert.equal(validateExternalCertificationProposal(proposal, { ...contextOverrides, now: NOW }).proposalDigest, proposal.proposalDigest)
    assert.equal(proposal.externalMutationAuthorized, false)
    assert.equal(proposal.ledgerAfter.certifications.find(item => item.id === proposal.certification.id).status, 'certified')

    const ledgerPath = resolve(repoRoot, 'infra/governance/providers/certifications.json')
    const ledgerBefore = readFileSync(ledgerPath)
    const handoff = createReviewedExternalCertificationHandoff({
      ...contextOverrides,
      reviewedProposal: proposal,
      expectedProposalDigest: proposal.proposalDigest,
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      expectedBaseTree: EXPECTED_BASE_TREE,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: proposal.ledger.beforeSha256,
      now: NOW,
    })
    assert.equal(handoff.canonicalLedgerMutationPerformed, false)
    assert.equal(handoff.gitTransaction.requiredReviewFlow, 'protected-pull-request')
    assert.equal(handoff.gitTransaction.requiredPromotionPrimitive, 'atomic-expected-old-git-ref-cas')
    assert.equal(validateExternalLedgerTransactionHandoff(handoff, {
      ...contextOverrides,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: proposal.ledger.beforeSha256,
      now: NOW,
    }).handoffDigest, handoff.handoffDigest)
    assert.deepEqual(readFileSync(ledgerPath), ledgerBefore)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('certification carrier replay requires every signed artifact to be an exact current-HEAD regular blob', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const evidence = signedSurfaceReceipt(ctx, 'template-mirror')
    const imported = materializeExternalSurfaceReceipt(canonicalBytes(evidence), {
      repoRoot,
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    const proposal = createExternalCertificationProposal({
      ...overrides(ctx, repoRoot),
      reference: imported.reference,
      artifactSha256: imported.artifactSha256,
      certifiedAt: CERTIFIED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    })
    writeFileSync(
      resolve(repoRoot, 'infra/governance/providers/certifications.json'),
      canonicalBytes(proposal.ledgerAfter),
    )
    git(repoRoot, ['init', '--quiet', '--initial-branch=main'])
    git(repoRoot, ['add', '--all'])
    git(repoRoot, [
      '-c', 'user.name=External Carrier Fixture',
      '-c', 'user.email=external-carrier@example.invalid',
      'commit', '--quiet', '--no-gpg-sign', '-m', 'signed carrier and evidence',
    ])
    const validation = {
      baselineLedger: ctx.certifications,
      currentLedger: proposal.ledgerAfter,
      ...overrides(ctx, repoRoot),
      now: NOW,
    }
    assert.equal(validateExternalCertificationCarrierAfterImage(validation), true)

    const artifactPath = resolve(repoRoot, imported.reference)
    const exactBytes = readFileSync(artifactPath)
    chmodSync(artifactPath, 0o644)
    writeFileSync(artifactPath, Buffer.concat([exactBytes, Buffer.from('\n')]))
    assert.throws(
      () => validateExternalCertificationCarrierAfterImage(validation),
      /EXTERNAL_CERTIFICATION_CARRIER_INVALID/,
    )
    writeFileSync(artifactPath, exactBytes)

    const hardlinkSource = resolve(repoRoot, 'hardlink-source.json')
    rmSync(artifactPath)
    writeFileSync(hardlinkSource, exactBytes)
    linkSync(hardlinkSource, artifactPath)
    assert.throws(
      () => validateExternalCertificationCarrierAfterImage(validation),
      /single-link regular file/,
    )
    rmSync(artifactPath)
    rmSync(hardlinkSource)
    symlinkSync(resolve(repoRoot, 'missing-evidence.json'), artifactPath)
    assert.throws(
      () => validateExternalCertificationCarrierAfterImage(validation),
      /missing|symbolic link/,
    )
    rmSync(artifactPath)
    writeFileSync(artifactPath, exactBytes)

    git(repoRoot, ['rm', '--cached', '--quiet', imported.reference])
    git(repoRoot, [
      '-c', 'user.name=External Carrier Fixture',
      '-c', 'user.email=external-carrier@example.invalid',
      'commit', '--quiet', '--no-gpg-sign', '-m', 'remove evidence from carrier head',
    ])
    assert.throws(
      () => validateExternalCertificationCarrierAfterImage(validation),
      /Current HEAD does not contain one exact regular evidence blob/,
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('surface import and certification handoff fail closed on tamper, links, direct apply, physical escape, stale baseline, and expiry', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const evidence = signedSurfaceReceipt(ctx)
    const bytes = canonicalBytes(evidence)
    const tampered = structuredClone(evidence)
    tampered.distribution.version = 'forged'
    assert.throws(
      () => inspectExternalSurfaceReceipt(canonicalBytes(tampered), {
        runtimeProfile: ctx.runtimeProfile,
        issuerRegistry: ctx.issuerRegistry,
        now: NOW,
      }),
      /EXTERNAL_SURFACE_RECEIPT_INVALID/,
    )
    const artifactSha256 = sha256(bytes)
    mkdirSync(resolve(repoRoot, 'infra/governance/evidence/external-runtime'), { recursive: true })
    writeFileSync(resolve(repoRoot, `infra/governance/evidence/external-runtime/${artifactSha256}.json`), canonicalBytes({ forged: true }))
    assert.throws(
      () => materializeExternalSurfaceReceipt(bytes, {
        repoRoot,
        runtimeProfile: ctx.runtimeProfile,
        issuerRegistry: ctx.issuerRegistry,
        now: NOW,
      }),
      /EXTERNAL_SURFACE_ARTIFACT_CAS_FAILED/,
    )
    rmSync(resolve(repoRoot, 'infra/governance/evidence/external-runtime'), { recursive: true, force: true })
    const imported = materializeExternalSurfaceReceipt(bytes, {
      repoRoot,
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    const source = resolve(repoRoot, 'receipt.json')
    const hardlink = resolve(repoRoot, 'receipt-hardlink.json')
    const symlink = resolve(repoRoot, 'receipt-symlink.json')
    writeFileSync(source, bytes)
    linkSync(source, hardlink)
    assert.throws(() => readExternalOperatorArtifact(hardlink), /single-link regular file/)
    symlinkSync(source, symlink)
    assert.throws(() => readExternalOperatorArtifact(symlink), /must not be a symbolic link/)

    const contextOverrides = overrides(ctx, repoRoot)
    const proposal = createExternalCertificationProposal({
      ...contextOverrides,
      reference: imported.reference,
      artifactSha256: imported.artifactSha256,
      certifiedAt: CERTIFIED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    })
    const ledgerPath = resolve(repoRoot, 'infra/governance/providers/certifications.json')
    const ledgerBeforeBlockedApply = readFileSync(ledgerPath)
    assert.throws(() => applyReviewedExternalCertificationProposal({
      ...contextOverrides,
      proposalBytes: canonicalBytes(proposal),
      expectedProposalDigest: proposal.proposalDigest,
      ledgerPath,
      now: NOW,
    }), error => error.code === 'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED')
    assert.deepEqual(readFileSync(ledgerPath), ledgerBeforeBlockedApply)
    assert.throws(() => applyReviewedExternalCertificationProposal({
      ...contextOverrides,
      proposalBytes: canonicalBytes(proposal),
      expectedProposalDigest: '0'.repeat(64),
      ledgerPath,
      now: NOW,
    }), error => error.code === 'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED')
    assert.deepEqual(readFileSync(ledgerPath), ledgerBeforeBlockedApply)

    const runtime = resolve(repoRoot, 'infra/governance/runtime')
    const outside = resolve(repoRoot, 'outside-runtime')
    mkdirSync(runtime, { recursive: true })
    mkdirSync(resolve(outside, 'nested'), { recursive: true })
    symlinkSync(outside, resolve(runtime, 'ancestor-link'))
    const escapedOutput = resolve(runtime, 'ancestor-link/nested/escaped.json')
    assert.throws(
      () => writeExternalOperatorRuntimeArtifact(escapedOutput, { shouldNotWrite: true }, {
        runtimeDirectory: runtime,
        clock: () => NOW,
      }),
      /symlink|physical boundary|runtime output parent/i,
    )
    assert.equal(existsSync(resolve(outside, 'nested/escaped.json')), false)

    const drifted = structuredClone(ctx.certifications)
    drifted.certifications[0].limitations.push('concurrent reviewed change')
    assert.throws(
      () => validateExternalCertificationProposal(proposal, {
        ...contextOverrides,
        certifications: drifted,
        now: NOW,
      }),
      /ledger changed|canonical input changed|stale/,
    )
    assert.throws(
      () => createExternalCertificationProposal({
        ...contextOverrides,
        reference: imported.reference,
        artifactSha256: imported.artifactSha256,
        certifiedAt: '2026-07-23T00:11:00.000Z',
        expiresAt: EXPIRES_AT,
        now: NOW,
      }),
      /future/,
    )

    const nearExpiryProposal = createExternalCertificationProposal({
      ...contextOverrides,
      reference: imported.reference,
      artifactSha256: imported.artifactSha256,
      certifiedAt: CERTIFIED_AT,
      expiresAt: '2026-07-23T00:11:30.000Z',
      now: NOW,
    })
    const nearExpiryHandoff = createReviewedExternalCertificationHandoff({
      ...contextOverrides,
      reviewedProposal: nearExpiryProposal,
      expectedProposalDigest: nearExpiryProposal.proposalDigest,
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      expectedBaseTree: EXPECTED_BASE_TREE,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: nearExpiryProposal.ledger.beforeSha256,
      now: NOW,
    })
    const nearExpiryOutput = resolve(runtime, 'near-expiry-handoff.json')
    assert.throws(() => writeExternalOperatorRuntimeArtifact(nearExpiryOutput, nearExpiryHandoff, {
      runtimeDirectory: runtime,
      clock: () => new Date('2026-07-23T00:10:31.000Z'),
      validateBeforeWrite: commitNow => validateExternalLedgerTransactionHandoff(nearExpiryHandoff, {
        ...contextOverrides,
        currentBaseCommit: EXPECTED_BASE_COMMIT,
        currentBaseTree: EXPECTED_BASE_TREE,
        baseLedgerSha256: nearExpiryProposal.ledger.beforeSha256,
        now: commitNow,
      }),
    }), /minimum 60-second remaining validity horizon/)
    assert.equal(existsSync(nearExpiryOutput), false)
    assert.deepEqual(readFileSync(ledgerPath), ledgerBeforeBlockedApply)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('activation path emits an offline signing request, accepts only exact external quorum, and prepares a protected Git handoff', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const contextOverrides = overrides(ctx, repoRoot)
    const request = createExternalActivationSigningRequest({
      ...contextOverrides,
      requirementId: 'activate-independent-finalizer-signed-authority',
      observedResource: {
        allowedKeyIds: ['release-authorizer-a'],
        quorum: 1,
        issuerRegistryDigest: issuerRegistryDigest(ctx.issuerRegistry),
      },
      observedAt: '2026-07-23T00:00:00.000Z',
      expiresAt: '2026-07-24T00:00:00.000Z',
      now: NOW,
    })
    assert.equal(validateExternalActivationSigningRequest(request, { ...contextOverrides, now: NOW }).requestDigest, request.requestDigest)
    const signature = sign(null, Buffer.from(request.signingPayloadBase64, 'base64'), ctx.privateKey).toString('base64url')
    const bundle = {
      $schema: '../schemas/external-activation-signature-bundle.schema.json',
      schemaVersion: 1,
      kind: 'external-activation-signature-bundle',
      requestDigest: request.requestDigest,
      signatures: [{
        signerKeyId: 'external-operator-fixture',
        subject: 'independent-external-operator',
        signature,
      }],
    }
    const signatures = validateExternalActivationSignatureBundle(bundle, request)
    const proposal = createExternalActivationProposal({
      ...contextOverrides,
      signingRequest: request,
      signatures,
      now: NOW,
    })
    assert.equal(validateExternalActivationProposal(proposal, {
      ...contextOverrides,
      signingRequest: request,
      now: NOW,
    }).proposalDigest, proposal.proposalDigest)
    const activationValidationOptions = {
      inventory: ctx.inventory,
      desired: ctx.desired,
      rings: ctx.rings,
      issuerRegistry: ctx.issuerRegistry,
      policy: ctx.activationPolicy,
      mutationBoundaryContract: ctx.mutationBoundaryContract,
      now: NOW,
    }
    assert.equal(validateExternalActivationCarrierAfterImage(
      ctx.activationLedger,
      proposal.ledgerAfter,
      activationValidationOptions,
    ), true)
    assert.equal(validateExternalActivationCarrierAfterImage(
      proposal.ledgerAfter,
      proposal.ledgerAfter,
      activationValidationOptions,
    ), true)
    const downgraded = structuredClone(proposal.ledgerAfter)
    const activatedIndex = downgraded.requirements.findIndex(item => item.id === request.requirementId)
    downgraded.requirements[activatedIndex] = structuredClone(
      ctx.activationLedger.requirements.find(item => item.id === request.requirementId),
    )
    assert.throws(
      () => validateExternalActivationCarrierAfterImage(
        proposal.ledgerAfter,
        downgraded,
        activationValidationOptions,
      ),
      /cannot downgrade, refresh, or substitute already-activated requirement/,
    )
    const substituted = structuredClone(proposal.ledgerAfter)
    substituted.requirements[activatedIndex].observedAt = '2026-07-23T00:00:01.000Z'
    assert.throws(
      () => validateExternalActivationCarrierAfterImage(
        proposal.ledgerAfter,
        substituted,
        activationValidationOptions,
      ),
      /cannot downgrade, refresh, or substitute|observedAt|payload|signature/,
    )
    const ledgerPath = resolve(repoRoot, 'infra/governance/external-activation-requirements.json')
    const ledgerBefore = readFileSync(ledgerPath)
    const handoff = createReviewedExternalActivationHandoff({
      ...contextOverrides,
      reviewedProposal: proposal,
      signingRequest: request,
      expectedProposalDigest: proposal.proposalDigest,
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      expectedBaseTree: EXPECTED_BASE_TREE,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: proposal.ledger.beforeSha256,
      now: NOW,
    })
    assert.equal(handoff.canonicalLedgerMutationPerformed, false)
    assert.equal(validateExternalLedgerTransactionHandoff(handoff, {
      ...contextOverrides,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: proposal.ledger.beforeSha256,
      now: NOW,
    }).handoffDigest, handoff.handoffDigest)
    assert.throws(() => applyReviewedExternalActivationProposal({
      proposalBytes: canonicalBytes(proposal),
      signingRequest: request,
      expectedProposalDigest: proposal.proposalDigest,
      ledgerPath,
      now: NOW,
    }), error => error.code === 'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED')
    assert.deepEqual(readFileSync(ledgerPath), ledgerBefore)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('external operator accepts only the exact authority/template/consumer Writer App installation routes', () => {
  const ctx = context()
  ctx.desired.integrations.governanceCheckApp.id = 101
  ctx.desired.integrations.governanceWriterApp.id = 202
  const repoRoot = makeRepoRoot(ctx)
  try {
    const contextOverrides = overrides(ctx, repoRoot)
    const proposalFor = mutateClaims => {
      const observedResource = githubAppObservedResource(ctx)
      mutateClaims(observedResource)
      const request = createExternalActivationSigningRequest({
        ...contextOverrides,
        requirementId: 'resolve-governance-app-identities',
        observedResource,
        observedAt: '2026-07-22T23:30:00.000Z',
        expiresAt: '2026-07-23T00:30:00.000Z',
        now: NOW,
      })
      const signatures = [{
        signerKeyId: 'external-operator-fixture',
        subject: 'independent-external-operator',
        signature: sign(
          null,
          Buffer.from(request.signingPayloadBase64, 'base64'),
          ctx.privateKey,
        ).toString('base64url'),
      }]
      return createExternalActivationProposal({
        ...contextOverrides,
        signingRequest: request,
        signatures,
        now: NOW,
      })
    }
    assert.equal(proposalFor(() => {}).reviewedRequirement.status, 'activated')

    for (const [label, mutateClaims] of [
      ['wrong authority external-ledger target', claims => {
        const probe = claims.installationTokenProbes.find(item => (
          item.credentialRepository === 'ajenchen/design-system'
            && item.environment === 'governance-external-ledger'
        ))
        assert(probe)
        probe.targetRepository = 'ajenchen/ds-product-template'
        claims.installationTokenProbesDigest = sha256(stableStringify(claims.installationTokenProbes, 0))
      }],
      ['missing authority installation', claims => {
        claims.installationRepositoriesByIntegration.governanceWriterApp = (
          claims.installationRepositoriesByIntegration.governanceWriterApp
            .filter(repository => repository !== 'ajenchen/design-system')
        )
        claims.installationRepositoriesDigest = sha256(stableStringify(claims.installationRepositoriesByIntegration, 0))
      }],
      ['extra Writer App installation', claims => {
        claims.installationRepositoriesByIntegration.governanceWriterApp.push('ajenchen/unmanaged')
        claims.installationRepositoriesDigest = sha256(stableStringify(claims.installationRepositoriesByIntegration, 0))
      }],
      ['duplicate credential route', claims => {
        const mirror = claims.installationTokenProbes.find(item => item.environment === 'governance-mirror')
        const externalLedgerIndex = claims.installationTokenProbes.findIndex(item => (
          item.environment === 'governance-external-ledger'
        ))
        assert(mirror && externalLedgerIndex >= 0)
        claims.installationTokenProbes[externalLedgerIndex] = {
          ...structuredClone(mirror),
          installationId: claims.installationTokenProbes[externalLedgerIndex].installationId,
        }
        claims.installationTokenProbesDigest = sha256(stableStringify(claims.installationTokenProbes, 0))
      }],
    ]) {
      assert.throws(
        () => proposalFor(mutateClaims),
        error => error?.code === 'EXTERNAL_ACTIVATION_PROPOSAL_BLOCKED',
        label,
      )
    }
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('activation flow exposes typed blockers and rejects wrong signatures, open bundles, replay, and absent trust', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const contextOverrides = overrides(ctx, repoRoot)
    const input = {
      ...contextOverrides,
      requirementId: 'activate-independent-finalizer-signed-authority',
      observedResource: {
        allowedKeyIds: ['release-authorizer-a'],
        quorum: 1,
        issuerRegistryDigest: issuerRegistryDigest(ctx.issuerRegistry),
      },
      observedAt: '2026-07-23T00:00:00.000Z',
      expiresAt: '2026-07-24T00:00:00.000Z',
      now: NOW,
    }
    const request = createExternalActivationSigningRequest(input)
    const wrongKeys = generateKeyPairSync('ed25519')
    const wrongSignature = sign(null, Buffer.from(request.signingPayloadBase64, 'base64'), wrongKeys.privateKey).toString('base64url')
    const wrong = [{
      signerKeyId: 'external-operator-fixture',
      subject: 'independent-external-operator',
      signature: wrongSignature,
    }]
    assert.throws(
      () => createExternalActivationProposal({ ...contextOverrides, signingRequest: request, signatures: wrong, now: NOW }),
      /EXTERNAL_ACTIVATION_PROPOSAL_BLOCKED/,
    )
    assert.throws(() => validateExternalActivationSignatureBundle({
      $schema: '../schemas/external-activation-signature-bundle.schema.json',
      schemaVersion: 1,
      kind: 'external-activation-signature-bundle',
      requestDigest: request.requestDigest,
      signatures: wrong,
      extra: true,
    }, request), /invalid or open shape/)
    const replay = structuredClone(request)
    replay.requestDigest = '0'.repeat(64)
    assert.throws(() => validateExternalActivationSigningRequest(replay, { ...contextOverrides, now: NOW }), /request digest/)

    const emptyRegistry = structuredClone(ctx.issuerRegistry)
    emptyRegistry.issuers = []
    const emptyRings = structuredClone(ctx.rings)
    emptyRings.attestationPolicy.allowedKeyIds = []
    emptyRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(emptyRegistry)
    assert.throws(
      () => createExternalActivationSigningRequest({
        ...input,
        issuerRegistry: emptyRegistry,
        rings: emptyRings,
      }),
      /EXTERNAL_ACTIVATION_SIGNING_REQUEST_BLOCKED/,
    )
    assert.throws(
      () => createExternalActivationSigningRequest({
        ...input,
        observedAt: '2026-07-23T00:30:00.000Z',
      }),
      /future/,
    )
    const result = externalOperatorBlockResult(new Error('issuer trust is not activated'))
    assert.equal(result.ready, false)
    assert.equal(result.externalMutationPerformed, false)
    assert.match(result.blockers[0].code, /^[A-Z][A-Z0-9_]*$/)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('all external operator artifacts satisfy their closed schemas and exact digest projections', () => {
  const ctx = context()
  const repoRoot = makeRepoRoot(ctx)
  try {
    const schemas = compileSchemas()
    const evidence = signedSurfaceReceipt(ctx)
    const imported = materializeExternalSurfaceReceipt(canonicalBytes(evidence), {
      repoRoot,
      runtimeProfile: ctx.runtimeProfile,
      issuerRegistry: ctx.issuerRegistry,
      now: NOW,
    })
    const contextOverrides = overrides(ctx, repoRoot)
    const certification = createExternalCertificationProposal({
      ...contextOverrides,
      reference: imported.reference,
      artifactSha256: imported.artifactSha256,
      certifiedAt: CERTIFIED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    })
    const request = createExternalActivationSigningRequest({
      ...contextOverrides,
      requirementId: 'activate-independent-finalizer-signed-authority',
      observedResource: {
        allowedKeyIds: ['release-authorizer-a'],
        quorum: 1,
        issuerRegistryDigest: issuerRegistryDigest(ctx.issuerRegistry),
      },
      observedAt: '2026-07-23T00:00:00.000Z',
      expiresAt: '2026-07-24T00:00:00.000Z',
      now: NOW,
    })
    const bundle = {
      $schema: '../schemas/external-activation-signature-bundle.schema.json',
      schemaVersion: 1,
      kind: 'external-activation-signature-bundle',
      requestDigest: request.requestDigest,
      signatures: [{
        signerKeyId: 'external-operator-fixture',
        subject: 'independent-external-operator',
        signature: sign(null, Buffer.from(request.signingPayloadBase64, 'base64'), ctx.privateKey).toString('base64url'),
      }],
    }
    const activation = createExternalActivationProposal({
      ...contextOverrides,
      signingRequest: request,
      signatures: validateExternalActivationSignatureBundle(bundle, request),
      now: NOW,
    })
    const certificationHandoff = createReviewedExternalCertificationHandoff({
      ...contextOverrides,
      reviewedProposal: certification,
      expectedProposalDigest: certification.proposalDigest,
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      expectedBaseTree: EXPECTED_BASE_TREE,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: certification.ledger.beforeSha256,
      now: NOW,
    })
    const activationHandoff = createReviewedExternalActivationHandoff({
      ...contextOverrides,
      reviewedProposal: activation,
      signingRequest: request,
      expectedProposalDigest: activation.proposalDigest,
      expectedBaseCommit: EXPECTED_BASE_COMMIT,
      currentBaseCommit: EXPECTED_BASE_COMMIT,
      expectedBaseTree: EXPECTED_BASE_TREE,
      currentBaseTree: EXPECTED_BASE_TREE,
      baseLedgerSha256: activation.ledger.beforeSha256,
      now: NOW,
    })
    const block = externalOperatorBlockResult(new Error('fixture blocker'))
    const artifacts = [
      ['external-surface-import-receipt', imported.receipt],
      ['external-runtime-certification-proposal', certification],
      ['external-activation-signing-request', request],
      ['external-activation-signature-bundle', bundle],
      ['external-activation-proposal', activation],
      ['external-ledger-transaction-handoff', certificationHandoff],
      ['external-ledger-transaction-handoff', activationHandoff],
      ['external-operator-block-result', block],
    ]
    for (const [name, value] of artifacts) {
      assert.equal(schemas[name](value), true, `${name}: ${schemas[name].errors?.map(error => error.message).join('; ')}`)
    }
    const { receiptDigest, ...receiptCore } = imported.receipt
    assert.equal(receiptDigest, externalOperatorTestHarness.digestValue(receiptCore))
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('CLI is provider-neutral, exposes handoff aliases, and typed-blocks absent trust and deprecated direct apply without mutation', () => {
  const packageJson = readJson(resolve(GOVERNANCE_ROOT, '../../package.json'))
  assert.equal(packageJson.scripts['governance:external'], 'node infra/governance/bin/external-operator.mjs')
  assert.equal(
    packageJson.scripts['governance:external:certification-handoff'],
    'node infra/governance/bin/external-operator.mjs handoff-reviewed-certification',
  )
  assert.equal(
    packageJson.scripts['governance:external:activation-handoff'],
    'node infra/governance/bin/external-operator.mjs handoff-reviewed-activation',
  )
  const help = spawnSync(process.execPath, ['infra/governance/bin/external-operator.mjs', '--help'], {
    cwd: resolve(GOVERNANCE_ROOT, '../..'),
    encoding: 'utf8',
  })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /No command owns a private key or mutates GitHub, npm, a provider/)
  assert.match(help.stdout, /never write canonical\s+ledgers directly/)

  const certificationLedger = resolve(GOVERNANCE_ROOT, 'providers/certifications.json')
  const activationLedger = resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json')
  const certificationBefore = readFileSync(certificationLedger)
  const activationBefore = readFileSync(activationLedger)
  for (const command of ['apply-reviewed-certification', 'apply-reviewed-activation']) {
    const deprecated = spawnSync(process.execPath, [
      'infra/governance/bin/external-operator.mjs',
      command,
      '--json',
    ], {
      cwd: resolve(GOVERNANCE_ROOT, '../..'),
      encoding: 'utf8',
    })
    assert.equal(deprecated.status, 2, deprecated.stderr)
    const result = JSON.parse(deprecated.stdout)
    assert.equal(result.blockers[0].code, 'EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED')
  }
  assert.deepEqual(readFileSync(certificationLedger), certificationBefore)
  assert.deepEqual(readFileSync(activationLedger), activationBefore)

  const root = mkdtempSync(resolve(tmpdir(), 'external-operator-cli-'))
  try {
    const observed = resolve(root, 'observed.json')
    writeFileSync(observed, canonicalBytes({
      allowedKeyIds: ['release-authorizer-a'],
      quorum: 1,
      issuerRegistryDigest: '0'.repeat(64),
    }))
    const blocked = spawnSync(process.execPath, [
      'infra/governance/bin/external-operator.mjs',
      'prepare-activation',
      '--requirement-id', 'activate-independent-finalizer-signed-authority',
      '--observed-resource', observed,
      '--observed-at', '2026-07-23T00:00:00.000Z',
      '--expires-at', '2026-07-24T00:00:00.000Z',
      '--json',
    ], {
      cwd: resolve(GOVERNANCE_ROOT, '../..'),
      encoding: 'utf8',
    })
    assert.equal(blocked.status, 2)
    const result = JSON.parse(blocked.stdout)
    assert.equal(result.$schema, '../schemas/external-operator-block-result.schema.json')
    assert.equal(result.ready, false)
    assert.equal(result.externalMutationPerformed, false)
    assert.match(result.blockers[0].code, /^[A-Z][A-Z0-9_]*$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
