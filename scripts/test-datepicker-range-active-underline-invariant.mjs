#!/usr/bin/env node
// meta-test for datepicker-range-active-underline-invariant —— 現況必綠 + 對照組(--selftest 四個單一根因突變:文字 span / 按鈕改回雙軸裁切〔A50 修前〕
// → 全部跨邊列 + 這台機器字型下自然位置會被裁到的列紅(由實量幾何推,與平台無關);span 水平不裁 → 長日期截斷列紅;
// decoration-2 改 decoration-1 → 全部底線列紅;各自必須剛好紅它負責的列)。
// 不需要 storybook,只需要 Chromium。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/datepicker-range-active-underline-invariant.mjs')
