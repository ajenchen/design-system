import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRunExternalId, validateRequiredCheckProducer } from '../lib/check-run-trust.mjs'

const repo = { github: 'acme/repo', defaultBranch: 'main' }
const observed = { defaultBranchHeadSha: 'a'.repeat(40) }

test('rejects same App, context, head and freshness when the workflow producer path is wrong', () => {
  const check = { context: 'verify', trustSource: 'repository-workflow', workflow: '.github/workflows/ci.yml', requiredEvents: ['pull_request'] }
  const integration = { id: 15368 }
  const run = {
    name: 'verify', app: { id: 15368 }, head_sha: observed.defaultBranchHeadSha,
    workflowRun: { path: '.github/workflows/spoof.yml', head_sha: observed.defaultBranchHeadSha, event: 'pull_request', status: 'completed', conclusion: 'success' },
  }
  assert.ok(validateRequiredCheckProducer({ run, check, integration, repo, observed }).includes('GitHub Actions check was produced by the wrong workflow path'))
})

test('binds App verdict to exact protected workflow ref, workflow SHA, candidate head and run', () => {
  const check = { context: 'Immutable consumer snapshot', trustSource: 'protected-base-workflow', workflow: '.github/workflows/governance-anchor.yml' }
  const integration = { id: 1001 }
  const externalId = checkRunExternalId({
    workflowRef: 'acme/repo/.github/workflows/governance-anchor.yml@refs/heads/main',
    workflowSha: observed.defaultBranchHeadSha,
    candidateHeadSha: observed.defaultBranchHeadSha,
    runId: 42,
    runAttempt: 1,
  })
  const run = { name: check.context, app: { id: 1001 }, head_sha: observed.defaultBranchHeadSha, external_id: externalId, details_url: 'https://github.com/acme/repo/actions/runs/42' }
  assert.deepEqual(validateRequiredCheckProducer({ run, check, integration, repo, observed }), [])
  run.external_id = externalId.replace('.github/workflows/governance-anchor.yml', '.github/workflows/spoof.yml')
  assert.ok(validateRequiredCheckProducer({ run, check, integration, repo, observed }).some(failure => failure.includes('workflow path/ref mismatch')))
})
