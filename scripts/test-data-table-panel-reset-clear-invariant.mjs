#!/usr/bin/env node
// meta-test for data-table-panel-reset-clear-invariant —— 現況必綠 + 對照組(--selftest:16 個單一根因突變,含兩個修前寫法 ——
// 排序面板「重置」以 onReset 有無當渲染閘、兩個面板沒有「清除全部」—— 每個必須剛好紅它負責的契約列,對照列全程綠)必紅。
// 不需要 storybook(原始碼打包進空白頁)。出處:user 2026-11-11 PR #172(排序 / 篩選面板「恢復預設」與「清除全部」分成兩個入口)。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-panel-reset-clear-invariant.mjs')
