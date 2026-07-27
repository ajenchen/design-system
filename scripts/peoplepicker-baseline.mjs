#!/usr/bin/env node
// PeoplePicker baseline screenshots — Task 2 SSOT refactor 前的視覺基準
// Refactor 後 re-run + visual diff 確認 0 regression
import { chromium } from 'playwright'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureVisualBaselineDirectory, prepareVisualBaselineFile } from './lib/governance-visual-baselines.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
if (!process.argv.includes('--update-baseline')) {
  console.error('✗ refusing to rewrite committed governance baseline without --update-baseline')
  process.exit(2)
}
const OUT = ensureVisualBaselineDirectory({ repoRoot: ROOT, collection: 'targeted', childPath: 'people-picker' })

const STORIES = [
  // 展示
  ['design-system-components-peoplepicker-展示--single',         'showcase-single'],
  ['design-system-components-peoplepicker-展示--multi',          'showcase-multi'],
  ['design-system-components-peoplepicker-展示--size-alignment', 'showcase-size'],
  // Anatomy
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
    const baselineFile = prepareVisualBaselineFile({
      repoRoot: ROOT,
      collection: 'targeted',
      childPath: `people-picker/${label}.png`,
    })
    await page.screenshot({ path: baselineFile, fullPage: false })
    console.log(`✓ ${label}`)
  } catch (e) {
    console.log(`✗ ${label}: ${e.message.slice(0, 80)}`)
  }
  await page.close()
}
await browser.close()
console.log(`\nbaseline saved → ${OUT}`)
