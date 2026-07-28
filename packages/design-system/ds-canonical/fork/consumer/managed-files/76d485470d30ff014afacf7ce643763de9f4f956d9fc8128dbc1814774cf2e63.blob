import { createHash } from 'node:crypto'

const SHA256 = /^[a-f0-9]{64}$/
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const DISCOVERY_KEYS = Object.freeze([
  'providerRootNames', 'instructionNames', 'instructionOverrideNames', 'configPaths', 'pluginRootNames',
])
const DISCOVERY_PATTERNS = Object.freeze({
  providerRootNames: /^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
  instructionNames: /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/,
  instructionOverrideNames: /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/,
  configPaths: /^\.(?:[A-Za-z0-9][A-Za-z0-9_.@-]*|[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.@/-]+)$/,
  pluginRootNames: /^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
})
const PROTECTED_PRODUCT_INSTRUCTIONS = new Set([
  'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'LICENSE.md', 'README.md', 'SECURITY.md',
].map((path) => path.toLowerCase()))
const IMMUTABLE_HEAD_KEYS = Object.freeze([
  'providerInventorySha256', 'releaseVersion', 'snapshotSha256',
])
const AUTHENTICATED_LIFECYCLE_V3_KEYS = Object.freeze([
  'currentProviderInventorySha256', 'currentSnapshotSha256', 'immutableHead', 'ledgerSha256',
  'previousSnapshotSha256', 'releaseVersion', 'retiredProviders', 'schemaVersion',
])
const AUTHENTICATED_LIFECYCLE_V4_KEYS = Object.freeze([
  ...AUTHENTICATED_LIFECYCLE_V3_KEYS,
  'currentSnapshot', 'immutableHeadSnapshot',
])

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const jsonSha256 = (value) => sha256(JSON.stringify(value))
// Canonical provider artifacts are hashed and copied across hosts. Default-locale collation is
// therefore not an admissible ordering primitive: compare the exact UTF-8 bytes that are shipped.
export const compareUtf8Bytes = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} must have the closed canonical shape`)
  }
  return value
}
const sortedUniqueStrings = (values, label) => {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error(`${label} must be a string array`)
  if (JSON.stringify(values) !== JSON.stringify([...new Set(values)].sort())) throw new Error(`${label} must be sorted and unique`)
  return values
}
// Governance ownership must be portable across case-sensitive Linux and the default
// case-insensitive, Unicode-normalizing macOS filesystems. Treat canonically equivalent path
// segments as one authority without changing the exact spelling used for materialization.
export const portableRepositoryPathKey = (value) => String(value).split('/')
  .map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US').normalize('NFC'))
  .join('/')
export const repositoryPathsOverlap = (left, right) => {
  const leftKey = portableRepositoryPathKey(left)
  const rightKey = portableRepositoryPathKey(right)
  return leftKey === rightKey || leftKey.startsWith(`${rightKey}/`) || rightKey.startsWith(`${leftKey}/`)
}

function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? null }
}

function compareVersion(leftValue, rightValue) {
  const left = parseVersion(leftValue)
  const right = parseVersion(rightValue)
  if (!left || !right) throw new Error(`provider lifecycle releases must be exact semver:${leftValue}:${rightValue}`)
  for (let index = 0; index < 3; index += 1) if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    if (left.pre[index] === undefined || right.pre[index] === undefined) return left.pre[index] === undefined ? -1 : 1
    if (left.pre[index] === right.pre[index]) continue
    const leftNumeric = /^\d+$/.test(left.pre[index])
    const rightNumeric = /^\d+$/.test(right.pre[index])
    if (leftNumeric && rightNumeric) return Number(left.pre[index]) - Number(right.pre[index])
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return compareUtf8Bytes(left.pre[index], right.pre[index])
  }
  return 0
}

function validateDiscovery(discovery, label) {
  exactKeys(discovery, DISCOVERY_KEYS, label)
  for (const key of DISCOVERY_KEYS) {
    const values = sortedUniqueStrings(discovery[key], `${label}.${key}`)
    const portable = new Set()
    for (const value of values) {
      if (
        !DISCOVERY_PATTERNS[key].test(value)
        || value.includes('/./')
        || value.includes('/../')
        || value.endsWith('/.')
        || value.endsWith('/..')
      ) throw new Error(`${label}.${key} contains an invalid discovery path:${value}`)
      const alias = portableRepositoryPathKey(value)
      if (portable.has(alias)) throw new Error(`${label}.${key} contains a portable alias:${value}`)
      portable.add(alias)
    }
  }
  return discovery
}

function discoveryReservesPath(discovery, path) {
  const pathKey = portableRepositoryPathKey(path)
  const treeRoots = [...discovery.providerRootNames, ...discovery.pluginRootNames]
    .map(portableRepositoryPathKey)
  if (treeRoots.some((root) => pathKey === root || pathKey.startsWith(`${root}/`))) return true
  return [
    ...discovery.instructionNames,
    ...discovery.instructionOverrideNames,
    ...discovery.configPaths,
  ].some((candidate) => portableRepositoryPathKey(candidate) === pathKey)
}

function validateSurface(surface, label) {
  exactKeys(surface, ['kind', 'path'], label)
  if (!['file', 'tree'].includes(surface.kind)) throw new Error(`${label}.kind is invalid`)
  if (typeof surface.path !== 'string' || !surface.path || surface.path.includes('\\') || surface.path.includes('\0')) {
    throw new Error(`${label}.path must be repository-relative POSIX`)
  }
  const segments = surface.path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') || ['.git', '.github'].includes(portableRepositoryPathKey(segments[0]))) {
    throw new Error(`${label}.path is outside provider mutation authority:${surface.path}`)
  }
  return surface
}

function validateRetiredSurface(surface, label) {
  exactKeys(surface, ['kind', 'path', 'sha256'], label)
  if (!SHA256.test(surface.sha256 || '')) throw new Error(`${label}.sha256 is invalid`)
  validateSurface({ path: surface.path, kind: surface.kind }, label)
  return surface
}

const retirementTransfers = (retirement) => retirement.transfers || []

function retirementPriorSurfaces(retirement) {
  return [
    ...retirement.surfaces.map(({ path, kind }) => ({ path, kind })),
    ...retirementTransfers(retirement).map(({ path, kind }) => ({ path, kind })),
  ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

function validateRetirement(retirement, label) {
  exactKeys(retirement, [
    'discovery', 'id', 'reasonCode', 'replacementProviderId', 'retiredInVersion', 'surfaces',
    ...(Object.hasOwn(retirement || {}, 'transfers') ? ['transfers'] : []),
  ], label)
  if (!/^[a-z][a-z0-9-]*$/.test(retirement.id || '')) throw new Error(`${label}.id is invalid`)
  if (retirement.replacementProviderId !== null && !/^[a-z][a-z0-9-]*$/.test(retirement.replacementProviderId || '')) {
    throw new Error(`${label}.replacementProviderId is invalid`)
  }
  if (retirement.replacementProviderId === retirement.id) {
    throw new Error(`${label}.replacementProviderId must name a distinct active current provider`)
  }
  if (!EXACT_SEMVER.test(retirement.retiredInVersion || '')) throw new Error(`${label}.retiredInVersion must be exact semver`)
  if (!/^[A-Z][A-Z0-9_]*$/.test(retirement.reasonCode || '')) throw new Error(`${label}.reasonCode is invalid`)
  validateDiscovery(retirement.discovery, `${label}.discovery`)
  if (!Array.isArray(retirement.surfaces)) throw new Error(`${label}.surfaces must be an array`)
  retirement.surfaces.forEach((surface, index) => validateRetiredSurface(surface, `${label}.surfaces[${index}]`))
  if (JSON.stringify(retirement.surfaces) !== JSON.stringify([...retirement.surfaces].sort((a, b) => compareUtf8Bytes(a.path, b.path)))) {
    throw new Error(`${label}.surfaces must be sorted by path`)
  }
  const transfers = retirementTransfers(retirement)
  if (Object.hasOwn(retirement, 'transfers') && (!Array.isArray(transfers) || !transfers.length)) {
    throw new Error(`${label}.transfers must be a non-empty array when present`)
  }
  transfers.forEach((surface, index) => validateSurface(surface, `${label}.transfers[${index}]`))
  if (JSON.stringify(transfers) !== JSON.stringify([...transfers].sort((a, b) => compareUtf8Bytes(a.path, b.path)))) {
    throw new Error(`${label}.transfers must be sorted by path`)
  }
  if (!retirement.surfaces.length && !transfers.length) throw new Error(`${label} must delete or transfer at least one surface`)
  if (retirement.replacementProviderId === null && transfers.length) {
    throw new Error(`${label} cannot transfer surfaces without a replacementProviderId`)
  }
  const partitionPaths = [...retirement.surfaces, ...transfers].map((surface) => surface.path)
  if (partitionPaths.length !== new Set(partitionPaths.map(portableRepositoryPathKey)).size) {
    throw new Error(`${label} deletion/transfer partition contains a duplicate surface path`)
  }
  return retirement
}

function canonicalSurfaces(provider, scope, registry) {
  const surfaces = new Map()
  const add = (path, kind, label) => {
    if (typeof path !== 'string' || !path) return
    validateSurface({ path, kind }, `${provider.id}:${label}`)
    if (kind === 'file' && PROTECTED_PRODUCT_INSTRUCTIONS.has(portableRepositoryPathKey(path))) {
      throw new Error(`${provider.id}:${label} may not claim protected product document ${path}`)
    }
    const prior = surfaces.get(path)
    if (prior) throw new Error(`${provider.id}:${path} has multiple managed surface owners (${prior}/${kind})`)
    surfaces.set(path, kind)
  }
  const instructionMaterializer = registry.canonical.materializers.instructionViews[provider.adapter.instructionView.materializerId]
  if (!instructionMaterializer) throw new Error(`${provider.id}:instruction materializer is unregistered`)
  if (instructionMaterializer.engine !== 'shared-instruction-v1') add(provider.instructionEntry, 'file', 'instructionEntry')
  if (provider.hookConfig) add(provider.hookConfig, 'file', 'hookConfig')
  if (provider.adapter.skillView) add(provider.skillDirectory, 'tree', 'skillDirectory')
  const field = scope === 'repository' ? 'repositoryManagedTrees' : 'productManagedTrees'
  for (const value of Object.values(provider.adapter[field] || {})) {
    add(scope === 'repository' ? value : value.destination, 'tree', field)
  }
  const compatibility = registry.canonical.compatibilityProjections?.legacyClaudeInstruction
  if (scope === 'product' && compatibility?.providerId === provider.id) {
    for (const category of compatibility.discoveryCategories || []) {
      for (const entry of category.entries || []) add(`${category.destinationRoot}/${entry}`, 'file', 'compatibility discovery category')
    }
  }
  const values = [...surfaces].map(([path, kind]) => ({ path, kind })).sort((a, b) => compareUtf8Bytes(a.path, b.path))
  for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) {
    if (repositoryPathsOverlap(values[left].path, values[right].path)) {
      throw new Error(`${provider.id}:managed surfaces overlap:${values[left].path} <> ${values[right].path}`)
    }
  }
  return values
}

function deriveProviderInventory(registry, scope) {
  const providers = registry.providers
    .filter((provider) => provider.adapter.generate)
    .map((provider) => ({
      id: provider.id,
      discovery: structuredClone(provider.adapter.discovery),
      surfaces: canonicalSurfaces(provider, scope, registry),
    }))
    .sort((left, right) => compareUtf8Bytes(left.id, right.id))
  assertGlobalProviderSurfaceOwnership(providers, `${scope} provider inventory`)
  return providers
}

export function deriveProviderRepositoryManagedInventory(registry) {
  return deriveProviderInventory(registry, 'repository')
}

export function deriveProviderProductManagedInventory(registry) {
  return deriveProviderInventory(registry, 'product')
}

// Backward-compatible API name with one unambiguous meaning: consumer/product lifecycle only.
// Registry v6 rejects the legacy `managedTrees` field, so future providers cannot silently choose
// a scope through this alias.
export const deriveProviderManagedInventory = deriveProviderProductManagedInventory

function assertGlobalProviderSurfaceOwnership(providers, label) {
  const claims = providers.flatMap((provider) => provider.surfaces.map((surface) => ({
    ...surface,
    providerId: provider.id,
  }))).sort((left, right) => (
    compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.providerId, right.providerId)
  ))
  for (let left = 0; left < claims.length; left += 1) for (let right = left + 1; right < claims.length; right += 1) {
    if (claims[left].providerId !== claims[right].providerId && repositoryPathsOverlap(claims[left].path, claims[right].path)) {
      throw new Error(
        `${label} has cross-provider managed surface overlap:`
        + `${claims[left].providerId}:${claims[left].path} <> ${claims[right].providerId}:${claims[right].path}`,
      )
    }
  }
}

function validateProviderInventory(providers, label) {
  if (!Array.isArray(providers)) throw new Error(`${label} must be an array`)
  const ids = []
  for (const [index, provider] of providers.entries()) {
    exactKeys(provider, ['discovery', 'id', 'surfaces'], `${label}[${index}]`)
    if (!/^[a-z][a-z0-9-]*$/.test(provider.id || '')) throw new Error(`${label}[${index}].id is invalid`)
    validateDiscovery(provider.discovery, `${label}[${index}].discovery`)
    if (!Array.isArray(provider.surfaces) || !provider.surfaces.length) throw new Error(`${label}[${index}].surfaces must not be empty`)
    provider.surfaces.forEach((surface, surfaceIndex) => validateSurface(surface, `${label}[${index}].surfaces[${surfaceIndex}]`))
    if (JSON.stringify(provider.surfaces) !== JSON.stringify([...provider.surfaces].sort((a, b) => compareUtf8Bytes(a.path, b.path)))) {
      throw new Error(`${label}[${index}].surfaces must be sorted by path`)
    }
    for (let left = 0; left < provider.surfaces.length; left += 1) for (let right = left + 1; right < provider.surfaces.length; right += 1) {
      if (repositoryPathsOverlap(provider.surfaces[left].path, provider.surfaces[right].path)) {
        throw new Error(`${label}[${index}] has overlapping portable managed surfaces:${provider.surfaces[left].path} <> ${provider.surfaces[right].path}`)
      }
    }
    ids.push(provider.id)
  }
  if (JSON.stringify(ids) !== JSON.stringify([...new Set(ids)].sort())) throw new Error(`${label} provider ids must be sorted and unique`)
  assertGlobalProviderSurfaceOwnership(providers, label)
  return providers
}

function snapshotDigest(snapshot) {
  return jsonSha256(snapshot)
}

function validateSnapshot(snapshot, indexOrLabel) {
  const label = typeof indexOrLabel === 'string'
    ? indexOrLabel
    : `provider lifecycle snapshots[${indexOrLabel}]`
  exactKeys(snapshot, ['previousSnapshotSha256', 'providers', 'releaseVersion', 'retiredProviders'], label)
  if (!EXACT_SEMVER.test(snapshot.releaseVersion || '')) throw new Error(`${label}.releaseVersion must be exact semver`)
  if (snapshot.previousSnapshotSha256 !== null && !SHA256.test(snapshot.previousSnapshotSha256 || '')) {
    throw new Error(`${label}.previousSnapshotSha256 is invalid`)
  }
  validateProviderInventory(snapshot.providers, `${label}.providers`)
  if (!Array.isArray(snapshot.retiredProviders)) throw new Error(`${label}.retiredProviders must be an array`)
  snapshot.retiredProviders.forEach((record, recordIndex) => validateRetirement(record, `${label}.retiredProviders[${recordIndex}]`))
  const retiredIds = snapshot.retiredProviders.map((record) => record.id)
  if (JSON.stringify(retiredIds) !== JSON.stringify([...new Set(retiredIds)].sort())) {
    throw new Error(`${label}.retiredProviders must be sorted and unique by id`)
  }
  if (snapshot.providers.some((provider) => retiredIds.includes(provider.id))) throw new Error(`${label} reactivates a retired provider`)
  return snapshot
}

function validateImmutableHead(immutableHead, label) {
  exactKeys(immutableHead, IMMUTABLE_HEAD_KEYS, label)
  if (
    !EXACT_SEMVER.test(immutableHead.releaseVersion || '')
    || !SHA256.test(immutableHead.snapshotSha256 || '')
    || !SHA256.test(immutableHead.providerInventorySha256 || '')
  ) throw new Error(`${label} is invalid`)
  return immutableHead
}

function authenticatedRetirementProjection(retirement, label) {
  exactKeys(retirement, [
    'discovery', 'id', 'priorProviderSha256', 'priorReleaseVersion', 'priorSnapshotSha256',
    'reasonCode', 'replacementProviderId', 'retiredInVersion', 'surfaces',
    ...(Object.hasOwn(retirement || {}, 'transfers') ? ['transfers'] : []),
  ], label)
  if (!EXACT_SEMVER.test(retirement.priorReleaseVersion || '')) {
    throw new Error(`${label}.priorReleaseVersion must be exact semver`)
  }
  if (!SHA256.test(retirement.priorSnapshotSha256 || '')) throw new Error(`${label}.priorSnapshotSha256 is invalid`)
  if (!SHA256.test(retirement.priorProviderSha256 || '')) throw new Error(`${label}.priorProviderSha256 is invalid`)
  if (compareVersion(retirement.retiredInVersion, retirement.priorReleaseVersion) <= 0) {
    throw new Error(`${label}.priorReleaseVersion must precede retiredInVersion`)
  }
  const projection = structuredClone(retirement)
  delete projection.priorReleaseVersion
  delete projection.priorSnapshotSha256
  delete projection.priorProviderSha256
  validateRetirement(projection, `${label} projection`)
  return projection
}

function validateAuthenticatedIdentity(lifecycle, keys, schemaVersion) {
  const label = 'authenticated provider lifecycle'
  exactKeys(lifecycle, keys, label)
  if (lifecycle.schemaVersion !== schemaVersion) throw new Error(`${label} schemaVersion must be ${schemaVersion}`)
  if (!EXACT_SEMVER.test(lifecycle.releaseVersion || '')) throw new Error(`${label}.releaseVersion must be exact semver`)
  validateImmutableHead(lifecycle.immutableHead, `${label}.immutableHead`)
  for (const [field, value] of [
    ['ledgerSha256', lifecycle.ledgerSha256],
    ['currentSnapshotSha256', lifecycle.currentSnapshotSha256],
    ['currentProviderInventorySha256', lifecycle.currentProviderInventorySha256],
  ]) if (!SHA256.test(value || '')) throw new Error(`${label}.${field} is invalid`)
  if (lifecycle.previousSnapshotSha256 !== null && !SHA256.test(lifecycle.previousSnapshotSha256 || '')) {
    throw new Error(`${label}.previousSnapshotSha256 is invalid`)
  }
  if (!Array.isArray(lifecycle.retiredProviders)) throw new Error(`${label}.retiredProviders must be an array`)
  const projections = lifecycle.retiredProviders.map((retirement, index) => (
    authenticatedRetirementProjection(retirement, `${label}.retiredProviders[${index}]`)
  ))
  const retiredIds = projections.map((retirement) => retirement.id)
  if (JSON.stringify(retiredIds) !== JSON.stringify([...new Set(retiredIds)].sort())) {
    throw new Error(`${label}.retiredProviders must be sorted and unique by id`)
  }
  for (const [index, retirement] of lifecycle.retiredProviders.entries()) {
    if (compareVersion(retirement.retiredInVersion, lifecycle.releaseVersion) > 0) {
      throw new Error(`${label}.retiredProviders[${index}].retiredInVersion exceeds the authenticated release`)
    }
  }
  return projections
}

function validateLegacyAuthenticatedProviderLifecycle(lifecycle) {
  validateAuthenticatedIdentity(lifecycle, AUTHENTICATED_LIFECYCLE_V3_KEYS, 3)
  if (lifecycle.previousSnapshotSha256 === null) {
    if (
      lifecycle.immutableHead.releaseVersion !== lifecycle.releaseVersion
      || lifecycle.immutableHead.snapshotSha256 !== lifecycle.currentSnapshotSha256
      || lifecycle.immutableHead.providerInventorySha256 !== lifecycle.currentProviderInventorySha256
      || lifecycle.retiredProviders.length
    ) throw new Error('legacy authenticated provider lifecycle genesis does not bind its immutable head')
  } else {
    if (
      lifecycle.previousSnapshotSha256 !== lifecycle.immutableHead.snapshotSha256
      || compareVersion(lifecycle.releaseVersion, lifecycle.immutableHead.releaseVersion) <= 0
    ) throw new Error('legacy authenticated provider lifecycle immutable head does not bind the previous release')
    for (const retirement of lifecycle.retiredProviders) {
      if (
        retirement.retiredInVersion === lifecycle.releaseVersion
        && (
          retirement.priorReleaseVersion !== lifecycle.immutableHead.releaseVersion
          || retirement.priorSnapshotSha256 !== lifecycle.immutableHead.snapshotSha256
        )
      ) throw new Error(`${retirement.id}:legacy retirement origin does not bind the immutable head`)
    }
  }
  return lifecycle
}

/**
 * Validates the portable authenticated lifecycle view shipped to consumers.
 *
 * Version 4 is self-authenticating with respect to the current and immediately previous
 * lifecycle snapshots: their closed bodies are present, every advertised digest is recomputed,
 * and the same transition invariants as the canonical v1 ledger are enforced. Version 3 lacks
 * those bodies and is therefore accepted only through the explicit compatibility option.
 */
export function validateAuthenticatedProviderLifecycle(lifecycle, { allowLegacyV3 = false } = {}) {
  if (lifecycle?.schemaVersion === 3) {
    if (!allowLegacyV3) throw new Error('authenticated provider lifecycle v3 requires explicit allowLegacyV3 compatibility')
    return validateLegacyAuthenticatedProviderLifecycle(lifecycle)
  }
  if (lifecycle?.schemaVersion !== 4) throw new Error('authenticated provider lifecycle schemaVersion must be 4')
  const projections = validateAuthenticatedIdentity(lifecycle, AUTHENTICATED_LIFECYCLE_V4_KEYS, 4)
  const current = validateSnapshot(lifecycle.currentSnapshot, 'authenticated provider lifecycle.currentSnapshot')
  const immutable = validateSnapshot(lifecycle.immutableHeadSnapshot, 'authenticated provider lifecycle.immutableHeadSnapshot')
  const currentSnapshotSha256 = snapshotDigest(current)
  const immutableSnapshotSha256 = snapshotDigest(immutable)
  if (currentSnapshotSha256 !== lifecycle.currentSnapshotSha256) {
    throw new Error('authenticated provider lifecycle currentSnapshotSha256 does not bind currentSnapshot')
  }
  if (jsonSha256(current.providers) !== lifecycle.currentProviderInventorySha256) {
    throw new Error('authenticated provider lifecycle currentProviderInventorySha256 does not bind currentSnapshot.providers')
  }
  if (immutableSnapshotSha256 !== lifecycle.immutableHead.snapshotSha256) {
    throw new Error('authenticated provider lifecycle immutableHead.snapshotSha256 does not bind immutableHeadSnapshot')
  }
  if (jsonSha256(immutable.providers) !== lifecycle.immutableHead.providerInventorySha256) {
    throw new Error('authenticated provider lifecycle immutableHead.providerInventorySha256 does not bind immutableHeadSnapshot.providers')
  }
  if (
    current.releaseVersion !== lifecycle.releaseVersion
    || current.previousSnapshotSha256 !== lifecycle.previousSnapshotSha256
  ) throw new Error('authenticated provider lifecycle currentSnapshot release/previous pointers do not match the authenticated view')
  if (immutable.releaseVersion !== lifecycle.immutableHead.releaseVersion) {
    throw new Error('authenticated provider lifecycle immutableHead release does not bind immutableHeadSnapshot')
  }
  if (JSON.stringify(projections) !== JSON.stringify(current.retiredProviders)) {
    throw new Error('authenticated provider lifecycle retiredProviders is not an exact currentSnapshot projection')
  }

  const retirementOrigins = new Map()
  if (current.previousSnapshotSha256 === null) {
    if (
      currentSnapshotSha256 !== immutableSnapshotSha256
      || JSON.stringify(current) !== JSON.stringify(immutable)
      || current.retiredProviders.length
    ) throw new Error('authenticated provider lifecycle genesis must equal its immutable head snapshot')
  } else {
    validateTransition(immutable, current, retirementOrigins)
  }
  for (const [index, retirement] of lifecycle.retiredProviders.entries()) {
    const origin = retirementOrigins.get(retirement.id)
    if (!origin) continue
    if (
      retirement.priorReleaseVersion !== origin.priorReleaseVersion
      || retirement.priorSnapshotSha256 !== origin.priorSnapshotSha256
      || retirement.priorProviderSha256 !== jsonSha256(origin.priorProvider)
    ) throw new Error(`authenticated provider lifecycle.retiredProviders[${index}] origin hashes do not bind immutableHeadSnapshot`)
  }
  return lifecycle
}

function assertRetainedProviderIsMonotonic(previous, current, releaseVersion) {
  const currentSurfaces = new Map(current.surfaces.map((surface) => [surface.path, surface.kind]))
  for (const surface of previous.surfaces) {
    if (currentSurfaces.get(surface.path) !== surface.kind) {
      throw new Error(`${releaseVersion}:${previous.id} removed or changed managed surface ${surface.path} without retiring the provider`)
    }
  }
  const previousSurfacePaths = new Set(previous.surfaces.map((surface) => portableRepositoryPathKey(surface.path)))
  for (const surface of current.surfaces) {
    if (
      !previousSurfacePaths.has(portableRepositoryPathKey(surface.path))
      && !discoveryReservesPath(previous.discovery, surface.path)
    ) {
      throw new Error(
        `${releaseVersion}:${previous.id} added managed surface outside its previously reviewed discovery namespace:`
        + `${surface.path}; establish new namespaces through reviewed bootstrap`,
      )
    }
  }
  for (const key of DISCOVERY_KEYS) {
    const currentValues = new Set(current.discovery[key].map(portableRepositoryPathKey))
    for (const value of previous.discovery[key]) {
      if (!currentValues.has(portableRepositoryPathKey(value))) {
        throw new Error(`${releaseVersion}:${previous.id} removed discovery inventory ${key}:${value} without retiring the provider`)
      }
    }
    const previousValues = new Set(previous.discovery[key].map(portableRepositoryPathKey))
    for (const value of current.discovery[key]) {
      if (!previousValues.has(portableRepositoryPathKey(value)) && !discoveryReservesPath(previous.discovery, value)) {
        throw new Error(
          `${releaseVersion}:${previous.id} added discovery namespace outside its previously reviewed authority:`
          + `${key}:${value}; establish new namespaces through reviewed bootstrap`,
        )
      }
    }
  }
}

function assertRetirementPartitionOwnership(retirement, currentProviders) {
  const currentById = new Map(currentProviders.map((provider) => [provider.id, provider]))
  const replacement = retirement.replacementProviderId === null
    ? null
    : currentById.get(retirement.replacementProviderId)
  if (retirement.replacementProviderId !== null && (!replacement || retirement.replacementProviderId === retirement.id)) {
    throw new Error(`${retirement.id}:replacementProviderId must name a distinct active current provider`)
  }
  const transfers = retirementTransfers(retirement)
  if (!replacement && transfers.length) throw new Error(`${retirement.id}:null replacementProviderId cannot transfer surfaces`)
  const activeSurfaces = currentProviders.flatMap((provider) => provider.surfaces.map((surface) => ({ ...surface, providerId: provider.id })))
  for (const surface of retirement.surfaces) {
    if (activeSurfaces.some((candidate) => repositoryPathsOverlap(candidate.path, surface.path))) {
      throw new Error(`${retirement.id}:deletion tombstone remains owned by an active provider:${surface.path}`)
    }
  }
  for (const surface of transfers) {
    if (!replacement.surfaces.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
      throw new Error(`${retirement.id}:transfer is not exactly owned by replacement ${retirement.replacementProviderId}:${surface.path}`)
    }
    if (activeSurfaces.some((candidate) => candidate.providerId !== replacement.id && repositoryPathsOverlap(candidate.path, surface.path))) {
      throw new Error(`${retirement.id}:transfer is also owned by a non-replacement provider:${surface.path}`)
    }
  }
}

function validateTransition(previous, current, retirementOrigins) {
  const priorDigest = snapshotDigest(previous)
  if (current.previousSnapshotSha256 !== priorDigest) {
    throw new Error(`${current.releaseVersion}:previousSnapshotSha256 does not bind ${previous.releaseVersion}`)
  }
  if (compareVersion(current.releaseVersion, previous.releaseVersion) <= 0) {
    throw new Error(`${current.releaseVersion}:provider lifecycle releases must increase monotonically after ${previous.releaseVersion}`)
  }
  if (current.retiredProviders.length < previous.retiredProviders.length) throw new Error(`${current.releaseVersion}:retired provider ledger is append-only`)
  const retainedPrefix = current.retiredProviders.slice(0, previous.retiredProviders.length)
  if (JSON.stringify(retainedPrefix) !== JSON.stringify(previous.retiredProviders)) {
    throw new Error(`${current.releaseVersion}:prior retired provider records may not be removed or rewritten`)
  }
  const previousById = new Map(previous.providers.map((provider) => [provider.id, provider]))
  const currentById = new Map(current.providers.map((provider) => [provider.id, provider]))
  const removed = [...previousById.keys()].filter((id) => !currentById.has(id)).sort()
  for (const [id, prior] of previousById) {
    const next = currentById.get(id)
    if (next) assertRetainedProviderIsMonotonic(prior, next, current.releaseVersion)
  }
  const appended = current.retiredProviders.slice(previous.retiredProviders.length)
  const appendedIds = appended.map((record) => record.id).sort()
  if (JSON.stringify(appendedIds) !== JSON.stringify(removed)) {
    throw new Error(`${current.releaseVersion}:provider removals require exactly one new tombstone; removed=${removed.join(',') || '<none>'}; appended=${appendedIds.join(',') || '<none>'}`)
  }
  for (const retirement of appended) {
    const prior = previousById.get(retirement.id)
    if (JSON.stringify(retirement.discovery) !== JSON.stringify(prior.discovery)) {
      throw new Error(`${retirement.id}:retired discovery must equal the previous immutable provider inventory`)
    }
    const partition = retirementPriorSurfaces(retirement)
    if (JSON.stringify(partition) !== JSON.stringify(prior.surfaces)) {
      throw new Error(`${retirement.id}:deletion and transfer records must exactly partition the previous immutable managed surfaces`)
    }
    assertRetirementPartitionOwnership(retirement, current.providers)
    if (retirement.retiredInVersion !== current.releaseVersion) {
      throw new Error(`${retirement.id}:retiredInVersion must equal current release ${current.releaseVersion}`)
    }
    retirementOrigins.set(retirement.id, {
      priorProvider: prior,
      priorReleaseVersion: previous.releaseVersion,
      priorSnapshotSha256: priorDigest,
    })
  }
}

export function validateProviderLifecycleLedger({ ledger, registry, releaseVersion }) {
  exactKeys(ledger, ['$schema', 'immutableHead', 'kind', 'schemaVersion', 'snapshots'], 'provider lifecycle ledger')
  if (ledger.$schema !== './schemas/provider-lifecycle.schema.json' || ledger.schemaVersion !== 1 || ledger.kind !== 'provider-lifecycle-ledger') {
    throw new Error('provider lifecycle ledger identity/schema is invalid')
  }
  if (!EXACT_SEMVER.test(releaseVersion || '')) throw new Error(`provider lifecycle current release must be exact semver:${releaseVersion}`)
  validateImmutableHead(ledger.immutableHead, 'provider lifecycle immutableHead')
  if (!Array.isArray(ledger.snapshots) || !ledger.snapshots.length) throw new Error('provider lifecycle ledger needs a genesis snapshot')
  ledger.snapshots.forEach(validateSnapshot)
  const digests = ledger.snapshots.map(snapshotDigest)
  const headIndex = digests.indexOf(ledger.immutableHead.snapshotSha256)
  if (headIndex < 0 || ledger.snapshots[headIndex].releaseVersion !== ledger.immutableHead.releaseVersion) {
    throw new Error('provider lifecycle immutableHead does not bind a retained snapshot')
  }
  if (jsonSha256(ledger.snapshots[headIndex].providers) !== ledger.immutableHead.providerInventorySha256) {
    throw new Error('provider lifecycle immutableHead provider inventory digest is invalid')
  }
  const expectedHeadIndex = ledger.snapshots.length === 1 ? 0 : ledger.snapshots.length - 2
  if (headIndex !== expectedHeadIndex) {
    throw new Error('provider lifecycle immutableHead must be the immediately previous retained release')
  }
  const genesis = ledger.snapshots[0]
  if (genesis.previousSnapshotSha256 !== null || genesis.retiredProviders.length) {
    throw new Error('provider lifecycle genesis may not invent previous releases or retired providers')
  }
  const retirementOrigins = new Map()
  for (let index = 1; index < ledger.snapshots.length; index += 1) {
    validateTransition(ledger.snapshots[index - 1], ledger.snapshots[index], retirementOrigins)
  }
  const current = ledger.snapshots.at(-1)
  if (current.releaseVersion !== releaseVersion) throw new Error(`provider lifecycle head ${current.releaseVersion} does not equal current release ${releaseVersion}`)
  if (headIndex === ledger.snapshots.length - 1 && ledger.immutableHead.releaseVersion !== releaseVersion) {
    throw new Error('provider lifecycle candidate is missing after the immutable head')
  }
  const expectedInventory = deriveProviderProductManagedInventory(registry)
  if (JSON.stringify(current.providers) !== JSON.stringify(expectedInventory)) {
    throw new Error(`${releaseVersion}:provider lifecycle inventory differs from the current registry managed surfaces`)
  }
  for (const retirement of current.retiredProviders) {
    assertRetirementPartitionOwnership(retirement, current.providers)
  }
  const registryRetirements = (registry.canonical.retiredProviders || []).map((retirement) => ({
    ...retirement,
    surfaces: retirement.surfaces.map(({ path, kind }) => ({ path, kind })),
  }))
  const lifecycleRetirements = current.retiredProviders.map((retirement) => ({
    ...retirement,
    surfaces: retirement.surfaces.map(({ path, kind }) => ({ path, kind })),
  }))
  if (JSON.stringify(lifecycleRetirements) !== JSON.stringify(registryRetirements)) {
    throw new Error(`${releaseVersion}:provider lifecycle retired records differ from the current registry`)
  }
  return { current, currentSnapshotSha256: snapshotDigest(current), retirementOrigins }
}

export function buildAuthenticatedProviderLifecycle({ ledger, registry, releaseVersion }) {
  const validated = validateProviderLifecycleLedger({ ledger, registry, releaseVersion })
  const retiredProviders = validated.current.retiredProviders.map((record) => {
    const origin = validated.retirementOrigins.get(record.id)
    if (!origin) throw new Error(`${record.id}:retired provider has no immutable transition origin`)
    return {
      ...structuredClone(record),
      priorReleaseVersion: origin.priorReleaseVersion,
      priorSnapshotSha256: origin.priorSnapshotSha256,
      priorProviderSha256: jsonSha256(origin.priorProvider),
    }
  })
  const immutableHeadSnapshot = ledger.snapshots.find((snapshot) => (
    snapshotDigest(snapshot) === ledger.immutableHead.snapshotSha256
  ))
  const authenticated = {
    schemaVersion: 4,
    releaseVersion,
    immutableHead: structuredClone(ledger.immutableHead),
    ledgerSha256: jsonSha256(ledger),
    previousSnapshotSha256: validated.current.previousSnapshotSha256,
    currentSnapshotSha256: validated.currentSnapshotSha256,
    currentProviderInventorySha256: jsonSha256(validated.current.providers),
    retiredProviders,
    currentSnapshot: structuredClone(validated.current),
    immutableHeadSnapshot: structuredClone(immutableHeadSnapshot),
  }
  validateAuthenticatedProviderLifecycle(authenticated)
  return authenticated
}

export function lifecycleSnapshotSha256(snapshot) {
  validateSnapshot(snapshot, 0)
  return snapshotDigest(snapshot)
}

export function providerInventorySha256(providers) {
  validateProviderInventory(providers, 'provider inventory')
  return jsonSha256(providers)
}
