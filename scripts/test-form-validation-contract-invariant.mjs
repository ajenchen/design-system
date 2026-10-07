#!/usr/bin/env node
// meta-test for form-validation-contract-invariant —— 現況必綠 + 對照組(--selftest:二十六個單一根因突變 ——
// hook 十一個:errors 以物件身分 memo / Escape 改回 resetField / 焦點改回整頁 getElementsByName / 不掛歸屬標記 / 不以 form 界定 /
// 按著指標時當場驗 / 觸控點一下不算按壓 / 延後的驗證不跑 / 焦點回來仍驗 / 原生拖曳不算按壓結束 / 取消只結束被取消的那一個 pointer;
// 2026-10-01 下午十一個:欄位改過不掛 Esc 層 / 浮層守門不看標記 / DialogContent 不記開啟者 / Button 忙碌走原生 disabled /
// Button 握著焦點仍轉原生 disabled / Button 焦點離開後不回原生 disabled / 送出成功不重設基準 / 可聚焦停用不擋 click / 三則 story 各拿掉 Toast;
// 2026-10-07 四個:Dialog「表單」拿掉 Toast / 打開時不 reset、Sheet「編輯成員詳情」拿掉 Toast / 「建立新專案」打開時不 reset
// —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/form-validation-contract-invariant.mjs')
