#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/calendar-render-contract-invariant.mjs 在該紅的時候會紅 —— 現況跑一次必須綠(三層範例載入沒有 [Calendar] 開發期警告、
 *         renderEventTile 收到版面那一段的延續資訊、單筆唯讀不是按鈕),`--selftest` 跑一次必須綠(三個原始碼突變:範例留一筆「含」的資料、
 *         交給 renderEventTile 的 segment 寫死、單筆 readOnly 沒接上 —— 每一個都只讓它指定的那一格紅)。
 *   紅: 現況紅、或對照組有任何一個突變沒照預期紅、或任一趟印出儀器失效(INSTRUMENT-FAIL)→ exit 1。
 *   綠: 兩趟都照預期時 exit 0。純 Node(esbuild + react-dom/server),不需要 storybook 建置;判準與略過規則由共用實作
 *       lib/gate-selftest-meta.mjs 決定,本檔不另寫一份。
 */
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/calendar-render-contract-invariant.mjs')
