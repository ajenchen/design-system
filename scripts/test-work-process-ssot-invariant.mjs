#!/usr/bin/env node
// meta-test for work-process-ssot-invariant —— 現況必綠 + 對照組(--selftest 注入合成違規)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/work-process-ssot-invariant.mjs')
