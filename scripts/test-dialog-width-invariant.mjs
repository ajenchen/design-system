#!/usr/bin/env node
// meta-test for dialog-width-invariant —— 現況必綠 + 對照組(--selftest:檔位表改壞 / 寬改回 100vw / 高改回 100svh)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/dialog-width-invariant.mjs')
