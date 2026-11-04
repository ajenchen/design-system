#!/usr/bin/env node
// meta-test for a11y-corpus-invariant —— 現況必綠(沒有 storybook-static 時共用跑法認 MISSING-BUILD 略過)+ 對照組(--selftest)必紅 / 必綠,
// 外加「真的有人跑它」:package.json 的入口與 ci.yml 的呼叫。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/a11y-corpus-invariant.mjs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
assert.equal(pkg['test:a11y-corpus'], `node ${GATE} && node ${GATE} --selftest`, 'package.json 的 test:a11y-corpus 必須同時跑判定與對照組')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(ci, /\n\s+npm run test:a11y-corpus\n/, 'ci.yml 必須呼叫 npm run test:a11y-corpus(註解不算)')
console.log('✓ 入口與 CI 呼叫都在')

runGateSelftestMeta(GATE)
