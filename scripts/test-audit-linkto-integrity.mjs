#!/usr/bin/env node
// meta-test for audit-linkto-integrity — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-linkto-integrity.mjs(--check) 在該紅的時候會紅 —— 把 components/Combobox/combobox.principles.stories.tsx 的
//         name="三種尺寸" 換成不存在的 story 名,閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅、注入錨點找不到(要換錨點)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;combobox.principles.stories.tsx 在 finally 寫回原文,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-linkto-integrity.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
const target = 'packages/design-system/src/components/Combobox/combobox.principles.stories.tsx'
const orig = readFileSync(target, 'utf8')
// 換不到 = 沒注入任何東西 → 對照組會因為沒改到而假綠(2026-11-20 A121-F9:閘只認 <LinkTo 時這裡恆紅,錨點本身沒驗過)
const NEEDLE = 'name="三種尺寸"'
if (!orig.includes(NEEDLE)) { console.error(`✗ 找不到注入錨點 ${NEEDLE}(target 檔內容已變,換錨點)`); process.exit(1) }
try {
  writeFileSync(target, orig.replace(NEEDLE, 'name="不存在的斷鏈XYZ"'))
  const code = run()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
