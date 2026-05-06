#!/usr/bin/env node
// 量 display mode (hover) vs edit mode 同 cell 高度,看是否縮高
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v15-height-shrink-bug')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6071, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

await page.goto('http://localhost:6071/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const target = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const r = cells[3].getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30, cellLeft: r.left, cellTop: r.top, cellRight: r.right, cellBottom: r.bottom }
})

// === DISPLAY mode (initial — no hover, no click) ===
const displayM = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const row = cell.closest('[role="row"]')
  return {
    cellHeight: cell.getBoundingClientRect().height,
    rowHeight: row.getBoundingClientRect().height,
  }
})
await page.screenshot({ path: join(OUT, '1-display-pristine.png'), clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: 200 } })

// === HOVER mode ===
await page.mouse.move(target.x, target.y)
await page.waitForTimeout(400)
const hoverM = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const row = cell.closest('[role="row"]')
  return {
    cellHeight: cell.getBoundingClientRect().height,
    rowHeight: row.getBoundingClientRect().height,
  }
})
await page.screenshot({ path: join(OUT, '2-hover.png'), clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: 200 } })

// === EDIT mode ===
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(700)
const editM = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const row = cell.closest('[role="row"]')
  const field = cell.querySelector('[data-field-mode="edit"]')
  return {
    cellHeight: cell.getBoundingClientRect().height,
    rowHeight: row.getBoundingClientRect().height,
    fieldHeight: field?.getBoundingClientRect().height,
    textarea: field?.tagName,
    textareaScrollHeight: field?.scrollHeight,
  }
})
await page.screenshot({ path: join(OUT, '3-edit.png'), clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: 200 } })

console.log('== display vs hover vs edit cell height ==')
console.log('display:', displayM)
console.log('hover:  ', hoverM)
console.log('edit:   ', editM)
console.log('shrink delta (edit - display):', editM.cellHeight - displayM.cellHeight)

await browser.close()
server.close()
