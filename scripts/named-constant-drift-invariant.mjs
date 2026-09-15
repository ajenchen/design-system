#!/usr/bin/env node
/**
 * 同名數值常數不得在不同檔案有不同值(2026-09-12)
 *
 * ## 為什麼需要
 *
 * 2026-09-12 我親手製造了一次:出殼門檻 `SHELL_ENGAGE_VIEWPORT_MS` 在元件是 **60**、
 * 在閘 `data-table-fast-scroll.mjs` 是 **120**(改元件時沒改另一份)。結果是閘判「畫得動 → 不准出殼」、
 * 元件判「畫不動 → 該出殼」,CI 紅得莫名其妙,花了一整輪才找到。
 *
 * **同一個值只要存在第二份,遲早會漂。** 最終修法是消滅第二份(讓閘從元件讀),
 * 但那要人記得;這支閘是機械防線:同名常數一旦在不同檔案取到不同值就紅。
 *
 * ## 判準
 *
 * 掃 `packages/design-system/src/**\/*.ts(x)` 與 `scripts/**\/*.mjs` 的
 * `const NAME = <數字>`(NAME 為 4 字以上全大寫),同名出現在多檔且值不同 → 違規。
 *
 * **合法的同名不同值**寫在 `ALLOWLIST`,每筆都要寫清楚為什麼不是漂移
 * —— 不是為了消滅紅燈,是為了讓「這兩個真的無關」被人審過一次。
 *
 * 對照組(`--selftest`):把允許清單清空 → 那三筆合法案例必須被抓到,證明偵測邏輯有效。
 *
 *   node scripts/named-constant-drift-invariant.mjs [--selftest]
 */
import { readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// 每筆都要說明為什麼「同名不同值」在這裡是對的。空著 = 不准加。
const ALLOWLIST = {
  AVATAR_SIZE: '不同元件各自的頭像尺寸(FileItem 48 / ProfileCard 64)——兩者沒有共用語意,不是同一個值的兩份',
  LOOKBACK: '兩支不相干腳本各自的回看視窗(focus-suppression 8 / hover-instant 3),語意不同',
  WINDOW: '兩支不相干腳本各自的取樣視窗(decided-clause 6 / hover-instant 8),語意不同',
}

const files = [
  ...globSync('packages/design-system/src/**/*.{ts,tsx}', { cwd: REPO }),
  ...globSync('scripts/**/*.mjs', { cwd: REPO }),
].filter((f) => !f.includes('node_modules'))

const found = new Map()
for (const rel of files) {
  let text
  try { text = readFileSync(join(REPO, rel), 'utf8') } catch { continue }
  for (const m of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]{3,})\s*=\s*(-?\d+(?:\.\d+)?)\b/g)) {
    if (!found.has(m[1])) found.set(m[1], new Map())
    found.get(m[1]).set(rel, m[2])
  }
}

const allow = SELFTEST ? {} : ALLOWLIST
const violations = []
for (const [name, byFile] of found) {
  const values = new Set(byFile.values())
  if (values.size <= 1) continue
  if (allow[name]) continue
  violations.push({ name, sites: [...byFile.entries()].map(([f, v]) => `${v} @ ${f}`) })
}

console.log(`掃了 ${files.length} 個檔、${found.size} 個具名數值常數`)
if (found.size === 0) { console.error('✗ 一個常數都沒掃到 —— 這次什麼都沒驗到'); process.exit(1) }

if (SELFTEST) {
  const expected = Object.keys(ALLOWLIST)
  const caught = violations.map((v) => v.name)
  const missed = expected.filter((n) => !caught.includes(n))
  if (missed.length) { console.error(`✗ 對照組:清空允許清單後,這些已知的同名不同值沒被抓到 —— 偵測邏輯失效:${missed.join(', ')}`); process.exit(1) }
  console.log(`✓ 對照組:清空允許清單後如預期抓到 ${caught.length} 筆(含全部 ${expected.length} 筆已知案例)`)
  process.exit(0)
}
if (violations.length > 0) {
  console.error(`✗ ${violations.length} 個同名常數在不同檔案有不同值(同一個值的第二份遲早會漂):`)
  for (const v of violations) { console.error(`  ${v.name}`); for (const s of v.sites) console.error(`     ${s}`) }
  console.error('  → 修法優先序:(1) 消滅第二份(讓其中一邊從另一邊讀)(2) 真的無關就加進 ALLOWLIST 並寫明理由')
  process.exit(1)
}
console.log(`✓ 沒有同名常數在不同檔案取到不同值(${Object.keys(ALLOWLIST).length} 筆已審過的合法同名在允許清單)`)
