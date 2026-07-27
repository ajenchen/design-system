import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  buildHarnessExecutionPlan,
  captureHarnessCommandIdentity,
  captureRegisteredLocalSourceProjection,
  createAllHarnessReceipt,
  deriveAllHarnessLocalSourcePaths,
  executeHarnessCommand,
  observeAllHarnessReceipt,
  runHarnessRegistry,
  sanitizeHarnessEnvironment,
  validateAllHarnessReceipt,
  writeAllHarnessReceipt,
} from '../lib/harness-runner.mjs'
import {
  DEFAULT_REPO_ROOT,
  HARNESS_AUTHORITY_CONTRACT_PATH,
  HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH,
  readHarnessRegistry,
} from '../lib/harness-registry.mjs'
import { readHarnessSourceInventory } from '../lib/harness-source-inventory.mjs'
import { resolveProvisionedPlaywrightRuntime } from '../lib/playwright-runtime.mjs'
import { sha256, stableStringify } from '../lib/common.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from '../../../scripts/lib/worktree-fingerprint.mjs'

const registry = readHarnessRegistry()
const inventory = readHarnessSourceInventory()
const executionOwnedLocalSources = new Set([
  ...inventory.suites.flatMap(suite => suite.members),
  ...inventory.pairedMeta.members,
  ...inventory.direct,
])
const expectedExecutionOwnedLocalSources = executionOwnedLocalSources.size
const expectedLocalSources = new Set([
  ...executionOwnedLocalSources,
  HARNESS_AUTHORITY_CONTRACT_PATH,
  HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH,
]).size

test('receipt source closure always includes the fixed authority contract and schema', () => {
  const paths = deriveAllHarnessLocalSourcePaths([
    { sourcePaths: ['scripts/test-fixture.mjs', HARNESS_AUTHORITY_CONTRACT_PATH] },
  ])
  assert.deepEqual(paths, [
    HARNESS_AUTHORITY_CONTRACT_PATH,
    HARNESS_AUTHORITY_CONTRACT_SCHEMA_PATH,
    'scripts/test-fixture.mjs',
  ].sort())
})

test('all-Harness entrypoint rejects recursive invocation before building a plan', () => {
  const result = spawnSync(process.execPath, ['infra/governance/bin/run-harnesses.mjs'], {
    cwd: DEFAULT_REPO_ROOT,
    env: { ...process.env, GOVERNANCE_HARNESS_ACTIVE: '1' },
    encoding: 'utf8',
    timeout: 5_000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /nested all-Harness execution is forbidden/)
})

test('all-Harness plan de-duplicates exact argv in first-registration order', () => {
  const plan = buildHarnessExecutionPlan(registry, { repoRoot: DEFAULT_REPO_ROOT })
  const registered = registry.entries.flatMap(entry => entry.commands)
  const expected = [...new Map(registered.map(argv => [JSON.stringify(argv), argv])).values()]
  assert.deepEqual(plan.map(item => item.argv), expected)
  assert.equal(plan.length, new Set(registered.map(JSON.stringify)).size)
  assert.ok(plan.some(item => item.registeredBy.length > 1), 'fixture must exercise cross-domain de-duplication')
  assert.equal(new Set(plan.flatMap(item => item.sourcePaths)).size, expectedExecutionOwnedLocalSources)
  assert.equal(plan.filter(item => item.sourcePaths.length === 0).length, 1, 'only the read-only coverage inventory has no source execution owner')
  assert.ok(plan.every(item => item.entrypointIdentity.path === (item.argv[1] === '--test' ? item.argv[2] : item.argv[1])))
  assert.ok(plan.every(item => /^[a-f0-9]{64}$/.test(item.entrypointIdentity.sha256)))
  const hookSuite = plan.find(item => item.argv.at(-1) === 'canonical-hook-behavioral')
  assert.ok(hookSuite, 'canonical hook behavioral suite is absent from the actual execution plan')
  assert.equal(hookSuite.timeoutMs, 1_860_000)
  assert.deepEqual(hookSuite.registeredBy.map(item => item.domain), ['fake-green'])
})

test('execution plan rejects a missing timeout contract with a governed error, never a TypeError', () => {
  const missing = structuredClone(registry)
  delete missing.runner.timeoutOverrides
  assert.throws(
    () => buildHarnessExecutionPlan(missing, { repoRoot: DEFAULT_REPO_ROOT }),
    error => !(error instanceof TypeError) && /invalid or open shape|timeout overrides/.test(error.message),
  )
})

test('runner executes every unique argv once and never upgrades external certification claims', async () => {
  const observed = []
  const summary = await runHarnessRegistry({
    registry,
    repoRoot: DEFAULT_REPO_ROOT,
    execute: async (argv, options) => {
      observed.push({ argv, options })
      return { status: 'passed', exitCode: 0, signal: null, durationMs: 1, error: null }
    },
  })
  assert.equal(summary.status, 'passed')
  assert.equal(summary.executedCommandCount, new Set(registry.entries.flatMap(entry => entry.commands).map(JSON.stringify)).size)
  assert.equal(observed.length, summary.executedCommandCount)
  const timeoutByArgv = new Map(registry.runner.timeoutOverrides.map(override => [JSON.stringify(override.command), override.timeoutMs]))
  assert.ok(observed.every(item => item.options.timeoutMs === (timeoutByArgv.get(JSON.stringify(item.argv)) ?? registry.runner.defaultTimeoutMs)))
  assert.equal(summary.certificationUpgradeGranted, false)
  assert.equal(summary.externalClaimsPreserved, true)
  assert.equal(summary.hardGateContractId, 'provider-neutral-governance-harness-v2')
  assert.match(summary.harnessRegistrySha256, /^[a-f0-9]{64}$/)
  assert.equal(summary.registeredLocalSourceCount, expectedLocalSources)
  assert.equal(summary.passedLocalSourceCount, expectedLocalSources)
  assert.equal(summary.schemaVersion, 2)
  assert.equal(summary.localSourceProjection.sourceCount, expectedLocalSources)
  assert.equal(summary.localSourceProjection.sources.length, expectedLocalSources)
  assert.deepEqual(
    summary.localSourceProjection.sources.map(source => source.path),
    [...summary.localSourceProjection.sources.map(source => source.path)].sort(),
  )
  assert.ok(summary.localSourceProjection.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)))
  assert.match(summary.localSourceProjection.aggregateSha256, /^[a-f0-9]{64}$/)
  assert.equal(
    summary.localSourceProjection.aggregateSha256,
    sha256(`provider-neutral-governance-harness-local-source-projection-v1\n${stableStringify(summary.localSourceProjection.sources, 0)}`),
  )
  assert.equal(summary.externalExcludedSourceCount, inventory.externalExclusions.length)
  assert.equal(summary.nonGovernanceSourceCount, 1)
  assert.equal(summary.harnessSourceInventorySha256, registry.sourceInventory.sha256)
  assert.equal(summary.entries.find(entry => entry.domain === 'cloud').certificationOutcome, 'not-certified')
  for (const domain of ['mirror', 'release', 'fleet', 'evidence']) {
    assert.equal(summary.entries.find(entry => entry.domain === domain).certificationOutcome, 'external-readback-required')
  }
  assert.throws(
    () => createAllHarnessReceipt({
      repoRoot: DEFAULT_REPO_ROOT,
      summary,
    }),
    /production executor/,
    'an injected executor returning pass for every command must not mint a receipt',
  )
})

test('runner refuses an in-memory registry that is not the exact digest-bound canonical file', async () => {
  const diluted = structuredClone(registry)
  diluted.runner.defaultTimeoutMs += 1
  await assert.rejects(
    () => runHarnessRegistry({ registry: diluted, repoRoot: DEFAULT_REPO_ROOT, execute: async () => ({ status: 'passed' }) }),
    /differs from the canonical digest-bound bytes/,
  )
})

test('All-Harness receipt rejects forged executors and validation binds every active source digest', () => {
  const receiptRoot = mkdtempSync(resolve(tmpdir(), 'all-harness-receipt-'))
  const receiptPath = join(receiptRoot, 'runtime', 'receipt.json')
  const rehashProjection = projection => {
    projection.aggregateSha256 = sha256(`provider-neutral-governance-harness-local-source-projection-v1\n${stableStringify(projection.sources, 0)}`)
  }
  const rehashReceipt = receipt => {
    receipt.result.localSourceProjectionSha256 = receipt.runSummary.localSourceProjection.aggregateSha256
    receipt.result.runSummarySha256 = sha256(stableStringify(receipt.runSummary, 0))
    const unsigned = structuredClone(receipt)
    delete unsigned.receiptSha256
    receipt.receiptSha256 = sha256(`provider-neutral-all-harness-receipt-v3\n${stableStringify(unsigned, 0)}`)
  }
  try {
    const localSourceProjection = captureRegisteredLocalSourceProjection({ repoRoot: DEFAULT_REPO_ROOT })
    const gitVisibleWorktree = captureGitVisibleWorktree(DEFAULT_REPO_ROOT)
    const summary = {
      schemaVersion: 2,
      kind: 'provider-neutral-governance-harness-run-summary',
      runnerId: 'all-registered-local-harnesses',
      hardGateContractId: 'provider-neutral-governance-harness-v2',
      harnessRegistrySha256: sha256(readFileSync(resolve(DEFAULT_REPO_ROOT, 'infra/governance/providers/harness-registry.json'))),
      harnessSourceInventorySha256: sha256(readFileSync(resolve(DEFAULT_REPO_ROOT, 'infra/governance/providers/harness-source-inventory.json'))),
      status: 'passed',
      executedCommandCount: 10,
      registeredLocalSourceCount: localSourceProjection.sourceCount,
      passedLocalSourceCount: localSourceProjection.sourceCount,
      localSourceProjection,
      commands: Array.from({ length: 10 }, (_, index) => ({ argv: ['node', `fixture-${index}.mjs`], status: 'passed' })),
    }
    const startedAt = new Date('2026-07-21T00:00:00.000Z')
    const completedAt = new Date('2026-07-21T00:30:00.000Z')
    assert.throws(
      () => createAllHarnessReceipt({ repoRoot: DEFAULT_REPO_ROOT, summary }),
      /production executor/,
      'a caller-fabricated passing summary must never mint a production receipt',
    )
    const gitValue = (...args) => {
      const result = spawnSync('git', args, { cwd: DEFAULT_REPO_ROOT, encoding: 'utf8', shell: false })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }
    const receipt = {
      schemaVersion: 3,
      kind: 'provider-neutral-local-all-harness-receipt',
      subject: {
        repositoryRole: 'design-system-authority',
        head: gitValue('rev-parse', '--verify', 'HEAD'),
        tree: gitValue('rev-parse', '--verify', 'HEAD^{tree}'),
        controlPlane: {
          path: 'governance/control-plane.lock.json',
          sha256: sha256(readFileSync(resolve(DEFAULT_REPO_ROOT, 'governance/control-plane.lock.json'))),
        },
        harnessRegistry: {
          path: 'infra/governance/providers/harness-registry.json',
          sha256: summary.harnessRegistrySha256,
        },
        harnessSourceInventory: {
          path: 'infra/governance/providers/harness-source-inventory.json',
          sha256: summary.harnessSourceInventorySha256,
        },
        localSourceProjection: {
          schemaVersion: localSourceProjection.schemaVersion,
          kind: localSourceProjection.kind,
          algorithm: localSourceProjection.algorithm,
          sourceCount: localSourceProjection.sourceCount,
          aggregateSha256: localSourceProjection.aggregateSha256,
        },
        gitVisibleWorktree: {
          schemaVersion: gitVisibleWorktree.schemaVersion,
          kind: gitVisibleWorktree.kind,
          indexSha256: gitVisibleWorktree.indexSha256,
          entryCount: gitVisibleWorktree.entries.length,
          digest: gitVisibleWorktree.digest,
        },
      },
      runner: {
        argv: ['node', 'infra/governance/bin/run-harnesses.mjs'],
        runnerId: summary.runnerId,
        hardGateContractId: summary.hardGateContractId,
        executedCommandCount: summary.executedCommandCount,
        registeredLocalSourceCount: summary.registeredLocalSourceCount,
      },
      result: {
        pass: true,
        status: 'passed',
        runSummarySha256: sha256(stableStringify(summary, 0)),
        localSourceProjectionSha256: localSourceProjection.aggregateSha256,
      },
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      expiresAt: new Date(completedAt.getTime() + 86_400_000).toISOString(),
      ttlSeconds: 86_400,
      runSummary: structuredClone(summary),
      receiptSha256: '',
    }
    rehashReceipt(receipt)
    assert.equal(receipt.schemaVersion, 3)
    assert.equal(receipt.runSummary.localSourceProjection.sources.length, expectedLocalSources)
    assert.equal(validateAllHarnessReceipt(receipt, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }), true)
    assert.throws(
      () => writeAllHarnessReceipt(receipt, { repoRoot: DEFAULT_REPO_ROOT, receiptPath }),
      /production receipt/,
      'a structurally valid caller-built receipt must not pass the production writer capability',
    )
    mkdirSync(resolve(receiptPath, '..'), { recursive: true })
    writeFileSync(receiptPath, `${stableStringify(receipt)}\n`)
    const observed = observeAllHarnessReceipt({ repoRoot: DEFAULT_REPO_ROOT, receiptPath, now: new Date('2026-07-21T01:00:00.000Z') })
    assert.equal(observed.pass, true)
    assert.equal(observed.receiptSha256, receipt.receiptSha256)
    assert.deepEqual(observed.runnerArgv, ['node', 'infra/governance/bin/run-harnesses.mjs'])
    assert.equal(observed.registeredLocalSourceCount, expectedLocalSources)
    assert.equal(observed.localSourceProjectionSha256, receipt.runSummary.localSourceProjection.aggregateSha256)

    const postReceiptPoison = resolve(DEFAULT_REPO_ROOT, `.all-harness-post-receipt-poison-${process.pid}`)
    writeFileSync(postReceiptPoison, 'post-receipt Git-visible mutation\n')
    try {
      const staleObservation = observeAllHarnessReceipt({
        repoRoot: DEFAULT_REPO_ROOT,
        receiptPath,
        now: new Date('2026-07-21T01:00:00.000Z'),
      })
      assert.equal(staleObservation.pass, false)
      assert.match(staleObservation.detail, /subject differs from the current/)
    } finally {
      rmSync(postReceiptPoison, { force: true })
    }

    const wrongArgv = structuredClone(receipt)
    wrongArgv.runner.argv = ['npm', 'test']
    assert.throws(() => validateAllHarnessReceipt(wrongArgv, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }), /runner argv is invalid/)
    const forgedPass = structuredClone(receipt)
    forgedPass.result.pass = false
    assert.throws(() => validateAllHarnessReceipt(forgedPass, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }), /does not record a content-addressed pass/)
    const stretchedTtl = structuredClone(receipt)
    stretchedTtl.expiresAt = '2026-07-23T00:30:00.000Z'
    assert.throws(() => validateAllHarnessReceipt(stretchedTtl, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }), /TTL binding is invalid/)
    assert.throws(() => validateAllHarnessReceipt(receipt, { repoRoot: DEFAULT_REPO_ROOT, now: new Date(receipt.expiresAt) }), /not currently fresh/)

    const contentStale = structuredClone(receipt)
    contentStale.runSummary.localSourceProjection.sources[0].sha256 = '0'.repeat(64)
    rehashProjection(contentStale.runSummary.localSourceProjection)
    contentStale.subject.localSourceProjection.aggregateSha256 = contentStale.runSummary.localSourceProjection.aggregateSha256
    rehashReceipt(contentStale)
    assert.throws(
      () => validateAllHarnessReceipt(contentStale, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }),
      /subject differs from the current/,
      'a fully rehashed stale source digest must not validate against current source bytes',
    )

    const sourceRemoved = structuredClone(receipt)
    sourceRemoved.runSummary.localSourceProjection.sources.pop()
    sourceRemoved.runSummary.localSourceProjection.sourceCount -= 1
    sourceRemoved.runSummary.registeredLocalSourceCount -= 1
    sourceRemoved.runSummary.passedLocalSourceCount -= 1
    sourceRemoved.runner.registeredLocalSourceCount -= 1
    sourceRemoved.subject.localSourceProjection.sourceCount -= 1
    rehashProjection(sourceRemoved.runSummary.localSourceProjection)
    sourceRemoved.subject.localSourceProjection.aggregateSha256 = sourceRemoved.runSummary.localSourceProjection.aggregateSha256
    rehashReceipt(sourceRemoved)
    assert.throws(
      () => validateAllHarnessReceipt(sourceRemoved, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }),
      /subject differs from the current/,
      'a fully rehashed removed-source projection must fail closed',
    )

    const sourceAdded = structuredClone(receipt)
    sourceAdded.runSummary.localSourceProjection.sources.push({ path: 'zzz-fixture/test-added.test.mjs', sha256: 'f'.repeat(64) })
    sourceAdded.runSummary.localSourceProjection.sourceCount += 1
    sourceAdded.runSummary.registeredLocalSourceCount += 1
    sourceAdded.runSummary.passedLocalSourceCount += 1
    sourceAdded.runner.registeredLocalSourceCount += 1
    sourceAdded.subject.localSourceProjection.sourceCount += 1
    rehashProjection(sourceAdded.runSummary.localSourceProjection)
    sourceAdded.subject.localSourceProjection.aggregateSha256 = sourceAdded.runSummary.localSourceProjection.aggregateSha256
    rehashReceipt(sourceAdded)
    assert.throws(
      () => validateAllHarnessReceipt(sourceAdded, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }),
      /subject differs from the current/,
      'a fully rehashed added-source projection must fail closed',
    )

    const controlPlaneStale = structuredClone(receipt)
    controlPlaneStale.subject.controlPlane.sha256 = 'e'.repeat(64)
    rehashReceipt(controlPlaneStale)
    assert.throws(() => validateAllHarnessReceipt(controlPlaneStale, { repoRoot: DEFAULT_REPO_ROOT, now: completedAt }), /subject differs from the current/)
  } finally {
    rmSync(receiptRoot, { recursive: true, force: true })
  }
})

test('worktree baseline preserves pre-existing dirt but rejects any Harness file, inventory, or staging mutation', () => {
  const probeRoot = mkdtempSync(resolve(tmpdir(), 'governance-worktree-fingerprint-'))
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: probeRoot, encoding: 'utf8', shell: false })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    git('init', '--quiet')
    writeFileSync(join(probeRoot, 'existing-dirty.json'), '{"state":"indexed"}\n')
    writeFileSync(join(probeRoot, 'future-governance-source.mjs'), 'export const state = "safe"\n')
    git('add', 'existing-dirty.json', 'future-governance-source.mjs')
    writeFileSync(join(probeRoot, 'existing-dirty.json'), '{"state":"already-dirty"}\n')
    writeFileSync(join(probeRoot, 'existing-untracked.json'), '{"state":"already-untracked"}\n')
    const baseline = captureGitVisibleWorktree(probeRoot)
    assert.doesNotThrow(() => assertGitVisibleWorktreeUnchanged(probeRoot, baseline))

    writeFileSync(join(probeRoot, 'future-governance-source.mjs'), 'export const state = "poisoned"\n')
    assert.throws(
      () => assertGitVisibleWorktreeUnchanged(probeRoot, baseline, { label: 'poison Harness' }),
      /mutated the Git-visible caller worktree/,
    )
    writeFileSync(join(probeRoot, 'future-governance-source.mjs'), 'export const state = "safe"\n')
    assert.doesNotThrow(() => assertGitVisibleWorktreeUnchanged(probeRoot, baseline))

    writeFileSync(join(probeRoot, 'new-output.json'), '{"unexpected":true}\n')
    assert.throws(() => assertGitVisibleWorktreeUnchanged(probeRoot, baseline), /mutated the Git-visible caller worktree/)
    rmSync(join(probeRoot, 'new-output.json'))

    git('add', 'existing-dirty.json')
    assert.throws(() => assertGitVisibleWorktreeUnchanged(probeRoot, baseline), /mutated the Git index\/staging area/)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test('runner reports timeout/failure, continues the closed plan, and preserves not-certified outcomes', async () => {
  let calls = 0
  const summary = await runHarnessRegistry({
    registry,
    repoRoot: DEFAULT_REPO_ROOT,
    execute: async () => {
      calls += 1
      return { status: calls === 1 ? 'timed-out' : 'passed', exitCode: calls === 1 ? null : 0, signal: calls === 1 ? 'SIGTERM' : null, durationMs: 1, error: null }
    },
  })
  assert.equal(calls, summary.executedCommandCount, 'run-all policy stopped after the first failure')
  assert.equal(summary.status, 'failed')
  assert.equal(summary.entries.find(entry => entry.domain === 'cloud').certificationOutcome, 'not-certified')
  assert.equal(summary.entries.find(entry => entry.domain === 'release').certificationOutcome, 'external-readback-required')
})

test('real executor has a bounded timeout and strips external credentials/process injection', async () => {
  const poisonedHome = mkdtempSync(resolve(tmpdir(), 'governance-harness-poison-home-'))
  const isolatedHome = mkdtempSync(resolve(tmpdir(), 'governance-harness-test-home-'))
  try {
    writeFileSync(join(poisonedHome, '.netrc'), 'machine example.test login poison password poison\n')
    writeFileSync(join(poisonedHome, '.npmrc'), '//registry.example.test/:_authToken=poison\n')
    const sanitized = sanitizeHarnessEnvironment({
      PATH: process.env.PATH,
      HOME: poisonedHome,
      SAFE_VALUE: 'kept',
      GH_TOKEN: 'secret',
      OPENAI_API_KEY: 'secret',
      CODEX_HOME: '/tmp/poison-codex-home',
      CLAUDE_CONFIG_DIR: '/tmp/poison-claude-config',
      NODE_OPTIONS: '--require poison',
      CUSTOM_CLIENT_SECRET: 'secret',
      NPM_CONFIG_USERCONFIG: '/tmp/poison',
      PLAYWRIGHT_BROWSERS_PATH: '/tmp/poison-browser-cache',
      SSH_AUTH_SOCK: '/tmp/poison-agent.sock',
      GIT_ASKPASS: '/tmp/poison-askpass',
      AWS_WEB_IDENTITY_TOKEN_FILE: '/tmp/poison-oidc',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://metadata.invalid/token',
      HTTPS_PROXY: 'https://poison:poison@proxy.invalid',
    }, { isolatedHome })
    assert.equal(sanitized.SAFE_VALUE, 'kept')
    assert.equal(sanitized.GOVERNANCE_HARNESS_MODE, 'offline-local-only')
    assert.equal(sanitized.HOME, isolatedHome)
    assert.equal(sanitized.CODEX_HOME, join(isolatedHome, '.codex'))
    assert.equal(sanitized.CLAUDE_CONFIG_DIR, join(isolatedHome, '.claude'))
    assert.equal(readFileSync(sanitized.NPM_CONFIG_USERCONFIG, 'utf8'), '')
    assert.equal(readFileSync(sanitized.GIT_CONFIG_GLOBAL, 'utf8'), '')
    assert.equal(sanitized.GIT_CONFIG_NOSYSTEM, '1')
    assert.equal(sanitized.GIT_CONFIG_KEY_0, 'credential.helper')
    assert.equal(sanitized.GIT_CONFIG_VALUE_0, '')
    for (const key of [
      'GH_TOKEN', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'CUSTOM_CLIENT_SECRET', 'SSH_AUTH_SOCK',
      'GIT_ASKPASS', 'AWS_WEB_IDENTITY_TOKEN_FILE', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'HTTPS_PROXY',
      'PLAYWRIGHT_BROWSERS_PATH',
    ]) assert.equal(key in sanitized, false, `${key} leaked into the local Harness process`)
  } finally {
    rmSync(poisonedHome, { recursive: true, force: true })
    rmSync(isolatedHome, { recursive: true, force: true })
  }

  const childPoisonedHome = mkdtempSync(resolve(tmpdir(), 'governance-harness-child-poison-home-'))
  writeFileSync(join(childPoisonedHome, '.netrc'), 'machine example.test login poison password poison\n')
  const environmentProbe = join(childPoisonedHome, 'environment-probe.cjs')
  writeFileSync(environmentProbe, [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const forbidden = ['GH_TOKEN','OPENAI_API_KEY','NODE_OPTIONS','SSH_AUTH_SOCK','GIT_ASKPASS','AWS_WEB_IDENTITY_TOKEN_FILE','ACTIONS_ID_TOKEN_REQUEST_URL','HTTPS_PROXY','PLAYWRIGHT_BROWSERS_PATH']",
    "if (process.env.HOME === process.env.ORIGINAL_HOME_SENTINEL) process.exit(11)",
    "if (process.env.CODEX_HOME !== path.join(process.env.HOME, '.codex')) process.exit(17)",
    "if (process.env.CLAUDE_CONFIG_DIR !== path.join(process.env.HOME, '.claude')) process.exit(18)",
    "if (forbidden.some(name => Object.hasOwn(process.env, name))) process.exit(12)",
    "if (fs.existsSync(path.join(process.env.HOME, '.netrc'))) process.exit(13)",
    "if (fs.readFileSync(process.env.NPM_CONFIG_USERCONFIG, 'utf8') !== '') process.exit(14)",
    "if (fs.readFileSync(process.env.GIT_CONFIG_GLOBAL, 'utf8') !== '') process.exit(15)",
    "if (process.env.GIT_CONFIG_NOSYSTEM !== '1' || process.env.GIT_TERMINAL_PROMPT !== '0') process.exit(16)",
  ].join('\n'))
  try {
    assert.throws(
      () => executeHarnessCommand(['node', environmentProbe], {
        repoRoot: DEFAULT_REPO_ROOT,
        timeoutMs: 5_000,
        environment: { PATH: process.env.PATH, PLAYWRIGHT_BROWSERS_PATH: '/tmp/poison-browser-cache' },
        stdio: 'ignore',
      }),
      /Playwright runtime blocked/,
    )
    const isolated = await executeHarnessCommand(['node', environmentProbe], {
      repoRoot: DEFAULT_REPO_ROOT,
      timeoutMs: 5_000,
      environment: {
        PATH: process.env.PATH,
        HOME: childPoisonedHome,
        ORIGINAL_HOME_SENTINEL: childPoisonedHome,
        GH_TOKEN: 'secret',
        OPENAI_API_KEY: 'secret',
        CODEX_HOME: '/tmp/poison-codex-home',
        CLAUDE_CONFIG_DIR: '/tmp/poison-claude-config',
        NODE_OPTIONS: '--require poison',
        SSH_AUTH_SOCK: '/tmp/poison-agent.sock',
        GIT_ASKPASS: '/tmp/poison-askpass',
        AWS_WEB_IDENTITY_TOKEN_FILE: '/tmp/poison-oidc',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://metadata.invalid/token',
        HTTPS_PROXY: 'https://poison:poison@proxy.invalid',
      },
      stdio: 'ignore',
    })
    assert.equal(isolated.status, 'passed')
    assert.equal(isolated.isolatedHomeRemoved, true)
  } finally {
    rmSync(childPoisonedHome, { recursive: true, force: true })
  }

  const timeoutRoot = mkdtempSync(resolve(tmpdir(), 'governance-harness-timeout-probe-'))
  try {
    const timeoutProbe = join(timeoutRoot, 'timeout-probe.mjs')
    writeFileSync(timeoutProbe, 'setInterval(() => {}, 1000)\n')
    const result = await executeHarnessCommand(['node', timeoutProbe], {
      repoRoot: DEFAULT_REPO_ROOT,
      timeoutMs: 1_000,
      environment: { PATH: process.env.PATH },
      stdio: 'ignore',
    })
    assert.equal(result.status, 'timed-out')
    assert.equal(result.isolatedHomeRemoved, true)
  } finally {
    rmSync(timeoutRoot, { recursive: true, force: true })
  }
})

test('real executor forwards only the validated exact-revision Playwright cache into isolated HOME', async () => {
  const runtime = resolveProvisionedPlaywrightRuntime({ repoRoot: DEFAULT_REPO_ROOT, environment: process.env })
  assert.ok(runtime, 'test environment must provision the lock-matched Playwright runtime')
  const probeRoot = mkdtempSync(resolve(tmpdir(), 'governance-harness-playwright-probe-'))
  try {
    const probe = join(probeRoot, 'playwright-probe.mjs')
    writeFileSync(probe, [
      "if (process.env.HOME === process.env.ORIGINAL_HOME_SENTINEL) process.exit(21)",
      "if (process.env.PLAYWRIGHT_BROWSERS_PATH !== process.env.EXPECTED_PLAYWRIGHT_BROWSERS_PATH) process.exit(22)",
    ].join('\n'))
    const result = await executeHarnessCommand(['node', probe], {
      repoRoot: DEFAULT_REPO_ROOT,
      timeoutMs: 5_000,
      environment: {
        ...process.env,
        ORIGINAL_HOME_SENTINEL: process.env.HOME,
        EXPECTED_PLAYWRIGHT_BROWSERS_PATH: runtime.environmentValue,
      },
      stdio: 'ignore',
    })
    assert.equal(result.status, 'passed')
    assert.equal(result.isolatedHomeRemoved, true)
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test('real executor revalidates the exact entrypoint path and digest immediately before spawn', () => {
  const probeRoot = mkdtempSync(resolve(tmpdir(), 'governance-harness-identity-'))
  try {
    const path = join(probeRoot, 'probe.mjs')
    writeFileSync(path, 'process.exit(0)\n')
    const argv = ['node', 'probe.mjs']
    const entrypointIdentity = captureHarnessCommandIdentity(argv, { repoRoot: probeRoot })
    writeFileSync(path, 'process.exit(23)\n')
    assert.throws(
      () => executeHarnessCommand(argv, {
        repoRoot: probeRoot,
        timeoutMs: 5_000,
        environment: { PATH: process.env.PATH },
        stdio: 'ignore',
        entrypointIdentity,
      }),
      /path or digest changed after validation/,
    )
  } finally {
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test('real executor reaps background descendants even when the top-level command exits cleanly', { skip: process.platform === 'win32' }, async () => {
  const probeRoot = mkdtempSync(resolve(tmpdir(), 'governance-harness-descendant-'))
  const pidFile = join(probeRoot, 'pid')
  let descendantPid = null
  try {
    const descendantScript = join(probeRoot, 'descendant.mjs')
    const parentScript = join(probeRoot, 'parent.mjs')
    writeFileSync(descendantScript, 'setInterval(() => {}, 1000)\n')
    writeFileSync(parentScript, [
      "import { spawn } from 'node:child_process'",
      "import { writeFileSync } from 'node:fs'",
      "const child = spawn(process.execPath, ['--', process.env.HARNESS_DESCENDANT_SCRIPT], { stdio: 'ignore' })",
      "writeFileSync(process.env.HARNESS_DESCENDANT_PID, String(child.pid))",
      'child.unref()',
    ].join('\n'))
    const result = await executeHarnessCommand(['node', parentScript], {
      repoRoot: DEFAULT_REPO_ROOT,
      timeoutMs: 5_000,
      environment: {
        PATH: process.env.PATH,
        HARNESS_DESCENDANT_PID: pidFile,
        HARNESS_DESCENDANT_SCRIPT: descendantScript,
      },
      stdio: 'ignore',
    })
    assert.equal(result.status, 'passed')
    descendantPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10)
    assert.ok(Number.isInteger(descendantPid) && descendantPid > 1)
    assert.throws(() => process.kill(descendantPid, 0), { code: 'ESRCH' })
  } finally {
    if (descendantPid) {
      try { process.kill(descendantPid, 'SIGKILL') } catch {}
    }
    rmSync(probeRoot, { recursive: true, force: true })
  }
})

test('timeout cleanup sends process-group SIGTERM and then SIGKILL to resistant descendants', { skip: process.platform === 'win32' }, async () => {
  const probeRoot = mkdtempSync(resolve(tmpdir(), 'governance-harness-resistant-descendant-'))
  const pidFile = join(probeRoot, 'pid')
  const termFile = join(probeRoot, 'term-observed')
  let descendantPid = null
  try {
    const descendantScript = join(probeRoot, 'resistant-descendant.mjs')
    const parentScript = join(probeRoot, 'resistant-parent.mjs')
    writeFileSync(descendantScript, [
      "import { writeFileSync } from 'node:fs'",
      "process.on('SIGTERM', () => writeFileSync(process.env.HARNESS_TERM_FILE, 'observed'))",
      'setInterval(() => {}, 1000)',
    ].join('\n'))
    writeFileSync(parentScript, [
      "import { spawn } from 'node:child_process'",
      "import { writeFileSync } from 'node:fs'",
      "process.on('SIGTERM', () => {})",
      "const child = spawn(process.execPath, ['--', process.env.HARNESS_DESCENDANT_SCRIPT], { stdio: 'ignore', env: process.env })",
      "writeFileSync(process.env.HARNESS_DESCENDANT_PID, String(child.pid))",
      'setInterval(() => {}, 1000)',
    ].join('\n'))
    const result = await executeHarnessCommand(['node', parentScript], {
      repoRoot: DEFAULT_REPO_ROOT,
      timeoutMs: 1_000,
      environment: {
        PATH: process.env.PATH,
        HARNESS_DESCENDANT_PID: pidFile,
        HARNESS_DESCENDANT_SCRIPT: descendantScript,
        HARNESS_TERM_FILE: termFile,
      },
      stdio: 'ignore',
    })
    assert.equal(result.status, 'timed-out')
    descendantPid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10)
    assert.equal(readFileSync(termFile, 'utf8'), 'observed')
    assert.throws(() => process.kill(descendantPid, 0), { code: 'ESRCH' })
  } finally {
    if (descendantPid) {
      try { process.kill(descendantPid, 'SIGKILL') } catch {}
    }
    rmSync(probeRoot, { recursive: true, force: true })
  }
})
