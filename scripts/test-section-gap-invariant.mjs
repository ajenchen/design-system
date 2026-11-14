#!/usr/bin/env node
// meta-test for section-gap-invariant —— 現況必綠 + 對照組(--selftest 把修前實測 16 / 24、分隔線一側縮回、沒量到餵進判定必紅;
// 每一列標題區餵相反判定的距離必紅;2026-11-14 起再加「在頁面上把四種標題區的標記翻面」必紅、數字正好是另一個 token —— 這一段要建置)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/section-gap-invariant.mjs')
