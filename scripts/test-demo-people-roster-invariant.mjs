#!/usr/bin/env node
// meta-test for demo-people-roster-invariant —— 現況必綠 + 對照組(--selftest 把名冊改成不合格的臉、手寫 ?u= 網址、同檔兩人同臉、_demo 畫面檔同臉、
// 名冊沒有的名字、尺寸超過 1000、檔案縮圖用不合格的臉 / 形狀錯、兩個範本資料夾帶照片網址、名錄成員不在名冊、名冊讀不到)必紅,且紅的必須是指名的那一條。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/demo-people-roster-invariant.mjs')
