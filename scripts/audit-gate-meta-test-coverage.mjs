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
// Ratchet:現存 debt 列 KNOWN_DEBT baseline(不 block,tracked);**新增** checker gate 無 meta-test → exit 1
//   (防新洞;debt 逐支補後從 baseline 移除)。對齊 Polaris migrator ratchet。
//
// 用法:node scripts/audit-gate-meta-test-coverage.mjs [--check]

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const BASELINE = join(SCRIPTS, 'audit-gate-meta-test-coverage.baseline.json')
const CHECK = process.argv.includes('--check')
const WRITE_BASELINE = process.argv.includes('--write-baseline')

// checker gate 命名慣例(fail-closed 語意)
const isChecker = (f) =>
  /^(audit|check)-.*\.mjs$/.test(f) ||
  /-invariant\.mjs$/.test(f) ||
  /-coherence\.mjs$/.test(f) ||
  /-invariants\.mjs$/.test(f)
// 豁免:generator / test / sync / 本 gate 自己
const isExempt = (f) =>
  /^gen-/.test(f) || /^test-/.test(f) || /^sync-/.test(f) ||
  /\.baseline\.json$/.test(f) || f === 'audit-gate-meta-test-coverage.mjs'

const metaTestFor = (f) => `test-${f}`.replace(/\.mjs$/, '.mjs') // scripts/test-<name>.mjs
const hasMetaTest = (f) => existsSync(join(SCRIPTS, `test-${f}`))

const allFiles = readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs'))
const gates = allFiles.filter((f) => isChecker(f) && !isExempt(f))
const missing = gates.filter((f) => !hasMetaTest(f))

if (WRITE_BASELINE) {
  writeFileSync(BASELINE, JSON.stringify({ _note: 'gate meta-test debt baseline(ratchet;逐支補後移除)', knownDebt: missing.sort() }, null, 2) + '\n')
  console.log(`✅ baseline 寫入 ${missing.length} 個 known debt`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).knownDebt || [] : []
const newGaps = missing.filter((f) => !baseline.includes(f))
const covered = gates.length - missing.length

console.log(`=== Gate meta-test coverage ===`)
console.log(`checker gate: ${gates.length} / 有 meta-test: ${covered} / 缺: ${missing.length}(known debt ${baseline.length} + 新洞 ${newGaps.length})`)
if (missing.length) {
  console.log(`\nknown debt(tracked,逐支補):`)
  missing.filter((f) => baseline.includes(f)).forEach((f) => console.log(`  - ${f} → 需 scripts/test-${f}`))
}
if (newGaps.length) {
  console.log(`\n🚨 新 checker gate 無 meta-test(必補):`)
  newGaps.forEach((f) => console.log(`  - ${f} → 需 scripts/test-${f}(注入違規→確認 exit≠0→revert)`))
}

if (CHECK && newGaps.length) {
  console.error(`\n❌ ${newGaps.length} 個新 checker gate 缺 meta-test → 補 test-<name>.mjs 或加進 baseline(需理由)`)
  process.exit(1)
}
console.log(newGaps.length ? '' : '\n✅ 無新洞(known debt ratchet 中)')
process.exit(0)
