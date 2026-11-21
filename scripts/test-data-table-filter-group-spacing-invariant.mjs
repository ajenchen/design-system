#!/usr/bin/env node
// meta-test for data-table-filter-group-spacing-invariant —— 現況必綠 + 對照組(--selftest:判定表每一段各有該紅 / 該綠 / 儀器失效,A70 的形狀必紅 [T][K];
// 真建置上先量一趟現況必綠,再逐一拆:群組框內距改 12、框內列距改 12、第一個群組往下推 4px、巢狀面板上下內距都改成 loose(A70 的樣子)、
// 巢狀面板下內距改成 loose、平鋪面板上內距改成 loose、群組清光後上 / 下內距改成 loose、標籤上內距歸零、第二個群組往下推 4px、框內距改成跟密度走、
// 最後一個群組 →「加入篩選器」那一排往下推 4px、平鋪面板第二條往下推 4px、排序面板上內距改成 loose —— 每一種的紅燈集合必須正好等於登記的那一組)必紅。
// 需要 storybook 建置(瀏覽器 lane)。
// 出處:tmp wip MASTER-TODO A5 之 ⑤(巢狀篩選群組的間距,2026-11-13)、A70(2026-11-14:照 user 在 A5 成品頁的留言 ① 的原則,
// 巢狀面板標題列 → 第一個灰底群組由 tight 改 loose ——【AI 推導 2026-11-14】)與 A72(2026-11-14 下午 user 在對話裡說篩選條件第一個距頂應對齊條件之間的距離
// (問句,AI 評估同意)→ 巢狀面板上下改回 tight、加 K 量三個面板的韻律;【更正 2026-11-14】A70 那一段改掉)。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-filter-group-spacing-invariant.mjs')
