#!/usr/bin/env node
// meta-test for audit-spec-deadlinks — 注入死連結 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-spec-deadlinks.mjs --check'
let ok = true

// 1) 現況必 PASS(無死連結)
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入死連結 → 必 FAIL → 還原
//    gate 掃 spec.md 內 `<name>.spec.md` pointer,target 不存在 = 死連結。
//    追加一行指向不存在的 spec.md（非自我引用、無 @deadlink-allow 豁免）→ 觸發 detection。
const target = 'packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\n\n詳見 nonexistent-deadlink-meta-test-target.spec.md。\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入死連結後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入死連結被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
