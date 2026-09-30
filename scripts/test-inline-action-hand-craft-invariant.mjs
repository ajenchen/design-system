#!/usr/bin/env node
// meta-test for inline-action-hand-craft-invariant —— 現況必綠 + 對照組(--selftest:合成手刻必被指名、合法寫法必放行、
// 允許清單過期必紅、primitive 形狀可見)必綠。
//
// 2026-09-27 與閘同日建立(待辦總帳 N22):閘寫完立刻問「弄壞它會紅嗎 / 誰呼叫它」——
// 這支就是「誰呼叫它」的第一個答案;跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/inline-action-hand-craft-invariant.mjs')
