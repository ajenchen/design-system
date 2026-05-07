#!/usr/bin/env node
// Step C: re-snapshot 後跟 baseline 比 pixel diff
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE = join(ROOT, '.claude/snapshots-baseline/people-picker')
const CURRENT = join(ROOT, '.claude/snapshots/people-picker-current')
const DIFF = join(ROOT, '.claude/snapshots/people-picker-diff')
mkdirSync(CURRENT, { recursive: true })
mkdirSync(DIFF, { recursive: true })

const STORIES = [
  ['design-system-components-peoplepicker-展示--single',         'showcase-single'],
  ['design-system-components-peoplepicker-展示--multi',          'showcase-multi'],
  ['design-system-components-peoplepicker-展示--size-alignment', 'showcase-size'],
  ['design-system-components-peoplepicker-設計規格--overview',     'anatomy-overview'],
  ['design-system-components-peoplepicker-設計規格--inspector',    'anatomy-inspector'],
  ['design-system-components-peoplepicker-設計規格--mode-matrix',  'anatomy-mode-matrix'],
  ['design-system-components-peoplepicker-設計規格--size-matrix',  'anatomy-size-matrix'],
  ['design-system-components-peoplepicker-設計規格--color-matrix', 'anatomy-color-matrix'],
  ['design-system-components-peoplepicker-設計規格--state-behavior', 'anatomy-state-behavior'],
]

const browser = await chromium.launch({ headless: true })
for (const [id, label] of STORIES) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
  try {
    await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(CURRENT, `${label}.png`), fullPage: false })
  } catch (e) {
    console.log(`✗ snapshot ${label}: ${e.message.slice(0, 80)}`)
  }
  await page.close()
}
await browser.close()

// Pixel diff via pixelmatch
const { default: pixelmatch } = await import('pixelmatch')
const PNG = (await import('pngjs')).PNG

const results = []
for (const [, label] of STORIES) {
  const baselinePath = join(BASELINE, `${label}.png`)
  const currentPath = join(CURRENT, `${label}.png`)
  if (!existsSync(baselinePath) || !existsSync(currentPath)) {
    results.push({ label, status: 'missing' })
    continue
  }
  const a = PNG.sync.read(readFileSync(baselinePath))
  const b = PNG.sync.read(readFileSync(currentPath))
  if (a.width !== b.width || a.height !== b.height) {
    results.push({ label, status: 'size-mismatch', a: `${a.width}x${a.height}`, b: `${b.width}x${b.height}` })
    continue
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const numDiff = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 })
  const diffPct = (numDiff / (a.width * a.height) * 100).toFixed(2)
  if (numDiff > 0) writeFileSync(join(DIFF, `${label}.diff.png`), PNG.sync.write(diff))
  results.push({ label, status: numDiff === 0 ? 'identical' : 'differ', numDiff, diffPct: `${diffPct}%` })
}

console.log('\n=== Pixel Diff Results ===')
for (const r of results) {
  const icon = r.status === 'identical' ? '✓' : r.status === 'differ' ? '⚠' : '✗'
  console.log(`${icon} ${r.label}: ${r.status}${r.numDiff != null ? ` (${r.numDiff} px / ${r.diffPct})` : ''}`)
}
const differing = results.filter(r => r.status === 'differ')
const identical = results.filter(r => r.status === 'identical')
console.log(`\nidentical: ${identical.length} / total: ${results.length}`)
if (differing.length > 0) console.log(`diffs saved → ${DIFF}`)
