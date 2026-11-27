#!/usr/bin/env node
// meta-test for overlay-height-ssot-invariant —— 現況必綠 + 對照組(--selftest:元件 / story / CSS 直接讀 Radix 可用高、把修前的 class 加回
// popover.tsx、CommandList 改回寫死 class、DropdownMenu / HoverCard / ProfileCard 的 maxHeight 不從 overlay-geometry 來、
// DropdownMenuSubContent 拿掉上限、Dialog 不用 capHeight、使用端在浮層內容上用 className / style 蓋上限 必紅;
// 走 maxHeight 參數、註解與說明文字提到變數、非浮層元件的 max-h 必綠 —— 條數以閘自己印的為準)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-height-ssot-invariant.mjs')
