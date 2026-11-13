#!/usr/bin/env node
// meta-test for field-open-border-invariant —— 現況必綠 + selftest 對照組必紅
//(真建置上四種破法:開著的框改回 hover 色 → 開著的列全紅;記號一出現就拿掉 → 焦點不在欄位裡的開著列紅、靠 focus-within 的照綠;
//  外框改認通用的 data-state / 裡面任何開著的東西 → 外面包一層與欄位裡小按鈕的列紅;併排欄位組不再浮到鄰居上面 → 像素列紅、computed 列綠。
//  每一種破法拿掉之後同一格當場回綠。)
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/field-open-border-invariant.mjs')
