import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateProviderRegistryDocument } from '../../../scripts/lib/provider-contract-validation.mjs'
import { resolveProviderMaterializer } from '../../../scripts/lib/provider-runtime-contract.mjs'
import { validateHarnessRegistry } from './harness-registry.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CANONICAL_ADAPTER_REGISTRY_PATH = 'packages/governance/canonical/providers.json'
export const CANONICAL_PROVIDER_CLI_TOOLCHAIN_PATH = 'infra/governance/providers/provider-cli-toolchain.json'
const DEFAULT_ADAPTER_REGISTRY_PATH = resolve(GOVERNANCE_ROOT, '../..', CANONICAL_ADAPTER_REGISTRY_PATH)
const DEFAULT_REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const HARD_GATE_REGISTRY_PATH = 'infra/governance/providers/harness-registry.json'
const HARD_GATE_POINTER = '#/commonContract/roleHardGateContracts'
const CONSUMER_GATE_SOURCE_PATH = 'packages/design-system/ds-canonical/fork/consumer/governance-check.mjs'
const CONSUMER_GATE_INSTALLED_PATH = 'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs'
const CONSUMER_GATE_COMMAND = ['node', CONSUMER_GATE_INSTALLED_PATH, '--repo', '.', '--hooks-off']
const EXACT_STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(Object.keys(value).sort().join(',') === [...expected].sort().join(','), `${label} has an invalid or open shape`)
}

function validateHardGateContract(matrix, { repoRoot = DEFAULT_REPO_ROOT, harnessRegistryBytes } = {}) {
  exactKeys(matrix.commonContract, ['mcpTransports', 'hardGateContracts', 'roleHardGateContracts', 'nonPortable'], 'Compatibility common contract')
  exactKeys(matrix.commonContract.hardGateContracts, ['authority', 'consumer'], 'Compatibility hard-gate contracts')
  const contract = matrix.commonContract.hardGateContracts.authority
  exactKeys(contract, ['contractId', 'registryPath', 'registrySchemaVersion', 'registryKind', 'registrySha256', 'runnerCommand'], 'Compatibility hard-gate contract')
  invariant(contract.contractId === 'provider-neutral-governance-harness-v2', 'Compatibility hard-gate contract id is invalid')
  invariant(contract.registryPath === HARD_GATE_REGISTRY_PATH, 'Compatibility hard-gate registry path must bind the canonical Harness registry')
  invariant(contract.registrySchemaVersion === 2 && contract.registryKind === 'provider-neutral-governance-harness-registry', 'Compatibility hard-gate registry identity is invalid')
  invariant(/^[a-f0-9]{64}$/.test(contract.registrySha256), 'Compatibility hard-gate registry digest is invalid')
  invariant(JSON.stringify(contract.runnerCommand) === JSON.stringify(['node', 'infra/governance/bin/run-harnesses.mjs']), 'Compatibility hard-gate runner command is invalid')

  let bytes = harnessRegistryBytes
  if (bytes === undefined) {
    const path = resolve(repoRoot, HARD_GATE_REGISTRY_PATH)
    const info = lstatSync(path)
    invariant(info.isFile() && !info.isSymbolicLink(), 'Canonical Harness registry must be a regular no-symlink file')
    bytes = readFileSync(path)
  }
  invariant(Buffer.isBuffer(bytes) || typeof bytes === 'string', 'Canonical Harness registry bytes are invalid')
  const digest = createHash('sha256').update(bytes).digest('hex')
  invariant(digest === contract.registrySha256, `Compatibility hard-gate registry digest mismatch; expected=${contract.registrySha256}; actual=${digest}`)
  let registry
  try {
    registry = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes)
  } catch (error) {
    throw new Error(`Canonical Harness registry is not valid JSON:${error.message}`, { cause: error })
  }
  validateHarnessRegistry(registry, { repoRoot })
  invariant(registry.schemaVersion === contract.registrySchemaVersion && registry.kind === contract.registryKind, 'Compatibility hard-gate registry identity does not match its digest-bound contract')
  invariant(JSON.stringify(registry.runner.command) === JSON.stringify(contract.runnerCommand), 'Compatibility hard-gate runner diverges from the digest-bound registry')

  const consumer = matrix.commonContract.hardGateContracts.consumer
  exactKeys(consumer, ['contractId', 'packageName', 'sourcePath', 'installedPath', 'runnerCommand', 'deliveryBinding'], 'Compatibility consumer hard-gate contract')
  invariant(consumer.contractId === 'provider-neutral-product-consumer-gate-v1', 'Compatibility consumer hard-gate contract id is invalid')
  invariant(consumer.packageName === '@qijenchen/design-system', 'Compatibility consumer hard-gate package is invalid')
  invariant(consumer.sourcePath === CONSUMER_GATE_SOURCE_PATH && consumer.installedPath === CONSUMER_GATE_INSTALLED_PATH, 'Compatibility consumer hard-gate paths are invalid')
  invariant(JSON.stringify(consumer.runnerCommand) === JSON.stringify(CONSUMER_GATE_COMMAND), 'Compatibility consumer hard-gate command is invalid')
  invariant(consumer.deliveryBinding === 'exact-package-version-plus-fork-governance-lock', 'Compatibility consumer hard-gate delivery binding is invalid')
  const consumerSource = resolve(repoRoot, consumer.sourcePath)
  const consumerSourceInfo = lstatSync(consumerSource)
  invariant(consumerSourceInfo.isFile() && !consumerSourceInfo.isSymbolicLink(), 'Compatibility consumer hard-gate source must be a regular no-symlink file')
  const templatePackage = JSON.parse(readFileSync(resolve(repoRoot, 'template/ds-product-template/package.json'), 'utf8'))
  invariant(templatePackage.scripts?.['governance:check'] === consumer.runnerCommand.join(' '), 'Compatibility consumer hard-gate command is not delivered by the product template')

  const roles = matrix.commonContract.roleHardGateContracts
  exactKeys(roles, ['authority', 'template-mirror', 'product-consumer'], 'Compatibility role hard-gate bindings')
  invariant(roles.authority === '#/commonContract/hardGateContracts/authority', 'Compatibility authority role hard-gate binding is invalid')
  invariant(roles['template-mirror'] === '#/commonContract/hardGateContracts/consumer'
    && roles['product-consumer'] === '#/commonContract/hardGateContracts/consumer', 'Compatibility consumer roles must use the installed role-bound hard gate')
  return { contract, contracts: { authority: contract, consumer }, roles, registry, digest }
}

export function loadCanonicalAdapterRegistry(path = DEFAULT_ADAPTER_REGISTRY_PATH) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink(), 'Canonical adapter registry must be a regular no-symlink file')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadCanonicalProviderCliToolchain(path = resolve(DEFAULT_REPO_ROOT, CANONICAL_PROVIDER_CLI_TOOLCHAIN_PATH)) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink(), 'Canonical provider CLI toolchain must be a regular no-symlink file')
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Canonical provider CLI toolchain is not valid JSON:${error.message}`, { cause: error })
  }
}

function exactStableSemverParts(value, label) {
  const match = String(value ?? '').match(EXACT_STABLE_SEMVER)
  invariant(match, `${label} must be exact stable semver:${String(value)}`)
  return match.slice(1).map((part) => BigInt(part))
}

function compareExactStableSemver(left, right, { leftLabel, rightLabel }) {
  const leftParts = exactStableSemverParts(left, leftLabel)
  const rightParts = exactStableSemverParts(right, rightLabel)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }
  return 0
}

function validateProviderCliVersionJoin(matrix, toolchainManifest, joinedProviders) {
  const supportedPlatforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64']
  exactKeys(toolchainManifest, ['$schema', 'schemaVersion', 'kind', 'registry', 'packageLock', 'packageContent', 'installPolicy', 'providerBindings', 'tools'], 'Canonical provider CLI toolchain')
  invariant(toolchainManifest.$schema === '../schemas/provider-cli-toolchain.schema.json', 'Canonical provider CLI toolchain schema binding is invalid')
  invariant(toolchainManifest.schemaVersion === 2 && toolchainManifest.kind === 'provider-cli-toolchain', 'Canonical provider CLI toolchain identity is invalid')
  exactKeys(toolchainManifest.installPolicy, ['ignoreScripts', 'signatureAudit', 'auditLevel', 'runtimeDirectory', 'shimDirectory', 'supportedPlatforms'], 'Canonical provider CLI install policy')
  invariant(
    toolchainManifest.installPolicy.ignoreScripts === true
      && toolchainManifest.installPolicy.signatureAudit === true
      && toolchainManifest.installPolicy.auditLevel === 'high'
      && toolchainManifest.installPolicy.runtimeDirectory === 'node_modules/.provider-cli-toolchain'
      && toolchainManifest.installPolicy.shimDirectory === 'node_modules/.bin'
      && JSON.stringify(toolchainManifest.installPolicy.supportedPlatforms) === JSON.stringify(supportedPlatforms),
    'Canonical provider CLI install policy is invalid',
  )
  exactKeys(toolchainManifest.packageContent, ['protocol', 'modePolicy', 'packages'], 'Canonical provider CLI package-content authority')
  invariant(
    toolchainManifest.packageContent.protocol === 'npm-ustar-package-tree-v1'
      && toolchainManifest.packageContent.modePolicy === 'excluded-portable-content-only'
      && Array.isArray(toolchainManifest.packageContent.packages)
      && toolchainManifest.packageContent.packages.length > 0,
    'Canonical provider CLI package-content authority is invalid',
  )
  const packageContentByLockPath = new Map()
  for (const [index, record] of toolchainManifest.packageContent.packages.entries()) {
    exactKeys(record, ['lockPath', 'platforms', 'treeSha256', 'fileCount', 'totalBytes'], `Canonical provider CLI package-content record ${index}`)
    invariant(
      /^node_modules\/@[a-z0-9-]+\/[a-z0-9-]+$/.test(record.lockPath)
        && Array.isArray(record.platforms)
        && record.platforms.length > 0
        && record.platforms.every(platform => supportedPlatforms.includes(platform))
        && JSON.stringify([...new Set(record.platforms)].sort()) === JSON.stringify(record.platforms)
        && /^[a-f0-9]{64}$/.test(record.treeSha256)
        && Number.isSafeInteger(record.fileCount)
        && record.fileCount > 0
        && Number.isSafeInteger(record.totalBytes)
        && record.totalBytes > 0,
      `Canonical provider CLI package-content record ${index} is invalid`,
    )
    invariant(!packageContentByLockPath.has(record.lockPath), `Canonical provider CLI package-content lockPath is duplicated:${record.lockPath}`)
    packageContentByLockPath.set(record.lockPath, record)
  }
  invariant(
    JSON.stringify([...packageContentByLockPath.keys()]) === JSON.stringify([...packageContentByLockPath.keys()].sort()),
    'Canonical provider CLI package-content records must be sorted by lockPath',
  )
  invariant(Array.isArray(toolchainManifest.providerBindings) && toolchainManifest.providerBindings.length > 0, 'Canonical provider CLI toolchain provider bindings are missing')
  invariant(Array.isArray(toolchainManifest.tools), 'Canonical provider CLI toolchain tools must be an array')

  const bindingProviderIds = new Set()
  const bindingByToolId = new Map()
  for (const [index, binding] of toolchainManifest.providerBindings.entries()) {
    exactKeys(binding, ['providerId', 'provisioning', 'toolProviderId'], `Canonical provider CLI binding ${index}`)
    invariant(typeof binding.providerId === 'string' && /^[a-z][a-z0-9-]+$/.test(binding.providerId), `Canonical provider CLI binding ${index} providerId is invalid`)
    invariant(joinedProviders.has(binding.providerId), `Canonical provider CLI binding ${binding.providerId} has no compatibility provider registration`)
    invariant(!bindingProviderIds.has(binding.providerId), `Canonical provider CLI binding providerId is duplicated:${binding.providerId}`)
    if (binding.provisioning === 'repo-provisioned-cli') {
      invariant(typeof binding.toolProviderId === 'string' && !bindingByToolId.has(binding.toolProviderId), `Canonical provider CLI tool binding is invalid or duplicated:${String(binding.toolProviderId)}`)
      bindingByToolId.set(binding.toolProviderId, binding)
    } else invariant(binding.provisioning === 'external-runtime' && binding.toolProviderId === null, `Canonical provider ${binding.providerId} has an invalid external runtime binding`)
    bindingProviderIds.add(binding.providerId)
  }
  invariant(
    JSON.stringify([...bindingProviderIds].sort()) === JSON.stringify([...joinedProviders.keys()].sort()),
    'Canonical provider CLI bindings must exactly enumerate every compatibility provider, including external runtimes',
  )

  const bindings = new Map()
  const toolIds = new Set()
  const expectedContent = new Map()
  for (const [index, tool] of toolchainManifest.tools.entries()) {
    exactKeys(tool, ['providerId', 'packageName', 'version', 'executable', 'binKind', 'packageBin', 'platformPackage', 'versionProbe'], `Canonical provider CLI tool ${index}`)
    invariant(typeof tool.providerId === 'string' && /^[a-z][a-z0-9-]*$/.test(tool.providerId), `Canonical provider CLI tool ${index} providerId is invalid`)
    invariant(!toolIds.has(tool.providerId), `Canonical provider CLI tool providerId is duplicated:${tool.providerId}`)
    invariant(tool.versionProbe === 'exact-semver-token', `Canonical provider CLI tool ${tool.providerId} version probe is invalid`)
    invariant(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(tool.packageName), `Canonical provider CLI tool ${tool.providerId} packageName is invalid`)
    expectedContent.set(`node_modules/${tool.packageName}`, supportedPlatforms)
    if (tool.platformPackage !== null) {
      exactKeys(tool.platformPackage, ['nameTemplate', 'executablePath'], `Canonical provider CLI tool ${tool.providerId} platform package`)
      invariant(
        typeof tool.platformPackage.nameTemplate === 'string'
          && (tool.platformPackage.nameTemplate.match(/\{platform\}/g) ?? []).length === 1,
        `Canonical provider CLI tool ${tool.providerId} platform package template is invalid`,
      )
      for (const platform of supportedPlatforms) {
        const packageName = tool.platformPackage.nameTemplate.replace('{platform}', platform)
        invariant(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName), `Canonical provider CLI tool ${tool.providerId} platform package name is invalid:${packageName}`)
        expectedContent.set(`node_modules/${packageName}`, [platform])
      }
    }

    const providerBinding = bindingByToolId.get(tool.providerId)
    invariant(providerBinding, `Canonical provider CLI tool ${tool.providerId} has no repo-provisioned provider binding`)
    const joined = joinedProviders.get(providerBinding.providerId)
    invariant(joined.adapter !== null, `Canonical provider CLI tool ${tool.providerId} cannot bind a headless compatibility provider`)
    const minimumVersion = joined.registration?.minimumVersion
    invariant(
      compareExactStableSemver(tool.version, minimumVersion, {
        leftLabel: `Canonical provider CLI ${tool.providerId} locked version`,
        rightLabel: `Compatibility provider ${providerBinding.providerId} minimumVersion`,
      }) >= 0,
      `Canonical provider CLI ${providerBinding.providerId} locked version ${tool.version} is below compatibility minimum ${String(minimumVersion)}`,
    )
    bindings.set(providerBinding.providerId, Object.freeze({
      adapterProviderId: joined.adapter.providerId,
      lockedVersion: tool.version,
      minimumVersion,
      providerId: providerBinding.providerId,
    }))
    toolIds.add(tool.providerId)
  }
  invariant(bindings.size === bindingByToolId.size, 'Canonical repo-provisioned provider bindings and tools differ')
  invariant(packageContentByLockPath.size === expectedContent.size, 'Canonical provider CLI package-content authority differs from the active tool closure')
  for (const [lockPath, platforms] of expectedContent) {
    const record = packageContentByLockPath.get(lockPath)
    invariant(record, `Canonical provider CLI package-content authority omits active package:${lockPath}`)
    invariant(JSON.stringify(record.platforms) === JSON.stringify(platforms), `Canonical provider CLI package-content platform binding differs:${lockPath}`)
  }
  return bindings
}

export function deriveProviderAdapterFacts(providerId, adapterRegistry) {
  validateProviderRegistryDocument(adapterRegistry)
  const provider = adapterRegistry.providers.find((candidate) => candidate.id === providerId)
  invariant(provider, `Unknown adapter provider ${providerId} => ADAPTER-BLOCKED`)
  const skillMaterializer = provider.adapter.skillView
    ? resolveProviderMaterializer(adapterRegistry, 'skillViews', provider.adapter.skillView.materializerId, `${provider.id} skill materializer`)
    : null
  const hookMaterializer = provider.adapter.hookView
    ? resolveProviderMaterializer(adapterRegistry, 'hookViews', provider.adapter.hookView.materializerId, `${provider.id} hook materializer`)
    : null
  return {
    providerId: provider.id,
    providerKind: provider.providerKind,
    generated: provider.adapter.generate,
    instructions: {
      entrypoint: provider.instructionEntry,
      sharedEntrypoint: provider.sharedInstructionEntry,
    },
    skills: provider.adapter.skillView
      ? {
          directory: provider.adapter.skillView.directory,
          materializerId: provider.adapter.skillView.materializerId,
          engine: skillMaterializer.engine,
          entryFile: skillMaterializer.entryFile,
        }
      : null,
    hooks: provider.adapter.hookView
      ? {
          output: provider.adapter.hookView.output,
          materializerId: provider.adapter.hookView.materializerId,
          engine: hookMaterializer.engine,
          nativeHooks: provider.capabilities.nativeHooks,
          securityBoundary: provider.capabilities.hardGateComplete,
        }
      : null,
    discovery: structuredClone(provider.adapter.discovery),
  }
}

export function validateProviderCompatibilityJoin(matrix, adapterRegistry = loadCanonicalAdapterRegistry(), options = {}) {
  validateProviderRegistryDocument(adapterRegistry)
  invariant(matrix?.schemaVersion === 2, 'Compatibility matrix schemaVersion must be 2')
  invariant(matrix?.adapterRegistry?.path === CANONICAL_ADAPTER_REGISTRY_PATH, 'Compatibility matrix adapter registry path must bind the canonical provider registry')
  invariant(matrix.adapterRegistry.schemaVersion === adapterRegistry.schemaVersion, 'Compatibility matrix adapter registry schemaVersion is stale')
  invariant(matrix.adapterRegistry.unregisteredProviderOutcome === 'fail', 'Compatibility matrix must fail closed for unregistered adapter providers')
  invariant(matrix.providers && typeof matrix.providers === 'object' && !Array.isArray(matrix.providers), 'Compatibility matrix providers must be an object')
  const hardGateBinding = validateHardGateContract(matrix, options)
  invariant(matrix.surfaces && Object.keys(matrix.surfaces).sort().join(',') === 'cloud,github-actions,local,remote-control', 'Compatibility matrix surfaces must be closed')
  for (const [surfaceId, surface] of Object.entries(matrix.surfaces)) {
    exactKeys(surface, ['execution', 'repoConfigTravels', 'userConfigTravels', 'hostMustRemainOnline', 'hardGateContract', 'nativeHookPolicy', 'certificationPolicy'], `Compatibility surface ${surfaceId}`)
    invariant(surface.repoConfigTravels === true, `Compatibility surface ${surfaceId} must carry committed repository configuration`)
    invariant(surface.hardGateContract && Object.keys(surface.hardGateContract).length === 1 && surface.hardGateContract.pointer === HARD_GATE_POINTER, `Compatibility surface ${surfaceId} must resolve the canonical role-bound hard-gate family`)
    invariant(surface.certificationPolicy === 'target-bound-evidence-required', `Compatibility surface ${surfaceId} must require target-bound certification evidence`)
  }
  invariant(matrix.surfaces.local.repoConfigTravels === true && matrix.surfaces.local.userConfigTravels === true, 'Local surface must distinguish travelling repository and user-home configuration')
  invariant(matrix.surfaces.local.nativeHookPolicy === 'provider-capability-feedback-only', 'Local native hooks must remain provider-capability feedback, never the hard-gate authority')
  invariant(matrix.surfaces['remote-control'].userConfigTravels === true && matrix.surfaces['remote-control'].nativeHookPolicy === 'provider-capability-feedback-only', 'Remote-control must execute the host provider capability without changing hard-gate authority')
  invariant(matrix.surfaces.cloud.repoConfigTravels === true && matrix.surfaces.cloud.userConfigTravels === false, 'Cloud surface must rely on repository configuration without inheriting user-home configuration')
  invariant(matrix.surfaces.cloud.nativeHookPolicy === 'environment-dependent-feedback-only', 'Cloud native hooks must remain environment-dependent feedback, never the hard-gate authority')
  invariant(matrix.surfaces['github-actions'].userConfigTravels === false && matrix.surfaces['github-actions'].nativeHookPolicy === 'not-applicable', 'GitHub Actions must not inherit user-home state or claim provider-native hook execution')

  const adapters = new Map(adapterRegistry.providers.map((provider) => [provider.id, provider]))
  const mappedAdapterIds = new Map()
  const joinedProviders = new Map()
  for (const [fleetProviderId, registration] of Object.entries(matrix.providers)) {
    const adapterProviderId = registration?.adapterProviderId
    if (adapterProviderId === null) {
      joinedProviders.set(fleetProviderId, { fleetProviderId, registration, adapter: null })
      continue
    }
    invariant(typeof adapterProviderId === 'string' && adapters.has(adapterProviderId), `Compatibility provider ${fleetProviderId} maps unknown adapter provider ${String(adapterProviderId)} => ADAPTER-BLOCKED`)
    const adapter = adapters.get(adapterProviderId)
    invariant(adapter.providerKind === 'concrete-runtime', `Compatibility provider ${fleetProviderId} cannot map headless protocol ${adapterProviderId}`)
    invariant(adapter.adapter.generate, `Compatibility provider ${fleetProviderId} cannot map non-materialized adapter ${adapterProviderId}`)
    invariant(!mappedAdapterIds.has(adapterProviderId), `Adapter provider ${adapterProviderId} maps to multiple fleet providers:${mappedAdapterIds.get(adapterProviderId)},${fleetProviderId}`)
    mappedAdapterIds.set(adapterProviderId, fleetProviderId)
    joinedProviders.set(fleetProviderId, {
      fleetProviderId,
      registration,
      adapter: deriveProviderAdapterFacts(adapterProviderId, adapterRegistry),
    })
  }

  const requiredAdapterIds = adapterRegistry.providers
    .filter((provider) => provider.providerKind === 'concrete-runtime' && provider.adapter.generate)
    .map((provider) => provider.id)
    .sort()
  const actualAdapterIds = [...mappedAdapterIds.keys()].sort()
  invariant(
    JSON.stringify(actualAdapterIds) === JSON.stringify(requiredAdapterIds),
    `Compatibility adapter join is incomplete; expected=${requiredAdapterIds.join(',')}; actual=${actualAdapterIds.join(',')}`,
  )
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT
  const providerCliToolchain = Object.hasOwn(options, 'providerCliToolchain')
    ? options.providerCliToolchain
    : loadCanonicalProviderCliToolchain(resolve(repoRoot, CANONICAL_PROVIDER_CLI_TOOLCHAIN_PATH))
  const providerCliVersionBindings = validateProviderCliVersionJoin(matrix, providerCliToolchain, joinedProviders)
  return {
    joinedProviders,
    adapterToFleet: mappedAdapterIds,
    adapterProviderIds: new Set(actualAdapterIds),
    providerCliVersionBindings,
    hardGateBinding,
  }
}
