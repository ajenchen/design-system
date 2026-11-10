#!/usr/bin/env node
// meta-test for overlay-header-title-area-invariant —— 現況必綠、對照組(判定表吃修前實測:決策卡小標距題目 0、OV-ga02 修前 × +11.5;
// 頁面上把標題區打回置中、小標下距歸零、每顆 × 下移 3px)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。出處:overlay-surface.spec.md「SurfaceHeader」標題區(2026-11-10)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-header-title-area-invariant.mjs')
