#!/usr/bin/env node
/**
 * Batch-add reciprocal pointers to spec.md files (Dim 3 fix).
 *
 * For every A→B cross-spec pointer in a SSOT context (相關 / SSOT / See also / 近親 / 家族 / 消費 section),
 * ensure B has a back-pointer to A. If B lacks a「被引用」section, append one at EOF with all incoming sources grouped.
 *
 * Strategy:
 *   - Find all A→B pointers via regex
 *   - Classify as SSOT (within 6-line context of SSOT keywords) vs casual
 *   - Build reverse map (B → set of A's)
 *   - For each B with ANY inbound SSOT edges: fully REBUILD its auto-maintained
 *     「## 被引用(auto-maintained,Dim 3 reciprocal audit)」section(union of sources);
 *     targets with 0 inbound get stale sections swept(2026-06-11 root-fix)
 *
 * Idempotent: section is regenerated each run (no duplication).
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const root = process.cwd()
// 2026-05-31(infra-audit P1):原本只是 mutator(writeFileSync)無 verify gate → dim 3 標 DETERMINISTIC
// 卻無 --check = 紙上保證。加 --check:compare-only,reciprocal pointer 有 drift 則 exit 1(CI gate)。
const CHECK = process.argv.includes('--check')
const drifted = []
const SPECS = globSync('packages/design-system/src/**/*.spec.md', { cwd: root }).map((p) => path.join(root, p))

// Auto-section marker(置頂宣告:scan-strip 與 write-removal 共用同一條 escaped regex,禁手寫第二份)
const SECTION_HEADER = '## 被引用(auto-maintained,Dim 3 reciprocal audit)'
const SECTION_NOTE = '> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。'
// 2026-06-11 根治:header 含 ASCII 括號 = regex 特殊字元。舊 escape 的 char class 寫壞
// (`[...[\\]...]` 中 `\\]` 提早閉合 class)→ escape 變 no-op → `(...)` 成 regex group
// 永遠 match 不到檔案字面括號 → 舊 section 從未被移除,每跑一次疊一份 dup。
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SECTION_RE = new RegExp(`\\n*${escapeRe(SECTION_HEADER)}[\\s\\S]*?(?=\\n## |$)`, 'g')

// Build pointer map
const pointers = [] // { from: abspath, fromBase, to: basename, line, context }

for (const f of SPECS) {
  // 2026-06-10 根治:pointer 掃描排除 auto-section 內容 — section 自列的 `- x.spec.md` 行
  // 不算真 edge(否則 dup 檔自證「reciprocal 齊」→ 永不重建 → dup 永久滯留 + --check 假綠)
  const content = fs.readFileSync(f, 'utf-8').replace(SECTION_RE, '')
  const lines = content.split('\n')
  for (const m of content.matchAll(/([\w\-/.]+\.spec\.md)/g)) {
    const target = m[1].split('/').pop()
    const fromBase = path.basename(f)
    if (target === fromBase) continue
    const offset = m.index
    const lineNum = content.slice(0, offset).split('\n').length
    const ctxStart = Math.max(0, lineNum - 6)
    const ctx = lines.slice(ctxStart, lineNum).join('\n')
    const isSsot = /相關|SSOT|See also|近親|家族|消費|參考/i.test(ctx)
    pointers.push({ from: f, fromBase, to: target, line: lineNum, isSsot })
  }
}

// Reverse map
const reverse = new Map() // target basename -> Set of source basenames (SSOT only)
const existingEdges = new Set() // "A→B" key for any pointer
for (const p of pointers) {
  existingEdges.add(`${p.fromBase}→${p.to}`)
  if (p.isSsot) {
    if (!reverse.has(p.to)) reverse.set(p.to, new Set())
    reverse.get(p.to).add(p.fromBase)
  }
}

// Find gaps: B needs reverse pointer from A if `A→B` is SSOT and `B→A` doesn't exist
const gapsByTarget = new Map() // target basename -> Set of source basenames
for (const p of pointers) {
  if (!p.isSsot) continue
  const reverseEdge = `${p.to}→${p.fromBase}`
  if (existingEdges.has(reverseEdge)) continue // reciprocal exists
  if (!gapsByTarget.has(p.to)) gapsByTarget.set(p.to, new Set())
  gapsByTarget.get(p.to).add(p.fromBase)
}

// Resolve each basename → actual file path (since multiple specs may have same basename, use map from SPECS)
const pathByBase = new Map()
for (const f of SPECS) {
  // 2026-06-11(codex b1):basename = identity 的前提是不撞名;撞名 = ambiguous,fail loud
  if (pathByBase.has(path.basename(f))) {
    console.error(`❌ duplicate spec basename: ${path.basename(f)}(${pathByBase.get(path.basename(f))} vs ${f})— reciprocal identity ambiguous,先改名再跑`)
    process.exit(1)
  }
  pathByBase.set(path.basename(f), f)
}

let updatedCount = 0
let targetCount = 0
const updated = []
const skipped = []

// 2026-06-10 根治:迭代域 = 所有有 inbound SSOT 的 target(reverse)全量重建 canonical section,
// 非僅「有缺的」(gapsByTarget)— 否則 dup / stale section 永不被重訪。gapsByTarget 仍用於 log 語意。
for (const [targetBase, sources] of reverse.entries()) {
  const targetPath = pathByBase.get(targetBase)
  if (!targetPath) {
    // 2026-06-11(codex b1):SSOT context 指向不存在的 spec = broken pointer,--check 必 fail(原本只進 skipped = 假綠)
    if (CHECK) drifted.push(`${targetBase} (SSOT 語境引用但檔案不存在 — broken pointer)`)
    skipped.push(`${targetBase}: file not found`)
    continue
  }
  targetCount++
  const content = fs.readFileSync(targetPath, 'utf-8')

  // Build new section
  const sortedSources = [...sources].sort()
  const newSection = [
    '',
    SECTION_HEADER,
    '',
    SECTION_NOTE,
    '',
    ...sortedSources.map((src) => `- \`${src}\``),
    '',
  ].join('\n')

  // Idempotent regenerate:remove ALL existing sections(SECTION_RE global,正確 escape
  // 詳檔頭 2026-06-11 註)再 append fresh union once。
  const cleaned = content.replace(SECTION_RE, '').trimEnd()
  const newContent = cleaned + '\n' + newSection

  if (newContent !== content) {
    if (CHECK) {
      drifted.push(`${targetBase} (${sortedSources.length} inbound — reciprocal pointer 缺/過時)`)
    } else {
      fs.writeFileSync(targetPath, newContent)
      updatedCount++
      updated.push(`${targetBase} (${sortedSources.length} inbound)`)
    }
  }
}

// 2026-06-11 根治第二段:target 已無任何 inbound SSOT edge(不在 reverse,上方 loop 訪不到)
// 但檔內殘留舊 auto-section(歷史假 edge 時代寫入)→ stale,整節移除;--check 同步 flag 防假綠。
for (const f of SPECS) {
  if (reverse.has(path.basename(f))) continue
  const content = fs.readFileSync(f, 'utf-8')
  const cleaned = content.replace(SECTION_RE, '')
  if (cleaned === content) continue
  if (CHECK) {
    drifted.push(`${path.basename(f)} (0 inbound — stale 被引用 section 該移除)`)
  } else {
    fs.writeFileSync(f, cleaned.trimEnd() + '\n')
    updatedCount++
    updated.push(`${path.basename(f)} (stale section removed)`)
  }
}

if (CHECK) {
  if (drifted.length) {
    console.log(`\n❌ Dim 3 reciprocal-pointer drift:${drifted.length} spec(s) 的「被引用」back-pointer 缺/過時:`)
    for (const d of drifted) console.log(`  ${d}`)
    console.log(`\n修法:跑 \`node scripts/add-reciprocal-pointers.mjs\`(無 --check)auto-regenerate 後 commit。`)
    process.exit(1)
  }
  console.log('✅ Dim 3:所有 spec reciprocal pointer 同步,0 drift')
  process.exit(0)
}

console.log(`\n✅ Updated ${updatedCount} target spec(s) with reciprocal pointers`)
console.log(`   Total gap pairs closed: ${[...gapsByTarget.values()].reduce((a, s) => a + s.size, 0)}`)
console.log(`\nTargets updated:`)
for (const u of updated.slice(0, 60)) console.log(`  ${u}`)
if (updated.length > 60) console.log(`  ... +${updated.length - 60} more`)
if (skipped.length) {
  console.log(`\n⚠️  Skipped:`)
  for (const s of skipped) console.log(`  ${s}`)
}
