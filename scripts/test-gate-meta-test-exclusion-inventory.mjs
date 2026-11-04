#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createGateMetaTestInventory,
  GATE_META_LANE_CLEANUP_RESERVE_MS,
  gateMetaLaneCommand,
  gateMetaLaneMemberBudgets,
  isGateMetaLaneCommand,
  synchronizeGateMetaLaneMembers,
  validateGateMetaLanes,
} from './lib/gate-meta-test-inventory.mjs'

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const inventory = createGateMetaTestInventory({ root: ROOT })

assert.deepEqual(inventory.excluded.map((entry) => entry.stem), [
  'check-src-republish',
  'codex-run-guarded',
])
assert.deepEqual(inventory.excludedByClass['deterministic-isolated'].map((entry) => entry.stem), [
  'check-src-republish',
  'codex-run-guarded',
])
assert.deepEqual(inventory.excludedByClass['environmental-observation'].map((entry) => entry.stem), [
])
assert.equal(inventory.discoverable.length, inventory.runnable.length + inventory.excluded.length)
assert.deepEqual(
  inventory.runnable.filter(({ stem }) => inventory.excluded.some((entry) => entry.stem === stem)),
  [],
)

for (const entry of inventory.excluded.filter((candidate) => candidate.executionClass === 'deterministic-isolated')) {
  assert.equal(entry.executionOwner.kind, 'harness-registry')
  assert.deepEqual(entry.executionOwner.command, ['node', entry.harness])
}

function write(root, path, value) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
}

function fixtureEntry(stem = 'sample-gate') {
  const harness = `scripts/test-${stem}.mjs`
  return {
    stem,
    executionClass: 'deterministic-isolated',
    portabilityPolicy: 'required',
    harness,
    fallback: null,
    executionOwner: {
      kind: 'harness-registry',
      path: 'infra/governance/providers/harness-registry.json',
      command: ['node', harness],
    },
    reason: 'Isolated deterministic fixture.',
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'gate-meta-inventory-'))
try {
  write(fixtureRoot, 'scripts/sample-gate.mjs', 'process.exit(0)\n')
  write(fixtureRoot, 'scripts/test-sample-gate.mjs', 'process.exit(0)\n')
  write(fixtureRoot, 'infra/governance/providers/harness-registry.json', `${JSON.stringify({
    entries: [{ commands: [['node', 'scripts/test-sample-gate.mjs']] }],
  }, null, 2)}\n`)
  const document = { schemaVersion: 2, entries: [fixtureEntry()] }
  const valid = createGateMetaTestInventory({ root: fixtureRoot, exclusionDocument: document })
  assert.equal(valid.discoverable.length, 1)
  assert.equal(valid.runnable.length, 0)

  assert.throws(
    () => createGateMetaTestInventory({
      root: fixtureRoot,
      exclusionDocument: { schemaVersion: 2, entries: [fixtureEntry('ghost-gate')] },
    }),
    /ghost-gate is inert/,
    'an exclusion without a discovered gate/test pair must be rejected',
  )

  const misclassified = fixtureEntry()
  misclassified.executionClass = 'environmental-observation'
  assert.throws(
    () => createGateMetaTestInventory({
      root: fixtureRoot,
      exclusionDocument: { schemaVersion: 2, entries: [misclassified] },
    }),
    /environmental observation must be portability-excluded/,
    'class and portability policy must not contradict each other',
  )

  const ownerless = fixtureEntry()
  ownerless.executionOwner.command = ['node', 'scripts/test-some-other-gate.mjs']
  assert.throws(
    () => createGateMetaTestInventory({
      root: fixtureRoot,
      exclusionDocument: { schemaVersion: 2, entries: [ownerless] },
    }),
    /deterministic owner command must execute exactly/,
    'a deterministic exclusion without exact harness execution evidence must be rejected',
  )
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

// ── Gate meta-test lanes(2026-10-14,SM2):每支恰好一個 lane、預算明文、remainder 由產生器算 ──
{
  // 現行 repo:harness-source-inventory.json 的 lane 宣告恰好分割現行 runnable(與 harness 驗證同一份實作)
  const document = JSON.parse(readFileSync(join(ROOT, 'infra/governance/providers/harness-source-inventory.json'), 'utf8'))
  const runnablePaths = inventory.runnable.map(({ file }) => `scripts/${file}`)
  assert.equal(validateGateMetaLanes(document.pairedMeta, { runnablePaths }), document.pairedMeta)
  assert.deepEqual(
    synchronizeGateMetaLaneMembers(document.pairedMeta, { runnablePaths }),
    document.pairedMeta,
    'remainder lane members are stale —— run npm run governance:generate',
  )
  for (const lane of document.pairedMeta.lanes) {
    assert.deepEqual(gateMetaLaneCommand(lane.id), ['node', 'scripts/run-gate-meta-tests.mjs', '--lane', lane.id])
    assert.equal(isGateMetaLaneCommand(gateMetaLaneCommand(lane.id)), true)
  }
  assert.equal(isGateMetaLaneCommand(['node', 'scripts/run-gate-meta-tests.mjs']), false, 'the bare runner is not a lane command')
  assert.equal(isGateMetaLaneCommand(['node', 'scripts/run-gate-meta-tests.mjs', '--lane', 'Core']), false)

  const paths = ['scripts/test-a.mjs', 'scripts/test-b.mjs', 'scripts/test-c.mjs', 'scripts/test-d.mjs']
  const lane = (overrides) => ({
    id: 'core',
    storybook: 'absent',
    membership: 'remainder',
    memberTimeoutMs: 60_000,
    memberTimeoutOverrides: [],
    totalTimeoutMs: 600_000,
    members: [],
    ...overrides,
  })
  const browser = (overrides = {}) => lane({
    id: 'browser-1',
    storybook: 'lane-build',
    storybookBuildTimeoutMs: 300_000,
    membership: 'declared',
    members: ['scripts/test-b.mjs', 'scripts/test-d.mjs'],
    memberTimeoutOverrides: [{ path: 'scripts/test-d.mjs', timeoutMs: 120_000 }],
    ...overrides,
  })
  const document2 = (lanes) => ({ runner: 'scripts/run-gate-meta-tests.mjs', lanes })
  const good = synchronizeGateMetaLaneMembers(document2([browser(), lane()]), { runnablePaths: paths })
  assert.deepEqual(good.lanes.find(({ id }) => id === 'core').members, ['scripts/test-a.mjs', 'scripts/test-c.mjs'], 'remainder = runnable − declared')
  assert.deepEqual(gateMetaLaneMemberBudgets(good.lanes[0]), [
    { path: 'scripts/test-b.mjs', budgetMs: 60_000 },
    { path: 'scripts/test-d.mjs', budgetMs: 120_000 },
  ], 'per-test budget = explicit override, otherwise the lane default')

  const rejects = (lanes, pattern, why, runnable = paths) => assert.throws(
    () => validateGateMetaLanes(document2(lanes), { runnablePaths: runnable }),
    pattern,
    why,
  )
  const core = lane({ members: ['scripts/test-a.mjs', 'scripts/test-c.mjs'] })
  rejects([browser(), core], /in no lane/, 'a runnable meta-test without a lane must be rejected', [...paths, 'scripts/test-e.mjs'])
  rejects([browser(), lane({ members: ['scripts/test-a.mjs', 'scripts/test-b.mjs', 'scripts/test-c.mjs'] })], /declared in two lanes/, 'one test in two lanes would run twice')
  rejects([browser({ members: ['scripts/test-b.mjs', 'scripts/test-d.mjs', 'scripts/test-z.mjs'] }), core], /not runnable gate meta-tests/, 'a renamed or removed member must be named, not silently dropped')
  rejects([browser(), lane({ storybook: 'lane-build', storybookBuildTimeoutMs: 1_000, members: core.members })], /must be storybook "absent"/, 'the default lane may not silently provide a build')
  rejects([browser({ membership: 'remainder' }), core], /exactly one lane must have membership "remainder"/, 'two remainder lanes are ambiguous')
  rejects([core, browser()], /sorted/, 'lanes must be sorted by id')
  const unbudgetedBuild = browser()
  delete unbudgetedBuild.storybookBuildTimeoutMs
  rejects([unbudgetedBuild, core], /keys must be exactly/, 'a lane-build lane must declare its build budget')
  rejects([browser(), lane({ members: core.members, storybookBuildTimeoutMs: 1_000 })], /keys must be exactly/, 'an absent lane may not carry a build budget')
  rejects([browser({ memberTimeoutOverrides: [{ path: 'scripts/test-a.mjs', timeoutMs: 120_000 }] }), core], /non-member/, 'an override for a test outside the lane is meaningless')
  rejects([browser({ memberTimeoutOverrides: [{ path: 'scripts/test-d.mjs', timeoutMs: 60_000 }] }), core], /repeats the lane default/, 'a redundant override hides the real default')
  rejects([browser({ memberTimeoutOverrides: [{ path: 'scripts/test-d.mjs', timeoutMs: 999_999 }] }), core], /between 1000 and 600000/, 'a per-test budget larger than the lane budget is a lie')
  rejects(
    [browser({ totalTimeoutMs: 300_000 + 120_000 + GATE_META_LANE_CLEANUP_RESERVE_MS - 1 }), core],
    /cannot fit storybook build/,
    'the largest test must still get its full budget after the build and before the cleanup reserve',
  )
  assert.doesNotThrow(() => validateGateMetaLanes(
    document2([browser({ totalTimeoutMs: 300_000 + 120_000 + GATE_META_LANE_CLEANUP_RESERVE_MS }), core]),
    { runnablePaths: paths },
  ), 'the exact floor (build + largest budget + cleanup reserve) is accepted')
  assert.throws(
    () => synchronizeGateMetaLaneMembers(document2([browser({ members: ['scripts/test-b.mjs', 'scripts/test-z.mjs'], memberTimeoutOverrides: [] }), lane()]), { runnablePaths: paths }),
    /scripts\/test-z\.mjs@browser-1/,
    'the generator names a stale declared member instead of dropping it into the remainder lane',
  )
}

console.log('✅ gate meta-test inventory is single-source, classified, non-inert, and execution-owner backed')
