#!/usr/bin/env node
// Comprehensive inline edit verify on v14: 多 cell type × 多 state(rest/hover/focus)+ commit/cancel
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v14-inline-edit-comprehensive')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6072, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

const results = []

async function probe(label, cellRowIdx, cellColIdx) {
  const target = await page.evaluate(({ rowIdx, colIdx }) => {
    const cells = document.querySelectorAll(`[role="row"][data-row-index="${rowIdx}"] [role="cell"]`)
    const cell = cells[colIdx]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + 20 }
  }, { rowIdx: cellRowIdx, colIdx: cellColIdx })
  if (!target) return { label, error: 'cell not found' }

  // Hover
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(300)
  const hover = await page.evaluate(({ rowIdx, colIdx }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${rowIdx}"] [role="cell"]`)[colIdx]
    const cs = window.getComputedStyle(cell)
    return { outline: cs.outline, cellHeight: cell.getBoundingClientRect().height }
  }, { rowIdx: cellRowIdx, colIdx: cellColIdx })

  // Click → edit
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(500)
  const edit = await page.evaluate(({ rowIdx, colIdx }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${rowIdx}"] [role="cell"]`)[colIdx]
    const fieldOrTextarea = cell.querySelector('[data-field-mode="edit"], textarea')
    if (!fieldOrTextarea) return { error: 'no editing element' }
    const cs = window.getComputedStyle(fieldOrTextarea)
    const cellRect = cell.getBoundingClientRect()
    const fr = fieldOrTextarea.getBoundingClientRect()
    return {
      tag: fieldOrTextarea.tagName,
      borderColor: cs.borderColor,
      borderWidth: cs.borderTopWidth,
      cellHeight: cellRect.height,
      fieldHeight: fr.height,
      fillsVertically: Math.abs(fr.height - cellRect.height) < 2,
      hasFocus: document.activeElement === fieldOrTextarea || fieldOrTextarea.contains(document.activeElement),
    }
  }, { rowIdx: cellRowIdx, colIdx: cellColIdx })

  // Esc to exit
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const exitedEdit = await page.evaluate(({ rowIdx, colIdx }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${rowIdx}"] [role="cell"]`)[colIdx]
    return !cell.querySelector('[data-field-mode="edit"], textarea')
  }, { rowIdx: cellRowIdx, colIdx: cellColIdx })

  return { label, hover, edit, escExited: exitedEdit }
}

// Test on RowAutoHeightInlineEdit story
await page.goto('http://localhost:6072/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

results.push(await probe('autoRow Product cell (Field/Input)', 1, 1))    // Product = Input
results.push(await probe('autoRow Note cell (Textarea)',     1, 3))    // Note = Textarea (autoRow)
results.push(await probe('autoRow Price cell (Currency)',    1, 4))    // Price = Currency

// Test on InlineEdit story (fixed-row mode)
await page.goto('http://localhost:6072/iframe.html?id=design-system-components-datatable-展示--inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

results.push(await probe('fixedRow Name cell (Input)',       1, 1))
results.push(await probe('fixedRow Category cell (Select)',  1, 2))

console.log(JSON.stringify(results, null, 2))

await browser.close()
server.close()
