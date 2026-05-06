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
const page = await browser.newPage({ viewport: { width: 2600, height: 800 } })

// Test 2 stories sequentially:
// (1) RowAutoHeightInlineEdit — autoRow stories(7 cell types)
// (2) InlineEdit — full 12 cell types(string/number/currency/date/time/select/multiSelect/person/multiPerson/boolean/url)
const story1 = 'design-system-components-datatable-展示--row-auto-height-inline-edit'
const story2 = 'design-system-components-datatable-展示--inline-edit'

await page.goto(`http://localhost:7100/iframe.html?id=${story1}&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// __select__ checkbox col is idx 0,then data cols start idx 1
const cellTypes = [
  { row: 0, col: 1, label: '[autoRow] Product (Input, short)' },
  { row: 0, col: 2, label: '[autoRow] Category (Select)' },
  { row: 0, col: 3, label: '[autoRow] Note PRD-0001 (Textarea long-wrap)' },
  { row: 0, col: 4, label: '[autoRow] Price (Currency)' },
  { row: 1, col: 3, label: '[autoRow] Note PRD-0002 (Textarea short)' },
  { row: 2, col: 3, label: '[autoRow] Note PRD-0003 (Textarea long-wrap)' },
  { row: 3, col: 3, label: '[autoRow] Note PRD-0004 (Textarea short)' },
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

// Now test InlineEdit story all 12 cell types
await page.goto(`http://localhost:7100/iframe.html?id=${story2}&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// __select__ idx 0,then SKU idx 1(readonly),Product idx 2,Qty idx 3,Category idx 4,
// Stock idx 5,Tags idx 6,Owner idx 7,Reviewers idx 8,In(boolean)idx 9,URL idx 10,
// Price idx 11,Release idx 12,Reminder idx 13
// 2600px viewport 把所有 13 columns 都納入(SKU readonly 跳過,boolean 跟 url 不是 click-to-edit pattern)
const inlineEditTypes = [
  { row: 0, col: 2, label: '[fixed] Product (string)' },
  { row: 0, col: 3, label: '[fixed] Qty (number)' },
  { row: 0, col: 4, label: '[fixed] Category (select)' },
  { row: 0, col: 5, label: '[fixed] Stock (select)' },
  { row: 0, col: 6, label: '[fixed] Tags (multiSelect)' },
  { row: 0, col: 7, label: '[fixed] Owner (person)' },
  { row: 0, col: 8, label: '[fixed] Reviewers (multiPerson)' },
  { row: 0, col: 11, label: '[fixed] Price (currency)' },
  { row: 0, col: 12, label: '[fixed] Release (date)' },
  { row: 0, col: 13, label: '[fixed] Reminder (time)' },
]

for (const t of inlineEditTypes) {
  const display = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { width: r.width, height: r.height, left: r.left, top: r.top }
  }, t)
  if (!display) { results.push({ ...t, error: 'cell not found' }); continue }

  await page.mouse.click(display.left + display.width / 2, display.top + 20)
  await page.waitForTimeout(500)

  const edit = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    const field = cell.querySelector('[data-field-mode="edit"], textarea')
    if (!field) return null
    const cr = cell.getBoundingClientRect()
    const fr = field.getBoundingClientRect()
    return { cellWidth: cr.width, cellHeight: cr.height, fieldWidth: fr.width, fieldHeight: fr.height, fieldTag: field.tagName }
  }, t)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  if (!edit) { results.push({ ...t, displayCell: display, error: 'no edit field' }); continue }

  results.push({
    label: t.label,
    displayWxH: `${display.width.toFixed(1)} × ${display.height.toFixed(1)}`,
    editCellWxH: `${edit.cellWidth.toFixed(1)} × ${edit.cellHeight.toFixed(1)}`,
    fieldWxH: `${edit.fieldWidth.toFixed(1)} × ${edit.fieldHeight.toFixed(1)}`,
    fieldTag: edit.fieldTag,
    widthMatch_display_to_edit_cell: Math.abs(display.width - edit.cellWidth) < 0.5,
    heightMatch_display_to_edit_cell: Math.abs(display.height - edit.cellHeight) < 0.5,
    fieldFillsCellH: Math.abs(edit.cellHeight - edit.fieldHeight) < 1,
  })
}

console.log(JSON.stringify(results, null, 2))

// Summary
const totalTests = results.length
const widthPass = results.filter(r => r.widthMatch_display_to_edit_cell === true).length
const heightPass = results.filter(r => r.heightMatch_display_to_edit_cell === true).length
const fillsPass = results.filter(r => r.fieldFillsCellH === true).length
console.log(`\nSUMMARY: ${totalTests} cell types tested`)
console.log(`  display↔edit cell width match: ${widthPass}/${totalTests}`)
console.log(`  display↔edit cell height match: ${heightPass}/${totalTests}`)
console.log(`  Field fills cell height: ${fillsPass}/${totalTests}`)

await browser.close()
server.close()
