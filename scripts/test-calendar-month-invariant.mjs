#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/calendar-month-invariant.mjs 在該紅的時候會紅 —— 現況跑一次必須綠(月格骨架與間距照 calendar.spec.md),
 *         `--selftest` 跑一次必須綠(五十一個突變:星期列搬出格陣、週列高 auto、最後一週留底線、格子內距 6、工具列改回內距撐高、nav 沒名稱、
 *         欄頭名稱改短字、事件列高 20、事件列焦點框改回往內、捲動區可聚焦、捲動區不能捲、格最小高沒算格線(60)、k 不隨格高變(最小高 / 掃格高各一)、
 *         日期鈕 focus() 失效、en-GB 寫死週日起、標題層級不跟 titleAs、日期名稱改回舊念法、今天沒有 aria-current、aria-current 掛在每一天、
 *         唯讀格的 aria-label 放回去、唯讀格看得見的日期數字沒有 aria-hidden、唯讀格沒有 aria-current、唯讀格念不到橫跨過來的長條、labels 覆寫沒生效(寫死預設中文)、
 *         隱藏週末(焦點落空 / 1 號被藏沒有停靠點 / 週末寫死六日)、週數欄(欄寬不一致 / 可聚焦 / 字樣 / 第一週天數寫死 1)、
 *         載入中(沒 aria-busy / 骨架沒 aria-hidden / 照念筆數 / 點不到)、窄寬(沒接上 / 門檻改看內容寬來回跳 / 量畫面寬被祖先縮放騙成窄)、
 *         事件版面(長條改回逐日方塊、沒阻止冒泡、格子是定位元素、F2 只查格子自己、斷開那一端也圓角、被藏的日子不切段、k 少算 / 多算一列、
 *         長條沒墊不透明的格子底)、自訂事件方塊(外層不裁內容 → 畫到下一列與隔壁格、裁切連焦點框一起裁掉)、1 號實心底被壓成 24 寬 —— 每一個都讓預期的那一格紅)。
 *   紅: 現況紅、或對照組有任何一個突變沒被抓到、或任一趟印出儀器失效(INSTRUMENT-FAIL)→ exit 1。
 *   綠: 兩趟都照預期時 exit 0。需要已 build 的 storybook-static(CI 的瀏覽器 job 先 build);缺建置在一般環境略過、在必需瀏覽器的
 *       lane(GOVERNANCE_BROWSER_REQUIRED=1)紅 —— 判準與略過規則由共用實作 lib/gate-selftest-meta.mjs 決定,本檔不另寫一份。
 */
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/calendar-month-invariant.mjs')
