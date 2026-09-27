#!/usr/bin/env node
// meta-test for avatar-anchor-box-invariant — 現況必綠、對照組(注入被拉寬的 Avatar 形狀)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static。
//
// 2026-09-25:原本手寫一份「exit 2 = 略過」(與 lib/gate-selftest-meta.mjs 第一版同病:儀器失效也可能是 exit 2),
// 改由共用實作判定 —— 略過只認閘明確印出的缺前置 / 環境標記,INSTRUMENT-FAIL 一律紅。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

// baseline 用 --limit 收斂:這支驗的是**偵測力**(該紅會不會紅),覆蓋率由 CI 的完整 sweep 負責,
// 兩邊都跑全掃會讓同一份工作做三次(2026-09-16 實測:CI job 因此被 15 分鐘上限砍掉)。
// 對照組只需要一支 story —— 注入點在第一支掃到的頁面上。
runGateSelftestMeta('scripts/avatar-anchor-box-invariant.mjs', {
  baseArgs: ['--limit=60'],
  selftestArgs: ['--selftest', '--limit=1'],
})
