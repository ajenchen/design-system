#!/usr/bin/env node
// meta-test for datepicker-range-active-underline-invariant(2026-11-27 起量作用端盒子 RANGE-END(定),檔名沿用)——
// 現況必綠 + 對照組(--selftest 的單一根因突變清單 = 該檔 MUTANTS:拿掉焦點框 / 開著不鋪底 / 錯誤仍淺藍 / 高對比不換系統色 /
// 盒子撐滿欄位高 / 放回那條線 / 外框改 (ii) 不亮 / 拿掉浮層開著記號 / 加滑過底色 / 文字段水平不裁;各自必須剛好紅它負責的列)。
// 不需要 storybook,只需要 Chromium。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/datepicker-range-active-underline-invariant.mjs')
