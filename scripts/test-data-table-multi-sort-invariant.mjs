#!/usr/bin/env node
// meta-test for data-table-multi-sort-invariant —— 現況必綠 + 對照組(--selftest 在頁面注入破法)必紅。
// 2026-11-03 隨閘一起新增(user 2026-10-30 多重排序規格;data-table.spec.md「Multi-sort header」列);跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-multi-sort-invariant.mjs')
