// Dependency-free provider semantics shared by the development validator and the clean-plugin
// runtime validator. This module deliberately does not import the generated standalone validator:
// provider-adapters must be able to produce that artifact from a first-ever clean build.
import { isAbsolute } from 'node:path'

const DISCOVERY_KEYS = Object.freeze([
  'providerRootNames', 'instructionNames', 'instructionOverrideNames', 'configPaths', 'pluginRootNames',
])
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const MATERIALIZER_ENGINES = Object.freeze({
  instructionViews: new Set(['markdown-relative-at-import-v1', 'shared-instruction-v1']),
  hookBaseTemplateContracts: new Set(['claude-permission-policy-v1', 'static-json-object-v1']),
  hookViews: new Set(['json-hook-map-v1', 'json-hook-event-list-v1']),
  skillViews: new Set(['skill-directory-v1']),
  treeViews: new Set(['closed-tree-copy-v1']),
})

// This contract is bundled into clean provider-plugin runtimes, so it intentionally owns the
// dependency-free form of the canonical UTF-8 byte comparator instead of importing monorepo code.
export const compareUtf8Bytes = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

export function assertRepositoryPath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty repository-relative POSIX path`)
  }
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain empty, dot, or traversal segments`)
  }
  if (['.git', '.github'].includes(value.split('/')[0])) throw new Error(`${label} may not address a Git control root`)
  return value
}

export function assertAdapterOutputPath(value, label) {
  assertRepositoryPath(value, label)
  const segments = value.split('/')
  if (segments.length < 2 || !/^\.[A-Za-z0-9_-]+$/.test(segments[0])) {
    throw new Error(`${label} must live below a dedicated non-Git dot-directory`)
  }
  return value
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

const compactEventKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

/** Resolve a canonical governance event to the exact event identifier accepted by a provider API. */
export function projectProviderNativeEvent(provider, canonicalEvent) {
  const bindings = provider?.adapter?.hookView?.eventBindings
  const nativeEvent = bindings?.[canonicalEvent]
  if (typeof nativeEvent !== 'string' || !nativeEvent || !/^[A-Za-z][A-Za-z0-9_.:@/-]*$/.test(nativeEvent)) {
    throw new Error(`${provider?.id || '<missing>'}:canonical hook event has no safe native binding:${canonicalEvent} => ADAPTER-BLOCKED`)
  }
  return nativeEvent
}

function exactSortedUniqueStrings(values) {
  return Array.isArray(values)
    && values.every((value) => typeof value === 'string')
    && JSON.stringify(values) === JSON.stringify([...new Set(values)].sort())
}

export function hasUsableVersionedTranscript(transcript) {
  const access = transcript?.access
  return Boolean(
    transcript?.contract
    && transcript.stability === 'tested-versioned'
    && transcript.fixture
    && access?.strategy === 'validated-jsonl-tail-v2'
    && access.pathPolicy === 'canonical-unique-regular-file-no-name-assumption'
    && access.recordFormat === 'json-lines'
    && access.emptyState === 'allowed-zero-byte'
    && Number.isSafeInteger(access.maximumRetainedRecordCount)
    && access.maximumRetainedRecordCount > 0
    && Number.isSafeInteger(access.maximumRecordBytes)
    && access.maximumRecordBytes > 0
    && Number.isSafeInteger(access.maximumMaterializedBytes)
    // maximumRecordBytes is the UTF-8 JSON body only; every materialized record also owns one
    // normalized LF delimiter, so the closed snapshot budget must fit both.
    && access.maximumMaterializedBytes >= access.maximumRecordBytes + 1,
  )
}

function validateProviderTranscript(provider) {
  const transcript = provider.runtime?.transcript
  if (!transcript) return
  if (transcript.contract) {
    if (!hasUsableVersionedTranscript(transcript)) {
      throw new Error(`${provider.id}:versioned transcript contract requires a committed fixture and bounded validated-tail access`)
    }
    return
  }
  if (transcript.fixture !== null || transcript.access !== null || transcript.stability === 'tested-versioned') {
    throw new Error(`${provider.id}:unversioned transcript cannot expose a fixture, tested stability, or trusted access strategy`)
  }
}

export function resolveProviderMaterializer(registry, kind, materializerId, label = `${kind} materializer`) {
  const catalog = registry?.canonical?.materializers?.[kind]
  if (!MATERIALIZER_ENGINES[kind] || !catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error(`${label} kind is unknown:${kind} => ADAPTER-BLOCKED`)
  }
  if (typeof materializerId !== 'string' || !Object.hasOwn(catalog, materializerId)) {
    throw new Error(`${label} is unregistered:${String(materializerId)} => ADAPTER-BLOCKED`)
  }
  const materializer = catalog[materializerId]
  if (!materializer || typeof materializer !== 'object' || Array.isArray(materializer) || !MATERIALIZER_ENGINES[kind].has(materializer.engine)) {
    throw new Error(`${label} engine is unsupported:${materializer?.engine ?? '<missing>'} => ADAPTER-BLOCKED`)
  }
  return materializer
}

function validateMaterializerCatalog(registry) {
  const catalogs = registry.canonical.materializers
  for (const kind of Object.keys(MATERIALIZER_ENGINES)) {
    const catalog = catalogs[kind]
    if (JSON.stringify(Object.keys(catalog)) !== JSON.stringify(Object.keys(catalog).sort())) {
      throw new Error(`canonical.materializers.${kind} ids must be sorted`)
    }
    for (const [id, materializer] of Object.entries(catalog)) {
      resolveProviderMaterializer(registry, kind, id, `canonical.materializers.${kind}.${id}`)
      if (kind === 'instructionViews') {
        if (materializer.engine === 'shared-instruction-v1' && (materializer.supplementPolicy !== 'forbidden' || materializer.ownershipPolicy !== 'common-authority-consumer')) {
          throw new Error(`canonical.materializers.${kind}.${id} shared instructions must forbid supplements`)
        }
        if (materializer.engine === 'markdown-relative-at-import-v1' && (materializer.ownershipPolicy !== 'provider-generated-projection' || !['optional', 'required'].includes(materializer.supplementPolicy))) {
          throw new Error(`canonical.materializers.${kind}.${id} has an unsupported supplement policy`)
        }
      }
      if (kind === 'hookBaseTemplateContracts') {
        if (materializer.engine === 'claude-permission-policy-v1') {
          assertRepositoryPath(materializer.source, `canonical.materializers.${kind}.${id}.source`)
          assertRepositoryPath(materializer.schema, `canonical.materializers.${kind}.${id}.schema`)
        }
      }
      if (kind === 'hookViews' && materializer.engine === 'json-hook-map-v1') {
        if (materializer.descriptionField !== null && materializer.descriptionField === materializer.hooksField) {
          throw new Error(`canonical.materializers.${kind}.${id} aliases description and hook fields`)
        }
        if (!['merge-hook-map-into-base-v1', 'replace-document-v1'].includes(materializer.mergeStrategy)) {
          throw new Error(`canonical.materializers.${kind}.${id} has an unsupported merge strategy`)
        }
      }
      if (kind === 'hookViews' && materializer.engine === 'json-hook-event-list-v1') {
        const fields = [materializer.eventsField, materializer.eventField, materializer.groupsField, materializer.matcherField, materializer.handlersField, materializer.handlerArgvField, materializer.descriptionField]
        if (new Set(fields).size !== fields.length) throw new Error(`canonical.materializers.${kind}.${id} aliases JSON fields`)
        if (materializer.mergeStrategy !== 'replace-document-v1' || materializer.baseTemplateContract !== null) {
          throw new Error(`canonical.materializers.${kind}.${id} event lists must replace the document without a base template`)
        }
      }
      if (kind === 'hookViews') {
        const contractId = materializer.baseTemplateContract
        if (materializer.mergeStrategy === 'merge-hook-map-into-base-v1') {
          resolveProviderMaterializer(registry, 'hookBaseTemplateContracts', contractId, `canonical.materializers.${kind}.${id}.baseTemplateContract`)
        } else if (contractId !== null) {
          throw new Error(`canonical.materializers.${kind}.${id} replacement strategy must not bind a base template contract`)
        }
      }
      if (kind === 'treeViews') {
        if (JSON.stringify(materializer.transformPolicies) !== JSON.stringify(['byte-exact'])) {
          throw new Error(`canonical.materializers.${kind}.${id} must support only byte-exact transforms`)
        }
      }
    }
  }
}

function providerRootName(value, label) {
  assertRepositoryPath(value, label)
  const root = value.split('/')[0]
  if (!/^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/.test(root)) {
    throw new Error(`${label} must resolve below a dedicated provider dot-root`)
  }
  return root
}

function instructionName(value, label) {
  assertRepositoryPath(value, label)
  const name = value.split('/').at(-1)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/.test(name)) throw new Error(`${label} must resolve to a direct Markdown discovery name`)
  return name
}

function validateDiscoveryInventory(inventory, label, { policy = false } = {}) {
  const expectedKeys = policy ? ['schemaVersion', ...DISCOVERY_KEYS].sort() : [...DISCOVERY_KEYS].sort()
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory) || JSON.stringify(Object.keys(inventory).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label} must have the closed discovery inventory shape`)
  }
  if (policy && inventory.schemaVersion !== 1) throw new Error(`${label}.schemaVersion must equal 1`)
  for (const key of DISCOVERY_KEYS) {
    if (!exactSortedUniqueStrings(inventory[key])) throw new Error(`${label}.${key} must be a sorted unique string array`)
  }
  for (const root of [...inventory.providerRootNames, ...inventory.pluginRootNames]) providerRootName(`${root}/surface`, `${label} root ${root}`)
  for (const name of [...inventory.instructionNames, ...inventory.instructionOverrideNames]) instructionName(name, `${label} instruction ${name}`)
  for (const path of inventory.configPaths) {
    if (!/^\.(?:[A-Za-z0-9][A-Za-z0-9_.@-]*|[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.@/-]+)$/.test(path)) {
      throw new Error(`${label}.configPaths contains an unsafe discovery path:${path}`)
    }
    assertRepositoryPath(path, `${label}.configPaths ${path}`)
  }
  return inventory
}

function nativeHookExclusion(provider) {
  return (provider.adapter.exclusions || []).filter((item) => item.scope === 'native-hooks')
}

function repositoryManagedTrees(provider) {
  return provider.adapter.repositoryManagedTrees || {}
}

function productManagedTrees(provider) {
  return provider.adapter.productManagedTrees || {}
}

function managedProductSurfaces(provider, registry) {
  const surfaces = new Map()
  const add = (path, kind) => {
    if (!path) return
    const prior = surfaces.get(path)
    if (prior) throw new Error(`${provider.id}:${path} has multiple product managed surface owners (${prior}/${kind})`)
    surfaces.set(path, kind)
  }
  const instructionMaterializer = resolveProviderMaterializer(registry, 'instructionViews', provider.adapter.instructionView.materializerId, `${provider.id}.adapter.instructionView.materializerId`)
  if (instructionMaterializer.engine !== 'shared-instruction-v1') add(provider.instructionEntry, 'file')
  if (provider.hookConfig) add(provider.hookConfig, 'file')
  if (provider.adapter.skillView) add(provider.skillDirectory, 'tree')
  for (const record of Object.values(productManagedTrees(provider))) add(record?.destination, 'tree')
  const compatibility = registry.canonical.compatibilityProjections?.legacyClaudeInstruction
  if (compatibility?.providerId === provider.id) {
    for (const category of compatibility.discoveryCategories || []) {
      for (const entry of category.entries || []) add(`${category.destinationRoot}/${entry}`, 'file')
    }
  }
  return [...surfaces].map(([path, kind]) => ({ path, kind }))
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

function activeCompatibilityManagedSurfaces(registry, activeProviderIds) {
  const compatibility = registry.canonical.compatibilityProjections
  const surfaces = []
  const add = (providerId, path, kind, label) => {
    if (!activeProviderIds.has(providerId)) return
    assertRepositoryPath(path, label)
    surfaces.push({ providerId, path, kind, label })
  }
  const legacyInstruction = compatibility.legacyClaudeInstruction
  for (const category of legacyInstruction.discoveryCategories || []) {
    for (const entry of category.entries || []) {
      add(
        legacyInstruction.providerId,
        `${category.destinationRoot}/${entry}`,
        'file',
        `canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories.${category.name}.destination leaf`,
      )
      add(
        legacyInstruction.providerId,
        `${category.artifactRoot}/${entry}`,
        'file',
        `canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories.${category.name}.artifact leaf`,
      )
    }
  }
  const legacyCorpus = compatibility.legacyCodexCorpus
  add(legacyCorpus.providerId, legacyCorpus.hookArtifact, 'file', 'canonical.compatibilityProjections.legacyCodexCorpus.hookArtifact')
  add(legacyCorpus.providerId, legacyCorpus.skillArtifactRoot, 'tree', 'canonical.compatibilityProjections.legacyCodexCorpus.skillArtifactRoot')
  const marketplace = compatibility.marketplacePluginTransport
  add(marketplace.providerId, marketplace.hookOutput, 'file', 'canonical.compatibilityProjections.marketplacePluginTransport.hookOutput')
  return surfaces
}

function validateRetiredProvider(record, currentIds, activeProviderSurfaces, activeOutputs, seenRetiredIds, seenTombstonePaths) {
  if (seenRetiredIds.has(record.id)) throw new Error(`retired provider id is duplicated:${record.id}`)
  if (currentIds.has(record.id)) throw new Error(`retired provider id remains active:${record.id}`)
  seenRetiredIds.add(record.id)
  if (record.replacementProviderId !== null && (!activeProviderSurfaces.has(record.replacementProviderId) || record.replacementProviderId === record.id)) {
    throw new Error(`${record.id}:replacementProviderId must name a distinct active current provider`)
  }
  if (!EXACT_SEMVER.test(record.retiredInVersion)) throw new Error(`${record.id}.retiredInVersion must be exact semver`)
  validateDiscoveryInventory(record.discovery, `canonical.retiredProviders.${record.id}.discovery`)
  const canonicalSurfaces = [...record.surfaces].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  if (JSON.stringify(record.surfaces) !== JSON.stringify(canonicalSurfaces)) {
    throw new Error(`${record.id}.surfaces must be sorted by path`)
  }
  const transfers = record.transfers || []
  const canonicalTransfers = [...transfers].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  if (JSON.stringify(transfers) !== JSON.stringify(canonicalTransfers)) {
    throw new Error(`${record.id}.transfers must be sorted by path`)
  }
  if (!record.surfaces.length && !transfers.length) throw new Error(`${record.id}:retirement must delete or transfer at least one surface`)
  if (record.replacementProviderId === null && transfers.length) throw new Error(`${record.id}:null replacementProviderId cannot transfer surfaces`)
  const partitionPaths = [...record.surfaces, ...transfers].map((surface) => surface.path)
  if (partitionPaths.length !== new Set(partitionPaths).size) {
    throw new Error(`${record.id}:deletion/transfer partition contains a duplicate surface path`)
  }
  const roots = new Set([...record.discovery.providerRootNames, ...record.discovery.pluginRootNames])
  const instructionNames = new Set([...record.discovery.instructionNames, ...record.discovery.instructionOverrideNames])
  const configPaths = new Set(record.discovery.configPaths)
  const validatePriorSurface = (surface, field) => {
    assertRepositoryPath(surface.path, `${record.id}.${field}.${surface.path}`)
    const root = surface.path.split('/')[0]
    const name = surface.path.split('/').at(-1)
    const represented = roots.has(root) || instructionNames.has(name) || configPaths.has(surface.path)
    if (!represented) throw new Error(`${record.id}.${field} path is not represented by its retired discovery inventory:${surface.path}`)
    if (surface.kind === 'tree' && !roots.has(root)) {
      throw new Error(`${record.id}.${field} tree must live below a retired provider/plugin root:${surface.path}`)
    }
  }
  for (const surface of record.surfaces) {
    validatePriorSurface(surface, 'surfaces')
    if (seenTombstonePaths.has(surface.path)) throw new Error(`retired provider surface path is duplicated:${surface.path}`)
    seenTombstonePaths.add(surface.path)
    if (activeOutputs.some((path) => overlaps(path, surface.path))) {
      throw new Error(`retired provider surface overlaps an active provider output:${record.id}:${surface.path}`)
    }
  }
  const replacementSurfaces = record.replacementProviderId === null ? [] : activeProviderSurfaces.get(record.replacementProviderId)
  for (const surface of transfers) {
    validatePriorSurface(surface, 'transfers')
    if (!replacementSurfaces.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
      throw new Error(`${record.id}:transfer is not exactly owned by replacement ${record.replacementProviderId}:${surface.path}`)
    }
    for (const [providerId, ownedSurfaces] of activeProviderSurfaces) {
      if (providerId !== record.replacementProviderId && ownedSurfaces.some((candidate) => overlaps(candidate.path, surface.path))) {
        throw new Error(`${record.id}:transfer is also owned by non-replacement provider ${providerId}:${surface.path}`)
      }
    }
  }
}

export function buildProviderDiscoveryPolicy(registry) {
  const policy = {}
  for (const key of DISCOVERY_KEYS) {
    policy[key] = [...new Set([
      ...(registry.canonical.reservedDiscovery[key] || []),
      ...registry.providers.flatMap((provider) => provider.adapter.discovery[key] || []),
      ...(registry.canonical.retiredProviders || []).flatMap((provider) => provider.discovery[key] || []),
    ])].sort()
  }
  return { schemaVersion: 1, ...policy }
}

export function buildProviderLifecycle(registry) {
  return {
    schemaVersion: 1,
    retiredProviders: structuredClone(registry.canonical.retiredProviders || []),
  }
}

// This function is the one semantic implementation used by both the development Ajv validator
// and the dependency-free clean-plugin facade. Keeping it free of filesystem/package imports makes
// cross-record behavior identical in every runtime instead of relying on mutation-test sampling.
export function validateProviderRegistrySemantics(registry) {
  for (const [name, value] of Object.entries(registry.canonical.roots)) assertRepositoryPath(value, `canonical.roots.${name}`)
  assertRepositoryPath(registry.canonical.hookRegistrations, 'canonical.hookRegistrations')
  assertRepositoryPath(registry.canonical.skillSemantics, 'canonical.skillSemantics')
  assertRepositoryPath(registry.canonical.productSharedInstructionSource, 'canonical.productSharedInstructionSource')
  validateMaterializerCatalog(registry)
  validateDiscoveryInventory(registry.canonical.reservedDiscovery, 'canonical.reservedDiscovery')
  const ids = new Set()
  const destructiveOutputs = []
  const standaloneOutputs = []
  const activeOutputs = []
  for (const provider of registry.providers) {
    if (ids.has(provider.id)) throw new Error(`provider id is duplicated:${provider.id}`)
    ids.add(provider.id)
    if (provider.blockingExitCode === 70) {
      throw new Error(`${provider.id}.blockingExitCode must not reuse reserved governance integrity exit code 70`)
    }
    if (provider.providerKind === 'concrete-runtime' && !provider.runtime) {
      throw new Error(`${provider.id}:concrete-runtime provider requires runtime identity metadata`)
    }
    if (provider.providerKind === 'headless-protocol') {
      if (provider.runtime !== null || provider.capabilities.nativeHooks || provider.adapter.generate) {
        throw new Error(`${provider.id}:headless-protocol must remain runtime-free, hookless, and non-materialized`)
      }
    }
    validateDiscoveryInventory(provider.adapter.discovery, `${provider.id}.adapter.discovery`)
    const declaredRoots = new Set(provider.adapter.discovery.providerRootNames)
    const requiredRoots = new Set([
      providerRootName(provider.skillDirectory, `${provider.id}.skillDirectory`),
      ...Object.entries(repositoryManagedTrees(provider)).map(([name, value]) => providerRootName(value, `${provider.id}.adapter.repositoryManagedTrees.${name}`)),
      ...Object.entries(productManagedTrees(provider)).map(([name, record]) => providerRootName(record.destination, `${provider.id}.adapter.productManagedTrees.${name}.destination`)),
      ...(provider.hookConfig ? [providerRootName(provider.hookConfig, `${provider.id}.hookConfig`)] : []),
      ...(provider.adapter.skillView ? [providerRootName(provider.adapter.skillView.directory, `${provider.id}.adapter.skillView.directory`)] : []),
      ...(provider.adapter.hookView ? [providerRootName(provider.adapter.hookView.output, `${provider.id}.adapter.hookView.output`)] : []),
    ])
    for (const root of requiredRoots) {
      if (!declaredRoots.has(root)) throw new Error(`${provider.id}.adapter.discovery.providerRootNames must declare generated root:${root}`)
    }
    const primaryInstruction = instructionName(provider.instructionEntry, `${provider.id}.instructionEntry`)
    if (!provider.adapter.discovery.instructionNames.includes(primaryInstruction)) {
      throw new Error(`${provider.id}.adapter.discovery.instructionNames must declare primary instruction:${primaryInstruction}`)
    }
    if (provider.hookConfig && !provider.adapter.discovery.configPaths.includes(provider.hookConfig)) {
      throw new Error(`${provider.id}.adapter.discovery.configPaths must declare hook config:${provider.hookConfig}`)
    }
    const toolInputAlias = provider.adapter.environmentMap.GOVERNANCE_TOOL_INPUT
    if (toolInputAlias !== undefined && !/^[A-Z][A-Z0-9_]*_TOOL_INPUT$/.test(toolInputAlias)) {
      throw new Error(`${provider.id}.adapter.environmentMap.GOVERNANCE_TOOL_INPUT must use the *_TOOL_INPUT payload alias convention`)
    }
    for (const field of ['instructionEntry', 'sharedInstructionEntry']) assertRepositoryPath(provider[field], `${provider.id}.${field}`)
    assertAdapterOutputPath(provider.skillDirectory, `${provider.id}.skillDirectory`)
    if (provider.hookConfig !== null) assertAdapterOutputPath(provider.hookConfig, `${provider.id}.hookConfig`)
    if (provider.hookEntrypoint !== null) assertRepositoryPath(provider.hookEntrypoint, `${provider.id}.hookEntrypoint`)
    if (provider.runtime) {
      validateProviderTranscript(provider)
    }
    if (provider.adapter.repositoryInstructionSource !== null) {
      assertRepositoryPath(provider.adapter.repositoryInstructionSource, `${provider.id}.adapter.repositoryInstructionSource`)
    }
    const instructionMaterializer = resolveProviderMaterializer(registry, 'instructionViews', provider.adapter.instructionView.materializerId, `${provider.id}.adapter.instructionView.materializerId`)
    if (instructionMaterializer.engine === 'shared-instruction-v1') {
      if (provider.instructionEntry !== provider.sharedInstructionEntry) throw new Error(`${provider.id}:shared instruction materializer requires instructionEntry to equal sharedInstructionEntry`)
      if (provider.adapter.repositoryInstructionSource !== null) throw new Error(`${provider.id}:shared instruction materializer forbids a repository instruction supplement`)
    } else if (instructionMaterializer.engine === 'markdown-relative-at-import-v1') {
      if (!provider.adapter.generate) throw new Error(`${provider.id}:relative-import instruction materializer requires adapter generation`)
      if (provider.instructionEntry === provider.sharedInstructionEntry) throw new Error(`${provider.id}:relative-import instruction materializer requires a distinct instructionEntry`)
      if (instructionMaterializer.supplementPolicy === 'required' && provider.adapter.repositoryInstructionSource === null) {
        throw new Error(`${provider.id}:instruction materializer requires a repository instruction supplement`)
      }
      standaloneOutputs.push({ provider: provider.id, path: provider.instructionEntry, label: 'instructionEntry' })
    }
    if (provider.adapter.productInstructionSource !== null) assertRepositoryPath(provider.adapter.productInstructionSource, `${provider.id}.adapter.productInstructionSource`)
    for (const [name, value] of Object.entries(repositoryManagedTrees(provider))) {
      if (!Object.hasOwn(registry.canonical.roots, name)) {
        throw new Error(`${provider.id}.adapter.repositoryManagedTrees.${name} has no canonical source root`)
      }
      assertAdapterOutputPath(value, `${provider.id}.adapter.repositoryManagedTrees.${name}`)
      if (provider.adapter.generate) destructiveOutputs.push({ provider: provider.id, path: value, label: `repositoryManagedTrees.${name}` })
    }
    for (const [name, record] of Object.entries(productManagedTrees(provider))) {
      assertRepositoryPath(record.sourceRoot, `${provider.id}.adapter.productManagedTrees.${name}.sourceRoot`)
      assertAdapterOutputPath(record.destination, `${provider.id}.adapter.productManagedTrees.${name}.destination`)
      const materializer = resolveProviderMaterializer(registry, 'treeViews', record.materializerId, `${provider.id}.adapter.productManagedTrees.${name}.materializerId`)
      if (!materializer.transformPolicies.includes(record.transformPolicy)) throw new Error(`${provider.id}.adapter.productManagedTrees.${name}.transformPolicy is unsupported by ${record.materializerId}`)
    }
    if (provider.adapter.skillView) {
      assertAdapterOutputPath(provider.adapter.skillView.directory, `${provider.id}.adapter.skillView.directory`)
      if (provider.adapter.skillView.directory !== provider.skillDirectory) throw new Error(`${provider.id}:skillView.directory must equal skillDirectory`)
      resolveProviderMaterializer(registry, 'skillViews', provider.adapter.skillView.materializerId, `${provider.id}.adapter.skillView.materializerId`)
      if (provider.adapter.generate) destructiveOutputs.push({ provider: provider.id, path: provider.adapter.skillView.directory, label: 'skillView.directory' })
    }
    if (provider.adapter.hookView) {
      assertAdapterOutputPath(provider.adapter.hookView.output, `${provider.id}.adapter.hookView.output`)
      if (provider.adapter.hookView.output !== provider.hookConfig) throw new Error(`${provider.id}:hookView.output must equal hookConfig`)
      const materializer = resolveProviderMaterializer(registry, 'hookViews', provider.adapter.hookView.materializerId, `${provider.id}.adapter.hookView.materializerId`)
      if (provider.adapter.generate) standaloneOutputs.push({ provider: provider.id, path: provider.adapter.hookView.output, label: 'hookView.output' })
      if (provider.adapter.hookView.settingsTemplate !== null) assertRepositoryPath(provider.adapter.hookView.settingsTemplate, `${provider.id}.adapter.hookView.settingsTemplate`)
      const baseTemplateContract = materializer.baseTemplateContract === null
        ? null
        : resolveProviderMaterializer(registry, 'hookBaseTemplateContracts', materializer.baseTemplateContract, `${provider.id}.adapter.hookView baseTemplateContract`)
      if (baseTemplateContract && provider.adapter.hookView.settingsTemplate === null) {
        throw new Error(`${provider.id}:hook materializer requires a settings template`)
      }
      if (!baseTemplateContract && provider.adapter.hookView.settingsTemplate !== null) {
        throw new Error(`${provider.id}:hook materializer forbids a settings template`)
      }
      if (baseTemplateContract?.source && provider.adapter.hookView.settingsTemplate !== baseTemplateContract.source) {
        throw new Error(`${provider.id}:hook settings template differs from its registered base template contract`)
      }
      const supportedEvents = provider.adapter.hookView.supportedEvents
      const bindingKeys = Object.keys(provider.adapter.hookView.eventBindings || {})
      if (
        new Set(supportedEvents).size !== supportedEvents.length
        || new Set(bindingKeys).size !== bindingKeys.length
        || bindingKeys.length !== supportedEvents.length
        || supportedEvents.some((event) => !bindingKeys.includes(event))
      ) throw new Error(`${provider.id}.adapter.hookView.eventBindings must exactly cover supportedEvents`)
      const nativeEvents = supportedEvents.map((event) => projectProviderNativeEvent(provider, event))
      if (new Set(nativeEvents).size !== nativeEvents.length) {
        throw new Error(`${provider.id}.adapter.hookView.eventBindings must map canonical events to unique native events`)
      }
      for (const [index, nativeEvent] of nativeEvents.entries()) {
        const canonicalEvent = supportedEvents[index]
        if (provider.normalization.eventAliases?.[compactEventKey(nativeEvent)] !== canonicalEvent) {
          throw new Error(`${provider.id}.adapter.hookView.eventBindings.${canonicalEvent} is not normalized back from native event ${nativeEvent}`)
        }
      }
      if (provider.adapter.hookView.workingDirectoryPolicy !== 'repository-root') throw new Error(`${provider.id}.adapter.hookView working directory policy must be repository-root`)
    }
    const exclusions = nativeHookExclusion(provider)
    if (provider.capabilities.nativeHooks) {
      if (provider.capabilities.hookEnforcement !== 'native-feedback-plus-ci') throw new Error(`${provider.id}:native hooks require native-feedback-plus-ci enforcement`)
      if (!provider.hookConfig || provider.hookConfigFormat !== 'json' || !provider.hookEntrypoint || !provider.adapter.hookView) {
        throw new Error(`${provider.id}:native hook capability requires complete hook wiring`)
      }
      if (exclusions.length) throw new Error(`${provider.id}:native hook capability cannot declare a native-hooks exclusion`)
      if (provider.adapter.generate && !provider.runtime) throw new Error(`${provider.id}:native hook adapter requires provider runtime metadata`)
    } else {
      if (provider.capabilities.hookEnforcement !== 'ci-only') throw new Error(`${provider.id}:no-hook providers require ci-only enforcement`)
      if (provider.hookConfig !== null || provider.hookConfigFormat !== null || provider.hookEntrypoint !== null || provider.adapter.hookView !== null) {
        throw new Error(`${provider.id}:provider without native hooks must not declare native hook wiring`)
      }
      if (exclusions.length !== 1 || !['NATIVE_HOOK_API_UNAVAILABLE', 'NATIVE_HOOKS_DISABLED_BY_POLICY'].includes(exclusions[0].reasonCode)) {
        throw new Error(`${provider.id}:provider without native hooks requires one explicit native-hooks exclusion`)
      }
    }
    if (provider.adapter.generate && provider.adapter.productInstructionSource === null) throw new Error(`${provider.id}:generated adapter requires a productInstructionSource`)
    if (provider.adapter.generate && provider.adapter.skillView === null) throw new Error(`${provider.id}:generated adapter requires a registered skillView so canonical skills cannot silently disappear`)
    if (!provider.adapter.generate && provider.adapter.repositoryInstructionSource !== null) throw new Error(`${provider.id}:disabled adapter must not declare a repositoryInstructionSource`)
    if (!provider.adapter.generate && provider.adapter.productInstructionSource !== null) throw new Error(`${provider.id}:disabled adapter must not declare a productInstructionSource`)
    if (provider.adapter.generate && instructionMaterializer.engine === 'shared-instruction-v1' && !provider.adapter.skillView && !provider.adapter.hookView && !Object.keys(repositoryManagedTrees(provider)).length) {
      throw new Error(`${provider.id}:generated adapter has no declared output`)
    }
    if (!provider.adapter.generate && !(provider.adapter.exclusions || []).length) throw new Error(`${provider.id}:disabled adapter requires a machine-readable exclusion`)
    if (provider.adapter.generate) {
      if (instructionMaterializer.engine !== 'shared-instruction-v1') activeOutputs.push(provider.instructionEntry)
      if (provider.adapter.skillView) activeOutputs.push(provider.skillDirectory)
      if (provider.hookConfig) activeOutputs.push(provider.hookConfig)
      activeOutputs.push(...Object.values(repositoryManagedTrees(provider)))
      activeOutputs.push(...Object.values(productManagedTrees(provider)).map((record) => record.destination))
    }
  }
  for (let left = 0; left < destructiveOutputs.length; left += 1) {
    for (let right = left + 1; right < destructiveOutputs.length; right += 1) {
      if (overlaps(destructiveOutputs[left].path, destructiveOutputs[right].path)) {
        throw new Error(`provider destructive output roots overlap:${destructiveOutputs[left].provider}:${destructiveOutputs[left].path} <> ${destructiveOutputs[right].provider}:${destructiveOutputs[right].path}`)
      }
    }
  }
  for (const file of standaloneOutputs) for (const root of destructiveOutputs) {
    if (overlaps(file.path, root.path)) throw new Error(`provider output file/root overlap:${file.provider}:${file.path} <> ${root.provider}:${root.path}`)
  }
  for (let left = 0; left < standaloneOutputs.length; left += 1) for (let right = left + 1; right < standaloneOutputs.length; right += 1) {
    if (standaloneOutputs[left].path === standaloneOutputs[right].path) {
      throw new Error(`provider standalone output collision:${standaloneOutputs[left].provider}:${standaloneOutputs[left].path} <> ${standaloneOutputs[right].provider}:${standaloneOutputs[right].path}`)
    }
  }
  for (const provider of registry.providers) for (const [skill, binding] of Object.entries(provider.adapter.skillBindings || {})) {
    if (binding.self !== provider.id) throw new Error(`${provider.id}:${skill} self binding must equal provider id`)
    if (Object.hasOwn(binding, 'peer')) throw new Error(`${provider.id}:${skill} must not fix a peer provider`)
    const selectionPolicy = registry.canonical.reviewSelectionPolicies?.[binding.selectionPolicy]
    if (!selectionPolicy || !selectionPolicy.reviewClasses?.[binding.reviewClass]) {
      throw new Error(`${provider.id}:${skill} requires a registered capability selection policy and review class`)
    }
    if (['deep-audit-cross-codex', 'independent-review'].includes(skill)
      && binding.certificationContract !== 'exact-provider-runtime-surface-role-target-v1') {
      throw new Error(`${provider.id}:${skill} requires an exact provider/runtime/surface/role/target certification contract => ADAPTER-BLOCKED`)
    }
    if (['deep-audit-cross-codex', 'independent-review'].includes(skill)
      && binding.transport !== 'content-addressed-model-broker-exchange-v1') {
      throw new Error(`${provider.id}:${skill} must use the canonical portable content-addressed exchange core => ADAPTER-BLOCKED`)
    }
    if (binding.invocation.strategy === 'native-context-fork') {
      const agentTree = Object.values(repositoryManagedTrees(provider)).find((path) => path.endsWith('/agents'))
      if (!agentTree) throw new Error(`${provider.id}:${skill} native context-fork invocation requires a repository-managed agent tree`)
      if (binding.invocation.context !== 'fork' || !binding.invocation.agent) {
        throw new Error(`${provider.id}:${skill} native context-fork invocation is incomplete`)
      }
    }
  }
  const seenRetiredIds = new Set()
  const seenTombstonePaths = new Set()
  const activeProviderSurfaces = new Map(
    registry.providers
      .filter((provider) => provider.adapter.generate)
      .map((provider) => [provider.id, managedProductSurfaces(provider, registry)]),
  )
  const productOwners = [...activeProviderSurfaces].flatMap(([provider, surfaces]) => surfaces.map((surface) => ({ provider, ...surface })))
  for (let left = 0; left < productOwners.length; left += 1) for (let right = left + 1; right < productOwners.length; right += 1) {
    if (overlaps(productOwners[left].path, productOwners[right].path)) {
      throw new Error(`provider product managed surfaces overlap:${productOwners[left].provider}:${productOwners[left].path} <> ${productOwners[right].provider}:${productOwners[right].path}`)
    }
  }
  const retired = registry.canonical.retiredProviders || []
  if (JSON.stringify(retired.map((record) => record.id)) !== JSON.stringify(retired.map((record) => record.id).sort())) {
    throw new Error('canonical.retiredProviders must be sorted by id')
  }
  const compatibility = registry.canonical.compatibilityProjections
  const activeProviderIds = new Set(registry.providers.filter((provider) => provider.adapter.generate).map((provider) => provider.id))
  activeOutputs.push(...activeCompatibilityManagedSurfaces(registry, activeProviderIds).map((surface) => surface.path))
  for (const record of retired) validateRetiredProvider(record, ids, activeProviderSurfaces, activeOutputs, seenRetiredIds, seenTombstonePaths)
  const compatibilityProviderIds = [
    compatibility.legacyClaudeInstruction.providerId,
    compatibility.legacyCodexCorpus.providerId,
    compatibility.marketplacePluginTransport.providerId,
  ]
  for (const providerId of compatibilityProviderIds) {
    if (!ids.has(providerId) && !seenRetiredIds.has(providerId)) {
      throw new Error(`compatibility projection references an unknown active/retired provider:${providerId}`)
    }
  }
  const compatibilityCategories = compatibility.legacyClaudeInstruction.discoveryCategories
  const compatibilityCategoryNames = compatibilityCategories.map((category) => category.name)
  if (JSON.stringify(compatibilityCategoryNames) !== JSON.stringify([...new Set(compatibilityCategoryNames)].sort())) {
    throw new Error('canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories must be sorted and unique by name')
  }
  for (const category of compatibilityCategories) {
    assertRepositoryPath(category.sourceRoot, `compatibility discovery category ${category.name}.sourceRoot`)
    assertRepositoryPath(category.artifactRoot, `compatibility discovery category ${category.name}.artifactRoot`)
    assertAdapterOutputPath(category.destinationRoot, `compatibility discovery category ${category.name}.destinationRoot`)
    if (!exactSortedUniqueStrings(category.entries)) {
      throw new Error(`compatibility discovery category ${category.name}.entries must be sorted and unique`)
    }
    if (category.name === 'commands' && category.sourceRoot !== registry.canonical.roots.commands) {
      throw new Error('compatibility commands sourceRoot must equal canonical.roots.commands')
    }
  }
  const compatibilityTombstones = compatibility.legacyClaudeInstruction.legacyProductTreeTombstones
  if (!exactSortedUniqueStrings(compatibilityTombstones)) throw new Error('canonical.compatibilityProjections.legacyClaudeInstruction.legacyProductTreeTombstones must be sorted and unique')
  for (const path of compatibilityTombstones) assertAdapterOutputPath(path, 'legacy product tree tombstone')
  for (let left = 0; left < compatibilityTombstones.length; left += 1) for (let right = left + 1; right < compatibilityTombstones.length; right += 1) {
    if (overlaps(compatibilityTombstones[left], compatibilityTombstones[right])) throw new Error(`legacy product tree tombstones overlap:${compatibilityTombstones[left]}:${compatibilityTombstones[right]}`)
  }
  if (!registry.canonical.hookRegistrations.startsWith(`${registry.canonical.roots.hooks}/`)) {
    throw new Error('canonical.hookRegistrations must be contained by canonical.roots.hooks')
  }
  assertRepositoryPath(compatibility.legacyCodexCorpus.hookArtifact, 'canonical.compatibilityProjections.legacyCodexCorpus.hookArtifact')
  assertRepositoryPath(compatibility.legacyCodexCorpus.skillArtifactRoot, 'canonical.compatibilityProjections.legacyCodexCorpus.skillArtifactRoot')
  assertRepositoryPath(compatibility.marketplacePluginTransport.hookOutput, 'canonical.compatibilityProjections.marketplacePluginTransport.hookOutput')
  assertRepositoryPath(compatibility.marketplacePluginTransport.aliasRegistry, 'canonical.compatibilityProjections.marketplacePluginTransport.aliasRegistry')
  assertRepositoryPath(compatibility.marketplacePluginTransport.targetRoleManifest, 'canonical.compatibilityProjections.marketplacePluginTransport.targetRoleManifest')
  if (
    compatibility.marketplacePluginTransport.schemaVersion !== 2
    || compatibility.marketplacePluginTransport.profileId !== 'claude-authority-full'
    || compatibility.marketplacePluginTransport.pluginFullId !== 'design-system@qijenchen-ds'
    || compatibility.marketplacePluginTransport.repositoryRole !== 'authority'
    || compatibility.marketplacePluginTransport.governanceRole !== 'ds-author'
    || compatibility.marketplacePluginTransport.projection !== 'full-canonical-registrations'
    || compatibility.marketplacePluginTransport.targetRoleManifest !== 'packages/governance/canonical/manifest.json'
  ) {
    throw new Error('canonical.compatibilityProjections.marketplacePluginTransport must remain the named authority-only full-corpus projection')
  }
  return registry
}

export function validateHookRegistrationSemantics(registrations) {
  for (const [event, groups] of Object.entries(registrations.hooks)) {
    const descriptors = new Set()
    for (const [groupIndex, group] of groups.entries()) {
      const tokens = group.matcher ? group.matcher.split('|') : []
      if (new Set(tokens).size !== tokens.length) throw new Error(`${event}[${groupIndex}].matcher contains a duplicate matcher token`)
      for (const descriptor of group.hooks) {
        const identity = `hook:${descriptor.hook}`
        if (descriptors.has(identity)) throw new Error(`${event} contains duplicate/ambiguous descriptor ${identity}; combine its matcher into one canonical registration`)
        const peerRequirements = (descriptor.requires || []).filter((requirement) => requirement === 'peer-review-binding' || requirement === 'peer-cli')
        if (peerRequirements.length && typeof descriptor.reviewSkill !== 'string') {
          throw new Error(`${event}/${descriptor.hook} peer requirements must declare the reviewSkill they consume`)
        }
        if (!peerRequirements.length && descriptor.reviewSkill !== undefined) {
          throw new Error(`${event}/${descriptor.hook} reviewSkill is allowed only with a peer requirement`)
        }
        descriptors.add(identity)
      }
    }
  }
  return registrations
}
