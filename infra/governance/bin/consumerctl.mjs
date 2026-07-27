#!/usr/bin/env node

import { randomBytes, verify as verifySignature } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  GOVERNANCE_ROOT,
  assertClosedGitLocalConfiguration,
  captureClosedGitHubToken,
  compareUtf8Bytes,
  deepEqual,
  invariant,
  listFiles,
  parseFlags,
  readJson,
  readPathState,
  resolveOwnership,
  runClosedGh,
  runClosedGit,
  sha256,
  stableStringify,
  validateInventory,
} from '../lib/common.mjs'
import { certificationKey, validateGovernanceModel, validateReleaseRings } from '../lib/model-validation.mjs'
import {
  issuerRegistryDigest,
  loadIssuerRegistry,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
} from '../lib/issuer-registry.mjs'
import { validateAttestationPolicy } from '../lib/attestation.mjs'
import {
  normalizeRuntimeValidationContext,
  resolveGitHubRuntimeValidationContext,
  runtimeCertificationPaths,
} from '../lib/runtime-certification.mjs'
import { GhApiClient } from './reconcile-github.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolSourceDigests,
  upgradeProfile,
  validateProtocolLock,
} from '../lib/consumer-upgrade-protocol.mjs'
import {
  loadRoleSurfacePolicy,
  requiredSurfacesForRole,
  validateManagedRepositoryRoleSurfaces,
} from '../lib/role-surface-policy.mjs'
import {
  createConsumerBootstrapMaterializationPlan,
  createConsumerBootstrapPromotionProposal,
  createConsumerControlPlaneUpdateAcceptanceProposal,
  createConsumerControlPlaneUpdatePlan,
  materializeConsumerBootstrapSnapshot,
  materializeConsumerControlPlaneUpdateSnapshot,
  validateConsumerBootstrapPromotionProposal,
  validateConsumerControlPlaneUpdateAcceptanceProposal,
  validateIndependentConsumerBootstrapReadback,
  validateIndependentConsumerControlPlaneUpdateReadback,
  verifyMaterializedConsumerBootstrapSnapshot,
  verifyContextualConsumerControlPlaneUpdateSnapshot,
} from '../lib/consumer-bootstrap.mjs'

const DEFAULT_INVENTORY = resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')
const DEFAULT_MATRIX = resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')
const DEFAULT_DESIRED = resolve(GOVERNANCE_ROOT, 'desired/github.json')
const DEFAULT_RINGS = resolve(GOVERNANCE_ROOT, 'release-rings.json')
const DEFAULT_CERTIFICATIONS = resolve(GOVERNANCE_ROOT, 'providers/certifications.json')
const DEFAULT_WAIVERS = resolve(GOVERNANCE_ROOT, 'waivers.json')
const DEFAULT_RUNTIME_PROFILE = resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')
const DEFAULT_INVENTORY_RUNTIME = resolve(GOVERNANCE_ROOT, 'runtime/consumer-fleet')
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40}$/
const FANOUT_REVIEW_SCHEMA = 'https://qijenchen.dev/schemas/consumer-fanout-review-v1.schema.json'
const FANOUT_REVIEW_SIGNATURE_DOMAIN = 'consumer-fleet-fanout-independent-review-v1'
const FANOUT_REVIEW_RECEIPT_DOMAIN = 'consumer-fleet-fanout-review-receipt-v1'
const FANOUT_REVIEW_REQUEST_DOMAIN = 'consumer-fleet-fanout-review-signing-request-v1'
const FANOUT_DISPATCH_EVIDENCE_DOMAIN = 'consumer-fleet-dispatch-evidence-v2'
const FANOUT_CHECK_RECEIPT_DOMAIN = 'consumer-fleet-fanout-check-v1'
const FANOUT_CHECK_LIMITATIONS = Object.freeze([
  'A ready read-only check proves only that the reviewed governance and runtime identity snapshots were current at checkedAt.',
  'A ready read-only check does not authorize dispatch and does not prove workflow, PR, merge, or rollout completion.',
])
const FANOUT_GOVERNANCE_KEYS = Object.freeze([
  'inventory', 'desired', 'rings', 'certifications', 'waivers', 'matrix', 'runtimeProfile', 'issuerRegistry',
])

export const CONSUMER_FANOUT_LIMITS = Object.freeze({
  maxPlanCanonicalBytes: 2 * 1024 * 1024,
  maxReviewSigningPayloadBytes: 4 * 1024 * 1024,
  maxArtifactBytes: 8 * 1024 * 1024,
  maxGenericArtifactBytes: 16 * 1024 * 1024,
  maxSignatures: 5,
  maxSignerKeyIdLength: 128,
  maxSignerSubjectLength: 512,
})

const maxBase64Length = bytes => Math.ceil(bytes / 3) * 4

function clone(value) {
  return structuredClone(value)
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    stableStringify(Object.keys(value).sort(), 0) === stableStringify([...keys].sort(), 0),
    `${label} has an invalid or open shape`,
  )
}

function canonicalUtc(value, label) {
  const parsed = new Date(value)
  invariant(typeof value === 'string' && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be canonical UTC`)
  return parsed
}

function authorityOwner(inventory) {
  const match = String(inventory.authority || '').match(/^([^/]+)\/[^@]+@/)
  invariant(match, 'Inventory authority must identify one GitHub owner/repository authority')
  return match[1]
}

function canonicalLocalPath(value, repoId) {
  invariant(typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0'), 'Consumer local path must be one non-empty repository-relative POSIX path')
  const parts = value.split('/')
  invariant(parts.every(part => part && part !== '.'), 'Consumer local path contains an empty or current-directory segment')
  invariant(parts.at(-1) === repoId, `Consumer local path must end in the repository id ${repoId}`)
  return value
}

function productProfileTemplate(inventory) {
  const products = inventory.repositories.filter(repo => repo.role === 'product-consumer')
  invariant(products.length > 0, 'Inventory has no product-consumer profile authority')
  const first = products[0]
  const projection = repo => ({
    desiredProfile: repo.desiredProfile,
    ownershipPolicy: repo.ownershipPolicy,
    consumes: repo.consumes ?? [],
    defaultBranch: repo.defaultBranch,
  })
  const expected = stableStringify(projection(first), 0)
  invariant(products.every(repo => stableStringify(projection(repo), 0) === expected), 'Existing product consumers disagree on their canonical fleet profile')
  return projection(first)
}

function ringById(rings, ringId) {
  const ring = rings.rings.find(candidate => candidate.id === ringId)
  invariant(ring, `Unknown release ring ${ringId}`)
  return ring
}

function registrationDigest(value) {
  return sha256(`consumer-registration-proposal-v1\n${stableStringify(value, 0)}`)
}

function fanoutDigest(value) {
  return sha256(`consumer-fleet-fanout-plan-v1\n${stableStringify(value, 0)}`)
}

function dispatchEvidenceDigest(value) {
  return sha256(`${FANOUT_DISPATCH_EVIDENCE_DOMAIN}\n${stableStringify(value, 0)}`)
}

function fanoutCheckReceiptDigest(value) {
  return sha256(`${FANOUT_CHECK_RECEIPT_DOMAIN}\n${stableStringify(value, 0)}`)
}

function runtimeSnapshotDigest(value) {
  return sha256(`consumer-fleet-runtime-identity-snapshot-v1\n${stableStringify(value, 0)}`)
}

function runtimeContextFailure(error) {
  return error instanceof Error && /(?:requires live identity for (?:repository|certification canary)|repository commit\/tree binding is stale|Repository certification carrier commit\/tree differs|profile\/Harness binding is stale)/.test(error.message)
}

function readFanoutLiveTime(clock, label, notBefore = null) {
  invariant(typeof clock === 'function', `${label} requires a live clock source`)
  const at = clock()
  invariant(at instanceof Date && Number.isFinite(at.getTime()), `${label} clock returned an invalid time`)
  invariant(!notBefore || at >= notBefore, `${label} clock regressed`)
  return at
}

function runtimeValidationOptions(runtimeValidationContext = {}, inventory) {
  const context = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  return {
    repoRoot: context.repoRoot,
    runtimeIdentity: context.runtimeIdentity,
    externalRepositoryIdentities: context.externalRepositoryIdentities,
  }
}

function validateConsumerGovernanceModel({
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  now = new Date(),
  issuerRegistry,
  runtimeProfile,
  matrix,
  runtimeValidationContext = {},
  typedRuntimeBlocker = false,
}) {
  try {
    validateGovernanceModel({
      inventory,
      desired,
      rings,
      certifications,
      waivers,
      now,
      issuerRegistry,
      runtimeProfile,
      matrix,
      ...runtimeValidationOptions(runtimeValidationContext, inventory),
    })
    return { valid: true, blocker: null }
  } catch (error) {
    if (!typedRuntimeBlocker || !runtimeContextFailure(error)) throw error
    return {
      valid: false,
      blocker: {
        severity: 'blocker',
        code: 'external-runtime-validation-context-unavailable',
        message: error.message,
      },
    }
  }
}

export function createConsumerRuntimeIdentitySnapshot(runtimeValidationContext, inventory) {
  const context = normalizeRuntimeValidationContext(runtimeValidationContext, { inventory })
  const identity = context.runtimeIdentity
  invariant(identity && ['gitCommit', 'gitTree'].every(key => GIT_OID.test(identity[key] ?? ''))
    && ['profileDigest', 'harnessDigest'].every(key => /^sha256:[a-f0-9]{64}$/.test(identity[key] ?? '')), 'Consumer fleet runtime identity is incomplete')
  invariant(context.externalRepositoryIdentities && typeof context.externalRepositoryIdentities === 'object', 'Consumer fleet repository runtime identities are unavailable')
  const repositories = [...inventory.repositories].sort((left, right) => compareUtf8Bytes(left.id, right.id)).map(repository => {
    const observed = context.externalRepositoryIdentities instanceof Map
      ? context.externalRepositoryIdentities.get(repository.id)
      : context.externalRepositoryIdentities[repository.id]
    invariant(observed && GIT_OID.test(observed.gitCommit ?? '') && GIT_OID.test(observed.gitTree ?? ''), `Consumer fleet runtime identity is unavailable for ${repository.id}`)
    return {
      repositoryId: repository.id,
      repository: repository.github,
      repositoryRole: repository.role,
      defaultBranch: repository.defaultBranch,
      gitCommit: observed.gitCommit,
      gitTree: observed.gitTree,
    }
  })
  const core = {
    schemaVersion: 1,
    kind: 'consumer-fleet-runtime-identity-snapshot',
    controlPlane: {
      gitCommit: identity.gitCommit,
      gitTree: identity.gitTree,
      profileDigest: identity.profileDigest,
      harnessDigest: identity.harnessDigest,
    },
    repositories,
  }
  return Object.freeze({ ...core, snapshotDigest: runtimeSnapshotDigest(core) })
}

export function validateConsumerRuntimeIdentitySnapshot(snapshot, inventory) {
  exactKeys(snapshot, ['schemaVersion', 'kind', 'controlPlane', 'repositories', 'snapshotDigest'], 'consumer fleet runtime identity snapshot')
  exactKeys(snapshot.controlPlane, ['gitCommit', 'gitTree', 'profileDigest', 'harnessDigest'], 'consumer fleet runtime control-plane identity')
  invariant(snapshot.schemaVersion === 1 && snapshot.kind === 'consumer-fleet-runtime-identity-snapshot', 'Consumer fleet runtime identity snapshot kind is invalid')
  invariant(GIT_OID.test(snapshot.controlPlane.gitCommit ?? '') && GIT_OID.test(snapshot.controlPlane.gitTree ?? ''), 'Consumer fleet runtime control-plane Git identity is invalid')
  invariant(/^sha256:[a-f0-9]{64}$/.test(snapshot.controlPlane.profileDigest ?? '') && /^sha256:[a-f0-9]{64}$/.test(snapshot.controlPlane.harnessDigest ?? ''), 'Consumer fleet runtime profile/Harness identity is invalid')
  invariant(Array.isArray(snapshot.repositories) && snapshot.repositories.length === inventory.repositories.length, 'Consumer fleet runtime repository identity coverage is incomplete')
  const expected = [...inventory.repositories].sort((left, right) => compareUtf8Bytes(left.id, right.id))
  snapshot.repositories.forEach((repository, index) => {
    exactKeys(repository, ['repositoryId', 'repository', 'repositoryRole', 'defaultBranch', 'gitCommit', 'gitTree'], 'consumer fleet runtime repository identity')
    const inventoryRepository = expected[index]
    invariant(repository.repositoryId === inventoryRepository.id
      && repository.repository === inventoryRepository.github
      && repository.repositoryRole === inventoryRepository.role
      && repository.defaultBranch === inventoryRepository.defaultBranch, `Consumer fleet runtime repository identity differs from inventory for ${inventoryRepository.id}`)
    invariant(GIT_OID.test(repository.gitCommit ?? '') && GIT_OID.test(repository.gitTree ?? ''), `Consumer fleet runtime repository Git identity is invalid for ${inventoryRepository.id}`)
  })
  const { snapshotDigest, ...core } = snapshot
  invariant(SHA256.test(snapshotDigest ?? '') && snapshotDigest === runtimeSnapshotDigest(core), 'Consumer fleet runtime identity snapshot digest is stale')
  return snapshot
}

export function planConsumerRegistration({ inventory, rings, request, roleSurfacePolicy = loadRoleSurfacePolicy() }) {
  validateInventory(inventory)
  validateManagedRepositoryRoleSurfaces(inventory, roleSurfacePolicy)
  validateReleaseRings(inventory, rings)
  exactKeys(request, [
    'repoId', 'github', 'visibility', 'defaultBranch', 'localPathFromGovernanceRoot',
    'releaseRing', 'wave', 'enteredAt',
  ], 'consumer registration request')
  invariant(rings?.schemaVersion === 3 && rings.candidateRelease === null, 'Consumer registration is allowed only between release candidates')
  invariant(typeof request.repoId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(request.repoId), 'Consumer registration repository id is invalid')
  invariant(typeof request.github === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.github), 'Consumer registration GitHub slug is invalid')
  invariant(request.github.split('/')[0] === authorityOwner(inventory), 'Consumer registration may not extend authority outside the inventory GitHub owner')
  invariant(request.github.split('/')[1] === request.repoId, 'Consumer registration GitHub repository name must equal its inventory id')
  invariant(!inventory.repositories.some(repo => repo.id === request.repoId || repo.github.toLowerCase() === request.github.toLowerCase()), 'Consumer registration duplicates an existing repository')
  invariant(['public', 'private', 'internal'].includes(request.visibility), 'Consumer registration visibility is invalid')
  canonicalUtc(request.enteredAt, 'Consumer registration enteredAt')
  canonicalLocalPath(request.localPathFromGovernanceRoot, request.repoId)
  invariant(!inventory.repositories.some(repo => repo.localPathFromGovernanceRoot === request.localPathFromGovernanceRoot), 'Consumer registration local path is already assigned')

  const profile = {
    ...productProfileTemplate(inventory),
    providerSurfacesRequired: requiredSurfacesForRole(roleSurfacePolicy, 'product-consumer'),
  }
  invariant(request.defaultBranch === profile.defaultBranch, `Consumer registration default branch must be ${profile.defaultBranch}`)
  const ring = ringById(rings, request.releaseRing)
  const wave = ring.waves.find(candidate => candidate.id === request.wave)
  invariant(wave, `Unknown release wave ${request.releaseRing}/${request.wave}`)
  const surfacePredicate = ring.promotionPredicates.find(predicate => predicate.type === 'provider-surfaces-certified')
  invariant(
    surfacePredicate
      && stableStringify([...(surfacePredicate.surfaces ?? [])].sort(), 0) === stableStringify([...profile.providerSurfacesRequired].sort(), 0),
    `Release ring ${request.releaseRing} is not a product-consumer ring`,
  )

  const repository = {
    id: request.repoId,
    github: request.github,
    role: 'product-consumer',
    visibility: request.visibility,
    defaultBranch: profile.defaultBranch,
    desiredProfile: profile.desiredProfile,
    releaseRing: request.releaseRing,
    ownershipPolicy: profile.ownershipPolicy,
    upgradeProtocolProfile: 'new-snapshot-v2',
    localPathFromGovernanceRoot: request.localPathFromGovernanceRoot,
    providerSurfacesRequired: clone(profile.providerSurfacesRequired),
    consumes: clone(profile.consumes),
  }
  const assignment = {
    ring: request.releaseRing,
    wave: request.wave,
    enteredAt: request.enteredAt,
    candidateReleaseDigest: null,
    applyAuthorization: null,
    completionAttestation: null,
    manualBlockers: [
      'Independent template-snapshot, protected-workflow, required-check, and provider-surface readback must be accepted before fleet fanout.',
    ],
  }
  const nextInventory = clone(inventory)
  const nextRings = clone(rings)
  nextInventory.repositories.push(repository)
  nextRings.assignments[repository.id] = assignment
  validateInventory(nextInventory)
  validateReleaseRings(nextInventory, nextRings)
  const proposal = {
    schemaVersion: 1,
    kind: 'consumer-registration-proposal',
    mode: 'reviewed-pr-proposal',
    mutationAuthorized: false,
    request: clone(request),
    before: {
      inventorySha256: sha256(stableStringify(inventory, 0)),
      releaseRingsSha256: sha256(stableStringify(rings, 0)),
    },
    proposed: { repository, assignment },
    after: {
      inventorySha256: sha256(stableStringify(nextInventory, 0)),
      releaseRingsSha256: sha256(stableStringify(nextRings, 0)),
      inventory: nextInventory,
      releaseRings: nextRings,
    },
    reviewRequirements: [
      'Apply both after-images in one protected Design System PR.',
      'Do not clear the onboarding manual blocker in the registration PR.',
      'Reconcile and independently read back the registered repository before a later reviewed PR clears the blocker.',
      'Registration does not dispatch, certify, merge, or activate the consumer.',
    ],
  }
  return Object.freeze({ ...proposal, proposalDigest: registrationDigest(proposal) })
}

export function validateConsumerRegistrationProposal(value, { inventory, rings, roleSurfacePolicy = loadRoleSurfacePolicy() }) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'mode', 'mutationAuthorized', 'request', 'before', 'proposed',
    'after', 'reviewRequirements', 'proposalDigest',
  ], 'consumer registration proposal')
  invariant(value.schemaVersion === 1 && value.kind === 'consumer-registration-proposal' && value.mode === 'reviewed-pr-proposal' && value.mutationAuthorized === false, 'Consumer registration proposal identity is invalid')
  const expected = planConsumerRegistration({ inventory, rings, request: value.request, roleSurfacePolicy })
  invariant(stableStringify(value, 0) === stableStringify(expected, 0), 'Consumer registration proposal is stale, substituted, or not canonical')
  return expected
}

function orderedRingWaves(rings) {
  return [...rings.rings]
    .sort((left, right) => left.order - right.order)
    .flatMap(ring => [...ring.waves].sort((left, right) => left.order - right.order).map(wave => ({ ring, wave })))
}

function assignmentComplete(assignment) {
  return assignment.completionAttestation !== null
}

function currentRolloutWave(inventory, rings) {
  for (const entry of orderedRingWaves(rings)) {
    const repoIds = inventory.repositories
      .filter(repo => rings.assignments[repo.id]?.ring === entry.ring.id && rings.assignments[repo.id]?.wave === entry.wave.id)
      .map(repo => repo.id)
    if (repoIds.some(repoId => !assignmentComplete(rings.assignments[repoId]))) return { ...entry, repoIds }
  }
  return null
}

export function planConsumerFanout({ inventory, rings, version, now = new Date(), issuerRegistry, runtimeIdentitySnapshot = null }) {
  validateInventory(inventory)
  validateReleaseRings(inventory, rings, { now, ...(issuerRegistry ? { issuerRegistry } : {}) })
  invariant(rings.candidateRelease && typeof rings.candidateRelease === 'object', 'Consumer fanout requires one immutable candidate release')
  invariant(EXACT_VERSION.test(version || '') && version === rings.candidateRelease.version, 'Consumer fanout version must equal the exact immutable candidate release')
  invariant(GIT_OID.test(rings.candidateRelease.sourceCommit || '') && GIT_OID.test(rings.candidateRelease.sourceTree || '') && SHA256.test(rings.candidateRelease.bomSha256 || ''), 'Consumer fanout candidate release identity is incomplete')
  const candidateReleaseDigest = sha256(stableStringify(rings.candidateRelease, 0))
  const boundRuntimeIdentitySnapshot = runtimeIdentitySnapshot === null
    ? null
    : clone(validateConsumerRuntimeIdentitySnapshot(runtimeIdentitySnapshot, inventory))
  const planBlockers = boundRuntimeIdentitySnapshot === null
    ? [{
        severity: 'blocker',
        code: 'reviewed-runtime-identity-snapshot-required',
        message: 'Consumer fleet fanout planning requires a current runtime/profile/Harness and per-repository commit/tree identity snapshot before any dispatch can be ready.',
      }]
    : []
  const protocol = canonicalUpgradeProtocol().protocol
  const current = currentRolloutWave(inventory, rings)
  const budget = current ? Math.min(current.ring.maxParallel, current.wave.maxParallel) : 0
  const currentSet = new Set(current?.repoIds ?? [])
  const rows = []
  const dispatchable = []
  for (const repo of inventory.repositories.filter(candidate => candidate.role === 'product-consumer')) {
    const assignment = rings.assignments[repo.id]
    invariant(assignment, `Consumer fanout lacks a release-ring assignment for ${repo.id}`)
    invariant(assignment.candidateReleaseDigest === candidateReleaseDigest, `Consumer fanout assignment is not reset to the immutable candidate:${repo.id}`)
    const profile = upgradeProfile(protocol, repo.upgradeProtocolProfile)
    const blockers = []
    if (assignmentComplete(assignment)) blockers.push('already-complete')
    else if (!currentSet.has(repo.id)) blockers.push('not-current-ring-wave')
    if (profile.bootstrapRequired) blockers.push('legacy-bootstrap-readback-required')
    if (assignment.manualBlockers.length > 0) blockers.push(...assignment.manualBlockers.map(item => `manual:${item}`))
    if (!assignment.applyAuthorization) blockers.push('signed-apply-authorization-required')
    const row = {
      repositoryId: repo.id,
      repository: repo.github,
      ring: assignment.ring,
      wave: assignment.wave,
      profileId: repo.upgradeProtocolProfile,
      status: blockers.length === 0 ? 'dispatchable' : 'blocked',
      blockers,
    }
    rows.push(row)
    if (blockers.length === 0) dispatchable.push({ repo, assignment })
  }
  const parallelBudgetExceeded = dispatchable.length > budget
  const selected = parallelBudgetExceeded || planBlockers.length > 0 ? [] : dispatchable
  if (parallelBudgetExceeded) {
    for (const row of rows.filter(item => item.status === 'dispatchable')) {
      row.status = 'blocked'
      row.blockers.push(`parallel-budget-exceeded:${dispatchable.length}/${budget}`)
    }
  }
  if (planBlockers.length > 0) {
    for (const row of rows.filter(item => item.status === 'dispatchable')) {
      row.status = 'blocked'
      row.blockers.push(planBlockers[0].code)
    }
  }
  const core = {
    schemaVersion: 2,
    kind: 'consumer-fleet-fanout-plan',
    mode: 'plan',
    dryRun: true,
    mutationAuthorized: false,
    inventorySha256: sha256(stableStringify(inventory, 0)),
    releaseRingsSha256: sha256(stableStringify(rings, 0)),
    candidateRelease: clone(rings.candidateRelease),
    candidateReleaseDigest,
    runtimeIdentitySnapshot: boundRuntimeIdentitySnapshot,
    runtimeIdentitySnapshotDigest: boundRuntimeIdentitySnapshot?.snapshotDigest ?? null,
    current: current ? { ring: current.ring.id, wave: current.wave.id, repositoryIds: current.repoIds, budget } : null,
    coverage: {
      scope: 'registered-opt-in-inventory',
      registeredProductConsumers: rows.length,
      enumeratedRegisteredProductConsumers: rows.length,
      unregisteredTemplateDescendants: 'not-observable-without-opt-in',
      globalTemplateLineageComplete: false,
    },
    blockers: planBlockers,
    repositories: rows,
    dispatches: selected.map(({ repo, assignment }) => ({
      repositoryId: repo.id,
      repository: repo.github,
      ring: assignment.ring,
      wave: assignment.wave,
      endpoint: `repos/${repo.github}/dispatches`,
      request: {
        event_type: 'governance-release',
        client_payload: {
          version,
          source_repository: inventory.authority.split('@')[0],
          source_commit: rings.candidateRelease.sourceCommit,
          source_tree: rings.candidateRelease.sourceTree,
          release_bom_sha256: rings.candidateRelease.bomSha256,
          repository_id: repo.id,
          ring: assignment.ring,
          wave: assignment.wave,
        },
      },
    })),
    ready: selected.length > 0 && planBlockers.length === 0,
    completionClaimed: false,
    limitations: [
      'Fleet coverage is limited to registered opt-in inventory; unregistered template descendants are not globally observable.',
      'A successful dispatch request does not prove that the protected-default workflow started.',
      'Fanout does not prove that an upgrade PR, required check, merge, or completion attestation exists.',
      'Re-run only after independent readback; blind retry after partial failure is forbidden.',
      'Apply requires a fresh live runtime/profile/Harness and per-repository commit/tree identity readback matching this reviewed plan before every dispatch decision.',
    ],
  }
  const plan = { ...core, planDigest: fanoutDigest(core) }
  invariant(
    Buffer.byteLength(stableStringify(plan, 0), 'utf8') <= CONSUMER_FANOUT_LIMITS.maxPlanCanonicalBytes,
    `Consumer fleet fanout plan exceeds ${CONSUMER_FANOUT_LIMITS.maxPlanCanonicalBytes} canonical bytes`,
  )
  return Object.freeze(plan)
}

export function validateConsumerFanoutPlan(value, { inventory, rings, now = new Date(), issuerRegistry } = {}) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'mode', 'dryRun', 'mutationAuthorized', 'inventorySha256',
    'releaseRingsSha256', 'candidateRelease', 'candidateReleaseDigest', 'runtimeIdentitySnapshot',
    'runtimeIdentitySnapshotDigest', 'current', 'coverage',
    'blockers', 'repositories', 'dispatches', 'ready', 'completionClaimed', 'limitations', 'planDigest',
  ], 'consumer fleet fanout plan')
  invariant(value.schemaVersion === 2 && value.kind === 'consumer-fleet-fanout-plan' && value.mode === 'plan' && value.dryRun === true && value.mutationAuthorized === false && value.completionClaimed === false, 'Consumer fleet fanout plan identity is invalid')
  invariant(Array.isArray(value.blockers), 'Consumer fleet fanout plan blockers must be an array')
  for (const blocker of value.blockers) {
    exactKeys(blocker, ['severity', 'code', 'message'], 'consumer fleet fanout plan blocker')
    invariant(blocker.severity === 'blocker'
      && typeof blocker.code === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(blocker.code)
      && typeof blocker.message === 'string' && blocker.message.length > 0, 'Consumer fleet fanout plan blocker is invalid')
  }
  if (value.runtimeIdentitySnapshot === null) invariant(value.runtimeIdentitySnapshotDigest === null, 'Consumer fleet fanout plan has a detached runtime identity digest')
  else {
    validateConsumerRuntimeIdentitySnapshot(value.runtimeIdentitySnapshot, inventory)
    invariant(value.runtimeIdentitySnapshotDigest === value.runtimeIdentitySnapshot.snapshotDigest, 'Consumer fleet fanout plan runtime identity digest mismatch')
  }
  const expected = planConsumerFanout({
    inventory,
    rings,
    version: value.candidateRelease?.version,
    now,
    issuerRegistry,
    runtimeIdentitySnapshot: value.runtimeIdentitySnapshot,
  })
  invariant(stableStringify(value, 0) === stableStringify(expected, 0), 'Consumer fleet fanout plan is stale, substituted, or not canonical')
  return expected
}

function fanoutPlanCanonicalBytes(plan) {
  return Buffer.from(stableStringify(plan, 0), 'utf8')
}

function fanoutReviewSigningPayload(claims) {
  return Buffer.from(`${FANOUT_REVIEW_SIGNATURE_DOMAIN}\n${stableStringify(claims, 0)}`, 'utf8')
}

function fanoutReviewRequestDigest(value) {
  return sha256(`${FANOUT_REVIEW_REQUEST_DOMAIN}\n${stableStringify(value, 0)}`)
}

function fanoutReviewReceiptDigest(value) {
  return sha256(`${FANOUT_REVIEW_RECEIPT_DOMAIN}\n${stableStringify(value, 0)}`)
}

function fanoutApplyAuthorizerSubjects(plan, rings) {
  const subjects = new Set()
  for (const dispatch of plan.dispatches) {
    const authorization = rings.assignments?.[dispatch.repositoryId]?.applyAuthorization
    invariant(authorization, `Consumer fleet fanout review lacks a verified apply authorization for ${dispatch.repositoryId}`)
    subjects.add(authorization.subject)
    for (const cosignature of authorization.coSignatures) subjects.add(cosignature.subject)
  }
  return subjects
}

function validateFanoutReviewWindow({ issuedAt, expiresAt, policy, now }) {
  const issued = canonicalUtc(issuedAt, 'consumer fleet fanout review issuedAt')
  const expires = canonicalUtc(expiresAt, 'consumer fleet fanout review expiresAt')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Consumer fleet fanout review verification time must be valid')
  invariant(expires > issued, 'Consumer fleet fanout review expiry must be after issuance')
  invariant(expires.getTime() - issued.getTime() <= policy.maxCompletionTtlMinutes * 60_000, 'Consumer fleet fanout review exceeds completion-attestation TTL')
  invariant(issued.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000, 'Consumer fleet fanout review was issued in the future')
  invariant(expires > now, 'Consumer fleet fanout review is expired')
  return { issued, expires }
}

function validateFanoutReviewClaimsShape(value) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'decision', 'planDigest', 'planCanonicalSha256',
    'planCanonicalBase64', 'inventorySha256', 'releaseRingsSha256',
    'candidateReleaseDigest', 'runtimeIdentitySnapshotDigest', 'issuerRegistryDigest',
    'issuedAt', 'expiresAt',
  ], 'consumer fleet fanout review claims')
  invariant(value.schemaVersion === 1 && value.kind === 'consumer-fleet-fanout-independent-review', 'Consumer fleet fanout review claims identity is invalid')
  invariant(['approved', 'rejected'].includes(value.decision), 'Consumer fleet fanout review decision is invalid')
  for (const field of [
    'planDigest', 'planCanonicalSha256', 'inventorySha256', 'releaseRingsSha256',
    'candidateReleaseDigest', 'runtimeIdentitySnapshotDigest', 'issuerRegistryDigest',
  ]) invariant(SHA256.test(value[field] ?? ''), `Consumer fleet fanout review ${field} is invalid`)
  canonicalUtc(value.issuedAt, 'consumer fleet fanout review issuedAt')
  canonicalUtc(value.expiresAt, 'consumer fleet fanout review expiresAt')
  invariant(
    typeof value.planCanonicalBase64 === 'string'
      && value.planCanonicalBase64.length <= maxBase64Length(CONSUMER_FANOUT_LIMITS.maxPlanCanonicalBytes)
      && /^[A-Za-z0-9+/]+={0,2}$/.test(value.planCanonicalBase64),
    'Consumer fleet fanout review canonical plan bytes are invalid or oversized',
  )
  const canonicalPlanBytes = Buffer.from(value.planCanonicalBase64, 'base64')
  invariant(
    canonicalPlanBytes.length > 0
      && canonicalPlanBytes.length <= CONSUMER_FANOUT_LIMITS.maxPlanCanonicalBytes
      && canonicalPlanBytes.toString('base64') === value.planCanonicalBase64,
    'Consumer fleet fanout review canonical plan bytes are not canonical bounded base64',
  )
  invariant(sha256(canonicalPlanBytes) === value.planCanonicalSha256, 'Consumer fleet fanout review canonical plan bytes digest is stale')
  return value
}

function validateFanoutReviewRequestShape(value) {
  exactKeys(value, [
    '$schema', 'schemaVersion', 'kind', 'readOnly', 'mutationAuthorized', 'algorithm',
    'signatureDomain', 'requiredRole', 'requiredQuorum', 'claims', 'signingPayloadBase64',
    'signingPayloadSha256', 'requestDigest',
  ], 'consumer fleet fanout review signing request')
  invariant(value.$schema === FANOUT_REVIEW_SCHEMA
    && value.schemaVersion === 1
    && value.kind === 'consumer-fleet-fanout-review-signing-request'
    && value.readOnly === true
    && value.mutationAuthorized === false
    && value.algorithm === 'ed25519'
    && value.signatureDomain === FANOUT_REVIEW_SIGNATURE_DOMAIN
    && value.requiredRole === 'completion-attestor', 'Consumer fleet fanout review signing request identity is invalid')
  invariant(Number.isInteger(value.requiredQuorum) && value.requiredQuorum >= 1 && value.requiredQuorum <= CONSUMER_FANOUT_LIMITS.maxSignatures, 'Consumer fleet fanout review quorum is invalid')
  validateFanoutReviewClaimsShape(value.claims)
  invariant(
    typeof value.signingPayloadBase64 === 'string'
      && value.signingPayloadBase64.length <= maxBase64Length(CONSUMER_FANOUT_LIMITS.maxReviewSigningPayloadBytes)
      && /^[A-Za-z0-9+/]+={0,2}$/.test(value.signingPayloadBase64),
    'Consumer fleet fanout review signing payload bytes are invalid or oversized',
  )
  const payload = fanoutReviewSigningPayload(value.claims)
  invariant(payload.length <= CONSUMER_FANOUT_LIMITS.maxReviewSigningPayloadBytes, 'Consumer fleet fanout review signing payload exceeds the byte limit')
  invariant(Buffer.from(value.signingPayloadBase64 ?? '', 'base64').equals(payload)
    && payload.toString('base64') === value.signingPayloadBase64, 'Consumer fleet fanout review signing payload bytes are stale or non-canonical')
  invariant(value.signingPayloadSha256 === sha256(payload), 'Consumer fleet fanout review signing payload digest is stale')
  const { requestDigest, ...core } = value
  invariant(SHA256.test(requestDigest ?? '') && requestDigest === fanoutReviewRequestDigest(core), 'Consumer fleet fanout review signing request digest is stale')
  return value
}

export function createConsumerFanoutReviewSigningRequest({
  plan,
  inventory,
  rings,
  issuerRegistry,
  decision,
  issuedAt,
  expiresAt,
  now = new Date(),
}) {
  const canonicalPlan = validateConsumerFanoutPlan(plan, { inventory, rings, now, issuerRegistry })
  invariant(canonicalPlan.runtimeIdentitySnapshot && SHA256.test(canonicalPlan.runtimeIdentitySnapshotDigest ?? ''), 'Consumer fleet fanout review requires a runtime identity snapshot bound to the canonical plan')
  validateAttestationPolicy(rings.attestationPolicy, { issuerRegistry, now, allowUnactivated: false })
  invariant(['approved', 'rejected'].includes(decision), 'Consumer fleet fanout review decision must be approved or rejected')
  const window = validateFanoutReviewWindow({ issuedAt, expiresAt, policy: rings.attestationPolicy, now })
  const applySubjects = fanoutApplyAuthorizerSubjects(canonicalPlan, rings)
  const eligibleIndependentSubjects = new Set()
  for (const keyId of rings.attestationPolicy.allowedKeyIds) {
    try {
      const issuer = resolvePolicyIssuer(rings.attestationPolicy, issuerRegistry, keyId, {
        role: 'completion-attestor',
        at: window.issued,
        validThrough: window.expires,
      })
      resolvePolicyIssuer(rings.attestationPolicy, issuerRegistry, keyId, {
        role: 'completion-attestor',
        at: now,
        validThrough: now,
      })
      if (!applySubjects.has(issuer.subject)) eligibleIndependentSubjects.add(issuer.subject)
    } catch {
      // The closed policy validator reports malformed trust. Here we only count
      // issuers that remain role/time eligible for this exact review window.
    }
  }
  invariant(
    eligibleIndependentSubjects.size >= rings.attestationPolicy.completionAttestationQuorum,
    `Consumer fleet fanout review lacks ${rings.attestationPolicy.completionAttestationQuorum} independent completion-attestor subjects distinct from apply authorizers`,
  )
  const planBytes = fanoutPlanCanonicalBytes(canonicalPlan)
  const claims = {
    schemaVersion: 1,
    kind: 'consumer-fleet-fanout-independent-review',
    decision,
    planDigest: canonicalPlan.planDigest,
    planCanonicalSha256: sha256(planBytes),
    planCanonicalBase64: planBytes.toString('base64'),
    inventorySha256: sha256(stableStringify(inventory, 0)),
    releaseRingsSha256: sha256(stableStringify(rings, 0)),
    candidateReleaseDigest: canonicalPlan.candidateReleaseDigest,
    runtimeIdentitySnapshotDigest: canonicalPlan.runtimeIdentitySnapshotDigest,
    issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
    issuedAt,
    expiresAt,
  }
  const payload = fanoutReviewSigningPayload(claims)
  invariant(payload.length <= CONSUMER_FANOUT_LIMITS.maxReviewSigningPayloadBytes, 'Consumer fleet fanout review signing payload exceeds the byte limit')
  const core = {
    $schema: FANOUT_REVIEW_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-fleet-fanout-review-signing-request',
    readOnly: true,
    mutationAuthorized: false,
    algorithm: 'ed25519',
    signatureDomain: FANOUT_REVIEW_SIGNATURE_DOMAIN,
    requiredRole: 'completion-attestor',
    requiredQuorum: rings.attestationPolicy.completionAttestationQuorum,
    claims,
    signingPayloadBase64: payload.toString('base64'),
    signingPayloadSha256: sha256(payload),
  }
  const request = { ...core, requestDigest: fanoutReviewRequestDigest(core) }
  invariant(
    Buffer.byteLength(stableStringify(request, 0), 'utf8') <= CONSUMER_FANOUT_LIMITS.maxArtifactBytes,
    `Consumer fleet fanout review signing request exceeds ${CONSUMER_FANOUT_LIMITS.maxArtifactBytes} canonical bytes`,
  )
  return Object.freeze(request)
}

export function validateConsumerFanoutReviewSigningRequest(value, context) {
  validateFanoutReviewRequestShape(value)
  const expected = createConsumerFanoutReviewSigningRequest({
    ...context,
    decision: value.claims.decision,
    issuedAt: value.claims.issuedAt,
    expiresAt: value.claims.expiresAt,
  })
  invariant(stableStringify(value, 0) === stableStringify(expected, 0), 'Consumer fleet fanout review signing request is stale, substituted, or not canonical')
  return expected
}

export function createConsumerFanoutReviewReceipt(signingRequest, signatures) {
  validateFanoutReviewRequestShape(signingRequest)
  invariant(
    Array.isArray(signatures) && signatures.length === signingRequest.requiredQuorum,
    `Consumer fleet fanout review receipt requires exactly ${signingRequest.requiredQuorum} external signatures`,
  )
  const canonicalSignatures = clone(signatures)
  const keyIds = new Set()
  const subjects = new Set()
  for (const item of canonicalSignatures) {
    exactKeys(item, ['signerKeyId', 'subject', 'signature'], 'consumer fleet fanout review signature')
    invariant(
      typeof item.signerKeyId === 'string'
        && item.signerKeyId.length <= CONSUMER_FANOUT_LIMITS.maxSignerKeyIdLength
        && /^[a-z0-9][a-z0-9._-]*$/.test(item.signerKeyId),
      'Consumer fleet fanout review signer key ID is invalid or oversized',
    )
    invariant(
      typeof item.subject === 'string'
        && item.subject.trim() !== ''
        && item.subject.length <= CONSUMER_FANOUT_LIMITS.maxSignerSubjectLength,
      'Consumer fleet fanout review signer subject is invalid or oversized',
    )
    invariant(typeof item.signature === 'string' && item.signature.length === 86 && /^[A-Za-z0-9_-]{86}$/.test(item.signature), 'Consumer fleet fanout review signature is invalid or non-canonical')
    invariant(!keyIds.has(item.signerKeyId), 'Consumer fleet fanout review signer key IDs must be distinct')
    invariant(!subjects.has(item.subject), 'Consumer fleet fanout review signer subjects must be distinct')
    keyIds.add(item.signerKeyId)
    subjects.add(item.subject)
  }
  canonicalSignatures.sort((left, right) => compareUtf8Bytes(left.signerKeyId, right.signerKeyId))
  const core = {
    $schema: signingRequest.$schema,
    schemaVersion: signingRequest.schemaVersion,
    kind: 'consumer-fleet-fanout-review-receipt',
    algorithm: signingRequest.algorithm,
    signatureDomain: signingRequest.signatureDomain,
    requiredRole: signingRequest.requiredRole,
    requiredQuorum: signingRequest.requiredQuorum,
    claims: clone(signingRequest.claims),
    signingPayloadSha256: signingRequest.signingPayloadSha256,
    requestDigest: signingRequest.requestDigest,
    signatures: canonicalSignatures,
  }
  const receipt = { ...core, receiptDigest: fanoutReviewReceiptDigest(core) }
  invariant(
    Buffer.byteLength(stableStringify(receipt, 0), 'utf8') <= CONSUMER_FANOUT_LIMITS.maxArtifactBytes,
    `Consumer fleet fanout review receipt exceeds ${CONSUMER_FANOUT_LIMITS.maxArtifactBytes} canonical bytes`,
  )
  return Object.freeze(receipt)
}

export function validateConsumerFanoutReviewReceipt(value, {
  plan,
  inventory,
  rings,
  issuerRegistry,
  now = new Date(),
  requireApproved = true,
}) {
  exactKeys(value, [
    '$schema', 'schemaVersion', 'kind', 'algorithm', 'signatureDomain', 'requiredRole',
    'requiredQuorum', 'claims', 'signingPayloadSha256', 'requestDigest', 'signatures',
    'receiptDigest',
  ], 'consumer fleet fanout review receipt')
  invariant(value.$schema === FANOUT_REVIEW_SCHEMA
    && value.schemaVersion === 1
    && value.kind === 'consumer-fleet-fanout-review-receipt'
    && value.algorithm === 'ed25519'
    && value.signatureDomain === FANOUT_REVIEW_SIGNATURE_DOMAIN
    && value.requiredRole === 'completion-attestor', 'Consumer fleet fanout review receipt identity is invalid')
  invariant(Number.isInteger(value.requiredQuorum) && value.requiredQuorum >= 1 && value.requiredQuorum <= CONSUMER_FANOUT_LIMITS.maxSignatures, 'Consumer fleet fanout review receipt quorum is invalid')
  validateFanoutReviewClaimsShape(value.claims)
  invariant(
    Array.isArray(value.signatures)
      && value.signatures.length === value.requiredQuorum
      && value.signatures.length <= CONSUMER_FANOUT_LIMITS.maxSignatures,
    `Consumer fleet fanout review receipt requires exactly its bounded completion-attestor quorum ${value.requiredQuorum}`,
  )
  for (const item of value.signatures) {
    exactKeys(item, ['signerKeyId', 'subject', 'signature'], 'consumer fleet fanout review signature')
    invariant(
      typeof item.signerKeyId === 'string'
        && item.signerKeyId.length <= CONSUMER_FANOUT_LIMITS.maxSignerKeyIdLength
        && /^[a-z0-9][a-z0-9._-]*$/.test(item.signerKeyId),
      'Consumer fleet fanout review signer key ID is invalid or oversized',
    )
    invariant(
      typeof item.subject === 'string'
        && item.subject.trim() !== ''
        && item.subject.length <= CONSUMER_FANOUT_LIMITS.maxSignerSubjectLength,
      'Consumer fleet fanout review signer subject is invalid or oversized',
    )
    invariant(typeof item.signature === 'string' && item.signature.length === 86 && /^[A-Za-z0-9_-]{86}$/.test(item.signature), 'Consumer fleet fanout review signature encoding is invalid')
  }
  invariant(
    value.signatures.every((item, index) => index === 0 || compareUtf8Bytes(value.signatures[index - 1].signerKeyId, item.signerKeyId) < 0),
    'Consumer fleet fanout review signatures are not in canonical signer-key order',
  )
  const expectedRequest = createConsumerFanoutReviewSigningRequest({
    plan,
    inventory,
    rings,
    issuerRegistry,
    decision: value.claims?.decision,
    issuedAt: value.claims?.issuedAt,
    expiresAt: value.claims?.expiresAt,
    now,
  })
  invariant(value.requiredQuorum === expectedRequest.requiredQuorum
    && value.signingPayloadSha256 === expectedRequest.signingPayloadSha256
    && value.requestDigest === expectedRequest.requestDigest
    && stableStringify(value.claims, 0) === stableStringify(expectedRequest.claims, 0), 'Consumer fleet fanout review receipt is stale, substituted, or detached from its canonical signing request')
  if (requireApproved) invariant(value.claims.decision === 'approved', 'Consumer fleet fanout independent review did not approve the plan')
  const keyIds = new Set()
  const subjects = new Set()
  const payload = fanoutReviewSigningPayload(value.claims)
  const issued = new Date(value.claims.issuedAt)
  const expires = new Date(value.claims.expiresAt)
  for (const item of value.signatures) {
    invariant(!keyIds.has(item.signerKeyId), 'Consumer fleet fanout review signer key IDs must be distinct')
    invariant(!subjects.has(item.subject), 'Consumer fleet fanout review signer subjects must be distinct')
    const issuer = resolvePolicyIssuer(rings.attestationPolicy, issuerRegistry, item.signerKeyId, {
      role: 'completion-attestor',
      at: issued,
      validThrough: expires,
    })
    resolvePolicyIssuer(rings.attestationPolicy, issuerRegistry, item.signerKeyId, {
      role: 'completion-attestor',
      at: now,
      validThrough: now,
    })
    invariant(issuer.subject === item.subject, 'Consumer fleet fanout review signer subject does not match the issuer registry')
    const signature = Buffer.from(item.signature, 'base64url')
    invariant(signature.length === 64 && signature.toString('base64url') === item.signature, 'Consumer fleet fanout review signature is not canonical Ed25519 base64url')
    invariant(verifySignature(null, payload, publicKeyFromIssuer(issuer), signature), 'Consumer fleet fanout review signature is invalid')
    keyIds.add(item.signerKeyId)
    subjects.add(item.subject)
  }
  invariant(subjects.size >= value.requiredQuorum, `Consumer fleet fanout review receipt lacks completion-attestor quorum ${value.requiredQuorum}`)
  const applySubjects = fanoutApplyAuthorizerSubjects(plan, rings)
  const overlap = [...subjects].filter(subject => applySubjects.has(subject))
  invariant(overlap.length === 0, `Consumer fleet fanout review signer subjects overlap apply-authorizer subjects:${overlap.join(',')}`)
  const { receiptDigest, ...core } = value
  invariant(SHA256.test(receiptDigest ?? '') && receiptDigest === fanoutReviewReceiptDigest(core), 'Consumer fleet fanout review receipt digest is stale')
  return { receipt: value, signers: [...subjects].sort() }
}

function finalizeDispatchEvidence(core) {
  const evidence = { ...core, evidenceDigest: dispatchEvidenceDigest(core) }
  invariant(
    Buffer.byteLength(stableStringify(evidence, 0), 'utf8') <= CONSUMER_FANOUT_LIMITS.maxArtifactBytes,
    `Consumer fleet dispatch evidence exceeds ${CONSUMER_FANOUT_LIMITS.maxArtifactBytes} canonical bytes`,
  )
  return evidence
}

function requireReviewedRuntimeIdentity(plan, runtimeIdentitySnapshotResolver, phase, repositoryId = null, observedAt = new Date(), currentGovernance = null) {
  invariant(plan.runtimeIdentitySnapshot && SHA256.test(plan.runtimeIdentitySnapshotDigest ?? ''), 'Consumer fleet fanout apply requires a reviewed runtime identity snapshot')
  invariant(typeof runtimeIdentitySnapshotResolver === 'function', 'Consumer fleet fanout apply requires a fresh runtime identity resolver')
  const fresh = runtimeIdentitySnapshotResolver({ phase, repositoryId, now: observedAt, currentGovernance })
  const inventory = {
    repositories: plan.runtimeIdentitySnapshot.repositories.map(repository => ({
      id: repository.repositoryId,
      github: repository.repository,
      role: repository.repositoryRole,
      defaultBranch: repository.defaultBranch,
    })),
  }
  try {
    return assertConsumerFanoutRuntimeIdentityCurrent(plan, fresh, inventory)
  } catch (error) {
    throw new Error(`Consumer fleet runtime identity changed before ${phase}${repositoryId ? ` for ${repositoryId}` : ''}: ${error.message}`)
  }
}

function assertCurrentConsumerFanoutGovernance({
  reloadCurrentGovernance,
  baseline,
  plan,
  reviewReceipt,
  now,
  phase,
}) {
  invariant(typeof reloadCurrentGovernance === 'function', 'Consumer fleet fanout apply requires a canonical governance SSOT reload source')
  const current = reloadCurrentGovernance({ phase, now })
  exactKeys(current, FANOUT_GOVERNANCE_KEYS, 'consumer fleet current governance reload')
  for (const key of FANOUT_GOVERNANCE_KEYS) {
    invariant(
      deepEqual(current[key], baseline[key]),
      `Consumer fleet fanout apply refused: canonical governance SSOT changed before ${phase}: ${key}`,
    )
  }
  validateConsumerFanoutPlan(plan, {
    inventory: current.inventory,
    rings: current.rings,
    issuerRegistry: current.issuerRegistry,
    now,
  })
  validateConsumerFanoutReviewReceipt(reviewReceipt, {
    plan,
    inventory: current.inventory,
    rings: current.rings,
    issuerRegistry: current.issuerRegistry,
    now,
  })
  return current
}

export function executeConsumerFanout({
  plan,
  expectedPlanDigest,
  reviewReceipt,
  inventory,
  rings,
  issuerRegistry,
  governanceModels,
  reloadCurrentGovernance,
  runtimeIdentitySnapshotResolver,
  ghTransport = runClosedGh,
  clock = () => new Date(),
  verificationNotBefore = null,
  onEvidence = () => {},
}) {
  if (ghTransport === runClosedGh) {
    const capturedToken = captureClosedGitHubToken({ requireToken: true })
    ghTransport = (args, options = {}) => runClosedGh(args, {
      ...options,
      environment: {},
      token: capturedToken,
      tokenEnvironmentName: null,
    })
  }
  invariant(plan?.planDigest === expectedPlanDigest && SHA256.test(expectedPlanDigest || ''), 'Consumer fleet fanout apply requires the exact reviewed plan digest')
  invariant(inventory && rings && issuerRegistry, 'Consumer fleet fanout apply requires canonical inventory, release rings, and issuer registry')
  exactKeys(governanceModels, FANOUT_GOVERNANCE_KEYS, 'consumer fleet fanout governance baseline')
  invariant(deepEqual(governanceModels.inventory, inventory)
    && deepEqual(governanceModels.rings, rings)
    && deepEqual(governanceModels.issuerRegistry, issuerRegistry), 'Consumer fleet fanout governance baseline disagrees with the reviewed core models')
  invariant(verificationNotBefore === null || (verificationNotBefore instanceof Date && Number.isFinite(verificationNotBefore.getTime())), 'Consumer fleet fanout verification lower-bound time is invalid')
  const governanceBaseline = clone(governanceModels)
  let lastLiveTime = readFanoutLiveTime(clock, 'Consumer fleet fanout apply', verificationNotBefore)
  const initialAuthorityTime = lastLiveTime
  const initialGovernance = assertCurrentConsumerFanoutGovernance({
    reloadCurrentGovernance,
    baseline: governanceBaseline,
    plan,
    reviewReceipt,
    now: initialAuthorityTime,
    phase: 'initial apply preflight',
  })
  invariant(plan.ready === true && plan.dispatches.length > 0, 'Consumer fleet fanout plan has no dispatchable current-wave consumer')
  requireReviewedRuntimeIdentity(plan, runtimeIdentitySnapshotResolver, 'initial apply preflight', null, initialAuthorityTime, initialGovernance)
  const startedAt = initialAuthorityTime.toISOString()
  const core = {
    schemaVersion: 2,
    kind: 'consumer-fleet-dispatch-evidence',
    planDigest: expectedPlanDigest,
    reviewReceiptDigest: reviewReceipt.receiptDigest,
    candidateReleaseDigest: plan.candidateReleaseDigest,
    runtimeIdentitySnapshotDigest: plan.runtimeIdentitySnapshotDigest,
    startedAt,
    finishedAt: null,
    status: 'started',
    completionClaimed: false,
    authorityRechecks: [],
    authorityValidationFailures: [],
    runtimeRechecks: [],
    runtimeValidationFailures: [],
    requests: [],
    limitations: clone(plan.limitations),
  }
  onEvidence(finalizeDispatchEvidence(core))
  for (const dispatch of plan.dispatches) {
    let decisionTime = null
    let decisionGovernance = null
    try {
      decisionTime = readFanoutLiveTime(clock, 'Consumer fleet fanout dispatch decision', lastLiveTime)
      decisionGovernance = assertCurrentConsumerFanoutGovernance({
        reloadCurrentGovernance,
        baseline: governanceBaseline,
        plan,
        reviewReceipt,
        now: decisionTime,
        phase: `dispatch decision for ${dispatch.repositoryId}`,
      })
      lastLiveTime = decisionTime
    } catch (error) {
      core.authorityValidationFailures.push({ repositoryId: dispatch.repositoryId, code: 'reviewed-authority-drift', message: error.message })
      core.finishedAt = lastLiveTime.toISOString()
      core.status = core.requests.length === 0 ? 'blocked-reviewed-authority-drift' : 'failed-partial-state-possible'
      const evidence = finalizeDispatchEvidence(core)
      onEvidence(evidence)
      return evidence
    }
    try {
      const fresh = requireReviewedRuntimeIdentity(plan, runtimeIdentitySnapshotResolver, 'dispatch decision', dispatch.repositoryId, decisionTime, decisionGovernance)
      core.runtimeRechecks.push({ repositoryId: dispatch.repositoryId, snapshotDigest: fresh.snapshotDigest, status: 'current' })
    } catch (error) {
      core.runtimeValidationFailures.push({ repositoryId: dispatch.repositoryId, code: 'runtime-identity-drift', message: error.message })
      core.finishedAt = decisionTime.toISOString()
      core.status = core.requests.length === 0 ? 'blocked-runtime-identity-drift' : 'failed-partial-state-possible'
      const evidence = finalizeDispatchEvidence(core)
      onEvidence(evidence)
      return evidence
    }
    let mutationBoundaryTime = null
    try {
      mutationBoundaryTime = readFanoutLiveTime(clock, 'Consumer fleet fanout mutation boundary', lastLiveTime)
      assertCurrentConsumerFanoutGovernance({
        reloadCurrentGovernance,
        baseline: governanceBaseline,
        plan,
        reviewReceipt,
        now: mutationBoundaryTime,
        phase: `mutation boundary for ${dispatch.repositoryId}`,
      })
      lastLiveTime = mutationBoundaryTime
      core.authorityRechecks.push({
        repositoryId: dispatch.repositoryId,
        verifiedAt: mutationBoundaryTime.toISOString(),
        planDigest: plan.planDigest,
        reviewReceiptDigest: reviewReceipt.receiptDigest,
        status: 'current-at-mutation-boundary',
      })
    } catch (error) {
      core.authorityValidationFailures.push({ repositoryId: dispatch.repositoryId, code: 'reviewed-authority-drift', message: error.message })
      core.finishedAt = lastLiveTime.toISOString()
      core.status = core.requests.length === 0 ? 'blocked-reviewed-authority-drift' : 'failed-partial-state-possible'
      const evidence = finalizeDispatchEvidence(core)
      onEvidence(evidence)
      return evidence
    }
    const input = `${stableStringify(dispatch.request, 0)}\n`
    const result = ghTransport(['api', '--method', 'POST', dispatch.endpoint, '--input', '-'], {
      cwd: resolve(GOVERNANCE_ROOT, '../..'),
      input,
      maxOutputBytes: 1024 * 1024,
      repoRoot: resolve(GOVERNANCE_ROOT, '../..'),
    })
    const accepted = !result?.error && result?.status === 0
    core.requests.push({
      repositoryId: dispatch.repositoryId,
      repository: dispatch.repository,
      ring: dispatch.ring,
      wave: dispatch.wave,
      endpoint: dispatch.endpoint,
      requestSha256: sha256(input),
      status: accepted ? 'request-accepted-unverified' : 'request-failed',
      exitStatus: Number.isInteger(result?.status) ? result.status : null,
    })
    core.status = accepted ? 'dispatching' : 'failed-partial-state-possible'
    onEvidence(finalizeDispatchEvidence(core))
    if (!accepted) break
  }
  let finishedAt
  try {
    finishedAt = readFanoutLiveTime(clock, 'Consumer fleet fanout completion evidence', lastLiveTime)
  } catch (error) {
    core.authorityValidationFailures.push({ repositoryId: null, code: 'clock-regression-after-dispatch', message: error.message })
    core.finishedAt = lastLiveTime.toISOString()
    core.status = 'failed-partial-state-possible'
    const evidence = finalizeDispatchEvidence(core)
    onEvidence(evidence)
    return evidence
  }
  core.finishedAt = finishedAt.toISOString()
  core.status = core.requests.length === plan.dispatches.length && core.requests.every(item => item.status === 'request-accepted-unverified')
    ? 'requests-accepted-readback-required'
    : 'failed-partial-state-possible'
  const evidence = finalizeDispatchEvidence(core)
  onEvidence(evidence)
  return evidence
}

function writeAtomicJson(path, value, { exclusive = false } = {}) {
  const parent = dirname(path)
  invariant(parent === DEFAULT_INVENTORY_RUNTIME, 'Consumer fleet evidence parent must be the canonical flat runtime directory')
  const runtimeRoot = dirname(DEFAULT_INVENTORY_RUNTIME)
  const runtimeInfo = lstatSync(runtimeRoot)
  invariant(
    runtimeInfo.isDirectory()
      && !runtimeInfo.isSymbolicLink()
      && realpathSync(runtimeRoot) === runtimeRoot,
    'Consumer fleet runtime root must be a canonical real directory',
  )
  if (!existsSync(DEFAULT_INVENTORY_RUNTIME)) mkdirSync(DEFAULT_INVENTORY_RUNTIME)
  const evidenceRootInfo = lstatSync(DEFAULT_INVENTORY_RUNTIME)
  invariant(
    evidenceRootInfo.isDirectory()
      && !evidenceRootInfo.isSymbolicLink()
      && realpathSync(DEFAULT_INVENTORY_RUNTIME) === DEFAULT_INVENTORY_RUNTIME,
    'Consumer fleet evidence root must be a canonical real directory',
  )
  const body = Buffer.from(`${stableStringify(value, 2)}\n`, 'utf8')
  invariant(body.length <= CONSUMER_FANOUT_LIMITS.maxArtifactBytes, `Consumer fleet evidence exceeds the ${CONSUMER_FANOUT_LIMITS.maxArtifactBytes}-byte artifact limit`)
  if (existsSync(path)) {
    const existing = lstatSync(path, { bigint: true })
    invariant(existing.isFile() && !existing.isSymbolicLink() && existing.nlink === 1n, `Existing evidence path is not a regular non-linked file:${path}`)
    if (exclusive) throw new Error(`Evidence path already exists:${path}`)
  }
  invariant(typeof constants.O_NOFOLLOW === 'number', 'Consumer fleet evidence requires O_NOFOLLOW')
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(12).toString('hex')}`
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    writeFileSync(descriptor, body)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  try {
    if (exclusive) {
      linkSync(temporary, path)
      unlinkSync(temporary)
    } else {
      renameSync(temporary, path)
    }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw error
  }
  const written = lstatSync(path, { bigint: true })
  invariant(written.isFile() && !written.isSymbolicLink() && written.nlink === 1n && written.size === BigInt(body.length), `Written evidence path failed atomic regular-file readback:${path}`)
  const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_NOFOLLOW)
  try { fsyncSync(directory) } finally { closeSync(directory) }
}

function runtimeEvidencePath(value) {
  const path = resolve(value)
  const rel = relative(DEFAULT_INVENTORY_RUNTIME, path)
  invariant(
    dirname(path) === DEFAULT_INVENTORY_RUNTIME
      && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(rel)
      && !isAbsolute(rel),
    'Consumer fleet evidence must be one bounded JSON file directly below infra/governance/runtime/consumer-fleet',
  )
  return path
}

function canonicalUpgradeProtocol() {
  const loaded = loadConsumerUpgradeProtocol()
  return { ...loaded, sourceDigests: protocolSourceDigests(loaded) }
}

function repoById(inventory, repoId) {
  const repo = inventory.repositories.find(candidate => candidate.id === repoId)
  invariant(repo, `Unknown repository id ${repoId}`)
  return repo
}

function localRootFor(repo, override) {
  if (override) return resolve(override)
  const path = repo.localPathFromGovernanceRoot ?? repo.mirrorSourcePathFromGovernanceRoot
  invariant(path, `Repository ${repo.id} has no local path; pass --root`)
  return resolve(GOVERNANCE_ROOT, path)
}

export function inventoryView(inventory) {
  validateInventory(inventory)
  const { protocol } = canonicalUpgradeProtocol()
  return inventory.repositories.map(repo => {
    const configuredPath = repo.localPathFromGovernanceRoot ?? repo.mirrorSourcePathFromGovernanceRoot ?? null
    const localPath = configuredPath ? resolve(GOVERNANCE_ROOT, configuredPath) : null
    const profile = repo.role === 'authority' ? null : upgradeProfile(protocol, repo.upgradeProtocolProfile)
    const acceptedBootstrapReadbackSha256 = repo.acceptedBootstrapReadbackSha256 ?? null
    const acceptedControlPlaneUpdate = repo.acceptedControlPlaneUpdate ?? null
    invariant(
      repo.role === 'authority' || /^[a-f0-9]{64}$/.test(acceptedBootstrapReadbackSha256 ?? '') === profile.acceptedBootstrapBindingRequired,
      `Repository ${repo.id} accepted bootstrap readback binding does not match profile ${repo.upgradeProtocolProfile}`,
    )
    invariant(
      repo.role === 'authority' || (acceptedControlPlaneUpdate !== null) === profile.controlPlaneUpdateBindingRequired,
      `Repository ${repo.id} accepted control-plane update binding does not match profile ${repo.upgradeProtocolProfile}`,
    )
    return {
      id: repo.id,
      github: repo.github,
      role: repo.role,
      desiredProfile: repo.desiredProfile,
      releaseRing: repo.releaseRing,
      ownershipPolicy: repo.ownershipPolicy,
      upgradeProtocolProfile: repo.upgradeProtocolProfile ?? null,
      acceptedBootstrapReadbackSha256,
      acceptedControlPlaneUpdate: clone(acceptedControlPlaneUpdate),
      bootstrapRequired: profile?.bootstrapRequired ?? false,
      controlPlaneUpdateMode: profile?.controlPlaneUpdateMode ?? null,
      localPath,
      localPresent: localPath ? existsSync(localPath) : false,
    }
  })
}

function githubSlugFromRemote(remote) {
  const match = remote.trim().match(/github\.com(?::|\/)([^/\s]+\/[^/\s]+?)(?:\.git)?$/)
  return match?.[1] ?? null
}

function gitRead(root, args) {
  const cwd = realpathSync(resolve(root))
  try {
    assertClosedGitLocalConfiguration(cwd)
  } catch (error) {
    return { ok: false, detail: error.message }
  }
  const result = runClosedGit(args, {
    cwd,
    maxOutputBytes: 4 * 1024 * 1024,
  })
  if (result.error) return { ok: false, detail: result.error.message }
  if (result.signal !== null || result.status !== 0) return { ok: false, detail: (result.stderr || result.stdout).trim() }
  return { ok: true, value: result.stdout.trim() }
}

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part) ?? [],
  }
}

function compareVersion(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
  if (right.prerelease.length === 0 && left.prerelease.length > 0) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const a = left.prerelease[index]
    const b = right.prerelease[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue
    if (typeof a === 'number' && typeof b === 'string') return -1
    if (typeof a === 'string' && typeof b === 'number') return 1
    return a < b ? -1 : 1
  }
  return 0
}

export function checkPackageCompatibility(packageJson, repo, matrix) {
  const findings = []
  const requirements = matrix.upgradeCompatibility?.packages ?? {}
  const declared = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }
  for (const packageName of repo.consumes ?? []) {
    const requirement = requirements[packageName]
    if (!requirement) {
      findings.push({ severity: 'error', code: 'missing-compatibility-rule', message: `${packageName} has no compatibility rule` })
      continue
    }
    const spec = declared[packageName]
    if (!spec) {
      findings.push({ severity: 'error', code: 'missing-package', message: `${packageName} is not declared` })
      continue
    }
    let accepted = false
    try {
      accepted = requirement.acceptedSpecPatterns.some(pattern => new RegExp(pattern).test(spec))
    } catch (error) {
      findings.push({ severity: 'error', code: 'invalid-compatibility-regex', message: `${packageName}: ${error.message}` })
      continue
    }
    if (!accepted) findings.push({ severity: 'error', code: 'unsupported-package-spec', message: `${packageName} spec ${spec} is outside the exact-version policy` })
    const current = parseVersion(spec)
    const minimum = parseVersion(requirement.minimumVersion)
    if (!current) {
      findings.push({ severity: 'error', code: 'floating-package-channel', message: `${packageName} must use one exact immutable semver; got ${spec}` })
    } else if (minimum && compareVersion(current, minimum) < 0) {
      findings.push({ severity: 'error', code: 'package-below-minimum', message: `${packageName} ${spec} is below ${requirement.minimumVersion}` })
    } else if (accepted) {
      findings.push({ severity: 'info', code: 'package-compatible', message: `${packageName} ${spec} satisfies protocol ${matrix.upgradeCompatibility.governanceProtocol}` })
    }
  }
  return findings
}

export function doctorRepository({ inventory, desired, matrix, rings, certifications, waivers, repoId, root, now = new Date(), issuerRegistry, runtimeProfile, runtimeValidationContext = {} }) {
  const governance = validateConsumerGovernanceModel({
    inventory,
    desired,
    matrix,
    rings,
    certifications,
    waivers,
    now,
    issuerRegistry,
    runtimeProfile,
    runtimeValidationContext,
    typedRuntimeBlocker: true,
  })
  const repo = repoById(inventory, repoId)
  const repoRoot = localRootFor(repo, root)
  const findings = governance.blocker ? [governance.blocker] : []
  const upgrade = canonicalUpgradeProtocol()
  const upgradePolicy = repo.role === 'authority' ? null : upgradeProfile(upgrade.protocol, repo.upgradeProtocolProfile)
  if (!existsSync(repoRoot)) {
    findings.push({ severity: 'error', code: 'local-root-missing', message: `Local root does not exist: ${repoRoot}` })
  } else {
    const remote = gitRead(repoRoot, ['config', '--get', 'remote.origin.url'])
    if (remote.ok) {
      const slug = githubSlugFromRemote(remote.value)
      if (slug !== repo.github) findings.push({ severity: 'error', code: 'remote-mismatch', message: `Expected ${repo.github}, got ${slug ?? remote.value}` })
      else findings.push({ severity: 'info', code: 'remote-match', message: `origin maps to ${repo.github}` })
      const dirty = gitRead(repoRoot, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--ignore-submodules=none',
        '--no-renames',
      ])
      if (dirty.ok && dirty.value) findings.push({ severity: 'warning', code: 'dirty-worktree', message: 'Local worktree has uncommitted changes; upgrade planning remains read-only.' })
    } else if (repo.role !== 'template-mirror') {
      findings.push({ severity: 'error', code: 'git-metadata-unavailable', message: remote.detail })
    }

    const packagePath = resolve(repoRoot, 'package.json')
    if ((repo.consumes ?? []).length > 0) {
      if (!existsSync(packagePath)) findings.push({ severity: 'error', code: 'package-json-missing', message: `${packagePath} is missing` })
      else findings.push(...checkPackageCompatibility(readJson(packagePath), repo, matrix))
    }
    if (upgradePolicy) {
      const lockPath = resolve(repoRoot, 'governance/lock.json')
      if (!existsSync(lockPath)) {
        findings.push({ severity: 'blocker', code: 'upgrade-protocol-lock-missing', message: `${repo.id} lacks the protected-base reconstruction v2 lock; ordinary sync-all is not eligible.` })
      } else {
        try {
          validateProtocolLock(readJson(lockPath).upgradeProtocol, upgrade.protocol, upgrade.sourceDigests)
          findings.push({ severity: 'info', code: 'upgrade-protocol-lock-current', message: `${repo.id} carries the exact protected-base reconstruction v2 lock.` })
        } catch (error) {
          findings.push({ severity: 'blocker', code: 'upgrade-protocol-lock-stale', message: error.message })
        }
      }
      if (upgradePolicy.bootstrapRequired) {
        findings.push({
          severity: 'blocker',
          code: 'legacy-bootstrap-readback-required',
          message: `${repo.id} remains in the one-time reviewed full-snapshot bootstrap profile. A signed independent ${upgradePolicy.bootstrapEvidenceContract} must be accepted before inventory may move to ordinary sync-all.`,
        })
      } else if (upgradePolicy.acceptedBootstrapBindingRequired) {
        findings.push({
          severity: 'info',
          code: 'reviewed-bootstrap-established',
          message: `${repo.id} ordinary sync-all eligibility is bound to accepted bootstrap readback ${repo.acceptedBootstrapReadbackSha256}.`,
        })
      }
      if (upgradePolicy.controlPlaneUpdateBindingRequired) {
        findings.push({
          severity: 'info',
          code: 'reviewed-control-plane-chain-established',
          message: `${repo.id} control-plane state is bound to accepted sequence ${repo.acceptedControlPlaneUpdate.sequence} readback ${repo.acceptedControlPlaneUpdate.readbackSha256}.`,
        })
      }
    }
  }

  const assignment = rings.assignments?.[repo.id]
  if (!assignment) findings.push({ severity: 'error', code: 'ring-assignment-missing', message: `No release-ring assignment for ${repo.id}` })
  else {
    for (const blocker of assignment.manualBlockers ?? []) findings.push({ severity: 'blocker', code: 'release-ring-manual-blocker', message: blocker })
    if (!assignment.applyAuthorization) findings.push({ severity: 'info', code: 'release-ring-not-authorized', message: 'Release wave has no cryptographically signed candidate/BOM/plan/predicate/state/head-bound apply authorization; reconciler will not mutate it.' })
    if (!assignment.completionAttestation) findings.push({ severity: 'info', code: 'release-ring-not-complete', message: 'Release wave has no cryptographically signed exact-readback completion attestation; downstream waves remain blocked.' })
  }

  const certificationById = new Map(certifications.certifications.map(item => [certificationKey(item.provider, item.runtimeKind, item.surface, item.repositoryRole), item]))
  for (const requirement of repo.providerSurfacesRequired ?? []) {
    const [provider, runtimeKind, surface] = requirement.split('/')
    const certification = certificationById.get(certificationKey(provider, runtimeKind, surface, repo.role))
    if (!certification || certification.status !== 'certified') {
      findings.push({ severity: 'blocker', code: 'surface-not-certified', message: `${requirement} is not certified for ${repo.role}` })
    }
  }

  const policy = inventory.ownershipPolicies[repo.ownershipPolicy]
  for (const rule of policy.rules) {
    try {
      resolveOwnership(policy, rule.pattern.replace(/\*\*?/g, 'sample'))
    } catch (error) {
      findings.push({ severity: 'error', code: 'ownership-ambiguous', message: error.message })
    }
  }

  const ok = !findings.some(finding => finding.severity === 'error' || finding.severity === 'blocker')
  return { schemaVersion: 1, repoId, root: repoRoot, ok, findings }
}

function sameState(left, right) {
  return left.kind === right.kind && left.hash === right.hash
}

function unsupportedState(...states) {
  return states.find(state => !['absent', 'file'].includes(state.kind))
}

function actionFromIncoming(path, ownership, incoming) {
  if (incoming.kind === 'absent') return { path, ownershipMode: ownership.mode, owner: ownership.owner, operation: 'delete', incomingHash: null }
  return { path, ownershipMode: ownership.mode, owner: ownership.owner, operation: 'replace', incomingHash: incoming.hash }
}

function buildUpgradePlan({ inventory, repoId, root, base, incoming, planKind }) {
  validateInventory(inventory)
  const repo = repoById(inventory, repoId)
  const upgrade = canonicalUpgradeProtocol()
  const profile = upgradeProfile(upgrade.protocol, repo.upgradeProtocolProfile)
  const acceptedBootstrapReadbackSha256 = repo.acceptedBootstrapReadbackSha256 ?? null
  const acceptedControlPlaneUpdate = repo.acceptedControlPlaneUpdate ?? null
  invariant(
    /^[a-f0-9]{64}$/.test(acceptedBootstrapReadbackSha256 ?? '') === profile.acceptedBootstrapBindingRequired,
    `Repository ${repo.id} accepted bootstrap readback binding does not match profile ${repo.upgradeProtocolProfile}`,
  )
  invariant(
    (acceptedControlPlaneUpdate !== null) === profile.controlPlaneUpdateBindingRequired,
    `Repository ${repo.id} accepted control-plane update binding does not match profile ${repo.upgradeProtocolProfile}`,
  )
  invariant(planKind === 'ordinary-upgrade' || planKind === 'reviewed-full-snapshot-bootstrap', `Unsupported consumer upgrade plan kind ${planKind}`)
  if (planKind === 'reviewed-full-snapshot-bootstrap') {
    invariant(profile.bootstrapRequired === true && profile.entryMode === 'one-time-reviewed-full-snapshot-pr', `Repository ${repo.id} is not assigned to the legacy reviewed-bootstrap profile`)
  }
  const currentRoot = localRootFor(repo, root)
  const baseRoot = resolve(base)
  const incomingRoot = resolve(incoming)
  invariant(existsSync(currentRoot), `Current root does not exist: ${currentRoot}`)
  invariant(existsSync(baseRoot), `Base root does not exist: ${baseRoot}`)
  invariant(existsSync(incomingRoot), `Incoming root does not exist: ${incomingRoot}`)
  const policy = inventory.ownershipPolicies[repo.ownershipPolicy]
  const candidatePaths = new Set([...listFiles(baseRoot), ...listFiles(incomingRoot)])
  for (const path of listFiles(currentRoot)) {
    try {
      const ownership = resolveOwnership(policy, path)
      if (ownership.mode !== 'consumer-owned' && ownership.mode !== 'authority') candidatePaths.add(path)
    } catch {
      // Keep ambiguous paths in the candidate set so the main planning pass records
      // a typed conflict instead of throwing before a reviewable plan exists.
      candidatePaths.add(path)
    }
  }

  const actions = []
  const conflicts = []
  const preserved = []
  for (const path of [...candidatePaths].sort()) {
    let ownership
    try {
      ownership = resolveOwnership(policy, path)
    } catch (error) {
      conflicts.push({ path, ownershipMode: 'ambiguous', reason: error.message })
      continue
    }
    const baseState = readPathState(baseRoot, path)
    const currentState = readPathState(currentRoot, path)
    const incomingState = readPathState(incomingRoot, path)
    const unsupported = unsupportedState(baseState, currentState, incomingState)
    if (unsupported) {
      conflicts.push({ path, ownershipMode: ownership.mode, reason: `Unsupported path type ${unsupported.kind}` })
      continue
    }

    if (ownership.mode === 'consumer-owned' || ownership.mode === 'authority') {
      if (!sameState(baseState, incomingState)) {
        conflicts.push({ path, ownershipMode: ownership.mode, reason: 'incoming-touches-non-upstream-owned-path' })
      } else {
        preserved.push({ path, ownershipMode: ownership.mode, reason: 'owned-outside-upstream' })
      }
      continue
    }

    if (sameState(currentState, incomingState)) {
      preserved.push({ path, ownershipMode: ownership.mode, reason: 'already-at-incoming' })
      continue
    }

    if (ownership.mode === 'generated' || ownership.mode === 'upstream-managed') {
      if (!sameState(currentState, baseState)) {
        conflicts.push({ path, ownershipMode: ownership.mode, reason: 'local-edit-on-managed-file', baseHash: baseState.hash, currentHash: currentState.hash, incomingHash: incomingState.hash })
      } else {
        actions.push(actionFromIncoming(path, ownership, incomingState))
      }
      continue
    }

    if (ownership.mode === 'three-way') {
      if (sameState(currentState, baseState)) {
        actions.push(actionFromIncoming(path, ownership, incomingState))
      } else if (sameState(incomingState, baseState)) {
        preserved.push({ path, ownershipMode: ownership.mode, reason: 'consumer-only-change' })
      } else {
        conflicts.push({ path, ownershipMode: ownership.mode, reason: 'three-way-content-conflict', baseHash: baseState.hash, currentHash: currentState.hash, incomingHash: incomingState.hash })
      }
    }
  }

  const protocolBlockers = planKind === 'ordinary-upgrade' && profile.bootstrapRequired
    ? [{ code: 'legacy-bootstrap-required', message: `${repo.id} cannot use ordinary sync-all until independent ${profile.bootstrapEvidenceContract} has been accepted and its inventory profile promoted.` }]
    : []
  const digestInput = {
    repoId,
    planKind,
    protocolId: upgrade.protocol.protocolId,
    protocolSourceDigests: upgrade.sourceDigests,
    profileId: repo.upgradeProtocolProfile,
    acceptedBootstrapReadbackSha256,
    acceptedControlPlaneUpdate,
    actions,
    conflicts,
    preserved,
    protocolBlockers,
  }
  return {
    schemaVersion: 2,
    kind: planKind === 'ordinary-upgrade' ? 'consumer-ordinary-upgrade-plan' : 'consumer-reviewed-full-snapshot-bootstrap-plan',
    repoId,
    readOnly: true,
    mutationAuthorized: false,
    rolloutCompletionEligible: false,
    ordinarySyncEligible: planKind === 'ordinary-upgrade' && protocolBlockers.length === 0,
    ok: conflicts.length === 0 && protocolBlockers.length === 0,
    reviewReady: planKind === 'reviewed-full-snapshot-bootstrap' && conflicts.length === 0,
    upgradeProtocol: {
      protocolId: upgrade.protocol.protocolId,
      ...upgrade.sourceDigests,
      profileId: repo.upgradeProtocolProfile,
      entryMode: profile.entryMode,
      requiredEvidenceContract: profile.bootstrapEvidenceContract,
      acceptedBootstrapReadbackSha256,
      acceptedControlPlaneUpdate: clone(acceptedControlPlaneUpdate),
      postAcceptanceProfile: profile.postAcceptanceProfile,
      controlPlaneUpdateMode: profile.controlPlaneUpdateMode,
      controlPlaneUpdateEvidenceContract: profile.controlPlaneUpdateEvidenceContract,
      postControlPlaneUpdateProfile: profile.postControlPlaneUpdateProfile,
    },
    roots: { current: currentRoot, base: baseRoot, incoming: incomingRoot },
    summary: { actions: actions.length, conflicts: conflicts.length, preserved: preserved.length, blockers: protocolBlockers.length },
    actions,
    conflicts,
    preserved,
    blockers: protocolBlockers,
    planDigest: sha256(stableStringify(digestInput, 0)),
  }
}

export function planUpgrade(input) {
  return buildUpgradePlan({ ...input, planKind: 'ordinary-upgrade' })
}

export function planBootstrap(input) {
  return buildUpgradePlan({ ...input, planKind: 'reviewed-full-snapshot-bootstrap' })
}

function printInventory(view) {
  for (const repo of view) console.log(`${repo.id}\t${repo.role}\t${repo.github}\t${repo.releaseRing}\tlocal=${repo.localPresent ? repo.localPath : 'absent'}`)
}

function printDoctor(result) {
  console.log(`${result.repoId}: ${result.ok ? 'OK' : 'BLOCKED'} (${result.root})`)
  for (const finding of result.findings) console.log(`  ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`)
}

function printUpgrade(plan) {
  console.log(`${plan.repoId} ${plan.kind} ${plan.planDigest}: ${plan.summary.actions} action(s), ${plan.summary.conflicts} conflict(s), ${plan.summary.preserved} preserved, ${plan.summary.blockers} blocker(s)`)
  for (const action of plan.actions) console.log(`  ${action.operation.toUpperCase()} ${action.path} [${action.ownershipMode}]`)
  for (const conflict of plan.conflicts) console.log(`  CONFLICT ${conflict.path} [${conflict.ownershipMode}]: ${conflict.reason}`)
  for (const blocker of plan.blockers) console.log(`  BLOCKED ${blocker.code}: ${blocker.message}`)
}

function printRegistration(proposal) {
  console.log(`${proposal.proposed.repository.id} registration proposal ${proposal.proposalDigest}`)
  console.log(`  repository: ${proposal.proposed.repository.github}`)
  console.log(`  release wave: ${proposal.proposed.assignment.ring}/${proposal.proposed.assignment.wave}`)
  console.log('  mutation: not authorized; review both after-images in one protected Design System PR')
}

function printFanout(plan) {
  console.log(`consumer fleet fanout ${plan.planDigest}: ${plan.dispatches.length} dispatch(es), ${plan.coverage.registeredProductConsumers} registered product consumer(s)`)
  if (plan.current) console.log(`  current wave: ${plan.current.ring}/${plan.current.wave} budget=${plan.current.budget}`)
  else console.log('  current wave: none')
  for (const blocker of plan.blockers) console.log(`  ${blocker.severity.toUpperCase()} ${blocker.code}: ${blocker.message}`)
  for (const repository of plan.repositories) {
    console.log(`  ${repository.status.toUpperCase()} ${repository.repositoryId}${repository.blockers.length ? `: ${repository.blockers.join('; ')}` : ''}`)
  }
}

function readBoundedArtifactBytes(path, label, maxBytes) {
  invariant(path, `${label} path is required`)
  invariant(Number.isSafeInteger(maxBytes) && maxBytes > 0, `${label} byte limit is invalid`)
  const absolute = resolve(path)
  let descriptor
  try {
    invariant(typeof constants.O_NOFOLLOW === 'number', `${label} cannot be read safely because O_NOFOLLOW is unavailable`)
    const before = lstatSync(absolute, { bigint: true })
    invariant(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file`)
    invariant(before.nlink === 1n, `${label} must not be hard-linked`)
    invariant((before.mode & 0o7000n) === 0n, `${label} has unsupported special permission bits`)
    invariant(before.size <= BigInt(maxBytes), `${label} exceeds the ${maxBytes}-byte artifact limit`)
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = fstatSync(descriptor, { bigint: true })
    const same = (left, right) => left.dev === right.dev
      && left.ino === right.ino
      && left.mode === right.mode
      && left.nlink === right.nlink
      && left.size === right.size
      && left.mtimeNs === right.mtimeNs
      && left.ctimeNs === right.ctimeNs
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n, `${label} must remain a regular non-linked file`)
    invariant(same(before, info), `${label} changed while it was opened`)
    const bytes = readFileSync(descriptor)
    invariant(bytes.length <= maxBytes, `${label} exceeds the ${maxBytes}-byte artifact limit after readback`)
    const afterDescriptor = fstatSync(descriptor, { bigint: true })
    const afterPath = lstatSync(absolute, { bigint: true })
    invariant(
      same(info, afterDescriptor)
        && same(afterDescriptor, afterPath)
        && BigInt(bytes.length) === afterDescriptor.size,
      `${label} changed or was substituted while it was read`,
    )
    return bytes
  } catch (error) {
    throw new Error(`Cannot read ${label}:${error.message}`)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function readArtifact(path, label, { maxBytes = CONSUMER_FANOUT_LIMITS.maxGenericArtifactBytes } = {}) {
  try {
    return JSON.parse(readBoundedArtifactBytes(path, label, maxBytes).toString('utf8'))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`Cannot read ${label}:`)) throw error
    throw new Error(`Cannot read ${label}: ${error.message}`)
  }
}

function readArtifactBytes(path, label, { maxBytes = CONSUMER_FANOUT_LIMITS.maxGenericArtifactBytes } = {}) {
  return readBoundedArtifactBytes(path, label, maxBytes)
}

function exactCommandFlags(command, flags, allowed, argv) {
  const accepted = new Set(allowed)
  const unexpected = Object.keys(flags).filter(name => name !== '_' && !accepted.has(name))
  invariant(unexpected.length === 0, `${command} does not accept ${unexpected.map(name => `--${name}`).join(', ')}`)
  const seen = new Set()
  for (const token of argv) {
    if (!token.startsWith('--')) continue
    const name = token.slice(2).split('=', 1)[0]
    invariant(!seen.has(name), `${command} does not accept duplicate --${name}`)
    seen.add(name)
  }
}

function bootstrapSourceInput(flags, inventoryBytes, inventory) {
  invariant(flags['repo-id'], 'consumer bootstrap source command requires --repo-id')
  invariant(flags.root && flags.base && flags.incoming, 'consumer bootstrap source command requires --root, --base, and --incoming')
  invariant(flags['release-bom'], 'consumer bootstrap source command requires --release-bom')
  invariant(flags['required-checks-digest'], 'consumer bootstrap source command requires --required-checks-digest')
  const rings = readArtifact(resolve(flags.rings ?? DEFAULT_RINGS), 'release rings')
  validateReleaseRings(inventory, rings)
  invariant(rings.candidateRelease, 'consumer bootstrap requires the release-rings SSOT to contain one immutable candidate release')
  return {
    inventoryBytes,
    repoId: flags['repo-id'],
    roots: { current: flags.root, base: flags.base, incoming: flags.incoming },
    candidateRelease: rings.candidateRelease,
    releaseBomBytes: readArtifactBytes(flags['release-bom'], 'release BOM'),
    requiredChecksDigest: flags['required-checks-digest'],
  }
}

function controlPlaneUpdateSourceInput(flags, inventoryBytes, inventory, {
  issuerRegistry,
  now,
}) {
  invariant(flags['repo-id'], 'consumer control-plane update source command requires --repo-id')
  invariant(flags.root && flags.base && flags.incoming, 'consumer control-plane update source command requires --root, --base, and --incoming')
  invariant(flags['release-bom'], 'consumer control-plane update source command requires --release-bom')
  invariant(flags['scaffold-lock'], 'consumer control-plane update source command requires --scaffold-lock')
  const rings = readArtifact(resolve(flags.rings ?? DEFAULT_RINGS), 'release rings')
  validateReleaseRings(inventory, rings)
  invariant(rings.candidateRelease, 'consumer control-plane update requires the release-rings SSOT to contain one immutable candidate release')
  return {
    inventoryBytes,
    repoId: flags['repo-id'],
    roots: { current: flags.root, base: flags.base, incoming: flags.incoming },
    candidateRelease: rings.candidateRelease,
    releaseBomBytes: readArtifactBytes(flags['release-bom'], 'release BOM'),
    scaffoldLockBytes: readArtifactBytes(flags['scaffold-lock'], 'product-template scaffold lock'),
    baselineReceipt: flags['baseline-receipt']
      ? readArtifact(flags['baseline-receipt'], 'consumer control-plane baseline receipt')
      : undefined,
    issuerRegistry,
    attestationPolicy: rings.attestationPolicy,
    now,
  }
}

function printBootstrapArtifact(value) {
  const digest = value.planDigest ?? value.verificationDigest ?? value.proposalDigest
  console.log(`${value.kind} ${digest}`)
  if (value.mutationAuthorized === false) console.log('  mutation: not authorized')
  if (value.reviewReady !== undefined) console.log(`  review ready: ${value.reviewReady}`)
}

function fanoutGovernanceModels(flags, inventory, rings, issuerRegistry, runtimeProfile) {
  return {
    inventory,
    desired: readJson(resolve(flags.desired ?? DEFAULT_DESIRED)),
    rings,
    certifications: readJson(resolve(flags.certifications ?? DEFAULT_CERTIFICATIONS)),
    waivers: readJson(resolve(flags.waivers ?? DEFAULT_WAIVERS)),
    matrix: readJson(resolve(flags.matrix ?? DEFAULT_MATRIX)),
    runtimeProfile,
    issuerRegistry,
  }
}

function validateFanoutGovernance(models, { now = new Date(), runtimeValidationContext = {}, typedRuntimeBlocker = false } = {}) {
  return validateConsumerGovernanceModel({
    ...models,
    now,
    runtimeValidationContext,
    typedRuntimeBlocker,
  })
}

function resolveCommandRuntimeValidationContext({ client, inventory, certifications, runtimeProfile, runtimeValidationContext, offline, command }) {
  if (offline) {
    invariant(runtimeValidationContext && typeof runtimeValidationContext === 'object' && !Array.isArray(runtimeValidationContext), 'Runtime validation context must be an object')
    invariant(Object.keys(runtimeValidationContext).length === 0, `${command} offline mode refuses an injected runtime validation identity`)
    return {}
  }
  return resolveGitHubRuntimeValidationContext({
    client,
    inventory,
    certifications,
    repoRoot: runtimeCertificationPaths.repoRoot,
    runtimeProfile,
    runtimeValidationContext,
    live: true,
  })
}

export function assertConsumerFanoutRuntimeIdentityCurrent(plan, currentSnapshot, inventory) {
  invariant(plan?.runtimeIdentitySnapshot && SHA256.test(plan.runtimeIdentitySnapshotDigest ?? ''), 'Consumer fleet fanout check requires a reviewed runtime identity snapshot')
  validateConsumerRuntimeIdentitySnapshot(plan.runtimeIdentitySnapshot, inventory)
  validateConsumerRuntimeIdentitySnapshot(currentSnapshot, inventory)
  invariant(
    currentSnapshot.snapshotDigest === plan.runtimeIdentitySnapshotDigest
      && stableStringify(currentSnapshot, 0) === stableStringify(plan.runtimeIdentitySnapshot, 0),
    'Consumer fleet fanout reviewed runtime identity snapshot is stale or replayed',
  )
  return currentSnapshot
}

export function validateConsumerFanoutCheckReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'status', 'ready', 'readOnly', 'mutationAuthorized',
    'completionClaimed', 'checkedAt', 'planDigest', 'reviewReceiptDigest',
    'reviewedRuntimeIdentitySnapshotDigest', 'observedRuntimeIdentitySnapshotDigest',
    'blockers', 'limitations', 'checkDigest',
  ], 'consumer fleet fanout check receipt')
  invariant(value.schemaVersion === 1
    && value.kind === 'consumer-fleet-fanout-check'
    && ['ready', 'blocked'].includes(value.status)
    && typeof value.ready === 'boolean'
    && value.readOnly === true
    && value.mutationAuthorized === false
    && value.completionClaimed === false, 'Consumer fleet fanout check receipt identity is invalid')
  canonicalUtc(value.checkedAt, 'Consumer fleet fanout check checkedAt')
  invariant(SHA256.test(value.planDigest ?? '')
    && SHA256.test(value.reviewReceiptDigest ?? '')
    && SHA256.test(value.reviewedRuntimeIdentitySnapshotDigest ?? ''), 'Consumer fleet fanout check receipt digest binding is invalid')
  invariant(value.observedRuntimeIdentitySnapshotDigest === null
    || SHA256.test(value.observedRuntimeIdentitySnapshotDigest), 'Consumer fleet fanout observed runtime identity digest is invalid')
  invariant(Array.isArray(value.blockers), 'Consumer fleet fanout check blockers must be an array')
  for (const blocker of value.blockers) {
    exactKeys(blocker, ['severity', 'code', 'message'], 'consumer fleet fanout check blocker')
    invariant(blocker.severity === 'blocker'
      && typeof blocker.code === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(blocker.code)
      && typeof blocker.message === 'string' && blocker.message.length > 0, 'Consumer fleet fanout check blocker is invalid')
  }
  invariant(stableStringify(value.limitations, 0) === stableStringify(FANOUT_CHECK_LIMITATIONS, 0), 'Consumer fleet fanout check limitations are invalid')
  if (value.ready) {
    invariant(value.status === 'ready'
      && value.blockers.length === 0
      && value.observedRuntimeIdentitySnapshotDigest === value.reviewedRuntimeIdentitySnapshotDigest,
    'Ready consumer fleet fanout check lacks an exact current runtime identity readback')
  } else {
    invariant(value.status === 'blocked' && value.blockers.length > 0, 'Blocked consumer fleet fanout check lacks a typed blocker')
  }
  const { checkDigest, ...core } = value
  invariant(SHA256.test(checkDigest ?? '') && checkDigest === fanoutCheckReceiptDigest(core), 'Consumer fleet fanout check receipt digest is stale')
  return value
}

export function createConsumerFanoutCheckReceipt({
  plan,
  reviewReceipt,
  inventory,
  checkedAt,
  observedRuntimeIdentitySnapshot = null,
  blockers = [],
}) {
  invariant(checkedAt instanceof Date && Number.isFinite(checkedAt.getTime()), 'Consumer fleet fanout check requires a valid checkedAt')
  invariant(plan?.runtimeIdentitySnapshot && SHA256.test(plan.runtimeIdentitySnapshotDigest ?? ''), 'Consumer fleet fanout check requires a reviewed runtime identity snapshot')
  invariant(SHA256.test(plan.planDigest ?? '') && SHA256.test(reviewReceipt?.receiptDigest ?? ''), 'Consumer fleet fanout check requires reviewed plan and receipt digests')
  const normalizedBlockers = clone(blockers)
  const observed = observedRuntimeIdentitySnapshot === null
    ? null
    : assertConsumerFanoutRuntimeIdentityCurrent(plan, observedRuntimeIdentitySnapshot, inventory)
  invariant(observed !== null || normalizedBlockers.length > 0, 'Consumer fleet fanout check without live runtime identity must contain a typed blocker')
  const ready = observed !== null && normalizedBlockers.length === 0
  const core = {
    schemaVersion: 1,
    kind: 'consumer-fleet-fanout-check',
    status: ready ? 'ready' : 'blocked',
    ready,
    readOnly: true,
    mutationAuthorized: false,
    completionClaimed: false,
    checkedAt: checkedAt.toISOString(),
    planDigest: plan.planDigest,
    reviewReceiptDigest: reviewReceipt.receiptDigest,
    reviewedRuntimeIdentitySnapshotDigest: plan.runtimeIdentitySnapshotDigest,
    observedRuntimeIdentitySnapshotDigest: observed?.snapshotDigest ?? null,
    blockers: normalizedBlockers,
    limitations: [...FANOUT_CHECK_LIMITATIONS],
  }
  return Object.freeze(validateConsumerFanoutCheckReceipt({
    ...core,
    checkDigest: fanoutCheckReceiptDigest(core),
  }))
}

function blockedOfflineFanoutCheck(plan, reviewReceipt, checkedAt, governanceBlocker = null) {
  const blocker = governanceBlocker ?? {
    severity: 'blocker',
    code: 'live-runtime-identity-readback-required',
    message: 'Offline fanout check validated the reviewed artifact but cannot assert that its runtime/profile/Harness and repository commit/tree identity snapshot is still current.',
  }
  return createConsumerFanoutCheckReceipt({
    plan,
    reviewReceipt,
    checkedAt,
    blockers: [blocker],
  })
}

function printFanoutCheck(check) {
  console.log(`consumer fleet fanout check ${check.planDigest}: ${check.status}; checkedAt=${check.checkedAt}; identity=${check.observedRuntimeIdentitySnapshotDigest ?? 'not-observed'}; receipt=${check.checkDigest}`)
  for (const blocker of check.blockers) console.log(`  ${blocker.severity.toUpperCase()} ${blocker.code}: ${blocker.message}`)
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const {
    client: providedClient = null,
    runtimeValidationContext = {},
    ghTransport = runClosedGh,
    clock = () => new Date(),
    now = new Date(),
    issuerRegistry: providedIssuerRegistry = null,
    runtimeProfile: providedRuntimeProfile = null,
  } = dependencies
  const flags = parseFlags(argv, {
    inventory: 'string',
    desired: 'string',
    matrix: 'string',
    rings: 'string',
    certifications: 'string',
    waivers: 'string',
    'repo-id': 'string',
    root: 'string',
    base: 'string',
    incoming: 'string',
    proposal: 'string',
    'plan-file': 'string',
    'release-bom': 'string',
    'scaffold-lock': 'string',
    'baseline-receipt': 'string',
    'required-checks-digest': 'string',
    output: 'string',
    'materialized-root': 'string',
    readback: 'string',
    evidence: 'string',
    'expected-plan-digest': 'string',
    'review-receipt': 'string',
    'signing-request': 'string',
    signatures: 'string',
    decision: 'string',
    'issued-at': 'string',
    'expires-at': 'string',
    github: 'string',
    visibility: 'string',
    'default-branch': 'string',
    'local-path': 'string',
    ring: 'string',
    wave: 'string',
    'entered-at': 'string',
    to: 'string',
    json: 'boolean',
    offline: 'boolean',
  })
  const [command, ...extra] = flags._
  invariant(command && extra.length === 0, 'Usage: consumerctl.mjs <inventory|doctor|plan-upgrade|plan-bootstrap|materialize-bootstrap|check-bootstrap-materialization|check-bootstrap-readback|plan-bootstrap-promotion|check-bootstrap-promotion|plan-control-plane-update|materialize-control-plane-update|check-control-plane-materialization|check-control-plane-readback|plan-control-plane-acceptance|check-control-plane-acceptance|plan-registration|check-registration|plan-fanout|prepare-fanout-review|assemble-fanout-review|check-fanout|apply-fanout> [options]')
  const inventoryPath = resolve(flags.inventory ?? DEFAULT_INVENTORY)
  const inventoryBytes = readArtifactBytes(inventoryPath, 'managed repository inventory')
  let inventory
  try {
    inventory = JSON.parse(inventoryBytes.toString('utf8'))
  } catch (error) {
    throw new Error(`Cannot read managed repository inventory: ${error.message}`)
  }
  validateInventory(inventory)

  const bootstrapSourceCommands = new Set([
    'plan-bootstrap',
    'materialize-bootstrap',
    'check-bootstrap-readback',
    'plan-bootstrap-promotion',
    'check-bootstrap-promotion',
  ])
  if (bootstrapSourceCommands.has(command)) {
    const commonFlags = [
      'inventory', 'rings', 'repo-id', 'root', 'base', 'incoming', 'release-bom', 'required-checks-digest', 'json',
    ]
    const commandFlags = {
      'plan-bootstrap': commonFlags,
      'materialize-bootstrap': [...commonFlags, 'plan-file', 'expected-plan-digest', 'output'],
      'check-bootstrap-readback': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback'],
      'plan-bootstrap-promotion': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback'],
      'check-bootstrap-promotion': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback', 'proposal'],
    }
    exactCommandFlags(command, flags, commandFlags[command], argv)
    const sourceInput = bootstrapSourceInput(flags, inventoryBytes, inventory)
    let value
    if (command === 'plan-bootstrap') {
      value = createConsumerBootstrapMaterializationPlan(sourceInput)
    } else {
      invariant(flags['plan-file'] && flags['expected-plan-digest'], `${command} requires --plan-file and --expected-plan-digest`)
      const reviewed = {
        ...sourceInput,
        plan: readArtifact(flags['plan-file'], 'consumer bootstrap materialization plan'),
        expectedPlanDigest: flags['expected-plan-digest'],
      }
      if (command === 'materialize-bootstrap') {
        invariant(flags.output, 'materialize-bootstrap requires --output')
        value = materializeConsumerBootstrapSnapshot({ ...reviewed, outputRoot: flags.output })
      } else {
        invariant(flags['materialized-root'] && flags.readback, `${command} requires --materialized-root and --readback`)
        const readback = readArtifact(flags.readback, 'consumer bootstrap readback')
        const readbackInput = { ...reviewed, materializedRoot: flags['materialized-root'] }
        if (command === 'check-bootstrap-readback') value = validateIndependentConsumerBootstrapReadback(readback, readbackInput)
        else if (command === 'plan-bootstrap-promotion') value = createConsumerBootstrapPromotionProposal(readback, readbackInput)
        else {
          invariant(flags.proposal, 'check-bootstrap-promotion requires --proposal')
          value = validateConsumerBootstrapPromotionProposal(
            readArtifact(flags.proposal, 'consumer bootstrap inventory promotion proposal'),
            readback,
            readbackInput,
          )
        }
      }
    }
    if (flags.json) console.log(stableStringify(value))
    else printBootstrapArtifact(value)
    if (value.reviewReady === false) process.exitCode = 2
    return value
  }

  if (command === 'check-bootstrap-materialization') {
    exactCommandFlags(command, flags, ['plan-file', 'expected-plan-digest', 'materialized-root', 'json'], argv)
    invariant(flags['plan-file'] && flags['expected-plan-digest'] && flags['materialized-root'], 'check-bootstrap-materialization requires --plan-file, --expected-plan-digest, and --materialized-root')
    const plan = readArtifact(flags['plan-file'], 'consumer bootstrap materialization plan')
    invariant(plan.planDigest === flags['expected-plan-digest'], 'Expected consumer bootstrap plan digest does not match the supplied plan')
    const verification = verifyMaterializedConsumerBootstrapSnapshot({ plan, materializedRoot: flags['materialized-root'] })
    if (flags.json) console.log(stableStringify(verification))
    else printBootstrapArtifact(verification)
    return verification
  }

  const controlPlaneSourceCommands = new Set([
    'plan-control-plane-update',
    'materialize-control-plane-update',
    'check-control-plane-materialization',
    'check-control-plane-readback',
    'plan-control-plane-acceptance',
    'check-control-plane-acceptance',
  ])
  if (controlPlaneSourceCommands.has(command)) {
    const commonFlags = [
      'inventory', 'rings', 'repo-id', 'root', 'base', 'incoming', 'release-bom',
      'scaffold-lock', 'baseline-receipt', 'json',
    ]
    const commandFlags = {
      'plan-control-plane-update': commonFlags,
      'materialize-control-plane-update': [...commonFlags, 'plan-file', 'expected-plan-digest', 'output'],
      'check-control-plane-materialization': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root'],
      'check-control-plane-readback': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback'],
      'plan-control-plane-acceptance': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback'],
      'check-control-plane-acceptance': [...commonFlags, 'plan-file', 'expected-plan-digest', 'materialized-root', 'readback', 'proposal'],
    }
    exactCommandFlags(command, flags, commandFlags[command], argv)
    const controlPlaneIssuerRegistry = providedIssuerRegistry ?? loadIssuerRegistry()
    const sourceInput = controlPlaneUpdateSourceInput(flags, inventoryBytes, inventory, {
      issuerRegistry: controlPlaneIssuerRegistry,
      now,
    })
    let value
    if (command === 'plan-control-plane-update') {
      value = createConsumerControlPlaneUpdatePlan(sourceInput)
    } else {
      invariant(flags['plan-file'] && flags['expected-plan-digest'], `${command} requires --plan-file and --expected-plan-digest`)
      const reviewed = {
        ...sourceInput,
        plan: readArtifact(flags['plan-file'], 'consumer control-plane update plan'),
        expectedPlanDigest: flags['expected-plan-digest'],
      }
      if (command === 'materialize-control-plane-update') {
        invariant(flags.output, 'materialize-control-plane-update requires --output')
        value = materializeConsumerControlPlaneUpdateSnapshot({ ...reviewed, outputRoot: flags.output })
      } else if (command === 'check-control-plane-materialization') {
        invariant(flags['materialized-root'], 'check-control-plane-materialization requires --materialized-root')
        value = verifyContextualConsumerControlPlaneUpdateSnapshot({
          ...reviewed,
          materializedRoot: flags['materialized-root'],
        })
      } else {
        invariant(flags['materialized-root'] && flags.readback, `${command} requires --materialized-root and --readback`)
        const readback = readArtifact(flags.readback, 'consumer control-plane update readback')
        const readbackInput = { ...reviewed, materializedRoot: flags['materialized-root'] }
        if (command === 'check-control-plane-readback') value = validateIndependentConsumerControlPlaneUpdateReadback(readback, readbackInput)
        else if (command === 'plan-control-plane-acceptance') value = createConsumerControlPlaneUpdateAcceptanceProposal(readback, readbackInput)
        else {
          invariant(flags.proposal, 'check-control-plane-acceptance requires --proposal')
          value = validateConsumerControlPlaneUpdateAcceptanceProposal(
            readArtifact(flags.proposal, 'consumer control-plane update acceptance proposal'),
            readback,
            readbackInput,
          )
        }
      }
    }
    if (flags.json) console.log(stableStringify(value))
    else printBootstrapArtifact(value)
    if (value.reviewReady === false) process.exitCode = 2
    return value
  }

  if (command === 'inventory') {
    const view = inventoryView(inventory)
    if (flags.json) console.log(stableStringify({ schemaVersion: 1, repositories: view }))
    else printInventory(view)
    return view
  }

  if (command === 'plan-registration' || command === 'check-registration') {
    const rings = readJson(resolve(flags.rings ?? DEFAULT_RINGS))
    const proposal = command === 'plan-registration'
      ? planConsumerRegistration({
          inventory,
          rings,
          request: {
            repoId: flags['repo-id'],
            github: flags.github,
            visibility: flags.visibility,
            defaultBranch: flags['default-branch'],
            localPathFromGovernanceRoot: flags['local-path'],
            releaseRing: flags.ring,
            wave: flags.wave,
            enteredAt: flags['entered-at'],
          },
        })
      : validateConsumerRegistrationProposal(readArtifact(flags.proposal, 'consumer registration proposal'), { inventory, rings })
    if (flags.json) console.log(stableStringify(proposal))
    else printRegistration(proposal)
    return proposal
  }

  if (command === 'plan-fanout' || command === 'prepare-fanout-review' || command === 'assemble-fanout-review' || command === 'check-fanout' || command === 'apply-fanout') {
    const commonFlags = ['inventory', 'desired', 'matrix', 'rings', 'certifications', 'waivers', 'json']
    const commandFlags = {
      'plan-fanout': [...commonFlags, 'to'],
      'prepare-fanout-review': [...commonFlags, 'plan-file', 'expected-plan-digest', 'decision', 'issued-at', 'expires-at'],
      'assemble-fanout-review': [...commonFlags, 'plan-file', 'signing-request', 'signatures'],
      'check-fanout': [...commonFlags, 'plan-file', 'review-receipt', 'offline'],
      'apply-fanout': [...commonFlags, 'plan-file', 'expected-plan-digest', 'review-receipt', 'evidence'],
    }
    exactCommandFlags(command, flags, commandFlags[command], argv)
    const ringsPath = resolve(flags.rings ?? DEFAULT_RINGS)
    const desiredPath = resolve(flags.desired ?? DEFAULT_DESIRED)
    const matrixPath = resolve(flags.matrix ?? DEFAULT_MATRIX)
    const certificationsPath = resolve(flags.certifications ?? DEFAULT_CERTIFICATIONS)
    const waiversPath = resolve(flags.waivers ?? DEFAULT_WAIVERS)
    const rings = readJson(ringsPath)
    const issuerRegistry = providedIssuerRegistry ?? loadIssuerRegistry()
    const runtimeProfile = providedRuntimeProfile ?? readJson(DEFAULT_RUNTIME_PROFILE)
    const models = fanoutGovernanceModels(flags, inventory, rings, issuerRegistry, runtimeProfile)
    const offline = flags.offline === true
    const client = offline ? null : (providedClient ?? new GhApiClient())
    const reloadCurrentFanoutGovernance = () => ({
      inventory: readJson(inventoryPath),
      desired: readJson(desiredPath),
      rings: readJson(ringsPath),
      certifications: readJson(certificationsPath),
      waivers: readJson(waiversPath),
      matrix: readJson(matrixPath),
      runtimeProfile: providedRuntimeProfile === null ? readJson(DEFAULT_RUNTIME_PROFILE) : clone(providedRuntimeProfile),
      issuerRegistry: providedIssuerRegistry === null ? loadIssuerRegistry() : clone(providedIssuerRegistry),
    })
    const currentRuntimeIdentitySnapshot = ({ now: observedNow = now, currentGovernance = models } = {}) => {
      exactKeys(currentGovernance, FANOUT_GOVERNANCE_KEYS, 'consumer fleet runtime governance snapshot')
      const context = resolveCommandRuntimeValidationContext({
        client,
        inventory: currentGovernance.inventory,
        certifications: currentGovernance.certifications,
        runtimeProfile: currentGovernance.runtimeProfile,
        runtimeValidationContext,
        offline,
        command,
      })
      validateFanoutGovernance(currentGovernance, { now: observedNow, runtimeValidationContext: context })
      return createConsumerRuntimeIdentitySnapshot(context, currentGovernance.inventory)
    }
    let plan
    if (command === 'plan-fanout') {
      const snapshot = currentRuntimeIdentitySnapshot()
      plan = planConsumerFanout({ inventory, rings, version: flags.to, now, issuerRegistry, runtimeIdentitySnapshot: snapshot })
    } else {
      invariant(flags['plan-file'], `${command} requires --plan-file`)
      plan = validateConsumerFanoutPlan(
        readArtifact(flags['plan-file'], 'consumer fleet fanout plan', { maxBytes: CONSUMER_FANOUT_LIMITS.maxArtifactBytes }),
        { inventory, rings, now, issuerRegistry },
      )
    }
    if (command === 'prepare-fanout-review') {
      invariant(flags['expected-plan-digest'] && plan.planDigest === flags['expected-plan-digest'], 'prepare-fanout-review requires the exact --expected-plan-digest for the supplied canonical plan')
      invariant(flags.decision && flags['issued-at'] && flags['expires-at'], 'prepare-fanout-review requires --decision, --issued-at, and --expires-at')
      const request = createConsumerFanoutReviewSigningRequest({
        plan,
        inventory,
        rings,
        issuerRegistry,
        governanceModels: models,
        decision: flags.decision,
        issuedAt: flags['issued-at'],
        expiresAt: flags['expires-at'],
        now,
      })
      if (flags.json) console.log(stableStringify(request))
      else console.log(`consumer fleet fanout review signing request ${request.requestDigest}; private keys remain outside this command`)
      return request
    }
    if (command === 'assemble-fanout-review') {
      invariant(flags['signing-request'] && flags.signatures, 'assemble-fanout-review requires --signing-request and --signatures')
      const signingRequest = readArtifact(
        flags['signing-request'],
        'consumer fleet fanout review signing request',
        { maxBytes: CONSUMER_FANOUT_LIMITS.maxArtifactBytes },
      )
      validateConsumerFanoutReviewSigningRequest(signingRequest, {
        plan,
        inventory,
        rings,
        issuerRegistry,
        now,
      })
      const receipt = createConsumerFanoutReviewReceipt(
        signingRequest,
        readArtifact(flags.signatures, 'consumer fleet fanout external signatures', { maxBytes: CONSUMER_FANOUT_LIMITS.maxArtifactBytes }),
      )
      validateConsumerFanoutReviewReceipt(receipt, { plan, inventory, rings, issuerRegistry, now })
      if (flags.json) console.log(stableStringify(receipt))
      else console.log(`consumer fleet fanout review receipt ${receipt.receiptDigest}; private keys remained outside consumerctl`)
      return receipt
    }
    if (command === 'plan-fanout') {
      if (flags.json) console.log(stableStringify(plan))
      else printFanout(plan)
      if (!plan.ready) process.exitCode = 2
      return plan
    }
    invariant(flags['review-receipt'], `${command} requires --review-receipt`)
    const reviewReceipt = readArtifact(flags['review-receipt'], 'consumer fleet fanout review receipt', { maxBytes: CONSUMER_FANOUT_LIMITS.maxArtifactBytes })
    validateConsumerFanoutReviewReceipt(reviewReceipt, { plan, inventory, rings, issuerRegistry, now })
    if (command === 'check-fanout' && offline) {
      const governance = validateFanoutGovernance(models, {
        now,
        runtimeValidationContext: {},
        typedRuntimeBlocker: true,
      })
      const check = blockedOfflineFanoutCheck(plan, reviewReceipt, now, governance.blocker)
      if (flags.json) console.log(stableStringify(check))
      else printFanoutCheck(check)
      process.exitCode = 2
      return check
    }
    if (command === 'check-fanout') {
      const checkedAt = readFanoutLiveTime(clock, 'Consumer fleet fanout check', now)
      const checkedGovernance = assertCurrentConsumerFanoutGovernance({
        reloadCurrentGovernance: reloadCurrentFanoutGovernance,
        baseline: clone(models),
        plan,
        reviewReceipt,
        now: checkedAt,
        phase: 'live fanout check',
      })
      const check = createConsumerFanoutCheckReceipt({
        plan,
        reviewReceipt,
        inventory: checkedGovernance.inventory,
        checkedAt,
        observedRuntimeIdentitySnapshot: currentRuntimeIdentitySnapshot({ now: checkedAt, currentGovernance: checkedGovernance }),
      })
      if (flags.json) console.log(stableStringify(check))
      else printFanoutCheck(check)
      return check
    }
    if (command === 'apply-fanout') {
      invariant(flags.evidence, 'apply-fanout requires --evidence')
      const evidencePath = runtimeEvidencePath(flags.evidence)
      let firstWrite = true
      const evidence = executeConsumerFanout({
        plan,
        expectedPlanDigest: flags['expected-plan-digest'],
        reviewReceipt,
        inventory,
        rings,
        issuerRegistry,
        governanceModels: models,
        reloadCurrentGovernance: reloadCurrentFanoutGovernance,
        runtimeIdentitySnapshotResolver: currentRuntimeIdentitySnapshot,
        ghTransport,
        clock,
        verificationNotBefore: now,
        onEvidence: value => {
          writeAtomicJson(evidencePath, value, { exclusive: firstWrite })
          firstWrite = false
        },
      })
      if (flags.json) console.log(stableStringify(evidence))
      else console.log(`consumer fleet dispatch evidence ${evidence.evidenceDigest}: ${evidence.status}; completion is not claimed`)
      if (evidence.status !== 'requests-accepted-readback-required') process.exitCode = 2
      return evidence
    }
    invariant(command === 'check-fanout', `Unexpected consumer fleet fanout command fallthrough: ${command}`)
  }

  invariant(flags['repo-id'], `${command} requires --repo-id`)
  if (command === 'doctor') {
    exactCommandFlags(command, flags, ['inventory', 'desired', 'matrix', 'rings', 'certifications', 'waivers', 'repo-id', 'root', 'json', 'offline'], argv)
    const issuerRegistry = providedIssuerRegistry ?? loadIssuerRegistry()
    const runtimeProfile = providedRuntimeProfile ?? readJson(DEFAULT_RUNTIME_PROFILE)
    const offline = flags.offline === true
    const client = offline ? null : (providedClient ?? new GhApiClient())
    const certifications = readJson(resolve(flags.certifications ?? DEFAULT_CERTIFICATIONS))
    const resolvedRuntimeValidationContext = resolveCommandRuntimeValidationContext({
      client,
      inventory,
      certifications,
      runtimeProfile,
      runtimeValidationContext,
      offline,
      command,
    })
    const result = doctorRepository({
      inventory,
      desired: readJson(resolve(flags.desired ?? DEFAULT_DESIRED)),
      matrix: readJson(resolve(flags.matrix ?? DEFAULT_MATRIX)),
      rings: readJson(resolve(flags.rings ?? DEFAULT_RINGS)),
      certifications,
      waivers: readJson(resolve(flags.waivers ?? DEFAULT_WAIVERS)),
      repoId: flags['repo-id'],
      root: flags.root,
      now,
      issuerRegistry,
      runtimeProfile,
      runtimeValidationContext: resolvedRuntimeValidationContext,
    })
    if (flags.json) console.log(stableStringify(result))
    else printDoctor(result)
    if (!result.ok) process.exitCode = 2
    return result
  }

  if (command === 'plan-upgrade') {
    invariant(flags.base && flags.incoming, `${command} requires --base and --incoming`)
    const plan = planUpgrade({ inventory, repoId: flags['repo-id'], root: flags.root, base: flags.base, incoming: flags.incoming })
    if (flags.json) console.log(stableStringify(plan))
    else printUpgrade(plan)
    if (!plan.ok) process.exitCode = 2
    return plan
  }

  throw new Error(`Unknown consumerctl command ${command}`)
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  main().catch(error => {
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  })
}
