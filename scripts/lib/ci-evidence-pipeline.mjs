import { randomUUID, verify as verifySignature } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  buildDeepAuditEvidenceEnvelope,
  deepAuditEvidenceContract,
  loadActiveDeepAuditRun,
  sha256,
  stableStringify,
  writeDeepAuditEvidenceEnvelopeBatch,
} from './deep-audit-evidence-contract.mjs'
import {
  assertCiPlanCoverage,
  loadCanonicalCiModels,
  loadCiEvidencePlan,
} from './ci-evidence-plan.mjs'
import {
  diffRepository,
  materializeProfile,
  validateModel,
} from '../../infra/governance/bin/reconcile-github.mjs'
import {
  certificationSubjectCommitsByRepository,
  currentRuntimeCertificationIdentity,
} from '../../infra/governance/lib/runtime-certification.mjs'
import { validateRequiredCheckProducer } from '../../infra/governance/lib/check-run-trust.mjs'
import {
  assertExternalActivationReady,
  externalActivationPolicyDigest,
} from '../../infra/governance/lib/external-activation.mjs'
import {
  validateVerifiedReleaseEvidence,
  verifiedReleaseEvidenceDigest,
} from '../../infra/governance/lib/release-evidence.mjs'
import {
  releaseTrustPreflightEvidenceDigest,
  validateReleaseTrustPreflightEvidence,
} from '../../infra/governance/lib/release-trust-preflight.mjs'
import {
  assertIssuerActive,
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateRegistryPolicyBinding,
} from '../../infra/governance/lib/issuer-registry.mjs'
import { validateWorkflowIdentity, workflowIdentity } from '../../infra/governance/lib/workflow-trust.mjs'
import { checkPackageCompatibility } from '../../infra/governance/bin/consumerctl.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const MAX_STAGING_BYTES = 32 * 1024 * 1024
const CLOCK_SKEW_MS = 120_000
const OBSERVATION_SCHEMA = 'scripts/schemas/ci-evidence-observation.schema.json'
const ATTESTATION_SCHEMA = 'scripts/schemas/ci-evidence-attestation.schema.json'

function fail(message) {
  throw new Error(`CI evidence pipeline blocked:${message}`)
}

const clone = (value) => JSON.parse(JSON.stringify(value))

function canonicalTime(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail(`${label} must be a canonical UTC timestamp`)
  return parsed
}

function compileSchema(repoRoot, relativePath) {
  const schema = JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
  addFormats(ajv)
  return ajv.compile(schema)
}

function schemaAssert(value, relativePath, repoRoot, label) {
  const validate = compileSchema(repoRoot, relativePath)
  if (!validate(value)) fail(`${label} schema validation failed:${validate.errorsText?.() ?? JSON.stringify(validate.errors)}`)
}

function normalizedReconciliation(candidate) {
  return {
    repoId: candidate.repoId,
    github: candidate.github,
    ring: candidate.ring,
    defaultBranchHeadSha: candidate.defaultBranchHeadSha,
    observedStateDigest: candidate.observedStateDigest,
    requiredChecks: candidate.requiredChecks,
    conflicts: candidate.conflicts,
    actions: candidate.actions,
    deferredActions: candidate.deferredActions,
  }
}

function expectedModelBindings(planState, bindings) {
  const expected = planState.plan.observation.canonicalInputs.map((input) => {
    const binding = bindings.find((item) => item.name === input.name)
    if (!binding || binding.path !== input.path || !SHA256.test(binding.sha256)) fail(`canonical model binding is unavailable:${input.name}`)
    return binding
  })
  return expected
}

export function ciApiReadbackDigest(payload) {
  return sha256(stableStringify({
    repositories: payload.repositories,
    release: payload.release,
    propagation: payload.propagation,
    dimensions: payload.dimensions,
  }))
}

function expectedWorkflowIdentity(repoRoot) {
  const content = readFileSync(resolve(repoRoot, 'template/ds-product-template/.github/workflows/audit.yml'), 'utf8')
  const identity = workflowIdentity(content)
  return {
    contentSha256: identity.contentSha256,
    gitBlobSha: identity.gitBlobSha,
    semanticVersion: identity.semanticVersion,
    semanticSha256: identity.semanticSha256,
  }
}

function assertSuccessfulWorkflowRun(run, expected, label) {
  if (!run || String(run.id) !== String(expected.id) || run.runAttempt !== expected.runAttempt
    || run.path !== expected.path || run.event !== expected.event || run.headBranch !== expected.headBranch
    || run.headSha !== expected.headSha || run.status !== 'completed' || run.conclusion !== 'success') {
    fail(`${label} exact workflow/run identity mismatch`)
  }
}

function candidatePackage(candidateRelease, name) {
  const matches = candidateRelease.packages.filter((item) => item.name === name)
  if (matches.length !== 1) fail(`candidate release package identity is incomplete:${name}`)
  return matches[0]
}

function validateExactConsumerPackages(propagation, repo, candidateRelease, compatibility) {
  const findings = checkPackageCompatibility(propagation.packageJson, repo, compatibility)
  const blockers = findings.filter((item) => item.severity === 'error' || item.severity === 'blocker')
  if (blockers.length) fail(`${repo.id} package compatibility failed:${blockers.map((item) => item.code).join(',')}`)
  const declared = { ...(propagation.packageJson.dependencies ?? {}), ...(propagation.packageJson.devDependencies ?? {}) }
  if (!propagation.packageLock || !propagation.packageLock.packages) fail(`${repo.id} package-lock packages are unavailable`)
  for (const name of repo.consumes ?? []) {
    const expected = candidatePackage(candidateRelease, name)
    if (declared[name] !== candidateRelease.version) fail(`${repo.id} does not declare exact ${name}@${candidateRelease.version}`)
    const locked = propagation.packageLock.packages[`node_modules/${name}`]
    if (!locked || locked.version !== candidateRelease.version || locked.integrity !== expected.integrity) {
      fail(`${repo.id} lockfile does not bind exact ${name}@${candidateRelease.version} integrity`)
    }
  }
}

function authorityRepository(models) {
  const matches = models.inventory.repositories.filter((item) => item.role === 'authority')
  if (matches.length !== 1) fail('managed inventory must contain exactly one authority')
  return matches[0]
}

function authorityRequiredChecks(models, authority) {
  const profile = models.desired?.profiles?.[authority.desiredProfile]
  if (!profile || !Array.isArray(profile.requiredChecks) || profile.requiredChecks.length === 0) {
    fail('authority desired profile must define at least one protected required check')
  }
  return profile.requiredChecks
}

function runtimeValidationContextFromObservation(repoRoot, payload, models) {
  if (payload.repositories.length !== models.inventory.repositories.length) fail('repository readback closure differs from managed inventory')
  const expectedSubjectCommits = certificationSubjectCommitsByRepository(models.certifications, models.inventory)
  const externalRepositoryIdentities = {}
  for (let index = 0; index < models.inventory.repositories.length; index += 1) {
    const repository = models.inventory.repositories[index]
    const readback = payload.repositories[index]
    if (readback.repositoryId !== repository.id
      || readback.repository !== repository.github
      || readback.role !== repository.role) fail(`repository readback identity/order mismatch:${repository.id}`)
    if (readback.observedSha256 !== sha256(stableStringify(readback.observed))) fail(`repository API snapshot digest mismatch:${repository.id}`)
    if (readback.observed.defaultBranchHeadSha !== readback.reconciliation.defaultBranchHeadSha
      || readback.observed.defaultBranchTreeSha !== readback.remoteTree
      || !GIT_OID.test(readback.remoteTree)) fail(`repository protected head/tree binding is invalid:${repository.id}`)
    if (readback.certificationIdentity.gitCommit !== readback.observed.defaultBranchHeadSha
      || readback.certificationIdentity.gitTree !== readback.remoteTree) {
      fail(`repository certification carrier differs from the signed protected head/tree:${repository.id}`)
    }
    const expectedProofs = expectedSubjectCommits.get(repository.id) ?? []
    const observedProofs = Object.keys(readback.certificationIdentity.subjectProofs).sort()
    if (stableStringify(observedProofs) !== stableStringify(expectedProofs)) {
      fail(`repository certification subject-proof closure differs from the canonical ledger:${repository.id}`)
    }
    externalRepositoryIdentities[repository.id] = clone(readback.certificationIdentity)
  }
  return {
    repoRoot: resolve(repoRoot),
    runtimeIdentity: currentRuntimeCertificationIdentity(repoRoot),
    externalRepositoryIdentities,
  }
}

function workflowRunForDimension(payload, dim) {
  if (dim === 64) return payload.release.stageWorkflowRun
  if (dim === 66) return payload.release.mirrorWorkflowRun
  fail(`unsupported CI dimension:${dim}`)
}

function workflowIdentityDigest(payload, dimension) {
  const authority = payload.repositories.find((item) => item.role === 'authority')
  const identity = authority?.observed?.workflowContents?.[dimension.workflow]?.identity
  if (!identity) fail(`authority workflow identity is absent:${dimension.workflow}`)
  return sha256(stableStringify(identity))
}

export function ciObservationAttestationBinding(document, dim, issuerDigest) {
  const payload = document?.payload
  const dimension = payload?.dimensions?.find((item) => item.dim === dim)
  if (!payload || !dimension) fail(`cannot build observation attestation bytes for dim ${dim}`)
  const run = workflowRunForDimension(payload, dim)
  return {
    contract: 'ci-enforced-observation-attestation-v1',
    observationSha256: document.payloadSha256,
    nonce: payload.nonce,
    issuerRegistryDigest: issuerDigest,
    apiReadbackDigest: payload.apiReadbackDigest,
    observedAt: payload.observedAt,
    expiresAt: payload.expiresAt,
    runBinding: payload.runBinding,
    dimension: {
      dim: dimension.dim,
      capability: dimension.capability,
      repository: dimension.repository,
      workflow: dimension.workflow,
      checkName: dimension.checkName,
      runId: dimension.runId,
      runAttempt: run.runAttempt,
      head: dimension.head,
      tree: dimension.tree,
      workflowIdentityDigest: workflowIdentityDigest(payload, dimension),
    },
  }
}

export function ciObservationAttestationBytes(document, dim, issuerDigest) {
  return Buffer.from(stableStringify(ciObservationAttestationBinding(document, dim, issuerDigest)))
}

function unsignedReceipt(document, dim) {
  const payload = document.payload
  const dimension = payload.dimensions.find((item) => item.dim === dim)
  if (!dimension) fail(`observation lacks dim ${dim}`)
  return {
    contract: 'signed-github-check-observation-v1',
    subject: {
      repository: dimension.repository,
      workflow: dimension.workflow,
      checkName: dimension.checkName,
      runId: dimension.runId,
      head: dimension.head,
      tree: dimension.tree,
    },
    observation: {
      status: dimension.status,
      conclusion: dimension.conclusion,
      observedAt: payload.observedAt,
      apiPayloadSha256: document.payloadSha256,
    },
    // Keep the complete, schema-closed observation in every dimension receipt.
    // This makes the active run independently re-verifiable after the detached
    // staging pair is gone, including release/BOM, ruleset, and propagation
    // validators. The digest above and both detached signatures bind it.
    observationPayload: clone(payload),
  }
}

export function ciReceiptSigningBytes(document, dim) {
  return Buffer.from(stableStringify(unsignedReceipt(document, dim)))
}

export function buildCiObservationDocument(payload) {
  const payloadSha256 = sha256(stableStringify(payload))
  return {
    $schema: 'schemas/ci-evidence-observation.schema.json',
    schemaVersion: 1,
    kind: 'ci-enforced-content-addressed-observation',
    payloadSha256,
    payload,
  }
}

export function buildCiObservationPayload({ planState, activeRun, modelBindings, repositories, release, propagation, nonce = randomUUID(), observedAt = new Date() }) {
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) fail('observation time is invalid')
  const authority = repositories.find((item) => item.role === 'authority')
  if (!authority) fail('authority readback is missing')
  const expiresAt = new Date(observedAt.getTime() + planState.plan.observation.maxAgeSeconds * 1000)
  const dimensions = planState.plan.dimensions.map((item) => {
    const run = item.dim === 64 ? release.stageWorkflowRun : release.mirrorWorkflowRun
    return {
      dim: item.dim,
      capability: item.capability,
      repository: authority.repository,
      workflow: item.subject.workflow,
      checkName: item.subject.checkName,
      runId: String(run.id),
      head: release.candidateRelease.sourceCommit,
      tree: release.candidateRelease.sourceTree,
      status: 'completed',
      conclusion: 'success',
    }
  })
  const payload = {
    schemaVersion: 1,
    kind: 'ci-enforced-observation-payload',
    planDigest: planState.planDigest,
    nonce,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    runBinding: {
      runId: activeRun.manifest.runId,
      manifestSha256: activeRun.manifestSha256,
      repository: authority.repository,
      head: activeRun.manifest.head,
      tree: activeRun.manifest.tree,
    },
    canonicalModels: modelBindings,
    repositories,
    release,
    propagation,
    dimensions,
    apiReadbackDigest: '0'.repeat(64),
  }
  payload.apiReadbackDigest = ciApiReadbackDigest(payload)
  return payload
}

function defaultValidators() {
  return {
    validateGovernanceModel: validateModel,
    materializeProfile,
    diffRepository,
    assertExternalActivationReady,
    validateVerifiedReleaseEvidence,
    verifiedReleaseEvidenceDigest,
    validateReleaseTrustPreflightEvidence,
    releaseTrustPreflightEvidenceDigest,
    validateRequiredCheckProducer,
    validateWorkflowIdentity,
    checkPackageCompatibility,
  }
}

function validateCiObservationDocumentCore(document, {
  repoRoot = process.cwd(),
  planState,
  activeRun,
  models,
  modelBindings,
  now = new Date(),
  validators,
} = {}) {
  schemaAssert(document, OBSERVATION_SCHEMA, repoRoot, 'CI observation')
  if (!validators) fail('CI observation validator set is unavailable')
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('import verification time is invalid')
  if (document.payloadSha256 !== sha256(stableStringify(document.payload))) fail('observation payload digest mismatch')
  const payload = document.payload
  if (payload.planDigest !== planState.planDigest) fail('observation plan digest mismatch')
  if (!new RegExp(planState.plan.observation.noncePattern).test(payload.nonce)) fail('observation nonce is invalid')
  const observedAt = canonicalTime(payload.observedAt, 'observation observedAt')
  const expiresAt = canonicalTime(payload.expiresAt, 'observation expiresAt')
  if (expiresAt.getTime() - observedAt.getTime() !== planState.plan.observation.maxAgeSeconds * 1000) fail('observation validity window differs from the reviewed plan')
  if (observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS || expiresAt <= now) fail('observation is stale, expired, or from the future')
  const expectedRunBinding = {
    runId: activeRun.manifest.runId,
    manifestSha256: activeRun.manifestSha256,
    repository: authorityRepository(models).github,
    head: activeRun.manifest.head,
    tree: activeRun.manifest.tree,
  }
  if (stableStringify(payload.runBinding) !== stableStringify(expectedRunBinding)) fail('observation active-run HEAD/tree/manifest binding mismatch')
  const expectedBindings = expectedModelBindings(planState, modelBindings)
  if (stableStringify(payload.canonicalModels) !== stableStringify(expectedBindings)) fail('observation canonical model digest binding mismatch')
  if (payload.apiReadbackDigest !== ciApiReadbackDigest(payload)) fail('observation API readback digest mismatch')
  assertCiPlanCoverage(planState, activeRun.manifest)

  const runtimeValidationContext = runtimeValidationContextFromObservation(repoRoot, payload, models)
  validators.validateGovernanceModel(
    models.inventory,
    models.desired,
    models.rings,
    models.certifications,
    models.waivers,
    observedAt,
    models.issuers,
    models.runtimeProfile,
    runtimeValidationContext,
  )
  const expectedActivationPolicyDigest = externalActivationPolicyDigest(models.externalActivationPolicy)
  for (const scope of ['release', 'fleet-rollout']) validators.assertExternalActivationReady(models.externalActivationRequirements, {
    scope,
    inventory: models.inventory,
    desired: models.desired,
    mutationBoundaryContract: models.githubMutationBoundaryContract,
    rings: models.rings,
    issuerRegistry: models.issuers,
    policy: models.externalActivationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now: observedAt,
  })

  for (let index = 0; index < models.inventory.repositories.length; index += 1) {
    const repo = models.inventory.repositories[index]
    const readback = payload.repositories[index]
    const assignment = models.rings.assignments[repo.id]
    const eligibility = { eligible: true, promoted: true, ring: assignment.ring, wave: assignment.wave, blockers: [] }
    const materialized = validators.materializeProfile(repo, models.desired, models.rings, eligibility)
    const candidate = validators.diffRepository(repo, materialized, clone(readback.observed), models.desired, observedAt)
    const normalized = normalizedReconciliation(candidate)
    if (stableStringify(normalized) !== stableStringify(readback.reconciliation)) fail(`repository reconciliation readback was substituted:${repo.id}`)
    if (normalized.conflicts.length || normalized.actions.length || normalized.deferredActions.length) fail(`repository is not exactly reconciled:${repo.id}`)
  }

  const authority = authorityRepository(models)
  const release = payload.release
  if (stableStringify(release.candidateRelease) !== stableStringify(models.rings.candidateRelease) || !models.rings.candidateRelease) fail('observation candidate release is absent or substituted')
  if (release.candidateRelease.sourceTree !== activeRun.manifest.tree) fail('candidate release tree does not bind the active PR tree')
  const authorityReadback = payload.repositories.find((item) => item.repositoryId === authority.id)
  if (authorityReadback.observed.defaultBranchHeadSha !== release.candidateRelease.sourceCommit
    || authorityReadback.remoteTree !== release.candidateRelease.sourceTree) {
    fail('remote protected authority head/tree differs from the candidate release')
  }
  const transition = release.authorityTransition
  const authorityPr = transition.sourcePullRequest
  if (authorityPr.state !== 'closed' || !authorityPr.mergedAt
    || authorityPr.headSha !== activeRun.manifest.head
    || authorityPr.mergeCommitSha !== release.candidateRelease.sourceCommit
    || authorityPr.baseRef !== authority.defaultBranch
    || transition.candidateHeadTree !== activeRun.manifest.tree
    || transition.mergeCommitTree !== release.candidateRelease.sourceTree
    || transition.candidateHeadTree !== transition.mergeCommitTree) {
    fail('authority candidate PR to protected-main transition is invalid')
  }
  const requiredAuthorityChecks = authorityRequiredChecks(models, authority)
  if (transition.requiredChecks.length !== requiredAuthorityChecks.length) fail('authority PR required-check closure differs from desired state')
  for (let index = 0; index < requiredAuthorityChecks.length; index += 1) {
    const expectedCheck = requiredAuthorityChecks[index]
    const failures = validators.validateRequiredCheckProducer({
      run: transition.requiredChecks[index],
      check: expectedCheck,
      integration: models.desired.integrations[expectedCheck.integration],
      repo: authority,
      observed: {
        defaultBranchHeadSha: activeRun.manifest.head,
        candidateHeadSha: activeRun.manifest.head,
        protectedWorkflowSha: authorityPr.baseSha,
      },
    })
    if (failures.length) fail(`authority PR ${expectedCheck.context} producer mismatch:${failures.join('; ')}`)
  }
  validators.validateVerifiedReleaseEvidence(release.verifiedReleaseEvidence, release.candidateRelease)
  const verifiedDigest = validators.verifiedReleaseEvidenceDigest(release.verifiedReleaseEvidence, release.candidateRelease)
  if (release.verifiedReleaseEvidenceDigest !== verifiedDigest) fail('verified immutable release/BOM digest mismatch')
  const stage = release.stageWorkflowRun
  const mirror = release.mirrorWorkflowRun
  assertSuccessfulWorkflowRun(stage, {
    id: stage.id,
    runAttempt: stage.runAttempt,
    path: '.github/workflows/release.yml',
    event: 'repository_dispatch',
    headBranch: authority.defaultBranch,
    headSha: release.candidateRelease.sourceCommit,
  }, 'protected release')
  assertSuccessfulWorkflowRun(mirror, {
    id: mirror.id,
    runAttempt: mirror.runAttempt,
    path: '.github/workflows/mirror-to-published-template.yml',
    event: 'workflow_run',
    headBranch: authority.defaultBranch,
    headSha: release.candidateRelease.sourceCommit,
  }, 'release-triggered mirror')
  const requirementsBinding = modelBindings.find((item) => item.name === 'externalActivationRequirements')
  const trustExpected = {
    repository: authority.github,
    releaseTag: `v${release.candidateRelease.version}`,
    releaseCommit: release.candidateRelease.sourceCommit,
    releaseTree: release.candidateRelease.sourceTree,
    desired: models.desired,
    inventory: models.inventory,
    activationRequirements: models.externalActivationRequirements,
    activationInventory: models.inventory,
    activationDesired: models.desired,
    activationPolicy: models.externalActivationPolicy,
    mutationBoundaryContract: models.githubMutationBoundaryContract,
    expectedActivationPolicyDigest,
    rings: models.rings,
    requirementsSha256: requirementsBinding.sha256,
    releaseTagAuthorizationPolicy: models.releaseTagAuthorizationPolicy,
    issuerRegistry: models.issuers,
    runId: stage.id,
    runAttempt: String(stage.runAttempt),
    now: observedAt,
  }
  validators.validateReleaseTrustPreflightEvidence(release.trustPreflightEvidence, trustExpected)
  if (release.trustPreflightDigest !== validators.releaseTrustPreflightEvidenceDigest(release.trustPreflightEvidence, trustExpected)) fail('release trust-preflight digest mismatch')

  const consumers = models.inventory.repositories.filter((item) => item.role !== 'authority')
  if (payload.propagation.length !== consumers.length) fail('template/fleet propagation closure is incomplete')
  const expectedAuditIdentity = expectedWorkflowIdentity(repoRoot)
  for (let index = 0; index < consumers.length; index += 1) {
    const repo = consumers[index]
    const item = payload.propagation[index]
    const readback = payload.repositories.find((entry) => entry.repositoryId === repo.id)
    if (item.repositoryId !== repo.id || item.repository !== repo.github || item.role !== repo.role) fail(`propagation identity/order mismatch:${repo.id}`)
    if (item.version !== release.candidateRelease.version || item.remoteHead !== readback.observed.defaultBranchHeadSha || item.remoteTree !== readback.remoteTree) fail(`propagation exact version/head/tree mismatch:${repo.id}`)
    const pr = item.sourcePullRequest
    if (pr.state !== 'closed' || !pr.mergedAt || pr.mergeCommitSha !== item.remoteHead || pr.baseRef !== repo.defaultBranch) fail(`propagation PR is not the exact merged protected-main change:${repo.id}`)
    const writerSlug = models.desired.integrations.governanceWriterApp.slug
    if (pr.authorLogin !== `${writerSlug}[bot]`) fail(`propagation PR was not authored by the reviewed writer App:${repo.id}`)
    validateExactConsumerPackages(item, repo, release.candidateRelease, models.compatibility)
    const observedAuditIdentity = workflowIdentity(item.auditWorkflow.content, item.auditWorkflow.declaredBlobSha)
    if (item.auditWorkflow.refHead !== item.remoteHead || observedAuditIdentity.declaredBlobMatches !== true) fail(`${repo.id} audit workflow is not the exact Git blob read from propagated HEAD`)
    const workflowFailures = validators.validateWorkflowIdentity(expectedAuditIdentity, observedAuditIdentity)
    if (workflowFailures.length) fail(`${repo.id} audit workflow identity mismatch:${workflowFailures.join('; ')}`)
    const expectedChecks = planState.plan.observation.consumerChecks
    if (item.checks.length !== expectedChecks.length || item.checks.some((check, at) => check.id !== expectedChecks[at].id)) fail(`${repo.id} audit/visual check closure differs`)
    for (let at = 0; at < expectedChecks.length; at += 1) {
      const expectedCheck = expectedChecks[at]
      const failures = validators.validateRequiredCheckProducer({
        run: item.checks[at].run,
        check: {
          context: expectedCheck.checkName,
          trustSource: 'repository-workflow',
          workflow: expectedCheck.workflow,
          requiredEvents: ['push'],
        },
        integration: models.desired.integrations.githubActions,
        repo,
        observed: { defaultBranchHeadSha: item.remoteHead },
      })
      if (failures.length) fail(`${repo.id} ${expectedCheck.id} producer mismatch:${failures.join('; ')}`)
    }
    if (repo.role === 'template-mirror') {
      if (stableStringify(item.sourceWorkflowRun) !== stableStringify(mirror)) fail('template PR is not bound to the exact release-triggered mirror run')
    } else if (item.sourceWorkflowRun.path !== '.github/workflows/sync-design-system.yml'
      || item.sourceWorkflowRun.event !== 'repository_dispatch'
      || item.sourceWorkflowRun.headBranch !== repo.defaultBranch
      || item.sourceWorkflowRun.headSha !== pr.baseSha) fail(`${repo.id} upgrade PR workflow/base identity mismatch`)
  }

  const expectedDimensions = planState.plan.dimensions.map((item) => {
    const run = workflowRunForDimension(payload, item.dim)
    return {
      dim: item.dim,
      capability: item.capability,
      repository: authority.github,
      workflow: item.subject.workflow,
      checkName: item.subject.checkName,
      runId: String(run.id),
      head: release.candidateRelease.sourceCommit,
      tree: release.candidateRelease.sourceTree,
      status: 'completed',
      conclusion: 'success',
    }
  })
  if (stableStringify(payload.dimensions) !== stableStringify(expectedDimensions)) fail('CI dimension verdict/run closure is substituted or mixed')
  return { document, observedAt, expiresAt }
}

export function validateCiObservationDocument(document, options = {}) {
  const allowed = new Set(['repoRoot', 'planState', 'activeRun', 'models', 'modelBindings', 'now'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`production observation API forbids override options:${unknown.join(',')}`)
  return validateCiObservationDocumentCore(document, { ...options, validators: defaultValidators() })
}

// Pure validation-only seam for adversarial fixtures. It cannot build or write
// evidence and is never reachable from CLI arguments, files, or environment.
export const ciEvidenceValidationTestHarness = Object.freeze({
  validateObservation(document, options, validators) {
    return validateCiObservationDocumentCore(document, { ...options, validators: { ...defaultValidators(), ...validators } })
  },
})

function canonicalSignature(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`${label} encoding is invalid`)
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) fail(`${label} is not canonical Ed25519`)
  return bytes
}

export function validateCiDetachedAttestation(attestation, document, {
  repoRoot = process.cwd(),
  models,
  observedAt,
  expiresAt,
  now = new Date(),
} = {}) {
  schemaAssert(attestation, ATTESTATION_SCHEMA, repoRoot, 'CI detached attestation')
  const registry = models.issuers
  const policy = models.rings.attestationPolicy
  const registryDigest = issuerRegistryDigest(registry)
  if (attestation.observationSha256 !== document.payloadSha256 || attestation.nonce !== document.payload.nonce) fail('detached attestation observation/nonce binding mismatch')
  if (attestation.issuerRegistryDigest !== registryDigest || policy.issuerRegistryDigest !== registryDigest) fail('detached attestation issuer registry substitution detected')
  const policyState = validateRegistryPolicyBinding(policy, registry, {
    role: 'completion-attestor',
    quorum: policy.completionAttestationQuorum,
    now,
    allowUnactivated: false,
  })
  if (!policyState.active) fail('completion-attestor policy is not activated')
  for (const dim of [64, 66]) {
    const signatures = attestation.signatures.filter((item) => item.dim === dim)
    if (signatures.length < policy.completionAttestationQuorum) fail(`dim ${dim} lacks completion-attestor quorum`)
    if (new Set(signatures.map((item) => item.issuerKeyId)).size !== signatures.length) fail(`dim ${dim} contains duplicate attestor keys`)
    const subjects = new Set()
    const observationBytes = ciObservationAttestationBytes(document, dim, registryDigest)
    const receiptBytes = ciReceiptSigningBytes(document, dim)
    for (const item of signatures) {
      const issuer = resolvePolicyIssuer(policy, registry, item.issuerKeyId, {
        role: 'completion-attestor',
        at: observedAt,
        validThrough: expiresAt,
      })
      assertIssuerActive(issuer, { role: 'completion-attestor', at: now, validThrough: now })
      subjects.add(issuer.subject)
      if (item.observationPayloadSha256 !== sha256(observationBytes)
        || !verifySignature(null, observationBytes, publicKeyFromIssuer(issuer), canonicalSignature(item.observationSignature, `dim ${dim} observation signature`))) fail(`dim ${dim} observation signature is invalid`)
      if (item.receiptPayloadSha256 !== sha256(receiptBytes)
        || !verifySignature(null, receiptBytes, publicKeyFromIssuer(issuer), canonicalSignature(item.receiptSignature, `dim ${dim} receipt signature`))) fail(`dim ${dim} receipt signature is invalid`)
    }
    if (subjects.size < policy.completionAttestationQuorum) fail(`dim ${dim} attestor quorum is not independent`)
  }
  if (attestation.signatures.some((item) => ![64, 66].includes(item.dim))) fail('detached attestation contains an unknown dimension')
  return true
}

function readExclusiveRegularFile(path, label) {
  const absolute = resolve(path)
  let handle
  try {
    handle = openSync(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const stat = fstatSync(handle)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > MAX_STAGING_BYTES) fail(`${label} must be one bounded, unlinked regular file`)
    const bytes = readFileSync(handle)
    if (bytes.length !== stat.size) fail(`${label} changed during readback`)
    return { absolute, bytes }
  } catch (error) {
    if (String(error?.message ?? '').startsWith('CI evidence pipeline blocked:')) throw error
    fail(`${label} cannot be read safely:${error.message}`)
  } finally {
    if (handle !== undefined) closeSync(handle)
  }
}

function parseJsonBytes(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')) } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

export function readCiStagingPair(observationPath, attestationPath) {
  const observationRead = readExclusiveRegularFile(observationPath, 'CI observation')
  const attestationRead = readExclusiveRegularFile(attestationPath, 'CI detached attestation')
  if (dirname(observationRead.absolute) !== dirname(attestationRead.absolute)) fail('observation and attestation must share one closed staging directory')
  const observation = parseJsonBytes(observationRead.bytes, 'CI observation')
  const attestation = parseJsonBytes(attestationRead.bytes, 'CI detached attestation')
  if (basename(observationRead.absolute) !== `${observation?.payloadSha256}.json`) fail('observation filename is not content-addressed')
  const attestationDigest = sha256(attestationRead.bytes)
  if (basename(attestationRead.absolute) !== `${attestationDigest}.attestation.json`) fail('attestation filename is not content-addressed')
  const entries = readdirSync(dirname(observationRead.absolute)).sort()
  const expectedEntries = [basename(observationRead.absolute), basename(attestationRead.absolute)].sort()
  if (stableStringify(entries) !== stableStringify(expectedEntries)) fail('staging directory contains unknown or partial files')
  return { observation, attestation, observationBytes: observationRead.bytes, attestationBytes: attestationRead.bytes, attestationDigest }
}

function assertCompletionPolicyActivated(models, now) {
  const state = validateRegistryPolicyBinding(models.rings.attestationPolicy, models.issuers, {
    role: 'completion-attestor',
    quorum: models.rings.attestationPolicy.completionAttestationQuorum,
    now,
    allowUnactivated: false,
  })
  if (!state.active) fail('completion-attestor policy is not activated')
  return state
}

function validateCiImportPair(pair, {
  repoRoot,
  planState,
  activeRun,
  canonical,
  now,
  validators = defaultValidators(),
}) {
  const validation = validateCiObservationDocumentCore(pair.observation, {
    repoRoot,
    planState,
    activeRun,
    models: canonical.models,
    modelBindings: canonical.bindings,
    now,
    validators,
  })
  validateCiDetachedAttestation(pair.attestation, pair.observation, {
    repoRoot,
    models: canonical.models,
    observedAt: validation.observedAt,
    expiresAt: validation.expiresAt,
    now,
  })
  return validation
}

// Import-order seam for adversarial fixtures. Production import never accepts
// validators or a publisher: it always uses the canonical validators and the
// atomic deep-audit batch writer below.
export const ciEvidenceImportTestHarness = Object.freeze({
  async importPair(pair, options, validators, publish) {
    if (typeof publish !== 'function') fail('test import requires an explicit publisher spy')
    const validation = validateCiImportPair(pair, { ...options, validators: { ...defaultValidators(), ...validators } })
    return publish(validation)
  },
})

export async function importCiEvidence(options = {}) {
  const allowed = new Set(['repoRoot', 'observationPath', 'attestationPath', 'now'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`production import API forbids override options:${unknown.join(',')}`)
  const {
    repoRoot = process.cwd(),
    observationPath,
    attestationPath,
    now = new Date(),
  } = options
  const planState = loadCiEvidencePlan({ repoRoot })
  const activeRun = await loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
  assertCiPlanCoverage(planState, activeRun.manifest)
  const canonical = await loadCanonicalCiModels(planState, { repoRoot })
  assertCompletionPolicyActivated(canonical.models, now)
  if (existsSync(join(activeRun.runRoot, 'ci-enforced'))) fail('CI evidence replay detected:ci-enforced category already exists')
  const pair = readCiStagingPair(observationPath, attestationPath)
  validateCiImportPair(pair, {
    repoRoot,
    planState,
    activeRun,
    canonical,
    now,
  })
  const startedAt = now.toISOString()
  const items = planState.plan.dimensions.map((dimension) => {
    const signatures = pair.attestation.signatures.filter((item) => item.dim === dimension.dim).map((item) => ({
      issuerKeyId: item.issuerKeyId,
      observationPayloadSha256: item.observationPayloadSha256,
      observationSignature: item.observationSignature,
      receiptPayloadSha256: item.receiptPayloadSha256,
      receiptSignature: item.receiptSignature,
    }))
    const unsigned = unsignedReceipt(pair.observation, dimension.dim)
    const receipt = {
      ...unsigned,
      attestation: {
        binding: ciObservationAttestationBinding(pair.observation, dimension.dim, pair.attestation.issuerRegistryDigest),
        signatures,
      },
    }
    const envelope = buildDeepAuditEvidenceEnvelope({
      activeRun,
      evidenceKind: 'deep-audit-ci-enforced',
      producer: deepAuditEvidenceContract.genericProducer,
      command: {
        argv: [
          'node',
          'scripts/produce-ci-enforced-evidence.mjs',
          '--import',
          `--observation-sha256=${pair.observation.payloadSha256}`,
          `--attestation-sha256=${pair.attestationDigest}`,
        ],
        cwd: '.',
        exitCode: 0,
        startedAt,
        finishedAt: now.toISOString(),
      },
      coveragePaths: activeRun.manifest.rubricPaths,
      payload: { dim: dimension.dim, capability: dimension.capability, receipt },
    })
    return { relativePath: `ci-enforced/dim-${dimension.dim}.json`, envelope }
  })
  const published = await writeDeepAuditEvidenceEnvelopeBatch({ repoRoot, items })
  if (!published || published.count !== items.length || !Array.isArray(published.paths) || published.paths.length !== items.length) fail('atomic ci-enforced batch publication was incomplete')
  return {
    count: published.count,
    paths: published.paths,
    observationSha256: pair.observation.payloadSha256,
    attestationSha256: pair.attestationDigest,
  }
}

export function ciStagingFilenames(document, attestationBytes = null) {
  if (!document || !SHA256.test(document.payloadSha256 ?? '')) fail('observation document digest is invalid')
  return {
    observation: `${document.payloadSha256}.json`,
    attestation: attestationBytes ? `${sha256(attestationBytes)}.attestation.json` : null,
  }
}
