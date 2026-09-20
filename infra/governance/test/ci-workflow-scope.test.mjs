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
  // 2026-09-17:第七個跑東西的 job `verify-browser-sweeps` —— 兩支「全 1034 支 story 掃一遍」的閘
  //(Avatar 錨點外框 / 浮層選項列前緣)各約 5–6 分鐘,原本掛在 dpr2 job 上把它撐爆 25 分被取消。
  // 2026-09-12:第六個跑東西的 job `verify-browser-overlay`。interaction job 連兩次跑滿 15 分被 cancel,
  // CI 逐支計時顯示浮層 / 主題閘合計 437 秒 = 整步的 54%。調高上限撞下面那條契約(試過),
  // 搬到排程 deep gates 又不對(這幾支守的是剛回報過的回歸,必須每個 PR 跑),
  // 所以照 2026-09-08 的先例再拆一個平行 job。
  // 2026-09-15:第七個跑東西的 job `verify-browser-datatable-perception`。DataTable 像素 job 跑到 24 分鐘貼著
  // 25 分鐘上限(8b1137c7 被砍),CI 逐支計時顯示感知 / 把手 / 釘選 resize 那段佔 10 分鐘,照 2026-09-10 拆 dpr2 的先例再拆。
  // 2026-09-17:第八個跑東西的 job `verify-browser-select-all`。它跟 sweeps 一樣全 story 掃,但**還要開面板**
  //(逐一點開觸發點、按一下全選、再量一次),本機 6.6 分,疊進 sweeps 必撞 25 分上限,所以自己一個 job。
  // 2026-09-20:第九個跑東西的 job `verify-browser-field-edges`。select-all 一個 job 序列跑五支
  // 全 story 掃描,實測 1076 秒(17.9 分)—— 是關鍵路徑第二長的,而那五支彼此獨立、只共用同一份
  // storybook build。拆一半出來平行跑,各自約 9-10 分。user 原話:「你他媽發版到底是要發多久?」
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['hooks-linux', 'verify', 'verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-datatable-handles', 'verify-browser-datatable-perception', 'verify-browser-field-edges', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-overlay-rows', 'verify-browser-select-all', 'verify-browser-sweeps', 'verify-static'])
  assert.equal(workflow.jobs.verify.name, 'Verify(tsc + tests + compile + build)')
  assert.equal(workflow.jobs.verify.timeoutMinutes, 15)
  assert.equal(workflow.jobs.verify.if, 'always()')
  assert.deepEqual([...workflow.jobs.verify.needs].sort(), ['verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-datatable-handles', 'verify-browser-datatable-perception', 'verify-browser-field-edges', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-overlay-rows', 'verify-browser-select-all', 'verify-browser-sweeps', 'verify-static'])
  // 解析器只留 runSha256 與 env(不留 run 原文):上游 result 必須經 env 進來,再由原始文字驗它們全部 = success 才過。
  const fanInEnv = JSON.stringify(workflow.jobs.verify.steps[0].env)
  // 2026-09-11:兩個 DataTable job 的上限 15 → 25。那天 `verify-browser-datatable` 跑到 15.4 分被砍掉
  // (砍掉的那次每一項判定其實都是綠的),原因是同一天把快速捲動閘 `--runs` 2→3、感知閘重跑上限 3→5 ——
  // 自己加的工作量,不是機器變慢。逾時本身不是品質訊號,但**上限仍是契約**:只有 DataTable 的三個瀏覽器 job
  //(像素 / 感知 / dpr2,2026-09-15 起)可以到 25,其餘一律 15,而且沒有任何 job 可以超過 25(否則就不再是「快速 deterministic 範圍」了)。
  // verify-browser-sweeps 一併列入(2026-09-17):它跑兩支「全 1034 支 story 掃一遍」的閘,
  // CI 實測 Avatar 7.3 分 + 選項列前緣 ≥ 9 分,15 分鐘會被取消。
  // verify-browser-select-all 同列(2026-09-17):同樣是全 story 掃,而且每支還要開面板互動,本機 6.6 分。
  const SLOW_BROWSER_JOBS = new Set(['verify-browser-datatable', 'verify-browser-datatable-perception', 'verify-browser-datatable-dpr2', 'verify-browser-sweeps', 'verify-browser-select-all', 'verify-browser-overlay-rows', 'verify-browser-datatable-handles'])
  for (const upstream of ['verify-static', 'verify-browser-datatable', 'verify-browser-datatable-perception', 'verify-browser-datatable-dpr2', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-agent', 'verify-browser-sweeps', 'verify-browser-select-all', 'verify-browser-field-edges', 'verify-browser-overlay-rows', 'verify-browser-datatable-handles']) {
    assert.match(fanInEnv, new RegExp(`needs\\.${upstream}\\.result`))
    assert.equal(workflow.jobs[upstream].timeoutMinutes, SLOW_BROWSER_JOBS.has(upstream) ? 25 : 15)
    assert.equal(workflow.jobs[upstream].if, null)
    assert.equal(workflow.jobs[upstream].needs, null)
  }
  // 2026-09-20:原本只斷言一段寫死的前綴,而且**只驗 env 變數存在**(上面那圈)——
  // 一個 job 可以同時出現在 needs 與 env,卻沒有被判斷式檢查,於是它紅了 verify 照樣綠。
  // 「env 有宣告」被當成「它真的在把關」,正是同一族的代理錯誤(M37)。
  // 改成從 env 反推:**每一個上游的 result 變數都必須出現在判斷式裡**,漏一個就紅。
  // parseWorkflowSemantics 只給 runSha256,不給 run 原文 —— 判斷式要從原始檔文字取。
  const fanInStep = workflow.jobs.verify.steps[0]
  const gateLine = source.split('\n').find(line => line.includes('" = success ]'))
  assert.ok(gateLine, 'fan-in 必須有一行實際檢查每個上游結果的判斷式')
  for (const [name, expr] of Object.entries(fanInStep.env)) {
    assert.match(String(expr), /needs\.[a-z0-9-]+\.result/, `${name} 必須綁到某個上游的 result`)
    assert.ok(gateLine.includes(`[ "$${name}" = success ]`),
      `${name} 出現在 env 卻沒有被判斷式檢查 —— 那個 job 紅了 verify 仍會綠`)
  }
  assert.equal(Object.keys(fanInStep.env).length, workflow.jobs.verify.needs.length,
    'fan-in 的 env 數必須等於 needs 數:少一個就有 job 不被檢查')
  // The shell hooks only ever ran on macOS, which is how BSD-only `stat -c` / `date -d` fallbacks
  // shipped to Linux cloud sessions. This job is their Linux regression gate; it stays inside the
  // fast PR scope and stays out of `verify` so a hook failure reads as a hook failure.
  assert.equal(workflow.jobs['hooks-linux'].name, 'Governance hooks(Linux portability)')
  assert.equal(workflow.jobs['hooks-linux'].timeoutMinutes, 15)
  assert.match(source, /npm run hooks:test/)
  // 沒有任何 job 可以超過 25 分鐘(上面兩個 DataTable job 是唯一的例外值)。
  for (const [id, job] of Object.entries(workflow.jobs)) assert.ok((job.timeoutMinutes ?? 0) <= 25, `${id} timeout-minutes ${job.timeoutMinutes} > 25`)
  // Each job that runs code installs once; the fan-in job checks out nothing and installs nothing.
  // +1(2026-09-16):DataTable pixel job 的**參考建置(main)**在 tmp/ref-src 裡另裝一次,同樣走受管的 setup:dependencies
  //(原本是裸 `npm ci`,被 scripts/audit-workflow-security.mjs 判 WF-LIFECYCLE / SIGNATURE / VULNERABILITY,
  // 讓「Verify authority candidate without credentials」每支 PR 都紅)。
  const installingJobs = Object.entries(workflow.jobs).filter(([id]) => id !== 'verify')
  assert.equal((source.match(/setup:dependencies/g) ?? []).length, installingJobs.length + 1)
  const commandLines = source.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
  assert.equal((commandLines.match(/\bnpm ci\b/g) ?? []).length, 0, 'ci.yml 不得出現裸 npm ci(參考建置也走 setup:dependencies;註解不算)')
  assert.equal(workflow.jobs.verify.steps.length, 1)
  // 瀏覽器閘的兩個 job 都要自己 build storybook 與裝 chromium(彼此平行,不共用 artifact):
  // build-storybook 出現 3 次(static 的 manifest 驗證 + 兩個瀏覽器 job),playwright install 2 次。
  // 5 → 6(2026-09-11):DataTable pixel job 另外 build 一份**參考建置(main)**,
  // 因為空白那條斷言唯一不受 runner 漂移影響的形式是「同 job 交錯比 main」——
  // 同一份元件邏輯在 CI 上量到空白中位 162 / 325 / 485 / 471 / 687ms(4 倍散佈),絕對門檻只是在量那台機器。
  // 6 → 7 / 4 → 5(2026-09-12):新增 verify-browser-overlay,它同樣自己 build storybook 與裝 chromium。
  // 7 → 8 / 5 → 6(2026-09-15):新增 verify-browser-datatable-perception,同樣自己 build storybook 與裝 chromium。
  // 8 → 9 / 6 → 7(2026-09-17):新增 verify-browser-sweeps(兩支全 story 掃描),同樣自己 build storybook 與裝 chromium。
  // 9 → 10 / 7 → 8(2026-09-17):新增 verify-browser-select-all(多選 footer 標籤 / 狀態),同上。
  // 10 → 11 / 8 → 9(2026-09-20):新增 verify-browser-field-edges。它是從 select-all 拆出來的,
  // 不是新工作量 —— 那五支掃描原本在同一個 job 裡排隊(實測 1076 秒),拆成兩個平行 job 之後
  // 牆鐘減半。代價是多一份 storybook build 與一次 chromium 安裝(算力),換掉的是使用者等待時間。
  // 11 → 12 / 9 → 10(2026-09-20,同日第二次):再把 sweeps 拆成兩個。**誠實記錄**:第一次拆的是
  // 第二長的 select-all(1076→508 秒),關鍵路徑 sweeps 1183 秒原封不動 —— 我當時在 commit 裡
  // 寫「關鍵路徑砍掉三分之一」是錯的。這次才動到第一名,瓶頸讓位給 perception(1055 秒)。
  // 12 → 13 / 10 → 11(2026-09-21):把 perception 的「把手 / 釘選 resize / dpr1 迴圈」拆成
  // verify-browser-datatable-handles。原因是同日把該 job 裡對照組的逾時由寫死 120s 改成由子行程
  // 的 MAX_ATTEMPTS 推導(根因:子行程依設計最多重試 5 次、每次約 38 秒,父行程卻只給 120 秒),
  // 放寬後最壞情況會把原 job 推到 25 分鐘上限。
  assert.equal((source.match(/npm run build-storybook/g) ?? []).length, 13)
  assert.equal((source.match(/playwright install chromium/g) ?? []).length, 11)
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
