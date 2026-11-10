#!/usr/bin/env node
// meta-test for form-example-card-invariant —— 現況必綠 + 對照組(--selftest 把修前沒有卡片、單邊縮回、沒量到餵進判定必紅)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/form-example-card-invariant.mjs')
