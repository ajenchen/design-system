#!/usr/bin/env node
// meta-test for check-src-republish — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// 這個 gate 的偵測機制 = `git diff <baselineTag> HEAD` 比對 npm publish surface(非工作區檔案),
// 條件 = ship-relevant diff 非空 **且** package.json 版本 === npm latest(沒 bump)→ exit 1。
// 所以注入手法必須動 git HEAD(暫時 commit 一個 ship-relevant src 檔),不能只寫工作區檔案。
// 版本刻意不 bump → 觸發「surface 改了但沒 republish → consumer 拿 stale code」BLOCK。
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const git = (cmd) => execSync(`git ${cmd}`, { stdio: 'pipe', encoding: 'utf8' }).trim()
const GATE = 'node scripts/check-src-republish.mjs --check'
let ok = true

// 1) 現況必 PASS(baseline)
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 可能已有真違規 → 換乾淨 target)'); process.exit(1) }
console.log('✓ baseline PASS')

// 2) 注入違規:暫時 commit 一個 ship-relevant src 檔(改 publish surface)但不 bump 版本 → 必 FAIL → 還原
const ORIG = git('rev-parse HEAD')
const PROBE = 'packages/design-system/src/__republish_meta_probe__.tsx'
try {
  writeFileSync(PROBE, 'export const __republishMetaProbe = 1\n')
  git(`add ${PROBE}`)
  git('commit --no-verify -q -m "temp: republish meta-test probe (auto-reverted)"')
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 ship-relevant commit 後 gate 未 FAIL(detection 失效或環境降級)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  // 還原:硬 reset 回原 HEAD(丟掉 temp commit + 其帶入的 probe 檔),再清工作區殘留
  try { git(`reset --hard ${ORIG} -q`) } catch (e) { console.error('⚠️  git reset 還原失敗:' + e.message) }
  if (existsSync(PROBE)) rmSync(PROBE)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS(HEAD 未乾淨回復?)'); process.exit(1) }
console.log('✓ restore PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
