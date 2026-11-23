#!/usr/bin/env node
// meta-test for data-table-row-estimate-density-invariant —— 現況必綠 + 對照組必紅。需要 storybook 建置(瀏覽器 lane)。
// 對照組(--selftest):判定表(M / C / D / E 每一格各有該紅 / 該綠 / 量不到);真建置上先量一趟現況必綠,再用載入前的 init script 讓
// 「訂了密度屬性的 MutationObserver」收不到某一類變動 —— X 收不到 data-ui-size → 四格必須正好「C 紅、其餘綠」;Y 收不到 html 以外元素的
// data-density → 正好「D 紅、其餘綠」;破法沒有標記到觀察器 / 沒丟掉紀錄 = 對照組不成立;另拿假建置驗主跑的儀器失效出口(標記 + exit 2)。
// 出處:tmp wip MASTER-TODO A7 ③(稽核 R7-03 / 第四批審查第 7 條)。「列高估計要跟著區塊密度更新」這句規則是【AI 推導 2026-11-14】,
// user 沒有逐字講過;產品在 2026-11-12 c78b35e1 已修,這支閘是補量測。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/data-table-row-estimate-density-invariant.mjs')
