import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertClosedGitLocalConfiguration,
  captureClosedGitHubToken,
  resolveClosedGitExecutable,
  runClosedGh,
  runClosedGit,
  validateClosedGitExecutable,
} from '../../../scripts/lib/closed-tool-execution.mjs'
import {
  globToRegExp,
  normalizeRepoPath,
  OWNERSHIP_MODES,
  REPOSITORY_ROLES,
  resolveInventoryOwnershipPolicy,
  resolveOwnership,
} from './managed-repository-ownership.mjs'
import { validateRepositoryPathTopology } from './repository-path-topology.mjs'
import {
  deriveConsumerUpgradeProfileFacts,
  loadConsumerUpgradeProtocol,
} from './consumer-upgrade-protocol.mjs'

export {
  assertClosedGitLocalConfiguration,
  captureClosedGitHubToken,
  globToRegExp,
  normalizeRepoPath,
  OWNERSHIP_MODES,
  REPOSITORY_ROLES,
  resolveClosedGitExecutable,
  resolveInventoryOwnershipPolicy,
  resolveOwnership,
  runClosedGh,
  runClosedGit,
  validateClosedGitExecutable,
  validateRepositoryPathTopology,
}

export const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Every content-addressed governance surface uses exact UTF-8 byte order. This preserves
// repository code points without host-locale collation or implicit Unicode normalization.
export function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

export const CANONICAL_PROVIDER_COMPATIBILITY_PATH = resolve(GOVERNANCE_ROOT, 'providers/compatibility-matrix.json')
export const CANONICAL_CONSUMER_LOCK_PATH = resolve(GOVERNANCE_ROOT, '../../template/ds-product-template/governance/lock.json')
export const CANONICAL_FORK_MANIFEST_PATH = resolve(GOVERNANCE_ROOT, '../../packages/design-system/ds-canonical/fork/manifest.json')
export const MANAGED_REPOSITORY_ROLE_POLICY = Object.freeze({
  authority: Object.freeze({
    defaultBranch: 'main',
    repositoryId: 'design-system',
    github: 'ajenchen/design-system',
    desiredProfile: 'design-system-authority',
    ownershipPolicy: 'authority-repository',
    pathProperty: 'localPathFromGovernanceRoot',
    requiredCapability: 'publishes',
    requiredCapabilityValues: Object.freeze([
      '@qijenchen/design-system',
      '@qijenchen/storybook-config',
      '@qijenchen/governance',
    ]),
    forbiddenCapability: 'consumes',
  }),
  'template-mirror': Object.freeze({
    defaultBranch: 'main',
    repositoryId: 'ds-product-template',
    github: 'ajenchen/ds-product-template',
    desiredProfile: 'published-template',
    ownershipPolicy: 'published-template-mirror',
    pathProperty: 'mirrorSourcePathFromGovernanceRoot',
    requiredCapability: 'consumes',
    requiredCapabilityValues: Object.freeze([
      '@qijenchen/design-system',
      '@qijenchen/storybook-config',
    ]),
    forbiddenCapability: 'publishes',
  }),
  'product-consumer': Object.freeze({
    defaultBranch: 'main',
    desiredProfile: 'product-consumer',
    ownershipPolicy: 'product-consumer',
    pathProperty: 'localPathFromGovernanceRoot',
    requiredCapability: 'consumes',
    requiredCapabilityValues: Object.freeze([
      '@qijenchen/design-system',
      '@qijenchen/storybook-config',
    ]),
    forbiddenCapability: 'publishes',
  }),
})
export const WORKFLOW_IDENTITY_SOURCE_POLICY = Object.freeze({
  'design-system-authority': Object.freeze({ repositoryId: 'design-system', repositoryRole: 'authority' }),
  'product-consumer': Object.freeze({ repositoryId: 'ds-product-template', repositoryRole: 'template-mirror' }),
  'published-template': Object.freeze({ repositoryId: 'ds-product-template', repositoryRole: 'template-mirror' }),
})
const LEGACY_PRODUCT_REPOSITORY_IDS = new Set(['work-management'])
let canonicalConsumerUpgradeFacts
let canonicalConsumerOwnershipFacts

function resolveConsumerUpgradeFacts(protocol, profileFacts) {
  const injectedFactCount = [protocol, profileFacts].filter(value => value !== undefined).length
  invariant(injectedFactCount === 0 || injectedFactCount === 2, 'Consumer upgrade protocol and profile facts must be injected as one complete closed set')
  if (injectedFactCount === 0) {
    if (!canonicalConsumerUpgradeFacts) {
      const loaded = loadConsumerUpgradeProtocol().protocol
      canonicalConsumerUpgradeFacts = Object.freeze({
        protocol: loaded,
        profileFacts: deriveConsumerUpgradeProfileFacts(loaded),
      })
    }
    return canonicalConsumerUpgradeFacts
  }
  const expected = deriveConsumerUpgradeProfileFacts(protocol)
  invariant(deepEqual(profileFacts, expected), 'Injected consumer upgrade profile facts differ from the canonical protocol')
  return { protocol, profileFacts }
}

export function deriveConsumerOwnershipFacts(consumerLock, forkManifest) {
  const managedFiles = Object.keys(consumerLock?.payload?.managedFiles ?? {}).sort(compareUtf8Bytes)
  const materialization = forkManifest?.consumer?.materialization
  invariant(managedFiles.length > 0, 'Canonical consumer lock must declare managedFiles')
  invariant(Array.isArray(materialization?.exactPaths) && Array.isArray(materialization?.pathPrefixes), 'Canonical fork manifest must declare consumer materialization paths')
  return Object.freeze({
    managedFiles: Object.freeze(managedFiles),
    exactPaths: Object.freeze([...materialization.exactPaths]),
    pathPrefixes: Object.freeze([...materialization.pathPrefixes]),
  })
}

function resolveConsumerOwnershipFacts(injected) {
  if (injected !== undefined) {
    invariant(
      injected
        && typeof injected === 'object'
        && !Array.isArray(injected)
        && deepEqual(Object.keys(injected).sort(compareUtf8Bytes), ['exactPaths', 'managedFiles', 'pathPrefixes'])
        && [injected.managedFiles, injected.exactPaths, injected.pathPrefixes].every(value => (
          Array.isArray(value) && value.every(path => typeof path === 'string' && path.length > 0)
        )),
      'Injected consumer ownership facts must have one complete closed shape',
    )
    return injected
  }
  canonicalConsumerOwnershipFacts ??= deriveConsumerOwnershipFacts(
    readJson(CANONICAL_CONSUMER_LOCK_PATH),
    readJson(CANONICAL_FORK_MANIFEST_PATH),
  )
  return canonicalConsumerOwnershipFacts
}

function assertOwnership(policy, path, expected, label, { exactPattern = path } = {}) {
  const ownership = resolveOwnership(policy, path)
  invariant(
    ownership.pattern === exactPattern
      && ownership.mode === expected.mode
      && ownership.owner === expected.owner,
    `${label} must bind ${path} to ${exactPattern}:${expected.mode}:${expected.owner}`,
  )
}

function validateCanonicalOwnershipPolicies(inventory, injectedOwnershipFacts, requireConsumerOwnershipClosure) {
  const policies = inventory.ownershipPolicies
  const authority = policies['authority-repository']
  if (authority !== undefined) {
    invariant(authority.defaultMode === 'authority', 'authority-repository ownership default must remain authority')
    assertOwnership(
      authority,
      'infra/governance/__ownership_probe__',
      { mode: 'authority', owner: 'governance-maintainers' },
      'authority-repository ownership policy',
      { exactPattern: 'infra/governance/**' },
    )
    assertOwnership(
      authority,
      '.github/CODEOWNERS',
      { mode: 'authority', owner: 'governance-maintainers' },
      'authority-repository ownership policy',
    )
  }

  const template = policies['published-template-mirror']
  if (template !== undefined) {
    invariant(template.defaultMode === 'generated', 'published-template-mirror ownership default must remain generated')
    assertOwnership(
      template,
      '.github/workflows/__ownership_probe__.yml',
      { mode: 'generated', owner: 'design-system-governance' },
      'published-template-mirror ownership policy',
      { exactPattern: '.github/workflows/**' },
    )
    assertOwnership(
      template,
      '.github/dependabot.yml',
      { mode: 'generated', owner: 'design-system-governance' },
      'published-template-mirror ownership policy',
    )
  }

  const product = policies['product-consumer']
  if (product === undefined) return
  invariant(product.defaultMode === 'consumer-owned', 'product-consumer ownership default must remain consumer-owned')
  for (const path of ['package.json', 'package-lock.json']) {
    assertOwnership(
      product,
      path,
      { mode: 'three-way', owner: 'shared-release-engineering' },
      'product-consumer ownership policy',
    )
  }
  assertOwnership(
    product,
    '.claude/settings.json',
    { mode: 'three-way', owner: 'shared-governance-and-product' },
    'product-consumer ownership policy',
  )
  assertOwnership(
    product,
    '.claude/skills/__ownership_probe__/SKILL.md',
    { mode: 'upstream-managed', owner: 'design-system-governance' },
    'product-consumer ownership policy',
    { exactPattern: '.claude/skills/**' },
  )

  if (!requireConsumerOwnershipClosure) return
  const ownershipFacts = resolveConsumerOwnershipFacts(injectedOwnershipFacts)
  for (const path of ownershipFacts.managedFiles) {
    assertOwnership(
      product,
      path,
      { mode: 'upstream-managed', owner: 'design-system-governance' },
      'product-consumer ownership policy',
    )
  }

  const threeWay = new Set(['.claude/settings.json', 'package.json', 'package-lock.json'])
  for (const path of ownershipFacts.exactPaths) {
    const expected = threeWay.has(path)
      ? {
          mode: 'three-way',
          owner: path === '.claude/settings.json' ? 'shared-governance-and-product' : 'shared-release-engineering',
        }
      : { mode: 'upstream-managed', owner: 'design-system-governance' }
    assertOwnership(product, path, expected, 'product-consumer ownership policy')
  }
  for (const prefix of ownershipFacts.pathPrefixes) {
    const probe = `${prefix}__ownership_probe__/SKILL.md`
    const ownership = resolveOwnership(product, probe)
    invariant(
      ownership.pattern !== '<default>'
        && ownership.mode === 'upstream-managed'
        && ownership.owner === 'design-system-governance',
      `product-consumer ownership policy must upstream-manage materialization prefix ${prefix}`,
    )
  }
}

export function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read valid JSON ${path}: ${error.message}`, { cause: error })
  }
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map(key => [key, stableValue(value[key])]))
  }
  return value
}

export function stableStringify(value, space = 2) {
  return JSON.stringify(stableValue(value), null, space)
}

export function deepEqual(left, right) {
  return stableStringify(left, 0) === stableStringify(right, 0)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256File(path) {
  return sha256(readFileSync(path))
}

export function listFiles(root) {
  if (!existsSync(root)) return []
  const output = []
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else output.push(normalizeRepoPath(relative(root, absolute)))
    }
  }
  visit(root)
  return output.sort(compareUtf8Bytes)
}

export function readPathState(root, repoPath) {
  const absolute = resolve(root, repoPath)
  if (!existsSync(absolute)) return { kind: 'absent', hash: null, content: null }
  const stat = lstatSync(absolute)
  if (!stat.isFile()) return { kind: stat.isSymbolicLink() ? 'symlink' : 'unsupported', hash: null, content: null }
  const content = readFileSync(absolute)
  return { kind: 'file', hash: sha256(content), content }
}

export function deriveInventoryProviderFacts(matrix) {
  invariant(matrix?.schemaVersion === 2, 'Compatibility matrix schemaVersion must be 2')
  invariant(matrix.providers && typeof matrix.providers === 'object' && !Array.isArray(matrix.providers), 'Compatibility matrix providers must be an object')
  invariant(matrix.surfaces && typeof matrix.surfaces === 'object' && !Array.isArray(matrix.surfaces), 'Compatibility matrix surfaces must be an object')
  const providerIds = new Set()
  const providerRuntimeKinds = new Map()
  for (const [provider, registration] of Object.entries(matrix.providers)) {
    invariant(/^[a-z][a-z0-9-]*$/.test(provider), `Compatibility matrix provider id is invalid:${provider}`)
    invariant(registration?.runtimeKinds && typeof registration.runtimeKinds === 'object' && !Array.isArray(registration.runtimeKinds), `Compatibility matrix provider ${provider} runtimeKinds must be an object`)
    const runtimeKinds = new Set(Object.keys(registration.runtimeKinds))
    invariant(runtimeKinds.size > 0, `Compatibility matrix provider ${provider} must declare runtimeKinds`)
    for (const runtimeKind of runtimeKinds) invariant(/^[a-z][a-z0-9-]*$/.test(runtimeKind), `Compatibility matrix provider ${provider} runtime kind is invalid:${runtimeKind}`)
    providerIds.add(provider)
    providerRuntimeKinds.set(provider, runtimeKinds)
  }
  const providerSurfaces = new Set(Object.keys(matrix.surfaces))
  invariant(providerSurfaces.size > 0, 'Compatibility matrix must declare surfaces')
  for (const surface of providerSurfaces) invariant(/^[a-z][a-z0-9-]*$/.test(surface), `Compatibility matrix surface id is invalid:${surface}`)
  return { providerIds, providerRuntimeKinds, providerSurfaces }
}

export function loadInventoryProviderFacts(path = CANONICAL_PROVIDER_COMPATIBILITY_PATH) {
  return deriveInventoryProviderFacts(readJson(path))
}

export function validateInventory(inventory, options = {}) {
  let {
    providerIds,
    providerRuntimeKinds,
    providerSurfaces,
    consumerUpgradeProtocol,
    consumerUpgradeProfileFacts,
    consumerOwnershipFacts,
    requireCertificationCanaries = false,
    requireWorkflowIdentitySourceRepositories = false,
  } = options
  const injectedFactCount = [providerIds, providerRuntimeKinds, providerSurfaces].filter(value => value !== undefined).length
  invariant(injectedFactCount === 0 || injectedFactCount === 3, 'Inventory provider facts must be injected as one complete closed set')
  if (injectedFactCount === 0) {
    ({ providerIds, providerRuntimeKinds, providerSurfaces } = loadInventoryProviderFacts())
  }
  invariant(providerIds instanceof Set, 'Inventory providerIds must be a Set')
  invariant(providerRuntimeKinds instanceof Map, 'Inventory providerRuntimeKinds must be a Map')
  invariant(providerSurfaces instanceof Set, 'Inventory providerSurfaces must be a Set')
  const injectedUpgradeFactCount = [consumerUpgradeProtocol, consumerUpgradeProfileFacts]
    .filter(value => value !== undefined).length
  invariant(injectedUpgradeFactCount === 0 || injectedUpgradeFactCount === 2, 'Consumer upgrade protocol and profile facts must be injected as one complete closed set')
  let upgradeFacts = injectedUpgradeFactCount === 2
    ? resolveConsumerUpgradeFacts(consumerUpgradeProtocol, consumerUpgradeProfileFacts)
    : undefined
  invariant(inventory?.schemaVersion === 1, 'Inventory schemaVersion must be 1')
  invariant(typeof inventory.authority === 'string' && inventory.authority.length > 0, 'Inventory authority must be a non-empty string')
  invariant(deepEqual(inventory.fleetScope, {
    coverage: 'registered-opt-in-inventory',
    enrollment: 'reviewed-registration-only',
    unregisteredDescendants: 'not-covered',
  }), 'Inventory fleet scope must be closed to reviewed, registered opt-in repositories and exclude unknown descendants')
  invariant(Array.isArray(inventory.repositories) && inventory.repositories.length > 0, 'Inventory must contain repositories')
  invariant(inventory.ownershipPolicies && typeof inventory.ownershipPolicies === 'object', 'Inventory must contain ownershipPolicies')
  validateRepositoryPathTopology(inventory)
  const ids = new Set()
  const slugs = new Set()
  const repositoriesById = new Map()
  const repositoriesByRole = new Map([...REPOSITORY_ROLES].map(role => [role, []]))
  for (const repo of inventory.repositories) {
    invariant(typeof repo.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(repo.id) && !ids.has(repo.id), `Duplicate or invalid repository id: ${repo.id ?? '<missing>'}`)
    invariant(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.github ?? ''), `Invalid GitHub slug for ${repo.id}`)
    invariant(!slugs.has(repo.github), `Duplicate GitHub repository: ${repo.github}`)
    invariant(REPOSITORY_ROLES.has(repo.role), `Unknown repository role ${repo.role ?? '<missing>'} for ${repo.id}`)
    const rolePolicy = MANAGED_REPOSITORY_ROLE_POLICY[repo.role]
    if (rolePolicy.repositoryId !== undefined) {
      invariant(repo.id === rolePolicy.repositoryId, `Repository role ${repo.role} must use registered id ${rolePolicy.repositoryId}`)
      invariant(repo.github === rolePolicy.github, `Repository role ${repo.role} must use registered GitHub repository ${rolePolicy.github}`)
    }
    const [githubOwner, githubName, ...githubRemainder] = repo.github.split('/')
    invariant(githubRemainder.length === 0 && githubName === repo.id, `Repository ${repo.id} GitHub repository name must equal its registered id`)
    invariant(repo.defaultBranch === rolePolicy.defaultBranch, `Repository ${repo.id} role ${repo.role} must use default branch ${rolePolicy.defaultBranch}`)
    invariant(repo.desiredProfile === rolePolicy.desiredProfile, `Repository ${repo.id} role ${repo.role} must use desired profile ${rolePolicy.desiredProfile}`)
    invariant(repo.ownershipPolicy === rolePolicy.ownershipPolicy, `Repository ${repo.id} role ${repo.role} must use ownership policy ${rolePolicy.ownershipPolicy}`)
    invariant(
      typeof repo[rolePolicy.pathProperty] === 'string' && repo[rolePolicy.pathProperty].length > 0,
      `Repository ${repo.id} role ${repo.role} must use ${rolePolicy.pathProperty}`,
    )
    invariant(
      deepEqual(repo[rolePolicy.requiredCapability], rolePolicy.requiredCapabilityValues),
      `Repository ${repo.id} role ${repo.role} must declare canonical ${rolePolicy.requiredCapability}`,
    )
    invariant(
      repo[rolePolicy.forbiddenCapability] === undefined,
      `Repository ${repo.id} role ${repo.role} may not declare ${rolePolicy.forbiddenCapability}`,
    )
    invariant(['public', 'private', 'internal'].includes(repo.visibility), `Unknown visibility ${repo.visibility ?? '<missing>'} for ${repo.id}`)
    invariant(typeof repo.defaultBranch === 'string' && repo.defaultBranch.length > 0, `Missing defaultBranch for ${repo.id}`)
    invariant(typeof repo.desiredProfile === 'string' && repo.desiredProfile.length > 0, `Missing desiredProfile for ${repo.id}`)
    invariant(typeof repo.releaseRing === 'string' && repo.releaseRing.length > 0, `Missing releaseRing for ${repo.id}`)
    invariant(inventory.ownershipPolicies[repo.ownershipPolicy], `Unknown ownership policy ${repo.ownershipPolicy} for ${repo.id}`)
    if (repo.role === 'authority') {
      invariant(repo.upgradeProtocolProfile === undefined, `Authority repository ${repo.id} may not claim a consumer upgrade protocol profile`)
      invariant(repo.acceptedBootstrapReadbackSha256 === undefined, `Authority repository ${repo.id} may not claim a consumer bootstrap readback`)
      invariant(repo.acceptedControlPlaneUpdate === undefined, `Authority repository ${repo.id} may not claim a consumer control-plane update`)
    } else {
      invariant(typeof repo.upgradeProtocolProfile === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(repo.upgradeProtocolProfile), `Repository ${repo.id} must declare a consumer upgrade protocol profile`)
      upgradeFacts ??= resolveConsumerUpgradeFacts(consumerUpgradeProtocol, consumerUpgradeProfileFacts)
      const upgradePolicy = upgradeFacts.profileFacts.profiles[repo.upgradeProtocolProfile]
      invariant(upgradePolicy, `Unknown consumer upgrade protocol profile ${repo.upgradeProtocolProfile} for ${repo.id}`)
      if (repo.role === 'template-mirror') {
        invariant(upgradeFacts.profileFacts.newSnapshotLineage.includes(repo.upgradeProtocolProfile), `Template repository ${repo.id} must remain on the new-snapshot upgrade lineage`)
      }
      if (repo.role === 'product-consumer' && LEGACY_PRODUCT_REPOSITORY_IDS.has(repo.id)) {
        invariant(upgradeFacts.profileFacts.legacyBootstrapLineage.includes(repo.upgradeProtocolProfile), `Existing legacy product ${repo.id} may not self-declare the new-snapshot upgrade lineage`)
      }
      if (repo.acceptedBootstrapReadbackSha256 !== undefined) {
        invariant(/^[a-f0-9]{64}$/.test(repo.acceptedBootstrapReadbackSha256), `Repository ${repo.id} accepted bootstrap readback digest is invalid`)
      }
      if (repo.acceptedControlPlaneUpdate !== undefined) {
        invariant(['template-mirror', 'product-consumer'].includes(repo.role), `Repository ${repo.id} may not bind a control-plane readback outside a template or product role`)
        invariant(upgradePolicy.controlPlaneUpdateBindingRequired === true, `Repository ${repo.id} control-plane update is incompatible with profile ${repo.upgradeProtocolProfile}`)
        const accepted = repo.acceptedControlPlaneUpdate
        invariant(
          accepted && typeof accepted === 'object' && !Array.isArray(accepted)
            && Object.keys(accepted).sort(compareUtf8Bytes).join(',') === 'baseSnapshotTreeSha256,baselineEvidenceSha256,candidateCorpusReceiptSha256,candidateReleaseSha256,incomingSnapshotTreeSha256,issuerRegistryDigest,materializedSnapshotTreeSha256,mergeCommitSha,mergeTreeSha,predecessorReadbackSha256,readbackSha256,sequence,version',
          `Repository ${repo.id} accepted control-plane update has an invalid or open shape`,
        )
        invariant(Number.isSafeInteger(accepted.sequence) && accepted.sequence >= 1, `Repository ${repo.id} accepted control-plane update sequence is invalid`)
        for (const field of [
          'readbackSha256',
          'candidateReleaseSha256',
          'baselineEvidenceSha256',
          'baseSnapshotTreeSha256',
          'incomingSnapshotTreeSha256',
          'materializedSnapshotTreeSha256',
          'candidateCorpusReceiptSha256',
          'issuerRegistryDigest',
        ]) {
          invariant(/^[a-f0-9]{64}$/.test(accepted[field] ?? ''), `Repository ${repo.id} accepted control-plane update ${field} is invalid`)
        }
        for (const field of ['mergeCommitSha', 'mergeTreeSha']) {
          invariant(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(accepted[field] ?? ''), `Repository ${repo.id} accepted control-plane update ${field} is invalid`)
        }
        invariant(
          accepted.sequence === 1
            ? accepted.predecessorReadbackSha256 === null
            : /^[a-f0-9]{64}$/.test(accepted.predecessorReadbackSha256 ?? ''),
          `Repository ${repo.id} accepted control-plane update predecessor is invalid`,
        )
        invariant(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(accepted.version ?? ''), `Repository ${repo.id} accepted control-plane update version is invalid`)
      }
      invariant(
        /^[a-f0-9]{64}$/.test(repo.acceptedBootstrapReadbackSha256 ?? '') === upgradePolicy.acceptedBootstrapBindingRequired,
        `Repository ${repo.id} accepted bootstrap readback binding does not match profile ${repo.upgradeProtocolProfile}`,
      )
      invariant(
        (repo.acceptedControlPlaneUpdate !== undefined) === upgradePolicy.controlPlaneUpdateBindingRequired,
        `Repository ${repo.id} accepted control-plane update binding does not match profile ${repo.upgradeProtocolProfile}`,
      )
    }
    const paths = [repo.localPathFromGovernanceRoot, repo.mirrorSourcePathFromGovernanceRoot].filter(value => value !== undefined)
    invariant(paths.length === 1 && typeof paths[0] === 'string' && paths[0].length > 0, `Repository ${repo.id} must declare exactly one non-empty local or mirror source path`)
    invariant(Array.isArray(repo.providerSurfacesRequired) && repo.providerSurfacesRequired.length > 0, `Repository ${repo.id} must declare providerSurfacesRequired`)
    const requirements = new Set()
    for (const requirement of repo.providerSurfacesRequired) {
      invariant(typeof requirement === 'string' && /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(requirement), `Invalid provider surface requirement ${String(requirement)} for ${repo.id}`)
      invariant(!requirements.has(requirement), `Duplicate provider surface requirement ${requirement} for ${repo.id}`)
      const [provider, runtimeKind, surface] = requirement.split('/')
      invariant(providerIds.has(provider), `Unknown provider in surface requirement ${requirement} for ${repo.id}`)
      invariant(providerRuntimeKinds.get(provider)?.has(runtimeKind), `Unknown runtime kind in surface requirement ${requirement} for ${repo.id}`)
      invariant(providerSurfaces.has(surface), `Unknown surface requirement ${requirement} for ${repo.id}`)
      requirements.add(requirement)
    }
    for (const field of ['publishes', 'consumes']) {
      if (repo[field] === undefined) continue
      invariant(Array.isArray(repo[field]), `Repository ${repo.id} ${field} must be an array`)
      const values = new Set()
      for (const value of repo[field]) {
        invariant(typeof value === 'string' && value.length > 0 && !values.has(value), `Repository ${repo.id} ${field} must contain unique non-empty strings`)
        values.add(value)
      }
    }
    ids.add(repo.id)
    slugs.add(repo.github)
    repositoriesById.set(repo.id, repo)
    repositoriesByRole.get(repo.role).push(repo)
  }
  const authorityRepositories = repositoriesByRole.get('authority')
  invariant(authorityRepositories.length <= 1, 'Inventory may contain only one authority repository')
  if (authorityRepositories.length === 1) {
    const expectedAuthority = `${authorityRepositories[0].github}@infra/governance`
    invariant(inventory.authority === expectedAuthority, `Inventory authority must exactly equal ${expectedAuthority}`)
    const authorityOwner = authorityRepositories[0].github.split('/')[0]
    for (const product of repositoriesByRole.get('product-consumer')) {
      invariant(product.github.split('/')[0] === authorityOwner, `Product repository ${product.id} must remain under authority owner ${authorityOwner}`)
    }
  }
  if (inventory.certificationCanaries !== undefined) {
    invariant(inventory.certificationCanaries && typeof inventory.certificationCanaries === 'object' && !Array.isArray(inventory.certificationCanaries), 'Inventory certificationCanaries must be a mapping')
    const representedRoles = [...new Set(inventory.repositories.map(repository => repository.role))].sort(compareUtf8Bytes)
    const canaryRoles = Object.keys(inventory.certificationCanaries).sort(compareUtf8Bytes)
    invariant(canaryRoles.every(role => REPOSITORY_ROLES.has(role)), 'Inventory certificationCanaries contains an unknown repository role')
    if (requireCertificationCanaries) invariant(canaryRoles.join(',') === representedRoles.join(','), 'Inventory certificationCanaries must exactly cover represented repository roles')
    for (const role of canaryRoles) {
      const canary = inventory.certificationCanaries[role]
      invariant(canary && typeof canary === 'object' && !Array.isArray(canary) && Object.keys(canary).join(',') === 'repositoryId', `Certification canary ${role} must have a closed repositoryId binding`)
      const matches = inventory.repositories.filter(repository => repository.id === canary.repositoryId)
      if (requireCertificationCanaries || matches.length > 0) {
        invariant(matches.length === 1, `Certification canary ${role} references unknown repository ${canary.repositoryId ?? '<missing>'}`)
        invariant(matches[0].role === role, `Certification canary ${role} repository ${canary.repositoryId} has role ${matches[0].role}`)
      }
    }
  } else invariant(!requireCertificationCanaries, 'Inventory must contain certificationCanaries')
  invariant(inventory.workflowIdentitySources && typeof inventory.workflowIdentitySources === 'object' && !Array.isArray(inventory.workflowIdentitySources), 'Inventory workflowIdentitySources must be a mapping')
  invariant(
    deepEqual(
      Object.keys(inventory.workflowIdentitySources).sort(compareUtf8Bytes),
      Object.keys(WORKFLOW_IDENTITY_SOURCE_POLICY).sort(compareUtf8Bytes),
    ),
    'Inventory workflowIdentitySources must exactly cover the canonical desired profiles',
  )
  const closesWorkflowIdentitySourceRepositories = repositoriesByRole.get('authority').length > 0
    || repositoriesByRole.get('template-mirror').length > 0
    || requireWorkflowIdentitySourceRepositories
  for (const [profile, expected] of Object.entries(WORKFLOW_IDENTITY_SOURCE_POLICY)) {
    const source = inventory.workflowIdentitySources[profile]
    invariant(source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).sort(compareUtf8Bytes).join(',') === 'repositoryId', `Workflow identity source ${profile} must have a closed repositoryId binding`)
    invariant(source.repositoryId === expected.repositoryId, `Workflow identity source ${profile} must use repository ${expected.repositoryId}`)
    const repository = repositoriesById.get(source.repositoryId)
    if (closesWorkflowIdentitySourceRepositories) {
      invariant(repository, `Workflow identity source ${profile} references unknown repository ${source.repositoryId ?? '<missing>'}`)
    }
    if (repository) {
      invariant(repository.role === expected.repositoryRole, `Workflow identity source ${profile} repository ${source.repositoryId} must have role ${expected.repositoryRole}`)
    }
  }
  const expectedOwnershipPolicies = [...new Set(
    inventory.repositories.map(repository => MANAGED_REPOSITORY_ROLE_POLICY[repository.role].ownershipPolicy),
  )].sort(compareUtf8Bytes)
  invariant(
    deepEqual(Object.keys(inventory.ownershipPolicies).sort(compareUtf8Bytes), expectedOwnershipPolicies),
    'Inventory ownershipPolicies must exactly cover the policies selected by managed repository roles',
  )
  for (const [name, policy] of Object.entries(inventory.ownershipPolicies)) {
    invariant(OWNERSHIP_MODES.has(policy.defaultMode), `Invalid defaultMode in ownership policy ${name}`)
    invariant(Array.isArray(policy.rules), `Ownership policy ${name} rules must be an array`)
    const patterns = new Set()
    for (const rule of policy.rules) {
      invariant(rule.pattern && !patterns.has(rule.pattern), `Duplicate ownership pattern ${rule.pattern} in ${name}`)
      invariant(OWNERSHIP_MODES.has(rule.mode), `Invalid ownership mode ${rule.mode} in ${name}`)
      invariant(typeof rule.owner === 'string' && rule.owner.length > 0, `Missing owner for ${rule.pattern} in ${name}`)
      globToRegExp(rule.pattern)
      patterns.add(rule.pattern)
    }
  }
  validateCanonicalOwnershipPolicies(inventory, consumerOwnershipFacts, closesWorkflowIdentitySourceRepositories)
  assertNoEmbeddedSecrets(inventory)
  return true
}

export function resolveCertificationCanary(inventory, role) {
  invariant(REPOSITORY_ROLES.has(role), `Unknown certification canary role ${String(role)}`)
  invariant(inventory?.certificationCanaries && typeof inventory.certificationCanaries === 'object' && !Array.isArray(inventory.certificationCanaries), 'Certification canary selection requires the managed repository inventory')
  const binding = inventory.certificationCanaries[role]
  invariant(binding && typeof binding === 'object' && !Array.isArray(binding) && Object.keys(binding).join(',') === 'repositoryId', `Certification role ${role} requires one explicit inventory canary`)
  const matches = inventory.repositories?.filter(repository => repository.id === binding.repositoryId) ?? []
  invariant(matches.length === 1 && matches[0].role === role, `Certification role ${role} canary ${binding.repositoryId ?? '<missing>'} does not resolve exactly once with the same role`)
  return matches[0]
}

export function assertNoEmbeddedSecrets(value, path = '$') {
  const forbiddenValue = /(github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|x-access-token:[^@\s]+@)/
  const forbiddenKey = /^(token|pat|password|secretValue|credential)$/i
  if (typeof value === 'string') {
    invariant(!forbiddenValue.test(value), `Embedded credential-like value at ${path}`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoEmbeddedSecrets(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      invariant(!(forbiddenKey.test(key) && item), `Credential field ${path}.${key} must not be stored in governance data`)
      assertNoEmbeddedSecrets(item, `${path}.${key}`)
    }
  }
}

export function parseFlags(argv, options) {
  const result = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      result._.push(token)
      continue
    }
    const [rawName, inline] = token.slice(2).split('=', 2)
    const type = options[rawName]
    invariant(type, `Unknown option --${rawName}`)
    if (type === 'boolean') {
      invariant(inline === undefined, `--${rawName} does not accept a value`)
      result[rawName] = true
    } else {
      const value = inline ?? argv[++index]
      invariant(value !== undefined && !value.startsWith('--'), `--${rawName} requires a value`)
      result[rawName] = value
    }
  }
  return result
}
