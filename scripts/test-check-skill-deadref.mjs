#!/usr/bin/env node
// meta-test for check-skill-deadref — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// check-skill-deadref scans .claude/{skills,rules,references,commands}/**/*.{md,json} for:
//   Check A: forbidden `CLAUDE.md line N` / `CLAUDE.md L<N>` numeric refs(LINENUM_RE)
//   Check B: refs to REMOVED_SECTIONS deny-list sections
// 這裡注入 Check A 違規(最直接、最脆弱的 dead-ref 形式)。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/check-skill-deadref.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 有真 dead-ref,請先清)'); process.exit(1) }
console.log('✓ baseline PASS(無 dead CLAUDE.md refs)')

// 2) 注入違規 → 必 FAIL → 還原
//    target 在被掃描的 .claude/rules 目錄下,append 一行含 `CLAUDE.md line 999` 觸發 Check A LINENUM_RE
const target = '.claude/rules/self-verify.md'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\n<!-- meta-test injected dead ref: see CLAUDE.md line 999 -->\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 `CLAUDE.md line 999` 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
