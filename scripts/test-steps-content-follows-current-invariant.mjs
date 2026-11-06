#!/usr/bin/env node
// meta-test for steps-content-follows-current-invariant —— 現況必綠 + selftest 對照組必紅
//(判定表、importsSteps 兩面、儀器失效訊息印得出原因、沒有 Steps story 的假建置端到端、真建置上注入 aria-expanded / 內容放錯步 / 點 header 後舊內容留在原步)。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/steps-content-follows-current-invariant.mjs')
