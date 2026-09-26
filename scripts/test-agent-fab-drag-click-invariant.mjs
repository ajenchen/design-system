#!/usr/bin/env node
// meta-test for agent-fab-drag-click-invariant — 現況必綠、對照組(旗標被清掉 → 晚到的 click 開面板)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static。
//
// 2026-09-25:原本手寫一份「exit 2 = 略過」(與 lib/gate-selftest-meta.mjs 第一版同病:儀器失效也可能是 exit 2),
// 改由共用實作判定 —— 略過只認閘明確印出的缺前置 / 環境標記,INSTRUMENT-FAIL 一律紅。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/agent-fab-drag-click-invariant.mjs')
