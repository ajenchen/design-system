#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import {
  GOVERNANCE_ROOT,
  captureClosedGitHubToken,
  compareUtf8Bytes,
  deepEqual,
  invariant,
  parseFlags,
  readJson,
  runClosedGh,
  sha256,
  stableStringify,
  validateInventory,
} from '../lib/common.mjs'
import { validateAttestationPolicy } from '../lib/attestation.mjs'
import {
  certificationKey,
  createPartialInventoryFixtureValidator,
  validateCertifications,
  validateGovernanceModel,
  validateReleaseRings,
  validateWaivers,
} from '../lib/model-validation.mjs'
import {
  candidateActionsDigest,
  candidatePlanDigest,
  evaluatePromotionPredicates,
  evaluateReleaseRingSoak,
  predicateEvidenceDigest,
  resolveRolloutWave,
  verifyApplyAuthorization,
  verifyCompletionAttestation,
} from '../lib/rollout-state-machine.mjs'
import { validateRequiredCheckProducer } from '../lib/check-run-trust.mjs'
import {
  resolveVerifiedCandidateRelease,
  validateVerifiedReleaseEvidence,
  verifiedReleaseEvidenceDigest as digestVerifiedReleaseEvidence,
} from '../lib/release-evidence.mjs'
import { validateWorkflowIdentity, workflowIdentity } from '../lib/workflow-trust.mjs'
import { issuerRegistryDigest, loadIssuerRegistry, validateIssuerRegistryLineage } from '../lib/issuer-registry.mjs'
import {
  historicalControlPlaneDigest,
  normalizeHistoricalControlPlane,
  validateHistoricalControlPlane,
  verifyFleetRecoveryAuthorization,
} from '../lib/fleet-recovery-authorization.mjs'
import {
  assertExternalActivationReady,
  EXTERNAL_ACTIVATION_POLICY_DIGEST,
  externalActivationPolicyDigest,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  githubMutationBoundaryContractDigest,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
  validateExternalActivationRequirements,
} from '../lib/external-activation.mjs'
import {
  normalizeRuntimeValidationContext,
  resolveGitHubRuntimeValidationContext,
  runtimeCertificationPaths,
} from '../lib/runtime-certification.mjs'
import {
  FLEET_RECONCILE_MIRROR_PROTOCOL,
  FLEET_RECONCILE_MIRROR_IDENTITY_KEYS as MIRROR_IDENTITY_KEYS,
  buildFleetReconcileHeadVerificationRequest as headVerificationRequest,
  buildFleetReconcileEventMirrorRequest as eventMirrorRequest,
  validateFleetReconcileHeadVerification as validateHeadVerification,
  validateFleetReconcileHeadVerificationRequest as validateHeadVerificationRequest,
  validateFleetReconcileMirrorIdentity as validateMirrorIdentity,
  validateFleetReconcileOffHostReceipt as validateOffHostReceipt,
  verifyFleetReconcileJournalOffHost as verifyJournalOffHost,
} from '../lib/fleet-reconcile-mirror.mjs'
import { GITHUB_API_VERSION } from '../../../scripts/lib/github-mutation-boundary.mjs'
import {
  controlPlaneGenesisCommentBody,
  validateControlPlaneGenesisReceipt,
  verifyGitCheckoutIdentity,
} from '../../../scripts/verify-privileged-change.mjs'
import { ensureRuntimeEvidenceDirectory } from '../../../scripts/lib/governance-runtime-evidence.mjs'

const DEFAULT_INVENTORY = resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')
const DEFAULT_DESIRED = resolve(GOVERNANCE_ROOT, 'desired/github.json')
const DEFAULT_RINGS = resolve(GOVERNANCE_ROOT, 'release-rings.json')
const DEFAULT_CERTIFICATIONS = resolve(GOVERNANCE_ROOT, 'providers/certifications.json')
const DEFAULT_WAIVERS = resolve(GOVERNANCE_ROOT, 'waivers.json')
const DEFAULT_PRIVILEGED_POLICY = resolve(GOVERNANCE_ROOT, 'privileged-trust-roots.json')
const DEFAULT_RUNTIME_PROFILE = resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')
const DEFAULT_EXTERNAL_ACTIVATION_REQUIREMENTS = resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json')
const DEFAULT_EXTERNAL_ACTIVATION_POLICY = resolve(GOVERNANCE_ROOT, 'external-activation-policy.json')
const DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT = resolve(
  GOVERNANCE_ROOT,
  GITHUB_MUTATION_BOUNDARY_CONTRACT_PATH.replace(/^infra\/governance\//, ''),
)
const DEFAULT_STAGED_ROLLOUT_PLAN = resolve(GOVERNANCE_ROOT, 'staged-rollout-plan.json')
const DEFAULT_AUTHORITY_POLICY = resolve(GOVERNANCE_ROOT, '../../AGENTS.md')
const AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS = 'authority-policy-bootstrap'
const AUTHORITY_BOOTSTRAP_PLAN_KIND = 'github-authority-policy-bootstrap-plan'
const AUTHORITY_BOOTSTRAP_TRANSACTION_KIND = 'github-authority-policy-bootstrap-transaction'
const AUTHORITY_BOOTSTRAP_DURABILITY_CLASS = 'bootstrap-local-recoverable'
const AUTHORITY_BOOTSTRAP_REPLAY_KIND = 'github-authority-policy-bootstrap-durable-replay'
const AUTHORITY_BOOTSTRAP_REPLAY_PURPOSE = 'candidate-freeze-durability-prerequisite'
const AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID = 'activate-off-host-append-only-reconcile-evidence-mirror'
const FLEET_RECONCILE_LOCAL_DURABILITY_CLASS = 'local-content-addressed-fsync-v1'
const FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS = 'independent-append-only-off-host-v1'
export const AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT = 'staged-rollout/authority-bootstrap-replay/sha256'
const AUTHORITY_BOOTSTRAP_PLAN_KEYS = new Set([
  'schemaVersion',
  'kind',
  'transactionClass',
  'mode',
  'readOnly',
  'promotionEligible',
  'managedEvidence',
  'repositoryId',
  'repository',
  'defaultBranch',
  'defaultBranchHeadSha',
  'defaultBranchTreeSha',
  'inventoryDigest',
  'desiredDigest',
  'stagedRolloutPlanDigest',
  'bootstrapBoundaryDigest',
  'authorityPolicyDigest',
  'projection',
  'projectionDigest',
  'genesisReceipt',
  'genesisReceiptDigest',
  'genesisReadbackTrust',
  'genesisReadbackDigest',
  'observedStateDigest',
  'conflicts',
  'actions',
  'actionsDigest',
  'rollbackPlan',
  'rollbackPlanDigest',
  'planDigest',
])
const AUTHORITY_BOOTSTRAP_PROJECTION_KEYS = new Set([
  'transactionClass',
  'repositoryId',
  'repository',
  'defaultBranch',
  'profile',
  'actionsWorkflowPermissions',
  'rulesets',
  'environments',
  'requiredChecks',
  'immutableReleases',
  'releaseMutationAllowed',
  'staleResourceDeletionAllowed',
])
const AUTHORITY_BOOTSTRAP_ALLOWED_ACTION_KINDS = new Set([
  'create-environment',
  'create-ruleset',
  'update-actions-workflow-permissions',
  'update-environment',
  'update-ruleset',
])
const AUTHORITY_BOOTSTRAP_JOURNAL_KEYS = new Set([
  'schemaVersion',
  'kind',
  'transactionClass',
  'durabilityClass',
  'offHostMirrored',
  'promotionEligible',
  'managedEvidence',
  'transactionId',
  'plan',
  'planDigest',
  'state',
  'startedAt',
  'completedAt',
  'failedAt',
  'error',
  'rollbackAttempted',
  'recoveryInstruction',
  'actions',
  'rollbackPlan',
  'rollbackPlanDigest',
  'authorizationEnvelopeDigest',
  'recoveredAt',
  'recoveryFailures',
  'rollbackAuthorizationEventHeadDigest',
  'rollbackStartedAt',
  'rollbackCompletedAt',
  'rollbackBlockers',
  'events',
  'eventHeadDigest',
  'offHostReceipts',
])
const AUTHORITY_BOOTSTRAP_REPLAY_KEYS = new Set([
  'schemaVersion',
  'kind',
  'protocolVersion',
  'purpose',
  'promotionEligible',
  'managedEvidence',
  'managedEvidenceScope',
  'requirementId',
  'activationRequirementDigest',
  'sourceJournal',
  'sourceJournalDigest',
  'mirrorIdentity',
  'mirrorIdentityDigest',
  'eventReceipts',
  'eventReceiptsDigest',
  'headVerificationRequest',
  'headVerification',
  'replayedAt',
  'convergenceReadback',
  'convergenceReadbackDigest',
  'receiptDigest',
])

const clone = value => JSON.parse(JSON.stringify(value))

export function githubApiRequestArgs(method, path) {
  return [
    'api', '-X', method,
    '-H', 'Accept: application/vnd.github+json',
    '-H', `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    path,
  ]
}

export class GhApiClient {
  constructor({
    environment = process.env,
    executable,
    token,
    tokenEnvironmentName = 'GH_TOKEN',
  } = {}) {
    this.token = captureClosedGitHubToken({
      token,
      environment,
      requireToken: false,
      tokenEnvironmentName,
    })
    this.executable = executable
  }

  execute(args, {
    input,
    maxOutputBytes = 16 * 1024 * 1024,
    output = 'capture',
    timeoutMs = 60_000,
  } = {}) {
    invariant(this.token !== null, 'GitHub API transport requires one captured GH_TOKEN authority')
    return runClosedGh(args, {
      cwd: resolve(GOVERNANCE_ROOT, '../..'),
      environment: {},
      executable: this.executable,
      input,
      maxOutputBytes,
      output,
      repoRoot: resolve(GOVERNANCE_ROOT, '../..'),
      timeoutMs,
      token: this.token,
      tokenEnvironmentName: null,
    })
  }

  request(method, path, body, options = {}) {
    const args = githubApiRequestArgs(method, path)
    if (body !== undefined) args.push('--input', '-')
    const result = this.execute(args, {
      input: body === undefined ? undefined : JSON.stringify(body),
    })
    if (result.error) throw new Error(`GitHub API transport failed for ${method} ${path}: ${result.error.message}`)
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || 'unknown gh api failure').trim().slice(0, 4000)
      if (options.allow404 && /(?:HTTP 404|Not Found)/i.test(detail)) return null
      throw new Error(`GitHub API failed closed for ${method} ${path} (exit ${result.status}): ${detail}`)
    }
    const output = result.stdout.trim()
    if (!output) return null
    try {
      return JSON.parse(output)
    } catch (error) {
      throw new Error(`GitHub API returned invalid JSON for ${method} ${path}: ${error.message}`)
    }
  }

  requestBytes(method, path, { maxOutputBytes = 20 * 1024 * 1024 } = {}) {
    const args = githubApiRequestArgs(method, path)
    const result = this.execute(args, {
      maxOutputBytes,
      output: 'buffer',
    })
    if (result.error || result.signal !== null || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
      const detail = Buffer.isBuffer(result.stderr)
        ? result.stderr.toString('utf8')
        : String(result.error?.message || result.stderr || `exit ${result.status}`)
      throw new Error(`GitHub binary API failed closed for ${method} ${path}: ${detail.trim().slice(0, 1000)}`)
    }
    return Buffer.from(result.stdout)
  }
}

export class FixtureApiClient {
  constructor(directory) {
    this.routes = readJson(resolve(directory, 'routes.json'))
    this.calls = []
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body: body === undefined ? undefined : clone(body) })
    const route = this.routes[`${method} ${path}`]
    if (!route && options.allow404) return null
    if (!route) throw new Error(`Fixture API has no route for ${method} ${path}`)
    if (route.error) throw new Error(`Fixture API error for ${method} ${path}: ${route.error}`)
    return clone(route.response ?? null)
  }
}

function assertTrustedLiveGitHubClient(client, label) {
  invariant(
    client instanceof GhApiClient && Object.getPrototypeOf(client) === GhApiClient.prototype,
    `${label} requires the canonical live GitHub client`,
  )
  return client
}

function resolveRuntimeValidationContextCore({ client, inventory, certifications = { certifications: [] }, runtimeProfile, repoRoot = runtimeCertificationPaths.repoRoot, runtimeValidationContext = {} }, productionLive) {
  return resolveGitHubRuntimeValidationContext({
    client,
    inventory,
    certifications,
    runtimeProfile,
    repoRoot,
    runtimeValidationContext,
    live: productionLive,
  })
}

function assertLiveIdentitySnapshot(productionLive, repositories, observations, runtimeValidationContext) {
  if (!productionLive) return true
  invariant(repositories.length === observations.length, 'Live GitHub identity readback coverage is incomplete')
  for (let index = 0; index < repositories.length; index += 1) {
    const repository = repositories[index]
    const observation = observations[index]
    const identity = runtimeValidationContext.externalRepositoryIdentities?.[repository.id]
    invariant(identity
      && observation.defaultBranchHeadSha === identity.gitCommit
      && observation.defaultBranchTreeSha === identity.gitTree,
    `Live GitHub default-branch commit/tree changed during reconciliation preflight for ${repository.id}`)
  }
  return true
}

export class CommandOffHostMirror {
  constructor(commandPath, { credential = null } = {}) {
    invariant(
      typeof commandPath === 'string'
        && commandPath.length > 0
        && resolve(commandPath) === commandPath,
      'Off-host mirror command path must be one absolute normalized path',
    )
    invariant(
      credential === null
        || (
          typeof credential === 'string'
          && credential.length >= 8
          && credential.length <= 4096
          && !/[\0\r\n]/.test(credential)
        ),
      'Off-host mirror credential is malformed',
    )
    const sourceInfoBefore = lstatSync(commandPath, { bigint: true })
    invariant(
      sourceInfoBefore.isFile()
        && !sourceInfoBefore.isSymbolicLink()
        && sourceInfoBefore.nlink === 1n
        && (sourceInfoBefore.mode & 0o111n) !== 0n
        && (sourceInfoBefore.mode & 0o022n) === 0n
        && realpathSync(commandPath) === commandPath,
      'Off-host mirror command must be one canonical non-writable executable file',
    )
    const bytes = readFileSync(commandPath)
    const sourceInfoAfter = lstatSync(commandPath, { bigint: true })
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => sourceInfoBefore[key] === sourceInfoAfter[key]),
      'Off-host mirror command changed while it was authenticated',
    )
    const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'qijenchen-off-host-mirror-')))
    chmodSync(privateRoot, 0o700)
    const privateCommand = join(privateRoot, 'mirror-adapter')
    let descriptor
    try {
      descriptor = openSync(privateCommand, 'wx', 0o500)
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
      closeSync(descriptor)
      descriptor = undefined
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
    }
    const privateInfo = lstatSync(privateCommand, { bigint: true })
    invariant(
      privateInfo.isFile()
        && !privateInfo.isSymbolicLink()
        && privateInfo.nlink === 1n
        && (privateInfo.mode & 0o777n) === 0o500n
        && sha256(readFileSync(privateCommand)) === sha256(bytes),
      'Off-host mirror private command materialization failed',
    )
    process.once('exit', () => {
      try { rmSync(privateRoot, { recursive: true, force: true }) } catch {}
    })
    this.commandPath = commandPath
    this.commandInfo = sourceInfoAfter
    this.privateCommand = privateCommand
    this.privateCommandInfo = privateInfo
    this.privateRoot = privateRoot
    this.credential = credential
    this.adapterCommandSha256 = sha256(bytes)
  }

  invoke(envelope, operation) {
    invariant(this.credential !== null, `Off-host mirror ${operation} requires one explicitly captured credential`)
    const currentSource = lstatSync(this.commandPath, { bigint: true })
    const currentPrivate = lstatSync(this.privateCommand, { bigint: true })
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => currentSource[key] === this.commandInfo[key]),
      `Off-host mirror ${operation} source command changed after authentication`,
    )
    invariant(
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
        .every(key => currentPrivate[key] === this.privateCommandInfo[key])
        && sha256(readFileSync(this.privateCommand)) === this.adapterCommandSha256,
      `Off-host mirror ${operation} private command changed after authentication`,
    )
    const result = spawnSync(this.privateCommand, [], {
      cwd: this.privateRoot,
      encoding: 'utf8',
      env: {
        GOVERNANCE_OFF_HOST_MIRROR_TOKEN: this.credential,
        HOME: this.privateRoot,
        LANG: 'C',
        LC_ALL: 'C',
        NO_COLOR: '1',
        PATH: '/usr/bin:/bin',
        XDG_CONFIG_HOME: this.privateRoot,
      },
      input: `${stableStringify(envelope)}\n`,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    if (result.error || result.status !== 0) throw new Error(`Off-host mirror ${operation} failed: ${result.error?.message ?? (result.stderr || result.stdout || `exit ${result.status}`).trim()}`)
    try {
      return JSON.parse(result.stdout)
    } catch (error) {
      throw new Error(`Off-host mirror ${operation} returned invalid JSON: ${error.message}`)
    }
  }

  append(eventEnvelope) {
    return this.invoke(eventEnvelope, 'append acknowledgement')
  }

  verify(headEnvelope) {
    return this.invoke(headEnvelope, 'live head verification')
  }
}

const validatePartialInventoryFixtureGovernanceModel = createPartialInventoryFixtureValidator()

function validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, productionLive) {
  const context = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  const validator = productionLive
    ? validateGovernanceModel
    : validatePartialInventoryFixtureGovernanceModel
  return validator({
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    now,
    issuerRegistry,
    runtimeProfile,
    repoRoot: context.repoRoot,
    runtimeIdentity: context.runtimeIdentity,
    externalRepositoryIdentities: context.externalRepositoryIdentities,
  })
}

export function validateModel(inventory, desired, rings, certifications, waivers, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {}) {
  return validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, true)
}

export function computeEligibility({
  repo,
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  now = new Date(),
  issuerRegistry = loadIssuerRegistry(),
  runtimeProfile,
  runtimeValidationContext = {},
  activationPolicy,
  expectedActivationPolicyDigest,
}) {
  validateInventoryForEligibility({
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    now,
    issuerRegistry,
    runtimeProfile,
    runtimeValidationContext,
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  const assignment = rings.assignments[repo.id]
  const ring = rings.rings.find(candidate => candidate.id === assignment.ring)
  const blockers = [...(assignment.manualBlockers ?? [])]
  const soakPredicate = ring.promotionPredicates.find(predicate => (
    predicate.type === 'soak-complete' || predicate.type === 'soak-observation'
  ))
  const soak = evaluateReleaseRingSoak({
    predicate: soakPredicate,
    repo,
    ring,
    assignment,
    candidateRelease: rings.candidateRelease,
    now,
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  if (!soak.pass) blockers.push(soak.message)

  const priorOrder = Math.max(-1, ...rings.rings.filter(candidate => candidate.order < ring.order).map(candidate => candidate.order))
  if (priorOrder >= 0) {
    const priorRingIds = new Set(rings.rings.filter(candidate => candidate.order === priorOrder).map(candidate => candidate.id))
    const unpromoted = Object.entries(rings.assignments).filter(([id, value]) => {
      if (!priorRingIds.has(value.ring)) return false
      const upstreamRepo = inventory.repositories.find(item => item.id === id)
      return !verifyCompletionAttestation(value.completionAttestation, {
        repoId: id,
        github: upstreamRepo?.github,
        ringId: value.ring,
        waveId: value.wave,
        candidateRelease: rings.candidateRelease,
        issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
        attestationPolicy: rings.attestationPolicy,
      }, { now, issuerRegistry }).valid
    }).map(([id]) => id)
    if (unpromoted.length > 0) blockers.push(`upstream ring is not promoted: ${unpromoted.join(', ')}`)
  }

  const certificationMap = new Map((certifications?.certifications ?? []).map(item => [certificationKey(item.provider, item.runtimeKind, item.surface, item.repositoryRole), item]))
  for (const requirement of repo.providerSurfacesRequired ?? []) {
    const [provider, runtimeKind, surface] = requirement.split('/')
    const certification = certificationMap.get(certificationKey(provider, runtimeKind, surface, repo.role))
    if (!certification || certification.status !== 'certified') blockers.push(`provider surface not certified: ${requirement}/${repo.role}`)
    else if (certification.expiresAt && new Date(certification.expiresAt) <= now) blockers.push(`provider surface certification expired: ${requirement}`)
  }

  for (const waiver of waivers?.waivers ?? []) {
    if (waiver.scope?.repository !== repo.id && waiver.scope?.repository !== repo.github) continue
    if (waiver.status === 'active' && new Date(waiver.expiresAt) <= now) blockers.push(`active waiver expired: ${waiver.id}`)
    if (waiver.status === 'active' && ['critical', 'high'].includes(waiver.risk)) blockers.push(`open ${waiver.risk} waiver: ${waiver.id}`)
  }
  const authorization = verifyApplyAuthorization(assignment.applyAuthorization, {
    repoId: repo.id,
    github: repo.github,
    ringId: assignment.ring,
    waveId: assignment.wave,
    candidateRelease: rings.candidateRelease,
    issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
    attestationPolicy: rings.attestationPolicy,
  }, { now, issuerRegistry })
  const completion = verifyCompletionAttestation(assignment.completionAttestation, {
    repoId: repo.id,
    github: repo.github,
    ringId: assignment.ring,
    waveId: assignment.wave,
    candidateRelease: rings.candidateRelease,
    issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
    attestationPolicy: rings.attestationPolicy,
  }, { now, issuerRegistry })
  return { eligible: blockers.length === 0 && authorization.valid, promoted: completion.valid, ring: ring.id, wave: assignment.wave, blockers: [...blockers, ...authorization.failures] }
}

function validateInventoryForEligibility({
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  now,
  issuerRegistry,
  runtimeProfile,
  runtimeValidationContext,
  activationPolicy,
  expectedActivationPolicyDigest,
}) {
  // Keep direct callers fail-closed too; buildPlan additionally validates desired GitHub state.
  validateInventory(inventory)
  validateReleaseRings(inventory, rings, {
    now,
    issuerRegistry,
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  const context = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  validateCertifications(certifications, {
    now,
    issuerRegistry,
    runtimeProfile,
    inventory,
    desiredGithub: desired,
    repoRoot: context.repoRoot,
    runtimeIdentity: context.runtimeIdentity,
    externalRepositoryIdentities: context.externalRepositoryIdentities,
  })
  validateWaivers(inventory, waivers)
}

export function materializeProfile(repo, desired, rings, eligibility) {
  const profile = desired.profiles[repo.desiredProfile]
  const active = eligibility.eligible || eligibility.promoted
  const requiredStatusChecks = profile.requiredChecks.map(check => ({
    context: check.context,
    integration_id: desired.integrations[check.integration].id,
  }))
  const rulesets = profile.rulesets.map(source => {
    const ruleset = clone(source)
    delete ruleset.rollout
    if (source.rollout === 'on-promotion' && !active) ruleset.enforcement = 'disabled'
    ruleset.rules = ruleset.rules.map(rule => {
      if (rule.type !== 'required_status_checks' || !rule.parameters?.fromProfile) return rule
      const parameters = clone(rule.parameters)
      delete parameters.fromProfile
      parameters.required_status_checks = requiredStatusChecks
      return { ...rule, parameters }
    })
    return ruleset
  })
  const environments = profile.environments
    .filter(environment => environment.rollout === 'always' || active)
    .map(environment => ({
      name: environment.name,
      wait_timer: environment.waitTimer,
      prevent_self_review: environment.preventSelfReview,
      reviewers: clone(environment.reviewers),
      deployment_branch_policy: {
        protected_branches: environment.deploymentBranchPolicy.protectedBranches,
        custom_branch_policies: environment.deploymentBranchPolicy.customBranchPolicies,
      },
    }))
  return {
    profile,
    actionsWorkflowPermissions: clone(profile.actionsWorkflowPermissions),
    rulesets,
    environments,
    declaredEnvironments: profile.environments,
    requiredChecks: profile.requiredChecks,
    immutableReleases: profile.immutableReleases,
    tagPolicy: profile.tagPolicy,
    assignment: rings.assignments[repo.id],
    eligibility,
  }
}

function sortRules(rules) {
  return clone(rules ?? []).map(rule => {
    if (rule.type === 'required_status_checks' && Array.isArray(rule.parameters?.required_status_checks)) {
      rule.parameters.required_status_checks.sort((a, b) => compareUtf8Bytes(a.context, b.context))
    }
    return rule
  }).sort((a, b) => compareUtf8Bytes(`${a.type}:${stableStringify(a, 0)}`, `${b.type}:${stableStringify(b, 0)}`))
}

function normalizeRuleset(ruleset) {
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: clone(ruleset.conditions ?? {}),
    bypass_actors: clone(ruleset.bypass_actors ?? []).sort((a, b) => compareUtf8Bytes(stableStringify(a, 0), stableStringify(b, 0))),
    rules: sortRules(ruleset.rules),
  }
}

function normalizeEnvironment(environment) {
  const rules = environment.protection_rules ?? []
  const wait = rules.find(rule => rule.type === 'wait_timer')
  const reviewers = rules.find(rule => rule.type === 'required_reviewers')
  const reviewerValues = environment.reviewers ?? reviewers?.reviewers ?? []
  invariant(Array.isArray(reviewerValues), `GitHub environment ${environment.name} reviewers are invalid`)
  const normalizedReviewers = reviewerValues.map((reviewer, index) => {
    invariant(reviewer && typeof reviewer === 'object' && !Array.isArray(reviewer), `GitHub environment ${environment.name} reviewer ${index} is invalid`)
    const observedIdentity = reviewer.reviewer
    const reviewerKeys = Object.keys(reviewer).sort(compareUtf8Bytes)
    const expectedReviewerKeys = (observedIdentity === undefined ? ['id', 'type'] : ['reviewer', 'type']).sort(compareUtf8Bytes)
    invariant(
      reviewerKeys.length === expectedReviewerKeys.length
        && reviewerKeys.every((key, keyIndex) => key === expectedReviewerKeys[keyIndex]),
      `GitHub environment ${environment.name} reviewer ${index} has an invalid or open shape`,
    )
    const id = observedIdentity === undefined ? reviewer.id : observedIdentity?.id
    invariant(
      ['User', 'Team'].includes(reviewer.type)
        && Number.isSafeInteger(id)
        && id > 0,
      `GitHub environment ${environment.name} reviewer ${index} identity is invalid`,
    )
    return { type: reviewer.type, id }
  }).sort((left, right) => compareUtf8Bytes(left.type, right.type) || left.id - right.id)
  invariant(
    new Set(normalizedReviewers.map(reviewer => `${reviewer.type}:${reviewer.id}`)).size === normalizedReviewers.length,
    `GitHub environment ${environment.name} reviewers are duplicated`,
  )
  return {
    name: environment.name,
    wait_timer: environment.wait_timer ?? wait?.wait_timer ?? 0,
    prevent_self_review: environment.prevent_self_review ?? reviewers?.prevent_self_review ?? false,
    reviewers: normalizedReviewers,
    deployment_branch_policy: clone(environment.deployment_branch_policy ?? null),
  }
}

function normalizeActionsWorkflowPermissions(settings) {
  invariant(settings && typeof settings === 'object' && !Array.isArray(settings), 'GitHub Actions workflow-permissions response is invalid')
  invariant(
    Object.keys(settings).sort(compareUtf8Bytes).join(',') === 'can_approve_pull_request_reviews,default_workflow_permissions',
    'GitHub Actions workflow-permissions response has an invalid or open shape',
  )
  invariant(settings.default_workflow_permissions === 'read' || settings.default_workflow_permissions === 'write', 'GitHub Actions default workflow permission is invalid')
  invariant(typeof settings.can_approve_pull_request_reviews === 'boolean', 'GitHub Actions pull-request workflow permission is invalid')
  return {
    default_workflow_permissions: settings.default_workflow_permissions,
    can_approve_pull_request_reviews: settings.can_approve_pull_request_reviews,
  }
}

function decodeContent(response) {
  if (typeof response?.text === 'string') return response.text
  if (!response?.content || response.encoding !== 'base64') return null
  return Buffer.from(response.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

function immutableEnabled(response) {
  return response?.enabled === true || response?.immutable_releases_enabled === true
}

function workflowRunIdFromDetailsUrl(detailsUrl, repo) {
  if (typeof detailsUrl !== 'string') return null
  let url
  try { url = new URL(detailsUrl) } catch { return null }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
  const escaped = repo.github.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = url.pathname.match(new RegExp(`^/${escaped}/actions/runs/([1-9][0-9]*)(?:/job/[1-9][0-9]*)?/?$`))
  return match?.[1] ?? null
}

const GITHUB_OWNED_DEPENDABOT_WORKFLOW = /^dynamic\/dependabot\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)*$/
const REPOSITORY_WORKFLOW = /^\.github\/workflows\/[^/\r\n]+\.ya?ml(?:@[^\r\n]+)?$/

function classifyWorkflowRun(response, slug, runId) {
  const path = response?.path
  const dynamicEvent = response?.event === 'dynamic'
  const dynamicPath = typeof path === 'string' && path.startsWith('dynamic/')
  if (dynamicEvent || dynamicPath) {
    invariant(
      dynamicEvent && GITHUB_OWNED_DEPENDABOT_WORKFLOW.test(path),
      `GitHub workflow-run dynamic identity is invalid for ${slug}/${runId}`,
    )
    return 'github-owned-dependabot'
  }
  invariant(typeof path === 'string' && REPOSITORY_WORKFLOW.test(path), `GitHub workflow-run path is invalid for ${slug}/${runId}`)
  return 'repository-workflow'
}

function fetchCompleteCollection(client, path, { select, label, totalCount = value => value?.total_count }) {
  const collected = []
  const identities = new Set()
  let expectedTotal = null
  for (let page = 1; page <= 10_000; page += 1) {
    const response = client.request('GET', page === 1 ? path : `${path}&page=${page}`)
    const items = select(response)
    invariant(Array.isArray(items), `${label} response page ${page} is invalid`)
    const declaredTotal = totalCount(response)
    if (Number.isInteger(declaredTotal)) {
      if (expectedTotal === null) expectedTotal = declaredTotal
      else invariant(declaredTotal === expectedTotal, `${label} total_count changed during pagination`)
    }
    for (const item of items) {
      const identity = item?.id === undefined ? `name:${item?.name}` : `id:${item.id}`
      invariant(identity !== 'name:undefined' && !identities.has(identity), `${label} pagination returned a missing or duplicate identity ${identity}`)
      identities.add(identity)
      collected.push(item)
    }
    if (items.length < 100) {
      invariant(expectedTotal === null || collected.length === expectedTotal, `${label} pagination count ${collected.length} differs from declared total ${expectedTotal}`)
      return collected
    }
  }
  throw new Error(`${label} pagination exceeded the fail-closed page limit`)
}

export function fetchRepositoryState(client, repo, materialized, desired) {
  const slug = repo.github
  const metadata = client.request('GET', `/repos/${slug}`)
  const defaultBranchCommit = client.request('GET', `/repos/${slug}/commits/${encodeURIComponent(repo.defaultBranch)}`)
  invariant(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(defaultBranchCommit?.sha ?? ''), `GitHub default-branch commit response is invalid for ${slug}`)
  invariant(Number.isFinite(new Date(defaultBranchCommit?.commit?.committer?.date).getTime()), `GitHub default-branch commit timestamp is invalid for ${slug}`)
  const actionsWorkflowPermissions = normalizeActionsWorkflowPermissions(
    client.request('GET', `/repos/${slug}/actions/permissions/workflow`),
  )
  const summaries = fetchCompleteCollection(client, `/repos/${slug}/rulesets?per_page=100`, {
    select: value => value,
    totalCount: () => null,
    label: `GitHub rulesets for ${slug}`,
  })
  const environments = fetchCompleteCollection(client, `/repos/${slug}/environments?per_page=100`, {
    select: value => value?.environments,
    label: `GitHub environments for ${slug}`,
  })
  const checkRuns = fetchCompleteCollection(client, `/repos/${slug}/commits/${defaultBranchCommit.sha}/check-runs?per_page=100`, {
    select: value => value?.check_runs,
    label: `GitHub check-runs for ${slug}`,
  })
  const resolvedCheckRuns = clone(checkRuns)
  const githubActions = desired.integrations.githubActions
  const workflowRuns = new Map()
  for (const run of resolvedCheckRuns) {
    const matchesGitHubActionsId = run.app?.id === githubActions?.id
    const matchesGitHubActionsSlug = run.app?.slug === githubActions?.slug
    invariant(matchesGitHubActionsId === matchesGitHubActionsSlug, `GitHub Actions check-run App identity mismatch for ${slug}/${run.id}`)
    const runId = workflowRunIdFromDetailsUrl(run.details_url, repo)
    if (!matchesGitHubActionsId) {
      if (runId) {
        const nonActionsIntegrations = Object.entries(desired.integrations).filter(([name]) => name !== 'githubActions')
        const knownNonActionsApp = nonActionsIntegrations.some(([, integration]) => (
          Number.isInteger(integration.id)
          && run.app?.id === integration.id
          && run.app?.slug === integration.slug
        ))
        invariant(knownNonActionsApp, `Untrusted check-run App claims a GitHub Actions workflow run for ${slug}/${run.id}`)
      }
      continue
    }
    if (!runId) continue
    if (!workflowRuns.has(runId)) {
      const response = client.request('GET', `/repos/${slug}/actions/runs/${runId}`)
      invariant(response && String(response.id) === runId, `GitHub workflow-run response identity mismatch for ${slug}/${runId}`)
      const classification = classifyWorkflowRun(response, slug, runId)
      workflowRuns.set(runId, classification === 'github-owned-dependabot' ? null : {
        id: response.id,
        path: response.path,
        head_sha: response.head_sha,
        event: response.event,
        status: response.status,
        conclusion: response.conclusion,
      })
    }
    const workflowRun = workflowRuns.get(runId)
    if (workflowRun) run.workflowRun = clone(workflowRun)
  }

  const rulesets = []
  for (const summary of summaries) {
    invariant(summaries.filter(item => item.name === summary.name).length <= 1, `Multiple remote rulesets named ${summary.name} in ${slug}`)
    rulesets.push(client.request('GET', `/repos/${slug}/rulesets/${summary.id}`))
  }
  const environmentDetails = []
  for (const summary of environments) {
    invariant(environments.filter(item => item.name === summary.name).length <= 1, `Multiple remote environments named ${summary.name} in ${slug}`)
    environmentDetails.push(client.request('GET', `/repos/${slug}/environments/${encodeURIComponent(summary.name)}`))
  }

  const paths = new Set([
    ...materialized.requiredChecks.map(check => check.workflow).filter(Boolean),
    ...materialized.declaredEnvironments.map(environment => environment.workflow),
    ...(materialized.tagPolicy.sourceWorkflow ? [materialized.tagPolicy.sourceWorkflow] : []),
  ])
  const workflowContents = {}
  for (const path of paths) {
    const response = client.request('GET', `/repos/${slug}/contents/${path}?ref=${encodeURIComponent(repo.defaultBranch)}`, undefined, { allow404: true })
    const content = decodeContent(response)
    workflowContents[path] = content === null ? null : {
      content,
      declaredBlobSha: response?.sha ?? null,
      identity: workflowIdentity(content, response?.sha ?? null),
    }
  }
  const immutableReleases = materialized.immutableReleases
    ? client.request('GET', `/repos/${slug}/immutable-releases`, undefined, { allow404: true })
    : null
  return {
    metadata,
    defaultBranchHeadSha: defaultBranchCommit.sha,
    defaultBranchTreeSha: defaultBranchCommit?.commit?.tree?.sha ?? null,
    defaultBranchCommittedAt: defaultBranchCommit.commit.committer.date,
    rulesetSummaries: summaries,
    rulesets,
    environmentSummaries: environments,
    environments: environmentDetails,
    checkRuns: resolvedCheckRuns,
    workflowContents,
    actionsWorkflowPermissions,
    immutableReleases,
  }
}

function workflowPreflight(check, workflow) {
  const failures = []
  if (!workflow) return [`required workflow missing from protected base: ${check.workflow}`]
  const { identity } = workflow
  failures.push(...validateWorkflowIdentity(check.workflowIdentity, identity).map(failure => `${check.context}: ${failure}`))
  const triggers = identity.semantics.on
  for (const event of check.requiredEvents) {
    if (!(event in triggers)) failures.push(`${check.context} workflow lacks ${event} trigger`)
    if (check.requireUnconditionalPullRequest) {
      const trigger = triggers[event]
      if (trigger && typeof trigger === 'object' && ('paths' in trigger || 'paths-ignore' in trigger)) failures.push(`${check.context} PR trigger is path-filtered and can leave a required context absent`)
    }
  }
  const semanticText = stableStringify(identity.semantics, 0)
  if (check.forbidCandidateControlledSkip && /(?:\[skip-|skip-(?:visual|composition)|pull_request\.title|head_commit\.message[^\n]*skip)/i.test(semanticText)) {
    failures.push(`${check.context} workflow contains a candidate-controlled skip path`)
  }
  if (check.trustSource === 'protected-base-workflow') {
    const verify = identity.semantics.jobs['verify-candidate']
    const verdict = identity.semantics.jobs['publish-app-verdict']
    const tokenStep = verdict?.steps.find(step => /^actions\/create-github-app-token@[a-f0-9]{40}$/.test(step.uses ?? ''))
    const verifyText = stableStringify(verify ?? null, 0)
    const verdictText = stableStringify(verdict ?? null, 0)
    if (
      !verify
      || !verdict
      || verdict.if !== 'always()'
      || verdict.needs !== 'verify-candidate'
      || workflowEnvironmentName(verdict) !== 'governance-check-verdict'
      || verifyText.includes('secrets.')
      || verifyText.includes('create-github-app-token')
      || !tokenStep
      || tokenStep.with?.['app-id'] !== '${{ secrets.GOVERNANCE_CHECK_APP_ID }}'
      || tokenStep.with?.['private-key'] !== '${{ secrets.GOVERNANCE_CHECK_APP_PRIVATE_KEY }}'
      || tokenStep.with?.['permission-checks'] !== 'write'
      || verdictText.includes('GOVERNANCE_WRITER_APP')
      || verdictText.includes('permission-contents')
      || verdictText.includes('permission-pull-requests')
      || !workflow.content.includes(check.context)
      || !workflow.content.includes('github.event.pull_request.head.sha')
      || !workflow.content.includes('/check-runs')
    ) failures.push(`${check.context} lacks a protected-base credential-free verifier and environment-isolated Check App verdict chain`)
  }
  return failures
}

function workflowEnvironmentName(job) {
  if (typeof job.environment === 'string') return job.environment
  if (job.environment && typeof job.environment === 'object') return job.environment.name ?? null
  return null
}

function environmentWorkflowPreflight(environment, workflow, integrations) {
  if (!workflow) return [`environment workflow missing: ${environment.workflow}`]
  const failures = validateWorkflowIdentity(environment.workflowIdentity, workflow.identity)
    .map(failure => `environment ${environment.name}: ${failure}`)
  const environmentJobs = Object.values(workflow.identity.semantics.jobs)
    .filter(job => workflowEnvironmentName(job) === environment.name)
  if (environmentJobs.length === 0) failures.push(`environment ${environment.name} is not structurally wired in ${environment.workflow}`)
  if (environment.credentialIntegration) {
    const integration = integrations[environment.credentialIntegration]
    const prefix = integration?.secretPrefix
    const steps = environmentJobs.flatMap(job => job.steps)
    const tokenStep = steps.find(step => /^actions\/create-github-app-token@[a-f0-9]{40}$/.test(step.uses ?? ''))
    const appIdMatches = tokenStep?.with?.['app-id'] === `\${{ secrets.${prefix}_ID }}`
    const privateKeyMatches = tokenStep?.with?.['private-key'] === `\${{ secrets.${prefix}_PRIVATE_KEY }}`
    if (integration?.capability === 'check-only') {
      if (
        integration.operationMode !== 'base-trusted-isolated-workflow'
        || environment.name !== 'governance-check-verdict'
        || !prefix
        || !tokenStep
        || !appIdMatches
        || !privateKeyMatches
        || tokenStep.with?.['permission-checks'] !== 'write'
        || tokenStep.with?.['permission-contents'] === 'write'
        || tokenStep.with?.['permission-pull-requests'] === 'write'
        || stableStringify(workflow.identity.semantics, 0).includes('GOVERNANCE_WRITER_APP')
      ) failures.push(`environment ${environment.name} lacks an isolated check-only App chain in ${environment.workflow}`)
    } else if (
      integration?.capability !== 'writer'
      || integration?.operationMode !== 'github-actions-environment'
      || !prefix
      || !tokenStep
      || !appIdMatches
      || !privateKeyMatches
      || tokenStep.with?.['permission-contents'] !== 'write'
      || tokenStep.with?.['permission-pull-requests'] !== 'write'
      || tokenStep.with?.['permission-checks'] === 'write'
      || stableStringify(workflow.identity.semantics, 0).includes('GOVERNANCE_CHECK_APP')
    ) failures.push(`environment ${environment.name} lacks a distinct writer-only App chain in ${environment.workflow}`)
  }
  return failures
}

function state(value) {
  const snapshot = value === null ? { state: 'absent' } : { state: 'present', value: clone(value) }
  return { ...snapshot, digest: sha256(stableStringify(snapshot, 0)) }
}

function managedAction(action, beforeValue, compensation) {
  const beforeImage = state(beforeValue)
  const expectedValue = action.kind === 'delete-stale-ruleset' || action.kind === 'delete-stale-environment'
    ? null
    : action.kind === 'enable-immutable-releases'
      ? { enabled: true }
      : action.kind.endsWith('environment')
        ? { name: action.resource, ...action.body }
        : action.body
  return {
    ...action,
    beforeImage,
    expectedApplied: state(expectedValue),
    compensation: compensation ?? { safety: 'blocked', reason: `${action.kind} has no safe automatic compensation` },
  }
}

export function stageActionTransaction(actions) {
  invariant(Array.isArray(actions), 'Managed action transaction must be an array')
  const irreversible = actions.filter(action => action.compensation?.safety === 'blocked')
  invariant(irreversible.length <= 1, 'Managed action transaction contains multiple irreversible actions; each requires its own signed plan')
  if (irreversible.length === 0 || actions.length === 1) return { actions, deferredActions: [] }
  return {
    actions: actions.filter(action => action.compensation?.safety !== 'blocked'),
    deferredActions: irreversible,
  }
}

export function validateActionTransactionClass(actions) {
  invariant(Array.isArray(actions) && actions.length > 0, 'Apply refused: transaction contains no managed action')
  const irreversible = actions.filter(action => action.compensation?.safety === 'blocked')
  invariant(
    irreversible.length === 0 || (irreversible.length === 1 && actions.length === 1),
    'Apply refused: an irreversible action requires an isolated, explicitly signed one-action transaction after all reversible drift is aligned',
  )
  return true
}

function currentSuccessfulCheck(repo, observed, check, integration, desired, now) {
  const committedAt = new Date(observed.defaultBranchCommittedAt)
  const minimumCompletedAt = new Date(now.getTime() - desired.checkRunMaxAgeMinutes * 60 * 1000)
  const maximumCompletedAt = new Date(now.getTime() + desired.checkRunClockSkewSeconds * 1000)
  return observed.checkRuns.find(run => {
    const completedAt = new Date(run.completed_at)
    return run.name === check.context
      && run.app?.id === integration.id
      && run.head_sha === observed.defaultBranchHeadSha
      && run.status === 'completed'
      && run.conclusion === 'success'
      && Number.isFinite(completedAt.getTime())
      && completedAt >= committedAt
      && completedAt >= minimumCompletedAt
      && completedAt <= maximumCompletedAt
      && validateRequiredCheckProducer({ run, check, integration, repo, observed }).length === 0
  })
}

function observedStateDigest(repo, observed) {
  return sha256(stableStringify({
    repository: repo.github,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    metadata: {
      fullName: observed.metadata.full_name,
      defaultBranch: observed.metadata.default_branch,
      visibility: observed.metadata.visibility,
    },
    rulesets: observed.rulesets.map(normalizeRuleset).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    environments: observed.environments.map(normalizeEnvironment).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    actionsWorkflowPermissions: normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions),
    workflows: Object.fromEntries(Object.entries(observed.workflowContents).sort(([left], [right]) => compareUtf8Bytes(left, right)).map(([path, workflow]) => [path, workflow ? {
      contentSha256: workflow.identity.contentSha256,
      gitBlobSha: workflow.identity.gitBlobSha,
      semanticSha256: workflow.identity.semanticSha256,
    } : null])),
    immutableReleases: observed.immutableReleases === null ? null : immutableEnabled(observed.immutableReleases),
  }, 0))
}

export function diffRepository(repo, materialized, observed, desired, now = new Date()) {
  const conflicts = [...materialized.eligibility.blockers]
  const actions = []
  for (const [name, integration] of Object.entries(desired.integrations)) {
    if (integration.required && !Number.isInteger(integration.id)) conflicts.push(`required integration unresolved: ${name}`)
  }
  if (observed.metadata.full_name !== repo.github) conflicts.push(`API identity mismatch: expected ${repo.github}, got ${observed.metadata.full_name}`)
  if (observed.metadata.default_branch !== repo.defaultBranch) conflicts.push(`Default branch mismatch: expected ${repo.defaultBranch}, got ${observed.metadata.default_branch}`)
  if (observed.metadata.visibility !== repo.visibility) conflicts.push(`Visibility mismatch: expected ${repo.visibility}, got ${observed.metadata.visibility}`)

  for (const check of materialized.requiredChecks) {
    const integration = desired.integrations[check.integration]
    if (!Number.isInteger(integration.id)) {
      conflicts.push(`required integration unresolved: ${check.integration} for ${check.context}`)
    } else {
      const history = currentSuccessfulCheck(repo, observed, check, integration, desired, now)
      if (!history) conflicts.push(`required check lacks a fresh successful run from integration ${integration.id} on current head ${observed.defaultBranchHeadSha}: ${check.context}`)
    }
    if (check.trustSource === 'repository-workflow' || check.trustSource === 'protected-base-workflow') conflicts.push(...workflowPreflight(check, observed.workflowContents[check.workflow]))
    else if (check.trustSource !== 'external-github-app' || integration.operationMode !== 'external-service') conflicts.push(`${check.context} does not use an external Governance Check App trust source`)
  }

  for (const environment of materialized.declaredEnvironments) {
    if (environment.independentReviewRequired && environment.reviewers.length === 0) conflicts.push(`environment ${environment.name} requires at least one independently administered reviewer before activation`)
    conflicts.push(...environmentWorkflowPreflight(environment, observed.workflowContents[environment.workflow], desired.integrations))
  }

  if (materialized.tagPolicy.allowCreation && materialized.tagPolicy.sourceWorkflow) {
    const sourceWorkflow = observed.workflowContents[materialized.tagPolicy.sourceWorkflow]
    conflicts.push(...validateWorkflowIdentity(materialized.tagPolicy.sourceWorkflowIdentity, sourceWorkflow?.identity)
      .map(failure => `release tag source workflow: ${failure}`))
    const content = sourceWorkflow?.content
    const provesAncestry = Boolean(content && /merge-base\s+--is-ancestor/.test(content) && /refs\/remotes\/origin\/main/.test(content))
    const provesExactProtectedHead = Boolean(content
      && /tag_commit=/.test(content)
      && /main_commit=/.test(content)
      && /test\s+"\$tag_commit"\s+=\s+"\$main_commit"/.test(content))
    if (!provesAncestry && !provesExactProtectedHead) {
      conflicts.push(`release tag source workflow does not prove main ancestry: ${materialized.tagPolicy.sourceWorkflow}`)
    }
  }

  const desiredActionsWorkflowPermissions = normalizeActionsWorkflowPermissions(materialized.actionsWorkflowPermissions)
  const observedActionsWorkflowPermissions = normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions)
  if (!deepEqual(observedActionsWorkflowPermissions, desiredActionsWorkflowPermissions)) {
    const path = `/repos/${repo.github}/actions/permissions/workflow`
    actions.push(managedAction(
      {
        kind: 'update-actions-workflow-permissions',
        method: 'PUT',
        path,
        body: desiredActionsWorkflowPermissions,
        resource: 'actions-workflow-permissions',
      },
      observedActionsWorkflowPermissions,
      { safety: 'automatic', method: 'PUT', path, body: observedActionsWorkflowPermissions },
    ))
  }

  for (const desiredRuleset of materialized.rulesets) {
    const summary = observed.rulesetSummaries.find(item => item.name === desiredRuleset.name)
    const remote = observed.rulesets.find(item => item.name === desiredRuleset.name)
    const body = normalizeRuleset(desiredRuleset)
    if (!summary) actions.push(managedAction(
      { kind: 'create-ruleset', method: 'POST', path: `/repos/${repo.github}/rulesets`, body, resource: desiredRuleset.name },
      null,
      { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
    ))
    else if (!deepEqual(normalizeRuleset(remote), body)) actions.push(managedAction(
      { kind: 'update-ruleset', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body, resource: desiredRuleset.name },
      normalizeRuleset(remote),
      { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body: normalizeRuleset(remote) },
    ))
  }
  const desiredRulesetNames = new Set(materialized.rulesets.map(item => item.name))
  for (const stale of observed.rulesetSummaries.filter(item => item.name.startsWith(desired.managedRulesetPrefix) && !desiredRulesetNames.has(item.name))) {
    const remote = observed.rulesets.find(item => item.name === stale.name)
    invariant(remote, `Missing before-image for stale ruleset ${repo.github}/${stale.name}`)
    actions.push(managedAction(
      { kind: 'delete-stale-ruleset', method: 'DELETE', path: `/repos/${repo.github}/rulesets/${stale.id}`, body: undefined, resource: stale.name },
      normalizeRuleset(remote),
      { safety: 'automatic', method: 'POST', path: `/repos/${repo.github}/rulesets`, body: normalizeRuleset(remote), recreatedResource: true },
    ))
  }

  for (const desiredEnvironment of materialized.environments) {
    const remote = observed.environments.find(item => item.name === desiredEnvironment.name)
    const body = clone(desiredEnvironment)
    delete body.name
    if (!remote || !deepEqual(normalizeEnvironment(remote), desiredEnvironment)) {
      actions.push(managedAction(
        { kind: remote ? 'update-environment' : 'create-environment', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body, resource: desiredEnvironment.name },
        remote ? normalizeEnvironment(remote) : null,
        remote
          ? { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body: (() => { const previous = normalizeEnvironment(remote); delete previous.name; return previous })() }
          : { safety: 'automatic', method: 'DELETE', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}` },
      ))
    }
  }
  const declaredNames = new Set(materialized.declaredEnvironments.map(item => item.name))
  for (const stale of observed.environmentSummaries.filter(item => desired.managedEnvironmentNames.includes(item.name) && !declaredNames.has(item.name))) {
    const remote = observed.environments.find(item => item.name === stale.name)
    invariant(remote, `Missing before-image for stale environment ${repo.github}/${stale.name}`)
    const previous = normalizeEnvironment(remote)
    const body = clone(previous)
    delete body.name
    actions.push(managedAction(
      { kind: 'delete-stale-environment', method: 'DELETE', path: `/repos/${repo.github}/environments/${encodeURIComponent(stale.name)}`, body: undefined, resource: stale.name },
      previous,
      { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(stale.name)}`, body },
    ))
  }
  if (materialized.immutableReleases && !immutableEnabled(observed.immutableReleases)) {
    actions.push(managedAction(
      { kind: 'enable-immutable-releases', method: 'PUT', path: `/repos/${repo.github}/immutable-releases`, body: {}, resource: 'immutable-releases' },
      { enabled: false },
      { safety: 'blocked', reason: 'GitHub immutable releases enablement has no modeled safe inverse; manual recovery is required' },
    ))
  }

  const staged = stageActionTransaction(actions)

  return {
    repoId: repo.id,
    github: repo.github,
    ring: materialized.eligibility.ring,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    observedStateDigest: observedStateDigest(repo, observed),
    eligibility: materialized.eligibility,
    requiredChecks: materialized.requiredChecks.map(check => check.context),
    conflicts: [...new Set(conflicts)],
    actions: staged.actions,
    deferredActions: staged.deferredActions,
  }
}

export function validateAuthorityBootstrapBoundary(boundary) {
  const expectedKeys = [
    'actionsWorkflowPermissions',
    'crashRecoveryRequired',
    'environments',
    'exactReadbackRequired',
    'irreversibleActionsAllowed',
    'kind',
    'position',
    'profile',
    'repository',
    'repositoryId',
    'rollbackRequired',
    'rulesets',
    'staleResourceDeletionAllowed',
    'transactionClass',
  ]
  invariant(boundary && typeof boundary === 'object' && !Array.isArray(boundary)
    && stableStringify(Object.keys(boundary).sort(), 0) === stableStringify(expectedKeys.sort(), 0),
  'authority policy bootstrap boundary has an invalid or open shape')
  invariant(boundary.kind === 'authority-github-policy-bootstrap-convergence-v1'
    && ['after-candidate-freeze-before-protected-pr', 'before-candidate-freeze'].includes(boundary.position)
    && boundary.transactionClass === AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS,
  'authority policy bootstrap boundary identity is invalid')
  invariant(boundary.repositoryId === 'design-system'
    && boundary.repository === 'ajenchen/design-system'
    && boundary.profile === 'design-system-authority',
  'authority policy bootstrap boundary repository/profile binding is invalid')
  invariant(boundary.actionsWorkflowPermissions === true
    && boundary.irreversibleActionsAllowed === false
    && boundary.staleResourceDeletionAllowed === false
    && boundary.exactReadbackRequired === true
    && boundary.crashRecoveryRequired === true
    && boundary.rollbackRequired === true,
  'authority policy bootstrap boundary weakens convergence safety')
  invariant(Array.isArray(boundary.rulesets) && boundary.rulesets.length === 2
    && stableStringify(boundary.rulesets, 0) === stableStringify(['fleet/base-integrity', 'fleet/verified-main'], 0),
  'authority policy bootstrap boundary ruleset closure is invalid')
  invariant(Array.isArray(boundary.environments) && boundary.environments.length === 2
    && stableStringify(boundary.environments, 0) === stableStringify(['governance-check-verdict', 'governance-external-ledger'], 0),
  'authority policy bootstrap boundary environment closure is invalid')
  return boundary
}

export function materializeAuthorityBootstrapProjection({ inventory, desired, stagedRolloutPlan }) {
  const boundary = validateAuthorityBootstrapBoundary(stagedRolloutPlan?.bootstrapBoundary?.githubPolicyConvergence)
  const authorityRepos = inventory?.repositories?.filter(repo => repo.role === 'authority') ?? []
  invariant(authorityRepos.length === 1, 'authority policy bootstrap requires exactly one registered authority repository')
  const repo = authorityRepos[0]
  invariant(repo.id === boundary.repositoryId
    && repo.github === boundary.repository
    && repo.desiredProfile === boundary.profile
    && repo.defaultBranch === 'main',
  'authority policy bootstrap inventory binding differs from its canonical boundary')
  const profile = desired?.profiles?.[repo.desiredProfile]
  invariant(profile, 'authority policy bootstrap desired profile is missing')
  const rulesets = []
  for (const name of boundary.rulesets) {
    const source = profile.rulesets.find(ruleset => ruleset.name === name)
    invariant(source && source.target === 'branch' && source.enforcement === 'active'
      && Array.isArray(source.bypass_actors) && source.bypass_actors.length === 0,
    `authority policy bootstrap ruleset is unsafe or missing: ${name}`)
    const ruleset = clone(source)
    delete ruleset.rollout
    if (name === 'fleet/verified-main') {
      ruleset.rules = ruleset.rules.filter(rule => rule.type === 'pull_request')
      invariant(ruleset.rules.length === 1, 'authority policy bootstrap verified-main projection must contain exactly one pull-request rule')
    } else {
      invariant(source.rollout === 'always', `authority policy bootstrap ruleset is not an always-on prerequisite: ${name}`)
      invariant(!ruleset.rules.some(rule => rule.type === 'required_status_checks'), `authority policy bootstrap ruleset depends on unavailable status checks: ${name}`)
    }
    invariant(!ruleset.rules.some(rule => rule.type === 'required_status_checks'), `authority policy bootstrap projection contains App-dependent status checks: ${name}`)
    rulesets.push(ruleset)
  }
  const environments = boundary.environments.map(name => {
    const source = profile.environments.find(environment => environment.name === name)
    invariant(source?.rollout === 'always', `authority policy bootstrap environment is not an always-on prerequisite: ${name}`)
    return {
      name: source.name,
      wait_timer: source.waitTimer,
      prevent_self_review: source.preventSelfReview,
      reviewers: clone(source.reviewers),
      deployment_branch_policy: {
        protected_branches: source.deploymentBranchPolicy.protectedBranches,
        custom_branch_policies: source.deploymentBranchPolicy.customBranchPolicies,
      },
    }
  })
  const projection = {
    transactionClass: AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS,
    repositoryId: repo.id,
    repository: repo.github,
    defaultBranch: repo.defaultBranch,
    profile: repo.desiredProfile,
    actionsWorkflowPermissions: clone(profile.actionsWorkflowPermissions),
    rulesets,
    environments,
    requiredChecks: [],
    immutableReleases: false,
    releaseMutationAllowed: false,
    staleResourceDeletionAllowed: false,
  }
  return { boundary, repo, profile, projection }
}

function authorityBootstrapMaterialized(projection) {
  return {
    profile: null,
    actionsWorkflowPermissions: clone(projection.actionsWorkflowPermissions),
    rulesets: clone(projection.rulesets),
    environments: clone(projection.environments),
    declaredEnvironments: [],
    requiredChecks: [],
    immutableReleases: false,
    tagPolicy: { allowCreation: false, sourceWorkflow: null },
    assignment: null,
    eligibility: { eligible: true, promoted: false, ring: 'ring-0-authority', wave: 'control-plane-bootstrap', blockers: [] },
  }
}

function authorityBootstrapObservedStateDigest(repo, observed) {
  return sha256(stableStringify({
    repository: repo.github,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    defaultBranchTreeSha: observed.defaultBranchTreeSha,
    metadata: {
      fullName: observed.metadata.full_name,
      defaultBranch: observed.metadata.default_branch,
      visibility: observed.metadata.visibility,
    },
    rulesets: observed.rulesets.map(normalizeRuleset).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    environments: observed.environments.map(normalizeEnvironment).sort((left, right) => compareUtf8Bytes(left.name, right.name)),
    actionsWorkflowPermissions: normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions),
  }, 0))
}

export function diffAuthorityBootstrapRepository(repo, projection, observed, desired) {
  const conflicts = []
  const actions = []
  if (observed.metadata.full_name !== repo.github) conflicts.push(`API identity mismatch: expected ${repo.github}, got ${observed.metadata.full_name}`)
  if (observed.metadata.default_branch !== repo.defaultBranch) conflicts.push(`Default branch mismatch: expected ${repo.defaultBranch}, got ${observed.metadata.default_branch}`)
  if (observed.metadata.visibility !== repo.visibility) conflicts.push(`Visibility mismatch: expected ${repo.visibility}, got ${observed.metadata.visibility}`)
  invariant(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(observed.defaultBranchTreeSha ?? ''), 'authority policy bootstrap default-branch tree identity is invalid')
  const allowedRulesets = new Set(projection.rulesets.map(ruleset => ruleset.name))
  const unexpectedRulesets = observed.rulesetSummaries
    .filter(ruleset => ruleset.name.startsWith(desired.managedRulesetPrefix) && !allowedRulesets.has(ruleset.name))
    .map(ruleset => ruleset.name)
    .sort(compareUtf8Bytes)
  if (unexpectedRulesets.length) conflicts.push(`authority bootstrap found out-of-scope managed rulesets: ${unexpectedRulesets.join(', ')}`)
  const allowedEnvironments = new Set(projection.environments.map(environment => environment.name))
  const unexpectedEnvironments = observed.environmentSummaries
    .filter(environment => desired.managedEnvironmentNames.includes(environment.name) && !allowedEnvironments.has(environment.name))
    .map(environment => environment.name)
    .sort(compareUtf8Bytes)
  if (unexpectedEnvironments.length) conflicts.push(`authority bootstrap found out-of-scope managed environments: ${unexpectedEnvironments.join(', ')}`)

  const desiredPermissions = normalizeActionsWorkflowPermissions(projection.actionsWorkflowPermissions)
  const observedPermissions = normalizeActionsWorkflowPermissions(observed.actionsWorkflowPermissions)
  if (!deepEqual(observedPermissions, desiredPermissions)) {
    const path = `/repos/${repo.github}/actions/permissions/workflow`
    actions.push(managedAction(
      {
        kind: 'update-actions-workflow-permissions',
        method: 'PUT',
        path,
        body: desiredPermissions,
        resource: 'actions-workflow-permissions',
      },
      observedPermissions,
      { safety: 'automatic', method: 'PUT', path, body: observedPermissions },
    ))
  }
  for (const desiredRuleset of projection.rulesets) {
    const summary = observed.rulesetSummaries.find(item => item.name === desiredRuleset.name)
    const remote = observed.rulesets.find(item => item.name === desiredRuleset.name)
    const body = normalizeRuleset(desiredRuleset)
    if (!summary) actions.push(managedAction(
      { kind: 'create-ruleset', method: 'POST', path: `/repos/${repo.github}/rulesets`, body, resource: desiredRuleset.name },
      null,
      { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
    ))
    else if (!deepEqual(normalizeRuleset(remote), body)) actions.push(managedAction(
      { kind: 'update-ruleset', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body, resource: desiredRuleset.name },
      normalizeRuleset(remote),
      { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/rulesets/${summary.id}`, body: normalizeRuleset(remote) },
    ))
  }
  for (const desiredEnvironment of projection.environments) {
    const remote = observed.environments.find(item => item.name === desiredEnvironment.name)
    const body = clone(desiredEnvironment)
    delete body.name
    if (!remote || !deepEqual(normalizeEnvironment(remote), desiredEnvironment)) {
      actions.push(managedAction(
        { kind: remote ? 'update-environment' : 'create-environment', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body, resource: desiredEnvironment.name },
        remote ? normalizeEnvironment(remote) : null,
        remote
          ? { safety: 'automatic', method: 'PUT', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}`, body: (() => { const previous = normalizeEnvironment(remote); delete previous.name; return previous })() }
          : { safety: 'automatic', method: 'DELETE', path: `/repos/${repo.github}/environments/${encodeURIComponent(desiredEnvironment.name)}` },
      ))
    }
  }
  actions.sort((left, right) => compareUtf8Bytes(`${left.resource}:${left.kind}`, `${right.resource}:${right.kind}`))
  invariant(actions.every(action => AUTHORITY_BOOTSTRAP_ALLOWED_ACTION_KINDS.has(action.kind)
    && action.compensation?.safety === 'automatic'
    && !action.kind.startsWith('delete-')
    && action.kind !== 'enable-immutable-releases'),
  'authority policy bootstrap projection contains a forbidden or irreversible action')
  if (actions.length) validateActionTransactionClass(actions)
  return {
    repoId: repo.id,
    github: repo.github,
    defaultBranchHeadSha: observed.defaultBranchHeadSha,
    defaultBranchTreeSha: observed.defaultBranchTreeSha,
    observedStateDigest: authorityBootstrapObservedStateDigest(repo, observed),
    conflicts: [...new Set(conflicts)],
    actions,
  }
}

function bindAuthorityBootstrapActions(actions, repo) {
  return actions.map((action, index) => ({
    ...clone(action),
    actionId: `${repo.id}:${String(index + 1).padStart(3, '0')}:${action.kind}:${action.resource}`,
    github: repo.github,
    repoId: repo.id,
    status: 'pending',
  }))
}

function authorityBootstrapPlanDigest(plan) {
  const unsigned = clone(plan)
  delete unsigned.planDigest
  return sha256(`qijenchen-authority-policy-bootstrap-plan-v1\n${stableStringify(unsigned, 0)}`)
}

export function validateAuthorityBootstrapPlan(plan) {
  invariant(plan && typeof plan === 'object' && !Array.isArray(plan), 'authority policy bootstrap plan is invalid')
  assertClosedKeys(plan, AUTHORITY_BOOTSTRAP_PLAN_KEYS,
    'authority policy bootstrap plan has an invalid or open shape')
  invariant(Object.keys(plan).length === AUTHORITY_BOOTSTRAP_PLAN_KEYS.size,
    'authority policy bootstrap plan is incomplete')
  invariant(plan.schemaVersion === 1
    && plan.kind === AUTHORITY_BOOTSTRAP_PLAN_KIND
    && plan.transactionClass === AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS
    && plan.mode === 'plan'
    && plan.readOnly === true
    && plan.promotionEligible === false
    && plan.managedEvidence === false,
  'authority policy bootstrap plan identity or evidence class is invalid')
  for (const field of [
    'inventoryDigest', 'desiredDigest', 'stagedRolloutPlanDigest', 'bootstrapBoundaryDigest',
    'authorityPolicyDigest', 'projectionDigest', 'genesisReceiptDigest', 'observedStateDigest',
    'genesisReadbackDigest', 'actionsDigest', 'rollbackPlanDigest', 'planDigest',
  ]) invariant(/^[a-f0-9]{64}$/.test(plan[field] ?? ''), `authority policy bootstrap plan ${field} is invalid`)
  invariant(plan.repositoryId === 'design-system'
    && plan.repository === 'ajenchen/design-system'
    && plan.defaultBranch === 'main'
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(plan.defaultBranchHeadSha ?? '')
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(plan.defaultBranchTreeSha ?? ''),
  'authority policy bootstrap plan target identity is invalid')
  assertClosedKeys(plan.projection, AUTHORITY_BOOTSTRAP_PROJECTION_KEYS,
    'authority policy bootstrap projection has an invalid or open shape')
  invariant(Object.keys(plan.projection).length === AUTHORITY_BOOTSTRAP_PROJECTION_KEYS.size
    && plan.projection.transactionClass === AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS
    && plan.projection.repositoryId === plan.repositoryId
    && plan.projection.repository === plan.repository
    && plan.projection.defaultBranch === plan.defaultBranch
    && plan.projection.profile === 'design-system-authority'
    && Array.isArray(plan.projection.requiredChecks) && plan.projection.requiredChecks.length === 0
    && plan.projection.immutableReleases === false
    && plan.projection.releaseMutationAllowed === false
    && plan.projection.staleResourceDeletionAllowed === false,
  'authority policy bootstrap projection identity or safety class is invalid')
  invariant(plan.projectionDigest === sha256(stableStringify(plan.projection, 0)),
    'authority policy bootstrap projection digest mismatch')
  validateControlPlaneGenesisReceipt(plan.genesisReceipt)
  invariant(plan.genesisReceiptDigest === plan.genesisReceipt.receiptDigest
    && plan.genesisReceipt.challenge.repository === plan.repository
    && plan.genesisReceipt.challenge.baseSha === plan.defaultBranchHeadSha
    && plan.genesisReceipt.challenge.baseTree === plan.defaultBranchTreeSha,
  'authority policy bootstrap genesis receipt target binding is invalid')
  invariant(['github-live', 'fixture-untrusted'].includes(plan.genesisReadbackTrust)
    && /^[a-f0-9]{64}$/.test(plan.genesisReadbackDigest ?? ''),
  'authority policy bootstrap genesis readback trust class or digest is invalid')
  invariant(Array.isArray(plan.conflicts) && plan.conflicts.every(item => typeof item === 'string' && item.length > 0),
    'authority policy bootstrap plan conflicts are invalid')
  invariant(Array.isArray(plan.actions)
    && plan.actions.every(action => AUTHORITY_BOOTSTRAP_ALLOWED_ACTION_KINDS.has(action.kind)
      && action.compensation?.safety === 'automatic'
      && !action.kind.startsWith('delete-')
      && action.kind !== 'enable-immutable-releases'
      && action.github === plan.repository
      && action.repoId === plan.repositoryId
      && typeof action.actionId === 'string'
      && action.actionId.startsWith(`${plan.repositoryId}:`)
      && action.status === 'pending'),
  'authority policy bootstrap plan contains a forbidden action')
  invariant(plan.actionsDigest === candidateActionsDigest(plan.actions), 'authority policy bootstrap action digest mismatch')
  invariant(deepEqual(plan.rollbackPlan, rollbackPlanFor(plan.actions))
    && plan.rollbackPlanDigest === rollbackPlanDigest(plan.rollbackPlan),
  'authority policy bootstrap rollback plan is invalid')
  invariant(plan.planDigest === authorityBootstrapPlanDigest(plan), 'authority policy bootstrap plan digest mismatch')
  return plan
}

function verifyLiveControlPlaneGenesisReceipt(client, receipt, {
  now = new Date(),
  privilegedPolicy = readJson(DEFAULT_PRIVILEGED_POLICY),
} = {}) {
  validateControlPlaneGenesisReceipt(receipt)
  invariant(client && typeof client.request === 'function',
    'control-plane genesis live verification requires the trusted GitHub transport')
  invariant(now instanceof Date && Number.isFinite(now.getTime()),
    'control-plane genesis live verification time is invalid')
  const challenge = receipt.challenge
  const pull = client.request('GET',
    `/repos/${challenge.repository}/pulls/${challenge.pullRequest}`)
  invariant(pull?.state === 'open'
    && pull?.merged_at === null
    && pull?.base?.repo?.full_name === challenge.repository
    && pull?.base?.ref === 'main'
    && pull?.base?.sha === challenge.baseSha
    && pull?.head?.repo?.full_name === challenge.repository
    && pull?.head?.sha === challenge.candidateHeadSha,
  'control-plane genesis pull-request readback differs from its exact authority target')
  const baseCommit = client.request('GET',
    `/repos/${challenge.repository}/git/commits/${challenge.baseSha}`)
  const candidateCommit = client.request('GET',
    `/repos/${challenge.repository}/git/commits/${challenge.candidateHeadSha}`)
  invariant(baseCommit?.sha === challenge.baseSha
    && baseCommit?.tree?.sha === challenge.baseTree
    && candidateCommit?.sha === challenge.candidateHeadSha
    && candidateCommit?.tree?.sha === challenge.candidateHeadTree,
  'control-plane genesis GitHub commit/tree readback differs from the verified challenge')
  const files = fetchCompleteCollection(client,
    `/repos/${challenge.repository}/pulls/${challenge.pullRequest}/files?per_page=100`, {
      select: value => value,
      totalCount: () => null,
      label: `control-plane genesis PR files for ${challenge.repository}#${challenge.pullRequest}`,
    })
  const changedPaths = files.map((file, index) => {
    invariant(file?.status === 'added' || file?.status === 'modified',
      `control-plane genesis PR file ${index} has forbidden status ${file?.status}`)
    invariant(typeof file.filename === 'string' && file.filename.length > 0
      && file.previous_filename === undefined,
    `control-plane genesis PR file ${index} has an invalid or renamed path`)
    return file.filename
  }).sort(compareUtf8Bytes)
  invariant(new Set(changedPaths).size === changedPaths.length
    && deepEqual(changedPaths, challenge.changedPaths),
  'control-plane genesis challenge does not equal the complete GitHub PR changed-path set')
  const comments = fetchCompleteCollection(client,
    `/repos/${challenge.repository}/issues/${challenge.pullRequest}/comments?per_page=100`, {
      select: value => value,
      totalCount: () => null,
      label: `control-plane genesis comments for ${challenge.repository}#${challenge.pullRequest}`,
    })
  const matches = comments.filter(comment => String(comment?.id) === receipt.authorization.commentId)
  invariant(matches.length === 1, 'control-plane genesis authorization comment is missing or duplicated')
  const comment = matches[0]
  invariant(comment.author_association === 'OWNER'
    && comment.user?.login === receipt.authorization.ownerLogin
    && comment.user?.login === challenge.repository.split('/')[0]
    && comment.created_at === receipt.authorization.createdAt
    && comment.updated_at === comment.created_at
    && sha256(comment.body ?? '') === receipt.authorization.commentDigest,
  'control-plane genesis authorization comment provenance or immutable bytes differ')
  const marker = 'DS-GOVERNANCE-CONTROL-PLANE-GENESIS-V1 '
  invariant(typeof comment.body === 'string' && comment.body.startsWith(marker),
    'control-plane genesis authorization comment marker is invalid')
  let payload
  try { payload = JSON.parse(comment.body.slice(marker.length)) } catch {
    throw new Error('control-plane genesis authorization comment payload is invalid')
  }
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload)
    && stableStringify(Object.keys(payload).sort(), 0)
      === stableStringify(['challenge', 'challengeDigest', 'expiresAt', 'nonce'].sort(), 0),
  'control-plane genesis authorization comment has an invalid or open payload')
  const expiresAt = new Date(payload.expiresAt)
  invariant(Number.isFinite(expiresAt.getTime()) && expiresAt > now
    && payload.nonce === privilegedPolicy?.bootstrap?.nonce
    && comment.body === controlPlaneGenesisCommentBody({
      challenge,
      challengeDigest: receipt.challengeDigest,
      expiresAt: payload.expiresAt,
      nonce: privilegedPolicy.bootstrap.nonce,
    }),
  'control-plane genesis authorization comment is expired, substituted, or bound to another policy')
  return {
    pullRequestId: String(pull.id),
    baseCommit: challenge.baseSha,
    baseTree: challenge.baseTree,
    candidateCommit: challenge.candidateHeadSha,
    candidateTree: challenge.candidateHeadTree,
    changedPathsDigest: challenge.changedPathsDigest,
    commentId: receipt.authorization.commentId,
    commentDigest: receipt.authorization.commentDigest,
    readbackDigest: sha256(`qijenchen-control-plane-genesis-live-readback-v1\n${stableStringify({
      repository: challenge.repository,
      pullRequest: challenge.pullRequest,
      pullRequestId: String(pull.id),
      baseCommit: challenge.baseSha,
      baseTree: challenge.baseTree,
      candidateCommit: challenge.candidateHeadSha,
      candidateTree: challenge.candidateHeadTree,
      changedPaths,
      commentId: receipt.authorization.commentId,
      commentDigest: receipt.authorization.commentDigest,
    }, 0)}`),
  }
}

function buildAuthorityBootstrapPlanCore({
  inventory,
  desired,
  stagedRolloutPlan,
  client,
  genesisReceipt,
  authorityPolicyDigest = null,
  canonicalInventoryBytesDigest = null,
  canonicalDesiredBytesDigest = null,
}, productionLive) {
  validateControlPlaneGenesisReceipt(genesisReceipt)
  const { boundary, repo, projection } = materializeAuthorityBootstrapProjection({ inventory, desired, stagedRolloutPlan })
  const resolvedAuthorityPolicyDigest = authorityPolicyDigest ?? sha256(readFileSync(DEFAULT_AUTHORITY_POLICY))
  const resolvedInventoryBytesDigest = canonicalInventoryBytesDigest ?? sha256(readFileSync(DEFAULT_INVENTORY))
  const resolvedDesiredBytesDigest = canonicalDesiredBytesDigest ?? sha256(readFileSync(DEFAULT_DESIRED))
  let liveGenesisReadback = null
  if (productionLive) {
    assertTrustedLiveGitHubClient(client, 'live authority policy bootstrap planning')
    verifyGitCheckoutIdentity(resolve(GOVERNANCE_ROOT, '../..'), {
      head: genesisReceipt.challenge.candidateHeadSha,
      tree: genesisReceipt.challenge.candidateHeadTree,
      label: 'live authority policy bootstrap candidate',
    })
    invariant(authorityPolicyDigest === null && canonicalInventoryBytesDigest === null && canonicalDesiredBytesDigest === null,
      'live authority bootstrap refuses caller-injected canonical source digests')
    invariant(deepEqual(inventory, readJson(DEFAULT_INVENTORY))
      && deepEqual(desired, readJson(DEFAULT_DESIRED))
      && deepEqual(stagedRolloutPlan, readJson(DEFAULT_STAGED_ROLLOUT_PLAN)),
    'live authority bootstrap refuses substituted canonical source objects')
    liveGenesisReadback = verifyLiveControlPlaneGenesisReceipt(client, genesisReceipt)
  }
  invariant(genesisReceipt.challenge.repository === repo.github
    && genesisReceipt.challenge.baseSha
    && genesisReceipt.challenge.baseTree
    && genesisReceipt.challenge.inventoryDigest === resolvedInventoryBytesDigest
    && genesisReceipt.challenge.desiredDigest === resolvedDesiredBytesDigest,
  'authority policy bootstrap genesis receipt differs from the current canonical authority source')
  const materialized = authorityBootstrapMaterialized(projection)
  const observed = fetchRepositoryState(client, repo, materialized, desired)
  invariant(observed.defaultBranchHeadSha === genesisReceipt.challenge.baseSha
    && observed.defaultBranchTreeSha === genesisReceipt.challenge.baseTree,
  'authority policy bootstrap live base commit/tree differs from the verified genesis PR base')
  const diff = diffAuthorityBootstrapRepository(repo, projection, observed, desired)
  const actions = bindAuthorityBootstrapActions(diff.actions, repo)
  const rollbackPlan = rollbackPlanFor(actions)
  const plan = {
    schemaVersion: 1,
    kind: AUTHORITY_BOOTSTRAP_PLAN_KIND,
    transactionClass: AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS,
    mode: 'plan',
    readOnly: true,
    promotionEligible: false,
    managedEvidence: false,
    repositoryId: repo.id,
    repository: repo.github,
    defaultBranch: repo.defaultBranch,
    defaultBranchHeadSha: diff.defaultBranchHeadSha,
    defaultBranchTreeSha: diff.defaultBranchTreeSha,
    inventoryDigest: sha256(stableStringify(inventory, 0)),
    desiredDigest: sha256(stableStringify(desired, 0)),
    stagedRolloutPlanDigest: sha256(stableStringify(stagedRolloutPlan, 0)),
    bootstrapBoundaryDigest: sha256(stableStringify(boundary, 0)),
    authorityPolicyDigest: resolvedAuthorityPolicyDigest,
    projection: clone(projection),
    projectionDigest: sha256(stableStringify(projection, 0)),
    genesisReceipt: clone(genesisReceipt),
    genesisReceiptDigest: genesisReceipt.receiptDigest,
    genesisReadbackTrust: productionLive ? 'github-live' : 'fixture-untrusted',
    genesisReadbackDigest: productionLive
      ? liveGenesisReadback.readbackDigest
      : sha256(`qijenchen-control-plane-genesis-fixture-readback-v1\n${genesisReceipt.receiptDigest}`),
    observedStateDigest: diff.observedStateDigest,
    conflicts: diff.conflicts,
    actions,
    actionsDigest: candidateActionsDigest(actions),
    rollbackPlan,
    rollbackPlanDigest: rollbackPlanDigest(rollbackPlan),
    planDigest: null,
  }
  plan.planDigest = authorityBootstrapPlanDigest(plan)
  return validateAuthorityBootstrapPlan(plan)
}

export function buildAuthorityBootstrapPlan(options) {
  return buildAuthorityBootstrapPlanCore(options, true)
}

function buildPlanCore({ inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence = null, repoId, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {} }, productionLive) {
  const validateCandidateReleaseEvidence = () => {
    if (rings.candidateRelease === null) invariant(verifiedReleaseEvidence === null, 'verified release evidence must be null without a candidate release')
    else validateVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
    return rings.candidateRelease === null
      ? null
      : digestVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
  }
  let releaseEvidenceDigest
  if (productionLive) releaseEvidenceDigest = validateCandidateReleaseEvidence()
  const effectiveRuntimeValidationContext = resolveRuntimeValidationContextCore({
    client,
    inventory,
    certifications,
    runtimeProfile,
    runtimeValidationContext,
  }, productionLive)
  validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, effectiveRuntimeValidationContext, productionLive)
  if (!productionLive) releaseEvidenceDigest = validateCandidateReleaseEvidence()
  const repositories = repoId ? inventory.repositories.filter(repo => repo.id === repoId) : inventory.repositories
  invariant(repositories.length > 0, `Unknown repository id ${repoId}`)
  const prepared = repositories.map(repo => {
    const assignment = rings.assignments[repo.id]
    // Candidate diffing always materializes the promoted target. Authorization is
    // evaluated afterwards so receipt validation cannot influence its own digest.
    const eligibility = { eligible: true, promoted: true, ring: assignment.ring, wave: assignment.wave, blockers: [] }
    return { repo, materialized: materializeProfile(repo, desired, rings, eligibility) }
  })
  // Transaction preflight: every repository is fully read before any mutation can begin.
  const observed = prepared.map(item => fetchRepositoryState(client, item.repo, item.materialized, desired))
  assertLiveIdentitySnapshot(productionLive, prepared.map(item => item.repo), observed, effectiveRuntimeValidationContext)
  const candidates = prepared.map((item, index) => diffRepository(item.repo, item.materialized, observed[index], desired, now))
  const digestInput = candidates.map(candidate => ({
    repoId: candidate.repoId,
    github: candidate.github,
    ring: candidate.ring,
    defaultBranchHeadSha: candidate.defaultBranchHeadSha,
    observedStateDigest: candidate.observedStateDigest,
    actions: candidate.actions,
    deferredActions: candidate.deferredActions,
    conflicts: candidate.conflicts,
  }))
  const immutableCandidatePlanDigest = candidatePlanDigest({
    candidateRelease: rings.candidateRelease,
    verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
    repoCandidates: digestInput,
  })
  const evaluatedByRepo = new Map()
  const ringOrder = new Map(rings.rings.map(ring => [ring.id, ring.order]))
  const evaluationOrder = candidates.map((candidate, index) => ({ candidate, index })).sort((left, right) => ringOrder.get(left.candidate.ring) - ringOrder.get(right.candidate.ring) || left.index - right.index)
  for (const { candidate, index } of evaluationOrder) {
    const item = prepared[index]
    const assignment = rings.assignments[item.repo.id]
    const ring = rings.rings.find(value => value.id === assignment.ring)
    const predicateResults = evaluatePromotionPredicates({
      repo: item.repo,
      ring,
      assignment,
      rings,
      certifications,
      waivers,
      evidenceLedger: rings.evidence,
      materialized: item.materialized,
      observed: observed[index],
      desired,
      candidateRelease: rings.candidateRelease,
      verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
      candidatePlanDigest: immutableCandidatePlanDigest,
      candidatesByRepo: evaluatedByRepo,
      candidateConflicts: candidate.conflicts,
      now,
      issuerRegistry,
    })
    evaluatedByRepo.set(candidate.repoId, { ...candidate, predicateResults })
  }
  const evaluated = candidates.map(candidate => evaluatedByRepo.get(candidate.repoId))
  const rollout = resolveRolloutWave({
    inventory: { ...inventory, repositories },
    rings,
    candidateRelease: rings.candidateRelease,
    verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
    candidatePlanDigest: immutableCandidatePlanDigest,
    repoCandidates: evaluated,
    now,
    issuerRegistry,
  })
  const selected = new Set(rollout.selectedRepoIds)
  const repoPlans = evaluated.map(candidate => {
    const assignment = rings.assignments[candidate.repoId]
    const predicateBlockers = candidate.predicateResults.filter(result => !result.pass).map(result => result.message)
    const completion = verifyCompletionAttestation(assignment.completionAttestation, {
      repoId: candidate.repoId,
      github: candidate.github,
      ringId: assignment.ring,
      waveId: assignment.wave,
      candidateRelease: rings.candidateRelease,
      verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
      candidatePlanDigest: immutableCandidatePlanDigest,
      predicateDigest: predicateEvidenceDigest(candidate.predicateResults),
      stateDigest: candidate.observedStateDigest,
      defaultBranchHeadSha: candidate.defaultBranchHeadSha,
      actionsDigest: candidateActionsDigest(candidate.actions),
      issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
      attestationPolicy: rings.attestationPolicy,
    }, { now, issuerRegistry })
    return {
      ...candidate,
      applyAuthorization: clone(assignment.applyAuthorization),
      completionAttestation: clone(assignment.completionAttestation),
      candidateActions: candidate.actions,
      deferredActions: candidate.deferredActions,
      actions: selected.has(candidate.repoId) ? candidate.actions : [],
      selectedForApply: selected.has(candidate.repoId),
      eligibility: {
        eligible: selected.has(candidate.repoId),
        promoted: candidate.actions.length === 0 && candidate.conflicts.length === 0 && completion.valid,
        ring: rings.assignments[candidate.repoId].ring,
        wave: rings.assignments[candidate.repoId].wave,
        blockers: predicateBlockers,
      },
    }
  })
  const plan = {
    schemaVersion: 6,
    mode: 'plan',
    readOnly: true,
    scope: {
      coverage: repoId ? 'registered-opt-in-subset' : inventory.fleetScope.coverage,
      enrollment: inventory.fleetScope.enrollment,
      unregisteredDescendants: inventory.fleetScope.unregisteredDescendants,
      registeredRepositoryCount: inventory.repositories.length,
      plannedRepositoryCount: repoPlans.length,
    },
    inventoryDigest: sha256(stableStringify(inventory, 0)),
    desiredDigest: sha256(stableStringify(desired, 0)),
    attestationPolicyDigest: sha256(stableStringify(rings.attestationPolicy, 0)),
    candidateRelease: clone(rings.candidateRelease),
    verifiedReleaseEvidenceDigest: releaseEvidenceDigest,
    candidatePlanDigest: immutableCandidatePlanDigest,
    rollout,
    repoPlans,
    summary: {
      registeredInventory: {
        repositories: repoPlans.length,
        managedChanges: repoPlans.reduce((sum, item) => sum + item.candidateActions.length + item.deferredActions.length, 0),
        candidateActions: repoPlans.reduce((sum, item) => sum + item.candidateActions.length, 0),
        deferredActions: repoPlans.reduce((sum, item) => sum + item.deferredActions.length, 0),
        conflicts: repoPlans.reduce((sum, item) => sum + item.conflicts.length, 0),
      },
      selectedWave: {
        repositories: repoPlans.filter(item => item.selectedForApply).length,
        managedChanges: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.actions.length + item.deferredActions.length, 0),
        actions: repoPlans.reduce((sum, item) => sum + item.actions.length, 0),
        deferredActions: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.deferredActions.length, 0),
        conflicts: repoPlans.filter(item => item.selectedForApply).reduce((sum, item) => sum + item.conflicts.length, 0),
      },
      rolloutBlockers: rollout.blockers.length,
    },
  }
  plan.planDigest = sha256(stableStringify(plan, 0))
  return plan
}

const JOURNAL_GENESIS_DIGEST = '0'.repeat(64)
const JOURNAL_EVENT_KEYS = ['schemaVersion', 'sequence', 'transactionId', 'type', 'subjectActionId', 'at', 'previousDigest', 'authorizationEnvelopeDigest', 'runtimeState', 'stateDigest', 'mirrorRequestNonce', 'eventDigest']

function journalStateDigest(journal) {
  return sha256(`fleet-reconcile-state-v2\n${stableStringify({
    authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    runtimeState: journalRuntimeState(journal),
  }, 0)}`)
}

function journalRuntimeState(journal) {
  return {
    transactionState: journal.state,
    completedAt: journal.completedAt ?? null,
    failedAt: journal.failedAt ?? null,
    error: journal.error ?? null,
    rollbackAttempted: journal.rollbackAttempted,
    recoveredAt: journal.recoveredAt ?? null,
    recoveryFailures: clone(journal.recoveryFailures ?? null),
    rollbackAuthorizationEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest ?? null,
    rollbackStartedAt: journal.rollbackStartedAt ?? null,
    rollbackCompletedAt: journal.rollbackCompletedAt ?? null,
    rollbackBlockers: clone(journal.rollbackBlockers ?? null),
    actions: journal.actions.map(action => ({
      actionId: action.actionId,
      status: action.status,
      responseId: action.responseId ?? null,
      readbackPath: action.readbackPath ?? null,
      recoveryObservation: clone(action.recoveryObservation ?? null),
      rollbackStatus: action.rollbackStatus ?? null,
    })),
  }
}

const RUNTIME_ROOT_KEYS = ['transactionState', 'completedAt', 'failedAt', 'error', 'rollbackAttempted', 'recoveredAt', 'recoveryFailures', 'rollbackAuthorizationEventHeadDigest', 'rollbackStartedAt', 'rollbackCompletedAt', 'rollbackBlockers', 'actions']
const RUNTIME_ACTION_KEYS = ['actionId', 'status', 'responseId', 'readbackPath', 'recoveryObservation', 'rollbackStatus']

function changedKeys(before, after, ignored = new Set()) {
  return Object.keys(after).filter(key => !ignored.has(key) && !deepEqual(before?.[key], after[key]))
}

function validateRuntimeStateShape(runtimeState, actionIds) {
  assertClosedKeys(runtimeState, new Set(RUNTIME_ROOT_KEYS), 'Transaction journal event runtime state has an invalid or open shape')
  invariant(Object.keys(runtimeState).length === RUNTIME_ROOT_KEYS.length, 'Transaction journal event runtime state is incomplete')
  invariant(Array.isArray(runtimeState.actions) && runtimeState.actions.length === actionIds.length, 'Transaction journal event runtime action set is incomplete')
  for (let index = 0; index < runtimeState.actions.length; index += 1) {
    const action = runtimeState.actions[index]
    assertClosedKeys(action, new Set(RUNTIME_ACTION_KEYS), `Transaction journal event runtime action ${index} has an invalid or open shape`)
    invariant(Object.keys(action).length === RUNTIME_ACTION_KEYS.length && action.actionId === actionIds[index], `Transaction journal event runtime action ${index} identity/order mismatch`)
  }
}

function validateRuntimeTransition(previous, current, type, subjectActionId, at) {
  const rootChanges = changedKeys(previous, current, new Set(['actions']))
  const changedActions = current.actions.map((action, index) => ({ action, before: previous?.actions?.[index] }))
    .filter(({ action, before }) => !deepEqual(action, before))
  const exactRootChanges = allowed => invariant(rootChanges.length === allowed.length && rootChanges.every(key => allowed.includes(key)), `Transaction journal event ${type} changed disallowed transaction fields: ${rootChanges.join(',')}`)
  const oneAction = allowed => {
    invariant(changedActions.length === 1, `Transaction journal event ${type} must change exactly one action`)
    const changes = changedKeys(changedActions[0].before, changedActions[0].action, new Set(['actionId']))
    invariant(changes.length > 0 && changes.every(key => allowed.includes(key)), `Transaction journal event ${type} changed disallowed action fields: ${changes.join(',')}`)
    return { ...changedActions[0], changes }
  }
  if (!previous) {
    invariant(type === 'prepared' && subjectActionId === null && current.transactionState === 'prepared' && current.rollbackAttempted === false
      && current.actions.every(action => action.status === 'pending' && action.responseId === null && action.readbackPath === null && action.recoveryObservation === null && action.rollbackStatus === null), 'Transaction journal genesis runtime state is invalid')
    return true
  }
  if (type === 'applying') {
    invariant(subjectActionId === null, 'Transaction journal applying transition cannot target an action')
    exactRootChanges(['transactionState'])
    invariant(previous.transactionState === 'prepared' && current.transactionState === 'applying' && changedActions.length === 0, 'Transaction journal applying transition is invalid')
  } else if (type === 'action-applying') {
    exactRootChanges([])
    const change = oneAction(['status'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'pending' && change.action.status === 'applying', 'Transaction journal action-applying status transition is invalid')
  } else if (type === 'action-applied-unverified') {
    exactRootChanges([])
    const change = oneAction(['status', 'responseId', 'readbackPath'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'applying' && change.action.status === 'applied-unverified' && change.action.readbackPath !== null, 'Transaction journal action-applied-unverified transition is invalid')
  } else if (type === 'action-verified') {
    exactRootChanges([])
    const change = oneAction(['status'])
    invariant(change.action.actionId === subjectActionId && change.before.status === 'applied-unverified' && change.action.status === 'verified', 'Transaction journal action-verified transition is invalid')
  } else if (type === 'verified') {
    invariant(subjectActionId === null, 'Transaction journal verified transition cannot target an action')
    exactRootChanges(['transactionState', 'completedAt'])
    invariant(previous.transactionState === 'applying' && current.transactionState === 'verified' && current.completedAt === at && changedActions.length === 0 && current.actions.every(action => action.status === 'verified'), 'Transaction journal verified transition is invalid')
  } else if (type === 'failed-partial-state-possible') {
    invariant(subjectActionId === null, 'Transaction journal failure transition cannot target an action')
    exactRootChanges(['transactionState', 'failedAt', 'error'])
    invariant(['applying', 'verified'].includes(previous.transactionState) && current.transactionState === 'failed-partial-state-possible' && current.failedAt === at && typeof current.error === 'string' && current.error.length > 0 && changedActions.length === 0, 'Transaction journal failure transition is invalid')
  } else if (type === 'recovery-observed' || type === 'manual-recovery-required') {
    invariant(subjectActionId === null, `Transaction journal ${type} transition cannot target one action`)
    exactRootChanges(['transactionState', 'recoveredAt', 'recoveryFailures'])
    invariant(current.transactionState === type && current.recoveredAt === at
      && Array.isArray(current.recoveryFailures)
      && changedActions.every(({ action, before }) => changedKeys(before, action, new Set(['actionId'])).every(key => ['status', 'recoveryObservation'].includes(key))), `Transaction journal ${type} transition is invalid`)
  } else if (type === 'rolling-back') {
    invariant(subjectActionId === null, 'Transaction journal rolling-back transition cannot target an action')
    invariant(rootChanges.every(key => ['transactionState', 'rollbackAttempted', 'rollbackAuthorizationEventHeadDigest', 'rollbackStartedAt'].includes(key))
      && ['transactionState', 'rollbackAuthorizationEventHeadDigest'].every(key => rootChanges.includes(key)), `Transaction journal rolling-back changed disallowed or incomplete transaction fields: ${rootChanges.join(',')}`)
    invariant(['failed-partial-state-possible', 'manual-recovery-required', 'recovery-observed', 'rollback-blocked'].includes(previous.transactionState)
      && current.transactionState === 'rolling-back' && current.rollbackAttempted === true && current.rollbackStartedAt === at
      && /^[a-f0-9]{64}$/.test(current.rollbackAuthorizationEventHeadDigest ?? '') && changedActions.length === 0, 'Transaction journal rolling-back transition is invalid')
  } else if (['rollback-already-restored', 'rollback-blocked-drift', 'rollback-blocked-manual', 'rollback-compensating', 'rollback-action-verified', 'rollback-blocked-error'].includes(type)) {
    exactRootChanges([])
    const expected = {
      'rollback-already-restored': 'already-at-before-image',
      'rollback-blocked-drift': 'blocked-drift',
      'rollback-blocked-manual': 'blocked-manual',
      'rollback-compensating': 'compensating',
      'rollback-action-verified': 'rolled-back-verified',
      'rollback-blocked-error': 'blocked-error',
    }[type]
    invariant(changedActions.length <= 1, `Transaction journal event ${type} changed more than one action`)
    const action = changedActions.length === 1 ? oneAction(['rollbackStatus', 'readbackPath']).action : current.actions.find(item => item.actionId === subjectActionId)
    invariant(typeof subjectActionId === 'string' && action?.actionId === subjectActionId && current.transactionState === 'rolling-back' && action.rollbackStatus === expected, `Transaction journal ${type} action transition is invalid`)
  } else if (type === 'rolled-back-verified' || type === 'rollback-blocked') {
    invariant(subjectActionId === null, `Transaction journal ${type} terminal transition cannot target an action`)
    invariant(rootChanges.every(key => ['transactionState', 'rollbackCompletedAt', 'rollbackBlockers'].includes(key))
      && ['transactionState', 'rollbackBlockers'].every(key => rootChanges.includes(key)), `Transaction journal event ${type} changed disallowed or incomplete transaction fields: ${rootChanges.join(',')}`)
    invariant(previous.transactionState === 'rolling-back' && current.transactionState === type && current.rollbackCompletedAt === at
      && Array.isArray(current.rollbackBlockers) && changedActions.length === 0
      && (type === 'rolled-back-verified' ? current.rollbackBlockers.length === 0 : current.rollbackBlockers.length > 0), `Transaction journal ${type} terminal transition is invalid`)
  } else invariant(false, `Transaction journal event type has no transition reducer: ${type}`)
  return true
}

function eventDigest(event) {
  const unsigned = clone(event)
  delete unsigned.eventDigest
  return sha256(`fleet-reconcile-event-v1\n${stableStringify(unsigned, 0)}`)
}

function readLiveTime(clock, label, notBefore = null) {
  invariant(typeof clock === 'function', `${label} requires a live clock source`)
  const at = clock()
  invariant(at instanceof Date && Number.isFinite(at.getTime()), `${label} clock returned an invalid time`)
  invariant(!notBefore || at >= notBefore, `${label} clock regressed`)
  return at
}

const RELOADABLE_GOVERNANCE_KEYS = [
  'inventory', 'desired', 'rings', 'certifications', 'waivers', 'runtimeProfile',
  'issuerRegistry', 'activationRequirements', 'activationInventory', 'activationDesired', 'activationPolicy', 'mutationBoundaryContract',
]

function assertCurrentGovernanceReload(reloadCurrentGovernance, baseline) {
  if (!reloadCurrentGovernance) return true
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current), 'Current governance reload returned an invalid model')
  for (const key of RELOADABLE_GOVERNANCE_KEYS) {
    invariant(Object.prototype.hasOwnProperty.call(current, key), `Current governance reload omitted ${key}`)
    invariant(deepEqual(current[key], baseline[key]), `Apply refused: canonical governance SSOT changed during transaction: ${key}`)
  }
  return true
}

function assertCurrentRollbackReload(reloadCurrentGovernance, baseline) {
  if (!reloadCurrentGovernance) return true
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current), 'Current rollback governance reload returned an invalid model')
  for (const key of ['inventory', 'desired', 'rings', 'privilegedPolicy', 'issuerRegistry', 'externalActivationPolicy']) {
    invariant(Object.prototype.hasOwnProperty.call(current, key), `Current rollback governance reload omitted ${key}`)
    invariant(deepEqual(current[key], baseline[key]), `Rollback refused: canonical governance SSOT changed during transaction: ${key}`)
  }
  return true
}

function fleetReconcileDurabilityClassFromProfile(profile) {
  invariant(profile?.requiredRequirementIdsByScope
    && Array.isArray(profile.requiredRequirementIdsByScope['fleet-rollout']),
  'Fleet reconcile durability class requires one validated external activation profile')
  return profile.requiredRequirementIdsByScope['fleet-rollout'].includes(AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID)
    ? FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS
    : FLEET_RECONCILE_LOCAL_DURABILITY_CLASS
}

function fleetReconcileDurabilityClassFromPolicy(policy, expectedPolicyDigest) {
  return fleetReconcileDurabilityClassFromProfile(resolveExternalActivationProfile(policy, {
    expectedPolicyDigest,
  }))
}

function validateFleetReconcileDurabilityAdapter(journal, offHostMirror) {
  if (journal.evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    invariant(journal.mirrorIdentity === null, 'Local fleet journal must not claim an off-host mirror identity')
    invariant(offHostMirror === undefined || offHostMirror === null,
      'Local fleet journal does not accept or claim an off-host/WORM adapter')
    return true
  }
  invariant(journal.evidenceDurabilityClass === FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS,
    `Unknown fleet journal evidence durability class: ${journal.evidenceDurabilityClass}`)
  invariant(offHostMirror && typeof offHostMirror.append === 'function'
    && typeof offHostMirror.verify === 'function',
  'Maximum-assurance fleet journal requires the activated off-host append-only mirror adapter')
  validateMirrorIdentity(journal.mirrorIdentity)
  invariant(offHostMirror.adapterCommandSha256 === journal.mirrorIdentity.adapterCommandSha256,
    'Off-host mirror adapter artifact differs from the signed activation identity')
  return true
}

function verifyFleetReconcileDurability(journal, offHostMirror, { at } = {}) {
  validateFleetReconcileDurabilityAdapter(journal, offHostMirror)
  if (journal.evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    invariant(journal.offHostReceipts.length === 0,
      'Local fleet journal cannot contain or claim off-host/WORM receipts')
    return {
      evidenceDurabilityClass: journal.evidenceDurabilityClass,
      eventHeadDigest: journal.eventHeadDigest,
      eventCount: journal.events.length,
      offHostVerified: false,
    }
  }
  return verifyJournalOffHost(journal, offHostMirror, {
    expectedProvider: journal.mirrorIdentity.provider,
    at,
  })
}

function fleetJournalHasPendingOffHostReceipt(journal) {
  return journal.evidenceDurabilityClass === FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS
    && journal.events.length === journal.offHostReceipts.length + 1
}

function writeJournalSnapshot(path, journal, { create = false } = {}) {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  if (create) invariant(!existsSync(path), `Apply refused: transaction journal path already exists and is immutable: ${path}`)
  else {
    invariant(existsSync(path), `Transaction journal disappeared before append: ${path}`)
    const previous = readJson(path)
    invariant(previous.transactionId === journal.transactionId, 'Transaction journal identity changed during append')
    invariant(Array.isArray(previous.events) && Array.isArray(journal.events)
      && stableStringify(journal.events.slice(0, previous.events.length), 0) === stableStringify(previous.events, 0), 'Transaction journal event chain was rewritten or truncated')
    invariant(Array.isArray(previous.offHostReceipts) && Array.isArray(journal.offHostReceipts)
      && stableStringify(journal.offHostReceipts.slice(0, previous.offHostReceipts.length), 0) === stableStringify(previous.offHostReceipts, 0), 'Transaction journal off-host receipts were rewritten or truncated')
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  const body = `${stableStringify(journal)}\n`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, body)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  if (create) {
    try {
      linkSync(temporary, path)
    } finally {
      unlinkSync(temporary)
    }
  } else renameSync(temporary, path)
  const directoryDescriptor = openSync(directory, 'r')
  try {
    fsyncSync(directoryDescriptor)
  } finally {
    closeSync(directoryDescriptor)
  }
  invariant(readFileSync(path, 'utf8') === body, `Transaction journal exact readback failed: ${path}`)
}

function appendJournalEvent(path, journal, {
  type,
  subjectActionId = null,
  at,
  offHostMirror,
  mirrorIdentity = journal.mirrorIdentity,
  create = false,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()), 'Transaction journal event time is invalid')
  validateFleetReconcileDurabilityAdapter(journal, offHostMirror)
  invariant(deepEqual(mirrorIdentity, journal.mirrorIdentity),
    'Transaction journal durability identity was substituted during append')
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const lockPath = `${path}.append.lock`
  let lockDescriptor
  try {
    lockDescriptor = openSync(lockPath, 'wx', 0o600)
  } catch (error) {
    throw new Error(`Transaction journal append lock is already held or unavailable: ${lockPath}: ${error.message}`)
  }
  try {
    const event = {
      schemaVersion: 1,
      sequence: journal.events.length + 1,
      transactionId: journal.transactionId,
      type,
      subjectActionId,
      at: at.toISOString(),
      previousDigest: journal.eventHeadDigest,
      authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
      runtimeState: journalRuntimeState(journal),
      stateDigest: journalStateDigest(journal),
      mirrorRequestNonce: journal.evidenceDurabilityClass === FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS
        ? randomUUID()
        : null,
      eventDigest: null,
    }
    if (journal.events.length > 0) invariant(at >= new Date(journal.events.at(-1).at), 'Transaction journal event clock regressed')
    event.eventDigest = eventDigest(event)
    journal.events.push(event)
    journal.eventHeadDigest = event.eventDigest
    writeJournalSnapshot(path, journal, { create })
    if (journal.evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) return event
    const request = eventMirrorRequest(journal, event)
    const receipt = clone(offHostMirror.append(request))
    validateOffHostReceipt(receipt, { journal, event, mirrorIdentity, request, at, requireFresh: true })
    invariant(!journal.offHostReceipts.some(item => item.receiptId === receipt.receiptId), `Off-host journal receipt id was reused: ${receipt.receiptId}`)
    journal.offHostReceipts.push(receipt)
    writeJournalSnapshot(path, journal)
    return event
  } finally {
    closeSync(lockDescriptor)
    unlinkSync(lockPath)
  }
}

function repairPendingOffHostReceipt(journalPath, journal, offHostMirror, { issuerRegistry, clock, managedCiValidationContext }) {
  if (journal.evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    validateFleetReconcileDurabilityAdapter(journal, offHostMirror)
    validateTransactionJournal(journal, {
      mode: 'historical-observation',
      issuerRegistry,
      managedCiValidationContext,
    })
    return journal
  }
  if (journal.events.length === journal.offHostReceipts.length) return journal
  validateTransactionJournal(journal, {
    mode: 'historical-observation',
    issuerRegistry,
    allowPendingOffHostReceipt: true,
    managedCiValidationContext,
  })
  invariant(offHostMirror && typeof offHostMirror.append === 'function' && typeof offHostMirror.verify === 'function', 'Pending off-host acknowledgement repair requires the activated mirror adapter')
  invariant(offHostMirror.adapterCommandSha256 === journal.mirrorIdentity.adapterCommandSha256, 'Pending acknowledgement repair adapter differs from signed activation evidence')
  const event = journal.events.at(-1)
  const request = eventMirrorRequest(journal, event)
  const receipt = clone(offHostMirror.append(request))
  validateOffHostReceipt(receipt, {
    journal,
    event,
    mirrorIdentity: journal.mirrorIdentity,
    request,
    at: new Date(event.at),
  })
  const repairAt = readLiveTime(clock, 'Pending off-host acknowledgement repair', new Date(event.at))
  const lockPath = `${journalPath}.append.lock`
  let lockDescriptor
  try {
    lockDescriptor = openSync(lockPath, 'wx', 0o600)
    const current = readJson(journalPath)
    invariant(current.eventHeadDigest === journal.eventHeadDigest
      && current.events.length === journal.events.length
      && current.offHostReceipts.length === journal.offHostReceipts.length, 'Pending acknowledgement journal changed before exact receipt attachment')
    invariant(!current.offHostReceipts.some(item => item.receiptId === receipt.receiptId), 'Pending acknowledgement repair receipt id was already used')
    current.offHostReceipts.push(receipt)
    journal.offHostReceipts.push(receipt)
    writeJournalSnapshot(journalPath, journal)
  } finally {
    if (lockDescriptor !== undefined) {
      closeSync(lockDescriptor)
      unlinkSync(lockPath)
    }
  }
  verifyFleetReconcileDurability(journal, offHostMirror, { at: repairAt })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
  return journal
}

function readbackPath(action, response) {
  if (action.kind === 'create-ruleset') return `/repos/${action.github}/rulesets/${response?.id}`
  return action.path
}

function observeActionState(client, action) {
  if (action.kind === 'create-ruleset' && !action.readbackPath) {
    const summaries = client.request('GET', action.path)
    invariant(Array.isArray(summaries), `Ruleset observation is invalid for ${action.repoId}/${action.resource}`)
    const matches = summaries.filter(item => item.name === action.resource)
    invariant(matches.length <= 1, `Ruleset observation is ambiguous for ${action.repoId}/${action.resource}`)
    if (matches.length === 0) return state(null)
    return state(normalizeRuleset(client.request('GET', `/repos/${action.github}/rulesets/${matches[0].id}`)))
  }
  const path = action.readbackPath ?? action.path
  const remote = client.request('GET', path, undefined, { allow404: true })
  if (action.kind === 'update-actions-workflow-permissions') return state(normalizeActionsWorkflowPermissions(remote))
  if (action.kind === 'enable-immutable-releases') return state({ enabled: immutableEnabled(remote) })
  if (remote === null) return state(null)
  if (action.kind.endsWith('ruleset')) return state(normalizeRuleset(remote))
  if (action.kind.endsWith('environment')) return state(normalizeEnvironment(remote))
  throw new Error(`Unsupported action observation ${action.kind}`)
}

function verifyAppliedAction(client, action) {
  return deepEqual(observeActionState(client, action), action.expectedApplied)
}

function rollbackPlanFor(actions) {
  return [...actions].reverse().map(action => ({
    actionId: action.actionId,
    repoId: action.repoId,
    resource: action.resource,
    beforeImageDigest: action.beforeImage.digest,
    expectedAppliedDigest: action.expectedApplied.digest,
    compensation: clone(action.compensation),
  }))
}

function rollbackPlanDigest(rollbackPlan) {
  return sha256(stableStringify(rollbackPlan, 0))
}

const JOURNAL_ROOT_KEYS = new Set([
  'schemaVersion', 'transactionId', 'planDigest', 'candidatePlanDigest', 'candidateRelease', 'verifiedReleaseEvidenceDigest',
  'externalActivationDigest', 'externalActivationInventoryDigest', 'externalActivationDesiredDigest', 'externalActivationRequirements', 'externalActivationPolicy', 'externalActivationInventory', 'externalActivationDesired',
  'externalActivationMutationBoundaryContract', 'externalActivationMutationBoundaryContractDigest',
  'evidenceDurabilityClass', 'mirrorIdentity',
  'rolloutWave', 'parallelBudget', 'state', 'startedAt', 'completedAt', 'failedAt', 'error',
  'rollbackAttempted', 'recoveryInstruction', 'actions', 'rollbackPlan', 'rollbackPlanDigest',
  'inventoryDigest', 'desiredDigest', 'attestationPolicyDigest', 'repoBindings',
  'historicalControlPlane', 'historicalControlPlaneDigest',
  'authorizationEnvelopeDigest', 'recoveredAt', 'recoveryFailures', 'rollbackStartedAt',
  'rollbackCompletedAt', 'rollbackBlockers',
  'events', 'eventHeadDigest', 'offHostReceipts', 'rollbackAuthorizationEventHeadDigest',
])
const ACTION_RUNTIME_KEYS = new Set(['status', 'responseId', 'readbackPath', 'recoveryObservation', 'rollbackStatus'])
const ACTION_FIXED_KEYS = new Set(['kind', 'method', 'path', 'body', 'resource', 'beforeImage', 'expectedApplied', 'compensation', 'actionId', 'github', 'repoId'])
const ACTION_KINDS = new Map([
  ['update-actions-workflow-permissions', 'PUT'],
  ['create-ruleset', 'POST'],
  ['update-ruleset', 'PUT'],
  ['delete-stale-ruleset', 'DELETE'],
  ['create-environment', 'PUT'],
  ['update-environment', 'PUT'],
  ['delete-stale-environment', 'DELETE'],
  ['enable-immutable-releases', 'PUT'],
])

function assertClosedKeys(value, allowed, message) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), message)
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${message}: unexpected field ${key}`)
}

function fixedAction(action) {
  return Object.fromEntries(Object.entries(action).filter(([key]) => ACTION_FIXED_KEYS.has(key)))
}

function originalPlanAction(action) {
  const result = {
    kind: action.kind,
    method: action.method,
    path: action.path,
    resource: action.resource,
    beforeImage: clone(action.beforeImage),
    expectedApplied: clone(action.expectedApplied),
    compensation: clone(action.compensation),
  }
  if (Object.prototype.hasOwnProperty.call(action, 'body')) result.body = clone(action.body)
  return result
}

function validateStateSnapshot(snapshot, label) {
  assertClosedKeys(snapshot, new Set(['state', 'value', 'digest']), `${label} snapshot is invalid`)
  invariant(snapshot.state === 'absent' || snapshot.state === 'present', `${label} snapshot state is invalid`)
  invariant(snapshot.state === 'present' ? Object.prototype.hasOwnProperty.call(snapshot, 'value') : !Object.prototype.hasOwnProperty.call(snapshot, 'value'), `${label} snapshot value disagrees with state`)
  const unsigned = snapshot.state === 'present' ? { state: 'present', value: snapshot.value } : { state: 'absent' }
  invariant(snapshot.digest === sha256(stableStringify(unsigned, 0)), `${label} snapshot digest mismatch`)
}

function validateManagedAction(action, repoById, desired) {
  assertClosedKeys(action, new Set([...ACTION_FIXED_KEYS, ...ACTION_RUNTIME_KEYS]), 'Journal action has an invalid or open shape')
  for (const key of ['kind', 'method', 'path', 'resource', 'beforeImage', 'expectedApplied', 'compensation', 'actionId', 'github', 'repoId', 'status']) invariant(Object.prototype.hasOwnProperty.call(action, key), `Journal action is missing ${key}`)
  const repo = repoById.get(action.repoId)
  invariant(repo && repo.github === action.github, `Journal action references unmanaged repository ${action.repoId}/${action.github}`)
  invariant(ACTION_KINDS.get(action.kind) === action.method, `Journal action kind/method mismatch for ${action.actionId}`)
  invariant(action.actionId.startsWith(`${action.repoId}:`), `Journal action id is outside repository scope for ${action.repoId}`)
  invariant(['pending', 'applying', 'applied-unverified', 'verified', 'not-applied'].includes(action.status), `Journal action status is invalid for ${action.actionId}`)
  if (Object.prototype.hasOwnProperty.call(action, 'responseId')) invariant(action.responseId === null || Number.isInteger(action.responseId) || (typeof action.responseId === 'string' && action.responseId.length > 0), `Journal response id is invalid for ${action.actionId}`)
  if (Object.prototype.hasOwnProperty.call(action, 'recoveryObservation')) validateStateSnapshot(action.recoveryObservation, `${action.actionId} recovery observation`)
  if (Object.prototype.hasOwnProperty.call(action, 'rollbackStatus')) invariant(['already-at-before-image', 'blocked-drift', 'blocked-manual', 'compensating', 'rolled-back-verified', 'blocked-error'].includes(action.rollbackStatus), `Journal rollback status is invalid for ${action.actionId}`)
  validateStateSnapshot(action.beforeImage, `${action.actionId} before-image`)
  validateStateSnapshot(action.expectedApplied, `${action.actionId} expected-applied`)
  assertClosedKeys(action.compensation, new Set(['safety', 'method', 'path', 'pathSource', 'body', 'recreatedResource', 'reason']), `Journal compensation is invalid for ${action.actionId}`)
  invariant(action.compensation.safety === 'automatic' || action.compensation.safety === 'blocked', `Journal compensation safety is invalid for ${action.actionId}`)

  const base = `/repos/${repo.github}`
  if (Object.prototype.hasOwnProperty.call(action, 'readbackPath') && action.readbackPath !== null) {
    invariant(typeof action.readbackPath === 'string', `Journal readback path is invalid for ${action.actionId}`)
    if (action.kind.endsWith('ruleset')) {
      const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      invariant(new RegExp(`^${escapedBase}/rulesets/[0-9]+$`).test(action.readbackPath), `Journal readback endpoint is outside managed scope: ${action.readbackPath}`)
    } else {
      invariant(action.readbackPath === action.path, `Journal readback endpoint differs from the managed action: ${action.readbackPath}`)
    }
  }
  if (action.kind === 'create-ruleset' && action.readbackPath) invariant(action.responseId !== null && String(action.responseId) === action.readbackPath.split('/').at(-1), `Journal create-ruleset response/readback correlation is invalid for ${action.actionId}`)
  if (action.kind === 'create-ruleset') invariant(action.path === `${base}/rulesets` && action.resource.startsWith(desired.managedRulesetPrefix), `Journal create-ruleset endpoint is outside managed scope: ${action.path}`)
  if (action.kind === 'update-ruleset' || action.kind === 'delete-stale-ruleset') invariant(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rulesets/[0-9]+$`).test(action.path) && action.resource.startsWith(desired.managedRulesetPrefix), `Journal ruleset endpoint is outside managed scope: ${action.path}`)
  if (action.kind.endsWith('environment')) {
    const environment = decodeURIComponent(action.path.slice(`${base}/environments/`.length))
    invariant(action.path.startsWith(`${base}/environments/`) && environment === action.resource && desired.managedEnvironmentNames.includes(environment), `Journal environment endpoint is outside managed scope: ${action.path}`)
  }
  if (action.kind === 'update-actions-workflow-permissions') invariant(action.path === `${base}/actions/permissions/workflow` && action.resource === 'actions-workflow-permissions', `Journal Actions workflow-permissions endpoint is outside managed scope: ${action.path}`)
  if (action.kind === 'enable-immutable-releases') invariant(action.path === `${base}/immutable-releases` && action.resource === 'immutable-releases', `Journal immutable-release endpoint is outside managed scope: ${action.path}`)

  const expectedValue = action.kind === 'delete-stale-ruleset' || action.kind === 'delete-stale-environment'
    ? null
    : action.kind === 'enable-immutable-releases'
      ? { enabled: true }
      : action.kind.endsWith('environment')
        ? { name: action.resource, ...action.body }
        : action.body
  invariant(deepEqual(action.expectedApplied, state(expectedValue)), `Journal expected-applied state is not derived from the managed action for ${action.actionId}`)
  if (action.kind === 'create-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'DELETE' && action.compensation.pathSource === 'readbackPath' && !action.compensation.path, `Journal create-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'update-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, action.beforeImage.value), `Journal update-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'delete-stale-ruleset') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'POST' && action.compensation.path === `${base}/rulesets` && action.compensation.recreatedResource === true && deepEqual(action.compensation.body, action.beforeImage.value), `Journal delete-ruleset compensation is not exact for ${action.actionId}`)
  if (action.kind === 'create-environment') invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'DELETE' && action.compensation.path === action.path, `Journal create-environment compensation is not exact for ${action.actionId}`)
  if (action.kind === 'update-environment') {
    const before = clone(action.beforeImage.value)
    delete before.name
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, before), `Journal update-environment compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'delete-stale-environment') {
    const before = clone(action.beforeImage.value)
    delete before.name
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, before), `Journal delete-environment compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'update-actions-workflow-permissions') {
    invariant(action.beforeImage.state === 'present', `Journal Actions workflow-permissions before-image must be present for ${action.actionId}`)
    invariant(deepEqual(action.beforeImage.value, normalizeActionsWorkflowPermissions(action.beforeImage.value)), `Journal Actions workflow-permissions before-image is invalid for ${action.actionId}`)
    invariant(deepEqual(action.body, normalizeActionsWorkflowPermissions(action.body)), `Journal Actions workflow-permissions body is invalid for ${action.actionId}`)
    invariant(action.compensation.safety === 'automatic' && action.compensation.method === 'PUT' && action.compensation.path === action.path && deepEqual(action.compensation.body, action.beforeImage.value), `Journal Actions workflow-permissions compensation is not exact for ${action.actionId}`)
  }
  if (action.kind === 'enable-immutable-releases') invariant(action.compensation.safety === 'blocked' && typeof action.compensation.reason === 'string' && action.compensation.reason.length > 0, `Journal immutable-release compensation must remain blocked for ${action.actionId}`)
}

function authorizationEnvelope(journal) {
  return {
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    inventoryDigest: journal.inventoryDigest,
    desiredDigest: journal.desiredDigest,
    attestationPolicyDigest: journal.attestationPolicyDigest,
    planDigest: journal.planDigest,
    candidatePlanDigest: journal.candidatePlanDigest,
    candidateRelease: journal.candidateRelease,
    verifiedReleaseEvidenceDigest: journal.verifiedReleaseEvidenceDigest,
    externalActivationDigest: journal.externalActivationDigest,
    externalActivationInventoryDigest: journal.externalActivationInventoryDigest,
    externalActivationDesiredDigest: journal.externalActivationDesiredDigest,
    externalActivationPolicyDigest: externalActivationPolicyDigest(journal.externalActivationPolicy),
    externalActivationMutationBoundaryContractDigest: journal.externalActivationMutationBoundaryContractDigest,
    evidenceDurabilityClass: journal.evidenceDurabilityClass,
    mirrorIdentity: journal.mirrorIdentity,
    rolloutWave: journal.rolloutWave,
    parallelBudget: journal.parallelBudget,
    repoBindings: journal.repoBindings,
    actions: journal.actions.map(fixedAction),
    rollbackPlan: journal.rollbackPlan,
  }
}

export function journalAuthorizationEnvelopeDigest(journal) {
  return sha256(stableStringify(authorizationEnvelope(journal), 0))
}

function validateHistoricalInventory(inventory) {
  const requirements = inventory?.repositories?.flatMap(repo => repo.providerSurfacesRequired ?? []) ?? []
  const providerIds = new Set()
  const providerSurfaces = new Set()
  const providerRuntimeKinds = new Map()
  for (const requirement of requirements) {
    const [provider, runtimeKind, surface] = String(requirement).split('/')
    if (!providerRuntimeKinds.has(provider)) providerRuntimeKinds.set(provider, new Set())
    providerIds.add(provider)
    providerRuntimeKinds.get(provider).add(runtimeKind)
    providerSurfaces.add(surface)
  }
  validateInventory(inventory, { providerIds, providerRuntimeKinds, providerSurfaces })
}

export function transactionJournalActivationDigestExpectations(journal, mode) {
  invariant(mode === 'current-apply' || mode === 'historical-observation', `Unknown transaction-journal validation mode ${mode}`)
  return {
    expectedPolicyDigest: mode === 'historical-observation'
      ? externalActivationPolicyDigest(journal.externalActivationPolicy)
      : EXTERNAL_ACTIVATION_POLICY_DIGEST,
    expectedMutationBoundaryContractDigest: mode === 'historical-observation'
      ? journal.externalActivationMutationBoundaryContractDigest
      : GITHUB_MUTATION_BOUNDARY_CONTRACT_DIGEST,
  }
}

export function validateTransactionJournal(journal, {
  inventory,
  desired,
  rings,
  now = new Date(),
  issuerRegistry,
  mode = 'current-apply',
  allowPendingOffHostReceipt = false,
  managedCiValidationContext,
  expectedActivationPolicyDigest,
} = {}) {
  assertClosedKeys(journal, JOURNAL_ROOT_KEYS, 'Transaction journal has an invalid or open shape')
  for (const key of ['schemaVersion', 'transactionId', 'planDigest', 'candidatePlanDigest', 'candidateRelease', 'verifiedReleaseEvidenceDigest', 'externalActivationDigest', 'externalActivationInventoryDigest', 'externalActivationDesiredDigest', 'externalActivationRequirements', 'externalActivationPolicy', 'externalActivationInventory', 'externalActivationDesired', 'externalActivationMutationBoundaryContract', 'externalActivationMutationBoundaryContractDigest', 'evidenceDurabilityClass', 'mirrorIdentity', 'rolloutWave', 'parallelBudget', 'state', 'startedAt', 'rollbackAttempted', 'recoveryInstruction', 'actions', 'rollbackPlan', 'rollbackPlanDigest', 'inventoryDigest', 'desiredDigest', 'attestationPolicyDigest', 'historicalControlPlane', 'historicalControlPlaneDigest', 'repoBindings', 'authorizationEnvelopeDigest', 'events', 'eventHeadDigest', 'offHostReceipts']) invariant(Object.prototype.hasOwnProperty.call(journal, key), `Transaction journal is missing ${key}`)
  invariant(journal.schemaVersion === 6, 'Transaction journal schemaVersion must be 6')
  invariant(typeof journal.transactionId === 'string' && /^github-reconcile-[0-9]+-[a-f0-9]{12}$/.test(journal.transactionId), 'Transaction journal id is invalid')
  invariant(/^[a-f0-9]{64}$/.test(journal.planDigest ?? '') && /^[a-f0-9]{64}$/.test(journal.candidatePlanDigest ?? ''), 'Transaction journal plan digest is invalid')
  invariant(/^[a-f0-9]{64}$/.test(journal.verifiedReleaseEvidenceDigest ?? ''), 'Transaction journal verified release evidence digest is invalid')
  invariant(/^[a-f0-9]{64}$/.test(journal.externalActivationDigest ?? ''), 'Transaction journal external activation digest is invalid')
  const activationDigestExpectations = transactionJournalActivationDigestExpectations(journal, mode)
  if (mode === 'current-apply' && expectedActivationPolicyDigest !== undefined) {
    invariant(/^[a-f0-9]{64}$/.test(expectedActivationPolicyDigest),
      'Current-apply expected external activation policy digest is invalid')
    activationDigestExpectations.expectedPolicyDigest = expectedActivationPolicyDigest
  }
  const expectedDurabilityClass = fleetReconcileDurabilityClassFromPolicy(
    journal.externalActivationPolicy,
    activationDigestExpectations.expectedPolicyDigest,
  )
  invariant(journal.evidenceDurabilityClass === expectedDurabilityClass,
    'Transaction journal evidence durability class differs from its exact active profile')
  if (expectedDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    invariant(journal.mirrorIdentity === null,
      'Local fleet journal must not claim an off-host mirror identity')
  } else validateMirrorIdentity(journal.mirrorIdentity)
  const canonicalJournalTime = (field, required = false) => {
    if (!Object.prototype.hasOwnProperty.call(journal, field)) {
      invariant(!required, `Transaction journal is missing ${field}`)
      return null
    }
    const parsed = new Date(journal[field])
    invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === journal[field], `Transaction journal ${field} is invalid`)
    return parsed
  }
  canonicalJournalTime('startedAt', true)
  for (const field of ['completedAt', 'failedAt', 'recoveredAt', 'rollbackStartedAt', 'rollbackCompletedAt']) canonicalJournalTime(field)
  if (Object.prototype.hasOwnProperty.call(journal, 'rollbackAuthorizationEventHeadDigest')) invariant(/^[a-f0-9]{64}$/.test(journal.rollbackAuthorizationEventHeadDigest), 'Transaction journal rollback authorization head digest is invalid')
  if (Object.prototype.hasOwnProperty.call(journal, 'recoveryFailures')) invariant(Array.isArray(journal.recoveryFailures) && journal.recoveryFailures.every(item => typeof item === 'string' && item.length > 0), 'Transaction journal recovery failures are invalid')
  if (Object.prototype.hasOwnProperty.call(journal, 'rollbackBlockers')) invariant(Array.isArray(journal.rollbackBlockers) && journal.rollbackBlockers.every(item => typeof item === 'string' && item.length > 0), 'Transaction journal rollback blockers are invalid')
  invariant(['prepared', 'applying', 'verified', 'failed-partial-state-possible', 'recovery-observed', 'manual-recovery-required', 'rolling-back', 'rolled-back-verified', 'rollback-blocked'].includes(journal.state), 'Transaction journal state is invalid')
  invariant(mode === 'current-apply' || mode === 'historical-observation', `Unknown transaction-journal validation mode ${mode}`)
  validateActionTransactionClass(journal.actions)
  invariant(Array.isArray(journal.events) && journal.events.length > 0, 'Transaction journal must contain an append-only event chain')
  invariant(Array.isArray(journal.offHostReceipts), 'Transaction journal off-host receipt set is invalid')
  if (expectedDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    invariant(journal.offHostReceipts.length === 0,
      'Local fleet journal cannot contain or claim off-host/WORM receipts')
  } else {
    invariant(journal.offHostReceipts.length === journal.events.length
      || (allowPendingOffHostReceipt && journal.offHostReceipts.length + 1 === journal.events.length),
    'Maximum-assurance transaction journal requires one off-host acknowledgement per event')
  }
  let previousDigest = JOURNAL_GENESIS_DIGEST
  let previousAt = null
  let previousRuntimeState = null
  const runtimeActionIds = journal.actions.map(action => action.actionId)
  const receiptIds = new Set()
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index]
    assertClosedKeys(event, new Set(JOURNAL_EVENT_KEYS), `Transaction journal event ${index} has an invalid or open shape`)
    invariant(event.schemaVersion === 1
      && event.sequence === index + 1
      && event.transactionId === journal.transactionId
      && typeof event.type === 'string'
      && /^[a-z][a-z0-9-]*$/.test(event.type)
      && event.previousDigest === previousDigest
      && event.authorizationEnvelopeDigest === journal.authorizationEnvelopeDigest
      && /^[a-f0-9]{64}$/.test(event.stateDigest ?? '')
      && (expectedDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS
        ? event.mirrorRequestNonce === null
        : typeof event.mirrorRequestNonce === 'string' && /^[0-9a-f-]{36}$/.test(event.mirrorRequestNonce))
      && event.eventDigest === eventDigest(event), `Transaction journal event ${index} chain binding is invalid`)
    const at = new Date(event.at)
    invariant(Number.isFinite(at.getTime()) && at.toISOString() === event.at && (!previousAt || at >= previousAt), `Transaction journal event ${index} time is invalid or regressed`)
    validateRuntimeStateShape(event.runtimeState, runtimeActionIds)
    invariant(event.stateDigest === sha256(`fleet-reconcile-state-v2\n${stableStringify({ authorizationEnvelopeDigest: event.authorizationEnvelopeDigest, runtimeState: event.runtimeState }, 0)}`), `Transaction journal event ${index} state digest is invalid`)
    validateRuntimeTransition(previousRuntimeState, event.runtimeState, event.type, event.subjectActionId, event.at)
    const receipt = journal.offHostReceipts[index]
    if (expectedDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
      invariant(receipt === undefined,
        'Local fleet journal event cannot contain or claim an off-host/WORM receipt')
    } else if (receipt) {
      invariant(!receiptIds.has(receipt.receiptId), `Transaction journal receipt ${index} id is duplicated`)
      validateOffHostReceipt(receipt, { journal, event, mirrorIdentity: journal.mirrorIdentity, at })
      receiptIds.add(receipt.receiptId)
    } else invariant(allowPendingOffHostReceipt && index === journal.events.length - 1, 'Transaction journal has a non-terminal missing off-host receipt')
    previousDigest = event.eventDigest
    previousAt = at
    previousRuntimeState = event.runtimeState
  }
  invariant(journal.eventHeadDigest === previousDigest, 'Transaction journal event-head digest mismatch')
  invariant(journal.events.at(-1).stateDigest === journalStateDigest(journal), 'Transaction journal latest event does not bind the current state snapshot')
  invariant(deepEqual(journal.events.at(-1).runtimeState, journalRuntimeState(journal)), 'Transaction journal latest event does not replay to the current runtime state')
  if (journal.state === 'verified') invariant(typeof journal.completedAt === 'string' && journal.actions.every(action => action.status === 'verified'), 'Verified transaction journal is incomplete')
  if (journal.state === 'failed-partial-state-possible') invariant(typeof journal.failedAt === 'string' && typeof journal.error === 'string', 'Failed transaction journal lacks failure evidence')
  if (['recovery-observed', 'manual-recovery-required'].includes(journal.state)) invariant(typeof journal.recoveredAt === 'string' && Array.isArray(journal.recoveryFailures), 'Recovered transaction journal lacks observation evidence')
  if (['rolling-back', 'rolled-back-verified', 'rollback-blocked'].includes(journal.state)) invariant(journal.rollbackAttempted === true && typeof journal.rollbackStartedAt === 'string', 'Rollback journal lacks rollback start evidence')
  if (['rolled-back-verified', 'rollback-blocked'].includes(journal.state)) invariant(typeof journal.rollbackCompletedAt === 'string' && Array.isArray(journal.rollbackBlockers), 'Rollback journal lacks completion evidence')

  const signatureTime = new Date(journal.startedAt)
  validateHistoricalControlPlane(journal.historicalControlPlane)
  invariant(journal.historicalControlPlaneDigest === historicalControlPlaneDigest(journal.historicalControlPlane), 'Historical control-plane bundle digest mismatch')
  const historical = journal.historicalControlPlane
  validateHistoricalInventory(historical.inventory)
  validateAttestationPolicy(historical.attestationPolicy, { issuerRegistry: historical.issuerRegistry, now: signatureTime, allowUnactivated: false })
  invariant(journal.inventoryDigest === sha256(stableStringify(historical.inventory, 0)), 'Transaction journal historical inventory digest mismatch')
  invariant(journal.desiredDigest === sha256(stableStringify(historical.desired, 0)), 'Transaction journal historical desired-state digest mismatch')
  invariant(journal.attestationPolicyDigest === sha256(stableStringify(historical.attestationPolicy, 0)), 'Transaction journal historical attestation-policy digest mismatch')
  invariant(journal.externalActivationInventoryDigest === sha256(stableStringify(journal.externalActivationInventory, 0)), 'Transaction journal external activation inventory digest mismatch')
  invariant(journal.externalActivationDesiredDigest === sha256(stableStringify(journal.externalActivationDesired, 0)), 'Transaction journal external activation desired-state digest mismatch')
  invariant(journal.externalActivationMutationBoundaryContractDigest === githubMutationBoundaryContractDigest(journal.externalActivationMutationBoundaryContract),
    'Transaction journal mutation-boundary contract digest mismatch')
  const activation = assertExternalActivationReady(journal.externalActivationRequirements, {
    scope: 'fleet-rollout',
    inventory: journal.externalActivationInventory,
    desired: journal.externalActivationDesired,
    mutationBoundaryContract: journal.externalActivationMutationBoundaryContract,
    rings: { attestationPolicy: historical.attestationPolicy },
    issuerRegistry: historical.issuerRegistry,
    policy: journal.externalActivationPolicy,
    ...activationDigestExpectations,
    now: signatureTime,
    managedCiValidationContext,
  })
  invariant(activation.digest === journal.externalActivationDigest, 'Transaction journal signed external activation snapshot digest mismatch')
  const activatedDurabilityClass = activation.requiredRequirementIds.includes(
    AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID,
  )
    ? FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS
    : FLEET_RECONCILE_LOCAL_DURABILITY_CLASS
  invariant(activatedDurabilityClass === journal.evidenceDurabilityClass,
    'Transaction journal durability class differs from its signed activation readiness')
  if (activatedDurabilityClass === FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS) {
    const mirrorRequirement = journal.externalActivationRequirements.requirements.find(
      requirement => requirement.id === AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID,
    )
    invariant(mirrorRequirement?.status === 'activated' && mirrorRequirement.evidence?.payload?.observedResource,
      'Maximum-assurance journal signed activation snapshot lacks its activated mirror requirement')
    const signedMirrorIdentity = Object.fromEntries(MIRROR_IDENTITY_KEYS.map(
      key => [key, clone(mirrorRequirement.evidence.payload.observedResource[key])],
    ))
    invariant(deepEqual(signedMirrorIdentity, journal.mirrorIdentity),
      'Transaction journal mirror identity differs from signed external activation evidence')
  } else {
    invariant(journal.mirrorIdentity === null && journal.offHostReceipts.length === 0,
      'Production-grade local durability cannot claim maximum-assurance mirror evidence')
  }

  let verificationPolicy = historical.attestationPolicy
  let verificationRegistry = historical.issuerRegistry
  let verificationTime = signatureTime
  if (mode === 'current-apply') {
    invariant(inventory && desired && rings, 'Current-apply journal validation requires current inventory, desired state, and release-ring policy')
    verificationRegistry = issuerRegistry ?? loadIssuerRegistry()
    validateInventory(inventory)
    invariant(journal.inventoryDigest === sha256(stableStringify(inventory, 0)), 'Transaction journal inventory digest mismatch')
    invariant(journal.desiredDigest === sha256(stableStringify(desired, 0)), 'Transaction journal desired-state digest mismatch')
    invariant(journal.attestationPolicyDigest === sha256(stableStringify(rings.attestationPolicy, 0)), 'Transaction journal attestation-policy digest mismatch')
    invariant(historicalControlPlaneDigest(normalizeHistoricalControlPlane({ inventory, desired, attestationPolicy: rings.attestationPolicy, issuerRegistry: verificationRegistry })) === journal.historicalControlPlaneDigest, 'Transaction journal historical bundle differs from the current apply control plane')
    verificationPolicy = rings.attestationPolicy
    verificationTime = now
  } else {
    const currentLineageRegistry = issuerRegistry ?? loadIssuerRegistry()
    validateIssuerRegistryLineage(historical.issuerRegistry, currentLineageRegistry, { historicalAt: signatureTime })
  }
  invariant(Array.isArray(journal.actions) && journal.actions.length > 0, 'Transaction journal must contain managed actions')
  invariant(Array.isArray(journal.repoBindings) && journal.repoBindings.length > 0, 'Transaction journal must contain signed repository bindings')
  const repoById = new Map(historical.inventory.repositories.map(repo => [repo.id, repo]))
  for (const action of journal.actions) validateManagedAction(action, repoById, historical.desired)
  const actionIds = new Set(journal.actions.map(action => action.actionId))
  invariant(actionIds.size === journal.actions.length, 'Transaction journal contains duplicate action ids')
  const bindingRepos = new Set()
  for (const binding of journal.repoBindings) {
    assertClosedKeys(binding, new Set(['repoId', 'github', 'ring', 'wave', 'defaultBranchHeadSha', 'observedStateDigest', 'predicateDigest', 'actionsDigest', 'applyAuthorization']), 'Transaction journal repository binding has an invalid or open shape')
    invariant(!bindingRepos.has(binding.repoId), `Transaction journal contains duplicate binding ${binding.repoId}`)
    const repo = repoById.get(binding.repoId)
    invariant(repo?.github === binding.github, `Transaction journal binding references unmanaged repository ${binding.repoId}`)
    if (mode === 'current-apply') {
      const assignment = rings.assignments[binding.repoId]
      invariant(assignment?.ring === binding.ring && assignment?.wave === binding.wave, `Transaction journal binding ring/wave mismatch for ${binding.repoId}`)
    }
    const actions = journal.actions.filter(action => action.repoId === binding.repoId).map(originalPlanAction)
    invariant(candidateActionsDigest(actions) === binding.actionsDigest, `Transaction journal action digest mismatch for ${binding.repoId}`)
    const authorization = verifyApplyAuthorization(binding.applyAuthorization, {
      repoId: binding.repoId,
      github: binding.github,
      ringId: binding.ring,
      waveId: binding.wave,
      candidateRelease: journal.candidateRelease,
      verifiedReleaseEvidenceDigest: journal.verifiedReleaseEvidenceDigest,
      candidatePlanDigest: journal.candidatePlanDigest,
      predicateDigest: binding.predicateDigest,
      stateDigest: binding.observedStateDigest,
      defaultBranchHeadSha: binding.defaultBranchHeadSha,
      actionsDigest: binding.actionsDigest,
      issuerRegistryDigest: verificationPolicy.issuerRegistryDigest,
      attestationPolicy: verificationPolicy,
    }, { now: verificationTime, issuerRegistry: verificationRegistry })
    invariant(authorization.valid, `Transaction journal authorization failed for ${binding.repoId}: ${authorization.failures.join('; ')}`)
    bindingRepos.add(binding.repoId)
  }
  invariant(journal.actions.every(action => bindingRepos.has(action.repoId)), 'Transaction journal contains an action without a signed repository binding')
  const expectedRollback = rollbackPlanFor(journal.actions)
  invariant(deepEqual(expectedRollback, journal.rollbackPlan), 'Transaction journal rollback plan differs from managed actions')
  invariant(rollbackPlanDigest(journal.rollbackPlan) === journal.rollbackPlanDigest, 'Rollback plan digest mismatch')
  invariant(journal.authorizationEnvelopeDigest === journalAuthorizationEnvelopeDigest(journal), 'Transaction journal authorization envelope digest mismatch')
  return true
}

function externalActivationForApply({
  activationRequirements,
  activationInventory,
  activationDesired,
  activationPolicy,
  mutationBoundaryContract,
  expectedActivationPolicyDigest,
  rings,
  issuerRegistry,
  at,
  managedCiValidationContext,
}) {
  invariant(activationRequirements && activationInventory && activationDesired && mutationBoundaryContract,
    'Apply requires the signed external activation ledger and explicit authority inventory/desired/contract inputs')
  const readiness = assertExternalActivationReady(activationRequirements, {
    scope: 'fleet-rollout',
    inventory: activationInventory,
    desired: activationDesired,
    mutationBoundaryContract,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: expectedActivationPolicyDigest,
    now: at,
    managedCiValidationContext,
  })
  const evidenceDurabilityClass = readiness.requiredRequirementIds.includes(
    AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID,
  )
    ? FLEET_RECONCILE_OFF_HOST_DURABILITY_CLASS
    : FLEET_RECONCILE_LOCAL_DURABILITY_CLASS
  if (evidenceDurabilityClass === FLEET_RECONCILE_LOCAL_DURABILITY_CLASS) {
    return {
      readiness,
      evidenceDurabilityClass,
      provider: null,
      mirrorIdentity: null,
    }
  }
  const mirrors = activationRequirements.requirements.filter(
    requirement => requirement.id === AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID,
  )
  invariant(mirrors.length === 1 && mirrors[0].status === 'activated', 'Apply requires exactly one activated durable fleet evidence mirror')
  const claims = mirrors[0].evidence?.payload?.observedResource
  const mirrorIdentity = Object.fromEntries(MIRROR_IDENTITY_KEYS.map(key => [key, clone(claims?.[key])]))
  validateMirrorIdentity(mirrorIdentity)
  return { readiness, evidenceDurabilityClass, provider: mirrorIdentity.provider, mirrorIdentity }
}

function recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at, productionLive }) {
  const effectiveRuntimeValidationContext = resolveRuntimeValidationContextCore({
    client,
    inventory,
    certifications,
    runtimeProfile,
    runtimeValidationContext,
  }, productionLive)
  validateModelCore(inventory, desired, rings, certifications, waivers, at, issuerRegistry, runtimeProfile, effectiveRuntimeValidationContext, productionLive)
  const candidates = []
  const observedByRepo = new Map()
  const materializedByRepo = new Map()
  for (const repoPlan of plan.repoPlans) {
    const repo = inventory.repositories.find(item => item.id === repoPlan.repoId)
    invariant(repo?.github === repoPlan.github, `Apply refused: inventory repository identity drift for ${repoPlan.repoId}`)
    const assignment = rings.assignments[repo.id]
    const materialized = materializeProfile(repo, desired, rings, {
      eligible: true,
      promoted: true,
      ring: assignment.ring,
      wave: assignment.wave,
      blockers: [],
    })
    const observed = fetchRepositoryState(client, repo, materialized, desired)
    candidates.push(diffRepository(repo, materialized, observed, desired, at))
    materializedByRepo.set(repo.id, materialized)
    observedByRepo.set(repo.id, observed)
  }
  assertLiveIdentitySnapshot(
    productionLive,
    plan.repoPlans.map(repoPlan => inventory.repositories.find(repository => repository.id === repoPlan.repoId)),
    plan.repoPlans.map(repoPlan => observedByRepo.get(repoPlan.repoId)),
    effectiveRuntimeValidationContext,
  )
  const candidateByRepo = new Map(candidates.map(candidate => [candidate.repoId, candidate]))
  const evaluatedByRepo = new Map()
  const ringOrder = new Map(rings.rings.map(ring => [ring.id, ring.order]))
  const evaluationOrder = [...candidates].sort((left, right) => ringOrder.get(left.ring) - ringOrder.get(right.ring))
  for (const candidate of evaluationOrder) {
    const repo = inventory.repositories.find(item => item.id === candidate.repoId)
    const assignment = rings.assignments[repo.id]
    const ring = rings.rings.find(value => value.id === assignment.ring)
    const predicateResults = evaluatePromotionPredicates({
      repo,
      ring,
      assignment,
      rings,
      certifications,
      waivers,
      evidenceLedger: rings.evidence,
      materialized: materializedByRepo.get(repo.id),
      observed: observedByRepo.get(repo.id),
      desired,
      candidateRelease: rings.candidateRelease,
      verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
      candidatePlanDigest: plan.candidatePlanDigest,
      candidatesByRepo: evaluatedByRepo,
      candidateConflicts: candidate.conflicts,
      now: at,
      issuerRegistry,
    })
    evaluatedByRepo.set(repo.id, { ...candidate, predicateResults })
  }
  for (const repoPlan of plan.repoPlans) {
    const candidate = evaluatedByRepo.get(repoPlan.repoId)
    invariant(candidate.defaultBranchHeadSha === repoPlan.defaultBranchHeadSha, `Apply refused: default-branch head drift for ${repoPlan.repoId}`)
    invariant(deepEqual(candidate.predicateResults, repoPlan.predicateResults), `Apply refused: current promotion predicate evidence drift for ${repoPlan.repoId}`)
  }
  const rollout = resolveRolloutWave({
    inventory,
    rings,
    candidateRelease: plan.candidateRelease,
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
    candidatePlanDigest: plan.candidatePlanDigest,
    repoCandidates: plan.repoPlans.map(repoPlan => ({
      repoId: repoPlan.repoId,
      github: repoPlan.github,
      ring: repoPlan.ring,
      defaultBranchHeadSha: repoPlan.defaultBranchHeadSha,
      observedStateDigest: repoPlan.observedStateDigest,
      actions: repoPlan.candidateActions,
      deferredActions: repoPlan.deferredActions,
      conflicts: repoPlan.conflicts,
      predicateResults: evaluatedByRepo.get(repoPlan.repoId).predicateResults,
    })),
    now: at,
    issuerRegistry,
  })
  invariant(deepEqual(rollout, plan.rollout), 'Apply refused: current rollout wave, authorization clock, or parallel budget changed')

  for (const repoPlan of plan.repoPlans) {
    const candidate = evaluatedByRepo.get(repoPlan.repoId)
    if (!repoPlan.selectedForApply) {
      invariant(candidate.observedStateDigest === repoPlan.observedStateDigest
        && deepEqual(candidate.actions, repoPlan.candidateActions)
        && deepEqual(candidate.deferredActions, repoPlan.deferredActions)
        && deepEqual(candidate.conflicts, repoPlan.conflicts), `Apply refused: non-selected fleet state drift for ${repoPlan.repoId}`)
      continue
    }
    const remaining = journal
      ? journal.actions.filter(action => action.repoId === repoPlan.repoId && action.status !== 'verified').map(originalPlanAction)
      : repoPlan.candidateActions
    invariant(candidate.conflicts.length === 0
      && deepEqual(candidate.actions, remaining)
      && deepEqual(candidate.deferredActions, repoPlan.deferredActions), `Apply refused: selected fleet full-state drift for ${repoPlan.repoId}`)
  }
  return true
}

function applyPlanCore(plan, client, {
  journalPath,
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  runtimeProfile,
  runtimeValidationContext = {},
  verifiedReleaseEvidence,
  activationRequirements,
  activationInventory = inventory,
  activationDesired = desired,
  activationPolicy,
  mutationBoundaryContract,
  expectedActivationPolicyDigest,
  offHostMirror,
  now = new Date(),
  clock = () => new Date(),
  reloadCurrentGovernance,
  issuerRegistry = loadIssuerRegistry(),
  managedCiValidationContext,
}, productionLive) {
  invariant(journalPath, 'Apply requires a transaction journal path')
  invariant(!productionLive || managedCiValidationContext === undefined || managedCiValidationContext === null,
    'Live GitHub apply refuses an injected managed CI validation context')
  invariant(inventory && desired && rings && certifications && waivers && runtimeProfile && mutationBoundaryContract,
    'Apply requires the complete current governance model and explicit mutation-boundary contract')
  invariant(typeof clock === 'function', 'Apply requires a live clock source')
  const injectedRuntimeValidationContext = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  invariant(!productionLive || Object.keys(injectedRuntimeValidationContext).length === 0,
    'Live GitHub apply refuses an injected runtime validation identity')
  invariant(!productionLive || typeof reloadCurrentGovernance === 'function', 'Live GitHub apply requires per-write canonical governance SSOT reload')
  const governanceBaseline = clone({ inventory, desired, rings, certifications, waivers, runtimeProfile, issuerRegistry, activationRequirements, activationInventory, activationDesired, activationPolicy, mutationBoundaryContract })
  assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
  invariant(!existsSync(journalPath), `Apply refused: transaction journal path already exists and is immutable: ${journalPath}`)
  invariant(plan.inventoryDigest === sha256(stableStringify(inventory, 0)), 'Apply refused: inventory digest mismatch')
  invariant(plan.desiredDigest === sha256(stableStringify(desired, 0)), 'Apply refused: desired-state digest mismatch')
  invariant(plan.attestationPolicyDigest === sha256(stableStringify(rings.attestationPolicy, 0)), 'Apply refused: attestation trust-policy digest mismatch')
  validateVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease)
  invariant(plan.verifiedReleaseEvidenceDigest === digestVerifiedReleaseEvidence(verifiedReleaseEvidence, rings.candidateRelease), 'Apply refused: verified release evidence drifted')
  const planPayload = clone(plan)
  delete planPayload.planDigest
  invariant(sha256(stableStringify(planPayload, 0)) === plan.planDigest, 'Apply refused: reconciliation plan digest mismatch')
  const recomputedCandidateDigest = candidatePlanDigest({
    candidateRelease: plan.candidateRelease,
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
    repoCandidates: plan.repoPlans.map(repo => ({
      repoId: repo.repoId,
      github: repo.github,
      ring: repo.ring,
      defaultBranchHeadSha: repo.defaultBranchHeadSha,
      observedStateDigest: repo.observedStateDigest,
      actions: repo.candidateActions,
      deferredActions: repo.deferredActions,
      conflicts: repo.conflicts,
    })),
  })
  invariant(recomputedCandidateDigest === plan.candidatePlanDigest, 'Apply refused: candidate plan digest mismatch')
  const selectedPlans = plan.repoPlans.filter(repo => repo.selectedForApply)
  invariant(plan.schemaVersion === 6 && plan.rollout?.current, 'Apply refused: no current rollout wave exists')
  invariant(plan.scope?.coverage === 'registered-opt-in-inventory'
    && plan.scope.registeredRepositoryCount === inventory.repositories.length
    && plan.scope.plannedRepositoryCount === inventory.repositories.length
    && plan.scope.unregisteredDescendants === 'not-covered', 'Apply refused: plan is not the full registered opt-in inventory scope')
  invariant(selectedPlans.length > 0, 'Apply refused: current wave has no signed-authorization-approved repository')
  invariant(selectedPlans.length <= plan.rollout.budget, 'Apply refused: current wave exceeds its parallel budget')
  invariant(selectedPlans.every(repo => repo.conflicts.length === 0 && repo.eligibility.eligible && repo.predicateResults.every(result => result.pass)), 'Apply refused: current-wave preflight or typed promotion predicate failed')
  const initialAt = readLiveTime(clock, 'Apply')
  const activation = externalActivationForApply({ activationRequirements, activationInventory, activationDesired, activationPolicy, mutationBoundaryContract, expectedActivationPolicyDigest, rings, issuerRegistry, at: initialAt, managedCiValidationContext })
  validateFleetReconcileDurabilityAdapter({
    evidenceDurabilityClass: activation.evidenceDurabilityClass,
    mirrorIdentity: activation.mirrorIdentity,
  }, offHostMirror)
  for (const repo of selectedPlans) {
    const assignment = rings.assignments[repo.repoId]
    const authorization = verifyApplyAuthorization(repo.applyAuthorization, {
      repoId: repo.repoId,
      github: repo.github,
      ringId: assignment.ring,
      waveId: assignment.wave,
      candidateRelease: plan.candidateRelease,
      verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
      candidatePlanDigest: plan.candidatePlanDigest,
      predicateDigest: predicateEvidenceDigest(repo.predicateResults),
      stateDigest: repo.observedStateDigest,
      defaultBranchHeadSha: repo.defaultBranchHeadSha,
      actionsDigest: candidateActionsDigest(repo.candidateActions),
      issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
      attestationPolicy: rings.attestationPolicy,
    }, { now: initialAt, issuerRegistry })
    invariant(authorization.valid, `Apply refused: ${repo.repoId} signed authorization failed: ${authorization.failures.join('; ')}`)
  }
  invariant(plan.repoPlans.filter(repo => !repo.selectedForApply).every(repo => repo.actions.length === 0), 'Apply refused: plan contains actions outside the current wave')
  validateActionTransactionClass(selectedPlans.flatMap(repo => repo.actions))
  const actions = selectedPlans.flatMap(repo => repo.actions.map((action, index) => ({
    ...clone(action),
    actionId: `${repo.repoId}:${String(index + 1).padStart(3, '0')}:${action.kind}:${action.resource}`,
    github: repo.github,
    repoId: repo.repoId,
    status: 'pending',
  })))
  const rollbackPlan = rollbackPlanFor(actions)
  const repoBindings = selectedPlans.map(repo => ({
    repoId: repo.repoId,
    github: repo.github,
    ring: rings.assignments[repo.repoId].ring,
    wave: rings.assignments[repo.repoId].wave,
    defaultBranchHeadSha: repo.defaultBranchHeadSha,
    observedStateDigest: repo.observedStateDigest,
    predicateDigest: predicateEvidenceDigest(repo.predicateResults),
    actionsDigest: candidateActionsDigest(repo.candidateActions),
    applyAuthorization: clone(repo.applyAuthorization),
  }))
  const historicalControlPlane = normalizeHistoricalControlPlane({
    inventory,
    desired,
    attestationPolicy: rings.attestationPolicy,
    issuerRegistry,
  })
  const journal = {
    schemaVersion: 6,
    transactionId: `github-reconcile-${initialAt.getTime()}-${plan.planDigest.slice(0, 12)}`,
    planDigest: plan.planDigest,
    candidatePlanDigest: plan.candidatePlanDigest,
    candidateRelease: clone(plan.candidateRelease),
    verifiedReleaseEvidenceDigest: plan.verifiedReleaseEvidenceDigest,
    externalActivationDigest: activation.readiness.digest,
    externalActivationInventoryDigest: sha256(stableStringify(activationInventory, 0)),
    externalActivationDesiredDigest: sha256(stableStringify(activationDesired, 0)),
    externalActivationRequirements: clone(activationRequirements),
    externalActivationPolicy: clone(activationPolicy),
    externalActivationInventory: clone(activationInventory),
    externalActivationDesired: clone(activationDesired),
    externalActivationMutationBoundaryContract: clone(mutationBoundaryContract),
    externalActivationMutationBoundaryContractDigest: githubMutationBoundaryContractDigest(mutationBoundaryContract),
    evidenceDurabilityClass: activation.evidenceDurabilityClass,
    mirrorIdentity: clone(activation.mirrorIdentity),
    inventoryDigest: plan.inventoryDigest,
    desiredDigest: plan.desiredDigest,
    attestationPolicyDigest: plan.attestationPolicyDigest,
    historicalControlPlane,
    historicalControlPlaneDigest: historicalControlPlaneDigest(historicalControlPlane),
    rolloutWave: clone(plan.rollout.current),
    parallelBudget: plan.rollout.budget,
    state: 'prepared',
    startedAt: initialAt.toISOString(),
    rollbackAttempted: false,
    recoveryInstruction: 'Use --recover-journal for historical-bundle-bound observation only. --rollback-journal additionally requires a fresh profile-bound --rollback-authorization under the current apply and privileged root policies.',
    actions,
    repoBindings,
    rollbackPlan,
    rollbackPlanDigest: rollbackPlanDigest(rollbackPlan),
    authorizationEnvelopeDigest: null,
    events: [],
    eventHeadDigest: JOURNAL_GENESIS_DIGEST,
    offHostReceipts: [],
  }
  journal.authorizationEnvelopeDigest = journalAuthorizationEnvelopeDigest(journal)
  recomputeApplyGuard({ plan, journal: null, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: initialAt, productionLive })
  appendJournalEvent(journalPath, journal, { type: 'prepared', at: initialAt, offHostMirror, create: true })
  validateTransactionJournal(journal, {
    inventory, desired, rings, now: initialAt, issuerRegistry, managedCiValidationContext, expectedActivationPolicyDigest,
  })
  verifyFleetReconcileDurability(journal, offHostMirror, { at: initialAt })
  let lastEventAt = initialAt
  try {
    journal.state = 'applying'
    appendJournalEvent(journalPath, journal, { type: 'applying', at: initialAt, offHostMirror })
    for (const action of journal.actions) {
      const writeAt = readLiveTime(clock, 'Apply', lastEventAt)
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      const currentActivation = externalActivationForApply({ activationRequirements, activationInventory, activationDesired, activationPolicy, mutationBoundaryContract, expectedActivationPolicyDigest, rings, issuerRegistry, at: writeAt, managedCiValidationContext })
      invariant(currentActivation.readiness.digest === journal.externalActivationDigest
        && currentActivation.evidenceDurabilityClass === activation.evidenceDurabilityClass
        && currentActivation.provider === activation.provider,
      'Apply refused: external activation ledger or durability identity changed during transaction')
      validateTransactionJournal(journal, {
        inventory, desired, rings, now: writeAt, issuerRegistry, managedCiValidationContext, expectedActivationPolicyDigest,
      })
      verifyFleetReconcileDurability(journal, offHostMirror, { at: writeAt })
      recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: writeAt, productionLive })
      const decisionAt = readLiveTime(clock, 'Apply', writeAt)
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      if (decisionAt.getTime() !== writeAt.getTime()) {
        const decisionActivation = externalActivationForApply({ activationRequirements, activationInventory, activationDesired, activationPolicy, mutationBoundaryContract, expectedActivationPolicyDigest, rings, issuerRegistry, at: decisionAt, managedCiValidationContext })
        invariant(decisionActivation.readiness.digest === journal.externalActivationDigest
          && decisionActivation.evidenceDurabilityClass === activation.evidenceDurabilityClass
          && decisionActivation.provider === activation.provider,
        'Apply refused: external activation ledger or durability identity changed before mutation')
        recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: decisionAt, productionLive })
      }
      const before = observeActionState(client, action)
      invariant(deepEqual(before, action.beforeImage), `Pre-apply drift for ${action.repoId}/${action.resource}`)
      action.status = 'applying'
      appendJournalEvent(journalPath, journal, { type: 'action-applying', subjectActionId: action.actionId, at: decisionAt, offHostMirror })
      lastEventAt = decisionAt
      const mutationAt = readLiveTime(clock, 'Apply mutation', decisionAt)
      lastEventAt = mutationAt
      assertCurrentGovernanceReload(reloadCurrentGovernance, governanceBaseline)
      const mutationActivation = externalActivationForApply({ activationRequirements, activationInventory, activationDesired, activationPolicy, mutationBoundaryContract, expectedActivationPolicyDigest, rings, issuerRegistry, at: mutationAt, managedCiValidationContext })
      invariant(mutationActivation.readiness.digest === journal.externalActivationDigest
        && mutationActivation.evidenceDurabilityClass === activation.evidenceDurabilityClass
        && mutationActivation.provider === activation.provider,
      'Apply refused: external activation ledger or durability identity changed at the mutation boundary')
      validateTransactionJournal(journal, {
        inventory, desired, rings, now: mutationAt, issuerRegistry, managedCiValidationContext, expectedActivationPolicyDigest,
      })
      verifyFleetReconcileDurability(journal, offHostMirror, { at: mutationAt })
      recomputeApplyGuard({ plan, journal, client, inventory, desired, rings, certifications, waivers, runtimeProfile, runtimeValidationContext, issuerRegistry, at: mutationAt, productionLive })
      const mutationBefore = observeActionState(client, action)
      invariant(deepEqual(mutationBefore, action.beforeImage), `Pre-apply drift at mutation boundary for ${action.repoId}/${action.resource}`)
      const response = client.request(action.method, action.path, action.body)
      action.responseId = response?.id ?? null
      action.readbackPath = readbackPath(action, response)
      action.status = 'applied-unverified'
      appendJournalEvent(journalPath, journal, { type: 'action-applied-unverified', subjectActionId: action.actionId, at: mutationAt, offHostMirror })
      invariant(verifyAppliedAction(client, action), `Exact readback mismatch for ${action.repoId}/${action.resource}`)
      action.status = 'verified'
      appendJournalEvent(journalPath, journal, { type: 'action-verified', subjectActionId: action.actionId, at: mutationAt, offHostMirror })
    }
    journal.state = 'verified'
    const completedAt = readLiveTime(clock, 'Apply', lastEventAt)
    journal.completedAt = completedAt.toISOString()
    appendJournalEvent(journalPath, journal, { type: 'verified', at: completedAt, offHostMirror })
    verifyFleetReconcileDurability(journal, offHostMirror, { at: completedAt })
    validateTransactionJournal(journal, {
      inventory, desired, rings, now: completedAt, issuerRegistry, managedCiValidationContext, expectedActivationPolicyDigest,
    })
    return { applied: true, transactionId: journal.transactionId, journalPath, actions: journal.actions.map(action => ({ repoId: action.repoId, kind: action.kind, resource: action.resource })) }
  } catch (error) {
    if (fleetJournalHasPendingOffHostReceipt(journal)) {
      throw new Error(`Reconciliation stopped with an externally unacknowledged journal event; no further event or rollback was fabricated. Repair only by exact live mirror receipt read-back for ${journalPath}: ${error.message}`, { cause: error })
    }
    journal.state = 'failed-partial-state-possible'
    const failedAt = readLiveTime(clock, 'Apply failure journal', lastEventAt)
    journal.failedAt = failedAt.toISOString()
    journal.error = error.message
    appendJournalEvent(journalPath, journal, { type: 'failed-partial-state-possible', at: failedAt, offHostMirror })
    throw new Error(`Reconciliation failed; no rollback was claimed or attempted. Inspect ${journalPath}, then use --rollback-journal only if its compensations remain safe: ${error.message}`, { cause: error })
  }
}

function recoverTransactionCore(journalPath, client, {
  issuerRegistry = loadIssuerRegistry(),
  offHostMirror,
  clock = () => new Date(),
  reloadIssuerRegistry,
  managedCiValidationContext,
} = {}, productionLive) {
  invariant(!productionLive || managedCiValidationContext === undefined || managedCiValidationContext === null,
    'Live GitHub recovery refuses an injected managed CI validation context')
  invariant(!productionLive || typeof reloadIssuerRegistry === 'function', 'Live GitHub recovery requires current issuer-registry SSOT reload')
  const issuerRegistryBaseline = clone(issuerRegistry)
  const assertIssuerRegistryCurrent = () => {
    if (reloadIssuerRegistry) invariant(deepEqual(reloadIssuerRegistry(), issuerRegistryBaseline), 'Recovery refused: canonical issuer registry changed during observation')
  }
  assertIssuerRegistryCurrent()
  const journal = readJson(journalPath)
  repairPendingOffHostReceipt(journalPath, journal, offHostMirror, { issuerRegistry, clock, managedCiValidationContext })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
  const lastEventAt = new Date(journal.events.at(-1).at)
  const observationAt = readLiveTime(clock, 'Recovery', lastEventAt)
  verifyFleetReconcileDurability(journal, offHostMirror, { at: observationAt })
  const failures = []
  for (const action of journal.actions ?? []) {
    try {
      const remote = observeActionState(client, action)
      action.recoveryObservation = remote
      if (deepEqual(remote, action.expectedApplied)) action.status = 'verified'
      else if (deepEqual(remote, action.beforeImage)) action.status = 'not-applied'
      else failures.push(`${action.repoId}/${action.resource}: remote state matches neither before-image nor expected applied state`)
    } catch (error) {
      failures.push(`${action.repoId}/${action.resource}: ${error.message}`)
    }
  }
  journal.state = failures.length === 0 ? 'recovery-observed' : 'manual-recovery-required'
  assertIssuerRegistryCurrent()
  const recoveredAt = readLiveTime(clock, 'Recovery', observationAt)
  journal.recoveredAt = recoveredAt.toISOString()
  journal.recoveryFailures = failures
  appendJournalEvent(journalPath, journal, {
    type: journal.state,
    at: recoveredAt,
    offHostMirror,
  })
  verifyFleetReconcileDurability(journal, offHostMirror, { at: recoveredAt })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
  return { observed: failures.length === 0, rolledBack: false, failures, journalPath }
}

function rollbackTransactionCore(journalPath, client, {
  inventory,
  desired,
  rings,
  privilegedPolicy,
  recoveryAuthorization,
  clock = () => new Date(),
  offHostMirror,
  reloadCurrentGovernance,
  issuerRegistry = loadIssuerRegistry(),
  managedCiValidationContext,
  externalActivationPolicy = loadExternalActivationPolicy(),
}, productionLive) {
  invariant(!productionLive || managedCiValidationContext === undefined || managedCiValidationContext === null,
    'Live GitHub rollback refuses an injected managed CI validation context')
  const journal = readJson(journalPath)
  repairPendingOffHostReceipt(journalPath, journal, offHostMirror, { issuerRegistry, clock, managedCiValidationContext })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
  invariant(journal.schemaVersion === 6, 'Rollback requires a v6 transaction journal')
  invariant(['failed-partial-state-possible', 'manual-recovery-required', 'recovery-observed', 'rollback-blocked'].includes(journal.state), `Rollback refused from journal state ${journal.state}`)
  invariant(rollbackPlanDigest(journal.rollbackPlan) === journal.rollbackPlanDigest, 'Rollback plan digest mismatch')
  invariant(inventory && desired && rings?.attestationPolicy && privilegedPolicy, 'Rollback requires the current inventory, desired state, apply policy, and privileged root policy')
  invariant(recoveryAuthorization, 'Rollback requires a fresh current profile-bound recovery authorization')
  invariant(!productionLive || typeof reloadCurrentGovernance === 'function', 'Live GitHub rollback requires per-write canonical governance SSOT reload')
  const governanceBaseline = clone({
    inventory,
    desired,
    rings,
    privilegedPolicy,
    issuerRegistry,
    externalActivationPolicy,
  })
  assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
  validateInventory(inventory)
  const lastJournalEventAt = new Date(journal.events.at(-1).at)
  const authorizationAt = readLiveTime(clock, 'Rollback', lastJournalEventAt)
  verifyFleetReconcileDurability(journal, offHostMirror, { at: authorizationAt })
  verifyFleetRecoveryAuthorization(recoveryAuthorization, {
    journal,
    inventory,
    desired,
    attestationPolicy: rings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry,
    now: authorizationAt,
    ...(externalActivationPolicy ? { externalActivationPolicy } : {}),
  })
  journal.rollbackAuthorizationEventHeadDigest = recoveryAuthorization.journalEventHeadDigest
  const byId = new Map(journal.actions.map(action => [action.actionId, action]))
  const blocked = []
  journal.rollbackAttempted = true
  const rollbackStartedAt = authorizationAt
  journal.rollbackStartedAt = rollbackStartedAt.toISOString()
  journal.state = 'rolling-back'
  appendJournalEvent(journalPath, journal, { type: 'rolling-back', at: rollbackStartedAt, offHostMirror })
  let lastEventAt = rollbackStartedAt
  for (const step of journal.rollbackPlan) {
    const action = byId.get(step.actionId)
    invariant(action, `Rollback plan references missing action ${step.actionId}`)
    const writeAt = readLiveTime(clock, 'Rollback', lastEventAt)
    assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
    verifyFleetReconcileDurability(journal, offHostMirror, { at: writeAt })
    try {
      verifyFleetRecoveryAuthorization(recoveryAuthorization, {
        journal,
        inventory,
        desired,
        attestationPolicy: rings.attestationPolicy,
        privilegedPolicy,
        issuerRegistry,
        expectedJournalEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest,
        now: writeAt,
        ...(externalActivationPolicy ? { externalActivationPolicy } : {}),
      })
      const remote = observeActionState(client, action)
      if (deepEqual(remote, action.beforeImage)) {
        action.rollbackStatus = 'already-at-before-image'
        appendJournalEvent(journalPath, journal, { type: 'rollback-already-restored', subjectActionId: action.actionId, at: writeAt, offHostMirror })
        lastEventAt = writeAt
        continue
      }
      if (!deepEqual(remote, action.expectedApplied)) {
        blocked.push(`${action.repoId}/${action.resource}: rollback drift; remote no longer matches this transaction`)
        action.rollbackStatus = 'blocked-drift'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-drift', subjectActionId: action.actionId, at: writeAt, offHostMirror })
        lastEventAt = writeAt
        continue
      }
      if (step.compensation.safety !== 'automatic') {
        blocked.push(`${action.repoId}/${action.resource}: ${step.compensation.reason}`)
        action.rollbackStatus = 'blocked-manual'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-manual', subjectActionId: action.actionId, at: writeAt, offHostMirror })
        lastEventAt = writeAt
        continue
      }
      const path = step.compensation.pathSource === 'readbackPath' ? action.readbackPath : step.compensation.path
      invariant(path, `Rollback path unavailable for ${action.repoId}/${action.resource}`)
      action.rollbackStatus = 'compensating'
      appendJournalEvent(journalPath, journal, { type: 'rollback-compensating', subjectActionId: action.actionId, at: writeAt, offHostMirror })
      lastEventAt = writeAt
      const mutationAt = readLiveTime(clock, 'Rollback mutation', writeAt)
      lastEventAt = mutationAt
      assertCurrentRollbackReload(reloadCurrentGovernance, governanceBaseline)
      validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
      verifyFleetReconcileDurability(journal, offHostMirror, { at: mutationAt })
      verifyFleetRecoveryAuthorization(recoveryAuthorization, {
        journal,
        inventory,
        desired,
        attestationPolicy: rings.attestationPolicy,
        privilegedPolicy,
        issuerRegistry,
        expectedJournalEventHeadDigest: journal.rollbackAuthorizationEventHeadDigest,
        now: mutationAt,
        ...(externalActivationPolicy ? { externalActivationPolicy } : {}),
      })
      const mutationRemote = observeActionState(client, action)
      if (deepEqual(mutationRemote, action.beforeImage)) {
        action.rollbackStatus = 'already-at-before-image'
        appendJournalEvent(journalPath, journal, { type: 'rollback-already-restored', subjectActionId: action.actionId, at: mutationAt, offHostMirror })
        continue
      }
      if (!deepEqual(mutationRemote, action.expectedApplied)) {
        blocked.push(`${action.repoId}/${action.resource}: rollback drift at mutation boundary; remote no longer matches this transaction`)
        action.rollbackStatus = 'blocked-drift'
        appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-drift', subjectActionId: action.actionId, at: mutationAt, offHostMirror })
        continue
      }
      const response = client.request(step.compensation.method, path, step.compensation.body)
      if (step.compensation.recreatedResource && response?.id) action.readbackPath = `/repos/${action.github}/rulesets/${response.id}`
      const restored = observeActionState(client, action)
      invariant(deepEqual(restored, action.beforeImage), `Rollback exact readback mismatch for ${action.repoId}/${action.resource}`)
      action.rollbackStatus = 'rolled-back-verified'
      appendJournalEvent(journalPath, journal, { type: 'rollback-action-verified', subjectActionId: action.actionId, at: mutationAt, offHostMirror })
    } catch (error) {
      blocked.push(`${action.repoId}/${action.resource}: ${error.message}`)
      action.rollbackStatus = 'blocked-error'
      const blockedAt = readLiveTime(clock, 'Rollback failure journal', lastEventAt)
      appendJournalEvent(journalPath, journal, { type: 'rollback-blocked-error', subjectActionId: action.actionId, at: blockedAt, offHostMirror })
      lastEventAt = blockedAt
    }
  }
  const rollbackCompletedAt = readLiveTime(clock, 'Rollback', lastEventAt)
  journal.rollbackCompletedAt = rollbackCompletedAt.toISOString()
  journal.rollbackBlockers = blocked
  journal.state = blocked.length === 0 ? 'rolled-back-verified' : 'rollback-blocked'
  appendJournalEvent(journalPath, journal, { type: journal.state, at: rollbackCompletedAt, offHostMirror })
  verifyFleetReconcileDurability(journal, offHostMirror, { at: rollbackCompletedAt })
  validateTransactionJournal(journal, { mode: 'historical-observation', issuerRegistry, managedCiValidationContext })
  return { rolledBack: blocked.length === 0, blocked, journalPath }
}

function authorityBootstrapAuthorizationEnvelope(journal) {
  return {
    transactionClass: journal.transactionClass,
    durabilityClass: journal.durabilityClass,
    planDigest: journal.planDigest,
    genesisReceiptDigest: journal.plan.genesisReceiptDigest,
    authorityPolicyDigest: journal.plan.authorityPolicyDigest,
    inventoryDigest: journal.plan.inventoryDigest,
    desiredDigest: journal.plan.desiredDigest,
    stagedRolloutPlanDigest: journal.plan.stagedRolloutPlanDigest,
    bootstrapBoundaryDigest: journal.plan.bootstrapBoundaryDigest,
    projectionDigest: journal.plan.projectionDigest,
    target: {
      repositoryId: journal.plan.repositoryId,
      repository: journal.plan.repository,
      defaultBranch: journal.plan.defaultBranch,
      defaultBranchHeadSha: journal.plan.defaultBranchHeadSha,
      defaultBranchTreeSha: journal.plan.defaultBranchTreeSha,
    },
    actions: journal.actions.map(fixedAction),
    rollbackPlan: journal.rollbackPlan,
  }
}

function authorityBootstrapAuthorizationEnvelopeDigest(journal) {
  return sha256(`qijenchen-authority-policy-bootstrap-authorization-v1\n${stableStringify(authorityBootstrapAuthorizationEnvelope(journal), 0)}`)
}

function authorityBootstrapRollbackAuthorizationDigest(journal, preRollbackEventHeadDigest) {
  invariant(/^[a-f0-9]{64}$/.test(preRollbackEventHeadDigest ?? ''),
    'authority policy bootstrap rollback pre-event head digest is invalid')
  return sha256(`qijenchen-authority-policy-bootstrap-rollback-standing-delegation-v1\n${stableStringify({
    transactionId: journal.transactionId,
    planDigest: journal.planDigest,
    genesisReceiptDigest: journal.plan.genesisReceiptDigest,
    authorityPolicyDigest: journal.plan.authorityPolicyDigest,
    authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    preRollbackEventHeadDigest,
  }, 0)}`)
}

function validateAuthorityBootstrapJournalTime(journal, field, required = false) {
  if (!Object.prototype.hasOwnProperty.call(journal, field)) {
    invariant(!required, `authority policy bootstrap journal is missing ${field}`)
    return null
  }
  const parsed = new Date(journal[field])
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === journal[field],
    `authority policy bootstrap journal ${field} is invalid`)
  return parsed
}

export function validateAuthorityBootstrapJournal(journal, {
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest,
} = {}) {
  assertClosedKeys(journal, AUTHORITY_BOOTSTRAP_JOURNAL_KEYS,
    'authority policy bootstrap journal has an invalid or open shape')
  for (const key of [
    'schemaVersion', 'kind', 'transactionClass', 'durabilityClass', 'offHostMirrored',
    'promotionEligible', 'managedEvidence', 'transactionId', 'plan', 'planDigest',
    'state', 'startedAt', 'rollbackAttempted', 'recoveryInstruction', 'actions',
    'rollbackPlan', 'rollbackPlanDigest', 'authorizationEnvelopeDigest', 'events',
    'eventHeadDigest', 'offHostReceipts',
  ]) invariant(Object.prototype.hasOwnProperty.call(journal, key),
    `authority policy bootstrap journal is missing ${key}`)
  invariant(journal.schemaVersion === 1
    && journal.kind === AUTHORITY_BOOTSTRAP_TRANSACTION_KIND
    && journal.transactionClass === AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS
    && journal.durabilityClass === AUTHORITY_BOOTSTRAP_DURABILITY_CLASS
    && journal.offHostMirrored === false
    && journal.promotionEligible === false
    && journal.managedEvidence === false,
  'authority policy bootstrap journal identity or evidence class is invalid')
  invariant(/^github-reconcile-[0-9]+-[a-f0-9]{12}$/.test(journal.transactionId ?? ''),
    'authority policy bootstrap transaction id is invalid')
  validateAuthorityBootstrapPlan(journal.plan)
  invariant(journal.planDigest === journal.plan.planDigest,
    'authority policy bootstrap journal plan digest mismatch')
  validateAuthorityBootstrapJournalTime(journal, 'startedAt', true)
  for (const field of [
    'completedAt', 'failedAt', 'recoveredAt', 'rollbackStartedAt', 'rollbackCompletedAt',
  ]) validateAuthorityBootstrapJournalTime(journal, field)
  invariant([
    'prepared', 'applying', 'verified', 'failed-partial-state-possible',
    'recovery-observed', 'manual-recovery-required', 'rolling-back',
    'rolled-back-verified', 'rollback-blocked',
  ].includes(journal.state), 'authority policy bootstrap journal state is invalid')
  invariant(typeof journal.recoveryInstruction === 'string' && journal.recoveryInstruction.length > 0,
    'authority policy bootstrap recovery instruction is invalid')
  invariant(Array.isArray(journal.actions)
    && journal.actions.every(action => AUTHORITY_BOOTSTRAP_ALLOWED_ACTION_KINDS.has(action.kind)
      && action.compensation?.safety === 'automatic'
      && !action.kind.startsWith('delete-')
      && action.kind !== 'enable-immutable-releases'),
  'authority policy bootstrap journal contains a forbidden action')
  const historicalInventory = inventory ?? {
    schemaVersion: 1,
    repositories: [{
      id: journal.plan.repositoryId,
      github: journal.plan.repository,
      role: 'authority',
      defaultBranch: journal.plan.defaultBranch,
    }],
  }
  const repoById = new Map(historicalInventory.repositories.map(repo => [repo.id, repo]))
  for (const action of journal.actions) validateManagedAction(action, repoById, desired ?? {
    managedRulesetPrefix: 'fleet/',
    managedEnvironmentNames: journal.plan.projection.environments.map(item => item.name),
  })
  invariant(new Set(journal.actions.map(action => action.actionId)).size === journal.actions.length,
    'authority policy bootstrap journal contains duplicate action ids')
  const expectedActions = journal.plan.actions.map((action, index) => ({
    ...clone(action),
    actionId: `${journal.plan.repositoryId}:${String(index + 1).padStart(3, '0')}:${action.kind}:${action.resource}`,
    github: journal.plan.repository,
    repoId: journal.plan.repositoryId,
  }))
  invariant(deepEqual(journal.actions.map(fixedAction), expectedActions.map(fixedAction)),
    'authority policy bootstrap journal actions differ from the reviewed plan')
  invariant(deepEqual(journal.rollbackPlan, rollbackPlanFor(journal.actions))
    && journal.rollbackPlanDigest === rollbackPlanDigest(journal.rollbackPlan),
  'authority policy bootstrap journal rollback plan is invalid')
  invariant(journal.authorizationEnvelopeDigest === authorityBootstrapAuthorizationEnvelopeDigest(journal),
    'authority policy bootstrap authorization envelope digest mismatch')
  invariant(Array.isArray(journal.offHostReceipts) && journal.offHostReceipts.length === 0,
    'authority policy bootstrap local journal may not masquerade as off-host evidence')
  invariant(Array.isArray(journal.events) && journal.events.length > 0,
    'authority policy bootstrap journal lacks its append-only event chain')
  let previousDigest = JOURNAL_GENESIS_DIGEST
  let previousAt = null
  let previousRuntimeState = null
  const actionIds = journal.actions.map(action => action.actionId)
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index]
    assertClosedKeys(event, new Set(JOURNAL_EVENT_KEYS),
      `authority policy bootstrap event ${index} has an invalid or open shape`)
    invariant(event.schemaVersion === 1
      && event.sequence === index + 1
      && event.transactionId === journal.transactionId
      && event.previousDigest === previousDigest
      && event.authorizationEnvelopeDigest === journal.authorizationEnvelopeDigest
      && event.eventDigest === eventDigest(event),
    `authority policy bootstrap event ${index} chain binding is invalid`)
    const at = new Date(event.at)
    invariant(Number.isFinite(at.getTime()) && at.toISOString() === event.at
      && (!previousAt || at >= previousAt),
    `authority policy bootstrap event ${index} time is invalid or regressed`)
    validateRuntimeStateShape(event.runtimeState, actionIds)
    invariant(event.stateDigest === sha256(`fleet-reconcile-state-v2\n${stableStringify({
      authorizationEnvelopeDigest: event.authorizationEnvelopeDigest,
      runtimeState: event.runtimeState,
    }, 0)}`), `authority policy bootstrap event ${index} state digest is invalid`)
    validateRuntimeTransition(previousRuntimeState, event.runtimeState, event.type,
      event.subjectActionId, event.at)
    previousDigest = event.eventDigest
    previousAt = at
    previousRuntimeState = event.runtimeState
  }
  invariant(journal.eventHeadDigest === previousDigest
    && journal.events.at(-1).stateDigest === journalStateDigest(journal)
    && deepEqual(journal.events.at(-1).runtimeState, journalRuntimeState(journal)),
  'authority policy bootstrap latest event does not bind the current state')
  if (journal.state === 'verified') invariant(typeof journal.completedAt === 'string'
    && journal.actions.every(action => action.status === 'verified'),
  'verified authority policy bootstrap journal is incomplete')
  if (journal.state === 'failed-partial-state-possible') invariant(typeof journal.failedAt === 'string'
    && typeof journal.error === 'string' && journal.error.length > 0,
  'failed authority policy bootstrap journal lacks failure evidence')
  if (['recovery-observed', 'manual-recovery-required'].includes(journal.state)) {
    invariant(typeof journal.recoveredAt === 'string' && Array.isArray(journal.recoveryFailures),
      'recovered authority policy bootstrap journal lacks observation evidence')
  }
  if (['rolling-back', 'rolled-back-verified', 'rollback-blocked'].includes(journal.state)) {
    const latestRollbackStart = journal.events.filter(event => event.type === 'rolling-back').at(-1)
    invariant(journal.rollbackAttempted === true && typeof journal.rollbackStartedAt === 'string'
      && latestRollbackStart
      && journal.rollbackAuthorizationEventHeadDigest
        === authorityBootstrapRollbackAuthorizationDigest(journal, latestRollbackStart.previousDigest),
    'authority policy bootstrap rollback lacks its standing-delegation binding')
  }
  if (['rolled-back-verified', 'rollback-blocked'].includes(journal.state)) {
    invariant(typeof journal.rollbackCompletedAt === 'string' && Array.isArray(journal.rollbackBlockers),
      'authority policy bootstrap rollback lacks completion evidence')
  }
  if (inventory) invariant(journal.plan.inventoryDigest === sha256(stableStringify(inventory, 0)),
    'authority policy bootstrap current inventory differs from the reviewed plan')
  if (desired) invariant(journal.plan.desiredDigest === sha256(stableStringify(desired, 0)),
    'authority policy bootstrap current desired state differs from the reviewed plan')
  if (stagedRolloutPlan) {
    invariant(journal.plan.stagedRolloutPlanDigest === sha256(stableStringify(stagedRolloutPlan, 0)),
      'authority policy bootstrap current staged rollout plan differs from the reviewed plan')
    validateAuthorityBootstrapBoundary(stagedRolloutPlan.bootstrapBoundary?.githubPolicyConvergence)
  }
  if (authorityPolicyDigest) invariant(journal.plan.authorityPolicyDigest === authorityPolicyDigest,
    'authority policy bootstrap current Decision Authority source differs from the reviewed plan')
  return journal
}

export function authorityBootstrapJournalDigest(journal) {
  return sha256(`qijenchen-authority-policy-bootstrap-journal-v1\n${stableStringify(journal, 0)}`)
}

function authorityBootstrapReplayReceiptDigest(receipt) {
  const unsigned = clone(receipt)
  delete unsigned.receiptDigest
  return sha256(`qijenchen-authority-policy-bootstrap-durable-replay-v1\n${stableStringify(unsigned, 0)}`)
}

function authorityBootstrapMirrorIdentityDigest(identity) {
  validateMirrorIdentity(identity)
  return sha256(`qijenchen-authority-policy-bootstrap-mirror-identity-v1\n${stableStringify(identity, 0)}`)
}

function authorityBootstrapActivationRequirementDigest(requirement) {
  return sha256(`qijenchen-authority-policy-bootstrap-mirror-activation-v1\n${stableStringify(requirement, 0)}`)
}

function authorityBootstrapConvergenceReadback(journal, convergence) {
  invariant(
    convergence
      && /^[a-f0-9]{64}$/.test(convergence.observedStateDigest ?? '')
      && Array.isArray(convergence.actions)
      && convergence.actions.length === 0,
    'authority policy bootstrap durable replay requires exact live convergence',
  )
  return {
    repository: journal.plan.repository,
    defaultBranchHeadSha: journal.plan.defaultBranchHeadSha,
    defaultBranchTreeSha: journal.plan.defaultBranchTreeSha,
    observedStateDigest: convergence.observedStateDigest,
    remainingActionsDigest: candidateActionsDigest(convergence.actions),
    eventHeadDigest: journal.eventHeadDigest,
    genesisReadbackDigest: journal.plan.genesisReadbackDigest,
  }
}

export function resolveActivatedAuthorityBootstrapMirrorIdentity({
  activationRequirements,
  inventory,
  desired,
  rings,
  issuerRegistry,
  activationPolicy,
  mutationBoundaryContract,
  now = new Date(),
  managedCiValidationContext,
}) {
  validateExternalActivationRequirements(activationRequirements, {
    inventory,
    desired,
    rings,
    issuerRegistry,
    policy: activationPolicy,
    expectedPolicyDigest: externalActivationPolicyDigest(activationPolicy),
    expectedMutationBoundaryContractDigest: githubMutationBoundaryContractDigest(mutationBoundaryContract),
    now,
    managedCiValidationContext,
    mutationBoundaryContract,
  })
  const matches = activationRequirements.requirements.filter(requirement => (
    requirement.id === AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID
      && requirement.kind === 'durable-evidence-mirror'
      && requirement.repository === 'ajenchen/design-system'
  ))
  invariant(matches.length === 1,
    'authority policy bootstrap durable replay requires exactly one canonical mirror activation')
  const requirement = matches[0]
  invariant(requirement.status === 'activated' && requirement.evidence?.payload?.observedResource,
    'authority policy bootstrap durable replay mirror is not activated')
  const claims = requirement.evidence.payload.observedResource
  const mirrorIdentity = Object.fromEntries(MIRROR_IDENTITY_KEYS.map(key => [key, clone(claims[key])]))
  validateMirrorIdentity(mirrorIdentity)
  return {
    requirement,
    requirementDigest: authorityBootstrapActivationRequirementDigest(requirement),
    mirrorIdentity,
    mirrorIdentityDigest: authorityBootstrapMirrorIdentityDigest(mirrorIdentity),
  }
}

export function validateAuthorityBootstrapDurableReplayReceipt(receipt, {
  activationRequirement = null,
  requiredRetentionAt = null,
  requireTrustedActivation = false,
  expectedConvergenceReadback = null,
} = {}) {
  assertClosedKeys(receipt, AUTHORITY_BOOTSTRAP_REPLAY_KEYS,
    'authority policy bootstrap durable replay receipt has an invalid or open shape')
  invariant(Object.keys(receipt).length === AUTHORITY_BOOTSTRAP_REPLAY_KEYS.size,
    'authority policy bootstrap durable replay receipt is incomplete')
  invariant(receipt.schemaVersion === 1
    && receipt.kind === AUTHORITY_BOOTSTRAP_REPLAY_KIND
    && receipt.purpose === AUTHORITY_BOOTSTRAP_REPLAY_PURPOSE
    && receipt.promotionEligible === false
    && receipt.managedEvidence === true
    && receipt.managedEvidenceScope === 'signed-mirror-event-chain-and-head-only'
    && receipt.requirementId === AUTHORITY_BOOTSTRAP_MIRROR_REQUIREMENT_ID,
  'authority policy bootstrap durable replay receipt identity or evidence class is invalid')
  const journal = validateAuthorityBootstrapJournal(receipt.sourceJournal)
  invariant(journal.state === 'verified'
    && journal.actions.every(action => action.status === 'verified')
    && journal.offHostMirrored === false
    && journal.offHostReceipts.length === 0,
  'authority policy bootstrap durable replay source journal is not a complete local bootstrap transaction')
  invariant(receipt.sourceJournalDigest === authorityBootstrapJournalDigest(journal),
    'authority policy bootstrap durable replay source journal digest mismatch')
  validateMirrorIdentity(receipt.mirrorIdentity)
  invariant(receipt.protocolVersion === receipt.mirrorIdentity.protocolVersion
    && receipt.mirrorIdentityDigest === authorityBootstrapMirrorIdentityDigest(receipt.mirrorIdentity),
  'authority policy bootstrap durable replay mirror identity mismatch')
  if (requireTrustedActivation) invariant(activationRequirement,
    'trusted authority policy bootstrap durable replay validation requires the canonical activation requirement')
  if (activationRequirement) {
    invariant(activationRequirement.id === receipt.requirementId
      && activationRequirement.status === 'activated'
      && receipt.activationRequirementDigest
        === authorityBootstrapActivationRequirementDigest(activationRequirement),
    'authority policy bootstrap durable replay activation requirement is stale or substituted')
    const claims = activationRequirement.evidence?.payload?.observedResource
    const expectedIdentity = claims
      ? Object.fromEntries(MIRROR_IDENTITY_KEYS.map(key => [key, clone(claims[key])]))
      : null
    invariant(expectedIdentity && deepEqual(expectedIdentity, receipt.mirrorIdentity),
      'authority policy bootstrap durable replay mirror identity differs from canonical activation')
  } else invariant(/^[a-f0-9]{64}$/.test(receipt.activationRequirementDigest ?? ''),
    'authority policy bootstrap durable replay activation requirement digest is invalid')
  invariant(Array.isArray(receipt.eventReceipts)
    && receipt.eventReceipts.length === journal.events.length
    && new Set(receipt.eventReceipts.map(item => item.receiptId)).size === receipt.eventReceipts.length,
  'authority policy bootstrap durable replay event receipt coverage is partial or duplicated')
  const mirrorJournal = { ...journal, mirrorIdentity: clone(receipt.mirrorIdentity) }
  const requestedAt = new Date(receipt.headVerificationRequest?.requestedAt)
  invariant(Number.isFinite(requestedAt.getTime())
    && requestedAt.toISOString() === receipt.headVerificationRequest.requestedAt,
  'authority policy bootstrap durable replay head request time is invalid')
  let previousReceivedAt = null
  for (let index = 0; index < journal.events.length; index += 1) {
    const event = journal.events[index]
    const eventReceipt = receipt.eventReceipts[index]
    const receivedAt = new Date(eventReceipt?.receivedAt)
    invariant(Number.isFinite(receivedAt.getTime())
      && receivedAt.toISOString() === eventReceipt.receivedAt
      && receivedAt >= new Date(event.at)
      && (!previousReceivedAt || receivedAt >= previousReceivedAt)
      && receivedAt.getTime() <= requestedAt.getTime() + FLEET_RECONCILE_MIRROR_PROTOCOL.clockSkewMs,
    `authority policy bootstrap durable replay event ${index + 1} has invalid temporal provenance`)
    const request = eventMirrorRequest(mirrorJournal, event)
    validateOffHostReceipt(eventReceipt, {
      journal: mirrorJournal,
      event,
      mirrorIdentity: receipt.mirrorIdentity,
      request,
      at: receivedAt,
    })
    previousReceivedAt = receivedAt
  }
  invariant(receipt.eventReceiptsDigest
    === sha256(`qijenchen-authority-policy-bootstrap-event-receipts-v1\n${stableStringify(receipt.eventReceipts, 0)}`),
  'authority policy bootstrap durable replay event receipt digest mismatch')
  validateHeadVerificationRequest(receipt.headVerificationRequest, {
    journal: mirrorJournal,
    mirrorIdentity: receipt.mirrorIdentity,
    at: requestedAt,
  })
  const expectedHeadRequest = headVerificationRequest(mirrorJournal, {
    mirrorIdentity: receipt.mirrorIdentity,
    requestNonce: receipt.headVerificationRequest.requestNonce,
    requestedAt,
  })
  invariant(deepEqual(receipt.headVerificationRequest, expectedHeadRequest),
    'authority policy bootstrap durable replay head request is substituted')
  validateHeadVerification(receipt.headVerification, {
    journal: mirrorJournal,
    mirrorIdentity: receipt.mirrorIdentity,
    request: receipt.headVerificationRequest,
    at: requestedAt,
  })
  assertClosedKeys(receipt.convergenceReadback, new Set([
    'repository', 'defaultBranchHeadSha', 'defaultBranchTreeSha', 'observedStateDigest',
    'remainingActionsDigest', 'eventHeadDigest', 'genesisReadbackDigest',
  ]), 'authority policy bootstrap durable replay convergence readback has an invalid or open shape')
  invariant(
    receipt.convergenceReadback.repository === journal.plan.repository
      && receipt.convergenceReadback.defaultBranchHeadSha === journal.plan.defaultBranchHeadSha
      && receipt.convergenceReadback.defaultBranchTreeSha === journal.plan.defaultBranchTreeSha
      && /^[a-f0-9]{64}$/.test(receipt.convergenceReadback.observedStateDigest ?? '')
      && receipt.convergenceReadback.remainingActionsDigest === candidateActionsDigest([])
      && receipt.convergenceReadback.eventHeadDigest === journal.eventHeadDigest
      && receipt.convergenceReadback.genesisReadbackDigest === journal.plan.genesisReadbackDigest,
    'authority policy bootstrap durable replay convergence readback differs from its verified source transaction',
  )
  if (expectedConvergenceReadback) invariant(
    deepEqual(receipt.convergenceReadback, expectedConvergenceReadback),
    'authority policy bootstrap durable replay convergence readback differs from live exact readback',
  )
  invariant(
    receipt.convergenceReadbackDigest === sha256(
      `qijenchen-authority-policy-bootstrap-convergence-readback-v1\n${stableStringify(receipt.convergenceReadback, 0)}`,
    ),
    'authority policy bootstrap durable replay convergence readback digest mismatch',
  )
  invariant(receipt.replayedAt === receipt.headVerification.verifiedAt,
  'authority policy bootstrap durable replay completion/readback binding is invalid')
  if (requiredRetentionAt !== null) {
    const requiredAt = requiredRetentionAt instanceof Date
      ? requiredRetentionAt
      : new Date(requiredRetentionAt)
    invariant(Number.isFinite(requiredAt.getTime()),
      'authority policy bootstrap durable replay required retention time is invalid')
    for (const evidence of [...receipt.eventReceipts, receipt.headVerification]) {
      invariant(new Date(evidence.retainedUntil) >= requiredAt,
        'authority policy bootstrap durable replay retention does not cover the required boundary')
    }
  }
  invariant(receipt.receiptDigest === authorityBootstrapReplayReceiptDigest(receipt),
    'authority policy bootstrap durable replay receipt digest mismatch')
  return receipt
}

function writeAuthorityBootstrapReplayReceipt(receiptRoot, receipt) {
  const root = resolve(receiptRoot)
  mkdirSync(root, { recursive: true })
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink() && realpathSync(root) === root,
    'authority policy bootstrap durable replay receipt root is unsafe')
  const path = resolve(root, `${receipt.receiptDigest}.json`)
  invariant(dirname(path) === root,
    'authority policy bootstrap durable replay receipt path escapes its content-addressed root')
  const body = `${stableStringify(receipt)}\n`
  if (existsSync(path)) {
    invariant(readFileSync(path, 'utf8') === body,
      'authority policy bootstrap durable replay receipt CAS path contains different bytes')
    return path
  }
  const temporary = resolve(root, `.${receipt.receiptDigest}.${process.pid}.${randomUUID()}.tmp`)
  let descriptor = null
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, body)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    linkSync(temporary, path)
    unlinkSync(temporary)
    const directoryDescriptor = openSync(root, 'r')
    try { fsyncSync(directoryDescriptor) } finally { closeSync(directoryDescriptor) }
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  invariant(readFileSync(path, 'utf8') === body,
    'authority policy bootstrap durable replay receipt exact readback failed')
  return path
}

function acquireAuthorityBootstrapReplayLock(receiptRoot, replayIdentityDigest, {
  timeoutMs = 30_000,
} = {}) {
  invariant(/^[a-f0-9]{64}$/.test(replayIdentityDigest ?? ''),
    'authority policy bootstrap durable replay lock identity is invalid')
  const root = resolve(receiptRoot)
  mkdirSync(root, { recursive: true })
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink() && realpathSync(root) === root,
    'authority policy bootstrap durable replay lock root is unsafe')
  const path = resolve(root, `.${replayIdentityDigest}.lock`)
  invariant(dirname(path) === root,
    'authority policy bootstrap durable replay lock path escapes its receipt root')
  const deadline = Date.now() + timeoutMs
  const body = `${stableStringify({
    schemaVersion: 1,
    kind: 'authority-bootstrap-durable-replay-local-lock',
    replayIdentityDigest,
    pid: process.pid,
  }, 0)}\n`
  for (;;) {
    let descriptor
    try {
      descriptor = openSync(path, 'wx', 0o600)
      writeFileSync(descriptor, body)
      fsyncSync(descriptor)
      return { path, descriptor, body }
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor)
      if (error?.code !== 'EEXIST') throw error
      let owner
      try {
        const bytes = readFileSync(path, 'utf8')
        owner = JSON.parse(bytes)
        invariant(
          bytes === `${stableStringify(owner, 0)}\n`
            && owner.kind === 'authority-bootstrap-durable-replay-local-lock'
            && owner.replayIdentityDigest === replayIdentityDigest
            && Number.isSafeInteger(owner.pid)
            && owner.pid > 0,
          'authority policy bootstrap durable replay lock record is invalid',
        )
      } catch (readError) {
        throw new Error(`authority policy bootstrap durable replay lock is unreadable or untrusted: ${readError.message}`)
      }
      let ownerAlive = true
      try { process.kill(owner.pid, 0) } catch (probeError) {
        if (probeError?.code === 'ESRCH') ownerAlive = false
        else if (probeError?.code !== 'EPERM') throw probeError
      }
      if (!ownerAlive) {
        const stale = resolve(root, `.${replayIdentityDigest}.${randomUUID()}.stale-lock`)
        try {
          renameSync(path, stale)
          unlinkSync(stale)
          continue
        } catch (recoveryError) {
          if (recoveryError?.code === 'ENOENT') continue
          throw new Error(`authority policy bootstrap durable replay stale-lock recovery failed: ${recoveryError.message}`)
        }
      }
      invariant(Date.now() < deadline,
        'authority policy bootstrap durable replay lock remained held by a live process')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
}

function releaseAuthorityBootstrapReplayLock(lock) {
  try {
    invariant(readFileSync(lock.path, 'utf8') === lock.body,
      'authority policy bootstrap durable replay lock ownership changed')
    unlinkSync(lock.path)
  } finally {
    closeSync(lock.descriptor)
  }
}

function findAuthorityBootstrapReplayReceipt(receiptRoot, {
  sourceJournalDigest,
  mirrorIdentityDigest,
  activationRequirementDigest,
  activationRequirement,
  requiredRetentionAt,
  expectedConvergenceReadback,
}) {
  const root = resolve(receiptRoot)
  if (!existsSync(root)) return null
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink() && realpathSync(root) === root,
    'authority policy bootstrap durable replay receipt root is unsafe')
  const matches = []
  for (const name of readdirSync(root).sort(compareUtf8Bytes)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    const path = resolve(root, name)
    const info = lstatSync(path)
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1
      && realpathSync(path) === path,
      `authority policy bootstrap durable replay CAS entry is unsafe: ${name}`)
    const before = readFileSync(path)
    let candidate
    try {
      candidate = JSON.parse(before.toString('utf8'))
    } catch (error) {
      throw new Error(`authority policy bootstrap durable replay CAS entry is invalid JSON: ${name}: ${error.message}`)
    }
    const after = readFileSync(path)
    invariant(before.equals(after)
      && before.equals(Buffer.from(`${stableStringify(candidate)}\n`, 'utf8')),
    `authority policy bootstrap durable replay CAS entry changed or has non-canonical bytes: ${name}`)
    if (candidate?.kind !== AUTHORITY_BOOTSTRAP_REPLAY_KIND
      || candidate.sourceJournalDigest !== sourceJournalDigest
      || candidate.mirrorIdentityDigest !== mirrorIdentityDigest
      || candidate.activationRequirementDigest !== activationRequirementDigest) continue
    validateAuthorityBootstrapDurableReplayReceipt(candidate, {
      activationRequirement,
      requireTrustedActivation: true,
      requiredRetentionAt,
      expectedConvergenceReadback,
    })
    invariant(name === `${candidate.receiptDigest}.json`,
      'authority policy bootstrap durable replay receipt filename differs from its digest')
    matches.push({ path, receipt: candidate })
  }
  invariant(matches.length <= 1,
    'authority policy bootstrap durable replay has multiple receipts for one source/activation identity')
  return matches[0] ?? null
}

function appendAuthorityBootstrapEvent(path, journal, {
  type,
  subjectActionId = null,
  at,
  create = false,
}) {
  invariant(at instanceof Date && Number.isFinite(at.getTime()),
    'authority policy bootstrap event time is invalid')
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const lockPath = `${path}.append.lock`
  let lockDescriptor
  try {
    lockDescriptor = openSync(lockPath, 'wx', 0o600)
  } catch (error) {
    throw new Error(`authority policy bootstrap journal lock is unavailable: ${lockPath}: ${error.message}`)
  }
  try {
    const event = {
      schemaVersion: 1,
      sequence: journal.events.length + 1,
      transactionId: journal.transactionId,
      type,
      subjectActionId,
      at: at.toISOString(),
      previousDigest: journal.eventHeadDigest,
      authorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
      runtimeState: journalRuntimeState(journal),
      stateDigest: journalStateDigest(journal),
      mirrorRequestNonce: randomUUID(),
      eventDigest: null,
    }
    if (journal.events.length > 0) invariant(at >= new Date(journal.events.at(-1).at),
      'authority policy bootstrap event clock regressed')
    event.eventDigest = eventDigest(event)
    journal.events.push(event)
    journal.eventHeadDigest = event.eventDigest
    writeJournalSnapshot(path, journal, { create })
    return event
  } finally {
    closeSync(lockDescriptor)
    unlinkSync(lockPath)
  }
}

function assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline) {
  if (!reloadCurrentGovernance) return true
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current),
    'authority policy bootstrap governance reload returned an invalid model')
  for (const key of ['inventory', 'desired', 'stagedRolloutPlan', 'authorityPolicyDigest']) {
    invariant(Object.prototype.hasOwnProperty.call(current, key),
      `authority policy bootstrap governance reload omitted ${key}`)
    invariant(deepEqual(current[key], baseline[key]),
      `authority policy bootstrap refused: canonical source changed during transaction: ${key}`)
  }
  return true
}

function authorityBootstrapReplayTrustBaseline({
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest,
  rings,
  issuerRegistry,
  activationRequirements,
  activationPolicy,
  mutationBoundaryContract,
}) {
  return clone({
    inventory,
    desired,
    stagedRolloutPlan,
    authorityPolicyDigest,
    rings,
    issuerRegistry,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
  })
}

function assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline) {
  invariant(typeof reloadCurrentGovernance === 'function',
    'authority policy bootstrap durable replay requires a complete canonical trust reload')
  const current = reloadCurrentGovernance()
  invariant(current && typeof current === 'object' && !Array.isArray(current),
    'authority policy bootstrap durable replay trust reload returned an invalid model')
  const keys = [
    'inventory', 'desired', 'stagedRolloutPlan', 'authorityPolicyDigest', 'rings',
    'issuerRegistry', 'activationRequirements', 'activationPolicy', 'mutationBoundaryContract',
  ]
  invariant(
    Object.keys(current).length === keys.length
      && keys.every(key => Object.prototype.hasOwnProperty.call(current, key)),
    'authority policy bootstrap durable replay trust reload is incomplete or open',
  )
  for (const key of keys) invariant(
    deepEqual(current[key], baseline[key]),
    `authority policy bootstrap durable replay refused: canonical trust source changed during transaction: ${key}`,
  )
  return true
}

function recomputeAuthorityBootstrapGuard(plan, client, {
  inventory,
  desired,
  stagedRolloutPlan,
}, journal = null) {
  validateAuthorityBootstrapPlan(plan)
  const { repo, projection } = materializeAuthorityBootstrapProjection({
    inventory,
    desired,
    stagedRolloutPlan,
  })
  const observed = fetchRepositoryState(client, repo,
    authorityBootstrapMaterialized(projection), desired)
  invariant(observed.defaultBranchHeadSha === plan.defaultBranchHeadSha
    && observed.defaultBranchTreeSha === plan.defaultBranchTreeSha,
  'authority policy bootstrap live default-branch commit/tree drifted')
  const current = diffAuthorityBootstrapRepository(repo, projection, observed, desired)
  invariant(current.conflicts.length === 0,
    `authority policy bootstrap live state has conflicts: ${current.conflicts.join('; ')}`)
  if (!journal) {
    invariant(deepEqual(bindAuthorityBootstrapActions(current.actions, repo), plan.actions)
      && current.observedStateDigest === plan.observedStateDigest,
    'authority policy bootstrap live state differs from the reviewed plan')
  } else {
    const remaining = journal.actions
      .filter(action => !['verified'].includes(action.status))
    invariant(
      deepEqual(current.actions, remaining.map(originalPlanAction)),
      'authority policy bootstrap remaining live actions differ from the reviewed transaction')
    for (const action of journal.actions) {
      const expected = action.status === 'verified' ? action.expectedApplied : action.beforeImage
      invariant(deepEqual(observeActionState(client, action), expected),
        `authority policy bootstrap action-state replay differs for ${action.resource}`)
    }
  }
  return current
}

function replayAuthorityBootstrapJournalToDurableMirrorCore(journalPath, client, offHostMirror, {
  receiptRoot,
  evidenceRoot = null,
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest = null,
  rings,
  issuerRegistry,
  activationRequirements,
  activationPolicy,
  mutationBoundaryContract,
  clock = () => new Date(),
  reloadCurrentGovernance,
  managedCiValidationContext,
} = {}, productionLive) {
  invariant(typeof journalPath === 'string' && journalPath.length > 0,
    'authority policy bootstrap durable replay requires a journal path')
  if (!productionLive) invariant(typeof receiptRoot === 'string' && receiptRoot.length > 0,
    'authority policy bootstrap durable replay fixture requires a content-addressed receipt root')
  const resolvedReceiptRoot = productionLive
    ? ensureRuntimeEvidenceDirectory({
        repoRoot: resolve(GOVERNANCE_ROOT, '../..'),
        explicitRoot: evidenceRoot,
        relativePath: AUTHORITY_BOOTSTRAP_REPLAY_RECEIPT_RELATIVE_ROOT,
      })
    : resolve(receiptRoot)
  invariant(typeof resolvedReceiptRoot === 'string' && resolvedReceiptRoot.length > 0,
    'authority policy bootstrap durable replay requires a content-addressed receipt root')
  invariant(inventory && desired && stagedRolloutPlan && rings && issuerRegistry
    && activationRequirements && activationPolicy && mutationBoundaryContract,
  'authority policy bootstrap durable replay requires the complete canonical trust model')
  invariant(offHostMirror
    && typeof offHostMirror.append === 'function'
    && typeof offHostMirror.verify === 'function',
  'authority policy bootstrap durable replay requires the activated append/verify adapter')
  const resolvedAuthorityPolicyDigest = authorityPolicyDigest ?? sha256(readFileSync(DEFAULT_AUTHORITY_POLICY))
  if (productionLive) {
    invariant(authorityPolicyDigest === null
      && receiptRoot === undefined
      && (managedCiValidationContext === undefined || managedCiValidationContext === null)
      && typeof reloadCurrentGovernance === 'function',
    'live authority policy bootstrap durable replay refuses injected authority/runtime identity')
    assertTrustedLiveGitHubClient(client, 'live authority policy bootstrap durable replay')
    invariant(deepEqual(inventory, readJson(DEFAULT_INVENTORY))
      && deepEqual(desired, readJson(DEFAULT_DESIRED))
      && deepEqual(stagedRolloutPlan, readJson(DEFAULT_STAGED_ROLLOUT_PLAN))
      && deepEqual(rings, readJson(DEFAULT_RINGS))
      && deepEqual(activationRequirements, readJson(DEFAULT_EXTERNAL_ACTIVATION_REQUIREMENTS))
      && deepEqual(activationPolicy, loadExternalActivationPolicy(DEFAULT_EXTERNAL_ACTIVATION_POLICY))
      && deepEqual(mutationBoundaryContract, readJson(DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT))
      && issuerRegistryDigest(issuerRegistry) === issuerRegistryDigest(loadIssuerRegistry()),
    'live authority policy bootstrap durable replay refuses substituted canonical source objects')
  }
  const baseline = authorityBootstrapReplayTrustBaseline({
    inventory,
    desired,
    stagedRolloutPlan,
    authorityPolicyDigest: resolvedAuthorityPolicyDigest,
    rings,
    issuerRegistry,
    activationRequirements,
    activationPolicy,
    mutationBoundaryContract,
  })
  assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
  const journal = readJson(journalPath)
  validateAuthorityBootstrapJournal(journal, {
    inventory,
    desired,
    stagedRolloutPlan,
    authorityPolicyDigest: resolvedAuthorityPolicyDigest,
  })
  invariant(journal.state === 'verified'
    && journal.actions.every(action => action.status === 'verified'),
  'authority policy bootstrap durable replay requires a fully verified bootstrap journal')
  if (productionLive) verifyGitCheckoutIdentity(resolve(GOVERNANCE_ROOT, '../..'), {
    head: journal.plan.genesisReceipt.challenge.candidateHeadSha,
    tree: journal.plan.genesisReceipt.challenge.candidateHeadTree,
    label: 'live authority policy bootstrap durable replay candidate',
  })
  const startedAt = readLiveTime(clock, 'authority policy bootstrap durable replay')
  if (productionLive) invariant(
    verifyLiveControlPlaneGenesisReceipt(client, journal.plan.genesisReceipt, { now: startedAt }).readbackDigest
      === journal.plan.genesisReadbackDigest,
    'authority policy bootstrap durable replay genesis authorization changed',
  )
  assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
  const convergence = recomputeAuthorityBootstrapGuard(journal.plan, client, {
    inventory,
    desired,
    stagedRolloutPlan,
  }, journal)
  const expectedConvergenceReadback = authorityBootstrapConvergenceReadback(journal, convergence)
  const activation = resolveActivatedAuthorityBootstrapMirrorIdentity({
    activationRequirements,
    inventory,
    desired,
    rings,
    issuerRegistry,
    activationPolicy,
    mutationBoundaryContract,
    now: startedAt,
    managedCiValidationContext,
  })
  invariant(offHostMirror.adapterCommandSha256 === activation.mirrorIdentity.adapterCommandSha256,
    'authority policy bootstrap durable replay adapter differs from canonical activation')
  const sourceJournalDigest = authorityBootstrapJournalDigest(journal)
  const replayIdentityDigest = sha256(
    `qijenchen-authority-policy-bootstrap-replay-identity-v1\n${sourceJournalDigest}\n${activation.mirrorIdentityDigest}\n${activation.requirementDigest}`,
  )
  const replayLock = acquireAuthorityBootstrapReplayLock(resolvedReceiptRoot, replayIdentityDigest)
  try {
    assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
    const lockedConvergence = recomputeAuthorityBootstrapGuard(journal.plan, client, {
      inventory,
      desired,
      stagedRolloutPlan,
    }, journal)
    invariant(
      deepEqual(lockedConvergence, convergence),
      'authority policy bootstrap live convergence changed while durable replay waited for its lock',
    )
    const lockedConvergenceReadback = authorityBootstrapConvergenceReadback(
      journal,
      lockedConvergence,
    )
    const existing = findAuthorityBootstrapReplayReceipt(resolvedReceiptRoot, {
      sourceJournalDigest,
      mirrorIdentityDigest: activation.mirrorIdentityDigest,
      activationRequirementDigest: activation.requirementDigest,
      activationRequirement: activation.requirement,
      requiredRetentionAt: startedAt,
      expectedConvergenceReadback: lockedConvergenceReadback,
    })
    if (existing) return {
      replayed: false,
      existing: true,
      receiptPath: existing.path,
      receipt: existing.receipt,
    }
    const mirrorJournal = { ...journal, mirrorIdentity: clone(activation.mirrorIdentity) }
    const eventReceipts = []
    let lastLiveObservationAt = startedAt
    for (const event of journal.events) {
    assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
    const request = eventMirrorRequest(mirrorJournal, event)
    const eventReceipt = clone(offHostMirror.append(request))
    const receiptObservedAt = readLiveTime(
      clock,
      `authority policy bootstrap durable replay event ${event.sequence} acknowledgement`,
      lastLiveObservationAt,
    )
    lastLiveObservationAt = receiptObservedAt
    const receivedAt = new Date(eventReceipt?.receivedAt)
    invariant(Number.isFinite(receivedAt.getTime())
      && receivedAt.toISOString() === eventReceipt.receivedAt
      && receivedAt >= new Date(event.at),
    `authority policy bootstrap durable replay event ${event.sequence} has invalid receipt time`)
    validateOffHostReceipt(eventReceipt, {
      journal: mirrorJournal,
      event,
      mirrorIdentity: activation.mirrorIdentity,
      request,
      at: receiptObservedAt,
      requireFresh: false,
    })
    invariant(!eventReceipts.some(item => item.receiptId === eventReceipt.receiptId),
      `authority policy bootstrap durable replay reused receipt id ${eventReceipt.receiptId}`)
      eventReceipts.push(eventReceipt)
    }
    invariant(eventReceipts.length === journal.events.length,
      'authority policy bootstrap durable replay did not cover every event')
    assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
    const verificationAt = readLiveTime(
    clock,
    'authority policy bootstrap durable replay verification',
    lastLiveObservationAt,
  )
    const finalActivation = resolveActivatedAuthorityBootstrapMirrorIdentity({
    activationRequirements,
    inventory,
    desired,
    rings,
    issuerRegistry,
    activationPolicy,
    mutationBoundaryContract,
    now: verificationAt,
    managedCiValidationContext,
  })
    invariant(
    finalActivation.requirementDigest === activation.requirementDigest
      && finalActivation.mirrorIdentityDigest === activation.mirrorIdentityDigest,
    'authority policy bootstrap durable replay activation identity changed during transaction',
  )
    const headRequest = headVerificationRequest(mirrorJournal, {
    mirrorIdentity: activation.mirrorIdentity,
    requestedAt: verificationAt,
  })
    const headVerification = clone(offHostMirror.verify(headRequest))
    validateHeadVerification(headVerification, {
    journal: mirrorJournal,
    mirrorIdentity: activation.mirrorIdentity,
    request: headRequest,
    at: verificationAt,
  })
    assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
    const finalConvergence = recomputeAuthorityBootstrapGuard(journal.plan, client, {
    inventory,
    desired,
    stagedRolloutPlan,
  }, journal)
    invariant(deepEqual(finalConvergence, convergence),
      'authority policy bootstrap live convergence changed during durable replay')
    const convergenceReadback = authorityBootstrapConvergenceReadback(journal, finalConvergence)
    invariant(
      deepEqual(convergenceReadback, expectedConvergenceReadback),
      'authority policy bootstrap durable replay convergence readback changed during transaction',
    )
    const receipt = {
    schemaVersion: 1,
    kind: AUTHORITY_BOOTSTRAP_REPLAY_KIND,
    protocolVersion: activation.mirrorIdentity.protocolVersion,
    purpose: AUTHORITY_BOOTSTRAP_REPLAY_PURPOSE,
    promotionEligible: false,
    managedEvidence: true,
    managedEvidenceScope: 'signed-mirror-event-chain-and-head-only',
    requirementId: activation.requirement.id,
    activationRequirementDigest: activation.requirementDigest,
    sourceJournal: clone(journal),
    sourceJournalDigest,
    mirrorIdentity: clone(activation.mirrorIdentity),
    mirrorIdentityDigest: activation.mirrorIdentityDigest,
    eventReceipts,
    eventReceiptsDigest: sha256(
      `qijenchen-authority-policy-bootstrap-event-receipts-v1\n${stableStringify(eventReceipts, 0)}`,
    ),
    headVerificationRequest: headRequest,
    headVerification,
    replayedAt: headVerification.verifiedAt,
    convergenceReadback,
    convergenceReadbackDigest: sha256(
      `qijenchen-authority-policy-bootstrap-convergence-readback-v1\n${stableStringify(convergenceReadback, 0)}`,
    ),
    receiptDigest: null,
  }
    receipt.receiptDigest = authorityBootstrapReplayReceiptDigest(receipt)
    validateAuthorityBootstrapDurableReplayReceipt(receipt, {
    activationRequirement: activation.requirement,
    requireTrustedActivation: true,
    requiredRetentionAt: verificationAt,
    expectedConvergenceReadback: convergenceReadback,
  })
    assertAuthorityBootstrapReplayTrustCurrent(reloadCurrentGovernance, baseline)
    const receiptPath = writeAuthorityBootstrapReplayReceipt(resolvedReceiptRoot, receipt)
    const readback = readJson(receiptPath)
    validateAuthorityBootstrapDurableReplayReceipt(readback, {
    activationRequirement: activation.requirement,
    requireTrustedActivation: true,
    requiredRetentionAt: verificationAt,
    expectedConvergenceReadback: convergenceReadback,
  })
    invariant(deepEqual(readback, receipt),
      'authority policy bootstrap durable replay receipt readback differs from produced evidence')
    return {
      replayed: true,
      existing: false,
      receiptPath,
      receipt,
    }
  } finally {
    releaseAuthorityBootstrapReplayLock(replayLock)
  }
}

function applyAuthorityBootstrapPlanCore(plan, client, {
  journalPath,
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest = null,
  clock = () => new Date(),
  reloadCurrentGovernance,
} = {}, productionLive) {
  invariant(journalPath, 'authority policy bootstrap apply requires a journal path')
  invariant(inventory && desired && stagedRolloutPlan,
    'authority policy bootstrap apply requires canonical inventory, desired state, and staged rollout plan')
  invariant(!existsSync(journalPath),
    `authority policy bootstrap journal path already exists and is immutable: ${journalPath}`)
  const resolvedAuthorityPolicyDigest = authorityPolicyDigest ?? sha256(readFileSync(DEFAULT_AUTHORITY_POLICY))
  if (productionLive) invariant(authorityPolicyDigest === null,
    'live authority policy bootstrap refuses an injected Decision Authority digest')
  if (productionLive) assertTrustedLiveGitHubClient(client, 'live authority policy bootstrap apply')
  if (productionLive) verifyGitCheckoutIdentity(resolve(GOVERNANCE_ROOT, '../..'), {
    head: plan.genesisReceipt.challenge.candidateHeadSha,
    tree: plan.genesisReceipt.challenge.candidateHeadTree,
    label: 'live authority policy bootstrap apply candidate',
  })
  if (productionLive) invariant(deepEqual(inventory, readJson(DEFAULT_INVENTORY))
    && deepEqual(desired, readJson(DEFAULT_DESIRED))
    && deepEqual(stagedRolloutPlan, readJson(DEFAULT_STAGED_ROLLOUT_PLAN)),
  'live authority policy bootstrap apply refuses substituted canonical source objects')
  invariant(!productionLive || typeof reloadCurrentGovernance === 'function',
    'live authority policy bootstrap requires per-write canonical source reload')
  validateAuthorityBootstrapPlan(plan)
  if (productionLive) {
    const liveGenesisReadback = verifyLiveControlPlaneGenesisReceipt(client, plan.genesisReceipt)
    invariant(plan.genesisReadbackTrust === 'github-live'
      && plan.genesisReadbackDigest === liveGenesisReadback.readbackDigest,
    'live authority policy bootstrap genesis GitHub readback differs from the reviewed plan')
  }
  invariant(plan.inventoryDigest === sha256(stableStringify(inventory, 0))
    && plan.desiredDigest === sha256(stableStringify(desired, 0))
    && plan.stagedRolloutPlanDigest === sha256(stableStringify(stagedRolloutPlan, 0))
    && plan.authorityPolicyDigest === resolvedAuthorityPolicyDigest,
  'authority policy bootstrap plan differs from current canonical source')
  invariant(plan.conflicts.length === 0,
    `authority policy bootstrap plan has conflicts: ${plan.conflicts.join('; ')}`)
  const baseline = clone({
    inventory,
    desired,
    stagedRolloutPlan,
    authorityPolicyDigest: resolvedAuthorityPolicyDigest,
  })
  assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
  recomputeAuthorityBootstrapGuard(plan, client, { inventory, desired, stagedRolloutPlan })
  const initialAt = readLiveTime(clock, 'authority policy bootstrap apply')
  const actions = plan.actions.map(action => ({
    ...clone(action),
    status: 'pending',
  }))
  const journal = {
    schemaVersion: 1,
    kind: AUTHORITY_BOOTSTRAP_TRANSACTION_KIND,
    transactionClass: AUTHORITY_BOOTSTRAP_TRANSACTION_CLASS,
    durabilityClass: AUTHORITY_BOOTSTRAP_DURABILITY_CLASS,
    offHostMirrored: false,
    promotionEligible: false,
    managedEvidence: false,
    transactionId: `github-reconcile-${initialAt.getTime()}-${plan.planDigest.slice(0, 12)}`,
    plan: clone(plan),
    planDigest: plan.planDigest,
    state: 'prepared',
    startedAt: initialAt.toISOString(),
    rollbackAttempted: false,
    recoveryInstruction: 'This bootstrap-local journal is non-promotion evidence. Recover by exact live readback; before candidate-freeze, replay its event chain through the canonical durable external ledger and bind the resulting receipt.',
    actions,
    rollbackPlan: rollbackPlanFor(actions),
    rollbackPlanDigest: null,
    authorizationEnvelopeDigest: null,
    events: [],
    eventHeadDigest: JOURNAL_GENESIS_DIGEST,
    offHostReceipts: [],
  }
  journal.rollbackPlanDigest = rollbackPlanDigest(journal.rollbackPlan)
  journal.authorizationEnvelopeDigest = authorityBootstrapAuthorizationEnvelopeDigest(journal)
  appendAuthorityBootstrapEvent(journalPath, journal, {
    type: 'prepared',
    at: initialAt,
    create: true,
  })
  validateAuthorityBootstrapJournal(journal, {
    inventory, desired, stagedRolloutPlan,
    authorityPolicyDigest: resolvedAuthorityPolicyDigest,
  })
  let lastEventAt = initialAt
  try {
    journal.state = 'applying'
    appendAuthorityBootstrapEvent(journalPath, journal, { type: 'applying', at: initialAt })
    for (const action of journal.actions) {
      const decisionAt = readLiveTime(clock, 'authority policy bootstrap apply', lastEventAt)
      assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
      if (productionLive) invariant(
        verifyLiveControlPlaneGenesisReceipt(client, plan.genesisReceipt, { now: decisionAt }).readbackDigest
          === plan.genesisReadbackDigest,
        'authority policy bootstrap genesis authorization changed before mutation',
      )
      recomputeAuthorityBootstrapGuard(plan, client, {
        inventory, desired, stagedRolloutPlan,
      }, journal)
      invariant(deepEqual(observeActionState(client, action), action.beforeImage),
        `authority policy bootstrap pre-apply drift for ${action.resource}`)
      action.status = 'applying'
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'action-applying',
        subjectActionId: action.actionId,
        at: decisionAt,
      })
      lastEventAt = decisionAt
      const mutationAt = readLiveTime(clock, 'authority policy bootstrap mutation', decisionAt)
      lastEventAt = mutationAt
      assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
      if (productionLive) invariant(
        verifyLiveControlPlaneGenesisReceipt(client, plan.genesisReceipt, { now: mutationAt }).readbackDigest
          === plan.genesisReadbackDigest,
        'authority policy bootstrap genesis authorization changed at mutation boundary',
      )
      recomputeAuthorityBootstrapGuard(plan, client, {
        inventory, desired, stagedRolloutPlan,
      }, journal)
      validateAuthorityBootstrapJournal(journal, {
        inventory, desired, stagedRolloutPlan,
        authorityPolicyDigest: resolvedAuthorityPolicyDigest,
      })
      invariant(deepEqual(observeActionState(client, action), action.beforeImage),
        `authority policy bootstrap mutation-boundary drift for ${action.resource}`)
      const response = client.request(action.method, action.path, action.body)
      action.responseId = response?.id ?? null
      action.readbackPath = readbackPath(action, response)
      action.status = 'applied-unverified'
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'action-applied-unverified',
        subjectActionId: action.actionId,
        at: mutationAt,
      })
      invariant(verifyAppliedAction(client, action),
        `authority policy bootstrap exact readback mismatch for ${action.resource}`)
      action.status = 'verified'
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'action-verified',
        subjectActionId: action.actionId,
        at: mutationAt,
      })
    }
    journal.state = 'verified'
    const completedAt = readLiveTime(clock, 'authority policy bootstrap completion', lastEventAt)
    journal.completedAt = completedAt.toISOString()
    appendAuthorityBootstrapEvent(journalPath, journal, { type: 'verified', at: completedAt })
    validateAuthorityBootstrapJournal(journal, {
      inventory, desired, stagedRolloutPlan,
      authorityPolicyDigest: resolvedAuthorityPolicyDigest,
    })
    return {
      applied: true,
      promotionEligible: false,
      managedEvidence: false,
      transactionId: journal.transactionId,
      journalPath,
      eventHeadDigest: journal.eventHeadDigest,
      actions: journal.actions.map(action => ({
        repoId: action.repoId,
        kind: action.kind,
        resource: action.resource,
      })),
    }
  } catch (error) {
    journal.state = 'failed-partial-state-possible'
    const failedAt = readLiveTime(clock, 'authority policy bootstrap failure journal', lastEventAt)
    journal.failedAt = failedAt.toISOString()
    journal.error = error.message
    appendAuthorityBootstrapEvent(journalPath, journal, {
      type: 'failed-partial-state-possible',
      at: failedAt,
    })
    throw new Error(`authority policy bootstrap failed; exact recovery or compensating rollback is required: ${error.message}`, { cause: error })
  }
}

function recoverAuthorityBootstrapTransactionCore(journalPath, client, {
  clock = () => new Date(),
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest = null,
  reloadCurrentGovernance,
} = {}, productionLive) {
  const resolvedAuthorityPolicyDigest = authorityPolicyDigest ?? sha256(readFileSync(DEFAULT_AUTHORITY_POLICY))
  if (productionLive) invariant(authorityPolicyDigest === null
    && inventory && desired && stagedRolloutPlan
    && typeof reloadCurrentGovernance === 'function',
  'live authority policy bootstrap recovery requires canonical source reload and refuses injected authority identity')
  if (productionLive) {
    assertTrustedLiveGitHubClient(client, 'live authority policy bootstrap recovery')
    invariant(deepEqual(inventory, readJson(DEFAULT_INVENTORY))
      && deepEqual(desired, readJson(DEFAULT_DESIRED))
      && deepEqual(stagedRolloutPlan, readJson(DEFAULT_STAGED_ROLLOUT_PLAN)),
    'live authority policy bootstrap recovery refuses substituted canonical source objects')
  }
  const baseline = inventory && desired && stagedRolloutPlan
    ? clone({
        inventory,
        desired,
        stagedRolloutPlan,
        authorityPolicyDigest: resolvedAuthorityPolicyDigest,
      })
    : null
  if (baseline) assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
  const journal = readJson(journalPath)
  if (productionLive) verifyGitCheckoutIdentity(resolve(GOVERNANCE_ROOT, '../..'), {
    head: journal.plan?.genesisReceipt?.challenge?.candidateHeadSha,
    tree: journal.plan?.genesisReceipt?.challenge?.candidateHeadTree,
    label: 'live authority policy bootstrap recovery candidate',
  })
  validateAuthorityBootstrapJournal(journal, baseline ?? {})
  invariant(['prepared', 'applying', 'failed-partial-state-possible'].includes(journal.state),
    `authority policy bootstrap recovery refused from state ${journal.state}`)
  const observationAt = readLiveTime(clock, 'authority policy bootstrap recovery',
    new Date(journal.events.at(-1).at))
  const failures = []
  for (const action of journal.actions) {
    try {
      const remote = observeActionState(client, action)
      action.recoveryObservation = remote
      if (deepEqual(remote, action.expectedApplied)) action.status = 'verified'
      else if (deepEqual(remote, action.beforeImage)) action.status = 'not-applied'
      else failures.push(`${action.repoId}/${action.resource}: remote state matches neither before-image nor expected state`)
    } catch (error) {
      failures.push(`${action.repoId}/${action.resource}: ${error.message}`)
    }
  }
  journal.state = failures.length === 0 ? 'recovery-observed' : 'manual-recovery-required'
  journal.recoveredAt = observationAt.toISOString()
  journal.recoveryFailures = failures
  if (baseline) assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
  appendAuthorityBootstrapEvent(journalPath, journal, {
    type: journal.state,
    at: observationAt,
  })
  validateAuthorityBootstrapJournal(journal, baseline ?? {})
  return {
    observed: failures.length === 0,
    rolledBack: false,
    failures,
    journalPath,
    eventHeadDigest: journal.eventHeadDigest,
  }
}

function rollbackAuthorityBootstrapTransactionCore(journalPath, client, {
  clock = () => new Date(),
  inventory,
  desired,
  stagedRolloutPlan,
  authorityPolicyDigest = null,
  reloadCurrentGovernance,
} = {}, productionLive) {
  const resolvedAuthorityPolicyDigest = authorityPolicyDigest ?? sha256(readFileSync(DEFAULT_AUTHORITY_POLICY))
  if (productionLive) invariant(authorityPolicyDigest === null
    && inventory && desired && stagedRolloutPlan
    && typeof reloadCurrentGovernance === 'function',
  'live authority policy bootstrap rollback requires canonical source reload and refuses injected authority identity')
  if (productionLive) {
    assertTrustedLiveGitHubClient(client, 'live authority policy bootstrap rollback')
    invariant(deepEqual(inventory, readJson(DEFAULT_INVENTORY))
      && deepEqual(desired, readJson(DEFAULT_DESIRED))
      && deepEqual(stagedRolloutPlan, readJson(DEFAULT_STAGED_ROLLOUT_PLAN)),
    'live authority policy bootstrap rollback refuses substituted canonical source objects')
  }
  const baseline = inventory && desired && stagedRolloutPlan
    ? clone({
        inventory,
        desired,
        stagedRolloutPlan,
        authorityPolicyDigest: resolvedAuthorityPolicyDigest,
      })
    : null
  if (baseline) assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
  const journal = readJson(journalPath)
  if (productionLive) verifyGitCheckoutIdentity(resolve(GOVERNANCE_ROOT, '../..'), {
    head: journal.plan?.genesisReceipt?.challenge?.candidateHeadSha,
    tree: journal.plan?.genesisReceipt?.challenge?.candidateHeadTree,
    label: 'live authority policy bootstrap rollback candidate',
  })
  validateAuthorityBootstrapJournal(journal, baseline ?? {})
  invariant([
    'failed-partial-state-possible', 'recovery-observed',
    'manual-recovery-required', 'rollback-blocked',
  ].includes(journal.state),
  `authority policy bootstrap rollback refused from state ${journal.state}`)
  const startedAt = readLiveTime(clock, 'authority policy bootstrap rollback',
    new Date(journal.events.at(-1).at))
  journal.rollbackAttempted = true
  journal.rollbackAuthorizationEventHeadDigest = authorityBootstrapRollbackAuthorizationDigest(
    journal,
    journal.eventHeadDigest,
  )
  journal.rollbackStartedAt = startedAt.toISOString()
  journal.state = 'rolling-back'
  appendAuthorityBootstrapEvent(journalPath, journal, {
    type: 'rolling-back',
    at: startedAt,
  })
  let lastEventAt = startedAt
  const byId = new Map(journal.actions.map(action => [action.actionId, action]))
  const blocked = []
  for (const step of journal.rollbackPlan) {
    const action = byId.get(step.actionId)
    invariant(action, `authority policy bootstrap rollback references missing action ${step.actionId}`)
    const decisionAt = readLiveTime(clock, 'authority policy bootstrap rollback', lastEventAt)
    let actionLastEventAt = decisionAt
    try {
      if (baseline) assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
      const remote = observeActionState(client, action)
      if (deepEqual(remote, action.beforeImage)) {
        action.rollbackStatus = 'already-at-before-image'
        appendAuthorityBootstrapEvent(journalPath, journal, {
          type: 'rollback-already-restored',
          subjectActionId: action.actionId,
          at: decisionAt,
        })
        lastEventAt = decisionAt
        continue
      }
      if (!deepEqual(remote, action.expectedApplied)) {
        blocked.push(`${action.repoId}/${action.resource}: rollback drift`)
        action.rollbackStatus = 'blocked-drift'
        appendAuthorityBootstrapEvent(journalPath, journal, {
          type: 'rollback-blocked-drift',
          subjectActionId: action.actionId,
          at: decisionAt,
        })
        lastEventAt = decisionAt
        continue
      }
      invariant(step.compensation.safety === 'automatic',
        `authority policy bootstrap rollback contains a non-automatic compensation for ${action.resource}`)
      action.rollbackStatus = 'compensating'
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'rollback-compensating',
        subjectActionId: action.actionId,
        at: decisionAt,
      })
      const mutationAt = readLiveTime(clock, 'authority policy bootstrap rollback mutation',
        decisionAt)
      actionLastEventAt = mutationAt
      lastEventAt = mutationAt
      if (baseline) assertAuthorityBootstrapSourcesCurrent(reloadCurrentGovernance, baseline)
      validateAuthorityBootstrapJournal(journal, baseline ?? {})
      const mutationRemote = observeActionState(client, action)
      if (!deepEqual(mutationRemote, action.expectedApplied)) {
        if (deepEqual(mutationRemote, action.beforeImage)) {
          action.rollbackStatus = 'already-at-before-image'
          appendAuthorityBootstrapEvent(journalPath, journal, {
            type: 'rollback-already-restored',
            subjectActionId: action.actionId,
            at: mutationAt,
          })
        } else {
          blocked.push(`${action.repoId}/${action.resource}: rollback mutation-boundary drift`)
          action.rollbackStatus = 'blocked-drift'
          appendAuthorityBootstrapEvent(journalPath, journal, {
            type: 'rollback-blocked-drift',
            subjectActionId: action.actionId,
            at: mutationAt,
          })
        }
        lastEventAt = mutationAt
        continue
      }
      const path = step.compensation.pathSource === 'readbackPath'
        ? action.readbackPath
        : step.compensation.path
      invariant(path, `authority policy bootstrap rollback path unavailable for ${action.resource}`)
      const response = client.request(step.compensation.method, path, step.compensation.body)
      if (step.compensation.recreatedResource && response?.id) {
        action.readbackPath = `/repos/${action.github}/rulesets/${response.id}`
      }
      invariant(deepEqual(observeActionState(client, action), action.beforeImage),
        `authority policy bootstrap rollback exact readback mismatch for ${action.resource}`)
      action.rollbackStatus = 'rolled-back-verified'
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'rollback-action-verified',
        subjectActionId: action.actionId,
        at: mutationAt,
      })
      lastEventAt = mutationAt
    } catch (error) {
      blocked.push(`${action.repoId}/${action.resource}: ${error.message}`)
      action.rollbackStatus = 'blocked-error'
      const blockedAt = readLiveTime(
        clock,
        'authority policy bootstrap rollback failure',
        actionLastEventAt,
      )
      appendAuthorityBootstrapEvent(journalPath, journal, {
        type: 'rollback-blocked-error',
        subjectActionId: action.actionId,
        at: blockedAt,
      })
      lastEventAt = blockedAt
    }
  }
  const completedAt = readLiveTime(clock, 'authority policy bootstrap rollback completion',
    lastEventAt)
  journal.rollbackCompletedAt = completedAt.toISOString()
  journal.rollbackBlockers = blocked
  journal.state = blocked.length === 0 ? 'rolled-back-verified' : 'rollback-blocked'
  appendAuthorityBootstrapEvent(journalPath, journal, {
    type: journal.state,
    at: completedAt,
  })
  validateAuthorityBootstrapJournal(journal, baseline ?? {})
  return {
    rolledBack: blocked.length === 0,
    blocked,
    journalPath,
    eventHeadDigest: journal.eventHeadDigest,
  }
}

// Production entrypoints always enforce live identity derivation. The fixture seam is
// separately named and cannot weaken these entrypoints through a caller-supplied flag
// or by substituting a client with a misleading prototype.
export function resolveRuntimeValidationContext(options) {
  return resolveRuntimeValidationContextCore(options, true)
}

export function buildPlan(options) {
  return buildPlanCore(options, true)
}

export function applyPlan(plan, client, options) {
  return applyPlanCore(plan, client, options, true)
}

export function recoverTransaction(journalPath, client, options) {
  return recoverTransactionCore(journalPath, client, options, true)
}

export function rollbackTransaction(journalPath, client, options) {
  return rollbackTransactionCore(journalPath, client, options, true)
}

export function applyAuthorityBootstrapPlan(plan, client, options) {
  return applyAuthorityBootstrapPlanCore(plan, client, options, true)
}

export function recoverAuthorityBootstrapTransaction(journalPath, client, options) {
  return recoverAuthorityBootstrapTransactionCore(journalPath, client, options, true)
}

export function rollbackAuthorityBootstrapTransaction(journalPath, client, options) {
  return rollbackAuthorityBootstrapTransactionCore(journalPath, client, options, true)
}

export function replayAuthorityBootstrapJournalToDurableMirror(journalPath, client, offHostMirror, options) {
  return replayAuthorityBootstrapJournalToDurableMirrorCore(
    journalPath,
    client,
    offHostMirror,
    options,
    true,
  )
}

export const reconcileFixtureTestHarness = Object.freeze({
  validatePartialInventoryModel(inventory, desired, rings, certifications, waivers, now = new Date(), issuerRegistry = loadIssuerRegistry(), runtimeProfile, runtimeValidationContext = {}) {
    return validateModelCore(inventory, desired, rings, certifications, waivers, now, issuerRegistry, runtimeProfile, runtimeValidationContext, false)
  },
  resolveRuntimeValidationContext(options) {
    return resolveRuntimeValidationContextCore(options, false)
  },
  buildPlan(options) {
    return buildPlanCore(options, false)
  },
  buildAuthorityBootstrapPlan(options) {
    return buildAuthorityBootstrapPlanCore(options, false)
  },
  applyPlan(plan, client, options) {
    return applyPlanCore(plan, client, options, false)
  },
  applyAuthorityBootstrapPlan(plan, client, options) {
    return applyAuthorityBootstrapPlanCore(plan, client, options, false)
  },
  recoverTransaction(journalPath, client, options) {
    return recoverTransactionCore(journalPath, client, options, false)
  },
  recoverAuthorityBootstrapTransaction(journalPath, client, options) {
    return recoverAuthorityBootstrapTransactionCore(journalPath, client, options, false)
  },
  rollbackTransaction(journalPath, client, options) {
    return rollbackTransactionCore(journalPath, client, options, false)
  },
  rollbackAuthorityBootstrapTransaction(journalPath, client, options) {
    return rollbackAuthorityBootstrapTransactionCore(journalPath, client, options, false)
  },
  replayAuthorityBootstrapJournalToDurableMirror(journalPath, client, offHostMirror, options) {
    return replayAuthorityBootstrapJournalToDurableMirrorCore(
      journalPath,
      client,
      offHostMirror,
      options,
      false,
    )
  },
})

function printPlan(plan) {
  const inventory = plan.summary.registeredInventory
  const wave = plan.summary.selectedWave
  console.log(`GitHub reconciliation plan ${plan.planDigest}: registered opt-in scope ${inventory.repositories}/${plan.scope.registeredRepositoryCount} repo(s), ${inventory.managedChanges} managed change(s) (${inventory.candidateActions} reversible candidate, ${inventory.deferredActions} deferred irreversible), ${inventory.conflicts} repository conflict(s); selected wave ${wave.repositories} repo(s), ${wave.managedChanges} managed change(s), ${wave.conflicts} conflict(s); ${plan.summary.rolloutBlockers} rollout blocker(s). Unregistered descendants are not covered.`)
  for (const repo of plan.repoPlans) {
    console.log(`\n${repo.repoId} (${repo.github}) [eligible=${repo.eligibility.eligible}]`)
    for (const conflict of repo.conflicts) console.log(`  BLOCK ${conflict}`)
    for (const action of repo.actions) console.log(`  ${action.kind} ${action.resource}`)
    for (const action of repo.deferredActions) console.log(`  DEFER irreversible ${action.kind} ${action.resource}`)
    if (repo.actions.length === 0 && repo.deferredActions.length === 0 && repo.conflicts.length === 0) console.log('  aligned')
  }
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv, {
    apply: 'boolean', json: 'boolean', repo: 'string', inventory: 'string', desired: 'string', rings: 'string', certifications: 'string', waivers: 'string', journal: 'string', 'recover-journal': 'string', 'rollback-journal': 'string', 'rollback-authorization': 'string', 'privileged-policy': 'string', 'issuer-registry': 'string', 'fixture-dir': 'string', 'external-activation-requirements': 'string', 'external-activation-policy': 'string', 'mutation-boundary-contract': 'string', 'off-host-mirror-command': 'string', 'off-host-mirror-token-env': 'string', 'authority-bootstrap': 'boolean', 'genesis-receipt': 'string', 'staged-rollout-plan': 'string', 'replay-authority-bootstrap-journal': 'string', 'evidence-root': 'string',
  })
  invariant(flags._.length === 0, `Unexpected arguments: ${flags._.join(' ')}`)
  invariant(!flags['evidence-root'] || flags['replay-authority-bootstrap-journal'],
    '--evidence-root is accepted only for authority policy bootstrap durable replay')
  invariant(!(flags['fixture-dir'] && (flags.apply || flags['recover-journal'] || flags['rollback-journal'] || flags['replay-authority-bootstrap-journal'])), 'Fixture API clients are plan/test-only and cannot produce apply, recovery, rollback, or durable replay artifacts')
  const client = flags['fixture-dir'] ? new FixtureApiClient(resolve(flags['fixture-dir'])) : new GhApiClient()
  invariant(
    Boolean(flags['off-host-mirror-command']) === Boolean(flags['off-host-mirror-token-env']),
    'Off-host mirror command and token environment name must be supplied together',
  )
  const mirrorTokenEnvironmentName = flags['off-host-mirror-token-env']
  if (mirrorTokenEnvironmentName !== undefined) {
    invariant(
      /^[A-Z][A-Z0-9_]{0,127}$/.test(mirrorTokenEnvironmentName)
        && /(?:TOKEN|SECRET|PASSWORD|API_KEY)$/.test(mirrorTokenEnvironmentName),
      'Off-host mirror token environment name is invalid',
    )
  }
  const offHostMirror = flags['off-host-mirror-command']
    ? new CommandOffHostMirror(resolve(flags['off-host-mirror-command']), {
        credential: process.env[mirrorTokenEnvironmentName],
      })
    : null
  if (flags['replay-authority-bootstrap-journal']) {
    invariant(!flags.apply && !flags['recover-journal'] && !flags['rollback-journal']
      && !flags['authority-bootstrap'],
    '--replay-authority-bootstrap-journal cannot be combined with another mutation mode')
    invariant(!flags.inventory && !flags.desired && !flags.rings && !flags.certifications
      && !flags.waivers && !flags['issuer-registry'] && !flags['external-activation-requirements']
      && !flags['external-activation-policy'] && !flags['mutation-boundary-contract']
      && !flags['staged-rollout-plan'],
    'authority policy bootstrap durable replay refuses substituted canonical source paths')
    invariant(offHostMirror,
      'authority policy bootstrap durable replay requires the activated off-host mirror adapter')
    const replayInventory = readJson(DEFAULT_INVENTORY)
    const replayDesired = readJson(DEFAULT_DESIRED)
    const replayStagedRolloutPlan = readJson(DEFAULT_STAGED_ROLLOUT_PLAN)
    const replayRings = readJson(DEFAULT_RINGS)
    const replayIssuerRegistry = loadIssuerRegistry()
    const replayActivationRequirements = readJson(DEFAULT_EXTERNAL_ACTIVATION_REQUIREMENTS)
    const replayActivationPolicy = loadExternalActivationPolicy(DEFAULT_EXTERNAL_ACTIVATION_POLICY)
    const replayMutationBoundaryContract = readJson(DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT)
    const result = replayAuthorityBootstrapJournalToDurableMirror(
      resolve(flags['replay-authority-bootstrap-journal']),
      client,
      offHostMirror,
      {
        evidenceRoot: flags['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
        inventory: replayInventory,
        desired: replayDesired,
        stagedRolloutPlan: replayStagedRolloutPlan,
        rings: replayRings,
        issuerRegistry: replayIssuerRegistry,
        activationRequirements: replayActivationRequirements,
        activationPolicy: replayActivationPolicy,
        mutationBoundaryContract: replayMutationBoundaryContract,
        reloadCurrentGovernance: () => ({
          inventory: readJson(DEFAULT_INVENTORY),
          desired: readJson(DEFAULT_DESIRED),
          stagedRolloutPlan: readJson(DEFAULT_STAGED_ROLLOUT_PLAN),
          authorityPolicyDigest: sha256(readFileSync(DEFAULT_AUTHORITY_POLICY)),
          rings: readJson(DEFAULT_RINGS),
          issuerRegistry: loadIssuerRegistry(),
          activationRequirements: readJson(DEFAULT_EXTERNAL_ACTIVATION_REQUIREMENTS),
          activationPolicy: loadExternalActivationPolicy(DEFAULT_EXTERNAL_ACTIVATION_POLICY),
          mutationBoundaryContract: readJson(DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT),
        }),
      },
    )
    console.log(flags.json
      ? stableStringify(result)
      : `Authority bootstrap durable replay ${result.existing ? 'read back' : 'completed'}: ${result.receiptPath}`)
    return { result, client }
  }
  if (flags['recover-journal']) {
    invariant(!flags.apply && !flags['rollback-journal'], '--recover-journal cannot be combined with --apply or --rollback-journal')
    const recoveryJournalPath = resolve(flags['recover-journal'])
    const recoveryJournal = readJson(recoveryJournalPath)
    if (recoveryJournal?.kind === AUTHORITY_BOOTSTRAP_TRANSACTION_KIND) {
      invariant(!flags.inventory && !flags.desired && !flags['staged-rollout-plan'],
        'authority policy bootstrap recovery refuses substituted canonical source paths')
      invariant(!offHostMirror, 'authority policy bootstrap recovery does not accept or fabricate off-host managed evidence')
      const recoveryInventory = readJson(DEFAULT_INVENTORY)
      const recoveryDesired = readJson(DEFAULT_DESIRED)
      const recoveryStagedRolloutPlan = readJson(DEFAULT_STAGED_ROLLOUT_PLAN)
      const result = recoverAuthorityBootstrapTransaction(recoveryJournalPath, client, {
        inventory: recoveryInventory,
        desired: recoveryDesired,
        stagedRolloutPlan: recoveryStagedRolloutPlan,
        reloadCurrentGovernance: () => ({
          inventory: readJson(DEFAULT_INVENTORY),
          desired: readJson(DEFAULT_DESIRED),
          stagedRolloutPlan: readJson(DEFAULT_STAGED_ROLLOUT_PLAN),
          authorityPolicyDigest: sha256(readFileSync(DEFAULT_AUTHORITY_POLICY)),
        }),
      })
      console.log(flags.json ? stableStringify(result) : `${result.observed ? 'Bootstrap recovery state observed' : 'Bootstrap manual recovery required'}: ${result.journalPath}`)
      if (!result.observed) process.exitCode = 2
      return { result, client }
    }
    const recoveryIssuerRegistryPath = flags['issuer-registry'] ? resolve(flags['issuer-registry']) : null
    const recoveryIssuerRegistry = recoveryIssuerRegistryPath ? loadIssuerRegistry(recoveryIssuerRegistryPath) : loadIssuerRegistry()
    const result = recoverTransaction(recoveryJournalPath, client, {
      issuerRegistry: recoveryIssuerRegistry,
      offHostMirror,
      reloadIssuerRegistry: () => recoveryIssuerRegistryPath ? loadIssuerRegistry(recoveryIssuerRegistryPath) : loadIssuerRegistry(),
    })
    console.log(flags.json ? stableStringify(result) : `${result.observed ? 'Recovery state observed (no rollback claimed)' : 'Manual recovery required'}: ${result.journalPath}`)
    if (!result.observed) process.exitCode = 2
    return { result, client }
  }
  const inventoryPath = resolve(flags.inventory ?? DEFAULT_INVENTORY)
  const desiredPath = resolve(flags.desired ?? DEFAULT_DESIRED)
  const ringsPath = resolve(flags.rings ?? DEFAULT_RINGS)
  const certificationsPath = resolve(flags.certifications ?? DEFAULT_CERTIFICATIONS)
  const waiversPath = resolve(flags.waivers ?? DEFAULT_WAIVERS)
  const runtimeProfilePath = resolve(DEFAULT_RUNTIME_PROFILE)
  const issuerRegistryPath = flags['issuer-registry'] ? resolve(flags['issuer-registry']) : null
  const inventory = readJson(inventoryPath)
  const desired = readJson(desiredPath)
  const rings = readJson(ringsPath)
  const certifications = readJson(certificationsPath)
  const waivers = readJson(waiversPath)
  const runtimeProfile = readJson(runtimeProfilePath)
  const issuerRegistry = issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry()
  if (flags['rollback-journal']) {
    invariant(!flags.apply, '--rollback-journal cannot be combined with --apply')
    const rollbackJournalPath = resolve(flags['rollback-journal'])
    const rollbackJournal = readJson(rollbackJournalPath)
    if (rollbackJournal?.kind === AUTHORITY_BOOTSTRAP_TRANSACTION_KIND) {
      invariant(!flags.inventory && !flags.desired,
        'authority policy bootstrap rollback refuses substituted canonical source paths')
      invariant(!flags['rollback-authorization'], 'authority policy bootstrap rollback is bound to its genesis receipt and does not accept a substitute authorization')
      invariant(!offHostMirror, 'authority policy bootstrap rollback does not accept or fabricate off-host managed evidence')
      const stagedRolloutPlan = readJson(DEFAULT_STAGED_ROLLOUT_PLAN)
      const result = rollbackAuthorityBootstrapTransaction(rollbackJournalPath, client, {
        inventory,
        desired,
        stagedRolloutPlan,
        reloadCurrentGovernance: () => ({
          inventory: readJson(DEFAULT_INVENTORY),
          desired: readJson(DEFAULT_DESIRED),
          stagedRolloutPlan: readJson(DEFAULT_STAGED_ROLLOUT_PLAN),
          authorityPolicyDigest: sha256(readFileSync(DEFAULT_AUTHORITY_POLICY)),
        }),
      })
      console.log(flags.json ? stableStringify(result) : `${result.rolledBack ? 'Bootstrap compensating rollback readback-verified' : 'Bootstrap rollback blocked'}: ${result.journalPath}`)
      if (!result.rolledBack) process.exitCode = 2
      return { result, client }
    }
    invariant(flags['rollback-authorization'], '--rollback-journal requires --rollback-authorization')
    const liveRuntimeValidationContext = resolveRuntimeValidationContext({ client, inventory, certifications, runtimeProfile })
    validateModel(inventory, desired, rings, certifications, waivers, new Date(), issuerRegistry, runtimeProfile, liveRuntimeValidationContext)
    const recoveryAuthorization = readJson(resolve(flags['rollback-authorization']))
    const privilegedPolicyPath = resolve(flags['privileged-policy'] ?? DEFAULT_PRIVILEGED_POLICY)
    const privilegedPolicy = readJson(privilegedPolicyPath)
    const rollbackActivationPolicyPath = resolve(
      flags['external-activation-policy'] ?? DEFAULT_EXTERNAL_ACTIVATION_POLICY,
    )
    const rollbackExternalActivationPolicy = loadExternalActivationPolicy(
      rollbackActivationPolicyPath,
    )
    const result = rollbackTransaction(rollbackJournalPath, client, {
      inventory,
      desired,
      rings,
      privilegedPolicy,
      recoveryAuthorization,
      issuerRegistry,
      externalActivationPolicy: rollbackExternalActivationPolicy,
      offHostMirror,
      reloadCurrentGovernance: () => ({
        inventory: readJson(inventoryPath),
        desired: readJson(desiredPath),
        rings: readJson(ringsPath),
        privilegedPolicy: readJson(privilegedPolicyPath),
        issuerRegistry: issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry(),
        externalActivationPolicy: loadExternalActivationPolicy(rollbackActivationPolicyPath),
      }),
    })
    console.log(flags.json ? stableStringify(result) : `${result.rolledBack ? 'Compensating rollback readback-verified' : 'Rollback blocked'}: ${result.journalPath}`)
    if (!result.rolledBack) process.exitCode = 2
    return { result, client }
  }
  if (flags['authority-bootstrap']) {
    invariant(flags['genesis-receipt'], '--authority-bootstrap requires --genesis-receipt')
    invariant(!flags.repo && !flags.inventory && !flags.desired && !flags.rings
      && !flags.certifications && !flags.waivers && !flags['staged-rollout-plan'],
    '--authority-bootstrap has a closed canonical authority scope and refuses source/fleet/release overrides')
    invariant(!offHostMirror,
      '--authority-bootstrap is bootstrap-local non-promotion evidence and refuses an off-host managed-evidence adapter')
    const stagedRolloutPlanPath = resolve(flags['staged-rollout-plan'] ?? DEFAULT_STAGED_ROLLOUT_PLAN)
    const stagedRolloutPlan = readJson(stagedRolloutPlanPath)
    const genesisReceipt = readJson(resolve(flags['genesis-receipt']))
    const planBuilder = flags['fixture-dir']
      ? reconcileFixtureTestHarness.buildAuthorityBootstrapPlan
      : buildAuthorityBootstrapPlan
    const plan = planBuilder({
      inventory,
      desired,
      stagedRolloutPlan,
      genesisReceipt,
      client,
    })
    if (flags.apply) {
      invariant(!flags['fixture-dir'], 'fixture API clients cannot apply authority policy bootstrap actions')
      const journalPath = resolve(flags.journal
        ?? resolve(GOVERNANCE_ROOT, `runtime/authority-bootstrap-journal-${Date.now()}-${plan.planDigest.slice(0, 12)}.json`))
      const result = applyAuthorityBootstrapPlan(plan, client, {
        journalPath,
        inventory,
        desired,
        stagedRolloutPlan,
        reloadCurrentGovernance: () => ({
          inventory: readJson(inventoryPath),
          desired: readJson(desiredPath),
          stagedRolloutPlan: readJson(stagedRolloutPlanPath),
          authorityPolicyDigest: sha256(readFileSync(DEFAULT_AUTHORITY_POLICY)),
        }),
      })
      console.log(flags.json
        ? stableStringify({ plan, result })
        : `Authority bootstrap applied and readback-verified ${result.actions.length} action(s); journal=${journalPath}`)
      return { plan, result, client }
    }
    if (flags.json) console.log(stableStringify(plan))
    else console.log(`Authority policy bootstrap plan ${plan.planDigest}: ${plan.actions.length} reversible action(s), ${plan.conflicts.length} conflict(s); promotionEligible=false.`)
    if (plan.conflicts.length > 0) process.exitCode = 2
    return { plan, client }
  }
  // Network resolution is explicit and completes before the pure plan builder can
  // inspect or materialize any signed apply authorization.
  const verifiedReleaseEvidence = rings.candidateRelease
    ? await resolveVerifiedCandidateRelease(rings.candidateRelease)
    : null
  const planBuilder = flags['fixture-dir'] ? reconcileFixtureTestHarness.buildPlan : buildPlan
  const plan = planBuilder({ inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence, repoId: flags.repo, issuerRegistry, runtimeProfile })
  if (flags.apply) {
    invariant(!flags.repo, '--apply requires full-fleet preflight; --repo is plan-only')
    const activationRequirementsPath = resolve(flags['external-activation-requirements'] ?? DEFAULT_EXTERNAL_ACTIVATION_REQUIREMENTS)
    const activationPolicyPath = resolve(flags['external-activation-policy'] ?? DEFAULT_EXTERNAL_ACTIVATION_POLICY)
    const mutationBoundaryContractPath = resolve(flags['mutation-boundary-contract'] ?? DEFAULT_GITHUB_MUTATION_BOUNDARY_CONTRACT)
    const activationRequirements = readJson(activationRequirementsPath)
    const activationPolicy = loadExternalActivationPolicy(activationPolicyPath)
    const mutationBoundaryContract = readJson(mutationBoundaryContractPath)
    const journalPath = resolve(flags.journal ?? resolve(GOVERNANCE_ROOT, `runtime/reconcile-journal-${Date.now()}-${plan.planDigest.slice(0, 12)}.json`))
    const result = applyPlan(plan, client, {
      journalPath,
      inventory,
      desired,
      rings,
      certifications,
      waivers,
      runtimeProfile,
      verifiedReleaseEvidence,
      activationRequirements,
      activationInventory: inventory,
      activationDesired: desired,
      activationPolicy,
      mutationBoundaryContract,
      offHostMirror,
      issuerRegistry,
      reloadCurrentGovernance: () => ({
        inventory: readJson(inventoryPath),
        desired: readJson(desiredPath),
        rings: readJson(ringsPath),
        certifications: readJson(certificationsPath),
        waivers: readJson(waiversPath),
        runtimeProfile: readJson(runtimeProfilePath),
        issuerRegistry: issuerRegistryPath ? loadIssuerRegistry(issuerRegistryPath) : loadIssuerRegistry(),
        activationRequirements: readJson(activationRequirementsPath),
        activationInventory: readJson(inventoryPath),
        activationDesired: readJson(desiredPath),
        activationPolicy: loadExternalActivationPolicy(activationPolicyPath),
        mutationBoundaryContract: readJson(mutationBoundaryContractPath),
      }),
    })
    console.log(flags.json ? stableStringify({ plan, result }) : `Applied and readback-verified ${result.actions.length} action(s); journal=${journalPath}`)
    return { plan, result, client }
  }
  if (flags.json) console.log(stableStringify(plan))
  else printPlan(plan)
  if (plan.summary.registeredInventory.conflicts > 0 || plan.summary.rolloutBlockers > 0) process.exitCode = 2
  return { plan, client }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1 })
