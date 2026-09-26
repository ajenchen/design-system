#!/usr/bin/env node
// meta-test for sidebar-menu-keyboard-invariant —— 現況必綠、對照組(document capture 吞掉 keydown + 每顆改回 tabindex=0,
// 也就是 2026-09-25 以前「每項一站、沒有方向鍵」的側欄)必讓 S1/S2/S3 紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。
// 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md B9。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sidebar-menu-keyboard-invariant.mjs')
