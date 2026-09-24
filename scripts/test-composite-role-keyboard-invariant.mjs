#!/usr/bin/env node
// meta-test for composite-role-keyboard-invariant —— 現況必綠 + 對照組(--selftest 注入合成違規)必紅。
//
// 2026-09-24 補:這支閘同日新建、已進 required CI,但沒有配對的 meta-test ——
// governance control plane 的「Harness meta-test coverage must remain zero-gap」因此紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/composite-role-keyboard-invariant.mjs')
