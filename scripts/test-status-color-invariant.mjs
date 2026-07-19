#!/usr/bin/env node
// meta-test for status-color-invariant — 注入已知違規(status 元件回潮 --primary 狀態填色)→ gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// Gate SSOT: scripts/status-color-invariant.mjs 掃 4 個純 status-display 元件,禁 bg-/text-/var(--primary) 狀態填色(逃生 = per-line `status-color-allow:`)。
// 執行方式:gate 無 --check flag,直接 `node scripts/status-color-invariant.mjs`,fail → exit 1。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/status-color-invariant.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真違規)'); process.exit(1) }
console.log('✓ baseline PASS(4 status 元件全用 --info)')

// 2) 注入違規 → 必 FAIL → 還原
//    target 是 GUARDED[] 之一;注入一行 status 填色回潮 --primary(gate PRIMARY_TOKEN regex 抓 bg-primary)。
const target = 'packages/design-system/src/components/ProgressBar/progress-bar.tsx'
const orig = readFileSync(target, 'utf8')
try {
  // 注入真實會被 gate 抓的違規:status 進度填色從 --info 回潮成 bg-primary。
  writeFileSync(target, orig + '\n// injected-violation: <div className="bg-primary" /> // status 填色回潮\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 bg-primary 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS(restore 失效)'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
