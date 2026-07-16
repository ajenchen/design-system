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
// 2026-07-16 verification-intent story name(user 抓「(Tag 對齊)」— story name 是 reader-facing 場景標籤,
//   **不是**寫給自己看的驗證備註)。偵測:parenthetical 內含驗證關鍵詞,或 name 本身是驗證動詞。
//   對齊 story-rules.md「name 必中文人話場景 / 禁 spec 內部代號」+ 範例最高準則(講原則非驗證)。
const VERIFICATION_INTENT_PATTERNS = [
  // 明確驗證詞彙(不含 對照/vs 等合法比較場景措辭,避免誤殺「低調 vs 實心對照」類真場景 story)
  { name: 'paren-verify-note', re: /[(（][^)）]{0,24}(驗證|測試|檢查|確認|零跳|零偏|pixel|zero[- ]?jump|regression)[^)）]{0,10}[)）]/i },
  // 「(元件 對齊/置中)」自我備註(user 抓「(Tag 對齊)」)—— 具體元件名 + 對齊動作 = QA 備註非場景
  { name: 'paren-element-align-note', re: /[(（]\s*(Tag|標籤|Avatar|頭像|Icon|icon|文字|baseline|prefix|前綴|value|值)\s*(對齊|置中|偏移)\s*[)）]/ },
  // QA 驗證複合詞(對齊驗證 / 位置驗證 / 結構驗證 / 公式驗證 / 互動測試 …)。**排除表單驗證語義**
  //   (失焦驗證 / 表單驗證 / 驗證錯誤 / 驗證時機 = 真 form-validation 功能,不匹配 — 前綴詞不在清單)。
  { name: 'qa-verify-compound', re: /(對齊|位置|結構|公式|尺寸|視覺|行高|置中|間距|互動|排版)(驗證|測試)/ },
  { name: 'verify-verb-name', re: /^\s*(測試|驗證|檢查|對齊測試|回歸|regression)\s*$/ },
]
// 2026-07-16 CSS-jargon-as-caption(user 抓「禁 CSS 術語當 caption」)— story name 是給設計師看的人話,
//   不該塞 Tailwind class / CSS 屬性名。偵測 utility class 形狀或 CSS 屬性關鍵詞。
const CSS_JARGON_PATTERNS = [
  { name: 'tailwind-class', re: /(?:^|\s|[(（])(!?p[xytrbl]?-\d|!?px-\[|items-(?:center|start|end)|justify-\w+|gap-\d|flex-\w+|min-h-|max-w-|leading-\[|text-\[|rounded-(?:md|lg|sm|full)|bg-(?:surface|transparent|neutral))/ },
  { name: 'css-property', re: /\b(white-space|box-sizing|line-height|padding-(?:top|left|right|bottom)|margin-(?:top|left|right|bottom))\b/i },
]
const ENGLISH_WHITELIST = new Set(['Default','Primary','Secondary','FAQ','AppShell','MenuItem','Avatar','Tooltip','Button','API','UI','UX','URL','OK','PDF','CSV','JSON','XML','HTML','CSS','JS','TS','React'])

const report = {
  ts: new Date().toISOString(),
  scope: { total_story_files: storyFiles.length, manual_story_files: manualStoryFiles.length },
  violations: { title_canonical: [], name_jargon: [], name_pure_english: [], placeholder: [], name_mixed_english: [], name_verification_intent: [], name_css_jargon: [] },
  totals: { titles_scanned: 0, names_scanned: 0, names_mixed_scanned: 0 },
}

// ── Dim 41b — Mixed-English story display-name(2026-06-05 反抽樣 gap closure,user 抓 Compact 混合 / Upload manager)──
// 雙 gap 修:(1)原 name_pure_english 只抓 100%-English,中英混雜(有中文部分)漏;(2)原 name scan 只跑
// manualStoryFiles,漏 anatomy/principles。本掃描跑「全 storyFiles」+「凡含非白名單拉丁字的 name 即 flag」。
// 白名單 = 元件名 + 格式縮寫 + 品牌 + camelCase prop + 確認過的真 prop/token/anatomy/unit + vs + 人名 demo。
const COMPONENT_NAMES = fs.readdirSync(path.join(ROOT, 'packages/design-system/src/components')).filter(d => d !== 'README.md')
const SUBCOMP = ['MenuItem', 'SidebarMenu', 'SidebarMenuButton', 'FieldGroup', 'FieldControlGroup', 'ChartConfig', 'PersonValue', 'DateGrid', 'SelectMenu', 'ButtonGroup', 'AppShell', 'ItemAnatomy', 'ChromeHeader', 'SurfaceHeader', 'OverflowTagList', 'ResizeHandle', 'ActionBar', 'Link', 'Ellipsis', 'Thumb', 'Affix', 'Filmstrip', 'Prefix']
const FORMATS = ['API', 'ARIA', 'FAQ', 'MVP', 'PR', 'UI', 'UX', 'URL', 'URI', 'ID', 'PDF', 'CSV', 'JSON', 'XML', 'HTML', 'CSS', 'JS', 'TS', 'JSX', 'TSX', 'SVG', 'PNG', 'JPG', 'WebP', 'HTTP', 'HTTPS', 'OK', 'CTA', 'SEO', 'N', 'X', 'A11y', 'a11y', 'RTL', 'LTR', 'DOM', 'px']
const BRANDS = ['Figma', 'GitHub', 'Gmail', 'Jira', 'Linear', 'Notion', 'Slack', 'Stripe', 'Google', 'Apple', 'Spotify', 'Trello', 'Asana', 'Dropbox', 'Outlook', 'Zoom', 'Shopify', 'Airtable', 'Polaris', 'Carbon', 'Material', 'Atlassian', 'Ant', 'Radix', 'React', 'Storybook', 'Tailwind', 'Vite', 'Next', 'js', 'Router']
// 確認過的真 prop / token / anatomy 識別字(deep-audit 2026-06-05 classify;grep .tsx 證實存在)
const REAL_API = ['files', 'bordered', 'true', 'ratio', 'children', 'Rows', 'rows', 'Wrap', 'wrap', 'Side', 'side', 'right', 'Locale', 'locale', 'Media', 'media', 'field', 'divider', 'border', 'muted', 'tree', 'vs']
const PERSON_DEMO = ['Ada', 'Chen', 'Alice', 'Bob', 'Lin', 'Charlie', 'Wu', 'Diana', 'Huang', 'Eric', 'Tsai', 'Fiona', 'Lee']
const NAME_ALLOW = new Set([...COMPONENT_NAMES, ...SUBCOMP, ...FORMATS, ...BRANDS, ...REAL_API, ...PERSON_DEMO])
const allowWord = (w) => NAME_ALLOW.has(w) || /^Q[1-4]$/.test(w) || /[a-z][A-Z]/.test(w) || /^v?\d+$/.test(w)
const isDataName = (name) =>
  /\.(png|jpe?g|pdf|csv|json|zip|docx?|xlsx?|svg|gif|webp|mp4|txt|md|ts|tsx)$/i.test(name) ||
  /\$\{/.test(name) || /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name) || /^[a-z0-9-]+$/i.test(name)

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

// Dim 41b scan — ALL storyFiles(含 anatomy/principles,修 scope gap)+ 2026-07-16 verification-intent + css-jargon
for (const f of storyFiles) {
  const lines = fs.readFileSync(f, 'utf-8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const nm = lines[i].match(/^\s*name:\s*['"`]([^'"`]+)['"`]/)
    if (!nm) continue
    const name = nm[1]
    if (isDataName(name)) continue
    report.totals.names_mixed_scanned++
    const bad = (name.match(/[A-Za-z][A-Za-z0-9]*/g) || []).filter(w => !allowWord(w))
    if (bad.length) report.violations.name_mixed_english.push({ file: path.relative(ROOT, f), line: i + 1, name, bad: bad.join(',') })
    for (const pat of VERIFICATION_INTENT_PATTERNS) {
      if (pat.re.test(name)) report.violations.name_verification_intent.push({ file: path.relative(ROOT, f), line: i + 1, name, rule: pat.name })
    }
    for (const pat of CSS_JARGON_PATTERNS) {
      if (pat.re.test(name)) report.violations.name_css_jargon.push({ file: path.relative(ROOT, f), line: i + 1, name, rule: pat.name })
    }
  }
}

// 2026-06-07 fix:--check 模式純讀(CI gate / codex read-only env)→ 不寫 git-tracked log,完全不碰 tree。
// 對齊 dispatch-audit-dims.mjs 的 `if (!CHECK)` write-gate(原本無條件寫,--check 也動檔)。
if (!CHECK) {
  const LOG_DIR = path.join(ROOT, '.claude/logs')
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  const auditOutPath = path.join(LOG_DIR, 'story-quality-audit.json')
  // 2026-06-06 idempotent write:findings(排除 ts)無變則沿用既有 ts,避免每次掃描 churn git tree
  // (cosmetic;no consumer 讀 ts 判 staleness — 已 grep 確認)。ts 改 = 真有 story-quality 變化。
  const serializeAudit = (r) => JSON.stringify({ ...r, ts: undefined }, null, 2)
  if (fs.existsSync(auditOutPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(auditOutPath, 'utf8'))
      if (serializeAudit(existing) === serializeAudit(report) && existing.ts) report.ts = existing.ts
    } catch { /* corrupt existing → 正常重寫 */ }
  }
  fs.writeFileSync(auditOutPath, JSON.stringify(report, null, 2))
}

const totalViolations =
  report.violations.title_canonical.length +
  report.violations.name_jargon.length +
  report.violations.name_pure_english.length +
  report.violations.placeholder.length +
  report.violations.name_mixed_english.length +
  report.violations.name_verification_intent.length +
  report.violations.name_css_jargon.length

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
console.log(`   Name mixed-English violations: ${report.violations.name_mixed_english.length}(Dim 41b,掃 ${report.totals.names_mixed_scanned} names)`)
console.log(`   Name verification-intent violations: ${report.violations.name_verification_intent.length}(禁「(Tag 對齊)」類驗證備註)`)
console.log(`   Name CSS-jargon violations: ${report.violations.name_css_jargon.length}(禁 Tailwind class / CSS 屬性當 caption)`)
console.log('═════════════════════════════════════════════════')

if (totalViolations > 0) {
  console.error('\n❌ Violations detected:')
  for (const cat of ['title_canonical', 'name_jargon', 'name_pure_english', 'placeholder', 'name_mixed_english', 'name_verification_intent', 'name_css_jargon']) {
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
