#!/usr/bin/env node
// meta-test for sidebar-standalone-collapse-invariant —— 現況必綠、對照組(把 2026-10-14 的 Sidebar 寫法餵給靜態掃描器;頁面上把收起的外框寬
// 釘回 --sidebar-width、拿掉寬 0 那份的 inert、把細列的內層釘回展開寬 = 2026-05-21 → 10-27 的「Tooltip 離細列 201px」、拿掉細列捲動區的 fillX(放了骨架列 / 搜尋框的細列)、拿掉細列列鈕的 !pr-0(預留列尾動作右內距的列鈕)、
// Tooltip 外殼右移、細列捲軸藏起 / 加寬、捲軸軌道接指標 / 滑塊不接指標;收合前後圖示中心(R8):圖示欄固定 20 / 固定 16(不跟側欄的 size =
// 2026-05-26 → 11-13 的實際症狀)、SidebarProvider 外層不重算細列寬、AppShell 的細列量值探針釘成 40、在換密度的元素上把圖示欄重設成 1rem
// (= 圖示欄沒有穿過密度邊界繼承下去;必紅的只有夾具 size lg、密度掛在側欄外框上的 F3 / F4,其餘格維持綠),以及 R8 判定表)必紅(gate-meta-test 家族)。
// 格數與破法數不在這裡另寫一份:閘結尾印的數字直接取自 RAIL_CENTER_CASES / RAIL_CENTER_TABLE / PAGE_SABOTAGE 的長度。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。出處:2026-10-15 r1b 複驗 F1。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-standalone-collapse-invariant.mjs')
