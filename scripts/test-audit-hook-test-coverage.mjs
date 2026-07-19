#!/usr/bin/env node
// meta-test for audit-hook-test-coverage — 注入已知違規 → gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 規則:.claude/hooks/*.sh 內含 BLOCKER 邏輯(exit 2 / "deny" / permissionDecision / "block" / BLOCKER)
//   且非 EXEMPT 的 hook,必有對應 .claude/hooks/tests/test_<name>.sh,否則 --check exit 1。
// 注入手法:挑一個「目前無 BLOCKER 邏輯 + 無 test 檔」的 hook(check_story_determinism),
//   append 一行含 `BLOCKER` 的註解 → gate 視其為 BLOCKER hook → 因無 test 而列 debt → exit 1。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-hook-test-coverage.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    target = 目前無 BLOCKER 邏輯且無 test_<name>.sh 的 hook,注入後變成「缺 test 的 BLOCKER hook」= debt
const target = '.claude/hooks/check_story_determinism.sh'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\n# BLOCKER meta-test injection probe(temporary — restored in finally)\n')
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
