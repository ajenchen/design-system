import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(GOVERNANCE_ROOT, '../..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

const workflow = readJson(resolve(GOVERNANCE_ROOT, 'release-workflow.json'))
const desired = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
const packageJson = readJson(resolve(ROOT, 'package.json'))
const releaseWorkflowSource = readFileSync(resolve(ROOT, '.github/workflows/release.yml'), 'utf8')
const releaseOrchestratorSource = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
const stagedRolloutSource = readFileSync(resolve(GOVERNANCE_ROOT, 'lib/staged-rollout.mjs'), 'utf8')

const RETIRED_STANDARD_RELEASE_CEREMONY = /release-trust-preflight|release-finalize|governance-mirror|release:preflight/i

test('standard release remains the exact five-step AUTO workflow without the retired trust ceremony', () => {
  assert.deepEqual(
    workflow.steps.map(({ id, authority }) => ({ id, authority })),
    ['pr-checks', 'merge', 'publish', 'readback', 'consumer'].map(id => ({ id, authority: 'AUTO' })),
  )

  for (const [owner, source] of [
    ['release workflow', releaseWorkflowSource],
    ['release orchestrator', releaseOrchestratorSource],
    ['canonical five-step graph', JSON.stringify(workflow.steps)],
  ]) {
    assert.doesNotMatch(source, RETIRED_STANDARD_RELEASE_CEREMONY, `${owner} restored the retired release trust ceremony`)
  }

  assert.equal(packageJson.scripts['release:auto'], 'node scripts/release-orchestrator.mjs auto')
  assert.equal(packageJson.scripts['release:status'], 'node scripts/release-orchestrator.mjs status')
  assert.equal('release:preflight' in packageJson.scripts, false)
})

test('GitHub desired state does not restore retired standard-release environments', () => {
  const authority = desired.profiles['design-system-authority']
  assert.deepEqual(
    authority.environments.map(environment => environment.name).sort(),
    ['governance-external-ledger', 'npm-release'],
  )
  assert.equal(desired.managedEnvironmentNames.includes('release-finalize'), false)
  assert.equal(desired.managedEnvironmentNames.includes('governance-mirror'), false)
})

test('release trust validation remains an enterprise staged-rollout concern, not a standard release gate', () => {
  assert.match(stagedRolloutSource, /validateReleaseTrustPreflightEvidence/)
  assert.deepEqual(
    new Map(workflow.legacyMechanisms.map(item => [item.id, item.standardRelease])).get('external-activation'),
    'non-blocking',
  )
})
