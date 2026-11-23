#!/usr/bin/env node
// meta-test for audit-hook-quality(PNG P4.3 gate-meta-test 家族)。每一部分都兩面:該紅的會紅、該綠的會綠。
//
// 2026-09-24 加 Part B / Part C:只證明「log 檔不見時閘會死」證明不了閘**讀到 log 之後判得對不對**。
// 而那正是當天出事的地方 —— 遙測預設關閉、log 只有一筆,閘把全部 60 支 hook 標成 `dead` 並提名 retire。
// M37:「沒觀察到」被當成「沒發生」。Part B 測判準本身(純函式),Part C 測那支閘真的有在消費它(端到端)。
//
// 2026-11-18(knowledge-prune WP-07)改了三件事,測試跟著改:
//   (1) D2-3:log 不存在不再 exit 2,改出跟空 log 同一份全盲報告(Part A)。舊版 Part A 把「log 不見 → exit 2」
//       當成閘來驗,可那正是 SKILL 叫人看 summary.observation 時,預設狀態下什麼都看不到的原因。
//       閘現在唯一該紅的路是「註冊清單對不上」—— 紅面由 Part D 的夾具 repo 驗,同時驗「閘失敗時不留下
//       evidence 目錄」與「全新 clone 連 governance-runtime 都沒有」(不碰真 repo 的狀態目錄)。
//   (2) Phase 0 觀察:「有哪些 hook」改讀註冊清單:_log-fire.sh 不得出現在報告裡(Part C、Part D)。
//   (3) D2-2(2):窗內零筆時,不寫紀錄的 hook 標 not-instrumented、dispatcher 子規則看 dispatcher 有沒有在跑;
//       窗內有紀錄的一律照頻率分(Part C、Part D、Part E)。豁免(不提名)的每一種寫法,都有一格把同樣的
//       寫法放進「該提名」的情境,證明豁免沒有變成漏洞:dispatcher 活著、子規則零筆 → 照樣 dead 並提名。
//
// 真實 runtime 報告(OUT)每跑一次閘都會被覆寫:開頭存一份、最後一定還原(或刪掉本來沒有的)。
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  assessObservation,
  classifyHook,
  isFireInstrumented,
  readFireRecords,
  BLIND_RETIRE_REASON,
  DEFAULT_WINDOW_MS,
  DEFAULT_LIVE_TOLERANCE_MS,
} from './lib/hook-fire-observability.mjs'

const gitDirectoryProbe = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' })
if (gitDirectoryProbe.status !== 0) throw new Error(`git directory probe failed:${gitDirectoryProbe.stderr}`)
const GIT_DIR = gitDirectoryProbe.stdout.trim()
const RUNTIME_ROOT = join(GIT_DIR, 'governance-runtime')
const OUT = join(RUNTIME_ROOT, 'evidence/audit/hook-quality-report.json')
const LOG_NAME = 'hook-fires-per-hook.jsonl'
const HOOK_DIR = 'packages/design-system/ds-canonical/hooks'
const DAY = 24 * 60 * 60 * 1000
const realAgo = (days) => new Date(Date.now() - days * DAY).toISOString()
const fireLine = (hook, ts) => JSON.stringify({ ts, hook }) + '\n'

let ok = true
const fail = (message) => { ok = false; console.error(`✗ ${message}`) }
const pass = (message) => console.log(`✓ ${message}`)

/** 在真 repo 跑閘,state 子目錄隔離在 runtime 底下;回傳 { status, report }。 */
function runInRepo(stateDir) {
  const env = { ...process.env, GOVERNANCE_RUNTIME_ROOT: RUNTIME_ROOT, GOVERNANCE_STATE_DIR: stateDir }
  delete env.GOVERNANCE_READ_ONLY
  const result = spawnSync(process.execPath, ['--', 'scripts/audit-hook-quality.mjs'], { stdio: 'pipe', env, encoding: 'utf8' })
  const report = result.status === 0 && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
  return { status: result.status, stderr: result.stderr, report }
}

/** 註冊清單去重 —— 測試自己的對照答案,直接讀 JSON,不經被測的 lib。 */
function registryOracle(registrationsPath) {
  const registrations = JSON.parse(readFileSync(registrationsPath, 'utf8'))
  const names = new Set()
  for (const groups of Object.values(registrations.hooks)) for (const group of groups) for (const d of group.hooks) names.add(d.hook)
  return names
}

const outExisted = existsSync(OUT)
const outOrig = outExisted ? readFileSync(OUT, 'utf8') : null

try {
  // ── Part A:沒有 log 的三種樣子,真的跑閘 ─────────────────────────────────────
  // 全部要 exit 0、blind=true、零 dead、零提名。A1/A2 是「遙測從沒開過」的真實樣子(檔根本不存在),
  // A3 是開過又清空。三格只差在 fireLogPresent。
  {
    const base = join(RUNTIME_ROOT, `test-audit-hook-quality-a-${process.pid}`)
    const cases = [
      { name: 'A1 狀態目錄不存在', setup: () => {}, present: false },
      { name: 'A2 目錄在、log 檔不存在(遙測從沒開過)', setup: (d) => mkdirSync(d, { recursive: true }), present: false },
      { name: 'A3 log 檔是空的', setup: (d) => { mkdirSync(d, { recursive: true }); writeFileSync(join(d, LOG_NAME), '') }, present: true },
    ]
    for (const [index, row] of cases.entries()) {
      const stateDir = `${base}-${index}`
      rmSync(stateDir, { recursive: true, force: true })
      try {
        row.setup(stateDir)
        const { status, stderr, report } = runInRepo(stateDir)
        if (status !== 0) fail(`${row.name}:閘應 exit 0 出全盲報告,實得 exit ${status}${stderr ? `(${stderr.trim()})` : ''}`)
        else if (!report?.summary.observation?.blind) fail(`${row.name}:沒有 log 卻說自己沒盲`)
        else if (report.summary.retireCandidates !== 0 || report.summary.classifications.dead !== 0) {
          fail(`${row.name}:全盲卻產出提名(dead=${report.summary.classifications.dead} retire=${report.summary.retireCandidates})`)
        } else if (report.summary.observation.fireLogPresent !== row.present) {
          fail(`${row.name}:fireLogPresent 應為 ${row.present},實得 ${report.summary.observation.fireLogPresent}`)
        } else pass(`${row.name} → exit 0,blind=true,dead=0,retire=0,fireLogPresent=${row.present}`)
      } finally {
        rmSync(stateDir, { recursive: true, force: true })
      }
    }
  }

  // ── Part B:判準本身 —— 「窗內零筆」這句話什麼時候說得出口 ─────────────────
  // 紅面 6 格、綠面 2 格。只有紅面的守門跟只有綠面的守門一樣沒用。
  // 綠面第二格(F)刻意把窗頭那筆只放進輪替封存檔,逼 readFireRecords 真的去讀它 ——
  // 只測 assessObservation 的話,封存檔沒被讀進來這個 bug 永遠測不到(M32 參數邊界盲點)。
  // current: null = 不寫 log 檔;dirAbsent = 連目錄都不存在。
  {
    const NOW = Date.parse('2026-09-24T00:00:00Z')
    const ago = (days) => new Date(NOW - days * DAY).toISOString()
    const TABLE = [
      { name: 'A0 狀態目錄不存在', dirAbsent: true, current: null, archives: {}, blind: true,
        why: '全新 clone:.git/governance-runtime 根本還沒建' },
      { name: 'A 沒有 log 檔(遙測從沒開過)', current: null, archives: {}, blind: true,
        why: '零筆是預設狀態 —— 這正是把 60 支 hook 全標 dead 的那一次' },
      { name: 'A\' 空 log 檔', current: [], archives: {}, blind: true,
        why: '開過又清空,跟沒開一樣什麼都證明不了' },
      { name: 'B 只有一筆、51 天前', current: [['stop_passive_logging.sh', ago(51)]], archives: {}, blind: true,
        why: '兩端都證明不了:窗頭沒紀錄、窗尾也停了(2026-09-24 本機真實狀態)' },
      { name: 'C 窗頭有、錄到今天', current: [['a.sh', ago(200)], ['a.sh', ago(0)]], archives: {}, blind: false,
        why: '綠面 ①:這種 log 才有資格說「某支六個月零筆」' },
      { name: 'D 窗頭有,但 30 天前就停錄', current: [['a.sh', ago(200)], ['a.sh', ago(30)]], archives: {}, blind: true,
        why: '記錄器中途被關掉 —— 窗尾那一段沒被觀察過' },
      { name: 'E log 太年輕(100 天前才開始)', current: [['a.sh', ago(100)], ['a.sh', ago(0)]], archives: {}, blind: true,
        why: '窗頭那 80 天從來沒被觀察過' },
      { name: 'F 窗頭只存在於輪替封存檔', current: [['a.sh', ago(0)]], archives: { '202603': [['a.sh', ago(200)]] }, blind: false,
        why: '綠面 ②:封存檔沒被讀進來的話這格會誤判成全盲' },
    ]
    for (const row of TABLE) {
      const dir = mkdtempSync(join(tmpdir(), 'hook-fire-obs-'))
      try {
        if (row.current !== null) writeFileSync(join(dir, LOG_NAME), row.current.map(([h, t]) => fireLine(h, t)).join(''))
        for (const [suffix, rows] of Object.entries(row.archives)) {
          writeFileSync(join(dir, `${LOG_NAME}.${suffix}`), rows.map(([h, t]) => fireLine(h, t)).join(''))
        }
        const verdict = assessObservation({
          fireTimestamps: readFireRecords(row.dirAbsent ? join(dir, 'absent') : dir).map(r => r.ts),
          nowMs: NOW,
          windowMs: DEFAULT_WINDOW_MS,
          liveToleranceMs: DEFAULT_LIVE_TOLERANCE_MS,
        })
        if (verdict.blind !== row.blind) fail(`${row.name}:預期 blind=${row.blind} 實得 ${verdict.blind} —— ${row.why}`)
        else pass(`${row.name} → blind=${verdict.blind}(${row.why})`)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }

  // ── Part C:端到端(真 repo、真註冊清單、真 dispatcher)—— 閘真的有在消費上面的判準 ─────────────
  // C1 全盲 → 零筆提名;C2 健康 → 仍然標得出 dead,hook 清單 = 註冊清單,_log-fire.sh 不在裡面,
  // 不寫紀錄的 hook 一支都沒被提名,會寫紀錄的子規則全列出來;C3 讓一支真的 dispatcher 活起來 →
  // 它的子規則有紀錄的照頻率分、零筆的照樣被提名(子規則名單從 C2 的報告動態取,不寫死)。
  {
    const stateDir = join(RUNTIME_ROOT, `test-audit-hook-quality-c-${process.pid}`)
    const runWith = (lines) => {
      rmSync(stateDir, { recursive: true, force: true })
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, LOG_NAME), lines.join(''))
      const { status, stderr, report } = runInRepo(stateDir)
      if (status !== 0) throw new Error(`gate 非預期退出:${status} ${stderr}`)
      return report
    }
    try {
      const blind = runWith([])
      if (!blind.summary.observation?.blind) fail('端到端紅面:空 log 餵進去,閘竟然說自己沒盲')
      else if (blind.summary.retireCandidates !== 0 || blind.summary.classifications.dead !== 0) {
        fail(`端到端紅面:全盲卻仍產出提名(dead=${blind.summary.classifications.dead} retire=${blind.summary.retireCandidates})`)
      } else pass(`端到端紅面:空 log → blind=true,dead=0,retire=0,unknown=${blind.summary.classifications.unknown}`)

      const healthyBase = [
        fireLine('stop_passive_logging.sh', realAgo(200)),
        fireLine('stop_passive_logging.sh', realAgo(0)),
      ]
      const healthy = runWith(healthyBase)
      if (healthy.summary.observation?.blind) {
        fail(`端到端綠面:健康 log 卻判成全盲 —— 守門過嚴會把整支稽核廢掉。reasons=${JSON.stringify(healthy.summary.observation.reasons)}`)
      } else if (healthy.summary.classifications.dead === 0 || healthy.summary.retireCandidates === 0) {
        fail('端到端綠面:儀器沒盲,卻一個 dead / retire 提名都生不出來')
      } else pass(`端到端綠面:健康 log → blind=false,dead=${healthy.summary.classifications.dead},retire=${healthy.summary.retireCandidates}`)

      const expected = registryOracle(`${HOOK_DIR}/registrations.json`)
      const listed = new Set(healthy.hooks.filter(h => h.registered).map(h => h.hook))
      const missing = [...expected].filter(h => !listed.has(h))
      const extra = [...listed].filter(h => !expected.has(h))
      if (healthy.hooks.some(h => h.hook === '_log-fire.sh')) fail('_log-fire.sh 出現在報告裡 —— 「有哪些 hook」又在數目錄了(它是被 source 的 helper,沒有註冊)')
      else if (missing.length || extra.length || healthy.summary.totalRegisteredHooks !== expected.size) {
        fail(`報告的註冊 hook 跟註冊清單對不上:少 ${missing.join(',') || '無'} / 多 ${extra.join(',') || '無'} / total=${healthy.summary.totalRegisteredHooks} 應為 ${expected.size}`)
      } else pass(`hook 清單 = 註冊清單去重 ${expected.size} 支,_log-fire.sh 不在裡面`)

      const uninstrumented = healthy.hooks.filter(h => h.registered && h.instrumented === false)
      const leaked = uninstrumented.filter(h => h.retireCandidate || h.classification !== 'not-instrumented')
      if (leaked.length) fail(`不寫紀錄的 hook 被當成有觀測值:${leaked.map(h => `${h.hook}=${h.classification}${h.retireCandidate ? '+提名' : ''}`).join(', ')}`)
      else if (healthy.summary.classifications.notInstrumented !== uninstrumented.length) {
        fail(`summary.classifications.notInstrumented=${healthy.summary.classifications.notInstrumented},逐支數得 ${uninstrumented.length}`)
      } else pass(`健康 log 下 ${uninstrumented.length} 支不寫紀錄的 hook 全標 not-instrumented、零提名(${uninstrumented.map(h => h.hook).join(', ')})`)

      // 子規則的對照答案:hooks/lib/*.sh 裡提到 log_hook_fire、而且有註冊 hook 的原始碼寫著 `/<名字>` 的檔。
      // 純字串比對,不經被測的 lib;被 source 的共用 helper(不寫紀錄)必須不在報告裡。
      const registeredText = [...expected].map(h => readFileSync(join(HOOK_DIR, h), 'utf8')).join('\n')
      const libSh = readdirSync(join(HOOK_DIR, 'lib')).filter(n => n.endsWith('.sh'))
      const loggingLib = libSh.filter(n => readFileSync(join(HOOK_DIR, 'lib', n), 'utf8').includes('log_hook_fire'))
      const subOracle = new Set(loggingLib.filter(n => registeredText.includes(`/${n}`)))
      const silentLib = libSh.filter(n => !loggingLib.includes(n))
      const subRows = healthy.hooks.filter(h => h.dispatchedBy?.length)
      const subListed = new Set(subRows.map(h => h.hook))
      const subMissing = [...subOracle].filter(n => !subListed.has(n))
      const subExtra = [...subListed].filter(n => !subOracle.has(n))
      const helperLeak = healthy.hooks.filter(h => silentLib.includes(h.hook)).map(h => h.hook)
      if (!subOracle.size) fail('對照答案是空的:hooks/lib/ 底下找不到任何會寫紀錄、又被註冊 hook 提到的子規則 —— 先修測試的對照答案')
      else if (subMissing.length || subExtra.length) fail(`會寫紀錄的子規則沒全列出來:少 ${subMissing.join(',') || '無'} / 多 ${subExtra.join(',') || '無'}`)
      else if (helperLeak.length) fail(`被 source 的共用 helper 被當成子規則列進報告:${helperLeak.join(', ')}`)
      else {
        const wrong = subRows.filter(h => h.classification !== 'dispatched' || h.retireCandidate)
        if (wrong.length) fail(`dispatcher 窗內零筆時,子規則不得被提名:${wrong.map(h => `${h.hook}=${h.classification}${h.retireCandidate ? '+提名' : ''}`).join(', ')}`)
        else pass(`會寫紀錄的子規則 ${subOracle.size} 條全從 hooks/lib/ 列出(不靠 log),dispatcher 零筆 → 全標 dispatched、零提名;共用 helper ${silentLib.length} 支不在報告裡`)
      }

      // C3:挑一支真的 dispatcher 讓它活起來,它的第一條子規則一天 60 筆(hot),其餘零筆
      const dispatcher = subRows[0]?.dispatchedBy?.[0]
      const own = subRows.filter(h => h.dispatchedBy.includes(dispatcher)).map(h => h.hook)
      if (!dispatcher || own.length < 2) fail(`C3 前提不成立:找不到有兩條以上子規則的 dispatcher(${dispatcher})`)
      else {
        const [hotRule, ...quietRules] = own
        const live = runWith([
          ...healthyBase,
          fireLine(dispatcher, realAgo(0)),
          ...Array.from({ length: 60 }, () => fireLine(hotRule, realAgo(0))),
        ])
        const by = Object.fromEntries(live.hooks.map(h => [h.hook, h]))
        if (by[hotRule]?.classification !== 'hot' || !live.summary.hotHooksForTuning.includes(hotRule)) {
          fail(`C3 子規則一天 60 筆應為 hot 並進 hotHooksForTuning,實得 ${by[hotRule]?.classification},清單=${JSON.stringify(live.summary.hotHooksForTuning)}`)
        } else pass(`C3 ${hotRule}(${dispatcher} 的子規則)一天 60 筆 → hot,在 hotHooksForTuning 裡`)
        const notFlagged = quietRules.filter(n => by[n]?.classification !== 'dead' || !by[n]?.retireCandidate || !by[n]?.retireReason.includes(dispatcher))
        if (notFlagged.length) fail(`C3 ${dispatcher} 活著、子規則零筆,應 dead 並提名(理由要點名 dispatcher):${notFlagged.map(n => `${n}=${by[n]?.classification}`).join(', ')}`)
        else pass(`C3 ${dispatcher} 窗內有紀錄 → 它其餘 ${quietRules.length} 條零筆的子規則全標 dead 並提名,理由點名 ${dispatcher}`)
        const others = subRows.filter(h => !h.dispatchedBy.includes(dispatcher)).map(h => h.hook)
        const othersWrong = others.filter(n => by[n]?.classification !== 'dispatched' || by[n]?.retireCandidate)
        if (othersWrong.length) fail(`C3 別的 dispatcher 仍零筆,它的子規則不得被提名:${othersWrong.join(', ')}`)
        else pass(`C3 別支 dispatcher 仍零筆 → 它的 ${others.length} 條子規則維持 dispatched、零提名`)
      }
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  }

  // ── Part D:夾具 repo —— 每一格的答案都是寫死的,不隨真 repo 的 hook 增減漂移 ───────
  // 註冊 6 支:instrumented.sh(有寫紀錄、有 fire)、quiet.sh(有寫紀錄、零 fire)、silent.sh(不寫紀錄)、
  // legacy.sh(不寫紀錄,但 log 裡有拿掉量具之前的窗內紀錄)、
  // dispatcher.sh(有寫紀錄、零 fire、叫 lib/_rule.sh)、busy_dispatcher.sh(有寫紀錄、窗內有 fire、叫
  // lib/_hot_rule.sh、_quiet_rule.sh、_stale_rule.sh、_mute_rule.sh,並 source 共用的 lib/_shared.sh)。
  // hooks/ 目錄裡另有被 source 的 _log-fire.sh;log 另有 gone.sh(早已退場)。
  // 真 repo 的 .git/governance-runtime 不能拿來刪,「全新 clone」那一格也在這裡驗。
  {
    const SRC = process.cwd()
    const fixture = mkdtempSync(join(tmpdir(), 'audit-hook-quality-fixture-'))
    try {
      const copy = (from, to = from) => {
        mkdirSync(dirname(join(fixture, to)), { recursive: true })
        copyFileSync(join(SRC, from), join(fixture, to))
      }
      for (const file of [
        'scripts/audit-hook-quality.mjs',
        'scripts/lib/hook-fire-observability.mjs',
        'scripts/lib/governance-runtime-evidence.mjs',
        'scripts/lib/provider-runtime-validation.mjs',
        'scripts/lib/provider-runtime-contract.mjs',
        'generated/governance/provider-runtime-validator.mjs',
        'packages/governance/canonical/providers.json',
        `${HOOK_DIR}/_log-fire.sh`,
      ]) copy(file)
      copy('packages/governance/src/closed-tool-execution.mjs', 'scripts/lib/closed-tool-execution.mjs')
      const HOOKS = join(fixture, HOOK_DIR)
      mkdirSync(join(HOOKS, 'lib'), { recursive: true })
      const logged = '#!/bin/bash\nsource "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire\n'
      const libLogged = '#!/bin/bash\nsource "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire\n'
      writeFileSync(join(HOOKS, 'instrumented.sh'), `${logged}exit 0\n`)
      writeFileSync(join(HOOKS, 'quiet.sh'), `${logged}exit 0\n`)
      writeFileSync(join(HOOKS, 'silent.sh'), '#!/bin/bash\n# 這支刻意不呼叫 log_hook_fire\nexit 0\n')
      writeFileSync(join(HOOKS, 'legacy.sh'), '#!/bin/bash\nexit 0\n')
      writeFileSync(join(HOOKS, 'dispatcher.sh'), `${logged}LIB_DIR="$(dirname "$0")/lib"\nbash "$LIB_DIR/_rule.sh"\n`)
      writeFileSync(join(HOOKS, 'busy_dispatcher.sh'), [
        logged.trimEnd(),
        'LIB_DIR="$(dirname "$0")/lib"',
        'source "$LIB_DIR/_shared.sh"',
        'for helper in "$LIB_DIR/_hot_rule.sh" "$LIB_DIR/_quiet_rule.sh" "$LIB_DIR/_stale_rule.sh" "$LIB_DIR/_mute_rule.sh"; do bash "$helper"; done',
        '',
      ].join('\n'))
      for (const rule of ['_rule.sh', '_hot_rule.sh', '_quiet_rule.sh', '_stale_rule.sh']) writeFileSync(join(HOOKS, 'lib', rule), `${libLogged}exit 0\n`)
      writeFileSync(join(HOOKS, 'lib/_mute_rule.sh'), '#!/bin/bash\n# 子規則,但刻意不呼叫 log_hook_fire\nexit 0\n')
      writeFileSync(join(HOOKS, 'lib/_shared.sh'), '# 被 source 的共用 helper,不寫紀錄\nshared_helper() { :; }\n')
      const registration = (hooks) => JSON.stringify({
        $schema: './registrations.schema.json',
        schemaVersion: 1,
        hooks: { PostToolUse: [{ matcher: 'Edit', hooks: hooks.map(hook => ({ kind: 'hook', hook, runtime: 'bash', outputMode: 'diagnostic' })) }] },
      }, null, 2)
      const REGISTERED_FIXTURE = ['instrumented.sh', 'quiet.sh', 'silent.sh', 'legacy.sh', 'dispatcher.sh', 'busy_dispatcher.sh']
      const REGISTRATIONS = join(HOOKS, 'registrations.json')
      const init = spawnSync('git', ['init', '-q', fixture], { encoding: 'utf8' })
      if (init.status !== 0) throw new Error(`夾具 git init 失敗:${init.stderr}`)
      const fixtureGit = spawnSync('git', ['-C', fixture, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).stdout.trim()
      if (!fixtureGit || !realpathSync(fixtureGit).startsWith(`${realpathSync(fixture)}/`)) {
        throw new Error(`夾具的 git 目錄不在夾具裡(${fixtureGit})—— 不准對外層 repo 跑`)
      }
      const fixtureRuntime = join(fixtureGit, 'governance-runtime')
      const fixtureOut = join(fixtureRuntime, 'evidence/audit/hook-quality-report.json')
      const runFixture = () => {
        const env = { ...process.env, GOVERNANCE_RUNTIME_ROOT: fixtureRuntime, GOVERNANCE_STATE_DIR: fixtureRuntime }
        delete env.GOVERNANCE_READ_ONLY
        const result = spawnSync(process.execPath, ['--', 'scripts/audit-hook-quality.mjs'], { cwd: fixture, env, encoding: 'utf8' })
        return { status: result.status, stderr: result.stderr, report: result.status === 0 ? JSON.parse(readFileSync(fixtureOut, 'utf8')) : null }
      }
      const expectRows = (label, report, rows) => {
        const by = Object.fromEntries(report.hooks.map(h => [h.hook, h]))
        for (const [hook, classification, retire, why] of rows) {
          const row = by[hook]
          if (!row) fail(`${label} ${hook} 不在報告裡(${why})`)
          else if (row.classification !== classification || row.retireCandidate !== retire) {
            fail(`${label} ${hook}:預期 ${classification}/提名=${retire},實得 ${row.classification}/提名=${row.retireCandidate} —— ${why}`)
          } else pass(`${label} ${hook} → ${classification},提名=${retire}(${why})`)
        }
        return by
      }

      // D1 紅面:清單上的 hook 檔不在 → exit≠0,而且 evidence 目錄不得被建出來(報告確定要寫才建)
      writeFileSync(REGISTRATIONS, registration([...REGISTERED_FIXTURE, 'vanished.sh']))
      {
        const { status } = runFixture()
        if (status === 0) fail('D1 註冊清單有 vanished.sh、檔案卻不在,閘竟然照樣出報告')
        else if (existsSync(join(fixtureRuntime, 'evidence'))) fail('D1 閘失敗了卻已經先建好 evidence 目錄(prepareRuntimeEvidenceFile 又跑到最前面了)')
        else pass(`D1 清單上的 hook 檔不在 → exit ${status},沒留下 evidence 目錄`)
      }

      // D2 紅面:註冊清單不合 schema → exit≠0
      writeFileSync(REGISTRATIONS, JSON.stringify({ schemaVersion: 1, hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ kind: 'hook', hook: 'silent.sh' }] }] } }))
      {
        const { status } = runFixture()
        if (status === 0) fail('D2 註冊清單缺 runtime / outputMode,閘竟然照樣出報告')
        else pass(`D2 註冊清單不合 schema → exit ${status}`)
      }

      // D3 綠面:全新 repo(清單對得上,但連 governance-runtime 都沒有)→ exit 0、blind、fireLogPresent=false、零提名
      writeFileSync(REGISTRATIONS, registration(REGISTERED_FIXTURE))
      {
        // D1/D2 本來就不該留下任何狀態;萬一留下了(閘被弄壞時),先清掉,這一格照樣量得到「全新 clone」
        rmSync(fixtureRuntime, { recursive: true, force: true })
        const { status, stderr, report } = runFixture()
        if (status !== 0) fail(`D3 全新 repo(沒有 governance-runtime)應 exit 0 出全盲報告,實得 ${status}:${stderr}`)
        else if (!report.summary.observation.blind || report.summary.observation.fireLogPresent !== false) {
          fail(`D3 全新 repo:應 blind=true、fireLogPresent=false,實得 blind=${report.summary.observation.blind}、fireLogPresent=${report.summary.observation.fireLogPresent}`)
        } else if (report.summary.retireCandidates !== 0) fail(`D3 全新 repo 全盲卻提名 ${report.summary.retireCandidates} 支`)
        else {
          pass('D3 全新 repo(連 governance-runtime 都沒有)→ exit 0,blind=true,fireLogPresent=false,retire=0')
          expectRows('D3', report, [
            ['quiet.sh', 'unknown', false, '全盲:有寫紀錄的註冊 hook 零筆 → unknown'],
            ['silent.sh', 'not-instrumented', false, '沒裝量具是靜態事實,全盲也一樣'],
            ['_quiet_rule.sh', 'dispatched', false, '全盲:子規則零筆不提名(log 裡沒有它,是從 hooks/lib/ 列出來的)'],
          ])
        }
      }

      // D4 綠面:健康 log → 每一支的分類都要剛好是預期值
      mkdirSync(fixtureRuntime, { recursive: true })
      writeFileSync(join(fixtureRuntime, LOG_NAME), [
        fireLine('gone.sh', realAgo(200)),
        fireLine('instrumented.sh', realAgo(200)),
        fireLine('instrumented.sh', realAgo(0)),
        // dispatcher.sh 窗內零筆;它的子規則最後一筆在窗外
        fireLine('_rule.sh', realAgo(200)),
        // busy_dispatcher.sh 窗內 3 筆;_hot_rule.sh 一天 60 筆;_stale_rule.sh、_mute_rule.sh 只有窗外的舊紀錄;
        // _quiet_rule.sh 一筆都沒有(只能從 hooks/lib/ 列出來)
        ...Array.from({ length: 3 }, () => fireLine('busy_dispatcher.sh', realAgo(1))),
        ...Array.from({ length: 60 }, () => fireLine('_hot_rule.sh', realAgo(0))),
        fireLine('_stale_rule.sh', realAgo(200)),
        fireLine('_mute_rule.sh', realAgo(200)),
        // legacy.sh 不寫紀錄,這筆是拿掉量具之前寫的
        fireLine('legacy.sh', realAgo(1)),
      ].join(''))
      {
        const { status, stderr, report } = runFixture()
        if (status !== 0) fail(`D4 健康夾具應 exit 0,實得 ${status}:${stderr}`)
        else {
          if (report.summary.observation.blind) fail(`D4 健康夾具被判全盲:${JSON.stringify(report.summary.observation.reasons)}`)
          const by = expectRows('D4', report, [
            ['instrumented.sh', 'cool', false, '有紀錄的註冊 hook'],
            ['quiet.sh', 'dead', true, '綠面:有寫紀錄、零 fire → 仍然標得出 dead 並提名'],
            ['dispatcher.sh', 'dead', true, '有寫紀錄、零 fire 的 dispatcher 本身 → dead 並提名'],
            ['busy_dispatcher.sh', 'cool', false, '窗內 3 筆'],
            ['silent.sh', 'not-instrumented', false, '不寫紀錄 → 不得被提名'],
            ['legacy.sh', 'cool', false, '不寫紀錄、但窗內有舊紀錄 → 紀錄照用,照頻率分(not-instrumented 只解釋零筆)'],
            ['_rule.sh', 'dispatched', false, 'dispatcher 窗內也零筆 → 子規則零筆沒有獨立證據力,不提名(答案看 dispatcher.sh 那一列)'],
            ['_hot_rule.sh', 'hot', false, '子規則一天 60 筆 → 照頻率分 hot(反駁 #1(a):不得被 dispatched 蓋掉)'],
            ['_quiet_rule.sh', 'dead', true, '違規情境:dispatcher 活著、子規則一筆都沒有 → 照樣 dead 並提名(反駁 #1(b))'],
            ['_stale_rule.sh', 'dead', true, '違規情境:dispatcher 活著、子規則只剩窗外舊紀錄 → dead 並提名'],
            ['_mute_rule.sh', 'not-instrumented', false, '子規則不寫紀錄 → dispatcher 活著也不能拿它的零筆當證據'],
            ['gone.sh', 'orphan', true, '不在清單也沒人叫 → orphan'],
          ])
          if (by['_log-fire.sh']) fail('D4 _log-fire.sh 在 hooks/ 目錄裡,但它不是註冊 hook,不得出現在報告')
          else pass('D4 _log-fire.sh 在目錄裡、不在報告裡')
          if (by['_shared.sh']) fail('D4 _shared.sh 是被 source 的共用 helper(不寫紀錄),不得被當成子規則列進報告')
          else pass('D4 被 source 的 _shared.sh 不在報告裡')
          if (report.summary.totalRegisteredHooks !== 6) fail(`D4 totalRegisteredHooks 應為 6,實得 ${report.summary.totalRegisteredHooks}`)
          if (JSON.stringify(by['_rule.sh']?.dispatchedBy) !== JSON.stringify(['dispatcher.sh'])) {
            fail(`D4 _rule.sh 的 dispatchedBy 應為 [dispatcher.sh],實得 ${JSON.stringify(by['_rule.sh']?.dispatchedBy)}`)
          }
          if (JSON.stringify(report.summary.hotHooksForTuning) !== JSON.stringify(['_hot_rule.sh'])) {
            fail(`D4 hotHooksForTuning 應為 [_hot_rule.sh],實得 ${JSON.stringify(report.summary.hotHooksForTuning)}`)
          } else pass('D4 hotHooksForTuning = [_hot_rule.sh](子規則的 regex 住在它自己,不是 dispatcher)')
          if (!by['_quiet_rule.sh']?.retireReason?.includes('busy_dispatcher.sh(窗內 3 筆)')) {
            fail(`D4 _quiet_rule.sh 的理由要點名 dispatcher 與它的窗內筆數,實得 ${by['_quiet_rule.sh']?.retireReason}`)
          } else pass('D4 _quiet_rule.sh 的理由點名 busy_dispatcher.sh(窗內 3 筆)')
          if (JSON.stringify([...report.summary.notInstrumented].sort()) !== JSON.stringify(['_mute_rule.sh', 'legacy.sh', 'silent.sh'])) {
            fail(`D4 summary.notInstrumented(原始碼的性質,不是分類結果)應為 [_mute_rule.sh, legacy.sh, silent.sh],實得 ${JSON.stringify(report.summary.notInstrumented)}`)
          } else pass('D4 summary.notInstrumented = [_mute_rule.sh, legacy.sh, silent.sh](legacy.sh 分類是 cool,但它仍然不寫紀錄)')
        }
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }

  // ── Part E:「有沒有裝量具」與分類優先序(純函式)──────────────────────────────
  // 前三格是 repo 裡實際出現的三種寫法(綠);其餘每一種偏離都要判「沒裝」(紅)。
  {
    const INSTRUMENT_TABLE = [
      ['source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire', true, '註冊 hook 的寫法'],
      ['source "$(dirname "$0")/../_log-fire.sh" 2>/dev/null && log_hook_fire', true, 'lib 子規則的寫法'],
      ['source "$HOOK_DIR/_log-fire.sh" 2>/dev/null && log_hook_fire', true, '先解出 HOOK_DIR 的寫法'],
      ['# source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire', false, '只寫在註解裡'],
      ['  source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire', false, '縮排(在函式或分支裡,不保證每次都跑)'],
      ['source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire other.sh', false, '用別的名字記'],
      ['source "$(dirname "$0")/_log-fire.sh" 2>/dev/null', false, '只 source 不呼叫'],
      ['log_hook_fire', false, '呼叫但沒 source,函式根本不存在'],
    ]
    for (const [line, expected, why] of INSTRUMENT_TABLE) {
      const got = isFireInstrumented(`#!/bin/bash\n${line}\nexit 0\n`)
      if (got !== expected) fail(`isFireInstrumented(${why}):預期 ${expected} 實得 ${got}`)
      else pass(`isFireInstrumented ${expected ? '綠' : '紅'}:${why}`)
    }
    const sub = { registered: false, instrumented: true, dispatchedBy: ['d.sh'] }
    // [輸入, 預期分類, 預期提名, 理由]
    const PRIORITY_TABLE = [
      [{ registered: true, instrumented: false, blind: true, fires6mo: 0, firePerDay: 0 }, 'not-instrumented', false, '全盲也一樣:沒裝量具是靜態事實,先於儀器盲不盲'],
      [{ registered: true, instrumented: false, blind: false, fires6mo: 0, firePerDay: 0 }, 'not-instrumented', false, '觀測窗健康也不得判 dead'],
      [{ registered: true, instrumented: false, blind: false, fires6mo: 4000, firePerDay: 120 }, 'hot', false, '不寫紀錄、但窗內有拿掉量具前的紀錄 → 紀錄照用,照頻率分'],
      [{ registered: false, dispatchedBy: ['post_edit_dispatcher.sh'], blind: false, fires6mo: 20000, firePerDay: 120 }, 'hot', false, '反駁 #1(a) 原樣輸入:子規則有在 fire → hot,不得被 dispatched 蓋掉'],
      [{ ...sub, dispatcherFires6mo: { 'd.sh': 9000 }, blind: false, fires6mo: 900, firePerDay: 20 }, 'warm', false, '子規則有在 fire → warm'],
      [{ ...sub, dispatcherFires6mo: { 'd.sh': 0 }, blind: false, fires6mo: 0, firePerDay: 0 }, 'dispatched', false, 'dispatcher 也零筆 → 子規則零筆沒有獨立證據力'],
      [{ ...sub, dispatcherFires6mo: { 'd.sh': 40 }, blind: true, fires6mo: 0, firePerDay: 0 }, 'dispatched', false, '全盲 → 不提名(全盲時零提名)'],
      [{ ...sub, dispatcherFires6mo: { 'd.sh': 40 }, blind: false, fires6mo: 0, firePerDay: 0 }, 'dead', true, '違規情境:dispatcher 活著、子規則零筆 → dead 並提名(反駁 #1(b))'],
      [{ ...sub, dispatchedBy: ['a.sh', 'd.sh'], dispatcherFires6mo: { 'a.sh': 0, 'd.sh': 40 }, blind: false, fires6mo: 0, firePerDay: 0 }, 'dead', true, '兩支 dispatcher 只要有一支活著就提名'],
      [{ ...sub, instrumented: false, dispatcherFires6mo: { 'd.sh': 40 }, blind: false, fires6mo: 0, firePerDay: 0 }, 'not-instrumented', false, '子規則不寫紀錄 → dispatcher 活著也不能拿零筆當證據'],
      [{ registered: true, instrumented: true, blind: false, fires6mo: 0, firePerDay: 0 }, 'dead', true, '對照:有裝量具、窗健康、零筆 → dead'],
      [{ registered: true, instrumented: true, blind: true, fires6mo: 0, firePerDay: 0 }, 'unknown', false, '對照:全盲 → unknown'],
      [{ registered: false, instrumented: null, blind: false, fires6mo: 0, firePerDay: 0 }, 'orphan', true, '沒註冊、也沒有 dispatcher 叫它 → orphan'],
    ]
    for (const [input, expected, nominate, why] of PRIORITY_TABLE) {
      const verdict = classifyHook(input)
      if (verdict.classification !== expected || verdict.retireCandidate !== nominate) {
        fail(`classifyHook(${why}):預期 ${expected}/提名=${nominate},實得 ${verdict.classification}/提名=${verdict.retireCandidate}`)
      } else pass(`classifyHook → ${expected}/提名=${nominate}(${why})`)
    }
    // 不提名的子規則,理由必須指向報告裡查得到的東西(dispatcher 那一列,或全盲原因),不得指向不存在的審查步驟
    const quietDispatcher = classifyHook({ ...sub, dispatcherFires6mo: { 'd.sh': 0 }, blind: false, fires6mo: 0, firePerDay: 0 }).retireReason
    const blindDispatcher = classifyHook({ ...sub, dispatcherFires6mo: { 'd.sh': 40 }, blind: true, fires6mo: 0, firePerDay: 0 }).retireReason
    if (!quietDispatcher.includes('d.sh 那一列')) fail(`dispatched(dispatcher 零筆)的理由要指向 dispatcher 那一列,實得 ${quietDispatcher}`)
    else if (!blindDispatcher.includes(BLIND_RETIRE_REASON)) fail(`dispatched(全盲)的理由要帶全盲原因,實得 ${blindDispatcher}`)
    else pass('dispatched 的兩種理由分別指向 dispatcher 那一列 / 全盲原因')
  }
} finally {
  if (outExisted) writeFileSync(OUT, outOrig)
  else if (existsSync(OUT)) unlinkSync(OUT)
}

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
