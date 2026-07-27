#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  assertRepositoryFingerprintUnchanged,
  buildHookEvidenceChildEnvironment,
  buildHookEnforcementSuiteEnvironment,
  buildHookReplayRoutes,
  classifyHookInvocationResult,
  formatHookEnforcementSuiteFailureDetail,
  formatHookReplayFailureMessage,
} from './produce-hook-enforced-evidence.mjs'
import {
  captureDeepAuditSnapshot,
  digestSandboxVerification,
  sha256,
} from './lib/deep-audit-evidence-contract.mjs'
import {
  createDisposableRepositorySnapshot,
  disposableSnapshotEnvironment,
  fingerprintCallerRepository,
  fingerprintRepositoryWorktree,
  removeDisposableRepositorySnapshot,
  verifySnapshotAgainstManifest,
} from './lib/disposable-repository-snapshot.mjs'
import { selectFrozenHookInventory } from './lib/hook-evidence-plan.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRODUCER = resolve(ROOT, 'scripts/produce-hook-enforced-evidence.mjs')
const CANONICAL_HOOK_SUITE = resolve(ROOT, 'packages/design-system/ds-canonical/hooks/tests/run-all.sh')

const canonicalHookSuiteSource = readFileSync(CANONICAL_HOOK_SUITE, 'utf8')
const producerSource = readFileSync(PRODUCER, 'utf8')
assert.match(
  canonicalHookSuiteSource,
  /unset GOVERNANCE_RUNTIME_ROOT GOVERNANCE_STATE_DIR[\s\S]*GOVERNANCE_STATIC_REPLAY GOVERNANCE_TRANSCRIPT_PATH[\s\S]*GOVERNANCE_TRANSCRIPT_CONTRACT TRANSCRIPT_PATH[\s\S]*GOVERNANCE_PROVIDER GOVERNANCE_SELF_PROVIDER[\s\S]*GOVERNANCE_WRITE_STATE_TRUST GOVERNANCE_PROVIDER_ADAPTER_JSON/,
  'canonical hook fixtures must not inherit caller runtime, replay, transcript, or provider trust bindings',
)
assert.match(
  producerSource,
  /buildProviderHookStdinInvocation/,
  'evidence replay must use the shared stdin-only provider hook transport',
)
assert.doesNotMatch(
  producerSource,
  /GOVERNANCE_TOOL_INPUT\s*:\s*JSON\.stringify/,
  'evidence replay must never duplicate full file content into a child environment variable',
)
assert.match(
  canonicalHookSuiteSource,
  /export GOVERNANCE_TELEMETRY_OPT_IN=0/,
  'canonical hook fixtures must start with telemetry disabled',
)

const replayEnvironmentFixture = {
  PATH: '/trusted/bin:/usr/bin:/bin',
  HOME: '/isolated/home',
  TMPDIR: '/isolated/tmp',
  GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT: '/isolated/repo',
  GOVERNANCE_PROJECT_DIR: '/isolated/repo',
  GOVERNANCE_CORPUS_ROOT: '/isolated/repo',
  GOVERNANCE_PROVIDER_REGISTRY: 'packages/governance/canonical/providers.json',
  GOVERNANCE_READ_ONLY: '1',
  GOVERNANCE_TELEMETRY_OPT_IN: '0',
  GOVERNANCE_STATIC_REPLAY: '1',
  GOVERNANCE_TRANSCRIPT_PATH: '/isolated/transcript.jsonl',
  GOVERNANCE_TRANSCRIPT_CONTRACT: 'fixture-v1',
  TRANSCRIPT_PATH: '/ambient/transcript.jsonl',
  GOVERNANCE_PROVIDER: 'generic',
  GOVERNANCE_SELF_PROVIDER: 'generic',
  GOVERNANCE_WRITE_STATE_TRUST: 'runner-v1',
  GOVERNANCE_PROVIDER_ADAPTER_JSON: '{"poison":true}',
}
const suiteEnvironmentFixture = buildHookEnforcementSuiteEnvironment(replayEnvironmentFixture)
for (const name of [
  'GOVERNANCE_STATIC_REPLAY',
  'GOVERNANCE_TRANSCRIPT_PATH',
  'GOVERNANCE_TRANSCRIPT_CONTRACT',
  'TRANSCRIPT_PATH',
  'GOVERNANCE_PROVIDER',
  'GOVERNANCE_SELF_PROVIDER',
  'GOVERNANCE_WRITE_STATE_TRUST',
  'GOVERNANCE_PROVIDER_ADAPTER_JSON',
]) {
  assert.equal(Object.hasOwn(suiteEnvironmentFixture, name), false, `suite environment leaked ${name}`)
  assert.equal(Object.hasOwn(replayEnvironmentFixture, name), true, `suite environment mutated ${name}`)
}
for (const name of [
  'PATH',
  'HOME',
  'TMPDIR',
  'GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT',
  'GOVERNANCE_PROJECT_DIR',
  'GOVERNANCE_CORPUS_ROOT',
  'GOVERNANCE_PROVIDER_REGISTRY',
  'GOVERNANCE_READ_ONLY',
  'GOVERNANCE_TELEMETRY_OPT_IN',
]) {
  assert.equal(suiteEnvironmentFixture[name], replayEnvironmentFixture[name], `suite environment lost ${name}`)
}
assert.throws(
  () => buildHookEnforcementSuiteEnvironment(null),
  /canonical hook enforcement suite environment must be an object/,
)
const longFailureOutput = `${'discard-me-'.repeat(2_000)}TAIL`
const failureDetail = formatHookEnforcementSuiteFailureDetail({
  stdout: longFailureOutput,
  stderr: 'diagnostic',
})
assert.equal(failureDetail.includes(longFailureOutput), false, 'suite failure detail leaked unbounded stdout')
assert.match(failureDetail, /TAIL":stderrTail="diagnostic"$/)

const sharedReplayDescriptor = {
  runtime: 'bash',
  outputMode: 'governance-context',
}
const sharedReplay = {
  hook: 'check_story_invariants.sh',
  event: 'PostToolUse',
  tool: 'Edit',
}
const sharedReplayValidated = {
  plan: {
    dimensions: [
      { dim: 54, fileReplays: [sharedReplay] },
      { dim: 11, fileReplays: [sharedReplay] },
    ],
  },
  boundRegistrations: [
    { dim: 54, mode: 'file-replay', ...sharedReplay, descriptor: sharedReplayDescriptor },
    { dim: 11, mode: 'file-replay', ...sharedReplay, descriptor: sharedReplayDescriptor },
  ],
}
const sharedRoutes = buildHookReplayRoutes(sharedReplayValidated)
assert.equal(sharedRoutes.size, 1, 'shared replay route must execute once')
assert.deepEqual(
  [...sharedRoutes.values()][0].dimensions,
  [11, 54],
  'shared replay route must retain every bound dimension',
)

const timeout = new Error('untrusted child failure includes SECRET_FILE_CONTENT')
timeout.code = 'ETIMEDOUT'
const replayFailure = formatHookReplayFailureMessage({
  dimensions: [54, 11, 54],
  path: 'packages/design-system/src/components/DataTable/data-table.stories.tsx',
  replay: sharedReplay,
  error: timeout,
})
assert.match(replayFailure, /^hook evidence producer blocked:file replay failed:/)
assert.match(replayFailure, /"dimensions":\[11,54\]/)
assert.match(
  replayFailure,
  /"route":\{"event":"PostToolUse","hook":"check_story_invariants\.sh","tool":"Edit"\}/,
)
assert.match(
  replayFailure,
  /"inventoryPath":"packages\/design-system\/src\/components\/DataTable\/data-table\.stories\.tsx"/,
)
assert.match(replayFailure, /"code":"ETIMEDOUT","kind":"timeout","timeoutMs":120000/)
assert.doesNotMatch(replayFailure, /SECRET_FILE_CONTENT/, 'replay failure leaked file content')
const producerFailure = formatHookReplayFailureMessage({
  dimensions: [11],
  path: 'packages/design-system/src/components/DataTable/data-table.stories.tsx',
  replay: sharedReplay,
  error: new Error('hook evidence producer blocked:synthetic SECRET_FILE_CONTENT'),
})
assert.match(producerFailure, /"kind":"producer-error","messageSha256":"[a-f0-9]{64}"/)
assert.doesNotMatch(producerFailure, /SECRET_FILE_CONTENT/, 'producer failure leaked file content')

function browserlessNestedFixtureEnvironment(snapshot) {
  // The outer isolated meta-test runner may inject a lock-matched browser cache
  // for the real repository.  This synthetic poison repository intentionally
  // has no Playwright package, so that outer path is not fixture authority.
  const baseEnvironment = { ...process.env }
  delete baseEnvironment.PLAYWRIGHT_BROWSERS_PATH
  assert.equal(Object.hasOwn(baseEnvironment, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  const environment = disposableSnapshotEnvironment(snapshot, { baseEnvironment })
  assert.equal(Object.hasOwn(environment, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  return environment
}

const inventoryPlan = {
  source: 'active-run-frozen-inventory',
  includePrefixes: ['packages/design-system/src/'],
  minimumFiles: 1,
}

assert.deepEqual(
  selectFrozenHookInventory({
    inventory: [
      { path: 'outside.txt', kind: 'file' },
      { path: 'packages/design-system/src/a.ts', kind: 'file' },
      { path: 'packages/design-system/src/b.tsx', kind: 'file' },
    ],
  }, inventoryPlan),
  ['packages/design-system/src/a.ts', 'packages/design-system/src/b.tsx'],
)
assert.throws(
  () => selectFrozenHookInventory({ inventory: [{ path: 'outside.txt', kind: 'file' }] }, inventoryPlan),
  /frozen DS inventory has 0 files/,
)
assert.throws(
  () => selectFrozenHookInventory({ inventory: [{ path: 'packages/design-system/src/missing.ts', kind: 'missing' }] }, inventoryPlan),
  /unsupported or missing entry/,
)
assert.throws(
  () => selectFrozenHookInventory({ inventory: [{ path: 'packages/design-system/src/link.ts', kind: 'symlink' }] }, inventoryPlan),
  /unsupported or missing entry/,
)
assert.throws(
  () => selectFrozenHookInventory({
    inventory: [
      { path: 'packages/design-system/src/b.ts', kind: 'file' },
      { path: 'packages/design-system/src/a.ts', kind: 'file' },
    ],
  }, inventoryPlan),
  /not unique and sorted/,
)

const replay = { hook: 'check_example.sh', event: 'PreToolUse', tool: 'Edit' }
const clean = classifyHookInvocationResult({
  path: 'packages/design-system/src/a.ts',
  replay,
  result: { exitCode: 0, stdout: '', stderr: '' },
})
assert.equal(clean.receipt.outcome, 'clean')
assert.equal(clean.finding, null)

const warning = classifyHookInvocationResult({
  path: 'packages/design-system/src/a.ts',
  replay,
  result: { exitCode: 0, stdout: '{"governanceContext":{"hookEventName":"PreToolUse","message":"WARN: residue"}}', stderr: '' },
})
assert.equal(warning.receipt.outcome, 'warning')
assert.equal(warning.receipt.stdoutBytes, Buffer.byteLength('{"governanceContext":{"hookEventName":"PreToolUse","message":"WARN: residue"}}'))
assert.equal(warning.receipt.stderrSha256, sha256(''))
assert.match(warning.finding.stdoutExcerpt, /governanceContext/)
assert.equal(warning.finding.stderrExcerpt, '')

const blocking = classifyHookInvocationResult({
  path: 'packages/design-system/src/a.ts',
  replay,
  result: { exitCode: 2, stdout: '', stderr: 'BLOCKED\n' },
  outputMode: 'blocking',
})
assert.equal(blocking.receipt.outcome, 'blocking')
assert.equal(blocking.finding.stderrExcerpt, 'BLOCKED\n')
assert.throws(
  () => classifyHookInvocationResult({ path: 'x', replay, result: { exitCode: 1, stdout: '', stderr: '' } }),
  /hook child-result integrity failure/,
)
assert.throws(
  () => classifyHookInvocationResult({ path: 'x', replay, result: { exitCode: 0, stdout: '', stderr: 'invisible warning' }, outputMode: 'diagnostic' }),
  /hook child-result integrity failure/,
)
assert.throws(
  () => classifyHookInvocationResult({
    path: 'x',
    replay,
    result: { exitCode: 0, stdout: '', stderr: 'raw warning' },
    outputMode: 'governance-context',
  }),
  /hook child-result integrity failure/,
)
assert.throws(
  () => classifyHookInvocationResult({
    path: 'x',
    replay,
    result: { exitCode: 2, stdout: '', stderr: '' },
    outputMode: 'blocking',
  }),
  /hook child-result integrity failure/,
)
assert.throws(
  () => classifyHookInvocationResult({ path: 'x', replay, result: { exitCode: null, stdout: '', stderr: '' } }),
  /lacks an exit record/,
)

function runCli(args) {
  const result = spawnSync(process.execPath, ['--', PRODUCER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return result
}

const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'hook-evidence-plan-check-'))
try {
  const evidenceRoot = resolve(temporaryRoot, 'must-not-be-created')
  for (const mode of ['--plan', '--check']) {
    const result = runCli([mode, '--json', '--repo-root', ROOT, '--evidence-root', evidenceRoot])
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.dimensionCount, 39)
    assert.equal(output.writes, false)
    assert.equal(output.executes, false)
    assert.deepEqual(output.dimensions, [1, 4, 11, 13, 18, 21, 29, 30, 31, 34, 35, 37, 39, 47, 52, 53, 54, 56, 57, 58, 59, 60, 61, 63, 65, 67, 69, 70, 71, 73, 74, 75, 76, 78, 79, 80, 81, 82, 89])
    assert.equal(readFileSync(PRODUCER, 'utf8').includes('writeDeepAuditEvidenceEnvelopeBatch'), true)
    assert.equal(result.stderr, '')
    assert.equal(await import('node:fs').then(({ existsSync }) => existsSync(evidenceRoot)), false)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

const conflictingMode = runCli(['--plan', '--execute'])
assert.equal(conflictingMode.status, 2)
assert.match(conflictingMode.stderr, /choose exactly one/)

const poisonRoot = mkdtempSync(resolve(tmpdir(), 'hook-evidence-poison-source-'))
let poisonSnapshot = null
try {
  const git = args => execFileSync('git', ['-C', poisonRoot, ...args], { encoding: 'utf8' })
  git(['init', '-q'])
  git(['config', 'user.name', 'Hook Evidence Test'])
  git(['config', 'user.email', 'hook-evidence@example.invalid'])
  mkdirSync(join(poisonRoot, 'scripts'), { recursive: true })
  mkdirSync(join(poisonRoot, 'node_modules'), { recursive: true })
  writeFileSync(join(poisonRoot, '.gitignore'), 'node_modules/\n')
  const emptyLock = `${JSON.stringify({
    name: 'hook-evidence-poison-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {},
  }, null, 2)}\n`
  writeFileSync(join(poisonRoot, 'package-lock.json'), emptyLock)
  writeFileSync(join(poisonRoot, 'node_modules', '.package-lock.json'), emptyLock)
  writeFileSync(join(poisonRoot, 'sentinel.txt'), 'source-must-stay-identical\n')
  writeFileSync(join(poisonRoot, 'scripts/ignore-read-only.sh'), [
    '#!/bin/bash',
    'set -eu',
    'printf "poison\n" > "$GOVERNANCE_PROJECT_DIR/poison-residue.txt"',
    '',
  ].join('\n'))
  chmodSync(join(poisonRoot, 'scripts/ignore-read-only.sh'), 0o755)
  git(['add', '.'])
  git(['commit', '-qm', 'poison fixture'])

  const manifest = captureDeepAuditSnapshot(poisonRoot)
  const sourceBefore = fingerprintCallerRepository(poisonRoot)
  poisonSnapshot = createDisposableRepositorySnapshot({
    root: poisonRoot,
    dependencyRoot: poisonRoot,
    prefix: 'hook-evidence-poison-snapshot-',
  })
  const verification = verifySnapshotAgainstManifest(poisonSnapshot.snapshotRoot, manifest, {
    dependencyRoots: poisonSnapshot.dependencyViews.map(({ label }) => label),
  })
  assert.equal(verification.verificationDigest, digestSandboxVerification(manifest))
  const environment = browserlessNestedFixtureEnvironment(poisonSnapshot)
  const inheritedTranscriptPath = process.env.TRANSCRIPT_PATH
  process.env.TRANSCRIPT_PATH = '/caller/live-session-must-not-enter-evidence.jsonl'
  let producerEnvironment
  try {
    producerEnvironment = buildHookEvidenceChildEnvironment(
      poisonSnapshot,
      null,
      { providers: [] },
    )
  } finally {
    if (inheritedTranscriptPath === undefined) delete process.env.TRANSCRIPT_PATH
    else process.env.TRANSCRIPT_PATH = inheritedTranscriptPath
  }
  assert.equal(
    Object.hasOwn(producerEnvironment, 'TRANSCRIPT_PATH'),
    false,
    'hook evidence replay inherited a caller-native transcript alias',
  )
  assert.equal(
    producerEnvironment.PATH.startsWith(`${poisonSnapshot.dependencyView}/.bin:`),
    true,
    'hook evidence execute mode must prepend the authenticated dependency bin',
  )
  assert.match(
    producerEnvironment.PATH,
    /(?:^|:)\/usr\/bin:\/bin(?:$|:)/,
    'hook evidence execute mode must restore the canonical fixed system executable path',
  )
  environment.GOVERNANCE_PROJECT_DIR = poisonSnapshot.snapshotRoot
  environment.GOVERNANCE_READ_ONLY = '1'
  environment.GOVERNANCE_TELEMETRY_OPT_IN = '0'
  const sandboxBefore = fingerprintRepositoryWorktree(poisonSnapshot.snapshotRoot)
  const poison = spawnSync('bash', ['--', join(poisonSnapshot.snapshotRoot, 'scripts/ignore-read-only.sh')], {
    cwd: poisonSnapshot.snapshotRoot,
    env: environment,
    encoding: 'utf8',
  })
  assert.equal(poison.status, 0, poison.stderr)
  const sandboxAfter = fingerprintRepositoryWorktree(poisonSnapshot.snapshotRoot)
  assert.throws(
    () => assertRepositoryFingerprintUnchanged({ before: sandboxBefore, after: sandboxAfter, label: 'poison hook' }),
    /mutated isolated repository:.*poison-residue\.txt/,
  )
  assert.equal(existsSync(join(poisonRoot, 'poison-residue.txt')), false)
  assert.equal(readFileSync(join(poisonRoot, 'sentinel.txt'), 'utf8'), 'source-must-stay-identical\n')
  assert.deepEqual(fingerprintCallerRepository(poisonRoot), sourceBefore)
} finally {
  removeDisposableRepositorySnapshot(poisonSnapshot)
  rmSync(poisonRoot, { recursive: true, force: true })
}

console.log('✓ hook evidence producer fails closed on gaps/crashes/drift, retains warnings, isolates poison writes, and keeps plan/check read-only')
