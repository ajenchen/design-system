#!/usr/bin/env node
// meta-test for audit-hook-quality — 注入已知違規(fire log 消失)→ gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// audit-hook-quality.mjs 是 observability report,唯一 non-zero 退出路徑 =
// `if (!existsSync(FIRE_LOG)) process.exit(2)`(script L31-34)。內容變異(corrupt JSON /
// 空檔 / 缺欄位)全被 graceful 吞掉仍 exit 0 → 真正能 toggle gate 的注入 = 讓 FIRE_LOG 消失。
// 側寫:gate 會寫 tracked 的 hook-quality-report.json(OUT)→ 一併 snapshot/restore 保持乾淨 tree。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-hook-quality.mjs'
const FIRE_LOG = '.claude/logs/hook-fires-per-hook.jsonl'
const OUT = '.claude/logs/hook-quality-report.json'
let ok = true

// --- snapshot 原始狀態(FIRE_LOG 常被 gitignore 而缺席;OUT 為 tracked report)---
const logExisted = existsSync(FIRE_LOG)
const outExisted = existsSync(OUT)
const outOrig = outExisted ? readFileSync(OUT, 'utf8') : null
// baseline 內容:既有則沿用,否則合成一條合法 fire 讓 gate 能 PASS(worktree gitignored 情境)
const SYNTH = JSON.stringify({ hook: 'metatest_probe.sh', ts: new Date().toISOString() }) + '\n'
const baseline = logExisted ? readFileSync(FIRE_LOG, 'utf8') : SYNTH
if (!logExisted) writeFileSync(FIRE_LOG, baseline)

try {
  // 1) baseline 必 PASS(FIRE_LOG 在場)
  if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); ok = false }
  else console.log('✓ baseline PASS(fire log 在場,exit 0)')

  // 2) 注入違規 → 必 FAIL → 還原
  //    移除 FIRE_LOG,觸發 gate 的真實 detection(!existsSync → exit 2)
  try {
    unlinkSync(FIRE_LOG)
    const code = run(GATE)
    if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
    else console.log('✓ 注入違規被抓(fire log 消失,exit ' + code + ')')
  } finally {
    writeFileSync(FIRE_LOG, baseline)
  }

  // 3) 還原後必 PASS
  if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); ok = false }
  else console.log('✓ 還原後 PASS(exit 0)')
} finally {
  // 還原 tracked report(gate 每次 run 會覆寫 OUT)
  if (outExisted) writeFileSync(OUT, outOrig)
  else if (existsSync(OUT)) unlinkSync(OUT)
  // 原本無 FIRE_LOG(gitignored)→ 清掉合成檔留乾淨 tree
  if (!logExisted && existsSync(FIRE_LOG)) unlinkSync(FIRE_LOG)
}

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
