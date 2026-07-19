#!/usr/bin/env node
// meta-test for audit-failure-class-coverage — 注入已知違規 → gate 必 exit 非 0 → 還原(PNG P4.3 gate-meta-test 家族)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-failure-class-coverage.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    把第一個 class 的 status 改成非法值(不在 {protected, remediating, judgment})
//    → gate line 53-55 必 push error → --check 下 exit 1
const target = '.claude/references/failure-class-registry.json'
const orig = readFileSync(target, 'utf8')
try {
  const reg = JSON.parse(orig)
  reg.classes[0].status = 'bogus-invalid-status'
  writeFileSync(target, JSON.stringify(reg, null, 2))
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
