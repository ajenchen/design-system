#!/usr/bin/env node
// meta-test for sidebar-standalone-collapse-invariant —— 現況必綠、對照組(把 2026-10-14 的 Sidebar 寫法餵給靜態掃描器;頁面上把收起的外框寬
// 釘回 --sidebar-width、拿掉寬 0 那份的 inert)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。出處:2026-10-15 r1b 複驗 F1。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-standalone-collapse-invariant.mjs')
