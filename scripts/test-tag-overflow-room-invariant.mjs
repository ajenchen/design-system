#!/usr/bin/env node
// meta-test for tag-overflow-room-invariant —— 現況必綠 + 對照組(--selftest:判定表 + 在修好的建置上把 RDM-101 改回修前畫面兩種時序都紅 + 強制時序真的生效)必紅。
//
// 2026-10-13 隨閘一起加(待辦 Q1 / K6):audit-gate-meta-test-coverage 要求每一支 checker gate 都有一支證明它「在該紅的時候會紅」的 meta-test。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/tag-overflow-room-invariant.mjs')
