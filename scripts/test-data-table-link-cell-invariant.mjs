#!/usr/bin/env node
// meta-test for data-table-link-cell-invariant —— 現況必綠 + 對照組(--selftest 在頁面注入破法)必紅。
// 2026-10-13 隨閘一起新增(待辦總帳 Q2a / Q2c / Q3a–Q3f);跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-link-cell-invariant.mjs')
