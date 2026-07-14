#!/usr/bin/env node
/**
 * audit-failure-class-coverage.mjs — 「每類病根必有防線」常設閘(deep-audit dim 91)
 *
 * 2026-07-10 user verbatim「以後其他 Consumer 來做 WM 一樣的設計的時候,是否可以被好好治理
 * 避免發生不該發生的問題?…這應該是建立治理的基本原則吧?且稽核應該也會確認這個基本原則吧?」
 *
 * Registry SSOT:.claude/references/failure-class-registry.json
 * 規則(fail-closed):
 *   1. 每 class 必有 status ∈ {protected, remediating, judgment}
 *   2. remediating 必帶 plan(具體指標,禁空泛)
 *   3. judgment 必帶 auditDim(regex 不可判 → audit dim 兜底,不可裸放)
 *   4. protected 建議帶 note(防線 cite);缺 note 只 warn 不 fail
 *   5. registry 本身必存在且 ≥ 1 class(防「刪 registry 繞閘」)
 *
 * 用法:
 *   node scripts/audit-failure-class-coverage.mjs          # report
 *   node scripts/audit-failure-class-coverage.mjs --check  # exit 1 on violation(preflight / dim 91)
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const REG = path.join(ROOT, '.claude/references/failure-class-registry.json')

const errors = []
const warns = []

if (!fs.existsSync(REG)) {
  console.error('❌ failure-class-registry.json 不存在(刪 registry 繞閘 = fail-closed)')
  process.exit(1)
}

let reg
try {
  reg = JSON.parse(fs.readFileSync(REG, 'utf8'))
} catch (e) {
  console.error(`❌ registry JSON parse fail: ${e.message}`)
  process.exit(1)
}

const classes = reg.classes || []
if (classes.length < 1) errors.push('registry 空(≥1 class 必要)')

const VALID = new Set(['protected', 'remediating', 'judgment'])
const counts = { protected: 0, remediating: 0, judgment: 0 }

for (const c of classes) {
  const tag = c.id || c.name || '(unnamed)'
  if (!c.id || !c.name) errors.push(`${tag}: 缺 id / name`)
  if (!VALID.has(c.status)) {
    errors.push(`${tag}: status "${c.status}" 不在 {protected, remediating, judgment}`)
    continue
  }
  counts[c.status]++
  if (c.status === 'remediating' && !(c.plan && c.plan.trim().length > 10)) {
    errors.push(`${tag}: remediating 必帶具體 plan 指標(現況缺/太空泛)`)
  }
  if (c.status === 'judgment' && !(c.auditDim && String(c.auditDim).trim())) {
    errors.push(`${tag}: judgment 必帶 auditDim 兜底(regex 不可判 ≠ 可裸放)`)
  }
  if (c.status === 'protected' && !c.note) {
    warns.push(`${tag}: protected 建議帶 note(防線 cite)`)
  }
}

console.log('=== Failure-class coverage(dim 91)===')
console.log(`classes: ${classes.length} — protected ${counts.protected} / remediating ${counts.remediating} / judgment ${counts.judgment}`)
if (warns.length) warns.forEach((w) => console.log(`  ⚠️  ${w}`))
if (errors.length) {
  console.error('\n❌ 違規:')
  errors.forEach((e) => console.error(`  - ${e}`))
  if (CHECK) process.exit(1)
} else {
  console.log('✅ 每類病根都有防線 / 具體 plan / audit-dim 兜底')
}
process.exit(0)
