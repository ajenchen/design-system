#!/usr/bin/env node
// meta-test for data-table-tree-view-doc-invariant —— 現況必綠 + 對照組(--selftest:a6390356 修前逐字原文 + 修後寫法)必紅 / 必綠,
// 外加「真的有人跑它」:package.json 的入口,以及 CI 會經 `npm run test:story-layer-drift` 叫到它
// (寫了閘卻沒有執行面呼叫它 = 假保護,AGENTS.md 失敗記憶索引)。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/data-table-tree-view-doc-invariant.mjs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
assert.equal(pkg['test:data-table-tree-view-doc'], `node ${GATE} && node ${GATE} --selftest`, 'package.json 的 test:data-table-tree-view-doc 必須同時跑判定與對照組')
assert.ok(pkg['test:story-layer-drift'].split(/\s*&&\s*/).includes('npm run test:data-table-tree-view-doc'), 'test:story-layer-drift 必須串上 npm run test:data-table-tree-view-doc(CI 經它叫到本閘)')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+npm run test:story-layer-drift\n/, 'ci.yml 必須呼叫 npm run test:story-layer-drift(註解不算)')
console.log('✓ 入口與 CI 呼叫都在')

runGateSelftestMeta(GATE)
