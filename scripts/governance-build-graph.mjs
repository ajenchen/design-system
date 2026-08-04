#!/usr/bin/env node
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { assertNoSymlinkPath, canonicalRepositoryRoot } from './refresh-fork-launchers.mjs'
import {
  loadAndValidateProtectedRootClassification,
  pathMatches as protectedPathMatches,
} from './lib/governance-protected-roots.mjs'
import { resolvePluginAliasPlan } from './lib/plugin-alias-contract.mjs'
import {
  productCommonProjectionDeclarations,
  productProviderManagedTreeDeclarations,
  productProviderProjectionDeclarations,
  providerProjectionLocalStateRoots,
  repositoryProviderProjectionDeclarations,
} from './lib/provider-projection-contract.mjs'
import {
  relativeRuntimeImports,
  runtimeDependencyCandidates,
} from './lib/runtime-dependency-closure.mjs'
import {
  assertClosedGitLocalConfiguration,
  materializeClosedHookToolProfile,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'
import {
  assertAuthorityGenerationIdle,
  recoverInterruptedAuthorityGeneration,
  runAtomicAuthorityGenerationTransaction,
} from './lib/canonical-sync-transaction.mjs'

const ROOT = canonicalRepositoryRoot(join(dirname(fileURLToPath(import.meta.url)), '..'))
const GOVERNANCE_RUNTIME_PREFIX = 'infra/governance/runtime/'
const GOVERNANCE_RUNTIME_IGNORE_POLICY = `${GOVERNANCE_RUNTIME_PREFIX}.gitignore`
const PROTECTED_ROOT_INVENTORY = 'infra/governance/protected-root-classification.json'
const PROTECTED_ROOT_SCHEMA = 'infra/governance/schemas/protected-root-classification.schema.json'
const GLOBAL_INPUTS = [
  '.husky/pre-commit',
  'scripts/governance-build-graph.json',
  'scripts/governance-build-graph.mjs',
  'scripts/schemas/governance-build-graph.schema.json',
  'scripts/test-governance-build-graph.mjs',
]
export const FORK_TEMPLATE_REQUIRED_EXACT_SOURCES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/inventory/managed-repos.json',
  'infra/governance/lib/consumer-upgrade-protocol.mjs',
  'infra/governance/lib/managed-repository-ownership.mjs',
  'infra/governance/providers/certifications.json',
  'infra/governance/providers/compatibility-matrix.json',
  'infra/governance/providers/provider-cli-toolchain.json',
  'infra/governance/providers/provider-cli-toolchain.package-lock.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'infra/governance/schemas/issuer-registry.schema.json',
  'infra/governance/schemas/managed-repos.schema.json',
  'infra/governance/schemas/provider-cli-toolchain.schema.json',
  'infra/governance/schemas/visual-baseline-review-policy.schema.json',
  'infra/governance/trust/issuers.json',
  'infra/governance/visual-baseline-review-policy.json',
  'packages/design-system/package.json',
  'packages/design-system/src/tokens/utility-registry.json',
  'packages/design-system/src/tokens/utility-registry.schema.json',
  'packages/governance/canonical/provider-lifecycle.json',
  'packages/governance/canonical/schemas/provider-lifecycle.schema.json',
  'packages/governance/src/canonical-order.mjs',
  'packages/governance/src/closed-tool-execution.mjs',
  'packages/governance/src/provider-hook-normalization.mjs',
  'packages/governance/src/provider-review-binding.mjs',
  'packages/storybook-config/package.json',
  'template/ds-product-template/.npmrc',
  'template/ds-product-template/package.json',
  'scripts/lib/closed-tool-execution.mjs',
].sort())
export const FORK_TEMPLATE_FORBIDDEN_EAGER_SOURCES = Object.freeze([
  'infra/governance/lib/common.mjs',
  'infra/governance/lib/harness-registry.mjs',
  'infra/governance/lib/harness-source-inventory.mjs',
  'infra/governance/lib/provider-compatibility.mjs',
].sort())
export const DEEP_AUDIT_RUBRIC_SELF_GUARD = Object.freeze([
  'scripts/governance-build-graph.json',
  'scripts/schemas/governance-build-graph.schema.json',
  'packages/governance/canonical/manifest.json',
  'packages/governance/canonical/schemas/manifest.schema.json',
])
const RUNTIME_MODULE = /\.(?:cjs|js|mjs)$/
const packageScriptSnapshots = new Map()

function repositoryPath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') || isAbsolute(value)) throw new Error(`${label} must be a repository-relative POSIX path`)
  const trimmed = value.endsWith('/') ? value.slice(0, -1) : value
  if (!trimmed || trimmed.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`${label} contains an unsafe segment:${value}`)
  return value
}

function readJsonRegularAt(root, path, label) {
  assertNoSymlinkPath(root, path, label, { allowMissing: false })
  const before = lstatSync(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) throw new Error(`${label} must be one regular file`)
  const bytes = readFileSync(path, 'utf8')
  const after = lstatSync(path, { bigint: true })
  if (
    before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.nlink !== after.nlink
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
  ) throw new Error(`${label} changed while it was read`)
  return JSON.parse(bytes)
}

function packageScriptsAt(root) {
  const packagePath = join(root, 'package.json')
  const document = readJsonRegularAt(root, packagePath, 'governance build graph npm script registry')
  if (!document.scripts || typeof document.scripts !== 'object' || Array.isArray(document.scripts)) {
    throw new Error('governance build graph npm script registry is missing')
  }
  const serialized = JSON.stringify(document.scripts)
  const cached = packageScriptSnapshots.get(root)
  if (cached && cached.serialized !== serialized) {
    throw new Error('governance build graph npm script registry changed after runtime closure validation')
  }
  if (cached) return cached.scripts
  const snapshot = Object.freeze({ scripts: Object.freeze({ ...document.scripts }), serialized })
  packageScriptSnapshots.set(root, snapshot)
  return snapshot.scripts
}

function relativeFrom(root, baseFile, pointer) {
  const absolute = resolve(dirname(baseFile), pointer)
  const rel = relative(root, absolute).split(sep).join('/')
  repositoryPath(rel, `resolved pointer ${pointer}`)
  return rel
}

function sourceDeclaration(root, path, label) {
  repositoryPath(path, label)
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const absolute = join(root, trimmed)
  assertNoSymlinkPath(root, absolute, label, { allowMissing: false })
  const info = lstatSync(absolute)
  if (info.isDirectory()) return `${trimmed}/`
  if (info.isFile()) return trimmed
  throw new Error(`${label} must be a regular file or directory`)
}

const directoryDeclaration = (path, label) => {
  const trimmed = repositoryPath(path, label).replace(/\/$/, '')
  return `${trimmed}/`
}

function providerContractSources(root, providersPath, providers) {
  const sources = [
    relative(root, providersPath).split(sep).join('/'),
    relativeFrom(root, providersPath, providers.$schema),
    ...Object.values(providers.canonical.roots),
    providers.canonical.hookRegistrations,
    providers.canonical.skillSemantics,
  ]
  if (providers.canonical.productSharedInstructionSource) sources.push(providers.canonical.productSharedInstructionSource)
  for (const provider of providers.providers) {
    if (provider.adapter.repositoryInstructionSource) sources.push(provider.adapter.repositoryInstructionSource)
    if (provider.adapter.productInstructionSource) sources.push(provider.adapter.productInstructionSource)
    if (provider.adapter.hookView?.settingsTemplate) sources.push(provider.adapter.hookView.settingsTemplate)
    if (provider.runtime?.transcript?.fixture) sources.push(provider.runtime.transcript.fixture)
    if (provider.runtime?.memorySyncScript) sources.push(provider.runtime.memorySyncScript)
  }
  const productTreeSources = new Set(productProviderManagedTreeDeclarations(providers).map((tree) => tree.sourceRoot))
  sources.push(...productTreeSources)
  return sources.map((path) => {
    const declaration = sourceDeclaration(root, path, `provider contract source ${path}`)
    if (productTreeSources.has(path) && !declaration.endsWith('/')) throw new Error(`product managed tree source must be a real directory:${path}`)
    return declaration
  })
}

function governanceManifestResolution(root, manifestPath, manifest) {
  const sources = [relative(root, manifestPath).split(sep).join('/'), relativeFrom(root, manifestPath, manifest.$schema)]
  const sourceExcludes = []
  for (const pointer of Object.values(manifest.registries || {})) sources.push(relativeFrom(root, manifestPath, pointer))
  for (const pointer of Object.values(manifest.artifactSchemas || {})) sources.push(relativeFrom(root, manifestPath, pointer))
  for (const source of manifest.sources || []) {
    const declaration = sourceDeclaration(root, source.path, `governance manifest source ${source.id}`)
    sources.push(declaration)
    for (const exclusion of source.excludes || []) {
      repositoryPath(exclusion, `governance manifest source ${source.id} exclusion`)
      if (!exclusion.endsWith('/') || !declaration.endsWith('/') || exclusion === declaration || !pathMatches(exclusion, declaration)) {
        throw new Error(`governance manifest source exclusion is outside its directory source:${source.id}:${exclusion}`)
      }
      sourceExcludes.push(exclusion)
    }
  }
  for (const contract of manifest.skillParityContracts || []) if (contract.projection?.module) sources.push(contract.projection.module)
  return { sources, sourceExcludes }
}

function rootProviderOutputs(providers) {
  // Coverage/runtime are neutral generated artifacts. Marketplace plugin transport is a
  // registry-owned compatibility projection: its path remains managed after provider retirement
  // so deletion of stale bytes participates in pre-commit staging.
  const outputs = [
    providers.canonical.compatibilityProjections.marketplacePluginTransport.hookOutput,
    'generated/governance/provider-hook-coverage.json',
    'generated/governance/provider-runtime-validator.mjs',
  ]
  for (const declaration of repositoryProviderProjectionDeclarations(providers)) {
    outputs.push(declaration.kind === 'tree'
      ? directoryDeclaration(declaration.path, `${declaration.provider} ${declaration.surface} output`)
      : declaration.path)
  }
  return outputs
}

export function productProviderOutputs(providers) {
  return [...productCommonProjectionDeclarations(providers), ...productProviderProjectionDeclarations(providers)].map((declaration) => (
    declaration.kind === 'tree'
      ? directoryDeclaration(declaration.path, `${declaration.provider} ${declaration.surface} product output`)
      : declaration.path
  ))
}

function productProviderLocalStateResolution(providers) {
  return {
    sources: [],
    sourceExcludes: providerProjectionLocalStateRoots(providers, 'product')
      .map((path) => directoryDeclaration(path, 'product provider-local source exclusion')),
  }
}

function governanceInfrastructureFiles(root = ROOT) {
  const files = []
  const infrastructureRoot = join(root, 'infra/governance')
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
      const absolute = join(directory, entry.name)
      const repoPath = relative(root, absolute).split(sep).join('/')
      if (repoPath.startsWith(GOVERNANCE_RUNTIME_PREFIX) && repoPath !== GOVERNANCE_RUNTIME_IGNORE_POLICY) continue
      if (entry.isSymbolicLink()) throw new Error(`governance infrastructure corpus crosses a symbolic link:${repoPath}`)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(repoPath)
      else throw new Error(`governance infrastructure corpus contains an unsupported entry:${repoPath}`)
    }
  }
  visit(infrastructureRoot)
  return files
}

export function validateGovernanceInfrastructureClosure(stages, files = governanceInfrastructureFiles()) {
  const controlPlane = stages.find((stage) => stage.id === 'control-plane')
  if (!controlPlane) throw new Error('governance build graph is missing the control-plane stage')
  const unmanaged = files
    .filter((path) => !path.startsWith(GOVERNANCE_RUNTIME_PREFIX) || path === GOVERNANCE_RUNTIME_IGNORE_POLICY)
    .filter((path) => !stageSourceMatches(controlPlane, path))
    .sort()
  if (unmanaged.length) {
    throw new Error(`governance infrastructure files are outside the canonical control-plane corpus:\n${unmanaged.map((path) => `  - ${path}`).join('\n')}`)
  }
}

function validateJsonDocument(document, schema, label) {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(document)) throw new Error(`${label} schema failure:${(validate.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}

function buildGraphPaths(root) {
  return {
    graphPath: join(root, 'scripts/governance-build-graph.json'),
    graphSchemaPath: join(root, 'scripts/schemas/governance-build-graph.schema.json'),
    providersPath: join(root, 'packages/governance/canonical/providers.json'),
    manifestPath: join(root, 'packages/governance/canonical/manifest.json'),
  }
}

function loadBuildGraphDocuments(root) {
  const paths = buildGraphPaths(root)
  const graphSchema = readJsonRegularAt(root, paths.graphSchemaPath, 'governance build graph schema')
  const graph = readJsonRegularAt(root, paths.graphPath, 'governance build graph')
  validateJsonDocument(graph, graphSchema, 'governance build graph')
  const providers = readJsonRegularAt(root, paths.providersPath, 'provider registry')
  const providersSchemaPath = resolve(dirname(paths.providersPath), providers.$schema)
  const providersSchema = readJsonRegularAt(root, providersSchemaPath, 'provider registry schema')
  validateJsonDocument(providers, providersSchema, 'provider registry')
  const manifest = readJsonRegularAt(root, paths.manifestPath, 'governance canonical manifest')
  const manifestSchemaPath = resolve(dirname(paths.manifestPath), manifest.$schema)
  const manifestSchema = readJsonRegularAt(root, manifestSchemaPath, 'governance canonical manifest schema')
  validateJsonDocument(manifest, manifestSchema, 'governance canonical manifest')
  return { ...paths, graph, providers, providersSchema, manifest }
}

function resolveGraphStages({ root, graph, providers, providersPath, manifest, manifestPath }) {
  const sourceResolvers = {
    'provider-contract': () => ({ sources: providerContractSources(root, providersPath, providers), sourceExcludes: [] }),
    'governance-manifest': () => governanceManifestResolution(root, manifestPath, manifest),
    'product-provider-local-state': () => productProviderLocalStateResolution(providers),
    // The control-plane inspector validates the materialized repository
    // provider surfaces before generating its snapshot. They remain outputs of
    // provider-adapters (and are therefore excluded from canonical source
    // fingerprints), but they are also explicit upstream inputs to the
    // control-plane stage and its one-time genesis closure.
    'root-provider-views': () => ({
      sources: [
        ...(graph.stages.find((stage) => stage.id === 'provider-adapters')?.outputs ?? []),
        ...rootProviderOutputs(providers),
      ],
      sourceExcludes: [],
    }),
  }
  const outputResolvers = {
    'root-provider-views': () => rootProviderOutputs(providers),
    'product-provider-views': () => productProviderOutputs(providers),
    'plugin-alias-views': () => resolvePluginAliasPlan(root, { providersDocument: providers }).aliases,
  }
  return graph.stages.map((stage) => {
    const resolvedSources = stage.sourceResolvers.map((name) => sourceResolvers[name]())
    const sources = [...stage.sources, ...GLOBAL_INPUTS, ...resolvedSources.flatMap(resolution => resolution.sources)]
    const outputs = [...stage.outputs, ...stage.outputResolvers.flatMap((name) => outputResolvers[name]())]
    const sourceExcludes = [...stage.sourceExcludes, ...resolvedSources.flatMap(resolution => resolution.sourceExcludes)]
    for (const [kind, paths] of [['source', sources], ['source exclusion', sourceExcludes], ['output', outputs]]) for (const path of paths) repositoryPath(path, `${stage.id} ${kind}`)
    const normalizedSources = [...new Set(sources)].sort()
    for (const exclusion of sourceExcludes) {
      if (!normalizedSources.some((source) => source.endsWith('/') && pathMatches(exclusion, source))) {
        throw new Error(`${stage.id} source exclusion is not nested under a declared source tree:${exclusion}`)
      }
    }
    return { ...stage, sources: normalizedSources, sourceExcludes: [...new Set(sourceExcludes)].sort(), outputs: [...new Set(outputs)].sort() }
  })
}

export function missingForkTemplateExactSources(stages) {
  const stage = stages.find((candidate) => candidate.id === 'fork-template')
  if (!stage) return [...FORK_TEMPLATE_REQUIRED_EXACT_SOURCES]
  const sources = new Set(stage.sources)
  return FORK_TEMPLATE_REQUIRED_EXACT_SOURCES.filter((path) => !sources.has(path)).sort()
}

export function validateForkTemplateRuntimeBoundary(stages) {
  const stage = stages.find((candidate) => candidate.id === 'fork-template')
  if (!stage) throw new Error('governance build graph is missing the fork-template stage')
  const missing = missingForkTemplateExactSources(stages)
  if (missing.length) throw new Error(`fork-template exact runtime input closure is missing:${missing.join(',')}`)
  const forbidden = FORK_TEMPLATE_FORBIDDEN_EAGER_SOURCES.filter((path) => stage.sources.includes(path))
  if (forbidden.length) throw new Error(`fork-template imports eager authority/Harness sources:${forbidden.join(',')}`)
  const generated = stage.sources.filter((path) => (
    path.startsWith('generated/')
    || path.startsWith('governance/generated/')
    || path.startsWith('packages/design-system/ds-canonical/fork/')
    || path.startsWith('template/ds-product-template/governance/')
  )).sort()
  if (generated.length) throw new Error(`fork-template consumes generated views as runtime sources:${generated.join(',')}`)
  return { missing, forbidden, generated }
}

function commandRuntimeEntrypoint(stage, command, packageScripts) {
  if (command[0] === 'node') {
    return {
      entrypoint: repositoryPath(command[1], `${stage.id} command runtime entrypoint`),
      npmBacked: false,
    }
  }
  if (command[0] !== 'npm') throw new Error(`${stage.id} build command must use node or a closed npm script`)
  const runIndex = command.indexOf('run')
  if (runIndex < 1) throw new Error(`${stage.id} npm build command must use npm run`)
  const names = command.slice(runIndex + 1).filter((token) => !token.startsWith('-'))
  if (names.length !== 1) throw new Error(`${stage.id} npm build command must resolve one exact script`)
  const scriptName = names[0]
  const body = packageScripts?.[scriptName]
  if (typeof body !== 'string' || !body.trim()) throw new Error(`${stage.id} npm runtime script is missing:${scriptName}`)
  if (/[\n\r\0]|(?:&&|\|\||[;<>`]|\$\()/.test(body)) throw new Error(`${stage.id} npm runtime script contains shell control syntax:${scriptName}`)
  const tokens = body.trim().split(/\s+/)
  if (tokens[0] !== 'node' || tokens.length < 2) throw new Error(`${stage.id} npm runtime script must use one committed Node entrypoint:${scriptName}`)
  return {
    entrypoint: repositoryPath(tokens[1], `${stage.id} npm script runtime entrypoint`),
    npmBacked: true,
  }
}

export function validateLiteralNodeSubprocessEntrypoints({
  source,
  importer,
  declaredRuntimeEntrypoints,
}) {
  if (typeof source !== 'string') throw new Error(`${importer} subprocess source must be text`)
  const runInvocations = [...source.matchAll(/\brun\s*\(/g)].filter((match) => {
    const prefix = source.slice(Math.max(0, match.index - 32), match.index)
    return !/function\s+$/.test(prefix)
  })
  const literalCalls = [...source.matchAll(/\brun\s*\(\s*\[\s*(['"])node\1\s*,\s*(['"])([A-Za-z0-9_.@/-]+)\2/g)]
  if (!/spawnSync\s*\(\s*command\[0\]/.test(source) || runInvocations.length !== literalCalls.length) {
    throw new Error(`${importer} npm-backed subprocess closure contains a non-literal or unsupported run invocation`)
  }
  const discovered = [...new Set(literalCalls.map((match) => repositoryPath(match[3], `${importer} literal Node subprocess`)))].sort()
  if (!discovered.length) throw new Error(`${importer} npm-backed subprocess closure has no literal Node subprocess roots`)
  const declared = new Set(declaredRuntimeEntrypoints)
  const missing = discovered.filter((path) => !declared.has(path))
  if (missing.length) throw new Error(`${importer} literal Node subprocess roots are absent from runtimeEntrypoints:${missing.join(',')}`)
  return discovered
}

function resolveStageRuntimeClosure(root, stage, packageScripts) {
  const roots = [...stage.runtimeEntrypoints]
  if (JSON.stringify(roots) !== JSON.stringify([...roots].sort())) throw new Error(`${stage.id} runtimeEntrypoints must be sorted`)
  const declared = new Set(roots)
  const commandEntrypoints = []
  for (const command of [stage.generate, stage.check]) {
    const resolvedCommand = commandRuntimeEntrypoint(stage, command, packageScripts)
    const { entrypoint } = resolvedCommand
    if (!declared.has(entrypoint)) throw new Error(`${stage.id} runtimeEntrypoints omits its build command entrypoint:${entrypoint}`)
    commandEntrypoints.push(resolvedCommand)
  }
  const npmRoots = [...new Set(commandEntrypoints.filter((entry) => entry.npmBacked).map((entry) => entry.entrypoint))]
  const subprocessRoots = []
  for (const importer of npmRoots) {
    const absolute = join(root, importer)
    assertNoSymlinkPath(root, absolute, `${stage.id} npm-backed runtime wrapper`, { allowMissing: false })
    subprocessRoots.push(...validateLiteralNodeSubprocessEntrypoints({
      source: readFileSync(absolute, 'utf8'),
      importer,
      declaredRuntimeEntrypoints: roots,
    }))
  }
  const requiredRoots = [...new Set([
    ...commandEntrypoints.map((entry) => entry.entrypoint),
    ...subprocessRoots,
  ])].sort()
  if (JSON.stringify(roots) !== JSON.stringify(requiredRoots)) {
    const stale = roots.filter((path) => !requiredRoots.includes(path))
    throw new Error(`${stage.id} runtimeEntrypoints contains stale or unbound roots:${stale.join(',')}`)
  }
  const queue = [...roots]
  const scanned = new Set()
  const edges = []
  while (queue.length) {
    const importer = queue.shift()
    if (scanned.has(importer)) continue
    if (!stageSourceMatches(stage, importer)) throw new Error(`${stage.id} runtime entrypoint is outside its declared sources:${importer}`)
    const absolute = join(root, importer)
    assertNoSymlinkPath(root, absolute, `${stage.id} runtime module`, { allowMissing: false })
    const info = lstatSync(absolute)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${stage.id} runtime module must be a regular no-symlink file:${importer}`)
    const source = readFileSync(absolute, 'utf8')
    scanned.add(importer)
    for (const dependency of relativeRuntimeImports(source)) {
      const resolution = runtimeDependencyCandidates(importer, dependency)
      const resolved = resolution.candidates.find((candidate) => {
        const candidatePath = join(root, candidate)
        return existsSync(candidatePath) && lstatSync(candidatePath).isFile()
      }) || null
      if (!resolved) throw new Error(`${stage.id} runtime dependency is missing:${importer} -> ${dependency.specifier} (${resolution.target})`)
      if (!stageSourceMatches(stage, resolved)) throw new Error(`${stage.id} runtime dependency is outside its declared sources:${importer} -> ${resolved}`)
      edges.push({ importer, specifier: dependency.specifier, resolved })
      if (RUNTIME_MODULE.test(resolved) && !scanned.has(resolved)) queue.push(resolved)
    }
  }
  return {
    stageId: stage.id,
    runtimeModules: [...scanned].sort(),
    edges: edges.sort((left, right) => compareUtf8Bytes(
      `${left.importer}:${left.specifier}`,
      `${right.importer}:${right.specifier}`,
    )),
  }
}

export function validateRuntimeEntrypointClosure(stages, { repoRoot = ROOT } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const requiresPackageScripts = stages.some((stage) => [stage.generate, stage.check].some((command) => command[0] === 'npm'))
  let packageScripts = null
  if (requiresPackageScripts) {
    packageScripts = packageScriptsAt(root)
  }
  return stages.map((stage) => resolveStageRuntimeClosure(root, stage, packageScripts))
}

export function validateRuntimeEntrypointExactSources(stages) {
  const missing = []
  for (const stage of stages) {
    const exactSources = new Set(stage.sources.filter((source) => !source.endsWith('/')))
    for (const entrypoint of stage.runtimeEntrypoints) {
      if (!exactSources.has(entrypoint)) missing.push(`${stage.id}:${entrypoint}`)
    }
  }
  if (missing.length) {
    throw new Error(`governance runtime entrypoints lack exact source ownership:${missing.sort().join(',')}`)
  }
  return true
}

export function validateDeepAuditScopes(stages) {
  const invalid = stages.filter((stage) => !['none', 'deep-audit-rubric'].includes(stage.auditScope))
  if (invalid.length) throw new Error(`governance build graph has invalid auditScope:${invalid.map((stage) => stage.id).join(',')}`)
  const rubricStages = stages.filter((stage) => stage.auditScope === 'deep-audit-rubric')
  if (rubricStages.length !== 1) throw new Error(`governance build graph must declare exactly one deep-audit-rubric stage; found=${rubricStages.length}`)
  return rubricStages[0]
}

export function resolveDeepAuditRubricPaths({ repoRoot = ROOT, inventory } = {}) {
  const root = resolve(repoRoot)
  if (!Array.isArray(inventory) || inventory.length === 0) throw new Error('deep-audit rubric resolution requires a non-empty frozen inventory')
  const documents = loadBuildGraphDocuments(root)
  const stages = resolveGraphStages({ root, ...documents })
  const rubricStage = validateDeepAuditScopes(stages)
  validateStageTopology(stages)
  const matched = inventory
    .filter((row) => row && typeof row.path === 'string' && stageSourceMatches(rubricStage, row.path))
  if (new Set(matched.map((row) => row.path)).size !== matched.length) {
    throw new Error('deep-audit rubric inventory contains duplicate paths')
  }
  // A tracked deletion below a declared source tree is a frozen tombstone in the
  // full run inventory, not readable rubric content. Excluding that missing leaf
  // lets the audit examine the exact proposed after-image while indexDigest,
  // inventoryDigest and worktreeFingerprint still bind the deletion. Direct
  // build-graph sources and the self-guards remain required regular files.
  const selected = matched
    .filter((row) => row.kind !== 'missing')
    .map((row) => row.path)
    .sort()
  const selectedSet = new Set(selected)
  const unsafe = inventory.filter((row) => selectedSet.has(row?.path) && row.kind !== 'file')
  if (unsafe.length) {
    throw new Error(`deep-audit rubric contains symbolic-link or unsupported inputs:${unsafe.map((row) => `${row.path}:${row.kind}`).join(',')}`)
  }
  for (const required of DEEP_AUDIT_RUBRIC_SELF_GUARD) {
    const row = inventory.find((candidate) => candidate?.path === required)
    if (!row || row.kind !== 'file' || !selected.includes(required)) throw new Error(`deep-audit rubric self-guard is missing or unsafe:${required}`)
  }
  for (const exactSource of rubricStage.sources.filter((source) => !source.endsWith('/') && stageSourceMatches(rubricStage, source))) {
    const row = inventory.find((candidate) => candidate?.path === exactSource)
    if (!row || row.kind !== 'file' || !selectedSet.has(exactSource)) {
      throw new Error(`deep-audit rubric exact source is missing or unsafe:${exactSource}${row ? `:${row.kind}` : ':absent'}`)
    }
  }
  if (selected.length === DEEP_AUDIT_RUBRIC_SELF_GUARD.length) throw new Error('deep-audit rubric corpus is empty beyond its self-guard')
  return selected
}

function resolveGovernanceBuildGraph({ repoRoot = ROOT, providerRegistry = null } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const documents = loadBuildGraphDocuments(root)
  if (providerRegistry) {
    documents.providers = structuredClone(providerRegistry)
    validateJsonDocument(documents.providers, documents.providersSchema, 'provider registry override')
  }
  const stages = resolveGraphStages({ root, ...documents })
  validateDeepAuditScopes(stages)
  validateForkTemplateRuntimeBoundary(stages)
  validateStageTopology(stages)
  validateRuntimeEntrypointExactSources(stages)
  validateRuntimeEntrypointClosure(stages, { repoRoot: root })
  validateGovernanceInfrastructureClosure(stages, governanceInfrastructureFiles(root))
  return {
    root,
    documents,
    graph: { schemaVersion: documents.graph.schemaVersion, stages },
  }
}

// The one-time control-plane genesis verifier must classify the proposed Git
// tree with the candidate graph while the trusted base can still contain
// legacy protected-root shapes. It receives only the fully schema/topology/
// runtime-validated semantic graph; ordinary generation and checks continue
// through loadGovernanceBuildGraph and its complete live filesystem guard.
export function loadGovernanceBuildGraphSemanticDefinition(options = {}) {
  return resolveGovernanceBuildGraph(options).graph
}

export function loadGovernanceBuildGraph(options = {}) {
  const { root, documents, graph } = resolveGovernanceBuildGraph(options)
  const { stages } = graph
  loadAndValidateProtectedRootClassification({
    root,
    inventoryPath: PROTECTED_ROOT_INVENTORY,
    schemaPath: PROTECTED_ROOT_SCHEMA,
    stages,
    providerRegistry: documents.providers,
    allowedCanonicalOutputOverlaps: [...new Set(stages.flatMap((stage) => stage.sourceOutputOverlaps || []))],
  })
  return graph
}

export function validateStageTopology(stages) {
  const stageIds = stages.map((stage) => stage.id)
  if (new Set(stageIds).size !== stageIds.length) throw new Error('governance build graph stage ids must be unique')
  const derivedMetadataOverlaps = new Set([
    'infra/governance/providers/compatibility-matrix.json',
    'infra/governance/providers/harness-registry.json',
    'infra/governance/providers/harness-source-inventory.json',
  ])
  // In-place transforms are closed to exact files: release-version owns version
  // fields, while harness-authority-bindings owns only the three transitive digest
  // projections above. Directory overlap and every other source/output
  // self-cycle remain forbidden, so generated bytes cannot hide inside a broad
  // canonical source declaration.
  for (const stage of stages) {
    const allowed = new Set(stage.sourceOutputOverlaps || [])
    if (allowed.size && !['release-version', 'harness-authority-bindings'].includes(stage.id)) {
      throw new Error(`${stage.id} may not declare source/output overlap exceptions`)
    }
    if (
      stage.id === 'harness-authority-bindings'
      && (
        allowed.size !== derivedMetadataOverlaps.size
        || [...allowed].some(path => !derivedMetadataOverlaps.has(path))
      )
    ) {
      throw new Error('harness-authority-bindings source/output overlaps must be the exact derived Harness authority projections')
    }
    for (const path of allowed) {
      if (!stage.sources.includes(path) || !stage.outputs.includes(path) || path.endsWith('/')) {
        throw new Error(`${stage.id} source/output exception must be the same exact source and output file:${path}`)
      }
    }
    for (const source of stage.sources) for (const output of stage.outputs) {
      const overlaps = pathMatches(output, source) || pathMatches(source, output)
      if (!overlaps) continue
      if ((stage.sourceExcludes || []).some((exclusion) => pathMatches(output, exclusion))) continue
      if (source !== output || !allowed.has(source)) {
        throw new Error(`${stage.id} has an undeclared or non-exact source/output overlap:${source} <> ${output}`)
      }
    }
  }
  // Across different stages there must be one producer and it must run before every consumer.
  for (let producerIndex = 0; producerIndex < stages.length; producerIndex += 1) {
    const producer = stages[producerIndex]
    for (const output of producer.outputs) {
      for (let otherIndex = 0; otherIndex < stages.length; otherIndex += 1) {
        if (otherIndex === producerIndex) continue
        const other = stages[otherIndex]
        if (other.outputs.some((candidate) => pathMatches(output, candidate) || pathMatches(candidate, output))) {
          throw new Error(`governance build graph has multiple producers for ${output}:${producer.id},${other.id}`)
        }
        if (stageSourceDeclarationOverlaps(other, output) && producerIndex > otherIndex) {
          throw new Error(`governance build graph producer ${producer.id} must precede consumer ${other.id} for ${output}`)
        }
      }
    }
  }
}

export function pathMatches(path, declaration) {
  return protectedPathMatches(path, declaration)
}

export function stageSourceMatches(stage, path) {
  return stage.sources.some((declaration) => pathMatches(path, declaration))
    && !(stage.sourceExcludes || []).some((declaration) => pathMatches(path, declaration))
}

function stageSourceDeclarationOverlaps(stage, output) {
  const overlaps = stage.sources.some((source) => pathMatches(output, source) || pathMatches(source, output))
  if (!overlaps) return false
  return !(stage.sourceExcludes || []).some((exclusion) => pathMatches(output, exclusion))
}

export function affectedStages(graph, paths) {
  return graph.stages.filter((stage) => paths.some((path) => stageSourceMatches(stage, path) || stage.outputs.some((declaration) => pathMatches(path, declaration))))
}

function graphOutputTargets(graph) {
  return [...new Set(graph.stages.flatMap((stage) => stage.outputs)
    .map((path) => repositoryPath(path, 'governance build graph output').replace(/\/$/, '')))]
    .sort(compareUtf8Bytes)
}

export function graphSeedTargets(graph) {
  // The staged workspace is validated before any generator runs. Preserve each
  // generated target's exact before-image so protected-root path shape and
  // cross-stage manifest inputs can bootstrap exactly as they do in the live
  // repository. Every producer still runs and the complete staged check must
  // pass before publication, so seeded bytes can never substitute for a fresh
  // generated after-image; stale outputs remain subject to deletion.
  return graphOutputTargets(graph)
}

function underGraphTarget(path, target) {
  return path === target || path.startsWith(`${target}/`)
}

function graphSourcePathRelevant(graph, path) {
  return graph.stages.some((stage) => (
    stageSourceMatches(stage, path)
      || stage.sources.some((source) => source.replace(/\/$/, '').startsWith(`${path}/`))
  ))
}

function graphSourcePathOwned(graph, path) {
  return graph.stages.some((stage) => stageSourceMatches(stage, path))
}

function graphPathIsOutput(path, outputTargets) {
  return outputTargets.some((target) => underGraphTarget(path, target))
}

function graphSourceCorpusRecords(graph, { repoRoot = ROOT } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const outputTargets = graphOutputTargets(graph)
  const records = []
  const visit = (absolute, path) => {
    if (graphPathIsOutput(path, outputTargets) || !graphSourcePathRelevant(graph, path)) return
    const info = lstatSync(absolute)
    const mode = (info.mode & 0o777).toString(8).padStart(3, '0')
    if (info.isSymbolicLink()) {
      if (graphSourcePathOwned(graph, path)) {
        records.push(`symlink:${path}:${mode}:${Buffer.from(readlinkSync(absolute)).toString('base64')}`)
      }
      return
    }
    if (info.isDirectory()) {
      if (graphSourcePathOwned(graph, path)) records.push(`tree:${path}:${mode}`)
      for (const name of readdirSync(absolute).sort(compareUtf8Bytes)) {
        visit(join(absolute, name), `${path}/${name}`)
      }
      return
    }
    if (!info.isFile() || info.nlink !== 1) throw new Error(`governance build graph source contains an unsupported or hard-linked entry:${path}`)
    if (graphSourcePathOwned(graph, path)) {
      records.push(`file:${path}:${mode}:${createHash('sha256').update(readFileSync(absolute)).digest('hex')}`)
    }
  }
  for (const name of readdirSync(root).sort(compareUtf8Bytes)) {
    visit(join(root, name), name)
  }
  return records
}

export function governanceBuildGraphAuthorityFingerprint(graph, { repoRoot = ROOT } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const records = graphSourceCorpusRecords(graph, { repoRoot: root })
  if (!records.length) throw new Error('governance build graph authority corpus is empty')
  for (const [label, args] of [
    ['head', ['rev-parse', 'HEAD']],
    ['tree', ['rev-parse', 'HEAD^{tree}']],
    ['index', ['ls-files', '--stage', '-z']],
  ]) {
    const result = runClosedGit(args, {
      cwd: root,
      maxOutputBytes: 16 * 1024 * 1024,
      timeoutMs: 10_000,
    })
    if (result.error || result.signal !== null || result.status !== 0) {
      throw new Error(`governance build graph cannot bind Git ${label} authority`)
    }
    records.push(`git-${label}:${createHash('sha256').update(result.stdout).digest('hex')}`)
  }
  return createHash('sha256').update(`${records.join('\n')}\n`).digest('hex')
}

function materializeDetachedGitReadView(root, workspaceRoot) {
  const liveGitDirectoryResult = runClosedGit(['rev-parse', '--absolute-git-dir'], {
    cwd: root,
    timeoutMs: 10_000,
  })
  const liveCommonDirectoryResult = runClosedGit(['rev-parse', '--git-common-dir'], {
    cwd: root,
    timeoutMs: 10_000,
  })
  const liveHeadResult = runClosedGit(['rev-parse', 'HEAD'], {
    cwd: root,
    timeoutMs: 10_000,
  })
  if (liveGitDirectoryResult.error
    || liveGitDirectoryResult.signal !== null
    || liveGitDirectoryResult.status !== 0
    || liveCommonDirectoryResult.error
    || liveCommonDirectoryResult.signal !== null
    || liveCommonDirectoryResult.status !== 0
    || liveHeadResult.error
    || liveHeadResult.signal !== null
    || liveHeadResult.status !== 0) {
    throw new Error('cannot materialize detached staged Git read view')
  }
  const liveGitDirectory = resolve(liveGitDirectoryResult.stdout.trim())
  const liveCommonDirectory = resolve(root, liveCommonDirectoryResult.stdout.trim())
  const liveHead = liveHeadResult.stdout.trim()
  if (!/^[a-f0-9]{40}$/.test(liveHead)
    || !existsSync(liveGitDirectory)
    || lstatSync(liveGitDirectory).isSymbolicLink()
    || !lstatSync(liveGitDirectory).isDirectory()
    || !existsSync(liveCommonDirectory)
    || lstatSync(liveCommonDirectory).isSymbolicLink()
    || !lstatSync(liveCommonDirectory).isDirectory()) {
    throw new Error('staged Git read view authority is invalid')
  }
  const liveIndex = join(liveGitDirectory, 'index')
  // A linked worktree owns its index in the per-worktree Git directory while
  // object storage remains in the shared common Git directory.
  const liveObjects = join(liveCommonDirectory, 'objects')
  if (!existsSync(liveIndex)
    || lstatSync(liveIndex).isSymbolicLink()
    || !lstatSync(liveIndex).isFile()
    || !existsSync(liveObjects)
    || lstatSync(liveObjects).isSymbolicLink()
    || !lstatSync(liveObjects).isDirectory()
    || /[\r\n]/u.test(liveObjects)) {
    throw new Error('staged Git read view index/object authority is invalid')
  }
  const initialized = runClosedGit(['init', '--quiet'], {
    cwd: workspaceRoot,
    output: 'ignore',
    timeoutMs: 10_000,
  })
  if (initialized.error || initialized.signal !== null || initialized.status !== 0) {
    throw new Error('cannot initialize detached staged Git read view')
  }
  const stagedGitDirectory = join(workspaceRoot, '.git')
  copyFileSync(liveIndex, join(stagedGitDirectory, 'index'))
  writeFileSync(join(stagedGitDirectory, 'HEAD'), `${liveHead}\n`, { mode: 0o600 })
  const alternateDirectory = join(stagedGitDirectory, 'objects', 'info')
  mkdirSync(alternateDirectory, { recursive: true, mode: 0o700 })
  writeFileSync(join(alternateDirectory, 'alternates'), `${realpathSync(liveObjects)}\n`, { mode: 0o600 })
}

function materializeGraphWorkspace(graph, { repoRoot = ROOT, workspaceRoot } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const outputTargets = graphOutputTargets(graph)
  cpSync(root, workspaceRoot, {
    recursive: true,
    dereference: false,
    preserveTimestamps: false,
    verbatimSymlinks: true,
    filter: (source) => {
      const path = relative(root, source).split(sep).join('/')
      if (!path) return true
      const segments = path.split('/')
      if (path === '.git' || path.startsWith('.git/') || segments.includes('node_modules')) return false
      if (path === '.governance-build-graph-journal.json' || path.startsWith('.governance-build-graph-journal.json.tmp-')) return false
      // Protected-root validation and the detached Git index require the same
      // repository path topology as the live worktree, including explicitly
      // non-authority/excluded roots. Generators remain constrained by the graph
      // source declarations and every output is still removed then exact-seeded
      // by the transaction before generation.
      return !graphPathIsOutput(path, outputTargets)
    },
  })
  materializeDetachedGitReadView(root, workspaceRoot)
  const dependencyRoot = join(root, 'node_modules')
  if (existsSync(dependencyRoot)) symlinkSync(dependencyRoot, join(workspaceRoot, 'node_modules'), 'dir')
}

function assertSameGraph(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${label} resolved a different governance build graph`)
}

function run(command, label, { capture = false, repoRoot = ROOT } = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const profile = materializeClosedHookToolProfile({ repoRoot: root })
  const executableCommand = (() => {
    if (command[0] === 'node') return [profile.executables.node, ...command.slice(1)]
    if (command[0] !== 'npm') throw new Error(`${label} uses an unsupported executable:${command[0]}`)
    const packageScripts = packageScriptsAt(root)
    const resolved = commandRuntimeEntrypoint({ id: label }, command, packageScripts)
    const scriptName = command.slice(command.indexOf('run') + 1).find(token => !token.startsWith('-'))
    const scriptBody = packageScripts?.[scriptName]
    const tokens = scriptBody.trim().split(/\s+/)
    if (tokens[0] !== 'node' || tokens[1] !== resolved.entrypoint) {
      throw new Error(`${label} npm script changed after runtime closure validation`)
    }
    return [profile.executables.node, ...tokens.slice(1)]
  })()
  profile.verify()
  const result = spawnSync(executableCommand[0], executableCommand.slice(1), {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: profile.homeDirectory,
      LANG: 'C',
      LC_ALL: 'C',
      NO_COLOR: '1',
      PATH: profile.executablePath,
      TMPDIR: profile.tempDirectory,
      TZ: 'UTC',
      XDG_CONFIG_HOME: profile.homeDirectory,
    },
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    windowsHide: true,
  })
  profile.verify()
  if (result.status !== 0) throw new Error(`${label} failed (${result.status ?? result.signal ?? result.error?.message})${capture ? `\n${result.stderr || result.stdout}` : ''}`)
  return capture ? result.stdout : ''
}

let gitBoundaryVerified = false
function verifyGitBoundary() {
  if (gitBoundaryVerified) return
  assertClosedGitLocalConfiguration(ROOT)
  const topLevel = runClosedGit(['rev-parse', '--show-toplevel'], {
    cwd: ROOT,
    timeoutMs: 10_000,
  })
  if (topLevel.error || topLevel.signal !== null || topLevel.status !== 0 || topLevel.stdout.trim() !== ROOT) {
    throw new Error('governance build graph Git boundary is not the exact repository root')
  }
  gitBoundaryVerified = true
}

function gitPaths(args) {
  verifyGitBoundary()
  const result = runClosedGit(args, {
    cwd: ROOT,
    maxOutputBytes: 16 * 1024 * 1024,
    timeoutMs: 30_000,
  })
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error(`closed Git ${args[0]} failed (${result.status ?? result.signal ?? result.error?.message})`)
  }
  return result.stdout.split('\0').filter(Boolean)
}

function generateAll(graph, { repoRoot = ROOT } = {}) {
  for (const stage of graph.stages) {
    console.log(`→ governance build graph generate:${stage.id}`)
    run(stage.generate, `${stage.id} generate`, { repoRoot })
  }
}

function checkAll(graph, { repoRoot = ROOT } = {}) {
  for (const stage of graph.stages) {
    console.log(`→ governance build graph check:${stage.id}`)
    run(stage.check, `${stage.id} check`, { repoRoot })
  }
}

export function generateGovernanceBuildGraphAtomically(graph, {
  repoRoot = ROOT,
  failureInjector = null,
} = {}) {
  const root = canonicalRepositoryRoot(resolve(repoRoot))
  const outputTargets = graphOutputTargets(graph)
  let workspaceGraph = null
  return runAtomicAuthorityGenerationTransaction({
    root,
    targetPaths: outputTargets,
    seedTargetPaths: graphSeedTargets(graph),
    authorityFingerprint: () => governanceBuildGraphAuthorityFingerprint(graph, { repoRoot: root }),
    materializeWorkspace: ({ workspaceRoot }) => {
      materializeGraphWorkspace(graph, { repoRoot: root, workspaceRoot })
    },
    generateWorkspace: ({ workspaceRoot }) => {
      workspaceGraph = loadGovernanceBuildGraph({ repoRoot: workspaceRoot })
      assertSameGraph(graph, workspaceGraph, 'staged authority generation')
      generateAll(workspaceGraph, { repoRoot: workspaceRoot })
    },
    verifyWorkspace: ({ workspaceRoot }) => {
      if (!workspaceGraph) throw new Error('staged authority generation graph was not loaded')
      checkAll(workspaceGraph, { repoRoot: workspaceRoot })
    },
    verifyLive: () => {
      const liveGraph = loadGovernanceBuildGraph({ repoRoot: root })
      assertSameGraph(graph, liveGraph, 'published authority generation')
      checkAll(liveGraph, { repoRoot: root })
    },
    failureInjector,
  })
}

function stageOutputs(graph) {
  verifyGitBoundary()
  const outputs = graphOutputTargets(graph)
  const trackedOutputs = new Set(gitPaths(['ls-files', '-z', '--', ...outputs]))
  const stageableOutputs = outputs.filter((output) => (
    existsSync(join(ROOT, output))
      || [...trackedOutputs].some((path) => underGraphTarget(path, output))
  ))
  for (let offset = 0; offset < stageableOutputs.length; offset += 100) {
    const result = runClosedGit(['add', '-A', '--', ...stageableOutputs.slice(offset, offset + 100)], {
      cwd: ROOT,
      output: 'ignore',
      timeoutMs: 30_000,
    })
    if (result.error || result.signal !== null || result.status !== 0) {
      throw new Error(`stage generated governance views failed (${result.status ?? result.signal ?? result.error?.message})`)
    }
  }
}

function precommit(graph) {
  const staged = gitPaths(['diff', '--cached', '--name-only', '-z'])
  const affected = affectedStages(graph, staged)
  if (!affected.length) {
    assertAuthorityGenerationIdle({ root: ROOT })
    return
  }
  const unstaged = [
    ...gitPaths(['diff', '--name-only', '-z']),
    ...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
  ]
  const unsafe = [...new Set(unstaged.filter((path) => graph.stages.some((stage) => stageSourceMatches(stage, path))))].sort()
  if (unsafe.length) throw new Error(`provider-neutral source files are unstaged/untracked:\n${unsafe.map((path) => `  - ${path}`).join('\n')}`)
  console.log(`→ governance graph affected:${affected.map((stage) => stage.id).join(', ')}`)
  const receipt = generateGovernanceBuildGraphAtomically(graph)
  stageOutputs(graph)
  // stageOutputs adds outputs from the working tree. For symlink outputs the transaction accepted
  // as index-authoritative (this checkout could not rewrite the live link), that add clobbers the
  // correct index entry back to the stale link — the exact defect that shipped `hooks/scripts`
  // pointing at the retired mirror. Restore each such entry from its staged target.
  for (const { path, target } of receipt?.indexAuthoritativeSymlinks ?? []) {
    const blob = runClosedGit(['hash-object', '-w', '--stdin'], {
      cwd: ROOT,
      input: Buffer.from(target),
      output: 'capture',
    }).stdout.trim()
    const result = runClosedGit(['update-index', '--cacheinfo', `120000,${blob},${path}`], {
      cwd: ROOT,
      output: 'ignore',
    })
    if (result.status !== 0) throw new Error(`failed to restore index-authoritative symlink:${path}`)
    console.log(`→ staged index-authoritative symlink:${path} -> ${target}`)
  }
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (IS_MAIN) {
  try {
    if (process.argv.includes('--check') || process.argv.includes('--list-json')) {
      assertAuthorityGenerationIdle({ root: ROOT })
    }
    const graph = loadGovernanceBuildGraph()
    if (process.argv.includes('--check')) checkAll(graph)
    else if (process.argv.includes('--generate')) generateGovernanceBuildGraphAtomically(graph)
    else if (process.argv.includes('--precommit')) precommit(graph)
    else if (process.argv.includes('--recover')) {
      const recovered = recoverInterruptedAuthorityGeneration({
        root: ROOT,
        targetPaths: graphOutputTargets(graph),
      })
      console.log(recovered.recovered
        ? `✓ recovered interrupted governance build graph transaction:${recovered.transactionId}`
        : '✓ no interrupted governance build graph transaction')
    }
    else if (process.argv.includes('--list-json')) process.stdout.write(JSON.stringify(graph, null, 2) + '\n')
    else throw new Error('usage: governance-build-graph.mjs --check | --generate | --precommit | --recover | --list-json')
  } catch (error) {
    console.error(`✗ governance build graph: ${error.message}`)
    process.exit(1)
  }
}
