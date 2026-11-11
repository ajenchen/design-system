#!/usr/bin/env node
// meta-test for overlay-density-lock-invariant —— 現況必綠 + 對照組(--selftest:浮層內容寫 data-density、Dialog 鎖版面間距、
// Popover 鎖成 lg、header 上 lockDensity、小浮層沒接 / 整頁浮層接了 useTriggerRegionDensity、規格表寫錯密度來源 8 條必紅;4 條必綠)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-density-lock-invariant.mjs')
