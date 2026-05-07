#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC = '/home/user/design-system/storybook-static'
const OUT = '/home/user/design-system/.claude/snapshots/column-source-mid-drag'
mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(8100, r))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:8100/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const stockInit = await page.evaluate(() => {
  const stock = document.querySelector('[role="columnheader"][data-column-id="stock"]')
  const r = stock.getBoundingClientRect()
  return { x: r.x + r.width/2, y: r.y + r.height/2, left: r.left }
})

await page.mouse.move(stockInit.x, stockInit.y)
await page.mouse.down()
await page.waitForTimeout(80)
await page.mouse.move(stockInit.x + 200, stockInit.y, { steps: 8 })
await page.waitForTimeout(300)

const midDrag = await page.evaluate(() => {
  const stock = document.querySelector('[role="columnheader"][data-column-id="stock"]')
  if (!stock) return null
  const r = stock.getBoundingClientRect()
  const cs = window.getComputedStyle(stock)
  return { left: r.left, transform: cs.transform, opacity: cs.opacity }
})
console.log('Stock initial left:', stockInit.left)
console.log('Stock mid-drag:', JSON.stringify(midDrag))
console.log('Source moved?', Math.abs(midDrag.left - stockInit.left) > 5)

await page.screenshot({ path: join(OUT, 'col-mid.png') })
await page.mouse.up()
await browser.close()
server.close()
