#!/usr/bin/env node
// check-skill-deadref.mjs — CLAUDE.md cross-ref integrity lint(2026-05-30 ship;precise form)
//
// Why: 2026-05-30 抓出 skill/reference 引用「CLAUDE.md「<section>」」但該 section 已改名/刪除
// (eg.「資訊治理 canonical」→「治理 canonical」、「Consistency Audit 原則」移除、「CLAUDE.md line 633」hard line ref)。
// 配 check-dangling-infra-ref.mjs(hook/script ref)組成 infra-self integrity 雙 lint。
//
// 精準設計(避免 fuzzy heading-match 的大量 FP — 合法引用常 cite mindset 條 / 表格列 / sub-content 而非 H1-H4):
//   Check A: 禁 `CLAUDE.md line N` / `CLAUDE.md L<N>` numeric ref(最脆,檔一改就錯)。
//   Check B: REMOVED_SECTIONS deny-list — 已知被改名/刪除的 CLAUDE.md section,任何 ref 即 dead。
//            (section rename/remove 時把舊名加進此 list = 機械擋未來 drift;比 fuzzy heading-exist 精準。)
// Usage: node scripts/check-skill-deadref.mjs [--check]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const SCAN_DIRS = ['.claude/skills', '.claude/rules', '.claude/references', '.claude/commands']
const EXCLUDE = /ds-canonical|\/planning\/|\/scratch\/|\/retired\/|\/tmp\/|node_modules/

// 已移除/改名的 CLAUDE.md section(2026-05-30 codify)。renamed/removed 時 append 此 list。
const REMOVED_SECTIONS = [
  { dead: '資訊治理 canonical', now: '# 治理 canonical' },
  { dead: '資訊治理', now: '# 治理 canonical' },
  { dead: 'Consistency Audit 原則', now: '# 稽核 canonical「Consistency 類稽核」' },
  { dead: '同 flex 列互動 slot 幾何鐵律', now: '.claude/references/ui-dev-rules.md「同 flex 列的互動 slot 幾何鐵律」' },
  { dead: '同 flex 列的互動 slot 幾何鐵律', now: '.claude/references/ui-dev-rules.md(CLAUDE.md 已無此段)' },
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
const files = []
for (const d of SCAN_DIRS) walk(d, files)

const lineNum = []
const removed = []
for (const f of files) {
  readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
    if (LINENUM_RE.test(line)) lineNum.push({ f, n: i + 1, t: line.trim().slice(0, 110) })
    LINENUM_RE.lastIndex = 0
    // 只在 line 含 CLAUDE.md 且引用 dead section 才算(避免 dead 字串恰在他處)
    if (/CLAUDE\.md/.test(line)) {
      for (const r of REMOVED_SECTIONS) {
        if (line.includes(r.dead)) removed.push({ f, n: i + 1, dead: r.dead, now: r.now, t: line.trim().slice(0, 110) })
      }
    }
  })
}

console.log('═══════════════════════════════════════════════════')
console.log('▶ CLAUDE.md cross-ref integrity(line-number ban + removed-section deny-list)')
console.log(`   Scanned ${files.length} docs`)
console.log(`   Forbidden line-number refs: ${lineNum.length}`)
console.log(`   Removed-section refs:       ${removed.length}`)
console.log('═══════════════════════════════════════════════════')
if (lineNum.length) {
  console.error('\n🚨 FORBIDDEN CLAUDE.md line-number refs(改 cite section name,never line number):')
  for (const e of lineNum) console.error(`   ${e.f}:${e.n}  « ${e.t} »`)
}
if (removed.length) {
  console.error('\n🚨 Refs to REMOVED CLAUDE.md sections(repoint → now home):')
  for (const e of removed) console.error(`   ${e.f}:${e.n}  「${e.dead}」 → ${e.now}\n      « ${e.t} »`)
}
const fail = lineNum.length + removed.length
if (fail && CHECK) process.exit(1)
console.log(fail ? '\n⚠️  dead CLAUDE.md refs present(non-check mode)' : '\n✅ No forbidden line-number / removed-section refs')
process.exit(0)
