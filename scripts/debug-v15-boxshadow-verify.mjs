#!/usr/bin/env node
// Verify v15 box-shadow ring prototype: 4 edges all overlap grid lines?
// Method: render edit state, check actual painted pixels at grid line position.
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v15-boxshadow-verify')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6069, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 4 })

await page.goto('http://localhost:6069/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// Click Note cell row 2
const target = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const cell = cells[3]
  const r = cell.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30, cellLeft: r.left, cellTop: r.top, cellRight: r.right, cellBottom: r.bottom }
})

await page.mouse.click(target.x, target.y)
await page.waitForTimeout(700)

const m = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const cellR = cell.getBoundingClientRect()
  const cellCs = window.getComputedStyle(cell)
  const field = cell.querySelector('[data-field-mode="edit"]')
  const fr = field.getBoundingClientRect()
  const fcs = window.getComputedStyle(field)
  const prevCell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[2]
  const prevR = prevCell.getBoundingClientRect()
  const prevCs = window.getComputedStyle(prevCell)
  const prevRow = document.querySelector('[role="row"][data-row-index="1"]')
  const prevRowR = prevRow.getBoundingClientRect()
  const prevRowCs = window.getComputedStyle(prevRow)
  const editingRow = document.querySelector('[role="row"][data-row-index="2"]')
  const editingRowR = editingRow.getBoundingClientRect()
  const editingRowCs = window.getComputedStyle(editingRow)
  return {
    cell: {
      overflow: cellCs.overflow,
      paddingLeft: cellCs.paddingLeft,
      borderRightWidth: cellCs.borderRightWidth, borderRightColor: cellCs.borderRightColor,
      rect: { left: cellR.left, right: cellR.right, top: cellR.top, bottom: cellR.bottom },
    },
    field: {
      borderColor: fcs.borderColor,
      borderWidth: fcs.borderTopWidth,
      boxShadow: fcs.boxShadow,
      fieldRingVar: fcs.getPropertyValue('--field-ring').trim(),
      rect: { left: fr.left, right: fr.right, top: fr.top, bottom: fr.bottom, width: fr.width, height: fr.height },
    },
    prevCell: {
      borderRightWidth: prevCs.borderRightWidth,
      rect: { left: prevR.left, right: prevR.right },
    },
    prevRow: {
      borderBottomWidth: prevRowCs.borderBottomWidth,
      rect: { top: prevRowR.top, bottom: prevRowR.bottom },
    },
    editingRow: {
      borderBottomWidth: editingRowCs.borderBottomWidth,
      rect: { top: editingRowR.top, bottom: editingRowR.bottom },
    },
    fieldVsCell: {
      leftGap: fr.left - cellR.left,
      rightGap: cellR.right - fr.right,
      topGap: fr.top - cellR.top,
      bottomGap: cellR.bottom - fr.bottom,
    },
    seamlessAnalysis: {
      // Shadow extends 1px outside Field box. Goal: shadow matches grid line position exactly.
      // LEFT: shadow at [field.left-1, field.left]. Grid (prev cell border-r) at [prev.right-1, prev.right] = [cell.left-1, cell.left].
      //       → ALIGNED if field.left == cell.left ✓
      LEFT_aligned: fr.left === cellR.left,
      // RIGHT: shadow at [field.right, field.right+1]. Grid (cell border-r) at [cell.right-1, cell.right].
      //        → ALIGNED if field.right + 1 == cell.right (field.right = cell.right - 1)
      RIGHT_aligned: Math.abs((fr.right + 1) - cellR.right) < 0.5,
      // TOP: shadow at [field.top-1, field.top]. Grid (prev row border-b) at [prev_row.bottom-1, prev_row.bottom] = [cell.top-1, cell.top].
      //      → ALIGNED if field.top == cell.top ✓
      TOP_aligned: fr.top === cellR.top,
      // BOTTOM: shadow at [field.bottom, field.bottom+1]. Grid (this row border-b) at [row.bottom-1, row.bottom].
      //         If field.bottom = row.bottom-1 (Field flex-stretches to row content edge), then shadow covers row border-b ✓
      //         If field.bottom = row.bottom (no border-b on row), shadow extends past row → no grid to cover.
      BOTTOM_field_bottom: fr.bottom,
      BOTTOM_row_bottom: editingRowR.bottom,
      BOTTOM_row_border: editingRowCs.borderBottomWidth,
      BOTTOM_aligned: Math.abs(fr.bottom - (editingRowR.bottom - parseFloat(editingRowCs.borderBottomWidth || '0'))) < 0.5,
    },
  }
})

await page.screenshot({
  path: join(OUT, 'edit-state.png'),
  clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: target.cellBottom - target.cellTop + 60 },
})

// Pixel check at all 4 edge positions — sample pixel color at exactly the grid line position
// Read canvas pixel via screenshot + image inspection: easier to take screenshot + visually inspect

console.log('=== v15 box-shadow prototype ===')
console.log(JSON.stringify(m, null, 2))

// Hover state check — same prototype but in display+hover affordance
await page.goto('http://localhost:6069/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

await page.mouse.move(target.x, target.y)
await page.waitForTimeout(400)
await page.screenshot({
  path: join(OUT, 'hover-state.png'),
  clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: target.cellBottom - target.cellTop + 60 },
})

await browser.close()
server.close()
