#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readHarnessSourceInventory,
  validateHarnessSourceInventory,
} from '../lib/harness-source-inventory.mjs'
import { readHarnessRegistry } from '../lib/harness-registry.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CANONICAL_HOOK_AGGREGATE = Object.freeze([
  'bash',
  'packages/design-system/ds-canonical/hooks/tests/run-all.sh',
])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function memberArgv(path) {
  return path.endsWith('.test.mjs') ? ['node', '--test', path] : ['node', path]
}

function defaultExecute(argv, {
  repoRoot,
  timeoutMs,
  environment,
  sourcePath,
  expectedSourceIdentity,
  expectedSourceIdentities,
}) {
  invariant(sourcePath === memberEntrypoint(argv), 'Harness suite member identity does not match argv')
  invariant(
    JSON.stringify({ path: sourcePath, ...sourceIdentity(repoRoot, sourcePath) }) === JSON.stringify(expectedSourceIdentity),
    `Harness suite member path or digest changed immediately before spawn:${sourcePath}`,
  )
  for (const expected of expectedSourceIdentities) {
    invariant(
      JSON.stringify({ path: expected.path, ...sourceIdentity(repoRoot, expected.path) }) === JSON.stringify(expected),
      `Harness suite bound source path or digest changed immediately before spawn:${expected.path}`,
    )
  }
  const isNode = argv[0] === 'node'
  const isCanonicalHookAggregate = JSON.stringify(argv) === JSON.stringify(CANONICAL_HOOK_AGGREGATE)
  invariant(isNode || isCanonicalHookAggregate, 'Harness suite executor received an unreviewed executable or argv shape')
  const result = spawnSync(isNode ? process.execPath : '/bin/bash', argv.slice(1), {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    status: result.error?.code === 'ETIMEDOUT' ? 'timed-out' : result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  }
}

function memberEntrypoint(argv) {
  return argv[1] === '--test' ? argv[2] : argv[1]
}

function executionUnits(suite) {
  invariant(
    suite.execution && ['members', 'aggregate'].includes(suite.execution.kind),
    `Harness suite execution contract is missing or invalid:${suite.id}`,
  )
  if (suite.execution.kind === 'members') {
    invariant(Object.keys(suite.execution).length === 1, `Harness member suite execution contract is open:${suite.id}`)
    return suite.members.map(path => ({
      path,
      argv: memberArgv(path),
      boundPaths: [path],
      timeoutCapMs: suite.memberTimeoutMs,
    }))
  }
  invariant(
    Object.keys(suite.execution).sort().join(',') === 'command,kind'
      && JSON.stringify(suite.execution.command) === JSON.stringify(CANONICAL_HOOK_AGGREGATE)
      && suite.id === 'canonical-hook-behavioral',
    `Harness aggregate suite command is not the one reviewed canonical hook runner:${suite.id}`,
  )
  return [{
    path: CANONICAL_HOOK_AGGREGATE[1],
    argv: [...CANONICAL_HOOK_AGGREGATE],
    boundPaths: [CANONICAL_HOOK_AGGREGATE[1], ...suite.members],
    timeoutCapMs: suite.totalTimeoutMs,
  }]
}

function sourceIdentity(repoRoot, path) {
  invariant(
    typeof path === 'string'
      && path.length > 0
      && !isAbsolute(path)
      && !path.includes('\\')
      && !/[\0\n\r]/.test(path)
      && path.split('/').every(part => part && part !== '.' && part !== '..'),
    `Harness suite member path is not portable:${String(path)}`,
  )
  const root = realpathSync(resolve(repoRoot))
  const absolute = resolve(root, path)
  const lexicalRelative = relative(root, absolute)
  invariant(
    lexicalRelative !== '..' && !lexicalRelative.startsWith(`..${sep}`) && !isAbsolute(lexicalRelative),
    `Harness suite member escapes the repository:${path}`,
  )
  const info = lstatSync(absolute, { bigint: true })
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n, `Harness suite member identity is unsafe:${path}`)
  invariant(realpathSync(absolute) === absolute, `Harness suite member traverses a symbolic-link alias:${path}`)
  return {
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: info.mode.toString(),
    size: info.size.toString(),
    mtimeNs: info.mtimeNs.toString(),
    sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
  }
}

export function runHarnessSuite({
  suiteId,
  repoRoot = REPO_ROOT,
  inventory = readHarnessSourceInventory(),
  registry = readHarnessRegistry(),
  execute = defaultExecute,
  environment = process.env,
} = {}) {
  invariant(environment.GOVERNANCE_HARNESS_ACTIVE === '1', 'Harness suite may only run inside the canonical all-Harness runner')
  invariant(environment.GOVERNANCE_HARNESS_SUITE_ACTIVE !== '1', 'Nested Harness suite execution is forbidden')
  validateHarnessSourceInventory(inventory, { repoRoot, registry })
  const suite = inventory.suites.find(candidate => candidate.id === suiteId)
  invariant(suite, `Unknown Harness suite:${String(suiteId)}`)
  const childEnvironment = {
    ...environment,
    GOVERNANCE_HARNESS_ACTIVE: '1',
    GOVERNANCE_HARNESS_SUITE_ACTIVE: '1',
  }
  const results = []
  const started = Date.now()
  const deadlineAt = started + suite.totalTimeoutMs
  const units = executionUnits(suite)
  const canonicalHookClosurePaths = suite.id === 'canonical-hook-behavioral'
    ? inventory.canonicalHookStaticHelpers.entries.flatMap(entry => [entry.path, ...entry.consumers])
    : []
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]
    const { path, argv } = unit
    const remainingMs = deadlineAt - Date.now()
    if (remainingMs < 1_000) {
      results.push({
        path,
        argv,
        status: 'timed-out',
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: 'Closed Harness suite exhausted its total deadline before this member could start.',
      })
      for (const skipped of units.slice(index + 1)) {
        results.push({
          path: skipped.path,
          argv: skipped.argv,
          status: 'not-run-after-suite-deadline',
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: 'Closed Harness suite deadline was already exhausted.',
        })
      }
      break
    }
    const transitiveFixturePaths = inventory.staticExecutionFixtures.entries
      .filter(fixture => fixture.consumers.some(consumer => unit.boundPaths.includes(consumer)))
      .map(fixture => fixture.path)
    const beforeAll = [...new Set([
      ...unit.boundPaths,
      ...transitiveFixturePaths,
      ...canonicalHookClosurePaths,
    ])].map(boundPath => ({
      path: boundPath,
      ...sourceIdentity(repoRoot, boundPath),
    }))
    const before = beforeAll[0]
    const result = execute(argv, {
      repoRoot,
      timeoutMs: Math.min(unit.timeoutCapMs, remainingMs),
      environment: childEnvironment,
      sourcePath: path,
      expectedSourceIdentity: before,
      expectedSourceIdentities: beforeAll,
    })
    invariant(result && ['passed', 'failed', 'timed-out'].includes(result.status), `Harness suite executor returned an invalid result:${path}`)
    const afterAll = beforeAll.map(expected => ({
      path: expected.path,
      ...sourceIdentity(repoRoot, expected.path),
    }))
    const sourceStable = JSON.stringify(afterAll) === JSON.stringify(beforeAll)
    const deadlineExceeded = Date.now() > deadlineAt
    results.push({
      path,
      argv,
      ...result,
      status: sourceStable ? (deadlineExceeded ? 'timed-out' : result.status) : 'failed',
      sourceStable,
      sourceIdentity: before,
      boundSourceIdentities: beforeAll,
      deadlineExceeded,
      stderr: `${result.stderr || ''}${sourceStable ? '' : `${result.stderr ? '\n' : ''}Harness source identity changed during execution.`}${deadlineExceeded ? `${result.stderr || !sourceStable ? '\n' : ''}Closed Harness suite exceeded its total deadline during this member.` : ''}`,
    })
    if (deadlineExceeded) {
      for (const skipped of units.slice(index + 1)) {
        results.push({
          path: skipped.path,
          argv: skipped.argv,
          status: 'not-run-after-suite-deadline',
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: 'Closed Harness suite deadline was already exhausted.',
        })
      }
      break
    }
  }
  return {
    schemaVersion: 1,
    kind: 'provider-neutral-governance-harness-suite-summary',
    suiteId,
    executionBoundary: inventory.executionBoundary,
    totalTimeoutMs: suite.totalTimeoutMs,
    durationMs: Date.now() - started,
    status: results.every(result => result.status === 'passed') ? 'passed' : 'failed',
    results,
  }
}

function parseSuiteId(argv) {
  return argv.length === 4 && argv[2] === '--suite' && /^[a-z][a-z0-9-]*$/.test(argv[3]) ? argv[3] : null
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const suiteId = parseSuiteId(process.argv)
  if (!suiteId) {
    console.error('Usage: node infra/governance/bin/run-harness-suite.mjs --suite <closed-suite-id>')
    process.exitCode = 2
  } else {
    try {
      const summary = runHarnessSuite({ suiteId })
      for (const result of summary.results) {
        if (result.stdout) process.stdout.write(result.stdout)
        if (result.stderr) process.stderr.write(result.stderr)
      }
      console.log(JSON.stringify(summary, null, 2))
      if (summary.status !== 'passed') process.exitCode = 1
    } catch (error) {
      console.error(`Harness suite blocked: ${error.message}`)
      process.exitCode = 1
    }
  }
}
