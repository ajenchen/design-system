#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC = '/home/user/design-system/storybook-static'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7900, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
page.on('console', m => { if (m.text().includes('DRAG-DEBUG')) console.log('  ', m.text()) })
page.on('pageerror', e => console.log('PAGE ERROR:', e.message))

await page.goto('http://localhost:7900/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const info = await page.evaluate(() => {
  const product = document.querySelector('[role="columnheader"][data-column-id="name"]')
  const category = document.querySelector('[role="columnheader"][data-column-id="category"]')
  const price = document.querySelector('[role="columnheader"][data-column-id="price"]')
  return {
    productCenter: product ? (() => { const r = product.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })() : null,
    categoryCenter: category ? (() => { const r = category.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })() : null,
    priceCenter: price ? (() => { const r = price.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })() : null,
  }
})

console.log('\n=== Drag start ===')
await page.mouse.move(info.productCenter.x, info.productCenter.y)
await page.mouse.down()
await page.waitForTimeout(80)

console.log('\n=== Move 30 right (activate) ===')
await page.mouse.move(info.productCenter.x + 30, info.productCenter.y, { steps: 5 })
await page.waitForTimeout(300)

console.log('\n=== Move to Category center ===')
await page.mouse.move(info.categoryCenter.x, info.categoryCenter.y, { steps: 8 })
await page.waitForTimeout(500)

console.log('\n=== Move to Price center ===')
await page.mouse.move(info.priceCenter.x, info.priceCenter.y, { steps: 8 })
await page.waitForTimeout(500)

console.log('\n=== Check Category indicator class ===')
const catCheck = await page.evaluate(() => {
  const cat = document.querySelector('[role="columnheader"][data-column-id="category"]')
  const price = document.querySelector('[role="columnheader"][data-column-id="price"]')
  const hasIndic = (el) => {
    if (!el) return null
    const cls = el.className
    return { hasBeforeAbsolute: cls.includes('before:absolute'), hasAfterAbsolute: cls.includes('after:absolute') }
  }
  return { category: hasIndic(cat), price: hasIndic(price) }
})
console.log('  Indicator class on headers:', JSON.stringify(catCheck))

await page.mouse.up()

await browser.close()
server.close()
