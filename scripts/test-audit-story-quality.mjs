#!/usr/bin/env node
// meta-test for audit-story-quality — 注入已知違規(placeholder story name)→ gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-story-quality.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    target = 真 manual story file;把一個真 story name 換成 placeholder「Lorem ipsum」
//    → 命中 gate 的 PLACEHOLDER_PATTERNS(lorem-ipsum,Dim 42)+ Dim 41b mixed-English(拉丁字非白名單)
const target = 'packages/design-system/src/patterns/action-bar/action-bar.stories.tsx'
const orig = readFileSync(target, 'utf8')
try {
  const mutated = orig.replace("name: '角色識別'", "name: 'Lorem ipsum 佔位文字'")
  if (mutated === orig) { console.error('✗ 注入 anchor 未命中(target 內容漂移,重挑 anchor)'); ok = false }
  else {
    writeFileSync(target, mutated)
    const code = run(GATE)
    if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
    else console.log('✓ 注入 placeholder story name 被抓(exit ' + code + ')')
  }
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
