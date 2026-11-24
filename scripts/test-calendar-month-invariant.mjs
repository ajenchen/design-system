#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/calendar-month-invariant.mjs 在該紅的時候會紅 —— 現況跑一次必須綠(月格骨架與間距照 calendar.spec.md),
 *         `--selftest` 跑一次必須綠(十五個突變:星期列搬出格陣、週列高 auto、最後一週留底線、格子內距 6、工具列改回內距撐高、nav 沒名稱、
 *         欄頭名稱改短字、事件列高 20、事件列焦點框改回往內、捲動區可聚焦、捲動區不能捲、日期鈕 focus() 失效、en-GB 寫死週日起、標題層級不跟 titleAs、
 *         1 號實心底被壓成 24 寬 —— 每一個都讓預期的那一格紅)。
 *   紅: 現況紅、或對照組有任何一個突變沒被抓到、或任一趟印出儀器失效(INSTRUMENT-FAIL)→ exit 1。
 *   綠: 兩趟都照預期時 exit 0。需要已 build 的 storybook-static(CI 的瀏覽器 job 先 build);缺建置在一般環境略過、在必需瀏覽器的
 *       lane(GOVERNANCE_BROWSER_REQUIRED=1)紅 —— 判準與略過規則由共用實作 lib/gate-selftest-meta.mjs 決定,本檔不另寫一份。
 */
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/calendar-month-invariant.mjs')
