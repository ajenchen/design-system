import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  DEFAULT_REPO_ROOT,
  HARNESS_AUTHORITY_CONTRACT_PATH,
  HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH,
  readHarnessRegistry,
  validateHarnessRegistry,
} from './harness-registry.mjs'
import { harnessMemberCommand, harnessSuiteCommand, readHarnessSourceInventory } from './harness-source-inventory.mjs'
import { resolveProvisionedPlaywrightRuntime } from './playwright-runtime.mjs'
import { validateProviderCompatibilityJoin } from './provider-compatibility.mjs'
import { runClosedGit, sha256, stableStringify } from './common.mjs'
import { assertGitVisibleWorktreeUnchanged, captureGitVisibleWorktree } from '../../../scripts/lib/worktree-fingerprint.mjs'

const EXTERNAL_CREDENTIAL = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|API_KEY|ACCESS_KEY(?:_ID)?|AUTH_TOKEN)$/i
const EXPLICITLY_UNSAFE_ENV = new Set([
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ANTHROPIC_API_KEY',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_PROFILE',
  'AWS_ROLE_ARN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_SESSION_TOKEN',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AZURE_CLIENT_ID',
  'AZURE_FEDERATED_TOKEN_FILE',
  'AZURE_TENANT_ID',
  'BASH_ENV',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'CURL_HOME',
  'DOCKER_CONFIG',
  'ENV',
  'GCM_CREDENTIAL_STORE',
  'GH_CONFIG_DIR',
  'GH_TOKEN',
  'GIT_ASKPASS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GITHUB_TOKEN',
  'GOVERNANCE_HARNESS_ACTIVE',
  'GOVERNANCE_HARNESS_SUITE_ACTIVE',
  'GOOGLE_GHA_CREDS_PATH',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'HOME',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',
  'KUBECONFIG',
  'LD_PRELOAD',
  'MSI_ENDPOINT',
  'MSI_SECRET',
  'NETRC',
  'NODE_AUTH_TOKEN',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_TOKEN',
  'OPENAI_API_KEY',
  'PERL5OPT',
  'PGPASSFILE',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYOPT',
  'SSH_AGENT_PID',
  'SSH_ASKPASS',
  'SSH_AUTH_SOCK',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TMPDIR',
  'USERPROFILE',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
])
const UNSAFE_ENV_NAME = /^(?:ALL_PROXY|DYLD_|GIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+)|HTTPS?_PROXY|NPM_CONFIG_|npm_config_|NO_PROXY|no_proxy|all_proxy|https?_proxy)/
export const ALL_HARNESS_RECEIPT_RELATIVE_PATH = 'infra/governance/runtime/all-harness-receipt.json'
export const ALL_HARNESS_RECEIPT_TTL_SECONDS = 24 * 60 * 60
export const ALL_HARNESS_RUNNER_ARGV = Object.freeze(['node', 'infra/governance/bin/run-harnesses.mjs'])
export const ALL_HARNESS_RUN_SUMMARY_SCHEMA_VERSION = 2
export const ALL_HARNESS_RECEIPT_SCHEMA_VERSION = 3
export const ALL_HARNESS_LOCAL_SOURCE_PROJECTION_KIND = 'provider-neutral-governance-harness-local-source-projection'
const HARNESS_STATIC_AUTHORITY_SOURCE_PATHS = Object.freeze([
  HARNESS_AUTHORITY_CONTRACT_PATH,
  HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH,
])

// A local receipt is deliberately not an external attestation, but the production
// API must still prove that its summary came from this module's real executor. A
// caller-supplied test executor may exercise planning/failure behavior, yet can
// never mint a completion receipt. Weak identity plus a captured digest also
// prevents cloning or mutating a genuinely executed summary before issuance.
const RECEIPT_ELIGIBLE_RUN_SUMMARIES = new WeakMap()
const WRITABLE_ALL_HARNESS_RECEIPTS = new WeakMap()

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function canonicalDate(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical date-time`)
  const date = new Date(value)
  invariant(Number.isFinite(date.getTime()) && date.toISOString() === value, `${label} must be a canonical date-time`)
  return date
}

function gitObject(repoRoot, expression, label) {
  const observed = runClosedGit(['rev-parse', '--verify', expression], {
    cwd: resolve(repoRoot),
    maxOutputBytes: 1024 * 1024,
    timeoutMs: 5000,
  })
  const value = observed.stdout?.trim()
  invariant(observed.status === 0 && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value ?? ''), `${label} is unavailable`)
  return value
}

function localSourceProjectionDigest(sources) {
  return sha256(`provider-neutral-governance-harness-local-source-projection-v1\n${stableStringify(sources, 0)}`)
}

function validateLocalSourceProjection(projection, label = 'All-Harness local-source projection') {
  exactKeys(projection, ['schemaVersion', 'kind', 'algorithm', 'sourceCount', 'sources', 'aggregateSha256'], label)
  invariant(
    projection.schemaVersion === 1
      && projection.kind === ALL_HARNESS_LOCAL_SOURCE_PROJECTION_KIND
      && projection.algorithm === 'sha256',
    `${label} identity/version is invalid`,
  )
  invariant(Array.isArray(projection.sources) && projection.sources.length > 0, `${label} sources must be a non-empty array`)
  const paths = []
  for (const [index, source] of projection.sources.entries()) {
    exactKeys(source, ['path', 'sha256'], `${label} source ${index}`)
    invariant(
      typeof source.path === 'string'
        && source.path.length > 0
        && !isAbsolute(source.path)
        && !source.path.includes('\\')
        && !/[\0\n\r]/.test(source.path)
        && source.path.split('/').every(part => part && part !== '.' && part !== '..'),
      `${label} source path is invalid:${String(source.path)}`,
    )
    invariant(/^[a-f0-9]{64}$/.test(source.sha256 ?? ''), `${label} source digest is invalid:${source.path}`)
    paths.push(source.path)
  }
  invariant(
    JSON.stringify(paths) === JSON.stringify([...new Set(paths)].sort()),
    `${label} sources must be uniquely and canonically ordered`,
  )
  invariant(projection.sourceCount === projection.sources.length, `${label} source count is invalid`)
  invariant(
    /^[a-f0-9]{64}$/.test(projection.aggregateSha256 ?? '')
      && projection.aggregateSha256 === localSourceProjectionDigest(projection.sources),
    `${label} aggregate digest mismatch`,
  )
  return true
}

function captureLocalSourceProjection(repoRoot, sourcePaths) {
  invariant(Array.isArray(sourcePaths) && sourcePaths.length > 0, 'All-Harness local-source projection requires registered source paths')
  const canonicalPaths = [...new Set(sourcePaths)].sort()
  invariant(canonicalPaths.length === sourcePaths.length, 'All-Harness registered local-source paths are duplicated')
  const sources = canonicalPaths.map(path => {
    const identity = captureRepoFileIdentity(repoRoot, path, 'All-Harness registered local source')
    return { path: identity.path, sha256: identity.sha256 }
  })
  const projection = {
    schemaVersion: 1,
    kind: ALL_HARNESS_LOCAL_SOURCE_PROJECTION_KIND,
    algorithm: 'sha256',
    sourceCount: sources.length,
    sources,
    aggregateSha256: localSourceProjectionDigest(sources),
  }
  validateLocalSourceProjection(projection)
  return projection
}

export function deriveAllHarnessLocalSourcePaths(plan) {
  invariant(Array.isArray(plan), 'All-Harness local-source derivation requires an execution plan')
  for (const [index, item] of plan.entries()) {
    invariant(
      Array.isArray(item?.sourcePaths)
        && item.sourcePaths.every(path => typeof path === 'string' && path.length > 0),
      `All-Harness plan item ${index} has invalid local source paths`,
    )
  }
  return [...new Set([
    ...plan.flatMap(item => item.sourcePaths),
    ...HARNESS_STATIC_AUTHORITY_SOURCE_PATHS,
  ])].sort()
}

export function captureRegisteredLocalSourceProjection({ repoRoot } = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'All-Harness source projection requires an explicit repository root')
  const registryPath = resolve(repoRoot, 'infra/governance/providers/harness-registry.json')
  const registry = readHarnessRegistry(registryPath)
  const plan = buildHarnessExecutionPlan(registry, { repoRoot })
  const sourcePaths = deriveAllHarnessLocalSourcePaths(plan)
  return captureLocalSourceProjection(repoRoot, sourcePaths)
}

function localSourceProjectionIdentity(projection) {
  validateLocalSourceProjection(projection)
  return {
    schemaVersion: projection.schemaVersion,
    kind: projection.kind,
    algorithm: projection.algorithm,
    sourceCount: projection.sourceCount,
    aggregateSha256: projection.aggregateSha256,
  }
}

function gitVisibleWorktreeIdentity(fingerprint) {
  invariant(
    fingerprint?.schemaVersion === 1
      && fingerprint.kind === 'git-visible-worktree-fingerprint'
      && Array.isArray(fingerprint.entries)
      && /^[a-f0-9]{64}$/.test(fingerprint.indexSha256 ?? '')
      && /^[a-f0-9]{64}$/.test(fingerprint.digest ?? ''),
    'All-Harness Git-visible worktree fingerprint is invalid',
  )
  return {
    schemaVersion: fingerprint.schemaVersion,
    kind: fingerprint.kind,
    indexSha256: fingerprint.indexSha256,
    entryCount: fingerprint.entries.length,
    digest: fingerprint.digest,
  }
}

function harnessReceiptSubject(repoRoot) {
  const controlPlane = captureRepoFileIdentity(repoRoot, 'governance/control-plane.lock.json', 'All-Harness control-plane lock')
  const registry = captureRepoFileIdentity(repoRoot, 'infra/governance/providers/harness-registry.json', 'All-Harness registry')
  const sourceInventory = captureRepoFileIdentity(repoRoot, 'infra/governance/providers/harness-source-inventory.json', 'All-Harness source inventory')
  const localSourceProjection = captureRegisteredLocalSourceProjection({ repoRoot })
  const gitVisibleWorktree = captureGitVisibleWorktree(repoRoot)
  return {
    repositoryRole: 'design-system-authority',
    head: gitObject(repoRoot, 'HEAD', 'All-Harness Git HEAD'),
    tree: gitObject(repoRoot, 'HEAD^{tree}', 'All-Harness Git tree'),
    controlPlane: { path: controlPlane.path, sha256: controlPlane.sha256 },
    harnessRegistry: { path: registry.path, sha256: registry.sha256 },
    harnessSourceInventory: { path: sourceInventory.path, sha256: sourceInventory.sha256 },
    localSourceProjection: localSourceProjectionIdentity(localSourceProjection),
    gitVisibleWorktree: gitVisibleWorktreeIdentity(gitVisibleWorktree),
  }
}

export function allHarnessReceiptDigest(receipt) {
  const unsigned = JSON.parse(JSON.stringify(receipt))
  delete unsigned.receiptSha256
  return sha256(`provider-neutral-all-harness-receipt-v3\n${stableStringify(unsigned, 0)}`)
}

export function createAllHarnessReceipt({ repoRoot, summary }) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'All-Harness receipt requires an explicit repository root')
  const execution = RECEIPT_ELIGIBLE_RUN_SUMMARIES.get(summary)
  const subject = harnessReceiptSubject(repoRoot)
  invariant(
    execution
      && execution.repoRoot === realpathSync(resolve(repoRoot))
      && execution.summarySha256 === sha256(stableStringify(summary, 0))
      && execution.subjectSha256 === sha256(stableStringify(subject, 0))
      && execution.worktreeSha256 === sha256(stableStringify(captureGitVisibleWorktree(repoRoot), 0)),
    'All-Harness receipt requires an unmodified in-process summary from the production executor',
  )
  invariant(summary?.kind === 'provider-neutral-governance-harness-run-summary' && summary.status === 'passed', 'All-Harness receipt requires the in-process passing run summary')
  const started = new Date(execution.startedAt)
  const completed = new Date(execution.completedAt)
  invariant(Number.isFinite(started.getTime()) && Number.isFinite(completed.getTime()) && completed.getTime() >= started.getTime(), 'All-Harness receipt run timestamps are invalid')
  invariant(summary.harnessRegistrySha256 === subject.harnessRegistry.sha256, 'All-Harness summary registry digest differs from the receipt subject')
  invariant(summary.harnessSourceInventorySha256 === subject.harnessSourceInventory.sha256, 'All-Harness summary source-inventory digest differs from the receipt subject')
  validateLocalSourceProjection(summary.localSourceProjection, 'All-Harness summary local-source projection')
  invariant(
    stableStringify(localSourceProjectionIdentity(summary.localSourceProjection), 0) === stableStringify(subject.localSourceProjection, 0),
    'All-Harness summary local-source projection differs from the receipt subject',
  )
  invariant(summary.registeredLocalSourceCount === summary.passedLocalSourceCount, 'All-Harness passing summary does not cover every registered local source')
  const receipt = {
    schemaVersion: ALL_HARNESS_RECEIPT_SCHEMA_VERSION,
    kind: 'provider-neutral-local-all-harness-receipt',
    subject,
    runner: {
      argv: [...ALL_HARNESS_RUNNER_ARGV],
      runnerId: summary.runnerId,
      hardGateContractId: summary.hardGateContractId,
      executedCommandCount: summary.executedCommandCount,
      registeredLocalSourceCount: summary.registeredLocalSourceCount,
    },
    result: {
      pass: true,
      status: summary.status,
      runSummarySha256: sha256(stableStringify(summary, 0)),
      localSourceProjectionSha256: summary.localSourceProjection.aggregateSha256,
    },
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    expiresAt: new Date(completed.getTime() + ALL_HARNESS_RECEIPT_TTL_SECONDS * 1000).toISOString(),
    ttlSeconds: ALL_HARNESS_RECEIPT_TTL_SECONDS,
    runSummary: JSON.parse(JSON.stringify(summary)),
  }
  receipt.receiptSha256 = allHarnessReceiptDigest(receipt)
  validateAllHarnessReceipt(receipt, { repoRoot, now: new Date() })
  RECEIPT_ELIGIBLE_RUN_SUMMARIES.delete(summary)
  WRITABLE_ALL_HARNESS_RECEIPTS.set(receipt, {
    receiptSha256: receipt.receiptSha256,
    repoRoot: execution.repoRoot,
    subjectSha256: execution.subjectSha256,
    worktreeSha256: execution.worktreeSha256,
  })
  return receipt
}

export function validateAllHarnessReceiptEvidence(receipt, { now = new Date() } = {}) {
  exactKeys(receipt, ['schemaVersion', 'kind', 'subject', 'runner', 'result', 'startedAt', 'completedAt', 'expiresAt', 'ttlSeconds', 'runSummary', 'receiptSha256'], 'All-Harness receipt')
  invariant(receipt.schemaVersion === ALL_HARNESS_RECEIPT_SCHEMA_VERSION && receipt.kind === 'provider-neutral-local-all-harness-receipt', 'All-Harness receipt identity/version is invalid')
  exactKeys(receipt.subject, ['repositoryRole', 'head', 'tree', 'controlPlane', 'harnessRegistry', 'harnessSourceInventory', 'localSourceProjection', 'gitVisibleWorktree'], 'All-Harness receipt subject')
  invariant(receipt.subject.repositoryRole === 'design-system-authority', 'All-Harness receipt repository role is invalid')
  for (const [key, expectedPath] of [
    ['controlPlane', 'governance/control-plane.lock.json'],
    ['harnessRegistry', 'infra/governance/providers/harness-registry.json'],
    ['harnessSourceInventory', 'infra/governance/providers/harness-source-inventory.json'],
  ]) {
    exactKeys(receipt.subject[key], ['path', 'sha256'], `All-Harness receipt ${key}`)
    invariant(receipt.subject[key].path === expectedPath && /^[a-f0-9]{64}$/.test(receipt.subject[key].sha256 ?? ''), `All-Harness receipt ${key} identity is invalid`)
  }
  exactKeys(receipt.subject.localSourceProjection, ['schemaVersion', 'kind', 'algorithm', 'sourceCount', 'aggregateSha256'], 'All-Harness receipt local-source projection identity')
  invariant(
    receipt.subject.localSourceProjection.schemaVersion === 1
      && receipt.subject.localSourceProjection.kind === ALL_HARNESS_LOCAL_SOURCE_PROJECTION_KIND
      && receipt.subject.localSourceProjection.algorithm === 'sha256'
      && Number.isInteger(receipt.subject.localSourceProjection.sourceCount)
      && receipt.subject.localSourceProjection.sourceCount > 0
      && /^[a-f0-9]{64}$/.test(receipt.subject.localSourceProjection.aggregateSha256 ?? ''),
    'All-Harness receipt local-source projection identity is invalid',
  )
  exactKeys(receipt.subject.gitVisibleWorktree, ['schemaVersion', 'kind', 'indexSha256', 'entryCount', 'digest'], 'All-Harness receipt Git-visible worktree')
  invariant(
    receipt.subject.gitVisibleWorktree.schemaVersion === 1
      && receipt.subject.gitVisibleWorktree.kind === 'git-visible-worktree-fingerprint'
      && /^[a-f0-9]{64}$/.test(receipt.subject.gitVisibleWorktree.indexSha256 ?? '')
      && Number.isInteger(receipt.subject.gitVisibleWorktree.entryCount)
      && receipt.subject.gitVisibleWorktree.entryCount > 0
      && /^[a-f0-9]{64}$/.test(receipt.subject.gitVisibleWorktree.digest ?? ''),
    'All-Harness receipt Git-visible worktree identity is invalid',
  )
  exactKeys(receipt.runner, ['argv', 'runnerId', 'hardGateContractId', 'executedCommandCount', 'registeredLocalSourceCount'], 'All-Harness receipt runner')
  invariant(stableStringify(receipt.runner.argv, 0) === stableStringify(ALL_HARNESS_RUNNER_ARGV, 0), 'All-Harness receipt runner argv is invalid')
  invariant(receipt.runner.runnerId === 'all-registered-local-harnesses' && receipt.runner.hardGateContractId === 'provider-neutral-governance-harness-v2', 'All-Harness receipt runner contract is invalid')
  invariant(Number.isInteger(receipt.runner.executedCommandCount) && receipt.runner.executedCommandCount > 0, 'All-Harness receipt executed-command count is invalid')
  invariant(Number.isInteger(receipt.runner.registeredLocalSourceCount) && receipt.runner.registeredLocalSourceCount > 0, 'All-Harness receipt registered-source count is invalid')
  exactKeys(receipt.result, ['pass', 'status', 'runSummarySha256', 'localSourceProjectionSha256'], 'All-Harness receipt result')
  invariant(
    receipt.result.pass === true
      && receipt.result.status === 'passed'
      && /^[a-f0-9]{64}$/.test(receipt.result.runSummarySha256 ?? '')
      && /^[a-f0-9]{64}$/.test(receipt.result.localSourceProjectionSha256 ?? ''),
    'All-Harness receipt does not record a content-addressed pass',
  )
  validateLocalSourceProjection(receipt.runSummary?.localSourceProjection, 'All-Harness receipt embedded local-source projection')
  invariant(receipt.runSummary?.schemaVersion === ALL_HARNESS_RUN_SUMMARY_SCHEMA_VERSION
    && receipt.runSummary.kind === 'provider-neutral-governance-harness-run-summary'
    && receipt.runSummary.status === 'passed'
    && receipt.runSummary.runnerId === receipt.runner.runnerId
    && receipt.runSummary.hardGateContractId === receipt.runner.hardGateContractId
    && receipt.runSummary.harnessRegistrySha256 === receipt.subject.harnessRegistry.sha256
    && receipt.runSummary.harnessSourceInventorySha256 === receipt.subject.harnessSourceInventory.sha256
    && receipt.runSummary.executedCommandCount === receipt.runner.executedCommandCount
    && receipt.runSummary.registeredLocalSourceCount === receipt.runner.registeredLocalSourceCount
    && receipt.runSummary.passedLocalSourceCount === receipt.runner.registeredLocalSourceCount
    && receipt.runSummary.localSourceProjection.sourceCount === receipt.runner.registeredLocalSourceCount
    && receipt.runSummary.localSourceProjection.aggregateSha256 === receipt.subject.localSourceProjection.aggregateSha256
    && receipt.runSummary.localSourceProjection.aggregateSha256 === receipt.result.localSourceProjectionSha256
    && Array.isArray(receipt.runSummary.commands)
    && receipt.runSummary.commands.length === receipt.runner.executedCommandCount
    && receipt.runSummary.commands.every(command => command?.status === 'passed'), 'All-Harness receipt embedded run summary is incomplete or not passing')
  invariant(receipt.result.runSummarySha256 === sha256(stableStringify(receipt.runSummary, 0)), 'All-Harness receipt run-summary digest mismatch')
  const started = canonicalDate(receipt.startedAt, 'All-Harness receipt startedAt')
  const completed = canonicalDate(receipt.completedAt, 'All-Harness receipt completedAt')
  const expires = canonicalDate(receipt.expiresAt, 'All-Harness receipt expiresAt')
  const observedAt = now instanceof Date ? now : new Date(now)
  invariant(Number.isFinite(observedAt.getTime()), 'All-Harness receipt validation time is invalid')
  invariant(completed.getTime() >= started.getTime(), 'All-Harness receipt completed before it started')
  invariant(receipt.ttlSeconds === ALL_HARNESS_RECEIPT_TTL_SECONDS && expires.getTime() === completed.getTime() + receipt.ttlSeconds * 1000, 'All-Harness receipt TTL binding is invalid')
  invariant(observedAt.getTime() >= completed.getTime() && observedAt.getTime() < expires.getTime(), 'All-Harness receipt is not currently fresh')
  invariant(/^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '') && receipt.receiptSha256 === allHarnessReceiptDigest(receipt), 'All-Harness receipt content digest mismatch')
  return true
}

export function validateAllHarnessReceipt(receipt, { repoRoot, now = new Date() }) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'All-Harness receipt validation requires an explicit repository root')
  validateAllHarnessReceiptEvidence(receipt, { now })
  invariant(stableStringify(receipt.subject, 0) === stableStringify(harnessReceiptSubject(repoRoot), 0), 'All-Harness receipt subject differs from the current HEAD/tree/control-plane/registry/source-inventory')
  return true
}

export function writeAllHarnessReceipt(receipt, { repoRoot, receiptPath = resolve(repoRoot, ALL_HARNESS_RECEIPT_RELATIVE_PATH) } = {}) {
  const issuance = WRITABLE_ALL_HARNESS_RECEIPTS.get(receipt)
  invariant(
    issuance
      && issuance.receiptSha256 === receipt?.receiptSha256
      && issuance.repoRoot === realpathSync(resolve(repoRoot))
      && issuance.subjectSha256 === sha256(stableStringify(harnessReceiptSubject(repoRoot), 0))
      && issuance.worktreeSha256 === sha256(stableStringify(captureGitVisibleWorktree(repoRoot), 0)),
    'All-Harness receipt write requires the unmodified in-process production receipt',
  )
  validateAllHarnessReceipt(receipt, { repoRoot, now: new Date() })
  const absolute = resolve(receiptPath)
  const parent = dirname(absolute)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`
  let descriptor = null
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${stableStringify(receipt)}\n`)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    renameSync(temporary, absolute)
    WRITABLE_ALL_HARNESS_RECEIPTS.delete(receipt)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  return absolute
}

export function invalidateAllHarnessReceipt({ repoRoot, receiptPath = resolve(repoRoot, ALL_HARNESS_RECEIPT_RELATIVE_PATH) } = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'All-Harness receipt invalidation requires an explicit repository root')
  if (existsSync(receiptPath)) unlinkSync(receiptPath)
}

export function observeAllHarnessReceipt({ repoRoot, receiptPath = resolve(repoRoot, ALL_HARNESS_RECEIPT_RELATIVE_PATH), now = new Date() } = {}) {
  try {
    invariant(existsSync(receiptPath), `All-Harness receipt is missing:${ALL_HARNESS_RECEIPT_RELATIVE_PATH}`)
    const info = lstatSync(receiptPath)
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'All-Harness receipt must be one regular no-link file')
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    validateAllHarnessReceipt(receipt, { repoRoot, now })
    return {
      pass: true,
      detail: 'A fresh content-addressed All-Harness receipt matches the current authority snapshot.',
      receiptPath: ALL_HARNESS_RECEIPT_RELATIVE_PATH,
      receiptSha256: receipt.receiptSha256,
      head: receipt.subject.head,
      tree: receipt.subject.tree,
      completedAt: receipt.completedAt,
      expiresAt: receipt.expiresAt,
      runnerArgv: receipt.runner.argv,
      registeredLocalSourceCount: receipt.runner.registeredLocalSourceCount,
      localSourceProjectionSha256: receipt.result.localSourceProjectionSha256,
    }
  } catch (error) {
    return {
      pass: false,
      detail: error.message,
      receiptPath: ALL_HARNESS_RECEIPT_RELATIVE_PATH,
      receiptSha256: null,
      head: null,
      tree: null,
      completedAt: null,
      expiresAt: null,
      runnerArgv: [...ALL_HARNESS_RUNNER_ARGV],
      registeredLocalSourceCount: null,
      localSourceProjectionSha256: null,
    }
  }
}

function commandKey(argv) {
  return JSON.stringify(argv)
}

function commandEntrypoint(argv) {
  return argv[1] === '--test' ? argv[2] : argv[1]
}

function captureRepoFileIdentity(repoRoot, repoPath, label) {
  invariant(
    typeof repoPath === 'string'
      && repoPath.length > 0
      && !isAbsolute(repoPath)
      && !repoPath.includes('\\')
      && !/[\0\n\r]/.test(repoPath)
      && repoPath.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be a portable repository-relative path`,
  )
  const root = realpathSync(resolve(repoRoot))
  const absolute = resolve(root, repoPath)
  const lexicalRelative = relative(root, absolute)
  invariant(
    lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative),
    `${label} escapes the repository`,
  )
  const info = lstatSync(absolute, { bigint: true })
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n, `${label} must be one regular no-link file:${repoPath}`)
  invariant(realpathSync(absolute) === absolute, `${label} must not traverse a symbolic-link alias:${repoPath}`)
  return {
    path: repoPath,
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: info.mode.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
  }
}

function assertRepoFileIdentity(repoRoot, expected, label) {
  invariant(expected && typeof expected === 'object' && typeof expected.path === 'string', `${label} expected identity is invalid`)
  const actual = captureRepoFileIdentity(repoRoot, expected.path, label)
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} path or digest changed after validation:${expected.path}`)
}

export function captureHarnessCommandIdentity(argv, { repoRoot } = {}) {
  invariant(Array.isArray(argv) && argv[0] === 'node' && argv.length >= 2, 'Harness command identity requires structured node argv')
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'Harness command identity requires an explicit repository root')
  const entrypoint = commandEntrypoint(argv)
  invariant(typeof entrypoint === 'string' && entrypoint.length > 0, 'Harness command has no committed entrypoint')
  return captureRepoFileIdentity(repoRoot, entrypoint, 'Harness command entrypoint')
}

export function sanitizeHarnessEnvironment(environment = process.env, { isolatedHome = null } = {}) {
  const sanitized = {}
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined || EXPLICITLY_UNSAFE_ENV.has(name) || EXTERNAL_CREDENTIAL.test(name)) continue
    if (UNSAFE_ENV_NAME.test(name)) continue
    sanitized[name] = value
  }
  if (isolatedHome !== null) {
    invariant(typeof isolatedHome === 'string' && isolatedHome.length > 0, 'Harness isolated home must be an explicit path')
    const configHome = join(isolatedHome, '.config')
    const cacheHome = join(isolatedHome, '.cache')
    const dataHome = join(isolatedHome, '.local', 'share')
    const stateHome = join(isolatedHome, '.local', 'state')
    const temporaryHome = join(isolatedHome, 'tmp')
    const codexHome = join(isolatedHome, '.codex')
    const claudeConfig = join(isolatedHome, '.claude')
    for (const path of [configHome, cacheHome, dataHome, stateHome, temporaryHome, codexHome, claudeConfig]) {
      mkdirSync(path, { recursive: true, mode: 0o700 })
    }
    const gitConfig = join(isolatedHome, '.gitconfig')
    const npmConfig = join(isolatedHome, '.npmrc')
    writeFileSync(gitConfig, '', { mode: 0o600 })
    writeFileSync(npmConfig, '', { mode: 0o600 })
    Object.assign(sanitized, {
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      XDG_CONFIG_HOME: configHome,
      XDG_CACHE_HOME: cacheHome,
      XDG_DATA_HOME: dataHome,
      XDG_STATE_HOME: stateHome,
      TMPDIR: temporaryHome,
      GH_CONFIG_DIR: join(configHome, 'gh'),
      CODEX_HOME: codexHome,
      CLAUDE_CONFIG_DIR: claudeConfig,
      DOCKER_CONFIG: join(configHome, 'docker'),
      NPM_CONFIG_USERCONFIG: npmConfig,
      npm_config_userconfig: npmConfig,
      NPM_CONFIG_CACHE: join(cacheHome, 'npm'),
      npm_config_cache: join(cacheHome, 'npm'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: '',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      SSH_ASKPASS_REQUIRE: 'never',
    })
  }
  sanitized.GOVERNANCE_HARNESS_MODE = 'offline-local-only'
  sanitized.GOVERNANCE_HARNESS_ACTIVE = '1'
  return sanitized
}

export function buildHarnessExecutionPlan(registry, { repoRoot } = {}) {
  const root = repoRoot ?? DEFAULT_REPO_ROOT
  validateHarnessRegistry(registry, { repoRoot: root })
  const inventory = readHarnessSourceInventory(resolve(root, registry.sourceInventory.path))
  const sourcePathsByArgv = new Map()
  for (const suite of inventory.suites) sourcePathsByArgv.set(commandKey(harnessSuiteCommand(suite.id)), suite.members)
  sourcePathsByArgv.set(commandKey(inventory.pairedMeta.command), inventory.pairedMeta.members)
  for (const path of inventory.direct) sourcePathsByArgv.set(commandKey(harnessMemberCommand(path)), [path])
  const timeoutOverrides = Array.isArray(registry.runner?.timeoutOverrides) ? registry.runner.timeoutOverrides : []
  const timeoutByArgv = new Map(timeoutOverrides.map(override => [commandKey(override.command), override.timeoutMs]))
  const byArgv = new Map()
  const plan = []
  for (const entry of registry.entries) {
    for (const argv of entry.commands) {
      const key = commandKey(argv)
      let item = byArgv.get(key)
      if (!item) {
        item = {
          argv: [...argv],
          timeoutMs: timeoutByArgv.get(key) ?? registry.runner.defaultTimeoutMs,
          sourcePaths: [...(sourcePathsByArgv.get(key) ?? [])],
          entrypointIdentity: captureHarnessCommandIdentity(argv, { repoRoot: root }),
          registeredBy: [],
        }
        byArgv.set(key, item)
        plan.push(item)
      }
      item.registeredBy.push({ id: entry.id, domain: entry.domain })
    }
  }
  return plan
}

function terminateChild(child, signal) {
  if (!child.pid) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {}
  }
  try { child.kill(signal) } catch {}
}

export function executeHarnessCommand(argv, {
  repoRoot,
  timeoutMs,
  environment = process.env,
  stdio = 'inherit',
  entrypointIdentity = null,
} = {}) {
  invariant(Array.isArray(argv) && argv[0] === 'node' && argv.length >= 2, 'Harness executor only accepts validated node argv')
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'Harness executor requires an explicit repository root')
  invariant(Number.isInteger(timeoutMs) && timeoutMs >= 1_000, 'Harness executor timeout must be an integer of at least 1000ms')
  if (entrypointIdentity !== null) {
    invariant(entrypointIdentity.path === commandEntrypoint(argv), 'Harness executor entrypoint identity does not match argv')
    assertRepoFileIdentity(repoRoot, entrypointIdentity, 'Harness command entrypoint')
  }
  const playwrightRuntime = resolveProvisionedPlaywrightRuntime({ repoRoot, environment })
  return new Promise((complete) => {
    const isolatedHome = mkdtempSync(resolve(tmpdir(), 'governance-harness-home-'))
    const childEnvironment = sanitizeHarnessEnvironment(environment, { isolatedHome })
    if (playwrightRuntime) childEnvironment.PLAYWRIGHT_BROWSERS_PATH = playwrightRuntime.environmentValue
    const started = Date.now()
    let timedOut = false
    let launchError = null
    let forceKillTimer = null
    let closeCleanupTimer = null
    const child = spawn(process.execPath, argv.slice(1), {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env: childEnvironment,
      shell: false,
      stdio,
    })
    child.once('error', (error) => { launchError = error })
    const timeout = setTimeout(() => {
      timedOut = true
      terminateChild(child, 'SIGTERM')
      forceKillTimer = setTimeout(() => terminateChild(child, 'SIGKILL'), 1_000)
      forceKillTimer.unref?.()
    }, timeoutMs)
    timeout.unref?.()
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout)
      const finish = () => {
        if (forceKillTimer) clearTimeout(forceKillTimer)
        if (closeCleanupTimer) clearTimeout(closeCleanupTimer)
        let isolationCleanupError = null
        try { rmSync(isolatedHome, { recursive: true, force: true }) }
        catch (error) { isolationCleanupError = error }
        const status = timedOut
          ? 'timed-out'
          : launchError || isolationCleanupError
            ? 'launch-error'
            : exitCode === 0
              ? 'passed'
              : 'failed'
        complete({
          status,
          exitCode,
          signal,
          durationMs: Date.now() - started,
          error: launchError?.message ?? isolationCleanupError?.message ?? null,
          isolatedHomeRemoved: isolationCleanupError === null,
        })
      }

      // A detached top-level command can exit after spawning a background descendant. The
      // process group remains addressable by the original leader pid, so reap it on every
      // close path—not only after a timeout—before declaring the Harness command complete.
      if (process.platform !== 'win32') {
        terminateChild(child, 'SIGTERM')
        closeCleanupTimer = setTimeout(() => {
          terminateChild(child, 'SIGKILL')
          finish()
        }, 100)
      } else finish()
    })
  })
}

function certificationOutcome(entry, localHarnessStatus) {
  if (entry.certificationClaim === 'not-certified') return 'not-certified'
  if (entry.certificationClaim === 'external-readback-required') return 'external-readback-required'
  return localHarnessStatus === 'passed' ? 'local-harness-passed' : 'local-harness-failed'
}

export async function runHarnessRegistry({
  registry = readHarnessRegistry(),
  repoRoot,
  execute = executeHarnessCommand,
  onCommandStart = () => {},
} = {}) {
  const executionStartedAt = new Date()
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'Harness runner requires an explicit repository root')
  validateHarnessRegistry(registry, { repoRoot })
  const registryPath = 'infra/governance/providers/harness-registry.json'
  const registryIdentity = captureRepoFileIdentity(repoRoot, registryPath, 'Harness registry')
  const registryBytes = readFileSync(resolve(repoRoot, registryPath))
  const registryFromBytes = JSON.parse(registryBytes.toString('utf8'))
  invariant(JSON.stringify(registryFromBytes) === JSON.stringify(registry), 'Harness runner registry object differs from the canonical digest-bound bytes')
  const inventoryIdentity = captureRepoFileIdentity(repoRoot, registry.sourceInventory.path, 'Harness source inventory')
  invariant(inventoryIdentity.sha256 === registry.sourceInventory.sha256, 'Harness source inventory digest changed after registry validation')
  const compatibility = JSON.parse(readFileSync(resolve(repoRoot, 'infra/governance/providers/compatibility-matrix.json'), 'utf8'))
  const { hardGateBinding } = validateProviderCompatibilityJoin(compatibility, undefined, {
    repoRoot,
    harnessRegistryBytes: registryBytes,
  })
  const plan = buildHarnessExecutionPlan(registry, { repoRoot })
  const registeredSourcePaths = deriveAllHarnessLocalSourcePaths(plan)
  const localSourceProjection = captureLocalSourceProjection(repoRoot, registeredSourcePaths)
  const sourceIdentityByPath = new Map(registeredSourcePaths.map(path => [
    path,
    captureRepoFileIdentity(repoRoot, path, 'All-Harness registered local source'),
  ]))
  const callerWorktree = captureGitVisibleWorktree(repoRoot)
  const commandResults = []
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]
    onCommandStart({ index, total: plan.length, ...item })
    assertRepoFileIdentity(repoRoot, registryIdentity, 'Harness registry')
    assertRepoFileIdentity(repoRoot, inventoryIdentity, 'Harness source inventory')
    assertRepoFileIdentity(repoRoot, item.entrypointIdentity, 'Harness command entrypoint')
    for (const path of HARNESS_STATIC_AUTHORITY_SOURCE_PATHS) {
      assertRepoFileIdentity(repoRoot, sourceIdentityByPath.get(path), 'Harness static authority source')
    }
    for (const path of item.sourcePaths) {
      assertRepoFileIdentity(repoRoot, sourceIdentityByPath.get(path), 'Harness registered local source')
    }
    assertGitVisibleWorktreeUnchanged(repoRoot, callerWorktree, { label: `Harness command ${index + 1} preflight` })
    const result = await execute(item.argv, {
      repoRoot,
      timeoutMs: item.timeoutMs,
      entrypointIdentity: item.entrypointIdentity,
    })
    assertRepoFileIdentity(repoRoot, registryIdentity, 'Harness registry')
    assertRepoFileIdentity(repoRoot, inventoryIdentity, 'Harness source inventory')
    assertRepoFileIdentity(repoRoot, item.entrypointIdentity, 'Harness command entrypoint')
    for (const path of HARNESS_STATIC_AUTHORITY_SOURCE_PATHS) {
      assertRepoFileIdentity(repoRoot, sourceIdentityByPath.get(path), 'Harness static authority source')
    }
    for (const path of item.sourcePaths) {
      assertRepoFileIdentity(repoRoot, sourceIdentityByPath.get(path), 'Harness registered local source')
    }
    assertGitVisibleWorktreeUnchanged(repoRoot, callerWorktree, { label: `Harness command ${index + 1}` })
    invariant(
      result && ['passed', 'failed', 'timed-out', 'launch-error'].includes(result.status),
      `Harness executor returned an invalid result for ${item.argv.join(' ')}`,
    )
    commandResults.push({ ...item, ...result })
  }

  invariant(
    stableStringify(captureLocalSourceProjection(repoRoot, registeredSourcePaths), 0) === stableStringify(localSourceProjection, 0),
    'Harness registered local-source projection changed during execution',
  )

  const resultByArgv = new Map(commandResults.map(result => [commandKey(result.argv), result]))
  const passedSourcePaths = [...new Set([
    ...commandResults.filter(result => result.status === 'passed').flatMap(result => result.sourcePaths),
    ...HARNESS_STATIC_AUTHORITY_SOURCE_PATHS,
  ])].sort()
  const entries = registry.entries.map(entry => {
    const localHarnessStatus = entry.commands.every(argv => resultByArgv.get(commandKey(argv))?.status === 'passed')
      ? 'passed'
      : 'failed'
    return {
      id: entry.id,
      domain: entry.domain,
      localHarnessStatus,
      declaredCertificationClaim: entry.certificationClaim,
      certificationOutcome: certificationOutcome(entry, localHarnessStatus),
    }
  })
  const summary = {
    schemaVersion: ALL_HARNESS_RUN_SUMMARY_SCHEMA_VERSION,
    kind: 'provider-neutral-governance-harness-run-summary',
    runnerId: registry.runner.id,
    hardGateContractId: hardGateBinding.contract.contractId,
    harnessRegistrySha256: hardGateBinding.digest,
    status: commandResults.every(result => result.status === 'passed') ? 'passed' : 'failed',
    registeredCommandCount: registry.entries.reduce((count, entry) => count + entry.commands.length, 0),
    executedCommandCount: commandResults.length,
    deduplicatedCommandCount: registry.entries.reduce((count, entry) => count + entry.commands.length, 0) - commandResults.length,
    registeredLocalSourceCount: registeredSourcePaths.length,
    passedLocalSourceCount: passedSourcePaths.length,
    localSourceProjection,
    externalExcludedSourceCount: readHarnessSourceInventory(resolve(repoRoot, registry.sourceInventory.path)).externalExclusions.length,
    nonGovernanceSourceCount: JSON.parse(readFileSync(resolve(repoRoot, readHarnessSourceInventory(resolve(repoRoot, registry.sourceInventory.path)).nonGovernance.path), 'utf8')).entries.length,
    harnessSourceInventorySha256: registry.sourceInventory.sha256,
    certificationUpgradeGranted: false,
    externalClaimsPreserved: true,
    commands: commandResults,
    entries,
  }
  if (execute === executeHarnessCommand && summary.status === 'passed') {
    assertGitVisibleWorktreeUnchanged(repoRoot, callerWorktree, { label: 'Harness receipt issuance' })
    const subject = harnessReceiptSubject(repoRoot)
    RECEIPT_ELIGIBLE_RUN_SUMMARIES.set(summary, {
      repoRoot: realpathSync(resolve(repoRoot)),
      summarySha256: sha256(stableStringify(summary, 0)),
      subjectSha256: sha256(stableStringify(subject, 0)),
      worktreeSha256: sha256(stableStringify(callerWorktree, 0)),
      startedAt: executionStartedAt.toISOString(),
      completedAt: new Date().toISOString(),
    })
  }
  return summary
}
