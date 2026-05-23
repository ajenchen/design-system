#!/usr/bin/env node
/**
 * audit-a11y.mjs — Run axe-core against every Storybook story headlessly
 *
 * 2026-05-23 Decision 4 autonomous (per user verbatim「決策四你看怎樣世界級的做法就怎樣不以省工為前提，
 * 這種東西為何需要我決策?不是就是按照我規定的標準跑嗎?」)
 *
 * Pipeline:
 *   1. Read storybook-static/index.json (Storybook build manifest with all stories)
 *   2. For each story → render `iframe.html?id=<id>` headlessly via playwright chromium
 *   3. Inject @axe-core/playwright AxeBuilder
 *   4. Run WCAG 2 A + AA rules (configurable)
 *   5. Aggregate violations + exit code(0 = clean, 1 = WCAG AA violations)
 *
 * Output:
 *   - `.claude/logs/a11y-audit.json` — full report
 *   - stderr — pretty print top N violations
 *
 * Usage:
 *   npm run a11y:check                 # full sweep (CI mode)
 *   npm run a11y:check -- --story=N    # spot-check first N stories (dev)
 *   npm run a11y:check -- --tag=button # only stories matching tag (dev)
 *
 * Pre-condition:
 *   - storybook-static/ exists(run `npm run build-storybook` first)
 *   - playwright chromium installed(postinstall ensures)
 *
 * 對齊 Carbon AVT(每 PR 跑)/ Atlassian a11y linters(season) / Material UI axe-core integration。
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const ROOT = process.cwd()
const STORYBOOK_DIR = path.join(ROOT, 'storybook-static')
const INDEX_FILE = path.join(STORYBOOK_DIR, 'index.json')
const LOG_DIR = path.join(ROOT, '.claude/logs')
const LOG_FILE = path.join(LOG_DIR, 'a11y-audit.json')

const args = process.argv.slice(2)
const LIMIT = parseInt(args.find(a => a.startsWith('--story='))?.split('=')[1] ?? '0', 10)
const TAG = args.find(a => a.startsWith('--tag='))?.split('=')[1]
const VERBOSE = args.includes('--verbose')

if (!fs.existsSync(INDEX_FILE)) {
  console.error('❌ storybook-static/index.json not found. Run `npm run build-storybook` first.')
  process.exit(1)
}

const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
let stories = Object.values(index.entries).filter(e => e.type === 'story')
if (TAG) stories = stories.filter(s => s.id.toLowerCase().includes(TAG.toLowerCase()))
if (LIMIT > 0) stories = stories.slice(0, LIMIT)

console.log(`▶ a11y audit:running axe-core against ${stories.length} stories`)

const PORT = 6007
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

// Start static http server for storybook-static
const { createServer } = await import('node:http')
const { lookup } = await import('node:dns/promises')
const serverHandler = async (req, res) => {
  let p = req.url.split('?')[0]
  if (p === '/' || p === '') p = '/iframe.html'
  const fp = path.join(STORYBOOK_DIR, p)
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.statusCode = 404; res.end(); return }
  const ext = path.extname(fp)
  const ct = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }[ext] || 'application/octet-stream'
  res.setHeader('Content-Type', ct)
  res.end(fs.readFileSync(fp))
}
const server = createServer(serverHandler).listen(PORT)

const results = { ts: new Date().toISOString(), total: stories.length, violationsByStory: {}, summary: { totalViolations: 0, byRule: {}, bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 } } }

for (let i = 0; i < stories.length; i++) {
  const s = stories[i]
  const url = `http://localhost:${PORT}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(300)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    if (result.violations.length > 0) {
      results.violationsByStory[s.id] = result.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      }))
      for (const v of result.violations) {
        results.summary.totalViolations += v.nodes.length
        results.summary.byRule[v.id] = (results.summary.byRule[v.id] || 0) + v.nodes.length
        if (v.impact) results.summary.bySeverity[v.impact] = (results.summary.bySeverity[v.impact] || 0) + v.nodes.length
      }
    }
    if (VERBOSE || (i + 1) % 20 === 0) {
      console.log(`  [${i + 1}/${stories.length}] ${s.id} — ${result.violations.length} violation type(s)`)
    }
  } catch (e) {
    console.error(`  ⚠️  ${s.id} — ${e.message}`)
    results.violationsByStory[s.id] = [{ id: 'audit-error', impact: 'serious', help: e.message, nodes: 1 }]
  }
  await page.close()
}

await ctx.close()
await browser.close()
server.close()

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2))

console.log('')
console.log('═══════════════════════════════════════════')
console.log(`▶ a11y audit complete`)
console.log(`   Stories scanned: ${results.total}`)
console.log(`   Stories with violations: ${Object.keys(results.violationsByStory).length}`)
console.log(`   Total violation instances: ${results.summary.totalViolations}`)
console.log(`   By severity: critical=${results.summary.bySeverity.critical} / serious=${results.summary.bySeverity.serious} / moderate=${results.summary.bySeverity.moderate} / minor=${results.summary.bySeverity.minor}`)
console.log(`   Report: ${LOG_FILE}`)

if (results.summary.totalViolations > 0) {
  console.log('')
  console.log('▶ Top rules violated:')
  const topRules = Object.entries(results.summary.byRule).sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [rule, count] of topRules) console.log(`   • ${rule}: ${count}`)
}

// CI gate:critical / serious WCAG AA → exit 1;moderate / minor → warn only
const hard = results.summary.bySeverity.critical + results.summary.bySeverity.serious
if (hard > 0) {
  console.error(`\n❌ ${hard} critical+serious WCAG AA violation(s) — CI fail`)
  process.exit(1)
}
console.log('\n✅ No critical/serious WCAG AA violations')
process.exit(0)
