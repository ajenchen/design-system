#!/usr/bin/env node
// meta-test for audit-spec-deadlinks — 注入死連結 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-spec-deadlinks.mjs(--check) 在該紅的時候會紅 —— 在 patterns/overlay-surface/overlay-surface.spec.md 末尾加一行指向不存在的 spec,閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;overlay-surface.spec.md 在 finally 寫回原文,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-spec-deadlinks.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS(無死連結)
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入死連結 → 必 FAIL → 還原
//    gate 掃 spec.md 內 `<name>.spec.md` pointer,target 不存在 = 死連結。
//    追加一行指向不存在的 spec.md（非自我引用、無 @deadlink-allow 豁免）→ 觸發 detection。
const target = 'packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig + '\n\n詳見 nonexistent-deadlink-meta-test-target.spec.md。\n')
  const code = run()
  if (code === 0) { console.error('✗ 注入死連結後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入死連結被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
