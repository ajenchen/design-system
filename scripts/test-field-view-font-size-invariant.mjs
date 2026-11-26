#!/usr/bin/env node
// meta-test for field-view-font-size-invariant —— 現況必綠 + 對照組(--selftest 八個單一根因突變:PeoplePicker 預設檢視態拿掉字級〔A100 修前〕、
// fieldDisplayTextClass 回空 / lg 給錯 / sm·md 給錯、fieldWrapperStyles 拿掉 size 字級 / lg 給錯 / sm·md 給錯、Combobox 外殼「不限」給錯字級,
// 各自必須剛好紅它負責的列)。
// 不需要 storybook,只需要 Chromium。跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/field-view-font-size-invariant.mjs')
