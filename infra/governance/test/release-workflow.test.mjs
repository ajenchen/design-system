import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  authorizeDeepAuditPublish,
  buildFiveStepStatus,
  buildConsumerDispatch,
  buildBranchPushArgs,
  buildPublishedTemplatePullRequestCreateArgs,
  buildConsumerPullRequestCreateArgs,
  buildPublishMutationPlan,
  buildPullRequestLookupArgs,
  buildPullRequestCreateArgs,
  matchesConsumerPullRequest,
  selectPublishRun,
  validateConsumerCheckProvenance,
  consentCoversHead,
  validateReleaseWorkflow,
} from '../../../scripts/release-orchestrator.mjs'
import { loadGovernanceBuildGraph } from '../../../scripts/governance-build-graph.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(GOVERNANCE_ROOT, '../..')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const workflow = readJson(resolve(GOVERNANCE_ROOT, 'release-workflow.json'))
const schema = readJson(resolve(GOVERNANCE_ROOT, 'schemas/release-workflow.schema.json'))

test('canonical release workflow validates and exposes exactly five AUTO steps', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(workflow), true, ajv.errorsText(validate.errors))
  assert.equal(validateReleaseWorkflow(workflow), workflow)
  assert.deepEqual(workflow.steps.map(step => step.id), ['pr-checks', 'merge', 'publish', 'readback', 'consumer'])
  assert.ok(workflow.steps.every(step => step.authority === 'AUTO'))
  assert.deepEqual(workflow.steps[0].completion, ['required-ci-check-green', 'conversation-resolved'])
  // 2026-09-02 user directive:合併前必有 user 對當前 PR head 的發版同意 receipt(預覽 → user 說「發版」→ 才合併)。
  assert.equal(workflow.steps[1].gate, 'user-release-consent')
  assert.equal(workflow.steps.filter(step => 'gate' in step).length, 1, 'only the merge step carries the human consent gate')
  assert.deepEqual(
    { required: workflow.releaseConsent.required, gateBefore: workflow.releaseConsent.gateBefore, binding: workflow.releaseConsent.binding },
    { required: true, gateBefore: 'merge', binding: 'pull-request-head-sha' },
  )
  assert.ok(workflow.releaseConsent.consentPhrases.includes('發版'))
})

test('decision authority has one ASK class and only four resumable human runtime boundaries', () => {
  assert.deepEqual(workflow.decisionAuthority, {
    engineering: 'AUTO',
    ask: 'unresolved-product-ui-ux-ssot-choice',
    humanOnly: ['login', 'mfa', 'oauth', 'credential-reference'],
    resumeAfterHumanAction: 'AUTO',
  })
})

test('deep audit validates one candidate branch and permits only one final publish without incident evidence', () => {
  assert.deepEqual(authorizeDeepAuditPublish(workflow, { completedFinalReleases: 0 }), {
    authorization: 'final-release',
    releaseNumber: 1,
  })
  assert.throws(
    () => authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1 }),
    /requires incident evidence/,
  )
  const incident = {
    incidentId: 'SEC-2026-0082',
    failureClass: 'security-incident',
    publishedVersion: '1.2.3-beta.4',
    evidenceRef: 'github://ajenchen/design-system/security/SEC-2026-0082',
  }
  assert.deepEqual(authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1, incident }), {
    authorization: 'incident-release',
    incidentId: 'SEC-2026-0082',
  })
  assert.throws(
    () => authorizeDeepAuditPublish(workflow, {
      completedFinalReleases: 1,
      incident,
      priorAdditionalReleaseIncidentIds: ['SEC-2026-0082'],
    }),
    /already authorized/,
  )
  assert.throws(
    () => authorizeDeepAuditPublish(workflow, {
      completedFinalReleases: 1,
      incident: { ...incident, failureClass: 'ordinary-remediation' },
    }),
    /failureClass is not eligible/,
  )
})

test('legacy ceremonies cannot enter the standard release blocking graph', () => {
  const expected = new Map([
    ['candidate-freeze', 'retired'],
    ['external-activation', 'retired'],
    ['model-certification', 'non-blocking'],
    ['offline-signatures', 'retired'],
    ['72h-soak', 'retired'],
    ['fleet-promotion', 'retired'],
  ])
  assert.deepEqual(new Map(workflow.legacyMechanisms.map(item => [item.id, item.standardRelease])), expected)
  const blockingGraph = JSON.stringify(workflow.steps)
  for (const legacyId of expected.keys()) assert.equal(blockingGraph.includes(legacyId), false, `${legacyId} leaked into the five-step graph`)
  assert.doesNotMatch(blockingGraph, /preflight|attestation|candidate|signature|soak|promotion/i)
})

test('live readbacks alone support safe resume without local candidate receipts', () => {
  const complete = buildFiveStepStatus(workflow, {
    onProtectedMain: true,
    pullRequest: null,
    releaseCommitSha: 'a'.repeat(40),
    release: { tagName: 'v1.2.3', isDraft: false, isImmutable: true, publishedAt: '2026-08-01T00:00:00Z' },
    publishRun: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: true })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: true, checkReadback: { trusted: true } })),
  })
  assert.deepEqual(complete.map(step => step.status), ['complete', 'complete', 'complete', 'complete', 'complete'])

  const beforeMergeObservation = {
    onProtectedMain: false,
    pullRequest: {
      state: 'OPEN',
      headRefOid: 'a'.repeat(40),
      requiredChecks: [{ bucket: 'pass', state: 'SUCCESS' }],
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
    },
    release: null,
    publishRun: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: false })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: false })),
  }
  const awaitingConsent = buildFiveStepStatus(workflow, { ...beforeMergeObservation, releaseConsent: null })
  assert.deepEqual(
    awaitingConsent.map(step => step.status),
    ['complete', 'awaiting-consent', 'pending', 'blocked', 'blocked'],
    'green required checks alone must stop at the preview stage until the user says 發版 for this PR head',
  )
  const beforeMerge = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    releaseConsent: { headSha: 'a'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.deepEqual(
    beforeMerge.map(step => step.status),
    ['complete', 'pending', 'pending', 'blocked', 'blocked'],
    'only required checks gate the five-step release; optional statuses cannot block it',
  )

  const retryAfterFailure = buildFiveStepStatus(workflow, {
    onProtectedMain: true,
    pullRequest: null,
    release: null,
    publishRun: { status: 'completed', conclusion: 'failure' },
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: false })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: false })),
  })
  assert.equal(retryAfterFailure[2].status, 'ready', 'a failed attempt must remain automatically retryable')

  const draft = buildFiveStepStatus(workflow, {
    onProtectedMain: true,
    pullRequest: null,
    releaseCommitSha: 'a'.repeat(40),
    release: { tagName: 'v1.2.3', isDraft: true, isImmutable: false, publishedAt: null },
    publishRun: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: true })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: true })),
  })
  assert.deepEqual(draft.map(step => step.status), ['complete', 'complete', 'ready', 'blocked', 'blocked'])
})

test('consumer completion requires an Actions-bound producer matching the release target', () => {
  const target = workflow.automation.consumers[1]
  const pullRequest = { headRefOid: 'a'.repeat(40), baseRefOid: 'b'.repeat(40) }
  const integration = { id: 15368, slug: 'github-actions' }
  const checkRun = {
    name: 'Verify consumer',
    head_sha: pullRequest.headRefOid,
    status: 'completed',
    conclusion: 'success',
    app: integration,
  }
  const workflowRun = {
    path: '.github/workflows/audit.yml',
    event: 'pull_request',
    head_sha: pullRequest.headRefOid,
    status: 'completed',
    conclusion: 'success',
  }
  assert.equal(validateConsumerCheckProvenance(target, pullRequest, checkRun, workflowRun, integration), true)
  assert.equal(validateConsumerCheckProvenance(target, pullRequest, checkRun, { ...workflowRun, event: 'repository_dispatch' }, integration), false)
  assert.equal(validateConsumerCheckProvenance(target, pullRequest, checkRun, { ...workflowRun, head_sha: pullRequest.baseRefOid }, integration), false)
})

test('consumer PR matching rejects a release identity copied onto the wrong branch or base', () => {
  const target = workflow.automation.consumers[1]
  const version = '1.2.3-beta.4'
  const releaseCommit = 'c'.repeat(40)
  const row = {
    state: 'OPEN',
    headRefName: `automation/design-system-${version}`,
    baseRefName: 'main',
    title: `chore(ds): sync v${version}`,
    body: `Version ${version}; commit ${releaseCommit}`,
  }
  assert.equal(matchesConsumerPullRequest(target, row, version, releaseCommit), true)
  assert.equal(matchesConsumerPullRequest(target, { ...row, headRefName: 'attacker/copied-receipt' }, version, releaseCommit), false)
  assert.equal(matchesConsumerPullRequest(target, { ...row, baseRefName: 'preview' }, version, releaseCommit), false)
})

test('orchestrator builds protected-main tag and repository-dispatch commands without workflow_dispatch', () => {
  const protectedMainSha = 'a'.repeat(40)
  const plan = buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha })
  const { operations } = plan
  assert.equal(plan.releaseCommitSha, protectedMainSha)
  assert.deepEqual(operations.map(operation => operation.args), [
    ['api', '--method', 'POST', 'repos/ajenchen/design-system/git/refs', '--input', '-'],
    ['api', '--method', 'POST', 'repos/ajenchen/design-system/dispatches', '--input', '-'],
  ])
  assert.deepEqual(JSON.parse(operations[0].input), { ref: 'refs/tags/v1.2.3', sha: protectedMainSha })
  assert.deepEqual(JSON.parse(operations[1].input), {
    event_type: 'stage-protected-release',
    client_payload: { tag: 'v1.2.3' },
  })
  assert.equal(operations.flatMap(operation => operation.args).includes('workflow'), false)

  const resumed = buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, existingTagSha: protectedMainSha })
  assert.equal(resumed.operations.length, 1, 'an exact existing tag must be reused rather than recreated')
  const advancedMain = buildPublishMutationPlan(workflow, {
    tag: 'v1.2.3', protectedMainSha: 'b'.repeat(40), existingTagSha: protectedMainSha,
  })
  assert.equal(advancedMain.releaseCommitSha, protectedMainSha, 'a later main advance must not replace the immutable tag commit')
})

test('publish run selection ignores workflow_dispatch and stale-head failures', () => {
  const protectedMainSha = 'a'.repeat(40)
  const current = { databaseId: 3, event: 'repository_dispatch', headSha: protectedMainSha, conclusion: 'success' }
  assert.equal(selectPublishRun([
    { databaseId: 1, event: 'repository_dispatch', headSha: 'b'.repeat(40), conclusion: 'failure' },
    { databaseId: 2, event: 'workflow_dispatch', headSha: protectedMainSha, conclusion: 'failure' },
    current,
  ], protectedMainSha), current)
})

test('orchestrator creates a missing branch PR automatically', () => {
  assert.deepEqual(buildBranchPushArgs(workflow, 'agent/release-ssot'), [
    'push', '--set-upstream', 'origin', 'HEAD:refs/heads/agent/release-ssot',
  ])
  assert.deepEqual(buildPullRequestCreateArgs(workflow, 'agent/release-ssot'), [
    'pr', 'create', '--repo', 'ajenchen/design-system', '--base', 'main', '--head', 'agent/release-ssot', '--fill',
  ])
  assert.throws(() => buildPullRequestCreateArgs(workflow, 'main'), /working branch/)
  assert.throws(() => buildBranchPushArgs(workflow, 'main'), /working branch/)
  assert.throws(() => buildBranchPushArgs(workflow, '--force'), /invalid release branch/)
  const lookup = buildPullRequestLookupArgs('ajenchen/design-system', 'agent/release-ssot')
  assert.deepEqual(lookup.allStates.slice(0, 8), [
    'pr', 'list', '--repo', 'ajenchen/design-system', '--state', 'all', '--head', 'agent/release-ssot',
  ], 'merged PR lookup must survive remote branch deletion')
})

test('consumer dispatches exact release identity and requires a protected-main PR', () => {
  const template = workflow.automation.consumers[0]
  assert.equal(template.delivery, 'release-published-pr')
  assert.equal('dispatchEvent' in template, false, 'release-published template mirror must not receive a duplicate repository dispatch')

  const target = workflow.automation.consumers[1]
  const operation = buildConsumerDispatch(target, {
    version: '1.2.3',
    tag: 'v1.2.3',
    commit: 'c'.repeat(40),
  })
  assert.deepEqual(operation.args, ['api', '--method', 'POST', 'repos/ajenchen/work-management/dispatches', '--input', '-'])
  assert.deepEqual(JSON.parse(operation.input), {
    event_type: 'design-system-published',
    client_payload: { version: '1.2.3', tag: 'v1.2.3', commit: 'c'.repeat(40) },
  })
  assert.equal(target.delivery, 'repository-dispatch-pr')
  assert.throws(() => buildConsumerDispatch({ ...target, delivery: 'direct-main' }, {
    version: '1.2.3', tag: 'v1.2.3', commit: 'c'.repeat(40),
  }), /not repository-dispatch driven/)

  const publishedTemplate = buildPublishedTemplatePullRequestCreateArgs(template, {
    version: '1.2.3-beta.4',
    commit: 'd'.repeat(40),
  })
  assert.equal(publishedTemplate.branch, 'automation/release-v1.2.3-beta.4')
  assert.deepEqual(publishedTemplate.args, [
    'pr', 'create', '--repo', 'ajenchen/ds-product-template',
    '--head', 'automation/release-v1.2.3-beta.4', '--base', 'main',
    '--title', 'chore: mirror design system v1.2.3-beta.4',
    '--body', `Generated from published design-system release v1.2.3-beta.4 at ${'d'.repeat(40)}.`,
  ])
})

test('public commands and cross-agent instructions expose only the canonical release entrypoints', () => {
  const scripts = readJson(resolve(ROOT, 'package.json')).scripts
  const orchestrator = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  assert.equal(scripts['release:auto'], 'node scripts/release-orchestrator.mjs auto')
  assert.equal(scripts['release:status'], 'node scripts/release-orchestrator.mjs status')
  assert.match(orchestrator, /maxBuffer:\s*16 \* 1024 \* 1024/, 'long-running gh watch output must not exhaust the default child-process buffer')
  assert.match(orchestrator, /no \(\?:required \)\?checks reported/i, 'a newly created PR without attached checks must remain pending')
  assert.match(orchestrator, /requiredChecks\.length === 0/, 'release:auto must retry while GitHub attaches required checks')
  assert.match(orchestrator, /buildBranchPushArgs/, 'release:auto must publish the exact local branch before creating or advancing its PR')
  for (const retired of ['release:preflight', 'release:stage-recover', 'release:approve', 'release:promote', 'release:reject-stage', 'release:finalize-verify']) {
    assert.equal(retired in scripts, false, `${retired} remains a public release path`)
  }

  const agents = readFileSync(resolve(ROOT, 'AGENTS.md'), 'utf8')
  const claude = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf8')
  const runbook = readFileSync(resolve(ROOT, 'docs/npm-native-staged-release.md'), 'utf8')
  const productAgentSource = readFileSync(resolve(ROOT, 'scripts/fork-role-sources/AGENTS.product.md'), 'utf8')
  const generatedForkAgent = readFileSync(resolve(ROOT, 'packages/design-system/ds-canonical/fork/AGENTS.md'), 'utf8')
  const generatedTemplateAgent = readFileSync(resolve(ROOT, 'template/ds-product-template/AGENTS.md'), 'utf8')
  for (const text of [agents, runbook]) assert.match(text, /pr-checks.*merge.*publish.*readback.*consumer/s)
  assert.match(agents, /infra\/governance\/release-workflow\.json/)
  assert.match(claude, /^@AGENTS\.md\n/)
  assert.match(claude, /infra\/governance\/release-workflow\.json/)
  assert.match(productAgentSource, /infra\/governance\/release-workflow\.json/)
  assert.match(productAgentSource, /pr-checks.*merge.*publish.*readback.*consumer/s)
  for (const generated of [generatedForkAgent, generatedTemplateAgent]) {
    assert.match(generated, /infra\/governance\/release-workflow\.json/)
    assert.match(generated, /pr-checks.*merge.*publish.*readback.*consumer/s)
    assert.match(generated, /Deep Audit.*single branch|Deep Audit.*單一 branch/s)
    assert.match(generated, /publish.*iteration\/test loop/s)
  }
})

test('manifest and build graph bind the canonical source, orchestrator, schema, tests, and product projections', () => {
  const manifest = readJson(resolve(ROOT, 'packages/governance/canonical/manifest.json'))
  const paths = new Set(manifest.sources.map(source => source.path))
  for (const path of [
    '.github/workflows/release.yml',
    'infra/governance/release-workflow.json',
    'infra/governance/schemas/release-workflow.schema.json',
    'infra/governance/test/release-workflow.test.mjs',
    'scripts/release-orchestrator.mjs',
    'scripts/release-npm-publish.mjs',
    'scripts/release-npm-readback.mjs',
    'scripts/release-github-release.mjs',
  ]) assert.equal(paths.has(path), true, `${path} is missing from the canonical release manifest`)
  assert.equal(paths.has('.github/workflows/release-finalize.yml'), false, 'retired finalizer workflow remains in the canonical release manifest')

  const graph = loadGovernanceBuildGraph()
  const forkSources = new Set(graph.stages.find(stage => stage.id === 'fork-template').sources)
  assert.equal(forkSources.has('infra/governance/release-workflow.json'), true)
  assert.equal(forkSources.has('infra/governance/schemas/release-workflow.schema.json'), true)
  const controlPlaneSources = new Set(graph.stages.find(stage => stage.id === 'control-plane').sources)
  for (const path of [
    '.github/workflows/release.yml',
    'infra/governance/release-workflow.json',
    'infra/governance/schemas/release-workflow.schema.json',
    'infra/governance/test/release-workflow.test.mjs',
    'scripts/release-orchestrator.mjs',
    'scripts/release-npm-publish.mjs',
    'scripts/release-npm-readback.mjs',
    'scripts/release-github-release.mjs',
  ]) assert.equal(controlPlaneSources.has(path), true, `${path} is missing from the control-plane graph`)
  assert.equal(controlPlaneSources.has('.github/workflows/release-finalize.yml'), false, 'retired finalizer workflow remains in the control-plane graph')
})

test('release consent is bound to the working branch, not to a single commit', () => {
  // 2026-09-20 錨例:receipt 原本以 <headSha>.json 命名,發版必經的版號 bump 就讓它失效,
  // user 為同一份工作說了六次「發版」。改綁分支(= 該 PR,預覽連結本來就是每個 PR 一條)。
  const receipt = { schemaVersion: 2, branch: 'claude/x', consentedHeadSha: 'a'.repeat(40), quote: '發版' }
  const other = 'b'.repeat(40)

  // 放行:同分支、head 沒變 / 只動了不進 bundle 的東西(版號、腳本、治理)
  assert.equal(consentCoversHead({ receipt, branch: 'claude/x', headSha: 'a'.repeat(40) }).ok, true)
  assert.equal(consentCoversHead({ receipt, branch: 'claude/x', headSha: other, productFilesChanged: false }).ok, true)

  // 仍然擋:同意之後預覽看得見的東西又變了 → 要重新確認(user 同意的是他看過的那個畫面)
  assert.equal(consentCoversHead({ receipt, branch: 'claude/x', headSha: other, productFilesChanged: true }).ok, false)
  // 仍然擋:換一條分支 = 換一份工作(2026-09-02 事故就是這格)
  assert.equal(consentCoversHead({ receipt, branch: 'claude/y', headSha: 'a'.repeat(40) }).ok, false)
  // 仍然擋:沒有 receipt / 缺 user 逐字原話
  assert.equal(consentCoversHead({ receipt: null, branch: 'claude/x', headSha: other }).ok, false)
  assert.equal(consentCoversHead({ receipt: { ...receipt, quote: '   ' }, branch: 'claude/x', headSha: 'a'.repeat(40) }).ok, false)

  // 舊格式(綁 commit)仍相容,但只認它自己那一個 commit
  const legacy = { schemaVersion: 1, headSha: 'a'.repeat(40), branch: 'claude/x', quote: '發版' }
  assert.equal(consentCoversHead({ receipt: legacy, branch: 'claude/x', headSha: 'a'.repeat(40) }).ok, true)
  assert.equal(consentCoversHead({ receipt: legacy, branch: 'claude/x', headSha: other }).ok, false)
})

test('consumer sync PRs are opened by the orchestrator, and every one it opens is recognizable', () => {
  // 2026-09-20:GitHub 不讓自家 GITHUB_TOKEN 開出來的 PR 觸發 workflow,所以
  // repository-dispatch consumer 的 audit.yml 永遠停在 action_required,而出處判定要求必過
  // check 綁在 PR head 上產生 —— 結構上湊不齊,beta.135/136/137/138 每次都要人工把 PR 關掉再開。
  // 旁邊的 published-template 三次都沒卡,差別只有「PR 由 orchestrator 用 canonical token 開」。
  const commit = 'e'.repeat(40)
  const version = '9.9.9-beta.1'
  for (const target of workflow.automation.consumers) {
    const op = buildConsumerPullRequestCreateArgs(target, { version, commit })
    const title = op.args[op.args.indexOf('--title') + 1]
    const body = op.args[op.args.indexOf('--body') + 1]
    const row = { state: 'OPEN', headRefName: op.branch, baseRefName: target.defaultBranch, title, body }
    // 開了卻認不出來 = 等於沒開(下一輪會再開一個,或永遠等不到)
    assert.equal(matchesConsumerPullRequest(target, row, version, commit), true, `${target.repository}: 自己開的 PR 認不出來`)
    // 身分綁定仍然嚴格:版號、commit、關閉狀態任一不符都不得誤認
    assert.equal(matchesConsumerPullRequest(target, row, '0.0.0', commit), false)
    assert.equal(matchesConsumerPullRequest(target, row, version, 'f'.repeat(40)), false)
    assert.equal(matchesConsumerPullRequest(target, { ...row, state: 'CLOSED' }, version, commit), false)
    assert.equal(matchesConsumerPullRequest(target, { ...row, baseRefName: 'other' }, version, commit), false)
  }
  // 既有薄包裝的語意不變:只接 published-template
  const dispatchTarget = workflow.automation.consumers.find(c => c.delivery === 'repository-dispatch-pr')
  assert.throws(() => buildPublishedTemplatePullRequestCreateArgs(dispatchTarget, { version, commit }),
    /not published-template driven/)
  // 壞輸入仍 fail closed
  assert.throws(() => buildConsumerPullRequestCreateArgs(dispatchTarget, { version, commit: 'nope' }), /release commit/)
  assert.throws(() => buildConsumerPullRequestCreateArgs(dispatchTarget, { version: 'nope', commit }), /version/)
})
