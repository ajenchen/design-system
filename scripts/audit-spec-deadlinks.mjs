#!/usr/bin/env node
// Dim 2 deterministic backstop — SSOT 死連結偵測（2026-05-30 從誤分 PURE-JUDGMENT 修正）。
//
// 為何存在：dim 2「SSOT dead link」原被歸 PURE-JUDGMENT「sub-agent must DS-wide 全掃 spec.md
// pointers」。但「spec.md 內引用的 X.spec.md 是否存在」是純機械可驗 fact，不需 LLM 判斷 —— 正是
// laziness-hunt 抓的反 pattern（grep-able dim 沒有 probe script → 永遠靠 agent 全掃 → 容易被跳過）。
// 本 script 把它降為 DETERMINISTIC：掃所有 spec.md 引用的 `<name>.spec.md` pointer，assert target 存在。
//
// 偵測：rename / 刪除 spec.md 後，其他 spec.md 仍用舊檔名指它 = 死指標（reader 點過去 404）。
//
// Usage:
//   node scripts/audit-spec-deadlinks.mjs           # 印報告
//   node scripts/audit-spec-deadlinks.mjs --check    # CI gate（有死連結 exit 1）
//
// Escape：spec.md 內該行加 `<!-- @deadlink-allow: 理由 -->`（同行或前一行）跳過該 reference。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_ROOTS = ['packages/design-system/src']
const CHECK = process.argv.includes('--check')

// ── 1. 收集所有實際存在的 spec.md（basename + 相對路徑 suffix 兩種比對方式）──
const allSpecPaths = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue
      walk(p)
    } else if (e.name.endsWith('.spec.md')) {
      allSpecPaths.push(p)
    }
  }
}
for (const r of SCAN_ROOTS) walk(join(ROOT, r))

const existingBasenames = new Set(allSpecPaths.map((p) => basename(p)))
const existingRelSuffixes = new Set(allSpecPaths.map((p) => relative(ROOT, p)))

// ── 2. 掃每個 spec.md 內的 `<name>.spec.md` reference，驗 target 存在 ──
// full-token（含大小寫，抓 uiSize.spec.md）；可帶路徑前綴。
const REF_RE = /([A-Za-z0-9_./-]*?[A-Za-z0-9_-]\.spec\.md)/g

const deadLinks = []
let totalRefs = 0

for (const specPath of allSpecPaths) {
  const rel = relative(ROOT, specPath)
  const lines = readFileSync(specPath, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prev = i > 0 ? lines[i - 1] : ''
    if (/@deadlink-allow:/.test(line) || /@deadlink-allow:/.test(prev)) continue
    let m
    REF_RE.lastIndex = 0
    while ((m = REF_RE.exec(line)) !== null) {
      const ref = m[1]
      const refBase = basename(ref)
      // 自我引用（檔名 == 自己）跳過
      if (refBase === basename(specPath)) continue
      totalRefs++
      const hasPath = ref.includes('/')
      let ok
      if (hasPath) {
        // 帶路徑：比對 basename（路徑可能相對寫法不一），basename 命中即視為存在
        ok = existingBasenames.has(refBase) ||
          [...existingRelSuffixes].some((s) => s.endsWith(ref.replace(/^\.*\//, '')))
      } else {
        ok = existingBasenames.has(refBase)
      }
      if (!ok) {
        deadLinks.push({ from: rel, line: i + 1, ref, text: line.trim().slice(0, 100) })
      }
    }
  }
}

// ── 3. 報告 ──
console.log(`[spec-deadlinks] 掃 ${allSpecPaths.length} spec.md，${totalRefs} 個 .spec.md cross-ref pointer`)
if (deadLinks.length === 0) {
  console.log('✅ 0 死連結 — 所有 spec.md pointer 都指向存在的檔')
  process.exit(0)
}

console.log(`\n❌ ${deadLinks.length} 個死連結（pointer 指向不存在的 spec.md）：\n`)
for (const d of deadLinks) {
  console.log(`  ${d.from}:${d.line}`)
  console.log(`    → ${d.ref}（target 不存在）`)
  console.log(`    "${d.text}"`)
}
console.log(`\n修法：rename/刪 spec.md 後同步改引用它的 pointer；或加 <!-- @deadlink-allow: 理由 --> 豁免。`)

if (CHECK) process.exit(1)
process.exit(0)
