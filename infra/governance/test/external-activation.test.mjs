import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  EXTERNAL_ACTIVATION_PROFILE_IDS,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST,
  GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST,
  MANAGED_CI_BINDING_CONTRACT,
  createExternalActivationEvidence,
  deriveGithubAppActivationExpectations,
  externalActivationPolicyDigest,
  externalActivationProfileDigest,
  externalActivationReadiness,
  githubMutationBoundaryContractDigest,
  managedCiDerivedReadbackBindings,
  resolveExternalActivationProfile,
  signExternalActivationRequirement,
  validateExternalActivationPolicy,
  validateExternalActivationRequirements,
  validateGithubMutationBoundaryContract,
} from '../lib/external-activation.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { readJson, sha256, stableStringify } from '../lib/common.mjs'
import {
  loadManagedCiTrustedExecutionPlan,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiFinalizationTransportReadbackDigest,
  managedCiProvenanceBinding,
  managedCiWorkflowDefinitionRef,
} from '../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'
import {
  GhApiClient,
  applyPlan,
  recoverTransaction,
  rollbackTransaction,
} from '../bin/reconcile-github.mjs'
import { resolveReleaseTrustPreflight } from '../lib/release-trust-preflight.mjs'
import { createManagedCiActivationFixture } from './fixtures/managed-ci-activation-fixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-07-21T00:00:00.000Z')

function issuerValidationTime(registry) {
  return new Date(Math.max(...registry.issuers.map(issuer => Date.parse(issuer.notBefore))) + 1)
}

function signingContext() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const mirrorKeys = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [{
      keyId: 'activation-attestor',
      subject: 'independent-activation-attestor',
      publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['apply-authorizer', 'completion-attestor'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    }],
  }
  const rings = {
    attestationPolicy: {
      schemaVersion: 1,
      algorithm: 'ed25519',
      maxAuthorizationTtlMinutes: 60,
      maxCompletionTtlMinutes: 10080,
      clockSkewSeconds: 120,
      issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
      allowedKeyIds: ['activation-attestor'],
      applyAuthorizationQuorum: 1,
      completionAttestationQuorum: 1,
    },
  }
  const inventory = readJson(resolve(ROOT, 'inventory/managed-repos.json'))
  const desired = readJson(resolve(ROOT, 'desired/github.json'))
  desired.integrations.governanceCheckApp.id = 101
  desired.integrations.governanceWriterApp.id = 202
  const mutationBoundaryContract = readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json'))
  const policy = readJson(resolve(ROOT, 'external-activation-policy.json'))
  return { privateKey, mirrorKeys, issuerRegistry, rings, inventory, desired, mutationBoundaryContract, policy }
}

function observedResource(requirement, context) {
  const digest = value => String(value).repeat(64).slice(0, 64)
  switch (requirement.kind) {
    case 'github-app':
      {
        const expected = deriveGithubAppActivationExpectations(context)
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
    case 'protected-environment':
      return {
        environment: 'release-finalize',
        reviewers: [{ type: 'User', id: 4242, subject: 'operator:independent-release-reviewer' }],
        preventSelfReview: true,
      }
    case 'github-repository':
      return {
        rulesetsDigest: digest('1'),
        requiredChecksDigest: digest('2'),
        immutableReleases: true,
        tagObjectVerificationDigest: digest('3'),
      }
    case 'github-token-permission':
      return { tokenFingerprint: 'read-only-fingerprint', permissions: ['metadata:read'], writePermissions: [] }
    case 'github-mutation-boundary':
      {
        const contract = readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json'))
        const desiredBinding = requirement.repository === contract.scope.source.repository
          ? contract.desiredBindings.source
          : contract.desiredBindings.target
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
    case 'managed-host-policy':
      return {
        provider: requirement.id.includes('claude') ? 'claude-code' : 'codex',
        winningSource: 'managed-policy/immutable/v1',
        policyDigest: digest('4'),
        bundleDigest: digest('5'),
        activationProofDigest: digest('6'),
      }
    case 'release-authorization':
      return {
        allowedKeyIds: ['release-authorizer-a'],
        quorum: 1,
        issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      }
    case 'npm-package-identity':
      return {
        packageName: requirement.packageName,
        registry: requirement.registry,
        visibility: 'public',
        bootstrapVersion: '0.0.1-bootstrap.0',
        consumerEligible: false,
      }
    case 'npm-trusted-publisher':
      return {
        packageName: requirement.packageName,
        registry: requirement.registry,
        repository: requirement.repository,
        workflow: requirement.trustedPublisher.workflow,
        environment: requirement.trustedPublisher.environment,
        allowedActions: requirement.trustedPublisher.allowedActions,
        exclusive: true,
      }
    case 'npm-publishing-access':
      return {
        packageName: requirement.packageName,
        registry: requirement.registry,
        twoFactorMode: requirement.publishingAccess.twoFactorMode,
        tokensAllowed: false,
        remainingPublishTokenIds: [],
      }
    case 'durable-evidence-mirror':
      {
        const publicKeySpki = context.mirrorKeys.publicKey.export({ type: 'spki', format: 'der' })
      return {
        provider: 'independent-worm-store',
        protocolVersion: 'fleet-reconcile-mirror-v1',
        endpoint: 'https://evidence.example.test/v1/fleet-reconcile',
        tenant: 'fixture-tenant',
        container: 'fixture-governance-worm',
        wormMode: 'compliance-object-lock',
        lifecyclePolicyDigest: digest('d'),
        minimumRetentionDays: 365,
        writerPrincipal: 'fixture-mirror-writer',
        verifierPrincipal: 'fixture-mirror-verifier',
        adapterCommandSha256: digest('e'),
        receiptSigningKeyId: 'fixture-mirror-receipt-v1',
        receiptSigningPublicKeySpki: publicKeySpki.toString('base64'),
        receiptSigningPublicKeySpkiSha256: sha256(publicKeySpki),
        signatureAlgorithm: 'ed25519',
        receiptId: 'receipt-2026-07-21-001',
        eventHeadDigest: digest('7'),
        retentionUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        receiptSha256: digest('8'),
      }
      }
    case 'rollback-drill':
      return {
        transactionId: 'rollback-drill-2026-07-21',
        eventHeadDigest: digest('9'),
        authorizationDigest: digest('a'),
        beforeImageRestored: true,
        postRollbackStateDigest: digest('b'),
        offHostReceiptDigest: digest('c'),
      }
    default:
      throw new Error(`No fixture read-back for ${requirement.kind}`)
  }
}

function activatedLedger(context) {
  const ledger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  for (const requirement of ledger.requirements) {
    if (requirement.kind === 'managed-ci-attestation') continue
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T23:00:00.000Z'
    requirement.expiresAt = '2026-07-27T23:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
      issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      observedResource: observedResource(requirement, context),
    })
    signExternalActivationRequirement(requirement, {
      signerKeyId: 'activation-attestor',
      subject: 'independent-activation-attestor',
      privateKey: context.privateKey,
    })
  }
  return ledger
}

function ledgerWithActivatedExternalRequirement(context, requirementId, {
  mutateClaims = () => {},
  observedAt = '2026-07-20T23:00:00.000Z',
  expiresAt = '2026-07-27T23:00:00.000Z',
} = {}) {
  const ledger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  const requirement = ledger.requirements.find(item => item.id === requirementId)
  assert(requirement, `missing external-activation fixture:${requirementId}`)
  requirement.status = 'activated'
  requirement.observedAt = observedAt
  requirement.expiresAt = expiresAt
  const claims = observedResource(requirement, context)
  mutateClaims(claims)
  requirement.evidence = createExternalActivationEvidence(requirement, {
    policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
    observedResource: claims,
  })
  signExternalActivationRequirement(requirement, {
    signerKeyId: 'activation-attestor',
    subject: 'independent-activation-attestor',
    privateKey: context.privateKey,
  })
  return ledger
}

test('durable mirror activation readback schema accepts the closed runtime contract', () => {
  const context = signingContext()
  const requirementId = 'activate-off-host-append-only-reconcile-evidence-mirror'
  const schema = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)

  const valid = ledgerWithActivatedExternalRequirement(context, requirementId)
  const requirement = valid.requirements.find(item => item.id === requirementId)
  assert.equal(
    Object.keys(requirement.evidence.payload.observedResource).length,
    21,
    'fixture must exercise the complete runtime durable-mirror claim contract',
  )
  assert.equal(validate(valid), true, ajv.errorsText(validate.errors))
  assert.equal(validateExternalActivationRequirements(valid, { ...context, now: NOW }), true)
})

test('durable mirror activation readback schema rejects empty and open resources', () => {
  const context = signingContext()
  const requirementId = 'activate-off-host-append-only-reconcile-evidence-mirror'
  const schema = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const valid = ledgerWithActivatedExternalRequirement(context, requirementId)
  const empty = structuredClone(valid)
  empty.requirements.find(item => item.id === requirementId).evidence.payload.observedResource = {}
  assert.equal(validate(empty), false, 'schema must reject an empty durable-mirror readback')

  const open = structuredClone(valid)
  open.requirements.find(item => item.id === requirementId).evidence.payload.observedResource.unreviewed = true
  assert.equal(validate(open), false, 'schema must reject an unreviewed durable-mirror readback field')
})

test('GitHub mutation-boundary contract is closed, schema-valid, and digest-pinned', () => {
  const contract = readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json'))
  const desired = readJson(resolve(ROOT, 'desired/github.json'))
  const inventory = readJson(resolve(ROOT, 'inventory/managed-repos.json'))
  const contractSchema = readJson(resolve(ROOT, 'schemas/github-mutation-boundary-contract.schema.json'))
  const policySchema = readJson(resolve(ROOT, 'schemas/external-activation-policy.schema.json'))
  const ledgerSchema = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  for (const [schema, value, label] of [
    [contractSchema, contract, 'GitHub mutation-boundary contract'],
    [policySchema, readJson(resolve(ROOT, 'external-activation-policy.json')), 'external activation policy'],
    [ledgerSchema, readJson(resolve(ROOT, 'external-activation-requirements.json')), 'external activation ledger'],
  ]) {
    const validate = ajv.compile(schema)
    assert.equal(validate(value), true, `${label}:${ajv.errorsText(validate.errors)}`)
  }
  assert.equal(validateGithubMutationBoundaryContract(contract, { desired, inventory }), true)
  assert.equal(githubMutationBoundaryContractDigest(contract), GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST)
  assert.deepEqual(contract.publicRulesetProjection.fields, [
    'id', 'name', 'target', 'source_type', 'source', 'enforcement', 'created_at', 'updated_at', 'node_id', 'conditions', 'rules',
  ])
  assert.deepEqual(contract.publicRulesetProjection.freshnessFields, ['created_at', 'updated_at'])
  assert.equal(contract.publicRulesetProjection.runtimePermission, 'metadata:read')
  assert.equal(contract.publicRulesetProjection.mayReadBypassActors, false)
  assert.equal(contract.publicRulesetProjection.mayClaimBypassAbsence, false)
  assert.deepEqual(contract.fullRulesetProjection.requiredBypassActors, [])
  assert.equal(contract.fullRulesetProjection.emptyBypassActorsDigest, GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST)
  assert.deepEqual(contract.normalizedRulesetProjection.requiredCheckFields, ['context', 'integration'])
  assert.equal(contract.normalizedRulesetProjection.integrationIdentity, 'slug')
  assert.equal(contract.normalizedRulesetProjection.managedNameSet, 'exact')
  assert.equal(contract.normalizedRulesetProjection.parentRulesets, 'forbidden')
  assert.equal(contract.normalizedRulesetProjection.unmanagedRulesets, 'included-in-snapshot-excluded-from-desired-conformance')
  assert.equal(contract.environmentPolicyProjection.absentValueDigest, GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST)
})

test('signed mutation-boundary claims reject open shapes, malformed hashes, substituted contracts, and bypasses', () => {
  const context = signingContext()
  const sourceId = 'activate-design-system-mirror-mutation-boundary'
  const cases = [
    {
      label: 'missing closed claim',
      mutateClaims: claims => { delete claims.publicRulesetProjectionDigest },
      error: /observed resource has an invalid or open shape/,
    },
    {
      label: 'malformed digest',
      mutateClaims: claims => { claims.fullRulesetsDigest = 'not-a-sha256' },
      error: /claim fullRulesetsDigest must be a SHA-256/,
    },
    {
      label: 'substituted projection contract',
      mutateClaims: claims => { claims.projectionContractDigest = 'c'.repeat(64) },
      error: /projection contract digest mismatch/,
    },
    {
      label: 'non-empty bypass projection',
      mutateClaims: claims => { claims.bypassActorsDigest = 'd'.repeat(64) },
      error: /does not prove the canonical empty bypass-actor set/,
    },
  ]
  for (const item of cases) {
    const ledger = ledgerWithActivatedExternalRequirement(context, sourceId, item)
    assert.throws(
      () => validateExternalActivationRequirements(ledger, { ...context, now: NOW }),
      item.error,
      item.label,
    )
  }
})

test('signed mutation-boundary claims must equal desired source and target bindings, not merely valid hashes', () => {
  const context = signingContext()
  const sourceId = 'activate-design-system-mirror-mutation-boundary'
  const targetId = 'activate-product-template-mirror-mutation-boundary'
  for (const field of [
    'normalizedRulesetsDigest',
    'requiredChecksDigest',
    'actionsWorkflowPermissionsDigest',
    'repositoryIdentityDefaultBranchDigest',
    'environmentPolicyDigest',
  ]) {
    const ledger = ledgerWithActivatedExternalRequirement(context, targetId, {
      mutateClaims: claims => { claims[field] = 'e'.repeat(64) },
    })
    assert.throws(
      () => validateExternalActivationRequirements(ledger, { ...context, now: NOW }),
      new RegExp(`${field} differs from the reviewed desired binding`),
      field,
    )
  }
  const sourceWithNullEnvironment = ledgerWithActivatedExternalRequirement(context, sourceId, {
    mutateClaims: claims => { claims.environmentPolicyDigest = GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST },
  })
  assert.throws(
    () => validateExternalActivationRequirements(sourceWithNullEnvironment, { ...context, now: NOW }),
    /environmentPolicyDigest differs from the reviewed desired binding/,
  )
})

test('a correctly signed but expired mutation-boundary proof remains fail closed', () => {
  const context = signingContext()
  const ledger = ledgerWithActivatedExternalRequirement(context, 'activate-design-system-mirror-mutation-boundary', {
    observedAt: '2026-07-20T22:00:00.000Z',
    expiresAt: '2026-07-20T23:00:00.000Z',
  })
  assert.throws(
    () => validateExternalActivationRequirements(ledger, { ...context, now: NOW }),
    /evidence is expired/,
  )
})

test('hidden GitHub observations reject old-but-unexpired and near-expiry signed evidence', () => {
  const context = signingContext()
  for (const requirementId of [
    'resolve-governance-app-identities',
    'activate-design-system-mirror-mutation-boundary',
  ]) {
    const old = ledgerWithActivatedExternalRequirement(context, requirementId, {
      observedAt: '2026-07-20T22:59:59.000Z',
      expiresAt: '2026-07-27T00:00:00.000Z',
    })
    assert.throws(
      () => validateExternalActivationRequirements(old, { ...context, now: NOW }),
      /hidden GitHub observation is too old/,
      `${requirementId}:old-but-unexpired`,
    )
    const nearExpiry = ledgerWithActivatedExternalRequirement(context, requirementId, {
      observedAt: '2026-07-20T23:30:00.000Z',
      expiresAt: '2026-07-21T00:04:59.000Z',
    })
    assert.throws(
      () => validateExternalActivationRequirements(nearExpiry, { ...context, now: NOW }),
      /lacks the minimum remaining validity horizon/,
      `${requirementId}:near-expiry`,
    )
  }
})

test('GitHub App activation pins immutable ids, exact installation topology, secret namespace, and credential routes', () => {
  const context = signingContext()
  const requirementId = 'resolve-governance-app-identities'
  const expected = deriveGithubAppActivationExpectations(context)
  assert.deepEqual(expected.installationRepositoriesByIntegration.governanceWriterApp, [
    'ajenchen/design-system',
    'ajenchen/ds-product-template',
    'ajenchen/work-management',
  ])
  for (const route of [
    {
      credentialRepository: 'ajenchen/design-system',
      environment: 'governance-mirror',
      integration: 'governanceWriterApp',
      targetRepository: 'ajenchen/ds-product-template',
    },
    {
      credentialRepository: 'ajenchen/design-system',
      environment: 'governance-external-ledger',
      integration: 'governanceWriterApp',
      targetRepository: 'ajenchen/design-system',
    },
    {
      credentialRepository: 'ajenchen/ds-product-template',
      environment: 'governance-upgrade',
      integration: 'governanceWriterApp',
      targetRepository: 'ajenchen/ds-product-template',
    },
    {
      credentialRepository: 'ajenchen/work-management',
      environment: 'governance-upgrade',
      integration: 'governanceWriterApp',
      targetRepository: 'ajenchen/work-management',
    },
  ]) assert(expected.installationProbeRoutes.some(item => stableStringify(item, 0) === stableStringify(route, 0)))
  const valid = ledgerWithActivatedExternalRequirement(context, requirementId)
  assert.equal(validateExternalActivationRequirements(valid, { ...context, now: NOW }), true)

  for (const [label, desiredMutation, error] of [
    ['unresolved id', desired => { desired.integrations.governanceWriterApp.id = null }, /desired integration id is unresolved:governanceWriterApp/],
    ['substituted id', desired => { desired.integrations.governanceWriterApp.id = 999 }, /App ids differ from immutable desired integration identities/],
  ]) {
    const desired = structuredClone(context.desired)
    desiredMutation(desired)
    assert.throws(
      () => validateExternalActivationRequirements(valid, { ...context, desired, now: NOW }),
      error,
      label,
    )
  }

  const missingAuthorityInstallation = ledgerWithActivatedExternalRequirement(context, requirementId, {
    mutateClaims: claims => {
      claims.installationRepositoriesByIntegration.governanceWriterApp = [
        'ajenchen/ds-product-template',
        'ajenchen/work-management',
      ]
      claims.installationRepositoriesDigest = sha256(stableStringify(claims.installationRepositoriesByIntegration, 0))
    },
  })
  assert.throws(
    () => validateExternalActivationRequirements(missingAuthorityInstallation, { ...context, now: NOW }),
    /installation repository coverage differs from desired managed profiles/,
  )

  const extraInstallation = ledgerWithActivatedExternalRequirement(context, requirementId, {
    mutateClaims: claims => {
      claims.installationRepositoriesByIntegration.governanceWriterApp.push('ajenchen/unmanaged')
      claims.installationRepositoriesDigest = sha256(stableStringify(claims.installationRepositoriesByIntegration, 0))
    },
  })
  assert.throws(
    () => validateExternalActivationRequirements(extraInstallation, { ...context, now: NOW }),
    /installation repository coverage differs from desired managed profiles/,
  )

  const overprivilegedApp = ledgerWithActivatedExternalRequirement(context, requirementId, {
    mutateClaims: claims => {
      claims.appConfigurations.governanceWriterApp.permissions.issues = 'write'
      claims.appConfigurationsDigest = sha256(stableStringify(claims.appConfigurations, 0))
    },
  })
  assert.throws(
    () => validateExternalActivationRequirements(overprivilegedApp, { ...context, now: NOW }),
    /App repository selection\/permission configuration differs from immutable desired state/,
  )

  for (const [credentialRepository, environment, wrongTarget] of [
    ['ajenchen/design-system', 'governance-mirror', 'ajenchen/design-system'],
    ['ajenchen/design-system', 'governance-external-ledger', 'ajenchen/ds-product-template'],
    ['ajenchen/ds-product-template', 'governance-upgrade', 'ajenchen/work-management'],
    ['ajenchen/work-management', 'governance-upgrade', 'ajenchen/ds-product-template'],
  ]) {
    const substitutedRoute = ledgerWithActivatedExternalRequirement(context, requirementId, {
      mutateClaims: claims => {
        const probe = claims.installationTokenProbes.find(item => item.integration === 'governanceWriterApp'
          && item.credentialRepository === credentialRepository
          && item.environment === environment)
        assert(probe)
        probe.targetRepository = wrongTarget
        claims.installationTokenProbesDigest = sha256(stableStringify(claims.installationTokenProbes, 0))
      },
    })
    assert.throws(
      () => validateExternalActivationRequirements(substitutedRoute, { ...context, now: NOW }),
      /not bound to the exact credential-to-installation topology/,
      `${credentialRepository}/${environment}`,
    )
  }

  const duplicateRoute = ledgerWithActivatedExternalRequirement(context, requirementId, {
    mutateClaims: claims => {
      const mirror = claims.installationTokenProbes.find(item => item.integration === 'governanceWriterApp'
        && item.environment === 'governance-mirror')
      const externalLedgerIndex = claims.installationTokenProbes.findIndex(item => item.integration === 'governanceWriterApp'
        && item.environment === 'governance-external-ledger')
      assert(mirror && externalLedgerIndex >= 0)
      claims.installationTokenProbes[externalLedgerIndex] = {
        ...structuredClone(mirror),
        installationId: claims.installationTokenProbes[externalLedgerIndex].installationId,
      }
      claims.installationTokenProbesDigest = sha256(stableStringify(claims.installationTokenProbes, 0))
    },
  })
  assert.throws(
    () => validateExternalActivationRequirements(duplicateRoute, { ...context, now: NOW }),
    /installation token probe routes are duplicated/,
  )

  const fallbackSecret = ledgerWithActivatedExternalRequirement(context, requirementId, {
    mutateClaims: claims => {
      claims.nonEnvironmentGovernanceSecrets = [{ scope: 'repository', repository: 'ajenchen/design-system' }]
      claims.nonEnvironmentGovernanceSecretsDigest = sha256(stableStringify(claims.nonEnvironmentGovernanceSecrets, 0))
    },
  })
  assert.throws(
    () => validateExternalActivationRequirements(fallbackSecret, { ...context, now: NOW }),
    /repository\/org governance-secret fallback is not canonically empty/,
  )
})

test('committed external activation ledger is truthful, typed, and covers every npm release package', () => {
  const ledger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  const inventory = readJson(resolve(ROOT, 'inventory/managed-repos.json'))
  const desired = readJson(resolve(ROOT, 'desired/github.json'))
  const mutationBoundaryContract = readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json'))
  const policy = readJson(resolve(ROOT, 'external-activation-policy.json'))
  const rings = readJson(resolve(ROOT, 'release-rings.json'))
  const issuerRegistry = readJson(resolve(ROOT, 'trust/issuers.json'))
  const canonicalNow = issuerValidationTime(issuerRegistry)
  assert.equal(validateExternalActivationRequirements(ledger, {
    inventory,
    desired,
    policy,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    now: canonicalNow,
  }), true)
  assert.equal(ledger.requirements.every(item => item.status === 'not-activated'), true)
  assert.equal(ledger.requirements.every(item => item.evidence === null && item.observedAt === null && item.expiresAt === null), true)
  for (const packageName of ['@qijenchen/governance', '@qijenchen/storybook-config', '@qijenchen/design-system']) {
    for (const kind of ['npm-package-identity', 'npm-trusted-publisher', 'npm-publishing-access']) {
      assert.equal(ledger.requirements.filter(item => item.kind === kind && item.packageName === packageName).length, 1)
    }
  }
  const release = externalActivationReadiness(ledger, { inventory, desired, policy, mutationBoundaryContract, rings, issuerRegistry, now: canonicalNow, scope: 'release' })
  assert.equal(release.ready, false)
  assert.equal(release.profileId, 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM')
  assert.equal(release.profileDigest, externalActivationProfileDigest(policy.profiles[0]))
  assert.equal(release.profile.sha256, release.profileDigest)
  assert.equal(release.policyDigest, EXTERNAL_ACTIVATION_POLICY_DIGEST)
  assert.deepEqual(release.optionalRequirementIds, [
    'activate-off-host-append-only-reconcile-evidence-mirror',
    'activate-managed-ci-trusted-execution',
  ])
  assert.equal(release.blockers.some(item => item.id === 'activate-managed-ci-trusted-execution'), false)
  assert(release.blockers.some(item => item.id === 'activate-design-system-mirror-mutation-boundary'))
  assert(release.blockers.some(item => item.id === 'activate-product-template-mirror-mutation-boundary'))
  const objective = externalActivationReadiness(ledger, { inventory, desired, policy, mutationBoundaryContract, rings, issuerRegistry, now: canonicalNow, scope: 'objective-completion' })
  assert.equal(objective.ready, false)
  assert.deepEqual(objective.optionalRequirementIds, [
    'activate-claude-managed-host-assurance',
    'activate-codex-managed-host-assurance',
    'activate-off-host-append-only-reconcile-evidence-mirror',
    'activate-managed-ci-trusted-execution',
    'complete-real-fleet-rollback-drill',
  ])
  assert.equal(objective.blockers.some(item => item.id === 'activate-managed-ci-trusted-execution'), false)
  assert(objective.blockers.some(item => item.id === 'activate-design-system-mirror-mutation-boundary'))
  assert(objective.blockers.some(item => item.id === 'activate-product-template-mirror-mutation-boundary'))
  const managedHost = externalActivationReadiness(ledger, { inventory, desired, policy, mutationBoundaryContract, rings, issuerRegistry, now: canonicalNow, scope: 'managed-host' })
  assert.equal(managedHost.ready, true)
  assert.equal(managedHost.requiredCount, 0)
  assert.deepEqual(managedHost.optionalRequirementIds, [
    'activate-claude-managed-host-assurance',
    'activate-codex-managed-host-assurance',
  ])
  const mutationBoundaries = ledger.requirements.filter(item => item.kind === 'github-mutation-boundary')
  assert.deepEqual(mutationBoundaries.map(item => [item.id, item.repository, item.requiredFor]), [
    ['activate-design-system-mirror-mutation-boundary', 'ajenchen/design-system', ['release', 'objective-completion']],
    ['activate-product-template-mirror-mutation-boundary', 'ajenchen/ds-product-template', ['release', 'objective-completion']],
  ])
  assert(mutationBoundaries.every(item => item.status === 'not-activated' && item.evidence === null))
  const managedCi = ledger.requirements.find(item => item.id === 'activate-managed-ci-trusted-execution')
  assert.deepEqual(managedCi.requiredFor, ['release', 'fleet-rollout', 'objective-completion'])
  const managedPolicy = policy.requirements.find(item => item.id === managedCi.id)
  for (const key of [
    'activationTrustBundleDigest', 'workflowDefinitionRef', 'workflowDefinitionCommit', 'workflowDefinitionTree',
    'auditedSubjectCommit', 'auditedSubjectTree', 'workflowDispatchInputsDigest',
    'workflowRunId', 'runAttempt', 'oidcSubjectConfiguration', 'executionClassOidcClaimProjections',
    'executionClassImageSupplyChainBindings', 'executionClassHostSandboxReadbacks', 'executionClassReceiptSigningPayloads',
    'executionClassControlPlaneBundleDigests', 'executionClassReceiptProvenanceDigests', 'executionClassOidcProvenanceDigests',
    'executionClassImageSupplyChainDigests', 'executionClassHostSandboxReadbackDigests',
    'executionClassFrozenSubjectReadbackDigests', 'executionClassReceiptSigningPayloadDigests',
    'receiptSignerAuthorityBindingDigest', 'receiptSignerIssuerMappingDigest', 'modelReleaseAuthorityBindingDigest',
    'finalizationRequestDigest', 'finalizationRawReceiptSetDigest', 'finalizationReceiptSetDigest',
    'finalizationTransportReadback', 'finalizationTransportReadbackDigest',
  ]) assert(managedPolicy.evidenceContract.requiredClaimKeys.includes(key), key)
  assert.deepEqual(managedPolicy.managedCiBindingContract, MANAGED_CI_BINDING_CONTRACT)
  assert.equal(managedPolicy.evidenceContract.requiredClaimKeys.includes('sourceCommit'), false)
  assert.equal(managedPolicy.evidenceContract.requiredClaimKeys.includes('sourceTree'), false)
})

test('assurance profiles are closed, maximum preserves legacy semantics, and profile substitution fails closed', () => {
  const context = signingContext()
  const { policy } = context
  assert.equal(policy.activeProfile, 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM')
  assert.deepEqual(policy.profiles.map(profile => profile.id), EXTERNAL_ACTIVATION_PROFILE_IDS)
  assert.equal(externalActivationPolicyDigest(policy), EXTERNAL_ACTIVATION_POLICY_DIGEST)
  const activeProfile = resolveExternalActivationProfile(policy)
  assert.equal(activeProfile.id, policy.activeProfile)
  assert.equal(activeProfile.sha256, externalActivationProfileDigest(policy.profiles[0]))
  assert.deepEqual(activeProfile.releaseAuthorization, {
    minimumSignerQuorum: 1,
    maximumSignerQuorum: 1,
  })
  assert.equal(
    externalActivationProfileDigest(policy.profiles[0]),
    externalActivationProfileDigest(structuredClone(policy.profiles[0])),
  )
  const maximum = policy.profiles.find(profile => profile.id === 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM')
  for (const scope of ['release', 'fleet-rollout', 'managed-host', 'objective-completion']) {
    assert.deepEqual(
      maximum.requiredRequirementIdsByScope[scope],
      policy.requirements.filter(requirement => requirement.requiredFor.includes(scope)).map(requirement => requirement.id),
      `maximum profile must preserve legacy ${scope} semantics`,
    )
  }

  const unknown = structuredClone(policy)
  unknown.activeProfile = 'UNREVIEWED_PROFILE'
  assert.throws(
    () => validateExternalActivationPolicy(unknown, {
      ...context,
      expectedPolicyDigest: externalActivationPolicyDigest(unknown),
    }),
    /active profile is unknown/,
  )

  const downgraded = structuredClone(policy)
  downgraded.profiles[1].requiredRequirementIdsByScope.release
    = downgraded.profiles[1].requiredRequirementIdsByScope.release
      .filter(id => id !== 'activate-off-host-append-only-reconcile-evidence-mirror')
  assert.throws(
    () => validateExternalActivationPolicy(downgraded, {
      ...context,
      expectedPolicyDigest: externalActivationPolicyDigest(downgraded),
    }),
    /maximum-assurance profile no longer matches legacy release semantics/,
  )

  const weakenedQuorum = structuredClone(policy)
  weakenedQuorum.profiles[1].releaseAuthorization.minimumSignerQuorum = 1
  assert.throws(
    () => validateExternalActivationPolicy(weakenedQuorum, {
      ...context,
      expectedPolicyDigest: externalActivationPolicyDigest(weakenedQuorum),
    }),
    /release authorization was downgraded or substituted/,
  )

  const reordered = structuredClone(policy)
  reordered.profiles.reverse()
  assert.throws(
    () => validateExternalActivationPolicy(reordered, {
      ...context,
      expectedPolicyDigest: externalActivationPolicyDigest(reordered),
    }),
    /profile identity\/order was substituted/,
  )

  const substitutedPolicy = structuredClone(policy)
  substitutedPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const substitutedLedger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  substitutedLedger.policy.sha256 = externalActivationPolicyDigest(substitutedPolicy)
  assert.throws(
    () => validateExternalActivationRequirements(substitutedLedger, {
      ...context,
      policy: substitutedPolicy,
      now: NOW,
    }),
    /digest differs from the immutable reviewed catalog/,
  )
})

test('production profile accepts one governed release signer while maximum retains multi-custodian quorum', () => {
  const context = signingContext()
  const activateOneSigner = (ledger, policyDigest) => {
    const requirement = ledger.requirements.find(item => item.id === 'activate-independent-finalizer-signed-authority')
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T23:00:00.000Z'
    requirement.expiresAt = '2026-07-27T23:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest,
      issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      observedResource: {
        allowedKeyIds: ['release-authorizer-a'],
        quorum: 1,
        issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      },
    })
    signExternalActivationRequirement(requirement, {
      signerKeyId: 'activation-attestor',
      subject: 'independent-activation-attestor',
      privateKey: context.privateKey,
    })
    return requirement
  }

  const productionLedger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  activateOneSigner(productionLedger, EXTERNAL_ACTIVATION_POLICY_DIGEST)
  assert.equal(validateExternalActivationRequirements(productionLedger, { ...context, now: NOW }), true)
  const productionReadiness = externalActivationReadiness(productionLedger, {
    ...context,
    now: NOW,
    scope: 'release',
  })
  assert.equal(
    productionReadiness.blockers.some(item => item.id === 'activate-independent-finalizer-signed-authority'),
    false,
  )
  const productionCondition = context.policy.requirements
    .find(item => item.id === 'activate-independent-finalizer-signed-authority').condition
  assert(productionCondition.includes('one governed release-tag-authorizer is sufficient'))
  assert(productionCondition.includes('at least two independently administered authorizers'))

  const maximumPolicy = structuredClone(context.policy)
  maximumPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const maximumPolicyDigest = externalActivationPolicyDigest(maximumPolicy)
  assert.deepEqual(
    resolveExternalActivationProfile(maximumPolicy, {
      expectedPolicyDigest: maximumPolicyDigest,
    }).releaseAuthorization,
    {
      minimumSignerQuorum: 2,
      maximumSignerQuorum: 5,
    },
  )
  const maximumLedger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  maximumLedger.policy.sha256 = maximumPolicyDigest
  activateOneSigner(maximumLedger, maximumPolicyDigest)
  assert.throws(
    () => validateExternalActivationRequirements(maximumLedger, {
      ...context,
      policy: maximumPolicy,
      expectedPolicyDigest: maximumPolicyDigest,
      now: NOW,
    }),
    /release authorizer set is invalid for MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM/,
  )

  const crossProfile = structuredClone(productionLedger)
  crossProfile.policy.sha256 = maximumPolicyDigest
  assert.throws(
    () => validateExternalActivationRequirements(crossProfile, {
      ...context,
      policy: maximumPolicy,
      expectedPolicyDigest: maximumPolicyDigest,
      now: NOW,
    }),
    /evidence policy digest mismatch/,
  )
})

test('active managed CI image supply-chain v2 evidence round-trips through Ajv and rejects v1 or incomplete v2 poison', () => {
  const base = signingContext()
  const fixture = createManagedCiActivationFixture({
    repoRoot: resolve(ROOT, '../..'),
    issuerRegistry: base.issuerRegistry,
    runtimeProfile: readJson(resolve(ROOT, 'providers/runtime-conformance.json')),
    observedAt: '2026-07-20T23:00:00.000Z',
  })
  try {
    const context = {
      ...base,
      issuerRegistry: fixture.issuerRegistry,
      rings: structuredClone(base.rings),
    }
    context.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(context.issuerRegistry)
    const ledger = activatedLedger(context)
    const requirement = ledger.requirements.find(item => item.kind === 'managed-ci-attestation')
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T23:00:00.000Z'
    requirement.expiresAt = '2026-07-27T23:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
      issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      observedResource: fixture.observedResource(),
    })
    signExternalActivationRequirement(requirement, {
      signerKeyId: 'activation-attestor',
      subject: 'independent-activation-attestor',
      privateKey: context.privateKey,
    })

    const schema = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    assert.equal(validate(ledger), true, ajv.errorsText(validate.errors))
    const roundTripped = JSON.parse(JSON.stringify(ledger))
    assert.deepEqual(roundTripped, ledger)
    assert.equal(validate(roundTripped), true, ajv.errorsText(validate.errors))
    const validationOptions = {
      ...context,
      now: NOW,
      managedCiValidationContext: fixture.managedCiValidationContext,
    }
    assert.equal(validateExternalActivationRequirements(ledger, validationOptions), true)
    const managedObservedResource = requirement.evidence.payload.observedResource
    assert.equal(
      managedObservedResource.receiptSignerAuthorityBinding.rawReceiptValidation.validatorSourcePath,
      'scripts/lib/managed-ci-sandbox-receipt.mjs',
    )
    assert.equal(
      managedObservedResource.receiptSignerAuthorityBinding.rawReceiptValidation.validatorSourceSha256,
      sha256(readFileSync(resolve(ROOT, '../../scripts/lib/managed-ci-sandbox-receipt.mjs'))),
    )
    const validatorSourcePoison = structuredClone(ledger)
    const poisonedManagedRequirement = validatorSourcePoison.requirements.find(item => item.kind === 'managed-ci-attestation')
    poisonedManagedRequirement.evidence.payload.observedResource.receiptSignerAuthorityBinding
      .rawReceiptValidation.validatorSourceSha256 = sha256('substituted-validator-source')
    assert.equal(validate(validatorSourcePoison), false, 'external activation schema must reject validator source substitution')

    const imagePath = [
      'requirements',
      ledger.requirements.findIndex(item => item.kind === 'managed-ci-attestation'),
      'evidence',
      'payload',
      'observedResource',
      'executionClassImageSupplyChainBindings',
      'dependency-acquisition',
    ]
    const imageAt = value => imagePath.reduce((cursor, segment) => cursor[segment], value)
    const legacy = structuredClone(ledger)
    imageAt(legacy).schemaVersion = 1
    imageAt(legacy).kind = 'managed-ci-image-supply-chain-binding-v1'
    assert.equal(validate(legacy), false, 'v1 image supply-chain evidence must not satisfy the v2 ledger schema')

    const requiredV2Paths = [
      ['builder', 'runId'],
      ['builder', 'runAttempt'],
      ['build', 'contextArchiveDigest'],
      ['runtime', 'nodeVersion'],
      ['runtime', 'runtimeSourceSha256'],
      ['runtime', 'runtimeInventoryDigest'],
      ['aggregateHandoff', 'executionClassCount'],
      ['aggregateHandoff', 'artifactId'],
      ['aggregateHandoff', 'artifactDigest'],
      ['aggregateHandoff', 'manifestSha256'],
      ['aggregateHandoff', 'inventorySha256'],
      ['aggregateHandoff', 'inventoryEntryCount'],
      ['aggregateHandoff', 'artifactFileCount'],
      ['aggregateHandoff', 'artifactRetentionDays'],
      ['aggregateHandoff', 'storageClass'],
      ['attestations', 'provenance', 'recordReadbackDigest'],
      ['attestations', 'sbom', 'recordReadbackDigest'],
      ['attestations', 'handoff', 'recordReadbackDigest'],
      ['evidenceSet', 'imageSetArtifact'],
      ['evidenceSet', 'offlineArchive', 'format'],
      ['evidenceSet', 'offlineArchive', 'inventoryDigest'],
      ['evidenceSet', 'offlineArchive', 'objectVersionId'],
      ['evidenceSet', 'offlineArchive', 'retentionMode'],
      ['evidenceSet', 'offlineArchive', 'retentionUntil'],
      ['evidenceSet', 'offlineArchive', 'writerPrincipal'],
      ['evidenceSet', 'offlineArchive', 'verifierPrincipal'],
      ['verification', 'independentVerifierRequired'],
      ['verification', 'activationVerificationStatus'],
      ['verification', 'activationVerificationReceiptDigest'],
      ['verification', 'activationVerificationIssuerKeyIds'],
      ['verification', 'activationVerificationIssuerSubjects'],
      ['verification', 'activationVerificationQuorum'],
      ['verification', 'activationVerificationReceiptExpiresAt'],
      ['verification', 'activationVerificationReplayRetentionUntil'],
      ['verification', 'activationVerificationIssuerRegistryDigest'],
      ['verification', 'activationVerificationTrustBindingDigest'],
      ['verification', 'receiptSignerTrustReadbackDigest'],
    ]
    for (const path of requiredV2Paths) {
      const poison = structuredClone(ledger)
      const image = imageAt(poison)
      const owner = path.slice(0, -1).reduce((cursor, segment) => cursor[segment], image)
      delete owner[path.at(-1)]
      assert.equal(validate(poison), false, `missing v2 field must fail closed:${path.join('.')}`)
    }

    const validateProductionPoison = (label, mutate, expected) => {
      const poison = structuredClone(ledger)
      const poisonedRequirement = poison.requirements.find(item => item.kind === 'managed-ci-attestation')
      const claims = fixture.observedResource()
      mutate(claims)
      poisonedRequirement.evidence = createExternalActivationEvidence(poisonedRequirement, {
        policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
        issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
        observedResource: claims,
      })
      signExternalActivationRequirement(poisonedRequirement, {
        signerKeyId: 'activation-attestor',
        subject: 'independent-activation-attestor',
        privateKey: context.privateKey,
      })
      assert.throws(
        () => validateExternalActivationRequirements(poison, validationOptions),
        expected,
        label,
      )
    }
    validateProductionPoison('request digest substitution', claims => {
      claims.finalizationRequestDigest = sha256('substituted-finalization-request')
    }, /finalization request\/receipt-set\/two-hop transport closure is invalid/)
    validateProductionPoison('raw receipt set digest substitution', claims => {
      claims.finalizationRawReceiptSetDigest = sha256('substituted-finalization-raw-receipt-set')
    }, /finalized receipt set is detached/)
    validateProductionPoison('finalized receipt set digest substitution', claims => {
      claims.finalizationReceiptSetDigest = sha256('substituted-finalized-receipt-set')
    }, /finalized receipt set is detached/)
    validateProductionPoison('client-to-gateway TLS downgrade', claims => {
      claims.finalizationTransportReadback.clientToGateway.tlsVersion = 'TLSv1.2'
      claims.finalizationTransportReadback.readbackDigest = managedCiFinalizationTransportReadbackDigest(
        claims.finalizationTransportReadback,
      )
      claims.finalizationTransportReadbackDigest = claims.finalizationTransportReadback.readbackDigest
    }, /finalization client-to-gateway transport readback is invalid/)
    validateProductionPoison('gateway-to-signer authority substitution', claims => {
      claims.finalizationTransportReadback.gatewayToSigner.signerAuthorityBindingDigest = sha256(
        'substituted-signer-authority',
      )
      claims.finalizationTransportReadback.readbackDigest = managedCiFinalizationTransportReadbackDigest(
        claims.finalizationTransportReadback,
      )
      claims.finalizationTransportReadbackDigest = claims.finalizationTransportReadback.readbackDigest
    }, /gateway-to-signer mTLS transport readback is invalid/)
    validateProductionPoison('transport readback digest substitution', claims => {
      claims.finalizationTransportReadbackDigest = sha256('substituted-transport-readback')
    }, /finalization transport readback digest is detached/)
  } finally {
    fixture.dispose()
  }
})

test('external model authority schema is an exact namespaced projection of the canonical schema', () => {
  const canonical = readJson(resolve(ROOT, 'schemas/managed-ci-model-release-authority-binding.schema.json'))
  const external = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
  const names = {
    sha256: 'sha256',
    modelId: 'managedModelAuthorityModelId',
    providerId: 'managedModelAuthorityProviderId',
    identifier: 'managedModelAuthorityIdentifier',
    nonce: 'managedModelAuthorityNonce',
    time: 'managedModelAuthorityTime',
    window: 'managedModelAuthorityWindow',
    exchangeObservation: 'managedModelAuthorityExchangeObservation',
    signature: 'managedModelAuthoritySignature',
    issuerKeyId: 'managedModelAuthorityIssuerKeyId',
    issuerSubject: 'managedModelAuthorityIssuerSubject',
    validator: 'managedModelAuthorityValidator',
    authorityReceipt: 'managedModelAuthorityReceipt',
    sourceReadback: 'managedModelAuthoritySourceReadback',
    revocationReadback: 'managedModelAuthorityRevocationReadback',
    auditReadback: 'managedModelAuthorityAuditReadback',
  }
  const namespace = value => {
    if (Array.isArray(value)) return value.map(namespace)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key !== '$ref' || typeof item !== 'string') return [key, namespace(item)]
      return [key, item.replace(/^#\/\$defs\/([^/]+)$/, (_, name) => {
        assert(names[name], `unmapped canonical model-authority schema definition:${name}`)
        return `#/$defs/${names[name]}`
      })]
    }))
  }
  for (const [canonicalName, externalName] of Object.entries(names)) {
    assert.deepEqual(external.$defs[externalName], namespace(canonical.$defs[canonicalName]), canonicalName)
  }
  assert.deepEqual(external.$defs.managedModelReleaseAuthorityBinding, namespace({
    type: canonical.type,
    additionalProperties: canonical.additionalProperties,
    required: canonical.required,
    properties: canonical.properties,
  }))
})

test('external finalization transport schema is an exact namespaced projection of the canonical protocol', () => {
  const canonical = readJson(resolve(
    ROOT,
    'schemas/managed-ci-authority-finalization-protocol.schema.json',
  ))
  const external = readJson(resolve(ROOT, 'schemas/external-activation-requirements.schema.json'))
  const names = {
    sha256: 'sha256',
    issuerMapping: 'managedReceiptSignerIssuerMapping',
  }
  const namespace = value => {
    if (Array.isArray(value)) return value.map(namespace)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key !== '$ref' || typeof item !== 'string') return [key, namespace(item)]
      return [key, item.replace(/^#\/\$defs\/([^/]+)$/, (_, name) => {
        assert(names[name], `unmapped canonical finalization schema definition:${name}`)
        return `#/$defs/${names[name]}`
      })]
    }))
  }
  assert.deepEqual(
    external.$defs.managedReceiptSignerIssuerMapping,
    namespace(canonical.$defs.issuerMapping),
  )
  assert.deepEqual(
    external.$defs.managedFinalizationTransportReadback,
    namespace(canonical.$defs.transportReadback),
  )
})

test('managed CI receipt, OIDC, and aggregate readback digests are derived from full provenance and independent raw evidence', () => {
  const classes = ['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer']
  const digest = value => sha256(String(value))
  const digestMap = prefix => Object.fromEntries(classes.map(id => [id, digest(`${prefix}:${id}`)]))
  const finalizationTransportReadback = {
    schemaVersion: 1,
    kind: 'managed-ci-finalization-transport-readback-v1',
    requestSha256: digest('finalization-request'),
    transportContractDigest: digest('finalization-transport-contract'),
    clientToGateway: {},
    gatewayToSigner: {},
    observedAt: '2027-01-15T08:00:01.000Z',
  }
  finalizationTransportReadback.readbackDigest = managedCiFinalizationTransportReadbackDigest(
    finalizationTransportReadback,
  )
  const claims = {
    provenanceBindingDigest: digest('full-provenance'),
    workflowIdentityDigest: digest('workflow-identity'),
    activationTrustBundleDigest: digest('activation-trust'),
    frozenSubjectArtifactBinding: {
      schemaVersion: 1,
      kind: 'managed-ci-frozen-subject-v1',
      artifactSha256: digest('frozen-artifact'),
      lineageDigest: digest('frozen-lineage'),
    },
    modelReleaseAuthorityBinding: {
      schemaVersion: 1, kind: 'managed-ci-model-release-authority-binding-v1',
      requestModelId: 'fixture-model-2027-01-15', observedResponseModelId: 'fixture-model-2027-01-15',
      modelReleaseId: 'fixture/fixture-model-2027-01-15', modelReleaseBindingDigest: digest('model-release-binding'),
      modelReleaseRegistryDigest: digest('model-release-registry'), modelIdentityPolicyDigest: digest('model-identity-policy'),
      modelReleaseValidFrom: '2027-01-15T07:00:00.000Z', modelReleaseValidUntil: '2027-01-15T09:00:00.000Z',
      providerInvocationWindow: { startedAt: '2027-01-15T07:59:00.000Z', finishedAt: '2027-01-15T08:01:00.000Z' },
      exchangeInvocationObservations: [{
        shardId: digest('model-shard-001'), providerRunId: 'provider-run-001', responseSha256: digest('provider-response-001'),
        observedAt: '2027-01-15T08:00:00.000Z',
      }],
      authorityReceipt: { receiptId: 'fixture-authority-receipt', signature: 'A'.repeat(86) },
      sourceReadback: { readbackId: 'fixture-source-readback', bodySha256: digest('model-authority-source-body'), signature: 'B'.repeat(86) },
      revocationReadback: { readbackId: 'fixture-revocation-readback', bodySha256: digest('model-authority-revocation-body'), status: 'not-revoked', signature: 'C'.repeat(86) },
      auditReadback: { readbackId: 'fixture-audit-readback', eventHeadDigest: digest('model-authority-event-head'), signature: 'D'.repeat(86) },
    },
    workflowRunId: '6101',
    runAttempt: 1,
    executionClassProfileDigests: digestMap('profile'),
    containerImageDigests: Object.fromEntries(classes.map(id => [id, `sha256:${digest(`image:${id}`)}`])),
    networkPolicyDigests: digestMap('network'),
    isolationPolicyDigests: digestMap('isolation'),
    permissionsDigests: digestMap('permissions'),
    executionClassControlPlaneBundleDigests: digestMap('control-plane'),
    executionClassReceiptDigests: digestMap('independent-receipt'),
    executionClassEvidenceEnvelopeDigests: digestMap('evidence-envelope'),
    executionClassGeneratedOutputClosureDigests: digestMap('generated-output-closure'),
    executionClassOidcClaimProjections: Object.fromEntries(classes.map((executionClass, index) => [executionClass, {
      claimProjection: { iss: 'https://token.actions.githubusercontent.com', run_id: '6101', run_attempt: '1' },
      brokerRequest: { jobName: executionClass, executionClass, provenanceBindingDigest: digest('full-provenance') },
      policyBinding: { schemaVersion: 1, tokenMaxAgeSeconds: 600 },
      tokenRuntime: { jti: `jti-${index + 1}`, exp: 1_800_000_600, iat: 1_800_000_000, nbf: 1_800_000_000 },
      projectionDigest: digest(`stable-oidc:${executionClass}`),
    }])),
    executionClassImageSupplyChainBindings: Object.fromEntries(classes.map(executionClass => [executionClass, {
      schemaVersion: 2,
      kind: 'managed-ci-image-supply-chain-binding-v2',
      executionClass,
      image: { subjectDigest: `sha256:${digest(`image:${executionClass}`)}` },
      bindingDigest: digest(`image-supply:${executionClass}`),
    }])),
    executionClassHostSandboxReadbacks: Object.fromEntries(classes.map(executionClass => [executionClass, {
      policyBinding: { executionClass, policyDigest: digest(`host-policy:${executionClass}`) },
      observation: {
        kind: 'managed-ci-host-sandbox-independent-observation-v1',
        executionClass,
        workflowRunId: '6101',
        runAttempt: 1,
        receiptDigest: digest(`host-observation:${executionClass}`),
      },
    }])),
    executionClassFrozenSubjectReadbacks: Object.fromEntries(classes.map(executionClass => [executionClass, {
      executionClass,
      artifactSha256: digest('frozen-artifact'),
      lineageDigest: digest('frozen-lineage'),
      readbackDigest: digest(`frozen-readback:${executionClass}`),
    }])),
    receiptSignerAuthorityBinding: {
      schemaVersion: 1,
      kind: 'managed-ci-receipt-signer-authority-binding-v1',
      bindingDigest: digest('signer-authority-binding'),
    },
    receiptSignerIssuerMapping: {
      issuerKeyId: 'fixture-runtime-issuer',
      issuerSubject: 'spiffe://qijenchen.dev/managed-ci/receipt-signer',
      issuerRegistryDigest: digest('issuer-registry'),
    },
    executionClassRawReceiptValidationReadbacks: Object.fromEntries(classes.map(executionClass => [executionClass, {
      schemaVersion: 1,
      kind: 'managed-ci-raw-receipt-validation-readback-v1',
      executionClass,
      rawReceiptDigest: digest(`independent-receipt:${executionClass}`),
      evidenceEnvelopeDigest: digest(`evidence-envelope:${executionClass}`),
      generatedOutputClosureDigest: digest(`generated-output-closure:${executionClass}`),
    }])),
    executionClassReceiptSigningPayloads: Object.fromEntries(classes.map(executionClass => [executionClass, {
      schemaVersion: 1, kind: 'managed-ci-finalized-receipt-v1', executionClass,
      rawReceiptDigest: digest(`independent-receipt:${executionClass}`),
    }])),
    executionClassSignerAuditEvents: Object.fromEntries(classes.map(executionClass => [executionClass, {
      executionClass,
      rawReceiptDigest: digest(`independent-receipt:${executionClass}`),
      signerAuthorityBindingDigest: digest('signer-authority-binding'),
      signedAt: '2027-01-15T08:00:00.000Z',
    }])),
    finalizationRequestDigest: finalizationTransportReadback.requestSha256,
    finalizationRawReceiptSetDigest: digest('finalization-raw-receipt-set'),
    finalizationReceiptSetDigest: digest('finalization-receipt-set'),
    finalizationTransportReadback,
    finalizationTransportReadbackDigest: finalizationTransportReadback.readbackDigest,
    oidcSubjectConfiguration: {
      useDefault: true,
      useImmutableSubject: true,
      includeClaimKeys: [],
      expectedSubject: 'repo:ajenchen@5268686/design-system@1191193806:environment:managed-ci-sandbox-authority-v1',
    },
    secretBrokerPolicyDigests: { 'model-broker': digest('broker:model'), 'github-observer': digest('broker:github') },
    trustProfileDigest: digest('trust-profile'),
    issuerRegistryDigest: digest('issuer-registry'),
    runtimePolicyDigest: digest('runtime-policy'),
    providerEgressRegistryDigest: digest('egress-registry'),
    providerEgressProfilesDigest: digest('egress-profiles'),
    providerEgressEnforcementDigests: { claude: digest('egress:claude'), codex: digest('egress:codex') },
  }
  const baseline = managedCiDerivedReadbackBindings(claims)
  assert(Object.values(baseline.executionClassOidcClaimsDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(Object.values(baseline.executionClassImageSupplyChainDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(Object.values(baseline.executionClassHostSandboxReadbackDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(Object.values(baseline.executionClassFrozenSubjectReadbackDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(Object.values(baseline.executionClassSignerAuditEventDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(/^[a-f0-9]{64}$/.test(baseline.modelReleaseAuthorityBindingDigest))
  assert(Object.values(baseline.executionClassReceiptProvenanceDigests).every(value => /^[a-f0-9]{64}$/.test(value)))
  assert(Object.values(baseline.executionClassOidcProvenanceDigests).every(value => /^[a-f0-9]{64}$/.test(value)))

  const replayAttempt = managedCiDerivedReadbackBindings({ ...structuredClone(claims), runAttempt: 2 })
  assert.notDeepEqual(replayAttempt.executionClassReceiptProvenanceDigests, baseline.executionClassReceiptProvenanceDigests)
  assert.notDeepEqual(replayAttempt.executionClassOidcProvenanceDigests, baseline.executionClassOidcProvenanceDigests)
  assert.notEqual(replayAttempt.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedReceipt = structuredClone(claims)
  substitutedReceipt.executionClassReceiptDigests['model-broker'] = digest('substituted-receipt')
  const receiptBindings = managedCiDerivedReadbackBindings(substitutedReceipt)
  assert.notEqual(receiptBindings.executionClassReceiptProvenanceDigests['model-broker'], baseline.executionClassReceiptProvenanceDigests['model-broker'])
  assert.equal(receiptBindings.executionClassReceiptProvenanceDigests['github-observer'], baseline.executionClassReceiptProvenanceDigests['github-observer'])
  assert.notEqual(receiptBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedOidc = structuredClone(claims)
  substitutedOidc.executionClassOidcClaimProjections['github-observer'].tokenRuntime.jti = 'replayed-jti'
  const oidcBindings = managedCiDerivedReadbackBindings(substitutedOidc)
  assert.notEqual(oidcBindings.executionClassOidcClaimsDigests['github-observer'], baseline.executionClassOidcClaimsDigests['github-observer'])
  assert.notEqual(oidcBindings.executionClassOidcProvenanceDigests['github-observer'], baseline.executionClassOidcProvenanceDigests['github-observer'])
  assert.notEqual(oidcBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedImage = structuredClone(claims)
  substitutedImage.executionClassImageSupplyChainBindings['dependency-acquisition'].image.subjectDigest = `sha256:${digest('substituted-image')}`
  const imageBindings = managedCiDerivedReadbackBindings(substitutedImage)
  assert.notEqual(imageBindings.executionClassImageSupplyChainDigests['dependency-acquisition'], baseline.executionClassImageSupplyChainDigests['dependency-acquisition'])
  assert.notEqual(imageBindings.executionClassReceiptProvenanceDigests['dependency-acquisition'], baseline.executionClassReceiptProvenanceDigests['dependency-acquisition'])
  assert.notEqual(imageBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedHost = structuredClone(claims)
  substitutedHost.executionClassHostSandboxReadbacks['model-broker'].observation.receiptDigest = digest('substituted-host-readback')
  const hostBindings = managedCiDerivedReadbackBindings(substitutedHost)
  assert.notEqual(hostBindings.executionClassHostSandboxReadbackDigests['model-broker'], baseline.executionClassHostSandboxReadbackDigests['model-broker'])
  assert.notEqual(hostBindings.executionClassReceiptProvenanceDigests['model-broker'], baseline.executionClassReceiptProvenanceDigests['model-broker'])
  assert.notEqual(hostBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedFrozen = structuredClone(claims)
  substitutedFrozen.executionClassFrozenSubjectReadbacks['github-observer'].artifactSha256 = digest('substituted-frozen-artifact')
  const frozenBindings = managedCiDerivedReadbackBindings(substitutedFrozen)
  assert.notEqual(frozenBindings.executionClassFrozenSubjectReadbackDigests['github-observer'], baseline.executionClassFrozenSubjectReadbackDigests['github-observer'])
  assert.notEqual(frozenBindings.executionClassReceiptProvenanceDigests['github-observer'], baseline.executionClassReceiptProvenanceDigests['github-observer'])
  assert.notEqual(frozenBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedSigner = structuredClone(claims)
  substitutedSigner.executionClassSignerAuditEvents['deterministic-hook-audit'].signedAt = '2027-01-15T08:00:01.000Z'
  const signerBindings = managedCiDerivedReadbackBindings(substitutedSigner)
  assert.notEqual(signerBindings.executionClassSignerAuditEventDigests['deterministic-hook-audit'], baseline.executionClassSignerAuditEventDigests['deterministic-hook-audit'])
  assert.notEqual(signerBindings.executionClassReceiptProvenanceDigests['deterministic-hook-audit'], baseline.executionClassReceiptProvenanceDigests['deterministic-hook-audit'])
  assert.notEqual(signerBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedSigningPayload = structuredClone(claims)
  substitutedSigningPayload.executionClassReceiptSigningPayloads['github-observer'].rawReceiptDigest = digest('substituted-signing-payload-receipt')
  const signingPayloadBindings = managedCiDerivedReadbackBindings(substitutedSigningPayload)
  assert.notEqual(signingPayloadBindings.executionClassReceiptSigningPayloadDigests['github-observer'], baseline.executionClassReceiptSigningPayloadDigests['github-observer'])
  assert.notEqual(signingPayloadBindings.executionClassReceiptProvenanceDigests['github-observer'], baseline.executionClassReceiptProvenanceDigests['github-observer'])
  assert.notEqual(signingPayloadBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)

  const substitutedModelAuthority = structuredClone(claims)
  substitutedModelAuthority.modelReleaseAuthorityBinding.sourceReadback.bodySha256 = digest('substituted-model-authority')
  const modelAuthorityBindings = managedCiDerivedReadbackBindings(substitutedModelAuthority)
  assert.notEqual(modelAuthorityBindings.modelReleaseAuthorityBindingDigest, baseline.modelReleaseAuthorityBindingDigest)
  assert.notEqual(modelAuthorityBindings.executionClassReceiptProvenanceDigests['model-broker'], baseline.executionClassReceiptProvenanceDigests['model-broker'])
  assert.equal(modelAuthorityBindings.executionClassReceiptProvenanceDigests['github-observer'], baseline.executionClassReceiptProvenanceDigests['github-observer'])
  assert.notEqual(modelAuthorityBindings.readbackReceiptDigest, baseline.readbackReceiptDigest)
})

test('managed CI full provenance poisons workflow tree, run id, and run attempt replays', () => {
  const state = loadManagedCiTrustedExecutionPlan({ repoRoot: resolve(ROOT, '../..') })
  const baseValues = {
    workflowDefinitionRef: managedCiWorkflowDefinitionRef(state),
    workflowDefinitionCommit: '1'.repeat(40),
    workflowDefinitionTree: '2'.repeat(40),
    workflowRunId: '6101',
    runAttempt: 1,
    subjectCommit: '3'.repeat(40),
    subjectTree: '4'.repeat(40),
    manifestSha256: '5'.repeat(64),
    subjectRunId: '12345678-1234-4abc-8def-1234567890ab',
  }
  const valuesFor = (overrides = {}) => {
    const values = { ...baseValues, ...overrides }
    const frozenSubject = managedCiExpectedFrozenSubjectArtifactBinding(state, {
      artifactName: `managed-ci-frozen-subject-${values.workflowRunId}-${values.runAttempt}`,
      artifactId: '99101',
      artifactStorageLocator: 'github-actions-artifact://ajenchen/design-system/99101',
      artifactSha256: '6'.repeat(64),
      artifactSize: 4096,
      subjectCommit: values.subjectCommit,
      subjectTree: values.subjectTree,
      freezeRunId: values.subjectRunId,
      manifestSha256: values.manifestSha256,
      manifestBytesSha256: '7'.repeat(64),
      coverageDigest: '8'.repeat(64),
      shardSetDigest: '9'.repeat(64),
      workflowDefinitionCommit: values.workflowDefinitionCommit,
      workflowDefinitionTree: values.workflowDefinitionTree,
      workflowRunId: values.workflowRunId,
      runAttempt: values.runAttempt,
      authorityOidcProjectionDigest: 'a'.repeat(64),
    })
    return { ...values, frozenSubject }
  }
  const values = valuesFor()
  const baseline = managedCiProvenanceBinding(state, values)
  assert.equal(baseline.kind, 'managed-ci-full-provenance-v2')
  assert.equal(baseline.workflowRepository, 'ajenchen/design-system')
  assert.equal(baseline.workflowPath, '.github/workflows/deep-audit-managed.yml')
  assert.equal(baseline.workflowRef, 'refs/heads/main')
  assert.equal(baseline.workflowEvent, 'workflow_dispatch')
  assert.equal(baseline.runnerEnvironment, 'self-hosted')
  assert.equal(baseline.workflowIdentityDigest, state.workflow.workflowIdentityDigest)
  for (const mutation of [
    { workflowDefinitionTree: '6'.repeat(40) },
    { workflowRunId: '6102' },
    { runAttempt: 2 },
  ]) {
    const replay = managedCiProvenanceBinding(state, valuesFor(mutation))
    assert.notEqual(replay.provenanceBindingDigest, baseline.provenanceBindingDigest)
  }
  const workflowIdentityReplay = managedCiProvenanceBinding({
    ...state,
    workflow: { ...state.workflow, workflowIdentityDigest: 'f'.repeat(64) },
  }, values)
  assert.notEqual(workflowIdentityReplay.provenanceBindingDigest, baseline.provenanceBindingDigest)
})

test('even current signed readback cannot activate a null managed CI workflow/image plan', () => {
  const context = signingContext()
  const ledger = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  const requirement = ledger.requirements.find(item => item.kind === 'managed-ci-attestation')
  const digest = value => String(value).repeat(64).slice(0, 64)
  const classes = ['dependency-acquisition', 'deterministic-hook-audit', 'model-broker', 'github-observer']
  const digestMap = prefix => Object.fromEntries(classes.map((id, index) => [id, digest(`${prefix}${index}`)]))
  requirement.status = 'activated'
  requirement.observedAt = '2026-07-20T23:00:00.000Z'
  requirement.expiresAt = '2026-07-27T23:00:00.000Z'
  const trustIds = [
    'managed-ci-deep-audit-workflow',
    'managed-ci-activated-workflow-contract',
    'managed-ci-activated-workflow-contract-schema',
    'managed-ci-trusted-execution-plan',
    'managed-ci-trusted-execution-plan-schema',
    'managed-ci-trusted-execution-library',
    'managed-ci-trusted-execution-verifier',
  ]
  const observedResource = {
    planDigest: digest('1'), planSchemaDigest: digest('2'), workflowIdentityDigest: digest('3'),
    activationTrustBundleDigest: digest('a'),
    activationTrustFileDigests: Object.fromEntries(trustIds.map((id, index) => [id, digest(`t${index}`)])),
    governanceManifestDigest: digest('b'), controlPlaneLockDigest: digest('c'),
    controlPlaneContractDigest: `sha256:${digest('d')}`, controlPlaneInputDigest: `sha256:${digest('e')}`,
    controlPlaneSnapshotDigest: `sha256:${digest('f')}`, controlPlaneManifestId: 'qijenchen-provider-neutral-governance',
    workflowRepository: 'ajenchen/design-system', workflowPath: '.github/workflows/deep-audit-managed.yml',
    workflowRef: 'refs/heads/main', workflowEvent: 'workflow_dispatch', runnerEnvironment: 'github-hosted',
    workflowDefinitionRef: 'ajenchen/design-system/.github/workflows/deep-audit-managed.yml@refs/heads/main',
    workflowDefinitionCommit: '1'.repeat(40), workflowDefinitionTree: '2'.repeat(40), workflowDefinitionProtectedMain: true,
    auditedSubjectCommit: '3'.repeat(40), auditedSubjectTree: '4'.repeat(40), auditedManifestSha256: digest('5'),
    auditedSubjectRunId: '12345678-1234-4abc-8def-1234567890ab',
    frozenSubjectArtifactBinding: {}, executionClassFrozenSubjectReadbacks: Object.fromEntries(classes.map(id => [id, {}])),
    modelReleaseAuthorityBinding: {},
    workflowDispatchInputsDigest: digest('6'), provenanceBindingDigest: digest('7'),
    workflowRunId: '1234', runAttempt: 1,
    bootstrapMode: 'protected-main-control-plane-only', protectedMainMergedAt: '2026-07-20T22:30:00.000Z',
    releaseMutationsObserved: false, candidateSelfCertificationAllowed: false,
    executionClassProfileDigests: digestMap('3'),
    containerImageDigests: Object.fromEntries(classes.map((id, index) => [id, `sha256:${digest(`4${index}`)}`])),
    networkPolicyDigests: digestMap('5'), isolationPolicyDigests: digestMap('6'),
    permissionsDigests: digestMap('7'), executionClassReceiptDigests: digestMap('8'),
    executionClassEvidenceEnvelopeDigests: digestMap('v'),
    executionClassGeneratedOutputClosureDigests: digestMap('w'),
    executionClassControlPlaneBundleDigests: digestMap('u'),
    executionClassReceiptProvenanceDigests: digestMap('p'),
    executionClassOidcClaimsDigests: digestMap('9'), executionClassOidcProvenanceDigests: digestMap('q'),
    trustProfileDigest: digest('a'),
    issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry), runtimePolicyDigest: digest('b'),
    issuerKeyIds: ['activation-attestor'], issuerQuorum: 1,
    oidcIssuer: 'https://token.actions.githubusercontent.com', oidcAudience: 'qijenchen-managed-deep-audit-v1',
    oidcSubjectConfiguration: { useDefault: true, useImmutableSubject: true, includeClaimKeys: [], expectedSubject: 'repo:ajenchen@5268686/design-system@1191193806:environment:managed-ci-sandbox-authority-v1' },
    executionClassOidcClaimProjections: Object.fromEntries(classes.map(id => [id, {}])),
    executionClassImageSupplyChainBindings: Object.fromEntries(classes.map(id => [id, {}])),
    executionClassHostSandboxReadbacks: Object.fromEntries(classes.map(id => [id, {}])),
    receiptSignerAuthorityBinding: {}, receiptSignerIssuerMapping: {},
    executionClassRawReceiptValidationReadbacks: Object.fromEntries(classes.map(id => [id, {}])),
    executionClassReceiptSigningPayloads: Object.fromEntries(classes.map(id => [id, {}])),
    executionClassSignerAuditEvents: Object.fromEntries(classes.map(id => [id, {}])),
    finalizationRequestDigest: digest('finalization-request'),
    finalizationRawReceiptSetDigest: digest('finalization-raw-receipt-set'),
    finalizationReceiptSetDigest: digest('finalization-receipt-set'),
    finalizationTransportReadback: {},
    finalizationTransportReadbackDigest: digest('finalization-transport-readback'),
    executionClassImageSupplyChainDigests: digestMap('i'), executionClassHostSandboxReadbackDigests: digestMap('h'),
    executionClassFrozenSubjectReadbackDigests: digestMap('z'), executionClassRawReceiptValidationDigests: digestMap('x'),
    executionClassReceiptSigningPayloadDigests: digestMap('y'),
    receiptSignerAuthorityBindingDigest: digest('r'), receiptSignerIssuerMappingDigest: digest('m'),
    frozenSubjectArtifactBindingDigest: digest('n'), modelReleaseAuthorityBindingDigest: digest('o'),
    executionClassSignerAuditEventDigests: digestMap('s'),
    secretBrokerPolicyDigests: { 'model-broker': digest('c'), 'github-observer': digest('d') },
    providerEgressRegistryDigest: digest('e'), providerEgressProfilesDigest: digest('f'),
    providerEgressEnforcementDigests: { claude: digest('1'), codex: digest('2') },
    readbackReceiptDigest: digest('3'),
  }
  requirement.evidence = createExternalActivationEvidence(requirement, {
    policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
    issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
    observedResource,
  })
  signExternalActivationRequirement(requirement, {
    signerKeyId: 'activation-attestor', subject: 'independent-activation-attestor', privateKey: context.privateKey,
  })
  assert.throws(() => validateExternalActivationRequirements(ledger, { ...context, now: NOW }), /cannot activate an unverified managed CI plan/)
})

test('managed CI validation context accepts only a complete verified root and leaves the production default fail closed', () => {
  const base = signingContext()
  const fixture = createManagedCiActivationFixture({
    repoRoot: resolve(ROOT, '../..'),
    issuerRegistry: base.issuerRegistry,
    runtimeProfile: readJson(resolve(ROOT, 'providers/runtime-conformance.json')),
    observedAt: '2026-07-20T23:00:00.000Z',
  })
  try {
    const context = {
      ...base,
      issuerRegistry: fixture.issuerRegistry,
      rings: structuredClone(base.rings),
    }
    context.rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(context.issuerRegistry)
    const ledger = activatedLedger(context)
    const requirement = ledger.requirements.find(item => item.kind === 'managed-ci-attestation')
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T23:00:00.000Z'
    requirement.expiresAt = '2026-07-27T23:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest: EXTERNAL_ACTIVATION_POLICY_DIGEST,
      issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
      observedResource: fixture.observedResource(),
    })
    signExternalActivationRequirement(requirement, {
      signerKeyId: 'activation-attestor',
      subject: 'independent-activation-attestor',
      privateKey: context.privateKey,
    })
    const options = { ...context, now: NOW }
    assert.throws(
      () => validateExternalActivationRequirements(ledger, options),
      /cannot activate an unverified managed CI plan/,
    )
    assert.throws(
      () => validateExternalActivationRequirements(ledger, { ...options, managedCiValidationContext: {} }),
      /cannot activate an unverified managed CI plan/,
    )
    assert.throws(
      () => validateExternalActivationRequirements(ledger, {
        ...options,
        managedCiValidationContext: { repoRoot: fixture.managedCiValidationContext.repoRoot },
      }),
      /cannot activate an unverified managed CI plan/,
    )
    assert.throws(
      () => validateExternalActivationRequirements(ledger, {
        ...options,
        managedCiValidationContext: {
          repoRoot: resolve(ROOT, '../..'),
          runtimeProfile: readJson(resolve(ROOT, 'providers/runtime-conformance.json')),
        },
      }),
      /cannot activate an unverified managed CI plan/,
    )
    assert.equal(validateExternalActivationRequirements(ledger, {
      ...options,
      managedCiValidationContext: fixture.managedCiValidationContext,
    }), true)
    const managedPlanPath = resolve(fixture.managedCiValidationContext.repoRoot, 'scripts/managed-ci-trusted-execution-plan.json')
    const managedPlanBytes = readFileSync(managedPlanPath)
    try {
      // Populate the process-local verified-state cache, then change only the
      // canonical source bytes. A stale cache would accept the old attestation;
      // the closed source-tree identity must force a fresh load and reject it.
      writeFileSync(managedPlanPath, Buffer.concat([managedPlanBytes, Buffer.from('\n')]))
      assert.throws(
        () => validateExternalActivationRequirements(ledger, {
          ...options,
          managedCiValidationContext: fixture.managedCiValidationContext,
        }),
        /managed plan\/workflow\/trust binding drifted/,
      )
    } finally {
      writeFileSync(managedPlanPath, managedPlanBytes)
    }
    assert.equal(validateExternalActivationRequirements(ledger, {
      ...options,
      managedCiValidationContext: fixture.managedCiValidationContext,
    }), true)
    let poisonDuringCachedUse = false
    const guardedContext = new Proxy(fixture.managedCiValidationContext, {
      get(target, property, receiver) {
        if (property === 'runtimeProfile' && poisonDuringCachedUse) {
          poisonDuringCachedUse = false
          // The runtimeProfile read occurs after the cache's initial tree
          // observation. This deterministically models a concurrent canonical
          // source write while the cached managed state is being consumed.
          writeFileSync(managedPlanPath, Buffer.concat([managedPlanBytes, Buffer.from('\n')]))
        }
        return Reflect.get(target, property, receiver)
      },
    })
    assert.equal(validateExternalActivationRequirements(ledger, {
      ...options,
      managedCiValidationContext: guardedContext,
    }), true)
    try {
      poisonDuringCachedUse = true
      assert.throws(
        () => validateExternalActivationRequirements(ledger, {
          ...options,
          managedCiValidationContext: guardedContext,
        }),
        /source tree changed while cached state was in use/,
      )
    } finally {
      poisonDuringCachedUse = false
      writeFileSync(managedPlanPath, managedPlanBytes)
    }
    assert.equal(validateExternalActivationRequirements(ledger, {
      ...options,
      managedCiValidationContext: guardedContext,
    }), true)
    assert.throws(
      () => validateExternalActivationRequirements(ledger, options),
      /cannot activate an unverified managed CI plan/,
    )
  } finally {
    fixture.dispose()
  }
})

test('live GitHub mutation and release paths reject injected managed CI validation state before any transport or filesystem access', async () => {
  const client = new GhApiClient()
  let requests = 0
  client.request = () => {
    requests += 1
    throw new Error('live GitHub transport must not be reached')
  }
  const injected = Object.freeze({ repoRoot: '/never-read', runtimeProfile: Object.freeze({}) })

  assert.throws(
    () => applyPlan({}, client, {
      journalPath: '/never-written',
      inventory: {},
      desired: {},
      rings: {},
      certifications: {},
      waivers: {},
      runtimeProfile: {},
      issuerRegistry: {},
      managedCiValidationContext: injected,
    }),
    /^Error: Live GitHub apply refuses an injected managed CI validation context$/,
  )
  assert.throws(
    () => recoverTransaction('/never-read', client, {
      issuerRegistry: {},
      managedCiValidationContext: injected,
    }),
    /^Error: Live GitHub recovery refuses an injected managed CI validation context$/,
  )
  assert.throws(
    () => rollbackTransaction('/never-read', client, {
      issuerRegistry: {},
      managedCiValidationContext: injected,
    }),
    /^Error: Live GitHub rollback refuses an injected managed CI validation context$/,
  )
  await assert.rejects(
    () => resolveReleaseTrustPreflight({
      client,
      managedCiValidationContext: injected,
    }),
    /^Error: Live GitHub release trust preflight refuses an injected managed CI validation context$/,
  )
  assert.equal(requests, 0)
})

test('activated status requires current independent Ed25519 read-back evidence', () => {
  const context = signingContext()
  const ledger = activatedLedger(context)
  assert.equal(validateExternalActivationRequirements(ledger, { ...context, now: NOW }), true)
  const releaseReadiness = externalActivationReadiness(ledger, { ...context, now: NOW, scope: 'release' })
  assert.equal(releaseReadiness.ready, true)
  assert.deepEqual(releaseReadiness.blockers, [])
  assert(releaseReadiness.optionalRequirementIds.includes('activate-managed-ci-trusted-execution'))

  const tampered = structuredClone(ledger)
  tampered.requirements[0].evidence.signature = tampered.requirements[0].evidence.signature.replace(/^./, character => character === 'A' ? 'B' : 'A')
  assert.throws(() => validateExternalActivationRequirements(tampered, { ...context, now: NOW }), /signature is invalid/)

  assert.throws(
    () => validateExternalActivationRequirements(ledger, { ...context, now: new Date('2026-07-28T00:00:00.000Z') }),
    /evidence is expired/,
  )
})

test('not-activated status forbids fabricated evidence and npm policy coverage fails closed', () => {
  const context = signingContext()
  const ledger = activatedLedger(context)
  ledger.requirements[0].status = 'not-activated'
  assert.throws(() => validateExternalActivationRequirements(ledger, { ...context, now: NOW }), /must not fabricate evidence/)

  const committed = readJson(resolve(ROOT, 'external-activation-requirements.json'))
  const inventory = readJson(resolve(ROOT, 'inventory/managed-repos.json'))
  const desired = readJson(resolve(ROOT, 'desired/github.json'))
  const mutationBoundaryContract = readJson(resolve(ROOT, 'providers/github-mutation-boundary-contract.json'))
  const policy = readJson(resolve(ROOT, 'external-activation-policy.json'))
  const rings = readJson(resolve(ROOT, 'release-rings.json'))
  const issuerRegistry = readJson(resolve(ROOT, 'trust/issuers.json'))
  committed.requirements = committed.requirements.filter(item => item.id !== 'activate-governance-stage-only-trusted-publisher')
  assert.throws(
    () => validateExternalActivationRequirements(committed, {
      inventory,
      desired,
      policy,
      mutationBoundaryContract,
      rings,
      issuerRegistry,
      now: issuerValidationTime(issuerRegistry),
    }),
    /does not exactly cover the immutable policy catalog/,
  )
})

test('immutable policy, exact catalog, evidence kind, and read-back content address fail closed', () => {
  const context = signingContext()
  const ledger = activatedLedger(context)

  const mutatedPolicy = structuredClone(context.policy)
  mutatedPolicy.requirements[0].reason = 'self-authorized replacement policy'
  assert.throws(
    () => validateExternalActivationRequirements(ledger, { ...context, policy: mutatedPolicy, now: NOW }),
    /digest differs from the immutable reviewed catalog/,
  )

  const missingRequirement = structuredClone(ledger)
  missingRequirement.requirements.pop()
  assert.throws(
    () => validateExternalActivationRequirements(missingRequirement, { ...context, now: NOW }),
    /does not exactly cover the immutable policy catalog/,
  )

  const wrongKind = structuredClone(ledger)
  wrongKind.requirements[0].evidence.kind = 'signed-operator-bundle'
  assert.throws(
    () => validateExternalActivationRequirements(wrongKind, { ...context, now: NOW }),
    /evidence kind differs from policy/,
  )

  const wrongReadback = structuredClone(ledger)
  wrongReadback.requirements[0].evidence.payload.observedResource.installations = []
  assert.throws(
    () => validateExternalActivationRequirements(wrongReadback, { ...context, now: NOW }),
    /readback payload digest mismatch/,
  )
})
