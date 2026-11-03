#!/usr/bin/env node
// meta-test for agent-decision-card-option-press-invariant —— 現況必綠 + 對照組(--selftest 補回三種舊病)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/agent-decision-card-option-press-invariant.mjs')
