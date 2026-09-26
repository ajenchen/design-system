#!/usr/bin/env node
// meta-test for select-tab-leave-invariant —— 現況必綠 + 對照組(--selftest 注入修正前的 Tab 走法與宣告)必紅。
//
// 2026-09-25 與閘同批新增(待辦總帳 B11)。對照組要三條(S 單選離開 / M 多選留在面板 / D 宣告)都紅才算量具有效,
// 判準在閘本身;跑法與「略過 / 儀器失效」的判讀單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/select-tab-leave-invariant.mjs')
