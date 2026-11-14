#!/usr/bin/env node
// meta-test for sidebar-main-follows-selection-invariant —— 現況必綠 + 對照組(--selftest 把修前同一份摘要、表格名稱錯、主導覽放 DescriptionList、沒量到餵進判定必紅)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-main-follows-selection-invariant.mjs')
