#!/usr/bin/env node
// meta-test for overlay-density-lock-invariant —— 現況必綠 + 對照組(--selftest:浮層內容寫 data-density、Dialog 鎖版面間距、
// Popover 鎖成 lg、標題列元件(含推出來的轉交元件)上寫任一個密度屬性、把只鎖標題列的參數加回 chrome-header.tsx、
// 小浮層沒接 / 整頁浮層接了 useTriggerRegionDensity、規格表寫錯密度來源 必紅;整塊最外層寫密度等 必綠 —— 條數以閘自己印的為準)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-density-lock-invariant.mjs')
