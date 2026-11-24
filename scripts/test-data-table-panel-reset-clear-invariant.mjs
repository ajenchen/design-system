#!/usr/bin/env node
// meta-test for data-table-panel-reset-clear-invariant —— 現況必綠 + 對照組(--selftest:單一根因突變,清單與個數以閘的 MUTANTS 為準,含修前寫法 ——
// 排序面板「重置」以 onReset 有無當渲染閘、兩個面板沒有「清除全部」、欄位顯示面板 resettable 開關 + 按下 = 全部顯示 —— 每個必須剛好紅它負責的契約列,
// 對照列全程綠)必紅。不需要 storybook(原始碼打包進空白頁)。出處:user 2026-11-11 PR #172(排序 / 篩選面板「恢復預設」與「清除全部」分成兩個入口);
// 欄位顯示面板 2026-11-15 併入同一條。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
// 對照組只跑第 0 片(2026-11-15):完整 --selftest 本機約 10 分鐘,夜間 harness core lane 撐不住;
// 各片在每次 PR 的 CI(verify-browser-nested-dismiss 每一格 --shard;2026-11-24 起五格)都會跑完,這裡只需證明「量具會紅」。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-panel-reset-clear-invariant.mjs', { selftestArgs: ['--selftest', '--shard=0/2'] })
