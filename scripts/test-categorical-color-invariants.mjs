#!/usr/bin/env node
// meta-test for categorical-color-invariants — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 驗 I1 名實一致(零 offset):map 的 key X 值只能引用 --color-X-*;把 CAT_SUBTLE.blue 的
// bg token 從 --color-blue-1 偷換成 --color-red-1(categorical-vs-semantic 混淆的真實故障模式)
// → gate I1 應抓「引用了 --color-red-*(應為 --color-blue-*)」→ exit 1。finally 還原原檔。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/categorical-color-invariants.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS')

// 2) 注入違規 → 必 FAIL → 還原
const target = 'packages/design-system/src/tokens/categorical-color.ts'
const NEEDLE = "blue: 'bg-[var(--color-blue-1)] text-[var(--color-blue-7)]',"
const POISON = "blue: 'bg-[var(--color-red-1)] text-[var(--color-blue-7)]',"
const orig = readFileSync(target, 'utf8')
try {
  const mutated = orig.replace(NEEDLE, POISON)
  if (mutated === orig) { console.error('✗ 注入 no-op(NEEDLE 未命中,injection 失效)'); process.exit(1) }
  writeFileSync(target, mutated)
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(I1 detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
