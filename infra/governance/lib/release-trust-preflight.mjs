import { compareUtf8Bytes, invariant, sha256, stableStringify } from './common.mjs'
import {
  releaseTagAuthorizationPolicyDigest,
  verifyReleaseTagAuthorization,
} from './release-tag-authorization.mjs'
import { assertVerifiedReleaseTag, resolveVerifiedReleaseTag } from './signed-release-tag.mjs'
import {
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  resolveReleaseFinalizerSignedAuthority,
} from './external-activation.mjs'
import { validateRequiredCheckProducer } from './check-run-trust.mjs'
import { resolveGitHubRuntimeValidationContext, runtimeCertificationPaths } from './runtime-certification.mjs'

export const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml'
export const RELEASE_WORKFLOW_EVENT = 'repository_dispatch'
export const EXTERNAL_ACTIVATION_REQUIREMENTS_PATH = 'infra/governance/external-activation-requirements.json'
export const RELEASE_TAG_AUTHORIZATION_POLICY_PATH = 'infra/governance/release-tag-authorization-policy.json'
export const RELEASE_TAG_READ_SECRET = 'RELEASE_TAG_READ_TOKEN'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/
const INDEPENDENT_REVIEWER_AUTHORITY_KEYS = Object.freeze([
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
  'authorityDigest',
])
const clone = value => JSON.parse(JSON.stringify(value))

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function canonicalDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value), `${label} must be canonical UTC`)
  return parsed
}

export function validateReleaseTagAuthorizationPolicyBinding(binding, releaseTagAuthorizationPolicy, {
  externalActivationPolicy,
  expectedExternalActivationPolicyDigest = EXTERNAL_ACTIVATION_POLICY_DIGEST,
} = {}) {
  exactKeys(
    binding,
    [
      'path',
      'sha256',
      'externalActivationPolicyDigest',
      'authorizationProfileId',
      'authorizationProfileDigest',
      'releaseAuthorization',
    ],
    'release-tag authorization policy binding',
  )
  exactKeys(binding.releaseAuthorization, ['minimumSignerQuorum', 'maximumSignerQuorum'], 'release-tag authorization policy releaseAuthorization binding')
  invariant(binding.path === RELEASE_TAG_AUTHORIZATION_POLICY_PATH, 'release-tag authorization policy path mismatch')
  const authorizationPolicyDigest = releaseTagAuthorizationPolicyDigest(releaseTagAuthorizationPolicy, {
    externalActivationPolicy,
    expectedExternalActivationPolicyDigest,
  })
  invariant(binding.sha256 === authorizationPolicyDigest, 'release-tag authorization policy drifted')
  invariant(
    binding.externalActivationPolicyDigest === releaseTagAuthorizationPolicy.externalActivationPolicyDigest,
    'release-tag authorization preflight external activation policy mismatch',
  )
  invariant(
    binding.authorizationProfileId === releaseTagAuthorizationPolicy.authorizationProfileId,
    'release-tag authorization preflight profile ID mismatch',
  )
  invariant(
    binding.authorizationProfileDigest === releaseTagAuthorizationPolicy.authorizationProfileDigest,
    'release-tag authorization preflight profile digest is stale or substituted',
  )
  invariant(
    stableStringify(binding.releaseAuthorization, 0) === stableStringify(releaseTagAuthorizationPolicy.releaseAuthorization, 0),
    'release-tag authorization preflight releaseAuthorization range is stale or substituted',
  )
  return binding
}

export function bindReleaseFinalizerSignedAuthority(materialized, authority) {
  exactKeys(authority, INDEPENDENT_REVIEWER_AUTHORITY_KEYS, 'Release trust preflight signed finalizer authority')
  const authorityCore = clone(authority)
  delete authorityCore.authorityDigest
  invariant(
    authority.schemaVersion === 1
      && authority.kind === 'release-finalizer-signed-authority-v1'
      && authority.requirementId === 'activate-independent-finalizer-signed-authority'
      && authority.desiredPath === RELEASE_TAG_AUTHORIZATION_POLICY_PATH
      && authority.workflow === '.github/workflows/release-finalize.yml'
      && SHA256.test(authority.externalActivationPolicyDigest || '')
      && typeof authority.authorizationProfileId === 'string'
      && authority.authorizationProfileId.length > 0
      && SHA256.test(authority.authorizationProfileDigest || '')
      && authority.releaseAuthorization
      && typeof authority.releaseAuthorization === 'object'
      && !Array.isArray(authority.releaseAuthorization)
      && Object.keys(authority.releaseAuthorization).sort(compareUtf8Bytes).join(',')
        === ['maximumSignerQuorum', 'minimumSignerQuorum'].join(',')
      && Number.isInteger(authority.releaseAuthorization.minimumSignerQuorum)
      && Number.isInteger(authority.releaseAuthorization.maximumSignerQuorum)
      && authority.releaseAuthorization.minimumSignerQuorum >= 1
      && authority.releaseAuthorization.maximumSignerQuorum <= 5
      && authority.releaseAuthorization.minimumSignerQuorum <= authority.releaseAuthorization.maximumSignerQuorum
      && Array.isArray(authority.allowedKeyIds)
      && authority.allowedKeyIds.length >= authority.releaseAuthorization.minimumSignerQuorum
      && new Set(authority.allowedKeyIds).size === authority.allowedKeyIds.length
      && Number.isInteger(authority.requiredSignerQuorum)
      && authority.requiredSignerQuorum >= authority.releaseAuthorization.minimumSignerQuorum
      && authority.requiredSignerQuorum <= authority.releaseAuthorization.maximumSignerQuorum
      && authority.requiredSignerQuorum <= authority.allowedKeyIds.length
      && (
        authority.releaseAuthorization.minimumSignerQuorum !== authority.releaseAuthorization.maximumSignerQuorum
        || authority.requiredSignerQuorum === authority.releaseAuthorization.minimumSignerQuorum
      )
      && Array.isArray(authority.authorizerSubjects)
      && authority.authorizerSubjects.length === authority.allowedKeyIds.length
      && new Set(authority.authorizerSubjects).size === authority.authorizerSubjects.length
      && SHA256.test(authority.authorityDigest || '')
      && authority.authorityDigest === sha256(stableStringify(authorityCore, 0)),
    'Release trust preflight signed finalizer authority is invalid',
  )
  const releaseFinalizeEnvironments = materialized.environments.filter(environment => environment.name === 'release-finalize')
  const declaredReleaseFinalizeEnvironments = materialized.declaredEnvironments.filter(environment => environment.name === 'release-finalize')
  invariant(
    releaseFinalizeEnvironments.length === 1
      && declaredReleaseFinalizeEnvironments.length === 1
      && releaseFinalizeEnvironments[0].reviewers.length === 0
      && releaseFinalizeEnvironments[0].prevent_self_review === false
      && declaredReleaseFinalizeEnvironments[0].reviewers.length === 0
      && declaredReleaseFinalizeEnvironments[0].preventSelfReview === false,
    'Release trust preflight finalizer environment must remain protected without a human engineering-decision gate',
  )
  return materialized
}

// Backward-compatible export name only; no human reviewer is materialized.
export const bindReleaseFinalizerReviewerAuthority = bindReleaseFinalizerSignedAuthority

function expectedTrust(materialized, desired) {
  const workflowMap = new Map()
  for (const check of materialized.requiredChecks) if (check.workflow) workflowMap.set(check.workflow, check.workflowIdentity)
  for (const environment of materialized.declaredEnvironments) workflowMap.set(environment.workflow, environment.workflowIdentity)
  if (materialized.tagPolicy.sourceWorkflow) workflowMap.set(materialized.tagPolicy.sourceWorkflow, materialized.tagPolicy.sourceWorkflowIdentity)
  return {
    integrations: Object.entries(desired.integrations).filter(([, integration]) => integration.required).map(([name, integration]) => ({
      name,
      id: integration.id,
      slug: integration.slug,
      capability: integration.capability,
    })),
    rulesets: materialized.rulesets.map(item => item.name),
    requiredChecks: materialized.requiredChecks.map(check => ({
      context: check.context,
      integrationId: desired.integrations[check.integration].id,
    })),
    environments: materialized.declaredEnvironments.map(environment => ({ name: environment.name, workflow: environment.workflow })),
    workflows: [...workflowMap.entries()].sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([path, identity]) => ({ path, identity: clone(identity) })),
    immutableReleases: materialized.immutableReleases,
  }
}

function expectedTrustFromModels(repository, inventory, desired) {
  const repo = inventory.repositories.find(item => item.github === repository)
  invariant(repo, `release trust preflight repository is not in inventory: ${repository}`)
  const profile = desired.profiles[repo.desiredProfile]
  invariant(profile, `release trust preflight desired profile is missing: ${repo.desiredProfile}`)
  const workflowMap = new Map()
  for (const check of profile.requiredChecks) if (check.workflow) workflowMap.set(check.workflow, check.workflowIdentity)
  for (const environment of profile.environments) workflowMap.set(environment.workflow, environment.workflowIdentity)
  if (profile.tagPolicy.sourceWorkflow) workflowMap.set(profile.tagPolicy.sourceWorkflow, profile.tagPolicy.sourceWorkflowIdentity)
  return {
    integrations: Object.entries(desired.integrations).filter(([, integration]) => integration.required).map(([name, integration]) => {
      invariant(Number.isInteger(integration.id) && integration.id > 0, `release trust preflight required integration is unresolved: ${name}`)
      return {
        name,
        id: integration.id,
        slug: integration.slug,
        capability: integration.capability,
        observed: { name, id: integration.id, slug: integration.slug },
      }
    }),
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
      if (environment.name === 'release-finalize') credentialSecrets.push(RELEASE_TAG_READ_SECRET)
      return {
        name: environment.name,
        workflow: environment.workflow,
        credentialSecrets: credentialSecrets.sort(compareUtf8Bytes),
      }
    }),
    workflows: [...workflowMap.entries()].sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([path, identity]) => ({ path, identity: clone(identity) })),
    immutableReleases: profile.immutableReleases,
  }
}

function checkEvidence(repo, materialized, observed, desired, now) {
  return materialized.requiredChecks.map(check => {
    const integration = desired.integrations[check.integration]
    const integrationId = integration.id
    const committedAt = new Date(observed.defaultBranchCommittedAt)
    const minimumCompletedAt = new Date(now.getTime() - desired.checkRunMaxAgeMinutes * 60_000)
    const maximumCompletedAt = new Date(now.getTime() + desired.checkRunClockSkewSeconds * 1000)
    const matches = observed.checkRuns.filter(run => {
      const completedAt = new Date(run.completed_at)
      return run.name === check.context
        && run.app?.id === integrationId
        && run.app?.slug === integration.slug
        && run.head_sha === observed.defaultBranchHeadSha
        && run.status === 'completed'
        && run.conclusion === 'success'
        && Number.isFinite(completedAt.getTime())
        && completedAt >= committedAt
        && completedAt >= minimumCompletedAt
        && completedAt <= maximumCompletedAt
        && validateRequiredCheckProducer({ run, check, integration, repo, observed }).length === 0
    })
      .sort((left, right) => compareUtf8Bytes(String(right.completed_at ?? ''), String(left.completed_at ?? '')))
    const run = matches[0]
    invariant(run, `release trust preflight lost required-check evidence for ${check.context}`)
    const producer = {
      app: { id: run.app.id, slug: run.app.slug },
      externalId: run.external_id ?? null,
      detailsUrl: run.details_url,
      workflowRun: run.workflowRun ? clone(run.workflowRun) : null,
    }
    return {
      context: check.context,
      checkRunId: String(run.id),
      integrationId,
      producer,
      producerBindingDigest: sha256(stableStringify(producer, 0)),
      headSha: run.head_sha,
      headCommittedAt: observed.defaultBranchCommittedAt,
      status: run.status,
      conclusion: run.conclusion,
      completedAt: run.completed_at,
    }
  })
}

export function validateReleaseTrustPreflightEvidence(evidence, {
  repository,
  releaseTag,
  releaseCommit,
  releaseTree,
  desired,
  inventory,
  activationRequirements,
  activationInventory,
  activationDesired,
  activationPolicy,
  expectedActivationPolicyDigest,
  mutationBoundaryContract,
  rings,
  requirementsSha256,
  releaseTagAuthorizationPolicy,
  issuerRegistry,
  runId,
  runAttempt,
  now = new Date(),
  maxAgeMinutes = 180,
  managedCiValidationContext,
}) {
  exactKeys(evidence, ['schemaVersion', 'kind', 'repository', 'workflow', 'release', 'releaseTagAuthorization', 'releaseTagAuthorizationPolicy', 'inventoryDigest', 'desiredDigest', 'observedStateDigest', 'independentReviewerAuthority', 'trust', 'requiredCheckEvidence', 'externalActivationRequirements', 'verifiedAt'], 'release trust preflight evidence')
  invariant(evidence.schemaVersion === 4 && evidence.kind === 'release-trust-preflight', 'release trust preflight evidence kind/version mismatch')
  invariant(evidence.repository === repository, 'release trust preflight repository mismatch')
  exactKeys(evidence.workflow, ['path', 'event', 'runId', 'runAttempt'], 'release trust preflight workflow')
  invariant(evidence.workflow.path === RELEASE_WORKFLOW_PATH && evidence.workflow.event === RELEASE_WORKFLOW_EVENT, 'release trust preflight workflow identity mismatch')
  invariant(evidence.workflow.runId === String(runId) && evidence.workflow.runAttempt === String(runAttempt), 'release trust preflight run replay detected')
  invariant(POSITIVE_INTEGER.test(evidence.workflow.runId) && POSITIVE_INTEGER.test(evidence.workflow.runAttempt), 'release trust preflight run identity is invalid')
  exactKeys(evidence.release, ['tag', 'tagObject', 'commit', 'tree', 'verification'], 'release trust preflight Git identity')
  invariant(evidence.release.tag === releaseTag, 'release trust preflight tag mismatch')
  invariant(SHA1.test(evidence.release.tagObject || ''), 'release trust preflight annotated tag object is invalid')
  invariant(evidence.release.commit === releaseCommit && evidence.release.tree === releaseTree && SHA1.test(releaseCommit) && SHA1.test(releaseTree), 'release trust preflight commit/tree mismatch')
  exactKeys(evidence.release.verification, ['verified', 'reason', 'verifiedAt'], 'release trust preflight tag verification')
  invariant(evidence.release.verification.verified === true && evidence.release.verification.reason === 'valid', 'release trust preflight tag signature is not GitHub-verified')
  const tagVerifiedAt = canonicalDate(evidence.release.verification.verifiedAt, 'release trust preflight tag verifiedAt')
  validateReleaseTagAuthorizationPolicyBinding(evidence.releaseTagAuthorizationPolicy, releaseTagAuthorizationPolicy, {
    externalActivationPolicy: activationPolicy,
    expectedExternalActivationPolicyDigest: expectedActivationPolicyDigest,
  })
  verifyReleaseTagAuthorization(evidence.releaseTagAuthorization, {
    expected: {
      repository,
      tag: releaseTag,
      tagObject: evidence.release.tagObject,
      commit: releaseCommit,
      tree: releaseTree,
    },
    policy: releaseTagAuthorizationPolicy,
    issuerRegistry,
    now,
    externalActivationPolicy: activationPolicy,
    expectedExternalActivationPolicyDigest: expectedActivationPolicyDigest,
  })
  invariant(evidence.inventoryDigest === sha256(stableStringify(inventory, 0)), 'release trust preflight inventory digest mismatch')
  invariant(evidence.desiredDigest === sha256(stableStringify(desired, 0)), 'release trust preflight desired-state digest mismatch')
  invariant(SHA256.test(evidence.observedStateDigest || ''), 'release trust preflight observed-state digest is invalid')
  exactKeys(evidence.externalActivationRequirements, ['path', 'sha256'], 'release trust preflight external activation binding')
  invariant(evidence.externalActivationRequirements.path === EXTERNAL_ACTIVATION_REQUIREMENTS_PATH && evidence.externalActivationRequirements.sha256 === requirementsSha256 && SHA256.test(requirementsSha256 || ''), 'release trust preflight external activation requirements drifted')
  const independentReviewerAuthority = resolveReleaseFinalizerSignedAuthority(activationRequirements, {
    repository,
    releaseTagAuthorizationPolicy,
    inventory: activationInventory,
    desired: activationDesired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now,
    managedCiValidationContext,
  })
  invariant(
    stableStringify(evidence.independentReviewerAuthority, 0) === stableStringify(independentReviewerAuthority, 0),
    'release trust preflight signed finalizer authority is stale, replayed, cross-policy, or detached from signed readback',
  )
  exactKeys(evidence.trust, ['integrations', 'rulesets', 'requiredChecks', 'environments', 'workflows', 'immutableReleases'], 'release trust preflight trust state')
  const expectedTrustState = expectedTrustFromModels(repository, inventory, desired)
  invariant(stableStringify(evidence.trust, 0) === stableStringify(expectedTrustState, 0), 'release trust preflight observed trust state differs from the reviewed model')
  invariant(Array.isArray(evidence.requiredCheckEvidence) && evidence.requiredCheckEvidence.length === evidence.trust.requiredChecks.length, 'release trust preflight required-check evidence is incomplete')
  const verifiedAt = canonicalDate(evidence.verifiedAt, 'release trust preflight verifiedAt')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'release trust preflight validation time is invalid')
  invariant(verifiedAt <= new Date(now.getTime() + 120_000) && now.getTime() - verifiedAt.getTime() <= maxAgeMinutes * 60_000, 'release trust preflight evidence is stale or from the future')
  invariant(tagVerifiedAt <= new Date(verifiedAt.getTime() + 120_000), 'release trust preflight tag verification is from the future')
  for (let index = 0; index < evidence.requiredCheckEvidence.length; index += 1) {
    const item = evidence.requiredCheckEvidence[index]
    const expectedCheck = evidence.trust.requiredChecks[index]
    exactKeys(item, ['context', 'checkRunId', 'integrationId', 'producer', 'producerBindingDigest', 'headSha', 'headCommittedAt', 'status', 'conclusion', 'completedAt'], `release trust preflight check evidence ${index}`)
    invariant(item.context === expectedCheck.context && item.integrationId === expectedCheck.integrationId, `release trust preflight check evidence ${index} identity mismatch`)
    invariant(POSITIVE_INTEGER.test(item.checkRunId), `release trust preflight check evidence ${index} run id is invalid`)
    invariant(item.headSha === releaseCommit && item.status === 'completed' && item.conclusion === 'success', `release trust preflight check evidence ${index} is not a successful current-head check`)
    const completedAt = canonicalDate(item.completedAt, `release trust preflight check evidence ${index} completedAt`)
    const headCommittedAt = canonicalDate(item.headCommittedAt, `release trust preflight check evidence ${index} headCommittedAt`)
    invariant(completedAt <= new Date(now.getTime() + desired.checkRunClockSkewSeconds * 1000)
      && now.getTime() - completedAt.getTime() <= desired.checkRunMaxAgeMinutes * 60_000,
    `release trust preflight check evidence ${index} is stale or from the future`)
    invariant(completedAt >= headCommittedAt, `release trust preflight check evidence ${index} predates the current head commit`)
    exactKeys(item.producer, ['app', 'externalId', 'detailsUrl', 'workflowRun'], `release trust preflight check evidence ${index} producer`)
    exactKeys(item.producer.app, ['id', 'slug'], `release trust preflight check evidence ${index} producer App`)
    invariant(item.producer.app.id === expectedCheck.integrationId
      && typeof item.producer.app.slug === 'string'
      && item.producer.app.slug.length > 0, `release trust preflight check evidence ${index} producer App mismatch`)
    invariant(item.producer.externalId === null || typeof item.producer.externalId === 'string', `release trust preflight check evidence ${index} external id is invalid`)
    invariant(typeof item.producer.detailsUrl === 'string' && /^https:\/\//.test(item.producer.detailsUrl), `release trust preflight check evidence ${index} details URL is invalid`)
    invariant(item.producerBindingDigest === sha256(stableStringify(item.producer, 0)), `release trust preflight check evidence ${index} producer binding digest mismatch`)
    if (item.producer.workflowRun !== null) {
      const workflowRun = item.producer.workflowRun
      exactKeys(workflowRun, ['id', 'path', 'head_sha', 'event', 'status', 'conclusion'], `release trust preflight check evidence ${index} workflow run`)
      const workflow = evidence.trust.workflows.find(entry => entry.path === workflowRun.path)
      invariant(POSITIVE_INTEGER.test(String(workflowRun.id))
        && workflow
        && workflowRun.head_sha === releaseCommit
        && workflowRun.status === 'completed'
        && workflowRun.conclusion === 'success',
      `release trust preflight check evidence ${index} workflow run identity mismatch`)
    }
    const repo = inventory.repositories.find(candidate => candidate.github === repository)
    const profile = desired.profiles[repo.desiredProfile]
    const check = profile.requiredChecks[index]
    const integration = desired.integrations[check.integration]
    invariant(item.producer.app.slug === integration.slug, `release trust preflight check evidence ${index} producer App slug mismatch`)
    const producerFailures = validateRequiredCheckProducer({
      run: {
        id: item.checkRunId,
        name: item.context,
        app: clone(item.producer.app),
        head_sha: item.headSha,
        external_id: item.producer.externalId,
        details_url: item.producer.detailsUrl,
        status: item.status,
        conclusion: item.conclusion,
        completed_at: item.completedAt,
        workflowRun: item.producer.workflowRun ? clone(item.producer.workflowRun) : undefined,
      },
      check,
      integration,
      repo,
      observed: { defaultBranchHeadSha: releaseCommit },
    })
    invariant(producerFailures.length === 0, `release trust preflight check evidence ${index} producer mismatch: ${producerFailures.join('; ')}`)
  }
  return evidence
}

export function releaseTrustPreflightEvidenceDigest(evidence, expected) {
  validateReleaseTrustPreflightEvidence(evidence, expected)
  return sha256(stableStringify(evidence, 0))
}

export async function resolveReleaseTrustPreflight({
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  client,
  repository,
  releaseTag,
  releaseCommit,
  releaseTree,
  activationRequirements,
  activationInventory,
  activationDesired,
  activationPolicy,
  expectedActivationPolicyDigest,
  mutationBoundaryContract,
  requirementsSha256,
  releaseTagAuthorization,
  releaseTagAuthorizationPolicy,
  runId,
  runAttempt,
  now = new Date(),
  issuerRegistry,
  runtimeProfile,
  runtimeValidationContext,
  managedCiValidationContext,
}) {
  const {
    GhApiClient,
    diffRepository,
    fetchRepositoryState,
    materializeProfile,
    validateModel,
  } = await import('../bin/reconcile-github.mjs')
  invariant(!(client instanceof GhApiClient) || managedCiValidationContext === undefined || managedCiValidationContext === null,
    'Live GitHub release trust preflight refuses an injected managed CI validation context')
  const effectiveRuntimeValidationContext = resolveGitHubRuntimeValidationContext({
    client,
    inventory,
    certifications,
    runtimeProfile,
    repoRoot: runtimeCertificationPaths.repoRoot,
    runtimeValidationContext: runtimeValidationContext ?? {},
    live: client instanceof GhApiClient,
  })
  validateModel(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, effectiveRuntimeValidationContext)
  invariant(/^v\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/.test(releaseTag || ''), 'release trust preflight requires an exact release tag')
  invariant(SHA1.test(releaseCommit || '') && SHA1.test(releaseTree || ''), 'release trust preflight requires exact commit/tree identities')
  invariant(SHA256.test(requirementsSha256 || ''), 'release trust preflight external activation requirements digest is invalid')
  const independentReviewerAuthority = resolveReleaseFinalizerSignedAuthority(activationRequirements, {
    repository,
    releaseTagAuthorizationPolicy,
    inventory: activationInventory,
    desired: activationDesired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now,
    managedCiValidationContext,
  })
  const repo = inventory.repositories.find(item => item.github === repository)
  invariant(repo?.role === 'authority', `release trust preflight repository is not the managed authority: ${repository}`)
  const assignment = rings.assignments[repo.id]
  // This intentionally bypasses rollout eligibility only for read-only observation.
  // It never materializes an apply action and therefore works with candidateRelease=null.
  const materialized = bindReleaseFinalizerSignedAuthority(materializeProfile(repo, desired, rings, {
    eligible: true,
    promoted: true,
    ring: assignment.ring,
    wave: assignment.wave,
    blockers: [],
  }), independentReviewerAuthority)
  const observed = fetchRepositoryState(client, repo, materialized, desired)
  if (client instanceof GhApiClient) {
    const identity = effectiveRuntimeValidationContext.externalRepositoryIdentities?.[repo.id]
    invariant(identity
      && observed.defaultBranchHeadSha === identity.gitCommit
      && observed.defaultBranchTreeSha === identity.gitTree,
    'release trust preflight default-branch commit/tree changed during live runtime identity readback')
  }
  invariant(observed.defaultBranchHeadSha === releaseCommit, 'release trust preflight protected-main head differs from the release commit')
  const commit = client.request('GET', `/repos/${repository}/git/commits/${releaseCommit}`)
  invariant(commit?.sha === releaseCommit && commit?.tree?.sha === releaseTree, 'release trust preflight GitHub commit tree readback mismatch')
  const signedTag = await resolveVerifiedReleaseTag({
    repository,
    tag: releaseTag,
    requestJson: path => client.request('GET', path),
  })
  assertVerifiedReleaseTag({ identity: signedTag, expectedCommit: releaseCommit })
  verifyReleaseTagAuthorization(releaseTagAuthorization, {
    expected: {
      repository,
      tag: releaseTag,
      tagObject: signedTag.tagObject,
      commit: releaseCommit,
      tree: releaseTree,
    },
    policy: releaseTagAuthorizationPolicy,
    issuerRegistry,
    now,
    externalActivationPolicy: activationPolicy,
    expectedExternalActivationPolicyDigest: expectedActivationPolicyDigest,
  })

  const appIdentities = []
  const environmentSecrets = new Map()
  for (const [name, integration] of Object.entries(desired.integrations).filter(([, value]) => value.required)) {
    invariant(Number.isInteger(integration.id) && integration.id > 0, `required integration unresolved: ${name}; see ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
    const app = client.request('GET', `/apps/${encodeURIComponent(integration.slug)}`)
    invariant(app?.id === integration.id && app?.slug === integration.slug, `required App identity mismatch: ${name}; see ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
    appIdentities.push({ name, id: app.id, slug: app.slug })
  }
  for (const environment of materialized.declaredEnvironments) {
    const names = new Set()
    if (environment.name === 'release-finalize') names.add(RELEASE_TAG_READ_SECRET)
    if (environment.credentialIntegration) {
      const prefix = desired.integrations[environment.credentialIntegration]?.secretPrefix
      invariant(prefix, `environment ${environment.name} has no credential integration secret prefix`)
      names.add(`${prefix}_ID`)
      names.add(`${prefix}_PRIVATE_KEY`)
    }
    const metadata = [...names].sort(compareUtf8Bytes).map(name => {
      const secret = client.request('GET', `/repos/${repository}/environments/${encodeURIComponent(environment.name)}/secrets/${encodeURIComponent(name)}`)
      invariant(secret?.name === name, `required release environment secret metadata is missing: ${environment.name}/${name}; see ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
      return { name, createdAt: secret.created_at, updatedAt: secret.updated_at }
    })
    environmentSecrets.set(environment.name, metadata)
  }

  const candidate = diffRepository(repo, materialized, observed, desired, now)
  invariant(candidate.conflicts.length === 0, `release trust preflight conflicts: ${candidate.conflicts.join('; ')}; see ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
  invariant(candidate.actions.length === 0, `release trust preflight desired-state drift: ${candidate.actions.map(action => `${action.kind}:${action.resource}`).join(', ')}; see ${EXTERNAL_ACTIVATION_REQUIREMENTS_PATH}`)
  const evidence = {
    schemaVersion: 4,
    kind: 'release-trust-preflight',
    repository,
    workflow: { path: RELEASE_WORKFLOW_PATH, event: RELEASE_WORKFLOW_EVENT, runId: String(runId), runAttempt: String(runAttempt) },
    release: {
      tag: releaseTag,
      tagObject: signedTag.tagObject,
      commit: releaseCommit,
      tree: releaseTree,
      verification: clone(signedTag.verification),
    },
    releaseTagAuthorization: clone(releaseTagAuthorization),
    releaseTagAuthorizationPolicy: {
      path: RELEASE_TAG_AUTHORIZATION_POLICY_PATH,
      sha256: releaseTagAuthorizationPolicyDigest(releaseTagAuthorizationPolicy, {
        externalActivationPolicy: activationPolicy,
        expectedExternalActivationPolicyDigest: expectedActivationPolicyDigest,
      }),
      externalActivationPolicyDigest: releaseTagAuthorizationPolicy.externalActivationPolicyDigest,
      authorizationProfileId: releaseTagAuthorizationPolicy.authorizationProfileId,
      authorizationProfileDigest: releaseTagAuthorizationPolicy.authorizationProfileDigest,
      releaseAuthorization: clone(releaseTagAuthorizationPolicy.releaseAuthorization),
    },
    inventoryDigest: sha256(stableStringify(inventory, 0)),
    desiredDigest: sha256(stableStringify(desired, 0)),
    observedStateDigest: candidate.observedStateDigest,
    independentReviewerAuthority: clone(independentReviewerAuthority),
    trust: { ...expectedTrust(materialized, desired), appIdentities },
    requiredCheckEvidence: checkEvidence(repo, materialized, observed, desired, now),
    externalActivationRequirements: { path: EXTERNAL_ACTIVATION_REQUIREMENTS_PATH, sha256: requirementsSha256 },
    verifiedAt: now.toISOString(),
  }
  // app/secret readbacks are part of the trust evidence but not of the desired-only shape.
  evidence.trust.integrations = evidence.trust.integrations.map(integration => ({
    ...integration,
    observed: appIdentities.find(item => item.name === integration.name),
  }))
  evidence.trust.environments = evidence.trust.environments.map(environment => ({
    ...environment,
    credentialSecrets: (environmentSecrets.get(environment.name) ?? []).map(secret => secret.name).sort(compareUtf8Bytes),
  }))
  delete evidence.trust.appIdentities
  return validateReleaseTrustPreflightEvidence(evidence, {
    repository,
    releaseTag,
    releaseCommit,
    releaseTree,
    desired,
    inventory,
    activationRequirements,
    activationInventory,
    activationDesired,
    activationPolicy,
    expectedActivationPolicyDigest,
    mutationBoundaryContract,
    rings,
    requirementsSha256,
    releaseTagAuthorizationPolicy,
    issuerRegistry,
    runId,
    runAttempt,
    now,
    managedCiValidationContext,
  })
}
