#!/usr/bin/env node
// meta-test for overlay-nested-dismiss-invariant —— 現況必綠 + 對照組(--selftest:單一根因突變 ——
// SelectMenu 回到「任何 popper 殼都不是外面」/ SelectMenu 不認欄位自己的另一層(+N 浮出清單)/ InlineEdit 回到「任何一層浮層都是本 edit 的」
// —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。不需要 storybook(原始碼打包進空白頁)。
// 出處:user 2026-10-30 第十五輪「篩選 / 排序面板的欄位選單點外不關、可同時開好幾個」。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-nested-dismiss-invariant.mjs')
