#!/usr/bin/env node
// meta-test for overlay-cover-anchor-invariant —— 現況必綠 + 對照組(--selftest:單一根因突變,清單以腳本的 MUTANTS 為準 ——
// 虛擬錨點不算位置 / 只置中不推回 / 推回不留 8px / 高度照錨定浮層的可用高 / 外殼拿掉 flex 鏈 —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。
// 不需要 storybook(原始碼打包進空白頁)。出處:總帳 Q2b(定)「以格子為中心(水平 + 垂直)」(OVERLAY-CAPABILITIES ①)。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-cover-anchor-invariant.mjs')
