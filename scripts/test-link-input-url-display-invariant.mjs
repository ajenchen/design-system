#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: link-input-url-display-invariant 這支閘在該紅的時候真的會紅(判定表對「不合法的值畫成連結」「javascript: href」「合法網址沒畫成連結」必紅,
 *         探針真的渲染時讀得到合法網址的連結),且現行 LinkInput / DataTable 連結格跑起來是綠的。
 *   紅: `--selftest` 任一格結果與預期不符、或現行程式跑起來不是綠 → exit 1。
 *   綠: selftest 全部符合預期,且判定表(每一種模式 × 每一種值,數量以 link-input-url-display-invariant.mjs 為準)全綠。純靜態(esbuild + react-dom/server),重複跑結果恆等。
 */
import { spawnSync } from 'node:child_process'

const run = (...args) => spawnSync(process.execPath, ['--', 'scripts/link-input-url-display-invariant.mjs', ...args], { stdio: 'inherit' }).status ?? 1
let ok = true
if (run('--selftest') !== 0) { console.error('✗ link-input-url-display selftest 失敗(閘的紅側 / 綠側判定壞了)'); ok = false }
if (run() !== 0) { console.error('✗ 現行 LinkInput / DataTable 連結格把不合法的值畫成連結(link-input.spec.md「readonly / disabled」)'); ok = false }
console.log(ok ? '✅ link-input-url-display meta-test PASS' : '❌ link-input-url-display meta-test FAIL')
process.exit(ok ? 0 : 1)
