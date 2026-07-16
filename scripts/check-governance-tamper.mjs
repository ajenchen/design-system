#!/usr/bin/env node
/**
 * check-governance-tamper.mjs — PNG P4.3:治理弱化/移除偵測(governance tamper ratchet)。
 *
 * 為何存在(codex 規格 §17):「修改 SSOT 卻未 sync、弱化 verifier、移除 CI gate 必須 fail-closed」。
 *   既有 audit-gate-meta-test-coverage 保證「gate 有 meta-test」,但**拔掉 preflight 裡的 run() 行**
 *   不會被任何 gate 抓(gate 消失 = 它的 meta-test 也不再被要求)。本 ratchet 補這個洞:
 *
 * R1 preflight gate-count ratchet:release-preflight.mjs 的 run() 呼叫數只增不減。
 *    baseline = .claude/references/preflight-gate-baseline.json;減少 → fail(合法 retire 需
 *    同 commit 更新 baseline + 檔內記 retire 理由行,審計軌跡留在 git diff)。
 * R2 waiver 過期驗證:全庫 `@waiver(owner:<x> expiry:<YYYY-MM-DD> reason:<...>)` 格式
 *    (PNG P3.2 time-boxed waiver;與既有永久 rationale-marker 家族〔@xxx-allow/@xxx-rationale,
 *    hook 各自驗 rationale〕分工:暫時性例外必用本格式)— expiry 過期 → fail。
 *
 * 用法:node scripts/check-governance-tamper.mjs [--check] [--update-baseline]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const UPDATE = process.argv.includes('--update-baseline')
const BASELINE = path.join(ROOT, '.claude/references/preflight-gate-baseline.json')
const errors = []

// R1
const pf = fs.readFileSync(path.join(ROOT, 'scripts/release-preflight.mjs'), 'utf8')
const gateCount = (pf.match(/^run\(/gm) || []).length
if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ gateCount, updated: new Date().toISOString().slice(0, 10), note: '合法 retire gate 需同 commit 更新本檔 + preflight 檔內記 retire 理由' }, null, 2) + '\n')
  console.log(`baseline updated: ${gateCount} gates`)
  process.exit(0)
}
if (!fs.existsSync(BASELINE)) errors.push(`R1: baseline 不存在 — 跑 --update-baseline 初始化`)
else {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  if (gateCount < b.gateCount) errors.push(`R1: preflight gates ${gateCount} < baseline ${b.gateCount} — gate 被移除(tamper?)。合法 retire → 同 commit 跑 --update-baseline + 檔內記理由`)
}

// R2
let waivers = []
try {
  const out = execSync(String.raw`grep -rnoE "@waiver\([^)]*\)" packages/design-system/src .claude apps scripts 2>/dev/null || true`, { encoding: 'utf8', cwd: ROOT })
  waivers = out.split('\n').filter(Boolean).filter((l) => !l.includes('check-governance-tamper.mjs'))
} catch { /* none */ }
const today = new Date().toISOString().slice(0, 10)
for (const w of waivers) {
  const m = w.match(/@waiver\(([^)]*)\)/)
  const body = m?.[1] ?? ''
  const owner = /owner:([^\s)]+)/.exec(body)?.[1]
  const expiry = /expiry:(\d{4}-\d{2}-\d{2})/.exec(body)?.[1]
  const reason = /reason:/.test(body)
  const at = w.split(':@')[0] ?? w
  if (!owner || !expiry || !reason) errors.push(`R2: waiver 格式不全(需 owner/expiry/reason):${at}`)
  else if (expiry < today) errors.push(`R2: waiver 已過期(${expiry}):${at}`)
}

if (errors.length) {
  console.error('❌ governance-tamper 閘 FAIL:')
  for (const e of errors) console.error('   - ' + e)
  process.exit(1)
}
console.log(`✅ governance-tamper 閘 PASS(preflight ${gateCount} gates ≥ baseline;time-boxed waivers ${waivers.length} 個全部有效)`)
