#!/usr/bin/env node
// check-skill-deadref.mjs — provider-view cross-ref integrity lint(2026-05-30 ship;precise form)
//
// Why: 2026-05-30 抓出 skill/reference 引用「CLAUDE.md「<section>」」但該 section 已改名/刪除
// (eg.「資訊治理 canonical」→「治理 canonical」、「Consistency Audit 原則」移除、「CLAUDE.md line 633」hard line ref)。
// 配 check-dangling-infra-ref.mjs(hook/script ref)組成 infra-self integrity 雙 lint。
//
// 精準設計(避免 fuzzy heading-match 的大量 FP — 合法引用常 cite mindset 條 / 表格列 / sub-content 而非 H1-H4):
//   Check A: 禁 `CLAUDE.md line N` / `CLAUDE.md L<N>` numeric ref(最脆,檔一改就錯)。
//   Check B: REMOVED_SECTIONS deny-list — 已知被改名/刪除的 CLAUDE.md section,任何 ref 即 dead。
//            (section rename/remove 時把舊名加進此 list = 機械擋未來 drift;比 fuzzy heading-exist 精準。)
//   Check C: product `*.spec.md` 禁 cite `CLAUDE.md`。CLAUDE.md 是 generated provider adapter；
//            product semantics 必 cite AGENTS navigator 或 canonical spec/rule/reference owner。
// Usage: node scripts/check-skill-deadref.mjs [--check]
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const rootIndex = process.argv.indexOf('--root')
if (rootIndex !== -1 && !process.argv[rootIndex + 1]) {
  console.error('usage: check-skill-deadref.mjs [--check] [--root <repo>]')
  process.exit(2)
}
const ROOT = rootIndex === -1 ? process.cwd() : resolve(process.argv[rootIndex + 1])
const CHECK = process.argv.includes('--check')
const SCAN_DIRS = [
  'packages/design-system/ds-canonical/skills',
  'packages/design-system/ds-canonical/rules',
  'packages/design-system/ds-canonical/references',
  'packages/design-system/ds-canonical/commands',
]
const PRODUCT_SPEC_DIR = 'packages/design-system/src'
const EXCLUDE = /\/planning\/|\/scratch\/|\/retired\/|\/tmp\/|node_modules/

// 已移除/改名的 CLAUDE.md section(2026-05-30 codify)。renamed/removed 時 append 此 list。
const REMOVED_SECTIONS = [
  { dead: '資訊治理 canonical', now: '# 治理 canonical' },
  { dead: '資訊治理', now: '# 治理 canonical' },
  { dead: 'Consistency Audit 原則', now: '# 稽核 canonical「Consistency 類稽核」' },
  { dead: '同 flex 列互動 slot 幾何鐵律', now: 'packages/design-system/ds-canonical/references/ui-dev-rules.md「同 flex 列的互動 slot 幾何鐵律」' },
  { dead: '同 flex 列的互動 slot 幾何鐵律', now: 'packages/design-system/ds-canonical/references/ui-dev-rules.md(CLAUDE.md 已無此段)' },
]
const LINENUM_RE = /CLAUDE\.md\s*(?:line|L)\s*\d+/gi

function walk(dir, acc) {
  let ents
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const rel = `${dir}/${e.name}`
    if (EXCLUDE.test(rel)) continue
    if (e.isDirectory()) walk(rel, acc)
    else if (/\.(md|json)$/.test(e.name)) acc.push(rel)
  }
}
function walkProductSpecs(dir, acc) {
  let ents
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const rel = `${dir}/${e.name}`
    if (EXCLUDE.test(rel)) continue
    if (e.isDirectory()) walkProductSpecs(rel, acc)
    else if (e.name.endsWith('.spec.md')) acc.push(rel)
  }
}
const files = []
for (const d of SCAN_DIRS) walk(d, files)
const productSpecs = []
walkProductSpecs(PRODUCT_SPEC_DIR, productSpecs)
files.push(...productSpecs)

const lineNum = []
const removed = []
const productProviderView = []
for (const f of files) {
  readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
    if (LINENUM_RE.test(line)) lineNum.push({ f, n: i + 1, t: line.trim().slice(0, 110) })
    LINENUM_RE.lastIndex = 0
    // 只在 line 含 CLAUDE.md 且引用 dead section 才算(避免 dead 字串恰在他處)
    if (/CLAUDE\.md/.test(line)) {
      if (f.startsWith(`${PRODUCT_SPEC_DIR}/`) && f.endsWith('.spec.md')) {
        productProviderView.push({ f, n: i + 1, t: line.trim().slice(0, 110) })
      }
      for (const r of REMOVED_SECTIONS) {
        if (line.includes(r.dead)) removed.push({ f, n: i + 1, dead: r.dead, now: r.now, t: line.trim().slice(0, 110) })
      }
    }
  })
}

console.log('═══════════════════════════════════════════════════')
console.log('▶ Provider-view cross-ref integrity(CLAUDE.md line/section/spec authority guards)')
console.log(`   Scanned ${files.length} docs (${productSpecs.length} product specs)`)
console.log(`   Forbidden line-number refs: ${lineNum.length}`)
console.log(`   Removed-section refs:       ${removed.length}`)
console.log(`   Product-spec provider refs: ${productProviderView.length}`)
console.log('═══════════════════════════════════════════════════')
if (lineNum.length) {
  console.error('\n🚨 FORBIDDEN CLAUDE.md line-number refs(改 cite section name,never line number):')
  for (const e of lineNum) console.error(`   ${e.f}:${e.n}  « ${e.t} »`)
}
if (removed.length) {
  console.error('\n🚨 Refs to REMOVED CLAUDE.md sections(repoint → now home):')
  for (const e of removed) console.error(`   ${e.f}:${e.n}  「${e.dead}」 → ${e.now}\n      « ${e.t} »`)
}
if (productProviderView.length) {
  console.error('\n🚨 Product specs cite generated CLAUDE.md provider view(repoint to canonical owner):')
  for (const e of productProviderView) console.error(`   ${e.f}:${e.n}  « ${e.t} »`)
}
const fail = lineNum.length + removed.length + productProviderView.length
if (fail && CHECK) process.exit(1)
console.log(fail ? '\n⚠️  forbidden provider-view refs present(non-check mode)' : '\n✅ No forbidden line-number / removed-section / product-spec provider refs')
process.exit(0)
