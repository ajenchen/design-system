#!/usr/bin/env node
// meta-test for sidebar-label-matches-header-invariant —— 現況必綠 + 對照組(--selftest:判定表、盤點、夾具頁八種畫面、真建置把標頭改字 / 塞麵包屑)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-label-matches-header-invariant.mjs')
