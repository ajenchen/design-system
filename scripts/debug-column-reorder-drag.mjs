#!/usr/bin/env node
// ColumnReorder real drag verify(commit 前必過)
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/column-reorder-drag')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7200, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

await page.goto('http://localhost:7200/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

await page.screenshot({ path: join(OUT, '0-initial.png') })

// Initial header order
const initialOrder = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role="columnheader"]'))
    .map(h => ({ id: h.getAttribute('data-column-id'), text: h.textContent?.trim().slice(0, 12), locked: h.getAttribute('data-column-locked') }))
})
console.log('── Initial order ──')
console.log(JSON.stringify(initialOrder, null, 2))

// Find Product header (idx 1 → SKU is locked, Product is 1st draggable)
const productInfo = await page.evaluate(() => {
  const productHeader = document.querySelector('[role="columnheader"][data-column-id="name"]')
  const categoryHeader = document.querySelector('[role="columnheader"][data-column-id="category"]')
  if (!productHeader || !categoryHeader) return null
  const pr = productHeader.getBoundingClientRect()
  const cr = categoryHeader.getBoundingClientRect()
  return {
    productCenter: { x: pr.x + pr.width / 2, y: pr.y + pr.height / 2 },
    categoryCenter: { x: cr.x + cr.width / 2, y: cr.y + cr.height / 2 },
    productHasGrab: window.getComputedStyle(productHeader).cursor,
  }
})
console.log('── Product header info ──')
console.log(JSON.stringify(productInfo, null, 2))

// Drag Product → Category position(向右拖 Product 到 Category 之後)
console.log('\n── Performing drag: Product → past Category ──')
await page.mouse.move(productInfo.productCenter.x, productInfo.productCenter.y)
await page.mouse.down()
await page.waitForTimeout(100)
// Activation move: > 8px immediately to trigger dnd-kit PointerSensor activationConstraint
await page.mouse.move(productInfo.productCenter.x + 20, productInfo.productCenter.y, { steps: 2 })
await page.waitForTimeout(150)
await page.mouse.move(productInfo.categoryCenter.x, productInfo.categoryCenter.y, { steps: 8 })
await page.waitForTimeout(150)
await page.mouse.move(productInfo.categoryCenter.x + 50, productInfo.categoryCenter.y, { steps: 4 })
await page.waitForTimeout(300)
await page.screenshot({ path: join(OUT, '1-mid-drag.png') })
await page.mouse.up()
await page.waitForTimeout(500)
await page.screenshot({ path: join(OUT, '2-after-drag.png') })

// Final order
const finalOrder = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role="columnheader"]'))
    .map(h => ({ id: h.getAttribute('data-column-id'), text: h.textContent?.trim().slice(0, 12) }))
})
console.log('── Final order ──')
console.log(JSON.stringify(finalOrder, null, 2))

console.log('\n── Verdict ──')
const orderChanged = JSON.stringify(initialOrder.map(h => h.id)) !== JSON.stringify(finalOrder.map(h => h.id))
console.log('Order changed:', orderChanged)
if (orderChanged) {
  console.log('  Initial:', initialOrder.map(h => h.id).join(' → '))
  console.log('  Final:  ', finalOrder.map(h => h.id).join(' → '))
}

// Verify locked column (SKU) cannot be dragged
console.log('\n── Locked column SKU should NOT have grab cursor ──')
const skuInfo = await page.evaluate(() => {
  const sku = document.querySelector('[role="columnheader"][data-column-id="sku"]')
  return {
    cursor: window.getComputedStyle(sku).cursor,
    locked: sku?.getAttribute('data-column-locked'),
  }
})
console.log(JSON.stringify(skuInfo, null, 2))

await browser.close()
server.close()
