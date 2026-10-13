#!/usr/bin/env node
// meta-test for tree-view-step-navigation-invariant —— 現況必綠、改壞版(擋連點失效 / 舊的一律開合 / 代顯消失 / 舊的 Tab 停靠點 / 結果圖示與說明消失 /
// 鍵盤也開合 / 焦點不跟過去)各自必讓指定條目紅(gate-meta-test 家族)。需要已 build 的 storybook-static;略過只認閘印出的
// MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。
// 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md T1–T5。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/tree-view-step-navigation-invariant.mjs')
