#!/usr/bin/env node
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
await new Promise(r => server.listen(7300, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:7300/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const inspect = await page.evaluate(() => {
  const productHeader = document.querySelector('[role="columnheader"][data-column-id="name"]')
  if (!productHeader) return { error: 'no product header' }
  const attrs = {}
  for (const a of productHeader.attributes) { attrs[a.name] = a.value.slice(0, 80) }
  return {
    tag: productHeader.tagName,
    cursor: window.getComputedStyle(productHeader).cursor,
    attrs,
    hasSetTimeout: typeof productHeader.onpointerdown,
  }
})
console.log(JSON.stringify(inspect, null, 2))

await browser.close()
server.close()
