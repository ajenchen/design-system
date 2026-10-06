#!/usr/bin/env node
// meta-test for escape-and-focus-contract-invariant —— 現況必綠 + 對照組(--selftest:二十五個單一根因突變 ——
// LinkInput 看 raw defaultPrevented / 就地編輯不宣告 Esc 層 / DatePicker 草稿不宣告 / DatePicker 草稿的 Esc 不看 Radix 用掉 / DataTable 根不宣告 / Calendar 方塊不宣告 /
// 拖曳不宣告 / DataTable 拖曳中仍用 self 層 / Combobox 丟掉表單 props / 表單 Esc 不看 Radix 用掉 / 複合欄位 blur 一律轉呼叫 /
// 不記選單的觸發鈕 / FileUpload 不以被點的 × 為基準 / 結算 Enter 不 preventDefault / LinkInput Enter 一律 blur /
// DatePicker 收起日曆不還焦點 / Button 握著焦點仍轉原生 disabled / 改名「儲存」空白時停用 / 輸入盒不留焦點 / 輸入盒不接力 /
// 2026-10-07:DataTable 游標不看欄 / 守門不驗收 / DatePicker 替 consumer 認領 / Combobox「+N」卡不算欄位 / 可聚焦停用保留 aria-disabled 長相
// —— 各自必須剛好紅它負責的契約列,對照列全程綠)必紅。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/escape-and-focus-contract-invariant.mjs')
