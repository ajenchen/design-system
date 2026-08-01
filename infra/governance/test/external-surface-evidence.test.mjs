import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readJson, resolveCertificationCanary, sha256, stableStringify } from '../lib/common.mjs'
import { buildRepositorySubjectProof } from '../lib/repository-subject-proof.mjs'
import {
  externalGitHubCheckRunDigest,
  externalGitHubControlPlaneDigest,
  externalGitHubDesiredPolicy,
  externalGitHubRulesetReadbackDigest,
  externalGitHubWorkflowRunDigest,
  externalHardGateContractDigest,
  externalManagedControlPlaneDigest,
  externalManagedSessionDigest,
  externalRepositoryReadbackDigest,
  externalSurfaceDistributionDigest,
  externalSurfaceDistributionIdentityDigest,
  externalSurfaceEvidenceSigningPayload,
  validateExternalSurfaceEvidence,
  validateExternalSurfaceEvidenceBinding,
} from '../lib/external-surface-evidence.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { validateCertifications, validateProviderRegistry } from '../lib/model-validation.mjs'
import { runtimeTargetDigest } from '../lib/provider-runtime-conformance.mjs'
import { certificationCarrierPolicyForRole } from '../lib/role-surface-policy.mjs'

const GOVERNANCE_ROOT = resolve(import.meta.dirname, '..')
const MATRIX = readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'))
const BASE_PROFILE = readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'))
const CANONICAL_LEDGER = readJson(resolve(GOVERNANCE_ROOT, 'providers/certifications.json'))
const INVENTORY = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
const DESIRED = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
const EXTERNAL_SCHEMA = readJson(resolve(GOVERNANCE_ROOT, 'schemas/external-surface-evidence.schema.json'))
const CERTIFICATION_SCHEMA = readJson(resolve(GOVERNANCE_ROOT, 'schemas/provider-surface-certification.schema.json'))
const ROLE_SURFACE_POLICY = readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json'))
const FIXTURE_DESIRED = structuredClone(DESIRED)
FIXTURE_DESIRED.integrations.governanceCheckApp.id = 424242
const GENERATED_AT = '2026-07-20T00:00:00.000Z'
const VALID_UNTIL = '2026-07-21T00:00:00.000Z'
const NOW = new Date('2026-07-20T01:00:00.000Z')
const PROFILE_DIGEST = `sha256:${'8'.repeat(64)}`
const HARNESS_DIGEST = `sha256:${'9'.repeat(64)}`
const CONTROL_PLANE_IDENTITY = Object.freeze({ profileDigest: PROFILE_DIGEST, harnessDigest: HARNESS_DIGEST })
const REPOSITORY_IDENTITIES = Object.freeze(Object.fromEntries(INVENTORY.repositories.map((repository, index) => [
  repository.id,
  (() => {
    const gitCommit = String.fromCharCode(97 + index).repeat(40)
    const gitTree = String.fromCharCode(100 + index).repeat(40)
    return {
      gitCommit,
      gitTree,
      subjectProofs: {
        [gitCommit]: buildRepositorySubjectProof(repository, {
          subjectCommit: gitCommit,
          subjectTree: gitTree,
          carrierCommit: gitCommit,
          carrierTree: gitTree,
        }),
      },
    }
  })(),
])))

function signingContext() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [{
      keyId: 'external-runtime-fixture',
      subject: 'fixture-external-runtime-authority',
      publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['runtime-evidence-issuer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    }],
  }
  const runtimeProfile = structuredClone(BASE_PROFILE)
  runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  runtimeProfile.allowedKeyIds = ['external-runtime-fixture']
  runtimeProfile.requiredIssuerQuorum = 1
  return { privateKey, issuerRegistry, runtimeProfile }
}

function signEvidence(evidence, context) {
  const value = structuredClone(evidence)
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = value
  value.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  value.attestation = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-evidence-attestation',
    status: 'verified',
    issuerId: 'external-runtime-fixture',
    issuerRegistryDigest: context.runtimeProfile.issuerRegistryDigest,
    algorithm: 'ed25519',
    evidenceDigest: value.evidenceDigest,
    runId: value.run.runId,
    signature: null,
    coSignatures: [],
  }
  value.attestation.signature = sign(
    null,
    externalSurfaceEvidenceSigningPayload(value, value.attestation.issuerId),
    context.privateKey,
  ).toString('base64')
  return value
}

function compatibilityProvider(profileProvider) {
  const matches = Object.entries(MATRIX.providers).filter(([, registration]) => (
    registration.adapterProviderId === profileProvider.adapterProviderId
    && registration.runtimeKinds?.[profileProvider.runtimeKind]?.runtimeProfilesBySurface?.[profileProvider.certificationSurface] === profileProvider.id
  ))
  assert.equal(matches.length, 1, `profile ${profileProvider.id} must resolve exactly one compatibility provider`)
  return matches[0][0]
}

function repositoryForRole(role) {
  return resolveCertificationCanary(INVENTORY, role)
}

function externalTuples(context) {
  return CANONICAL_LEDGER.certifications.flatMap((record) => {
    const profileId = MATRIX.providers[record.provider]?.runtimeKinds?.[record.runtimeKind]?.runtimeProfilesBySurface?.[record.surface]
    const profileProvider = context.runtimeProfile.providers.find(profile => profile.id === profileId)
    return profileProvider?.executionMode === 'external-attested'
      ? [{ record, profileProvider, repository: repositoryForRole(record.repositoryRole) }]
      : []
  })
}

function setCheckReceipt(evidence, driver, receiptSha256) {
  const matches = evidence.checks.filter(check => check.driver === driver)
  assert.equal(matches.length, 1, `fixture must contain one ${driver} check`)
  matches[0].receiptSha256 = receiptSha256
}

function refreshManagedBinding(evidence) {
  const binding = evidence.surfaceBinding
  binding.repositoryReadbackSha256 = externalRepositoryReadbackDigest({
    id: binding.repositoryId,
    github: binding.repository,
    role: binding.repositoryRole,
    defaultBranch: binding.defaultBranch,
  }, evidence.subject)
  binding.distributionReadbackSha256 = evidence.distribution.identityDigest.slice('sha256:'.length)
  setCheckReceipt(evidence, 'external-distribution-identity', binding.distributionReadbackSha256)
  setCheckReceipt(evidence, 'external-hard-gate-receipt', binding.hardGateReceiptSha256)
  binding.sessionIdentitySha256 = externalManagedSessionDigest(evidence)
  setCheckReceipt(evidence, 'external-runtime-session-binding', binding.sessionIdentitySha256)
  binding.controlPlaneReadbackSha256 = externalManagedControlPlaneDigest(evidence)
}

function refreshGitHubBinding(evidence) {
  const binding = evidence.surfaceBinding
  binding.evidenceRunId = evidence.run.runId
  binding.repositoryReadbackSha256 = externalRepositoryReadbackDigest({
    id: binding.repositoryId,
    github: binding.repository,
    role: binding.repositoryRole,
    defaultBranch: binding.defaultBranch,
  }, evidence.subject)
  binding.oidcSubjectSha256 = sha256(binding.oidcSubject)
  binding.checkRunSha256 = externalGitHubCheckRunDigest(binding)
  binding.rulesetReadbackSha256 = externalGitHubRulesetReadbackDigest(binding)
  binding.controlPlaneReadbackSha256 = externalGitHubControlPlaneDigest(evidence)
  binding.workflowRunReadbackSha256 = externalGitHubWorkflowRunDigest(binding)
  setCheckReceipt(evidence, 'external-distribution-identity', evidence.distribution.identityDigest.slice('sha256:'.length))
  setCheckReceipt(evidence, 'external-hard-gate-receipt', binding.artifactSha256)
  setCheckReceipt(evidence, 'github-workflow-run-binding', binding.workflowRunReadbackSha256)
  setCheckReceipt(evidence, 'github-ruleset-readback', binding.rulesetReadbackSha256)
}

function evidenceFor(tuple, index, context, { repository = tuple.repository } = {}) {
  const { profileProvider, record } = tuple
  const target = profileProvider.certificationTargets[0]
  const authority = profileProvider.distributionVersionAuthority
  const repositoryIdentity = REPOSITORY_IDENTITIES[tuple.repository.id]
  const evidence = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-conformance',
    status: 'pass',
    profile: {
      id: profileProvider.id,
      adapterProviderId: profileProvider.adapterProviderId,
      runtimeKind: profileProvider.runtimeKind,
      surface: profileProvider.certificationSurface,
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: record.repositoryRole,
    },
    run: {
      runId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      generatedAt: GENERATED_AT,
      validUntil: VALID_UNTIL,
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      pathClass: target.pathClass,
      targetId: target.id,
      targetDigest: runtimeTargetDigest(target),
    },
    subject: {
      gitCommit: repositoryIdentity.gitCommit,
      gitTree: repositoryIdentity.gitTree,
      profileDigest: PROFILE_DIGEST,
      harnessDigest: HARNESS_DIGEST,
      hardGateContractDigest: externalHardGateContractDigest(MATRIX, record.repositoryRole),
    },
    distribution: {
      authority: authority.authority,
      productId: authority.productId,
      version: authority.version,
      identityDigest: null,
    },
    checks: profileProvider.checks.map(check => ({
      id: check.id,
      driver: check.driver,
      status: 'pass',
      receiptSha256: '0'.repeat(64),
    })),
    surfaceBinding: null,
    attestation: null,
    evidenceDigest: null,
  }
  evidence.distribution.identityDigest = externalSurfaceDistributionIdentityDigest(evidence.distribution)
  if (profileProvider.certificationSurface === 'github-actions') {
    const expected = externalGitHubDesiredPolicy(FIXTURE_DESIRED, repository, profileProvider)
    evidence.surfaceBinding = {
      kind: 'github-actions-readback',
      evidenceRunId: evidence.run.runId,
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: record.repositoryRole,
      defaultBranch: repository.defaultBranch,
      repositoryReadbackSha256: '0'.repeat(64),
      protectedRef: expected.protectedRef,
      workflowPath: expected.workflowPath,
      workflowBlobSha256: expected.workflowBlobSha256,
      workflowGitBlobSha: expected.workflowGitBlobSha,
      workflowSemanticSha256: expected.workflowSemanticSha256,
      runDatabaseId: String(10_000_000 + index),
      runAttempt: 1,
      event: expected.event,
      headSha: evidence.subject.gitCommit,
      treeSha: evidence.subject.gitTree,
      artifactName: expected.artifactName,
      artifactSha256: sha256(`artifact/${profileProvider.id}/${record.repositoryRole}/${index}`),
      checkName: expected.checkName,
      checkConclusion: 'success',
      checkAppId: expected.checkAppId,
      checkRunSha256: '0'.repeat(64),
      workflowRunReadbackSha256: '0'.repeat(64),
      rulesetId: String(20_000_000 + index),
      rulesetName: expected.rulesetName,
      rulesetEnforcement: 'active',
      requiredCheckName: expected.checkName,
      rulesetPolicyDigest: expected.rulesetPolicyDigest,
      rulesetReadbackSha256: '0'.repeat(64),
      desiredStateDigest: expected.desiredStateDigest,
      controlPlaneReadbackSha256: '0'.repeat(64),
      oidcIssuer: 'https://token.actions.githubusercontent.com',
      oidcSubject: expected.oidcSubject,
      oidcSubjectSha256: '0'.repeat(64),
    }
    refreshGitHubBinding(evidence)
  } else {
    evidence.surfaceBinding = {
      kind: 'managed-runtime-readback',
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: record.repositoryRole,
      defaultBranch: repository.defaultBranch,
      sessionIdentitySha256: '0'.repeat(64),
      repositoryReadbackSha256: '0'.repeat(64),
      distributionReadbackSha256: '0'.repeat(64),
      hardGateReceiptSha256: sha256(`hard-gate/${profileProvider.id}/${record.repositoryRole}/${index}`),
      controlPlaneReadbackSha256: '0'.repeat(64),
    }
    refreshManagedBinding(evidence)
  }
  return signEvidence(evidence, context)
}

function certificationFor(tuple, evidence, artifact) {
  const { profileProvider, record } = tuple
  const target = profileProvider.certificationTargets[0]
  return {
    id: `${profileProvider.id}-${record.repositoryRole}-signed-fixture`,
    provider: compatibilityProvider(profileProvider),
    runtimeKind: profileProvider.runtimeKind,
    providerVersion: target.distributionVersion,
    adapterVersion: 'governance-protocol-1',
    surface: profileProvider.certificationSurface,
    repositoryRole: record.repositoryRole,
    status: 'certified',
    certifiedAt: '2026-07-20T00:05:00.000Z',
    expiresAt: '2026-07-20T12:00:00.000Z',
    platformMatrix: [{ ...target, status: 'certified', limitations: [] }],
    runtimeEvidence: {
      evidenceKind: evidence.kind,
      reference: artifact.reference,
      artifactSha256: artifact.sha256,
      evidenceDigest: evidence.evidenceDigest,
      profileId: profileProvider.id,
      runId: evidence.run.runId,
      targetId: target.id,
      targetDigest: evidence.run.targetDigest,
      repositoryId: evidence.profile.repositoryId,
      repository: evidence.profile.repository,
      repositoryRole: evidence.profile.repositoryRole,
      repositoryReadbackSha256: evidence.surfaceBinding.repositoryReadbackSha256,
      operatingSystem: target.operatingSystem,
      platform: target.platform,
      arch: target.arch,
      executionEnvironment: target.executionEnvironment,
      distributionVersion: target.distributionVersion,
      pathClass: target.pathClass,
      distributionDigest: externalSurfaceDistributionDigest(evidence.distribution),
      ...evidence.subject,
    },
    checks: [{ id: 'external-runtime-evidence', status: 'pass', evidence: { kind: 'artifact-digest', reference: artifact.reference, sha256: artifact.sha256 } }],
    limitations: [],
  }
}

function writeEvidence(repoRoot, evidence) {
  const bytes = Buffer.from(`${stableStringify(evidence)}\n`)
  const artifactSha256 = sha256(bytes)
  const reference = `infra/governance/evidence/external-runtime/${artifactSha256}.json`
  mkdirSync(resolve(repoRoot, 'infra/governance/evidence/external-runtime'), { recursive: true })
  writeFileSync(resolve(repoRoot, reference), bytes)
  return { reference, sha256: artifactSha256 }
}

function bindingOptions(tuple, evidence, certification, context) {
  return {
    certification,
    certificationTarget: certification.platformMatrix[0],
    repositoryTarget: tuple.repository,
    repositoryIdentity: REPOSITORY_IDENTITIES[tuple.repository.id],
    carrierPolicy: certificationCarrierPolicyForRole(ROLE_SURFACE_POLICY, tuple.repository.role),
    profileProvider: tuple.profileProvider,
    runtimeProfile: context.runtimeProfile,
    matrix: MATRIX,
    desiredGithub: FIXTURE_DESIRED,
    identity: CONTROL_PLANE_IDENTITY,
    issuerRegistry: context.issuerRegistry,
    now: NOW,
    evidence,
  }
}

test('every external role tuple has unique signed, fresh, repository-bound certification evidence', () => {
  const context = signingContext()
  const tuples = externalTuples(context)
  assert.equal(tuples.length, 17, 'the 21-tuple fleet must contain 17 external-attested role tuples')
  assert.equal(new Set(tuples.map(tuple => tuple.profileProvider.id)).size, 6)
  const repoRoot = mkdtempSync(resolve(tmpdir(), 'external-runtime-evidence-'))
  try {
    const certifications = tuples.map((tuple, index) => {
      const evidence = evidenceFor(tuple, index, context)
      assert.equal(validateExternalSurfaceEvidence(evidence), true)
      return certificationFor(tuple, evidence, writeEvidence(repoRoot, evidence))
    })
    const ledger = { schemaVersion: 2, certifications }
    assert.equal(validateProviderRegistry(MATRIX, context.runtimeProfile, { issuerRegistry: context.issuerRegistry }).aliases.size, context.runtimeProfile.providers.length)
    assert.equal(validateCertifications(ledger, {
      now: NOW,
      repoRoot,
      runtimeIdentity: CONTROL_PLANE_IDENTITY,
      matrix: MATRIX,
      runtimeProfile: context.runtimeProfile,
      issuerRegistry: context.issuerRegistry,
      inventory: INVENTORY,
      desiredGithub: FIXTURE_DESIRED,
      externalRepositoryIdentities: REPOSITORY_IDENTITIES,
    }), true)

    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    const validateExternalSchema = ajv.compile(EXTERNAL_SCHEMA)
    const validateCertificationSchema = ajv.compile(CERTIFICATION_SCHEMA)
    for (const certification of certifications) {
      const bytes = readJson(resolve(repoRoot, certification.runtimeEvidence.reference))
      assert.equal(validateExternalSchema(bytes), true, ajv.errorsText(validateExternalSchema.errors))
    }
    assert.equal(validateCertificationSchema(ledger), true, ajv.errorsText(validateCertificationSchema.errors))
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('managed evidence rejects cross-repository replay and mixed repository/distribution/hard-gate/session receipts', () => {
  const context = signingContext()
  const tuples = externalTuples(context)
  const authority = tuples.find(tuple => tuple.profileProvider.id === 'codex-cloud' && tuple.record.repositoryRole === 'authority')
  const template = tuples.find(tuple => tuple.profileProvider.id === 'codex-cloud' && tuple.record.repositoryRole === 'template-mirror')
  const baseline = evidenceFor(authority, 30, context)
  const baselineCertification = certificationFor(authority, baseline, { reference: `infra/governance/evidence/external-runtime/${'f'.repeat(64)}.json`, sha256: 'f'.repeat(64) })
  assert.equal(validateExternalSurfaceEvidenceBinding(baseline, bindingOptions(authority, baseline, baselineCertification, context)), true)

  const replay = structuredClone(baseline)
  replay.profile.repositoryRole = 'template-mirror'
  replay.surfaceBinding.repositoryRole = 'template-mirror'
  replay.subject.hardGateContractDigest = externalHardGateContractDigest(MATRIX, 'template-mirror')
  refreshManagedBinding(replay)
  const signedReplay = signEvidence(replay, context)
  const templateCertification = certificationFor(template, signedReplay, { reference: `infra/governance/evidence/external-runtime/${'e'.repeat(64)}.json`, sha256: 'e'.repeat(64) })
  assert.throws(
    () => validateExternalSurfaceEvidenceBinding(signedReplay, bindingOptions(template, signedReplay, templateCertification, context)),
    /repository differs from the certification inventory target/,
  )

  const mixed = structuredClone(baseline)
  mixed.surfaceBinding.distributionReadbackSha256 = sha256('other-distribution')
  mixed.surfaceBinding.hardGateReceiptSha256 = sha256('other-hard-gate')
  mixed.surfaceBinding.sessionIdentitySha256 = sha256('other-session')
  const signedMixed = signEvidence(mixed, context)
  assert.throws(() => validateExternalSurfaceEvidence(signedMixed), /distribution readback differs|hard-gate receipt is detached|session receipt is detached/)
})

test('Codex Desktop local evidence is exact-version, exact-path, externally attested, and not substitutable by CLI evidence', () => {
  const context = signingContext()
  const tuple = externalTuples(context).find(candidate => (
    candidate.profileProvider.id === 'codex-desktop-local'
    && candidate.record.repositoryRole === 'authority'
  ))
  assert.ok(tuple, 'Codex Desktop local authority tuple is missing')
  const baseline = evidenceFor(tuple, 35, context)
  const certification = certificationFor(tuple, baseline, {
    reference: `infra/governance/evidence/external-runtime/${'c'.repeat(64)}.json`,
    sha256: 'c'.repeat(64),
  })
  const options = evidence => bindingOptions(tuple, evidence, certification, context)
  assert.equal(validateExternalSurfaceEvidenceBinding(baseline, options(baseline)), true)
  assert.equal(baseline.distribution.version, '26.721.30844')
  assert.equal(baseline.run.pathClass, 'no-space')
  assert.equal(baseline.run.targetId, 'macos-darwin-arm64-native-no-space')

  const unsigned = structuredClone(baseline)
  unsigned.attestation.status = 'unverified'
  unsigned.attestation.signature = null
  assert.throws(
    () => validateExternalSurfaceEvidenceBinding(unsigned, options(unsigned)),
    /requires a verified issuer attestation|attestation.*invalid|signature/i,
    'unsigned Desktop evidence was accepted',
  )

  const unknownVersion = structuredClone(baseline)
  unknownVersion.distribution.version = '26.999.99999'
  unknownVersion.distribution.identityDigest = externalSurfaceDistributionIdentityDigest(unknownVersion.distribution)
  refreshManagedBinding(unknownVersion)
  const signedUnknownVersion = signEvidence(unknownVersion, context)
  assert.throws(
    () => validateExternalSurfaceEvidenceBinding(signedUnknownVersion, options(signedUnknownVersion)),
    /distributionVersion differs from its profile\/certification target|differs from its canonical authority/,
    'an unregistered Desktop version inherited certification',
  )

  const containsSpaceTarget = tuple.profileProvider.certificationTargets
    .find(target => target.pathClass === 'contains-space')
  assert.ok(containsSpaceTarget, 'Codex Desktop contains-space target is missing')
  const crossedPathTarget = structuredClone(baseline)
  crossedPathTarget.run.targetId = containsSpaceTarget.id
  crossedPathTarget.run.targetDigest = runtimeTargetDigest(containsSpaceTarget)
  crossedPathTarget.run.pathClass = containsSpaceTarget.pathClass
  refreshManagedBinding(crossedPathTarget)
  const signedCrossedPathTarget = signEvidence(crossedPathTarget, context)
  assert.throws(
    () => validateExternalSurfaceEvidenceBinding(signedCrossedPathTarget, options(signedCrossedPathTarget)),
    /target is absent from the active profile or certification/,
    'contains-space Desktop evidence was accepted as no-space target evidence',
  )

  const cliSubstitution = structuredClone(baseline)
  cliSubstitution.profile.id = 'codex'
  cliSubstitution.profile.runtimeKind = 'codex-cli'
  refreshManagedBinding(cliSubstitution)
  const signedCliSubstitution = signEvidence(cliSubstitution, context)
  assert.throws(
    () => validateExternalSurfaceEvidenceBinding(signedCliSubstitution, options(signedCliSubstitution)),
    /profile\/certification binding mismatch/,
    'Codex CLI evidence was accepted as Codex Desktop evidence',
  )
})

test('GitHub Actions evidence selects hard gates by repository role and rejects wrong repo, workflow/event, App/ruleset and mixed bundles', () => {
  const context = signingContext()
  const tuples = externalTuples(context)
  const tuple = tuples.find(candidate => candidate.profileProvider.id === 'github-actions-hosted' && candidate.record.repositoryRole === 'authority')
  const consumerTuple = tuples.find(candidate => candidate.profileProvider.id === 'github-actions-hosted' && candidate.record.repositoryRole === 'product-consumer')
  const authorityPolicy = externalGitHubDesiredPolicy(FIXTURE_DESIRED, tuple.repository, tuple.profileProvider)
  const consumerPolicy = externalGitHubDesiredPolicy(FIXTURE_DESIRED, consumerTuple.repository, consumerTuple.profileProvider)
  assert.deepEqual(
    {
      checkName: authorityPolicy.checkName,
      checkAppId: authorityPolicy.checkAppId,
      event: authorityPolicy.event,
      oidcSubject: authorityPolicy.oidcSubject,
    },
    {
      checkName: 'Verify(tsc + tests + compile + build)',
      checkAppId: '15368',
      event: 'pull_request',
      oidcSubject: `repo:${tuple.repository.github}:pull_request`,
    },
  )
  assert.deepEqual(
    {
      checkName: consumerPolicy.checkName,
      checkAppId: consumerPolicy.checkAppId,
      event: consumerPolicy.event,
      oidcSubject: consumerPolicy.oidcSubject,
    },
    {
      checkName: 'Immutable consumer snapshot',
      checkAppId: String(FIXTURE_DESIRED.integrations.governanceCheckApp.id),
      event: 'pull_request_target',
      oidcSubject: `repo:${consumerTuple.repository.github}:environment:governance-check-verdict`,
    },
  )
  const baseline = evidenceFor(tuple, 40, context)
  const certification = certificationFor(tuple, baseline, { reference: `infra/governance/evidence/external-runtime/${'d'.repeat(64)}.json`, sha256: 'd'.repeat(64) })
  const options = evidence => bindingOptions(tuple, evidence, certification, context)
  assert.equal(validateExternalSurfaceEvidenceBinding(baseline, options(baseline)), true)

  const cases = [
    {
      name: 'cross-repository replay',
      pattern: /repository differs from the certification inventory target/,
      mutate(value) {
        value.profile.repositoryId = 'attacker-repository'
        value.profile.repository = 'attacker/repository'
        value.surfaceBinding.repositoryId = value.profile.repositoryId
        value.surfaceBinding.repository = value.profile.repository
        value.surfaceBinding.oidcSubject = 'repo:attacker/repository:pull_request'
      },
    },
    { name: 'candidate workflow', pattern: /workflowPath differs from the canonical/, mutate: value => { value.surfaceBinding.workflowPath = '.github/workflows/candidate.yml' } },
    { name: 'candidate event', pattern: /event differs from the canonical/, mutate: value => { value.surfaceBinding.event = 'pull_request_target' } },
    { name: 'wrong App', pattern: /checkAppId differs from the canonical/, mutate: value => { value.surfaceBinding.checkAppId = String(FIXTURE_DESIRED.integrations.governanceCheckApp.id) } },
    {
      name: 'wrong ruleset',
      pattern: /rulesetName differs from the canonical|rulesetPolicyDigest differs from the canonical/,
      mutate(value) {
        value.surfaceBinding.rulesetName = 'candidate/forged-ruleset'
        value.surfaceBinding.rulesetPolicyDigest = sha256('candidate-ruleset-policy')
      },
    },
    {
      name: 'mixed run bundle',
      pattern: /readback is detached from the external evidence run/,
      mutate(value) { value.surfaceBinding.evidenceRunId = 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
      preserveRunIdentity: true,
    },
  ]
  for (const item of cases) {
    const forged = structuredClone(baseline)
    item.mutate(forged)
    if (!item.preserveRunIdentity) refreshGitHubBinding(forged)
    else {
      forged.surfaceBinding.controlPlaneReadbackSha256 = externalGitHubControlPlaneDigest(forged)
      forged.surfaceBinding.workflowRunReadbackSha256 = externalGitHubWorkflowRunDigest(forged.surfaceBinding)
      setCheckReceipt(forged, 'github-workflow-run-binding', forged.surfaceBinding.workflowRunReadbackSha256)
    }
    const signed = signEvidence(forged, context)
    assert.throws(() => validateExternalSurfaceEvidenceBinding(signed, options(signed)), item.pattern, `${item.name} substitution was accepted`)
  }

  const stale = structuredClone(baseline)
  assert.throws(() => validateExternalSurfaceEvidenceBinding(stale, { ...options(stale), now: new Date('2026-07-21T00:00:00.001Z') }), /not fresh/)

  const wrongDistribution = structuredClone(baseline)
  wrongDistribution.distribution.authority = 'self-asserted-cli-version'
  wrongDistribution.distribution.identityDigest = externalSurfaceDistributionIdentityDigest(wrongDistribution.distribution)
  refreshGitHubBinding(wrongDistribution)
  const signedWrongDistribution = signEvidence(wrongDistribution, context)
  assert.throws(() => validateExternalSurfaceEvidenceBinding(signedWrongDistribution, options(signedWrongDistribution)), /differs from its canonical authority/)
})
