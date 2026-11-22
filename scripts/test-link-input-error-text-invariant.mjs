#!/usr/bin/env node
// meta-test for link-input-error-text-invariant —— 現況必綠 + 對照組(--selftest 在夾具程式裡造回錯的寫法 5 組:M1–M4 拿掉新行為,M5 把撤掉的「一掛上就驗」那一版做回來)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/link-input-error-text-invariant.mjs')
