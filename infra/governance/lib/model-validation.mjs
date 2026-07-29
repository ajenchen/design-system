import {
  GOVERNANCE_ROOT,
  REPOSITORY_ROLES,
  assertNoEmbeddedSecrets,
  invariant,
  readJson,
  resolveCertificationCanary,
  sha256,
  stableStringify,
  validateInventory,
} from './common.mjs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { validateRolloutShape, verifyApplyAuthorization, verifyCompletionAttestation } from './rollout-state-machine.mjs'
import {
  validateCertificationRuntimeEvidence,
  validateExternalRepositoryIdentityClosure,
} from './runtime-certification.mjs'
import { validateRuntimeProfile } from './provider-runtime-conformance.mjs'
import {
  loadCanonicalAdapterRegistry,
  validateProviderCompatibilityJoin,
} from './provider-compatibility.mjs'
import { loadIssuerRegistry } from './issuer-registry.mjs'
import { assertReviewedWorkflowIdentity } from './workflow-trust.mjs'
import { resolve } from 'node:path'
import { loadConsumerUpgradeProtocol, upgradeProfile } from './consumer-upgrade-protocol.mjs'
import { certificationAggregateStatus } from '../../../packages/governance/src/provider-review-binding.mjs'
import {
  MANAGED_REPOSITORY_ROLES,
  loadRoleSurfacePolicy,
  certificationCarrierPolicyForRole,
  validateManagedRepositoryRoleSurfaces,
  validateReleaseRingRoleSurfaces,
} from './role-surface-policy.mjs'

const CERTIFICATION_STATUSES = new Set(['certified', 'conditional', 'not-certified', 'expired', 'not-applicable'])
const CHECK_STATUSES = new Set(['pass', 'fail', 'not-tested', 'not-applicable'])
const EVIDENCE_KINDS = new Set(['command-output', 'artifact-digest', 'github-check-runs', 'github-api', 'manual-review'])
const WAIVER_STATUSES = new Set(['active', 'expired', 'revoked', 'closed'])
const WAIVER_RISKS = new Set(['low', 'medium', 'high', 'critical'])
const WAIVER_CONTROL_TYPES = new Set(['ruleset', 'required-check', 'environment', 'provider-surface', 'ownership', 'compatibility'])
const CANONICAL_MANAGED_ENVIRONMENT_NAMES = Object.freeze([
  'npm-release',
  'release-finalize',
  'governance-check-verdict',
  'governance-mirror',
  'governance-upgrade',
  'governance-external-ledger',
])
const DEFAULT_MATRIX_PATH = resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')
const DEFAULT_RUNTIME_PROFILE_PATH = resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')
const DETERMINISTIC_DOCUMENT_SCHEMAS = Object.freeze({
  inventory: resolve(GOVERNANCE_ROOT, 'schemas/managed-repos.schema.json'),
  desired: resolve(GOVERNANCE_ROOT, 'schemas/github-desired.schema.json'),
  rings: resolve(GOVERNANCE_ROOT, 'schemas/release-rings.schema.json'),
  runtimeProfile: resolve(GOVERNANCE_ROOT, 'schemas/runtime-conformance-profile.schema.json'),
  roleSurfacePolicy: resolve(GOVERNANCE_ROOT, 'schemas/role-surface-policy.schema.json'),
})
const PLATFORM_TARGET_REQUIRED_KEYS = Object.freeze(['arch', 'distributionVersion', 'executionEnvironment', 'id', 'limitations', 'operatingSystem', 'pathClass', 'platform', 'status'])
const PLATFORM_TARGET_OPTIONAL_KEYS = new Set(['certifiedAt', 'expiresAt', 'runtimeEvidence'])
const defaultProviderRegistry = () => readJson(DEFAULT_MATRIX_PATH)
const defaultRuntimeProfile = () => readJson(DEFAULT_RUNTIME_PROFILE_PATH)
const defaultAdapterRegistry = () => loadCanonicalAdapterRegistry()

function compileDeterministicDocumentSchema(path) {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  return { ajv, validate: ajv.compile(readJson(path)) }
}

const deterministicDocumentValidators = Object.freeze(Object.fromEntries(
  Object.entries(DETERMINISTIC_DOCUMENT_SCHEMAS).map(([name, path]) => [name, compileDeterministicDocumentSchema(path)]),
))

function validateDeterministicDocumentSchema(name, value) {
  const compiled = deterministicDocumentValidators[name]
  invariant(compiled.validate(value), `${name} schema validation failed: ${compiled.ajv.errorsText(compiled.validate.errors, { separator: '; ' })}`)
}

function nonEmptyString(value, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, message)
}

function validDate(value, message) {
  nonEmptyString(value, message)
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/)
  invariant(match, message)
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
  invariant(
    calendarDate.getUTCFullYear() === year && calendarDate.getUTCMonth() === month - 1 && calendarDate.getUTCDate() === day,
    message,
  )
  invariant(Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59, message)
  if (offsetHourText !== undefined) invariant(Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59, message)
  const date = new Date(value)
  invariant(Number.isFinite(date.getTime()), message)
  return date
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',')
}

export function validateCertificationPlatformMatrix(certification, key = certification?.id ?? '<unknown>', { now = new Date() } = {}) {
  invariant(Array.isArray(certification?.platformMatrix) && certification.platformMatrix.length > 0, `Certification ${key} must declare a non-empty platformMatrix`)
  const targetIds = new Set()
  for (const target of certification.platformMatrix) {
    const targetKeys = Object.keys(target || {})
    invariant(PLATFORM_TARGET_REQUIRED_KEYS.every(item => targetKeys.includes(item))
      && targetKeys.every(item => PLATFORM_TARGET_REQUIRED_KEYS.includes(item) || PLATFORM_TARGET_OPTIONAL_KEYS.has(item)), `Certification ${key} platform target has an invalid or open shape`)
    invariant(typeof target.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(target.id) && !targetIds.has(target.id), `Certification ${key} platform target id is invalid or duplicated`)
    invariant(['macos', 'linux', 'windows'].includes(target.operatingSystem), `Certification ${key}/${target.id} operatingSystem is invalid`)
    invariant(['darwin', 'linux', 'win32'].includes(target.platform), `Certification ${key}/${target.id} platform is invalid`)
    invariant(['arm64', 'x64'].includes(target.arch), `Certification ${key}/${target.id} architecture is invalid`)
    invariant(['native', 'wsl2', 'devcontainer', 'cloud-hosted', 'github-hosted-runner', 'remote-host'].includes(target.executionEnvironment), `Certification ${key}/${target.id} executionEnvironment is invalid`)
    invariant(['no-space', 'contains-space'].includes(target.pathClass), `Certification ${key}/${target.id} pathClass is invalid`)
    invariant(typeof target.distributionVersion === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(target.distributionVersion), `Certification ${key}/${target.id} distributionVersion is invalid`)
    invariant(['certified', 'not-certified', 'unsupported'].includes(target.status), `Certification ${key}/${target.id} target status is invalid`)
    invariant(Array.isArray(target.limitations) && target.limitations.every(item => typeof item === 'string' && item.length > 0), `Certification ${key}/${target.id} limitations are invalid`)
    if (target.status !== 'certified') invariant(target.limitations.length > 0, `Certification ${key}/${target.id} non-certified target requires a concrete limitation`)
    if (target.status === 'certified') {
      const certifiedAt = validDate(target.certifiedAt ?? certification.certifiedAt, `Certification ${key}/${target.id} must have a valid certifiedAt`)
      const expiresAt = validDate(target.expiresAt ?? certification.expiresAt, `Certification ${key}/${target.id} must have a valid expiresAt`)
      invariant(expiresAt > certifiedAt, `Certification ${key}/${target.id} expiresAt must be after certifiedAt`)
    }
    const macos = target.operatingSystem === 'macos' && target.platform === 'darwin' && ['native', 'remote-host'].includes(target.executionEnvironment)
    const linux = target.operatingSystem === 'linux' && target.platform === 'linux'
      && ['native', 'wsl2', 'devcontainer', 'cloud-hosted', 'github-hosted-runner', 'remote-host'].includes(target.executionEnvironment)
    const unsupportedWindows = target.operatingSystem === 'windows' && target.platform === 'win32'
      && target.executionEnvironment === 'native' && target.distributionVersion === 'not-applicable' && target.status === 'unsupported'
    invariant(macos || linux || unsupportedWindows, `Certification ${key}/${target.id} OS/platform/executionEnvironment combination is unsupported`)
    if (target.executionEnvironment === 'wsl2' || target.executionEnvironment === 'devcontainer') {
      invariant(target.operatingSystem === 'linux' && target.platform === 'linux', `Certification ${key}/${target.id} WSL/devcontainer must be represented as a Linux execution environment`)
    }
    targetIds.add(target.id)
  }
  const aggregate = certificationAggregateStatus(certification, { now })
  invariant(certification.status === aggregate, `Certification ${key} aggregate status ${certification.status} disagrees with target status ${aggregate}`)
  return true
}

function uniqueNonEmptyStrings(values, message) {
  invariant(Array.isArray(values), message)
  const seen = new Set()
  for (const value of values) {
    nonEmptyString(value, message)
    invariant(!seen.has(value), `${message}: duplicate ${value}`)
    seen.add(value)
  }
}

export function certificationKey(provider, runtimeKind, surface, role) {
  return `${provider}/${runtimeKind}/${surface}/${role}`
}

export function validateProviderRegistry(matrix, runtimeProfile, {
  adapterRegistry = defaultAdapterRegistry(),
  issuerRegistry = loadIssuerRegistry(),
  providerCliToolchain,
  now = new Date(),
} = {}) {
  invariant(matrix?.schemaVersion === 2, 'Provider compatibility matrix schemaVersion must be 2')
  invariant(matrix.providers && typeof matrix.providers === 'object' && !Array.isArray(matrix.providers) && Object.keys(matrix.providers).length > 0, 'Provider compatibility matrix must contain a provider registry')
  invariant(matrix.surfaces && typeof matrix.surfaces === 'object' && !Array.isArray(matrix.surfaces) && Object.keys(matrix.surfaces).length > 0, 'Provider compatibility matrix must contain surfaces')
  const adapterJoin = validateProviderCompatibilityJoin(matrix, adapterRegistry, providerCliToolchain === undefined ? {} : { providerCliToolchain })
  validateRuntimeProfile(runtimeProfile, { issuerRegistry, adapterRegistry, now })
  const runtimeIds = new Set(runtimeProfile.providers.map(provider => provider.id))
  const aliases = new Map()
  const runtimeKindIds = new Map()
  const runtimeRegistrations = new Map()
  const runtimeProfilesByCertificationTuple = new Map()
  for (const [providerId, registration] of Object.entries(matrix.providers)) {
    invariant(/^[a-z][a-z0-9-]*$/.test(providerId), `Invalid compatibility provider id ${providerId}`)
    invariant(registration && typeof registration === 'object' && !Array.isArray(registration), `Compatibility provider ${providerId} registration is invalid`)
    invariant(Object.keys(registration).sort().join(',') === 'adapterProviderId,minimumVersion,runtimeKinds', `Compatibility provider ${providerId} registration has an open or incomplete shape`)
    invariant(registration.adapterProviderId === null || /^[a-z][a-z0-9-]*$/.test(registration.adapterProviderId), `Compatibility provider ${providerId} adapterProviderId is invalid`)
    nonEmptyString(registration.minimumVersion, `Compatibility provider ${providerId} minimumVersion is invalid`)
    invariant(registration.runtimeKinds && typeof registration.runtimeKinds === 'object' && !Array.isArray(registration.runtimeKinds) && Object.keys(registration.runtimeKinds).length > 0, `Compatibility provider ${providerId} must declare runtimeKinds`)
    const providerRuntimeKinds = new Set()
    for (const [runtimeKind, runtimeRegistration] of Object.entries(registration.runtimeKinds)) {
      invariant(/^[a-z][a-z0-9-]*$/.test(runtimeKind), `Compatibility provider ${providerId} runtime kind ${runtimeKind} is invalid`)
      invariant(runtimeRegistration && typeof runtimeRegistration === 'object' && !Array.isArray(runtimeRegistration), `Compatibility runtime ${providerId}/${runtimeKind} registration is invalid`)
      invariant(Object.keys(runtimeRegistration).sort().join(',') === 'runtimeEvidenceRequired,runtimeProfilesBySurface', `Compatibility runtime ${providerId}/${runtimeKind} registration has an open or incomplete shape`)
      const { runtimeProfilesBySurface, runtimeEvidenceRequired } = runtimeRegistration
      invariant(typeof runtimeEvidenceRequired === 'boolean', `Compatibility runtime ${providerId}/${runtimeKind} must declare runtimeEvidenceRequired`)
      invariant(runtimeProfilesBySurface && typeof runtimeProfilesBySurface === 'object' && !Array.isArray(runtimeProfilesBySurface) && Object.keys(runtimeProfilesBySurface).length > 0, `Compatibility runtime ${providerId}/${runtimeKind} must map at least one surface-specific runtime profile`)
      for (const [surface, runtimeProfileId] of Object.entries(runtimeProfilesBySurface)) {
        invariant(matrix.surfaces[surface], `Compatibility runtime ${providerId}/${runtimeKind} references unknown surface ${surface}`)
        invariant(typeof runtimeProfileId === 'string' && /^[a-z][a-z0-9-]*$/.test(runtimeProfileId), `Compatibility runtime ${providerId}/${runtimeKind}/${surface} runtimeProfileId is invalid`)
        invariant(runtimeIds.has(runtimeProfileId), `Compatibility runtime ${providerId}/${runtimeKind} runtimeProfileId ${runtimeProfileId} is unregistered`)
        invariant(!aliases.has(runtimeProfileId), `Runtime profile id ${runtimeProfileId} is aliased by multiple compatibility runtimes`)
        const profileProvider = runtimeProfile.providers.find(provider => provider.id === runtimeProfileId)
        invariant(profileProvider.runtimeKind === runtimeKind, `Runtime profile ${runtimeProfileId} runtimeKind does not match ${providerId}/${runtimeKind}`)
        invariant(profileProvider.certificationSurface === surface, `Runtime profile ${runtimeProfileId} certificationSurface does not match ${providerId}/${runtimeKind}/${surface}`)
        invariant(profileProvider.adapterProviderId === registration.adapterProviderId, `Runtime profile ${runtimeProfileId} adapterProviderId does not match compatibility provider ${providerId}`)
        const tuple = `${providerId}/${runtimeKind}/${surface}`
        invariant(!runtimeProfilesByCertificationTuple.has(tuple), `Duplicate runtime profile selection for ${tuple}`)
        aliases.set(runtimeProfileId, tuple)
        runtimeProfilesByCertificationTuple.set(tuple, runtimeProfileId)
      }
      providerRuntimeKinds.add(runtimeKind)
      runtimeRegistrations.set(`${providerId}/${runtimeKind}`, runtimeRegistration)
    }
    runtimeKindIds.set(providerId, providerRuntimeKinds)
  }
  for (const runtimeId of runtimeIds) invariant(aliases.has(runtimeId), `Runtime profile provider ${runtimeId} has no compatibility registry alias`)
  return {
    providerIds: new Set(Object.keys(matrix.providers)),
    runtimeKindIds,
    runtimeRegistrations,
    surfaceIds: new Set(Object.keys(matrix.surfaces)),
    aliases,
    runtimeProfilesByCertificationTuple,
    adapterJoin,
  }
}

export function validateReleaseRings(inventory, rings, {
  now = new Date(),
  issuerRegistry = loadIssuerRegistry(),
  activationPolicy,
  expectedActivationPolicyDigest,
} = {}) {
  validateDeterministicDocumentSchema('rings', rings)
  validateRolloutShape(inventory, rings, {
    issuerRegistry,
    now,
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  invariant(Array.isArray(rings.rings) && rings.rings.length > 0, 'Release rings must contain at least one ring')
  invariant(rings.assignments && typeof rings.assignments === 'object' && !Array.isArray(rings.assignments), 'Release rings assignments must be an object')
  const repositoriesById = new Map(inventory.repositories.map(repository => [repository.id, repository]))
  const repoIds = new Set(repositoriesById.keys())
  for (const repoId of Object.keys(rings.assignments)) invariant(repoIds.has(repoId), `Release-ring assignment references unknown repo ${repoId}`)
  const ringIds = new Set()
  const ringOrders = new Set()
  for (const [ringIndex, ring] of rings.rings.entries()) {
    nonEmptyString(ring?.id, 'Release ring id must be a non-empty string')
    invariant(!ringIds.has(ring.id), `Duplicate release ring id ${ring.id}`)
    invariant(Number.isInteger(ring.order) && ring.order >= 0, `Release ring ${ring.id} order must be a non-negative integer`)
    invariant(!ringOrders.has(ring.order), `Duplicate release ring order ${ring.order}`)
    if (ringIndex > 0) invariant(rings.rings[ringIndex - 1].order < ring.order, 'Release rings must be declared in strictly increasing order')
    nonEmptyString(ring.purpose, `Release ring ${ring.id} purpose must be a non-empty string`)
    invariant(Number.isInteger(ring.minimumSoakHours) && ring.minimumSoakHours >= 1, `Release ring ${ring.id} minimumSoakHours must be a positive integer`)
    invariant(Number.isInteger(ring.maxParallel) && ring.maxParallel >= 1, `Release ring ${ring.id} maxParallel must be a positive integer`)
    ringIds.add(ring.id)
    ringOrders.add(ring.order)
  }

  for (const repo of inventory.repositories) {
    const assignment = rings.assignments[repo.id]
    invariant(assignment && typeof assignment === 'object', `Missing release-ring assignment for ${repo.id}`)
    invariant(ringIds.has(assignment.ring), `Unknown release ring ${assignment.ring ?? '<missing>'} for ${repo.id}`)
  }

  const ringByRole = new Map()
  for (const ring of rings.rings) {
    const assignedRepositories = Object.entries(rings.assignments)
      .filter(([, assignment]) => assignment.ring === ring.id)
      .map(([repoId]) => repositoriesById.get(repoId))
    invariant(assignedRepositories.length > 0, `Release ring ${ring.id} must be assigned to at least one managed repository`)
    const assignedRoles = new Set(assignedRepositories.map(repository => repository.role))
    invariant(assignedRoles.size === 1, `Release ring ${ring.id} must contain exactly one managed repository role`)
    const role = [...assignedRoles][0]
    invariant(!ringByRole.has(role), `Managed repository role ${role} is split across multiple release rings`)
    const expectedOrder = MANAGED_REPOSITORY_ROLES.indexOf(role)
    invariant(ring.order === expectedOrder, `Release ring ${ring.id}/${role} order must be ${expectedOrder}`)
    ringByRole.set(role, ring.id)
  }

  const candidateReleaseDigest = rings.candidateRelease ? sha256(stableStringify(rings.candidateRelease, 0)) : null
  const candidateObservedAt = rings.candidateRelease ? validDate(rings.candidateRelease.observedAt, 'Candidate release observedAt is invalid') : null
  for (const repo of inventory.repositories) {
    const assignment = rings.assignments[repo.id]
    invariant(repo.releaseRing === assignment.ring, `Release-ring drift for ${repo.id}`)
    const enteredAt = validDate(assignment.enteredAt, `Invalid release-ring enteredAt for ${repo.id}`)
    invariant(assignment.candidateReleaseDigest === candidateReleaseDigest, `Release-ring candidate digest was not reset for ${repo.id}`)
    if (candidateObservedAt) invariant(enteredAt >= candidateObservedAt, `Release-ring soak for ${repo.id} predates the verified candidate release`)
    invariant(Array.isArray(assignment.manualBlockers), `Release-ring manualBlockers must be an array for ${repo.id}`)
    for (const blocker of assignment.manualBlockers) nonEmptyString(blocker, `Release-ring manual blocker must be non-empty for ${repo.id}`)
    if (assignment.applyAuthorization) {
      const envelope = verifyApplyAuthorization(assignment.applyAuthorization, {
        repoId: repo.id,
        github: repo.github,
        ringId: assignment.ring,
        waveId: assignment.wave,
        candidateRelease: rings.candidateRelease,
        issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
        attestationPolicy: rings.attestationPolicy,
      }, { now, issuerRegistry })
      invariant(envelope.valid, `Invalid signed apply authorization for ${repo.id}: ${envelope.failures.join('; ')}`)
    }
    if (assignment.completionAttestation) {
      const envelope = verifyCompletionAttestation(assignment.completionAttestation, {
        repoId: repo.id,
        github: repo.github,
        ringId: assignment.ring,
        waveId: assignment.wave,
        candidateRelease: rings.candidateRelease,
        issuerRegistryDigest: rings.attestationPolicy.issuerRegistryDigest,
        attestationPolicy: rings.attestationPolicy,
      }, { now, issuerRegistry })
      invariant(envelope.valid, `Invalid signed completion attestation for ${repo.id}: ${envelope.failures.join('; ')}`)
    }
  }
  return true
}

export function validateCertifications(certifications, {
  now = new Date(),
  repoRoot,
  runtimeIdentity,
  inventory,
  desiredGithub,
  externalRepositoryIdentities,
  roleSurfacePolicy = loadRoleSurfacePolicy(),
  matrix = defaultProviderRegistry(),
  runtimeProfile = defaultRuntimeProfile(),
  adapterRegistry = defaultAdapterRegistry(),
  providerCliToolchain,
  issuerRegistry = loadIssuerRegistry(),
} = {}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'Certification validation now must be a valid Date')
  invariant(certifications?.schemaVersion === 2, 'Provider certification schemaVersion must be 2')
  invariant(Array.isArray(certifications.certifications), 'Provider certifications must be an array')
  const registry = validateProviderRegistry(matrix, runtimeProfile, { adapterRegistry, issuerRegistry, providerCliToolchain, now })
  const ids = new Set()
  const keys = new Set()
  const runtimeEvidenceRuns = new Set()
  let repositoryIdentityClosureValidated = false
  for (const certification of certifications.certifications) {
    invariant(typeof certification?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(certification.id), 'Provider certification id is missing or invalid')
    invariant(!ids.has(certification.id), `Duplicate provider certification id ${certification.id}`)
    invariant(registry.providerIds.has(certification.provider), `Unknown certification provider ${certification.provider ?? '<missing>'}`)
    invariant(typeof certification.runtimeKind === 'string' && registry.runtimeKindIds.get(certification.provider)?.has(certification.runtimeKind), `Unknown certification runtime kind ${certification.provider ?? '<missing>'}/${certification.runtimeKind ?? '<missing>'}`)
    invariant(registry.surfaceIds.has(certification.surface), `Unknown certification surface ${certification.surface ?? '<missing>'}`)
    const certificationTuple = `${certification.provider}/${certification.runtimeKind}/${certification.surface}`
    invariant(
      registry.runtimeProfilesByCertificationTuple.has(certificationTuple),
      `Unknown certification tuple ${certificationTuple}`,
    )
    invariant(REPOSITORY_ROLES.has(certification.repositoryRole), `Unknown certification repository role ${certification.repositoryRole ?? '<missing>'}`)
    const key = certificationKey(certification.provider, certification.runtimeKind, certification.surface, certification.repositoryRole)
    invariant(!keys.has(key), `Duplicate provider certification key ${key}`)
    nonEmptyString(certification.providerVersion, `Certification ${key} must declare providerVersion`)
    nonEmptyString(certification.adapterVersion, `Certification ${key} must declare adapterVersion`)
    invariant(CERTIFICATION_STATUSES.has(certification.status), `Certification ${key} has invalid status ${certification.status ?? '<missing>'}`)
    validateCertificationPlatformMatrix(certification, key, { now })
    invariant(Array.isArray(certification.checks), `Certification ${key} checks must be an array`)
    invariant(Array.isArray(certification.limitations), `Certification ${key} limitations must be an array`)
    const checkIds = new Set()
    for (const check of certification.checks) {
      nonEmptyString(check?.id, `Certification ${key} has a check without an id`)
      invariant(!checkIds.has(check.id), `Certification ${key} has duplicate check id ${check.id}`)
      invariant(CHECK_STATUSES.has(check.status), `Certification ${key} check ${check.id} has invalid status ${check.status ?? '<missing>'}`)
      invariant(check.evidence && typeof check.evidence === 'object' && !Array.isArray(check.evidence), `Certification ${key} check ${check.id} is missing evidence`)
      invariant(EVIDENCE_KINDS.has(check.evidence.kind), `Certification ${key} check ${check.id} has invalid evidence kind`)
      nonEmptyString(check.evidence.reference, `Certification ${key} check ${check.id} is missing evidence reference`)
      if (check.evidence.sha256 !== undefined) invariant(/^[a-f0-9]{64}$/.test(check.evidence.sha256), `Certification ${key} check ${check.id} has invalid evidence sha256`)
      if (check.evidence.kind === 'artifact-digest') invariant(/^[a-f0-9]{64}$/.test(check.evidence.sha256 ?? ''), `Certification ${key} artifact evidence ${check.id} requires sha256`)
      checkIds.add(check.id)
    }
    for (const limitation of certification.limitations) nonEmptyString(limitation, `Certification ${key} limitations must be non-empty strings`)
    if (certification.status !== 'certified') invariant(certification.limitations.length > 0, `Non-certified record ${key} must declare concrete limitations`)
    if (certification.status === 'certified' || certification.status === 'conditional') {
      invariant(certification.checks.length > 0, `Certified record ${key} must contain at least one required check`)
      invariant(certification.checks.every(check => check.status === 'pass'), `Certified record ${key} contains a non-passing required check`)
      const runtimeRegistration = registry.runtimeRegistrations.get(`${certification.provider}/${certification.runtimeKind}`)
      if (runtimeRegistration.runtimeEvidenceRequired) {
        if (!repositoryIdentityClosureValidated) {
          if (externalRepositoryIdentities !== undefined) validateExternalRepositoryIdentityClosure(externalRepositoryIdentities, inventory)
          repositoryIdentityClosureValidated = true
        }
        const runtimeProfileId = registry.runtimeProfilesByCertificationTuple.get(`${certification.provider}/${certification.runtimeKind}/${certification.surface}`)
        invariant(typeof runtimeProfileId === 'string', `Certified record ${key} has no unique registered runtime profile for this runtime kind/surface`)
        const selectedRuntimeProfile = runtimeProfile.providers.find(item => item.id === runtimeProfileId)
        invariant(selectedRuntimeProfile, `Certified record ${key} runtime profile ${runtimeProfileId} is unregistered`)
        invariant(Array.isArray(inventory?.repositories), `Certified record ${key} requires the managed repository inventory`)
        const repositoryTarget = resolveCertificationCanary(inventory, certification.repositoryRole)
        const repositoryIdentity = externalRepositoryIdentities instanceof Map
          ? externalRepositoryIdentities.get(repositoryTarget.id)
          : externalRepositoryIdentities?.[repositoryTarget.id]
        invariant(repositoryIdentity && typeof repositoryIdentity === 'object', `Certified record ${key} requires live identity for certification canary ${repositoryTarget.id}`)
        const carrierPolicy = certificationCarrierPolicyForRole(roleSurfacePolicy, certification.repositoryRole)
        const certifiedTargets = certification.platformMatrix.filter(target => target.status === 'certified')
        invariant(certifiedTargets.length > 0, `Certified record ${key} has no certified target`)
        for (const target of certifiedTargets) {
          const runtimeEvidence = validateCertificationRuntimeEvidence(certification, {
            repoRoot,
            identity: runtimeIdentity,
            matrix,
            runtimeProfile,
            issuerRegistry,
            repositoryTarget,
            repositoryIdentity,
            carrierPolicy,
            desiredGithub,
            now,
            targetId: target.id,
          })
          const replayKey = `${runtimeEvidence.runId}/${runtimeEvidence.runtimeProfileId}/${runtimeEvidence.targetId}`
          invariant(!runtimeEvidenceRuns.has(replayKey), `Certified record ${key} replays runtime evidence ${replayKey}`)
          runtimeEvidenceRuns.add(replayKey)
        }
      } else invariant(certification.runtimeEvidence === undefined
        && certification.platformMatrix.every(target => target.runtimeEvidence === undefined), `Certified record ${key} cannot attach unrelated runtime evidence`)
    } else {
      if (certification.certifiedAt !== undefined) validDate(certification.certifiedAt, `Certification ${key} has invalid certifiedAt`)
      if (certification.expiresAt !== undefined) validDate(certification.expiresAt, `Certification ${key} has invalid expiresAt`)
    }
    ids.add(certification.id)
    keys.add(key)
  }
  return true
}

export function validateWaivers(inventory, waivers) {
  invariant(waivers?.schemaVersion === 1, 'Waiver ledger schemaVersion must be 1')
  invariant(Array.isArray(waivers.waivers), 'Waiver ledger waivers must be an array')
  const ids = new Set()
  const repositories = new Set(inventory.repositories.flatMap(repo => [repo.id, repo.github]))
  for (const waiver of waivers.waivers) {
    invariant(typeof waiver?.id === 'string' && /^WV-[0-9]{4}-[0-9]{3,}$/.test(waiver.id), 'Waiver id is missing or invalid')
    invariant(!ids.has(waiver.id), `Duplicate waiver id ${waiver.id}`)
    invariant(waiver.scope && typeof waiver.scope === 'object', `Waiver ${waiver.id} is missing scope`)
    invariant(repositories.has(waiver.scope.repository), `Waiver ${waiver.id} references unknown repository ${waiver.scope.repository ?? '<missing>'}`)
    invariant(WAIVER_CONTROL_TYPES.has(waiver.scope.controlType), `Waiver ${waiver.id} has invalid controlType`)
    nonEmptyString(waiver.scope.controlId, `Waiver ${waiver.id} is missing controlId`)
    invariant(typeof waiver.reason === 'string' && waiver.reason.trim().length >= 20, `Waiver ${waiver.id} reason must contain at least 20 characters`)
    invariant(WAIVER_RISKS.has(waiver.risk), `Waiver ${waiver.id} has invalid risk`)
    nonEmptyString(waiver.owner, `Waiver ${waiver.id} is missing owner`)
    uniqueNonEmptyStrings(waiver.approvedBy, `Waiver ${waiver.id} approvedBy must contain unique non-empty approvers`)
    invariant(waiver.approvedBy.length > 0, `Waiver ${waiver.id} requires an approver`)
    const issuedAt = validDate(waiver.issuedAt, `Waiver ${waiver.id} has invalid issuedAt`)
    const expiresAt = validDate(waiver.expiresAt, `Waiver ${waiver.id} has invalid expiresAt`)
    invariant(expiresAt > issuedAt, `Waiver ${waiver.id} expiresAt must be after issuedAt`)
    invariant(WAIVER_STATUSES.has(waiver.status), `Waiver ${waiver.id} has invalid status`)
    uniqueNonEmptyStrings(waiver.compensatingControls, `Waiver ${waiver.id} compensatingControls must be non-empty strings`)
    invariant(waiver.compensatingControls.length > 0, `Waiver ${waiver.id} requires compensating controls`)
    uniqueNonEmptyStrings(waiver.evidence, `Waiver ${waiver.id} evidence must be non-empty strings`)
    invariant(waiver.evidence.length > 0, `Waiver ${waiver.id} requires evidence`)
    ids.add(waiver.id)
  }
  return true
}

export function validateDesiredGithub(inventory, desired) {
  validateDeterministicDocumentSchema('inventory', inventory)
  validateDeterministicDocumentSchema('desired', desired)
  invariant(desired?.schemaVersion === 1, 'Desired GitHub schemaVersion must be 1')
  invariant(desired.managedRulesetPrefix === 'fleet/', 'managedRulesetPrefix must remain the canonical fleet/ namespace')
  invariant(desired.staleManagedPolicy === 'delete-after-preflight', 'staleManagedPolicy must be delete-after-preflight')
  invariant(Number.isInteger(desired.checkRunMaxAgeMinutes) && desired.checkRunMaxAgeMinutes >= 1 && desired.checkRunMaxAgeMinutes <= 10080, 'checkRunMaxAgeMinutes must be between 1 and 10080')
  invariant(Number.isInteger(desired.checkRunClockSkewSeconds) && desired.checkRunClockSkewSeconds >= 0 && desired.checkRunClockSkewSeconds <= 300, 'checkRunClockSkewSeconds must be between 0 and 300')
  invariant(desired.integrations && typeof desired.integrations === 'object' && !Array.isArray(desired.integrations), 'Named integrations are required')
  invariant(Object.keys(desired.integrations).length >= 2, 'At least two named integrations are required')
  invariant(desired.profiles && typeof desired.profiles === 'object' && !Array.isArray(desired.profiles) && Object.keys(desired.profiles).length > 0, 'Desired GitHub profiles are required')
  uniqueNonEmptyStrings(desired.managedEnvironmentNames, 'managedEnvironmentNames must contain unique non-empty strings')
  invariant(
    stableStringify(desired.managedEnvironmentNames, 0) === stableStringify(CANONICAL_MANAGED_ENVIRONMENT_NAMES, 0),
    'managedEnvironmentNames must exactly equal the canonical destructive-reconcile scope',
  )
  for (const [name, integration] of Object.entries(desired.integrations)) {
    invariant(integration && typeof integration === 'object', `Integration ${name} must be an object`)
    invariant(integration.id === null || (Number.isInteger(integration.id) && integration.id >= 1), `Integration ${name} id must be null or a positive integer`)
    nonEmptyString(integration.slug, `Integration ${name} must have a non-empty slug`)
    // 1B(2026-07-29):App 整合允許 required=false(誠實反映未 provision;schema 以
    // 常數封閉每個整合的精確值,防無聲升降級);githubActions 仍必為 required。
    invariant(typeof integration.required === 'boolean', `Integration ${name} must declare required as a boolean`)
    invariant(name !== 'githubActions' || integration.required === true, 'GitHub Actions integration must remain required')
    invariant(['github-native', 'external-service', 'base-trusted-isolated-workflow', 'github-actions-environment'].includes(integration.operationMode), `Integration ${name} must declare a supported operationMode`)
  }

  const checkApp = desired.integrations.governanceCheckApp
  const writerApp = desired.integrations.governanceWriterApp
  invariant(
    desired.integrations.githubActions?.operationMode === 'github-native'
      && desired.integrations.githubActions.capability === 'ci'
      && desired.integrations.githubActions.id === 15368
      && desired.integrations.githubActions.slug === 'github-actions',
    'GitHub Actions integration must use the canonical native identity',
  )
  if (checkApp || writerApp) {
    invariant(checkApp && writerApp, 'Governance Check App and Writer App must be declared together')
    invariant(checkApp.capability === 'check-only' && checkApp.externalTrustAnchor === true, 'Governance Check App must be the check-only external trust anchor')
    invariant(writerApp.capability === 'writer' && writerApp.externalTrustAnchor === false, 'Governance Writer App must be writer-only and must not be an external trust anchor')
    invariant(checkApp.slug === 'qijenchen-governance-check' && writerApp.slug === 'qijenchen-governance-writer', 'Governance Apps must use the canonical registered slugs')
    invariant(['external-service', 'base-trusted-isolated-workflow'].includes(checkApp.operationMode), 'Governance Check App must be external or isolated in a protected-base workflow')
    invariant(writerApp.operationMode === 'github-actions-environment', 'Governance Writer App must be isolated in protected GitHub environments')
    invariant(checkApp.slug !== writerApp.slug, 'Governance Check and Writer Apps must have distinct slugs')
    invariant(checkApp.secretPrefix === 'GOVERNANCE_CHECK_APP', 'Governance Check App must use the GOVERNANCE_CHECK_APP secret prefix')
    invariant(writerApp.secretPrefix === 'GOVERNANCE_WRITER_APP', 'Governance Writer App must use the GOVERNANCE_WRITER_APP secret prefix')
    invariant(checkApp.secretPrefix !== writerApp.secretPrefix, 'Governance Check and Writer Apps must use distinct secret prefixes')
    invariant(checkApp.repositorySelection === 'selected' && writerApp.repositorySelection === 'selected', 'Governance Apps must use selected-repository installation scope')
    invariant(
      exactKeys(checkApp.permissions, ['checks']) && checkApp.permissions.checks === 'write',
      'Governance Check App permissions must be exactly checks:write',
    )
    invariant(
      exactKeys(writerApp.permissions, ['contents', 'pullRequests', 'workflows'])
        && writerApp.permissions.contents === 'write'
        && writerApp.permissions.pullRequests === 'write'
        && writerApp.permissions.workflows === 'write',
      'Governance Writer App permissions must be exactly contents:write, pullRequests:write, and workflows:write',
    )
    if (Number.isInteger(checkApp.id) && Number.isInteger(writerApp.id)) invariant(checkApp.id !== writerApp.id, 'Governance Check and Writer Apps must have distinct integration IDs')
    if (Number.isInteger(checkApp.id) && Number.isInteger(desired.integrations.githubActions?.id)) invariant(checkApp.id !== desired.integrations.githubActions.id, 'Governance Check App must not reuse the GitHub Actions integration ID')
    if (Number.isInteger(writerApp.id) && Number.isInteger(desired.integrations.githubActions?.id)) invariant(writerApp.id !== desired.integrations.githubActions.id, 'Governance Writer App must not reuse the GitHub Actions integration ID')
  }

  for (const repo of inventory.repositories) {
    invariant(desired.profiles[repo.desiredProfile], `Unknown desired profile ${repo.desiredProfile} for ${repo.id}`)
  }
  for (const [profileName, profile] of Object.entries(desired.profiles)) {
    invariant(
      exactKeys(profile.actionsWorkflowPermissions, ['default_workflow_permissions', 'can_approve_pull_request_reviews']),
      `${profileName} Actions workflow permissions must have a closed exact shape`,
    )
    invariant(
      profile.actionsWorkflowPermissions?.default_workflow_permissions === 'read',
      `${profileName} must default GITHUB_TOKEN workflow permissions to read`,
    )
    invariant(
      typeof profile.actionsWorkflowPermissions?.can_approve_pull_request_reviews === 'boolean',
      `${profileName} must explicitly declare whether GitHub Actions can create or approve pull requests`,
    )
    invariant(typeof profile.immutableReleases === 'boolean', `${profileName} must declare immutableReleases`)
    invariant(Array.isArray(profile.requiredChecks) && profile.requiredChecks.length > 0, `${profileName} must define required checks`)
    invariant(Array.isArray(profile.rulesets) && profile.rulesets.length > 0, `${profileName} must define rulesets`)
    invariant(Array.isArray(profile.environments), `${profileName} environments must be an array`)
    invariant(profile.tagPolicy?.pattern === 'v*' && profile.tagPolicy.sourceBranch === 'main', `${profileName} tag policy must protect v* from main`)
    invariant(profile.tagPolicy.requireSourceAncestry === true && profile.tagPolicy.requireVerifiedSource === true, `${profileName} tag policy must require verified source ancestry`)
    if (profile.tagPolicy.sourceWorkflow) {
      invariant(/^\.github\/workflows\/.+\.ya?ml$/.test(profile.tagPolicy.sourceWorkflow), `${profileName} tag source workflow path is invalid`)
      assertReviewedWorkflowIdentity(profile.tagPolicy.sourceWorkflowIdentity, `${profileName} tag source workflow`)
    } else invariant(profile.tagPolicy.sourceWorkflowIdentity === undefined, `${profileName} cannot declare a tag source workflow identity without a source workflow`)
    const checkNames = new Set()
    let baseTrustedChecks = 0
    for (const check of profile.requiredChecks) {
      nonEmptyString(check.context, `Required check context is missing in ${profileName}`)
      invariant(!checkNames.has(check.context), `Duplicate required check ${check.context} in ${profileName}`)
      invariant(desired.integrations[check.integration], `Unknown integration ${check.integration} for ${check.context}`)
      uniqueNonEmptyStrings(check.requiredEvents, `Required event missing for ${check.context}`)
      invariant(['repository-workflow', 'protected-base-workflow', 'external-github-app'].includes(check.trustSource), `Required check ${check.context} trustSource is invalid`)
      if (check.trustSource === 'repository-workflow' || check.trustSource === 'protected-base-workflow') {
        invariant(typeof check.workflow === 'string' && /^\.github\/workflows\/.+\.ya?ml$/.test(check.workflow), `Required workflow is invalid for ${check.context}`)
        assertReviewedWorkflowIdentity(check.workflowIdentity, `Required check ${check.context}`)
        if (check.trustSource === 'repository-workflow') invariant(check.baseTrusted !== true, `Repository workflow ${check.context} cannot be the base-trusted boundary`)
        else {
          invariant(check.baseTrusted === true, `Protected-base workflow ${check.context} must be base trusted`)
          invariant(check.requiredEvents.length === 1 && check.requiredEvents[0] === 'pull_request_target', `Protected-base workflow ${check.context} must run unconditionally on pull_request_target`)
        }
      } else {
        invariant(check.workflow === undefined && check.workflowIdentity === undefined, `External App check ${check.context} must not trust a repository workflow`)
      }
      invariant(check.requiredEvents.every(event => event === 'pull_request' || event === 'pull_request_target'), `Unknown required event for ${check.context}`)
      invariant(check.forbidCandidateControlledSkip === true && check.requireUnconditionalPullRequest === true, `Required check ${check.context} must fail closed against candidate skips`)
      if (check.baseTrusted) {
        const integration = desired.integrations[check.integration]
        invariant(integration.capability === 'check-only' && integration.externalTrustAnchor === true, `Base-trusted check ${check.context} must use the check-only external trust anchor`)
        invariant(
          (check.trustSource === 'external-github-app' && integration.operationMode === 'external-service')
          || (check.trustSource === 'protected-base-workflow' && integration.operationMode === 'base-trusted-isolated-workflow'),
          `Base-trusted check ${check.context} trust source and Check App operation mode are inconsistent`,
        )
        baseTrustedChecks += 1
      }
      checkNames.add(check.context)
    }
    // 1B(2026-07-29):authority repo 的信任基礎 = protected repository workflows +
    // required checks + branch protection;App-pinned verdict 層已拆除(secrets 從未
    // provision、檢查恆紅)。consumer/template profiles(fleet 藍圖)仍必須有
    // base-trusted App verdict。
    invariant(baseTrustedChecks > 0 || profileName === 'design-system-authority', `${profileName} must require at least one distinct base-trusted Governance Check App verdict`)
    invariant(profile.rulesets.length === 3, `${profileName} must define exactly the three canonical managed rulesets`)
    const rulesetNames = new Set()
    const ruleTypesByRulesetName = new Map()
    for (const ruleset of profile.rulesets) {
      nonEmptyString(ruleset.name, `Ruleset name is missing in ${profileName}`)
      invariant(ruleset.name.startsWith(desired.managedRulesetPrefix), `Ruleset ${ruleset.name} is outside managed prefix`)
      invariant(!rulesetNames.has(ruleset.name), `Duplicate ruleset ${ruleset.name} in ${profileName}`)
      invariant(ruleset.target === 'branch' || ruleset.target === 'tag', `Ruleset ${ruleset.name} has invalid target`)
      invariant(ruleset.enforcement === 'active', `Ruleset ${ruleset.name} in ${profileName} must be active in source policy`)
      invariant(['always', 'on-promotion'].includes(ruleset.rollout), `Ruleset ${ruleset.name} in ${profileName} has invalid rollout`)
      invariant(
        exactKeys(ruleset.conditions, ['ref_name'])
          && exactKeys(ruleset.conditions.ref_name, ['include', 'exclude'])
          && Array.isArray(ruleset.conditions.ref_name.include)
          && ruleset.conditions.ref_name.include.length > 0
          && Array.isArray(ruleset.conditions.ref_name.exclude)
          && ruleset.conditions.ref_name.exclude.length === 0,
        `Ruleset ${ruleset.name} in ${profileName} must have a closed non-empty ref_name condition without exclusions`,
      )
      invariant((ruleset.bypass_actors ?? []).length === 0, `Bypass actors are forbidden in ${ruleset.name}`)
      invariant(Array.isArray(ruleset.rules) && ruleset.rules.length > 0, `Ruleset ${ruleset.name} must contain rules`)
      const ruleTypes = new Set()
      for (const rule of ruleset.rules) {
        nonEmptyString(rule.type, `Ruleset ${ruleset.name} contains a rule without a type`)
        invariant(!ruleTypes.has(rule.type), `Ruleset ${ruleset.name} in ${profileName} contains duplicate rule type ${rule.type}`)
        if (rule.type === 'pull_request') {
          invariant(exactKeys(rule, ['type', 'parameters']), `${profileName} pull_request rule must have a closed shape`)
          invariant(
            exactKeys(rule.parameters, [
              'dismiss_stale_reviews_on_push',
              'require_code_owner_review',
              'require_last_push_approval',
              'required_approving_review_count',
              'required_review_thread_resolution',
            ]),
            `${profileName} pull_request parameters must have a closed shape`,
          )
          invariant(rule.parameters.dismiss_stale_reviews_on_push === false, `${profileName} must preserve the reviewed stale-review policy`)
          invariant(rule.parameters.required_approving_review_count === 0, `${profileName} must use solo approval count 0`)
          invariant(rule.parameters.require_code_owner_review === false, `${profileName} must not fake CODEOWNER approval`)
          invariant(rule.parameters.require_last_push_approval === false, `${profileName} must not require last-push self approval`)
          invariant(rule.parameters.required_review_thread_resolution === true, `${profileName} must require review-thread resolution`)
        } else if (rule.type === 'required_status_checks') {
          invariant(
            exactKeys(rule, ['type', 'parameters'])
              && exactKeys(rule.parameters, ['fromProfile', 'strict_required_status_checks_policy'])
              && rule.parameters.fromProfile === true
              && rule.parameters.strict_required_status_checks_policy === true,
            `${profileName} required_status_checks must bind the complete profile with strict policy`,
          )
        } else {
          invariant(
            ['creation', 'deletion', 'non_fast_forward', 'required_linear_history', 'required_signatures', 'update'].includes(rule.type)
              && exactKeys(rule, ['type']),
            `Ruleset ${ruleset.name} in ${profileName} contains an unsupported or open simple rule`,
          )
        }
        ruleTypes.add(rule.type)
      }
      if (ruleset.target === 'tag') {
        invariant(ruleTypes.has('required_signatures'), `Tag ruleset ${ruleset.name} in ${profileName} must require signed commits as defense-in-depth`)
      }
      ruleTypesByRulesetName.set(ruleset.name, ruleTypes)
      rulesetNames.add(ruleset.name)
    }
    const canonicalRulesets = [
      {
        name: `${desired.managedRulesetPrefix}base-integrity`,
        target: 'branch',
        rollout: 'always',
        include: ['~DEFAULT_BRANCH'],
        rules: ['deletion', 'non_fast_forward', 'required_linear_history'],
      },
      {
        name: `${desired.managedRulesetPrefix}verified-main`,
        target: 'branch',
        rollout: 'on-promotion',
        include: ['~DEFAULT_BRANCH'],
        rules: ['pull_request', 'required_status_checks'],
      },
      {
        name: `${desired.managedRulesetPrefix}immutable-release-tags`,
        target: 'tag',
        rollout: 'on-promotion',
        include: ['refs/tags/v*'],
        rules: [
          ...(!profile.tagPolicy.allowCreation ? ['creation'] : []),
          'update',
          'deletion',
          'required_signatures',
        ],
      },
    ]
    for (const expected of canonicalRulesets) {
      const ruleset = profile.rulesets.find(candidate => candidate.name === expected.name)
      invariant(ruleset, `${profileName} is missing canonical ruleset ${expected.name}`)
      invariant(
        ruleset.target === expected.target
          && ruleset.rollout === expected.rollout
          && stableStringify(ruleset.conditions.ref_name.include) === stableStringify(expected.include),
        `${profileName} canonical ruleset ${expected.name} has a weakened target, rollout, or ref condition`,
      )
      invariant(
        stableStringify([...ruleTypesByRulesetName.get(ruleset.name)].sort()) === stableStringify([...expected.rules].sort()),
        `${profileName} canonical ruleset ${expected.name} must contain the exact required rule types`,
      )
    }
    const environmentNames = new Set()
    for (const environment of profile.environments) {
      invariant(!environmentNames.has(environment.name), `${profileName} contains duplicate environment ${environment.name}`)
      environmentNames.add(environment.name)
      invariant(desired.managedEnvironmentNames.includes(environment.name), `Unmanaged environment name ${environment.name}`)
      if (environment.independentReviewRequired) {
        invariant(environment.name === 'release-finalize' && environment.preventSelfReview === true, `${environment.name} independent review must prevent self review`)
        invariant(environment.workflow === '.github/workflows/release-finalize.yml', 'release-finalize independent review must be bound to the release-finalize workflow')
        invariant(environment.deploymentBranchPolicy?.protectedBranches === true && environment.deploymentBranchPolicy?.customBranchPolicies === false, 'release-finalize must accept deployments only from protected branches')
      } else invariant(environment.reviewers?.length === 0 && environment.preventSelfReview === false, `${environment.name} must not imply a reviewer that does not exist`)
      invariant(typeof environment.workflow === 'string' && /^\.github\/workflows\/.+\.ya?ml$/.test(environment.workflow), `${environment.name} must name a valid workflow that consumes it`)
      assertReviewedWorkflowIdentity(environment.workflowIdentity, `Environment ${environment.name}`)
      if (environment.credentialIntegration) {
        const integration = desired.integrations[environment.credentialIntegration]
        invariant(integration, `Unknown credential integration ${environment.credentialIntegration} for ${environment.name}`)
        if (environment.name === 'governance-check-verdict') {
          invariant(integration.capability === 'check-only' && integration.operationMode === 'base-trusted-isolated-workflow', 'governance-check-verdict must isolate the check-only App')
          invariant(environment.rollout === 'always', 'governance-check-verdict must exist before promotion')
          invariant(environment.deploymentBranchPolicy?.protectedBranches === true && environment.deploymentBranchPolicy?.customBranchPolicies === false, 'governance-check-verdict must accept only protected branches')
        } else invariant(integration.capability === 'writer', `${environment.name} mutation credential must use a writer-only App`)
      }
      if (environment.name === 'npm-release') {
        invariant(environment.credentialIntegration === undefined, 'npm-release must remain OIDC-only and may not receive a repository Writer App credential')
        invariant(environment.workflow === '.github/workflows/release.yml', 'npm-release must bind the canonical release workflow')
      }
    }
    const upgradeEnvironments = profile.environments.filter(environment => environment.name === 'governance-upgrade')
    if (upgradeEnvironments.length) {
      invariant(upgradeEnvironments.length === 1, `${profileName} must declare exactly one governance-upgrade environment`)
      const upgradeEnvironment = upgradeEnvironments[0]
      invariant(upgradeEnvironment.workflow === '.github/workflows/sync-design-system.yml', `${profileName} governance-upgrade must bind the canonical sync workflow`)
      invariant(upgradeEnvironment.credentialIntegration === 'governanceWriterApp', `${profileName} governance-upgrade must use the dedicated Governance Writer App`)
      invariant(upgradeEnvironment.deploymentBranchPolicy?.protectedBranches === true && upgradeEnvironment.deploymentBranchPolicy?.customBranchPolicies === false, `${profileName} governance-upgrade must load only from protected branches`)
      invariant(profile.actionsWorkflowPermissions.can_approve_pull_request_reviews === false, `${profileName} must disable the built-in GITHUB_TOKEN PR writer when governance-upgrade uses the Writer App`)
    }
    const externalLedgerEnvironments = profile.environments.filter(environment => environment.name === 'governance-external-ledger')
    if (profileName === 'design-system-authority') {
      invariant(externalLedgerEnvironments.length === 1, 'design-system-authority must declare exactly one governance-external-ledger environment')
      const externalLedgerEnvironment = externalLedgerEnvironments[0]
      invariant(externalLedgerEnvironment.workflow === '.github/workflows/external-ledger-writer.yml',
        'governance-external-ledger must bind the protected external-ledger writer workflow')
      invariant(externalLedgerEnvironment.credentialIntegration === 'governanceWriterApp',
        'governance-external-ledger must use the dedicated Governance Writer App')
      invariant(externalLedgerEnvironment.rollout === 'always',
        'governance-external-ledger must exist before candidate freeze and external activation')
      invariant(externalLedgerEnvironment.deploymentBranchPolicy?.protectedBranches === true
        && externalLedgerEnvironment.deploymentBranchPolicy?.customBranchPolicies === false,
      'governance-external-ledger must load only from protected branches')
    } else invariant(externalLedgerEnvironments.length === 0,
      `${profileName} must not receive authority external-ledger writer credentials`)
    for (const check of profile.requiredChecks.filter(item => item.trustSource === 'protected-base-workflow')) {
      const verdictEnvironment = profile.environments.find(environment => environment.name === 'governance-check-verdict')
      invariant(verdictEnvironment, `${profileName} protected-base check ${check.context} requires governance-check-verdict environment`)
      invariant(verdictEnvironment.workflow === check.workflow, `${profileName} governance-check-verdict workflow must match ${check.context}`)
      invariant(verdictEnvironment.credentialIntegration === check.integration, `${profileName} governance-check-verdict must use the same Check App as ${check.context}`)
      invariant(JSON.stringify(verdictEnvironment.workflowIdentity) === JSON.stringify(check.workflowIdentity), `${profileName} governance-check-verdict identity must match ${check.context}`)
    }
  }

  assertNoEmbeddedSecrets({ inventory, desired })
  return true
}

function validateDeterministicGovernanceModelCore({
  inventory,
  desired,
  rings,
  roleSurfacePolicy = loadRoleSurfacePolicy(),
  matrix = defaultProviderRegistry(),
  runtimeProfile = defaultRuntimeProfile(),
  adapterRegistry = defaultAdapterRegistry(),
  issuerRegistry = loadIssuerRegistry(),
  activationPolicy,
  expectedActivationPolicyDigest,
  now = new Date(),
}, { requireWorkflowIdentitySourceRepositories }) {
  invariant(desired?.schemaVersion === 1, 'Desired GitHub schemaVersion must be 1')
  validateDeterministicDocumentSchema('inventory', inventory)
  validateDeterministicDocumentSchema('desired', desired)
  validateDeterministicDocumentSchema('rings', rings)
  validateDeterministicDocumentSchema('runtimeProfile', runtimeProfile)
  validateDeterministicDocumentSchema('roleSurfacePolicy', roleSurfacePolicy)
  const registry = validateProviderRegistry(matrix, runtimeProfile, { adapterRegistry, issuerRegistry, now })
  validateInventory(inventory, {
    providerIds: registry.providerIds,
    providerRuntimeKinds: registry.runtimeKindIds,
    providerSurfaces: registry.surfaceIds,
    requireCertificationCanaries: true,
    requireWorkflowIdentitySourceRepositories,
  })
  validateManagedRepositoryRoleSurfaces(inventory, roleSurfacePolicy, registry)
  validateReleaseRingRoleSurfaces(inventory, rings, roleSurfacePolicy, registry)
  const consumerUpgradeProtocol = loadConsumerUpgradeProtocol().protocol
  for (const repo of inventory.repositories.filter(item => item.role !== 'authority')) {
    const profile = upgradeProfile(consumerUpgradeProtocol, repo.upgradeProtocolProfile)
    const hasAcceptedBootstrap = /^[a-f0-9]{64}$/.test(repo.acceptedBootstrapReadbackSha256 ?? '')
    invariant(
      hasAcceptedBootstrap === profile.acceptedBootstrapBindingRequired,
      `Repository ${repo.id} accepted bootstrap readback binding does not match profile ${repo.upgradeProtocolProfile}`,
    )
    const hasAcceptedControlPlaneUpdate = repo.acceptedControlPlaneUpdate !== undefined
    invariant(
      hasAcceptedControlPlaneUpdate === profile.controlPlaneUpdateBindingRequired,
      `Repository ${repo.id} accepted control-plane update binding does not match profile ${repo.upgradeProtocolProfile}`,
    )
  }
  validateReleaseRings(inventory, rings, {
    now,
    issuerRegistry,
    activationPolicy,
    expectedActivationPolicyDigest,
  })
  validateDesiredGithub(inventory, desired)
  assertNoEmbeddedSecrets({ inventory, desired, rings, roleSurfacePolicy, matrix, runtimeProfile })
  return true
}

export function validateDeterministicGovernanceModel(options) {
  return validateDeterministicGovernanceModelCore(options, {
    requireWorkflowIdentitySourceRepositories: true,
  })
}

function validateGovernanceModelCore({
  inventory,
  desired,
  rings,
  certifications,
  waivers,
  roleSurfacePolicy = loadRoleSurfacePolicy(),
  matrix = defaultProviderRegistry(),
  runtimeProfile = defaultRuntimeProfile(),
  adapterRegistry = defaultAdapterRegistry(),
  issuerRegistry = loadIssuerRegistry(),
  activationPolicy,
  expectedActivationPolicyDigest,
  repoRoot,
  runtimeIdentity,
  externalRepositoryIdentities,
  now = new Date(),
}, { requireWorkflowIdentitySourceRepositories }) {
  validateDeterministicGovernanceModelCore({
    inventory,
    desired,
    rings,
    roleSurfacePolicy,
    matrix,
    runtimeProfile,
    adapterRegistry,
    issuerRegistry,
    activationPolicy,
    expectedActivationPolicyDigest,
    now,
  }, {
    requireWorkflowIdentitySourceRepositories,
  })
  validateWaivers(inventory, waivers)

  validateCertifications(certifications, {
    now,
    repoRoot,
    runtimeIdentity,
    matrix,
    runtimeProfile,
    adapterRegistry,
    issuerRegistry,
    inventory,
    desiredGithub: desired,
    externalRepositoryIdentities,
    roleSurfacePolicy,
  })
  const requiredCertificationKeys = new Set(inventory.repositories.flatMap(repo => (
    repo.providerSurfacesRequired.map(requirement => `${requirement}/${repo.role}`)
  )))
  const certificationKeys = new Set(certifications.certifications.map(item => (
    certificationKey(item.provider, item.runtimeKind, item.surface, item.repositoryRole)
  )))
  const missingCertificationKeys = [...requiredCertificationKeys].filter(key => !certificationKeys.has(key)).sort()
  const extraCertificationKeys = [...certificationKeys].filter(key => !requiredCertificationKeys.has(key)).sort()
  invariant(
    missingCertificationKeys.length === 0 && extraCertificationKeys.length === 0,
    `Provider certification ledger keys must exactly equal role-surface inventory requirements; missing=[${missingCertificationKeys.join(',')}]; extra=[${extraCertificationKeys.join(',')}]`,
  )
  assertNoEmbeddedSecrets({ inventory, desired, rings, certifications, waivers })
  return true
}

export function validateGovernanceModel(options) {
  return validateGovernanceModelCore(options, {
    requireWorkflowIdentitySourceRepositories: true,
  })
}

export function createPartialInventoryFixtureValidator() {
  return options => validateGovernanceModelCore(options, {
    requireWorkflowIdentitySourceRepositories: false,
  })
}
