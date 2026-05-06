#!/usr/bin/env node
// Compare flex behavior:padding-clear-on-edit 對 ALL columns 的影響(不只 Price)
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATIC = join(__dirname, '..', 'storybook-static')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7400, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:7400/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// Display mode all column widths
const beforeClick = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')
  return Array.from(cells).map(c => ({
    txt: c.textContent?.trim().slice(0, 12),
    width: Math.round(c.getBoundingClientRect().width * 10) / 10,
  }))
})

// Click Price (col 4) → edit
const priceCenter = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')
  const price = cells[4]
  const r = price.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 20 }
})
await page.mouse.click(priceCenter.x, priceCenter.y)
await page.waitForTimeout(500)

const afterClickPrice = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')
  return Array.from(cells).map(c => ({
    txt: c.textContent?.trim().slice(0, 12),
    width: Math.round(c.getBoundingClientRect().width * 10) / 10,
  }))
})

console.log('Column widths — display(no edit) vs edit Price:')
console.log('Col idx | text             | display W | edit W (Price clicked) | delta')
console.log('--------|------------------|-----------|------------------------|------')
for (let i = 0; i < beforeClick.length; i++) {
  const before = beforeClick[i]?.width
  const after = afterClickPrice[i]?.width
  const delta = after - before
  console.log(`${String(i).padEnd(7)} | ${(beforeClick[i]?.txt ?? '').padEnd(16)} | ${String(before).padEnd(9)} | ${String(after).padEnd(22)} | ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`)
}

await browser.close()
server.close()
