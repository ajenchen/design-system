import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  buildStandardDimensionPayloads,
  buildStandardFiveStepReceipt,
  loadStandardCiEvidencePlan,
  standardConsumerSelection,
  validateStandardFiveStepObservation,
  validateStandardFiveStepReceipt,
} from './lib/standard-ci-evidence.mjs'
import { parseStandardCiEvidenceArgs } from './produce-standard-ci-evidence.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const oid = (value) => value.repeat(40)
const hash = (value) => value.repeat(64)
const integrity = (value) => `sha512-${Buffer.alloc(64, value).toString('base64')}`
const clone = (value) => JSON.parse(JSON.stringify(value))

const PRODUCT = 'ajenchen/workspace'
const PRODUCT_ID = 'workspace'

// on-request 的機制還在,但現行設定沒有 consumer 使用(它是為 work-management 加的,該 repo 已於 2026-11-25 退場)。
// 這些測試原本直接拿真實設定驗 on-request;現在改成一份只改一格的設定副本(產品 consumer 標成 on-request、合併歸
// orchestrator),其餘檔案原樣複製 —— validator 從 repoRoot 讀設定,所以要給它一個完整的根目錄,不是只改記憶體裡的物件。
let onRequestRootCache
function onRequestRoot() {
  if (onRequestRootCache) return onRequestRootCache
  const root = mkdtempSync(join(tmpdir(), 'five-step-on-request-'))
  process.on('exit', () => rmSync(root, { recursive: true, force: true }))
  const { plan } = loadStandardCiEvidencePlan({ repoRoot: ROOT })
  for (const path of [
    'scripts/standard-ci-evidence-plan.json',
    'scripts/schemas/standard-ci-evidence-observation.schema.json',
    plan.workflowPlan,
    'infra/governance/inventory/managed-repos.json',
    'infra/governance/desired/github.json',
    'packages/design-system/package.json',
    'packages/governance/package.json',
    'packages/storybook-config/package.json',
    plan.dimensions[1].workflow,
  ]) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    copyFileSync(resolve(ROOT, path), resolve(root, path))
  }
  const workflowPath = resolve(root, plan.workflowPlan)
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
  const product = workflow.automation.consumers.find((target) => target.repository === PRODUCT)
  product.upgrade = 'on-request'
  delete product.merge
  writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`)
  onRequestRootCache = root
  return root
}

// `requested` = 這次發版 user 要求升級的 on-request consumer(RELEASE_REQUESTED_CONSUMERS);`root` = 設定從哪個根目錄讀。
// 預設 = 現行設定:只有 template 交升級證據,產品 canary(merge: consumer-owned)記成 consumerOwned。
function fixture({ requested = [], root = ROOT } = {}) {
  const { plan, planSha256 } = loadStandardCiEvidencePlan({ repoRoot: root })
  const inventory = JSON.parse(readFileSync(resolve(root, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(root, 'infra/governance/desired/github.json'), 'utf8'))
  const workflow = JSON.parse(readFileSync(resolve(root, plan.workflowPlan), 'utf8'))
  const selection = standardConsumerSelection({ plan, workflow, inventory, desired, requested })
  const selectedIds = new Set(selection.selected.map(({ repo }) => repo.id))
  const head = oid('1')
  const tree = oid('2')
  const commit = oid('3')
  const baseHead = oid('4')
  const activeRun = {
    manifestSha256: hash('a'),
    manifest: { runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', head, tree },
  }
  const versionRows = Object.entries({
    '@qijenchen/design-system': 'packages/design-system/package.json',
    '@qijenchen/governance': 'packages/governance/package.json',
    '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
  }).map(([name, manifestPath], index) => ({
    name,
    manifestPath,
    version: JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')).version,
    integrity: integrity(index + 1),
    shasum: String(index + 1).repeat(40),
  }))
  const version = versionRows[0].version
  const authority = inventory.repositories.find((repo) => repo.id === plan.authority.repositoryId)
  const authorityProfile = desired.profiles[authority.desiredProfile]
  const authorityCheckPolicy = authorityProfile.requiredChecks[0]
  const action = desired.integrations.githubActions
  const workflowRun = (repository, path, event, runId, headSha) => ({
    repository, path, event, runId: String(runId), runAttempt: 1, headSha, status: 'completed', conclusion: 'success',
  })
  const check = (repository, policy, runId, checkHead, workflowHead = checkHead) => ({
    name: policy.context,
    headSha: checkHead,
    status: 'completed',
    conclusion: 'success',
    appId: action.id,
    appSlug: action.slug,
    workflowRun: workflowRun(repository, policy.workflow, policy.requiredEvents[0], runId, workflowHead),
  })
  const releaseRun = workflowRun(authority.github, plan.dimensions[0].workflow, 'repository_dispatch', 640, commit)
  const mirrorRun = workflowRun(authority.github, plan.dimensions[1].workflow, 'repository_dispatch', 660, commit)
  const mirrorBytes = readFileSync(resolve(root, plan.dimensions[1].workflow))
  const mirrorBlob = createHash('sha1').update(`blob ${mirrorBytes.length}\0`).update(mirrorBytes).digest('hex')
  const npm = versionRows.map((item) => ({
    name: item.name,
    version,
    integrity: item.integrity,
    shasum: item.shasum,
    tarball: `https://registry.npmjs.org/${item.name.replace('/', '%2f')}/-/${item.name.split('/')[1]}-${version}.tgz`,
    attestationUrl: `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(item.name)}@${version}`,
    provenancePredicate: 'https://slsa.dev/provenance/v1',
    provenancePayloadSha256: hash(String(versionRows.indexOf(item) + 4)),
    repository: authority.github,
    workflow: '.github/workflows/release.yml',
    workflowRef: 'refs/heads/main',
    gitCommit: commit,
    builderId: 'https://github.com/actions/runner/github-hosted',
  }))
  const npmByName = new Map(npm.map((item) => [item.name, item]))
  const consumers = plan.consumers.map((planned, index) => {
    const repo = inventory.repositories.find((item) => item.id === planned.repositoryId)
    const profile = desired.profiles[repo.desiredProfile]
    const policy = profile.requiredChecks[0]
    const releaseTarget = workflow.automation.consumers.find((target) => target.repository === repo.github)
    const receiptPolicy = {
      context: releaseTarget.requiredCheck.context,
      workflow: releaseTarget.requiredCheck.producerWorkflow,
      requiredEvents: [releaseTarget.requiredCheck.producerEvent],
    }
    const prHead = oid(String(index + 5))
    const consumerCommit = oid(String(index + 7))
    const consumerTree = oid(index === 0 ? '9' : 'a')
    const consumerBase = oid(index === 0 ? 'b' : 'c')
    const packageNames = releaseTarget.packages
    return {
      repositoryId: repo.id,
      role: repo.role,
      repository: repo.github,
      defaultBranch: repo.defaultBranch,
      protectedMain: { head: consumerCommit, tree: consumerTree },
      sourcePullRequest: {
        number: index + 10,
        state: 'closed',
        mergedAt: '2026-08-02T00:00:00.000Z',
        head: prHead,
        headTree: oid(index === 0 ? 'd' : 'e'),
        mergeCommit: consumerCommit,
        mergeTree: consumerTree,
        baseRef: repo.defaultBranch,
        baseHead: consumerBase,
        title: `chore: release ${version}`,
        body: `Generated from ${version} at ${commit}.`,
      },
      sourceWorkflow: planned.role === 'template-mirror'
        ? mirrorRun
        : workflowRun(repo.github, planned.sourceWorkflow, 'repository_dispatch', 670, consumerBase),
      packageLock: {
        path: 'package-lock.json',
        sha256: hash(index === 0 ? 'd' : 'e'),
        packages: packageNames.map((name) => ({
          name,
          version,
          integrity: npmByName.get(name).integrity,
          resolved: npmByName.get(name).tarball,
        })),
      },
      auditWorkflow: { path: policy.workflow, contentSha256: policy.workflowIdentity.contentSha256, gitBlobSha: policy.workflowIdentity.gitBlobSha },
      requiredCheck: check(
        repo.github,
        receiptPolicy,
        index + 680,
        prHead,
        releaseTarget.requiredCheck.producerHead === 'pull-request-base' ? consumerBase : prHead,
      ),
    }
  }).filter((item) => selectedIds.has(item.repositoryId))
  const observation = {
    schemaVersion: 1,
    kind: 'standard-five-step-live-ci-observation',
    profile: workflow.profile,
    planSha256,
    observedAt: '2026-08-02T00:00:00.000Z',
    runBinding: { runId: activeRun.manifest.runId, manifestSha256: activeRun.manifestSha256, head, tree },
    authority: {
      repository: authority.github,
      defaultBranch: authority.defaultBranch,
      pullRequest: { number: 1, state: 'closed', mergedAt: '2026-08-02T00:00:00.000Z', head, headTree: tree, mergeCommit: commit, mergeTree: tree, baseRef: authority.defaultBranch, baseHead, title: `release ${version}`, body: `release ${version}` },
      protectedMain: { head: commit, tree },
      requiredCheck: check(authority.github, authorityCheckPolicy, 600, head),
      releaseWorkflow: releaseRun,
      mirrorWorkflow: mirrorRun,
      workflowIdentities: [
        { path: authorityCheckPolicy.workflow, contentSha256: authorityCheckPolicy.workflowIdentity.contentSha256, gitBlobSha: authorityCheckPolicy.workflowIdentity.gitBlobSha },
        { path: plan.dimensions[0].workflow, contentSha256: authorityProfile.tagPolicy.sourceWorkflowIdentity.contentSha256, gitBlobSha: authorityProfile.tagPolicy.sourceWorkflowIdentity.gitBlobSha },
        { path: plan.dimensions[1].workflow, contentSha256: createHash('sha256').update(mirrorBytes).digest('hex'), gitBlobSha: mirrorBlob },
      ],
    },
    release: {
      version,
      tag: `v${version}`,
      tagObject: commit,
      commit,
      tree,
      bomSha256: hash('f'),
      releaseSetSha256: hash('0'),
      releaseTrustEvidenceSha256: null,
      finalizationReceiptSha256: null,
      assets: Array.from({ length: 6 }, (_, index) => ({ name: `asset-${index}`, digest: `sha256:${hash(String(index))}`, size: index + 1 })),
      packages: versionRows,
    },
    npm,
    consumers,
    consumerSelection: { requested: selection.requested, notRequested: selection.notRequested, consumerOwned: selection.consumerOwned },
    dimensions: [
      { dim: 64, capability: plan.dimensions[0].capability, observationRunId: releaseRun.runId },
      { dim: 66, capability: plan.dimensions[1].capability, observationRunId: mirrorRun.runId },
    ],
  }
  return { observation, activeRun, plan }
}

test('standard route accepts the exact five-step repository_dispatch + Verify consumer reality', () => {
  // 產品 consumer 也交「已合併」證據的那條路(repository_dispatch 接收 workflow + PR head 上的 Verify consumer):
  // 現行設定裡產品 canary 的合併歸它自己、不交這份證據,所以這條路用 on-request 設定副本、明確要求升級來驗。
  const root = onRequestRoot()
  const { observation, activeRun } = fixture({ requested: [PRODUCT], root })
  assert.equal(validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), true)
  assert.equal(observation.authority.mirrorWorkflow.event, 'repository_dispatch')
  assert.deepEqual(observation.consumers.map((item) => item.requiredCheck.name), ['Verify consumer', 'Verify consumer'])
  assert.equal(Object.hasOwn(observation, 'candidateRelease'), false)
  assert.equal(Object.hasOwn(observation, 'externalActivation'), false)
  assert.equal(Object.hasOwn(observation, 'completionAttestor'), false)
})

// ── 產品 canary(merge: consumer-owned)── 現行設定 ──────────────────────────────────────────
// 發版只替它開升級 PR,合不合由它自己決定。dim 64/66 的證據因此不得要求它「已合併」(否則稽核會逼人去合併
// 別人的 PR),但也不得讓它從紀錄裡消失。user 2026-11-25 原話:「此外，設計系統 repo 要把 canary 換成
// ajenchen/workspace，換過來之後，設計系統出新版時，這個 repo 也會自動收到升級 PR。」

const CONSUMER_OWNED_RECORD = { repositoryId: PRODUCT_ID, repository: PRODUCT, merge: 'consumer-owned', status: 'pull-request-only-not-a-completion-condition' }

test('現行設定:template 交升級證據;產品 canary 記成 consumer-owned、不交證據,dim 64/66 仍綠', () => {
  const { observation, activeRun, plan } = fixture()
  assert.deepEqual(observation.consumers.map((item) => item.repositoryId), ['ds-product-template'])
  assert.deepEqual(observation.consumerSelection, { requested: [], notRequested: [], consumerOwned: [CONSUMER_OWNED_RECORD] })
  assert.equal(validateStandardFiveStepObservation(observation, { repoRoot: ROOT, activeRun }), true)
  for (const payload of buildStandardDimensionPayloads(observation, plan.dimensions)) {
    assert.equal(validateStandardFiveStepReceipt(payload.receipt, { repoRoot: ROOT, activeRun }), true)
  }
  // 對照組(弄壞判斷式):同一份 observation 拿去對「沒有這個區分」的設定(產品 consumer 的合併歸 orchestrator)驗
  // → 立刻要它的升級證據。證明上面的綠是那個區分給的,不是 validator 根本不看產品 consumer。
  const withoutDistinction = structuredClone(JSON.parse(readFileSync(resolve(ROOT, plan.workflowPlan), 'utf8')))
  delete withoutDistinction.automation.consumers.find((target) => target.repository === PRODUCT).merge
  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(ROOT, 'infra/governance/desired/github.json'), 'utf8'))
  const strict = standardConsumerSelection({ plan, workflow: withoutDistinction, inventory, desired, requested: [] })
  assert.deepEqual(strict.selected.map(({ repo }) => repo.id), ['ds-product-template', PRODUCT_ID])
  assert.deepEqual(strict.consumerOwned, [])
})

for (const [name, mutate, pattern] of [
  ['產品 canary 從紀錄裡默默消失', (value) => { value.consumerSelection.consumerOwned = [] }, /consumer-owned consumer record differs/],
  ['產品 canary 的狀態被改寫成已升級', (value) => { value.consumerSelection.consumerOwned[0].status = 'upgraded' }, /schema validation failed/],
  ['產品 canary 被改記成本次未要求', (value) => {
    value.consumerSelection.consumerOwned = []
    value.consumerSelection.notRequested = [{ repositoryId: PRODUCT_ID, repository: PRODUCT, upgrade: 'on-request', status: 'not-requested-this-release' }]
  }, /not-requested consumer record differs/],
  ['產品 canary 冒出「已合併」的升級證據', (value) => {
    const merged = fixture({ requested: [PRODUCT], root: onRequestRoot() }).observation
    value.consumers.push(merged.consumers.find((item) => item.repositoryId === PRODUCT_ID))
  }, /workspace merges its own upgrade PR \(consumer-owned\) but carries consumer upgrade evidence/],
  ['紀錄少了 consumerOwned 這一欄', (value) => { delete value.consumerSelection.consumerOwned }, /schema validation failed/],
]) {
  test(`產品 canary rejects:${name}`, () => {
    const { observation, activeRun } = fixture()
    mutate(observation)
    assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: ROOT, activeRun }), pattern)
  })
}

// ── on-request(機制保留)── user 2026-11-05 原話:「以後WM的升級都不要自動做除非我有特別要求」──
// dim 64/66 的證據只要求「這次發版實際被選中的 consumer」;選法與 release:auto 第五步同一支實作。
// 修前:validator 對 plan 裡每個 consumer 都要升級證據 → 沒被要求升級的發版 dim 64/66 必紅。

test('consumer 選擇判定表:template 恆選;on-request 的只在 RELEASE_REQUESTED_CONSUMERS 帶了全名時才選', () => {
  const root = onRequestRoot()
  const { plan } = loadStandardCiEvidencePlan({ repoRoot: root })
  const inventory = JSON.parse(readFileSync(resolve(root, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desired = JSON.parse(readFileSync(resolve(root, 'infra/governance/desired/github.json'), 'utf8'))
  const workflow = JSON.parse(readFileSync(resolve(root, plan.workflowPlan), 'utf8'))
  const pick = (requested) => {
    const selection = standardConsumerSelection({ plan, workflow, inventory, desired, requested })
    return { selected: selection.selected.map(({ repo }) => repo.id), notRequested: selection.notRequested.map((item) => `${item.repositoryId}:${item.upgrade}:${item.status}`) }
  }
  assert.deepEqual(pick([]), { selected: ['ds-product-template'], notRequested: [`${PRODUCT_ID}:on-request:not-requested-this-release`] })
  assert.deepEqual(pick([PRODUCT]), { selected: ['ds-product-template', PRODUCT_ID], notRequested: [] })
  // 要求只認 repository 全名;簡稱 / 打錯 → 丟錯並點名,不得靜默記成「本次未要求」
  assert.throws(() => pick([PRODUCT_ID]), new RegExp(`unknown consumer repositories: ${PRODUCT_ID}`))
  assert.throws(() => standardConsumerSelection({ plan, workflow, inventory, desired, requested: [''] }), /requested consumer list is invalid/)
  assert.throws(() => standardConsumerSelection({ plan, workflow, inventory, desired, requested: PRODUCT }), /requested consumer list is invalid/)
})

test('on-request 沒被要求:不要求它的升級證據,dim 64/66 仍綠,且記成本次未要求升級', () => {
  const root = onRequestRoot()
  const { observation, activeRun, plan } = fixture({ root })
  assert.deepEqual(observation.consumers.map((item) => item.repositoryId), ['ds-product-template'], '沒要求就不得有它的升級證據')
  assert.deepEqual(observation.consumerSelection, {
    requested: [],
    notRequested: [{ repositoryId: PRODUCT_ID, repository: PRODUCT, upgrade: 'on-request', status: 'not-requested-this-release' }],
    consumerOwned: [],
  })
  assert.equal(validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), true)
  const payloads = buildStandardDimensionPayloads(observation, plan.dimensions)
  for (const payload of payloads) assert.equal(validateStandardFiveStepReceipt(payload.receipt, { repoRoot: root, activeRun }), true)
})

test('on-request 被要求升級:缺它的升級證據就紅,且指名', () => {
  const root = onRequestRoot()
  const { observation, activeRun } = fixture({ requested: [PRODUCT], root })
  observation.consumers = observation.consumers.filter((item) => item.repositoryId !== PRODUCT_ID)
  assert.throws(
    () => validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }),
    /workspace is selected for this release \(on-request\) but has no consumer upgrade evidence/,
  )
})

test('template(automatic)不論有沒有要求,缺證據都紅', () => {
  const root = onRequestRoot()
  for (const [requested, pattern] of [
    // 沒要求產品 consumer 時 template 是唯一的 consumer:拿掉它 = 零筆 consumer 證據,schema 先擋(不准空集合假綠)
    [[], /data\/consumers must NOT have fewer than 1 items/],
    [[PRODUCT], /ds-product-template is selected for this release \(automatic\) but has no consumer upgrade evidence/],
  ]) {
    const { observation, activeRun } = fixture({ requested, root })
    observation.consumers = observation.consumers.filter((item) => item.repositoryId !== 'ds-product-template')
    assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), pattern)
  }
  // 現行設定(產品 canary 不交證據)同樣:template 的證據不見 = 零筆,不得假綠
  const { observation, activeRun } = fixture()
  observation.consumers = []
  assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: ROOT, activeRun }), /data\/consumers must NOT have fewer than 1 items/)
})

for (const [name, mutate, pattern] of [
  ['沒被要求的 consumer 從紀錄裡默默消失', (value) => { value.consumerSelection.notRequested = [] }, /not-requested consumer record differs/],
  ['沒被要求的 consumer 狀態被改寫', (value) => { value.consumerSelection.notRequested[0].status = 'upgraded' }, /schema validation failed/],
  ['沒被要求的 consumer 冒出升級證據', (value) => {
    const requested = fixture({ requested: [PRODUCT], root: onRequestRoot() }).observation
    value.consumers.push(requested.consumers.find((item) => item.repositoryId === PRODUCT_ID))
  }, /workspace was not requested for this release but carries consumer upgrade evidence/],
  ['紀錄聲稱有要求,卻沒有它的證據', (value) => { value.consumerSelection.requested = [PRODUCT] }, /not-requested consumer record differs/],
  ['consumer 證據重複', (value) => { value.consumers.push(clone(value.consumers[0])) }, /consumer closure contains a duplicate repository/],
]) {
  test(`on-request 未要求時 rejects:${name}`, () => {
    const root = onRequestRoot()
    const { observation, activeRun } = fixture({ root })
    mutate(observation)
    assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), pattern)
  })
}

test('on-request 被要求時 rejects:仍被記成本次未要求', () => {
  const root = onRequestRoot()
  const { observation, activeRun } = fixture({ requested: [PRODUCT], root })
  observation.consumerSelection.notRequested = [{ repositoryId: PRODUCT_ID, repository: PRODUCT, upgrade: 'on-request', status: 'not-requested-this-release' }]
  assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), /not-requested consumer record differs/)
})

test('observer 與 validator 都消費同一支選法(不得各寫一份)', () => {
  const observer = readFileSync(resolve(ROOT, 'scripts/lib/standard-ci-evidence-live-observer.mjs'), 'utf8')
  const validator = readFileSync(resolve(ROOT, 'scripts/lib/standard-ci-evidence.mjs'), 'utf8')
  assert.match(validator, /from '\.\/release-consumer-selection\.mjs'/)
  assert.match(observer, /from '\.\/release-consumer-selection\.mjs'/)
  assert.match(observer, /requestedConsumersFromEnv\(options\.env \?\? process\.env\)/, 'observer 必須用 release:auto 同一支解析讀 RELEASE_REQUESTED_CONSUMERS')
  assert.match(observer, /standardConsumerSelection\(\{ plan, workflow, inventory, desired, requested: requestedConsumers \}\)/)
  assert.match(observer, /of consumerSelection\.selected\)/, 'observer 只能對被選中的 consumer 做網路讀回')
  assert.doesNotMatch(observer, /of plan\.consumers\)/, 'observer 不得直接對 plan 裡全部 consumer 做讀回')
  assert.match(observer, /notRequested: consumerSelection\.notRequested/, '沒被選中的 consumer 必須寫進 observation')
  assert.match(observer, /consumerOwned: consumerSelection\.consumerOwned/, '合併由它自己決定的 consumer 必須寫進 observation')
  assert.match(validator, /else if \(consumerBlocksRelease\(releaseTarget\)\)/, '要不要交「已合併」證據只能問 release-consumer-selection.mjs 那一支')
  for (const source of [observer, validator]) assert.doesNotMatch(source, /\.merge \?\? 'automatic'|=== 'consumer-owned'/, '合併歸屬的判定不得在這裡另寫一份')
  for (const source of [observer, validator]) {
    assert.doesNotMatch(source, /\.upgrade \?\? 'automatic'|RELEASE_REQUESTED_CONSUMERS \?\?|env\.RELEASE_REQUESTED_CONSUMERS/, '選法只能住在 release-consumer-selection.mjs')
  }
})

test('dim 64 and dim 66 share one exact observation digest', () => {
  const { observation, activeRun, plan } = fixture()
  const payloads = buildStandardDimensionPayloads(observation, plan.dimensions)
  assert.equal(payloads[0].receipt.observationSha256, payloads[1].receipt.observationSha256)
  assert.equal(validateStandardFiveStepReceipt(payloads[0].receipt, { repoRoot: ROOT, activeRun }), true)
  const poisoned = clone(payloads[1].receipt)
  poisoned.observation.authority.mirrorWorkflow.event = 'workflow_run'
  assert.throws(() => validateStandardFiveStepReceipt(poisoned, { repoRoot: ROOT, activeRun }), /digest\/shape differs/)
})

for (const [name, mutate, pattern] of [
  ['candidate/external/attestor residue', (value) => { value.candidateRelease = {}; value.externalActivation = {}; value.completionAttestor = {} }, /schema validation failed/],
  ['PR tree differs from tag tree', (value) => { value.authority.pullRequest.mergeTree = oid('9') }, /one exact identity/],
  ['mirror event regresses to workflow_run', (value) => { value.authority.mirrorWorkflow.event = 'workflow_run' }, /mirror workflow run identity differs/],
  ['consumer check regresses to audit', (value) => { value.consumers[0].requiredCheck.name = 'audit' }, /required check identity differs/],
  ['npm differs from BOM', (value) => { value.npm[0].integrity = integrity(9) }, /release\/BOM\/npm\/provenance identity differs/],
  ['consumer lock differs from npm', (value) => { value.consumers[1].packageLock.packages[0].resolved = 'https://registry.npmjs.org/wrong.tgz' }, /exact package lock differs/],
]) {
  test(`standard route rejects ${name}`, () => {
    // 產品 consumer 也交證據的情境(on-request 設定副本、明確要求升級):兩個 consumer 的證據路徑都要被這張表碰到
    const root = onRequestRoot()
    const { observation, activeRun } = fixture({ requested: [PRODUCT], root })
    mutate(observation)
    assert.throws(() => validateStandardFiveStepObservation(observation, { repoRoot: root, activeRun }), pattern)
  })
}

test('standard CLI has no staging or import ceremony', () => {
  assert.deepEqual(parseStandardCiEvidenceArgs(['--observe', '--allow-network']), { observe: true, 'allow-network': true })
  assert.throws(() => parseStandardCiEvidenceArgs(['--observe', '--allow-network', '--staging-dir']), /unknown/)
  assert.throws(() => parseStandardCiEvidenceArgs(['--import']), /unknown/)
  assert.throws(() => parseStandardCiEvidenceArgs(['--observe']), /requires --allow-network/)
})

test('standard receipt rejects unsigned post-observation substitution', () => {
  const { observation, activeRun } = fixture()
  const receipt = buildStandardFiveStepReceipt(observation)
  receipt.observation.release.bomSha256 = hash('8')
  assert.throws(() => validateStandardFiveStepReceipt(receipt, { repoRoot: ROOT, activeRun }), /digest\/shape differs/)
})
