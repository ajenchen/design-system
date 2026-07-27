#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGateMetaTestInventory } from './lib/gate-meta-test-inventory.mjs'

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

console.log('✅ gate meta-test inventory is single-source, classified, non-inert, and execution-owner backed')
