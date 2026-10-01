#!/usr/bin/env node
// meta-test for form-validation-contract-invariant —— 現況必綠 + 對照組(--selftest:十一個單一根因突變 ——
// errors 以物件身分 memo / Escape 改回 resetField / 焦點改回整頁 getElementsByName / 不掛歸屬標記 / 不以 form 界定 /
// 按著指標時當場驗 / 觸控點一下不算按壓 / 延後的驗證不跑 / 焦點回來仍驗 / 原生拖曳不算按壓結束 / 取消只結束被取消的那一個
// pointer —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/form-validation-contract-invariant.mjs')
