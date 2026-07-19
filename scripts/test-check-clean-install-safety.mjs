#!/usr/bin/env node
// meta-test for check-clean-install-safety — 注入 consumer-install lifecycle script → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 斷言 published package 無 preinstall/install/postinstall。本 meta-test 在 design-system package.json
// 注入一個 postinstall script → gate 必 exit 1(baseline PASS → 注入 FAIL → 還原 PASS)。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/check-clean-install-safety.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(published package 已有 install-lifecycle script?)'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入 consumer-install lifecycle script → 必 FAIL → 還原
const target = 'packages/design-system/package.json'
const orig = readFileSync(target, 'utf8')
try {
  const pkg = JSON.parse(orig)
  pkg.scripts = { ...(pkg.scripts || {}), postinstall: 'node -e "0" // meta-test probe' }
  writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 postinstall 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入 consumer-install lifecycle script 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
