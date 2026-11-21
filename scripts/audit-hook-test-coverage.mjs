#!/usr/bin/env node
// task#5 prevention — BLOCKER hook 必有 test 覆蓋（2026-05-30）。
//
// 為何存在：laziness-hunt 抓到 ~22 個 hook 無對應 test_<name>.sh。含 BLOCKER 邏輯（exit 2 / deny /
// permissionDecision）的 hook 若 regex 太窄（M34/M7 broad-vs-narrow gap）或太寬（false-positive），
// 無 test 就沒人攔得到 → 靜默 regression。正是 user「全盤給我抓出來改正避免」要堵的偷懶逃生門。
//
// 規則：任何含 BLOCKER 邏輯的 hook（grep `exit 2` / `"deny"` / `permissionDecision.*deny` /
//   `"block"`）必有 canonical `hooks/tests/test_<name>.sh`。
//
// **Scope note（2026-05-30 honest）**：本 gate 只驗「test 檔存在」= 可靠機械 fact。原想加「test 含
//   positive+negative fixture（M34 broad-vs-narrow 對稱）」但 hook test style 多樣（run_hook / 參數化
//   expect_block / expect_pass_silent 各家），regex 偵測 pos+neg 會 false-positive → 反成 fake-green
//   check。test 品質（pos+neg 對稱）改靠 CI「Hook test suite」實跑 + reviewer 人工審,不機械化攔。
//
// 豁免（明寫,非靠記憶）：純 helper / injector / dispatcher（無 BLOCKER）列 EXEMPT。
//
// Usage:
//   node scripts/audit-hook-test-coverage.mjs           # 印 debt 報告
//   node scripts/audit-hook-test-coverage.mjs --check    # CI gate（BLOCKER hook 缺 test exit 1）
//
// @gate-contract
//   保證: packages/design-system/ds-canonical/hooks/ 第一層的 .sh / .py(EXEMPT 清單除外)只要含擋下邏輯
//         (`exit 2` / "deny" / permissionDecision / "block" / BLOCKER 字樣),就有 hooks/tests/test_<name>.sh,而且 hook 與測試都是
//         單一 regular file(不是 symlink / hard link);只驗「測試檔在」,測試內容由 ci.yml hooks-linux job 的 hooks:test 實跑
//   紅: --check 下有任一支缺測試或檔案型別不安全 → 列出名字並 exit 1;配對測試在隔離夾具裡刪掉 test_check_fixture.sh、
//       或加一支含 BLOCKER 的 .py 而沒有測試,本閘都必須紅
//   綠: 全部有測試時 exit 0 並印出 BLOCKER hook 數與有測試數;只讀檔,不讀時間,重複跑結果相同

import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const rootIndex = process.argv.indexOf('--root')
if (rootIndex !== -1 && (!process.argv[rootIndex + 1] || process.argv[rootIndex + 1].startsWith('--'))) {
  console.error('usage: audit-hook-test-coverage.mjs [--check] [--root <repo>]')
  process.exit(2)
}
const ROOT = realpathSync(rootIndex === -1 ? process.cwd() : resolve(process.argv[rootIndex + 1]))
const HOOKS_DIR = join(ROOT, 'packages/design-system/ds-canonical/hooks')
const TESTS_DIR = join(HOOKS_DIR, 'tests')
const CHECK = process.argv.includes('--check')

// 純 helper / injector / dispatcher（無 BLOCKER 決策）— 明寫豁免清單
const EXEMPT = new Set([
  '_log-fire', '_log_fire',
  'chrome_header_dispatcher',      // dispatcher,委派給子 hook
  'inject_deploy_url_after_push',  // PostToolUse inject context,無 block
])

function hasBlockerLogic(content) {
  return /\bexit 2\b/.test(content) ||
    /"deny"|'deny'/.test(content) ||
    /permissionDecision/.test(content) ||
    /"block"|'block'/.test(content) ||
    /BLOCKER/.test(content)
}

const debt = []      // BLOCKER hook 無 test
let blockerHooks = 0
let covered = 0

for (const f of readdirSync(HOOKS_DIR)) {
  if (!/\.(?:sh|py)$/.test(f)) continue
  const name = basename(f).replace(/\.(?:sh|py)$/, '')
  if (EXEMPT.has(name)) continue
  const hookPath = join(HOOKS_DIR, f)
  const hookInfo = lstatSync(hookPath)
  if (!hookInfo.isFile() || hookInfo.isSymbolicLink() || hookInfo.nlink !== 1) {
    debt.push(`${name}(unsafe hook file type)`)
    continue
  }
  const content = readFileSync(hookPath, 'utf8')
  if (!hasBlockerLogic(content)) continue
  blockerHooks++
  const testPath = join(TESTS_DIR, `test_${name}.sh`)
  if (!existsSync(testPath)) debt.push(name)
  else {
    const testInfo = lstatSync(testPath)
    if (!testInfo.isFile() || testInfo.isSymbolicLink() || testInfo.nlink !== 1) debt.push(`${name}(unsafe test file type)`)
    else covered++
  }
}

console.log(`[hook-test-coverage] ${blockerHooks} BLOCKER hooks,${covered} 有 test,${debt.length} 缺 test`)

if (!debt.length) {
  console.log('✅ 所有 BLOCKER hook 都有 test 檔')
  process.exit(0)
}

console.log(`\n❌ ${debt.length} 個含 BLOCKER 邏輯的 hook 無 test_<name>.sh：`)
for (const n of debt) console.log(`  - ${n}`)
console.log(`\n修法:每個 BLOCKER hook 補 packages/design-system/ds-canonical/hooks/tests/test_<name>.sh（positive should-fire + negative should-NOT-fire）;純 helper 加進本 script EXEMPT。`)
if (CHECK) process.exit(1)
process.exit(0)
