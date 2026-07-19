#!/usr/bin/env node
// meta-test for audit-data-table-row-mode-ssot — 注入已知違規 → gate 必 exit 非零 → 還原(PNG P4.3 gate-meta-test 家族)
//
// 驗這支 gate 真能抓「cell-render scope 內消費 global `autoRowHeight` 而非 per-row `effectiveAutoRowForCell`」的 regression。
// 注入方式:把 cell-render scope 內第一處 `effectiveAutoRowForCell ? 'items-start' : 'items-center',`
// 換成 global `autoRowHeight ? 'items-start' : 'items-center',` — 即 gate 設計要攔的真實違規。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const GATE = `node ${JSON.stringify(join(__dirname, 'audit-data-table-row-mode-ssot.mjs'))}`
const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
const target = join(ROOT, 'packages/design-system/src/components/DataTable/data-table.tsx')
const orig = readFileSync(target, 'utf8')
const NEEDLE = "effectiveAutoRowForCell ? 'items-start' : 'items-center',"
const POISON = "autoRowHeight ? 'items-start' : 'items-center',"
if (!orig.includes(NEEDLE)) { console.error('✗ 注入錨點不存在(NEEDLE 未命中)— 需更新 meta-test'); process.exit(1) }
try {
  // .replace() 只換第一處 = cell-render scope 內(effectiveAutoRowForCell 定義行之後、下一個 // ── marker 之前)
  writeFileSync(target, orig.replace(NEEDLE, POISON))
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
