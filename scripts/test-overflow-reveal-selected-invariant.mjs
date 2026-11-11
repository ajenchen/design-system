#!/usr/bin/env node
// meta-test for overflow-reveal-selected-invariant —— 現況必綠 + selftest 對照組必紅
//(判定表、遮罩解析、儀器失效判定兩面;真建置上每種輸入前一刻拿掉 useRevealSelected 的作用,五排 × 各自支援的輸入共 17 格必紅)。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overflow-reveal-selected-invariant.mjs')
