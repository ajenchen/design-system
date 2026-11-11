#!/usr/bin/env node
// meta-test for header-content-sides-invariant —— 現況必綠 + 對照組(--selftest 把左改 tight、右貼邊、列沒貼齊、表格收尾 tight、撐滿面板收尾只有 loose、
// 貼內容的浮層收尾給 48、清單收尾多內距、角色 / 容器 / pattern 與登記不符、沒量到餵進判定)必紅;
// 容器種類(classifyBox)直接量「跟不跟著內容」:多 1px 但跟著內容長足 → hug 綠、撐滿外殼 → fill 紅,對照組拿掉直接量必重現 PR #172 CI 的 1px 假紅。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/header-content-sides-invariant.mjs')
