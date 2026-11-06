#!/usr/bin/env node
// meta-test for row-suffix-first-line-invariant —— 現況必綠、對照組(判定表吃 2026-10-27 的錯誤數字;頁面上把群組動作打回
// `absolute top:8px` 舊寫法;每個被量的控件下推 3px、轉圈停在四分之一圈,每處位移必須正好 3px)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅
//(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。出處:2026-10-27 側欄群組動作「+」偏上。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/row-suffix-first-line-invariant.mjs')
