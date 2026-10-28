#!/usr/bin/env node
// meta-test for anatomy-chip-palette-invariant —— 現況必綠 + 對照組(--selftest:primary 對 info 必紅、categorical 色相對 info 綠、同名重複綠、
// 兩個未定義色名必紅、callback 特判的色名綠、不經 var(--${x.color}) 取色的陣列不判、hue 列量不了 = 儀器失效)。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/anatomy-chip-palette-invariant.mjs')
