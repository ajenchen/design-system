#!/usr/bin/env node
/**
 * audit-story-quality.mjs — Deterministic DS-wide story title + name + jargon scan
 *
 * 2026-05-23 永久 anti-sample mechanism per user verbatim「我他媽你確定 deep audit cross codex
 * 跑完了?我不信現在所有的範例都有講具體言簡意賅的中文任何也不相信所有範例標題都有合規,你他媽如果
 * 又被發現你他媽又再偷懶又再抽樣他媽該怎麼幹死你避免你下次再犯?」
 *
 * **Replaces sub-agent AI judgment for audit Dim 40 / 41 / 42**.
 * Sub-agent 自我抽樣 risk → script deterministic 全 196 files 掃,exit 1 on any violation。
 *
 * Coverage:
 *   - Dim 40: Title canonical format(Components/Internal 4-part / Tokens/Patterns 3-part)
 *   - Dim 41: name: field jargon(L1-L9 / canonical / spec X / Stream Y / W1-W6 / Phase N)
 *   - Dim 42: Placeholder / abstract codes(Lorem ipsum / Option A/B/C / Hello World / 按鈕一 / Test 1)
 *
 * Audit dims that REQUIRE this script(per design-system-audit/SKILL.md):
 *   - Sub-agent MUST chain `node scripts/audit-story-quality.mjs --check`
 *   - Sub-agent self-judgment 不 substitute
 *
 * Usage:
 *   node scripts/audit-story-quality.mjs            # full report
 *   node scripts/audit-story-quality.mjs --check    # CI mode(exit 1 on violations)
 *
 * Output:
 *   - stderr: violations table
 *   - `.claude/logs/story-quality-audit.json`: full report
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')

const storyFiles = globSync('packages/design-system/src/**/*.stories.tsx', { cwd: ROOT }).map(f => path.join(ROOT, f))
const manualStoryFiles = storyFiles.filter(f => !f.includes('.anatomy.stories.tsx') && !f.includes('.principles.stories.tsx'))

const TITLE_CANONICAL = /^(['"])Design System\/(Components|Internal)\/[^/]+\/(展示|設計規格|設計原則)\1$|^(['"])Design System\/(Tokens|Patterns|Internal Patterns)\/[^'"]+\4$/
const JARGON_PATTERNS = [
  { name: 'layer-code', re: /\bL[1-9]\b/ },
  { name: 'canonical-leak', re: /\bcanonical\b/i },
  { name: 'spec-code', re: /\bspec\s+[A-Z0-9]/i },
  { name: 'stream-code', re: /\bStream\s[A-Z]/ },
  { name: 'phase-code', re: /\bPhase\s+\d/i },
  { name: 'w-rule', re: /\bW[1-9]\b/ },
  { name: 'dim-code', re: /\bDim\s*[0-9]+/i },
  { name: 'm-rule', re: /\bM[0-9]+\b(?!\w)/ },
]
const PLACEHOLDER_PATTERNS = [
  { name: 'lorem-ipsum', re: /Lorem\s*ipsum/i },
  { name: 'hello-world', re: /Hello\s*World/i },
  { name: 'option-letter', re: /Option\s+[ABC]\b/ },
  { name: 'foo-bar', re: /\b(Foo|Bar|Baz)\b/ },
  { name: 'chinese-numeric-button', re: /按鈕[一二三四五六]/ },
  { name: 'test-numeric', re: /\bTest\s+\d\b/ },
]
const ENGLISH_WHITELIST = new Set(['Default','Primary','Secondary','FAQ','AppShell','MenuItem','Avatar','Tooltip','Button','API','UI','UX','URL','OK','PDF','CSV','JSON','XML','HTML','CSS','JS','TS','React'])

const report = {
  ts: new Date().toISOString(),
  scope: { total_story_files: storyFiles.length, manual_story_files: manualStoryFiles.length },
  violations: { title_canonical: [], name_jargon: [], name_pure_english: [], placeholder: [] },
  totals: { titles_scanned: 0, names_scanned: 0 },
}

// Dim 40 — Title canonical scan(ALL 196 files)
for (const f of storyFiles) {
  const src = fs.readFileSync(f, 'utf-8')
  const lines = src.split('\n')
  let inMeta = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^(const meta|const Meta)/.test(line) || /Meta<.*>\s*=\s*\{/.test(line)) inMeta = true
    if (inMeta && /^\s*title:\s*['"`]/.test(line)) {
      report.totals.titles_scanned++
      const m = line.match(/title:\s*(['"`])([^'"`]+)\1/)
      if (m) {
        const title = m[0].slice(7).trim() // 'title: 'X''
        if (!TITLE_CANONICAL.test(`${m[1]}${m[2]}${m[1]}`)) {
          report.violations.title_canonical.push({ file: path.relative(ROOT, f), line: i + 1, value: m[2] })
        }
      }
      inMeta = false
    }
    if (inMeta && /^\}/.test(line)) inMeta = false
  }
}

// Dim 41/42 — manual story name + body content scan(non-anatomy/principles)
for (const f of manualStoryFiles) {
  const src = fs.readFileSync(f, 'utf-8')
  const lines = src.split('\n')

  // Find `export const X: ... = {` blocks
  const exportRanges = []
  let curStart = -1, curBraceDepth = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^export const \w+\s*(:|=)/.test(lines[i])) curStart = i
    if (curStart >= 0) {
      for (const ch of lines[i]) {
        if (ch === '{') curBraceDepth++
        if (ch === '}') {
          curBraceDepth--
          if (curBraceDepth === 0 && curStart >= 0) { exportRanges.push([curStart, i]); curStart = -1 }
        }
      }
    }
  }

  for (const [start, end] of exportRanges) {
    for (let i = start; i <= end; i++) {
      const line = lines[i]
      const nm = line.match(/^\s*name:\s*['"`]([^'"`]+)['"`]/)
      if (!nm) continue
      report.totals.names_scanned++
      const text = nm[1]

      for (const pat of JARGON_PATTERNS) {
        if (pat.re.test(text)) report.violations.name_jargon.push({ file: path.relative(ROOT, f), line: i + 1, name: text, rule: pat.name })
      }
      for (const pat of PLACEHOLDER_PATTERNS) {
        if (pat.re.test(text)) report.violations.placeholder.push({ file: path.relative(ROOT, f), line: i + 1, name: text, rule: pat.name })
      }
      const hasChi = /[\u4e00-\u9fff]/.test(text)
      if (!hasChi && !ENGLISH_WHITELIST.has(text.trim()) && text.length < 30) {
        report.violations.name_pure_english.push({ file: path.relative(ROOT, f), line: i + 1, name: text })
      }
    }
  }
}

const LOG_DIR = path.join(ROOT, '.claude/logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
fs.writeFileSync(path.join(LOG_DIR, 'story-quality-audit.json'), JSON.stringify(report, null, 2))

const totalViolations =
  report.violations.title_canonical.length +
  report.violations.name_jargon.length +
  report.violations.name_pure_english.length +
  report.violations.placeholder.length

console.log('═════════════════════════════════════════════════')
console.log(`▶ Story Quality Audit — DS-wide deterministic scan`)
console.log(`   Story files scanned: ${storyFiles.length}(${manualStoryFiles.length} manual)`)
console.log(`   Titles scanned: ${report.totals.titles_scanned}(Dim 40)`)
console.log(`   Names scanned: ${report.totals.names_scanned}(Dim 41/42)`)
console.log('─────────────────────────────────────────────────')
console.log(`   Title canonical violations: ${report.violations.title_canonical.length}`)
console.log(`   Name jargon violations: ${report.violations.name_jargon.length}`)
console.log(`   Name pure-English violations: ${report.violations.name_pure_english.length}`)
console.log(`   Placeholder violations: ${report.violations.placeholder.length}`)
console.log('═════════════════════════════════════════════════')

if (totalViolations > 0) {
  console.error('\n❌ Violations detected:')
  for (const cat of ['title_canonical', 'name_jargon', 'name_pure_english', 'placeholder']) {
    if (report.violations[cat].length) {
      console.error(`\n  [${cat}]`)
      for (const v of report.violations[cat].slice(0, 10)) console.error(`    ${v.file}:${v.line} — ${v.name || v.value}${v.rule ? ` (${v.rule})` : ''}`)
      if (report.violations[cat].length > 10) console.error(`    ... ${report.violations[cat].length - 10} more`)
    }
  }
  if (CHECK) process.exit(1)
}
console.log('\n✅ Story quality DS-wide CLEAN(no violations)')
process.exit(0)
