import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { GhApiClient, materializeProfile } from '../bin/reconcile-github.mjs'
import { compareUtf8Bytes, readJson, sha256, stableStringify } from '../lib/common.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import {
  createExternalActivationEvidence,
  deriveGithubAppActivationExpectations,
  EXTERNAL_ACTIVATION_PROFILE_IDS,
  externalActivationPolicyDigest,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST,
  resolveExternalActivationProfile,
  resolveReleaseFinalizerSignedAuthority,
  signExternalActivationRequirement,
} from '../lib/external-activation.mjs'
import {
  createReleaseTagAuthorization,
  releaseTagAuthorizationPolicyDigest,
  signReleaseTagAuthorization,
} from '../lib/release-tag-authorization.mjs'
import {
  bindReleaseFinalizerSignedAuthority,
  releaseTrustPreflightEvidenceDigest,
  resolveReleaseTrustPreflight,
  validateReleaseTagAuthorizationPolicyBinding,
  validateReleaseTrustPreflightEvidence,
} from '../lib/release-trust-preflight.mjs'
import {
  readReleaseTagAuthorizationEvent,
  run as runReleaseTrustPreflightImpl,
} from '../../../scripts/release-trust-preflight.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'
import { createManagedCiActivationFixture } from './fixtures/managed-ci-activation-fixture.mjs'
import { validateStagedReleaseTrustEvidence } from '../lib/staged-rollout.mjs'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/github')
const GOVERNANCE_ROOT = resolve(FIXTURES, '../../..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const NOW = new Date('2026-07-20T00:30:00.000Z')
const RELEASE_TAG = 'v1.2.3-beta.4'
const RELEASE_TAG_OBJECT = '4'.repeat(40)
const RELEASE_COMMIT = '2'.repeat(40)
const RELEASE_TREE = '3'.repeat(40)
const RELEASE_REPOSITORY = 'ajenchen/design-system'
const SMALL_TEAM_PROFILE_ID = EXTERNAL_ACTIVATION_PROFILE_IDS[0]
const MAXIMUM_PROFILE_ID = EXTERNAL_ACTIVATION_PROFILE_IDS[1]
const REQUIREMENTS_SHA256 = 'f'.repeat(64)
const ATTESTATION_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIONNr2Y1hDSWkLyinTTfdEU1ilmYox3tHunig5bPsrEp
-----END PRIVATE KEY-----
`
const MIRROR_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' })

function activationReadback(requirement, issuerRegistry, activationContext) {
  const digest = value => String(value).repeat(64).slice(0, 64)
  switch (requirement.kind) {
    case 'github-app': {
      const expected = deriveGithubAppActivationExpectations(activationContext)
      const installationTokenProbes = expected.installationProbeRoutes.map((route, index) => ({
        ...route,
        appId: expected.appIds[route.integration], installationId: 2000 + index,
        credentialSource: 'named-environment-secrets', tokenMinted: true,
        installationRepositoryVerified: true, capability: expected.integrations[route.integration].capability,
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
      reviewers: [{ type: 'User', id: 4242, subject: 'operator:independent-release-reviewer' }],
      preventSelfReview: true,
    }
    case 'github-repository': return { rulesetsDigest: digest('1'), requiredChecksDigest: digest('2'), immutableReleases: true, tagObjectVerificationDigest: digest('3') }
    case 'github-token-permission': return { tokenFingerprint: 'fixture-read-only', permissions: ['metadata:read'], writePermissions: [] }
    case 'github-mutation-boundary': {
      const contract = activationContext.mutationBoundaryContract
      const binding = requirement.repository === contract.scope.source.repository
        ? contract.desiredBindings.source
        : contract.desiredBindings.target
      return {
        projectionContractDigest: GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
        fullRulesetsDigest: digest('a'),
        bypassActorsDigest: GITHUB_MUTATION_BOUNDARY_EMPTY_BYPASS_ACTORS_DIGEST,
        publicRulesetProjectionDigest: digest('b'),
        ...binding,
      }
    }
    case 'managed-host-policy': return {
      provider: requirement.id.includes('claude') ? 'claude-code' : 'codex',
      winningSource: 'fixture-managed-source',
      policyDigest: digest('4'),
      bundleDigest: digest('5'),
      activationProofDigest: digest('6'),
    }
    case 'release-authorization': return { allowedKeyIds: ['release-one'], quorum: 1, issuerRegistryDigest: issuerRegistryDigest(issuerRegistry) }
    case 'npm-package-identity': return { packageName: requirement.packageName, registry: requirement.registry, visibility: 'public', bootstrapVersion: '0.0.1-bootstrap.0', consumerEligible: false }
    case 'npm-trusted-publisher': return {
      packageName: requirement.packageName,
      registry: requirement.registry,
      repository: requirement.repository,
      workflow: requirement.trustedPublisher.workflow,
      environment: requirement.trustedPublisher.environment,
      allowedActions: requirement.trustedPublisher.allowedActions,
      exclusive: true,
    }
    case 'npm-publishing-access': return { packageName: requirement.packageName, registry: requirement.registry, twoFactorMode: requirement.publishingAccess.twoFactorMode, tokensAllowed: false, remainingPublishTokenIds: [] }
    case 'durable-evidence-mirror': return {
      provider: 'fixture-independent-worm',
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
      receiptSigningPublicKeySpki: MIRROR_PUBLIC_KEY.toString('base64'),
      receiptSigningPublicKeySpkiSha256: sha256(MIRROR_PUBLIC_KEY),
      signatureAlgorithm: 'ed25519',
      receiptId: 'fixture-receipt-1',
      eventHeadDigest: digest('7'),
      retentionUntil: '2030-01-01T00:00:00.000Z',
      appendOnly: true,
      independentAdministration: true,
      receiptSha256: digest('8'),
    }
    case 'rollback-drill': return {
      transactionId: 'fixture-rollback-drill',
      eventHeadDigest: digest('9'),
      authorizationDigest: digest('a'),
      beforeImageRestored: true,
      postRollbackStateDigest: digest('b'),
      offHostReceiptDigest: digest('c'),
    }
    default: throw new Error(`missing activation fixture for ${requirement.kind}`)
  }
}

function activatedRequirements(issuerRegistry, activationPolicy, policyDigest, activationContext) {
  const requirements = activationPolicy.requirements.map(policyRequirement => {
    const requirement = structuredClone(policyRequirement)
    delete requirement.evidenceContract
    requirement.status = 'activated'
    requirement.observedAt = '2026-07-20T00:00:00.000Z'
    requirement.expiresAt = '2026-07-27T00:00:00.000Z'
    requirement.evidence = createExternalActivationEvidence(requirement, {
      policyDigest,
      issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
      observedResource: requirement.kind === 'managed-ci-attestation'
        ? MANAGED_CI_FIXTURE.observedResource()
        : activationReadback(requirement, issuerRegistry, activationContext),
    })
    signExternalActivationRequirement(requirement, {
      signerKeyId: 'fixture-ed25519',
      subject: 'fixture-governance',
      privateKey: ATTESTATION_PRIVATE_KEY,
    })
    return requirement
  })
  return {
    $schema: 'schemas/external-activation-requirements.schema.json',
    schemaVersion: 4,
    policy: {
      path: 'infra/governance/external-activation-policy.json',
      sha256: policyDigest,
    },
    requirements,
  }
}

function authorizationSigner(keyId) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const subject = `operator:${keyId}`
  return {
    keyId,
    subject,
    privateKey,
    record: {
      keyId,
      subject,
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      roles: ['release-tag-authorizer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

const RELEASE_SIGNERS = [authorizationSigner('release-one'), authorizationSigner('release-two')]
const MANAGED_CI_BASE_ISSUER_REGISTRY = readJson(resolve(FIXTURES, 'issuer-registry.json'))
MANAGED_CI_BASE_ISSUER_REGISTRY.issuers.push(...RELEASE_SIGNERS.map(item => item.record))
const MANAGED_CI_FIXTURE = createManagedCiActivationFixture({
  repoRoot: REPO_ROOT,
  issuerRegistry: MANAGED_CI_BASE_ISSUER_REGISTRY,
  runtimeProfile: readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')),
})
after(() => MANAGED_CI_FIXTURE.dispose())
const EXTERNAL_RUNTIME_FIXTURES = []
after(() => {
  for (const fixture of EXTERNAL_RUNTIME_FIXTURES) fixture.dispose()
})

function runReleaseTrustPreflight(argv, dependencies = {}) {
  const validationOnly = argv.includes('--verify') || argv.includes('--verify-issued')
  return runReleaseTrustPreflightImpl(argv, {
    ...dependencies,
    ...(validationOnly && dependencies.client === undefined ? { client: Object.freeze({}) } : {}),
    runtimeValidationContext: dependencies.runtimeValidationContext,
    managedCiValidationContext: MANAGED_CI_FIXTURE.managedCiValidationContext,
  })
}

function models() {
  const canonicalInventory = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const authorityRepository = structuredClone(canonicalInventory.repositories.find(repository => repository.role === 'authority'))
  const workflowIdentitySourceRepositoryIds = new Set(
    Object.values(canonicalInventory.workflowIdentitySources).map(source => source.repositoryId),
  )
  const modelRepositories = canonicalInventory.repositories
    .filter(repository => repository.role === 'authority' || workflowIdentitySourceRepositoryIds.has(repository.id))
    .map(repository => structuredClone(repository))
  const representedRoles = new Set(modelRepositories.map(repository => repository.role))
  const inventory = {
    ...structuredClone(canonicalInventory),
    certificationCanaries: Object.fromEntries(
      Object.entries(canonicalInventory.certificationCanaries)
        .filter(([role]) => representedRoles.has(role))
        .map(([role, canary]) => [role, structuredClone(canary)]),
    ),
    repositories: modelRepositories,
    ownershipPolicies: Object.fromEntries(
      modelRepositories.map(repository => [
        repository.ownershipPolicy,
        structuredClone(canonicalInventory.ownershipPolicies[repository.ownershipPolicy]),
      ]),
    ),
  }
  const roleSurfacePolicy = readJson(resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json'))
  for (const repository of inventory.repositories) {
    repository.providerSurfacesRequired = [...roleSurfacePolicy.roles[repository.role].requiredSurfaces]
  }
  const desired = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
  desired.integrations.governanceCheckApp.id = 1001
  desired.integrations.governanceWriterApp.id = 1002
  const rings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))
  rings.attestationPolicy = readJson(resolve(FIXTURES, 'rings-eligible.json')).attestationPolicy
  rings.candidateRelease = null
  rings.rings = rings.rings.filter(ring => ring.order <= 1)
  rings.assignments = Object.fromEntries(
    inventory.repositories.map(repository => [
      repository.id,
      structuredClone(rings.assignments[repository.id]),
    ]),
  )
  const baseCertifications = readJson(resolve(FIXTURES, 'certifications.json'))
  const certificationBySurface = new Map(baseCertifications.certifications.map(certification => [
    `${certification.provider}/${certification.runtimeKind}/${certification.surface}`,
    certification,
  ]))
  baseCertifications.certifications = [...representedRoles].flatMap(role => (
    roleSurfacePolicy.roles[role].requiredSurfaces.map(requirement => {
      const certification = certificationBySurface.get(requirement)
      assert.ok(certification, `missing canonical ${role} certification fixture for ${requirement}`)
      return {
        ...structuredClone(certification),
        id: certification.id.replace('-product-', `-${role}-`),
        repositoryRole: role,
      }
    })
  ))
  const issuerRegistry = structuredClone(MANAGED_CI_FIXTURE.issuerRegistry)
  const releaseSigners = RELEASE_SIGNERS
  rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  const runtimeProfile = structuredClone(MANAGED_CI_FIXTURE.runtimeProfile)
  const compatibilityMatrix = readJson(resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json'))
  const externalRuntimeFixture = createExternalRuntimeCertificationFixture({
    inventory,
    desired,
    certifications: baseCertifications,
    matrix: compatibilityMatrix,
    runtimeProfile,
    signer: MANAGED_CI_FIXTURE.runtimeEvidenceSigner,
    now: NOW,
  })
  EXTERNAL_RUNTIME_FIXTURES.push(externalRuntimeFixture)
  const certifications = externalRuntimeFixture.certifications
  const activationInventory = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
  const activationDesired = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
  activationDesired.integrations.governanceCheckApp.id = 1001
  activationDesired.integrations.governanceWriterApp.id = 1002
  const mutationBoundaryContract = readJson(resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json'))
  const activationPolicy = readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json'))
  const expectedActivationPolicyDigest = externalActivationPolicyDigest(activationPolicy)
  const activationProfile = resolveExternalActivationProfile(activationPolicy, {
    expectedPolicyDigest: expectedActivationPolicyDigest,
  })
  const activationRequirements = activatedRequirements(issuerRegistry, activationPolicy, expectedActivationPolicyDigest, {
    inventory: activationInventory,
    desired: activationDesired,
    mutationBoundaryContract,
  })
  const releaseTagAuthorizationPolicy = {
    $schema: 'schemas/release-tag-authorization-policy.schema.json',
    schemaVersion: 2,
    repository: RELEASE_REPOSITORY,
    algorithm: 'ed25519',
    externalActivationPolicyDigest: expectedActivationPolicyDigest,
    authorizationProfileId: activationProfile.id,
    authorizationProfileDigest: activationProfile.sha256,
    releaseAuthorization: structuredClone(activationProfile.releaseAuthorization),
    maxAuthorizationTtlMinutes: 60,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    allowedKeyIds: [releaseSigners[0].keyId],
    requiredSignerQuorum: 1,
  }
  const releaseTagAuthorization = createReleaseTagAuthorization({
    repository: RELEASE_REPOSITORY,
    tag: RELEASE_TAG,
    tagObject: RELEASE_TAG_OBJECT,
    commit: RELEASE_COMMIT,
    tree: RELEASE_TREE,
    policy: releaseTagAuthorizationPolicy,
    issuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
    nonce: 'preflight_authorization_nonce_0123456789',
  })
  for (const item of releaseSigners.slice(0, releaseTagAuthorizationPolicy.requiredSignerQuorum)) signReleaseTagAuthorization(releaseTagAuthorization, {
    signerKeyId: item.keyId,
    subject: item.subject,
    privateKey: item.privateKey,
  })
  return {
    inventory,
    desired,
    rings,
    certifications,
    waivers: { schemaVersion: 1, waivers: [] },
    issuerRegistry,
    runtimeProfile,
    runtimeValidationContext: externalRuntimeFixture.runtimeValidationContext,
    managedCiValidationContext: MANAGED_CI_FIXTURE.managedCiValidationContext,
    activationRequirements,
    activationInventory,
    activationDesired,
    mutationBoundaryContract,
    activationPolicy,
    expectedActivationPolicyDigest,
    releaseTagAuthorizationPolicy,
    releaseTagAuthorization,
  }
}

function reviewerAuthority(context) {
  return resolveReleaseFinalizerSignedAuthority(context.activationRequirements, {
    repository: RELEASE_REPOSITORY,
    releaseTagAuthorizationPolicy: context.releaseTagAuthorizationPolicy,
    inventory: context.activationInventory,
    desired: context.activationDesired,
    mutationBoundaryContract: context.mutationBoundaryContract,
    rings: context.rings,
    issuerRegistry: context.issuerRegistry,
    policy: context.activationPolicy,
    expectedPolicyDigest: context.expectedActivationPolicyDigest,
    now: NOW,
    managedCiValidationContext: context.managedCiValidationContext,
  })
}

function replaceFinalizerAuthorityReadback(context, {
  allowedKeyIds,
  quorum = context.releaseTagAuthorizationPolicy.requiredSignerQuorum,
  observedAt = '2026-07-20T00:00:00.000Z',
  expiresAt = '2026-07-27T00:00:00.000Z',
} = {}) {
  const requirement = context.activationRequirements.requirements.find(
    candidate => candidate.id === 'activate-independent-finalizer-signed-authority',
  )
  assert.ok(requirement, 'missing signed finalizer authority activation fixture')
  requirement.status = 'activated'
  requirement.observedAt = observedAt
  requirement.expiresAt = expiresAt
  requirement.evidence = createExternalActivationEvidence(requirement, {
    policyDigest: context.expectedActivationPolicyDigest,
    issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
    observedResource: {
      allowedKeyIds: allowedKeyIds ?? context.releaseTagAuthorizationPolicy.allowedKeyIds,
      quorum,
      issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
    },
  })
  signExternalActivationRequirement(requirement, {
    signerKeyId: 'fixture-ed25519',
    subject: 'fixture-governance',
    privateKey: ATTESTATION_PRIVATE_KEY,
  })
  return requirement
}

class AlignedReadOnlyClient {
  constructor(context) {
    this.context = context
    this.calls = []
    const repo = context.inventory.repositories[0]
    const assignment = context.rings.assignments[repo.id]
    this.materialized = bindReleaseFinalizerSignedAuthority(materializeProfile(repo, context.desired, context.rings, {
      eligible: true,
      promoted: true,
      ring: assignment.ring,
      wave: assignment.wave,
      blockers: [],
    }), reviewerAuthority(context))
    const profile = context.desired.profiles[repo.desiredProfile]
    this.workflows = new Map()
    const workflowBindings = new Map()
    for (const check of profile.requiredChecks) if (check.workflow) workflowBindings.set(check.workflow, check.workflowIdentity)
    for (const environment of profile.environments) workflowBindings.set(environment.workflow, environment.workflowIdentity)
    if (profile.tagPolicy.sourceWorkflow) workflowBindings.set(profile.tagPolicy.sourceWorkflow, profile.tagPolicy.sourceWorkflowIdentity)
    for (const [path, identity] of workflowBindings) {
      this.workflows.set(path, {
        encoding: 'base64',
        content: readFileSync(resolve(REPO_ROOT, path)).toString('base64'),
        sha: identity.gitBlobSha,
      })
    }
    this.workflowRuns = new Map()
    this.checkRuns = {
      check_runs: profile.requiredChecks.map((check, index) => {
        const integration = context.desired.integrations[check.integration]
        const runId = String(9001 + index)
        if (check.integration === 'githubActions') {
          this.workflowRuns.set(runId, {
            id: runId,
            path: check.workflow,
            head_sha: RELEASE_COMMIT,
            event: check.requiredEvents[0],
            status: 'completed',
            conclusion: 'success',
          })
        }
        return {
          id: Number(runId),
          name: check.context,
          head_sha: RELEASE_COMMIT,
          external_id: check.trustSource === 'protected-base-workflow'
            ? [
                'governance-check-v1',
                `${repo.github}/${check.workflow}@refs/heads/${repo.defaultBranch}`,
                RELEASE_COMMIT,
                RELEASE_COMMIT,
                runId,
                '1',
              ].join('|')
            : null,
          details_url: `https://github.com/${repo.github}/actions/runs/${runId}`,
          status: 'completed',
          conclusion: 'success',
          completed_at: '2026-07-20T00:10:00.000Z',
          app: { id: integration.id, slug: integration.slug },
        }
      }),
    }
  }

  request(method, path) {
    this.calls.push({ method, path })
    assert.equal(method, 'GET', `trust preflight attempted a mutation: ${method} ${path}`)
    const { inventory, desired } = this.context
    const repo = inventory.repositories[0]
    const base = `/repos/${repo.github}`
    if (path === base) return { full_name: repo.github, default_branch: repo.defaultBranch, visibility: repo.visibility }
    if (path === `${base}/commits/${repo.defaultBranch}`) return { sha: RELEASE_COMMIT, commit: { committer: { date: '2026-07-19T23:00:00Z' } } }
    if (path === `${base}/actions/permissions/workflow`) return structuredClone(this.materialized.actionsWorkflowPermissions)
    if (path === `${base}/git/commits/${RELEASE_COMMIT}`) return { sha: RELEASE_COMMIT, tree: { sha: RELEASE_TREE } }
    if (path === `${base}/git/ref/tags/${RELEASE_TAG}`) return { ref: `refs/tags/${RELEASE_TAG}`, object: { type: 'tag', sha: RELEASE_TAG_OBJECT } }
    if (path === `${base}/git/tags/${RELEASE_TAG_OBJECT}`) {
      return {
        sha: RELEASE_TAG_OBJECT,
        tag: RELEASE_TAG,
        object: { type: 'commit', sha: RELEASE_COMMIT },
        verification: {
          verified: true,
          reason: 'valid',
          signature: 'signed-tag-fixture',
          payload: 'signed-payload-fixture',
          verified_at: '2026-07-19T23:30:00Z',
        },
      }
    }
    if (path === `${base}/rulesets?per_page=100`) return this.materialized.rulesets.map((item, index) => ({ id: index + 101, name: item.name }))
    const ruleset = path.match(new RegExp(`^${base}/rulesets/([0-9]+)$`))
    if (ruleset) {
      const item = this.materialized.rulesets[Number(ruleset[1]) - 101]
      return { id: Number(ruleset[1]), ...structuredClone(item) }
    }
    if (path === `${base}/environments?per_page=100`) return { total_count: this.materialized.environments.length, environments: this.materialized.environments.map(item => ({ name: item.name })) }
    const environment = path.match(new RegExp(`^${base}/environments/([^/]+)$`))
    if (environment) return structuredClone(this.materialized.environments.find(item => item.name === decodeURIComponent(environment[1])))
    if (path === `${base}/commits/${RELEASE_COMMIT}/check-runs?per_page=100`) return structuredClone(this.checkRuns)
    const workflowRun = path.match(new RegExp(`^${base}/actions/runs/([1-9][0-9]*)$`))
    if (workflowRun) return structuredClone(this.workflowRuns.get(workflowRun[1]))
    const workflowContent = path.match(new RegExp(`^${base}/contents/(.+)\\?ref=${repo.defaultBranch}$`))
    if (workflowContent) return structuredClone(this.workflows.get(workflowContent[1]) ?? null)
    if (path === `${base}/immutable-releases`) return { enabled: true }
    const app = path.match(/^\/apps\/(.+)$/)
    if (app) {
      const slug = decodeURIComponent(app[1])
      const integration = Object.values(desired.integrations).find(item => item.slug === slug)
      return integration ? { id: integration.id, slug: integration.slug } : null
    }
    const secret = path.match(new RegExp(`^${base}/environments/([^/]+)/secrets/(.+)$`))
    if (secret) return { name: decodeURIComponent(secret[2]), created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-19T00:00:00Z' }
    throw new Error(`unexpected release trust preflight route: ${method} ${path}`)
  }
}

function resolution(context, client = new AlignedReadOnlyClient(context)) {
  return resolveReleaseTrustPreflight({
    ...context,
    client,
    repository: RELEASE_REPOSITORY,
    releaseTag: RELEASE_TAG,
    releaseCommit: RELEASE_COMMIT,
    releaseTree: RELEASE_TREE,
    requirementsSha256: REQUIREMENTS_SHA256,
    releaseTagAuthorizationPolicy: context.releaseTagAuthorizationPolicy,
    issuerRegistry: context.issuerRegistry,
    runId: '42',
    runAttempt: '1',
    now: NOW,
  })
}

function expected(context, overrides = {}) {
  return {
    repository: RELEASE_REPOSITORY,
    releaseTag: RELEASE_TAG,
    releaseCommit: RELEASE_COMMIT,
    releaseTree: RELEASE_TREE,
    desired: context.desired,
    inventory: context.inventory,
    activationRequirements: context.activationRequirements,
    activationInventory: context.activationInventory,
    activationDesired: context.activationDesired,
    activationPolicy: context.activationPolicy,
    expectedActivationPolicyDigest: context.expectedActivationPolicyDigest,
    mutationBoundaryContract: context.mutationBoundaryContract,
    rings: context.rings,
    requirementsSha256: REQUIREMENTS_SHA256,
    releaseTagAuthorizationPolicy: context.releaseTagAuthorizationPolicy,
    issuerRegistry: context.issuerRegistry,
    runId: '42',
    runAttempt: '1',
    now: NOW,
    managedCiValidationContext: context.managedCiValidationContext,
    ...overrides,
  }
}

function stagedReleaseTrustState(repository, inventory, desired) {
  const repo = inventory.repositories.find(item => item.github === repository)
  assert.ok(repo, `missing staged release repository ${repository}`)
  const profile = desired.profiles[repo.desiredProfile]
  assert.ok(profile, `missing staged release profile ${repo.desiredProfile}`)
  const workflows = new Map()
  for (const check of profile.requiredChecks) if (check.workflow) workflows.set(check.workflow, check.workflowIdentity)
  for (const environment of profile.environments) workflows.set(environment.workflow, environment.workflowIdentity)
  if (profile.tagPolicy.sourceWorkflow) workflows.set(profile.tagPolicy.sourceWorkflow, profile.tagPolicy.sourceWorkflowIdentity)
  return {
    integrations: Object.entries(desired.integrations)
      .filter(([, integration]) => integration.required)
      .map(([name, integration]) => ({
        name,
        id: integration.id,
        slug: integration.slug,
        capability: integration.capability,
        observed: { name, id: integration.id, slug: integration.slug },
      })),
    rulesets: profile.rulesets.map(item => item.name),
    requiredChecks: profile.requiredChecks.map(check => ({
      context: check.context,
      integrationId: desired.integrations[check.integration].id,
    })),
    environments: profile.environments.map(environment => {
      const prefix = environment.credentialIntegration
        ? desired.integrations[environment.credentialIntegration]?.secretPrefix
        : null
      const credentialSecrets = prefix ? [`${prefix}_ID`, `${prefix}_PRIVATE_KEY`] : []
      if (environment.name === 'release-finalize') credentialSecrets.push('RELEASE_TAG_READ_TOKEN')
      return { name: environment.name, workflow: environment.workflow, credentialSecrets: credentialSecrets.sort(compareUtf8Bytes) }
    }),
    workflows: [...workflows.entries()]
      .sort(([left], [right]) => compareUtf8Bytes(left, right))
      .map(([path, identity]) => ({ path, identity: structuredClone(identity) })),
    immutableReleases: profile.immutableReleases,
  }
}

function stagedRequiredCheckEvidence(repository, inventory, desired, commit) {
  const repo = inventory.repositories.find(item => item.github === repository)
  const profile = desired.profiles[repo.desiredProfile]
  return profile.requiredChecks.map((check, index) => {
    const integration = desired.integrations[check.integration]
    const runId = String(9100 + index)
    const workflowRun = check.trustSource === 'repository-workflow'
      ? {
          id: runId,
          path: check.workflow,
          head_sha: commit,
          event: check.requiredEvents[0],
          status: 'completed',
          conclusion: 'success',
        }
      : null
    const producer = {
      app: { id: integration.id, slug: integration.slug },
      externalId: check.trustSource === 'protected-base-workflow'
        ? [
            'governance-check-v1',
            `${repository}/${check.workflow}@refs/heads/${repo.defaultBranch}`,
            commit,
            commit,
            runId,
            '1',
          ].join('|')
        : null,
      detailsUrl: `https://github.com/${repository}/actions/runs/${runId}`,
      workflowRun,
    }
    return {
      context: check.context,
      checkRunId: runId,
      integrationId: integration.id,
      producer,
      producerBindingDigest: sha256(stableStringify(producer, 0)),
      headSha: commit,
      headCommittedAt: '2026-07-20T00:00:00.000Z',
      status: 'completed',
      conclusion: 'success',
      completedAt: '2026-07-20T00:10:00.000Z',
    }
  })
}

function writeStagedReleaseTrustRoot(root, context, releaseTagAuthorizationPolicy) {
  const values = new Map([
    ['infra/governance/inventory/managed-repos.json', context.activationInventory],
    ['infra/governance/desired/github.json', context.activationDesired],
    ['infra/governance/release-rings.json', context.rings],
    ['infra/governance/external-activation-requirements.json', context.activationRequirements],
    ['infra/governance/external-activation-policy.json', context.activationPolicy],
    ['infra/governance/providers/github-mutation-boundary-contract.json', context.mutationBoundaryContract],
    ['infra/governance/release-tag-authorization-policy.json', releaseTagAuthorizationPolicy],
  ])
  for (const [path, value] of values) {
    const absolute = resolve(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`)
  }
  return sha256(readFileSync(resolve(root, 'infra/governance/external-activation-requirements.json')))
}

test('live release trust derives runtime identity internally and rejects caller identity before GitHub I/O', async () => {
  class NoIoGhApiClient extends GhApiClient {
    constructor() {
      super()
      this.calls = 0
    }

    request() {
      this.calls += 1
      throw new Error('live runtime identity injection must fail before GitHub I/O')
    }
  }
  const client = new NoIoGhApiClient()
  await assert.rejects(
    () => resolveReleaseTrustPreflight({
      client,
      inventory: { repositories: [] },
      runtimeProfile: {},
      runtimeValidationContext: {
        repoRoot: '/attacker-controlled',
        runtimeIdentity: { profileDigest: 'sha256:attacker' },
        externalRepositoryIdentities: {},
      },
    }),
    /Live GitHub runtime validation refuses an injected runtime validation identity/,
  )
  assert.equal(client.calls, 0)
})

test('release-tag policy profile binding rejects cross-profile, stale, open, and digest-substituted evidence', () => {
  const context = models()
  const policy = context.releaseTagAuthorizationPolicy
  const binding = {
    path: 'infra/governance/release-tag-authorization-policy.json',
    sha256: releaseTagAuthorizationPolicyDigest(policy, {
      externalActivationPolicy: context.activationPolicy,
      expectedExternalActivationPolicyDigest: context.expectedActivationPolicyDigest,
    }),
    externalActivationPolicyDigest: policy.externalActivationPolicyDigest,
    authorizationProfileId: policy.authorizationProfileId,
    authorizationProfileDigest: policy.authorizationProfileDigest,
    releaseAuthorization: structuredClone(policy.releaseAuthorization),
  }
  assert.equal(validateReleaseTagAuthorizationPolicyBinding(binding, policy, {
    externalActivationPolicy: context.activationPolicy,
    expectedExternalActivationPolicyDigest: context.expectedActivationPolicyDigest,
  }), binding)

  for (const [label, mutate, pattern] of [
    [
      'cross-profile',
      value => {
        value.authorizationProfileId = MAXIMUM_PROFILE_ID
      },
      /preflight profile ID mismatch/,
    ],
    ['stale profile', value => { value.authorizationProfileDigest = 'd'.repeat(64) }, /profile digest is stale or substituted/],
    ['cross-policy', value => { value.externalActivationPolicyDigest = 'c'.repeat(64) }, /external activation policy mismatch/],
    ['range substitution', value => { value.releaseAuthorization.maximumSignerQuorum = 2 }, /releaseAuthorization range is stale or substituted/],
    ['substituted policy', value => { value.sha256 = 'e'.repeat(64) }, /policy drifted/],
    ['open shape', value => { value.untrusted = true }, /invalid or open shape/],
  ]) {
    const tampered = structuredClone(binding)
    mutate(tampered)
    assert.throws(() => validateReleaseTagAuthorizationPolicyBinding(tampered, policy, {
      externalActivationPolicy: context.activationPolicy,
      expectedExternalActivationPolicyDigest: context.expectedActivationPolicyDigest,
    }), pattern, label)
  }
})

test('small-team finalizer authority projects and binds the canonical one-signer profile', () => {
  const context = models()
  const authority = reviewerAuthority(context)
  assert.equal(authority.externalActivationPolicyDigest, context.expectedActivationPolicyDigest)
  assert.equal(authority.authorizationProfileId, SMALL_TEAM_PROFILE_ID)
  assert.deepEqual(authority.releaseAuthorization, {
    minimumSignerQuorum: 1,
    maximumSignerQuorum: 1,
  })
  assert.deepEqual(authority.allowedKeyIds, ['release-one'])
  assert.equal(authority.requiredSignerQuorum, 1)
  const materialized = {
    environments: [{ name: 'release-finalize', reviewers: [], prevent_self_review: false }],
    declaredEnvironments: [{ name: 'release-finalize', reviewers: [], preventSelfReview: false }],
  }
  assert.equal(bindReleaseFinalizerSignedAuthority(materialized, authority), materialized)

  for (const mutate of [
    value => { value.authorizationProfileId = MAXIMUM_PROFILE_ID },
    value => { value.releaseAuthorization.minimumSignerQuorum = 2 },
    value => { value.requiredSignerQuorum = 0 },
  ]) {
    const tampered = structuredClone(authority)
    mutate(tampered)
    assert.throws(
      () => bindReleaseFinalizerSignedAuthority(materialized, tampered),
      /signed finalizer authority is invalid/,
    )
  }
})

test('candidate-null rollout still resolves exact live GitHub trust using read-only calls', async () => {
  const context = models()
  const client = new AlignedReadOnlyClient(context)
  assert.equal(context.rings.candidateRelease, null)
  const evidence = await resolution(context, client)
  assert.equal(evidence.release.commit, RELEASE_COMMIT)
  assert.equal(evidence.release.tree, RELEASE_TREE)
  assert.equal(evidence.release.tag, RELEASE_TAG)
  assert.equal(evidence.release.tagObject, RELEASE_TAG_OBJECT)
  assert.equal(evidence.releaseTagAuthorization.authorizationDigest, context.releaseTagAuthorization.authorizationDigest)
  assert.match(evidence.releaseTagAuthorizationPolicy.sha256, /^[a-f0-9]{64}$/)
  assert.equal(
    evidence.releaseTagAuthorizationPolicy.authorizationProfileId,
    SMALL_TEAM_PROFILE_ID,
  )
  assert.equal(
    evidence.releaseTagAuthorizationPolicy.authorizationProfileDigest,
    resolveExternalActivationProfile(context.activationPolicy, {
      expectedPolicyDigest: context.expectedActivationPolicyDigest,
    }).sha256,
  )
  assert.deepEqual(evidence.independentReviewerAuthority.allowedKeyIds, ['release-one'])
  assert.deepEqual(evidence.independentReviewerAuthority.authorizerSubjects, ['operator:release-one'])
  assert.equal(evidence.independentReviewerAuthority.authorityDigest, reviewerAuthority(context).authorityDigest)
  assert.deepEqual(evidence.release.verification, { verified: true, reason: 'valid', verifiedAt: '2026-07-19T23:30:00Z' })
  assert.equal(evidence.trust.immutableReleases, true)
  assert.deepEqual(evidence.trust.integrations.map(item => item.observed.id), [15368])
  assert.ok(client.calls.length > 0 && client.calls.every(call => call.method === 'GET'))
  assert.match(releaseTrustPreflightEvidenceDigest(evidence, expected(context)), /^[a-f0-9]{64}$/)
})

test('staged rollout dispatches a genuine signed release-trust artifact through the closed validator and one-root activation tuple', () => {
  const context = models()
  const repository = 'ajenchen/design-system'
  const activationProfile = resolveExternalActivationProfile(context.activationPolicy, {
    expectedPolicyDigest: context.expectedActivationPolicyDigest,
  })
  const releaseTagAuthorizationPolicy = {
    $schema: 'schemas/release-tag-authorization-policy.schema.json',
    schemaVersion: 2,
    repository,
    algorithm: 'ed25519',
    externalActivationPolicyDigest: context.expectedActivationPolicyDigest,
    authorizationProfileId: activationProfile.id,
    authorizationProfileDigest: activationProfile.sha256,
    releaseAuthorization: structuredClone(activationProfile.releaseAuthorization),
    maxAuthorizationTtlMinutes: 60,
    clockSkewSeconds: 120,
    issuerRegistryDigest: issuerRegistryDigest(context.issuerRegistry),
    allowedKeyIds: [RELEASE_SIGNERS[0].keyId],
    requiredSignerQuorum: 1,
  }
  const releaseTagAuthorization = createReleaseTagAuthorization({
    repository,
    tag: RELEASE_TAG,
    tagObject: RELEASE_TAG_OBJECT,
    commit: RELEASE_COMMIT,
    tree: RELEASE_TREE,
    policy: releaseTagAuthorizationPolicy,
    issuerRegistry: context.issuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
    nonce: 'staged_release_trust_nonce_0123456789',
  })
  for (const item of RELEASE_SIGNERS.slice(0, releaseTagAuthorizationPolicy.requiredSignerQuorum)) signReleaseTagAuthorization(releaseTagAuthorization, {
    signerKeyId: item.keyId,
    subject: item.subject,
    privateKey: item.privateKey,
  })

  const root = mkdtempSync(resolve(tmpdir(), 'staged-release-trust-activated-'))
  const driftedRoot = mkdtempSync(resolve(tmpdir(), 'staged-release-trust-cross-root-'))
  try {
    const requirementsSha256 = writeStagedReleaseTrustRoot(root, context, releaseTagAuthorizationPolicy)
    writeStagedReleaseTrustRoot(driftedRoot, context, releaseTagAuthorizationPolicy)
    const evidence = {
      schemaVersion: 4,
      kind: 'release-trust-preflight',
      repository,
      workflow: {
        path: '.github/workflows/release.yml',
        event: 'repository_dispatch',
        runId: '42',
        runAttempt: '1',
      },
      release: {
        tag: RELEASE_TAG,
        tagObject: RELEASE_TAG_OBJECT,
        commit: RELEASE_COMMIT,
        tree: RELEASE_TREE,
        verification: {
          verified: true,
          reason: 'valid',
          verifiedAt: '2026-07-20T00:00:00.000Z',
        },
      },
      releaseTagAuthorization,
      releaseTagAuthorizationPolicy: {
        path: 'infra/governance/release-tag-authorization-policy.json',
        sha256: releaseTagAuthorizationPolicyDigest(releaseTagAuthorizationPolicy, {
          externalActivationPolicy: context.activationPolicy,
          expectedExternalActivationPolicyDigest: context.expectedActivationPolicyDigest,
        }),
        externalActivationPolicyDigest: releaseTagAuthorizationPolicy.externalActivationPolicyDigest,
        authorizationProfileId: releaseTagAuthorizationPolicy.authorizationProfileId,
        authorizationProfileDigest: releaseTagAuthorizationPolicy.authorizationProfileDigest,
        releaseAuthorization: structuredClone(releaseTagAuthorizationPolicy.releaseAuthorization),
      },
      inventoryDigest: sha256(stableStringify(context.activationInventory, 0)),
      desiredDigest: sha256(stableStringify(context.activationDesired, 0)),
      observedStateDigest: 'a'.repeat(64),
      independentReviewerAuthority: reviewerAuthority(context),
      trust: stagedReleaseTrustState(repository, context.activationInventory, context.activationDesired),
      requiredCheckEvidence: stagedRequiredCheckEvidence(repository, context.activationInventory, context.activationDesired, RELEASE_COMMIT),
      externalActivationRequirements: {
        path: 'infra/governance/external-activation-requirements.json',
        sha256: requirementsSha256,
      },
      verifiedAt: NOW.toISOString(),
    }
    const validationContext = {
      receipt: { observedAt: NOW.toISOString() },
      candidateRecord: {
        candidateRelease: {
          version: RELEASE_TAG.slice(1),
          sourceCommit: RELEASE_COMMIT,
          sourceTree: RELEASE_TREE,
        },
      },
      repoRoot: root,
      issuerRegistry: context.issuerRegistry,
      observedAt: NOW.toISOString(),
      managedCiValidationContext: context.managedCiValidationContext,
      contractValidators: null,
    }
    assert.equal(
      validateStagedReleaseTrustEvidence(evidence, validationContext),
      evidence,
    )
    assert.throws(
      () => validateStagedReleaseTrustEvidence(evidence, {
        ...validationContext,
        contractValidators: { 'release-trust-preflight-v4': () => true },
      }),
      /forbids injected contract validators/,
    )

    rmSync(resolve(root, 'infra/governance/providers/github-mutation-boundary-contract.json'))
    assert.throws(
      () => validateStagedReleaseTrustEvidence(evidence, validationContext),
      /ENOENT/,
    )

    const driftedDesiredPath = resolve(driftedRoot, 'infra/governance/desired/github.json')
    const driftedDesired = JSON.parse(readFileSync(driftedDesiredPath, 'utf8'))
    driftedDesired.integrations.governanceWriterApp.id += 1
    writeFileSync(driftedDesiredPath, `${JSON.stringify(driftedDesired, null, 2)}\n`)
    assert.throws(
      () => validateStagedReleaseTrustEvidence(evidence, {
        ...validationContext,
        repoRoot: driftedRoot,
      }),
      /desired-state digest mismatch|App ids differ from immutable desired integration identities/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(driftedRoot, { recursive: true, force: true })
  }
})

test('release trust refuses a digest-bound activation ledger that lacks completed signed evidence', async () => {
  const context = models()
  const client = new AlignedReadOnlyClient(context)
  const requirement = context.activationRequirements.requirements[0]
  requirement.status = 'not-activated'
  requirement.evidence = null
  requirement.observedAt = null
  requirement.expiresAt = null
  await assert.rejects(resolution(context, client), /External activation is incomplete for release/)
  assert.equal(client.calls.length, 0, 'release trust should reject incomplete activation before live privileged preflight')
})

test('release trust evidence and external activation records satisfy their closed schemas', async () => {
  const context = models()
  const evidence = await resolution(context)
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  ajv.addSchema(readJson(resolve(GOVERNANCE_ROOT, 'schemas/release-tag-authorization.schema.json')))
  for (const [schemaName, valueName, value] of [
    ['schemas/release-trust-preflight-evidence.schema.json', 'release trust evidence', evidence],
    ['schemas/external-activation-requirements.schema.json', 'external activation requirements', readJson(resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json'))],
  ]) {
    const validate = ajv.compile(readJson(resolve(GOVERNANCE_ROOT, schemaName)))
    assert.equal(validate(value), true, `${valueName}: ${ajv.errorsText(validate.errors)}`)
  }
})

test('privileged rebind rejects run replay, model drift, and nested trust tampering', async () => {
  const context = models()
  const evidence = await resolution(context)
  const activationVariant = () => ({
    ...context,
    activationRequirements: structuredClone(context.activationRequirements),
  })
  assert.throws(() => validateReleaseTrustPreflightEvidence(evidence, expected(context, { runAttempt: '2' })), /run replay detected/)

  const changedDesired = structuredClone(context.desired)
  changedDesired.integrations.governanceWriterApp.id += 1
  assert.throws(() => validateReleaseTrustPreflightEvidence(evidence, expected(context, { desired: changedDesired })), /desired-state digest mismatch/)

  const differentActivationTree = structuredClone(context.activationDesired)
  differentActivationTree.integrations.governanceWriterApp.id += 1
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(context, { activationDesired: differentActivationTree })),
    /App ids differ from immutable desired integration identities/,
  )

  const tampered = structuredClone(evidence)
  tampered.trust.integrations
    .find(integration => integration.name === 'githubActions').observed.id += 1
  assert.throws(() => validateReleaseTrustPreflightEvidence(tampered, expected(context)), /observed trust state differs/)

  const tagTampered = structuredClone(evidence)
  tagTampered.release.tagObject = '5'.repeat(40)
  assert.throws(() => releaseTrustPreflightEvidenceDigest(tagTampered, expected(context)), /tagObject mismatch/)

  const substitutedProfile = structuredClone(evidence)
  substitutedProfile.releaseTagAuthorizationPolicy.authorizationProfileId =
    MAXIMUM_PROFILE_ID
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(substitutedProfile, expected(context)),
    /preflight profile ID mismatch/,
  )

  const staleProfile = structuredClone(evidence)
  staleProfile.releaseTagAuthorizationPolicy.authorizationProfileDigest = 'd'.repeat(64)
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(staleProfile, expected(context)),
    /preflight profile digest is stale or substituted/,
  )

  const missingReviewer = activationVariant()
  replaceFinalizerAuthorityReadback(missingReviewer, { allowedKeyIds: [] })
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(missingReviewer)),
    {
      name: 'Error',
      message: 'External activation activate-independent-finalizer-signed-authority release authorizer set is invalid for PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM',
    },
  )

  const reducedQuorum = activationVariant()
  replaceFinalizerAuthorityReadback(reducedQuorum, { quorum: 0 })
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(reducedQuorum)),
    /release authorization quorum is invalid/,
  )

  const substitutedAuthorizer = activationVariant()
  replaceFinalizerAuthorityReadback(substitutedAuthorizer, {
    allowedKeyIds: ['fixture-ed25519'],
  })
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(substitutedAuthorizer)),
    /detached from the canonical release authorization policy/,
  )

  const staleReviewer = activationVariant()
  replaceFinalizerAuthorityReadback(staleReviewer, {
    observedAt: '2026-07-19T23:00:00.000Z',
    expiresAt: '2026-07-20T00:29:59.000Z',
  })
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(staleReviewer)),
    /evidence is expired/,
  )

  const replayedReviewer = activationVariant()
  replaceFinalizerAuthorityReadback(replayedReviewer, {
    allowedKeyIds: ['release-two'],
  })
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(replayedReviewer)),
    /detached from the canonical release authorization policy/,
  )

  const tamperedReviewer = activationVariant()
  const reviewerRequirement = tamperedReviewer.activationRequirements.requirements.find(
    candidate => candidate.id === 'activate-independent-finalizer-signed-authority',
  )
  reviewerRequirement.evidence.payload.observedResource.allowedKeyIds[0] = 'release-substituted'
  assert.throws(
    () => validateReleaseTrustPreflightEvidence(evidence, expected(tamperedReviewer)),
    /readback payload digest mismatch|content-addressed evidence digest mismatch|signature is invalid/,
  )
})

test('finalizer historical audit revalidates issued evidence without extending its TTL', async () => {
  const context = models()
  const directory = mkdtempSync(resolve(tmpdir(), 'release-trust-issued-audit-'))
  try {
    const requirementsBody = `${JSON.stringify(context.activationRequirements, null, 2)}\n`
    const requirementsSha256 = sha256(Buffer.from(requirementsBody))
    const evidence = await resolveReleaseTrustPreflight({
      ...context,
      client: new AlignedReadOnlyClient(context),
      repository: RELEASE_REPOSITORY,
      releaseTag: RELEASE_TAG,
      releaseCommit: RELEASE_COMMIT,
      releaseTree: RELEASE_TREE,
      requirementsSha256,
      releaseTagAuthorizationPolicy: context.releaseTagAuthorizationPolicy,
      issuerRegistry: context.issuerRegistry,
      runId: '42',
      runAttempt: '1',
      now: NOW,
    })
    const digest = releaseTrustPreflightEvidenceDigest(evidence, expected(context, { requirementsSha256 }))
    const files = {
      evidence: join(directory, 'evidence.json'),
      inventory: join(directory, 'inventory.json'),
      desired: join(directory, 'desired.json'),
      rings: join(directory, 'rings.json'),
      certifications: join(directory, 'certifications.json'),
      waivers: join(directory, 'waivers.json'),
      requirements: join(directory, 'requirements.json'),
      activationInventory: join(directory, 'activation-inventory.json'),
      activationDesired: join(directory, 'activation-desired.json'),
      activationPolicy: join(directory, 'activation-policy.json'),
      mutationBoundaryContract: join(directory, 'mutation-boundary-contract.json'),
      issuerRegistry: join(directory, 'issuers.json'),
      policy: join(directory, 'policy.json'),
      runtimeProfile: join(directory, 'runtime-profile.json'),
      event: join(directory, 'event.json'),
      resolvedEvidence: join(directory, 'resolved', 'release-trust-preflight.json'),
      resolvedGithubOutput: join(directory, 'resolved-github-output.txt'),
      githubOutput: join(directory, 'github-output.txt'),
      retainedEvidence: join(directory, 'retained', 'release-trust-preflight.json'),
    }
    for (const [name, value] of Object.entries({
      evidence,
      inventory: context.inventory,
      desired: context.desired,
      rings: context.rings,
      certifications: context.certifications,
      waivers: context.waivers,
      issuerRegistry: context.issuerRegistry,
      policy: context.releaseTagAuthorizationPolicy,
      runtimeProfile: context.runtimeProfile,
      activationInventory: context.activationInventory,
      activationDesired: context.activationDesired,
      activationPolicy: context.activationPolicy,
      mutationBoundaryContract: context.mutationBoundaryContract,
    })) writeFileSync(files[name], `${JSON.stringify(value, null, 2)}\n`)
    writeFileSync(files.requirements, requirementsBody)
    writeFileSync(files.event, `${JSON.stringify({
      action: 'stage-protected-release',
      client_payload: { releaseTagAuthorization: context.releaseTagAuthorization, tag: RELEASE_TAG },
    }, null, 2)}\n`)
    const resolved = await runReleaseTrustPreflight([
      '--repository', RELEASE_REPOSITORY,
      '--release-tag', RELEASE_TAG,
      '--release-commit', RELEASE_COMMIT,
      '--release-tree', RELEASE_TREE,
      '--run-id', '42',
      '--run-attempt', '1',
      '--event', files.event,
      '--output', files.resolvedEvidence,
      '--github-output', files.resolvedGithubOutput,
      '--inventory', files.inventory,
      '--desired', files.desired,
      '--activation-inventory', files.activationInventory,
      '--activation-desired', files.activationDesired,
      '--rings', files.rings,
      '--certifications', files.certifications,
      '--waivers', files.waivers,
      '--requirements', files.requirements,
      '--external-activation-policy', files.activationPolicy,
      '--mutation-boundary-contract', files.mutationBoundaryContract,
      '--issuer-registry', files.issuerRegistry,
      '--release-tag-policy', files.policy,
      '--runtime-profile', files.runtimeProfile,
    ], {
      client: new AlignedReadOnlyClient(context),
      now: NOW,
      activationPolicy: context.activationPolicy,
      runtimeValidationContext: context.runtimeValidationContext,
    })
    const resolvedEvidenceBytes = readFileSync(files.resolvedEvidence)
    const resolvedEvidenceFileSha256 = sha256(resolvedEvidenceBytes)
    assert.equal(resolved.digest, digest)
    assert.equal(resolved.evidenceFileSha256, resolvedEvidenceFileSha256)
    assert.equal(
      readFileSync(files.resolvedGithubOutput, 'utf8'),
      `evidence_digest=${digest}\nevidence_file_sha256=${resolvedEvidenceFileSha256}\nauthorization_digest=${context.releaseTagAuthorization.authorizationDigest}\ntag_object=${RELEASE_TAG_OBJECT}\n`,
    )
    const common = [
      '--expected-digest', digest,
      '--repository', RELEASE_REPOSITORY,
      '--release-tag', RELEASE_TAG,
      '--release-commit', RELEASE_COMMIT,
      '--release-tree', RELEASE_TREE,
      '--run-id', '42',
      '--run-attempt', '1',
      '--inventory', files.inventory,
      '--desired', files.desired,
      '--activation-inventory', files.activationInventory,
      '--activation-desired', files.activationDesired,
      '--rings', files.rings,
      '--requirements', files.requirements,
      '--external-activation-policy', files.activationPolicy,
      '--mutation-boundary-contract', files.mutationBoundaryContract,
      '--issuer-registry', files.issuerRegistry,
      '--release-tag-policy', files.policy,
      '--runtime-profile', files.runtimeProfile,
    ]
    const muchLater = new Date('2026-08-20T00:30:00.000Z')
    await assert.rejects(
      runReleaseTrustPreflight(['--verify', files.evidence, ...common], { now: muchLater, activationPolicy: context.activationPolicy }),
      /expired|stale or from the future/,
    )
    const result = await runReleaseTrustPreflight([
      '--verify-issued', files.evidence,
      '--expected-authorization-digest', context.releaseTagAuthorization.authorizationDigest,
      '--retain-exact', files.retainedEvidence,
      '--github-output', files.githubOutput,
      ...common,
    ], { now: muchLater, activationPolicy: context.activationPolicy })
    const originalEvidenceBytes = readFileSync(files.evidence)
    const evidenceFileSha256 = sha256(originalEvidenceBytes)
    assert.equal(result.digest, digest)
    assert.equal(result.evidenceFileSha256, evidenceFileSha256)
    assert.deepEqual(readFileSync(files.retainedEvidence), originalEvidenceBytes)
    assert.equal(
      readFileSync(files.githubOutput, 'utf8'),
      `tag_object=${RELEASE_TAG_OBJECT}\nevidence_file_sha256=${evidenceFileSha256}\n`,
    )
    const wrongAuthorization = `${'0'.repeat(64)}`
    await assert.rejects(
      runReleaseTrustPreflight([
        '--verify-issued', files.evidence,
        '--expected-authorization-digest', wrongAuthorization,
        ...common,
      ], { now: muchLater, activationPolicy: context.activationPolicy }),
      /authorization digest mismatch/,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('GitHub-valid signed tag still fails when independent release authorization lacks quorum', async () => {
  const context = models()
  context.releaseTagAuthorization.signatures.pop()
  const client = new AlignedReadOnlyClient(context)
  await assert.rejects(resolution(context, client), /requires exactly 1 signature/)
  assert.ok(client.calls.some(call => call.path.includes(`/git/tags/${RELEASE_TAG_OBJECT}`)), 'valid GitHub tag object was not independently resolved')
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('repository-dispatch event reader requires the exact closed authorization payload', () => {
  const context = models()
  const directory = mkdtempSync(resolve(tmpdir(), 'release-trust-event-'))
  const path = resolve(directory, 'event.json')
  try {
    const write = clientPayload => writeFileSync(path, JSON.stringify({ action: 'stage-protected-release', client_payload: clientPayload }))
    const payload = { tag: RELEASE_TAG, releaseTagAuthorization: context.releaseTagAuthorization }
    write(payload)
    assert.equal(readReleaseTagAuthorizationEvent(path, RELEASE_TAG).authorizationDigest, context.releaseTagAuthorization.authorizationDigest)
    write({ ...payload, unexpected: true })
    assert.throws(() => readReleaseTagAuthorizationEvent(path, RELEASE_TAG), /invalid or open shape/)
    write({ ...payload, tag: 'v9.9.9' })
    assert.throws(() => readReleaseTagAuthorizationEvent(path, RELEASE_TAG), /does not match --release-tag/)
    writeFileSync(path, JSON.stringify({ action: 'untrusted-action', client_payload: payload }))
    assert.throws(() => readReleaseTagAuthorizationEvent(path, RELEASE_TAG), /action is not stage-protected-release/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('unsigned or lightweight remote tags fail before trust evidence can be issued', async () => {
  const context = models()
  for (const [label, mutate, pattern] of [
    ['lightweight', (path, value) => path.includes('/git/ref/tags/') ? { ...value, object: { type: 'commit', sha: RELEASE_COMMIT } } : value, /annotated tag object/],
    ['unsigned', (path, value) => path.includes('/git/tags/') ? { ...value, verification: { verified: false, reason: 'unsigned', signature: null, payload: null, verified_at: null } } : value, /not acceptable for release.*unsigned/],
    ['wrong name', (path, value) => path.includes('/git/tags/') ? { ...value, tag: 'v9.9.9' } : value, /tag name mismatch/],
    ['moved target', (path, value) => path.includes('/git/tags/') ? { ...value, object: { type: 'commit', sha: '6'.repeat(40) } } : value, /remote tag moved/],
  ]) {
    const aligned = new AlignedReadOnlyClient(context)
    const client = {
      request(method, path, ...rest) {
        return mutate(path, aligned.request(method, path, ...rest))
      },
    }
    await assert.rejects(resolution(context, client), pattern, label)
    assert.ok(aligned.calls.every(call => call.method === 'GET'))
  }
})

test('insufficient observation permission fails closed and never attempts a write', async () => {
  const context = models()
  const aligned = new AlignedReadOnlyClient(context)
  const client = {
    request(method, path, ...rest) {
      if (path === '/apps/github-actions') {
        aligned.calls.push({ method, path })
        throw new Error('GitHub API HTTP 403: resource not accessible by integration')
      }
      return aligned.request(method, path, ...rest)
    },
  }
  await assert.rejects(resolution(context, client), /HTTP 403/)
  assert.ok(aligned.calls.length > 0 && aligned.calls.every(call => call.method === 'GET'))
})
