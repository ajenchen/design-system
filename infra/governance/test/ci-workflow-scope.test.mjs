import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseWorkflowSemantics } from '../lib/workflow-trust.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const readWorkflow = name => readFileSync(resolve(ROOT, `.github/workflows/${name}`), 'utf8')

test('CI is the only PR/push gate and stays within the fast deterministic scope', () => {
  const source = readWorkflow('ci.yml')
  const workflow = parseWorkflowSemantics(source)
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch'])
  assert.deepEqual(Object.keys(workflow.jobs), ['verify'])
  assert.equal(workflow.jobs.verify.name, 'Verify(tsc + tests + compile + build)')
  assert.equal(workflow.jobs.verify.timeoutMinutes, 15)
  assert.equal((source.match(/setup:dependencies/g) ?? []).length, 1)
  for (const command of [
    'npm run build:lib',
    'npx --no-install tsc -b',
    'node --test infra/governance/test/ci-workflow-scope.test.mjs',
    "node --test --test-name-pattern='canonical GitHub profile minima' infra/governance/test/model-validation.test.mjs",
    'node --test infra/governance/test/workflow-identity-sync.test.mjs',
    'node --test infra/governance/test/release-workflow.test.mjs',
    'node scripts/test-governance-build-graph.mjs',
    'node --test scripts/test-governance-build-graph-transaction.mjs',
    'node scripts/governance-build-graph.mjs --check',
    'npm run build',
  ]) assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(source, /setup:playwright|setup:provider-cli|test:governance-harnesses|@qijenchen\/governance test|build-storybook|storybook-smoke-test|visual-audit/)
})

for (const name of [
  'a11y-and-size.yml',
  'visual-regression.yml',
  'composition-fidelity.yml',
  'packaging-canary.yml',
]) {
  test(`${name} is scheduled/manual and non-blocking`, () => {
    const source = readWorkflow(name)
    const workflow = parseWorkflowSemantics(source)
    assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch'])
    assert.ok(Object.values(workflow.jobs).every(job => job.continueOnError === true))
    assert.doesNotMatch(source, /^\s{2}(?:push|pull_request):/m)
    assert.doesNotMatch(source, /name:\s*(?:Verify\(|a11y\(|Bundle size budget|Visual Regression Diff|Composition Fidelity Diff|Packaging integrity\()/)
  })
}
