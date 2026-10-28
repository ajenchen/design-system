#!/usr/bin/env node
// meta-test for toast-viewport-placement-invariant —— 現況必綠、注入 a6976432 的舞台落點(Toast 跟著代理面板 / 入口鈕挪位)
// 必讓並排 / 入口鈕在家 / 捲動 / docs 頁四個情境紅、靜態對照組各紅在指定那一條(gate-meta-test 家族)。需要已 build 的 storybook-static;
// 略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責,
// 不在這裡另寫一份)。規格:toast.spec.md「落點」。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/toast-viewport-placement-invariant.mjs')
