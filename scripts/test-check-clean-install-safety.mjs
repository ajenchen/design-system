#!/usr/bin/env node
// meta-test for check-clean-install-safety — 注入 consumer-install lifecycle script → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 斷言 published package 無 preinstall/install/postinstall。本 meta-test 在 design-system package.json
// 注入一個 postinstall script → gate 必 exit 1(baseline PASS → 注入 FAIL → 還原 PASS)。
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: check-clean-install-safety.mjs(--check) 在該紅的時候會紅 —— 在 packages/design-system/package.json 的 scripts 注入 postinstall,閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;package.json 在 finally 寫回原文,不連網,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/check-clean-install-safety.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(published package 已有 install-lifecycle script?)'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入 consumer-install lifecycle script → 必 FAIL → 還原
const target = 'packages/design-system/package.json'
const orig = readFileSync(target, 'utf8')
try {
  const pkg = JSON.parse(orig)
  pkg.scripts = { ...(pkg.scripts || {}), postinstall: 'node -e "0" // meta-test probe' }
  writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n')
  const code = run()
  if (code === 0) { console.error('✗ 注入 postinstall 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入 consumer-install lifecycle script 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
