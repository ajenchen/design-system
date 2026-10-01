#!/usr/bin/env node
// meta-test for searchable-menu-focus-invariant —— 現況必綠 + selftest 對照組(判定表 + 在頁面上把修法逐一拆掉:
// 選項 mousedown 搶焦點 / 輸入框 aria-activedescendant 寫不上 / 空值時搜尋框不在 / 還焦點的 focusVisible: false 被吃掉 /
// 欄位內搜尋框的 aria-controls 被拿掉 / 觸發欄位 mousedown 搶焦點 / 清空前的焦點交接被吃掉 / 鍵盤事件看不出組字 /
// 「+N」浮出清單 mousedown 搶焦點 / 浮出清單移除後的焦點交接被吃掉 / 欄位內搜尋框的量尺不算數 /
// 組字中的 Esc 被當成一般 Esc / 欄位內搜尋框那一格的寬沒有上限)必紅。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
// `--static=<dir>` 原樣轉給閘(本機用自己的建置目錄驗包裝;CI 與夜間快照不帶參數,走預設 storybook-static)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const passthrough = process.argv.slice(2).filter((a) => a.startsWith('--static='))
runGateSelftestMeta('scripts/searchable-menu-focus-invariant.mjs', { baseArgs: passthrough, selftestArgs: ['--selftest', ...passthrough] })
