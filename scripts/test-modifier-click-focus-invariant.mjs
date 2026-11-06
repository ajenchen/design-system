#!/usr/bin/env node
// meta-test for modifier-click-focus-invariant —— 現況必綠 + 對照組(--selftest 注入修正前的行為)必紅。
//
// 2026-11-05 補:這支閘隨 414ecbaa(Shift+點擊不畫焦點框) 新建、已進 required CI,但沒有配對的 meta-test ——
// governance control plane 的「Harness meta-test coverage must remain zero-gap」因此紅(test:governance-evidence-control-plane)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/modifier-click-focus-invariant.mjs')
