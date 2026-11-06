#!/usr/bin/env node
// meta-test for overlay-nested-dismiss-invariant —— 現況必綠 + 對照組(--selftest:單一根因突變,清單以腳本的 MUTANTS 為準 ——
// SelectMenu 的點外判斷(修前「任何 popper 殼」/ 第一版「不裝著它的那一層」/ 不認自己的零件 / 吞掉下一格那一下)、InlineEdit 指標與 focusout 兩條路各一、
// 並存對話框守衛 (3) —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。不需要 storybook(原始碼打包進空白頁)。
// 出處:user 2026-10-30 第十五輪「篩選 / 排序面板的欄位選單點外不關、可同時開好幾個」。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-nested-dismiss-invariant.mjs')
