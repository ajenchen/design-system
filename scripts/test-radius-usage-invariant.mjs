#!/usr/bin/env node
// meta-test for radius-usage-invariant —— 現況必綠 + 對照組(--selftest:判定表 + 真建置三種破法:按鈕 8px / 浮層 4px / 40px 方塊 2px)必紅,
// 外加「真的有人跑它」:package.json 的入口與 ci.yml 的呼叫(寫了閘卻沒有執行面呼叫它 = 假保護,AGENTS.md 失敗記憶索引)。
// 規則只住 packages/design-system/src/tokens/radius/radius.spec.md「四檔」;user 2026-11-15「本來在該使用什麼圓角的時候不就要動腦想看到底怎樣用才符合ds規範嗎？」。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs(缺建置 = 略過、儀器失效 = 紅)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/radius-usage-invariant.mjs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
assert.equal(pkg['test:radius-usage'], `node ${GATE} && node ${GATE} --selftest`, 'package.json 的 test:radius-usage 必須同時跑判定與對照組')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+npm run test:radius-usage\n/, 'ci.yml 必須呼叫 npm run test:radius-usage(註解不算)')
console.log('✓ 入口與 CI 呼叫都在')

runGateSelftestMeta(GATE)
