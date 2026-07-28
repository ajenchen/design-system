#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCorpus } from './build-fork-governance.mjs'
import { PROVIDER_REGISTRY, PROVIDER_SKILL_SEMANTICS } from './gen-codex-adapter.mjs'
import {
  buildAuthenticatedProviderLifecycle,
  compareUtf8Bytes,
  deriveProviderProductManagedInventory,
  deriveProviderRepositoryManagedInventory,
  lifecycleSnapshotSha256,
  providerInventorySha256,
  repositoryPathsOverlap,
  validateAuthenticatedProviderLifecycle,
  validateProviderLifecycleLedger,
} from './lib/provider-lifecycle.mjs'
import {
  authorizeDisposableProviderRefreshTransaction,
  authorizeProviderRefreshTransaction,
  assertUnclaimedManagedAdditions,
  providerSurfaceDigest,
  refreshLaunchers,
  validateInstalledForkCorpus,
  validateInstalledProviderTransition,
} from './refresh-fork-launchers.mjs'
import { resolveProviderReviewBinding } from '../packages/governance/src/provider-review-binding.mjs'

const discovery = (root, instruction) => ({
  providerRootNames: [root],
  instructionNames: [instruction],
  instructionOverrideNames: [],
  configPaths: [`${root}/hooks.json`],
  pluginRootNames: [],
})
const provider = (id) => ({
  id,
  instructionEntry: `${id.toUpperCase()}.md`,
  hookConfig: `.${id}/hooks.json`,
  skillDirectory: `.${id}/skills`,
  adapter: {
    generate: true,
    instructionView: { materializerId: 'fixture-instruction-v1' },
    skillView: { directory: `.${id}/skills`, materializerId: 'agent-skills-directory-v1' },
    repositoryManagedTrees: { rules: `.${id}/rules` },
    productManagedTrees: {
      runtime: {
        sourceRoot: 'packages/design-system/ds-canonical/templates/runtime',
        destination: `.${id}/runtime`,
        materializerId: 'closed-tree-copy-v1',
        transformPolicy: 'byte-exact',
      },
    },
    discovery: discovery(`.${id}`, `${id.toUpperCase()}.md`),
  },
})
const registry = (providers, retiredProviders = []) => ({
  canonical: {
    materializers: {
      instructionViews: {
        'fixture-instruction-v1': { engine: 'markdown-relative-at-import-v1', ownershipPolicy: 'provider-generated-projection', supplementPolicy: 'optional' },
      },
    },
    retiredProviders,
  },
  providers,
})
const snapshot = (releaseVersion, providerRegistry, retiredProviders = [], previousSnapshotSha256 = null) => ({
  releaseVersion,
  previousSnapshotSha256,
  providers: deriveProviderProductManagedInventory(providerRegistry),
  retiredProviders,
})
const head = (releaseSnapshot) => ({
  releaseVersion: releaseSnapshot.releaseVersion,
  snapshotSha256: lifecycleSnapshotSha256(releaseSnapshot),
  providerInventorySha256: providerInventorySha256(releaseSnapshot.providers),
})
const ledger = (snapshots, immutableSnapshot = snapshots.length === 1 ? snapshots[0] : snapshots.at(-2)) => ({
  $schema: './schemas/provider-lifecycle.schema.json',
  schemaVersion: 1,
  kind: 'provider-lifecycle-ledger',
  immutableHead: head(immutableSnapshot),
  snapshots,
})
const registryRetirement = (record) => ({
  ...structuredClone(record),
  surfaces: record.surfaces.map(({ path, kind }) => ({ path, kind })),
})

const writeConsumerRuntimeFixture = (projectDir, manifest, name) => {
  const runtime = manifest?.consumer?.executionRuntime
  assert.match(runtime?.minimumNodeVersion || '', /^\d+\.\d+\.\d+$/, 'fixture runtime must declare an exact minimum Node version')
  assert.match(runtime?.exactNpmVersion || '', /^\d+\.\d+\.\d+$/, 'fixture runtime must declare an exact npm version')
  const nodeRange = `>=${runtime.minimumNodeVersion}`
  const packageManifest = {
    name,
    private: true,
    version: '0.0.0',
    scripts: {},
    devDependencies: { npm: runtime.exactNpmVersion },
    engines: { node: nodeRange },
  }
  writeFileSync(join(projectDir, 'package.json'), `${JSON.stringify(packageManifest, null, 2)}\n`)
  writeFileSync(join(projectDir, 'package-lock.json'), `${JSON.stringify({
    name,
    version: '0.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name,
        version: '0.0.0',
        devDependencies: packageManifest.devDependencies,
        engines: packageManifest.engines,
      },
      'node_modules/npm': {
        version: runtime.exactNpmVersion,
        resolved: `https://registry.npmjs.org/npm/-/npm-${runtime.exactNpmVersion}.tgz`,
        integrity: 'sha512-A3eSBeF7eSqCa3kuXymOstWCI9uLMcNxZY7glJosUTnvLJMsV9w6V8Ikirx08w6ch5bYT6BbUsQmJMyEkCfdDA==',
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
    },
  }, null, 2)}\n`)
}

const ALTERNATE_REVIEWER_ID = 'alternate-reviewer'
const canonicalProviderCompatibility = JSON.parse(readFileSync(
  new URL('../infra/governance/providers/compatibility-matrix.json', import.meta.url),
  'utf8',
))
const retirementProviderCompatibility = structuredClone(canonicalProviderCompatibility)
retirementProviderCompatibility.providers[ALTERNATE_REVIEWER_ID] = {
  adapterProviderId: ALTERNATE_REVIEWER_ID,
  runtimeKinds: {
    'alternate-reviewer-cli': {
      runtimeProfilesBySurface: { local: 'alternate-reviewer-local' },
      runtimeEvidenceRequired: true,
    },
  },
  minimumVersion: '1.0.0',
}

const canonicalUtilityRegistry = new URL('../packages/design-system/src/tokens/utility-registry.json', import.meta.url)
function installUtilityRegistry(packageRoot) {
  mkdirSync(join(packageRoot, 'src/tokens'), { recursive: true })
  cpSync(canonicalUtilityRegistry, join(packageRoot, 'src/tokens/utility-registry.json'))
}

function addSyntheticConcreteReviewer(providerRegistry) {
  const headless = providerRegistry.providers.find((item) => item.id === 'generic')
  assert.ok(headless, 'synthetic concrete reviewer fixture requires the canonical headless protocol')
  const reviewer = structuredClone(headless)
  reviewer.id = ALTERNATE_REVIEWER_ID
  reviewer.displayName = 'Alternate reviewer lifecycle fixture'
  reviewer.providerKind = 'concrete-runtime'
  reviewer.skillDirectory = `.${ALTERNATE_REVIEWER_ID}/skills`
  reviewer.runtime = {
    cli: {
      executable: ALTERNATE_REVIEWER_ID,
      localExecutable: `node_modules/.bin/${ALTERNATE_REVIEWER_ID}`,
      briefInvocationMarkers: ['review'],
      discoveryMarkers: [`node_modules/.bin/${ALTERNATE_REVIEWER_ID}`],
      replyArtifactPrefix: `${ALTERNATE_REVIEWER_ID}-reply`,
    },
    transcript: {
      contract: null,
      stability: 'unavailable',
      fixture: null,
      access: null,
    },
    contextOutputTransport: 'stderr',
    stopDecisionTransport: 'blocking-exit',
    branchNamespace: `${ALTERNATE_REVIEWER_ID}/`,
    memorySyncScript: null,
  }
  reviewer.adapter.discovery = {
    providerRootNames: [`.${ALTERNATE_REVIEWER_ID}`],
    instructionNames: ['AGENTS.md'],
    instructionOverrideNames: ['AGENTS.local.md', 'AGENTS.override.md'],
    configPaths: [],
    pluginRootNames: [],
  }
  reviewer.adapter.exclusions = [
    {
      scope: 'native-hooks',
      reasonCode: 'NATIVE_HOOK_API_UNAVAILABLE',
      detail: 'The synthetic review runtime has no native hook surface; the provider-neutral CI gate remains authoritative.',
    },
    {
      scope: 'product-projection',
      reasonCode: 'TEST_FIXTURE_REVIEW_RUNTIME_ONLY',
      detail: 'This concrete synthetic runtime exists only to prove provider retirement can preserve an independent peer without claiming product surfaces.',
    },
  ]
  providerRegistry.providers.push(reviewer)
  return reviewer
}

function registryAfterRetirement(priorRegistry, retiredProviderId, reviewerProviderId) {
  const nextRegistry = structuredClone(priorRegistry)
  nextRegistry.providers = nextRegistry.providers.filter((item) => item.id !== retiredProviderId)
  if (reviewerProviderId === 'generic') {
    nextRegistry.providers = nextRegistry.providers.filter((item) => item.id !== ALTERNATE_REVIEWER_ID)
  }
  return nextRegistry
}

function assertHeadlessPeerFailsClosed({ providerRegistry, selfProviderId, label }) {
  const resolved = resolveProviderReviewBinding({
    registry: providerRegistry,
    skill: 'independent-review',
    selfProviderId,
    requireCertificationContract: true,
  })
  assert.equal(resolved.peer, null, `${label}: structural binding must not preselect a provider`)
  assert.equal(resolved.selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
  assert.equal(
    providerRegistry.providers.find((provider) => provider.id === 'generic')?.providerKind,
    'headless-protocol',
    `${label}: the generic protocol remains explicitly headless`,
  )
  assert.deepEqual(
    providerRegistry.providers
      .filter((provider) => provider.id !== selfProviderId && provider.providerKind === 'concrete-runtime')
      .map((provider) => provider.id),
    [],
    `${label}: a headless protocol may not become an independent concrete reviewer candidate`,
  )
}

function assertConcreteAlternatePeer({ providerRegistry, selfProviderId, label }) {
  const resolved = resolveProviderReviewBinding({
    registry: providerRegistry,
    skill: 'independent-review',
    selfProviderId,
    requireCertificationContract: true,
  })
  assert.equal(resolved.peer, null, `${label}: structural binding must defer capability selection`)
  assert.equal(resolved.selectionReasonCode, 'REVIEW_CAPABILITY_SELECTION_REQUIRED')
  const reviewer = providerRegistry.providers.find((provider) => provider.id === ALTERNATE_REVIEWER_ID)
  assert.equal(reviewer?.providerKind, 'concrete-runtime', `${label}: retirement reviewer must remain a concrete runtime`)
  assert.ok(reviewer?.runtime, `${label}: synthetic concrete reviewer must declare a runtime identity`)
}

function assertProjectedAlternatePeer({ manifest, selfProviderId, label }) {
  const bindings = manifest.independentReview.bindings.filter((binding) => binding.selfProviderId === selfProviderId)
  assert.equal(bindings.length, 1, `${label}: built corpus must project exactly one independent-review binding`)
  assert.equal(bindings[0].selectionPolicy, 'highest-certified-independent-review-v1')
  assert.equal(Object.hasOwn(bindings[0], 'peerProviderId'), false, `${label}: canonical projection must not pin one reviewer`)
  assert.deepEqual(
    manifest.independentReview.providerCompatibility.filter((entry) => entry.providerId === ALTERNATE_REVIEWER_ID),
    [{ providerId: ALTERNATE_REVIEWER_ID, compatibilityProviderId: ALTERNATE_REVIEWER_ID }],
    `${label}: the concrete reviewer-only provider must remain uniquely selectable through compatibility`,
  )
}

const canonicalRegistry = JSON.parse(readFileSync(new URL('../packages/governance/canonical/providers.json', import.meta.url), 'utf8'))
const canonicalRepositoryClaude = deriveProviderRepositoryManagedInventory(canonicalRegistry).find((item) => item.id === 'claude')
const canonicalProductClaude = deriveProviderProductManagedInventory(canonicalRegistry).find((item) => item.id === 'claude')
const canonicalProductInventory = deriveProviderProductManagedInventory(canonicalRegistry)
for (const repositoryOnly of ['.claude/agents', '.claude/commands', '.claude/references', '.claude/rules']) {
  assert.equal(canonicalRepositoryClaude.surfaces.some((surface) => surface.path === repositoryOnly), true)
  assert.equal(canonicalProductClaude.surfaces.some((surface) => surface.path === repositoryOnly), false)
}
assert.equal(
  canonicalProductClaude.surfaces.some((surface) => surface.path === '.claude/hooks'),
  false,
  'shared launchers belong to the provider-neutral consumer substrate, not Claude lifecycle ownership',
)
assert.equal(
  canonicalProductInventory.some((provider) => provider.surfaces.some((surface) => surface.path === 'AGENTS.md')),
  false,
  'the shared AGENTS.md authority is consumer-owned and must never enter provider lifecycle inventory',
)
assert.equal(
  canonicalRegistry.canonical.retiredProviders.some((provider) => provider.surfaces.some((surface) => surface.path === 'AGENTS.md')),
  false,
  'a provider retirement may not tombstone the shared AGENTS.md authority',
)
const canonicalLifecycle = JSON.parse(readFileSync(new URL('../packages/governance/canonical/provider-lifecycle.json', import.meta.url), 'utf8'))
const canonicalReleaseVersion = JSON.parse(readFileSync(new URL('../packages/design-system/package.json', import.meta.url), 'utf8')).version
assert.doesNotThrow(() => validateProviderLifecycleLedger({
  ledger: canonicalLifecycle,
  registry: canonicalRegistry,
  releaseVersion: canonicalReleaseVersion,
}))

const alpha = provider('alpha')
const beta = provider('beta')
const v1Registry = registry([alpha, beta])
const v1 = snapshot('1.0.0', v1Registry)
const unicodeOrderProvider = provider('unicode-order')
const unicodeOrderLeaves = ['😀', '中', 'ä', 'Z']
unicodeOrderProvider.adapter.productManagedTrees = Object.fromEntries(unicodeOrderLeaves.map((leaf, index) => [
  `surface${index}`,
  {
    sourceRoot: 'packages/design-system/ds-canonical/templates/runtime',
    destination: `.unicode-order/runtime/${leaf}`,
    materializerId: 'closed-tree-copy-v1',
    transformPolicy: 'byte-exact',
  },
]))
const unicodeOrderRegistry = registry([unicodeOrderProvider])
const expectedUnicodeOrderPaths = [
  '.unicode-order/runtime/Z',
  '.unicode-order/runtime/ä',
  '.unicode-order/runtime/中',
  '.unicode-order/runtime/😀',
]
assert.deepEqual(
  [...unicodeOrderLeaves].sort(compareUtf8Bytes),
  ['Z', 'ä', '中', '😀'],
  'canonical provider ordering must compare exact UTF-8 bytes without locale collation',
)
assert.deepEqual(
  deriveProviderProductManagedInventory(unicodeOrderRegistry)[0].surfaces
    .map((surface) => surface.path)
    .filter((path) => path.startsWith('.unicode-order/runtime/')),
  expectedUnicodeOrderPaths,
  'provider lifecycle inventory must materialize Unicode paths in canonical UTF-8 byte order',
)
const unicodeRuntimeRegistry = structuredClone(canonicalRegistry)
unicodeRuntimeRegistry.canonical.retiredProviders = [{
  id: 'unicode-retired',
  replacementProviderId: null,
  retiredInVersion: '1.0.0',
  discovery: {
    providerRootNames: ['.unicode-retired'],
    instructionNames: [],
    instructionOverrideNames: [],
    configPaths: [],
    pluginRootNames: [],
  },
  surfaces: ['Z', 'ä', '中', '😀'].map((leaf) => ({
    path: `.unicode-retired/runtime/${leaf}`,
    kind: 'file',
  })),
  transfers: [],
}]
const unicodeOrderProbe = fileURLToPath(new URL(
  './test-fixtures/provider-unicode-order-probe.mjs',
  import.meta.url,
))
for (const locale of ['en_US.UTF-8', 'sv_SE.UTF-8', 'zh_TW.UTF-8', 'tr_TR.UTF-8']) {
  const result = spawnSync(process.execPath, ['--', unicodeOrderProbe], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LANG: locale,
      LC_ALL: locale,
      GOVERNANCE_UNICODE_LIFECYCLE_REGISTRY: JSON.stringify(unicodeOrderRegistry),
      GOVERNANCE_UNICODE_RUNTIME_REGISTRY: JSON.stringify(unicodeRuntimeRegistry),
    },
  })
  assert.equal(result.status, 0, `${locale} provider ordering probe failed:\n${result.stderr}`)
  assert.deepEqual(
    JSON.parse(result.stdout),
    expectedUnicodeOrderPaths,
    `${locale} must not change provider lifecycle/runtime canonical ordering`,
  )
}
assert.equal(deriveProviderRepositoryManagedInventory(v1Registry)[0].surfaces.some(surface => surface.path === '.alpha/rules'), true)
assert.equal(deriveProviderRepositoryManagedInventory(v1Registry)[0].surfaces.some(surface => surface.path === '.alpha/runtime'), false)
assert.equal(deriveProviderProductManagedInventory(v1Registry)[0].surfaces.some(surface => surface.path === '.alpha/runtime'), true)
assert.equal(deriveProviderProductManagedInventory(v1Registry)[0].surfaces.some(surface => surface.path === '.alpha/rules'), false)
assert.equal(repositoryPathsOverlap('café/policy', 'CAFE\u0301/policy/nested'), true, 'portable ownership must Unicode-normalize and case-fold path segments')
for (const collisionPath of ['.alpha/runtime', '.alpha/runtime/nested', '.alpha', '.ALPHA/runtime', '.ALPHA']) {
  const collidingBeta = structuredClone(beta)
  collidingBeta.adapter.productManagedTrees.runtime.destination = collisionPath
  assert.throws(
    () => deriveProviderProductManagedInventory(registry([alpha, collidingBeta])),
    /cross-provider managed surface overlap/,
    `active providers may not claim exact or ancestor-overlapping surfaces:${collisionPath}`,
  )
}
const protectedGitAlias = structuredClone(beta)
protectedGitAlias.adapter.productManagedTrees.runtime.destination = '.GITHUB/workflows/provider-owned'
assert.throws(
  () => deriveProviderProductManagedInventory(registry([alpha, protectedGitAlias])),
  /outside provider mutation authority/,
  'portable protected-root validation must reject case aliases of .github',
)
const internallyAliasedSnapshot = structuredClone(v1)
internallyAliasedSnapshot.providers[0].surfaces.push({ path: '.ALPHA/runtime/nested', kind: 'tree' })
internallyAliasedSnapshot.providers[0].surfaces.sort((left, right) => compareUtf8Bytes(left.path, right.path))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([internallyAliasedSnapshot]), registry: v1Registry, releaseVersion: '1.0.0' }),
  /overlapping portable managed surfaces/,
  'an authenticated lifecycle snapshot may not contain same-provider portable aliases',
)
const aliasedDiscoverySnapshot = structuredClone(v1)
aliasedDiscoverySnapshot.providers[0].discovery.providerRootNames.push('.ALPHA')
aliasedDiscoverySnapshot.providers[0].discovery.providerRootNames.sort()
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([aliasedDiscoverySnapshot]), registry: v1Registry, releaseVersion: '1.0.0' }),
  /discovery\.providerRootNames contains a portable alias:\.alpha/i,
  'the independently authenticated lifecycle may not hide a portable discovery alias behind distinct bytes',
)
const openDiscoverySnapshot = structuredClone(v1)
openDiscoverySnapshot.providers[0].discovery.unreviewedRoots = []
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([openDiscoverySnapshot]), registry: v1Registry, releaseVersion: '1.0.0' }),
  /discovery must have the closed canonical shape/,
  'the lifecycle discovery record remains closed even when its outer snapshot is well-shaped',
)

const additionRegistry = registry([alpha, beta, provider('gamma')])
const addition = snapshot('1.1.0', additionRegistry, [], lifecycleSnapshotSha256(v1))
assert.doesNotThrow(() => validateProviderLifecycleLedger({
  ledger: ledger([v1, addition]),
  registry: additionRegistry,
  releaseVersion: addition.releaseVersion,
}), 'ordinary provider additions must be represented by the exact current inventory')

const reservedExpansionAlpha = structuredClone(alpha)
reservedExpansionAlpha.adapter.productManagedTrees.telemetry = {
  sourceRoot: 'packages/design-system/ds-canonical/templates/runtime',
  destination: '.alpha/telemetry',
  materializerId: 'closed-tree-copy-v1',
  transformPolicy: 'byte-exact',
}
const reservedExpansionRegistry = registry([reservedExpansionAlpha, beta])
const reservedExpansion = snapshot('1.1.0', reservedExpansionRegistry, [], lifecycleSnapshotSha256(v1))
assert.doesNotThrow(
  () => validateProviderLifecycleLedger({
    ledger: ledger([v1, reservedExpansion]),
    registry: reservedExpansionRegistry,
    releaseVersion: reservedExpansion.releaseVersion,
  }),
  'a retained provider may expand inside its previously reviewed provider root',
)
const unreservedExpansionAlpha = structuredClone(alpha)
unreservedExpansionAlpha.adapter.productManagedTrees.productSource = {
  sourceRoot: 'packages/design-system/ds-canonical/templates/runtime',
  destination: 'apps/product-owned',
  materializerId: 'closed-tree-copy-v1',
  transformPolicy: 'byte-exact',
}
const unreservedExpansionRegistry = registry([unreservedExpansionAlpha, beta])
const unreservedExpansion = snapshot('1.1.0', unreservedExpansionRegistry, [], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({
    ledger: ledger([v1, unreservedExpansion]),
    registry: unreservedExpansionRegistry,
    releaseVersion: unreservedExpansion.releaseVersion,
  }),
  /managed surface outside its previously reviewed discovery namespace.*apps\/product-owned.*reviewed bootstrap/,
  'an ordinary retained-provider upgrade may not claim a product path outside its reviewed namespace',
)

const betaInventory = deriveProviderProductManagedInventory(v1Registry).find((item) => item.id === 'beta')
const retirement = {
  id: 'beta',
  replacementProviderId: 'alpha',
  retiredInVersion: '2.0.0',
  reasonCode: 'PROVIDER_REPLACED',
  discovery: structuredClone(betaInventory.discovery),
  surfaces: betaInventory.surfaces.map((surface, index) => ({ ...surface, sha256: String(index + 1).padStart(64, '0') })),
}
const v2Registry = registry([alpha], [retirement])
const v2 = snapshot('2.0.0', v2Registry, [retirement], lifecycleSnapshotSha256(v1))
const validLedger = ledger([v1, v2])
assert.doesNotThrow(() => validateProviderLifecycleLedger({ ledger: validLedger, registry: v2Registry, releaseVersion: '2.0.0' }))

const authenticated = buildAuthenticatedProviderLifecycle({ ledger: validLedger, registry: v2Registry, releaseVersion: '2.0.0' })
assert.equal(validLedger.schemaVersion, 1, 'the canonical ledger remains schema v1 while its portable authenticated view evolves')
assert.equal(authenticated.schemaVersion, 4)
assert.equal(authenticated.currentProviderInventorySha256, providerInventorySha256(v2.providers))
assert.equal(authenticated.retiredProviders[0].priorSnapshotSha256, lifecycleSnapshotSha256(v1))
assert.equal(Object.hasOwn(authenticated.retiredProviders[0], 'transfers'), false, 'deletion-only retirement projection must not invent transfers')
assert.deepEqual(authenticated.currentSnapshot, v2, 'v4 must close over the exact current snapshot body')
assert.deepEqual(authenticated.immutableHeadSnapshot, v1, 'v4 must close over the exact immutable-head snapshot body')
assert.strictEqual(validateAuthenticatedProviderLifecycle(authenticated), authenticated)

const legacyAuthenticated = structuredClone(authenticated)
legacyAuthenticated.schemaVersion = 3
delete legacyAuthenticated.currentSnapshot
delete legacyAuthenticated.immutableHeadSnapshot
assert.throws(
  () => validateAuthenticatedProviderLifecycle(legacyAuthenticated),
  /requires explicit allowLegacyV3 compatibility/,
  'the unverifiable v3 view must fail closed unless a caller deliberately enables migration compatibility',
)
assert.strictEqual(
  validateAuthenticatedProviderLifecycle(legacyAuthenticated, { allowLegacyV3: true }),
  legacyAuthenticated,
  'legacy v3 migration remains possible only through the explicit weaker-validation option',
)

const poisonedCurrentSnapshot = structuredClone(authenticated)
poisonedCurrentSnapshot.currentSnapshot.providers[0].surfaces[0].path = '.alpha/poisoned-runtime'
assert.throws(
  () => validateAuthenticatedProviderLifecycle(poisonedCurrentSnapshot),
  /currentSnapshotSha256 does not bind currentSnapshot/,
  'v4 must reject a closed current snapshot body whose authenticated hash was not updated',
)
const openCurrentSnapshot = structuredClone(authenticated)
openCurrentSnapshot.currentSnapshot.unreviewedAuthority = {}
assert.throws(
  () => validateAuthenticatedProviderLifecycle(openCurrentSnapshot),
  /currentSnapshot must have the closed canonical shape/,
  'v4 snapshot bodies must reject unknown authority-bearing fields before hash evaluation',
)
const poisonedCurrentProviderHash = structuredClone(authenticated)
poisonedCurrentProviderHash.currentProviderInventorySha256 = 'f'.repeat(64)
assert.throws(
  () => validateAuthenticatedProviderLifecycle(poisonedCurrentProviderHash),
  /currentProviderInventorySha256 does not bind currentSnapshot\.providers/,
  'v4 must recompute rather than trust the advertised current provider inventory hash',
)
const poisonedImmutableHead = structuredClone(authenticated)
poisonedImmutableHead.immutableHeadSnapshot.providers[0].surfaces[0].path = '.alpha/poisoned-head'
assert.throws(
  () => validateAuthenticatedProviderLifecycle(poisonedImmutableHead),
  /immutableHead\.snapshotSha256 does not bind immutableHeadSnapshot/,
  'v4 must reject a rewritten immutable-head snapshot body',
)
const poisonedRetirementOrigin = structuredClone(authenticated)
poisonedRetirementOrigin.retiredProviders[0].priorProviderSha256 = 'f'.repeat(64)
assert.throws(
  () => validateAuthenticatedProviderLifecycle(poisonedRetirementOrigin),
  /origin hashes do not bind immutableHeadSnapshot/,
  'v4 must authenticate a newly appended retirement against its exact prior provider body',
)

const renamedBeta = structuredClone(beta)
renamedBeta.id = 'beta-renamed'
const renameRetirement = {
  id: 'beta',
  replacementProviderId: renamedBeta.id,
  retiredInVersion: '2.0.0',
  reasonCode: 'PROVIDER_RENAMED',
  discovery: structuredClone(betaInventory.discovery),
  surfaces: [],
  transfers: structuredClone(betaInventory.surfaces),
}
const renameRegistry = registry([alpha, renamedBeta], [registryRetirement(renameRetirement)])
const renamedV2 = snapshot('2.0.0', renameRegistry, [renameRetirement], lifecycleSnapshotSha256(v1))
assert.doesNotThrow(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, renamedV2]), registry: renameRegistry, releaseVersion: '2.0.0' }),
  'a pure provider id rename may transfer every exact managed surface without deleting it',
)
const authenticatedRename = buildAuthenticatedProviderLifecycle({ ledger: ledger([v1, renamedV2]), registry: renameRegistry, releaseVersion: '2.0.0' })
assert.deepEqual(authenticatedRename.retiredProviders[0].transfers, betaInventory.surfaces)
assert.deepEqual(authenticatedRename.retiredProviders[0].surfaces, [])
const authenticatedV1 = buildAuthenticatedProviderLifecycle({ ledger: ledger([v1]), registry: v1Registry, releaseVersion: '1.0.0' })
const commonInstruction = {
  schemaVersion: 1,
  artifact: 'common/instruction.md',
  destination: 'AGENTS.md',
  materializerId: 'shared-instruction-v1',
}
const transitionCorpus = (providerLifecycle, activeProviders) => ({
  manifest: {
    providerLifecycle,
    discoveryPolicy: {
      schemaVersion: 1,
      providerRootNames: ['.agents', '.claude', '.codex'],
      instructionNames: ['AGENTS.md', 'CLAUDE.md'],
      instructionOverrideNames: ['AGENTS.local.md', 'AGENTS.override.md', 'CLAUDE.local.md', 'CLAUDE.override.md'],
      configPaths: ['.claude/settings.json', '.codex/hooks.json'],
      pluginRootNames: ['.claude-plugin', '.codex-plugin'],
    },
    launchers: ['dispatcher.sh', 'normalize.mjs'],
    consumer: {
      commonInstruction: structuredClone(commonInstruction),
      launcherDestination: 'governance/bin',
      managedFiles: {
        'scripts/governance-check.mjs': 'consumer/checker.blob',
        'scripts/helper.mjs': 'consumer/helper.blob',
      },
      materialization: {
        exactPaths: [
          'AGENTS.md',
          'governance/bin/dispatcher.sh',
          'governance/bin/normalize.mjs',
          'package.json',
          'scripts/governance-check.mjs',
          'scripts/helper.mjs',
        ],
        pathPrefixes: [],
      },
    },
  },
  bom: {
    payload: {
      requiredScripts: {
        'governance:check': 'node scripts/governance-check.mjs',
        'sync-all': 'node scripts/sync-all.mjs',
      },
    },
  },
  activeProviders,
})
const transitionPrevious = transitionCorpus(authenticatedV1, v1.providers)
const transitionCurrent = transitionCorpus(authenticatedRename, renamedV2.providers)
const authenticatedAddition = buildAuthenticatedProviderLifecycle({
  ledger: ledger([v1, addition]),
  registry: additionRegistry,
  releaseVersion: addition.releaseVersion,
})
const unreservedProviderCurrent = transitionCorpus(authenticatedAddition, addition.providers)
assert.throws(
  () => validateInstalledProviderTransition(transitionPrevious, unreservedProviderCurrent),
  /gamma added managed surface outside every previously reviewed provider namespace:.*\.gamma.*reviewed bootstrap/,
  'a newly authenticated provider still needs its consumer namespace established by reviewed bootstrap',
)
const reservedProviderPrevious = structuredClone(transitionPrevious)
const reservedProviderCurrent = structuredClone(unreservedProviderCurrent)
for (const corpus of [reservedProviderPrevious, reservedProviderCurrent]) {
  corpus.manifest.discoveryPolicy.providerRootNames.push('.gamma')
  corpus.manifest.discoveryPolicy.providerRootNames.sort()
  corpus.manifest.discoveryPolicy.instructionNames.push('GAMMA.md')
  corpus.manifest.discoveryPolicy.instructionNames.sort()
  corpus.manifest.discoveryPolicy.configPaths.push('.gamma/hooks.json')
  corpus.manifest.discoveryPolicy.configPaths.sort()
}
assert.equal(
  validateInstalledProviderTransition(reservedProviderPrevious, reservedProviderCurrent).mode,
  'upgrade',
  'a future provider can onboard without a special updater once reviewed bootstrap reserved its namespaces',
)
for (const [field, value] of [['destination', 'COMMON.md'], ['materializerId', 'shared-instruction-v2']]) {
  const poisoned = structuredClone(transitionCurrent)
  poisoned.manifest.consumer.commonInstruction[field] = value
  assert.throws(
    () => validateInstalledProviderTransition(transitionPrevious, poisoned),
    /ordinary upgrade may not rename or rematerialize the common instruction authority/,
    `ordinary upgrades must fail closed when common instruction ${field} changes`,
  )
}
const replaceExactMaterializationPath = (corpus, previous, current) => {
  corpus.manifest.consumer.materialization.exactPaths = corpus.manifest.consumer.materialization.exactPaths
    .map((path) => path === previous ? current : path)
    .sort()
}
const expandedNonProviderCurrent = structuredClone(transitionCurrent)
expandedNonProviderCurrent.manifest.launchers = ['audit-runtime.mjs', ...expandedNonProviderCurrent.manifest.launchers].sort()
expandedNonProviderCurrent.manifest.consumer.managedFiles['scripts/new-helper.mjs'] = 'consumer/new-helper.blob'
expandedNonProviderCurrent.bom.payload.requiredScripts['setup:governance'] = 'node scripts/setup-governance.mjs'
expandedNonProviderCurrent.manifest.discoveryPolicy.configPaths = [
  ...expandedNonProviderCurrent.manifest.discoveryPolicy.configPaths,
  '.claude/provider-extra.json',
].sort()
expandedNonProviderCurrent.bom.payload.requiredScripts = Object.fromEntries(
  Object.entries(expandedNonProviderCurrent.bom.payload.requiredScripts).sort(([left], [right]) => compareUtf8Bytes(left, right)),
)
expandedNonProviderCurrent.manifest.consumer.materialization.exactPaths.push(
  'governance/bin/audit-runtime.mjs',
  'scripts/new-helper.mjs',
)
expandedNonProviderCurrent.manifest.consumer.materialization.exactPaths.sort()
const expandedNonProviderTransition = validateInstalledProviderTransition(transitionPrevious, expandedNonProviderCurrent)
assert.equal(
  expandedNonProviderTransition.mode,
  'upgrade',
  'ordinary upgrade may monotonically add generic launchers, managed files, and required scripts',
)
assert.deepEqual(
  expandedNonProviderTransition.managedAdditions,
  ['scripts/new-helper.mjs'],
  'the certified transition capability binds the exact generic managed-file addition set',
)
const managedCollisionRoot = realpathSync(mkdtempSync(join(tmpdir(), 'managed-addition-collision-')))
try {
  mkdirSync(join(managedCollisionRoot, 'scripts'))
  assert.doesNotThrow(
    () => assertUnclaimedManagedAdditions(managedCollisionRoot, ['scripts/new-helper.mjs']),
    'a new managed destination may be materialized when its reviewed namespace is unclaimed',
  )
  writeFileSync(join(managedCollisionRoot, 'scripts/new-helper.mjs'), 'product-owned bytes\n')
  assert.throws(
    () => assertUnclaimedManagedAdditions(managedCollisionRoot, ['scripts/new-helper.mjs']),
    /new consumer managed-file target already exists:scripts\/new-helper\.mjs/,
    'an ordinary release may not adopt or overwrite a pre-existing product file at a newly claimed managed destination',
  )
} finally {
  rmSync(managedCollisionRoot, { recursive: true, force: true })
}
assert.equal(
  expandedNonProviderCurrent.bom.payload.requiredScripts['governance:check'],
  transitionPrevious.bom.payload.requiredScripts['governance:check'],
  'adding a required command must preserve every previously established command byte-for-byte',
)
for (const [label, mutate, expected] of [
  ['shared launcher destination rename', (corpus) => {
    corpus.manifest.consumer.launcherDestination = 'governance/runtime'
    corpus.manifest.consumer.materialization.exactPaths = corpus.manifest.consumer.materialization.exactPaths
      .map((path) => path.startsWith('governance/bin/') ? path.replace('governance/bin/', 'governance/runtime/') : path)
      .sort()
  }, /may not rename the shared launcher destination/],
  ['shared launcher drop', (corpus) => { corpus.manifest.launchers = ['normalize.mjs'] }, /remove or rename shared launcher.*dispatcher\.sh/],
  ['shared launcher rename', (corpus) => {
    corpus.manifest.launchers = ['dispatcher-v2.sh', 'normalize.mjs']
    replaceExactMaterializationPath(corpus, 'governance/bin/dispatcher.sh', 'governance/bin/dispatcher-v2.sh')
  }, /remove or rename shared launcher.*dispatcher\.sh/],
  ['managed helper drop', (corpus) => { delete corpus.manifest.consumer.managedFiles['scripts/helper.mjs'] }, /remove or rename consumer managed-file authority.*scripts\/helper\.mjs/],
  ['managed checker rename', (corpus) => {
    const artifact = corpus.manifest.consumer.managedFiles['scripts/governance-check.mjs']
    delete corpus.manifest.consumer.managedFiles['scripts/governance-check.mjs']
    corpus.manifest.consumer.managedFiles['scripts/governance-verify.mjs'] = artifact
    replaceExactMaterializationPath(corpus, 'scripts/governance-check.mjs', 'scripts/governance-verify.mjs')
  }, /remove or rename consumer managed-file authority.*scripts\/governance-check\.mjs/],
  ['managed authority in new product namespace', (corpus) => {
    corpus.manifest.consumer.managedFiles['apps/demo/src/governance-owned.mjs'] = 'consumer/product-namespace.blob'
    corpus.manifest.consumer.materialization.exactPaths.push('apps/demo/src/governance-owned.mjs')
    corpus.manifest.consumer.materialization.exactPaths.sort()
  }, /may not establish consumer managed-file authority in a new product namespace.*apps\/demo\/src\/governance-owned\.mjs/],
  ['required script drop', (corpus) => { delete corpus.bom.payload.requiredScripts['sync-all'] }, /remove or rename required package script.*sync-all/],
  ['required script rename', (corpus) => {
    delete corpus.bom.payload.requiredScripts['governance:check']
    corpus.bom.payload.requiredScripts = {
      'governance:verify': 'node scripts/governance-check.mjs',
      ...corpus.bom.payload.requiredScripts,
    }
  }, /remove or rename required package script.*governance:check/],
  ['required script command self-disable', (corpus) => {
    corpus.bom.payload.requiredScripts['governance:check'] = 'true'
  }, /may not change an existing required package script command.*governance:check/],
  ['discovery policy shrink', (corpus) => {
    corpus.manifest.discoveryPolicy.instructionNames = ['AGENTS.md']
  }, /may not shrink or rename discovery policy instructionNames:CLAUDE\.md/],
  ['new provider discovery namespace', (corpus) => {
    corpus.manifest.discoveryPolicy.providerRootNames.push('.unreviewed-provider')
    corpus.manifest.discoveryPolicy.providerRootNames.sort()
  }, /may not establish a new provider discovery namespace.*providerRootNames:\.unreviewed-provider/],
  ['managed authority omitted from materialization', (corpus) => {
    corpus.manifest.consumer.materialization.exactPaths = corpus.manifest.consumer.materialization.exactPaths
      .filter((path) => path !== 'scripts/helper.mjs')
  }, /materialization inventory omits non-provider authority:scripts\/helper\.mjs/],
]) {
  const poisoned = structuredClone(transitionCurrent)
  mutate(poisoned)
  assert.throws(
    () => validateInstalledProviderTransition(transitionPrevious, poisoned),
    expected,
    `ordinary upgrade must reject ${label} before materialization can leave an orphan`,
  )
}
const arbitraryProviderAuthority = structuredClone(transitionCurrent)
arbitraryProviderAuthority.activeProviders.find((item) => item.id === 'beta-renamed').surfaces.push({
  path: 'apps/demo/src/provider-owned',
  kind: 'tree',
})
arbitraryProviderAuthority.activeProviders.find((item) => item.id === 'beta-renamed').surfaces
  .sort((left, right) => compareUtf8Bytes(left.path, right.path))
assert.throws(
  () => validateInstalledProviderTransition(transitionPrevious, arbitraryProviderAuthority),
  /current corpus active provider ids\/surfaces differ from its authenticated currentSnapshot/,
  'post-validation active-provider tampering must fail its exact authenticated currentSnapshot binding',
)
const replayEvidence = {
  releaseVersion: '1.0.0',
  consumerBomSha256: '1'.repeat(64),
  forkCorpusLockSha256: '2'.repeat(64),
  manifestSha256: '3'.repeat(64),
  providerLifecycleSha256: '4'.repeat(64),
}
const replayPrevious = { ...transitionPrevious, evidence: replayEvidence }
const incompleteReplay = structuredClone(replayPrevious)
delete incompleteReplay.evidence.consumerBomSha256
assert.throws(
  () => validateInstalledProviderTransition(incompleteReplay, incompleteReplay),
  /provider corpus evidence has an open or incomplete shape/,
  'same-version replay requires every digest in the complete validated corpus evidence record',
)
const replayPoison = structuredClone(replayPrevious)
replayPoison.evidence.manifestSha256 = '5'.repeat(64)
assert.throws(
  () => validateInstalledProviderTransition(replayPrevious, replayPoison),
  /same-version provider refresh is not an exact corpus\/lifecycle replay/,
  'same-version replay must bind the complete validated corpus evidence, not only provider lifecycle bytes',
)
assert.equal(validateInstalledProviderTransition(replayPrevious, replayPrevious).mode, 'replay')

const renameTransition = validateInstalledProviderTransition(transitionPrevious, transitionCurrent)
assert.equal(renameTransition.mode, 'upgrade')
assert.deepEqual(renameTransition.additions, [])
assert.deepEqual(renameTransition.managedAdditions, [])
assert.deepEqual(renameTransition.retirements[0].transfers, betaInventory.surfaces)
assert.deepEqual(renameTransition.retirements[0].surfaces, [])

const ghostReplacement = structuredClone(retirement)
ghostReplacement.replacementProviderId = 'ghost-provider'
const ghostRegistry = registry([alpha], [registryRetirement(ghostReplacement)])
const ghostV2 = snapshot('2.0.0', ghostRegistry, [ghostReplacement], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, ghostV2]), registry: ghostRegistry, releaseVersion: '2.0.0' }),
  /replacementProviderId must name a distinct active current provider/,
  'a retirement may not name an absent replacement provider',
)

const selfReplacement = structuredClone(retirement)
selfReplacement.replacementProviderId = selfReplacement.id
const selfRegistry = registry([alpha], [registryRetirement(selfReplacement)])
const selfV2 = snapshot('2.0.0', selfRegistry, [selfReplacement], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, selfV2]), registry: selfRegistry, releaseVersion: '2.0.0' }),
  /replacementProviderId must name a distinct active current provider/,
  'a retirement may not replace a provider with itself',
)

const nullTransfer = structuredClone(renameRetirement)
nullTransfer.replacementProviderId = null
const nullTransferRegistry = registry([alpha, renamedBeta], [registryRetirement(nullTransfer)])
const nullTransferV2 = snapshot('2.0.0', nullTransferRegistry, [nullTransfer], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, nullTransferV2]), registry: nullTransferRegistry, releaseVersion: '2.0.0' }),
  /cannot transfer surfaces without a replacementProviderId|null replacementProviderId cannot transfer surfaces/,
  'a null replacement may delete surfaces but may not transfer them',
)

const wrongOwnerTransfer = structuredClone(renameRetirement)
wrongOwnerTransfer.replacementProviderId = 'alpha'
const wrongOwnerRegistry = registry([alpha, renamedBeta], [registryRetirement(wrongOwnerTransfer)])
const wrongOwnerV2 = snapshot('2.0.0', wrongOwnerRegistry, [wrongOwnerTransfer], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, wrongOwnerV2]), registry: wrongOwnerRegistry, releaseVersion: '2.0.0' }),
  /transfer is not exactly owned by replacement alpha/,
  'a transfer must be owned by the named replacement rather than any active provider',
)

const missingPartition = structuredClone(renameRetirement)
missingPartition.transfers.pop()
const missingPartitionRegistry = registry([alpha, renamedBeta], [registryRetirement(missingPartition)])
const missingPartitionV2 = snapshot('2.0.0', missingPartitionRegistry, [missingPartition], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, missingPartitionV2]), registry: missingPartitionRegistry, releaseVersion: '2.0.0' }),
  /must exactly partition the previous immutable managed surfaces/,
  'every prior surface must be represented exactly once as deletion or transfer',
)

const duplicatePartition = structuredClone(renameRetirement)
duplicatePartition.surfaces = [{ ...duplicatePartition.transfers[0], sha256: 'a'.repeat(64) }]
const duplicatePartitionRegistry = registry([alpha, renamedBeta], [registryRetirement(duplicatePartition)])
const duplicatePartitionV2 = snapshot('2.0.0', duplicatePartitionRegistry, [duplicatePartition], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, duplicatePartitionV2]), registry: duplicatePartitionRegistry, releaseVersion: '2.0.0' }),
  /deletion\/transfer partition contains a duplicate surface path/,
  'one prior surface cannot be both deleted and transferred',
)

const activeTombstone = structuredClone(renameRetirement)
activeTombstone.surfaces = activeTombstone.transfers.map((surface, index) => ({ ...surface, sha256: String(index + 1).padStart(64, 'b') }))
delete activeTombstone.transfers
const activeTombstoneRegistry = registry([alpha, renamedBeta], [registryRetirement(activeTombstone)])
const activeTombstoneV2 = snapshot('2.0.0', activeTombstoneRegistry, [activeTombstone], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, activeTombstoneV2]), registry: activeTombstoneRegistry, releaseVersion: '2.0.0' }),
  /deletion tombstone remains owned by an active provider/,
  'a still-owned destination must be explicitly transferred rather than mislabeled as deleted',
)

const missingDeletionHash = structuredClone(retirement)
delete missingDeletionHash.surfaces[0].sha256
const missingHashRegistry = registry([alpha], [registryRetirement(retirement)])
const missingHashV2 = snapshot('2.0.0', missingHashRegistry, [missingDeletionHash], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, missingHashV2]), registry: missingHashRegistry, releaseVersion: '2.0.0' }),
  /closed canonical shape|sha256 is invalid/,
  'deletion tombstones retain their immutable content digest requirement',
)

const madeUpRetirement = structuredClone(retirement)
madeUpRetirement.surfaces = [{ path: '.made-up/provider-data', kind: 'tree', sha256: 'f'.repeat(64) }]
const madeUpRegistry = registry([alpha], [madeUpRetirement])
const madeUpV2 = snapshot('2.0.0', madeUpRegistry, [madeUpRetirement], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, madeUpV2]), registry: madeUpRegistry, releaseVersion: '2.0.0' }),
  /deletion and transfer records must exactly partition the previous immutable managed surfaces/,
  'a retirement may not invent a never-managed destination',
)

const wrongVersionRetirement = structuredClone(retirement)
wrongVersionRetirement.retiredInVersion = '1.9.0'
const wrongVersionRegistry = registry([alpha], [wrongVersionRetirement])
const wrongVersionV2 = snapshot('2.0.0', wrongVersionRegistry, [wrongVersionRetirement], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: ledger([v1, wrongVersionV2]), registry: wrongVersionRegistry, releaseVersion: '2.0.0' }),
  /retiredInVersion must equal current release/,
)

const historyRemovedRegistry = registry([alpha], [])
const v3WithoutHistory = snapshot('3.0.0', historyRemovedRegistry, [], lifecycleSnapshotSha256(v2))
assert.throws(
  () => validateProviderLifecycleLedger({
    ledger: ledger([v1, v2, v3WithoutHistory], v2),
    registry: historyRemovedRegistry,
    releaseVersion: '3.0.0',
  }),
  /retired provider ledger is append-only|prior retired provider records may not be removed/,
  'a later release may not erase a prior retirement',
)

const alphaWithoutRuntime = structuredClone(alpha)
alphaWithoutRuntime.adapter.productManagedTrees = {}
const partialRemovalRegistry = registry([alphaWithoutRuntime, beta])
const partialRemoval = snapshot('1.1.0', partialRemovalRegistry, [], lifecycleSnapshotSha256(v1))
assert.throws(
  () => validateProviderLifecycleLedger({
    ledger: ledger([v1, partialRemoval]),
    registry: partialRemovalRegistry,
    releaseVersion: '1.1.0',
  }),
  /removed or changed managed surface \.alpha\/runtime without retiring the provider/,
  'a retained provider cannot silently subtract an ordinary managed surface',
)

const rewrittenHead = structuredClone(validLedger)
rewrittenHead.immutableHead = head(v2)
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: rewrittenHead, registry: v2Registry, releaseVersion: '2.0.0' }),
  /immutableHead must be the immediately previous retained release/,
  'the candidate cannot declare itself to be its own immutable predecessor',
)

const rewrittenImmutableSnapshot = structuredClone(validLedger)
rewrittenImmutableSnapshot.snapshots[0].providers[0].surfaces[0].path = '.alpha/rewritten-runtime'
assert.throws(
  () => validateProviderLifecycleLedger({ ledger: rewrittenImmutableSnapshot, registry: v2Registry, releaseVersion: '2.0.0' }),
  /immutableHead|previousSnapshotSha256/,
  'once a successor snapshot exists, rewriting any byte of its immutable predecessor must invalidate the digest chain',
)

// A real certified-provider retirement exercises the complete product path, not only the abstract
// lifecycle helpers: corpus build, consumer template convergence, installed-corpus authentication,
// durable refresh authorization, exact tombstone cleanup, and survival of the common instruction.
const retirementRoot = realpathSync(mkdtempSync(join(tmpdir(), 'certified-provider-retirement-')))
try {
  const priorVersion = canonicalReleaseVersion
  const nextVersion = priorVersion.replace(/-beta\.(\d+)$/, (_, value) => `-beta.${Number(value) + 1}`)
  assert.notEqual(nextVersion, priorVersion, 'certified retirement fixture requires the current beta release sequence')
  const priorRegistry = structuredClone(PROVIDER_REGISTRY)
  addSyntheticConcreteReviewer(priorRegistry)
  const priorSnapshot = snapshot(priorVersion, priorRegistry)
  const priorLifecycle = ledger([priorSnapshot])
  const priorFork = join(retirementRoot, 'prior', 'fork')
  const priorTemplate = join(retirementRoot, 'prior', 'template')
  mkdirSync(join(retirementRoot, 'prior'), { recursive: true })
  const priorBuilt = buildCorpus({
    outDir: priorFork,
    templateRoot: priorTemplate,
    providerRegistry: priorRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: priorLifecycle,
    releaseVersion: priorVersion,
  })
  const priorCodex = deriveProviderProductManagedInventory(priorRegistry).find((item) => item.id === 'codex')
  assert.ok(priorCodex, 'canonical retirement fixture needs the current Codex provider inventory')
  assert.equal(priorCodex.surfaces.some((surface) => surface.path === priorBuilt.manifest.consumer.commonInstruction.destination), false)

  const divergentCommonDestination = structuredClone(priorRegistry)
  divergentCommonDestination.providers.find((item) => item.id === 'claude').sharedInstructionEntry = 'COMMON.md'
  assert.throws(
    () => buildCorpus({
      outDir: join(retirementRoot, 'divergent-common', 'fork'),
      templateRoot: join(retirementRoot, 'divergent-common', 'template'),
      providerRegistry: divergentCommonDestination,
      providerCompatibility: retirementProviderCompatibility,
      providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
      providerLifecycle: priorLifecycle,
      releaseVersion: priorVersion,
    }),
    /must agree on exactly one shared instruction destination/,
    'generated providers may not create competing common-instruction destinations',
  )
  const renamedCommonRegistry = structuredClone(priorRegistry)
  const renamedCommonDestination = 'COMMON.md'
  for (const providerRecord of renamedCommonRegistry.providers) {
    providerRecord.sharedInstructionEntry = renamedCommonDestination
    const materializer = renamedCommonRegistry.canonical.materializers.instructionViews[providerRecord.adapter.instructionView.materializerId]
    if (materializer.engine === 'shared-instruction-v1') {
      const formerInstruction = providerRecord.instructionEntry
      providerRecord.instructionEntry = renamedCommonDestination
      providerRecord.adapter.discovery.instructionNames = [
        ...new Set(providerRecord.adapter.discovery.instructionNames.map((name) => (
          name === formerInstruction ? renamedCommonDestination : name
        ))),
      ].sort()
    }
  }
  renamedCommonRegistry.canonical.reservedDiscovery.instructionNames = [
    ...new Set([...renamedCommonRegistry.canonical.reservedDiscovery.instructionNames, renamedCommonDestination]),
  ].sort()
  const renamedCommonSnapshot = snapshot(priorVersion, renamedCommonRegistry)
  const renamedCommonRoot = join(retirementRoot, 'renamed-common')
  const renamedCommonFork = join(renamedCommonRoot, 'fork')
  const renamedCommonTemplate = join(renamedCommonRoot, 'template')
  mkdirSync(renamedCommonRoot, { recursive: true })
  const renamedCommonBuilt = buildCorpus({
    outDir: renamedCommonFork,
    templateRoot: renamedCommonTemplate,
    providerRegistry: renamedCommonRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: ledger([renamedCommonSnapshot]),
    releaseVersion: priorVersion,
  })
  assert.equal(renamedCommonBuilt.manifest.consumer.commonInstruction.destination, renamedCommonDestination)
  assert.equal(existsSync(join(renamedCommonTemplate, renamedCommonDestination)), true)
  assert.equal(existsSync(join(renamedCommonTemplate, 'AGENTS.md')), false, 'common alias must follow the registry destination rather than a fixed filename')
  assert.equal(readFileSync(join(renamedCommonTemplate, 'CLAUDE.md'), 'utf8').startsWith(`@${renamedCommonDestination}\n`), true)
  const renamedCommonDs = join(renamedCommonTemplate, 'node_modules', '@qijenchen', 'design-system')
  mkdirSync(join(renamedCommonDs, 'ds-canonical'), { recursive: true })
  cpSync(renamedCommonFork, join(renamedCommonDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(renamedCommonDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: priorVersion }, null, 2)}\n`)
  const renamedLauncher = join(renamedCommonTemplate, renamedCommonBuilt.manifest.consumer.launcherDestination, 'inject_fork_governance_preamble.sh')
  const renamedLauncherRun = spawnSync('bash', ['--', renamedLauncher, 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, GOVERNANCE_PROJECT_DIR: renamedCommonTemplate },
  })
  assert.equal(renamedLauncherRun.status, 0, renamedLauncherRun.stderr)
  const renamedContext = JSON.parse(renamedLauncherRun.stdout).hookSpecificOutput.additionalContext
  assert.equal(renamedContext.includes(`committed ${renamedCommonDestination}`), true)
  assert.equal(`${renamedLauncherRun.stdout}\n${renamedLauncherRun.stderr}`.includes('AGENTS.md 不存在'), false)
  const unavailableLauncherRoot = join(renamedCommonRoot, 'dependencies-unavailable')
  mkdirSync(unavailableLauncherRoot, { recursive: true })
  const unavailableLauncherRun = spawnSync('bash', ['--', renamedLauncher, 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, GOVERNANCE_PROJECT_DIR: unavailableLauncherRoot },
  })
  assert.equal(unavailableLauncherRun.status, 0)
  assert.equal(unavailableLauncherRun.stderr.includes('GOVERNANCE-COMMON-INSTRUCTION-UNAVAILABLE'), true)
  assert.equal(unavailableLauncherRun.stderr.includes('AGENTS.md 不存在'), false, 'missing dependencies must not be misreported as a fixed instruction filename')

  const ambiguousCommonMaterializer = structuredClone(priorRegistry)
  ambiguousCommonMaterializer.canonical.materializers.instructionViews['common-authority-v2'] = structuredClone(
    ambiguousCommonMaterializer.canonical.materializers.instructionViews['shared-instruction-v1'],
  )
  ambiguousCommonMaterializer.canonical.materializers.instructionViews = Object.fromEntries(
    Object.entries(ambiguousCommonMaterializer.canonical.materializers.instructionViews)
      .sort(([left], [right]) => compareUtf8Bytes(left, right)),
  )
  assert.throws(
    () => buildCorpus({
      outDir: join(retirementRoot, 'ambiguous-common', 'fork'),
      templateRoot: join(retirementRoot, 'ambiguous-common', 'template'),
      providerRegistry: ambiguousCommonMaterializer,
      providerCompatibility: retirementProviderCompatibility,
      providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
      providerLifecycle: priorLifecycle,
      releaseVersion: priorVersion,
    }),
    /exactly one common-authority shared instruction materializer/,
    'the registry may not declare two competing common-authority materializers',
  )

  // Registry keys are identifiers, not engine names. Versioning the one registered common
  // materializer must update every generated reference without requiring a code change.
  const renamedMaterializerRegistry = structuredClone(priorRegistry)
  const renamedCommonMaterializerId = 'common-authority-v2'
  renamedMaterializerRegistry.canonical.materializers.instructionViews[renamedCommonMaterializerId] =
    renamedMaterializerRegistry.canonical.materializers.instructionViews['shared-instruction-v1']
  delete renamedMaterializerRegistry.canonical.materializers.instructionViews['shared-instruction-v1']
  renamedMaterializerRegistry.canonical.materializers.instructionViews = Object.fromEntries(
    Object.entries(renamedMaterializerRegistry.canonical.materializers.instructionViews)
      .sort(([left], [right]) => compareUtf8Bytes(left, right)),
  )
  for (const activeProvider of renamedMaterializerRegistry.providers) {
    if (activeProvider.adapter.instructionView.materializerId === 'shared-instruction-v1') {
      activeProvider.adapter.instructionView.materializerId = renamedCommonMaterializerId
    }
  }
  const renamedMaterializerRoot = join(retirementRoot, 'renamed-materializer')
  mkdirSync(renamedMaterializerRoot, { recursive: true })
  const renamedMaterializerFork = join(renamedMaterializerRoot, 'fork')
  const renamedMaterializerTemplate = join(renamedMaterializerRoot, 'template')
  const renamedMaterializerBuilt = buildCorpus({
    outDir: renamedMaterializerFork,
    templateRoot: renamedMaterializerTemplate,
    providerRegistry: renamedMaterializerRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: priorLifecycle,
    releaseVersion: priorVersion,
  })
  assert.equal(renamedMaterializerBuilt.manifest.consumer.commonInstruction.materializerId, renamedCommonMaterializerId)
  assert.equal(renamedMaterializerBuilt.manifest.providerSurfaces.codex.instructionMaterializerId, renamedCommonMaterializerId)
  const renamedMaterializerConsumer = join(renamedMaterializerRoot, 'consumer')
  cpSync(renamedMaterializerTemplate, renamedMaterializerConsumer, { recursive: true })
  writeConsumerRuntimeFixture(renamedMaterializerConsumer, renamedMaterializerBuilt.manifest, 'renamed-materializer-fixture')
  const renamedMaterializerDs = join(renamedMaterializerConsumer, 'node_modules', '@qijenchen', 'design-system')
  mkdirSync(join(renamedMaterializerDs, 'ds-canonical'), { recursive: true })
  cpSync(renamedMaterializerFork, join(renamedMaterializerDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(renamedMaterializerDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: priorVersion }, null, 2)}\n`)
  installUtilityRegistry(renamedMaterializerDs)
  assert.equal(
    validateInstalledForkCorpus(renamedMaterializerConsumer).manifest.consumer.commonInstruction.materializerId,
    renamedCommonMaterializerId,
    'installed-corpus validation must resolve the unique common materializer by registry key rather than engine-name literal',
  )

  const deletionSurfaces = priorCodex.surfaces.map((surface) => ({
    ...surface,
    sha256: providerSurfaceDigest(priorTemplate, surface),
  }))
  const retirementRecord = {
    id: 'codex',
    replacementProviderId: null,
    retiredInVersion: nextVersion,
    reasonCode: 'PROVIDER_REMOVED',
    discovery: structuredClone(priorCodex.discovery),
    surfaces: deletionSurfaces,
  }
  const headlessCodexRetirementRegistry = registryAfterRetirement(priorRegistry, 'codex', 'generic')
  assertHeadlessPeerFailsClosed({
    providerRegistry: headlessCodexRetirementRegistry,
    selfProviderId: 'claude',
    label: 'Codex retirement',
  })
  const retiredRegistry = registryAfterRetirement(priorRegistry, 'codex', ALTERNATE_REVIEWER_ID)
  assertConcreteAlternatePeer({
    providerRegistry: retiredRegistry,
    selfProviderId: 'claude',
    label: 'Codex retirement',
  })
  retiredRegistry.canonical.retiredProviders = [registryRetirement(retirementRecord)]
  const retiredSnapshot = snapshot(
    nextVersion,
    retiredRegistry,
    [retirementRecord],
    lifecycleSnapshotSha256(priorSnapshot),
  )
  const retiredLifecycle = ledger([priorSnapshot, retiredSnapshot])

  // Rebuild over the preceding generated template to prove authenticated convergence removes only
  // the retired provider surfaces. The common file is independently materialized and survives.
  const retiredFork = join(retirementRoot, 'retired', 'fork')
  const retiredTemplate = join(retirementRoot, 'retired', 'template')
  mkdirSync(join(retirementRoot, 'retired'), { recursive: true })
  cpSync(priorTemplate, retiredTemplate, { recursive: true })
  const retiredBuilt = buildCorpus({
    outDir: retiredFork,
    templateRoot: retiredTemplate,
    providerRegistry: retiredRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: retiredLifecycle,
    releaseVersion: nextVersion,
  })
  assertProjectedAlternatePeer({ manifest: retiredBuilt.manifest, selfProviderId: 'claude', label: 'Codex retirement' })
  const common = retiredBuilt.manifest.consumer.commonInstruction
  const commonMaterializer = retiredBuilt.manifest.materializers.instructionViews[common.materializerId]
  assert.equal(common.destination, retiredRegistry.providers.find((item) => item.id === 'claude').sharedInstructionEntry)
  assert.equal(commonMaterializer.engine, 'shared-instruction-v1')
  assert.equal(commonMaterializer.ownershipPolicy, 'common-authority-consumer')
  assert.equal(retiredBuilt.manifest.codex, null, 'retired Codex compatibility metadata must disappear conditionally')
  assert.equal(retiredBuilt.manifest.providerSurfaces.codex, undefined, 'retired provider must not remain an active surface record')
  assert.equal(retiredBuilt.manifest.consumer.materialization.exactPaths.filter((path) => path === common.destination).length, 1)
  assert.equal(readFileSync(join(retiredTemplate, common.destination), 'utf8'), readFileSync(join(retiredFork, common.artifact), 'utf8'))
  assert.equal(
    Object.values(retiredBuilt.manifest.providerSurfaces).some((surface) => (
      surface.generated && surface.managedSurfaces.some((managed) => managed.path === common.destination)
    )),
    false,
    'the common instruction remains outside every active provider ownership surface',
  )
  assert.equal(retirementRecord.surfaces.some((surface) => surface.path === common.destination), false)
  for (const surface of priorCodex.surfaces) assert.equal(existsSync(join(retiredTemplate, surface.path)), false, `builder must retire ${surface.path}`)
  for (const reserved of ['.agents', '.codex']) {
    assert.equal(retiredBuilt.manifest.discoveryPolicy.providerRootNames.includes(reserved), true, `reserved discovery must retain ${reserved}`)
  }
  assert.equal(retiredBuilt.manifest.discoveryPolicy.instructionNames.includes(common.destination), true)

  // Retiring the other certified provider follows the same data path. Compatibility roles are
  // registry declarations, so the Claude alias becomes null while the still-active legacy Codex
  // projection remains available without a provider-id branch in the builder.
  const priorClaude = deriveProviderProductManagedInventory(priorRegistry).find((item) => item.id === 'claude')
  assert.ok(priorClaude, 'canonical retirement fixture needs the current Claude provider inventory')
  const claudeRetirement = {
    id: 'claude',
    replacementProviderId: null,
    retiredInVersion: nextVersion,
    reasonCode: 'PROVIDER_REMOVED',
    discovery: structuredClone(priorClaude.discovery),
    surfaces: priorClaude.surfaces.map((surface) => ({
      ...surface,
      sha256: providerSurfaceDigest(priorTemplate, surface),
    })),
  }
  const headlessClaudeRetirementRegistry = registryAfterRetirement(priorRegistry, 'claude', 'generic')
  assertHeadlessPeerFailsClosed({
    providerRegistry: headlessClaudeRetirementRegistry,
    selfProviderId: 'codex',
    label: 'Claude retirement',
  })
  const claudeRetiredRegistry = registryAfterRetirement(priorRegistry, 'claude', ALTERNATE_REVIEWER_ID)
  assertConcreteAlternatePeer({
    providerRegistry: claudeRetiredRegistry,
    selfProviderId: 'codex',
    label: 'Claude retirement',
  })
  claudeRetiredRegistry.canonical.retiredProviders = [registryRetirement(claudeRetirement)]
  const claudeRetiredSnapshot = snapshot(
    nextVersion,
    claudeRetiredRegistry,
    [claudeRetirement],
    lifecycleSnapshotSha256(priorSnapshot),
  )
  const claudeRetiredRoot = join(retirementRoot, 'claude-retired')
  const claudeRetiredFork = join(claudeRetiredRoot, 'fork')
  const claudeRetiredTemplate = join(claudeRetiredRoot, 'template')
  mkdirSync(claudeRetiredRoot, { recursive: true })
  cpSync(priorTemplate, claudeRetiredTemplate, { recursive: true })
  const claudeRetiredBuilt = buildCorpus({
    outDir: claudeRetiredFork,
    templateRoot: claudeRetiredTemplate,
    providerRegistry: claudeRetiredRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: ledger([priorSnapshot, claudeRetiredSnapshot]),
    releaseVersion: nextVersion,
  })
  assertProjectedAlternatePeer({ manifest: claudeRetiredBuilt.manifest, selfProviderId: 'codex', label: 'Claude retirement' })
  assert.equal(claudeRetiredBuilt.manifest.providerSurfaces.claude, undefined)
  assert.equal(claudeRetiredBuilt.manifest.consumer.claudeMd, null, 'retired legacy instruction compatibility must become null')
  assert.notEqual(claudeRetiredBuilt.manifest.codex, null, 'the independently declared active compatibility projection must remain')
  assert.equal(
    readFileSync(join(claudeRetiredTemplate, claudeRetiredBuilt.manifest.consumer.commonInstruction.destination), 'utf8'),
    readFileSync(join(claudeRetiredFork, claudeRetiredBuilt.manifest.consumer.commonInstruction.artifact), 'utf8'),
  )
  for (const surface of priorClaude.surfaces) {
    assert.equal(existsSync(join(claudeRetiredTemplate, surface.path)), false, `builder must retire ${surface.path}`)
  }
  const claudeRetiredConsumer = join(claudeRetiredRoot, 'consumer')
  cpSync(claudeRetiredTemplate, claudeRetiredConsumer, { recursive: true })
  writeConsumerRuntimeFixture(claudeRetiredConsumer, claudeRetiredBuilt.manifest, 'claude-retired-fixture')
  const claudeRetiredDs = join(claudeRetiredConsumer, 'node_modules', '@qijenchen', 'design-system')
  mkdirSync(join(claudeRetiredDs, 'ds-canonical'), { recursive: true })
  cpSync(claudeRetiredFork, join(claudeRetiredDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(claudeRetiredDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: nextVersion }, null, 2)}\n`)
  installUtilityRegistry(claudeRetiredDs)
  assert.doesNotThrow(() => validateInstalledForkCorpus(claudeRetiredConsumer), 'Claude-retired corpus must remain independently checkable')

  // A non-empty future commands/agents inventory is declared by the compatibility projection and
  // therefore becomes an exact provider lifecycle leaf. The real upgrade refresh must delete that
  // leaf with Claude and must not recreate it from the still-installed corpus.
  const categoryRegistry = structuredClone(priorRegistry)
  const syntheticCategory = categoryRegistry.canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories
    .find((category) => category.name === 'agents')
  syntheticCategory.sourceRoot = 'scripts/test-fixtures/future-provider-managed-tree'
  syntheticCategory.entries = ['README.md']
  const categoryPriorSnapshot = snapshot(priorVersion, categoryRegistry)
  const categoryPriorLifecycle = ledger([categoryPriorSnapshot])
  const categoryRoot = join(retirementRoot, 'nonempty-category-retirement')
  const categoryPriorFork = join(categoryRoot, 'prior-fork')
  const categoryPriorTemplate = join(categoryRoot, 'prior-template')
  mkdirSync(categoryRoot, { recursive: true })
  const categoryPriorBuilt = buildCorpus({
    outDir: categoryPriorFork,
    templateRoot: categoryPriorTemplate,
    providerRegistry: categoryRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: categoryPriorLifecycle,
    releaseVersion: priorVersion,
  })
  const syntheticCategoryPath = `${syntheticCategory.destinationRoot}/README.md`
  const categoryPriorClaude = deriveProviderProductManagedInventory(categoryRegistry).find((item) => item.id === 'claude')
  assert.equal(categoryPriorClaude.surfaces.some((surface) => surface.path === syntheticCategoryPath && surface.kind === 'file'), true)
  assert.equal(categoryPriorBuilt.manifest.consumer.compatibilityCategories[0].entries.includes('README.md'), true)
  assert.equal(existsSync(join(categoryPriorTemplate, syntheticCategoryPath)), true)
  const categoryRetirement = {
    id: 'claude',
    replacementProviderId: null,
    retiredInVersion: nextVersion,
    reasonCode: 'PROVIDER_REMOVED',
    discovery: structuredClone(categoryPriorClaude.discovery),
    surfaces: categoryPriorClaude.surfaces.map((surface) => ({
      ...surface,
      sha256: providerSurfaceDigest(categoryPriorTemplate, surface),
    })),
  }
  const headlessCategoryRetirementRegistry = registryAfterRetirement(categoryRegistry, 'claude', 'generic')
  assertHeadlessPeerFailsClosed({
    providerRegistry: headlessCategoryRetirementRegistry,
    selfProviderId: 'codex',
    label: 'non-empty compatibility-category retirement',
  })
  const categoryRetiredRegistry = registryAfterRetirement(categoryRegistry, 'claude', ALTERNATE_REVIEWER_ID)
  assertConcreteAlternatePeer({
    providerRegistry: categoryRetiredRegistry,
    selfProviderId: 'codex',
    label: 'non-empty compatibility-category retirement',
  })
  categoryRetiredRegistry.canonical.retiredProviders = [registryRetirement(categoryRetirement)]
  const categoryRetiredSnapshot = snapshot(
    nextVersion,
    categoryRetiredRegistry,
    [categoryRetirement],
    lifecycleSnapshotSha256(categoryPriorSnapshot),
  )
  const categoryRetiredFork = join(categoryRoot, 'retired-fork')
  const categoryRetiredTemplate = join(categoryRoot, 'retired-template')
  cpSync(categoryPriorTemplate, categoryRetiredTemplate, { recursive: true })
  const categoryRetiredBuilt = buildCorpus({
    outDir: categoryRetiredFork,
    templateRoot: categoryRetiredTemplate,
    providerRegistry: categoryRetiredRegistry,
    providerCompatibility: retirementProviderCompatibility,
    providerSkillSemantics: PROVIDER_SKILL_SEMANTICS,
    providerLifecycle: ledger([categoryPriorSnapshot, categoryRetiredSnapshot]),
    releaseVersion: nextVersion,
  })
  assertProjectedAlternatePeer({
    manifest: categoryRetiredBuilt.manifest,
    selfProviderId: 'codex',
    label: 'non-empty compatibility-category retirement',
  })
  assert.deepEqual(categoryRetiredBuilt.manifest.consumer.compatibilityCategories, [])
  assert.deepEqual(categoryRetiredBuilt.manifest.agents, [])
  assert.equal(existsSync(join(categoryRetiredTemplate, syntheticCategoryPath)), false)

  const categoryConsumer = join(categoryRoot, 'consumer')
  cpSync(categoryPriorTemplate, categoryConsumer, { recursive: true })
  writeConsumerRuntimeFixture(categoryConsumer, categoryPriorBuilt.manifest, 'provider-lifecycle-category-fixture')
  const categoryInstalledDs = join(categoryConsumer, 'node_modules', '@qijenchen', 'design-system')
  mkdirSync(join(categoryInstalledDs, 'ds-canonical'), { recursive: true })
  cpSync(categoryPriorFork, join(categoryInstalledDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(categoryInstalledDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: priorVersion }, null, 2)}\n`)
  installUtilityRegistry(categoryInstalledDs)
  const installedCategoryPrior = validateInstalledForkCorpus(categoryConsumer)
  rmSync(join(categoryInstalledDs, 'ds-canonical', 'fork'), { recursive: true, force: true })
  cpSync(categoryRetiredFork, join(categoryInstalledDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(categoryInstalledDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: nextVersion }, null, 2)}\n`)
  const installedCategoryCurrent = validateInstalledForkCorpus(categoryConsumer)
  const categoryTransition = validateInstalledProviderTransition(installedCategoryPrior, installedCategoryCurrent)
  const categoryCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir: categoryConsumer,
    verifiedCorpus: installedCategoryCurrent,
    providerTransition: categoryTransition,
  })
  const categoryRefresh = refreshLaunchers(categoryConsumer, {
    verifiedCorpus: installedCategoryCurrent,
    providerTransition: categoryTransition,
    transactionCapability: categoryCapability,
  })
  assert.equal(categoryRefresh.retired.includes(syntheticCategoryPath), true)
  assert.deepEqual(categoryRefresh.agents, [])
  assert.equal(existsSync(join(categoryConsumer, syntheticCategoryPath)), false, 'refresh may not resurrect a retired compatibility category leaf')

  // Install the prior corpus, replace only the package with the successor corpus, then run the real
  // authenticated refresh. This is the same shape as npm upgrade + sync-all transaction handoff.
  const consumer = join(retirementRoot, 'consumer')
  cpSync(priorTemplate, consumer, { recursive: true })
  writeConsumerRuntimeFixture(consumer, priorBuilt.manifest, 'provider-lifecycle-retirement-fixture')
  const installedDs = join(consumer, 'node_modules', '@qijenchen', 'design-system')
  mkdirSync(join(installedDs, 'ds-canonical'), { recursive: true })
  cpSync(priorFork, join(installedDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(installedDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: priorVersion }, null, 2)}\n`)
  installUtilityRegistry(installedDs)
  const installedPrior = validateInstalledForkCorpus(consumer)

  rmSync(join(installedDs, 'ds-canonical', 'fork'), { recursive: true, force: true })
  cpSync(retiredFork, join(installedDs, 'ds-canonical', 'fork'), { recursive: true })
  writeFileSync(join(installedDs, 'package.json'), `${JSON.stringify({ name: '@qijenchen/design-system', version: nextVersion }, null, 2)}\n`)
  const installedCurrent = validateInstalledForkCorpus(consumer)
  const transition = validateInstalledProviderTransition(installedPrior, installedCurrent)
  assert.equal(transition.mode, 'upgrade')
  assert.deepEqual(transition.retirements.map((item) => item.id), ['codex'])
  const fakeJournalProviderSnapshot = {
    evidence: structuredClone(installedCurrent.evidence),
    paths: structuredClone(transition.paths),
    entries: transition.paths.map(() => ({})),
  }
  assert.throws(
    () => authorizeProviderRefreshTransaction({
      verifiedCorpus: installedCurrent,
      providerTransition: transition,
      journalProviderSnapshot: fakeJournalProviderSnapshot,
    }),
    /durable provider journal entry\[0\].*object|open or incomplete shape/,
    'production refresh authorization must reject placeholder journal entries',
  )
  assert.throws(
    () => authorizeDisposableProviderRefreshTransaction({
      projectDir: categoryConsumer,
      verifiedCorpus: installedCurrent,
      providerTransition: transition,
    }),
    /not bound to its validated sandbox corpus\/transition/,
    'disposable refresh authority must be bound to the validated corpus project root',
  )
  assert.throws(
    () => authorizeDisposableProviderRefreshTransaction({
      projectDir: consumer,
      verifiedCorpus: installedCurrent,
      providerTransition: structuredClone(transition),
    }),
    /not bound to its validated sandbox corpus\/transition/,
    'disposable refresh authority must reject an uncertified transition clone',
  )
  const transactionCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir: consumer,
    verifiedCorpus: installedCurrent,
    providerTransition: transition,
  })
  const refreshed = refreshLaunchers(consumer, {
    verifiedCorpus: installedCurrent,
    providerTransition: transition,
    transactionCapability,
  })
  assert.throws(
    () => refreshLaunchers(consumer, { verifiedCorpus: installedCurrent, providerTransition: transition, transactionCapability }),
    /authorized one-shot transaction capability/,
    'a disposable refresh capability must be consumed by its first materialization attempt',
  )
  assert.deepEqual(refreshed.retired.sort(), priorCodex.surfaces.map((surface) => surface.path).sort())
  assert.equal(readFileSync(join(consumer, common.destination), 'utf8'), readFileSync(join(retiredFork, common.artifact), 'utf8'))
  for (const surface of priorCodex.surfaces) assert.equal(existsSync(join(consumer, surface.path)), false, `refresh must retire ${surface.path}`)
  assert.doesNotThrow(() => validateInstalledForkCorpus(consumer), 'the successor corpus remains valid after materialization')
} finally {
  rmSync(retirementRoot, { recursive: true, force: true })
}

console.log('✓ provider lifecycle transition: additions, deletion/transfer partition, pure rename, certified retirement, immutable predecessor, append-only history')
