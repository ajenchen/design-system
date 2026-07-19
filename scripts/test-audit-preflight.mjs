#!/usr/bin/env node
// meta-test for audit-preflight — 注入已知違規 → gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 偵測邏輯(scripts/audit-preflight.mjs):每個 principle(M-rule / spec-trait / hook)
// 必在 .claude/references/principle-dim-map.json 有 entry;任一 principle unmapped → gap → exit 1。
// 本 test 刪 map 內某既有 M-rule entry(該 M-rule 仍在 meta-patterns.md)→ 該原則變 UNMAPPED
// → gap → gate exit 1,證明 detection 真的會 toggle。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-preflight.mjs --check'
let ok = true

// 1) 現況必 PASS(無 gap)
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(exit 0,無 unmapped principle)')

// 2) 注入違規:刪 map 內既有 M-rule entry → 該原則 unmapped → 必 FAIL → 還原
const target = '.claude/references/principle-dim-map.json'
const orig = readFileSync(target, 'utf8')
try {
  const parsed = JSON.parse(orig)
  // 選一個確定存在於 map + meta-patterns.md 的 M-rule 移除(製造 unmapped gap)
  const victim = 'M1'
  if (!parsed.mRules || !parsed.mRules[victim]) {
    console.error(`✗ 前置失敗:map 內找不到 ${victim} entry,無法注入`); process.exit(1)
  }
  delete parsed.mRules[victim]
  writeFileSync(target, JSON.stringify(parsed, null, 2))
  const code = run(GATE)
  if (code === 0) { console.error(`✗ 注入違規(刪 ${victim} map entry)後 gate 未 FAIL(detection 失效)`); ok = false }
  else console.log(`✓ 注入違規被抓:刪 ${victim} → unmapped gap → gate exit ${code}`)
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
