import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { sha256, stableStringify } from '../lib/common.mjs'
import {
  assertReviewedWorkflowIdentity,
  parseWorkflowSemantics,
  parseWorkflowSemanticsV1,
  validateWorkflowIdentity,
  workflowIdentity,
} from '../lib/workflow-trust.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

const BEHAVIOR_WORKFLOW = `name: Semantic V2
run-name: run-first
on:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: top-first
  cancel-in-progress: false
env:
  TOP_LEVEL: top-first
defaults:
  run:
    shell: bash
jobs:
  build:
    name: Build
    if: always()
    runs-on: ubuntu-latest
    permissions:
      contents: read
    environment:
      name: test
    concurrency:
      group: job-first
    strategy:
      fail-fast: false
      max-parallel: 2
      matrix:
        node: [20, 22]
    env:
      JOB_LEVEL: job-first
    services:
      redis:
        image: redis:7
    container:
      image: node:22
    defaults:
      run:
        working-directory: app
    timeout-minutes: 12
    continue-on-error: false
    outputs:
      artifact: \${{ steps.run.outputs.artifact }}
    steps:
      - name: Run
        id: run
        if: success()
        env:
          STEP_LEVEL: step-first
        working-directory: app
        shell: bash
        timeout-minutes: 3
        continue-on-error: false
        run: echo artifact=result >> "$GITHUB_OUTPUT"
`

const HISTORICAL_REVIEWED_WORKFLOW = `name: Fixture governance anchor
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  verify-candidate:
    runs-on: ubuntu-latest
    steps:
      - name: Verify
        run: echo verify
  publish-app-verdict:
    if: always()
    needs: verify-candidate
    runs-on: ubuntu-latest
    environment:
      name: governance-check-verdict
    steps:
      - name: Token
        id: app-token
        uses: actions/create-github-app-token@1111111111111111111111111111111111111111
        with:
          app-id: \${{ secrets.GOVERNANCE_CHECK_APP_ID }}
          private-key: \${{ secrets.GOVERNANCE_CHECK_APP_PRIVATE_KEY }}
          permission-checks: write
      - name: Publish
        env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: |
          echo 'audit'
          echo '\${{ github.event.pull_request.head.sha }}'
          gh api /check-runs
`

const MIXED_CASE_LEGACY_WORKFLOW = `name: Mixed-case legacy order
on:
  workflow_dispatch:
jobs:
  Z:
    runs-on: ubuntu-latest
    steps:
      - run: echo upper
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo lower
`

const V2_ONLY_MUTATIONS = [
  ['workflow run-name', 'run-name: run-first', 'run-name: run-second'],
  ['workflow env', 'TOP_LEVEL: top-first', 'TOP_LEVEL: top-second'],
  ['workflow defaults', '    shell: bash\njobs:', '    shell: pwsh\njobs:'],
  ['job concurrency', 'group: job-first', 'group: job-second'],
  ['job strategy', 'max-parallel: 2', 'max-parallel: 3'],
  ['job env', 'JOB_LEVEL: job-first', 'JOB_LEVEL: job-second'],
  ['job services', 'image: redis:7', 'image: redis:8'],
  ['job container', 'image: node:22', 'image: node:24'],
  ['job defaults', 'working-directory: app\n    timeout-minutes', 'working-directory: package\n    timeout-minutes'],
  ['job timeout', 'timeout-minutes: 12', 'timeout-minutes: 13'],
  ['job continue-on-error', '    continue-on-error: false\n    outputs:', '    continue-on-error: true\n    outputs:'],
  ['job outputs', 'steps.run.outputs.artifact', 'steps.run.outputs.other'],
  ['step shell', '        shell: bash', '        shell: pwsh'],
  ['step timeout', 'timeout-minutes: 3', 'timeout-minutes: 4'],
  ['step continue-on-error', '        continue-on-error: false', '        continue-on-error: true'],
]

function closedV1(identity, explicit = false) {
  return {
    contentSha256: identity.contentSha256,
    gitBlobSha: identity.gitBlobSha,
    semanticSha256: identity.legacySemanticSha256,
    ...(explicit ? { semanticVersion: 1 } : {}),
  }
}

function closedV2(identity) {
  return {
    contentSha256: identity.contentSha256,
    gitBlobSha: identity.gitBlobSha,
    semanticSha256: identity.semanticSha256,
    semanticVersion: 2,
  }
}

test('semantic identity V2 is deterministic and includes workflow, job, and step execution behavior', () => {
  const first = workflowIdentity(BEHAVIOR_WORKFLOW)
  const second = workflowIdentity(BEHAVIOR_WORKFLOW)

  assert.equal(first.semanticVersion, 2)
  assert.equal(first.semanticSha256, second.semanticSha256)
  assert.equal(first.legacySemanticSha256, second.legacySemanticSha256)
  assert.notEqual(first.semanticSha256, first.legacySemanticSha256)
  assert.deepEqual(first.semantics.env, { TOP_LEVEL: 'top-first' })
  assert.deepEqual(first.semantics.defaults, { run: { shell: 'bash' } })
  assert.deepEqual(first.semantics.jobs.build.strategy, {
    'fail-fast': false,
    'max-parallel': 2,
    matrix: { node: [20, 22] },
  })
  assert.deepEqual(first.semantics.jobs.build.services, { redis: { image: 'redis:7' } })
  assert.deepEqual(first.semantics.jobs.build.container, { image: 'node:22' })
  assert.equal(first.semantics.jobs.build.timeoutMinutes, 12)
  assert.equal(first.semantics.jobs.build.continueOnError, false)
  assert.equal(first.semantics.jobs.build.steps[0].shell, 'bash')
  assert.equal(first.semantics.jobs.build.steps[0].timeoutMinutes, 3)
  assert.equal(first.semantics.jobs.build.steps[0].continueOnError, false)
})

test('every newly covered execution field changes V2 while leaving the frozen V1 projection unchanged', async t => {
  const baseline = workflowIdentity(BEHAVIOR_WORKFLOW)
  for (const [label, before, after] of V2_ONLY_MUTATIONS) {
    await t.test(label, () => {
      assert.notEqual(before, after)
      assert.ok(BEHAVIOR_WORKFLOW.includes(before), `fixture is missing mutation source for ${label}`)
      const changed = workflowIdentity(BEHAVIOR_WORKFLOW.replace(before, after))
      assert.equal(changed.legacySemanticSha256, baseline.legacySemanticSha256)
      assert.notEqual(changed.semanticSha256, baseline.semanticSha256)
    })
  }
})

test('mapping and job declaration order do not make the V2 digest nondeterministic', () => {
  const left = `name: Ordered
on: [workflow_dispatch, push]
permissions:
  contents: read
  actions: none
jobs:
  zeta:
    runs-on: ubuntu-latest
    steps:
      - run: echo zeta
  alpha:
    runs-on: ubuntu-latest
    steps:
      - run: echo alpha
`
  const right = `permissions:
  actions: none
  contents: read
jobs:
  alpha:
    steps:
      - run: echo alpha
    runs-on: ubuntu-latest
  zeta:
    steps:
      - run: echo zeta
    runs-on: ubuntu-latest
on: [push, workflow_dispatch]
name: Ordered
`
  const leftIdentity = workflowIdentity(left)
  const rightIdentity = workflowIdentity(right)
  assert.notEqual(leftIdentity.contentSha256, rightIdentity.contentSha256)
  assert.deepEqual(parseWorkflowSemantics(left), parseWorkflowSemantics(right))
  assert.equal(leftIdentity.semanticSha256, rightIdentity.semanticSha256)
})

test('reusable-workflow jobs are represented in V2 and cannot claim a V1 identity', () => {
  const content = `name: Reusable
on: workflow_dispatch
jobs:
  delegated:
    uses: acme/platform/.github/workflows/build.yml@1111111111111111111111111111111111111111
    with:
      channel: stable
    secrets: inherit
`
  const identity = workflowIdentity(content)
  assert.equal(identity.semanticVersion, 2)
  assert.equal(identity.legacySemanticSha256, null)
  assert.equal(identity.semantics.jobs.delegated.uses, 'acme/platform/.github/workflows/build.yml@1111111111111111111111111111111111111111')
  assert.deepEqual(identity.semantics.jobs.delegated.with, { channel: 'stable' })
  assert.equal(identity.semantics.jobs.delegated.secrets, 'inherit')
  assert.equal(identity.semantics.jobs.delegated.steps, null)
})

test('historical V1 reviewed workflow bytes, blob, and semantics remain an immutable golden', () => {
  const identity = workflowIdentity(HISTORICAL_REVIEWED_WORKFLOW, '32fed593dcd599f2c8dc9b115540d2a68557037a')
  assert.equal(identity.contentSha256, 'aeb0bc3dc8414d7df06095e1563b4f26d433c6db54871c24726e40f3119e5570')
  assert.equal(identity.gitBlobSha, '32fed593dcd599f2c8dc9b115540d2a68557037a')
  assert.equal(identity.legacySemanticSha256, '823e2858a0b48b5211af3e4895236d346ee257af819c304cf165f928b149a91d')
  assert.equal(identity.declaredBlobMatches, true)
  assert.deepEqual(validateWorkflowIdentity({
    contentSha256: 'aeb0bc3dc8414d7df06095e1563b4f26d433c6db54871c24726e40f3119e5570',
    gitBlobSha: '32fed593dcd599f2c8dc9b115540d2a68557037a',
    semanticSha256: '823e2858a0b48b5211af3e4895236d346ee257af819c304cf165f928b149a91d',
  }, identity), [])
})

test('terminal canonicalization preserves the mixed-case V1 golden across parser insertion orders', () => {
  const identity = workflowIdentity(MIXED_CASE_LEGACY_WORKFLOW)
  const currentSemantics = parseWorkflowSemanticsV1(MIXED_CASE_LEGACY_WORKFLOW)
  const historicalParserInsertion = {
    ...currentSemantics,
    jobs: { a: currentSemantics.jobs.a, Z: currentSemantics.jobs.Z },
  }
  assert.deepEqual(Object.keys(currentSemantics.jobs), ['Z', 'a'])
  assert.deepEqual(Object.keys(historicalParserInsertion.jobs), ['a', 'Z'])
  assert.deepEqual(Object.keys(parseWorkflowSemantics(MIXED_CASE_LEGACY_WORKFLOW).jobs), ['Z', 'a'])
  assert.equal(identity.contentSha256, '92820005e85a437fec554178e89f1fd482ccde1cd148c73909f9258a96d8022d')
  assert.equal(identity.gitBlobSha, '076679ec184aeb258bc5318eddd89193e10c8100')
  assert.equal(identity.legacySemanticSha256, 'cf0ddcd4aaf6ebb86295f193bff2248b5f7d7cbd8eb4f08f0dd95b3cb2908b7b')
  assert.equal(sha256(stableStringify(currentSemantics, 0)), identity.legacySemanticSha256)
  assert.equal(sha256(stableStringify(historicalParserInsertion, 0)), identity.legacySemanticSha256)
  assert.equal(identity.semanticSha256, 'e814a3abf6ceae6c9837f1eee70b87a885d066c54850dfcae3ef5a099b6c834a')
})

test('legacy reviewed identities remain valid only with exact bytes, blob, and V1 semantic digest', () => {
  const route = 'GET /repos/acme/consumer/contents/.github/workflows/governance-anchor.yml?ref=main'
  const routes = JSON.parse(readFileSync(resolve(HERE, 'fixtures/github/empty/routes.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(HERE, 'fixtures/github/desired.json'), 'utf8'))
  assert.ok(Object.hasOwn(routes, route))
  const fixture = routes[route].response
  const observed = workflowIdentity(fixture.text, fixture.sha)
  const reviewedCheck = desired.profiles['product-consumer'].requiredChecks.find(check => check.workflow === '.github/workflows/governance-anchor.yml')
  const reviewedEnvironment = desired.profiles['product-consumer'].environments.find(environment => environment.workflow === '.github/workflows/governance-anchor.yml')

  assert.equal(observed.contentSha256, 'b1ba2edcfa33a02059ea67bbd6e3350d4c6d9d3dbcb85be5ffa885f30402d113')
  assert.equal(observed.gitBlobSha, '42a5ef2f6f62d7955f595680d1c6f14a4fa30664')
  assert.equal(observed.semanticSha256, 'c5f7ddc8e2fed23c25dbd7b3297ff00ce5e41c24a3b411f38e79ee106af11f42')
  assert.equal(observed.legacySemanticSha256, '1ed371303e32370e71f910a38820021ac15e7b00d3fa8636c121c70ea57c015b')
  assert.deepEqual(reviewedCheck?.workflowIdentity, closedV2(observed))
  assert.deepEqual(reviewedEnvironment?.workflowIdentity, closedV2(observed))
  assert.deepEqual(validateWorkflowIdentity(closedV1(observed), observed), [])
  assert.deepEqual(validateWorkflowIdentity(closedV1(observed, true), observed), [])
  assert.deepEqual(validateWorkflowIdentity(closedV2(observed), observed), [])

  const wrongBytes = { ...closedV1(observed), contentSha256: '0'.repeat(64) }
  assert.match(validateWorkflowIdentity(wrongBytes, observed).join('\n'), /contentSha256 differs/)
  const wrongBlob = { ...closedV1(observed), gitBlobSha: '0'.repeat(40) }
  assert.match(validateWorkflowIdentity(wrongBlob, observed).join('\n'), /gitBlobSha differs/)
  const v2DigestDisguisedAsV1 = { ...closedV1(observed), semanticSha256: observed.semanticSha256 }
  assert.match(validateWorkflowIdentity(v2DigestDisguisedAsV1, observed).join('\n'), /semanticSha256 differs.*v1/)
  const wrongDeclaredBlob = workflowIdentity(fixture.text, '0'.repeat(40))
  assert.match(validateWorkflowIdentity(closedV1(observed), wrongDeclaredBlob).join('\n'), /blob SHA does not match/)

  const commentedContent = `# review note only\n${fixture.text}`
  const commentedLocal = workflowIdentity(commentedContent)
  const commentedObserved = workflowIdentity(commentedContent, commentedLocal.gitBlobSha)
  assert.equal(commentedObserved.legacySemanticSha256, observed.legacySemanticSha256)
  assert.match(validateWorkflowIdentity(closedV1(observed), commentedObserved).join('\n'), /contentSha256 differs/)
  assert.match(validateWorkflowIdentity(closedV1(observed), commentedObserved).join('\n'), /gitBlobSha differs/)
})

test('workflow identity validation is closed and version aware', () => {
  const identity = workflowIdentity(BEHAVIOR_WORKFLOW, workflowIdentity(BEHAVIOR_WORKFLOW).gitBlobSha)
  assert.deepEqual(validateWorkflowIdentity(closedV2(identity), identity), [])
  assert.match(validateWorkflowIdentity({ ...closedV2(identity), semanticVersion: 3 }, identity).join('\n'), /semanticVersion is invalid/)
  assert.match(validateWorkflowIdentity({ ...closedV2(identity), extra: true }, identity).join('\n'), /invalid or open shape/)
  assert.match(validateWorkflowIdentity({ ...closedV2(identity), semanticSha256: identity.legacySemanticSha256 }, identity).join('\n'), /semanticSha256 differs.*v2/)
})

test('desired and release-evidence schemas accept absent V1, explicit V1, and V2 closed identities', () => {
  const identity = workflowIdentity(BEHAVIOR_WORKFLOW)
  for (const schemaName of ['github-desired.schema.json', 'release-trust-preflight-evidence.schema.json']) {
    const schema = JSON.parse(readFileSync(resolve(HERE, '../schemas', schemaName), 'utf8'))
    const validate = new Ajv2020({ strict: false }).compile({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...schema.$defs.workflowIdentity,
      $defs: schema.$defs,
    })
    for (const candidate of [closedV1(identity), closedV1(identity, true), closedV2(identity)]) {
      assert.equal(validate(candidate), true, `${schemaName}: ${JSON.stringify(validate.errors)}`)
    }
    assert.equal(validate({ ...closedV2(identity), semanticVersion: 3 }), false)
    assert.equal(validate({ ...closedV2(identity), extra: true }), false)
  }
})

test('governance model identity validation accepts only the closed V1/V2 migration shapes', () => {
  const identity = workflowIdentity(BEHAVIOR_WORKFLOW)
  for (const candidate of [closedV1(identity), closedV1(identity, true), closedV2(identity)]) {
    assert.doesNotThrow(() => assertReviewedWorkflowIdentity(candidate, 'fixture'))
  }
  assert.throws(() => assertReviewedWorkflowIdentity({ ...closedV2(identity), semanticVersion: 3 }, 'fixture'), /semanticVersion is invalid/)
  assert.throws(() => assertReviewedWorkflowIdentity({ ...closedV2(identity), extra: true }, 'fixture'), /invalid or open shape/)
})
