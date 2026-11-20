#!/usr/bin/env node
// audit-gate-meta-test-coverage.mjs 的對照組(2026-11-18,knowledge-prune D10-03)。
//
// 那支稽核的第二層要量「每組配對的紅面在哪個執行面跑」(redSurface = pr / nightly / none),並把 nightly 名單棘輪住。
// 一個只在真實 repo 上跑過、印出 130 / 70 / 0 的量具,證明不了它分得出 pr 與 nightly —— 所以這裡造合成 repo,
// 從同一支 CLI(`--root <合成 repo>`)跑起來,連「值是誰算的」(讀 workflow、desired/github.json、harness registry /
// lane 宣告)一起測(M32 參數邊界、M37 呼叫端要真的消費那支純函式):
//   · 合成配對只出現在 harness lane → nightly;同一支加進必過 workflow 的 run → pr(兩面)
//   · `--selftest` 以單一指令歸屬、註解不算、非必過的 PR workflow 不算、經 npm run 遞移算
//   · baseline 名單多一筆 / 少一筆 / 缺欄位 / 數字對不上、無人跑(none)各自紅,而且指名;--write-baseline 只刪不加
//   · 量不出執行面(必過 check 指向不存在的 workflow)= INSTRUMENT-FAIL,不是綠
// 最後在真實 repo 跑一次:三類加總 = 配對數、首行格式不變(harness-registry.test 依賴它)、--check 綠。
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑 —— 這支棘輪要守的病
// (對照組只在排程跑)原本就發生在它自己身上。
//
// @gate-contract
//   保證: audit-gate-meta-test-coverage.mjs 分得出每組配對的紅面在哪個執行面跑 —— 純函式表(--selftest 以單一指令歸屬、只認 step 的 run、
//         觸發事件三種寫法、pr 優先於 nightly);mkdtemp 合成 repo 裡:配對只在 harness lane → nightly、加進必過 workflow → pr、
//         閘自己的 --selftest 與經 npm run 遞移 → pr、非必過的 PR workflow / 註解 / `a && b --selftest` 不算;
//         baseline 名單過期、新增 nightly、無人跑(none)、名單長度不符或未排序都紅,--write-baseline 拒收新 nightly 且不動 baseline;
//         必過 check 指向不存在的 workflow → exit 2;最後在真實 repo:三類加總 = 配對數、none = 0、baseline 上限 = nightly 數、--check 綠
//   紅: 任一斷言不成立 → node:assert 丟例外,exit 非 0
//   綠: 都照預期時 exit 0 並逐格印出 ✓;合成 repo 在 finally 刪掉,不寫入受驗的工作樹,不讀時間,重複跑結果相同

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyRedSurfaces, RED_SURFACES } from './audit-gate-meta-test-coverage.mjs'
import { selftestScriptInvocations, workflowRunText, workflowTriggers } from './lib/workflow-invocation-surface.mjs'

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const AUDIT = 'scripts/audit-gate-meta-test-coverage.mjs'
let cases = 0
const ok = (label) => { cases += 1; console.log(`  ✓ ${label}`) }

// ── 1. 純函式:--selftest 歸屬、run 文字、觸發事件、分類優先序 ──
const sel = (text) => [...selftestScriptInvocations(text)].sort()
assert.deepEqual(sel('node scripts/a-invariant.mjs --selftest'), ['a-invariant.mjs'])
assert.deepEqual(sel('node scripts/a-invariant.mjs && node scripts/b-invariant.mjs --selftest'), ['b-invariant.mjs'],
  '`a && b --selftest` 不得把 b 的對照組記到 a 頭上(test:agent-panel-invariants 的形狀)')
assert.deepEqual(sel('node scripts/a-invariant.mjs; node scripts/b-invariant.mjs --selftest'), ['b-invariant.mjs'])
assert.deepEqual(sel('node scripts/a-invariant.mjs --rows=8 --selftest'), ['a-invariant.mjs'])
assert.deepEqual(sel('node scripts/a-invariant.mjs \\\n  --selftest'), ['a-invariant.mjs'], '`\\` 續行要接回同一條指令')
assert.deepEqual(sel('node scripts/a-invariant.mjs --selftest-force-ink'), [], '長旗標 --selftest-xxx 不是 --selftest')
assert.deepEqual(sel('node scripts/a-invariant.mjs\n--selftest'), [], '不同行就是不同指令')
ok('--selftest 以單一指令歸屬(&& / ; / 換行切開、續行接回、長旗標不算)')

const workflow = (run, on = 'pull_request:\n  push:') => `name: w\non:\n  ${on}\njobs:\n  j:\n    steps:\n      - name: 跑 scripts/test-name-only.mjs\n        env:\n          X: scripts/test-env-only.mjs\n        run: ${run}\n`
assert.equal(workflowRunText(workflow('node scripts/x.mjs')).includes('test-name-only'), false, 'step name 提到的檔名不算有人跑')
assert.equal(workflowRunText(workflow('node scripts/x.mjs')).includes('test-env-only'), false, 'env 提到的檔名不算有人跑')
assert.deepEqual(sel(workflowRunText(workflow('>-\n          node scripts/a-invariant.mjs\n          --selftest'))), ['a-invariant.mjs'], '`run: >-` 折行要還原成同一條指令')
assert.deepEqual(sel(workflowRunText(workflow('|\n          # node scripts/a-invariant.mjs --selftest\n          node scripts/b-invariant.mjs # --selftest'))), [], '整行註解與行尾註解都不算')
assert.deepEqual(workflowTriggers('on: pull_request\njobs: {}\n'), ['pull_request'])
assert.deepEqual(workflowTriggers('on: [push, schedule]\njobs: {}\n'), ['push', 'schedule'])
assert.deepEqual(workflowTriggers(workflow('x', 'schedule:\n    - cron: "0 3 * * *"')), ['schedule'])
assert.throws(() => workflowTriggers('jobs: {}\n'), /沒有 on:/)
ok('workflow 只認 step 的 run(name / env 不算、折行還原、註解剔除);觸發事件三種寫法都讀得到,沒寫 = 例外')

const surface = (scripts = [], selftests = []) => ({ scripts: new Set(scripts), selftests: new Set(selftests) })
const table = classifyRedSurfaces([
  { file: 'test-a.mjs', stem: 'a' }, { file: 'test-b.mjs', stem: 'b' }, { file: 'test-c.mjs', stem: 'c' }, { file: 'test-d.mjs', stem: 'd' },
], { pr: surface(['test-a.mjs'], ['b.mjs']), nightly: surface(['test-a.mjs', 'test-b.mjs', 'test-c.mjs']) })
assert.deepEqual(table.map((r) => [r.stem, r.redSurface, r.via]), [
  ['a', 'pr', 'meta-test'], ['b', 'pr', 'selftest'], ['c', 'nightly', 'meta-test'], ['d', 'none', null],
])
assert.deepEqual(RED_SURFACES, ['pr', 'nightly', 'none'])
ok('分類:pr 優先於 nightly;meta-test 與 --selftest 都算紅面;兩面都沒有 = none')

// ── 2. CLI × 合成 repo ──
const scratch = mkdtempSync(join(tmpdir(), 'gate-red-surface-'))
let fixtureIndex = 0
function makeRepo({
  ci = 'node scripts/audit-gate-meta-test-coverage.mjs --check',
  extraWorkflows = {},
  nightlyOn = 'schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:',
  packageScripts = {},
  stems = ['alpha-invariant', 'beta-invariant'],
  laneMembers = stems.map((stem) => `scripts/test-${stem}.mjs`),
  registryCommands = [['node', 'scripts/run-gate-meta-tests.mjs', '--lane', 'core']],
  requiredWorkflow = '.github/workflows/ci.yml',
  baseline,
} = {}) {
  fixtureIndex += 1
  const root = join(scratch, `repo-${fixtureIndex}`)
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`)
  }
  for (const stem of stems) {
    write(`scripts/${stem}.mjs`, `// 合成閘 ${stem}\n`)
    write(`scripts/test-${stem}.mjs`, `// 合成 meta-test ${stem}\n`)
  }
  write('.github/workflows/ci.yml', workflow(`|\n          ${ci.split('\n').join('\n          ')}`))
  write('.github/workflows/nightly.yml', `name: nightly\non:\n  ${nightlyOn}\njobs:\n  h:\n    steps:\n      - run: npm run --silent test:governance-harnesses\n`)
  for (const [name, body] of Object.entries(extraWorkflows)) write(`.github/workflows/${name}`, body)
  write('package.json', { name: 'fixture', private: true, scripts: { 'test:governance-harnesses': 'node infra/governance/bin/run-harnesses.mjs', ...packageScripts } })
  write('infra/governance/desired/github.json', { profiles: { 'design-system-authority': { requiredChecks: [
    { context: 'Verify', integration: 'githubActions', requiredEvents: ['pull_request'], workflow: requiredWorkflow },
  ] } } })
  write('infra/governance/providers/harness-registry.json', {
    runner: { command: ['node', 'infra/governance/bin/run-harnesses.mjs'] },
    entries: [{ id: 'fake-green-ratchet', commands: registryCommands }],
  })
  write('infra/governance/providers/harness-source-inventory.json', { pairedMeta: { runner: 'scripts/run-gate-meta-tests.mjs', lanes: [
    { id: 'core', membership: 'remainder', members: laneMembers },
  ] } })
  if (baseline !== undefined) write('scripts/audit-gate-meta-test-coverage.baseline.json', baseline)
  return root
}
const baselineOf = (pairs) => ({ _note: 'fixture', knownDebt: [], debtReasons: {}, redSurface: { nightlyOnly: pairs.length, nightlyOnlyPairs: pairs } })
function audit(root, ...args) {
  const result = spawnSync(process.execPath, ['--', AUDIT, '--root', root, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, out: `${result.stdout}\n${result.stderr}`, stdout: result.stdout }
}
function surfaces(root) {
  const result = audit(root, '--json')
  assert.equal(result.status, 0, result.out)
  return Object.fromEntries(JSON.parse(result.stdout).pairs.map((record) => [record.stem, `${record.redSurface}/${record.via}`]))
}

try {
  // 2a. 綠面:配對只在 harness lane → nightly;初始化 baseline 後 --check 綠
  {
    const root = makeRepo()
    assert.deepEqual(surfaces(root), { 'alpha-invariant': 'nightly/meta-test', 'beta-invariant': 'nightly/meta-test' })
    const missing = audit(root, '--check')
    assert.equal(missing.status, 1, `baseline 沒有 redSurface 必須紅:${missing.out}`)
    assert.match(missing.out, /缺 redSurface/)
    const init = audit(root, '--write-baseline')
    assert.equal(init.status, 0, init.out)
    const written = JSON.parse(readFileSync(join(root, 'scripts/audit-gate-meta-test-coverage.baseline.json'), 'utf8'))
    assert.deepEqual(written.redSurface.nightlyOnlyPairs, ['alpha-invariant', 'beta-invariant'])
    assert.equal(written.redSurface.nightlyOnly, 2)
    const green = audit(root, '--check')
    assert.equal(green.status, 0, green.out)
    assert.match(green.out, /checker gate:\s*2\s*\/\s*有 meta-test:\s*2\s*\/\s*缺:\s*0/)
    assert.match(green.out, /pr 0.*nightly 2.*none 0/)
    ok('合成配對只出現在 harness lane → nightly;缺 redSurface 紅,初始化後綠')
  }

  // 2b. 紅面 → pr:同一支加進必過 workflow 的 run;baseline 名單過期 → 紅並指名;--write-baseline 降上限後綠
  {
    const root = makeRepo({ ci: 'node scripts/test-alpha-invariant.mjs', baseline: baselineOf(['alpha-invariant', 'beta-invariant']) })
    assert.deepEqual(surfaces(root), { 'alpha-invariant': 'pr/meta-test', 'beta-invariant': 'nightly/meta-test' })
    const stale = audit(root, '--check')
    assert.equal(stale.status, 1, `已不是 nightly 的名單項目必須紅(否則之後從 ci 拿掉也照樣綠):${stale.out}`)
    assert.match(stale.out, /上限過期[\s\S]*- alpha-invariant/)
    const lower = audit(root, '--write-baseline')
    assert.equal(lower.status, 0, lower.out)
    assert.match(lower.out, /2 → 1/)
    assert.equal(audit(root, '--check').status, 0)
    ok('配對 meta-test 加進必過 workflow → pr;baseline 過期指名紅,--write-baseline 2 → 1 後綠')
  }

  // 2c. 閘自己的 --selftest 在必過 workflow 跑 → pr(selftest);經 npm run 遞移也算
  {
    const direct = makeRepo({ ci: 'node scripts/beta-invariant.mjs\nnode scripts/beta-invariant.mjs --selftest' })
    assert.equal(surfaces(direct)['beta-invariant'], 'pr/selftest')
    const viaNpm = makeRepo({ ci: 'npm run --silent test:beta', packageScripts: { 'test:beta': 'node scripts/test-beta-invariant.mjs' } })
    assert.equal(surfaces(viaNpm)['beta-invariant'], 'pr/meta-test')
    ok('閘自己的 --selftest 在必過 workflow → pr;經 npm run → package.json script 遞移 → pr')
  }

  // 2d. 看起來像、其實不算:&& 後面別支的 --selftest、註解、非必過的 PR workflow
  {
    const chained = makeRepo({ ci: 'node scripts/beta-invariant.mjs && node scripts/alpha-invariant.mjs --selftest' })
    assert.deepEqual(surfaces(chained), { 'alpha-invariant': 'pr/selftest', 'beta-invariant': 'nightly/meta-test' },
      'beta 在 PR 只跑現況,它的對照組不在 PR')
    const commented = makeRepo({ ci: '# node scripts/test-beta-invariant.mjs\necho skip' })
    assert.equal(surfaces(commented)['beta-invariant'], 'nightly/meta-test', '只在 workflow 註解出現不算')
    const notRequired = makeRepo({ extraWorkflows: { 'deep.yml': workflow('node scripts/beta-invariant.mjs --selftest', 'pull_request:') } })
    assert.equal(surfaces(notRequired)['beta-invariant'], 'nightly/meta-test', '有 pull_request 觸發、但不是 required check 的 workflow 不算 pr')
    ok('`a && b --selftest` 不算 a、註解不算、非必過 PR workflow(focus-deep-gates 的形狀)不算 → 仍是 nightly')
  }

  // 2e. 新配對只在排程跑 → 不在名單 → 紅並指名;--write-baseline 不收(只准往下)
  {
    const root = makeRepo({ stems: ['alpha-invariant', 'beta-invariant', 'gamma-invariant'], baseline: baselineOf(['alpha-invariant', 'beta-invariant']) })
    const added = audit(root, '--check')
    assert.equal(added.status, 1, added.out)
    assert.match(added.out, /新增紅面只在排程跑的配對[\s\S]*- gamma-invariant/)
    const before = readFileSync(join(root, 'scripts/audit-gate-meta-test-coverage.baseline.json'), 'utf8')
    const refuse = audit(root, '--write-baseline')
    assert.equal(refuse.status, 1, `--write-baseline 不得把新的 nightly 配對收進名單:${refuse.out}`)
    assert.match(refuse.out, /只准往下[\s\S]*gamma-invariant/)
    assert.equal(readFileSync(join(root, 'scripts/audit-gate-meta-test-coverage.baseline.json'), 'utf8'), before, '拒絕時 baseline 一個 byte 都不能動')
    ok('新配對紅面只在排程 → 指名紅;--write-baseline 拒收且 baseline 不動')
  }

  // 2f. 沒有任何執行面跑:registry 沒登錄 lane / 排程 workflow 沒有 schedule → none。
  //     baseline 名單刻意給空的:這樣唯一會讓它紅的只剩 none 那條規則(名單有列的話,「過期」也會紅,會把 none 規則失效蓋掉)。
  {
    const noLane = makeRepo({ registryCommands: [], baseline: baselineOf([]) })
    assert.deepEqual(surfaces(noLane), { 'alpha-invariant': 'none/null', 'beta-invariant': 'none/null' })
    const red = audit(noLane, '--check')
    assert.equal(red.status, 1, `none 必須紅(不靠名單過期):${red.out}`)
    assert.match(red.out, /沒有任何執行面跑它的配對[\s\S]*- alpha-invariant[\s\S]*- beta-invariant/)
    assert.doesNotMatch(red.out, /上限過期|新增紅面只在排程/, '這一格只該由 none 規則判紅')
    assert.equal(audit(noLane, '--write-baseline').status, 1, 'none 不得寫進 baseline')
    const manualOnly = makeRepo({ nightlyOn: 'workflow_dispatch:', baseline: baselineOf([]) })
    assert.deepEqual(surfaces(manualOnly), { 'alpha-invariant': 'none/null', 'beta-invariant': 'none/null' }, '只能手動觸發的 workflow 不算排程')
    assert.equal(audit(manualOnly, '--check').status, 1, '只能手動觸發 → none → 紅')
    const direct = makeRepo({ laneMembers: [], registryCommands: [['node', 'scripts/test-alpha-invariant.mjs']] })
    assert.deepEqual(surfaces(direct), { 'alpha-invariant': 'nightly/meta-test', 'beta-invariant': 'none/null' }, 'registry 直接登錄的 meta-test(exclusion 形狀)算 nightly')
    ok('lane 沒登錄 / 只能手動觸發 → none 指名紅且不准寫進 baseline;registry 直接登錄的 meta-test 算 nightly')
  }

  // 2g. baseline 自身壞掉:數字與名單長度不符、名單沒排序 → 紅
  {
    const mismatch = makeRepo({ baseline: { ...baselineOf(['alpha-invariant', 'beta-invariant']), redSurface: { nightlyOnly: 3, nightlyOnlyPairs: ['alpha-invariant', 'beta-invariant'] } } })
    const red = audit(mismatch, '--check')
    assert.equal(red.status, 1, red.out)
    assert.match(red.out, /nightlyOnly 3 ≠ 名單長度 2/)
    const unsorted = makeRepo({ baseline: baselineOf(['beta-invariant', 'alpha-invariant']) })
    assert.match(audit(unsorted, '--check').out, /必須排序且不重複/)
    ok('baseline 的 nightlyOnly 與名單長度不符、名單未排序 → 紅')
  }

  // 2h. 量不出執行面 = 儀器失效,不是綠
  {
    const root = makeRepo({ requiredWorkflow: '.github/workflows/missing.yml', baseline: baselineOf(['alpha-invariant', 'beta-invariant']) })
    for (const args of [['--check'], []]) {
      const result = audit(root, ...args)
      assert.equal(result.status, 2, result.out)
      assert.match(result.out, /INSTRUMENT-FAIL[\s\S]*missing\.yml/)
    }
    ok('必過 check 指向不存在的 workflow → INSTRUMENT-FAIL exit 2(有無 --check 都一樣)')
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

// ── 3. 真實 repo:三類加總 = 配對數、首行格式不變、--check 綠 ──
{
  const json = spawnSync(process.execPath, ['--', AUDIT, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  assert.equal(json.status, 0, json.stderr)
  const report = JSON.parse(json.stdout)
  assert.equal(report.counts.pr + report.counts.nightly + report.counts.none, report.counts.pairs)
  assert.equal(report.counts.pr, report.counts.prViaMetaTest + report.counts.prViaSelftest)
  assert.ok(report.pairs.every((record) => RED_SURFACES.includes(record.redSurface)))
  assert.ok(report.workflows.pr.includes('.github/workflows/ci.yml'), 'ci.yml 是 required check 的 workflow,必須被認成 PR 必過面')
  assert.ok(report.workflows.nightly.includes('.github/workflows/governance-harnesses.yml'))
  assert.equal(report.harness.nightly.reached, true, '夜間 workflow 必須讀得到 harness runner,否則全部 lane 會被算成 none')
  assert.equal(report.counts.none, 0)
  assert.equal(report.baselineNightlyOnly, report.counts.nightly)
  const plain = spawnSync(process.execPath, ['--', AUDIT, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  assert.equal(plain.status, 0, `${plain.stdout}\n${plain.stderr}`)
  assert.match(plain.stdout, /checker gate:\s*(\d+)\s*\/\s*有 meta-test:\s*(\d+)\s*\/\s*缺:\s*(\d+)/, 'harness-registry.test 解析這一行,格式不得變')
  ok(`真實 repo:配對 ${report.counts.pairs} = pr ${report.counts.pr} + nightly ${report.counts.nightly} + none ${report.counts.none};--check 綠`)
}

console.log(`\n✅ audit-gate-meta-test-coverage 對照組 ${cases} 組全過`)
