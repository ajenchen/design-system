#!/usr/bin/env node
// meta-test for overlay-height-cap-invariant —— 現況必綠(12 格:Popover / HoverCard / DropdownMenu 不傳 / 傳數字 / 傳字串 / 傳得比可用高大、
// 子選單、CommandList、ProfileCard)+ 對照組(--selftest 四種破法:可用高改 100vh、capHeight 不理會 cap、清單上限改 30rem、
// 子選單拿掉上限,各自讓指定的格紅)。需要已 build 的 storybook-static(夾具的樣式取它的 preview CSS)。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs(略過只認閘印出的缺前置 / 環境標記,INSTRUMENT-FAIL 一律紅)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-height-cap-invariant.mjs')
