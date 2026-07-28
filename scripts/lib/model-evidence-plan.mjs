import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  digestInventorySelection,
  sha256,
  stableStringify,
} from './deep-audit-evidence-contract.mjs'
import { buildComponentClaimReceipt } from './component-claim-inventory.mjs'
import {
  buildBrokerApiRequest,
  selectBrokerApiResult,
  selectBrokerResultWithSelector,
  validateBrokerApiProfile,
  validateImmutableModelForProfile,
  validateProviderResponseSelector,
} from './model-api-transport.mjs'
import { loadModelReleaseRegistry, resolvePromotionEligibleModelRelease } from './model-release-registry.mjs'
import { verifyProviderCliRuntimeForCertification } from '../setup-provider-cli-toolchain.mjs'

export {
  buildBrokerApiRequest,
  loadModelReleaseRegistry,
  resolvePromotionEligibleModelRelease,
  selectBrokerApiResult,
  selectBrokerResultWithSelector,
  validateBrokerApiProfile,
  validateImmutableModelForProfile,
  validateProviderResponseSelector,
}

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ROOT = resolve(SCRIPT_ROOT, '..')
export const DEFAULT_MODEL_EVIDENCE_PLAN = 'infra/governance/model-evidence-plan.json'
export const DEFAULT_MODEL_INVOCATION_PROFILES = 'infra/governance/providers/model-invocation-profiles.json'
export const DEFAULT_MODEL_RESULT_SCHEMA = 'infra/governance/schemas/model-deep-audit-result.schema.json'
const PLACEHOLDER = /^\{(?:model|resultSchemaJson|sessionId|emptyMcpConfig|resultSchemaPath|resultOutputPath|snapshotRoot)\}$/
const EXTERNAL_ENTITLEMENT_PLACEHOLDER =
  /^\{(?:model|effort|emptyTools|resultSchemaJson|systemPrompt|emptyMcpConfig)\}$/

function fail(message) {
  throw new Error(`model evidence plan blocked:${message}`)
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (stableStringify(actual) !== stableStringify(expected)) fail(`${label} has an invalid or open shape`)
}

function pointerGet(document, pointer, label) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) fail(`${label} pointer is invalid`)
  let current = document
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!current || typeof current !== 'object' || Array.isArray(current)
      || !Object.hasOwn(current, key)) {
      fail(`${label} pointer is absent:${pointer}`)
    }
    current = current[key]
  }
  return current
}

function canonicalJsonEquals(value, encoded, label) {
  let expected
  try { expected = JSON.parse(encoded) } catch (error) { fail(`${label} expected value is invalid JSON:${error.message}`) }
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(`${label} does not match the exact certified readback`)
}

export function validateExternalEntitlementDeploymentAdapter(profile, {
  forbiddenArguments = [],
} = {}) {
  const adapter = profile?.deploymentAdapter
  exactKeys(adapter, [
    'schemaVersion',
    'kind',
    'executable',
    'authentication',
    'authStatusArguments',
    'versionArguments',
    'authReadback',
    'promptTransport',
    'resultTransport',
    'arguments',
    'providerRunIdPointer',
    'resultPointer',
    'terminalPredicates',
    'observedModelPolicy',
    'modelUsagePointer',
    'repositoryIsolation',
    'environmentPolicy',
    'sessionPersistence',
    'fallbackPolicy',
    'effortByComputeTier',
    'timeoutSeconds',
  ], 'external entitlement deployment adapter')
  exactKeys(adapter.authReadback, [
    'loggedInPointer',
    'loggedInCanonicalJson',
    'authMethodPointer',
    'authMethodCanonicalJson',
    'entitlementPointer',
    'entitlementCanonicalJson',
  ], 'external entitlement auth readback')
  exactKeys(adapter.effortByComputeTier, [
    'standard',
    'high',
    'maximum',
  ], 'external entitlement effort mapping')
  if (adapter.schemaVersion !== 1
    || adapter.kind !== 'first-party-subscription-cli-content-exchange-v1'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(adapter.executable ?? '')
    || adapter.authentication !== 'first-party-subscription-account'
    || stableStringify(adapter.authStatusArguments) !== stableStringify(['auth', 'status', '--json'])
    || stableStringify(adapter.versionArguments) !== stableStringify(['--version'])
    || adapter.promptTransport !== 'stdin'
    || adapter.resultTransport !== 'stdout-json-structured-output'
    || adapter.observedModelPolicy !== 'exactly-one-model-usage-key-equals-requested-model'
    || adapter.repositoryIsolation !== 'private-empty-working-directory-no-repository-mount'
    || adapter.environmentPolicy !== 'closed-first-party-subscription-no-api-credentials'
    || adapter.sessionPersistence !== 'disabled'
    || adapter.fallbackPolicy !== 'forbidden'
    || adapter.effortByComputeTier.maximum !== 'max'
    || !['medium', 'high', 'xhigh', 'max'].includes(adapter.effortByComputeTier.standard)
    || !['high', 'xhigh', 'max'].includes(adapter.effortByComputeTier.high)
    || !Number.isSafeInteger(adapter.timeoutSeconds)
    || adapter.timeoutSeconds < 60
    || adapter.timeoutSeconds > 14400) {
    fail('external entitlement deployment adapter is not a closed first-party content-only route')
  }
  if (!Array.isArray(adapter.terminalPredicates)
    || adapter.terminalPredicates.length === 0
    || new Set(adapter.terminalPredicates.map((item) => item?.pointer)).size
      !== adapter.terminalPredicates.length) {
    fail('external entitlement deployment adapter terminal predicates are invalid')
  }
  for (const [index, predicate] of adapter.terminalPredicates.entries()) {
    exactKeys(predicate, ['pointer', 'canonicalJson'], `external entitlement terminal predicate ${index}`)
    canonicalJsonEquals(JSON.parse(predicate.canonicalJson), predicate.canonicalJson,
      `external entitlement terminal predicate ${index}`)
  }
  const args = adapter.arguments
  if (!Array.isArray(args) || args.length === 0
    || args.some((token) => typeof token !== 'string' || /[\0\r\n]/.test(token))
    || args.some((token) => forbiddenArguments.includes(token))) {
    fail('external entitlement deployment adapter arguments are unsafe')
  }
  const placeholders = args.filter((token) => token.startsWith('{') || token.endsWith('}'))
  const requiredPlaceholders = [
    '{model}',
    '{effort}',
    '{emptyTools}',
    '{resultSchemaJson}',
    '{systemPrompt}',
    '{emptyMcpConfig}',
  ]
  if (placeholders.some((token) => !EXTERNAL_ENTITLEMENT_PLACEHOLDER.test(token))
    || requiredPlaceholders.some((token) => placeholders.filter((value) => value === token).length !== 1)) {
    fail('external entitlement deployment adapter placeholder closure is invalid')
  }
  const forbiddenRouteArguments = new Set([
    '--add-dir',
    '--allow-dangerously-skip-permissions',
    '--allowedTools',
    '--allowed-tools',
    '--bare',
    '--chrome',
    '--continue',
    '--dangerously-skip-permissions',
    '--fallback-model',
    '--file',
    '--from-pr',
    '--plugin-dir',
    '--plugin-url',
    '--remote-control',
    '--resume',
    '--session-id',
    '--worktree',
  ])
  if (args.some((token) => forbiddenRouteArguments.has(token))) {
    fail('external entitlement deployment adapter enables fallback, repository, plugin, or persistent-session capability')
  }
  for (const token of [
    '-p',
    '--model',
    '--effort',
    '--permission-mode',
    '--tools',
    '--disallowedTools',
    '--no-session-persistence',
    '--output-format',
    '--json-schema',
    '--system-prompt',
    '--strict-mcp-config',
    '--mcp-config',
    '--safe-mode',
    '--no-chrome',
    '--disable-slash-commands',
  ]) {
    if (args.filter((value) => value === token).length !== 1) {
      fail(`external entitlement deployment adapter omits or repeats required safety argument:${token}`)
    }
  }
  if (args[args.indexOf('--tools') + 1] !== '{emptyTools}'
    || args[args.indexOf('--mcp-config') + 1] !== '{emptyMcpConfig}'
    || args[args.indexOf('--model') + 1] !== '{model}'
    || args[args.indexOf('--effort') + 1] !== '{effort}'
    || args[args.indexOf('--json-schema') + 1] !== '{resultSchemaJson}'
    || args[args.indexOf('--system-prompt') + 1] !== '{systemPrompt}'
    || args[args.indexOf('--output-format') + 1] !== 'json'
    || args[args.indexOf('--permission-mode') + 1] !== 'plan') {
    fail('external entitlement deployment adapter dynamic/safety argument pairing is invalid')
  }
  return adapter
}

function repositoryFile(root, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label} path is unsafe`)
  const absoluteRoot = realpathSync(resolve(root))
  const absolute = resolve(absoluteRoot, path)
  const rel = relative(absoluteRoot, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository`)
  let cursor = absoluteRoot
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor === absolute && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be a unique regular file:${path}`)
  }
  return absolute
}

function readJson(root, path, label) {
  const bytes = readFileSync(repositoryFile(root, path, label))
  if (bytes.length === 0) fail(`${label} is empty`)
  try { return { value: JSON.parse(bytes), bytes } } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

function validateSchema(root, value, schemaPath, label) {
  const schema = readJson(root, schemaPath, `${label} schema`).value
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(value)) fail(`${label} schema validation failed:${new Ajv2020().errorsText(validate.errors)}`)
}

function matrixJudgmentDimensions(root, path) {
  const source = readFileSync(repositoryFile(root, path, 'audit coverage matrix'), 'utf8')
  const records = []
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+):\s*\{\s*tier:\s*'([^']+)',\s*mechanism:\s*(.+?)\s*\},?\s*$/)
    if (!match) continue
    const literal = match[3].match(/^'((?:\\.|[^'])*)'$/)
    records.push({ dim: Number(match[1]), tier: match[2], mechanism: literal ? literal[1].replaceAll("\\'", "'") : match[3] })
  }
  if (records.length !== 91 || records.some((record, index) => record.dim !== index + 1)) fail('audit matrix must enumerate dimensions 1..91 exactly once')
  return records.filter((record) => record.tier === 'PURE-JUDGMENT')
}

export function loadModelEvidencePlan({ repoRoot = DEFAULT_ROOT, planPath = DEFAULT_MODEL_EVIDENCE_PLAN } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const read = readJson(root, planPath, 'model evidence plan')
  validateSchema(root, read.value, 'infra/governance/schemas/model-evidence-plan.schema.json', 'model evidence plan')
  const plan = read.value
  exactKeys(plan, ['$schema', 'schemaVersion', 'evidenceKind', 'matrixSource', 'judgment', 'componentA1b', 'reviewGraph', 'promptContract'], 'model evidence plan')
  const matrix = matrixJudgmentDimensions(root, plan.matrixSource)
  const expected = matrix.map(({ dim }) => ({ dim, ruleId: `DS-DIM-${String(dim).padStart(3, '0')}` }))
  if (stableStringify(plan.judgment.dimensions) !== stableStringify(expected)) {
    fail(`judgment plan must exactly enumerate all PURE-JUDGMENT dimensions:${expected.map((item) => item.dim).join(',')}`)
  }
  return {
    root,
    path: repositoryFile(root, planPath, 'model evidence plan'),
    plan,
    planDigest: sha256(read.bytes),
    judgmentDimensions: matrix,
    judgmentByDimension: new Map(matrix.map((record) => [record.dim, record])),
  }
}

export function loadModelInvocationProfiles({ repoRoot = DEFAULT_ROOT, profilePath = DEFAULT_MODEL_INVOCATION_PROFILES } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const releaseState = loadModelReleaseRegistry({ repoRoot: root })
  const read = readJson(root, profilePath, 'model invocation profiles')
  validateSchema(root, read.value, 'infra/governance/schemas/model-invocation-profiles.schema.json', 'model invocation profiles')
  const registry = read.value
  exactKeys(registry, ['$schema', 'schemaVersion', 'evidenceKind', 'profiles', 'externalEntitlementProfiles', 'legacyUntrustedProfiles', 'forbiddenArguments'], 'model invocation profiles')
  const forbidden = new Set(registry.forbiddenArguments)
  const validateOrderAndEgress = (profiles, expectedMode) => {
    const providerIds = Object.keys(profiles)
    if (stableStringify(providerIds) !== stableStringify([...providerIds].sort())) fail(`${expectedMode} invocation profiles must be ordered by provider id`)
    for (const [id, profile] of Object.entries(profiles)) {
      if (profile.providerId !== id) fail(`invocation profile key/provider mismatch:${id}`)
      if (profile.mode !== expectedMode) fail(`invocation profile mode is invalid:${id}`)
      if (!Number.isSafeInteger(profile.timeoutSeconds) || profile.timeoutSeconds < 60 || profile.timeoutSeconds > 14400) fail(`invocation profile timeout is unsafe:${id}`)
      if (!Array.isArray(profile.egressAllowedHosts) || profile.egressAllowedHosts.length === 0
        || new Set(profile.egressAllowedHosts).size !== profile.egressAllowedHosts.length
        || profile.egressAllowedHosts.some((host) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
        || stableStringify(profile.egressAllowedHosts) !== stableStringify([...profile.egressAllowedHosts].sort())) {
        fail(`invocation profile egress hosts are invalid or not canonical:${id}`)
      }
    }
  }
  validateOrderAndEgress(registry.profiles, 'broker-content-only')
  for (const [id, profile] of Object.entries(registry.profiles)) {
    validateBrokerApiProfile(profile, { providerId: id })
    if (profile.transportKind !== 'provider-https-json-api'
      || profile.repositoryAccess !== 'forbidden'
      || profile.toolAccess !== 'none-tools-field-omitted'
      || profile.workingDirectory !== 'not-applicable-repository-unmounted'
      || profile.endpoint?.scheme !== 'https' || profile.endpoint?.method !== 'POST'
      || stableStringify(profile.egressAllowedHosts) !== stableStringify([profile.endpoint.host])
      || profile.credential?.mode !== 'managed-oidc-secret-broker'
      || profile.request?.toolsPolicy !== 'field-omitted' || profile.request?.stream !== false
      || profile.response?.uniqueness !== 'exactly-one-per-level') {
      fail(`broker API profile is not closed, no-tools, repository-unmounted, and exact-egress:${id}`)
    }
    const injectionPointers = [
      profile.request.modelPointer,
      profile.request.instructionPointer,
      profile.request.dataPointer,
      profile.request.resultSchemaPointer,
    ]
    if (new Set(injectionPointers).size !== injectionPointers.length
      || injectionPointers.some((pointer) => pointer === '/tools' || pointer.startsWith('/tools/'))) {
      fail(`broker API request injection pointers are ambiguous or expose tools:${id}`)
    }
    const fixedPointers = profile.request.fixedFields.map((item) => item.pointer)
    if (new Set(fixedPointers).size !== fixedPointers.length
      || fixedPointers.some((pointer) => injectionPointers.includes(pointer) || pointer === '/tools' || pointer.startsWith('/tools/'))) {
      fail(`broker API fixed fields collide with dynamic/tool fields:${id}`)
    }
    for (const item of profile.request.fixedFields) {
      let decoded
      try { decoded = JSON.parse(item.canonicalJson) } catch (error) { fail(`broker API fixed field is not JSON:${id}:${error.message}`) }
      if (JSON.stringify(decoded) !== item.canonicalJson) fail(`broker API fixed field is not canonical JSON:${id}:${item.pointer}`)
    }
    const staticNames = profile.staticHeaders.map((item) => item.name)
    if (new Set(staticNames).size !== staticNames.length || staticNames.includes(profile.credential.header)) {
      fail(`broker API static headers collide with the brokered credential:${id}`)
    }
    for (const releaseId of profile.modelIdentity.allowedModelReleaseIds) {
      const record = releaseState.byId.get(releaseId)
      if (!record || record.providerId !== id) fail(`broker API profile references an absent/foreign model release:${id}:${releaseId}`)
    }
  }
  const externalProfileIds = Object.keys(registry.externalEntitlementProfiles)
  if (stableStringify(externalProfileIds) !== stableStringify([...externalProfileIds].sort())) {
    fail('external entitlement invocation profiles must be ordered by invocation profile id')
  }
  for (const [id, profile] of Object.entries(registry.externalEntitlementProfiles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)
      || !/^[a-z][a-z0-9-]*$/.test(profile.providerId ?? '')
      || profile.mode !== 'external-subscription-entitlement'
      || profile.routeClass !== 'subscription-entitlement'
      || !/^[a-z][a-z0-9-]*$/.test(profile.entitlementId ?? '')
      || profile.repositoryAccess !== 'forbidden-direct-review-bundle-only'
      || profile.toolAccess !== 'none'
      || profile.workingDirectory !== 'not-applicable-content-addressed-exchange'
      || profile.availabilityPolicy !== 'exact-certified-entitlement-readback-required'
      || profile.runtimeCertification !== 'required-not-source-certified'
      || profile.costFallbackPolicy !== 'forbidden') {
      fail(`external entitlement invocation profile is not a closed content-addressed review route:${id}`)
    }
    validateExternalEntitlementDeploymentAdapter(profile, {
      forbiddenArguments: registry.forbiddenArguments,
    })
    validateProviderResponseSelector({
      providerId: profile.providerId,
      modelIdentity: profile.modelIdentity,
      responseSelector: profile.responseSelector,
    })
    for (const releaseId of profile.modelIdentity.allowedModelReleaseIds) {
      const record = releaseState.byId.get(releaseId)
      if (!record || record.providerId !== profile.providerId) {
        fail(`external entitlement invocation profile references an absent/foreign model release:${id}:${releaseId}`)
      }
    }
  }
  validateOrderAndEgress(registry.legacyUntrustedProfiles, 'legacy-untrusted-local')
  for (const [id, profile] of Object.entries(registry.legacyUntrustedProfiles)) {
    if (typeof profile.executable !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile.executable)) fail(`legacy invocation profile executable is unsafe:${id}`)
    if (profile.arguments.some((token) => /[\0\r\n]/.test(token))) fail(`legacy invocation profile contains control characters:${id}`)
    if (profile.arguments.some((token) => forbidden.has(token))) fail(`legacy invocation profile contains a forbidden argument:${id}`)
    for (const token of profile.arguments.filter((value) => value.startsWith('{') || value.endsWith('}'))) {
      if (!PLACEHOLDER.test(token)) fail(`legacy invocation profile has an unknown placeholder:${id}:${token}`)
    }
    if (profile.repositoryAccess !== 'read-only-disposable-snapshot'
      || profile.toolAccess !== 'read-grep-glob' || profile.workingDirectory !== 'disposable-snapshot') {
      fail(`legacy invocation profile does not declare untrusted snapshot access:${id}`)
    }
  }
  return {
    root,
    registry,
    profiles: registry.profiles,
    externalEntitlementProfiles: registry.externalEntitlementProfiles,
    legacyUntrustedProfiles: registry.legacyUntrustedProfiles,
    profileDigest: sha256(read.bytes),
    brokerProfileDigest: sha256(stableStringify(registry.profiles)),
    releaseState,
  }
}

export function validateExplicitModel(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) || !/\d/.test(value)
    || /(?:^|[._:-])(?:latest|default|auto|model|placeholder)(?:$|[._:-])/i.test(value)) {
    fail('model must be an explicit immutable identifier without an alias or placeholder token')
  }
  return value
}

export function expandJudgmentCoverage(manifest) {
  const rubric = new Set(manifest.rubricPaths)
  const inventoryPaths = manifest.inventory
    .filter((row) => row.kind !== 'missing' && (row.path.startsWith('packages/design-system/') || rubric.has(row.path)))
    .map((row) => row.path)
    .sort()
  if (inventoryPaths.length === 0) fail('judgment coverage is empty')
  return { inventoryPaths, inventoryDigest: digestInventorySelection(manifest, inventoryPaths), filesScanned: inventoryPaths.length }
}

export function expandComponentA1bCoverage(manifest, component) {
  const record = manifest.components.find((item) => item.name === component)
  if (!record) fail(`component is absent from active manifest:${component}`)
  return { inventoryPaths: record.paths, inventoryDigest: record.digest, filesScanned: record.paths.length }
}

export function renderInvocationArguments(profile, values, forbiddenArguments) {
  const args = profile.arguments.map((token) => PLACEHOLDER.test(token) ? values[token.slice(1, -1)] : token)
  if (args.some((token) => typeof token !== 'string' || !token || /[\0\r\n]/.test(token))) fail('rendered invocation arguments are incomplete or unsafe')
  if (args.some((token) => forbiddenArguments.includes(token))) fail('rendered invocation contains a forbidden argument')
  return args
}

function externalEntitlementAuthDigest(adapter, authReadback) {
  const observations = {
    loggedIn: pointerGet(
      authReadback,
      adapter.authReadback.loggedInPointer,
      'external entitlement logged-in readback',
    ),
    authMethod: pointerGet(
      authReadback,
      adapter.authReadback.authMethodPointer,
      'external entitlement auth-method readback',
    ),
    entitlement: pointerGet(
      authReadback,
      adapter.authReadback.entitlementPointer,
      'external entitlement subscription readback',
    ),
  }
  canonicalJsonEquals(
    observations.loggedIn,
    adapter.authReadback.loggedInCanonicalJson,
    'external entitlement logged-in readback',
  )
  canonicalJsonEquals(
    observations.authMethod,
    adapter.authReadback.authMethodCanonicalJson,
    'external entitlement auth-method readback',
  )
  canonicalJsonEquals(
    observations.entitlement,
    adapter.authReadback.entitlementCanonicalJson,
    'external entitlement subscription readback',
  )
  return sha256(stableStringify(observations))
}

function externalEntitlementInvocationProjection(plan) {
  const { invocationDigest: ignoredInvocationDigest, stdin: ignoredStdin, ...projection } = plan
  return projection
}

function externalRuntimeAuthorityProjection(capability) {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)
    || typeof capability.command !== 'string' || !isAbsolute(capability.command)
    || !Array.isArray(capability.argsPrefix) || capability.argsPrefix.length !== 1
    || typeof capability.argsPrefix[0] !== 'string'
    || !isAbsolute(capability.argsPrefix[0])
    || typeof capability.target !== 'string' || !isAbsolute(capability.target)) {
    fail('external entitlement runtime executable authority is invalid')
  }
  exactKeys(capability.binding, [
    'activePackageContentDigest',
    'authorityDigest',
    'executable',
    'lockDigest',
    'packageContentProtocol',
    'platform',
    'shimPath',
    'shimSha256',
    'targetPath',
    'targetSha256',
  ], 'external entitlement runtime executable binding')
  return {
    command: capability.command,
    argsPrefix: [...capability.argsPrefix],
    target: capability.target,
    binding: structuredClone(capability.binding),
    bindingDigest: sha256(stableStringify(capability.binding)),
  }
}

function pathClassForAbsolutePath(path) {
  return /\s/u.test(path) ? 'contains-space' : 'no-space'
}

function externalRuntimeTarget(target) {
  exactKeys(target, [
    'id',
    'operatingSystem',
    'platform',
    'arch',
    'executionEnvironment',
    'distributionVersion',
    'pathClass',
  ], 'external entitlement runtime target')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(target.id ?? '')
    || Object.entries(target).some(([key, value]) => (
      key !== 'id' && (typeof value !== 'string' || !value)
    ))
    || !['no-space', 'contains-space'].includes(target.pathClass)) {
    fail('external entitlement runtime target is invalid')
  }
  return structuredClone(target)
}

function exactExternalReadback({
  invocationPlan,
  adapter,
  environment,
  workingDirectory,
  args,
  label,
} = {}) {
  const result = spawnSync(invocationPlan.command, [
    ...invocationPlan.runtimeExecutableAuthority.argsPrefix,
    ...args,
  ], {
    cwd: workingDirectory,
    env: environment,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: Math.min(invocationPlan.timeoutSeconds * 1000, 30_000),
    maxBuffer: 1024 * 1024,
  })
  if (result.error
    || result.status !== 0
    || result.signal !== null
    || typeof result.stdout !== 'string'
    || typeof result.stderr !== 'string'
    || result.stderr.trim() !== '') {
    fail(`external entitlement ${label} readback did not complete through the certified executable`)
  }
  return result.stdout.trim()
}

function externalBatchSystemPrompt(request) {
  if (request?.requestKind !== 'review-work-batch'
    || !Array.isArray(request.members) || request.members.length === 0
    || request.memberCount !== request.members.length) {
    fail('external entitlement request is not a canonical review-work batch')
  }
  const memberInstructions = request.members.map((member, memberOrdinal) => {
    const instructions = member?.instructions
    if (member.memberOrdinal !== memberOrdinal
      || typeof instructions?.canonicalText !== 'string'
      || !instructions.canonicalText
      || instructions.bytes !== Buffer.byteLength(instructions.canonicalText)
      || instructions.sha256 !== sha256(instructions.canonicalText)) {
      fail(`external entitlement batch member instructions are stale:${memberOrdinal}`)
    }
    return {
      memberOrdinal,
      unitId: member.unitId,
      unitDigest: member.unitDigest,
      instructionsSha256: instructions.sha256,
    }
  })
  return stableStringify({
    schemaVersion: 1,
    kind: 'provider-neutral-review-batch-system-authority',
    protocol: request.protocol,
    requestDigest: request.requestDigest,
    requestBatchId: request.requestBatchId,
    memberInstructionSetDigest: sha256(stableStringify(memberInstructions)),
    instruction:
      'Evaluate every ordered member exactly once using only its canonical member instructions and the content-addressed request evidence. Return only the exact batch result schema.',
  })
}

export function readExternalEntitlementRuntimePreflight({
  profile,
  repoRoot = DEFAULT_ROOT,
  environment,
  workingDirectory,
  runtimeTarget,
  forbiddenArguments = [],
} = {}) {
  const adapter = validateExternalEntitlementDeploymentAdapter(profile, {
    forbiddenArguments,
  })
  const runtimeAuthority = externalRuntimeAuthorityProjection(
    verifyProviderCliRuntimeForCertification({
      rootPath: repoRoot,
      executable: adapter.executable,
    }),
  )
  const target = externalRuntimeTarget(runtimeTarget)
  if (typeof workingDirectory !== 'string' || !isAbsolute(workingDirectory)
    || !environment || typeof environment !== 'object'
    || Array.isArray(environment)) {
    fail('external entitlement runtime preflight requires exact isolation and environment inputs')
  }
  const isolatedRoot = realpathSync(workingDirectory)
  const repositoryRoot = realpathSync(repoRoot)
  const info = lstatSync(isolatedRoot)
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0
    || readdirSync(isolatedRoot).length !== 0
    || isolatedRoot === repositoryRoot
    || isolatedRoot.startsWith(`${repositoryRoot}${sep}`)
    || target.pathClass !== pathClassForAbsolutePath(repositoryRoot)) {
    fail('external entitlement runtime preflight isolation/target binding is invalid')
  }
  const invocationPlan = {
    command: runtimeAuthority.command,
    runtimeExecutableAuthority: runtimeAuthority,
    timeoutSeconds: adapter.timeoutSeconds,
  }
  const authText = exactExternalReadback({
    invocationPlan,
    adapter,
    environment,
    workingDirectory: isolatedRoot,
    args: adapter.authStatusArguments,
    label: 'authentication',
  })
  let authReadback
  try { authReadback = JSON.parse(authText) } catch {
    fail('external entitlement authentication readback is invalid JSON')
  }
  const authReadbackDigest = externalEntitlementAuthDigest(adapter, authReadback)
  const versionText = exactExternalReadback({
    invocationPlan,
    adapter,
    environment,
    workingDirectory: isolatedRoot,
    args: adapter.versionArguments,
    label: 'version',
  })
  const escapedVersion = target.distributionVersion
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`(?:^|[^0-9A-Za-z.-])${escapedVersion}(?:$|[^0-9A-Za-z.-])`)
    .test(versionText)) {
    fail('external entitlement executable version differs from the exact certified runtime target')
  }
  return Object.freeze({
    authReadback: Object.freeze(authReadback),
    authReadbackDigest,
    versionReadbackDigest: sha256(versionText),
    runtimeExecutableAuthorityDigest: runtimeAuthority.binding.authorityDigest,
    runtimeExecutableBindingDigest: runtimeAuthority.bindingDigest,
    runtimeTargetDigest: sha256(stableStringify(target)),
  })
}

/**
 * Build one deployment invocation for the existing provider-neutral exchange.
 * The adapter receives only the canonical request carrier and result schema;
 * it has no repository path, tools, fallback model, or persistence capability.
 */
export function buildExternalEntitlementReviewInvocation({
  repoRoot = DEFAULT_ROOT,
  invocationProfileId,
  profile,
  selectionReceipt,
  portableRequest,
  resultSchema,
  authReadback,
  runtimeTarget,
  forbiddenArguments = [],
} = {}) {
  const adapter = validateExternalEntitlementDeploymentAdapter(profile, {
    forbiddenArguments,
  })
  const selected = selectionReceipt?.selected
  const request = portableRequest?.request
  if (selectionReceipt?.kind !== 'provider-review-capability-selection'
    || selected?.routeClass !== 'subscription-entitlement'
    || selected.invocationProfileId !== invocationProfileId
    || selected.providerId !== profile.providerId
    || selected.entitlementId !== profile.entitlementId
    || selected.requestModelId !== request?.requestModelId
    || selected.providerId !== request?.reviewerProviderId
    || selected.reviewProfileId !== request?.reviewProfileId
    || selected.invocationProfileId !== request?.invocationProfileId
    || selected.modelReleaseId !== request?.modelReleaseId
    || selectionReceipt.selectionDigest !== request?.selectionDigest
    || selected.capabilityCertificationId !== request?.capabilityCertificationId
    || selectionReceipt.selectedCapabilityCertificationDigest
      !== request?.selectedCapabilityCertificationDigest) {
    fail('external entitlement invocation is detached from the exact selected request')
  }
  if (!resultSchema || typeof resultSchema !== 'object' || Array.isArray(resultSchema)) {
    fail('external entitlement invocation result schema is missing')
  }
  const authReadbackDigest = externalEntitlementAuthDigest(adapter, authReadback)
  const runtimeAuthority = externalRuntimeAuthorityProjection(
    verifyProviderCliRuntimeForCertification({
      rootPath: repoRoot,
      executable: adapter.executable,
    }),
  )
  const exactRuntimeTarget = externalRuntimeTarget(runtimeTarget)
  const effort = adapter.effortByComputeTier[selected.computeTier]
  if (typeof effort !== 'string' || !effort) {
    fail(`external entitlement adapter cannot satisfy compute tier:${selected.computeTier ?? '<missing>'}`)
  }
  const resultSchemaJson = stableStringify(resultSchema)
  const systemPrompt = externalBatchSystemPrompt(request)
  const requestPackage = {
    schemaVersion: 1,
    kind: 'provider-neutral-review-content-exchange-request',
    request,
    evidenceCarrier: portableRequest.evidenceCarrier ?? null,
    blobs: portableRequest.blobs ?? [],
    prerequisiteResultPayloads: portableRequest.prerequisiteResultPayloads ?? [],
  }
  const stdin = `${stableStringify(requestPackage)}\n`
  const outputBudget = request.preparedInputBudget
  if (!outputBudget
    || !Number.isSafeInteger(outputBudget.plannedInputBytes)
    || !Number.isSafeInteger(outputBudget.plannedOutputBytes)
    || !Number.isSafeInteger(outputBudget.plannedPayloadBytes)
    || !Number.isSafeInteger(outputBudget.maxInputBytes)
    || !Number.isSafeInteger(outputBudget.maxOutputBytes)
    || !Number.isSafeInteger(outputBudget.maxPayloadBytes)
    || outputBudget.plannedPayloadBytes
      !== outputBudget.plannedInputBytes + outputBudget.plannedOutputBytes) {
    fail('external entitlement request lacks its certified payload budget')
  }
  const serializedProviderInputBytes = Buffer.byteLength(stdin)
    + Buffer.byteLength(resultSchemaJson)
    + Buffer.byteLength(systemPrompt)
  if (serializedProviderInputBytes > outputBudget.plannedInputBytes
    || serializedProviderInputBytes > outputBudget.maxInputBytes) {
    fail('external entitlement serialized provider input exceeds its certified budget')
  }
  const replacements = {
    model: selected.requestModelId,
    effort,
    emptyTools: '',
    resultSchemaJson,
    systemPrompt,
    emptyMcpConfig: '{"mcpServers":{}}',
  }
  const adapterArgs = adapter.arguments.map((token) => (
    EXTERNAL_ENTITLEMENT_PLACEHOLDER.test(token)
      ? replacements[token.slice(1, -1)]
      : token
  ))
  if (adapterArgs.some((token) => typeof token !== 'string' || token.includes('\0'))
    || adapterArgs.some((token) => forbiddenArguments.includes(token))) {
    fail('external entitlement invocation arguments are incomplete or unsafe')
  }
  const args = [...runtimeAuthority.argsPrefix, ...adapterArgs]
  const projection = {
    schemaVersion: 1,
    kind: 'provider-neutral-external-entitlement-review-invocation',
    providerId: selected.providerId,
    reviewProfileId: selected.reviewProfileId,
    invocationProfileId,
    entitlementId: selected.entitlementId,
    modelReleaseId: selected.modelReleaseId,
    requestModelId: selected.requestModelId,
    computeTier: selected.computeTier,
    selectedEffort: effort,
    selectionDigest: selectionReceipt.selectionDigest,
    requestOrdinal: request.requestOrdinal,
    requestDigest: request.requestDigest,
    logicalExecutable: adapter.executable,
    command: runtimeAuthority.command,
    args,
    stdinSha256: sha256(stdin),
    stdinBytes: Buffer.byteLength(stdin),
    resultSchemaSha256: sha256(resultSchemaJson),
    authReadbackDigest,
    runtimeExecutableAuthority: runtimeAuthority,
    runtimeTarget: exactRuntimeTarget,
    runtimeTargetDigest: sha256(stableStringify(exactRuntimeTarget)),
    serializedProviderInputBytes,
    outputBudget: structuredClone(outputBudget),
    repositoryIsolation: adapter.repositoryIsolation,
    environmentPolicy: adapter.environmentPolicy,
    sessionPersistence: adapter.sessionPersistence,
    fallbackPolicy: adapter.fallbackPolicy,
    timeoutSeconds: adapter.timeoutSeconds,
  }
  const plan = {
    ...projection,
    stdin,
    invocationDigest: sha256(stableStringify(projection)),
  }
  return Object.freeze(plan)
}

export function executeExternalEntitlementReviewInvocation({
  profile,
  invocationPlan,
  environment,
  workingDirectory,
  repositoryRoot,
  forbiddenArguments = [],
} = {}) {
  const adapter = validateExternalEntitlementDeploymentAdapter(profile, {
    forbiddenArguments,
  })
  const runtimeAuthority = externalRuntimeAuthorityProjection(
    verifyProviderCliRuntimeForCertification({
      rootPath: repositoryRoot,
      executable: adapter.executable,
    }),
  )
  if (invocationPlan?.kind !== 'provider-neutral-external-entitlement-review-invocation'
    || invocationPlan.invocationDigest
      !== sha256(stableStringify(externalEntitlementInvocationProjection(invocationPlan)))
    || invocationPlan.logicalExecutable !== adapter.executable
    || invocationPlan.command !== runtimeAuthority.command
    || stableStringify(invocationPlan.runtimeExecutableAuthority)
      !== stableStringify(runtimeAuthority)
    || stableStringify(invocationPlan.args.slice(0, runtimeAuthority.argsPrefix.length))
      !== stableStringify(runtimeAuthority.argsPrefix)
    || invocationPlan.runtimeTargetDigest
      !== sha256(stableStringify(invocationPlan.runtimeTarget))
    || invocationPlan.timeoutSeconds !== adapter.timeoutSeconds) {
    fail('external entitlement execution plan is stale or substituted')
  }
  if (typeof workingDirectory !== 'string' || typeof repositoryRoot !== 'string'
    || !workingDirectory.startsWith('/') || !repositoryRoot.startsWith('/')) {
    fail('external entitlement execution requires absolute isolation boundaries')
  }
  const isolatedRoot = realpathSync(workingDirectory)
  const repoBoundary = realpathSync(repositoryRoot)
  const info = lstatSync(isolatedRoot)
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && info.uid !== process.getuid())
    || readdirSync(isolatedRoot).length !== 0
    || isolatedRoot === repoBoundary
    || isolatedRoot.startsWith(`${repoBoundary}${sep}`)) {
    fail('external entitlement execution directory is not a private empty repository-unmounted boundary')
  }
  if (invocationPlan.runtimeTarget?.pathClass
      !== pathClassForAbsolutePath(repoBoundary)) {
    fail('external entitlement authority repository path class differs from the exact certified runtime target')
  }
  if (invocationPlan.runtimeTarget.platform !== process.platform
    || invocationPlan.runtimeTarget.arch !== process.arch
    || invocationPlan.runtimeTarget.executionEnvironment !== 'native') {
    fail('external entitlement execution host differs from the exact certified runtime target')
  }
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    fail('external entitlement execution environment is invalid')
  }
  const allowedEnvironment = new Set([
    'HOME',
    'LANG',
    'LC_ALL',
    'LOGNAME',
    'PATH',
    'SHELL',
    'TMPDIR',
    'USER',
  ])
  const environmentNames = Object.keys(environment)
  if (environmentNames.some((name) => !allowedEnvironment.has(name))
    || environmentNames.some((name) => (
      /(?:API[_-]?KEY|AUTH[_-]?TOKEN|CREDENTIAL|PASSWORD|SECRET)/i.test(name)
    ))
    || typeof environment.HOME !== 'string'
    || typeof environment.USER !== 'string'
    || typeof environment.PATH !== 'string') {
    fail('external entitlement execution environment is not the closed first-party account environment')
  }
  const liveAuthText = exactExternalReadback({
    invocationPlan,
    adapter,
    environment,
    workingDirectory: isolatedRoot,
    args: adapter.authStatusArguments,
    label: 'authentication',
  })
  let liveAuth
  try { liveAuth = JSON.parse(liveAuthText) } catch {
    fail('external entitlement authentication readback is invalid JSON')
  }
  const liveAuthReadbackDigest = externalEntitlementAuthDigest(adapter, liveAuth)
  if (liveAuthReadbackDigest !== invocationPlan.authReadbackDigest) {
    fail('external entitlement authentication readback differs from the frozen invocation')
  }
  const liveVersionText = exactExternalReadback({
    invocationPlan,
    adapter,
    environment,
    workingDirectory: isolatedRoot,
    args: adapter.versionArguments,
    label: 'version',
  })
  const escapedVersion = invocationPlan.runtimeTarget.distributionVersion
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`(?:^|[^0-9A-Za-z.-])${escapedVersion}(?:$|[^0-9A-Za-z.-])`)
    .test(liveVersionText)) {
    fail('external entitlement executable version differs from the exact certified runtime target')
  }
  const versionReadbackDigest = sha256(liveVersionText)
  const result = spawnSync(invocationPlan.command, invocationPlan.args, {
    cwd: isolatedRoot,
    env: environment,
    input: invocationPlan.stdin,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: invocationPlan.timeoutSeconds * 1000,
    maxBuffer: Math.min(
      invocationPlan.outputBudget.plannedOutputBytes,
      invocationPlan.outputBudget.maxOutputBytes,
    ),
  })
  if (result.error) {
    fail(`external entitlement provider process failed to start:${result.error.message}`)
  }
  const response = normalizeExternalEntitlementReviewResponse({
    profile,
    invocationPlan,
    processResult: {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    forbiddenArguments,
  })
  const executionBinding = {
    schemaVersion: 1,
    kind: 'provider-neutral-external-entitlement-execution-binding',
    runtimeExecutableAuthorityDigest:
      invocationPlan.runtimeExecutableAuthority.binding.authorityDigest,
    runtimeExecutableBindingDigest:
      invocationPlan.runtimeExecutableAuthority.bindingDigest,
    certifiedRuntimeTargetDigest: invocationPlan.runtimeTargetDigest,
    authReadbackDigest: liveAuthReadbackDigest,
    versionReadbackDigest,
    isolationPathClass: pathClassForAbsolutePath(isolatedRoot),
    repositoryMounted: false,
  }
  return {
    ...response,
    executionBinding: {
      ...executionBinding,
      executionBindingDigest: sha256(stableStringify(executionBinding)),
    },
  }
}

export function normalizeExternalEntitlementReviewResponse({
  profile,
  invocationPlan,
  processResult,
  forbiddenArguments = [],
} = {}) {
  const adapter = validateExternalEntitlementDeploymentAdapter(profile, {
    forbiddenArguments,
  })
  if (invocationPlan?.kind !== 'provider-neutral-external-entitlement-review-invocation'
    || invocationPlan.providerId !== profile.providerId
    || invocationPlan.invocationDigest
      !== sha256(stableStringify(externalEntitlementInvocationProjection(invocationPlan)))
    || invocationPlan.repositoryIsolation !== adapter.repositoryIsolation
    || invocationPlan.environmentPolicy !== adapter.environmentPolicy
    || invocationPlan.sessionPersistence !== 'disabled'
    || invocationPlan.fallbackPolicy !== 'forbidden') {
    fail('external entitlement invocation plan is stale or substituted')
  }
  if (!processResult || typeof processResult !== 'object' || Array.isArray(processResult)
    || processResult.status !== 0
    || (processResult.signal !== null && processResult.signal !== undefined)
    || typeof processResult.stdout !== 'string'
    || typeof processResult.stderr !== 'string'
    || processResult.stderr.trim() !== '') {
    fail('external entitlement provider process did not complete cleanly')
  }
  const rawResponseBytes = Buffer.byteLength(processResult.stdout)
  if (rawResponseBytes > invocationPlan.outputBudget.plannedOutputBytes
    || rawResponseBytes > invocationPlan.outputBudget.maxOutputBytes
    || invocationPlan.serializedProviderInputBytes + rawResponseBytes
      > invocationPlan.outputBudget.maxPayloadBytes) {
    fail('external entitlement raw provider response exceeds its certified output/payload budget')
  }
  let raw
  try { raw = JSON.parse(processResult.stdout) } catch (error) { fail(`external entitlement provider response is invalid JSON:${error.message}`) }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('external entitlement provider response is not an object')
  }
  for (const [index, predicate] of adapter.terminalPredicates.entries()) {
    canonicalJsonEquals(
      pointerGet(raw, predicate.pointer, `external entitlement terminal predicate ${index}`),
      predicate.canonicalJson,
      `external entitlement terminal predicate ${index}`,
    )
  }
  const providerRunId = pointerGet(
    raw,
    adapter.providerRunIdPointer,
    'external entitlement provider run identity',
  )
  if (typeof providerRunId !== 'string' || !providerRunId.trim()) {
    fail('external entitlement provider run identity is invalid')
  }
  const modelUsage = pointerGet(
    raw,
    adapter.modelUsagePointer,
    'external entitlement observed model identity',
  )
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) {
    fail('external entitlement observed model identity is invalid')
  }
  const observedModels = Object.keys(modelUsage)
  if (observedModels.length !== 1
    || observedModels[0] !== invocationPlan.requestModelId) {
    fail('external entitlement response model does not exactly match the selected immutable model')
  }
  const result = pointerGet(
    raw,
    adapter.resultPointer,
    'external entitlement structured result',
  )
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    fail('external entitlement structured result is invalid')
  }
  return {
    status: 'completed',
    providerRunId,
    observedModelId: observedModels[0],
    outputs: [{
      kind: 'structured-review-result',
      canonicalJson: stableStringify(result),
    }],
  }
}

export function buildModelPrompt({ kind, subject, coverage, claimInventory = null, planState, resultSchemaSha256 } = {}) {
  if (!['judgment', 'component-a1b'].includes(kind)) fail(`prompt kind is invalid:${kind}`)
  const common = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-prompt',
    taskKind: kind,
    subject,
    auditPlanDigest: planState.planDigest,
    resultSchemaSha256,
    coverage: {
      inventoryDigest: coverage.inventoryDigest,
      filesScanned: coverage.filesScanned,
      inventoryPaths: coverage.inventoryPaths,
    },
    instructions: {
      sampling: 'forbidden-read-every-listed-file',
      sourceBoundary: 'read-only-exact-disposable-manifest-snapshot',
      findings: 'return-only-closed-schema-path-positive-line-severity-and-remediation',
      emptyResult: 'allowed-only-after-reading-every-listed-file-and-returning-exact-coverage-digest',
      sourceEcho: 'forbidden',
    },
  }
  if (kind === 'judgment') {
    const record = planState.judgmentByDimension.get(subject)
    if (!record) fail(`judgment dimension is not planned:${subject}`)
    common.rule = { dim: record.dim, ruleId: `DS-DIM-${String(record.dim).padStart(3, '0')}`, mechanism: record.mechanism }
  } else {
    if (!claimInventory || claimInventory.component !== subject || !Array.isArray(claimInventory.claims)
      || claimInventory.claims.length !== claimInventory.claimCount) fail(`component claim inventory is incomplete:${subject}`)
    common.component = subject
    common.claimContract = {
      inventoryDigest: claimInventory.claimInventoryDigest,
      claimCount: claimInventory.claimCount,
      claims: claimInventory.claims,
      verdictClosure: 'return-one-verified-or-false-verdict-for-every-claimId-exactly-once',
    }
  }
  return `${stableStringify(common, 2)}\n`
}

export function validateModelResult(result, { repoRoot = DEFAULT_ROOT, kind, subject, coverage, claimInventory = null } = {}) {
  validateSchema(repoRoot, result, DEFAULT_MODEL_RESULT_SCHEMA, 'model deep-audit result')
  const expectedKind = kind === 'judgment' ? 'deep-audit-judgment-result' : 'deep-audit-component-a1b-result'
  if (result.evidenceKind !== expectedKind) fail('model result kind mismatches task')
  if ((kind === 'judgment' ? result.dim : result.component) !== subject) fail('model result subject mismatches task')
  if (result.coverage.inventoryDigest !== coverage.inventoryDigest || result.coverage.filesScanned !== coverage.filesScanned) fail('model result coverage mismatches exact task inventory')
  const paths = new Set(coverage.inventoryPaths)
  const findings = kind === 'judgment' ? result.findings : result.falseClaims
  for (const finding of findings) if (!paths.has(finding.path)) fail(`model result finding path is outside exact coverage:${finding.path}`)
  if (kind === 'component-a1b') {
    if (!claimInventory || result.claimsVerified !== claimInventory.claimCount) fail('A1b claimsVerified does not equal the exact deterministic claim count')
    buildComponentClaimReceipt({
      claimInventory,
      claimVerdicts: result.claimVerdicts,
      falseClaims: result.falseClaims,
    })
    const claimById = new Map(claimInventory.claims.map((claim) => [claim.claimId, claim]))
    for (const falseClaim of result.falseClaims) {
      const claim = claimById.get(falseClaim.claimId)
      if (!claim || falseClaim.path !== claim.path || falseClaim.line !== claim.line) {
        fail(`A1b false-claim location does not match its deterministic claim:${falseClaim.claimId}`)
      }
    }
  }
  return result
}

export function modelResultSchemaState({ repoRoot = DEFAULT_ROOT } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const read = readJson(root, DEFAULT_MODEL_RESULT_SCHEMA, 'model result schema')
  return { path: repositoryFile(root, DEFAULT_MODEL_RESULT_SCHEMA, 'model result schema'), schema: read.value, sha256: sha256(read.bytes), bytes: read.bytes }
}
