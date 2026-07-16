#!/usr/bin/env node
// meta-test for check-branch-protection — probe 型 gate(網路/權限依賴):驗 (1) 執行不 crash
// (2) 輸出(stdout+stderr)必為三態之一 = 不會靜默無 verdict。
import { spawnSync } from 'node:child_process'
const r = spawnSync('node', ['scripts/check-branch-protection.mjs'], { encoding: 'utf8' })
const out = (r.stdout || '') + (r.stderr || '')
const verdicts = ['PROTECTED', 'Unverified', 'UNPROTECTED']
if (verdicts.some((v) => out.includes(v))) { console.log('✅ meta-test PASS(verdict 三態之一)'); process.exit(0) }
console.error('❌ meta-test FAIL(無 verdict):' + out.slice(0, 200)); process.exit(1)
