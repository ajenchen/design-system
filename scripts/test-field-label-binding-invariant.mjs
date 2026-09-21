#!/usr/bin/env node
// meta-test for field-label-binding-invariant —— 現況必綠 + 對照組(--selftest 合成違規)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/field-label-binding-invariant.mjs')
