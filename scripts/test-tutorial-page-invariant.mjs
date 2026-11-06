#!/usr/bin/env node
// meta-test for tutorial-page-invariant —— 現況必綠 + 對照組(--selftest:c6c192a1 真檔與合成違規)必紅,
// 外加「真的有人跑它」:package.json 的入口與 ci.yml 的呼叫(寫了閘卻沒有執行面呼叫它 = 假保護,AGENTS.md 失敗記憶索引)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/tutorial-page-invariant.mjs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
assert.equal(pkg['test:tutorial-page'], `node ${GATE} && node ${GATE} --selftest`, 'package.json 的 test:tutorial-page 必須同時跑判定與對照組')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+npm run test:tutorial-page\n/, 'ci.yml 必須呼叫 npm run test:tutorial-page(註解不算)')
console.log('✓ 入口與 CI 呼叫都在')

runGateSelftestMeta(GATE)
