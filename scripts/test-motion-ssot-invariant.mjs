#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: motion-ssot-invariant 這支閘在該紅的時候真的會紅(注入的舊形狀 —— 元件自寫權重贏過守衛的開合動畫、SSOT 少了關閉保持、
 *         CSS 重宣告外掛同名動畫、SSOT 不綁時長、規格毫秒數與 token 不同、進場判準寫 data-[state=open](T10)、
 *         旋轉箭頭不消費箭頭常數 / 旁邊寫字面時長 / 從父層轉子元素 / 箭頭常數時長與內容不同 / 原地展開的箭頭吃浮層常數 / 未登記的新箭頭 /
 *         登記了卻沒有箭頭(motion.spec.md「展開箭頭跟它打開的東西同步」,消費者表 = M6e 的登記簿)
 *         —— 各自必紅),且現行 repo 跑起來是綠的。
 *   紅: `--selftest` 有任一條沒紅、或現行 repo 跑起來不是綠 → exit 1。
 *   綠: 兩者都成立。純靜態,同一份 worktree 重複跑結果恆等。
 * 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md T6 / T7 / T8 / T10;箭頭同步 = motion.spec.md(user 2026-10-07 原話在該段)。
 */
import { spawnSync } from 'node:child_process'

const run = (...args) => spawnSync(process.execPath, ['--', 'scripts/motion-ssot-invariant.mjs', ...args], { stdio: 'inherit' }).status ?? 1
let ok = true
if (run('--selftest') !== 0) { console.error('✗ motion-ssot selftest 失敗(閘的紅側判定壞了)'); ok = false }
if (run() !== 0) { console.error('✗ 現行 repo 的開合動畫 SSOT 不符'); ok = false }
console.log(ok ? '✅ motion-ssot meta-test PASS' : '❌ motion-ssot meta-test FAIL')
process.exit(ok ? 0 : 1)
