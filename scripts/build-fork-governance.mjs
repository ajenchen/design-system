#!/usr/bin/env node
// build-fork-governance.mjs — C-prime fork-mode governance corpus 生成器(SSOT-driven)
//
// 讀 scripts/fork-hook-classification.json → 從 provider-neutral ds-canonical SSOT 生成一套
// 「專給 consumer fork 用」的治理 corpus,輸出到 packages/design-system/ds-canonical/fork/。
// 該目錄隨 npm package ship(rides node_modules → committed exact lock install 覆蓋；不可手改)。
//
// fork 端只 commit 一個極穩定的 per-event dispatcher(讀本生成的 fork/manifest.json),
// 故 DS 未來治理增刪改 → 重生此 corpus → 發 immutable exact version；consumer 由受保護的
// exact-version upgrade PR 接收，fresh checkout 跑 `npm run setup:all`。禁止以 mutable
// dist-tag 或 SessionStart install 取代 lock/PR 邊界。
//
// 四桶處理(per classification SSOT):
//   SHIP_AS_IS     → verbatim copy
//   SHIP_REWRITTEN → override 檔優先(scripts/fork-hook-overrides/<name>),否則套 path transform
//   REPLACE        → 用 override(scripts/fork-hook-overrides/<replaceWith>)
//   DROP           → 不生成、不註冊
//
// 用法:
//   node scripts/build-fork-governance.mjs            # 生成 ds-canonical/fork/
//   node scripts/build-fork-governance.mjs --check    # 驗:(1) 全 hook 已分類(漏接=FAIL)(2) 生成物與 SSOT 無 drift

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname, relative, resolve, sep, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
// Agent Skills semantics / binding / projection 由 root adapter 與 fork adapter 共用。
import {
  buildProviderDiscoveryPolicy,
  buildSharedSkillTargets,
  materializeProductInstruction,
  materializeProviderHookConfig,
  projectMatcherForProvider,
  projectProviderNativeEvent,
  PROVIDER_REGISTRY,
  PROVIDER_SKILL_SEMANTICS,
  resolveProviderMaterializer,
  scanCanonicalSkillSemantics,
  validateProviderRegistry,
  validateProviderSkillSemantics,
} from './gen-codex-adapter.mjs'
import {
  buildAuthenticatedProviderLifecycle,
  compareUtf8Bytes,
  deriveProviderProductManagedInventory,
  repositoryPathsOverlap,
} from './lib/provider-lifecycle.mjs'
import { assertRuntimeDependencyClosureEntries } from './lib/runtime-dependency-closure.mjs'
import {
  CLAUDE_PERMISSION_POLICY_SOURCE,
  materializeClaudeGovernanceSettings,
  readClaudePermissionPolicy,
} from './lib/claude-permission-policy.mjs'
import { TRUSTED_UPGRADE_POLICY } from './verify-upgrade-provenance.mjs'
import {
  assertNoSymlinkPath,
  assertSafeTree,
  canonicalRepositoryRoot,
  CONSUMER_CONTROL_PLANE_PATHS,
  consumerControlPlaneAuthority,
  normalizeRepositoryRelative,
  pathEntryExists,
  providerSurfaceDigest,
  validateForkManifestProviderSurfaces,
} from './refresh-fork-launchers.mjs'
import { productProviderManagedTreeDeclarations } from './lib/provider-projection-contract.mjs'
import { projectProviderReviewBindings } from '../packages/governance/src/provider-review-binding.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolLockProjection,
  protocolSourceDigests,
} from '../infra/governance/lib/consumer-upgrade-protocol.mjs'
import {
  resolveInventoryOwnershipPolicy,
  resolveOwnership,
} from '../infra/governance/lib/managed-repository-ownership.mjs'
import { buildProviderHookLaunchArgv } from './lib/provider-hook-output-transport.mjs'
import {
  assertControlPlaneGenesisPreservation,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  loadControlPlaneGenesisTransition,
  readAllControlPlaneGenesisBasePreservations,
} from './lib/control-plane-genesis-transition.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CANONICAL_ROOT = join(ROOT, 'packages/design-system/ds-canonical')
const CANONICAL_DECISION_AUTHORITY_SOURCE = 'AGENTS.md'
const CANONICAL_DECISION_AUTHORITY_START = '<!-- canonical-decision-authority:start -->'
const CANONICAL_DECISION_AUTHORITY_END = '<!-- canonical-decision-authority:end -->'
const PRODUCT_DECISION_AUTHORITY_PLACEHOLDER = '<!-- canonical-decision-authority:inject -->'
const CLS_PATH = join(ROOT, 'scripts/fork-hook-classification.json')
const GOV_PATH = join(ROOT, 'scripts/fork-governance-classification.json')
const OVERRIDE_DIR = join(ROOT, 'scripts/fork-hook-overrides')
const OUT_DIR = join(ROOT, 'packages/design-system/ds-canonical/fork')
// Template paths are generated outputs. Product-role instructions, wiring and launchers are owned
// by non-generated canonical sources below; generated template files must never feed this build.
const TPL_CLAUDE = join(ROOT, 'template/ds-product-template/.claude')
const PRODUCT_WIRING_PATH = join(CANONICAL_ROOT, 'templates/product-provider-wiring.json')
const PRODUCT_WIRING_SCHEMA_PATH = join(CANONICAL_ROOT, 'templates/product-provider-wiring.schema.json')
const PRODUCT_LAUNCHER_DIR = join(CANONICAL_ROOT, 'templates/product-launchers')
const PROVIDER_LIFECYCLE_PATH = join(ROOT, 'packages/governance/canonical/provider-lifecycle.json')
const PROVIDER_LIFECYCLE_SCHEMA_PATH = join(ROOT, 'packages/governance/canonical/schemas/provider-lifecycle.schema.json')
const GOVERNANCE_CANONICAL_ORDER_SOURCE_PATH = join(ROOT, 'packages/governance/src/canonical-order.mjs')
const REVIEW_BINDING_SOURCE_PATH = join(ROOT, 'packages/governance/src/provider-review-binding.mjs')
const PROVIDER_COMPATIBILITY_PATH = join(ROOT, 'infra/governance/providers/compatibility-matrix.json')
const PROVIDER_CERTIFICATIONS_PATH = join(ROOT, 'infra/governance/providers/certifications.json')
const CONSUMER_UPGRADE_PROTOCOL_PATH = join(ROOT, 'infra/governance/consumer-upgrade-protocol.json')
const CONSUMER_UPGRADE_PROTOCOL_SCHEMA_PATH = join(ROOT, 'infra/governance/schemas/consumer-upgrade-protocol.schema.json')
const CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_PATH = join(ROOT, 'infra/governance/lib/consumer-upgrade-protocol.mjs')
const MANAGED_REPOSITORY_INVENTORY_PATH = join(ROOT, 'infra/governance/inventory/managed-repos.json')
const MANAGED_REPOSITORY_INVENTORY_SCHEMA_PATH = join(ROOT, 'infra/governance/schemas/managed-repos.schema.json')
const DS_PACKAGE_PATH = join(ROOT, 'packages/design-system/package.json')
const STORYBOOK_PACKAGE_PATH = join(ROOT, 'packages/storybook-config/package.json')
const UTILITY_REGISTRY_PATH = join(ROOT, 'packages/design-system/src/tokens/utility-registry.json')
const UTILITY_REGISTRY_SCHEMA_PATH = join(ROOT, 'packages/design-system/src/tokens/utility-registry.schema.json')
const STORY_BASELINE_REGISTRY_PATH = join(CANONICAL_ROOT, 'references/story-baseline-registry.json')
const STORY_BASELINE_REGISTRY_SCHEMA_PATH = join(CANONICAL_ROOT, 'references/story-baseline-registry.schema.json')
// 退役 mutable SessionStart bootstrap；現行相容 launcher 只做唯讀驗證與短狀態輸出。
const LAUNCHER_NAMES = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh']
const LAUNCHER_SOURCE_BY_NAME = Object.freeze({
  'approval-evidence.mjs': join(CANONICAL_ROOT, 'hooks/lib/approval-evidence.mjs'),
  'authority-decision-evidence.mjs': join(ROOT, 'packages/governance/src/authority-decision-evidence.mjs'),
  'canonical-order.mjs': GOVERNANCE_CANONICAL_ORDER_SOURCE_PATH,
  'fork-governance-dispatcher.sh': join(PRODUCT_LAUNCHER_DIR, 'fork-governance-dispatcher.sh'),
  'format-provider-hook-output.mjs': join(PRODUCT_LAUNCHER_DIR, 'format-provider-hook-output.mjs'),
  'independent-review.mjs': join(PRODUCT_LAUNCHER_DIR, 'independent-review.mjs'),
  'inject_fork_governance_preamble.sh': join(PRODUCT_LAUNCHER_DIR, 'inject_fork_governance_preamble.sh'),
  'normalize-provider-event.mjs': join(PRODUCT_LAUNCHER_DIR, 'normalize-provider-event.mjs'),
  'product-hook-dispatch-runtime.mjs': join(PRODUCT_LAUNCHER_DIR, 'product-hook-dispatch-runtime.mjs'),
  'provider-hook-normalization.mjs': join(ROOT, 'packages/governance/src/provider-hook-normalization.mjs'),
  'provider-hook-output-transport.mjs': join(ROOT, 'scripts/lib/provider-hook-output-transport.mjs'),
})
const LAUNCHER_FILES = Object.keys(LAUNCHER_SOURCE_BY_NAME).sort()

const CHECK = process.argv.includes('--check')

function genesisPreservationMap(transition) {
  if (transition.state !== CONTROL_PLANE_GENESIS_OPEN_STATE) return new Map()
  return new Map(readAllControlPlaneGenesisBasePreservations({
    root: ROOT,
    transition,
  }).map(item => [item.path, item]))
}

function assertGenesisScriptsAlias(transition) {
  const path = 'packages/design-system/scripts'
  if (transition.state !== CONTROL_PLANE_GENESIS_OPEN_STATE) {
    if (pathEntryExists(join(ROOT, path))) throw new Error(`closed Genesis transition retains stale output:${path}`)
    return
  }
  assertControlPlaneGenesisPreservation({
    root: ROOT,
    transition,
    path,
  })
}

function generateGenesisScriptsAlias(transition, materializations) {
  const path = 'packages/design-system/scripts'
  const absolute = join(ROOT, path)
  const parent = dirname(absolute)
  assertNoSymlinkPath(ROOT, parent, 'Genesis scripts alias parent', { allowMissing: false })
  if (transition.state !== CONTROL_PLANE_GENESIS_OPEN_STATE) {
    if (pathEntryExists(absolute)) rmSync(absolute, { recursive: true, force: true })
    return
  }
  const source = materializations.get(path)
  if (!source || source.kind !== 'symlink' || source.mode !== '120000') {
    throw new Error(`Genesis scripts alias is absent from the authenticated transition:${path}`)
  }
  if (pathEntryExists(absolute)) {
    const info = lstatSync(absolute)
    if (info.isSymbolicLink() && readlinkSync(absolute) === source.target) {
      assertGenesisScriptsAlias(transition)
      return
    }
    rmSync(absolute, { recursive: true, force: true })
  }
  const temporary = join(parent, `.scripts.genesis-${process.pid}`)
  if (pathEntryExists(temporary)) throw new Error('Genesis scripts alias temporary path collision')
  symlinkSync(source.target, temporary)
  try {
    renameSync(temporary, absolute)
  } finally {
    if (pathEntryExists(temporary)) rmSync(temporary, { force: true })
  }
  assertGenesisScriptsAlias(transition)
}

function assertRegularSource(path, label) {
  assertNoSymlinkPath(ROOT, path, label, { allowMissing: false })
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error(`${label} must be a single-link regular non-symlink file:${relative(ROOT, path)}`)
  }
  return path
}

export function assertCanonicalInventoryClean(registry = PROVIDER_REGISTRY, { canonicalRoot = CANONICAL_ROOT } = {}) {
  const discoveredRoots = new Set([
    ...(registry?.canonical?.reservedDiscovery?.providerRootNames || []),
    ...(registry?.canonical?.reservedDiscovery?.pluginRootNames || []),
    ...(registry?.providers || []).flatMap((provider) => [
      ...(provider?.adapter?.discovery?.providerRootNames || []),
      ...(provider?.adapter?.discovery?.pluginRootNames || []),
    ]),
  ])
  for (const name of [...discoveredRoots, 'logs', 'node_modules', 'temp', 'tmp'].sort()) {
    const path = join(canonicalRoot, name)
    if (pathEntryExists(path)) throw new Error(`canonical source inventory contains forbidden runtime/provider artifact:${relative(ROOT, path)}`)
  }
}

function commonOutputBoundary(paths) {
  const absolute = paths.map((path) => resolve(path))
  if (absolute.every((path) => path === resolve(ROOT) || path.startsWith(`${resolve(ROOT)}${sep}`))) return canonicalRepositoryRoot(ROOT)
  let cursor = dirname(absolute[0])
  while (!absolute.every((path) => path === cursor || path.startsWith(`${cursor}${sep}`))) {
    const parent = dirname(cursor)
    if (parent === cursor) throw new Error('managed outputs do not share a safe non-root boundary')
    cursor = parent
  }
  if (cursor === sep) throw new Error('managed output boundary may not be the filesystem root')
  return canonicalRepositoryRoot(cursor)
}

function assertSafeManagedTarget(boundary, target, label, { tree = false } = {}) {
  assertNoSymlinkPath(boundary, target, label)
  if (!pathEntryExists(target)) return
  const info = lstatSync(target)
  if (info.isSymbolicLink()) throw new Error(`${label} may not be a symbolic link`)
  if (tree) assertSafeTree(boundary, target, label)
  else if (!info.isFile()) throw new Error(`${label} must be a regular file`)
}

function validateProductManagedTreeSource(registry, declaration, { forbiddenOutputRoots = [] } = {}) {
  const label = `${declaration.provider}.adapter.productManagedTrees.${declaration.name}`
  if (!/^[a-z][a-z0-9-]*$/.test(declaration.name)) throw new Error(`${label} name is unsafe => ADAPTER-BLOCKED`)
  const materializer = resolveProviderMaterializer(registry, 'treeViews', declaration.materializerId, `${label}.materializerId`)
  if (
    materializer.engine !== 'closed-tree-copy-v1'
    || !materializer.transformPolicies.includes(declaration.transformPolicy)
    || declaration.transformPolicy !== 'byte-exact'
  ) throw new Error(`${label} has no supported deterministic tree materializer => ADAPTER-BLOCKED`)
  const sourceRoot = normalizeRepositoryRelative(declaration.sourceRoot, `${label}.sourceRoot`)
  const destination = normalizeRepositoryRelative(declaration.destination, `${label}.destination`)
  const source = join(ROOT, sourceRoot)
  for (const generatedRoot of [...new Set([OUT_DIR, dirname(TPL_CLAUDE), ...forbiddenOutputRoots].map((root) => resolve(root)))]) {
    const relativeToGenerated = relative(resolve(generatedRoot), resolve(source))
    if (!relativeToGenerated || (!relativeToGenerated.startsWith(`..${sep}`) && relativeToGenerated !== '..' && !isAbsolute(relativeToGenerated))) {
      throw new Error(`${label}.sourceRoot may not read a generated output:${sourceRoot} => ADAPTER-BLOCKED`)
    }
  }
  assertSafeTree(ROOT, source, `${label}.sourceRoot`, { allowMissing: false })
  if (!lstatSync(source).isDirectory()) throw new Error(`${label}.sourceRoot must be a nonempty directory => ADAPTER-BLOCKED`)
  let files = 0
  const visit = (directory) => {
    const names = readdirSync(directory).sort()
    if (!names.length) throw new Error(`${label}.sourceRoot contains an unshippable empty directory:${relative(source, directory) || '.'} => ADAPTER-BLOCKED`)
    for (const name of names) {
      const child = join(directory, name)
      const info = lstatSync(child)
      if (info.isDirectory()) visit(child)
      else if (info.isFile() && info.nlink === 1) files += 1
      else throw new Error(`${label}.sourceRoot contains an unsafe filesystem entry:${relative(source, child)} => ADAPTER-BLOCKED`)
    }
  }
  visit(source)
  if (!files) throw new Error(`${label}.sourceRoot must contain at least one regular file => ADAPTER-BLOCKED`)
  return { ...declaration, sourceRoot, destination, source }
}

assertNoSymlinkPath(ROOT, CANONICAL_ROOT, 'canonical governance source root', { allowMissing: false })
if (!lstatSync(CANONICAL_ROOT).isDirectory()) throw new Error('canonical governance source root must be a real directory')
assertSafeTree(ROOT, OVERRIDE_DIR, 'fork hook override source tree')
assertRegularSource(CLS_PATH, 'fork hook classification')
assertRegularSource(GOV_PATH, 'fork governance classification')
assertRegularSource(PRODUCT_WIRING_PATH, 'product provider wiring')
assertRegularSource(PRODUCT_WIRING_SCHEMA_PATH, 'product provider wiring schema')
assertRegularSource(PROVIDER_LIFECYCLE_PATH, 'provider lifecycle ledger')
assertRegularSource(PROVIDER_LIFECYCLE_SCHEMA_PATH, 'provider lifecycle schema')
assertRegularSource(REVIEW_BINDING_SOURCE_PATH, 'provider review binding resolver')
assertRegularSource(PROVIDER_COMPATIBILITY_PATH, 'provider compatibility matrix')
assertRegularSource(PROVIDER_CERTIFICATIONS_PATH, 'provider certification ledger')
assertRegularSource(MANAGED_REPOSITORY_INVENTORY_PATH, 'managed repository inventory')
assertRegularSource(MANAGED_REPOSITORY_INVENTORY_SCHEMA_PATH, 'managed repository inventory schema')
for (const launcher of LAUNCHER_FILES) assertRegularSource(LAUNCHER_SOURCE_BY_NAME[launcher], `canonical product launcher ${launcher}`)
assertRegularSource(join(ROOT, 'scripts/governance-check.mjs'), 'consumer governance checker source')
assertRegularSource(DS_PACKAGE_PATH, 'design-system package manifest')
assertRegularSource(STORYBOOK_PACKAGE_PATH, 'storybook-config package manifest')
assertCanonicalInventoryClean(PROVIDER_REGISTRY)

const productWiring = JSON.parse(readFileSync(PRODUCT_WIRING_PATH, 'utf8'))
const productWiringSchema = JSON.parse(readFileSync(PRODUCT_WIRING_SCHEMA_PATH, 'utf8'))
const validateProductWiring = new Ajv2020({ allErrors: true, strict: true }).compile(productWiringSchema)
if (!validateProductWiring(productWiring)) {
  throw new Error(`product provider wiring violates committed schema:${(validateProductWiring.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}
if (productWiring.settings.permissionPolicy !== CLAUDE_PERMISSION_POLICY_SOURCE) {
  throw new Error(`product provider wiring must derive Claude privileged controls from ${CLAUDE_PERMISSION_POLICY_SOURCE}`)
}
const claudePermissionPolicy = readClaudePermissionPolicy({ sourceRoot: ROOT })
const productClaudeGovernanceSettings = materializeClaudeGovernanceSettings({
  permissions: productWiring.settings.permissions,
}, claudePermissionPolicy, {
  label: 'product provider wiring governance profile',
})
const PRODUCT_LAUNCHER_DESTINATION = normalizeRepositoryRelative(productWiring.launcherDirectory, 'product launcher directory')
const PRODUCT_WIRING_EVENTS = Object.freeze(Object.keys(productWiring.hooks).sort())
const PRODUCT_HARD_GATE_FALLBACK = 'immutable-governance-check-and-protected-ci'

function extractCanonicalDecisionAuthority(sourceBody) {
  const firstStart = sourceBody.indexOf(CANONICAL_DECISION_AUTHORITY_START)
  const lastStart = sourceBody.lastIndexOf(CANONICAL_DECISION_AUTHORITY_START)
  const firstEnd = sourceBody.indexOf(CANONICAL_DECISION_AUTHORITY_END)
  const lastEnd = sourceBody.lastIndexOf(CANONICAL_DECISION_AUTHORITY_END)
  if (
    firstStart < 0
    || firstStart !== lastStart
    || firstEnd < 0
    || firstEnd !== lastEnd
    || firstEnd <= firstStart
  ) {
    throw new Error('root AGENTS.md must contain one ordered canonical Decision Authority projection block')
  }
  const end = firstEnd + CANONICAL_DECISION_AUTHORITY_END.length
  const projection = sourceBody.slice(firstStart, end)
  if (
    !projection.includes('Standing Authorization')
    || !projection.includes('Human-only boundaries')
    || !projection.includes('產品／UI／UX SSOT 真取捨')
    || !projection.includes('external writes')
  ) {
    throw new Error('root AGENTS.md canonical Decision Authority projection is incomplete')
  }
  return projection
}

function materializeProductSharedInstruction(roleBody, authorityProjection) {
  const first = roleBody.indexOf(PRODUCT_DECISION_AUTHORITY_PLACEHOLDER)
  if (first < 0 || first !== roleBody.lastIndexOf(PRODUCT_DECISION_AUTHORITY_PLACEHOLDER)) {
    throw new Error('product-role instruction must contain one canonical Decision Authority placeholder')
  }
  return Buffer.from(roleBody.replace(PRODUCT_DECISION_AUTHORITY_PLACEHOLDER, authorityProjection))
}

function buildProductNativeHookCoverage(provider) {
  const nativeHooks = provider.capabilities.nativeHooks === true && Boolean(provider.adapter.hookView)
  const supported = new Set(nativeHooks ? provider.adapter.hookView.supportedEvents : [])
  const projectedEvents = PRODUCT_WIRING_EVENTS.filter((event) => supported.has(event))
  const projectedNativeEvents = projectedEvents.map((canonicalEvent) => ({
    canonicalEvent,
    nativeEvent: projectProviderNativeEvent(provider, canonicalEvent),
  }))
  const excludedEvents = PRODUCT_WIRING_EVENTS.filter((event) => !supported.has(event)).map((event) => ({
    event,
    reasonCode: nativeHooks ? 'EVENT_NOT_SUPPORTED' : 'NATIVE_HOOK_API_UNAVAILABLE',
    authoritativeFallback: PRODUCT_HARD_GATE_FALLBACK,
  }))
  return {
    schemaVersion: 2,
    canonicalEvents: [...PRODUCT_WIRING_EVENTS],
    projectedEvents,
    projectedNativeEvents,
    excludedEvents,
  }
}
const providerLifecycleLedger = JSON.parse(readFileSync(PROVIDER_LIFECYCLE_PATH, 'utf8'))
const providerLifecycleSchema = JSON.parse(readFileSync(PROVIDER_LIFECYCLE_SCHEMA_PATH, 'utf8'))
const validateProviderLifecycleSchema = new Ajv2020({ allErrors: true, strict: true }).compile(providerLifecycleSchema)
if (!validateProviderLifecycleSchema(providerLifecycleLedger)) {
  throw new Error(`provider lifecycle ledger violates committed schema:${(validateProviderLifecycleSchema.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}
const declaredDesignSystemVersion = JSON.parse(readFileSync(DS_PACKAGE_PATH, 'utf8')).version
const declaredStorybookVersion = JSON.parse(readFileSync(STORYBOOK_PACKAGE_PATH, 'utf8')).version
for (const provider of PROVIDER_REGISTRY.providers.filter((item) => item.adapter.generate)) {
  assertRegularSource(join(ROOT, provider.adapter.productInstructionSource), `${provider.id} product instruction source`)
  if (!provider.capabilities.nativeHooks) continue
  if (!provider.adapter.hookView) throw new Error(`${provider.id}:generated native-hook product adapter requires a hookView`)
}

const MANAGED_FILE_SOURCES = {
  '.github/workflows/audit.yml': join(ROOT, 'template/ds-product-template/.github/workflows/audit.yml'),
  '.npmrc': join(ROOT, 'template/ds-product-template/.npmrc'),
  '.devcontainer/devcontainer.json': join(ROOT, 'template/ds-product-template/.devcontainer/devcontainer.json'),
  '.devcontainer/devcontainer-lock.json': join(ROOT, 'template/ds-product-template/.devcontainer/devcontainer-lock.json'),
  '.devcontainer/onboard-banner.sh': join(ROOT, 'template/ds-product-template/.devcontainer/onboard-banner.sh'),
  '.devcontainer/post-create.mjs': join(ROOT, 'template/ds-product-template/.devcontainer/post-create.mjs'),
  'governance/consumer-governance.md': join(ROOT, 'packages/design-system/ds-canonical/templates/consumer-governance.md'),
  'governance/provider-cli-toolchain.json': join(ROOT, 'infra/governance/providers/provider-cli-toolchain.json'),
  'governance/provider-cli-toolchain.package-lock.json': join(ROOT, 'infra/governance/providers/provider-cli-toolchain.package-lock.json'),
  'governance/schemas/issuer-registry.schema.json': join(ROOT, 'infra/governance/schemas/issuer-registry.schema.json'),
  'governance/schemas/visual-baseline-review-policy.schema.json': join(ROOT, 'infra/governance/schemas/visual-baseline-review-policy.schema.json'),
  'governance/trust/issuers.json': join(ROOT, 'infra/governance/trust/issuers.json'),
  'governance/visual-baseline-review-policy.json': join(ROOT, 'infra/governance/visual-baseline-review-policy.json'),
  'schemas/provider-cli-toolchain.schema.json': join(ROOT, 'infra/governance/schemas/provider-cli-toolchain.schema.json'),
  'scripts/audit-consumer-a11y.mjs': join(ROOT, 'scripts/audit-consumer-a11y.mjs'),
  'scripts/check-plugin-installed.mjs': join(ROOT, 'scripts/check-plugin-installed.mjs'),
  'scripts/consumer-source-harness.mjs': join(ROOT, 'scripts/consumer-source-harness.mjs'),
  'scripts/lint-ds-internal-imports.mjs': join(ROOT, 'scripts/lint-ds-internal-imports.mjs'),
  'scripts/lib/a11y-static-server.mjs': join(ROOT, 'scripts/lib/a11y-static-server.mjs'),
  'scripts/lib/canonical-path-containment.mjs': join(ROOT, 'scripts/lib/canonical-path-containment.mjs'),
  // The product receives the complete implementation, not the monorepo-only re-export adapter.
  'scripts/lib/closed-tool-execution.mjs': join(ROOT, 'packages/governance/src/closed-tool-execution.mjs'),
  'scripts/lib/exact-workspace-dependencies.mjs': join(ROOT, 'scripts/lib/exact-workspace-dependencies.mjs'),
  'scripts/lib/provider-lifecycle.mjs': join(ROOT, 'scripts/lib/provider-lifecycle.mjs'),
  'scripts/lib/governance-dependency-bootstrap.mjs': join(ROOT, 'scripts/lib/governance-dependency-bootstrap.mjs'),
  'scripts/lib/verified-exact-npm-runtime.mjs': join(ROOT, 'scripts/lib/verified-exact-npm-runtime.mjs'),
  'scripts/lib/worktree-fingerprint.mjs': join(ROOT, 'scripts/lib/worktree-fingerprint.mjs'),
  'scripts/lib/workspace-post-create.mjs': join(ROOT, 'scripts/lib/workspace-post-create.mjs'),
  'scripts/product-template-scaffold-lock.mjs': join(ROOT, 'scripts/product-template-scaffold-lock.mjs'),
  'scripts/refresh-fork-launchers.mjs': join(ROOT, 'scripts/refresh-fork-launchers.mjs'),
  'scripts/release-bom-contract.mjs': join(ROOT, 'scripts/release-bom-contract.mjs'),
  'scripts/schemas/product-template-scaffold-lock.schema.json': join(ROOT, 'scripts/schemas/product-template-scaffold-lock.schema.json'),
  'scripts/schemas/release-bom.schema.json': join(ROOT, 'scripts/schemas/release-bom.schema.json'),
  'scripts/schemas/upgrade-evidence-receipt.schema.json': join(ROOT, 'scripts/schemas/upgrade-evidence-receipt.schema.json'),
  'scripts/setup-governance.mjs': join(ROOT, 'scripts/setup-governance.mjs'),
  'scripts/setup-provider-cli-toolchain.mjs': join(ROOT, 'scripts/setup-provider-cli-toolchain.mjs'),
  'scripts/setup-workspace.mjs': join(ROOT, 'scripts/setup-workspace.mjs'),
  'scripts/workflow-static-validation.mjs': join(ROOT, 'scripts/workflow-static-validation.mjs'),
  'scripts/sync-exact-workspace-dependencies.mjs': join(ROOT, 'scripts/sync-exact-workspace-dependencies.mjs'),
  'scripts/sync-all.mjs': join(ROOT, 'scripts/sync-all.mjs'),
  'scripts/lib/consumer-control-plane-policy.mjs': join(ROOT, 'scripts/lib/consumer-control-plane-policy.mjs'),
  'scripts/verify-consumer-css-entry.mjs': join(ROOT, 'scripts/verify-consumer-css-entry.mjs'),
  'scripts/verify-upgrade-evidence.mjs': join(ROOT, 'scripts/verify-upgrade-evidence.mjs'),
  'scripts/verify-upgrade-provenance.mjs': join(ROOT, 'scripts/verify-upgrade-provenance.mjs'),
}
// Template schema projections are generated views just like template/governance. Keep their
// materialization and `--check` inventory on one path SSOT so a newly delivered schema cannot be
// written by the builder but silently omitted from drift detection.
const TEMPLATE_SCHEMA_PROJECTIONS = Object.freeze([
  'schemas/provider-cli-toolchain.schema.json',
])
const TEMPLATE_GOVERNANCE_PROJECTIONS = Object.freeze([
  'governance/consumer-governance.md',
  'governance/provider-cli-toolchain.json',
  'governance/provider-cli-toolchain.package-lock.json',
  'governance/schemas/issuer-registry.schema.json',
  'governance/schemas/visual-baseline-review-policy.schema.json',
  'governance/trust/issuers.json',
  'governance/visual-baseline-review-policy.json',
])
for (const [destination, source] of Object.entries(MANAGED_FILE_SOURCES)) assertRegularSource(source, `consumer managed source ${destination}`)
const managedRepositoryInventory = JSON.parse(readFileSync(MANAGED_REPOSITORY_INVENTORY_PATH, 'utf8'))
const managedRepositoryInventorySchema = JSON.parse(readFileSync(MANAGED_REPOSITORY_INVENTORY_SCHEMA_PATH, 'utf8'))
const validateManagedRepositoryInventory = new Ajv2020({ allErrors: true, strict: true }).compile(managedRepositoryInventorySchema)
if (!validateManagedRepositoryInventory(managedRepositoryInventory)) {
  throw new Error(`managed repository inventory violates committed schema:${(validateManagedRepositoryInventory.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}
const productConsumerOwnershipPolicy = resolveInventoryOwnershipPolicy(managedRepositoryInventory, 'product-consumer')
for (const destination of Object.keys(MANAGED_FILE_SOURCES).sort()) {
  const ownership = resolveOwnership(productConsumerOwnershipPolicy, destination)
  if (
    ownership.pattern === '<default>'
    || !['generated', 'upstream-managed', 'three-way'].includes(ownership.mode)
  ) {
    throw new Error(`consumer managed delivery ownership is not explicitly closed:${destination}:${ownership.pattern}:${ownership.mode}`)
  }
}
assertRegularSource(UTILITY_REGISTRY_PATH, 'canonical consumer utility registry')
assertRegularSource(UTILITY_REGISTRY_SCHEMA_PATH, 'canonical consumer utility registry schema')
assertRegularSource(STORY_BASELINE_REGISTRY_PATH, 'canonical consumer story baseline registry')
assertRegularSource(STORY_BASELINE_REGISTRY_SCHEMA_PATH, 'canonical consumer story baseline registry schema')
const utilityRegistry = JSON.parse(readFileSync(UTILITY_REGISTRY_PATH, 'utf8'))
const utilityRegistrySchema = JSON.parse(readFileSync(UTILITY_REGISTRY_SCHEMA_PATH, 'utf8'))
const storyBaselineRegistry = JSON.parse(readFileSync(STORY_BASELINE_REGISTRY_PATH, 'utf8'))
const storyBaselineRegistrySchema = JSON.parse(readFileSync(STORY_BASELINE_REGISTRY_SCHEMA_PATH, 'utf8'))
const registryAjv = new Ajv2020({ allErrors: true, strict: true })
const validateUtilityRegistry = registryAjv.compile(utilityRegistrySchema)
if (!validateUtilityRegistry(utilityRegistry)) {
  throw new Error(`canonical utility registry violates committed schema:${(validateUtilityRegistry.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}
const validateStoryBaselineRegistry = registryAjv.compile(storyBaselineRegistrySchema)
if (!validateStoryBaselineRegistry(storyBaselineRegistry)) {
  throw new Error(`canonical story baseline registry violates committed schema:${(validateStoryBaselineRegistry.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
}
const resolveRegistryPointer = (document, pointer, label) => {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.includes('~')) {
    throw new Error(`${label} must use one simple absolute JSON pointer`)
  }
  let value = document
  for (const segment of pointer.slice(1).split('/')) {
    if (!segment || !value || typeof value !== 'object' || !Object.hasOwn(value, segment)) {
      throw new Error(`${label} does not resolve:${pointer}`)
    }
    value = value[segment]
  }
  return value
}
const expectedBlockTokenPointers = new Set([
  '/typography/block/size_raw',
  '/typography/block/weight_raw',
  '/typography/block/tracking_raw',
  '/radius/block/out_of_range',
  '/radius/block/ambiguous_default',
  '/radius/block/arbitrary_value',
  '/opacity/block/numeric_tier',
  '/elevation/block/tailwind_size',
  '/shadcn_alias/block/color_alias',
  '/primitive_color_as_utility/block/primitive_class',
])
const expectedWarnTokenPointers = new Set([
  '/spacing/warn/micro_gap',
  '/sizing/warn/fraction',
])
const registryRuleIds = new Set()
for (const [level, expectedPointers] of [
  ['block', expectedBlockTokenPointers],
  ['warn', expectedWarnTokenPointers],
]) {
  const rules = utilityRegistry.enforcement[level]
  const actualPointers = new Set()
  for (const rule of rules) {
    if (registryRuleIds.has(rule.id)) throw new Error(`canonical utility enforcement rule id is duplicated:${rule.id}`)
    registryRuleIds.add(rule.id)
    if (rule.tokenListPointer) {
      if (actualPointers.has(rule.tokenListPointer)) {
        throw new Error(`canonical utility ${level} token list is consumed more than once:${rule.tokenListPointer}`)
      }
      actualPointers.add(rule.tokenListPointer)
      const tokens = resolveRegistryPointer(utilityRegistry, rule.tokenListPointer, `utility enforcement ${rule.id}.tokenListPointer`)
      if (!Array.isArray(tokens) || !tokens.length || new Set(tokens).size !== tokens.length) {
        throw new Error(`canonical utility enforcement token list must be non-empty and unique:${rule.tokenListPointer}`)
      }
    }
    if (rule.excludeTokenListPointer) {
      const exclusions = resolveRegistryPointer(utilityRegistry, rule.excludeTokenListPointer, `utility enforcement ${rule.id}.excludeTokenListPointer`)
      if (!Array.isArray(exclusions) || !exclusions.length || new Set(exclusions).size !== exclusions.length) {
        throw new Error(`canonical utility enforcement exclusion list must be non-empty and unique:${rule.excludeTokenListPointer}`)
      }
    }
    if (rule.pattern) {
      try { new RegExp(rule.pattern, 'gu') } catch (error) {
        throw new Error(`canonical utility enforcement pattern cannot compile:${rule.id}:${error.message}`)
      }
    }
  }
  if (
    actualPointers.size !== expectedPointers.size
    || [...expectedPointers].some((pointer) => !actualPointers.has(pointer))
  ) {
    throw new Error(`canonical utility ${level} token lists are not in exact behavioral closure`)
  }
}
const storyPatternIds = new Set()
for (const [component, contract] of Object.entries(storyBaselineRegistry.components)) {
  for (const pattern of contract.antiPatterns) {
    if (storyPatternIds.has(pattern.id)) throw new Error(`canonical story anti-pattern id is duplicated:${pattern.id}`)
    storyPatternIds.add(pattern.id)
    if (!pattern.regex.trim() || (pattern.unlessRegex !== undefined && !pattern.unlessRegex.trim())) {
      throw new Error(`canonical story anti-pattern is empty:${component}:${pattern.id}`)
    }
  }
}
const consumerRuntimeDelivery = new Map(
  Object.entries(MANAGED_FILE_SOURCES).map(([destination, source]) => [destination, readFileSync(source)]),
)
consumerRuntimeDelivery.set('scripts/governance-check.mjs', readFileSync(join(ROOT, 'scripts/governance-check.mjs')))
for (const launcher of LAUNCHER_FILES) {
  consumerRuntimeDelivery.set(`${PRODUCT_LAUNCHER_DESTINATION}/${launcher}`, readFileSync(LAUNCHER_SOURCE_BY_NAME[launcher]))
}
assertRuntimeDependencyClosureEntries(consumerRuntimeDelivery, {
  label: 'fork authenticated consumer runtime delivery',
})

function snapshotTree(root) {
  const entries = new Map()
  // Git 只保存 100644/100755/120000 三種 mode——寫入時的 read-only(444)位在任何
  // fresh clone 都會還原成 umask 結果(644),因此 mode 比對只能取「git 可傳輸語意」
  // = executable bit;比對完整 0o777 會讓本 gate 在所有全新 checkout 上永遠不可滿足
  // (2026-07-28 CI 錨例:fork/common/closed-tool-execution.mjs mode 644 != 444)。
  const gitMode = (mode) => ((mode & 0o111) !== 0 ? 0o755 : 0o644)
  const walk = (absolute, rel = '') => {
    if (!existsSync(absolute)) return
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      entries.set(rel || '.', { kind: 'symlink', target: readlinkSync(absolute), mode: gitMode(stat.mode) })
      return
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) walk(join(absolute, name), rel ? `${rel}/${name}` : name)
      return
    }
    if (!stat.isFile()) {
      entries.set(rel || '.', { kind: 'unsupported', mode: gitMode(stat.mode) })
      return
    }
    entries.set(rel, {
      kind: 'file',
      mode: gitMode(stat.mode),
      sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
    })
  }
  walk(root)
  return entries
}

function compareTrees(label, actualRoot, expectedRoot) {
  const actual = snapshotTree(actualRoot)
  const expected = snapshotTree(expectedRoot)
  const names = [...new Set([...actual.keys(), ...expected.keys()])].sort()
  const drift = []
  for (const name of names) {
    const path = name ? `${label}/${name}` : label
    if (!actual.has(name)) drift.push(`${path}: missing`)
    else if (!expected.has(name)) drift.push(`${path}: extra`)
    else if (actual.get(name).kind !== expected.get(name).kind) drift.push(`${path}: unsafe-kind ${actual.get(name).kind} != ${expected.get(name).kind}`)
    else if (actual.get(name).kind === 'symlink') drift.push(`${path}: symlink forbidden -> ${actual.get(name).target}`)
    else if (actual.get(name).kind !== 'file') drift.push(`${path}: unsupported filesystem entry`)
    else if (actual.get(name).sha256 !== expected.get(name).sha256) drift.push(`${path}: content`)
    else if (actual.get(name).mode !== expected.get(name).mode) drift.push(`${path}: mode ${actual.get(name).mode.toString(8)} != ${expected.get(name).mode.toString(8)}`)
  }
  return drift
}

const cls = JSON.parse(readFileSync(CLS_PATH, 'utf8'))
const gov = JSON.parse(readFileSync(GOV_PATH, 'utf8'))
// ── classification helpers(items 支援 name 字串 或 names 陣列)──
function classifiedNames(home, buckets) {
  const items = (gov.homes[home] && gov.homes[home].items) || []
  const out = []
  for (const it of items) {
    if (buckets && !buckets.includes(it.bucket)) continue
    const names = it.names || (it.name != null ? [it.name] : [])
    out.push(...names)
  }
  return out
}

function resolveCanonicalBuildSources(registry) {
  const roots = Object.fromEntries(Object.entries(registry.canonical.roots).map(([name, path]) => {
    const relativePath = normalizeRepositoryRelative(path, `canonical.roots.${name}`)
    const absolute = join(ROOT, relativePath)
    assertSafeTree(ROOT, absolute, `canonical.roots.${name}`, { allowMissing: false })
    if (!lstatSync(absolute).isDirectory()) throw new Error(`canonical.roots.${name} must be a real directory:${relativePath}`)
    return [name, { relative: relativePath, absolute }]
  }))
  const hookRegistrationsRelative = normalizeRepositoryRelative(registry.canonical.hookRegistrations, 'canonical.hookRegistrations')
  const hookRegistrationsPath = assertRegularSource(join(ROOT, hookRegistrationsRelative), 'canonical hook registrations')
  const legacyDiscoveryCategories = registry.canonical.compatibilityProjections.legacyClaudeInstruction.discoveryCategories.map((category) => ({
    ...category,
    sourceRoot: normalizeRepositoryRelative(category.sourceRoot, `compatibility category ${category.name}.sourceRoot`),
    artifactRoot: normalizeRepositoryRelative(category.artifactRoot, `compatibility category ${category.name}.artifactRoot`),
    destinationRoot: normalizeRepositoryRelative(category.destinationRoot, `compatibility category ${category.name}.destinationRoot`),
  }))
  return {
    roots,
    hooksDir: roots.hooks.absolute,
    rulesDir: roots.rules.absolute,
    referencesDir: roots.references.absolute,
    committedCategories: [
      { home: 'skills', dir: roots.skills.absolute, kind: 'dir' },
      { home: 'commands', dir: roots.commands.absolute, kind: 'file' },
    ],
    providerOnlyCategories: [{ home: 'agents', dir: roots.contextForkAgents.absolute, kind: 'file' }],
    legacyDiscoveryCategories,
    hookRegistrations: JSON.parse(readFileSync(hookRegistrationsPath, 'utf8')),
  }
}

function validateCanonicalClassifications({ hooksDir, committedCategories, providerOnlyCategories, hookRegistrations }) {
  const realHooks = readdirSync(hooksDir).filter((file) => file.endsWith('.sh') || file.endsWith('.py'))
  const classified = new Set(['SHIP_AS_IS', 'SHIP_REWRITTEN', 'REPLACE', 'DROP'].flatMap((bucket) => cls[bucket].map((entry) => entry.hook)))
  const unclassified = realHooks.filter((hook) => !classified.has(hook))
  if (unclassified.length) throw new Error(`FORK-GOVERNANCE COVERAGE FAIL:unclassified hooks:${unclassified.join(',')}`)
  const ghost = [...classified].filter((hook) => !realHooks.includes(hook))
  if (ghost.length) throw new Error(`FORK-GOVERNANCE GHOST FAIL:classified hooks missing from canonical.roots.hooks:${ghost.join(',')}`)

  for (const { home, dir, kind } of committedCategories) {
    const actual = readdirSync(dir).filter((file) => kind === 'dir' ? statSync(join(dir, file)).isDirectory() : (file.endsWith('.md') && file !== 'README.md'))
    const allClassified = new Set(classifiedNames(home))
    const missing = actual.filter((name) => !allClassified.has(name))
    const stale = [...allClassified].filter((name) => name !== 'README.md' && !actual.includes(name))
    if (missing.length || stale.length) throw new Error(`FORK-GOVERNANCE COVERAGE FAIL(${home}):unclassified=${missing.join(',') || '<none>'};stale=${stale.join(',') || '<none>'}`)
  }
  for (const { home, dir, kind } of providerOnlyCategories) {
    const actual = readdirSync(dir).filter((name) => kind === 'dir' ? statSync(join(dir, name)).isDirectory() : name.endsWith('.md'))
    const items = (gov.homes[home]?.items || []).flatMap((item) => (item.names || (item.name ? [item.name] : [])).map((name) => ({ name, bucket: item.bucket })))
    const classifiedByName = new Map(items.map((item) => [item.name, item.bucket]))
    const missing = actual.filter((name) => !classifiedByName.has(name))
    const nonDrop = items.filter((item) => item.bucket !== 'DROP')
    const stale = items.filter((item) => !actual.includes(item.name))
    if (missing.length || nonDrop.length || stale.length) throw new Error(`FORK-GOVERNANCE PROVIDER-ONLY CLASSIFICATION FAIL(${home}):provider adapter entries must be explicit DROP and exact`)
  }
  return (hookName) => {
    const contracts = []
    for (const [event, groups] of Object.entries(hookRegistrations.hooks || {})) for (const group of groups) for (const descriptor of group.hooks || []) {
      if (descriptor.hook !== hookName && !(descriptor.command || '').includes(hookName)) continue
      const runtime = descriptor.runtime
      const outputMode = descriptor.outputMode || 'diagnostic'
      const inputContract = descriptor.inputContract || 'event-v1'
      const matcher = typeof group.matcher === 'string' ? group.matcher : ''
      const transcriptRequirement = descriptor.transcript || 'none'
      if (!['bash', 'python3'].includes(runtime)) {
        throw new Error(`fork hook runtime contract is unsupported:${event}:${hookName}:${runtime || '<missing>'}`)
      }
      if (!['diagnostic', 'blocking', 'governance-context', 'governance-decision', 'governance-context-or-block'].includes(outputMode)) {
        throw new Error(`fork hook output contract is unsupported:${event}:${hookName}:${outputMode}`)
      }
      if (!['event-v1', 'proposed-text-v1'].includes(inputContract)) {
        throw new Error(`fork hook input contract is unsupported:${event}:${hookName}:${inputContract}`)
      }
      if (!['none', 'optional', 'stable-required'].includes(transcriptRequirement)) {
        throw new Error(`fork hook transcript contract is unsupported:${event}:${hookName}:${transcriptRequirement}`)
      }
      contracts.push({ event, matcher, runtime, outputMode, inputContract, transcriptRequirement })
    }
    return contracts
  }
}

// ── SHIP_REWRITTEN 的 path transform(simple 機械改寫;複雜者用 override 檔)──
function applyTransform(content) {
  return content
    // Fork hooks run from a runner-authenticated private corpus snapshot. Runtime policy data must
    // therefore resolve inside that snapshot, not through the consumer's mutable node_modules tree.
    .replaceAll(
      '$CORPUS_ROOT/packages/design-system/src/tokens/utility-registry.json',
      '$CORPUS_ROOT/references/utility-registry.json',
    )
    // DS src spec/story/token 路徑 → node_modules(fork 佈局)
    .replace(/packages\/design-system\/src/g, 'node_modules/@qijenchen/design-system/src')
    .replace(/\.\.\/\.\.\/packages\/design-system\/src/g, 'node_modules/@qijenchen/design-system/src')
}

// fork skill 自動加註(2026-06-18 beta.74 adversarial-audit 補):fork-shipped skill 若引用 DS-author 機械工具
// (`scripts/*.mjs` 或非 fork-template 的 `npm run <audit>`),fork 套件未隨附那些 executor(Claude Code 不掃
// node_modules + 那些 script 有 DS-author dep / 路徑假設,不適合 ship)→ 自動在 frontmatter 後 prepend 誠實註記,
// 避免 fork user 照 skill 跑到 ERR_MODULE_NOT_FOUND。build 一律加 = recurrence-proof(未來新 skill 自動涵蓋)。
const FORK_TPL_PACKAGE_PATH = assertRegularSource(join(ROOT, 'template/ds-product-template/package.json'), 'product template package manifest')
const FORK_TPL_PACKAGE = JSON.parse(readFileSync(FORK_TPL_PACKAGE_PATH, 'utf8'))
const FORK_TPL_NPM = new Set(Object.keys(FORK_TPL_PACKAGE.scripts || {}))
const FORK_SKILL_NOTE = '> **Product-role projection(build 自動)**:本 skill 的執行步驟已只保留本 product repo 實際存在的指令。DS-author-only executor 會被改寫為 browser/manual/product-CI 等價驗證,不得在 product 中嘗試不存在的腳本。\n'
const FORK_SCRIPT_FILES = new Set([
  'create-app.mjs', 'setup-netlify-access.mjs', 'check-plugin-installed.mjs',
  'audit-consumer-a11y.mjs', 'deploy-url.mjs', 'lint-ds-internal-imports.mjs',
  'setup-governance.mjs', 'setup-provider-cli-toolchain.mjs', 'setup-workspace.mjs', 'workflow-static-validation.mjs', 'sync-exact-workspace-dependencies.mjs', 'sync-all.mjs', 'refresh-fork-launchers.mjs', 'governance-check.mjs',
  'verify-consumer-css-entry.mjs', 'verify-upgrade-evidence.mjs', 'verify-upgrade-provenance.mjs', 'release-bom-contract.mjs',
  'product-template-scaffold-lock.mjs',
])
const FORK_HOOK_FILE_PATTERN = '[a-z0-9_*<>.-]+\\.sh'
const FORK_HOOK_ROOT_PATTERN = '(?:node_modules\\/@qijenchen\\/design-system\\/ds-canonical\\/hooks\\/|packages\\/design-system\\/ds-canonical\\/hooks\\/|\\.claude\\/hooks\\/)'
const FORK_HOOK_SUBDIR_PATTERN = '(?:(?:retired(?:\\/[a-z0-9_.-]+)*|lib)\\/)?'
const FORK_HOOK_PATH_PATTERN = `${FORK_HOOK_ROOT_PATTERN}${FORK_HOOK_SUBDIR_PATTERN}${FORK_HOOK_FILE_PATTERN}`
const FORK_LOCAL_HOOK_PATH_PATTERN = `lib\\/${FORK_HOOK_FILE_PATTERN}`
const FORK_HOOK_TOKEN_PATTERN = new RegExp(
  '`(?:' + FORK_HOOK_PATH_PATTERN + '|' + FORK_LOCAL_HOOK_PATH_PATTERN + '|' + FORK_HOOK_FILE_PATTERN + ')`'
    + '|(?<![A-Za-z0-9@._/-])(?:' + FORK_HOOK_PATH_PATTERN + '|' + FORK_LOCAL_HOOK_PATH_PATTERN + ')(?![A-Za-z0-9.-])',
  'gi',
)
const FORK_HOOK_DIRECTORY_PATTERN = new RegExp(
  '`(?:' + FORK_HOOK_ROOT_PATTERN + '(?:(?:retired(?:\\/[a-z0-9_.-]+)*|lib)\\/)?|hooks\\/retired\\/)`'
    + '|(?<![A-Za-z0-9@._/-])' + FORK_HOOK_ROOT_PATTERN + '(?:(?:retired(?:\\/[a-z0-9_.-]+)*|lib)\\/)?(?=$|[\\s),;:，。；：—])',
  'gi',
)

function markdownFence(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  return match ? { marker: match[1][0], length: match[1].length } : null
}

export function validateProductRoleSkillMarkdown(content) {
  const failures = []
  let fence = null
  let inlineTicks = null

  for (const line of content.split('\n')) {
    const candidateFence = inlineTicks == null ? markdownFence(line) : null
    if (fence) {
      if (candidateFence && candidateFence.marker === fence.marker && candidateFence.length >= fence.length) fence = null
      continue
    }
    if (candidateFence) {
      fence = candidateFence
      continue
    }

    for (let index = 0; index < line.length;) {
      if (line[index] !== '`') {
        index += 1
        continue
      }
      let slashCount = 0
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) slashCount += 1
      let end = index + 1
      while (line[end] === '`') end += 1
      if (slashCount % 2 === 0) {
        const length = end - index
        if (inlineTicks == null) inlineTicks = length
        else if (inlineTicks === length) inlineTicks = null
      }
      index = end
    }
  }

  if (inlineTicks != null) failures.push(`unbalanced inline-code delimiter:${inlineTicks} backtick(s)`)
  if (fence) failures.push(`unclosed fenced-code delimiter:${fence.marker.repeat(fence.length)}`)

  for (const [label, pattern] of [
    ['residual canonical hook prefix', /(?:node_modules\/@qijenchen\/design-system\/ds-canonical\/hooks\/|packages\/design-system\/ds-canonical\/hooks\/|\.claude\/hooks\/)/i],
    ['residual canonical hook directory', /`hooks\/retired\/`/i],
    ['residual canonical hook file', /(?:^|[^A-Za-z0-9@._/-])lib\/[a-z0-9_*<>.-]+\.sh(?![A-Za-z0-9.-])/i],
    ['malformed hook pseudo-path', /(?:ds-canonical\/hooks\/|\.claude\/hooks\/|lib\/)the installed immutable governance checker/i],
    ['DS-author release command', /(?:npm publish|release:preflight|scripts\/codex-run-guarded\.mjs|sync-governance-counters\.mjs)/i],
  ]) if (pattern.test(content)) failures.push(label)

  return failures
}

export function annotateForkSkill(content) {
  let changed = false
  content = content.replace(/(?:node\s+)?scripts\/([a-z0-9_-]+\.mjs)(?:\s+[^\n`]*)?/g, (whole, file) => {
    if (FORK_SCRIPT_FILES.has(file)) return whole
    changed = true
    if (file === 'visual-audit.mjs' || file === 'scan-asymmetric-icons.mjs') return 'use the active browser/Storybook screenshot workflow and preserve visual evidence'
    if (file === 'code-quality-audit.mjs') return 'npm run typecheck && npm run build && npm run governance:check'
    if (file === 'gen-ds-story-manifest.mjs') return 'inspect the installed package public exports and shipped stories'
    if (file === 'audit-orphan-tokens.mjs') return 'search product token usage and compare it with the installed token documentation'
    return `perform the equivalent check described in the common product instruction (${file} is DS-author-only)`
  })
  content = content.replace(/npm run ([\w:-]+)([^\n`]*)/g, (whole, command) => {
    if (FORK_TPL_NPM.has(command)) return whole
    changed = true
    if (command === 'visual-audit' || command === 'icons:scan') return 'use the active browser/Storybook screenshot workflow and preserve visual evidence'
    if (command === 'hooks:test') return 'npm run governance:check'
    if (command === 'build:lib' || command === 'check:bundle-size') return 'npm run build'
    if (command === 'release:preflight') return 'npm run governance:check and rely on protected product CI'
    return `run the product-specific ${command} check only when package.json defines it`
  })
  content = content.replace(/scripts\/visual-assertions\.json/g, () => {
    changed = true
    return 'the product visual acceptance criteria'
  })
  content = content.replace(/npm run governance:check:\d+(?:-\d+)?/g, () => {
    changed = true
    return 'npm run governance:check'
  })
  // Rewrite a complete canonical hook token, including paired inline-code delimiters. Never match
  // a filename suffix inside a longer path/hostname:partial replacement previously produced both
  // `.../hooks/the installed ...` pseudo-paths and unmatched backticks, while `polaris.shopify.com`
  // was corruptible when the filename prefix was optional.
  content = content.replace(FORK_HOOK_TOKEN_PATTERN, () => {
    changed = true
    return 'the installed immutable governance checker'
  })
  content = content.replace(FORK_HOOK_DIRECTORY_PATTERN, () => {
    changed = true
    return 'the installed immutable governance checker history'
  })
  content = content.replace(/`?scripts\/[a-z0-9_*<>.-]+\.mjs`?/gi, () => {
    changed = true
    return 'the product-specific verification workflow (when configured)'
  })
  content = content.replace(/`?packages\/design-system\/bundle-budget\.json`?/g, () => {
    changed = true
    return 'the product build/bundle budget configuration'
  })
  content = content.replace(/release-preflight/g, () => {
    changed = true
    return 'governance check and protected product CI'
  })
  if (!changed) return content
  const fm = content.match(/^---\n[\s\S]*?\n---\n/)
  return fm ? fm[0] + '\n' + FORK_SKILL_NOTE + content.slice(fm[0].length) : FORK_SKILL_NOTE + content
}

function assertConsumerRoleSurface(templateRoot, corpusRoot, manifest) {
  const failures = []
  const generatedSurfaces = Object.entries(manifest?.providerSurfaces || {})
    .filter(([, surface]) => surface?.generated)
  if (!generatedSurfaces.length) failures.push('manifest has no generated product provider surface')

  for (const [providerId, surface] of generatedSurfaces) {
    const instruction = join(templateRoot, surface.instructionDestination || '')
    if (!surface.instructionDestination || !existsSync(instruction) || !lstatSync(instruction).isFile()) {
      failures.push(`${providerId} product instruction is missing`)
      continue
    }
    const body = readFileSync(instruction, 'utf8')
    for (const pattern of [
      /release:preflight/, /npm publish/, /scripts\/codex-run-guarded\.mjs/,
      /sync-governance-counters\.mjs/, /check_file_size_budget\.sh/,
    ]) if (pattern.test(body)) failures.push(`${surface.instructionDestination} DS-author leakage: ${pattern}`)
    if (surface.hookDestination) {
      const hook = join(templateRoot, surface.hookDestination)
      if (!existsSync(hook) || !lstatSync(hook).isFile()) failures.push(`${providerId} product hook view is missing`)
    }
    for (const tree of surface.trees || []) {
      const destination = join(templateRoot, tree.destination || '')
      const artifact = join(corpusRoot, tree.artifactRoot || '')
      if (!tree.destination || !tree.artifactRoot || !existsSync(destination) || !lstatSync(destination).isDirectory()) {
        failures.push(`${providerId} product managed tree is missing:${tree.destination || '<missing>'}`)
        continue
      }
      for (const drift of compareTrees(`${providerId}:${tree.destination}`, destination, artifact)) failures.push(`managed tree is not byte-exact:${drift}`)
    }
  }

  // `--check` intentionally generates only managed outputs in an isolated temp tree. The canonical
  // product script surface was already read from the real template into FORK_TPL_NPM above; do not
  // make the pure checker depend on an unrelated package.json copy in its temp output.
  const scripts = FORK_TPL_NPM
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const body = readFileSync(path, 'utf8')
        const rel = relative(templateRoot, path)
        for (const violation of validateProductRoleSkillMarkdown(body)) failures.push(`${rel} ${violation}`)
        if (/the installed immutable governance checker[A-Za-z0-9]/.test(body)) {
          failures.push(`${rel} hook rewrite corrupted adjacent prose or a hostname`)
        }
        for (const match of body.matchAll(/npm run ([\w:-]+)/g)) if (!scripts.has(match[1])) failures.push(`${rel} missing npm script: ${match[1]}`)
        for (const pattern of [/scripts\/[a-z0-9_*<>.-]+\.mjs/i, /(?:\.claude\/hooks\/(?:retired\/)?|lib\/)[a-z0-9_*<>.-]+\.sh/i]) {
          if (pattern.test(body)) failures.push(`${rel} unresolved DS-author executable pointer: ${pattern}`)
        }
      }
    }
  }
  for (const [providerId, surface] of generatedSurfaces) {
    if (!surface.skillDestination) {
      failures.push(`${providerId} has no product skill destination`)
      continue
    }
    walk(join(templateRoot, surface.skillDestination))
  }
  if (failures.length) throw new Error(`consumer role projection is not executable:\n${failures.join('\n')}`)
}

// ── 生成 ──
export function buildCorpus({
  outDir = OUT_DIR,
  templateRoot = dirname(TPL_CLAUDE),
  providerRegistry = PROVIDER_REGISTRY,
  providerSkillSemantics = PROVIDER_SKILL_SEMANTICS,
  providerLifecycle = providerLifecycleLedger,
  providerCompatibility = JSON.parse(readFileSync(PROVIDER_COMPATIBILITY_PATH, 'utf8')),
  providerCertifications = JSON.parse(readFileSync(PROVIDER_CERTIFICATIONS_PATH, 'utf8')),
  releaseVersion = declaredDesignSystemVersion,
} = {}) {
  const genesisTransition = loadControlPlaneGenesisTransition({ root: ROOT })
  const genesisMaterializations = genesisPreservationMap(genesisTransition)
  validateProviderRegistry(providerRegistry)
  assertCanonicalInventoryClean(providerRegistry)
  validateProviderSkillSemantics(providerSkillSemantics)
  const canonicalSources = resolveCanonicalBuildSources(providerRegistry)
  const runtimeContractsOf = validateCanonicalClassifications(canonicalSources)
  const rewriteForkInstalledPointers = (content) => {
    const installRoots = Object.fromEntries(['commands', 'references', 'rules', 'skills'].map((name) => [
      name,
      `node_modules/@qijenchen/design-system/${relative(join(ROOT, 'packages/design-system'), canonicalSources.roots[name].absolute).split(sep).join('/')}`,
    ]))
    return applyTransform(content)
      .replace(/packages\/design-system\/ds-canonical\//g, 'node_modules/@qijenchen/design-system/ds-canonical/')
      .replace(/\.claude\/(rules|references|skills|commands)\//g, (_, name) => `${installRoots[name]}/`)
  }
  if (!validateProviderLifecycleSchema(providerLifecycle)) {
    throw new Error(`provider lifecycle ledger violates committed schema:${(validateProviderLifecycleSchema.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
  }
  const authenticatedProviderLifecycle = buildAuthenticatedProviderLifecycle({
    ledger: providerLifecycle,
    registry: providerRegistry,
    releaseVersion,
  })
  const managedProviderInventory = new Map(
    deriveProviderProductManagedInventory(providerRegistry).map((provider) => [provider.id, provider.surfaces]),
  )
  const productManagedTrees = productProviderManagedTreeDeclarations(providerRegistry)
    .map((declaration) => validateProductManagedTreeSource(providerRegistry, declaration, {
      forbiddenOutputRoots: [outDir, templateRoot],
    }))
  const productManagedTreesByProvider = new Map(providerRegistry.providers.map((provider) => [
    provider.id,
    productManagedTrees.filter((tree) => tree.provider === provider.id),
  ]))
  const generatedProviders = providerRegistry.providers.filter((provider) => provider.adapter.generate)
  const compatibilityProjections = providerRegistry.canonical.compatibilityProjections
  const legacyInstructionProviderId = compatibilityProjections.legacyClaudeInstruction.providerId
  const legacyInstructionProviderActive = generatedProviders.some((provider) => provider.id === legacyInstructionProviderId)
  const legacyDiscoveryCategories = canonicalSources.legacyDiscoveryCategories
  if (legacyInstructionProviderActive) {
    for (const category of legacyDiscoveryCategories) {
      const source = join(ROOT, category.sourceRoot)
      assertSafeTree(ROOT, source, `compatibility category ${category.name}.sourceRoot`, { allowMissing: false })
      if (!lstatSync(source).isDirectory()) throw new Error(`compatibility category ${category.name}.sourceRoot must be a real directory`)
      for (const entry of category.entries) assertRegularSource(join(source, entry), `compatibility category ${category.name}/${entry}`)
    }
  }
  const sharedInstructionDestinations = [...new Set(generatedProviders.map((provider) => (
    normalizeRepositoryRelative(provider.sharedInstructionEntry, `${provider.id}.sharedInstructionEntry`)
  )))]
  if (sharedInstructionDestinations.length !== 1) {
    throw new Error(`generated providers must agree on exactly one shared instruction destination:${sharedInstructionDestinations.join(',') || '<none>'} => ADAPTER-BLOCKED`)
  }
  const commonInstructionDestination = sharedInstructionDestinations[0]
  const sharedInstructionMaterializers = Object.entries(providerRegistry.canonical.materializers.instructionViews)
    .filter(([, materializer]) => (
      materializer.engine === 'shared-instruction-v1'
      && materializer.ownershipPolicy === 'common-authority-consumer'
    ))
  if (sharedInstructionMaterializers.length !== 1) {
    throw new Error('provider registry must declare exactly one common-authority shared instruction materializer => ADAPTER-BLOCKED')
  }
  const [sharedInstructionMaterializerId] = sharedInstructionMaterializers[0]
  for (const provider of generatedProviders) {
    const materializer = resolveProviderMaterializer(
      providerRegistry,
      'instructionViews',
      provider.adapter.instructionView.materializerId,
      `${provider.id}.adapter.instructionView.materializerId`,
    )
    if (materializer.engine === 'shared-instruction-v1' && provider.instructionEntry !== commonInstructionDestination) {
      throw new Error(`${provider.id}:shared instruction provider must discover the common destination ${commonInstructionDestination} => ADAPTER-BLOCKED`)
    }
  }
  const retiredTemplateSurfaces = authenticatedProviderLifecycle.retiredProviders.flatMap((retirement) => (
    retirement.surfaces.map((surface) => ({ ...surface, providerId: retirement.id }))
  ))
  for (const surface of retiredTemplateSurfaces) {
    if (repositoryPathsOverlap(surface.path, commonInstructionDestination)) {
      throw new Error(`${surface.providerId}:provider tombstone may not delete the common instruction authority`)
    }
  }
  const nonProviderAuthorities = [
    { path: commonInstructionDestination, owner: 'common-instruction' },
    { path: PRODUCT_LAUNCHER_DESTINATION, owner: 'shared-launchers' },
    ...Object.keys(MANAGED_FILE_SOURCES).map((path) => ({ path, owner: 'consumer-managed-file' })),
  ]
  for (const [providerId, surfaces] of managedProviderInventory) for (const surface of surfaces) {
    const controlPlaneAuthority = consumerControlPlaneAuthority(surface.path)
    if (controlPlaneAuthority) {
      throw new Error(
        `${providerId}:provider lifecycle surface overlaps non-provider authority:`
        + `${surface.path} <> consumer-control-plane:${controlPlaneAuthority}`,
      )
    }
    for (const reserved of nonProviderAuthorities) {
      if (repositoryPathsOverlap(surface.path, reserved.path)) {
        throw new Error(
          `${providerId}:provider lifecycle surface overlaps non-provider authority:`
          + `${surface.path} <> ${reserved.owner}:${reserved.path}`,
        )
      }
    }
  }
  // Fork product projections consume the exact same canonical classification and assumption
  // inventory as repository-native views. A transformed product tree is not permission to bypass
  // canonical semantic scanning or to infer compatibility for a newly registered provider.
  scanCanonicalSkillSemantics({ registry: providerRegistry, semantics: providerSkillSemantics, sourceRoot: ROOT })
  for (const provider of providerRegistry.providers.filter((item) => item.adapter.generate)) {
    assertRegularSource(join(ROOT, provider.adapter.productInstructionSource), `${provider.id} product instruction source`)
    if (!provider.capabilities.nativeHooks) continue
    if (!provider.adapter.hookView) throw new Error(`${provider.id}:generated native-hook product adapter requires a hookView`)
  }
  const sharedInstructionArtifact = 'common/instruction.md'
  const sharedInstructionDestination = commonInstructionDestination
  const sharedInstructionSource = normalizeRepositoryRelative(
    providerRegistry.canonical.productSharedInstructionSource,
    'canonical product shared instruction source',
  )
  const sharedInstructionRoleBody = readFileSync(assertRegularSource(
    join(ROOT, sharedInstructionSource),
    'canonical product shared instruction source',
  ), 'utf8')
  const canonicalDecisionAuthoritySource = assertRegularSource(
    join(ROOT, CANONICAL_DECISION_AUTHORITY_SOURCE),
    'canonical Decision Authority source',
  )
  const canonicalDecisionAuthorityProjection = extractCanonicalDecisionAuthority(
    readFileSync(canonicalDecisionAuthoritySource, 'utf8'),
  )
  const sharedInstructionBody = materializeProductSharedInstruction(
    sharedInstructionRoleBody,
    canonicalDecisionAuthorityProjection,
  )
  const sharedInstructionSourceLabel =
    `${sharedInstructionSource} + ${CANONICAL_DECISION_AUTHORITY_SOURCE}#canonical-decision-authority`
  const outputBoundary = commonOutputBoundary([outDir, templateRoot])
  const activeManagedSurfacePaths = generatedProviders.flatMap((provider) => (
    (managedProviderInventory.get(provider.id) || []).map((surface) => surface.path)
  ))
  const compatibilityTreeTombstones = compatibilityProjections.legacyClaudeInstruction.legacyProductTreeTombstones
    .map((path) => normalizeRepositoryRelative(path, 'legacy product tree tombstone'))
    .filter((path) => !activeManagedSurfacePaths.some((surface) => repositoryPathsOverlap(surface, path)))
  const managedTrees = new Map([
    [outDir, 'fork corpus output'],
    ...compatibilityTreeTombstones.map((path) => [join(templateRoot, path), `legacy compatibility tree tombstone ${path}`]),
    [join(templateRoot, PRODUCT_LAUNCHER_DESTINATION), 'template provider-neutral launcher view'],
    [join(templateRoot, 'governance'), 'template governance lock view'],
    ...providerRegistry.providers.filter((provider) => provider.adapter.generate && provider.adapter.skillView).map((provider) => [
      join(templateRoot, provider.skillDirectory), `${provider.id} template skill view`,
    ]),
    ...productManagedTrees.map((tree) => [
      join(templateRoot, tree.destination), `${tree.provider} product managed tree ${tree.name}`,
    ]),
    ...retiredTemplateSurfaces.filter((surface) => surface.kind === 'tree').map((surface) => [
      join(templateRoot, surface.path), `${surface.providerId} retired template tree`,
    ]),
  ])
  const managedTargetFiles = new Map([
    [join(templateRoot, sharedInstructionDestination), 'template common instruction view'],
    ...providerRegistry.providers.filter((provider) => provider.adapter.generate).flatMap((provider) => [
      [join(templateRoot, provider.instructionEntry), `${provider.id} template instruction view`],
      ...(provider.hookConfig ? [[join(templateRoot, provider.hookConfig), `${provider.id} template hook view`]] : []),
    ]),
    ...(legacyInstructionProviderActive ? legacyDiscoveryCategories.flatMap((category) => category.entries.map((entry) => [
      join(templateRoot, category.destinationRoot, entry),
      `${legacyInstructionProviderId} compatibility category ${category.name}/${entry}`,
    ])) : []),
    ...retiredTemplateSurfaces.filter((surface) => surface.kind === 'file').map((surface) => [
      join(templateRoot, surface.path), `${surface.providerId} retired template file`,
    ]),
  ])
  // Validate every destructive/read-write target before the first rm/mkdir/write. This makes an
  // existing parent/file/tree symlink a fail-closed error and preserves any external sentinel.
  for (const [target, label] of managedTrees) assertSafeManagedTarget(outputBoundary, target, label, { tree: true })
  for (const [target, label] of managedTargetFiles) assertSafeManagedTarget(outputBoundary, target, label)
  // Retired provider paths are removed only when their current bytes still equal the immutable
  // prior artifact digest. This makes builder convergence use the same authenticated tombstones as
  // refresh and prevents a provider retirement from deleting user-owned divergence.
  for (const surface of retiredTemplateSurfaces) {
    const target = join(templateRoot, surface.path)
    if (!pathEntryExists(target)) continue
    if (providerSurfaceDigest(templateRoot, surface) !== surface.sha256) {
      throw new Error(`${surface.providerId}:retired template surface differs from immutable prior artifact:${surface.path}`)
    }
    rmSync(target, { recursive: surface.kind === 'tree', force: false })
  }
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'hooks'), { recursive: true })

  const providerAdapters = Object.fromEntries(providerRegistry.providers.map((provider) => [provider.id, {
    schemaVersion: 1,
    capabilities: {
      nativeHooks: provider.capabilities.nativeHooks,
      hookEnforcement: provider.capabilities.hookEnforcement,
      hardGate: 'provider-neutral-ci-required',
    },
    environmentMap: provider.adapter.environmentMap || {},
    normalization: provider.normalization,
    blockingExitCode: provider.blockingExitCode,
    contextOutputTransport: provider.runtime?.contextOutputTransport || 'stderr',
    stopDecisionTransport: provider.runtime?.stopDecisionTransport || 'blocking-exit',
  }]))
  const manifest = {
    _generated: 'build-fork-governance.mjs',
    schemaVersion: 2,
    kind: 'provider-neutral-fork-manifest',
    providerRegistrySchemaVersion: providerRegistry.schemaVersion,
    materializers: structuredClone(providerRegistry.canonical.materializers),
    discoveryPolicy: buildProviderDiscoveryPolicy(providerRegistry),
    providerLifecycle: authenticatedProviderLifecycle,
    providerAdapters,
    authorityDecision: {
      schemaVersion: 1,
      policySource: 'AGENTS.md#canonical-decision-authority',
      classifierSource: 'launchers/approval-evidence.mjs',
      receiptContractSource: 'launchers/authority-decision-evidence.mjs',
      runner: 'launchers/product-hook-dispatch-runtime.mjs',
      prepareArgv: ['--authority-decision', 'prepare'],
      verifyArgv: ['--authority-decision', 'verify'],
      certificationClaim: 'structural-only-not-runtime-certified',
    },
    independentReview: null,
    launchers: [...LAUNCHER_FILES],
    hooks: {},
    ciReplay: [],
    skills: [],
    commands: [],
    agents: [],
  } // hooks: event → [{file, source-hook}];skills/commands/agents: 名單(sync clobber scope 權威)
  const lockEntries = []

  const emit = (outName, content, sourceHook, bucket, runtimeContracts) => {
    // fork path 適配(所有 bucket 都套):DS-author repo dir 名 `my-project` 的 display-path strip
    // 在 fork 永不命中 → 顯示絕對路徑。改 `$GOVERNANCE_PROJECT_DIR`(provider-neutral,strip 出 repo-relative)。
    // 純 display(soft warn message),不動 exit code / BLOCKER 邏輯。
    content = content.replace(/#\*\/my-project\//g, '#"$$GOVERNANCE_PROJECT_DIR"/')
    const outPath = join(outDir, 'hooks', outName)
    writeFileSync(outPath, content)
    const sha = createHash('sha256').update(content).digest('hex')
    lockEntries.push({ file: `hooks/${outName}`, sha256: sha, sourceHook, bucket })
    if (!runtimeContracts.length) {
      throw new Error(`shipped fork hook has no canonical runtime contract:${sourceHook}`)
    }
    const contracts = runtimeContracts
    for (const contract of contracts) {
      const { event, matcher, runtime, outputMode, inputContract, transcriptRequirement } = contract
      manifest.hooks[event] = manifest.hooks[event] || []
      manifest.hooks[event].push({
        file: `hooks/${outName}`,
        sourceHook,
        bucket,
        matcher,
        runtime,
        outputMode,
        inputContract,
        transcriptRequirement,
      })
      // Static CI replays every enforceable shared hook directly. Soft context injectors/replacements
      // stay native-feedback only and cannot make the hard checker slow or environment-dependent.
      if (bucket !== 'REPLACE' && sourceHook !== 'inject_deploy_url_after_push.sh') {
        manifest.ciReplay.push({
          event,
          file: `hooks/${outName}`,
          sourceHook,
          interpreter: runtime,
          matcher,
          outputMode,
          inputContract,
          transcriptRequirement,
        })
      }
    }
  }

  for (const e of cls.SHIP_AS_IS) {
    const content = readFileSync(join(canonicalSources.hooksDir, e.hook), 'utf8')
    emit(e.hook, content, e.hook, 'SHIP_AS_IS', runtimeContractsOf(e.hook))
  }
  // 2026-07-08 WM 戰役 R4:_log-fire.sh helper 隨 corpus 附帶(非 hook 註冊,純檔案存在)。
  // 原本 DROP 未 ship → 14 支 shipped hook 的 `source _log-fire.sh` 靜默失敗(2>/dev/null 吞掉)
  // = fork 端防線 telemetry 全盲(WM fire log 只有 python hook 一支有紀錄實證)。
  {
    const helper = '_log-fire.sh'
    const helperPath = join(canonicalSources.hooksDir, helper)
    if (existsSync(helperPath)) {
      const helperBody = readFileSync(helperPath)
      writeFileSync(join(outDir, 'hooks', helper), helperBody)
      lockEntries.push({ file: `hooks/${helper}`, sha256: createHash('sha256').update(helperBody).digest('hex'), sourceHook: helper, bucket: 'HELPER' })
      // 不進 manifest.hooks(不是 hook,不註冊 event);僅檔案隨行供 source。
    }
  }
  // Shipped hooks keep their provider-neutral path and integrity helpers as real sibling files.
  // These are authenticated corpus dependencies, not hook registrations; omitting them turns a
  // valid policy replay into reserved integrity exit 70 on every provider and in hooks-off CI.
  mkdirSync(join(outDir, 'hooks/lib'), { recursive: true })
  for (const helper of ['_hook_integrity.sh', '_provider_paths.sh', '_micro_geometry.sh']) {
    const helperPath = assertRegularSource(
      join(canonicalSources.hooksDir, 'lib', helper),
      `canonical fork hook helper ${helper}`,
    )
    const helperBody = readFileSync(helperPath)
    writeFileSync(join(outDir, 'hooks/lib', helper), helperBody)
    lockEntries.push({
      file: `hooks/lib/${helper}`,
      sha256: createHash('sha256').update(helperBody).digest('hex'),
      sourceHook: `lib/${helper}`,
      bucket: 'HELPER',
    })
  }
  for (const e of cls.SHIP_REWRITTEN) {
    const ov = join(OVERRIDE_DIR, e.hook)
    let content
    if (existsSync(ov)) content = readFileSync(ov, 'utf8')
    else content = applyTransform(readFileSync(join(canonicalSources.hooksDir, e.hook), 'utf8'))
    emit(e.hook, content, e.hook, 'SHIP_REWRITTEN', runtimeContractsOf(e.hook))
  }
  for (const e of cls.REPLACE) {
    const m = e.replaceWith.match(/([a-zA-Z0-9_-]+\.sh)/)
    const newName = m ? m[1] : ('replaced_' + e.hook)
    const ov = join(OVERRIDE_DIR, newName)
    if (!existsSync(ov)) {
      console.error(`❌ REPLACE override 缺檔:scripts/fork-hook-overrides/${newName}(${e.hook} 的取代版必須手寫)`)
      process.exit(1)
    }
    const sourceContracts = runtimeContractsOf(e.hook)
    const replacementContract = e.replacementRuntimeContract
    if (!replacementContract || typeof replacementContract !== 'object' || Array.isArray(replacementContract)) {
      throw new Error(`REPLACE entry requires an explicit replacementRuntimeContract:${e.hook}`)
    }
    emit(
      newName,
      readFileSync(ov, 'utf8'),
      e.hook,
      'REPLACE',
      sourceContracts.map(({ event, matcher }) => ({ event, matcher, ...replacementContract })),
    )
  }
  // DROP: 不生成

  // Runtime policy data is copied from its single canonical owner into the authenticated fork
  // corpus. These are projections, not new authorities; governance.lock binds their exact bytes
  // and records the canonical source path for provenance.
  mkdirSync(join(outDir, 'references'), { recursive: true })
  for (const [name, source] of [
    ['story-baseline-registry.json', STORY_BASELINE_REGISTRY_PATH],
    ['story-baseline-registry.schema.json', STORY_BASELINE_REGISTRY_SCHEMA_PATH],
    ['utility-registry.json', UTILITY_REGISTRY_PATH],
    ['utility-registry.schema.json', UTILITY_REGISTRY_SCHEMA_PATH],
  ]) {
    const body = readFileSync(source)
    writeFileSync(join(outDir, 'references', name), body)
    lockEntries.push({
      file: `references/${name}`,
      sha256: createHash('sha256').update(body).digest('hex'),
      source: relative(ROOT, source).split(sep).join('/'),
    })
  }

  // ── 必-committed 類別(skills / commands):canonical 整目錄投影進 ds-canonical/fork/<cat>/ ──
  // Provider 只從 committed discovery home 載入，fork 必有 generated 實檔才能叫用(尤 prototype)。
  // 全部改寫 provider/DS-author 指標(.claude/... / packages/design-system/src → node_modules/...);
  // skill/command/agent 是「docs-with-pointers」,即使 SHIP_AS_IS 也須改 path(與 hook 的 self-contained shell verbatim 不同)。
  const emitFile = (srcFile, outRel) => {
    let buf = readFileSync(srcFile)
    if (srcFile.endsWith('.md')) {
      let txt = rewriteForkInstalledPointers(buf.toString('utf8'))
      if (outRel.startsWith('skills/')) txt = annotateForkSkill(txt) // 引用 DS-author 機械工具的 skill 自動加 fork 註記
      buf = Buffer.from(txt)
    }
    const outPath = join(outDir, outRel)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, buf)
    lockEntries.push({ file: outRel, sha256: createHash('sha256').update(buf).digest('hex') })
  }
  const emitTree = (srcPath, outRel) => {
    if (statSync(srcPath).isDirectory()) {
      for (const ent of readdirSync(srcPath).sort()) emitTree(join(srcPath, ent), `${outRel}/${ent}`)
    } else {
      emitFile(srcPath, outRel)
    }
  }
  for (const { home, dir } of canonicalSources.committedCategories.filter((item) => item.home === 'skills')) {
    for (const name of classifiedNames(home, ['SHIP_AS_IS', 'SHIP_REWRITTEN'])) {
      const src = join(dir, name)
      if (!existsSync(src)) continue
      emitTree(src, `${home}/${name}`)
      manifest[home].push(name)
    }
    manifest[home].sort()
  }
  if (legacyInstructionProviderActive) {
    for (const category of legacyDiscoveryCategories) {
      for (const name of category.entries) {
        emitFile(join(ROOT, category.sourceRoot, name), `${category.artifactRoot}/${name}`)
        manifest[category.name].push(name)
      }
      manifest[category.name].sort()
    }
  }

  // ── Product provider surfaces ──
  // The registry is the inventory and this canonical product wiring is the only event map. Every
  // enabled provider receives an authenticated instruction/hook/skill artifact under a neutral npm
  // path; destination paths and exclusions live in manifest.providerSurfaces. Legacy Codex corpus
  // paths are byte-identical compatibility aliases, never a second source.
  const emitRaw = (outRel, content, source, { mode = null } = {}) => {
    const outPath = join(outDir, outRel)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, content, Number.isInteger(mode) ? { mode } : undefined)
    lockEntries.push({ file: outRel, sha256: createHash('sha256').update(content).digest('hex'), source })
  }
  const emitRawTree = (srcPath, outRel, source) => {
    const info = lstatSync(srcPath)
    if (info.isSymbolicLink()) throw new Error(`provider surface source contains symlink:${relative(outDir, srcPath)}`)
    if (info.isDirectory()) {
      for (const ent of readdirSync(srcPath).sort()) emitRawTree(join(srcPath, ent), `${outRel}/${ent}`, source)
    } else if (info.isFile()) {
      if (info.nlink !== 1) throw new Error(`provider surface source contains hard-link alias:${srcPath}`)
      emitRaw(outRel, readFileSync(srcPath), source, { mode: info.mode & 0o777 })
    } else throw new Error(`provider surface source contains unsupported entry:${relative(outDir, srcPath)}`)
  }
  if (genesisTransition.state === CONTROL_PLANE_GENESIS_OPEN_STATE) {
    const preamble = genesisMaterializations.get('packages/design-system/ds-canonical/fork/preamble.md')
    if (!preamble || preamble.kind !== 'file' || preamble.mode !== '100644') {
      throw new Error('Genesis fork preamble is absent from the authenticated transition')
    }
    emitRaw(
      'preamble.md',
      preamble.bytes,
      `${genesisTransition.id}:${genesisTransition.baseCommit}:packages/design-system/ds-canonical/fork/preamble.md`,
      { mode: 0o644 },
    )
  }
  const providerWiringDigest = createHash('sha256')
    .update(JSON.stringify(productWiring))
    .update(claudePermissionPolicy.sha256)
    .update(JSON.stringify({ hooks: manifest.hooks, skills: manifest.skills }))
    .digest('hex')
  const instructionBodies = new Map()
  const hookConfigBodies = new Map()
  manifest.providerSurfaces = {}

  // The common product instruction is a consumer-owned authority, not a provider projection.
  // Providers using shared-instruction-v1 may reference this one locked artifact, but neither their
  // managed inventory nor a future retirement tombstone may claim its destination.
  emitRaw(sharedInstructionArtifact, sharedInstructionBody, sharedInstructionSourceLabel)
  const closedToolExecutionSource = assertRegularSource(
    join(ROOT, 'packages/governance/src/closed-tool-execution.mjs'),
    'closed external-tool execution authority',
  )
  const closedToolExecutionBody = readFileSync(closedToolExecutionSource)
  emitRaw(
    'common/closed-tool-execution.mjs',
    closedToolExecutionBody,
    'packages/governance/src/closed-tool-execution.mjs',
    { mode: 0o444 },
  )

  const buildProductHookConfig = (provider) => {
    const view = provider.adapter.hookView
    const materializer = resolveProviderMaterializer(
      providerRegistry,
      'hookViews',
      view.materializerId,
      `${provider.id}.adapter.hookView.materializerId`,
    )
    const supportedEvents = new Set(provider.adapter.hookView.supportedEvents)
    const hooks = Object.fromEntries(Object.entries(productWiring.hooks)
      .filter(([event]) => supportedEvents.has(event))
      .map(([event, entries]) => [
      projectProviderNativeEvent(provider, event),
      entries.map((entry) => ({
        ...(entry.matcher ? { matcher: projectMatcherForProvider(entry.matcher, provider.id, providerRegistry) } : {}),
        hooks: [(() => {
          const argv = buildProviderHookLaunchArgv([
            '/bin/bash',
            '--',
            `${PRODUCT_LAUNCHER_DESTINATION}/${entry.launcher}`,
            provider.id,
          ])
          return { type: 'command', command: argv.join(' '), argv }
        })()],
      })),
    ]))
    const description = `_generated: build-fork-governance.mjs; provider=${provider.id}; sourceDigest=${providerWiringDigest}; exact npm corpus; native hooks are feedback only, provider-neutral check + protected CI are authoritative.`
    const baseTemplateContract = materializer.baseTemplateContract === null
      ? null
      : resolveProviderMaterializer(
          providerRegistry,
          'hookBaseTemplateContracts',
          materializer.baseTemplateContract,
          `${provider.id}.adapter.hookView.baseTemplateContract`,
        )
    const baseConfig = baseTemplateContract?.engine === 'claude-permission-policy-v1'
      ? {
          _comment_governance: productWiring.settings.comment,
          permissions: productClaudeGovernanceSettings.permissions,
          sandbox: productClaudeGovernanceSettings.sandbox,
        }
      : null
    return materializeProviderHookConfig({
      providerId: provider.id,
      hooks,
      description,
      registry: providerRegistry,
      sourceRoot: ROOT,
      baseConfig,
    })
  }

  for (const provider of providerRegistry.providers) {
    if (!provider.adapter.generate) {
      manifest.providerSurfaces[provider.id] = {
        schemaVersion: 3,
        generated: false,
        capabilities: {
          nativeHooks: provider.capabilities.nativeHooks,
          hookEnforcement: provider.capabilities.hookEnforcement,
          hardGate: 'provider-neutral-ci-required',
        },
        instructionArtifact: null,
        instructionDestination: provider.instructionEntry,
        instructionMaterializerId: null,
        hookArtifact: null,
        hookDestination: provider.hookConfig,
        hookMaterializerId: null,
        skillArtifactRoot: null,
        skillDestination: provider.skillDirectory,
        skillMaterializerId: null,
        skillEntryFile: null,
        skills: [],
        trees: [],
        managedSurfaces: [],
        nativeHookCoverage: null,
        environmentMap: {},
        exclusions: provider.adapter.exclusions || [],
      }
      continue
    }
    const instructionMaterializerId = provider.adapter.instructionView.materializerId
    const instructionMaterializer = resolveProviderMaterializer(
      providerRegistry,
      'instructionViews',
      instructionMaterializerId,
      `${provider.id}.adapter.instructionView.materializerId`,
    )
    const instructionBody = materializeProductInstruction({
      provider,
      registry: providerRegistry,
      sourceRoot: ROOT,
      sharedBody: sharedInstructionBody,
    })
    const usesCommonInstruction = instructionMaterializerId === sharedInstructionMaterializerId
    const instructionArtifact = usesCommonInstruction
      ? sharedInstructionArtifact
      : `providers/${provider.id}/instruction.md`
    if (!usesCommonInstruction) {
      emitRaw(instructionArtifact, instructionBody, provider.adapter.productInstructionSource)
    }
    const priorInstruction = instructionBodies.get(provider.instructionEntry)
    if (priorInstruction && !priorInstruction.equals(instructionBody)) {
      throw new Error(`provider instruction destination collision:${provider.instructionEntry}`)
    }
    instructionBodies.set(provider.instructionEntry, instructionBody)

    let hookArtifact = null
    if (provider.capabilities.nativeHooks) {
      const hookConfig = buildProductHookConfig(provider)
      const hookBody = Buffer.from(JSON.stringify(hookConfig, null, 2) + '\n')
      hookArtifact = `providers/${provider.id}/hook-config.json`
      emitRaw(hookArtifact, hookBody, `${relative(ROOT, PRODUCT_WIRING_PATH)} + providers.json:${provider.id}`)
      hookConfigBodies.set(provider.id, hookBody)
    }

    const skillArtifactRoot = `providers/${provider.id}/skills`
    const skillMaterializer = provider.adapter.skillView
      ? resolveProviderMaterializer(
          providerRegistry,
          'skillViews',
          provider.adapter.skillView.materializerId,
          `${provider.id}.adapter.skillView.materializerId`,
        )
      : null
    if (manifest.skills.length && skillMaterializer?.engine !== 'skill-directory-v1') {
      throw new Error(`${provider.id}:generated product skills require an explicit skill-directory-v1 discovery capability => ADAPTER-BLOCKED`)
    }
    const roleApprovedProductSkills = new Set(manifest.skills)
    for (const alias of provider.adapter.skillAliases || []) {
      if (!roleApprovedProductSkills.has(alias.sourceSkill)) {
        throw new Error(
          `${provider.id}:product skill alias ${alias.name} sources ${alias.sourceSkill}, which is not role-approved in manifest.skills => ADAPTER-BLOCKED`,
        )
      }
    }
    const projectedSkillRoot = join(outDir, skillArtifactRoot)
    const projectedSkillTargets = buildSharedSkillTargets({
      sourceRoot: outDir,
      outputRoot: outDir,
      sourceDir: join(outDir, 'skills'),
      destinationDir: projectedSkillRoot,
      targetProvider: provider.id,
      registry: providerRegistry,
      semantics: providerSkillSemantics,
    })
    for (const target of projectedSkillTargets) {
      const relativeSkillPath = relative(projectedSkillRoot, target.path).split(sep).join('/')
      const content = relativeSkillPath.endsWith(`/${skillMaterializer.entryFile}`)
        ? Buffer.from(rewriteForkInstalledPointers(target.content.toString('utf8'))
            // The shared projector keeps its legacy implementation filename for repository
            // provenance. Product-role prose must not expose that DS-author-only executable as an
            // actionable pointer or a foreign-provider path.
            .replaceAll('scripts/gen-codex-adapter.mjs', 'canonical provider skill projection'))
        : target.content
      emitRaw(`${skillArtifactRoot}/${relativeSkillPath}`, content, target.source)
    }
    const providerSkills = [
      ...manifest.skills,
      ...(provider.adapter.skillAliases || []).map((alias) => alias.name),
    ]
    const providerTrees = (productManagedTreesByProvider.get(provider.id) || []).map((tree) => {
      const artifactRoot = `providers/${provider.id}/trees/${tree.name}`
      emitRawTree(tree.source, artifactRoot, tree.sourceRoot)
      return {
        schemaVersion: 1,
        name: tree.name,
        artifactRoot,
        destination: tree.destination,
        materializerId: tree.materializerId,
        transformPolicy: tree.transformPolicy,
      }
    })
    manifest.providerSurfaces[provider.id] = {
      schemaVersion: 3,
      generated: true,
      capabilities: {
        nativeHooks: provider.capabilities.nativeHooks,
        hookEnforcement: provider.capabilities.hookEnforcement,
        hardGate: 'provider-neutral-ci-required',
      },
      instructionArtifact,
      instructionDestination: provider.instructionEntry,
      instructionMaterializerId,
      hookArtifact,
      hookDestination: provider.hookConfig,
      hookMaterializerId: provider.adapter.hookView?.materializerId || null,
      skillArtifactRoot,
      skillDestination: provider.skillDirectory,
      skillMaterializerId: provider.adapter.skillView?.materializerId || null,
      skillEntryFile: skillMaterializer?.entryFile || null,
      skills: [...new Set(providerSkills)].sort(),
      trees: providerTrees,
      managedSurfaces: structuredClone(managedProviderInventory.get(provider.id) || []),
      nativeHookCoverage: buildProductNativeHookCoverage(provider),
      environmentMap: provider.adapter.environmentMap || {},
      exclusions: provider.adapter.exclusions || [],
    }
  }

  // Project only after provider skill drivers have passed their binding-profile checks, preserving
  // the canonical fail-closed diagnostic ordering for a newly registered provider.
  manifest.independentReview = projectProviderReviewBindings({
    registry: providerRegistry,
    compatibilityMatrix: providerCompatibility,
    certificationLedger: providerCertifications,
    skill: 'independent-review',
    repositoryRole: 'product-consumer',
  })

  const forkCommonInstruction = sharedInstructionBody
  const legacyInstructionSurface = manifest.providerSurfaces[legacyInstructionProviderId]?.generated
    ? manifest.providerSurfaces[legacyInstructionProviderId]
    : null
  const legacyInstructionBody = legacyInstructionSurface
    ? instructionBodies.get(legacyInstructionSurface.instructionDestination) || null
    : null
  // These root aliases exist only for older refresh tooling. The common alias is always available;
  // a provider-specific alias is emitted only while an active provider actually supplies it.
  emitRaw(sharedInstructionDestination, forkCommonInstruction, 'common instruction compatibility alias')
  if (legacyInstructionBody && legacyInstructionSurface.instructionDestination !== sharedInstructionDestination) {
    emitRaw(legacyInstructionSurface.instructionDestination, legacyInstructionBody, 'provider instruction compatibility alias')
  }

  // Published compatibility aliases for consumers on older refresh tooling. Their bytes are copied
  // from providerSurfaces and checked against the same lock, so they cannot become a second SSOT.
  const legacyCorpusProjection = compatibilityProjections.legacyCodexCorpus
  const legacyCorpusSurface = manifest.providerSurfaces[legacyCorpusProjection.providerId]
  if (legacyCorpusSurface?.generated) {
    const legacyHookBody = hookConfigBodies.get(legacyCorpusProjection.providerId)?.toString('utf8')
    if (legacyHookBody) emitRaw(legacyCorpusProjection.hookArtifact, legacyHookBody, legacyCorpusSurface.hookArtifact)
    for (const skill of legacyCorpusSurface.skills) {
      emitRawTree(
        join(outDir, legacyCorpusSurface.skillArtifactRoot, skill),
        `${legacyCorpusProjection.skillArtifactRoot}/${skill}`,
        `${legacyCorpusSurface.skillArtifactRoot}/${skill}`,
      )
    }
    manifest.codex = {
      agentsMd: legacyCorpusSurface.instructionArtifact,
      instructionDestination: legacyCorpusSurface.instructionDestination,
      hooksJson: LAUNCHER_NAMES,
      hookArtifact: legacyHookBody ? legacyCorpusProjection.hookArtifact : null,
      hookDestination: legacyCorpusSurface.hookDestination,
      agentsSkills: legacyCorpusSurface.skills,
      skillArtifactRoot: legacyCorpusProjection.skillArtifactRoot,
      skillDestination: legacyCorpusSurface.skillDestination,
      compatibilityOnly: true,
    }
  } else {
    manifest.codex = null
  }

  // ── launchers/(接線骨架 + shared provider transport + settings hooks,隨 npm ship 供 sync-all 刷新既有 fork)──
  // SSOT = ds-canonical/templates/{product-launchers,product-provider-wiring.json}
  // plus scripts/lib/provider-hook-output-transport.mjs for the shared stdin/output transport.
  mkdirSync(join(outDir, 'launchers'), { recursive: true })
  for (const ln of LAUNCHER_FILES) {
    const src = LAUNCHER_SOURCE_BY_NAME[ln]
    const content = readFileSync(src, 'utf8')
    writeFileSync(join(outDir, 'launchers', ln), content)
    lockEntries.push({ file: `launchers/${ln}`, sha256: createHash('sha256').update(content).digest('hex'), source: relative(ROOT, src) })
  }
  mkdirSync(join(outDir, 'review'), { recursive: true })
  const reviewCanonicalOrderBody = readFileSync(GOVERNANCE_CANONICAL_ORDER_SOURCE_PATH)
  writeFileSync(join(outDir, 'review/canonical-order.mjs'), reviewCanonicalOrderBody)
  lockEntries.push({
    file: 'review/canonical-order.mjs',
    sha256: createHash('sha256').update(reviewCanonicalOrderBody).digest('hex'),
    source: relative(ROOT, GOVERNANCE_CANONICAL_ORDER_SOURCE_PATH),
  })
  const reviewBindingBody = readFileSync(REVIEW_BINDING_SOURCE_PATH)
  writeFileSync(join(outDir, 'review/provider-review-binding.mjs'), reviewBindingBody)
  lockEntries.push({
    file: 'review/provider-review-binding.mjs',
    sha256: createHash('sha256').update(reviewBindingBody).digest('hex'),
    source: relative(ROOT, REVIEW_BINDING_SOURCE_PATH),
  })
  const templateMergeProviders = providerRegistry.providers.filter((provider) => provider.adapter.generate && provider.adapter.hookView)
    .map((provider) => ({
      provider,
      materializer: resolveProviderMaterializer(
        providerRegistry,
        'hookViews',
        provider.adapter.hookView.materializerId,
        `${provider.id}.adapter.hookView.materializerId`,
      ),
    }))
    .filter(({ materializer }) => materializer.mergeStrategy === 'merge-hook-map-into-base-v1')
  const hookMergeSurfaces = Object.fromEntries(templateMergeProviders.map(({ provider, materializer }) => {
    const baseTemplateContract = resolveProviderMaterializer(
      providerRegistry,
      'hookBaseTemplateContracts',
      materializer.baseTemplateContract,
      `${provider.id}.adapter.hookView.baseTemplateContract`,
    )
    const permissionPolicy = baseTemplateContract.engine === 'claude-permission-policy-v1'
      ? {
          source: claudePermissionPolicy.source,
          sha256: claudePermissionPolicy.sha256,
          retiredPermissionAllow: [...productWiring.settings.retiredPermissionAllow],
        }
      : null
    return [provider.id, {
      schemaVersion: 1,
      hookArtifact: manifest.providerSurfaces[provider.id].hookArtifact,
      hookDestination: manifest.providerSurfaces[provider.id].hookDestination,
      hookMaterializerId: provider.adapter.hookView.materializerId,
      mergeStrategy: materializer.mergeStrategy,
      baseTemplateContract: materializer.baseTemplateContract,
      permissionPolicy,
      retiredHookRegistrations: productWiring.retiredHookRegistrations
        .filter((record) => record.provider === provider.id)
        .sort((left, right) => compareUtf8Bytes(left.id, right.id)),
    }]
  }))
  const settingsHooksStr = JSON.stringify({
    _generated: 'build-fork-governance.mjs',
    kind: 'provider-hook-merge-policies',
    schemaVersion: 1,
    sourceDigest: providerWiringDigest,
    surfaces: hookMergeSurfaces,
  }, null, 2) + '\n'
  writeFileSync(join(outDir, 'launchers', 'settings-hooks.json'), settingsHooksStr)
  lockEntries.push({
    file: 'launchers/settings-hooks.json',
    sha256: createHash('sha256').update(settingsHooksStr).digest('hex'),
    source: `${relative(ROOT, PRODUCT_WIRING_PATH)} + packages/governance/canonical/providers.json`,
  })

  // Ship the provider-neutral hard checker with the npm corpus so an existing product can receive
  // the same authority as a newly scaffolded template. This file is executable policy plumbing,
  // not rule prose; every provider and CI calls the same byte-identical implementation.
  const corpusConsumerDir = join(outDir, 'consumer')
  mkdirSync(corpusConsumerDir, { recursive: true })
  const governanceCheckSource = assertRegularSource(join(ROOT, 'scripts/governance-check.mjs'), 'consumer governance checker source')
  const governanceCheckBody = readFileSync(governanceCheckSource, 'utf8')
  writeFileSync(join(corpusConsumerDir, 'governance-check.mjs'), governanceCheckBody, { mode: 0o755 })
  lockEntries.push({
    file: 'consumer/governance-check.mjs',
    sha256: createHash('sha256').update(governanceCheckBody).digest('hex'),
    source: 'scripts/governance-check.mjs',
  })
  mkdirSync(join(corpusConsumerDir, 'lib'), { recursive: true })
  writeFileSync(
    join(corpusConsumerDir, 'lib/closed-tool-execution.mjs'),
    closedToolExecutionBody,
    { mode: 0o444 },
  )
  lockEntries.push({
    file: 'consumer/lib/closed-tool-execution.mjs',
    sha256: createHash('sha256').update(closedToolExecutionBody).digest('hex'),
    source: 'packages/governance/src/closed-tool-execution.mjs',
  })

  // Every file whose digest is enforced by the immutable consumer BOM must also be shipped as an
  // authenticated body. A digest-only BOM can validate day-0 scaffolds but cannot materialize a
  // cross-version delta in an existing consumer. Artifact names are hex-only so npm cannot omit
  // dot-prefixed destinations such as .github/.npmrc while packing the corpus.
  const sha256 = (content) => createHash('sha256').update(content).digest('hex')
  const managedFileArtifactRoot = 'consumer/managed-files/'
  const managedFiles = {}
  const managedFileArtifacts = {}
  for (const [destination, source] of Object.entries(MANAGED_FILE_SOURCES).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    if (!existsSync(source)) throw new Error(`consumer managed file missing:${relative(ROOT, source)}`)
    const body = readFileSync(source)
    const digest = sha256(body)
    const artifact = `${managedFileArtifactRoot}${sha256(destination)}.blob`
    const output = join(outDir, artifact)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, body, { mode: statSync(source).mode & 0o777 })
    lockEntries.push({ file: artifact, sha256: digest, source: relative(ROOT, source), destination })
    managedFiles[destination] = digest
    managedFileArtifacts[destination] = artifact
  }

  // dispatcher manifest + lock
  manifest.consumer = {
    governanceLock: 'consumer/lock.json',
    governanceLockSchema: 'consumer/lock.schema.json',
    governanceCheck: 'consumer/governance-check.mjs',
    claudeMd: legacyInstructionBody && legacyInstructionSurface.instructionDestination !== sharedInstructionDestination
      ? legacyInstructionSurface.instructionDestination
      : null,
    compatibilityCategories: legacyInstructionProviderActive
      ? legacyDiscoveryCategories.map((category) => ({
          schemaVersion: 1,
          providerId: legacyInstructionProviderId,
          name: category.name,
          artifactRoot: category.artifactRoot,
          destinationRoot: category.destinationRoot,
          entries: [...category.entries],
        }))
      : [],
    commonInstruction: {
      schemaVersion: 1,
      artifact: sharedInstructionArtifact,
      destination: sharedInstructionDestination,
      materializerId: sharedInstructionMaterializerId,
    },
    launcherDestination: PRODUCT_LAUNCHER_DESTINATION,
    executionRuntime: structuredClone(productWiring.executionRuntime),
    managedFiles: managedFileArtifacts,
    materialization: {
      exactPaths: [...new Set([
        ...Object.keys(managedFileArtifacts),
        ...CONSUMER_CONTROL_PLANE_PATHS,
        sharedInstructionDestination,
        ...Object.values(manifest.providerSurfaces).filter((surface) => surface.generated).flatMap((surface) => [surface.instructionDestination, surface.hookDestination].filter(Boolean)),
        ...LAUNCHER_FILES.map((name) => `${PRODUCT_LAUNCHER_DESTINATION}/${name}`),
        ...(legacyInstructionProviderActive ? legacyDiscoveryCategories.flatMap((category) => (
          category.entries.map((name) => `${category.destinationRoot}/${name}`)
        )) : []),
      ])].sort(),
      pathPrefixes: [...new Set([
        ...Object.values(manifest.providerSurfaces).filter((surface) => surface.generated).flatMap((surface) => surface.skills.map((name) => `${surface.skillDestination}/${name}/`)),
        ...Object.values(manifest.providerSurfaces).filter((surface) => surface.generated).flatMap((surface) => surface.trees.map((tree) => `${tree.destination}/`)),
      ])].sort(),
    },
  }
  validateForkManifestProviderSurfaces(manifest, 'generated fork manifest')
  const manifestStr = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(outDir, 'manifest.json'), manifestStr)
  lockEntries.push({ file: 'manifest.json', sha256: createHash('sha256').update(manifestStr).digest('hex') })
  const normalizedLockEntries = lockEntries.map((entry) => ({
    schemaVersion: 1,
    file: entry.file,
    sha256: entry.sha256,
    source: entry.source || entry.sourceHook || null,
    classification: entry.bucket || null,
    destination: entry.destination || null,
  })).sort((a, b) => compareUtf8Bytes(a.file, b.file))
  const lockStr = JSON.stringify({
    schemaVersion: 1,
    kind: 'fork-governance-corpus-lock',
    hashAlgorithm: 'sha256',
    _purpose: 'sha256 of every shipped fork governance body + manifest (tamper-detect baseline)',
    entries: normalizedLockEntries,
  }, null, 2) + '\n'
  writeFileSync(join(outDir, 'governance.lock'), lockStr)

  // ── consumer immutable BOM / governance lock ──
  // Day-0 committed lock binds exact package versions to the generated instruction, hook and skill
  // projections. It contains no timestamp or branch so regeneration is reproducible. Runtime check
  // additionally verifies package-lock + installed payload; SessionStart only reports presence.
  const dsVersion = releaseVersion
  const sbVersion = releaseVersion
  if (releaseVersion === declaredDesignSystemVersion && declaredStorybookVersion !== declaredDesignSystemVersion) {
    throw new Error(`design-system/storybook release versions must match:${declaredDesignSystemVersion}:${declaredStorybookVersion}`)
  }
  const sharedSkillEntries = normalizedLockEntries
    .filter((entry) => entry.file.startsWith('skills/'))
    .map((entry) => `${entry.file}:${entry.sha256}`)
    .sort()
  const lockedTreeDigest = (prefix) => sha256(normalizedLockEntries
    .filter((entry) => entry.file.startsWith(`${prefix}/`))
    .map((entry) => `${entry.file}:${entry.sha256}`)
    .join('\n') + '\n')
  const providerArtifactDigests = Object.fromEntries(Object.entries(manifest.providerSurfaces)
    .sort(([left], [right]) => compareUtf8Bytes(left, right))
    .map(([providerId, surface]) => [providerId, {
      instructionSha256: surface.instructionArtifact ? sha256(readFileSync(join(outDir, surface.instructionArtifact))) : null,
      hookSha256: surface.hookArtifact ? sha256(readFileSync(join(outDir, surface.hookArtifact))) : null,
      skillsSha256: surface.skillArtifactRoot ? lockedTreeDigest(surface.skillArtifactRoot) : null,
      treeDigests: Object.fromEntries(surface.trees.map((tree) => [tree.name, lockedTreeDigest(tree.artifactRoot)])),
    }]))
  const mergeSurfaceDigests = Object.fromEntries(Object.entries(hookMergeSurfaces)
    .sort(([left], [right]) => compareUtf8Bytes(left, right))
    .map(([providerId, policy]) => [providerId, sha256(readFileSync(join(outDir, policy.hookArtifact)))]))
  const requiredScripts = Object.fromEntries(productWiring.requiredPackageScripts.map((name) => {
    const command = FORK_TPL_PACKAGE.scripts?.[name]
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error(`product provider wiring requires a missing template package script:${name}`)
    }
    return [name, command]
  }))
  const consumerLock = {
    $schema: './lock.schema.json',
    schemaVersion: 1,
    role: 'template-consumer',
    release: {
      designSystem: dsVersion,
      storybookConfig: sbVersion,
    },
    upgradeTrust: TRUSTED_UPGRADE_POLICY,
    upgradeProtocol: (() => {
      const loaded = loadConsumerUpgradeProtocol(
        CONSUMER_UPGRADE_PROTOCOL_PATH,
        CONSUMER_UPGRADE_PROTOCOL_SCHEMA_PATH,
        CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_PATH,
      )
      return protocolLockProjection(loaded.protocol, protocolSourceDigests(loaded))
    })(),
    payload: {
      forkCorpusLockSha256: sha256(lockStr),
      discoveryPolicySha256: sha256(JSON.stringify(manifest.discoveryPolicy)),
      providerMaterializersSha256: sha256(JSON.stringify(manifest.materializers)),
      providerLifecycleSha256: sha256(JSON.stringify(manifest.providerLifecycle)),
      providerInventorySha256: sha256(JSON.stringify(manifest.providerSurfaces)),
      executionRuntimeSha256: sha256(JSON.stringify(manifest.consumer.executionRuntime)),
      commonInstructionSha256: sha256(sharedInstructionBody),
      providerArtifactDigests,
      mergeSurfaceDigests,
      governanceCheckSha256: sha256(governanceCheckBody),
      utilityRegistrySha256: sha256(readFileSync(UTILITY_REGISTRY_PATH)),
      sharedSkillsSha256: sha256(sharedSkillEntries.join('\n') + '\n'),
      sharedSkillCount: manifest.skills.length,
      requiredScripts,
      managedFiles,
    },
    providers: Object.fromEntries(providerRegistry.providers.map((provider) => [provider.id, {
      schemaVersion: 1,
      generated: provider.adapter.generate,
      instruction: provider.instructionEntry,
      hooks: provider.hookConfig,
      skills: provider.skillDirectory,
      capabilities: {
        nativeHooks: provider.capabilities.nativeHooks,
        hookEnforcement: provider.capabilities.hookEnforcement,
        hardGate: 'provider-neutral-ci-required',
      },
      exclusions: provider.adapter.exclusions || [],
    }])),
    authority: 'provider-neutral governance check + protected CI',
    generatedBy: 'scripts/build-fork-governance.mjs',
  }
  const consumerLockSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Qijenchen consumer governance lock',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'schemaVersion', 'role', 'release', 'upgradeTrust', 'upgradeProtocol', 'payload', 'providers', 'authority', 'generatedBy'],
    properties: {
      $schema: { const: './lock.schema.json' },
      schemaVersion: { const: 1 },
      role: { const: 'template-consumer' },
      release: {
        type: 'object', additionalProperties: false, required: ['designSystem', 'storybookConfig'],
        properties: { designSystem: { type: 'string' }, storybookConfig: { type: 'string' } },
      },
      upgradeTrust: { const: TRUSTED_UPGRADE_POLICY },
      upgradeProtocol: {
        type: 'object', additionalProperties: false,
        required: [
          'schemaVersion', 'protocolId', 'legacyEntryMode', 'bootstrapEvidenceContract',
          'controlPlaneUpdateMode', 'controlPlaneUpdateEvidenceContract', 'controlPlaneUpdatePlanner',
          'ordinaryUpgradeMode', 'protectedBaseVerifier', 'candidateCodeExecutionAllowed',
          'physicalPowerLossDurabilityClaimed', 'specificationSha256', 'schemaSha256',
          'implementationSha256',
        ],
        properties: {
          schemaVersion: { const: 2 },
          protocolId: { const: 'protected-base-reconstruction-v2' },
          legacyEntryMode: { const: 'one-time-reviewed-full-snapshot-pr' },
          bootstrapEvidenceContract: { const: 'consumer-governance-bootstrap-readback-v1' },
          controlPlaneUpdateMode: { const: 'recurring-reviewed-full-snapshot-pr' },
          controlPlaneUpdateEvidenceContract: { const: 'consumer-governance-control-plane-update-readback-v1' },
          controlPlaneUpdatePlanner: { const: 'infra/governance/bin/consumerctl.mjs' },
          ordinaryUpgradeMode: { const: 'protected-base-disposable-reconstruction' },
          protectedBaseVerifier: { const: 'scripts/verify-upgrade-evidence.mjs' },
          candidateCodeExecutionAllowed: { const: false },
          physicalPowerLossDurabilityClaimed: { const: false },
          specificationSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          schemaSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          implementationSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      },
      payload: {
        type: 'object', additionalProperties: false,
        required: ['forkCorpusLockSha256', 'discoveryPolicySha256', 'providerMaterializersSha256', 'providerLifecycleSha256', 'providerInventorySha256', 'executionRuntimeSha256', 'commonInstructionSha256', 'providerArtifactDigests', 'mergeSurfaceDigests', 'governanceCheckSha256', 'utilityRegistrySha256', 'sharedSkillsSha256', 'sharedSkillCount', 'requiredScripts', 'managedFiles'],
        properties: {
          forkCorpusLockSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          discoveryPolicySha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          providerMaterializersSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          providerLifecycleSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          providerInventorySha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          executionRuntimeSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          commonInstructionSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          providerArtifactDigests: {
            type: 'object',
            minProperties: 1,
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              required: ['instructionSha256', 'hookSha256', 'skillsSha256', 'treeDigests'],
              properties: {
                instructionSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
                hookSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
                skillsSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
                treeDigests: {
                  type: 'object',
                  additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                },
              },
            },
          },
          mergeSurfaceDigests: {
            type: 'object',
            additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
          governanceCheckSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          utilityRegistrySha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          sharedSkillsSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          sharedSkillCount: { type: 'integer', minimum: 0 },
          requiredScripts: { type: 'object', minProperties: 1, additionalProperties: { type: 'string', minLength: 1 } },
          managedFiles: { type: 'object', minProperties: 1, additionalProperties: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
        },
      },
      providers: {
        type: 'object',
        minProperties: 1,
        additionalProperties: {
          type: 'object',
          additionalProperties: false,
          required: ['schemaVersion', 'generated', 'instruction', 'hooks', 'skills', 'capabilities', 'exclusions'],
          properties: {
            schemaVersion: { const: 1 },
            generated: { type: 'boolean' },
            instruction: { type: 'string', minLength: 1 },
            hooks: { type: ['string', 'null'] },
            skills: { type: 'string', minLength: 1 },
            capabilities: {
              type: 'object',
              additionalProperties: false,
              required: ['nativeHooks', 'hookEnforcement', 'hardGate'],
              properties: {
                nativeHooks: { type: 'boolean' },
                hookEnforcement: { enum: ['native-feedback-plus-ci', 'ci-only'] },
                hardGate: { const: 'provider-neutral-ci-required' },
              },
            },
            exclusions: { type: 'array' },
          },
        },
      },
      authority: { const: 'provider-neutral governance check + protected CI' },
      generatedBy: { const: 'scripts/build-fork-governance.mjs' },
    },
  }
  const templateGovernanceDir = join(templateRoot, 'governance')
  mkdirSync(templateGovernanceDir, { recursive: true })
  const consumerLockStr = JSON.stringify(consumerLock, null, 2) + '\n'
  const consumerLockSchemaStr = JSON.stringify(consumerLockSchema, null, 2) + '\n'
  writeFileSync(join(corpusConsumerDir, 'lock.json'), consumerLockStr)
  writeFileSync(join(corpusConsumerDir, 'lock.schema.json'), consumerLockSchemaStr)
  writeFileSync(join(templateGovernanceDir, 'lock.json'), consumerLockStr)
  writeFileSync(join(templateGovernanceDir, 'lock.schema.json'), consumerLockSchemaStr)
  for (const destination of TEMPLATE_GOVERNANCE_PROJECTIONS) {
    const target = join(templateRoot, destination)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(MANAGED_FILE_SOURCES[destination], target)
  }
  for (const destination of TEMPLATE_SCHEMA_PROJECTIONS) {
    const target = join(templateRoot, destination)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(MANAGED_FILE_SOURCES[destination], target)
  }

  // ── committed scaffold ──
  // Commands remain a Claude-specific discovery view. Skills, instructions and hook configs are
  // installed from manifest.providerSurfaces for every enabled provider, with no provider list in
  // this generator. Product-owned additions belong in governance/overlay.md.
  if (legacyInstructionProviderActive) {
    for (const category of legacyDiscoveryCategories) for (const entry of category.entries) {
      const destination = join(templateRoot, category.destinationRoot, entry)
      mkdirSync(dirname(destination), { recursive: true })
      cpSync(join(outDir, category.artifactRoot, entry), destination)
    }
  }
  mkdirSync(templateRoot, { recursive: true })
  cpSync(join(outDir, sharedInstructionArtifact), join(templateRoot, sharedInstructionDestination))
  for (const surface of Object.values(manifest.providerSurfaces).filter((item) => item.generated)) {
    if (surface.instructionMaterializerId !== sharedInstructionMaterializerId) {
      const instructionDest = join(templateRoot, surface.instructionDestination)
      mkdirSync(dirname(instructionDest), { recursive: true })
      cpSync(join(outDir, surface.instructionArtifact), instructionDest)
    }

    if (surface.hookDestination) {
      const hookDest = join(templateRoot, surface.hookDestination)
      mkdirSync(dirname(hookDest), { recursive: true })
      cpSync(join(outDir, surface.hookArtifact), hookDest)
    }

    const skillsSrc = join(outDir, surface.skillArtifactRoot)
    const skillsDest = join(templateRoot, surface.skillDestination)
    if (existsSync(skillsDest)) rmSync(skillsDest, { recursive: true, force: true })
    mkdirSync(dirname(skillsDest), { recursive: true })
    cpSync(skillsSrc, skillsDest, { recursive: true })

    for (const tree of surface.trees) {
      const treeSrc = join(outDir, tree.artifactRoot)
      const treeDest = join(templateRoot, tree.destination)
      if (existsSync(treeDest)) rmSync(treeDest, { recursive: true, force: true })
      mkdirSync(dirname(treeDest), { recursive: true })
      cpSync(treeSrc, treeDest, { recursive: true })
    }
  }

  for (const path of compatibilityTreeTombstones) {
    const tombstone = join(templateRoot, path)
    if (existsSync(tombstone)) rmSync(tombstone, { recursive: true, force: true })
  }
  if (
    genesisTransition.state === CONTROL_PLANE_GENESIS_OPEN_STATE
    && compatibilityTreeTombstones.includes('.claude/hooks')
  ) {
    const hooks = genesisMaterializations.get('template/ds-product-template/.claude/hooks')
    if (!hooks || hooks.kind !== 'tree' || hooks.leaves.length !== hooks.leafCount) {
      throw new Error('Genesis template hook tree is absent from the authenticated transition')
    }
    const hookRoot = join(templateRoot, '.claude/hooks')
    for (const leaf of hooks.leaves) {
      const target = join(hookRoot, leaf.relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, leaf.bytes, { mode: leaf.mode === '100755' ? 0o755 : 0o644 })
    }
  }
  const templateLaunchers = join(templateRoot, PRODUCT_LAUNCHER_DESTINATION)
  if (existsSync(templateLaunchers)) rmSync(templateLaunchers, { recursive: true, force: true })
  mkdirSync(templateLaunchers, { recursive: true })
  for (const launcher of LAUNCHER_FILES) cpSync(LAUNCHER_SOURCE_BY_NAME[launcher], join(templateLaunchers, launcher))

  assertConsumerRoleSurface(templateRoot, outDir, manifest)

  return { manifest, lockEntries: normalizedLockEntries, count: normalizedLockEntries.length - 1 }
}

export function collectForkGovernanceDrift({
  manifest,
  actualOut,
  expectedOut,
  actualTemplate,
  expectedTemplate,
  providerRegistry = PROVIDER_REGISTRY,
}) {
  const providerViewDrift = Object.values(manifest.providerSurfaces).filter((surface) => surface.generated).flatMap((surface) => [
    ...(manifest.materializers.instructionViews[surface.instructionMaterializerId].engine === 'shared-instruction-v1'
      ? []
      : compareTrees(`template/${surface.instructionDestination}`, join(actualTemplate, surface.instructionDestination), join(expectedTemplate, surface.instructionDestination))),
    ...(surface.hookDestination ? compareTrees(`template/${surface.hookDestination}`, join(actualTemplate, surface.hookDestination), join(expectedTemplate, surface.hookDestination)) : []),
    ...compareTrees(`template/${surface.skillDestination}`, join(actualTemplate, surface.skillDestination), join(expectedTemplate, surface.skillDestination)),
    ...surface.trees.flatMap((tree) => compareTrees(`template/${tree.destination}`, join(actualTemplate, tree.destination), join(expectedTemplate, tree.destination))),
  ])
  return [
    ...compareTrees('packages/design-system/ds-canonical/fork', actualOut, expectedOut),
    ...compareTrees(
      `template/${manifest.consumer.commonInstruction.destination}`,
      join(actualTemplate, manifest.consumer.commonInstruction.destination),
      join(expectedTemplate, manifest.consumer.commonInstruction.destination),
    ),
    ...providerViewDrift,
    ...manifest.consumer.compatibilityCategories.flatMap((category) => category.entries.flatMap((entry) => compareTrees(
      `template/${category.destinationRoot}/${entry}`,
      join(actualTemplate, category.destinationRoot, entry),
      join(expectedTemplate, category.destinationRoot, entry),
    ))),
    ...providerRegistry.canonical.compatibilityProjections.legacyClaudeInstruction.legacyProductTreeTombstones.flatMap((path) => compareTrees(
      `template/${path}`,
      join(actualTemplate, path),
      join(expectedTemplate, path),
    )),
    ...compareTrees('template/governance', join(actualTemplate, 'governance'), join(expectedTemplate, 'governance')),
    ...TEMPLATE_SCHEMA_PROJECTIONS.flatMap((path) => compareTrees(
      `template/${path}`,
      join(actualTemplate, path),
      join(expectedTemplate, path),
    )),
  ]
}

const IS_MAIN = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (IS_MAIN && CHECK) {
  const genesisTransition = loadControlPlaneGenesisTransition({ root: ROOT })
  assertGenesisScriptsAlias(genesisTransition)
  // Pure check:只在系統 temp tree 生成，絕不先覆寫真實 generated outputs。
  // 比對完整檔案集合、內容與 mode；missing / extra / tamper 任一都 fail。
  const tempRoot = canonicalRepositoryRoot(mkdtempSync(join(tmpdir(), 'fork-governance-check-')))
  const tempOut = join(tempRoot, 'fork')
  const tempTemplate = join(tempRoot, 'template')

  try {
    const r = buildCorpus({ outDir: tempOut, templateRoot: tempTemplate })
    const realTemplate = dirname(TPL_CLAUDE)
    const drift = collectForkGovernanceDrift({
      manifest: r.manifest,
      actualOut: OUT_DIR,
      expectedOut: tempOut,
      actualTemplate: realTemplate,
      expectedTemplate: tempTemplate,
    })
    if (drift.length) {
      console.error('❌ FORK-GOVERNANCE DRIFT:真實生成物與 temp 重生結果不一致；`--check` 未修改工作樹。')
      for (const item of drift) console.error(`   - ${item}`)
      process.exitCode = 1
    } else {
      console.log(`✅ fork-governance --check PASS(pure/read-only):完整 tree + mode/hash 一致（${r.count} 個 fork 治理檔）`)
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
} else if (IS_MAIN) {
  const genesisTransition = loadControlPlaneGenesisTransition({ root: ROOT })
  generateGenesisScriptsAlias(genesisTransition, genesisPreservationMap(genesisTransition))
  const r = buildCorpus()
  const tally = cls._meta.tally
  console.log(`✅ fork governance corpus 生成 → packages/design-system/ds-canonical/fork/`)
  console.log(`   hooks:ship-as-is ${tally.SHIP_AS_IS} / rewritten ${tally.SHIP_REWRITTEN} / replaced ${tally.REPLACE} / dropped ${tally.DROP}`)
  console.log(`   skills(${r.manifest.skills.length}): ${r.manifest.skills.join(', ') || '—'}`)
  console.log(`   commands(${r.manifest.commands.length}) / agents(${r.manifest.agents.length})`)
  console.log(`   → ${r.count} 個 fork 治理檔 + manifest.json + governance.lock(sha256 tamper baseline）`)
  const evs = Object.keys(r.manifest.hooks)
  console.log(`   hook events: ${evs.map((e) => `${e}(${r.manifest.hooks[e].length})`).join(' / ')}`)
}
