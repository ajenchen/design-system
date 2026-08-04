import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  harnessMemberCommand,
  harnessSuiteCommand,
  readHarnessSourceInventory,
  validateHarnessSourceInventory,
} from './harness-source-inventory.mjs'
import {
  createGateMetaTestInventory,
  discoverCheckerGates,
} from '../../../scripts/lib/gate-meta-test-inventory.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
export const REQUIRED_HARNESS_DOMAINS = Object.freeze([
  'install',
  'upgrade',
  'rollback',
  'process-crash',
  'provider-lifecycle',
  'cloud',
  'template-consumer',
  'second-opinion',
  'mirror',
  'release',
  'fleet',
  'evidence',
  'fake-green',
])
export const HARNESS_DOMAIN_TAXONOMY = Object.freeze({
  version: '1.0.0',
  mandatoryCoreBinding: 'requiredDomains-is-ordered-minimum',
  extensionDomainPattern: '^x-[a-z0-9]+(?:-[a-z0-9]+)*$',
  extensionPolicy: 'append-only-unique-extension-entry-never-replaces-reorders-or-dilutes-core',
})
const EXTENSION_DOMAIN_PATTERN = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/
const REVIEWED_AUTHORITY_FAMILY_ROOTS = Object.freeze({
  'template-consumer': Object.freeze(['packages/design-system/ds-canonical/templates']),
})
export const HARNESS_AUTHORITY_CONTRACT_PATH = 'infra/governance/providers/harness-authority-contracts.json'
export const HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH = 'infra/governance/schemas/harness-authority-contracts.schema.json'
const HARNESS_AUTHORITY_CONTRACT_KIND = 'provider-neutral-governance-harness-authority-contracts'
const HARNESS_AUTHORITY_CONTRACT_SCHEMA_VERSION = 2
const HARNESS_AUTHORITY_CONTRACT_CLOSURE_POLICY = 'every-registry-claim-is-bound-to-exact-manifest-sources-and-executed-test-owners'
const HARNESS_AUTHORITY_PROJECTION_POLICY = 'registry-authority-and-claim-fields-are-exact-derived-projections'
const HARNESS_SHARED_AUTHORITY_POLICY = 'shared-closures-live-once-in-the-authority-contract-and-are-not-duplicated-across-domain-authority-paths'
const CLOSED_TOOL_SHARED_AUTHORITY = Object.freeze({
  id: 'closed-tool-execution',
  kind: 'canonical-byte-exact-shared-runtime',
  canonicalSourceId: 'exact-closed-tool-execution-library',
  canonicalPath: 'packages/governance/src/closed-tool-execution.mjs',
  adapter: Object.freeze({
    sourceId: 'exact-closed-tool-execution-authority-adapter',
    path: 'scripts/lib/closed-tool-execution.mjs',
    contract: 'single-static-re-export',
    moduleSpecifier: '../../packages/governance/src/closed-tool-execution.mjs',
  }),
  directProjections: Object.freeze([
    Object.freeze({
      id: 'fork-common-runtime',
      path: 'packages/design-system/ds-canonical/fork/common/closed-tool-execution.mjs',
      builderSourceId: 'exact-fork-governance-builder',
      builderLiteral: 'common/closed-tool-execution.mjs',
      comparison: 'canonical-byte-exact',
      corpusLockEntry: 'common/closed-tool-execution.mjs',
    }),
    Object.freeze({
      id: 'fork-consumer-runtime',
      path: 'packages/design-system/ds-canonical/fork/consumer/lib/closed-tool-execution.mjs',
      builderSourceId: 'exact-fork-governance-builder',
      builderLiteral: 'consumer/lib/closed-tool-execution.mjs',
      comparison: 'canonical-byte-exact',
      corpusLockEntry: 'consumer/lib/closed-tool-execution.mjs',
    }),
  ]),
  managedFileProjection: Object.freeze({
    id: 'fork-consumer-managed-runtime',
    destination: 'scripts/lib/closed-tool-execution.mjs',
    artifactRoot: 'packages/design-system/ds-canonical/fork/consumer/managed-files',
    builderSourceId: 'exact-fork-governance-builder',
    comparison: 'canonical-byte-exact',
  }),
  externalMirrorProjection: Object.freeze({
    builderSourceId: 'exact-published-template-mirror-builder',
    policySourceId: 'exact-published-template-mirror-policy',
    destination: 'scripts/lib/closed-tool-execution.mjs',
    comparison: 'canonical-byte-exact',
  }),
  packageDelivery: Object.freeze({
    manifestSourceId: 'governance-package-contract',
    packageName: '@qijenchen/governance',
    filesRoot: 'src',
    exportSubpath: './closed-tool-execution',
    exportTarget: './src/closed-tool-execution.mjs',
    archiveBuilderSourceId: 'release-bom-builder',
    archiveEntry: 'package/src/closed-tool-execution.mjs',
    packExecutionOwner: Object.freeze({ kind: 'test-path', path: 'scripts/test-release-bom.mjs' }),
  }),
  executedTestOwnerPaths: Object.freeze([
    'infra/governance/test/harness-registry.test.mjs',
    'scripts/test-consumer-governance.mjs',
    'scripts/test-fork-governance.mjs',
    'scripts/test-product-template-scaffold-lock.mjs',
    'scripts/test-release-bom.mjs',
  ]),
  claims: Object.freeze({
    proves: Object.freeze([
      'One canonical closed-tool runtime is byte-exact across the fork corpus, product template, authenticated managed-file artifact and npm package, while the authority-side root remains a single static re-export.',
      'The published-template mirror mapping and npm archive required-entry check are bound to executed Harness owners rather than inferred from source presence.',
    ]),
    doesNotProve: Object.freeze([
      'A local byte-exact projection proves neither that an external published-template repository has accepted the mirror nor that an npm registry release is active.',
    ]),
  }),
  corpusLockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
  forkManifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
  forkConsumerLockPath: 'packages/design-system/ds-canonical/fork/consumer/lock.json',
  templateConsumerLockPath: 'template/ds-product-template/governance/lock.json',
})
const GOVERNANCE_BUILD_GRAPH_PATH = 'scripts/governance-build-graph.json'
const SOURCE_INVENTORY_PATH = 'infra/governance/providers/harness-source-inventory.json'
const ALL_HARNESS_RUNNER = ['node', 'infra/governance/bin/run-harnesses.mjs']
const SUITE_RUNNER_PATH = 'infra/governance/bin/run-harness-suite.mjs'
const CANONICAL_HOOK_SUITE = ['node', SUITE_RUNNER_PATH, '--suite', 'canonical-hook-behavioral']
const META_RUNNER = ['node', 'scripts/run-gate-meta-tests.mjs']
const COVERAGE_CHECK = ['node', 'scripts/audit-gate-meta-test-coverage.mjs', '--check']
export const HARNESS_SETUP_OUTER_RESERVE_MS = 60_000

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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function ownerKey(owner) {
  return JSON.stringify(owner)
}

function exactSetProjection(actual, expected, label) {
  invariant(
    JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort()),
    `${label} is not an exact closed projection`,
  )
}

function readExactSharedAuthorityFile(repoRoot, repoPath, label) {
  let path
  try {
    path = resolveRepoPath(repoRoot, repoPath, label, { fileOnly: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${label} is missing:${repoPath}`, { cause: error })
    }
    throw error
  }
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file:${repoPath}`)
  return readFileSync(path)
}

function readExactSharedAuthorityJson(repoRoot, repoPath, label) {
  const bytes = readExactSharedAuthorityFile(repoRoot, repoPath, label)
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) }
  } catch (error) {
    throw new Error(`${label} is not valid JSON:${repoPath}:${error.message}`, { cause: error })
  }
}

function quotedLiteral(source, value) {
  return source.includes(`'${value}'`) || source.includes(`"${value}"`)
}

function manifestSourcePath(manifestById, sourceId, expectedPath, label) {
  const source = manifestById.get(sourceId)
  invariant(source, `${label} source id is absent from the canonical manifest:${sourceId}`)
  invariant(
    source.ownerRepo === 'design-system'
      && source.required === true
      && source.path === expectedPath,
    `${label} canonical manifest binding drifted:${sourceId}`,
  )
  return source.path
}

export function validateHarnessSharedAuthorityClosures(closures, {
  registry,
  repoRoot = DEFAULT_REPO_ROOT,
  manifest,
  ownerCommandByPath = null,
} = {}) {
  invariant(Array.isArray(closures) && closures.length === 1, 'Harness shared authority closure set is not exact')
  const closure = closures[0]
  const expected = CLOSED_TOOL_SHARED_AUTHORITY
  exactKeys(
    closure,
    [
      'id',
      'kind',
      'canonicalSourceId',
      'adapter',
      'directProjections',
      'managedFileProjection',
      'externalMirrorProjection',
      'packageDelivery',
      'executedTestOwners',
      'claims',
    ],
    'Harness closed-tool shared authority closure',
  )
  invariant(
    closure.id === expected.id
      && closure.kind === expected.kind
      && closure.canonicalSourceId === expected.canonicalSourceId,
    'Harness closed-tool shared authority identity drifted',
  )
  invariant(
    JSON.stringify(closure.adapter) === JSON.stringify({
      sourceId: expected.adapter.sourceId,
      contract: expected.adapter.contract,
      moduleSpecifier: expected.adapter.moduleSpecifier,
    }),
    'Harness closed-tool thin adapter contract drifted',
  )
  invariant(
    JSON.stringify(closure.directProjections) === JSON.stringify(expected.directProjections.map(({
      id,
      path,
      builderSourceId,
      comparison,
    }) => ({ id, path, builderSourceId, comparison }))),
    'Harness closed-tool direct projection inventory is incomplete or reordered',
  )
  invariant(
    JSON.stringify(closure.managedFileProjection) === JSON.stringify(expected.managedFileProjection),
    'Harness closed-tool managed-file projection contract drifted',
  )
  invariant(
    JSON.stringify(closure.externalMirrorProjection) === JSON.stringify(expected.externalMirrorProjection),
    'Harness closed-tool external mirror projection contract drifted',
  )
  invariant(
    JSON.stringify(closure.packageDelivery) === JSON.stringify(expected.packageDelivery),
    'Harness closed-tool npm package delivery contract drifted',
  )
  invariant(
    JSON.stringify(closure.executedTestOwners) === JSON.stringify(
      expected.executedTestOwnerPaths.map(path => ({ kind: 'test-path', path })),
    ),
    'Harness closed-tool execution-owner closure is incomplete or reordered',
  )
  invariant(
    JSON.stringify(closure.claims) === JSON.stringify(expected.claims),
    'Harness closed-tool shared claims are not the exact closed projection',
  )

  const manifestDocument = manifest ?? JSON.parse(readExactSharedAuthorityFile(
    repoRoot,
    'packages/governance/canonical/manifest.json',
    'Harness canonical source manifest',
  ).toString('utf8'))
  const manifestSources = Array.isArray(manifestDocument?.sources) ? manifestDocument.sources : []
  const manifestById = new Map(manifestSources.map(source => [source?.id, source]))
  invariant(
    manifestById.size === manifestSources.length,
    'Harness shared authority closure requires unique canonical manifest source ids',
  )
  const canonicalPath = manifestSourcePath(
    manifestById,
    expected.canonicalSourceId,
    expected.canonicalPath,
    'Harness closed-tool canonical implementation',
  )
  const adapterPath = manifestSourcePath(
    manifestById,
    expected.adapter.sourceId,
    expected.adapter.path,
    'Harness closed-tool authority adapter',
  )
  const duplicatedDomainAuthority = registry.entries.flatMap(entry => (
    (entry.authorityPaths || [])
      .filter(path => path === canonicalPath || path === adapterPath)
      .map(path => `${entry.id ?? '<missing>'}:${path}`)
  ))
  invariant(
    duplicatedDomainAuthority.length === 0,
    `Harness shared closed-tool authority was manually duplicated into domain authorityPaths:${duplicatedDomainAuthority.join(',')}`,
  )
  const requiredManifestBindings = new Map([
    ['exact-fork-governance-builder', 'scripts/build-fork-governance.mjs'],
    ['exact-published-template-mirror-builder', 'scripts/build-published-template-mirror.mjs'],
    ['exact-published-template-mirror-policy', 'scripts/published-template-mirror-policy.json'],
    ['governance-package-contract', 'packages/governance/package.json'],
    ['release-bom-builder', 'scripts/build-release-bom.mjs'],
  ])
  for (const [sourceId, path] of requiredManifestBindings) {
    manifestSourcePath(manifestById, sourceId, path, 'Harness closed-tool supporting authority')
  }

  const canonicalBytes = readExactSharedAuthorityFile(
    repoRoot,
    canonicalPath,
    'Harness closed-tool canonical implementation',
  )
  invariant(canonicalBytes.length > 0, 'Harness closed-tool canonical implementation is empty')
  const canonicalSha256 = sha256(canonicalBytes)
  const adapterText = readExactSharedAuthorityFile(
    repoRoot,
    adapterPath,
    'Harness closed-tool authority adapter',
  ).toString('utf8')
  const commentPrefix = adapterText.match(/^(?:\/\/[^\r\n]*(?:\n|$))*/)?.[0] ?? ''
  invariant(
    adapterText.slice(commentPrefix.length) === `export * from '${expected.adapter.moduleSpecifier}'\n`,
    'Harness closed-tool authority adapter contains behavior beyond the one static re-export',
  )

  const builderSourceCache = new Map()
  const builderSource = (sourceId) => {
    if (!builderSourceCache.has(sourceId)) {
      const sourcePath = manifestById.get(sourceId).path
      builderSourceCache.set(sourceId, readExactSharedAuthorityFile(
        repoRoot,
        sourcePath,
        `Harness closed-tool projection builder ${sourceId}`,
      ).toString('utf8'))
    }
    return builderSourceCache.get(sourceId)
  }
  const generatedProjectionPaths = []
  for (const projection of expected.directProjections) {
    const projectionBytes = readExactSharedAuthorityFile(
      repoRoot,
      projection.path,
      `Harness closed-tool direct projection ${projection.id}`,
    )
    invariant(
      projectionBytes.equals(canonicalBytes),
      `Harness closed-tool direct projection is not canonical-byte-exact:${projection.id}:${projection.path}`,
    )
    const source = builderSource(projection.builderSourceId)
    invariant(
      quotedLiteral(source, canonicalPath) && quotedLiteral(source, projection.builderLiteral),
      `Harness closed-tool projection builder lacks the exact canonical mapping:${projection.id}`,
    )
    generatedProjectionPaths.push(projection.path)
  }

  const managed = expected.managedFileProjection
  const managedArtifactName = `${sha256(Buffer.from(managed.destination))}.blob`
  const managedArtifactPath = `${managed.artifactRoot}/${managedArtifactName}`
  const managedArtifactBytes = readExactSharedAuthorityFile(
    repoRoot,
    managedArtifactPath,
    'Harness closed-tool authenticated managed-file artifact',
  )
  invariant(
    managedArtifactBytes.equals(canonicalBytes),
    `Harness closed-tool managed-file artifact is not canonical-byte-exact:${managedArtifactPath}`,
  )
  const managedBuilder = builderSource(managed.builderSourceId)
  invariant(
    quotedLiteral(managedBuilder, canonicalPath)
      && quotedLiteral(managedBuilder, managed.destination)
      && quotedLiteral(managedBuilder, 'consumer/managed-files/'),
    'Harness closed-tool managed-file builder mapping is incomplete',
  )
  generatedProjectionPaths.push(managedArtifactPath)

  const { value: corpusLock } = readExactSharedAuthorityJson(
    repoRoot,
    expected.corpusLockPath,
    'Harness fork corpus lock',
  )
  invariant(
    corpusLock?.schemaVersion === 1
      && corpusLock.kind === 'fork-governance-corpus-lock'
      && corpusLock.hashAlgorithm === 'sha256'
      && Array.isArray(corpusLock.entries),
    'Harness fork corpus lock identity is invalid',
  )
  const corpusEntryByFile = new Map(corpusLock.entries.map(entry => [entry?.file, entry]))
  invariant(
    corpusEntryByFile.size === corpusLock.entries.length,
    'Harness fork corpus lock contains duplicate file entries',
  )
  for (const projection of expected.directProjections.filter(item => item.corpusLockEntry)) {
    const entry = corpusEntryByFile.get(projection.corpusLockEntry)
    invariant(
      entry?.sha256 === canonicalSha256
        && entry.source === canonicalPath
        && entry.destination === null,
      `Harness closed-tool fork lock binding is absent or divergent:${projection.corpusLockEntry}`,
    )
  }
  const managedLockEntryPath = `consumer/managed-files/${managedArtifactName}`
  const managedLockEntry = corpusEntryByFile.get(managedLockEntryPath)
  invariant(
    managedLockEntry?.sha256 === canonicalSha256
      && managedLockEntry.source === canonicalPath
      && managedLockEntry.destination === managed.destination,
    'Harness closed-tool managed-file artifact is absent or divergent in the fork corpus lock',
  )

  const { value: forkManifest } = readExactSharedAuthorityJson(
    repoRoot,
    expected.forkManifestPath,
    'Harness fork projection manifest',
  )
  invariant(
    forkManifest?.kind === 'provider-neutral-fork-manifest'
      && forkManifest.consumer?.managedFiles?.[managed.destination] === managedLockEntryPath
      && Array.isArray(forkManifest.consumer?.materialization?.exactPaths)
      && forkManifest.consumer.materialization.exactPaths.filter(path => path === managed.destination).length === 1,
    'Harness closed-tool managed-file projection is absent or divergent in the fork manifest',
  )
  const forkConsumerLock = readExactSharedAuthorityJson(
    repoRoot,
    expected.forkConsumerLockPath,
    'Harness fork consumer governance lock',
  )
  const templateConsumerLock = readExactSharedAuthorityJson(
    repoRoot,
    expected.templateConsumerLockPath,
    'Harness product-template consumer governance lock',
  )
  invariant(
    forkConsumerLock.bytes.equals(templateConsumerLock.bytes),
    'Harness fork and product-template consumer governance locks are not byte-exact',
  )
  for (const [label, lock] of [
    ['fork', forkConsumerLock.value],
    ['product-template', templateConsumerLock.value],
  ]) {
    invariant(
      lock?.payload?.managedFiles?.[managed.destination] === canonicalSha256,
      `Harness closed-tool ${label} consumer lock lacks the canonical managed-file digest`,
    )
  }

  const external = expected.externalMirrorProjection
  const externalBuilder = builderSource(external.builderSourceId)
  invariant(
    quotedLiteral(externalBuilder, canonicalPath)
      && quotedLiteral(externalBuilder, external.destination),
    'Harness closed-tool published-template mirror mapping is incomplete',
  )
  const { value: mirrorPolicy } = readExactSharedAuthorityJson(
    repoRoot,
    manifestById.get(external.policySourceId).path,
    'Harness published-template mirror policy',
  )
  invariant(
    Array.isArray(mirrorPolicy.exactPaths)
      && mirrorPolicy.exactPaths.filter(path => path === external.destination).length === 1
      && !(mirrorPolicy.generatedExactPaths || []).includes(external.destination),
    'Harness closed-tool published-template destination is not one exact static mirror path',
  )

  const packageDelivery = expected.packageDelivery
  const packageManifestPath = manifestById.get(packageDelivery.manifestSourceId).path
  const { value: packageManifest } = readExactSharedAuthorityJson(
    repoRoot,
    packageManifestPath,
    'Harness governance npm package contract',
  )
  const packageRelativeCanonical = `./${relative(
    dirname(resolve(repoRoot, packageManifestPath)),
    resolve(repoRoot, canonicalPath),
  ).split(sep).join('/')}`
  invariant(
    packageManifest.name === packageDelivery.packageName
      && packageManifest.type === 'module'
      && packageRelativeCanonical === packageDelivery.exportTarget
      && packageManifest.exports?.[packageDelivery.exportSubpath] === packageDelivery.exportTarget
      && Array.isArray(packageManifest.files)
      && packageManifest.files.filter(path => path === packageDelivery.filesRoot).length === 1,
    'Harness closed-tool npm files/export contract is absent or divergent',
  )
  invariant(
    packageDelivery.archiveEntry === `package/${packageDelivery.exportTarget.slice(2)}`,
    'Harness closed-tool npm archive entry is not derived from the public export target',
  )
  const archiveBuilder = builderSource(packageDelivery.archiveBuilderSourceId)
  const packageMarkers = [`'${packageDelivery.packageName}'`, `"${packageDelivery.packageName}"`]
  const packageStart = packageMarkers.map(marker => archiveBuilder.indexOf(marker))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]
  invariant(Number.isInteger(packageStart), 'Harness release BOM builder omits the governance package')
  const nextPackageStarts = ["['@", '["@'].map(marker => archiveBuilder.indexOf(marker, packageStart + 1))
    .filter(index => index >= 0)
  const packageEnd = nextPackageStarts.length > 0 ? Math.min(...nextPackageStarts) : archiveBuilder.length
  invariant(
    quotedLiteral(archiveBuilder.slice(packageStart, packageEnd), packageDelivery.archiveEntry),
    `Harness release BOM builder does not require the closed-tool npm archive entry:${packageDelivery.archiveEntry}`,
  )

  const executionTopologyResult = ownerCommandByPath
    ? { ownerCommandByPath }
    : executionTopology(readHarnessSourceInventory(resolve(repoRoot, SOURCE_INVENTORY_PATH)))
  const registeredCommandKeys = new Set(registry.entries.flatMap(entry => entry.commands).map(commandKey))
  for (const owner of closure.executedTestOwners) {
    const command = executionTopologyResult.ownerCommandByPath.get(owner.path)
    invariant(command, `Harness closed-tool execution owner is absent from the source inventory:${owner.path}`)
    invariant(
      registeredCommandKeys.has(commandKey(command)),
      `Harness closed-tool execution owner has no registered Harness command:${owner.path}`,
    )
  }
  invariant(
    ownerKey(packageDelivery.packExecutionOwner) === ownerKey(closure.packageDelivery.packExecutionOwner)
      && closure.executedTestOwners.some(owner => ownerKey(owner) === ownerKey(packageDelivery.packExecutionOwner)),
    'Harness closed-tool npm pack owner is outside the shared execution closure',
  )
  const packTestSource = readExactSharedAuthorityFile(
    repoRoot,
    packageDelivery.packExecutionOwner.path,
    'Harness closed-tool npm pack execution owner',
  ).toString('utf8')
  invariant(
    /\b(?:execFileSync|spawnSync)\s*\(/.test(packTestSource)
      && quotedLiteral(packTestSource, 'pack')
      && quotedLiteral(packTestSource, 'packages/governance'),
    'Harness closed-tool npm pack owner no longer executes a real governance-package pack',
  )

  const manifestAuthorityPaths = new Set(manifestSources.map(source => source?.path))
  for (const projectionPath of generatedProjectionPaths) {
    invariant(
      !manifestAuthorityPaths.has(projectionPath),
      `Harness generated closed-tool projection was promoted to canonical authority:${projectionPath}`,
    )
  }
  return closure
}

function readBoundJsonBytes(repoRoot, repoPath, label) {
  const path = resolveRepoPath(repoRoot, repoPath, label, { fileOnly: true })
  const info = lstatSync(path)
  invariant(info.nlink === 1, `${label} must not be a hard-link alias:${repoPath}`)
  return readFileSync(path)
}

export function readHarnessAuthorityContracts({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const bytes = readBoundJsonBytes(repoRoot, HARNESS_AUTHORITY_CONTRACT_PATH, 'Harness authority contract')
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`Harness authority contract is not valid JSON:${error.message}`, { cause: error })
  }
}

export function validateHarnessAuthorityContractDocument(document, {
  registry,
  repoRoot = DEFAULT_REPO_ROOT,
  manifest,
  inventory,
  ownerCommandByPath = null,
} = {}) {
  invariant(Array.isArray(registry?.entries) && registry.entries.length > 0, 'Harness authority contract requires registry entries')
  const schemaBytes = readBoundJsonBytes(repoRoot, HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH, 'Harness authority contract schema')
  let schema
  try {
    schema = JSON.parse(schemaBytes.toString('utf8'))
  } catch (error) {
    throw new Error(`Harness authority contract schema is not valid JSON:${error.message}`, { cause: error })
  }
  const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validateSchema(document), `Harness authority contract schema failed:${new Ajv2020().errorsText(validateSchema.errors)}`)
  invariant(
    document.$schema === '../schemas/harness-authority-contracts.schema.json'
      && document.schemaVersion === HARNESS_AUTHORITY_CONTRACT_SCHEMA_VERSION
      && document.kind === HARNESS_AUTHORITY_CONTRACT_KIND
      && document.closurePolicy === HARNESS_AUTHORITY_CONTRACT_CLOSURE_POLICY,
    'Harness authority contract identity or closure policy is invalid',
  )

  const manifestDocument = manifest ?? JSON.parse(readBoundJsonBytes(
    repoRoot,
    'packages/governance/canonical/manifest.json',
    'Harness canonical source manifest',
  ).toString('utf8'))
  const manifestSources = Array.isArray(manifestDocument?.sources) ? manifestDocument.sources : []
  const sourceIds = manifestSources.map(source => source?.id)
  invariant(
    sourceIds.length > 0
      && sourceIds.every(id => typeof id === 'string')
      && new Set(sourceIds).size === sourceIds.length,
    'Harness authority contract requires unique canonical manifest source ids',
  )
  const manifestById = new Map(manifestSources.map(source => [source.id, source]))
  const graph = JSON.parse(readBoundJsonBytes(repoRoot, GOVERNANCE_BUILD_GRAPH_PATH, 'Harness governance build graph').toString('utf8'))
  invariant(Array.isArray(graph?.stages) && graph.stages.length > 0, 'Harness authority contract requires governance build-graph stages')
  const graphStages = new Map(graph.stages.map(stage => [stage?.id, stage]))
  invariant(graphStages.size === graph.stages.length, 'Harness governance build graph stage ids are duplicated')

  const sharedSourceIds = new Set([
    CLOSED_TOOL_SHARED_AUTHORITY.canonicalSourceId,
    CLOSED_TOOL_SHARED_AUTHORITY.adapter.sourceId,
  ])
  const duplicatedSharedSourceIds = document.entries.flatMap(entry => (
    (entry.authoritySourceIds || [])
      .filter(sourceId => sharedSourceIds.has(sourceId))
      .map(sourceId => `${entry.entryId ?? '<missing>'}:${sourceId}`)
  ))
  invariant(
    duplicatedSharedSourceIds.length === 0,
    `Harness shared closed-tool authority was manually duplicated into domain claim closure:${duplicatedSharedSourceIds.join(',')}`,
  )
  const executionOwners = ownerCommandByPath
    ? { ownerCommandByPath }
    : executionTopology(inventory ?? readHarnessSourceInventory(resolve(repoRoot, SOURCE_INVENTORY_PATH)))
  const claimIds = new Set()
  invariant(
    Array.isArray(document.entries)
      && document.entries.length === registry.entries.length,
    'Harness authority contract entry count differs from the registry',
  )

  for (const [entryIndex, contractEntry] of document.entries.entries()) {
    const registryEntry = registry.entries[entryIndex]
    invariant(
      contractEntry.entryId === registryEntry.id && contractEntry.domain === registryEntry.domain,
      `Harness authority contract entry is orphaned, extra or reordered at index ${entryIndex}`,
    )
    invariant(
      Array.isArray(contractEntry.authoritySourceIds)
        && contractEntry.authoritySourceIds.length > 0
        && new Set(contractEntry.authoritySourceIds).size === contractEntry.authoritySourceIds.length,
      `Harness ${registryEntry.id} authority source ids must be unique and non-empty`,
    )
    invariant(
      Array.isArray(contractEntry.executedTestOwners)
        && contractEntry.executedTestOwners.length > 0
        && new Set(contractEntry.executedTestOwners.map(ownerKey)).size === contractEntry.executedTestOwners.length,
      `Harness ${registryEntry.id} executed owners must be unique and non-empty`,
    )

    const authorityPaths = []
    for (const sourceId of contractEntry.authoritySourceIds) {
      const source = manifestById.get(sourceId)
      invariant(source, `Harness ${registryEntry.id} authority source id is absent from the canonical manifest:${sourceId}`)
      const sourcePath = source.path?.replace(/\/$/, '')
      invariant(typeof sourcePath === 'string' && sourcePath.length > 0, `Harness ${registryEntry.id} authority source path is invalid:${sourceId}`)
      const resolvedPath = resolveRepoPath(repoRoot, sourcePath, `Harness ${registryEntry.id} authority source ${sourceId}`)
      const info = lstatSync(resolvedPath)
      if (info.isDirectory()) {
        invariant(
          (REVIEWED_AUTHORITY_FAMILY_ROOTS[registryEntry.domain] || []).includes(sourcePath),
          `Harness ${registryEntry.id} authority source is an unreviewed broad directory:${sourceId}:${sourcePath}`,
        )
      } else {
        invariant(info.isFile() && info.nlink === 1, `Harness ${registryEntry.id} authority source must be one regular exact file:${sourceId}:${sourcePath}`)
      }
      authorityPaths.push(sourcePath)
    }
    invariant(
      JSON.stringify(authorityPaths) === JSON.stringify(registryEntry.authorityPaths),
      `Harness ${registryEntry.id} authorityPaths drifted from the independent claim contract`,
    )

    const testOwnerPaths = []
    for (const owner of contractEntry.executedTestOwners) {
      if (owner.kind === 'test-path') {
        const command = executionOwners.ownerCommandByPath.get(owner.path)
        invariant(command, `Harness ${registryEntry.id} claim owner is not executed by the source inventory:${owner.path}`)
        invariant(
          registryEntry.commands.some(candidate => commandKey(candidate) === commandKey(command)),
          `Harness ${registryEntry.id} claim owner is executed outside its registry entry:${owner.path}`,
        )
        testOwnerPaths.push(owner.path)
      } else {
        const stage = graphStages.get(owner.stageId)
        invariant(
          stage && Array.isArray(stage.runtimeEntrypoints) && stage.runtimeEntrypoints.length > 0,
          `Harness ${registryEntry.id} claim owner is not a runtime-backed governance graph stage:${owner.stageId}`,
        )
      }
    }
    invariant(
      JSON.stringify(testOwnerPaths) === JSON.stringify(registryEntry.testPaths),
      `Harness ${registryEntry.id} testPaths drifted from the independent claim contract`,
    )

    const proves = []
    const doesNotProve = []
    const claimedSourceIds = []
    const claimedOwnerKeys = []
    const perKindSequence = new Map([['proves', 0], ['does-not-prove', 0]])
    for (const claim of contractEntry.claims) {
      invariant(
        !claimIds.has(claim.claimId)
          && claim.entryId === contractEntry.entryId
          && claim.domain === contractEntry.domain,
        `Harness authority claim id or entry/domain binding is duplicated or divergent:${claim.claimId}`,
      )
      claimIds.add(claim.claimId)
      const nextSequence = perKindSequence.get(claim.kind) + 1
      perKindSequence.set(claim.kind, nextSequence)
      const expectedClaimId = `${contractEntry.entryId}.${claim.kind}.${String(nextSequence).padStart(2, '0')}`
      invariant(claim.claimId === expectedClaimId, `Harness authority claim id is not stable and sequential:${claim.claimId}`)
      invariant(
        claim.sourceIds.every(sourceId => contractEntry.authoritySourceIds.includes(sourceId)),
        `Harness authority claim references a source outside its entry closure:${claim.claimId}`,
      )
      invariant(
        claim.executionOwners.every(owner => contractEntry.executedTestOwners.some(candidate => ownerKey(candidate) === ownerKey(owner))),
        `Harness authority claim references an owner outside its entry closure:${claim.claimId}`,
      )
      claimedSourceIds.push(...claim.sourceIds)
      claimedOwnerKeys.push(...claim.executionOwners.map(ownerKey))
      if (claim.kind === 'proves') proves.push(claim.text)
      else doesNotProve.push(claim.text)
    }
    invariant(proves.length > 0 && doesNotProve.length > 0, `Harness ${registryEntry.id} must retain positive and limiting claims`)
    exactSetProjection(claimedSourceIds, contractEntry.authoritySourceIds, `Harness ${registryEntry.id} claim source union`)
    exactSetProjection(claimedOwnerKeys, contractEntry.executedTestOwners.map(ownerKey), `Harness ${registryEntry.id} claim owner union`)
    invariant(
      JSON.stringify(proves) === JSON.stringify(registryEntry.proves)
        && JSON.stringify(doesNotProve) === JSON.stringify(registryEntry.doesNotProve),
      `Harness ${registryEntry.id} proves/doesNotProve drifted from the independent claim contract`,
    )
  }
  validateHarnessSharedAuthorityClosures(document.sharedAuthorityClosures, {
    registry,
    repoRoot,
    manifest: manifestDocument,
    ownerCommandByPath: executionOwners.ownerCommandByPath,
  })
  return document
}

export function validateHarnessAuthorityContracts(registry, options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT
  exactKeys(
    registry.authorityContract,
    ['path', 'schemaPath', 'schemaVersion', 'kind', 'sha256', 'schemaSha256', 'projectionPolicy'],
    'Harness authority contract binding',
  )
  invariant(
    registry.authorityContract.path === HARNESS_AUTHORITY_CONTRACT_PATH
      && registry.authorityContract.schemaPath === HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH
      && registry.authorityContract.schemaVersion === HARNESS_AUTHORITY_CONTRACT_SCHEMA_VERSION
      && registry.authorityContract.kind === HARNESS_AUTHORITY_CONTRACT_KIND
      && registry.authorityContract.projectionPolicy === HARNESS_AUTHORITY_PROJECTION_POLICY,
    'Harness authority contract fixed path, identity or projection policy is invalid',
  )
  const contractBytes = readBoundJsonBytes(repoRoot, HARNESS_AUTHORITY_CONTRACT_PATH, 'Harness authority contract')
  const schemaBytes = readBoundJsonBytes(repoRoot, HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH, 'Harness authority contract schema')
  invariant(
    /^[a-f0-9]{64}$/.test(registry.authorityContract.sha256)
      && registry.authorityContract.sha256 === sha256(contractBytes),
    'Harness authority contract digest drifted',
  )
  invariant(
    /^[a-f0-9]{64}$/.test(registry.authorityContract.schemaSha256)
      && registry.authorityContract.schemaSha256 === sha256(schemaBytes),
    'Harness authority contract schema digest drifted',
  )
  let document
  try {
    document = JSON.parse(contractBytes.toString('utf8'))
  } catch (error) {
    throw new Error(`Harness authority contract is not valid JSON:${error.message}`, { cause: error })
  }
  return validateHarnessAuthorityContractDocument(document, { ...options, registry, repoRoot })
}

function canonicalRepoRoot(repoRoot) {
  const root = realpathSync(resolve(repoRoot))
  const info = lstatSync(root)
  invariant(info.isDirectory() && !info.isSymbolicLink(), 'Harness repository root must be a real directory')
  return root
}

function resolveRepoPath(repoRoot, repoPath, label, { fileOnly = false, noLinks = true } = {}) {
  invariant(
    typeof repoPath === 'string'
      && repoPath.length > 0
      && !isAbsolute(repoPath)
      && !repoPath.includes('\\')
      && !/[\0\n\r]/.test(repoPath)
      && repoPath.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be a portable repository-relative path`,
  )
  const root = canonicalRepoRoot(repoRoot)
  const target = resolve(root, repoPath)
  const rel = relative(root, target)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the repository`)
  const info = lstatSync(target)
  invariant(!noLinks || !info.isSymbolicLink(), `${label} must not be a symbolic link:${repoPath}`)
  invariant(fileOnly ? info.isFile() : (info.isFile() || info.isDirectory()), `${label} has an unsupported path type:${repoPath}`)
  const physical = realpathSync(target)
  const physicalRel = relative(root, physical)
  invariant(physicalRel !== '..' && !physicalRel.startsWith(`..${sep}`) && !isAbsolute(physicalRel), `${label} resolves outside the repository`)
  return target
}

function commandKey(command) {
  return JSON.stringify(command)
}

export function deriveHarnessAggregateTimeoutMs(registry) {
  invariant(registry?.runner && typeof registry.runner === 'object', 'Harness timeout derivation requires a runner contract')
  invariant(Array.isArray(registry.entries) && registry.entries.length > 0, 'Harness timeout derivation requires registered entries')
  invariant(Number.isInteger(registry.runner.defaultTimeoutMs) && registry.runner.defaultTimeoutMs >= 1_000, 'Harness timeout derivation requires a valid default timeout')
  invariant(Array.isArray(registry.runner.timeoutOverrides), 'Harness timeout derivation requires closed timeout overrides')
  const timeoutByCommand = new Map()
  for (const override of registry.runner.timeoutOverrides) {
    invariant(Array.isArray(override?.command) && Number.isInteger(override.timeoutMs) && override.timeoutMs >= 1_000, 'Harness timeout derivation received an invalid override')
    const key = commandKey(override.command)
    invariant(!timeoutByCommand.has(key), 'Harness timeout derivation received a duplicate override')
    timeoutByCommand.set(key, override.timeoutMs)
  }
  const registeredKeys = new Set(registry.entries.flatMap(entry => entry.commands ?? []).map(commandKey))
  invariant(registeredKeys.size > 0, 'Harness timeout derivation found no registered commands')
  for (const key of timeoutByCommand.keys()) invariant(registeredKeys.has(key), 'Harness timeout derivation received an override for an unregistered command')
  return [...registeredKeys].reduce(
    (total, key) => total + (timeoutByCommand.get(key) ?? registry.runner.defaultTimeoutMs),
    0,
  )
}

export function deriveAuthorityAllHarnessTimeoutMs(registry) {
  return deriveHarnessAggregateTimeoutMs(registry) + HARNESS_SETUP_OUTER_RESERVE_MS
}

function validateCommandShape(command, label, repoRoot) {
  invariant(Array.isArray(command) && command.length >= 2 && command.every(token => typeof token === 'string' && token.length > 0), `${label} must be a non-empty argv array`)
  invariant(command[0] === 'node', `${label} must use the committed Node entrypoint, never npm or a shell`)
  for (const token of command) {
    invariant(!/[\n\r\0]/.test(token) && !/(?:&&|\|\||[;<>`]|\$\()/.test(token), `${label} contains shell control syntax`)
  }
  const key = commandKey(command)
  if ([ALL_HARNESS_RUNNER, META_RUNNER, COVERAGE_CHECK].some(allowed => commandKey(allowed) === key)) {
    resolveRepoPath(repoRoot, command[1], `${label} entrypoint`, { fileOnly: true })
    return
  }
  if (
    command.length === 4
      && command[1] === SUITE_RUNNER_PATH
      && command[2] === '--suite'
      && /^[a-z][a-z0-9-]*$/.test(command[3])
  ) {
    resolveRepoPath(repoRoot, command[1], `${label} suite entrypoint`, { fileOnly: true })
    return
  }
  if (
    command.length === 3
      && command[1] === '--test'
      && /^(?:infra\/governance\/test|packages\/governance\/test)\/[A-Za-z0-9._-]+\.test\.mjs$/.test(command[2])
  ) {
    resolveRepoPath(repoRoot, command[2], `${label} test entrypoint`, { fileOnly: true })
    return
  }
  if (command.length === 2 && /^scripts\/test-[A-Za-z0-9._-]+\.mjs$/.test(command[1])) {
    resolveRepoPath(repoRoot, command[1], `${label} test entrypoint`, { fileOnly: true })
    return
  }
  invariant(
    !command[1].startsWith('-'),
    `${label} may not use Node evaluation, preload, import or loader flags`,
  )
  invariant(false, `${label} entrypoint is not registered in the Harness whitelist or has an unreviewed argument shape`)
}

function combinedText(entry, field) {
  return entry[field].join(' ').toLowerCase()
}

function executionTopology(inventory) {
  const ownerCommandByPath = new Map()
  const allowedCommands = new Set([commandKey(COVERAGE_CHECK)])
  for (const suite of inventory.suites) {
    const command = harnessSuiteCommand(suite.id)
    allowedCommands.add(commandKey(command))
    for (const path of suite.members) ownerCommandByPath.set(path, command)
  }
  allowedCommands.add(commandKey(inventory.pairedMeta.command))
  for (const path of inventory.pairedMeta.members) ownerCommandByPath.set(path, inventory.pairedMeta.command)
  for (const path of inventory.direct) {
    const command = harnessMemberCommand(path)
    allowedCommands.add(commandKey(command))
    ownerCommandByPath.set(path, command)
  }
  return { ownerCommandByPath, allowedCommands }
}

function validateRequiredConsumers(runner, repoRoot, packageJson) {
  // scripts/release-preflight.mjs was removed 2026-08-04: canonical had retired it
  // (ds-canonical/rules/self-verify.md「retired release:preflight 不得回流」) and its only
  // consumer was this contract requiring its own wrapper to exist — a zombie kept alive by
  // its keeper. The harness suite itself stays owned by test:governance-harnesses directly.
  const expected = [
    {
      path: '.devcontainer/post-create.mjs',
      invocationKind: 'js-authority-setup-wrapper',
      argv: ['node', '.devcontainer/post-create.mjs'],
    },
  ]
  invariant(JSON.stringify(runner.requiredConsumers) === JSON.stringify(expected), 'Harness required consumer contracts are incomplete or divergent')
  for (const consumer of runner.requiredConsumers) {
    const path = resolveRepoPath(repoRoot, consumer.path, `Harness consumer ${consumer.path}`, { fileOnly: true })
    const source = readFileSync(path, 'utf8')
    if (consumer.invocationKind === 'js-reviewed-shell-wrapper') {
      invariant(/^run\([^\n,]+,\s*'npm run --silent test:governance-harnesses'\)\s*$/m.test(source), `Harness consumer ${consumer.path} lacks the reviewed wrapper invocation`)
    } else if (consumer.invocationKind === 'js-authority-setup-wrapper') {
      invariant(source.includes('runWorkspacePostCreate({ root })'), `Harness consumer ${consumer.path} lacks the structured authority-setup invocation`)
      const workspacePostCreateImport = ['from', "'../scripts/lib/workspace-post-create.mjs'"].join(' ')
      invariant(source.includes(workspacePostCreateImport), `Harness consumer ${consumer.path} does not bind the shared workspace wrapper`)
      invariant(packageJson.scripts?.['setup:governance'] === 'node scripts/setup-authority-governance.mjs', 'authority package setup:governance command drifted')
      invariant(packageJson.scripts?.['setup:dependencies'] === 'node scripts/setup-authority-governance.mjs --dependencies-only', 'authority package setup:dependencies command drifted')
      invariant(packageJson.scripts?.['setup:all'] === 'node scripts/setup-workspace.mjs', 'authority package setup:all command drifted')
      const wrapperSource = readFileSync(resolveRepoPath(repoRoot, 'scripts/lib/workspace-post-create.mjs', 'shared workspace setup implementation', { fileOnly: true }), 'utf8')
      invariant(/\['complete provider-neutral workspace setup', process\.execPath, \[workspaceSetup\]\]/.test(wrapperSource), 'shared workspace wrapper no longer directly executes setup:all')
      invariant(/runner\(command, args, \{[\s\S]*shell: false,/.test(wrapperSource), 'shared workspace wrapper no longer enforces structured shell:false execution')
      const workspaceSetupSource = readFileSync(resolveRepoPath(repoRoot, 'scripts/setup-workspace.mjs', 'complete workspace setup implementation', { fileOnly: true }), 'utf8')
      invariant(
        /\['node scripts\/setup-authority-governance\.mjs', Object\.freeze\(\{[\s\S]*?path: 'scripts\/setup-authority-governance\.mjs',[\s\S]*?hookSetup: true,[\s\S]*?\}\)\],/.test(workspaceSetupSource),
        'setup:all no longer binds the authority role setup',
      )
      invariant(
        /const hookSetup = roleSetup\.hookSetup[\s\S]*?regularFile\(root, 'scripts\/setup-governance-hooks\.mjs'\)[\s\S]*?if \(hookSetup\) \{[\s\S]*?run\(process\.execPath, \[hookSetup\]/.test(workspaceSetupSource),
        'setup:all no longer closes the authority Git-hook setup before governance',
      )
      invariant(/run\(process\.execPath, \[governance\]/.test(workspaceSetupSource) && /run\(process\.execPath, \[providerCli\]/.test(workspaceSetupSource), 'setup:all no longer closes governance then provider CLI setup')
      invariant(/runner\(command, args, \{[\s\S]*shell: false,/.test(workspaceSetupSource), 'setup:all no longer enforces structured shell:false execution')
      const setupSource = readFileSync(resolveRepoPath(repoRoot, 'scripts/setup-authority-governance.mjs', 'authority setup implementation', { fileOnly: true }), 'utf8')
      invariant(/^\s*const dependencies = await runAuthorityDependencySetup\(/m.test(setupSource), 'authority setup no longer composes the exact dependency bootstrap')
      invariant(/^\s*await runAuthorityAllHarnessStep\(\{ root, environment, runner \}\)\s*$/m.test(setupSource), 'authority setup no longer executes the timeout-derived all-Harness step')
      invariant(/await import\('\.\.\/infra\/governance\/lib\/harness-registry\.mjs'\)/.test(setupSource), 'authority setup must defer the Harness contract until the exact dependency bootstrap is complete')
      invariant(/deriveAuthorityAllHarnessTimeoutMs\(registry\)/.test(setupSource), 'authority setup no longer derives its all-Harness timeout from the canonical registry')
      invariant(/runStep\(process\.execPath, \['infra\/governance\/bin\/run-harnesses\.mjs'\], \{ root, env: environment, runner, timeoutMs \}\)/.test(setupSource), 'authority setup no longer passes the derived deadline to the closed runner')
      invariant(/runClosedBootstrapStep\(command, args,/.test(setupSource), 'authority setup no longer delegates to the shared closed runner')
      const dependencyBootstrap = readFileSync(resolveRepoPath(repoRoot, 'scripts/lib/governance-dependency-bootstrap.mjs', 'shared dependency bootstrap', { fileOnly: true }), 'utf8')
      invariant(/runner\(command, args, \{[\s\S]*shell: false,/.test(dependencyBootstrap), 'shared dependency bootstrap no longer enforces shell:false')
    } else {
      throw new Error(`Harness consumer ${consumer.path} has unsupported invocation kind:${consumer.invocationKind}`)
    }
  }
}

export function readHarnessRegistry(path = resolve(GOVERNANCE_ROOT, 'providers/harness-registry.json')) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Harness registry must be a regular no-link file')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function deriveHarnessCheckerMutationCoverage({
  repoRoot = DEFAULT_REPO_ROOT,
  sourceInventory = null,
  exclusionDocument,
} = {}) {
  const root = canonicalRepoRoot(repoRoot)
  const inventory = sourceInventory ?? readHarnessSourceInventory(resolve(root, SOURCE_INVENTORY_PATH))
  const gateMeta = createGateMetaTestInventory({ root, exclusionDocument })
  const runnable = new Set(gateMeta.runnable.map(item => item.stem))
  const deterministic = new Map(gateMeta.excludedByClass['deterministic-isolated'].map(item => [item.stem, item]))
  const environmental = new Set(gateMeta.excludedByClass['environmental-observation'].map(item => item.stem))
  const pairedMembers = new Set(inventory.pairedMeta.members)
  const directMembers = new Set(inventory.direct)
  const discoveredPairs = new Map(gateMeta.discoverable.map(item => [item.stem, item]))
  const checkerGates = discoverCheckerGates(root)
  const covered = []
  const gaps = []

  for (const gate of checkerGates) {
    const stem = gate.replace(/\.mjs$/, '')
    const pair = discoveredPairs.get(stem)
    if (!pair) {
      gaps.push({ stem, reason: 'missing paired mutation test' })
      continue
    }
    const harness = `scripts/${pair.file}`
    if (runnable.has(stem) && pairedMembers.has(harness)) {
      covered.push({ stem, owner: 'paired-meta' })
      continue
    }
    const deterministicOwner = deterministic.get(stem)
    if (deterministicOwner && directMembers.has(deterministicOwner.harness)) {
      covered.push({ stem, owner: 'deterministic-direct' })
      continue
    }
    gaps.push({
      stem,
      reason: environmental.has(stem)
        ? 'environmental observation has no portable mutation execution owner'
        : 'paired test has no canonical Harness execution owner',
    })
  }
  return {
    checkerGateCount: checkerGates.length,
    pairedMetaTestCount: covered.length,
    declaredGapCount: gaps.length,
    fullMutationCoverageClaim: gaps.length === 0,
    covered,
    gaps,
  }
}

export function validateHarnessRegistry(registry, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const root = canonicalRepoRoot(repoRoot)
  exactKeys(registry, ['$schema', 'schemaVersion', 'kind', 'requiredDomains', 'domainTaxonomy', 'authorityContract', 'sharedAuthorityPolicy', 'sourceInventory', 'runner', 'entries', 'metaTestCoverage'], 'Harness registry')
  invariant(registry.$schema === '../schemas/harness-registry.schema.json', 'Harness registry schema binding is invalid')
  invariant(registry.schemaVersion === 2 && registry.kind === 'provider-neutral-governance-harness-registry', 'Harness registry identity is invalid')
  invariant(JSON.stringify(registry.requiredDomains) === JSON.stringify(REQUIRED_HARNESS_DOMAINS), 'Harness registry required domain order/set is incomplete')
  exactKeys(registry.domainTaxonomy, ['version', 'mandatoryCoreBinding', 'extensionDomainPattern', 'extensionPolicy'], 'Harness domain taxonomy')
  invariant(JSON.stringify(registry.domainTaxonomy) === JSON.stringify(HARNESS_DOMAIN_TAXONOMY), 'Harness domain taxonomy version or extension policy is invalid')
  invariant(registry.sharedAuthorityPolicy === HARNESS_SHARED_AUTHORITY_POLICY, 'Harness shared authority non-duplication policy is invalid')
  invariant(Array.isArray(registry.entries) && registry.entries.length >= REQUIRED_HARNESS_DOMAINS.length, 'Harness registry must include every mandatory core domain')

  exactKeys(registry.sourceInventory, ['path', 'schemaVersion', 'kind', 'sha256', 'closurePolicy'], 'Harness source inventory binding')
  invariant(registry.sourceInventory.path === SOURCE_INVENTORY_PATH, 'Harness source inventory path is not canonical')
  invariant(registry.sourceInventory.schemaVersion === 2 && registry.sourceInventory.kind === 'provider-neutral-governance-harness-source-inventory', 'Harness source inventory identity binding is invalid')
  invariant(registry.sourceInventory.closurePolicy === 'every-discovered-source-exactly-one-execution-or-reviewed-exclusion', 'Harness source closure policy is diluted')
  const inventoryPath = resolveRepoPath(root, registry.sourceInventory.path, 'Harness source inventory', { fileOnly: true })
  const inventoryBytes = readFileSync(inventoryPath)
  invariant(sha256(inventoryBytes) === registry.sourceInventory.sha256, 'Harness source inventory digest drifted')
  const inventory = readHarnessSourceInventory(inventoryPath)

  const runner = registry.runner
  exactKeys(runner, ['id', 'command', 'npmScript', 'npmScriptCommand', 'defaultTimeoutMs', 'failureMode', 'deduplication', 'credentialPolicy', 'certificationPolicy', 'timeoutOverrides', 'requiredConsumers'], 'Harness runner')
  invariant(runner.id === 'all-registered-local-harnesses', 'Harness runner identity is invalid')
  invariant(JSON.stringify(runner.command) === JSON.stringify(ALL_HARNESS_RUNNER), 'Harness runner command is invalid')
  validateCommandShape(runner.command, 'Harness runner command', root)
  invariant(runner.npmScript === 'test:governance-harnesses' && runner.npmScriptCommand === 'node infra/governance/bin/run-harnesses.mjs', 'Harness npm entrypoint is invalid')
  invariant(Number.isInteger(runner.defaultTimeoutMs) && runner.defaultTimeoutMs >= 1_000 && runner.defaultTimeoutMs <= 900_000, 'Harness runner timeout is invalid')
  invariant(runner.failureMode === 'run-all' && runner.deduplication === 'first-registered-argv', 'Harness runner execution policy is invalid')
  invariant(runner.credentialPolicy === 'strip-external-credentials', 'Harness runner must strip external credentials')
  invariant(runner.certificationPolicy === 'preserve-registry-claims-never-certify-external', 'Harness runner may not promote external certification claims')
  invariant(Array.isArray(runner.timeoutOverrides) && runner.timeoutOverrides.length > 0, 'Harness timeout overrides are missing')
  const packageJson = JSON.parse(readFileSync(resolveRepoPath(root, 'package.json', 'Harness npm script registry', { fileOnly: true }), 'utf8'))
  invariant(packageJson.scripts?.[runner.npmScript] === runner.npmScriptCommand, 'Harness npm script is missing or divergent')
  validateRequiredConsumers(runner, root, packageJson)

  const ids = new Set()
  const domains = new Set()
  const manifest = JSON.parse(readFileSync(resolveRepoPath(
    root,
    'packages/governance/canonical/manifest.json',
    'Harness canonical source manifest',
    { fileOnly: true },
  ), 'utf8'))
  const exactCanonicalSourcePaths = new Set(
    (manifest.sources || []).map(source => source?.path).filter(path => typeof path === 'string'),
  )
  for (const [entryIndex, entry] of registry.entries.entries()) {
    exactKeys(entry, ['id', 'domain', 'commands', 'testPaths', 'authorityPaths', 'executionClass', 'certificationClaim', 'proves', 'doesNotProve'], `Harness entry ${entry?.id ?? '<missing>'}`)
    invariant(typeof entry.id === 'string' && /^[a-z][a-z0-9-]*$/.test(entry.id) && !ids.has(entry.id), `Harness entry id is invalid or duplicated:${String(entry.id)}`)
    const requiredCore = REQUIRED_HARNESS_DOMAINS[entryIndex]
    if (entryIndex < REQUIRED_HARNESS_DOMAINS.length) {
      invariant(entry.domain === requiredCore, `Harness mandatory core domain is missing, replaced or reordered at index ${entryIndex}:${String(entry.domain)}`)
    } else {
      invariant(EXTENSION_DOMAIN_PATTERN.test(entry.domain), `Harness extension domain lacks the portable x- namespace:${String(entry.domain)}`)
      invariant(entry.id === `extension-${entry.domain.slice(2)}`, `Harness extension entry id must be derived from its domain:${String(entry.id)}`)
    }
    invariant(!domains.has(entry.domain), `Harness domain is duplicated:${String(entry.domain)}`)
    invariant(['deterministic-local', 'fixture-integration', 'external-readback-required'].includes(entry.executionClass), `Harness ${entry.id} execution class is invalid`)
    invariant(['local-harness-only', 'not-certified', 'external-readback-required'].includes(entry.certificationClaim), `Harness ${entry.id} certification claim is invalid`)
    invariant(Array.isArray(entry.commands) && entry.commands.length > 0 && new Set(entry.commands.map(commandKey)).size === entry.commands.length, `Harness ${entry.id} must declare unique commands`)
    for (const [index, command] of entry.commands.entries()) {
      validateCommandShape(command, `Harness ${entry.id} command ${index}`, root)
      invariant(commandKey(command) !== commandKey(runner.command), `Harness ${entry.id} may not recursively execute the all-Harness runner`)
    }
    for (const field of ['testPaths', 'authorityPaths']) {
      invariant(Array.isArray(entry[field]) && entry[field].length > 0 && new Set(entry[field]).size === entry[field].length, `Harness ${entry.id} ${field} must contain unique paths`)
      for (const path of entry[field]) {
        const resolvedPath = resolveRepoPath(root, path, `Harness ${entry.id} ${field}`, { fileOnly: field === 'testPaths' })
        if (field === 'authorityPaths') {
          if (lstatSync(resolvedPath).isDirectory()) {
            invariant(
              (REVIEWED_AUTHORITY_FAMILY_ROOTS[entry.domain] || []).includes(path),
              `Harness ${entry.id} authority directory is not an explicitly reviewed family root:${path}`,
            )
          }
          invariant(
            exactCanonicalSourcePaths.has(path),
            `Harness ${entry.id} authority lacks one exact canonical manifest source:${path}`,
          )
        }
      }
    }
    ids.add(entry.id)
    domains.add(entry.domain)
  }
  const extensionDomains = registry.entries.slice(REQUIRED_HARNESS_DOMAINS.length).map(entry => entry.domain)
  invariant(JSON.stringify(extensionDomains) === JSON.stringify([...extensionDomains].sort()), 'Harness extension domains must be appended in sorted order')
  invariant(
    JSON.stringify(registry.entries.slice(0, REQUIRED_HARNESS_DOMAINS.length).map(entry => entry.domain)) === JSON.stringify(REQUIRED_HARNESS_DOMAINS),
    'Harness registry entries do not preserve the mandatory core taxonomy in canonical order',
  )

  validateHarnessSourceInventory(inventory, { repoRoot: root, registry })
  const { ownerCommandByPath, allowedCommands } = executionTopology(inventory)
  validateHarnessAuthorityContracts(registry, {
    repoRoot: root,
    manifest,
    inventory,
    ownerCommandByPath,
  })
  const registeredCommands = registry.entries.flatMap(entry => entry.commands)
  const registeredKeys = new Set(registeredCommands.map(commandKey))
  invariant(JSON.stringify([...registeredKeys].sort()) === JSON.stringify([...allowedCommands].sort()), 'Harness registry commands differ from the closed source-execution topology')
  for (const entry of registry.entries) {
    const entryKeys = new Set(entry.commands.map(commandKey))
    for (const command of entry.commands) invariant(allowedCommands.has(commandKey(command)), `Harness ${entry.id} has an unregistered execution owner`)
    for (const testPath of entry.testPaths) {
      const owner = ownerCommandByPath.get(testPath)
      invariant(owner, `Harness ${entry.id} test path is excluded or absent from the source inventory:${testPath}`)
      invariant(entryKeys.has(commandKey(owner)), `Harness ${entry.id} does not invoke the canonical owner for registered test:${testPath}`)
    }
  }

  const overrideKeys = []
  const timeoutByCommand = new Map()
  for (const override of runner.timeoutOverrides) {
    exactKeys(override, ['command', 'timeoutMs'], 'Harness timeout override')
    validateCommandShape(override.command, 'Harness timeout override command', root)
    const key = commandKey(override.command)
    invariant(registeredKeys.has(key), 'Harness timeout override targets an unregistered command')
    invariant(!timeoutByCommand.has(key), 'Harness timeout override is duplicated')
    invariant(Number.isInteger(override.timeoutMs) && override.timeoutMs >= 1_000 && override.timeoutMs <= 21_600_000, 'Harness timeout override is invalid')
    timeoutByCommand.set(key, override.timeoutMs)
    overrideKeys.push(key)
  }
  invariant(JSON.stringify(overrideKeys) === JSON.stringify([...overrideKeys].sort()), 'Harness timeout overrides must be sorted by exact argv')
  for (const suite of inventory.suites) {
    const timeout = timeoutByCommand.get(commandKey(harnessSuiteCommand(suite.id)))
    invariant(Number.isInteger(timeout) && timeout === suite.totalTimeoutMs + 60_000, `Harness suite outer process-group deadline must equal its source-inventory deadline plus 60 seconds:${suite.id}`)
  }
  invariant((timeoutByCommand.get(commandKey(META_RUNNER)) ?? 0) >= 1_800_000, 'Harness paired-meta runner lacks a bounded long-run timeout override')
  const byDomain = new Map(registry.entries.map(entry => [entry.domain, entry]))
  const cloud = byDomain.get('cloud')
  invariant(cloud.executionClass === 'external-readback-required' && cloud.certificationClaim === 'not-certified', 'Cloud Harness must remain not-certified pending external target readback')
  invariant(
    /local fixtures verify/.test(combinedText(cloud, 'proves'))
      && /same canonical hard gates/.test(combinedText(cloud, 'proves'))
      && /actually honored the committed setup/.test(combinedText(cloud, 'doesNotProve'))
      && /real fresh-clone/.test(combinedText(cloud, 'doesNotProve')),
    'Cloud Harness must distinguish local portability checks from unproven target execution',
  )
  for (const domain of ['mirror', 'release', 'fleet', 'evidence']) {
    const entry = byDomain.get(domain)
    invariant(entry.certificationClaim === 'external-readback-required', `Harness ${domain} must require external readback before certification`)
  }
  const crash = byDomain.get('process-crash')
  invariant(/process-crash recovery/.test(combinedText(crash, 'proves')) && /power-loss durability/.test(combinedText(crash, 'doesNotProve')), 'Process-crash Harness must not overclaim storage power-loss durability')
  invariant(/pathname-visible concurrent edits/.test(combinedText(crash, 'proves')) && /old open file descriptor/.test(combinedText(crash, 'doesNotProve')), 'Process-crash Harness must preserve the observable-race/open-descriptor boundary')
  const upgrade = byDomain.get('upgrade')
  invariant(/pathname-visible concurrent edits/.test(combinedText(upgrade, 'proves')) && /old open file descriptor/.test(combinedText(upgrade, 'doesNotProve')), 'Upgrade Harness must preserve the observable-race/open-descriptor boundary')
  invariant(/ds-author-only/.test(combinedText(byDomain.get('template-consumer'), 'proves')), 'Template-consumer Harness must enforce the DS-author role boundary')
  const secondOpinion = byDomain.get('second-opinion')
  invariant(/distinct from both the author and current provider/.test(combinedText(secondOpinion, 'proves')), 'Second-opinion Harness must require author/current/peer separation')
  invariant(/product consumers receive a separate read-only independent-review workflow/.test(combinedText(secondOpinion, 'proves')) && /without ds-author, release, deep-audit-remediation or mutation authority/.test(combinedText(secondOpinion, 'proves')), 'Second-opinion Harness must preserve the product-consumer independent-review role boundary')
  invariant(
    /entitlement review lane validates peer binding, profile and entitlement readback/.test(combinedText(secondOpinion, 'proves'))
      && /response substitution fail-closed/.test(combinedText(secondOpinion, 'proves')),
    'Second-opinion Harness must separate review binding from model identity authority',
  )
  invariant(/one provider reviewing itself/.test(combinedText(secondOpinion, 'doesNotProve')), 'Second-opinion Harness must reject same-provider independence claims')
  invariant(
    /waived self-review is an independent review/i.test(combinedText(secondOpinion, 'doesNotProve'))
      && /unverified model coverage visible/.test(combinedText(secondOpinion, 'doesNotProve')),
    'Second-opinion Harness must not infer live or promotion-eligible model execution from local review wiring',
  )
  const fakeGreen = byDomain.get('fake-green')
  invariant(
    /every discovered checker gate executes a paired mutation test/.test(combinedText(fakeGreen, 'proves'))
      && /does not certify live browser, registry, model, ci or managed-host execution/.test(combinedText(fakeGreen, 'doesNotProve')),
    'Fake-green Harness must bind discovered zero-gap paired mutation coverage without overclaiming live external certification',
  )
  invariant(fakeGreen.commands.some(command => commandKey(command) === commandKey(CANONICAL_HOOK_SUITE)), 'Fake-green Harness must execute the canonical hook behavioral suite')
  invariant(
    /canonical hook behavioral suite executes/.test(combinedText(fakeGreen, 'proves'))
      && /one aggregate deadline/.test(combinedText(fakeGreen, 'proves'))
      && /canonical-to-mirror digest parity/.test(combinedText(fakeGreen, 'proves'))
      && /never executed as a second suite/.test(combinedText(fakeGreen, 'proves'))
      && /not a second behavioral execution/.test(combinedText(fakeGreen, 'doesNotProve')),
    'Fake-green Harness must distinguish canonical hook behavior from generated-mirror digest parity',
  )

  const meta = registry.metaTestCoverage
  exactKeys(meta, ['coverageKind', 'inventoryCommand', 'isolatedRunnerCommand', 'isolationTestPath', 'baselinePath', 'requiredOutcome', 'statement'], 'Harness meta-test coverage')
  invariant(meta.coverageKind === 'discovered-paired-mutation-zero-debt-ratchet', 'Harness meta-test coverage kind is invalid')
  invariant(meta.requiredOutcome === 'all-discovered-checker-gates-covered-zero-debt', 'Harness meta-test required outcome is invalid')
  invariant(commandKey(meta.inventoryCommand) === commandKey(COVERAGE_CHECK) && commandKey(meta.isolatedRunnerCommand) === commandKey(META_RUNNER), 'Harness meta-test commands are not canonical')
  resolveRepoPath(root, meta.isolationTestPath, 'Harness isolation test', { fileOnly: true })
  const baseline = JSON.parse(readFileSync(resolveRepoPath(root, meta.baselinePath, 'Harness known-debt baseline', { fileOnly: true }), 'utf8'))
  const derivedMeta = deriveHarnessCheckerMutationCoverage({ repoRoot: root, sourceInventory: inventory })
  invariant(derivedMeta.checkerGateCount > 0, 'Harness meta-test discovery unexpectedly found zero checker gates')
  invariant(derivedMeta.declaredGapCount === 0 && derivedMeta.fullMutationCoverageClaim === true, `Harness meta-test coverage must remain zero-gap:${derivedMeta.gaps.map(item => item.stem).join(',')}`)
  invariant(derivedMeta.checkerGateCount === derivedMeta.pairedMetaTestCount, 'Harness meta-test discovery and paired execution-owner counts diverged')
  invariant(meta.statement === 'Every discovered checker gate has one canonical paired mutation execution owner; live browser, registry, model, CI and managed-host owners remain required for external certification.', 'Harness meta-test coverage statement is stale or misleading')
  invariant(Array.isArray(baseline.knownDebt) && baseline.knownDebt.length === 0, 'Harness checker mutation baseline must remain zero-debt')
  invariant(baseline.debtReasons && Object.keys(baseline.debtReasons).length === 0, 'Harness checker mutation baseline may not retain debt reasons')
  return true
}
