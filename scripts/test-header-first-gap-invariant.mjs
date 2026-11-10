#!/usr/bin/env node
// meta-test for header-first-gap-invariant —— 現況必綠 + 對照組(--selftest 把表格外層改 tight、標題在前卻用 loose、角色與盤點不符、沒量到餵進判定)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/header-first-gap-invariant.mjs')
