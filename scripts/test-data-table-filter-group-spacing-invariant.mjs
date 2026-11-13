#!/usr/bin/env node
// meta-test for data-table-filter-group-spacing-invariant —— 現況必綠 + 對照組(--selftest:判定表每一段各有該紅 / 該綠 / 儀器失效;
// 真建置上先量一趟現況必綠,再逐一拆:群組框內距改 12、框內列距改 12、第一個群組往下推 4px、標籤上內距歸零、第二個群組往下推 4px、
// 框內距改成跟密度走 —— 每一種必須紅在它負責的那一段)必紅。需要 storybook 建置(瀏覽器 lane)。
// 出處:tmp wip MASTER-TODO A5 之 ⑤(巢狀篩選群組的間距;現況已符合、畫面不動,補規格句與這支閘 ——【AI 推導 2026-11-13】,user 沒有逐字講過)。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-filter-group-spacing-invariant.mjs')
