import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { assertArtifactSchema, inspectContract } from '../src/contract.mjs'
import {
  applyUpgrade,
  attestRepository,
  buildExpectedSnapshot,
  checkRepository,
  generateRepository,
  installExpected,
  planUpgrade,
  snapshotState,
} from '../src/snapshot.mjs'
import { cleanup, makeRepository, repositoryMetadata } from './helpers.mjs'

const CHECK_BIN = resolve(import.meta.dirname, '../bin/check.mjs')
const execCheckAsync = (args) => new Promise((resolvePromise, rejectPromise) => {
  execFile(process.execPath, ['--', CHECK_BIN, ...args], { shell: false }, (error, stdout, stderr) => {
    if (error) rejectPromise(error)
    else resolvePromise({ stdout, stderr })
  })
})

async function generatedRepository(t) {
  const repoRoot = await realpath(await makeRepository())
  t.after(() => cleanup(repoRoot))
  assert.equal((await generateRepository({ repoRoot })).outcome, 'PASS')
  return repoRoot
}

test('upgrade plan/apply is optimistic and stale plans do not mutate state', async (t) => {
  const repoRoot = await generatedRepository(t)
  const controlPlane = resolve(repoRoot, 'governance/generated/control-plane.json')
  await writeFile(controlPlane, 'first drift\n')
  const planned = await planUpgrade({ repoRoot, planFile: 'governance/upgrade-plan.json' })
  assert.equal(planned.outcome, 'PLAN')
  assert.equal(planned.data.plan.actions.some((item) => item.action === 'replace-content'), true)

  await writeFile(controlPlane, 'second drift\n')
  const before = await repositoryMetadata(repoRoot)
  const stale = await applyUpgrade({ repoRoot, planFile: 'governance/upgrade-plan.json' })
  const after = await repositoryMetadata(repoRoot)
  assert.equal(stale.outcome, 'FAIL')
  assert.equal(stale.diagnostics.some((item) => item.evidence.kind === 'stale-plan'), true)
  assert.equal(after, before)

  const replanned = await planUpgrade({ repoRoot, planFile: 'governance/upgrade-plan.json' })
  assert.equal(replanned.outcome, 'PLAN')
  const applied = await applyUpgrade({ repoRoot, planFile: 'governance/upgrade-plan.json' })
  assert.equal(applied.outcome, 'APPLIED')
  assert.equal((await checkRepository({ repoRoot })).outcome, 'PASS')
})

test('installer rolls output and lock back after a mid-transaction failure', async (t) => {
  const repoRoot = await generatedRepository(t)
  const temporary = await mkdtemp(resolve(tmpdir(), 'qijenchen-governance-rollback-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const { contract } = await inspectContract({ repoRoot })
  const expected = await buildExpectedSnapshot(contract, temporary)
  const before = await snapshotState(contract)

  await assert.rejects(
    installExpected(contract, expected, {
      transitionProbe(step) {
        if (step === 'output-installed') throw new Error('injected transaction failure')
      },
    }),
    /injected transaction failure/,
  )
  const after = await snapshotState(contract)
  assert.deepEqual(after, before)
  assert.equal((await checkRepository({ repoRoot })).outcome, 'PASS')
})

test('attestation is digest-bound and deterministic with fixed inputs', async (t) => {
  const repoRoot = await generatedRepository(t)
  const options = { repoRoot, issuedAt: '2026-07-20T00:00:00.000Z', gitHead: '0123456789abcdef'.padEnd(40, '0'), hooksOff: true }
  const first = await attestRepository(options)
  const second = await attestRepository(options)
  assert.equal(first.outcome, 'PASS')
  assert.deepEqual(second, first)
  assert.match(first.data.attestation.snapshotDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(first.data.attestation.evidenceDigest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(first.data.attestation.gitHead, options.gitHead)
  assert.equal(first.data.attestation.gitTree, null)
  assert.deepEqual(first.data.attestation.claims, ['contract-doctor', 'hook-independent-check', 'provider-skill-parity', 'snapshot-integrity'])
})

test('registered artifact schemas compile, accept emitted artifacts, and reject undeclared fields', async (t) => {
  const repoRoot = await generatedRepository(t)
  const temporary = await mkdtemp(resolve(tmpdir(), 'qijenchen-governance-artifacts-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const { contract, diagnostics } = await inspectContract({ repoRoot })
  assert.deepEqual(diagnostics, [])

  const expected = await buildExpectedSnapshot(contract, temporary)
  assert.equal(await assertArtifactSchema(contract, 'lock', expected.lockBody), true)
  const poisonedLock = structuredClone(expected.lockBody)
  poisonedLock.sources[0].unreviewed = 'poison'
  await assert.rejects(assertArtifactSchema(contract, 'lock', poisonedLock), /lock artifact violates/)

  const planned = await planUpgrade({ repoRoot })
  assert.equal(await assertArtifactSchema(contract, 'upgradePlan', planned.data.plan), true)
  const poisonedPlan = structuredClone(planned.data.plan)
  poisonedPlan.unreviewed = 'poison'
  await assert.rejects(assertArtifactSchema(contract, 'upgradePlan', poisonedPlan), /upgradePlan artifact violates/)

  const attested = await attestRepository({
    repoRoot,
    issuedAt: '2026-07-20T00:00:00.000Z',
    gitHead: '1'.repeat(40),
  })
  assert.equal(await assertArtifactSchema(contract, 'attestation', attested.data.attestation), true)
  const poisonedAttestation = structuredClone(attested.data.attestation)
  poisonedAttestation._provenance.unreviewed = 'poison'
  await assert.rejects(assertArtifactSchema(contract, 'attestation', poisonedAttestation), /attestation artifact violates/)

  assert.equal(await assertArtifactSchema(contract, 'diagnostic', planned), true)
  const poisonedDiagnostic = structuredClone(planned)
  poisonedDiagnostic.diagnostics[0].unreviewed = 'poison'
  await assert.rejects(assertArtifactSchema(contract, 'diagnostic', poisonedDiagnostic), /diagnostic artifact violates/)
})

test('executable bin wrapper emits stable JSON', async (t) => {
  const repoRoot = await generatedRepository(t)
  const { stdout } = await execCheckAsync(['--repo', repoRoot, '--hooks-off', '--json'])
  const value = JSON.parse(stdout)
  assert.equal(value.command, 'check')
  assert.equal(value.outcome, 'PASS')
  assert.equal(value.data.hooksOff, true)
})
