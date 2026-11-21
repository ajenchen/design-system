#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: (1) 每一支 checker gate 都有一支 `scripts/test-<閘名>.mjs`,證明它「在該紅的時候會紅」(zero debt);
 *         (2) 每一組配對的紅面(配對 meta-test,或閘自己的 `--selftest`)由哪個執行面跑,逐組量出 redSurface = pr / nightly / none;
 *             「只在排程跑」(nightly)的配對名單只准變短,沒有任何執行面跑的(none)必須是 0。
 *   紅: 新增一支 checker gate 而沒有配對的 meta-test;新增一組紅面只在排程跑的配對(不在 baseline 名單);
 *       baseline 名單裡有已經不是 nightly 的配對(上限過期,要降);有配對的紅面沒有任何執行面跑 → 逐一指名並 exit 1(--check)。
 *   綠: 配對齊全、nightly 名單與 baseline 逐筆相同、none = 0 時綠。母體與執行面都由檔名 / workflow / harness 宣告機械導出,
 *       沒有取樣、沒有時間相依;兩面對照在 scripts/test-audit-gate-meta-test-coverage.mjs(合成 repo:只在 harness → nightly、
 *       加進必過 workflow → pr、名單多一筆 / 少一筆 / 無人跑各自紅)。
 *   註: 2026-09-21 之前這支**沒有任何執行面呼叫它**,於是 87 支閘裡 41 支沒有 meta-test 而沒人看見。
 */
// Gate meta-test coverage(2026-07-11 user「把能機械化的都收掉」— governance 弱軸 #1)。
//
// 為何存在:governance-audit-coverage.md 弱軸 #1 =「多數 .mjs gate 無 meta-test(注入違規→確認 exit 1)」。
//   audit-hook-test-coverage 對 .sh hook 做了;.mjs gate 一直沒對應閘 → 本 script 補上。
//   鏡射 hook-test-coverage 模式:第一層只驗「meta-test 檔存在」= 可靠機械 fact。
//
// 規則:fail-closed checker gate(audit-*/check-*/*-invariant/*-coherence.mjs,有 --check 或 exit≠0 語意)
//   必有 `scripts/test-<basename>.mjs` meta-test。
// 豁免(明寫):gen-*(generator,--check 驗 drift = 自帶 self-check)/ test-*(本身是 test)/
//   sync-*(sync 工具)/ 純 helper。
// Ratchet:checker inventory 與 paired mutation test 必須維持零 debt。新 gate 或移除 test 皆立即 fail closed;
//   baseline 僅固定「空 debt」政策，不是新增豁免的通道。
//
// ── 第二層:紅面在哪個執行面跑(2026-11-18,knowledge-prune D10-03)──
//
// 「檔案存在」≠「有人跑」(M37)。第一層綠的那天(169/169、zero debt)實際量:200 組配對裡,紅面在 PR 必過面跑的
// 只有 130 組,其餘 70 組只在不擋任何東西的排程跑 —— 第一層的綠燈對這 70 組只證明了「有一支檔案」。
// 所以每組配對多記一個 redSurface:
//   pr      = 配對 meta-test,或閘自己帶 `--selftest` 的那條指令,出現在 **PR 必過 workflow** 的 run 文字
//             (或它 `npm run` 遞移觸發到的 package.json script)裡。
//             「PR 必過 workflow」取自 infra/governance/desired/github.json 本 repo profile 的 requiredChecks
//             (requiredEvents 含 pull_request 的 workflow;現況只有 ci.yml)。**不是**「on: 有 pull_request」——
//             focus-deep-gates.yml 有 pull_request 觸發,但不是 required、而且 changed-scope 常整段 skip;
//             拿「有 PR 觸發」代替「紅了會擋 PR」就是代理。
//   nightly = 不是 pr,但出現在有 `schedule` 觸發的 workflow 裡;那些 workflow 若跑到 harness runner
//             (harness-registry.json 的 runner),registry 登錄的每一條指令也算 —— `run-gate-meta-tests.mjs --lane <id>`
//             展開成 harness-source-inventory.json 那條 lane 的成員。
//   none    = 兩者皆非:有 meta-test,但沒有任何執行面會跑它。一律紅。
// 指令文字只取 step 的 `run:`(workflow-invocation-surface.mjs 的 workflowRunText,註解剔除),
// `--selftest` 以單一指令為單位歸屬(selftestScriptInvocations;`a.mjs && b.mjs --selftest` 不算 a 的對照組)。
// 寧可少認 pr:認錯方向只會讓 nightly 名單偏長(棘輪更嚴),不會把沒人跑的對照組算成有人跑。
//
// Ratchet:baseline 的 redSurface.nightlyOnlyPairs 是名單、nightlyOnly 是它的長度。--check 逐筆比對:
//   多一筆(新配對的紅面只在排程跑)→ 紅;少一筆(已接進 PR 必過面或已移除)→ 也紅,跑 --write-baseline 把上限降下來 ——
//   不降的話,之後有人把那支從 ci.yml 拿掉,它掉回 nightly 也照樣綠。
//   --write-baseline 只會刪名單、不會加名單:新配對的紅面若真的只能在排程跑(要開瀏覽器、超出 PR 預算),
//   在 baseline 手動加那一筆並在 commit 訊息寫理由 —— 讓它成為一個看得見、要審的動作。
//
// 用法:node scripts/audit-gate-meta-test-coverage.mjs [--check] [--write-baseline] [--json] [--root <dir>]
//   --root 只給對照組用(合成 repo);CI 與 harness 一律不帶。

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join, resolve } from 'node:path'
import { MANAGED_REPOSITORY_ROLE_POLICY } from '../infra/governance/lib/common.mjs'
import { discoverCheckerGates, discoverGateMetaTestPairs, isGateMetaLaneCommand } from './lib/gate-meta-test-inventory.mjs'
import {
  readWorkflowSources,
  readWorkspaceScripts,
  resolveWorkflowInvocationSurface,
  selftestScriptInvocations,
  workflowRunText,
  workflowTriggers,
} from './lib/workflow-invocation-surface.mjs'

export const RED_SURFACES = Object.freeze(['pr', 'nightly', 'none'])
const DESIRED_GITHUB = 'infra/governance/desired/github.json'
const HARNESS_REGISTRY = 'infra/governance/providers/harness-registry.json'
const HARNESS_SOURCE_INVENTORY = 'infra/governance/providers/harness-source-inventory.json'
const WORKFLOW_DIR = '.github/workflows'
const BASELINE_PATH = 'scripts/audit-gate-meta-test-coverage.baseline.json'
const INSTRUMENT_FAIL = 'INSTRUMENT-FAIL'
const BASELINE_NOTE = 'Gate mutation coverage is discovery-derived and zero-debt; this file may never whitelist a missing pair.'
const RED_SURFACE_NOTE = '紅面只在排程(夜間 / 每週)跑的配對名單,只准變短。--write-baseline 只刪不加;新配對的紅面若真的只能在排程跑,手動加一筆並在 commit 訊息寫理由。'

/**
 * 純函式:每組配對的紅面落在哪個執行面。
 * @param {{ file: string, stem: string }[]} pairs discoverGateMetaTestPairs 的結果(file = test-<stem>.mjs)
 * @param {{ pr: Surface, nightly: Surface }} surfaces Surface = { scripts: Set<檔名>, selftests: Set<檔名> }
 * @returns {{ stem: string, metaTest: string, redSurface: 'pr'|'nightly'|'none', via: 'meta-test'|'selftest'|null }[]}
 */
export function classifyRedSurfaces(pairs, surfaces) {
  const on = (surface, { file, stem }) => {
    if (surface.scripts.has(file)) return 'meta-test'
    if (surface.selftests.has(`${stem}.mjs`)) return 'selftest'
    return null
  }
  return pairs.map((pair) => {
    const metaTest = `scripts/${pair.file}`
    for (const redSurface of ['pr', 'nightly']) {
      const via = on(surfaces[redSurface], pair)
      if (via) return { stem: pair.stem, metaTest, redSurface, via }
    }
    return { stem: pair.stem, metaTest, redSurface: 'none', via: null }
  })
}

function readJson(root, path) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'))
  } catch (error) {
    throw new Error(`讀不到 ${path}:${error.message}`)
  }
}

/** 一組 workflow 的 run 文字 → 可達腳本 / 帶 --selftest 的腳本;跑到 harness runner 就把 registry 指令再展開一層。 */
function resolveSurface({ runText, packageScripts, workspaceScripts, harness }) {
  const first = resolveWorkflowInvocationSurface({ packageScripts, workspaceScripts, extraSurfaces: [runText] })
  const runnerScript = harness.runner[1]
  const reachesHarness = new RegExp(`(?:^|[\\s/"'])${runnerScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(first.corpus)
  if (!reachesHarness) {
    return { scripts: first.scripts, selftests: selftestScriptInvocations(first.corpus), harness: false, lanes: [] }
  }
  const lanes = []
  const commandTexts = []
  for (const argv of harness.commands) {
    if (isGateMetaLaneCommand(argv)) lanes.push(argv[3])
    else commandTexts.push(argv.join(' '))
  }
  const second = resolveWorkflowInvocationSurface({ packageScripts, workspaceScripts, extraSurfaces: [runText, ...commandTexts] })
  const scripts = new Set(second.scripts)
  for (const id of new Set(lanes)) {
    const lane = harness.lanes.get(id)
    if (!lane) throw new Error(`harness registry 登錄了 lane ${id},但 ${HARNESS_SOURCE_INVENTORY} 的 pairedMeta 沒有這條 lane`)
    for (const member of lane) scripts.add(basename(member))
  }
  return { scripts, selftests: selftestScriptInvocations(second.corpus), harness: true, lanes: [...new Set(lanes)].sort() }
}

/** 讀 repo 的執行面宣告 → { pr, nightly } 兩個 Surface 與它們是由哪些 workflow 組成的。 */
export function collectRedSurfaceExecution(root) {
  const workflows = readWorkflowSources(root, WORKFLOW_DIR)
  const desired = readJson(root, DESIRED_GITHUB)
  const profileName = MANAGED_REPOSITORY_ROLE_POLICY.authority.desiredProfile
  const profile = desired.profiles?.[profileName]
  if (!profile) throw new Error(`${DESIRED_GITHUB} 沒有 profile ${profileName}`)
  const prWorkflows = [...new Set((profile.requiredChecks ?? [])
    .filter((check) => check.integration === 'githubActions' && (check.requiredEvents ?? []).includes('pull_request'))
    .map((check) => check.workflow))].sort()
  if (prWorkflows.length === 0) throw new Error(`${DESIRED_GITHUB} ${profileName} 沒有任何 requiredEvents 含 pull_request 的 githubActions required check`)
  const prNames = prWorkflows.map((path) => {
    if (dirname(path) !== WORKFLOW_DIR || !(basename(path) in workflows)) throw new Error(`required check 指向的 workflow 不存在:${path}`)
    const name = basename(path)
    if (!workflowTriggers(workflows[name]).includes('pull_request')) throw new Error(`required check 的 workflow 沒有 pull_request 觸發:${path}`)
    return name
  })
  const nightlyNames = Object.keys(workflows).filter((name) => !prNames.includes(name) && workflowTriggers(workflows[name]).includes('schedule')).sort()

  const registry = readJson(root, HARNESS_REGISTRY)
  const runner = registry.runner?.command
  if (!Array.isArray(runner) || runner.length < 2) throw new Error(`${HARNESS_REGISTRY} runner.command 不是 argv`)
  const pairedMeta = readJson(root, HARNESS_SOURCE_INVENTORY).pairedMeta
  if (!Array.isArray(pairedMeta?.lanes)) throw new Error(`${HARNESS_SOURCE_INVENTORY} 沒有 pairedMeta.lanes`)
  const harness = {
    runner,
    commands: (registry.entries ?? []).flatMap((entry) => entry.commands ?? []),
    lanes: new Map(pairedMeta.lanes.map((lane) => [lane.id, lane.members ?? []])),
  }

  const packageScripts = readJson(root, 'package.json').scripts ?? {}
  const workspaceScripts = readWorkspaceScripts(root)
  const surface = (names) => resolveSurface({
    runText: names.map((name) => workflowRunText(workflows[name])).join('\n'),
    packageScripts,
    workspaceScripts,
    harness,
  })
  return {
    workflows: { pr: prNames.map((name) => `${WORKFLOW_DIR}/${name}`), nightly: nightlyNames.map((name) => `${WORKFLOW_DIR}/${name}`) },
    pr: surface(prNames),
    nightly: surface(nightlyNames),
  }
}

function readBaseline(root) {
  const path = join(root, BASELINE_PATH)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

function redSurfaceBaselineProblems(document) {
  const red = document.redSurface
  if (!red || typeof red !== 'object') return { list: null, problems: ['baseline 缺 redSurface(第一次:跑 --write-baseline 初始化)'] }
  const list = red.nightlyOnlyPairs
  if (!Array.isArray(list) || list.some((stem) => typeof stem !== 'string')) return { list: null, problems: ['redSurface.nightlyOnlyPairs 必須是字串陣列'] }
  const problems = []
  if (JSON.stringify(list) !== JSON.stringify([...new Set(list)].sort())) problems.push('redSurface.nightlyOnlyPairs 必須排序且不重複')
  if (red.nightlyOnly !== list.length) problems.push(`redSurface.nightlyOnly ${JSON.stringify(red.nightlyOnly)} ≠ 名單長度 ${list.length}`)
  return { list, problems }
}

function main(argv) {
  const rootIndex = argv.indexOf('--root')
  const root = realpathSync(rootIndex >= 0 ? resolve(argv[rootIndex + 1] ?? '') : resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  const CHECK = argv.includes('--check')
  const WRITE_BASELINE = argv.includes('--write-baseline')
  const JSON_OUT = argv.includes('--json')

  const gates = discoverCheckerGates(root)
  const pairs = discoverGateMetaTestPairs(root)
  const pairedStems = new Set(pairs.map(({ stem }) => stem))
  const missing = gates.filter((f) => !pairedStems.has(f.replace(/\.mjs$/, '')))

  let execution
  try {
    execution = collectRedSurfaceExecution(root)
  } catch (error) {
    console.error(`✗ ${INSTRUMENT_FAIL}:量不出紅面執行面 —— ${error.message}`)
    return 2
  }
  const records = classifyRedSurfaces(pairs, execution)
  const by = Object.fromEntries(RED_SURFACES.map((name) => [name, records.filter((record) => record.redSurface === name)]))
  const nightlyStems = by.nightly.map((record) => record.stem).sort()
  const baselineDocument = readBaseline(root)

  if (WRITE_BASELINE) {
    if (missing.length > 0) {
      console.error(`❌ zero-debt policy 禁止把 ${missing.length} 個 checker gap 寫成 baseline 豁免`)
      return 1
    }
    if (by.none.length > 0) {
      console.error(`❌ ${by.none.length} 組配對的紅面沒有任何執行面跑,不能寫進 baseline:${by.none.map((record) => record.stem).join(', ')}`)
      return 1
    }
    const previous = redSurfaceBaselineProblems(baselineDocument)
    if (previous.list) {
      const added = nightlyStems.filter((stem) => !previous.list.includes(stem))
      if (added.length > 0) {
        console.error(`❌ 只准往下:--write-baseline 不收新的 nightly 配對(${added.join(', ')})。`)
        console.error('   修法:把它的 meta-test 或 `<閘>.mjs --selftest` 接進 PR 必過 workflow;真的只能在排程跑,就手動在 baseline 加這一筆並在 commit 訊息寫理由。')
        return 1
      }
    }
    writeFileSync(join(root, BASELINE_PATH), `${JSON.stringify({
      _note: BASELINE_NOTE,
      knownDebt: [],
      debtReasons: {},
      redSurface: { _note: RED_SURFACE_NOTE, nightlyOnly: nightlyStems.length, nightlyOnlyPairs: nightlyStems },
    }, null, 2)}\n`)
    console.log(`✅ zero-debt baseline 已重建;nightly 配對上限 ${previous.list ? `${previous.list.length} → ` : ''}${nightlyStems.length}`)
    return 0
  }

  const baseline = Array.isArray(baselineDocument.knownDebt) ? baselineDocument.knownDebt : []
  const debtReasons = baselineDocument.debtReasons && typeof baselineDocument.debtReasons === 'object'
    ? baselineDocument.debtReasons
    : {}
  const newGaps = missing.filter((f) => !baseline.includes(f))
  const staleDebt = baseline.filter((f) => !missing.includes(f))
  const duplicateDebt = baseline.filter((f, index) => baseline.indexOf(f) !== index)
  const missingReasons = baseline.filter((f) => typeof debtReasons[f] !== 'string' || !debtReasons[f].trim())
  const extraReasons = Object.keys(debtReasons).filter((f) => !baseline.includes(f))
  const red = redSurfaceBaselineProblems(baselineDocument)
  const nightlyAdded = red.list ? nightlyStems.filter((stem) => !red.list.includes(stem)) : []
  const nightlyStale = red.list ? red.list.filter((stem) => !nightlyStems.includes(stem)) : []
  const baselineProblems = [
    ...baseline.map((f) => `zero-debt baseline may not whitelist:${f}`),
    ...staleDebt.map((f) => `stale known debt:${f}`),
    ...duplicateDebt.map((f) => `duplicate known debt:${f}`),
    ...missingReasons.map((f) => `known debt lacks reason:${f}`),
    ...extraReasons.map((f) => `reason has no known debt:${f}`),
    ...red.problems,
  ]
  const covered = gates.length - missing.length
  const viaCount = (via) => by.pr.filter((record) => record.via === via).length

  if (JSON_OUT) {
    console.log(JSON.stringify({
      checkerGates: gates.length,
      missing,
      workflows: execution.workflows,
      harness: { pr: { reached: execution.pr.harness, lanes: execution.pr.lanes }, nightly: { reached: execution.nightly.harness, lanes: execution.nightly.lanes } },
      counts: { pairs: records.length, pr: by.pr.length, prViaMetaTest: viaCount('meta-test'), prViaSelftest: viaCount('selftest'), nightly: by.nightly.length, none: by.none.length },
      baselineNightlyOnly: red.list ? red.list.length : null,
      pairs: records,
    }, null, 2))
  } else {
    console.log(`=== Gate meta-test coverage ===`)
    console.log(`checker gate: ${gates.length} / 有 meta-test: ${covered} / 缺: ${missing.length}(zero-debt baseline ${baseline.length})`)
    console.log(`紅面執行面(配對 ${records.length}):pr ${by.pr.length}(配對 meta-test ${viaCount('meta-test')} + 閘自己的 --selftest ${viaCount('selftest')})/ 只在排程 nightly ${by.nightly.length}(baseline 上限 ${red.list ? red.list.length : '未設'})/ 無人跑 none ${by.none.length}`)
    console.log(`  PR 必過 workflow:${execution.workflows.pr.join(', ')};排程 workflow:${execution.workflows.nightly.join(', ')}(harness runner ${execution.nightly.harness ? `可達,lane ${execution.nightly.lanes.join('/')}` : '不可達'})`)
  }
  // --json 時 stdout 只放 JSON;人讀的診斷改走 stderr,免得把 JSON 弄壞
  const say = JSON_OUT ? console.error : console.log
  if (missing.length) {
    say(`\n❌ zero-debt policy 下不可存在的 checker gaps:`)
    missing.filter((f) => baseline.includes(f)).forEach((f) => say(`  - ${f} → 需 scripts/test-${f}`))
  }
  if (newGaps.length) {
    say(`\n🚨 新 checker gate 無 meta-test(必補):`)
    newGaps.forEach((f) => say(`  - ${f} → 需 scripts/test-${f}(注入違規→確認 exit≠0→revert)`))
  }
  if (by.none.length) {
    say(`\n🚨 有 meta-test 但沒有任何執行面跑它的配對(none):`)
    by.none.forEach((record) => say(`  - ${record.stem} → ${record.metaTest} 不在 PR 必過 workflow、排程 workflow 或 harness lane 裡`))
  }
  if (nightlyAdded.length) {
    say(`\n🚨 新增紅面只在排程跑的配對(nightly 只准往下):`)
    nightlyAdded.forEach((stem) => say(`  - ${stem} → 把 scripts/test-${stem}.mjs 或 \`node scripts/${stem}.mjs --selftest\` 接進 PR 必過 workflow`))
  }
  if (nightlyStale.length) {
    say(`\n🚨 baseline 的 nightly 上限過期(這幾組已不是 nightly)—— 跑 --write-baseline 把上限 ${red.list.length} 降到 ${nightlyStems.length}:`)
    nightlyStale.forEach((stem) => say(`  - ${stem}`))
  }
  if (baselineProblems.length) {
    say(`\n🚨 baseline 與實際 coverage 不一致:`)
    baselineProblems.forEach((problem) => say(`  - ${problem}`))
  }

  const redCount = newGaps.length + baselineProblems.length + by.none.length + nightlyAdded.length + nightlyStale.length
  if (CHECK && redCount) {
    console.error(`\n❌ gate meta-test coverage inventory 未閉合:new gaps ${newGaps.length},baseline problems ${baselineProblems.length},none ${by.none.length},nightly 新增 ${nightlyAdded.length} / 過期 ${nightlyStale.length}`)
    return 1
  }
  if (!JSON_OUT && !redCount) console.log('\n✅ discovery-derived paired mutation coverage 全數閉合，zero debt;nightly 名單與 baseline 一致、none 0')
  return 0
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2))
}
