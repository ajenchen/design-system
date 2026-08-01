#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'
import fs, { readFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEEP_AUDIT_RUBRIC_SELF_GUARD,
  FORK_TEMPLATE_FORBIDDEN_EAGER_SOURCES,
  FORK_TEMPLATE_REQUIRED_EXACT_SOURCES,
  affectedStages,
  graphSeedTargets,
  loadGovernanceBuildGraph,
  loadGovernanceBuildGraphSemanticDefinition,
  missingForkTemplateExactSources,
  productProviderOutputs,
  resolveDeepAuditRubricPaths,
  stageSourceMatches,
  validateDeepAuditScopes,
  validateForkTemplateRuntimeBoundary,
  validateGovernanceInfrastructureClosure,
  validateLiteralNodeSubprocessEntrypoints,
  validateRuntimeEntrypointClosure,
  validateRuntimeEntrypointExactSources,
  validateStageTopology,
} from './governance-build-graph.mjs'
import { resolvePluginAliasContracts } from './lib/plugin-alias-contract.mjs'
import {
  productCommonProjectionDeclarations,
  productProviderProjectionDeclarations,
  repositoryProviderProjectionDeclarations,
} from './lib/provider-projection-contract.mjs'
import {
  inspectContract,
  sourceRecords,
} from '../packages/governance/src/contract.mjs'
import {
  AUTHORITY_GENERATION_JOURNAL,
  assertAuthorityGenerationIdle,
  recoverInterruptedAuthorityGeneration,
  runAtomicAuthorityGenerationTransaction,
} from './lib/canonical-sync-transaction.mjs'
import { buildProviderRuntimeValidator } from './gen-provider-runtime-validator.mjs'

const graph = loadGovernanceBuildGraph()
const root = fileURLToPath(new URL('..', import.meta.url))
assert.deepEqual(
  loadGovernanceBuildGraphSemanticDefinition(),
  graph,
  'semantic graph definition and fully protected live graph must agree on a current repository',
)

// The compiled standalone validator must be byte-identical when the same
// canonical source is generated from an isolated transaction workspace whose
// node_modules is a symlink to the live dependency cache.
{
  const isolatedRoot = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'provider-validator-root-')))
  try {
    for (const path of [
      'packages/governance/canonical/schemas/providers.schema.json',
      'packages/design-system/ds-canonical/hooks/registrations.schema.json',
    ]) {
      const target = join(isolatedRoot, path)
      fs.mkdirSync(resolve(target, '..'), { recursive: true })
      fs.copyFileSync(join(root, path), target)
    }
    fs.symlinkSync(join(root, 'node_modules'), join(isolatedRoot, 'node_modules'), 'dir')
    assert.equal(
      buildProviderRuntimeValidator({ root: isolatedRoot }),
      buildProviderRuntimeValidator({ root }),
      'provider runtime validator must not encode the physical transaction/dependency path',
    )
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true })
  }
}
const instructionMaterializerAuthority = {
  materializers: {
    instructionViews: {
      'markdown-relative-at-import-v1': {
        engine: 'markdown-relative-at-import-v1', ownershipPolicy: 'provider-generated-projection', supplementPolicy: 'optional',
      },
      'shared-instruction-v1': {
        engine: 'shared-instruction-v1', ownershipPolicy: 'common-authority-consumer', supplementPolicy: 'forbidden',
      },
    },
    treeViews: {
      'closed-tree-copy-v1': {
        engine: 'closed-tree-copy-v1', transformPolicies: ['byte-exact'],
      },
    },
  },
}
const allIds = (path) => affectedStages(graph, [path]).map((stage) => stage.id).sort()
// Preserve the focused producer/consumer assertions below; governance-metadata
// intentionally observes broad repository inputs and is asserted separately.
const ids = (path) => allIds(path).filter((id) => id !== 'governance-metadata')
assert.deepEqual(graph.stages.map((stage) => stage.id), ['release-version', 'provider-adapters', 'plugin-aliases', 'harness-authority-bindings', 'fork-template', 'baseline-mirrors', 'governance-metadata', 'control-plane'])
assert.equal(graph.schemaVersion, 5)
assert.deepEqual(missingForkTemplateExactSources(graph.stages), [])
assert.deepEqual(validateForkTemplateRuntimeBoundary(graph.stages), { missing: [], forbidden: [], generated: [] })
for (const path of FORK_TEMPLATE_REQUIRED_EXACT_SOURCES) {
  const poisoned = structuredClone(graph)
  const forkTemplate = poisoned.stages.find(stage => stage.id === 'fork-template')
  forkTemplate.sources = forkTemplate.sources.filter(source => source !== path)
  assert.deepEqual(
    missingForkTemplateExactSources(poisoned.stages),
    [path],
    `removing ${path} from a fresh graph clone must identify the complete sorted missing set`,
  )
  assert.throws(() => validateForkTemplateRuntimeBoundary(poisoned.stages), /fork-template exact runtime input closure is missing:/)
}
const forkTemplate = graph.stages.find(stage => stage.id === 'fork-template')
assert.deepEqual(FORK_TEMPLATE_FORBIDDEN_EAGER_SOURCES.filter(path => forkTemplate.sources.includes(path)), [])
assert.equal(forkTemplate.sources.some(path => path.startsWith('governance/generated/') || path.startsWith('generated/')), false)

const runtimeClosure = validateRuntimeEntrypointClosure(graph.stages, { repoRoot: root })
assert.equal(validateRuntimeEntrypointExactSources(graph.stages), true)
for (const stage of graph.stages) {
  for (const entrypoint of stage.runtimeEntrypoints) {
    const poisoned = structuredClone(graph.stages)
    const poisonedStage = poisoned.find(candidate => candidate.id === stage.id)
    poisonedStage.sources = poisonedStage.sources.filter(source => source !== entrypoint)
    assert.throws(
      () => validateRuntimeEntrypointExactSources(poisoned),
      new RegExp(`${stage.id}:${entrypoint.replaceAll('.', '\\.').replaceAll('/', '\\/')}`),
      `runtime entrypoint remained reviewable only through a broad directory source:${stage.id}:${entrypoint}`,
    )
  }
}
const runtimeClosureByStage = new Map(runtimeClosure.map(report => [report.stageId, report]))
assert.deepEqual(graph.stages.find(stage => stage.id === 'control-plane').runtimeEntrypoints, [
  'packages/governance/bin/governance.mjs',
  'scripts/governance-snapshot.mjs',
  'scripts/validate-memory-contract.mjs',
  'scripts/validate-planning-registry.mjs',
])
assert.equal(runtimeClosureByStage.get('control-plane').runtimeModules.includes('packages/governance/src/cli.mjs'), true)
assert.equal(runtimeClosureByStage.get('fork-template').runtimeModules.includes('infra/governance/lib/managed-repository-ownership.mjs'), true)
for (const forbidden of FORK_TEMPLATE_FORBIDDEN_EAGER_SOURCES) {
  assert.equal(runtimeClosureByStage.get('fork-template').runtimeModules.includes(forbidden), false, `fork runtime closure must not import eager authority state:${forbidden}`)
}
const missingNpmEntrypoint = structuredClone(graph.stages)
missingNpmEntrypoint.find(stage => stage.id === 'control-plane').runtimeEntrypoints =
  missingNpmEntrypoint.find(stage => stage.id === 'control-plane').runtimeEntrypoints.filter(path => path !== 'scripts/governance-snapshot.mjs')
assert.throws(
  () => validateRuntimeEntrypointClosure(missingNpmEntrypoint, { repoRoot: root }),
  /control-plane runtimeEntrypoints omits its build command entrypoint:scripts\/governance-snapshot\.mjs/,
)
const controlRuntimeEntrypoints = graph.stages.find(stage => stage.id === 'control-plane').runtimeEntrypoints
const governanceSnapshotSource = readFileSync(new URL('./governance-snapshot.mjs', import.meta.url), 'utf8')
assert.deepEqual(
  validateLiteralNodeSubprocessEntrypoints({
    source: governanceSnapshotSource,
    importer: 'scripts/governance-snapshot.mjs',
    declaredRuntimeEntrypoints: controlRuntimeEntrypoints,
  }),
  [
    'packages/governance/bin/governance.mjs',
    'scripts/validate-memory-contract.mjs',
    'scripts/validate-planning-registry.mjs',
  ],
)
const poisonedGovernanceSnapshotSource = governanceSnapshotSource.replace(
  "'scripts/validate-memory-contract.mjs'",
  "'scripts/undeclared-memory-validator.mjs'",
)
assert.throws(
  () => validateLiteralNodeSubprocessEntrypoints({
    source: poisonedGovernanceSnapshotSource,
    importer: 'scripts/governance-snapshot.mjs',
    declaredRuntimeEntrypoints: controlRuntimeEntrypoints,
  }),
  /literal Node subprocess roots are absent from runtimeEntrypoints:scripts\/undeclared-memory-validator\.mjs/,
  'changing a spawned Node target while retaining stale declarative roots must fail closed',
)
const hiddenEngineDependency = structuredClone(graph.stages)
hiddenEngineDependency.find(stage => stage.id === 'control-plane').sourceExcludes.push('packages/governance/src/cli.mjs')
assert.throws(
  () => validateRuntimeEntrypointClosure(hiddenEngineDependency, { repoRoot: root }),
  /control-plane runtime dependency is outside its declared sources:packages\/governance\/bin\/governance\.mjs -> packages\/governance\/src\/cli\.mjs/,
)

const zeroIoInventory = JSON.parse(fs.readFileSync(resolve(root, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
const zeroIoMatrix = JSON.parse(fs.readFileSync(resolve(root, 'infra/governance/providers/compatibility-matrix.json'), 'utf8'))
const zeroIoConsumerLock = JSON.parse(fs.readFileSync(resolve(root, 'template/ds-product-template/governance/lock.json'), 'utf8'))
const zeroIoForkManifest = JSON.parse(fs.readFileSync(resolve(root, 'packages/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
const zeroIoUpgradeModule = await import('../infra/governance/lib/consumer-upgrade-protocol.mjs?zero-io-runtime-probe')
const zeroIoConsumerUpgradeProtocol = zeroIoUpgradeModule.loadConsumerUpgradeProtocol().protocol
const zeroIoConsumerUpgradeProfileFacts = zeroIoUpgradeModule.deriveConsumerUpgradeProfileFacts(zeroIoConsumerUpgradeProtocol)
const originalReadFileSync = fs.readFileSync
const zeroIoReads = []
try {
  fs.readFileSync = (...args) => {
    zeroIoReads.push(String(args[0]))
    return originalReadFileSync(...args)
  }
  syncBuiltinESMExports()
  const common = await import('../infra/governance/lib/common.mjs?zero-io-runtime-probe')
  assert.deepEqual(zeroIoReads, [], `common import performed repository I/O:${zeroIoReads.join(',')}`)
  const facts = {
    ...common.deriveInventoryProviderFacts(zeroIoMatrix),
    consumerUpgradeProtocol: zeroIoConsumerUpgradeProtocol,
    consumerUpgradeProfileFacts: zeroIoConsumerUpgradeProfileFacts,
    consumerOwnershipFacts: common.deriveConsumerOwnershipFacts(zeroIoConsumerLock, zeroIoForkManifest),
  }
  common.validateInventory(zeroIoInventory, facts)
  assert.deepEqual(zeroIoReads, [], `injected inventory validation performed repository I/O:${zeroIoReads.join(',')}`)
} finally {
  fs.readFileSync = originalReadFileSync
  syncBuiltinESMExports()
}

const forkRuntimeRepo = fs.realpathSync(resolve(root))
const forkRuntimeStage = loadGovernanceBuildGraph().stages.find(candidate => candidate.id === 'fork-template')
const forkRuntimeTemp = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'fork-runtime-read-closure-')))
const forkRuntimeReads = []
const forkRuntimeOriginals = {}
const recordForkRuntimeRead = (kind, value) => {
  if (typeof value !== 'string' && !(value instanceof URL)) return
  const raw = value instanceof URL ? value.pathname : value
  const path = relative(forkRuntimeRepo, resolve(raw)).split(sep).join('/')
  if (path && path !== '..' && !path.startsWith('../')) forkRuntimeReads.push({ kind, path })
}
for (const name of ['readFileSync', 'readdirSync', 'readlinkSync']) {
  forkRuntimeOriginals[name] = fs[name]
  fs[name] = function (...args) {
    recordForkRuntimeRead(name, args[0])
    return forkRuntimeOriginals[name].apply(this, args)
  }
}
forkRuntimeOriginals.cpSync = fs.cpSync
fs.cpSync = function (...args) {
  recordForkRuntimeRead('cpSync', args[0])
  return forkRuntimeOriginals.cpSync.apply(this, args)
}
syncBuiltinESMExports()
try {
  const { buildCorpus } = await import('./build-fork-governance.mjs?runtime-read-closure-probe')
  buildCorpus({ outDir: join(forkRuntimeTemp, 'fork'), templateRoot: join(forkRuntimeTemp, 'template') })
} finally {
  for (const [name, implementation] of Object.entries(forkRuntimeOriginals)) fs[name] = implementation
  syncBuiltinESMExports()
  fs.rmSync(forkRuntimeTemp, { recursive: true, force: true })
}
const uniqueForkRuntimeReads = [...new Map(
  forkRuntimeReads.map(item => [`${item.kind}:${item.path}`, item]),
).values()]
assert.ok(uniqueForkRuntimeReads.length >= 100, `fork runtime read probe was vacuous:${uniqueForkRuntimeReads.length}`)
const undeclaredForkRuntimeReads = uniqueForkRuntimeReads.filter(item => !stageSourceMatches(forkRuntimeStage, item.path))
assert.deepEqual(
  undeclaredForkRuntimeReads,
  [],
  `build-fork runtime reads escaped graph sources:${JSON.stringify(undeclaredForkRuntimeReads)}`,
)
const controlPlane = graph.stages.find((stage) => stage.id === 'control-plane')
assert.equal(validateDeepAuditScopes(graph.stages), controlPlane)
assert.equal(controlPlane.auditScope, 'deep-audit-rubric')
const rootProviderViewOutputs = graph.stages.find(
  (stage) => stage.id === 'provider-adapters',
).outputs
assert(
  rootProviderViewOutputs.length > 0
    && rootProviderViewOutputs.every((path) => controlPlane.sources.includes(path)),
  'control-plane must declare every generated root provider view as an upstream input',
)
assert.deepEqual(
  ids('.claude/settings.json'),
  ['control-plane', 'provider-adapters'],
  'Claude materialized hooks must be generated before and consumed by the control-plane',
)
assert.deepEqual(
  ids('.codex/hooks.json'),
  ['control-plane', 'provider-adapters'],
  'Codex materialized hooks must be generated before and consumed by the control-plane',
)
assert.deepEqual(graph.stages.filter(stage => stage !== controlPlane).map(stage => stage.auditScope), Array(graph.stages.length - 1).fill('none'))
assert.throws(() => validateDeepAuditScopes(graph.stages.map(stage => ({ ...stage, auditScope: 'none' }))), /exactly one deep-audit-rubric stage; found=0/)
assert.throws(() => validateDeepAuditScopes(graph.stages.map((stage, index) => ({ ...stage, auditScope: index < 2 ? 'deep-audit-rubric' : 'none' }))), /exactly one deep-audit-rubric stage; found=2/)
assert.deepEqual(controlPlane.generate, ['npm', 'run', '--silent', 'governance:snapshot:generate'])
assert.deepEqual(controlPlane.check, ['npm', 'run', '--silent', 'governance:snapshot:check'])
const canonicalManifest = JSON.parse(readFileSync(new URL('../packages/governance/canonical/manifest.json', import.meta.url), 'utf8'))
const canonicalSources = new Map(canonicalManifest.sources.map(source => [source.id, source.path]))
assert.equal(canonicalSources.get('provider-neutral-benchmark-policy'), 'governance/benchmarks')
assert.equal(canonicalSources.get('repository-ignore-boundary'), '.gitignore')
assert.equal(canonicalSources.get('governance-runtime-ignore-policy'), 'infra/governance/runtime/.gitignore')
const canonicalContractInspection = await inspectContract({
  repoRoot: root,
  manifestPath: 'packages/governance/canonical/manifest.json',
  role: 'ds-author',
})
assert.deepEqual(canonicalContractInspection.diagnostics, [])
const canonicalSourceRecords = await sourceRecords(canonicalContractInspection.contract)
const runtimeClosureSourceRecord = canonicalSourceRecords.find(record => record.id === 'governance-runtime-dependency-closure-library')
assert.equal(runtimeClosureSourceRecord?.path, 'scripts/lib/runtime-dependency-closure.mjs')
assert.match(runtimeClosureSourceRecord?.hash || '', /^sha256:[a-f0-9]{64}$/)
assert.equal(runtimeClosureSourceRecord?.type, 'file')
const canonicalProviders = JSON.parse(readFileSync(new URL('../packages/governance/canonical/providers.json', import.meta.url), 'utf8'))
const futureProviderRegistry = structuredClone(canonicalProviders)
const futureProvider = structuredClone(futureProviderRegistry.providers.find(provider => provider.id === 'codex'))
futureProvider.id = 'future'
futureProvider.instructionEntry = 'FUTURE.md'
futureProvider.hookConfig = '.future/hooks.json'
futureProvider.skillDirectory = '.future/skills'
futureProvider.adapter.repositoryInstructionSource = 'packages/design-system/ds-canonical/adapters/claude-root-instructions.md'
futureProvider.adapter.productInstructionSource = 'scripts/fork-role-sources/AGENTS.product.md'
futureProvider.adapter.instructionView = { materializerId: 'markdown-relative-at-import-v1' }
futureProvider.adapter.repositoryManagedTrees = {}
futureProvider.adapter.productManagedTrees = {
  rules: {
    sourceRoot: 'packages/design-system/ds-canonical/rules',
    destination: '.future/rules',
    materializerId: 'closed-tree-copy-v1',
    transformPolicy: 'byte-exact',
  },
}
futureProvider.adapter.skillView.directory = '.future/skills'
futureProvider.adapter.hookView.output = '.future/hooks.json'
futureProviderRegistry.providers.push(futureProvider)
const futureGraph = loadGovernanceBuildGraph({ providerRegistry: futureProviderRegistry })
const futureForkStage = futureGraph.stages.find(stage => stage.id === 'fork-template')
const futureControlPlaneStage = futureGraph.stages.find(stage => stage.id === 'control-plane')
assert.equal(futureForkStage.outputs.includes('template/ds-product-template/FUTURE.md'), true)
assert.equal(futureForkStage.outputs.includes('template/ds-product-template/.future/hooks.json'), true)
assert.equal(futureForkStage.outputs.includes('template/ds-product-template/.future/rules/'), true)
assert.equal(futureForkStage.outputs.includes('template/ds-product-template/.future/skills/'), true)
assert.equal(futureControlPlaneStage.sources.includes('.future/hooks.json'), true)
assert.equal(futureControlPlaneStage.sources.includes('.future/skills/'), true)
assert.equal(futureGraph.stages.find(stage => stage.id === 'governance-metadata').sourceExcludes.includes('template/ds-product-template/.future/'), true)
const fileBackedTreeRegistry = structuredClone(futureProviderRegistry)
fileBackedTreeRegistry.providers.find(provider => provider.id === 'future').adapter.productManagedTrees.rules.sourceRoot = 'AGENTS.md'
assert.throws(() => loadGovernanceBuildGraph({ providerRegistry: fileBackedTreeRegistry }), /product managed tree source must be a real directory:AGENTS\.md/)
const exactRubricSources = controlPlane.sources
  .filter((source) => !source.endsWith('/') && stageSourceMatches(controlPlane, source))
  .sort()
const rubricFixtureInventory = [...new Set([
  ...exactRubricSources,
  ...DEEP_AUDIT_RUBRIC_SELF_GUARD,
  'infra/governance/README.md',
  'scripts/generated/not-rubric.mjs',
])].sort().map(path => ({ path, kind: 'file' }))
const expectedRubricFixture = [...new Set([
  ...exactRubricSources,
  'infra/governance/README.md',
  ...DEEP_AUDIT_RUBRIC_SELF_GUARD,
])].sort()
assert.deepEqual(resolveDeepAuditRubricPaths({ repoRoot: root, inventory: rubricFixtureInventory }), expectedRubricFixture,
  'deep-audit rubric must resolve the designated stage plus governance-manifest sources and exclusions')
assert.deepEqual(resolveDeepAuditRubricPaths({
  repoRoot: root,
  inventory: [...rubricFixtureInventory, { path: 'infra/governance/retired-input.md', kind: 'missing' }],
}), expectedRubricFixture, 'tracked deletions under a rubric tree remain frozen inventory tombstones but are not readable rubric files')
for (const exactSource of exactRubricSources) {
  for (const kind of ['missing', 'symlink']) {
    assert.throws(
      () => resolveDeepAuditRubricPaths({
        repoRoot: root,
        inventory: rubricFixtureInventory.map((row) => row.path === exactSource ? { ...row, kind } : row),
      }),
      new RegExp(`deep-audit rubric (?:exact source is missing or unsafe|self-guard is missing or unsafe|contains symbolic-link or unsupported inputs):${exactSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `exact rubric source ${exactSource} must reject ${kind}`,
    )
  }
}
assert.throws(
  () => resolveDeepAuditRubricPaths({ repoRoot: root, inventory: rubricFixtureInventory.filter(row => row.path !== 'packages/governance/canonical/manifest.json') }),
  /deep-audit rubric self-guard is missing or unsafe:packages\/governance\/canonical\/manifest.json/,
)
assert.throws(
  () => resolveDeepAuditRubricPaths({
    repoRoot: root,
    inventory: rubricFixtureInventory.map(row => row.path === 'infra/governance/README.md' ? { ...row, kind: 'symlink' } : row),
  }),
  /deep-audit rubric contains symbolic-link or unsupported inputs:infra\/governance\/README.md:symlink/,
)
const explicitEvidenceControlPlaneSources = {
  'audit-coverage-matrix-source': 'scripts/audit-coverage-matrix.mjs',
  'consumer-upgrade-protocol': 'infra/governance/consumer-upgrade-protocol.json',
  'consumer-upgrade-protocol-schema': 'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'consumer-upgrade-protocol-library': 'infra/governance/lib/consumer-upgrade-protocol.mjs',
  'governance-runtime-dependency-closure-library': 'scripts/lib/runtime-dependency-closure.mjs',
  'consumer-control-plane-policy-library': 'scripts/lib/consumer-control-plane-policy.mjs',
  'consumer-control-plane-cli': 'infra/governance/bin/consumerctl.mjs',
  'consumer-control-plane-tests': 'infra/governance/test/consumerctl.test.mjs',
  'consumer-control-plane-baseline-receipt-schema': 'infra/governance/schemas/consumer-control-plane-baseline-receipt.schema.json',
  'consumer-control-plane-update-plan-schema': 'infra/governance/schemas/consumer-control-plane-update-plan.schema.json',
  'consumer-control-plane-update-snapshot-verification-schema': 'infra/governance/schemas/consumer-control-plane-update-snapshot-verification.schema.json',
  'consumer-control-plane-update-readback-schema': 'infra/governance/schemas/consumer-control-plane-update-readback.schema.json',
  'consumer-control-plane-update-readback-verification-schema': 'infra/governance/schemas/consumer-control-plane-update-readback-verification.schema.json',
  'consumer-control-plane-update-acceptance-proposal-schema': 'infra/governance/schemas/consumer-control-plane-update-acceptance-proposal.schema.json',
  'consumer-managed-repos-inventory': 'infra/governance/inventory/managed-repos.json',
  'consumer-managed-repository-ownership-library': 'infra/governance/lib/managed-repository-ownership.mjs',
  'provider-review-binding-library': 'packages/governance/src/provider-review-binding.mjs',
  'provider-review-binding-tests': 'scripts/test-provider-review-binding.mjs',
  'provider-hook-output-transport': 'scripts/lib/provider-hook-output-transport.mjs',
  'provider-hook-output-transport-tests': 'scripts/test-provider-hook-output-transport.mjs',
  'deep-audit-evidence-contract': 'scripts/lib/deep-audit-evidence-contract.mjs',
  'deep-audit-evidence-contract-schema': 'scripts/schemas/deep-audit-evidence-contract.schema.json',
  'deep-audit-run-preparer': 'scripts/prepare-deep-audit-run.mjs',
  'deep-audit-coverage-verifier': 'scripts/verify-deep-audit-coverage.mjs',
  'deep-audit-coverage-tests': 'scripts/test-verify-deep-audit-coverage.mjs',
  'deep-audit-deterministic-plan': 'scripts/deep-audit-deterministic-plan.json',
  'deep-audit-deterministic-plan-schema': 'scripts/schemas/deep-audit-deterministic-plan.schema.json',
  'deep-audit-deterministic-plan-library': 'scripts/lib/deep-audit-deterministic-plan.mjs',
  'deep-audit-deterministic-runner': 'scripts/run-deterministic-deep-audit.mjs',
  'deep-audit-deterministic-tests': 'scripts/test-run-deterministic-deep-audit.mjs',
  'deep-audit-hook-evidence-plan': 'infra/governance/hook-evidence-plan.json',
  'deep-audit-hook-evidence-plan-schema': 'infra/governance/schemas/hook-evidence-plan.schema.json',
  'deep-audit-hook-evidence-plan-library': 'scripts/lib/hook-evidence-plan.mjs',
  'deep-audit-hook-evidence-producer': 'scripts/produce-hook-enforced-evidence.mjs',
  'deep-audit-hook-evidence-plan-tests': 'scripts/test-hook-evidence-plan.mjs',
  'deep-audit-hook-evidence-producer-tests': 'scripts/test-produce-hook-enforced-evidence.mjs',
  'deep-audit-ci-evidence-plan': 'scripts/ci-evidence-plan.json',
  'deep-audit-ci-evidence-plan-schema': 'scripts/schemas/ci-evidence-plan.schema.json',
  'deep-audit-ci-observation-schema': 'scripts/schemas/ci-evidence-observation.schema.json',
  'deep-audit-ci-attestation-schema': 'scripts/schemas/ci-evidence-attestation.schema.json',
  'deep-audit-ci-evidence-plan-library': 'scripts/lib/ci-evidence-plan.mjs',
  'deep-audit-ci-evidence-pipeline': 'scripts/lib/ci-evidence-pipeline.mjs',
  'deep-audit-ci-live-observer': 'scripts/lib/ci-evidence-live-observer.mjs',
  'deep-audit-ci-evidence-producer': 'scripts/produce-ci-enforced-evidence.mjs',
  'deep-audit-ci-evidence-tests': 'scripts/test-produce-ci-enforced-evidence.mjs',
  'deep-audit-model-evidence-plan': 'infra/governance/model-evidence-plan.json',
  'deep-audit-model-evidence-plan-schema': 'infra/governance/schemas/model-evidence-plan.schema.json',
  'deep-audit-model-evidence-broker': 'infra/governance/model-evidence-broker.json',
  'deep-audit-model-evidence-broker-schema': 'infra/governance/schemas/model-evidence-broker.schema.json',
  'deep-audit-model-result-schema': 'infra/governance/schemas/model-deep-audit-result.schema.json',
  'model-invocation-profiles': 'infra/governance/providers/model-invocation-profiles.json',
  'model-invocation-profiles-schema': 'infra/governance/schemas/model-invocation-profiles.schema.json',
  'review-capability-registry': 'infra/governance/providers/review-capability-registry.json',
  'review-capability-registry-schema': 'infra/governance/schemas/review-capability-registry.schema.json',
  'review-capability-certifications': 'infra/governance/providers/review-capability-certifications.json',
  'review-capability-certifications-schema': 'infra/governance/schemas/review-capability-certifications.schema.json',
  'provider-review-capability-certification-proposal-schema': 'infra/governance/schemas/provider-review-capability-certification-proposal.schema.json',
  'review-capability-selection-tests': 'scripts/test-review-capability-selection.mjs',
  'model-release-registry': 'infra/governance/providers/model-release-registry.json',
  'model-release-registry-schema': 'infra/governance/schemas/model-release-registry.schema.json',
  'model-release-documentation-assertion-schema': 'infra/governance/schemas/model-release-documentation-assertion.schema.json',
  'model-release-documentation-evidence': 'infra/governance/evidence/model-releases/',
  'model-release-registry-library': 'scripts/lib/model-release-registry.mjs',
  'deep-audit-model-api-transport': 'scripts/lib/model-api-transport.mjs',
  'deep-audit-model-broker-transcript-library': 'scripts/lib/model-broker-transcript.mjs',
  'deep-audit-model-broker-shard-result-schema': 'infra/governance/schemas/model-broker-shard-result.schema.json',
  'deep-audit-model-broker-transcript-schema': 'infra/governance/schemas/model-broker-transcript.schema.json',
  'deep-audit-model-evidence-plan-library': 'scripts/lib/model-evidence-plan.mjs',
  'deep-audit-model-evidence-broker-library': 'scripts/lib/model-evidence-broker.mjs',
  'component-dependency-source-inventory': 'scripts/lib/component-dependency-source-inventory.mjs',
  'component-claim-inventory': 'scripts/lib/component-claim-inventory.mjs',
  'deep-audit-model-access-receipt-library': 'scripts/lib/model-access-receipt.mjs',
  'deep-audit-model-audit-contract-library': 'scripts/lib/model-audit-contract.mjs',
  'deep-audit-review-archive-library': 'scripts/lib/deep-audit-review-archive.mjs',
  'deep-audit-model-runner': 'scripts/run-model-deep-audit.mjs',
  'deep-audit-review-archive-tests': 'scripts/test-deep-audit-review-archive.mjs',
  'deep-audit-model-safety-tests': 'scripts/test-model-deep-audit-safety.mjs',
  'deep-audit-model-evidence-broker-hardening-tests': 'scripts/test-model-evidence-broker-hardening.mjs',
  'provider-neutral-review-core-tests': 'scripts/review-core-parity-optin.mjs',
  'deep-audit-managed-envelope-binding-tests': 'scripts/test-managed-envelope-binding.mjs',
  'deep-audit-evidence-schema-parity-tests': 'scripts/test-deep-audit-evidence-schema-parity.mjs',
  'managed-ci-deep-audit-workflow': '.github/workflows/deep-audit-managed.yml',
  'managed-ci-activated-workflow-contract': 'scripts/managed-ci-activated-workflow-contract.json',
  'managed-ci-activated-workflow-contract-schema': 'scripts/schemas/managed-ci-activated-workflow-contract.schema.json',
  'managed-ci-trusted-execution-plan': 'scripts/managed-ci-trusted-execution-plan.json',
  'managed-ci-trusted-execution-plan-schema': 'scripts/schemas/managed-ci-trusted-execution-plan.schema.json',
  'managed-ci-sandbox-receipt-schema': 'scripts/schemas/managed-ci-sandbox-receipt.schema.json',
  'managed-ci-sandbox-receipt-validator': 'scripts/lib/managed-ci-sandbox-receipt.mjs',
  'managed-ci-finalized-receipt-schema': 'scripts/schemas/managed-ci-finalized-receipt.schema.json',
  'managed-ci-authority-finalization-protocol-schema': 'infra/governance/schemas/managed-ci-authority-finalization-protocol.schema.json',
  'managed-ci-model-release-authority-policy': 'infra/governance/providers/managed-ci-model-release-authority-policy.json',
  'managed-ci-model-release-authority-policy-schema': 'infra/governance/schemas/managed-ci-model-release-authority-policy.schema.json',
  'managed-ci-model-release-authority-binding-schema': 'infra/governance/schemas/managed-ci-model-release-authority-binding.schema.json',
  'managed-ci-model-release-authority-library': 'scripts/lib/model-release-authority.mjs',
  'managed-ci-model-release-authority-fixture': 'scripts/test-fixtures/model-release-authority-fixture.mjs',
  'managed-ci-model-release-authority-tests': 'scripts/test-model-release-authority.mjs',
  'managed-ci-trusted-execution-library': 'scripts/lib/managed-ci-trusted-execution-plan.mjs',
  'managed-ci-trusted-execution-verifier': 'scripts/verify-managed-ci-trusted-execution.mjs',
  'managed-ci-executor-build-workflow': '.github/workflows/build-managed-ci-executors.yml',
  'managed-ci-executor-supply-chain-policy': 'infra/governance/providers/managed-ci-executor-supply-chain.json',
  'managed-ci-executor-supply-chain-policy-schema': 'infra/governance/schemas/managed-ci-executor-supply-chain.schema.json',
  'managed-ci-trusted-authority-policy': 'infra/governance/providers/managed-ci-trusted-authority-policy.json',
  'managed-ci-trusted-authority-policy-schema': 'infra/governance/schemas/managed-ci-trusted-authority-policy.schema.json',
  'managed-ci-executor-source-corpus': 'infra/governance/managed-ci-executor/',
  'managed-ci-class-adapter-source-corpus': 'infra/governance/managed-ci-class-adapters/',
  'managed-ci-trusted-execution-tests': 'scripts/test-managed-ci-trusted-execution.mjs',
  'managed-host-external-activation': 'infra/governance/external-activation-requirements.json',
  'external-activation-catalog-policy': 'infra/governance/external-activation-policy.json',
  'external-activation-catalog-policy-schema': 'infra/governance/schemas/external-activation-policy.schema.json',
  'managed-host-external-activation-schema': 'infra/governance/schemas/external-activation-requirements.schema.json',
  'external-activation-library': 'infra/governance/lib/external-activation.mjs',
  'external-activation-tests': 'infra/governance/test/external-activation.test.mjs',
  'staged-rollout-plan': 'infra/governance/staged-rollout-plan.json',
  'staged-rollout-schema': 'infra/governance/schemas/staged-rollout.schema.json',
  'staged-rollout-library': 'infra/governance/lib/staged-rollout.mjs',
  'staged-rollout-cli': 'infra/governance/bin/staged-rollout.mjs',
  'staged-rollout-tests': 'infra/governance/test/staged-rollout.test.mjs',
  'staged-rollout-poison-cases': 'infra/governance/test/fixtures/staged-rollout/poison-cases.json',
  'exact-fleet-reconcile-bootstrap-transaction-schema': 'infra/governance/schemas/fleet-reconcile-bootstrap-transaction.schema.json',
  'exact-fleet-reconcile-bootstrap-replay-receipt-schema': 'infra/governance/schemas/fleet-reconcile-bootstrap-replay-receipt.schema.json',
  'consumer-repository-path-topology-library': 'infra/governance/lib/repository-path-topology.mjs',
  'consumer-repository-path-topology-tests': 'infra/governance/test/repository-path-topology.test.mjs',
  'provider-compatibility-matrix': 'infra/governance/providers/compatibility-matrix.json',
  'provider-compatibility-matrix-schema': 'infra/governance/schemas/compatibility-matrix.schema.json',
  'provider-compatibility-library': 'infra/governance/lib/provider-compatibility.mjs',
  'provider-role-surface-policy': 'infra/governance/providers/role-surface-policy.json',
  'provider-role-surface-policy-schema': 'infra/governance/schemas/role-surface-policy.schema.json',
  'provider-role-surface-policy-library': 'infra/governance/lib/role-surface-policy.mjs',
  'provider-surface-certifications': 'infra/governance/providers/certifications.json',
  'provider-surface-certifications-schema': 'infra/governance/schemas/provider-surface-certification.schema.json',
  'provider-surface-tests': 'infra/governance/test/provider-surface.test.mjs',
  'governance-harness-registry': 'infra/governance/providers/harness-registry.json',
  'governance-harness-registry-schema': 'infra/governance/schemas/harness-registry.schema.json',
  'governance-harness-authority-contracts': 'infra/governance/providers/harness-authority-contracts.json',
  'governance-harness-authority-contracts-schema': 'infra/governance/schemas/harness-authority-contracts.schema.json',
  'governance-harness-registry-library': 'infra/governance/lib/harness-registry.mjs',
  'governance-harness-source-inventory': 'infra/governance/providers/harness-source-inventory.json',
  'governance-harness-source-inventory-schema': 'infra/governance/schemas/harness-source-inventory.schema.json',
  'governance-harness-source-inventory-library': 'infra/governance/lib/harness-source-inventory.mjs',
  'governance-harness-source-inventory-tests': 'infra/governance/test/harness-source-inventory.test.mjs',
  'governance-harness-non-governance-exclusions': 'infra/governance/providers/harness-non-governance-exclusions.json',
  'governance-harness-non-governance-exclusions-schema': 'infra/governance/schemas/harness-non-governance-exclusions.schema.json',
  'governance-harness-runner-library': 'infra/governance/lib/harness-runner.mjs',
  'governance-playwright-runtime-library': 'infra/governance/lib/playwright-runtime.mjs',
  'governance-playwright-runtime-tests': 'infra/governance/test/playwright-runtime.test.mjs',
  'governance-playwright-setup-cli': 'scripts/ensure-playwright-browsers.mjs',
  'governance-hook-setup-cli': 'scripts/setup-governance-hooks.mjs',
  'governance-hook-setup-tests': 'scripts/test-setup-governance-hooks.mjs',
  'governance-authority-setup-cli': 'scripts/setup-authority-governance.mjs',
  'governance-authority-setup-tests': 'infra/governance/test/authority-setup.test.mjs',
  'governance-harness-runner-cli': 'infra/governance/bin/run-harnesses.mjs',
  'governance-harness-suite-runner-cli': 'infra/governance/bin/run-harness-suite.mjs',
  'governance-harness-registry-tests': 'infra/governance/test/harness-registry.test.mjs',
  'governance-harness-runner-tests': 'infra/governance/test/harness-runner.test.mjs',
  'provider-neutral-residue-guard': 'scripts/check-provider-neutral-ssot-residue.mjs',
  'provider-neutral-residue-guard-tests': 'scripts/test-check-provider-neutral-ssot-residue.mjs',
}
for (const [sourceId, sourcePath] of Object.entries(explicitEvidenceControlPlaneSources)) {
  assert.equal(canonicalSources.get(sourceId), sourcePath, `canonical manifest source mismatch:${sourceId}`)
  assert.equal(controlPlane.sources.includes(sourcePath), true, `control-plane stage must name exact evidence authority:${sourcePath}`)
  assert.equal(ids(sourcePath).includes('control-plane'), true, `evidence authority is outside control-plane stage:${sourcePath}`)
}
assert.deepEqual(ids('packages/design-system/package.json'), ['control-plane', 'fork-template', 'release-version'])
assert.deepEqual(ids('.claude-plugin/plugin.json'), ['control-plane', 'release-version'])
assert.deepEqual(ids('.claude-plugin/marketplace.json'), ['control-plane', 'release-version'])
assert.deepEqual(ids('governance/memory/MEMORY.md'), ['control-plane'])
assert.deepEqual(ids('scripts/new-future-governance-provider.mjs'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('.github/CODEOWNERS'), ['control-plane'])
assert.deepEqual(ids('.github/workflows/governance-anchor.yml'), ['control-plane'])
assert.deepEqual(ids('.github/workflows/visual-regression.yml'), ['control-plane'])
assert.deepEqual(ids('.changeset/config.json'), ['control-plane'])
assert.deepEqual(ids('.npmrc'), ['control-plane'])
assert.deepEqual(ids('package-lock.json'), ['control-plane', 'release-version'])
assert.deepEqual(ids('packages/storybook-config/package.json'), ['control-plane', 'fork-template', 'release-version'])
assert.deepEqual(ids('packages/governance/package.json'), ['control-plane', 'release-version'])
assert.deepEqual(ids('packages/governance/README.md'), ['control-plane'])
assert.deepEqual(ids('packages/governance/bin/governance.mjs'), ['control-plane'])
assert.deepEqual(ids('packages/governance/test/provider-adapter-generator.test.mjs'), ['control-plane'])
assert.deepEqual(ids('template/ds-product-template/package.json'), ['control-plane', 'fork-template', 'release-version'])
assert.deepEqual(ids('packages/governance/canonical/roles.json'), ['control-plane'])
assert.deepEqual(ids('packages/governance/canonical/gates.json'), ['control-plane'])
assert.deepEqual(ids('packages/governance/canonical/schemas/manifest.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/providers/managed-host-assurance.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/bin/reconcile-github.mjs'), ['control-plane'])
assert.deepEqual(ids('infra/governance/desired/github.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/inventory/managed-repos.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('infra/governance/lib/rollout-state-machine.mjs'), ['control-plane'])
for (const certificationControlPlaneSource of [
  'infra/governance/lib/model-validation.mjs',
  'infra/governance/lib/runtime-certification.mjs',
  'infra/governance/lib/repository-subject-proof.mjs',
]) assert.deepEqual(ids(certificationControlPlaneSource), ['control-plane'], `runtime certification authority source escaped the control-plane:${certificationControlPlaneSource}`)
assert.deepEqual(ids('infra/governance/schemas/fleet-reconcile-journal.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/schemas/fleet-reconcile-bootstrap-transaction.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/schemas/fleet-reconcile-bootstrap-replay-receipt.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/test/reconcile-github.test.mjs'), ['control-plane'])
assert.deepEqual(ids('infra/governance/waivers.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/runtime/.gitignore'), ['control-plane'])
assert.deepEqual(ids('infra/governance/runtime/provider-runtime-conformance.json'), [])
assert.deepEqual(ids('infra/governance/baseline/visual/curated/button.png'), ['baseline-mirrors', 'control-plane'])
assert.deepEqual(ids('snapshots-baseline'), ['baseline-mirrors'])
assert.deepEqual(ids('.claude/snapshots-baseline'), ['baseline-mirrors'])
assert.deepEqual(ids('packages/governance/canonical/provider-lifecycle.json'), ['control-plane', 'fork-template', 'release-version'])
assert.deepEqual(ids('packages/governance/canonical/providers.json'), ['control-plane', 'fork-template', 'plugin-aliases', 'provider-adapters', 'release-version'])
assert.deepEqual(ids('packages/governance/canonical/schemas/provider-lifecycle.schema.json'), ['control-plane', 'fork-template'])
assert.equal(ids('scripts/lib/provider-lifecycle.mjs').includes('control-plane'), true)
const providerAdapterRuntimeSources = [
  'packages/governance/src/authority-decision-evidence.mjs',
  'scripts/lib/canonical-sync-transaction.mjs',
  'scripts/lib/claude-permission-policy.mjs',
  'scripts/lib/instruction-mirrors.mjs',
  'scripts/lib/provider-contract-validation.mjs',
  'scripts/lib/provider-lifecycle.mjs',
  'scripts/lib/provider-runtime-contract.mjs',
]
const providerAdapterSchemaSources = [
  'scripts/schemas/claude-permission-policy.schema.json',
  'scripts/schemas/provider-skill-semantics.schema.json',
]
const providerAdapterStage = graph.stages.find(stage => stage.id === 'provider-adapters')
assert.equal(providerAdapterStage.sources.includes('scripts/lib/'), false)
assert.equal(providerAdapterStage.sources.includes('scripts/schemas/'), false)
assert.deepEqual(
  providerAdapterRuntimeSources.filter(source => !providerAdapterStage.sources.includes(source)),
  [],
  'provider-adapters must declare its complete exact runtime library closure',
)
assert.deepEqual(
  providerAdapterSchemaSources.filter(source => !providerAdapterStage.sources.includes(source)),
  [],
  'provider-adapters must declare the exact schemas it reads',
)
for (const providerAdapterSource of providerAdapterRuntimeSources.filter(source => source !== 'scripts/lib/provider-lifecycle.mjs')) {
  assert.deepEqual(ids(providerAdapterSource), ['control-plane', 'fork-template', 'provider-adapters'])
}
assert.deepEqual(ids('scripts/lib/provider-lifecycle.mjs'), ['control-plane', 'fork-template', 'harness-authority-bindings', 'provider-adapters', 'release-version'])
for (const providerAdapterSource of providerAdapterSchemaSources) {
  assert.deepEqual(ids(providerAdapterSource), ['control-plane', 'fork-template', 'provider-adapters'])
}
assert.deepEqual(ids('scripts/lib/consumer-control-plane-policy.mjs'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('scripts/schemas/npm-stage-receipt.schema.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('infra/governance/providers/compatibility-matrix.json'), ['control-plane', 'fork-template', 'harness-authority-bindings'])
assert.deepEqual(ids('infra/governance/providers/certifications.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('infra/governance/providers/harness-registry.json'), ['control-plane', 'harness-authority-bindings'])
assert.deepEqual(ids('infra/governance/providers/harness-source-inventory.json'), ['control-plane', 'harness-authority-bindings'])
assert.deepEqual(ids('packages/design-system/src/tokens/utility-registry.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('packages/design-system/src/tokens/utility-registry.schema.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('infra/governance/lib/managed-repository-ownership.mjs'), ['control-plane', 'fork-template', 'harness-authority-bindings'])
assert.deepEqual(ids('infra/governance/schemas/managed-host-assurance.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/schemas/managed-host-assurance-evidence.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/schemas/managed-host-effective-readback.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/schemas/codex-managed-hook-bundle.schema.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/managed-host/templates/claude-managed-settings.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/managed-host/templates/codex-requirements.unix.toml'), ['control-plane'])
assert.deepEqual(ids('infra/governance/managed-host/codex-hook-bundle-contract.json'), ['control-plane'])
assert.deepEqual(ids('infra/governance/lib/managed-host-assurance.mjs'), ['control-plane'])
assert.deepEqual(ids('infra/governance/bin/verify-managed-host-assurance.mjs'), ['control-plane'])
assert.deepEqual(ids('infra/governance/test/managed-host-assurance.test.mjs'), ['control-plane'])
for (const releaseTrustSource of [
  'infra/governance/trust/issuers.json',
  'infra/governance/schemas/issuer-registry.schema.json',
  'infra/governance/lib/issuer-registry.mjs',
  'infra/governance/privileged-trust-roots.json',
  'infra/governance/schemas/privileged-trust-roots.schema.json',
  'infra/governance/schemas/privileged-change-authorization.schema.json',
  'scripts/verify-privileged-change.mjs',
  'infra/governance/release-tag-authorization-policy.json',
  'infra/governance/schemas/release-tag-authorization-policy.schema.json',
  'infra/governance/schemas/release-tag-authorization.schema.json',
  'infra/governance/lib/release-tag-authorization.mjs',
  'scripts/release-tag-authorization.mjs',
  'infra/governance/lib/signed-release-tag.mjs',
  'infra/governance/lib/release-trust-preflight.mjs',
  'infra/governance/schemas/release-trust-preflight-evidence.schema.json',
  'scripts/release-trust-preflight.mjs',
  '.github/workflows/release.yml',
  'scripts/build-release-bom.mjs',
  'scripts/release-bom-contract.mjs',
  'scripts/release-sbom.mjs',
  'scripts/release-set.mjs',
  'scripts/release-npm-lib.mjs',
  'scripts/release-npm-publish.mjs',
  'scripts/release-npm-readback.mjs',
  'scripts/release-npm-approve.mjs',
  'scripts/release-npm-promote.mjs',
  'scripts/release-npm-reject.mjs',
  'scripts/release-npm-stage-recover.mjs',
  'scripts/release-stage-run-identity.mjs',
  'scripts/release-npm-finalization-receipt.mjs',
  'scripts/release-npm-finalize-verify.mjs',
  'scripts/release-github-release.mjs',
  'scripts/release-remote-tag.mjs',
  'scripts/schemas/npm-stage-receipt.schema.json',
  'scripts/schemas/npm-finalization-receipt.schema.json',
  'scripts/test-release-bom.mjs',
  'scripts/audit-workflow-security.mjs',
  'scripts/test-workflow-security.mjs',
  'docs/npm-native-staged-release.md',
  'infra/governance/test/issuer-registry.test.mjs',
  'infra/governance/test/release-tag-authorization.test.mjs',
  'infra/governance/test/release-trust-preflight.test.mjs',
  'infra/governance/test/signed-release-tag.test.mjs',
  'scripts/test-privileged-change-authorization.mjs',
]) assert.equal(ids(releaseTrustSource).includes('control-plane'), true, `release trust source is outside the canonical build graph:${releaseTrustSource}`)
assert.deepEqual(ids('packages/design-system/ds-canonical/templates/product-provider-wiring.json'), ['control-plane', 'fork-template'])
assert.deepEqual(
  allIds('AGENTS.md'),
  ['control-plane', 'fork-template', 'governance-metadata', 'provider-adapters'],
  'root Decision Authority SSOT must invalidate every generated authority surface, including product consumers',
)
assert.deepEqual(ids('scripts/package-role-sources/AGENTS.package.md'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('scripts/package-role-sources/CLAUDE.package.md'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('packages/design-system/AGENTS.md'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('packages/design-system/CLAUDE.md'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('scripts/governance-check.mjs'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('scripts/run-provider-hook.mjs'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('packages/governance/src/authority-decision-evidence.mjs'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('packages/governance/src/provider-hook-normalization.mjs'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('packages/design-system/ds-canonical/hooks/registrations.json'), ['control-plane', 'fork-template', 'provider-adapters'])
assert.deepEqual(ids('.codex/hooks.json'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('generated/governance/provider-hook-coverage.json'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('generated/governance/provider-runtime-validator.mjs'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('scripts/test-authority-decision-evidence.mjs'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('packages/governance/canonical/schemas/provider-hook-coverage.schema.json'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('.agents/skills/canonical-reviewer/SKILL.md'), ['control-plane', 'provider-adapters'])
assert.deepEqual(ids('.claude/hooks/check_consumer_code_quality.sh'), ['control-plane', 'plugin-aliases', 'provider-adapters'])
assert.deepEqual(ids('.claude/commands/README.md'), ['control-plane', 'plugin-aliases', 'provider-adapters'])
assert.deepEqual(ids('.claude/skills/prototype/SKILL.md'), ['control-plane', 'plugin-aliases', 'provider-adapters'])
assert.deepEqual(ids('.claude/agents/canonical-reviewer.md'), ['control-plane', 'provider-adapters'])
// Generated provider views may feed the narrowly-scoped plugin alias materializer,
// the exact Harness mirror-binding projection, and the downstream control-plane
// contract inspector. They remain producer-owned graph outputs, so none of these
// consumers promotes `.claude`/`.codex`/`.agents` to an SSOT.
for (const stage of graph.stages.filter((candidate) => candidate.id !== 'provider-adapters')) {
  const providerViewSources = stage.sources.filter((source) => /^(?:\.claude|\.codex|\.agents)(?:\/|$)/.test(source))
  if (stage.id === 'plugin-aliases') {
    assert.deepEqual(providerViewSources, ['.claude/commands/', '.claude/hooks/', '.claude/skills/'])
  } else if (stage.id === 'harness-authority-bindings') {
    assert.deepEqual(providerViewSources, ['.claude/hooks/tests/'])
  } else if (stage.id === 'control-plane') {
    assert.deepEqual(providerViewSources, [
      '.agents/skills/',
      '.claude/agents/',
      '.claude/commands/',
      '.claude/hooks/',
      '.claude/references/',
      '.claude/rules/',
      '.claude/settings.json',
      '.claude/skills/',
      '.codex/hooks.json',
    ])
  } else {
    assert.deepEqual(providerViewSources, [], `${stage.id} consumes a generated provider view as source`)
  }
}
assert.deepEqual(ids('commands'), ['plugin-aliases'])
assert.deepEqual(ids('hooks/scripts'), ['plugin-aliases'])
assert.deepEqual(ids('skills'), ['plugin-aliases'])
assert.deepEqual(
  graph.stages.find(stage => stage.id === 'plugin-aliases').outputs,
  resolvePluginAliasContracts(fileURLToPath(new URL('..', import.meta.url))).map(contract => contract.alias).sort(),
  'plugin alias graph outputs must resolve directly from the canonical registry',
)
assert.deepEqual(ids('packages/governance/canonical/plugin-aliases.json'), ['control-plane', 'plugin-aliases'])
assert.deepEqual(ids('template/ds-product-template/.codex/hooks.json'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('template/ds-product-template/.agents/skills/canonical-reviewer/SKILL.md'), ['control-plane', 'fork-template'])
assert.deepEqual(ids('template/ds-product-template/schemas/provider-cli-toolchain.schema.json'), ['control-plane', 'fork-template'])
assert.equal(
  graph.stages.find(stage => stage.id === 'fork-template').outputs.includes('template/ds-product-template/schemas/provider-cli-toolchain.schema.json'),
  true,
  'fork-template must own the exact generated provider CLI schema projection',
)
for (const bootstrapAuthoritySource of [
  'infra/governance/lib/consumer-bootstrap.mjs',
  'infra/governance/schemas/consumer-bootstrap-plan.schema.json',
  'infra/governance/schemas/consumer-bootstrap-snapshot-verification.schema.json',
  'infra/governance/schemas/consumer-bootstrap-readback-verification.schema.json',
  'infra/governance/schemas/consumer-bootstrap-promotion-proposal.schema.json',
  'infra/governance/schemas/consumer-fanout-review.schema.json',
]) assert.deepEqual(ids(bootstrapAuthoritySource), ['control-plane'], `DS-author-only bootstrap source must invalidate only the control-plane:${bootstrapAuthoritySource}`)
assert.deepEqual(ids('infra/governance/schemas/managed-repos.schema.json'), ['control-plane', 'fork-template'])
for (const recurringProjectionSource of [
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'scripts/lib/consumer-control-plane-policy.mjs',
  'infra/governance/inventory/managed-repos.json',
]) assert.deepEqual(ids(recurringProjectionSource), ['control-plane', 'fork-template'], `recurring consumer projection source must invalidate authority and fork-template:${recurringProjectionSource}`)
assert.deepEqual(
  ids('infra/governance/lib/consumer-upgrade-protocol.mjs'),
  ['control-plane', 'fork-template', 'harness-authority-bindings'],
  'the recurring consumer projection library is also an exact runtime dependency of the Harness authority projection',
)
for (const recurringAuthoritySource of [
  'infra/governance/bin/consumerctl.mjs',
  'infra/governance/test/consumerctl.test.mjs',
  'infra/governance/schemas/consumer-control-plane-baseline-receipt.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-plan.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-snapshot-verification.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-readback.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-readback-verification.schema.json',
  'infra/governance/schemas/consumer-control-plane-update-acceptance-proposal.schema.json',
]) assert.deepEqual(ids(recurringAuthoritySource), ['control-plane'], `recurring DS-author transaction source must invalidate only the control-plane:${recurringAuthoritySource}`)
assert.deepEqual(ids('package.json'), ['control-plane'])
assert.deepEqual(allIds('generated/governance/audit-coverage-matrix.json'), ['control-plane', 'governance-metadata'])
assert.deepEqual(allIds('generated/governance/governance-counters.json'), ['control-plane', 'governance-metadata'])
assert.equal(
  graphSeedTargets(graph).includes('generated/governance/audit-coverage-matrix.json'),
  true,
  'atomic generation must seed generated manifest sources before staged graph validation',
)
assert.equal(
  graphSeedTargets(graph).includes('generated/governance/governance-counters.json'),
  true,
  'atomic generation must seed generated manifest sources before staged graph validation',
)
assert.equal(
  graphSeedTargets(graph).includes('.claude/snapshots-baseline'),
  true,
  'atomic generation must seed generated protected-root path shapes before staged graph validation',
)
assert.deepEqual(ids('governance/generated/control-plane.json'), ['control-plane'])
assert.deepEqual(ids('governance/control-plane.lock.json'), ['control-plane'])
assert.deepEqual(ids('scripts/governance-build-graph.json'), ['baseline-mirrors', 'control-plane', 'fork-template', 'harness-authority-bindings', 'plugin-aliases', 'provider-adapters', 'release-version'])
assert.deepEqual(ids('scripts/test-governance-build-graph.mjs'), ['baseline-mirrors', 'control-plane', 'fork-template', 'harness-authority-bindings', 'plugin-aliases', 'provider-adapters', 'release-version'])
assert.deepEqual(allIds('packages/governance/node_modules/fixture/index.js'), [])
assert.deepEqual(allIds('packages/design-system/dist/index.js'), [])
assert.deepEqual(allIds('scripts/generated/obsolete.mjs'), [])
assert.deepEqual(allIds('template/ds-product-template/package-lock.json'), [])
for (const unsafe of ['scripts\\generated.mjs', 'scripts/../generated.mjs', 'scripts\0generated.mjs']) {
  assert.throws(() => affectedStages(graph, [unsafe]), /repository-relative POSIX path|unsafe segment/)
}

const release = graph.stages[0]
assert.deepEqual(release.outputs, [
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  'package-lock.json',
  'packages/governance/canonical/provider-lifecycle.json',
  'packages/governance/package.json',
  'packages/storybook-config/package.json',
  'template/ds-product-template/package.json',
])
for (const output of release.outputs) assert.equal(release.sources.includes(output), true, `version read/write surface is not guarded as source:${output}`)
for (const output of release.outputs) {
  const consumers = graph.stages.slice(1).filter((stage) => stage.sources.some((source) => source === output || (source.endsWith('/') && output.startsWith(source))))
  if (output.startsWith('packages/') || output.startsWith('template/')) assert.equal(consumers.length > 0, true, `version output lacks downstream stage:${output}`)
}

assert.throws(() => validateStageTopology([
  { id: 'consumer', sources: ['generated/a.json'], outputs: ['consumer/a.json'] },
  { id: 'producer', sources: ['canonical/a.json'], outputs: ['generated/a.json'] },
]), /must precede consumer/)
assert.throws(() => validateStageTopology([
  { id: 'same', sources: [], outputs: ['one.json'] },
  { id: 'same', sources: [], outputs: ['two.json'] },
]), /stage ids must be unique/)
assert.throws(() => validateStageTopology([
  { id: 'first', sources: [], outputs: ['generated/'] },
  { id: 'second', sources: [], outputs: ['generated/a.json'] },
]), /multiple producers/)
assert.throws(() => validateStageTopology([
  { id: 'self-cycle', sources: ['canonical/'], outputs: ['canonical/generated.json'], sourceOutputOverlaps: [] },
]), /source\/output overlap/)
assert.throws(() => validateStageTopology([
  { id: 'not-release', sources: ['one.json'], outputs: ['one.json'], sourceOutputOverlaps: ['one.json'] },
]), /may not declare source\/output overlap exceptions/)
assert.doesNotThrow(() => validateStageTopology([
  { id: 'release-version', sources: ['one.json'], outputs: ['one.json'], sourceOutputOverlaps: ['one.json'] },
]))
const derivedHarnessAuthorityPaths = [
  'infra/governance/providers/compatibility-matrix.json',
  'infra/governance/providers/harness-registry.json',
  'infra/governance/providers/harness-source-inventory.json',
]
assert.doesNotThrow(() => validateStageTopology([{
  id: 'harness-authority-bindings',
  sources: derivedHarnessAuthorityPaths,
  outputs: derivedHarnessAuthorityPaths,
  sourceOutputOverlaps: derivedHarnessAuthorityPaths,
}]))
assert.throws(() => validateStageTopology([{
  id: 'harness-authority-bindings',
  sources: [...derivedHarnessAuthorityPaths, 'infra/governance/providers/unreviewed.json'],
  outputs: [...derivedHarnessAuthorityPaths, 'infra/governance/providers/unreviewed.json'],
  sourceOutputOverlaps: [...derivedHarnessAuthorityPaths, 'infra/governance/providers/unreviewed.json'],
}]), /exact derived Harness authority projections/)
assert.throws(() => validateGovernanceInfrastructureClosure([
  { id: 'control-plane', sources: ['infra/governance/providers/'] },
], ['infra/governance/bin/new-governance-command.mjs']), /outside the canonical control-plane corpus/)
assert.deepEqual(productProviderOutputs({ canonical: instructionMaterializerAuthority, providers: [{
  id: 'future-nohook',
  instructionEntry: 'FUTURE.md',
  hookConfig: null,
  skillDirectory: '.future/skills',
  adapter: {
    generate: true,
    instructionView: { materializerId: 'markdown-relative-at-import-v1' },
    productInstructionSource: 'canonical/FUTURE.md',
    productManagedTrees: {
      launchers: {
        sourceRoot: 'canonical/launchers',
        destination: '.future/launchers',
        materializerId: 'closed-tree-copy-v1',
        transformPolicy: 'byte-exact',
      },
    },
    skillView: { directory: '.future/skills' },
  },
}] }), [
  'template/ds-product-template/.future/launchers/',
  'template/ds-product-template/.future/skills/',
  'template/ds-product-template/FUTURE.md',
], 'a future provider without native hooks must not invent a /null output')
assert.deepEqual(productProviderProjectionDeclarations({ canonical: instructionMaterializerAuthority, providers: [{
  id: 'future',
  instructionEntry: 'FUTURE.md',
  hookConfig: '.future/hooks.json',
  skillDirectory: '.future/skills',
  adapter: {
    generate: true,
    instructionView: { materializerId: 'markdown-relative-at-import-v1' },
    productInstructionSource: 'canonical/FUTURE.md',
    productManagedTrees: {
      rules: {
        sourceRoot: 'canonical/rules',
        destination: '.future/rules',
        materializerId: 'closed-tree-copy-v1',
        transformPolicy: 'byte-exact',
      },
    },
    skillView: { directory: '.future/skills' },
  },
}] }), [
  { path: 'template/ds-product-template/.future/hooks.json', kind: 'file', provider: 'future', surface: 'hookConfig' },
  { path: 'template/ds-product-template/.future/rules', kind: 'tree', provider: 'future', surface: 'productManagedTrees.rules' },
  { path: 'template/ds-product-template/.future/skills', kind: 'tree', provider: 'future', surface: 'skillDirectory' },
  { path: 'template/ds-product-template/FUTURE.md', kind: 'file', provider: 'future', surface: 'instructionEntry' },
], 'product provider outputs must derive from the same registry projection authority as repository outputs')
for (const [value, pattern] of [
  ['.future/rules', /must be an object/],
  [{ sourceRoot: '../escape', destination: '.future/rules', materializerId: 'closed-tree-copy-v1', transformPolicy: 'byte-exact' }, /unsafe segment/],
  [{ sourceRoot: 'canonical/rules', destination: '../escape', materializerId: 'closed-tree-copy-v1', transformPolicy: 'byte-exact' }, /unsafe segment/],
  [{ sourceRoot: 'canonical/rules', destination: '.future/rules', materializerId: 'unknown-v1', transformPolicy: 'byte-exact' }, /materializerId is unregistered/],
  [{ sourceRoot: 'canonical/rules', destination: '.future/rules', materializerId: 'closed-tree-copy-v1', transformPolicy: 'lossy' }, /transformPolicy is unsupported/],
  [{ sourceRoot: 'canonical/rules', destination: '.future/rules', materializerId: 'closed-tree-copy-v1', transformPolicy: 'byte-exact', extra: true }, /open or incomplete shape/],
]) {
  assert.throws(() => productProviderProjectionDeclarations({ canonical: instructionMaterializerAuthority, providers: [{
    id: 'future', instructionEntry: 'FUTURE.md', hookConfig: null, skillDirectory: '.future/skills',
    adapter: { generate: true, instructionView: { materializerId: 'markdown-relative-at-import-v1' }, productInstructionSource: 'canonical/FUTURE.md', productManagedTrees: { rules: value }, skillView: null },
  }] }), pattern)
}
const overlappingProductProjection = {
  canonical: instructionMaterializerAuthority,
  providers: [{
    id: 'future', instructionEntry: 'FUTURE.md', hookConfig: null, skillDirectory: '.future/skills',
    adapter: {
      generate: true, instructionView: { materializerId: 'markdown-relative-at-import-v1' },
      productInstructionSource: 'canonical/FUTURE.md', skillView: { directory: '.future/skills' },
      productManagedTrees: {
        home: { sourceRoot: 'canonical/future', destination: '.future', materializerId: 'closed-tree-copy-v1', transformPolicy: 'byte-exact' },
      },
    },
  }],
}
assert.throws(() => productProviderProjectionDeclarations(overlappingProductProjection), /projection paths overlap:product/)
const renamedTreeMaterializerProjection = structuredClone(overlappingProductProjection)
renamedTreeMaterializerProjection.canonical.materializers.treeViews['closed-tree-copy-v2'] =
  renamedTreeMaterializerProjection.canonical.materializers.treeViews['closed-tree-copy-v1']
delete renamedTreeMaterializerProjection.canonical.materializers.treeViews['closed-tree-copy-v1']
renamedTreeMaterializerProjection.providers[0].adapter.productManagedTrees.home.materializerId = 'closed-tree-copy-v2'
renamedTreeMaterializerProjection.providers[0].adapter.productManagedTrees.home.destination = '.future/runtime'
assert.equal(
  productProviderProjectionDeclarations(renamedTreeMaterializerProjection).some((declaration) => (
    declaration.path === 'template/ds-product-template/.future/runtime'
      && declaration.surface === 'productManagedTrees.home'
  )),
  true,
  'tree projection dispatch must follow the registered materializer key while enforcing its engine contract',
)
const duplicatedProductProjection = structuredClone(overlappingProductProjection)
duplicatedProductProjection.providers[0].adapter.productManagedTrees = {}
duplicatedProductProjection.providers.push({ ...structuredClone(duplicatedProductProjection.providers[0]), id: 'future-two' })
assert.throws(() => productProviderProjectionDeclarations(duplicatedProductProjection), /multiple owners:product:FUTURE\.md|multiple owners:product:template\/ds-product-template\/FUTURE\.md/)
assert.deepEqual(repositoryProviderProjectionDeclarations({ canonical: instructionMaterializerAuthority, providers: [{
  id: 'future-nohook',
  instructionEntry: 'FUTURE.md',
  adapter: {
    generate: true,
    instructionView: { materializerId: 'markdown-relative-at-import-v1' },
    repositoryInstructionSource: null,
    repositoryManagedTrees: { rules: '.future/rules' },
    skillView: { directory: '.future/skills' },
    hookView: { output: '.future/hooks.json' },
  },
}] }), [
  { path: '.future/hooks.json', kind: 'file', provider: 'future-nohook', surface: 'hookView.output' },
  { path: '.future/rules', kind: 'tree', provider: 'future-nohook', surface: 'repositoryManagedTrees.rules' },
  { path: '.future/skills', kind: 'tree', provider: 'future-nohook', surface: 'skillView.directory' },
  { path: 'FUTURE.md', kind: 'file', provider: 'future-nohook', surface: 'instructionEntry' },
], 'repository provider outputs must derive from the same registry projection authority as protected roots')
const sharedInstructionProvider = {
  canonical: {
    ...instructionMaterializerAuthority,
    productSharedInstructionSource: 'scripts/fork-role-sources/AGENTS.product.md',
  },
  providers: [{
    id: 'shared', instructionEntry: 'AGENTS.md', hookConfig: null, skillDirectory: '.agents/skills',
    adapter: {
      generate: true,
      instructionView: { materializerId: 'shared-instruction-v1' },
      repositoryInstructionSource: 'AGENTS.md',
      productInstructionSource: 'scripts/fork-role-sources/AGENTS.product.md',
      repositoryManagedTrees: {}, productManagedTrees: {}, skillView: null, hookView: null,
    },
  }],
}
assert.deepEqual(repositoryProviderProjectionDeclarations(sharedInstructionProvider), [], 'shared repository instruction must never become provider-owned output')
assert.deepEqual(productProviderProjectionDeclarations(sharedInstructionProvider), [], 'shared product instruction must remain common authority, not a provider retirement surface')
assert.deepEqual(productCommonProjectionDeclarations(sharedInstructionProvider), [
  { path: 'template/ds-product-template/AGENTS.md', kind: 'file', provider: 'common', surface: 'commonInstruction' },
], 'shared product instruction must resolve once as common authority')
const futureCommonMaterializer = structuredClone(sharedInstructionProvider)
futureCommonMaterializer.canonical.materializers.instructionViews['future-common-v1'] = {
  engine: 'shared-instruction-v1', ownershipPolicy: 'common-authority-consumer', supplementPolicy: 'forbidden',
}
futureCommonMaterializer.providers[0].adapter.instructionView.materializerId = 'future-common-v1'
assert.deepEqual(productProviderProjectionDeclarations(futureCommonMaterializer), [], 'common ownership semantics must not depend on one materializer id')
assert.deepEqual(productCommonProjectionDeclarations(futureCommonMaterializer), [
  { path: 'template/ds-product-template/AGENTS.md', kind: 'file', provider: 'common', surface: 'commonInstruction' },
])

for (const stage of graph.stages) {
  assert.equal(stage.sources.length > 0, true)
  assert.equal(stage.outputs.length > 0, true)
  assert.equal(stage.generate.length > 1, true)
  assert.equal(stage.check.length > 1, true)
}

// Every local ESM dependency needed to start a Node-backed stage must be a declared
// stage input. This catches clean-build bootstrap gaps that a populated working tree
// can conceal (for example, importing a generated output before its first generation).
for (const stage of graph.stages) for (const command of [stage.generate, stage.check]) {
  if (command[0] !== 'node') continue
  const bundle = buildSync({
    absWorkingDir: root,
    entryPoints: [command[1]],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  })
  const undeclared = Object.keys(bundle.metafile.inputs).filter((path) => !stageSourceMatches(stage, path)).sort()
  assert.deepEqual(undeclared, [], `${stage.id} has undeclared local module dependencies for ${command.join(' ')}`)
}

const authorityTransactionTargets = [
  'out/created.txt',
  'out/deleted.txt',
  'out/dirty.txt',
  'out/link',
  'out/tree',
  'state/seed.json',
]
const authoritySeedTargets = ['state/seed.json']

function authorityFixtureInventory(repositoryRoot) {
  const records = []
  const visit = (absolute, path) => {
    const info = fs.lstatSync(absolute)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isSymbolicLink()) {
      records.push(`symlink:${path}:${mode}:${Buffer.from(fs.readlinkSync(absolute)).toString('base64')}`)
      return
    }
    if (info.isDirectory()) {
      records.push(`tree:${path}:${mode}`)
      for (const name of fs.readdirSync(absolute).sort()) visit(join(absolute, name), `${path}/${name}`)
      return
    }
    assert.equal(info.isFile(), true)
    records.push(`file:${path}:${mode}:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`)
  }
  for (const name of fs.readdirSync(repositoryRoot).sort()) visit(join(repositoryRoot, name), name)
  return createHash('sha256').update(`${records.join('\n')}\n`).digest('hex')
}

function createAuthorityFixture(prefix) {
  const outer = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), prefix)))
  const repositoryRoot = join(outer, 'repository')
  fs.mkdirSync(join(repositoryRoot, 'authority'), { recursive: true })
  fs.mkdirSync(join(repositoryRoot, 'out/tree'), { recursive: true })
  fs.mkdirSync(join(repositoryRoot, 'state'), { recursive: true })
  fs.writeFileSync(join(repositoryRoot, 'authority/source.txt'), 'canonical-source\n', { mode: 0o640 })
  fs.writeFileSync(join(repositoryRoot, 'out/dirty.txt'), 'preexisting-user-dirty-bytes\n', { mode: 0o601 })
  fs.writeFileSync(join(repositoryRoot, 'out/tree/stale.txt'), 'stale-generator-output\n', { mode: 0o604 })
  fs.chmodSync(join(repositoryRoot, 'out/tree'), 0o751)
  fs.writeFileSync(join(repositoryRoot, 'out/deleted.txt'), 'must-return-on-rollback\n', { mode: 0o620 })
  fs.symlinkSync('preexisting-broken-target', join(repositoryRoot, 'out/link'))
  fs.writeFileSync(join(repositoryRoot, 'state/seed.json'), '{"userDirty":true}\n', { mode: 0o600 })
  return { outer, repositoryRoot: fs.realpathSync(repositoryRoot) }
}

function authorityFingerprint(repositoryRoot) {
  return createHash('sha256').update(fs.readFileSync(join(repositoryRoot, 'authority/source.txt'))).digest('hex')
}

function writeAuthorityFixtureAfterImage(workspaceRoot) {
  const seed = JSON.parse(fs.readFileSync(join(workspaceRoot, 'state/seed.json'), 'utf8'))
  assert.equal(seed.userDirty, true, 'declared source/output overlap must seed its exact before-image')
  if (seed.source !== undefined) assert.equal(seed.source, authorityFingerprint(workspaceRoot))
  fs.mkdirSync(join(workspaceRoot, 'out/tree'), { recursive: true })
  fs.writeFileSync(join(workspaceRoot, 'out/dirty.txt'), 'deterministic-generated-bytes\n', { mode: 0o644 })
  fs.writeFileSync(join(workspaceRoot, 'out/created.txt'), 'created-by-generator\n', { mode: 0o640 })
  fs.writeFileSync(join(workspaceRoot, 'out/tree/current.txt'), 'complete-tree-after-image\n', { mode: 0o604 })
  fs.chmodSync(join(workspaceRoot, 'out/tree'), 0o750)
  fs.symlinkSync('../authority/source.txt', join(workspaceRoot, 'out/link'))
  fs.writeFileSync(
    join(workspaceRoot, 'state/seed.json'),
    `${JSON.stringify({ source: authorityFingerprint(workspaceRoot), userDirty: seed.userDirty }, null, 2)}\n`,
    { mode: 0o600 },
  )
}

function assertAuthorityFixtureAfterImage(repositoryRoot) {
  assert.equal(fs.readFileSync(join(repositoryRoot, 'out/dirty.txt'), 'utf8'), 'deterministic-generated-bytes\n')
  assert.equal(fs.readFileSync(join(repositoryRoot, 'out/created.txt'), 'utf8'), 'created-by-generator\n')
  assert.equal(fs.readFileSync(join(repositoryRoot, 'out/tree/current.txt'), 'utf8'), 'complete-tree-after-image\n')
  assert.equal(fs.existsSync(join(repositoryRoot, 'out/tree/stale.txt')), false)
  assert.equal(fs.existsSync(join(repositoryRoot, 'out/deleted.txt')), false)
  assert.equal(fs.readlinkSync(join(repositoryRoot, 'out/link')), '../authority/source.txt')
  assert.deepEqual(JSON.parse(fs.readFileSync(join(repositoryRoot, 'state/seed.json'), 'utf8')), {
    source: authorityFingerprint(repositoryRoot),
    userDirty: true,
  })
  assert.equal(fs.lstatSync(join(repositoryRoot, 'out/dirty.txt')).mode & 0o777, 0o644)
  assert.equal(fs.lstatSync(join(repositoryRoot, 'out/tree')).mode & 0o777, 0o750)
}

function authorityTransactionOptions(repositoryRoot, { failLive = false } = {}) {
  return {
    root: repositoryRoot,
    targetPaths: authorityTransactionTargets,
    seedTargetPaths: authoritySeedTargets,
    authorityFingerprint: () => authorityFingerprint(repositoryRoot),
    materializeWorkspace: ({ workspaceRoot }) => {
      fs.cpSync(repositoryRoot, workspaceRoot, {
        recursive: true,
        dereference: false,
        preserveTimestamps: false,
        verbatimSymlinks: true,
      })
    },
    generateWorkspace: ({ workspaceRoot }) => writeAuthorityFixtureAfterImage(workspaceRoot),
    verifyWorkspace: ({ workspaceRoot }) => assertAuthorityFixtureAfterImage(workspaceRoot),
    verifyLive: () => {
      assertAuthorityFixtureAfterImage(repositoryRoot)
      if (failLive) throw new Error('injected late live verification failure')
    },
  }
}

// A failure after every target has been published restores arbitrary dirty
// bytes, modes, symlinks, stale files, deleted files, and initial absence.
{
  const fixture = createAuthorityFixture('governance-graph-late-failure-')
  try {
    const before = authorityFixtureInventory(fixture.repositoryRoot)
    assert.throws(
      () => runAtomicAuthorityGenerationTransaction(authorityTransactionOptions(fixture.repositoryRoot, { failLive: true })),
      /injected late live verification failure/,
    )
    assert.equal(authorityFixtureInventory(fixture.repositoryRoot), before)
    assert.equal(fs.existsSync(join(fixture.repositoryRoot, AUTHORITY_GENERATION_JOURNAL)), false)
    assert.deepEqual(
      fs.readdirSync(fixture.outer).filter((name) => name.startsWith('.governance-build-graph-')),
      [],
    )
  } finally {
    fs.rmSync(fixture.outer, { recursive: true, force: true })
  }
}

// A successful run removes stale/tombstoned outputs, creates missing outputs,
// and a second run is byte/mode/symlink-identical.
{
  const fixture = createAuthorityFixture('governance-graph-idempotence-')
  try {
    const first = runAtomicAuthorityGenerationTransaction(authorityTransactionOptions(fixture.repositoryRoot))
    assert.equal(first.targetCount, authorityTransactionTargets.length)
    assertAuthorityFixtureAfterImage(fixture.repositoryRoot)
    const afterFirst = authorityFixtureInventory(fixture.repositoryRoot)
    const second = runAtomicAuthorityGenerationTransaction(authorityTransactionOptions(fixture.repositoryRoot))
    assert.equal(second.targetCount, authorityTransactionTargets.length)
    assert.equal(authorityFixtureInventory(fixture.repositoryRoot), afterFirst)
    assert.equal(fs.existsSync(join(fixture.repositoryRoot, AUTHORITY_GENERATION_JOURNAL)), false)
  } finally {
    fs.rmSync(fixture.outer, { recursive: true, force: true })
  }
}

// A process death leaves one durable content-bound journal. --check remains
// read-only; unknown post-crash user bytes block recovery; exact restoration
// then recovers the complete before-image.
{
  const fixture = createAuthorityFixture('governance-graph-crash-recovery-')
  try {
    const before = authorityFixtureInventory(fixture.repositoryRoot)
    const crashed = spawnSync(process.execPath, [
      'scripts/test-governance-build-graph-transaction.mjs',
      '--crash-probe',
      fixture.repositoryRoot,
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(crashed.status, 86, crashed.stderr || crashed.stdout)
    assert.equal(fs.existsSync(join(fixture.repositoryRoot, AUTHORITY_GENERATION_JOURNAL)), true)
    const crashState = authorityFixtureInventory(fixture.repositoryRoot)
    assert.throws(
      () => assertAuthorityGenerationIdle({ root: fixture.repositoryRoot }),
      /--check is read-only and will not recover/,
    )
    assert.equal(authorityFixtureInventory(fixture.repositoryRoot), crashState)

    const dirtyPath = join(fixture.repositoryRoot, 'out/dirty.txt')
    const dirtyBeforeUnknown = fs.readFileSync(dirtyPath)
    const dirtyModeBeforeUnknown = fs.lstatSync(dirtyPath).mode & 0o777
    fs.writeFileSync(dirtyPath, 'post-crash-unknown-user-bytes\n')
    const unknownState = authorityFixtureInventory(fixture.repositoryRoot)
    assert.throws(
      () => recoverInterruptedAuthorityGeneration({
        root: fixture.repositoryRoot,
        targetPaths: authorityTransactionTargets,
      }),
      /unknown post-journal content:out\/dirty\.txt/,
    )
    assert.equal(authorityFixtureInventory(fixture.repositoryRoot), unknownState)
    fs.writeFileSync(dirtyPath, dirtyBeforeUnknown)
    fs.chmodSync(dirtyPath, dirtyModeBeforeUnknown)

    const recovered = recoverInterruptedAuthorityGeneration({
      root: fixture.repositoryRoot,
      targetPaths: authorityTransactionTargets,
    })
    assert.equal(recovered.recovered, true)
    assert.equal(recovered.targetCount, authorityTransactionTargets.length)
    assert.equal(authorityFixtureInventory(fixture.repositoryRoot), before)
    assert.equal(fs.existsSync(join(fixture.repositoryRoot, AUTHORITY_GENERATION_JOURNAL)), false)
  } finally {
    fs.rmSync(fixture.outer, { recursive: true, force: true })
  }
}

console.log('✓ one machine-readable graph closes release-version, provider, plugin aliases, fork/template, metadata, and control-plane inputs/outputs')
