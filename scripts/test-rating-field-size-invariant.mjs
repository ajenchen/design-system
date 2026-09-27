#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: rating-field-size-invariant 這支閘在該紅的時候真的會紅(判定表吃「fallback 改回 sm」「加回 h-field-md」「缺 data-size」的形狀必紅;
 *         探針分得出 sm / md / lg),且現行 Rating 程式跑起來是綠的(元件只有內容高、尺寸解析序、xs 映 sm 並 warn)。
 *   紅: `--selftest` 任一格結果與預期不符、或現行程式跑起來不是綠 → exit 1。
 *   綠: selftest 全部符合預期,且現行 repo 的九格判定表全綠。純靜態(esbuild + react-dom/server),重複跑結果恆等。
 */
import { spawnSync } from 'node:child_process'

const run = (...args) => spawnSync(process.execPath, ['--', 'scripts/rating-field-size-invariant.mjs', ...args], { stdio: 'inherit' }).status ?? 1
let ok = true
if (run('--selftest') !== 0) { console.error('✗ rating-field-size selftest 失敗(閘的紅側 / 綠側判定壞了)'); ok = false }
if (run() !== 0) { console.error('✗ 現行 Rating 的尺寸模型不符 rating.spec.md「Size」'); ok = false }
console.log(ok ? '✅ rating-field-size meta-test PASS' : '❌ rating-field-size meta-test FAIL')
process.exit(ok ? 0 : 1)
