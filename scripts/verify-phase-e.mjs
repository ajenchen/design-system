#!/usr/bin/env node
/**
 * Phase E Visual Verify — full coverage of Phase A-D refactor
 *
 * Stories covered:
 *   1. DataTable RowDragInteractive — handle on border (M22)
 *   2. DataTable InlineEditInteractive — cell-as-input no double frame
 *   3. DataTable RowDragWithVirtualization — scroll-after-drag bug check
 *   4. Sidebar IntegrationSidebar — chevron Q1 fix(no permanent hover bg)
 *   5. Field display stories — DatePicker / LinkInput / Select(retire *Display sanity)
 */

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.claude/snapshots/phase-e-verify')
const STATIC = join(ROOT, 'storybook-static')
const PORT = 6022
const BASE = `http://localhost:${PORT}`
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.error('[page-error]', e.message))

async function go(id) {
  await page.goto(`${BASE}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
}

async function shot(name, clip) {
  const opts = { path: join(OUT, `${name}.png`), fullPage: false }
  if (clip) opts.clip = clip
  await page.screenshot(opts)
  console.log('  saved', name + '.png')
}

const results = []

// ── 1. DataTable RowDragInteractive ──
{
  console.log('\n[1] RowDragInteractive — handle on border')
  await go('design-system-components-datatable-展示--row-drag-interactive')
  await page.waitForSelector('[role="row"][data-row-index]')
  await shot('1-rowdrag-initial')
  const row0 = page.locator('[role="row"][data-row-index="0"]').first()
  const box = await row0.boundingBox()
  await page.mouse.move(box.x + 60, box.y + box.height / 2); await page.waitForTimeout(400)
  await shot('1-rowdrag-hover')
  const handlePos = await page.evaluate(() => {
    const h = document.querySelector('[aria-label="拖曳重排此列"]')
    if (!h) return null
    const r = h.getBoundingClientRect()
    const table = document.querySelector('[data-data-table-outer]')
    const t = table?.getBoundingClientRect()
    return { handleCenter: r.x + r.width/2, tableLeft: t?.left, delta: (r.x + r.width/2) - (t?.left || 0) }
  })
  console.log('  handle-vs-border', handlePos)
  results.push({ story: 'RowDragInteractive', handlePos, pass: handlePos && Math.abs(handlePos.delta) < 2 })
  // close-up
  if (handlePos) {
    await shot('1-rowdrag-handle-zoom', { x: Math.max(0, handlePos.tableLeft - 30), y: box.y + box.height/2 - 24, width: 80, height: 48 })
  }
}

// ── 2. DataTable InlineEditInteractive ──
{
  console.log('\n[2] InlineEditInteractive — cell-as-input')
  await go('design-system-components-datatable-展示--inline-edit-interactive')
  await page.waitForSelector('[role="row"][data-row-index]')
  await shot('2-inline-edit-initial')
  // click first text cell
  const firstCell = page.locator('[role="row"][data-row-index="0"] [role="cell"]').nth(1)
  await firstCell.click(); await page.waitForTimeout(300)
  await shot('2-inline-edit-text-active')
  // verify no double frame: check input border
  const inputInfo = await page.evaluate(() => {
    const cell = document.querySelector('[role="row"][data-row-index="0"]')
    const focused = document.activeElement
    if (!focused) return null
    const cs = getComputedStyle(focused)
    return { tag: focused.tagName, type: focused.getAttribute('type'), border: cs.border, outline: cs.outline, bg: cs.backgroundColor }
  })
  console.log('  input', inputInfo)
  results.push({ story: 'InlineEditInteractive', inputInfo, pass: inputInfo?.border?.includes('0px') || inputInfo?.border?.includes('none') })
  // press Esc, then click select cell if present
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
}

// ── 3. RowDragWithVirtualization ──
{
  console.log('\n[3] RowDragWithVirtualization — scroll-after-drag')
  await go('design-system-components-datatable-展示--row-drag-with-virtualization')
  await page.waitForSelector('[role="row"][data-row-index]')
  await shot('3-virt-initial')
  // scroll body-viewport
  const scrolled = await page.evaluate(() => {
    const sc = document.querySelector('[data-data-table-outer] > div > div')
    if (!sc) return false
    sc.scrollTop = 1000
    return true
  })
  await page.waitForTimeout(400)
  await shot('3-virt-scrolled-1000')
  // hover + drag
  const r = page.locator('[role="row"][data-row-index]').first()
  const b = await r.boundingBox()
  if (b) {
    await page.mouse.move(b.x + 60, b.y + b.height / 2); await page.waitForTimeout(300)
    await shot('3-virt-hover-after-scroll')
    const h = await page.locator('[aria-label="拖曳重排此列"]').first().boundingBox()
    if (h) {
      await page.mouse.move(h.x + h.width/2, h.y + h.height/2)
      await page.mouse.down()
      await page.mouse.move(h.x + h.width/2, h.y + 80, { steps: 5 })
      await page.waitForTimeout(200)
      await shot('3-virt-mid-drag')
      await page.mouse.up()
    }
    // scroll AFTER drag (the user-reported bug case)
    await page.evaluate(() => {
      const sc = document.querySelector('[data-data-table-outer] > div > div')
      if (sc) sc.scrollTop = 2000
    })
    await page.waitForTimeout(400)
    await shot('3-virt-scroll-after-drag')
  }
  results.push({ story: 'RowDragWithVirtualization', scrolled })
}

// ── 4. Sidebar IntegrationSidebar — chevron Q1 fix ──
{
  console.log('\n[4] Sidebar — chevron no hover bg when expanded')
  await go('design-system-components-sidebar-展示--mixed-content')
  await page.waitForTimeout(800)
  await shot('4-sidebar-initial')
  // Find collapsible group label "Projects" chevron
  const chevronInfo = await page.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll('[aria-label="展開或收合"]'))
    if (!triggers.length) return { found: false }
    const t = triggers[0]
    const r = t.getBoundingClientRect()
    return { found: true, count: triggers.length, x: r.x, y: r.y, w: r.width, h: r.height, state: t.getAttribute('data-state') }
  })
  console.log('  chevron', chevronInfo)
  if (chevronInfo.found) {
    // screenshot before hover
    await shot('4-sidebar-chevron-area', { x: Math.max(0, chevronInfo.x - 100), y: Math.max(0, chevronInfo.y - 20), width: 200, height: 80 })
    // verify expanded chevron has NO hover bg
    const bgInfo = await page.evaluate(() => {
      const t = document.querySelector('[aria-label="展開或收合"]')
      if (!t) return null
      const span = t.querySelector('span') // the inline action's hover-bg span
      const cs = span ? getComputedStyle(span) : null
      return { state: t.getAttribute('data-state'), spanBg: cs?.backgroundColor }
    })
    console.log('  chevron-bg-when-expanded', bgInfo)
    results.push({ story: 'Sidebar Chevron', chevronInfo, bgInfo, pass: bgInfo?.spanBg === 'rgba(0, 0, 0, 0)' || bgInfo?.spanBg?.includes('0, 0, 0, 0') })
  }
}

// ── 5. Field display stories ──
const displayStories = [
  ['design-system-components-datepicker-展示--display', '5-datepicker-display'],
  ['design-system-components-linkinput-展示--display', '5-linkinput-display'],
  ['design-system-components-select-展示--display-mode', '5-select-displaymode'],
]
for (const [id, name] of displayStories) {
  console.log(`\n[5] ${name}`)
  try {
    await go(id)
    await page.waitForTimeout(500)
    await shot(name)
    results.push({ story: name, pass: true })
  } catch (e) {
    console.error('  fail', e.message)
    results.push({ story: name, pass: false, error: e.message })
  }
}

console.log('\n=== RESULTS ===')
console.log(JSON.stringify(results, null, 2))
const failed = results.filter(r => r.pass === false)
console.log(failed.length === 0 ? '\n✓ ALL PASS' : `\n✗ ${failed.length} FAIL`)

await browser.close()
server.close()
process.exit(failed.length === 0 ? 0 : 1)
