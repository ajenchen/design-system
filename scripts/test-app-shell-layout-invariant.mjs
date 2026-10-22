#!/usr/bin/env node
// meta-test for app-shell-layout-invariant —— 現況必綠 + 對照組(--selftest:9 個改壞的模型 + 11 種頁面破壞,其中 7 種把 2026-10-14 審查抓到的缺陷造回頁面)必紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs(缺 storybook-static / 起不了瀏覽器的略過規則同一份)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/app-shell-layout-invariant.mjs')
