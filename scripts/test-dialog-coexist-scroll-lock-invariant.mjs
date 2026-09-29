#!/usr/bin/env node
// meta-test for dialog-coexist-scroll-lock-invariant —— 現況必綠 + selftest 對照組(判定表 + 在頁面上把鎖拆掉)必紅。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
// `--static=<dir>` 原樣轉給閘(本機用自己的建置目錄驗包裝;CI 與夜間快照不帶參數,走預設 storybook-static)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const passthrough = process.argv.slice(2).filter((a) => a.startsWith('--static='))
runGateSelftestMeta('scripts/dialog-coexist-scroll-lock-invariant.mjs', { baseArgs: passthrough, selftestArgs: ['--selftest', ...passthrough] })
