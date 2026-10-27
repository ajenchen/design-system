#!/usr/bin/env node
// meta-test for code-pointer-liveness-invariant —— 現況必綠 + 對照組(--selftest:符號搬走了必紅、同一句標了歷史放行、真的在放行、
// 只在註解提到仍紅、別句的「修前」不放行這一句、外部原始碼不判)。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/code-pointer-liveness-invariant.mjs')
