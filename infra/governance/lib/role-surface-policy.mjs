import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_ROLE_SURFACE_POLICY_PATH = resolve(GOVERNANCE_ROOT, 'providers/role-surface-policy.json')
export const MANAGED_REPOSITORY_ROLES = Object.freeze(['authority', 'template-mirror', 'product-consumer'])
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/
const SURFACE_REQUIREMENT = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/
const PROVIDER_EXCLUSION_REASON = 'provider-not-applicable-to-role'
const SURFACE_EXCLUSION_REASON = 'surface-not-applicable-to-role'
const ROLE_CERTIFICATION_CARRIER_MINIMA = Object.freeze({
  authority: Object.freeze({
    relationship: 'ledger-carrier-descendant',
    allowedChangedPaths: Object.freeze([
      'infra/governance/evidence/external-runtime/**',
      'infra/governance/evidence/provider-runtime/**',
      'infra/governance/evidence/review-capability/**',
      'infra/governance/providers/certifications.json',
      'infra/governance/providers/review-capability-certifications.json',
    ]),
  }),
  'template-mirror': Object.freeze({
    relationship: 'exact-subject',
    allowedChangedPaths: Object.freeze([]),
  }),
  'product-consumer': Object.freeze({
    relationship: 'exact-subject',
    allowedChangedPaths: Object.freeze([]),
  }),
})
const ROLE_PROVIDER_TRANSPORT_MINIMA = Object.freeze({
  authority: Object.freeze({ claude: 'claude-authority-full' }),
  'template-mirror': Object.freeze({ claude: null }),
  'product-consumer': Object.freeze({ claude: null }),
})
const ROLE_NON_EXCLUDABLE_SURFACE_MINIMA = Object.freeze({
  authority: Object.freeze([
    'codex/codex-cli/local',
    'codex/codex-desktop/local',
    'codex/codex-desktop/remote-control',
    'codex/codex-cloud/cloud',
    'claude-code/claude-code-cli/local',
    'claude-code/claude-code-cli/remote-control',
    'claude-code/claude-code-cloud/cloud',
    'ci/github-actions/github-actions',
  ]),
  'template-mirror': Object.freeze([
    'codex/codex-desktop/remote-control',
    'codex/codex-cloud/cloud',
    'claude-code/claude-code-cli/remote-control',
    'claude-code/claude-code-cloud/cloud',
    'ci/github-actions/github-actions',
  ]),
  'product-consumer': Object.freeze([
    'codex/codex-cli/local',
    'codex/codex-desktop/local',
    'codex/codex-desktop/remote-control',
    'codex/codex-cloud/cloud',
    'claude-code/claude-code-cli/local',
    'claude-code/claude-code-cli/remote-control',
    'claude-code/claude-code-cloud/cloud',
    'ci/github-actions/github-actions',
  ]),
})

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} has an invalid or open shape`,
  )
}

function assertKnownRequirement(requirement, label, { providerIds, runtimeKindIds, surfaceIds }) {
  invariant(typeof requirement === 'string' && SURFACE_REQUIREMENT.test(requirement), `${label} is invalid:${String(requirement)}`)
  const [provider, runtimeKind, surface] = requirement.split('/')
  if (providerIds) invariant(providerIds.has(provider), `${label} uses unknown provider:${provider}`)
  if (runtimeKindIds) invariant(runtimeKindIds.get(provider)?.has(runtimeKind), `${label} uses unknown runtime kind:${provider}/${runtimeKind}`)
  if (surfaceIds) invariant(surfaceIds.has(surface), `${label} uses unknown surface:${surface}`)
}

function assertExclusionDetail(detail, label) {
  invariant(
    typeof detail === 'string' && detail.trim() === detail && detail.length >= 20 && detail.length <= 1000,
    `${label} detail must be a trimmed explanatory string between 20 and 1000 characters`,
  )
}

function registeredRequirementUniverse(registry) {
  if (registry.runtimeProfilesByCertificationTuple === undefined) return null
  invariant(
    registry.runtimeProfilesByCertificationTuple instanceof Map,
    'Role-surface registry runtimeProfilesByCertificationTuple must be a Map',
  )
  invariant(
    registry.runtimeProfilesByCertificationTuple.size > 0,
    'Role-surface registry must contain at least one registered certification tuple',
  )
  return new Set(registry.runtimeProfilesByCertificationTuple.keys())
}

function validateCoverageClosure(profile, role, registry) {
  const universe = registeredRequirementUniverse(registry)
  if (universe === null) return
  const required = new Set(profile.requiredSurfaces)
  const excludedSurfaces = new Set(profile.coverageExclusions.surfaces.map(item => item.requirement))
  const excludedProviders = new Set(profile.coverageExclusions.providers.map(item => item.provider))

  for (const requirement of required) {
    invariant(
      universe.has(requirement),
      `Role-surface coverage ${role} requires an unregistered certification tuple:${requirement}`,
    )
  }
  for (const requirement of excludedSurfaces) {
    invariant(
      universe.has(requirement),
      `Role-surface coverage ${role} excludes an unregistered certification tuple:${requirement}`,
    )
  }
  for (const provider of excludedProviders) {
    invariant(
      [...universe].some(requirement => requirement.startsWith(`${provider}/`)),
      `Role-surface coverage ${role} excludes provider ${provider} without a registered certification tuple`,
    )
  }
  for (const requirement of universe) {
    const provider = requirement.split('/')[0]
    const classifications = Number(required.has(requirement))
      + Number(excludedSurfaces.has(requirement))
      + Number(excludedProviders.has(provider))
    invariant(
      classifications === 1,
      `Role-surface coverage ${role} must classify registered tuple ${requirement} exactly once; found ${classifications}`,
    )
  }
}

function validateRoleCertificationCarrierMinimum(profile, role) {
  const expected = ROLE_CERTIFICATION_CARRIER_MINIMA[role]
  invariant(
    profile.certificationCarrierPolicy.relationship === expected.relationship
      && JSON.stringify(profile.certificationCarrierPolicy.allowedChangedPaths) === JSON.stringify(expected.allowedChangedPaths),
    `Role-surface policy ${role} certification carrier policy differs from its non-weakenable role minimum`,
  )
}

function validateNonExcludableRoleSurfaces(profile, role) {
  const required = new Set(profile.requiredSurfaces)
  for (const requirement of ROLE_NON_EXCLUDABLE_SURFACE_MINIMA[role]) {
    invariant(
      required.has(requirement),
      `Role-surface policy ${role} may not exclude or omit mandatory existing surface:${requirement}`,
    )
  }
}

export function validateRoleSurfacePolicy(policy, registry = {}) {
  exactKeys(policy, ['$schema', 'schemaVersion', 'kind', 'roles'], 'Role-surface policy')
  invariant(policy.$schema === '../schemas/role-surface-policy.schema.json', 'Role-surface policy schema binding is invalid')
  invariant(policy.schemaVersion === 3 && policy.kind === 'provider-neutral-role-surface-policy', 'Role-surface policy identity/version is invalid')
  exactKeys(policy.roles, MANAGED_REPOSITORY_ROLES, 'Role-surface policy roles')
  for (const role of MANAGED_REPOSITORY_ROLES) {
    const profile = policy.roles[role]
    exactKeys(profile, ['certificationCarrierPolicy', 'coverageExclusions', 'providerTransportProfiles', 'requiredSurfaces'], `Role-surface policy ${role}`)
    exactKeys(profile.certificationCarrierPolicy, ['relationship', 'allowedChangedPaths'], `Role-surface policy ${role} certificationCarrierPolicy`)
    invariant(['exact-subject', 'ledger-carrier-descendant'].includes(profile.certificationCarrierPolicy.relationship), `Role-surface policy ${role} certification carrier relationship is invalid`)
    invariant(Array.isArray(profile.certificationCarrierPolicy.allowedChangedPaths), `Role-surface policy ${role} certification carrier allowedChangedPaths must be an array`)
    invariant(new Set(profile.certificationCarrierPolicy.allowedChangedPaths).size === profile.certificationCarrierPolicy.allowedChangedPaths.length, `Role-surface policy ${role} certification carrier allowedChangedPaths contains duplicates`)
    invariant(profile.certificationCarrierPolicy.allowedChangedPaths.every(path => typeof path === 'string' && path.length > 0), `Role-surface policy ${role} certification carrier allowedChangedPaths is invalid`)
    if (profile.certificationCarrierPolicy.relationship === 'exact-subject') invariant(profile.certificationCarrierPolicy.allowedChangedPaths.length === 0, `Role-surface policy ${role} exact-subject carrier cannot allow changed paths`)
    else invariant(profile.certificationCarrierPolicy.allowedChangedPaths.length > 0, `Role-surface policy ${role} ledger carrier must enumerate changed paths`)
    validateRoleCertificationCarrierMinimum(profile, role)
    exactKeys(profile.providerTransportProfiles, ['claude'], `Role-surface policy ${role} providerTransportProfiles`)
    invariant(
      JSON.stringify(profile.providerTransportProfiles) === JSON.stringify(ROLE_PROVIDER_TRANSPORT_MINIMA[role]),
      `Role-surface policy ${role} provider transport selection differs from its non-weakenable role minimum`,
    )
    invariant(Array.isArray(profile.requiredSurfaces) && profile.requiredSurfaces.length > 0, `Role-surface policy ${role} requiredSurfaces must be non-empty`)
    invariant(new Set(profile.requiredSurfaces).size === profile.requiredSurfaces.length, `Role-surface policy ${role} requiredSurfaces contains duplicates`)
    profile.requiredSurfaces.forEach((requirement, index) => (
      assertKnownRequirement(requirement, `Role-surface policy ${role} requiredSurfaces[${index}]`, registry)
    ))
    validateNonExcludableRoleSurfaces(profile, role)
    exactKeys(profile.coverageExclusions, ['providers', 'surfaces'], `Role-surface policy ${role} coverageExclusions`)
    invariant(Array.isArray(profile.coverageExclusions.providers), `Role-surface policy ${role} coverageExclusions.providers must be an array`)
    invariant(Array.isArray(profile.coverageExclusions.surfaces), `Role-surface policy ${role} coverageExclusions.surfaces must be an array`)
    const excludedProviderIds = new Set()
    profile.coverageExclusions.providers.forEach((exclusion, index) => {
      const label = `Role-surface policy ${role} coverageExclusions.providers[${index}]`
      exactKeys(exclusion, ['provider', 'reasonCode', 'detail'], label)
      invariant(typeof exclusion.provider === 'string' && PROVIDER_ID.test(exclusion.provider), `${label} provider is invalid`)
      if (registry.providerIds) invariant(registry.providerIds.has(exclusion.provider), `${label} uses unknown provider:${exclusion.provider}`)
      invariant(exclusion.reasonCode === PROVIDER_EXCLUSION_REASON, `${label} reasonCode is invalid`)
      assertExclusionDetail(exclusion.detail, label)
      invariant(!excludedProviderIds.has(exclusion.provider), `Role-surface policy ${role} coverageExclusions.providers contains duplicate provider:${exclusion.provider}`)
      excludedProviderIds.add(exclusion.provider)
    })
    const excludedSurfaceRequirements = new Set()
    profile.coverageExclusions.surfaces.forEach((exclusion, index) => {
      const label = `Role-surface policy ${role} coverageExclusions.surfaces[${index}]`
      exactKeys(exclusion, ['requirement', 'reasonCode', 'detail'], label)
      assertKnownRequirement(exclusion.requirement, `${label} requirement`, registry)
      invariant(exclusion.reasonCode === SURFACE_EXCLUSION_REASON, `${label} reasonCode is invalid`)
      assertExclusionDetail(exclusion.detail, label)
      invariant(!excludedSurfaceRequirements.has(exclusion.requirement), `Role-surface policy ${role} coverageExclusions.surfaces contains duplicate requirement:${exclusion.requirement}`)
      invariant(!profile.requiredSurfaces.includes(exclusion.requirement), `Role-surface policy ${role} both requires and excludes:${exclusion.requirement}`)
      excludedSurfaceRequirements.add(exclusion.requirement)
    })
    validateCoverageClosure(profile, role, registry)
  }
  return policy
}

export function loadRoleSurfacePolicy(path = DEFAULT_ROLE_SURFACE_POLICY_PATH) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Role-surface policy must be one regular unaliased file')
  return validateRoleSurfacePolicy(JSON.parse(readFileSync(path, 'utf8')))
}

export function requiredSurfacesForRole(policy, role) {
  validateRoleSurfacePolicy(policy)
  invariant(MANAGED_REPOSITORY_ROLES.includes(role), `Unknown managed repository role:${String(role)}`)
  return [...policy.roles[role].requiredSurfaces]
}

export function certificationCarrierPolicyForRole(policy, role) {
  validateRoleSurfacePolicy(policy)
  invariant(MANAGED_REPOSITORY_ROLES.includes(role), `Unknown managed repository role:${String(role)}`)
  return structuredClone(policy.roles[role].certificationCarrierPolicy)
}

export function providerTransportProfileForRole(policy, role, providerId) {
  validateRoleSurfacePolicy(policy)
  invariant(MANAGED_REPOSITORY_ROLES.includes(role), `Unknown managed repository role:${String(role)}`)
  invariant(Object.hasOwn(policy.roles[role].providerTransportProfiles, providerId), `Unknown role transport provider:${String(providerId)}`)
  return policy.roles[role].providerTransportProfiles[providerId]
}

export function validateManagedRepositoryRoleSurfaces(inventory, policy, registry = {}) {
  validateRoleSurfacePolicy(policy, registry)
  invariant(inventory && Array.isArray(inventory.repositories), 'Role-surface inventory repositories must be an array')
  for (const repository of inventory.repositories) {
    invariant(MANAGED_REPOSITORY_ROLES.includes(repository?.role), `Unknown managed repository role:${String(repository?.role)}`)
    const expected = policy.roles[repository.role].requiredSurfaces
    const actual = repository.providerSurfacesRequired
    invariant(Array.isArray(actual), `Repository ${repository.id ?? '<unknown>'} providerSurfacesRequired must be an array`)
    invariant(
      JSON.stringify(actual) === JSON.stringify(expected),
      `Repository ${repository.id ?? '<unknown>'}/${repository.role} provider surfaces differ from the canonical role-surface policy`,
    )
  }
  return true
}

export function validateReleaseRingRoleSurfaces(inventory, rings, policy, registry = {}) {
  validateRoleSurfacePolicy(policy, registry)
  invariant(inventory && Array.isArray(inventory.repositories), 'Role-surface inventory repositories must be an array')
  invariant(rings && Array.isArray(rings.rings), 'Role-surface release rings must be an array')
  for (const repository of inventory.repositories) {
    const matches = rings.rings.filter(ring => ring?.id === repository.releaseRing)
    invariant(matches.length === 1, `Repository ${repository.id ?? '<unknown>'} role-surface release ring must resolve exactly once`)
    const predicates = matches[0].promotionPredicates?.filter(predicate => predicate?.type === 'provider-surfaces-certified') ?? []
    invariant(predicates.length === 1, `Release ring ${matches[0].id} must declare exactly one provider-surfaces-certified predicate`)
    invariant(
      JSON.stringify(predicates[0].surfaces) === JSON.stringify(policy.roles[repository.role].requiredSurfaces),
      `Release ring ${matches[0].id}/${repository.role} provider surfaces differ from the canonical role-surface policy`,
    )
  }
  return true
}
