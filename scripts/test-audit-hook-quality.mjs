#!/usr/bin/env node
// meta-test for audit-hook-quality — 注入已知違規(fire log 消失)→ gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// audit-hook-quality.mjs 是 observability report,唯一 non-zero 退出路徑 =
// `if (!existsSync(FIRE_LOG)) process.exit(2)`(script L31-34)。內容變異(corrupt JSON /
// 空檔 / 缺欄位)全被 graceful 吞掉仍 exit 0 → 真正能 toggle gate 的注入 = 讓 FIRE_LOG 消失。
// Test telemetry stays in an isolated child of the existing Git-owned provider runtime.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'

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

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
