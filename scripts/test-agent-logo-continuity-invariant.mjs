#!/usr/bin/env node
// meta-test for agent-logo-continuity-invariant —— 現況必綠 + 對照組必紅 / 必分得出「機器卡住」與「產品跳幀」。
//
// 2026-09-21 補:這支閘先前連 --selftest 都沒有,也就是從沒有人證明過它「在該紅的時候會紅」;
// 而唯一會講出這件事的 audit-gate-meta-test-coverage 自己也沒被任何執行面呼叫過。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs。
//
// 2026-09-27(待辦總帳 N39):C2 曾隨機器負載紅綠不定 —— 09-15 把上限夾到 3 格沒有根治,任何一次 > 75ms 的
// 主執行緒卡頓仍誤指產品。閘改成「等速段角度差 ≡ ω×經過時間(雙邊,無盲區)/ 加速減速段盲區 → INSTRUMENT-FAIL」,
// 這裡多跑兩面對照組,證明它分得出來:
//   --stall=steady  在等速段注入 120ms 同步長工作 → 必須**綠**(角度仍對得上時間,不是跳幀)
//   --stall=exit    同一種卡頓落在減速段 → 必須 **INSTRUMENT-FAIL**(儀器失效;不得判產品紅、也不得放行)
// 兩面缺一不可:只證明「卡頓不誤紅」而不證明「盲區不放行」,等於把 M37「沒量到 ≠ 沒發生」關掉。
// 缺建置 / 起不了瀏覽器的略過判準與 runGateSelftestMeta 同一份(classifyGateRun),不另抄一份。
import { spawnSync } from 'node:child_process'
import { classifyGateRun, runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

const GATE = 'scripts/agent-logo-continuity-invariant.mjs'
const run = (args) => {
  const r = spawnSync(process.execPath, [GATE, ...args], { stdio: 'pipe', encoding: 'utf8' })
  return { status: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// 先跑瀏覽器對照組(runGateSelftestMeta 最後會 process.exit,所以它放最後)
const expectations = [
  { args: ['--stall=steady'], want: 'pass', why: '等速段卡 120ms:角度差 84° = ω×Δft 84°,不是跳幀,必須綠' },
  { args: ['--stall=exit'], want: 'instrument-fail', why: '減速段卡 120ms:那一對取樣是盲區,必須 INSTRUMENT-FAIL(不指控產品、不放行)' },
]
let ok = true
for (const { args, want, why } of expectations) {
  const result = run(args)
  const { verdict } = classifyGateRun(result)
  if (verdict === 'skip-prerequisite' || verdict === 'skip-env') {
    console.log(`· 略過對照組 ${args.join(' ')}:${verdict}(exit ${result.status})—— 缺建置 / 起不了瀏覽器;真正的紅綠由 CI 的瀏覽器 job 裁決`)
    continue
  }
  const hit = verdict === want
  ok &&= hit
  console.log(`${hit ? '✓' : '✗'} 對照組 ${args.join(' ')} → ${verdict}(要 ${want};exit ${result.status})—— ${why}`)
  if (!hit) console.log(result.text.split('\n').filter((l) => /C2|INSTRUMENT|失敗|PASS/u.test(l)).map((l) => `    ${l}`).join('\n'))
}
if (!ok) { console.log('✗ agent-logo-continuity 卡頓對照組沒有分出「機器卡住」與「產品跳幀」'); process.exit(1) }

runGateSelftestMeta(GATE)
