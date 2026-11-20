#!/usr/bin/env node
// meta-test for check-field-cascade-resolve — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 掃 packages/design-system/src/components/**.tsx(排除 /Field/、stories、test),偵測 Field cascade
// resolver 漏接。本 meta-test 注入 Check 2a 違規:在乾淨控件裡散落直讀 `fieldCtx.size`(該走 useResolvedFieldSize)。
// 這是 gate 真正設計要抓的「散落直讀 fieldCtx.size/mode/disabled」pattern。
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: check-field-cascade-resolve.mjs 在該紅的時候會紅 —— 在 Badge(0 筆 fieldCtx 引用)末尾注入一行直讀 fieldCtx.size,
//         閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;注入的檔在 finally 寫回原文,跑完 git status 不變;只讀寫那一個檔,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/check-field-cascade-resolve.mjs'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真實 cascade-resolve 違規)'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    target = 乾淨的非-Field 控件(Badge:0 fieldCtx 引用);注入一行 code 直讀 fieldCtx.size 觸發 Check 2a scatteredSize。
const target = 'packages/design-system/src/components/Badge/badge.tsx'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\nconst _cascadeResolveMetaTestProbe = fieldCtx.size\n')
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
