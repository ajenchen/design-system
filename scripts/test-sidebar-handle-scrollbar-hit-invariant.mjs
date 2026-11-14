#!/usr/bin/env node
// meta-test for sidebar-handle-scrollbar-hit-invariant —— 現況必綠 + 對照組(--selftest 注入捲軸疊放 / 把手外推破法)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-handle-scrollbar-hit-invariant.mjs')
