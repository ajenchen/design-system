#!/usr/bin/env node
// meta-test for overlay-story-contract-invariant —— 現況必綠 + 對照組(--selftest:靜態注入修前片段各紅自己那一列、
// 頁面上拆掉修法各列都紅)必紅。2026-10-20 與閘同時建立(audit-gate-meta-test-coverage:新 checker gate 必附 meta-test)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-story-contract-invariant.mjs')
