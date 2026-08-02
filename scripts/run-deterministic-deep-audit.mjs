#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildDeepAuditEvidenceEnvelope,
  deepAuditEvidenceContract,
  loadActiveDeepAuditRun,
  sha256,
  writeDeepAuditEvidenceEnvelopeBatch,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  DETERMINISTIC_CAPABILITY_ORDER,
  NETLIFY_LIVE_UNOBSERVED_REASON,
  assertDeterministicMatrixParity,
  canonicalDeterministicRunnerArgv,
  canonicalDeterministicUnobservedRunnerArgv,
  deterministicCapabilitiesForDimension,
  expandDeterministicCoverage,
  loadDeterministicDeepAuditPlan,
} from './lib/deep-audit-deterministic-plan.mjs'
import {
  createDisposableRepositorySnapshot,
  digestRepositoryFingerprint,
  diffRepositoryFingerprints,
  disposableSnapshotEnvironment,
  fingerprintCallerRepository,
  fingerprintDependencyView,
  fingerprintGeneratedEntries,
  removeDisposableRepositorySnapshot,
  validateInstalledDependencyIdentity,
  verifyDisposableSnapshotToolProfile,
  verifySnapshotAgainstManifest,
} from './lib/disposable-repository-snapshot.mjs'

const PROFILE_VALUES = new Set(['all', ...DETERMINISTIC_CAPABILITY_ORDER])

function fail(message) {
  throw new Error(`deterministic deep-audit runner blocked:${message}`)
}

export function parseDeterministicRunnerArgs(argv) {
  const result = {
    json: false,
    check: false,
    execute: false,
    allowBuild: false,
    allowNetwork: false,
    allowPublishedRelease: false,
    recordUnobserved: null,
    profile: 'all',
    dims: null,
  }
  for (const token of argv) {
    if (token === '--json') result.json = true
    else if (token === '--check') result.check = true
    else if (token === '--execute') result.execute = true
    else if (token === '--allow-build') result.allowBuild = true
    else if (token === '--allow-network') result.allowNetwork = true
    else if (token === '--allow-published-release') result.allowPublishedRelease = true
    else if (token.startsWith('--record-unobserved=')) result.recordUnobserved = token.slice('--record-unobserved='.length)
    else if (token.startsWith('--profile=')) result.profile = token.slice('--profile='.length)
    else if (token.startsWith('--dims=')) {
      const raw = token.slice('--dims='.length)
      if (!/^\d+(?:,\d+)*$/.test(raw)) fail('--dims must be a comma-separated integer list')
      result.dims = [...new Set(raw.split(',').map(Number))].sort((left, right) => left - right)
    } else fail(`unknown option:${token}`)
  }
  if (!PROFILE_VALUES.has(result.profile)) fail(`unknown profile:${result.profile}`)
  if (result.dims && result.profile !== 'all') fail('--dims cannot be combined with a non-all --profile')
  if (result.check && result.execute) fail('--check cannot be combined with --execute')
  if (result.recordUnobserved !== null) {
    if (result.recordUnobserved !== NETLIFY_LIVE_UNOBSERVED_REASON) fail(`unknown unobserved reason:${result.recordUnobserved}`)
    if (result.check || result.execute) fail('--record-unobserved cannot be combined with --check or --execute')
    if (result.allowBuild || result.allowNetwork || result.allowPublishedRelease) fail('--record-unobserved cannot accept execution capability flags')
    if (result.profile !== 'all' || result.dims?.length !== 1 || result.dims[0] !== 83) {
      fail('--record-unobserved is restricted to exact --dims=83')
    }
  }
  if (!result.execute && (result.allowBuild || result.allowNetwork || result.allowPublishedRelease)) fail('capability flags require --execute')
  if (result.allowPublishedRelease && !result.allowNetwork) fail('--allow-published-release also requires --allow-network')
  return result
}

function maximumCapability(capabilities) {
  return capabilities.reduce((highest, capability) => Math.max(highest, DETERMINISTIC_CAPABILITY_ORDER.indexOf(capability)), 0)
}

export function selectDeterministicDimensions(planState, args) {
  const all = [...planState.dimensionByNumber.values()].sort((left, right) => left.dim - right.dim)
  if (args.dims) {
    const missing = args.dims.filter((dim) => !planState.dimensionByNumber.has(dim))
    if (missing.length) fail(`requested dimensions are not deterministic:${missing.join(',')}`)
    return args.dims.map((dim) => planState.dimensionByNumber.get(dim))
  }
  if (args.profile === 'all') return all
  const profileIndex = DETERMINISTIC_CAPABILITY_ORDER.indexOf(args.profile)
  return all.filter((dimension) => maximumCapability(deterministicCapabilitiesForDimension(planState, dimension.dim)) === profileIndex)
}

function requiredCommands(planState, dimensions) {
  const ids = new Set(dimensions.flatMap((dimension) => dimension.commandIds))
  return planState.plan.commands.filter((command) => ids.has(command.id))
}

function authorizationBlockers(commands, args) {
  const blockers = []
  for (const command of commands) {
    if (command.capabilities.includes('build') && !args.allowBuild) blockers.push(`${command.id}:--allow-build`)
    if (command.capabilities.includes('network') && !args.allowNetwork) blockers.push(`${command.id}:--allow-network`)
    if (command.capabilities.includes('published-release') && !args.allowPublishedRelease) blockers.push(`${command.id}:--allow-published-release`)
  }
  return [...new Set(blockers)]
}

function outputMatchCount(output, pattern) {
  return [...output.matchAll(new RegExp(pattern, 'gu'))].length
}

export function validateDeterministicCommandCompletion(command, result) {
  const failureContext = () => {
    const details = []
    if (result?.error) details.push(`error=${JSON.stringify(result.error.message ?? String(result.error))}`)
    if (result?.signal) details.push(`signal=${JSON.stringify(result.signal)}`)
    const stdoutTail = outputTail(result?.stdout)
    const stderrTail = outputTail(result?.stderr)
    if (stdoutTail) details.push(`stdoutTail=${JSON.stringify(stdoutTail)}`)
    if (stderrTail) details.push(`stderrTail=${JSON.stringify(stderrTail)}`)
    return details.length ? `; ${details.join('; ')}` : ''
  }
  if (!result || result.error || result.signal || !Number.isInteger(result.exitCode)) {
    fail(`command ${command.id} crashed or did not produce an exit code${failureContext()}`)
  }
  if (!command.completion.acceptedExitCodes.includes(result.exitCode)) {
    fail(`command ${command.id} exited ${result.exitCode}${failureContext()}`)
  }
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  for (const pattern of command.completion.rejectOutputPatterns) {
    if (new RegExp(pattern, 'u').test(combined)) {
      fail(`command ${command.id} matched rejected infrastructure output:${pattern}${failureContext()}`)
    }
  }
  for (const requirement of command.completion.minimumOutputMatches) {
    const count = outputMatchCount(combined, requirement.pattern)
    if (count < requirement.minimum) {
      fail(`command ${command.id} output is vacuous:${requirement.pattern} matched ${count}/${requirement.minimum}${failureContext()}`)
    }
  }
  return true
}

const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024 * 1024

function signalCommandProcessGroup(child, signal) {
  if (!child?.pid) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {}
  }
  try {
    child.kill(signal)
  } catch {}
}

function commandProcessGroupExists(pid) {
  if (!pid || process.platform === 'win32') return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
}

function waitForCommandCleanup(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

async function reapCommandProcessGroup(child) {
  if (!child?.pid || process.platform === 'win32' || !commandProcessGroupExists(child.pid)) return
  signalCommandProcessGroup(child, 'SIGTERM')
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!commandProcessGroupExists(child.pid)) return
    await waitForCommandCleanup(50)
  }
  signalCommandProcessGroup(child, 'SIGKILL')
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!commandProcessGroupExists(child.pid)) return
    await waitForCommandCleanup(50)
  }
  fail(`command process group did not terminate:${child.pid}`)
}

function defaultRunCommand(command, { sandboxRoot, environment }) {
  const startedAt = new Date().toISOString()
  const executable = command.argv[0] === 'node' ? process.execPath : command.argv[0]
  return new Promise((resolveCommand) => {
    const child = spawn(executable, command.argv.slice(1), {
      cwd: resolve(sandboxRoot, command.cwd),
      detached: process.platform !== 'win32',
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let launchError = null
    let terminationReason = null
    let forceKillTimer = null

    const terminate = (reason) => {
      if (terminationReason) return
      terminationReason = reason
      signalCommandProcessGroup(child, 'SIGTERM')
      forceKillTimer = setTimeout(() => signalCommandProcessGroup(child, 'SIGKILL'), 1_000)
    }
    const capture = (chunks, chunk, stream) => {
      const bytes = stream === 'stdout' ? stdoutBytes : stderrBytes
      const remaining = Math.max(0, MAX_COMMAND_OUTPUT_BYTES - bytes)
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      if (stream === 'stdout') stdoutBytes += chunk.length
      else stderrBytes += chunk.length
      if (chunk.length > remaining) terminate(`${stream} exceeded ${MAX_COMMAND_OUTPUT_BYTES} bytes`)
    }

    child.stdout.on('data', (chunk) => capture(stdout, chunk, 'stdout'))
    child.stderr.on('data', (chunk) => capture(stderr, chunk, 'stderr'))
    child.once('error', (error) => { launchError = error })
    const timeout = setTimeout(
      () => terminate(`timed out after ${command.timeoutSeconds} seconds`),
      command.timeoutSeconds * 1_000,
    )
    child.once('close', (exitCode, signal) => {
      void (async () => {
        clearTimeout(timeout)
        if (forceKillTimer) clearTimeout(forceKillTimer)
        let cleanupError = null
        try {
          await reapCommandProcessGroup(child)
        } catch (error) {
          cleanupError = error
        }
        const finishedAt = new Date().toISOString()
        resolveCommand({
          exitCode,
          signal,
          error: launchError
            ?? (terminationReason ? new Error(terminationReason) : null)
            ?? cleanupError,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          startedAt,
          finishedAt,
        })
      })()
    })
  })
}

function sameSnapshotVerification(before, after) {
  return before.verificationDigest === after.verificationDigest
    && before.inventoryEntries === after.inventoryEntries
    && before.file === after.file
    && before.symlink === after.symlink
    && before.missing === after.missing
}

function sandboxObservation(snapshot, verification) {
  return `[deep-audit-sandbox] ${JSON.stringify({
    snapshot: 'disposable',
    dependencyMaterialization: snapshot.dependencyMaterialization,
    manifestVerificationDigest: verification.verificationDigest,
  })}`
}

function changedFingerprintPaths(before, after) {
  const left = new Set(before)
  const right = new Set(after)
  return [...new Set([
    ...before.filter((row) => !right.has(row)).map((row) => row.split('\0', 1)[0]),
    ...after.filter((row) => !left.has(row)).map((row) => row.split('\0', 1)[0]),
  ])].sort()
}

function outputRootContains(root, path) {
  return path === root || path.startsWith(`${root}/`)
}

function outputTail(value, limit = 4000) {
  const normalized = String(value ?? '').replaceAll('\r\n', '\n')
  return normalized.length <= limit ? normalized : normalized.slice(-limit)
}

function commandPayload(result) {
  return {
    argv: result.argv,
    exitCode: result.exitCode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    stdoutSha256: sha256(result.stdout),
    stderrSha256: sha256(result.stderr),
    stdoutTail: outputTail(result.stdout),
    stderrTail: outputTail(result.stderr),
    generatedOutputReceipt: result.generatedOutputReceipt,
  }
}

function presentCredentialReferences(policy, environment) {
  return policy.requiredCredentialReferences.filter((reference) => (
    typeof environment?.[reference] === 'string' && environment[reference].length > 0
  ))
}

async function recordDeterministicUnobservedCore({
  repoRoot,
  planState,
  dimension,
  args,
  environment = process.env,
  now = new Date(),
  dependencies = {},
}) {
  if (args.recordUnobserved !== NETLIFY_LIVE_UNOBSERVED_REASON || dimension?.dim !== 83) {
    fail('unobserved evidence is restricted to the canonical credential-gated dim 83 route')
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('unobserved observation time is invalid')
  const policy = dimension.unobservedPolicy
  if (!policy || policy.reasonCode !== args.recordUnobserved) fail('dim 83 lacks its exact unobserved policy binding')
  const observedReferences = presentCredentialReferences(policy, environment)
  if (observedReferences.length) {
    fail(`cannot record credential absence while a required reference is present:${observedReferences.join(',')}`)
  }

  const loadRun = dependencies.loadActiveRun ?? ((options) => loadActiveDeepAuditRun(options))
  const expandCoverage = dependencies.expandCoverage ?? expandDeterministicCoverage
  const buildEnvelope = dependencies.buildEnvelope ?? buildDeepAuditEvidenceEnvelope
  const writeBatch = dependencies.writeBatch ?? ((options) => writeDeepAuditEvidenceEnvelopeBatch(options))
  const activeRun = await loadRun({ repoRoot, requireCurrent: true })
  const coverage = expandCoverage(planState, activeRun.manifest, dimension.dim)
  const observedAt = now.toISOString()
  const commandArgv = canonicalDeterministicUnobservedRunnerArgv({
    dim: dimension.dim,
    reasonCode: policy.reasonCode,
  })
  const payload = {
    dim: dimension.dim,
    name: dimension.name,
    planDigest: planState.planDigest,
    capabilities: deterministicCapabilitiesForDimension(planState, dimension.dim),
    commandIds: dimension.commandIds,
    status: 'UNOBSERVED',
    reasonCode: policy.reasonCode,
    credentialReferences: {
      required: policy.requiredCredentialReferences,
      observed: [],
    },
    observedAt,
    summary: "Dim 83's credential-gated live render was not observed because no accepted Netlify credential reference was available; CI dimensions 64/66 separately own protected release, mirror, and consumer propagation evidence.",
  }
  const envelope = buildEnvelope({
    activeRun,
    evidenceKind: 'deep-audit-deterministic',
    producer: deepAuditEvidenceContract.genericProducer,
    command: {
      argv: commandArgv,
      cwd: '.',
      exitCode: 0,
      startedAt: observedAt,
      finishedAt: observedAt,
    },
    coveragePaths: coverage.inventoryPaths,
    payload,
  })
  const relativePath = `deterministic/dim-${dimension.dim}.json`
  const published = await writeBatch({
    repoRoot,
    items: [{ relativePath, envelope }],
    appendExistingCategory: true,
  })
  if (!published || published.count !== 1 || !Array.isArray(published.paths) || published.paths.length !== 1) {
    fail('atomic unobserved evidence publication returned an incomplete receipt')
  }
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-deterministic-run-result',
    mode: 'record-unobserved',
    status: 'UNOBSERVED',
    reasonCode: policy.reasonCode,
    planDigest: planState.planDigest,
    commandsExecuted: 0,
    dimensionsReceipted: 1,
    receipts: [{ dim: dimension.dim, relativePath, path: published.paths[0] }],
  }
}

export function deterministicPlanView(planState, dimensions, args) {
  const commands = requiredCommands(planState, dimensions)
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-deterministic-plan-view',
    mode: args.check ? 'check' : 'plan',
    planDigest: planState.planDigest,
    selectedDimensions: dimensions.map((dimension) => ({
      dim: dimension.dim,
      name: dimension.name,
      commandIds: dimension.commandIds,
      capabilities: deterministicCapabilitiesForDimension(planState, dimension.dim),
    })),
    commands: commands.map((command) => ({
      id: command.id,
      argv: command.argv,
      capabilities: command.capabilities,
    })),
    executionAuthorized: false,
  }
}

async function executeDeterministicDeepAuditCore({
  repoRoot,
  planState,
  dimensions,
  args,
  dependencies = {},
}) {
  if (!args.execute) fail('executeDeterministicDeepAudit requires explicit --execute authorization')
  const commands = requiredCommands(planState, dimensions)
  const blockers = authorizationBlockers(commands, args)
  if (blockers.length) fail(`selected commands need explicit capability authorization:${blockers.join(',')}`)

  const loadRun = dependencies.loadActiveRun ?? ((options) => loadActiveDeepAuditRun(options))
  const runCommand = dependencies.runCommand ?? defaultRunCommand
  const expandCoverage = dependencies.expandCoverage ?? expandDeterministicCoverage
  const buildEnvelope = dependencies.buildEnvelope ?? buildDeepAuditEvidenceEnvelope
  const writeBatch = dependencies.writeBatch ?? ((options) => writeDeepAuditEvidenceEnvelopeBatch(options))
  const createSnapshot = dependencies.createSnapshot ?? ((options) => createDisposableRepositorySnapshot(options))
  const verifySnapshot = dependencies.verifySnapshot ?? ((snapshotRoot, manifest, options) => verifySnapshotAgainstManifest(snapshotRoot, manifest, options))
  const snapshotEnvironment = dependencies.snapshotEnvironment ?? ((snapshot) => disposableSnapshotEnvironment(snapshot))
  const verifySnapshotTools = dependencies.verifySnapshotTools
    ?? (dependencies.snapshotEnvironment
      ? (() => true)
      : ((snapshot) => verifyDisposableSnapshotToolProfile(snapshot)))
  const fingerprintCaller = dependencies.fingerprintCaller ?? ((root) => fingerprintCallerRepository(root))
  const diffFingerprints = dependencies.diffFingerprints ?? diffRepositoryFingerprints
  const removeSnapshot = dependencies.removeSnapshot ?? removeDisposableRepositorySnapshot
  const fingerprintDependencies = dependencies.fingerprintDependencies ?? fingerprintDependencyView
  const fingerprintGenerated = dependencies.fingerprintGenerated ?? fingerprintGeneratedEntries
  const validateDependencyIdentity = dependencies.validateDependencyIdentity ?? validateInstalledDependencyIdentity
  const activeRun = await loadRun({ repoRoot, requireCurrent: true })
  const coverageByDim = new Map(dimensions.map((dimension) => [
    dimension.dim,
    expandCoverage(planState, activeRun.manifest, dimension.dim),
  ]))

  const resultByCommand = new Map()
  const callerBefore = fingerprintCaller(repoRoot)
  let snapshot = null
  let executionError = null
  let cleanupError = null
  let cleanupCompleted = false
  let verificationBefore = null
  let verificationAfter = null
  let dependencyBefore = null
  let dependencyAfter = null
  let dependencyIdentity = null
  try {
    snapshot = createSnapshot({ root: repoRoot, dependencyRoot: repoRoot, prefix: 'deep-audit-deterministic-', manifest: activeRun.manifest })
    const dependencyRoots = (snapshot.dependencyViews ?? [{ label: 'node_modules' }]).map(({ label }) => label)
    verificationBefore = verifySnapshot(snapshot.snapshotRoot, activeRun.manifest, { dependencyRoots })
    const environment = snapshotEnvironment(snapshot)
    const observation = sandboxObservation(snapshot, verificationBefore)
    dependencyIdentity = validateDependencyIdentity(snapshot.snapshotRoot)
    dependencyBefore = fingerprintDependencies(snapshot.dependencyViews ?? snapshot.dependencyView)
    const cumulativeOutputRoots = new Set()
    for (const command of commands) {
      const generatedBefore = fingerprintGenerated(snapshot.snapshotRoot, activeRun.manifest)
      let result
      let commandError = null
      try {
        verifySnapshotTools(snapshot)
        result = await runCommand(command, {
          repoRoot: snapshot.snapshotRoot,
          sandboxRoot: snapshot.snapshotRoot,
          environment,
        })
      } catch (error) {
        commandError = error
      }
      try {
        verifySnapshotTools(snapshot)
      } catch (error) {
        commandError = error
      }
      const generatedAfter = fingerprintGenerated(snapshot.snapshotRoot, activeRun.manifest)
      const changedPaths = changedFingerprintPaths(generatedBefore, generatedAfter)
      const undeclared = changedPaths.filter((path) => !command.outputRoots.some((root) => outputRootContains(root, path)))
      if (undeclared.length) fail(`command ${command.id} created or changed undeclared generated output:${undeclared.slice(0, 20).join(',')}`)
      for (const root of command.outputRoots) cumulativeOutputRoots.add(root)
      const verificationAfterCommand = verifySnapshot(snapshot.snapshotRoot, activeRun.manifest, {
        allowedGeneratedRoots: [...cumulativeOutputRoots].sort(),
        dependencyRoots,
      })
      if (!sameSnapshotVerification(verificationBefore, verificationAfterCommand)) {
        fail(`command ${command.id} changed the frozen snapshot manifest`)
      }
      const dependencyAfterCommand = fingerprintDependencies(snapshot.dependencyViews ?? snapshot.dependencyView)
      const dependencyDrift = diffFingerprints(dependencyBefore, dependencyAfterCommand)
      if (dependencyDrift.length) {
        fail(`command ${command.id} changed the installed dependency view:${dependencyDrift.slice(0, 20).join(',')}`)
      }
      if (commandError) throw commandError
      const normalized = {
        ...result,
        argv: command.argv,
        generatedOutputReceipt: {
          declaredRoots: command.outputRoots,
          beforeDigest: digestRepositoryFingerprint(generatedBefore),
          afterDigest: digestRepositoryFingerprint(generatedAfter),
          changedPaths,
        },
        stdout: `${observation}\n[deep-audit-output-delta] ${JSON.stringify({
          declaredRoots: command.outputRoots,
          beforeDigest: digestRepositoryFingerprint(generatedBefore),
          afterDigest: digestRepositoryFingerprint(generatedAfter),
          changedPaths,
        })}\n${result?.stdout ?? ''}`,
        stderr: result?.stderr ?? '',
      }
      validateDeterministicCommandCompletion(command, normalized)
      resultByCommand.set(command.id, normalized)
    }
    verificationAfter = verifySnapshot(snapshot.snapshotRoot, activeRun.manifest, {
      allowedGeneratedRoots: [...new Set(commands.flatMap((command) => command.outputRoots))].sort(),
      dependencyRoots,
    })
    if (!sameSnapshotVerification(verificationBefore, verificationAfter)) {
      fail('deterministic command batch changed the frozen snapshot manifest')
    }
    dependencyAfter = fingerprintDependencies(snapshot.dependencyViews ?? snapshot.dependencyView)
    if (diffFingerprints(dependencyBefore, dependencyAfter).length) fail('deterministic command batch changed the installed dependency view')
    const dependencyIdentityAfter = validateDependencyIdentity(snapshot.snapshotRoot)
    if (JSON.stringify(dependencyIdentityAfter) !== JSON.stringify(dependencyIdentity)) fail('installed dependency identity changed during deterministic execution')
  } catch (error) {
    executionError = error
  } finally {
    try {
      removeSnapshot(snapshot)
      cleanupCompleted = true
    } catch (error) { cleanupError = error }
  }
  const callerAfter = fingerprintCaller(repoRoot)
  const callerDrift = diffFingerprints(callerBefore, callerAfter)
  if (callerDrift.length) fail(`caller repository changed during disposable execution:${callerDrift.slice(0, 20).join(',')}`)
  if (cleanupError) fail(`disposable snapshot cleanup failed:${cleanupError.message}`)
  if (executionError) throw executionError
  const sandboxReceipt = {
    materialization: snapshot.dependencyMaterialization,
    manifestVerificationBeforeDigest: verificationBefore.verificationDigest,
    manifestVerificationAfterDigest: verificationAfter.verificationDigest,
    callerFingerprintBeforeDigest: digestRepositoryFingerprint(callerBefore),
    callerFingerprintAfterDigest: digestRepositoryFingerprint(callerAfter),
    cleanup: cleanupCompleted,
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
  }

  const currentRun = await loadRun({ repoRoot, requireCurrent: true })
  if (currentRun.manifestSha256 !== activeRun.manifestSha256
    || currentRun.manifest.worktreeFingerprint !== activeRun.manifest.worktreeFingerprint) {
    fail('deterministic commands changed the frozen run snapshot')
  }

  const dims = dimensions.map((dimension) => dimension.dim)
  const runnerArgv = canonicalDeterministicRunnerArgv({
    dims,
    allowBuild: args.allowBuild,
    allowNetwork: args.allowNetwork,
    allowPublishedRelease: args.allowPublishedRelease,
  })
  const allResults = commands.map((command) => resultByCommand.get(command.id))
  const runnerCommand = {
    argv: runnerArgv,
    cwd: '.',
    exitCode: 0,
    startedAt: allResults[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: allResults.at(-1)?.finishedAt ?? new Date().toISOString(),
  }

  const prepared = dimensions.map((dimension) => {
    const capabilities = deterministicCapabilitiesForDimension(planState, dimension.dim)
    const dimensionResults = dimension.commandIds.map((id) => resultByCommand.get(id))
    const payload = {
      dim: dimension.dim,
      name: dimension.name,
      planDigest: planState.planDigest,
      capabilities,
      commandIds: dimension.commandIds,
      commands: dimensionResults.map(commandPayload),
      findings: [],
      summary: `${dimension.name}: ${dimension.commandIds.length} canonical deterministic command(s) completed with exit 0`,
      sandboxReceipt,
    }
    const coverage = coverageByDim.get(dimension.dim)
    const envelope = buildEnvelope({
      activeRun,
      evidenceKind: 'deep-audit-deterministic',
      producer: deepAuditEvidenceContract.genericProducer,
      command: runnerCommand,
      coveragePaths: coverage.inventoryPaths,
      payload,
    })
    return { dimension, coverage, envelope }
  })

  const batch = prepared.map((item) => ({
    relativePath: `deterministic/dim-${item.dimension.dim}.json`,
    envelope: item.envelope,
  }))
  const published = await writeBatch({ repoRoot, items: batch, appendExistingCategory: true })
  if (!published || published.count !== batch.length || !Array.isArray(published.paths) || published.paths.length !== batch.length) {
    fail('atomic deterministic evidence publication returned an incomplete receipt set')
  }
  const receipts = prepared.map((item, index) => ({
    dim: item.dimension.dim,
    relativePath: batch[index].relativePath,
    path: published.paths[index],
  }))
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-deterministic-run-result',
    mode: 'execute',
    planDigest: planState.planDigest,
    commandsExecuted: commands.length,
    dimensionsReceipted: receipts.length,
    receipts,
  }
}

// Validation/execution seam for adversarial fixtures. Publications are captured
// in memory and the caller cannot provide any write function, so injected
// dependencies can never reach the production evidence directory.
export const deterministicRunnerTestHarness = Object.freeze({
  async runCommand(command, options) {
    return defaultRunCommand(command, options)
  },
  async execute(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('test options must be an object')
    const { dependencies = {}, ...executionOptions } = options
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) fail('test dependencies must be an object')
    const forbidden = Object.keys(dependencies).filter((key) => key === 'writeBatch')
    if (forbidden.length) fail(`test harness forbids publication dependencies:${forbidden.join(',')}`)
    const publications = []
    const result = await executeDeterministicDeepAuditCore({
      ...executionOptions,
      dependencies: {
        ...dependencies,
        writeBatch: async (value) => {
          publications.push(value)
          return {
            count: value.items.length,
            paths: value.items.map((item) => `memory://deterministic-test/${item.relativePath}`),
          }
        },
      },
    })
    return { ...result, testPublications: publications }
  },
  async recordUnobserved(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('test options must be an object')
    const { dependencies = {}, ...executionOptions } = options
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) fail('test dependencies must be an object')
    if (Object.hasOwn(dependencies, 'writeBatch')) fail('test harness forbids publication dependencies:writeBatch')
    const publications = []
    const result = await recordDeterministicUnobservedCore({
      ...executionOptions,
      dependencies: {
        ...dependencies,
        writeBatch: async (value) => {
          publications.push(value)
          return {
            count: value.items.length,
            paths: value.items.map((item) => `memory://deterministic-test/${item.relativePath}`),
          }
        },
      },
    })
    return { ...result, testPublications: publications }
  },
})

export async function runDeterministicDeepAudit(argv = process.argv.slice(2), options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('runner options must be an object')
  const allowed = new Set(['repoRoot'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`production runner API forbids override options:${unknown.join(',')}`)
  const { repoRoot = process.cwd() } = options
  const args = parseDeterministicRunnerArgs(argv)
  const planState = loadDeterministicDeepAuditPlan({ repoRoot })
  assertDeterministicMatrixParity(planState, { repoRoot })
  const dimensions = selectDeterministicDimensions(planState, args)
  if (!dimensions.length) fail(`profile ${args.profile} selected no dimensions`)
  if (args.recordUnobserved !== null) {
    return recordDeterministicUnobservedCore({
      repoRoot,
      planState,
      dimension: dimensions[0],
      args,
    })
  }
  if (!args.execute) return deterministicPlanView(planState, dimensions, args)
  return executeDeterministicDeepAuditCore({ repoRoot, planState, dimensions, args })
}

function printHuman(result) {
  if (result.mode === 'record-unobserved') {
    console.log(`Deterministic deep-audit: dim 83 UNOBSERVED (${result.reasonCode})`)
    console.log(`  ${result.receipts[0].relativePath}`)
    return
  }
  if (result.mode === 'execute') {
    console.log(`Deterministic deep-audit: ${result.commandsExecuted} command(s), ${result.dimensionsReceipted} independent receipt(s)`)
    for (const receipt of result.receipts) console.log(`  dim ${receipt.dim}: ${receipt.relativePath}`)
    return
  }
  console.log(`Deterministic deep-audit ${result.mode}: ${result.selectedDimensions.length} dimension(s), execution not authorized`)
  for (const dimension of result.selectedDimensions) console.log(`  dim ${dimension.dim}: ${dimension.commandIds.join(',')} [${dimension.capabilities.join(',')}]`)
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  runDeterministicDeepAudit().then((result) => {
    if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else printHuman(result)
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
  })
}
