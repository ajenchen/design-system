#!/usr/bin/env node
// Provider transport adapter. It maps one provider event payload and legacy environment variables
// into the GOVERNANCE_* contract, then dispatches its registered canonical hook group in order.
// Policy remains in the hook corpus and hook-independent CI; this adapter never invents a rule.

import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TextDecoder } from 'node:util'
import { isContainedPath } from './lib/canonical-path-containment.mjs'
import {
  assertClosedGitLocalConfiguration,
  materializeClosedHookToolProfile,
  resolveClosedPrivateRuntimeBase,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from '../packages/governance/src/canonical-order.mjs'
const CORPUS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLOSED_PRIVATE_RUNTIME_BASE = resolveClosedPrivateRuntimeBase()
const transcriptSnapshotRoots = new Set()
const hookCorpusSnapshotRoots = new Set()
const activeHookChildren = new Set()
const TRANSCRIPT_SNAPSHOT_ATTEMPTS = 3
const TRANSCRIPT_RETRY_BACKOFF_MS = 4
const TRANSCRIPT_TEST_TRANSITION_TIMEOUT_MS = 2000
const TRANSCRIPT_TEST_SIGNAL_TIMEOUT_MS = 2000
const MAX_PROVIDER_HOOK_INPUT_BYTES = 64 * 1024 * 1024
const MAX_PROVIDER_HOOK_CHILD_INPUT_BYTES = 16 * 1024 * 1024
const MAX_PROVIDER_HOOK_SESSION_IDENTIFIER_BYTES = 4096
const MAX_PROVIDER_HOOK_CHILD_OUTPUT_BYTES = 1024 * 1024
const MAX_PROVIDER_HOOK_CHANGED_FILE_COUNT = 256
const MAX_PROVIDER_HOOK_DESCRIPTOR_COUNT = 64
const MAX_PROVIDER_HOOK_INVOCATION_COUNT = 1024
const MAX_PROVIDER_HOOK_PATH_CANDIDATE_COUNT = 1024
const MAX_PROVIDER_HOOK_MUTATION_OPERATION_COUNT = 1024
const MAX_PROVIDER_HOOK_MUTATION_EDIT_COUNT = 1024
const MAX_PROVIDER_HOOK_PATCH_LINE_COUNT = 16_384
const MAX_PROVIDER_HOOK_PROPOSED_AFTER_IMAGE_BYTES = 16 * 1024 * 1024
const MAX_PROVIDER_HOOK_AGGREGATE_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_PROVIDER_HOOK_EMITTED_OUTPUT_BYTES = 8 * 1024 * 1024
const PROVIDER_HOOK_CHILD_TIMEOUT_MS = 45_000
const PROVIDER_HOOK_BATCH_RUNTIME_MS = 120_000
const PROVIDER_HOOK_SIGNAL_GRACE_MS = 150
const PROVIDER_HOOK_SIGNAL_KILL_WAIT_MS = 100
const MAX_HOOK_CORPUS_ENTRY_BYTES = 4 * 1024 * 1024
const MAX_HOOK_CORPUS_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_HOOK_CORPUS_SNAPSHOT_ENTRIES = 4096
const HOOK_CORPUS_TEST_RELEASE_TIMEOUT_MS = 2000
const AUTHORITY_DECISION_RECEIPT_CONTRACT_PATH = 'packages/governance/src/authority-decision-evidence.mjs'
const PYTHON_ISOLATED_HOOK_BOOTSTRAP = [
  'import os, runpy, sys',
  'target = os.path.realpath(sys.argv[1])',
  'sys.path.insert(0, os.path.dirname(target))',
  'sys.argv = [target]',
  'runpy.run_path(target, run_name="__main__")',
].join('\n')
const transcriptTestTransitionProbeEnabled = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-transcript-transition-probe')
const transcriptTestSignalProbeEnabled = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-transcript-snapshot-signal-probe')
const hookCorpusTestReleaseProbeEnabled = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-hook-corpus-snapshot-probe')
const providerHookBatchRuntimeLimitMs = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-short-batch-runtime')
  ? 750
  : PROVIDER_HOOK_BATCH_RUNTIME_MS
const providerHookBatchStartedAt = process.hrtime.bigint()
let providerHookBatchDeadline = null
const transcriptRetryClock = new Int32Array(new SharedArrayBuffer(4))
let transcriptTestTransitionProbeConsumed = false

function makePrivateTreeRemovable(root) {
  let info
  try {
    info = lstatSync(root)
  } catch {
    return
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return
  try { chmodSync(root, 0o700) } catch {}
  let names = []
  try { names = readdirSync(root) } catch {}
  for (const name of names) {
    const child = join(root, name)
    let childInfo
    try { childInfo = lstatSync(child) } catch { continue }
    if (childInfo.isDirectory() && !childInfo.isSymbolicLink()) makePrivateTreeRemovable(child)
  }
}

function cleanupPrivateSnapshots() {
  for (const root of transcriptSnapshotRoots) {
    try {
      makePrivateTreeRemovable(root)
      rmSync(root, { recursive: true, force: true })
    } catch {}
    transcriptSnapshotRoots.delete(root)
  }
  for (const root of hookCorpusSnapshotRoots) {
    try {
      makePrivateTreeRemovable(root)
      rmSync(root, { recursive: true, force: true })
    } catch {}
    hookCorpusSnapshotRoots.delete(root)
  }
}

function signalChildTree(child, signal = 'SIGKILL') {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try { child.kill(signal) } catch {}
  }
}

function hookProcessGroupState(child) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return 'unverifiable:pid'
  try {
    process.kill(-child.pid, 0)
    return 'alive'
  } catch (error) {
    if (error?.code === 'ESRCH') return 'absent'
    return `unverifiable:${error?.code || 'UNKNOWN'}`
  }
}

function verifiedHookProcessGroupQuiescence(child) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return 'unverifiable:pid'
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,pgid=,stat='], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    maxBuffer: 1024 * 1024,
    timeout: 1000,
  })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    return `unverifiable:ps:${result.error?.code || result.status || 'UNKNOWN'}`
  }
  const members = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/^\s*([0-9]+)\s+([0-9]+)\s+(\S+)\s*$/)
    if (!match) return 'unverifiable:ps-output'
    if (Number(match[2]) === child.pid) members.push({ pid: Number(match[1]), state: match[3] })
  }
  if (!members.length) return 'absent'
  return members.every((member) => member.state.startsWith('Z'))
    ? 'zombie-only'
    : `live:${members.map((member) => `${member.pid}:${member.state}`).join(',')}`
}

async function awaitHookProcessGroupExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const state = hookProcessGroupState(child)
    if (state !== 'alive') return state
    await boundedDelay(Math.min(20, Math.max(1, deadline - Date.now())))
  }
  return hookProcessGroupState(child)
}

async function cleanupCompletedHookProcessGroup(child, hookName) {
  const initial = hookProcessGroupState(child)
  if (initial === 'absent') return
  if (initial === 'unverifiable:EPERM') {
    const quiescence = verifiedHookProcessGroupQuiescence(child)
    if (quiescence === 'absent' || quiescence === 'zombie-only') return
    // A denied read-only probe is not success. Continue into bounded TERM/KILL cleanup;
    // the final branch still requires a fresh absence or quiescence proof.
  }
  if (initial.startsWith('unverifiable:') && initial !== 'unverifiable:EPERM') {
    failIntegrity(`provider hook child process group cannot be verified after close:${hookName}:${initial}`)
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      failIntegrity(`provider hook child process group cannot receive SIGTERM:${hookName}:${error?.code || 'UNKNOWN'}`)
    }
    return
  }
  const afterTerm = await awaitHookProcessGroupExit(child, PROVIDER_HOOK_SIGNAL_GRACE_MS)
  if (afterTerm === 'absent') return
  if (afterTerm === 'unverifiable:EPERM') {
    const quiescence = verifiedHookProcessGroupQuiescence(child)
    if (quiescence === 'absent' || quiescence === 'zombie-only') return
    if (!quiescence.startsWith('unverifiable:')) {
      failIntegrity(`provider hook child process group remains live after SIGTERM:${hookName}:${afterTerm}:${quiescence}`)
    }
    // Some managed macOS sandboxes deny both signal-0 process-group probes and /bin/ps
    // inspection while still allowing the owner to signal the detached child group.
    // Never reinterpret EPERM as success: escalate to uncatchable SIGKILL, then require
    // a fresh absence/quiescence proof below.
  }
  if (afterTerm.startsWith('unverifiable:') && afterTerm !== 'unverifiable:EPERM') {
    failIntegrity(`provider hook child process group cannot be verified after SIGTERM:${hookName}:${afterTerm}`)
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      failIntegrity(`provider hook child process group cannot receive SIGKILL:${hookName}:${error?.code || 'UNKNOWN'}`)
    }
    return
  }
  const afterKill = await awaitHookProcessGroupExit(child, PROVIDER_HOOK_SIGNAL_KILL_WAIT_MS)
  if (afterKill === 'absent') return
  const quiescence = verifiedHookProcessGroupQuiescence(child)
  if (quiescence === 'absent' || quiescence === 'zombie-only') return
  failIntegrity(`provider hook child process group survived bounded cleanup:${hookName}:${afterKill}:${quiescence}`)
}

function terminateActiveHookChildren(signal = 'SIGKILL') {
  for (const child of activeHookChildren) signalChildTree(child, signal)
}

const boundedDelay = (milliseconds) => new Promise((accept) => {
  setTimeout(accept, milliseconds)
})

let signalShutdownStarted = false
async function shutdownForSignal(signal, exitCode) {
  if (signalShutdownStarted) return
  signalShutdownStarted = true
  if (providerHookBatchDeadline) clearTimeout(providerHookBatchDeadline)
  const children = [...activeHookChildren]
  for (const child of children) signalChildTree(child, signal)
  if (children.length) {
    await boundedDelay(PROVIDER_HOOK_SIGNAL_GRACE_MS)
    for (const child of children) signalChildTree(child, 'SIGKILL')
    await boundedDelay(PROVIDER_HOOK_SIGNAL_KILL_WAIT_MS)
  }
  cleanupPrivateSnapshots()
  process.exit(exitCode)
}

process.once('exit', cleanupPrivateSnapshots)
process.once('SIGINT', () => { void shutdownForSignal('SIGTERM', 130) })
process.once('SIGTERM', () => { void shutdownForSignal('SIGTERM', 143) })

function containedCanonicalPath(repositoryPath, label) {
  const absolute = resolve(CORPUS_ROOT, repositoryPath)
  const rel = relative(CORPUS_ROOT, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes the repository root`)
  }
  let cursor = CORPUS_ROOT
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment)
    if (!existsSync(cursor)) break
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} crosses a symbolic link:${relative(CORPUS_ROOT, cursor)}`)
  }
  return absolute
}

let registry
let registrations
let hasUsableVersionedTranscript
let normalizeProviderHookInput
let providerHookIssueMessage
let formatProviderHookContext
let formatProviderStopDecision
let interpretProviderHookChildResult
let buildProviderHookStdinInvocation
let sanitizeProviderHookEnvironment
let providerHookExecutablePath
let materializeProviderWriteStates
let resolveProviderReviewBinding
let resolveProviderHookEligibility
let validateHookRegistrations
let validateProviderRegistryDocument
try {
  // Keep every repository-owned import behind this boundary. Contract modules compile their
  // JSON Schemas during initialization; missing, tampered, symlinked, or Ajv-invalid schemas must
  // therefore produce the hook blocking code (2), never Node's ordinary import failure code (1).
  let validators
  try {
    validators = await import('./lib/provider-contract-validation.mjs')
  } catch (error) {
    // A clean Claude/Codex plugin cache intentionally has no repository node_modules. Only the
    // missing Ajv package may select the dependency-free runtime guard; missing/tampered corpus
    // modules remain a hard bootstrap failure.
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !String(error.message).includes("package 'ajv'")) throw error
    validators = await import('./lib/provider-runtime-validation.mjs')
  }
  const {
    hasUsableVersionedTranscript: usableVersionedTranscript,
    validateHookRegistrations: hookRegistrationValidator,
    validateProviderRegistryDocument: providerRegistryValidator,
  } = validators
  hasUsableVersionedTranscript = usableVersionedTranscript
  validateHookRegistrations = hookRegistrationValidator
  validateProviderRegistryDocument = providerRegistryValidator
  if (typeof hasUsableVersionedTranscript !== 'function') throw new TypeError('provider transcript contract guard is invalid')
  if (typeof validateHookRegistrations !== 'function'
    || typeof validateProviderRegistryDocument !== 'function') {
    throw new TypeError('provider registry validators are invalid')
  }
  const outputTransport = await import('./lib/provider-hook-output-transport.mjs')
  buildProviderHookStdinInvocation = outputTransport.buildProviderHookStdinInvocation
  sanitizeProviderHookEnvironment = outputTransport.sanitizeProviderHookEnvironment
  providerHookExecutablePath = outputTransport.providerHookOutputContract?.executablePath
  formatProviderHookContext = outputTransport.formatProviderHookContext
  formatProviderStopDecision = outputTransport.formatProviderStopDecision
  interpretProviderHookChildResult = outputTransport.interpretProviderHookChildResult
  if (typeof buildProviderHookStdinInvocation !== 'function'
    || typeof sanitizeProviderHookEnvironment !== 'function'
    || typeof formatProviderHookContext !== 'function'
    || typeof formatProviderStopDecision !== 'function'
    || typeof interpretProviderHookChildResult !== 'function'
    || typeof providerHookExecutablePath !== 'string'
    || !providerHookExecutablePath) {
    throw new TypeError('provider hook output transport exports are invalid')
  }
  const reviewBindingPath = containedCanonicalPath('packages/governance/src/provider-review-binding.mjs', 'provider review binding resolver')
  const reviewBinding = await import(pathToFileURL(reviewBindingPath).href)
  resolveProviderReviewBinding = reviewBinding.resolveProviderReviewBinding
  resolveProviderHookEligibility = reviewBinding.resolveProviderHookEligibility
  if (typeof resolveProviderReviewBinding !== 'function'
    || typeof resolveProviderHookEligibility !== 'function') {
    throw new TypeError('provider review binding resolver exports are invalid')
  }
  const normalizerPath = containedCanonicalPath('packages/governance/src/provider-hook-normalization.mjs', 'provider hook normalizer')
  const normalizer = await import(pathToFileURL(normalizerPath).href)
  normalizeProviderHookInput = normalizer.normalizeProviderHookInput
  providerHookIssueMessage = normalizer.providerHookIssueMessage
  materializeProviderWriteStates = normalizer.materializeProviderWriteStates
  if (typeof normalizeProviderHookInput !== 'function'
    || typeof providerHookIssueMessage !== 'function'
    || typeof materializeProviderWriteStates !== 'function') {
    throw new TypeError('provider hook normalizer exports are invalid')
  }
  const registryPath = containedCanonicalPath('packages/governance/canonical/providers.json', 'provider registry')
  registry = validateProviderRegistryDocument(JSON.parse(readFileSync(registryPath, 'utf8')))
  const registrationsPath = containedCanonicalPath(registry.canonical.hookRegistrations, 'provider hook registrations')
  registrations = validateHookRegistrations(JSON.parse(readFileSync(registrationsPath, 'utf8')))
} catch (error) {
  failIntegrity(`provider hook adapter blocked:invalid canonical provider contract:${error.message}`)
}

function argumentValues(name) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name) values.push(process.argv[index + 1] ?? null)
  }
  return values
}

function fail(message) {
  const rawDetail = String(message).startsWith('GOVERNANCE_INTEGRITY:')
    ? String(message)
    : `GOVERNANCE_INTEGRITY: ${message}`
  // Fatal diagnostics must not depend on an asynchronous stream flush followed by process.exit().
  // Keep the record below a small fixed pipe write and write fd 2 synchronously.
  const detail = rawDetail.length > 900
    ? `${rawDetail.slice(0, 900)}...[truncated]`
    : rawDetail
  terminateActiveHookChildren('SIGKILL')
  cleanupPrivateSnapshots()
  const record = Buffer.from(`${detail}\n`, 'utf8')
  let offset = 0
  try {
    while (offset < record.length) {
      const count = writeSync(2, record, offset, record.length - offset)
      if (count <= 0) break
      offset += count
    }
  } catch {}
  process.exit(70)
}

function failIntegrity(message) {
  fail(message)
}

const unexpectedFailureDetail = (error) => {
  const code = typeof error?.code === 'string' ? error.code : error?.name || 'UNKNOWN'
  const message = typeof error?.message === 'string' ? error.message.trim().slice(0, 1000) : ''
  return `${code}${message ? `:${message}` : ''}`
}
process.on('uncaughtException', (error) => {
  failIntegrity(`provider hook adapter internal failure:${unexpectedFailureDetail(error)}`)
})
process.on('unhandledRejection', (error) => {
  failIntegrity(`provider hook adapter internal rejection:${unexpectedFailureDetail(error)}`)
})

function providerHookBatchElapsedMs() {
  return Number(process.hrtime.bigint() - providerHookBatchStartedAt) / 1_000_000
}

function remainingProviderHookBatchMs(label) {
  const remaining = providerHookBatchRuntimeLimitMs - providerHookBatchElapsedMs()
  if (remaining <= 0) {
    failIntegrity(`provider hook batch exceeded ${providerHookBatchRuntimeLimitMs}ms:${label}`)
  }
  return Math.max(1, Math.floor(remaining))
}

providerHookBatchDeadline = setTimeout(() => {
  failIntegrity(`provider hook batch exceeded ${providerHookBatchRuntimeLimitMs}ms:deadline`)
}, Math.max(1, providerHookBatchRuntimeLimitMs - providerHookBatchElapsedMs()))
providerHookBatchDeadline.unref?.()

function assertNoExistingSymlink(root, target, label) {
  const absoluteRoot = resolve(root)
  const absoluteTarget = resolve(target)
  if (!isContainedPath(absoluteRoot, absoluteTarget, { allowRoot: true })) {
    fail(`provider hook adapter blocked:${label} escapes its trusted root`)
  }
  const rel = relative(absoluteRoot, absoluteTarget)
  let cursor = absoluteRoot
  if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
    fail(`provider hook adapter blocked:${label} crosses a symbolic link:${cursor}`)
  }
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment)
    if (!existsSync(cursor)) break
    if (lstatSync(cursor).isSymbolicLink()) fail(`provider hook adapter blocked:${label} crosses a symbolic link:${relative(absoluteRoot, cursor)}`)
  }
}

function canonicalRepositoryRelativePath(repositoryPath, label) {
  const absolute = containedCanonicalPath(repositoryPath, label)
  const normalized = relative(CORPUS_ROOT, absolute).split(/[\\/]/).join('/')
  if (!normalized
    || normalized.includes('\0')
    || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    failIntegrity(`provider hook adapter blocked:${label} has an unsafe repository path`)
  }
  return normalized
}

function sameCorpusEntryMetadata(left, right) {
  return [
    'dev',
    'ino',
    'mode',
    'nlink',
    'size',
    'mtimeNs',
    'ctimeNs',
  ].every((key) => left[key] === right[key])
}

function enumerateCanonicalCorpusPath(repositoryPath, entries, traversal) {
  traversal.visited += 1
  if (traversal.visited > MAX_HOOK_CORPUS_SNAPSHOT_ENTRIES) {
    failIntegrity(`provider hook corpus traversal exceeds ${MAX_HOOK_CORPUS_SNAPSHOT_ENTRIES} entries`)
  }
  const normalized = canonicalRepositoryRelativePath(repositoryPath, 'hook corpus authority path')
  const absolute = resolve(CORPUS_ROOT, normalized)
  let info
  try {
    info = lstatSync(absolute, { bigint: true })
  } catch (error) {
    failIntegrity(`provider hook corpus authority path is unavailable:${normalized}:${error.code || error.message}`)
  }
  if (info.isSymbolicLink()) {
    failIntegrity(`provider hook corpus authority path crosses a symbolic link:${normalized}`)
  }
  if (info.isFile()) {
    if (info.nlink !== 1n) {
      failIntegrity(`provider hook corpus entry is aliased:${normalized}`)
    }
    entries.add(normalized)
    return
  }
  if (!info.isDirectory()) {
    failIntegrity(`provider hook corpus authority path has an unsupported type:${normalized}`)
  }
  let children
  try {
    children = readdirSync(absolute).sort(compareUtf8Bytes)
  } catch (error) {
    failIntegrity(`provider hook corpus directory cannot be enumerated:${normalized}:${error.code || error.message}`)
  }
  for (const child of children) {
    enumerateCanonicalCorpusPath(`${normalized}/${child}`, entries, traversal)
  }
}

function hookCorpusAuthorityPaths(canonicalRegistry) {
  const roots = canonicalRegistry?.canonical?.roots
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
    failIntegrity('provider hook corpus canonical roots are unavailable')
  }
  const paths = [
    'AGENTS.md',
    AUTHORITY_DECISION_RECEIPT_CONTRACT_PATH,
    roots.hooks,
    roots.references,
    roots.rules,
    roots.skills,
    'packages/governance/canonical/providers.json',
    'packages/design-system/src/tokens/utility-registry.json',
  ]
  if (paths.some((value) => typeof value !== 'string' || !value)) {
    failIntegrity('provider hook corpus authority path declaration is invalid')
  }
  return [...new Set(paths)]
}

function canonicalHookCorpusFiles(canonicalRegistry) {
  const entries = new Set()
  const traversal = { visited: 0 }
  for (const authorityPath of hookCorpusAuthorityPaths(canonicalRegistry)) {
    enumerateCanonicalCorpusPath(authorityPath, entries, traversal)
    if (entries.size > MAX_HOOK_CORPUS_SNAPSHOT_ENTRIES) {
      failIntegrity(`provider hook corpus exceeds ${MAX_HOOK_CORPUS_SNAPSHOT_ENTRIES} entries`)
    }
  }
  return [...entries].sort(compareUtf8Bytes)
}

function readAuthenticatedHookCorpusEntry(repositoryPath) {
  const absolute = resolve(CORPUS_ROOT, repositoryPath)
  let pathBefore
  let handle = null
  try {
    pathBefore = lstatSync(absolute, { bigint: true })
    if (pathBefore.isSymbolicLink()
      || !pathBefore.isFile()
      || pathBefore.nlink !== 1n
      || pathBefore.size > BigInt(MAX_HOOK_CORPUS_ENTRY_BYTES)
      || pathBefore.size > BigInt(Number.MAX_SAFE_INTEGER)
      || realpathSync(absolute) !== absolute) {
      failIntegrity(`provider hook corpus entry is unsafe or exceeds ${MAX_HOOK_CORPUS_ENTRY_BYTES} bytes:${repositoryPath}`)
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(absolute, fsConstants.O_RDONLY | noFollow)
    const opened = fstatSync(handle, { bigint: true })
    if (!opened.isFile() || opened.nlink !== 1n || !sameCorpusEntryMetadata(pathBefore, opened)) {
      failIntegrity(`provider hook corpus entry changed while being opened:${repositoryPath}`)
    }
    const body = Buffer.alloc(Number(opened.size))
    let offset = 0
    while (offset < body.length) {
      const count = readSync(handle, body, offset, body.length - offset, offset)
      if (count <= 0) {
        failIntegrity(`provider hook corpus entry changed while being read:${repositoryPath}`)
      }
      offset += count
    }
    const openedAfter = fstatSync(handle, { bigint: true })
    const pathAfter = lstatSync(absolute, { bigint: true })
    if (!sameCorpusEntryMetadata(opened, openedAfter)
      || !sameCorpusEntryMetadata(opened, pathAfter)
      || pathAfter.isSymbolicLink()
      || realpathSync(absolute) !== absolute) {
      failIntegrity(`provider hook corpus entry changed during authentication:${repositoryPath}`)
    }
    return Object.freeze({
      body,
      metadata: opened,
      path: repositoryPath,
      sha256: createHash('sha256').update(body).digest('hex'),
    })
  } catch (error) {
    if (String(error?.message || '').startsWith('GOVERNANCE_INTEGRITY:')) throw error
    failIntegrity(`provider hook corpus entry cannot be authenticated:${repositoryPath}:${error.code || error.message}`)
  } finally {
    if (handle !== null) {
      try { closeSync(handle) } catch {}
    }
  }
}

function writePrivateHookCorpusEntry(snapshotRoot, entry) {
  const target = resolve(snapshotRoot, entry.path)
  if (!isContainedPath(snapshotRoot, target)) {
    failIntegrity(`provider hook snapshot entry escapes its private root:${entry.path}`)
  }
  const parent = dirname(target)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  chmodSync(parent, 0o700)
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  let handle = null
  try {
    handle = openSync(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o400,
    )
    let offset = 0
    while (offset < entry.body.length) {
      const count = writeSync(handle, entry.body, offset, entry.body.length - offset, offset)
      if (count <= 0) {
        failIntegrity(`provider hook snapshot write did not advance:${entry.path}`)
      }
      offset += count
    }
    fchmodSync(handle, 0o400)
  } catch (error) {
    if (String(error?.message || '').startsWith('GOVERNANCE_INTEGRITY:')) throw error
    failIntegrity(`provider hook snapshot entry could not be written:${entry.path}:${error.code || error.message}`)
  } finally {
    if (handle !== null) {
      try { closeSync(handle) } catch {}
    }
  }
  const snapshotInfo = lstatSync(target, { bigint: true })
  const snapshotBody = readFileSync(target)
  if (snapshotInfo.isSymbolicLink()
    || !snapshotInfo.isFile()
    || snapshotInfo.nlink !== 1n
    || snapshotInfo.size !== BigInt(entry.body.length)
    || (snapshotInfo.mode & 0o277n) !== 0n
    || realpathSync(target) !== target
    || createHash('sha256').update(snapshotBody).digest('hex') !== entry.sha256) {
    failIntegrity(`provider hook snapshot readback differs from authenticated source:${entry.path}`)
  }
}

function sealPrivateHookCorpusDirectories(snapshotRoot, current = snapshotRoot) {
  for (const name of readdirSync(current)) {
    const child = join(current, name)
    const info = lstatSync(child)
    if (info.isDirectory() && !info.isSymbolicLink()) {
      sealPrivateHookCorpusDirectories(snapshotRoot, child)
    }
  }
  chmodSync(current, 0o500)
}

function createAuthenticatedHookCorpusSnapshot(canonicalRegistry) {
  remainingProviderHookBatchMs('hook-corpus-snapshot-start')
  const filesBefore = canonicalHookCorpusFiles(canonicalRegistry)
  const authenticated = []
  let totalBytes = 0
  for (const file of filesBefore) {
    const entry = readAuthenticatedHookCorpusEntry(file)
    totalBytes += entry.body.length
    if (totalBytes > MAX_HOOK_CORPUS_SNAPSHOT_BYTES) {
      failIntegrity(`provider hook corpus exceeds ${MAX_HOOK_CORPUS_SNAPSHOT_BYTES} bytes`)
    }
    authenticated.push(entry)
  }
  const filesAfter = canonicalHookCorpusFiles(canonicalRegistry)
  if (filesAfter.length !== filesBefore.length
    || filesAfter.some((file, index) => file !== filesBefore[index])) {
    failIntegrity('provider hook corpus inventory changed during authentication')
  }
  for (const entry of authenticated) {
    const closingRead = readAuthenticatedHookCorpusEntry(entry.path)
    if (closingRead.sha256 !== entry.sha256) {
      failIntegrity(`provider hook corpus entry bytes changed during closed inventory authentication:${entry.path}`)
    }
  }

  let snapshotRoot = ''
  try {
    snapshotRoot = realpathSync(mkdtempSync(join(CLOSED_PRIVATE_RUNTIME_BASE, 'governance-hook-corpus-')))
    hookCorpusSnapshotRoots.add(snapshotRoot)
    chmodSync(snapshotRoot, 0o700)
    for (const entry of authenticated) writePrivateHookCorpusEntry(snapshotRoot, entry)
    sealPrivateHookCorpusDirectories(snapshotRoot)
    const digest = createHash('sha256')
    for (const entry of authenticated) {
      digest.update(entry.path)
      digest.update('\0')
      digest.update(entry.sha256)
      digest.update('\n')
    }
    remainingProviderHookBatchMs('hook-corpus-snapshot-complete')
    return Object.freeze({
      root: snapshotRoot,
      sha256: digest.digest('hex'),
    })
  } catch (error) {
    if (snapshotRoot) {
      hookCorpusSnapshotRoots.delete(snapshotRoot)
      try {
        makePrivateTreeRemovable(snapshotRoot)
        rmSync(snapshotRoot, { recursive: true, force: true })
      } catch {}
    }
    if (String(error?.message || '').startsWith('GOVERNANCE_INTEGRITY:')) throw error
    failIntegrity(`provider hook corpus snapshot failed:${error.code || error.message}`)
  }
}

async function awaitHookCorpusTestRelease(snapshotRoot) {
  if (!hookCorpusTestReleaseProbeEnabled) return
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      process.removeListener('SIGUSR1', release)
      reject(new Error('HOOK_CORPUS_TEST_RELEASE_NOT_OBSERVED'))
    }, HOOK_CORPUS_TEST_RELEASE_TIMEOUT_MS)
    const release = () => {
      clearTimeout(timer)
      accept()
    }
    process.once('SIGUSR1', release)
    writeSync(2, `provider hook adapter test probe:HOOK_CORPUS_SNAPSHOT_READY:${snapshotRoot}\n`)
  }).catch((error) => {
    failIntegrity(`provider hook corpus test release failed:${error.message}`)
  })
}

function sameTranscriptIdentity(left, right) {
  return [
    'dev',
    'ino',
    'mode',
    'nlink',
  ].every((key) => left[key] === right[key])
}

function sameTranscriptStableMetadata(left, right) {
  return ['size', 'mtimeNs', 'ctimeNs'].every((key) => left[key] === right[key])
}

function readExactAt(handle, length, position, descriptor) {
  const body = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const count = readSync(handle, body, offset, length - offset, position + offset)
    if (count <= 0) fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
    offset += count
  }
  return body
}

function awaitFailClosedTestTranscriptTransition(handle, captured, descriptor) {
  if (!transcriptTestTransitionProbeEnabled || transcriptTestTransitionProbeConsumed) return
  transcriptTestTransitionProbeConsumed = true
  // This test-only scheduling probe cannot make a transcript acceptable. It waits for a real
  // metadata transition after the first fixed-range read and blocks if the bounded observation
  // window expires. The poison test uses the ready marker to place a rewrite deterministically
  // between the two production reads instead of making an impossible continuous-history claim.
  writeSync(2, `provider hook adapter test probe:${descriptor.hook}:TRANSCRIPT_TEST_TRANSITION_PROBE_READY\n`)
  const deadline = Date.now() + TRANSCRIPT_TEST_TRANSITION_TIMEOUT_MS
  while (Date.now() <= deadline) {
    const observed = fstatSync(handle, { bigint: true })
    if (!observed.isFile() || observed.nlink !== 1n || !sameTranscriptIdentity(captured, observed)
      || observed.size < captured.size || observed.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
    }
    if (!sameTranscriptStableMetadata(captured, observed)) return
    Atomics.wait(transcriptRetryClock, 0, 0, 1)
  }
  fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_TEST_TRANSITION_NOT_OBSERVED`)
}

function readTranscriptTailRange(handle, sourceBytes, access, descriptor, captured) {
  // maximumRecordBytes is the UTF-8 JSON body without its line terminator. Two extra bytes cover
  // the largest accepted input delimiter (CRLF) on the discarded prefix record.
  const readBudget = access.maximumMaterializedBytes + access.maximumRecordBytes + 2
  const readLength = Math.min(sourceBytes, readBudget)
  const readStart = sourceBytes - readLength
  const firstRead = readExactAt(handle, readLength, readStart, descriptor)
  awaitFailClosedTestTranscriptTransition(handle, captured, descriptor)
  const secondRead = readExactAt(handle, readLength, readStart, descriptor)
  if (!firstRead.equals(secondRead)) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
  }
  return { body: firstRead, readStart }
}

function parsedTranscriptTail(range, sourceBytes, access, descriptor) {
  if (sourceBytes === 0) {
    if (access.emptyState !== 'allowed-zero-byte') {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_EMPTY`)
    }
    return { incomplete: null, records: [] }
  }

  let tail = range.body
  const discardedPrefix = range.readStart > 0
  if (discardedPrefix) {
    const firstNewline = tail.indexOf(0x0a)
    // The prefix may include one CR byte before LF. Its JSON-body fragment can therefore occupy at
    // most maximumRecordBytes + 1 bytes before the LF delimiter.
    if (firstNewline < 0 || firstNewline > access.maximumRecordBytes + 1) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_RECORD_TOO_LARGE`)
    }
    // The first record began outside the bounded read and is deliberately discarded. Canonical
    // hooks receive only complete records whose bytes were parsed by this adapter.
    tail = tail.subarray(firstNewline + 1)
  }

  const records = []
  const parseLine = (rawLine, index, { trailing = false } = {}) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line.trim()) return { ok: true }
    if (Buffer.byteLength(line, 'utf8') > access.maximumRecordBytes) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_RECORD_TOO_LARGE:${index + 1}`)
    }
    try {
      const record = JSON.parse(line)
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('record is not an object')
    } catch (error) {
      if (trailing) return { ok: false, detail: error.message }
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_JSONL_INVALID:${index + 1}:${error.message}`)
    }
    records.push(line)
    return { ok: true }
  }

  const endsWithNewline = tail.at(-1) === 0x0a
  const finalNewline = tail.lastIndexOf(0x0a)
  const completeBytes = endsWithNewline
    ? tail
    : finalNewline >= 0
      ? tail.subarray(0, finalNewline + 1)
      : Buffer.alloc(0)
  const trailingBytes = endsWithNewline
    ? Buffer.alloc(0)
    : finalNewline >= 0
      ? tail.subarray(finalNewline + 1)
      : tail

  let completeText
  try {
    completeText = new TextDecoder('utf-8', { fatal: true }).decode(completeBytes)
  } catch {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_JSONL_INVALID:UTF8`)
  }
  for (const [index, rawLine] of completeText.split('\n').entries()) parseLine(rawLine, index)

  let incomplete = null
  if (trailingBytes.length) {
    const allowedDanglingCr = trailingBytes.length === access.maximumRecordBytes + 1
      && trailingBytes.at(-1) === 0x0d
    if (trailingBytes.length > access.maximumRecordBytes && !allowedDanglingCr) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_RECORD_TOO_LARGE:TRAILING`)
    }
    let trailingText
    try {
      trailingText = new TextDecoder('utf-8', { fatal: true }).decode(trailingBytes)
    } catch {
      incomplete = { detail: 'UTF8', line: completeText.split('\n').length }
    }
    if (trailingText !== undefined) {
      const result = parseLine(trailingText, completeText.split('\n').length - 1, { trailing: true })
      if (!result.ok) incomplete = { detail: result.detail, line: completeText.split('\n').length }
    }
  }

  return { incomplete, records }
}

function materializeTranscriptRecords(records, access, descriptor) {
  if (records.length === 0) fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_EMPTY`)
  const selected = []
  let selectedBytes = 0
  for (let index = records.length - 1; index >= 0 && selected.length < access.maximumRetainedRecordCount; index -= 1) {
    const lineBytes = Buffer.byteLength(records[index], 'utf8') + 1
    if (selectedBytes + lineBytes > access.maximumMaterializedBytes) break
    selected.unshift(records[index])
    selectedBytes += lineBytes
  }
  if (selected.length === 0) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_TAIL_BUDGET_EXCEEDED`)
  }
  const materialized = Buffer.from(`${selected.join('\n')}\n`, 'utf8')
  if (materialized.length > access.maximumMaterializedBytes) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_TAIL_BUDGET_EXCEEDED`)
  }
  return materialized
}

function stableTrailingFailure(descriptor, incomplete) {
  fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_JSONL_INVALID:${incomplete.line}:${incomplete.detail}`)
}

function boundedTranscriptRetryBackoff() {
  // Atomics.wait is a closed synchronous delay: at most two retries × 4 ms. It gives an append-only
  // writer time to finish its current record without introducing an unbounded hook wait.
  Atomics.wait(transcriptRetryClock, 0, 0, TRANSCRIPT_RETRY_BACKOFF_MS)
}

function awaitFailClosedTestSnapshotSignal(descriptor) {
  if (!transcriptTestSignalProbeEnabled) return
  // Test-only deterministic signal point: the private transcript exists and
  // the production SIGTERM handler is installed, but no canonical hook has
  // started. A missing signal times out closed instead of becoming a hang.
  writeSync(2, `provider hook adapter test probe:${descriptor.hook}:TRANSCRIPT_TEST_SNAPSHOT_SIGNAL_READY\n`)
  Atomics.wait(transcriptRetryClock, 0, 0, TRANSCRIPT_TEST_SIGNAL_TIMEOUT_MS)
  fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_TEST_SNAPSHOT_SIGNAL_NOT_OBSERVED`)
}

function writePrivateTranscriptSnapshot(body, descriptor) {
  let root = ''
  let handle = null
  try {
    root = mkdtempSync(join(CLOSED_PRIVATE_RUNTIME_BASE, 'governance-transcript-tail-'))
    transcriptSnapshotRoots.add(root)
    const rootInfo = lstatSync(root, { bigint: true })
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || (rootInfo.mode & 0o077n) !== 0n || realpathSync(root) !== root) {
      throw new Error('private transcript snapshot directory is unsafe')
    }
    const path = join(root, 'verified-tail.jsonl')
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow, 0o600)
    fchmodSync(handle, 0o600)
    let offset = 0
    while (offset < body.length) {
      const count = writeSync(handle, body, offset, body.length - offset)
      if (count <= 0) throw new Error('private transcript snapshot write did not advance')
      offset += count
    }
    fsyncSync(handle)
    fchmodSync(handle, 0o400)
    closeSync(handle)
    handle = null
    chmodSync(root, 0o500)
    const rootAfterSeal = lstatSync(root, { bigint: true })
    const info = lstatSync(path, { bigint: true })
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1n || (info.mode & 0o077n) !== 0n
      || (info.mode & 0o200n) !== 0n || info.size !== BigInt(body.length) || realpathSync(path) !== path
      || rootAfterSeal.isSymbolicLink() || !rootAfterSeal.isDirectory()
      || (rootAfterSeal.mode & 0o777n) !== 0o500n || realpathSync(root) !== root) {
      throw new Error('private transcript snapshot file is unsafe')
    }
    return Object.freeze({
      path,
      root,
      sha256: createHash('sha256').update(body).digest('hex'),
      fileMetadata: info,
      rootMetadata: rootAfterSeal,
    })
  } catch (error) {
    if (handle !== null) {
      try { closeSync(handle) } catch {}
    }
    if (root) {
      transcriptSnapshotRoots.delete(root)
      try {
        makePrivateTreeRemovable(root)
        rmSync(root, { recursive: true, force: true })
      } catch {}
    }
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_SNAPSHOT_FAILED:${error.message}`)
  }
}

function samePrivateSnapshotMetadata(left, right, keys) {
  return keys.every((key) => left?.[key] === right?.[key])
}

function verifyPrivateTranscriptSnapshot(snapshot, descriptor) {
  if (!snapshot || typeof snapshot.path !== 'string' || typeof snapshot.root !== 'string') {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_SNAPSHOT_UNAVAILABLE`)
  }
  let handle = null
  let rootInfo
  let fileInfo
  let openedInfo
  let openedAfter
  let rootAfter
  let fileAfter
  let body
  try {
    rootInfo = lstatSync(snapshot.root, { bigint: true })
    fileInfo = lstatSync(snapshot.path, { bigint: true })
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(snapshot.path, fsConstants.O_RDONLY | noFollow)
    openedInfo = fstatSync(handle, { bigint: true })
    if (openedInfo.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('snapshot size exceeds the readable range')
    }
    body = Buffer.alloc(Number(openedInfo.size))
    let offset = 0
    while (offset < body.length) {
      const count = readSync(handle, body, offset, body.length - offset, offset)
      if (count <= 0) throw new Error('snapshot changed while being read')
      offset += count
    }
    openedAfter = fstatSync(handle, { bigint: true })
    fileAfter = lstatSync(snapshot.path, { bigint: true })
    rootAfter = lstatSync(snapshot.root, { bigint: true })
  } catch (error) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_SNAPSHOT_CHANGED:${error?.code || error.message}`)
  } finally {
    if (handle !== null) {
      try { closeSync(handle) } catch {}
    }
  }
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()
    || fileInfo.isSymbolicLink() || !fileInfo.isFile() || fileInfo.nlink !== 1n
    || (rootInfo.mode & 0o777n) !== 0o500n || (fileInfo.mode & 0o777n) !== 0o400n
    || realpathSync(snapshot.root) !== snapshot.root || realpathSync(snapshot.path) !== snapshot.path
    || !openedInfo.isFile() || openedInfo.nlink !== 1n
    || !samePrivateSnapshotMetadata(
      snapshot.rootMetadata,
      rootInfo,
      ['dev', 'ino', 'mode', 'nlink', 'mtimeNs', 'ctimeNs'],
    )
    || !samePrivateSnapshotMetadata(
      snapshot.fileMetadata,
      fileInfo,
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'],
    )
    || !samePrivateSnapshotMetadata(
      snapshot.fileMetadata,
      openedInfo,
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'],
    )
    || !samePrivateSnapshotMetadata(
      openedInfo,
      openedAfter,
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'],
    )
    || !samePrivateSnapshotMetadata(
      openedInfo,
      fileAfter,
      ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'],
    )
    || !samePrivateSnapshotMetadata(
      rootInfo,
      rootAfter,
      ['dev', 'ino', 'mode', 'nlink', 'mtimeNs', 'ctimeNs'],
    )
    || createHash('sha256').update(body).digest('hex') !== snapshot.sha256) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_SNAPSHOT_CHANGED`)
  }
}

function verifiedVersionedTranscript(provider, descriptor, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    if (descriptor.transcript === 'stable-required') fail(`provider hook adapter blocked:${descriptor.hook}:VERSIONED_TRANSCRIPT_REQUIRED`)
    return ''
  }
  const contract = provider.runtime?.transcript
  if (!hasUsableVersionedTranscript(contract)) {
    if (descriptor.transcript === 'stable-required') fail(`provider hook adapter blocked:${descriptor.hook}:STABLE_TRANSCRIPT_CONTRACT_UNAVAILABLE`)
    return ''
  }
  const requested = resolve(candidate.trim())
  let canonical
  let pathBefore
  try {
    pathBefore = lstatSync(requested, { bigint: true })
    canonical = realpathSync(requested)
  } catch (error) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_UNVERIFIED:${error.message}`)
  }
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.nlink !== 1n || canonical !== requested) {
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE`)
  }
  let handle = null
  let materialized
  let optionalTranscriptUnavailable = false
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(requested, fsConstants.O_RDONLY | noFollow)
    const openedIdentity = fstatSync(handle, { bigint: true })
    if (!openedIdentity.isFile() || openedIdentity.nlink !== 1n || !sameTranscriptIdentity(pathBefore, openedIdentity)
      || openedIdentity.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_NOT_UNIQUE_REGULAR_FILE`)
    }
    if (openedIdentity.size < pathBefore.size) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
    }

    let minimumObservedSize = openedIdentity.size
    for (let attempt = 0; attempt < TRANSCRIPT_SNAPSHOT_ATTEMPTS; attempt += 1) {
      const captured = attempt === 0 ? openedIdentity : fstatSync(handle, { bigint: true })
      if (!captured.isFile() || captured.nlink !== 1n || !sameTranscriptIdentity(openedIdentity, captured)
        || captured.size < minimumObservedSize || captured.size > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
      }
      const sourceBytes = Number(captured.size)
      const range = readTranscriptTailRange(handle, sourceBytes, contract.access, descriptor, captured)
      const openedAfter = fstatSync(handle, { bigint: true })
      const pathAfter = lstatSync(requested, { bigint: true })
      const canonicalAfter = realpathSync(requested)
      if (!openedAfter.isFile() || openedAfter.nlink !== 1n || !sameTranscriptIdentity(openedIdentity, openedAfter)
        || openedAfter.size < captured.size || openedAfter.size > BigInt(Number.MAX_SAFE_INTEGER)
        || pathAfter.isSymbolicLink() || !pathAfter.isFile() || pathAfter.nlink !== 1n
        || !sameTranscriptIdentity(openedIdentity, pathAfter) || pathAfter.size < captured.size
        || pathAfter.size > BigInt(Number.MAX_SAFE_INTEGER) || canonicalAfter !== requested) {
        fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
      }
      const grew = openedAfter.size > captured.size || pathAfter.size > captured.size
      if (!grew && (!sameTranscriptStableMetadata(captured, openedAfter)
        || !sameTranscriptStableMetadata(captured, pathAfter))) {
        fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
      }
      minimumObservedSize = [minimumObservedSize, openedAfter.size, pathAfter.size]
        .reduce((largest, value) => value > largest ? value : largest)

      // A fixed range is internally consistent but is not the latest transcript once either the
      // open inode or its canonical path has grown. Never label that stale cut trusted. Retry to a
      // complete quiescent cut; a stable-required hook fails closed when the bounded attempts are
      // exhausted, while an optional hook receives no transcript rather than stale evidence.
      if (grew) {
        if (attempt + 1 < TRANSCRIPT_SNAPSHOT_ATTEMPTS) {
          boundedTranscriptRetryBackoff()
          continue
        }
        if (descriptor.transcript === 'stable-required') {
          fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_CHANGED_DURING_VERIFICATION`)
        }
        optionalTranscriptUnavailable = true
        break
      }

      const parsed = parsedTranscriptTail(range, sourceBytes, contract.access, descriptor)
      if (!parsed.incomplete) {
        materialized = sourceBytes === 0
          ? Buffer.alloc(0)
          : materializeTranscriptRecords(parsed.records, contract.access, descriptor)
        break
      }
      stableTrailingFailure(descriptor, parsed.incomplete)
    }
    if (materialized === undefined && !optionalTranscriptUnavailable) {
      fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_UNVERIFIED`)
    }
  } catch (error) {
    if (String(error?.message || '').startsWith('provider hook adapter blocked:')) throw error
    fail(`provider hook adapter blocked:${descriptor.hook}:TRANSCRIPT_UNVERIFIED:${error.message}`)
  } finally {
    if (handle !== null) {
      try { closeSync(handle) } catch {}
    }
  }
  if (optionalTranscriptUnavailable) return null
  const verifiedSnapshot = writePrivateTranscriptSnapshot(materialized, descriptor)
  awaitFailClosedTestSnapshotSignal(descriptor)
  return verifiedSnapshot
}

const providerArguments = argumentValues('--provider')
const hookArguments = argumentValues('--hook')
const eventArguments = argumentValues('--event')
const groupArguments = argumentValues('--group')
const targetRoleArguments = argumentValues('--target-role')
const authorityDecisionArguments = argumentValues('--authority-decision')
if (providerArguments.length !== 1 || !providerArguments[0]) {
  fail('provider hook adapter blocked:exactly one provider is required')
}
if (targetRoleArguments.length > 1 || (targetRoleArguments.length === 1 && !targetRoleArguments[0])) {
  fail('provider hook adapter blocked:target role selector is invalid')
}
const providerId = providerArguments[0]
const targetRole = targetRoleArguments[0] || null
if (authorityDecisionArguments.length > 1
  || (authorityDecisionArguments.length === 1
    && !['prepare', 'verify'].includes(authorityDecisionArguments[0]))) {
  fail('provider hook adapter blocked:authority decision mode must be prepare or verify')
}
const authorityDecisionMode = authorityDecisionArguments[0] || null
const singleHookMode = hookArguments.length === 1
  && eventArguments.length === 0
  && groupArguments.length === 0
const batchMode = hookArguments.length === 0
  && eventArguments.length === 1
  && groupArguments.length === 1
const selectedModeCount = [singleHookMode, batchMode, Boolean(authorityDecisionMode)].filter(Boolean).length
if (selectedModeCount !== 1
  || (authorityDecisionMode && (
    hookArguments.length !== 0
    || eventArguments.length !== 0
    || groupArguments.length !== 0
    || targetRole
  ))) {
  fail('provider hook adapter blocked:select exactly one hook, event/group batch, or authority decision mode')
}
const hookName = singleHookMode ? hookArguments[0] : null
const requestedEvent = batchMode ? eventArguments[0] : null
const requestedGroupText = batchMode ? groupArguments[0] : null
if (singleHookMode && !/^[A-Za-z0-9_.-]+$/.test(hookName || '')) {
  fail('provider hook adapter blocked:invalid hook name')
}
if (batchMode && (!/^[A-Za-z][A-Za-z0-9]*$/.test(requestedEvent || '')
  || !/^(?:0|[1-9][0-9]*)$/.test(requestedGroupText || ''))) {
  fail('provider hook adapter blocked:invalid event/group batch selector')
}
const requestedGroupIndex = batchMode ? Number(requestedGroupText) : null
const hookCorpusSnapshot = createAuthenticatedHookCorpusSnapshot(registry)
await awaitHookCorpusTestRelease(hookCorpusSnapshot.root)
try {
  const snapshotRegistryPath = resolve(
    hookCorpusSnapshot.root,
    'packages/governance/canonical/providers.json',
  )
  if (!isContainedPath(hookCorpusSnapshot.root, snapshotRegistryPath)) {
    throw new Error('authenticated provider registry escaped the private corpus')
  }
  registry = validateProviderRegistryDocument(JSON.parse(readFileSync(
    snapshotRegistryPath,
    'utf8',
  )))
  const snapshotRegistrationsPath = resolve(
    hookCorpusSnapshot.root,
    registry.canonical.hookRegistrations,
  )
  if (!isContainedPath(hookCorpusSnapshot.root, snapshotRegistrationsPath)) {
    throw new Error('authenticated hook registrations escaped the private corpus')
  }
  registrations = validateHookRegistrations(JSON.parse(readFileSync(
    snapshotRegistrationsPath,
    'utf8',
  )))
} catch (error) {
  failIntegrity(`provider hook adapter blocked:authenticated hook corpus contract is invalid:${error.message}`)
}
const provider = registry.providers.find((item) => item.id === providerId)
if (!provider) fail(`provider hook adapter blocked:unknown provider:${providerId || '<missing>'}`)
if (!authorityDecisionMode && (!provider.adapter?.generate || !provider.capabilities?.nativeHooks)) {
  fail(`provider hook adapter blocked:native hooks unavailable:${provider.id}`)
}
const marketplaceTransport = registry.canonical.compatibilityProjections.marketplacePluginTransport
if (targetRole && (
  !batchMode
  || provider.id !== marketplaceTransport.providerId
  || targetRole !== marketplaceTransport.governanceRole
  || marketplaceTransport.repositoryRole !== 'authority'
  || marketplaceTransport.projection !== 'full-canonical-registrations'
)) {
  fail('provider hook adapter blocked:target role selector does not match the canonical marketplace transport')
}
const payloadFreeProcessEnvironment = sanitizeProviderHookEnvironment({
  environment: process.env,
  registry,
})
payloadFreeProcessEnvironment.PATH = providerHookExecutablePath
const providerHookNormalizationLimits = Object.freeze({
  maximumPathCandidates: MAX_PROVIDER_HOOK_PATH_CANDIDATE_COUNT,
  maximumMutationOperations: MAX_PROVIDER_HOOK_MUTATION_OPERATION_COUNT,
  maximumMutationEdits: MAX_PROVIDER_HOOK_MUTATION_EDIT_COUNT,
  maximumPatchLines: MAX_PROVIDER_HOOK_PATCH_LINE_COUNT,
  maximumAggregateTextBytes: MAX_PROVIDER_HOOK_PROPOSED_AFTER_IMAGE_BYTES,
})
const batchTestObservationEnabled = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-batch-observe')
const observeBatch = (detail) => {
  if (batchTestObservationEnabled) writeSync(2, `provider hook batch test probe:${detail}\n`)
}

function verifiedProjectRoot(candidate) {
  try {
    const canonicalCandidate = realpathSync(resolve(candidate))
    const candidateInfo = lstatSync(canonicalCandidate)
    if (!candidateInfo.isDirectory() || candidateInfo.isSymbolicLink()) return ''
    assertClosedGitLocalConfiguration(canonicalCandidate)
    const result = runClosedGit(['rev-parse', '--show-toplevel'], {
      cwd: canonicalCandidate,
      maxOutputBytes: 1024 * 1024,
      timeoutMs: 5000,
    })
    if (result.error || result.signal || result.status !== 0 || !result.stdout?.trim()) return ''
    const root = realpathSync(resolve(result.stdout.trim()))
    const rootInfo = lstatSync(root)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return ''
    assertClosedGitLocalConfiguration(root)
    return root
  } catch {
    return ''
  }
}

// The executable/canonical corpus may live in an ephemeral plugin cache while all policy reads,
// changed paths, cwd, and runtime state belong to the target consumer checkout.
const legacyProjectVariable = provider.adapter.environmentMap?.GOVERNANCE_PROJECT_DIR
const explicitProjectHints = [
  process.env.GOVERNANCE_PROJECT_DIR,
  legacyProjectVariable ? process.env[legacyProjectVariable] : '',
].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
const projectRoots = explicitProjectHints.map(verifiedProjectRoot)
if (projectRoots.some((value) => !value)) fail('provider hook adapter blocked:PROJECT_ROOT_UNVERIFIED')
if (new Set(projectRoots).size > 1) fail('provider hook adapter blocked:PROJECT_ROOT_MISMATCH')
const PROJECT_ROOT = projectRoots[0] || verifiedProjectRoot(process.cwd())
if (!PROJECT_ROOT) fail('provider hook adapter blocked:PROJECT_ROOT_UNVERIFIED')

function targetGovernanceRole(root, repositoryPath) {
  const parts = String(repositoryPath || '').split('/')
  if (!repositoryPath || isAbsolute(repositoryPath) || repositoryPath.includes('\\')
    || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('target role manifest path is unsafe')
  }
  const target = resolve(root, repositoryPath)
  if (!isContainedPath(root, target)) throw new Error('target role manifest escapes the project root')
  if (!existsSync(target)) return null
  let cursor = root
  for (const part of parts) {
    cursor = join(cursor, part)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) throw new Error('target role manifest crosses a symbolic link')
  }
  const info = lstatSync(target)
  if (!info.isFile() || info.nlink !== 1 || info.size > 1024 * 1024 || realpathSync(target) !== target) {
    throw new Error('target role manifest is not one bounded canonical regular file')
  }
  const document = JSON.parse(readFileSync(target, 'utf8'))
  if (!document || typeof document !== 'object' || Array.isArray(document)
    || typeof document.defaultRole !== 'string' || !document.defaultRole) {
    throw new Error('target role manifest has no valid defaultRole')
  }
  return document.defaultRole
}

let targetRoleActive = true
if (targetRole) {
  let observedTargetRole
  try {
    observedTargetRole = targetGovernanceRole(PROJECT_ROOT, marketplaceTransport.targetRoleManifest)
  } catch (error) {
    failIntegrity(`provider hook adapter blocked:target role manifest is invalid:${error.message}`)
  }
  if (observedTargetRole !== targetRole) {
    targetRoleActive = false
  }
}
const hookToolProfile = materializeClosedHookToolProfile({ repoRoot: PROJECT_ROOT })
hookToolProfile.verify()

const registeredDescriptors = Object.entries(registrations.hooks || {}).flatMap(([event, groups]) =>
  groups.flatMap((group, groupIndex) => group.hooks.map((descriptor) => ({
    event,
    groupIndex,
    matcher: group.matcher,
    descriptor,
  }))))
if (singleHookMode
  && !registeredDescriptors.some((item) =>
    item.descriptor.kind === 'hook' && item.descriptor.hook === hookName)) {
  fail(`provider hook adapter blocked:hook is not registered:${hookName}`)
}
const requestedGroup = batchMode
  ? registrations.hooks?.[requestedEvent]?.[requestedGroupIndex] ?? null
  : null
if (batchMode && !requestedGroup) {
  fail(`provider hook adapter blocked:event/group is not registered:${requestedEvent}:${requestedGroupText}`)
}

const inputChunks = []
let inputBytes = 0
for await (const chunk of process.stdin) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  inputBytes += bytes.length
  if (inputBytes > MAX_PROVIDER_HOOK_INPUT_BYTES) {
    fail(`provider hook adapter blocked:input exceeds ${MAX_PROVIDER_HOOK_INPUT_BYTES} bytes`)
  }
  inputChunks.push(bytes)
}
if (!targetRoleActive) {
  clearTimeout(providerHookBatchDeadline)
  cleanupPrivateSnapshots()
  process.exit(0)
}
let raw
try {
  raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(inputChunks, inputBytes))
} catch {
  fail('provider hook adapter blocked:input is not strict UTF-8')
}
let input
try {
  input = JSON.parse(raw || '{}')
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('payload must be an object')
  }
} catch (error) {
  fail(`provider hook adapter blocked:invalid JSON payload:${error.message}`)
}

if (authorityDecisionMode) {
  const expectedKeys = [
    'operationText',
    'runtimeSurface',
    'schemaVersion',
    'scopeNonce',
    'sessionId',
    'target',
    'userMessages',
    ...(authorityDecisionMode === 'verify' ? ['receipt'] : []),
  ].sort(compareUtf8Bytes)
  const actualKeys = Object.keys(input).sort(compareUtf8Bytes)
  if (input.schemaVersion !== 1
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('provider hook adapter blocked:authority decision input has an open or incomplete shape')
  }
  try {
    const receiptContractPath = resolve(
      hookCorpusSnapshot.root,
      AUTHORITY_DECISION_RECEIPT_CONTRACT_PATH,
    )
    const classifierPath = resolve(
      hookCorpusSnapshot.root,
      'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs',
    )
    const authorityPolicyPath = resolve(hookCorpusSnapshot.root, 'AGENTS.md')
    const snapshotProviderRegistryPath = resolve(
      hookCorpusSnapshot.root,
      'packages/governance/canonical/providers.json',
    )
    for (const [path, label] of [
      [receiptContractPath, 'authority receipt contract'],
      [classifierPath, 'authority classifier'],
      [authorityPolicyPath, 'authority policy'],
      [snapshotProviderRegistryPath, 'provider registry'],
    ]) {
      if (!isContainedPath(hookCorpusSnapshot.root, path)) {
        fail(`provider hook adapter blocked:${label} escaped the authenticated corpus`)
      }
    }
    const receiptContract = await import(pathToFileURL(receiptContractPath).href)
    const classifier = await import(pathToFileURL(classifierPath).href)
    const evidenceInput = {
      authorityPolicyBytes: readFileSync(authorityPolicyPath),
      classifierSourceBytes: readFileSync(classifierPath),
      receiptContractSourceBytes: readFileSync(receiptContractPath),
      classifier,
      providerRegistry: registry,
      providerId: provider.id,
      runtimeSurface: input.runtimeSurface,
      sessionId: input.sessionId,
      scopeNonce: input.scopeNonce,
      target: input.target,
      operationText: input.operationText,
      userMessages: input.userMessages,
    }
    let receipt
    if (authorityDecisionMode === 'prepare') {
      receipt = receiptContract.prepareAuthorityDecisionReceipt(evidenceInput)
    } else {
      receiptContract.verifyAuthorityDecisionReceipt({
        receipt: input.receipt,
        ...evidenceInput,
      })
      receipt = input.receipt
    }
    const body = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
    let offset = 0
    while (offset < body.length) {
      const count = writeSync(1, body, offset, body.length - offset)
      if (count <= 0) fail('provider hook adapter blocked:authority decision receipt output did not advance')
      offset += count
    }
    cleanupPrivateSnapshots()
    process.exit(receipt.classification.decision === 'approved'
      ? 0
      : (provider.blockingExitCode || 2))
  } catch (error) {
    fail(`provider hook adapter blocked:authority decision receipt rejected:${error?.code || error?.message || 'UNKNOWN'}`)
  }
}

const hookInput = normalizeProviderHookInput({
  provider,
  input,
  repoRoot: PROJECT_ROOT,
  limits: providerHookNormalizationLimits,
  checkpoint: (label) => remainingProviderHookBatchMs(`normalize:${label}`),
})
observeBatch(`normalized:${inputBytes}`)
if (hookInput.issues.length) fail(providerHookIssueMessage(hookInput.issues[0]))
if (hookInput.records.length > MAX_PROVIDER_HOOK_CHANGED_FILE_COUNT) {
  fail(`provider hook adapter blocked:changed-file count exceeds ${MAX_PROVIDER_HOOK_CHANGED_FILE_COUNT}`)
}
const { event, tool, operation } = hookInput.normalized
const matcherMatches = (matcher) => !matcher || matcher.split('|').includes(tool)
let selectedRegistrations
if (singleHookMode) {
  selectedRegistrations = registeredDescriptors.filter((item) => (
    item.descriptor.kind === 'hook'
    && item.descriptor.hook === hookName
    && item.event === event
    && matcherMatches(item.matcher)
  ))
  if (selectedRegistrations.length !== 1) {
    fail(`provider hook adapter blocked:${hookName}:event/tool registration mismatch:${event || '<missing>'}:${tool || '<missing>'}`)
  }
} else {
  if (event !== requestedEvent || !matcherMatches(requestedGroup.matcher)) {
    fail(`provider hook adapter blocked:event/group payload mismatch:${requestedEvent}:${requestedGroupText}:${event || '<missing>'}:${tool || '<missing>'}`)
  }
  selectedRegistrations = registeredDescriptors
    .filter((item) => item.event === requestedEvent && item.groupIndex === requestedGroupIndex)
    .map((item) => ({
      ...item,
      eligibility: resolveProviderHookEligibility({
        registry,
        providerId: provider.id,
        descriptor: item.descriptor,
        hasUsableVersionedTranscript,
      }),
    }))
    .filter((item) => item.eligibility.eligible)
  if (!selectedRegistrations.length) {
    fail(`provider hook adapter blocked:event/group has no eligible hooks:${requestedEvent}:${requestedGroupText}`)
  }
}
if (selectedRegistrations.length > MAX_PROVIDER_HOOK_DESCRIPTOR_COUNT) {
  fail(`provider hook adapter blocked:descriptor count exceeds ${MAX_PROVIDER_HOOK_DESCRIPTOR_COUNT}`)
}
observeBatch(`selected:${selectedRegistrations.map((item) => item.descriptor.hook).join(',')}`)

const rawToolInput = input.tool_input && typeof input.tool_input === 'object' && !Array.isArray(input.tool_input)
  ? input.tool_input
  : {}
const compactToolInput = {}
if (operation !== 'write') {
  for (const field of ['command', 'prompt', 'script', 'skill', 'args']) {
    if (typeof rawToolInput[field] === 'string') compactToolInput[field] = rawToolInput[field]
  }
}
const changedFiles = hookInput.records.map((record) => {
  const source = record.source && typeof record.source === 'object' && !Array.isArray(record.source)
    ? record.source
    : {}
  return {
    path: record.path,
    ...(typeof record.content === 'string' && record.content.length
      ? { content: record.content }
      : {}),
    ...(typeof source.old_string === 'string' ? { old_string: source.old_string } : {}),
  }
})

function copyOptionalString(target, key, value) {
  if (value === undefined || value === null) return
  if (typeof value !== 'string') fail(`provider hook adapter blocked:${key} must be a string`)
  target[key] = value
}

const normalizedBase = {
  hook_event_name: event,
  event,
  tool_name: tool,
  tool,
  operation,
  tool_input: compactToolInput,
}
if (input.session_id !== undefined && input.session_id !== null) {
  if (typeof input.session_id !== 'string') {
    fail('provider hook adapter blocked:session_id must be a string')
  }
  if (Buffer.byteLength(input.session_id, 'utf8') > MAX_PROVIDER_HOOK_SESSION_IDENTIFIER_BYTES) {
    fail(`provider hook adapter blocked:session_id exceeds ${MAX_PROVIDER_HOOK_SESSION_IDENTIFIER_BYTES} bytes`)
  }
  normalizedBase.session_id = input.session_id
}
if (event === 'UserPromptSubmit') copyOptionalString(normalizedBase, 'prompt', input.prompt)
if (event === 'Stop') copyOptionalString(normalizedBase, 'last_assistant_message', input.last_assistant_message)
if (event === 'PostToolUse' && ['Agent', 'Task', 'Workflow'].includes(tool)) {
  if (typeof input.tool_response === 'string') {
    normalizedBase.tool_response = input.tool_response
  } else if (input.tool_response && typeof input.tool_response === 'object' && !Array.isArray(input.tool_response)) {
    const response = {}
    copyOptionalString(response, 'content', input.tool_response.content)
    if (Object.keys(response).length) normalizedBase.tool_response = response
  }
}

const hookRoot = resolve(hookCorpusSnapshot.root, registry.canonical.roots.hooks)
if (!isContainedPath(hookCorpusSnapshot.root, hookRoot)) {
  fail('provider hook adapter blocked:authenticated hook root escaped its private corpus')
}
const preparedDescriptors = selectedRegistrations.map((registered) => {
  const { descriptor } = registered
  const selectedHookName = descriptor.hook
  const outputMode = descriptor.outputMode ?? 'diagnostic'
  const inputContract = descriptor.inputContract ?? 'event-v1'
  if (!['event-v1', 'proposed-text-v1'].includes(inputContract)) {
    fail(`provider hook adapter blocked:${selectedHookName}:unsupported input contract:${inputContract}`)
  }
  if (inputContract === 'proposed-text-v1'
    && (registered.event !== 'PreToolUse' || operation !== 'write')) {
    fail(`provider hook adapter blocked:${selectedHookName}:proposed-text input contract requires a PreToolUse write`)
  }
  let peer = registered.eligibility?.peer ?? null
  if (descriptor.reviewSkill && !peer) {
    try {
      const resolved = resolveProviderReviewBinding({
        registry,
        skill: descriptor.reviewSkill,
        selfProviderId: provider.id,
        requireCertificationContract: ['deep-audit-cross-codex', 'independent-review'].includes(descriptor.reviewSkill),
      })
      peer = resolved.peer
      if (!peer && resolved.selectionReasonCode) {
        fail(`provider hook adapter blocked:${selectedHookName}:${resolved.selectionReasonCode}`)
      }
    } catch (error) {
      fail(`provider hook adapter blocked:${selectedHookName}:${error.code || 'PEER_REVIEW_BINDING_UNAVAILABLE'}`)
    }
  }
  for (const requirement of descriptor.requires || []) {
    if (requirement === 'peer-review-binding' && !peer) {
      fail(`provider hook adapter blocked:${selectedHookName}:PEER_REVIEW_BINDING_UNAVAILABLE`)
    }
    if (requirement === 'peer-cli') {
      const cli = peer?.runtime?.cli
      if (!peer
        || !cli?.executable
        || !cli?.localExecutable
        || !cli?.replyArtifactPrefix
        || !cli?.briefInvocationMarkers?.length
        || !cli?.discoveryMarkers?.length) {
        fail(`provider hook adapter blocked:${selectedHookName}:PEER_CLI_METADATA_UNAVAILABLE`)
      }
    }
  }
  const hookPath = resolve(hookRoot, selectedHookName)
  if (!isContainedPath(hookRoot, hookPath)) {
    fail('provider hook adapter blocked:hook path escaped canonical root')
  }
  const hookInfo = existsSync(hookPath) ? lstatSync(hookPath) : null
  if (!hookInfo
    || hookInfo.isSymbolicLink()
    || !hookInfo.isFile()
    || hookInfo.nlink !== 1) {
    fail(`provider hook adapter blocked:canonical hook executable is missing or unsafe:${selectedHookName}`)
  }
  const runtime = hookToolProfile.executables[descriptor.runtime]
  if (!runtime) fail(`provider hook adapter blocked:unsupported runtime:${descriptor.runtime}`)
  const runtimeArguments = descriptor.runtime === 'python3'
    ? ['-I', '-c', PYTHON_ISOLATED_HOOK_BOOTSTRAP, hookPath]
    : [hookPath]
  return {
    registered,
    descriptor,
    hookName: selectedHookName,
    hookPath,
    runtime,
    runtimeArguments,
    outputMode,
    inputContract,
    peer,
  }
})

const transcriptDescriptors = preparedDescriptors
  .filter((item) => item.descriptor.transcript && item.descriptor.transcript !== 'none')
const transcriptVerifier = transcriptDescriptors.find((item) =>
  item.descriptor.transcript === 'stable-required') ?? transcriptDescriptors[0] ?? null
const verifiedTranscriptSnapshot = transcriptVerifier
  ? verifiedVersionedTranscript(provider, transcriptVerifier.descriptor, input.transcript_path)
  : null
const verifiedTranscriptPath = verifiedTranscriptSnapshot?.path || ''

const environment = {
  ...payloadFreeProcessEnvironment,
  HOME: hookToolProfile.homeDirectory,
  LANG: 'C',
  LC_ALL: 'C',
  NO_COLOR: '1',
  PATH: hookToolProfile.executablePath,
  TMPDIR: hookToolProfile.tempDirectory,
  XDG_CONFIG_HOME: hookToolProfile.homeDirectory,
  GOVERNANCE_PROVIDER: provider.id,
  GOVERNANCE_TOOL_PROFILE_SHA256: hookToolProfile.profileSha256,
}
for (const [canonical, legacy] of Object.entries(provider.adapter.environmentMap || {})) {
  // The full payload is normalized from stdin below. A native tool-input alias
  // is registry metadata for sanitization, never a second payload transport.
  if (canonical === 'GOVERNANCE_TOOL_INPUT') continue
  if (legacy && process.env[legacy] !== undefined) environment[canonical] = process.env[legacy]
}
// The runner's verified repository root and native event payload outrank inherited neutral env.
// This prevents a shell profile from redirecting scans/telemetry into a different checkout.
environment.GOVERNANCE_PROJECT_DIR = PROJECT_ROOT
environment.GOVERNANCE_CORPUS_ROOT = hookCorpusSnapshot.root
environment.GOVERNANCE_HOOK_CORPUS_SHA256 = hookCorpusSnapshot.sha256
environment.GOVERNANCE_PROVIDER_REGISTRY = 'packages/governance/canonical/providers.json'
const gitDirectoryResult = runClosedGit(['rev-parse', '--absolute-git-dir'], {
  cwd: PROJECT_ROOT,
  maxOutputBytes: 1024 * 1024,
  timeoutMs: 5000,
})
let runtimeParent
let runtimeRoot
try {
  if (gitDirectoryResult.status === 0 && gitDirectoryResult.stdout.trim()) {
    runtimeParent = realpathSync(gitDirectoryResult.stdout.trim())
    runtimeRoot = resolve(runtimeParent, 'governance-runtime')
  } else {
    runtimeParent = realpathSync(hookToolProfile.tempDirectory)
    runtimeRoot = resolve(
      runtimeParent,
      'governance-runtime',
      createHash('sha256').update(PROJECT_ROOT).digest('hex').slice(0, 16),
    )
  }
} catch (error) {
  fail(`provider hook adapter blocked:GOVERNANCE_RUNTIME_ROOT_UNVERIFIED:${error.message}`)
}
// Validate the lexical path before any hook can read or write it. realpath(runtimeRoot) would
// silently bless a pre-existing symlink and let provider telemetry escape the repository.
assertNoExistingSymlink(runtimeParent, runtimeRoot, 'governance runtime root')
const telemetryOptIn = process.env.GOVERNANCE_TELEMETRY_OPT_IN === '1'
  && process.env.GOVERNANCE_READ_ONLY !== '1'
let stateDirectory = runtimeRoot
if (telemetryOptIn
  && typeof process.env.GOVERNANCE_STATE_DIR === 'string'
  && process.env.GOVERNANCE_STATE_DIR.trim()) {
  stateDirectory = resolve(process.env.GOVERNANCE_STATE_DIR.trim())
  if (!isContainedPath(runtimeRoot, stateDirectory, { allowRoot: true })) {
    fail('provider hook adapter blocked:GOVERNANCE_STATE_DIR_OUTSIDE_RUNTIME_ROOT')
  }
  assertNoExistingSymlink(runtimeRoot, stateDirectory, 'governance state directory')
}
environment.GOVERNANCE_RUNTIME_ROOT = runtimeRoot
environment.GOVERNANCE_STATE_DIR = stateDirectory
environment.GOVERNANCE_TELEMETRY_OPT_IN = telemetryOptIn ? '1' : '0'

// Provider identity, peer resolution, runtime discovery, and branch namespaces are registry-owned.
// Always overwrite inherited values so a shell profile cannot invert or spoof the review matrix.
environment.GOVERNANCE_SELF_PROVIDER = provider.id
environment.GOVERNANCE_SELF_DISPLAY_NAME = provider.displayName
environment.GOVERNANCE_INSTRUCTION_ENTRY = provider.instructionEntry
environment.GOVERNANCE_SHARED_INSTRUCTION_ENTRY = provider.sharedInstructionEntry
environment.GOVERNANCE_SKILL_DIRECTORY = provider.skillDirectory
environment.GOVERNANCE_CANONICAL_HOOK_ROOT = registry.canonical.roots.hooks
environment.GOVERNANCE_MEMORY_SYNC_SCRIPT = provider.runtime?.memorySyncScript || ''
environment.GOVERNANCE_TRANSCRIPT_CONTRACT = provider.runtime?.transcript?.contract || ''
environment.GOVERNANCE_BRANCH_NAMESPACES_JSON = JSON.stringify(
  registry.providers.map((item) => item.runtime?.branchNamespace).filter(Boolean),
)
environment.GOVERNANCE_REGISTERED_HOOK_COUNT = String(new Set(
  registeredDescriptors
    .filter((item) => item.descriptor.kind === 'hook')
    .filter((item) => resolveProviderHookEligibility({
      registry,
      providerId: provider.id,
      descriptor: item.descriptor,
      hasUsableVersionedTranscript,
    }).eligible)
    .map((item) => item.descriptor.hook),
).size)

const invocationFiles = operation === 'write' && changedFiles.length ? changedFiles : [null]
const invocationCount = preparedDescriptors.length * invocationFiles.length
if (!Number.isSafeInteger(invocationCount) || invocationCount > MAX_PROVIDER_HOOK_INVOCATION_COUNT) {
  fail(`provider hook adapter blocked:invocation count exceeds ${MAX_PROVIDER_HOOK_INVOCATION_COUNT}`)
}
const needsProposedState = preparedDescriptors.some((item) =>
  item.inputContract === 'proposed-text-v1')
let proposedStates = new Map()
if (needsProposedState) {
  const proposedDescriptor = preparedDescriptors.find((item) =>
    item.inputContract === 'proposed-text-v1')
  if (!hookInput.mutation || invocationFiles.some((changedFile) => !changedFile)) {
    fail(`provider hook adapter blocked:${proposedDescriptor.hookName}:PROPOSED_TEXT_MUTATION_UNAVAILABLE`)
  }
  try {
    const materialized = materializeProviderWriteStates({
      repoRoot: PROJECT_ROOT,
      mutation: hookInput.mutation,
      paths: invocationFiles.map((changedFile) => changedFile.path),
      limits: providerHookNormalizationLimits,
      checkpoint: (label) => remainingProviderHookBatchMs(`materialize:${label}`),
    })
    let totalAfterImageBytes = 0
    for (const state of materialized) {
      if (typeof state?.content === 'string') {
        totalAfterImageBytes += Buffer.byteLength(state.content, 'utf8')
      }
      if (!Number.isSafeInteger(totalAfterImageBytes)
        || totalAfterImageBytes > MAX_PROVIDER_HOOK_PROPOSED_AFTER_IMAGE_BYTES) {
        fail(`provider hook adapter blocked:proposed after-image bytes exceed ${MAX_PROVIDER_HOOK_PROPOSED_AFTER_IMAGE_BYTES}`)
      }
    }
    proposedStates = new Map(materialized.map((state) => [state.path, state]))
    observeBatch(`materialized:${materialized.length}`)
  } catch (error) {
    if (error?.code === 'AGGREGATE_TEXT_TOO_LARGE') {
      fail(`provider hook adapter blocked:proposed after-image bytes exceed ${MAX_PROVIDER_HOOK_PROPOSED_AFTER_IMAGE_BYTES}`)
    }
    fail(`provider hook adapter blocked:${proposedDescriptor.hookName}:PROPOSED_TEXT_MATERIALIZATION_FAILED:${error?.code || 'UNKNOWN'}`)
  }
}

function descriptorEnvironment(prepared) {
  const transcriptPath = prepared.descriptor.transcript
    && prepared.descriptor.transcript !== 'none'
    ? verifiedTranscriptPath
    : ''
  const peer = prepared.peer
  return {
    ...environment,
    GOVERNANCE_TRANSCRIPT_PATH: transcriptPath,
    GOVERNANCE_TRANSCRIPT_TRUST: transcriptPath
      ? 'tested-versioned-jsonl-quiescent-tail'
      : 'unavailable',
    // A trusted proposed state exists only when this runner materializes it from the
    // registry-selected provider transport. An inherited marker can never grant trust.
    GOVERNANCE_WRITE_STATE_TRUST: prepared.inputContract === 'proposed-text-v1'
      ? 'runner-v1'
      : 'unavailable',
    GOVERNANCE_PEER_PROVIDER: peer?.id || '',
    GOVERNANCE_PEER_DISPLAY_NAME: peer?.displayName || '',
    GOVERNANCE_PEER_CLI: peer?.runtime?.cli?.executable || '',
    GOVERNANCE_PEER_LOCAL_EXECUTABLE: peer?.runtime?.cli?.localExecutable || '',
    GOVERNANCE_PEER_BRIEF_MARKERS_JSON: JSON.stringify(
      peer?.runtime?.cli?.briefInvocationMarkers || [],
    ),
    GOVERNANCE_PEER_DISCOVERY_MARKERS_JSON: JSON.stringify(
      peer?.runtime?.cli?.discoveryMarkers || [],
    ),
    GOVERNANCE_PEER_REPLY_ARTIFACT_PREFIX: peer?.runtime?.cli?.replyArtifactPrefix || '',
  }
}

function strictChildOutput(value, channel, selectedHookName) {
  if (!Buffer.isBuffer(value)) {
    failIntegrity(`provider hook child ${channel} capture is not a byte buffer:${selectedHookName}`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch {
    failIntegrity(`provider hook child ${channel} is not strict UTF-8:${selectedHookName}`)
  }
}

let aggregateChildOutputBytes = 0
let emittedProviderOutputBytes = 0

async function writeBoundedProviderOutput(stream, value, label) {
  const text = String(value)
  emittedProviderOutputBytes += Buffer.byteLength(text, 'utf8')
  if (!Number.isSafeInteger(emittedProviderOutputBytes)
    || emittedProviderOutputBytes > MAX_PROVIDER_HOOK_EMITTED_OUTPUT_BYTES) {
    failIntegrity(`provider hook emitted output exceeds ${MAX_PROVIDER_HOOK_EMITTED_OUTPUT_BYTES} bytes:${label}`)
  }
  await new Promise((accept, reject) => {
    const onError = (error) => {
      stream.removeListener('error', onError)
      reject(error)
    }
    stream.once('error', onError)
    stream.write(text, (error) => {
      stream.removeListener('error', onError)
      if (error) reject(error)
      else accept()
    })
  }).catch((error) => {
    failIntegrity(`provider hook output flush failed:${label}:${error?.code || error?.message || 'UNKNOWN'}`)
  })
  remainingProviderHookBatchMs(`after-output:${label}`)
}

function appendBoundedChildOutput({ chunks, channel, state, chunk, prepared, child }) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  channel.bytes += bytes.length
  aggregateChildOutputBytes += bytes.length
  if (channel.bytes > MAX_PROVIDER_HOOK_CHILD_OUTPUT_BYTES) {
    state.failure ||= `provider hook child ${channel.name} exceeds ${MAX_PROVIDER_HOOK_CHILD_OUTPUT_BYTES} bytes:${prepared.hookName}`
  }
  if (!Number.isSafeInteger(aggregateChildOutputBytes)
    || aggregateChildOutputBytes > MAX_PROVIDER_HOOK_AGGREGATE_OUTPUT_BYTES) {
    state.failure ||= `provider hook aggregate child output exceeds ${MAX_PROVIDER_HOOK_AGGREGATE_OUTPUT_BYTES} bytes`
  }
  if (state.failure) {
    signalChildTree(child, 'SIGKILL')
    return
  }
  chunks.push(bytes)
}

async function runProviderHookChild({ prepared, environment: childEnvironment, input: childInput }) {
  const remainingBatchMs = remainingProviderHookBatchMs(`before-child:${prepared.hookName}`)
  const timeoutMs = Math.min(PROVIDER_HOOK_CHILD_TIMEOUT_MS, remainingBatchMs)
  const batchDeadlineOwnsTimeout = remainingBatchMs <= PROVIDER_HOOK_CHILD_TIMEOUT_MS
  hookToolProfile.verify()
  const child = spawn(prepared.runtime, prepared.runtimeArguments, {
    cwd: childEnvironment.GOVERNANCE_PROJECT_DIR,
    env: childEnvironment,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  activeHookChildren.add(child)
  const stdoutChunks = []
  const stderrChunks = []
  const state = {
    failure: '',
    launchError: null,
    timedOut: false,
    stdout: { bytes: 0, name: 'stdout' },
    stderr: { bytes: 0, name: 'stderr' },
  }
  child.stdout?.on('data', (chunk) => appendBoundedChildOutput({
    chunks: stdoutChunks,
    channel: state.stdout,
    state,
    chunk,
    prepared,
    child,
  }))
  child.stderr?.on('data', (chunk) => appendBoundedChildOutput({
    chunks: stderrChunks,
    channel: state.stderr,
    state,
    chunk,
    prepared,
    child,
  }))
  child.once('error', (error) => {
    state.launchError = error
  })
  child.stdin?.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      state.failure ||= `provider hook child stdin failed:${prepared.hookName}:${error.code || error.message}`
      signalChildTree(child, 'SIGKILL')
    }
  })
  const completion = new Promise((accept) => {
    child.once('close', (status, signal) => accept({ signal, status }))
  })
  const timer = setTimeout(() => {
    state.timedOut = true
    signalChildTree(child, 'SIGKILL')
  }, timeoutMs)
  try {
    child.stdin?.end(childInput)
  } catch (error) {
    state.failure ||= `provider hook child stdin failed:${prepared.hookName}:${error.code || error.message}`
    signalChildTree(child, 'SIGKILL')
  }

  let completionResult
  try {
    completionResult = await completion
    await cleanupCompletedHookProcessGroup(child, prepared.hookName)
  } finally {
    clearTimeout(timer)
    activeHookChildren.delete(child)
    hookToolProfile.verify()
  }
  if (signalShutdownStarted) await new Promise(() => {})
  if (state.launchError) {
    failIntegrity(`provider hook child execution failed:${prepared.hookName}:${state.launchError.code || 'UNKNOWN'}`)
  }
  if (state.timedOut) {
    if (batchDeadlineOwnsTimeout) {
      failIntegrity(`provider hook batch exceeded ${providerHookBatchRuntimeLimitMs}ms:during-child:${prepared.hookName}`)
    }
    failIntegrity(`provider hook child timed out after ${PROVIDER_HOOK_CHILD_TIMEOUT_MS}ms:${prepared.hookName}`)
  }
  if (state.failure) failIntegrity(state.failure)
  if (completionResult.status === null || completionResult.signal) {
    failIntegrity(`provider hook child terminated without an exit record:${prepared.hookName}:${completionResult.signal || 'unknown'}`)
  }
  remainingProviderHookBatchMs(`after-child:${prepared.hookName}`)
  return {
    status: completionResult.status,
    stdout: Buffer.concat(stdoutChunks, state.stdout.bytes),
    stderr: Buffer.concat(stderrChunks, state.stderr.bytes),
  }
}

let governanceDecision = null
const governanceContexts = []
dispatch:
for (const prepared of preparedDescriptors) {
  const descriptorContexts = []
  const descriptorHasTranscript = prepared.descriptor.transcript
    && prepared.descriptor.transcript !== 'none'
  const descriptorBase = {
    ...normalizedBase,
    transcript_path: descriptorHasTranscript ? verifiedTranscriptPath : '',
  }
  const childEnvironment = descriptorEnvironment(prepared)
  for (const changedFile of invocationFiles) {
    const absolutePath = changedFile ? resolve(PROJECT_ROOT, changedFile.path) : ''
    const invocationContent = changedFile
      ? (changedFile.content || hookInput.sharedContent)
      : ''
    // proposed-text-v1 consumes only the exact trusted after-image. Do not duplicate the raw
    // provider edit body beside it; event-v1 retains the legacy path-local fragment contract.
    const materializedFile = changedFile
      ? prepared.inputContract === 'proposed-text-v1'
        ? { file_path: absolutePath, path: absolutePath }
        : {
            ...changedFile,
            file_path: absolutePath,
            path: absolutePath,
            ...(invocationContent
              ? { content: invocationContent }
              : {}),
          }
      : null
    const invocationToolInput = { ...descriptorBase.tool_input }
    for (const field of ['edits', 'changed_paths', 'changes', 'files']) {
      delete invocationToolInput[field]
    }
    const governanceWriteState = changedFile
      ? proposedStates.get(changedFile.path) ?? null
      : null
    if (prepared.inputContract === 'proposed-text-v1' && !governanceWriteState) {
      fail(`provider hook adapter blocked:${prepared.hookName}:PROPOSED_TEXT_STATE_MISSING`)
    }
    const normalized = changedFile
      ? {
          ...descriptorBase,
          tool_input: {
            ...invocationToolInput,
            ...materializedFile,
            ...(governanceWriteState ? { governance_write_state: governanceWriteState } : {}),
          },
          changed_paths: [absolutePath],
        }
      : descriptorBase
    // Keep only the current child payload alive. A per-path cache retains one complete copy of
    // shared metadata for every changed path and turns a bounded input into O(paths × metadata)
    // live heap. Descriptor order remains outer-first and file order remains inner-first.
    const serializedInput = buildProviderHookStdinInvocation({
      environment: {},
      payload: normalized,
      registry,
    }).input
    const serializedInputBytes = Buffer.byteLength(serializedInput, 'utf8')
    if (serializedInputBytes > MAX_PROVIDER_HOOK_CHILD_INPUT_BYTES) {
      fail(`provider hook adapter blocked:${prepared.hookName}:child input exceeds ${MAX_PROVIDER_HOOK_CHILD_INPUT_BYTES} bytes`)
    }
    observeBatch(`serialized:${prepared.hookName}:${changedFile?.path || '<event>'}:${serializedInputBytes}`)
    const invocationEnvironment = sanitizeProviderHookEnvironment({
      environment: childEnvironment,
      registry,
    })
    invocationEnvironment.HOME = hookToolProfile.homeDirectory
    invocationEnvironment.LANG = 'C'
    invocationEnvironment.LC_ALL = 'C'
    invocationEnvironment.NO_COLOR = '1'
    invocationEnvironment.PATH = hookToolProfile.executablePath
    invocationEnvironment.TMPDIR = hookToolProfile.tempDirectory
    invocationEnvironment.XDG_CONFIG_HOME = hookToolProfile.homeDirectory
    invocationEnvironment.PYTHONNOUSERSITE = '1'
    invocationEnvironment.PYTHONDONTWRITEBYTECODE = '1'
    if (verifiedTranscriptSnapshot && descriptorHasTranscript) {
      verifyPrivateTranscriptSnapshot(verifiedTranscriptSnapshot, prepared.descriptor)
    }
    observeBatch(`invoke:${prepared.hookName}:${changedFile?.path || '<event>'}`)
    const result = await runProviderHookChild({
      prepared,
      environment: invocationEnvironment,
      input: serializedInput,
    })
    if (verifiedTranscriptSnapshot && descriptorHasTranscript) {
      verifyPrivateTranscriptSnapshot(verifiedTranscriptSnapshot, prepared.descriptor)
    }
    const stdout = strictChildOutput(result.stdout, 'stdout', prepared.hookName)
    const stderr = strictChildOutput(result.stderr, 'stderr', prepared.hookName)
    const status = result.status
    if (prepared.outputMode === 'diagnostic') {
      if (status !== 0) {
        const detail = String(stderr || stdout || `child exited ${status}`).trim().slice(0, 4000)
        failIntegrity(`provider diagnostic hook failed:${prepared.hookName}:exit-${status}:${detail || 'no diagnostic'}`)
      }
      if (stdout.length) {
        failIntegrity(`provider hook adapter blocked:${prepared.hookName}:raw success stdout is forbidden`)
      }
      if (stderr.includes('GOVERNANCE_INTEGRITY:')) {
        failIntegrity(`provider diagnostic hook emitted the reserved integrity marker:${prepared.hookName}`)
      }
      if (stderr) await writeBoundedProviderOutput(process.stderr, stderr, `diagnostic:${prepared.hookName}`)
      continue
    }

    let interpreted
    try {
      interpreted = interpretProviderHookChildResult({
        status,
        outputMode: prepared.outputMode,
        event: prepared.registered.event,
        stdout,
        stderr,
      })
    } catch (error) {
      failIntegrity(`provider hook adapter blocked:${prepared.hookName}:${error?.code || 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE'}`)
    }
    if (interpreted.kind === 'policy-block') {
      await writeBoundedProviderOutput(process.stderr, `${interpreted.reason}\n`, `policy:${prepared.hookName}`)
      process.exit(provider.blockingExitCode)
    }
    if (interpreted.kind === 'governance-context') {
      descriptorContexts.push(interpreted.message)
    } else if (interpreted.kind === 'governance-decision') {
      governanceDecision = {
        governanceDecision: interpreted.decision,
        reason: interpreted.reason,
      }
    } else if (interpreted.kind !== 'clean') {
      failIntegrity(`provider hook adapter blocked:${prepared.hookName}:unknown interpreted child result`)
    }
    if (governanceDecision) break dispatch
  }
  if (descriptorContexts.length) {
    governanceContexts.push([...new Set(descriptorContexts)].join('\n\n'))
  }
}

if (governanceDecision) {
  const transport = provider.runtime?.stopDecisionTransport
  const output = formatProviderStopDecision({ transport, reason: governanceDecision.reason })
  if (output) {
    await writeBoundedProviderOutput(process.stdout, `${JSON.stringify(output)}\n`, 'stop-decision')
    process.exit(0)
  }
  if (transport === 'blocking-exit') {
    await writeBoundedProviderOutput(process.stderr, `${governanceDecision.reason}\n`, 'stop-decision')
    process.exit(provider.blockingExitCode)
  }
  failIntegrity('provider hook adapter blocked:STOP_DECISION_TRANSPORT_UNAVAILABLE')
}
if (governanceContexts.length) {
  const message = governanceContexts.join('\n\n')
  const transport = provider.runtime?.contextOutputTransport
  const output = formatProviderHookContext({ transport, event, message })
  if (output) {
    await writeBoundedProviderOutput(process.stdout, `${JSON.stringify(output)}\n`, 'governance-context')
    process.exit(0)
  }
  if (transport === 'stderr') {
    await writeBoundedProviderOutput(process.stderr, `${message}\n`, 'governance-context')
    process.exit(0)
  }
  failIntegrity('provider hook adapter blocked:CONTEXT_OUTPUT_TRANSPORT_UNAVAILABLE')
}
process.exit(0)
