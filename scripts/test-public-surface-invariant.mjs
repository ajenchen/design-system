#!/usr/bin/env node
// meta-test for public-surface-invariant —— 現況必綠 + 對照組(--selftest:合成新舊樹十二類各破一處只指名那一處、登記齊全綠;
// 帳本九種紅;146→147 真實資料)必紅 / 必綠,外加「真的有人跑它」:package.json 的入口與 ci.yml 的呼叫
// (寫了閘卻沒有執行面呼叫它 = 假保護,AGENTS.md 失敗記憶索引)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/public-surface-invariant.mjs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
assert.equal(pkg['test:public-surface'], `node ${GATE} && node ${GATE} --selftest`, 'package.json 的 test:public-surface 必須同時跑判定與對照組')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+npm run test:public-surface\n/, 'ci.yml 必須呼叫 npm run test:public-surface(註解不算)')
const ds = JSON.parse(readFileSync('packages/design-system/package.json', 'utf8'))
assert.ok(ds.files.includes('ds-changes.json') && ds.exports['./ds-changes.json'] === './ds-changes.json', '變更帳本必須隨 npm 出貨(files + exports)')
console.log('✓ 入口、CI 呼叫、帳本出貨都在')

runGateSelftestMeta(GATE)
