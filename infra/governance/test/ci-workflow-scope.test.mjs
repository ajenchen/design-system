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
  // 2026-09-08:單一 verify job 連兩次 15 分鐘逾時被取消(瀏覽器閘 586 秒 + 治理檢查 249 秒 + 安裝與 build)。
  // 拆成三個平行 job;required check 的 context 名字不變,由 `verify` fan-in:它必須 `if: always()` 並明確檢查
  // 每個上游的 result —— GitHub 把 skipped 的 required check 當通過,上游紅了若讓 fan-in 被 skip 就等於沒閘。
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['hooks-linux', 'verify', 'verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-interaction', 'verify-static'])
  assert.equal(workflow.jobs.verify.name, 'Verify(tsc + tests + compile + build)')
  assert.equal(workflow.jobs.verify.timeoutMinutes, 15)
  assert.equal(workflow.jobs.verify.if, 'always()')
  assert.deepEqual([...workflow.jobs.verify.needs].sort(), ['verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-interaction', 'verify-static'])
  // 解析器只留 runSha256 與 env(不留 run 原文):上游 result 必須經 env 進來,再由原始文字驗它們全部 = success 才過。
  const fanInEnv = JSON.stringify(workflow.jobs.verify.steps[0].env)
  // 2026-09-11:兩個 DataTable job 的上限 15 → 25。那天 `verify-browser-datatable` 跑到 15.4 分被砍掉
  // (砍掉的那次每一項判定其實都是綠的),原因是同一天把快速捲動閘 `--runs` 2→3、感知閘重跑上限 3→5 ——
  // 自己加的工作量,不是機器變慢。逾時本身不是品質訊號,但**上限仍是契約**:只有這兩個 job 可以到 25,
  // 其餘一律 15,而且沒有任何 job 可以超過 25(否則就不再是「快速 deterministic 範圍」了)。
  const SLOW_BROWSER_JOBS = new Set(['verify-browser-datatable', 'verify-browser-datatable-dpr2'])
  for (const upstream of ['verify-static', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-interaction', 'verify-browser-agent']) {
    assert.match(fanInEnv, new RegExp(`needs\\.${upstream}\\.result`))
    assert.equal(workflow.jobs[upstream].timeoutMinutes, SLOW_BROWSER_JOBS.has(upstream) ? 25 : 15)
    assert.equal(workflow.jobs[upstream].if, null)
    assert.equal(workflow.jobs[upstream].needs, null)
  }
  assert.match(source, /\[ "\$STATIC" = success \] && \[ "\$BROWSER_DT" = success \] && \[ "\$BROWSER_DT2" = success \] && \[ "\$BROWSER_UI" = success \] && \[ "\$BROWSER_AGENT" = success \]/)
  // The shell hooks only ever ran on macOS, which is how BSD-only `stat -c` / `date -d` fallbacks
  // shipped to Linux cloud sessions. This job is their Linux regression gate; it stays inside the
  // fast PR scope and stays out of `verify` so a hook failure reads as a hook failure.
  assert.equal(workflow.jobs['hooks-linux'].name, 'Governance hooks(Linux portability)')
  assert.equal(workflow.jobs['hooks-linux'].timeoutMinutes, 15)
  assert.match(source, /npm run hooks:test/)
  // 沒有任何 job 可以超過 25 分鐘(上面兩個 DataTable job 是唯一的例外值)。
  for (const [id, job] of Object.entries(workflow.jobs)) assert.ok((job.timeoutMinutes ?? 0) <= 25, `${id} timeout-minutes ${job.timeoutMinutes} > 25`)
  // Each job that runs code installs once; the fan-in job checks out nothing and installs nothing.
  const installingJobs = Object.entries(workflow.jobs).filter(([id]) => id !== 'verify')
  assert.equal((source.match(/setup:dependencies/g) ?? []).length, installingJobs.length)
  assert.equal(workflow.jobs.verify.steps.length, 1)
  // 瀏覽器閘的兩個 job 都要自己 build storybook 與裝 chromium(彼此平行,不共用 artifact):
  // build-storybook 出現 3 次(static 的 manifest 驗證 + 兩個瀏覽器 job),playwright install 2 次。
  // 5 → 6(2026-09-11):DataTable pixel job 另外 build 一份**參考建置(main)**,
  // 因為空白那條斷言唯一不受 runner 漂移影響的形式是「同 job 交錯比 main」——
  // 同一份元件邏輯在 CI 上量到空白中位 162 / 325 / 485 / 471 / 687ms(4 倍散佈),絕對門檻只是在量那台機器。
  assert.equal((source.match(/npm run build-storybook/g) ?? []).length, 6)
  assert.equal((source.match(/playwright install chromium/g) ?? []).length, 4)
  for (const command of [
    'npm run build:lib',
    'npx --no-install tsc -b',
    'npm run build-storybook',
    '/usr/bin/git diff --exit-code -- packages/design-system/ds-story-manifest.json',
    'node --test infra/governance/test/ci-workflow-scope.test.mjs',
    "node --test --test-name-pattern='canonical GitHub profile minima' infra/governance/test/model-validation.test.mjs",
    'node --test infra/governance/test/workflow-identity-sync.test.mjs',
    'node --test infra/governance/test/release-workflow.test.mjs',
    'node scripts/governance-build-graph.mjs --check',
    'npm run build',
  ]) assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(source, /setup:playwright|setup:provider-cli|test:governance-harnesses|test-governance-build-graph|@qijenchen\/governance test|storybook-smoke-test|visual-audit/)
})

for (const name of [
  'a11y-and-size.yml',
  'visual-regression.yml',
  'composition-fidelity.yml',
  'packaging-canary.yml',
]) {
  test(`${name} is scheduled/manual, outside the PR gate, and reports failures truthfully`, () => {
    const source = readWorkflow(name)
    const workflow = parseWorkflowSemantics(source)
    assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch'])
    assert.ok(Object.values(workflow.jobs).every(job => job.continueOnError !== true))
    assert.doesNotMatch(source, /^\s{2}(?:push|pull_request):/m)
    assert.doesNotMatch(source, /name:\s*(?:Verify\(|a11y\(|Bundle size budget|Visual Regression Diff|Composition Fidelity Diff|Packaging integrity\()/)
  })
}

test('Pages deployment binds and reads back the exact Storybook source', () => {
  const source = readWorkflow('deploy-storybook.yml')
  const workflow = parseWorkflowSemantics(source)
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run'])
  assert.deepEqual(workflow.on.workflow_run.workflows, ['CI'])
  assert.deepEqual(workflow.on.workflow_run.types, ['completed'])
  assert.equal(workflow.jobs['deploy-pages'].needs, 'build-pages')
  assert.equal(workflow.jobs['deploy-pages'].timeoutMinutes, 15)
  for (const evidence of [
    'storybook-static/deployment.json',
    'needs.build-pages.outputs.source_sha',
    '$base_url/deployment.json?$cache_key',
    '$base_url/index.json?$cache_key',
    '$base_url/iframe.html?id=$story_id&viewMode=story&source=$EXPECTED_SHA',
    "cache_key=\"source=$EXPECTED_SHA&attempt=$attempt\"",
  ]) assert.ok(source.includes(evidence), `Pages readback evidence is missing:${evidence}`)
  assert.match(source, /jq -er '\.sourceSha'/)
  assert.match(source, /select\(\.type == \"story\"\)/)
  assert.match(source, /test "\$SOURCE_SHA" = "\$current_main_sha"/)
  const build = workflow.jobs['build-pages']
  const stepNames = build.steps.map(step => step.name).filter(Boolean)
  assert.ok(stepNames.indexOf('Rebuild exact Storybook') < stepNames.indexOf('Refuse a stale artifact before upload'))
  assert.ok(stepNames.indexOf('Refuse a stale artifact before upload') < stepNames.indexOf('Upload Pages artifact'))
})
