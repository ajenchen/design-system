#!/usr/bin/env node
// meta-test for drag-announcement-invariant —— 現況必綠 + 對照組(--selftest 注入合成違規)必紅。
//
// 2026-09-21 補:這支閘先前沒有任何 meta-test,也就是從沒有人證明過它「在該紅的時候會紅」;
// 而唯一會講出這件事的 audit-gate-meta-test-coverage 自己也沒被任何執行面呼叫過。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/drag-announcement-invariant.mjs')
