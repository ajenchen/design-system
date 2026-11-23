#!/usr/bin/env node
// meta-test for readonly-focus-pointer-invariant —— 現況必綠 + selftest 對照組必紅
//(真建置上兩種破法:還原舊 CSS → 全部指標情境紅;拿掉 data-pointer-focus guard → 文字框滑鼠點與 Shift / 再點 / 點標籤紅,div 型滑鼠點、鍵盤、可編輯欄位照綠)。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/readonly-focus-pointer-invariant.mjs')
