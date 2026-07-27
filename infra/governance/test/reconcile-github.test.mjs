import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  chmodSync,
  existsSync,
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
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
  FixtureApiClient,
  GhApiClient,
  CommandOffHostMirror,
  applyPlan as reconcileApplyPlan,
  authorityBootstrapJournalDigest,
  buildPlan as reconcileBuildPlan,
  computeEligibility as reconcileComputeEligibility,
  fetchRepositoryState,
  githubApiRequestArgs,
  journalAuthorizationEnvelopeDigest,
  main as reconcileMain,
  reconcileFixtureTestHarness,
  resolveRuntimeValidationContext,
  resolveActivatedAuthorityBootstrapMirrorIdentity,
  stageActionTransaction,
  transactionJournalActivationDigestExpectations,
  validateActionTransactionClass,
  validateAuthorityBootstrapBoundary,
  validateAuthorityBootstrapDurableReplayReceipt,
  validateAuthorityBootstrapJournal,
  validateTransactionJournal as reconcileValidateTransactionJournal,
  validateModel as reconcileValidateModel,
} from '../bin/reconcile-github.mjs'
import {
  compareUtf8Bytes,
  readJson as readJsonFile,
  runClosedGh,
  sha256,
  stableStringify,
} from '../lib/common.mjs'
import { candidateActionsDigest, issueApplyAuthorization } from '../lib/rollout-state-machine.mjs'
import { workflowIdentity } from '../lib/workflow-trust.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import {
  createFleetRecoveryAuthorization,
  historicalControlPlaneDigest,
  normalizeHistoricalControlPlane,
  signFleetRecoveryAuthorization,
  verifyFleetRecoveryAuthorization,
} from '../lib/fleet-recovery-authorization.mjs'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST,
  createExternalActivationEvidence,
  deriveGithubAppActivationExpectations,
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
  signExternalActivationRequirement,
} from '../lib/external-activation.mjs'
import {
  FLEET_RECONCILE_MIRROR_IDENTITY_KEYS,
  FLEET_RECONCILE_MIRROR_PROTOCOL,
  buildFleetReconcileEventMirrorRequest,
  buildFleetReconcileHeadVerificationRequest,
  fleetReconcileMirrorReceiptDigest,
  fleetReconcileMirrorSignedPayload,
  fleetReconcileMirrorVerificationDigest,
  validateFleetReconcileMirrorIdentity,
  validateFleetReconcileHeadVerification,
  validateFleetReconcileHeadVerificationRequest,
  validateFleetReconcileOffHostReceipt,
  verifyFleetReconcileJournalOffHost,
} from '../lib/fleet-reconcile-mirror.mjs'
import { createManagedCiActivationFixture } from './fixtures/managed-ci-activation-fixture.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/github')
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SCHEMAS = resolve(dirname(fileURLToPath(import.meta.url)), '../schemas')
function readJson(path) {
  const value = readJsonFile(path)
  if (value?.attestationPolicy) value.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  return value
}
const inventory = readJson(resolve(FIXTURES, 'inventory.json'))
const desired = readJson(resolve(FIXTURES, 'desired.json'))
const baseCertifications = readJson(resolve(FIXTURES, 'certifications.json'))
const baseIssuerRegistry = readJson(resolve(FIXTURES, 'issuer-registry.json'))
const baseRuntimeProfile = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/runtime-conformance.json'))
const compatibilityMatrix = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/compatibility-matrix.json'))

function transactionRuntimeProfile(source) {
  const value = structuredClone(source)
  for (const provider of value.providers.filter(item => item.executionMode === 'local-probe')) {
    const version = provider.certificationTargets[0].distributionVersion
    provider.executionMode = 'external-attested'
    provider.evidenceKind = 'external-runtime-surface-conformance'
    provider.surfacePolicy = { kind: 'inventory-repository-readback' }
    provider.executable = null
    provider.distributionVersionAuthority = {
      kind: 'external-runtime-identity',
      authority: 'fixture-signed-runtime-release',
      productId: provider.id,
      version,
    }
    provider.versionArguments = []
    provider.checks = [
      { id: `${provider.id}-distribution-identity`, driver: 'external-distribution-identity', requiresModel: false },
      { id: `${provider.id}-hard-gate-receipt`, driver: 'external-hard-gate-receipt', requiresModel: false },
      { id: `${provider.id}-runtime-session-binding`, driver: 'external-runtime-session-binding', requiresModel: false },
    ]
  }
  return value
}

function transactionCertificationLedger(source) {
  const value = structuredClone(source)
  for (const certification of value.certifications) {
    certification.status = 'certified'
    certification.certifiedAt = '2026-07-20T00:00:00.000Z'
    certification.expiresAt = '2026-07-20T01:00:00.000Z'
    certification.platformMatrix = certification.platformMatrix.map(target => ({
      ...target,
      status: 'certified',
      limitations: [],
    }))
    certification.checks = [{
      id: 'signed-runtime-evidence',
      status: 'pass',
      evidence: { kind: 'command-output', reference: 'fixture signed runtime evidence' },
    }]
    certification.limitations = []
    delete certification.runtimeEvidence
  }
  return value
}

const transactionRuntimeProfileSource = transactionRuntimeProfile(baseRuntimeProfile)
const transactionBaseCertifications = transactionCertificationLedger(baseCertifications)
const managedCiFixture = createManagedCiActivationFixture({
  repoRoot: REPO_ROOT,
  issuerRegistry: baseIssuerRegistry,
  runtimeProfile: transactionRuntimeProfileSource,
})
after(() => managedCiFixture.dispose())
const issuerRegistry = managedCiFixture.issuerRegistry
const runtimeProfile = managedCiFixture.runtimeProfile
const managedCiValidationContext = managedCiFixture.managedCiValidationContext
const externalRuntimeFixture = createExternalRuntimeCertificationFixture({
  inventory,
  desired,
  certifications: transactionBaseCertifications,
  matrix: compatibilityMatrix,
  runtimeProfile,
  signer: managedCiFixture.runtimeEvidenceSigner,
  now: new Date('2026-07-20T00:00:00Z'),
})

test('command off-host mirror authenticates one private executable and exposes only its explicit credential', t => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'closed-off-host-mirror-')))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const command = join(fixture, 'mirror-adapter')
  const leakMarker = join(fixture, 'ambient-secret-leaked')
  writeFileSync(command, `#!/bin/sh
cat >/dev/null
if [ -n "\${UNRELATED_RECONCILE_SECRET:-}" ]; then
  printf '%s\\n' leaked > ${JSON.stringify(leakMarker)}
  exit 9
fi
if [ "\${GOVERNANCE_OFF_HOST_MIRROR_TOKEN:-}" != fixture-mirror-token ]; then
  exit 8
fi
printf '%s\\n' '{"ok":true}'
`)
  chmodSync(command, 0o555)
  process.env.UNRELATED_RECONCILE_SECRET = 'must-not-cross-command-boundary'
  t.after(() => { delete process.env.UNRELATED_RECONCILE_SECRET })
  const mirror = new CommandOffHostMirror(command, { credential: 'fixture-mirror-token' })
  t.after(() => rmSync(mirror.privateRoot, { recursive: true, force: true }))
  assert.deepEqual(mirror.append({ schemaVersion: 1 }), { ok: true })
  assert.equal(existsSync(leakMarker), false)
  chmodSync(command, 0o755)
  writeFileSync(command, '#!/bin/sh\nexit 0\n')
  assert.throws(
    () => mirror.verify({ schemaVersion: 1 }),
    /source command changed after authentication/,
  )
})

test('closed GitHub CLI cache is source-scoped and never inherits PATH or unrelated secrets', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'closed-gh-transport-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const explicitGh = join(fixture, 'fixture-gh')
  const pathGh = join(fixture, 'gh')
  const pathMarker = join(fixture, 'path-gh-executed')
  writeFileSync(explicitGh, `#!/bin/sh
if [ -n "\${UNRELATED_GH_SECRET:-}" ]; then exit 7; fi
if [ "\${GH_TOKEN:-}" != fixture-gh-token ]; then exit 8; fi
printf '%s\\n' fixture-explicit-gh
`)
  writeFileSync(pathGh, `#!/bin/sh
printf '%s\\n' invoked > ${JSON.stringify(pathMarker)}
exit 9
`)
  chmodSync(explicitGh, 0o755)
  chmodSync(pathGh, 0o755)
  const explicit = runClosedGh(['--version'], {
    cwd: fixture,
    environment: {},
    executable: explicitGh,
    repoRoot: REPO_ROOT,
    token: 'fixture-gh-token',
    tokenEnvironmentName: null,
  })
  assert.equal(explicit.status, 0)
  assert.equal(explicit.stdout.trim(), 'fixture-explicit-gh')
  const platformDefault = runClosedGh(['--version'], {
    cwd: fixture,
    environment: { PATH: fixture, UNRELATED_GH_SECRET: 'must-not-cross' },
    repoRoot: REPO_ROOT,
    requireToken: false,
  })
  assert.equal(platformDefault.status, 0)
  assert.match(platformDefault.stdout, /^gh version /)
  assert.equal(existsSync(pathMarker), false)
  assert.throws(
    () => runClosedGh(['--version'], {
      cwd: fixture,
      environment: {},
      repoRoot: REPO_ROOT,
      requireToken: false,
      runtimePlatform: 'win32',
    }),
    /unsupported on platform win32/,
  )
})
after(() => externalRuntimeFixture.dispose())
const certifications = externalRuntimeFixture.certifications
const runtimeValidationContext = externalRuntimeFixture.runtimeValidationContext
const waivers = { schemaVersion: 1, waivers: [] }
const NOW = new Date('2026-07-20T00:00:00Z')
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIONNr2Y1hDSWkLyinTTfdEU1ilmYox3tHunig5bPsrEp
-----END PRIVATE KEY-----
`
const MIRROR_KEYS = generateKeyPairSync('ed25519')
const MIRROR_PUBLIC_KEY_SPKI = MIRROR_KEYS.publicKey.export({ type: 'spki', format: 'der' })
const MIRROR_ADAPTER_SHA256 = 'e'.repeat(64)
const activationInventory = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../inventory/managed-repos.json'))
const activationPolicy = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../external-activation-policy.json'))
const maximumActivationPolicy = structuredClone(activationPolicy)
maximumActivationPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
const activationDesired = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../desired/github.json'))
activationDesired.integrations.governanceCheckApp.id = 1001
activationDesired.integrations.governanceWriterApp.id = 1002
const mutationBoundaryContract = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/github-mutation-boundary-contract.json'))
const authorityStagedRolloutPlan = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../staged-rollout-plan.json'))

test('authority bootstrap accepts only the canonical profile-specific phase positions', () => {
  const productionBoundary = structuredClone(authorityStagedRolloutPlan.bootstrapBoundary.githubPolicyConvergence)
  assert.equal(productionBoundary.position, 'after-candidate-freeze-before-protected-pr')
  assert.equal(validateAuthorityBootstrapBoundary(productionBoundary), productionBoundary)

  const maximumAssuranceBoundary = structuredClone(productionBoundary)
  maximumAssuranceBoundary.position = 'before-candidate-freeze'
  assert.equal(validateAuthorityBootstrapBoundary(maximumAssuranceBoundary), maximumAssuranceBoundary)

  const substitutedBoundary = structuredClone(productionBoundary)
  substitutedBoundary.position = 'after-protected-pr'
  assert.throws(
    () => validateAuthorityBootstrapBoundary(substitutedBoundary),
    /authority policy bootstrap boundary identity is invalid/,
  )
})
const authorityActivationRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
const authorityPolicyDigest = sha256(readFileSync(resolve(REPO_ROOT, 'AGENTS.md')))
const AUTHORITY_HEAD = '6'.repeat(40)
const AUTHORITY_TREE = '7'.repeat(40)
const AUTHORITY_CANDIDATE_HEAD = '8'.repeat(40)
const AUTHORITY_CANDIDATE_TREE = '9'.repeat(40)

function activationReadback(requirement, profileId = activationPolicy.activeProfile) {
  const digest = value => String(value).repeat(64).slice(0, 64)
  switch (requirement.kind) {
    case 'github-app': {
      const expected = deriveGithubAppActivationExpectations({ inventory: activationInventory, desired: activationDesired })
      const installationTokenProbes = expected.installationProbeRoutes.map((route, index) => ({
        ...route,
        appId: expected.appIds[route.integration],
        installationId: 1000 + index,
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
        nonEnvironmentGovernanceSecrets: [],
        nonEnvironmentGovernanceSecretsDigest: expected.nonEnvironmentGovernanceSecretsDigest,
        installationTokenProbes,
        installationTokenProbesDigest: sha256(stableStringify(installationTokenProbes, 0)),
      }
    }
    case 'protected-environment': return {
      environment: 'release-finalize',
      reviewers: [{ type: 'User', id: 4242, subject: 'operator:fixture-independent-reviewer' }],
      preventSelfReview: true,
    }
    case 'github-repository': return { rulesetsDigest: digest('1'), requiredChecksDigest: digest('2'), immutableReleases: true, tagObjectVerificationDigest: digest('3') }
    case 'github-token-permission': return { tokenFingerprint: 'fixture-read-only-token', permissions: ['metadata:read'], writePermissions: [] }
    case 'github-mutation-boundary': {
      const desiredBinding = requirement.repository === mutationBoundaryContract.scope.source.repository
        ? mutationBoundaryContract.desiredBindings.source
        : mutationBoundaryContract.desiredBindings.target
      return {
        projectionContractDigest: GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
        fullRulesetsDigest: digest('a'),
        bypassActorsDigest: GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST,
        publicRulesetProjectionDigest: digest('b'),
        normalizedRulesetsDigest: desiredBinding.normalizedRulesetsDigest,
        requiredChecksDigest: desiredBinding.requiredChecksDigest,
        actionsWorkflowPermissionsDigest: desiredBinding.actionsWorkflowPermissionsDigest,
        repositoryIdentityDefaultBranchDigest: desiredBinding.repositoryIdentityDefaultBranchDigest,
        environmentPolicyDigest: desiredBinding.environmentPolicyDigest,
      }
    }
    case 'managed-host-policy': return { provider: requirement.id.includes('claude') ? 'claude-code' : 'codex', winningSource: 'fixture-managed-policy', policyDigest: digest('4'), bundleDigest: digest('5'), activationProofDigest: digest('6') }
    case 'release-authorization': return profileId === 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
      ? { allowedKeyIds: ['fixture-release-a', 'fixture-release-b'], quorum: 2, issuerRegistryDigest: issuerRegistryDigest(issuerRegistry) }
      : { allowedKeyIds: ['fixture-release-a'], quorum: 1, issuerRegistryDigest: issuerRegistryDigest(issuerRegistry) }
    case 'npm-package-identity': return { packageName: requirement.packageName, registry: requirement.registry, visibility: 'public', bootstrapVersion: '0.0.1-bootstrap.0', consumerEligible: false }
    case 'npm-trusted-publisher': return { packageName: requirement.packageName, registry: requirement.registry, repository: requirement.repository, workflow: requirement.trustedPublisher.workflow, environment: requirement.trustedPublisher.environment, allowedActions: requirement.trustedPublisher.allowedActions, exclusive: true }
    case 'npm-publishing-access': return { packageName: requirement.packageName, registry: requirement.registry, twoFactorMode: requirement.publishingAccess.twoFactorMode, tokensAllowed: false, remainingPublishTokenIds: [] }
    case 'durable-evidence-mirror': return {
      provider: 'fixture-independent-worm',
      protocolVersion: FLEET_RECONCILE_MIRROR_PROTOCOL.protocolVersion,
      endpoint: 'https://evidence.example.test/v1/fleet-reconcile',
      tenant: 'fixture-tenant',
      container: 'fixture-governance-worm',
      wormMode: 'compliance-object-lock',
      lifecyclePolicyDigest: digest('d'),
      minimumRetentionDays: 365,
      writerPrincipal: 'fixture-mirror-writer',
      verifierPrincipal: 'fixture-mirror-verifier',
      adapterCommandSha256: MIRROR_ADAPTER_SHA256,
      receiptSigningKeyId: 'fixture-mirror-receipt-v1',
      receiptSigningPublicKeySpki: MIRROR_PUBLIC_KEY_SPKI.toString('base64'),
      receiptSigningPublicKeySpkiSha256: sha256(MIRROR_PUBLIC_KEY_SPKI),
      signatureAlgorithm: 'ed25519',
      receiptId: 'fixture-activation-receipt',
      eventHeadDigest: digest('7'),
      retentionUntil: '2030-01-01T00:00:00.000Z',
      appendOnly: true,
      independentAdministration: true,
      receiptSha256: digest('8'),
    }
    case 'rollback-drill': return { transactionId: 'fixture-rollback-drill', eventHeadDigest: digest('9'), authorizationDigest: digest('a'), beforeImageRestored: true, postRollbackStateDigest: digest('b'), offHostReceiptDigest: digest('c') }
    default: throw new Error(`Missing activation fixture for ${requirement.kind}`)
  }
}

function activatedRequirements(policy = activationPolicy) {
  const policyDigest = externalActivationPolicyDigest(policy)
  const requirements = policy.requirements.map(policyRequirement => {
    const requirement = structuredClone(policyRequirement)
    delete requirement.evidenceContract
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T00:00:00.000Z'
    requirement.expiresAt = '2026-07-27T00:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest,
      issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
      observedResource: requirement.kind === 'managed-ci-attestation'
        ? managedCiFixture.observedResource()
        : activationReadback(requirement, policy.activeProfile),
    })
    signExternalActivationRequirement(requirement, { signerKeyId: 'fixture-ed25519', subject: 'fixture-governance', privateKey: PRIVATE_KEY })
    return requirement
  })
  return {
    $schema: 'schemas/external-activation-requirements.schema.json',
    schemaVersion: 4,
    policy: { path: 'infra/governance/external-activation-policy.json', sha256: policyDigest },
    requirements,
  }
}

function replaceMirrorActivationRequirement(ledger, {
  observedAt = '2026-07-20T00:00:00.000Z',
  expiresAt = '2026-07-27T00:00:00.000Z',
  observedResource = activationReadback({ kind: 'durable-evidence-mirror' }),
} = {}) {
  const result = structuredClone(ledger)
  const index = result.requirements.findIndex(
    requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  assert.notEqual(index, -1)
  const requirement = structuredClone(activationPolicy.requirements.find(
    candidate => candidate.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  ))
  delete requirement.evidenceContract
  requirement.status = 'activated'
  requirement.observedAt = observedAt
  requirement.expiresAt = expiresAt
  requirement.evidence = createExternalActivationEvidence(requirement, {
    policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    observedResource,
  })
  signExternalActivationRequirement(requirement, {
    signerKeyId: 'fixture-ed25519',
    subject: 'fixture-governance',
    privateKey: PRIVATE_KEY,
  })
  result.requirements[index] = requirement
  return result
}

function resolveAuthorityBootstrapMirror(activationRequirements, now = NOW) {
  return resolveActivatedAuthorityBootstrapMirrorIdentity({
    activationRequirements,
    inventory: activationInventory,
    desired: activationDesired,
    rings: authorityActivationRings,
    issuerRegistry,
    activationPolicy,
    mutationBoundaryContract,
    now,
    managedCiValidationContext,
  })
}

function validateTransactionJournal(journal, options = {}) {
  return reconcileValidateTransactionJournal(journal, { ...options, managedCiValidationContext })
}

function recoverTransaction(journalPath, client, options = {}) {
  return reconcileFixtureTestHarness.recoverTransaction(journalPath, client, {
    ...options,
    managedCiValidationContext,
  })
}

function rollbackTransaction(journalPath, client, options = {}) {
  return reconcileFixtureTestHarness.rollbackTransaction(journalPath, client, {
    ...options,
    managedCiValidationContext,
  })
}

function offHostMirror() {
  return {
    adapterCommandSha256: MIRROR_ADAPTER_SHA256,
    append(envelope) {
      const receipt = {
        schemaVersion: 1,
        kind: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        receiptId: `${envelope.transactionId}:${envelope.sequence}`,
        transactionId: envelope.transactionId,
        sequence: envelope.sequence,
        eventDigest: envelope.eventDigest,
        eventHeadDigest: envelope.eventHeadDigest,
        idempotencyKey: envelope.idempotencyKey,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        receivedAt: envelope.event.at,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      receipt.signature = sign(null, fleetReconcileMirrorSignedPayload(receipt, {
        digestField: 'receiptSha256',
        domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
      }), MIRROR_KEYS.privateKey).toString('base64url')
      receipt.receiptSha256 = fleetReconcileMirrorReceiptDigest(receipt)
      return receipt
    },
    verify(envelope) {
      const verification = {
        schemaVersion: 1,
        kind: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        verificationId: `${envelope.transactionId}:${envelope.eventCount}:${envelope.requestedAt}`,
        transactionId: envelope.transactionId,
        eventHeadDigest: envelope.eventHeadDigest,
        eventCount: envelope.eventCount,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        verifiedAt: envelope.requestedAt,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      verification.signature = sign(null, fleetReconcileMirrorSignedPayload(verification, {
        digestField: 'verificationSha256',
        domain: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
      }), MIRROR_KEYS.privateKey).toString('base64url')
      verification.verificationSha256 = fleetReconcileMirrorVerificationDigest(verification)
      return verification
    },
  }
}

function activatedMirrorIdentity() {
  const readback = activationReadback({ kind: 'durable-evidence-mirror' })
  return Object.fromEntries(FLEET_RECONCILE_MIRROR_IDENTITY_KEYS.map(key => [key, structuredClone(readback[key])]))
}

function authorityBootstrapGenesisReceipt() {
  const changedPaths = ['AGENTS.md']
  const challenge = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-challenge',
    repository: 'ajenchen/design-system',
    pullRequest: 101,
    baseSha: AUTHORITY_HEAD,
    baseTree: AUTHORITY_TREE,
    candidateHeadSha: AUTHORITY_CANDIDATE_HEAD,
    candidateHeadTree: AUTHORITY_CANDIDATE_TREE,
    changedPaths,
    changedPathsDigest: sha256(stableStringify(changedPaths, 0)),
    controlPlaneClosureDigest: '1'.repeat(64),
    controlPlaneStageDigest: '2'.repeat(64),
    buildGraphDigest: '3'.repeat(64),
    manifestDigest: '4'.repeat(64),
    inventoryDigest: sha256(stableStringify(activationInventory, 0)),
    desiredDigest: sha256(stableStringify(activationDesired, 0)),
    controlPlaneLockDigest: '5'.repeat(64),
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
  }
  const receipt = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-verification',
    challenge,
    challengeDigest: sha256(
      `qijenchen-control-plane-genesis-challenge-v1\n${stableStringify(challenge, 0)}`,
    ),
    authorization: {
      kind: 'github-owner-comment',
      commentId: '101',
      commentDigest: 'a'.repeat(64),
      ownerLogin: 'ajenchen',
      createdAt: NOW.toISOString(),
    },
    verifiedAt: NOW.toISOString(),
    receiptDigest: null,
  }
  const unsigned = structuredClone(receipt)
  delete unsigned.receiptDigest
  receipt.receiptDigest = sha256(
    `qijenchen-control-plane-genesis-receipt-v1\n${stableStringify(unsigned, 0)}`,
  )
  return receipt
}

class AuthorityBootstrapReadbackClient {
  constructor() {
    this.calls = []
    this.rulesets = new Map()
    this.environments = new Map()
    this.actionsWorkflowPermissions = {
      default_workflow_permissions: 'write',
      can_approve_pull_request_reviews: false,
    }
    this.nextId = 500
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body: structuredClone(body) })
    if (method === 'GET' && path === '/repos/ajenchen/design-system') {
      return {
        id: 1,
        full_name: 'ajenchen/design-system',
        default_branch: 'main',
        visibility: 'public',
      }
    }
    if (method === 'GET' && path === '/repos/ajenchen/design-system/commits/main') {
      return {
        sha: AUTHORITY_HEAD,
        commit: {
          tree: { sha: AUTHORITY_TREE },
          committer: { date: '2026-07-19T23:00:00Z' },
        },
      }
    }
    if (method === 'GET' && path === `/repos/ajenchen/design-system/commits/${AUTHORITY_HEAD}/check-runs?per_page=100`) {
      return { total_count: 0, check_runs: [] }
    }
    if (method === 'GET' && path === '/repos/ajenchen/design-system/actions/permissions/workflow') {
      return structuredClone(this.actionsWorkflowPermissions)
    }
    if (method === 'PUT' && path === '/repos/ajenchen/design-system/actions/permissions/workflow') {
      this.actionsWorkflowPermissions = structuredClone(body)
      return null
    }
    if (method === 'GET' && (
      path === '/repos/ajenchen/design-system/rulesets'
      || path === '/repos/ajenchen/design-system/rulesets?per_page=100'
    )) {
      return [...this.rulesets.values()].map(item => ({ id: item.id, name: item.name }))
    }
    if (method === 'POST' && path === '/repos/ajenchen/design-system/rulesets') {
      const id = ++this.nextId
      const normalizedBody = structuredClone(body)
      for (const rule of normalizedBody.rules ?? []) {
        if (rule.type !== 'pull_request') continue
        rule.parameters.required_reviewers = []
        rule.parameters.allowed_merge_methods = ['merge', 'squash', 'rebase']
      }
      this.rulesets.set(String(id), { id, ...normalizedBody })
      return { id }
    }
    const ruleset = path.match(/^\/repos\/ajenchen\/design-system\/rulesets\/(\d+)$/)
    if (method === 'GET' && ruleset) {
      return structuredClone(this.rulesets.get(ruleset[1]) ?? (options.allow404 ? null : undefined))
    }
    if (method === 'PUT' && ruleset) {
      const normalizedBody = structuredClone(body)
      for (const rule of normalizedBody.rules ?? []) {
        if (rule.type !== 'pull_request') continue
        rule.parameters.required_reviewers = []
        rule.parameters.allowed_merge_methods = ['merge', 'squash', 'rebase']
      }
      this.rulesets.set(ruleset[1], { id: Number(ruleset[1]), ...normalizedBody })
      return { id: Number(ruleset[1]) }
    }
    if (method === 'DELETE' && ruleset) {
      this.rulesets.delete(ruleset[1])
      return null
    }
    if (method === 'GET' && path === '/repos/ajenchen/design-system/environments?per_page=100') {
      return {
        total_count: this.environments.size,
        environments: [...this.environments.keys()].map(name => ({ name })),
      }
    }
    const environment = path.match(/^\/repos\/ajenchen\/design-system\/environments\/(.+)$/)
    if (method === 'GET' && environment) {
      const name = decodeURIComponent(environment[1])
      return structuredClone(this.environments.get(name) ?? (options.allow404 ? null : undefined))
    }
    if (method === 'PUT' && environment) {
      const name = decodeURIComponent(environment[1])
      const value = { id: ++this.nextId, name, ...structuredClone(body) }
      this.environments.set(name, value)
      return { id: value.id, name }
    }
    if (method === 'DELETE' && environment) {
      this.environments.delete(decodeURIComponent(environment[1]))
      return null
    }
    throw new Error(`Unexpected authority bootstrap route ${method} ${path}`)
  }

  snapshot() {
    return {
      actionsWorkflowPermissions: structuredClone(this.actionsWorkflowPermissions),
      rulesets: structuredClone([...this.rulesets.entries()]),
      environments: structuredClone([...this.environments.entries()]),
    }
  }
}

function authorityBootstrapTrustModel(activationRequirements) {
  return {
    inventory: structuredClone(activationInventory),
    desired: structuredClone(activationDesired),
    stagedRolloutPlan: structuredClone(authorityStagedRolloutPlan),
    authorityPolicyDigest,
    rings: structuredClone(authorityActivationRings),
    issuerRegistry: structuredClone(issuerRegistry),
    activationRequirements: structuredClone(activationRequirements),
    activationPolicy: structuredClone(activationPolicy),
    mutationBoundaryContract: structuredClone(mutationBoundaryContract),
  }
}

function createAuthorityBootstrapFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'authority-bootstrap-replay-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const client = new AuthorityBootstrapReadbackClient()
  const genesisReceipt = authorityBootstrapGenesisReceipt()
  const plan = reconcileFixtureTestHarness.buildAuthorityBootstrapPlan({
    inventory: activationInventory,
    desired: activationDesired,
    stagedRolloutPlan: authorityStagedRolloutPlan,
    client,
    genesisReceipt,
    authorityPolicyDigest,
    canonicalInventoryBytesDigest: genesisReceipt.challenge.inventoryDigest,
    canonicalDesiredBytesDigest: genesisReceipt.challenge.desiredDigest,
  })
  assert.equal(plan.actions.length, 5)
  const journalPath = resolve(root, 'bootstrap-journal.json')
  reconcileFixtureTestHarness.applyAuthorityBootstrapPlan(plan, client, {
    journalPath,
    inventory: activationInventory,
    desired: activationDesired,
    stagedRolloutPlan: authorityStagedRolloutPlan,
    authorityPolicyDigest,
    clock: () => NOW,
    reloadCurrentGovernance: () => ({
      inventory: structuredClone(activationInventory),
      desired: structuredClone(activationDesired),
      stagedRolloutPlan: structuredClone(authorityStagedRolloutPlan),
      authorityPolicyDigest,
    }),
  })
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  validateAuthorityBootstrapJournal(journal, {
    inventory: activationInventory,
    desired: activationDesired,
    stagedRolloutPlan: authorityStagedRolloutPlan,
    authorityPolicyDigest,
  })
  assert.equal(journal.state, 'verified')
  return {
    root,
    client,
    plan,
    journal,
    journalPath,
    receiptRoot: resolve(root, 'receipts'),
    activationRequirements: activatedRequirements(),
  }
}

function authorityBootstrapReplayOptions(fixture, overrides = {}) {
  const activationRequirements = overrides.activationRequirements
    ?? fixture.activationRequirements
  const model = authorityBootstrapTrustModel(activationRequirements)
  return {
    receiptRoot: fixture.receiptRoot,
    ...model,
    clock: () => NOW,
    managedCiValidationContext,
    reloadCurrentGovernance: () => structuredClone(model),
    ...overrides,
  }
}

function authorityBootstrapReplayReceiptDigestForTest(receipt) {
  const unsigned = structuredClone(receipt)
  delete unsigned.receiptDigest
  return sha256(
    `qijenchen-authority-policy-bootstrap-durable-replay-v1\n${stableStringify(unsigned, 0)}`,
  )
}

function runAuthorityBootstrapReplayWorker({
  fixture,
  barrier,
}) {
  const workerData = {
    reconcileUrl: new URL('../bin/reconcile-github.mjs', import.meta.url).href,
    mirrorUrl: new URL('../lib/fleet-reconcile-mirror.mjs', import.meta.url).href,
    journalPath: fixture.journalPath,
    receiptRoot: fixture.receiptRoot,
    clientState: fixture.client.snapshot(),
    model: authorityBootstrapTrustModel(fixture.activationRequirements),
    managedCiValidationContext,
    now: NOW.toISOString(),
    head: AUTHORITY_HEAD,
    tree: AUTHORITY_TREE,
    adapterCommandSha256: MIRROR_ADAPTER_SHA256,
    mirrorPrivateKeyPkcs8: MIRROR_KEYS.privateKey.export({
      type: 'pkcs8',
      format: 'der',
    }).toString('base64'),
    barrier,
  }
  const source = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
const { createPrivateKey, sign } = require('node:crypto')

;(async () => {
  const reconcile = await import(workerData.reconcileUrl)
  const protocol = await import(workerData.mirrorUrl)
  const clone = value => JSON.parse(JSON.stringify(value))
  const rulesets = new Map(workerData.clientState.rulesets)
  const environments = new Map(workerData.clientState.environments)
  const client = {
    request(method, path, body, options = {}) {
      if (method === 'GET' && path === '/repos/ajenchen/design-system') {
        return { id: 1, full_name: 'ajenchen/design-system', default_branch: 'main', visibility: 'public' }
      }
      if (method === 'GET' && path === '/repos/ajenchen/design-system/commits/main') {
        return { sha: workerData.head, commit: { tree: { sha: workerData.tree }, committer: { date: '2026-07-19T23:00:00Z' } } }
      }
      if (method === 'GET' && path === '/repos/ajenchen/design-system/commits/' + workerData.head + '/check-runs?per_page=100') {
        return { total_count: 0, check_runs: [] }
      }
      if (method === 'GET' && path === '/repos/ajenchen/design-system/actions/permissions/workflow') {
        return clone(workerData.clientState.actionsWorkflowPermissions)
      }
      if (method === 'GET' && (path === '/repos/ajenchen/design-system/rulesets' || path === '/repos/ajenchen/design-system/rulesets?per_page=100')) {
        return [...rulesets.values()].map(item => ({ id: item.id, name: item.name }))
      }
      const ruleset = path.match(/^\/repos\/ajenchen\/design-system\/rulesets\/(\d+)$/)
      if (method === 'GET' && ruleset) return clone(rulesets.get(ruleset[1]) ?? (options.allow404 ? null : undefined))
      if (method === 'GET' && path === '/repos/ajenchen/design-system/environments?per_page=100') {
        return { total_count: environments.size, environments: [...environments.keys()].map(name => ({ name })) }
      }
      const environment = path.match(/^\/repos\/ajenchen\/design-system\/environments\/(.+)$/)
      if (method === 'GET' && environment) {
        return clone(environments.get(decodeURIComponent(environment[1])) ?? (options.allow404 ? null : undefined))
      }
      throw new Error('Unexpected concurrent authority bootstrap route ' + method + ' ' + path)
    },
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(workerData.mirrorPrivateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
  const mirror = {
    adapterCommandSha256: workerData.adapterCommandSha256,
    append(envelope) {
      const receipt = {
        schemaVersion: 1,
        kind: protocol.FLEET_RECONCILE_MIRROR_PROTOCOL.receiptKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        receiptId: envelope.transactionId + ':' + envelope.sequence,
        transactionId: envelope.transactionId,
        sequence: envelope.sequence,
        eventDigest: envelope.eventDigest,
        eventHeadDigest: envelope.eventHeadDigest,
        idempotencyKey: envelope.idempotencyKey,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        receivedAt: envelope.event.at,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      receipt.signature = sign(null, protocol.fleetReconcileMirrorSignedPayload(receipt, {
        digestField: 'receiptSha256',
        domain: protocol.FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
      }), privateKey).toString('base64url')
      receipt.receiptSha256 = protocol.fleetReconcileMirrorReceiptDigest(receipt)
      return receipt
    },
    verify(envelope) {
      const verification = {
        schemaVersion: 1,
        kind: protocol.FLEET_RECONCILE_MIRROR_PROTOCOL.verificationKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        verificationId: envelope.transactionId + ':' + envelope.eventCount + ':' + envelope.requestedAt,
        transactionId: envelope.transactionId,
        eventHeadDigest: envelope.eventHeadDigest,
        eventCount: envelope.eventCount,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        verifiedAt: envelope.requestedAt,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      verification.signature = sign(null, protocol.fleetReconcileMirrorSignedPayload(verification, {
        digestField: 'verificationSha256',
        domain: protocol.FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
      }), privateKey).toString('base64url')
      verification.verificationSha256 = protocol.fleetReconcileMirrorVerificationDigest(verification)
      return verification
    },
  }
  const barrier = new Int32Array(workerData.barrier)
  if (Atomics.add(barrier, 0, 1) + 1 === 2) Atomics.notify(barrier, 0)
  else while (Atomics.load(barrier, 0) < 2) Atomics.wait(barrier, 0, 1)
  const result = reconcile.reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    workerData.journalPath,
    client,
    mirror,
    {
      receiptRoot: workerData.receiptRoot,
      ...workerData.model,
      clock: () => new Date(workerData.now),
      managedCiValidationContext: workerData.managedCiValidationContext,
      reloadCurrentGovernance: () => clone(workerData.model),
    },
  )
  parentPort.postMessage({
    ok: true,
    replayed: result.replayed,
    existing: result.existing,
    receiptPath: result.receiptPath,
    receiptDigest: result.receipt.receiptDigest,
  })
})().catch(error => parentPort.postMessage({
  ok: false,
  message: error?.stack ?? String(error),
}))
`
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(source, { eval: true, workerData })
    let settled = false
    worker.once('message', message => {
      settled = true
      if (message.ok) resolveWorker(message)
      else rejectWorker(new Error(message.message))
    })
    worker.once('error', rejectWorker)
    worker.once('exit', code => {
      if (!settled && code !== 0) rejectWorker(new Error(`authority bootstrap replay worker exited ${code}`))
    })
  })
}

function mirrorProtocolFixture() {
  const mirrorIdentity = activatedMirrorIdentity()
  const event = {
    schemaVersion: 1,
    sequence: 1,
    transactionId: 'github-reconcile-1721433600000-aaaaaaaaaaaa',
    type: 'prepared',
    subjectActionId: null,
    at: NOW.toISOString(),
    previousDigest: '0'.repeat(64),
    authorizationEnvelopeDigest: '1'.repeat(64),
    runtimeState: {},
    stateDigest: '2'.repeat(64),
    mirrorRequestNonce: '00000000-0000-4000-8000-000000000001',
    eventDigest: '3'.repeat(64),
  }
  const journal = {
    mirrorIdentity,
    transactionId: event.transactionId,
    eventHeadDigest: event.eventDigest,
    events: [event],
  }
  const request = buildFleetReconcileEventMirrorRequest(journal, event)
  return { event, journal, mirrorIdentity, request }
}

test('fleet reconcile head-verification request is closed, deterministic, and bound to the complete chain', () => {
  const { journal, mirrorIdentity } = mirrorProtocolFixture()
  const request = buildFleetReconcileHeadVerificationRequest(journal, {
    mirrorIdentity,
    requestNonce: '00000000-0000-4000-8000-000000000002',
    requestedAt: NOW,
  })
  assert.deepEqual(
    request,
    buildFleetReconcileHeadVerificationRequest(journal, {
      mirrorIdentity,
      requestNonce: request.requestNonce,
      requestedAt: NOW,
    }),
  )
  assert.equal(validateFleetReconcileHeadVerificationRequest(request, {
    journal,
    mirrorIdentity,
    at: NOW,
  }), request)
  const verification = offHostMirror().verify(request)
  assert.equal(validateFleetReconcileHeadVerification(verification, {
    journal,
    mirrorIdentity,
    request,
    at: NOW,
  }), verification)

  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, untrustedExtension: true },
      { journal, mirrorIdentity, at: NOW },
    ),
    /invalid or open shape/,
  )
  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, eventCount: request.eventCount + 1 },
      { journal, mirrorIdentity, at: NOW },
    ),
    /complete event chain/,
  )
  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, requestDigest: 'f'.repeat(64) },
      { journal, mirrorIdentity, at: NOW },
    ),
    /request digest mismatch/,
  )
})

test('authority bootstrap durable replay produces one content-addressed receipt with full convergence binding', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const result = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    offHostMirror(),
    authorityBootstrapReplayOptions(fixture),
  )
  assert.equal(result.replayed, true)
  assert.equal(result.existing, false)
  assert.equal(realpathSync(result.receiptPath), result.receiptPath)
  assert.equal(
    result.receipt.sourceJournalDigest,
    authorityBootstrapJournalDigest(fixture.journal),
  )
  assert.equal(
    result.receipt.eventReceipts.length,
    fixture.journal.events.length,
  )
  assert.equal(
    result.receipt.convergenceReadback.remainingActionsDigest,
    candidateActionsDigest([]),
  )
  assert.equal(
    result.receipt.convergenceReadback.eventHeadDigest,
    fixture.journal.eventHeadDigest,
  )
  validateAuthorityBootstrapDurableReplayReceipt(result.receipt, {
    activationRequirement: fixture.activationRequirements.requirements.find(
      requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
    ),
    requireTrustedActivation: true,
    requiredRetentionAt: NOW,
    expectedConvergenceReadback: result.receipt.convergenceReadback,
  })
  assert.deepEqual(
    readdirSync(fixture.receiptRoot),
    [`${result.receipt.receiptDigest}.json`],
  )

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const name of [
    'managed-repos',
    'github-desired',
    'release-rings',
    'issuer-registry',
    'github-mutation-boundary-contract',
    'external-activation-policy',
    'external-activation-requirements',
    'fleet-reconcile-journal',
    'fleet-reconcile-bootstrap-transaction',
    'fleet-reconcile-bootstrap-replay-receipt',
  ]) {
    ajv.addSchema(readJson(resolve(SCHEMAS, `${name}.schema.json`)))
  }
  const validateJournalSchema = ajv.getSchema(
    'https://qijenchen.dev/schemas/fleet-reconcile-bootstrap-transaction-v1.json',
  )
  const validateReplaySchema = ajv.getSchema(
    'https://qijenchen.dev/schemas/fleet-reconcile-bootstrap-replay-receipt-v1.json',
  )
  assert.equal(validateJournalSchema(fixture.journal), true, JSON.stringify(validateJournalSchema.errors))
  assert.equal(validateReplaySchema(result.receipt), true, JSON.stringify(validateReplaySchema.errors))
  assert.equal(validateJournalSchema({ ...fixture.journal, untrustedExtension: true }), false)
  assert.equal(validateReplaySchema({ ...result.receipt, untrustedExtension: true }), false)
})

test('aligned authority bootstrap no-op applies, journals, and durably replays with closed schema coverage', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const plan = reconcileFixtureTestHarness.buildAuthorityBootstrapPlan({
    inventory: activationInventory,
    desired: activationDesired,
    stagedRolloutPlan: authorityStagedRolloutPlan,
    client: fixture.client,
    genesisReceipt: authorityBootstrapGenesisReceipt(),
    authorityPolicyDigest,
    canonicalInventoryBytesDigest: sha256(stableStringify(activationInventory, 0)),
    canonicalDesiredBytesDigest: sha256(stableStringify(activationDesired, 0)),
  })
  assert.deepEqual(plan.actions, [])
  assert.deepEqual(plan.rollbackPlan, [])

  const journalPath = resolve(fixture.root, 'bootstrap-no-op-journal.json')
  const applied = reconcileFixtureTestHarness.applyAuthorityBootstrapPlan(
    plan,
    fixture.client,
    {
      journalPath,
      inventory: activationInventory,
      desired: activationDesired,
      stagedRolloutPlan: authorityStagedRolloutPlan,
      authorityPolicyDigest,
      clock: () => NOW,
      reloadCurrentGovernance: () => ({
        inventory: structuredClone(activationInventory),
        desired: structuredClone(activationDesired),
        stagedRolloutPlan: structuredClone(authorityStagedRolloutPlan),
        authorityPolicyDigest,
      }),
    },
  )
  assert.deepEqual(applied.actions, [])
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  validateAuthorityBootstrapJournal(journal, {
    inventory: activationInventory,
    desired: activationDesired,
    stagedRolloutPlan: authorityStagedRolloutPlan,
    authorityPolicyDigest,
  })
  assert.equal(journal.state, 'verified')
  assert.deepEqual(journal.actions, [])
  assert.deepEqual(journal.rollbackPlan, [])
  assert.ok(journal.events.length > 0)

  const receiptRoot = resolve(fixture.root, 'no-op-receipts')
  const replay = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    journalPath,
    fixture.client,
    offHostMirror(),
    authorityBootstrapReplayOptions(fixture, { receiptRoot }),
  )
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.receipt.sourceJournal.actions, [])
  assert.deepEqual(replay.receipt.sourceJournal.rollbackPlan, [])
  assert.equal(replay.receipt.eventReceipts.length, journal.events.length)

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const name of [
    'managed-repos',
    'github-desired',
    'release-rings',
    'issuer-registry',
    'github-mutation-boundary-contract',
    'external-activation-policy',
    'external-activation-requirements',
    'fleet-reconcile-journal',
    'fleet-reconcile-bootstrap-transaction',
    'fleet-reconcile-bootstrap-replay-receipt',
  ]) {
    ajv.addSchema(readJson(resolve(SCHEMAS, `${name}.schema.json`)))
  }
  const validateJournalSchema = ajv.getSchema(
    'https://qijenchen.dev/schemas/fleet-reconcile-bootstrap-transaction-v1.json',
  )
  const validateReplaySchema = ajv.getSchema(
    'https://qijenchen.dev/schemas/fleet-reconcile-bootstrap-replay-receipt-v1.json',
  )
  assert.equal(validateJournalSchema(journal), true, JSON.stringify(validateJournalSchema.errors))
  assert.equal(validateReplaySchema(replay.receipt), true, JSON.stringify(validateReplaySchema.errors))
  assert.equal(validateJournalSchema({ ...journal, events: [] }), false)
  const fleetJournalSchema = readJson(resolve(SCHEMAS, 'fleet-reconcile-journal.schema.json'))
  assert.equal(fleetJournalSchema.properties.actions.minItems, 1)
  assert.equal(fleetJournalSchema.properties.rollbackPlan.minItems, 1)
  assert.equal(fleetJournalSchema.properties.events.minItems, 1)
  assert.equal(fleetJournalSchema.$defs.runtimeState.properties.actions.minItems, 0)
})

test('authority bootstrap replay receipt rejects incomplete, duplicate, reordered, stale, substituted, and unretained evidence', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const { receipt } = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    offHostMirror(),
    authorityBootstrapReplayOptions(fixture),
  )
  const mirrorRequirement = fixture.activationRequirements.requirements.find(
    requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  const validate = candidate => validateAuthorityBootstrapDurableReplayReceipt(candidate, {
    activationRequirement: mirrorRequirement,
    requireTrustedActivation: true,
    requiredRetentionAt: NOW,
    expectedConvergenceReadback: receipt.convergenceReadback,
  })

  const missing = structuredClone(receipt)
  missing.eventReceipts.pop()
  assert.throws(() => validate(missing), /partial or duplicated/)

  const duplicate = structuredClone(receipt)
  duplicate.eventReceipts[1] = structuredClone(duplicate.eventReceipts[0])
  assert.throws(() => validate(duplicate), /partial or duplicated/)

  const reordered = structuredClone(receipt)
  ;[reordered.eventReceipts[0], reordered.eventReceipts[1]] = [
    reordered.eventReceipts[1],
    reordered.eventReceipts[0],
  ]
  assert.throws(() => validate(reordered), /event\/request binding mismatch|temporal provenance/)

  const staleTarget = structuredClone(receipt)
  staleTarget.sourceJournal.plan.defaultBranchHeadSha = '0'.repeat(40)
  assert.throws(
    () => validate(staleTarget),
    /genesis receipt target binding|plan digest mismatch|source journal digest mismatch/,
  )

  const substitutedReadback = activationReadback({ kind: 'durable-evidence-mirror' })
  substitutedReadback.tenant = 'substituted-tenant'
  const substitutedLedger = replaceMirrorActivationRequirement(
    fixture.activationRequirements,
    { observedResource: substitutedReadback },
  )
  const substitutedRequirement = substitutedLedger.requirements.find(
    requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  assert.throws(
    () => validateAuthorityBootstrapDurableReplayReceipt(receipt, {
      activationRequirement: substitutedRequirement,
      requireTrustedActivation: true,
      requiredRetentionAt: NOW,
    }),
    /activation requirement is stale or substituted|mirror identity differs/,
  )

  const convergenceSubstitution = structuredClone(receipt)
  convergenceSubstitution.convergenceReadback.observedStateDigest = 'f'.repeat(64)
  assert.throws(
    () => validate(convergenceSubstitution),
    /differs from live exact readback|convergence readback digest mismatch/,
  )

  const convergenceDigestSubstitution = structuredClone(receipt)
  convergenceDigestSubstitution.convergenceReadbackDigest = 'f'.repeat(64)
  assert.throws(
    () => validate(convergenceDigestSubstitution),
    /convergence readback digest mismatch/,
  )

  assert.throws(
    () => validateAuthorityBootstrapDurableReplayReceipt(receipt, {
      activationRequirement: mirrorRequirement,
      requireTrustedActivation: true,
      requiredRetentionAt: '2031-01-01T00:00:00.000Z',
      expectedConvergenceReadback: receipt.convergenceReadback,
    }),
    /retention does not cover/,
  )
})

test('authority bootstrap mirror activation fails closed for future, stale, missing, unsigned, and partial bindings', () => {
  const baseline = activatedRequirements()

  const future = replaceMirrorActivationRequirement(baseline, {
    observedAt: '2026-07-21T00:00:00.000Z',
    expiresAt: '2026-07-28T00:00:00.000Z',
  })
  assert.throws(() => resolveAuthorityBootstrapMirror(future), /from the future/)

  const stale = replaceMirrorActivationRequirement(baseline, {
    observedAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-07-08T00:00:00.000Z',
  })
  assert.throws(() => resolveAuthorityBootstrapMirror(stale), /evidence is expired/)

  const missing = structuredClone(baseline)
  missing.requirements = missing.requirements.filter(
    requirement => requirement.id !== 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  assert.throws(
    () => resolveAuthorityBootstrapMirror(missing),
    /does not exactly cover|missing immutable policy requirements/,
  )

  const unsigned = structuredClone(baseline)
  const unsignedRequirement = unsigned.requirements.find(
    requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  unsignedRequirement.evidence.signature = unsignedRequirement.evidence.signature
    .replace(/^./, character => character === 'A' ? 'B' : 'A')
  assert.throws(() => resolveAuthorityBootstrapMirror(unsigned), /signature is invalid/)

  const partial = structuredClone(baseline)
  const partialIndex = partial.requirements.findIndex(
    requirement => requirement.id === 'activate-off-host-append-only-reconcile-evidence-mirror',
  )
  const inactive = structuredClone(activationPolicy.requirements[partialIndex])
  delete inactive.evidenceContract
  Object.assign(inactive, {
    status: 'not-activated',
    observedAt: null,
    expiresAt: null,
    evidence: null,
  })
  partial.requirements[partialIndex] = inactive
  assert.throws(
    () => resolveAuthorityBootstrapMirror(partial),
    /mirror is not activated/,
  )
})

test('authority bootstrap durable replay is idempotent and rejects non-canonical or unsafe CAS readback', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const baseMirror = offHostMirror()
  let appendCalls = 0
  let verifyCalls = 0
  const trackingMirror = {
    adapterCommandSha256: baseMirror.adapterCommandSha256,
    append(request) {
      appendCalls += 1
      return baseMirror.append(request)
    },
    verify(request) {
      verifyCalls += 1
      return baseMirror.verify(request)
    },
  }
  const first = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    trackingMirror,
    authorityBootstrapReplayOptions(fixture),
  )
  const callsAfterFirst = { appendCalls, verifyCalls }
  const second = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    trackingMirror,
    authorityBootstrapReplayOptions(fixture),
  )
  assert.deepEqual(
    { replayed: second.replayed, existing: second.existing },
    { replayed: false, existing: true },
  )
  assert.deepEqual({ appendCalls, verifyCalls }, callsAfterFirst)
  assert.equal(second.receiptPath, first.receiptPath)
  assert.deepEqual(second.receipt, first.receipt)
  assert.deepEqual(
    readdirSync(fixture.receiptRoot),
    [`${first.receipt.receiptDigest}.json`],
  )

  writeFileSync(first.receiptPath, `${readFileSync(first.receiptPath, 'utf8')}\n`)
  assert.throws(
    () => reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
      fixture.journalPath,
      fixture.client,
      trackingMirror,
      authorityBootstrapReplayOptions(fixture),
    ),
    /non-canonical bytes/,
  )

  const unsafeFixture = createAuthorityBootstrapFixture(t)
  const realReceiptRoot = realpathSync(mkdtempSync(join(unsafeFixture.root, 'actual-receipts-')))
  symlinkSync(realReceiptRoot, unsafeFixture.receiptRoot)
  assert.throws(
    () => reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
      unsafeFixture.journalPath,
      unsafeFixture.client,
      offHostMirror(),
      authorityBootstrapReplayOptions(unsafeFixture),
    ),
    /receipt root is unsafe|lock root is unsafe/,
  )
})

test('authority bootstrap concurrent replay converges to exactly one immutable receipt', async t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const results = await Promise.all([
    runAuthorityBootstrapReplayWorker({ fixture, barrier }),
    runAuthorityBootstrapReplayWorker({ fixture, barrier }),
  ])
  assert.deepEqual(
    results.map(result => ({
      replayed: result.replayed,
      existing: result.existing,
    })).sort((left, right) => Number(right.replayed) - Number(left.replayed)),
    [
      { replayed: true, existing: false },
      { replayed: false, existing: true },
    ],
  )
  assert.equal(new Set(results.map(result => result.receiptPath)).size, 1)
  assert.equal(new Set(results.map(result => result.receiptDigest)).size, 1)
  assert.deepEqual(
    readdirSync(fixture.receiptRoot),
    [`${results[0].receiptDigest}.json`],
  )
})

test('authority bootstrap durable replay rejects a self-consistent cached receipt with substituted live convergence', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const first = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    offHostMirror(),
    authorityBootstrapReplayOptions(fixture),
  )
  const substituted = structuredClone(first.receipt)
  substituted.convergenceReadback.observedStateDigest = 'f'.repeat(64)
  substituted.convergenceReadbackDigest = sha256(
    `qijenchen-authority-policy-bootstrap-convergence-readback-v1\n${stableStringify(substituted.convergenceReadback, 0)}`,
  )
  substituted.receiptDigest = authorityBootstrapReplayReceiptDigestForTest(substituted)
  unlinkSync(first.receiptPath)
  const substitutedPath = resolve(fixture.receiptRoot, `${substituted.receiptDigest}.json`)
  writeFileSync(substitutedPath, `${stableStringify(substituted)}\n`)
  assert.throws(
    () => reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
      fixture.journalPath,
      fixture.client,
      offHostMirror(),
      authorityBootstrapReplayOptions(fixture),
    ),
    /differs from live exact readback/,
  )
})

test('authority bootstrap durable replay leaves no completion receipt after partial mirror failure and recovers exactly', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const baseMirror = offHostMirror()
  let appendCalls = 0
  const partialMirror = {
    adapterCommandSha256: baseMirror.adapterCommandSha256,
    append(request) {
      appendCalls += 1
      if (appendCalls === 2) throw new Error('fixture partial replay interruption')
      return baseMirror.append(request)
    },
    verify: request => baseMirror.verify(request),
  }
  assert.throws(
    () => reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
      fixture.journalPath,
      fixture.client,
      partialMirror,
      authorityBootstrapReplayOptions(fixture),
    ),
    /fixture partial replay interruption/,
  )
  assert.equal(
    existsSync(fixture.receiptRoot)
      ? readdirSync(fixture.receiptRoot).filter(name => name.endsWith('.json')).length
      : 0,
    0,
  )
  const recovered = reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
    fixture.journalPath,
    fixture.client,
    baseMirror,
    authorityBootstrapReplayOptions(fixture),
  )
  assert.equal(recovered.replayed, true)
  assert.equal(recovered.receipt.eventReceipts.length, fixture.journal.events.length)
})

test('authority bootstrap durable replay detects canonical trust-source TOCTOU after append', t => {
  const fixture = createAuthorityBootstrapFixture(t)
  const baseMirror = offHostMirror()
  const model = authorityBootstrapTrustModel(fixture.activationRequirements)
  let drifted = false
  const driftingMirror = {
    adapterCommandSha256: baseMirror.adapterCommandSha256,
    append(request) {
      const receipt = baseMirror.append(request)
      drifted = true
      return receipt
    },
    verify: request => baseMirror.verify(request),
  }
  assert.throws(
    () => reconcileFixtureTestHarness.replayAuthorityBootstrapJournalToDurableMirror(
      fixture.journalPath,
      fixture.client,
      driftingMirror,
      authorityBootstrapReplayOptions(fixture, {
        reloadCurrentGovernance: () => {
          const current = structuredClone(model)
          if (drifted) current.authorityPolicyDigest = '0'.repeat(64)
          return current
        },
      }),
    ),
    /canonical trust source changed during transaction: authorityPolicyDigest/,
  )
  assert.equal(
    existsSync(fixture.receiptRoot)
      ? readdirSync(fixture.receiptRoot).filter(name => name.endsWith('.json')).length
      : 0,
    0,
  )
})

test('fleet reconcile mirror protocol has one shared implementation with byte-identical domains', () => {
  assert.deepEqual(FLEET_RECONCILE_MIRROR_PROTOCOL, {
    protocolVersion: 'fleet-reconcile-mirror-v1',
    receiptKind: 'fleet-reconcile-off-host-ack',
    verificationKind: 'fleet-reconcile-off-host-verification',
    requestDigestDomain: 'fleet-reconcile-off-host-request-v1',
    eventIdempotencyDomain: 'fleet-reconcile-event-idempotency-v1',
    receiptDigestDomain: 'fleet-reconcile-off-host-receipt-v1',
    receiptSignatureDomain: 'fleet-reconcile-off-host-receipt-signature-v1',
    verificationDigestDomain: 'fleet-reconcile-off-host-verification-v1',
    verificationSignatureDomain: 'fleet-reconcile-off-host-verification-signature-v1',
    clockSkewMs: 300_000,
  })

  const reconcileSource = readFileSync(resolve(REPO_ROOT, 'infra/governance/bin/reconcile-github.mjs'), 'utf8')
  const protocolSource = readFileSync(resolve(REPO_ROOT, 'infra/governance/lib/fleet-reconcile-mirror.mjs'), 'utf8')
  assert.match(reconcileSource, /from '\.\.\/lib\/fleet-reconcile-mirror\.mjs'/)
  for (const oldDefinition of [
    'function receiptDigest(',
    'function verificationDigest(',
    'function mirrorRequestDigest(',
    'function validateMirrorIdentity(',
    'function validateOffHostReceipt(',
    'function verifyJournalOffHost(',
  ]) assert.equal(reconcileSource.includes(oldDefinition), false, `reconcile retained duplicate protocol implementation: ${oldDefinition}`)
  for (const domain of [
    FLEET_RECONCILE_MIRROR_PROTOCOL.requestDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.eventIdempotencyDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.receiptDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.verificationDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
  ]) {
    assert.equal(reconcileSource.includes(domain), false, `reconcile retained protocol domain bytes: ${domain}`)
    assert.equal(protocolSource.split(domain).length - 1, 1, `shared protocol domain is not unique: ${domain}`)
  }

  const { event, journal, request } = mirrorProtocolFixture()
  assert.deepEqual(request, buildFleetReconcileEventMirrorRequest(journal, event))
  const unsignedRequest = structuredClone(request)
  delete unsignedRequest.requestDigest
  assert.equal(request.requestDigest, sha256(`fleet-reconcile-off-host-request-v1\n${stableStringify(unsignedRequest, 0)}`))
  assert.equal(request.idempotencyKey, sha256(`fleet-reconcile-event-idempotency-v1\n${journal.transactionId}\n${event.sequence}\n${event.eventDigest}`))

  const receipt = offHostMirror().append(request)
  const unsignedReceipt = structuredClone(receipt)
  delete unsignedReceipt.receiptSha256
  assert.equal(receipt.receiptSha256, sha256(`fleet-reconcile-off-host-receipt-v1\n${stableStringify(unsignedReceipt, 0)}`))
  const signingProjection = structuredClone(receipt)
  delete signingProjection.signature
  delete signingProjection.receiptSha256
  assert.equal(
    fleetReconcileMirrorSignedPayload(receipt, {
      digestField: 'receiptSha256',
      domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
    }).toString('utf8'),
    `fleet-reconcile-off-host-receipt-signature-v1\n${stableStringify(signingProjection, 0)}`,
  )
})

test('shared mirror validators preserve subject, source, retention, signature, and independent readback binding', () => {
  const { event, journal, mirrorIdentity, request } = mirrorProtocolFixture()
  assert.equal(validateFleetReconcileMirrorIdentity(mirrorIdentity).asymmetricKeyType, 'ed25519')

  const mirror = offHostMirror()
  const receipt = mirror.append(request)
  assert.equal(validateFleetReconcileOffHostReceipt(receipt, {
    journal,
    event,
    mirrorIdentity,
    request,
    at: NOW,
    requireFresh: true,
  }), true)

  const verification = verifyFleetReconcileJournalOffHost(journal, mirror, { at: NOW })
  assert.equal(verification.principal, mirrorIdentity.verifierPrincipal)
  assert.notEqual(verification.principal, receipt.principal)
  const unsignedVerification = structuredClone(verification)
  delete unsignedVerification.verificationSha256
  assert.equal(verification.verificationSha256, sha256(`fleet-reconcile-off-host-verification-v1\n${stableStringify(unsignedVerification, 0)}`))

  const wrongSubject = structuredClone(receipt)
  wrongSubject.principal = mirrorIdentity.verifierPrincipal
  assert.throws(() => validateFleetReconcileOffHostReceipt(wrongSubject, { journal, event, mirrorIdentity, request, at: NOW }), /differs from the activated mirror identity/)

  const wrongSource = structuredClone(receipt)
  wrongSource.eventDigest = '4'.repeat(64)
  assert.throws(() => validateFleetReconcileOffHostReceipt(wrongSource, { journal, event, mirrorIdentity, request, at: NOW }), /event\/request binding mismatch/)

  const shortRetention = structuredClone(receipt)
  shortRetention.retainedUntil = '2026-07-21T00:00:00.000Z'
  assert.throws(() => validateFleetReconcileOffHostReceipt(shortRetention, { journal, event, mirrorIdentity, request, at: NOW }), /receipt retention is invalid/)

  const openReceipt = { ...receipt, mutableLatest: true }
  assert.throws(() => validateFleetReconcileOffHostReceipt(openReceipt, { journal, event, mirrorIdentity, request, at: NOW }), /invalid or open shape/)

  const samePrincipal = { ...mirrorIdentity, verifierPrincipal: mirrorIdentity.writerPrincipal }
  assert.throws(() => validateFleetReconcileMirrorIdentity(samePrincipal), /mirror identity is invalid/)

  const selfReportedMirror = offHostMirror()
  const verify = selfReportedMirror.verify.bind(selfReportedMirror)
  selfReportedMirror.verify = envelope => ({ ...verify(envelope), independentAdministration: false })
  assert.throws(() => verifyFleetReconcileJournalOffHost(journal, selfReportedMirror, { at: NOW }), /not independent append-only evidence/)
})

function generatedRecoveryIssuer(name) {
  const keys = generateKeyPairSync('ed25519')
  return {
    keys,
    record: {
      keyId: `recovery-${name}`,
      subject: `recovery-authority-${name}`,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['privileged-change-authorizer', 'apply-authorizer', 'completion-attestor', 'root-rotator'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function registryFor(records) {
  return { $schema: '../schemas/issuer-registry.schema.json', schemaVersion: 1, algorithm: 'ed25519', issuers: records }
}

function verifiedEvidenceFor(rings) {
  const candidate = rings.candidateRelease
  if (candidate === null) return null
  const finalizationReceiptSha256 = 'b'.repeat(64)
  const releaseTrustEvidenceSha256 = 'c'.repeat(64)
  const assets = [
    { id: '451', name: `qijenchen-design-system-${candidate.version}.tgz`, digest: `sha256:${'1'.repeat(64)}`, size: 101 },
    { id: '452', name: `qijenchen-governance-${candidate.version}.tgz`, digest: `sha256:${'2'.repeat(64)}`, size: 102 },
    { id: '453', name: `qijenchen-storybook-config-${candidate.version}.tgz`, digest: `sha256:${'3'.repeat(64)}`, size: 103 },
    { id: '454', name: 'release-bom.json', digest: `sha256:${candidate.bomSha256}`, size: 104 },
    { id: '455', name: 'release.sbom.cdx.json', digest: `sha256:${'4'.repeat(64)}`, size: 105 },
    { id: '456', name: 'product-template-scaffold.lock.json', digest: `sha256:${'5'.repeat(64)}`, size: 106 },
    { id: '457', name: 'npm-finalization-receipt.json', digest: `sha256:${finalizationReceiptSha256}`, size: 107 },
    { id: '458', name: 'release-trust-preflight.json', digest: `sha256:${releaseTrustEvidenceSha256}`, size: 108 },
  ].sort((left, right) => compareUtf8Bytes(left.name, right.name))
  return {
    schemaVersion: 2,
    candidateReleaseDigest: sha256(stableStringify(candidate, 0)),
    repository: 'ajenchen/design-system',
    tag: `v${candidate.version}`,
    version: candidate.version,
    releaseId: '123',
    tagObject: '3'.repeat(40),
    tagVerification: {
      verified: true,
      reason: 'valid',
      verifiedAt: NOW.toISOString(),
      signatureSha256: '6'.repeat(64),
      payloadSha256: '7'.repeat(64),
    },
    sourceCommit: candidate.sourceCommit,
    sourceTree: candidate.sourceTree,
    bomSha256: candidate.bomSha256,
    releaseSetSha256: '8'.repeat(64),
    finalizationReceiptSha256,
    releaseTrustEvidenceSha256,
    assets,
    packages: structuredClone(candidate.packages),
  }
}

function buildPlan(options) {
  const verifiedReleaseEvidence = Object.hasOwn(options, 'verifiedReleaseEvidence')
    ? options.verifiedReleaseEvidence
    : verifiedEvidenceFor(options.rings)
  return reconcileFixtureTestHarness.buildPlan({
    ...options,
    now: options.now ?? NOW,
    runtimeValidationContext: options.runtimeValidationContext ?? runtimeValidationContext,
    verifiedReleaseEvidence,
  })
}

class ReadbackGhApiClient extends GhApiClient {
  constructor(routes) {
    super()
    this.routes = structuredClone(routes)
    this.calls = []
    this.commitReads = new Map()
    this.mutateCommitRead = null
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body: body === undefined ? undefined : structuredClone(body) })
    const route = this.routes[`${method} ${path}`]
    if (!route && options.allow404) return null
    if (!route) throw new Error(`Live readback fixture has no route for ${method} ${path}`)
    if (route.error) throw new Error(`Live readback fixture error for ${method} ${path}: ${route.error}`)
    const response = structuredClone(route.response ?? null)
    if (method === 'GET' && /\/commits\/[^/?]+$/.test(path)) {
      const read = (this.commitReads.get(path) ?? 0) + 1
      this.commitReads.set(path, read)
      if (this.mutateCommitRead) this.mutateCommitRead(response, { path, read })
    }
    return response
  }
}

function uncertifiedRuntimeLedger() {
  const value = structuredClone(baseCertifications)
  for (const certification of value.certifications) {
    if (certification.status !== 'certified' && certification.status !== 'conditional') continue
    certification.status = 'not-certified'
    certification.limitations = ['Live runtime identity wiring fixture intentionally carries no certified runtime evidence.']
    delete certification.runtimeEvidence
    delete certification.certifiedAt
    delete certification.expiresAt
    certification.platformMatrix = certification.platformMatrix.map(target => ({
      ...target,
      status: 'not-certified',
      limitations: ['Live runtime identity wiring fixture intentionally carries no certified runtime evidence.'],
      runtimeEvidence: undefined,
      certifiedAt: undefined,
      expiresAt: undefined,
    }))
    for (const target of certification.platformMatrix) {
      delete target.runtimeEvidence
      delete target.certifiedAt
      delete target.expiresAt
    }
  }
  return value
}

function certificationsWithoutExternalGitHubTrust() {
  const value = structuredClone(certifications)
  const certification = value.certifications.find(item => item.surface === 'github-actions' && item.repositoryRole === 'product-consumer')
  certification.status = 'not-certified'
  certification.limitations = ['GitHub App identities are unresolved, so external runtime trust is not certified.']
  delete certification.runtimeEvidence
  delete certification.certifiedAt
  delete certification.expiresAt
  certification.platformMatrix = certification.platformMatrix.map(target => ({
    ...target,
    status: 'not-certified',
    limitations: ['GitHub App identities are unresolved, so external runtime trust is not certified.'],
  }))
  return value
}

function validateModel(...args) {
  return reconcileFixtureTestHarness.validatePartialInventoryModel(...args, runtimeValidationContext)
}

function computeEligibility(options) {
  return reconcileComputeEligibility({ desired, runtimeValidationContext, ...options })
}

function applyPlan(plan, client, options) {
  const verifiedReleaseEvidence = Object.hasOwn(options, 'verifiedReleaseEvidence')
    ? options.verifiedReleaseEvidence
    : verifiedEvidenceFor(options.rings)
  const currentActivationPolicy = options.activationPolicy ?? activationPolicy
  return reconcileFixtureTestHarness.applyPlan(plan, client, {
    certifications,
    waivers,
    runtimeProfile,
    runtimeValidationContext,
    activationRequirements: activatedRequirements(currentActivationPolicy),
    activationInventory,
    activationDesired,
    activationPolicy: currentActivationPolicy,
    expectedActivationPolicyDigest: externalActivationPolicyDigest(currentActivationPolicy),
    mutationBoundaryContract,
    managedCiValidationContext,
    clock: () => options.now ?? NOW,
    ...options,
    verifiedReleaseEvidence,
  })
}

function maximumAssuranceApplyOptions(options = {}) {
  return {
    activationPolicy: maximumActivationPolicy,
    activationRequirements: activatedRequirements(maximumActivationPolicy),
    expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumActivationPolicy),
    offHostMirror: offHostMirror(),
    ...options,
  }
}

function reloadableGovernance({
  currentInventory = inventory,
  currentDesired = desired,
  currentRings,
  currentCertifications = certifications,
  currentWaivers = waivers,
  currentRuntimeProfile = runtimeProfile,
  currentIssuerRegistry = issuerRegistry,
  activationRequirements,
  currentActivationInventory = activationInventory,
  currentActivationDesired = activationDesired,
  currentActivationPolicy = activationPolicy,
  currentMutationBoundaryContract = mutationBoundaryContract,
} = {}) {
  return {
    inventory: structuredClone(currentInventory),
    desired: structuredClone(currentDesired),
    rings: structuredClone(currentRings),
    certifications: structuredClone(currentCertifications),
    waivers: structuredClone(currentWaivers),
    runtimeProfile: structuredClone(currentRuntimeProfile),
    issuerRegistry: structuredClone(currentIssuerRegistry),
    activationRequirements: structuredClone(activationRequirements),
    activationInventory: structuredClone(currentActivationInventory),
    activationDesired: structuredClone(currentActivationDesired),
    activationPolicy: structuredClone(currentActivationPolicy),
    mutationBoundaryContract: structuredClone(currentMutationBoundaryContract),
  }
}

function clientWithWorkflowRun({
  app = { id: 15368, slug: 'github-actions' },
  event = 'dynamic',
  path = 'dynamic/dependabot/dependabot-updates',
} = {}) {
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const runId = '77'
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs.push({
    id: 9077,
    name: 'Dependabot Updates',
    head_sha: '2'.repeat(40),
    details_url: `https://github.com/acme/consumer/actions/runs/${runId}`,
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-07-20T00:00:00Z',
    app,
  })
  client.routes[`GET /repos/acme/consumer/actions/runs/${runId}`] = {
    response: {
      id: Number(runId),
      path,
      head_sha: '2'.repeat(40),
      event,
      status: 'completed',
      conclusion: 'success',
    },
  }
  return client
}

function fetchWorkflowRunFixture(client) {
  return fetchRepositoryState(client, inventory.repositories[0], {
    requiredChecks: [],
    declaredEnvironments: [],
    tagPolicy: {},
    immutableReleases: false,
  }, desired)
}

class ReadbackClient {
  constructor() {
    this.calls = []
    this.rulesets = new Map()
    this.environments = new Map()
    this.actionsWorkflowPermissions = {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: true,
    }
    this.nextId = 100
    this.fixture = readJson(resolve(FIXTURES, 'empty/routes.json'))
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body })
    if (method === 'GET' && path === '/repos/acme/consumer') return structuredClone(this.fixture['GET /repos/acme/consumer'].response)
    if (method === 'GET' && path === '/repos/acme/consumer/commits/main') return { sha: '2222222222222222222222222222222222222222', commit: { committer: { date: '2026-07-19T23:00:00Z' } } }
    if (method === 'GET' && path === '/repos/acme/consumer/actions/permissions/workflow') return structuredClone(this.actionsWorkflowPermissions)
    if (method === 'PUT' && path === '/repos/acme/consumer/actions/permissions/workflow') {
      this.actionsWorkflowPermissions = structuredClone(body)
      return null
    }
    const checkRuns = path.match(/^\/repos\/acme\/consumer\/commits\/([a-f0-9]{40})\/check-runs\?per_page=100$/)
    if (method === 'GET' && checkRuns) {
      const response = structuredClone(this.fixture['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response)
      for (const run of response.check_runs) {
        run.head_sha = checkRuns[1]
        run.external_id = run.external_id.replaceAll('2222222222222222222222222222222222222222', checkRuns[1])
      }
      return response
    }
    if (method === 'GET' && path.startsWith('/repos/acme/consumer/contents/.github/workflows/')) {
      const route = this.fixture[`GET ${path}`]
      if (route) return structuredClone(route.response)
    }
    if (method === 'GET' && (path.endsWith('/rulesets') || path.endsWith('/rulesets?per_page=100'))) {
      return [...this.rulesets.values()].map(item => ({ id: item.id, name: item.name }))
    }
    if (method === 'GET' && path === '/repos/acme/consumer/environments?per_page=100') {
      return { total_count: this.environments.size, environments: [...this.environments.keys()].map(name => ({ name })) }
    }
    if (method === 'POST' && path.endsWith('/rulesets')) {
      const id = ++this.nextId
      this.rulesets.set(String(id), { id, ...structuredClone(body) })
      return { id }
    }
    const ruleset = path.match(/\/rulesets\/(\d+)$/)
    if (method === 'GET' && ruleset) return this.rulesets.get(ruleset[1]) ?? (options.allow404 ? null : undefined)
    if (method === 'PUT' && path.includes('/environments/')) {
      const name = decodeURIComponent(path.split('/').at(-1))
      this.environments.set(name, { name, ...structuredClone(body) })
      return { id: ++this.nextId, name }
    }
    if (method === 'GET' && path.includes('/environments/')) {
      const name = decodeURIComponent(path.split('/').at(-1))
      return this.environments.get(name) ?? (options.allow404 ? null : undefined)
    }
    if (method === 'GET' && path.endsWith('/immutable-releases')) return { enabled: false }
    if (method === 'DELETE' && ruleset) {
      this.rulesets.delete(ruleset[1])
      return null
    }
    if (method === 'DELETE' && path.includes('/environments/')) {
      this.environments.delete(decodeURIComponent(path.split('/').at(-1)))
      return null
    }
    throw new Error(`Unexpected readback route ${method} ${path}`)
  }
}

function authorizeCurrentWave(
  rings,
  clientFactory = () => new FixtureApiClient(resolve(FIXTURES, 'empty')),
  {
    issuedAt = '2026-07-20T00:00:00Z',
    expiresAt = '2026-07-20T01:00:00Z',
  } = {},
) {
  const first = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: clientFactory(), now: NOW })
  const authorized = structuredClone(rings)
  const repoPlan = first.repoPlans[0]
  authorized.assignments.consumer.applyAuthorization = issueApplyAuthorization({
    repoId: 'consumer',
    github: 'acme/consumer',
    ringId: 'ring-canary',
    waveId: 'canary',
    candidateRelease: authorized.candidateRelease,
    verifiedReleaseEvidenceDigest: first.verifiedReleaseEvidenceDigest,
    candidatePlanDigest: first.candidatePlanDigest,
    predicateResults: repoPlan.predicateResults,
    stateDigest: repoPlan.observedStateDigest,
    defaultBranchHeadSha: repoPlan.defaultBranchHeadSha,
    actions: repoPlan.candidateActions,
    signerKeyId: 'fixture-ed25519',
    subject: 'fixture-governance',
    privateKey: PRIVATE_KEY,
    issuedAt,
    expiresAt,
    attestationPolicy: authorized.attestationPolicy,
  })
  return authorized
}

function privilegedPolicyFor(registry, {
  quorum = 1,
  allowedKeyIds = registry.issuers.map(item => item.keyId),
  externalActivationPolicy = activationPolicy,
} = {}) {
  const policyDigest = externalActivationPolicyDigest(externalActivationPolicy)
  const profile = resolveExternalActivationProfile(externalActivationPolicy, {
    expectedPolicyDigest: policyDigest,
  })
  return {
    $schema: 'schemas/privileged-trust-roots.schema.json',
    schemaVersion: 2,
    repository: 'ajenchen/design-system',
    algorithm: 'ed25519',
    externalActivationPolicyDigest: policyDigest,
    authorizationProfileId: profile.id,
    authorizationProfileDigest: profile.sha256,
    maxAuthorizationTtlMinutes: 60,
    clockSkewSeconds: 0,
    authorizationDirectory: 'governance/authorizations',
    issuerRegistryDigest: issuerRegistryDigest(registry),
    allowedKeyIds,
    trustRootQuorum: quorum,
    bootstrap: { schemaVersion: 1, enabled: false, ownerLogins: ['ajenchen'], nonce: 'fixture-bootstrap-closed-v1', maxCommentTtlMinutes: 30 },
    protectedPaths: [],
    protectedPrefixes: [],
  }
}

const defaultRecoveryRoot = generatedRecoveryIssuer('default-root')

function inventoryWithAuthority(value = inventory) {
  if (value.repositories.some(repository => repository.role === 'authority')) return structuredClone(value)
  const result = structuredClone(activationInventory)
  const authority = result.repositories.find(repository => repository.role === 'authority')
  const authorityOwner = authority.github.split('/')[0]
  const consumers = value.repositories.filter(repository => repository.role === 'product-consumer')
  assert.equal(consumers.length, 1, 'authority fixture requires exactly one product consumer')
  const consumer = structuredClone(consumers[0])
  consumer.github = `${authorityOwner}/${consumer.id}`
  consumer.localPathFromGovernanceRoot = `../../../${consumer.id}`
  result.repositories = [
    ...result.repositories.filter(repository => repository.role !== 'product-consumer'),
    consumer,
  ]
  result.certificationCanaries['product-consumer'] = { repositoryId: consumer.id }
  return result
}

function recoveryAuthorizationFor({
  journalPath,
  currentInventory = inventoryWithAuthority(),
  currentDesired = desired,
  currentRings,
  currentIssuerRegistry,
  privilegedPolicy,
  applySigners = [{ keyId: 'fixture-ed25519', subject: 'fixture-governance', privateKey: PRIVATE_KEY }],
  rootSigners,
  issuedAt = NOW.toISOString(),
  expiresAt = '2026-07-20T00:45:00.000Z',
}) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const effectiveIssuerRegistry = currentIssuerRegistry ?? registryFor([...issuerRegistry.issuers, defaultRecoveryRoot.record])
  const effectiveRings = structuredClone(currentRings)
  effectiveRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(effectiveIssuerRegistry)
  const effectiveRootSigners = rootSigners ?? [{
    keyId: defaultRecoveryRoot.record.keyId,
    subject: defaultRecoveryRoot.record.subject,
    privateKey: defaultRecoveryRoot.keys.privateKey,
  }]
  const effectivePrivilegedPolicy = privilegedPolicy ?? privilegedPolicyFor(effectiveIssuerRegistry, {
    allowedKeyIds: effectiveRootSigners.map(item => item.keyId),
  })
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired: currentDesired,
    attestationPolicy: effectiveRings.attestationPolicy,
    privilegedPolicy: effectivePrivilegedPolicy,
    issuerRegistry: effectiveIssuerRegistry,
    issuedAt,
    expiresAt,
  })
  for (const signer of applySigners) signFleetRecoveryAuthorization(authorization, { signerKeyId: signer.keyId, subject: signer.subject, privateKey: signer.privateKey, gates: ['apply'] })
  for (const signer of effectiveRootSigners) signFleetRecoveryAuthorization(authorization, { signerKeyId: signer.keyId, subject: signer.subject, privateKey: signer.privateKey, gates: ['root'] })
  return {
    authorization,
    privilegedPolicy: effectivePrivilegedPolicy,
    issuerRegistry: effectiveIssuerRegistry,
    inventory: currentInventory,
    rings: effectiveRings,
  }
}

test('single-owner fleet recovery may use one honestly governed dual-role signer without claiming independent custody', () => {
  const signer = generatedRecoveryIssuer('single-owner-dual-role')
  const currentIssuerRegistry = registryFor([signer.record])
  const currentInventory = inventoryWithAuthority()
  const currentRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [signer.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 1
  currentRings.attestationPolicy.completionAttestationQuorum = 1
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    allowedKeyIds: [signer.record.keyId],
  })
  const journal = {
    transactionId: 'single-owner-recovery',
    historicalControlPlaneDigest: '1'.repeat(64),
    authorizationEnvelopeDigest: '2'.repeat(64),
    eventHeadDigest: '3'.repeat(64),
    rollbackPlanDigest: '4'.repeat(64),
  }
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T00:45:00.000Z',
  })
  const signerOptions = {
    signerKeyId: signer.record.keyId,
    subject: signer.record.subject,
    privateKey: signer.keys.privateKey,
  }
  signFleetRecoveryAuthorization(authorization, { ...signerOptions, gates: ['apply'] })
  signFleetRecoveryAuthorization(authorization, { ...signerOptions, gates: ['root'] })
  assert.equal(verifyFleetRecoveryAuthorization(authorization, {
    journal,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    now: NOW,
  }), true)
})

test('maximum-assurance fleet recovery preserves disjoint apply and root signer subjects', () => {
  const first = generatedRecoveryIssuer('maximum-overlap-one')
  const second = generatedRecoveryIssuer('maximum-overlap-two')
  const currentIssuerRegistry = registryFor([first.record, second.record])
  const currentInventory = inventoryWithAuthority()
  const currentRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [first.record.keyId, second.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 1
  currentRings.attestationPolicy.completionAttestationQuorum = 1
  const maximumActivationPolicy = structuredClone(activationPolicy)
  maximumActivationPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    quorum: 2,
    allowedKeyIds: [first.record.keyId, second.record.keyId],
    externalActivationPolicy: maximumActivationPolicy,
  })
  const journal = {
    transactionId: 'maximum-overlap-recovery',
    historicalControlPlaneDigest: '5'.repeat(64),
    authorizationEnvelopeDigest: '6'.repeat(64),
    eventHeadDigest: '7'.repeat(64),
    rollbackPlanDigest: '8'.repeat(64),
  }
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T00:45:00.000Z',
  })
  for (const [item, gate] of [[first, 'apply'], [first, 'root'], [second, 'root']]) {
    signFleetRecoveryAuthorization(authorization, {
      signerKeyId: item.record.keyId,
      subject: item.record.subject,
      privateKey: item.keys.privateKey,
      gates: [gate],
    })
  }
  assert.throws(
    () => verifyFleetRecoveryAuthorization(authorization, {
      journal,
      inventory: currentInventory,
      desired,
      attestationPolicy: currentRings.attestationPolicy,
      privilegedPolicy,
      issuerRegistry: currentIssuerRegistry,
      externalActivationPolicy: maximumActivationPolicy,
      now: NOW,
    }),
    /Maximum-assurance fleet recovery apply and root quorums must use disjoint signer keys and subjects/,
  )
})

test('irreversible mutations are deferred until they form one explicitly signed transaction', () => {
  const reversible = {
    kind: 'create-ruleset',
    resource: 'fleet/test',
    compensation: { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
  }
  const irreversible = {
    kind: 'enable-immutable-releases',
    resource: 'immutable-releases',
    compensation: { safety: 'blocked', reason: 'no safe inverse' },
  }

  assert.deepEqual(stageActionTransaction([reversible, irreversible]), {
    actions: [reversible],
    deferredActions: [irreversible],
  })
  assert.equal(validateActionTransactionClass([reversible]), true)
  assert.equal(validateActionTransactionClass([irreversible]), true)
  assert.throws(
    () => validateActionTransactionClass([reversible, irreversible]),
    /irreversible action requires an isolated, explicitly signed one-action transaction/,
  )
  assert.throws(
    () => stageActionTransaction([irreversible, structuredClone(irreversible)]),
    /multiple irreversible actions/,
  )
})

test('GitHub desired schema closes repository workflow permissions and fixes least-privilege defaults', () => {
  const schema = readJson(resolve(SCHEMAS, 'github-desired.schema.json'))
  const validate = new Ajv2020({ strict: false }).compile(schema)
  assert.equal(validate(desired), true, JSON.stringify(validate.errors))

  const missing = structuredClone(desired)
  delete missing.profiles['product-consumer'].actionsWorkflowPermissions.can_approve_pull_request_reviews
  assert.equal(validate(missing), false)

  const broad = structuredClone(desired)
  broad.profiles['product-consumer'].actionsWorkflowPermissions.default_workflow_permissions = 'write'
  assert.equal(validate(broad), false)

  const open = structuredClone(desired)
  open.profiles['product-consumer'].actionsWorkflowPermissions.unreviewed = true
  assert.equal(validate(open), false)
  assert.throws(
    () => validateModel(inventory, open, readJson(resolve(FIXTURES, 'rings-hold.json')), certifications, waivers, NOW, issuerRegistry, runtimeProfile),
    /desired schema validation failed:.*actionsWorkflowPermissions must NOT have additional properties/,
  )
})

test('default reconciliation is GET-only and withholds every candidate action on hold', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: new Date('2026-07-20T00:00:00Z') })

  assert.equal(plan.readOnly, true)
  assert.equal(plan.summary.selectedWave.actions, 0)
  assert.equal(plan.summary.registeredInventory.candidateActions, 6)
  assert.equal(plan.summary.registeredInventory.managedChanges, 6)
  assert.equal(plan.summary.registeredInventory.conflicts, 0)
  assert.ok(plan.summary.rolloutBlockers > 0)
  assert.equal(plan.scope.coverage, 'registered-opt-in-inventory')
  assert.equal(plan.scope.unregisteredDescendants, 'not-covered')
  assert.ok(client.calls.every(call => call.method === 'GET'))
  const verified = plan.repoPlans[0].candidateActions.find(action => action.resource === 'fleet/verified-main')
  assert.equal(verified.body.enforcement, 'active')
  assert.deepEqual(
    verified.body.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks,
    [{ context: 'Immutable consumer snapshot', integration_id: 1001 }],
  )
})

test('live runtime validation identity is derived from current Harness bytes and every registered GitHub default branch', () => {
  const repositories = [
    { id: 'authority', github: 'acme/authority', defaultBranch: 'main' },
    { id: 'template', github: 'acme/template', defaultBranch: 'stable' },
    { id: 'consumer', github: 'acme/consumer', defaultBranch: 'main' },
  ]
  const routes = {}
  repositories.forEach((repository, index) => {
    routes[`GET /repos/${repository.github}`] = { response: { full_name: repository.github, default_branch: repository.defaultBranch } }
    routes[`GET /repos/${repository.github}/commits/${repository.defaultBranch}`] = {
      response: {
        sha: String(index + 1).repeat(40),
        commit: { tree: { sha: String(index + 4).repeat(40) } },
      },
    }
  })
  const client = new ReadbackGhApiClient(routes)
  const context = resolveRuntimeValidationContext({
    client,
    inventory: { repositories },
    runtimeProfile: baseRuntimeProfile,
  })

  assert.match(context.runtimeIdentity.profileDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(context.runtimeIdentity.harnessDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(context.runtimeIdentity.gitCommit, /^[a-f0-9]{40}$/)
  assert.match(context.runtimeIdentity.gitTree, /^[a-f0-9]{40}$/)
  assert.deepEqual(context.externalRepositoryIdentities, {
    authority: { gitCommit: '1'.repeat(40), gitTree: '4'.repeat(40), subjectProofs: {} },
    template: { gitCommit: '2'.repeat(40), gitTree: '5'.repeat(40), subjectProofs: {} },
    consumer: { gitCommit: '3'.repeat(40), gitTree: '6'.repeat(40), subjectProofs: {} },
  })
  assert.deepEqual(client.calls.map(call => `${call.method} ${call.path}`), repositories.flatMap(repository => [
    `GET /repos/${repository.github}`,
    `GET /repos/${repository.github}/commits/${repository.defaultBranch}`,
  ]))

  const injected = new ReadbackGhApiClient(routes)
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: injected,
      inventory: { repositories },
      runtimeProfile: baseRuntimeProfile,
      runtimeValidationContext: { runtimeIdentity: { profileDigest: 'sha256:attacker' } },
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.equal(injected.calls.length, 0)

  const invalidTreeRoutes = structuredClone(routes)
  delete invalidTreeRoutes['GET /repos/acme/template/commits/stable'].response.commit.tree
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: new ReadbackGhApiClient(invalidTreeRoutes),
      inventory: { repositories },
      runtimeProfile: baseRuntimeProfile,
    }),
    /default-branch tree identity is invalid for template/,
  )
})

test('live certification context proves authority subject ancestry and rejects forbidden carrier changes', () => {
  const repository = { id: 'authority', github: 'acme/authority', role: 'authority', defaultBranch: 'main' }
  const subjectCommit = 'a'.repeat(40)
  const subjectTree = 'b'.repeat(40)
  const carrierCommit = 'c'.repeat(40)
  const carrierTree = 'd'.repeat(40)
  const inventory = {
    certificationCanaries: { authority: { repositoryId: repository.id } },
    repositories: [repository],
  }
  const certifications = {
    certifications: [{
      id: 'authority-proof-fixture',
      status: 'certified',
      repositoryRole: 'authority',
      platformMatrix: [{ status: 'certified' }],
      runtimeEvidence: { gitCommit: subjectCommit },
    }],
  }
  const routes = {
    [`GET /repos/${repository.github}`]: { response: { full_name: repository.github, default_branch: repository.defaultBranch } },
    [`GET /repos/${repository.github}/commits/${repository.defaultBranch}`]: { response: { sha: carrierCommit, commit: { tree: { sha: carrierTree } } } },
    [`GET /repos/${repository.github}/git/commits/${subjectCommit}`]: { response: { sha: subjectCommit, tree: { sha: subjectTree } } },
    [`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`]: {
      response: {
        status: 'ahead',
        base_commit: { sha: subjectCommit },
        merge_base_commit: { sha: subjectCommit },
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [{ filename: 'infra/governance/providers/certifications.json', status: 'modified' }],
      },
    },
  }
  const context = resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(routes),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  })
  assert.equal(context.externalRepositoryIdentities.authority.gitCommit, carrierCommit)
  assert.deepEqual(context.externalRepositoryIdentities.authority.subjectProofs[subjectCommit].changedPaths, [
    'infra/governance/providers/certifications.json',
  ])

  const forbidden = structuredClone(routes)
  forbidden[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.files = [{ filename: 'src/untested-change.ts', status: 'modified' }]
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(forbidden),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /changed forbidden path src\/untested-change\.ts/)

  const renamed = structuredClone(routes)
  renamed[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.files = [{
    filename: 'infra/governance/evidence/provider-runtime/allowed.json',
    previous_filename: 'src/forbidden.ts',
    status: 'renamed',
  }]
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(renamed),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /unsupported rename\/copy\/status/)

  const missingAncestry = structuredClone(routes)
  missingAncestry[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.merge_base_commit.sha = 'e'.repeat(40)
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(missingAncestry),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /not a protected default-branch ancestor/)
})

test('partial inventory validation is confined to the fixture harness while production stays fail closed', () => {
  const rings = readJsonFile(resolve(FIXTURES, 'rings-hold.json'))
  const canonicalIssuerRegistry = readJsonFile(resolve(REPO_ROOT, 'infra/governance/trust/issuers.json'))
  rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(canonicalIssuerRegistry)
  rings.attestationPolicy.allowedKeyIds = []

  assert.equal(
    reconcileFixtureTestHarness.validatePartialInventoryModel(
      inventory,
      desired,
      rings,
      uncertifiedRuntimeLedger(),
      waivers,
      NOW,
      canonicalIssuerRegistry,
      baseRuntimeProfile,
      runtimeValidationContext,
    ),
    true,
  )
  assert.throws(
    () => reconcileValidateModel(
      inventory,
      desired,
      rings,
      uncertifiedRuntimeLedger(),
      waivers,
      NOW,
      canonicalIssuerRegistry,
      baseRuntimeProfile,
      runtimeValidationContext,
    ),
    /Workflow identity source design-system-authority references unknown repository design-system/,
  )

  const routes = readJsonFile(resolve(FIXTURES, 'empty/routes.json'))
  const commitRoute = 'GET /repos/acme/consumer/commits/main'
  routes[commitRoute].response.commit.tree = { sha: '3'.repeat(40) }
  const client = new ReadbackGhApiClient(routes)
  assert.throws(
    () => reconcileBuildPlan({
      inventory,
      desired,
      rings,
      certifications: uncertifiedRuntimeLedger(),
      waivers,
      client,
      verifiedReleaseEvidence: verifiedEvidenceFor(rings),
      issuerRegistry: canonicalIssuerRegistry,
      runtimeProfile: baseRuntimeProfile,
      now: NOW,
    }),
    /Workflow identity source design-system-authority references unknown repository design-system/,
  )
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('fixture clients may inject explicit runtime identity, while live plan and apply entrypoints reject it before I/O', () => {
  const fixtureClient = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  assert.equal(reconcileFixtureTestHarness.resolveRuntimeValidationContext({
    client: fixtureClient,
    inventory,
    runtimeProfile,
    runtimeValidationContext,
  }), runtimeValidationContext)
  assert.equal(fixtureClient.calls.length, 0)

  const plainFakeClient = {
    calls: [],
    request(...args) {
      this.calls.push(args)
      throw new Error('explicit production boundary must reject injection before transport')
    },
  }
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: plainFakeClient,
      inventory,
      runtimeProfile,
      runtimeValidationContext,
      live: false,
      executionBoundary: 'fixture',
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.deepEqual(plainFakeClient.calls, [])

  const livePlanClient = new ReadbackGhApiClient({})
  const livePlanRings = readJsonFile(resolve(FIXTURES, 'rings-hold.json'))
  assert.throws(
    () => reconcileBuildPlan({
      inventory,
      desired,
      rings: livePlanRings,
      certifications: uncertifiedRuntimeLedger(),
      waivers,
      client: livePlanClient,
      verifiedReleaseEvidence: verifiedEvidenceFor(livePlanRings),
      issuerRegistry: baseIssuerRegistry,
      runtimeProfile: baseRuntimeProfile,
      runtimeValidationContext,
      now: NOW,
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.equal(livePlanClient.calls.length, 0)

  const liveApplyClient = new ReadbackGhApiClient({})
  assert.throws(
    () => reconcileApplyPlan({}, liveApplyClient, {
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-live-runtime-injection-')), 'journal.json'),
      inventory,
      desired,
      rings: {},
      certifications: {},
      waivers,
      runtimeProfile: baseRuntimeProfile,
      mutationBoundaryContract,
      runtimeValidationContext,
      clock: () => NOW,
    }),
    /Live GitHub apply refuses an injected runtime validation identity/,
  )
  assert.equal(liveApplyClient.calls.length, 0)
})

test('workflow-permission drift produces one exact reversible action bound to independent readback', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  client.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response = {
    default_workflow_permissions: 'write',
    can_approve_pull_request_reviews: false,
  }
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  const actions = plan.repoPlans[0].candidateActions.filter(action => action.kind === 'update-actions-workflow-permissions')

  assert.equal(actions.length, 1)
  assert.deepEqual(actions[0], {
    kind: 'update-actions-workflow-permissions',
    method: 'PUT',
    path: '/repos/acme/consumer/actions/permissions/workflow',
    body: {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false,
    },
    resource: 'actions-workflow-permissions',
    beforeImage: {
      state: 'present',
      value: {
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: false,
      },
      digest: actions[0].beforeImage.digest,
    },
    expectedApplied: {
      state: 'present',
      value: {
        default_workflow_permissions: 'read',
        can_approve_pull_request_reviews: false,
      },
      digest: actions[0].expectedApplied.digest,
    },
    compensation: {
      safety: 'automatic',
      method: 'PUT',
      path: '/repos/acme/consumer/actions/permissions/workflow',
      body: {
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: false,
      },
    },
  })
  assert.ok(client.calls.every(call => call.method === 'GET'))

  const malformed = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  delete malformed.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response.can_approve_pull_request_reviews
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: malformed, now: NOW }),
    /workflow-permissions response has an invalid or open shape/,
  )

  const openReadback = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  openReadback.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response.unreviewed = true
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: openReadback, now: NOW }),
    /workflow-permissions response has an invalid or open shape/,
  )
})

test('a consumer profile cannot request authority-only immutable releases', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const immutableDesired = structuredClone(desired)
  immutableDesired.profiles['product-consumer'].immutableReleases = true
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))

  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired: immutableDesired, rings, certifications, waivers, client, now: NOW }),
    /desired schema validation failed: .*immutableReleases must be equal to constant/,
  )
  assert.deepEqual(client.calls, [])
})

test('apply is refused before mutation when the release ring locks remote writes', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: new Date('2026-07-20T00:00:00Z') })

  assert.throws(() => applyPlan(plan, client, { issuerRegistry, journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-hold-')), 'journal.json'), inventory, desired, rings, now: NOW }), /no signed-authorization-approved repository/)
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('eligible apply executes only the precomputed managed actions', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client, now: NOW })
  const verified = plan.repoPlans[0].actions.find(action => action.resource === 'fleet/verified-main')

  assert.equal(verified.body.enforcement, 'active')
  assert.equal(plan.summary.registeredInventory.conflicts, 0)
  assert.equal(plan.summary.selectedWave.actions, 6)
  const applyClient = new ReadbackClient()
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-apply-')), 'journal.json')
  const result = applyPlan(plan, applyClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW })
  assert.equal(result.actions.length, 6)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(journal.state, 'verified')
  assert.equal(journal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.equal(journal.mirrorIdentity, null)
  assert.deepEqual(journal.offHostReceipts, [])
  assert.equal(journal.events.every(event => event.mirrorRequestNonce === null), true)
  assert.deepEqual(applyClient.calls.filter(call => call.method !== 'GET').map(call => call.method), ['PUT', 'POST', 'POST', 'POST', 'PUT', 'PUT'])
})

test('fleet journal durability is profile-bound and rejects adapter or class substitution before mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings: authorized,
    certifications,
    waivers,
    client: new FixtureApiClient(resolve(FIXTURES, 'empty')),
    now: NOW,
  })

  const injectedClient = new ReadbackClient()
  const injectedJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-small-injected-worm-')),
    'journal.json',
  )
  assert.throws(
    () => applyPlan(plan, injectedClient, {
      issuerRegistry,
      journalPath: injectedJournalPath,
      inventory,
      desired,
      rings: authorized,
      now: NOW,
      offHostMirror: offHostMirror(),
    }),
    /Local fleet journal does not accept or claim an off-host\/WORM adapter/,
  )
  assert.equal(existsSync(injectedJournalPath), false)
  assert.equal(injectedClient.calls.some(call => call.method !== 'GET'), false)

  const missingMirrorClient = new ReadbackClient()
  const missingMirrorJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-maximum-missing-worm-')),
    'journal.json',
  )
  assert.throws(
    () => applyPlan(plan, missingMirrorClient, maximumAssuranceApplyOptions({
      issuerRegistry,
      journalPath: missingMirrorJournalPath,
      inventory,
      desired,
      rings: authorized,
      now: NOW,
      offHostMirror: null,
    })),
    /Maximum-assurance fleet journal requires the activated off-host append-only mirror adapter/,
  )
  assert.equal(existsSync(missingMirrorJournalPath), false)
  assert.equal(missingMirrorClient.calls.some(call => call.method !== 'GET'), false)

  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-small-class-binding-')), 'journal.json')
  applyPlan(plan, new ReadbackClient(), {
    issuerRegistry,
    journalPath,
    inventory,
    desired,
    rings: authorized,
    now: NOW,
  })
  const forged = readJson(journalPath)
  forged.evidenceDurabilityClass = 'independent-append-only-off-host-v1'
  forged.mirrorIdentity = activatedMirrorIdentity()
  assert.throws(
    () => validateTransactionJournal(forged, {
      issuerRegistry,
      inventory,
      desired,
      rings: authorized,
      now: NOW,
    }),
    /evidence durability class differs from its exact active profile/,
  )
})

test('apply rechecks the default head and refuses drift before any mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const base = new ReadbackClient()
  const client = { request(method, path, body, options) {
    if (method === 'GET' && path === '/repos/acme/consumer/commits/main') return { sha: '4'.repeat(40), commit: { committer: { date: '2026-07-19T23:00:00Z' } } }
    return base.request(method, path, body, options)
  } }
  assert.throws(
    () => applyPlan(plan, client, { issuerRegistry, journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-head-drift-')), 'journal.json'), inventory, desired, rings: authorized, now: NOW }),
    /default-branch head drift/,
  )
  assert.equal(base.calls.some(call => call.method !== 'GET'), false)
})

test('production mutation entrypoints reject fixture API provenance', async () => {
  await assert.rejects(
    () => reconcileMain(['--fixture-dir', resolve(FIXTURES, 'empty'), '--apply']),
    /Fixture API clients are plan\/test-only/,
  )
  await assert.rejects(
    () => reconcileMain(['--fixture-dir', resolve(FIXTURES, 'empty'), '--recover-journal', '/tmp/untrusted-fixture-journal.json']),
    /Fixture API clients are plan\/test-only/,
  )
})

test('GitHub API transport pins the mutation-boundary API version', () => {
  assert.deepEqual(githubApiRequestArgs('GET', '/repos/acme/consumer/rulesets'), [
    'api', '-X', 'GET',
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '/repos/acme/consumer/rulesets',
  ])
})

test('apply binds the exact signed mirror adapter and live-verifies the terminal head', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })

  const wrongAdapter = offHostMirror()
  wrongAdapter.adapterCommandSha256 = 'f'.repeat(64)
  const wrongClient = new ReadbackClient()
  assert.throws(
    () => applyPlan(plan, wrongClient, maximumAssuranceApplyOptions({
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-mirror-adapter-')), 'journal.json'),
      inventory,
      desired,
      rings: authorized,
      now: NOW,
      offHostMirror: wrongAdapter,
    })),
    /adapter artifact differs from the signed activation identity/,
  )
  assert.equal(wrongClient.calls.some(call => call.method !== 'GET'), false)

  const terminalMirror = offHostMirror()
  const verify = terminalMirror.verify.bind(terminalMirror)
  const terminalEventCount = 2 + plan.summary.selectedWave.actions * 3 + 1
  terminalMirror.verify = envelope => {
    if (envelope.eventCount === terminalEventCount) throw new Error('terminal mirror readback unavailable')
    return verify(envelope)
  }
  const terminalClient = new ReadbackClient()
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-mirror-terminal-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, terminalClient, maximumAssuranceApplyOptions({
      issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW, offHostMirror: terminalMirror,
    })),
    /no rollback was claimed or attempted.*terminal mirror readback unavailable/,
  )
  const journal = readJson(journalPath)
  assert.equal(journal.state, 'failed-partial-state-possible')
  assert.equal(journal.actions.every(action => action.status === 'verified'), true)
})

test('mutation-boundary guards stop on mirror-time authorization expiry, SSOT drift, and inter-write fleet drift', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })

  const clockClient = new ReadbackClient()
  const expiredAt = new Date('2026-07-20T02:00:00.000Z')
  let actionApplyingMirrored = false
  const clockMirror = offHostMirror()
  const appendBeforeExpiry = clockMirror.append.bind(clockMirror)
  clockMirror.append = envelope => {
    const receipt = appendBeforeExpiry(envelope)
    if (envelope.event.type === 'action-applying') actionApplyingMirrored = true
    return receipt
  }
  assert.throws(
    () => applyPlan(plan, clockClient, maximumAssuranceApplyOptions({
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-clock-expiry-')), 'journal.json'),
      inventory,
      desired,
      rings: authorized,
      offHostMirror: clockMirror,
      clock: () => (actionApplyingMirrored ? expiredAt : NOW),
    })),
    /no rollback was claimed or attempted.*(?:authorization|current rollout wave|hidden GitHub observation is too old)/,
  )
  assert.equal(clockClient.calls.filter(call => call.method !== 'GET').length, 0)

  const liveActivation = activatedRequirements()
  const ssotClient = new ReadbackClient()
  let reloads = 0
  assert.throws(
    () => applyPlan(plan, ssotClient, {
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-ssot-drift-')), 'journal.json'),
      inventory,
      desired,
      rings: authorized,
      now: NOW,
      activationRequirements: liveActivation,
      reloadCurrentGovernance: () => {
        reloads += 1
        const model = reloadableGovernance({ currentRings: authorized, activationRequirements: liveActivation })
        if (reloads >= 4) model.waivers.waivers.push({ untrusted: true })
        return model
      },
    }),
    /canonical governance SSOT changed during transaction: waivers/,
  )
  assert.equal(ssotClient.calls.filter(call => call.method !== 'GET').length, 0)

  for (const [label, mutate, expected] of [
    ['activation desired', model => { model.activationDesired.integrations.governanceCheckApp.id = 9999 }, /canonical governance SSOT changed during transaction: activationDesired/],
    ['mutation-boundary contract', model => { model.mutationBoundaryContract.githubApiVersion = '2099-01-01' }, /canonical governance SSOT changed during transaction: mutationBoundaryContract/],
  ]) {
    const boundaryClient = new ReadbackClient()
    let boundaryReloads = 0
    assert.throws(
      () => applyPlan(plan, boundaryClient, {
        issuerRegistry,
        journalPath: resolve(mkdtempSync(resolve(tmpdir(), `gov-${label.replaceAll(' ', '-')}-drift-`)), 'journal.json'),
        inventory,
        desired,
        rings: authorized,
        now: NOW,
        activationRequirements: liveActivation,
        reloadCurrentGovernance: () => {
          boundaryReloads += 1
          const model = reloadableGovernance({ currentRings: authorized, activationRequirements: liveActivation })
          if (boundaryReloads >= 4) mutate(model)
          return model
        },
      }),
      expected,
      label,
    )
    assert.equal(boundaryClient.calls.filter(call => call.method !== 'GET').length, 0, label)
  }

  const boundaryDriftClient = new ReadbackClient()
  const boundaryDriftMirror = offHostMirror()
  const appendBeforeDrift = boundaryDriftMirror.append.bind(boundaryDriftMirror)
  boundaryDriftMirror.append = envelope => {
    const receipt = appendBeforeDrift(envelope)
    if (envelope.event.type === 'action-applying') {
      boundaryDriftClient.rulesets.set('9998', {
        id: 9998,
        name: 'fleet/mirror-window-rogue',
        target: 'branch',
        enforcement: 'disabled',
        conditions: {},
        bypass_actors: [],
        rules: [],
      })
    }
    return receipt
  }
  assert.throws(
    () => applyPlan(plan, boundaryDriftClient, maximumAssuranceApplyOptions({
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-mirror-window-drift-')), 'journal.json'),
      inventory,
      desired,
      rings: authorized,
      now: NOW,
      offHostMirror: boundaryDriftMirror,
    })),
    /selected fleet full-state drift|promotion predicate evidence drift/,
  )
  assert.equal(boundaryDriftClient.calls.filter(call => call.method !== 'GET').length, 0)

  const base = new ReadbackClient()
  let writes = 0
  const driftClient = { request(method, path, body, options) {
    const response = base.request(method, path, body, options)
    if (method !== 'GET') {
      writes += 1
      if (writes === 1) {
        const id = '9999'
        base.rulesets.set(id, { id: Number(id), ...structuredClone(body), name: 'fleet/inter-write-rogue' })
      }
    }
    return response
  } }
  assert.throws(
    () => applyPlan(plan, driftClient, {
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-inter-write-drift-')), 'journal.json'),
      inventory,
      desired,
      rings: authorized,
      now: NOW,
    }),
    /selected fleet full-state drift|promotion predicate evidence drift/,
  )
  assert.equal(writes, 1)
})

test('GitHub collection observation paginates past 100 without truncation', () => {
  const base = new ReadbackClient()
  for (let index = 1; index <= 101; index += 1) {
    const id = String(10_000 + index)
    base.rulesets.set(id, {
      id: Number(id),
      name: `external/ruleset-${index}`,
      target: 'branch',
      enforcement: 'disabled',
      conditions: {},
      bypass_actors: [],
      rules: [],
    })
  }
  const client = { request(method, path, body, options) {
    if (method === 'GET' && path === '/repos/acme/consumer/rulesets?per_page=100') return [...base.rulesets.values()].slice(0, 100).map(({ id, name }) => ({ id, name }))
    if (method === 'GET' && path === '/repos/acme/consumer/rulesets?per_page=100&page=2') return [...base.rulesets.values()].slice(100).map(({ id, name }) => ({ id, name }))
    return base.request(method, path, body, options)
  } }
  const state = fetchRepositoryState(client, inventory.repositories[0], {
    requiredChecks: [],
    declaredEnvironments: [],
    tagPolicy: {},
    immutableReleases: false,
  }, desired)
  assert.equal(state.rulesetSummaries.length, 101)
  assert.equal(state.rulesets.length, 101)
})

test('any GitHub API failure aborts the plan and performs no writes', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'error'))

  assert.throws(() => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client }), /HTTP 503/)
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('comment and dead-job strings cannot spoof a reviewed protected-base workflow identity', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const content = `# pull_request_target: actions/create-github-app-token@1111111111111111111111111111111111111111 audit
name: Spoof
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  dead-spoof:
    if: false
    runs-on: ubuntu-latest
    environment: governance-upgrade
    steps:
      - run: |
          echo 'secrets.GOVERNANCE_CHECK_APP_ID permission-checks: write /check-runs github.event.pull_request.head.sha'
`
  const identity = workflowIdentity(content)
  const route = client.routes['GET /repos/acme/consumer/contents/.github/workflows/governance-anchor.yml?ref=main']
  route.response = { text: content, sha: identity.gitBlobSha }

  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('differs from the reviewed protected-base identity')))
  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('lacks pull_request_target trigger')))
})

test('candidate-controlled same-name GitHub Actions checks and stale-head App checks do not satisfy the trust anchor', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  for (const run of [
    { id: 9100, name: 'Immutable consumer snapshot', head_sha: '2'.repeat(40), status: 'completed', conclusion: 'success', completed_at: '2026-07-20T00:00:00Z', app: { id: 15368, slug: 'github-actions' } },
    { id: 9101, name: 'Immutable consumer snapshot', head_sha: '1'.repeat(40), status: 'completed', conclusion: 'success', completed_at: '2026-07-20T00:00:00Z', app: { id: 1001, slug: 'qijenchen-governance-check' } },
  ]) {
    const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
    client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs = [run]
    const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
    assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('current head 2222222222222222222222222222222222222222')))
    assert.equal(plan.repoPlans[0].predicateResults.find(predicate => predicate.type === 'required-checks-green').pass, false)
  }
})

test('GitHub-owned dynamic Dependabot runs are excluded from repository-workflow provenance', () => {
  const observed = fetchWorkflowRunFixture(clientWithWorkflowRun())
  const dependabot = observed.checkRuns.find(run => run.id === 9077)

  assert.ok(dependabot)
  assert.equal(Object.hasOwn(dependabot, 'workflowRun'), false)
})

test('ordinary GitHub Actions workflow runs retain exact repository-workflow provenance', () => {
  const observed = fetchWorkflowRunFixture(clientWithWorkflowRun({
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
  }))
  const repositoryRun = observed.checkRuns.find(run => run.id === 9077)

  assert.equal(repositoryRun.workflowRun.path, '.github/workflows/ci.yml')
  assert.equal(repositoryRun.workflowRun.event, 'pull_request')
})

test('unknown dynamic and forged GitHub Actions App/path/event combinations fail closed', () => {
  const invalid = [
    { label: 'unknown dynamic namespace', path: 'dynamic/codeql/default-setup', event: 'dynamic' },
    { label: 'repository path with dynamic event', path: '.github/workflows/ci.yml', event: 'dynamic' },
    { label: 'Dependabot path with repository event', path: 'dynamic/dependabot/dependabot-updates', event: 'pull_request' },
    { label: 'Dependabot traversal path', path: 'dynamic/dependabot/../ci.yml', event: 'dynamic' },
    { label: 'repository traversal path', path: '.github/workflows/../ci.yml', event: 'pull_request' },
    { label: 'forged GitHub Actions slug', app: { id: 15368, slug: 'not-github-actions' } },
    { label: 'forged GitHub Actions id', app: { id: 999999, slug: 'github-actions' } },
    { label: 'fully unknown App', app: { id: 999999, slug: 'not-github-actions' } },
  ]

  for (const scenario of invalid) {
    assert.throws(
      () => fetchWorkflowRunFixture(clientWithWorkflowRun(scenario)),
      /(?:GitHub (?:workflow-run (?:dynamic identity|path)|Actions check-run App identity) (?:is invalid|mismatch)|Untrusted check-run App claims a GitHub Actions workflow run)/,
      scenario.label,
    )
  }
})

test('a successful check older than the current commit or freshness window fails closed', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs[0].completed_at = '2026-07-18T00:00:00Z'
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('lacks a fresh successful run')))
})

test('a new candidate release cannot inherit an old completed soak clock', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  rings.candidateRelease = {
    ...rings.candidateRelease,
    id: 'ajenchen/design-system@v1.0.1',
    version: '1.0.1',
    packages: rings.candidateRelease.packages.map(item => ({ ...item, version: '1.0.1' })),
  }
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW }),
    /candidate digest was not reset/,
  )
})

test('candidate plan materialization requires current verified release evidence before any GitHub read', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ issuerRegistry, runtimeProfile, runtimeValidationContext, inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence: null, now: NOW }),
    /verified release evidence must be an object/,
  )
  assert.deepEqual(client.calls, [])
})

test('verified evidence for an older candidate cannot authorize a changed candidate plan', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const oldEvidence = verifiedEvidenceFor(rings)
  rings.candidateRelease.observedAt = '2019-01-01T00:00:01Z'
  rings.assignments.consumer.candidateReleaseDigest = sha256(stableStringify(rings.candidateRelease, 0))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ issuerRegistry, runtimeProfile, runtimeValidationContext, inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence: oldEvidence, now: NOW }),
    /verified release evidence is stale for the current candidate release/,
  )
  assert.deepEqual(client.calls, [])
})

function desiredWithUnresolvedApps() {
  const unresolved = structuredClone(desired)
  unresolved.integrations.governanceCheckApp = {
    id: null,
    slug: 'qijenchen-governance-check',
    required: true,
    externalTrustAnchor: true,
    capability: 'check-only',
    operationMode: 'base-trusted-isolated-workflow',
    repositorySelection: 'selected',
    permissions: { checks: 'write' },
    secretPrefix: 'GOVERNANCE_CHECK_APP',
  }
  unresolved.integrations.governanceWriterApp = {
    id: null,
    slug: 'qijenchen-governance-writer',
    required: true,
    externalTrustAnchor: false,
    capability: 'writer',
    operationMode: 'github-actions-environment',
    repositorySelection: 'selected',
    permissions: { contents: 'write', pullRequests: 'write', workflows: 'write' },
    secretPrefix: 'GOVERNANCE_WRITER_APP',
  }
  unresolved.profiles['product-consumer'].requiredChecks[0] = {
    ...unresolved.profiles['product-consumer'].requiredChecks[0],
    integration: 'governanceCheckApp',
    requiredEvents: ['pull_request_target'],
    baseTrusted: true,
  }
  return unresolved
}

test('unresolved distinct Governance Check and Writer App integrations block before any mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const unresolved = desiredWithUnresolvedApps()
  const unresolvedCertifications = certificationsWithoutExternalGitHubTrust()
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs = []
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired: unresolved, rings, certifications: unresolvedCertifications, waivers, client, now: NOW })

  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('required integration unresolved: governanceCheckApp')))
  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('required integration unresolved: governanceWriterApp')))
  assert.throws(() => applyPlan(plan, new ReadbackClient(), { issuerRegistry, journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-app-')), 'journal.json'), inventory, desired: unresolved, rings, now: NOW }), /no signed-authorization-approved repository/)
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('an unresolved non-Actions App identity cannot claim a GitHub Actions workflow run', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const unresolvedCertifications = certificationsWithoutExternalGitHubTrust()

  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired: desiredWithUnresolvedApps(), rings, certifications: unresolvedCertifications, waivers, client, now: NOW }),
    /Untrusted check-run App claims a GitHub Actions workflow run/,
  )
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

function desiredWithDistinctApps() {
  return structuredClone(desired)
}

test('same integration ID cannot collapse the Check and Writer trust domains', () => {
  const split = desiredWithDistinctApps()
  split.integrations.governanceWriterApp.id = split.integrations.governanceCheckApp.id

  assert.throws(
    () => validateModel(inventory, split, readJson(resolve(FIXTURES, 'rings-eligible.json')), certifications, waivers, NOW, issuerRegistry, runtimeProfile),
    /must have distinct integration IDs/,
  )
})

test('App capabilities and secret prefixes fail closed when roles overlap', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const wrongCheckCapability = desiredWithDistinctApps()
  wrongCheckCapability.integrations.governanceCheckApp.capability = 'writer'
  assert.throws(() => validateModel(inventory, wrongCheckCapability, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /must be the check-only external trust anchor|desired schema validation failed/)

  const wrongWriterCapability = desiredWithDistinctApps()
  wrongWriterCapability.integrations.governanceWriterApp.capability = 'check-only'
  assert.throws(() => validateModel(inventory, wrongWriterCapability, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Writer App must be writer-only|desired schema validation failed/)

  const sharedPrefix = desiredWithDistinctApps()
  sharedPrefix.integrations.governanceWriterApp.secretPrefix = sharedPrefix.integrations.governanceCheckApp.secretPrefix
  assert.throws(() => validateModel(inventory, sharedPrefix, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)

  const swappedPrefixes = desiredWithDistinctApps()
  swappedPrefixes.integrations.governanceCheckApp.secretPrefix = 'GOVERNANCE_WRITER_APP'
  swappedPrefixes.integrations.governanceWriterApp.secretPrefix = 'GOVERNANCE_CHECK_APP'
  assert.throws(() => validateModel(inventory, swappedPrefixes, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('App slug substitution and base-trusted check ownership fail closed at their canonical layers', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const sharedSlug = desiredWithDistinctApps()
  sharedSlug.integrations.governanceWriterApp.slug = sharedSlug.integrations.governanceCheckApp.slug
  assert.throws(() => validateModel(inventory, sharedSlug, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)

  const writerAsAnchor = desiredWithDistinctApps()
  writerAsAnchor.profiles['product-consumer'].requiredChecks[0] = {
    ...writerAsAnchor.profiles['product-consumer'].requiredChecks[0],
    integration: 'governanceWriterApp',
    baseTrusted: true,
  }
  assert.throws(() => validateModel(inventory, writerAsAnchor, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('a same-context candidate workflow cannot replace the required base-trusted App verdict', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const spoofable = desiredWithDistinctApps()
  spoofable.profiles['product-consumer'].requiredChecks[0] = {
    ...spoofable.profiles['product-consumer'].requiredChecks[0],
    integration: 'githubActions',
    trustSource: 'repository-workflow',
    requiredEvents: ['pull_request'],
    baseTrusted: false,
  }
  assert.throws(() => validateModel(inventory, spoofable, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('neither Governance App may impersonate the GitHub Actions integration', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const checkCollision = desiredWithDistinctApps()
  checkCollision.integrations.governanceCheckApp.id = checkCollision.integrations.githubActions.id
  assert.throws(() => validateModel(inventory, checkCollision, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Check App must not reuse the GitHub Actions integration ID/)

  const writerCollision = desiredWithDistinctApps()
  writerCollision.integrations.governanceWriterApp.id = writerCollision.integrations.githubActions.id
  assert.throws(() => validateModel(inventory, writerCollision, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Writer App must not reuse the GitHub Actions integration ID/)
})

test('check verdict environment cannot point at the Writer App credential', () => {
  const split = desiredWithDistinctApps()
  split.profiles['product-consumer'].environments[0].credentialIntegration = 'governanceWriterApp'

  assert.throws(
    () => validateModel(inventory, split, readJson(resolve(FIXTURES, 'rings-eligible.json')), certifications, waivers, NOW, issuerRegistry, runtimeProfile),
    /desired schema validation failed/,
  )
})

test('partial API failure records recovery truth and never claims rollback', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const planClient = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: planClient, now: NOW })
  let writes = 0
  const base = new ReadbackClient()
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 2) throw new Error('simulated write failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-fail-')), 'journal.json')

  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(journal.state, 'failed-partial-state-possible')
  assert.equal(journal.rollbackAttempted, false)
  assert.equal(journal.actions[0].status, 'verified')
  assert.equal(journal.actions[1].status, 'applying')
  assert.match(journal.rollbackPlanDigest, /^[a-f0-9]{64}$/)
  assert.equal(journal.schemaVersion, 6)
  assert.equal(journal.historicalControlPlaneDigest, historicalControlPlaneDigest(journal.historicalControlPlane))
})

test('single-owner local journal supports exact rollback and forward recovery through fresh plans and journals', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const base = new ReadbackClient()
  const initialPlan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings: authorized,
    certifications,
    waivers,
    client: new FixtureApiClient(resolve(FIXTURES, 'empty')),
    now: NOW,
  })
  let writes = 0
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 3) throw new Error('forward-recovery fixture partial failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const initialJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-local-forward-recovery-initial-')),
    'journal.json',
  )
  assert.throws(
    () => applyPlan(initialPlan, failingClient, {
      issuerRegistry,
      journalPath: initialJournalPath,
      inventory,
      desired,
      rings: authorized,
      now: NOW,
    }),
    /no rollback was claimed or attempted/,
  )
  const failedJournal = readJson(initialJournalPath)
  assert.equal(failedJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.deepEqual(failedJournal.offHostReceipts, [])
  assert.equal(failedJournal.rollbackAttempted, false)

  const recovery = recoveryAuthorizationFor({
    journalPath: initialJournalPath,
    currentRings: authorized,
  })
  const rollback = rollbackTransaction(initialJournalPath, base, {
    issuerRegistry: recovery.issuerRegistry,
    inventory: recovery.inventory,
    desired,
    rings: recovery.rings,
    privilegedPolicy: recovery.privilegedPolicy,
    recoveryAuthorization: recovery.authorization,
    clock: () => NOW,
  })
  assert.equal(rollback.rolledBack, true)
  assert.equal(base.rulesets.size, 0)
  assert.equal(base.environments.size, 0)
  const rolledBackJournal = readJson(initialJournalPath)
  assert.equal(rolledBackJournal.state, 'rolled-back-verified')
  assert.equal(rolledBackJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.deepEqual(rolledBackJournal.offHostReceipts, [])

  const forwardAuthorized = authorizeCurrentWave(
    rings,
    () => base,
    {
      issuedAt: '2026-07-20T00:05:00Z',
      expiresAt: '2026-07-20T01:00:00Z',
    },
  )
  const forwardPlan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings: forwardAuthorized,
    certifications,
    waivers,
    client: base,
    now: NOW,
  })
  assert.equal(forwardPlan.candidatePlanDigest, initialPlan.candidatePlanDigest)
  const forwardJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-local-forward-recovery-next-')),
    'journal.json',
  )
  const forwardAt = new Date('2026-07-20T00:05:00.000Z')
  const forward = applyPlan(forwardPlan, base, {
    issuerRegistry,
    journalPath: forwardJournalPath,
    inventory,
    desired,
    rings: forwardAuthorized,
    now: NOW,
    clock: () => forwardAt,
  })
  assert.equal(forward.applied, true)
  const forwardJournal = readJson(forwardJournalPath)
  assert.equal(forwardJournal.state, 'verified')
  assert.equal(forwardJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.deepEqual(forwardJournal.offHostReceipts, [])
  assert.notEqual(forwardJournal.transactionId, rolledBackJournal.transactionId)
  assert.notEqual(forwardJournal.authorizationEnvelopeDigest, rolledBackJournal.authorizationEnvelopeDigest)
  assert.equal(readJson(initialJournalPath).state, 'rolled-back-verified')
})

test('a timed-out idempotent mirror append can attach only the exact signed pending receipt before recovery observes GitHub', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const remote = offHostMirror()
  const stored = new Map()
  let failedOnce = false
  const mirror = {
    adapterCommandSha256: remote.adapterCommandSha256,
    append(envelope) {
      const key = envelope.idempotencyKey
      if (!stored.has(key)) stored.set(key, remote.append(envelope))
      if (envelope.sequence === 4 && !failedOnce) {
        failedOnce = true
        throw new Error('transport timed out after durable append')
      }
      return structuredClone(stored.get(key))
    },
    verify: envelope => remote.verify(envelope),
  }
  const client = new ReadbackClient()
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-pending-ack-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, client, maximumAssuranceApplyOptions({
      issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW, offHostMirror: mirror,
    })),
    /externally unacknowledged journal event/,
  )
  const pending = readJson(journalPath)
  assert.equal(pending.events.length, pending.offHostReceipts.length + 1)
  assert.equal(client.calls.filter(call => call.method !== 'GET').length, 1)

  const result = recoverTransaction(journalPath, client, { issuerRegistry, offHostMirror: mirror, clock: () => NOW })
  assert.equal(result.observed, true)
  const repaired = readJson(journalPath)
  assert.equal(repaired.events.length, repaired.offHostReceipts.length)
  assert.equal(repaired.state, 'recovery-observed')
})

test('signed receipts, activation-bound mirror identity, and replayable runtime transitions reject local tampering', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-signed-journal-')), 'journal.json')
  applyPlan(plan, new ReadbackClient(), maximumAssuranceApplyOptions({
    issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW,
  }))
  const journal = readJson(journalPath)

  const forgedReceipt = structuredClone(journal)
  forgedReceipt.offHostReceipts[0].signature = `${forgedReceipt.offHostReceipts[0].signature.slice(0, -1)}${forgedReceipt.offHostReceipts[0].signature.endsWith('A') ? 'B' : 'A'}`
  assert.throws(
    () => validateTransactionJournal(forgedReceipt, {
      issuerRegistry, inventory, desired, rings: authorized, now: NOW,
      expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumActivationPolicy),
    }),
    /mirror response signature is invalid/,
  )

  const forgedRuntime = structuredClone(journal)
  forgedRuntime.events[1].runtimeState.actions[0].status = 'verified'
  assert.throws(
    () => validateTransactionJournal(forgedRuntime, {
      issuerRegistry, inventory, desired, rings: authorized, now: NOW,
      expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumActivationPolicy),
    }),
    /event 1 chain binding|state digest|applying transition/,
  )

  const forgedIdentity = structuredClone(journal)
  forgedIdentity.mirrorIdentity.tenant = 'attacker-tenant'
  assert.throws(
    () => validateTransactionJournal(forgedIdentity, {
      issuerRegistry, inventory, desired, rings: authorized, now: NOW,
      expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumActivationPolicy),
    }),
    /receipt differs from the activated mirror identity|mirror identity differs from signed external activation evidence|authorization envelope digest/,
  )
})

test('historical journal replay derives activation digests from the signed embedded bundle while current apply stays pinned', () => {
  const historicalPolicy = structuredClone(activationPolicy)
  historicalPolicy.requirements[0].reason = `${historicalPolicy.requirements[0].reason} Historical revision.`
  const historicalContractDigest = 'a'.repeat(64)
  const journal = {
    externalActivationPolicy: historicalPolicy,
    externalActivationMutationBoundaryContractDigest: historicalContractDigest,
  }
  assert.deepEqual(transactionJournalActivationDigestExpectations(journal, 'historical-observation'), {
    expectedPolicyDigest: sha256(stableStringify(historicalPolicy, 0)),
    expectedMutationBoundaryContractDigest: historicalContractDigest,
  })
  assert.deepEqual(transactionJournalActivationDigestExpectations(journal, 'current-apply'), {
    expectedPolicyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    expectedMutationBoundaryContractDigest: GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  })
  assert.throws(() => transactionJournalActivationDigestExpectations(journal, 'untrusted-mode'), /Unknown transaction-journal validation mode/)
})

test('v6 journal and recovery authorization schemas are closed and validate emitted artifacts', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('schema fixture partial failure')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-v5-schema-')), 'journal.json')
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const fresh = recoveryAuthorizationFor({ journalPath, currentRings: authorized })

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const name of ['managed-repos', 'github-desired', 'release-rings', 'issuer-registry', 'github-mutation-boundary-contract', 'external-activation-policy', 'external-activation-requirements', 'fleet-reconcile-journal', 'fleet-recovery-authorization']) {
    ajv.addSchema(readJson(resolve(SCHEMAS, `${name}.schema.json`)))
  }
  const validateJournal = ajv.getSchema('https://qijenchen.dev/schemas/fleet-reconcile-journal-v6.json')
  const validateAuthorization = ajv.getSchema('https://qijenchen.dev/schemas/fleet-recovery-authorization-v2.json')
  assert.equal(validateJournal(journal), true, JSON.stringify(validateJournal.errors))
  assert.equal(validateAuthorization(fresh.authorization), true, JSON.stringify(validateAuthorization.errors))
  assert.equal(validateJournal({ ...journal, untrustedExtension: true }), false)
  assert.equal(validateAuthorization({ ...fresh.authorization, untrustedExtension: true }), false)
})

test('partial apply remains observable after issuer revocation, rotation, inventory drift, and desired drift; rollback requires fresh current dual quorum', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings: authorized,
    certifications,
    waivers,
    client: new FixtureApiClient(resolve(FIXTURES, 'empty')),
    now: NOW,
  })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 3) throw new Error('simulated partial rollout')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-v5-recovery-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, failingClient, maximumAssuranceApplyOptions({
      issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW,
    })),
    /no rollback was claimed or attempted/,
  )

  const first = generatedRecoveryIssuer('one')
  const second = generatedRecoveryIssuer('two')
  const rootFirst = generatedRecoveryIssuer('root-one')
  const rootSecond = generatedRecoveryIssuer('root-two')
  const revokedOriginal = {
    ...structuredClone(issuerRegistry.issuers[0]),
    status: 'revoked',
    revokedAt: '2026-07-20T00:10:00.000Z',
  }
  const historicalManagedIssuers = structuredClone(issuerRegistry.issuers.slice(1))
  const currentIssuerRegistry = registryFor([
    revokedOriginal,
    ...historicalManagedIssuers,
    first.record,
    second.record,
    rootFirst.record,
    rootSecond.record,
  ])
  const currentInventory = inventoryWithAuthority()
  currentInventory.repositories.find(repository => repository.id === 'consumer').visibility = 'public'
  const currentDesired = { ...structuredClone(desired), checkRunMaxAgeMinutes: desired.checkRunMaxAgeMinutes + 1 }
  const currentRings = structuredClone(authorized)
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [first.record.keyId, second.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 2
  currentRings.attestationPolicy.completionAttestationQuorum = 2
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    quorum: 2,
    allowedKeyIds: [rootFirst.record.keyId, rootSecond.record.keyId],
    externalActivationPolicy: maximumActivationPolicy,
  })

  const backdatedIssuerRegistry = registryFor([
    { ...revokedOriginal, revokedAt: '2026-07-19T23:59:59.000Z' },
    ...historicalManagedIssuers,
    first.record,
    second.record,
  ])
  const callsBeforeBackdatedRecovery = base.calls.length
  assert.throws(
    () => recoverTransaction(journalPath, base, { issuerRegistry: backdatedIssuerRegistry, offHostMirror: offHostMirror(), clock: () => NOW }),
    /revoked at or before the historical transaction time/,
  )
  assert.equal(base.calls.length, callsBeforeBackdatedRecovery)

  const observation = recoverTransaction(journalPath, base, { issuerRegistry: currentIssuerRegistry, offHostMirror: offHostMirror(), clock: () => NOW })
  assert.equal(observation.observed, true)
  assert.equal(observation.rolledBack, false)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'recovery-observed')

  const callsBeforeUnauthorizedRollback = base.calls.length
  assert.throws(
    () => rollbackTransaction(journalPath, base, {
      issuerRegistry: currentIssuerRegistry,
      inventory: currentInventory,
      desired: currentDesired,
      rings: currentRings,
      privilegedPolicy,
      externalActivationPolicy: maximumActivationPolicy,
      offHostMirror: offHostMirror(),
      clock: () => new Date('2026-07-20T00:30:00.000Z'),
      now: new Date('2026-07-20T00:30:00.000Z'),
    }),
    /fresh current profile-bound recovery authorization/,
  )
  assert.equal(base.calls.length, callsBeforeUnauthorizedRollback)

  const signers = [first, second].map(item => ({
    keyId: item.record.keyId,
    subject: item.record.subject,
    privateKey: item.keys.privateKey,
  }))
  const rootSigners = [rootFirst, rootSecond].map(item => ({
    keyId: item.record.keyId,
    subject: item.record.subject,
    privateKey: item.keys.privateKey,
  }))
  const applyOnly = recoveryAuthorizationFor({
    journalPath,
    currentInventory,
    currentDesired,
    currentRings,
    currentIssuerRegistry,
    privilegedPolicy,
    applySigners: signers,
    rootSigners: [],
    issuedAt: '2026-07-20T00:20:00.000Z',
    expiresAt: '2026-07-20T00:50:00.000Z',
  })
  assert.throws(
    () => rollbackTransaction(journalPath, base, {
      issuerRegistry: currentIssuerRegistry,
      inventory: currentInventory,
      desired: currentDesired,
      rings: currentRings,
      privilegedPolicy,
      externalActivationPolicy: maximumActivationPolicy,
      recoveryAuthorization: applyOnly.authorization,
      offHostMirror: offHostMirror(),
      clock: () => new Date('2026-07-20T00:30:00.000Z'),
      now: new Date('2026-07-20T00:30:00.000Z'),
    }),
    /rootSignatures lack required current root-rotator quorum 2/,
  )
  assert.equal(base.calls.length, callsBeforeUnauthorizedRollback)

  const dual = recoveryAuthorizationFor({
    journalPath,
    currentInventory,
    currentDesired,
    currentRings,
    currentIssuerRegistry,
    privilegedPolicy,
    applySigners: signers,
    rootSigners,
    issuedAt: '2026-07-20T00:20:00.000Z',
    expiresAt: '2026-07-20T00:50:00.000Z',
  })
  assert.equal(new Set([
    ...dual.authorization.applySignatures.map(item => item.signerKeyId),
    ...dual.authorization.rootSignatures.map(item => item.signerKeyId),
  ]).size, 4, 'rollback quorums must be signer-disjoint')
  const rollback = rollbackTransaction(journalPath, base, {
    issuerRegistry: currentIssuerRegistry,
    inventory: currentInventory,
    desired: currentDesired,
    rings: currentRings,
    privilegedPolicy,
    externalActivationPolicy: maximumActivationPolicy,
    recoveryAuthorization: dual.authorization,
    offHostMirror: offHostMirror(),
    clock: () => new Date('2026-07-20T00:30:00.000Z'),
    now: new Date('2026-07-20T00:30:00.000Z'),
  })
  assert.equal(rollback.rolledBack, true)
  assert.equal(base.rulesets.size, 0)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled-back-verified')
})

test('rollback rechecks current authorization after the compensating event is durably mirrored', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method !== 'GET') {
      writes += 1
      if (writes === 3) throw new Error('rollback mutation-boundary fixture failure')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-rollback-boundary-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, failingClient, maximumAssuranceApplyOptions({
      issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW,
    })),
    /no rollback was claimed or attempted/,
  )

  const current = recoveryAuthorizationFor({ journalPath, currentRings: authorized })
  const mirror = offHostMirror()
  const appendBeforeExpiry = mirror.append.bind(mirror)
  let compensatingMirrored = false
  mirror.append = envelope => {
    const receipt = appendBeforeExpiry(envelope)
    if (envelope.event.type === 'rollback-compensating') compensatingMirrored = true
    return receipt
  }
  const result = rollbackTransaction(journalPath, base, {
    issuerRegistry: current.issuerRegistry,
    inventory: current.inventory,
    desired,
    rings: current.rings,
    privilegedPolicy: current.privilegedPolicy,
    recoveryAuthorization: current.authorization,
    offHostMirror: mirror,
    clock: () => (compensatingMirrored ? new Date('2026-07-20T01:00:00.000Z') : NOW),
  })
  assert.equal(result.rolledBack, false)
  assert.match(result.blocked.join('\n'), /expired/)
  assert.equal(base.calls.filter(call => call.method === 'DELETE').length, 0)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.ok(journal.events.some(event => event.type === 'rollback-compensating'))
  assert.ok(journal.events.some(event => event.type === 'rollback-blocked-error'))
})

test('a wholesale historical bundle, registry, authorization, and action replacement fails before recovery observation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-v5-forged-history-')), 'journal.json')
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)

  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  const attacker = generatedRecoveryIssuer('attacker')
  const attackerRegistry = registryFor([attacker.record])
  const attackerPolicy = {
    ...structuredClone(authorized.attestationPolicy),
    issuerRegistryDigest: issuerRegistryDigest(attackerRegistry),
    allowedKeyIds: [attacker.record.keyId],
    applyAuthorizationQuorum: 1,
    completionAttestationQuorum: 1,
  }
  const attackerInventory = structuredClone(inventory)
  attackerInventory.repositories[0].github = 'evil/arbitrary-target'
  const attackerDesired = { ...structuredClone(desired), managedRulesetPrefix: 'evil/' }
  const body = {
    name: 'evil/arbitrary-read-target',
    target: 'branch',
    enforcement: 'active',
    conditions: {},
    bypass_actors: [],
    rules: [{ type: 'deletion' }],
  }
  const absent = { state: 'absent', digest: sha256(stableStringify({ state: 'absent' }, 0)) }
  const expectedApplied = { state: 'present', value: body, digest: sha256(stableStringify({ state: 'present', value: body }, 0)) }
  const fixedAction = {
    kind: 'create-ruleset',
    method: 'POST',
    path: '/repos/evil/arbitrary-target/rulesets',
    body,
    resource: body.name,
    beforeImage: absent,
    expectedApplied,
    compensation: { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
  }
  forged.actions = [{ ...fixedAction, actionId: 'consumer:001:create-ruleset:evil/arbitrary-read-target', github: 'evil/arbitrary-target', repoId: 'consumer', status: 'pending' }]
  const actionsDigest = candidateActionsDigest([fixedAction])
  const predicateResults = [{ id: 'forged', type: 'plan-conflict-free', pass: true, evidenceDigest: 'a'.repeat(64), message: 'forged' }]
  const forgedAuthorization = issueApplyAuthorization({
    repoId: 'consumer',
    github: 'evil/arbitrary-target',
    ringId: 'ring-canary',
    waveId: 'canary',
    candidateRelease: forged.candidateRelease,
    verifiedReleaseEvidenceDigest: forged.verifiedReleaseEvidenceDigest,
    candidatePlanDigest: forged.candidatePlanDigest,
    predicateResults,
    stateDigest: 'b'.repeat(64),
    defaultBranchHeadSha: 'c'.repeat(40),
    actions: [fixedAction],
    signerKeyId: attacker.record.keyId,
    subject: attacker.record.subject,
    privateKey: attacker.keys.privateKey,
    issuedAt: forged.startedAt,
    expiresAt: '2026-07-20T00:50:00.000Z',
    attestationPolicy: attackerPolicy,
  })
  forged.repoBindings = [{
    repoId: 'consumer',
    github: 'evil/arbitrary-target',
    ring: 'ring-canary',
    wave: 'canary',
    defaultBranchHeadSha: 'c'.repeat(40),
    observedStateDigest: 'b'.repeat(64),
    predicateDigest: forgedAuthorization.predicateDigest,
    actionsDigest,
    applyAuthorization: forgedAuthorization,
  }]
  forged.rollbackPlan = [{
    actionId: forged.actions[0].actionId,
    repoId: 'consumer',
    resource: fixedAction.resource,
    beforeImageDigest: absent.digest,
    expectedAppliedDigest: expectedApplied.digest,
    compensation: structuredClone(fixedAction.compensation),
  }]
  forged.rollbackPlanDigest = sha256(stableStringify(forged.rollbackPlan, 0))
  forged.inventoryDigest = sha256(stableStringify(attackerInventory, 0))
  forged.desiredDigest = sha256(stableStringify(attackerDesired, 0))
  forged.attestationPolicyDigest = sha256(stableStringify(attackerPolicy, 0))
  forged.historicalControlPlane = normalizeHistoricalControlPlane({ inventory: attackerInventory, desired: attackerDesired, attestationPolicy: attackerPolicy, issuerRegistry: attackerRegistry })
  forged.historicalControlPlaneDigest = historicalControlPlaneDigest(forged.historicalControlPlane)
  forged.authorizationEnvelopeDigest = journalAuthorizationEnvelopeDigest(forged)
  writeFileSync(journalPath, JSON.stringify(forged))

  const client = { calls: 0, request() { this.calls += 1; throw new Error('forged endpoint must never be observed') } }
  assert.throws(
    () => recoverTransaction(journalPath, client, { issuerRegistry, clock: () => NOW }),
    /event 0 chain binding|latest event does not bind|missing from the append-only current registry/,
  )
  assert.equal(client.calls, 0)
})

test('rollback re-observes remote state and blocks on post-failure drift', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile,
    inventory, desired, rings: authorized, certifications, waivers,
    client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW,
  })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 3) throw new Error('simulated write failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-drift-')), 'journal.json')
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const firstRuleset = base.rulesets.values().next().value
  firstRuleset.enforcement = 'disabled'

  const fresh = recoveryAuthorizationFor({ journalPath, currentRings: authorized })
  const result = rollbackTransaction(journalPath, base, {
    issuerRegistry: fresh.issuerRegistry,
    inventory: fresh.inventory,
    desired,
    rings: fresh.rings,
    privilegedPolicy: fresh.privilegedPolicy,
    recoveryAuthorization: fresh.authorization,
    clock: () => NOW,
  })
  assert.equal(result.rolledBack, false)
  assert.ok(result.blocked.some(blocker => blocker.includes('rollback drift')))
  const blockedJournal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(blockedJournal.state, 'rollback-blocked')

  const driftedAction = blockedJournal.actions.find(action => action.resource === firstRuleset.name)
  assert.equal(driftedAction.expectedApplied.state, 'present')
  firstRuleset.enforcement = driftedAction.expectedApplied.value.enforcement
  const retryAuthorization = recoveryAuthorizationFor({ journalPath, currentRings: authorized })
  const retry = rollbackTransaction(journalPath, base, {
    issuerRegistry: retryAuthorization.issuerRegistry,
    inventory: retryAuthorization.inventory,
    desired,
    rings: retryAuthorization.rings,
    privilegedPolicy: retryAuthorization.privilegedPolicy,
    recoveryAuthorization: retryAuthorization.authorization,
    clock: () => NOW,
  })
  assert.equal(retry.rolledBack, true)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled-back-verified')
})

test('rollback refuses a modified compensating plan before remote observation or mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-rollback-digest-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.rollbackPlan[0].resource = 'arbitrary-resource'
  writeFileSync(journalPath, JSON.stringify(forged))
  const client = { request() { throw new Error('remote must not be observed') } }
  assert.throws(() => rollbackTransaction(journalPath, client, {
    issuerRegistry,
    inventory,
    desired,
    rings: authorized,
    clock: () => NOW,
  }), /latest event does not bind|rollback plan differs|Rollback plan digest mismatch/)
})

test('an untrusted rollback journal cannot inject an arbitrary repository endpoint', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-arbitrary-endpoint-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.actions[0].path = '/repos/acme/unmanaged/contents/README.md'
  assert.throws(
    () => validateTransactionJournal(forged, { issuerRegistry, inventory, desired, rings: authorized, now: NOW }),
    /latest event does not bind|endpoint is outside managed scope|Journal readback endpoint differs from the managed action/,
  )
})

test('an untrusted runtime readback path fails before recovery can observe another repository', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const authorized = authorizeCurrentWave(rings)
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings: authorized, certifications, waivers, client: new FixtureApiClient(resolve(FIXTURES, 'empty')), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-arbitrary-readback-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings: authorized, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.actions[0].readbackPath = '/repos/evil/arbitrary-target/rulesets/123'
  writeFileSync(journalPath, JSON.stringify(forged))

  const client = { calls: 0, request() { this.calls += 1; throw new Error('unmanaged endpoint must never be observed') } }
  assert.throws(
    () => recoverTransaction(journalPath, client, { issuerRegistry, clock: () => NOW }),
    /latest event does not bind|readback endpoint is outside managed scope|Journal readback endpoint differs from the managed action/,
  )
  assert.equal(client.calls, 0)
})

test('release-ring eligibility is computed from soak, upstream, certifications, and waiver expiry', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const repo = inventory.repositories[0]
  const expiredWaiver = {
    schemaVersion: 1,
    waivers: [{
      id: 'WV-2026-001',
      scope: { repository: 'consumer', controlType: 'provider-surface', controlId: 'ci/github-actions' },
      reason: 'Temporary fixture waiver used to prove expiry blocks eligibility.',
      risk: 'medium',
      owner: 'fixture-owner',
      approvedBy: ['fixture-approver'],
      issuedAt: '2026-07-18T00:00:00Z',
      expiresAt: '2026-07-19T00:00:00Z',
      status: 'active',
      compensatingControls: ['read-only fixture execution'],
      evidence: ['fixture-expiry-test'],
    }],
  }
  const result = computeEligibility({ repo, inventory, rings, certifications, waivers: expiredWaiver, now: new Date('2026-07-20T00:00:00Z'), issuerRegistry, runtimeProfile })

  assert.equal(result.eligible, false)
  assert.ok(result.blockers.includes('active waiver expired: WV-2026-001'))
})

test('standalone eligibility defers soak only for the production-grade profile and preserves maximum-assurance blocking', () => {
  const at = new Date('2026-07-20T00:30:00Z')
  const productionRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  productionRings.candidateRelease.observedAt = '2026-07-20T00:00:00Z'
  productionRings.assignments.consumer.enteredAt = productionRings.candidateRelease.observedAt
  productionRings.assignments.consumer.candidateReleaseDigest = sha256(stableStringify(productionRings.candidateRelease, 0))
  const repo = inventory.repositories[0]
  const production = computeEligibility({
    repo,
    inventory,
    rings: productionRings,
    certifications,
    waivers,
    now: at,
    issuerRegistry,
    runtimeProfile,
  })
  assert.equal(production.blockers.some(blocker => /soak.*incomplete|minimum soak incomplete/.test(blocker)), false)

  const maximumPolicy = structuredClone(loadExternalActivationPolicy())
  maximumPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const maximumRings = structuredClone(productionRings)
  maximumRings.rings[0].promotionPredicates
    .find(predicate => predicate.type === 'soak-observation').type = 'soak-complete'
  const maximum = computeEligibility({
    repo,
    inventory,
    rings: maximumRings,
    certifications,
    waivers,
    now: at,
    issuerRegistry,
    runtimeProfile,
    activationPolicy: maximumPolicy,
    expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumPolicy),
  })
  assert.equal(maximum.eligible, false)
  assert.ok(maximum.blockers.some(blocker => /minimum soak incomplete/.test(blocker)))
})
