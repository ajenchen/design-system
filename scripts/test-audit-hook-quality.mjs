#!/usr/bin/env node
// meta-test for audit-hook-quality — 注入已知違規(fire log 消失)→ gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// audit-hook-quality.mjs 是 observability report,唯一 non-zero 退出路徑 =
// `if (!existsSync(FIRE_LOG)) process.exit(2)`(script L31-34)。內容變異(corrupt JSON /
// 空檔 / 缺欄位)全被 graceful 吞掉仍 exit 0 → 真正能 toggle gate 的注入 = 讓 FIRE_LOG 消失。
// Test telemetry stays in an isolated child of the existing Git-owned provider runtime.
//
// 2026-09-24 加 Part B / Part C:上面那三題只證明「log 檔不見時閘會死」,證明不了
// 閘**讀到 log 之後判得對不對**。而那正是當天出事的地方 —— 遙測預設關閉、log 只有一筆,
// 閘把全部 60 支 hook 標成 `dead` 並提名 retire。M37:「沒觀察到」被當成「沒發生」。
// Part B 測判準本身(純函式,紅面 4 綠面 2),Part C 測那支閘真的有在消費它(端到端兩面)。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assessObservation, readFireRecords, DEFAULT_WINDOW_MS, DEFAULT_LIVE_TOLERANCE_MS } from './lib/hook-fire-observability.mjs'

const gitDirectoryProbe = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' })
if (gitDirectoryProbe.status !== 0) throw new Error(`git directory probe failed:${gitDirectoryProbe.stderr}`)
const GIT_DIR = gitDirectoryProbe.stdout.trim()
const RUNTIME_ROOT = join(GIT_DIR, 'governance-runtime')
const STATE_DIR = join(RUNTIME_ROOT, `test-audit-hook-quality-${process.pid}`)
mkdirSync(STATE_DIR, { recursive: true })
const TEST_ENV = { ...process.env, GOVERNANCE_RUNTIME_ROOT: RUNTIME_ROOT, GOVERNANCE_STATE_DIR: STATE_DIR }
delete TEST_ENV.GOVERNANCE_READ_ONLY
const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-hook-quality.mjs'], { stdio: 'pipe', env: TEST_ENV }).status ?? 1
const FIRE_LOG = join(STATE_DIR, 'hook-fires-per-hook.jsonl')
const OUT = join(RUNTIME_ROOT, 'evidence/audit/hook-quality-report.json')
let ok = true

// --- snapshot 原始狀態(FIRE_LOG 及 OUT 都是 Git-private runtime state)---
const logExisted = existsSync(FIRE_LOG)
const outExisted = existsSync(OUT)
const outOrig = outExisted ? readFileSync(OUT, 'utf8') : null
// baseline 內容:既有則沿用,否則合成一條合法 fire 讓 gate 能 PASS(worktree gitignored 情境)
const SYNTH = JSON.stringify({ hook: 'metatest_probe.sh', ts: new Date().toISOString() }) + '\n'
const baseline = logExisted ? readFileSync(FIRE_LOG, 'utf8') : SYNTH
if (!logExisted) writeFileSync(FIRE_LOG, baseline)

try {
  // 1) baseline 必 PASS(FIRE_LOG 在場)
  if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); ok = false }
  else console.log('✓ baseline PASS(fire log 在場,exit 0)')

  // 2) 注入違規 → 必 FAIL → 還原
  //    移除 FIRE_LOG,觸發 gate 的真實 detection(!existsSync → exit 2)
  try {
    unlinkSync(FIRE_LOG)
  const code = run()
    if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
    else console.log('✓ 注入違規被抓(fire log 消失,exit ' + code + ')')
  } finally {
    writeFileSync(FIRE_LOG, baseline)
  }

  // 3) 還原後必 PASS
  if (run() !== 0) { console.error('✗ 還原後應 PASS'); ok = false }
  else console.log('✓ 還原後 PASS(exit 0)')
} finally {
  // 還原 runtime report(gate 每次 run 會覆寫 OUT)
  if (outExisted) writeFileSync(OUT, outOrig)
  else if (existsSync(OUT)) unlinkSync(OUT)
  // 原本無 FIRE_LOG(gitignored)→ 清掉合成檔留乾淨 tree
  if (!logExisted && existsSync(FIRE_LOG)) unlinkSync(FIRE_LOG)
  rmSync(STATE_DIR, { recursive: true, force: true })
}


// ── Part B:判準本身 —— 「窗內零筆」這句話什麼時候說得出口 ─────────────────
// 紅面 4 格、綠面 2 格。只有紅面的守門跟只有綠面的守門一樣沒用。
// 綠面第二格(F)刻意把窗頭那筆只放進輪替封存檔,逼 readFireRecords 真的去讀它 ——
// 只測 assessObservation 的話,封存檔沒被讀進來這個 bug 永遠測不到(M32 參數邊界盲點)。
{
  const NOW = Date.parse('2026-09-24T00:00:00Z')
  const DAY = 24 * 60 * 60 * 1000
  const ago = (days) => new Date(NOW - days * DAY).toISOString()
  const line = (hook, ts) => JSON.stringify({ ts, hook }) + '\n'
  const TABLE = [
    { name: 'A 空 log(遙測從沒開過)', current: [], archives: {}, blind: true,
      why: '零筆是預設狀態 —— 這正是把 60 支 hook 全標 dead 的那一次' },
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
      writeFileSync(join(dir, 'hook-fires-per-hook.jsonl'), row.current.map(([h, t]) => line(h, t)).join(''))
      for (const [suffix, rows] of Object.entries(row.archives)) {
        writeFileSync(join(dir, `hook-fires-per-hook.jsonl.${suffix}`), rows.map(([h, t]) => line(h, t)).join(''))
      }
      const verdict = assessObservation({
        fireTimestamps: readFireRecords(dir).map(r => r.ts),
        nowMs: NOW,
        windowMs: DEFAULT_WINDOW_MS,
        liveToleranceMs: DEFAULT_LIVE_TOLERANCE_MS,
      })
      if (verdict.blind !== row.blind) {
        ok = false
        console.error(`✗ ${row.name}:預期 blind=${row.blind} 實得 ${verdict.blind} —— ${row.why}`)
      } else {
        console.log(`✓ ${row.name} → blind=${verdict.blind}(${row.why})`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

// ── Part C:端到端 —— 那支閘真的有在消費上面那個判準嗎 ───────────────────
// 判定表全綠只證明純函式對。這一層餵兩種 log 給真正的 audit-hook-quality.mjs,
// 看它的輸出兩面都會動:全盲 → 零筆提名;健康 → 仍然標得出 dead。
{
  const C_STATE = join(RUNTIME_ROOT, `test-audit-hook-quality-obs-${process.pid}`)
  const C_LOG = join(C_STATE, 'hook-fires-per-hook.jsonl')
  const C_ENV = { ...process.env, GOVERNANCE_RUNTIME_ROOT: RUNTIME_ROOT, GOVERNANCE_STATE_DIR: C_STATE }
  delete C_ENV.GOVERNANCE_READ_ONLY
  const savedOut = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null
  const runWith = (lines) => {
    rmSync(C_STATE, { recursive: true, force: true })
    mkdirSync(C_STATE, { recursive: true })
    writeFileSync(C_LOG, lines.join(''))
    const status = spawnSync(process.execPath, ['--', 'scripts/audit-hook-quality.mjs'], { stdio: 'pipe', env: C_ENV }).status
    if (status !== 0) throw new Error(`gate 非預期退出:${status}`)
    return JSON.parse(readFileSync(OUT, 'utf8'))
  }
  try {
    const realNow = Date.now()
    const realAgo = (days) => new Date(realNow - days * 24 * 60 * 60 * 1000).toISOString()

    const blind = runWith([])
    if (!blind.summary.observation?.blind) {
      ok = false
      console.error('✗ 端到端紅面:空 log 餵進去,閘竟然說自己沒盲')
    } else if (blind.summary.retireCandidates !== 0 || blind.summary.classifications.dead !== 0) {
      ok = false
      console.error(`✗ 端到端紅面:全盲卻仍產出提名(dead=${blind.summary.classifications.dead} retire=${blind.summary.retireCandidates})`)
    } else {
      console.log(`✓ 端到端紅面:空 log → blind=true,dead=0,retire=0,unknown=${blind.summary.classifications.unknown}`)
    }

    const healthy = runWith([
      JSON.stringify({ ts: realAgo(200), hook: 'stop_passive_logging.sh' }) + '\n',
      JSON.stringify({ ts: realAgo(0), hook: 'stop_passive_logging.sh' }) + '\n',
    ])
    if (healthy.summary.observation?.blind) {
      ok = false
      console.error(`✗ 端到端綠面:健康 log 卻判成全盲 —— 守門過嚴會把整支稽核廢掉。reasons=${JSON.stringify(healthy.summary.observation.reasons)}`)
    } else if (healthy.summary.classifications.dead === 0 || healthy.summary.retireCandidates === 0) {
      ok = false
      console.error('✗ 端到端綠面:儀器沒盲,卻一個 dead / retire 提名都生不出來')
    } else {
      console.log(`✓ 端到端綠面:健康 log → blind=false,dead=${healthy.summary.classifications.dead},retire=${healthy.summary.retireCandidates}`)
    }
  } finally {
    rmSync(C_STATE, { recursive: true, force: true })
    if (savedOut !== null) writeFileSync(OUT, savedOut)
    else if (existsSync(OUT)) unlinkSync(OUT)
  }
}

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
