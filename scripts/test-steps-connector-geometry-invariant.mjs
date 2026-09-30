#!/usr/bin/env node
// meta-test for steps-connector-geometry-invariant —— 現況必綠 + selftest 對照組(修法前的 18.2 / 2.2 / 0)必紅。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/steps-connector-geometry-invariant.mjs')
