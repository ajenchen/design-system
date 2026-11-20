#!/usr/bin/env node
// meta-test for audit-layout-family-frontmatter — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-layout-family-frontmatter.mjs(--check) 在該紅的時候會紅 —— 把 components/Button/button.spec.md 整份換成沒有 Layout Family 宣告的內容,閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;button.spec.md 在 finally 寫回原文,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-layout-family-frontmatter.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    Button primary spec 是 gate 掃到的 primary spec;抹掉其 Layout Family 宣告
//    (無 `family:` frontmatter + 無 「Layout Family …(self-contained|Family 1-4|composite)」段
//     + 無 @no-layout-family 豁免)→ gate 應把它算進 missing → exit 1
const target = 'packages/design-system/src/components/Button/button.spec.md'
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, '# Button\n\n(spec body with no layout declaration)\n')
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
