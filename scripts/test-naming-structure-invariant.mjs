#!/usr/bin/env node
// meta-test for naming-structure-invariant — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 此 gate 是純結構謂詞(掃 packages/design-system/src/components 的資料夾/檔名),無 --check flag、不看檔案內容,
// 只看 R1 資料夾 PascalCase / R2 檔名 kebab-case / R3 主檔對應。故注入 = 臨時建一個違 R2 的檔名,finally 刪除還原。
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/naming-structure-invariant.mjs'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真實命名違規,請先清乾淨)'); process.exit(1) }
console.log('✓ baseline PASS')

// 2) 注入違規 → 必 FAIL → 還原
//    在既有元件目錄丟一個大寫開頭檔名 → 觸 R2「檔名非 kebab-case」(regex /^_?[a-z0-9][a-z0-9.-]*$/ 拒大寫首字)
const target = 'packages/design-system/src/components/Button/ZZ-meta-test-BAD.tsx'
if (existsSync(target)) { console.error('✗ 注入目標已存在,拒絕覆蓋:' + target); process.exit(1) }
try {
  writeFileSync(target, '// temporary meta-test injection — should be removed by finally\nexport {}\n')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(R2 detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  if (existsSync(target)) rmSync(target)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS(臨時檔未清乾淨?)'); process.exit(1) }
console.log('✓ 還原後 PASS')
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
