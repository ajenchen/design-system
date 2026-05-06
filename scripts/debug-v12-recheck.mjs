#!/usr/bin/env node
// User-reported v12 seamless border NOT working in production. Reproduce with playwright,
// take screenshot of editing cell + DOM measure all 4 edges. Find what's wrong.
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v12-seamless-recheck')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6065, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 4 })

await page.goto('http://localhost:6065/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// Click Note cell (idx 3) on row 1 (PRD-0002)
const target = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const cell = cells[3] // Note column
  if (!cell) return null
  const r = cell.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30 }
})
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(700)

// Measure all 4 edges
const measurement = await page.evaluate(() => {
  const editingRow = document.querySelector('[role="row"][data-row-index="2"]')
  const editingCell = editingRow?.querySelectorAll('[role="cell"]')[3]
  const prevCell = editingRow?.querySelectorAll('[role="cell"]')[2]
  const prevRow = document.querySelector('[role="row"][data-row-index="1"]')
  const nextRow = document.querySelector('[role="row"][data-row-index="3"]')
  if (!editingCell || !prevCell) return { error: 'cells not found' }
  const field = editingCell.querySelector('[data-field-mode="edit"]')
  if (!field) return { error: 'no Field' }

  const prevCellRect = prevCell.getBoundingClientRect()
  const editingCellRect = editingCell.getBoundingClientRect()
  const fieldRect = field.getBoundingClientRect()
  const prevRowRect = prevRow?.getBoundingClientRect()
  const nextRowRect = nextRow?.getBoundingClientRect()
  const fieldCs = window.getComputedStyle(field)
  const cellCs = window.getComputedStyle(editingCell)

  return {
    cellOverflow: cellCs.overflow,
    fieldPosition: fieldCs.position,
    fieldTop: fieldCs.top, fieldLeft: fieldCs.left, fieldRight: fieldCs.right, fieldBottom: fieldCs.bottom,
    fieldFullClass: field.className,
    rects: {
      prevCellRight: prevCellRect.right,
      editingCellLeft: editingCellRect.left,
      editingCellRight: editingCellRect.right,
      editingCellTop: editingCellRect.top,
      editingCellBottom: editingCellRect.bottom,
      fieldLeft: fieldRect.left,
      fieldRight: fieldRect.right,
      fieldTop: fieldRect.top,
      fieldBottom: fieldRect.bottom,
      prevRowBottom: prevRowRect?.bottom,
      nextRowTop: nextRowRect?.top,
    },
    edges: {
      // Expected: gap_or_overlap = -1 (1px overlap) on all 4 edges
      left:   { fieldL: fieldRect.left, prevR: prevCellRect.right, gap: fieldRect.left - prevCellRect.right },
      top:    { fieldT: fieldRect.top, prevB: prevRowRect?.bottom, gap: fieldRect.top - (prevRowRect?.bottom ?? 0) },
      right:  { fieldR: fieldRect.right, cellR: editingCellRect.right, gap: fieldRect.right - editingCellRect.right },
      bottom: { fieldB: fieldRect.bottom, nextT: nextRowRect?.top, gap: fieldRect.bottom - (nextRowRect?.top ?? 0) },
    },
  }
})

console.log(JSON.stringify(measurement, null, 2))

await page.screenshot({
  path: join(OUT, 'cell-editing.png'),
  clip: { x: Math.max(0, target.x - 250), y: Math.max(0, target.y - 80), width: 500, height: 200 },
})

await browser.close()
server.close()
