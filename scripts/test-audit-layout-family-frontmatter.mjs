#!/usr/bin/env node
// meta-test for audit-layout-family-frontmatter — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-layout-family-frontmatter.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    Button primary spec 是 gate 掃到的 primary spec;抹掉其 Layout Family 宣告
//    (無 `family:` frontmatter + 無 「Layout Family …(self-contained|Family 1-4|composite)」段
//     + 無 @no-layout-family 豁免)→ gate 應把它算進 missing → exit 1
const target = 'packages/design-system/src/components/Button/button.spec.md'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, '# Button\n\n(spec body with no layout declaration)\n')
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
