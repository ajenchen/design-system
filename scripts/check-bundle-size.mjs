#!/usr/bin/env node
// check-bundle-size.mjs — DS lib bundle 尺寸 deterministic gate
// (2026-07-07 治理進化收尾:performance-audit SKILL 自述「bundle-size CI 未來可加」= 自認缺口,
//  內部盤點列冊 → 補上。對齊 Primer/Polaris「lint+CI 同源」精神:尺寸回歸在 CI 紅燈,不靠人記。)
//
// 用法:
//   node scripts/check-bundle-size.mjs --init    # 以現況寫 budget(現值 +10% headroom)
//   node scripts/check-bundle-size.mjs --check   # dist 總量或任一 top-entry 超 budget → exit 1
//
// Budget SSOT:packages/design-system/bundle-budget.json(committed;蓄意增大 → 重跑 --init 並在
// commit message 說明原因 = Chromatic「accept 即 baseline 演進」同構)。
// 前提:dist/ 已 build(release-preflight 在 build:lib 之後呼叫)。

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'packages/design-system/dist'
const BUDGET_PATH = 'packages/design-system/bundle-budget.json'
const HEADROOM = 1.10 // --init 時現值 +10%
const TOP_N = 8       // 追蹤最大的 N 個 entry(防單檔暴肥被總量攤平)

const mode = process.argv[2]
if (!['--init', '--check'].includes(mode ?? '')) {
  console.error('用法: node scripts/check-bundle-size.mjs --init|--check')
  process.exit(1)
}
if (!existsSync(DIST)) {
  console.error(`❌ ${DIST} 不存在 — 先跑 npm run build:lib(本 gate 設計為 build 後執行)`)
  process.exit(1)
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(js|css)$/.test(name)) acc.push({ path: relative(DIST, p), bytes: st.size })
  }
  return acc
}

const files = walk(DIST)
const totalBytes = files.reduce((s, f) => s + f.bytes, 0)
const top = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, TOP_N)
const kb = (b) => Math.round(b / 102.4) / 10

if (mode === '--init') {
  const budget = {
    _meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      rule: `total 與 top-${TOP_N} entry 各設現值 +${Math.round((HEADROOM - 1) * 100)}% budget;蓄意增大 → 重跑 --init + commit message 說明`,
    },
    totalKB: kb(totalBytes * HEADROOM),
    entriesKB: Object.fromEntries(top.map((f) => [f.path, kb(f.bytes * HEADROOM)])),
  }
  writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2) + '\n')
  console.log(`✅ budget 寫入 ${BUDGET_PATH}(total ${kb(totalBytes)}KB → budget ${budget.totalKB}KB;top-${TOP_N} entries)`)
  process.exit(0)
}

// --check
if (!existsSync(BUDGET_PATH)) {
  console.error(`❌ ${BUDGET_PATH} 不存在 — 先跑 --init 建 baseline(fail-closed:無 budget = 紅,非靜默跳過)`)
  process.exit(1)
}
const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'))
const fails = []
if (kb(totalBytes) > budget.totalKB) {
  fails.push(`total ${kb(totalBytes)}KB > budget ${budget.totalKB}KB`)
}
const byPath = new Map(files.map((f) => [f.path, f.bytes]))
for (const [p, limitKB] of Object.entries(budget.entriesKB ?? {})) {
  const cur = byPath.get(p)
  if (cur === undefined) continue // entry 改名/移除 → total 仍守門;--init 重生時自然更新
  if (kb(cur) > limitKB) fails.push(`${p} ${kb(cur)}KB > budget ${limitKB}KB`)
}

if (fails.length) {
  console.error('❌ bundle-size gate FAIL:')
  for (const f of fails) console.error(`   - ${f}`)
  console.error('   蓄意增大(新元件/新依賴)→ node scripts/check-bundle-size.mjs --init 更新 budget + commit 說明;')
  console.error('   非蓄意 → 查新增 import(lucide 全庫 / 重複依賴,見 performance-audit SKILL Phase 3)。')
  process.exit(1)
}
console.log(`✅ bundle-size gate PASS(total ${kb(totalBytes)}KB ≤ ${budget.totalKB}KB;top-${TOP_N} entries 全部在 budget 內)`)
