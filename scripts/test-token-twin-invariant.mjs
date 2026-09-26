#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: token-twin-invariant 這支閘在該紅的時候真的會紅(注入不相等 / 缺宣告必紅),且現行檔案下是綠的。
 *   紅: `--selftest` 任一格結果與預期不符、或現行檔案跑起來不是綠 → exit 1。
 *   綠: selftest 五格全部符合預期,且現行 repo 的每一對雙生 token 相等。純靜態,重複跑結果恆等。
 */
import { spawnSync } from 'node:child_process'

const run = (...args) => spawnSync(process.execPath, ['--', 'scripts/token-twin-invariant.mjs', ...args], { stdio: 'inherit' }).status ?? 1
let ok = true
if (run('--selftest') !== 0) { console.error('✗ token-twin selftest 失敗(閘的紅側 / 綠側判定壞了)'); ok = false }
if (run() !== 0) { console.error('✗ 現行 repo 的雙生 token 不相等'); ok = false }
console.log(ok ? '✅ token-twin meta-test PASS' : '❌ token-twin meta-test FAIL')
process.exit(ok ? 0 : 1)
