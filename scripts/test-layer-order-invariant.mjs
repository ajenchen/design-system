#!/usr/bin/env node
// meta-test for layer-order-invariant —— 現況必綠、對照組必紅(gate-meta-test 家族):靜態對照組(未登記的值 / 未登記的檔 / 拿掉成員 /
// Toast 改到 Tooltip 之上 / 局部列塞 35 / 局部列塞沒量過的變數 / 程式不再用登記值 / 拖曳影像壓到 Tooltip 之下 / 六種非 utility 寫法 /
// 未登記檔裡沒寫 zIndex 的 <DragOverlay>)各自紅在指定檢查;真建置把 Toast 清單釘回 sonner 的 999999999 時 A / B 紅、
// 壓到 44 時 C1 / C2 紅、拿掉頭像 / Tag 列的 isolation 時 D1–D5 紅、並存 / 一般 modal 本體的 z 互換時 E1–E3 紅。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,
// INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責)。規格:tokens/elevation/elevation.spec.md「疊放順序」。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/layer-order-invariant.mjs')
