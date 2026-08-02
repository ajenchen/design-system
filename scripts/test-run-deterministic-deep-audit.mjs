#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { captureDeepAuditSnapshot } from './lib/deep-audit-evidence-contract.mjs'
import {
  assertDeterministicMatrixParity,
  expandDeterministicCoverage,
  loadDeterministicDeepAuditPlan,
  validateDeterministicDeepAuditPlan,
} from './lib/deep-audit-deterministic-plan.mjs'
import {
  deterministicRunnerTestHarness,
  parseDeterministicRunnerArgs,
  runDeterministicDeepAudit,
  validateDeterministicCommandCompletion,
} from './run-deterministic-deep-audit.mjs'
import {
  createDisposableRepositorySnapshot,
  disposableSnapshotEnvironment,
} from './lib/disposable-repository-snapshot.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNNER = resolve(ROOT, 'scripts/run-deterministic-deep-audit.mjs')
const PLAN_PATH = resolve(ROOT, 'scripts/deep-audit-deterministic-plan.json')
const PROCESS_TREE_FIXTURE_ROOT = resolve(ROOT, 'scripts/test-fixtures/deterministic-deep-audit')
const EXPECTED_DIMS = [2, 3, 5, 14, 15, 16, 23, 27, 36, 40, 41, 42, 45, 48, 49, 50, 51, 77, 83, 84, 85, 86, 87, 88, 91]

function browserlessNestedFixtureEnvironment(snapshot) {
  // The outer gate-meta snapshot can provide Playwright for the real DS repo.
  // This minimal mutation fixture has no Playwright dependency by design and
  // must not reinterpret the outer injected cache path as its own authority.
  const baseEnvironment = { ...process.env }
  delete baseEnvironment.PLAYWRIGHT_BROWSERS_PATH
  assert.equal(Object.hasOwn(baseEnvironment, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  const environment = disposableSnapshotEnvironment(snapshot, { baseEnvironment })
  assert.equal(Object.hasOwn(environment, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  assert.equal(environment.HOME, join(snapshot.runtimeRoot, 'home'))
  assert.equal(environment.USERPROFILE, environment.HOME)
  assert.equal(environment.XDG_CONFIG_HOME, join(environment.HOME, '.config'))
  assert.equal(environment.CACHE_DIR, join(snapshot.runtimeRoot, 'cache'))
  assert.equal(environment.XDG_CACHE_HOME, environment.CACHE_DIR)
  assert.equal(environment.XDG_DATA_HOME, join(environment.HOME, '.local', 'share'))
  assert.equal(environment.XDG_STATE_HOME, join(environment.HOME, '.local', 'state'))
  assert.equal(environment.STORYBOOK_DISABLE_TELEMETRY, '1')
  assert.equal(environment.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS, '1')
  assert.equal(environment.NPM_CONFIG_USERCONFIG, join(environment.HOME, '.npmrc'))
  assert.equal(environment.GIT_CONFIG_GLOBAL, join(environment.HOME, '.gitconfig'))
  assert.equal(readFileSync(environment.NPM_CONFIG_USERCONFIG, 'utf8'), '')
  assert.equal(readFileSync(environment.GIT_CONFIG_GLOBAL, 'utf8'), '')
  return environment
}

test('execution plan exactly closes the 25 deterministic matrix dimensions and corrected argv', () => {
  const state = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  assertDeterministicMatrixParity(state, { repoRoot: ROOT })
  assert.deepEqual([...state.dimensionByNumber.keys()].sort((a, b) => a - b), EXPECTED_DIMS)
  assert.deepEqual(state.commandById.get('code-quality').argv, ['node', 'scripts/code-quality-audit.mjs', '--scope=all', '--check'])
  assert.deepEqual(state.commandById.get('compile-stories').argv, ['node', 'scripts/compile-stories.mjs', '--all', '--check'])
  assert.deepEqual(state.dimensionByNumber.get(14).commandIds, ['naming-structure', 'repository-hygiene'])
  assert.deepEqual(state.commandById.get('repository-hygiene').argv, ['node', 'scripts/repository-hygiene-invariant.mjs', '--profile=authority', '--check'])
  assert.deepEqual(state.commandById.get('visual-theme-density-matrix').argv, ['node', 'scripts/visual-audit.mjs', '--static', '--scope=all', '--matrix=theme-density'])
  assert.deepEqual(
    state.dimensionByNumber.get(51).commandIds,
    ['build-library', 'build-storybook', 'visual-theme-density-matrix'],
    'standalone dimension 51 must build the exact static Storybook before the isolated visual scan',
  )
  for (const configPath of ['tsconfig.app.json', 'tsconfig.node.json']) {
    const configSource = readFileSync(resolve(ROOT, configPath), 'utf8')
    assert.doesNotMatch(configSource, /node_modules\/\.tmp/, `${configPath} must not write build state into installed dependencies`)
    assert.match(configSource, /"tsBuildInfoFile": "\.\/dist\/\.tsbuildinfo\//, `${configPath} build state must stay in the declared dist output`)
  }
  const nodeConfigSource = readFileSync(resolve(ROOT, 'tsconfig.node.json'), 'utf8')
  assert.match(
    nodeConfigSource,
    /"@qijenchen\/storybook-config\/preset": \["\.\/packages\/storybook-config\/addons-preset\.ts"\]/,
    'fresh root typecheck must resolve the Storybook preset from source without requiring a prior package build',
  )
  const visualAuditSource = readFileSync(resolve(ROOT, 'scripts/visual-audit.mjs'), 'utf8')
  assert.match(visualAuditSource, /startA11yStaticServer\(\{ rootDirectory: staticDirectory/)
  assert.match(visualAuditSource, /createRenderHealthMonitor\(page, \{\s*mode: scenario\.url \? 'document' : 'storybook'/)
  assert.match(visualAuditSource, /await renderHealth\.assertHealthy/)
  assert.match(visualAuditSource, /executeVisualInteraction[\s\S]*await renderHealth\.assertHealthy/, 'visual audit must re-check render health after interaction')
  assert.match(visualAuditSource, /await stopStorybook\(\)/)
  assert.match(visualAuditSource, /await closeBrowser\(\)/)
  assert.doesNotMatch(visualAuditSource, /spawn\(['"]npm['"], \[['"]run['"], ['"]storybook['"]/, 'visual audit must not attach to a fixed-port dev server')
  assert.deepEqual(state.dimensionByNumber.get(50).coverage.include, [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'src/**/*.{ts,tsx,css}',
    'packages/design-system/package.json',
    'packages/design-system/bundle-budget.json',
    'packages/design-system/vite.config.ts',
    'packages/design-system/tsconfig.json',
    'packages/design-system/src/**/*.{ts,tsx,css}',
    'packages/storybook-config/package.json',
    'packages/storybook-config/tsconfig.json',
    'packages/storybook-config/**/*.{ts,tsx}',
  ])
  assert.deepEqual(state.commandById.get('composition-fidelity').argv, [
    'node', 'scripts/composition-fidelity-visual-diff.mjs', '--ds-static=storybook-static',
    '--consumer-static=storybook-static', '--consumer-root=apps/template', '--require-mappings', '--threshold-pct=0.5',
  ])
  assert.deepEqual(state.commandById.get('published-live-deploy').argv, ['node', 'scripts/verify-published-deploy.mjs', '--live'])
})

test('default command executor reaps the complete descendant group on success and timeout', async (t) => {
  if (process.platform === 'win32') {
    t.skip('native Windows is unsupported; Windows consumers use WSL2/devcontainer')
    return
  }
  const root = mkdtempSync(join(tmpdir(), 'deep-audit-process-tree-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const marker = join(root, 'orphan-marker.txt')
  const fixture = join(root, 'process-tree-parent.mjs')
  copyFileSync(resolve(PROCESS_TREE_FIXTURE_ROOT, 'process-tree-parent.mjs'), fixture)
  copyFileSync(
    resolve(PROCESS_TREE_FIXTURE_ROOT, 'process-tree-grandchild.mjs'),
    join(root, 'process-tree-grandchild.mjs'),
  )
  const result = await deterministicRunnerTestHarness.runCommand({
    id: 'timeout-process-tree-fixture',
    argv: ['node', fixture, '--mode=timeout', marker],
    cwd: '.',
    timeoutSeconds: 0.1,
  }, {
    sandboxRoot: root,
    environment: process.env,
  })
  assert.match(result.error?.message ?? '', /timed out after 0\.1 seconds/)
  await delay(700)
  assert.equal(existsSync(marker), false, 'timed-out grandchild survived the runner process-group reap')

  const successMarker = join(root, 'success-orphan-marker.txt')
  const successResult = await deterministicRunnerTestHarness.runCommand({
    id: 'successful-process-tree-fixture',
    argv: ['node', fixture, '--mode=success', successMarker],
    cwd: '.',
    timeoutSeconds: 5,
  }, {
    sandboxRoot: root,
    environment: process.env,
  })
  assert.equal(successResult.exitCode, 0)
  assert.equal(successResult.error, null)
  await delay(700)
  assert.equal(existsSync(successMarker), false, 'successful parent left a detached grandchild after close')
})

test('every dimension coverage selector expands to a non-empty exact frozen-inventory subset', () => {
  const state = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  const manifest = captureDeepAuditSnapshot(ROOT)
  for (const dimension of state.plan.dimensions) {
    const coverage = expandDeterministicCoverage(state, manifest, dimension.dim)
    assert.ok(coverage.filesScanned > 0, `dim ${dimension.dim}`)
    assert.equal(coverage.filesScanned, coverage.inventoryPaths.length)
    assert.equal(new Set(coverage.inventoryPaths).size, coverage.inventoryPaths.length)
    assert.deepEqual(coverage.inventoryPaths, [...coverage.inventoryPaths].sort())
    assert.match(coverage.inventoryDigest, /^[a-f0-9]{64}$/)
  }
})

test('plan validator and CLI reject unsafe or unknown argv', () => {
  const poisoned = structuredClone(JSON.parse(readFileSync(PLAN_PATH, 'utf8')))
  poisoned.commands[0].argv = ['bash', '-c', 'exit 0']
  assert.throws(() => validateDeterministicDeepAuditPlan(poisoned, { repoRoot: ROOT }), /executable is not admitted/)
  assert.throws(() => parseDeterministicRunnerArgs(['--execute', '--mystery']), /unknown option/)
  assert.throws(() => parseDeterministicRunnerArgs(['--allow-build']), /require --execute/)
  assert.throws(() => parseDeterministicRunnerArgs(['--execute', '--allow-published-release']), /also requires --allow-network/)
  const unobserved = parseDeterministicRunnerArgs([
    '--record-unobserved=NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT',
    '--dims=83',
  ])
  assert.equal(unobserved.recordUnobserved, 'NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT')
  assert.deepEqual(unobserved.dims, [83])
  assert.throws(
    () => parseDeterministicRunnerArgs(['--record-unobserved=NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT', '--dims=83', '--execute']),
    /cannot be combined/,
  )
  assert.throws(
    () => parseDeterministicRunnerArgs(['--record-unobserved=NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT', '--dims=84']),
    /restricted to exact --dims=83/,
  )
  const misplacedPolicy = structuredClone(JSON.parse(readFileSync(PLAN_PATH, 'utf8')))
  misplacedPolicy.dimensions.find((dimension) => dimension.dim === 84).unobservedPolicy = structuredClone(
    misplacedPolicy.dimensions.find((dimension) => dimension.dim === 83).unobservedPolicy,
  )
  assert.throws(
    () => validateDeterministicDeepAuditPlan(misplacedPolicy, { repoRoot: ROOT }),
    /not the exact credential-gated live-deploy exception/,
  )
})

test('credentialless dim 83 records one exact UNOBSERVED receipt without executing or claiming PASS', async () => {
  const planState = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  const dimension = planState.dimensionByNumber.get(83)
  const activeRun = {
    manifestSha256: 'a'.repeat(64),
    manifest: { worktreeFingerprint: 'b'.repeat(64), inventory: [] },
  }
  let commandsExecuted = 0
  const result = await deterministicRunnerTestHarness.recordUnobserved({
    repoRoot: ROOT,
    planState,
    dimension,
    args: {
      recordUnobserved: 'NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT',
    },
    environment: {},
    now: new Date('2026-08-02T04:00:00.000Z'),
    dependencies: {
      loadActiveRun: async () => activeRun,
      expandCoverage: () => ({
        inventoryPaths: ['scripts/verify-published-deploy.mjs'],
        inventoryDigest: 'c'.repeat(64),
        filesScanned: 1,
      }),
      buildEnvelope: (value) => value,
      runCommand: async () => { commandsExecuted += 1 },
    },
  })
  assert.equal(commandsExecuted, 0)
  assert.equal(result.mode, 'record-unobserved')
  assert.equal(result.status, 'UNOBSERVED')
  assert.equal(result.commandsExecuted, 0)
  assert.equal(result.dimensionsReceipted, 1)
  assert.equal(result.testPublications.length, 1)
  const publication = result.testPublications[0]
  assert.equal(publication.appendExistingCategory, true)
  assert.equal(publication.items[0].relativePath, 'deterministic/dim-83.json')
  const { envelope } = publication.items[0]
  assert.equal(envelope.payload.dim, 83)
  assert.equal(envelope.payload.status, 'UNOBSERVED')
  assert.equal(envelope.payload.reasonCode, 'NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT')
  assert.deepEqual(envelope.payload.capabilities, ['local', 'network', 'published-release'])
  assert.deepEqual(envelope.payload.credentialReferences, {
    required: ['NETLIFY_LIVE_BASIC_AUTH', 'NETLIFY_PREVIEW_PASSWORD'],
    observed: [],
  })
  assert.match(envelope.payload.summary, /credential-gated live render was not observed/)
  assert.match(envelope.payload.summary, /CI dimensions 64\/66.*propagation evidence/)
  assert.deepEqual(envelope.command.argv, [
    'node',
    'scripts/run-deterministic-deep-audit.mjs',
    '--record-unobserved=NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT',
    '--dims=83',
  ])
  assert.equal(Object.hasOwn(envelope.payload, 'commands'), false)
  assert.equal(Object.hasOwn(envelope.payload, 'sandboxReceipt'), false)

  await assert.rejects(
    () => deterministicRunnerTestHarness.recordUnobserved({
      repoRoot: ROOT,
      planState,
      dimension,
      args: { recordUnobserved: 'NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT' },
      environment: { NETLIFY_PREVIEW_PASSWORD: 'present-but-redacted' },
      now: new Date('2026-08-02T04:00:00.000Z'),
      dependencies: {
        loadActiveRun: async () => { throw new Error('credential check must happen first') },
      },
    }),
    /cannot record credential absence.*NETLIFY_PREVIEW_PASSWORD/,
  )
})

test('production runner rejects dependency/model overrides and the test seam cannot publish', async () => {
  await assert.rejects(
    () => runDeterministicDeepAudit(['--profile=local'], { dependencies: { loadActiveRun() {} } }),
    /production runner API forbids override options:dependencies/,
  )
  await assert.rejects(
    () => runDeterministicDeepAudit(['--profile=local'], { planState: {} }),
    /production runner API forbids override options:planState/,
  )
  await assert.rejects(
    () => deterministicRunnerTestHarness.execute({ dependencies: { writeBatch() {} } }),
    /test harness forbids publication dependencies:writeBatch/,
  )
})

test('exit zero without required observations and zero-work output cannot become a receipt', () => {
  const state = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  const visual = state.commandById.get('visual-theme-density-matrix')
  assert.throws(() => validateDeterministicCommandCompletion(visual, {
    exitCode: 0,
    signal: null,
    error: null,
    stdout: 'scope=all,跑 0 scenario\n',
    stderr: '',
  }), /matched rejected infrastructure output|output is vacuous/)
  const composition = state.commandById.get('composition-fidelity')
  assert.throws(() => validateDeterministicCommandCompletion(composition, {
    exitCode: 0,
    signal: null,
    error: null,
    stdout: '✅ 0 個 identity-opt-in mapping → skip\n',
    stderr: '',
  }), /matched rejected infrastructure output|output is vacuous/)
  const compile = state.commandById.get('compile-stories')
  assert.throws(() => validateDeterministicCommandCompletion(compile, {
    exitCode: 0,
    signal: null,
    error: null,
    stdout: '✅ 62 component(s) canonical aligned; 2 skipped(migration 未做)\n',
    stderr: '',
  }), /matched rejected infrastructure output/)
  assert.throws(() => expandDeterministicCoverage(state, {
    inventory: [{ path: 'README.md', kind: 'file' }],
  }, 2), /matched no manifest path|vacuous/)
})

test('command completion failures preserve bounded diagnostic tails after snapshot cleanup', () => {
  const state = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  const command = state.commandById.get('a11y-all-stories')
  const oversizedPrefix = `START_SHOULD_BE_TRUNCATED:${'x'.repeat(5_000)}`
  assert.throws(
    () => validateDeterministicCommandCompletion(command, {
      exitCode: 1,
      signal: null,
      error: null,
      stdout: `${oversizedPrefix}\nA11Y_STORY_FAILURE:button-default`,
      stderr: 'axe gate found one unexpected regression',
    }),
    (error) => {
      assert.match(error.message, /command a11y-all-stories exited 1/)
      assert.match(error.message, /A11Y_STORY_FAILURE:button-default/)
      assert.match(error.message, /axe gate found one unexpected regression/)
      assert.doesNotMatch(error.message, /START_SHOULD_BE_TRUNCATED/)
      return true
    },
  )
})

test('one shared command executes once while each dimension receives an independent receipt', async () => {
  const command = {
    id: 'shared-story-quality',
    argv: ['node', 'scripts/fake.mjs'],
    cwd: '.',
    outputRoots: [],
    capabilities: ['local'],
    timeoutSeconds: 1,
    completion: { acceptedExitCodes: [0], minimumOutputMatches: [], rejectOutputPatterns: [] },
  }
  const dimensions = [40, 41, 42].map((dim) => ({
    dim,
    name: `dim-${dim}`,
    commandIds: [command.id],
    coverage: { include: ['fixture.txt'], exclude: [] },
  }))
  const planState = {
    plan: { commands: [command], dimensions },
    planDigest: 'a'.repeat(64),
    commandById: new Map([[command.id, command]]),
    dimensionByNumber: new Map(dimensions.map((dimension) => [dimension.dim, dimension])),
  }
  const activeRun = {
    manifestSha256: 'b'.repeat(64),
    manifest: { worktreeFingerprint: 'c'.repeat(64), inventory: [] },
  }
  let executions = 0
  const fakeSnapshot = {
    snapshotRoot: '/disposable/repo',
    dependencyMaterialization: 'fixture-independent-copy',
  }
  const result = await deterministicRunnerTestHarness.execute({
    repoRoot: ROOT,
    planState,
    dimensions,
    args: {
      execute: true,
      allowBuild: false,
      allowNetwork: false,
      allowPublishedRelease: false,
    },
    dependencies: {
      loadActiveRun: async () => activeRun,
      expandCoverage: (_state, _manifest, dim) => ({ inventoryPaths: [`fixture-${dim}.txt`], inventoryDigest: 'd'.repeat(64), filesScanned: 1 }),
      createSnapshot: () => fakeSnapshot,
      verifySnapshot: () => ({ file: 0, symlink: 0, missing: 0, inventoryEntries: 0, verificationDigest: 'e'.repeat(64) }),
      snapshotEnvironment: () => ({ ...process.env }),
      fingerprintCaller: () => ['unchanged'],
      fingerprintDependencies: () => ['dependency-unchanged'],
      fingerprintGenerated: () => [],
      validateDependencyIdentity: () => ({
        dependencyLockfileSha256: '1'.repeat(64),
        installedLockfileSha256: '2'.repeat(64),
        installedDependencyIdentityDigest: '3'.repeat(64),
        installedPackageCount: 1,
        provenance: 'caller-node-modules-copy',
      }),
      removeSnapshot: () => {},
      runCommand: async (_command, context) => {
        executions += 1
        assert.equal(context.sandboxRoot, fakeSnapshot.snapshotRoot)
        return {
          exitCode: 0,
          signal: null,
          error: null,
          stdout: 'pass\n',
          stderr: '',
          startedAt: '2026-07-21T00:00:00.000Z',
          finishedAt: '2026-07-21T00:00:01.000Z',
        }
      },
      buildEnvelope: (value) => value,
    },
  })
  assert.equal(executions, 1)
  assert.equal(result.dimensionsReceipted, 3)
  assert.equal(result.testPublications.length, 1)
  assert.equal(result.testPublications[0].appendExistingCategory, true)
  const writes = result.testPublications[0].items
  assert.deepEqual(writes.map((item) => item.relativePath), [
    'deterministic/dim-40.json', 'deterministic/dim-41.json', 'deterministic/dim-42.json',
  ])
  assert.deepEqual(writes.map((item) => item.envelope.payload.dim), [40, 41, 42])
  assert.ok(writes.every((item) => item.envelope.payload.commands.length === 1))
  assert.ok(writes.every((item) => item.envelope.payload.commands[0].stdoutTail.includes('[deep-audit-sandbox]')))
  assert.ok(writes.every((item) => item.envelope.payload.commands[0].generatedOutputReceipt.beforeDigest === item.envelope.payload.commands[0].generatedOutputReceipt.afterDigest))
  assert.ok(writes.every((item) => item.envelope.payload.sandboxReceipt.dependencyTrust === 'untrusted-local-copy'))
  assert.ok(writes.every((item) => item.envelope.payload.sandboxReceipt.dependencyProvenance === 'caller-node-modules-copy'))
  assert.ok(writes.every((item) => item.envelope.payload.sandboxReceipt.executionIsolation === 'disposable-repository-copy'))
  assert.ok(writes.every((item) => item.envelope.payload.sandboxReceipt.containmentBackend === 'none'))
  assert.ok(writes.every((item) => item.envelope.payload.sandboxReceipt.externalWriteContainment === 'unverified'))
})

test('frozen source mutation is contained, blocks every receipt, and leaves caller byte-identical', async () => {
  const root = mkdtempSync(join(tmpdir(), 'deterministic-deep-audit-caller-'))
  let capturedSnapshot = null
  const git = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    git(['init', '-q'])
    git(['config', 'user.name', 'Deterministic Audit Test'])
    git(['config', 'user.email', 'deterministic-audit@example.invalid'])
    writeFileSync(join(root, '.gitignore'), 'node_modules/\nignored-poison/\n')
    writeFileSync(join(root, 'fixture.txt'), 'caller\n')
    mkdirSync(join(root, 'ignored-poison'), { recursive: true })
    writeFileSync(join(root, 'ignored-poison', 'preload.cjs'), 'throw new Error("ignored poison executed")\n')
    const fifo = spawnSync('mkfifo', [join(root, 'ignored-poison', 'must-never-be-read')], { encoding: 'utf8' })
    assert.equal(fifo.status, 0, fifo.stderr)
    mkdirSync(join(root, 'node_modules', 'fixture'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'fixture', 'sentinel.txt'), 'dependency\n')
    writeFileSync(join(root, 'node_modules', '.package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/fixture': { version: '1.0.0' } },
    }))
    git(['add', '.gitignore', 'fixture.txt'])
    git(['commit', '-qm', 'fixture'])

    const command = {
      id: 'mutating-command',
      argv: ['node', 'scripts/fake.mjs'],
      cwd: '.',
      outputRoots: [],
      capabilities: ['local'],
      timeoutSeconds: 1,
      completion: { acceptedExitCodes: [0], minimumOutputMatches: [], rejectOutputPatterns: [] },
    }
    const dimension = {
      dim: 2,
      name: 'mutation-containment',
      commandIds: [command.id],
      coverage: { include: ['fixture.txt'], exclude: [] },
    }
    const planState = {
      plan: { commands: [command], dimensions: [dimension] },
      planDigest: 'a'.repeat(64),
      commandById: new Map([[command.id, command]]),
      dimensionByNumber: new Map([[dimension.dim, dimension]]),
    }
    const bytes = readFileSync(join(root, 'fixture.txt'))
    const activeRun = {
      manifestSha256: 'b'.repeat(64),
      manifest: {
        worktreeFingerprint: 'c'.repeat(64),
        inventory: [{
          path: 'fixture.txt',
          kind: 'file',
          mode: '100644',
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }],
      },
    }
    capturedSnapshot = createDisposableRepositorySnapshot({
      root,
      dependencyRoot: root,
      manifest: activeRun.manifest,
    })
    const viteConfigScratch = join(capturedSnapshot.snapshotRoot, 'node_modules', '.vite-temp')
    assert.equal(existsSync(viteConfigScratch), true)
    const transientConfig = join(viteConfigScratch, 'vite.config.ts.timestamp-test.mjs')
    writeFileSync(transientConfig, 'export default {};\n')
    rmSync(transientConfig)
    assert.deepEqual(
      readdirSync(viteConfigScratch),
      [],
      'Vite config scratch must return to its seeded empty before-image',
    )
    rmSync(capturedSnapshot.parent, { recursive: true, force: true })
    capturedSnapshot = null

    await assert.rejects(() => deterministicRunnerTestHarness.execute({
      repoRoot: root,
      planState,
      dimensions: [dimension],
      args: { execute: true, allowBuild: false, allowNetwork: false, allowPublishedRelease: false },
      dependencies: {
        loadActiveRun: async () => activeRun,
        expandCoverage: () => ({ inventoryPaths: ['fixture.txt'], inventoryDigest: 'd'.repeat(64), filesScanned: 1 }),
        createSnapshot: (options) => {
          capturedSnapshot = createDisposableRepositorySnapshot(options)
          return capturedSnapshot
        },
        snapshotEnvironment: browserlessNestedFixtureEnvironment,
        fingerprintDependencies: () => ['dependency-unchanged'],
        validateDependencyIdentity: () => ({
          dependencyLockfileSha256: '1'.repeat(64),
          installedLockfileSha256: '2'.repeat(64),
          installedDependencyIdentityDigest: '3'.repeat(64),
          installedPackageCount: 1,
          provenance: 'caller-node-modules-copy',
        }),
        runCommand: async (_value, { sandboxRoot, environment }) => {
          assert.equal(environment.HOME, join(capturedSnapshot.runtimeRoot, 'home'))
          assert.notEqual(environment.HOME, process.env.HOME)
          assert.equal(environment.STORYBOOK_DISABLE_TELEMETRY, '1')
          assert.equal(environment.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS, '1')
          assert.equal(existsSync(join(sandboxRoot, 'ignored-poison', 'preload.cjs')), false, 'ignored pre-existing poison entered frozen snapshot')
          writeFileSync(join(sandboxRoot, 'fixture.txt'), 'MUTATED-IN-SNAPSHOT\n')
          return {
            exitCode: 0,
            signal: null,
            error: null,
            stdout: 'pass\n',
            stderr: '',
            startedAt: '2026-07-21T00:00:00.000Z',
            finishedAt: '2026-07-21T00:00:01.000Z',
          }
        },
      },
    }), /manifest path bytes differ/)
    assert.equal(readFileSync(join(root, 'fixture.txt'), 'utf8'), 'caller\n')
    assert.ok(capturedSnapshot)
    assert.equal(existsSync(capturedSnapshot.parent), false)

    capturedSnapshot = null
    await assert.rejects(() => deterministicRunnerTestHarness.execute({
      repoRoot: root,
      planState,
      dimensions: [dimension],
      args: { execute: true, allowBuild: false, allowNetwork: false, allowPublishedRelease: false },
      dependencies: {
        loadActiveRun: async () => activeRun,
        expandCoverage: () => ({ inventoryPaths: ['fixture.txt'], inventoryDigest: 'd'.repeat(64), filesScanned: 1 }),
        createSnapshot: (options) => {
          capturedSnapshot = createDisposableRepositorySnapshot(options)
          return capturedSnapshot
        },
        snapshotEnvironment: browserlessNestedFixtureEnvironment,
        validateDependencyIdentity: () => ({
          dependencyLockfileSha256: '1'.repeat(64),
          installedLockfileSha256: '2'.repeat(64),
          installedDependencyIdentityDigest: '3'.repeat(64),
          installedPackageCount: 1,
          provenance: 'caller-node-modules-copy',
        }),
        runCommand: async (_value, { sandboxRoot }) => {
          writeFileSync(join(sandboxRoot, 'node_modules', 'fixture', 'sentinel.txt'), 'POISONED-DEPENDENCY\n')
          return {
            exitCode: 0,
            signal: null,
            error: null,
            stdout: 'pass\n',
            stderr: '',
            startedAt: '2026-07-21T00:00:00.000Z',
            finishedAt: '2026-07-21T00:00:01.000Z',
          }
        },
      },
    }), /command mutating-command changed the installed dependency view:.*node_modules\/fixture\/sentinel\.txt/)
    assert.equal(readFileSync(join(root, 'node_modules', 'fixture', 'sentinel.txt'), 'utf8'), 'dependency\n')
    assert.ok(capturedSnapshot)
    assert.equal(existsSync(capturedSnapshot.parent), false)

    const outside = mkdtempSync(join(tmpdir(), 'deterministic-generated-escape-'))
    try {
      writeFileSync(join(outside, 'sentinel.txt'), 'outside-unchanged\n')
      command.outputRoots = ['generated']
      capturedSnapshot = null
      await assert.rejects(() => deterministicRunnerTestHarness.execute({
        repoRoot: root,
        planState,
        dimensions: [dimension],
        args: { execute: true, allowBuild: false, allowNetwork: false, allowPublishedRelease: false },
        dependencies: {
          loadActiveRun: async () => activeRun,
          expandCoverage: () => ({ inventoryPaths: ['fixture.txt'], inventoryDigest: 'd'.repeat(64), filesScanned: 1 }),
          createSnapshot: (options) => {
            capturedSnapshot = createDisposableRepositorySnapshot(options)
            return capturedSnapshot
          },
          snapshotEnvironment: browserlessNestedFixtureEnvironment,
          fingerprintDependencies: () => ['dependency-unchanged'],
          validateDependencyIdentity: () => ({
            dependencyLockfileSha256: '1'.repeat(64),
            installedLockfileSha256: '2'.repeat(64),
            installedDependencyIdentityDigest: '3'.repeat(64),
            installedPackageCount: 1,
            provenance: 'caller-node-modules-copy',
          }),
          runCommand: async (_value, { sandboxRoot }) => {
            mkdirSync(join(sandboxRoot, 'generated'), { recursive: true })
            symlinkSync(outside, join(sandboxRoot, 'generated', 'escape'))
            return {
              exitCode: 0,
              signal: null,
              error: null,
              stdout: 'pass\n',
              stderr: '',
              startedAt: '2026-07-21T00:00:00.000Z',
              finishedAt: '2026-07-21T00:00:01.000Z',
            }
          },
        },
      }), /generated output contains a symlink or special entry/)
      assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'outside-unchanged\n')
      assert.ok(capturedSnapshot)
      assert.equal(existsSync(capturedSnapshot.parent), false)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('capability denial happens before active-run lookup or command execution', async () => {
  const state = loadDeterministicDeepAuditPlan({ repoRoot: ROOT })
  const dimensions = [state.dimensionByNumber.get(51)]
  let touched = false
  await assert.rejects(() => deterministicRunnerTestHarness.execute({
    repoRoot: ROOT,
    planState: state,
    dimensions,
    args: { execute: true, allowBuild: false, allowNetwork: false, allowPublishedRelease: false },
    dependencies: {
      loadActiveRun: async () => { touched = true; throw new Error('must not load') },
      runCommand: async () => { touched = true; throw new Error('must not run') },
    },
  }), /--allow-build/)
  assert.equal(touched, false)
})

test('default plan/check is read-only and does not require an active run', () => {
  const result = spawnSync(process.execPath, ['--', RUNNER, '--json', '--profile=local'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      GOVERNANCE_READ_ONLY: '1',
      GOVERNANCE_EVIDENCE_ROOT: resolve(ROOT, 'intentionally-invalid-workspace-evidence-root'),
    },
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.mode, 'plan')
  assert.equal(report.executionAuthorized, false)
  assert.ok(report.selectedDimensions.length > 0)
})
