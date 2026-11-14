#!/usr/bin/env node
// meta-test for overlay-header-actions-invariant —— 現況必綠、對照組(判定表吃修前實測:欄位顯示面板分隔線兩側 8;
// 靜態假原始碼:children 自刻分隔線 / hideClose 後自塞 ×;頁面上拿掉分隔線兩側 4px、藏掉分隔線、整列靠上)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。出處:overlay-surface.spec.md「SurfaceHeader」右側按鈕位(2026-11-10)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-header-actions-invariant.mjs')
