#!/usr/bin/env node
// meta-test for field-open-border-invariant —— 現況必綠 + selftest 對照組必紅
//(真建置上六種破法:開著的框改回 hover 色 → 開著的列全紅;記號一出現就拿掉 → 焦點不在欄位裡的開著列紅、靠 focus-within 的照綠;
//  外框改認通用的 data-state / 裡面任何開著的東西 → 外面包一層與欄位裡小按鈕的列紅;併排欄位組聚焦或開著的那格不再浮到鄰居上面 →
//  鍵盤聚焦與開著兩段的像素列、層級列都紅,只有開著的 computed 列綠;併排欄位組聚焦 / 開著的那格壓回跟滑過同一層(2026-11-13 改之前的行為)
//  → 滑過右鄰居的像素列、層級列、停在自己上面的列紅,滑過左鄰居的像素列綠;只把「聚焦 / 開著又被滑過」壓回 3 → 只有停在自己上面的列紅。
//  併排欄位組那一段量兩組:story「篩選列」(期望色 --primary)與夾具「欄位 / 欄位[驗證錯誤] / 欄位」(期望色 --error)。
//  每一種破法拿掉之後同一格當場回綠;各破法每一列該紅該綠的表住閘的檔頭與 expectOf。)
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/field-open-border-invariant.mjs')
