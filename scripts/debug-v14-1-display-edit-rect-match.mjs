#!/usr/bin/env node
// Q1 verify: display↔edit cell rect 不變(width AND height 同步)+ Field fills cell
// Q2 探究: v9 6px Field-vs-cell-height-delta root cause
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7100, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

await page.goto('http://localhost:7100/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const cellTypes = [
  { row: 0, col: 1, label: 'Product (Input, short)' },
  { row: 0, col: 2, label: 'Category (Select)' },
  { row: 0, col: 3, label: 'Note PRD-0001 (Textarea long-wrap)' },
  { row: 0, col: 4, label: 'Price (Currency)' },
  { row: 1, col: 3, label: 'Note PRD-0002 (Textarea short)' },
  { row: 2, col: 3, label: 'Note PRD-0003 (Textarea long-wrap)' },
  { row: 3, col: 3, label: 'Note PRD-0004 (Textarea short)' },
]

const results = []
for (const t of cellTypes) {
  const display = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { width: r.width, height: r.height, left: r.left, top: r.top }
  }, t)
  if (!display) { results.push({ ...t, error: 'cell not found' }); continue }

  // Click center of cell
  await page.mouse.click(display.left + display.width / 2, display.top + 20)
  await page.waitForTimeout(500)

  const edit = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    const field = cell.querySelector('[data-field-mode="edit"], textarea')
    if (!field) return null
    const cr = cell.getBoundingClientRect()
    const fr = field.getBoundingClientRect()
    const fcs = window.getComputedStyle(field)
    return {
      cellWidth: cr.width, cellHeight: cr.height,
      fieldWidth: fr.width, fieldHeight: fr.height,
      fieldTag: field.tagName,
      fieldLeading: fcs.lineHeight,
      fieldRows: field.getAttribute?.('rows'),
    }
  }, t)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  if (!edit) { results.push({ ...t, displayCell: display, error: 'no edit field' }); continue }

  const widthMatch = Math.abs(display.width - edit.cellWidth) < 0.5
  const heightMatch = Math.abs(display.height - edit.cellHeight) < 0.5
  const fieldFillsW = Math.abs(edit.cellWidth - edit.fieldWidth - 1) < 0.5 // Field 比 cell 矮 1px on right (cell border-r)
  const fieldFillsH = Math.abs(edit.cellHeight - edit.fieldHeight) < 0.5

  results.push({
    label: t.label,
    displayWxH: `${display.width.toFixed(1)} × ${display.height.toFixed(1)}`,
    editCellWxH: `${edit.cellWidth.toFixed(1)} × ${edit.cellHeight.toFixed(1)}`,
    fieldWxH: `${edit.fieldWidth.toFixed(1)} × ${edit.fieldHeight.toFixed(1)}`,
    fieldTag: edit.fieldTag,
    fieldLeading: edit.fieldLeading,
    fieldRows: edit.fieldRows,
    widthMatch_display_to_edit_cell: widthMatch,
    heightMatch_display_to_edit_cell: heightMatch,
    fieldFillsCellW: fieldFillsW,
    fieldFillsCellH: fieldFillsH,
  })
}

console.log(JSON.stringify(results, null, 2))

await browser.close()
server.close()
