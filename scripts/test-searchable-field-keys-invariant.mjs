#!/usr/bin/env node
// meta-test for searchable-field-keys-invariant —— 現況必綠 + 對照組(--selftest:判定表 + CONTROLS 每一組在頁面上拆掉修法)必紅。
// (組數以閘裡的 CONTROLS 為準,這裡不抄數字 —— 2026-10-21 加到第 11 組時「九組」已經過期兩次)
//
// 2026-10-07 隨閘一起加(待辦總帳 K1–K4):audit-gate-meta-test-coverage 要求每一支 checker gate 都有一支證明它「在該紅的時候會紅」的 meta-test。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/searchable-field-keys-invariant.mjs')
