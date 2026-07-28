import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GOVERNANCE_ROOT,
  assertNoEmbeddedSecrets,
  invariant,
  readJson,
  sha256,
  stableStringify,
} from './common.mjs'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
} from './issuer-registry.mjs'
import { validateAttestationPolicy } from './attestation.mjs'
import {
  managedCiExpectedHostSandboxPolicyBinding,
  managedCiExpectedImageSupplyChainBinding,
  managedCiExpectedFrozenSubjectArtifactBinding,
  managedCiExpectedFrozenSubjectClassReadback,
  managedCiExpectedFinalizationTransportContract,
  managedCiExpectedModelReleaseAuthorityBinding,
  managedCiExpectedOidcBinding,
  managedCiExpectedReceiptBinding,
  managedCiExpectedReceiptSignerAuthorityBinding,
  managedCiHostSandboxObservationReceiptDigest,
  managedCiHostSandboxObservationSigningBytes,
  managedCiFinalizedReceiptSetDigest,
  managedCiFinalizationTransportReadbackDigest,
  managedCiSignerAuditEvent,
  managedCiValidateFinalizationTransportReadback,
  managedCiVerifyReceiptSigningPayloadProjection,
  isManagedCiTrustedExecutionCore,
  loadManagedCiTrustedExecutionCore,
  managedCiImmutableValidationModels,
  managedCiProvenanceBinding,
  managedCiWorkflowDefinitionRef,
} from '../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'
import { validateRuntimeProfile } from './provider-runtime-conformance.mjs'
import {
  EMPTY_BYPASS_ACTORS_SHA256,
  NULL_ENVIRONMENT_POLICY_SHA256,
  validateGithubMutationBoundaryContract as validateSharedGithubMutationBoundaryContract,
} from '../../../scripts/lib/github-mutation-boundary.mjs'

export const EXTERNAL_ACTIVATION_SCOPES = Object.freeze([
  'release',
  'fleet-rollout',
  'managed-host',
  'objective-completion',
])

export const EXTERNAL_ACTIVATION_PROFILE_IDS = Object.freeze([
  'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM',
  'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM',
])
const EXPECTED_PROFILE_RELEASE_AUTHORIZATION = Object.freeze({
  PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM: Object.freeze({
    minimumSignerQuorum: 1,
    maximumSignerQuorum: 1,
  }),
  MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM: Object.freeze({
    minimumSignerQuorum: 2,
    maximumSignerQuorum: 5,
  }),
})

export const EXTERNAL_ACTIVATION_POLICY_PATH = 'infra/governance/external-activation-policy.json'
export const EXTERNAL_ACTIVATION_POLICY_DIGEST = '5c9cfa18608b5e22d6a064a26113fa7b2ccd5a8708dc201f9b3509f4ebb1973e'
export const GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH = 'infra/governance/providers/github-mutation-boundary-contract.json'
export const GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST = '8ec9e43e64733a1fc3c7db440825ebb0677581ad9e40c60bf462d2f86a5c657f'
export const GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
export const GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'
const DEFAULT_POLICY_PATH = resolve(GOVERNANCE_ROOT, 'external-activation-policy.json')
const DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH = resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json')
const GOVERNANCE_APP_INTEGRATIONS = Object.freeze(['governanceCheckApp', 'governanceWriterApp'])

const STATUS = new Set(['not-activated', 'activated'])
const REQUIREMENT_KINDS = new Set([
  'github-app',
  'protected-environment',
  'github-repository',
  'github-token-permission',
  'github-mutation-boundary',
  'managed-host-policy',
  'release-authorization',
  'npm-package-identity',
  'npm-trusted-publisher',
  'npm-publishing-access',
  'durable-evidence-mirror',
  'rollback-drill',
  'managed-ci-attestation',
])
const EVIDENCE_KINDS = new Set([
  'github-api-readback',
  'npm-registry-readback',
  'endpoint-management-readback',
  'signed-operator-bundle',
])
const BASE_KEYS = [
  'id',
  'kind',
  'repository',
  'desiredPath',
  'requiredFor',
  'status',
  'evidence',
  'observedAt',
  'expiresAt',
  'condition',
  'reason',
]
const NPM_KEYS = ['packageName', 'registry']
const EVIDENCE_KEYS = [
  'schemaVersion',
  'kind',
  'reference',
  'sha256',
  'issuerRegistryDigest',
  'policyDigest',
  'payload',
  'signerKeyId',
  'subject',
  'signature',
  'coSignatures',
]
const PAYLOAD_KEYS = [
  'schemaVersion',
  'kind',
  'requirementId',
  'policyDigest',
  'repository',
  'observedAt',
  'expiresAt',
  'observedResource',
  'readbackSha256',
]
const COSIGNATURE_KEYS = ['signerKeyId', 'subject', 'signature']
const NPM_KINDS = new Set(['npm-package-identity', 'npm-trusted-publisher', 'npm-publishing-access'])
const SHA256 = /^[a-f0-9]{64}$/
const RELEASE_FINALIZER_AUTHORITY_REQUIREMENT_ID = 'activate-independent-finalizer-signed-authority'
const RELEASE_FINALIZER_WORKFLOW = '.github/workflows/release-finalize.yml'
const FINALIZER_AUTHORITY_KIND = 'release-finalizer-signed-authority-v1'
const FINALIZER_AUTHORITY_CORE_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'requirementId',
  'repository',
  'desiredPath',
  'workflow',
  'externalActivationPolicyDigest',
  'authorizationProfileId',
  'authorizationProfileDigest',
  'releaseAuthorization',
  'allowedKeyIds',
  'requiredSignerQuorum',
  'authorizerSubjects',
  'observedAt',
  'expiresAt',
  'issuerRegistryDigest',
  'attestorSubjects',
  'evidenceSha256',
  'readbackSha256',
  'activationLedgerDigest',
])
const GITHUB_MUTATION_BOUNDARY_CLAIM_KEYS = Object.freeze([
  'projectionContractDigest',
  'fullRulesetsDigest',
  'bypassActorsDigest',
  'publicRulesetProjectionDigest',
  'normalizedRulesetsDigest',
  'requiredChecksDigest',
  'actionsWorkflowPermissionsDigest',
  'repositoryIdentityDefaultBranchDigest',
  'environmentPolicyDigest',
])
const GITHUB_MUTATION_BOUNDARY_TARGETS = Object.freeze([
  Object.freeze({
    id: 'activate-design-system-mirror-mutation-boundary',
    repository: 'ajenchen/design-system',
    role: 'authority',
    desiredPath: 'infra/governance/desired/github.json#/profiles/design-system-authority',
    environment: 'governance-mirror',
  }),
  Object.freeze({
    id: 'activate-product-template-mirror-mutation-boundary',
    repository: 'ajenchen/ds-product-template',
    role: 'template-mirror',
    desiredPath: 'infra/governance/desired/github.json#/profiles/published-template',
    environment: null,
  }),
])
const MANAGED_CI_VALIDATION_TREE_ENTRY_LIMIT = 20_000
const MANAGED_CI_OBSERVED_RESOURCE_CACHE_LIMIT = 64
const MANAGED_CI_IMMUTABLE_MODEL_MAX_BYTES = 8 * 1024 * 1024
// Test-fixture injection only: every live GhApiClient mutation/release path rejects a non-null
// context before transport or filesystem access. Weak keys also ensure this cache cannot keep a
// discarded fixture context alive; callers that intentionally retain distinct fixtures retain
// their own graphs and receive no production authority from this optimization.
const managedCiValidationContextCache = new WeakMap()
const managedCiObservedResourceValidationCache = new Map()

const EVIDENCE_CONTRACTS = Object.freeze({
  'github-app': ['github-api-readback', [
    'appIds', 'appConfigurations', 'appConfigurationsDigest',
    'installationRepositoriesByIntegration', 'installationRepositoriesDigest',
    'environmentSecretPlacements', 'environmentSecretPlacementsDigest',
    'nonEnvironmentGovernanceSecrets', 'nonEnvironmentGovernanceSecretsDigest',
    'installationTokenProbes', 'installationTokenProbesDigest',
  ]],
  'protected-environment': ['github-api-readback', ['environment', 'reviewers', 'preventSelfReview']],
  'github-repository': ['github-api-readback', ['rulesetsDigest', 'requiredChecksDigest', 'immutableReleases', 'tagObjectVerificationDigest']],
  'github-token-permission': ['github-api-readback', ['tokenFingerprint', 'permissions', 'writePermissions']],
  'github-mutation-boundary': ['github-api-readback', GITHUB_MUTATION_BOUNDARY_CLAIM_KEYS],
  'managed-host-policy': ['endpoint-management-readback', ['provider', 'winningSource', 'policyDigest', 'bundleDigest', 'activationProofDigest']],
  'release-authorization': ['signed-operator-bundle', ['allowedKeyIds', 'quorum', 'issuerRegistryDigest']],
  'npm-package-identity': ['npm-registry-readback', ['packageName', 'registry', 'visibility', 'bootstrapVersion', 'consumerEligible']],
  'npm-trusted-publisher': ['npm-registry-readback', ['packageName', 'registry', 'repository', 'workflow', 'environment', 'allowedActions', 'exclusive']],
  'npm-publishing-access': ['npm-registry-readback', ['packageName', 'registry', 'twoFactorMode', 'tokensAllowed', 'remainingPublishTokenIds']],
  'durable-evidence-mirror': ['signed-operator-bundle', [
    'provider', 'protocolVersion', 'endpoint', 'tenant', 'container', 'wormMode',
    'lifecyclePolicyDigest', 'minimumRetentionDays', 'writerPrincipal', 'verifierPrincipal',
    'adapterCommandSha256', 'receiptSigningKeyId', 'receiptSigningPublicKeySpki',
    'receiptSigningPublicKeySpkiSha256', 'signatureAlgorithm', 'receiptId', 'eventHeadDigest',
    'retentionUntil', 'appendOnly', 'independentAdministration', 'receiptSha256',
  ]],
  'rollback-drill': ['signed-operator-bundle', ['transactionId', 'eventHeadDigest', 'authorizationDigest', 'beforeImageRestored', 'postRollbackStateDigest', 'offHostReceiptDigest']],
  'managed-ci-attestation': ['signed-operator-bundle', [
    'planDigest', 'planSchemaDigest', 'workflowIdentityDigest', 'activationTrustBundleDigest',
    'activationTrustFileDigests', 'governanceManifestDigest', 'controlPlaneLockDigest',
    'controlPlaneContractDigest', 'controlPlaneInputDigest', 'controlPlaneSnapshotDigest',
    'controlPlaneManifestId', 'workflowRepository', 'workflowPath', 'workflowRef',
    'workflowEvent', 'runnerEnvironment', 'workflowDefinitionRef', 'workflowDefinitionCommit',
    'workflowDefinitionTree', 'workflowDefinitionProtectedMain', 'auditedSubjectCommit',
    'auditedSubjectTree', 'auditedManifestSha256', 'auditedSubjectRunId',
    'frozenSubjectArtifactBinding', 'executionClassFrozenSubjectReadbacks', 'modelReleaseAuthorityBinding',
    'workflowDispatchInputsDigest', 'provenanceBindingDigest', 'workflowRunId', 'runAttempt',
    'bootstrapMode', 'protectedMainMergedAt',
    'releaseMutationsObserved', 'candidateSelfCertificationAllowed', 'executionClassProfileDigests',
    'containerImageDigests', 'networkPolicyDigests', 'isolationPolicyDigests',
    'permissionsDigests', 'executionClassControlPlaneBundleDigests', 'executionClassReceiptDigests',
    'executionClassEvidenceEnvelopeDigests', 'executionClassGeneratedOutputClosureDigests',
    'executionClassReceiptProvenanceDigests',
    'executionClassOidcClaimsDigests', 'executionClassOidcProvenanceDigests',
    'executionClassImageSupplyChainBindings', 'executionClassHostSandboxReadbacks',
    'receiptSignerAuthorityBinding', 'receiptSignerIssuerMapping', 'executionClassRawReceiptValidationReadbacks', 'executionClassReceiptSigningPayloads', 'executionClassSignerAuditEvents',
    'finalizationRequestDigest', 'finalizationRawReceiptSetDigest', 'finalizationReceiptSetDigest',
    'finalizationTransportReadback', 'finalizationTransportReadbackDigest',
    'executionClassImageSupplyChainDigests', 'executionClassHostSandboxReadbackDigests',
    'executionClassFrozenSubjectReadbackDigests', 'executionClassRawReceiptValidationDigests', 'executionClassReceiptSigningPayloadDigests',
    'receiptSignerAuthorityBindingDigest', 'receiptSignerIssuerMappingDigest',
    'frozenSubjectArtifactBindingDigest', 'modelReleaseAuthorityBindingDigest',
    'executionClassSignerAuditEventDigests',
    'trustProfileDigest', 'issuerRegistryDigest', 'runtimePolicyDigest', 'issuerKeyIds',
    'issuerQuorum', 'oidcIssuer', 'oidcAudience', 'oidcSubjectConfiguration',
    'executionClassOidcClaimProjections', 'secretBrokerPolicyDigests',
    'providerEgressRegistryDigest', 'providerEgressProfilesDigest',
    'providerEgressEnforcementDigests', 'readbackReceiptDigest',
  ]],
})

const MANAGED_CI_CLASSES = Object.freeze([
  'dependency-acquisition',
  'deterministic-hook-audit',
  'model-broker',
  'github-observer',
])
const MANAGED_CI_SECRET_BROKER_CLASSES = Object.freeze(['model-broker', 'github-observer'])

export const MANAGED_CI_BINDING_CONTRACT = Object.freeze({
  canonicalSerialization: 'stable-json-sha256',
  provenanceProjection: 'managed-ci-full-provenance-v2',
  receiptBindingProjection: 'managed-ci-execution-class-receipt-binding-v1',
  oidcClaimProjection: 'github-actions-oidc-exact-claims-v1',
  oidcBindingProjection: 'managed-ci-execution-class-oidc-binding-v1',
  oidcSubjectReadback: 'github-actions-immutable-default-subject-v1',
  secretBrokerPolicyBinding: 'managed-ci-secret-broker-policy-v1',
  imageSupplyChainProjection: 'managed-ci-image-supply-chain-binding-v2',
  frozenSubjectArtifactProjection: 'managed-ci-frozen-subject-v1',
  hostSandboxPolicyProjection: 'managed-ci-host-sandbox-policy-binding-v1',
  hostSandboxReadbackProjection: 'managed-ci-host-sandbox-independent-observation-v1',
  receiptSignerAuthorityProjection: 'managed-ci-receipt-signer-authority-binding-v1',
  rawReceiptValidationProjection: 'managed-ci-raw-receipt-validation-readback-v1',
  receiptSigningPayloadProjection: 'managed-ci-finalized-receipt-v1',
  receiptSignerAuditProjection: 'managed-ci-signer-audit-event-v1',
  finalizationProtocolProjection: 'managed-ci-authority-finalization-protocol-v1',
  finalizationTransportProjection: 'managed-ci-finalization-transport-readback-v1',
  modelReleaseAuthorityProjection: 'managed-ci-model-release-authority-binding-v1',
  readbackBindingProjection: 'managed-ci-attested-readback-v1',
  rawEvidenceAuthority: 'signed-independent-completion-attestor-readback',
})

const clone = value => JSON.parse(JSON.stringify(value))

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function compareCodepoints(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

export function deriveGithubAppActivationExpectations({
  inventory,
  desired,
} = {}) {
  invariant(Array.isArray(inventory?.repositories) && inventory.repositories.length > 0, 'GitHub App activation requires a non-empty managed repository inventory')
  invariant(desired?.profiles && typeof desired.profiles === 'object' && !Array.isArray(desired.profiles), 'GitHub App activation requires desired profiles')
  exactKeys(
    Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => [name, desired.integrations?.[name]])),
    GOVERNANCE_APP_INTEGRATIONS,
    'GitHub App governed integration registry',
  )
  const integrations = Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => {
    const integration = desired.integrations[name]
    invariant(integration && typeof integration === 'object' && !Array.isArray(integration), `GitHub App desired integration is missing:${name}`)
    invariant(Number.isSafeInteger(integration.id) && integration.id > 0, `GitHub App desired integration id is unresolved:${name}`)
    invariant(typeof integration.secretPrefix === 'string' && /^[A-Z][A-Z0-9_]*$/.test(integration.secretPrefix), `GitHub App desired integration secretPrefix is invalid:${name}`)
    invariant(typeof integration.capability === 'string' && integration.capability.length > 0, `GitHub App desired integration capability is invalid:${name}`)
    invariant(integration.repositorySelection === 'selected', `GitHub App desired integration repository selection must be selected:${name}`)
    invariant(integration.permissions && typeof integration.permissions === 'object' && !Array.isArray(integration.permissions), `GitHub App desired integration permissions are invalid:${name}`)
    return [name, integration]
  }))
  const repositorySetsByIntegration = Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => [name, new Set()]))
  const environmentSecretPlacements = []
  const repositoryNames = new Set()
  const repositoryByGithub = new Map()
  for (const repository of inventory.repositories) {
    invariant(repository && typeof repository === 'object' && !Array.isArray(repository), 'GitHub App managed repository entry is invalid')
    invariant(typeof repository.github === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.github)
      && !repositoryNames.has(repository.github), `GitHub App managed repository identity is invalid or duplicated:${repository?.github ?? '<missing>'}`)
    invariant(typeof repository.desiredProfile === 'string' && repository.desiredProfile.length > 0, `GitHub App managed repository desiredProfile is invalid:${repository.github}`)
    const profile = desired.profiles[repository.desiredProfile]
    invariant(profile && typeof profile === 'object' && !Array.isArray(profile), `GitHub App desired profile is missing:${repository.desiredProfile}`)
    const referencedIntegrations = new Set()
    invariant(Array.isArray(profile.requiredChecks), `GitHub App desired profile requiredChecks are missing:${repository.desiredProfile}`)
    for (const check of profile.requiredChecks) {
      if (GOVERNANCE_APP_INTEGRATIONS.includes(check?.integration)) referencedIntegrations.add(check.integration)
    }
    invariant(Array.isArray(profile.environments), `GitHub App desired profile environments are missing:${repository.desiredProfile}`)
    for (const environment of profile.environments) {
      if (!GOVERNANCE_APP_INTEGRATIONS.includes(environment?.credentialIntegration)) continue
      const integrationName = environment.credentialIntegration
      invariant(typeof environment.name === 'string' && environment.name.length > 0, `GitHub App credential environment name is invalid:${repository.github}`)
      const prefix = integrations[integrationName].secretPrefix
      environmentSecretPlacements.push({
        repository: repository.github,
        environment: environment.name,
        integration: integrationName,
        secretNames: [`${prefix}_ID`, `${prefix}_PRIVATE_KEY`],
      })
    }
    for (const integrationName of referencedIntegrations) repositorySetsByIntegration[integrationName].add(repository.github)
    repositoryNames.add(repository.github)
    repositoryByGithub.set(repository.github, repository)
  }
  const installationProbeRoutes = []
  const templateMirrors = inventory.repositories.filter(repository => repository.role === 'template-mirror')
  invariant(templateMirrors.length === 1, 'GitHub App activation requires exactly one template-mirror installation target')
  for (const placement of environmentSecretPlacements) {
    const credentialRepository = repositoryByGithub.get(placement.repository)
    let targetRepositories
    if (placement.integration === 'governanceCheckApp') {
      invariant(placement.environment === 'governance-check-verdict',
        `GitHub Check App credential placement has an unsupported environment:${placement.repository}/${placement.environment}`)
      targetRepositories = [credentialRepository]
    } else if (placement.environment === 'governance-mirror') {
      invariant(credentialRepository.role === 'authority',
        `GitHub Writer App governance-mirror credential must belong to the authority repository:${placement.repository}`)
      targetRepositories = templateMirrors
    } else if (placement.environment === 'governance-external-ledger') {
      invariant(credentialRepository.role === 'authority',
        `GitHub Writer App governance-external-ledger credential must belong to the authority repository:${placement.repository}`)
      targetRepositories = [credentialRepository]
    } else if (placement.environment === 'governance-upgrade') {
      invariant(['template-mirror', 'product-consumer'].includes(credentialRepository.role),
        `GitHub Writer App governance-upgrade credential must belong to a template or consumer repository:${placement.repository}`)
      targetRepositories = [credentialRepository]
    } else {
      invariant(false,
        `GitHub Writer App credential placement has an unsupported environment:${placement.repository}/${placement.environment}`)
    }
    for (const target of targetRepositories) {
      repositorySetsByIntegration[placement.integration].add(target.github)
      installationProbeRoutes.push({
        credentialRepository: placement.repository,
        environment: placement.environment,
        integration: placement.integration,
        targetRepository: target.github,
      })
    }
  }
  const repositoriesByIntegration = Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => [
    name,
    [...repositorySetsByIntegration[name]].sort(compareCodepoints),
  ]))
  for (const integrationName of GOVERNANCE_APP_INTEGRATIONS) {
    invariant(repositoriesByIntegration[integrationName].length > 0, `GitHub App activation has no managed repository for ${integrationName}`)
  }
  environmentSecretPlacements.sort((left, right) => (
    compareCodepoints(left.repository, right.repository)
      || compareCodepoints(left.environment, right.environment)
      || compareCodepoints(left.integration, right.integration)
  ))
  invariant(new Set(environmentSecretPlacements.map(item => `${item.repository}\0${item.environment}\0${item.integration}`)).size === environmentSecretPlacements.length,
    'GitHub App environment secret placements are duplicated')
  for (const integrationName of GOVERNANCE_APP_INTEGRATIONS) {
    invariant(environmentSecretPlacements.some(item => item.integration === integrationName), `GitHub App activation has no named-environment secret placement for ${integrationName}`)
  }
  installationProbeRoutes.sort((left, right) => (
    compareCodepoints(left.credentialRepository, right.credentialRepository)
      || compareCodepoints(left.environment, right.environment)
      || compareCodepoints(left.integration, right.integration)
      || compareCodepoints(left.targetRepository, right.targetRepository)
  ))
  invariant(new Set(installationProbeRoutes.map(item => (
    `${item.credentialRepository}\0${item.environment}\0${item.integration}\0${item.targetRepository}`
  ))).size === installationProbeRoutes.length, 'GitHub App installation token probe routes are duplicated')
  const nonEnvironmentGovernanceSecrets = []
  const appConfigurations = Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => [name, {
    repositorySelection: integrations[name].repositorySelection,
    permissions: clone(integrations[name].permissions),
  }]))
  return {
    integrations,
    appIds: Object.fromEntries(GOVERNANCE_APP_INTEGRATIONS.map(name => [name, integrations[name].id])),
    appConfigurations,
    appConfigurationsDigest: sha256(stableStringify(appConfigurations, 0)),
    installationRepositoriesByIntegration: repositoriesByIntegration,
    installationRepositoriesDigest: sha256(stableStringify(repositoriesByIntegration, 0)),
    environmentSecretPlacements,
    environmentSecretPlacementsDigest: sha256(stableStringify(environmentSecretPlacements, 0)),
    installationProbeRoutes,
    nonEnvironmentGovernanceSecrets,
    nonEnvironmentGovernanceSecretsDigest: sha256(stableStringify(nonEnvironmentGovernanceSecrets, 0)),
  }
}

function managedCiExactDigestMap(value, keys, label, { image = false } = {}) {
  exactKeys(value, keys, label)
  const pattern = image ? /^sha256:[a-f0-9]{64}$/ : SHA256
  for (const key of keys) invariant(pattern.test(value[key] ?? ''), `${label}.${key} is invalid`)
}

function managedCiFinalizedReceiptSetProjection(claims) {
  const receipts = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => {
    const rawReceiptPath = `${executionClass}.json`
    invariant(
      claims.executionClassRawReceiptValidationReadbacks[executionClass]?.rawReceiptPath === rawReceiptPath,
      `Managed CI ${executionClass} finalization raw receipt path is not canonical`,
    )
    return [executionClass, {
      rawReceiptPath,
      rawReceiptDigest: claims.executionClassReceiptDigests[executionClass],
      rawReceiptValidationReadback: claims.executionClassRawReceiptValidationReadbacks[executionClass],
      receiptSigningPayload: claims.executionClassReceiptSigningPayloads[executionClass],
      signerAuditEvent: claims.executionClassSignerAuditEvents[executionClass],
    }]
  }))
  return {
    schemaVersion: 1,
    kind: 'managed-ci-finalized-receipt-set-v1',
    requestSha256: claims.finalizationRequestDigest,
    workflowRunId: claims.workflowRunId,
    runAttempt: claims.runAttempt,
    rawReceiptSetDigest: claims.finalizationRawReceiptSetDigest,
    signerIssuerMapping: claims.receiptSignerIssuerMapping,
    receipts,
    setDigest: claims.finalizationReceiptSetDigest,
  }
}

/**
 * Recomputes all derived managed-CI readback bindings. Raw receipt and OIDC
 * digests remain independent completion-attestor evidence, but none of them is
 * authoritative until this full-provenance/class-policy projection closes it.
 */
export function managedCiDerivedReadbackBindings(claims) {
  invariant(claims && typeof claims === 'object' && !Array.isArray(claims), 'Managed CI readback claims must be an object')
  for (const field of [
    'provenanceBindingDigest',
    'workflowIdentityDigest',
    'activationTrustBundleDigest',
    'finalizationRequestDigest',
    'finalizationRawReceiptSetDigest',
    'finalizationReceiptSetDigest',
    'finalizationTransportReadbackDigest',
  ]) {
    invariant(SHA256.test(claims[field] ?? ''), `Managed CI readback ${field} is invalid`)
  }
  invariant(typeof claims.workflowRunId === 'string' && /^[1-9][0-9]*$/.test(claims.workflowRunId)
    && Number.isSafeInteger(claims.runAttempt) && claims.runAttempt >= 1, 'Managed CI readback workflow run identity is invalid')
  managedCiExactDigestMap(claims.executionClassProfileDigests, MANAGED_CI_CLASSES, 'Managed CI executionClassProfileDigests')
  managedCiExactDigestMap(claims.containerImageDigests, MANAGED_CI_CLASSES, 'Managed CI containerImageDigests', { image: true })
  managedCiExactDigestMap(claims.networkPolicyDigests, MANAGED_CI_CLASSES, 'Managed CI networkPolicyDigests')
  managedCiExactDigestMap(claims.isolationPolicyDigests, MANAGED_CI_CLASSES, 'Managed CI isolationPolicyDigests')
  managedCiExactDigestMap(claims.permissionsDigests, MANAGED_CI_CLASSES, 'Managed CI permissionsDigests')
  managedCiExactDigestMap(claims.executionClassControlPlaneBundleDigests, MANAGED_CI_CLASSES, 'Managed CI executionClassControlPlaneBundleDigests')
  managedCiExactDigestMap(claims.executionClassReceiptDigests, MANAGED_CI_CLASSES, 'Managed CI executionClassReceiptDigests')
  managedCiExactDigestMap(claims.executionClassEvidenceEnvelopeDigests, MANAGED_CI_CLASSES, 'Managed CI executionClassEvidenceEnvelopeDigests')
  managedCiExactDigestMap(claims.executionClassGeneratedOutputClosureDigests, MANAGED_CI_CLASSES, 'Managed CI executionClassGeneratedOutputClosureDigests')
  exactKeys(claims.executionClassOidcClaimProjections, MANAGED_CI_CLASSES, 'Managed CI executionClassOidcClaimProjections')
  exactKeys(claims.executionClassImageSupplyChainBindings, MANAGED_CI_CLASSES, 'Managed CI executionClassImageSupplyChainBindings')
  exactKeys(claims.executionClassHostSandboxReadbacks, MANAGED_CI_CLASSES, 'Managed CI executionClassHostSandboxReadbacks')
  exactKeys(claims.executionClassFrozenSubjectReadbacks, MANAGED_CI_CLASSES, 'Managed CI executionClassFrozenSubjectReadbacks')
  exactKeys(claims.executionClassRawReceiptValidationReadbacks, MANAGED_CI_CLASSES, 'Managed CI executionClassRawReceiptValidationReadbacks')
  exactKeys(claims.executionClassReceiptSigningPayloads, MANAGED_CI_CLASSES, 'Managed CI executionClassReceiptSigningPayloads')
  exactKeys(claims.executionClassSignerAuditEvents, MANAGED_CI_CLASSES, 'Managed CI executionClassSignerAuditEvents')
  invariant(claims.receiptSignerAuthorityBinding && typeof claims.receiptSignerAuthorityBinding === 'object'
    && claims.receiptSignerIssuerMapping && typeof claims.receiptSignerIssuerMapping === 'object'
    && claims.frozenSubjectArtifactBinding && typeof claims.frozenSubjectArtifactBinding === 'object'
    && claims.modelReleaseAuthorityBinding && typeof claims.modelReleaseAuthorityBinding === 'object'
    && claims.finalizationTransportReadback && typeof claims.finalizationTransportReadback === 'object'
    && !Array.isArray(claims.finalizationTransportReadback), 'Managed CI frozen subject/model release/signer/finalization readback is missing')
  managedCiExactDigestMap(claims.secretBrokerPolicyDigests, MANAGED_CI_SECRET_BROKER_CLASSES, 'Managed CI secretBrokerPolicyDigests')
  const finalizationTransportReadbackDigest = managedCiFinalizationTransportReadbackDigest(claims.finalizationTransportReadback)
  invariant(
    claims.finalizationTransportReadbackDigest === finalizationTransportReadbackDigest,
    'Managed CI finalization transport readback digest is not reproducible',
  )

  const executionClassOidcClaimsDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassOidcClaimProjections[executionClass], 0)),
  ]))
  const executionClassImageSupplyChainDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassImageSupplyChainBindings[executionClass], 0)),
  ]))
  const executionClassHostSandboxReadbackDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassHostSandboxReadbacks[executionClass], 0)),
  ]))
  const executionClassFrozenSubjectReadbackDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassFrozenSubjectReadbacks[executionClass], 0)),
  ]))
  const executionClassRawReceiptValidationDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassRawReceiptValidationReadbacks[executionClass], 0)),
  ]))
  const executionClassReceiptSigningPayloadDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassReceiptSigningPayloads[executionClass], 0)),
  ]))
  const receiptSignerAuthorityBindingDigest = sha256(stableStringify(claims.receiptSignerAuthorityBinding, 0))
  const receiptSignerIssuerMappingDigest = sha256(stableStringify(claims.receiptSignerIssuerMapping, 0))
  const frozenSubjectArtifactBindingDigest = sha256(stableStringify(claims.frozenSubjectArtifactBinding, 0))
  const modelReleaseAuthorityBindingDigest = sha256(stableStringify(claims.modelReleaseAuthorityBinding, 0))
  const executionClassSignerAuditEventDigests = Object.fromEntries(MANAGED_CI_CLASSES.map(executionClass => [
    executionClass,
    sha256(stableStringify(claims.executionClassSignerAuditEvents[executionClass], 0)),
  ]))
  const executionClassReceiptProvenanceDigests = {}
  const executionClassOidcProvenanceDigests = {}
  for (const executionClass of MANAGED_CI_CLASSES) {
    const classPolicy = {
      executionClass,
      workflowRunId: claims.workflowRunId,
      runAttempt: claims.runAttempt,
      executionClassProfileDigest: claims.executionClassProfileDigests[executionClass],
      containerImageDigest: claims.containerImageDigests[executionClass],
      networkPolicyDigest: claims.networkPolicyDigests[executionClass],
      isolationPolicyDigest: claims.isolationPolicyDigests[executionClass],
      permissionsDigest: claims.permissionsDigests[executionClass],
      controlPlaneBundleDigest: claims.executionClassControlPlaneBundleDigests[executionClass],
      imageSupplyChainBindingDigest: executionClassImageSupplyChainDigests[executionClass],
      hostSandboxReadbackDigest: executionClassHostSandboxReadbackDigests[executionClass],
      frozenSubjectReadbackDigest: executionClassFrozenSubjectReadbackDigests[executionClass],
      rawReceiptValidationDigest: executionClassRawReceiptValidationDigests[executionClass],
      evidenceEnvelopeDigest: claims.executionClassEvidenceEnvelopeDigests[executionClass],
      generatedOutputClosureDigest: claims.executionClassGeneratedOutputClosureDigests[executionClass],
      receiptSignerAuthorityBindingDigest,
      receiptSignerIssuerMappingDigest,
      frozenSubjectArtifactBindingDigest,
      modelReleaseAuthorityBindingDigest: executionClass === 'model-broker' ? modelReleaseAuthorityBindingDigest : null,
      signerAuditEventDigest: executionClassSignerAuditEventDigests[executionClass],
      receiptSigningPayloadDigest: executionClassReceiptSigningPayloadDigests[executionClass],
      secretBrokerPolicyDigest: claims.secretBrokerPolicyDigests[executionClass] ?? null,
    }
    executionClassReceiptProvenanceDigests[executionClass] = sha256(stableStringify({
      schemaVersion: 1,
      kind: MANAGED_CI_BINDING_CONTRACT.receiptBindingProjection,
      provenanceBindingDigest: claims.provenanceBindingDigest,
      ...classPolicy,
      receiptDigest: claims.executionClassReceiptDigests[executionClass],
    }, 0))
    executionClassOidcProvenanceDigests[executionClass] = sha256(stableStringify({
      schemaVersion: 1,
      kind: MANAGED_CI_BINDING_CONTRACT.oidcBindingProjection,
      provenanceBindingDigest: claims.provenanceBindingDigest,
      ...classPolicy,
      oidcClaimsDigest: executionClassOidcClaimsDigests[executionClass],
    }, 0))
  }
  const readbackProjection = {
    schemaVersion: 1,
    kind: MANAGED_CI_BINDING_CONTRACT.readbackBindingProjection,
    provenanceBindingDigest: claims.provenanceBindingDigest,
    workflowIdentityDigest: claims.workflowIdentityDigest,
    activationTrustBundleDigest: claims.activationTrustBundleDigest,
    workflowRunId: claims.workflowRunId,
    runAttempt: claims.runAttempt,
    finalizationRequestDigest: claims.finalizationRequestDigest,
    finalizationRawReceiptSetDigest: claims.finalizationRawReceiptSetDigest,
    finalizationReceiptSetDigest: claims.finalizationReceiptSetDigest,
    finalizationTransportReadbackDigest,
    oidcSubjectConfiguration: claims.oidcSubjectConfiguration,
    executionClassReceiptDigests: claims.executionClassReceiptDigests,
    executionClassEvidenceEnvelopeDigests: claims.executionClassEvidenceEnvelopeDigests,
    executionClassGeneratedOutputClosureDigests: claims.executionClassGeneratedOutputClosureDigests,
    executionClassReceiptProvenanceDigests,
    executionClassOidcClaimsDigests,
    executionClassOidcProvenanceDigests,
    executionClassImageSupplyChainDigests,
    executionClassHostSandboxReadbackDigests,
    executionClassFrozenSubjectReadbackDigests,
    executionClassRawReceiptValidationDigests,
    receiptSignerAuthorityBindingDigest,
    receiptSignerIssuerMappingDigest,
    frozenSubjectArtifactBindingDigest,
    modelReleaseAuthorityBindingDigest,
    executionClassSignerAuditEventDigests,
    executionClassReceiptSigningPayloadDigests,
    secretBrokerPolicyDigests: claims.secretBrokerPolicyDigests,
    trustProfileDigest: claims.trustProfileDigest,
    issuerRegistryDigest: claims.issuerRegistryDigest,
    runtimePolicyDigest: claims.runtimePolicyDigest,
    providerEgressRegistryDigest: claims.providerEgressRegistryDigest,
    providerEgressProfilesDigest: claims.providerEgressProfilesDigest,
    providerEgressEnforcementDigests: claims.providerEgressEnforcementDigests,
  }
  return {
    executionClassOidcClaimsDigests,
    executionClassReceiptProvenanceDigests,
    executionClassOidcProvenanceDigests,
    executionClassImageSupplyChainDigests,
    executionClassHostSandboxReadbackDigests,
    executionClassFrozenSubjectReadbackDigests,
    executionClassRawReceiptValidationDigests,
    receiptSignerAuthorityBindingDigest,
    receiptSignerIssuerMappingDigest,
    frozenSubjectArtifactBindingDigest,
    modelReleaseAuthorityBindingDigest,
    executionClassSignerAuditEventDigests,
    executionClassReceiptSigningPayloadDigests,
    finalizationRequestDigest: claims.finalizationRequestDigest,
    finalizationRawReceiptSetDigest: claims.finalizationRawReceiptSetDigest,
    finalizationReceiptSetDigest: claims.finalizationReceiptSetDigest,
    finalizationTransportReadbackDigest,
    readbackReceiptDigest: sha256(stableStringify(readbackProjection, 0)),
  }
}

export function externalActivationPolicyDigest(policy) {
  return sha256(stableStringify(policy, 0))
}

export function externalActivationProfileDigest(profile) {
  return sha256(stableStringify(profile, 0))
}

export function githubMutationBoundaryContractDigest(contract) {
  return sha256(stableStringify(contract, 0))
}

export function loadExternalActivationPolicy(path = DEFAULT_POLICY_PATH) {
  return readJson(resolve(path))
}

export function loadGithubMutationBoundaryContract(path = DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH) {
  return readJson(resolve(path))
}

export function validateGithubMutationBoundaryContract(contract, {
  expectedDigest = GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  desired,
  inventory,
} = {}) {
  invariant(desired && inventory, 'GitHub mutation-boundary contract validation requires explicit desired state and managed inventory')
  validateSharedGithubMutationBoundaryContract(contract, { desired, inventory })
  invariant(SHA256.test(expectedDigest ?? '')
    && githubMutationBoundaryContractDigest(contract) === expectedDigest, 'GitHub mutation-boundary contract digest differs from the immutable reviewed contract')
  invariant(EMPTY_BYPASS_ACTORS_SHA256 === GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST
    && NULL_ENVIRONMENT_POLICY_SHA256 === GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST,
  'GitHub mutation-boundary shared canonical empty-value digests drifted')
  return true
}

function authorityRepository(inventory) {
  const authorities = inventory?.repositories?.filter(repository => repository.role === 'authority') ?? []
  invariant(authorities.length === 1, 'External activation requires exactly one managed authority repository')
  invariant(Array.isArray(authorities[0].publishes) && authorities[0].publishes.length > 0, 'External activation authority must publish a non-empty release train')
  return authorities[0]
}

function policyRequirementKeys(requirement) {
  const keys = ['id', 'kind', 'repository', 'desiredPath', 'requiredFor', 'condition', 'reason', 'evidenceContract']
  if (NPM_KINDS.has(requirement.kind)) keys.push(...NPM_KEYS)
  if (requirement.kind === 'npm-package-identity') keys.push('bootstrap')
  if (requirement.kind === 'npm-trusted-publisher') keys.push('trustedPublisher')
  if (requirement.kind === 'npm-publishing-access') keys.push('publishingAccess')
  if (requirement.kind === 'github-mutation-boundary') keys.push('mutationBoundaryContract')
  if (requirement.kind === 'managed-ci-attestation') keys.push('managedCiBindingContract')
  return keys
}

function validateGithubMutationBoundaryCoverage(requirements, inventory) {
  const matches = requirements.filter(requirement => requirement.kind === 'github-mutation-boundary')
  invariant(matches.length === GITHUB_MUTATION_BOUNDARY_TARGETS.length, 'External activation requires exactly one source and one target GitHub mutation-boundary requirement')
  const repositories = new Map(inventory.repositories.map(repository => [repository.github, repository]))
  for (const target of GITHUB_MUTATION_BOUNDARY_TARGETS) {
    const requirementMatches = matches.filter(requirement => requirement.id === target.id)
    invariant(requirementMatches.length === 1, `External activation GitHub mutation-boundary requirement is missing or duplicated:${target.id}`)
    const requirement = requirementMatches[0]
    const repository = repositories.get(target.repository)
    invariant(repository?.role === target.role
      && requirement.repository === target.repository
      && requirement.desiredPath === target.desiredPath, `External activation ${target.id} mutation-boundary target drifted`)
    invariant(stableStringify(requirement.requiredFor, 0) === stableStringify(['release', 'objective-completion'], 0), `External activation ${target.id} must gate release and objective completion exactly`)
    exactKeys(requirement.mutationBoundaryContract, ['path', 'sha256'], `External activation ${target.id} mutation-boundary contract`)
    invariant(requirement.mutationBoundaryContract.path === GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH
      && requirement.mutationBoundaryContract.sha256 === GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST, `External activation ${target.id} mutation-boundary contract binding drifted`)
    for (const phrase of [
      'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM permits an owner-administered observer credential',
      'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM requires an independently administered observer/proxy',
      'independently administered observer/proxy',
      'ruleset-write observation authority',
      'credential must never enter GitHub Actions, model, or candidate namespaces',
      'only signed claim output may cross that boundary',
    ]) invariant(requirement.condition.includes(phrase), `External activation ${target.id} condition omits the profile-bound observer credential boundary`)
    invariant(requirement.condition.includes(target.environment === null ? 'canonical null environment policy' : `${target.environment} environment policy`), `External activation ${target.id} condition omits its environment projection`)
    invariant(requirement.reason.includes('runtime metadata:read token cannot directly prove that bypass is empty')
      && requirement.reason.includes('created/updated timestamps')
      && requirement.reason.includes('bypass-only freshness drift'), `External activation ${target.id} reason omits the hidden-bypass/public-freshness threat model`)
  }
}

function staticRequirement(requirement) {
  const value = clone(requirement)
  delete value.status
  delete value.evidence
  delete value.observedAt
  delete value.expiresAt
  return value
}

function validateExternalActivationProfiles(policy) {
  invariant(Array.isArray(policy.profiles)
    && policy.profiles.length === EXTERNAL_ACTIVATION_PROFILE_IDS.length,
  'External activation assurance profiles do not exactly cover the reviewed profile catalog')
  const catalogIds = policy.requirements.map(requirement => requirement.id)
  const catalogIdSet = new Set(catalogIds)
  invariant(stableStringify(policy.profiles.map(profile => profile?.id), 0)
    === stableStringify(EXTERNAL_ACTIVATION_PROFILE_IDS, 0),
  'External activation assurance profile identity/order was substituted')
  invariant(EXTERNAL_ACTIVATION_PROFILE_IDS.includes(policy.activeProfile),
    `External activation active profile is unknown: ${policy.activeProfile}`)
  for (const profile of policy.profiles) {
    exactKeys(profile, ['id', 'releaseAuthorization', 'requiredRequirementIdsByScope'], `External activation assurance profile ${profile?.id ?? '<missing>'}`)
    exactKeys(profile.releaseAuthorization, ['minimumSignerQuorum', 'maximumSignerQuorum'],
      `External activation assurance profile ${profile.id} release authorization`)
    invariant(stableStringify(profile.releaseAuthorization, 0)
      === stableStringify(EXPECTED_PROFILE_RELEASE_AUTHORIZATION[profile.id], 0),
    `External activation assurance profile ${profile.id} release authorization was downgraded or substituted`)
    exactKeys(profile.requiredRequirementIdsByScope, EXTERNAL_ACTIVATION_SCOPES,
      `External activation assurance profile ${profile.id} scope map`)
    for (const scope of EXTERNAL_ACTIVATION_SCOPES) {
      const requiredIds = profile.requiredRequirementIdsByScope[scope]
      invariant(Array.isArray(requiredIds)
        && new Set(requiredIds).size === requiredIds.length
        && requiredIds.every(id => catalogIdSet.has(id)),
      `External activation assurance profile ${profile.id} ${scope} requirement set is invalid`)
      const canonicalOrder = catalogIds.filter(id => requiredIds.includes(id))
      invariant(stableStringify(requiredIds, 0) === stableStringify(canonicalOrder, 0),
        `External activation assurance profile ${profile.id} ${scope} requirement set was reordered or substituted`)
    }
  }
  const production = policy.profiles.find(profile => profile.id === 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM')
  const maximum = policy.profiles.find(profile => profile.id === 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM')
  for (const scope of EXTERNAL_ACTIVATION_SCOPES) {
    const legacyRequired = policy.requirements
      .filter(requirement => requirement.requiredFor.includes(scope))
      .map(requirement => requirement.id)
    invariant(stableStringify(maximum.requiredRequirementIdsByScope[scope], 0)
      === stableStringify(legacyRequired, 0),
    `External activation maximum-assurance profile no longer matches legacy ${scope} semantics`)
    const maximumIds = new Set(maximum.requiredRequirementIdsByScope[scope])
    invariant(production.requiredRequirementIdsByScope[scope].every(id => maximumIds.has(id)),
      `External activation production profile ${scope} requirements are not a subset of maximum assurance`)
  }
  return policy.profiles.find(profile => profile.id === policy.activeProfile)
}

export function resolveExternalActivationProfile(policy, {
  expectedPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
  profileId = policy?.activeProfile,
} = {}) {
  invariant(policy && typeof policy === 'object' && !Array.isArray(policy),
    'External activation profile resolution requires the canonical policy')
  invariant(SHA256.test(expectedPolicyDigest ?? '')
    && externalActivationPolicyDigest(policy) === expectedPolicyDigest,
  'External activation profile resolution policy digest differs from the immutable reviewed catalog')
  validateExternalActivationProfiles(policy)
  invariant(EXTERNAL_ACTIVATION_PROFILE_IDS.includes(profileId),
    `External activation profile resolution requested an unknown profile: ${profileId}`)
  const profile = policy.profiles.find(candidate => candidate.id === profileId)
  invariant(profile, `External activation profile resolution could not find profile ${profileId}`)
  const value = clone(profile)
  return {
    ...value,
    sha256: externalActivationProfileDigest(value),
  }
}

export function validateExternalActivationPolicy(policy, {
  inventory,
  expectedPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
  mutationBoundaryContract,
  expectedMutationBoundaryContractDigest = GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
} = {}) {
  exactKeys(policy, ['$schema', 'schemaVersion', 'policyId', 'activeProfile', 'profiles', 'requirements'], 'External activation policy')
  invariant(policy.$schema === 'schemas/external-activation-policy.schema.json'
    && policy.schemaVersion === 1
    && policy.policyId === 'ds-external-activation-v1', 'External activation policy identity/version mismatch')
  invariant(Array.isArray(policy.requirements) && policy.requirements.length > 0, 'External activation policy must contain requirements')
  invariant(mutationBoundaryContract, 'External activation policy validation requires an explicit mutation-boundary contract')
  invariant(SHA256.test(expectedPolicyDigest ?? '') && externalActivationPolicyDigest(policy) === expectedPolicyDigest, 'External activation policy digest differs from the immutable reviewed catalog')
  validateSharedGithubMutationBoundaryContract(mutationBoundaryContract)
  invariant(githubMutationBoundaryContractDigest(mutationBoundaryContract) === expectedMutationBoundaryContractDigest,
    'GitHub mutation-boundary contract digest differs from the immutable reviewed contract')
  const authority = authorityRepository(inventory)
  const managedRepositories = new Set(inventory.repositories.map(repository => repository.github))
  const ids = new Set()
  for (const requirement of policy.requirements) {
    exactKeys(requirement, policyRequirementKeys(requirement), `External activation policy requirement ${requirement?.id ?? '<missing>'}`)
    invariant(typeof requirement.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(requirement.id) && !ids.has(requirement.id), `External activation policy requirement id is invalid or duplicated: ${requirement?.id ?? '<missing>'}`)
    invariant(REQUIREMENT_KINDS.has(requirement.kind), `External activation policy ${requirement.id} kind is invalid`)
    invariant(requirement.kind === 'github-mutation-boundary'
      ? managedRepositories.has(requirement.repository)
      : requirement.repository === authority.github, `External activation policy ${requirement.id} is not bound to an allowed managed repository`)
    invariant(typeof requirement.desiredPath === 'string' && requirement.desiredPath.trim().length > 0 && !requirement.desiredPath.includes('..'), `External activation policy ${requirement.id} desiredPath is invalid`)
    invariant(Array.isArray(requirement.requiredFor) && requirement.requiredFor.length > 0
      && new Set(requirement.requiredFor).size === requirement.requiredFor.length
      && requirement.requiredFor.every(scope => EXTERNAL_ACTIVATION_SCOPES.includes(scope)), `External activation policy ${requirement.id} requiredFor is invalid`)
    invariant(requirement.requiredFor.includes('objective-completion'), `External activation policy ${requirement.id} must gate objective completion`)
    if (requirement.kind === 'managed-ci-attestation') {
      invariant(
        ['release', 'fleet-rollout', 'objective-completion'].every(scope => requirement.requiredFor.includes(scope)),
        `External activation policy ${requirement.id} must gate release, fleet rollout, and objective completion`,
      )
      exactKeys(requirement.managedCiBindingContract, Object.keys(MANAGED_CI_BINDING_CONTRACT), `External activation policy ${requirement.id} managed CI binding contract`)
      invariant(stableStringify(requirement.managedCiBindingContract, 0) === stableStringify(MANAGED_CI_BINDING_CONTRACT, 0), `External activation policy ${requirement.id} managed CI binding contract drifted`)
    }
    invariant(typeof requirement.condition === 'string' && requirement.condition.trim().length > 0, `External activation policy ${requirement.id} condition is missing`)
    invariant(typeof requirement.reason === 'string' && requirement.reason.trim().length > 0, `External activation policy ${requirement.id} reason is missing`)
    const expectedContract = EVIDENCE_CONTRACTS[requirement.kind]
    exactKeys(requirement.evidenceContract, ['kind', 'requiredClaimKeys'], `External activation policy ${requirement.id} evidence contract`)
    invariant(requirement.evidenceContract.kind === expectedContract[0]
      && stableStringify(requirement.evidenceContract.requiredClaimKeys, 0) === stableStringify(expectedContract[1], 0), `External activation policy ${requirement.id} evidence contract drifted`)
    if (NPM_KINDS.has(requirement.kind)) validateNpmRequirement(requirement, authority)
    ids.add(requirement.id)
  }
  // A protected GitHub environment remains a supported carrier, but a human
  // User/Team reviewer is not a mandatory engineering-decision authority.
  const mandatoryKinds = new Set(Object.keys(EVIDENCE_CONTRACTS).filter(kind => kind !== 'protected-environment'))
  for (const kind of mandatoryKinds) invariant(policy.requirements.some(requirement => requirement.kind === kind), `External activation policy lacks mandatory requirement kind ${kind}`)
  validateGithubMutationBoundaryCoverage(policy.requirements, inventory)
  validateNpmCoverage(policy.requirements, inventory)
  validateExternalActivationProfiles(policy)
  return true
}

function canonicalDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function canonicalPlanDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  const canonical = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
  invariant(canonical !== null && (value === canonical || value === canonical.replace('.000Z', 'Z')), `${label} must be a canonical UTC timestamp`)
  return parsed
}

function signatureBytes(value, label) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), `${label} is invalid`)
  const bytes = Buffer.from(value, 'base64url')
  invariant(bytes.length === 64 && bytes.toString('base64url') === value, `${label} must be canonical Ed25519 base64url`)
  return bytes
}

function unsignedRequirement(requirement) {
  const unsigned = clone(requirement)
  if (unsigned.evidence) {
    unsigned.evidence = {
      schemaVersion: unsigned.evidence.schemaVersion,
      kind: unsigned.evidence.kind,
      reference: unsigned.evidence.reference,
      sha256: unsigned.evidence.sha256,
      issuerRegistryDigest: unsigned.evidence.issuerRegistryDigest,
      policyDigest: unsigned.evidence.policyDigest,
      payload: unsigned.evidence.payload,
    }
  }
  return unsigned
}

export function externalActivationPayload(requirement) {
  return Buffer.from(`external-activation-v3\n${stableStringify(unsignedRequirement(requirement), 0)}`, 'utf8')
}

export function createExternalActivationEvidence(requirement, {
  policyDigest,
  issuerRegistryDigest: registryDigest,
  observedResource,
  reference,
}) {
  invariant(requirement?.status === 'activated', 'External activation evidence requires activated status')
  const [kind] = EVIDENCE_CONTRACTS[requirement.kind] ?? []
  invariant(kind, `External activation ${requirement.id} has no evidence contract`)
  const payload = {
    schemaVersion: 1,
    kind,
    requirementId: requirement.id,
    policyDigest,
    repository: requirement.repository,
    observedAt: requirement.observedAt,
    expiresAt: requirement.expiresAt,
    observedResource: clone(observedResource),
    readbackSha256: sha256(stableStringify(observedResource, 0)),
  }
  const digest = sha256(stableStringify(payload, 0))
  return {
    schemaVersion: 2,
    kind,
    reference: reference ?? `urn:sha256:${digest}`,
    sha256: digest,
    issuerRegistryDigest: registryDigest,
    policyDigest,
    payload,
    signerKeyId: '',
    subject: '',
    signature: '',
    coSignatures: [],
  }
}

export function signExternalActivationRequirement(requirement, {
  signerKeyId,
  subject,
  privateKey,
}) {
  invariant(requirement?.status === 'activated' && requirement.evidence, 'Only an activated requirement can be signed')
  const key = typeof privateKey === 'object' && privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'External activation signing key must be Ed25519')
  requirement.evidence.signerKeyId = signerKeyId
  requirement.evidence.subject = subject
  requirement.evidence.coSignatures = []
  requirement.evidence.signature = sign(null, externalActivationPayload(requirement), key).toString('base64url')
  return requirement
}

export function cosignExternalActivationRequirement(requirement, {
  signerKeyId,
  subject,
  privateKey,
}) {
  invariant(requirement?.status === 'activated' && requirement.evidence, 'Only an activated requirement can be cosigned')
  const signers = [requirement.evidence.signerKeyId, ...requirement.evidence.coSignatures.map(item => item.signerKeyId)]
  const subjects = [requirement.evidence.subject, ...requirement.evidence.coSignatures.map(item => item.subject)]
  invariant(!signers.includes(signerKeyId) && !subjects.includes(subject), 'External activation cosigner must be independent')
  const key = typeof privateKey === 'object' && privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'External activation cosigning key must be Ed25519')
  requirement.evidence.coSignatures.push({
    signerKeyId,
    subject,
    signature: sign(null, externalActivationPayload(requirement), key).toString('base64url'),
  })
  return requirement
}

function validateNpmRequirement(requirement, authority) {
  invariant(/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(requirement.packageName ?? ''), `External activation ${requirement.id} npm packageName is invalid`)
  invariant(requirement.registry === 'https://registry.npmjs.org', `External activation ${requirement.id} must use the canonical npm registry`)
  invariant(requirement.repository === authority.github, `External activation ${requirement.id} npm authority repository mismatch`)
  invariant(authority.publishes.includes(requirement.packageName), `External activation ${requirement.id} references a package outside the authority release train`)
  if (requirement.kind === 'npm-package-identity') {
    exactKeys(requirement.bootstrap, ['whenMissing', 'releaseVersionSource', 'consumerEligible'], `External activation ${requirement.id} bootstrap policy`)
    invariant(requirement.bootstrap.whenMissing === 'interactive-2fa-lower-non-consumed-version', `External activation ${requirement.id} bootstrap policy is not fail-closed`)
    invariant(typeof requirement.bootstrap.releaseVersionSource === 'string'
      && /^packages\/[a-z0-9][a-z0-9-]*\/package\.json#\/version$/.test(requirement.bootstrap.releaseVersionSource), `External activation ${requirement.id} release version source is invalid`)
    invariant(requirement.bootstrap.consumerEligible === false, `External activation ${requirement.id} bootstrap package may not be consumer-eligible`)
  }
  if (requirement.kind === 'npm-trusted-publisher') {
    exactKeys(requirement.trustedPublisher, ['provider', 'repository', 'workflow', 'environment', 'allowedActions', 'directPublishAllowed', 'exclusive'], `External activation ${requirement.id} trusted publisher`)
    invariant(requirement.trustedPublisher.provider === 'github-actions'
      && requirement.trustedPublisher.repository === authority.github
      && requirement.trustedPublisher.workflow === '.github/workflows/release.yml'
      && requirement.trustedPublisher.environment === 'npm-release', `External activation ${requirement.id} trusted publisher identity drifted`)
    invariant(Array.isArray(requirement.trustedPublisher.allowedActions)
      && requirement.trustedPublisher.allowedActions.length === 1
      && requirement.trustedPublisher.allowedActions[0] === 'npm stage publish', `External activation ${requirement.id} must allow only npm stage publish`)
    invariant(requirement.trustedPublisher.directPublishAllowed === false && requirement.trustedPublisher.exclusive === true, `External activation ${requirement.id} trusted publisher must be exclusive and stage-only`)
  }
  if (requirement.kind === 'npm-publishing-access') {
    exactKeys(requirement.publishingAccess, ['twoFactorMode', 'tokensAllowed', 'tokenClassesToRemove'], `External activation ${requirement.id} npm publishing access`)
    invariant(requirement.publishingAccess.twoFactorMode === 'require-2fa-and-disallow-tokens'
      && requirement.publishingAccess.tokensAllowed === false, `External activation ${requirement.id} npm publishing access is not tokenless 2FA`)
    const expected = ['automation', 'bypass-2fa', 'classic', 'granular']
    invariant(Array.isArray(requirement.publishingAccess.tokenClassesToRemove)
      && [...requirement.publishingAccess.tokenClassesToRemove].sort().join(',') === expected.join(','), `External activation ${requirement.id} npm token-removal classes are incomplete`)
  }
}

function expectedRequirementKeys(requirement) {
  const keys = [...BASE_KEYS]
  if (NPM_KINDS.has(requirement.kind)) keys.push(...NPM_KEYS)
  if (requirement.kind === 'npm-package-identity') keys.push('bootstrap')
  if (requirement.kind === 'npm-trusted-publisher') keys.push('trustedPublisher')
  if (requirement.kind === 'npm-publishing-access') keys.push('publishingAccess')
  if (requirement.kind === 'github-mutation-boundary') keys.push('mutationBoundaryContract')
  if (requirement.kind === 'managed-ci-attestation') keys.push('managedCiBindingContract')
  return keys
}

function exactClaimKeys(claims, expected, requirement) {
  exactKeys(claims, expected, `External activation ${requirement.id} observed resource`)
  assertNoEmbeddedSecrets(claims)
}

function managedCiValidationTreeIdentity(repoRoot) {
  const root = realpathSync(resolve(repoRoot))
  const records = []
  const visit = (absolute, relativePath) => {
    const info = lstatSync(absolute, { bigint: true })
    invariant(!info.isSymbolicLink(), `Managed CI validation context crosses a symbolic link:${relativePath}`)
    const kind = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : null
    invariant(kind !== null, `Managed CI validation context contains a special filesystem entry:${relativePath}`)
    if (kind === 'file') invariant(info.nlink === 1n, `Managed CI validation context contains a hard-linked file:${relativePath}`)
    records.push({
      path: relativePath,
      kind,
      dev: info.dev.toString(),
      ino: info.ino.toString(),
      mode: info.mode.toString(),
      nlink: info.nlink.toString(),
      size: info.size.toString(),
      mtimeNs: info.mtimeNs.toString(),
      ctimeNs: info.ctimeNs.toString(),
      sha256: kind === 'file' ? sha256(readFileSync(absolute)) : null,
    })
    invariant(records.length <= MANAGED_CI_VALIDATION_TREE_ENTRY_LIMIT, 'Managed CI validation context source tree exceeds the closed entry limit')
    if (kind !== 'directory') return
    for (const name of readdirSync(absolute).sort()) {
      visit(resolve(absolute, name), relativePath === '.' ? name : `${relativePath}/${name}`)
    }
  }
  visit(root, '.')
  return { root, digest: sha256(stableStringify(records, 0)) }
}

function managedCiCoreValidationDigest(managed) {
  return sha256(stableStringify({
    root: managed.root,
    planDigest: managed.planDigest,
    schemaDigest: managed.schemaDigest,
    workflowDigest: managed.workflow?.digest ?? null,
    activationTrustBundleDigest: managed.activationTrustBundle?.bindingDigest ?? null,
    checkoutDriftDigest: managed.activationTrustBundle?.checkoutDriftDigest ?? null,
    receiptDigest: managed.activationEvidence?.receiptDigest ?? null,
    coreActive: managed.coreActive,
    blockers: managed.blockers,
  }, 0))
}

function managedCiImmutableCoreJson(model, path, label) {
  invariant(model && typeof model === 'object' && !Array.isArray(model),
    `${label} immutable snapshot record is missing`)
  invariant(model.path === path
    && ['100644', '100755'].includes(model.mode)
    && /^[a-f0-9]{40}$/.test(model.blobSha ?? '')
    && /^[a-f0-9]{64}$/.test(model.sha256 ?? '')
    && Number.isSafeInteger(model.size)
    && Buffer.isBuffer(model.bytes)
    && model.bytes.length === model.size
    && model.bytes.length > 0
    && model.bytes.length <= MANAGED_CI_IMMUTABLE_MODEL_MAX_BYTES
    && model.sha256 === sha256(model.bytes),
  `${label} immutable bytes are missing or oversized`)
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(model.bytes)
  } catch {
    invariant(false, `${label} immutable bytes are not valid UTF-8`)
  }
  try {
    return JSON.parse(text)
  } catch {
    invariant(false, `${label} immutable bytes are not valid JSON`)
  }
}

function loadManagedCiValidationContext(context, { issuerRegistry, observedAt }) {
  let managed
  let runtimeProfile
  let assertSourceTreeCurrent = () => {}
  let sourceTreeDigest = null
  let immutableIssuerRegistry = null
  let immutableToolchainManifest = null
  if (context === undefined || context === null) {
    managed = loadManagedCiTrustedExecutionCore()
    runtimeProfile = readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json'))
  } else {
    const coreClosure = context.sourceTreeValidation === 'managed-ci-core-closure'
    const immutableCoreClosure = context.sourceTreeValidation === 'managed-ci-immutable-core-closure'
    exactKeys(
      context,
      immutableCoreClosure
        ? ['managedCore', 'sourceTreeValidation']
        : coreClosure
          ? ['repoRoot', 'runtimeProfile', 'sourceTreeValidation']
          : ['repoRoot', 'runtimeProfile'],
      'Managed CI validation context',
    )
    if (!immutableCoreClosure) {
      invariant(typeof context.repoRoot === 'string' && context.repoRoot.length > 0,
        'Managed CI validation context repoRoot is invalid')
    }
    if (immutableCoreClosure) {
      invariant(isManagedCiTrustedExecutionCore(context.managedCore),
        'Managed CI immutable validation context core is not branded by the trusted loader')
      managed = context.managedCore
      const models = managedCiImmutableValidationModels(managed)
      invariant(models.executorSourceCommit === managed.activationTrustBundle?.gitTree?.executorSourceCommit
        && models.executorSourceTree === managed.activationTrustBundle?.gitTree?.executorSourceTree,
      'Managed CI immutable validation models differ from the branded executor-source identity')
      runtimeProfile = managedCiImmutableCoreJson(
        models.runtimeProfile,
        managed.plan.trust.runtimeEvidencePolicyPath,
        'Managed CI runtime profile',
      )
      immutableIssuerRegistry = managedCiImmutableCoreJson(
        models.issuerRegistry,
        managed.plan.trust.issuerRegistryPath,
        'Managed CI issuer registry',
      )
      immutableToolchainManifest = managedCiImmutableCoreJson(
        models.providerCliToolchain,
        'infra/governance/providers/provider-cli-toolchain.json',
        'Managed CI provider CLI toolchain manifest',
      )
      sourceTreeDigest = managedCiCoreValidationDigest(managed)
      assertSourceTreeCurrent = () => {
        invariant(isManagedCiTrustedExecutionCore(managed)
          && managedCiCoreValidationDigest(managed) === sourceTreeDigest,
        'Branded immutable managed CI core closure changed while it was being verified')
      }
    } else if (coreClosure) {
      const root = realpathSync(resolve(context.repoRoot))
      managed = loadManagedCiTrustedExecutionCore({ repoRoot: root, now: observedAt })
      sourceTreeDigest = managedCiCoreValidationDigest(managed)
      assertSourceTreeCurrent = () => {
        const current = loadManagedCiTrustedExecutionCore({ repoRoot: root, now: observedAt })
        invariant(managedCiCoreValidationDigest(current) === sourceTreeDigest,
          'Managed CI core trust closure changed while it was being verified')
      }
    } else {
      const before = managedCiValidationTreeIdentity(context.repoRoot)
      sourceTreeDigest = before.digest
      const cached = managedCiValidationContextCache.get(context)
      if (cached?.root === before.root && cached.treeDigest === before.digest) {
        managed = cached.managed
      } else {
        managed = loadManagedCiTrustedExecutionCore({ repoRoot: before.root, now: observedAt })
        const after = managedCiValidationTreeIdentity(before.root)
        invariant(after.root === before.root && after.digest === before.digest, 'Managed CI validation context source tree changed while it was being verified')
        managedCiValidationContextCache.set(context, { root: before.root, treeDigest: before.digest, managed })
      }
      assertSourceTreeCurrent = () => {
        const after = managedCiValidationTreeIdentity(before.root)
        invariant(after.root === before.root && after.digest === before.digest, 'Managed CI validation context source tree changed while cached state was in use')
      }
    }
    if (!immutableCoreClosure) {
      runtimeProfile = clone(context.runtimeProfile)
      const rootedRuntimeProfile = readJson(resolve(managed.root, managed.plan.trust.runtimeEvidencePolicyPath))
      invariant(stableStringify(runtimeProfile, 0) === stableStringify(rootedRuntimeProfile, 0), 'Managed CI validation context runtime profile differs from its verified root')
    }
  }
  invariant(managed.coreActive === true
    && managed.active === false
    && managed.carrierValidated === false
    && Array.isArray(managed.blockers) && managed.blockers.length === 0
    && managed.activationTrustBundle?.lockCurrent === true
    && Array.isArray(managed.activationTrustBundle?.blockers) && managed.activationTrustBundle.blockers.length === 0,
  'Managed CI validation context is not a fully verified active state')
  const rootedIssuerRegistry = immutableIssuerRegistry
    ?? readJson(resolve(managed.root, managed.plan.trust.issuerRegistryPath))
  invariant(stableStringify(rootedIssuerRegistry, 0) === stableStringify(issuerRegistry, 0), 'Managed CI validation context issuer registry differs from its verified root')
  validateRuntimeProfile(runtimeProfile, {
    issuerRegistry,
    ...(immutableToolchainManifest === null ? {} : { toolchainManifest: immutableToolchainManifest }),
    now: observedAt,
  })
  return { managed, runtimeProfile, assertSourceTreeCurrent, sourceTreeDigest }
}

function validateObservedResource(requirement, claims, {
  activeProfileId,
  releaseAuthorization,
  issuerRegistry,
  inventory,
  desired,
  mutationBoundaryContract,
  observedAt,
  expiresAt,
  completionSignerKeyIds = new Set(),
  completionSignerSubjects = new Set(),
  managedCiValidationContext,
}) {
  const required = EVIDENCE_CONTRACTS[requirement.kind][1]
  exactClaimKeys(claims, required, requirement)
  const digestFields = fields => fields.forEach(field => invariant(SHA256.test(claims[field] ?? ''), `External activation ${requirement.id} claim ${field} must be a SHA-256`))
  if (requirement.kind === 'github-app') {
    const expected = deriveGithubAppActivationExpectations({ inventory, desired })
    exactKeys(claims.appIds, ['governanceCheckApp', 'governanceWriterApp'], `External activation ${requirement.id} App ids`)
    invariant(Number.isInteger(claims.appIds.governanceCheckApp) && claims.appIds.governanceCheckApp > 0
      && Number.isInteger(claims.appIds.governanceWriterApp) && claims.appIds.governanceWriterApp > 0
      && claims.appIds.governanceCheckApp !== claims.appIds.governanceWriterApp, `External activation ${requirement.id} App ids are invalid or collapsed`)
    invariant(stableStringify(claims.appIds, 0) === stableStringify(expected.appIds, 0),
      `External activation ${requirement.id} App ids differ from immutable desired integration identities`)
    exactKeys(claims.appConfigurations, GOVERNANCE_APP_INTEGRATIONS, `External activation ${requirement.id} App configurations`)
    invariant(stableStringify(claims.appConfigurations, 0) === stableStringify(expected.appConfigurations, 0)
      && claims.appConfigurationsDigest === expected.appConfigurationsDigest
      && claims.appConfigurationsDigest === sha256(stableStringify(claims.appConfigurations, 0)),
    `External activation ${requirement.id} App repository selection/permission configuration differs from immutable desired state`)
    exactKeys(claims.installationRepositoriesByIntegration, GOVERNANCE_APP_INTEGRATIONS, `External activation ${requirement.id} installation repositories`)
    invariant(stableStringify(claims.installationRepositoriesByIntegration, 0) === stableStringify(expected.installationRepositoriesByIntegration, 0),
      `External activation ${requirement.id} installation repository coverage differs from desired managed profiles`)
    invariant(claims.installationRepositoriesDigest === expected.installationRepositoriesDigest
      && claims.installationRepositoriesDigest === sha256(stableStringify(claims.installationRepositoriesByIntegration, 0)),
    `External activation ${requirement.id} installation repository digest mismatch`)
    invariant(stableStringify(claims.environmentSecretPlacements, 0) === stableStringify(expected.environmentSecretPlacements, 0),
      `External activation ${requirement.id} named-environment secret placements differ from desired managed profiles`)
    invariant(claims.environmentSecretPlacementsDigest === expected.environmentSecretPlacementsDigest
      && claims.environmentSecretPlacementsDigest === sha256(stableStringify(claims.environmentSecretPlacements, 0)),
    `External activation ${requirement.id} named-environment secret-placement digest mismatch`)
    invariant(Array.isArray(claims.nonEnvironmentGovernanceSecrets) && claims.nonEnvironmentGovernanceSecrets.length === 0
      && claims.nonEnvironmentGovernanceSecretsDigest === expected.nonEnvironmentGovernanceSecretsDigest
      && claims.nonEnvironmentGovernanceSecretsDigest === sha256(stableStringify(claims.nonEnvironmentGovernanceSecrets, 0)),
    `External activation ${requirement.id} repository/org governance-secret fallback is not canonically empty`)
    invariant(Array.isArray(claims.installationTokenProbes)
      && claims.installationTokenProbes.length === expected.installationProbeRoutes.length,
    `External activation ${requirement.id} installation token probes do not cover every named-environment credential placement`)
    const probes = claims.installationTokenProbes.map((probe, index) => {
      exactKeys(probe, [
        'credentialRepository', 'environment', 'integration', 'targetRepository', 'appId', 'installationId', 'credentialSource',
        'tokenMinted', 'installationRepositoryVerified', 'capability', 'repositorySelection', 'permissions', 'capabilityProbeSucceeded',
      ], `External activation ${requirement.id} installation token probe ${index}`)
      invariant(GOVERNANCE_APP_INTEGRATIONS.includes(probe.integration), `External activation ${requirement.id} installation token probe integration is invalid`)
      invariant(Number.isSafeInteger(probe.appId) && probe.appId === claims.appIds[probe.integration]
        && Number.isSafeInteger(probe.installationId) && probe.installationId > 0,
      `External activation ${requirement.id} installation token probe App/installation identity mismatch`)
      invariant(probe.credentialSource === 'named-environment-secrets'
        && probe.tokenMinted === true
        && probe.installationRepositoryVerified === true
        && probe.capability === expected.integrations[probe.integration].capability
        && probe.repositorySelection === expected.appConfigurations[probe.integration].repositorySelection
        && stableStringify(probe.permissions, 0) === stableStringify(expected.appConfigurations[probe.integration].permissions, 0)
        && probe.capabilityProbeSucceeded === true,
      `External activation ${requirement.id} named-environment token mint/installation capability probe failed`)
      return probe
    }).sort((left, right) => (
      compareCodepoints(left.credentialRepository, right.credentialRepository)
        || compareCodepoints(left.environment, right.environment)
        || compareCodepoints(left.integration, right.integration)
        || compareCodepoints(left.targetRepository, right.targetRepository)
    ))
    invariant(new Set(probes.map(probe => (
      `${probe.credentialRepository}\0${probe.environment}\0${probe.integration}\0${probe.targetRepository}`
    ))).size === probes.length,
    `External activation ${requirement.id} installation token probe routes are duplicated`)
    const probeRoutes = probes.map(probe => ({
      credentialRepository: probe.credentialRepository,
      environment: probe.environment,
      integration: probe.integration,
      targetRepository: probe.targetRepository,
    }))
    invariant(stableStringify(probeRoutes, 0) === stableStringify(expected.installationProbeRoutes, 0),
      `External activation ${requirement.id} installation token probes are not bound to the exact credential-to-installation topology`)
    invariant(claims.installationTokenProbesDigest === sha256(stableStringify(probes, 0)),
      `External activation ${requirement.id} installation token probe digest mismatch`)
  }
  if (requirement.kind === 'github-repository') {
    digestFields(['rulesetsDigest', 'requiredChecksDigest', 'tagObjectVerificationDigest'])
    invariant(claims.immutableReleases === true, `External activation ${requirement.id} immutable releases are not enabled`)
  }
  if (requirement.kind === 'github-token-permission') {
    invariant(typeof claims.tokenFingerprint === 'string' && claims.tokenFingerprint.length >= 12, `External activation ${requirement.id} token fingerprint is invalid`)
    invariant(Array.isArray(claims.permissions) && claims.permissions.length > 0, `External activation ${requirement.id} read permissions are missing`)
    invariant(Array.isArray(claims.writePermissions) && claims.writePermissions.length === 0, `External activation ${requirement.id} observation token has write permission`)
  }
  if (requirement.kind === 'github-mutation-boundary') {
    digestFields(GITHUB_MUTATION_BOUNDARY_CLAIM_KEYS)
    invariant(claims.projectionContractDigest === GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST
      && claims.projectionContractDigest === requirement.mutationBoundaryContract.sha256, `External activation ${requirement.id} mutation-boundary projection contract digest mismatch`)
    invariant(claims.bypassActorsDigest === GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST, `External activation ${requirement.id} does not prove the canonical empty bypass-actor set`)
    const scope = requirement.repository === mutationBoundaryContract.scope.source.repository ? 'source' : 'target'
    const desiredBinding = mutationBoundaryContract.desiredBindings[scope]
    for (const field of [
      'normalizedRulesetsDigest', 'requiredChecksDigest', 'actionsWorkflowPermissionsDigest',
      'repositoryIdentityDefaultBranchDigest', 'environmentPolicyDigest',
    ]) invariant(claims[field] === desiredBinding[field], `External activation ${requirement.id} ${field} differs from the reviewed desired binding`)
    if (requirement.repository === 'ajenchen/ds-product-template') {
      invariant(claims.environmentPolicyDigest === GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST, `External activation ${requirement.id} target environment policy must be canonical null`)
    } else {
      invariant(claims.environmentPolicyDigest !== GITHUB_MUTATION_BOUNDARY_NULL_ENVIRONMENT_POLICY_DIGEST, `External activation ${requirement.id} governance-mirror environment policy must not be canonical null`)
    }
  }
  if (requirement.kind === 'managed-host-policy') {
    invariant(['claude-code', 'codex'].includes(claims.provider), `External activation ${requirement.id} managed-host provider is invalid`)
    invariant(typeof claims.winningSource === 'string' && claims.winningSource.length > 0, `External activation ${requirement.id} winning managed source is missing`)
    digestFields(['policyDigest', 'bundleDigest', 'activationProofDigest'])
  }
  if (requirement.kind === 'release-authorization') {
    const minimumQuorum = releaseAuthorization.minimumSignerQuorum
    const maximumQuorum = releaseAuthorization.maximumSignerQuorum
    invariant(Array.isArray(claims.allowedKeyIds)
      && claims.allowedKeyIds.length >= minimumQuorum
      && new Set(claims.allowedKeyIds).size === claims.allowedKeyIds.length,
    `External activation ${requirement.id} release authorizer set is invalid for ${activeProfileId}`)
    invariant(Number.isInteger(claims.quorum)
      && claims.quorum >= minimumQuorum
      && claims.quorum <= maximumQuorum
      && claims.quorum <= claims.allowedKeyIds.length,
    `External activation ${requirement.id} release authorization quorum is invalid for ${activeProfileId}`)
    invariant(claims.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry), `External activation ${requirement.id} release issuer registry digest mismatch`)
  }
  if (requirement.kind === 'npm-package-identity') {
    invariant(claims.packageName === requirement.packageName && claims.registry === requirement.registry && claims.visibility === 'public', `External activation ${requirement.id} npm package identity mismatch`)
    invariant(typeof claims.bootstrapVersion === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(claims.bootstrapVersion), `External activation ${requirement.id} npm bootstrap version is invalid`)
    invariant(claims.consumerEligible === false, `External activation ${requirement.id} npm bootstrap became consumer eligible`)
  }
  if (requirement.kind === 'npm-trusted-publisher') {
    invariant(claims.packageName === requirement.packageName
      && claims.registry === requirement.registry
      && claims.repository === requirement.repository
      && claims.workflow === requirement.trustedPublisher.workflow
      && claims.environment === requirement.trustedPublisher.environment
      && stableStringify(claims.allowedActions, 0) === stableStringify(requirement.trustedPublisher.allowedActions, 0)
      && claims.exclusive === true, `External activation ${requirement.id} npm trusted publisher readback mismatch`)
  }
  if (requirement.kind === 'npm-publishing-access') {
    invariant(claims.packageName === requirement.packageName
      && claims.registry === requirement.registry
      && claims.twoFactorMode === requirement.publishingAccess.twoFactorMode
      && claims.tokensAllowed === false
      && Array.isArray(claims.remainingPublishTokenIds)
      && claims.remainingPublishTokenIds.length === 0, `External activation ${requirement.id} npm publishing access is not tokenless`)
  }
  if (requirement.kind === 'durable-evidence-mirror') {
    invariant(typeof claims.provider === 'string' && claims.provider.length > 0 && typeof claims.receiptId === 'string' && claims.receiptId.length > 0, `External activation ${requirement.id} off-host mirror identity is missing`)
    invariant(claims.protocolVersion === 'fleet-reconcile-mirror-v1', `External activation ${requirement.id} off-host mirror protocol is invalid`)
    let endpoint
    try { endpoint = new URL(claims.endpoint) } catch { endpoint = null }
    invariant(endpoint?.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, `External activation ${requirement.id} off-host endpoint is not a canonical authenticated HTTPS origin/path`)
    invariant(typeof claims.tenant === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(claims.tenant), `External activation ${requirement.id} off-host tenant is invalid`)
    invariant(typeof claims.container === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(claims.container), `External activation ${requirement.id} off-host container is invalid`)
    invariant(claims.wormMode === 'compliance-object-lock', `External activation ${requirement.id} off-host WORM mode is not compliance locked`)
    digestFields(['lifecyclePolicyDigest', 'adapterCommandSha256', 'receiptSigningPublicKeySpkiSha256', 'eventHeadDigest', 'receiptSha256'])
    invariant(Number.isInteger(claims.minimumRetentionDays) && claims.minimumRetentionDays >= 30 && claims.minimumRetentionDays <= 3650, `External activation ${requirement.id} minimum retention is invalid`)
    invariant(typeof claims.writerPrincipal === 'string' && claims.writerPrincipal.length > 0
      && typeof claims.verifierPrincipal === 'string' && claims.verifierPrincipal.length > 0
      && claims.writerPrincipal !== claims.verifierPrincipal, `External activation ${requirement.id} mirror writer and verifier principals are not distinct`)
    invariant(typeof claims.receiptSigningKeyId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(claims.receiptSigningKeyId)
      && claims.signatureAlgorithm === 'ed25519', `External activation ${requirement.id} receipt signing identity is invalid`)
    invariant(typeof claims.receiptSigningPublicKeySpki === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(claims.receiptSigningPublicKeySpki), `External activation ${requirement.id} receipt signing key encoding is invalid`)
    const publicKeyBytes = Buffer.from(claims.receiptSigningPublicKeySpki, 'base64')
    invariant(publicKeyBytes.toString('base64') === claims.receiptSigningPublicKeySpki
      && sha256(publicKeyBytes) === claims.receiptSigningPublicKeySpkiSha256, `External activation ${requirement.id} receipt signing key digest mismatch`)
    let publicKey
    try { publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' }) } catch { publicKey = null }
    invariant(publicKey?.asymmetricKeyType === 'ed25519', `External activation ${requirement.id} receipt signing key is not Ed25519`)
    const retentionUntil = canonicalDate(claims.retentionUntil, `External activation ${requirement.id} retentionUntil`)
    invariant(retentionUntil >= expiresAt
      && retentionUntil.getTime() - observedAt.getTime() >= claims.minimumRetentionDays * 86_400_000, `External activation ${requirement.id} off-host retention is shorter than the signed minimum`)
    invariant(claims.appendOnly === true && claims.independentAdministration === true, `External activation ${requirement.id} mirror is not independent append-only storage`)
  }
  if (requirement.kind === 'rollback-drill') {
    invariant(typeof claims.transactionId === 'string' && claims.transactionId.length > 0, `External activation ${requirement.id} rollback transaction id is missing`)
    digestFields(['eventHeadDigest', 'authorizationDigest', 'postRollbackStateDigest', 'offHostReceiptDigest'])
    invariant(claims.beforeImageRestored === true, `External activation ${requirement.id} rollback did not restore the exact before-image`)
  }
  if (requirement.kind === 'managed-ci-attestation') {
    let managed
    let runtimeProfile
    let assertSourceTreeCurrent
    let sourceTreeDigest
    try {
      ({ managed, runtimeProfile, assertSourceTreeCurrent, sourceTreeDigest } = loadManagedCiValidationContext(managedCiValidationContext, { issuerRegistry, observedAt }))
    } catch (error) {
      invariant(false, `External activation ${requirement.id} cannot activate an unverified managed CI plan: ${error.message}`)
    }
    const observedResourceCacheKey = sourceTreeDigest === null ? null : sha256(stableStringify({
      requirementId: requirement.id,
      claims,
      issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
      runtimeProfileDigest: sha256(stableStringify(runtimeProfile, 0)),
      observedAt: observedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completionSignerKeyIds: [...completionSignerKeyIds].sort(),
      completionSignerSubjects: [...completionSignerSubjects].sort(),
      managedPlanDigest: managed.planDigest,
      sourceTreeDigest,
    }, 0))
    if (observedResourceCacheKey !== null && managedCiObservedResourceValidationCache.has(observedResourceCacheKey)) {
      assertSourceTreeCurrent()
      return
    }
    const exactDigestMap = (value, keys, label, image = false) => {
      exactKeys(value, keys, `External activation ${requirement.id} ${label}`)
      for (const key of keys) {
        const pattern = image ? /^sha256:[a-f0-9]{64}$/ : SHA256
        invariant(pattern.test(value[key] ?? ''), `External activation ${requirement.id} ${label}.${key} is invalid`)
      }
    }
    digestFields([
      'planDigest', 'planSchemaDigest', 'workflowIdentityDigest', 'activationTrustBundleDigest',
      'governanceManifestDigest', 'controlPlaneLockDigest', 'workflowDispatchInputsDigest',
      'provenanceBindingDigest', 'trustProfileDigest',
      'issuerRegistryDigest', 'runtimePolicyDigest', 'providerEgressRegistryDigest',
      'providerEgressProfilesDigest', 'readbackReceiptDigest',
      'finalizationRequestDigest', 'finalizationRawReceiptSetDigest',
      'finalizationReceiptSetDigest', 'finalizationTransportReadbackDigest',
    ])
    invariant(claims.planDigest === managed.planDigest && claims.planSchemaDigest === managed.schemaDigest
      && claims.workflowIdentityDigest === managed.workflow.workflowIdentityDigest
      && claims.trustProfileDigest === managed.trust.digest, `External activation ${requirement.id} managed plan/workflow/trust binding drifted`)
    const activationTrust = managed.activationTrustBundle
    exactDigestMap(claims.activationTrustFileDigests, activationTrust.files.map(item => item.id), 'activationTrustFileDigests')
    invariant(activationTrust.lockCurrent === true
      && claims.activationTrustBundleDigest === activationTrust.bindingDigest
      && stableStringify(claims.activationTrustFileDigests, 0) === stableStringify(activationTrust.fileDigests, 0)
      && claims.governanceManifestDigest === activationTrust.manifest.sha256
      && claims.controlPlaneLockDigest === activationTrust.controlPlaneLock.sha256
      && claims.controlPlaneContractDigest === activationTrust.controlPlaneLock.contractDigest
      && claims.controlPlaneInputDigest === activationTrust.controlPlaneLock.inputDigest
      && claims.controlPlaneSnapshotDigest === activationTrust.controlPlaneLock.snapshotDigest
      && claims.controlPlaneManifestId === activationTrust.controlPlaneLock.manifestId
      && /^sha256:[a-f0-9]{64}$/.test(claims.controlPlaneContractDigest ?? '')
      && /^sha256:[a-f0-9]{64}$/.test(claims.controlPlaneInputDigest ?? '')
      && /^sha256:[a-f0-9]{64}$/.test(claims.controlPlaneSnapshotDigest ?? ''), `External activation ${requirement.id} activation trust/control-plane lock binding drifted`)
    invariant(claims.workflowRepository === managed.plan.workflow.repository
      && claims.workflowPath === managed.plan.workflow.path
      && claims.workflowRef === managed.plan.workflow.ref
      && claims.workflowEvent === managed.plan.workflow.event
      && claims.runnerEnvironment === managed.plan.workflow.runnerEnvironment, `External activation ${requirement.id} workflow execution identity drifted`)
    invariant(claims.workflowDefinitionRef === managedCiWorkflowDefinitionRef(managed)
      && /^[a-f0-9]{40}$/.test(claims.workflowDefinitionTree ?? '')
      && claims.workflowDefinitionProtectedMain === true, `External activation ${requirement.id} protected-main workflow-definition provenance is invalid`)
    let expectedFrozenSubject
    try {
      expectedFrozenSubject = managedCiExpectedFrozenSubjectArtifactBinding(managed, {
        ...claims.frozenSubjectArtifactBinding,
        subjectCommit: claims.auditedSubjectCommit,
        subjectTree: claims.auditedSubjectTree,
        freezeRunId: claims.auditedSubjectRunId,
        manifestSha256: claims.auditedManifestSha256,
        workflowDefinitionCommit: claims.workflowDefinitionCommit,
        workflowDefinitionTree: claims.workflowDefinitionTree,
        workflowRunId: claims.workflowRunId,
        runAttempt: claims.runAttempt,
      })
    } catch (error) {
      invariant(false, `External activation ${requirement.id} frozen subject artifact/manifest lineage is invalid: ${error.message}`)
    }
    invariant(stableStringify(claims.frozenSubjectArtifactBinding, 0) === stableStringify(expectedFrozenSubject, 0), `External activation ${requirement.id} frozen subject artifact identity/bytes/lineage drifted`)
    let provenance
    try {
      provenance = managedCiProvenanceBinding(managed, {
        workflowDefinitionRef: claims.workflowDefinitionRef,
        workflowDefinitionCommit: claims.workflowDefinitionCommit,
        workflowDefinitionTree: claims.workflowDefinitionTree,
        workflowRunId: claims.workflowRunId,
        runAttempt: claims.runAttempt,
        subjectCommit: claims.auditedSubjectCommit,
        subjectTree: claims.auditedSubjectTree,
        manifestSha256: claims.auditedManifestSha256,
        subjectRunId: claims.auditedSubjectRunId,
        frozenSubject: claims.frozenSubjectArtifactBinding,
      })
    } catch (error) {
      invariant(false, `External activation ${requirement.id} workflow-definition/audited-subject provenance is invalid: ${error.message}`)
    }
    invariant(provenance.workflowRepository === claims.workflowRepository
      && provenance.workflowPath === claims.workflowPath
      && provenance.workflowRef === claims.workflowRef
      && provenance.workflowEvent === claims.workflowEvent
      && provenance.runnerEnvironment === claims.runnerEnvironment
      && provenance.workflowIdentityDigest === claims.workflowIdentityDigest
      && provenance.workflowDefinitionTree === claims.workflowDefinitionTree
      && provenance.workflowRunId === claims.workflowRunId
      && provenance.runAttempt === claims.runAttempt
      && provenance.frozenSubjectArtifactName === expectedFrozenSubject.artifactName
      && provenance.frozenSubjectArtifactId === expectedFrozenSubject.artifactId
      && provenance.frozenSubjectArtifactLocator === expectedFrozenSubject.artifactStorageLocator
      && provenance.frozenSubjectArtifactSha256 === expectedFrozenSubject.artifactSha256
      && provenance.frozenSubjectArtifactSize === expectedFrozenSubject.artifactSize
      && provenance.frozenSubjectManifestBytesSha256 === expectedFrozenSubject.manifestBytesSha256
      && provenance.frozenSubjectLineageDigest === expectedFrozenSubject.lineageDigest
      && provenance.activationTrustBundleDigest === claims.activationTrustBundleDigest
      && provenance.governanceManifestDigest === claims.governanceManifestDigest
      && provenance.controlPlaneLockDigest === claims.controlPlaneLockDigest
      && provenance.controlPlaneContractDigest === claims.controlPlaneContractDigest
      && provenance.controlPlaneInputDigest === claims.controlPlaneInputDigest
      && provenance.controlPlaneSnapshotDigest === claims.controlPlaneSnapshotDigest
      && provenance.controlPlaneManifestId === claims.controlPlaneManifestId, `External activation ${requirement.id} full provenance projection differs from repository/workflow/activation trust readback`)
    invariant(claims.workflowDispatchInputsDigest === provenance.workflowDispatchInputsDigest
      && claims.provenanceBindingDigest === provenance.provenanceBindingDigest, `External activation ${requirement.id} dispatch/provenance binding digest drifted`)
    invariant(typeof claims.workflowRunId === 'string' && /^[1-9][0-9]*$/.test(claims.workflowRunId)
      && Number.isSafeInteger(claims.runAttempt) && claims.runAttempt >= 1, `External activation ${requirement.id} workflow run identity is invalid`)
    invariant(claims.bootstrapMode === 'protected-main-control-plane-only'
      && claims.releaseMutationsObserved === false
      && claims.candidateSelfCertificationAllowed === false, `External activation ${requirement.id} is not a release-free two-PR bootstrap`)
    const protectedMainMergedAt = canonicalDate(claims.protectedMainMergedAt, `External activation ${requirement.id} protectedMainMergedAt`)
    invariant(protectedMainMergedAt <= observedAt, `External activation ${requirement.id} was observed before its protected-main control-plane merge`)
    const classEntries = [...managed.classes.entries()]
    const classValue = field => Object.fromEntries(classEntries.map(([id, value]) => [id, value[field]]))
    const candidateBoundary = managed.trustedAuthority?.policy?.candidateBoundary
    invariant(stableStringify(candidateBoundary?.jobs, 0) === stableStringify(MANAGED_CI_CLASSES, 0)
      && candidateBoundary.idTokenPermission === 'none'
      && candidateBoundary.executesCandidateCode === true
      && candidateBoundary.credentials === 'none-secretless-egress-proxy-only'
      && MANAGED_CI_CLASSES.every(id => managed.classes.get(id)?.executionClass?.permissions?.['id-token'] === 'none')
      && ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'receipt-signer-binary', 'secret-broker-binary', 'secret-broker-credential', 'sandbox-daemon-socket', 'container-engine-socket', 'host-parent-proc'].every(item => candidateBoundary.prohibitedExposures?.includes(item))
      && candidateBoundary.processBoundary?.procMode === 'private-hidepid2'
      && candidateBoundary.processBoundary?.hostPid === false
      && candidateBoundary.processBoundary?.parentEnvironmentReadable === false, `External activation ${requirement.id} candidate jobs can access an OIDC/signer/broker/credential/host capability`)
    exactDigestMap(claims.executionClassProfileDigests, MANAGED_CI_CLASSES, 'executionClassProfileDigests')
    exactDigestMap(claims.containerImageDigests, MANAGED_CI_CLASSES, 'containerImageDigests', true)
    exactDigestMap(claims.networkPolicyDigests, MANAGED_CI_CLASSES, 'networkPolicyDigests')
    exactDigestMap(claims.isolationPolicyDigests, MANAGED_CI_CLASSES, 'isolationPolicyDigests')
    exactDigestMap(claims.permissionsDigests, MANAGED_CI_CLASSES, 'permissionsDigests')
    exactDigestMap(claims.executionClassControlPlaneBundleDigests, MANAGED_CI_CLASSES, 'executionClassControlPlaneBundleDigests')
    exactDigestMap(claims.executionClassReceiptDigests, MANAGED_CI_CLASSES, 'executionClassReceiptDigests')
    exactDigestMap(claims.executionClassEvidenceEnvelopeDigests, MANAGED_CI_CLASSES, 'executionClassEvidenceEnvelopeDigests')
    exactDigestMap(claims.executionClassGeneratedOutputClosureDigests, MANAGED_CI_CLASSES, 'executionClassGeneratedOutputClosureDigests')
    exactDigestMap(claims.executionClassReceiptProvenanceDigests, MANAGED_CI_CLASSES, 'executionClassReceiptProvenanceDigests')
    exactDigestMap(claims.executionClassOidcClaimsDigests, MANAGED_CI_CLASSES, 'executionClassOidcClaimsDigests')
    exactDigestMap(claims.executionClassOidcProvenanceDigests, MANAGED_CI_CLASSES, 'executionClassOidcProvenanceDigests')
    exactDigestMap(claims.executionClassRawReceiptValidationDigests, MANAGED_CI_CLASSES, 'executionClassRawReceiptValidationDigests')
    exactKeys(claims.executionClassOidcClaimProjections, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassOidcClaimProjections`)
    invariant(MANAGED_CI_CLASSES.every(id => claims.executionClassControlPlaneBundleDigests[id] === activationTrust.bindingDigest), `External activation ${requirement.id} container images do not embed the exact activation trust bundle`)
    invariant(stableStringify(claims.executionClassProfileDigests, 0) === stableStringify(classValue('profileDigest'), 0)
      && stableStringify(claims.containerImageDigests, 0) === stableStringify(classValue('containerImageDigest'), 0)
      && stableStringify(claims.networkPolicyDigests, 0) === stableStringify(classValue('networkPolicyCatalogDigest'), 0)
      && stableStringify(claims.isolationPolicyDigests, 0) === stableStringify(classValue('isolationPolicyDigest'), 0)
      && stableStringify(claims.permissionsDigests, 0) === stableStringify(classValue('permissionsDigest'), 0), `External activation ${requirement.id} execution-class bindings drifted`)
    let expectedSignerAuthority
    try { expectedSignerAuthority = managedCiExpectedReceiptSignerAuthorityBinding(managed) } catch (error) {
      invariant(false, `External activation ${requirement.id} receipt signer authority cannot be derived: ${error.message}`)
    }
    invariant(stableStringify(claims.receiptSignerAuthorityBinding, 0) === stableStringify(expectedSignerAuthority, 0), `External activation ${requirement.id} receipt signer service/tenant/key/certificate/endpoint/OIDC/workflow/environment/schema/audit policy drifted`)
    exactKeys(claims.receiptSignerIssuerMapping, [
      'issuerKeyId', 'issuerSubject', 'issuerRegistryDigest', 'issuerRole', 'keyIdentity', 'certificateIdentity',
    ], `External activation ${requirement.id} receipt signer issuer mapping`)
    const signerIssuer = resolvePolicyIssuer(runtimeProfile, issuerRegistry, claims.receiptSignerIssuerMapping.issuerKeyId, {
      role: expectedSignerAuthority.issuerRole,
      at: observedAt,
      validThrough: expiresAt,
    })
    invariant(claims.receiptSignerIssuerMapping.issuerRegistryDigest === claims.issuerRegistryDigest
      && claims.receiptSignerIssuerMapping.issuerRole === expectedSignerAuthority.issuerRole
      && claims.receiptSignerIssuerMapping.keyIdentity === expectedSignerAuthority.keyIdentity
      && claims.receiptSignerIssuerMapping.certificateIdentity === expectedSignerAuthority.certificateIdentity
      && claims.receiptSignerIssuerMapping.issuerSubject === expectedSignerAuthority.certificateIdentity
      && signerIssuer.subject === claims.receiptSignerIssuerMapping.issuerSubject, `External activation ${requirement.id} receipt signer identity is not exactly mapped through the runtime issuer registry`)
    exactKeys(claims.executionClassSignerAuditEvents, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassSignerAuditEvents`)
    exactKeys(claims.executionClassRawReceiptValidationReadbacks, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassRawReceiptValidationReadbacks`)
    exactKeys(claims.executionClassReceiptSigningPayloads, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassReceiptSigningPayloads`)
    const signerAuthorityBindingDigest = expectedSignerAuthority.bindingDigest
    const signerIssuerMappingDigest = sha256(stableStringify(claims.receiptSignerIssuerMapping, 0))
    const signerEventIds = new Set()
    let latestSignerSignedAt = null
    for (const executionClass of MANAGED_CI_CLASSES) {
      const event = claims.executionClassSignerAuditEvents[executionClass]
      const rawReceiptValidationReadback = claims.executionClassRawReceiptValidationReadbacks[executionClass]
      const receiptSigningPayload = claims.executionClassReceiptSigningPayloads[executionClass]
      exactKeys(receiptSigningPayload, [
        'schemaVersion', 'kind', 'executionClass', 'evidenceKind', 'workflowRunId', 'runAttempt',
        'rawReceiptDigest', 'rawReceiptSchemaDigest', 'rawReceiptValidationDigest',
        'provenanceBindingDigest', 'receiptBindingDigest',
        'frozenSubjectReadbackDigest', 'hostObservationReceiptDigest', 'imageSupplyChainBindingDigest',
        'signerAuthorityBindingDigest', 'issuerMappingDigest', 'signedAt',
      ], `External activation ${requirement.id} ${executionClass} finalized receipt signing payload`)
      exactKeys(event, [
        'eventId', 'tenantId', 'keyIdentity', 'policyDigest', 'payloadDigest', 'signature',
        'workflowRunId', 'runAttempt', 'environment', 'signedAt', 'executionClass',
        'rawReceiptDigest', 'signerAuthorityBindingDigest', 'issuerMappingDigest',
      ], `External activation ${requirement.id} ${executionClass} signer audit event`)
      let expectedReceiptSigningPayload
      let expectedSignerAuditEvent
      try {
        const selectedProvider = executionClass === 'model-broker'
          ? claims.modelReleaseAuthorityBinding.modelReleaseId.split('/', 1)[0]
          : null
        const modelRelease = executionClass === 'model-broker' ? claims.modelReleaseAuthorityBinding : null
        const receiptBinding = managedCiExpectedReceiptBinding(managed, {
          evidenceKind: receiptSigningPayload.evidenceKind,
          selectedProvider,
          modelRelease,
          // This is the one non-circular carrier-activation path. `managed`
          // is a branded immutable core revalidated by
          // loadManagedCiValidationContext; ordinary callers still require a
          // fully activated carrier.
          allowTrustedActivationCore: true,
        })
        expectedReceiptSigningPayload = managedCiVerifyReceiptSigningPayloadProjection(managed, {
          receiptSigningPayload,
          rawReceiptValidationReadback,
          evidenceKind: receiptSigningPayload.evidenceKind,
          workflowRunId: claims.workflowRunId,
          runAttempt: claims.runAttempt,
          provenanceBinding: provenance,
          receiptBinding,
          frozenSubjectReadback: claims.executionClassFrozenSubjectReadbacks[executionClass],
          hostObservation: claims.executionClassHostSandboxReadbacks[executionClass],
          imageSupplyChainBinding: claims.executionClassImageSupplyChainBindings[executionClass],
          issuerMapping: claims.receiptSignerIssuerMapping,
          rawReceiptProjection: {
            evidenceEnvelopeDigest: claims.executionClassEvidenceEnvelopeDigests[executionClass],
            oidcClaimsDigest: claims.executionClassOidcClaimsDigests[executionClass],
            generatedOutputClosureDigest: claims.executionClassGeneratedOutputClosureDigests[executionClass],
          },
          signedAt: receiptSigningPayload.signedAt,
          selectedProvider,
          modelRelease,
          allowTrustedActivationCore: true,
        })
        expectedSignerAuditEvent = managedCiSignerAuditEvent(managed, {
          eventId: event.eventId,
          signature: event.signature,
          receiptSigningPayload: expectedReceiptSigningPayload,
          issuerMapping: claims.receiptSignerIssuerMapping,
        })
      } catch (error) {
        invariant(false, `External activation ${requirement.id} ${executionClass} finalized receipt/signature/audit readback is invalid: ${error.message}`)
      }
      invariant(stableStringify(receiptSigningPayload, 0) === stableStringify(expectedReceiptSigningPayload, 0), `External activation ${requirement.id} ${executionClass} signer payload is detached from raw receipt/schema/provenance/class/image/freeze/host/model authority`)
      invariant(rawReceiptValidationReadback.rawReceiptDigest === claims.executionClassReceiptDigests[executionClass]
        && rawReceiptValidationReadback.evidenceEnvelopeDigest === claims.executionClassEvidenceEnvelopeDigests[executionClass]
        && rawReceiptValidationReadback.oidcClaimsDigest === claims.executionClassOidcClaimsDigests[executionClass]
        && rawReceiptValidationReadback.generatedOutputClosureDigest === claims.executionClassGeneratedOutputClosureDigests[executionClass]
        && receiptSigningPayload.rawReceiptValidationDigest === claims.executionClassRawReceiptValidationDigests[executionClass]
        && receiptSigningPayload.rawReceiptValidationDigest === sha256(stableStringify(rawReceiptValidationReadback, 0)),
      `External activation ${requirement.id} ${executionClass} raw receipt validation readback is detached from bytes/signer payload`)
      invariant(rawReceiptValidationReadback.verifiedIssuerKeyIds.every(keyId => !completionSignerKeyIds.has(keyId))
        && rawReceiptValidationReadback.verifiedIssuerSubjects.every(subject => !completionSignerSubjects.has(subject)),
      `External activation ${requirement.id} ${executionClass} raw receipt issuer is not independent of the completion attestor`)
      invariant(stableStringify(event, 0) === stableStringify(expectedSignerAuditEvent, 0), `External activation ${requirement.id} ${executionClass} signer audit event/signature is detached from the canonical finalized receipt payload`)
      invariant(typeof event.eventId === 'string' && /^[A-Za-z0-9._:-]{8,256}$/.test(event.eventId)
        && !signerEventIds.has(event.eventId), `External activation ${requirement.id} signer audit event id is invalid or replayed`)
      signerEventIds.add(event.eventId)
      invariant(event.executionClass === executionClass
        && event.tenantId === expectedSignerAuthority.tenantId
        && event.keyIdentity === expectedSignerAuthority.keyIdentity
        && event.policyDigest === expectedSignerAuthority.receiptSignerPolicyDigest
        && event.workflowRunId === claims.workflowRunId
        && event.runAttempt === claims.runAttempt
        && event.environment === expectedSignerAuthority.allowedEnvironment
        && event.rawReceiptDigest === claims.executionClassReceiptDigests[executionClass]
        && event.signerAuthorityBindingDigest === signerAuthorityBindingDigest
        && event.issuerMappingDigest === signerIssuerMappingDigest, `External activation ${requirement.id} ${executionClass} signer audit event is detached from the authority/policy/run/raw receipt`)
      const signedAt = canonicalDate(event.signedAt, `External activation ${requirement.id} ${executionClass} signer audit signedAt`)
      invariant(signedAt <= new Date(observedAt.getTime() + managed.plan.observation.clockSkewSeconds * 1000)
        && observedAt.getTime() - signedAt.getTime() <= (managed.plan.observation.maxAgeSeconds + managed.plan.observation.clockSkewSeconds) * 1000, `External activation ${requirement.id} ${executionClass} signer audit event is future or stale`)
      if (latestSignerSignedAt === null || signedAt > latestSignerSignedAt) latestSignerSignedAt = signedAt
    }
    let finalizationReceiptSet
    try {
      const transportContract = managedCiExpectedFinalizationTransportContract(managed)
      invariant(
        claims.finalizationTransportReadback.transportContractDigest === sha256(stableStringify(transportContract, 0)),
        `External activation ${requirement.id} finalization transport contract digest drifted`,
      )
      finalizationReceiptSet = managedCiFinalizedReceiptSetProjection(claims)
      invariant(
        finalizationReceiptSet.rawReceiptSetDigest === claims.finalizationRawReceiptSetDigest
          && finalizationReceiptSet.requestSha256 === claims.finalizationRequestDigest
          && managedCiFinalizedReceiptSetDigest(finalizationReceiptSet) === claims.finalizationReceiptSetDigest,
        `External activation ${requirement.id} finalized receipt set is detached from the request/raw receipt set/four-class closure`,
      )
      managedCiValidateFinalizationTransportReadback(managed, claims.finalizationTransportReadback, {
        requestSha256: claims.finalizationRequestDigest,
        finalizedReceiptSetDigest: claims.finalizationReceiptSetDigest,
        latestSignedAt: latestSignerSignedAt.toISOString(),
        signerIssuerMapping: claims.receiptSignerIssuerMapping,
      })
      invariant(
        managedCiFinalizationTransportReadbackDigest(claims.finalizationTransportReadback)
          === claims.finalizationTransportReadbackDigest,
        `External activation ${requirement.id} finalization transport readback digest is detached`,
      )
    } catch (error) {
      invariant(false, `External activation ${requirement.id} finalization request/receipt-set/two-hop transport closure is invalid: ${error.message}`)
    }
    const finalizationTransportObservedAt = canonicalDate(
      claims.finalizationTransportReadback.observedAt,
      `External activation ${requirement.id} finalization transport observedAt`,
    )
    invariant(
      finalizationTransportObservedAt <= new Date(observedAt.getTime() + managed.plan.observation.clockSkewSeconds * 1000)
        && observedAt.getTime() - finalizationTransportObservedAt.getTime()
          <= (managed.plan.observation.maxAgeSeconds + managed.plan.observation.clockSkewSeconds) * 1000,
      `External activation ${requirement.id} finalization transport readback is future or stale`,
    )
    exactKeys(claims.executionClassImageSupplyChainBindings, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassImageSupplyChainBindings`)
    exactKeys(claims.executionClassHostSandboxReadbacks, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassHostSandboxReadbacks`)
    exactKeys(claims.executionClassFrozenSubjectReadbacks, MANAGED_CI_CLASSES, `External activation ${requirement.id} executionClassFrozenSubjectReadbacks`)
    for (const executionClass of MANAGED_CI_CLASSES) {
      let expectedImage
      let expectedHostPolicy
      try {
        expectedImage = managedCiExpectedImageSupplyChainBinding(managed, executionClass)
        expectedHostPolicy = managedCiExpectedHostSandboxPolicyBinding(managed, executionClass)
      } catch (error) {
        invariant(false, `External activation ${requirement.id} ${executionClass} image/host policy cannot be derived: ${error.message}`)
      }
      const observedImage = claims.executionClassImageSupplyChainBindings[executionClass]
      invariant(stableStringify(observedImage, 0) === stableStringify(expectedImage, 0)
        && observedImage.image.subjectDigest === claims.containerImageDigests[executionClass], `External activation ${requirement.id} ${executionClass} image digest is not bound to exact source/recipe/context/materials/SBOM/SLSA/signature/registry readback`)
      const imageVerifiedAt = canonicalPlanDate(observedImage.verification.verifiedAt, `External activation ${requirement.id} ${executionClass} image verifiedAt`)
      invariant(imageVerifiedAt <= observedAt, `External activation ${requirement.id} ${executionClass} image verification is from the future`)

      const hostObservation = claims.executionClassHostSandboxReadbacks[executionClass]
      let hostSigningBytes
      let hostReceiptDigest
      try {
        hostSigningBytes = managedCiHostSandboxObservationSigningBytes(managed, hostObservation)
        hostReceiptDigest = managedCiHostSandboxObservationReceiptDigest(managed, hostObservation)
      } catch (error) {
        invariant(false, `External activation ${requirement.id} ${executionClass} independent host-sandbox readback is invalid: ${error.message}`)
      }
      invariant(hostObservation.executionClass === executionClass
        && hostObservation.workflowRunId === claims.workflowRunId
        && hostObservation.runAttempt === claims.runAttempt
        && stableStringify(hostObservation.policyBinding, 0) === stableStringify(expectedHostPolicy, 0)
        && hostObservation.receiptDigest === hostReceiptDigest
        && hostObservation.negativeProbeDigest === sha256(stableStringify(hostObservation.negativeProbes, 0)), `External activation ${requirement.id} ${executionClass} host enforcement/run/probe receipt is detached`)
      const hostObservedAt = canonicalDate(hostObservation.observedAt, `External activation ${requirement.id} ${executionClass} host observedAt`)
      const hostMaxAgeMs = (managed.plan.observation.maxAgeSeconds + managed.plan.observation.clockSkewSeconds) * 1000
      invariant(hostObservedAt <= new Date(observedAt.getTime() + managed.plan.observation.clockSkewSeconds * 1000)
        && observedAt.getTime() - hostObservedAt.getTime() <= hostMaxAgeMs, `External activation ${requirement.id} ${executionClass} host readback is future or stale`)
      const hostIssuer = resolvePolicyIssuer(runtimeProfile, issuerRegistry, hostObservation.issuerKeyId, {
        role: 'runtime-evidence-issuer',
        at: hostObservedAt,
        validThrough: observedAt,
      })
      invariant(hostIssuer.subject === hostObservation.issuerSubject
        && !completionSignerKeyIds.has(hostObservation.issuerKeyId)
        && !completionSignerSubjects.has(hostObservation.issuerSubject), `External activation ${requirement.id} ${executionClass} host observer is not independent of the completion attestor`)
      invariant(verify(null, hostSigningBytes, publicKeyFromIssuer(hostIssuer), signatureBytes(hostObservation.signature, `External activation ${requirement.id} ${executionClass} host signature`)), `External activation ${requirement.id} ${executionClass} host readback signature is invalid`)

      const frozenReadback = claims.executionClassFrozenSubjectReadbacks[executionClass]
      let expectedFrozenReadback
      try {
        expectedFrozenReadback = managedCiExpectedFrozenSubjectClassReadback(managed, {
          executionClass,
          frozenSubject: claims.frozenSubjectArtifactBinding,
          recomputedArtifactSha256: frozenReadback.recomputedArtifactSha256,
          recomputedManifestBytesSha256: frozenReadback.recomputedManifestBytesSha256,
          downloadedAt: frozenReadback.downloadedAt,
          hostObservationReceiptDigest: frozenReadback.hostObservationReceiptDigest,
        })
      } catch (error) {
        invariant(false, `External activation ${requirement.id} ${executionClass} frozen-subject download/readback is invalid: ${error.message}`)
      }
      invariant(stableStringify(frozenReadback, 0) === stableStringify(expectedFrozenReadback, 0)
        && frozenReadback.hostObservationReceiptDigest === hostObservation.receiptDigest, `External activation ${requirement.id} ${executionClass} did not independently download/recompute the exact authority-frozen artifact and manifest bytes`)
      const downloadedAt = canonicalDate(frozenReadback.downloadedAt, `External activation ${requirement.id} ${executionClass} frozen subject downloadedAt`)
      invariant(downloadedAt >= protectedMainMergedAt
        && downloadedAt <= new Date(observedAt.getTime() + managed.plan.observation.clockSkewSeconds * 1000)
        && observedAt.getTime() - downloadedAt.getTime() <= hostMaxAgeMs, `External activation ${requirement.id} ${executionClass} frozen-subject readback predates protected main, is future, or is stale`)
    }
    const runtimeBinding = managed.trust.bindings.find(item => item.path === managed.plan.trust.runtimeEvidencePolicyPath)
    invariant(claims.runtimePolicyDigest === runtimeBinding?.sha256
      && claims.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry)
      && claims.issuerRegistryDigest === runtimeProfile.issuerRegistryDigest
      && stableStringify(claims.issuerKeyIds, 0) === stableStringify(runtimeProfile.allowedKeyIds, 0)
      && claims.issuerQuorum === runtimeProfile.requiredIssuerQuorum
      && Array.isArray(claims.issuerKeyIds) && new Set(claims.issuerKeyIds).size === claims.issuerKeyIds.length
      && claims.issuerKeyIds.length >= claims.issuerQuorum, `External activation ${requirement.id} runtime issuer policy/quorum is not active and exact`)
    const issuerSubjects = claims.issuerKeyIds.map(keyId => resolvePolicyIssuer(runtimeProfile, issuerRegistry, keyId, {
      role: 'runtime-evidence-issuer',
      at: observedAt,
      validThrough: expiresAt,
    }).subject)
    invariant(new Set(issuerSubjects).size >= claims.issuerQuorum, `External activation ${requirement.id} runtime issuer quorum is not independently administered`)
    invariant(claims.oidcIssuer === managed.plan.observation.oidcIssuer
      && claims.oidcAudience === managed.plan.observation.oidcAudience, `External activation ${requirement.id} OIDC identity drifted`)
    exactKeys(claims.oidcSubjectConfiguration, ['useDefault', 'useImmutableSubject', 'includeClaimKeys', 'expectedSubject'], `External activation ${requirement.id} immutable OIDC subject configuration`)
    invariant(claims.oidcSubjectConfiguration.useDefault === true
      && claims.oidcSubjectConfiguration.useImmutableSubject === true
      && Array.isArray(claims.oidcSubjectConfiguration.includeClaimKeys)
      && claims.oidcSubjectConfiguration.includeClaimKeys.length === 0, `External activation ${requirement.id} immutable default OIDC subject is not enabled`)
    exactDigestMap(claims.secretBrokerPolicyDigests, MANAGED_CI_SECRET_BROKER_CLASSES, 'secretBrokerPolicyDigests')
    const expectedBrokerPolicyDigests = Object.fromEntries(MANAGED_CI_SECRET_BROKER_CLASSES.map(id => [id, managed.classes.get(id)?.oidcBrokerPolicyDigest]))
    invariant(stableStringify(claims.secretBrokerPolicyDigests, 0) === stableStringify(expectedBrokerPolicyDigests, 0), `External activation ${requirement.id} secret-broker policy digests drifted from the canonical managed policy`)
    const observedEpochSeconds = Math.floor(observedAt.getTime() / 1000)
    const skew = managed.plan.observation.clockSkewSeconds
    let expectedModelReleaseAuthority
    try { expectedModelReleaseAuthority = managedCiExpectedModelReleaseAuthorityBinding(managed, claims.modelReleaseAuthorityBinding) } catch (error) {
      invariant(false, `External activation ${requirement.id} model release authority binding is invalid: ${error.message}`)
    }
    invariant(stableStringify(claims.modelReleaseAuthorityBinding, 0) === stableStringify(expectedModelReleaseAuthority.binding, 0), `External activation ${requirement.id} model release authority binding drifted from the canonical four-document signed projection`)
    const jtis = new Set()
    let expectedSubject = null
    for (const executionClass of MANAGED_CI_CLASSES) {
      const observedOidc = claims.executionClassOidcClaimProjections[executionClass]
      exactKeys(observedOidc, ['claimProjection', 'brokerRequest', 'policyBinding', 'tokenRuntime', 'projectionDigest'], `External activation ${requirement.id} ${executionClass} OIDC projection`)
      exactKeys(observedOidc.tokenRuntime, ['jti', 'exp', 'iat', 'nbf'], `External activation ${requirement.id} ${executionClass} OIDC token runtime`)
      let expectedOidc
      try {
        expectedOidc = managedCiExpectedOidcBinding(managed, {
          executionClass,
          workflowDefinitionCommit: claims.workflowDefinitionCommit,
          workflowDefinitionTree: claims.workflowDefinitionTree,
          workflowRunId: claims.workflowRunId,
          runAttempt: claims.runAttempt,
          subjectCommit: claims.auditedSubjectCommit,
          subjectTree: claims.auditedSubjectTree,
          manifestSha256: claims.auditedManifestSha256,
          subjectRunId: claims.auditedSubjectRunId,
          frozenSubject: claims.frozenSubjectArtifactBinding,
          modelRelease: executionClass === 'model-broker' ? claims.modelReleaseAuthorityBinding : null,
          tokenRuntime: observedOidc.tokenRuntime,
          allowTrustedActivationCore: true,
        })
      } catch (error) {
        invariant(false, `External activation ${requirement.id} ${executionClass} OIDC claim/request/policy binding is invalid: ${error.message}`)
      }
      invariant(stableStringify(observedOidc, 0) === stableStringify(expectedOidc, 0), `External activation ${requirement.id} ${executionClass} OIDC claim/request/policy projection drifted`)
      const runtime = observedOidc.tokenRuntime
      invariant(!jtis.has(runtime.jti), `External activation ${requirement.id} reuses an OIDC jti across execution classes`)
      jtis.add(runtime.jti)
      invariant(runtime.nbf <= observedEpochSeconds + skew
        && runtime.iat <= observedEpochSeconds + skew
        && runtime.exp >= observedEpochSeconds - skew
        && observedEpochSeconds - runtime.iat <= managed.plan.observation.maxAgeSeconds + skew, `External activation ${requirement.id} ${executionClass} OIDC token is future, expired, or stale at independent readback`)
      expectedSubject ??= observedOidc.claimProjection.sub
      invariant(observedOidc.claimProjection.sub === expectedSubject, `External activation ${requirement.id} OIDC subjects differ across execution classes`)
    }
    invariant(claims.oidcSubjectConfiguration.expectedSubject === expectedSubject, `External activation ${requirement.id} OIDC immutable subject readback differs from exact token subjects`)
    const model = managed.classes.get('model-broker').modelEgress
    invariant(claims.providerEgressRegistryDigest === model.registrySha256
      && claims.providerEgressProfilesDigest === model.brokerProfilesSha256, `External activation ${requirement.id} provider egress registry drifted`)
    const providerIds = model.profiles.map(item => item.selectedProvider)
    exactDigestMap(claims.providerEgressEnforcementDigests, providerIds, 'providerEgressEnforcementDigests')
    const derivedReadback = managedCiDerivedReadbackBindings(claims)
    invariant(stableStringify(claims.executionClassOidcClaimsDigests, 0) === stableStringify(derivedReadback.executionClassOidcClaimsDigests, 0), `External activation ${requirement.id} OIDC claim projections are not content-addressed`)
    invariant(stableStringify(claims.executionClassReceiptProvenanceDigests, 0) === stableStringify(derivedReadback.executionClassReceiptProvenanceDigests, 0), `External activation ${requirement.id} receipt digests are not bound to full provenance and execution-class policy`)
    invariant(stableStringify(claims.executionClassOidcProvenanceDigests, 0) === stableStringify(derivedReadback.executionClassOidcProvenanceDigests, 0), `External activation ${requirement.id} OIDC claims are not bound to full provenance and execution-class policy`)
    for (const key of [
      'executionClassImageSupplyChainDigests', 'executionClassHostSandboxReadbackDigests',
      'executionClassFrozenSubjectReadbackDigests', 'executionClassRawReceiptValidationDigests',
      'executionClassReceiptSigningPayloadDigests',
      'executionClassSignerAuditEventDigests',
    ]) invariant(stableStringify(claims[key], 0) === stableStringify(derivedReadback[key], 0), `External activation ${requirement.id} ${key} is not the canonical content-addressed readback projection`)
    for (const key of [
      'receiptSignerAuthorityBindingDigest', 'receiptSignerIssuerMappingDigest',
      'frozenSubjectArtifactBindingDigest', 'modelReleaseAuthorityBindingDigest',
    ]) invariant(claims[key] === derivedReadback[key], `External activation ${requirement.id} ${key} drifted from its canonical authority/readback projection`)
    invariant(claims.readbackReceiptDigest === derivedReadback.readbackReceiptDigest, `External activation ${requirement.id} aggregate readback binding drifted`)
    assertSourceTreeCurrent()
    if (observedResourceCacheKey !== null) {
      if (managedCiObservedResourceValidationCache.size >= MANAGED_CI_OBSERVED_RESOURCE_CACHE_LIMIT) {
        managedCiObservedResourceValidationCache.delete(managedCiObservedResourceValidationCache.keys().next().value)
      }
      managedCiObservedResourceValidationCache.set(observedResourceCacheKey, true)
    }
  }
}

function validateActivatedRequirement(requirement, {
  activeProfileId,
  releaseAuthorization,
  attestationPolicy,
  issuerRegistry,
  inventory,
  desired,
  mutationBoundaryContract,
  policyDigest,
  policyRequirement,
  now,
  managedCiValidationContext,
}) {
  exactKeys(requirement.evidence, EVIDENCE_KEYS, `External activation ${requirement.id} evidence`)
  invariant(requirement.evidence.schemaVersion === 2 && EVIDENCE_KINDS.has(requirement.evidence.kind), `External activation ${requirement.id} evidence kind/version is invalid`)
  invariant(requirement.evidence.kind === policyRequirement.evidenceContract.kind, `External activation ${requirement.id} evidence kind differs from policy`)
  invariant(SHA256.test(requirement.evidence.sha256 ?? ''), `External activation ${requirement.id} evidence digest is invalid`)
  invariant(requirement.evidence.policyDigest === policyDigest, `External activation ${requirement.id} evidence policy digest mismatch`)
  const contentAddressedReference = requirement.evidence.reference === `urn:sha256:${requirement.evidence.sha256}`
    || (typeof requirement.evidence.reference === 'string' && requirement.evidence.reference.endsWith(`/sha256/${requirement.evidence.sha256}`) && /^https:\/\//.test(requirement.evidence.reference))
  invariant(contentAddressedReference, `External activation ${requirement.id} evidence reference is not content-addressed`)
  invariant(requirement.evidence.issuerRegistryDigest === attestationPolicy.issuerRegistryDigest
    && requirement.evidence.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry), `External activation ${requirement.id} issuer registry binding drifted`)
  const observedAt = canonicalDate(requirement.observedAt, `External activation ${requirement.id} observedAt`)
  const expiresAt = canonicalDate(requirement.expiresAt, `External activation ${requirement.id} expiresAt`)
  invariant(expiresAt > observedAt, `External activation ${requirement.id} expiresAt must follow observedAt`)
  invariant(expiresAt.getTime() - observedAt.getTime() <= attestationPolicy.maxCompletionTtlMinutes * 60_000, `External activation ${requirement.id} evidence exceeds the completion-attestation TTL`)
  invariant(observedAt.getTime() <= now.getTime() + attestationPolicy.clockSkewSeconds * 1000, `External activation ${requirement.id} evidence is from the future`)
  invariant(expiresAt > now, `External activation ${requirement.id} evidence is expired`)
  if (requirement.kind === 'github-app' || requirement.kind === 'github-mutation-boundary') {
    const maximumObservationAgeSeconds = mutationBoundaryContract.freshnessPolicy.maximumObservationAgeSeconds
    const minimumRemainingValiditySeconds = mutationBoundaryContract.freshnessPolicy.minimumRemainingValiditySeconds
    invariant(now.getTime() - observedAt.getTime() <= maximumObservationAgeSeconds * 1000,
      `External activation ${requirement.id} hidden GitHub observation is too old`)
    invariant(expiresAt.getTime() - now.getTime() >= minimumRemainingValiditySeconds * 1000,
      `External activation ${requirement.id} hidden GitHub observation lacks the minimum remaining validity horizon`)
  }
  exactKeys(requirement.evidence.payload, PAYLOAD_KEYS, `External activation ${requirement.id} evidence payload`)
  const payload = requirement.evidence.payload
  invariant(payload.schemaVersion === 1
    && payload.kind === requirement.evidence.kind
    && payload.requirementId === requirement.id
    && payload.policyDigest === policyDigest
    && payload.repository === requirement.repository
    && payload.observedAt === requirement.observedAt
    && payload.expiresAt === requirement.expiresAt, `External activation ${requirement.id} evidence payload identity mismatch`)
  invariant(payload.readbackSha256 === sha256(stableStringify(payload.observedResource, 0)), `External activation ${requirement.id} readback payload digest mismatch`)
  invariant(requirement.evidence.sha256 === sha256(stableStringify(payload, 0)), `External activation ${requirement.id} content-addressed evidence digest mismatch`)
  invariant(Array.isArray(requirement.evidence.coSignatures), `External activation ${requirement.id} cosignatures must be an array`)
  for (const item of requirement.evidence.coSignatures) exactKeys(item, COSIGNATURE_KEYS, `External activation ${requirement.id} cosignature`)
  const signatures = [{
    signerKeyId: requirement.evidence.signerKeyId,
    subject: requirement.evidence.subject,
    signature: requirement.evidence.signature,
  }, ...requirement.evidence.coSignatures]
  validateObservedResource(requirement, payload.observedResource, {
    activeProfileId,
    releaseAuthorization,
    issuerRegistry,
    inventory,
    desired,
    mutationBoundaryContract,
    observedAt,
    expiresAt,
    completionSignerKeyIds: new Set(signatures.map(item => item.signerKeyId)),
    completionSignerSubjects: new Set(signatures.map(item => item.subject)),
    managedCiValidationContext,
  })
  invariant(new Set(signatures.map(item => item.signerKeyId)).size === signatures.length, `External activation ${requirement.id} signer keys must be unique`)
  invariant(new Set(signatures.map(item => item.subject)).size === signatures.length, `External activation ${requirement.id} signer subjects must be unique`)
  let verified = 0
  for (const item of signatures) {
    const issuer = resolvePolicyIssuer(attestationPolicy, issuerRegistry, item.signerKeyId, {
      role: 'completion-attestor',
      at: observedAt,
      validThrough: expiresAt,
    })
    invariant(issuer.subject === item.subject, `External activation ${requirement.id} signer subject mismatch`)
    invariant(verify(null, externalActivationPayload(requirement), publicKeyFromIssuer(issuer), signatureBytes(item.signature, `External activation ${requirement.id} signature`)), `External activation ${requirement.id} signature is invalid`)
    resolvePolicyIssuer(attestationPolicy, issuerRegistry, item.signerKeyId, {
      role: 'completion-attestor',
      at: now,
      validThrough: now,
    })
    verified += 1
  }
  invariant(verified >= attestationPolicy.completionAttestationQuorum, `External activation ${requirement.id} lacks completion-attestor quorum ${attestationPolicy.completionAttestationQuorum}`)
}

function validateNpmCoverage(requirements, inventory) {
  const authority = authorityRepository(inventory)
  const releasePackages = authority.publishes
  const expectedKinds = ['npm-package-identity', 'npm-trusted-publisher', 'npm-publishing-access']
  for (const packageName of releasePackages) {
    for (const kind of expectedKinds) {
      const matches = requirements.filter(item => item.kind === kind && item.packageName === packageName)
      invariant(matches.length === 1, `External activation requires exactly one ${kind} requirement for ${packageName}`)
      invariant(matches[0].requiredFor.includes('release') && matches[0].requiredFor.includes('objective-completion'), `External activation ${matches[0].id} must gate release and objective completion`)
      invariant(matches[0].repository === authority.github, `External activation ${matches[0].id} must be owned by ${authority.github}`)
    }
  }
  for (const requirement of requirements.filter(item => NPM_KINDS.has(item.kind))) {
    invariant(releasePackages.includes(requirement.packageName), `External activation ${requirement.id} references a package outside the release train`)
  }
}

export function validateExternalActivationRequirements(ledger, {
  inventory,
  desired,
  rings,
  issuerRegistry,
  policy,
  expectedPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
  expectedMutationBoundaryContractDigest = GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  now = new Date(),
  managedCiValidationContext,
  mutationBoundaryContract,
} = {}) {
  exactKeys(ledger, ['$schema', 'schemaVersion', 'policy', 'requirements'], 'External activation ledger')
  invariant(ledger.$schema === 'schemas/external-activation-requirements.schema.json' && ledger.schemaVersion === 4, 'External activation ledger kind/version mismatch')
  invariant(Array.isArray(ledger.requirements) && ledger.requirements.length > 0, 'External activation ledger must contain requirements')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'External activation validation time is invalid')
  invariant(inventory && desired && policy && mutationBoundaryContract && rings?.attestationPolicy && issuerRegistry,
    'External activation validation requires explicit inventory, desired state, policy, mutation-boundary contract, release-ring attestation policy, and issuer registry')
  validateGithubMutationBoundaryContract(mutationBoundaryContract, {
    desired,
    inventory,
    expectedDigest: expectedMutationBoundaryContractDigest,
  })
  validateExternalActivationPolicy(policy, {
    inventory,
    expectedPolicyDigest,
    mutationBoundaryContract,
    expectedMutationBoundaryContractDigest,
  })
  exactKeys(ledger.policy, ['path', 'sha256'], 'External activation ledger policy binding')
  invariant(ledger.policy.path === EXTERNAL_ACTIVATION_POLICY_PATH
    && ledger.policy.sha256 === expectedPolicyDigest
    && ledger.policy.sha256 === externalActivationPolicyDigest(policy), 'External activation ledger policy binding drifted')
  validateAttestationPolicy(rings.attestationPolicy, { issuerRegistry, now, allowUnactivated: true })
  const ids = new Set()
  const policyById = new Map(policy.requirements.map(requirement => [requirement.id, requirement]))
  const activeProfile = policy.profiles.find(profile => profile.id === policy.activeProfile)
  invariant(activeProfile, `External activation active profile is unavailable after policy validation: ${policy.activeProfile}`)
  invariant(ledger.requirements.length === policy.requirements.length, 'External activation ledger does not exactly cover the immutable policy catalog')
  for (const requirement of ledger.requirements) {
    exactKeys(requirement, expectedRequirementKeys(requirement), `External activation requirement ${requirement?.id ?? '<missing>'}`)
    invariant(typeof requirement.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(requirement.id), 'External activation requirement id is invalid')
    invariant(!ids.has(requirement.id), `External activation requirement id is duplicated: ${requirement.id}`)
    invariant(REQUIREMENT_KINDS.has(requirement.kind), `External activation ${requirement.id} kind is invalid`)
    invariant(typeof requirement.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(requirement.repository), `External activation ${requirement.id} repository is invalid`)
    invariant(typeof requirement.desiredPath === 'string' && requirement.desiredPath.trim().length > 0, `External activation ${requirement.id} desiredPath is invalid`)
    invariant(Array.isArray(requirement.requiredFor) && requirement.requiredFor.length > 0
      && new Set(requirement.requiredFor).size === requirement.requiredFor.length
      && requirement.requiredFor.every(scope => EXTERNAL_ACTIVATION_SCOPES.includes(scope)), `External activation ${requirement.id} requiredFor is invalid`)
    invariant(STATUS.has(requirement.status), `External activation ${requirement.id} status is invalid`)
    invariant(typeof requirement.condition === 'string' && requirement.condition.trim().length > 0, `External activation ${requirement.id} condition is missing`)
    invariant(typeof requirement.reason === 'string' && requirement.reason.trim().length > 0, `External activation ${requirement.id} reason is missing`)
    const policyRequirement = policyById.get(requirement.id)
    invariant(policyRequirement, `External activation requirement is outside the immutable policy catalog: ${requirement.id}`)
    const expectedStatic = clone(policyRequirement)
    delete expectedStatic.evidenceContract
    invariant(stableStringify(staticRequirement(requirement), 0) === stableStringify(expectedStatic, 0), `External activation ${requirement.id} static policy fields drifted`)
    if (NPM_KINDS.has(requirement.kind)) validateNpmRequirement(requirement, authorityRepository(inventory))
    if (requirement.status === 'not-activated') {
      invariant(requirement.evidence === null && requirement.observedAt === null && requirement.expiresAt === null, `External activation ${requirement.id} must not fabricate evidence or timestamps before activation`)
    } else validateActivatedRequirement(requirement, {
      activeProfileId: policy.activeProfile,
      releaseAuthorization: activeProfile.releaseAuthorization,
      attestationPolicy: rings.attestationPolicy,
      issuerRegistry,
      inventory,
      desired,
      mutationBoundaryContract,
      policyDigest: expectedPolicyDigest,
      policyRequirement,
      now,
      managedCiValidationContext,
    })
    ids.add(requirement.id)
  }
  invariant(ids.size === policyById.size && [...policyById.keys()].every(id => ids.has(id)), 'External activation ledger is missing immutable policy requirements')
  validateNpmCoverage(ledger.requirements, inventory)
  return true
}

export function validateExternalActivationCarrierAfterImage(
  baselineLedger,
  currentLedger,
  options = {},
) {
  validateExternalActivationRequirements(currentLedger, options)
  exactKeys(baselineLedger, ['$schema', 'schemaVersion', 'policy', 'requirements'], 'External activation carrier baseline')
  invariant(
    baselineLedger.$schema === currentLedger.$schema
      && baselineLedger.schemaVersion === currentLedger.schemaVersion
      && stableStringify(baselineLedger.policy, 0) === stableStringify(currentLedger.policy, 0)
      && Array.isArray(baselineLedger.requirements)
      && baselineLedger.requirements.length === currentLedger.requirements.length,
    'External activation carrier baseline identity/policy/requirement closure drifted',
  )
  for (let index = 0; index < currentLedger.requirements.length; index += 1) {
    const baseline = baselineLedger.requirements[index]
    const current = currentLedger.requirements[index]
    invariant(
      baseline?.id === current?.id
        && stableStringify(staticRequirement(baseline), 0) === stableStringify(staticRequirement(current), 0),
      `External activation carrier static requirement order/policy drifted at index ${index}`,
    )
    if (baseline.status === 'activated') {
      invariant(
        stableStringify(current, 0) === stableStringify(baseline, 0),
        `External activation carrier cannot downgrade, refresh, or substitute already-activated requirement ${baseline.id}`,
      )
    } else if (current.status === 'not-activated') {
      invariant(
        stableStringify(current, 0) === stableStringify(baseline, 0),
        `External activation carrier changed inactive requirement ${baseline.id} without a signed activation transition`,
      )
    } else {
      invariant(
        baseline.status === 'not-activated' && current.status === 'activated',
        `External activation carrier transition is not monotonic for requirement ${baseline.id}`,
      )
    }
  }
  return true
}

export function externalActivationReadiness(ledger, options = {}) {
  validateExternalActivationRequirements(ledger, options)
  const { scope = 'objective-completion' } = options
  invariant(EXTERNAL_ACTIVATION_SCOPES.includes(scope), `Unknown external activation readiness scope ${scope}`)
  const profile = options.policy.profiles.find(candidate => candidate.id === options.policy.activeProfile)
  invariant(profile, `External activation active profile is unavailable after policy validation: ${options.policy.activeProfile}`)
  const requirementById = new Map(ledger.requirements.map(requirement => [requirement.id, requirement]))
  const requiredIds = profile.requiredRequirementIdsByScope[scope]
  const required = requiredIds.map((id) => {
    const requirement = requirementById.get(id)
    invariant(requirement, `External activation active profile references a missing ledger requirement: ${id}`)
    return requirement
  })
  const maximumProfile = options.policy.profiles.find(candidate => candidate.id === 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM')
  invariant(maximumProfile, 'External activation maximum-assurance profile is unavailable after policy validation')
  const requiredIdSet = new Set(requiredIds)
  const optionalRequirementIds = maximumProfile.requiredRequirementIdsByScope[scope]
    .filter(id => !requiredIdSet.has(id))
  const blockers = required.filter(requirement => requirement.status !== 'activated').map(requirement => ({
    id: requirement.id,
    kind: requirement.kind,
    status: requirement.status,
    reason: requirement.reason,
  }))
  const profileDigest = externalActivationProfileDigest(profile)
  return {
    scope,
    profileId: profile.id,
    profileDigest,
    profile: {
      id: profile.id,
      sha256: profileDigest,
    },
    policyDigest: externalActivationPolicyDigest(options.policy),
    requiredRequirementIds: [...requiredIds],
    optionalRequirementIds,
    ready: blockers.length === 0,
    requiredCount: required.length,
    activatedCount: required.length - blockers.length,
    blockers,
    digest: sha256(stableStringify(ledger, 0)),
  }
}

export function assertExternalActivationReady(ledger, options = {}) {
  const readiness = externalActivationReadiness(ledger, options)
  invariant(readiness.ready, `External activation is incomplete for ${readiness.scope}: ${readiness.blockers.map(item => item.id).join(', ')}`)
  return readiness
}

export function resolveReleaseFinalizerSignedAuthority(ledger, {
  repository,
  releaseTagAuthorizationPolicy,
  ...validationOptions
} = {}) {
  const {
    inventory,
    desired,
    issuerRegistry,
    policy,
    expectedPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
  } = validationOptions
  assertExternalActivationReady(ledger, { ...validationOptions, scope: 'release' })
  const activationProfile = resolveExternalActivationProfile(policy, { expectedPolicyDigest })
  invariant(
    releaseTagAuthorizationPolicy?.externalActivationPolicyDigest === expectedPolicyDigest
      && releaseTagAuthorizationPolicy?.authorizationProfileId === activationProfile.id
      && releaseTagAuthorizationPolicy?.authorizationProfileDigest === activationProfile.sha256
      && stableStringify(releaseTagAuthorizationPolicy?.releaseAuthorization, 0)
        === stableStringify(activationProfile.releaseAuthorization, 0),
    'Release-finalizer signed authority release policy profile is stale, cross-policy, or substituted',
  )
  invariant(
    Number.isInteger(releaseTagAuthorizationPolicy.requiredSignerQuorum)
      && releaseTagAuthorizationPolicy.requiredSignerQuorum >= activationProfile.releaseAuthorization.minimumSignerQuorum
      && releaseTagAuthorizationPolicy.requiredSignerQuorum <= activationProfile.releaseAuthorization.maximumSignerQuorum
      && (
        activationProfile.releaseAuthorization.minimumSignerQuorum
          !== activationProfile.releaseAuthorization.maximumSignerQuorum
        || releaseTagAuthorizationPolicy.requiredSignerQuorum
          === activationProfile.releaseAuthorization.minimumSignerQuorum
      ),
    'Release-finalizer signed authority release policy quorum is outside the active canonical profile',
  )
  invariant(
    typeof repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository),
    'Release-finalizer signed authority repository is invalid',
  )
  const managedRepository = inventory.repositories.find(candidate => candidate.github === repository)
  invariant(managedRepository?.role === 'authority', `Release-finalizer signed authority repository is not the managed authority: ${repository}`)
  const profile = desired.profiles?.[managedRepository.desiredProfile]
  invariant(profile, `Release-finalizer signed authority desired profile is missing: ${managedRepository.desiredProfile}`)
  const environments = profile.environments?.filter(environment => environment.name === 'release-finalize') ?? []
  invariant(environments.length === 1, 'Release-finalizer signed authority requires exactly one canonical release-finalize environment')
  const environment = environments[0]
  invariant(
    environment.workflow === RELEASE_FINALIZER_WORKFLOW
      && environment.independentReviewRequired === undefined
      && environment.preventSelfReview === false
      && Array.isArray(environment.reviewers)
      && environment.reviewers.length === 0,
    'Release-finalizer environment must be protected without a human engineering-decision gate',
  )
  const desiredPath = 'infra/governance/release-tag-authorization-policy.json'
  const matches = ledger.requirements.filter(requirement => requirement.id === RELEASE_FINALIZER_AUTHORITY_REQUIREMENT_ID)
  invariant(matches.length === 1, 'Release-finalizer signed authority requirement is missing or ambiguous')
  const requirement = matches[0]
  invariant(
    requirement.kind === 'release-authorization'
      && requirement.repository === repository
      && requirement.desiredPath === desiredPath
      && requirement.status === 'activated',
    'Release-finalizer signed authority requirement is cross-repository, cross-policy, or inactive',
  )
  const claims = requirement.evidence.payload.observedResource
  invariant(
    Array.isArray(releaseTagAuthorizationPolicy?.allowedKeyIds)
      && stableStringify(claims.allowedKeyIds, 0) === stableStringify(releaseTagAuthorizationPolicy.allowedKeyIds, 0)
      && claims.quorum === releaseTagAuthorizationPolicy.requiredSignerQuorum
      && claims.issuerRegistryDigest === releaseTagAuthorizationPolicy.issuerRegistryDigest,
    'Release-finalizer signed authority readback is detached from the canonical release authorization policy',
  )
  const authorizerSubjects = claims.allowedKeyIds.map((keyId) => {
    const issuer = issuerRegistry.issuers.find(candidate => candidate.keyId === keyId)
    invariant(issuer?.roles?.length === 1 && issuer.roles[0] === 'release-tag-authorizer', `Release-finalizer authorizer ${keyId} has invalid or widened authority`)
    return issuer.subject
  }).sort(compareCodepoints)
  invariant(new Set(authorizerSubjects).size === authorizerSubjects.length, 'Release-finalizer authorizer subjects must be unique')
  const attestorSubjects = [
    requirement.evidence.subject,
    ...requirement.evidence.coSignatures.map(item => item.subject),
  ].sort(compareCodepoints)
  const core = {
    schemaVersion: 1,
    kind: FINALIZER_AUTHORITY_KIND,
    requirementId: requirement.id,
    repository,
    desiredPath,
    workflow: RELEASE_FINALIZER_WORKFLOW,
    externalActivationPolicyDigest: expectedPolicyDigest,
    authorizationProfileId: activationProfile.id,
    authorizationProfileDigest: activationProfile.sha256,
    releaseAuthorization: clone(activationProfile.releaseAuthorization),
    allowedKeyIds: [...claims.allowedKeyIds],
    requiredSignerQuorum: claims.quorum,
    authorizerSubjects,
    observedAt: requirement.observedAt,
    expiresAt: requirement.expiresAt,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    attestorSubjects,
    evidenceSha256: requirement.evidence.sha256,
    readbackSha256: requirement.evidence.payload.readbackSha256,
    activationLedgerDigest: sha256(stableStringify(ledger, 0)),
  }
  exactKeys(core, FINALIZER_AUTHORITY_CORE_KEYS, 'Release-finalizer signed authority projection')
  return {
    ...core,
    authorityDigest: sha256(stableStringify(core, 0)),
  }
}

// Backward-compatible export name only. The returned authority is signed and
// provider-neutral; it never represents a GitHub User/Team approval.
export const resolveReleaseFinalizerReviewerAuthority = resolveReleaseFinalizerSignedAuthority
