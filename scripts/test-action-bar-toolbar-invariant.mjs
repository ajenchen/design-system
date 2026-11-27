#!/usr/bin/env node
// meta-test for action-bar-toolbar-invariant — 對照組必紅、現況必綠(gate-meta-test 家族)。
// 閘自帶 --selftest,兩組對照組各跑一輪、各自必紅:注入 `[data-toolbar-search]{min-width:auto!important}`(= 2026-09-16 修前的手抄工具列)→ 至少一格溢出 / 錯位;
// 注入 `[data-toolbar-search]{max-width:384px!important}`(上限改回 2026-11-26 前的 384)→ 至少一格搜尋框比規格上限寬;
// 「收合」段(2026-11-27 H31):改寫 story 程式裡 decideCollapsedCount 的「k = 0 不算觸發鈕」守門 → 全部放得下的那一段至少一格收了 / 出了觸發鈕。
// 需要已 build 的 storybook-static(CI 的瀏覽器 job 先 build)。
//
// 2026-09-25:原本手寫一份「exit 2 = 沒有 storybook-static → 略過」,與 lib/gate-selftest-meta.mjs 第一版同一個病
//(儀器失效也可能是 exit 2 → 被讀成略過)。跑法與判準改由共用實作決定:略過只認閘明確印出的
// MISSING-BUILD / STALE-BUILD / SKIPPED-ENV 標記,INSTRUMENT-FAIL 一律紅。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/action-bar-toolbar-invariant.mjs')
