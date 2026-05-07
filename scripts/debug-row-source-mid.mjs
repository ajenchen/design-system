#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC = '/home/user/design-system/storybook-static'
const OUT = '/home/user/design-system/.claude/snapshots/row-source-mid-drag'
mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(8200, r))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:8200/iframe.html?id=design-system-components-datatable-展示--row-drag-interactive&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const rowInit = await page.evaluate(() => {
  const row3 = document.querySelector('[role="row"][data-row-index="3"]')
  const handle = row3?.querySelector('[aria-label*="拖曳"], [aria-label*="drag"]')
  if (!row3) return null
  const rr = row3.getBoundingClientRect()
  const handleRect = handle?.getBoundingClientRect()
  return {
    rowTop: rr.top,
    rowLeft: rr.left,
    handleX: handleRect ? handleRect.x + handleRect.width/2 : rr.x + 12,
    handleY: handleRect ? handleRect.y + handleRect.height/2 : rr.y + rr.height/2,
  }
})

await page.mouse.move(rowInit.handleX, rowInit.handleY)
await page.mouse.down()
await page.waitForTimeout(80)
await page.mouse.move(rowInit.handleX, rowInit.handleY + 100, { steps: 10 })
await page.waitForTimeout(300)

const midDrag = await page.evaluate(() => {
  const row3 = document.querySelector('[role="row"][data-row-index="3"]')
  if (!row3) return null
  const r = row3.getBoundingClientRect()
  const cs = window.getComputedStyle(row3)
  return { top: r.top, transform: cs.transform, opacity: cs.opacity }
})
console.log('Row 3 init top:', rowInit.rowTop)
console.log('Row 3 mid-drag:', JSON.stringify(midDrag))
console.log('Source moved?', Math.abs(midDrag.top - rowInit.rowTop) > 5)

await page.screenshot({ path: join(OUT, 'row-mid.png') })
await page.mouse.up()
await browser.close()
server.close()
