#!/usr/bin/env node
// meta-test for node-version-ssot-invariant —— 現況必綠 + 對照組(--selftest:每一格注入一種 Node 版本漂移)必紅,
// 外加「真的有人跑它」:ci.yml 的 verify-static 呼叫(寫了閘卻沒有執行面呼叫它 = 假保護,AGENTS.md 失敗記憶索引)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/node-version-ssot-invariant.mjs'
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+node scripts\/node-version-ssot-invariant\.mjs --selftest\n/, 'ci.yml 必須呼叫 node scripts/node-version-ssot-invariant.mjs --selftest(註解不算)')
console.log('✓ CI 呼叫在')

runGateSelftestMeta(GATE)
