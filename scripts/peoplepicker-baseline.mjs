#!/usr/bin/env node
// PeoplePicker baseline screenshots — Task 2 SSOT refactor 前的視覺基準
// Refactor 後 re-run + visual diff 確認 0 regression
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// .claude/snapshots-baseline/ 是 COMMITTED baseline path(對齊 visual-audit canonical
// — `snapshots/` 路徑被 gitignore line 35 吃掉,`snapshots-baseline/` 不 match)
const OUT = join(__dirname, '..', '.claude/snapshots-baseline/people-picker')
mkdirSync(OUT, { recursive: true })

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
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: false })
    console.log(`✓ ${label}`)
  } catch (e) {
    console.log(`✗ ${label}: ${e.message.slice(0, 80)}`)
  }
  await page.close()
}
await browser.close()
console.log(`\nbaseline saved → ${OUT}`)
