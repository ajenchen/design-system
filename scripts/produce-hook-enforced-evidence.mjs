#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDeepAuditEvidenceEnvelope,
  deepAuditEvidenceContract,
  digestInventorySelection,
  digestSandboxVerification,
  loadActiveDeepAuditRun,
  sha256,
  stableStringify,
  writeDeepAuditEvidenceEnvelopeBatch,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  createDisposableRepositorySnapshot,
  digestRepositoryFingerprint,
  diffRepositoryFingerprints,
  disposableSnapshotEnvironment,
  fingerprintCallerRepository,
  fingerprintDependencyView,
  fingerprintRepositoryWorktree,
  removeDisposableRepositorySnapshot,
  validateInstalledDependencyIdentity,
  verifySnapshotAgainstManifest,
} from './lib/disposable-repository-snapshot.mjs'
import {
  DEFAULT_HOOK_EVIDENCE_PLAN,
  loadHookEvidencePlan,
  selectFrozenHookInventory,
} from './lib/hook-evidence-plan.mjs'
import {
  buildProviderHookStdinInvocation,
  interpretProviderHookChildResult,
  sanitizeProviderHookEnvironment,
} from './lib/provider-hook-output-transport.mjs'
import {
  materializeProviderWriteState,
} from '../packages/governance/src/provider-hook-normalization.mjs'
import {
  materializeClosedHookToolProfile,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_BUFFER = 128 * 1024 * 1024
const HOOK_TIMEOUT_MS = 120_000
const OUTPUT_EXCERPT_LIMIT = 12_000
const HOOK_ENFORCEMENT_SUITE_SESSION_ENVIRONMENT = Object.freeze([
  'GOVERNANCE_STATIC_REPLAY',
  'GOVERNANCE_TRANSCRIPT_PATH',
  'GOVERNANCE_TRANSCRIPT_CONTRACT',
  'TRANSCRIPT_PATH',
  'GOVERNANCE_PROVIDER',
  'GOVERNANCE_SELF_PROVIDER',
  'GOVERNANCE_WRITE_STATE_TRUST',
  'GOVERNANCE_PROVIDER_ADAPTER_JSON',
])

function fail(message) {
  throw new Error(`hook evidence producer blocked:${message}`)
}

function parseArgs(argv) {
  const result = {
    mode: null,
    json: false,
    repoRoot: DEFAULT_ROOT,
    evidenceRoot: null,
    planPath: DEFAULT_HOOK_EVIDENCE_PLAN,
    rawArgv: [...argv],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (['--plan', '--check', '--execute'].includes(token)) {
      if (result.mode) fail('choose exactly one of --plan, --check, or --execute')
      result.mode = token.slice(2)
      continue
    }
    if (token === '--json') {
      result.json = true
      continue
    }
    if (!['--repo-root', '--evidence-root', '--plan-path'].includes(token)) fail(`unknown option:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) fail(`${token} requires a value`)
    if (token === '--repo-root') result.repoRoot = resolve(value)
    if (token === '--evidence-root') result.evidenceRoot = value
    if (token === '--plan-path') result.planPath = value
    index += 1
  }
  result.mode ??= 'plan'
  return result
}

function contained(root, path, label) {
  const absolute = resolve(root, path)
  const rel = relative(resolve(root), absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes the repository`)
  return absolute
}

function regularFile(root, path, label) {
  const absolute = contained(root, path, label)
  let cursor = resolve(root)
  for (const segment of relative(resolve(root), absolute).split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor !== absolute && !info.isDirectory()) fail(`${label} crosses a non-directory:${path}`)
    if (cursor === absolute && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be a regular non-aliased file:${path}`)
  }
  return absolute
}

function planSummary(validated) {
  const fileReplays = validated.plan.dimensions.reduce((sum, dimension) => sum + dimension.fileReplays.length, 0)
  const focusedContracts = validated.plan.dimensions.reduce((sum, dimension) => sum + dimension.focusedContracts.length, 0)
  return {
    schemaVersion: 1,
    kind: 'deep-audit-hook-evidence-producer-plan',
    planPath: validated.planPath,
    planSha256: validated.digests.planSha256,
    dimensions: validated.plan.dimensions.map(dimension => dimension.dim),
    dimensionCount: validated.plan.dimensions.length,
    fileReplayBindings: fileReplays,
    focusedContractBindings: focusedContracts,
    inventory: validated.plan.inventory,
    enforcementSuite: validated.plan.enforcementSuite,
    writes: false,
    executes: false,
  }
}

export function buildHookEvidenceChildEnvironment(snapshot, stableTranscript, registry) {
  const root = snapshot.snapshotRoot
  const toolProfile = materializeClosedHookToolProfile({ repoRoot: realpathSync(root) })
  toolProfile.verify()
  const baseEnvironment = sanitizeProviderHookEnvironment({
    environment: process.env,
    registry,
  })
  // The sanitizer deliberately removes the inherited PATH. Restore only the
  // shared fixed executable path before the disposable snapshot prepends its
  // authenticated dependency bin; otherwise execute mode cannot even start
  // the canonical `bash` enforcement suite.
  baseEnvironment.HOME = toolProfile.homeDirectory
  baseEnvironment.LANG = 'C'
  baseEnvironment.LC_ALL = 'C'
  baseEnvironment.NO_COLOR = '1'
  baseEnvironment.PATH = toolProfile.executablePath
  baseEnvironment.TMPDIR = toolProfile.tempDirectory
  baseEnvironment.XDG_CONFIG_HOME = toolProfile.homeDirectory
  for (const key of Object.keys(baseEnvironment)) {
    if (key.startsWith('GOVERNANCE_')) delete baseEnvironment[key]
  }
  // Some legacy canonical hooks still accept this provider-native alias before
  // the neutral transcript variable. Never let the caller's live session
  // override the frozen fixture selected by deterministic evidence.
  delete baseEnvironment.TRANSCRIPT_PATH
  const environment = disposableSnapshotEnvironment(snapshot, { baseEnvironment })
  environment.GOVERNANCE_PROJECT_DIR = root
  environment.GOVERNANCE_CORPUS_ROOT = root
  environment.GOVERNANCE_PROVIDER_REGISTRY = 'packages/governance/canonical/providers.json'
  environment.GOVERNANCE_PROVIDER = 'generic'
  environment.GOVERNANCE_SELF_PROVIDER = 'generic'
  environment.GOVERNANCE_READ_ONLY = '1'
  environment.GOVERNANCE_STATIC_REPLAY = '1'
  environment.GOVERNANCE_TELEMETRY_OPT_IN = '0'
  environment.GOVERNANCE_TOOL_PROFILE_SHA256 = toolProfile.profileSha256
  environment.GOVERNANCE_RUNTIME_ROOT = resolve(snapshot.runtimeRoot, 'governance-runtime')
  environment.GOVERNANCE_STATE_DIR = environment.GOVERNANCE_RUNTIME_ROOT
  if (stableTranscript) {
    environment.GOVERNANCE_TRANSCRIPT_PATH = stableTranscript.path
    environment.GOVERNANCE_TRANSCRIPT_CONTRACT = stableTranscript.contract
  } else {
    environment.GOVERNANCE_TRANSCRIPT_PATH = ''
    environment.GOVERNANCE_TRANSCRIPT_CONTRACT = ''
  }
  return environment
}

export function buildHookEnforcementSuiteEnvironment(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    fail('canonical hook enforcement suite environment must be an object')
  }
  const suiteEnvironment = { ...environment }
  for (const name of HOOK_ENFORCEMENT_SUITE_SESSION_ENVIRONMENT) delete suiteEnvironment[name]
  return suiteEnvironment
}

export function formatHookEnforcementSuiteFailureDetail(result) {
  const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result?.stderr === 'string' ? result.stderr : ''
  return [
    `stdoutTail=${JSON.stringify(stdout.slice(-OUTPUT_EXCERPT_LIMIT))}`,
    `stderrTail=${JSON.stringify(stderr.slice(-OUTPUT_EXCERPT_LIMIT))}`,
  ].join(':')
}

function resolveStableTranscript(root, activeRun, registry) {
  const candidates = (registry.providers ?? [])
    .filter(provider => provider.runtime?.transcript?.contract
      && provider.runtime.transcript.stability === 'tested-versioned'
      && provider.runtime.transcript.fixture)
    .sort((left, right) => compareUtf8Bytes(left.id, right.id))
  if (candidates.length === 0) fail('stable transcript contract is unavailable')
  const provider = candidates[0]
  const fixture = provider.runtime.transcript.fixture
  const inventoryRow = activeRun.manifest.inventory.find(row => row.path === fixture)
  if (!inventoryRow || inventoryRow.kind !== 'file') fail(`stable transcript fixture is absent from frozen inventory:${fixture}`)
  return {
    providerId: provider.id,
    contract: provider.runtime.transcript.contract,
    fixture,
    path: regularFile(root, fixture, 'stable transcript fixture'),
  }
}

function commandResult({
  argv,
  root,
  environment,
  executable = argv[0],
  input = null,
  timeout = 0,
  toolProfile = null,
}) {
  toolProfile?.verify()
  const startedAt = new Date().toISOString()
  const result = spawnSync(executable, argv.slice(1), {
    cwd: root,
    env: environment,
    input,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    ...(timeout ? { timeout } : {}),
  })
  toolProfile?.verify()
  const finishedAt = new Date().toISOString()
  if (result.error) fail(`command failed to start:${argv.join(' ')}:${result.error.message}`)
  if (result.status === null || result.signal) fail(`command terminated without an exit record:${argv.join(' ')}:${result.signal || 'unknown'}`)
  return {
    argv,
    exitCode: result.status,
    startedAt,
    finishedAt,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function fingerprintSha256(rows) {
  return sha256(stableStringify(rows))
}

export function assertRepositoryFingerprintUnchanged({ before, after, label }) {
  const drift = diffRepositoryFingerprints(before, after)
  if (drift.length) fail(`${label} mutated isolated repository:${drift.slice(0, 20).join(',')}`)
  return {
    sandboxBeforeSha256: fingerprintSha256(before),
    sandboxAfterSha256: fingerprintSha256(after),
  }
}

function enforcementSuite(validated, root, environment, sandboxVerificationDigest) {
  const before = fingerprintRepositoryWorktree(root)
  const toolProfile = materializeClosedHookToolProfile({ repoRoot: realpathSync(root) })
  const result = commandResult({
    argv: validated.plan.enforcementSuite.command,
    executable: toolProfile.executables.bash,
    root,
    environment,
    toolProfile,
  })
  const after = fingerprintRepositoryWorktree(root)
  const integrity = assertRepositoryFingerprintUnchanged({
    before,
    after,
    label: 'canonical hook enforcement suite',
  })
  if (result.exitCode !== 0) {
    fail(`canonical hook enforcement suite failed:${result.exitCode}:${formatHookEnforcementSuiteFailureDetail(result)}`)
  }
  const requiredTests = [...new Set(validated.plan.dimensions.flatMap(dimension => dimension.enforcementTests))].sort()
  const executedTests = result.stdout.split(/\r?\n/)
    .map(line => line.match(/^\s*▶\s+Running:\s+(test_[A-Za-z0-9_.-]+\.sh)\s*$/)?.[1])
    .filter(Boolean)
  if (new Set(executedTests).size !== executedTests.length) fail('canonical hook suite reported duplicate test execution')
  const observed = new Map(requiredTests.map(test => [test, executedTests.includes(test)]))
  const missing = requiredTests.filter(test => !observed.get(test))
  if (missing.length) fail(`canonical hook suite did not execute required tests:${missing.join(',')}`)
  return {
    result,
    requiredTests,
    executedTests,
    receiptFor(dimension) {
      const tests = dimension.enforcementTests.map(test => ({ test, observed: observed.get(test) === true }))
      return {
        planSha256: validated.digests.planSha256,
        commandSha256: sha256(stableStringify({
          argv: result.argv,
          exitCode: result.exitCode,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
        })),
        stdoutSha256: sha256(result.stdout),
        stderrSha256: sha256(result.stderr),
        ...integrity,
        sandboxVerificationDigest,
        tests,
        suitePassed: result.exitCode === 0 && tests.every(test => test.observed),
      }
    },
  }
}

function normalizedFileEnvelope({ root, path, content, event, tool, governanceWriteState = null }) {
  const absolute = resolve(root, path)
  const record = {
    file_path: absolute,
    path: absolute,
    old_string: content,
    new_string: content,
    content,
  }
  return {
    provider: 'generic',
    hook_event_name: event,
    event,
    tool_name: tool,
    tool,
    operation: 'write',
    governance_normalized: {
      schemaVersion: 1,
      event,
      tool,
      operation: 'write',
      changedPaths: [path],
    },
    tool_input: {
      ...record,
      edits: [record],
      changed_paths: [absolute],
      ...(governanceWriteState ? { governance_write_state: governanceWriteState } : {}),
    },
    ...(governanceWriteState ? { governance_write_state: governanceWriteState } : {}),
    changed_paths: [absolute],
    changed_files: [record],
  }
}

export function classifyHookInvocationResult({ path, replay, result, outputMode = 'governance-context' }) {
  if (!Number.isInteger(result.exitCode)) fail(`hook invocation lacks an exit record:${replay.hook}:${path}`)
  let interpreted
  try {
    interpreted = interpretProviderHookChildResult({
      status: result.exitCode,
      outputMode,
      event: replay.event,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  } catch (error) {
    fail(`hook child-result integrity failure:${replay.hook}:${path}:${error?.code || error?.message || 'unknown'}`)
  }
  const outcome = {
    clean: 'clean',
    'policy-block': 'blocking',
    'governance-context': 'warning',
    'governance-decision': 'blocking',
  }[interpreted.kind]
  if (!outcome) fail(`hook child-result kind is unsupported:${replay.hook}:${interpreted.kind}`)
  const receipt = {
    path,
    hook: replay.hook,
    event: replay.event,
    tool: replay.tool,
    exitCode: result.exitCode,
    outcome,
    stdoutBytes: Buffer.byteLength(result.stdout),
    stdoutSha256: sha256(result.stdout),
    stderrBytes: Buffer.byteLength(result.stderr),
    stderrSha256: sha256(result.stderr),
  }
  const finding = outcome === 'clean' ? null : {
    ...receipt,
    stdoutExcerpt: result.stdout.slice(0, OUTPUT_EXCERPT_LIMIT),
    stderrExcerpt: result.stderr.slice(0, OUTPUT_EXCERPT_LIMIT),
  }
  return { receipt, finding }
}

function runFileReplay({ root, snapshot, path, replay, descriptor, baseEnvironment, stableTranscript, registry }) {
  const absolute = regularFile(root, path, 'frozen inventory file')
  const content = readFileSync(absolute, 'utf8')
  const inputContract = descriptor.inputContract ?? 'event-v1'
  if (!['event-v1', 'proposed-text-v1'].includes(inputContract)) {
    fail(`hook input contract is unsupported:${replay.hook}:${inputContract}`)
  }
  let governanceWriteState = null
  if (inputContract === 'proposed-text-v1') {
    governanceWriteState = materializeProviderWriteState({
      repoRoot: root,
      mutation: {
        schemaVersion: 1,
        engine: 'evidence-full-file-v1',
        operations: [{ kind: 'write', path, content }],
      },
      path,
    })
  }
  const input = normalizedFileEnvelope({
    root,
    path,
    content,
    event: replay.event,
    tool: replay.tool,
    governanceWriteState,
  })
  const toolProfile = materializeClosedHookToolProfile({ repoRoot: realpathSync(root) })
  const runtime = toolProfile.executables[descriptor.runtime]
  if (!runtime) fail(`hook runtime is unsupported:${replay.hook}:${descriptor.runtime}`)
  const environment = {
    ...baseEnvironment,
    ...(descriptor.transcript === 'stable-required'
      ? buildHookEvidenceChildEnvironment(snapshot, stableTranscript, registry)
      : {}),
    GOVERNANCE_WRITE_STATE_TRUST: governanceWriteState ? 'runner-v1' : 'unavailable',
  }
  if (descriptor.transcript === 'stable-required' && (!stableTranscript?.path || !stableTranscript.contract)) {
    fail(`stable transcript contract is missing:${replay.hook}`)
  }
  const invocation = buildProviderHookStdinInvocation({
    environment,
    payload: input,
    registry,
  })
  const invocationEnvironment = {
    ...invocation.environment,
    HOME: toolProfile.homeDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
    PATH: toolProfile.executablePath,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    TMPDIR: toolProfile.tempDirectory,
    XDG_CONFIG_HOME: toolProfile.homeDirectory,
  }
  const result = commandResult({
    argv: [descriptor.runtime, resolve(root, 'packages/design-system/ds-canonical/hooks', replay.hook)],
    executable: runtime,
    root,
    environment: invocationEnvironment,
    input: invocation.input,
    timeout: HOOK_TIMEOUT_MS,
    toolProfile,
  })
  return classifyHookInvocationResult({ path, replay, result, outputMode: descriptor.outputMode })
}

function bindingFor(validated, dimension, replay) {
  const binding = validated.boundRegistrations.find(candidate => candidate.dim === dimension.dim
    && candidate.mode === 'file-replay'
    && candidate.hook === replay.hook
    && candidate.event === replay.event
    && candidate.tool === replay.tool)
  if (!binding) fail(`validated registration binding disappeared:${dimension.dim}:${replay.hook}`)
  return binding
}

export function buildHookReplayRoutes(validated) {
  const routes = new Map()
  for (const dimension of validated.plan.dimensions) {
    for (const replay of dimension.fileReplays) {
      const binding = bindingFor(validated, dimension, replay)
      const routeKey = stableStringify({ hook: replay.hook, event: replay.event, tool: replay.tool })
      const existing = routes.get(routeKey)
      if (existing && stableStringify(existing.binding.descriptor) !== stableStringify(binding.descriptor)) {
        fail(`canonical replay route has conflicting descriptors:${replay.hook}:${replay.event}:${replay.tool}`)
      }
      if (existing) {
        if (!existing.dimensions.includes(dimension.dim)) existing.dimensions.push(dimension.dim)
      } else {
        routes.set(routeKey, { replay, binding, dimensions: [dimension.dim] })
      }
    }
  }
  for (const route of routes.values()) route.dimensions.sort((left, right) => left - right)
  return routes
}

function hookReplayFailureCause(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (error?.code === 'ETIMEDOUT' || /\bETIMEDOUT\b/.test(message)) {
    return { kind: 'timeout', code: 'ETIMEDOUT', timeoutMs: HOOK_TIMEOUT_MS }
  }
  if (error?.code === 'ENOBUFS' || /\bENOBUFS\b/.test(message)) {
    return { kind: 'output-limit', code: 'ENOBUFS', maximumBytes: MAX_BUFFER }
  }
  const producerPrefix = 'hook evidence producer blocked:'
  if (message.startsWith(producerPrefix)) {
    return {
      kind: 'producer-error',
      messageSha256: sha256(message),
    }
  }
  return {
    kind: 'unexpected-error',
    name: typeof error?.name === 'string' && error.name ? error.name : 'Error',
    ...(typeof error?.code === 'string' && error.code ? { code: error.code } : {}),
  }
}

export function formatHookReplayFailureMessage({ dimensions, path, replay, error }) {
  const context = {
    dimensions: [...new Set(dimensions)].sort((left, right) => left - right),
    route: {
      hook: replay.hook,
      event: replay.event,
      tool: replay.tool,
    },
    inventoryPath: path,
  }
  return `hook evidence producer blocked:file replay failed:context=${stableStringify(context)}:cause=${stableStringify(hookReplayFailureCause(error))}`
}

function replayDimensions({
  validated,
  root,
  snapshot,
  activeRun,
  inventoryPaths,
  suite,
  environment,
  stableTranscript,
  registry,
  sandboxVerificationDigest,
}) {
  const shared = new Map()
  const byDimension = new Map()
  const routes = buildHookReplayRoutes(validated)
  const replayBefore = fingerprintRepositoryWorktree(root)
  for (const [routeKey, { replay, binding, dimensions }] of routes) {
    const routeBefore = fingerprintRepositoryWorktree(root)
    for (const path of inventoryPaths) {
      let classified
      try {
        classified = runFileReplay({
          root,
          snapshot,
          path,
          replay,
          descriptor: binding.descriptor,
          baseEnvironment: environment,
          stableTranscript,
          registry,
        })
      } catch (error) {
        throw new Error(formatHookReplayFailureMessage({
          dimensions,
          path,
          replay,
          error,
        }))
      }
      shared.set(stableStringify({ path, hook: replay.hook, event: replay.event, tool: replay.tool }), classified)
    }
    const routeAfter = fingerprintRepositoryWorktree(root)
    assertRepositoryFingerprintUnchanged({
      before: routeBefore,
      after: routeAfter,
      label: `canonical hook replay route ${routeKey}`,
    })
  }
  const replayAfter = fingerprintRepositoryWorktree(root)
  const replayIntegrity = assertRepositoryFingerprintUnchanged({
    before: replayBefore,
    after: replayAfter,
    label: 'canonical hook replay suite',
  })
  for (const dimension of validated.plan.dimensions) {
    const invocations = []
    const findings = []
    for (const replay of dimension.fileReplays) {
      for (const path of inventoryPaths) {
        const key = stableStringify({ path, hook: replay.hook, event: replay.event, tool: replay.tool })
        const classified = shared.get(key)
        if (!classified) fail(`canonical replay result is missing:${dimension.dim}:${path}:${replay.hook}`)
        invocations.push(classified.receipt)
        if (classified.finding) findings.push(classified.finding)
      }
    }
    const focusedContracts = dimension.focusedContracts.map(contract => ({
      contract: contract.contract,
      hook: contract.hook,
      event: contract.event,
      tool: contract.tool,
      test: contract.test,
      observed: suite.executedTests.includes(contract.test),
    }))
    if (focusedContracts.some(contract => !contract.observed)) fail(`focused behavioral contract was not executed:${dimension.dim}`)
    const warningCount = invocations.filter(invocation => invocation.outcome === 'warning').length
    const blockingCount = invocations.filter(invocation => invocation.outcome === 'blocking').length
    byDimension.set(dimension.dim, {
      planSha256: validated.digests.planSha256,
      inventoryDigest: digestInventorySelection(activeRun.manifest, inventoryPaths),
      ...replayIntegrity,
      sandboxVerificationDigest,
      filesScanned: inventoryPaths.length,
      invocationCount: invocations.length,
      warningCount,
      blockingCount,
      findings,
      invocations,
      focusedContracts,
      complete: inventoryPaths.length > 0
        && invocations.length === inventoryPaths.length * dimension.fileReplays.length
        && focusedContracts.every(contract => contract.observed),
    })
  }
  return byDimension
}

function overallCommand(args, startedAt, finishedAt) {
  return {
    argv: [process.execPath, 'scripts/produce-hook-enforced-evidence.mjs', ...args.rawArgv],
    cwd: '.',
    exitCode: 0,
    startedAt,
    finishedAt,
  }
}

function execute(validated, args) {
  const startedAt = new Date().toISOString()
  const root = realpathSync(args.repoRoot)
  const activeRun = loadActiveDeepAuditRun({ repoRoot: root, explicitRoot: args.evidenceRoot, requireCurrent: true })
  const inventoryPaths = selectFrozenHookInventory(activeRun.manifest, validated.plan.inventory)
  const sourceBefore = fingerprintCallerRepository(root)
  let sourceAfter = null
  let snapshot = null
  let snapshotVerification = null
  let snapshotVerificationAfter = null
  let dependencyBefore = null
  let dependencyAfter = null
  let dependencyIdentity = null
  let cleanupCompleted = false
  let suite = null
  let replays = null
  let executionError = null
  try {
    snapshot = createDisposableRepositorySnapshot({
      root,
      dependencyRoot: root,
      prefix: 'hook-evidence-snapshot-',
      manifest: activeRun.manifest,
    })
    const dependencyRoots = snapshot.dependencyViews.map(({ label }) => label)
    snapshotVerification = verifySnapshotAgainstManifest(snapshot.snapshotRoot, activeRun.manifest, { dependencyRoots })
    const expectedSandboxVerification = digestSandboxVerification(activeRun.manifest)
    if (snapshotVerification.verificationDigest !== expectedSandboxVerification) {
      fail('disposable snapshot verification digest mismatches active manifest')
    }
    dependencyIdentity = validateInstalledDependencyIdentity(snapshot.snapshotRoot)
    dependencyBefore = fingerprintDependencyView(snapshot.dependencyViews)
    const snapshotRoot = realpathSync(snapshot.snapshotRoot)
    const registry = JSON.parse(readFileSync(regularFile(
      snapshotRoot,
      'packages/governance/canonical/providers.json',
      'provider registry',
    ), 'utf8'))
    const stableTranscript = resolveStableTranscript(snapshotRoot, activeRun, registry)
    const replayEnvironment = buildHookEvidenceChildEnvironment(snapshot, null, registry)
    const suiteEnvironment = buildHookEnforcementSuiteEnvironment(replayEnvironment)
    suite = enforcementSuite(validated, snapshotRoot, suiteEnvironment, expectedSandboxVerification)
    replays = replayDimensions({
      validated,
      root: snapshotRoot,
      snapshot,
      activeRun,
      inventoryPaths,
      suite,
      environment: replayEnvironment,
      stableTranscript,
      registry,
      sandboxVerificationDigest: expectedSandboxVerification,
    })
    snapshotVerificationAfter = verifySnapshotAgainstManifest(snapshot.snapshotRoot, activeRun.manifest, { dependencyRoots })
    if (snapshotVerificationAfter.verificationDigest !== expectedSandboxVerification) {
      fail('disposable snapshot after-digest mismatches active manifest')
    }
    dependencyAfter = fingerprintDependencyView(snapshot.dependencyViews)
    if (diffRepositoryFingerprints(dependencyBefore, dependencyAfter).length) fail('hook execution changed the installed dependency view')
    const dependencyIdentityAfter = validateInstalledDependencyIdentity(snapshot.snapshotRoot)
    if (stableStringify(dependencyIdentityAfter) !== stableStringify(dependencyIdentity)) fail('hook execution changed installed dependency identity')
  } catch (error) {
    executionError = error
  } finally {
    try {
      removeDisposableRepositorySnapshot(snapshot)
      cleanupCompleted = true
    } catch (error) {
      executionError = error
    }
    try {
      sourceAfter = fingerprintCallerRepository(root)
      const sourceDrift = diffRepositoryFingerprints(sourceBefore, sourceAfter)
      if (sourceDrift.length) {
        executionError = new Error(`hook evidence producer blocked:source repository changed during isolated execution:${sourceDrift.slice(0, 20).join(',')}`)
      }
    } catch (error) {
      executionError = error
    }
  }
  if (executionError) throw executionError
  loadActiveDeepAuditRun({ repoRoot: root, explicitRoot: args.evidenceRoot, requireCurrent: true })
  const finishedAt = new Date().toISOString()
  const command = overallCommand(args, startedAt, finishedAt)
  const sandboxReceipt = {
    materialization: snapshot.dependencyMaterialization,
    manifestVerificationBeforeDigest: snapshotVerification.verificationDigest,
    manifestVerificationAfterDigest: snapshotVerificationAfter.verificationDigest,
    callerFingerprintBeforeDigest: digestRepositoryFingerprint(sourceBefore),
    callerFingerprintAfterDigest: digestRepositoryFingerprint(sourceAfter),
    dependencyViewBeforeDigest: digestRepositoryFingerprint(dependencyBefore),
    dependencyViewAfterDigest: digestRepositoryFingerprint(dependencyAfter),
    dependencyLockfileSha256: dependencyIdentity.dependencyLockfileSha256,
    installedLockfileSha256: dependencyIdentity.installedLockfileSha256,
    installedDependencyIdentityDigest: dependencyIdentity.installedDependencyIdentityDigest,
    dependencyProvenance: dependencyIdentity.provenance,
    dependencyTrust: 'untrusted-local-copy',
    executionIsolation: 'disposable-repository-copy',
    containmentBackend: 'none',
    externalWriteContainment: 'unverified',
    cleanup: cleanupCompleted,
  }
  const envelopes = validated.plan.dimensions.map(dimension => {
    const enforcementSuiteReceipt = suite.receiptFor(dimension)
    const replayReceipt = replays.get(dimension.dim)
    if (!enforcementSuiteReceipt.suitePassed || !replayReceipt?.complete) fail(`dimension ${dimension.dim} is incomplete; no evidence may be written`)
    return {
      relativePath: `hook-residue/dim-${dimension.dim}.json`,
      envelope: buildDeepAuditEvidenceEnvelope({
        activeRun,
        evidenceKind: 'deep-audit-hook-residue',
        producer: deepAuditEvidenceContract.genericProducer,
        command,
        coveragePaths: inventoryPaths,
        payload: {
          dim: dimension.dim,
          capability: dimension.capability,
          enforcementSuiteReceipt,
          replayReceipt,
          sandboxReceipt,
        },
      }),
    }
  })
  const published = writeDeepAuditEvidenceEnvelopeBatch({
    repoRoot: root,
    explicitRoot: args.evidenceRoot,
    items: envelopes,
  })
  return {
    schemaVersion: 1,
    kind: 'deep-audit-hook-evidence-execution',
    runId: activeRun.manifest.runId,
    planSha256: validated.digests.planSha256,
    filesScanned: inventoryPaths.length,
    frozenInventoryEntriesVerified: snapshotVerification.inventoryEntries,
    sourceBeforeSha256: fingerprintSha256(sourceBefore),
    sourceAfterSha256: fingerprintSha256(sourceAfter),
    dimensionsCompleted: envelopes.length,
    evidencePaths: published.paths,
  }
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const validated = loadHookEvidencePlan({ repoRoot: args.repoRoot, planPath: args.planPath })
  if (args.mode === 'plan') return planSummary(validated)
  if (args.mode === 'check') return { ...planSummary(validated), kind: 'deep-audit-hook-evidence-plan-check', valid: true }
  return execute(validated, args)
}

const isMain = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (isMain) {
  try {
    const result = run()
    process.stdout.write(`${stableStringify(result, 2)}\n`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
