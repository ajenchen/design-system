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
await new Promise(r => server.listen(8000, r))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:8000/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const initialOrder = await page.evaluate(() => Array.from(document.querySelectorAll('[role="columnheader"][data-column-id]')).map(h => h.getAttribute('data-column-id')))
console.log('Initial:', initialOrder.join(' → '))

const info = await page.evaluate(() => {
  const stock = document.querySelector('[role="columnheader"][data-column-id="stock"]')
  const category = document.querySelector('[role="columnheader"][data-column-id="category"]')
  const price = document.querySelector('[role="columnheader"][data-column-id="price"]')
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2, left: b.left, right: b.right, width: b.width } }
  return { stock: r(stock), category: r(category), price: r(price) }
})
console.log('Stock rect:', info.stock)
console.log('Category rect:', info.category)
console.log('Price rect:', info.price)

// Drag Stock to Price center(want side='before' Price = Stock between Category/Price)
const targetX = info.price.x // Price center
console.log(`Target X (Price center): ${targetX}`)

await page.mouse.move(info.stock.x, info.stock.y)
await page.mouse.down()
await page.waitForTimeout(80)
await page.mouse.move(info.stock.x + 30, info.stock.y, { steps: 5 })
await page.waitForTimeout(150)
await page.mouse.move(targetX, info.stock.y, { steps: 12 })
await page.waitForTimeout(500)

const indicators = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role="columnheader"][data-column-id]')).map(h => {
    const cls = h.className
    return { id: h.getAttribute('data-column-id'), before: cls.includes('before:absolute'), after: cls.includes('after:absolute') }
  }).filter(r => r.before || r.after)
})
console.log('Mid-drag indicators:', JSON.stringify(indicators))

await page.mouse.up()
await page.waitForTimeout(300)

const finalOrder = await page.evaluate(() => Array.from(document.querySelectorAll('[role="columnheader"][data-column-id]')).map(h => h.getAttribute('data-column-id')))
console.log('Final:  ', finalOrder.join(' → '))
console.log('Stock moved to between category and price?', finalOrder.indexOf('category') < finalOrder.indexOf('stock') && finalOrder.indexOf('stock') < finalOrder.indexOf('price'))

await browser.close()
server.close()
