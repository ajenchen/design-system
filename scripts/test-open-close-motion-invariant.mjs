#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: open-close-motion-invariant 這支閘在該紅的時候真的會紅、現況下是綠的 —— 也就是「收起後的樣子由 CSS 撐住(JS 收尾晚到也不長回來)」
 *         與「減少動態下不播開合動畫」這兩件事,在 10 個成員上確實被量到,而不是量具壞了恆綠。
 *   紅: baseline(不帶參數)不是綠、或 `--selftest`(關閉狀態填充模式強制 none + 減少動態下以更高權重重新宣告動畫)沒有讓每個成員的
 *       E1 / E2 / R1 全紅 → exit 1;baseline 印 INSTRUMENT-FAIL(沒量到)→ 紅,不算略過。
 *   綠: 兩者都成立。略過只認閘明確印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV(判定在 lib/gate-selftest-meta.mjs);
 *       量的是每一格的狀態與「動畫結束當下」的計算樣式,不是幀時間,重複跑結果恆等(修前 / 修後各跑兩次數字相同)。
 */
// meta-test for open-close-motion-invariant —— 現況必綠、對照組(關閉狀態的填充模式強制回 none = 終態只靠 JS 補丁;減少動態底下用更高權重
// 重新宣告動畫 = 守衛輸給權重)必讓每個成員的 E1 / E2 / R1 紅(gate-meta-test 家族)。需要已 build 的 storybook-static;
// 略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責)。
// 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md T6 / T7。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/open-close-motion-invariant.mjs')
