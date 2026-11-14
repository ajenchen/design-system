#!/usr/bin/env node
// meta-test for overflow-reveal-selected-invariant —— 現況必綠 + selftest 對照組必紅
//(判定表、遮罩解析、揭露探針的「到位 / 跟上」、儀器失效判定兩面;story 那一段:每種輸入前一刻吞掉產品的 scrollTo,五排 × 各自支援的輸入共 17 格必紅;
//  夾具那一段(2026-11-14):28 格現況全綠,三種破法 swallow / no-childlist / mute-user-scroll 各自「紅的集合 = 期望」,「觸發晚到」兩面)。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overflow-reveal-selected-invariant.mjs')
