#!/usr/bin/env node
// meta-test for link-input-error-text-invariant —— 現況必綠 + 對照組(--selftest 拿掉新行為四組)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/link-input-error-text-invariant.mjs')
