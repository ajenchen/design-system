#!/usr/bin/env node
// meta-test for audit-orphan-tokens — 注入已知違規(真 orphan token)→ gate 必 exit != 0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 檢測邏輯(scripts/audit-orphan-tokens.mjs --check)fail branch (c):cat.real.length > 0 →
// 「N real orphan token(s)」→ process.exit(1)。本 meta-test 在真 token CSS 檔尾注入一個
// 「不被任何 consumer 消費、且不落任何 structural-keep regex」的 orphan token(--zzz- 前綴不撞 bridge
// class-name;唯一亂名不撞 JS literal mirror / @theme / @utility)→ 逼 cat.real 從 0 變 1 → gate FAIL。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// 從本 script 位置推 repo root(scripts/ 的上一層),cwd-independent
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe', cwd: ROOT }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-orphan-tokens.mjs --check'
let ok = true

// 1) 現況必 PASS(baseline)
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline gate PASS(exit 0)')

// 2) 注入違規(真 orphan token)→ 必 FAIL → 還原
const target = path.join(ROOT, 'packages/design-system/src/tokens/motion/motion.css')
const orig = readFileSync(target, 'utf8')
try {
  // --zzz- 前綴不落 bridges(--spacing-/--color-/--radius- 等)→ 無 Tailwind class-name 消費;
  // 唯一亂名不落 @theme inline / @utility / JS literal mirror / structural-keep regex → 保證進 cat.real。
  writeFileSync(target, orig + '\n:root {\n  --zzz-meta-test-orphan-do-not-use: #f00;\n}\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 real orphan token 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 gate PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
