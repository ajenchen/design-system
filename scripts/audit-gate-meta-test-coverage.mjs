#!/usr/bin/env node
// Gate meta-test coverage(2026-07-11 user「把能機械化的都收掉」— governance 弱軸 #1)。
//
// 為何存在:governance-audit-coverage.md 弱軸 #1 =「多數 .mjs gate 無 meta-test(注入違規→確認 exit 1)」。
//   audit-hook-test-coverage 對 .sh hook 做了;.mjs gate 一直沒對應閘 → 本 script 補上。
//   鏡射 hook-test-coverage 模式:只驗「meta-test 檔存在」= 可靠機械 fact(test 品質靠 CI 實跑 + reviewer)。
//
// 規則:fail-closed checker gate(audit-*/check-*/*-invariant/*-coherence.mjs,有 --check 或 exit≠0 語意)
//   必有 `scripts/test-<basename>.mjs` meta-test。
// 豁免(明寫):gen-*(generator,--check 驗 drift = 自帶 self-check)/ test-*(本身是 test)/
//   sync-*(sync 工具)/ 純 helper。
// Ratchet:checker inventory 與 paired mutation test 必須維持零 debt。新 gate 或移除 test 皆立即 fail closed；
//   baseline 僅固定「空 debt」政策，不是新增豁免的通道。
//
// 用法:node scripts/audit-gate-meta-test-coverage.mjs [--check]

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { discoverCheckerGates, discoverGateMetaTestPairs } from './lib/gate-meta-test-inventory.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const BASELINE = join(SCRIPTS, 'audit-gate-meta-test-coverage.baseline.json')
const CHECK = process.argv.includes('--check')
const WRITE_BASELINE = process.argv.includes('--write-baseline')

const gates = discoverCheckerGates(join(SCRIPTS, '..'))
const pairedStems = new Set(discoverGateMetaTestPairs(join(SCRIPTS, '..')).map(({ stem }) => stem))
const missing = gates.filter((f) => !pairedStems.has(f.replace(/\.mjs$/, '')))

if (WRITE_BASELINE) {
  if (missing.length > 0) {
    console.error(`❌ zero-debt policy 禁止把 ${missing.length} 個 checker gap 寫成 baseline 豁免`)
    process.exit(1)
  }
  writeFileSync(BASELINE, `${JSON.stringify({
    _note: 'Gate mutation coverage is discovery-derived and zero-debt; this file may never whitelist a missing pair.',
    knownDebt: [],
    debtReasons: {},
  }, null, 2)}\n`)
  console.log('✅ zero-debt baseline 已重建')
  process.exit(0)
}

const baselineDocument = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const baseline = Array.isArray(baselineDocument.knownDebt) ? baselineDocument.knownDebt : []
const debtReasons = baselineDocument.debtReasons && typeof baselineDocument.debtReasons === 'object'
  ? baselineDocument.debtReasons
  : {}
const newGaps = missing.filter((f) => !baseline.includes(f))
const staleDebt = baseline.filter((f) => !missing.includes(f))
const duplicateDebt = baseline.filter((f, index) => baseline.indexOf(f) !== index)
const missingReasons = baseline.filter((f) => typeof debtReasons[f] !== 'string' || !debtReasons[f].trim())
const extraReasons = Object.keys(debtReasons).filter((f) => !baseline.includes(f))
const baselineProblems = [
  ...baseline.map((f) => `zero-debt baseline may not whitelist:${f}`),
  ...staleDebt.map((f) => `stale known debt:${f}`),
  ...duplicateDebt.map((f) => `duplicate known debt:${f}`),
  ...missingReasons.map((f) => `known debt lacks reason:${f}`),
  ...extraReasons.map((f) => `reason has no known debt:${f}`),
]
const covered = gates.length - missing.length

console.log(`=== Gate meta-test coverage ===`)
console.log(`checker gate: ${gates.length} / 有 meta-test: ${covered} / 缺: ${missing.length}(zero-debt baseline ${baseline.length})`)
if (missing.length) {
  console.log(`\n❌ zero-debt policy 下不可存在的 checker gaps:`)
  missing.filter((f) => baseline.includes(f)).forEach((f) => console.log(`  - ${f} → 需 scripts/test-${f}`))
}
if (newGaps.length) {
  console.log(`\n🚨 新 checker gate 無 meta-test(必補):`)
  newGaps.forEach((f) => console.log(`  - ${f} → 需 scripts/test-${f}(注入違規→確認 exit≠0→revert)`))
}
if (baselineProblems.length) {
  console.log(`\n🚨 baseline 與實際 coverage 不一致:`)
  baselineProblems.forEach((problem) => console.log(`  - ${problem}`))
}

if (CHECK && (newGaps.length || baselineProblems.length)) {
  console.error(`\n❌ gate meta-test coverage inventory 未閉合:new gaps ${newGaps.length},baseline problems ${baselineProblems.length}`)
  process.exit(1)
}
console.log(newGaps.length || baselineProblems.length ? '' : '\n✅ discovery-derived paired mutation coverage 全數閉合，zero debt')
process.exit(0)
