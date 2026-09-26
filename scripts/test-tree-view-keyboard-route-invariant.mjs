#!/usr/bin/env node
// meta-test for tree-view-keyboard-route-invariant —— 現況必綠、對照組(每列主格塞一顆可 Tab 的按鈕 + document capture 吞掉 → / ←
// + 動作格釘成 opacity 0,也就是 2026-09-25 以前「別列的按鈕在 Tab 路上、方向鍵進不了按鈕」的樹)必讓 S1/T1/R1/V1 紅
//(gate-meta-test 家族)。需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,
// INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。
// 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md B9。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/tree-view-keyboard-route-invariant.mjs')
