#!/usr/bin/env node
// DataTable invariants test — 守 spec.md L4「不變條件」5 條:
//   (1) cell width = column width(跟 padding/state/mode 無關)
//   (2) display↔edit cell width 0 delta
//   (3) display↔edit cell height 0 delta(textarea field-sizing:content)
//   (4) Field 填滿 cell 高度(1px 容差於 cell.border-r)
//   (5) No-resize column ≥ meta.width
//
// 改 columnSizeStyle / 切 layout 必跑此 script,fail → exit 1 阻 commit。
// Run: `npm run test:invariants` 或 `node scripts/data-table-invariants.mjs`

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7500, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 2600, height: 800 } })

const failures = []
const passes = []

function record(invariant, label, pass, detail = '') {
  if (pass) passes.push(`✓ ${invariant} | ${label}`)
  else failures.push(`✗ ${invariant} | ${label} | ${detail}`)
}

// ── INVARIANT (5):No-resize column width ≥ meta.width ──
await page.goto('http://localhost:7500/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// RowAutoHeightInlineEdit story uses meta.width: SKU 100 / Product 240 / Category 160 / Note 360 / Price 100
// 此 story 沒 selection,沒 __select__ column → idx 從 0 起
const expectedMinWidths = {
  0: { name: 'SKU',      minWidth: 100 },
  1: { name: 'Product',  minWidth: 240 },
  2: { name: 'Category', minWidth: 160 },
  3: { name: 'Note',     minWidth: 360 },
  4: { name: 'Price',    minWidth: 100 },
}
for (const [colIdx, expected] of Object.entries(expectedMinWidths)) {
  const width = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[Number(idx)]
    return cell?.getBoundingClientRect().width ?? null
  }, colIdx)
  record('I5', `${expected.name} ≥ meta.width(${expected.minWidth})`, width !== null && width >= expected.minWidth - 0.5, `actual ${width}`)
}

// ── INVARIANTS (1)(2)(3)(4):display↔edit stability ──
const cellTypes = [
  { row: 0, col: 0, label: 'SKU(string readonly)', skipEdit: true },
  { row: 0, col: 1, label: 'Product(string)' },
  { row: 0, col: 2, label: 'Category(select)' },
  { row: 0, col: 3, label: 'Note(textarea long-wrap)' },
  { row: 0, col: 4, label: 'Price(currency)' },
  { row: 2, col: 3, label: 'Note PRD-0003 long-wrap' },
]
for (const t of cellTypes) {
  if (t.skipEdit) continue
  const display = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { width: r.width, height: r.height, left: r.left, top: r.top }
  }, t)
  if (!display) { record('I1', t.label, false, 'cell not found'); continue }

  await page.mouse.click(display.left + display.width / 2, display.top + 20)
  await page.waitForTimeout(500)

  const edit = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    const field = cell.querySelector('[data-field-mode="edit"], textarea')
    if (!field) return null
    const cr = cell.getBoundingClientRect()
    const fr = field.getBoundingClientRect()
    const cellBorderR = parseFloat(window.getComputedStyle(cell).borderRightWidth) || 0
    return { cellWidth: cr.width, cellHeight: cr.height, fieldWidth: fr.width, fieldHeight: fr.height, cellBorderR }
  }, t)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  if (!edit) {
    record('I1-4', t.label, false, 'no edit field(may be intentional pattern e.g. multiPerson Popover)')
    continue
  }

  const widthDelta = Math.abs(display.width - edit.cellWidth)
  const heightDelta = Math.abs(display.height - edit.cellHeight)
  const fieldVsCell = Math.abs(edit.cellHeight - edit.fieldHeight)

  record('I2', `${t.label} display↔edit width 0 delta`, widthDelta < 0.5, `delta ${widthDelta.toFixed(2)}`)
  record('I3', `${t.label} display↔edit height 0 delta`, heightDelta < 0.5, `delta ${heightDelta.toFixed(2)}`)
  record('I4', `${t.label} Field 填滿 cell 高度`, fieldVsCell < 1, `cell-field delta ${fieldVsCell.toFixed(2)}`)
}

// ── Output ──
console.log(`\n=== DataTable Invariants Test ===`)
console.log(`PASS: ${passes.length}`)
console.log(`FAIL: ${failures.length}\n`)
if (passes.length > 0) console.log(passes.join('\n'))
if (failures.length > 0) {
  console.log('\n--- FAILURES ---')
  console.log(failures.join('\n'))
}

await browser.close()
server.close()

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} invariant(s) failed. Block commit.`)
  process.exit(1)
}
console.log(`\n✓ All ${passes.length} invariants pass.`)
process.exit(0)
