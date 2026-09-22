import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
  filterOutPublishWorkflowRuns,
  rollupRowIsRed,
  lifecycleChainReachesAConsumer,
  rollupRowIsAborted,
  classifyReleaseLookup,
  countsAsPublishedFromState,
  classifyScheduledMonitorRun,
  buildPullRequestLookupArgs,
  buildPullRequestCreateArgs,
  matchesConsumerPullRequest,
  selectPublishRun,
  validateConsumerCheckProvenance,
  consentCoversHead,
  consumerStepAction,
  productContentDigest,
  productChangeSinceBaseline,
  publishedBaselineRef,
  listReleaseTags,
  PRODUCT_VISIBLE,
  consentReleaseLedger,
  recordConsentRelease,
  writeReleaseConsent,
  releaseIncidentFromEnv,
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
  assert.equal(workflow.releaseConsent.required, true)
  assert.equal(workflow.releaseConsent.gateBefore, 'merge')
  // 宣告值不做同義反覆斷言 —— 那只是把 JSON 抄一遍,SSOT 與實作漂移時照樣全綠
  //(2026-09-20 稽核實證:宣告 pull-request-head-sha、實作已換成內容指紋,三個互斥斷言同時綠)。
  // 改成:**宣告的語意必須與實作的行為一致**,漂移就紅。
  assert.equal(workflow.releaseConsent.binding, 'approved-preview-content-digest')
  const probe = { schemaVersion: 3, quote: '發版', productDigest: 'a'.repeat(64), branch: 'claude/當初那條' }
  assert.equal(consentCoversHead({ receipt: probe, branch: 'claude/另一條', headSha: 'f'.repeat(40), currentProductDigest: 'a'.repeat(64) }).ok,
    true, '宣告綁內容 → 實作就不得看分支')
  assert.equal(consentCoversHead({ receipt: probe, branch: 'claude/當初那條', headSha: 'f'.repeat(40), currentProductDigest: 'b'.repeat(64) }).ok,
    false, '宣告綁內容 → 內容變了就必須失效')
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
  // 「發布完成」的真實形狀:tag 指向 protected main 的 head。原本這個 fixture 兩個欄位
  // 都沒給,於是它也能代表「版號沒 bump、tag 是別份內容的」那個假綠狀態 —— fixture
  // 不真實,判定表就測不到要測的事。
  const published = {
    onProtectedMain: true,
    pullRequest: null,
    releaseCommitSha: 'a'.repeat(40),
    tagCommitSha: 'a'.repeat(40),
    protectedMainSha: 'a'.repeat(40),
    release: { tagName: 'v1.2.3', isDraft: false, isImmutable: true, publishedAt: '2026-08-01T00:00:00Z' },
    publishRun: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: true })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: true, checkReadback: { trusted: true } })),
  }
  const complete = buildFiveStepStatus(workflow, published)
  assert.deepEqual(complete.map(step => step.status), ['complete', 'complete', 'complete', 'complete', 'complete'])

  // 對照組(2026-09-21 beta.140 錨,M37 第十種形狀):同一份 observation,只把 protected main
  // 往前挪一個 commit —— 也就是「這個版號早就發布過,而 main 上有它不包含的內容」。
  // 修之前這裡五步全綠、release:auto exit 0,實際一個位元都沒發出去。
  const staleVersion = buildFiveStepStatus(workflow, { ...published, protectedMainSha: 'b'.repeat(40) })
  assert.deepEqual(
    staleVersion.map(step => step.status),
    ['complete', 'complete', 'stale-version', 'blocked', 'blocked'],
    '版號沒 bump 時 publish 必須紅,且不得讓 readback 因為「舊版號在 npm 上讀得到」跟著變綠',
  )
  // 另一面:tag 還沒建(版號剛 bump、還沒發)→ 不是 stale,是還沒做,要 ready 讓 runner 去發。
  const notYetPublished = buildFiveStepStatus(workflow, {
    ...published,
    tagCommitSha: null,
    release: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: false })),
  })
  assert.equal(notYetPublished[2].status, 'ready', '版號已 bump 但還沒發 → ready,不可誤判成 stale-version')

  const beforeMergeObservation = {
    onProtectedMain: false,
    // headSha 是必要欄位,不是裝飾:pr-checks / merge 都要求「PR 帶的正是現在這個 head」。
    // 原本 fixture 沒給,於是它同時也代表「PR 講的是別份內容」那個假綠狀態。
    headSha: 'a'.repeat(40),
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

  // 對照組(2026-09-21 錨,M37 第十一種形狀):PR 已合併,然後在**同一條分支**上又疊了一個
  // commit。修之前 pr-checks 讀那個已合併 PR 的綠燈報 complete、merge 讀 state==='MERGED'
  // 也報 complete —— 於是 publish 在 main 的舊 head 上建了錯 tag。
  const mergedThenMoreCommits = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    headSha: 'c'.repeat(40),
    pullRequest: { ...beforeMergeObservation.pullRequest, state: 'MERGED' },
    releaseConsent: { headSha: 'c'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.deepEqual(
    mergedThenMoreCommits.map(step => step.status),
    ['stale-head', 'pending', 'pending', 'blocked', 'blocked'],
    '已合併的 PR 帶的是別份內容 → pr-checks 必須 stale-head,merge 不得報 complete',
  )
  // 另一面:同一個已合併的 PR,head 就是現在這個 head → 這份內容確實在 main 上,merge 該 complete。
  const properlyMerged = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    pullRequest: { ...beforeMergeObservation.pullRequest, state: 'MERGED' },
    releaseConsent: { headSha: 'a'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.equal(properlyMerged[1].status, 'complete', 'PR head 等於現在的 head → merge 真的完成了')

  // 對照組(2026-09-21 第七個位置,就在修前六個的那次跑裡發作):PR 與 main 衝突時
  // GitHub 建不出合併 ref,pull_request 的 CI 一次都不會觸發 → 必過項永遠是空清單 →
  // `checkRollupStatus([])` 回 'pending' → runner 每兩秒重試、永不收斂。實測空轉十幾分鐘。
  // 「還沒有結果」與「結構上不會有結果」必須分成兩種狀態。
  const conflicting = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    pullRequest: { ...beforeMergeObservation.pullRequest, requiredChecks: [], mergeable: 'CONFLICTING' },
    releaseConsent: { headSha: 'a'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.equal(conflicting[0].status, 'conflicting', '衝突時必須是自己的狀態,不得混進「還在跑」')
  // 另一面 1:同樣零筆必過項,但**沒有**衝突 → 那才是真的「還在跑」,不可誤報衝突
  const genuinelyPending = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    pullRequest: { ...beforeMergeObservation.pullRequest, requiredChecks: [], mergeable: 'MERGEABLE' },
    releaseConsent: { headSha: 'a'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.equal(genuinelyPending[0].status, 'pending', '零筆但沒衝突 = 真的還在跑')
  // 另一面 2:衝突但必過項**已經紅** → 要報 failed(真警報優先,不得被衝突狀態蓋掉)
  const conflictingAndRed = buildFiveStepStatus(workflow, {
    ...beforeMergeObservation,
    pullRequest: {
      ...beforeMergeObservation.pullRequest,
      requiredChecks: [{ bucket: 'fail', state: 'FAILURE' }],
      mergeable: 'CONFLICTING',
    },
    releaseConsent: { headSha: 'a'.repeat(40), quote: '發版', source: 'user-prompt-hook' },
  })
  assert.equal(conflictingAndRed[0].status, 'failed', '真的紅燈不得被衝突狀態蓋掉')

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
  const plan = buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, versionAtReleaseCommit: '1.2.3' })
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

  const resumed = buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, existingTagSha: protectedMainSha, versionAtReleaseCommit: '1.2.3' })
  assert.equal(resumed.operations.length, 1, 'an exact existing tag must be reused rather than recreated')
  const advancedMain = buildPublishMutationPlan(workflow, {
    tag: 'v1.2.3', protectedMainSha: 'b'.repeat(40), existingTagSha: protectedMainSha, versionAtReleaseCommit: '1.2.3',
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

test('consumer 沒有 PR 時的下一步:「已派工」與「已開 PR」是兩件事', () => {
  // ── 真正的回歸:beta.139 那條**序列** ───────────────────────────────────
  // 靜態幾格全對也可能漏掉這個 bug —— 它只在「派工之後分支才出現」這個順序上發作。
  const wm = { delivery: 'repository-dispatch-pr' }
  let dispatched = false
  let opened = false

  // 第 1 圈:sync workflow 還沒把分支推上來 → 派工
  let a = consumerStepAction({ ...wm, branchExists: false, dispatched, pullRequestOpened: opened })
  assert.equal(a, 'dispatch')
  dispatched = true

  // 第 2 圈:分支還在路上 → 等,但**不可以**重派(重派會重跑一次 sync workflow)
  a = consumerStepAction({ ...wm, branchExists: false, dispatched, pullRequestOpened: opened })
  assert.equal(a, 'wait')

  // 第 3 圈:分支出現了 → **必須開 PR**。
  // 這一格就是 2026-09-20 的 bug:舊版用同一個旗標擋,這裡會回 'wait' 而永遠開不出 PR,
  // 空轉到 45 分鐘逾時,work-management 停在前一版。
  a = consumerStepAction({ ...wm, branchExists: true, dispatched, pullRequestOpened: opened })
  assert.equal(a, 'create-pr', '派工之後分支才出現 —— 這一圈必須開 PR,不能被「已派工」擋住')
  opened = true

  // 第 4 圈:已經開過了 → 不重複開
  a = consumerStepAction({ ...wm, branchExists: true, dispatched, pullRequestOpened: opened })
  assert.equal(a, 'wait')

  // ── template:分支由上游 release 事件推上來,這裡只等不派工 ──
  const tpl = { delivery: 'release-published-pr' }
  assert.equal(consumerStepAction({ ...tpl, branchExists: false }), 'wait')
  assert.equal(consumerStepAction({ ...tpl, branchExists: false, dispatched: true }), 'wait', 'template 永遠不派工')
  assert.equal(consumerStepAction({ ...tpl, branchExists: true }), 'create-pr')
  assert.equal(consumerStepAction({ ...tpl, branchExists: true, pullRequestOpened: true }), 'wait')
})

test('呼叫端真的用 consumerStepAction,而且兩個旗標沒有被合回一個', () => {
  // 純函式測得再漂亮,呼叫端沒用到就是兩份平行實作 —— 這正是 2026-09-20 學到的那條
  //(判定表全綠、餵它的值卻是另一段程式算的)。
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  assert.match(src, /const action = consumerStepAction\(/, 'executeAutomaticRelease 必須用這支純函式決定下一步')
  assert.match(src, /const dispatchedConsumers = new Set\(\)/)
  assert.match(src, /const openedConsumerPullRequests = new Set\(\)/, '兩件事要兩個集合')
  // 開 PR 之後只能加進 openedConsumerPullRequests;把 repo 加進 dispatchedConsumers 就是舊 bug 復活
  const block = src.slice(src.indexOf('const action = consumerStepAction('))
  const createBranch = block.slice(block.indexOf("if (action === 'create-pr')"), block.indexOf("else if (action === 'dispatch')"))
  assert.doesNotMatch(createBranch, /dispatchedConsumers\.add/, '開 PR 不得標記成「已派工」')
})

test('發版同意綁「使用者看過的產品內容」,不綁 commit 也不綁分支', () => {
  const digest = productContentDigest('HEAD')
  assert.match(digest || '', /^[0-9a-f]{64}$/, '產品內容指紋必須算得出來')
  assert.notEqual(digest, createHash('sha256').update('').digest('hex'),
    '空集合的指紋在任何兩次比較都會「相符」= 假性通過,不得當成有效指紋')

  // receipt **必須帶 branch**(真實 receipt 一定有,它是出處紀錄):少了它,
  // 「改回分支要相符」這種回歸就碰不到判定式,測試會假綠。2026-09-20 第一版就漏了這個。
  const receipt = { schemaVersion: 3, quote: '發版', productDigest: digest, branch: 'claude/同意當下那條分支' }
  // 這一格就是 2026-09-20 第二次修正的重點:換了分支、換了 commit,同意仍然成立。
  for (const branch of ['claude/a', 'claude/完全不同的分支', 'main', undefined]) {
    assert.equal(
      consentCoversHead({ receipt, branch, headSha: 'f'.repeat(40), currentProductDigest: digest }).ok,
      true,
      `分支「${branch}」不該影響同意是否成立 —— 分支是我切工作的單位,不是 user 授權的單位`,
    )
  }
  // 安全面(2026-09-02 事故那一格)完全保留:user 看過的東西變了就必須重新確認
  assert.equal(consentCoversHead({ receipt, branch: 'claude/a', headSha: 'f'.repeat(40), currentProductDigest: '0'.repeat(64) }).ok, false)
  assert.equal(consentCoversHead({ receipt, branch: 'claude/a', headSha: 'f'.repeat(40), currentProductDigest: null }).ok, false, '算不出指紋要保守視為不覆蓋')
  assert.equal(consentCoversHead({ receipt: { ...receipt, productDigest: null }, currentProductDigest: digest }).ok, false)
  assert.equal(consentCoversHead({ receipt: { ...receipt, quote: '   ' }, currentProductDigest: digest }).ok, false, '仍然需要 user 逐字原話')
})

test('一份授權只發一次 final release —— 而且執行面真的呼叫那支閘', () => {
  // 第一次:放行
  assert.equal(authorizeDeepAuditPublish(workflow, { completedFinalReleases: 0 }).authorization, 'final-release')
  // 第二次沒有 incident 證據:擋住(2026-09-19/20 同一份工作連發五版的那個缺口)
  assert.throws(() => authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1 }), /additional/i)
  // 第二次有完整 incident 證據:放行
  const ok = authorizeDeepAuditPublish(workflow, {
    completedFinalReleases: 1,
    incident: { incidentId: 'INC-1', failureClass: 'post-publish-blocker', publishedVersion: '0.1.0-beta.139', evidenceRef: 'ref-1' },
    priorAdditionalReleaseIncidentIds: [],
  })
  assert.equal(ok.authorization, 'incident-release')

  // incident 只認明確傳入的環境變數,絕不推測
  assert.equal(releaseIncidentFromEnv({}), null)
  assert.equal(releaseIncidentFromEnv({ RELEASE_ADDITIONAL_INCIDENT: 'not json' }), null)
  assert.deepEqual(releaseIncidentFromEnv({ RELEASE_ADDITIONAL_INCIDENT: '{"incidentId":"X"}' }), { incidentId: 'X' })

  // **執行面必須真的呼叫它** —— 這條閘在 2026-09-20 之前定義好、測試好,卻從沒被發版流程呼叫過,
  // 所以 canonical 的「最多一次」等於不存在。這個斷言就是防它再變回孤兒。
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /authorizeDeepAuditPublish\(/, 'publish 步驟必須呼叫 authorizeDeepAuditPublish,否則「一份授權一次發布」只是紙上的字')
  assert.match(publishBlock, /consentReleaseLedger\(\)/, 'publish 前必須讀同一份授權底下已發的版本帳本')
  assert.match(src, /recordConsentRelease\(observation\.version\)/, 'publish 之後必須記帳,否則帳本永遠是空的 = 閘永遠不會紅')
})

test('發版時必須講出「這一版不會改變畫面」—— 而且執行面真的用到它', () => {
  // 2026-09-20 實測:beta.136/137/138/139/140 五版的預覽內容指紋完全相同,零 UI 變動。
  // 擋下來是錯的(治理語料確實有變),但不講出來也是錯的。
  assert.equal(productChangeSinceBaseline('99c38394a2', '54da256e81'), 'none', '兩個沒動產品的 commit → none')
  assert.equal(productChangeSinceBaseline('68d9dfdc^', '68d9dfdc'), 'changed', '動過產品的 commit → changed')
  assert.equal(productChangeSinceBaseline(null, 'HEAD'), null, '缺前一版就不猜')
  assert.equal(productChangeSinceBaseline('HEAD', null), null)

  // 寫了卻沒人呼叫 = 等於沒寫(今天抓了一整天的那條)
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const reportBlock = src.slice(src.indexOf('function printReport('), src.indexOf('function waitForRun('))
  assert.match(reportBlock, /productChangeSinceBaseline\(/, 'printReport 必須呼叫它')
  assert.match(reportBlock, /不會改變任何畫面/, '而且必須真的印出來給人看')

  // 2026-09-21:餵給它的「上一版」是誰算的?——之前答案是 `observation.release?.targetCommitish`,
  // 而那支 `gh release view` 的 --json 欄位清單裡根本沒有 targetCommitish,所以它恆為 undefined、
  // productChange 恆為 null、那句話從寫下來到今天一次都沒印出來過。純函式的參數邊界又一次是盲點。
  assert.doesNotMatch(reportBlock, /targetCommitish/,
    '不得再從 gh release view 的 targetCommitish 取上一版 —— 那個欄位根本沒被要求回傳')
  assert.match(reportBlock, /publishedBaselineRef\(observation\.tag, listReleaseTags\(\),/, '必須實際解析出要比較的基準 ref')
  // JSON key 必須跟著語意走(2026-09-22 稽核):函式改名 publishedBaselineRef 之後,機器可讀輸出的欄位
  // 若還叫 previousReleaseRef,版號沒 bump 時它裝的其實是當前這一版,名稱與語意相反。
  assert.match(reportBlock, /report\.publishedBaselineRef = baselineRef/, 'JSON 欄位名必須是 publishedBaselineRef')
  assert.doesNotMatch(src, /previousReleaseRef/, '舊欄位名不得殘留(全 repo 零讀取端,改名零風險)')
  assert.match(reportBlock, /releasePublishedState\(observation\.repository, tag\) === true/,
    '基準必須是真的發布過的那一版 —— 建了 tag 但發布失敗的不算')
  assert.match(reportBlock, /無法判斷這一版會不會改變畫面/,
    '「量不到」必須印成跟「量到沒變」不一樣的話,否則沉默無法區分')

  const releaseViewFields = src.match(/'release', 'view'[^\]]*\]/u)?.[0] ?? ''
  assert.ok(releaseViewFields, '找不到 gh release view 的欄位清單')
  assert.doesNotMatch(releaseViewFields, /targetCommitish/,
    '若哪天真的要用 targetCommitish,必須先把它加進 --json 欄位 —— 這條就是在鎖那個接縫')
})

test('要比的基準是「線上目前那一份」,不是「上一個 tag」——版號沒 bump 時這兩件事會分開', () => {
  const tags = ['v0.1.0-beta.140', 'v0.1.0-beta.139', 'v0.1.0-beta.138']
  // 版號已 bump、tag 還沒建(release:status 平常走的路)→ 基準 = 線上最新那個
  assert.equal(publishedBaselineRef('v0.1.0-beta.141', tags), 'v0.1.0-beta.140')
  // 版號沒 bump:currentTag 自己就是線上最新那一份,基準必須是它自己。
  // 2026-09-21 錨:原本回 tags[index + 1] = beta.139,於是把 beta.140 自己的改動
  // 也算進差異裡,對一份零 UI 變動的工作印出「這一版會改變畫面」——與事實相反。
  assert.equal(publishedBaselineRef('v0.1.0-beta.140', tags), 'v0.1.0-beta.140')
  assert.equal(publishedBaselineRef('v0.1.0-beta.139', tags), 'v0.1.0-beta.139')
  // 完全沒有 tag 時不得亂猜
  assert.equal(publishedBaselineRef('v0.1.0-beta.1', []), null)

  // 「tag 存在」≠「那一版發布過」(2026-09-21 真的留下一個這樣的 tag:建了、發布失敗、
  // 沒有 release、npm 上沒有東西)。拿它當基準就是拿從來沒出貨的東西當「線上目前那一份」。
  const released = new Set(['v0.1.0-beta.139', 'v0.1.0-beta.138'])
  assert.equal(
    publishedBaselineRef('v0.1.0-beta.142', tags, tag => released.has(tag)),
    'v0.1.0-beta.139',
    '最新的 tag 沒有 release → 要往下找到第一個真的發布過的',
  )
  // 另一面:最新的 tag 真的發布過,就必須用它,不可無故往下跳
  assert.equal(
    publishedBaselineRef('v0.1.0-beta.142', tags, tag => tag === 'v0.1.0-beta.140' || released.has(tag)),
    'v0.1.0-beta.140',
  )
  // 一個都沒發布過 → 不猜
  assert.equal(publishedBaselineRef('v0.1.0-beta.142', tags, () => false), null)

  // 真實資料:用**指名的那一對** tag,不是「最新兩個」——
  // 2026-09-21 CI 實證:原本寫 `real[1] → real[0]` 並斷言 none,而那句話講的是 2026-09-20
  // 量過的 beta.139 → beta.140。之後多了一個 beta.141 的 tag,`real[0]/real[1]` 就換成了
  // 別的一對(而那一對確實有畫面變動)→ 測試在**零程式改動**下變紅。這正是 M37 第九種形狀
  // 的同族:「最新兩個 tag」是代理,「當初量過的那一對」才是要斷言的事。
  // 本機當時還沒 fetch 到那個新 tag 所以綠、CI 抓 tag 所以紅 —— 環境依賴的另一種形狀。
  const real = listReleaseTags()
  assert.ok(real.length >= 2, `本地至少要有兩個版本 tag 才驗得了(實際 ${real.length})`)
  assert.equal(publishedBaselineRef(real[0], real), real[0], '最新 tag 已存在 → 基準是它自己')
  const MEASURED_PAIR = ['v0.1.0-beta.139', 'v0.1.0-beta.140']
  const missing = MEASURED_PAIR.filter((tag) => !real.includes(tag))
  // 找不到那兩個 tag = 量具拿不到資料,必須以儀器失效的名義紅,不得默默跳過(M32:回 0 筆先證明拿得到資料)
  assert.deepEqual(missing, [], `驗不了零畫面變動:本地缺 tag ${missing.join(' / ')}(先 git fetch --tags)`)
  assert.equal(productChangeSinceBaseline(...MEASURED_PAIR), 'none',
    `${MEASURED_PAIR[0]} → ${MEASURED_PAIR[1]} 應為零畫面變動(2026-09-20 實測的就是這一對)`)
})

test('「讀不到 release」不得當成「那一版沒發出去」—— 一份發版授權不能被讀取失敗弄丟或憑空復活', () => {
  // 2026-09-21 實測:帳本寫著 beta.141,而線上既沒有 release、npm 上也沒有東西(發布被中斷)。
  // 照帳本算 → 一次失敗的嘗試燒掉一份授權,使用者得再說一次「發版」(2026-09-20 要修的那件事);
  // 但「查不到」就當成沒發 → 同一份授權可以發第二次。所以必須三值,而且讀不到要 fail closed。
  assert.equal(classifyReleaseLookup({ ok: true, code: 200, text: JSON.stringify({ draft: false, published_at: '2026-09-21T00:00:00Z' }) }), true)
  assert.equal(classifyReleaseLookup({ ok: false, code: 404, text: '{}' }), false, '明確 404 = 那次真的沒發出去')
  assert.equal(classifyReleaseLookup({ ok: true, code: 200, text: JSON.stringify({ draft: true }) }), false, 'draft 不算發布')
  // 以下每一種都是「讀不到」,一律 null,呼叫端當成已消耗
  assert.equal(classifyReleaseLookup({ ok: false, code: 0, text: '' }), null, '連線層失敗')
  assert.equal(classifyReleaseLookup({ ok: false, code: 403, text: '{}' }), null, '權限不足')
  assert.equal(classifyReleaseLookup({ ok: false, code: 500, text: '{}' }), null, '伺服器錯誤')
  assert.equal(classifyReleaseLookup({ ok: true, code: 200, text: '不是 JSON' }), null, '回應壞掉')
  assert.equal(classifyReleaseLookup({ ok: true, code: 200, text: JSON.stringify({ draft: false }) }), null, '沒有 published_at')

  // 呼叫端的方向必須是 fail closed:算「消耗掉一次」時 null 要算進去(不是排除)。
  // 2026-09-22 稽核:這一段先前只有原始碼 regex,沒有行為測試真的餵過 null。改成純函式判定表。
  assert.equal(countsAsPublishedFromState(true), true, '真的發出去了 → 算')
  assert.equal(countsAsPublishedFromState(false), false, '明確 404 → 不算(那次沒發成,授權還能續)')
  assert.equal(countsAsPublishedFromState(null), true, '讀不到 → **算**(保守,不讓同一份授權發第二次)')
  assert.equal(countsAsPublishedFromState(undefined), true, '沒有狀態也當讀不到')
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  assert.match(src, /function releaseCountsAsPublished\([\s\S]{0,200}countsAsPublishedFromState\(releasePublishedState\(/,
    '線上版本必須經由同一支純函式,不得另寫一份方向')
  // 而「要比的基準」方向相反:那裡只有**確定有** release 才能當基準
  assert.match(src, /releasePublishedState\(observation\.repository, tag\) === true/,
    '基準必須是確定發布過的那一版,讀不到不得充當基準')
  // 兩個消費點都必須真的接上,否則上面整張表是紙上的
  // 同意閘那一側:相依必須**可注入**(否則那一格永遠只測得到一個方向 = M32 參數邊界盲點),
  // 而且**預設要走線上**(否則預設值就是另一個代理)。
  assert.match(src, /readReleaseConsent\(\{ branch, headSha, releaseLookup = null \}/,
    '同意閘必須把「那一版發出去了嗎」做成可注入的相依')
  // 注入點回三值狀態;預設走線上;fail-closed 的組合在函式內部經同一支純函式(2026-09-22 稽核後的形狀)
  assert.match(src, /const lookupState = releaseLookup\s*\n\s*\|\| \(version => releasePublishedState\(releaseRepository\(\), `v\$\{version\}`\)\)/,
    '預設必須走線上實況,不得只在測試裡才對帳')
  assert.match(src, /const countsAsPublished = \(version\) => countsAsPublishedFromState\(lookupState\(version\)\)/,
    '「讀不到 → 算已消耗」的方向必須經由同一支純函式,注入點不得自己決定方向')
  assert.match(src, /const spent = \(receipt\.authorizationId[\s\S]{0,300}\.filter\(version => countsAsPublished\(version\)\)/,
    '帳本的每一筆都要經過那支判定,不得直接用帳本')
  assert.match(src, /const alreadyReleased = consentReleaseLedger\(\)[\s\S]{0,300}releaseCountsAsPublished\(/,
    'publish 的帳本也必須對線上實況')
})

test('tag 名稱不得與它指向的內容不符 —— 而且那個版號是向 GitHub 讀來的,不是本地工作區', () => {
  // 2026-09-21 實測的直接災因:上游兩步誤判成已合併之後,這裡在 main 的舊 head 上建了
  // `v0.1.0-beta.141` 的 tag,而那個 commit 的 package.json 寫的是 `0.1.0-beta.140`。
  // GitHub 不會幫你檢查 tag 名稱與內容的關係,Release workflow 要跑到一半才炸。
  const protectedMainSha = 'a'.repeat(40)
  assert.throws(
    () => buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, versionAtReleaseCommit: '1.2.2' }),
    /tag 名稱與它指向的內容不符/,
    '版號不符必須擋在建 tag 之前',
  )
  // 「讀不到」不得當成「相符」(M37 第八種形狀)
  assert.throws(
    () => buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha }),
    /requires the version actually present/,
  )
  assert.throws(
    () => buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, versionAtReleaseCommit: null }),
    /requires the version actually present/,
  )
  // 相符的一面必須通得過,否則上面三條只是把閘焊死
  assert.equal(
    buildPublishMutationPlan(workflow, { tag: 'v1.2.3', protectedMainSha, versionAtReleaseCommit: '1.2.3' }).releaseCommitSha,
    protectedMainSha,
  )

  // 參數邊界(M37 的盲點):那個版號是誰算的?必須是向 GitHub 讀該 commit 的 manifest,
  // 不能改回讀本地 package.json —— 本地講的是「我想發哪一版」,不是「那個 commit 裡是哪一版」。
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /packageVersionAtCommit\(observation\.repository, releaseCommitSha\)/,
    'publish 必須讀「要打 tag 的那個 commit」上的版號')
  assert.match(publishBlock, /versionAtReleaseCommit,/, '而且必須把它餵進 buildPublishMutationPlan')
  const atCommit = src.slice(src.indexOf('function packageVersionAtCommit('), src.indexOf('function checkRollupStatus('))
  assert.match(atCommit, /repos\/\$\{repository\}\/contents\//, '必須向 GitHub 讀那個 ref 的 manifest')
  assert.doesNotMatch(atCommit, /readJson\(resolve\(ROOT/, '不得退回讀本地工作區的 package.json')
})

test('incident release 也要合併得進去 —— 授權存在卻接不上執行面等於沒有', () => {
  // 2026-09-21 缺口:canonical 允許「綁定已發布版本的 post-publish blocker」在同一份同意下
  // 再發一次,而那條授權原本只接在 publish。結果 beta.142 發出去卻沒有 consumer 裝得上,
  // 修好的 beta.143 **合併不進 main** —— 要救火反而得再去要一次同意。
  const base = {
    onProtectedMain: false,
    headSha: 'a'.repeat(40),
    pullRequest: { state: 'OPEN', headRefOid: 'a'.repeat(40), requiredChecks: [{ bucket: 'pass', state: 'SUCCESS' }] },
    release: null, publishRun: null, releaseConsent: null,
    npmPackages: workflow.automation.packages.map(name => ({ name, exactVersion: false })),
    consumers: workflow.automation.consumers.map(target => ({ ...target, exactVersion: false })),
  }
  const incident = {
    incidentId: 'DS-2026-0921-consumer-upgrade-blocked',
    failureClass: 'post-publish-blocker',
    publishedVersion: '0.1.0-beta.142',
    evidenceRef: 'github://ajenchen/work-management/actions/runs/35614784123',
  }
  const withIncident = { ...process.env, RELEASE_ADDITIONAL_INCIDENT: JSON.stringify(incident) }
  // 這支測試不改 process.env(會污染其他測試),改直接驗 authorizeDeepAuditPublish 的判定 +
  // 來源斷言鎖住「merge 這一步真的接上了同一支驗證」。
  assert.deepEqual(
    authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1, incident }),
    { authorization: 'incident-release', incidentId: incident.incidentId },
  )
  // 另一面:欄位不全 / failureClass 不在白名單 / evidenceRef 等於 incidentId,都不得取得授權
  // 每一格都鎖住**為什麼**不成立,否則任何原因的 throw 都算過(2026-09-22 稽核)
  for (const [bad, why] of [
    [{ ...incident, failureClass: 'ordinary-remediation' }, /failureClass is not eligible/],
    [{ ...incident, evidenceRef: incident.incidentId }, /evidenceRef must be a separate/],
    [{ incidentId: incident.incidentId, failureClass: 'post-publish-blocker', publishedVersion: '0.1.0-beta.142' }, /exact required fields/],
  ]) {
    assert.throws(() => authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1, incident: bad }), why)
  }
  assert.ok(withIncident.RELEASE_ADDITIONAL_INCIDENT, 'incident 由 RELEASE_ADDITIONAL_INCIDENT 這個 JSON 傳入')

  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const statusBlock = src.slice(src.indexOf('export function buildFiveStepStatus('), src.indexOf('export function listReleaseTags('))
  assert.match(statusBlock, /const incidentAuthorization = /, 'merge 的同意判定必須看得到 incident 授權')
  assert.match(statusBlock, /authorizeDeepAuditPublish\(workflow, \{ completedFinalReleases: 1, incident/,
    '而且必須走與 publish **同一支**驗證,不得另寫一份較寬的')
  assert.match(statusBlock, /\|\| Boolean\(incidentAuthorization\)/, 'consentOk 必須真的消費它')
})

test('發布前必須確認「宣告的前一版是某個 consumer 手上真的那一版」', () => {
  // 2026-09-21 真實事故:beta.141 bump 了卻沒發成,beta.142 的鏈宣告「前一版是 beta.141」。
  // WM 裝的是 beta.140 → GOV-UPGRADE-007 → beta.142 發出去了卻沒有 consumer 裝得上,
  // 而且要等到發布完、第 5 步失敗才看得見。發布前就量得到,所以就在發布前量。
  const wm = (v) => ({ repository: 'ajenchen/work-management', version: v })
  const tpl = (v) => ({ repository: 'ajenchen/ds-product-template', version: v })

  // 事故當時那一格:宣告 141,兩個 consumer 都在 140 → 必須紅
  assert.equal(lifecycleChainReachesAConsumer({
    declaredPreviousVersion: '0.1.0-beta.141', installedVersions: [wm('0.1.0-beta.140'), tpl('0.1.0-beta.140')],
  }).ok, false, '沒有任何 consumer 裝著宣告的那一版 → 擋')

  // 復原那一格:宣告 140,WM 在 140、template 在 142 → 必須綠
  //(**這一格是第一版的閘會誤擋的**:它拿「線上最新已發布 = 142」當基準,
  //  而 142 正是那個沒人裝得上的版本 —— 同一條 M37 又一次。)
  assert.equal(lifecycleChainReachesAConsumer({
    declaredPreviousVersion: '0.1.0-beta.140', installedVersions: [wm('0.1.0-beta.140'), tpl('0.1.0-beta.142')],
  }).ok, true, '有 consumer 裝著宣告的那一版 → 放行')

  // 正常情況:大家都在同一版
  assert.equal(lifecycleChainReachesAConsumer({
    declaredPreviousVersion: '0.1.0-beta.142', installedVersions: [wm('0.1.0-beta.142'), tpl('0.1.0-beta.142')],
  }).ok, true)

  // 讀不到不得當成相符(M37 第八種形狀)
  assert.equal(lifecycleChainReachesAConsumer({ declaredPreviousVersion: null, installedVersions: [wm('0.1.0-beta.140')] }).ok, null)
  assert.equal(lifecycleChainReachesAConsumer({ declaredPreviousVersion: '0.1.0-beta.140', installedVersions: [] }).ok, null)
  assert.equal(lifecycleChainReachesAConsumer({ declaredPreviousVersion: '0.1.0-beta.140', installedVersions: [wm(null)] }).ok, null)

  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /lifecycleChainReachesAConsumer\(/, '發布步驟必須真的呼叫它')
  assert.match(publishBlock, /installedConsumerVersion\(target\)/, '而且量的必須是 consumer 實際安裝的版本')
  assert.match(publishBlock, /chain\.ok !== false/, '接不上必須擋')
  assert.match(publishBlock, /chain\.ok !== null/, '讀不到也必須擋')
  assert.match(publishBlock, /--last-published/, '訊息必須給出可執行的修法')
  // 宣告值必須從 consumer 升級交易真正比對的那個欄位來(#147 有、#148 改寫時漏掉,2026-09-22 稽核抓回)
  const declared = src.slice(src.indexOf('function declaredPreviousReleaseVersion('), src.indexOf('function releaseRepository('))
  assert.match(declared, /ds-canonical\/fork\/manifest\.json/, '必須讀 fork corpus manifest')
  assert.match(declared, /providerLifecycle\?\.immutableHead\?\.releaseVersion/, '必須讀 immutableHead.releaseVersion')
  assert.doesNotMatch(publishBlock, /lastPublishedVersion/,
    '不得退回拿「線上最新已發布版」當 consumer 手上那一版 —— 發布了卻沒人裝得上時兩者會分開')
  // 安裝版本必須從 consumer 的 lock 讀,不是猜
  const installed = src.slice(src.indexOf('function installedConsumerVersion('), src.indexOf('function consumerPackageReadback('))
  assert.match(installed, /readConsumerLock\(target\)/, '必須讀 consumer 的 lock')
  assert.match(installed, /node_modules\/@qijenchen\/design-system/, '讀的必須是實際安裝的那個條目')
})

test('排程監看的紅燈要有觀眾 —— 發布報告必須印出最新一次視覺回歸週跑的結論,但不得擋發布', () => {
  // 2026-09-22 實證:visual-regression.yml 從 8/12 起連紅六週(runner 映像 20260720 → 20260810 → 20260907,
  // 字型漂移、baseline 停在 7/28),沒有任何人看見 —— 它只排程、不進 PR。紅燈沒有觀眾等於沒有燈。
  assert.deepEqual(classifyScheduledMonitorRun({ status: 'completed', conclusion: 'success', created_at: '2026-08-05T03:23:00Z' }),
    { verdict: 'green', detail: '2026-08-05 綠' })
  assert.equal(classifyScheduledMonitorRun({ status: 'completed', conclusion: 'failure', created_at: '2026-09-16T03:23:00Z' }).verdict, 'red')
  assert.equal(classifyScheduledMonitorRun({ status: 'completed', conclusion: 'timed_out', created_at: '2026-09-16T03:23:00Z' }).verdict, 'red')
  // 讀不到 / 還在跑 → unknown,不得講成綠也不得講成紅(M37 第八種形狀)
  assert.equal(classifyScheduledMonitorRun(null).verdict, 'unknown')
  assert.equal(classifyScheduledMonitorRun({ status: 'in_progress', conclusion: null, created_at: '2026-09-22T03:23:00Z' }).verdict, 'unknown')
  assert.equal(classifyScheduledMonitorRun({ status: 'completed', conclusion: 'neutral' }).verdict, 'unknown')

  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const reportBlock = src.slice(src.indexOf('function printReport('), src.indexOf('function waitForRun('))
  assert.match(reportBlock, /classifyScheduledMonitorRun\(latestScheduledMonitorRun\(observation\.repository, 'visual-regression\.yml'\)\)/,
    'printReport 必須真的去讀最新一次週跑')
  assert.match(reportBlock, /每週視覺回歸監看/, '而且必須印給人看')
  // 只講不擋:五步 status 表不得含它,runner 也不得因它 invariant
  const statusBlock = src.slice(src.indexOf('export function buildFiveStepStatus('), src.indexOf('export function listReleaseTags('))
  assert.doesNotMatch(statusBlock, /visual-regression|ScheduledMonitor/, '排程監看不得進五步判定(canonical:preview/canary/監看一律 non-blocking)')
  const runnerBlock = src.slice(src.indexOf('export function executeAutomaticRelease('), src.indexOf('function main('))
  assert.doesNotMatch(runnerBlock, /invariant\([^\n]*(visualMonitor|ScheduledMonitor)/, 'runner 不得因監看結論丟錯')
})

test('「被取消 / 逾時」不是「失敗」—— 兩者都擋發布,但講錯原因會把人送去修不存在的問題', () => {
  // 2026-09-21 實測:main 的 CI 有一個瀏覽器 job 跑 15.2 分撞到 15 分的 timeout-minutes,
  // GitHub 回 `cancelled`;13 個 job 全綠。閘印的卻是「CI 是紅的…先修 main 再發」,
  // 而且「紅的項目」一個都篩不出來 —— 因為報告端自己寫了一份比判定端更窄的條件。
  // 兩份平行實作必然漂移,而漂移的那一次正是最需要線索的那一次。
  const red = [
    { bucket: 'fail' }, { state: 'FAILURE' }, { state: 'error' },
    { conclusion: 'failure' }, { conclusion: 'cancelled' }, { conclusion: 'timed_out' },
    { conclusion: 'action_required' }, { conclusion: 'startup_failure' }, { bucket: 'cancel' },
  ]
  for (const row of red) assert.equal(rollupRowIsRed(row), true, `應判為紅:${JSON.stringify(row)}`)
  // 另一面:綠的、跳過的、還在跑的都不是紅 —— 否則閘會指控不存在的問題
  for (const row of [{ bucket: 'pass' }, { bucket: 'skipping' }, { state: 'SUCCESS' }, { conclusion: 'success' }, { conclusion: 'neutral' }, { conclusion: 'skipped' }, { bucket: 'pending' }, {}]) {
    assert.equal(rollupRowIsRed(row), false, `不該判為紅:${JSON.stringify(row)}`)
  }
  // 「沒有裁決」的子集:被取消 / 逾時
  for (const row of [{ bucket: 'cancel' }, { conclusion: 'cancelled' }, { conclusion: 'timed_out' }]) {
    assert.equal(rollupRowIsAborted(row), true, `應判為沒有裁決:${JSON.stringify(row)}`)
  }
  for (const row of [{ bucket: 'fail' }, { conclusion: 'failure' }, { state: 'error' }, { conclusion: 'startup_failure' }]) {
    assert.equal(rollupRowIsAborted(row), false, `真失敗不得被當成沒有裁決:${JSON.stringify(row)}`)
  }

  // 報告端與判定端必須用**同一個**述詞,不得再各寫一份
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /mainRows\.filter\(rollupRowIsRed\)/, '報告端必須用判定端同一個述詞篩紅的項目')
  assert.match(publishBlock, /redRows\.every\(rollupRowIsAborted\)/, '必須分辨「全部都是被取消/逾時」= 沒有裁決')
  assert.match(publishBlock, /沒有裁決/, '訊息必須講出是「沒有裁決」而不是「壞了」')
  assert.match(publishBlock, /重跑那一輪 CI/, '而且要講出正解是重新取得裁決,不是去修 main')
  const rollupStart = src.indexOf('function checkRollupStatus(')
  const rollupFn = src.slice(rollupStart, src.indexOf('export function selectPublishRun(', rollupStart))
  // 切片非空本身要先成立 —— 邊界寫錯會切出空字串,而空字串配 assert.match 只會給一句
  // 看不出原因的失敗(這一格本身在 2026-09-21 就這樣自摔過一次:packageVersion 在檔案裡
  // 出現在 checkRollupStatus **之前**,indexOf 回的位置比起點小,切出空的)。
  assert.ok(rollupFn.length > 100, `切不出 checkRollupStatus 的本體(長度 ${rollupFn.length})—— 斷言的邊界寫錯了,不是程式壞了`)
  assert.match(rollupFn, /rollup\.some\(rollupRowIsRed\)/, 'checkRollupStatus 也必須用同一支,不得留下第二份實作')
})

test('發布這一步看的是「守護 main 的 CI」,不含發布流程自己派出的那一輪', () => {
  // 2026-09-21 實測:一次失敗的發布,它的 check-run 就掛在同一個 main commit 上,
  // 於是這道閘讀到 failed 並印出「protected main 的 CI 是紅的」——而 main 的 CI 其實是
  // success,紅的是發布流程自己。後果有兩層:(1) 一次失敗就讓 main 永久紅、之後再也
  // 發不出去(自鎖);(2) 它指控了一個不存在的問題,比沉默更貴。
  const runs = [
    { name: 'CI', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success' },
    { name: 'Release', path: '.github/workflows/release.yml', status: 'completed', conclusion: 'failure' },
    { name: 'Deploy Storybook', path: '.github/workflows/deploy-storybook.yml', status: 'completed', conclusion: 'success' },
  ]
  const guarding = filterOutPublishWorkflowRuns(runs, workflow.automation.publishWorkflow.file)
  assert.deepEqual(guarding.map(run => run.name), ['CI', 'Deploy Storybook'],
    '發布流程自己的 run 必須被排除,否則失敗一次就自鎖')
  // 另一面:守護 main 的 CI 真的紅時,必須留在集合裡讓閘紅 —— 不可連真警報一起濾掉
  const ciRed = filterOutPublishWorkflowRuns(
    [{ name: 'CI', path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'failure' }],
    workflow.automation.publishWorkflow.file,
  )
  assert.deepEqual(ciRed.map(run => run.name), ['CI'], '真正的 CI 紅燈不得被濾掉')

  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  // runner 必須真的在衝突時丟錯,否則狀態表多一格而空轉照舊
  const prBlock = src.slice(src.indexOf("if (incomplete.id === 'pr-checks')"), src.indexOf("if (incomplete.id === 'merge')"))
  assert.match(prBlock, /incomplete\.status !== 'conflicting'/, 'runner 必須在衝突時 fail closed,不得繼續每兩秒重試')
  assert.match(prBlock, /git merge origin\//, '訊息必須給出不需要 force 的解法')

  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /protectedMainCiRows\(workflow, observation\.repository, observation\.protectedMainSha\)/,
    'publish 必須用排除過發布流程的那份 row,不得直接用該 commit 上所有 check-run')
  assert.match(publishBlock, /紅的項目/, '閘紅的時候必須講出是哪一項紅,否則又是指控不存在的問題')

  // 帳本只能算**真的發出去**的版本:一次被中斷或失敗的嘗試不得燒掉一份發版同意
  //(2026-09-21 實測:帳本寫了 beta.141,而線上既沒有 release、npm 也沒有)。
  assert.match(publishBlock, /\.filter\(v => releaseCountsAsPublished\(observation\.repository, `v\$\{v\}`\)\)/,
    '帳本的每一筆必須對線上實況,否則失敗的嘗試會讓使用者被迫再說一次「發版」')
})

test('版號沒 bump 不得報五步完成 —— 而且那兩個 sha 真的是 collectLiveObservation 算出來的', () => {
  // 2026-09-21 實測(M37 第十種形狀):merge 把 4 個 commit 併進 protected main,版號沒 bump,
  // 於是 observation.tag 指向這次工作之前就發布好的 v0.1.0-beta.140 —— publish/readback/consumer
  // 三步全報 complete、release:auto exit 0,npm 上卻還是 9/20 那一版。判定表在上面那支測試,
  // 這裡鎖的是**參數邊界**:判定所需的兩個值,在正式流程裡確實有人算、也確實被消費。
  const src = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
  const observeBlock = src.slice(src.indexOf('export function collectLiveObservation('), src.indexOf('export function publishedBaselineRef('))
  assert.match(observeBlock, /tagCommitSha,/, 'observation 必須帶 tagCommitSha,否則判定式永遠拿到 undefined = 恆判 stale')
  assert.match(observeBlock, /protectedMainSha: main\?\.sha \|\| null/, 'observation 必須帶 protected main 的 head')

  const statusBlock = src.slice(src.indexOf('export function buildFiveStepStatus('), src.indexOf('export function listReleaseTags('))
  assert.match(statusBlock, /observation\.tagCommitSha === observation\.protectedMainSha/,
    'publish 必須直接比「tag 指向的 commit」與「protected main 的 head」,不得只看版號字串有沒有對應的 release')
  assert.doesNotMatch(statusBlock, /const readback = publishedRelease/,
    'readback 不得回頭讀 publishedRelease —— 那會讓假綠在步驟之間傳染')

  const publishBlock = src.slice(src.indexOf("if (incomplete.id === 'publish')"), src.indexOf("if (incomplete.id === 'readback')"))
  assert.match(publishBlock, /incomplete\.status !== 'stale-version'/,
    'runner 必須在 stale-version 丟錯 fail closed,不能只是狀態表上紅一格然後照樣往下跑')
})

test('發布授權與記帳是**行為**,不是字串比對 —— 一行 false 就關掉而測試全綠是不行的', () => {
  // 2026-09-21 對抗稽核:先前只有 assert.match(src, /authorizeDeepAuditPublish\(/),
  // 把呼叫包成 `false && authorizeDeepAuditPublish(...)` 照樣綠;recordConsentRelease
  // 包成 `if (false)` 也照樣綠 —— 帳本永遠空,上一條閘就永遠沒機會紅。改成在沙箱真的讀寫。
  //
  // **不使用動態 import**:治理 harness runner 禁止動態載入,而收據目錄已改成每次讀環境變數
  //(consentDir()),所以設好 env 直接呼叫既有匯出即可。
  const sandbox = mkdtempSync(join(tmpdir(), 'publish-authz-'))
  const previous = process.env.GOVERNANCE_RELEASE_CONSENT_DIR
  process.env.GOVERNANCE_RELEASE_CONSENT_DIR = resolve(sandbox, 'consent')
  mkdirSync(process.env.GOVERNANCE_RELEASE_CONSENT_DIR, { recursive: true })
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], { cwd: ROOT, encoding: 'utf8' }).trim()
    const receipt = writeReleaseConsent({ headSha: head, branch: 'claude/authz', quote: '發版', source: 'test' })
    assert.deepEqual(consentReleaseLedger(receipt.authorizationId), [])
    assert.equal(authorizeDeepAuditPublish(workflow, { completedFinalReleases: 0 }).authorization, 'final-release')

    recordConsentRelease('0.1.0-beta.996', receipt.authorizationId)
    assert.deepEqual(consentReleaseLedger(receipt.authorizationId), ['0.1.0-beta.996'],
      'recordConsentRelease 必須真的留下紀錄,否則「一份授權一次發布」永遠沒機會紅')

    assert.throws(() => authorizeDeepAuditPublish(workflow, { completedFinalReleases: 1 }), /incident/i)
  } finally {
    if (previous === undefined) delete process.env.GOVERNANCE_RELEASE_CONSENT_DIR
    else process.env.GOVERNANCE_RELEASE_CONSENT_DIR = previous
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('預覽可見集合不得退回 2026-09-20 修掉的破口', () => {
  // 那次的破口:集合只算 packages/<pkg>/src,漏掉 .storybook/ 與 apps/**/*.stories.tsx,
  // 於是改了畫面卻不重新確認。**驗行為不驗字串** —— 我第一版比對原始碼裡的 `.storybook`,
  // 而程式寫的是跳脫過的 `\.storybook`,當場自己紅(2026-09-21)。
  const hit = (path) => PRODUCT_VISIBLE.some((re) => re.test(path))
  for (const p of [
    'packages/design-system/src/components/Button/button.tsx',
    'packages/design-system/src/tokens/semantic.css',
    'packages/design-system/src/components/Button/button.stories.mdx',
    '.storybook/preview.ts',
    '.storybook/theme.css',
    'apps/work/src/pages/work-items/work-items.stories.tsx',
  ]) assert.ok(hit(p), `${p} 是預覽看得見的,漏掉就是 2026-09-20 那個破口`)
  for (const p of [
    'packages/design-system/package.json',
    'scripts/release-orchestrator.mjs',
    'AGENTS.md',
    '.github/workflows/ci.yml',
  ]) assert.equal(hit(p), false, `${p} 不進 bundle,不該讓 user 重新確認`)
})
