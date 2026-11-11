#!/usr/bin/env node
// meta-test for overlay-density-follows-trigger-invariant —— 現況必綠 + 對照組(--selftest 把浮層上讀到的控制項檔位拿掉:
// 區塊與整頁不同的 2 格必紅、相同的 2 格必綠)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-density-follows-trigger-invariant.mjs')
