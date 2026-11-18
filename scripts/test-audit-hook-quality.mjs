#!/usr/bin/env node
// meta-test for audit-hook-quality(PNG P4.3 gate-meta-test 家族)。每一部分都兩面:該紅的會紅、該綠的會綠。
//
// 2026-09-24 加 Part B / Part C:只證明「log 檔不見時閘會死」證明不了閘**讀到 log 之後判得對不對**。
// 而那正是當天出事的地方 —— 遙測預設關閉、log 只有一筆,閘把全部 60 支 hook 標成 `dead` 並提名 retire。
// M37:「沒觀察到」被當成「沒發生」。Part B 測判準本身(純函式),Part C 測那支閘真的有在消費它(端到端)。
//
// 2026-11-18(knowledge-prune WP-07 D2-3):log 不存在不再 exit 2,改出跟空 log 同一份全盲報告(Part A)。
//   舊版 Part A 把「log 不見 → exit 2」當成閘來驗,可那正是 SKILL 叫人看 summary.observation 時,
//   預設狀態下什麼都看不到的原因。evidence 目錄改到確定要寫報告時才建 —— 紅面(閘死掉時不得留下目錄)
//   與「全新 clone 連 governance-runtime 都沒有」的綠面,由 Part D 的夾具 repo 驗(不碰真 repo 的狀態目錄)。
//
// 真實 runtime 報告(OUT)每跑一次閘都會被覆寫:開頭存一份、最後一定還原(或刪掉本來沒有的)。
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { assessObservation, readFireRecords, DEFAULT_WINDOW_MS, DEFAULT_LIVE_TOLERANCE_MS } from './lib/hook-fire-observability.mjs'

const gitDirectoryProbe = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' })
if (gitDirectoryProbe.status !== 0) throw new Error(`git directory probe failed:${gitDirectoryProbe.stderr}`)
const GIT_DIR = gitDirectoryProbe.stdout.trim()
const RUNTIME_ROOT = join(GIT_DIR, 'governance-runtime')
const OUT = join(RUNTIME_ROOT, 'evidence/audit/hook-quality-report.json')
const LOG_NAME = 'hook-fires-per-hook.jsonl'
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

  // ── Part C:端到端 —— 那支閘真的有在消費上面那個判準嗎 ───────────────────
  // 判定表全綠只證明純函式對。這一層餵兩種 log 給真正的 audit-hook-quality.mjs,
  // 看它的輸出兩面都會動:全盲 → 零筆提名;健康 → 仍然標得出 dead。
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

      const healthy = runWith([
        fireLine('stop_passive_logging.sh', realAgo(200)),
        fireLine('stop_passive_logging.sh', realAgo(0)),
      ])
      if (healthy.summary.observation?.blind) {
        fail(`端到端綠面:健康 log 卻判成全盲 —— 守門過嚴會把整支稽核廢掉。reasons=${JSON.stringify(healthy.summary.observation.reasons)}`)
      } else if (healthy.summary.classifications.dead === 0 || healthy.summary.retireCandidates === 0) {
        fail('端到端綠面:儀器沒盲,卻一個 dead / retire 提名都生不出來')
      } else pass(`端到端綠面:健康 log → blind=false,dead=${healthy.summary.classifications.dead},retire=${healthy.summary.retireCandidates}`)
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  }

  // ── Part D:夾具 repo —— 真 repo 的 .git/governance-runtime 不能拿來刪,用全新夾具代替 ───────
  // D0a 紅面:閘中途死掉(hooks 目錄讀不到)→ exit≠0,而且 evidence 目錄不得被建出來(報告確定要寫才建)。
  // D0b 綠面:全新 repo,連 governance-runtime 都沒有(真正的「全新 clone」)→ exit 0、blind、fireLogPresent=false。
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
      ]) copy(file)
      copy('packages/governance/src/closed-tool-execution.mjs', 'scripts/lib/closed-tool-execution.mjs')
      const HOOKS = join(fixture, 'packages/design-system/ds-canonical/hooks')
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

      // D0a:hooks 目錄還沒建 → 閘在列 hook 時死掉
      {
        const { status } = runFixture()
        if (status === 0) fail('D0a hooks 目錄不存在,閘竟然照樣出報告')
        else if (existsSync(join(fixtureRuntime, 'evidence'))) fail('D0a 閘失敗了卻已經先建好 evidence 目錄(prepareRuntimeEvidenceFile 又跑到最前面了)')
        else pass(`D0a 閘中途失敗 → exit ${status},沒留下 evidence 目錄`)
      }

      // D0b:補上 hooks 目錄;governance-runtime 仍然不存在
      mkdirSync(HOOKS, { recursive: true })
      writeFileSync(join(HOOKS, 'example.sh'), '#!/bin/bash\nsource "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire\n')
      {
        if (existsSync(fixtureRuntime)) throw new Error('D0b 前提不成立:夾具的 governance-runtime 已經存在')
        const { status, stderr, report } = runFixture()
        if (status !== 0) fail(`D0b 全新 repo(沒有 governance-runtime)應 exit 0 出全盲報告,實得 ${status}:${stderr}`)
        else if (!report.summary.observation.blind || report.summary.observation.fireLogPresent !== false) {
          fail(`D0b 全新 repo:應 blind=true、fireLogPresent=false,實得 blind=${report.summary.observation.blind}、fireLogPresent=${report.summary.observation.fireLogPresent}`)
        } else if (report.summary.retireCandidates !== 0) fail(`D0b 全新 repo 全盲卻提名 ${report.summary.retireCandidates} 支`)
        else pass('D0b 全新 repo(連 governance-runtime 都沒有)→ exit 0,blind=true,fireLogPresent=false,retire=0')
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
} finally {
  if (outExisted) writeFileSync(OUT, outOrig)
  else if (existsSync(OUT)) unlinkSync(OUT)
}

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
