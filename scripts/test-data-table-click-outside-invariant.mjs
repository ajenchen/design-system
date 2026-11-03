#!/usr/bin/env node
// meta-test for data-table-click-outside-invariant —— 現況必綠 + 對照組(--selftest:單一根因突變 ——
// 點外清除回到「按在任何一張表的外框裡都不是外面」—— 必須剛好紅三條「另一張表 / 外層表格」契約列,對照列全程綠)必紅。
// 不需要 storybook(原始碼打包進空白頁)。出處:2026-11-03 n2 同族掃(與 SelectMenu / InlineEdit 點外判斷同一個形狀)。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-click-outside-invariant.mjs')
