#!/usr/bin/env node
// meta-test for story-demo-focus-invariant —— 現況必綠 + 對照組(--selftest:真鍵盤 Tab 造出的框必須被判違規、
// 缺 <html data-demo-focus> 必須判儀器失效)必紅。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/story-demo-focus-invariant.mjs')
