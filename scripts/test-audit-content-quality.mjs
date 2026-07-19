#!/usr/bin/env node
// meta-test for audit-content-quality — 注入已知違規 → gate 必 exit != 0 → 還原(PNG gate-meta-test 家族)
// Gate 掃 packages/design-system/src/components/**/*.stories.tsx;無 --fix 時偵測到 violation 即 exit 1。
// 注入:非 anatomy showcase story 加 deprecated 序號 name(`'1. …'`)→ trips Check 4a nonAnatomyNumbering。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Gate 用 relative path 'packages/design-system/src/components' → 必以 repo root 為 cwd。
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
process.chdir(repoRoot)

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/audit-content-quality.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
const target = join(repoRoot, 'packages/design-system/src/components/Button/button.stories.tsx')
const orig = readFileSync(target, 'utf8')
try {
  // deprecated 2026-04-26:非 anatomy stories 不該有序號 name(Check 4a nonAnatomyNumbering)
  const injected = orig + `\nexport const InjectedNumberingViolation = {\n  name: '1. 注入序號違規測試',\n};\n`
  writeFileSync(target, injected)
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
