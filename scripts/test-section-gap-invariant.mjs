#!/usr/bin/env node
// meta-test for section-gap-invariant —— 現況必綠 + 對照組(--selftest 把修前實測 16 / 24、分隔線一側縮回、沒量到餵進判定必紅)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/section-gap-invariant.mjs')
