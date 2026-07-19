#!/usr/bin/env node
// meta-test for layout-space-utility-invariant — 注入裸 layout-space utility 名 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 抓什麼:packages/design-system/src/**/*.tsx? 內,className/cn() context 的裸 `px-loose`/`py-tight`/
//   `pb-bottom`/`gap-cozy` 等 layout-space utility 名(Tailwind 未註冊 → silent 產不出 CSS)。合法形式僅
//   `px-[var(--layout-space-loose)]`。Gate 無 --check flag,直接 `node scripts/layout-space-utility-invariant.mjs`,fail → exit 1。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/layout-space-utility-invariant.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真違規 → 換乾淨 target)'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
//    在乾淨 component .tsx 末尾插入一行 className 用裸 `px-loose`(gate ACTUAL detection:BARE + CLASS_CTX + 非 comment + 無 var())。
const target = 'packages/design-system/src/components/Button/button.tsx'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\nconst __META_TEST_INJECTION__ = <div className="px-loose" />\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入裸 px-loose 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入裸 px-loose 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
