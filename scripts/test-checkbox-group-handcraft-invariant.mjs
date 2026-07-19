#!/usr/bin/env node
// meta-test for checkbox-group-handcraft-invariant — 注入「手刻容器包多個 option Checkbox」→ gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// gate 掃 packages/design-system/src/**/*.tsx,偵測 <div space-y-N/grid/flex-col>{2+ <Checkbox label= />}(非 CheckboxGroup 包)。
// 注入目標選非 checkbox 檔(Badge),確保 200 chars before 不含 'CheckboxGroup'(否則 gate 的 before-guard 會放行 → 假綠)。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/checkbox-group-handcraft-invariant.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真實違規)'); process.exit(1) }
console.log('✓ baseline PASS(0 個手刻選項組)')

// 2) 注入違規 → 必 FAIL → 還原
//    真實違規 = 手刻 <div space-y-2> 包 2 個帶可見 label 的 <Checkbox />(gate DS_GROUP regex 直命中)。
const target = 'packages/design-system/src/components/Badge/badge.tsx'
const orig = readFileSync(target, 'utf8')
const violation = '\n// meta-test-injected handcraft checkbox option-group (temporary)\n' +
  '<div className="space-y-2"><Checkbox label="meta-test-inject-a" /><Checkbox label="meta-test-inject-b" /></div>\n'
try {
  writeFileSync(target, orig + violation)
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入手刻 option-group 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS(還原不完整)'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
