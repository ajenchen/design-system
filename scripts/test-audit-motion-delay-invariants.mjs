#!/usr/bin/env node
// meta-test for audit-motion-delay-invariants — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 靶點 R3(JS mirror 與 CSS 同值):把 motion.ts 的 MOTION_DELAY_PLAIN_MS 值改掉 → JS ≠ CSS → gate FAIL。
// R1(numeric literal delay)/ R2(tier freeze needle)不受影響:改的是 export 值,非 openDelay/closeDelay/delayDuration 關鍵字,也非 tier-freeze needle 文字。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = `node ${JSON.stringify(join(ROOT, 'scripts/audit-motion-delay-invariants.mjs'))}`
const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
const target = join(ROOT, 'packages/design-system/src/tokens/motion/motion.ts')
const orig = readFileSync(target, 'utf8')
try {
  const mutated = orig.replace('MOTION_DELAY_PLAIN_MS = 500', 'MOTION_DELAY_PLAIN_MS = 999')
  if (mutated === orig) { console.error('✗ 注入無效:找不到 MOTION_DELAY_PLAIN_MS = 500 可改(gate 靶點漂移)'); process.exit(1) }
  writeFileSync(target, mutated)
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(R3 JS-CSS 同值 detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
