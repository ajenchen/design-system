#!/usr/bin/env node
// Provider-neutral product hook dispatcher. The shell launcher establishes the consumer checkout
// and neutral runtime directories; this module owns all payload, descriptor, proposed-state, child
// execution, and output contracts so every provider consumes one fail-closed implementation.

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
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
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  normalizeProviderEventPayload,
  PROVIDER_HOOK_DISPATCH_LIMITS,
} from './normalize-provider-event.mjs'
import {
  formatProviderHookContext,
  formatProviderStopDecision,
  interpretProviderHookChildResult,
  providerHookOutputContract,
  sanitizeProviderHookEnvironment,
} from './provider-hook-output-transport.mjs'

const MAX_INPUT_BYTES = 64 * 1024 * 1024
const MAX_CHILD_CHANNEL_BYTES = 1024 * 1024
const MAX_AGGREGATE_CHILD_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_EMITTED_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_CORPUS_ENTRY_BYTES = 4 * 1024 * 1024
const MAX_CORPUS_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_CORPUS_SNAPSHOT_ENTRIES = 4096
const CHILD_TIMEOUT_MS = 30_000
const BATCH_RUNTIME_MS = 120_000
const SIGNAL_GRACE_MS = 150
const SIGNAL_KILL_WAIT_MS = 100
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true })
const RUNTIMES = Object.freeze({ bash: '/bin/bash', python3: '/usr/bin/python3' })
const CHILD_INTEGRITY_MARKER = 'GOVERNANCE_INTEGRITY:'
const EVENT_PASSTHROUGH_FIELDS = Object.freeze({
  SessionStart: Object.freeze(['cwd', 'session_id', 'source']),
  Stop: Object.freeze(['session_id']),
  UserPromptSubmit: Object.freeze(['cwd', 'permission_mode', 'prompt', 'session_id']),
})
const PASSTHROUGH_TOOL_FIELDS = Object.freeze([
  'command',
])
const OUTPUT_MODES = new Set([
  'diagnostic',
  'blocking',
  'governance-context',
  'governance-decision',
  'governance-context-or-block',
])
const INPUT_CONTRACTS = new Set(['event-v1', 'proposed-text-v1'])
const TRANSCRIPT_REQUIREMENTS = new Set(['none', 'optional', 'stable-required'])
const corpusSnapshotRoots = new Set()
const activeChildren = new Set()
const batchStartedAt = process.hrtime.bigint()
const batchRuntimeLimitMs = process.env.NODE_ENV === 'test'
  && (
    process.argv.includes('--test-short-batch-runtime')
    || process.env.GOVERNANCE_PRODUCT_TEST_SHORT_BATCH_RUNTIME === '1'
  )
  ? 750
  : BATCH_RUNTIME_MS
let aggregateChildOutputBytes = 0
let emittedOutputBytes = 0
let batchDeadlineTimer = null
let shutdownStarted = false

function cleanupCorpusSnapshots() {
  for (const root of corpusSnapshotRoots) {
    try {
      makePrivateTreeRemovable(root)
      rmSync(root, { recursive: true, force: true })
    } catch {}
    corpusSnapshotRoots.delete(root)
  }
}

function makePrivateTreeRemovable(root, current = root) {
  let info
  try {
    info = lstatSync(current)
  } catch {
    return
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return
  chmodSync(current, 0o700)
  for (const name of readdirSync(current)) {
    const child = resolve(current, name)
    const childInfo = lstatSync(child)
    if (childInfo.isDirectory() && !childInfo.isSymbolicLink()) {
      makePrivateTreeRemovable(root, child)
    }
  }
}

const boundedDelay = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds))

function signalChildTree(child, signal) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try { child.kill(signal) } catch {}
  }
}

async function terminateChildTrees(children) {
  const captured = [...children]
  for (const child of captured) signalChildTree(child, 'SIGTERM')
  if (!captured.length) return
  await boundedDelay(SIGNAL_GRACE_MS)
  for (const child of captured) signalChildTree(child, 'SIGKILL')
  await boundedDelay(SIGNAL_KILL_WAIT_MS)
}

async function shutdownForSignal(exitCode) {
  if (shutdownStarted) return
  shutdownStarted = true
  if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
  await terminateChildTrees(activeChildren)
  cleanupCorpusSnapshots()
  process.exit(exitCode)
}

async function shutdownForDeadline() {
  if (shutdownStarted) return
  shutdownStarted = true
  if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
  await terminateChildTrees(activeChildren)
  cleanupCorpusSnapshots()
  process.stderr.write(
    `GOVERNANCE_INTEGRITY:PRODUCT_HOOK_RUNTIME_FAILED:product hook batch exceeded ${batchRuntimeLimitMs}ms:deadline\n`,
  )
  process.exit(70)
}

process.once('exit', cleanupCorpusSnapshots)
process.once('SIGINT', () => { void shutdownForSignal(130) })
process.once('SIGTERM', () => { void shutdownForSignal(143) })

class ProductHookIntegrityError extends Error {
  constructor(message, { childStderr = '' } = {}) {
    super(message)
    this.name = 'ProductHookIntegrityError'
    this.code = 'PRODUCT_HOOK_INTEGRITY_FAILURE'
    this.childStderr = childStderr
  }
}

function integrity(message, options) {
  throw new ProductHookIntegrityError(message, options)
}

function batchElapsedMs() {
  return Number(process.hrtime.bigint() - batchStartedAt) / 1_000_000
}

function remainingBatchMs(label) {
  const remaining = batchRuntimeLimitMs - batchElapsedMs()
  if (remaining <= 0) {
    integrity(`product hook batch exceeded ${batchRuntimeLimitMs}ms:${label}`)
  }
  return Math.max(1, Math.floor(remaining))
}

function writeBoundedOutput(stream, value, label) {
  const text = String(value)
  emittedOutputBytes += Buffer.byteLength(text, 'utf8')
  if (!Number.isSafeInteger(emittedOutputBytes)
    || emittedOutputBytes > MAX_EMITTED_OUTPUT_BYTES) {
    integrity(`emitted output exceeds ${MAX_EMITTED_OUTPUT_BYTES} bytes:${label}`)
  }
  stream.write(text)
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) integrity(`${label} must be an object`)
  return value
}

function readJson(path, label) {
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    integrity(`${label} is unavailable or invalid:${error.message}`)
  }
  return object(value, label)
}

function readBoundedRegularJson(path, label) {
  let pathInfo
  try {
    pathInfo = lstatSync(path, { bigint: true })
  } catch (error) {
    integrity(`${label} cannot be inspected:${error.code || error.message}`)
  }
  if (
    pathInfo.isSymbolicLink()
    || !pathInfo.isFile()
    || pathInfo.nlink !== 1n
    || pathInfo.size > BigInt(MAX_CORPUS_ENTRY_BYTES)
  ) {
    integrity(`${label} must be one bounded regular unaliased file`)
  }
  let handle
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(path, fsConstants.O_RDONLY | noFollow)
    const opened = fstatSync(handle, { bigint: true })
    if (
      !opened.isFile()
      || opened.nlink !== 1n
      || opened.dev !== pathInfo.dev
      || opened.ino !== pathInfo.ino
      || opened.size !== pathInfo.size
    ) {
      integrity(`${label} changed while being opened`)
    }
    const bytes = Buffer.alloc(Number(opened.size))
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) integrity(`${label} changed while being read`)
      offset += count
    }
    let body
    try {
      body = STRICT_UTF8.decode(bytes)
    } catch {
      integrity(`${label} is not strict UTF-8`)
    }
    return object(JSON.parse(body), label)
  } catch (error) {
    if (error instanceof ProductHookIntegrityError) throw error
    integrity(`${label} is unavailable or invalid:${error.code || error.message}`)
  } finally {
    if (handle !== undefined) closeSync(handle)
  }
}

async function readBoundedStdin() {
  const chunks = []
  let total = 0
  try {
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += bytes.length
      if (total > MAX_INPUT_BYTES) integrity(`provider input exceeds ${MAX_INPUT_BYTES} bytes`)
      chunks.push(bytes)
    }
  } catch (error) {
    if (error instanceof ProductHookIntegrityError) throw error
    integrity(`provider input read failed:${error.message}`)
  }
  try {
    return STRICT_UTF8.decode(Buffer.concat(chunks, total))
  } catch {
    integrity('provider input is not strict UTF-8')
  }
}

function canonicalDescriptor(value, index, event) {
  const descriptor = object(value, `hook descriptor ${event}[${index}]`)
  const {
    file,
    runtime,
    outputMode,
    inputContract,
    matcher,
    transcriptRequirement,
  } = descriptor
  if (typeof file !== 'string' || !file.startsWith('hooks/')) {
    integrity(`hook descriptor ${event}[${index}] has an unsafe file`)
  }
  const parts = file.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    integrity(`hook descriptor ${event}[${index}] has an unsafe file`)
  }
  if (!Object.hasOwn(RUNTIMES, runtime)) {
    integrity(`hook descriptor ${event}[${index}] has unsupported runtime:${runtime || '<missing>'}`)
  }
  if (!OUTPUT_MODES.has(outputMode)) {
    integrity(`hook descriptor ${event}[${index}] has unsupported outputMode:${outputMode || '<missing>'}`)
  }
  if (!INPUT_CONTRACTS.has(inputContract)) {
    integrity(`hook descriptor ${event}[${index}] has unsupported inputContract:${inputContract || '<missing>'}`)
  }
  if (typeof matcher !== 'string') {
    integrity(`hook descriptor ${event}[${index}] has invalid matcher`)
  }
  if (!TRANSCRIPT_REQUIREMENTS.has(transcriptRequirement)) {
    integrity(`hook descriptor ${event}[${index}] has unsupported transcriptRequirement:${transcriptRequirement || '<missing>'}`)
  }
  return Object.freeze({
    ...descriptor,
    file,
    runtime,
    outputMode,
    inputContract,
    matcher,
    transcriptRequirement,
  })
}

function descriptorMatchesTool(descriptor, tool) {
  return !descriptor.matcher || descriptor.matcher.split('|').includes(tool)
}

function containedPath(root, candidate, { allowRoot = false } = {}) {
  const rel = relative(root, candidate)
  return (allowRoot && !rel) || Boolean(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function canonicalCorpusEntryPath(forkRoot, file, label) {
  if (
    typeof file !== 'string'
    || !file
    || file.includes('\0')
    || isAbsolute(file)
    || file.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')
  ) {
    integrity(`${label} has an unsafe corpus-relative path`)
  }
  const absolute = resolve(forkRoot, file)
  if (!containedPath(forkRoot, absolute)) integrity(`${label} escapes the fork corpus:${file}`)
  return absolute
}

function authenticatedCorpusEntry({ forkRoot, file, expected }) {
  const label = `corpus entry ${file}`
  const absolute = canonicalCorpusEntryPath(forkRoot, file, label)
  let cursor = forkRoot
  for (const segment of file.split('/')) {
    cursor = resolve(cursor, segment)
    let info
    try {
      info = lstatSync(cursor)
    } catch (error) {
      integrity(`${label} cannot be inspected:${error.code || error.message}`)
    }
    if (info.isSymbolicLink()) integrity(`${label} crosses a symbolic link`)
  }

  let handle
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(absolute, fsConstants.O_RDONLY | noFollow)
  } catch (error) {
    integrity(`${label} cannot be opened without following links:${error.code || error.message}`)
  }
  try {
    const info = fstatSync(handle, { bigint: true })
    if (!info.isFile() || info.nlink !== 1n || info.size > BigInt(MAX_CORPUS_ENTRY_BYTES)) {
      integrity(`${label} must be one bounded regular unaliased file`)
    }
    const bytes = Buffer.alloc(Number(info.size))
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) integrity(`${label} changed while being authenticated`)
      offset += count
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== expected) integrity(`${label} differs from the immutable corpus lock`)
    return Object.freeze({ bytes, file })
  } finally {
    closeSync(handle)
  }
}

function writePrivateSnapshotEntry(root, entry) {
  const target = canonicalCorpusEntryPath(root, entry.file, `snapshot entry ${entry.file}`)
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  chmodSync(dirname(target), 0o700)
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  let handle
  try {
    handle = openSync(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o500,
    )
    let offset = 0
    while (offset < entry.bytes.length) {
      const count = writeSync(handle, entry.bytes, offset, entry.bytes.length - offset, offset)
      if (count <= 0) integrity(`snapshot entry could not be written:${entry.file}`)
      offset += count
    }
    fchmodSync(handle, 0o500)
  } catch (error) {
    if (error instanceof ProductHookIntegrityError) throw error
    integrity(`snapshot entry could not be materialized:${entry.file}:${error.code || error.message}`)
  } finally {
    if (handle !== undefined) closeSync(handle)
  }
}

function sealPrivateSnapshotDirectories(root, current = root) {
  for (const name of readdirSync(current)) {
    const child = resolve(current, name)
    const info = lstatSync(child)
    if (info.isDirectory() && !info.isSymbolicLink()) {
      sealPrivateSnapshotDirectories(root, child)
    }
  }
  chmodSync(current, 0o500)
}

function verifyPrivateSnapshot(snapshot) {
  const expected = new Map(snapshot.entries.map((entry) => [entry.file, entry]))
  const actual = new Set()
  const walk = (current, relativePath = '') => {
    const info = lstatSync(current, { bigint: true })
    if (info.isSymbolicLink()) integrity(`authenticated snapshot crosses a symbolic link:${relativePath || '.'}`)
    if (info.isDirectory()) {
      if ((info.mode & 0o777n) !== 0o500n || realpathSync(current) !== current) {
        integrity(`authenticated snapshot directory is not sealed:${relativePath || '.'}`)
      }
      for (const name of readdirSync(current).sort()) {
        walk(resolve(current, name), relativePath ? `${relativePath}/${name}` : name)
      }
      return
    }
    if (!info.isFile() || info.nlink !== 1n || (info.mode & 0o777n) !== 0o500n) {
      integrity(`authenticated snapshot entry is unsafe:${relativePath}`)
    }
    const entry = expected.get(relativePath)
    if (!entry || info.size !== BigInt(entry.bytes.length) || realpathSync(current) !== current) {
      integrity(`authenticated snapshot inventory differs from its lock:${relativePath}`)
    }
    const bytes = readFileSync(current)
    if (!bytes.equals(entry.bytes)) {
      integrity(`authenticated snapshot entry changed after materialization:${relativePath}`)
    }
    actual.add(relativePath)
  }
  walk(snapshot.root)
  if (
    actual.size !== expected.size
    || [...expected.keys()].some((file) => !actual.has(file))
  ) {
    integrity('authenticated snapshot path set differs from its lock')
  }
}

function createAuthenticatedCorpusSnapshot({ forkRoot, entries }) {
  if (entries.length > MAX_CORPUS_SNAPSHOT_ENTRIES) {
    integrity(`fork corpus lock exceeds ${MAX_CORPUS_SNAPSHOT_ENTRIES} entries`)
  }
  const authenticated = []
  let total = 0
  for (const [index, entry] of entries.entries()) {
    object(entry, `fork corpus lock entry ${index}`)
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      integrity(`fork corpus lock entry ${index} has an invalid digest`)
    }
    const locked = authenticatedCorpusEntry({
      forkRoot,
      file: entry.file,
      expected: entry.sha256,
    })
    total += locked.bytes.length
    if (total > MAX_CORPUS_SNAPSHOT_BYTES) {
      integrity(`fork corpus snapshot exceeds ${MAX_CORPUS_SNAPSHOT_BYTES} bytes`)
    }
    authenticated.push(locked)
  }

  let snapshotRoot
  try {
    snapshotRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'qijenchen-product-corpus-')))
    chmodSync(snapshotRoot, 0o700)
    corpusSnapshotRoots.add(snapshotRoot)
    for (const entry of authenticated) writePrivateSnapshotEntry(snapshotRoot, entry)
    sealPrivateSnapshotDirectories(snapshotRoot)
    const snapshot = Object.freeze({
      root: snapshotRoot,
      entries: Object.freeze([...authenticated]),
    })
    verifyPrivateSnapshot(snapshot)
    return snapshot
  } catch (error) {
    if (snapshotRoot) {
      corpusSnapshotRoots.delete(snapshotRoot)
      try {
        makePrivateTreeRemovable(snapshotRoot)
        rmSync(snapshotRoot, { recursive: true, force: true })
      } catch {}
    }
    throw error
  }
}

function snapshotHookPath(snapshotRoot, descriptor) {
  const absolute = canonicalCorpusEntryPath(snapshotRoot, descriptor.file, `hook ${descriptor.file}`)
  let info
  try {
    info = lstatSync(absolute)
  } catch (error) {
    integrity(`authenticated hook snapshot is unavailable:${descriptor.file}:${error.code || error.message}`)
  }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    integrity(`authenticated hook snapshot is unsafe:${descriptor.file}`)
  }
  return absolute
}

function appendBounded(chunks, channelState, executionState, chunk, label, child) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  channelState.total += bytes.length
  aggregateChildOutputBytes += bytes.length
  if (channelState.total > MAX_CHILD_CHANNEL_BYTES) {
    executionState.failure ||= `${label} exceeded ${MAX_CHILD_CHANNEL_BYTES} bytes`
  }
  if (!Number.isSafeInteger(aggregateChildOutputBytes)
    || aggregateChildOutputBytes > MAX_AGGREGATE_CHILD_OUTPUT_BYTES) {
    executionState.failure ||= `aggregate child output exceeds ${MAX_AGGREGATE_CHILD_OUTPUT_BYTES} bytes`
  }
  if (executionState.failure) {
    executionState.termination ||= terminateChildTrees([child])
    return
  }
  chunks.push(bytes)
}

function serializeInvocation(payload, label) {
  let serialized
  try {
    serialized = JSON.stringify(payload)
  } catch (error) {
    integrity(`${label} payload is not JSON serializable:${error.message}`)
  }
  if (serialized === undefined) integrity(`${label} payload is not JSON serializable`)
  const bytes = Buffer.from(`${serialized}\n`)
  if (bytes.length > MAX_INPUT_BYTES) {
    integrity(`${label} payload exceeds ${MAX_INPUT_BYTES} bytes`)
  }
  return bytes
}

async function runHook({ executionPath, runtime, payload, environment, label }) {
  const input = serializeInvocation(payload, label)
  const remaining = remainingBatchMs(`before-child:${label}`)
  const timeoutMs = Math.min(CHILD_TIMEOUT_MS, remaining)
  const batchDeadlineOwnsTimeout = remaining <= CHILD_TIMEOUT_MS
  let child
  try {
    child = spawn(RUNTIMES[runtime], [executionPath], {
      cwd: environment.GOVERNANCE_PROJECT_DIR,
      env: environment,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    integrity(`${label} failed to launch:${error.message}`)
  }
  activeChildren.add(child)
  const stdout = []
  const stderr = []
  const state = {
    stdout: { total: 0 },
    stderr: { total: 0 },
    failure: '',
    launchError: null,
    termination: null,
    timedOut: false,
  }
  child.stdout.on('data', (chunk) =>
    appendBounded(stdout, state.stdout, state, chunk, `${label} stdout`, child))
  child.stderr.on('data', (chunk) =>
    appendBounded(stderr, state.stderr, state, chunk, `${label} stderr`, child))

  const timer = setTimeout(() => {
    state.timedOut = true
    state.termination ||= terminateChildTrees([child])
  }, timeoutMs)
  const completion = new Promise((accept) => {
    child.once('error', (error) => { state.launchError = error })
    child.once('close', (status, signal) => accept({ status, signal }))
  })
  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      state.failure ||= `${label} stdin failed:${error.message}`
      state.termination ||= terminateChildTrees([child])
    }
  })
  try {
    child.stdin.end(input)
  } catch (error) {
    state.failure ||= `${label} stdin failed:${error.message}`
    state.termination ||= terminateChildTrees([child])
  }

  let completionResult
  try {
    completionResult = await completion
  } finally {
    clearTimeout(timer)
    if (state.termination) await state.termination
    // `close` only proves the direct child and its inherited pipes are gone. A hook can leave a
    // detached descendant in the same process group after redirecting stdio, so always reap the
    // completed group before dropping its tracking record.
    signalChildTree(child, 'SIGKILL')
    activeChildren.delete(child)
  }
  if (state.launchError) integrity(`${label} failed to launch:${state.launchError.message}`)
  if (state.timedOut) {
    if (batchDeadlineOwnsTimeout) {
      integrity(`product hook batch exceeded ${batchRuntimeLimitMs}ms:during-child:${label}`)
    }
    integrity(`${label} timed out after ${CHILD_TIMEOUT_MS}ms`)
  }
  if (state.failure) integrity(state.failure)
  if (completionResult.signal) integrity(`${label} terminated by signal:${completionResult.signal}`)
  if (!Number.isInteger(completionResult.status)) integrity(`${label} returned no exit status`)
  remainingBatchMs(`after-child:${label}`)

  let decodedStdout
  let decodedStderr
  try {
    decodedStdout = STRICT_UTF8.decode(Buffer.concat(stdout, state.stdout.total))
    decodedStderr = STRICT_UTF8.decode(Buffer.concat(stderr, state.stderr.total))
  } catch {
    integrity(`${label} output is not strict UTF-8`)
  }
  return {
    status: completionResult.status,
    stdout: decodedStdout,
    stderr: decodedStderr,
  }
}

function allowlistedScalars(source, fields) {
  const result = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result
  for (const field of fields) {
    const value = source[field]
    if (
      typeof value === 'string'
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || value === null
    ) result[field] = value
  }
  return result
}

function invocationForFile({ normalized, changedFile, projectRoot, writeState = null }) {
  const event = normalized.event
  const tool = normalized.tool
  const operation = normalized.operation
  const invocation = {
    ...allowlistedScalars(normalized, EVENT_PASSTHROUGH_FIELDS[event] || []),
    provider: normalized.provider,
    hook_event_name: event,
    event,
    tool_name: tool,
    tool,
    operation,
    governance_normalized: {
      event,
      tool,
      operation,
      paths: changedFile ? [changedFile.path] : [],
    },
    transcript_path: '',
    tool_input: changedFile
      ? {}
      : allowlistedScalars(normalized.tool_input, PASSTHROUGH_TOOL_FIELDS),
  }
  if (!changedFile) return invocation

  const absolutePath = resolve(projectRoot, changedFile.path)
  if (!containedPath(projectRoot, absolutePath)) integrity(`normalized changed path escapes project:${changedFile.path}`)
  const content = changedFile.content
    || changedFile.new_string
    || changedFile.text
    || normalized.governance_shared_content
    || ''
  const materializedFile = {
    file_path: absolutePath,
    path: absolutePath,
  }
  const pathLocalToolInput = typeof content !== 'string' || !content.length
    ? materializedFile
    : tool === 'Write'
      ? { ...materializedFile, content }
      : tool === 'MultiEdit'
        ? {
            ...materializedFile,
            // Existing canonical hooks consume the trusted aggregate through the same top-level
            // field used by Edit. Preserve the structured edits for hooks that need them, while
            // preventing provider-native patch transports from becoming a MultiEdit false-green.
            new_string: content,
            edits: [{ ...materializedFile, new_string: content }],
          }
        : { ...materializedFile, new_string: content }
  invocation.governance_normalized.paths = [changedFile.path]
  invocation.tool_input = {
    ...pathLocalToolInput,
    changed_paths: [absolutePath],
  }
  if (Object.hasOwn(normalized.tool_input || {}, 'notebook_path')) {
    invocation.tool_input.notebook_path = absolutePath
  }
  invocation.changed_paths = [absolutePath]
  if (writeState) {
    invocation.governance_write_state = writeState
    invocation.tool_input.governance_write_state = writeState
  }
  return invocation
}

async function main() {
  const [providerId, manifestPath, forkRootArgument, ...modeArguments] = process.argv.slice(2)
  if (!providerId || !manifestPath || !forkRootArgument) integrity('dispatcher arguments are incomplete')
  let authorityDecisionMode = null
  if (modeArguments.length) {
    if (modeArguments.length !== 2
      || modeArguments[0] !== '--authority-decision'
      || !['prepare', 'verify'].includes(modeArguments[1])) {
      integrity('authority decision mode must be prepare or verify')
    }
    authorityDecisionMode = modeArguments[1]
  }
  const forkRoot = realpathSync(forkRootArgument)
  if (resolve(manifestPath) !== resolve(forkRoot, 'manifest.json')) {
    integrity('fork manifest path does not identify the declared fork corpus')
  }
  const lock = readBoundedRegularJson(resolve(forkRoot, 'governance.lock'), 'fork corpus lock')
  if (lock.schemaVersion !== 1 || lock.kind !== 'fork-governance-corpus-lock' || lock.hashAlgorithm !== 'sha256' || !Array.isArray(lock.entries)) {
    integrity('fork corpus lock identity is invalid')
  }
  const lockEntries = new Map(lock.entries.map((entry) => [entry?.file, entry?.sha256]))
  if (lockEntries.size !== lock.entries.length) integrity('fork corpus lock entries are duplicated')
  const snapshot = createAuthenticatedCorpusSnapshot({ forkRoot, entries: lock.entries })
  const snapshotRoot = snapshot.root
  verifyPrivateSnapshot(snapshot)
  const manifest = readJson(resolve(snapshotRoot, 'manifest.json'), 'authenticated fork manifest')
  const adapter = object(manifest.providerAdapters?.[providerId], `provider adapter ${providerId}`)
  if (
    !Number.isInteger(adapter.blockingExitCode)
    || adapter.blockingExitCode < 1
    || adapter.blockingExitCode > 255
    || adapter.blockingExitCode === 70
  ) {
    integrity(`provider adapter ${providerId} has an invalid blockingExitCode`)
  }
  const hooks = object(manifest.hooks, 'fork hook contracts')

  const raw = await readBoundedStdin()
  let input
  try {
    input = JSON.parse(raw || '{}')
  } catch (error) {
    integrity(`provider payload is invalid JSON:${error.message}`)
  }
  object(input, 'provider payload')

  if (authorityDecisionMode) {
    const authority = object(manifest.authorityDecision, 'fork authority decision contract')
    const expectedAuthority = {
      schemaVersion: 1,
      policySource: 'AGENTS.md#canonical-decision-authority',
      classifierSource: 'launchers/approval-evidence.mjs',
      receiptContractSource: 'launchers/authority-decision-evidence.mjs',
      runner: 'launchers/product-hook-dispatch-runtime.mjs',
      prepareArgv: ['--authority-decision', 'prepare'],
      verifyArgv: ['--authority-decision', 'verify'],
      certificationClaim: 'structural-only-not-runtime-certified',
    }
    if (JSON.stringify(authority) !== JSON.stringify(expectedAuthority)) {
      integrity('fork authority decision contract differs from the canonical projection')
    }
    const expectedInputKeys = [
      'operationText',
      'runtimeSurface',
      'schemaVersion',
      'scopeNonce',
      'sessionId',
      'target',
      'userMessages',
      ...(authorityDecisionMode === 'verify' ? ['receipt'] : []),
    ].sort()
    const actualInputKeys = Object.keys(input).sort()
    if (input.schemaVersion !== 1
      || actualInputKeys.length !== expectedInputKeys.length
      || actualInputKeys.some((key, index) => key !== expectedInputKeys[index])) {
      integrity('authority decision input has an open or incomplete shape')
    }
    const classifierPath = resolve(snapshotRoot, authority.classifierSource)
    const receiptContractPath = resolve(snapshotRoot, authority.receiptContractSource)
    const authorityPolicyPath = resolve(snapshotRoot, authority.policySource.split('#', 1)[0])
    for (const [path, label] of [
      [classifierPath, 'authority classifier'],
      [receiptContractPath, 'authority receipt contract'],
      [authorityPolicyPath, 'authority policy'],
    ]) {
      if (!containedPath(snapshotRoot, path)) integrity(`${label} escapes the authenticated fork corpus`)
    }
    const classifier = await import(pathToFileURL(classifierPath).href)
    const receiptContract = await import(pathToFileURL(receiptContractPath).href)
    const projectedProviderRegistry = {
      schemaVersion: manifest.providerRegistrySchemaVersion,
      providers: Object.entries(manifest.providerAdapters).map(([id, providerAdapter]) => ({
        id,
        adapter: providerAdapter,
      })),
    }
    const evidenceInput = {
      authorityPolicyBytes: readFileSync(authorityPolicyPath),
      classifierSourceBytes: readFileSync(classifierPath),
      receiptContractSourceBytes: readFileSync(receiptContractPath),
      classifier,
      providerRegistry: projectedProviderRegistry,
      providerRegistrySource: 'packages/design-system/ds-canonical/fork/manifest.json#providerAdapters',
      providerId,
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
    writeBoundedOutput(process.stdout, `${JSON.stringify(receipt, null, 2)}\n`, 'authority-decision')
    return receipt.classification.decision === 'approved' ? 0 : adapter.blockingExitCode
  }

  const projectRoot = realpathSync(process.env.GOVERNANCE_PROJECT_DIR || process.cwd())
  const normalized = normalizeProviderEventPayload({
    input,
    adapter,
    providerId,
    projectRoot,
    hookContracts: hooks,
    dispatchLimits: PROVIDER_HOOK_DISPATCH_LIMITS,
  })
  normalized.transcript_path = ''
  const event = normalized.event
  const tool = normalized.tool
  const descriptors = (hooks[event] ?? []).map((descriptor, index) =>
    canonicalDescriptor(descriptor, index, event)).filter((descriptor) =>
    descriptorMatchesTool(descriptor, tool))
  if (descriptors.length > PROVIDER_HOOK_DISPATCH_LIMITS.maxDescriptorCount) {
    integrity(`descriptor count exceeds ${PROVIDER_HOOK_DISPATCH_LIMITS.maxDescriptorCount}`)
  }
  if (!descriptors.length) return 0
  if (descriptors.some((descriptor) => descriptor.transcriptRequirement === 'stable-required')) {
    integrity(`verified transcript contract is unavailable for product hooks:${event}`)
  }

  const transportRegistry = {
    providers: Object.entries(manifest.providerAdapters).map(([id, providerAdapter]) => ({
      id,
      adapter: providerAdapter,
    })),
  }
  const baseEnvironment = sanitizeProviderHookEnvironment({
    environment: process.env,
    registry: transportRegistry,
  })
  baseEnvironment.PATH = providerHookOutputContract.executablePath
  baseEnvironment.GOVERNANCE_PROVIDER = providerId
  baseEnvironment.GOVERNANCE_PROJECT_DIR = projectRoot
  baseEnvironment.GOVERNANCE_CORPUS_ROOT = snapshotRoot
  // Hooks that need provider capabilities must compare this exact authenticated
  // manifest row; an inherited value was removed by the launcher boundary and
  // may never stand in for the adapter selected from the private snapshot.
  baseEnvironment.GOVERNANCE_PROVIDER_ADAPTER_JSON = JSON.stringify(adapter)
  baseEnvironment.GOVERNANCE_TRANSCRIPT_PATH = ''
  baseEnvironment.GOVERNANCE_TRANSCRIPT_TRUST = 'unavailable'

  const changedFiles = normalized.operation === 'write' && normalized.changed_files.length
    ? normalized.changed_files
    : [null]
  if (normalized.changed_files.length > PROVIDER_HOOK_DISPATCH_LIMITS.maxChangedFileCount) {
    integrity(`changed-file count exceeds ${PROVIDER_HOOK_DISPATCH_LIMITS.maxChangedFileCount}`)
  }
  const invocationCount = descriptors.length * changedFiles.length
  if (!Number.isSafeInteger(invocationCount)
    || invocationCount > PROVIDER_HOOK_DISPATCH_LIMITS.maxInvocationCount) {
    integrity(`invocation count exceeds ${PROVIDER_HOOK_DISPATCH_LIMITS.maxInvocationCount}`)
  }
  let proposedAfterImageBytes = 0
  for (const state of normalized.governance_materialized_write_states || []) {
    if (typeof state?.content === 'string') {
      proposedAfterImageBytes += Buffer.byteLength(state.content, 'utf8')
    }
    if (!Number.isSafeInteger(proposedAfterImageBytes)
      || proposedAfterImageBytes > PROVIDER_HOOK_DISPATCH_LIMITS.maxProposedAfterImageBytes) {
      integrity(
        `proposed after-image bytes exceed ${PROVIDER_HOOK_DISPATCH_LIMITS.maxProposedAfterImageBytes}`,
      )
    }
  }
  const proposedStates = new Map(
    (normalized.governance_materialized_write_states || []).map((state) => [state.path, state]),
  )
  const governanceContexts = []
  let stopReason = ''

  dispatch:
  for (const descriptor of descriptors) {
    const descriptorContexts = []
    for (const changedFile of changedFiles) {
      const writeState = descriptor.inputContract === 'proposed-text-v1'
        ? proposedStates.get(changedFile?.path)
        : null
      if (descriptor.inputContract === 'proposed-text-v1' && !writeState) {
        integrity(`trusted proposed state is unavailable:${descriptor.file}:${changedFile?.path || '<missing>'}`)
      }
      const payload = invocationForFile({
        normalized,
        changedFile,
        projectRoot,
        writeState,
      })
      const environment = {
        ...baseEnvironment,
        GOVERNANCE_WRITE_STATE_TRUST: writeState ? 'runner-v1' : 'unavailable',
      }
      verifyPrivateSnapshot(snapshot)
      const result = await runHook({
        executionPath: snapshotHookPath(snapshotRoot, descriptor),
        runtime: descriptor.runtime,
        payload,
        environment,
        label: descriptor.file,
      })
      verifyPrivateSnapshot(snapshot)

      if (descriptor.outputMode === 'diagnostic') {
        if (result.status !== 0) {
          integrity(`diagnostic hook returned nonzero:${descriptor.file}:exit-${result.status}`, {
            childStderr: result.stderr,
          })
        }
        if (result.stdout.length) integrity(`diagnostic hook wrote forbidden raw stdout:${descriptor.file}`)
        if (result.stderr.includes(CHILD_INTEGRITY_MARKER)) {
          integrity(`diagnostic hook emitted the reserved integrity marker:${descriptor.file}`, {
            childStderr: result.stderr,
          })
        }
        if (result.stderr.length) {
          writeBoundedOutput(process.stderr, result.stderr, `diagnostic:${descriptor.file}`)
        }
        continue
      }

      if (result.status === 70) {
        integrity(`hook reported integrity exit 70:${descriptor.file}`, {
          childStderr: result.stderr,
        })
      }
      let interpreted
      try {
        interpreted = interpretProviderHookChildResult({
          status: result.status,
          outputMode: descriptor.outputMode,
          event,
          stdout: result.stdout,
          stderr: result.stderr,
        })
      } catch (error) {
        integrity(`${descriptor.file}:${error.code || 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE'}`, {
          childStderr: result.stderr,
        })
      }
      if (interpreted.kind === 'policy-block') {
        writeBoundedOutput(process.stderr, `${interpreted.reason}\n`, `policy:${descriptor.file}`)
        return adapter.blockingExitCode
      } else if (interpreted.kind === 'governance-context') {
        descriptorContexts.push(interpreted.message)
      } else if (interpreted.kind === 'governance-decision') {
        stopReason = interpreted.reason
        break dispatch
      } else if (interpreted.kind !== 'clean') {
        integrity(`unknown interpreted child result:${descriptor.file}:${interpreted.kind}`)
      }
    }
    if (descriptorContexts.length) {
      governanceContexts.push([...new Set(descriptorContexts)].join('\n\n'))
    }
  }

  if (stopReason) {
    const formatted = formatProviderStopDecision({
      transport: adapter.stopDecisionTransport,
      reason: stopReason,
    })
    if (formatted) writeBoundedOutput(process.stdout, `${JSON.stringify(formatted)}\n`, 'stop-decision')
    else if (adapter.stopDecisionTransport === 'blocking-exit') {
      writeBoundedOutput(process.stderr, `${stopReason}\n`, 'stop-decision')
      return adapter.blockingExitCode
    } else integrity(`stop decision transport is unavailable:${providerId}`)
    return 0
  }
  if (governanceContexts.length) {
    const message = governanceContexts.join('\n\n')
    const formatted = formatProviderHookContext({
      transport: adapter.contextOutputTransport,
      event,
      message,
    })
    if (formatted) writeBoundedOutput(process.stdout, `${JSON.stringify(formatted)}\n`, 'governance-context')
    else if (adapter.contextOutputTransport === 'stderr') {
      writeBoundedOutput(process.stderr, `${message}\n`, 'governance-context')
    }
    else integrity(`context transport is unavailable:${providerId}`)
  }
  return 0
}

let isMain = false
if (process.argv[1]) {
  try {
    isMain = realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    isMain = false
  }
}
if (isMain) {
  let exitCode = 0
  batchDeadlineTimer = setTimeout(() => { void shutdownForDeadline() }, remainingBatchMs('startup'))
  batchDeadlineTimer.unref?.()
  try {
    exitCode = await main()
  } catch (error) {
    await terminateChildTrees(activeChildren)
    if (error?.childStderr) process.stderr.write(error.childStderr)
    process.stderr.write(`GOVERNANCE_INTEGRITY:${error.code || 'PRODUCT_HOOK_RUNTIME_FAILED'}:${error.message}\n`)
    exitCode = 70
  } finally {
    if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
    cleanupCorpusSnapshots()
  }
  process.exitCode = exitCode
}
