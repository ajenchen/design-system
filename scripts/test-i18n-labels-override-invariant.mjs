#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: i18n-labels-override-invariant 這支閘在該紅的時候真的會紅(12 個根因突變 —— 含修前寫法:Pagination 兩段字寫死、DataTable 不轉發分頁字、
 *         AgentThinking 標題寫死、AgentDecisionCard 不讀 I18nProvider —— 各自剛好紅它負責的格,27 格契約全被覆蓋),且現行原始碼跑起來是綠的。
 *   紅: `--selftest` 任一突變結果與預期不符、或現行原始碼跑起來不是綠 → exit 1。
 *   綠: selftest 全部符合預期,且判定(格數以 i18n-labels-override-invariant.mjs 為準)全綠。純靜態(esbuild 打包 DS 原始碼 + react-dom/server),重複跑結果恆等。
 */
import { spawnSync } from 'node:child_process'

const run = (...args) => spawnSync(process.execPath, ['--', 'scripts/i18n-labels-override-invariant.mjs', ...args], { stdio: 'inherit' }).status ?? 1
let ok = true
if (run('--selftest') !== 0) { console.error('✗ i18n-labels-override selftest 失敗(閘的紅側 / 綠側判定壞了)'); ok = false }
if (run() !== 0) { console.error('✗ 現行原始碼:傳進去的字沒換上,或不傳時不是 DS 預設(lib/i18n/README.md「Fallback chain」)'); ok = false }
console.log(ok ? '✅ i18n-labels-override meta-test PASS' : '❌ i18n-labels-override meta-test FAIL')
process.exit(ok ? 0 : 1)
